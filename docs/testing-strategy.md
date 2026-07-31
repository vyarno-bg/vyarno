# Testing strategy

Which suite a test belongs in, and why the answer is what it is.

The short version: **each language's behaviour is tested by its own runner, and
pytest keeps the artefacts the pipeline produces.** Everything below is the
reasoning behind that sentence, and the places where it is deliberately not
followed.

## Tests move with the code — the standing rule

**A test is maintained in lockstep with the thing it protects. When you add,
change or delete a feature or a data contract, you add, change or delete its
test in the SAME commit.**

Tests are the only thing standing between a wrong inflation, salary or mortgage
number and a person making a decision with it. A test that does not actually
test that — or that tests something we deleted — is worse than no test: it is a
green light that lies, and the next reader will trust it.

Applied to a change:

1. **New feature, new data contract, new published field** → it ships with a
   test that fails without it. "Tests in a follow-up" is how the untested thing
   becomes permanent.
2. **Changed behaviour** → update the assertion to the new truth in the same
   commit. Never widen a tolerance, delete an assertion or skip a test to make a
   suite green. If the old assertion was genuinely wrong, say so in the test's
   docstring.
3. **Deleted feature, symbol, COPY key or dataset** → delete its test in the
   same commit. Do not leave a guard that pins the absence of something nobody
   remembers; that is archaeology, and it costs a reader's attention on every
   pass. The exception is a bug we actually shipped and could plausibly
   reintroduce — keep the guard and name the bug in the docstring.
4. **Deleted or renamed production symbol** → grep the tests before you commit.
   A test that keeps a dead export alive is the tail wagging the dog; delete
   both.

Which suite the test belongs in is §"Where a test belongs" below; what it has
to do to count is §"The standard a test has to meet".

## The suites

| Suite | Runner | What it holds |
|---|---|---|
| `pipeline/tests/test_*.py` | pytest | Connectors, transforms, publish gates, the models, the CLI |
| `pipeline/tests/test_published_contracts.py` | pytest | The JSON committed under `data/published/`, re-checked offline |
| `site/scripts/verify_mirror_math.mjs` · `verify_net_salary.mjs` | `node:test` | Every formula, against worked examples |
| `site/scripts/verify_view.mjs` | `node:test` | Every derived value — which number feeds which formula |
| `site/scripts/verify_copy.mjs` | `node:test` | Copy invariants, against the imported `COPY` object |
| `site/scripts/verify_data_contracts.mjs` | `node:test` | `data.js` fallback chains and the shipped payloads |
| `site/scripts/verify_legal.mjs` | `node:test` | The legal documents, the ЗЕТ чл. 4 identity, the licence claim, upstream attribution |
| `site/scripts/verify_wiring.mjs` | `node:test` | Template wiring — which value the markup passes to which function |
| `site/scripts/verify_static_assets.mjs` | `node:test` | `robots.txt`, `security.txt`, the sitemap, the CSP, `_headers` |
| `site/scripts/verify_render.mjs` | `node:test` + Playwright | The built page, in a browser |
| `verify_stores` · `verify_format` · `verify_template_safety` · `verify_contrast` · `verify_support` | `node:test` | Persistence, formatters, the `{@html}` invariants, WCAG ratios, the donation rules |

`make check` runs all of it in CI's order. **The three totals live in
[`AGENTS.md`](../AGENTS.md) §Commands and nowhere else.** A per-file count in
this table is a number that goes stale the next time somebody adds a test to
that file, and twelve of them go stale twelve different ways — read the totals
from the run you just did instead. A count that moved without you moving it is
still a finding.

**Every suite above tests behaviour, and that is the line.** A test here fails
because a number is wrong, a contract is broken, a template passes the wrong
value or the page does not render. None of them fails because of how a sentence
is phrased.

`docs/writing-style.md` §"Write the constraint, never the diff" is a rule about
phrasing and it has no suite, deliberately. A regex over prose cannot tell a
comment narrating the repository's edit history from one describing a build
artefact that holds code the tree does not — so the check that scanned for
`used to` and `no longer` failed on sentences that broke no rule. A style gate
that is occasionally wrong trains a contributor to argue with the tooling, and
that costs more than the comments it catches. Style is what review is for.

**`docs/` is outside its roots, and that is a decision rather than an
oversight.** The scanner works because a code comment has one job and a
changelog is visibly not it. A markdown file is prose end to end, and the same
phrases carry their weight there: `docs/data-sources.md` describes an upstream
whose publication regime changed, `docs/site.md` describes a cache serving
assets that no longer exist, `docs/validation-gates.md` describes a column no
longer being where it was read. Pointing the scanner at prose would fire on
every one of those, and a guard that fires on legitimate text is one somebody
silences — the failure mode `verify_legal.mjs` names when it checks that the
commercial-signals tripwire does not fire on the copy denying a sale. The rule
still binds in `docs/`; what enforces it there is review, so a reviewer should
expect to catch it by hand. It is the most common defect this repository's
documentation actually has.

## Where a test belongs

| What you changed | Where its test lives |
|---|---|
| A connector (`sources/*.py`) | `test_<source>.py` + a `live` probe in `test_live_upstreams.py` |
| A transform or a gate | `test_transform.py` / `test_validate.py` / `test_mortgage.py` |
| A CLI arm or an exit code | `test_cli*.py` |
| A published-JSON field | `test_published_contracts.py`, and `verify_data_contracts.mjs` if the SPA reads it |
| A formula in `mirror.js` | `verify_mirror_math.mjs` (or `verify_net_salary.mjs` for payroll) |
| A derived value in `view.js` | `verify_view.mjs` |
| A fallback chain in `data.js` | `verify_data_contracts.mjs` |
| A number or date the UI formats | `verify_format.mjs` |
| A UI string, or a rule about what a string may claim | `verify_copy.mjs` |
| Which value the template passes to a function | `verify_wiring.mjs` |
| Anything that has to be visible, positioned or coloured on the page | `verify_render.mjs` |
| A legal document, the identity, or the licence claim | `verify_legal.mjs` |
| Anything persisted to `localStorage` | `verify_stores.mjs` |

## Why the layout is what it is

### Published artefacts are pytest's

`data/published/*.json` is the pipeline's output. Asserting on it from the
pipeline's own runner, offline, against the files actually committed, catches
the operational half the gates cannot see: a refresh that ran but was never
committed, a payload hand-edited after its gate passed, a schema that drifted
from what `publish.py` promises. Every gate in `validate.py` runs against live
upstream rows and is gone by the time anyone reviews a diff.

### Everything about the SPA is Node's

Two rules, and both of them are about not reading one language's source as text
from another:

1. **Never parse `content.js` from Python by regex.** Pulling
   `key: { bg: "…", en: "…" }` out of a JavaScript module with a regex and
   unescaping the matches by hand works until a string contains a brace, a
   nested quote or a template literal — and it can only ever check the keys
   somebody remembered to name in a test. Node can `import { COPY }` and check
   every key there is.

2. **Never assert rendered behaviour by grepping templates.** A grep pinned to
   line wrapping or quote style fails on a formatter run that changed no
   behaviour, and passes through the failures it was written to prevent. The
   one that matters: a keyed `{#each}` whose key expression names a field the
   rows do not have evaluates every key to `undefined`, which Svelte rejects at
   runtime — the page renders blank and **no suite that does not run the app
   can see it**. That is what `verify_render.mjs` is for.

Where a module exports the thing under test, the test **imports** it rather
than regexing it out of a file: `COPY`, `PRESETS`, `BG_CONTRIB_LINES`,
`PAYLOADS` and the published JSON are all read as values.

### Which suite owns which kind of check

| Kind | Lives in | How it checks |
|---|---|---|
| Copy and prose rules | `verify_copy.mjs` | Over all of `COPY`, including keys added next month |
| Layout and CSS properties | `verify_render.mjs` | The **effect** in a browser — a computed style, a bounding box — never the CSS declaration meant to cause it |
| Template wiring | `verify_wiring.mjs` | Source checks; there is nothing else to check them against |
| Licence and legal claims | `verify_legal.mjs` | Against the imported `legal.js` module |
| The `{@html}` contracts | `verify_template_safety.mjs` | Both directions — the expressions, and the values fed to them |
| The `loadAll` contract | `verify_data_contracts.mjs` | Reads `payloads.js#PAYLOADS` as the manifest it is, and calls `loadAll` with `fetch` stubbed |

**Layout is asserted as an effect, never as a cause.** `.stats { flex-wrap:
wrap }` is a grep for the cause; "no row of the strip stops short of the
others" is the effect, and it survives someone achieving the same layout with
`grid`. Likewise the sparkline: banning `preserveAspectRatio="none"` is a grep;
measuring every SVG's rendered box against its `viewBox` and failing when the
two axes scale differently is the property.

### Why not vitest and jsdom

It is the conventional answer and it would work. The repository ships **zero
test-framework dependencies** — pytest and Node's built-in runner — and adding
vitest, jsdom and testing-library to get assertions a real browser gives
directly is a poor trade for a project this size. Playwright was already a
dependency and now has a job.

Component tests in isolation are the argument that would change this answer.
They are not needed today: the state lives in `$lib/calculator.svelte.js` and
the markup in nineteen components, and a mechanical extraction is provable by
capturing the built page across interaction states and diffing the rendered
markup. If the argument comes back it will be for a new reason, and that reason
belongs here.

### Why the wiring tests stay source checks

`verify_wiring.mjs` reads templates as text, which the rule above forbids. It
is the one exception, for one reason: there is nothing else to check these
against.

A wrong wiring is not a wrong formula and not a wrong string. `mirror.js` can be
perfect, `content.js` can be perfect, and the page can still print thirteen euro
figures the reader never typed, because the template handed `spendable` to a
function that wanted `spendBase`. `verify_view.mjs` proves the arithmetic and
`verify_render.mjs` proves the page draws; neither can see which argument the
template passed.

The same goes for the architectural invariants — the basket iterates the
published payload rather than a frozen list. A DOM test would prove it better
(render two fixtures, assert the output follows) and would cost a fixture
harness. The loop check is the cheap proxy, and the file says so.

What makes them survivable is that they match on **token sequence, never on
layout**: `flat()` collapses whitespace, so a formatter run cannot fail a test
that no behaviour change would.

## The standard a test has to meet

**Break the production code on purpose and watch the test go red.** If it stays
green it protects nothing, no matter how confidently its name reads. This is
cheap: change the constant, invert the comparison, delete the guard clause, run
the suite, put it back.

Related traps, each of which has bitten here:

- **A test that re-implements the code it tests.** If it carries its own copy of
  the regex, the formula or the encoding, it will pass whatever the connector
  does. Call the production function.
- **A "contract" test that passes with the feature removed.** A parity check
  that restates both sides cannot catch either drifting. The payroll parity
  check reads `mirror.js` itself for exactly this reason.
- **Assertions on comments.** Scan live lines, never prose. The explainer band
  carries a comment naming the exact literals it must not print; a scan that
  read comments would be satisfied by the warning instead of checking the code.
  Every source-reading suite here blanks comments first.
- **A check whose selector matches nothing.** A browser assertion that early-
  returns on a missing element is a green test for a deleted feature. Assert the
  element exists before asserting anything about it.

## Is the core logic well covered?

Yes, and it is the strongest part of the repository.

- `mirror.js` — the personal-inflation maths, the payroll model, the annuity,
  the percentile ladder — is covered by `verify_mirror_math.mjs` and
  `verify_net_salary.mjs`, both of which test behaviour against worked examples
  rather than shape.
- The pipeline's gates and transforms carry substantially more test than source,
  with real fixtures per upstream and `respx` for the HTTP paths.
  `test_validate.py` exercises every gate's failure mode, not just its happy
  path.

The thing at risk of being over-tested is never the maths. It is the prose,
because a copy assertion is the easiest test in the repository to write: pin
the sentence and it goes green. Some of that is legitimate — the licence claim
and the "describes, never advises" rule are commitments, and a commitment
deserves a test. Most of it is wording that can change tomorrow for a good
reason and would then fail for no reason, teaching everyone to edit the test
without reading it. **The line: assert on the rule, never on the sentence.**
Where a rule is really "this word must not appear", write it as a regex over
the imported string; where it is "this sentence must say X", it is usually a
commitment or it is nothing.

## Coverage, and what is deliberately not covered

`make coverage` measures both sides. **Neither number is a target and there is
no threshold gate.** A coverage percentage is a proxy, and a project that fails
a build on it starts writing tests that move the proxy. What the measurement is
for is the question a reviewer should be able to ask about any uncovered line —
*why not?* — and get an answer.

**JavaScript.** The layers that can produce a wrong number are effectively
complete: `view.js`, `mirror.js`, `legal.js` and `support.js` are at or near
100%. Two real gaps:

| File | Why |
|---|---|
| `data.js` | The `fetch` wrappers. `verify_data_contracts.mjs` covers the fallback chains — the part that can pick a wrong number — but not the one-line loaders around them. Covering those means a fetch stub asserting that `fetch` was called, which tests the mock. The real coverage of this file is `verify_render.mjs`, which loads the page and makes it fetch |
| `format.js` | The `httpUrl`/`period` rejection branches, for input shapes the payloads cannot produce. They exist because `{@html}` is downstream of them, and they are guarded structurally by `verify_template_safety.mjs` rather than by example |

**Python.** Everything below the CLI is 89–100%: gates, transforms, connectors,
models. What is left is `cli.py`'s eight `_refresh_*` arms — fetch, transform,
validate, write, print — of which two are driven end to end through `respx`
against real trimmed cubes and six are not.

That is the honest gap, and it is deliberate. Covering the other six means six
more fixture sets built from live upstream responses, each of which then has to
be *maintained* against a publisher that restructures its output without
warning. The failure they would catch — a connector that breaks — is the failure
the pipeline is designed to make loud: the gates abort the run, nothing is
published, and the site keeps serving the previous figures with their real date.
A stale fixture, by contrast, is a test that passes while the connector is
broken, which is worse than the gap.

What *was* worth testing there is the dispatcher above those arms
(`test_cli_dispatch.py`): forty lines of pure branching, no network, guarding
one specific bug — a connector wired to `--source <name>` but missing from
`--source all`. That ships a panel where seven payloads are current and the
eighth is months old, and the staleness banner only catches it after it has
shipped. It
also documented a piece of dead code: `refresh()`'s `else: unknown source`
branch is unreachable through the CLI, because `--source`'s `click.Choice`
rejects a bad value first. It stays for direct calls from Python; do not delete
it to chase the line.

## Running everything

```sh
make check          # everything CI runs, in CI's order
make coverage       # both suites, measured
```

Or by hand:

```sh
cd pipeline && source .venv/bin/activate && pytest -q   # offline; -m live adds upstream probes
cd site && npm run lint && npm run check                 # eslint + prettier + svelte-check
cd site && npm run verify:math                           # maths, wiring, contracts, copy, contrast
cd site && npm run build && npm run test:render          # the built page, in a browser
```

`npm run test:render` needs a Chromium. `scripts/find-chromium.mjs` resolves
one — Playwright's own, anything under `PLAYWRIGHT_BROWSERS_PATH`, or a system
install — and proves it by launching it, because the case that bites is a
browser directory present at a revision Playwright does not expect.
`VYARNO_CHROMIUM` overrides the search.

Where nothing resolves the suite **skips rather than fails**, so a contributor
without a browser is not blocked. **Read the count, not the exit code**: 14
skipped exits 0 and looks exactly like a pass. `make render` gates on the
resolver and fails instead, which is why `make check` is the run to trust
before opening a change.

`make check` is a convenience, not a second source of truth — CI is the
authority on what green means, and every target in the `Makefile` is the command
CI runs, in CI's order.
