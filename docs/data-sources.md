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
| **Average gross wage by област** — НСИ `Labour_1.1.2.2_EUR_EN.xlsx` + `_EUR.xlsx` | VERIFIED | `region_salary.json`. All 28 области, both language editions, НСИ's published quarters from 2020-Q1. |
| **€/m² by city** — `imot.bg/sredni-ceni` | VERIFIED | `city_price.json`. 27 cities, each with its own district count and its own year window. |
| **Unemployment rate** — `une_rt_m` | VERIFIED | `unemployment.json`. **Monthly**, seasonally adjusted, 2020-01–. 2.9% at 2026-05. |

## Not available (do not cite as a working source)

| Source | Tag | What the probe found |
|---|---|---|
| НСИ SDMX-RI (`nsi.bg/ddb2.1/rest/*`) | WRONG | Every path 404s. `infostat.nsi.bg` redirects to marketing; `datacatalog.nsi.bg` is CMS-only. |
| `data.egov.bg` | WRONG | Not CKAN, no JSON API surface. Good for pointing users at datasets, useless programmatically. |
| БНБ real-estate section | WRONG | A Site Studio shell returning identical bytes for every URL. **БНБ does not publish residential property prices machine-readably** — which is why the €/m² level comes from имот.bg. |
| НСИ city-level housing €/m² | WRONG | PDF press releases only; not structurally machine-readable. |
| A **city**-level average wage, for anywhere but София | WRONG | НСИ publish the wage by **област** and by statistical region, and nothing below. София-city is the exception by accident of geography: it is its own statistical region, BG411, so there the област and the град are the same area. Everywhere else the €/m² is a city's and the wage beside it is its област's, which is why the two cards name their own geographies rather than sharing a heading. |
| **имот.bg rentals** — `/sredni-ceni/naemi-{slug}` | VERIFIED, deliberately unused | Exists for every city and serves the **same** `raioniAvgPrice` identifier, in float €/m² per **month** (1.39-32.48, every value below 100). Out of scope, and `sources/imot.py` refuses the URL and the fractional value rather than merely not asking for it. |
| `earn_ses_pub1e` / `earn_ses_pub1t` for BG | WRONG | The SES *publication* tables 404 for BG. The main cubes `earn_ses_monthly` / `_hourly` do carry BG — use those. |
| `prc_hicp_ctr` / `prc_hicp_ctrb` as a BG cross-check | WRONG | Euro-area aggregate cubes: `geo=BG` and `geo=DE` both return an empty `value` map with HTTP 200, while `geo=EA` returns tens of thousands of observations. They cannot cross-check a Bulgarian figure. |
| A pay **distribution** by sector for BG (any publisher) | WRONG | Probed 2026-08-06. `earn_ses_monthly` with `nace_r2=J&geo=BG` returns HTTP 200, `"value": {}`, `nace_r2` size **0** — section J is not a category in the cube. Its five `nace_r2` categories for BG are all broad groupings and none is a NACE section: `B-S_X_O` (whole economy), `B-N`, `B-F`, `G-N`, `P-S`. At the 2022 vintage `salary_dist.json` reads, only `B-S_X_O` carries any values; the other four stop at 2018. **So no section-level median, decile or spread exists at any vintage.** НСИ's `Labour_1.1.2.1` publishes a sector **average** and nothing else, which is why the sector card compares against an average and says so. |
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
- Rate and index come from the same cube, and on a **full** release at the same
  publication, so `annual_rate_pct`, `latest_index` and the headline all share
  the latest month.
- **The flash release breaks that, on purpose.** Eurostat publishes BG's
  all-items rate about two weeks ahead of the rest of the month's cube: at
  `unit=RCH_A` the flash month carries TOTAL and nine aggregates (`FOOD`, `NRG`,
  `SERV`, `TOT_X_NRG`…) and no `CPnn` at all, and at `unit=I15` it carries
  nothing. So the freshest CP00 rate can be one month ahead of every other
  figure in both payloads. `cli.py#_refresh_hicp` detects that from the cube —
  the headline's month missing from both the index series and CP01..CP13 —
  publishes `hicp_headline.json` alone with `is_flash: true` on it, and leaves
  `hicp_categories.json` untouched until the full release lands. The flag is
  what the site marks «експресна оценка» off, and gate 7 refuses to publish a
  headline whose flag and whose two months disagree. The aggregates are why the detector
  names the divisions rather than "any code but CP00": both fetches are
  unfiltered, so those nine are in the response, at the flash month.
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
distribution for BG, and nothing at all publishes one below the national
level.** Everything was probed:

| Dataset | Latest | Why it cannot rank a salary |
|---|---|---|
| `earn_ses_monthly` / `_hourly` / `_annual` | 2022 | The only individual-earnings *distribution*. 4-yearly. **Used, for shape.** |
| `earn_nt_net` / `earn_nt_netft` | 2025 | A tax model at fixed reference cases (fractions of the mean), not percentiles. |
| `ilc_di01`, `ilc_di03` | 2025 | *Household* disposable income — the wrong unit; mixing it with a one-person salary question pushes almost every wage into the top few percent. |
| `ilc_di11` (S80/S20) | 2025 | A single inequality ratio. |
| НОИ insured income | monthly | Capped at the maximum insurable income (€2,111.64), barely above the Sofia average, so the whole upper half piles at the ceiling. |
| НСИ quarterly wages | quarterly | *Average* only, no distribution — by област and by activity alike. It is our level anchor, applied in the browser — see below. |

So the ladder needs two official sources: the **shape** from Eurostat SES 2022,
the **level** from НСИ's live all-activities average gross wage.

**Both halves are the COUNTRY's, and that is the constraint rather than a
default.** The shape is national: SES publishes D1, the median and D9 for
Bulgaria and nothing below that, at any vintage, from any publisher. So the
level it is re-levelled onto has to be national too, or a national spread is
being multiplied by one област's mean and the result called that област's
ranking. Anchored on София's €1915 instead of the country's €1407, a €900 net
wage reads as ahead of 30% of earners where the country's own ladder puts it at
49% — every rung stays plausible, the ladder stays monotonic, and nothing on
screen shows the difference. `view.js#nationalQuarter` is where the level is
selected, out of `sector_salary.json`'s all-activities «Общо» row, and
`the ladder is anchored on the country's average and never on one област's` is
what holds it.

**The reader's own област does not move the ladder**, and the copy says so —
`COPY.pctCaveat` in both languages, and `verify_copy.mjs` requires it. That is
P11: a figure nobody publishes is uncomputed rather than concealed.

**«Общо» is not a sector**, which is why `view.js#sectorOptions` drops it from
the picker and `sectorComparison` refuses it by name. This is the one place in
the app that row is what is wanted, and it is wanted precisely because it is
not one activity.

**They are not blended into one file: one publisher per published artefact.**
That keeps each file travelling under one set of terms, which is what makes both
of them straightforward to redistribute — including by anyone who forks this.
So the two halves stay apart all the way to the reader's browser:

| File | What it carries | Whose terms govern it |
|---|---|---|
| `salary_dist.json` | The SES ladder at **Eurostat's own level**, plus `ses_mean` | Eurostat's, and it is a disclosed derivative |
| `region_salary.json` | НСИ's **published quarterly series**, per област | НСИ's, and it is a straight reproduction |

**Method.** Steps 1–2 run in the pipeline
(`transform.py#build_ses_shape_ladder`, restated in the JSON's `shape.method`);
steps 3–4 run in the reader's tab (`mirror.js#composeLadder`, over the level
`view.js#regionQuarter` selects out of the НСИ payload).

1. Fill the intermediate deciles by piecewise-lognormal interpolation in the
   standard-normal quantile z, matching the D1/median/D9 anchors exactly.
2. Extrapolate the P1/P99 tails along the nearest segment's log-slope. Publish
   at SES's level, to **four decimal places** — see below.
3. In the browser: read НСИ's latest published quarter for all activities
   (Q1 2026 = €1407; the March month alone spikes on annual bonuses, which is
   why the level is a quarter and not a month).
4. Multiply every rung by `f = НСИ_national_mean / ses_mean` (≈ **1.48** today)
   and floor **every** rung at the statutory minimum wage, after scaling.

**Why the floor is on every rung and not only on P1.** A scalar re-level moves
the whole shape by however much the MEAN moved, and Bulgaria's minimum wage has
moved faster: €363/month at SES's 2022 vintage against €620 today, +71%, where
the mean went 949 → 1407, +48%. So the bottom of the scaled shape lands under a
wage it is not lawful to pay a full-time employee — P10 composes to €558 — and a
rung there is an artefact of the model rather than a wage anybody is on. The
floor leaves the ladder weakly rising; `mirror.js#percentile` is safe on that,
because a flat pair at the bottom sits behind its `salary <= ladder[0]` branch
and the interpolation never divides by a zero span.

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
`sigma_bottom` and `sigma_top`. Composed against the national anchor and
rounded, that is P10 €620 (the statutory floor) · P50 €1045 · P90 €2520.

**Gross → net happens in the SPA too.** The salary input is net take-home, so
`mirror.js#buildLadder` converts each composed rung through `bgNetSalary` — one
payroll implementation, not two. Net median ≈ €811/mo, and the comparison is
net vs net.

**Caveats, carried in the payload's `disclaimer` and the SPA's `pctCaveat`:**
the level is live and the shape is a 2022 survey re-levelled to today; the
middle deciles and the tails are modelled, not surveyed; and the rank does not
follow the reader's област, because no publisher measures how pay is spread
inside one.

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
`sredni-ceni` pages publish a per-district €/m² average **they compute
themselves** from current listings.

The data is a JavaScript object literal in `windows-1251`:

```
var raioniAvgPrice = {'Банишора': 2504, 'Борово': 3000, ...};
```

We regex-extract that one literal — no JS execution — which makes the parse
robust to layout changes in the surrounding HTML.

**27 cities**, each at `https://www.imot.bg/sredni-ceni/prodazhbi-{slug}`.
София is the exception: her canonical page is the bare `/sredni-ceni`, and
`prodazhbi-sofiya` 302-redirects there. The Cyrillic→slug map is a dated table
in `regions.py` because it cannot be computed — «Търговище» is `targovishte`
with one `г` and «Кърджали» is `kardzhali` with one `ъ`. The 28th област,
Софийска, has no имот.bg page of any kind; a reader who picks it is told so
rather than handed София's figure.

**Everything below was probed on 2026-08-09** from a residential connection in
Bulgaria, across all 27 cities and every archive year each of them serves.

### The four ways this connector could publish a wrong number

Each looks entirely right on the page, and each has a named guard.

| Trap | What it would publish | Guard |
|---|---|---|
| **Rentals** at `/sredni-ceni/naemi-{slug}` serve the SAME variable name, in float €/m² per **month** | a monthly rent as a purchase price | `_assert_sales_page` on the requested URL *and* on the final URL after redirects, plus a raise on any fractional value |
| **`date=` is silently ignored** when invalid, future or out of range — the response is byte-identical to the no-parameter baseline | today's numbers under an old date, with every downstream gate passing because the file is internally consistent | the connector never sends `date=` at all, held by a test over every URL it can build |
| **District counts run 141 to 7**, so no flat floor fits | a truncated parse published as a small city | a floor at 60% of that city's own count in `regions.py#imot_districts` |
| **The sanity bounds drop rows** and nothing counted them | a thin dataset published as a complete one | `n_dropped` per city-year, and the run fails above 20% |

**`year=` is safe and `date=` is not, and that asymmetry is the single most
important thing about these two parameters.** A year имот.bg has no data for
returns 200 with **no literal at all** and a page about a quarter of the usual
size, so the parse fails loudly. An invalid `date=` returns the current
snapshot.

**The page's own `<select name="date">` is the provenance anchor.** Its newest
option — taken by date, not by position, because the order is имот.bg's to
change — is their published snapshot date, and it is what `snapshot_date`
carries. That is a stronger claim than the fetch date: "the day they published"
rather than "the day we looked". When the list cannot be parsed the field is
`null` and the SPA dates the card by `as_of`, which is a weaker claim honestly
stated rather than the same one.

**There is no «обновена на» field and there never was.** Probed across all 27
cities for the current year plus София back to 2000: **zero pages contain the
substring «обновен»** in any case. The extractor that looked for it shipped an
empty string for the life of the payload.

### Which years each city publishes

A year qualifies when it has **at least 6 districts and at least 40% of what
that city publishes in the current year**, and the published window is the
**unbroken** run of qualifying years ending at the current one. All three parts
are computed per city at refresh time; none is a constant.

**The thin early years are wrong rather than merely imprecise.** имот.bg's
coverage of a city grew over two decades, and a median over four districts is
not the same measurement as a median over thirteen: Blagoevgrad's median moves
**+219% year over year** inside its thin years on a four-to-six-district sample,
and Burgas 70% in its own. Those are sampling artefacts wearing the clothes of
price moves, and no gate downstream would catch one — the file would be
internally consistent.

**The unbroken-run clause does most of the work.** A city whose coverage
collapses for a year and recovers has not been measured the same way throughout,
so everything before the gap is disqualified. That is how Blagoevgrad's 2003 and
2004 fall out on their own, its 2007 having dropped to 6 districts of a
current 13.

**Which of the two thresholds actually decides is a fact about city size, and
it is worth knowing before either number is touched.** They cross at 15
districts (6 ÷ 0.40), so for the **16 cities at or below that** — Ловеч at 7 up
to Враца, Габрово and Ямбол at 15 — the share clause computes 2.8 to 6.0 and
the flat 6 is what binds. The share only decides for the 11 larger ones, from
Хасково and Видин at 19 up to София at 141. So a small city's year is admitted
on 6 districts however few that is of its own total, and in Плевен's case 6 of
11 is 55% — comfortably above the 40% the rule nominally asks for, which is why
this is the rule working rather than a hole in it.

What it costs is that the largest year-over-year move left inside any published
window, Плевен's **+120% across 2003-04**, is a reading over 6 districts, and
nothing on the card says so: `n_districts` travels on every historical row of
`city_price.json` and appears on no screen. It is inside Плевен's window, so it
is inside the «+X% от 2003» that card prints. Whether it is a price move or a
composition change cannot be told from the payload, and tightening either
threshold to exclude it is not a decision to take from the file — it needs the
per-city-year district counts from a live probe, which this repository does not
carry.

On the probe's data every one of the 26 non-Sofia cities keeps a trend, most
reaching 2003 to 2007. Below **five** consecutive years the payload sets
`trend_publishable: false` and the SPA shows the €/m² without a «since YEAR»
sentence — the chart still carries every qualifying year, because the data is
not in doubt, there is simply not enough of it to call a trend.

### The sanity bounds, and why they do not widen

Drop any value outside `[100, 10000] €/m²`. The sub-100 values in the history
are **sentinels, not cheap flats** — Burgas 2008 carries a 0, 2010 a 5, 2004 a
9; Blagoevgrad 2006 a 4, 2008 a 6 — so widening the band to `[10, 100_000]`
would admit the 13 and reject the 9, which is an arbitrary line through a set of
values that are uniformly junk. `AGENTS.md` forbids it in terms.

What changed is that the drop is no longer silent: every city-year publishes
`n_dropped`, and `_assert_drop_share` fails the run above **20%**. That
threshold is measured rather than chosen — inside the windows this connector
publishes, only **5 of 186** city-years drop anything at all, the worst is Ruse
2003 at 2 of 20 = 10%, and all 27 current-year pages drop none.

**Output** — `city_price.json`, `schema_version` 2.0: the envelope, then
`city_pages[]`, then one block per city carrying `code` (the join to
`region_salary.json`), both published names, that city's own `source_url`,
`snapshot_date`, `n_districts`, `n_dropped`, the summary (`eur_per_m2_median` /
`_mean` / `_min` / `_max`), `baseline_year`, `since_baseline_median_pct`,
`trend_publishable`, and `historical[]` — one row per qualifying year with its
own district and drop counts.

**`city_pages[]` is имот.bg's coverage and `cities[]` is the run's result**, and
they are separate fields because they are separate claims. `city_pages` is every
код имот.bg serve a `sredni-ceni` page for — the 27 of `regions.py#PRICED_REGIONS`
— and it holds whether or not a refresh reached them. Without it the two
absences are indistinguishable in the file, and the SPA prints имот.bg's name
over both: «имот.bg не публикува цени за Варна» is false about a publisher who
does publish Варна, in the wording borrowed from the one област it is true of.
`view.js#cityCoverage` is the three-way answer the cards and the picker share,
and only its `nopage` state may be stated in имот.bg's name.

**`all_districts` is not published.** The per-district dict was carried for
every city and read by nothing — no component, no view function, no verify
script — and at 27 cities it is about 120 KB raw and 40 KB gzipped on every page
load. What goes with it is the only way to recompute a median from the file
itself; the median, mean, range and district count stay, which is what the page
cites.

**Where it is fetched from.** `www.imot.bg` answers datacenter IPs with a
**403**, so this is the one connector that needs an ordinary Bulgarian
connection. That is why `city-price` is refreshed by hand while the other eight
arms run anywhere, and why a 403 from this arm is an environment result rather
than a parser regression. A full sweep is ~650 requests, about two and a half
minutes at 200 ms spacing; имот.bg showed no throttling at all on a
100-request burst, so the spacing is politeness rather than a measured need.
**Never route it through a proxy** — `docs/legal.md`.

**Failure modes:** every city unreachable → exit 4 (the datacenter-IP case). One
city's page changed shape, served rentals, or came in under its floor → that
city is skipped with a WARNING and the other 26 publish. The payload gate →
exit 3. A city absent from the file renders its price card empty rather than
borrowing another city's figure.

**Fixtures are built, not saved**, for the same 403 reason —
`tests/fixtures/make_imot_fixtures.py` says what each one encodes and which
probe it came from. They prove the parser handles имот.bg's shapes and cannot
prove имот.bg still serves them; `test_live_upstreams.py -m live` is the check
that can, and it also asserts имот.bg's own city dropdown still offers exactly
the 27 names `regions.py` carries.

## НСИ — `sources/nsi.py`

### `Labour_1.1.2.2` — quarterly gross wage by област, both editions

The workbook's own title is `AVERAGE GROSS MONTHLY WAGES … BY STATISTICAL
REGIONS AND DISTRICTS`, and that is what we read: **all 28 области**, from the
`{year}trimes` sheets — НСИ's own published quarterly averages. 2026-Q1 runs
**968 EUR** (Благоевград) to **1915 EUR** (София-столица), as published.

**Both language editions**, `_EUR_EN.xlsx` and `_EUR.xlsx`, for the reason the
by-activity table reads both: the област names are half of what this payload is
for, a picker has to print them, and translating НСИ's English ourselves is how
«София(столица)» becomes something they never wrote. The two are joined by label
and every paired cell must be equal, so one edition revised without the other
raises rather than dating half the payload wrongly.

**The two editions are not row-aligned.** The Bulgarian one carries an extra
«Общо» row above the unit marker, so its quarter headers sit one row lower, and
its sheets are named `'2026 trimes '` where the English ones are `2026trimes`.
Neither the header row nor the sheet name may therefore be an index or a
literal: the header row is found by being the first that parses as four
quarters, and the sheets are matched by year.

Each sheet holds six statistical-region headings interleaved with the 28
district rows. **The leading hyphen is the only thing separating them** —
`-Vidin` is an област, `Severozapaden` is the region above it — and the region
rows carry wages of the same magnitude, so a parse that took them would publish
six extra "places" that are not области at figures that look like wages.

**There is no Bulgaria row**, and none is derived. An unweighted mean over 28
области would be both a производно произведение and wrong arithmetic. The
national figure the salary ladder is anchored on is НСИ's own «Общо», published
in `sector_salary.json`.

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

- **Q4 is published twice**, as `IV` and as `IV incl.annual bonuses`
  («IV вкл.годишни премии»), and the two diverge by 6–8% (2025: 1859 against
  2009) because the second folds in the 13th salary. We take `IV`;
  `_quarter_columns` refuses any column whose header mentions a bonus in either
  spelling, and `test_the_annual_bonus_column_is_never_read_as_a_quarter` fails
  if that changes. Reading the wrong one would step the whole ladder up every
  fourth quarter and back down in Q1, and both figures are plausible wages, so
  no gate downstream would catch it.
- **The quarter headers mix alphabets** — Q1 and Q2 are Cyrillic І (U+0406),
  Q3 and Q4 are Latin I and V. `_roman_quarter` folds the Cyrillic form onto the
  Latin one, so the parse survives НСИ normalising the encoding either way.

**The regression guard has three parts and all of them hold.** Reading one row
could only compare it against a neighbour, and there is no universal "region X
beats region Y" between any other pair. Reading the whole table affords:

1. every one of the 28 области named in `regions.py` is present, in both
   editions — a renamed row fails here rather than going missing from a picker;
2. no district row is present that table does not name — without this the check
   is one-directional, and НСИ splitting an област would publish 28 of 29;
3. Sofia-city is the maximum, 1915 against a next-highest 1304.

Together they catch what a `cap > province` comparison could not: an off-by-one
that shifts every reading by one област keeps that comparison true while putting
Варна's wage under Добрич's name. If НСИ move a URL,
`test_connector_url_is_nsi_timeseries_xlsx` fails first.

**Two deliberate choices:** EUR not BGN, because the same table exists in BGN
but lags by one quarterly release and every other number in the SPA is EUR; and
the XLSX not the HTML landing page, because the page uses `rowspan`/`colspan`
headers that roll forward every quarter and break naive parsers.

`region_salary.json` carries the envelope, both `source_url`s, `dataset`,
`ref_period` (the latest quarter EVERY област carries), `unit` `eur_per_month`,
`is_preliminary`, `disclaimer`, and one block per област: `code` — the join to
`city_price.json` — `en_name`, `bg_name`, `value_eur` and `series_by_period`
(every published quarter since 2020-Q1).

**`code` is this project's key, and it is имот.bg's slug wherever there is one**,
so 27 of the 28 are a name an upstream already uses. `regions.py` is the table;
`sofia-oblast` is the 28th, and the one with no city page.

**An област is not a city, and the payload says so.** The `disclaimer` names it
because the €/m² beside this wage on the page IS a city's: София-столица is the
one place where the two coincide, being its own statistical region. The cards
carry their own geographies rather than sharing a heading.

**`is_preliminary` is the star on the sheet title, and it is a field rather
than a sentence in `notes`.** НСИ mark a whole year provisional until they
finalise it, so their newest quarter carries it for about a year — long enough
that a reader meeting one has no reason to think it anything but settled unless
told. The SPA renders it beside the figure on the wage strip card, the same
marker `sector_salary.json` puts on the sector card: the two are one publisher's
two cuts of one quarterly release, and marking one without the other leaves a
reader unable to tell the two claims are the same claim.

**Every figure in it is one НСИ published**, headline included, and nothing
computes over it afterwards: `view.js#regionQuarter` selects the headline rather
than deriving one, and it answers for the област asked for or for none —
never for a first row, a largest област or София.
`no НСИ payload carries a second publisher's figures` in
`verify_data_contracts.mjs` fails if a `value_eur` ever stops being a quarter
from the series beside it, and `test_no_figure_is_computed_only_selected` fails
if the connector starts averaging again — a change that would move no number a
reader could check, so nothing else would notice it.

### `Labour_1.1.2.1_EUR_EN.xlsx` + `_EUR.xlsx` — gross wage by economic activity

The sibling table, same directory and same terms: 19 NACE Rev 2 sections plus
`Total`, quarterly. **Both language editions are read** — `_EUR_EN.xlsx` carries
English section names, `_EUR.xlsx` (no language suffix) the Bulgarian ones, with
identical figures. 2026-Q1: all activities **1407 EUR**, Information and
communication **3176 EUR**, as published.

**Why both files.** The section names are half of what this payload is for, and
translating НСИ's English ourselves is the whole hazard of the feature in one
step. Their Bulgarian name for section J is «Създаване и разпространение на
информация и творчески продукти; далекосъобщения» — nobody reads that as «ИТ»,
where a translation of "Information and communication" invites exactly that.
The two editions also pin each other: rows are paired by position and every
paired cell must match, so a reordered row raises instead of shipping one
section's wage under another's name.

Each per-year sheet — `{year}NaceRev2` / `{year}КИД2008` — stacks **four**
blocks: monthly by activity, monthly by ownership, quarterly by activity,
quarterly by ownership. Two further rows carry `Total` in column 0 with no data
at all, so a label-only lookup finds a blank row before either real one. Every
block is bounded from the header row it was found by and terminated by the first
blank label. The `IV incl.annual bonuses` / «IV вкл.годишни премии» column is
refused in both spellings, the quarter headers mix alphabets, and the quarter is
taken rather than a month for the same reason as `1.1.2.2` — March is the annual
bonus peak, and for section J it reads 3617 against a published 3176.

**There is no distribution behind these averages, and there is none to find.**
Probed 2026-08-06: `earn_ses_monthly` filtered to `nace_r2=J&geo=BG` returns
HTTP 200 with `"value": {}` and a `nace_r2` dimension of size **0** — section J
is not a category in the cube, which is the whole answer. Unfiltered, BG carries
five `nace_r2` categories — `B-S_X_O`, `B-N`, `B-F`, `G-N`, `P-S` — and **every
one is a broad grouping rather than a NACE section**. The finest is `G-N`,
"services of the business economy", which lumps section J together with G, H, I,
K, L, M and N; there is no cut at which J stands alone.

At the 2022 vintage `salary_dist.json` reads, only `B-S_X_O` carries any values
at all — the four groupings are populated to 2018 and empty from then on. Both
halves matter and neither is sufficient alone: the vintage gap is why nothing
below the whole economy is available now, and the missing section is why a
richer vintage would not help either. So no sector median, no sector deciles and
no sector spread exists from any publisher, and the site says so on screen rather
than implying a rank (`COPY.sectorNoRank`, and `docs/principles.md`'s closed
list). Anyone revisiting this should re-run both probes before assuming
otherwise — and read the `nace_r2` category list, not only the value count.

The payload `sector_salary.json` carries the envelope, `dataset` (both
workbooks and the block inside them), `source_url_bg` beside `source_url` so a
verify link can land on the edition the label came from, `ref_period`, `unit`
`eur_per_month`, `is_preliminary` — the same star on the same sheet titles as
`1.1.2.2` above, and it has to move with that one — and per activity:
`en_name`, `bg_name` (both НСИ's own), `value_eur` and
`series_by_period`. Nothing in it is computed
— the gap a reader sees is `mirror.js` arithmetic in their own tab. `sector
wages` (gate 7 in `validate.py`) fails the publish if a headline stops being the
published cell, and `sector_salary.json carries no rank, because nobody
publishes one` in `verify_data_contracts.mjs` fails if a percentile-shaped field
appears in a row.

**The `Total` row is in the payload, and it is what the percentile ladder is
anchored on** — §"Salary distribution" above has why a national spread needs a
national level. That is the one use of it; it is not in the picker. It is НСИ's
all-activities average — the figure the nineteen sections are read against, and
the connector's regression guard is that it sits inside their range — but it is
not an economic activity anybody works in. Offered in a list labelled «Твоят
сектор» it collects the reader who cannot find their own line and answers them
with a distance from the whole economy, under a caveat calling the options
broad КИД-2008 sections. `view.js#sectorOptions` leaves it out and
`view.js#sectorComparison` refuses it at the lookup, so one list's contents are
not the whole guarantee.

---

## Dated legislative tables (not scraped)

### BG payroll — `payroll.py#BG_PAYROLL_TABLE` → `payroll.json`

The percentile ladder, the област comparator and the salary verdict all convert
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
2026, adopted **2026-07-22**, promulgated **ДВ бр. 68 от 28.07.2026**. Nothing
else moves: the five contribution lines, the 10% flat tax and the €620.20
minimum wage are unchanged. The draft of that act is the thing to be careful of,
because it still outranks the act itself in search: it carried a **€2352**
ceiling and raised фонд "Пенсии" from 14.8% to 16.8% for those born after 1959,
and neither was enacted. Two changes the act does make sit outside this table on
purpose — ТЗПБ moves for seven economic activities and is wholly employer-side,
and държавни служители begin paying personal contributions at 80:20, a different
insured category from the III категория труд employee modelled here.
Which entry ships is whichever was in force on the refresh's `as_of`,
so the way to read the shipped figure is `payroll.json`'s `effective_from`
rather than this list.

**The ДВ citation is a field, not a caption.** `source_url` is
dv.parliament.bg's landing page and can be nothing else: their permalinks are
built from a session-side id that the issue number does not yield, so a
constructed one 404s for the reader who checks. P9 therefore puts the
instrument in the caption instead of behind the link, and an entry that IS one
act carries `gazette_issue` + `gazette_date` — «бр. 68 от 28.07.2026», which is
what ДВ's own archive is searched by. `payroll.py#_gazette` **raises on half a
citation** (the archive is indexed by both, and a date alone names a day
several issues were promulgated on) and on a promulgation dated after the entry
comes into force. Both keys are published as `null` where the set comes from
several acts — the January entry's ceiling is ЗБДОО's, its flat rate ЗДДФЛ чл.
48 ал. 1's and its minimum wage a ПМС's, so no single issue is true of it and
the caption names the year instead. Five figures on `/how/` render off this
pair.

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

In one commit, or it does not ship:

1. `pipeline/sources/<name>.py` following the shape of its fetch plan
2. Gates in `validate.py` — a new payload with no gate is a number nobody checks
3. The payload written by `publish.py`, with `source_url`, `as_of` and `notes`
4. Tests beside the code ([`testing-strategy.md`](./testing-strategy.md)),
   fixtures not live calls
5. **The licence quoted verbatim and dated in [`legal.md`](./legal.md), plus an
   `UPSTREAMS` entry in `site/src/lib/legal.js`** — `principles.md` §"Hard rules" rule 1
6. A row in this file's tables
7. The footer attribution, if the publisher is new — `verify_legal.mjs`
   §"the footer credits every upstream the pipeline pulls from" holds the list
   in both languages, and several of those publishers require the credit as a
   licence condition

## Cross-references

- [`architecture.md`](./architecture.md) — how these sources feed the bake
- [`math.md`](./math.md) — the provenance contract
- [`validation-gates.md`](./validation-gates.md) — how drift is caught
- [`legal.md`](./legal.md) — what each publisher permits
- [`local-development.md`](./local-development.md) — running the pipeline against live upstreams
