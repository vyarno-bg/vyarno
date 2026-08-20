# Eurostat — `sources/eurostat.py`

Prices, wages, jobs and the property market. Every HICP claim traces to a cube
named here, and the scope reads are quoted verbatim and dated because none of
them is in the machine-readable response.

[`data-sources.md`](../data-sources.md) is the index, the cross-cutting rules and
the checklist for adding a connector. **Never batch a multi-value filter** — the
rule and what it costs are §"Multi-value filters return nothing" there.

## `prc_hicp_minr` — the rate and the index, one cube

| Connector | Query | Notes |
|---|---|---|
| `fetch_hicp_rates_bg` | `geo=BG&unit=RCH_A&lastTimePeriod=12` | `RCH_A` is the published annual rate of change. The cube also carries `RCH_M`, `RCH_MV12MAVR`, `I15`, `I25` — ignored. |
| `fetch_hicp_index_bg` | `geo=BG&unit=INDEX_UNIT&sinceTimePeriod=2020-01` | `INDEX_UNIT` is `I15` (2015=100). Values are unscaled and every site figure is a ratio of two of them, so the unit moves no rendered number — but `INDEX_BASE_YEAR` and `api_url_index` must move with it. |

- **`coicop18`** is the ver.2 dimension name; the connector normalises
  `TOTAL ↔ CP00`.
- Rate and index come from the same cube at the same publication, so
  `annual_rate_pct`, `latest_index` and the headline share the latest month.
- **The flash release breaks that, on purpose.** Eurostat publish BG's all-items
  rate about two weeks ahead of the rest of the cube: at `unit=RCH_A` the flash
  month carries TOTAL and nine aggregates and no `CPnn` at all, and at
  `unit=I15` nothing. So the freshest CP00 rate can be a month ahead of every
  other figure. `cli.py#_refresh_hicp` detects it from the cube, publishes
  `hicp_headline.json` alone with `is_flash: true`, and leaves
  `hicp_categories.json` untouched until the full release. Gate 7 refuses a
  headline whose flag and whose two months disagree.
- **`_require_codes` is what makes the unfiltered fetch safe**: every code we
  intend to publish must be present or the fetch raises, so a truncated or
  reshaped response fails loudly rather than publishing a partial basket.

## `prc_hicp_iw` — basket weights (ECOICOP ver.2)

`geo=BG&lastTimePeriod=1`. 5D cube `freq × coicop18 × statinfo × geo × time`, one
`statinfo` member (`IW`). Values are **per-thousand** (CP01..CP13 ≈ 1000, TOTAL =
1000); the CLI divides by 10. The dimension is `coicop18`, the same one
`prc_hicp_minr` uses, and that is what lets a weight and a rate for one code be
about the same bucket.

**A weight is a share of what all households spend, not of what one of them
does.** `prc_hicp_esms`, read 2026-08-13: «The main data source for the HFMCE
used for the compilation of the weights are National Accounts data (from y-2 or
y-1) further complemented with data from the Household Budget Survey», where
HFMCE is «household final monetary consumption expenditure» for the country. The
aggregate is spending-weighted, so a household spending twice as much moves a
weight twice as far — «каква част от парите на средния човек» describes a survey
nobody ran, and the difference between that and the reader's own answer is the
calculator's whole subject. HFMCE «is adjusted to exclude … imputed rentals for
housing», so CP04 is what people pay out and not what an owner-occupier would
notionally pay themselves.

**Who makes the Bulgarian index**, and every surface has to describe the chain
the same way. `prc_hicp_esms` §3.1, read **2026-08-13**: «National HICPs are
produced by National Statistical Institutes (NSIs), while European aggregates
(EU, EA and EEA) are produced by Eurostat.» Eurostat's part is the method and the
audit of it: §6.1 names Regulation (EU) 2016/792 as «the legal basis for
establishing a harmonised methodology», and §11.1 has «Eurostat is checking that
the statistical practices used to compile the national HICP are compliant». So
НСИ collect the Bulgarian prices AND build the Bulgarian index; Eurostat set the
rules, check they were followed, aggregate Europe and disseminate. Copy saying
Eurostat «сглобява» the Bulgarian index credits them with НСИ's work —
`verify_copy.mjs` §"no surface says Eurostat build Bulgaria's index" bans the
construction in both languages.

`lastTimePeriod=1` takes the latest vintage and the connector returns the weight
year alongside. HICP re-weights every January while Eurostat publish the new item
weights around late February, so there is a real window each year when rates are
ahead of weights; the chain gate fails the publish rather than mixing vintages.
History runs 1996→ on ver.2, back-recalculated, so the whole index history
reconciles on one classification.

**Do not use `prc_hicp_inw`** — the archived ver.1 cube: 12 divisions, no CP13,
CP12 means "Miscellaneous goods and services", keyed by `coicop`, HTTP 400 for
`coicop18`. Joining it to the ver.2 rate cube puts one bucket's weight beside
another bucket's rate.

## ECOICOP level 2 (groups)

Both cubes carry a division plus one digit (`CP011` Food, `CP072` Operation of
personal transport equipment). The SPA's detailed mode renders these, so the
pipeline publishes them under `categories[].groups[]` with the same fields a
division gets. The set is **discovered from the weights cube at refresh time**
(`group_codes_in_basket`), never hardcoded — it is country- and
vintage-specific. Not every BG group carries a non-zero weight, and the ones that
do not have no published rate either. Group weights must sum to their parent
division's weight (gate 4).

Level 3 (classes, `CP0111`) is published upstream but not by us: it is below the
resolution of anyone's memory of their own budget, so a guess entered as data
would make the result less accurate rather than more.

## `earn_ses_monthly` — the ladder's shape

`geo=BG&nace_r2=B-S_X_O&isco08=TOTAL&worktime=FT&age=TOTAL&sex=T&lastTimePeriod=1`.
Multi-dimension **single-value** filters work together. `indic_se` carries the
four points we use — `D1_E_EUR`, `MED_E_EUR`, `MEAN_E_EUR`, `D9_E_EUR`, gross
EUR per month. That is the correct unit, individual employee gross earnings, but
SES is 4-yearly, so it is stale in level and used only for the shape.
`fetch_ses_earnings_bg` raises if any of the four is missing.

**That slice is narrower than "what people earn in Bulgaria", and the caveat has
to name all of it.** `earn_ses_main_esms` §3.5–3.6, read 2026-08-13: the survey
«provides information on employees in enterprises with **10 or more employees**»
and «refer to enterprises with at least 10 employees operating in economic
activities defined by **NACE Rev. 2 sections B to S excluding O**». So three cuts
sit between this ladder and the country: full-time only (ours — part-time dilutes
a monthly figure), firms of ten or more, and no public administration, defence or
compulsory social security, plus agriculture which is section A and outside B–S.
`COPY.pctMethod` names the three that are the survey's, one tap down from the
rank; what stays beside the figure is `COPY.pctCaveat`, which is the part a
reader misreads the number without.

**The cadence is legislated, and the legal basis changed on 2026-01-01.**
Regulation (EU) 2025/941 repealed Council Reg (EC) 530/1999 from that date and
carried the survey over unchanged in the respects that matter: its Annex sets
Structure of Earnings at periodicity **"Every 4 years"**, transmission deadline
**T+16 months**, and **first reference period 2026**. So 2026 is a named
requirement rather than an extrapolation from the 2018→2022 gap, and the wave
lands in 2028. BG's waves: 2002, 2006, 2010, 2014, 2018, 2022.

## `une_rt_m` — unemployment, monthly

`geo=BG&sinceTimePeriod=2020-01`, no further filters — the BG slice is small. The
transform pins `s_adj=SA` × `sex=T` × `age=TOTAL` × `unit=PC_ACT` and **raises**
if that cell is absent.

**Why monthly and not `une_rt_a`.** The annual cube publishes one figure a year,
so mid-year its freshest reading is an average of the year before last — over a
year stale, and far enough from the monthly series to change what the page
claims.

**Each pinned dimension has a neighbour that is a different statistic, not a
coarser version of the same one — hence no fallback branch:**

| Dim | Values | Why this one |
|---|---|---|
| `s_adj` | `SA` · `NSA` · `TC` | **`SA`** is Eurostat's headline. `NSA` swings with the season, so a month-on-month read of it measures the calendar; `TC` is a smoothed trend, not an observation. |
| `age` | `TOTAL` · `Y_LT25` · `Y25-74` | **`TOTAL` here IS 15-74**, and that is the metadata's word rather than the label's. `une_rt_m_esms` §3.4, read **2026-08-13**: «For the unemployment rate, only persons from 15 to 74 years of age are used.» There is no `Y15-74` code in this cube — that spelling belongs to `une_rt_a`, and a transform ported across without checking filters to nothing. |
| `unit` | `PC_ACT` · `THS_PER` | **`PC_ACT`** is the percentage of the labour force. `THS_PER` is thousands of people. |

**«Unemployed» is the ILO test, not «has no job».** Same page, §3.4:

> Unemployed persons are all persons 15 to 74 years of age who were not employed
> during the reference week, had actively sought work during the past four weeks
> and were ready to begin working immediately or within two weeks. … Employed
> persons are all persons who worked at least one hour for pay or profit during
> the reference week or were temporarily absent from such work.

Both ends are surprising: somebody who stopped looking is in neither the
numerator nor the denominator, so discouragement LOWERS the rate, and one paid
hour in the week is employment. §3.6 draws the population as EU-SILC does —
«except for persons living in collective or institutional households».
`unemployment.json`'s `notes` carries the definition, because that field's job is
to say what the upstream measures.

**Never fall back to `PC_POP`**, a percentage of the whole population including
everyone outside the labour force: a materially lower number wearing the same
label, which is what makes it tempting when a filter returns nothing. `une_rt_m`
does not carry it, so a fallback reaching for it fails the fetch rather than
mislabelling one.

## The property cubes — `prc_hpi_hsnq`, `prc_hpi_hsvq`, `prc_hpi_q`

Three quarterly cubes fed by НСИ, describing one market from three angles: how
many dwellings households bought, what they paid, and how the price per dwelling
moved. `house_market.json` carries all three.

**What is in them is narrower than "House sales" suggests, and the page's wording
depends on it.** Eurostat,
[`prc_hpi_inx_esms`](https://ec.europa.eu/eurostat/cache/metadata/en/prc_hpi_inx_esms.htm)
§3.4–3.6, read **2026-08-13**:

> The number and value of house sales cover dwellings transacted at national
> level where the purchaser is a household. Transactions between households are
> included. Transfers in dwellings due to donations and inheritances are
> excluded.
>
> The house sales value reflects the prices paid by household buyers and include
> both the price of land and the price of the structure of the dwelling. The
> prices for new dwellings include VAT. Other costs related to the acquisition of
> the dwelling (e.g. notary fees, registration fees, real estate agency
> commission, bank fees) are excluded.
>
> The target universe is all transacted dwellings purchased **at market prices**
> by households regardless of which institutional sector they were bought from
> and of the purchase purpose.

and §3.4 on what "non-market" covers, which is wider than gifts:

> The HPI is based on market prices of dwellings. Non-marketed dwelling prices
> are ruled out from the scope of this indicator. Examples of the later include
> **self-build dwellings, dwellings purchased by sitting tenants at discount
> prices, or dwellings transacted between family members.**

НСИ's own ППЖ metadata (`nsi.bg/metadata/pokazateli-za-prodajbite-na-jilishta-ppj-364`),
read **2026-08-13**, on what is removed before either series is counted:

> Изключени са следните записи: - сделки на държавата и общините; - „непазарни”
> сделки, като наследства и дарения, социални схеми, продажби от съдия-изпълнител
> и др.; - сделки с нежилищни имоти; - продажби от физически лица (домакинства)
> към други сектори.

**"At the price actually paid" is wider than either publisher, and that is the
correction this read produced.** The test is a *market* price: a discounted sale
between relatives has a price actually paid and is excluded, as are social
schemes and court-executor sales. The page therefore says «на пазарна цена» and
names the four exclusions. §3.1 also settles a claim the payload made more
narrowly than the publisher: «The land component of the dwelling is included» —
the whole land component, which is the reading a flat has no room for.

**Three things this read could not settle**, and none may be written up as though
it had been:

- **One deed or one dwelling.** Eurostat's unit is «Number of transacted
  dwellings»; НСИ describe compiling «броя на всички жилищни продажби» over
  transactions that may carry more than one property. Nothing published says
  which a two-flat deed counts as. It does not move `avg_deal_eur` — numerator
  and denominator are over the same set either way — but it is why no sentence
  promises the count and the number of homes that changed hands are the same
  integer.
- **Whether НСИ's price-band trimming reaches the sales series.** Their accuracy
  section states it about the index; whether it applies to the ППЖ count and
  value is not said.
- **Who «сделки на държавата и общините» excludes.** Eurostat scope the universe
  «regardless of which institutional sector they were bought from», so a
  household buying a municipal flat is inside theirs; НСИ list state and
  municipal transactions among the removed records without saying on which side
  of the deal.

**The property register may never be quoted beside these**, and the two are the
same source read differently, which is what makes the comparison tempting: НСИ's
national metadata for the index says «The HPI uses the real transaction prices
registered in Property Register of Registry Agency». The register's «Продажби»
column counts every sale deed — land, garages, shops, offices — and runs to
roughly twice Eurostat's dwelling count for the same quarter.

Four traps sit in `eurostat.py` beside the constants that encode them
(`#PURCHASE_CODES` and the block under it): the purchase code is `DW_EXST` and a
misspelling filters the cube to nothing behind a 200; the two sales cubes are
published over different windows and the transform pairs them on the quarters
they share; no `sinceTimePeriod` is pinned; and `EUR` is pinned even though `NAC`
currently returns the same figures.

**The rate is read, never computed from the index.** НСИ rebased to 2025=100 from
the start of 2026 under Regulation (EU) 2025/1182 and warn that rates recomputed
across the two bases can differ by rounding. So `annual_rate_pct` is Eurostat's
`RCH_A`, which is also what the cross-publisher gate compares against НСИ's
`HPI_1.3`.

**The index covers every household purchase, not owner-occupation.** BG's
national metadata, read 2026-08-13: «All transactions are included (both cash and
mortgage) acquired by households regardless of its final use … Luxury properties
are not excluded from the HPI/HSI.» So «цените на сделките» is the right label
and any wording narrowing it to homes people live in is not.

### Why there is no gate on any of this

The obvious guard is a connector-level assertion that a cube's metadata still
says what we relied on. **It cannot be built where the risk is, and the cubes say
so themselves.** Probed 2026-08-13, the two series the average deal divides carry
these labels and nothing else:

| Cube | Dataset label | Unit label |
|---|---|---|
| `prc_hpi_hsnq` | House sales - number and index, quarterly data | `NR` → **Number** |
| `prc_hpi_hsvq` | House sales - value and index, quarterly data | `EUR` → **Euro** |

Every claim above — the purchaser is a household, the price is a market price,
VAT is in and the notary is out, the two series cover one population — is absent
from that. «Number» and «Euro» are compatible with any two cubes in the
catalogue, so a guard over the machine-readable metadata would pass unchanged
through the exact failure this section exists to catch, and would put a green
check beside "definitions verified". A hash over the ESMS page fails the other
way: Eurostat revise that prose without versioning it, so the guard goes red on a
typo fix and the next person raises the tolerance until it is off.

`ilc_lvho02` and `cens_21dwob_r3` **do** carry their meaning in their own labels
and could be gated. It is still not worth doing: they are the two where the wrong
reading is already refused by a pinned dimension, and a guard whose coverage is
the easy fifth certifies the whole while watching none of the part that moved.

**So this stays a dated read, the pattern [`legal.md`](../legal.md) uses for
licence terms.** Re-read it when a connector is retargeted, when a payload's
shape changes, or when a claim on a page is being written from a cube's title —
which is how the wrong ones got written. The cost is that nothing fails when an
upstream re-scopes a series between reads; that is stated here rather than
papered over, and no cheaper guard removes it.

## The structure cubes — `ilc_lvho02`, `cens_21dwob_r3`, `ilc_lvho07a`

Three cubes on two clocks, which is why they are a second payload rather than
more keys on the first: a freshness row cannot honestly date an annual EU-SILC
survey and a census snapshot at once.

Every one crosses several dimensions and every one has a wrong `TOTAL` that
returns 200. Tenure is a seven-way split crossed with household composition and
poverty status, so `hhcomp=TOTAL` and `rskpovth=TOTAL` are the whole population;
the census splits by occupancy **and** building type, so `building=TOTAL` is what
"all dwellings" means; overburden is crossed with age, sex and poverty status,
and the below-poverty slice runs several times higher than the headline.

**`tipsho60`, the price-to-income ratio, was a fourth and is not read any more.**
Every reading of it needed three qualifications first: it is published once a
year and stopped two years behind everything else on the page, its denominator is
an income per head over a falling population, and the 100 it is indexed against
is recomputed with each edition, so every earlier point moves without its year
changing. A figure that cannot be used until all three are said is one a reader
takes nothing from. Reinstating it means the connector, the gate and a section
that answers the question it raises.

**What each measures**, quoted, because three of the four sentences on `/market/`
describing them were written from a cube title and two were wrong. All read
**2026-08-13**.

- **Both EU-SILC cubes are a share of the population in PRIVATE households**, not
  of everybody in the country.
  [`ilc_sieusilc`](https://ec.europa.eu/eurostat/cache/metadata/en/ilc_sieusilc.htm)
  §3.6: «The reference population of EU-SILC is private households … **Persons
  living in collective households and in institutions are generally excluded from
  the target population.**» That is the same boundary the census draws in the
  other direction — its «колективни жилища» are what EU-SILC leaves out — so the
  two sections have to say it in the same words or the page contradicts itself.
- **Tenure exhausts its base.** `ilc_lvho02`'s label is «Distribution of
  **population** by tenure status, type of household and income group» and its
  `tenure` dimension carries `OWN` (with `OWN_L` / `OWN_NL`) and `RENT` (with
  `RENT_MKT` / `RENT_FR`) and no third status. So «собствениците и наемателите
  правят сто» is the cube's structure, not an arithmetic coincidence of one
  vintage.
- **Overburden's numerator is not a mortgage payment.** Eurostat's glossary: «the
  percentage of the population living in households where the total housing costs
  … represent more than 40 % of **disposable** income … For homeowners, the
  housing cost calculation includes **mortgage interest payments net of any tax
  relief**». The Bulgarian «вноска» means the whole instalment, so copy using it
  overstates the numerator for exactly the households the indicator is about. It
  is «лихвата, не главницата», in as many words.
- **The census's «unoccupied» is a usual-residence test.**
  [`cens_21_esms`](https://ec.europa.eu/eurostat/cache/metadata/en/cens_21_esms.htm):
  «'Unoccupied conventional dwellings' are conventional dwellings which are not
  the usual residence of any person at the time of the census. Dwellings reserved
  for seasonal or secondary use, vacant dwellings, as well as conventional
  dwellings **with persons present but not included in the census** are
  classified under the category.» A dwelling with somebody asleep in it can be
  unoccupied, so census-night presence is the case the regulation names to rule
  out.

## Salary distribution — `salary_dist.json`

**No single official source publishes a fresh, machine-readable, full salary
distribution for BG, and nothing at all publishes one below the national level.**
Everything was probed:

| Dataset | Cadence | Why it cannot rank a salary |
|---|---|---|
| `earn_ses_monthly` / `_hourly` / `_annual` | 4-yearly | The only individual-earnings *distribution*. **Used, for shape.** |
| `earn_nt_net` / `earn_nt_netft` | annual | A tax model at fixed reference cases, not percentiles. |
| `ilc_di01`, `ilc_di03` | annual | *Household* disposable income — the wrong unit; mixing it with a one-person salary question pushes almost every wage into the top few percent. |
| `ilc_di11` (S80/S20) | annual | A single inequality ratio. |
| НОИ insured income | monthly | Capped at the maximum insurable income, barely above the Sofia average, so the whole upper half piles at the ceiling. |
| НСИ quarterly wages | quarterly | *Average* only, no distribution — by област and by activity alike. Our level anchor. |

So the ladder needs two official sources: the **shape** from Eurostat SES 2022,
the **level** from НСИ's live all-activities average. They stay in two files to
the reader's browser, one publisher per artefact ([`legal.md`](../legal.md) §НСИ),
and are composed in the tab.

**Both halves are the COUNTRY's, and that is the constraint rather than a
default.** SES publishes D1, the median and D9 for Bulgaria and nothing below
that, from any publisher at any vintage. Re-level that national spread onto one
област's mean and the result is called that област's ranking: anchored on София's
average, a mid-range wage lands tens of percentiles from where the country's own
ladder puts it, every rung stays plausible, the ladder stays monotonic and
nothing on screen shows the difference. `view/country.js#nationalQuarter` selects
the level out of `sector_salary.json`'s all-activities «Общо» row — the one place
in the app that row is wanted, and `sectorComparison` refuses it by name
everywhere else.

**The two halves are two populations, and how much that costs cannot be worked
out from anything published.** SES is full-time employees in firms of ten or
more, NACE B–S excluding O; НСИ's average is every firm size, with public
administration and agriculture in. Three things about that, because "the
populations differ" invites either a shrug or an invented correction:

1. **The level mismatch costs nothing, by construction.** `f = НСИ_mean /
   ses_mean` sets the composed ladder's mean to НСИ's, so what the two
   populations' mean pay differs by is exactly what `f` absorbs. Only the SHAPE
   can be wrong.
2. **A coverage change of this size moves the level far more than the shape**, on
   the one such change SES publishes for BG: adding part-timers
   (`worktime=TOTAL` against `FT`) moves the mean about −5% and D9/D1 about
   +0.1%.
3. **It does not generalise, and the same cube says why.** At the 2018 vintage,
   D9/D1 for `P-S` is roughly half of `G-N`'s — composition can move dispersion
   by a factor of two. Section O would most likely narrow the true spread and
   firms under ten would widen the bottom, so **not even the SIGN is available.**

It cannot be closed by probing harder. `earn_ses_monthly` has **no firm-size
dimension** for BG at any vintage, and neither section A nor section O is a
`nace_r2` category at any vintage. The distribution of the population the level
is drawn from is not measured by anyone.

That makes it P11: **uncomputed, not concealed.** `COPY.pctMethod` names the
mismatch in both languages and says its size cannot be worked out; `COPY.pctCaveat`
carries the half that changes the reading, that the rank is approximate and does
not follow the reader's област. `verify_copy.mjs` requires the second and
`verify_render_results.mjs` requires it to stay unfolded.
Multiplying the ladder by a dispersion factor nobody publishes would replace a
disclosed unknown with an invented number.

**Method.** Steps 1–2 are `transform.py#build_ses_shape_ladder`, restated in the
JSON's own `shape.method`; steps 3–4 are `mirror.js#composeLadder`. Both
docstrings carry the reasoning — why the split is lossless, why the rungs carry
four decimals, and why the statutory floor is applied after the re-level and to
every rung rather than to P1.

1. Fill the intermediate deciles by piecewise-lognormal interpolation in the
   standard-normal quantile z, matching D1/median/D9 exactly.
2. Extrapolate the P1/P99 tails along the nearest segment's log-slope; publish at
   SES's level.
3. In the browser: read НСИ's latest published quarter for all activities. A
   quarter and not a month, because March alone spikes on annual bonuses.
4. Multiply every rung by `f` and floor each at the statutory minimum wage.

**Output:** `shape.ladder_ses` at cuts 1,10,20,…,90,99, plus `ses_mean`,
`sigma_bottom` and `sigma_top`. The composed rungs exist only in the reader's
tab. The salary input is net, so `mirror.js#buildLadder` converts each rung
through `bgNetSalary` and the comparison is net against net.

**Caveats**, carried in the payload's `disclaimer` and split across the SPA's
`pctCaveat` and `pctMethod`: the level is live and the shape is a 2022 survey
re-levelled to today; the middle deciles and the tails are modelled, not surveyed;
the rank does not follow the reader's област.

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
fastest. `_cube_to_rows` does this, and nothing should need to touch it unless a
dimension is added or removed.
