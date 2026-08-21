---
type: project-context
status: active
---

# Вярно / vyarno.bg — agent instructions

«Икономиката, честно» — a calculator that measures Bulgaria's official
statistics against one household's own numbers: personal inflation, real wage,
salary percentile, the tax wedge, rent, savings and the path to a home. A
Python pipeline pulls official figures, gates them, and commits JSON; a static
Svelte SPA reads that JSON and does the consumer's arithmetic in their browser.

**This file is only what an agent gets wrong without being told.** Everything
else is in `docs/`, and every section here ends at the doc that carries it.

## Commands

```sh
make setup                       # venv + npm, once after cloning
make check                       # lint → test → render, in CI's order
cd site && npm run check:all     # the same run, without make
```

`make check` is strictly stricter than CI, so local green implies CI green and
never the reverse. The two deliberate differences are argued at the top of the
`Makefile`. `make help` lists the rest; `docs/local-development.md` is the long
form.

**`render` needs a Chromium and `make check` fails without one.**
`site/scripts/find-chromium.mjs` finds Playwright's own, anything under
`PLAYWRIGHT_BROWSERS_PATH`, or the usual system locations; `VYARNO_CHROMIUM`
overrides it, and `npx playwright install chromium` in `site/` is the fallback.
**Do not route around that gate**: `test:render` alone **skips and exits 0**
with no browser, and it is the only suite that runs the app, so a template error
that renders the page blank is invisible to everything else. Read the render
count — 0 means no browser.

**Never write a test count into a doc.** `site/scripts/check-test-floors.mjs`
holds the only counts in the repository, as floors: a suite that SHRANK fails,
and so does a floor more than a fifth behind the run. Lower one only in the
commit that deleted the tests, naming which went and why; raise one in the
commit that grew the suite.

## Layout

- `pipeline/` — Python 3.11 ingest: `sources/*.py` → `transform.py` →
  `validate.py` → `publish.py`, driven by `cli.py`. Own `AGENTS.md`.
- `data/published/` — the JSON envelopes, **committed**. The site fetches these;
  the diff is the review.
- `site/` — Vite + Svelte SPA, five layers. `src/components/` is the
  calculator's own parts; `src/lib/` is what more than one entry uses. Own
  `AGENTS.md`.
- `docs/` — everything else; `docs/README.md` is the index.

## Boundaries

**Always, without asking:**

- run `make check` before calling a change done, and read the render count;
- move a test in the same commit as the code it protects;
- update that connector's doc under `docs/sources/` in the same commit as any
  change to `pipeline/src/vyarno_pipeline/sources/*`;
- write new user-facing copy in **both** languages — a missing string renders
  as a blank line, not a fallback;
- write down the *why*, in the comment or the commit message. This codebase
  comments the reasoning rather than the mechanics, and that is deliberate: a
  rule with no failure attached is one somebody will reasonably decide to relax.

**Ask first:**

- adding a dependency to either toolchain. `site/package.json` declares **no
  `dependencies` at all** — three devDependencies build the app and the rest
  lint, type-check or drive a browser; no package reaches the reader, and the
  test suites run on `node:test` and pytest. The only file a reader's browser
  fetches from another origin is the visit counter in
  `site/src/lib/analytics.js`, and the CSP's origin list is closed at two;
- adding an upstream data source, or retargeting an existing one;
- changing a published JSON's schema, or what `data/published/` contains;
- anything that changes a number a reader sees.

**Never:**

- **never widen a validation tolerance, delete an assertion or skip a test to
  make something pass.** If a gate trips on real data the cause is upstream
  (`docs/validation-gates.md`);
- **never describe the figures in `data/published/` as openly licensed.** The
  code is Apache-2.0; the data belongs to five publishers under their own terms
  and is not ours to license (`docs/legal.md`);
- **never shorten the upstream attribution in the site footer.** «Данни от
  Евростат / ЕЦБ / НСИ / БНБ / имот.bg» is a licence condition of several of
  those publishers, not decoration;
- **never move a personal-figure calculation server-side.** Salary, rent,
  savings and basket are computed in `mirror.js`, in the reader's own tab, and
  posted nowhere;
- **never attach a benefit to a donation** — no supporter tier, no badge, no
  early access. Anything given in return makes the service възмездна and flips
  `LEGAL_FORM.takesPayment` for the whole site, with nobody having decided to
  sell anything. Selling a product is a separate and open decision;
  `docs/principles.md` §"Charging for something" is what it costs, not an
  argument against it;
- **never invent a legal, registration or organisational fact**, and never add a
  badge or a metric that nothing measures;
- **never write a comment or a doc paragraph that describes an earlier version
  of the code.** This repository publishes without its history, so a reader has
  no commit to look the story up in (`docs/writing-style.md` §"Write the
  constraint, never the diff");
- **never feed the annuity anything but the AAR.** The APRC is for comparing,
  and the outstanding-stock rate answers a third question (`docs/math.md`);
- **never loosen the 30%-of-net affordability line.** It is deliberately
  stricter than the 50% БНБ permits.

## Workflow

**The ordered steps live in one place**: `docs/data-sources.md` §"Checklist for
adding a connector" for a new source, and §"The other recurring moves" beside it
for a formula, the wiring, the chrome, an upstream and a release window. Each
row says which steps a test catches and which are on you.

What those tables cannot tell you, and an agent gets wrong:

- **A data source is two halves.** Everything up to the committed payload can be
  run and reviewed without opening the site, and it leaves a file that is gated,
  attributed and read by nothing. The manifest row and the `view/` module are
  the other half.
- **Net salary has its own suite.** The property test that a reported gross pays
  back the net it was asked for lives in `verify_net_salary.mjs`, so a payroll
  change landing in `verify_mirror_math.mjs` is a change nothing round-trips.
- **Which number feeds a formula is decided in `site/src/lib/view/`**, never in
  a `$derived` and never in `calculator.svelte.js`. `docs/site.md` §"A correct
  formula fed the wrong number" is why.
- **Refactoring means the suites are untouched.** If a test had to change it was
  not a refactor — say which behaviour moved.
- **A feature is checked against P1–P11 and the closed list in
  `docs/principles.md` first.** Several plausible ones are already ruled out,
  and the reason is never effort.

## Tests

**A test moves with the code it protects, in the same commit.** The standard it
has to meet: **break the production code on purpose and watch the test go red.**
A test that stays green protects nothing, however confidently it is named.

**Not every change earns a test.** Before writing one, ask whether a rule over
the whole collection already covers it: a new COPY key, a new payload row, a new
preset gets none, because the loop over all of them has it. A check that cannot
go red while a broader one stays green is not a second guard, it is a second
thing to update. `docs/testing-strategy.md` §"What does NOT get a test" is the
four questions and the two deliberate exceptions.

That section permits deleting a test that protects nothing, and the never above
still binds: what it forbids is deleting an assertion **to make something pass**.
A test retired because a broader check covers it goes in a commit naming what
still catches the failure.

## Writing

`docs/writing-style.md` is the one list — the tells table, the comment rules and
what an anti-slop pass must not strip. The short form:

- **Would a reviewer learn something from this sentence that the diff does not
  already tell them?** If no, cut it. **A doc is a map, not the territory**, and
  the smallest change that holds the constraint is the change.
- **Commit subject** — imperative, sentence case, ≤72 chars, no full stop; an
  area prefix (`site:`, `pipeline:`, `ci:`, `docs:`) only when the change is
  confined to one. **The body says why**: what was wrong, what you rejected and
  why, what you ran and its counts. No scaffolding headings, no file lists.
- **Comments say why, never the mechanics — in five lines or fewer, and never
  more lines than the code under them.** The reasoning lives in ONE place and
  everywhere else names it in a clause, because restated at four call sites it
  is four things to keep true and three go stale in silence.
- **Commit as the person, never as yourself.** Where `git config user.email`
  names an agent, stop and say so rather than committing. The `authorship` job
  rejects the agent identities either way.
- **No emoji, no self-attribution, no em-dashes in user-facing copy**, and none
  of the tells: binary contrast, throat-clearing, colon reveals, negative
  listing, a closing paragraph restating the one above it, or comprehensive /
  seamless / robust / leverage.
- Headings sentence case. Specific numbers over intensifiers. New user-facing
  copy in **both** languages, in the same commit.

## Where the detail lives

| You are about to… | Read |
|---|---|
| Understand the system | `docs/architecture.md` |
| Touch a connector or an upstream | `docs/data-sources.md` |
| Touch a formula or a published number | `docs/math.md` |
| Work out why a gate tripped | `docs/validation-gates.md` |
| Touch the SPA | `site/AGENTS.md`, then `docs/site.md` |
| Change a colour, a type step or a shared stylesheet | `docs/design.md` |
| Touch what a crawler reads | `docs/seo.md` |
| Touch the pipeline | `pipeline/AGENTS.md` |
| Write or move a test | `docs/testing-strategy.md` |
| Write a commit, a PR body, a comment or a doc | `docs/writing-style.md` |
| Propose or rule out a feature | `docs/principles.md` |
| Touch anything with a legal edge | `docs/legal.md` |
| Set up, run the pipeline live, or debug a run | `docs/local-development.md` |
| Explain the product in plain language | `docs/how-it-works.md` |

`docs/README.md` is the index. `CONTRIBUTING.md` is the human-facing version of
the same ground.
