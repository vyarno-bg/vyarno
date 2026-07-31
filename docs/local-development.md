# Local development

## The short version

```bash
make setup      # the venv, both toolchains — once, after cloning
make check      # everything CI runs, in CI's order
make help       # the rest of the targets
```

`make check` is a convenience over the sections below, not a second source of
truth: every target is the command CI runs, in CI's order. If the two ever
disagree, CI is right. The rest of this page is what those targets do and how
to work when one of them fails.

## What has to be green

| Command | Where | What it holds |
|---|---|---|
| `ruff check . && ruff format --check .` | repo root | Python lint and layout, config in `ruff.toml`. Covers the pipeline, its tests, and the build-time scripts under `site/` |
| `pytest -q` | `pipeline/` | Connectors, transforms, gates, models, and the published-artefact contracts. `-m live` adds the upstream probes; they are excluded by default |
| `npm run lint` | `site/` | ESLint plus a Prettier check |
| `npm run check` | `site/` | svelte-check over `jsconfig.json` |
| `npm run verify:math` | `site/` | The SPA's maths, data contracts, copy rules, contrast and legal wiring |
| `npm run build` | `site/` | The production bundle. `build:release` adds the release-only checks |
| `npm run test:render` | `site/` | The built page, loaded in a browser. Needs `npm run build` first, and a Chromium — `node scripts/find-chromium.mjs` says which one it will use |

Two things follow from this list rather than from taste:

- **Do not fight the formatters.** Ruff owns Python layout, Prettier owns
  JS/Svelte/CSS/JSON/Markdown. Where a hand-aligned table genuinely reads better
  — the ECB SDMX dimension list, `COICOP_META` — the escape hatch is `# fmt: off`
  with the reason written above it, not a reformat that CI will undo.
- **A test must not assert on layout.** An assertion pinned to line wrapping or
  quote style goes red on a formatter run that broke nothing. Assert on what the
  code does; helpers exist for whitespace-insensitive matching where a source
  scan is genuinely the right tool
  ([`testing-strategy.md`](./testing-strategy.md) §"Why the wiring tests stay
  source checks").

`checkJs` is currently off in `site/jsconfig.json`. Turning it on surfaces a
few dozen errors — 76 across 14 files at the time of writing — mostly inference
noise around `$state({})` payload objects. It is a real follow-up, not a
decision that has been made against. Re-measure rather than quoting that
figure back:

```sh
cd site && sed -i 's/"checkJs": false/"checkJs": true/' jsconfig.json \
  && npx svelte-check --output human | tail -1
```

## Working-tree hygiene

| Path | Action |
|---|---|
| `.venv/`, `__pycache__/`, `.pytest_cache/`, `site/node_modules/` | Gitignored. Never stage |
| `data/published/*.json` and `*.json.baseline` | **Include.** The versioned snapshot the SPA fetches, plus the drift-check baseline |
| `site/.sourcemaps/` | Gitignored, and it is the full front-end source. Keep it that way — [`site.md`](./site.md) §"Source maps stay out of the deploy artefact" |
| Per-IDE config, local creds, scratch output | Never commit |

## Branches, CI and pushing

**`main` is the only long-lived branch. It is what gets deployed.** Work happens
on a short-lived branch, merges into `main`, and is deleted.

**CI runs on every push to every branch** (`.github/workflows/ci.yml`):
`pytest -q`, `npm run verify:math`, `npm run build`, plus a check that all eight
published payloads parse. So a working branch is proven before the merge, and
`main` is re-checked after it. Branch protection is the repository-settings
half of this: it cannot be committed, so it is configured on the host rather
than described here.

**Pushing.** Local commits are always fine. A push to `main` is a deploy trigger
once hosting is wired, so push when the three suites are green — use a working
branch to park work in progress.

## First-time setup

```bash
cd pipeline
python3 -m venv .venv            # PEP 668: use a venv, not system pip
source .venv/bin/activate
pip install -r requirements-dev.txt && pip install -e . --no-deps

pytest -q
vyarno-pipeline --help
```

Expected: a green suite with the `live` probes deselected, and the CLI help.

`pytest: command not found` means the venv is not activated.
`externally-managed-environment` means you are `pip install`ing outside it.

```bash
cd site
npm install                      # once after clone
npm run dev                      # http://localhost:5173, hot reload
```

### On Windows

Two differences, both mechanical. A virtualenv puts its executables in
`Scripts\` rather than `bin/`, and `python3` is a Microsoft Store stub that
opens the Store instead of running anything — the interpreter is `python`. The
Makefile knows both and switches on `OS`, so `make setup` and `make check` work
under Git Bash, MSYS2 and WSL. GNU Make is not part of a Windows install, so
without one of those, run the commands themselves. In PowerShell:

```powershell
cd pipeline
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pip install -e . --no-deps
pytest -q

cd ..\site
npm install
npm run dev
```

`Activate.ps1 cannot be loaded because running scripts is disabled on this
system` is PowerShell's execution policy rather than a broken venv. Either
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use
`.\.venv\Scripts\activate.bat` from `cmd.exe`, which the policy does not cover.

`make check`, by hand, from the repository root with the venv active:

```powershell
ruff check .
ruff format --check .
cd pipeline ; pytest -q          # 288
cd ..\site
npm run lint
npm run check
npm run verify:math              # 315
npm run build:release
npm run test:render              # 15
```

Read the last number. With no browser that suite skips and still exits 0, so
`npx playwright install chromium` in `site\` is what turns a green 0 into a
green 15. `node scripts/find-chromium.mjs` will also take a Chrome or an Edge
already installed under `%ProgramFiles%` or `%LOCALAPPDATA%`.

Six things in the repository make that block work, and each is load-bearing
rather than tidy:

- **`.gitattributes` checks every text file out as LF.** Git for Windows
  defaults to `core.autocrlf=true`, and CRLF fails `prettier --check` and
  `ruff format --check` on every file in the tree at once — a formatting error
  reported against code the contributor never opened.
- **`colorama` and `tzdata` are declared in `pyproject.toml` with no platform
  marker**, so pip-compile keeps them on every platform. Both are Windows-only
  needs — click and pytest want colorama, and `clock.py` cannot open
  `ZoneInfo("Europe/Sofia")` without tzdata because Windows ships no system tz
  database — and pip-compile drops a Windows-only dependency when it runs on
  Linux. A lock with hashes then makes pip refuse the whole install over the
  package it cannot verify, and a missing tzdata turns every import of `clock`
  into a collection error.
- **`build:release` goes through `scripts/release-build.mjs`.** Setting an
  environment variable by prefixing the command is POSIX shell syntax; cmd.exe
  reads it as the name of a program.
- **`check-identity.mjs` and `verify_support.mjs` wrap their dynamic imports in
  `pathToFileURL`.** `await import()` takes a URL. A POSIX absolute path happens
  to be one the loader accepts; `C:\…` is not, and it raises
  `ERR_UNSUPPORTED_ESM_URL_SCHEME` — so the release guard and the donation guard
  both refuse to start rather than reporting anything.
- **`strip-sourcemaps.mjs` collapses `path.sep`, not `"/"`.** `relative()`
  returns native separators, so a POSIX-only replacement leaves a backslash in
  the destination and `rename` looks for a directory nobody created.
- **Every file read and write states its encoding, and the writes state their
  newline.** Text mode follows the locale — cp1252 or cp1251 on a Windows box,
  which turns the UTF-8 Eurostat cubes into a `UnicodeDecodeError` on read and
  the Cyrillic labels into mojibake on write — and it translates `"\n"` to
  `os.linesep`, so `publish.write_payload` without `newline="\n"` rewrites all
  eight payloads CRLF. That last one hides: `.gitattributes` normalises them
  back on commit, so the repository stays clean while the working tree does
  not, and what reads the working tree before git does — `copy-data.mjs`
  filling `dist/`, any byte comparison against the previous publish — sees a
  difference the diff never shows.

The `windows` job in CI runs that block on every push. It is there because all
six of those are the kind of thing that only breaks on a platform nobody tests,
and a Linux-only CI cannot contradict a Linux-only assumption.

One thing it does not pin: the interpreter. CI runs 3.11 and `pyproject.toml`
asks for 3.11 or newer, so a local 3.13 or 3.14 is fine and is not what CI
resolved the lock against. If a pin behaves differently there, reproduce on
3.11 before concluding the pin is wrong.

## Updating dependencies

Both ecosystems are locked, and Dependabot opens one grouped pull request per
ecosystem per month (`.github/dependabot.yml`, which carries the reasoning).

**Python** — `pyproject.toml` declares the allowed ranges; `requirements.txt`
(runtime) and `requirements-dev.txt` (runtime + dev) record what was actually
resolved, every transitive package pinned with a hash. Change a range, then:

```bash
make lock                        # regenerates both, from pyproject.toml
make setup                       # install the new pins
make check
```

Review the lock diff like any other diff — it is the thing CI and every
contributor installs.

`make lock` builds a throwaway venv holding `pip<25`, because pip-compile 7.6.0
reads pip's internals and breaks against pip 26 with `cannot import name
'stdlib_pkgs'`. Installing from the lock is unaffected on any pip; only
generating it needs the older one, and Dependabot runs its own.

**Node** — `package.json` ranges, `package-lock.json` the resolution. `npm
install` after editing a range, then `make check`.

**TypeScript majors are held back** on purpose: `svelte-check` declares
`peer typescript "^5.0.0 || ^6.0.0"`, so TS 7 cannot resolve at all. Check with
`npm view svelte-check peerDependencies.typescript`; when it widens, lift the
`ignore` in `dependabot.yml` and take TS 7 in its own pull request.

**GitHub Actions are pinned to commit SHAs**, with the version in a trailing
comment. Never hand-edit a SHA — read the real one from GitHub, or let
Dependabot rewrite the pin and its comment together.

## Running the tests

```bash
cd pipeline && source .venv/bin/activate
pytest -q                          # all tests, summary
pytest -v                          # one line per test
pytest tests/test_transform.py     # one file
pytest tests/test_transform.py::test_rebase_index_to_2020_simple
pytest -x                          # stop on first failure
pytest --tb=short                  # shorter tracebacks
```

The default run is **offline and deterministic**: mocked HTTP (respx) plus
committed fixtures, ~10 s, no network. A gate that needs the internet is not a
gate.

Fixtures live in `tests/fixtures/`: Eurostat cube snapshots, the recorded ЕЦБ
MIR responses (`ecb_mir_bg_*.json`), the real БНБ workbook
(`bnb_housing_loans_oa_hh_bg.xlsx`) and an имот.bg page sample
(`imot_sredni_ceni_sample.html`, windows-1251).

### The `live` probes

`tests/test_live_upstreams.py` hits the real Eurostat / ЕЦБ / НСИ / БНБ /
имот.bg endpoints through the actual connectors. **Excluded from the default
run** (`addopts = -m 'not live'` in `pyproject.toml`):

```bash
pytest -m live -q                  # probe every upstream (~20 s)
pytest -m live -q -rs              # ...and show why any were skipped
```

They assert on shape and plausibility, never on this month's value. Fixtures pin
the parser; these pin the premise. An upstream this machine cannot reach reports
SKIP with the reason (имот.bg 403s datacenter IPs; БНБ omits a TLS
intermediate) rather than a misleading failure.

### The site's tests

```bash
cd site
npm run verify:math
```

Fourteen files under Node's built-in test runner, no dependencies. The list is
`package.json`'s `verify:math` script, in its order:

- `verify_format.mjs` — the number and date formatters, including the
  rejection branches that keep a bad value out of `{@html}`.
- `verify_net_salary.mjs` — gross↔net payroll: the cap, the flat tax, the
  inverse round-trip.
- `verify_mirror_math.mjs` — the rest of `mirror.js`: the anchor contract,
  personal vs official inflation, the real-wage division, the percentile
  direction, annuity and its inverse, savings erosion, the tax wedge.
- `verify_view.mjs` — **the wiring**: every derived value in `view.js`, i.e.
  which published number reaches which formula. Includes the two boundaries —
  the annuity gets the AAR and never the APRC, and the share text carries no €
  figure.
- `verify_stores.mjs` — the `localStorage` layer.
- `verify_contrast.mjs` — WCAG AA ratios for every ink × surface pair in both
  themes, computed from `tokens.css` itself.
- `verify_data_contracts.mjs` — `data.js`'s fallback chains, and the SPA's own
  math run over the JSON committed in `data/published/`.
- `verify_legal.mjs` — the legal documents, the ЗЕТ чл. 4 identity table, the
  licence claim scoped to the code, and the upstream attribution the footer
  owes.
- `verify_static_assets.mjs` — robots, security.txt, the sitemap and the exact
  CSP.
- `verify_support.mjs` — the donation rules: `FUNDING.yml` and `support.js`
  must agree, so a donate button cannot point at an account that does not
  exist.
- `verify_copy.mjs` — copy invariants over the imported `COPY` object. A
  sentence can be false while the arithmetic is right.
- `verify_template_safety.mjs` — the `{@html}` invariants.
- `verify_wiring.mjs` — which value the markup passes to which function.
- `verify_no_changelog_comments.mjs` — that no comment under `site/` or
  `pipeline/` describes an earlier version of the code. A prose rule gets a
  test because this is the one agents and people break most.

`verify_render.mjs` is the fifteenth and runs separately, under
`npm run test:render`, because it needs a browser.

All of them also run in CI on every push, alongside `pytest -q` and the
production build.

## Running the pipeline against live upstreams

```bash
cd pipeline && source .venv/bin/activate

# Full refresh — every connector, every gate, all 8 JSONs. ~10 s.
vyarno-pipeline refresh --source all --out ../data/published

# Or one at a time.
vyarno-pipeline refresh --source <name> --out ../data/published
```

**`--source` values:** `hicp`, `unemployment`, `mortgage`,
`sofia-price`, `sofia-salary`, `salary-dist`, `payroll`, `all`.

`--skip-link-check` skips **gate 6** (the published-URL body inspection — 52
calls). Use it only where outbound HTTP is genuinely blocked, and **never for
`--source hicp` in production**: it is the only check that the links we publish
still resolve, and those links are the "↗" the reader clicks.

**`--source mortgage` needs the БНБ TLS fix on a fresh machine** — see
[`data-sources.md`](./data-sources.md) §"TLS setup". Never disable verification.

A successful `--source hicp` run prints its fetches, then **every gate by name,
in order**, then the publish. **Six gate lines is the pass condition** — a run
that publishes with fewer has skipped one, usually via `--skip-link-check`. The
full transcript of a good run, and of a failing one, is in
[`validation-gates.md`](./validation-gates.md).

## Reading the output

```bash
python3 -m json.tool ../data/published/hicp_categories.json | head -40
jq '.categories[] | {code, name_bg, weight_pct, annual_rate_pct}' \
  ../data/published/hicp_categories.json
```

Two things to check by eye after a refresh: **`as_of` is today** (all eight should
match — one pipeline run), and **`latest_index` is on the 2020=100 base**,
because the SPA divides `latest_index / index_by_year[anchor]` and a 12-month
rate looks correct even when the base is wrong.

To decode an ND-cube by hand (`_cube_to_rows` in `sources/eurostat.py` is the
production version):

```python
import httpx

with httpx.Client(timeout=30.0) as c:
    r = c.get(
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_iw",
        params={"format": "JSON", "lang": "EN", "geo": "BG", "lastTimePeriod": 1},
    )
d = r.json()
dims, sizes = d["id"], d["size"]
cats = [{v: k for k, v in d["dimension"][x]["category"]["index"].items()} for x in dims]
for lin, v in d["value"].items():
    idxs, rem = [], int(lin)
    for size in reversed(sizes):
        idxs.insert(0, rem % size)
        rem //= size
    print(dict(zip(dims, [cats[i][idxs[i]] for i in range(len(dims))])), "=", v)
```

The per-upstream curl commands the connectors actually send are in
[`data-sources.md`](./data-sources.md) §"Query examples".

## Debugging a failed run

**A reconciliation gate.** Read the numbers the gate printed. A gap above the
tolerance almost always means upstream changed shape — fetch one code manually
and compare the response to `sources/eurostat.py::_cube_to_rows`. Check the time
anchor: categories and headline must both be at the headline's `ref_period`.
**Never widen the tolerance.**

**Coverage.** Check the row counts in the CLI output. A short count means a
code's data is missing upstream; fetch it manually and look at the response. If
Eurostat genuinely does not publish a code yet, that is a real failure — do not
ship until the data exists.

**Link status.** Open a failing URL in a browser. A "Too Many Requests" body
means wait and retry. A real response means the body-shape check needs
comparing against the expected `dimension` / `value` keys.

**Network.** Check connectivity, check the upstream is up, retry. Eurostat has
been reliable for years, but anything can happen.

**Weight sum ≠ 100%.** Print the weights and check each division has a value. A
missing division means Eurostat skipped it for the year (rare); a wildly
different value means a rebalance — verify with curl.

**The pipeline ran but the JSON did not change.** You forgot to commit. The
pipeline writes to `data/published/*.json`; git does not auto-commit. Check
`git status` and `git diff`.

## Running the site

```bash
cd site
npm run dev                                     # 5173, hot reload
npm run build                                   # writes dist/
npm run preview -- --port 4173 --strictPort     # 4173, prod build, no HMR
```

Both servers serve `data/published/*.json` via the middleware in
`site/vite.config.js`: in dev straight from the repo's `data/` folder, in
preview from whatever `scripts/copy-data.mjs` baked into `dist/`. Refresh the
JSONs first, then `npm run build` to ship them.

Kill both servers between sessions — they hold ports and battery:

```bash
pkill -f "vite"; pkill -f "npm run dev"; pkill -f "npm run preview"
```

## Pre-commit checklist

Before pushing a change to `pipeline/`:

- [ ] `pytest -q` is green
- [ ] `vyarno-pipeline refresh --source all --out ../data/published` exits 0
      against the live API
- [ ] You eyeballed the published JSON — the headline matches what Eurostat's
      HICP page shows
- [ ] If you touched a connector: the fixture still round-trips through the cube
      decoder, and `pytest -m live -q` still passes against the real endpoint
- [ ] If you added, changed or deleted a feature or a data contract, its test
      moved with it **in the same commit**
      ([`testing-strategy.md`](./testing-strategy.md))
- [ ] If you touched `sources/*`, [`data-sources.md`](./data-sources.md) moved
      with it in the same commit ([`data-sources.md`](./data-sources.md))

Before pushing a change to `site/`:

- [ ] `npm run verify:math` is green
- [ ] `npm run test:render` reports **14 passed** — it is the only suite that
      runs the app, a page that throws on render is invisible to every other
      one, and 14 skipped also exits 0
- [ ] `npm run build` exits 0
- [ ] `dist/data/published/*.json` exists for all eight files
- [ ] `npm run dev` and `npm run preview` both serve `/data/published/*.json`
      with 200

## Cross-references

- [`architecture.md`](./architecture.md) — why the pipeline/site split exists
- [`data-sources.md`](./data-sources.md) — the upstream endpoints and their quirks
- [`validation-gates.md`](./validation-gates.md) — what each gate catches
- [`site.md`](./site.md) — the SPA module by module
