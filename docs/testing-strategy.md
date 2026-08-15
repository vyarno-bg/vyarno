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
| `site/scripts/verify_plot.mjs` | `node:test` | The geometry every chart is drawn with — axis, ticks, coordinate mapping |
| `site/scripts/verify_view_*.mjs` | `node:test` | Every derived value — which number feeds which formula, one suite per `src/lib/view/` module (§"Which `view/` module a test belongs to") |
| `site/scripts/verify_copy.mjs` | `node:test` | Copy invariants, against the imported `COPY` object |
| `site/scripts/verify_payload_prose.mjs` | `node:test` | Claims retired for being false, across the payloads' prose, `src/` and the entry shells (§"The second case") |
| `site/scripts/verify_data_contracts.mjs` | `node:test` | `data.js` fallback chains and the shipped payloads |
| `site/scripts/verify_legal.mjs` | `node:test` | The legal documents, the ЗЕТ чл. 4 identity, the licence claim, upstream attribution |
| `site/scripts/verify_wiring.mjs` | `node:test` | Template wiring — which value the markup passes to which function |
| `site/scripts/verify_static_assets.mjs` | `node:test` | `robots.txt`, `llms.txt`, `security.txt`, the sitemap, the CSP, `_headers` |
| `site/scripts/verify_suites.mjs` | `node:test` | That `package.json` names every suite on disk — an omitted one runs never |
| `site/scripts/verify_docs_map.mjs` | `node:test` | That `docs/site.md`'s directory tree names the files that are there, both directions |
| `site/scripts/verify_render_*.mjs` | `node:test` + Playwright | The built page, in a browser, over one harness. `verify_render_prerender.mjs` is the exception the glob catches: it opens no browser, reading `dist/` off disk, because what a crawler is served is decided before any script runs |
| `site/scripts/verify_render_contrast.mjs` | `node:test` + Playwright | What ratio each piece of text is painted at once every ancestor `opacity` and every translucent layer is composited, and every control boundary against 1.4.11's 3:1 — the half of WCAG `verify_contrast.mjs` cannot reach from `tokens.css` |
| `verify_stores` · `verify_format` · `verify_template_safety` · `verify_contrast` · `verify_support` | `node:test` | Persistence, formatters, the `{@html}` invariants, WCAG ratios, the donation rules |

## No suite may get smaller

**Do not write a test count into a doc.** `site/scripts/check-test-floors.mjs`
holds the only counts in the repository, and they are **floors** rather than
exact totals: adding tests needs no bookkeeping, and a suite that shrank fails
the run.

That split keeps the half of the guard worth having. The failure worth catching
is an assertion deleted to make something pass, a file dropped from the runner's
argument list, or a suite that silently stopped running — the same rule
`AGENTS.md` states and nothing enforced. A count going up is somebody doing
their job.

The counts come from the reports the suites already write — a TAP reporter
beside the live one, and pytest's junit-xml — so nothing runs twice and the
number is the runner's own. **A missing report fails too**, and that is not the
same as a count of zero: `npm run test:render` exits 0 having asserted nothing
when it finds no browser, which is exactly the run that must not pass.

**A skip does not count towards a floor**, in any of the three. Turning a test
into a skip deletes the assertion exactly as removing the test does, and it is
the version of that deletion nothing notices — so what each floor is checked
against is what the suite asserted, never how many tests it started. TAP's
`# pass` line is already that; junit-xml's `tests` attribute is the size of the
run, and `check-test-floors.mjs` takes the skips back off it.

`make check` reports the counts at the end; CI runs the same script directly,
per job, because its two jobs are separate runners with separate disks.

Lower a floor only in the same commit as the deletion that made it necessary,
and say in the commit message which tests went and why.

**A floor that has fallen more than a fifth behind the run fails as well**, and
is raised to the reported count in the commit that grew the suite. A rule for
lowering with no rule for raising moves in one direction only: every commit that
adds a test widens the gap, nothing narrows it, and a floor far enough below the
suite will pass a deletion of half of it. The band is the price of keeping
"adding tests needs no bookkeeping" true for the other four fifths of the time —
`check-test-floors.mjs` §"Floors, not exact counts" argues it against the two
alternatives.

`make check` runs all of it in CI's order and reports the three totals. **They
live in `check-test-floors.mjs` as floors and nowhere else as numbers** — a
per-file count in this table is one that goes stale the next time somebody adds
a test to that file, and twelve of them go stale twelve different ways. Read the
totals from the run you just did. A count that moved without you moving it is
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
| An axis, a tick or a coordinate in `plot.js` | `verify_plot.mjs` |
| A derived value in a `view/` module | `verify_view_<stem>.mjs`, the suite of the same stem — §"Which `view/` module a test belongs to" |
| A fallback chain in `data.js` | `verify_data_contracts.mjs` |
| A number or date the UI formats | `verify_format.mjs` |
| A UI string, or a rule about what a string may claim | `verify_copy.mjs` |
| Which value the template passes to a function | `verify_wiring.mjs` |
| Anything that has to be visible, positioned or coloured on the page | the `verify_render_*.mjs` suite for that region |
| A legal document, the identity, or the licence claim | `verify_legal.mjs` |
| Anything persisted to `localStorage` | `verify_stores.mjs` |

### Which `view/` module a test belongs to

The wiring layer is eleven modules and eleven suites, because the questions it answers
are not one question. Each row below is one subject, and the sentence beside it
is the whole of its remit — **on both sides of the pair**, so a function that
moves between modules moves its test with it.

| The subject | The module | The suite |
|---|---|---|
| Whether the figures on the page are still current | `view/freshness.js` | `verify_view_freshness.mjs` |
| The published divisions the basket is built from | `view/basket.js` | `verify_view_basket.mjs` |
| What the price rise is charged against | `view/spend.js` | `verify_view_spend.mjs` |
| What the results card claims | `view/results.js` | `verify_view_results.mjs` |
| What leaves the page when a reader shares it | `view/share.js` | `verify_view_share.mjs` |
| Where a household's pay stands once it is taxed | `view/payroll.js` | `verify_view_payroll.mjs` |
| What the job costs, and how much of that never arrives | `view/employer.js` | `verify_view_employer.mjs` |
| What is published about the област a reader picked | `view/region.js` | `verify_view_region.mjs` |
| What a home costs the reader buying one | `view/home.js` | `verify_view_home.mjs` |
| The figures `/how/` renders with nobody in them | `view/country.js` | `verify_view_country.mjs` |
| Which published field feeds which figure on `/market/` | `view/market.js` | `verify_view_market.mjs` |

A suite may CALL an export another suite owns — `verify_view_country.mjs` builds
fixtures through `region.js#regionQuarter`, `verify_view_spend.mjs` cross-checks
against `results.js#headlineRate` — and that is not a boundary failure. What the
table fixes is which suite each export is the subject OF, so there is one place
to add a case and one place to look for it.

**The fixtures are the seam.** Each suite opens the payloads its own subject
needs and builds its own shapes, which is what makes them separable at all;
`near` — the float comparator, which carries a tolerance — is the one thing they
share, and `scripts/near.mjs` says why it is not copied.

## When one suite file has become two

§"Would the failure message tell you which thing broke?" is the rule for
splitting a TEST. This is the rule for splitting a FILE, and the two answer
different failures: a file can be perfectly split into unambiguous tests and
still be unreviewable, and a file of two tests can be exactly the right shape at
five hundred lines.

**The question is whether you can say what the file is for in one sentence, and
whether that sentence needs an "and".** A file that is one subject is auditable
at nine hundred lines. A file that is five subjects is not at four hundred,
because a reviewer who cannot hold the whole remit cannot tell a guard that has
quietly stopped guarding from one that never guarded anything — which is the
failure this repository has already had, and the reason `verify_docs_map.mjs`
and `verify_suites.mjs` exist.

The tell that a section is its own subject is its FIXTURES. `verify_copy.mjs`
runs one rule — what a visible string may claim — over every surface on the
site, and every section of it reads the same imported `COPY`. That is a
catalogue, and a catalogue is audited entry by entry rather than front to back,
however long it is; `verify_mirror_math.mjs` is the same shape over the
formulas. A section that has to build its own payload shape, its own synthetic
quarters or its own limits object before it can assert anything is answering a
different question from its neighbours, and the fixture is the evidence.

**There is deliberately no gate on file length, and the reason is the one
[`writing-style.md`](./writing-style.md) §"Write the constraint, never the diff"
gives for having no gate on prose.** Any threshold is either set where the files
happen to sit, which certifies whatever is there on the day it is written, or
set lower, which fails a legitimately long file and earns an exemption list —
and an exemption list is the thing it was supposed to replace. Lines per test is
worse: it is the measurement §"Would the failure message tell you which thing
broke?" already rejects, and `verify_template_safety.mjs` and
`verify_render_contrast.mjs` are the standing counter-examples — a handful of
tests over several hundred lines, most of which are a scanner and the reasoning
behind it, each test naming every offending element in its failure. A
gate that is wrong even occasionally teaches a contributor to argue with the
tooling, and that costs more than the files it would catch.

What is checked instead is the part of this with no judgement in it, and it
already fires: `verify_docs_map.mjs` fails when a file in `site/scripts/` is not
named in `docs/site.md`'s tree. **The line you have to write there is the file's
subject**, so the review question has a trigger nobody can walk past. Read the
line back:

- if it needs an "and", the file is two files;
- if it restates a line already in the tree, one of the two is misnamed and some
  of the tests are in the wrong one;
- if you cannot write it without naming three payloads, the seam is where the
  payloads change.

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
   can see it**. That is what the `verify_render_*.mjs` suites are for.

Where a module exports the thing under test, the test **imports** it rather
than regexing it out of a file: `COPY`, `PRESETS`, `BG_CONTRIB_LINES`,
`PAYLOADS` and the published JSON are all read as values.

### Which suite owns which kind of check

| Kind | Lives in | How it checks |
|---|---|---|
| Copy and prose rules | `verify_copy.mjs` | Over all of `COPY`, including keys added next month |
| Layout and CSS properties | `verify_render_*.mjs` | The **effect** in a browser — a computed style, a bounding box — never the CSS declaration meant to cause it |
| Template wiring | `verify_wiring.mjs` | Source checks; there is nothing else to check them against |
| Licence and legal claims | `verify_legal.mjs` | Against the imported `legal.js` module |
| The `{@html}` contracts | `verify_template_safety.mjs` | Both directions — the expressions, and the values fed to them |
| The `loadAll` contract | `verify_data_contracts.mjs` | Reads `payloads.js#PAYLOADS` as the manifest it is, and calls `loadAll` per route with `fetch` stubbed |

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
the markup in the components beside it, and a mechanical extraction is provable by
capturing the built page across interaction states and diffing the rendered
markup. If the argument comes back it will be for a new reason, and that reason
belongs here.

### Why source checks are normal here, and where the line actually falls

**Reading a template as text is normal here, not an exception.** `verify_wiring.mjs`
is the suite that does it most; `verify_copy.mjs`, `verify_legal.mjs`,
`verify_support.mjs`, `verify_contrast.mjs`, `verify_static_assets.mjs`,
`verify_payload_prose.mjs` and `verify_template_safety.mjs` all do it too, each
for a claim no runtime assertion can reach.

The rule they are all keeping is the one stated above, and it is narrower than
"do not read source": **never assert RENDERED BEHAVIOUR by grepping templates.**
What you may not do is grep for the cause of something a reader sees. What you
may do is assert a fact about the source, when the source is the only place
that fact exists.

Which side a check falls on is decided by what it asserts, not by what it opens:

| The check asserts | Where it goes |
|---|---|
| Something a reader can see happen — a position, a computed style, a mounted page, a figure in the DOM | a `verify_render_*.mjs` suite, in a browser. No exceptions |
| A fact that exists only in the source — which argument a template passes, which expression feeds `{@html}`, whether a COPY key has a render site, whether a component names the licence paragraph | The suite that owns it, reading the file |

Two conditions make the second column survivable, and a source-reading suite
that breaks either is the failure mode rather than the guard:

1. **Blank comments before scanning.** A comment describing a bug must never
   satisfy the test for its fix — §"The standard a test has to meet" names the
   case. This is easy to get subtly wrong: blanking whole-line `//` comments
   works line by line, so it has to run on the file before any whitespace pass
   collapses the line breaks.
2. **Match on token sequence, never on layout.** Whitespace is collapsed first,
   so a formatter run cannot fail a test that no behaviour change would.

A wrong wiring is not a wrong formula and not a wrong string. `mirror.js` can be
perfect, `content.js` can be perfect, and the page can still print thirteen euro
figures the reader never typed, because the template handed `spendable` to a
function that wanted `spendBase`. The `verify_view_*.mjs` suites prove the
arithmetic and the render suites prove the page draws; neither can see which
argument the template passed.

The same goes for the architectural invariants — the basket iterates the
published payload rather than a frozen list. A DOM test would prove it better
(render two fixtures, assert the output follows) and would cost a fixture
harness. The loop check is the cheap proxy, and the file says so.

`verify_wiring.mjs` keeps the second condition above with `flat()`, which
collapses the whitespace out of a template before any pattern is matched
against it.

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
- **A name that claims more than the assertions check.** The name is what the
  next reader trusts and what a reviewer reads instead of the body, so a test
  called "the chip reads as a control, and not as a verdict" that measures only
  the border and the tap target is worse than one called neither: it retires the
  question. Read the title back against the assertion list before you commit,
  and either assert the second half or stop claiming it.

## What does NOT get a test

The section above says what a test has to do. This one says when a change needs
**none**, because without it every change here grows the suite by default —
which is how three hand-kept lists of COPY keys came to guard what one loop
already covered.

Four questions, in order. A "no" at any of them means write no test.

### 1. Is there already a rule over the collection this belongs to?

**A rule over a whole collection beats N assertions over a hand-typed subset of
it**, and adding a member to the collection then costs nothing.

The worked example is the alphabet rule in `verify_copy.mjs`: a Bulgarian string
is written in Cyrillic and an English one is not. It was asserted three times
over three hand-kept key lists — the tax wedge, the payslip rows, the country
page — each with its own exception list, covering 71 of the 319 bilingual `COPY`
entries between them. A key added to a section nobody listed was guarded by
none of them, silently, which is the failure mode of every subset test: it does
not go red, it goes absent.

Written once over `bilingualEntries()` it covers every one of them and needs **no
exception list at all** — strip `{placeholders}` first and the one key that was
exempted by name, a bare `{s} · {p}`, falls out of the rule instead of out of a
list. A hand list also buys less than it looks: it cannot catch a state added in
code with no string, because a missing key adds no name to the list either.

So: **a new COPY key, a new payload row, a new preset gets no test.** The loop
already has it. Reach for a named assertion only where the rule genuinely
differs for that member, and then write down what differs.

### 2. Would this go red while a broader check stays green?

If not, it is not a second guard — it is a second thing to update, and the pair
will drift.

`verify_copy.mjs` asserted per section that `COPY.wedgeK` and its fourteen
payslip siblings each appear in the source, while the global "no COPY key is
dead" check scanned every key in the tree. There is no edit that fails the
narrow one and passes the broad one. Strengthening the broad one — requiring the
`COPY.key` access form, and permitting a bare string only for the keys reached
by dynamic dispatch, which are exported arrays the test can import — retired all
three copies and covered more than they did.

**The exception is a claim somebody could be held to.** `verify_legal.mjs` and
`verify_support.mjs` may duplicate each other and anything else. A licence
condition, the ЗЕТ чл. 4 identity rows and the безвъзмездност of the service are
not covered by a guard, they are **evidenced** by one, and evidence is allowed
to be redundant. Do not thin either suite on the grounds in this section.

### 3. Does a reader lose something measurable if this is wrong?

This is the question for a design assertion — where a component sits relative to
another, what a chip's border says about its state. That class is the one most
likely to go red on a competent redesign for no correctness reason, and it is
also where some of the sharpest tests in the repository live. The two are told
apart by naming the reader who cannot do something:

| Earns its place | Does not |
|---|---|
| A phone-width layout that puts the only input the page is priced off five screens below the figures computed from it | Which of two orderings two visible, reachable blocks appear in |
| A live region scoped to the whole results card, so a slider tick re-announces eight ranked rows and a formula table | Which defensible colour a resting control is painted |
| A control measuring 14px, which is under any tap-target guidance | Whether a heading sits above or beside the thing it heads |
| A loaded state drawn identically to an unloaded one, so nothing says which is on | |

The test to apply: **imagine the redesign done competently, and ask what the
reader loses.** If the answer is nothing, the assertion is a vote, and a vote
that fails a build is how a contributor learns to edit tests without reading
them.

Two of these were checked by mutation rather than by argument. Painting the
loaded basket chip with the `--ink` fill goes red on the assertion its comment
names, so that test stays. Painting the resting disclosure chip in the verdict
colour its comment forbids left the suite green — the title claimed a rule
nothing asserted, which is the trap listed at the end of §"The standard a test
has to meet".

### 4. Would the failure message tell you which thing broke?

If yes, leave the test whole however long it is. **Split where a failure would
be ambiguous, never to raise a count.**

Lines per test is the wrong signal for this. `verify_template_safety.mjs` is a
handful of tests over a long file, and most of that file is the `{@html}`
scanner and the reasoning behind it — each test reports the offending
expression by name, so none of them is ambiguous and none should be split.
`test_published_contracts.py` is the same shape over the published payloads,
and so is `verify_render_contrast.mjs`: a very long file that is
almost all the compositing walk, each test reporting every failing element with
its selector, its text, the ratio it was painted at and the alpha that got it
there. Splitting either of those two would drive the page through another
browser to report less. A test earns a split when its failure says the results
card is wrong and leaves you to read the body to find out which of eight things
it meant.

### And these get no test at all

- **A refactor.** Behaviour-preserving means the suites are untouched. If a test
  had to change it was not a refactor — say so, and say which behaviour moved.
- **A copy edit that breaks no rule.** §"Is the core logic well covered?" has
  the line: assert on the rule, never on the sentence. A sentence rewritten for a
  good reason gets a rewritten sentence, not a test pinning the new one.
- **Prose in `docs/`.** Ruled out above, with the reason.
- **The shape of a sentence** — its length, its clause count, its reading
  level. `verify_copy.mjs` already splits the market page into sentences for the
  verdict rule, so a ceiling is one line away and is deliberately not there:
  `docs/writing-style.md` §"Sentence length is a review note" argues it, and
  says what a reviewer reads for instead. What a sentence *claims* is a
  different question with a different answer — §"When a prose test IS right"
  above has the case that earns a test, and what separates the two.
- **Whether an upstream still means what a sentence says it means.** The
  tempting guard is a connector-level assertion over a cube's own metadata, so a
  definition change upstream fails a refresh instead of quietly changing what the
  page means. It is ruled out on evidence rather than on effort:
  `prc_hpi_hsnq`'s unit label is «Number» and `prc_hpi_hsvq`'s is «Euro», so
  every claim the average deal rests on — the purchaser is a household, the price
  is a market price, the two cover one population — is nowhere in the response,
  and a guard over it would pass through exactly the failure it was written for
  while printing a green check beside "definitions verified".
  [`data-sources.md`](./data-sources.md) §"Why there is no gate on any of this"
  is the argument in full, including the three cubes that *do* carry their meaning
  in a label and why gating that third is worse than gating none. What replaces
  it is the dated read: the publisher's own sentence, quoted with its URL and the
  day it was read, in `data-sources.md` — the pattern
  [`legal.md`](./legal.md) uses for licence terms, and for the same reason.
- **A line the coverage report shows uncovered**, where the answer to "why not"
  is written down. `data.js`'s two `fetchJson` arms and the eight `_refresh_*`
  arms in `cli.py` that no end-to-end test drives are the two, and both entries
  below say what covering them would cost and what it would buy.

## Is the core logic well covered?

Yes, and it is the strongest part of the repository.

- `mirror.js` — the personal-inflation maths, the payroll model, the annuity,
  the percentile ladder — is covered by `verify_mirror_math.mjs` and
  `verify_net_salary.mjs`, both of which test behaviour against worked examples
  rather than shape.
- The pipeline's gates and transforms carry substantially more test than source,
  with real fixtures per upstream and `respx` for the HTTP paths.
  `test_validate.py` exercises the failure mode of each of the eight gates
  [`validation-gates.md`](./validation-gates.md) numbers, not just its happy
  path. Those eight are the HICP set and gate 8; the property-market, НСИ-housing
  and mortgage gates are numbered nowhere and are tested in `test_house_market.py`,
  `test_nsi_housing.py` and `test_mortgage.py` — so "the gate tests" is three
  files more than the name suggests.

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

### When a prose test IS right: the claim is about a payload field

There is one shape of copy assertion that earns its place every time, and
`verify_copy.mjs` §"the index's base year is never called the start of the
series" is the worked example. **The test is available because both halves of
the claim are in the payload.**

`house_market.price_index` carries a `base_year` and a series with its own
`from`. They are different fields and they are years apart: Eurostat set the
index to 100 at the base and publish it from a decade earlier. Copy that calls
the base "the year taken as the starting point" is therefore *false against the
payload beside it* — the chart draws ten years to the left of the year the words
call the beginning, and those early quarters sit UNDER the ×1 rule. Every digit
on the page stays correct while a reader is told the record does not go back
that far and is given no way to read a point below the reference line.

Nothing else could catch it, which is the test for whether a new assertion is a
second guard or a second thing to update. The "no prose freezes a period" rule
passes, because the year renders from a slot and the slot is right. The render
suite checks that every figure carries a source, and every one does. **What was
missing was any comparison between a claim about a series and the series.**

Contrast it with the ceiling on sentence length, which `docs/writing-style.md`
§"Sentence length is a review note" declines. That one fails on the
measurement: a page's "sentences" have to be recovered from `.l-bg` spans
interleaved with slots, headings and nav links, so the check invents offenders
nobody wrote. Here there is nothing to recover — `base_year` and `from` are two
JSON fields, and the only judgement is which words assert one is the other.

### The second case: a payload's prose and the page's, about one figure

`data/published/*.json` carries prose fields — `notes`, `method`, `disclaimer`,
`_role`, `note`, `rate_basis`, `currency_history`; `PROSE_KEYS` in the suite is
the list — all written by the pipeline to say
what an upstream measures, and **none of them rendered by the SPA**. So nobody
reads them in the normal course of things, and a sentence in one can go false
and stay false with every gate green. That happened: `transform.py` wrote
«'unoccupied' there means unoccupied on census night» into
`house_market_structure.json` and kept writing it after `/market/` had been
corrected to the usual-residence test the census applies. The page and the
payload contradicted each other inside one repository for a round.

**The general guard is not buildable, and it is worth being exact about why**,
because "prose cannot be tested" is the wrong reason and would rule out
§"When a prose test IS right" above. The obvious rule is "a payload's prose and
the page's sentence about the same figure must agree". Those are two free-text
paragraphs written for two different readers — one machine-facing and English,
one bilingual and addressed to somebody who did not come for the statistics —
and no rule decides whether two paragraphs make the same claim. Any check strong
enough to catch a real drift fails on every honest rewrite, which is the shape
this document rejects three times over: a guard that fires on legitimate text is
one somebody silences.

**A narrower one is buildable and it has teeth**, and the difference from the
upstream-definition guard below is that both halves are inside the repository.
`verify_payload_prose.mjs` holds a table of claims found false against a
publisher's own definition, and asserts none survives — in a payload's prose, in
`src/`, or in the static entry shells. Three things make it worth its place:

- **It goes red on both defects that actually shipped.** Restore the census-night
  sentence to the payload and test 1 fails; restore «празен фонд» to
  `market/index.html`'s `og:description` and test 2 does. Checked by mutation
  rather than by argument, per §"The standard a test has to meet".
- **It bans the construction, never the co-occurrence** — the rule §"When a
  prose test IS right" arrives at. A list of phrasings that MAKE a retired claim
  needs no exception list. A rule over words appearing near each other needs one
  immediately, and its first entry is the sentence written to correct the claim.
- **It reaches two surfaces nothing else does.** `verify_copy.mjs` walks `src/`,
  so the entry shells under `site/` and `site/en/` are outside its roots — which
  is exactly why «празен фонд» survived a sweep. Payload prose is outside every
  suite's roots entirely.

**What it does not catch, and nothing could.** Payload prose that has merely gone
stale in words nobody has banned: an upstream re-scopes a series, the page is
rewritten, the payload keeps a sentence now wrong in a phrasing no list
anticipated. That is the dated read's problem in a smaller box, and the read is
what answers it. The table grows by one entry per claim found false, which is
the standing rule's own exception — *a bug we actually shipped and could
plausibly reintroduce: keep the guard and name the bug.*

Two rules of thumb come out of it:

- **Ban the construction, not the co-occurrence.** A rule reading "a sentence
  naming the base year may not also contain a start-word" fires on the sentence
  written to say the base is *not* the start, and needs an exemption list to
  survive its own subject. A rule listing the phrasings that make the claim
  needs none, and reads honestly as the regression guard it is.
- **Pin the clarification that has one home.** The page says "yardstick, not a
  beginning" in more than one section, so asserting it page-wide is loose by
  design — any of them serves a reader who lands there. The sentence explaining
  why points sit below ×1 exists once, reads as spare prose next to a chart that
  looks self-explanatory, and is therefore the one an editor cuts. That one is
  asserted in both languages, and the mutation that removes either half goes
  red.

## Coverage, and what is deliberately not covered

`make coverage` measures both sides. **Neither number is a target and there is
no threshold gate.** A coverage percentage is a proxy, and a project that fails
a build on it starts writing tests that move the proxy. What the measurement is
for is the question a reviewer should be able to ask about any uncovered line —
*why not?* — and get an answer.

**JavaScript.** The layers that can produce a wrong number are effectively
complete: `src/lib/view/`, `mirror.js`, `legal.js` and `support.js` are at or near
100%. One real gap:

| File | Why |
|---|---|
| `data.js` | `fetchJson`'s success return and its warn-and-return-null catch arm, which is the whole of what the coverage run reports uncovered. `verify_data_contracts.mjs` covers the fallback chains — the part that can pick a wrong number — with `fetch` stubbed. Covering the two remaining arms means a stub asserting that `fetch` was called, which tests the mock. The real coverage of them is the render suites, which load the page and make it fetch |

**Python.** Everything below the CLI is high and none of it is the gap: gates,
transforms, connectors, models. What is left is `cli.py`'s ten `_refresh_*` arms — fetch, transform,
validate, write, print — of which two are driven end to end through `respx`
against real trimmed cubes and eight are not. Ten arms write twelve payloads —
`_refresh_hicp` publishes the headline and the categories, `_refresh_house_market`
the market and its structure — so the twelve in `data/published/` counts files
and never arms.

That is the honest gap, and it is deliberate. Covering the other eight means eight
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
`--source all`. That ships a panel where eleven payloads are current and the
twelfth is months old, and the staleness banner only catches it after it has
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
without a browser is not blocked. **Read the count, not the exit code**: a file
of skips exits 0 and looks exactly like a file of passes. `make render` gates on the
resolver and fails instead, which is why `make check` is the run to trust
before opening a change.

`make check` is a convenience, not a second source of truth — CI is the
authority on what green means, and every target in the `Makefile` is the command
CI runs, in CI's order.
