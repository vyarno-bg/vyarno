# Site (the SPA)

The Vite 8 + Svelte 5 app that reads `data/published/*.json` and renders the
calculator. The user's browser never calls an upstream API.

## Layout

**One build entry per real URL**, so each resolves on a static host
with no router and no rewrite rules (`vite.config.js#rollupOptions.input`, which
is the list to read this off — a count written here is a count nothing checks):

| Entry | URL | What it is |
|---|---|---|
| `index.html` → `src/main.js` → `App.svelte` | `/` | the calculator |
| `how/index.html` → `src/how-main.js` → `How.svelte` | `/how/` | the country's figures, with their sources |
| `market/index.html` → `src/market-main.js` → `Market.svelte` | `/market/` | the residential property market, with every figure sourced |
| `credit/index.html` → `src/credit-main.js` → `Credit.svelte` | `/credit/` | what borrowing costs, and how long a mortgage's rate is fixed for |
| `legal/index.html` → `src/legal-main.js` → `Legal.svelte` | `/legal/` | terms, privacy, ЗЕТ чл. 4 identity, sources |
| `support/index.html` → `src/support-main.js` → `Support.svelte` | `/support/` | how the project is paid for |
| `en/index.html`, `en/how/…`, `en/market/…`, `en/credit/…`, `en/legal/…`, `en/support/…` | `/en/…` | those six again, declaring `en` |
| `404.html` → `src/notfound-main.js` → `NotFound.svelte` | `/404.html` | served for any unmatched path by name |

**The `en/` entries name the same bootstraps and the same components as their
Bulgarian counterparts.** What separates a pair is the `data-lang` on `<html>`,
the head tags, and which half of every `.l-bg` / `.l-en` string survives
`prerender.mjs` — so an English entry is four kilobytes of head and no second
implementation of anything. They exist because a page ranks as a DOCUMENT and
the served document carries one language: `/` put no English in front of a
search engine at all, and an `hreflang` alternate had no address to point at
([`seo.md`](./seo.md) §"Twelve pages, six routes, two languages").

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

Its content is wide tables, and two things about them are structural rather than
styling: each sits in an `overflow-x: auto` box so a phone scrolls the table
instead of the page body, and each box is a focusable `role="region"` with its
own name, because a scroll container is not focusable on its own and columns
past the fold were unreachable by keyboard without it. `fig-table.css` is that
treatment, shared with `/market/`, and carries why it is a stylesheet rather
than a component; `verify_render_country.mjs` holds both properties.

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
│                       # every build entry · the __BUILD_ID__ define
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
│   ├── payload-cadence.mjs    # the manifest's cadenceDays as JSON, for the refresh workflows
│   ├── near.mjs               # the float comparator, and the tolerance it carries
│   ├── verify_net_salary.mjs      # gross ↔ net payroll pair
│   ├── verify_mirror_math.mjs     # every formula in mirror.js
│   ├── verify_plot.mjs            # the geometry every chart is drawn with
│   │                              # one suite per module under src/lib/view/,
│   │                              # same stem — a sentence needing an "and"
│   │                              # is two files on both sides of the pair
│   ├── verify_view_freshness.mjs  # whether the figures on the page are still current
│   ├── verify_view_basket.mjs     # the published divisions the basket is built from
│   ├── verify_view_spend.mjs      # what the price rise is charged against
│   ├── verify_view_results.mjs    # what the results card claims
│   ├── verify_view_share.mjs      # what leaves the page when a reader shares it
│   ├── verify_view_payroll.mjs    # where a household's pay stands once it is taxed
│   ├── verify_view_employer.mjs   # what a job costs, and what never reaches the worker
│   ├── verify_view_region.mjs     # what is published about the област a reader picked
│   ├── verify_view_home.mjs       # what a home costs the reader buying one
│   ├── verify_view_country.mjs    # the figures /how/ renders with nobody in them
│   ├── verify_view_market.mjs     # which published field feeds which market figure
│   ├── verify_view_credit.mjs     # …and which feeds which borrowing figure
│   ├── verify_render_credit.mjs   # /credit/ in a browser: the figures arrive, the shares sum
│   ├── verify_wiring.mjs          # which value the template feeds which function
│   ├── verify_copy.mjs            # copy invariants, against the imported COPY
│   ├── verify_payload_prose.mjs   # retired claims, across payload prose and page alike
│   ├── live-copy.mjs              # the comment-blanking source reader, shared
│   ├── verify_format.mjs          # how a number or a date is written
│   ├── verify_stores.mjs          # what this device keeps, and what it never does
│   ├── verify_contrast.mjs        # WCAG ratios computed from tokens.css
│   ├── verify_data_contracts.mjs  # data.js chains + the shipped JSON
│   ├── verify_legal.mjs           # the legal documents and the identity table
│   ├── verify_support.mjs         # the donation rules (support.js ↔ FUNDING.yml)
│   ├── verify_template_safety.mjs # the {@html} invariants, both directions
│   ├── verify_static_assets.mjs   # robots · llms · security.txt · sitemap · CSP
│   ├── verify_analytics.mjs       # the one third-party request, and its section in the notice
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
│   ├── verify_render_layout.mjs   # phone · tablet · wide, the routes, the keyboard journey
│   ├── verify_render_print.mjs    # what a printer receives: light ground, every address on it
│   ├── verify_render_payroll.mjs  # payroll and more than one income
│   ├── verify_render_share.mjs    # the share card and the share text
│   ├── verify_render_contrast.mjs # painted text ratios · control boundaries
│   ├── verify_render_screenshot.mjs # the README shot still shows today's words
│   ├── screenshot-frame.mjs       # the frame both the shot and its guard use
│   ├── make_og_image.py           # regenerates the six OG cards, the icons
│   │                              # and the two README banners (stdlib only)
│   └── make_screenshot.mjs        # regenerates docs/img/screenshot.png + .txt
├── public/             # copied verbatim into dist/ — no build step
│   ├── _headers · robots.txt · llms.txt · .well-known/security.txt
│   ├── favicon.svg · og-*.png · fonts/ (self-hosted, vendored unmodified)
└── src/
    ├── App.svelte · How.svelte · Market.svelte · Credit.svelte · Legal.svelte
    │   · Support.svelte
    │   · NotFound.svelte
    ├── components/   # the calculator, one file per part
    └── lib/
        ├── payloads.js   # WHICH payloads exist at all (the manifest)
        ├── data.js       # fetch wrappers + the fallback chains
        ├── mirror.js     # pure FORMULAS (the only domain math)
        ├── plot.js       # pure PLOT GEOMETRY — a figure to a coordinate,
        │                 # and the two axes. Knows no box; takes one
        ├── view/         # pure DERIVED VALUES (the wiring)  ← read this
        │   ├── freshness.js  # whether the figures are still current
        │   ├── basket.js     # the published divisions the sliders start from
        │   ├── region.js     # the област a reader picked, and its published rows
        │   ├── results.js    # what the results card claims about their year
        │   ├── spend.js      # what the price rise is charged against
        │   ├── home.js       # what a home costs the reader buying one
        │   ├── payroll.js    # where a household's pay stands once taxed
        │   ├── employer.js   # what the job costs, and the other denominator
        │   ├── country.js    # the figures /how/ renders with nobody in them
        │   ├── share.js      # what leaves the page when a reader shares it
        │   ├── market.js     # which published field feeds which figure on /market/
        │   └── credit.js     # …and on /credit/
        ├── calculator.svelte.js  # the STATE the components read
        ├── content.js    # BG/EN copy + presets + HOME constants
        ├── share-card.js # the PNG a reader sends, drawn on a canvas
        ├── format.js     # how a number or a date is written
        ├── legal.js      # the four legal documents + the ЗЕТ чл. 4 identity
        ├── legal-nav.js  # contact addresses + document names (every page)
        ├── support.js    # the donation rules — what may be offered
        ├── analytics.js  # the visit counter — the only third-party request,
        │                 # and the only place a consumer figure could leave
        ├── stores.js     # lang · theme · област · the opt-in memory
        ├── build.js      # the build stamp (__BUILD_ID__, or "dev")
        ├── SiteHeader.svelte  # wordmark + routes + theme + language
        ├── SiteFooter.svelte  # attribution + legal links + build stamp
        ├── WedgeChart.svelte  # the tax wedge as a curve — `/` marks the
        │                      # reader's contracts on it, `/how/` marks nobody
        ├── LabourCostChart.svelte  # the same wedge over TOTAL LABOUR COST,
        │                      # stacked. A second component and never a mode
        │                      # on the one above: different denominator
        └── tokens.css · print.css · card.css · result-row.css ·
            disclosure.css · fig-table.css · chart.css
```

**The components under `lib/` are the ones more than one entry mounts**, and
they are there rather than in `components/` for that reason: `components/` is
the calculator's own parts, and a file six entries import is not one of them.
The split is by AUDIENCE and not by how many — two entries is already more than
the calculator, which is why `WedgeChart.svelte` sits beside the two the whole
site carries.

`SiteFooter.svelte` is shared by every page on purpose: it carries the upstream
attribution (a licence condition) and the legal links (ЗЕТ чл. 4 wants the
provider's identity reachable from every page). A page that declares its own
`<footer>` fails
`every_build_entry_mounts_the_shared_masthead_and_footer_and_neither_twice`, and
the test needs no edit when an entry is added: `entryRoots()` reads
`rollupOptions.input` out of `vite.config.js` and follows each bootstrap, so a
new entry is covered by the commit that creates it — the
masthead is held by the same assertion, so an entry missing from the list is
unchecked for both.

`SiteHeader.svelte` is shared because it is a control bar, and a control that
behaves differently per page is one a reader learns twice. It takes two props —
`page` (the Bulgarian path: where the language link points, whether the wordmark
jumps to `#main` or goes home, which route the row MARKS; `null` on
`/404.html`) and `tagline` (the `{bg, en}` under the wordmark). A masthead that
needs a third prop is a page asking for a second header — `site/AGENTS.md`
§"`components/` is the calculator's" is why. A new route is one entry in its
`ROUTES` list.

**A route is a word and a toggle is a box**, the current page is marked rather
than dropped, and every target in the bar is at least 44×44 CSS px.
`SiteHeader.svelte` carries the measurements behind all three — the 360px budget
that decided the shape, why a 44px tap reloading the page you are on is a
control that lies, and the one width `verify_render_layout.mjs` exempts by name.

### The footer is a table of labelled groups, then an imprint

Eleven links in one undifferentiated row is a list of eleven things to read. A
page of this site, a legal document and an address on somebody else's service
are three kinds of destination, so each gets a labelled row.
`SiteFooter.svelte` carries why the label column takes the register it does, why
the three `nav` landmarks are unchanged, and what happens to the grid below
560px.

## The five-layer split

`site/AGENTS.md` §"The five layers — which one a change belongs in" is the
table: which layer a change belongs in, what tests it, and where new arithmetic
goes. It is the operative copy and this file does not keep a second one.

What that table cannot carry is why the split is shaped this way, which is the
section below.

### A correct formula fed the wrong number

This is the class of bug the pipeline gates structurally cannot see, because
everything they check is already correct on disk. What is left is *which*
correct number reaches which correct formula.

The layers exist to make a wrong wiring **impossible to express** rather than
merely testable — `savingsSince2020` takes the categories rather than a rate, so
the user's basket rate cannot be substituted; `headlineRate` takes only the
headline payload, so it cannot become Σ(w·r). A formula is only as correct as
its arguments, and a wrong argument is invisible to a test of the formula.

Two shipped defects are what the rule is made of, and neither is deducible from
the layer table:

- **A label belongs to the field it labels, not to the nearest payload.** The
  basket's "1 year ago" option is dated from `categories[].ref_period`, beside
  the `annual_rate_pct` that `rateFor(c, "y1")` returns verbatim — never from
  `hicp_headline.json`, whose month Eurostat's flash release puts two weeks
  ahead of the divisions. Taken from the headline it reads "2025.07 → 2026.07"
  over thirteen June rates: every figure Eurostat's own, and the sentence over
  them false.
- **A figure and its label have to be about the same PLACE, and one page holding
  two is how they stop being.** `/how/` is the country's and pins a reference
  град; `/` follows the reader's. The housing card read its baseline year and
  its since-baseline percentage off the reference city and printed София's 2015
  and +232% beside Варна's €/m², under Варна's name, with the chart's own end
  labels correctly Варна's. Every number was real. `view/country.js#cityTrend`
  is the one selection both surfaces call, and it takes the code as an argument
  so a caller has to say which city it means.

Both exist only as a string on a screen, which is why the render suites assert
the rendered text against the payload the page fetched.

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
5. `Calculator#load` computes `dataAge` over the route's own manifest rows
   (`payloadsFor(PAGE)`, not the whole manifest — a page is not stale for a
   payload it never reads) and raises the staleness
   banner if **any payload is overdue against its own cadence** — see
   `payloads.js` and `view/freshness.js#payloadStatus`.

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
  `HOME.rateDefaultPct` (offline sentinel). Returns `{ pct, label, refPeriod }`
  — the period is what dates the rate on screen, so it travels with it rather
  than being looked up again; the label
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
`data.regionSalary` through `view/region.js#regionQuarter`, in
`calculator.svelte.js#regionMeanGrossEur`, falling back to
`HOME.regionSalaryFallback` — which goes through that same function, so the
offline figure cannot be selected differently from the live one.

The percentile ladder takes a **different** level, and the two must not be
crossed: `calculator.svelte.js#ladderAnchorGross` reads НСИ's all-activities
«Общо» row out of `data.sectorSalary` through `view/country.js#nationalQuarter`. The
spread it re-levels is national, so the level has to be
([`data-sources.md`](./data-sources.md) §"Salary distribution"). Both names
state a **mean**: `mirror.js#composeLadder` divides by SES's own mean, and a
median in that position rescales every percentile on the page.

Every fallback chain here is tested in `verify_data_contracts.mjs` — including
that the mortgage fallback **relabels** when it degrades.

## `src/lib/payloads.js` — the manifest

**The one list that answers "which data?".** `loadAll`, the freshness verdict,
the data panel, `/version.json`, the sitemap's `lastmod` and the contract suites
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

**`refPeriodSecondary` fires only when a payload's two vintages differ**, and
**`salary_dist`'s `cadenceDays` is the SES cycle rather than a quarter** —
`payloads.js` carries both arguments on the rows they belong to, including why a
banner that fires when nothing is wrong is worse than no banner. What the doc
adds is where the second vintage comes from: a ladder whose *shape* is a
Eurostat SES wave and whose *level* is a recent НСИ quarter is composed in the
browser, so the two are dated on the two clocks they actually follow
([`legal.md`](./legal.md) §НСИ is why neither file may carry the other's figure).

**A row is not a consumer.** The panel renders every payload, so "is it used?"
is trivially true for anything in the manifest. `verify_data_contracts.mjs`
therefore searches for `data.<key>` in the SPA *excluding* `payloads.js` and
`DataPanel.svelte`: a payload must feed a figure, not just a dated row in the
freshness table.

**Three pages carry the freshness verdict and only one of them has a panel.**
`DataBanner` counts the overdue payloads above the calculator, over a disclosure
listing every one of them with its own date, so a reader who wants to know which
opens it. `/how/` and `/market/` have no panel — and they are the two pages built
to be quoted and cited, so a payload whose workflow stops firing was showing an
old period caption there and nothing else. `DataLate` is what they carry
instead, and it NAMES the late payloads with their own ages rather than counting
them, because a warning that something here is overdue with no way to find out
what is a warning a reader can do nothing with.

Both compute the verdict in `onMount` and never from the prerender prop, for the
reason `calculator.svelte.js`'s constructor gives: it is a function of the clock,
and a page stamped fresh at build time goes on saying so for as long as it is
served. On `/market/` the band sits under the four answer cards rather than above
the page, which was measured rather than chosen — at 360px the cards already end
710px down an 800px screen, and a full-bleed band above them costs 74px with one
payload late and 113px with three.

**`pages` is what stops the manifest costing every reader every payload**, and
the route it names has to be the one the panel is dated from. `view/freshness.js#dataAge`
calls a row it holds no payload for `absent`, and `absent` is what the "some
data is missing" state renders from — so fetching one route's share while
handing the panel the whole list turns every unfetched payload into a standing
warning about an upstream that never failed. `payloadsFor` is the single way to
ask, and a contract test holds the two calls in `calculator.svelte.js` to the
same route.

## `src/lib/mirror.js` — the formulas

The only file with domain logic. Every function takes its inputs explicitly, and
no function closes over hardcoded data — which is what makes each one reachable
from a test with the arguments the bug needs.

Four conventions, and each is a wrong number if broken:

- Real change is `(1+r) / (1+π) − 1`, **never** subtraction.
- A multi-year rate is `idx[now] / idx[year] − 1`, **never** subtraction.
- Two-decimal display rounding, full precision internally.
- **`latest_index` and `index_by_year` share the base `index_base_year` names**,
  because `rateFor` divides one by the other. The `y1` path returns the verbatim
  `annual_rate_pct`, which is base-invariant and so cannot reveal a base bug —
  always check a since-year number too.

One refusal is worth knowing before adding a function here: `meanRungPosition`
takes no anchor, so it cannot be handed a sector average and asked for the
sector percentile nobody publishes. The wiring layer does the same — `view/results.js#headlineRate`
refuses `categories`, so it cannot become Σ(w·r). Where a wrong call would be a
wrong number, the parameter list is the guard.

`payroll.json` is the source of truth for BG payroll and the `BG_2026_*`
constants are an offline sentinel for first paint only — **a law change is a
pipeline table edit and a re-run, with no SPA code change.**

[`math.md`](./math.md) is the provenance contract for every formula here,
including why `officialInflation` lands ~0.16 pp off the headline rate and why
the UI shows both. Which suite a change belongs in is
[`testing-strategy.md`](./testing-strategy.md); the standard it has to meet is
to break the function on purpose and watch the test go red.

## `src/lib/plot.js` — where a mark goes

Pure geometry, a sibling of `mirror.js` rather than part of it: give it numbers
and a box and it says where the marks go. Nothing in it knows about property,
wages or inflation, which is the line between the two files.

| Export | What it answers |
|---|---|
| `span` · `plotY` · `plotX` | a scale's range; a value's y in a box `h` tall; a point's x in one `w` wide |
| `columnX` · `columnW` | a column's slot and its width, floored so a long series still draws |
| `tickAt` | a tick's height as a PERCENTAGE of the plot |
| `niceTicks` | an axis that ends on round numbers, and the values to label along it |
| `yearTicks` | which years to mark on a time axis, and where each sits |
| `sparkY` · `pathOf` | a value's y in the small box; a series as an SVG path |

**Not a component, and the rule is why.** A component may keep display-shape
helpers that cannot produce a wrong number on their own; axis labels are digits
a reader reads and `niceTicks` decides them. Tested by `verify_plot.mjs`.

**Every function takes its box**, because `/market/` draws one plot taller than
the other five. `Market.svelte` binds them to its own 600-by-240 in six lines,
so no call site spells the box out. The module's header carries the rest.

## `src/lib/fig-table.css` — the table treatment two pages share

Eight rules `/how/` and `/market/` had arrived at twice, byte for byte: the
scroll box, its focus ring, the table's metrics, the cell padding and rule, the
row-header weight, the cell colour, the numeric column, the marked row.

A stylesheet rather than a component because Svelte scopes a component's styles
to it, so a shared LOOK cannot be shared as one — and the fifty-one tables agree
on the furniture and on nothing else. The cost is global selectors with no
unused-selector warning behind them; only the two entries that need it import
it, and every page-specific rule stays in its own component, one specificity
step above.

**One rule in a table is heavier than the others, and it is the one under the
column heads.** Every rule had been `--rule` at 5%, so the line separating the
labels from the figures carried the same weight as the line between two data
rows: on the thirteen-row basket table that is fourteen identical hairlines and
nothing saying where the head stops. The head takes `--line`, which is the token
that rules a page, and the body rules are then free to stay as faint as a ledger
wants them.

## `src/lib/chart.css` — the chart frame two pages share

The same argument one section up, for pictures instead of tables. `/market/` and
`/credit/` both draw inline SVG with the tick labels as HTML in a gutter beside
the box, and they agree on the frame and on nothing else: columns with a seasonal
tint and sparklines on one page, nineteen years of crossing levels on the other.

What is shared is the grid that makes a percentage `top` land on its own
gridline, the box that holds marks and no text, the two gutters of HTML text
either side of it, and what a gridline, a year rule, a zero axis and a base rule
look like. **Every mark is `.plot-*`, and the prefix is load-bearing**: these
selectors are global wherever the file is loaded and both pages carry their own
`.cap`, `.num`, `.scroll` and `.stat`, so a mark sharing one of those names would
take its rule and draw a chart that renders, looks plausible and is not the data.
Page-specific marks — `/market/`'s bars and break rules, `/credit/`'s quiet total
line — stay in their own component, one specificity step above.

Four things about the marks are decisions rather than defaults.

- **A second series is `--series-2`, an ink blue, and it is a third hue because
  the other two mean something.** `--real` says «your number is the good one» and
  `--erode` says «this costs you», so a neutral measurement drawn in either
  announces which is the bad news. What had been doing the job — `--ink-2`, the
  body ink — is not a hue at all: against `--real` it separates by ΔE 8.8 in
  normal vision and 2.7 under protanopia (OKLab ×100), so for roughly one reader
  in twelve the two lines were one colour and the dash was the only cue. The blue
  measures 16.5 normal / 15.8 CVD-worst in the light theme and 16.1 / 14.6 in the
  dark, and the dark step was picked as the passing candidate closest to the green
  in lightness, so the supporting series stops out-weighing the one it supports.
- **`.plot-base` is the datum a series is measured against** — the base year on an
  index, zero on a sparkline — and it is drawn as furniture in `--muted`, told
  apart from the zero axis by its dash. It had been `--erode`, which made the
  loudest mark on every plot a line carrying no measurement and said, in the one
  colour reserved for a loss, that a publisher's choice of base year was bad news.
  **There is no threshold mark in the shared frame**, and adding one is not this
  rule recoloured: a threshold is a claim about what a figure ought to be, which
  is why the 30%-of-net affordability line in `HomeRow` gets the accent this one
  gave up.
- **`--grid` is one step up from `--rule`.** A hairline between rows of text has
  the rows themselves to be found by; a gridline has to be findable across an
  empty plot, or a reader cannot carry a column down onto its value. 0.11 light
  and 0.13 dark, because a light rule on a dark ground reads fainter at the same
  alpha.
- **`.plot-last` marks the newest reading and `.slabels` writes its value beside
  it.** Every figure on these pages is the last point of some series, and on a
  plot 85 quarters wide that point is a seven-pixel stub with nothing to say it
  is the one the prose just quoted. The value goes in a third grid column of HTML
  rather than a `<text>` at the line's end, for the reason the tick labels do:
  inside an SVG scaled to the viewport an 11px label reaches a phone at 6.2px.
  The column is opt-in (`.plot.labelled`) so a single-series plot gives up no
  width to it, and it closes below 760px, where the key under the figure names
  the lines on its own.

## `src/lib/view/` — the derived values

Every number the components render, as a pure function. This is the layer between
"what is the arithmetic" and "where does it go on the page", and its functions
are shaped to make a wrong wiring *unexpressible*:

- `savingsSince2020(cash, headline, categories)` takes the **categories**, not a rate, so
  no caller can hand it the user's own basket rate.
- `headlineRate(payload)` takes **only** `hicp_headline.json`, so it cannot be
  handed `categories` and quietly become Σ(w·r) — a different number by
  ~0.16 pp.
- `mortgagePanel({…})` reads the down payment, the maturity cap and both DSTI
  figures out of the published `lending_limits` rather than accepting them, so a
  caller cannot quote a 0%-down loan or adopt the regulator's 50% ceiling in
  place of our 30% line.

### `src/lib/view/` — one module per subject

**One module per subject, one suite per module, same stem.** `view/home.js` is
what `verify_view_home.mjs` tests, `view/market.js` is what
`verify_view_market.mjs` tests, and so on for every one of them.
`verify_docs_map.mjs` §"every view/ module is paired with the suite of the same stem"
holds the pairing in both directions, so neither half can be added alone.

| Module | What it answers | Its suite |
|---|---|---|
| `freshness.js` | Are the figures on the page still current? | `verify_view_freshness.mjs` |
| `basket.js` | Which published divisions do the sliders start from, and where does a row verify? | `verify_view_basket.mjs` |
| `region.js` | Which област did the reader pick, and what is published about it? | `verify_view_region.mjs` |
| `results.js` | What does the results card claim about their year? | `verify_view_results.mjs` |
| `spend.js` | How much of their money is the price rise charged against? | `verify_view_spend.mjs` |
| `home.js` | What does a home cost the reader buying one? | `verify_view_home.mjs` |
| `payroll.js` | Where does a household's pay stand once it has been taxed? | `verify_view_payroll.mjs` |
| `employer.js` | What does the job cost, and how much of that never arrives? | `verify_view_employer.mjs` |
| `country.js` | What does `/how/` render with nobody in it? | `verify_view_country.mjs` |
| `share.js` | What leaves the page when a reader shares it? | `verify_view_share.mjs` |
| `market.js` | Which published field feeds which figure on `/market/`? | `verify_view_market.mjs` |
| `credit.js` | Which published field feeds which figure on `/credit/`? | `verify_view_credit.mjs` |

What the pairing buys is not tidiness. It makes *where is the test for this
function* answerable from the filename, and it makes moving a function between
modules force its test to move — which is the rule
[`AGENTS.md`](../AGENTS.md) §Tests states and which nothing else enforces.
**A module whose sentence in that table needs an "and" is two modules**, the
same standard [`testing-strategy.md`](./testing-strategy.md) §"When one suite
file has become two" applies to the suites.

Some exports are exercised by more than one suite and that is not a boundary
failure: `region.js#regionQuarter` is `verify_view_region.mjs`'s subject and
`verify_view_country.mjs` and `verify_view_payroll.mjs` call it to build a
fixture, and `results.js#headlineRate` is `verify_view_results.mjs`'s subject
and `verify_view_spend.mjs`'s cross-check. The rule is that each export has one
module and one suite that OWNS it, never that no other suite may call it.

Imports between the modules run one way — `country.js` reads `region.js` and
`payroll.js`, `spend.js` reads `results.js`, and nothing else crosses. **A
cycle appearing here is the split telling you two subjects are one**, and the
fix is to move the shared thing into whichever subject the tests already treat
as its owner, never to break the cycle with a third module.

### No re-export barrel, and the reason is measured

A barrel at `src/lib/view.js` re-exporting every subject would have cost nothing
visible: every import site would read the same. It is not there for two reasons.

**A barrel makes the reach invisible.** With one specifier for every export, a
component reaching across four subjects looks exactly like one reaching into
one — which is the property that let this layer grow past three thousand lines
before anybody counted. `import { mortgagePanel } from "$lib/view/home.js"` says which
subject the file is in, and an import block with five of them says the component
is doing five things.

**And a barrel hands back the whole bundle saving.** Measured on this tree, both
ways, from `npm run build:release`:

| Entry | One `view.js` | Barrel over the modules | Split, no barrel |
|---|---|---|---|
| `main` (`/`) | 360,620 B | 360,588 B | **352,224 B** |
| `how-main` (`/how/`) | 244,062 B | 244,032 B | **235,673 B** |
| `market-main` (`/market/`) | 256,631 B | 256,299 B | **244,352 B** |

Transitive JS per entry, `dist/assets`, uncompressed. The barrel column is the
finding: Rollup resolves a re-export module into one chunk reached by all three
entries, so `view-*.js` comes back at 38 kB and `/market/` downloads the
freshness rows, the payroll panels, the mortgage panel and the share payload to
render a page that calls none of them. Split with no barrel, each entry carries
the modules it reaches and the shared chunk falls to 18.6 kB. The chunk count
per entry does not move, so this is not bytes traded for requests.

**It is still a by-product and not the goal.** A subject boundary moved to shave
bytes is a boundary that will not survive its first real edit; if a future
Rollup chunks this differently the split stands on the paragraph above it.

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

Three `view/` functions are load-bearing in a way the table above cannot show,
and each carries its argument, its measurements and the defect it prevents in
the module that owns it:

| Boundary | Reasoning in |
|---|---|
| **`mortgagePanel` amortises the AAR, never the APRC.** APRC is for comparing, AAR is for computing | `view/home.js` |
| **`sharePayload` takes no salary at all**, because `salary × π/(100+π)` inverts exactly. Check a new share surface against the inversion rather than against the presence of a euro sign — the dangerous fields are the ones that look safe | `view/share.js` |
| **`basketBudget` decides what the € column is a share of**, and the two entry modes measure the remainder differently on purpose: euro mode measures it, share mode has the reader state it, and only one is ever live | `view/spend.js` |

`SHARE_FIELDS` is the closed list of what may cross onto a share surface, so
adding a figure to a card means adding it there first — which is where the
argument happens. What the unplaced money *is* — savings, help sent home — is
not ours to say: P5 puts the assumption on the line beneath, and P6 and §7a
close "save it" and "invest it".

## The basket interface

**The default basket is the official one, so the results card may not compare
until the reader has described something.** `calculator.svelte.js#basketIsOwn`
is that state, and it gates the headline's «твоята», the reader's own bar, the
verdict paragraph and `view/share.js#sharePayload`'s `ownBasket`. Ungated, the
card prints one number under two labels at two identical bar widths and calls
the result a finding about the reader; the note that names the basket instead
carries the only route on the page to the sliders, 3,668px below it at 360px.
`verify_render_results.mjs` §"the headline says whose basket it is" walks the
transition from both ends.

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
  stops at 5.1 under a sentence saying 5.4. `view/results.js#rankedSplit` returns the
  folded tail with the rows, `verify_view_results.mjs` asserts
  `Σshown + restPp === π`, and the template draws it. Capping a list that a
  sentence promises adds up is only safe if the tail is rendered.

**The source line under the table names only upstreams that put a number on
this page.** A dataset that sounds like it belongs — `ilc_di01`,
`namq_10_lp_ulc`, `prc_hpi_q` — is in no payload and puts no figure on the
screen, and the three that carry the pay ladder, the област wage and the €/m²
(`earn_ses_monthly`, НСИ, имот.bg) are the ones easiest to leave out, because
nothing on the basket table came from them.
Citing a source we do not use breaks the traceability claim from the other
side: the first reader who follows the link finds a dataset with none of our
figures in it. `verify_wiring.mjs` §"the source line names every Eurostat
dataset the page uses, and no others" compares the cited set against the dataset
ids in the provenance fields of every payload `loadAll` actually fetches, **in
both directions**, with a companion for the non-Eurostat upstreams.

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

Four `writable` stores over `localStorage`: `lang`, `theme`, `region` and
`rememberInputs`. Keys are `vyarno_lang` / `vyarno_theme` / `vyarno_region` /
`vyarno_inputs`, and `verify_legal.mjs` reads those names out of this file and
fails when the privacy notice does not name one of them in both languages.

Three constraints, all argued at length in `stores.js` itself:

- **`lang` ignores `navigator.language`, and `region` has no default at all.**
  A great many people in Bulgaria browse on an English-language device, and a
  preselected София hands a Бургас reader Sofia's wage wearing the appearance of
  a choice they made (P7). `theme` keeps its OS fallback, because
  `prefers-color-scheme` describes the device rather than guessing who is
  holding it.
- **The URL outranks the saved preference, and `/` is the exception** — it is
  the one address that names no language. Switching language is a *navigation*,
  not a repaint.
- **Nothing is written until the visitor chooses something**, which is ЗЕТ чл.
  4а, ал. 4, т. 2 rather than taste: the exemption is for storage «изрично
  поискана», and a default nobody asked for is the weakest form of that
  argument. `vyarno_inputs` is the reader themselves, so it is the one key
  behind a switch, off by default, deleted in the same action as switching off.

## `src/lib/content.js` — copy, presets, offline sentinels

`COPY` is the BG/EN dictionary — **everything JavaScript has to select,
interpolate or hand to an attribute**. Long bilingual prose does not live here;
it is written inline as paired `.l-bg` / `.l-en` spans in the component that
renders it (`site/AGENTS.md` §Copy has the rule and why).

`PRESETS` is five starting baskets. Only `official` is Eurostat's; the other
four are **hand-made illustrative starting points, not survey data**, which is
why `presetActive` travels with the number and the `official` chip is
deliberately not caveated. `HOME` holds offline sentinels for first paint, each
banded by `verify_data_contracts.mjs` so it cannot drift far from the published
value it stands in for.

The rule the copy has to keep is to **write for someone who does not know the
vocabulary, and never at the cost of the number** — every term is either
replaced with what it is a share *of* or explained where it first appears, and a
translated idiom counts as jargon. `medianDefault` may not call the pre-filled
salary typical: we publish no national median net wage, so calling it one
borrows the ladder's provenance (P7).

Staleness is judged per payload, never against one threshold:
`view/freshness.js#dataAge` measures each against the cadence its own manifest
row declares. One flat threshold cannot serve four release rhythms — 45 days is
late for the monthly HICP release and perfectly normal for a quarterly НСИ
series.

## `src/App.svelte` — the composition root

Owns the page's shape and nothing else: the masthead, the banner, the two cards,
the national strip, the explainer band, the footer, plus the two states that
replace the calculator entirely. It constructs the `Calculator`, calls
`calc.load()` on mount, and passes it down as one prop.

### `src/lib/calculator.svelte.js` — the state everything reads

Runes are not confined to `.svelte` files, so the whole reactive graph lives in
a `Calculator` class: the `$state` the reader types into, the `$derived` graph
over `data.js` / `mirror.js` / `view/`, the loader and the handlers.

**It exists for testability, by way of prop count.** The inputs card and most of
the result rows read some sixty values out of one graph. While that graph sat in
`App.svelte`'s `<script>`, extracting a row meant threading twenty props into it
and the next row wanted a different twenty. A component now takes one `calc`
prop, and its prop list stops describing the graph's internals.

Three rules it holds, each argued in the file: **nothing computes here** (every
`$derived` is a call into `view/` or `mirror.js` with named arguments),
**nothing picks words here** (the module is language-agnostic), and **every
mutating handler is an arrow-function class field, never a method** — a template
passing a method bare hands over a detached function whose `this` is
`undefined`, which fails silently inside an event handler.

### The components

`PayField`, `InputsCard` (with `BasketEditor` under it) and `ResultsCard`.
`ResultsCard` is a **running order rather than a template**: the headline, then
`ResultsAnswer`, then one component per receipt row, so which rows the calculator
answers and in what order is forty lines of markup. Each row decides for itself
whether it renders — `RentRow` is empty without a rent, `HomeRow` without the
home block — which is why adding a row needs no coordination with the ones
around it.

Shared anatomy is in `card.css` (the grid, the cards, the field, the `.vlink`
verify arrow) and `result-row.css` (the row). Both are stylesheets rather than
components because Svelte scopes a component's `<style>` to its own markup and
these rules span three files by construction: `.m-grid > .m-card:first-child >
.field` cannot be written inside any one of them.

Each component carries its own reasoning, and this table is the index rather
than a second copy of it — every measurement, every defect that became a rule,
and every rejected alternative is in the file named on the right, next to the
code it constrains.

| Component | The constraint that is not obvious from reading it |
|---|---|
| `NationalStrip` | A wrapping flex row, never an auto-fit grid, and the charted card renders last in a row of its own. Every card is gated on **its own payload**, never on what the reader typed |
| `ResultsAnswer` | Introduces no arithmetic — `view/results.js#answerLine` decides what can honestly be stated. Two of its three clauses refuse to compute, and the refusals are the point |
| `RankedContributions` | The fold is driven by the list's **own measured width**, not a `matchMedia` on the layout breakpoint. `rankedSplit` keeps Σshown + restPp === π at any limit |
| `PercentileRow` | Ranks nobody who has not typed a salary. See the rule below |
| `PayField` | Withholds the payslip and the област comparator until a salary is typed, for the same reason |
| `PocketRow` | Seven states, one per verdict; «точно» is bound to `pocket === 0` and may not be said inside the dead zone |
| `ShareCard` | The only canvas in an app that draws every chart as inline SVG. An SVG serialised into an `<img>` resolves no `@font-face`, so the card would come back in the system stack |
| `WedgeChart` | Draws whatever markers it is handed and cannot tell whose gross they are, so who lands on the curve is decided in `view/`, where a suite can reach it |

Three rules cut across all of them, and only these are stated here because no
single component owns one:

**A figure that describes the reader waits until the reader types.** «Изпреварваш
34% от работещите» is a second-person claim about somebody who has entered
nothing, and no caveat rescues it — a visitor on €2,400 has been told something
false about themselves before touching the page. A euro figure is different: it
is arithmetic about prices scaled by a salary, so it may show against the €900
worked example as long as the sentence names the salary it used.

**Prose may move down a tier; a source caption, an `as_of` and a verify link may
not.** Rows are tiered — the figure and one plain sentence always visible, the
derivation one tap away in a `<details>`, the method and sources at page level.
Most of the small grey text on the card is captions and verify arrows, so
folding "the small grey text" is the obvious density move and it is the one
[`principles.md`](./principles.md) §"Publish the method" forbids: a caption a
reader has to go looking for is degraded as surely as one that was deleted, and
the difference is invisible in a diff that only adds a `<details>`.

**A caveat may not be folded away from a claim that stays visible.** The
converse is fine — `LeftoverRow` puts its projection and the assumption behind
one summary, so neither can be met without the other.

`verify_render_results.mjs` and `verify_render_strip.mjs` hold all three, as
rules over the whole card rather than per row.

### The two charts

The tax wedge is **inline SVG with no library**; the comparison bars are plain
divs with a width, because a bar needs no SVG. **No chart library**, and that is
a standing answer rather than a default: the CSP's origin list is closed at two
and neither of them serves one (`AGENTS.md` §Boundaries), so a chart library
would be the third. `plot.js` holds the axis, the ticks and the coordinate mapping — the
arithmetic a component may not keep, because a tick value is digits a reader
reads off an axis. `verify_plot.mjs` is its suite; `WedgeChart.svelte` carries
why each mark is placed where it is.

## `src/lib/tokens.css` — palette, type, contrast floor

The palette is defined twice — `:root` for light, `html[data-theme="dark"]` for
dark — and `stores.js` flips `data-theme` on `<html>`. Same token names in both
blocks; nothing outside this file hardcodes a colour.

**The dark block is wrapped in `@media screen`, and that is how paper gets a
light ground with no second copy of the palette.** A dark theme printed is a
full-bleed black rectangle per sheet. Gating the selector leaves `:root`'s light
values in effect for print, so `verify_contrast.mjs` still measures one palette
and a retune cannot drift between two.

**The focus ring is a bare `:focus-visible`, deliberately not a list.** It had
named `button`, `.pill`, `a` and `.chip`, which left every disclosure summary
and every range slider on Chrome's own `1px auto rgb(16, 16, 16)` — a near-black
hairline in *both* themes, so on the dark ground a keyboard reader had no
visible focus across thirteen disclosures on `/market/` and the whole basket.
A list has to be kept level with the markup and this one was not.
`verify_render_layout.mjs` walks every stop with the real Tab key, on four
routes in both themes.

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

Twelve steps, `--fs-micro` (11px) through `--fs-hero` (40→56px), and **every
`font-size` in the app is one of them** — component styles, inline styles, both
other pages. Three properties of it are load-bearing rather than cosmetic:

- **The steps are `rem`, and `html` carries no `font-size`.** A reader who has
  raised the default size in their browser gets a proportionally bigger page.
  That is the accessibility setting the web actually honours and the first thing
  someone with weak eyesight reaches for; a hand-tuned `px` ladder ignores it
  outright, however carefully its steps are chosen. **A step that tracks the
  viewport keeps a `rem` term inside its `clamp()` for the same reason**, and
  that is where the rule had been leaking: five entries each wrote
  `clamp(1.5625rem, 4vw, 2rem)` for their `h1`, whose middle term is pure
  viewport, so between the two bounds the one heading on a page ignored the
  reader's setting exactly as a `px` size would. `--fs-title` is that curve with
  the setting inside it, and it is one token rather than five copies.
- **The bottom seven steps and the top four are spaced differently on purpose.**
  11–17px moves in single pixels because what it separates is a caption from a
  label from a hint, distinctions a reader resolves by position and colour; a
  bigger step there just makes the small print big. Above `--fs-lead` the job
  changes — a heading has to outrank its own body copy across a paragraph break,
  and `--fs-h3` at 19px over 16px body was 1.19x, which is a bold sentence rather
  than a section title. The top is geometric at roughly 1.25 a step, `--fs-h2`
  sits half again over body, and the three document pages moved their section
  headings onto it. `--fs-figure` is separate from `--fs-h2` because a stat card's
  number has to outrank the heading of a section carrying twenty of them, so the
  two sizes move in opposite directions the moment either is tuned.
- **The floor is 11px, and 16px is a floor for form controls.** The ledger look
  leans on small mono captions and should, but the floor is what decides
  whether source lines, unit suffixes and the "≈ €128" column stay inside what
  ordinary middle-aged eyesight reads comfortably — on a page whose whole
  subject is what a person's groceries cost. A floor below 11px puts them
  outside it. The scale is compressed rather than uniformly enlarged, so the
  hierarchy survives while nothing is tiny. Separately, every `<input>` sits at `--fs-lead` (16px) because iOS
  Safari zooms the viewport when a focused field is smaller, which throws the
  layout sideways mid-typing. The measurement-window `<select>` in the results
  card's heading row is the one control set below it, and a `<select>` is what
  the zoom rule does not touch.

A new size is a new token or an existing one — never a fresh `px` value.

### Only one of the two families declares a `unicode-range`

IBM's files are its own **split** builds, so each weight is declared twice — its
Cyrillic file and its Latin1 file, 16–22 kB each, over IBM's own range for that
split copied out of `css/ibm-plex-*-all.css`. Adobe ships Source Serif 4 as one
face per weight covering Latin, Greek and Cyrillic together, which is why those
files are 60–82 kB. A Cyrillic range over them threw away glyphs that were
already in the file: **every heading in the `/en/` tree rendered in Georgia while
its Bulgarian counterpart rendered in Source Serif** — two designs of one page,
at the size a reader notices first. The range is gone from the serif faces and
the font's own cmap decides, which is what a font that was never subsetted is
entitled to.

**A digit is Latin, so Latin1 is not an English-only concern.** Without those
eight faces `0-9`, `€`, `%` and every ASCII fragment fall to the system stack in
both languages, which put the ledger's own numerals in Consolas, Menlo or DejaVu
depending on the reader's operating system — three designs of the headline
figure, none of them chosen, beside Cyrillic set in Plex. The four weights mirror
the Cyrillic set exactly, because «≈ €46 повече» is one line with both scripts in
it and a weight present on one side only renders that line in two fonts.

| Page | webfont before | after |
|---|---|---|
| `/` | 191 kB | 344 kB |
| `/en/` | 119 kB | 272 kB |
| `/support/` | 151 kB | 209 kB |

Worst case is +153 kB against a page that already transfers ~930 kB, behind
`font-display: swap` and cached after the first visit. `✓`, `≈` and `№` live in
IBM's `Pi` split and stay on the system stack: another ~73 kB across eight faces
for three glyphs, where `⚠` is in no Plex build at all. A symbol drawn by the
system is still that symbol; a letterform drawn by the system is a different
typeface.

**This is not a licence question and must not become one**: every file is
byte-for-byte its publisher's, and writing a `unicode-range` modifies a
stylesheet rather than a font. Re-subsetting is still the thing that would
breach OFL condition 3 (`tokens.css` header).

### `--col` is what a figure gets, `--measure` is what a sentence gets

Two tokens and not one, because a chart wants width and a line of prose does
not. `--col` (48rem) is the single-column document `/how/`, `/market/`,
`/credit/` and `/legal/` are laid out in; `--measure` (38rem) is the cap on
every `p` inside them, so tables and plots run the full column while the text
beside them sets 66–70 Cyrillic characters to the line.

They had been one number, `max-width: 760px` on the `main` element, which put
every paragraph on those pages at about 85 characters — past the band a reader
gets back to the left margin from without losing the line. Being `px` it also
handed a reader who raised their font size a **longer** line in characters
rather than the same one bigger, which is the `rem` rule above failing in the
one place it was least visible. `/credit/` had no cap at all and inherited
`.wrap`'s 1120px, so two sibling documents a reader moves between drew the same
chart at two widths.

**A source caption is not prose and is exempt** (`p.ss` on `/market/`, `.cap` on
`/how/` and `/credit/`): it is one string of mono at the 11px floor, and holding
it to the reading measure wraps a reference period away from the publisher it
belongs to. It takes the width of the figure it dates.

### The segmented control lives in `card.css`, and why that matters

Two cards draw one: `.m-pay` asks whether the figure you typed is net or gross,
`.m-inputs` asks whether the basket is entered in per cent or in euro. The rules
had lived in `BasketEditor`'s scoped `<style>`, so Svelte gave them to that
component's markup and to nothing else — and `PayField`, which writes the same
class names, rendered the **browser default**: two 2px-outset Arial boxes,
`rgb(239,239,239)` on black, identical whichever was pressed, in a fill that
ignored the theme.

**What that cost is the selected state on the most consequential control in the
calculator.** Net and gross are about a third apart and every figure on the page
is derived from that one number, and nothing on screen said which reading was in
force. It is the failure `.vlink` in the same file already records: a class name
copied into a second component keeps the first copy correct, so nothing looks
wrong in the file anybody opens.

`every_segmented_control_on_the_calculator_shows_which_half_is_pressed` in
`verify_render_layout.mjs` is the guard, and it is a rule over ALL of them rather
than a case for this one. The font-family half is what generalises: two different
backgrounds could be arranged by accident, but a control drawn in the UA's font
is one no stylesheet reached at all.

### A figure is hung from a rule, not drawn in a box

The `.stat` tile is the unit all three of `/market/`, `/credit/` and the
calculator's «Страната накратко» strip are built from, and each drew it the same
way: `--surface`, a 1px `--line` border, a 6–8px radius. **The border was doing
no work.** `--line` against `--paper` is 1.40:1 and `--surface` against `--paper`
is 1.08:1, so six tiles in a row were six rectangles a reader could only just
find, and what they added was a rectangle rather than a boundary.

What replaces it is the treatment a ruled document already implies: a 2px
`--ink` rule across the top of each tile with the figure hung under it, the
label at `--fs-meta` below that, and the source caption last behind its own
hairline. The rules across a row read as one broken line, which is what a table
of figures looks like in print, and the tile's own extent is given by the rule
plus the gap rather than by four edges. The row gap goes to 22px in the same
change: with no box, the gap is the only thing keeping two tiles' labels from
reading as one paragraph.

**What this may not cost.** The figure, its label and its source line stay in
that order, the caption keeps its rule and stays the last element, and nothing
moves behind an interaction — `verify_render_strip.mjs` holds the caption to
within 16px of the content it dates and holds each row flush to the widest, and
both still pass because neither is a claim about the border.

## `src/lib/print.css` — the format P9 already anticipated

A page of sourced official statistics is what somebody prints or saves to PDF
for a meeting, and **the links are the product**: on paper every verify link was
underlined text with its address gone, so the printed sheet carried no way to
check a single figure. P9 says verifiability scales down and never away, and its
fallback — the source name, the date and the domain — is written for a format
that *physically cannot* carry a link. Paper can. So every external link prints
its full address, in mono at the caption size, on its own line under the link
text; `break-all`, because a 104-character Eurostat dissemination query has no
break opportunity in it and one that leaves the page box loses the end a reader
has to type.

Loaded last by all six entries, after `tokens.css` and any shared sheet, so its
`@media print` block wins on cascade order rather than on selector weight.

| On paper | Why |
|---|---|
| The dark theme comes out light | Gated in `tokens.css` with `@media screen`; the three grounds go white here, because browsers drop backgrounds by default and half of readers would otherwise get a green-grey wash and half would not |
| The masthead keeps its wordmark, loses its nav and switches | Sticky prints over the first page break; six words that do nothing are the top of the sheet a reader looks at most |
| Disclosures print open, except `.numbers` | The `.method` ones hold the derivations, which is the method this project publishes. A `.numbers` one holds the upstream's own series — 355 rows across `/market/` — which is what the printed URL beside it fetches |
| `white-space`, `overflow` and `max-height` are released together | An element past the page box is LOST, not scrolled. Releasing the overflow of `/market/`'s 22rem scroll box without its height prints 60 rows **on top of** the prose under it |
| `break-inside: avoid` only on things that fit a sheet | On a block taller than the page box the browser cannot satisfy it: it ejects the block, overflows it anyway, and leaves the previous sheet blank. The calculator's cards run to three sheets each |

`verify_render_print.mjs` drives all of it under
`emulateMedia({media: "print"})`, which measures what a printer receives rather
than what the stylesheet declares. It is not a second design and must not become
one: no running heads, no rearranged layout, nothing that needs maintaining
against a medium nobody looks at.

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

- **CSP** — `script-src 'self' https://plausible.io` with no `'unsafe-inline'`
  (the counter's init snippet lives in `analytics.js` so that stays shut);
  `connect-src 'self' https://plausible.io` (our JSON and the counter's event
  endpoint, nothing else); `font-src 'self'`;
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

**A page unfurls as itself, or it does not unfurl.** Six static 1200×630 PNGs
in `public/` — one per content route per language, `og-image`, `og-how` and
`og-market`, each with an `.en` twin — declared beside `og:url`, `og:type`,
`og:site_name`, `og:locale`, `canonical` and `twitter:card`.
`scripts/make_og_image.py`'s `CARDS` block carries the reasoning; the short
form is that a chat app draws a picture only where `og:image` resolves, and no
served page here carries an `<img>` for a scraper to fall back on. `/legal/` and
`/support/` have none and declare none, on the grounds their own entries state.

`twitter:card` is the one tag those blocks cannot leave to a fallback: X reads
`og:image`, `og:title` and `og:description` when the `twitter:` twins are
absent, but has no fallback for the card SHAPE, and without it crops a 1200×630
card to a small square.

The cards deliberately carry **no number** — the wordmark, the strapline, a
headline and the source line. Preview images are cached hard by every platform,
and a stale figure in a cached card is our credibility, not theirs. Which page
has a card, that the file exists, that it is 1200×630, and that an English entry
does not unfurl with the Bulgarian artwork are all held by
`verify_static_assets.mjs` §"every page a stranger is sent unfurls as a card".

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

`docs/img/screenshot.png` is generated, by `scripts/make_screenshot.mjs` —
`npm run build`, then `node scripts/make_screenshot.mjs` from `site/`. It drives
the built page with the Playwright already installed for the render suite, types
a salary, a raise and a savings figure, and photographs the result at 1280 CSS
px in two columns.

A photograph of a live UI goes stale from the first copy edit, and it is the
first thing a stranger sees in both READMEs. So the same run writes
`docs/img/screenshot.txt` — the words that were inside the frame — and
`verify_render_screenshot.mjs` holds the built page to it. A copy change that
reaches the frame fails the render suite and names the line that moved.

**The words are checked and the pixels are not**, so a layout that broke without
changing a word is still something only a person sees. Regenerate in the same
commit as a copy change that reaches the frame, and **look at the image before
committing it.**

`favicon.svg` is the same mark as the in-app wordmark — a short bar, a tall bar,
one solid rule joining their feet — and is text-free. The Facebook profile
picture is a fourth copy of it that we cannot re-render, so the geometry here
follows that image rather than leading it.

## How a JSON becomes a rendered number

```
data/published/hicp_categories.json          ← published by the pipeline
   │ fetch (data.js#loadAll) — every payload the route names
   ▼
view/results.js decides WHICH number this formula gets
   │ e.g. savingsSince2020 takes the CATEGORIES, not a rate
   ▼
mirror.js#personalInflation(weights, categories, anchor, fallback)
   │ reads categories[*].weight_pct and rateFor(c, anchor)
   ▼
the rendered number
```

The mortgage path is the same shape with one extra hazard:
`data.js#mortgageDefaultRate` walks the fallback chain and returns a **label**
with the rate, so tier 2 re-captions the UI; `view/home.js#mortgagePanel` then feeds
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
- **No third-party scripts or CDN fetches beyond the visit counter.** The CSP's
  origin list is closed at two and pinned as literals by
  `verify_static_assets.mjs`; assets are self-hosted.

## Cross-references

- [`architecture.md`](./architecture.md) — where `site/` fits in the system map
- [`math.md`](./math.md) — every published number's provenance
- [`local-development.md`](./local-development.md) — dev, build, preview
- [`architecture.md`](./architecture.md) — how the pipeline, the JSON and the site fit together
