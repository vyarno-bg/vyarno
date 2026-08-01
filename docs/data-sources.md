# Data sources

**Read this before touching `pipeline/sources/*`.** Every connector maps to
exactly one entry below, and **this file is the source of truth for which
external datasets we use.** Updating `pipeline/sources/*` without updating this
file, or vice versa, is a bug, not a refactor.

> Any commit that changes `pipeline/src/vyarno_pipeline/sources/*` to add,
> remove or retarget a connector must also update this file in the same commit:
> flip the affected entry's provenance tag and, if retargeting, replace the URL.
> A new connector also ships its licence terms, read and quoted verbatim, in
> [`legal.md`](./legal.md).

What each publisher permits is [`legal.md`](./legal.md) §"Upstream licensing".

Every entry carries a provenance tag:

| Tag | Means |
|---|---|
| `VERIFIED` | probed by us: 200 + parseable BG data. Use freely. |
| `PLANNED-UNVERIFIED` | cited as a plan; **not** confirmed for BG. Touch only with the live probe that flips it. |
| `WRONG` | probed, and the endpoint 404s / returns a JS shell with no machine API. |
| `BLOCKED` | the endpoint exists but returns 401/403/JS-rendered — needs a different mechanism. |

---

## What the pipeline pulls

| Source | Tag | Feeds |
|---|---|---|
| **HICP rate per code** — `prc_hicp_minr` (unit=RCH_A) | VERIFIED | Every `annual_rate_pct` and the headline. ECOICOP ver.2, dim `coicop18`. One unfiltered call for the whole BG slice. |
| **HICP index per code** — `prc_hicp_minr` (unit=I15) | VERIFIED | `index_by_year` and `latest_index`. Same cube, `sinceTimePeriod=2020-01`. 555 codes × 78 months in one response. |
| **HICP basket weights** — `prc_hicp_iw` | VERIFIED | `weight_pct`. ECOICOP ver.2 item weights, dim `coicop18` — the same dimension the rate cube uses. Per-thousand ÷ 10. |
| **ЕЦБ MIR new-business AAR** — `M.BG.B.A2C.A.R.A.2250.{BGN,EUR}.N` | VERIFIED | `mortgage.json → new_business.value_pct`. **The mortgage headline**, 2.43% at 2026-05. |
| **ЕЦБ MIR new-business APRC** — `M.BG.B.A2C.A.C.A.2250.{BGN,EUR}.N` | VERIFIED | `new_business.aprc.value_pct` — the same loans' all-in cost with fees (ГПР), 2.77%. |
| **БНБ housing-loan rate** — `s_ir_loan_oa_hh_bg.xlsx` | VERIFIED | `outstanding_stock.value_pct` — 2.6717% at 2026-05 on an €18.2 bn book, monthly back to 2007-01. |
| **БНБ lending limits** — dated table in `mortgage.py` | VERIFIED | `mortgage.json → lending_limits`. Borrower-based measures, not scraped. |
| **BG payroll parameters** — dated table in `payroll.py` | VERIFIED | `payroll.json`. Legislative constants, not scraped. |
| **Individual earnings distribution** — `earn_ses_monthly` | VERIFIED | The percentile ladder's **shape** (D1 / median / mean / D9 gross, 4-yearly). |
| **Sofia average gross wage** — НСИ `Labour_1.1.2.2_EUR_EN.xlsx` | VERIFIED | `sofia_salary.json`, and the ladder's **level**. НСИ's published quarters from 2020-Q1. |
| **Sofia €/m²** — `imot.bg/sredni-ceni` | VERIFIED | `sofia_price.json`. 143 districts + annual snapshots back to 2015. |
| **Unemployment rate** — `une_rt_m` | VERIFIED | `unemployment.json`. **Monthly**, seasonally adjusted, 2020-01–. 2.9% at 2026-05. |

## Not available (do not cite as a working source)

| Source | Tag | What the probe found |
|---|---|---|
| НСИ SDMX-RI (`nsi.bg/ddb2.1/rest/*`) | WRONG | Every path 404s. `infostat.nsi.bg` redirects to marketing; `datacatalog.nsi.bg` is CMS-only. |
| `data.egov.bg` | WRONG | Not CKAN, no JSON API surface. Good for pointing users at datasets, useless programmatically. |
| БНБ real-estate section | WRONG | A Site Studio shell returning identical bytes for every URL. **БНБ does not publish residential property prices machine-readably** — which is why the €/m² level comes from имот.bg. |
| НСИ city-level housing €/m² | WRONG | PDF press releases only; not structurally machine-readable. |
| `earn_ses_pub1e` / `earn_ses_pub1t` for BG | WRONG | The SES *publication* tables 404 for BG. The main cubes `earn_ses_monthly` / `_hourly` do carry BG — use those. |
| `prc_hicp_ctr` / `prc_hicp_ctrb` as a BG cross-check | WRONG | Euro-area aggregate cubes: `geo=BG` and `geo=DE` both return an empty `value` map with HTTP 200, while `geo=EA` returns tens of thousands of observations. They cannot cross-check a Bulgarian figure. |
| Per-decile HBS weights | WRONG | Eurostat publishes BG household budget structure by **quintile** (`hbs_str_t223`), not decile, in ECOICOP ver.1, latest vintage 2020. |
| An offered-rate ("best offer") mortgage tier | WRONG | Rate-comparison sites and per-bank pages publish advertised promotional "from" rates: conditional on terms they do not state, editorially curated, with no methodology and no revision policy. Nothing in that class can carry the five properties in [`README.md`](../README.md) §"Who this is for", so the class is excluded rather than any particular site being judged. ЕЦБ MIR **APRC** answers the same question officially — and comes out higher. `test_mortgage.py` asserts the `indicative_offer` key is absent from the published JSON. |
| `prc_hpi_q` as the home block's source | VERIFIED, unusable for a level | A transaction-based **index** with no absolute €/m². Kept as an availability hedge only. |

---

## Eurostat — `sources/eurostat.py`

**Base:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/` —
every per-dataset URL appends `/data/{dataset}?…`. All Eurostat datasets share
one response shape and one decoder (`_cube_to_rows`).

### `prc_hicp_minr` — the rate and the index, one cube

| Connector | Query | Notes |
|---|---|---|
| `fetch_hicp_rates_bg` | `geo=BG&unit=RCH_A&lastTimePeriod=12` | `RCH_A` is the published annual rate of change. The cube also carries `RCH_M`, `RCH_MV12MAVR`, `I15`, `I25` — ignored. |
| `fetch_hicp_index_bg` | `geo=BG&unit=INDEX_UNIT&sinceTimePeriod=2020-01` | `INDEX_UNIT` is `I15` (2015=100). The values are published unscaled and every site figure is a ratio of two of them, so the choice of unit moves no rendered number — but `INDEX_BASE_YEAR` and `api_url_index` must move with it. |

- **`coicop18`** is the ver.2 dimension name. The connector normalises
  `TOTAL ↔ CP00`.
- Rate and index come from the same cube at the same publication, so
  `annual_rate_pct`, `latest_index` and the headline all share the latest month.
- **No COICOP filter, one call per (dataset × unit).** A multi-value
  `coicop18=A+B+C` filter returns an **empty** cube with HTTP 200 — never batch
  one. An *unfiltered* `geo + unit` query returns the complete BG slice: 555
  codes × 78 months, ~550 KB in a few seconds, verified value-for-value against a per-code
  fan-out. Publishing 13 divisions and 46 groups would otherwise be ~130
  requests per refresh. **`_require_codes` is what makes it safe:** every code
  we intend to publish must be present or the fetch raises, so a truncated or
  reshaped response fails loudly instead of publishing a partial basket.

### `prc_hicp_iw` — basket weights (ECOICOP ver.2)

`geo=BG&lastTimePeriod=1`. 5D cube `freq × coicop18 × statinfo × geo × time`,
one `statinfo` member (`IW`).

- Dim is **`coicop18`** — the same dimension `prc_hicp_minr` uses. That is what
  lets a weight and a rate for one code be about the same bucket.
- Values are **per-thousand** (CP01..CP13 ≈ 1000, TOTAL = 1000); the CLI divides
  by 10.
- `lastTimePeriod=1` takes the latest vintage, and the connector returns the
  weight year alongside. HICP re-weights every January while Eurostat publishes
  the new item weights around late February, so there is a real window each year
  when rates are ahead of weights — the chain gate fails the publish rather than
  mixing vintages.
- History runs 1996→ on ver.2 (back-recalculated), so the whole index history
  reconciles on one classification.
- **Do not use `prc_hicp_inw`** — the archived ver.1 cube: 12 divisions, no
  CP13, CP12 means "Miscellaneous goods and services", keyed by `coicop`, HTTP
  400 for `coicop18`. Joining it to the ver.2 rate cube puts one bucket's weight
  beside another bucket's rate.

### ECOICOP level 2 (groups)

Both cubes carry a division plus one digit (`CP011` Food, `CP072` Operation of
personal transport equipment, `CP121` Insurance). The SPA's detailed mode
renders these, so the pipeline publishes them under `categories[].groups[]` with
the same fields a division gets.

- BG has **50** groups; **46** carry a non-zero weight. The four that do not
  (`CP013`, `CP082`, `CP101`, `CP103`) have no published rate either.
- The set is **discovered from the weights cube at refresh time**
  (`group_codes_in_basket`), never hardcoded — it is country- and
  vintage-specific.
- Group weights must sum to their parent division's weight (gate 4).
- Level 3 (classes, `CP0111`) is published upstream but not by us: below the
  resolution of anyone's memory of their own budget, so a guess entered as data
  would make the result less accurate rather than more.

### `earn_ses_monthly` — the ladder's shape

`geo=BG&nace_r2=B-S_X_O&isco08=TOTAL&worktime=FT&age=TOTAL&sex=T&lastTimePeriod=1`.
Multi-dimension **single-value** filters all work together. The slice is the
whole economy, all occupations, full-time, both sexes, all ages — part-time
dilutes a monthly figure.

`indic_se` carries the four points we use — `D1_E_EUR`, `MED_E_EUR`,
`MEAN_E_EUR`, `D9_E_EUR`, in EUR. **BG 2022: D1 €376 · median €705 · mean €949 ·
D9 €1700** gross/month. This is the correct unit — *individual employee gross
earnings* — but SES is **4-yearly** (BG's waves: 2002, 2006, 2010, 2014, 2018,
2022; next 2026, disseminated 2028), so it is stale in level and used only for
the distribution shape.

**The cadence is legislated, and the legal basis changed on 2026-01-01.**
Regulation (EU) 2025/941 on EU labour market statistics on businesses repealed
Council Reg (EC) 530/1999 with effect from that date, and carried the survey over
unchanged in the respects that matter here: its Annex sets Structure of Earnings
at periodicity **"Every 4 years"**, reference period "Calendar year and a
representative month in that year", transmission deadline **T+16 months**, and
**first reference period 2026**. So 2026 is a named requirement rather than an
extrapolation from the 2018→2022 gap, and the wave lands in 2028 (transmission
due April 2028, dissemination after). The old regime was T+18 to Eurostat and
~T+20 to dissemination, per the SES 2022 ESMS metadata.
`fetch_ses_earnings_bg` raises if any of the four indicators is missing.

### `une_rt_m` — unemployment, monthly

`geo=BG&sinceTimePeriod=2020-01`, no further filters — the BG slice is small.
The transform pins **`s_adj=SA` × `sex=T` × `age=TOTAL` × `unit=PC_ACT`** and
**raises** if that cell is absent.

**Why monthly and not `une_rt_a`.** The annual cube publishes one figure a year,
so in July 2026 the freshest reading it offered was the **2025 average, 3.5%** —
eighteen months old, and 0.6 pp above the 2.9% the monthly series showed for
2026-05. On a page whose promise is that the number reflects now, an annual
average is the wrong instrument, and it is not what Eurostat's own releases or
the Bulgarian press quote.

**Each pinned dimension has a neighbour that is a different statistic, not a
coarser version of the same one — hence no fallback branch:**

| Dim | Values | Why this one |
|---|---|---|
| `s_adj` | `SA` · `NSA` · `TC` | **`SA`** is Eurostat's headline. `NSA` swings with the season, so a month-on-month read of it measures the calendar; `TC` is a smoothed trend, not an observation. |
| `age` | `TOTAL` · `Y_LT25` · `Y25-74` | **`TOTAL` here IS 15-74.** There is no `Y15-74` code in this cube — that spelling belongs to `une_rt_a`, and a transform ported across without checking filters to nothing. |
| `unit` | `PC_ACT` · `THS_PER` | **`PC_ACT`** is the percentage of the labour force. `THS_PER` is thousands of people. |

**Never fall back to `PC_POP`.** It is a percentage of the *whole population*,
including everyone outside the labour force — a materially lower number wearing
the same label, which is what makes it a tempting substitute when a filter
returns nothing. `une_rt_m` does not carry it at all, so a fallback that
reaches for it fails the fetch rather than mislabelling one.

---

## Salary distribution — `salary_dist.json`

**No single official source publishes a fresh, machine-readable, full salary
distribution for BG or Sofia.** Everything was probed:

| Dataset | Latest | Why it cannot rank a salary |
|---|---|---|
| `earn_ses_monthly` / `_hourly` / `_annual` | 2022 | The only individual-earnings *distribution*. 4-yearly. **Used, for shape.** |
| `earn_nt_net` / `earn_nt_netft` | 2025 | A tax model at fixed reference cases (fractions of the mean), not percentiles. |
| `ilc_di01`, `ilc_di03` | 2025 | *Household* disposable income — the wrong unit; mixing it with a one-person salary question pushes almost every Sofia wage into the top few percent. |
| `ilc_di11` (S80/S20) | 2025 | A single inequality ratio. |
| НОИ insured income | monthly | Capped at the maximum insurable income (€2,111.64), barely above the Sofia average, so the whole upper half piles at the ceiling. |
| НСИ quarterly wages | quarterly | *Average* only, no distribution. It is our level anchor, applied in the browser — see below. |

So the ladder needs two official sources: the **shape** from Eurostat SES 2022,
the **level** from the live НСИ Sofia-city average gross wage.

**They are not blended into one file: one publisher per published artefact.**
That keeps each file travelling under one set of terms, which is what makes both
of them straightforward to redistribute — including by anyone who forks this.
So the two halves stay apart all the way to the reader's browser:

| File | What it carries | Whose terms govern it |
|---|---|---|
| `salary_dist.json` | The SES ladder at **Eurostat's own level**, plus `ses_mean` | Eurostat's, and it is a disclosed derivative |
| `sofia_salary.json` | НСИ's **published quarterly series** | НСИ's, and it is a straight reproduction |

**Method.** Steps 1–2 run in the pipeline
(`transform.py#build_ses_shape_ladder`, restated in the JSON's `shape.method`);
steps 3–4 run in the reader's tab (`mirror.js#composeLadder`, over the level
`view.js#sofiaQuarter` selects out of the НСИ payload).

1. Fill the intermediate deciles by piecewise-lognormal interpolation in the
   standard-normal quantile z, matching the D1/median/D9 anchors exactly.
2. Extrapolate the P1/P99 tails along the nearest segment's log-slope. Publish
   at SES's level, to **four decimal places** — see below.
3. In the browser: read НСИ's latest published quarter (Q1 2026 = €1915; the
   March month alone is €2061, an annual-bonus spike, which is why the level is
   a quarter and not a month).
4. Multiply every rung by `f = НСИ_Sofia_mean / ses_mean` (≈ **2.02** today) and
   floor P1 at the statutory minimum wage, which is the only point at which
   that floor means anything.

**Why the split is lossless, and why four decimals.** Re-levelling multiplies
D1, median and D9 by the same `f`, which adds `ln(f)` to every point of the
log-linear model and leaves both dispersions untouched — so `rung(f) === f ×
rung(1)`, exactly. Nothing is approximated by moving the multiplication. The
precision is the one real cost: at one decimal on both sides the double-round
moves P20, P60 and P70 by €0.10, so the published rungs carry four and the
browser rounds once. `test_relevelling_is_a_scalar_multiply` holds the property
and `test_rungs_carry_four_decimals_so_the_browser_rounds_once` holds the
precision.

**Output:** `shape.ladder_ses` at percentile cuts 1,10,20,…,90,99, `ses_mean`,
`sigma_bottom` and `sigma_top`. Composed and rounded, that is P10 €759 ·
P50 €1422 · P90 €3430 — the same figures this file has always quoted.

**Gross → net happens in the SPA too.** The salary input is net take-home, so
`mirror.js#buildLadder` converts each composed rung through `bgNetSalary` — one
payroll implementation, not two. Net median ≈ €1,104/mo, and the comparison is
net vs net.

**Caveats, carried in the payload's `disclaimer` and the SPA's `pctCaveat`:**
the level is live, the shape is a 2022 survey re-levelled to today, and it
assumes Sofia's dispersion tracks the national SES shape. Sofia-anchored, so a
national rank would be a few points higher; the middle deciles and the tails are
modelled, not surveyed.

---

## БНБ — `sources/bnb.py`

A separate module because БНБ's protocol is a direct XLSX download.

### TLS setup (once per environment)

`www.bnb.bg` serves a certificate issued by `GeoTrust EV RSA CA G2` but **does
not send that intermediate**, so a default trust store fails with `unable to get
local issuer certificate`. **Never disable verification.** Fetch the
intermediate from the leaf's own AIA URL:

```bash
curl -sSL -o /tmp/g2.crt 'http://cacerts.digicert.com/GeoTrustEVRSACAG2.crt'
openssl x509 -in /tmp/g2.crt -inform DER -out /tmp/g2.pem

# system-wide (preferred for a long-lived runtime)
sudo cp /tmp/g2.pem /usr/local/share/ca-certificates/bnb-geotrust-g2.crt
sudo update-ca-certificates --fresh

# or, without root, a one-off bundle
cat /etc/ssl/certs/ca-certificates.crt /tmp/g2.pem > /tmp/bnb-bundle.pem
export SSL_CERT_FILE=/tmp/bnb-bundle.pem

# verify (expect 200)
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download/s_ir_loan_oa_hh_bg.xlsx
```

Unfixed, `refresh --source mortgage` exits **4** and the error points back here.

### `s_ir_loan_oa_hh_bg.xlsx` — household loans by purpose

Sheet `LOAN_OA_HH`, 242 rows × 49 cols, monthly **2007-01 → present**. **The
cell:** Жилищни кредити (housing) × в евро (EUR) × maturity **total** — at
2026-05, **2.6717%** on a book of **€18.2 bn**.

**Column discovery, never a hardcoded index.** The header is four merged rows —
purpose → currency → maturity — and the connector re-reads them every run,
raising if the labels move:

| Header row | Col | Label | Meaning |
|---|---|---|---|
| 3 | 25 | `Обеми в млн. евро` | divider: rates left, volumes right |
| 4 | 9 / 33 | `Жилищни кредити` | housing block (rates / volumes) |
| 5 | 9 | `в евро` | EUR sub-block |
| 6 | 9 | *(blank)* | the block total ← **our cell** |
| 6 | 10–12 | `до 1 година` / `над 1 до 5 години` / `над 5 години` | maturity buckets |

We take the maturity **total**, not a bucket, because the honest answer to "what
does the average mortgage holder pay" is the whole book.

**Cross-check against ЕЦБ MIR:** БНБ **2.6717%** vs
`M.BG.B.A22.A.R.A.2250.EUR.O` **2.67%** — 0.002 pp apart, because they are the
same data (БНБ is the institution that reports MIR to the ЕЦБ).
`mortgage.py#cross_check_outstanding` enforces this as a gate at 0.30 pp.

**Methodology change in the payload:** Bulgaria adopted the euro on 2026-01-01.
Per the БНБ methodological note (`st_m_instr_irs_new_2026_bg.pdf`, 19 Feb 2026),
OLP and LEONIA Plus were retired, the BGN column dropped, and pre-2026 EUR
figures **reconstructed** by БНБ from BGN+EUR aggregates — so EUR values before
2026-01 are a reconstruction, not a contemporaneous observation.
`outstanding_stock.methodology_change` cites the PDF verbatim.

> **Do not use `s_ir_loan_oa_rm_hh_bg.xlsx`.** Its title is *"…loans other than
> overdraft for the household sector by original maturity, residual maturity and
> period until the next interest-rate change"*: every purpose blended, no
> housing breakdown at all. Two tells — its column volume is €28.7 bn (all
> household lending) against housing's €18.2 bn, and the neighbouring column
> reads 14.83%, a rate no mortgage has carried.

---

## ЕЦБ — `sources/ecb.py`

A separate module because the ЕЦБ's SDMX API uses position-based series keys and
its own response shape.

**Filter in the URL PATH, never the query string.**

```
RIGHT  GET …/service/data/MIR/M.BG.B.A2C.A.R.A.2250.EUR.N?format=jsondata&startPeriod=2020-01
     → 200, 14 KB, exactly 1 series

WRONG  GET …/service/data/MIR?REF_AREA=BG&BS_ITEM=A22&IR_BUS_COV=N&…
     → 200, 18.7 MB, 7,742 series — the ЕЦБ SILENTLY IGNORES unknown query
       parameters, so this is the whole MIR flow, unfiltered
```

The series key has 10 dimensions, all mandatory — a wildcard slot reopens the
multi-series hole:

```
FREQ . REF_AREA . BS_REP_SECTOR . BS_ITEM . MATURITY_NOT_IRATE
     . DATA_TYPE_MIR . AMOUNT_CAT . BS_COUNT_SECTOR . CURRENCY_TRANS . IR_BUS_COV
```

| Role | Series key | 2026-05 |
|---|---|---|
| **Headline** — AAR, new business | `M.BG.B.A2C.A.R.A.2250.EUR.N` | **2.43%** |
| All-in cost — APRC (ГПР), fees included | `M.BG.B.A2C.A.C.A.2250.EUR.N` | **2.77%** |
| New-business volume (splice evidence) | `M.BG.B.A2C.A.B.A.2250.EUR.N` | 599 m€/mo |
| Outstanding stock (cross-check gate only) | `M.BG.B.A22.A.R.A.2250.EUR.O` | 2.67% |
| Pre-2026 legs of the three above | same keys with `BGN` | AAR 2.48% @ 2025-12 |

- **`A2C`, not `A22`, for new business.** `A22` ("Lending for house purchase")
  exists for BG **outstanding only**; `A2C` is new business — 28 BG series,
  monthly, current.
- **`DATA_TYPE_MIR`:** `R` = annualised agreed rate, `C` = APRC (with fees),
  `B` = volume. Swapping `R` and `C` is a live risk, so a gate asserts
  APRC ≥ AAR − 0.05 pp, the tolerance being the two series' independent
  rounding (`mortgage.py#APRC_BELOW_AAR_TOLERANCE_PP`).
- **`BS_COUNT_SECTOR=2250`** = households + NPISH. `2240` is non-financial
  corporations.
- **Two response-identity guards in `parse_mir_series`, both required:** a
  fully-specified key must return exactly one series, and the response's own
  dimension metadata must match the key we requested. Together they make a
  silently-ignored filter impossible to mistake for real data.

### The BGN → EUR splice at eurozone entry

Before 2026-01-01 home loans were written in BGN and the EUR series covered a
niche; after it, everything is EUR and the BGN series stops. Monthly
new-business volume shows the scale: in 2025 the BGN leg averaged 1,090 m/month
against the EUR leg's 36 m/month; at 2026-05 the EUR series is 599 m/month.

So the published series is **BGN through 2025-12 spliced with EUR from
2026-01** — the rate in the currency of the day. The splice is continuous, which
is the evidence it is the right one: AAR 2.48% → 2.46%, APRC 2.90% → 2.74%
across the boundary. `EURO_SWITCH_PERIOD` in `sources/ecb.py` is the single
knob; `test_ecb.py` asserts the splice stays gap-free and step-free.

---

## имот.bg — `sources/imot.py`

**Why this source.** There is no machine-readable BG €/m² **level** series
anywhere: Eurostat's `hpi_ndh_q` and `prc_hpi_q` are rate-of-change indices, НСИ
publishes none in API form, and БНБ publishes none at all. имот.bg's public
`sredni-ceni` page publishes a per-district €/m² average **it computes itself**
from current listings.

The data is a JavaScript object literal in `windows-1251`:

```
var raioniAvgPrice = {'Банишора': 2504, 'Борово': 3000, ...};
```

We regex-extract that one literal — no JS execution — which makes the parse
robust to layout changes in the surrounding HTML.

**Sofia only:** имот.bg publishes per-district averages for Sofia (143
districts). Other cities use the same variable name in different DOM regions.
The JSON envelope (`city`, `city_en`, `n_districts`) is shaped so a second city
can be added without breaking the schema.

**Anti-injection bounds:**

- Drop any value outside `[100, 10000] €/m²` — the page legitimately returns
  ~990 to ~5,600.
- **Refuse to ship fewer than 20 valid districts.** The real page returns 143;
  under 20 means the regex caught a fragment.
- **Median first:** `eur_per_m2_median` is the headline, resistant to long-tail
  districts; the mean is kept for completeness and not surfaced prominently.

**Output** — `sofia_price.json`, `schema_version` 1.1: the envelope, the city
block, the summary (`eur_per_m2_median` / `_mean` / `_min` / `_max`), the page's
own published date (`page_as_of_dd_mm_yyyy`, Bulgarian «обновена на»),
`all_districts` (143 keys), and `historical[]` — one row per year `{year,
n_districts, eur_per_m2_median, eur_per_m2_mean, since_2015_median_pct}`,
ascending, 2015 (€754) → 2026 (€2501, +231.7%).

**`page_as_of_dd_mm_yyyy` is often empty, and the currently shipped payload is
one of those.** It is the only field here that cannot be re-derived: `as_of` is
the day we looked, not the day имот.bg recomputed, so with the stamp missing a
page frozen months ago publishes under today's date. The refresh warns loudly
and publishes anyway — 143 plausible districts are worth having — and the SPA
falls back to the scrape date via `payloads.js#refPeriod`, which is a weaker
claim honestly stated rather than the same one. When it is empty, check
`sources/imot.py#_extract_page_as_of` against the live page wording before
treating the prices as current.

**The historical archive** is one fetch per year for `Y` in
`[HISTORICAL_YEAR_MIN=2015, current_year)`. If a single year fails, that year is
omitted and the CLI prints a WARNING. `build_sofia_price_payload` recomputes the
current-year row's `since_2015_median_pct` from the formula rather than trusting
the per-year scraper.

**Where it is fetched from:** `www.imot.bg` answers datacenter IPs with a 403,
so this is the one connector that needs an ordinary Bulgarian connection. That
is why `sofia-price` is refreshed by hand while the other eight can run
anywhere, and why a 403 from this arm is an environment result rather than a
parser regression.

**Failure modes:** network/timeout → exit 4, and the home block renders
`HOME.eurPerM2_offlineFallback`. Page regression (literal absent, or under 20
districts) → exit 2 with a sample around the expected anchor.

---

## НСИ — `sources/nsi.py`

### `Labour_1.1.2.2_EUR_EN.xlsx` — Sofia-city quarterly gross wage

The workbook carries a monthly sheet (`2019-2026`) and **one sheet per year of
НСИ's own published quarterly averages** — `2020trimes` … `2026trimes`. We read
the quarterly sheets, for `-Sofia cap.` (Sofia-city statistical region, BG411).
2026-Q1 = **1915 EUR**, as published.

Each `{year}trimes` sheet is laid out r1 = title (ending `*` while the year is
preliminary), r3 = `Statistical regions` / `Quarters {year}`, r4 = the quarter
headers, r5+ = the region rows. Rows are found by region name and columns by
header rather than by index, so an inserted row upstream fails loudly instead of
shifting every reading by one region.

**Why the quarter, not the month.** BG wages spike every March as Q1 bonus and
13th-salary payments land: March runs +7% to +13% above its neighbours, and the
spike has grown every year. Anchoring the whole salary distribution to whichever
single month was last refreshed would inject a seasonal bias of up to ~8% and
make every percentile lurch when the next month lands. НСИ report quarterly for
the same reason.

**Why НСИ's quarter and not an average of their months.** Both are in the
workbook. Taking theirs means no figure in the payload is one this project
computed, which is what §2.1.1 of their licence needs — it forbids distributing
производни и сборни произведения ([`legal.md`](./legal.md) §НСИ). It is also
simply more accurate: НСИ publish 1915 for 2026-Q1, where the mean of their
three rounded monthly cells gives 1914.7.

**Two traps in the sheet, both guarded.**

- **Q4 is published twice**, as `IV` and as `IV incl.annual bonuses`, and the
  two diverge by 6–8% (2025: 1859 against 2009) because the second folds in the
  13th salary. We take `IV`; `_quarter_columns` refuses any column whose header
  mentions a bonus, and `test_the_annual_bonus_column_is_never_read_as_a_quarter`
  fails if that changes. Reading the wrong one would step the whole ladder up
  every fourth quarter and back down in Q1, and both figures are plausible
  Sofia wages, so no gate downstream would catch it.
- **The quarter headers mix alphabets** — Q1 and Q2 are Cyrillic І (U+0406),
  Q3 and Q4 are Latin I and V. `_roman_quarter` folds the Cyrillic form onto the
  Latin one, so the parse survives НСИ normalising the encoding either way.

**The regression guard:** we also read `-Sofia` (the province, excluding the
city) at the same quarter and assert `cap > province`. The live spread is
~50–70%, so a restructured workbook that made the selector pick the wrong row
fails in `test_nsi.py` before the number ships. If НСИ move the URL,
`test_connector_url_is_nsi_timeseries_xlsx` fails first.

**Two deliberate choices:** EUR not BGN, because the same table exists in BGN
but lags by one quarterly release and every other number in the SPA is EUR; and
the XLSX not the HTML landing page, because the page uses `rowspan`/`colspan`
headers that roll forward every quarter and break naive parsers.

`sofia_salary.json` carries the envelope, `dataset`
(`…xlsx:sheet={year}trimes:row=-Sofia cap.`), `ref_period`, `unit`
`eur_per_month`, `value`, `series_by_period` (every published quarter since
2020-Q1) and `disclaimer`.

**Every figure in it is one НСИ published**, headline included, and nothing
computes over it afterwards: `view.js#sofiaQuarter` selects the headline rather
than deriving one. `no НСИ payload carries a second publisher's figures` in
`verify_data_contracts.mjs` fails if `value` ever stops being a quarter from the
series beside it, and `test_no_figure_is_computed_only_selected` fails if the
connector starts averaging again — a change that would move no number a reader
could check, so nothing else would notice it.

---

## Dated legislative tables (not scraped)

### BG payroll — `payroll.py#BG_PAYROLL_TABLE` → `payroll.json`

The percentile ladder, the Sofia comparator and the salary verdict all convert
gross↔net using Bulgarian payroll rules, which are legislative constants with no
machine-readable feed. One dated table is the source of truth; the SPA reads it
via `mirror.js#payrollParams(data.payroll)` and threads the result through
`bgNetSalary` / `bgGrossFromNet` / `buildLadder`. The `mirror.js` `BG_2026_*`
constants are an **offline sentinel only**, parity-tested by `test_payroll.py`.

**2026-01-01 → 2026-07-31:** employee social contributions **13.78%**
(pension 6.58% + pension2 2.20% + sickness-maternity 1.40% + unemployment 0.40%
+ health 3.20%); flat personal income tax **10%** with no allowance; maximum
insurable income **€2111.64** (4130 BGN); statutory minimum gross wage
**€620.20** (1213 BGN).

**From 2026-08-01, and this is the entry `payroll.json` currently carries:** the
maximum insurable income rises to **€2300** for all insured persons — ЗБДОО
2026, adopted by the National Assembly **2026-07-22**. Nothing else moves: the
five contribution lines, the 10% flat tax and the €620.20 minimum wage are
unchanged. Which entry ships is whichever was in force on the refresh's `as_of`,
so the way to read the shipped figure is `payroll.json`'s `effective_from`
rather than this list.

**Which currency is authoritative.** Pre-euro figures were legislated in BGN and
the EUR side is a conversion (1213 BGN → €620.20). From 2026-01-01 Bulgaria
legislates in euro, so the newer figures are **EUR-native** and the BGN side is
the conversion (€2300 → 4498.41 BGN, *not* the round 4500 the press quotes).
An entry therefore sets **exactly one** of `<field>_eur` / `<field>_bgn`;
`payroll.py#_pair` derives the other at the fixed 1.95583 rate and **raises if
both or neither is set**, so the two can never disagree in the output.

**To reflect a law change: add a new effective-dated entry — never mutate an old
one — and re-run `--source payroll`** (no network). `build_payroll_payload(as_of)`
picks whichever entry was in force on the publish date, so an entry can be
landed before it takes effect. `scheduled_changes` documents
known-but-not-yet-effective changes so the SPA can surface them, and each one's
`effective_from` must be an **ISO date, never a condition** — "2026 (pending the
regular state budget)" was true until it wasn't, and nothing could tell.

### БНБ lending limits — `mortgage.py#BNB_LENDING_LIMITS`

Borrower-based measures adopted by the БНБ Governing Council 2024-09-11, in
force 2024-10-01 ([press release](https://bnb.bg/AboutUs/PressOffice/POPressReleases/POPRDate/PR_20240911_1_EN)),
quoted verbatim in the table:

| Limit | Value | Wording |
|---|---|---|
| LTV-O | **≤ 85%** | "the ratio between the loan amount and the value of the immovable property at origination (LTV-O) shall not exceed 85%" |
| DSTI-O | **≤ 50%** | "the ratio between the current debt service amount and the **monthly disposable income** of the debtor at origination (DSTI-O) shall not exceed 50%" |
| Maturity | **≤ 30 years** | "the maximum term of the loan agreement (maturity) shall not exceed 30 years" |

Banks may deviate on up to 5% of the prior quarter's new RRE lending.

**15% down is the regulatory floor**, not a convention — it is `100 − LTV-O`.
DSTI-O is measured against **net** income, which matches the app's "% of net
pay" cap. **Our affordability line is 30%**, deliberately stricter than the
legal 50% and than the ~38.5% weighted-average DSTI-O BG borrowers carry
([macroprudential overview](https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download/bs_mpp_overview_en.pdf));
`test_mortgage.py` asserts `30 < 38.5 < 50` so the ordering cannot silently
invert.

Same rule as payroll: **append a new dated entry, never mutate**, and cite the
БНБ press release in `source_url`.

---

## `mortgage.json` schema (v2.0)

Two tiers answering two plainly different questions, plus the regulatory limits.
`headline` names the default tier **in the data**, so the SPA never infers it
from key order.

| Key | Carries |
|---|---|
| `schema_version`, `as_of`, `source`, `headline` | Envelope. `headline: "new_business"`. |
| `new_business` | ЕЦБ. `_role`, `dataset` (the BGN key spliced with the EUR key), `source_url`, `ref_period`, `value_pct`, `rate_basis` (AAR), `series_by_period` (77 months), `currency`, `currency_history`, `methodology_change`. |
| `new_business.aprc` | The same loans' all-in cost with fees (ГПР): `value_pct` + `series_by_period`. |
| `new_business.monthly_volume` | How much was lent — the evidence for the splice. |
| `outstanding_stock` | БНБ. `_role`, the XLSX + sheet + cell in `dataset`, `value_pct`, `book_volume_eur_m`, 233 months back to 2007-01, `methodology_change`. |
| `cross_check` | `bnb_outstanding_pct`, `ecb_mir_outstanding_pct`, `delta_pp`, `tolerance_pp`, `status`. |
| `lending_limits` | `effective_from`, `ltv_max_pct` 85, `dsti_max_pct` 50, `maturity_max_years` 30, `min_down_payment_pct` 15, `prudent_dsti_pct` 30, `observed_weighted_avg_dsti_pct` 38.5, `dsti_income_basis`. |

Every `_role` string is in the payload on purpose: the three rates answer three
different questions, and the file has to say which is which to someone reading
it without this document.

**The three numbers must never blur in the UI:**

| Shown as | From | 2026-05 | Label the user reads |
|---|---|---|---|
| The default rate in the input | `new_business.value_pct` (AAR) | **2.43%** | "ЕЦБ · new home loans" |
| Sub-caption under it | `new_business.aprc.value_pct` | **2.77%** | "with all fees (APRC/ГПР)" |
| Learn-more only | `outstanding_stock.value_pct` | **2.67%** | "БНБ · loans already being repaid" |

The default is the **AAR, not the APRC**: the annuity formula needs an interest
rate. The fallback chain in `data.js#mortgageDefaultRate` is
`new_business → outstanding_stock → HOME.rateDefaultPct`, and tier 2 answers a
different question, so the returned `label` re-captions the UI rather than
letting it pass for "the rate".

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

## Update watch-list

Dated or conditional changes we already know are coming.

| What | Trigger | Action |
|---|---|---|
| **Annual weights release** | Eurostat publishes the new `prc_hicp_iw` vintage, historically ~late February | Nothing to do — but a refresh run between the January rate release and that date **will fail** the chain gate with "weights are the {y−1} vintage but the rates are {y}-01". That is correct: wait, do not publish a mixed vintage. |
| **A new ECOICOP version** | Eurostat announces one (ver.2 landed with three months' notice) | The classification gate fails the publish the moment the two cubes disagree. Enumerate the catalogue (`/api/dissemination/catalogue/toc/txt?lang=en`) to find the new dataset codes — **do not guess them**; the ver.2 weights cube is `prc_hicp_iw`, not the `prc_hicp_inw2` the pattern suggests. Then update `MINR_DATASET` / `IW_DATASET` / `COICOP_DIM` / `CP_DIVISIONS` in `sources/eurostat.py`, add friendly names to `COICOP_META`, and regenerate the fixtures (`pipeline/tests/fixtures/make_hicp_fixtures.py`). |
| **BG's group set changes** | Bulgaria starts or stops spending in a group (e.g. `CP082`, currently weight 0) | Nothing to do — the set is discovered at refresh time. But a group with no name in `COICOP_META` **fails the publish** by design; add a BG/EN name and re-run. |
| **Eurostat retires the I15 base** | ver.2's official base is 2025=100 (`I25`); `I15` is a recalculated back-series | Set `INDEX_UNIT = "I25"` and `INDEX_BASE_YEAR = 2025` in `sources/eurostat.py` — together, or the payload names a base its values are not on and `api_url_index` stops returning the published digits. Every index level in `data/published/` moves; no percentage the site renders does. |
| **Any max-insurable-income change** | A ЗБДОО amendment. The last was ЗБДОО 2026: €2111.64 → €2300, adopted **2026-07-22**, in force **2026-08-01**, and the shipped payload carries €2300 | Add the dated entry to `BG_PAYROLL_TABLE`; `in_force_entry` switches on the publish date, so a payload baked before the boundary correctly still carries the old ceiling. **Nothing re-runs the pipeline on its own** — run `--source payroll` on or after the effective date or the site serves the superseded ceiling with a real `as_of` on it, which is the failure mode this row exists for. Three things move in that same commit: `mirror.js#BG_2026_MAX_INSURABLE` (the offline sentinel, or first paint computes a net pay the fetch then corrects), the date `test_parity_with_spa_frozen_constants` builds at, and any worked example in `verify_net_salary.mjs` whose gross clears the ceiling. `test_the_spa_sentinel_matches_the_payroll_json_actually_shipped` fails until the sentinel agrees with what shipped. |
| **The euro-native ceiling** | Structural, from 2026-01-01 | BG now legislates these amounts in EUR. A table entry sets **exactly one** of `<field>_eur` / `<field>_bgn` and `_pair()` derives the other; setting both raises. €2300 is the statute — deriving it from the "≈4500 лв" the press rounds to would publish €2300.81. |
| **Minimum wage uprating** | A new MRZ (typically 1 Jan) | New dated entry (`min_wage_gross_bgn`). This re-floors the ladder's P1 automatically. |
| **Contribution or flat-tax rate change** | Legislation | New dated entry. `test_payroll.py` flags the SPA sentinel until `mirror.js#BG_2026_RATES` matches. |
| **SES 2026 wave** (2028) | Eurostat releases `earn_ses_monthly` 2026 — reference period 2026, transmission due T+16 months (April 2028) under Reg (EU) 2025/941 | Re-probe for BG and update `salary_dist.json`'s `shape.ref_year`. |
| **БНБ revises the borrower-based measures** | A Governing Council decision; БНБ reviews RRE risk quarterly | New dated entry in `BNB_LENDING_LIMITS`, re-run `--source mortgage`. Also bump the offline fallbacks in `content.js` and `data.js#mortgageLendingLimits`. |
| **The BGN legs stop being needed** | Structural | The BGN legs are frozen history and will never gain months. Around 2031, when the EUR leg alone covers 5+ years, the splice can retire — **not before**, or the chart loses its pre-euro history. |
| **ЕЦБ MIR revisions** | MIR is revised; the latest month or two can move | Nothing to do — each refresh re-pulls the whole series. Do not hand-edit `mortgage.json`. |
| **A BG MIR series is recoded** | ЕЦБ recoding | `parse_mir_series` raises rather than guessing, and the CLI exits 2. Re-enumerate BG's available series; never loosen a key to a wildcard. |
| **The HICP–CPI gap widens** | Structural, monitor | Typically within ~0.2 pp. If it grows past ~1 pp, re-word the site explainer; the app stays on HICP either way. |
| **SES shape is national, applied to Sofia** | Structural | Sofia's dispersion is likely wider at the top, so the ladder can understate the top tail. Disclosed in the payload and the SPA. Re-examine if a Sofia-specific distribution becomes machine-readable. |

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

## Query examples (curl debugging)

The actual URLs the connectors send. Each carries a trap; the rest are
mechanical variations.

```bash
BASE=https://ec.europa.eu/eurostat/api/dissemination

# HICP rate and index — ONE unfiltered call each for the whole BG slice.
# Adding coicop18=A+B would return an EMPTY cube with HTTP 200.
curl -sS "$BASE/statistics/1.0/data/prc_hicp_minr?format=JSON&lang=EN&geo=BG&unit=RCH_A&lastTimePeriod=12"
curl -sS "$BASE/statistics/1.0/data/prc_hicp_minr?format=JSON&lang=EN&geo=BG&unit=I15&sinceTimePeriod=2020-01"

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
`une_rt_m` (`sinceTimePeriod=2020-01`).

> **Probe protocol, especially for BG.** Before assuming any Eurostat series
> works for Bulgaria, `curl` it with `geo=BG` and check `len(payload.value) > 0`.
> A 200 with `value: {}` is a *failure*, not a pass.

## Response shape (ND-cube — every Eurostat dataset)

```json
{
  "id":   ["freq", "unit", "coicop18", "geo", "time"],
  "size": [1, 1, 1, 1, 78],
  "dimension": { "coicop18": {"category": {"index": {"CP01": 0}}}, "…": "…" },
  "value": {"0": 116.06, "1": 116.23, "…": "…"}
}
```

`value` is a flat dict keyed by **linear index** over the ND-cube, decoded as
`(i_0 … i_{N-1})` using `size` as row-major strides — last dimension varies
fastest. `_cube_to_rows` in `sources/eurostat.py` does this, and nothing should
need to touch it unless a dimension is added or removed.

## Working with a new upstream

**Everything below is how, not whether.** Whether a source is worth adding is a
product question; this section is the method for the ones that are, learned from
the five connectors that ship.

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
records its endpoint. `sofia-price` needs an ordinary Bulgarian one, which is
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

In one commit, or it does not ship:

1. `pipeline/sources/<name>.py` following the shape of its fetch plan
2. Gates in `validate.py` — a new payload with no gate is a number nobody checks
3. The payload written by `publish.py`, with `source_url`, `as_of` and `notes`
4. Tests beside the code ([`testing-strategy.md`](./testing-strategy.md)),
   fixtures not live calls
5. **The licence quoted verbatim and dated in [`legal.md`](./legal.md), plus an
   `UPSTREAMS` entry in `site/src/lib/legal.js`** — `principles.md` §"Hard rules" rule 1
6. A row in this file's tables
7. The footer attribution, if the publisher is new
   (`test_footer_credits_every_upstream_we_use`)

## Cross-references

- [`architecture.md`](./architecture.md) — how these sources feed the bake
- [`math.md`](./math.md) — the provenance contract
- [`validation-gates.md`](./validation-gates.md) — how drift is caught
- [`legal.md`](./legal.md) — what each publisher permits
- [`local-development.md`](./local-development.md) — running the pipeline against live upstreams
