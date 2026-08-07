# pipeline/ — agent instructions

Python 3.11 ingest. Pulls official figures from five upstreams, gates them, and
writes the nine JSON envelopes in `data/published/`. The root `AGENTS.md` has
the boundaries that apply everywhere; this file is the Python side.

## Commands

```sh
make setup                                  # from the repo root, once
source .venv/bin/activate                   # ruff and pytest live here, not on PATH
pytest -q                                   # the offline suite, ~15 s
pytest -m live -q -rs                       # the upstream probes, and why any skipped
ruff check .. && ruff format --check ..     # ruff owns Python layout everywhere
```

The default run is **offline and deterministic** — respx plus committed
fixtures. `-m live` is excluded by `addopts` in `pyproject.toml`, and those
probes assert on shape and plausibility, never on this month's value: fixtures
pin the parser, live probes pin the premise.

`pytest: command not found` means the venv is not activated.

## Layers, and they do not overlap

`sources/{eurostat,bnb,ecb,imot,nsi}.py` call one upstream each and prove the
response is the one asked for — **no math**. `transform.py` reshapes rows into
published shapes — **no network, no validation**. `validate.py` and
`mortgage.py` hold the gates; a gate raises, it never repairs. `publish.py`
writes the envelopes and the provenance frame. `cli.py` is one arm per
`--source` and the exit codes — **no domain logic**.

`docs/architecture.md` §"Pipeline layers" is the long form.

## Running a refresh

```sh
vyarno-pipeline refresh --source all --out ../data/published
vyarno-pipeline refresh --source hicp --out ../data/published
```

`--source`: `hicp`, `unemployment`, `mortgage`, `sofia-price`,
`sofia-salary`, `sector-salary`, `salary-dist`, `payroll`, `all`. Eight arms
write nine files — `hicp` publishes the headline and the categories. Output is
**committed** — the diff is the review.

**`--skip-link-check` is for a sandbox with no outbound HTTP, and never for a
production refresh.** It skips gate 6, the only check that the URLs we publish
still resolve — and those URLs are the "↗" the reader clicks.

`--source mortgage` needs the БНБ TLS intermediate present; their server omits
it (`docs/data-sources.md` §"TLS setup"). Never disable verification.
`sofia-price` needs an ordinary Bulgarian connection rather than a cloud one.

## The six HICP gates

Named in order, and **six gate lines printed is the pass condition** — a run
that publishes with fewer has skipped one.

1. **classification agreement** — the two HICP cubes give each code the same
   label, per code. A shared code is not a shared meaning.
2. **chain reconciliation** — the divisions reproduce the all-items index
   through HICP's chain-linking identity, ±0.02 pp. The real check.
3. **basket sum** — `Σ(w·r)` within ±0.5 pp of the headline. A sanity band, not
   an identity; it cannot be tightened.
4. **group consistency** — a division's groups agree with the division.
5. **coverage** — every code we intend to publish is present.
6. **link status** — every published `source_url` fetched and its **body**
   inspected. A 200 with `value: {}` is a failure, not a pass.

`--source mortgage` runs its own five plus freshness on both tiers, and
`--source sector-salary` runs a seventh gate of its own: `value_eur` must BE
the published cell at the payload's `ref_period`, an identity rather than a
band. НСИ's §2.1.1 forbids distributing производни произведения, so a headline
this pipeline calculated rather than read is a licence breach that looks exactly
like a correct number. `docs/validation-gates.md` has what each catches, what to
do when one trips, and the transcript of a good run.

**Never widen a tolerance to make a gate pass.** A tolerance that fails on
correct data is a wrong formula, not a tight number.

## Exit codes — stable, and CI relies on them

| | |
|---|---|
| `0` | all gates passed, JSON written |
| `2` | input / transform error — wrong shape, missing data |
| `3` | a validation gate failed |
| `4` | network / HTTP error — upstream down, timeout, rate limit, БНБ TLS chain |

## Dated tables

Legislative constants have no machine-readable feed, so they live as dated
tables: `payroll.py#BG_PAYROLL_TABLE` (BG payroll law) and
`mortgage.py#BNB_LENDING_LIMITS` (БНБ borrower-based measures). Both are
resolved by `effective_from` against the run date.

**Append a new effective-dated entry. Never mutate an existing one** — a
mutated row silently rewrites what the calculator said about a past period, and
nothing in the suite can tell that from a correction.

## Also

- A change to `sources/*` and a change to `docs/data-sources.md` are the **same
  commit**. A new connector also ships its licence terms, quoted verbatim and
  dated, in `docs/legal.md`.
- Every module has a test file named after it under `tests/`. A new payload
  with no gate is a number nobody checks.
- `docs/local-development.md` — reading the output, and debugging a failed run.
