# The look — tokens, the type scale, and the stylesheets pages share

Everything that decides how the SPA looks, and the constraints each rule is
holding. `tokens.css` is the palette and the type scale; the other three are
treatments more than one page draws, which is why they are stylesheets rather
than components — Svelte scopes a component's `<style>` to its own markup, and
these rules span files by construction.

[`site.md`](./site.md) is the SPA's map: the layers, the modules and what each
owns. Change a colour and `verify_contrast.mjs` is the suite; change a chart's
geometry and it is `verify_plot.mjs`.

## `src/lib/fig-table.css` — the table treatment two pages share

Eight rules `/how/` and `/market/` had arrived at twice, byte for byte: the
scroll box, its focus ring, the table's metrics, the cell padding and rule, the
row-header weight, the cell colour, the numeric column, the marked row.

A stylesheet rather than a component because Svelte scopes a component's styles
to it, so a shared LOOK cannot be shared as one — and the fifty-one tables agree
on the furniture and on nothing else. The cost is global selectors with no
unused-selector warning behind them; only the two entries that need it import
it, and every page-specific rule stays in its own component, one specificity
step above.

**One rule in a table is heavier than the others, and it is the one under the
column heads.** Every rule had been `--rule` at 5%, so the line separating the
labels from the figures carried the same weight as the line between two data
rows: on the thirteen-row basket table that is fourteen identical hairlines and
nothing saying where the head stops. The head takes `--line`, which is the token
that rules a page, and the body rules are then free to stay as faint as a ledger
wants them.

## `src/lib/chart.css` — the chart frame two pages share

The same argument one section up, for pictures instead of tables. `/market/` and
`/credit/` both draw inline SVG with the tick labels as HTML in a gutter beside
the box, and they agree on the frame and on nothing else: columns with a seasonal
tint and sparklines on one page, nineteen years of crossing levels on the other.

What is shared is the grid that makes a percentage `top` land on its own
gridline, the box that holds marks and no text, the two gutters of HTML text
either side of it, and what a gridline, a year rule, a zero axis and a base rule
look like. **Every mark is `.plot-*`, and the prefix is load-bearing**: these
selectors are global wherever the file is loaded and both pages carry their own
`.cap`, `.num`, `.scroll` and `.stat`, so a mark sharing one of those names would
take its rule and draw a chart that renders, looks plausible and is not the data.
Page-specific marks — `/market/`'s bars and break rules, `/credit/`'s quiet total
line — stay in their own component, one specificity step above.

Four things about the marks are decisions rather than defaults.

- **A second series is `--series-2`, an ink blue, and it is a third hue because
  the other two mean something.** `--real` says «your number is the good one» and
  `--erode` says «this costs you», so a neutral measurement drawn in either
  announces which is the bad news. What had been doing the job — `--ink-2`, the
  body ink — is not a hue at all: against `--real` it separates by ΔE 8.8 in
  normal vision and 2.7 under protanopia (OKLab ×100), so for roughly one reader
  in twelve the two lines were one colour and the dash was the only cue. The blue
  measures 16.5 normal / 15.8 CVD-worst in the light theme and 16.1 / 14.6 in the
  dark, and the dark step was picked as the passing candidate closest to the green
  in lightness, so the supporting series stops out-weighing the one it supports.
- **`.plot-base` is the datum a series is measured against** — the base year on an
  index, zero on a sparkline — and it is drawn as furniture in `--muted`, told
  apart from the zero axis by its dash. It had been `--erode`, which made the
  loudest mark on every plot a line carrying no measurement and said, in the one
  colour reserved for a loss, that a publisher's choice of base year was bad news.
  **There is no threshold mark in the shared frame**, and adding one is not this
  rule recoloured: a threshold is a claim about what a figure ought to be, which
  is why the 30%-of-net affordability line in `HomeRow` gets the accent this one
  gave up.
- **`--grid` is one step up from `--rule`.** A hairline between rows of text has
  the rows themselves to be found by; a gridline has to be findable across an
  empty plot, or a reader cannot carry a column down onto its value. 0.11 light
  and 0.13 dark, because a light rule on a dark ground reads fainter at the same
  alpha.
- **`.plot-last` marks the newest reading and `.slabels` writes its value beside
  it.** Every figure on these pages is the last point of some series, and on a
  plot 85 quarters wide that point is a seven-pixel stub with nothing to say it
  is the one the prose just quoted. The value goes in a third grid column of HTML
  rather than a `<text>` at the line's end, for the reason the tick labels do:
  inside an SVG scaled to the viewport an 11px label reaches a phone at 6.2px.
  The column is opt-in (`.plot.labelled`) so a single-series plot gives up no
  width to it, and it closes below 760px, where the key under the figure names
  the lines on its own.

## `src/lib/tokens.css` — palette, type, contrast floor

The palette is defined twice — `:root` for light, `html[data-theme="dark"]` for
dark — and `stores.js` flips `data-theme` on `<html>`. Same token names in both
blocks; nothing outside this file hardcodes a colour.

**The dark block is wrapped in `@media screen`, and that is how paper gets a
light ground with no second copy of the palette.** A dark theme printed is a
full-bleed black rectangle per sheet. Gating the selector leaves `:root`'s light
values in effect for print, so `verify_contrast.mjs` still measures one palette
and a retune cannot drift between two.

**The focus ring is a bare `:focus-visible`, deliberately not a list.** It had
named `button`, `.pill`, `a` and `.chip`, which left every disclosure summary
and every range slider on Chrome's own `1px auto rgb(16, 16, 16)` — a near-black
hairline in *both* themes, so on the dark ground a keyboard reader had no
visible focus across thirteen disclosures on `/market/` and the whole basket.
A list has to be kept level with the markup and this one was not.
`verify_render_layout.mjs` walks every stop with the real Tab key, on four
routes in both themes.

**Every ink token must clear WCAG AA (4.5:1) against every surface it is painted
on, in both themes.** `verify_contrast.mjs` parses `tokens.css`, computes the
relative luminance of each `--ink*` / `--muted` / `--real*` / `--erode` against
`--paper`, `--paper-2` and `--surface`, and fails below 4.5. There is no
large-text exemption on purpose: every role checked is small text — source
captions, hints, the wordmark tagline. If a design change needs a lighter muted,
the captions have to get bigger first.

**4.5 is where the suite fails, and it is not where a token should sit.**
`--muted` is the case that shows why: it paints 94 call sites at 11–13px, and
a value ON the floor passes the check while the page still reads thin, because
what a reader receives is the token's ratio minus whatever is composited on top
of it. It is held at 5.47 / 5.72 / 6.15 in the light theme and 6.36 / 5.98 /
5.61 in the dark one, against `--paper` / `--paper-2` / `--surface`.

**`opacity` on text spends that headroom immediately, so it is checked
separately.** Nothing under 0.89 light or 0.83 dark still clears 4.5:1 on
`--paper-2` — the alphas anyone reaches for are all below the floor.
`verify_contrast.mjs` parses `SiteFooter`'s `.support` rule and recomputes the
ratio that rule actually renders at, because the palette cannot see a fade
declared in a component.

**That covers one rule, and the class is wider than one rule.**
`verify_render_contrast.mjs` opens the built page and walks it: for every
element carrying visible text it multiplies the `opacity` of the whole ancestor
chain into the text's alpha, composites each background layer up that chain —
the rgba ones included, since `--rule`, `--track`, `--gain-band` and the two
`-soft` tokens all let their backdrop through — and asserts 4.5:1, or 3:1 where
the **computed** size is ≥24px or ≥18.66px at weight ≥700. Both themes, both
languages. It is the guard; the `.support` recompute stays because the render
suite skips without a browser and `verify_contrast.mjs` never does.

### `--line` rules a page; `--control-line` bounds something you operate

Two tokens because WCAG 1.4.11 asks 3:1 of one of them and nothing of the
other, and one token cannot be both. A field's `--paper-2` fill differs from
the card's `--surface` by 1.08:1, so **the 1px border is the control's entire
visible extent** — at a hairline's ratio the input has no edge at all for a
reader with reduced contrast sensitivity, on a page whose number boxes carry no
placeholder to give them away.

`--control-line` is 3.16 / 3.31 / 3.56 light and 3.81 / 3.58 / 3.36 dark
against `--paper` / `--paper-2` / `--surface`, and it paints the edges of
fields, selects, pills, chips, segmented buttons, the disclosure summaries and
the share actions. **Card borders, table rules, the footer separators, the
`.sh-card` picture frame and the mortgage bar's outline stay on `--line`**:
they identify no control and carry no state, and darkening them buys nothing
1.4.11 asked for while making every ledger hairline heavier.

The second test in `verify_render_contrast.mjs` holds the split — **where a
control draws a border, that border clears 3:1**, measured in the browser
against the fill inside it and the surface behind it. It does not require a
control to have one: `.rank-more` is identified by its text and underline, and
a native checkbox is the user agent's to draw. Sliders are outside both — their
track edge is an inset `box-shadow` on a pseudo-element no `getComputedStyle`
call reaches, and what identifies them is the thumb's `2px solid var(--real)`.

### The type scale

Twelve steps, `--fs-micro` (11px) through `--fs-hero` (40→56px), and **every
`font-size` in the app is one of them** — component styles, inline styles, both
other pages. Three properties of it are load-bearing rather than cosmetic:

- **The steps are `rem`, and `html` carries no `font-size`.** A reader who has
  raised the default size in their browser gets a proportionally bigger page.
  That is the accessibility setting the web actually honours and the first thing
  someone with weak eyesight reaches for; a hand-tuned `px` ladder ignores it
  outright, however carefully its steps are chosen. **A step that tracks the
  viewport keeps a `rem` term inside its `clamp()` for the same reason**, and
  that is where the rule had been leaking: five entries each wrote
  `clamp(1.5625rem, 4vw, 2rem)` for their `h1`, whose middle term is pure
  viewport, so between the two bounds the one heading on a page ignored the
  reader's setting exactly as a `px` size would. `--fs-title` is that curve with
  the setting inside it, and it is one token rather than five copies.
- **The bottom seven steps and the top four are spaced differently on purpose.**
  11–17px moves in single pixels because what it separates is a caption from a
  label from a hint, distinctions a reader resolves by position and colour; a
  bigger step there just makes the small print big. Above `--fs-lead` the job
  changes — a heading has to outrank its own body copy across a paragraph break,
  and `--fs-h3` at 19px over 16px body was 1.19x, which is a bold sentence rather
  than a section title. The top is geometric at roughly 1.25 a step, `--fs-h2`
  sits half again over body, and the three document pages moved their section
  headings onto it. `--fs-figure` is separate from `--fs-h2` because a stat card's
  number has to outrank the heading of a section carrying twenty of them, so the
  two sizes move in opposite directions the moment either is tuned.
- **The floor is 11px, and 16px is a floor for form controls.** The ledger look
  leans on small mono captions and should, but the floor is what decides
  whether source lines, unit suffixes and the "≈ €128" column stay inside what
  ordinary middle-aged eyesight reads comfortably — on a page whose whole
  subject is what a person's groceries cost. A floor below 11px puts them
  outside it. The scale is compressed rather than uniformly enlarged, so the
  hierarchy survives while nothing is tiny. Separately, every `<input>` sits at `--fs-lead` (16px) because iOS
  Safari zooms the viewport when a focused field is smaller, which throws the
  layout sideways mid-typing. The measurement-window `<select>` in the results
  card's heading row is the one control set below it, and a `<select>` is what
  the zoom rule does not touch.

A new size is a new token or an existing one — never a fresh `px` value.

### Only one of the two families declares a `unicode-range`

IBM's files are its own **split** builds, so each weight is declared twice — its
Cyrillic file and its Latin1 file, 16–22 kB each, over IBM's own range for that
split copied out of `css/ibm-plex-*-all.css`. Adobe ships Source Serif 4 as one
face per weight covering Latin, Greek and Cyrillic together, which is why those
files are 60–82 kB. A Cyrillic range over them threw away glyphs that were
already in the file: **every heading in the `/en/` tree rendered in Georgia while
its Bulgarian counterpart rendered in Source Serif** — two designs of one page,
at the size a reader notices first. The range is gone from the serif faces and
the font's own cmap decides, which is what a font that was never subsetted is
entitled to.

**A digit is Latin, so Latin1 is not an English-only concern.** Without those
eight faces `0-9`, `€`, `%` and every ASCII fragment fall to the system stack in
both languages, which put the ledger's own numerals in Consolas, Menlo or DejaVu
depending on the reader's operating system — three designs of the headline
figure, none of them chosen, beside Cyrillic set in Plex. The four weights mirror
the Cyrillic set exactly, because «≈ €46 повече» is one line with both scripts in
it and a weight present on one side only renders that line in two fonts.

| Page | webfont before | after |
|---|---|---|
| `/` | 191 kB | 344 kB |
| `/en/` | 119 kB | 272 kB |
| `/support/` | 151 kB | 209 kB |

Worst case is +153 kB against a page that already transfers ~930 kB, behind
`font-display: swap` and cached after the first visit. `✓`, `≈` and `№` live in
IBM's `Pi` split and stay on the system stack: another ~73 kB across eight faces
for three glyphs, where `⚠` is in no Plex build at all. A symbol drawn by the
system is still that symbol; a letterform drawn by the system is a different
typeface.

**This is not a licence question and must not become one**: every file is
byte-for-byte its publisher's, and writing a `unicode-range` modifies a
stylesheet rather than a font. Re-subsetting is still the thing that would
breach OFL condition 3 (`tokens.css` header).

### `--col` is what a figure gets, `--measure` is what a sentence gets

Two tokens and not one, because a chart wants width and a line of prose does
not. `--col` (48rem) is the single-column document `/how/`, `/market/`,
`/credit/` and `/legal/` are laid out in; `--measure` (38rem) is the cap on
every `p` inside them, so tables and plots run the full column while the text
beside them sets 66–70 Cyrillic characters to the line.

They had been one number, `max-width: 760px` on the `main` element, which put
every paragraph on those pages at about 85 characters — past the band a reader
gets back to the left margin from without losing the line. Being `px` it also
handed a reader who raised their font size a **longer** line in characters
rather than the same one bigger, which is the `rem` rule above failing in the
one place it was least visible. `/credit/` had no cap at all and inherited
`.wrap`'s 1120px, so two sibling documents a reader moves between drew the same
chart at two widths.

**A source caption is not prose and is exempt** (`p.ss` on `/market/`, `.cap` on
`/how/` and `/credit/`): it is one string of mono at the 11px floor, and holding
it to the reading measure wraps a reference period away from the publisher it
belongs to. It takes the width of the figure it dates.

### The segmented control lives in `card.css`, and why that matters

Two cards draw one: `.m-pay` asks whether the figure you typed is net or gross,
`.m-inputs` asks whether the basket is entered in per cent or in euro. The rules
had lived in `BasketEditor`'s scoped `<style>`, so Svelte gave them to that
component's markup and to nothing else — and `PayField`, which writes the same
class names, rendered the **browser default**: two 2px-outset Arial boxes,
`rgb(239,239,239)` on black, identical whichever was pressed, in a fill that
ignored the theme.

**What that cost is the selected state on the most consequential control in the
calculator.** Net and gross are about a third apart and every figure on the page
is derived from that one number, and nothing on screen said which reading was in
force. It is the failure `.vlink` in the same file already records: a class name
copied into a second component keeps the first copy correct, so nothing looks
wrong in the file anybody opens.

`every_segmented_control_on_the_calculator_shows_which_half_is_pressed` in
`verify_render_layout.mjs` is the guard, and it is a rule over ALL of them rather
than a case for this one. The font-family half is what generalises: two different
backgrounds could be arranged by accident, but a control drawn in the UA's font
is one no stylesheet reached at all.

### A figure is hung from a rule, not drawn in a box

The `.stat` tile is the unit all three of `/market/`, `/credit/` and the
calculator's «Страната накратко» strip are built from, and each drew it the same
way: `--surface`, a 1px `--line` border, a 6–8px radius. **The border was doing
no work.** `--line` against `--paper` is 1.40:1 and `--surface` against `--paper`
is 1.08:1, so six tiles in a row were six rectangles a reader could only just
find, and what they added was a rectangle rather than a boundary.

What replaces it is the treatment a ruled document already implies: a 2px
`--ink` rule across the top of each tile with the figure hung under it, the
label at `--fs-meta` below that, and the source caption last behind its own
hairline. The rules across a row read as one broken line, which is what a table
of figures looks like in print, and the tile's own extent is given by the rule
plus the gap rather than by four edges. The row gap goes to 22px in the same
change: with no box, the gap is the only thing keeping two tiles' labels from
reading as one paragraph.

**What this may not cost.** The figure, its label and its source line stay in
that order, the caption keeps its rule and stays the last element, and nothing
moves behind an interaction — `verify_render_strip.mjs` holds the caption to
within 16px of the content it dates and holds each row flush to the widest, and
both still pass because neither is a claim about the border.

## `src/lib/print.css` — the format P9 already anticipated

A page of sourced official statistics is what somebody prints or saves to PDF
for a meeting, and **the links are the product**: on paper every verify link was
underlined text with its address gone, so the printed sheet carried no way to
check a single figure. P9 says verifiability scales down and never away, and its
fallback — the source name, the date and the domain — is written for a format
that *physically cannot* carry a link. Paper can. So every external link prints
its full address, in mono at the caption size, on its own line under the link
text; `break-all`, because a 104-character Eurostat dissemination query has no
break opportunity in it and one that leaves the page box loses the end a reader
has to type.

Loaded last by all six entries, after `tokens.css` and any shared sheet, so its
`@media print` block wins on cascade order rather than on selector weight.

| On paper | Why |
|---|---|
| The dark theme comes out light | Gated in `tokens.css` with `@media screen`; the three grounds go white here, because browsers drop backgrounds by default and half of readers would otherwise get a green-grey wash and half would not |
| The masthead keeps its wordmark, loses its nav and switches | Sticky prints over the first page break; six words that do nothing are the top of the sheet a reader looks at most |
| Disclosures print open, except `.numbers` | The `.method` ones hold the derivations, which is the method this project publishes. A `.numbers` one holds the upstream's own series — 372 rows across `/market/` — which is what the printed URL beside it fetches |
| `white-space`, `overflow` and `max-height` are released together | An element past the page box is LOST, not scrolled. Releasing the overflow of `/market/`'s 22rem scroll box without its height prints 60 rows **on top of** the prose under it |
| `break-inside: avoid` only on things that fit a sheet | On a block taller than the page box the browser cannot satisfy it: it ejects the block, overflows it anyway, and leaves the previous sheet blank. The calculator's cards run to three sheets each |

`verify_render_print.mjs` drives all of it under
`emulateMedia({media: "print"})`, which measures what a printer receives rather
than what the stylesheet declares. It is not a second design and must not become
one: no running heads, no rearranged layout, nothing that needs maintaining
against a medium nobody looks at.
