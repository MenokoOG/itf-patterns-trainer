# PULP restyle — drop-in source

Visual-only change set for `itf-patterns-trainer`. No logic, data, routing,
auth or API code was touched: every hook, effect, comment and control-flow
branch is byte-identical to the current source. Only `className` values,
wrapper markup and one new token layer differ.

## Apply

Copy these over the matching paths in your repo:

```
src/app/globals.css                 (rewritten — tokens + component layer)
src/app/layout.tsx
src/app/page.tsx
src/app/patterns/[slug]/page.tsx
src/app/quiz/[slug]/page.tsx
src/app/progress/page.tsx
src/app/coach/page.tsx
src/components/AuthButton.tsx
src/components/CoachChat.tsx
src/components/MovementStepper.tsx
src/components/Quiz.tsx
src/components/ProgressDashboard.tsx
```

Then `npm run verify`.

Untouched: `src/app/api/**`, `src/context/**`, `src/lib/**`, `src/data/**`,
`tools/**`, config files.

## What changed

- **`globals.css`** now carries the theme. A Tailwind v4 `@theme` block defines
  the PULP tokens (`ink`, `ink-deep`, `cream`, `cream-lift`, `gold`, `muted`,
  Georgia display/body, Courier mono, 4/8/16px radii, 1/2/4rem spacing) so they
  are usable as ordinary utilities — `bg-cream`, `text-gold`, `rounded-lg`.
  Below it, a small component layer: `.pulp-h1/.pulp-h2`, `.pulp-meta`,
  `.pulp-label`, `.pulp-rule`, `.pulp-card`, `.pulp-panel`, `.pulp-ghost`,
  `.pulp-cover` (+ `.pulp-cover-glow`), `.pulp-row`, `.pulp-btn` with
  `-gold/-ink/-outline`, `.pulp-tag` with `-ink/-gold/-outline`, `.pulp-link`,
  `.pulp-input`, `.pulp-select`.
- **Ground flipped to light.** Cream `#e8dcc8` page, ink `#201810` text. Dark
  brown is now used deliberately — header, cover blocks, primary buttons,
  student chat bubbles — instead of being the whole app.
- **Type.** Georgia everywhere it is read; Courier New for anything counted or
  labelled (movement counts, question counter, rank labels, section kickers,
  buttons). H1 is 2.5rem per the spec.
- **Layout.** Each route opens with a full-bleed `.pulp-cover` block — gradient
  brown ground, a gold radial glow bleeding off one corner, the title with a
  faint gold text-shadow — then the 672px column resumes on cream. The stepper
  card carries the movement number as a 130px ghost numeral at 7% ink.
- **Feedback colors** are now theme colors, not stock red/green: a correct quiz
  answer is gold-glowing cream, a wrong one is solid ink; quiz best ≥80% is a
  glowing gold tag, 1–79% a gold-outlined tag, untouched patterns a dashed
  outline row. The quiz gained a gold progress bar (derived from existing
  state — no new logic).
- **States.** Rows and buttons lift 2px with a gold ring on hover, 200ms
  transition; disabled drops to 45%; focus-visible is a 2px gold ring; text
  selection is gold on ink.

## One note

Accessibility: gold `#ffd98a` on ink `#201810` and ink on cream both clear 4.5:1.
`--color-muted` `#8a795c` on cream is ~3.4:1, so it is used only for uppercase
Courier meta lines and 13px+ secondary copy, never for body paragraphs — the
`muted-deep` `#4a3c2c` step is there for those.
