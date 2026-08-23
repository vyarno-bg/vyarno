# Data sources

**The index over every external dataset the pipeline reads.** A commit that
adds, removes or retargets a connector updates the matching doc under
[`sources/`](./sources/) in the same commit, and a new connector also ships its
licence terms read and quoted verbatim in [`legal.md`](./legal.md) §"Upstream
licensing". `verify_docs_map.mjs` holds the connector-to-doc mapping both ways.

Every entry carries a provenance tag:

| Tag | Means |
|---|---|
| `VERIFIED` | probed by us: 200 + parseable BG data. Use freely. |
| `PLANNED-UNVERIFIED` | cited as a plan; **not** confirmed for BG. Touch only with the live probe that flips it. |
| `WRONG` | probed, and the endpoint 404s / returns a JS shell with no machine API. |
| `BLOCKED` | the endpoint exists but returns 401/403/JS-rendered — needs a different mechanism. |

## One file per publisher

The endpoints, the dimension traps and the dated scope reads live beside the
connector that fetches them. **A source's licence read is in
[`legal.md`](./legal.md), not here** — this is what the pipeline asks for and
what comes back.

| Connector | Doc | What it feeds |
|---|---|---|
| `sources/eurostat.py` | [eurostat.md](./sources/eurostat.md) | HICP, unemployment, the property cubes, the SES salary ladder |
| `sources/nsi.py` | [nsi.md](./sources/nsi.md) | wage by област and by activity, the housing workbooks |
| `sources/ecb.py` | [ecb.md](./sources/ecb.md) | mortgage and consumer rates, deposits, the NPL ratio |
| `sources/bnb.py` | [bnb.md](./sources/bnb.md) | the outstanding mortgage stock, revolving balances |
| `sources/imot.py` | [imot.md](./sources/imot.md) | €/m² per city |
| `sources/dv.py`, `payroll.py`, `mortgage.py` | [legislative.md](./sources/legislative.md) | the payroll table, the ТЗПБ appendix, the БНБ lending limits |

## What the pipeline pulls

| Source | Tag | Feeds |
|---|---|---|
| **HICP rate per code** — `prc_hicp_minr` (unit=RCH_A) | VERIFIED | Every `annual_rate_pct` and the headline. ECOICOP ver.2, dim `coicop18`. One unfiltered call for the whole BG slice. |
| **HICP index per code** — `prc_hicp_minr` (unit=I15) | VERIFIED | `index_by_year` and `latest_index`. Same cube, `sinceTimePeriod` at `INDEX_SINCE_YEAR`. The whole BG slice in one response. |
| **HICP basket weights** — `prc_hicp_iw` | VERIFIED | `weight_pct`. ECOICOP ver.2 item weights, dim `coicop18` — the same dimension the rate cube uses. Per-thousand ÷ 10. |
| **ЕЦБ MIR new-business rate** — `M.BG.B.A2C.A.R.A.2250.{BGN,EUR}.N` | VERIFIED | `mortgage.json → new_business.value_pct`. **The mortgage headline** — the rate excluding charges; `R` is AAR-or-NDER and which one BG reports is unsettled. |
| **ЕЦБ MIR new-business APRC** — `M.BG.B.A2C.A.C.A.2250.{BGN,EUR}.N` | VERIFIED | `new_business.aprc.value_pct` — the same loans' all-in cost with fees (ГПР). |
| **БНБ housing-loan rate** — `s_ir_loan_oa_hh_bg.xlsx` | VERIFIED | `outstanding_stock.value_pct`, with `book_volume_eur_m` beside it. Monthly back to 2007-01. |
| **БНБ new business by rate fixation** — `s_ir_loan_nbf_hh_bg.xlsx` | VERIFIED | `mortgage.json → fixation`. Rates AND volumes for four initial-fixation buckets, monthly 2007-01 →, in euro. **The only source of the fixed/floating split after euro adoption** — ЕЦБ MIR's euro leg publishes no volume by fixation. Same 4-row header grammar as the workbook above, so one locator reads both. |
| **БНБ outstanding balances by purpose** — `s_ir_loan_oa_hh_bg.xlsx`, volume half | VERIFIED | `credit.json → outstanding`. The same sheet's other two purposes plus the volume column for all three, monthly 2007-01 →. **The only published size of the household loan book** — every ЕЦБ MIR outstanding-amount volume key for BG is a 404. |
| **БНБ overdraft and credit-card balances** — `s_ir_ovdr_cc_oa_hh_bg.xlsx` | VERIFIED | `credit.json → card.stock_*`, `overdraft.stock_*`. The card balance carried past the interest-free period, which is the quantity under the 21% the page already showed. ЕЦБ MIR publishes no volume for either item. |
| **ЕЦБ CBD2 non-performing loans** — `I3632` | VERIFIED | `credit.json → non_performing`. Quarterly, split by counterparty, so the household ratio is separable from the portfolio-wide one that reaches the news. |
| **ЕЦБ MIR rate by fixation** — `M.BG.B.A2C.{F,I,O,P}.R.A.2250.{BGN,EUR}.N` | VERIFIED | The cross-check on `fixation`'s rates. `MATURITY_NOT_IRATE` on new business is the INITIAL RATE-FIXATION PERIOD, not maturity — the ЕЦБ's own title for `F` says «with a variable rate and an interest rate fixation period of up to one year». |
| **ЕЦБ MIR consumer credit** — `M.BG.B.A2B.A.{R,C,B}.A.2250.{BGN,EUR}.N` | VERIFIED | `credit.json → consumer`. Rate, ГПР and monthly volume, 2007-01 →. |
| **ЕЦБ MIR overdrafts and card credit** — `A2Z1` / `A2Z3` | VERIFIED | `credit.json → overdraft, card`. `A2Z3` is «extended credit card credit» — the balance carried past the interest-free period, 21.15% at 2026-06. **Rate only**: BG reports no volume and no ГПР for either item. |
| **ЕЦБ MIR household deposits** — `L21` / `L22` | VERIFIED | `credit.json → deposit_overnight, deposit_term`. The comparator. **From 2026-01 only**: `M.BG.B.L22.A.R.A.2250.BGN.N` is a 404 — BG reported term deposits by maturity bucket and never at this total before the euro — and drawing the overnight leg further back than its pair would compare two products over two periods. |
| **ЕЦБ BSI household deposits and loans** — `M.BG.N.A.{L20,A20}.A.1.U6.2250.Z01.E` | VERIFIED | `credit.json → savings`. The two LEVELS under every rate on `/credit/`: what households have placed with BG banks and what those banks have lent them, monthly. **`U6` domestic and not `U2`** — `U2` counts €452 m held by households resident elsewhere in the euro area (2026-06), and the page's claim is about households in Bulgaria. **Both lines come from here rather than one of them from БНБ**: БНБ's consumer and housing blocks are sector Домакинства alone, BSI is S.14+S.15, and a ratio across that seam divides two populations. **2022-01 → and no earlier**, which is the window the chart stops at. |
| **ЕЦБ MIR pure new / renegotiated** — `…A2C.A.{R,B}.A.2250.{BGN,EUR}.{P,R}` | VERIFIED | `mortgage.json → new_business_split`. `IR_BUS_COV` carries four values for BG, not two: `P` and `R` partition `N` to the cent, monthly from 2020-01. |
| **БНБ lending limits** — dated table in `mortgage.py` | VERIFIED | `mortgage.json → lending_limits`. Borrower-based measures, not scraped. |
| **BG payroll parameters** — dated table in `payroll.py` | VERIFIED | `payroll.json`. Contribution rates BOTH sides, the flat tax, the insurance ceiling and the minimum wage. Legislative constants, not scraped. |
| **ТЗПБ by economic activity** — ДВ `showMaterialDV.jsp?idMat=…` | VERIFIED | `payroll.json → work_accident`. ЗБДОО's Приложение № 2/2А — the accident contribution the employer pays alone, 87 КИД-2025 divisions, published as a range per НСИ section. The only payroll figure that is a table rather than a reading. |
| **Individual earnings distribution** — `earn_ses_monthly` | VERIFIED | The percentile ladder's **shape** (D1 / median / mean / D9 gross, 4-yearly). |
| **Average gross wage by област** — НСИ `Labour_1.1.2.2_EUR_EN.xlsx` + `_EUR.xlsx` | VERIFIED | `region_salary.json`. All 28 области, both language editions, НСИ's published quarters from 2020-Q1. |
| **€/m² by city** — `imot.bg/sredni-ceni` | VERIFIED | `city_price.json`. 27 cities, each with its own district count and its own year window. |
| **Unemployment rate** — `une_rt_m` | VERIFIED | `unemployment.json → value_pct`. **Monthly**, seasonally adjusted, from the cube's first month. |
| **НСИ house price index, national** — `HPI_1.3.xlsx` | VERIFIED | `nsi_housing.json`. Change on the same quarter a year earlier. **The cross-publisher reconciliation reads this** against Eurostat's `RCH_A`. |
| **НСИ house price index, six cities** — `HPI_2.6.xlsx` | VERIFIED | `nsi_housing.json`. The six cities over 120,000 people, y/y. A percentage, never a level. |
| **НСИ sales count, six cities** — `HSI_2.4.5.xlsx` | VERIFIED | `nsi_housing.json`. The change in the NUMBER of sales in those cities, y/y. |
| **Dwellings sold** — `prc_hpi_hsnq` (unit=NR) | VERIFIED | `house_market.json → deals`. Quarterly, split `TOTAL` / `DW_NEW` / `DW_EXST`. Purchases by households at **market** prices — gifts, inheritances, discounted family sales and self-build are outside it. |
| **Value of those sales** — `prc_hpi_hsvq` (unit=EUR) | VERIFIED | `house_market.json → value`, and the numerator of `avg_deal_eur`. The consideration for the population the count counts — land in, VAT in on new builds, notary and agency out. Reaches further back than the count cube, so the two are paired on the quarters they share. |
| **House price index** — `prc_hpi_q` (units I15_Q + RCH_A) | VERIFIED | `house_market.json → price_index`. The level and **Eurostat's own annual rate**, never a rate we computed from the level. Carries Eurostat's own flags per quarter in `status_by_period` — `b` break, `e` estimate, `p` provisional — because a line drawn unbroken across a break they declared is a claim they did not make. |
| **House price index, deflated** — `tipsho30` (unit I15_Q) | VERIFIED | `house_market.json → price_index_real`. The same index divided by the national accounts deflator for private final consumption, on the **same base year and the same quarters**, so the two are drawn on one axis with nothing rescaled. Neither is the HICP: the page says which deflator this is, because on this site "inflation" already names a different published series. No `purchase` dimension: Eurostat deflate the total only, so no new-build/existing split exists and the page may not imply one. Nominally the index sits far above its 2008 peak; deflated it does not, and a site whose subject is the gap between a number and what it buys cannot publish only the first. |
| **Tenure** — `ilc_lvho02` | VERIFIED | `house_market_structure.json → tenure`. Own / own-with-loan / rent, at `hhcomp=TOTAL` × `rskpovth=TOTAL`. A share of the population **in private households** — EU-SILC reaches no institution. |
| **Census dwelling stock** — `cens_21dwob_r3` | VERIFIED | `house_market_structure.json → census_dwellings`. Total, occupied and unoccupied at `building=TOTAL`. «Occupied» means somebody's usual residence, never who slept there. |
| **Housing-cost overburden** — `ilc_lvho07a` | VERIFIED | `house_market_structure.json → housing_cost_overburden`. Share of people in households spending over 40% of **disposable** income on housing, at `age`/`sex`/`rskpovth` = TOTAL. An owner's mortgage **interest** counts, never the capital. |

## Not available (do not cite as a working source)

| Source | Tag | What the probe found |
|---|---|---|
| НСИ SDMX-RI (`nsi.bg/ddb2.1/rest/*`) | WRONG | Every path 404s. `infostat.nsi.bg` redirects to marketing; `datacatalog.nsi.bg` is CMS-only. |
| `data.egov.bg` | WRONG, and unprobeable from a cloud host | Not CKAN, no JSON API surface. Good for pointing users at datasets, useless programmatically. Re-probed 2026-08-12 from a datacenter IP: **403 with a 199-byte `iso-8859-1` Apache body on every path including `/robots.txt`** — the same datacenter-block signature имот.bg answers with, so it can be ruled neither in nor out from a hosted runner. Anything it might carry needs a probe from an ordinary Bulgarian connection. |
| БНБ real-estate section | WRONG | A Site Studio shell returning identical bytes for every URL. **БНБ does not publish residential property prices machine-readably** — which is why the €/m² level comes from имот.bg. |
| НСИ city-level housing €/m² | WRONG | PDF press releases only; not structurally machine-readable. |
| A **city**-level average wage, for anywhere but София | WRONG | НСИ publish the wage by **област** and by statistical region, and nothing below. София-city is the exception by accident of geography: it is its own statistical region, BG411, so there the област and the град are the same area. Everywhere else the €/m² is a city's and the wage beside it is its област's, which is why the two cards name their own geographies rather than sharing a heading. |
| **имот.bg rentals** — `/sredni-ceni/naemi-{slug}` | VERIFIED, deliberately unused | Exists for every city and serves the **same** `raioniAvgPrice` identifier, in float €/m² per **month** — fractional, and under the sales sanity floor. Out of scope, and `sources/imot.py` refuses the URL and the fractional value rather than merely not asking for it. |
| `earn_ses_pub1e` / `earn_ses_pub1t` for BG | WRONG | The SES *publication* tables 404 for BG. The main cubes `earn_ses_monthly` / `_hourly` do carry BG — use those. |
| `prc_hicp_ctr` / `prc_hicp_ctrb` as a BG cross-check | WRONG | Euro-area aggregate cubes: `geo=BG` and `geo=DE` both return an empty `value` map with HTTP 200, while `geo=EA` returns tens of thousands of observations. They cannot cross-check a Bulgarian figure. |
| A pay **distribution** by sector for BG (any publisher) | WRONG | Probed 2026-08-06. `earn_ses_monthly` with `nace_r2=J&geo=BG` returns HTTP 200, `"value": {}`, `nace_r2` size **0** — section J is not a category in the cube. Its five `nace_r2` categories for BG are all broad groupings and none is a NACE section: `B-S_X_O` (whole economy), `B-N`, `B-F`, `G-N`, `P-S`. At the 2022 vintage `salary_dist.json` reads, only `B-S_X_O` carries any values; the other four stop at 2018. **So no section-level median, decile or spread exists at any vintage.** НСИ's `Labour_1.1.2.1` publishes a sector **average** and nothing else, which is why the sector card compares against an average and says so. |
| Per-decile HBS weights | WRONG | Eurostat publishes BG household budget structure by **quintile** (`hbs_str_t223`), not decile, in ECOICOP ver.1, latest vintage 2020. |
| **ЕЦБ MIR new-business VOLUME by fixation, euro leg** — `…A2C.{F,I,O,P}.B.A.2250.EUR.N` | WRONG | Probed 2026-08-17: **404 at every bucket**, at every date. BG reported volume by fixation on the BGN leg alone, which stopped at euro adoption, so the share of new lending that floats comes from БНБ's workbook or from nobody. The RATES by fixation are published on both legs and do continue. |
| **ЕЦБ MIR ГПР by fixation** | WRONG | Probed 2026-08-17. `DATA_TYPE_MIR=C` exists for BG on four series only, all at `MATURITY_NOT_IRATE=A`. БНБ's `s_ir_aprc_bg.xlsx` does carry the breakdown, so the answer is "not from the ЕЦБ" rather than "nobody". |
| **ЕЦБ MIR outstanding-amount VOLUMES, any item** — `…{A20,A22,A2B,L21,L22}.…B.….O` | WRONG | Probed 2026-08-17: **404 at every item and every date.** MIR publishes what the outstanding stock COSTS and never how big it is, so every euro amount in `credit.json → outstanding` comes from БНБ's workbooks. The stock RATES do exist (`.R.….O`) and start at 2022-01 rather than 2020-01. |
| **ЕЦБ MIR volumes for cards and overdrafts** — `A2Z3`/`A2Z1` with `.B.` | WRONG | Probed 2026-08-17, 404 on both, as is `DATA_TYPE_MIR=C` for them. БНБ's `s_ir_ovdr_cc_oa_hh_bg.xlsx` publishes both balances, so this is "not from the ЕЦБ" rather than "nobody" — and it is the only reason the card figure now carries a quantity. |
| **ЕЦБ MIR total household lending** — `A2A` | WRONG | Probed 2026-08-17, 404. `A20` is the code that carries all household loans on the outstanding leg. |
| **ЕЦБ BSI deposit breakdown on the domestic counterparty** — `M.BG.N.A.{L21,L22,L23}.A.1.U6.…` | WRONG | Probed 2026-08-17: **404 on all three.** Overnight, agreed-maturity and at-notice deposits are published for BG on the whole-euro-area counterparty (`U2`) alone. A split of one population charted against a total of another is not a split, so `savings` carries the two totals and no breakdown. `A21` and `A23` do not exist for BG on any counterpart area. |
| **ЕЦБ BSI history before 2022-01** | WRONG | Enumerating the whole `BS_ITEM` dimension with a bare `.` and `firstNObservations=1` returns fourteen BG household series, thirteen of them starting 2022-01 (probed 2026-08-17). There is no deeper ЕЦБ history for this counterparty, which is why the savings chart is 54 months and not nineteen years. |
| **A БНБ deposits workbook under `s_ir_dep*`** | WRONG | Every guessed spelling 404s. The real files are `s_ir_time_*` (срочни депозити) and `s_ir_ddm_*` (депозити с договорен матуритет), found via `sitenavigation.js`. Neither is used: they do not resolve unambiguously to ЕЦБ `L22` — the term-deposit stock rate blended from `s_ir_time_oa` lands 0.005 pp from the ЕЦБ's own figure and from `s_ir_ddm_oa` 0.005 pp the other side — and the ЕЦБ publish both the term-deposit volume and the stock rate directly, so the deposit card stays single-publisher. |
| A **borrower** count, for banks or non-banks | WRONG | БНБ publish the number of household LOANS quarterly by size bracket and by product (`loan_dyn_qcat_eur_bg.xlsx`, `2026_cred_type_eur_bg.xlsx` — 2,884,325 loans worth €31.5 bn at 2026-Q2). Nothing divides that by people: one household holds a card, an overdraft and a mortgage as three loans. So loans per capita is computable and borrowers per capita is not, and the two must never be printed under one word. |
| `lex.bg` as a statute source | BLOCKED | Cloudflare managed challenge on every path including `/robots.txt`, from a hosted runner. Statute text comes from ДВ by `idMat` (`sources/dv.py`), which works. |
| An offered-rate ("best offer") mortgage tier | WRONG | Rate-comparison sites and per-bank pages publish advertised promotional "from" rates: conditional on terms they do not state, editorially curated, with no methodology and no revision policy. Nothing in that class can carry the five properties in [`README.md`](./README.md) §"Who this is for", so the class is excluded rather than any particular site being judged. ЕЦБ MIR **APRC** answers the same question officially — and comes out higher. `test_mortgage.py` asserts the `indicative_offer` key is absent from the published JSON. |
| `prc_hpi_q` **as a €/m² level** | VERIFIED, unusable for a level | A transaction-based **index** and an annual rate, with no absolute €/m² at any geography. Both are published — `house_market.json` carries them — and neither can price a square metre, which is why the home block's level still comes from имот.bg. |
| A **transaction** price per m² for any Bulgarian city, from anyone | WRONG | Probed 2026-08-12. Every НСИ city series is an index or a percentage (`HPI_2.4` 2025=100, `HPI_2.6` y/y, `HSI_2.4.5` y/y), and their own лв./кв.м survey «Пазарни цени на жилища» ran «I тримесечие 1993 - II тримесечие 2014» and was discontinued. So `/market/` compares **change against change** — имот.bg's asking-price movement beside НСИ's transaction-price movement, each labelled as the different measurement it is — and never a € level against a € level. The page says so out loud (P11). |
| Average city rents — `prc_colc_rents` | WRONG | Probed 2026-08-12. `geo` dimension size **0** for Bulgaria: it is the EU-staff correction-coefficient survey and covers no Bulgarian city. |

---

## Cross-cutting rules

### A plausible number is not a verified number

Every one of these has produced a wrong number in this codebase that no test
caught, because the number looked reasonable.

1. **Probe the URL the code actually builds**, not the one the docs describe,
   and never cite a series for BG without having probed it — curl the live
   endpoint, parse the JSON, count the valid values. "It works for some EU
   countries" is not enough. Assert the response *count*: a filtered query
   returning megabytes is a failed filter, not a big dataset.
2. **Make the response prove its own identity.** Where upstream returns
   dimension metadata, decode it and assert it matches what you asked for. Where
   it returns a spreadsheet, locate cells by reading headers, never by a
   hardcoded index.
3. **Never document a field you have not seen in the source.** An invented
   column description is worse than none — it stops the next person checking.
4. **Cross-check across independent sources whenever two exist**, and make the
   agreement a gate.
5. **Sanity-check the magnitude against the real world** before believing a
   number.

### A shared code is not a shared meaning

Making every *single* series prove its identity is not enough: a join between
two individually-correct series can still be wrong.

1. **When you join two upstream series, gate the JOIN, not just the parts.**
   Compare the identity metadata both sides carry — the cubes' own labels, code
   by code, plus the dimension name and the code set.
2. **An aggregate check cannot see a per-category swap.** If a gate reduces N
   categories to one number, it is blind to anything that nets out. Add a
   per-item check, or accept that the gate does not cover this.
3. **A tolerance that fails on correct data is a wrong FORMULA, not a tight
   number.** Before retuning a tolerance, check whether you are measuring the
   identity the data actually satisfies. HICP's real identity (chain-linked at
   December) holds to hundredths of a pp; Σ(w·r) is not an identity at all and
   sits a full 0.156 pp out on correct data. Both are measurements rather than
   constants — [`math.md`](./math.md) §"Two reconciliations" carries the
   current figures and how they were taken.
4. **When an upstream dataset disappears, list the catalogue — never guess the
   new code.** One `curl` of `/api/dissemination/catalogue/toc/txt` answers it
   definitively; the guessable name does not exist.
5. **Never let a missing code be a silent skip.** A transform that `continue`s
   past a category with no weight makes a whole division invisible. Raise.

### Multi-value filters return nothing — fan out, or do not filter

**Multi-value dimension filters on the 5D cubes (`coicop18=A+B+C`,
`quantile=D1+D2`) return 200 OK with `value: {}`.** Single-value filters work.
This is the most expensive Eurostat quirk in the project because it fails
*successfully*: a naive batched query publishes an empty basket with no error.

Two valid responses:

1. **No filter at all** — for HICP, where we want nearly every code. Only safe
   with a presence assertion (`_require_codes`).
2. **Fan out one call per value** — where only a few of a dimension's values
   quantiles.

Diagnosing an empty cube: try a single-value filter. If single works and multi
does not, this is the quirk — drop the filter or fan out. Do not try cleverer
filter syntax; `A,B+C` and `A B C` return empty too.

### Body-checked link validation

Eurostat returns 200 with an error payload (`INVALID_QUERY_DIMENSION` and
friends) on a bad query, so the link gate inspects the body, not just the status
code.

### Provenance on every published series

```json
{
  "provenance": {
    "source":        "<agency short name>",
    "source_url":    "<exact URL we hit>",
    "dataset":       "<dataset ID, e.g. prc_hicp_minr>",
    "methodology_change": "<URL + quoted sentence when relevant>",
    "as_of":         "YYYY-MM-DD",
    "disclaimer":    "<when the series is conceptually close but not exact>"
  }
}
```

Grepping a dataset ID in `data/published/` then finds every observation that
came from it.

### The 2026-01-01 eurozone boundary

Pre-2026 BG central-bank data and several Eurostat BG series have a
methodological break on 2026-01-01. Every published series touching that
boundary sets `provenance.methodology_change` with the relevant PDF URL and a
quoted sentence, and the site renders it in the "as of" panel.

---

## When each upstream publishes

**A schedule cannot guess these days, so nothing does.** None of the five
publishers fixes a release date a month ahead, and the spread is wide: Eurostat
loaded the July unemployment rate on the 12th of August, НСИ uploaded the
2026-Q2 wage workbooks on the 11th, the ЕЦБ's MIR release lands anywhere from
the last day of M+1 to the 5th of M+2. A cron set late enough to be safe is
days behind a figure the newsrooms already have; set on the release it reads an
upstream that has not moved and publishes nothing until the next period.

So `watch.yml` polls a cheap marker — one HTTP request per cube or file, a
timestamp rather than data — inside a window recorded per upstream in
`pipeline/src/vyarno_pipeline/release_calendar.py`, and dispatches the arm when
that marker passes the arm's last run. **That table is the schedule**; the
crons in `refresh-<source>.yml` are backstops for the watcher being broken, and
`test_release_calendar.py` holds every workflow to it.

| Publisher | Marker the probe reads | Release instants observed |
|---|---|---|
| Eurostat | `updated` in the ND-cube response | 11:00 Brussels for a news release, 23:00 for the nightly batch, 09:0x for the morning one. Of 1,225 updates in `statistics-update.rss` on 2026-08-19: 758 at 11:00, 288 at 23:00 |
| ЕЦБ | `Last-Modified` on the SDMX series | 10:00 Frankfurt, to the second — MIR, BSI and CBD2 alike |
| НСИ | `Last-Modified` on the workbook | 10:08 and 10:54 Sofia (wage, 2026-08-11), 12:05 (housing, 2026-06-23) — the file appears before the announcement |
| БНБ | `Last-Modified` on the workbook | 11:36–11:41 Sofia (2026-07-27) |
| имот.bg | none | Not watched and not schedulable: a datacenter IP gets a 403 on every path |

Two things follow that are worth knowing before touching either file:

- **The window is a publisher's local time, not UTC.** A band written in UTC
  drifts an hour against the release twice a year. `utc_hours()` computes what
  the poll cron has to cover; the test fails if a window falls outside it.
- **A widened window costs one request; a narrowed one costs a period.**
  `observed` in that table is evidence somebody gathered on a date, not a
  commitment the publisher made.

## Update watch-list

Dated or conditional changes we already know are coming.

| What | Trigger | Action |
|---|---|---|
| **Annual weights release** | Eurostat publishes the new `prc_hicp_iw` vintage, historically ~late February | Nothing to do — but a refresh run between the January rate release and that date **will fail** the chain gate with "weights are the {y−1} vintage but the rates are {y}-01". That is correct: wait, do not publish a mixed vintage. |
| **A new ECOICOP version** | Eurostat announces one (ver.2 landed with three months' notice) | The classification gate fails the publish the moment the two cubes disagree. Enumerate the catalogue (`/api/dissemination/catalogue/toc/txt?lang=en`) to find the new dataset codes — **do not guess them**; the ver.2 weights cube is `prc_hicp_iw`, not the `prc_hicp_inw2` the pattern suggests. Then update `MINR_DATASET` / `IW_DATASET` / `COICOP_DIM` / `CP_DIVISIONS` in `sources/eurostat.py`, add friendly names to `COICOP_META`, and regenerate the fixtures (`pipeline/tests/fixtures/make_hicp_fixtures.py`). |
| **BG's group set changes** | Bulgaria starts or stops spending in a group (e.g. `CP082`, currently weight 0) | Nothing to do — the set is discovered at refresh time. But a group with no name in `COICOP_META` **fails the publish** by design; add a BG/EN name and re-run. |
| **Eurostat retires the I15 base** | ver.2's official base is 2025=100 (`I25`); `I15` is a recalculated back-series | Set `INDEX_UNIT = "I25"` and `INDEX_BASE_YEAR = 2025` in `sources/eurostat.py` — together, or the payload names a base its values are not on and `api_url_index` stops returning the published digits. Every index level in `data/published/` moves; no percentage the site renders does. |
| **Any max-insurable-income change** | A ЗБДОО amendment. The last was ЗБДОО 2026: €2111.64 → €2300, promulgated **ДВ бр. 68 от 28.07.2026**, in force **2026-08-01**, and the shipped payload carries €2300 | Add the dated entry to `BG_PAYROLL_TABLE`; `in_force_entry` switches on the publish date, so a payload baked before the boundary correctly still carries the old ceiling. **Nothing re-runs the pipeline on its own** — run `--source payroll` on or after the effective date or the site serves the superseded ceiling with a real `as_of` on it, which is the failure mode this row exists for. Three things move in that same commit: `mirror.js#BG_2026_MAX_INSURABLE` (the offline sentinel, or first paint computes a net pay the fetch then corrects), the date `test_parity_with_spa_frozen_constants` builds at, and any worked example in `verify_net_salary.mjs` whose gross clears the ceiling. `test_the_spa_sentinel_matches_the_payroll_json_actually_shipped` fails until the sentinel agrees with what shipped. |
| **The euro-native ceiling** | Structural, from 2026-01-01 | BG now legislates these amounts in EUR. A table entry sets **exactly one** of `<field>_eur` / `<field>_bgn` and `_pair()` derives the other; setting both raises. €2300 is the statute — deriving it from the "≈4500 лв" the press rounds to would publish €2300.81. |
| **Minimum wage uprating** | A new MRZ (typically 1 Jan) | New dated entry (`min_wage_gross_bgn`). This re-floors the ladder's P1 automatically. |
| **Contribution or flat-tax rate change** | Legislation | New dated entry. `test_payroll.py` flags the SPA sentinel until `mirror.js#BG_2026_RATES` matches. |
| **SES 2026 wave** (2028) | Eurostat releases `earn_ses_monthly` 2026 — reference period 2026, transmission due T+16 months (April 2028) under Reg (EU) 2025/941 | Re-probe for BG and update `salary_dist.json`'s `shape.ref_year`. |
| **БНБ revises the borrower-based measures** | A Governing Council decision; БНБ reviews RRE risk quarterly | New dated entry in `BNB_LENDING_LIMITS`, re-run `--source mortgage`. Also bump the offline fallbacks in `content.js` and `data.js#mortgageLendingLimits`. |
| **The BGN legs stop being needed** | Structural | The BGN legs are frozen history and will never gain months. Around 2031, when the EUR leg alone covers 5+ years, the splice can retire — **not before**, or the chart loses its pre-euro history. |
| **ЕЦБ MIR revisions** | MIR is revised; the latest month or two can move | Nothing to do — each refresh re-pulls the whole series. Do not hand-edit `mortgage.json`. |
| **A BG MIR series is recoded** | ЕЦБ recoding | `parse_mir_series` raises rather than guessing, and the CLI exits 2. Re-enumerate BG's available series; never loosen a key to a wildcard. |
| **The HICP–CPI gap widens** | Structural, monitor | Typically within ~0.2 pp. If it grows past ~1 pp, re-word the site explainer; the app stays on HICP either way. |
| **SES shape is national** | Structural | The ladder's dispersion is Bulgaria's, and it is levelled onto НСИ's national all-activities average, so the rank it reports is a national one. No sub-national distribution exists at any vintage from any publisher, so the shape cannot follow the reader's област — applying the national spread to Ruse would assert Ruse's dispersion, which nothing measures. Disclosed in the payload and the SPA. |
| **имот.bg's per-city coverage changes** | Any refresh | Two things move independently and both are data rather than constants. A district count drifting a few per cent is normal — София went 143 → 141 — and is absorbed by the 60% floor; a count below it fails that city's read and the dated `regions.py#imot_districts` is updated in the same commit as the finding. A city gaining or losing archive years moves its own `baseline_year`, which is recomputed every run. A city added or retired upstream fails the live dropdown test, which is the only witness there is. |

## What breaks and how we detect it

| Upstream change | Detection | Recovery |
|---|---|---|
| Multi-value filters start working | Tests pass with a single-fetch mock | Collapse fan-out to one call per dataset |
| A new `unit` appears | Tests fail because we filter to specific units | Add the unit; update the transform if the base year changed |
| A dimension is added or removed | `_cube_to_rows` decodes the wrong arity, or `KeyError` | Adjust the decoder |
| A dataset is deprecated | 404 | List the catalogue, find the replacement, patch the connector |
| Weight vintage lags the rate vintage | The chain gate fails, naming both vintages | **Do not fall back to last year's weights.** Wait for the release; the previously published JSON stays live |
| A BG-specific 404 | The connector returns 0 valid values on a clean probe | Tag `WRONG` here, switch to the verified alternative, surface it in `provenance.disclaimer` |
| A БНБ methodology change | A new column or sheet in the workbook | Bump `provenance.methodology_change` in the payload |

## `mortgage.json` schema (v2.0)

Two tiers answering two plainly different questions, plus the regulatory limits.
`headline` names the default tier **in the data**, so the SPA never infers it
from key order.

| Key | Carries |
|---|---|
| `schema_version`, `as_of`, `source`, `headline` | Envelope. `headline: "new_business"`. |
| `new_business` | ЕЦБ. `_role`, `dataset` (the BGN key spliced with the EUR key), `source_url`, `ref_period`, `value_pct`, `rate_basis` (the charge-free rate), `series_by_period` (monthly since the ЕЦБ series starts), `currency`, `currency_history`, `methodology_change`. |
| `new_business.aprc` | The same loans' all-in cost with fees (ГПР): `value_pct` + `series_by_period`. |
| `new_business.monthly_volume` | How much was lent — the evidence for the splice. |
| `outstanding_stock` | БНБ. `_role`, the XLSX + sheet + cell in `dataset`, `value_pct`, `book_volume_eur_m`, `series_by_period` monthly back to 2007-01, `methodology_change`. |
| `cross_check` | `bnb_outstanding_pct`, `ecb_mir_outstanding_pct`, `delta_pp`, `tolerance_pp`, `status`. |
| `lending_limits` | `effective_from`, `ltv_max_pct` 85, `dsti_max_pct` 50, `maturity_max_years` 30, `deviation_allowance_pct_of_prior_quarter` 5, `min_down_payment_pct` 15, `prudent_dsti_pct` 30, `observed_weighted_avg_dsti_pct` 38.5, `dsti_income_basis`. The deviation allowance is БНБ's fourth cap and no site surface reads it: a reader auditing the other three against the decision meets a fourth there, so the enumeration carries it rather than the payload dropping a correct field for tidiness. |

Every `_role` string is in the payload on purpose: the three rates answer three
different questions, and the file has to say which is which to someone reading
it without this document.

**The three numbers must never blur in the UI:**

| Shown as | From | Label the user reads |
|---|---|---|
| The default rate in the input | `new_business.value_pct` (charge-free) | "ЕЦБ · new home loans" |
| Sub-caption under it | `new_business.aprc.value_pct` | "with the loan's charges (APRC/ГПР)" |
| Learn-more only | `outstanding_stock.value_pct` | "БНБ · loans already being repaid" |

The three sit within a point or so of each other, which is why the labels carry
the work: a reader who reads one as another is out by the fees or by a decade of
older lending, and nothing on screen would look wrong.

The default is the **charge-free rate, not the APRC**: the annuity formula needs an interest
rate. The fallback chain in `data.js#mortgageDefaultRate` is
`new_business → outstanding_stock → HOME.rateDefaultPct`, and tier 2 answers a
different question, so the returned `label` re-captions the UI rather than
letting it pass for "the rate".

---

## Query examples (curl debugging)

The actual URLs the connectors send. Each carries a trap; the rest are
mechanical variations.

```bash
BASE=https://ec.europa.eu/eurostat/api/dissemination

# HICP rate and index — ONE unfiltered call each for the whole BG slice.
# Adding coicop18=A+B would return an EMPTY cube with HTTP 200.
curl -sS "$BASE/statistics/1.0/data/prc_hicp_minr?format=JSON&lang=EN&geo=BG&unit=RCH_A&lastTimePeriod=12"
curl -sS "$BASE/statistics/1.0/data/prc_hicp_minr?format=JSON&lang=EN&geo=BG&unit=I15&sinceTimePeriod=2003-01"

# Item weights — prc_hicp_iw (ver.2, dim coicop18). NOT prc_hicp_inw: that is
# the archived ver.1 cube, 12 divisions, no CP13.
curl -sS "$BASE/statistics/1.0/data/prc_hicp_iw?format=JSON&lang=EN&geo=BG&lastTimePeriod=1"

# When a Eurostat dataset 404s: LIST THE CATALOGUE, never guess the new code.
curl -sS "$BASE/catalogue/toc/txt?lang=en" | grep -i prc_hicp

# ECB MIR — the key goes in the PATH. Sanity check: ONE series, ~14 KB. Megabytes
# means the filters went in the query string and this is the entire MIR flow.
curl -sS 'https://data-api.ecb.europa.eu/service/data/MIR/M.BG.B.A2C.A.R.A.2250.EUR.N?format=jsondata&startPeriod=2020-01' \
  | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["dataSets"][0]["series"]), "series")'

# Enumerate every series BG actually has, when a key stops resolving.
curl -sS 'https://data-api.ecb.europa.eu/service/data/MIR?format=jsondata' > mir.json
python3 - <<'EOF'
import json
d = json.load(open("mir.json"))
dims = d["structure"]["dimensions"]["series"]
for k in d["dataSets"][0]["series"]:
    key = [dims[i]["values"][int(x)]["id"] for i, x in enumerate(k.split(":"))]
    if key[1] == "BG" and key[3] in ("A2C", "A22"):
        print(".".join(key))
EOF

# BNB housing-loan XLSX (needs the TLS fix above)
curl -sS -O https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download/s_ir_loan_oa_hh_bg.xlsx
```

Other datasets take the same Eurostat shape with their own dimensions:
`earn_ses_monthly`
(`nace_r2=B-S_X_O&isco08=TOTAL&worktime=FT&age=TOTAL&sex=T&lastTimePeriod=1`),
`une_rt_m` (`sinceTimePeriod=2000-01`).

> **Probe protocol, especially for BG.** Before assuming any Eurostat series
> works for Bulgaria, `curl` it with `geo=BG` and check `len(payload.value) > 0`.
> A 200 with `value: {}` is a *failure*, not a pass.

## Working with a new upstream

**Everything below is how, not whether.** Whether a source is worth adding is a
product question; this section is the method for the ones that are, learned from
the connectors that ship.

### How to probe

Learned by getting it wrong; follow it.

- **Use `curl`, not a headless fetcher.** Bulgarian sites that answer plain curl
  with 200 return 403 to some library user-agents. `kolkostruva.bg` is the
  proven example.
- **Always send** `-A "Mozilla/5.0 (Vyarno.bg data pipeline)"`.
- **Probe sequentially.** Parallel output interleaves and becomes unreadable.
- **Cheap existence checks:** `curl -r 0-0 -o /dev/null -w "%{http_code}"` —
  a range request confirms a 20 MB file exists without downloading it (`206`).
  Add `-D -` and the `Content-Range: bytes 0-0/TOTAL` header gives the full size
  for one byte of transfer.
- **Read `robots.txt` first, always.** Record it verbatim with the date.
- **A 200 with an empty or challenge body is a failure, not a pass**
  (§"Body-checked link validation"). `mi.government.bg` returns 200 with 364
  bytes: a stub, not
  a dataset.
- **Never guess filenames.** НСИ's directory listing 403s and invented names
  404. The catalogue must be *found* — for НСИ it is
  `nsi.bg/bg/content/2222/статистически-данни` → topic pages → the XLSX names.
- **A portal's self-description is evidence of what it was set up under, not of
  what governs it now.** `kolkostruva.bg/about` cites the superseded ЗВЕРБ
  чл. 55б and says nothing about ЗЗП чл. 68п replacing it. Check legal basis
  against Държавен вестник.

### Tell the three failure modes apart

They mean different things and misfiling one writes off a reachable source.

| Symptom | Meaning |
|---|---|
| `403` + a tiny `iso-8859-1` Apache body | site-level datacenter-IP block |
| Redirect to `/__superjs/challenge` or similar | JS bot challenge → **stays blocked**, by policy |
| `curl: (56) CONNECT tunnel failed, 502` | **our** network, not the site → re-probe from elsewhere |

### Where you fetch from is part of the connector's design

A large share of Bulgarian infrastructure serves datacenter IPs differently from
ordinary ones — `имот.bg` is not a special case; `data.egov.bg`, the national
open data portal, behaves the same way. A source that answers from a laptop in
Sofia and times out from a cloud runner is not broken, and recording which is
which saves the next person re-probing it.

So a new connector records the kind of connection it needs, the same way it
records its endpoint. `city-price` needs an ordinary Bulgarian one, which is
why it is refreshed by hand rather than on a timer.

### The seven fetch plans

Every probed source classifies into exactly one. A new connector should look
like the others in its class rather than inventing a shape.

| Plan | Shape | Example |
|---|---|---|
| `dated_url` | URL contains a date; iterate the calendar | КЗП daily prices |
| `direct_file` | One stable URL, contents replaced in place | EU Oil Bulletin weekly |
| `index_then_files` | Fetch an index, discover filenames, fetch those | НСИ timeseries |
| `paged_table` | Paginated listing, N pages | КЕВР decisions |
| `session_form` | Needs a cookie / ViewState handshake first | НСЦРЛП medicines |
| `tokened_api` | Parameterised API, credential required | ENTSO-E |
| `remote_collector` | Only reachable from Bulgarian egress | `data.egov.bg` |

### Checklist for adding a connector

**In one commit, or it does not ship.** Traced end to end against `nsi-housing`;
every row is a place that arm appears. The right column is what goes red if you
skip it — **"nobody"** means the step is on you and on review, and those are the
rows a connector-shaped change actually forgets.

| # | Step | Caught by |
|---|---|---|
| 1 | `pipeline/src/vyarno_pipeline/sources/<name>.py`, following its fetch plan above | nobody |
| 2 | A builder in `transform.py` — reshape only, no network and no gates | nobody |
| 3 | A gate in `validate.py`. **A payload with no gate is a number nobody checks** | nobody |
| 4 | `<NAME>_FILE` and its writer in `publish.py`, with `source_url`, `as_of` and `notes` | `test_published_contracts.py` on the envelope |
| 5 | `_refresh_<name>` in `cli.py`, the `click.Choice` entry, **and the `--source all` branch** | `test_cli_dispatch.py#test_source_all_runs_every_one_of_them` |
| 6 | A line in `ARMS` and one in `ARM_PAYLOADS` (`pipeline/tests/test_cli_dispatch.py`) | nobody, and an unlisted arm is worse than untested: the fixture patches what it names, so the arm RUNS against its live upstream inside an offline suite |
| 7 | `release_calendar.py` — a `Release` per upstream cube or file in `WATCHED`, or an entry in `NOT_WATCHED` saying why polling it says nothing | `test_release_calendar.py#test_every_arm_is_watched_or_says_why_it_cannot_be` |
| 8 | A `BACKSTOP` cron, firing **after** that arm's window has closed | `test_every_arm_has_a_backstop`, `test_a_backstop_fires_after_its_arm_s_window_has_closed` |
| 9 | `.github/workflows/refresh-<source>.yml`, its `schedule` equal to `BACKSTOP[source]` | `test_each_arm_carries_the_backstop_the_calendar_gives_it`, and the workflow↔`click.Choice` reconciliation in `test_cli_dispatch.py` |
| 10 | Run the arm; commit the payload in `data/published/` | the `data` job in `ci.yml` |
| 11 | A row in `site/src/lib/payloads.js` — `key`, `file`, `pages`, `cadenceDays`, `name`, `feeds`, `refPeriod` | `verify_data_contracts.mjs` §"every payload the SPA loads exists in data/published" and §"every payload's refresh fires at least as often as the cadence it is judged by" |
| 12 | A fallback chain in `data.js` — **only if** the payload needs one. `loadAll` derives from the manifest, so an ordinary payload needs no edit here | nobody |
| 13 | The `view/` module that reads it, plus `site/scripts/verify_view_<stem>.mjs` named in `package.json` | `verify_suites.mjs` |
| 14 | The component that renders a figure from it | `verify_data_contracts.mjs` §"every manifest payload feeds a figure, not just a row in the freshness panel" |
| 15 | Copy in **both** languages — `content.js`, or the inline `.l-bg` / `.l-en` spans on `/market/` and `/credit/`. A missing string renders as a blank line, not a fallback | `verify_copy.mjs` |
| 16 | The licence quoted **verbatim, in the original language, and dated** in [`legal.md`](./legal.md), plus an entry in `site/src/lib/legal.js#UPSTREAMS` | `verify_legal.mjs`, which fails when the sources page and the footer disagree |
| 17 | The footer attribution, if the publisher is new — a licence condition of several of them, not decoration | `verify_legal.mjs` §"the footer credits every upstream the pipeline pulls from" |
| 18 | A row in the index above, and a section in that publisher's `docs/sources/` doc | `verify_docs_map.mjs` §"every connector has a doc under docs/sources, and every doc is indexed", both directions |
| 19 | Raise a floor in `site/scripts/check-test-floors.mjs` if a suite grew past a fifth | `check-test-floors.mjs` itself |

Steps 11 onward are where this crosses out of `pipeline/`, and they are the ones
that get forgotten: everything up to 10 can be run and reviewed without the site
being opened once, and it leaves a payload that is committed, gated, attributed
and read by nothing.

### The other recurring moves

Each is the same shape — the owner first, then its suite. The long form is the
doc named in the middle column.

| The move | Touch, in order | Never |
|---|---|---|
| Change a formula | [`math.md`](./math.md) → `site/src/lib/mirror.js` → `verify_mirror_math.mjs` | put arithmetic in a component or a `$derived` |
| Change the gross↔net payroll math | [`math.md`](./math.md) §"Gross ↔ net (BG payroll)" → `mirror.js` → `verify_net_salary.mjs` | land it in `verify_mirror_math.mjs`: only the round-trip property there catches the piecewise inverse |
| Change which number feeds a formula | [`site.md`](./site.md) §"The five-layer split" → the `view/` module for that subject → `verify_view_<stem>.mjs` | wire it inside a `$derived`, or in `calculator.svelte.js` |
| Change the chrome every page carries | `site/src/lib/SiteHeader.svelte` or `SiteFooter.svelte` → their route lists → `verify_render_layout.mjs` / `verify_render_shell.mjs` | let a page write its own masthead or footer |
| Retarget an existing upstream | the connector → its gate → this file's section for it → [`legal.md`](./legal.md) if the terms differ → `release_calendar.py` if the release moves | leave the old dataset id in a citation: a dataset that sounds right puts no figure on the page |
| Change a release window | `release_calendar.py` — widen `days`/`bands`, restate `observed` as the instant somebody watched | trim a window to the one release that was seen; a probe costs one request and a closed window costs a period |

## Cross-references

- [`architecture.md`](./architecture.md) — how these sources feed the bake
- [`math.md`](./math.md) — the provenance contract
- [`validation-gates.md`](./validation-gates.md) — how drift is caught
- [`legal.md`](./legal.md) — what each publisher permits
- [`local-development.md`](./local-development.md) — running the pipeline against live upstreams
- [`site.md`](./site.md) §"`src/lib/payloads.js` — the manifest" — what a payload has to declare before a page can read it
