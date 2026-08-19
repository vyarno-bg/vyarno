# НСИ — `sources/nsi.py`

Wages by област and by economic activity, and the housing workbooks. Both wage
files are read in two language editions and each pins the other.

[`data-sources.md`](../data-sources.md) is the index, the cross-cutting rules and
the checklist for adding a connector.

**The parse traps are in `nsi.py`'s module docstring**, beside the code that
absorbs them: the two editions are not row-aligned and their sheet names differ,
so neither a header row nor a sheet name may be a literal; Q4 is published twice
and the second column folds in the 13th salary; the quarter numerals mix
Cyrillic and Latin; year and city labels carry footnote markers glued to the
text; and a cell printed `-19.2` is stored as `-19.200000000000003`. Every one is
silent, and the bonus column is the one worth carrying in your head — reading it
steps the whole ladder up every fourth quarter and back down in Q1, and both
figures are plausible wages.

**Every published value is a cell they published.** §2.1.1 of their terms forbids
distributing производни и сборни произведения ([`legal.md`](./../legal.md) §НСИ),
so no НСИ payload carries a gap, a ratio, a rank or a national row we averaged
ourselves. `test_no_figure_is_computed_only_selected` fails if a connector starts
averaging — a change that would move no number a reader could check, so nothing
else would notice it.

## `Labour_1.1.2.2` — quarterly gross wage by област, both editions

Title, read 2026-08-13: `AVERAGE GROSS MONTHLY WAGES … BY STATISTICAL REGIONS
AND DISTRICTS`. All 28 области from the `{year}trimes` sheets, as published.
Each sheet interleaves six statistical-region headings with the district rows,
and **the leading hyphen is the only thing separating them** — `-Vidin` is an
област, `Severozapaden` is the region above it, and both carry wages of the same
magnitude.

**There is no Bulgaria row and none is derived.** An unweighted mean over 28
области is both a производно произведение and wrong arithmetic. The national
figure the salary ladder anchors on is НСИ's own «Общо», published in
`sector_salary.json`.

**Why the quarter, not the month.** BG wages spike every March as Q1 bonus and
13th-salary payments land: March runs +7% to +13% above its neighbours and the
spike has grown every year. Anchoring the distribution to whichever month was
last refreshed injects up to ~8% of seasonal bias and makes every percentile
lurch when the next month lands.

**Why НСИ's quarter and not an average of their months.** Both are in the
workbook, and taking theirs means no figure in the payload is one this project
computed. It is also more accurate: the mean of their three rounded monthly cells
does not reproduce the quarter they publish, to the digit they print it at.

**Both language editions**, because the област names are half of what this
payload is for and translating НСИ's English ourselves is how «София(столица)»
becomes something they never wrote. The two are joined by label and every paired
cell must be equal, so an edition revised alone raises rather than dating half
the payload wrongly.

**The regression guard reads the whole table rather than one row**: every област
`regions.py` names is present in both editions, no row is present that it does
not name, and Sofia-city is the maximum by a wide margin. Together they catch
what a `cap > province` comparison could not — an off-by-one shifting every
reading by one област keeps that comparison true while putting Варна's wage under
Добрич's name.

**Two deliberate choices:** EUR not BGN, because the BGN table lags by one
release and every other figure in the SPA is EUR; and the XLSX not the HTML
landing page, whose `rowspan`/`colspan` headers roll forward every quarter.

`region_salary.json` carries the envelope, both `source_url`s, `dataset`,
`ref_period` (the latest quarter EVERY област carries), `unit` `eur_per_month`,
`is_preliminary`, `disclaimer`, and per област: `code`, `en_name`, `bg_name`,
`value_eur` and `series_by_period` back to 2020-Q1.

- **`code` is имот.bg's slug wherever there is one**, so 27 of the 28 are a name
  an upstream already uses. `regions.py` is the table; `sofia-oblast` is the
  28th and the one with no city page.
- **An област is not a city, and the `disclaimer` says so**: the €/m² beside this
  wage on the page IS a city's, and София-столица is the one place the two
  coincide.
- **`is_preliminary` is the star on the sheet title**, and it is a field rather
  than a sentence in `notes`. НСИ mark a whole year provisional until they
  finalise it, so their newest quarter carries it for about a year. It has to
  move together with `sector_salary.json`'s: the two are one publisher's two cuts
  of one release, and marking one without the other leaves a reader unable to
  tell the two claims are the same claim.

## `Labour_1.1.2.1_EUR_EN.xlsx` + `_EUR.xlsx` — gross wage by economic activity

The sibling table, same directory and terms: 19 NACE Rev 2 sections plus `Total`,
quarterly. Title, read 2026-08-13: `AVERAGE GROSS MONTHLY WAGES AND SALARIES OF
THE EMPLOYEES UNDER LABOUR CONTRACT` — **employees under a labour contract**, so
the self-employed are outside every figure it feeds: the sector card, the
ladder's national anchor and the years-of-pay card on `/market/` alike. Neither
the coverage line nor that card's disclosure may be shortened to «средната
заплата».

**Why both editions.** Their Bulgarian name for section J is «Създаване и
разпространение на информация и творчески продукти; далекосъобщения» — nobody
reads that as «ИТ», where a translation of "Information and communication"
invites exactly that. Rows are paired by position and every paired cell must
match, so a reordered row raises instead of shipping one section's wage under
another's name.

**There is no distribution behind these averages, and there is none to find.**
Probed 2026-08-06: `earn_ses_monthly` filtered to `nace_r2=J&geo=BG` returns HTTP
200 with `"value": {}` and a `nace_r2` dimension of size **0** — section J is not
a category in the cube. Unfiltered, BG carries five `nace_r2` categories —
`B-S_X_O`, `B-N`, `B-F`, `G-N`, `P-S` — and **every one is a broad grouping
rather than a section**. The finest, `G-N`, lumps J with G, H, I, K, L, M and N.
At the 2022 vintage only `B-S_X_O` carries values at all; the four groupings stop
in 2018. Both halves matter: the vintage gap is why nothing below the whole
economy is available now, and the missing section is why a richer vintage would
not help. So no sector median, no deciles and no spread exists from any
publisher, and the site says so on screen (`COPY.sectorNoRank`). Re-run both
probes before assuming otherwise, and read the category list rather than only the
value count.

`sector_salary.json` carries the envelope, `dataset`, `source_url_bg` beside
`source_url` so a verify link lands on the edition the label came from,
`ref_period`, `unit`, `is_preliminary`, and per activity `en_name`, `bg_name`,
`value_eur` and `series_by_period`. Gate 8 in `validate.py` fails the publish if
a headline stops being the published cell.

**The `Total` row is in the payload and is what the percentile ladder anchors
on** — §"Salary distribution" in [eurostat.md](./eurostat.md) has why a national
spread needs a national level. That is its one use. It is not an economic
activity anybody works in, so offered in a list labelled «Твоят сектор» it
collects the reader who cannot find their own line and answers them with a
distance from the whole economy. `view/payroll.js#sectorOptions` leaves it out and
`sectorComparison` refuses it at the lookup, so one list's contents are not the
whole guarantee.

## The housing workbooks — `HPI_1.3`, `HPI_2.6`, `HSI_2.4.5`

Same host and directory as `Labour_1.1.2.x`. Three things differ.

**What each workbook's cells are**, from their own title rows read 2026-08-13,
because "index or rate" is the one thing about them that cannot be told from a
plausible-looking number:

| Workbook | Its own title | A cell is |
|---|---|---|
| `HPI_1.3` | «ИЦЖ, национално ниво - съответното тримесечие на предходната година = 100 (изменение спрямо съответното тримесечие на предходната година) (%)» | the y/y **change** in %, by dwelling type (`H.1.` общ, `H.1.1.` нови, `H.1.2.` съществуващи) |
| `HPI_2.6` | «ИЦЖ за шестте града в България с население над 120 000 жители» | the same change, per city, same three `H.1.*` rows |
| `HSI_2.4.5` | «ППЖ според броя на продажбите, за шестте града» | the y/y change in the **number of sales**, per city, `N.1.*` rows |

The header says «= 100» and the second line says «изменение», which read together
mean the change and not the index: a cell holding 6.7 is a 6.7% change, not a
level of 106.7. Both readings are plausible percentages, so nothing downstream
would catch the wrong one. `HOUSING_ROW_CODES` matches the code column rather
than the label, and the value is published as `value_pct`.

**«НСИ го изчислява, Евростат го разпространява» is the publisher's own account
of the chain**, not an inference from two columns agreeing. `prc_hpi_inx_esms`
§3.1, read 2026-08-13: «The national HPIs are produced by National Statistical
Offices (NSIs) and the European aggregates by Eurostat, by combining the national
indices.»

**The filenames are discovered, never hardcoded.** `discover_housing_workbook`
walks `/statistical-data/{topic}` — topics 99, 98 and 93 — and takes the
`timeseries/` link naming the workbook, raising if it is gone. Guessing would
have failed on the first attempt: `HPI_1.3.xls` 404s where `HPI_1.3.xlsx` serves.

**No level exists to publish, and that is the upstream rather than a choice.**
Every НСИ city series is an index or a percentage; their own «Пазарни цени на
жилища» survey in лв./кв.м ran «I тримесечие 1993 - II тримесечие 2014» and was
discontinued.

**Footnote 3 on `HPI_2.4`, read 2026-08-12**, shapes the code: under Regulation
(EU) 2025/1182 the base year moved to 2025 from the start of 2026, and «равнищата
на изменение … изчислени от динамичния ред при база 2015=100, биха могли да се
различават от тези, изчислени от динамичния ред при база 2025=100». That is why
the rate on `/market/` is the one each publisher **prints** rather than one
computed from an index.
