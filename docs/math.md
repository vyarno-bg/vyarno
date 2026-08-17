# Math — where every published number comes from

The precise provenance contract. For the plain-language version, read
[`how-it-works.md`](./how-it-works.md).

## Invariants that must never break

Each one, if broken, silently ships a wrong number to someone making a real
decision.

1. **One index base per observation, and it is Eurostat's.** `index_by_year`
   and `latest_index` carry the values `prc_hicp_minr` returns at `INDEX_UNIT`,
   unscaled, because the SPA computes since-anchor cumulatives as
   `latest_index / index_by_year[anchor] − 1` and the numerator and denominator
   must share a base. Nothing rescales either one, so nothing can rescale one
   and not the other. **Trap:** the 12-month rate is base-invariant, so it
   stays correct even when the base is wrong — a since-year figure is the only
   thing on the page that would show the damage. Check one against the row's
   own verify link, which returns the published digits.

   `categories[*].value` is on that base too, and it is the field the trap
   above cannot catch at all: the SPA reads it nowhere, so no figure on screen
   moves however wrong it is. It names the newest completed December, which is
   the reading `index_by_year` already carries under its newest year key, so
   the two must be equal to the digit — and a contract test asserts that,
   because nothing else would notice.

   Rescaling is a standing temptation, because a round 100 at the anchor year
   reads better in a payload. It buys nothing: every figure built from these is
   a ratio of two of them, so the factor cancels. And it costs the provenance —
   a scaled level is a modified figure under Eurostat's copyright notice, owing
   a disclaimer at every number, while the verify link starts returning digits
   that do not match the payload.

2. **Rates are verbatim from Eurostat, never derived from the index.**
   `annual_rate_pct` is taken as published (`prc_hicp_minr`, unit=RCH_A).
   Deriving it as `index[Y]/index[Y−1] − 1` uses the same formula Eurostat
   does but lands 0.1–0.3 pp away, because their published index is
   2-decimal-rounded while their published rate comes from an unrounded
   internal one. On a calculator that gap is visible.

3. **Weight, rate, index, label and verify link describe the SAME Eurostat
   bucket on the SAME classification version.** All three HICP series come from
   ECOICOP ver.2 cubes keyed by `coicop18` (`prc_hicp_minr` for rate and index,
   `prc_hicp_iw` for weights). Never join two HICP cubes by raw CP code without
   checking that both give the code the same label — the
   classification-agreement gate does exactly that before anything is written.

4. **`index_by_year` contains only completed (December-published) years.** The
   current partial year is dropped entirely (`rows_to_yearly_index`). A
   calendar-year key must mean end-of-year, or every anchor comparison shifts
   by up to eleven months.

5. **Weights are pulled live every run, never hardcoded.** Eurostat rebalances
   the basket every January.

6. **Real and cumulative change is always a ratio, never a subtraction.** Real
   wage = `(1+raise)/(1+π) − 1`; multi-year price change =
   `idx[now]/idx[year] − 1`.

## Per-field provenance

All HICP rate and index fields come from one live cube, `prc_hicp_minr`
(ECOICOP ver.2), which carries both the rate (unit=RCH_A) and the index
(unit=I15). Weights come from `prc_hicp_iw`, keyed by the same `coicop18`
dimension. Divisions and groups come from the same two cubes, so a group's
fields are exactly as traceable as a division's.

| Published field | Source | Time anchor | Local transformation |
|---|---|---|---|
| `hicp_headline.json.headline_rate_pct` | `prc_hicp_minr` RCH_A (TOTAL) | latest month | none — verbatim |
| `hicp_headline.json.ref_period` | `prc_hicp_minr` RCH_A (TOTAL) | latest month | none |
| `hicp_headline.json.is_flash` | which Eurostat release the run fetched | that month | none — a fact about the release, gated against the payload's own two months |
| `hicp_headline.json.index_by_year` | `prc_hicp_minr` I15 (TOTAL) | Dec of completed years, since 2020 | none — verbatim |
| `hicp_headline.json.latest_index` | `prc_hicp_minr` I15 (TOTAL) | freshest monthly reading | none — verbatim |
| `categories[*].annual_rate_pct` | `prc_hicp_minr` RCH_A (CPnn) | latest month | none — verbatim |
| `categories[*].ref_period` | `prc_hicp_minr` RCH_A (CPnn) | latest month | none |
| `categories[*].weight_pct` | `prc_hicp_iw` (CPnn) | most recent year | per-thousand → percent (÷10) |
| `categories[*].eurostat_label` | `prc_hicp_minr` dimension label | — | none — the cube's own English name |
| `categories[*].groups[*].*` | same cubes, group code (CPnnx) | same anchors | same as the division |
| `categories[*].index_by_year` | `prc_hicp_minr` I15 (CPnn) | Dec of completed years, since 2020 | none — verbatim |
| `categories[*].value` | `prc_hicp_minr` I15 (CPnn) | year-end of the latest completed year | none — verbatim |
| `categories[*].latest_index` | `prc_hicp_minr` I15 (CPnn) | freshest monthly reading | none — verbatim |
| `categories[*].unit` / `index_base_year` | `INDEX_UNIT`'s base | — | names the base the values are on, and `api_url_index` resolves to that unit |
| `classification.*` (envelope) | constants + the weights cube's time dim | — | names the version, dimension, both datasets and the weights vintage |

Rate and index come from the same cube, and on a full release at the same
publication, so `annual_rate_pct`'s month equals `latest_index`'s month equals
the headline's month.

**Eurostat's flash release separates them, and every field above states its own
month for exactly this reason.** The all-items rate for a month is published
about two weeks before that month's index and before any division — so
`hicp_headline.json` can carry a `ref_period` a month ahead of its own
`latest_index`, with `hicp_categories.json` still wholly at the earlier month.
Both figures are Eurostat's, at the months they name; neither is estimated,
extrapolated or carried forward. Read the months, never assume them: the pair to
compare a division against is `latest_index`, and the pair to date the national
headline by is `ref_period`.

**`is_flash` is the fact rather than the evidence for it.** The two months imply
the release shape, but a renderer that infers it re-derives the rule on every
surface, and one handed a payload with no `latest_index` concludes "settled" —
which is the wrong way to be wrong about a figure the banner prints as official.
So the publisher writes what it fetched, `validate.py#validate_headline_flash`
requires the flag and the months to agree in both directions, and the site's
banner and strip card mark the estimate off the field.

Omitting `latest_index` until the full release catches up is worse, and not by a
little: the SPA's fallback rebuilds the since-2020 cumulative from the divisions
at current weights, which runs high (§"Two since-2020 cumulatives") — hundreds of
euro on a six-figure balance — and it says on the page that the official index
failed to load, which would not be true. A published figure at a stated month
beats a better-aligned month with no figure in it.

**Year-end rule.** A year appears in `index_by_year` only once its December
reading is published. Storing the latest available month under a calendar-year
key would silently mean "mid-year" instead of "end of year" and contaminate the
anchor dropdown, the cumulative-since-anchor math and the savings card.

**Freshness rule.** Each category also carries `latest_index = {time, value}` —
the freshest monthly reading. This is what "your basket is up X% since year Y"
divides by (`latest_index / index_by_year[Y] − 1`).

## Which base the index is on

Whichever base `INDEX_UNIT` is published on. `prc_hicp_minr` offers exactly two
index units — `I15` (2015=100) and `I25` (2025=100), ver.2's official base —
and no 2020 one, which is the question a reader asks first given the anchor
selector starts at 2020. The answer is that the anchor needs no base of its
own: `mirror.js#rateFor` computes `latest_index / index_by_year[anchor] − 1`,
and a ratio of two readings on one base is the same number on any base.

So the payload publishes what the cube returns, `index_base_year` names that
base, and `api_url_index` resolves to that unit — open it and the same digits
come back. Switching to `I25` moves both constants in `sources/eurostat.py` and
every published level; no ratio the site renders moves at all.

That division is the only arithmetic the site does on top of the published
index. Everything else is rendering.

## Two reconciliations

There are two ways to check that the published divisions and the published
headline describe the same basket. They are not interchangeable.

### 1. The chain identity — exact, and the real gate

HICP is an annually chain-linked Laspeyres index: the basket is re-weighted
every January and linked to the previous December. So within a year `y` this is
an identity:

```
I_total(m) / I_total(Dec, y−1)  ==  Σ_i w_i(y) · I_i(m) / I_i(Dec, y−1)
```

`validate_chain_reconciliation` allows **0.02 pp** — a little over twice the
worst deviation measured across every published month, which is Eurostat's
2-decimal index rounding and nothing else. **Never widen it.**

The worst case is a measurement, not a constant, and it has already moved under
this paragraph by enough that a tolerance set from the older reading would sit
below the real one. Re-measure it; the number to trust is the one your run
prints. Deviations cluster in a few stretches of the series, which is what
rounding on a chain-linked index looks like rather than a defect.

### 2. The basket sum — approximate, a sanity band only

```
Σ (weight_pct × annual_rate_pct) / 100   vs   headline_rate_pct
```

This is the arithmetic the SPA does for the user's own basket, so it is worth
checking, but it is **not** an identity: a 12-month window straddles December's
chain link and the official aggregate re-weights mid-flight, so it sits a
fraction of a point from the headline — a real methodological gap.
`validate_reconciliation` allows **0.5 pp**. Tightening it would fail on
correct data; the precise check is gate 2, which catches strictly more.

**The UI shows both numbers and says why.** The results card puts the user's
basket next to the average basket (Σ(w·r) at official weights); the national
strip shows Eurostat's headline, and `/how/` §инфлацията prints the two side by
side. Three shapes keep that honest:

- The sliders are seeded with the **exact** published `weight_pct`
  (`view/basket.js#officialBasketWeights`), never rounded — rounding makes the
  default basket sum to something other than 100 and puts a third figure on
  screen.
- The strip headline comes from `view/results.js#headlineRate`, which takes only
  `hicp_headline.json`, so it cannot be handed the categories and quietly
  become Σ(w·r).
- **The prose that explains the gap branches on the two months**
  (`view/results.js#monthsSplit`), because the methodological gap above is a
  SAME-MONTH figure. During Eurostat's flash the headline is a month ahead of
  every division and the two on screen are several times further apart, with
  almost all of the extra being the fortnight. Copy that names the re-weighting
  either way is true and is not the reason for what a reader is looking at, in
  the one paragraph they opened to check. Both surfaces call the same function
  rather than each comparing the two strings, so a correction cannot land on one
  and miss the other.

## Two since-2020 cumulatives, and which card gets which

The 12-month gap between the headline and Σ(w·r) is a fraction of a point. Over
the years since the anchor the same distinction compounds into whole points, and
at that size it stops being a footnote:

```
allItemsCumulativeSince2020 = latest_index / index_by_year["2020"] − 1
                              ← Eurostat's own all-items index

officialCumulativeSince2020 = Σ w_i · (latest_index_i / idx_2020_i − 1) / Σ w_i
                              ← our reconstruction, at current weights
```

Both are honest arithmetic over published figures. Only the first is a figure
Eurostat publishes: an annually re-chained index is not the same object as one
set of current weights applied across the whole span, and the fixed-weight
version runs high.

**The savings card takes the first.** `view/results.js#savingsSince2020` reads
`hicp_headline.json`'s TOTAL index and falls back to the divisions
reconstruction only if that payload has no index — returning `basis` so the
copy can say which it used. The two differ by real money on a real balance, and
the card's sentence names Eurostat, so it has to *be* Eurostat's number.

`officialCumulativeSince2020` stays, because the anchor selector legitimately
wants a basket-weighted cumulative per division. It is simply not what the
savings sentence points at, and pointing it there is the failure above.

**The base was verified against НСИ's own press release**, which is the check
that proves it rather than assuming it — a 12-month rate is base-invariant and
cannot reveal a base bug. Their published 5-year, 3-year, since-December and
month-on-month accumulated changes each reproduce from `prc_hicp_minr` I15 to
the decimal.

## The user's own basket

The personal number is the same weighted average with two refinements
(`mirror.js`):

```
π = Σ (a_i / Σa) × R_i
```

- `a_i` is what the user entered for division `i` — a percentage share or a
  €/month amount. Both normalise by Σa, which is why the input-mode toggle
  cannot move the number.
- `R_i` is the division's effective rate: its own published rate `r_i` while
  untouched, and `Σ_g (s_g / Σs) × r_g` over its groups once the user splits it.

Untouched means the *published division rate*, not a recombination of its groups
at the official split — those differ slightly by the same chain-link effect, so
using the published rate is what makes "open a division to look inside" a no-op
on the user's number.

**Contributions** are the exact decomposition the ranked view renders:

```
c_i = (a_i / Σa) × R_i        and       Σ c_i = π   exactly
```

The per-row € figure is priced off that row's own spend: spending `X` on
something that rose `r%` means the same goods cost `X/(1+r/100)` a year ago, so
the rise costs `X · r/(100+r)` a month. Those do **not** sum to the whole-basket
€ figure (`extraPerMonth` answers a different question with one blended rate),
so the UI never totals the column.

**What `a_i` is a share of, and what the whole-basket € figure is charged on.**
`π` normalises by `Σa`, so it does not care whether the basket is in percent or
in euro. The **€ figures do** care, and they are carved out of
`view/spend.js#basketBudget`'s `spendBase`:

```
spendBase = spendable × s/100            in share mode  (s = the stated share, default 100)
spendBase = Σa                           in euro mode   (the euros actually typed)
exposed   = housingCost + spendBase      what extraPerMonth is charged on
```

Both modes let a reader say they do not spend everything, and they differ in who
measures it. A list of euros carries its own size, so the remainder is
**measured**: `spendable − Σa`, and a reader who spends €1,000 of a €1,250 budget
must not be shown their basket scaled up by 25% to fill it. Percentage shares
carry no size at all — they say how a pot divides, never how big it is — so the
remainder has to be **stated**: `s` is the reader's own claim about how much of
`spendable` gets spent. Only one of the two is live at a time; the euro mode
ignores `s`, and the control that sets it is not rendered there, so the page
never carries two answers to the same question.

`s` defaults to **100** and the parameter is optional, which is the same rule
twice. Any other default shrinks the reader's headline € figure without their
having claimed anything, and that is a flattering default rather than merely an
unsourced one (`docs/principles.md` P7); a national household savings rate would
be sourced and still wrong, being a different household's answer. At `s = 100`,
`exposed` reduces to `salary` exactly — `spendBase` is `salary − housingCost`
there — so the headline "≈ €X more every month" is unchanged for anyone who has
not said otherwise, and is smaller, and truer, only for someone who has.

`s` moves no percentage. It scales the pot, not the division of it, so `π`,
every row's share and every contribution in percentage points are identical
before and after — which is what keeps the toggle and the control both safe to
touch. Housing stays inside `exposed`: rent and a mortgage payment are spending,
carved out of the *basket* column so the thirteen divisions describe what is
left, not because they sit outside the outlay.

## Mortgage math

Three ordinary formulas in `mirror.js`. What matters is which rate goes in and
which limits bound them — both are data, not constants.

```
m = ratePct / 100 / 12 ;  n = years × 12
annuityPayment(loan, ratePct, years) = loan × m / (1 − (1 + m)^−n)
annuityReverse(payment, ratePct, years) = payment × (1 − (1 + m)^−n) / m
homeYears(price, salary) = price / (salary × 12)      # net monthly pay
```

### Which rate goes into the annuity

The **rate excluding charges** from `new_business.value_pct` — `DATA_TYPE_MIR=R`
on the ЕЦБ's new-business key, over the home-loan agreements Bulgarian banks
signed last month.

**"New business" is wider than "new loan", and the annuity is fed the wider
figure.** БНБ's методологически бележки for лихвена статистика, read
**2026-08-13**: «Нов бизнес – всяко ново споразумение между клиента и отчетната
единица … Ново споразумение е и всяко предоговаряне на лихвения процент,
сроковете и/или други условия по вече съществуващ договор, когато възможността
за такова предоговаряне не е заложена в него». So a household renegotiating the
mortgage it already has is inside this average alongside one buying a first
home, and the ЕЦБ keep a separate renegotiated-amounts series precisely because
new agreements and fresh lending are not the same population. Nothing about the
formula changes; what changes is what may be said about the input, and `/how/`
says it.

**It is not established that this is the AAR**, and the payload no longer claims
it is. The ЕЦБ's own codelist names `R` «Annualised agreed rate (AAR) /
Narrowly defined effective rate (NDER)» — one code, two concepts — and Reg (EU)
1072/2013 lets each national central bank choose: «Instead of the annualised
agreed rate, NCBs may require their reporting agents to implement the narrowly
defined effective rate (NDER) for all or some deposit or loan instruments»
(ЕЦБ, *Manual on MFI interest rate statistics*, January 2017, §4.2.2, read
2026-08-13). БНБ describe theirs only as «ефективни годишни проценти», a phrase
the same manual calls ambiguous by name. Both concepts annualise and both
exclude charges, so the annuity is fed the right KIND of rate either way — which
of the two Bulgaria reports is unsettled, and no publisher has written it down.

**Not the APRC.** The APRC (`new_business.aprc.value_pct`) sits above the
charge-free rate because it folds charges into an annualised figure; feeding it
into the annuity compounds them monthly as if they were interest and overstates
the payment. **APRC is for comparing, the charge-free rate is for computing.**

**Not the outstanding-stock rate either.** `mortgage.json` carries a third
figure — the БНБ rate on the existing housing book — which is published, gated
and cross-checked but not rendered. New business, outstanding stock and total
cost of credit answer three different questions, and the UI must never let them
blur. Each of the three is the question its publisher says it is; what the round
that checked them moved was the description of the first and the third, never
which formula they feed.

### The loan is bounded by regulation

```
loan           = price × (1 − minDownPaymentPct / 100)
maxAffordLoan  = annuityReverse(net × prudentDstiPct / 100, rate, term)
maxAffordPrice = maxAffordLoan / (1 − minDownPaymentPct / 100)
```

All three inputs come from `mortgage.json → lending_limits`:

| Input | Where it comes from |
|---|---|
| `minDownPaymentPct` | `100 − ltv_max_pct`; БНБ cap the loan-to-value on origination |
| `term` max | `maturity_max_years`; БНБ cap the maturity |
| `prudentDstiPct` | `prudent_dsti_pct` — **30% of net**, our line, stricter than the DSTI-O ceiling БНБ permit |

So the down payment is the smallest a BG bank may legally lend against, and the
term input is clamped because a longer mortgage cannot be originated in
Bulgaria.

### The affordability line is deliberately unflattering

DSTI-O is debt service over monthly net income. We draw the line at **30% of
net** and show it beside both published figures — the ceiling БНБ permit
(`dsti_max_pct`) and the average BG borrowers actually carry
(`observed_weighted_avg_dsti_pct`) — because a payment a bank will approve is
not a payment that leaves room to live.
`test_mortgage.py::test_our_guidance_line_is_stricter_than_the_regulator_and_the_market`
asserts that ordering: our line below the observed average, below the cap.

**The payment is the annuity and nothing else**, which is what the share of net
is computed on. Part of what the ГПР folds in beside it is one-off — the valuation,
arrangement — and part runs monthly alongside the instalment: property insurance
is mandatory on a mortgaged home, life cover is often required or required for
the advertised rate, and the account the instalment is collected from usually
carries a fee. So a reader's real monthly outgoing sits above this line. It is
not added here because nobody publishes a figure for it that this project could
cite, and inventing a plausible one is the failure the whole repository is built
against — but the share on screen is a floor rather than the whole of it, and
the copy says so.

**The ГПР is a floor as well, and the boundary is drawn by law rather than by
what a buyer pays out.** The ЕЦБ's MIR manual §4.4.1, read **2026-08-13**, lists
what the two Directives defining the figure take in and leave out:

> On the costs that have to be included, the Directives mention expressly the
> following: interest, commissions, taxes and any other kind of fees which the
> consumer is required to pay in connection with the credit agreement and which
> are known to the creditor, **except for notarial costs**; costs in respect of
> ancillary services relating to the credit agreement, in particular insurance
> premiums, are also included if, in addition, the conclusion of a service
> contract is compulsory in order to obtain the credit …; the cost of valuation
> of property where such valuation is necessary to obtain the credit, but
> **excluding registration fees for the transfer of ownership of the immovable
> property**.

A Bulgarian buyer pays a notary and pays to register the transfer, and neither
is in the ГПР. Two constraints on the copy follow. The insurance and the account
fee belong in it only where the bank requires them in order to lend — «всички
такси, комисиони и други разходи за сметка на клиента, извършването на които е
условие за отпускането на кредита», in БНБ's own words — so a sentence putting
them inside unconditionally overstates the indicator. And no caption may promise
every fee: the sub-caption under the rate field names **the loan's** charges,
because the notary's is a fee the buyer pays and is not one of them. The same
manual adds that «the composition of the fees to be taken into account in the
APRC may differ across countries», so the set is not one this project can
enumerate for Bulgaria from anything either publisher has written.

БНБ's DSTI-O is debt service too, so those costs sit outside the regulator's
ratio as well and the comparison against their ceiling is like for like. The gap
is between the ratio and the reader's month, not inside the ratio.

## What households owe — three pieces of arithmetic over БНБ's cells

Every euro amount on `/credit/` is a cell БНБ published, with three exceptions.
All three are stated in the payload, which is what
[`legal.md`](./legal.md) §БНБ requires of a derivation from that publisher.

```
total_eur_m       = consumer + housing + other + overdraft
overdraft_ex_cc   = overdraft − cards                                  (amount)
                  = (overdraft×r_overdraft − cards×r_cards) / (overdraft − cards)
blended_stock_pct = Σ(volume_i × rate_i) / Σ(volume_i)                 (gate only)
```

**The total adds the overdraft block WHOLE**, and that is the trap in this
workbook: БНБ nest «в т.ч. кредитни карти» inside «Овърдрафт», so adding the card
figure as a fifth term double-counts it. Every addend ships beside the total in
`outstanding.blocks`, so a reader can take the sum apart.

**The subtraction exists because the two publishers draw one boundary
differently.** ЕЦБ `A2Z1` «revolving loans and overdrafts» excludes card credit;
БНБ's «Овърдрафт» includes it. The page already showed the ЕЦБ's 6.45%, so the
amount beside it has to be the block less its card sub-block, and the rate is a
volume-weighted removal rather than a difference of rates. **What proves the
subtraction happened is that the rate it leaves is the one the ЕЦБ publish** —
€205 m at 6.46% looks no more right than €695 m at 13.2%, so the gate is the
evidence and not the arithmetic.

**The blend never reaches the page.** `outstanding.rate_pct` is the ЕЦБ's own
`A20`, so the amount is БНБ's and the rate beside it is a publisher's. The blend
is a gate's working: four amounts and four rates must reproduce a figure the ЕЦБ
publish independently, which is the only check here that can catch a wrong euro
amount — transposing two volumes leaves eight believable numbers and moves the
blend by almost a full point.

**A ratio is not a rate, and the NPL figures are ratios of two stocks the ЕЦБ
publish already divided.** Nothing here computes them; `I3632` is
`gross non-performing / total gross loans and advances` at the counterparty scope
asked for, and the only decision is which scope — `docs/data-sources.md` §CBD2.

## Gross ↔ net (BG payroll)

The salary field collects **net** take-home, because that is the number on the
payslip. Everything that compares the user against a published wage needs the
**gross**, so the SPA inverts. Parameters come from `payroll.json`; the maths is
`mirror.js`.

Forward (`bgNetSalary`), for gross *G*, employee contribution rate *R*
(`employee_contrib_rates.total`), flat tax *T* (`income_tax_rate`) and insurance
ceiling *C* (`max_insurable_income_eur`) — all three read from the payload every
run, because a rate or a ceiling written into this file goes stale one statute
later while the prose around it goes on reading as though it were checked:

```
insurance = min(G, C) × R          ← the CEILING applies here
taxable   = G − insurance
tax       = taxable × T            ← and NOT here: the tax base is uncapped
net       = G − insurance − tax
```

### The inverse is piecewise, and that is where calculators go wrong

Because the ceiling caps insurance but not tax, the inverse has two branches:

```
G ≤ C:   G = net / (1 − R − T(1 − R))
G > C:   G = (net + C·R·(1 − T)) / (1 − T)
```

`bgGrossFromNet` computes both and keeps the one that **round-trips**: feed it
back through `bgNetSalary` and it must return the net that was asked for. That
check is the whole safeguard, and it is cheap.

Taking the first branch unconditionally is a real, shipped defect in this
class of calculator, not a hypothetical one. It is the branch that reads as
obviously correct, and it *is* correct up to the ceiling; past it the insurance
stops growing while the formula keeps assuming it does, so the gross it reports
is too high by the contributions nobody owes. The tell is visible without
knowing which answer is right: run that gross back through `bgNetSalary` and it
pays more than the net asked for, so the deduction column printed under it does
not add up.

The error is one-directional, grows with salary, and appears only once the
gross clears the ceiling — which is the band where nobody re-checks, because
the figure still looks like a salary. That is why the guard is a **property**
rather than a comparison: `verify_net_salary.mjs::net→gross satisfies its own
breakdown` asserts that whatever gross we report for a target net pays that net
once every deduction comes off, sampled across the ceiling. It needs no second
opinion to be checkable, and it does not go stale when a ceiling moves.

### The itemised view has to add up

`bgPayrollBreakdown` renders the same arithmetic line by line, in cents. Two
rules make it checkable rather than decorative:

1. **Each total is computed from the rounded figures above it**, not from full
   precision, so the column a reader adds up by hand is the column that
   balances.
2. **The fund lines are allocated by largest remainder**, so they sum exactly to
   the contributions total. Rounding each line on its own does not: a fund whose
   cents fall just under the rounding point loses its remainder and nothing
   gives it back, leaving the lines a cent short of the total stated above them.
   It happens at a large minority of the grosses in the range, so a handful of
   round salaries will not surface it and the test sweeps.

`bgPayslipFromNet` additionally tries both cents either side of the inverted
gross and keeps the one that reproduces the typed net — the exact inverse
rarely lands on a whole cent, and rounding it the obvious way works out a cent
off.

**Full precision is still what everything else uses.** `bgNetSalary` is
unrounded and remains the input to every comparison (the област comparator, the
net ladder, the wedge); the breakdown is a display layer over it, and
`verify_net_salary.mjs` asserts the two never differ by more than display
rounding.

### A household is several contracts, and the ceiling belongs to each of them

The insurance ceiling caps one contract's contribution base. It is not a
household allowance, so a household's gross is the sum of its earners' grosses
and never the inverse of their combined net.

Inverting the combined net as one salary applies one ceiling to two people, and
lands the household's gross low by hundreds of euro a month once either earner
clears it. Nothing about the wrong figure looks wrong — it sits inside every
plausible band — and the error grows with the household.

So `mirror.js#bgHouseholdPayroll` is the only entry point for more than one
income: it maps `bgPayslipFromNet` over the earners and adds the columns
afterwards. The household totals are sums of already-rounded cent figures, so
`gross − totalDeductions === net` holds for the household exactly as it holds
for each person in it, and the household's effective rate is total deductions
over total gross — **pay-weighted, not the average of the per-earner rates**,
which differ by whole points once anyone clears the ceiling.

**Which figures are per person and which are per household** follows from what
the figure is about, and the split is enforced by the argument shapes rather
than by review:

| Per person — the function takes a LIST | Per household — the function takes the total |
|---|---|
| the payslip and the gross (`payslipPanel`) | the basket and what it costs (`housingCarveOut`, `exposedSpend`) |
| the position on the net ladder (`earnerRanks`) | rent as a share of take-home (`rentBurden`) |
| the comparison with НСИ's област average (`regionGap`) | the mortgage payment, the 30% line, years-to-a-home (`mortgagePanel`, `homeYears`) |
| each point on the tax-wedge curve (`taxWedgePanel`) | the real-pay verdict in euro (`pocketPerMonth`) |

The left column takes `nets` and has no scalar parameter, so a caller holding
only the household total cannot express the mistake. The rule behind the split:
a **person** is what НСИ's wage, Eurostat's earnings ladder and the insurance
ceiling are all measured on; **money** is what arrives and gets spent, and rent
does not care who earned it.

### The reader may type either side, and it converts in exactly one place

The payslip states a net and the contract states a gross. Which one a reader
knows is not something to guess at, so the pay field takes both and
`view/payroll.js#netsOf` is the **only** place one becomes the other. Everything below
it — the basket, rent as a share of pay, the 30%-of-net mortgage line, the
position on the earnings ladder — is a statement about take-home, and each is
wrong by the whole deduction wedge when fed a gross. The mortgage one is wrong
in the direction that calls a home affordable, which `AGENTS.md` forbids in as
many words.

The amounts travel inside a `pay` object carrying `{ basis, amounts }`, so an
amount cannot reach a function without saying what it is. In gross mode the
payslip is computed **forwards** (`bgPayrollBreakdown`) rather than round-tripped
through the inverse, so the contract figure the reader typed appears in the
breakdown unchanged.

Flipping the toggle **converts in place**: the figure in the box changes and no
result on the page moves — the contract the basket's %/€ toggle already keeps.
What the reader typed in the outgoing basis is stashed, because the round trip
is lossy by a cent in the general case and a salary that creeps while nobody
edits it is its own kind of wrong.

### A household's raise is weighted by what they were paid BEFORE

Each income carries its own raise, and the household's figure is
`Σ net_now / Σ net_before − 1` — not the average of the rates. Take two earners
on the same pay today, one of whom got a rise and one nothing: the plain average
of the two rates comes out above the household's real rise, because the earner
who got the rise is the one whose *current* pay is inflated by it. The
overstatement always flatters.

In gross mode the before-and-after are converted to net **separately**, so a
10% rise on a contract that clears the ceiling is correctly worth more than 10%
in the pocket — contributions stop but the pay does not.

`householdNetRaisePct` returns **NaN unless every earner with pay has stated a
raise**, and the guard runs before the numeric coercion: `null`, `undefined`
and `""` all coerce to 0, and 0 is a legitimate answer («нямаше увеличение»).
A blank read as "no raise" is an invented number (P7) that drags the household's
figure down. The row names the missing income instead of answering around it.

### The labour tax wedge, and the denominator that is the whole point

Two figures, the same euros, and they are not interchangeable:

```
employee side   (gross − net) / gross                       = 22.402 %
labour wedge    (labour cost − net) / labour cost           = 34.748 %
  labour cost = gross + employer contributions
  net         = gross − employee contributions − income tax
```

**The definition implemented is OECD/EC's**, stated because more than one is
defensible: the wedge is every compulsory levy on employing a person, **the flat
10% included**. Leaving the tax out would answer a narrower question — what do
the contributions take — under a name that means the wider one.

**Neither figure may appear without its base named in the same sentence.** They
differ by twelve points, both are true, and a reader who takes 34.7% for a share
of their gross concludes their payslip is wrong. This is the rule §"Which rate
goes into the annuity" applies to the three mortgage rates, and the reason
`/how/` draws two charts rather than one with a toggle: `WedgeChart` is a share
of gross, `LabourCostChart` a share of labour cost, each names its denominator
in its own key, and they may share the €2300 rule and nothing else.

**Both sides stop at the same ceiling.** КСО чл. 6, ал. 3 puts contributions on
no more than the maximum insurable income and only THEN splits them between
осигурител and осигурено лице — one capped base, divided afterwards — while
чл. 157, ал. 6 and ЗЗО чл. 40, ал. 1, т. 1 put ДЗПО and health on that same
base. Capping only the employee's half would hold the wedge near 35% at every
salary and make the entire shape above €2300 wrong. At €6000 the employer pays
18.92% of €2300, not of €6000: €435.16, and the wedge is 20.5%.

**ТЗПБ makes the answer a range, and the range is what ships.** The
work-accident contribution is employer-only and set per economic activity
(0.4%–1.1%, ЗБДОО's Приложение № 2А), so the wedge below the ceiling runs
34.748% to 35.130%. Ten of the nineteen НСИ sections span several rates —
«Преработваща промишленост» covers 0.5% to 1.1% — so a sector resolves to
`{min, max}` and never to a representative rate. `bgLabourWedge` evaluates both
ends and offers no midpoint, because a midpoint is a rate no statute sets, for
a sector nobody is in. Where a section resolves to one rate the two ends are
equal and the copy states one figure.

**The three bands are a partition, not three measurements.** `bgLabourCost`
returns `netSharePct + employeeSharePct + employerSharePct`, and they sum to 100
by construction rather than by three roundings agreeing — which is what lets the
stacked chart claim the wedge IS the top two bands.

## HICP vs the national CPI

Bulgaria has two official inflation gauges:

- **HICP** (ХИПЦ) — the EU-harmonised index Eurostat publishes
  (`prc_hicp_minr`). This is what vyarno.bg shows, everywhere.
- **National CPI** (ИПЦ) — НСИ's domestic index, on a different basket, with a
  different treatment of owner-occupied housing, covering resident households
  only.

The two land a little apart at the headline and further apart in some divisions
— a genuine methodological difference, not an error, and one that leaves the
*ranking* of the divisions broadly agreeing.

**We keep one headline number.** A second competing figure confuses; instead
the in-app explainer says in plain language why НСИ's number can differ. We do
not fetch or publish the national CPI.

## A sector average, and why the card says what an average is

`view/payroll.js#sectorComparison` feeds `mirror.js#wageGap(net, sectorNet)` — the reader's
take-home against НСИ's published average for the NACE Rev 2 section they
picked, both net, `(net − ref) / ref` rounded to whole percent. Nothing else.

**A rank is not available at that granularity and never will be from the current
upstreams.** Probed 2026-08-06: `earn_ses_monthly` carries BG at no NACE section
at all; `nace_r2=J` returns an empty `value` map over a `nace_r2` dimension of
size 0, and the categories the cube does carry for BG are broad groupings, of
which only the whole-economy one is populated
([`data-sources.md`](./data-sources.md) §"gross wage by economic activity" has
the probes). So the site can report a distance from an average and cannot report
a position in a distribution.

**The average and the middle are not close, and the difference runs against the
reader.** Earnings are right-skewed, so an average sits well above the middle.
Read off the published SES shape in `salary_dist.json`:

| | Field | Standing |
|---|---|---|
| SES mean | `shape.ses_mean` | published |
| SES median | `shape.ladder_ses.P50` | published |
| median ÷ mean | `meanRungPosition#medianPct` | inputs are Eurostat's, **the division is ours** — the card shows both published figures and attributes the ratio to us |
| the mean's own rung | `meanRungPosition#cut` | **modelled** — see below |

So someone well below their sector's average may still be paid more than most
people in it, and a card reporting only the gap would tell them the opposite.

**The two figures are not equally solid, and the copy must not say them in one
voice.** Eurostat publish D1, the median and D9 for BG and nothing between, so
`SES_SURVEYED_CUTS` is `[10, 50, 90]`. The mean falls between two rungs that are
**both interpolated**, piecewise-lognormal in the normal quantile. So the mean
against the median is two published numbers, and "the average sits near the Nth
rung" is read off modelled ones.

**The card states the skew in words and puts no level on screen.** A reader is
told that the average sits above the middle and why — half of employees earn
less than the median — without a second figure beside it to do arithmetic with.
The rung is computed and the copy attributes it to us. The median-to-mean ratio makes the same point one
step further from the evidence, and stating both put two of our own percentages
in a four-line caveat that a reader has to hold at once. Two published levels
are easier to check than a ratio between them and easier to read than either.
`COPY.sectorAverageFlatters` attributes the rung to us and dates the survey, and
`verify_copy.mjs` §"the calibration states the skew in words and puts no level on
screen" fails if either goes.

What the modelling can and cannot move: a different interpolation between the
published median and D9 shifts the rung by a few points, and cannot put the mean
below the median — that ordering follows from the two published figures alone.
The claim the card rests on is "an average is above the middle", which is
measured; the exact rung is the illustration.

**`mirror.js#meanRungPosition` publishes that correction, and it is exactly
scale-invariant.** Re-levelling multiplies every rung and the mean by one
factor, so the mean's rung is a property of the shape rather than of any
particular average — one rung across every anchor `verify_mirror_math.mjs`
sweeps. It reads Eurostat's ladder alone, so no НСИ figure and no payroll
parameter enters it.

**It takes no anchor, and that is deliberate.** Handed a sector average it would
return a sector percentile — the figure the paragraph above says nobody
publishes. There is no parameter to attempt it through, which is the same device
`headlineRate` uses to stay unable to become Σ(w·r). Do not add one, and do not
multiply a sector average by the national median-to-mean ratio to produce a
sector median: sector dispersions differ from the national one and nothing
published says by how much.

## The property market

Four figures on `/market/`, and the provenance rule they exist under: **a figure
we computed says so, states the arithmetic in words, and links the query that
returns its inputs.** The page's readers are the ones most likely to disbelieve
it, which is exactly why nothing there rests on being trusted.

**Every figure carries two links, and the second one is not a convenience.**
Eurostat's databrowser opens a dataset with all of its units at once —
`prc_hpi_hsnq` carries a count, two indices and three rates — so a reader
following the table link under the dwellings-sold figure lands on a view whose
default cell is that dataset's quarter-on-quarter rate for the same country and
quarter. One click from the page's argument to a figure that appears to
contradict it. Deep-linking the unit would mean pinning a URL shape Eurostat do
not document, so the answer is the `api_url` the payload already carries: it
returns that figure and nothing else.

### The average dwelling transaction

```
avg_deal_eur[q] = value[q] / deals[q]
```

Both sides are Eurostat's own published quarterly figures for the same quarter,
from `prc_hpi_hsvq` and `prc_hpi_hsnq`. Computed **per purchase type** as well
as in total, so new builds and existing dwellings can be read apart.

**A quotient of two published series is only a mean if the two describe one
population, and no gate here can see whether they do.** `validate_house_market`
proves the division reproduces; it would prove exactly as much over two cubes
about different things. What settles it is the publishers' own scope statements,
which are prose and are therefore read and dated rather than checked:

- Eurostat, `prc_hpi_inx_esms` §3.4, read 2026-08-13 — «The number **and** value
  of house sales cover dwellings transacted at national level where the
  purchaser is a household», and «The house sales value reflects the prices paid
  by household buyers and include both the price of land and the price of the
  structure of the dwelling. The prices for new dwellings include VAT. Other
  costs related to the acquisition of the dwelling (e.g. notary fees,
  registration fees, real estate agency commission, bank fees) are excluded.»
- НСИ, ППЖ metadata, read 2026-08-13 — the two are compiled from one pass over
  one register: «стойност на продажбите – измерена като общата сума на
  стойността на всички жилищни продажби в рамките на тримесечието; брой сключени
  сделки - измерва се чрез броя на всички жилищни продажби в рамките на
  тримесечието».

So the quotient is the mean price paid per dwelling sale, land included, VAT
included on new builds, and the buyer's own purchase costs excluded — which is
why the page calls it what a home costs rather than what buying one costs. Both
scope reads are in [`data-sources.md`](./data-sources.md) §"The property cubes"
with their URLs.

Published in `house_market.json` rather than derived in the browser, and that is
the one derivation on the page that is: both inputs are one publisher's, so the
file stays one publisher's data, and a published figure is one a **gate** can
check. `validate_house_market` re-derives every quarter of it from the two
published series and refuses a payload where the division does not reproduce —
an average built from a different quarter's denominator is arithmetically fine,
internally consistent, and wrong in a way no plausibility band would catch.

Eurostat permit derivation on condition it is stated clearly to the end user, so
the envelope carries a modification notice and their non-responsibility clause,
and `derived_from_api_urls` carries the two queries that reproduce it.

**It is a mean, not a median, and not a price per square metre.** A quarter's
mix of flats and houses moves it, which the payload's `method` says and the page
repeats.

### Deals against the same quarter a year earlier

```
change_pct = (deals[q] − deals[q−4 quarters]) / deals[q−4 quarters] × 100
```

Year-on-year rather than quarter-on-quarter, and not for presentation: property
transactions have a strong seasonal shape, so a fall from Q3 to Q4 measures the
calendar. The year-ago quarter is found by **label arithmetic** on the period
string rather than by stepping back four entries in the series — a gap in the
data then yields null and renders nothing, instead of silently comparing against
a neighbouring quarter.

Computed per purchase type as well as in total, for the reason the average deal
is: new builds and existing dwellings move differently in volume, and one
year-on-year figure for the total leaves the table's other two rows reading as
though they had not moved.

### The nominal index and the deflated one

`prc_hpi_q` at `I15_Q` is the house price index in current prices.
`tipsho30` at the same unit is the same index divided by the national accounts
deflator for private final consumption. **Both are Eurostat's, neither is
computed here**, and they are published together because either one alone
misleads: the nominal line and the deflated one stand in different relations to
the same pre-crisis peak, and a site whose whole subject is the gap between a
number and what it buys cannot show only the first.

The pair is drawn on one axis with nothing rescaled, which is a property the
pipeline gates rather than the page assumes: **the four quarters of the base year
each index names average to 100.** That identity is definitional, so anything
else means the cube read is not the cube named — `I15_Q` against `I25_Q` is the
same series on two bases, and the levels they put today at differ by the whole
rebasing factor.

`tipsho30` has no `purchase` dimension. Eurostat deflate the total only, so
there is no new-build/existing split to be had and nothing may imply one.

### The index said out loud

```
times      = level / base_level                     (indexTimesBase)
below_peak = (peak − latest) / peak × 100           (shortfallPct, null if not below)
```

**An index level is an economist's object and the data was never the problem.**
A raw level printed «при 100 за базовата година» asks a reader to hold three
conventions at once — that an index carries no unit, that its anchor is a year
somebody picked, and that the level is a ratio written as though it were a
quantity. Divided by the base it is defined against it becomes «×N спрямо
базовата година», which is a sentence. The chart's axis, its text alternative
and the paragraph beside it are all in multiples; **the numbers table under it
keeps the published index**, because that is the figure a sceptic checks against
Eurostat's own table.

`indexTimesBase` takes the base as a parameter and has no default. `/100` would
be right for `I15_Q` and wrong for `I25_Q` — the same measurement on a later
base — and the failure would be a plausible number rather than an error.

`shortfallPct` returns **null at or above the reference**, and that is the guard
rather than a nicety. It feeds the one comparison this page can make that
nothing else in Bulgaria publishes with sources attached — where each index
stands against the peak it fell from — and the reference is a series maximum, so
the quarter that matters is the one the latest reading becomes that maximum.
There the honest output is no sentence, not «0,0% под него» printed beside two
identical numbers.

**The base year is `price_index.base_year` and is never written into a
sentence.** Eurostat rebase, and a year typed into the chart's caption or its
text alternative survives that: the caption stays on the page, beside a chart
whose every digit is still correct, naming the wrong year. `verify_copy.mjs`
§"the market page writes no year and no quarter into its own prose" holds the
general form — every figure on that page is live, so it has no worked examples
and no period belongs in its words.

### Eurostat's flags, and why the page draws them

`status_by_period` carries the publisher's own letters at the quarters they
apply to — `b` break in series, `e` estimate, `p` provisional, `d` definition
differs. They are sparse: a quarter Eurostat did not flag has no entry, so the
presence of one means something rather than being a default to filter.

**A line drawn unbroken across a break the publisher declared is a claim they
declined to make**, on our behalf. The chart marks the break
quarters and the numbers table prints the letter per row, with a key naming only
the letters the series actually carries — a legend for a marker that is nowhere
on the chart is a question a reader cannot answer.

### The two charts, and the axis rule they are drawn under

`plotSeries` shapes every series the page draws, and **its minimum is clamped at
or below zero with no way to raise it**. That absence is the guarantee rather
than a default: a y-axis cropped to a property series' own range turns any of
them into a cliff, which is the distortion this page exists not to make, and the
way to keep it out is to leave no caller a floor to set.

The clamp is `min(0, smallest)` rather than a constant zero, because Eurostat's
annual rate has run tens of points either side of zero and a plot that dropped
its negative half would be describing a different market. What is invariant is
that **the drawn scale contains zero**, which is what makes a bar twice as tall
mean twice as much.

A plot whose figure is defined against a reference covers that reference as well
as its data: the index chart's ×1 is the base every reading on it is a multiple
of, and a scale cropped to the data alone would be missing the thing the picture
is about in the quarters the line ran below it.

`verify_render_market.mjs` measures it rather than reading the source: for every
chart on the page, the drawn distances from the zero line to the smallest and the
largest reading have to be in the same ratio as the published figures, which no
floor can survive.

Every chart on the page carries it — dwellings sold, the count's own
year-on-year change against the price rate over the quarters they share, the
index level with its deflated twin, the annual rate, the average deal split by
purchase type, and the overburden share — plus a sparkline and a two-bar
comparison per city, each of those columns on **one shared scale**, because a
column of charts each drawn to its own range is a column of pictures of the same
shape and comparing rows is the only reason to put a chart in a column.

Every chart is also published as a table inside a `<details>`. That is the WCAG
text alternative, the only way to read one quarter off a line running back two
decades, and what makes the page quotable — a `<title>` on each mark answers a
pointer and leaves out touch, the keyboard and every screen reader. A `<details>`
is a disclosure and not an input, so the rule that this page takes nothing from
the reader is untouched.

### Where today sits inside a series' own record

```
position = (latest − trough) / (peak − trough)      0 = its lowest, 1 = its highest
```

`mirror.js#rangePosition`, one row per published series in the strip under the
answer cards. **It positions and it does not score.** There is no weighting, no
total across the rows and no second series in the signature to weigh one against
— combining prices, volume, rates and cost burden into a single "market health"
figure would decide on the reader's behalf which of them is the bad news, using
credibility that belongs to Eurostat, and would produce the one number on this
site nobody could check against anything. Whose fall counts as good news depends
on whether a reader owns or is buying, and P6 is that the page does not answer
that.

**The extremes are the SERIES' own, never the drawn scale's.** `plotSeries`
floors a chart's minimum at or below zero, which is right for an axis and wrong
here: placed against zero, these rows bunch at the top of their tracks and the
strip says the same thing once per row. `peak` and `trough` are the highest and
lowest readings the publisher has actually printed.

Out of range returns null rather than clamping, because the only legitimate call
places a series' own latest against that same series' own extremes — a value
outside them means two series were crossed, and a clamp would draw that at one
end of the track looking exactly like a record. A series shorter than
`view/market.js#RANGE_MIN_POINTS`, or one that never moved, produces no row at all: an
empty cell on a strip of positions reads as a position.

**A series whose value does not read on its own does not get a row.** Every
value the strip prints stands alone — a count, a multiple, a change, a share —
so the position beside it adds a second fact rather than needing one. An index
defined against a reference the row cannot print would read as a verdict
instead: a dot at one end of a labelled line, with the level it is measured from
nowhere on it.
`verify_view_market.mjs` holds every row to one of the four units the column can
write without a reference beside it.

A row whose series only ever rises sits at its right end by construction, which
the page says out loud under the strip — it is a property of that series and not
a reading of this quarter, and the two price rows are drawn separately so the
nominal one at its record and the deflated one below its own are visibly two
different facts.

`verify_render_market.mjs` measures the drawn dot against the published series
rather than reading the attribute, so a CSS rule that offsets the box fails it.

### The unoccupied share of the dwelling stock

```
unoccupied_pct = census.unoccupied / census.total × 100
```

Derived in the browser from the two counts the census publishes, which are shown
beside it so the division is checkable by eye.

**"Unoccupied" is a residence test, not a presence test**, and the two give
different answers for the same dwelling. Eurostat's census metadata
(`cens_21_esms`, read 2026-08-13): «'Unoccupied conventional dwellings' are
conventional dwellings which are not the usual residence of any person at the
time of the census», and «Dwellings reserved for seasonal or secondary use,
vacant dwellings, as well as conventional dwellings **with persons present but
not included in the census** are classified under the category 'Unoccupied
conventional dwellings'». So second homes and holiday properties are inside the
figure — and so is a flat with somebody sleeping in it who is counted at their
own address. Copy that dates the test to the census night describes a count
nobody took.

### The average deal in years of pay

```
years = avg_deal_eur / (nsi_monthly_gross_eur × 12)
```

**The one cross-publisher figure on the page**, and the reason it is computed in
the reader's tab: the numerator is Eurostat's and the denominator is НСИ's, and
`docs/legal.md` §НСИ forbids distributing производни и сборни произведения — so
neither published file may carry the other's number. The two stay apart all the
way to the browser and meet in `mirror.js`, the same pattern the salary ladder
uses.

**Gross, not net**, and the caller has to pass a gross figure. A net wage
depends on the payroll table of the year that converted it, which would put a
third publisher's law inside a two-publisher ratio. It reads НСИ's
all-activities row, never a sector.

**The denominator is an employee's wage, and "average wage" claims more than
that.** `Labour_1.1.2.1`'s own sheet title is `AVERAGE GROSS MONTHLY WAGES AND
SALARIES OF THE EMPLOYEES UNDER LABOUR CONTRACT` (read 2026-08-13), so anybody
working for themselves is outside it — and the numerator's buyers are all
households, self-employed ones included. The ratio is still one both publishers
support; the disclosure under the card names the population rather than letting
«средна заплата» stand for everyone earning.

### The six cities: change against change

Nothing is computed. Both columns are НСИ's own published percentages — the
change in transaction PRICES and the change in the NUMBER of sales, each against
the same quarter a year earlier — selected from two of their workbooks and
joined on the city code.

**There is no level, and none can be built.** Every НСИ city series is an index
or a percentage, and their own лв./кв.м survey ran to 2014-Q2 and was
discontinued, so no publisher gives a transaction price per square metre for any
Bulgarian city. The имот.bg €/m² in the calculator are ASKING prices from
listings — a different measurement — and putting the two in one column would
invent a comparison neither publisher supports. `/market/` says so out loud,
which is P11: uncomputed, not concealed.

**The national change is on the page twice, from two publishers**, and that is
deliberate. НСИ compile the figure and Eurostat disseminate it; they agree to
the decimal, the pipeline gates them against each other, and a reader who checks
one against the other finds that out — worth more than either figure alone on a
page whose argument is that its numbers are checkable.

### Every field the page loads, and what happens to it

Every payload the page loads is below, field by field: **drawn, or not drawn
with the reason.** A field that is neither is a gap, and the way one appears is
that nobody ever wrote the list down — `nsi_housing.city_deals_yoy` carried
seventeen quarters per city for as long as the page existed and only the newest
cell of it ever reached a reader.

Envelope fields — `schema_version`, `as_of`, `source`, `payload_name`, `notes`,
`disclaimer`, `_role`, `dataset`, `unit`, `method`, `note` — are machine-facing
or feed the staleness banner, and are not listed per block below.

**`house_market.json`**

| Field | Where it goes |
|---|---|
| `deals.series_by_period.total` | the volume chart and its numbers table |
| `deals.series_by_period.{new,existing}` | the volume table's two rows, at `ref_period` |
| `value.series_by_period.{total,new,existing}` | the average-deal table's «Платено общо», at `ref_period` |
| `price_index.series_by_period.total` | the index chart as a multiple, and the numbers table as the published level |
| `price_index.annual_rate_pct.{total,new,existing}` | the rate table, all three at `rate_ref_period`; the total also as the rate chart |
| `price_index.status_by_period` | the break rules on the chart, the flag column, and the key |
| `price_index.base_year` | «×1 = колкото през {year} г.», the disclosure and the chart's text alternative |
| `price_index_real.series_by_period` | the second index line and its column |
| `price_index_real.status_by_period` | the flag key |
| `avg_deal_eur.series_by_period.{new,existing}` | the average-deal chart and its numbers table |
| `avg_deal_eur.series_by_period.total` | the average-deal table and the years-of-pay card |
| `avg_deal_eur.derived_from_api_urls` | the two disclosure links, twice |
| `ref_period`, `rate_ref_period` | every period caption in the section |

Not drawn, and why. **`value`'s forty-five quarters of total turnover**: it is
the count times the average and both of those are already plotted, so a third
chart would restate two the page has. **The index and the rate split by purchase
type as SERIES**: `tipsho30` has no purchase dimension, so a split nominal line
would have no deflated twin beside it and the pair is the point of that chart;
the split is on the page as the tables' three rows. **`avg_deal_eur` as a total
LINE**: a mean over whatever sold that quarter moves with the mix, and a line
invites the reading the mix will not support. **`avg_deal_eur.latest`**: the
same cell as `series_by_period[ref_period]`, which is the one the payload dates.

**`house_market_structure.json`**

| Field | Where it goes |
|---|---|
| `tenure.{owner,owner_with_mortgage,owner_no_mortgage,rent,rent_market_price,rent_reduced_or_free}_pct` | all six, the tenure table |
| `census_dwellings.{total,occupied,unoccupied}` | the census table; the unoccupied share is derived from two of them |
| `housing_cost_overburden.series_by_period`, `value_pct`, `ref_period` | the overburden chart, its numbers table, and the sentence above it |

Not drawn: **`tenure.total_pct`**, which is 100 by construction. The two marked
rows add to it in front of the reader, which is the check; a row reading 100.0
is the arithmetic printed rather than shown.

**`nsi_housing.json`**

| Field | Where it goes |
|---|---|
| `national_price_index_yoy.value_pct.{total,new,existing}` | the НСИ column of the rate table |
| `city_price_index_yoy.cities[].{value_pct, ref_period}` | the city table's price column, each cell dated by its own city |
| `city_price_index_yoy.cities[].series_by_period` | the six sparklines and the city price numbers table |
| `city_deals_yoy.cities[].{value_pct, ref_period}` | the city table's sales column |
| `city_deals_yoy.cities[].series_by_period` | the city sales numbers table |

Not drawn: **`national_price_index_yoy.series_by_period`**. It is the same
statistic as the rate chart, from the body that compiles it rather than the body
that disseminates it, and the pipeline gates the two against each other. Drawn
twice it would be one chart presented as two. The cross-publisher claim is made
where it is checkable — one table, two columns, same quarter.

The sales series has **no sparkline column of its own**, and that is a layout
decision rather than an omission: a fifth column puts the six-city table past a
phone's width, and `HSI_2.4.5` starts years after the price workbook, so two
sparklines per row would invite a comparison across two different windows. The
numbers table has room to state where each one begins.

**`sector_salary.json`** — the `Total` row's `value_eur` and the payload's
`ref_period` and `source_url`, for the years-of-pay card. Everything else in
that file belongs to the calculator's sector comparison.

**`hicp_categories.json`** — `CP041`'s `annual_rate_pct`, `ref_period` and
`api_url`, for the renters' sentence. Everything else is the calculator's
basket.

## What we deliberately do not do

| Idea | Why not |
|---|---|
| A salary percentile within a sector | Nobody publishes a pay distribution by economic activity for BG — the figure would be invented, not derived |
| A sector median from the national median-to-mean ratio | 0.7429 is the country's shape; applying it to a section asserts that section's dispersion, which nothing measures |
| Derive `annual_rate_pct` from the index | 0.1–0.3 pp gap from the headline; users notice |
| Pre-compute cumulative rates per anchor year | Bloats the JSON; the site computes it in O(1) |
| Cache weights at a fixed year | Eurostat rebalances annually |
| A second headline number (НСИ CPI) | One gauge per gauge; the distinction is explained in prose instead |
| Trust upstream "annual average" rates | A 12-month mean is a different concept from point-in-time YoY |
| Compute the mortgage payment from the APRC | Folds fees in as if they were monthly interest |
| Show a scraped "best offer" mortgage rate | Advertised promo from-rates with unstated conditions are marketing copy, not a statistic |

## Where the SPA does each of these

`mirror.js` holds the formulas; **which** published number goes into each is
`src/lib/view/`. The load-bearing pairings:

| This doc says | Enforced by |
|---|---|
| the rate is verbatim, never derived | `view/results.js#headlineRate` takes only the headline payload |
| the annuity gets the AAR, never the APRC | `view/home.js#mortgagePanel` (`verify_view_home.mjs`) |
| savings erosion is since-2020, not the user's rate | `view/results.js#savingsSince2020` takes the payloads, not a rate |
| the savings card deflates by Eurostat's own all-items index | `view/results.js#savingsSince2020` prefers `hicp_headline.json`'s TOTAL index and returns `basis` |
| the loan is bounded by regulation | `mortgagePanel` reads `lending_limits`; it does not accept a down payment |
| a verify link resolves to the number beside it | `view/basket.js#verifyUrl(row, anchor)` |
| a shared number must not reconstruct a private one | `view/share.js#sharePayload` takes no salary; `SHARE_FIELDS` is the closed list of what travels, and no € reaches `shareSentence` in either language |
| a shared ranking must not reconstruct a private one either | the ladder position is kept off every share surface: `mirror.js#percentile` inverts through the published rungs, so "ahead of 34%" IS the salary |
| the payslip itemises a gross, never the typed net as if it were one | `view/payroll.js#payslipPanel` takes `pay.basis` and hands it to `bgHouseholdPayroll`, so a typed gross is itemised as a gross and a typed net is inverted first — the basis travels with the amounts and cannot be assumed |
| the breakdown's rates are the published ones | `payslipPanel` takes `payroll.json`, not a params object |
| the insurance ceiling is per contract, never per household | `payslipPanel` and `taxWedgePanel` take a list and have no scalar parameter |
| an amount never travels without its basis | both take `pay = { basis, amounts }`; `view/payroll.js#netsOf` is the only net↔gross conversion |
| a household's raise is weighted by the earlier pay | `mirror.js#householdNetRaisePct`; a blank raise returns NaN rather than reading as 0% |
| the earnings ladder ranks people, not households | `view/payroll.js#earnerRanks` returns one row per earner; there is no total to pass it |
| the wage comparator measures a wage against a wage | `view/payroll.js#regionGap` compares earner by earner |
| both wage comparators round and dead-band alike | `mirror.js#wageGap` is the only place either computes a distance; `verify_wiring.mjs` asserts no `view/` module computes one |
| the market strip positions and never scores | `mirror.js#rangePosition` takes one reading and one range, so there is no second series to weigh it against and no total to draw |
| the sector card can never become a sector rank | `mirror.js#meanRungPosition` takes no anchor, so there is no parameter to hand it a sector average through |

## Cross-references

- [`architecture.md`](./architecture.md) — the system map
- [`data-sources.md`](./data-sources.md) — each dataset's quirks
- [`validation-gates.md`](./validation-gates.md) — what each gate catches
- `pipeline/src/vyarno_pipeline/transform.py`, `validate.py` — the implementation
