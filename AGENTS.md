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

This file is what an agent gets **wrong** without being told. Everything it
cannot infer from the code in front of it lives in `docs/`, and every section
below ends at the doc that carries the detail.

## Commands

```sh
make setup                                   # venv + npm, once after cloning
make check                                   # what CI runs, in CI's order
cd site && npm run check:all                 # the same run, without make
```

`make check` is `lint` → `test` → `render`, and it is strictly stricter than
CI rather than identical to it — two deliberate differences, both argued at the
top of the `Makefile`, both in the direction of local green implying CI green.

| Target | Runs |
|---|---|
| `lint` | `ruff check .` · `ruff format --check .` · `npm run lint` (eslint + prettier) · `npm run check` (svelte-check) |
| `test` | `pytest -q` in `pipeline/` · `npm run verify:math` in `site/` |
| `render` | `npm run build:release`, then `npm run test:render` — the built page in a real browser |

**`render` needs a Chromium, and `make check` fails without one** rather than
reporting green. `scripts/find-chromium.mjs` looks for Playwright's own
browser, anything under `PLAYWRIGHT_BROWSERS_PATH`, and the usual system
locations, so there is normally nothing to set; `VYARNO_CHROMIUM` overrides the
search. Where none resolves, `npx playwright install chromium` in `site/`.

Do not route around that gate. `test:render` on its own **skips and exits 0**
with no browser, and it is the only suite that runs the app — a template error
that renders the page blank is invisible to every other test in the repository,
so a green run without it proves less than it looks.

**Do not write a test count into a doc.** The run reports its own, and
`site/scripts/check-test-floors.mjs` holds the only counts in the repository —
floors rather than exact totals, so adding tests needs no bookkeeping and a
suite that SHRANK fails the run. Lower a floor only alongside the deletion that
made it necessary, and say in the commit message which tests went and why.

A floor more than a fifth below what the run reported **also** fails, and is
raised to that count in the commit that grew the suite. A floor far enough
behind guards nothing — it will pass a suite that lost half its tests.

`make help` lists the rest; `docs/local-development.md` is the long form.

## Layout

- `pipeline/` — Python 3.11 ingest: `sources/*.py` → `transform.py` →
  `validate.py` → `publish.py`, driven by `cli.py`. Has its own `AGENTS.md`.
- `data/published/` — eight JSON envelopes, **committed**. These are what the
  site fetches; the diff is the review.
- `site/` — Vite 8 + Svelte 5 SPA, five layers. Has its own `AGENTS.md`.
- `docs/` — everything else; `docs/README.md` is the index.

## Boundaries

**Always, without asking:**

- run `make check` before calling a change done, and read the render count —
  `site/scripts/check-test-floors.mjs` holds the floor it has to clear, and a
  count of 0 means the suite found no browser to run in;
- move a test in the same commit as the code it protects;
- update `docs/data-sources.md` in the same commit as any change to
  `pipeline/src/vyarno_pipeline/sources/*`;
- write new user-facing copy in **both** languages — a missing string renders
  as a blank line, not a fallback;
- write down the *why*, in the comment or the commit message. This codebase
  comments the reasoning rather than the mechanics, sometimes at length, and
  that is deliberate: a rule with no failure attached is one somebody will
  reasonably decide to relax.

**Ask first:**

- adding a dependency to either toolchain — `site/package.json` declares **no
  `dependencies` at all**: three devDependencies build the app (`svelte`,
  `@sveltejs/vite-plugin-svelte`, `vite`) and the rest lint it, type-check it
  or drive a browser. Nothing third-party reaches the reader, and the repo
  ships zero test-framework dependencies on purpose — the suites run on
  `node:test` and pytest;
- adding an upstream data source, or retargeting an existing one;
- changing a published JSON's schema, or what `data/published/` contains;
- anything that changes a number a reader sees.

**Never:**

- **never widen a validation tolerance, delete an assertion or skip a test to
  make something pass.** If a gate trips on real data the cause is upstream —
  `docs/validation-gates.md` says what each of the seven catches;
- **never describe the figures in `data/published/` as openly licensed.** The
  code is Apache-2.0; the data belongs to five publishers under their own terms
  and is not ours to license (`docs/legal.md`);
- **never shorten the upstream attribution in the site footer.** «Данни от
  Евростат / ЕЦБ / НСИ / БНБ / имот.bg» is a licence condition of several of
  those publishers, not decoration;
- **never move a personal-figure calculation server-side.** Salary, rent,
  savings and basket are computed in `mirror.js`, in the reader's own tab, and
  posted nowhere;
- **never add feature gating, a paid tier or donor benefits.** Anything given
  in return for a donation makes the service възмездна and flips
  `LEGAL_FORM.takesPayment` (`docs/principles.md`);
- **never invent a legal, registration or organisational fact**, and never add
  a badge or a metric that nothing measures;
- **never write a comment or a doc paragraph that describes an earlier version
  of the code.** This repository publishes without its history, so a reader has
  no commit to look the story up in — see §Writing below and
  `docs/writing-style.md` §"Write the constraint, never the diff";
- **never feed the annuity anything but the AAR.** The APRC is for comparing,
  and the outstanding-stock rate answers a third question (`docs/math.md`);
- **never loosen the 30%-of-net affordability line.** It is deliberately
  stricter than the 50% БНБ permits.

## Workflow — the moves that actually recur here

**Adding or changing a data source.** Follow the shape of the nearest existing
connector in `pipeline/src/vyarno_pipeline/sources/`, gate the new payload in
`validate.py`, and update `docs/data-sources.md` plus `docs/legal.md` — the
licence read, quoted verbatim and dated — **in the same commit**. Full
checklist: `docs/data-sources.md` §"Checklist for adding a connector".

**Changing a formula.** `docs/math.md` first — it is the provenance contract —
then `site/src/lib/mirror.js`, then a case in
`site/scripts/verify_mirror_math.mjs`.

**Changing which number feeds a formula.** `site/src/lib/view.js`, then
`site/scripts/verify_view.mjs`. Never inside a `$derived`, and that did not
relax when the reactive graph moved into `calculator.svelte.js`.
`docs/site.md` §"A correct formula fed the wrong number" is why.

**Refactoring.** Behaviour-preserving means the suites are untouched. If a test
had to change it was not a refactor — say so, and say which behaviour moved.

**Adding a feature.** Check it against P1–P11 and the closed list in
`docs/principles.md` first. Several plausible features are already ruled out
with their reasons, and the reason is never effort.

## Tests

**A test moves with the code it protects, in the same commit** — added, changed
or deleted. The standard it has to meet: **break the production code on purpose
and watch the test go red.** Change the constant, invert the comparison, delete
the guard clause, run the suite, put it back. A test that stays green protects
nothing, however confidently it is named. Read the title back against the
assertions too — a name claiming more than the body checks retires the question
for the next reader.

**Not every change earns a test, and assuming one does is how this suite grows
sideways.** Before writing one, ask whether a rule over the whole collection
already covers it: a new COPY key, a new payload row, a new preset gets none,
because the loop over all of them has it. A check that cannot go red while a
broader one stays green is not a second guard, it is a second thing to update.
`docs/testing-strategy.md` §"What does NOT get a test" is the four questions and
the worked examples, including the two places the rule deliberately does not
apply — `verify_legal.mjs` and `verify_support.mjs` may duplicate anything,
because a licence condition is evidenced rather than guarded.

**That section permits deleting a test that protects nothing. The never above
still binds**: what it forbids is deleting an assertion **to make something
pass**. A red test is never the reason. A test retired because a broader check
covers it goes in a commit that names what still catches the failure, and
lowers its floor in the same one if the count drops below it.

Which suite a test belongs in, and what is deliberately uncovered:
`docs/testing-strategy.md`.

## Writing — commits, pull requests, comments, docs

The standard is a senior engineer writing to a colleague who is going to read
the diff anyway. One test: **would a reviewer learn something from this sentence
that the diff does not already tell them?** If no, cut it.

- **Commit subject** — imperative, sentence case, ≤72 chars, no full stop; an
  area prefix (`site:`, `pipeline:`, `ci:`, `docs:`) only when the change is
  confined to one. **The body says why**: what was wrong before, what you
  rejected and why, what you ran and its counts. No `## Summary` scaffolding,
  and no bullet list of the file names — `git show --stat` does that.
- **Comments say why, never the mechanics.** Length is fine; this repository
  comments reasoning on purpose.
- **A comment states the constraint, never the diff.** `// it used to be 92
  days`, `// this line previously named ilc_di01` — no comment here describes
  an earlier version of this code. Nothing checks it, so it is on you and on
  review. You will break this while *editing*, because after
  a change the delta is the freshest thing in your head. Ask what the old
  version got wrong and write that as something the code has to keep doing;
  keep the numbers and the failure, drop the tense.
- **No emoji** anywhere — commits, headings, UI, code, PR bodies. Nothing in
  the tree has one. No self-attribution, no "as requested", no "successfully
  implemented X".
- **Commit as the person, never as yourself.** The author field records who is
  answerable for the change, and that is the human running the session. Where
  `git config user.email` names an agent, stop and say so rather than
  committing — a cloud container sets that itself and resets it every session,
  so it is theirs to fix, in the environment variables CI's error message
  names. The `authorship` job rejects the agent identities either way.
- **None of the tells**: binary contrast ("it's not X, it's Y"),
  throat-clearing, colon reveals, negative listing, a closing paragraph that
  restates the one above it, or comprehensive / seamless / robust / leverage.
- **Em-dashes stay.** They are how this repo attaches a reason to a claim, and
  a cleanup pass that strips them has flattened the voice, not cleaned it.
- **A PR body fills `.github/pull_request_template.md` and stops.** No per-file
  walkthrough — the Files tab is the walkthrough.
- Headings sentence case. Specific numbers over intensifiers. New user-facing
  copy in **both** languages, in the same commit.

`docs/writing-style.md` is the full list — the tells table, and what an
anti-slop pass must not strip.

## Where the detail lives

| You are about to… | Read |
|---|---|
| Understand the system | `docs/architecture.md` |
| Touch a connector or an upstream | `docs/data-sources.md` |
| Touch a formula or a published number | `docs/math.md` |
| Work out why a gate tripped | `docs/validation-gates.md` |
| Touch the SPA | `site/AGENTS.md`, then `docs/site.md` |
| Touch what a crawler reads — the prerendered shell, `robots.txt`, the head tags | `docs/seo.md` |
| Touch the pipeline | `pipeline/AGENTS.md` |
| Write or move a test | `docs/testing-strategy.md` |
| Write a commit, a PR body, a comment or a doc | `docs/writing-style.md` |
| Propose or rule out a feature | `docs/principles.md` |
| Touch anything with a legal edge | `docs/legal.md` |
| Set up, run the pipeline live, or debug a run | `docs/local-development.md` |
| Explain the product in plain language | `docs/how-it-works.md` |

`docs/README.md` is the index, and carries the reader all of this is for plus
the five properties every published number has to satisfy. `CONTRIBUTING.md` is
the human-facing version of the same ground.
