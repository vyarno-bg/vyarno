# Vyarno.bg — documentation

«Икономиката, честно» — personal inflation, real wage, salary percentile, the
tax wedge, rent, savings and the path to a home, for Bulgaria. Verified
official data, computed in the user's browser.

The engineer entry point. Read the [repo README](../README.md) first, then this.

## Who this is for

A regular person living in Bulgaria **today**, earning their salary this month
and paying for medicine and electricity this month. They do not care about
COICOP codes or unit types. They care that the number on the screen reflects the
prices they are paying **right now**, and that they can verify it.

Every number the user sees is:

1. **Fresh** — whatever Eurostat has most recently published in the current
   (ECOICOP ver.2) dataset. Never sourced from a discontinued or archived cube:
   that pins the headline to the month the cube was frozen.
2. **Verifiable** — every figure has a clickable link to the upstream cube.
3. **Honest about provenance** — the 12-month rate is the verbatim official
   figure; where two numbers differ (the all-items headline vs the user's own
   basket), the UI shows both and why.
4. **Reconcilable** — the published divisions reproduce Eurostat's own all-items
   index through HICP's chain-linking identity, gated at ±0.02 pp. Where the
   simple `Σ(weight × rate)` differs — it does, because a 12-month window
   straddles the December chain link — the UI shows both rather than pretending
   they are one ([`math.md`](./math.md) §"Two reconciliations").
5. **One bucket per row** — a category's weight, rate, index, friendly label and
   verify link all describe the SAME Eurostat bucket on the SAME classification
   version. Never join two HICP cubes by raw CP code without proving both give
   the code the same label.

A change that would compromise any of the five is wrong regardless of how clean
the code looks. [`math.md`](./math.md) and
[`data-sources.md`](./data-sources.md) exist to deliver them.

## The docs

| Doc | Read when |
|---|---|
| [`how-it-works.md`](./how-it-works.md) | You want the plain-language story: what Eurostat is, the "price sticker" idea, why the numbers are trustworthy. Start here if you are not an engineer |
| [`architecture.md`](./architecture.md) | You want the system map: how the pipeline, the published JSON and the site fit together |
| [`data-sources.md`](./data-sources.md) | The index over the upstreams: the cross-cutting rules, the release windows, and the checklist for adding a connector. One file per publisher under [`sources/`](./sources/), each beside the connector that fetches it |
| [`math.md`](./math.md) | You want the provenance contract: where every published number comes from, and the invariants no change may break |
| [`validation-gates.md`](./validation-gates.md) | You want to know what the gates check and what to do when one trips |
| [`site.md`](./site.md) | You want the SPA: the five-layer split, what each `src/lib/` module and `src/components/` file owns, the basket interface, hosting headers |
| [`design.md`](./design.md) | You are changing a colour, a type step or one of the stylesheets more than one page draws. The palette, the contrast floor and the shared treatments |
| [`seo.md`](./seo.md) | You are touching what a crawler reads: the prerendered shell, `robots.txt`, the sitemap, the head tags — or you are about to add a page to make the site findable |
| [`local-development.md`](./local-development.md) | You are setting up, running the suites, running the pipeline live, or debugging a failed run |
| [`testing-strategy.md`](./testing-strategy.md) | You are writing a test and want to know which suite it belongs in, and why the answer is what it is |
| [`principles.md`](./principles.md) | You are proposing a feature, or want to know whether an idea is already ruled out. P1–P11, the closed list, and what the code owes its readers |
| [`legal.md`](./legal.md) | Licences, upstream terms, the published identity, the regulatory perimeter, and the standing commitments somebody has to keep true |
| [`writing-style.md`](./writing-style.md) | You are writing a commit message, a PR body, a code comment or a doc. The house voice, the machine-written tells to avoid, and what a cleanup pass must not strip |

The instruction files for coding agents are separate and deliberately short:
[`../AGENTS.md`](../AGENTS.md) at the root, plus
[`../pipeline/AGENTS.md`](../pipeline/AGENTS.md) and
[`../site/AGENTS.md`](../site/AGENTS.md) for the two toolchains. They carry the
commands and the boundaries and point here for everything else.

`AGENTS.md` is the one an agent should read; `../CLAUDE.md`,
`../.cursor/rules/vyarno.mdc` and `../.github/copilot-instructions.md` exist
only because Claude Code, Cursor and Copilot each look for their own filename.
A rule belongs in `AGENTS.md` or in this directory, and a copy of one in those
three files can go stale without anybody knowing which version is current.

`CLAUDE.md` therefore imports `AGENTS.md` and forks nothing. The other two
cannot: neither Cursor nor Copilot transcludes a file, and a pointer the tool
will not follow is guidance that does not arrive. Each carries an abbreviated
copy of the writing rules and names
[`writing-style.md`](./writing-style.md) as the source — which is the one
exception, and it is a cost rather than a pattern to extend. A rule changes in
`writing-style.md` first and propagates outward; the copies never lead.

## Start here depending on what you are doing

The recurring moves have one home each, and it is
[`data-sources.md`](./data-sources.md) §"Checklist for adding a connector" and
§"The other recurring moves" — the ordered steps, and which of them a test
catches. What is below is everything that is not one of those.

| You want to… | Read |
|---|---|
| Understand the system end to end | [`architecture.md`](./architecture.md) → [`math.md`](./math.md) → [`data-sources.md`](./data-sources.md) |
| Refresh the published figures | [`local-development.md`](./local-development.md) §"Running the pipeline against live upstreams" |
| Check whether an idea is already ruled out | [`principles.md`](./principles.md) — P1–P11 and the closed list |
| Touch anything with a licence or a legal edge | [`legal.md`](./legal.md) → `site/src/lib/legal.js` |
| Add a **new upstream** | [`data-sources.md`](./data-sources.md) §"Working with a new upstream" — how to probe, the seven fetch plans, then the checklist. [`legal.md`](./legal.md) **in the same commit** |
| Change how the pipeline computes a number | [`math.md`](./math.md) → `transform.py` → `test_transform.py` |
| Get a published payload **onto a page** | [`site.md`](./site.md) §"`src/lib/payloads.js` — the manifest". A payload with no manifest row publishes and renders nowhere, and no SPA suite catches it: they iterate the manifest, so a row with no file goes red and a file with no row is silent. `freshness-check.yml` reports it, weekly |
| Change UI copy that makes a claim about our own numbers | `site/src/lib/content.js` → `verify_copy.mjs`. A sentence can be false while the arithmetic is right |
| Change the annuity | [`math.md`](./math.md) §"Which rate goes into the annuity" → `mirror.js` → `verify_mirror_math.mjs` |
| Change the affordability line or the regulatory caps | `site/src/lib/view/home.js#mortgagePanel` → `verify_view_home.mjs`. It reads the caps out of the published limits rather than accepting them, which is the point |
| Add a package, a font, or a chart library | [`AGENTS.md`](../AGENTS.md) §Boundaries "Ask first". For charts the answer is already no — [`site.md`](./site.md) §"The two charts" |
| Change a colour | [`design.md`](./design.md) → `site/src/lib/tokens.css` → `verify_contrast.mjs` (WCAG AA, both themes) |
| Change a response header | `site/public/_headers` → `verify_static_assets.mjs`. That file is the declaration; applying it is the deployment's job. After the deploy, `make headers` asks the live origin whether it agrees |
| Touch a HICP connector | [`data-sources.md`](./data-sources.md) §"Cross-cutting rules" → gates 1–2 |
| Ship a change | `make check` from the repo root, all green. Tests move with the code in the same commit |

## Risk flags

- **Single point of math.** Every HICP rate and index traces to `prc_hicp_minr`
  and every weight to `prc_hicp_iw`, both ECOICOP ver.2, both keyed by
  `coicop18`. If Eurostat changes either cube's shape, the pipeline breaks
  loudly but the published JSON does not update until we patch the connector.
  That is intentional — better a banner saying "stale" than a wrong number.
- **Two cubes, one classification.** Reading weights from one HICP dataset and
  rates from another only works while both are on the same ECOICOP version. **A
  shared code string is not evidence of a shared meaning**, which is why the
  classification-agreement gate proves it per code before anything is written.
- **No upstream notifications.** Nothing tells us a publisher released a new
  figure. If a refresh is forgotten the site keeps rendering the previous
  `as_of` date, and the line of defence is the per-payload age check in
  `view/freshness.js#dataAge`: every payload is judged against the cadence its manifest
  row declares (`site/src/lib/payloads.js`), and the banner fires when any is
  overdue. Which also means automating all but one of them would not clear it —
  the panel would still show the last one going red on its own.
- **A correct formula fed the wrong number.** The class of bug the pipeline
  gates structurally cannot see, because everything they check is already right
  on disk. `src/lib/view/` + the `verify_view_*.mjs` suites are the answer.
- **CI is a backstop, not a reviewer.** It runs both suites and the build on
  every push, but it does not refresh data and cannot judge whether a *new*
  number is right. A payload with no test is a number nobody is checking.
- **We trust Eurostat verbatim.** Every per-category rate is taken as published
  rather than derived from the index, so our numbers inherit Eurostat's rounding
  quirks. A wrong-on-paper derivation would be worse.
