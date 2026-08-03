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
│                     data/published/*.json   ← 8 files, committed      │
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
│                    how-it-works · legal · principles · testing-strategy ·
│                    writing-style · img/
├── pipeline/        Python 3.11 + httpx + pydantic + click · AGENTS.md
│   ├── requirements.txt · requirements-dev.txt   pip-compile locks, hashed
│   ├── src/vyarno_pipeline/
│   │   ├── models · transform · validate · publish · cli
│   │   ├── mortgage.py   # gates + БНБ lending limits
│   │   ├── payroll.py    # dated BG payroll-law table (no network)
│   │   └── sources/      # eurostat · bnb · ecb · imot · nsi
│   └── tests/       `pytest -q` offline; `-m live` hits real upstreams
├── data/published/  8 JSON envelopes, committed — these ARE served to the site
└── site/            Vite 8 + Svelte 5, five build entries · AGENTS.md
    ├── index.html · how/index.html · legal/index.html ·
    │                support/index.html · 404.html
    ├── public/      _headers (CSP + cache) · robots.txt ·
    │                .well-known/security.txt · favicon · og-image · fonts
    ├── eslint.config.js · .prettierrc.json · svelte.config.js
    ├── scripts/     verify_*.mjs (`npm run verify:math`) · verify_render_*.mjs
    │                (`npm run test:render`, the built page in a browser) ·
    │                prerender · copy-data · gen-sitemap · gen-version ·
    │                strip-sourcemaps · check-identity
    └── src/         App.svelte · Legal.svelte · Support.svelte · NotFound.svelte
        ├── components/  the calculator's parts: SiteHeader · DataBanner ·
        │                DataPanel ·
        │                InputsCard · BasketEditor · PayslipTable ·
        │                ResultsCard · ResultsSummary · RankedContributions ·
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
| Validate | `validate.py`, `mortgage.py` | Gates that block the publish. A gate raises; it never repairs. |
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

Eight envelopes, ~103 KB raw / 22 KB gzipped, all committed.

**Five fields are on every one of them**: `schema_version`, `as_of`, `source`,
`source_url`, `notes`. That is the provenance floor — where the figure came
from, when, and what was done to it.

The rest of the frame is carried where it means something rather than
everywhere. `dataset` names an upstream cube or file and appears on the two
payloads that have exactly one (`sofia_salary`, `unemployment`);
`hicp_categories`, `mortgage` and `salary_dist` draw on several, and record
provenance per row, per tier or per block instead. `payload_name`, `ref_period`, `published_at`,
`unit` and `value` follow the same rule, and `methodology_change` /
`disclaimer` appear only where they apply. A single-figure payload carries
most of the frame; a composite one carries it one level down.

| File | Carries |
|---|---|
| `hicp_categories.json` (68 KB) | 13 ECOICOP ver.2 divisions + ~46 groups; per code `weight_pct`, `annual_rate_pct`, `index_by_year` (year-end, since 2020), `latest_index`, BG/EN labels, two verify URLs |
| `hicp_headline.json` | Eurostat's all-items 12-month rate, verbatim, with its reference month |
| `salary_dist.json` | An 11-point gross ladder P1…P99 inside a `shape` block carrying Eurostat SES's own provenance. The НСИ level the ladder is re-set to is **not** copied in here — the SPA reads it from `sofia_salary.json`, so no payload carries a second publisher's figures |
| `payroll.json` | The dated BG payroll-law table + `scheduled_changes` |
| `sofia_salary.json` | НСИ's published quarterly Sofia-city gross wage series; headline = their latest quarter |
| `sofia_price.json` | 143 district €/m² averages + 12 annual snapshots back to 2015 |
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
| `validate.py` | The six HICP gates |
| `mortgage.py` / `payroll.py` | The dated legislative tables and the mortgage gates |
| `publish.py` | The envelopes and the provenance frame |
| `cli.py` | One arm per `--source`; exit codes **2** transform, **3** gate, **4** network |
| `site/src/lib/payloads.js` | Which payloads the page depends on — the one list `loadAll`, the freshness verdict, `/version.json` and the sitemap all derive from |
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

`.github/workflows/ci.yml` runs on every push to every branch, and on demand:
the pipeline suite (`pytest -q`, offline), the SPA suite (`npm run
verify:math`), the production build, and a check that all eight published
payloads are committed and parse.

It does **not** refresh data. Two of the five upstreams need network paths a
cloud runner does not have, and a scheduled job that silently publishes a
partial panel is worse than a manual one that fails loudly. A refresh is run
where those paths exist, and its output is committed, because the diff is the
review. The `live` probes are excluded for the same reason: run them from an
ordinary network with `pytest -m live`.

**The workflow uses no secrets**, with `permissions: contents: read`. Because it
does not refresh data it holds no upstream credential, and that is what lets a
pull request from a stranger run the full suite. Keep it that way: a refresh
workflow would need БНБ TLS and a Bulgarian egress path, which is a deliberate
decision rather than a CI tweak.

## Cross-references

- [`site.md`](./site.md) — the SPA module by module
- [`data-sources.md`](./data-sources.md) — every upstream endpoint and its quirks
- [`math.md`](./math.md) — where every number comes from
- [`validation-gates.md`](./validation-gates.md) — what blocks a publish
- [`local-development.md`](./local-development.md) — how to run it
