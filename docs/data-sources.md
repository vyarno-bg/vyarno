# Data sources

**Read this before touching `pipeline/sources/*`.** Every dataset the pipeline
reads has an entry below — a connector reading several has one per dataset — and
**this file is the source of truth for which external datasets we use.** Updating `pipeline/sources/*` without updating this
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
| **HICP index per code** — `prc_hicp_minr` (unit=I15) | VERIFIED | `index_by_year` and `latest_index`. Same cube, `sinceTimePeriod=2020-01`. The whole BG slice in one response. |
| **HICP basket weights** — `prc_hicp_iw` | VERIFIED | `weight_pct`. ECOICOP ver.2 item weights, dim `coicop18` — the same dimension the rate cube uses. Per-thousand ÷ 10. |
| **ЕЦБ MIR new-business rate** — `M.BG.B.A2C.A.R.A.2250.{BGN,EUR}.N` | VERIFIED | `mortgage.json → new_business.value_pct`. **The mortgage headline** — the rate excluding charges; `R` is AAR-or-NDER and which one BG reports is unsettled. |
| **ЕЦБ MIR new-business APRC** — `M.BG.B.A2C.A.C.A.2250.{BGN,EUR}.N` | VERIFIED | `new_business.aprc.value_pct` — the same loans' all-in cost with fees (ГПР). |
| **БНБ housing-loan rate** — `s_ir_loan_oa_hh_bg.xlsx` | VERIFIED | `outstanding_stock.value_pct`, with `book_volume_eur_m` beside it. Monthly back to 2007-01. |
| **БНБ lending limits** — dated table in `mortgage.py` | VERIFIED | `mortgage.json → lending_limits`. Borrower-based measures, not scraped. |
| **BG payroll parameters** — dated table in `payroll.py` | VERIFIED | `payroll.json`. Contribution rates BOTH sides, the flat tax, the insurance ceiling and the minimum wage. Legislative constants, not scraped. |
| **ТЗПБ by economic activity** — ДВ `showMaterialDV.jsp?idMat=…` | VERIFIED | `payroll.json → work_accident`. ЗБДОО's Приложение № 2/2А — the accident contribution the employer pays alone, 87 КИД-2025 divisions, published as a range per НСИ section. The only payroll figure that is a table rather than a reading. |
| **Individual earnings distribution** — `earn_ses_monthly` | VERIFIED | The percentile ladder's **shape** (D1 / median / mean / D9 gross, 4-yearly). |
| **Average gross wage by област** — НСИ `Labour_1.1.2.2_EUR_EN.xlsx` + `_EUR.xlsx` | VERIFIED | `region_salary.json`. All 28 области, both language editions, НСИ's published quarters from 2020-Q1. |
| **€/m² by city** — `imot.bg/sredni-ceni` | VERIFIED | `city_price.json`. 27 cities, each with its own district count and its own year window. |
| **Unemployment rate** — `une_rt_m` | VERIFIED | `unemployment.json → value_pct`. **Monthly**, seasonally adjusted, since 2020-01. |
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
| An offered-rate ("best offer") mortgage tier | WRONG | Rate-comparison sites and per-bank pages publish advertised promotional "from" rates: conditional on terms they do not state, editorially curated, with no methodology and no revision policy. Nothing in that class can carry the five properties in [`README.md`](./README.md) §"Who this is for", so the class is excluded rather than any particular site being judged. ЕЦБ MIR **APRC** answers the same question officially — and comes out higher. `test_mortgage.py` asserts the `indicative_offer` key is absent from the published JSON. |
| `prc_hpi_q` **as a €/m² level** | VERIFIED, unusable for a level | A transaction-based **index** and an annual rate, with no absolute €/m² at any geography. Both are published — `house_market.json` carries them — and neither can price a square metre, which is why the home block's level still comes from имот.bg. |
| A **transaction** price per m² for any Bulgarian city, from anyone | WRONG | Probed 2026-08-12. Every НСИ city series is an index or a percentage (`HPI_2.4` 2025=100, `HPI_2.6` y/y, `HSI_2.4.5` y/y), and their own лв./кв.м survey «Пазарни цени на жилища» ran «I тримесечие 1993 - II тримесечие 2014» and was discontinued. So `/market/` compares **change against change** — имот.bg's asking-price movement beside НСИ's transaction-price movement, each labelled as the different measurement it is — and never a € level against a € level. The page says so out loud (P11). |
| Average city rents — `prc_colc_rents` | WRONG | Probed 2026-08-12. `geo` dimension size **0** for Bulgaria: it is the EU-staff correction-coefficient survey and covers no Bulgarian city. |

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
  one. An *unfiltered* `geo + unit` query returns the complete BG slice in a few
  seconds, verified value-for-value against a per-code fan-out; fanning out over
  the divisions and groups we publish would be over a hundred requests per
  refresh. **`_require_codes` is what makes it safe:** every code
  we intend to publish must be present or the fetch raises, so a truncated or
  reshaped response fails loudly instead of publishing a partial basket.

### `prc_hicp_iw` — basket weights (ECOICOP ver.2)

`geo=BG&lastTimePeriod=1`. 5D cube `freq × coicop18 × statinfo × geo × time`,
one `statinfo` member (`IW`).

- Dim is **`coicop18`** — the same dimension `prc_hicp_minr` uses. That is what
  lets a weight and a rate for one code be about the same bucket.
- Values are **per-thousand** (CP01..CP13 ≈ 1000, TOTAL = 1000); the CLI divides
  by 10.
- **A weight is a share of what all households spend, not of what one of them
  does.** `prc_hicp_esms`, read 2026-08-13: «The main data source for the HFMCE
  used for the compilation of the weights are National Accounts data (from y-2 or
  y-1) further complemented with data from the Household Budget Survey», where
  HFMCE is «household final monetary consumption expenditure» for the country.
  The aggregate is spending-weighted, so a household spending twice as much
  moves a weight twice as far — «каква част от парите на средния човек» describes
  a survey nobody ran, and the difference between that and the reader's own
  answer is the calculator's whole subject. Note also that HFMCE «is adjusted to
  exclude … imputed rentals for housing», so CP04 is what people pay out and not
  what an owner-occupier would notionally pay themselves.
- **Who makes the Bulgarian index, in one sentence, and every surface has to
  describe the chain the same way.** `prc_hicp_esms` §3.1, read **2026-08-13**:
  «National HICPs are produced by National Statistical Institutes (NSIs), while
  European aggregates (EU, EA and EEA) are produced by Eurostat.» Eurostat's own
  part is the method and the audit of it, not the arithmetic: §6.1 names
  Regulation (EU) 2016/792 as «the legal basis for establishing a harmonised
  methodology for the compilation of the HICP», and §11.1 has «Eurostat is
  checking that the statistical practices used to compile the national HICP are
  compliant with the HICP methodological requirements». So НСИ collect the
  Bulgarian prices AND build the Bulgarian index; Eurostat set the rules, check
  they were followed, aggregate Europe and disseminate. Copy saying Eurostat
  «сглобява» the Bulgarian index credits them with НСИ's work and is the loose
  half of a chain the rest of the site describes correctly — `verify_copy.mjs`
  §"no surface says Eurostat build Bulgaria's index" bans the construction in
  both languages, after a rule asserting only the collecting half let it stand
  on two pages at once.
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

- Not every BG group carries a non-zero weight, and the ones that do not have no
  published rate either.
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

**That slice is narrower than "what people earn in Bulgaria", and the caveat has
to name all of it.** `earn_ses_main_esms` §3.5–3.6, read 2026-08-13: the survey
«provides information on employees in enterprises with **10 or more employees**»
and «The statistics refer to enterprises with at least 10 employees operating in
economic activities defined by **NACE Rev. 2 sections B to S excluding O**». So
three cuts sit between this ladder and the country: full-time only (ours, and
the reason is above), firms of ten or more, and no public administration,
defence or compulsory social security — plus agriculture, which is section A and
outside B–S. `COPY.pctCaveat` names the three that are the survey's; a reader who
works for a five-person firm is being ranked against a distribution they are not
in, and the level the shape is re-levelled onto (НСИ's all-activities average)
does not have the same coverage either.

`indic_se` carries the four points we use — `D1_E_EUR`, `MED_E_EUR`,
`MEAN_E_EUR`, `D9_E_EUR`, in EUR, gross per month. This is the correct unit —
*individual employee gross earnings* — but SES is **4-yearly** (BG's waves: 2002,
2006, 2010, 2014, 2018, 2022; next 2026, disseminated 2028), so it is stale in
level and used only for the distribution shape.

**The cadence is legislated, and the legal basis changed on 2026-01-01.**
Regulation (EU) 2025/941 on EU labour market statistics on businesses repealed
Council Reg (EC) 530/1999 with effect from that date, and carried the survey over
unchanged in the respects that matter here: its Annex sets Structure of Earnings
at periodicity **"Every 4 years"**, reference period "Calendar year and a
representative month in that year", transmission deadline **T+16 months**, and
**first reference period 2026**. So 2026 is a named requirement rather than an
extrapolation from the 2018→2022 gap, and the wave lands in 2028 (transmission
due April 2028, dissemination after).
`fetch_ses_earnings_bg` raises if any of the four indicators is missing.

### `une_rt_m` — unemployment, monthly

`geo=BG&sinceTimePeriod=2020-01`, no further filters — the BG slice is small.
The transform pins **`s_adj=SA` × `sex=T` × `age=TOTAL` × `unit=PC_ACT`** and
**raises** if that cell is absent.

**Why monthly and not `une_rt_a`.** The annual cube publishes one figure a year,
so mid-year its freshest reading is an average of the year before last — over a
year stale, and far enough from the monthly series to change what the page
claims. On a page whose promise is that the number reflects now, an annual
average is the wrong instrument, and it is not what Eurostat's own releases or
the Bulgarian press quote.

**Each pinned dimension has a neighbour that is a different statistic, not a
coarser version of the same one — hence no fallback branch:**

| Dim | Values | Why this one |
|---|---|---|
| `s_adj` | `SA` · `NSA` · `TC` | **`SA`** is Eurostat's headline. `NSA` swings with the season, so a month-on-month read of it measures the calendar; `TC` is a smoothed trend, not an observation. |
| `age` | `TOTAL` · `Y_LT25` · `Y25-74` | **`TOTAL` here IS 15-74**, and that is the metadata's word rather than the label's: the cube renders `TOTAL` as «Total» and nothing else. `une_rt_m_esms` §3.4, read **2026-08-13**: «For the unemployment rate, only persons from 15 to 74 years of age are used.» There is no `Y15-74` code in this cube — that spelling belongs to `une_rt_a`, and a transform ported across without checking filters to nothing. |
| `unit` | `PC_ACT` · `THS_PER` | **`PC_ACT`** is the percentage of the labour force. `THS_PER` is thousands of people. |

**«Unemployed» is the ILO test, not «has no job», and that is the claim a
reader is most likely to get wrong about this figure.** Same page, §3.4:

> Unemployed persons are all persons 15 to 74 years of age who were not employed
> during the reference week, had actively sought work during the past four weeks
> and were ready to begin working immediately or within two weeks. … Employed
> persons are all persons who worked at least one hour for pay or profit during
> the reference week or were temporarily absent from such work.

Both ends of that are surprising. Somebody who stopped looking is in neither the
numerator nor the denominator, so discouragement LOWERS the rate; and one paid
hour in the week is employment. §3.6 draws the population the same way EU-SILC
does — «The EU LFS results cover the total population usually residing in
Member States, except for persons living in collective or institutional
households.» The app's own surfaces say «безработица · 15-74 г.» and
«безработица, сезонно изгладена» and claim nothing beyond the pins, which is why
this read moved no copy; `unemployment.json`'s `notes` carries the definition,
because that field's job is to say what the upstream measures.

**Never fall back to `PC_POP`.** It is a percentage of the *whole population*,
including everyone outside the labour force — a materially lower number wearing
the same label, which is what makes it a tempting substitute when a filter
returns nothing. `une_rt_m` does not carry it at all, so a fallback that
reaches for it fails the fetch rather than mislabelling one.

---

### The property cubes — `prc_hpi_hsnq`, `prc_hpi_hsvq`, `prc_hpi_q`

Three quarterly cubes fed by НСИ, describing the same market from three angles:
how many dwellings households bought, what they paid in total, and how the price
per dwelling moved. `house_market.json` carries all three.

**What is in them is narrower than "House sales" suggests, and the page's
wording depends on it.** The scope read below is what the copy on `/market/`
rests on, and it is quoted rather than summarised because none of it is in the
machine-readable response — see §"Why there is no gate on any of this" at the
end of this section.

Eurostat, [`prc_hpi_inx_esms`](https://ec.europa.eu/eurostat/cache/metadata/en/prc_hpi_inx_esms.htm)
§3.4–3.6, read **2026-08-13**:

> The number and value of house sales cover dwellings transacted at national
> level where the purchaser is a household. Transactions between households are
> included. Transfers in dwellings due to donations and inheritances are
> excluded.
>
> The house sales value reflects the prices paid by household buyers and include
> both the price of land and the price of the structure of the dwelling. The
> prices for new dwellings include VAT. Other costs related to the acquisition
> of the dwelling (e.g. notary fees, registration fees, real estate agency
> commission, bank fees) are excluded.
>
> The target universe is all transacted dwellings purchased **at market prices**
> by households regardless of which institutional sector they were bought from
> and of the purchase purpose.

НСИ's own ППЖ metadata (`nsi.bg/bg/content/19699`, which now redirects to
`nsi.bg/metadata/pokazateli-za-prodajbite-na-jilishta-ppj-364`), read
**2026-08-13**, on how the two series are compiled:

> стойност на продажбите – измерена като общата сума на стойността на всички
> жилищни продажби в рамките на тримесечието; брой сключени сделки - измерва се
> чрез броя на всички жилищни продажби в рамките на тримесечието.

and on what is removed before either is counted:

> Изключени са следните записи: - сделки на държавата и общините; - „непазарни”
> сделки, като наследства и дарения, социални схеми, продажби от съдия-изпълнител
> и др.; - сделки с нежилищни имоти; - продажби от физически лица (домакинства)
> към други сектори.

**"At the price actually paid" is wider than either publisher, and that is the
correction this read produced.** The test is a *market* price: a discounted sale
between relatives has a price actually paid and is excluded, as are social
schemes and court-executor sales. The page therefore says «на пазарна цена» and
names the four exclusions rather than describing the count with the value
series' price concept. `house_market.json`'s own `notes` and `disclaimer` said
«at the price actually paid» for a round after the page stopped, which is the
drift §"Why there is no gate on any of this" now has a second half about.

**Which non-market cases, in Eurostat's own words**, because "non-market" reads
like it means gifts and stops there. `prc_hpi_inx_esms` §3.4, read
**2026-08-13**:

> The HPI is based on market prices of dwellings. Non-marketed dwelling prices
> are ruled out from the scope of this indicator. Examples of the later include
> **self-build dwellings, dwellings purchased by sitting tenants at discount
> prices, or dwellings transacted between family members.**

That is what carries the self-build exclusion, which until this read was
asserted here with nothing behind it. §3.1 also settles a claim the payload was
making more narrowly than the publisher: «The land component of the dwelling is
included» — the whole land component, not only the plot under a house, which is
the reading a flat has no room for.

**Three things this read could not settle**, and none of them may be written up
as though it had been:

- **One deed or one dwelling.** Eurostat's unit is «Number of transacted
  dwellings» and BG's own national metadata calls the same series «number of
  transactions in dwellings», while НСИ describe the compilation as «броя на
  всички жилищни продажби» over transactions that may carry more than one
  property («вида на сделките … в зависимост от предназначението на имотите,
  включени във всяка сделка»). Nothing published says which a two-flat deed
  counts as. It does not move `avg_deal_eur` — numerator and denominator are over
  the same set either way — but it is the reason no sentence here promises that
  the count and the number of homes that changed hands are the same integer.
- **Whether НСИ's price-band trimming reaches the sales series.** Their accuracy
  section says «НСИ полага усилия да намали … като … изключвайки от изчисленията
  транзакции под и над лимитите», stated about the index. Whether the same
  exclusion applies to the ППЖ count and value is not said.
- **Who «сделки на държавата и общините» excludes.** Eurostat scope the universe
  «regardless of which institutional sector they were bought from», so a
  household buying a municipal flat is inside theirs; НСИ list state and
  municipal transactions among the removed records without saying on which side
  of the deal. The previous edition of this file stated the exclusion flatly —
  it is one reading of an ambiguous line, not something a publisher wrote.

That scope is why the property register may never be quoted beside these — and
the two are the **same source read differently**, which is what makes the
comparison tempting: НСИ's national metadata for the index says «The HPI uses
the real transaction prices registered in Property Register of Registry Agency»
(`prc_hpi_inx_esmshpi_bg`, read 2026-08-13). The register's own «Продажби»
column counts every sale deed — land, agricultural land, garages, shops,
offices — and runs to roughly twice Eurostat's dwelling count for the same
quarter.

Four traps, all probed:

- **`DW_EXST`, not `DW_EXIST`.** A misspelled purchase code filters the cube to
  nothing and Eurostat answers 200 with an empty `value` map — the query fails
  *successfully*. `_require_periods` is what turns that into an error.
- **The two sales cubes are published over different windows**, the value series
  reaching several years further back than the count series. An unfiltered count
  fetch returns a cube whose early cells are simply absent, and a transform
  reading an absent cell as zero publishes a quarter in which Bulgaria sold no
  dwellings. The transform pairs the two on the quarters they **share**.
- **No `sinceTimePeriod` on any of them, deliberately.** A window pinned in code
  is a date somebody has to maintain against an upstream nobody controls; asking
  for everything costs one small response and lets the series grow by itself,
  backwards on a backfill as well as forwards.
- **`EUR` and `NAC` return identical figures** for every quarter of the value
  series — Eurostat restated the whole national-currency series when Bulgaria
  adopted the euro. `EUR` is pinned anyway: `NAC` means "whatever this country's
  currency is", so its meaning is defined outside the cube, and the equality is
  a fact about a restatement policy rather than a property of the unit.

**The rate is read, never computed from the index.** НСИ rebased to 2025=100
from the start of 2026 under Regulation (EU) 2025/1182 and warn in the workbook
footnotes that rates recomputed across the two bases can differ by rounding. So
`annual_rate_pct` is Eurostat's `RCH_A`, which is also the figure the
cross-publisher reconciliation compares against НСИ's `HPI_1.3`, for total / new
/ existing alike.

**The index covers every household purchase, not owner-occupation.** BG's own
national metadata, read 2026-08-13: «All transactions are included (both cash
and mortgage) acquired by households regardless of its final use, so dwellings
bought by households for uses other than owner-occupancy are included (for
investment, e.g. to rent it out). Price include land value. Luxury properties
are not excluded from the HPI/HSI.» So «цените на сделките» is the right label
and any wording that narrows it to homes people live in is not.

#### Why there is no gate on any of this

The obvious guard is a connector-level assertion that a cube's own metadata
still says what we relied on, so a definition change upstream fails a refresh
instead of quietly changing what the page means. **It cannot be built where the
risk is, and the cubes say so themselves.** Probed 2026-08-13, the two series
the average deal divides carry these labels and nothing else:

| Cube | Dataset label | Unit label |
|---|---|---|
| `prc_hpi_hsnq` | House sales - number and index, quarterly data | `NR` → **Number** |
| `prc_hpi_hsvq` | House sales - value and index, quarterly data | `EUR` → **Euro** |

Every claim this section spent a page establishing — the purchaser is a
household, the price is a market price, VAT is in and the notary is out, the two
series cover one population — is absent from that. «Number» and «Euro» are
compatible with any two cubes in the catalogue. A guard over the machine-readable
metadata would pass unchanged through the exact failure this section exists to
catch, and would put a green check beside "definitions verified".

A hash over the ESMS page fails the other way: Eurostat revise that prose without
versioning it, so the guard goes red on a typo fix and the next person raises the
tolerance until it is off.

Two of the Eurostat cubes **do** carry their meaning in their own labels —
`ilc_lvho02` is «Distribution of **population** by tenure status» and
`cens_21dwob_r3`'s `DW_NOC` is «Unoccupied conventional dwellings». Gating those
two is possible and is still not worth doing: they are the ones where the wrong
reading is already refused by a pinned dimension, and a guard whose coverage is
the easy fifth certifies the whole while watching none of the part that moved.

**So this stays a dated read, the pattern [`legal.md`](./legal.md) uses for
licence terms**: the publisher's sentence, quoted verbatim, with the URL and the
date it was read, in this file. Re-read it when a connector is retargeted, when
a payload's shape changes, or when a claim on a page is being written from a
cube's title — which is how the wrong ones got written. The cost of the pattern
is that nothing fails when an upstream re-scopes a series between reads; that is
the cost, it is stated here rather than papered over, and no cheaper guard
removes it.

### The structure cubes — `ilc_lvho02`, `cens_21dwob_r3`, `ilc_lvho07a`

Three cubes on two clocks, which is why they are a second payload rather than
more keys on the first: a freshness row cannot honestly date an annual EU-SILC
survey and a census snapshot at once.

**`tipsho60`, the price-to-income ratio, was a fourth and is not read any more.**
It was fetched, gated on its unit and drawn on `/market/` with a rule at 100, and
every reading of it needed three qualifications first: the series is published
once a year and stopped two years behind everything else on the page, its
denominator is an income per head over a population falling throughout the
period, and the 100 it is indexed against is recomputed with each edition, so
every earlier point moves without its year changing. A figure that cannot be used
until all three are said is one a reader takes nothing from. Reinstating it means
the connector, the gate and a section that answers the question it raises.

Every one of them crosses several dimensions and every one has a wrong `TOTAL`
that returns 200:

- **tenure** is a seven-way split crossed with household composition and poverty
  status. `hhcomp=TOTAL` and `rskpovth=TOTAL` are the whole population; leaving
  either unpinned returns the whole cross-product and the transform would be
  guessing which cell is the country.
- **the census** splits by occupancy **and** building type, so `building=TOTAL`
  is what "all dwellings" means.
- **overburden** is crossed with age, sex and poverty status. The below-poverty
  slice runs several times higher than the headline and is not the figure
  anybody quotes.

**What each of the four measures**, quoted, because three of the four sentences
on `/market/` that describe them were written from a cube title and two of those
were wrong. All read **2026-08-13**.

- **Both EU-SILC cubes are a share of the population in PRIVATE households, not
  of everybody in the country.**
  [`ilc_sieusilc`](https://ec.europa.eu/eurostat/cache/metadata/en/ilc_sieusilc.htm)
  §3.6: «The reference population of EU-SILC is private households and all
  persons composing these households having their usual residence in the
  national territory … **Persons living in collective households and in
  institutions are generally excluded from the target population.**» That is the
  same boundary the census draws in the other direction — its «колективни
  жилища» are what EU-SILC leaves out — so the two sections have to say it in the
  same words or the page contradicts itself between them.
- **tenure** exhausts its base: `ilc_lvho02`'s own dataset label is
  «Distribution of **population** by tenure status, type of household and income
  group» and its `tenure` dimension carries `OWN` (with `OWN_L` / `OWN_NL`
  beneath it) and `RENT` (with `RENT_MKT` / `RENT_FR`) and no third status. So
  «собствениците и наемателите правят сто» is the cube's structure and not an
  arithmetic coincidence of one vintage.
- **overburden's numerator is not a mortgage payment.** Eurostat's glossary
  entry for the rate: «the percentage of the population living in households
  where the total housing costs ('net' of housing allowances) represent more
  than 40 % of **disposable** income ('net' of housing allowances) … For
  homeowners, the housing cost calculation includes **mortgage interest payments
  net of any tax relief**». The Bulgarian «вноска» means the whole instalment,
  so copy using it overstates the numerator for exactly the households the
  indicator is about. It is «лихвата, не главницата», in as many words.
- **the census's «unoccupied» is a usual-residence test.**
  [`cens_21_esms`](https://ec.europa.eu/eurostat/cache/metadata/en/cens_21_esms.htm):
  «'Unoccupied conventional dwellings' are conventional dwellings which are not
  the usual residence of any person at the time of the census. Dwellings reserved
  for seasonal or secondary use, vacant dwellings, as well as conventional
  dwellings **with persons present but not included in the census** are
  classified under the category 'Unoccupied conventional dwellings'.» A dwelling
  with somebody asleep in it can be unoccupied, so census-night presence is not
  merely a loose paraphrase of the test — it is the case the regulation names to
  rule out.

## Salary distribution — `salary_dist.json`

**No single official source publishes a fresh, machine-readable, full salary
distribution for BG, and nothing at all publishes one below the national
level.** Everything was probed:

| Dataset | Cadence | Why it cannot rank a salary |
|---|---|---|
| `earn_ses_monthly` / `_hourly` / `_annual` | 4-yearly | The only individual-earnings *distribution*. **Used, for shape.** |
| `earn_nt_net` / `earn_nt_netft` | annual | A tax model at fixed reference cases (fractions of the mean), not percentiles. |
| `ilc_di01`, `ilc_di03` | annual | *Household* disposable income — the wrong unit; mixing it with a one-person salary question pushes almost every wage into the top few percent. |
| `ilc_di11` (S80/S20) | annual | A single inequality ratio. |
| НОИ insured income | monthly | Capped at the maximum insurable income, barely above the Sofia average, so the whole upper half piles at the ceiling. |
| НСИ quarterly wages | quarterly | *Average* only, no distribution — by област and by activity alike. It is our level anchor, applied in the browser — see below. |

So the ladder needs two official sources: the **shape** from Eurostat SES 2022,
the **level** from НСИ's live all-activities average gross wage.

**Both halves are the COUNTRY's, and that is the constraint rather than a
default.** The shape is national: SES publishes D1, the median and D9 for
Bulgaria and nothing below that, at any vintage, from any publisher. So the
level it is re-levelled onto has to be national too, or a national spread is
being multiplied by one област's mean and the result called that област's
ranking. Anchored on София's average instead of the country's, a mid-range wage
lands tens of percentiles from where the country's own ladder puts it — every
rung stays plausible, the ladder stays monotonic, and nothing on
screen shows the difference. `view/country.js#nationalQuarter` is where the level is
selected, out of `sector_salary.json`'s all-activities «Общо» row, and
`the ladder is anchored on the country's average and never on one област's` is
what holds it.

**The two halves are two populations, and how much that costs cannot be worked
out from anything published.** The shape is SES — full-time employees, firms of
ten or more, NACE B–S excluding O. The level is НСИ's all-activities average of
employees under a labour contract or in the civil service: every firm size,
public administration and agriculture included. Three things are worth being
precise about, because "the populations differ" invites either a shrug or an
invented correction and neither is right.

1. **The level mismatch costs nothing, by construction.** `f = НСИ_mean /
   ses_mean` sets the composed ladder's mean to НСИ's, so whatever the two
   populations' mean pay differs by is exactly what `f` absorbs. What survives
   the re-level is the SHAPE, and only the shape can be wrong.
2. **A coverage change of this size moves the level far more than the shape —
   on the one such change SES publishes for BG.** Adding part-timers to the same
   cube (`worktime=TOTAL` against `FT`) moves the mean by about −5% and D9/D1 by
   about +0.1%. That is the encouraging direction and it is one data point.
3. **It does not generalise, and the same cube says why.** At the 2018 vintage —
   the last one where BG carries activity groupings at all — D9/D1 for `P-S`
   (education, health, arts) is roughly half of `G-N`'s (services of the business
   economy), with the whole economy between them. Composition can move
   dispersion by a factor of two. Section O is a public-sector pay structure and
   would most likely pull towards the `P-S` end, narrowing the true spread;
   firms under ten pay less and would widen the bottom. **The two omissions push
   opposite ways, so not even the SIGN is available.**

And it cannot be closed by probing harder. `earn_ses_monthly` has **no firm-size
dimension** for BG at any vintage — the dimensions are `freq × nace_r2 × isco08
× worktime × age × sex × indic_se × geo × time` and that is all — and neither
section A nor section O is a category in `nace_r2` at any vintage, the five
BG categories being `B-S_X_O`, `B-N`, `B-F`, `G-N`, `P-S`. So the distribution
of the population the level is drawn from is not measured by anyone.

That makes it P11: **uncomputed, not concealed.** `COPY.pctCaveat` names the
mismatch and says the size of it cannot be worked out, in both languages.
Multiplying the ladder by a dispersion factor nobody publishes would replace a
disclosed unknown with an invented number, which is the failure this repository
is built against — `docs/principles.md` and §"A plausible number is not a
verified number" above.

**The reader's own област does not move the ladder**, and the copy says so —
`COPY.pctCaveat` in both languages, and `verify_copy.mjs` requires it. That is
P11: a figure nobody publishes is uncomputed rather than concealed.

**«Общо» is not a sector**, which is why `view/payroll.js#sectorOptions` drops it from
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
steps 3–4 run in the reader's tab (`mirror.js#composeLadder`, over the **national**
level `view/country.js#nationalQuarter` selects out of `sector_salary.json` —
not an област's, because the ladder Eurostat publishes is the country's).

1. Fill the intermediate deciles by piecewise-lognormal interpolation in the
   standard-normal quantile z, matching the D1/median/D9 anchors exactly.
2. Extrapolate the P1/P99 tails along the nearest segment's log-slope. Publish
   at SES's level, to **four decimal places** — see below.
3. In the browser: read НСИ's latest published quarter for all activities. The
   March month alone spikes on annual bonuses, which is why the level is a
   quarter and not a month.
4. Multiply every rung by `f = НСИ_national_mean / ses_mean` and floor **every**
   rung at the statutory minimum wage, after scaling.

**Why the floor is on every rung and not only on P1.** A scalar re-level moves
the whole shape by however much the MEAN moved, and Bulgaria's minimum wage has
moved faster than the mean since SES's vintage. So the bottom of the scaled shape
lands under a wage it is not lawful to pay a full-time employee, and a
rung there is an artefact of the model rather than a wage anybody is on. The
floor leaves the ladder weakly rising; `mirror.js#percentile` is safe on that,
because a flat pair at the bottom sits behind its `salary <= ladder[0]` branch
and the interpolation never divides by a zero span.

**Why the split is lossless, and why four decimals.** Re-levelling multiplies
D1, median and D9 by the same `f`, which adds `ln(f)` to every point of the
log-linear model and leaves both dispersions untouched — so `rung(f) === f ×
rung(1)`, exactly. Nothing is approximated by moving the multiplication. The
precision is the one real cost: at one decimal on both sides the double-round
moves several of the middle rungs, so the published rungs carry four and the
browser rounds once. `test_relevelling_is_a_scalar_multiply` holds the property
and `test_rungs_carry_four_decimals_so_the_browser_rounds_once` holds the
precision.

**Output:** `shape.ladder_ses` at percentile cuts 1,10,20,…,90,99, `ses_mean`,
`sigma_bottom` and `sigma_top`. The composed rungs exist only in the reader's
tab; nothing in the payload carries them.

**Gross → net happens in the SPA too.** The salary input is net take-home, so
`mirror.js#buildLadder` converts each composed rung through `bgNetSalary` — one
payroll implementation, not two. The comparison is net vs net.

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

Sheet `LOAN_OA_HH`, monthly **2007-01 → present**, one row per month. **The
cell:** Жилищни кредити (housing) × в евро (EUR) × maturity **total** — the rate
into `outstanding_stock.value_pct`, the book beside it into `book_volume_eur_m`.

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

**«Жилищни кредити» is a purpose, and it is wider than buying a home.** БНБ's
методологически бележки, read **2026-08-13**:

> Жилищни кредити – кредити, предоставени на домакинствата с цел инвестиране в
> жилища за собствено ползване или наем, включително за строителство и за
> подобрения на жилища.

So building a house and renovating one are inside the column, and so is
buy-to-let. What is **not** inside it is the loan a reader might expect to be:
a consumer loan secured on a home goes to the consumption category instead —
«Кредити за потребление … Тук се включват и кредитите за потребление, отпуснати
срещу ипотека.» The distinction is by what the money is for, never by what
secures it.

**And the stock is not every household still repaying something.** The same
notes exclude, from both the balances and the rates over them, «кредитите, които
са необслужвани или преструктурирани с мерки, които пряко или косвено водят до
снижаване на лихвения процент под пазарното ниво за съответния пазарен сегмент».
A defaulted mortgage and one restructured below market are outside the average,
which is the direction that matters: the published rate is over the performing
book, so it is if anything an understatement of what the country is paying.

**Cross-check against ЕЦБ MIR:** this cell and
`M.BG.B.A22.A.R.A.2250.EUR.O` are the same data reported twice — БНБ is the
institution that reports MIR to the ЕЦБ — so they agree to their own rounding.
`mortgage.py#cross_check_outstanding` enforces that as a gate at 0.30 pp, and the
observed delta rides in `cross_check.delta_pp`.

**Methodology change in the payload:** Bulgaria adopted the euro on 2026-01-01.
Per the БНБ methodological note (`st_m_instr_irs_new_2026_bg.pdf`, 19 Feb 2026),
OLP and LEONIA Plus were retired, the BGN column dropped, and pre-2026 EUR
figures **reconstructed** by БНБ from BGN+EUR aggregates — so EUR values before
2026-01 are a reconstruction, not a contemporaneous observation.
`outstanding_stock.methodology_change` cites the PDF verbatim.

> **Do not use `s_ir_loan_oa_rm_hh_bg.xlsx`.** Its title is *"…loans other than
> overdraft for the household sector by original maturity, residual maturity and
> period until the next interest-rate change"*: every purpose blended, no
> housing breakdown at all. Two tells — its volume column covers all household
> lending and so runs far above the housing book, and the rate column beside it
> reads a level no mortgage has carried.

---

## ЕЦБ — `sources/ecb.py`

A separate module because the ЕЦБ's SDMX API uses position-based series keys and
its own response shape.

**Filter in the URL PATH, never the query string.**

```
RIGHT  GET …/service/data/MIR/M.BG.B.A2C.A.R.A.2250.EUR.N?format=jsondata&startPeriod=2020-01
     → 200, kilobytes, exactly 1 series

WRONG  GET …/service/data/MIR?REF_AREA=BG&BS_ITEM=A22&IR_BUS_COV=N&…
     → 200, megabytes, thousands of series — the ЕЦБ SILENTLY IGNORES unknown
       query parameters, so this is the whole MIR flow, unfiltered
```

The series key has 10 dimensions, all mandatory — a wildcard slot reopens the
multi-series hole:

```
FREQ . REF_AREA . BS_REP_SECTOR . BS_ITEM . MATURITY_NOT_IRATE
     . DATA_TYPE_MIR . AMOUNT_CAT . BS_COUNT_SECTOR . CURRENCY_TRANS . IR_BUS_COV
```

| Role | Series key |
|---|---|
| **Headline** — rate excluding charges, new business | `M.BG.B.A2C.A.R.A.2250.EUR.N` |
| All-in cost — APRC (ГПР), fees included | `M.BG.B.A2C.A.C.A.2250.EUR.N` |
| New-business volume (splice evidence) | `M.BG.B.A2C.A.B.A.2250.EUR.N` |
| Outstanding stock (cross-check gate only) | `M.BG.B.A22.A.R.A.2250.EUR.O` |
| Pre-2026 legs of the three above | same keys with `BGN` |

- **`A2C`, not `A22`, for new business.** `A22` exists for BG **outstanding
  only**; `A2C` is new business — monthly and current. The two codes
  are not "outstanding" and "new business", though: that split is the last
  dimension, `IR_BUS_COV` (`O` / `N`). What separates the codes is the
  instrument set, and the ЕЦБ's `CL_BS_ITEM`, read **2026-08-13**, says so —
  `A22` is «Lending for house purchase», `A2C` is «Lending for house purchase
  **excluding revolving loans and overdrafts, convenience and extended credit
  card debt**». So the new-business figure is over term lending, and a credit
  card drawn to furnish the flat is not in it.
- **`DATA_TYPE_MIR`:** `C` = APRC (with charges), `B` = volume, and `R` is **two
  concepts under one code**. The ЕЦБ's own `CL_DATA_TYPE_MIR`, read
  **2026-08-13**, names it «Annualised agreed rate (AAR) / Narrowly defined
  effective rate (NDER)», and the Manual §4.2.2 says why: «Instead of the
  annualised agreed rate, NCBs may require their reporting agents to implement
  the narrowly defined effective rate (NDER) for all or some deposit or loan
  instruments referring to new business and outstanding amounts.» **Which of the
  two Bulgaria reports is unsettled.** БНБ's own методологически бележки say
  only «Лихвените проценти са ефективни годишни проценти», and §4.1 of the same
  Manual warns that «effective interest rate» has «a range of different meanings
  depending on the Member State» and that both AAR and NDER are ways of
  annualising. Both exclude charges, so nothing about which formula the rate
  feeds turns on it; what turns on it is whether a payload may print «AAR», and
  it may not. What would settle it: БНБ naming the concept in Наредба № 17 or in
  the Указание it cites for лихвена статистика, or the ЕЦБ publishing the
  per-country choice. Swapping `R` and `C` is a live risk either way, so a gate
  asserts APRC ≥ R − 0.05 pp, the tolerance being the two series' independent
  rounding (`mortgage.py#APRC_BELOW_AAR_TOLERANCE_PP`).
- **`BS_COUNT_SECTOR=2250`** is «Households and non-profit institutions serving
  households (S.14 and S.15)» in `CL_BS_COUNT_SECTOR`, read **2026-08-13** —
  households **and NPISH**, which БНБ spell out as «синдикати, политически
  партии, фондации, сдружения, църкви и религиозни общества, читалища, културни
  и спортни клубове». That is a wider counterparty than «домакинства» means
  anywhere else in this app, so both `rate_basis` strings in `mortgage.json` name
  the pair. `2240` is non-financial corporations.

**«New business» is not «new lending», and this is the claim the whole mortgage
headline rests on.** БНБ's методологически бележки for лихвена статистика
(`s_irs_meth_historical_data_bg.pdf`), read **2026-08-13**:

> Нов бизнес – всяко ново споразумение между клиента и отчетната единица. Нови
> споразумения са договори, които за първи път определят лихвения процент,
> сроковете и условията по депозита, репо-сделката или кредита. Ново
> споразумение е и всяко предоговаряне на лихвения процент, сроковете и/или
> други условия по вече съществуващ договор, когато възможността за такова
> предоговаряне не е заложена в него, както и предоговаряне на срок с активното
> участие на клиента.

and, on the volumes:

> Обемът по нов бизнес по предоговорени кредити и кредити за рефинансиране се
> включва в общия обем на новия бизнес по кредити, различни от овърдрафт.

The ЕЦБ Manual §5.4.2 gives the purpose of the separate renegotiated-amounts
series: «to have a measure of "pure new loans" in the sense of gross "fresh
money" arriving on the credit market, distinguishing these from renegotiated
loans where, by definition, no new money is arriving on the credit market». So
«лихвата по нови жилищни кредити» describes a population that includes a
household which bought nothing and merely re-cut the loan it already had, and
every surface naming the figure has to leave room for them.

**Two claims that came out TRUE, and neither was safe to assume**, because the
Regulation permits the other answer in both cases:

- **Every bank, not a sample.** MIR allows an NCB to sample its reporting
  population and gross the result up (Manual §12.2–12.5). БНБ do not: «Отчетни
  единици са всички банки в Република България, в т.ч. клоновете на чуждестранни
  банки.» So «across every bank in Bulgaria» is exact rather than approximate.
- **Volume-weighted, and by which volumes.** «Лихвените проценти са ефективни
  годишни проценти. Те са среднопретеглени съответно с обемите по нов бизнес
  през отчетния период или със салдата към края на отчетния период.» New
  business is weighted by the month's new-business volumes and the stock by
  end-of-month balances — two different weights, which is part of why the two
  tiers may never be averaged together.

**What the APRC covers, and the two things a Bulgarian buyer pays that it does
not.** ЕЦБ Manual §4.4.1, read **2026-08-13**:

> On the costs that have to be included, the Directives mention expressly the
> following: interest, commissions, taxes and any other kind of fees which the
> consumer is required to pay in connection with the credit agreement and which
> are known to the creditor, **except for notarial costs**; costs in respect of
> ancillary services relating to the credit agreement, in particular insurance
> premiums, are also included if, in addition, the conclusion of a service
> contract is compulsory in order to obtain the credit or to obtain it on the
> terms and conditions marketed; the cost of valuation of property where such
> valuation is necessary to obtain the credit, but **excluding registration fees
> for the transfer of ownership of the immovable property**.

БНБ state the same test in one line — «всички такси, комисиони и други разходи за
сметка на клиента, извършването на които е условие за отпускането на кредита» —
and add that the ГПР «се изчислява само за кредити за потребление и за жилищни
кредити», which is why only these two instrument categories carry a `C` series
at all. So the ГПР is the total cost of the **credit** and not of the purchase,
and «с всички такси» is a promise it does not keep. §4.4.3 of the Manual also
notes that «the composition of the fees to be taken into account in the APRC may
differ across countries», so the Bulgarian set cannot be enumerated here from
anything either publisher has written — the boundary above is what can be
stated, and it is what [`math.md`](./math.md) §"The payment is the annuity and
nothing else" reasons from.
- **Two response-identity guards in `parse_mir_series`, both required:** a
  fully-specified key must return exactly one series, and the response's own
  dimension metadata must match the key we requested. Together they make a
  silently-ignored filter impossible to mistake for real data.

### The BGN → EUR splice at eurozone entry

Before 2026-01-01 home loans were written in BGN and the EUR series covered a
niche; after it, everything is EUR and the BGN series stops.
`new_business.monthly_volume` is what shows that: on either side of the boundary
one leg carries almost all the lending and the other almost none.

So the published series is **BGN through 2025-12 spliced with EUR from
2026-01** — the rate in the currency of the day. That the splice is continuous
across the boundary is the evidence it is the right one, so it is a test rather
than an observation: `EURO_SWITCH_PERIOD` in `sources/ecb.py` is the single knob
and `test_ecb.py` holds the spliced series gap-free and step-free.

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

**What имот.bg say the number is, and what they do not — unsettled, and the
reason it cannot be settled from here.** Every figure this connector publishes
rests on `raioniAvgPrice` being an average asking price per district, and имот.bg
publish no methodology for it: not what population of listings it averages, not
over what window, not whether a flat advertised by three agencies counts once or
three times, and not whether it is a mean or something else. The variable name
and the page's own «Средни цени» heading are all there is, and neither is a
method statement. `/sredni-ceni/prodazhbi-` versus `/sredni-ceni/naemi-` is a
sale-versus-rent split of a classifieds portal's own listings rather than of
concluded deals — имот.bg have no deed data — which is the evidence behind
«цени по обяви, не по сделки» and it is an inference from what имот.bg is, not a
sentence they wrote.

**This one cannot be re-read from a build environment at all**, which is a
finding rather than an excuse: `www.imot.bg` answers a datacenter IP with 403 on
every path including `/robots.txt` (re-probed **2026-08-13**, 4,543 bytes on
`/sredni-ceni`, `/robots.txt` and `/pcgi/imot.cgi` alike), and the fixtures under
`pipeline/tests/fixtures/` are **built rather than saved**, so the repository
deliberately holds no copy of their page to read a caption off. What would
settle it: one read of a `sredni-ceni` page from an ordinary Bulgarian
connection, looking for any statement of method, plus a look at
`/obshti-uslovia` for the same. Until then the copy may describe the figure's
CLASS — an asking price, imot.bg's own, not a transaction — and may not describe
a method, and `city_price.json`'s `notes` is careful to attribute only the
median and the since-baseline percentages to us.

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
| **District counts run from over a hundred down to single digits**, so no flat floor fits | a truncated parse published as a small city | a floor at 60% of that city's own count in `regions.py#imot_districts` |
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
not the same measurement as a median over thirteen: inside the thin years a
city's median moves year over year by multiples of anything a price series does.
Those are sampling artefacts wearing the clothes of price moves, and no gate
downstream would catch one — the file would be internally consistent.

**The unbroken-run clause does most of the work.** A city whose coverage
collapses for a year and recovers has not been measured the same way throughout,
so everything before the gap is disqualified — which is what drops a city's
earliest years without anyone choosing a cut-off for it.

**Which of the two thresholds actually decides is a fact about city size, and
it is worth knowing before either number is touched.** They cross at 15
districts (6 ÷ 0.40): below that the flat 6 binds and the share clause is slack,
above it the share is what decides. So a small city's year is admitted on 6
districts however small a share of its own total that is — which is the rule
working rather than a hole in it, because the flat floor is what makes a small
city's history publishable at all.

What it costs is that the largest year-over-year move left inside any published
window is a reading over a floor-sized sample, and
nothing on the card says so: `n_districts` travels on every historical row of
`city_price.json` and appears on no screen. It is inside that city's window, so
it is inside the «+X% от YEAR» the card prints. Whether it is a price move or a
composition change cannot be told from the payload, and tightening either
threshold to exclude it is not a decision to take from the file — it needs the
per-city-year district counts from a live probe, which this repository does not
carry.

Below **five** consecutive years the payload sets
`trend_publishable: false` and the SPA shows the €/m² without a «since YEAR»
sentence — the chart still carries every qualifying year, because the data is
not in doubt, there is simply not enough of it to call a trend.

### The sanity bounds, and why they do not widen

Drop any value outside `[100, 10000] €/m²`. The sub-100 values in the history
are **sentinels, not cheap flats** — single-digit €/m² readings, zeros among
them — so widening the band to `[10, 100_000]` would admit some of them and
reject others, which is an arbitrary line through a set of
values that are uniformly junk. `AGENTS.md` forbids it in terms.

The drop is not silent: every city-year publishes `n_dropped`, and
`_assert_drop_share` fails the run above **20%**. That threshold is measured
rather than chosen — inside the windows this connector publishes, a handful of
city-years drop anything at all, the worst of them sits well under the ceiling,
and no current-year page drops a row.

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
`view/region.js#cityCoverage` is the three-way answer the cards and the picker share,
and only its `nopage` state may be stated in имот.bg's name.

**`all_districts` is not published.** The per-district dict is read by nothing —
no component, no view function, no verify script — and across 27 cities it is
the largest thing in the payload, downloaded on every page
load. What goes with it is the only way to recompute a median from the file
itself; the median, mean, range and district count stay, which is what the page
cites.

**Where it is fetched from.** `www.imot.bg` answers datacenter IPs with a
**403**, so this is the one connector that needs an ordinary Bulgarian
connection. That is why `city-price` is refreshed by hand while the other eight
arms run anywhere, and why a 403 from this arm is an environment result rather
than a parser regression. A full sweep is a few hundred requests, a couple of
minutes at 200 ms spacing; имот.bg showed no throttling at all on a
hundred-request burst, so the spacing is politeness rather than a measured need.
**Never route it through a proxy** — `docs/legal.md`.

**Failure modes:** every city unreachable → exit 4 (the datacenter-IP case). One
city's page changed shape, served rentals, or came in under its floor → that
city is skipped with a WARNING and the others publish. The payload gate →
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
`{year}trimes` sheets — НСИ's own published quarterly averages, as published.

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
simply more accurate: the mean of their three rounded monthly cells does not
reproduce the quarter they publish, to the digit they print it at.

**Two traps in the sheet, both guarded.**

- **Q4 is published twice**, as `IV` and as `IV incl.annual bonuses`
  («IV вкл.годишни премии»), and the two diverge by several per cent because the
  second folds in the 13th salary. We take `IV`;
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
3. Sofia-city is the maximum, and by a wide margin over the next област.

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
computes over it afterwards: `view/region.js#regionQuarter` selects the headline rather
than deriving one, and it answers for the област asked for or for none —
never for a first row, a largest област or София.
`no НСИ payload carries a second publisher's figures` in
`verify_data_contracts.mjs` fails if a `value_eur` ever stops being a quarter
from the series beside it, and `test_no_figure_is_computed_only_selected` fails
if the connector starts averaging again — a change that would move no number a
reader could check, so nothing else would notice it.

### `Labour_1.1.2.1_EUR_EN.xlsx` + `_EUR.xlsx` — gross wage by economic activity

The sibling table, same directory and same terms: 19 NACE Rev 2 sections plus
`Total`, quarterly. Its own title, read 2026-08-13, is `AVERAGE GROSS MONTHLY
WAGES AND SALARIES OF THE EMPLOYEES UNDER LABOUR CONTRACT` — **employees under a
labour contract**, so the self-employed are outside every figure this workbook
feeds: the sector card, the ladder's national anchor and the years-of-pay card
on `/market/` alike. Both the sector coverage line and that card's disclosure
say so, and neither may be shortened to «средната заплата». **Both language editions are read** — `_EUR_EN.xlsx` carries
English section names, `_EUR.xlsx` (no language suffix) the Bulgarian ones, with
identical figures, taken as published.

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
bonus peak, and in the highest-paid sections it runs well clear of the quarter
beside it.

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
wages` (gate 8 in `validate.py`) fails the publish if a headline stops being the
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
broad КИД-2008 sections. `view/payroll.js#sectorOptions` leaves it out and
`view/payroll.js#sectorComparison` refuses it at the lookup, so one list's contents are
not the whole guarantee.

---

### The housing workbooks — `HPI_1.3`, `HPI_2.6`, `HSI_2.4.5`

Same host and directory as `Labour_1.1.2.x`, so the fetch plan, the TLS path and
the licence read are already understood. Three things differ.

**What each workbook's cells are**, from their own title rows, read 2026-08-13 —
because "index or rate" is the one thing about them that cannot be told from a
plausible-looking number:

| Workbook | Its own title | A cell is |
|---|---|---|
| `HPI_1.3` | «ИЦЖ, национално ниво - съответното тримесечие на предходната година = 100 (изменение спрямо съответното тримесечие на предходната година) (%)» | the y/y **change** in %, by dwelling type (`H.1.` общ, `H.1.1.` нови, `H.1.2.` съществуващи) |
| `HPI_2.6` | «ИЦЖ за шестте града в България с население над 120 000 жители — …» | the same change, per city, same three `H.1.*` rows |
| `HSI_2.4.5` | «ППЖ според броя на продажбите, за шестте града … — …» | the y/y change in the **number of sales**, per city, `N.1.*` rows, headed «Тип на закупените имоти» |

The header says «= 100» and the second line says «изменение», which read
together mean the change and not the index — illustratively, a cell holding 6.7
is a 6.7% change and not an index level of 106.7. Both readings are plausible
percentages, so nothing
downstream would catch the wrong one — `HOUSING_ROW_CODES` matches the code
column rather than the label, and the value is published as `value_pct`.

**«НСИ го изчислява, Евростат го разпространява» is the publisher's own account
of the chain**, not an inference from the two columns agreeing.
`prc_hpi_inx_esms` §3.1, read 2026-08-13: «The national HPIs are produced by
National Statistical Offices (NSIs) and the European aggregates by Eurostat, by
combining the national indices.»

**The filenames are discovered, never hardcoded.** `discover_housing_workbook`
walks `/statistical-data/{topic}` to its sub-pages and takes the `timeseries/`
link that names the workbook, raising if it is gone. The topics are 99
(national price index), 98 (by city) and 93 (sales by city). Guessing is
forbidden and would have failed on the first attempt: `HPI_1.3.xls` 404s where
`HPI_1.3.xlsx` serves.

**Four traps, all hit while probing, all silent:**

- **The year header carries footnote markers glued to the numeral.** The newest
  year arrives as `{year}3,5` or `{year} 3` rather than four digits. A
  `str(y).isdigit()` parse drops the newest quarter and reports the one before
  it as the latest — a plausible number for the wrong period, which is the worst
  shape a bug takes here. Matched with `^\s*(\d{4})`.
- **The quarter numerals carry them too** — `І6`, `І 7` — and mix alphabets:
  Cyrillic І for Q1/Q2, Latin I/V for Q3/Q4. The labour workbooks'
  `_roman_quarter` matches the numeral exactly and returns `None` for those, so
  reusing it as-is would skip the column without a word. `_housing_quarter` is
  the same map and the same translation with the marker stripped first.
- **A city label carries a footnote digit**: «Варна 4» is Варна with НСИ's
  marker. One of the six carries it today and any of them may tomorrow, so the
  label is matched after stripping rather than compared whole.
- **The workbook stores the float НСИ's own subtraction produced.** A cell
  printed as `-19.2` is held as `-19.200000000000003`. The published value is
  theirs at the precision they print it; carrying the artefact through would put
  a figure on the page that appears on no НСИ table.

**Every published value is a cell they published.** §2.1.1 forbids distributing
производни и сборни произведения, so `nsi_housing.json` carries no gap, no
ratio, no rank — and no level, which is the upstream rather than a choice: every
НСИ city series is an index or a percentage, and their own «Пазарни цени на
жилища» survey in лв./кв.м ran «I тримесечие 1993 - II тримесечие 2014» and was
discontinued.

**Their footnotes are worth reading and one of them shapes the code.** Footnote
3 on `HPI_2.4`, read 2026-08-12: under Regulation (EU) 2025/1182 the base year
moved to 2025 from the start of 2026, and «равнищата на изменение … изчислени от
динамичния ред при база 2015=100, биха могли да се различават от тези, изчислени
от динамичния ред при база 2025=100». That is why the rate on `/market/` is the
one each publisher **prints** rather than one computed from an index.

## Dated legislative tables (not scraped)

### BG payroll — `payroll.py#BG_PAYROLL_TABLE` → `payroll.json`

The percentile ladder, the област comparator and the salary verdict all convert
gross↔net using Bulgarian payroll rules, which are legislative constants with no
machine-readable feed. One dated table is the source of truth; the SPA reads it
via `mirror.js#payrollParams(data.payroll)` and threads the result through
`bgNetSalary` / `bgGrossFromNet` / `buildLadder`. The `mirror.js` `BG_2026_*`
constants are an **offline sentinel only**, parity-tested by `test_payroll.py`.

An entry carries the five contribution lines **on both sides** — pension,
pension2, sickness-maternity, unemployment, health, once for the осигурено лице
and once for the осигурител — the flat personal income tax and its absence of
an allowance, the maximum insurable income and the statutory minimum gross
wage. **The figures live in `BG_PAYROLL_TABLE` and nowhere else**, this
file included: `build_payroll_payload(as_of)` picks whichever entry was in force
on the publish date, so what shipped is read off `payroll.json`'s
`effective_from` and not off a list somebody has to remember to update.

**The draft of a budget act is the thing to be careful of**, because a draft
outranks the act itself in search for months after it is superseded: the last
ЗБДОО draft carried a higher insurance ceiling and a raised фонд "Пенсии" rate
for those born after 1959, and neither was enacted. Read the promulgated text.
One change that act does make sits outside this table on purpose: държавни
служители begin paying personal contributions at 80:20, a different insured
category from the III категория труд employee modelled here — and НОИ publish
its split beside this one, so пенсии 11,8/3,0 and ОЗМ 2,8/0,7 are another
category's figures rather than corrections to these.

**No employer rate here is a cell anybody publishes**, which is why
`EMPLOYER_RATE_DERIVATION` carries the working beside each one and
`test_payroll.py` sums it back. Four of the five funds are a single 60:40 split
— КСО чл. 6, ал. 3, т. 7 for ОЗМ and „Безработица“, ЗЗО чл. 40, ал. 1, т. 1 for
health. Фонд „Пенсии“ is not, and that is the trap: чл. 6, ал. 3, т. 9 fixes it
at 7,1/5,7 of the original 12,8 на сто, and чл. 6, ал. 1, т. 4's two 1-point
rises are each split 0,56/0,44 on their own terms, giving **8,22% employer /
6,58% employee**. Applying 60:40 to the fund's 14,8 gives 8,88 — a number that
looks right, sits 0,66 points out, and would be wrong in the same direction for
every salary on the site.

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
one — and re-run `--source payroll`.** `build_payroll_payload(as_of)`
picks whichever entry was in force on the publish date, so an entry can be
landed before it takes effect. `scheduled_changes` documents
known-but-not-yet-effective changes so the SPA can surface them, and each one's
`effective_from` must be an **ISO date, never a condition** — "2026 (pending the
regular state budget)" was true until it wasn't, and nothing could tell.

## Държавен вестник — `sources/dv.py`

The one payroll figure that is fetched, and the line is whether it exists as a
published cell. КСО чл. 6, ал. 1, т. 7 sets only the span — «от 0,4 до 1,1 на
сто» — and delegates the per-activity rates to the year's ЗБДОО; чл. 6, ал. 6
puts the whole line on the осигурител. That is 87 rows in an appendix, reset
every year: a table, and 87 chances to mistype. The rate splits above are the
opposite — no cell anywhere holds 8,22 — so they stay transcribed and this is
read from the act.

### `showMaterialDV.jsp?idMat=…` — Приложение № 2 / № 2А към чл. 14

**The `idMat` cannot be derived and is recorded per entry.** ДВ build their
permalinks from an id the issue number does not yield, so «бр. 68 от
28.07.2026» reaches nothing on its own — the id is found once and stored on the
entry it belongs to. That is also what pins the fetch to ONE act rather than to
whatever a search currently returns, and `fetch_tzpb_appendix` refuses a
material whose own «брой: N, от дата D.M.YYYY» header disagrees with the
entry's citation.

**Name the appendix, never "the ТЗПБ table".** ЗБДОО 2026 legislates the whole
year and чл. 14 splits it: Приложение № 2 runs 1 January – 31 July, № 2А from
1 August. Seven activities move between them — food manufacturing 0,7→0,9%,
architectural and engineering 0,7→0,5%, sport 0,5→0,7%. A parser that took the
first table it found would be right for eighty sectors and wrong for seven,
which is the shape of wrong that never announces itself.

**Two classifications meet here, and the site has to say so.** ЗБДОО sets ТЗПБ
by **КИД-2025 division** (NACE Rev. 2.1); НСИ publish wages by **NACE Rev. 2
section** (`sector_salary.json`). `payroll.py#NSI_SECTION_DIVISIONS` is the
join, it is ours rather than anybody's published correspondence, and it carries
two consequences that may not be smoothed over:

- **Ten of the nineteen sections span several rates.** «Преработваща
  промишленост» runs 0,5% to 1,1%. A section therefore resolves to a RANGE and
  never to a representative rate — a modal division would give one confident
  figure that is wrong for most of the people reading it.
- **Rev. 2.1 moved work between divisions.** Division 45 (trade and repair of
  motor vehicles) has no КИД-2025 successor of its own; its repair half sits
  inside 95, which also serves section S. So 95 appears under two sections in
  the join, deliberately.

`build_work_accident_block` **raises** if a section names a division the
appendix does not carry, because dropping it silently narrows that section's
published range — more precise-looking, and wrong.

**What the payload carries.** `work_accident` publishes the act's own span,
the appendix name, its ДВ permalink and issue, and `by_nsi_section` with a
`{min, max}` per section — always both, even where they are equal, so no
template branches on which shape it got. The 87 division rows are **not**
published: nothing renders them, and a payload field nothing reads is a number
nobody checks.

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
| `new_business` | ЕЦБ. `_role`, `dataset` (the BGN key spliced with the EUR key), `source_url`, `ref_period`, `value_pct`, `rate_basis` (the charge-free rate), `series_by_period` (monthly since the ЕЦБ series starts), `currency`, `currency_history`, `methodology_change`. |
| `new_business.aprc` | The same loans' all-in cost with fees (ГПР): `value_pct` + `series_by_period`. |
| `new_business.monthly_volume` | How much was lent — the evidence for the splice. |
| `outstanding_stock` | БНБ. `_role`, the XLSX + sheet + cell in `dataset`, `value_pct`, `book_volume_eur_m`, `series_by_period` monthly back to 2007-01, `methodology_change`. |
| `cross_check` | `bnb_outstanding_pct`, `ecb_mir_outstanding_pct`, `delta_pp`, `tolerance_pp`, `status`. |
| `lending_limits` | `effective_from`, `ltv_max_pct` 85, `dsti_max_pct` 50, `maturity_max_years` 30, `min_down_payment_pct` 15, `prudent_dsti_pct` 30, `observed_weighted_avg_dsti_pct` 38.5, `dsti_income_basis`. |

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
8. **A row in `site/src/lib/payloads.js`** — the manifest is what the site
   fetches and what the freshness panel judges each payload's age against. Items
   1–7 leave a file that is committed, gated and attributed, and that no page
   reads; `verify_data_contracts.mjs` fails on exactly that gap rather than
   letting it ship quietly
9. The `view/` module that reads it, and its copy in **both** languages — a
   missing string renders as a blank line, not a fallback
   ([`site.md`](./site.md) §"The five-layer split")

Items 8 and 9 are where this list crosses out of `pipeline/`, and they are the
ones a connector-shaped change forgets: everything up to 7 can be done, run and
reviewed without the site being opened once.

## Cross-references

- [`architecture.md`](./architecture.md) — how these sources feed the bake
- [`math.md`](./math.md) — the provenance contract
- [`validation-gates.md`](./validation-gates.md) — how drift is caught
- [`legal.md`](./legal.md) — what each publisher permits
- [`local-development.md`](./local-development.md) — running the pipeline against live upstreams
- [`site.md`](./site.md) §"`src/lib/payloads.js` — the manifest" — what a payload has to declare before a page can read it
