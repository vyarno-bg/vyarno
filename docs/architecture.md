# Architecture

**Build-time data bake + static site.** A Python pipeline pulls official data,
gates it, and writes versioned JSON to `data/published/`. A static Svelte SPA
reads those files. The user's browser never calls Eurostat, НСИ, ЕЦБ, БНБ or
имот.bg, and nothing the user types leaves their device.

```
┌─ Refresh time (a pipeline run — by hand, or on whatever schedule you set) ─┐
│                                                                       │
│   Eurostat        БНБ           ЕЦБ           имот.bg      НСИ        │
│   prc_hicp_*      XLSX          MIR (SDMX)    /sredni-     XLSX       │
│   une_rt_m        (mortgage     (mortgage      ceni        (wages)    │
│   earn_ses_*       stock)        new business)                        │
│        └──────────┴──────────────┴──────────────┴───────────┘         │
│                              │                                        │
│              pipeline/ (Python 3.11)                                  │
│              sources/*.py → transform.py → validate.py → publish.py   │
│                              │             (driven by cli.py)         │
│                              ▼                                        │
│                     data/published/*.json   ← 9 payloads, committed   │
└──────────────────────────────┼────────────────────────────────────────┘
                               │  dev middleware, or copied into dist/
                               ▼
┌─ Runtime (the user's browser) ────────────────────────────────────────┐
│   site/ — Vite 8 + Svelte 5, static                                   │
│   data.js → view.js → mirror.js → calculator.svelte.js → components   │
│   personal figures are computed in the tab and sent nowhere           │
└───────────────────────────────────────────────────────────────────────┘
```

## Repo map

```
├── AGENTS.md · LICENSE (Apache-2.0) · NOTICE (the data carve-out) · README.md
├── CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md
├── ruff.toml · .editorconfig      lint + layout for every language here
├── .github/         workflows/ci.yml · dependabot.yml · FUNDING.yml ·
│                    ISSUE_TEMPLATE/ · pull_request_template.md ·
│                    copilot-instructions.md (points at AGENTS.md)
├── docs/            README (engineer entry) · architecture · data-sources ·
│                    math · validation-gates · local-development · site ·
│                    seo · how-it-works · legal · principles ·
│                    testing-strategy · writing-style · img/
├── pipeline/        Python 3.11 + httpx + pydantic + click · AGENTS.md
│   ├── requirements.txt · requirements-dev.txt   pip-compile locks, hashed
│   ├── src/vyarno_pipeline/
│   │   ├── models · transform · validate · publish · cli
│   │   ├── mortgage.py   # gates + БНБ lending limits
│   │   ├── payroll.py    # dated BG payroll-law table (no network)
│   │   └── sources/      # eurostat · bnb · ecb · imot · nsi
│   └── tests/       `pytest -q` offline; `-m live` hits real upstreams
├── data/published/  9 payloads, committed — these ARE served to the site
└── site/            Vite 8 + Svelte 5, five build entries · AGENTS.md
    ├── index.html · how/index.html · legal/index.html ·
    │                support/index.html · 404.html
    ├── public/      _headers (CSP + cache) · robots.txt · llms.txt ·
    │                .well-known/security.txt · favicon · og-image · fonts
    ├── eslint.config.js · .prettierrc.json · svelte.config.js
    ├── scripts/     verify_*.mjs (`npm run verify:math`) · verify_render_*.mjs
    │                (`npm run test:render`, the built page in a browser) ·
    │                prerender · copy-data · gen-sitemap · gen-jsonld ·
    │                gen-version · strip-sourcemaps · check-identity
    └── src/         App.svelte · How.svelte · Legal.svelte ·
                     Support.svelte · NotFound.svelte
        ├── components/  the calculator's parts: SiteHeader · DataBanner ·
        │                DataPanel ·
        │                InputsCard · PayField · BasketEditor · PayslipTable ·
        │                ResultsCard · ResultsAnswer · ResultsSummary ·
        │                RankedContributions ·
        │                PocketRow · PercentileRow · TaxWedgeRow · RentRow ·
        │                HomeRow · LeftoverRow · SavingsRow · MethodDrawer ·
        │                ShareCard · ResultsWordmark · NationalStrip ·
        │                ExplainerBand
        └── lib/     payloads.js   WHICH payloads exist at all (the manifest)
                     data.js       WHICH published number (fallback chains)
                     view.js       WHICH input feeds which formula (the wiring)
                     mirror.js     THE ARITHMETIC (the only domain math)
                     calculator.svelte.js  the STATE everything reads
                     format.js     how a number or a date is written
                     content.js    BG/EN copy + presets + offline sentinels
                     share-card.js the PNG a reader sends, drawn on a canvas
                     legal.js      the legal documents + ЗЕТ чл. 4 identity
                     legal-nav.js  contact addresses + document names
                     support.js    the donation rules — what may be offered
                     stores.js     lang + theme, persisted
                     build.js      the build stamp (__BUILD_ID__, or "dev")
                     tokens.css · card.css · disclosure.css · result-row.css
                     SiteFooter.svelte  attribution + legal links + build stamp
```

The two toolchains carry their own `AGENTS.md`, because an agent reads the
nearest one in the tree: [`pipeline/AGENTS.md`](../pipeline/AGENTS.md) for the
Python side, [`site/AGENTS.md`](../site/AGENTS.md) for the SPA. Neither costs
anything to a session that does not enter that directory.

## Why bake at build time

| Concern | Baked JSON | Runtime API call |
|---|---|---|
| Upstream throttling | One fetch per refresh | One per visitor |
| Upstream downtime | Site unaffected | Site breaks |
| "As of" honesty | An `as_of` field in the payload | Cache headers and clock drift |
| Reviewability | The diff shows which numbers moved | Nobody sees a snapshot twice |
| Cold-cache latency | Instant | A round trip per upstream |

The trade: a bad upstream publish would produce a bad site until someone rolls
it back. The validation gates are the defence.

## Pipeline layers

Every layer has one job, and they do not overlap.

| Layer | Files | Job |
|---|---|---|
| Source | `sources/{eurostat,bnb,ecb,imot,nsi}.py` | Call one upstream, prove the response is what was asked for, return flat rows. **No math.** |
| Transform | `transform.py` | Reshape rows into published shapes: year-end selection, the salary ladder. **No network, no validation.** |
| Validate | `validate.py`, `mortgage.py` | Gates that block the publish. A gate raises; it never repairs. Which gates run depends on the `--source` — [`validation-gates.md`](./validation-gates.md) §"Which gates run for which `--source`" is the table. |
| Publish | `publish.py` | Write the envelopes, including the provenance frame every payload carries. |
| CLI | `cli.py` | One arm per `--source`, and the exit codes. **No domain logic.** |

Legislative constants have no machine-readable feed, so they live as dated
tables: `payroll.py#BG_PAYROLL_TABLE` (BG payroll law) and
`mortgage.py#BNB_LENDING_LIMITS` (БНБ borrower-based measures). Append a new
dated entry; never mutate one.

Every module that decides something has a test file named after it under
`pipeline/tests/`. `clock.py` is the exception and stays one: it is a single
`today()` returning the date in `Europe/Sofia`, with one production caller, and
the suites that care about the date call it rather than assert on it. Alongside
those sit the suites named after an output rather than a module
(`test_salary_dist.py`, `test_published_contracts.py`,
`test_readme_contract.py`), and `test_live_upstreams.py`, which runs only under
`pytest -m live` and probes the real endpoints.

## What `data/published/` carries

Nine envelopes, ~115 KB raw / 23 KB gzipped, all committed.

**Five fields are on every one of them**: `schema_version`, `as_of`, `source`,
`source_url`, `notes`. That is the provenance floor — where the figure came
from, when, and what was done to it.

The rest of the frame is carried where it means something rather than
everywhere. `dataset` names the upstream file and the coordinates read out of
it, and appears on the three payloads with a fixed set to name (`region_salary`,
`sector_salary`, `unemployment` — the sector one names two files, because both
language editions are read and each pins the other); `hicp_categories`,
`mortgage` and `salary_dist` draw on several, and record
provenance per row, per tier or per block instead. `payload_name`, `ref_period`, `published_at`,
`unit` and `value` follow the same rule, and `methodology_change`,
`is_preliminary` / `disclaimer` appear only where they apply. A single-figure
payload carries most of the frame; a composite one carries it one level down.

`is_preliminary` is the newest of these and the one to copy from: it is `null`
where a publisher draws no such distinction, which is a different claim from
`false`. Only НСИ mark a release provisional, so only their two payloads carry
it as a boolean today.

| File | Carries |
|---|---|
| `hicp_categories.json` (68 KB) | 13 ECOICOP ver.2 divisions + ~46 groups; per code `weight_pct`, `annual_rate_pct`, `index_by_year` (year-end, since 2020), `latest_index`, BG/EN labels, two verify URLs |
| `hicp_headline.json` | Eurostat's all-items 12-month rate, verbatim, with its reference month |
| `salary_dist.json` | An 11-point gross ladder P1…P99 inside a `shape` block carrying Eurostat SES's own provenance. The НСИ level the ladder is re-set to is **not** copied in here — the SPA reads it from `sector_salary.json`'s all-activities row, so no payload carries a second publisher's figures |
| `payroll.json` | The dated BG payroll-law table + `scheduled_changes` |
| `region_salary.json` (25 KB) | НСИ's published quarterly gross wage for each of the 28 области, with their own name for it in both languages; each row's headline is their latest quarter. Keyed by `code`, which is the join to `city_price.json` |
| `sector_salary.json` (19 KB) | НСИ's published quarterly gross wage by economic activity — 19 NACE Rev 2 sections plus the all-activities total, each with `en_name`, `bg_name` (both НСИ's own, from their two language editions), `value_eur` and the full quarterly series. **An average, and the country's**, where `region_salary` is per област: nobody publishes a distribution by activity for BG, so there is no median and no rank in here to read |
| `city_price.json` | Per-city €/m² for the 27 cities имот.bg cover: each city's district count, summary and its OWN year window, chosen from how far back имот.bg's coverage of it supports a comparison. Keyed by the same `code`. No per-district dict — nothing read it |
| `mortgage.json` (17 KB) | Two rate tiers (`new_business` with nested `aprc`, `outstanding_stock`), the БНБ↔ЕЦБ `cross_check`, and `lending_limits` |
| `unemployment.json` | BG unemployment — **monthly**, seasonally adjusted, 2020-01 onward (`une_rt_m`, not the annual `une_rt_a`) |

Field-level detail sits beside the connector that produces it, in
[`data-sources.md`](./data-sources.md). The load-bearing schema rule is in
[`math.md`](./math.md): **every index field carries Eurostat's own value, on
the base `index_base_year` names**, because the SPA divides
`latest_index / index_by_year[anchor]` and the two have to share a base.

## The five layers in the SPA

```
data/published/*.json
   │
   ▼  data.js     WHICH published number, and what if it is missing
   │              (the fallback chains, relabelling as they degrade)
   ▼  view.js     WHICH inputs go into which formula
   │              (dataAge, headlineRate, mortgagePanel, verifyUrl, …)
   ▼  mirror.js   THE ARITHMETIC
   │              (annuityPayment, personalInflation, pocketReal, …)
   ▼  calculator.svelte.js
   │              WHAT HOLDS IT — the $state the reader types into and the
   │              $derived graph over the three layers above. No arithmetic.
   ▼  components/ WHERE it goes, what colour, which language
```

The rule this split encodes: **where a wrong wiring would be a wrong number,
make the wrong wiring impossible to express.** `savingsSince2020` takes the
categories rather than a rate; `headlineRate` takes only the headline payload;
`mortgagePanel` reads the regulatory caps out of the published limits instead
of accepting them as arguments. Details in [`site.md`](./site.md).

## Module ownership

| Module | Owns |
|---|---|
| `sources/*.py` | Talking to one upstream, and proving the response is the one requested |
| `transform.py` | Reshaping upstream rows into published shapes |
| `validate.py` | The seven HICP gates, and the sector-wage gate that runs under `--source sector-salary` |
| `mortgage.py` / `payroll.py` | The dated legislative tables and the mortgage gates |
| `publish.py` | The envelopes and the provenance frame |
| `cli.py` | One arm per `--source`; exit codes **2** transform, **3** gate, **4** network |
| `site/src/lib/payloads.js` | Which payloads the page depends on, and which routes need each — the one list `loadAll`, the freshness verdict, `/version.json` and the sitemap all derive from |
| `site/src/lib/data.js` | Which published number, including every fallback chain |
| `site/src/lib/view.js` | Which input feeds which formula |
| `site/src/lib/mirror.js` | The arithmetic — the only domain math in the front end |

## Hosting and headers

The build output is a static directory, so everything the edge needs lives in
`site/public/_headers`: a CSP matching what the app actually does (`script-src
'self'`, `connect-src 'self'`, `frame-ancestors 'none'`), cache lifetimes that
are immutable for hashed assets and five minutes for `/data/published/*`, and a
`Permissions-Policy` denying camera, mic, geolocation and payment.

**`_headers` is the declaration, and applying it is the deployment's job.** A
host that reads the format natively applies it as written; anything else needs
the same policy in its own syntax, made from this file and kept in step with it.
`verify_static_assets.mjs` pins every directive exactly, so the declaration
cannot widen without a red test — but nothing in a build can see a *server*
whose config has drifted from it. That one is checked by requesting a page from
the live origin and reading the headers back.

**Credentials the deployment needs are the deployment's business, not this
repository's.** Whatever publishes the built site, and whatever runs the refresh
on a schedule, will hold something — a key, a token, a login. None of it belongs
in the tree, and this repository deliberately describes no particular hosting
arrangement, so there is nothing here to keep in step with one. What does bind:
generate a credential where it will be used rather than carrying it there, scope
it to the one thing it needs, and assume anything ever committed is permanent.

## CI

`.github/workflows/ci.yml` runs on every push to every branch, on every pull
request, and on demand: the pipeline suite (`pytest -q`, offline), the SPA
suite (`npm run verify:math`), the production build, and a check that all nine
published payloads are committed and parse.

The two triggers cover different things. A push gates a branch before the merge
and re-checks `main` after it. A pull request is what reaches a **fork** at
all — a fork's commits never touch this repository's refs, so no push event
fires here and no check would ever be created against that SHA. It also builds
`refs/pull/N/merge` rather than the head, which is the one tree no push ever
sees: a branch and `main` can each be green and their merge broken. A same-repo
pull request therefore runs twice, and the second run is not a duplicate of the
first.

It does **not** refresh data — the refresh workflows are separate files with
separate triggers, and this one holds no upstream credential and no schedule.
Every arm but one refreshes on a cron in `.github/workflows/refresh-*.yml`,
each opening a pull request against `main` so the diff stays the review. The
exception is `city-price`: `имот.bg` answers a datacenter IP with a 403, no
runner has an ordinary Bulgarian connection to offer it, and it is refreshed by
hand for that reason and no other. A refresh that runs
anywhere still has to be given what the network there lacks: the БНБ arm needs
the missing TLS intermediate supplied before it can fetch at all
(`data-sources.md` §"TLS setup"). The `live` probes stay excluded from CI for
the same reason they always were: run them from an ordinary network with
`pytest -m live`.

**The workflow uses no secrets**, with `permissions: contents: read`. Because it
does not refresh data it holds no upstream credential, and that is what lets a
pull request from a stranger run the full suite. Keep it that way — the refresh
workflows write, and this one must not: they take `contents: write` to push a
`data/<source>` branch and `actions: write` to start this workflow against it,
which is a token a fork's code must never run under.

That property is also what makes the `pull_request` trigger safe to have. It
runs **this** repository's copy of the workflow against the merge ref with a
read-only token, so a fork controls the code under test and nothing else.
`pull_request_target` is the trigger that would hand a fork a writable token and
whatever secrets the repository holds; it is not used here and there is nothing
it could be used for. Every checkout also sets `persist-credentials: false`, so
the run's own token is not left in `.git/config` for a later step to read.

## Cross-references

- [`site.md`](./site.md) — the SPA module by module
- [`data-sources.md`](./data-sources.md) — every upstream endpoint and its quirks
- [`math.md`](./math.md) — where every number comes from
- [`validation-gates.md`](./validation-gates.md) — what blocks a publish
- [`local-development.md`](./local-development.md) — how to run it
