"""Parse the TITF Color Belt and Black Belt handbooks into syllabus.json.

Both handbooks share one section heading:

    <Belt> belt (<Nth gup|dan>) for promotion to <Mth gup|dan>

followed by numbered requirement groups ("1. Stances:", "2. Defensive
techniques:") whose entries are lettered ("a.", "b."). Entries wrap across
lines with continuation indent, so lines are joined before splitting.

Korean romanisation is carried in parentheses, but not every parenthetical is
Korean -- "General Choi Hong Hi (1918 - 2002)" is a date. A parenthetical is
treated as Korean only when it has no digits and reads as romanisation.

Usage:  python tools/parse_syllabus.py            # writes src/data/syllabus.json
Requires pdftotext (poppler) on PATH.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "ITIF-Handbooks"
OUT = ROOT / "src" / "data" / "syllabus.json"

SOURCES = [
    ("TITF Color Belt Handbook ver 1.2 May2020.pdf", "color-belt-handbook-v1.2"),
    ("TITF Black Belt Handbook ver 1.2 May2020.pdf", "black-belt-handbook-v1.2"),
]

HEADING = re.compile(
    r"^\s*(?P<belt>[A-Za-z]+)\s+(?P<kind>belt|stripe)\s*"    r"\(\s*(?P<rank>\d+(?:st|nd|rd|th)\s+(?:gup|dan))\s*\)"
    r"\s*for\s+promotion\s+to\s+(?P<to>\d+(?:st|nd|rd|th)\s+(?:gup|dan))",
    re.IGNORECASE,
)
GROUP = re.compile(r"^ {0,2}(?P<n>[1-9])\.\s+(?P<title>[A-Z][^:]{2,60}):\s*(?P<rest>.*)$")
ITEM = re.compile(r"^\s*(?P<letter>[a-z])\.\s+(?P<text>.+)$")
PAGE_NUM = re.compile(r"^\s*\d{1,3}\s*$")
ROMAN_TAIL = re.compile(r"\s+[IVX]+\s*$")
LETTER_PREFIX = re.compile(r"^[a-z]\.\s+")
# Some entries carry no letter but open with their own label, e.g.
# "WT Fundamental Exercise: ..." or "Compulsory techniques:". Without this they
# would be glued onto the previous entry as if they were continuation lines.
LABEL = re.compile(r"^(?:ITF|WT)|^[A-Z][A-Za-z-]*(?:\s+[A-Za-z-]+){0,3}:")


# Page 21 of the Color Belt handbook draws the "for promotion to 1st gup" run
# on top of two other lines, so -layout interleaves them character by character.
# Only these two lines are affected; every other page extracts cleanly. The
# replacements are the true strings, recovered from `pdftotext -raw` on that
# page, where the runs are separated but out of reading order. Fix belongs in
# the source PDF for v1.3; until then it is repaired here, explicitly.
REPAIRS: dict[str, list[tuple[str, str]]] = {
    "color-belt-handbook-v1.2": [
        ("Red belt (2bn. d gup)", "Red belt (2nd gup) for promotion to 1st gup"),
        (
            "b. Close ready stance Co(mtioona tjoun1bsti sgougpi C)",
            "b. Close ready stance (moa junbi sogi C)",
        ),
    ],
}


def repair(text: str, source: str) -> str:
    """Apply documented fixes for known text-layer collisions."""
    for damaged, fixed in REPAIRS.get(source, []):
        if damaged not in text:
            sys.exit(f"repair no longer matches in {source}: {damaged!r}")
        text = text.replace(damaged, fixed)
    return text


def pdf_text(pdf: Path) -> str:
    if shutil.which("pdftotext") is None:
        sys.exit("pdftotext not found on PATH. Install poppler and retry.")
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "out.txt"
        # -enc UTF-8 is required. pdftotext writes Latin-1 by default, so
        # without it every degree sign, one-half and bullet in the handbooks
        # arrives as a byte that is not valid UTF-8. Paired with the old
        # errors="replace" below that silently produced 87 U+FFFD replacement
        # characters in syllabus.json, which students then saw as "?" on the
        # progress page and the coach ingested into its corpus.
        subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), str(out)],
            check=True,
            capture_output=True,
        )
        # strict, not "replace": if the encoding ever regresses this should
        # stop the extraction rather than quietly ship damaged text.
        return out.read_text(encoding="utf-8")


def clean(line: str) -> str:
    """Strip trailing page numbers and the roman-numeral chapter marks."""
    line = line.rstrip()
    line = ROMAN_TAIL.sub("", line)
    return re.sub(r"\s{3,}\d{1,3}\s*$", "", line).rstrip()


def split_korean(text: str) -> tuple[str, str | None]:
    """Separate an entry into its English name and Korean romanisation."""
    match = re.search(r"\(([^()]+)\)\s*$", text)
    if not match:
        return text.strip(" .,"), None
    inner = match.group(1).strip()
    # Dates, degrees and counts live in parentheses too; only romanisation
    # (letters, slashes, hyphens, spaces) counts as Korean.
    if re.search(r"\d", inner) or not re.fullmatch(r"[A-Za-z][A-Za-z /'\-,]*", inner):
        return text.strip(" .,"), None
    english = text[: match.start()].strip(" .,")
    return english, inner


def split_entries(text: str) -> list[str]:
    """One lettered line can carry several terms: "X (a), Y (b)"."""
    parts = re.split(r"(?<=\)),\s+", text)
    return [p for p in (p.strip(" .,") for p in parts) if p]


def parse(text: str, source: str) -> list[dict]:
    ranks: list[dict] = []
    rank: dict | None = None
    group: dict | None = None
    buffer: list[str] = []

    def flush() -> None:
        """Turn the pending continuation buffer into entries on the open group."""
        nonlocal buffer
        if not buffer or group is None:
            buffer = []
            return
        joined = re.sub(r"\s+", " ", " ".join(buffer)).strip()
        # A group's first entry arrives on the heading line ("1. Stances: a. ...").
        joined = LETTER_PREFIX.sub("", joined)
        for entry in split_entries(joined):
            english, korean = split_korean(entry)
            if english:
                group["items"].append({"english": english, "korean": korean})
        buffer = []

    for raw in text.splitlines():
        line = clean(raw)
        if not line.strip() or PAGE_NUM.match(line):
            continue

        heading = HEADING.match(line)
        if heading:
            flush()
            rank = {
                "rank": heading.group("rank").lower().replace("  ", " "),
                "belt": f"{heading.group('belt').capitalize()} {heading.group('kind').lower()}",
                "promotesTo": heading.group("to").lower(),
                "source": source,
                "sections": [],
            }
            ranks.append(rank)
            group = None
            continue

        if rank is None:
            continue  # front matter, forewords, contents

        grouped = GROUP.match(line)
        if grouped:
            flush()
            group = {
                "n": int(grouped.group("n")),
                "title": grouped.group("title").strip(),
                "items": [],
            }
            rank["sections"].append(group)
            if grouped.group("rest").strip():
                buffer = [grouped.group("rest").strip()]
            continue

        if group is None:
            continue

        item = ITEM.match(line)
        if item:
            flush()
            buffer = [item.group("text").strip()]
        elif buffer and LABEL.match(line.strip()):
            flush()
            buffer = [line.strip()]
        else:
            # continuation of the entry above, or an unlettered line such as
            # "WT Fundamental Exercise: ...". Both belong to the open group.
            buffer.append(line.strip())

    flush()
    return ranks


def main() -> None:
    out: list[dict] = []
    for filename, source in SOURCES:
        pdf = PDF_DIR / filename
        if not pdf.exists():
            sys.exit(f"missing source PDF: {pdf}")
        out.extend(parse(repair(pdf_text(pdf), source), source))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    sections = sum(len(r["sections"]) for r in out)
    items = sum(len(s["items"]) for r in out for s in r["sections"])
    print(f"{len(out)} ranks, {sections} sections, {items} entries -> {OUT}")


if __name__ == "__main__":
    main()
