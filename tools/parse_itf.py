"""Parse ITF Patterns Instructions.pdf text into structured patterns.json.

Handles the broken font encoding: garbled glyphs are (real_char - 29),
so real = chr(ord(displayed) + 29). Ligatures: '¿'->'fi', 'À'->'fl'.
Spaces/punct were mapped to control chars and stripped, so decoded runs
need word re-segmentation (DP over a lexicon harvested from clean text).
"""
from __future__ import annotations
import json
import math
import re
import sys
from collections import Counter

SRC = "/tmp/itf.txt"
OUT = "/tmp/patterns.json"

# Garbled spans: shifted glyphs 0x24-0x5D plus control chars that encode
# space/punctuation (real = displayed + 29, so ' '->\x03, '.'->\x11, ','->\x0F).
# Exclude \x09/\x0A/\x0D (real whitespace). A span must contain at least one
# control char or ligature to count as garbled -- clean ALL-CAPS headings and
# hyphenated pattern names never do.
GARBLE_CLASS = r"[\x03-\x08\x0B\x0C\x0E-\x1F\x24-\x5D\xBF\xC0]"
GARBLE_RE = re.compile(GARBLE_CLASS + r"{4,}")
GARBLE_EVIDENCE = re.compile(r"[\x03-\x08\x0B\x0C\x0E-\x1F\xBF\xC0]")
SIDEBAR = {"READY POSTURE", "MOVEMENTS", "DIAGRAM", "MEANING", "INDIVIDUAL MOVEMENTS"}


def decode_run(run: str) -> str:
    out = []
    for ch in run:
        if ch == "\xBF":
            out.append("fi")
        elif ch == "\xC0":
            out.append("fl")
        else:
            out.append(chr(ord(ch) + 29))
    return "".join(out)


def build_lexicon(text: str) -> Counter:
    words = Counter()
    for line in text.splitlines():
        if GARBLE_RE.search(line):
            continue
        for w in re.findall(r"[A-Za-z][a-z]+|[A-Z]{1,2}", line):
            words[w.lower()] += 1
    # domain words that may only occur garbled + glue words
    extras = [
        "fist", "fists", "knifehand", "fingertip", "flat", "fingertips",
        "backfist", "side", "front", "reflex", "flying", "fixed", "figures",
        "signifies", "signify", "first", "flow", "profile", "final",
        "fifth", "fine", "defined", "sacrifice", "unified", "pacific",
        "specifically", "beneficial", "insufficient", "certificate",
        "a", "i", "x", "u", "w",
    ]
    for w in extras:
        words[w] += 5
    return words


def segment(s: str, lex: Counter, total: int) -> tuple[str, float]:
    """DP word segmentation over decoded (space-less) text, case preserved.
    Returns (segmented_text, avg_cost_per_word)."""
    n = len(s)
    INF = float("inf")
    best = [INF] * (n + 1)
    back = [0] * (n + 1)
    best[0] = 0.0
    maxw = 18
    for i in range(1, n + 1):
        for j in range(max(0, i - maxw), i):
            piece = s[j:i]
            low = piece.lower()
            if piece.isdigit():
                cost = 1.0
            elif re.fullmatch(r"[A-F]{1,2}", piece):
                cost = 1.2  # diagram direction letters like B, AD, BD
            elif low in lex:
                cost = 1.0 + math.log(1 + total / lex[low]) * 0.05 + 0.001 * (18 - len(piece))
            elif len(piece) == 1:
                cost = 6.0
            else:
                cost = 4.0 + 0.5 * len(piece)
            c = best[j] + cost
            if c < best[i]:
                best[i] = c
                back[i] = j
    # reconstruct
    toks = []
    i = n
    while i > 0:
        j = back[i]
        toks.append(s[j:i])
        i = j
    toks.reverse()
    return " ".join(toks), best[n] / max(1, len(toks))


def decode_line(line: str, lex: Counter, total: int) -> str:
    def repl(m: re.Match) -> str:
        raw = m.group(0)
        if not GARBLE_EVIDENCE.search(raw):
            return raw  # genuine text (heading / pattern name), keep it
        return decode_run(raw)
    out = GARBLE_RE.sub(repl, line)
    return re.sub(r"\s+", " ", out).strip()


RANK_RE = re.compile(r"^(.*(?:Belt|Tip|Stripe).*/.*Gup|[1-9](?:st|nd|rd|th) Dan.*|.*Gup.*)$")
NUM_START = re.compile(r"^(\d{1,2})\.\s*(.*)$")
VERB_RE = re.compile(
    r"^(Move|Execute|Bring|Jump|Turn|Slide|Lower|Raise|Extend|Cross|Twist|Stamp"
    r"|Strike|Punch|Kick|Pull|Push|Press|Stand|Step|Pivot|Shift|Land|Draw|Thrust"
    r"|Place|Touch|Lift|Bend|Straighten|Withdraw|Fly|Dodge|Hop|Spring|Flex|Change"
    r"|Let|Wave|Swing|Open|Close|Point|Reach|Drop|Stretch)\b")
NOTE_SPLIT = re.compile(r"^(.*?[a-z][.,]?)\s+(Perform(?: \d| in| the)\b.*)$")


def is_diagram_noise(line: str) -> bool:
    return bool(re.fullmatch(r"[A-H](?:\s+[A-H])*", line)) or line.startswith("Start on the arrow") or re.fullmatch(r"facing [A-H]\.?", line) is not None or line.startswith("CONTINUED")


READY_FRAG = re.compile(r"^[A-Z][A-Za-z-]*(?: (?:[A-Z][A-Za-z-]*|[A-F]|an?|with|the))*$")


def is_ready_fragment(line: str) -> bool:
    """Title-case sidebar fragments naming the ready posture, e.g.
    'Parallel Ready Stance', 'Warrior Ready' + 'Stance B', 'Heaven Hand'."""
    # lowercase variants like "Close ready stance C" (short sidebar line,
    # no movement verb / direction phrasing)
    if re.search(r"\bready (stance|posture)\b", line, re.I) and len(line.split()) <= 6 \
            and re.match(r"^(Close[d]?|Parallel|Warrior|Bending|Sitting|Fixed|Open|Attention|X|Overlapped)\b", line, re.I) \
            and "toward" not in line and not line.endswith("."):
        return True
    # wrapped tail like "with Heaven Hands"
    if re.fullmatch(r"with (?:an? )?[A-Z][A-Za-z -]*(Hands?|Elbows?|Fists?|Palms?)", line):
        return True
    if not READY_FRAG.match(line):
        return False
    return bool(re.search(r"\b(Ready|Stance|Hand|Posture|Heaven|Twin|Elbow)\b", line))


def parse(text: str):
    lex = build_lexicon(text)
    total = sum(lex.values())
    raw_lines = text.splitlines()
    # Whitelist pattern-name lines (the non-empty raw line preceding each
    # "INDIVIDUAL MOVEMENTS") so they are never cipher-decoded.
    protected = set()
    for i, l in enumerate(raw_lines):
        if l.strip() == "INDIVIDUAL MOVEMENTS":
            j = i - 1
            while j >= 0 and not raw_lines[j].strip():
                j -= 1
            if j >= 0:
                protected.add(raw_lines[j].strip())
    lines = [l.strip() if l.strip() in protected else decode_line(l, lex, total)
             for l in raw_lines]

    # section boundaries: pattern name line immediately before INDIVIDUAL MOVEMENTS
    idxs = [i for i, l in enumerate(lines) if l == "INDIVIDUAL MOVEMENTS"]
    sections = []
    for k, i in enumerate(idxs):
        # name: nearest non-empty line above
        j = i - 1
        while j >= 0 and not lines[j].strip():
            j -= 1
        name = lines[j].strip()
        end = idxs[k + 1] - 1 if k + 1 < len(idxs) else len(lines)
        # trim: next section's name line belongs to next section
        sections.append((name, [l for l in lines[i + 1:end]]))
    patterns = []
    for name, body in sections:
        pat = {"name": name.title(), "rank": None, "readyStance": None,
               "movementCount": None, "diagramNote": None, "meaning": "",
               "end": None, "movements": []}
        moves: dict[int, list[str]] = {}
        notes: dict[int, list[str]] = {}
        cur = None
        mode = "moves"
        meaning_buf: list[str] = []
        ready_frags: list[str] = []
        in_block = False  # currently appending contiguous lines to `cur`
        # "N." labels can be displaced by the two-column layout. A bare "N."
        # immediately followed by text (no blank line) binds that text to N.
        # A floating block fills the smallest movement number without text.
        pending_num: int | None = None  # bare "N." whose next line may bind
        letter_frag: str | None = None  # orphaned "B." style wrapped tail

        def next_unfilled() -> int:
            k = 1
            while moves.get(k):
                k += 1
            return k
        for li in range(len(body)):
            line = body[li].strip()
            if not line:
                in_block = False
                pending_num = None
                continue
            if line in ("MOVEMENTS", "READY POSTURE", "DIAGRAM", "INDIVIDUAL MOVEMENTS"):
                in_block = False
                continue
            if line.isdigit():
                if pat["movementCount"] is None and 4 <= int(line) <= 99:
                    pat["movementCount"] = int(line)
                in_block = False
                continue
            if is_ready_fragment(line):
                ready_frags.append(line)
                in_block = False
                continue
            if line == "MEANING":
                mode = "meaning"
                in_block = False
                continue
            if line.startswith("END:") or line.startswith("END :"):
                pat["end"] = line.split(":", 1)[1].strip()
                mode = "moves"
                in_block = False
                continue
            if is_diagram_noise(line):
                in_block = False
                continue
            if RANK_RE.match(line) and pat["rank"] is None and not NUM_START.match(line):
                pat["rank"] = line
                in_block = False
                continue
            if re.fullmatch(r"[A-F]\.", line):
                letter_frag = line  # wrapped tail like "B." -- glue to next block
                continue
            m = NUM_START.match(line)
            if m:
                mode = "moves"
                n = int(m.group(1))
                moves.setdefault(n, [])
                if m.group(2):
                    cur = n
                    moves[n].append(m.group(2))
                    in_block = True
                    pending_num = None
                else:
                    in_block = False  # bare label
                    pending_num = n  # binds if text follows immediately
                continue
            # unnumbered text line
            line = re.sub(r"^[A-H]\s+(?=[A-Z][a-z])", "", line)  # merged diagram letter
            note_tail = None
            ms = NOTE_SPLIT.match(line)
            if ms and not ms.group(2).startswith("Performing"):
                line, note_tail = ms.group(1).strip(), ms.group(2).strip()
            is_note = bool(re.match(r"^(Perform\b|.*(fast|slow|connecting|continuous|releasing|double|stamping) motion\.?$)", line))
            if in_block and cur is not None:
                open_note = notes.get(cur) and not " ".join(notes[cur]).rstrip().endswith(".")
                if is_note or open_note:
                    notes.setdefault(cur, []).append(line)
                elif moves[cur] and " ".join(moves[cur]).rstrip().endswith(".") and VERB_RE.match(line):
                    # previous sentence complete + fresh movement verb =
                    # two movements shared one visual block
                    cur = next_unfilled()
                    moves.setdefault(cur, []).append(line)
                else:
                    moves[cur].append(line)
                if note_tail:
                    notes.setdefault(cur, []).append(note_tail)
                continue
            if mode == "meaning":
                meaning_buf.append(line)
                continue
            # start of a new text block
            if pending_num is not None and not moves.get(pending_num):
                cur = pending_num  # label was directly above this text
            else:
                cur = next_unfilled()
            pending_num = None
            moves.setdefault(cur, [])
            if is_note:
                notes.setdefault(cur, []).append(line)
            else:
                moves[cur].append(line)
            if note_tail:
                notes.setdefault(cur, []).append(note_tail)
            if letter_frag:
                moves[cur].append("\x00" + letter_frag)  # marker: append at end
                letter_frag = None
            in_block = True
        rs = " ".join(ready_frags) if ready_frags else None
        if rs:
            rs = re.sub(r"\bwith A\b", "with a", rs)
            rs = re.sub(r"^Close ready stance", "Closed Ready Stance", rs)
        pat["readyStance"] = rs
        pat["meaning"] = " ".join(meaning_buf).strip()
        movements = []
        for k2 in sorted(moves):
            parts = [p for p in moves[k2] if not p.startswith("\x00")]
            tail = [p[1:] for p in moves[k2] if p.startswith("\x00")]
            text = " ".join(parts + tail).strip()
            note = " ".join(notes[k2]) if k2 in notes else None
            # a "Perform ..." note glued onto the text (source PDF omits
            # the period before it on some lines)
            ms = re.search(r"\s+(Perform (?:\d|in |the ).*)$", text)
            if ms:
                note = (ms.group(1) + (" " + note if note else "")).strip()
                text = text[: ms.start()].rstrip()
            if text and not text.endswith("."):
                text += "."
            entry = {"number": k2, "text": text}
            if note:
                entry["note"] = note
            movements.append(entry)
        pat["movements"] = movements
        patterns.append(pat)
    return patterns


def main():
    text = open(SRC, encoding="utf-8").read()
    patterns = parse(text)
    json.dump(patterns, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    for p in patterns:
        n = len(p["movements"])
        flag = "" if p["movementCount"] in (n, None) else f"  <-- MISMATCH declared {p['movementCount']}"
        print(f"{p['name']:<20} rank={p['rank']!r:<28} moves={n}{flag}")


if __name__ == "__main__":
    main()
