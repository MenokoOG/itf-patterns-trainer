# 2. TITF handbook provenance and extraction pipeline

Date: 2026-08-29

## Status

Accepted

## Context

The trainer needs to know what each rank requires, not only what movements each
pattern contains. That information lives in the TITF Color Belt and Black Belt
handbooks and the Gup/Dan examination sheets.

Two questions had to be settled before using them.

**Provenance.** The handbooks are federation publications, so using them is not
automatically ours to decide. Ruling from Lawrence Jefferson II: he is the master
author of the handbooks and works directly for the governing body of the
federation. Use in this project is authorised on that basis.

**Reproducibility.** `src/data/patterns.json` was extracted from a source PDF by
`tools/parse_itf.py`, but that PDF was never committed and the parser reads from
a temporary path. The data therefore cannot be regenerated from the repository,
and nobody can check the extraction against its source.

## Decision

Commit the source PDFs to `ITIF-Handbooks/` and parse them in-repo with
`tools/parse_syllabus.py`, which writes `src/data/syllabus.json`.

Each rank record carries `rank`, `belt`, `promotesTo`, `source` and numbered
`sections` of entries. English name and Korean romanisation are separate fields
rather than one string, so the UI can show either and neither has to be
re-derived later.

Page 21 of the Color Belt handbook has a text-layer collision: the "for
promotion to 1st gup" run is drawn over two other lines, and `pdftotext -layout`
interleaves them character by character. Two lines are repaired by an explicit,
documented substitution in the parser, using strings recovered from
`pdftotext -raw`. The repair asserts that the damaged text is still present and
fails loudly if the source PDF changes.

## Consequences

The syllabus data can be regenerated from the repository by anyone with poppler
installed, and diffed against its source. Three megabytes of PDF enter git
history; that is the price of a pipeline that can actually be re-run.

The page 21 repair is a workaround for a defect in the source document. It
should be fixed in the handbook itself at version 1.3, after which the repair
entry can be deleted -- the parser will fail and say so.

`tools/parse_itf.py` remains unreproducible; committing its source PDF is
follow-up work, not covered here.
