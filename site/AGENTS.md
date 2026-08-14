# site/ — agent instructions

Vite 8 + Svelte 5 SPA. Fetches `data/published/*.json` and does the consumer's
arithmetic in their browser. The root `AGENTS.md` has the boundaries that apply
everywhere; this file is the front-end side.

## Commands

```sh
npm install                                  # once after cloning
npm run dev                                  # :5173, hot reload
npm run verify:math                          # node:test, no browser
npm run build && npm run test:render         # the built page, in a browser
npm run lint && npm run check                # eslint + prettier, then svelte-check
node scripts/find-chromium.mjs               # which browser test:render will use
```

**`test:render` skips and exits 0 with no browser** — read the count, not the
exit code, because a file of skips looks exactly like a file of passes. It is
the only suite that runs the app, and `scripts/check-test-floors.mjs` holds the
count it has to clear — the only test counts in the repository, so no number
here goes stale. `find-chromium.mjs` finds Playwright's browser, anything under
`PLAYWRIGHT_BROWSERS_PATH` or a system Chromium, and proves it by launching it;
`VYARNO_CHROMIUM` overrides that search. `make render` from the repo root gates
on the same resolver and fails where nothing resolves, which is the run to
trust. `npm run preview -- --port 4173 --strictPort` serves the built bundle.

## The five layers — which one a change belongs in

```
data.js               WHICH published number, and what if it is missing
  → view/*.js         WHICH inputs go into which formula   ← the wiring
    → mirror.js       THE ARITHMETIC (the only domain math here)
      → calculator.svelte.js   the $state and the $derived graph. No arithmetic.
        → components/ where it goes, what colour, which language
```

**`plot.js` sits beside `mirror.js` and is not on that path.** It is pure too,
and it takes numbers and a box and says where the marks go — nothing in it knows
about property, wages or inflation, which is why it is not domain math. It is
not a component either, and the reason is the rule below rather than taste: a
tick VALUE is digits a reader reads off an axis, so axis arithmetic is exactly
what a component may not keep.

**`view/` is ten modules, one per subject, each paired with the suite of the
same stem** — `view/home.js` with `verify_view_home.mjs`, and so on. There is no
barrel: a component imports from the subject it is reaching into, so an import
block naming five of them says the component is doing five things. `docs/site.md`
§"`src/lib/view/` — one module per subject" is the table and the argument,
bundle measurements included.

| You are adding…                                                        | It goes in            | With a test in                                                 |
| ---------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| a formula — a rate, a real-terms change, an annuity                    | `mirror.js`           | `verify_mirror_math.mjs` (`verify_net_salary.mjs` for payroll) |
| which published field feeds that formula, which fallback, which anchor | `view/<subject>.js`   | `verify_view_<subject>.mjs`, the suite of the same stem        |
| a fallback chain over the payloads                                     | `data.js`             | `verify_data_contracts.mjs`                                    |
| an axis, a tick, a coordinate — anything a chart is drawn with         | `plot.js`             | `verify_plot.mjs`                                              |
| markup, colour, or a language choice                                   | `components/*.svelte` | `verify_render_*.mjs`, wiring in `verify_wiring.mjs`           |
| chrome every page mounts, or a look two pages share                    | `lib/` (below)        | `verify_render_layout.mjs` · `verify_render_shell.mjs`         |

**Never in a `$derived`.** Every `$derived` in `calculator.svelte.js` is a call
into a `view/` module or `mirror.js` with named arguments — that layer has no pure
function behind it, so anything computed there is computed where no unit test
can reach. Moving the reactive graph out of `App.svelte` into a rune module did
not relax this.

**Where a wrong wiring would be a wrong number, make the wrong wiring
impossible to express.** `savingsSince2020` takes the categories, not a rate;
`headlineRate` takes only the headline payload, so it cannot become Σ(w·r);
`mortgagePanel` reads the regulatory caps out of the published limits rather
than accepting them. `docs/site.md` §"A correct formula fed the wrong number".

`calculator.svelte.js` is deliberately **language-agnostic** — anything that
picks WORDS stays in the component that renders it. Its mutating handlers are
arrow-function class fields, never methods: a template that passes a method
bare hands over a detached function whose `this` is `undefined`, and that fails
silently inside an event handler.

## `components/` is the calculator's. `lib/` is everyone's

The split is by AUDIENCE, and getting it wrong is how six copies of one masthead
happened.

- **`components/*.svelte`** takes `calc` or a prop only `/` produces. Nothing
  else imports them — a component another entry needs is not the calculator's.
- **`lib/*.svelte`** is what more than one entry mounts: `SiteFooter` (the
  attribution and ЗЕТ чл. 4 identity every page owes) and `SiteHeader` (a
  control bar, and a control that differs per page is one a reader learns
  twice). Before adding a third prop to `SiteHeader`, stop: it takes `page` and
  `tagline`, and a masthead that needs more is a page asking for a second header.
- **`lib/*.css`** is a look two entries share — `fig-table.css` on `/how/` and
  `/market/`. A stylesheet and not a component because Svelte scopes a
  component's `<style>` to it, so a shared LOOK cannot be a shared component;
  reach for a component only when the MARKUP is the same thing. `docs/site.md`
  carries the cost of the global selectors and how it is bounded.

## Copy

**Every visible string is written in both languages.** A missing one renders as
a **blank line**, not a fallback — BG is the primary language and clumsy
Bulgarian is a bug.

Which of the two places it goes in is decided by who reads it. **`content.js`
holds anything JavaScript has to select, interpolate or pass as an attribute** —
a string a branch picks between, one carrying a `{slot}`, an `aria-label`, a
`<title>`. **Long bilingual prose is inlined in its component** as paired
`.l-bg` / `.l-en` spans, because a paragraph split between a copy file and a
template is edited in two places and reads as neither; `How.svelte` and
`ExplainerBand.svelte` are most of it. Moving prose from one to the other is a
refactor and needs the same argument any other refactor does.

A sentence can be false while every formula behind it is right, which is what
`verify_copy.mjs` guards: what a claim may say about our own numbers, and the
P-numbered rules it has to satisfy (`docs/principles.md`).

## `{@html}` — the constraint that lets it exist

`svelte/no-at-html-tags` is switched off, and `verify_template_safety.mjs` is
the evidence. Three invariants hold it up:

1. **The app has no free-text input surface at all** — every control is a
   number, range, checkbox or radio. No `<textarea>`, no `contenteditable`.
2. **Every `{@html …}` expression is rooted in an in-repo constant** — a `COPY`
   key or a `legal.js` paragraph.
3. **Every value substituted into one goes through a formatter that constrains
   its shape** — `period()` and `httpUrl()` in `format.js` exist for that. A
   reference period, a source URL and a maturity limit all arrive in a
   published payload, and none may reach a template raw.

If one stops holding — someone adds a text field, or renders a fetched string
as markup — escape the value or turn the ESLint rule back on. Do not relax the
test.

## Also

- **No new packages without justification.** `package.json` is `svelte` +
  `@sveltejs/vite-plugin-svelte` + `vite`, and the test suites are Node's
  built-in runner with no framework.
- **No third-party scripts, CDN fetches or hosted fonts.** The CSP in
  `public/_headers` is what makes the published privacy notice checkable rather
  than merely intended, and `verify_static_assets.mjs` pins every directive
  exactly.
- **A test must not assert on layout.** Source-reading suites match on token
  sequence and blank comments first; a formatter run must not turn one red.
- `docs/site.md` is this directory module by module.
