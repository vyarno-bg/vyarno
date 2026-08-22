# ЕЦБ — `sources/ecb.py`

New-business mortgage and consumer rates over SDMX, plus deposit levels and the
household NPL ratio. A separate module because the ЕЦБ's API uses position-based
series keys and its own response shape.

[`data-sources.md`](../data-sources.md) is the index, the cross-cutting rules and
the checklist for adding a connector.

**Two structural rules and the reason for each are in `ecb.py`'s docstring**:
filter in the URL PATH and never the query string, because the API silently
ignores unknown query parameters and returns the entire MIR flow — 7,742 series,
18.7 MB — to a parser that would take the first one; and verify the response
describes what was asked for, which `parse_mir_series` does by re-reading the
returned dimension metadata and refusing more than one series. The same docstring
carries why `A2C` and not `A22`, and why the BGN series is spliced to EUR at
2026-01 (`EURO_SWITCH_PERIOD`, held gap-free and step-free by `test_ecb.py`).

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
| New lending to companies, the mortgage rate's comparator | `M.BG.B.A2A.A.R.A.2240.EUR.N` |
| Pre-2026 legs of the four above | same keys with `BGN` |

### Where each outstanding-stock series actually begins

`sources/ecb.py#OUTSTANDING_SERIES_START` is 2022-01, and that is a **fetch
window rather than a property of the data** — the month all three of these
carry, not the month any of them starts. Enumerated with no `startPeriod`,
**2026-08-22**:

| Key | First observation | Count |
|---|---|---|
| `M.BG.B.A22.A.R.A.2250.EUR.O` | 2013-04 | 159 |
| `M.BG.B.L22.A.R.A.2250.EUR.O` | 2022-01 | 54 |
| `M.BG.B.A20.A.R.A.2250.EUR.O` | 2019-12 | 79 |

Worth the row because the constant reads like a limit and is not one: the
housing stock has thirteen years behind that date, and only the deposit stock
would come up short of a 2020 start. Each of these is a cross-check input read
at one month, so none of it is load-bearing today — it is load-bearing the
moment somebody wants one of these as a series.

## What the codes mean, in the ЕЦБ's own words

All read **2026-08-13**.

- **`A2C` is narrower than "house purchase".** `CL_BS_ITEM`: `A22` is «Lending
  for house purchase», `A2C` is «Lending for house purchase **excluding revolving
  loans and overdrafts, convenience and extended credit card debt**». So the
  new-business figure is over term lending, and a credit card drawn to furnish
  the flat is not in it. The outstanding/new-business split is a different
  dimension, `IR_BUS_COV` (`O` / `N`).
- **`DATA_TYPE_MIR=R` is two concepts under one code.** `CL_DATA_TYPE_MIR` names
  it «Annualised agreed rate (AAR) / Narrowly defined effective rate (NDER)», and
  the Manual §4.2.2 says why: «Instead of the annualised agreed rate, NCBs may
  require their reporting agents to implement the narrowly defined effective rate
  (NDER)». **Which of the two Bulgaria reports is unsettled.** БНБ say only
  «Лихвените проценти са ефективни годишни проценти», and §4.1 warns that
  "effective interest rate" has «a range of different meanings depending on the
  Member State». Both exclude charges, so nothing about which formula the rate
  feeds turns on it; what turns on it is whether a payload may print «AAR», and
  it may not. What would settle it: БНБ naming the concept in Наредба № 17 or the
  ЕЦБ publishing the per-country choice. Swapping `R` and `C` is a live risk
  either way, so a gate asserts APRC ≥ R − 0.05 pp, the tolerance being the two
  series' independent rounding (`mortgage.py#APRC_BELOW_AAR_TOLERANCE_PP`).
  `C` = APRC, `B` = volume.
- **`BS_COUNT_SECTOR=2250` is households AND NPISH** — «Households and non-profit
  institutions serving households (S.14 and S.15)», which БНБ spell out as
  «синдикати, политически партии, фондации, сдружения, църкви и религиозни
  общества, читалища, културни и спортни клубове». A wider counterparty than
  «домакинства» means anywhere else in this app, so both `rate_basis` strings in
  `mortgage.json` name the pair. `2240` is non-financial corporations.

## The corporate rate, and the splice that is not optional here

`credit.json#business_lending` carries what a company is charged on new term
lending, so `/credit/` can put it beside what a homebuyer is charged. Two key
dimensions separate it from the mortgage series and not one:
`BS_COUNT_SECTOR` 2240 against 2250, and `BS_ITEM` **`A2A` against `A2C`** —
MIR publishes no purpose split for corporate borrowing, so the corporate side
is term lending for any purpose while the household side is narrowed to house
purchase. Both exclude revolving credit, overdrafts and card debt. The payload
says so in `business_lending.comparability`, because it is the difference a
reader is owed rather than one a caption can wave away.

**The euro leg is the trap, and it is sharper than the mortgage one.** `EUR`
before 2026-01 means loans DENOMINATED in euro. On mortgages that was a ~36
m/month niche beside BGN's ~1,090 m; on corporate lending BOTH currencies were
in real use, and over the months both legs publish they sit as far as 2.08 pp
apart (2023-04: BGN 3.48%, EUR 5.56%). So the euro leg's 234 months back to
2007 look like a corporate rate series and are not one. `credit.py#validate_business_splice`
is the gate: it reads where the published series STARTS and which leg each
pre-changeover month came from, because no plausibility band can tell two
plausible rates apart.

**The splice carries no volume behind it**, unlike `A2C`'s:
`M.BG.B.A2A.A.B.A.2240.{BGN,EUR}.N` is a 404 on both legs, since BG reports
new-business volume by loan-size bucket and never at the all-sizes total. What
stands in is `AMOUNT_CAT=2`, «Up to and including EUR 0.25 million» — the
bucket an ordinary company borrows in — whose euro volume steps up an order of
magnitude at the changeover while the lev leg simply ends.

## «New business» is not «new lending»

This is the claim the whole mortgage headline rests on. БНБ's методологически
бележки (`s_irs_meth_historical_data_bg.pdf`), read **2026-08-13**:

> Нов бизнес – всяко ново споразумение между клиента и отчетната единица. Нови
> споразумения са договори, които за първи път определят лихвения процент,
> сроковете и условията по депозита, репо-сделката или кредита. Ново
> споразумение е и всяко предоговаряне на лихвения процент, сроковете и/или
> други условия по вече съществуващ договор …

and on the volumes: «Обемът по нов бизнес по предоговорени кредити и кредити за
рефинансиране се включва в общия обем на новия бизнес». The Manual §5.4.2 gives
the purpose of the separate renegotiated series: «to have a measure of "pure new
loans" … distinguishing these from renegotiated loans where, by definition, no
new money is arriving on the credit market». So «лихвата по нови жилищни
кредити» describes a population including a household that bought nothing and
merely re-cut the loan it had, and every surface naming the figure has to leave
room for them.

**Two claims that came out TRUE, and neither was safe to assume**, because the
Regulation permits the other answer in both:

- **Every bank, not a sample.** MIR allows an NCB to sample and gross up (Manual
  §12.2–12.5). БНБ do not: «Отчетни единици са всички банки в Република
  България, в т.ч. клоновете на чуждестранни банки.» So "across every bank in
  Bulgaria" is exact rather than approximate.
- **Volume-weighted, and by which volumes.** «Те са среднопретеглени съответно с
  обемите по нов бизнес през отчетния период или със салдата към края на
  отчетния период.» Two different weights, which is part of why the two tiers may
  never be averaged together.

## What the APRC covers, and the two things it does not

ЕЦБ Manual §4.4.1, read **2026-08-13**:

> On the costs that have to be included, the Directives mention expressly the
> following: interest, commissions, taxes and any other kind of fees which the
> consumer is required to pay in connection with the credit agreement and which
> are known to the creditor, **except for notarial costs**; costs in respect of
> ancillary services … are also included if … compulsory in order to obtain the
> credit; the cost of valuation of property where such valuation is necessary to
> obtain the credit, but **excluding registration fees for the transfer of
> ownership of the immovable property**.

БНБ state the same test in one line — «всички такси, комисиони и други разходи за
сметка на клиента, извършването на които е условие за отпускането на кредита» —
and add that the ГПР «се изчислява само за кредити за потребление и за жилищни
кредити», which is why only these two instrument categories carry a `C` series at
all. So the ГПР is the total cost of the **credit** and not of the purchase, and
«с всички такси» is a promise it does not keep. §4.4.3 notes that «the
composition of the fees to be taken into account in the APRC may differ across
countries», so the Bulgarian set cannot be enumerated here from anything either
publisher has written. The boundary above is what can be stated, and it is what
[`math.md`](../math.md) §"The payment is the annuity and nothing else" reasons
from.

## CBD2 — the household NPL ratio, and why the headline one is not it

**CBD2 is not MIR.** 16 key dimensions rather than 10, so a wildcard 404s until
the DSD has been read: `datastructure/ECB/ECB_CBD2` gives the order,
`CBD2_KEY_DIMS` pins it, and `_parse_sdmx_series` runs the same two identity
guards over it as over MIR.

`CB_ITEM=I3632` is «Gross non-performing loans and advances [% of total gross
loans and advances]», quarterly, and `BS_COUNT_SECTOR` is what makes it worth the
connector: **`S1M` households and NPISH · `S11` non-financial corporations · `_Z`
every counterparty.** A portfolio-wide ratio is read as the household one and is
not: corporates have run above households in all 25 published quarters (4.74%
against 2.37% at 2026-Q1), so most of the portfolio-wide denominator is the half
with the higher ratio.

**`CB_REP_SECTOR=67` and not `11`, and the choice moves the number by 1.6 pp.**
11 is domestic banking groups and stand-alone banks ALONE, and BG's banking
system is majority foreign-owned, so 11 reports 3.97% for the same households at
2026-Q1 because it is looking at a minority of their loans. 67 adds the
foreign-controlled subsidiaries and branches — every bank a Bulgarian actually
borrows from. `non_performing.reporting_population` says which is published.

**What is NOT claimed: that households sit below the whole-portfolio figure.**
They do at 2026-Q1 and did not before 2024 — the all-counterparty denominator
carries central-bank balances that default on nothing — so the gate asserts only
the corporates-above-households ordering and no copy may go further.

**БНБ's own «Банките в България» ratio is a different measure**, on a different
denominator, quarterly in a PDF. It is not reconciled here and must not be
presented as the same figure. Publishing CBD2 is what made parsing a 1.8 MB
supervisory PDF for one cell unnecessary.
