# Validation gates

Seven gates block the HICP publish, plus five on the mortgage panel and one on
the by-sector wage payload. They run in order, short-circuit on the first failure,
and never pass silently. On any failure the CLI exits **before** that arm's
publish, so no payload on disk is the output of a run that failed its gates.

**`--source all` is per arm, not per run.** The arms run in sequence and each
publishes on success, so a failure at the eighth leaves the first seven written
— which is why the error names them: `written this run:` and `not reached:` are
printed on the way out. Read that list before re-running; the tree is a partial
refresh, not an untouched one.

| # | Gate | Catches |
|---|---|---|
| 1 | Classification agreement | The weights cube and the rates cube meaning different things by the same code |
| 2 | Chain reconciliation | Weights, rates and index not describing the same basket |
| 3 | Basket sum | A gross arithmetic or scale failure |
| 4 | Group consistency | A division's sub-groups not adding up to it |
| 5 | Coverage | A missing year, at either level |
| 6 | Link status | A published verify link that does not resolve to real data |
| 7 | Flash marker | A headline that does not say which Eurostat release it came from |
| 8 | Sector wages | An НСИ by-activity headline that was computed rather than selected |

## Gate 1 — classification agreement

`validate.py::validate_classification_agreement` (+ `validate_meta_labels_cover`)

For every code about to be published:

1. Both cubes use the **same COICOP dimension**. ECOICOP ver.1 cubes are keyed
   by `coicop`, ver.2 by `coicop18`; two dimension names mean two
   classifications, and no per-code comparison below is meaningful.
2. Both cubes **cover the same codes**.
3. Both cubes give each code the **same English label**. Cosmetic differences
   (case, `&` vs `and`, punctuation) are folded; a different bucket is not.

Plus: every published code has a friendly BG/EN name in `COICOP_META`. A code
Eurostat publishes for BG that we have no name for **fails the publish** rather
than being dropped, because a silently dropped division is invisible.

**When it trips:** Eurostat ships a new classification version and one cube
moves before the other; a connector is retargeted at a dataset on a different
version; a division is split, merged or renamed upstream.

**What to do:** read the message — it names the code and quotes both labels.
Find the matching cube for the other series by enumerating the dissemination
catalogue, never by guessing a dataset name. **Never** "fix" this by relabelling
a category or dropping a code.

## Gate 2 — chain reconciliation

`validate.py::validate_chain_reconciliation`

The published divisions must reproduce Eurostat's own all-items index movement
through HICP's aggregation identity —

```
I_total(m) / I_total(Dec, y−1)  ==  Σ_i w_i(y) · I_i(m) / I_i(Dec, y−1)
```

— to within **±0.02 pp**. It also fails if the weights vintage is not the year
of the rate month, or if the division weights do not sum to 100.

HICP is annually chain-linked, so this is an identity rather than an
approximation: measured on live BG data for every month of 2021-01 → 2026-06
(66 months), the largest deviation is 0.0091 pp, and 14 of the 66 exceed
0.005 pp. That precision — roughly half the tolerance at the worst month — is
what makes it a real test of whether weights, rates and index describe the same
basket. The figure is a measurement of live upstream data, so re-run it rather
than trusting this sentence.

**When it trips:** the weights and rates are on different classification
versions; the weights are a stale vintage (a real annual window — Eurostat
publishes new item weights around late February, so a January refresh has rates
a year ahead of weights); a division was dropped or double-counted; the time
anchor drifted.

**What to do:** the message prints both sides and the gap. Check the
classification, then the weights vintage, then the December link month. **The
fix is never to widen 0.02 pp.**

**On a flash release this gate has no inputs, and does not run.** Eurostat
publishes the all-items rate about two weeks before that month's index exists,
so `I_total(m)` — the left-hand side above — is not a number anybody has
published yet, for TOTAL or for any division. `cli.py#_refresh_hicp` detects the
flash from the cube (the headline's month missing from both the index series and
CP01..CP13) and skips gates 2, 3 and 4 on that path only. Gates 1, 5 and 6 keep
their inputs and still run, because they describe the cube the headline itself
was drawn from.

That is a narrower thing than it reads as. The flash path publishes
`hicp_headline.json` alone; `hicp_categories.json` is left exactly as the last
full release wrote it, and those divisions passed this gate then. Nothing
reaches `data/published/` ungated — what changes is that the two payloads name
different months for two or three weeks, which the headline's `notes` states and
`test_published_contracts.py` enforces through `latest_index.time` rather than
through `ref_period`. During that window the committed pair is reconciled
through the index instead: the same identity as above, on the month both
payloads still share.

## Gate 3 — basket sum

`validate.py::validate_reconciliation`

`Σ (weight_pct × annual_rate_pct) / 100` must land within **±0.5 pp** of
`headline_rate_pct`.

The band is loose because Σ(w·r) is not an identity — a 12-month window
straddles December's chain link, so on correct BG data it sits 0.156 pp from the
headline. The precise check is gate 2; this one is a band a real error cannot
slip through. See [`math.md`](./math.md) §"Two reconciliations".

**What to do when it trips:** something is badly wrong — a weight vector off by
an order of magnitude, a rate cube from the wrong country, a headline from a
different month. Gate 2 will usually have fired first.

## Gate 4 — group consistency

`validate.py::validate_group_consistency`

Every division has groups; every group names its parent correctly and has a
child code; and each division's groups sum to the division's own weight within
**±0.02 pp** (Eurostat publishes per-thousand weights to two decimals).

This matters because the SPA's detailed mode lets the user re-split a division
across its groups. If the groups did not add up to their parent, drilling into a
division would silently change how big that division is in the user's basket.

**When it trips:** Eurostat adds, removes or reweights a group; the
group-discovery filter drops something it should not.

## Gate 5 — coverage

`validate.py::validate_coverage`

For every division **and every group**, `index_by_year` must contain a value for
every year from `since_year` (default 2020) through the most recent completed
year — `as_of.year - 1`, matching the partial-year exclusion in the transform.

The site's anchor selector lets users pick any year in that range at both levels
of detail; a missing year renders nothing rather than an error.

**When it trips:** Eurostat publishes a partial series; `since_year` is earlier
than the available data; a new code's first observation lands mid-year.

**What to do:** the message names the code and the missing years. If upstream
published partially, wait — do not widen the gate.

## Gate 6 — link status

`validate.py::validate_link_status`

Every URL below must return HTTP 200 **and** carry a real Eurostat ND-cube
rather than an error payload:

- both extracts for each of the 13 divisions (`api_url`, the RCH_A rate, and
  `api_url_index`, the I15 monthly index), and
- both extracts for one sampled group per division.

52 calls. Which URLs are covered is load-bearing: the SPA's "↗" resolves to
`api_url_index` whenever the anchor is a year, and every group row carries its
own pair, so a gate checking division rates alone would not be gating
provenance. Sampling one group per division is a deliberate cost trade — group
URLs are built by the same two functions as the divisions', so a shape change
breaks them together.

Eurostat returns **200 OK with an error JSON payload** on rate-limit and invalid
params, so `cli.py#_is_real_estat_cube` requires `dimension` **and** `value`
**and** a non-empty value map. A 200 with `value: {}` is a failure, not a pass.

**`--skip-link-check` is for a sandbox with no outbound HTTP, never a production
refresh.** It is the only gate that catches a dead link in the published JSON,
and that link is what the reader clicks to verify a number.

**What to do when it trips:** open the failing URL. If Eurostat is
rate-limiting, wait and re-run. If the URL shape changed, fix `api_url` in
`transform.py`.

## Gate 7 — flash marker

`validate.py#validate_headline_flash`

`hicp_headline.json` carries `is_flash`, and this gate is what makes it worth
reading. Eurostat's flash publishes the all-items rate about two weeks ahead of
the index and the divisions, so on a flash `ref_period` sits one month past
`latest_index.time` and on a full release the two name one month. The gate
requires the flag and that pair to agree, in both directions, on both release
shapes.

Both directions cost the reader, which is why it is an equivalence rather than
a check for a missing marker. Unmarked, Eurostat's early estimate renders in the
banner in the same voice as a settled figure — and it moves when the full
release lands. Marked wrongly, the site hangs «експресна оценка» on a rate
Eurostat has finalised, so a reader who opens the cube finds the two agree and
the page hedging anyway.

An index AHEAD of the rate fails too. That is not a release shape: Eurostat
publish the all-items rate for a month at or before the index for it, so the two
series being the other way round means one of the extracts is wrong.

**What to do when it trips:** read the two months in the message. If they are
the ones Eurostat published, the detection at the top of `_refresh_hicp` is what
disagrees with them — fix `is_flash` there. Do not pass the flag by hand.

## Gate 8 — sector wages (`--source sector-salary`)

`validate.py#validate_sector_salary`. Guards the **payload**; the connector
guards the sheet, and the two catch different things.

The connector raises (exit 2) when: a per-year sheet's quarterly by-activity
block does not hold exactly 20 rows; the English and Bulgarian editions
disagree on any paired cell, which is what makes pairing rows by position safe;
or the all-activities row does not sit strictly between the lowest and highest
section, which is how a read that drifted onto a title row, the ownership block
or the monthly table shows up.

The gate then raises (exit 3) when: an activity is missing a name in either
language, two rows resolve to one activity, an activity has no value at the
payload's own `ref_period`, a figure falls outside 200–20000 EUR, or —
**the one it exists for** — a `value_eur` is not identical to
`series_by_period[ref_period]`.

That last check is the licence, not a sanity band. §2.1.1 of НСИ's terms forbids
distributing производни произведения, so a headline this pipeline calculated
rather than read would breach it while looking exactly like a correct number
(`docs/legal.md` §НСИ). It is an identity rather than a tolerance because
nothing here rounds.

**What to do when it trips:** open the workbook at the sheet and row the error
names. Do not widen the band — every failure it is written for puts the parse on
a column that is not a wage.

## Payroll gates (`--source payroll`)

`validate.py#validate_payroll`. The employee half of `payroll.json` has never
needed a gate — five constants, parity-tested against `mirror.js` by
`test_payroll.py`. The employer half does, because it is the first payroll
figure assembled from a **fetch**, and every way that fetch goes quietly wrong
ends as a labour cost that looks finished.

Four properties, each of them a wrong number on screen rather than an exception:

1. **The ТЗПБ block exists.** ДВ being unreachable is not a reason to publish
   without it. Absent, the site has no accident rate at all and the employer's
   cost renders 0,4–1,1 points light — inside every plausible band, for every
   reader at once. So the fetch is not best-effort; the run stops.
2. **Its span is the code's.** КСО чл. 6, ал. 1, т. 7 bounds what ЗБДОО may set
   at «от 0,4 до 1,1 на сто», and ЗБДОО may place any activity anywhere inside
   it. A published range outside that is a parse that has left the rate column,
   not a wide year.
3. **Every НСИ section resolves to a range inside that span.** A section the
   join lost renders no employer figure for whoever picked it; a section
   claiming a range wider than the act's is a selection that has stopped being
   a selection.
4. **The employer total excludes ТЗПБ.** The two are published apart because
   ТЗПБ is not one rate. A total that has absorbed the 0,4% floor is right for
   the sectors sitting at the floor and wrong for the rest, under a figure that
   claims to be the whole employer cost — which is what a well-meaning edit
   produces, and what makes it survive a spot check.

`sources/dv.py` raises before any of this (exit 2) when the appendix heading is
absent, the material's own ДВ header disagrees with the entry's citation, a rate
falls outside the statutory span, a division code repeats, or fewer than 80 rows
parse. `payroll.py#build_work_accident_block` raises when a section names a
division the appendix does not carry.

**What to do when it trips:** read the appendix the error names at the ДВ
permalink in `work_accident.source_url`. Do not fall back to the floor and do
not default the block to empty — both publish a labour cost that is complete
and too low.

## Property-market gates (`--source house-market`)

Two blocks, run before either payload is written.

**`validate_house_market`** — three properties over `house_market.json`:

1. **The disclosed derivation reproduces.** Every quarter of `avg_deal_eur`
   must equal the published value over the published count for that same
   quarter, to the cent. An identity rather than a tolerance: the payload rounds
   the quotient to two decimals and nothing else happens to it, so anything
   further out is a different denominator. This is the figure a reader is most
   likely to check by hand, and it is checked the same way here.
2. **The two purchase codes have not been swapped.** The average new-build deal
   is above the average existing-dwelling deal in every quarter of the published
   series. `DW_NEW` and `DW_EXST` differ by one letter, and swapped at the
   source they keep every series plausible **and** keep the derivation
   reproducing exactly — this is the only check that sees it.
3. **The average is in €10k–€500k.** Measured on the real series before it was
   written: the published run is €30,250 to €82,786, so the band is roughly
   three times wider at each end. It is watching for a unit error, not a market
   move, and tightening it around the current level would make it fail on the
   market doing something.

**`validate_house_market_structure`** — the identities each cube asserts about
itself, which a wrong slice breaks while every individual number still looks
like a percentage:

- owners plus renters equals the published total, within 0.2 pp (EU-SILC
  publishes each share to one decimal, so a split population can miss 100 by a
  rounding step; a slice over the wrong household composition misses by whole
  points);
- owners-with-a-loan is a subset of owners;
- occupied plus unoccupied does not exceed the dwelling stock;

**Gate 6 runs over the seven published `api_url`s**, body-checked. Those are the
queries the page links for "check it yourself", so a dead one costs the page its
argument rather than a footnote. It is the `api_url`s rather than the databrowser
pages because Eurostat answer a rate-limited or malformed query with 200 OK and
an error payload — the status code proves nothing.

## НСИ housing gates (`--source nsi-housing`)

**`validate_nsi_housing` — every published figure is a cell НСИ published.**
Gate 8's shape for the same licence reason: §2.1.1 forbids distributing
производни произведения, so a headline this pipeline calculated rather than
selected is a breach that reads as a correct number. The only way to tell from
the payload alone is that the headline and the series entry at its own reference
period are the same cell, and that is checked for the national block and for
every city in both city blocks. An identity, not a tolerance — there is no
arithmetic between them that could legitimately round.

**`validate_hpi_across_publishers` — the strongest gate in the pipeline.** НСИ
compile the house price index and Eurostat disseminate it, so `nsi_housing.json`
and `house_market.json` carry **the same statistic by two routes**. They are not
merely close; they are one number printed twice. A disagreement means we read
the wrong quarter, the wrong column or the wrong purchase type on one side, and
each of those produces a figure that looks entirely reasonable on the page —
one check catches all three. Verified by mutation: swapping the two purchase
types and shifting the quarter by one each trip it.

It compares at the newest quarter **both** carry rather than at each payload's
own latest, because Eurostat disseminate a few days behind НСИ publishing and a
refresh landing between them would otherwise fail on a quarter one side simply
does not have — a false alarm teaches whoever sees it to distrust the gate. **No
overlap at all is still a failure**: two non-overlapping windows on the same
series mean one of them is not what it is taken for.

Measured 2026-08-12 they agree exactly: 14.8 / 12.5 / 16.3 for total, new and
existing. **If it fails, the bug is ours. Do not soften it into a band.**

The gate is skipped, loudly, when `house_market.json` is not in the output
directory — a checkout that has never run `--source house-market`.

## Mortgage gates (`--source mortgage`)

All five are hard-required; none degrades. The arm writes a complete
`mortgage.json` or exits non-zero having written nothing.

| Gate | What it catches | Exit |
|---|---|---|
| **Response identity** (`ecb.py`) | The ЕЦБ returning a series other than the one requested, or more than one series — a filter that stopped applying | 2 |
| **Header discovery** (`bnb.py`) | The БНБ workbook's merged headers moving, so the housing/EUR/total column is no longer where we read it | 2 |
| **Plausibility bounds** [0.25%, 12%] | Reading the wrong cell entirely — calibrated to reject the 14.83% consumer-credit column in the same workbook while admitting the 2008-era outstanding peak | 3 |
| **APRC ≥ AAR − 0.05 pp** | The two ЕЦБ series being swapped (`DATA_TYPE_MIR` `R` vs `C`). Fees cannot be negative. The 0.05 pp (`APRC_BELOW_AAR_TOLERANCE_PP`) absorbs the two series rounding independently of each other, and nothing else — a genuine swap puts the pair 0.3 pp the wrong way round | 3 |
| **БНБ vs ЕЦБ cross-check** (≤0.30 pp) | Either side's outstanding-stock read drifting. They are the same data — БНБ reports MIR to the ЕЦБ — so disagreement means one read is broken | 3 |

Plus **freshness**: both tiers' reference month must be within 150 days, so a
source that quietly stops publishing fails instead of serving a stale rate.

A good mortgage run:

```
→ fetching ECB MIR new business (BG households, house purchase)...
→ fetching ECB MIR outstanding stock (for the cross-check gate)...
  AAR 77 months (BGN→EUR spliced at 2026-01), APRC 77, volume 77
→ fetching BNB housing-loan XLSX (outstanding stock, EUR)...
  got 233 monthly rows
→ gate: rate plausibility bounds + series completeness...
→ gate: APRC ≥ AAR (fees cannot be negative)...
→ gate: freshness (both tiers within the publication lag)...
→ gate: BNB vs ECB MIR agree on the outstanding book...
  BNB 2.6717% vs ECB 2.67% → Δ 0.0017 pp (tolerance 0.3 pp)
OK: wrote mortgage.json — new_business AAR=2.43% / APRC=2.77% (2026-05), outstanding_stock=2.6717% (2026-05)
```

An exit **4** here is usually the БНБ TLS quirk — their server omits an
intermediate certificate, so a client with no cached copy of it cannot complete
the chain. The error message points at the fix; `data-sources.md` §БНБ has the
detail.

## Which gates run for which `--source`

| `--source` | Gates | Notes |
|---|---|---|
| `hicp` (full release) | 1-7 (gate 6 unless `--skip-link-check`) | The full set; writes both payloads |
| `hicp` (flash) | 1, 5, 6 and 7 — 2, 3 and 4 have no inputs at the flash month | Writes `hicp_headline.json` only, exit 0 |
| `mortgage` | the five mortgage gates + freshness on both tiers | No best-effort tier |
| `city-price` | bounds [100, 10000] €/m², per city; a count below 60% of that city's own, or a city-year dropping over 20% of its rows, raises inside `imot.py` — and the arm **catches it and skips that city**, because one unreadable city is not a reason to publish nothing for the other twenty-six. The skip is reported, never silent. Then `validate_city_price` on the payload: every code one `regions.py` covers, no duplicate, a name in both languages, the median inside its own min-max, the published years unbroken and in order, and the headline since-baseline percentage equal to the newest year's | Publishes `n_dropped` per city-year, so the drop is never silent; `snapshot_date` off имот.bg's own list, so the payload is dated by them rather than by us; and `city_pages` beside `cities`, so a city nobody read is never reported as one имот.bg do not publish |
| `region-salary` | all 28 области present, no district row we do not name, София-city the maximum. The connector guards exit 2; the payload gate exits 3 | Three-part regression guard on the row selector — an off-by-one that shifts every reading by one област passes any two of them |
| `sector-salary` | gate 8 (below) + three connector guards, else exit 2 / exit 3 | Both language editions must agree cell for cell |
| `salary-dist` | No published-JSON gate. The arm fetches, transforms and writes | **The P1 floor is not here.** It applies after the ladder is re-levelled to today's София average, which happens in the reader's browser (`mirror.js#composeLadder`, minimum wage out of `payroll.json`) — flooring an unlevelled rung would floor a number that is not a wage |
| `payroll` | the four payroll gates (above) over the assembled payload, plus `sources/dv.py`'s five refusals on the fetched appendix. `payroll.py` still raises on an entry setting both or neither currency side, and on half a ДВ citation or one dated after the entry is in force | One network call — ЗБДОО's ТЗПБ appendix. It is not best-effort: no `work_accident` block, no publish. `test_payroll.py` reads `mirror.js` and rebuilds the shipped payload from a committed ДВ fixture |
| `unemployment` | transform fails loudly on a shape mismatch | No published-JSON gate |
| `nsi-housing` | every published figure is a cell НСИ published, and the national price index change reconciles with Eurostat's at the newest shared quarter | The reconciliation reads `house_market.json` off disk and says so when it is absent rather than passing quietly |
| `house-market` | the two blocks above: the derivation reproduces, the purchase codes are not swapped, the average is inside €10k–€500k, both indices average 100 across the base year they name, every published flag is one of Eurostat's own letters at a quarter the series carries, and the tenure and census identities hold. Gate 6 over every published `api_url` unless `--skip-link-check` | One arm, two payloads — the stems both start `house_market` because `refresh.yml` matches them against the `--source` name, and a payload no arm owns publishes nothing while the run reports success |

## A good HICP run

```
→ fetching item weights (prc_hicp_iw, latest year) for BG...
  got 557 weight rows · vintage 2026 · 46 groups in BG's basket
→ fetching annual rates (prc_hicp_minr RCH_A, last 12 months)...
  got 5023 rows
→ fetching monthly index (prc_hicp_minr I15, since 2020)...
  got 35807 rows
  weights sum (CP01..CP13): 99.9990% (expected 100.0)
→ gate: classification agreement (59 codes × prc_hicp_iw vs prc_hicp_minr)...
→ gate: chain reconciliation (divisions rebuild the all-items index, ±0.02 pp)...
→ gate: basket sum (Σ(w·r) near headline, ±0.5 pp)...
→ gate: group consistency (each division's groups sum to it)...
→ gate: flash marker (is_flash agrees with the two published months)...
→ gate: coverage (every division AND group, every completed year 2020→2025; partial 2026 excluded)...
→ gate: link status (52 URLs — both extracts per division plus a sampled group, body inspection)...
→ publishing to ../data/published/
OK: wrote hicp_categories.json (13 divisions + 46 groups, 2026 weights) + hicp_headline.json (headline 5.2% / 2026-06)
```

**Seven gate lines is the pass condition.** A run that publishes with fewer has
skipped one — usually `--skip-link-check`.

## A good HICP flash run

```
  weights sum (CP01..CP13): 99.9990% (expected 100.0)
→ gate: classification agreement (59 codes × prc_hicp_iw vs prc_hicp_minr)...
  FLASH: 2026-07 carries CP00 alone — the divisions and the index are still at 2026-06
→ gates: chain reconciliation, basket sum, group consistency SKIPPED — no index and no divisions at the flash month to feed them
→ gate: flash marker (is_flash agrees with the two published months)...
→ gate: coverage (every division AND group, every completed year 2020→2025; partial 2026 excluded)...
→ gate: link status (52 URLs — both extracts per division plus a sampled group, body inspection)...
→ publishing to ../data/published/
  hicp_categories.json left untouched — the flash has no divisions
OK: wrote hicp_headline.json only (flash headline 4.1% / 2026-07; index still 2026-06) — hicp_categories.json untouched
```

**The `FLASH:` line is the pass condition here, and its absence is the one to
check first.** Without it the run took the full-release path, and a full-release
path on a flash cube dies at gate 2 with exit 3 rather than publishing anything
— which is the correct failure, not a bug to route around. Seeing the skip line
on a month whose divisions Eurostat has already published is the reverse fault,
and the more serious one.

A failing run stops at the gate that caught it:

```
→ gate: classification agreement (59 codes × prc_hicp_iw vs prc_hicp_minr)...
GATE FAILED: classification: 1 code(s) mean different things in the two cubes — CP12: weights say 'Miscellaneous goods and services' but rates say 'Insurance and financial services'. Publishing would show one bucket's weight next to another bucket's rate.
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All gates passed, JSON written |
| `2` | Input / transform error (wrong shape, missing data) |
| `3` | A validation gate failed |
| `4` | Network / HTTP error (upstream down, timeout, rate-limit, БНБ TLS chain) |

These are stable; scripts and CI rely on them.

## What the gates do not catch

| Failure mode | Caught? |
|---|---|
| Eurostat publishes a wrong number | **No** — we trust Eurostat verbatim by design |
| A weight is revised but its rate is not, within a year | **Partly** — gate 2 catches a vintage mismatch, not a same-year revision to one cube |
| Two cubes meaning different things by the same code | **Yes, gate 1** |
| A whole division missing from the published basket | **Yes** — the transform raises rather than skipping, and gates 1–3 fail on a short basket |
| A hand-edited payload in `data/published/` | **Partly** — no file integrity check, but the offline suites re-check the published payloads' identities and CI runs them on every push |
| The SPA feeds a correct number into the wrong formula | **Yes** — the `site/scripts/verify_view_*.mjs` suites. The pipeline gates structurally cannot see this: everything they check is already correct on disk |
| A published field with no consumer | **Partly** — `test_published_contracts.py` asserts every payload has a publisher and a loader; an unread *field* inside a payload is not caught |
| A refresh that ran but was never committed | **No** — the CI `data` job catches the missing file, not the stale one |

## How the gates are tested

| Where | Question it answers | Runs |
|---|---|---|
| `pipeline/tests/test_validate.py` (gates 1-8), `test_house_market.py`, `test_nsi_housing.py`, `test_mortgage.py` (the three sets above that this page numbers nowhere) | Does the gate raise on the wrong value it exists to catch? | `pytest -q` |
| `pipeline/tests/test_cli.py`, `test_cli_mortgage.py` | Is the gate wired into the refresh, does it abort **before** publishing, does it exit with the documented code? | `pytest -q` |
| `test_published_contracts.py`, `test_mortgage.py` (published section), `site/scripts/verify_data_contracts.mjs` | Does the JSON **committed in this repo** still satisfy what the gate promised? | `pytest -q`, `npm run verify:math` |
| `site/scripts/verify_view_*.mjs` | Does the SPA feed the right published number into the right formula? | `npm run verify:math` |

All of them run in CI on every push.

Three rules keep this honest:

- **Every gate test must fail when the gate is removed.** Break the production
  code on purpose once and watch the test go red.
- **Do not widen a tolerance to make a test pass.** The tolerances (0.02 pp
  chain, 0.5 pp basket sum, 0.02 pp group sums, 0.30 pp БНБ↔ЕЦБ, [0.25%, 12%]
  rate bounds) are pinned by their own tests so that widening one is a visible,
  deliberate act. If a gate trips on real data, the cause is upstream.
- **A tolerance that fails on correct data is a wrong formula, not a tight
  number.** Before retuning, check whether you are measuring the identity the
  data actually satisfies.

### Probing the upstreams

The gates protect against bad data; `pytest -m live` protects against the
premise changing underneath them. `tests/test_live_upstreams.py` calls the real
connectors and asserts the live responses still have the shape the parsers
expect — the rate cube is still current, every ЕЦБ series key still resolves to
its own series, the НСИ workbooks still have the Sofia-city row and both
language editions of the by-activity table, БНБ still agrees with ЕЦБ MIR.
Excluded from the default run; never gates a commit. Run it when a refresh looks
wrong, or before trusting a fixture.

**One probe treats a status as a finding rather than as an environment
result.** НСИ serve their workbooks to anyone, so a 404 or a 410 on either
edition of `Labour_1.1.2.1` means the file was renamed or withdrawn, and that is
the whole reason the probe exists — it fails there instead of skipping. A 403, a
rate limit, a 5xx or a timeout still skips, and so does every status on
имот.bg, which answers datacenter IPs with 403 by policy.

**The detail probes read the newest COMPLETE month, not the newest one**, and
that follows from the flash regime above rather than being a looser assertion.
For two or three weeks in every month the newest month in `prc_hicp_minr`
carries the all-items rate and no divisions, which is exactly what the flash
path is built for — so a probe reading `max(times)` and expecting divisions
under it reports "upstream reshaped the cube" on roughly a fifth of all days,
against an upstream behaving as documented. The live suite's whole value is that
a red run means something, and a probe that cries wolf monthly is one somebody
stops running.

Two assertions keep the wider window from buying that quiet. If **no** month in
the window carries the full set, the probe raises — the newest month being
partial is normal, every month being partial is a reshape. And the newest
complete month must still be recent: a flash costs one month, so anything past
two has stopped being published rather than being briefly ahead.

## Cross-references

- [`math.md`](./math.md) — why each reconciliation is shaped the way it is
- [`data-sources.md`](./data-sources.md) — the upstream quirks the gates guard against
- [`local-development.md`](./local-development.md) — running a refresh, and reading a failed one
- [`local-development.md`](./local-development.md) — running the suites
