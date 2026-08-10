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
`hicp_headline.json` can carry `ref_period` 2026-07 beside a `latest_index` at
2026-06, with `hicp_categories.json` still wholly at 2026-06. Both figures are
Eurostat's, at the months they name; neither is estimated, extrapolated or
carried forward. Read the months, never assume them: the pair to compare a
division against is `latest_index`, and the pair to date the national headline
by is `ref_period`.

**`is_flash` is the fact rather than the evidence for it.** The two months imply
the release shape, but a renderer that infers it re-derives the rule on every
surface, and one handed a payload with no `latest_index` concludes "settled" —
which is the wrong way to be wrong about a figure the banner prints as official.
So the publisher writes what it fetched, `validate.py#validate_headline_flash`
requires the flag and the months to agree in both directions, and the site's
banner and strip card mark the estimate off the field.

The alternative was to omit `latest_index` until the full release caught up.
That is worse, and not by a little: the SPA's fallback rebuilds the
since-2020 cumulative from the divisions at current weights, which is 41.8%
against the official index's 39.9% — €960 on €100,000 of somebody's savings —
and it says on the page that the official index failed to load, which would not
be true. A published figure at a stated month beats a better-aligned month with
no figure in it.

**Year-end rule.** A year appears in `index_by_year` only once its December
reading is published. Storing the latest available month under a calendar-year
key would silently mean "June 2026" instead of "end of 2026" and contaminate
the anchor dropdown, the cumulative-since-anchor math and the savings card.

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

Measured against live BG data for every month of 2021-01 → 2026-06 — 66 months
— the largest deviation is **0.0091 pp** (2021-02 and 2021-05), and 14 of the
66 sit above 0.005 pp. `validate_chain_reconciliation` allows **0.02 pp**: a
little over twice the observed worst case, which is Eurostat's 2-decimal index
rounding and nothing else. **Never widen it.**

The deviations cluster in 2021 and in mid-2025, which is what rounding on a
chain-linked index looks like rather than a defect — but the figure is a
measurement, not a constant, so re-measure it rather than quoting this line
back. It has already moved once under this paragraph, by enough that a
tolerance set from the old reading would sit below the real worst case: the
number to trust is the one your run prints, not the one written here.

### 2. The basket sum — approximate, a sanity band only

```
Σ (weight_pct × annual_rate_pct) / 100   vs   headline_rate_pct
```

This is the arithmetic the SPA does for the user's own basket, so it is worth
checking, but it is **not** an identity: a 12-month window straddles December's
chain link and the official aggregate re-weights mid-flight. On BG data at
2026-06 it sits **0.156 pp** from the headline — a real methodological gap.
`validate_reconciliation` allows **0.5 pp**. Tightening it would fail on
correct data; the precise check is gate 2, which catches strictly more.

**The UI shows both numbers and says why.** The results card puts the user's
basket next to the average basket (Σ(w·r) at official weights); the national
strip shows Eurostat's headline, and `/how/` §инфлацията prints the two side by
side. Three shapes keep that honest:

- The sliders are seeded with the **exact** published `weight_pct`
  (`view.js#officialBasketWeights`), never rounded — rounding makes the default
  basket sum to 97 and puts a third figure on screen.
- The strip headline comes from `view.js#headlineRate`, which takes only
  `hicp_headline.json`, so it cannot be handed the categories and quietly
  become Σ(w·r).
- **The prose that explains the gap branches on the two months**
  (`view.js#monthsSplit`), because the 0.156 pp above is a SAME-MONTH figure.
  During Eurostat's flash the headline is a month ahead of every division and
  the two on screen are several times further apart — 1.26 pp at 2026-07
  against 2026-06 — with almost all of the extra being the fortnight. Copy that
  names the re-weighting either way is true and is not the reason for what a
  reader is looking at, in the one paragraph they opened to check. Both surfaces
  call the same function rather than each comparing the two strings, so a
  correction cannot land on one and miss the other.

## Worked example (current `data/published/`)

```
prc_hicp_minr RCH_A (TOTAL, 2026-06):  5.2%
prc_hicp_minr RCH_A (CP01, 2026-06):   2.3%   (weight 22.323%)
prc_hicp_minr RCH_A (CP07, 2026-06):  11.0%   (weight 14.277%)
prc_hicp_minr RCH_A (CP12, 2026-06):   3.9%   (weight  1.415%)  Insurance & financial services
prc_hicp_minr RCH_A (CP13, 2026-06):  10.3%   (weight  4.423%)  Personal care, social protection & misc

prc_hicp_iw (2026, per-thousand ÷ 10):  CP01..CP13 sum to 99.999%

Basket sum  Σ(w·r)/100 = 5.356%
Headline                 5.200%
Gap                      0.156 pp   ← the chain-link effect, not an error

Chain identity at 2026-06, linked at Dec-2025:
  Σ w_i(2026) · I_i(2026-06)/I_i(2025-12) = 103.4936
  I_total(2026-06)/I_total(2025-12)       = 103.4972
  Gap                                       0.0036 pp   (limit 0.02)
```

Since-year math, both operands as Eurostat publishes them:

```
CP01 latest_index (2026-06) = 184.98
CP01 index_by_year["2020"]  = 115.65
                    ratio − 1 = +59.95%
```

## Two since-2020 cumulatives, and which card gets which

The 12-month gap between the headline and Σ(w·r) is ~0.16 pp. Over five and a
half years the same distinction opens to **~1.9 pp**, and at that size it stops
being a footnote:

```
TOTAL latest_index (2026-06)   = 139.87   (raw 148.86 ÷ 106.43 × 100)
TOTAL index_by_year["2020"]    = 100.00
allItemsCumulativeSince2020    = +39.87%   ← Eurostat's own all-items index

officialCumulativeSince2020    = Σ w_i · (latest_index_i / idx_2020_i − 1) / Σ w_i
                               = +41.76%   ← our reconstruction, 2026 weights
```

Both are honest arithmetic over published figures. Only the first is a figure
Eurostat publishes: an annually re-chained index is not the same object as one
set of current weights applied across six years, and the fixed-weight version
runs high.

**The savings card takes the first.** `view.js#savingsSince2020` reads
`hicp_headline.json`'s TOTAL index and falls back to the divisions
reconstruction only if that payload has no index — returning `basis` so the
copy can say which it used. On €100,000 the two differ by €960, and the card's
sentence names Eurostat, so it has to *be* Eurostat's number.

`officialCumulativeSince2020` stays, because the anchor selector legitimately
wants a basket-weighted cumulative per division. It is simply not what the
savings sentence points at, and pointing it there is the failure above.

**Verified against НСИ's own June-2026 press release**, which is the check that
proves the 2020 base rather than assuming it (a 12-month rate is
base-invariant and cannot reveal a base bug):

| НСИ says | Recomputed from `prc_hicp_minr` I15 |
|---|---|
| 5-year accumulated (2026-06 vs 2021-06) **37.6%** | 37.6% |
| 3-year accumulated (2026-06 vs 2023-06) **11.5%** | 11.5% |
| Accumulated since Dec-2025 **3.5%** | 3.5% |
| Month-on-month **−0.5%** | −0.5% |

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
`view.js#basketBudget`'s `spendBase`:

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

The **AAR** (annualised agreed rate) from `new_business.value_pct` — the
interest rate on home loans BG banks actually signed last month.

**Not the APRC.** The APRC (`new_business.aprc.value_pct`, 2.77% vs 2.43% at
2026-05) folds fees into an annualised figure; feeding it into the annuity
compounds fees monthly as if they were interest and overstates the payment.
**APRC is for comparing, AAR is for computing.**

**Not the outstanding-stock rate either.** `mortgage.json` carries a third
figure — the БНБ rate on the existing housing book — which is published, gated
and cross-checked but not rendered. New business, outstanding stock and all-in
cost answer three different questions, and the UI must never let them blur.

### The loan is bounded by regulation

```
loan           = price × (1 − minDownPaymentPct / 100)
maxAffordLoan  = annuityReverse(net × prudentDstiPct / 100, rate, term)
maxAffordPrice = maxAffordLoan / (1 − minDownPaymentPct / 100)
```

All three inputs come from `mortgage.json → lending_limits`:

| Input | Value | Where it comes from |
|---|---|---|
| `minDownPaymentPct` | **15%** | `100 − LTV-O`; БНБ caps LTV-O at 85% |
| `term` max | **30 years** | БНБ caps mortgage maturity at 30 years |
| `prudentDstiPct` | **30%** of net | our line, stricter than the legal 50% |

So 15% down is the largest loan a BG bank may legally write against a given
price, and the term input is clamped at 30 years because a longer mortgage
cannot be originated in Bulgaria.

### The affordability line is deliberately unflattering

БНБ caps DSTI-O — debt service over monthly net income — at **50%**, and BG
borrowers average **~38.5%**. We draw the line at **30%** and show all three,
because a payment a bank will approve is not a payment that leaves room to live.
`test_mortgage.py::test_our_guidance_line_is_stricter_than_the_regulator_and_the_market`
asserts `30 < 38.5 < 50`.

Worked example, on the payloads published at 2026-08-10 (Sofia median
€2,505/m², 70 m², Sofia average gross €1,915 → net €1,486, AAR 2.41%, 25
years). **Dated, because it is a snapshot and not a claim about today** — every
figure in it moves with the next refresh, and an example that says "current"
goes on saying it:

```
price          €175,350
down payment    €26,302   (15%)
loan           €149,048
payment            €662/mo  = 44.5% of net → over our 30% line
affordable      €118,098  ≈ 47 m² at the 30% line
```

**The payment is the annuity and nothing else**, which is what the 44.5% is a
share of. Part of what the ГПР folds in beside it is one-off — valuation, the
mortgage itself, arrangement — and part runs monthly alongside the instalment:
property insurance is mandatory on a mortgaged home, life cover is often
required or required for the advertised rate, and the account the instalment is
collected from usually carries a fee. So a reader's real monthly outgoing sits
above this line. It is not added here because nobody publishes a figure for it
that this project could cite, and inventing a plausible one is the failure the
whole repository is built against — but the share on screen is a floor rather
than the whole of it, and the copy says so.

БНБ's DSTI-O is debt service too, so those costs sit outside the regulator's
ratio as well and the comparison against 50% is like for like. The gap is
between the ratio and the reader's month, not inside the ratio.

## Gross ↔ net (BG payroll)

The salary field collects **net** take-home, because that is the number on the
payslip. Everything that compares the user against a published wage needs the
**gross**, so the SPA inverts. Parameters come from `payroll.json`; the maths is
`mirror.js`.

Forward (`bgNetSalary`), for gross *G*, employee rate *R* = 13.78%, flat tax
*T* = 10%, insurance ceiling *C* = €2,111.64:

```
insurance = min(G, C) × R          ← the CEILING applies here
taxable   = G − insurance
tax       = taxable × T            ← and NOT here: the tax base is uncapped
net       = G − insurance − tax
```

### The inverse is piecewise, and that is where calculators go wrong

Because the ceiling caps insurance but not tax, the inverse has two branches:

```
G ≤ C:   G = net / (1 − R − T(1 − R))  = net / 0.77598
G > C:   G = (net + C·R·(1 − T)) / (1 − T)
```

`bgGrossFromNet` computes both and keeps the one that **round-trips**: feed it
back through `bgNetSalary` and it must return the net that was asked for. That
check is the whole safeguard, and it is cheap.

Taking the first branch unconditionally is a real, shipped defect in this
class of calculator, not a hypothetical one. It is the branch that reads as
obviously correct, and it *is* correct up to the ceiling; past it the insurance
stops growing while the formula keeps assuming it does. For €2,100 net it
returns €2,706.26 — exactly `2100 / 0.77598` — where the answer that pays
€2,100.00 to the cent is **€2,650.27**. The tell is visible without knowing
which is right: run €2,706.26 forward and it pays €2,150.38, so the deduction
column printed under that gross does not add up to the net it was asked for.

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
2. **The five fund lines are allocated by largest remainder**, so they sum
   exactly to the contributions total. Rounding each line on its own does not:
   at a gross of €601 the five lines round to €82.81 under a stated total of
   €82.82, because sickness-maternity's 8.4114 loses its remainder and nothing
   gives it back. Roughly one gross in every €2.50 of the range does this, so a
   handful of round salaries will not surface it and the test sweeps.

`bgPayslipFromNet` additionally tries both cents either side of the inverted
gross and keeps the one that reproduces the typed net — for €2,100 the exact
inverse is €2,650.2733, and rounding it up works out a cent high.

**Full precision is still what everything else uses.** `bgNetSalary` is
unrounded and remains the input to every comparison (the област comparator, the
net ladder, the wedge); the breakdown is a display layer over it, and
`verify_net_salary.mjs` asserts the two never differ by more than display
rounding.

### A household is several contracts, and the ceiling belongs to each of them

The insurance ceiling caps one contract's contribution base. It is not a
household allowance, so a household's gross is the sum of its earners' grosses
and never the inverse of their combined net:

| Two earners, €2,000 gross each | |
|---|---|
| each takes home | €1,551.96 |
| together | €3,103.92 |
| **inverted as one salary** | **€3,765.75 gross** |
| **summed per contract** | **€4,000.00 gross** |

The single inversion applies one ceiling to two people and lands €234 a month
low. Nothing about the wrong figure looks wrong — it sits inside every plausible
band — and the error grows with the household.

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
`view.js#netsOf` is the **only** place one becomes the other. Everything below
it — the basket, rent as a share of pay, the 30%-of-net mortgage line, the
position on the earnings ladder — is a statement about take-home, and each is
wrong by around 29% when fed a gross. The mortgage one is wrong in the direction
that calls a home affordable, which `AGENTS.md` forbids in as many words.

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
`Σ net_now / Σ net_before − 1` — not the average of the rates. Two earners on
€1,000 today, one of whom got +20% and one nothing, went from €1,833.33 to
€2,000: a rise of **9.09%**, where the plain average says 10%. The
overstatement always flatters, because the earner who got the rise is the one
whose *current* pay is inflated by it.

In gross mode the before-and-after are converted to net **separately**, so a
10% rise on a contract that clears the ceiling is correctly worth more than 10%
in the pocket — contributions stop but the pay does not.

`householdNetRaisePct` returns **NaN unless every earner with pay has stated a
raise**, and the guard runs before the numeric coercion: `null`, `undefined`
and `""` all coerce to 0, and 0 is a legitimate answer («нямаше увеличение»).
A blank read as "no raise" is an invented number (P7) that drags the household's
figure down. The row names the missing income instead of answering around it.

## HICP vs the national CPI

Bulgaria has two official inflation gauges:

- **HICP** (ХИПЦ) — the EU-harmonised index Eurostat publishes
  (`prc_hicp_minr`). This is what vyarno.bg shows, everywhere.
- **National CPI** (ИПЦ) — НСИ's domestic index, on a different basket, with a
  different treatment of owner-occupied housing, covering resident households
  only.

June 2026: HICP **5.2%** vs national CPI **5.4%**. The largest per-category gap
is transport (+11.0% vs +16.8%), a genuine methodological difference. The
*ranking* agrees — transport is the fastest riser in both.

**We keep one headline number.** A second competing figure confuses; instead
the in-app explainer says in plain language why НСИ's number can differ. We do
not fetch or publish the national CPI.

## A sector average, and why the card says what an average is

`view.js#sectorComparison` feeds `mirror.js#wageGap(net, sectorNet)` — the reader's
take-home against НСИ's published average for the NACE Rev 2 section they
picked, both net, `(net − ref) / ref` rounded to whole percent. Nothing else.

**A rank is not available at that granularity and never will be from the current
upstreams.** Probed 2026-08-06: `earn_ses_monthly` carries BG at
no NACE section at all; `nace_r2=J` returns an empty `value` map over a
`nace_r2` dimension of size 0, and the five categories the cube does carry for
BG are broad groupings, of which only the whole-economy one is populated at the
2022 vintage
([`data-sources.md`](./data-sources.md) §"gross wage by economic activity" has
the probes). So the site can report a distance from an average and cannot report
a position in a distribution.

**The two are not close, and the difference runs against the reader.** Earnings
are right-skewed, so an average sits well above the middle. Read off the
published SES shape in `salary_dist.json`:

| | gross | standing |
|---|---|---|
| SES mean | 949 | published |
| SES median (P50) | 705 | published |
| median ÷ mean | **0.7429** | inputs are Eurostat's, **the division is ours** — the card shows both published figures and attributes the ratio to us |
| the mean's own rung | **P66** | **modelled** — see below |

So someone €500 below their sector's average may still be paid more than most
people in it, and a card reporting only the gap would tell them the opposite.

**The two figures are not equally solid, and the copy must not say them in one
voice.** Eurostat publish D1, the median and D9 for BG and nothing between, so
`SES_SURVEYED_CUTS` is `[10, 50, 90]`. The mean (949) falls between P60
(838.99) and P70 (1010.66) — **both interpolated**, piecewise-lognormal in the
normal quantile. So €949 against €705 is two published numbers, and "the average
sits near the 66th rung" is read off modelled ones.

**The card shows the pair and derives one figure from it, not two.** `949` and
`705` go on screen as published, with the sentence a reader needs to use them —
half of employees earn less than the median — and the only number computed here
is the rung. The median-to-mean ratio (`meanRungPosition#medianPct`, 74%) makes
the same point one step further from the evidence, and stating both put two of
our own percentages in a four-line caveat that a reader has to hold at once. Two
published levels are easier to check than a ratio between them and easier to
read than either. `COPY.sectorAverageFlatters` attributes the rung to us and
dates the survey, and `the calibration marks its modelled figure and dates its
measured one` in `verify_copy.mjs` fails if either goes.

What the modelling can and cannot move: a different interpolation between the
published median and D9 shifts the rung by a few points, and cannot put the mean
below the median — that ordering follows from the two published figures alone.
The claim the card rests on is "an average is above the middle", which is
measured; the exact rung is the illustration.

**`mirror.js#meanRungPosition` publishes that correction, and it is exactly
scale-invariant.** Re-levelling multiplies every rung and the mean by one
factor, so the mean's rung is a property of the shape rather than of any
particular average — P66 at anchors from €1,407 to €5,000, checked in
`verify_mirror_math.mjs`. It reads Eurostat's ladder alone, so no НСИ figure and
no payroll parameter enters it.

**It takes no anchor, and that is deliberate.** Handed a sector average it would
return a sector percentile — the figure the paragraph above says nobody
publishes. There is no parameter to attempt it through, which is the same device
`headlineRate` uses to stay unable to become Σ(w·r). Do not add one, and do not
multiply a sector average by 0.7429 to produce a sector median: sector
dispersions differ from the national one and nothing published says by how much.

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
`view.js`. The load-bearing pairings:

| This doc says | Enforced by |
|---|---|
| the rate is verbatim, never derived | `view.js#headlineRate` takes only the headline payload |
| the annuity gets the AAR, never the APRC | `view.js#mortgagePanel` (`verify_view.mjs`) |
| savings erosion is since-2020, not the user's rate | `view.js#savingsSince2020` takes the payloads, not a rate |
| the savings card deflates by Eurostat's own all-items index | `view.js#savingsSince2020` prefers `hicp_headline.json`'s TOTAL index and returns `basis` |
| the loan is bounded by regulation | `mortgagePanel` reads `lending_limits`; it does not accept a down payment |
| a verify link resolves to the number beside it | `view.js#verifyUrl(row, anchor)` |
| a shared number must not reconstruct a private one | `view.js#sharePayload` takes no salary; `SHARE_FIELDS` is the closed list of what travels, and no € reaches `shareSentence` in either language |
| a shared ranking must not reconstruct a private one either | the ladder position is kept off every share surface: `mirror.js#percentile` inverts through the published rungs, so "ahead of 34%" IS the salary |
| the payslip itemises the GROSS, never the typed net | `view.js#payslipPanel` inverts internally; it does not accept a gross |
| the breakdown's rates are the published ones | `payslipPanel` takes `payroll.json`, not a params object |
| the insurance ceiling is per contract, never per household | `payslipPanel` and `taxWedgePanel` take a list and have no scalar parameter |
| an amount never travels without its basis | both take `pay = { basis, amounts }`; `view.js#netsOf` is the only net↔gross conversion |
| a household's raise is weighted by the earlier pay | `mirror.js#householdNetRaisePct`; a blank raise returns NaN rather than reading as 0% |
| the earnings ladder ranks people, not households | `view.js#earnerRanks` returns one row per earner; there is no total to pass it |
| the wage comparator measures a wage against a wage | `view.js#regionGap` compares earner by earner |
| both wage comparators round and dead-band alike | `mirror.js#wageGap` is the only place either computes a distance; `verify_wiring.mjs` asserts `view.js` computes none |
| the sector card can never become a sector rank | `mirror.js#meanRungPosition` takes no anchor, so there is no parameter to hand it a sector average through |

## Cross-references

- [`architecture.md`](./architecture.md) — the system map
- [`data-sources.md`](./data-sources.md) — each dataset's quirks
- [`validation-gates.md`](./validation-gates.md) — what each gate catches
- `pipeline/src/vyarno_pipeline/transform.py`, `validate.py` — the implementation
