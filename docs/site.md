# Site (the SPA)

The Vite 8 + Svelte 5 app that reads `data/published/*.json` and renders the
calculator. The user's browser never calls an upstream API.

## Layout

**Three build entries, three real URLs**, so each resolves on a static host with
no router and no rewrite rules (`vite.config.js#rollupOptions.input`):

| Entry | URL | What it is |
|---|---|---|
| `index.html` → `src/main.js` → `App.svelte` | `/` | the calculator |
| `legal/index.html` → `src/legal-main.js` → `Legal.svelte` | `/legal/` | terms, privacy, ЗЕТ чл. 4 identity, sources |
| `404.html` → `src/notfound-main.js` → `NotFound.svelte` | `/404.html` | served for any unmatched path by name |

```
site/
├── vite.config.js      # Svelte plugin · /data/published middleware ·
│                       # the three entries · the __BUILD_ID__ define
├── scripts/
│   ├── copy-data.mjs          # post-build: ../data/published/*.json → dist/
│   ├── gen-sitemap.mjs        # dist/sitemap.xml, lastmod = newest as_of
│   ├── gen-version.mjs        # dist/version.json — commit + build time + as_of
│   ├── strip-sourcemaps.mjs   # moves maps OUT of dist/; fails if source survives
│   ├── check-identity.mjs     # release guard on the ЗЕТ чл. 4 identity
│   ├── verify_net_salary.mjs      # gross ↔ net payroll pair
│   ├── verify_mirror_math.mjs     # every formula in mirror.js
│   ├── verify_view.mjs            # every derived value in view.js ← the wiring
│   ├── verify_wiring.mjs          # which value the template feeds which function
│   ├── verify_copy.mjs            # copy invariants, against the imported COPY
│   ├── verify_format.mjs          # how a number or a date is written
│   ├── verify_stores.mjs          # lang/theme persistence
│   ├── verify_contrast.mjs        # WCAG ratios computed from tokens.css
│   ├── verify_data_contracts.mjs  # data.js chains + the shipped JSON
│   ├── verify_legal.mjs           # the legal documents and the identity table
│   ├── verify_support.mjs         # the donation rules (support.js ↔ FUNDING.yml)
│   ├── verify_template_safety.mjs # the {@html} invariants, both directions
│   ├── verify_static_assets.mjs   # robots · security.txt · sitemap · the CSP
│   ├── verify_render.mjs          # the built page, in a browser
│   ├── make_og_image.py           # regenerates the share card + the two
│   │                              # README banners (stdlib only)
│   └── make_screenshot.mjs        # regenerates docs/img/screenshot.png
├── public/             # copied verbatim into dist/ — no build step
│   ├── _headers · robots.txt · .well-known/security.txt
│   ├── favicon.svg · og-image.png · fonts/ (self-hosted, vendored unmodified)
└── src/
    ├── App.svelte · Legal.svelte · NotFound.svelte
    ├── components/   # the calculator, one file per part
    └── lib/
        ├── payloads.js   # WHICH payloads exist at all (the manifest)
        ├── data.js       # fetch wrappers + the fallback chains
        ├── mirror.js     # pure FORMULAS (the only domain math)
        ├── view.js       # pure DERIVED VALUES (the wiring)  ← read this
        ├── calculator.svelte.js  # the STATE the components read
        ├── content.js    # BG/EN copy + presets + HOME constants
        ├── format.js     # how a number or a date is written
        ├── legal.js      # the four legal documents + the ЗЕТ чл. 4 identity
        ├── legal-nav.js  # contact addresses + document names (every page)
        ├── support.js    # the donation rules — what may be offered
        ├── stores.js     # lang + theme, persisted to localStorage
        ├── build.js      # the build stamp (__BUILD_ID__, or "dev")
        ├── SiteFooter.svelte  # attribution + legal links + build stamp
        └── tokens.css · card.css · result-row.css · disclosure.css
```

`SiteFooter.svelte` is shared by all three pages on purpose: it carries the
upstream attribution (a licence condition) and the legal links (ЗЕТ чл. 4 wants
the provider's identity reachable from every page). A page that declares its own
`<footer>` fails `all_three_pages_mount_the_shared_footer_and_none_declares_its_own`.

## The five-layer split

Read this before adding a number to the page. Each layer answers a different
question.

| Layer | File | Question | Tested by |
|---|---|---|---|
| **Data** | `data.js` | *Which* published number, and what if it is missing? | `verify_data_contracts.mjs` |
| **Formula** | `mirror.js` | Given these inputs, what is the arithmetic? | `verify_mirror_math.mjs`, `verify_net_salary.mjs` |
| **Wiring** | `view.js` | *Which* inputs go into that formula? | `verify_view.mjs` |
| **State** | `calculator.svelte.js` | What holds the result, and when does it recompute? | `verify_render.mjs` (it is the only layer with no pure function to test) |
| **Render** | `components/*.svelte` | Where does it go, what colour, which language? | `verify_render.mjs`; template wiring in `verify_wiring.mjs` |

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

`loadAll()`, which maps over `payloads.js#PAYLOADS` — so the fetch list and the
panel's row list are the same list, and there is no hand-written loader per
payload to forget.

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

The Sofia-city average gross wage comparator reads `data.sofiaSalary?.value`
through `view.js#sofiaQuarter` in `calculator.svelte.js#sofiaMeanGrossEur`,
falling back to `HOME.sofiaSalaryFallback` — which goes through that same
function, so the offline figure cannot be selected differently from the live
one. The name states a **mean**: `mirror.js#composeLadder` divides it by SES's
own mean to re-level the ladder, and a median in that position rescales every
percentile on the page.

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
on `sofia_salary`'s own quarterly row.

**`cadenceDays` is here rather than in the envelope**, and that is a deliberate
trade. It is a property of the upstream, so the connector is the natural owner;
but nothing in the pipeline consumes it, and publishing it would put a second
copy in eight JSON files that only a full refresh can correct. One table that
cannot drift from itself beats eight that can drift from each other.

**A row is not a consumer.** The panel renders every payload, so "is it used?"
is trivially true for anything in the manifest. `verify_data_contracts.mjs`
therefore searches for `data.<key>` in the SPA *excluding* `payloads.js` and
`DataPanel.svelte`: a payload must feed a figure, not just a dated row in the
freshness table.

## `src/lib/mirror.js` — the formulas

The only file with domain logic. Every function takes its inputs explicitly; no
closures over hardcoded data. The conventions:

- Real change = `(1+r) / (1+π) − 1`, **never** subtraction.
- Multi-year rate = `idx[now] / idx[year] − 1`, **never** subtraction.
- Two-decimal display rounding; full precision internally.
- **Index base:** `latest_index` and `index_by_year` are both on 2020=100.
  `rateFor(c, year)` and `officialCumulativeSince2020` divide one by the other,
  so they must share a base. The `y1` path returns the verbatim
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
  {n}%"), `buildLadder`, `rentBurden`, `rentDays`, `annuityPayment`,
  `annuityReverse`, `homeYears`.
- **BG payroll:** `bgNetSalary(gross, params)`, `bgGrossFromNet(net, params)`,
  `payrollParams(data.payroll)`, `bgTaxWedge`, `bgMarginalRatePct`. The
  published `payroll.json` is the source of truth; the `BG_2026_*` constants
  (`BG_PAYROLL_DEFAULT`) are an **offline sentinel** for first paint only. A BG
  law change is a pipeline table edit plus a re-run, **no SPA code change**. The
  SPA collects **net** take-home (most people know that, not their contract
  gross), back-computes the gross for the Sofia comparator, and applies the same
  formula to Sofia's gross — so the comparison is net vs net.

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
| `verify_stores.mjs` | the persisted lang/theme keys |
| `verify_contrast.mjs` | WCAG AA ratios for every ink × surface pair, both themes, computed from `tokens.css` itself |
| `verify_data_contracts.mjs` | `data.js`'s fallback chains, and these same functions run over the JSON committed in `data/published/` |
| `verify_legal.mjs`, `verify_static_assets.mjs` | the legal documents and the identity table; robots, security.txt, sitemap and the exact CSP |

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
| `dataAge(parts, now)` | `{oldestAsOf, newestAsOf, daysOld, stale}` | measuring from the *newest* payload lets one fresh file hide eight stale ones |
| `headlineRate(payload)` | Eurostat's all-items rate, verbatim | the strip rendering our Σ(w·r) reconstruction instead of the official figure |
| `pctAhead(rank)` | display position, 1–99, from the bottom | "top 63%" for a below-median income |
| `savingsSince2020(cash, headline, categories)` | `{valueToday, eaten, cumulativePct, basis}` | deflating by the 12-month rate (~5%) instead of the since-2020 cumulative (~40%) — and, since it prefers the published all-items index, showing our ~41.8% reconstruction under a sentence naming Eurostat |
| `housingCarveOut({…})` | `{housingCost, spendable}` | the per-division € column ignoring rent or the mortgage |
| `basketBudget({…})` | `{entered, spendBase, leftover, over, …}` | **a partial € basket rescaled up to the whole salary** — thirteen euro figures nobody typed |
| `exposedSpend({…})` | €/month the price rise is charged on | "what the same life costs" billed against money that was never spent |
| `leftoverIfHeldAsCash({…})` | `{ratePct, valueToday, eaten}` | the unplaced money deflated by the reader's own basket rate instead of the general price level |
| `homePriceFor({…})` | the price the mortgage math runs on | a typed asking price being ignored, or a €0 home in manual mode |
| `clampTerm(years, limits)` | term, capped at the БНБ maturity ceiling | quoting a 40-year mortgage no BG bank can originate |
| `mortgagePanel({…})` | the whole home row | **the APRC amortised as if it were the interest rate** |
| `taxWedgePanel({…})` | the effective/marginal rate curve and the cap marker | a marginal rate drawn flat across the insurance ceiling |
| `scheduledMaxInsurable(payroll)` | the legislated next cap, from `scheduled_changes` | a future cap presented as if it were in force |
| `verifyUrl(row, anchor)` | the "↗" target for one row | linking to the index cube while showing a rate |
| `fastestRisingDivision(categories)` | the highest-rate division | advertising the *slowest*-rising division as the fastest |
| `rankedSplit(ranked, limit)` | the rows the ranked list draws **plus the folded remainder** | a capped list under a sentence promising the column adds up — 5.1 points on screen against a stated 5.4 |
| `shareSentence({…})` | the share-button text | **a € figure beside the percentage, which inverts to the salary** |

### Three of these are boundaries, not conveniences

**`mortgagePanel` amortises the AAR, never the APRC.** The AAR is the interest
rate, and the annuity formula needs an interest rate. The APRC folds fees into
an annualised figure; compounding them monthly overstates the payment by
~€24/month on the published Sofia median — plausible enough that no sanity band
would catch it. **APRC is for comparing, AAR is for computing.**

**`shareSentence` carries percentages and never a € amount.** This is a privacy
boundary: `extraPerMonth = salary × π/(100+π)` inverts exactly, so "my inflation
is 5.4%, that's €48/month" reveals the salary to everyone who reads the message.
`verify_view.mjs` asserts no `€`, `EUR`, `евро` or `лв` reaches the string in
either language, at any anchor — check any new share surface against the
**inversion**, not against intent.

**`basketBudget` decides what the € column is a share of, and the two entry
modes answer differently on purpose.** A basket of *percentage shares* says how
the spendable amount divides and by construction allocates all of it. A basket
of *euros per month* is a list of real payments, and a person who is careful
with money does not spend everything — so `spendBase` is `spendable` in share
mode and **the euros actually entered** in euro mode. Feeding `spendable` to
both is the defect this exists to make unexpressible: a €1,000 basket against a
€1,250 budget came back rescaled by 25%, every row a number the reader had
never typed, adding to a total they had deliberately not reached. `exposedSpend`
carries the same correction into the headline € figure and **reduces to
`salary` exactly** whenever nothing is left over, so it moves no number for a
reader who did fill the basket.

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
screen, and the three that carry the pay ladder, the Sofia wage and the €/m²
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

**The pipeline drives all of it.** No count, no name, no rate and no sub-group
is written into the SPA — the front end renders `hicp_categories.json`. If
Eurostat reclassifies, the pipeline republishes and the UI follows.

## `src/lib/stores.js` — lang + theme

Two `writable` stores with `localStorage` persistence:

| Store | Values | Default with no saved preference |
|---|---|---|
| `lang` | `"bg" \| "en"` | `"bg"`, exported as `DEFAULT_LANG`. `navigator.language` is deliberately **not** consulted |
| `theme` | `"light" \| "dark"` | `matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"` |

**Why `lang` ignores the browser.** This is a calculator of Bulgarian prices,
Bulgarian payroll law and Sofia housing, for a person living in Bulgaria today
([`README.md`](./README.md) §"Who this is for") — and a great many of those
people browse on a device whose UI
language is English. Deriving the default from `navigator.language` served them
the English site on first paint, which is the one guess we can be wrong about
before the reader has told us anything. EN is one tap away in the header and,
once chosen, is read back on every later visit: the saved preference is still
checked first, so the default never overwrites a choice. `theme` keeps its OS
fallback, because `prefers-color-scheme` is a statement about the device rather
than a guess about who is holding it.

Each store pushes its value into `document.documentElement` as a `data-lang` /
`data-theme` attribute, which `tokens.css` reads to switch palettes and
language-scoped typography. One toggle helper each: `toggleLang()`,
`toggleTheme()`. Both swallow `localStorage` errors silently — private mode,
quota exhausted, no DOM — they simply do not persist.

The persisted keys are `vyarno_lang` and `vyarno_theme`, exported as `LANG_KEY`
/ `THEME_KEY`. `readPreference(key, legacyKey, isValid)` accepts an optional
legacy key so a key rename can migrate rather than silently reset every
returning visitor's language and theme; a junk legacy value is discarded, not
adopted. Tested in `verify_stores.mjs`, which installs a fake `localStorage` /
`document` / `navigator` / `matchMedia` per case and re-imports the module under
a unique query string, because `stores.js` reads storage at module-evaluation
time.

## `src/lib/content.js` — copy, presets, offline sentinels

- **`COPY`** — the BG/EN dictionary. Every visible string lives here in both
  languages; `t(key)` looks up the variant for the current `lang` store.
- **`PRESETS`** — five starting baskets, one number per ECOICOP ver.2 division
  in published order. `official` is the real Eurostat BG basket, kept as a
  first-paint fallback — the live weights replace it as soon as
  `hicp_categories.json` resolves, and `verify_data_contracts.mjs` fails if the
  copy drifts more than 3 pp. `driver`, `family`, `noCar` and `pensioner` are
  **hand-made illustrative starting points, not survey data**, and the UI says
  so under the chips. Every vector must have exactly as many entries as the
  published basket and sum to 100 — a short vector leaves the tail divisions
  `undefined` and silently drops them from Σw.
  `every_preset_covers_every_published_division_and_sums_to_100` enforces both.
- **`HOME`** — offline sentinels. Each duplicates a published value for first
  paint only, and `verify_data_contracts.mjs` fails when one drifts past its
  band (rate ±0.75 pp, Sofia wage ±10%, €/m² ±20%, down payment and term exact).

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
  national median net wage; the only median in the data is the Sofia net
  ladder's P50, and the €900 default sits at its 34th percentile (P7).
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
something is overdue — naming how many rather than implying all eight are. One
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
  `sofiaPriceDated`, the preset label and the share sentence live in the
  components that render them — where `$lang` auto-subscription works anyway.

One convention, with no exception to remember: **every mutating handler is an
arrow-function class field, never a method.** A template that passes a method
bare — `oninput={calc.onRaiseInput}` — hands over a detached function whose
`this` is `undefined`, and that failure is a runtime error inside an event
handler, which is to say a silent one.

### The components

`InputsCard` (with `BasketEditor` and `PayslipTable` under it) and
`ResultsCard`. `ResultsCard` is a running order rather than a template: one
component per receipt row — `ResultsSummary`, `PocketRow`, `PercentileRow`,
`TaxWedgeRow`, `RentRow`, `HomeRow`, `LeftoverRow`, `SavingsRow` — so which
rows the calculator answers, and in what order, is forty lines of markup. Each
row decides for itself whether it renders; `RentRow` is empty without a rent,
`HomeRow` without the home block.

Their shared anatomy is in `$lib/card.css` (the grid, the two cards, the field,
the `.vlink` verify arrow) and `$lib/result-row.css` (the row itself). Both
exist because Svelte scopes a
component's `<style>` to its own markup and these rules span three files by
construction — `.m-grid > .m-card:first-child > .field` cannot be written in
any one of them. Decoration that belongs to one component stays with it.

### The national strip — five tiles and one feature card

HICP headline · median net pay (Sofia) · average net pay (Sofia) ·
fastest-rising category · unemployment, then the Sofia €/m² card carrying a
12-year sparkline. Three layout rules, each of which was a visible defect
before it was a rule, and all three are held by
the national-strip tests in `verify_render.mjs`:

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
  The Sofia average-wage card was once gated on `salary > 0` although nothing
  on it is personal, which made "the country at a glance" change shape — and
  gave the strip a card count (5 or 6) that no layout can be tuned for.

Each card is `value → label → (chart) → source`, with `.ss` taking the slack
(`margin-top: auto`) so the source captions line up across a row. Extra footer
lines stack **inside** that one `.ss`: three sibling `.ss` blocks meant three
rules and three paddings, which is what made the median-pay card twice the
height of its neighbours.

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
and naming the salary makes it honest. «Изпреварваш 34% от работещите в София»
is a ranking *of the reader* against their neighbours in the second person, and
a visitor who earns €2,400 has been told something false about themselves before
touching the page. No caveat rescues that, so the row waits — corner figure and
sentence together, because a bare «пред 34%» over a prompt asking for a salary is
the claim with its caveat removed. It is the treatment `PocketRow` already gives
an empty raise.

The four render tests that hold this are
`an_untouched_salary_is_named_where_its_figures_are…`,
`the_route_from_the_headline_to_the_salary_field_lands_on_it`,
`the_ladder_row_ranks_nobody_who_has_not_typed_a_salary` and
`every_verify_link_is_drawn_the_same_in_both_cards`.

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
- **The Sofia sparkline** is drawn at its **measured pixel width**
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
build cannot see is a server whose config has drifted from it — that is checked
by requesting a page from the live origin and reading the headers back.

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
