# Site (the SPA)

The Vite 8 + Svelte 5 app that reads `data/published/*.json` and renders the
calculator. The user's browser never calls an upstream API.

## Layout

**Nine build entries, nine real URLs**, so each resolves on a static host with
no router and no rewrite rules (`vite.config.js#rollupOptions.input`):

| Entry | URL | What it is |
|---|---|---|
| `index.html` → `src/main.js` → `App.svelte` | `/` | the calculator |
| `how/index.html` → `src/how-main.js` → `How.svelte` | `/how/` | the country's figures, with their sources |
| `market/index.html` → `src/market-main.js` → `Market.svelte` | `/market/` | the residential property market, with every figure sourced |
| `legal/index.html` → `src/legal-main.js` → `Legal.svelte` | `/legal/` | terms, privacy, ЗЕТ чл. 4 identity, sources |
| `support/index.html` → `src/support-main.js` → `Support.svelte` | `/support/` | how the project is paid for |
| `en/index.html`, `en/how/…`, `en/market/…`, `en/legal/…`, `en/support/…` | `/en/…` | those five again, declaring `en` |
| `404.html` → `src/notfound-main.js` → `NotFound.svelte` | `/404.html` | served for any unmatched path by name |

**The `en/` four name the same bootstraps and the same components as their
Bulgarian counterparts.** What separates a pair is the `data-lang` on `<html>`,
the head tags, and which half of every `.l-bg` / `.l-en` string survives
`prerender.mjs` — so an English entry is four kilobytes of head and no second
implementation of anything. They exist because a page ranks as a DOCUMENT and
the served document carries one language: `/` put no English in front of a
search engine at all, and an `hreflang` alternate had no address to point at
([`seo.md`](./seo.md) §"Eight pages, four routes, two languages").

Which language a reader gets is decided by the URL, and the preference in
`stores.js` supplies the default at `/` alone. The header's language control is
a pair of anchors rather than a button, so it works with the bundle off — see
§`src/lib/stores.js` below.

`/how/` is a page rather than a section of the calculator because one page
ranks for one cluster of queries, and `/` is answering «сметни моята инфлация».
Nothing on it answers «каква е инфлацията в България» or «колко струва
квадратът в София» — informational questions with no calculator in them
([`seo.md`](./seo.md)). It renders no input at all, which is what lets the build
prerender the whole of it; `verify_wiring.mjs` holds that property from both
sides, refusing an `<input>` in the template and refusing any read of a value
the reader types.

Its content is four wide tables, so two things about them are structural rather
than styling. Each sits in an `overflow-x: auto` box, because five columns at
360px would otherwise scroll the page body and take the sticky header and every
paragraph sideways with it. And each box is a `tabindex="0"` `role="region"`
with its own name: a scroll container is not focusable on its own, and the wedge
table holds no link to tab to, so without it two of that table's five columns
were unreachable by keyboard at a phone width. `verify_render_country.mjs`
holds both,
and the `.scroll` rule in `How.svelte` carries what was tried for the visual
affordance and why it is not there.

`/support/` is a page rather than a section of `/legal/` because it is not a
legal document: it carries no obligation, it is not versioned with the four,
and reaching it through the legal entry cost a reader the ~30 kB of terms of
use that entry loads. It is also the one URL the project needs to be able to
hand somebody. What may be said on it, and how many other places may say any of
it, is `src/lib/support.js` — rule 1 allows two surfaces (the footer line and
the explainer's «Кой плаща за това?») plus this page, and `verify_support.mjs`
holds the import list that keeps the count honest.

```
site/
├── vite.config.js      # Svelte plugin · /data/published middleware ·
│                       # the five entries · the __BUILD_ID__ define
├── scripts/
│   ├── check-all.mjs          # lint → test → render, and the counts at the end
│   ├── check-test-floors.mjs  # no suite got smaller — the only counts there are
│   ├── find-chromium.mjs      # which browser test:render will use, proved by launching it
│   ├── check-live-headers.mjs # the deployed origin against _headers, over HTTP
│   ├── release-build.mjs      # build + the release-only guards, one command
│   ├── prerender.mjs          # post-build: every indexable entry, figures and all
│   ├── copy-data.mjs          # post-build: ../data/published/*.json → dist/
│   ├── gen-sitemap.mjs        # dist/sitemap.xml, lastmod = newest as_of
│   ├── gen-jsonld.mjs         # post-build: the dateModified slot in each entry
│   ├── gen-version.mjs        # dist/version.json — commit + build time + as_of
│   ├── strip-sourcemaps.mjs   # moves maps OUT of dist/; fails if source survives
│   ├── check-identity.mjs     # release guard on the ЗЕТ чл. 4 identity
│   ├── published-payload.mjs  # the suites' reader for data/published/*.json
│   ├── verify_net_salary.mjs      # gross ↔ net payroll pair
│   ├── verify_mirror_math.mjs     # every formula in mirror.js
│   ├── verify_view.mjs            # every derived value in view.js ← the wiring
│   ├── verify_wiring.mjs          # which value the template feeds which function
│   ├── verify_copy.mjs            # copy invariants, against the imported COPY
│   ├── verify_format.mjs          # how a number or a date is written
│   ├── verify_stores.mjs          # what this device keeps, and what it never does
│   ├── verify_contrast.mjs        # WCAG ratios computed from tokens.css
│   ├── verify_data_contracts.mjs  # data.js chains + the shipped JSON
│   ├── verify_legal.mjs           # the legal documents and the identity table
│   ├── verify_support.mjs         # the donation rules (support.js ↔ FUNDING.yml)
│   ├── verify_template_safety.mjs # the {@html} invariants, both directions
│   ├── verify_static_assets.mjs   # robots · llms · security.txt · sitemap · CSP
│   ├── verify_suites.mjs          # every suite on disk is named by a runner
│   ├── verify_docs_map.mjs        # this tree names the files that are there
│   ├── render-dist.mjs            # dist/ readers, shared, no browser
│   ├── render-harness.mjs         # serveDist · openApp · withApp · skip
│   ├── verify_render_prerender.mjs # the built HTML, as a crawler reads it
│   ├── verify_render_shell.mjs    # it mounts, it logs nothing, both toggles
│   ├── verify_render_country.mjs  # /how/, live over its own prerender
│   ├── verify_render_market.mjs   # /market/ — every figure sourced, no input
│   ├── verify_render_strip.mjs    # the national strip and the charts
│   ├── verify_render_basket.mjs   # the thirteen rows, presets, chips
│   ├── verify_render_results.mjs  # headline · verdict · ladder · working
│   ├── verify_render_layout.mjs   # phone · tablet · wide, and the routes
│   ├── verify_render_payroll.mjs  # payroll and more than one income
│   ├── verify_render_share.mjs    # the share card and the share text
│   ├── verify_render_contrast.mjs # painted text ratios · control boundaries
│   ├── make_og_image.py           # regenerates the static OG preview + the
│   │                              # two README banners (stdlib only)
│   └── make_screenshot.mjs        # regenerates docs/img/screenshot.png
├── public/             # copied verbatim into dist/ — no build step
│   ├── _headers · robots.txt · llms.txt · .well-known/security.txt
│   ├── favicon.svg · og-image.png · fonts/ (self-hosted, vendored unmodified)
└── src/
    ├── App.svelte · How.svelte · Market.svelte · Legal.svelte · Support.svelte
    │   · NotFound.svelte
    ├── components/   # the calculator, one file per part
    └── lib/
        ├── payloads.js   # WHICH payloads exist at all (the manifest)
        ├── data.js       # fetch wrappers + the fallback chains
        ├── mirror.js     # pure FORMULAS (the only domain math)
        ├── view.js       # pure DERIVED VALUES (the wiring)  ← read this
        ├── calculator.svelte.js  # the STATE the components read
        ├── content.js    # BG/EN copy + presets + HOME constants
        ├── share-card.js # the PNG a reader sends, drawn on a canvas
        ├── format.js     # how a number or a date is written
        ├── legal.js      # the four legal documents + the ЗЕТ чл. 4 identity
        ├── legal-nav.js  # contact addresses + document names (every page)
        ├── support.js    # the donation rules — what may be offered
        ├── stores.js     # lang · theme · област · the opt-in memory
        ├── build.js      # the build stamp (__BUILD_ID__, or "dev")
        ├── SiteFooter.svelte  # attribution + legal links + build stamp
        └── tokens.css · card.css · result-row.css · disclosure.css
```

`SiteFooter.svelte` is shared by every page on purpose: it carries the upstream
attribution (a licence condition) and the legal links (ЗЕТ чл. 4 wants the
provider's identity reachable from every page). A page that declares its own
`<footer>` fails `every_page_mounts_the_shared_footer_and_none_declares_its_own`,
and a new build entry belongs in that test's list in the commit that adds it.

## The five-layer split

Read this before adding a number to the page. Each layer answers a different
question.

| Layer | File | Question | Tested by |
|---|---|---|---|
| **Data** | `data.js` | *Which* published number, and what if it is missing? | `verify_data_contracts.mjs` |
| **Formula** | `mirror.js` | Given these inputs, what is the arithmetic? | `verify_mirror_math.mjs`, `verify_net_salary.mjs` |
| **Wiring** | `view.js` | *Which* inputs go into that formula? | `verify_view.mjs` |
| **State** | `calculator.svelte.js` | What holds the result, and when does it recompute? | the `verify_render_*.mjs` suites (it is the only layer with no pure function to test) |
| **Render** | `components/*.svelte` | Where does it go, what colour, which language? | the `verify_render_*.mjs` suite for that region; template wiring in `verify_wiring.mjs` |

**The rule this encodes: where a wrong wiring would be a wrong number, make the
wrong wiring impossible to express — do not merely test against it.** A formula
is only as correct as its arguments, and a wrong argument is invisible to a test
of the formula.

**Where new arithmetic goes**, and the choice is not a judgement call:

- a new **formula** (a real-terms change, a rate, an annuity) → `mirror.js`,
  with a case in `verify_mirror_math.mjs`;
- a new **derived value** (which published field feeds that formula, which
  fallback applies, which anchor it uses) → `view.js`, with a case in
  `verify_view.mjs`.

A component keeps only display-shape helpers that cannot produce a wrong number
on their own — `fmt`/`fmt0`/`fmtDate`, per-row share normalisation in the slider
render, colour selection. A multiplication in the template belongs one layer
down. Both destinations carry their test in the same commit.

**The State layer is thin on purpose and it is the one to be suspicious of.**
It is the only layer with no pure function behind it, so anything computed
there is computed where no unit test can reach — which is exactly the rule
`view.js` was extracted to enforce. Every `$derived` in `calculator.svelte.js`
is a call into `view.js` or `mirror.js` with named arguments; if you find
yourself writing arithmetic in one, it belongs one layer down. That rule did
not relax when the `$derived`s moved out of `App.svelte` into a rune module.

### A correct formula fed the wrong number

This is the class of bug the pipeline gates structurally cannot see, because
everything they check is already correct on disk. What is left is *which*
correct number reaches which correct formula, and it is what the split above
exists to make impossible rather than merely testable.

1. **Where a wrong wiring would be a wrong number, make the wrong wiring
   impossible to express — do not merely test against it.** `view.js` is built
   that way: `savingsSince2020` takes the *categories*, not a rate, so the
   user's basket rate cannot be substituted; `headlineRate` takes only the
   headline payload, so it cannot become Σ(w·r); `mortgagePanel` reads the
   regulatory caps out of the published limits instead of accepting them.
2. **A pure function with no caller is not covered.** A formula is only as
   correct as its arguments. Test the call, not just the callee.
3. **A source-grep is not a behaviour test, and its docstring will lie about
   it.** A grep for two exact spellings of a forbidden phrase is walked past by
   a third spelling. Greps belong to template wiring that has no runtime
   harness (`verify_wiring.mjs`, and
   [`testing-strategy.md`](./testing-strategy.md) §"Why the wiring tests stay
   source checks"); formulas get exercised.
4. **Guard the sentence, not only the number.** A user-visible claim can be
   false while every formula behind it is right, and no arithmetic test can see
   it. `verify_copy.mjs` guards the claims the copy makes.
5. **A label belongs to the field it labels, not to the nearest payload.** The
   basket's "1 year ago" option is dated from `categories[].ref_period`, beside
   the `annual_rate_pct` that `rateFor(c, "y1")` returns verbatim — never from
   `hicp_headline.json`, whose month Eurostat's flash release puts two weeks
   ahead of the divisions. Taken from the headline, the dropdown reads
   "2025.07 → 2026.07" over thirteen June rates: every figure on the page is
   Eurostat's own, and the sentence over them is false. The render suite asserts
   the rendered option against the payload the page fetched, because the defect
   only exists as a string on a screen.
6. **A figure and its label have to be about the same PLACE, and one page
   holding two is how they stop being.** `/how/` is the country's and pins a
   reference град; `/` follows the reader's. The housing card read its baseline
   year and its since-baseline percentage off `cityHome` — the reference one —
   and printed София's 2015 and София's +232% beside Варна's €/m², under Варна's
   name, with the chart's own end labels correctly Варна's. Every number was
   real. `view.js#cityTrend` is the one selection both surfaces call, and it
   takes the code as an argument so a caller has to say which city it means.

## Boot path

1. `npm run dev` (or `npm run preview` against a `dist/`) starts Vite, which
   serves everything from `site/`.
2. `src/main.js` imports `tokens.css` and mounts `App.svelte` into `#app`.
3. `App.svelte` constructs a `Calculator` and its `onMount` calls `calc.load()`,
   which calls `loadAll()` from `$lib/data.js`.
4. `data.js` does `Promise.all` of one `fetch('/data/published/<name>.json',
   { cache: 'no-cache' })` per manifest row and returns whichever succeeded; failures become
   `null` and the page renders whatever subset loaded. The list is
   `payloads.js#PAYLOADS`, not a copy of it (below).
5. `Calculator#load` computes `dataAge(data, PAYLOADS)` and raises the staleness
   banner if **any payload is overdue against its own cadence** — see
   `payloads.js` and `view.js#payloadStatus`.

## `vite.config.js` — the data middleware

The only reason the same SPA works in dev with no backend. The middleware reads
`../data/published/<file>.json` from disk and serves it at
`GET /data/published/<file>.json`, path-traversal-guarded (it must stay inside
`DATA_DIR`); non-existent files fall through to Vite's 404.

In the production bundle, `scripts/copy-data.mjs` copies the same JSONs into
`dist/data/published/` so the bundle is self-contained.

The config also sets `server.strictPort = true` so dev always lands on
port 5173 (preview uses 4173 by convention), and `server.host = true` (with
`npm run dev` running `vite --host`) so the dev server binds `0.0.0.0` and
is LAN-reachable by default — phones, tablets and a second laptop on the
same network can hit `http://<laptop-lan-ip>:5173/` without any startup
flag. The Vite banner prints the actual LAN URL on startup (Network: …).

## `src/lib/data.js` — the fetch layer

`loadAll(page)`, which maps over `payloads.js#payloadsFor(page)` — so the fetch
list and the panel's row list are the same list, and there is no hand-written
loader per payload to forget.

**The route argument is required.** More than one page here reads data, and a
loader with no route fetches the whole manifest for all of them: the calculator
downloads the property market's quarterly series and `/market/` downloads the
payroll table, neither rendering a figure from it. Defaulting the argument to
"everything" would hide a misspelled route as a slow page rather than an error,
so `payloadsFor` throws on a route no row names.

Three helpers on the same module:

- **`mortgageDefaultRate(mortgage)`** — the rate the calculator starts from:
  `new_business.value_pct` → `outstanding_stock.value_pct` →
  `HOME.rateDefaultPct` (offline sentinel). Returns `{ pct, label }`; the label
  drives the provenance caption, because tier 2 answers a *different* question
  ("what people already repaying average") and must re-caption rather than pass
  for "the rate". The default is the **AAR**, not the APRC.
- **`mortgageAprc(mortgage)`** — the all-in cost of the same new loans (APRC /
  ГПР), or `null`. Rendered as a sub-caption so the cheaper headline is never
  the only number on screen.
- **`mortgageLendingLimits(mortgage)`** — БНБ borrower-based limits from
  `mortgage.json → lending_limits`: `minDownPaymentPct` (15), `dstiMaxPct` (50),
  `maturityMaxYears` (30), `prudentDstiPct` (30, our stricter line),
  `observedDstiPct` (~38.5). Drives the down payment, the term input's `max` and
  the affordability marker, so a regulatory change is a pipeline re-run rather
  than a code edit. The literals in this function are the offline fallback only
  and mirror `mortgage.py#BNB_LENDING_LIMITS`.

The wage comparator reads the chosen област's row out of
`data.regionSalary` through `view.js#regionQuarter`, in
`calculator.svelte.js#regionMeanGrossEur`, falling back to
`HOME.regionSalaryFallback` — which goes through that same function, so the
offline figure cannot be selected differently from the live one.

The percentile ladder takes a **different** level, and the two must not be
crossed: `calculator.svelte.js#ladderAnchorGross` reads НСИ's all-activities
«Общо» row out of `data.sectorSalary` through `view.js#nationalQuarter`. The
spread it re-levels is national, so the level has to be
([`data-sources.md`](./data-sources.md) §"Salary distribution"). Both names
state a **mean**: `mirror.js#composeLadder` divides by SES's own mean, and a
median in that position rescales every percentile on the page.

Every fallback chain here is tested in `verify_data_contracts.mjs` — including
that the mortgage fallback **relabels** when it degrades.

## `src/lib/payloads.js` — the manifest

**The one list that answers "which data?".** `loadAll`, the freshness verdict,
the data panel, `/version.json`, the sitemap's `lastmod` and three contract tests
all derive from it, so a payload is added or removed in exactly one place.

It matters that this is one list rather than several, because the six consumers
above answer subtly different questions from it and a second copy drifts towards
whichever of them nobody is looking at.

Each row carries what the payload cannot say about itself:

| Field | What it is |
|---|---|
| `key` | the property in the `loadAll()` result — components read `data.<key>` |
| `file` | the published stem, `data/published/<file>.json` |
| `pages` | the routes that render a figure from it, and the filter `loadAll` applies |
| `cadenceDays` | the upstream's release rhythm. Past it a payload is *due*; past 1.5× it is *overdue* and the banner fires |
| `name` / `feeds` | the panel's row label, and what this payload produces **on the page** |
| `refPeriod(payload)` | where this payload keeps the period its figures describe |
| `refPeriodSecondary(payload)` | a second vintage, where a payload blends two |

Everything else the panel shows — `as_of`, `source`, `source_url` — is read from
the envelope, because the payload already states it and a second copy could drift.

**`refPeriodSecondary` is for a payload built from two vintages, and it fires
only when the two differ.** A ladder whose *shape* is a Eurostat SES wave and
whose *level* is a recent НСИ quarter carries vintages four years apart, and
dating the row by the quarter alone presents a 2022 dispersion as this
quarter's — so the panel names both. `salary_dist` as published carries one
vintage, Eurostat's shape at Eurostat's own level, one publisher per file
([`legal.md`](./legal.md) §НСИ), so the accessor returns `null`: a row printing
"2022" above "shape: Eurostat SES 2022" reads as a defect rather than as
provenance. The equality guard is what makes the label mean something when it
does appear.

**Its `cadenceDays` is the SES cycle, 1462 days**, because nothing in the file
is quarterly. SES is legislated 4-yearly by Regulation (EU) 2025/941, whose
Annex names 2026 as the first reference period under it with a T+16-month
transmission deadline, so the 2022 wave stands until 2028
([`data-sources.md`](./data-sources.md) §`earn_ses_monthly`). A quarterly
cadence here marks the row *due* three months after a refresh and raises the
site-wide banner six weeks later, over a figure no refresh can change. **A
banner that fires when nothing is wrong is worse than no banner**, because the
next one is read as noise too. The level the reader sees is dated separately,
on `region_salary`'s own quarterly row.

**`cadenceDays` is here rather than in the envelope**, and that is a deliberate
trade. It is a property of the upstream, so the connector is the natural owner;
but nothing in the pipeline consumes it, and publishing it would put a second
copy in nine JSON files that only a full refresh can correct. One table that
cannot drift from itself beats nine that can drift from each other.

**A row is not a consumer.** The panel renders every payload, so "is it used?"
is trivially true for anything in the manifest. `verify_data_contracts.mjs`
therefore searches for `data.<key>` in the SPA *excluding* `payloads.js` and
`DataPanel.svelte`: a payload must feed a figure, not just a dated row in the
freshness table.

**`pages` is what stops the manifest costing every reader every payload**, and
the route it names has to be the one the panel is dated from. `view.js#dataAge`
calls a row it holds no payload for `absent`, and `absent` is what the "some
data is missing" state renders from — so fetching one route's share while
handing the panel the whole list turns every unfetched payload into a standing
warning about an upstream that never failed. `payloadsFor` is the single way to
ask, and a contract test holds the two calls in `calculator.svelte.js` to the
same route.

## `src/lib/mirror.js` — the formulas

The only file with domain logic. Every function takes its inputs explicitly; no
closures over hardcoded data. The conventions:

- Real change = `(1+r) / (1+π) − 1`, **never** subtraction.
- Multi-year rate = `idx[now] / idx[year] − 1`, **never** subtraction.
- Two-decimal display rounding; full precision internally.
- **Index base:** `latest_index` and `index_by_year` both carry Eurostat's
  published values, on the base `index_base_year` names. `rateFor(c, year)` and
  `officialCumulativeSince2020` divide one by the other, so they must share a
  base — and nothing scales either, so nothing can scale one alone. The `y1` path returns the verbatim
  `annual_rate_pct`, which is base-invariant and therefore cannot reveal a base
  bug — always check a since-year number too ([`math.md`](./math.md)).

What is in it:

- **Personal calculator:** `rateFor`, `personalInflation`, `officialInflation`,
  `officialCumulativeSince2020`, `pocketReal`, `targetRaise` (the inverse: given
  inflation and a target real pocket, the nominal raise required), `extraPerMonth`,
  `pocketPerMonth` (the same inversion applied to the real change, so the pocket
  row can say what its percentage is worth in euro), `cashErosion`.
- **Basket drill-down (ECOICOP level 2):** `divisionRate(division, split, anchor)`
  — a division's own published rate until the user splits it, then
  `Σ(share × group rate)`; `officialSplit(division, total)` — Eurostat's
  within-division shares scaled to whatever the user allocated;
  `personalInflationDetailed`; `contributions({…})` — the **exact**
  decomposition, `Σ contributionPp === π`, which is what lets the ranked view
  claim the rows add up to the user's number. `amounts` are unit-agnostic
  (percent shares or €/month) because everything normalises by Σ — that is what
  makes the input-mode toggle a display choice rather than a second calculator.
- **Income ladder + home:** `percentile` (returns position **from the bottom** —
  copy must be "you earn more than {n}%" / «изпреварваш {n}%», never "top
  {n}%"), `composeLadder`, `buildLadder`, `rentBurden`, `rentDays`,
  `annuityPayment`, `annuityReverse`, `homeYears`.
- **Wage comparators:** `wageGap(net, ref)` — one signed distance with one
  rounding and one dead band, used by the област comparison and the
  sector one alike. It lives here rather than in `view.js` because two callers computing
  their own `(a − b) / b` is two dead bands that drift apart, and the drift
  shows up as one card saying "the same" while the other says "1% below".
  `meanRungPosition(shape)` is the sector card's correction: which rung of
  Eurostat's published ladder the mean itself sits on. **It takes no anchor**,
  which is what stops it — handed a sector average it would return the sector
  percentile nobody publishes, and there is no parameter to attempt that
  through. Same device as `headlineRate`'s refusal to accept `categories`.
  [`math.md`](./math.md) §"A sector average" has the figures and what is
  modelled in them.
- **BG payroll:** `bgNetSalary(gross, params)`, `bgGrossFromNet(net, params)`,
  `payrollParams(data.payroll)`, `bgTaxWedge`, `bgMarginalRatePct`. The
  published `payroll.json` is the source of truth; the `BG_2026_*` constants
  (`BG_PAYROLL_DEFAULT`) are an **offline sentinel** for first paint only. A BG
  law change is a pipeline table edit plus a re-run, **no SPA code change**. The
  SPA collects **net** take-home (most people know that, not their contract
  gross), back-computes the gross for the област comparator, and applies the same
  formula to that област's gross — so the comparison is net vs net.
- **Net or gross:** the pay field takes either, and `view.js#netsOf` is the one
  place one becomes the other. Amounts travel as `pay = { basis, amounts }` so
  none can arrive without saying what it is; flipping the toggle converts in
  place, and what was typed in the outgoing basis is stashed so a round trip
  restores it verbatim rather than creeping a cent per flip.
- **The household:** `householdNet(nets)` and `bgHouseholdPayroll(nets, params)`.
  The pay card collects **one net per earner**, and the total is derived from
  that list rather than typed. Inverting a combined net as a single salary
  applies one insurance ceiling to several people and understates a two-earner
  household's gross by €234/month at €2,000 gross each — [`math.md`](./math.md)
  §"A household is several contracts" has the table, and the split between the
  figures that are per person and the ones that are per household.

With the official weights, `officialInflation` lands *near* the headline HICP
rate but not on it — HICP chain-links at December, so a 12-month window
re-weights mid-flight and the two sit ~0.16 pp apart. The UI shows both.

### Testing conventions

`mirror.js` is the only place in the SPA where a wrong formula becomes a wrong
number on someone's screen, so **every exported function here has a test**, and
the tests live beside the code they protect:

| File | Covers |
|---|---|
| `verify_net_salary.mjs` | `bgNetSalary`, `bgGrossFromNet` — the cap boundary, the flat tax, the round-trip above the contribution cap, cross-checks against published BG payroll references |
| `verify_mirror_math.mjs` | everything else in `mirror.js` — the anchor contract, personal vs official inflation, the real-wage division, `percentile`'s direction, `buildLadder`, annuity + inverse, `cashErosion`, `payrollParams`, the tax wedge |
| `verify_view.mjs` | every derived value in `view.js` — which input reaches which formula, and the two boundaries below |
| `verify_stores.mjs` | every persisted key — the three preferences, and the reader's own figures behind the switch that has to be turned on first |
| `verify_contrast.mjs` | WCAG AA ratios for every ink × surface pair, both themes, computed from `tokens.css` itself |
| `verify_render_contrast.mjs` | the ratio each piece of text is actually painted at, in a browser — ancestor `opacity` multiplied in, translucent bands composited down — and every control boundary at the 3:1 WCAG 1.4.11 asks. Both themes, both languages |
| `verify_data_contracts.mjs` | `data.js`'s fallback chains, and these same functions run over the JSON committed in `data/published/` |
| `verify_legal.mjs`, `verify_static_assets.mjs` | the legal documents and the identity table; robots, `llms.txt`, security.txt, sitemap and the exact CSP |

All of them run under `npm run verify:math` (Node's built-in test runner, no
dependencies) and in CI on every push. Source-greps in
`site/scripts/verify_wiring.mjs` covers template wiring and the
claims the copy makes; they are not a substitute for exercising a formula.

**The standard a new test has to meet: break the function on purpose and watch
it go red.**

## `src/lib/view.js` — the derived values

Every number the components render, as a pure function. This is the layer between
"what is the arithmetic" and "where does it go on the page", and its functions
are shaped to make a wrong wiring *unexpressible*:

- `savingsSince2020(cash, categories)` takes the **categories**, not a rate, so
  no caller can hand it the user's own basket rate.
- `headlineRate(payload)` takes **only** `hicp_headline.json`, so it cannot be
  handed `categories` and quietly become Σ(w·r) — a different number by
  ~0.16 pp.
- `mortgagePanel({…})` reads the down payment, the maturity cap and both DSTI
  figures out of the published `lending_limits` rather than accepting them, so a
  caller cannot quote a 0%-down loan or adopt the regulator's 50% ceiling in
  place of our 30% line.

| Function | Returns | The wrong number it prevents |
|---|---|---|
| `officialBasketWeights(categories)` | the slider seed, **unrounded** | rounding makes the default basket sum to 97 and puts a third figure on screen |
| `dataAge(parts, manifest, now)` | `{rows, oldestAsOf, newestAsOf, daysOld, stale, overdue, missing}` | measuring from the *newest* payload lets one fresh file hide eight stale ones |
| `headlineRate(payload)` | Eurostat's all-items rate, verbatim | the strip rendering our Σ(w·r) reconstruction instead of the official figure |
| `pctAhead(rank)` | display position, 1–99, from the bottom | "top 63%" for a below-median income |
| `savingsSince2020(cash, headline, categories)` | `{valueToday, eaten, cumulativePct, basis}` | deflating by the 12-month rate (~5%) instead of the since-2020 cumulative (~40%) — and, since it prefers the published all-items index, showing our ~41.8% reconstruction under a sentence naming Eurostat |
| `housingCarveOut({…})` | `{housingCost, spendable}` | the per-division € column ignoring rent or the mortgage |
| `basketBudget({…})` | `{entered, spendBase, leftover, over, …}` | **a basket rescaled up to the whole salary** — thirteen euro figures nobody typed, and a headline charged on money nobody spends |
| `clampSpendShare(pct)` | the stated spend share, 0–100 | an unreadable answer read as "spends nothing", emptying every € figure on the page |
| `exposedSpend({…})` | €/month the price rise is charged on | "what the same life costs" billed against money that was never spent |
| `leftoverIfHeldAsCash({…})` | `{ratePct, valueToday, eaten}` | the unplaced money deflated by the reader's own basket rate instead of the general price level |
| `homePriceFor({…})` | the price the mortgage math runs on | a typed asking price being ignored, or a €0 home in manual mode |
| `clampTerm(years, limits)` | term, capped at the БНБ maturity ceiling | quoting a 40-year mortgage no BG bank can originate |
| `mortgagePanel({…})` | the whole home row | **the APRC amortised as if it were the interest rate** |
| `taxWedgePanel({…})` | the effective/marginal rate curve and the cap marker | a marginal rate drawn flat across the insurance ceiling |
| `scheduledMaxInsurable(payroll)` | the legislated next cap, from `scheduled_changes` | a future cap presented as if it were in force |
| `sectorComparison({…})` | the chosen activity's published average, its gross and net, and one gap per earner | the country's by-activity average being drawn as if it were the reader's own област's, or a gap computed against a gross while the reader's figure is net |
| `sectorOptions(payload, hints)` | the picker's rows, in НСИ's classification order, each leading with the everyday words for the work and ending with НСИ's own label | «Общо» offered as somebody's industry — the all-activities row is what the sections are read *against*, and in a list headed «Твоят сектор» it collects every reader who cannot find their own line. Sorting by wage is the second one: a league table is a claim the ordering makes on its own. The third is our words *replacing* НСИ's rather than preceding them |
| `verifyUrl(row, anchor)` | the "↗" target for one row | linking to the index cube while showing a rate |
| `fastestRisingDivision(categories)` | the highest-rate division | advertising the *slowest*-rising division as the fastest |
| `rankedSplit(ranked, limit)` | the rows the ranked list draws **plus the folded remainder** | a capped list under a sentence promising the column adds up — 5.1 points on screen against a stated 5.4 |
| `pocketVerdictState(raise, pocket)` | which of the seven pocket verdicts a raise lands in | the answer block and the pocket row drifting apart over one number that has not moved |
| `answerLine({…})` | the three things a reader arrives asking, as states | the plain answer ranking a reader who has typed nothing, or naming a mover out of a basket they zeroed |
| `sharePayload({…})` | the closed set of fields a share surface may carry | **a € figure beside the percentage, which inverts to the salary** |
| `shareSentence({share, copy, lang})` | the message a reader copies or hands to the share sheet | a shared number with no national figure beside it, which nobody can place |
| `barCeiling({…})` | the value both comparison bars are drawn against | the picture a reader sends showing a different comparison from the screen it came from |

### Three of these are boundaries, not conveniences

**`mortgagePanel` amortises the AAR, never the APRC.** The AAR is the interest
rate, and the annuity formula needs an interest rate. The APRC folds fees into
an annualised figure; compounding them monthly overstates the payment by
~€24/month on the published София median — plausible enough that no sanity band
would catch it. **APRC is for comparing, AAR is for computing.**

**`sharePayload` takes no salary, and that is how the € rule is kept.**
`extraPerMonth = salary × π/(100+π)` inverts exactly, so "my inflation is 5.4%,
that's €48/month" reveals the salary to everyone who reads the message. The
function that decides what may cross onto a share surface therefore has no
salary parameter at all — there is nothing for a caller to pass and nothing
downstream to invert. `verify_view.mjs` still asserts no `€`, `EUR`, `евро` or
`лв` reaches the finished string in either language at any anchor, and reads
the signature back to check the parameter list has not grown; the assertion is
the second lock rather than the only one.

**Two figures the site already computes are excluded by the same rule, and
neither carries a currency symbol.** The ladder position inverts:
`mirror.js#percentile` interpolates over rungs composed from
`salary_dist.json` and `region_salary.json`, both committed and public, so
"ahead of 34% of the country" reconstructs the net pay to within a rung's width. A
*personal* tax-wedge rate inverts above the insurance ceiling, where the
effective rate falls with every extra euro of gross. **Check a new share
surface against the inversion, not against the presence of a euro sign** — the
dangerous fields are the ones that look safe.

`SHARE_FIELDS` is the closed list of what does travel, and `verify_view.mjs`
compares it against the returned object key for key. Adding a figure to a card
means adding it there first, which is where the argument happens.

**`basketBudget` decides what the € column is a share of, and the two entry
modes measure the remainder differently on purpose.** A person who is careful
with money does not spend everything, and the two modes are not equally placed
to notice. A basket of *euros per month* is a list of real payments and carries
its own size, so the remainder is **measured** — `spendBase` is the euros
actually entered, and feeding `spendable` instead is the defect this exists to
make unexpressible: a €1,000 basket against a €1,250 budget came back rescaled
by 25%, every row a number the reader had never typed, adding to a total they
had deliberately not reached. A basket of *percentage shares* says how a pot
divides and cannot say how big it is, so there the remainder has to be
**stated** — `spendBase` is `spendable × spendSharePct/100`, the reader's own
claim about how much of their pay actually gets spent.

**The claim defaults to 100 and the parameter is optional**, so a reader who
never touches the control is charged on everything they earn, exactly as before
they had one. Anything lower would shrink their headline € figure without their
having claimed anything, which is the flattering default P7 rules out.
`exposedSpend` carries the correction into that headline and **reduces to
`salary` exactly** whenever nothing is left over, by either route.

**Only one of the two remainders is ever live.** They can disagree — one is
derived from thirteen typed amounts, the other is a sentence the reader wrote
about themselves — and a page carrying both would put two answers to "how much
do you not spend" in front of the same reader. So `basketBudget` ignores the
stated claim in euro mode, and `BasketEditor` does not render the control there.
Neither of those alone is the guarantee; `verify_view.mjs` pins the first and
`verify_wiring.mjs` the second.

What that money *is* — savings, investment, help sent home, something they
forgot — is not ours to say. The row that renders it states its size, the year
it adds to, and what prices do to money held as cash; the last of those is a
projection and carries its assumption on the line beneath (principles.md P5). "Save
it" and "invest it" are advice, which P6 and §7a close, and
`the_unplaced_money_copy_describes_and_never_advises` keeps them out.

## The basket interface

**Nothing about the classification is hardcoded in the front end.** The basket
iterates the published payload — divisions and their groups, labels, codes and
within-division shares — so an upstream reclassification reaches the page as
soon as the pipeline publishes it. A literal list would pin the basket's length
here rather than at Eurostat, and `verify_wiring.mjs` fails on one.

**The thirteen rows come first, and the ready-made baskets sit under them.**
This is an ordering rule rather than a layout preference, and it is worth the
paragraph because the obvious arrangement is the broken one. A chip row placed
directly beneath «За какво отиват парите ти?» *answers* that question — five
first-person options, exactly one of which can be lit, is a persona picker, and
a persona picker asks which of these five people you are. The thirteen rows
below it then read as what the answer produced, which they are not: they carry
a name, a code, a rate, a share and a €/month, the same anatomy as the ranked
contributions in the results card, so a reader who has met that row as an
output classifies these as one too. A user did exactly that and reported the
calculator could not hold a man who drives to work *and* feeds a family — he
had seen the sliders and read them as a readout. Two sentences in `COPY` said
otherwise, one beside the chips and one beside the number, and both lost to the
arrangement around them. Under the list the same chips are what they are:
somewhere to start, met after the instrument.

Three things follow, each with a test in `verify_render_basket.mjs`:

- **A chip names a basket, never the reader.** «с кола всеки ден», not «карам
  кола всеки ден». `verify_copy.mjs` holds the first-person markers, in both
  alphabets — note that `\b` is ASCII-only in JavaScript, so the BG side
  delimits with lookarounds or matches nothing at all.
- **The loaded chip is marked, not crowned.** A solid `--ink` fill is the
  strongest "this is the answer" signal the app has, and a basket somebody can
  drag away from in one gesture does not get it.
- **A slider row has to read as a control before it is touched**, against the
  app's own bar charts: a groove rather than a bar, an 18px handle with a grip
  rather than a dot, 24px of hit area, and a row-level focus mark. None of it
  is motion — `tokens.css` drops every transition under
  `prefers-reduced-motion`, so an affordance that animates does not reach that
  reader, and the render suite opens a reduced-motion page to prove this one
  does.

**There is no mechanism for combining two ready-made baskets**, and the request
for one is the failure above arriving as a feature. Four of the five are
invented (`content.js`), so averaging two of them yields a third with less basis
than either, published in the same voice as a Eurostat figure — P3 and P7 in one
move. A reader who wants to mix two baskets has understood that his life is a
mixture, which is what the sliders are for.

Eurostat publishes four levels of ECOICOP. We expose **two**:

| Level | Codes for BG | Exposed? | Why |
|---|---|---|---|
| Division (`CP07`) | 13 | Always | Thirteen rows is already at the edge of what someone will read |
| Group (`CP072`) | 46 | Behind *"show more detail"* | This is where the decisions people make live: car vs tickets, rent vs electricity, medicines vs hospital care. 46 rows at once is a spreadsheet; 3–8 rows inside one division you chose to open is a question you can answer |
| Class (`CP0722`) | ~90+ | No | Below the resolution of anyone's memory of their own budget |

**Progressive disclosure with one rule that makes it trustworthy: opening a
division changes nothing.** An untouched division keeps its own published rate;
only editing a group inside it switches to the user's split. Recombining a
division's groups at Eurostat's own shares gives a slightly *different* number
than the published division rate, so "untouched" has to mean the published rate
or the act of looking would move the answer. `mirror.js#divisionRate` encodes
it. The first edit materialises the split from Eurostat's own within-division
shares (`officialSplit`), so the user adjusts away from the national average
rather than from zero, and a `your own split ↺` chip puts it back.

**Two ways in: percentage shares or euros per month.** People know their euros
better than their percentages, so the `€ per month` mode swaps each slider for a
number input and shows a running tally against take-home. Both modes write to the
**same array** and every consumer normalises by Σ, so `setSpendMode` *converts*
rather than resets — flipping the toggle cannot move the user's inflation
number. That property is why the toggle is safe to offer.

**The ranked contribution view**, one row per division, most-severe first:

```
Transport & fuel        CP07 ↗                        +1.6 points
████████████████████████████████████
you spend ≈ €216/mo · it rose 11.0% · that costs you ≈ €21 more a month
```

- **The percentage-point column adds up exactly** (`Σ contributionPp === π`),
  which is why the copy can say so with no caveat and why the bars are
  comparable.
- **The euro figure is priced off that row's own spend**, so it does not sum to
  the whole-basket euro figure above — the column is never totalled on screen.
- **Groups that got cheaper go negative**, coloured the other way, and say so.
- **The third line is the working, and it starts folded** behind one control
  for the whole column rather than a disclosure per row. It repeats verbatim
  down the table, so five rows on a phone is five three-clause sentences
  between the reader and «в джоба»; five chips would be more furniture than the
  five sentences they hide. The name, the verify link, the points and the bar
  stay — what folds is how the points were arrived at, and a reader comparing
  rows wants that on all of them or none.

- **The list is capped at eight rows and the remainder is still on screen.**
  `rankLead` tells the reader the rows sum to exactly their number, and
  `contributions` makes that true of *all* of them — but twelve divisions clear
  the drawing threshold on the default Bulgarian basket, so a capped column
  stops at 5.1 under a sentence saying 5.4. `view.js#rankedSplit` returns the
  folded tail with the rows, `verify_view.mjs` asserts `Σshown + restPp === π`,
  and the template draws it. Capping a list that a sentence promises adds up is
  only safe if the tail is rendered.

**The source line under the table names only upstreams that put a number on
this page.** A dataset that sounds like it belongs — `ilc_di01`,
`namq_10_lp_ulc`, `prc_hpi_q` — is in no payload and puts no figure on the
screen, and the three that carry the pay ladder, the област wage and the €/m²
(`earn_ses_monthly`, НСИ, имот.bg) are the ones easiest to leave out, because
nothing on the basket table came from them.
Citing a source we do not use breaks the traceability claim from the other
side: the first reader who follows the link finds a dataset with none of our
figures in it. `test_the_sources_line_names_only_upstreams_this_page_uses`
compares the cited set against the dataset ids in the provenance fields of
every payload `loadAll` actually fetches, **in both directions**.

**Every row stays verifiable.** Divisions link to their own Eurostat extract;
groups link to *theirs*, because a group inheriting its parent's link would send
the user to a different number than the one on their screen. Each row's tooltip
carries `eurostat_label`, Eurostat's own wording for the code, so our
plain-language name is checkable rather than authoritative.

**The tooltip is where it goes, and not the row.** Rendered under the name, the
label puts «Housing, water, electricity, gas and other fuels» beneath «Ток,
вода, парно, наеми» for a reader who chose Bulgarian — four lines of a language
they did not ask for, thirteen times over, in the column a 360px phone has least
room for. It belongs on the verify link because that is the row that goes to
Eurostat, and the label is the claim about what the bucket officially is rather
than decoration on our translation. `verify_render_basket.mjs` §"a Bulgarian reader's
basket table is in Bulgarian only" holds both halves — no Latin script in the
visible name, and the official wording still on the link.

**The pipeline drives all of it.** No count, no name, no rate and no sub-group
is written into the SPA — the front end renders `hicp_categories.json`. If
Eurostat reclassifies, the pipeline republishes and the UI follows.

## `src/lib/stores.js` — everything this device is allowed to keep

Four `writable` stores with `localStorage` persistence:

| Store | Values | Default with no saved preference |
|---|---|---|
| `lang` | `"bg" \| "en"` | the language `<html data-lang>` declares; at `/` alone, the saved preference, then `"bg"` (`DEFAULT_LANG`). `navigator.language` is deliberately **not** consulted |
| `theme` | `"light" \| "dark"` | `matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"` |
| `region` | an `region_salary.json` code, or `""` | `""` — no default at all, and that is P7: a preselected София hands a Бургас reader Sofia's wage and Sofia's €/m² wearing the appearance of a choice they made |
| `rememberInputs` | `boolean` | `false`, and the reader is the only thing that turns it on |

**Why `lang` ignores the browser.** This is a calculator of Bulgarian prices,
Bulgarian payroll law and Bulgarian housing, for a person living in Bulgaria
today
([`README.md`](./README.md) §"Who this is for") — and a great many of those
people browse on a device whose UI
language is English. Deriving the default from `navigator.language` served them
the English site on first paint, which is the one guess we can be wrong about
before the reader has told us anything. `theme` keeps its OS fallback, because
`prefers-color-scheme` is a statement about the device rather than a guess about
who is holding it.

**The URL outranks the saved preference, and the root is the exception.** Every
page is served at two addresses and each entry hardcodes the language it
declares, so `initialLang()` reads `document.documentElement.dataset.lang`:
rendering `/en/legal/` in Bulgarian because this device once stored `bg` makes
the page contradict the document a reader and a crawler were both handed. `/` is
where a stored choice still decides, because it is the one address that names no
language — what a person types, and what a bookmark holds.

**Switching language is a navigation.** `langHref(page, to)` says where a route
lives in a language, and each header renders one anchor per language so the pair
is stripped by the same rule as every other pair. `chooseLang(to)` records the
choice on the click and does not touch the store — the counterpart document
declares its own language, and repainting a page a reader is leaving would put
it in a language its `<html lang>` no longer matches. Navigating IS choosing, so
that write is inside the ЗЕТ чл. 4а exemption below; being SERVED a language is
not, and nothing is written on arrival. With the bundle off the anchor still
works, which a handler could not: the entry's `data-lang` is fixed and nothing
on the served page can change it.

`theme` and `lang` push their value into `document.documentElement` as a
`data-theme` / `data-lang` attribute, which `tokens.css` reads to switch
palettes and hide the language the page is not in. `toggleTheme()` is the one
toggle helper left. Everything here swallows `localStorage` errors silently —
private mode, quota exhausted, no DOM — it simply does not persist.

The persisted keys are `vyarno_lang`, `vyarno_theme`, `vyarno_region` and
`vyarno_inputs`, exported as `LANG_KEY` / `THEME_KEY` / `REGION_KEY` /
`INPUTS_KEY`. `readPreference(key, isValid)` returns a saved value only where
`isValid` accepts it, so junk is absent rather than adopted — and the exported
names are read straight out of this file by `verify_legal.mjs`, which fails when
the privacy notice does not name one of them in both languages. Tested in
`verify_stores.mjs`, which installs a fake `localStorage` / `document` /
`location` / `navigator` / `matchMedia` per case and re-imports the module under
a unique query string, because `stores.js` reads storage — and the document's
declared language — at module-evaluation time.

**Nothing is written until the visitor chooses something, and that is a legal
constraint rather than a taste one.** A Svelte `writable` calls a new subscriber
synchronously with the current value, so a subscriber that persists on every
value writes on first paint — with defaults, for a reader who has touched
nothing. `persistOnChange` swallows that first call. ЗЕТ чл. 4а, ал. 4, т. 2
exempts storage «изрично поискана» by the recipient; a default nobody asked for
is the weakest available form of that argument, and the notice's «избраният
език» would not be true of it either.

**`vyarno_inputs` is the reader themselves, so it is the one key with a switch
in front of it.** It holds what they typed — pay, raise, rent, savings, basket,
splits, the home block — versioned, and dropped unread when the version does not
match, because a basket saved against thirteen divisions and read back against
fourteen is a wrong number wearing the appearance of the reader's own choice.
The risk it opens is not the network one P1 is about: a stored salary is exposed
to the next person holding the device. Hence off by default (P7), a one-line
label that says so, a «forget everything on this device» button beside the
switch, and deletion in the same action as switching off — a switch that stops
writing while yesterday's figures stay on disk is the state the design makes
unreachable. `Calculator#snapshot` writes it and `Calculator#restore` reads it
back, refusing a snapshot whole when the payload's divisions, a division's
groups or the pay card's `MAX_EARNERS` no longer fit: those are sizes, and
`stores.js` deliberately knows nothing about the payloads. `App.svelte` holds
the only two effects that call either.

## `src/lib/content.js` — copy, presets, offline sentinels

- **`COPY`** — the BG/EN dictionary, in both languages, and `t(key)` looks up
  the variant for the current `lang` store. **Everything JavaScript has to
  select, interpolate or hand to an attribute belongs here**: a string chosen by
  a branch, one carrying a `{slot}`, an `aria-label`, a `<title>`. Long
  bilingual prose does not — it is written inline as paired `.l-bg` / `.l-en`
  spans in the component that renders it — both variants ship in the DOM and
  `tokens.css` hides one — because a paragraph split between a copy file and a
  template is edited in two places and reads as neither. `How.svelte` and
  `ExplainerBand.svelte` are most of that prose.
- **`PRESETS`** — five starting baskets, one number per ECOICOP ver.2 division
  in published order. `official` is the real Eurostat BG basket, kept as a
  first-paint fallback — the live weights replace it as soon as
  `hicp_categories.json` resolves, and `verify_data_contracts.mjs` fails if the
  copy drifts more than 3 pp. `driver`, `family`, `noCar` and `pensioner` are
  **hand-made illustrative starting points, not survey data**, and the line
  above the chip row says so by naming which of the five Eurostat published.
  The chips sit below the sliders and name baskets rather than people — the
  ordering rule and its failure are in §"The basket interface" above. Every
  vector must have exactly as many entries as the
  published basket and sum to 100 — a short vector leaves the tail divisions
  `undefined` and silently drops them from Σw.
  `every_preset_covers_every_published_division_and_sums_to_100` enforces both.
- **`HOME`** — offline sentinels. Each duplicates a published value for first
  paint only, and `verify_data_contracts.mjs` fails when one drifts past its
  band (rate ±0.75 pp, the област wage ±10%, €/m² ±20%, down payment and term
  exact).

Three copy rules this file has to keep:

- **Write for someone who does not know the vocabulary, and never at the cost of
  the number.** The reader is the person in [`README.md`](./README.md)
  §"Who this is for": they are paying these
  prices this month, and they have not met "the effective rate", "the marginal
  rate", "the distribution's shape" or "the next euro". Every such term is
  either replaced with what it is a share *of* («удържа се от увеличението»,
  «удържа се от цялата заплата») or explained where it first appears. Two
  failure modes are equally bad: jargon the reader skips past, and a
  simplification that has stopped being true. Translated idiom counts as jargon —
  «ориентир, не присъда» was a word-for-word calque of "a guide, not a verdict"
  and is not something anyone says in Bulgarian. Where a caveat is needed, say
  what the number *is* («показва приблизително къде си, а не точно»).
- **`medianDefault` must not call the pre-filled salary typical.** We publish no
  national median net wage; the only median in the data is the P50 of the net
  ladder this site composes, and the placeholder sits close enough to it that
  calling it typical would be borrowing that card's provenance (P7).
  `the_salary_default_is_never_called_a_median` fails on the words
  "median" / "медиан" / "typical" / "типичн" in that key.
- **`presetActive` must travel with the number.** The four hand-made presets
  yield headline figures in the same voice as the Eurostat one, so the results
  card carries the caveat while a hand-made preset is active. The `official`
  chip is real published data and is deliberately not caveated.

Staleness is **not** driven by a hardcoded date, and not by a single
threshold either. `Calculator#load` calls `view.js#dataAge(data, PAYLOADS)`,
which judges each payload against the cadence its own manifest row declares:
past it the row is *due*, past 1.5× it is *overdue*, and the banner fires when
something is overdue — naming how many rather than implying all nine are. One
flat threshold could not serve four release rhythms; 45 days is late for the
monthly HICP release, perfectly normal for the quarterly НСИ wage series, and
meaningless against a survey Eurostat runs every four years.
`view.js#STALE_AFTER_DAYS` survives only as the fallback for a manifest row with
no declared cadence.

## `src/App.svelte` — the composition root

Owns the page's shape and nothing else: the header (lang + theme toggles, "as
of" date), the banner, the two cards, the national strip (see below), the
explainer band, the footer — plus the two states that replace the calculator
entirely, loading and load-failed. It constructs the `Calculator`, calls
`calc.load()` on mount, and passes it down as one prop.

It is 248 lines. It was 5,678 two sessions ago and 3,300 one session ago, and
what unlocked the last cut was not a better division of the markup but moving
the state out from under it.

### `src/lib/calculator.svelte.js` — the state everything reads

Runes are not confined to `.svelte` files, so the whole reactive graph lives in
a `Calculator` class here: the `$state` the reader types into, the `$derived`
graph over `data.js`/`mirror.js`/`view.js`, the loader, and the handlers.

The reason it exists is testability, by way of prop count. The inputs card and
most of the result rows read some sixty values out of one graph. While that
graph was in `App.svelte`'s `<script>`, extracting a row meant threading twenty
props into it and the next row wanted a different twenty — `HomeRow` and
`TaxWedgeRow`, extracted that way, still take fifteen each. A component now
takes one `calc` prop, and its prop list stops describing the graph's internals.

Two rules it holds to:

- **Nothing computes here.** Every `$derived` is a call into `view.js` or
  `mirror.js` with named arguments. See the note under the layer table.
- **Nothing picks words here.** The module is language-agnostic, so
  `cityPriceDated` and the preset label live in the components that render
  them — where `$lang` auto-subscription works anyway. `shareSentence` is the
  shape this takes for a string built in `view.js`: the words arrive as an
  argument and the component chooses which language to ask for.

One convention, with no exception to remember: **every mutating handler is an
arrow-function class field, never a method.** A template that passes a method
bare — `oninput={calc.onRaiseInput}` — hands over a detached function whose
`this` is `undefined`, and that failure is a runtime error inside an event
handler, which is to say a silent one.

### The components

`PayField`, `InputsCard` (with `BasketEditor` under it) and
`ResultsCard`. `ResultsCard` is a running order rather than a template: the
headline, then `ResultsAnswer`, then one component per receipt row —
`ResultsSummary`, `PocketRow`, `PercentileRow`, `TaxWedgeRow`, `RentRow`,
`HomeRow`, `LeftoverRow`, `SavingsRow` — so which rows the calculator answers,
and in what order, is forty lines of markup. Each row decides for itself whether
it renders; `RentRow` is empty without a rent, `HomeRow` without the home block.

Two components close the card and they are not rows. `ShareCard` draws the
picture a reader sends; `ResultsWordmark` is the wordmark and the tagline
anchored to the bottom edge. **The names are worth reading carefully, because
they were once one file and the wrong way round** — a component called
`ShareCard` that rendered a wordmark is a name that costs the next person an
afternoon, which is why the share work started by fixing it.

`ShareCard` is the only canvas in the app, where every chart is inline SVG, and
the reason is narrow: the artefact has to leave the page as a PNG, and an SVG
serialised into an `<img>` resolves no `@font-face` from the document that made
it, so the card would come back set in the system stack. Getting the faces back
means base64-ing four woff2 files into every card. A canvas draws with the
fonts the page already has, and it is still zero dependencies and still nothing
third-party, which is what the SVG rule was protecting.

**Where the sentence can go, and what it loses on the way.** `navigator.share`
is absent on most desktops, so the block also offers `viber://`, `t.me` and
`wa.me` links built from the same `shareSentence` the clipboard button copies.
A URL scheme carries text and cannot attach a file, so **the picture stays
behind** — which is why that row sits under a line of its own saying so
(`COPY.shareChatNote`) rather than beside the share-sheet button that sends
both. The sentence ends in the full `https://vyarno.bg`, so travelling alone
costs a recipient nothing they could not check; P9's fallback to the source
name and the date is for the image, which physically cannot carry a link.
Facebook Messenger is deliberately absent: its web dialog needs a registered
`app_id` and the `fb-messenger://` scheme reaches only a device that has the
app, which is the case the share sheet already covers.

Every one of those hrefs is the message and nothing else. No `utm_`, no `ref=`,
no click handler, and the address handed to Telegram is the bare origin — «a
share count, a click event or a campaign parameter on an outgoing share» is on
the closed list in [`principles.md`](./principles.md) without qualification.
`verify_render_share.mjs` reads the rendered attributes and holds every
parameter of every outgoing link to that, as a rule rather than per link, so a
fourth destination is covered on the day somebody adds it.

Their shared anatomy is in `$lib/card.css` (the grid, the two cards, the field,
the `.vlink` verify arrow) and `$lib/result-row.css` (the row itself). Both
exist because Svelte scopes a
component's `<style>` to its own markup and these rules span three files by
construction — `.m-grid > .m-card:first-child > .field` cannot be written in
any one of them. Decoration that belongs to one component stays with it.

### The national strip — five tiles and one feature card

HICP headline · median net pay (the country) · average net pay (the chosen
област) · fastest-rising category · unemployment, then the €/m² card for the
chosen град, carrying that city's own sparkline. Three layout rules, each of which was a visible defect
before it was a rule, and all three are held by
the national-strip tests in `verify_render_strip.mjs`:

- **`.stats` is a wrapping flex row whose items grow, never a fixed-column
  grid.** `auto-fit` columns hold their width, so a card count that does not
  divide by the column count leaves the tail of the last row empty — a 5-up row
  plus one orphan. With `flex-grow` the last row's cards widen to fill it, so a
  row is always full at every width.
- **The charted card takes a row of its own** (`.stat.wide { flex: 1 1 100% }`)
  and is rendered **last**. Cards in a row are `align-items: stretch`, so a
  card twice its neighbours' height would stretch every tile beside it to
  match — a stat tile with 120px of nothing under its label. Being last also
  keeps the tiles in one uninterrupted run.
- **Every card is gated on its own payload, never on what the reader typed.**
  The average-wage card was once gated on `salary > 0` although nothing
  on it is personal, which made "the country at a glance" change shape — and
  gave the strip a card count (5 or 6) that no layout can be tuned for.

Each card is `value → label → (chart) → source`, with `.ss` taking the slack
(`margin-top: auto`) so the source captions line up across a row. Extra footer
lines stack **inside** that one `.ss`: three sibling `.ss` blocks meant three
rules and three paddings, which is what made the median-pay card twice the
height of its neighbours.

### Three cards, and the order a phone reads them in

The grid holds `PayField`, `InputsCard` and `ResultsCard`, and the DOM order in
`App.svelte` is the **phone's** order: ask, answer, refine.

That is what the split is for. Below the breakpoint the results card is placed
ahead of the inputs — the payoff should not sit under thirteen basket sliders —
and with net pay inside the inputs card that put the one field every figure on
the page is priced off **2,969px down a 6,670px page**, five screens past the
figures computed from it. A reader who wanted to answer the page's one question
had to scroll past every answer to find where to put it. Lifting that single
field into its own card puts it 449px in, above the fold on a 664px phone, with
the top of the results card visible under it.

Three things hold the arrangement up, each of which was a defect first:

- **Every rule names its card** — `.m-pay` / `.m-inputs` / `.m-results`, never
  `:first-child` or `:nth-child(2)`. A positional selector keeps matching after
  a card is inserted and silently means a different one, which would have moved
  the field rhythm and the results card's flex column onto whichever card
  happened to be first. Naming them is what makes the DOM order free to serve
  the reader instead of the stylesheet.
- **The left column is a real element** (`.m-col`), not two grid rows. Two rows
  with the results card spanning both looks equivalent and is not: the spanning
  card is the tallest thing in the grid, so it sizes the rows, and
  `align-items: start` then parks each input card at the top of a row far
  taller than it — a 28px hole opens between two cards drawn to look like one.
  Below the breakpoint `.m-col` becomes `display: contents`, so its children
  become grid items and `order` can put the results between them. One DOM
  order, both layouts, and no second copy of the pay field to keep in step.
- **The seam is closed on a wide screen.** `.m-pay` drops its bottom border and
  its lower radius so the two read as one card with a rule between its
  sections. Without it, a split made for the phone's sake would be a visible
  change to a desktop layout that had nothing wrong with it.

**The breakpoint is 820px, not 880.** An iPad in portrait is 820 CSS px and was
taking the phone stack, which put its salary field 2,465px down a screen with
room for both columns side by side. Two columns hold their shape to about
800px; below that the basket sliders and their labels start colliding.
`a_portrait_tablet_gets_two_columns_not_the_phone_stack` checks both sides of
the boundary, and `a_phone_is_asked_before_it_is_told` asserts the ordering
rather than any pixel figure — the numbers above move with every copy edit, the
sequence must not.

### Three tiers, and the one thing that may never move down one

The results card holds a headline figure, a plain answer and eight receipt rows,
and readers reported the whole of it as "super hard" — not wrong and not
missing anything, a wall of small sentences and figures. So each row is tiered,
and the tiers are a contract rather than a layout preference:

| Tier | What is in it | Where it lives |
|---|---|---|
| 1, always visible | the figure, its label, **one** plain sentence of what it means for this reader, **its source caption, its `as_of` and its verify link**, and any caveat the claim cannot stand without | the row itself |
| 2, one tap | the derivation, the per-earner breakdown, a second finding the reader has to want before the answer is worth reading, the reason a curve bends | a `<details class="rr-more">` with `summary.disclose` (`disclosure.css`) |
| 3, one tap, page level | the method, the sources table, the explainer | `MethodDrawer`, `DataPanel`, `ExplainerBand` |

**Prose may move down a tier. A source caption, an `as_of` date and a verify
link may not.** Most of the small grey text on this page is `.rr-note.ss`
captions and `.vlink` arrows, so folding "the small grey text" is the obvious
density move and it is the one
[`principles.md`](./principles.md) §"Publish the method" forbids in bold: a
caption a reader has to go looking for has been degraded as surely as one that
was deleted, and the difference is invisible in a diff that only adds a
`<details>`. `no source caption or verify link is folded out of view` in
`verify_render_results.mjs` is what makes it visible.

**A caveat may not be folded away from a claim that stays visible**, and the
converse is fine: `LeftoverRow` puts the one-year projection and its P5
assumption behind the same summary, so neither can be met without the other.
The instance that matters most is the ladder, whose caveat is the longest
paragraph on the card and therefore the most tempting thing on it to fold —
over a second-person ranking of the reader against their neighbours. That pair
has its own test.

The receipt rows are near their floor under that rule. What the tiering bought
is where the answers land rather than how tall the page is: on a 390px phone
with a salary and a raise entered, the last of the four things a reader arrives
asking moved from 2,315px to 1,476px — 2.7 screens to 1.7.

### The two bars carry the figures; the verdict under them carries the words

Density on this card has two moves that look alike and are not. **Folding a
figure out of the default view is not ours to decide** — the tax-wedge chart and
the comparison bars stay open for that reason. **Saying the same figure twice on
one screen is a different thing**, and the pair of comparison bars is where it
shows: the bars state the reader's rate and the average, labelled, to one
decimal, over the period their caption names, and `barCeiling` draws them
against a shared scale so the two can be compared by length. A paragraph
directly beneath that reprints both rates puts the same pair 20px apart, and a
reader who meets a number twice reads the second copy looking for the difference
from the first.

So `.m-verdict` says what the bars cannot: which rate is bigger, and whether the
gap is worth calling one — `nearOfficial`'s ±0.8 pp dead zone at the one-year
anchor, wider at the others. Three sentences, no figure. `the verdict names the
comparison in words, over bars that keep both figures` in
`verify_render_results.mjs`
holds both halves, because they pull against each other: it asserts each bar
still states a rate to one decimal AND that the sentence beneath them carries no
digit.

### The plain answer, and why it is a component rather than a paragraph

`ResultsAnswer` sits between the headline figure and the ranked table: after the
number it is about, before the working that explains it. Readers arrive asking
whether their pay is keeping up, where that puts them, and what is getting
dearer or cheaper, and the card answered all three — in the pocket row, the
ladder row and the ranked list, each under its own derivation, two and three
screens down.

It introduces no arithmetic. `view.js#answerLine` decides which of the three can
honestly be stated and in what state, and the component picks the words. Three
things about it are load-bearing:

- **Two of the three clauses refuse to compute**, and the refusals are the
  point. `stand` needs a typed salary rather than merely a rank — a visitor on
  €2,400 told on arrival that they out-earn a third of the country has been told
  something false about themselves before typing a character, which is the rule
  `PercentileRow` keeps in its own corner. The answer block sits a screen above
  that row, so a summary that outran it would move the defect up the page rather
  than remove it.
- **The pay verdict comes from `view.js#pocketVerdictState`, which `PocketRow`
  also reads.** Two ladders of thresholds a screen apart drift, and silently:
  the summary calling a raise ahead while the row below calls it level, over one
  number that neither of them moved. The row keeps all seven states because it
  prints them beside a signed figure; the answer block collapses the three
  near-zero cases, because up there is nothing to contradict.
- **It is outside the headline's `aria-live` region**, for the same reason the
  region is scoped at all: four sentences inside it are four sentences re-read
  on every tick of a slider that moves none of them.

`answerLine` reads the reader's OWN basket rows for the mover clause, and both
directions are sign-gated — a basket where nothing fell must not be handed its
least-bad row as a saving.

### The ranked table folds where the column is narrow

Eight rows is around 1,000px, and on a phone that is a screen and a half of
table between the headline figure and «в джоба» — the row that answers whether
the reader's raise beat their prices, which is the question the site is named
for. A narrow list draws five, which carry 3.9 of the default basket's 5.4
points, and `покажи всички 13 групи` unfolds the rest.

Two properties make the cap safe, and neither is optional:

- `view.js#rankedSplit` folds whatever is not drawn into a remainder, so
  Σshown + restPp === π **at any limit**. The cap changes a number in a call,
  not the arithmetic. Capping a list that `rankLead` promises adds up, without
  rendering the tail, is the defect `verify_view.mjs` exists to catch.
- The limit comes from the list's **own measured width**
  (`bind:clientWidth`), not from a `matchMedia` on 820px. A second copy of the
  layout breakpoint in a file that cannot see the first is a drift waiting to
  happen, and what actually decides whether eight rows are readable is the
  width this list got — which is also why a 7fr column on a 834px tablet folds
  too. Before the first measurement the width is 0 and the desktop cap applies,
  erring towards showing more.

### The card says whose salary it is computing with

The €900 default is a worked example — a page whose figures are all em dashes
until someone types demonstrates nothing — and the hint under the input says so
in `COPY.medianDefault`. That arrangement holds on a desktop, where the two are
200px apart, and breaks on a phone: `card.css` orders the results card **first**
below 880px, which puts the input ~3,100px under «≈ €46 повече всеки месец ти
струва същият живот отпреди година». Four screens is not a caveat.

So `COPY.startingSalary` repeats it where the figures are, under the headline
block, until `Calculator#salaryDirty` flips on the first keystroke in the salary
field — the same shape as `raiseDirty` next to it. It interpolates the live
`salary` rather than spelling out 900, so the sentence cannot drift from the
default it describes, and it carries the page's only route from the results back
to the inputs: `ResultsSummary#focusSalary`, which focuses before it scrolls
because focus is what raises the phone keyboard.

**`PercentileRow` does not take that deal, and the difference is what the
sentence claims.** A euro figure is arithmetic about prices scaled by a salary,
and naming the salary makes it honest. «Изпреварваш 34% от работещите в
страната»
is a ranking *of the reader* against their neighbours in the second person, and
a visitor who earns €2,400 has been told something false about themselves before
touching the page. No caveat rescues that, so the row waits — corner figure and
sentence together, because a bare «пред 34%» over a prompt asking for a salary is
the claim with its caveat removed. It is the treatment `PocketRow` already gives
an empty raise.

`PayField` applies the same rule to the payslip and the област comparator: the
gross, the deductions and «твоята нетна заплата е 39% под средната» are facts
about whoever earns the placeholder until the reader replaces it. Withholding
them also keeps the first paint short enough that the headline figure stays on
the first screen of a phone with the pay field above it.

The render tests that hold all of this are
`an_untouched_salary_is_named_where_its_figures_are…`,
`the_route_from_the_headline_to_the_salary_field_lands_on_it`,
`the_ladder_row_ranks_nobody_who_has_not_typed_a_salary`,
`the_placeholders_payslip_and_comparator_wait_for_a_salary` and
`every_verify_link_is_drawn_the_same_in_both_cards`.

### The sector card compares against an average, and has to say so

Under the област comparator sits a picker of НСИ's 19 NACE Rev 2 sections and,
once one is chosen, the reader's distance from that section's published average
— net against net, `view.js#sectorComparison` over `mirror.js#wageGap`. The
figures are small; the copy around them is most of the work, and every line of
it is answering something the number would otherwise imply on its own.

**"Below your sector's average" is not "below the middle", and a disclaimer
does not fix it.** Earnings are right-skewed, so an average sits above the
median — on the shipped SES shape the mean lands at the 66th rung and the median
earner takes 74% of it. Someone told they are 18% below their sector's average
hears that they are paid less than most people in it, and may be paid more.
A negation in small type does not land, so the correction is carried as a figure
the reader can use instead: `COPY.sectorAverageFlatters` prints both published
SES figures and the rung, marking which of them is modelled.
**`COPY.sectorNoRank` says the plain thing separately** — nobody publishes how
pay is spread inside a Bulgarian sector — because the absence is the reason the
card is shaped this way and a reader is owed it whether or not they read the
calibration.

**The sector table is the country's; the line three rows above it is one
област's.** `Labour_1.1.2.1` covers all of Bulgaria, so stacking the two
comparisons silently charges the gap between the reader's own област and the
country to their industry — a builder in София reads «144% над средната за
„Строителство“» and most of that is the city. So `COPY.sectorNationwide` puts НСИ's all-activities cell
(1407 € gross at 2026-Q1) on screen beside the section's, and the reader does
the comparing. **Neither figure is divided by the other**: the ratio would be
our arithmetic under НСИ's name, which is the thing `docs/legal.md` §НСИ and
gate 7 both exist to prevent.

**The picker leads with the words for the work; every claim keeps НСИ's name.**
A classification title is written for the classifier, not for the person being
classified: «Създаване и разпространение на информация и творчески продукти;
далекосъобщения» is 78 characters that do not contain the word for anybody's
job, and a developer scanning nineteen of those does not stop on it. The word
they are looking for sits two levels down in division 62, which the picker never
shows. So each option reads «ИТ и софтуер, телекоми, издателства, кино и ТВ —
Създаване и разпространение…», hint first because a phone truncates the tail of
a closed select and the front is the part used to find a line.

`content.js#SECTOR_HINTS` holds them, keyed by the payload's own `en_name`, and
**every item in a hint is a division inside that section** off НСИ's КИД-2008
structure — «кол центрове» is 82, «зъболекари» is 86, «кино и ТВ» is 59 and 60.
That is what keeps a hint from becoming a claim. «ИТ» alone for J would be one:
the section is also publishing, film, radio and telecoms, and its average is
diluted across all of them, so naming the breadth tells a reader what the figure
is an average *of*. An empty hint is a decision — `Строителство` and
`Образование` say what they are — and a section with no entry at all is a red
test, so an НСИ rename surfaces instead of quietly rendering a bare title.

`sectorOptions` composes in one direction and has no branch returning a hint
alone, so an option cannot name a section something НСИ did not call it; the
test asserts every option still *ends with* their string, character for
character, in both languages.

**Both labels are НСИ's own, and the verify link follows the label.** The two
language editions of the workbook are read precisely so the section names are
never ours — «Създаване и разпространение на информация и творчески продукти;
далекосъобщения» is section J, and nobody reads that as «ИТ», where our
translation of "Information and communication" invites exactly that. So
`sourceUrl` and `sourceUrlBg` are separate: a Bulgarian reader sent to the
English workbook cannot find the row they just read, and a verify link that
demonstrates nothing is worse than none (P3, P9).

**The gap reaches no share surface.** It inverts harder than the ladder position
already on `principles.md`'s closed list — that one is bounded by a rung's
width, this divides by one of the averages published in `sector_salary.json`,
so "18% below Information and communication" is one net wage to the euro, and
naming the sector has already narrowed the sender to one of the nineteen
sections the picker offers.
`sharePayload` takes no sector, and `sharePayload_cannot_be_handed_a_salary`
in `verify_view.mjs` pins its whole parameter list, so it cannot acquire one
without a red test.

### More than one income, and which figures know it

`PayField` holds a **list** of incomes and starts with one, so a single earner
meets a card that has not changed: one field, one payslip, and no control
describing a situation they are not in. There is no "household mode" flag —
`earners.length` is the only state, because a checkbox would be a second source
of truth able to say "household, one income", which means nothing and would have
to be handled everywhere.

Adding an income seeds it **empty**, not with the €900 placeholder. A prefilled
second field adds €900 to the rent burden, the mortgage cap and the basket the
moment it appears — figures the reader never typed, all of them moving in the
flattering direction. `an_empty_second_income_changes_nothing_until_it_is_answered`
holds it.

Below the fields, a figure appears **once per person** where it describes a
person and **once** where it describes money. Per person: the gross and its
payslip, the position on the ladder, the comparison with НСИ's област average,
and the marker on the wedge curve. Once: the household's take-home, the basket,
rent, and everything about a home. [`math.md`](./math.md) §"A household is
several contracts" carries the table and the reason.

**One raise per income**, and they live in `InputsCard` rather than beside the
pay fields — the raise is optional, and the pay card is ordered first on a phone
precisely so the question it asks stays short. The combined figure is weighted
by what each earner was paid *before* ([`math.md`](./math.md)), so it is not one
of the numbers the reader typed and not the average of them either; `PocketRow`
prints the parts underneath so it can be checked. Until every income has
answered, the row names the ones still missing and states nothing.

Two consequences worth knowing before editing a sentence here:

- **The second person has to go** once there are several earners. «Изпреварваш
  61%» addressed to a household is a claim about a person who does not exist, so
  the ladder switches to a line per income (`COPY.pctEarnerLine`) and states the
  median once underneath.
- **The corner figure becomes a range.** The row cannot choose which earner
  speaks for the household, and picking the first makes an arbitrary one do it.
  «пред 34-62%» is true about where the people in this household sit; any single
  number in that corner is not.

### The pocket row says which state it is in

Seven states, seven sentences (`COPY.pocketOk` / `pocketBad` / `pocketZero` /
`pocketNearUp` / `pocketNearDn` / `pocketNone` / `pocketCut`), chosen once in
`pocketVerdict`. A ±1 pp dead zone is right and stays, but **«точно» must not
be said inside it** — «увеличението точно покрива твоите цени» printed beside a
figure reading «−0,3%» is a false sentence over correct arithmetic. «Точно» is
bound to `pocket === 0`, the band says which side of the line it is on, and
no-raise and pay-cut get their own
sentence instead of being told their raise was eaten. The verdict is followed
by the figure in **euro** (`pocketPerMonth`), dropped when it rounds to zero.

**Any percentage that can go negative goes through `signedPct`.** `+{fmt(x)}%`
printed «+−1,2%», and it was reachable three ways: a pay cut is typeable, and π
follows the sliders onto groups whose published annual rate is below zero, which
also hit the card's own headline. The template never writes a `+` next to a
formatted number; a hardcoded `−` is still fine for payslip deductions, which
are magnitudes that only ever come off. `no_percentage_is_printed_with_a_sign_the_template_wrote_itself`,
`the_pocket_row_has_a_sentence_for_every_state_it_can_be_in` and
`the_stand_still_target_does_not_claim_a_rise_that_did_not_happen` hold
all three.

### The two charts

Both are inline SVG — no chart library and no third-party script, so the CSP the
privacy notice depends on stays intact — and both had the same class of bug: a
mark the reader could not actually see.

- **The tax wedge.** Two series, and below the ceiling they are *the same
  number*. Drawn as two lines, the marginal one spent the first third of the
  plot hidden underneath the effective one, while the legend named it — so the
  key pointed at something that was not there. The marginal rate is therefore
  an **area** closed to the baseline and the effective rate a **line** on top
  of it: where they coincide the line is the top of the wash, and above the
  ceiling a gap opens between them, which is the whole finding. One hue
  (`--erode`, the palette's colour for money leaving you), told apart by form —
  which also survives colour-blindness and greyscale, as two hues at this size
  would not. Every key swatch is the mark it stands for, in that mark's own
  token; a series key is a filled block, and only the ceiling's key is a rule.
- **The €/m² sparkline** is drawn at its **measured pixel width**
  (`bind:clientWidth={histW}`, viewBox `0 0 {histW} {h}`). A fixed 110×22 box
  at `width: 100%` with `preserveAspectRatio="none"` scales the two axes
  independently: the stroke thins out and every round marker renders as an
  ellipse. `preserveAspectRatio="none"` anywhere on this page is the tell that
  this has been undone, and a test says so.

**The drawer explains; it does not derive.** Each of its four items is a short
plain sentence and a worked example in round numbers — no algebra, no `<code>`,
no nested `<details>`. A «виж формулата» toggle under every item puts four
maths prompts between the reader and the explanation of their own number, and
the reader this page is written for does not audit our arithmetic — being right
is our side of that deal.

**The method is still published, once.** All four formulas live in a single
closed `<details class="fx">` at the end of the explainer band, labelled from
`COPY.explainMath`. That is the §9.2 obligation — the method is public and every
figure stays re-derivable by hand — and it is met by publishing it, not by
putting it in the way. The explainer band answers the same questions at page
level and quotes **no live figure as a literal**: a hardcoded "5,2%" in prose
contradicts the strip the moment the data refreshes.
`the_results_drawer_explains_in_words_and_carries_no_algebra`,
`the_method_stays_published_once_at_the_end_of_the_explainer` and
`the_explainer_writes_no_live_figure_into_its_prose` hold the three halves.

**Published means enterable.** Every formula in that block is preceded, in both
language spans, by a sentence that reads it out loud — what the symbols do, not
a second worked example, which is the drawer's job. The set of people who want
to re-derive a figure by hand is wider than the set who read Σ notation
fluently, and a block that opens on bare algebra is published at the second set
rather than to the first. Both spans also branch on `anchor` for the same
reason a formula is glossed at all: describing the 12-month rate and the index
division unconditionally shows a reader on «1 година» the formula the other
setting uses.
`every_formula_in_the_published_method_is_read_out_loud_first_in_both_languages`
holds it.

State is `$state()` runes. The component imports formulas from `$lib/mirror`,
derived values from `$lib/view` and copy from `$lib/content`; it holds no domain
logic, and its `$derived(...)` expressions are one-line calls into those
modules.

Accessibility notes that are easy to undo by accident:

- **`aria-live` is scoped to the headline block**, not the whole results card —
  a card-wide live region re-announces ~50 numbers on every slider tick. The
  live region is the `.r-big` + label group, with `aria-atomic="true"`.
- Both language variants (`.l-bg` / `.l-en`) are in the DOM and hidden with
  `display:none` in `tokens.css`, which screen readers skip correctly. Do not
  switch that to `visibility` or opacity.
- Every input, slider and toggle carries an `aria-label`; the drill-down
  disclosure carries `aria-expanded`; decorative bars are `aria-hidden`.

Two behaviours that surprise people reading the code:

- **The basket's € column rebases** to `(salary − mortgage − rent) / Σw` when
  either housing payment is active — same percentages, smaller absolute € per
  group — and a hint under the legend says so in both languages.
- **The home row shows the current salary-stretch, never a projection.** There
  is no BG official nominal-wage series, so a projection could not be made
  honestly.

## `src/lib/tokens.css` — palette, type, contrast floor

The palette is defined twice — `:root` for light, `html[data-theme="dark"]` for
dark — and `stores.js` flips `data-theme` on `<html>`. Same token names in both
blocks; nothing outside this file hardcodes a colour.

**Every ink token must clear WCAG AA (4.5:1) against every surface it is painted
on, in both themes.** `verify_contrast.mjs` parses `tokens.css`, computes the
relative luminance of each `--ink*` / `--muted` / `--real*` / `--erode` against
`--paper`, `--paper-2` and `--surface`, and fails below 4.5. There is no
large-text exemption on purpose: every role checked is small text — source
captions, hints, the wordmark tagline. If a design change needs a lighter muted,
the captions have to get bigger first.

**4.5 is where the suite fails, and it is not where a token should sit.**
`--muted` is the case that shows why: it paints 94 call sites at 11–13px, and
a value ON the floor passes the check while the page still reads thin, because
what a reader receives is the token's ratio minus whatever is composited on top
of it. It is held at 5.47 / 5.72 / 6.15 in the light theme and 6.36 / 5.98 /
5.61 in the dark one, against `--paper` / `--paper-2` / `--surface`.

**`opacity` on text spends that headroom immediately, so it is checked
separately.** Nothing under 0.89 light or 0.83 dark still clears 4.5:1 on
`--paper-2` — the alphas anyone reaches for are all below the floor.
`verify_contrast.mjs` parses `SiteFooter`'s `.support` rule and recomputes the
ratio that rule actually renders at, because the palette cannot see a fade
declared in a component.

**That covers one rule, and the class is wider than one rule.**
`verify_render_contrast.mjs` opens the built page and walks it: for every
element carrying visible text it multiplies the `opacity` of the whole ancestor
chain into the text's alpha, composites each background layer up that chain —
the rgba ones included, since `--rule`, `--track`, `--gain-band` and the two
`-soft` tokens all let their backdrop through — and asserts 4.5:1, or 3:1 where
the **computed** size is ≥24px or ≥18.66px at weight ≥700. Both themes, both
languages. It is the guard; the `.support` recompute stays because the render
suite skips without a browser and `verify_contrast.mjs` never does.

### `--line` rules a page; `--control-line` bounds something you operate

Two tokens because WCAG 1.4.11 asks 3:1 of one of them and nothing of the
other, and one token cannot be both. A field's `--paper-2` fill differs from
the card's `--surface` by 1.08:1, so **the 1px border is the control's entire
visible extent** — at a hairline's ratio the input has no edge at all for a
reader with reduced contrast sensitivity, on a page whose number boxes carry no
placeholder to give them away.

`--control-line` is 3.16 / 3.31 / 3.56 light and 3.81 / 3.58 / 3.36 dark
against `--paper` / `--paper-2` / `--surface`, and it paints the edges of
fields, selects, pills, chips, segmented buttons, the disclosure summaries and
the share actions. **Card borders, table rules, the footer separators, the
`.sh-card` picture frame and the mortgage bar's outline stay on `--line`**:
they identify no control and carry no state, and darkening them buys nothing
1.4.11 asked for while making every ledger hairline heavier.

The second test in `verify_render_contrast.mjs` holds the split — **where a
control draws a border, that border clears 3:1**, measured in the browser
against the fill inside it and the surface behind it. It does not require a
control to have one: `.rank-more` is identified by its text and underline, and
a native checkbox is the user agent's to draw. Sliders are outside both — their
track edge is an inset `box-shadow` on a pseudo-element no `getComputedStyle`
call reaches, and what identifies them is the thumb's `2px solid var(--real)`.

### The type scale

Nine steps, `--fs-micro` (11px) through `--fs-h2` (22px), and **every
`font-size` in the app is one of them** — component styles, inline styles, both
other pages. Two properties of it are load-bearing rather than cosmetic:

- **The steps are `rem`, and `html` carries no `font-size`.** A reader who has
  raised the default size in their browser gets a proportionally bigger page.
  That is the accessibility setting the web actually honours and the first thing
  someone with weak eyesight reaches for; a hand-tuned `px` ladder ignores it
  outright, however carefully its steps are chosen. Sizes that must track the
  viewport (`h1`, the big result figure) use `clamp()` with **rem** bounds for
  the same reason.
- **The floor is 11px, and 16px is a floor for form controls.** The ledger look
  leans on small mono captions and should, but the floor is what decides
  whether source lines, unit suffixes and the "≈ €128" column stay inside what
  ordinary middle-aged eyesight reads comfortably — on a page whose whole
  subject is what a person's groceries cost. A floor below 11px puts them
  outside it. The scale is compressed rather than uniformly enlarged, so the
  hierarchy survives while nothing is tiny. Separately, every `<input>` sits at `--fs-lead` (16px) because iOS
  Safari zooms the viewport when a focused field is smaller, which throws the
  layout sideways mid-typing. `.field select#inAnchor` is the one deliberate
  exception, and it is a `<select>`, which the zoom rule does not touch.

A new size is a new token or an existing one — never a fresh `px` value.

## Hosting: `public/_headers`

`public/` is copied verbatim into `dist/`, so `_headers` ships with the bundle.
It is the only place in the repo where response headers are declared, and it is
**the deployment contract whoever serves the site**: a host that reads
`_headers` natively applies it as written, and a host that does not needs the
same policy in its own syntax, made from this file. `verify_static_assets.mjs`
pins every directive exactly, so the declaration cannot widen silently. What the
build cannot see is a server whose config has drifted from it — that is
`make headers` (`npm run check:headers`, an origin argument for a staging
deploy), which requests every declared path from the live origin and reads the
headers back.

It sits outside `make check` on purpose: it needs a network and a deployed site,
and a suite that fails when the wifi drops is one people learn to skip. Run it
after a deploy that touched `_headers`, and when a bug report has the shape of a
missing header. Drift there is invisible from inside the repository — the rule
exists, every test passes, the response carries a 200 — so what a reader loses is
only whatever that block carried. It is how `/llms.txt` came to serve its
Cyrillic as `text/plain` with no charset, which a Bulgarian browser decodes as
windows-1251: «Вярно» reaching the reader as «Р’СЏСЂРЅРѕ», with the bytes on
disk correct all along.

Every `.txt` the site serves declares `charset=utf-8` for that reason, and
`verify_static_assets.mjs` holds it as a rule over `public/` rather than a list
of the files, so the next one added is covered without an edit.

Every directive is what the app already does rather than a wish, and
`verify_static_assets.mjs` compares each one **exactly** — a substring check
would pass for `connect-src 'self' https://api.example.com`, which is the
precise widening the test refuses.

- **CSP** — `script-src 'self'` with no `'unsafe-inline'`; `connect-src 'self'`
  (the browser fetches our JSON and nothing else); `font-src 'self'`;
  `img-src 'self' data:`; `frame-ancestors 'none'`; `object-src 'none'`;
  `form-action 'none'`; `base-uri 'self'`. The one relaxation is
  `style-src 'unsafe-inline'`, required because Svelte writes `style="..."`
  attributes throughout the template (bar widths, marker positions, verdict
  colours). It does not admit script. **This is the mechanism that makes the
  published privacy notice true rather than merely intended.**
- **Cache lifetimes** — hashed `/assets/*` and `/fonts/*` immutable for a year;
  `/data/published/*` five minutes with revalidation, because it is the product
  and a refresh has to reach people the day it lands; every HTML entry point
  `max-age=0, must-revalidate`, or a visitor keeps loading a bundle whose hashed
  assets no longer exist.
- **`X-Robots-Tag: noindex` on `/data/published/*`** — belt and braces on
  `robots.txt`'s `Disallow`, which stops a fetch but not indexing from a link.
- **`Permissions-Policy`** denies camera, mic, geolocation, payment and the rest.

When the embed cards land, `/embed/*` gets its **own** block with
`frame-ancestors *`. Do not loosen the site-wide rule to make an embed work.

## Source maps stay out of the deploy artefact

For hosting reasons, not licensing ones. `sourcesContent` for every module is
hundreds of kilobytes no visitor's browser asks for, on one small box serving a
mobile-heavy audience. The maps are written (`sourcemap: 'hidden'`) and kept
beside the build in `site/.sourcemaps/` for error reporting;
`scripts/strip-sourcemaps.mjs` moves them out of `dist/` and fails if source
survives there.

Shipping them is a legitimate deploy-size decision someone may take
deliberately. Flipping `sourcemap: true` while debugging and forgetting to
revert is not, and `test_the_deploy_artefact_stays_lean_and_the_licence_is_declared`
catches it.

**Never commit `site/.sourcemaps/`.** It is a large build artefact, regenerated
every build, and `.gitignore` covers it.

## Share previews

`og:image` is a static 1200×630 PNG in `public/`, with `og:url`, `og:type`,
`og:site_name`, `og:locale`, `canonical` and `twitter:card` beside it.

The card deliberately carries **no number** — the wordmark, the strapline and
the source line. Preview images are cached hard by every platform, and a stale
inflation figure in a cached card is our credibility, not theirs.

**The name and the address never fuse.** The wordmark is «ВЯРНО»; the domain is
`vyarno.bg` and is set apart from it, in Latin. «ВЯРНО.BG» is neither of the
two: read as a name it has a TLD stuck on the end, and read as an address it is
a Cyrillic IDN nobody here registered — so a reader who types what the artwork
shows arrives nowhere. `legal.js` publishes the correct pairing as the ЗЕТ чл. 4
identity row, «Вярно · vyarno.bg»; the artwork, `og:site_name` and
`og:image:alt` all follow it.

**The card's wordmark is drawn into the bitmap**, so changing it is a re-render,
not an edit. `scripts/make_og_image.py` is the generator — run `python3
scripts/make_og_image.py` from `site/`. It also writes `docs/img/banner.bg.png`
and `banner.en.png`, the two README mastheads, off the same `lockup()`: the tab
icon, the page header, the share card and the mastheads are one identity, and a
mark drawn twice drifts. Pure standard library (`zlib` +
`struct`), with a hand-authored 5×7 font covering the full Bulgarian alphabet
plus Latin and digits. It **raises** on a character it has no glyph for rather
than skipping it, because a silently dropped glyph is a hole in the wordmark
that no test can see and everyone the link is sent to can. **Look at the
rendered file before committing it** — nothing downstream checks the pixels.

## The README screenshot

`docs/img/screenshot.png` is generated too, by `scripts/make_screenshot.mjs` —
`npm run build`, then `node scripts/make_screenshot.mjs` from `site/`. It drives
the built page with the Playwright already installed for the render suite, types
a salary, a raise and a savings figure, and photographs the result at 1280 CSS
px in two columns.

A hand-taken screenshot of a live UI is stale from the first copy edit and
nothing anywhere says so. The one this replaced was four rewrites behind — it
still showed «най-голямата хапка», a salary hint two versions old, and an as-of
banner reading `Данни към 27.07.2026 г.`, which is the day we downloaded rather
than the month the prices are from. Every one of those was a wrong claim in the
first image a stranger sees, and no test in this repository could see any of
them. Regenerate it in the same commit as a copy change that reaches the frame,
and **look at it before committing** — nothing checks these pixels either.

`favicon.svg` is the same mark as the in-app wordmark — a short bar, a tall bar,
a dashed baseline between them — and is text-free.

## How a JSON becomes a rendered number

```
data/published/hicp_categories.json          ← published by the pipeline
   │ fetch (data.js#loadHicpCategories) — the full envelope
   ▼
view.js decides WHICH number this formula gets
   │ e.g. savingsSince2020 takes the CATEGORIES, not a rate
   ▼
mirror.js#personalInflation(weights, categories, anchor, fallback)
   │ reads categories[*].weight_pct and rateFor(c, anchor)
   ▼
the rendered number
```

The mortgage path is the same shape with one extra hazard:
`data.js#mortgageDefaultRate` walks the fallback chain and returns a **label**
with the rate, so tier 2 re-captions the UI; `view.js#mortgagePanel` then feeds
`annuityPayment` the **AAR and only the AAR**, reads the LTV/DSTI/maturity caps
out of the published `lending_limits`, and cannot be handed the APRC or a 0%
down payment.

## Conventions for anyone touching `site/`

- **All new domain math goes in `mirror.js`**, pure, no closures, no inline
  arithmetic in components.
- **All visible text goes in `content.js`**, in both languages. No string
  literals in components other than styling and data attributes.
- **No new packages without justification.** `package.json` is `svelte` +
  `@sveltejs/vite-plugin-svelte` + `vite`.
- **No third-party scripts or CDN fetches.** The CSP is intentional; assets are
  self-hosted.

## Cross-references

- [`architecture.md`](./architecture.md) — where `site/` fits in the system map
- [`math.md`](./math.md) — every published number's provenance
- [`local-development.md`](./local-development.md) — dev, build, preview
- [`architecture.md`](./architecture.md) — how the pipeline, the JSON and the site fit together
