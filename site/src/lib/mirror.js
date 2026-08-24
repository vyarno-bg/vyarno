/**
 * Mirror module — pure functions only, no closures over hardcoded data.
 * Every function takes its inputs explicitly; the SPA wires UI state
 * → these functions → rendered values. This is the only file in the SPA
 * with domain math; keep it that way.
 *
 * Basket-sum note: with the official `weight_pct` weights, Σ(w·r) lands
 * NEAR the headline HICP rate but does not equal it — HICP is chain-linked
 * at December, so a 12-month window re-weights mid-flight. On BG data at
 * 2026-06 the gap is ~0.16 pp, and the UI shows both numbers side by side
 * rather than pretending they are the same. The exact identity is checked
 * at publish time (`pipeline/.../validate.py#validate_chain_reconciliation`);
 * see docs/math.md §"Two reconciliations".
 *
 * Index-base invariant (load-bearing): the category fields `latest_index`
 * and `index_by_year` are Eurostat's published index values off one cube at
 * one unit — the unit each row's `api_url_index` resolves to. `rateFor(c, year)`
 * and `officialCumulativeSince2020` divide `latest_index / index_by_year[anchor]`,
 * so a base mismatch between the two silently inflates every since-anchor
 * number, and no 12-month rate on the page would look wrong. Opening the row's
 * verify link reads the published number back digit for digit, which is the
 * cheapest way to sanity-check a since-YEAR figure.
 * See docs/math.md §"Invariants that must never break" #1.
 *
 * Math conventions:
 *   - Real change = (1+r) / (1+pi) − 1, NEVER subtraction.
 *   - Multi-year rate = idx[now] / idx[year] − 1, NEVER subtraction.
 *   - Two-decimal display rounding; full precision internally.
 */

// ---------------------------------------------------------------------------
// RATE LOOKUP
// ---------------------------------------------------------------------------

/**
 * The rate per category for a given anchor.
 * anchor === 'y1'  → the official 12-month annual rate of change, taken
 *                     VERBATIM from Eurostat (`annual_rate_pct`, the RCH_A
 *                     value for the latest published month, e.g. 2026-06).
 *                     Not derived — it IS the published figure.
 * anchor === year  → (latest_index / index_by_year[year] − 1) × 100.
 *                     Uses `latest_index` (freshest month) as the end-point
 *                     so "since 2024" spans end-of-2024 → the latest month.
 *                     Both operands are Eurostat's own index values on one
 *                     base, which is what makes the ratio meaningful
 *                     (invariant #1).
 *
 * @param {{annual_rate_pct:number, index_by_year:Record<string,number>, latest_index:{time:string, value:number}}} c
 * @param {'y1' | number} anchor
 * @returns {number} percent (e.g. 5.2 means 5.2%)
 */
export function rateFor(c, anchor) {
  if (anchor === "y1") return c.annual_rate_pct;
  return 100 * (c.latest_index.value / c.index_by_year[String(anchor)] - 1);
}

/**
 * The latest year present in an index_by_year map.
 * @param {Record<string, number>} idx
 * @returns {string}
 */
export function latestIndexYear(idx) {
  return Object.keys(idx).sort().at(-1);
}

// ---------------------------------------------------------------------------
// INFLATION
// ---------------------------------------------------------------------------

/**
 * Personal inflation: Σ (w_i / Σw) × rate_i. The denominator
 * normalisation means sliders at 0 don't crash and a partial basket is
 * fine. If Σw === 0, fall back to the official headline.
 *
 * @param {number[]} weights  one per category, same length as categories
 * @param {Array<{annual_rate_pct:number, index_by_year:Record<string,number>}>} categories
 * @param {'y1' | number} anchor
 * @param {number} fallback  official figure to return if Σw === 0
 * @returns {number} percent
 */
export function personalInflation(weights, categories, anchor, fallback = 0) {
  const sumW = weights.reduce((s, x) => s + x, 0);
  if (sumW === 0) return fallback;
  return categories.reduce((s, c, i) => s + weights[i] * rateFor(c, anchor), 0) / sumW;
}

/**
 * The official figure — Σ (official_weight × rate) / Σ official_weight.
 * @param {Array<{weight_pct:number, annual_rate_pct:number, index_by_year:Record<string,number>}>} categories
 * @param {'y1' | number} anchor
 * @returns {number} percent
 */
export function officialInflation(categories, anchor) {
  return personalInflation(
    categories.map((c) => c.weight_pct),
    categories,
    anchor,
    0
  );
}

/**
 * Cumulative official inflation since 2020 — anchor-independent, used
 * by the savings-erosion row. Uses `cat.latest_index.value` (the freshest
 * monthly index Eurostat has published) as the "now" end-point, so the
 * user sees the most current cumulative inflation the data supports.
 *
 * `latest_index` and `index_by_year` are Eurostat's own values off one cube at
 * one unit, so this division is base-consistent without anything having to be
 * kept matched. The number the ratio produces is ours; both numbers it divides
 * are theirs.
 *
 * Example, on the current published data:
 *   basket-weighted idx[2026-06] / idx[2020] - 1 ≈ +41.64% since 2020
 *
 * @param {Array<{weight_pct:number, index_by_year:Record<string,number>, latest_index:{time:string, value:number}}>} categories
 * @returns {number} percent
 */
export function officialCumulativeSince2020(categories) {
  const ws = categories.map((c) => c.weight_pct);
  const sumW = ws.reduce((s, x) => s + x, 0);
  if (sumW === 0) return 0;
  return (
    100 *
    (categories.reduce(
      (s, c) => s + c.weight_pct * (c.latest_index.value / c.index_by_year["2020"] - 1),
      0
    ) /
      sumW)
  );
}

/**
 * Cumulative inflation since 2020 taken from Eurostat's OWN all-items index —
 * the figure Eurostat publishes, not one assembled from the divisions.
 *
 * `hicp_headline.json` carries `index_by_year` and `latest_index` for CP00
 * (TOTAL), through the same pipeline helper the categories go through, so this
 * division is base-consistent for the same reason `officialCumulativeSince2020`
 * is.
 *
 * **Why this exists next to that function.** Over a 12-month window the two
 * constructions differ by ~0.16 pp and the UI shows both. Over five and a half
 * years the gap widens to ~1.9 pp — 41.8% vs 39.9% on today's data — because a
 * fixed set of current weights applied across the whole span is not the same
 * thing as an index that re-weights and re-chains every January. On a card
 * about somebody's savings that is €960 per €100,000, and one of the two
 * numbers is on a Eurostat page the reader can open.
 *
 * Returns `null` rather than 0 when the payload has no index, so a caller can
 * tell "no data" from "prices did not move" and fall back deliberately.
 *
 * @param {{index_by_year?:Record<string,number>, latest_index?:{value:number}}|null|undefined} payload
 * @returns {number|null} percent
 */
export function allItemsCumulativeSince2020(payload) {
  const latest = payload?.latest_index?.value;
  const base = payload?.index_by_year?.["2020"];
  if (!Number.isFinite(latest) || !Number.isFinite(base) || base <= 0) return null;
  return 100 * (latest / base - 1);
}

// ---------------------------------------------------------------------------
// POCKET (real wage)
// ---------------------------------------------------------------------------

/**
 * Real change in income = (1 + raise) / (1 + pi) − 1. DIVISION, never
 * subtraction. +12.7% raise at +5.2% inflation is +7.1% real, not +7.5%.
 *
 * @param {number} raisePct  e.g. 12.7
 * @param {number} piPct     e.g. 5.2
 * @returns {number} percent
 */
export function pocketReal(raisePct, piPct) {
  return 100 * ((1 + raisePct / 100) / (1 + piPct / 100) - 1);
}

// ---------------------------------------------------------------------------
// MONEY + BITE
// ---------------------------------------------------------------------------

/**
 * The € per month "extra cost" — what the same life as at the anchor
 * now costs, given today's spend.
 *
 * @param {number} salary
 * @param {number} piPct
 * @returns {number} EUR/month
 */
export function extraPerMonth(salary, piPct) {
  if (salary <= 0 || piPct === 0) return 0;
  return salary * (piPct / (100 + piPct));
}

/**
 * The pocket verdict in € per month: how much more (or less) the pay in
 * hand buys than it did before the raise.
 *
 * Same inversion as `extraPerMonth`, and for the same reason — `salary` is
 * TODAY's take-home, i.e. the already-raised figure, so the euro amount is
 * `S × p/(100+p)`, not `S × p/100`. Deriving it the naive way overstates a
 * gain and understates a loss, by more the bigger the number.
 *
 * Sign follows `pocketReal`: positive = ahead of your own prices.
 *
 * @param {number} salary     NET monthly pay, today
 * @param {number} pocketPct  the real change from `pocketReal`
 * @returns {number} EUR/month
 */
export function pocketPerMonth(salary, pocketPct) {
  if (!(salary > 0) || !Number.isFinite(pocketPct) || pocketPct === 0) return 0;
  return salary * (pocketPct / (100 + pocketPct));
}

/**
 * The take-home that would have stood still: today's pay, less the real change
 * in it, so the same shopping takes the same share of it as before the raise.
 *
 * **Written as the subtraction rather than as `salary / (1 + pocket/100)`**,
 * which is the identical figure. Both the euro verdict and this target then
 * come out of one expression, so the row cannot state that a reader is €56
 * behind and then ask for a raise worth €54: two derivations of one quantity
 * disagree at the cent, and no screen carrying both says which is which.
 *
 * @param {number} salary     NET monthly pay, today
 * @param {number} pocketPct  the real change from `pocketReal`
 * @returns {number} EUR/month
 */
export function standStillNet(salary, pocketPct) {
  return Math.max(0, salary - pocketPerMonth(salary, pocketPct));
}

// ---------------------------------------------------------------------------
// DRILL-DOWN (ECOICOP level 2) — the detailed basket
// ---------------------------------------------------------------------------

/**
 * The rate to use for one division, given how the user has split it.
 *
 * `split == null` means "I haven't touched this division's inside" → use the
 * division's OWN published rate. That is deliberately not the same as the
 * weighted average of its groups at the official split: HICP is chain-linked,
 * so a division's published rate and the recombination of its groups differ
 * by a few hundredths of a point. Using the published rate when untouched
 * means opening a division to look at it never changes the user's number —
 * only editing it does.
 *
 * `split` present → the user has said how their own money divides inside the
 * division, so their inflation for it is Σ(share × group rate).
 *
 * @param {{annual_rate_pct:number, index_by_year:Record<string,number>, latest_index:object, groups?:Array}} division
 * @param {number[] | null | undefined} split  one amount per group, any units
 * @param {'y1' | number} anchor
 * @returns {number} percent
 */
export function divisionRate(division, split, anchor) {
  if (!split || !division.groups || division.groups.length === 0) {
    return rateFor(division, anchor);
  }
  const sum = split.reduce((s, x) => s + (x > 0 ? x : 0), 0);
  if (sum === 0) return rateFor(division, anchor);
  return (
    division.groups.reduce((s, g, i) => s + Math.max(0, split[i] ?? 0) * rateFor(g, anchor), 0) /
    sum
  );
}

/**
 * The official within-division split, as amounts summing to `total`.
 *
 * This is what a drill-down starts from: each group's Eurostat weight, scaled
 * to whatever the user has allocated to the division. Editing from here is
 * editing away from the national average, which is the whole point of the
 * detailed mode.
 *
 * `weight_pct` is the share of the WHOLE basket, and the normalisation below
 * is why that is the right field rather than a share-of-division one. Dividing
 * each group by the group total cancels whatever common factor they carry, so
 * a per-division share would land on the same amounts — while being a number
 * we computed, published under Eurostat's name, needing its own disclaimer.
 * A field that changes no output is not worth a licence obligation.
 *
 * @param {{groups?: Array<{weight_pct:number}>}} division
 * @param {number} total  the division's amount (percent share or €/month)
 * @returns {number[]}
 */
export function officialSplit(division, total) {
  const groups = division.groups ?? [];
  if (groups.length === 0) return [];
  const sum = groups.reduce((s, g) => s + g.weight_pct, 0);
  if (sum <= 0) return groups.map(() => total / groups.length);
  return groups.map((g) => (total * g.weight_pct) / sum);
}

/**
 * Per-division contribution to the user's personal inflation, ranked.
 *
 * The decomposition is exact and additive: `Σ contributionPp === π`. That is
 * what makes the ranked view honest — "transport is 1.6 of your 5.4 points"
 * is a statement the user can add up themselves.
 *
 * `eurPerMonth` is per-row correct rather than a share of some total: if you
 * now spend €X on a group and that group rose r%, the same goods cost
 * X/(1+r/100) a year ago, so the rise costs you X·r/(100+r) a month. These
 * do NOT sum to `extraPerMonth(salary, π)` — that formula answers a different
 * question (what the same *whole* life costs given one blended rate), and the
 * UI never adds the column up.
 *
 * @param {object} args
 * @param {Array} args.divisions        published hicp_categories.json entries
 * @param {number[]} args.amounts       one per division (percent share or €/mo)
 * @param {Array<number[]|null>} args.splits  per-division group split, or null
 * @param {'y1'|number} args.anchor
 * @param {number} args.spendable       €/month the shares are carved out of
 * @returns {Array<{index:number, division:object, share:number, rate:number,
 *                  contributionPp:number, spendEur:number, eurPerMonth:number}>}
 *          sorted by contributionPp, descending
 */
export function contributions({ divisions, amounts, splits = [], anchor, spendable = 0 }) {
  const sum = amounts.reduce((s, x) => s + (x > 0 ? x : 0), 0);
  if (sum === 0) return [];
  return divisions
    .map((d, i) => {
      const share = Math.max(0, amounts[i] ?? 0) / sum;
      const rate = divisionRate(d, splits[i], anchor);
      const spendEur = spendable > 0 ? spendable * share : 0;
      return {
        index: i,
        division: d,
        share,
        rate,
        contributionPp: share * rate,
        spendEur,
        eurPerMonth: rate > -100 ? (spendEur * rate) / (100 + rate) : 0,
      };
    })
    .sort((a, b) => b.contributionPp - a.contributionPp);
}

/**
 * Personal inflation with drill-down: Σ (amount_i / Σamount) × divisionRate_i.
 *
 * Identical to `personalInflation` when no division has been split — the
 * detailed mode is an extension of the simple one, not a second calculator.
 *
 * @param {number[]} amounts
 * @param {Array} divisions
 * @param {Array<number[]|null>} splits
 * @param {'y1'|number} anchor
 * @param {number} fallback  returned when nothing is allocated
 * @returns {number} percent
 */
export function personalInflationDetailed(amounts, divisions, splits, anchor, fallback = 0) {
  const sum = amounts.reduce((s, x) => s + (x > 0 ? x : 0), 0);
  if (sum === 0) return fallback;
  return divisions.reduce(
    (s, d, i) => s + (Math.max(0, amounts[i] ?? 0) / sum) * divisionRate(d, splits[i], anchor),
    0
  );
}

// ---------------------------------------------------------------------------
// PERCENTILE (income ladder)
// ---------------------------------------------------------------------------

// Percentile cut points of the salary ladder. MUST stay in lockstep with
// the pipeline's SALARY_LADDER_CUTS (transform.py) — the published
// `ladder_gross` has exactly one value per cut, in this order.
//
// **A bare array literal, and the shape is load-bearing.** The lockstep above
// is checked from the Python side by `test_ladder_cuts_match_the_frontend`,
// which reads this file as text and matches `const SALARY_LADDER_CUTS = [ … ]`.
// Wrapping it in `Object.freeze(…)` — the ordinary thing to do to an exported
// constant here — makes that regex miss, and a cross-language contract stops
// being checked while both sides still look right.
export const SALARY_LADDER_CUTS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

/**
 * Where does `monthlySalary` land on the NET monthly salary ladder?
 *
 * Returns position FROM THE BOTTOM — position on the percentile ladder, not
 * a rank from the top.
 *   - monthlySalary ≤ ladder[0] (the bottom 1% cut)  → returns 1
 *   - monthlySalary ≥ ladder.at(-1) (the top 99% cut) → returns 99
 *
 * Callers MUST phrase the result as "you earn more than {n}%" (BG-equivalent
 * "изпреварваш {n}%"), NOT "top {n}%" — the latter inverts the direction and
 * produces contradictory copy (a €300/mo single mom would read as "top 1%").
 *
 * Both sides are MONTHLY NET EUR now (no ÷12): the ladder comes from
 * `buildLadder`, which converts each published gross rung to net via
 * `bgNetSalary`, and the salary input is net take-home. This replaces the
 * old ANNUAL household-disposable-income ladder, whose unit mismatch pushed
 * almost every Sofia salary to the 99th percentile.
 *
 * @param {number} monthlySalary  monthly NET, in EUR
 * @param {number[]} ladder  monthly NET salary at percentile cuts 1,10,...,90,99
 * @returns {number}  position from the bottom, 1..99
 */
export function percentile(monthlySalary, ladder) {
  if (!ladder || ladder.length < 2) return 0;
  if (monthlySalary <= ladder[0]) return 1;
  if (monthlySalary >= ladder.at(-1)) return 99;
  for (let i = 1; i < SALARY_LADDER_CUTS.length; i++) {
    if (monthlySalary <= ladder[i]) {
      const [p0, v0] = [SALARY_LADDER_CUTS[i - 1], ladder[i - 1]];
      const [p1, v1] = [SALARY_LADDER_CUTS[i], ladder[i]];
      return Math.round(p0 + ((p1 - p0) * (monthlySalary - v0)) / (v1 - v0));
    }
  }
  return 99;
}

/**
 * Re-level the published Eurostat shape onto НСИ's newest national average.
 *
 * WHY THIS ARITHMETIC IS HERE AND NOT IN THE PIPELINE
 *
 * One publisher per file, joined at the last possible moment.
 * `salary_dist.json` is Eurostat's shape at Eurostat's own level;
 * `sector_salary.json` is НСИ's quarterly figures as НСИ published them. Each
 * carries one publisher's data and travels under that publisher's terms, which
 * is what makes both of them straightforward to redistribute — including by
 * anyone who forks this.
 *
 * The two meet here, in the reader's own tab, and the result never leaves it.
 * docs/legal.md §НСИ.
 *
 * **The split is lossless because re-levelling is a scalar multiply.** Every
 * published rung is `exp(ln_at(z))` built from ln(D1), ln(median) and ln(D9);
 * scaling all three by `f` adds ln(f) to every rung and leaves the two log
 * dispersions untouched. So `rung(f) === f * rung(1)`, exactly. The published
 * rungs carry four decimals precisely so this multiplication rounds once —
 * rounding at 1 dp on both sides moves three of the eleven rungs by €0.10.
 *
 * **The statutory minimum wage floors EVERY rung, after scaling.** A scalar
 * re-level moves the whole distribution by however much the MEAN moved, and
 * Bulgaria's minimum wage has moved faster: €363/month in SES's 2022 vintage
 * against €620.20 today, +71%, where the mean has climbed roughly half as
 * fast. So the bottom of the scaled shape lands under a wage it is not lawful
 * to pay a full-time employee — at the 2026-Q2 average, P10 composes to €572 —
 * and a rung below the legal floor is an artefact of the model rather than a
 * wage anybody is on.
 *
 * The floor is applied after scaling, which is the only place it means
 * anything: an unlevelled rung is not a wage anyone earns. It leaves the ladder
 * weakly rising rather than strictly, and `percentile` is safe on that — a flat
 * pair at the bottom is behind the `salary <= ladder[0]` branch, so the
 * interpolation never divides by a zero span.
 *
 * @param {{shape?: {ladder_ses?: Record<string, number>, ses_mean?: number}}} dist
 * @param {number} anchorGrossMean  today's national mean gross, EUR/month
 * @param {object} [params]  payroll params (from `payrollParams(data.payroll)`)
 * @returns {Record<string, number>} GROSS EUR/month per cut, or {} if unusable
 */
function scaledRungs(dist, anchorGrossMean) {
  const shape = dist?.shape;
  const sesMean = shape?.ses_mean;
  const rungs = shape?.ladder_ses;
  if (!rungs || !(sesMean > 0) || !(anchorGrossMean > 0)) return null;
  const f = anchorGrossMean / sesMean;
  const out = {};
  for (const p of SALARY_LADDER_CUTS) {
    const base = rungs[`P${p}`];
    if (base != null) out[`P${p}`] = base * f;
  }
  return out;
}

export function composeLadder(dist, anchorGrossMean, params = BG_PAYROLL_DEFAULT) {
  const scaled = scaledRungs(dist, anchorGrossMean);
  if (!scaled) return {};
  const out = {};
  for (const [cut, value] of Object.entries(scaled)) {
    out[cut] = Math.round(Math.max(value, params.minWageGross) * 10) / 10;
  }
  return out;
}

/**
 * Which cuts the statutory floor DECIDED rather than the survey.
 *
 * **A floored rung is no longer the survey's answer, and the table that says
 * which rungs were surveyed has to know.** SES measure D1 for Bulgaria; today
 * that decile re-levels to €558, under a €620 minimum, so the number the ladder
 * publishes at P10 is the minimum wage. Marking it «измерено» credits Eurostat
 * with a figure that came out of the ЗБДОО instead — on the one column whose
 * whole job is telling a measurement from a model.
 *
 * It answers about the SCALED rung rather than the published one, which is why
 * this is not a caller comparing `gross` against `minWageGross`: a rung that
 * genuinely lands on the minimum wage was measured there, and the two are the
 * same number on screen.
 *
 * @param {object} dist  salary_dist.json payload
 * @param {number} anchorGrossMean  today's national mean gross, EUR/month
 * @param {object} [params]  payroll params
 * @returns {Set<number>} the cuts in SALARY_LADDER_CUTS the floor replaced
 */
export function flooredCuts(dist, anchorGrossMean, params = BG_PAYROLL_DEFAULT) {
  const scaled = scaledRungs(dist, anchorGrossMean) ?? {};
  return new Set(
    SALARY_LADDER_CUTS.filter((p) => {
      const value = scaled[`P${p}`];
      return value != null && value < params.minWageGross;
    })
  );
}

/**
 * Build the 11-point NET monthly salary ladder the percentile is read off.
 *
 * `composeLadder` gives GROSS monthly EUR at percentile cuts
 * [1,10,20,...,90,99]. The salary input is NET take-home, so each gross rung
 * is converted to net via `bgNetSalary` (the single BG-payroll source of truth
 * in this file, which applies the insurance cap and the 10% flat tax).
 * Comparing net-to-net is what makes the percentile honest.
 *
 * @param {object} dist  salary_dist.json payload
 * @param {number} anchorGrossMean  today's national mean gross, EUR/month
 * @param {object} [params]  payroll params (from `payrollParams(data.payroll)`)
 * @returns {number[]} 11 NET monthly EUR values at cuts 1,10,...,90,99
 */
export function buildLadder(dist, anchorGrossMean, params = BG_PAYROLL_DEFAULT) {
  const gross = composeLadder(dist, anchorGrossMean, params);
  if (!Object.keys(gross).length) return [];
  return SALARY_LADDER_CUTS.map((p) => {
    const g = gross[`P${p}`];
    return g != null ? bgNetSalary(g, params).net : 0;
  });
}

/**
 * How far one monthly net sits from a reference monthly net, as whole percent.
 *
 * One implementation, because there are now two comparisons on the pay card —
 * against the Sofia average and against the reader's chosen sector — and two
 * roundings of the same formula would eventually disagree on screen by a point
 * while both looked right in their own test.
 *
 * `direction` and not a word: this file picks numbers, and the component that
 * renders them picks the language. The dead band is ±1 point, so a reader one
 * euro off the reference reads "about the same" rather than "above".
 *
 * @param {number} net  monthly NET take-home, EUR
 * @param {number} referenceNet  the figure being compared against, monthly NET
 * @returns {{diffPct:number, magnitudePct:number,
 *            direction:'above'|'below'|'equal'} | null} null when unusable
 */
export function wageGap(net, referenceNet) {
  const n = Number(net);
  const ref = Number(referenceNet);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(ref) || ref <= 0) return null;
  const diffPct = Math.round((100 * (n - ref)) / ref);
  return {
    diffPct,
    magnitudePct: Math.abs(diffPct),
    direction: diffPct > 1 ? "above" : diffPct < -1 ? "below" : "equal",
  };
}

/**
 * Where an average wage sits on the distribution it is the average of.
 *
 * **This is the number that stops the sector card lying.** НСИ publish an
 * average by economic activity and nobody publishes a distribution by one, so
 * the sector comparison can only say "18% below the average for your sector".
 * A reader hears that as "below the middle", and it is not: earnings are
 * right-skewed, so the mean sits around the 66th rung and the median earner
 * takes about 74% of it. Someone can be well below their sector's average and
 * still be paid more than most people in it.
 *
 * **It takes the distribution and nothing else, and that is deliberate.**
 * Handed a sector average as an anchor, this would return a sector percentile —
 * the exact figure the feature exists to say nobody publishes. There is no
 * parameter through which that can be attempted. `site/AGENTS.md`: where a
 * wrong wiring would be a wrong number, make the wrong wiring impossible to
 * express.
 *
 * Read off Eurostat's shape at Eurostat's own level, so no НСИ figure enters
 * it and no payroll parameter can move it. It is also exactly scale-invariant —
 * re-levelling multiplies every rung and the mean by the same factor — which is
 * why it is a statement about the shape of Bulgarian earnings rather than about
 * whichever average happens to be on screen.
 *
 * `medianPct` is rounded here rather than in the template, because a rounding
 * done in the render layer is arithmetic no unit test can reach.
 *
 * `meanAboveMedian` is the one field the sector card renders on. The caveat it
 * gates states the skew in words and shows neither level, so nothing on screen
 * evidences it — the reader is taking «повече от половината заети изкарват под
 * средната» on our word. That sentence is true exactly when the published
 * median sits below the published mean, so the condition is read off the
 * payload and the copy renders only where the data carries it. Earnings have
 * been right-skewed in every SES round, which is the argument for asserting it
 * and not the argument for assuming it.
 *
 * @param {object} dist  salary_dist.json payload
 * @param {string} [shapeYear]  the survey vintage, echoed back for the caption
 * @returns {{cut:number, medianPct:number, meanAboveMedian:boolean,
 *            shapeYear:string} | null}
 */
export function meanRungPosition(dist, shapeYear = "") {
  const shape = dist?.shape;
  const mean = shape?.ses_mean;
  const rungs = shape?.ladder_ses;
  if (!rungs || !(mean > 0)) return null;
  const ladder = SALARY_LADDER_CUTS.map((p) => rungs[`P${p}`]);
  if (ladder.some((v) => !(v > 0))) return null;
  const median = rungs.P50;
  if (!(median > 0)) return null;
  return {
    cut: percentile(mean, ladder),
    medianPct: Math.round((100 * median) / mean),
    meanAboveMedian: median < mean,
    // The two PUBLISHED figures the ratio above divides. Eurostat print a mean
    // and a median for BG; the ratio between them is ours, and a caller that
    // stated only the ratio under a Eurostat credit would be crediting them
    // with our arithmetic.
    mean,
    median,
    shapeYear: String(shapeYear || shape?.ref_year || ""),
  };
}

// ---------------------------------------------------------------------------
// RENT
// ---------------------------------------------------------------------------

export function rentBurden(rent, salary) {
  if (salary <= 0) return 0;
  return (100 * rent) / salary;
}

export function rentDays(rent, salary) {
  if (salary <= 0) return 0;
  return Math.min(30, Math.max(1, Math.round((30 * rent) / salary)));
}

// ---------------------------------------------------------------------------
// HOME (mortgage)
// ---------------------------------------------------------------------------

/**
 * Annuity payment on a loan, monthly.
 * @param {number} loan
 * @param {number} ratePct
 * @param {number} termYears
 * @returns {number} EUR/month
 */
export function annuityPayment(loan, ratePct, termYears) {
  const m = ratePct / 100 / 12;
  const n = termYears * 12;
  if (m === 0) return loan / n;
  return (loan * m) / (1 - Math.pow(1 + m, -n));
}

/**
 * Inverse of annuityPayment: given a target monthly payment, what is
 * the maximum loan principal? Used for the "what can I afford?" reverse
 * calc — given salary × capPct, the largest loan the user can service.
 *
 * @param {number} payment - target monthly payment in EUR
 * @param {number} ratePct - annual rate in percent
 * @param {number} termYears
 * @returns {number} EUR loan principal
 */
export function annuityReverse(payment, ratePct, termYears) {
  const m = ratePct / 100 / 12;
  const n = termYears * 12;
  if (m === 0) return payment * n;
  if (payment <= 0 || n <= 0) return 0;
  return (payment * (1 - Math.pow(1 + m, -n))) / m;
}

export function homeYears(price, salary) {
  if (salary <= 0) return Infinity;
  return price / (salary * 12);
}

// ---------------------------------------------------------------------------
// BG PAYROLL (gross <-> net) — 2026 formula
// ---------------------------------------------------------------------------

/**
 * Bulgarian employee social-contribution + income-tax rates for 2026.
 * Category 01 (III категория труд, born after 1959) — the default for
 * a typical Sofia office worker. Rates are decimal fractions; the five
 * employee lines sum to 13.78%.
 */
export const BG_2026_RATES = Object.freeze({
  /** ДОО Пенсии, фонд Пенсии (1st pillar), born after 1959, III категория */
  pension: 0.0658,
  /** ДЗПО, Универсален пенсионен фонд (2nd pillar, supplementary), born after 1959 */
  pension2: 0.022,
  /** ОЗМ, общо заболяване и майчинство (general sickness & maternity) */
  sicknessMaternity: 0.014,
  /** Безработица (unemployment fund) */
  unemployment: 0.004,
  /** ЗОВ, здравно осигуряване (health insurance, NHIF) */
  health: 0.032,
});

/**
 * The five employee contribution lines in payslip order, keyed as
 * `BG_2026_RATES` keys. This array is what makes the itemised breakdown
 * enumerable: the renderer walks it, so a line can never be silently
 * dropped from the display while still being deducted from the pay.
 */
export const BG_CONTRIB_LINES = Object.freeze([
  "pension",
  "pension2",
  "sicknessMaternity",
  "unemployment",
  "health",
]);

/**
 * `payroll.json`'s snake_case contribution keys → the camelCase keys used
 * here. Kept as an explicit map rather than a string transform: a transform
 * would silently produce a key that does not exist if the pipeline renamed a
 * fund, and a missing rate reads as a 0% line — a deduction that vanishes
 * from the breakdown while the total it belongs to stays put.
 */
const CONTRIB_KEY_BY_PUBLISHED = Object.freeze({
  pension: "pension",
  pension2: "pension2",
  sickness_maternity: "sicknessMaternity",
  unemployment: "unemployment",
  health: "health",
});

/**
 * The осигурител's side of the same five funds, same insured person — III
 * категория труд, born after 1959. Offline sentinel only; the live figures come
 * from `payroll.json`, and `test_payroll.py` holds these against the pipeline's
 * dated table.
 *
 * Фонд „Пенсии“ is 8.22% and not 8.88%: three of the five funds are split
 * 60:40 and this one is not (КСО чл. 6, ал. 3, т. 9 plus the two rises in чл.
 * 6, ал. 1, т. 4). ДЗПО-УПФ is the other exception, at 2.8/2.2 under чл. 157,
 * ал. 3. `pipeline/.../payroll.py#EMPLOYER_RATE_DERIVATION` is where that
 * reasoning lives, and it is named here rather than restated.
 */
export const BG_2026_EMPLOYER_RATES = Object.freeze({
  pension: 0.0822,
  pension2: 0.028,
  sicknessMaternity: 0.021,
  unemployment: 0.006,
  health: 0.048,
});

/**
 * Sum of the five employer lines — 18.52%, and ТЗПБ is deliberately NOT in it.
 * That contribution is set per economic activity (0.4%–1.1%), so there is no
 * one number to add; it arrives separately and is a range until a sector says
 * otherwise.
 */
export const BG_2026_TOTAL_EMPLOYER_RATE = Object.freeze(
  BG_2026_EMPLOYER_RATES.pension +
    BG_2026_EMPLOYER_RATES.pension2 +
    BG_2026_EMPLOYER_RATES.sicknessMaternity +
    BG_2026_EMPLOYER_RATES.unemployment +
    BG_2026_EMPLOYER_RATES.health
);

/**
 * The ТЗПБ span КСО чл. 6, ал. 1, т. 7 sets, as the offline sentinel's fallback
 * for a reader whose sector is unknown. Both ends, never a midpoint — a single
 * figure here would be a rate no statute names.
 */
export const BG_2026_WORK_ACCIDENT = Object.freeze({ min: 0.004, max: 0.011 });

/** Sum of all employee contributions — should equal 13.78%. */
export const BG_2026_TOTAL_EMPLOYEE_RATE = Object.freeze(
  BG_2026_RATES.pension +
    BG_2026_RATES.pension2 +
    BG_2026_RATES.sicknessMaternity +
    BG_2026_RATES.unemployment +
    BG_2026_RATES.health
);

/** Bulgaria 2026 flat personal income tax rate (no tax-free allowance). */
export const BG_2026_INCOME_TAX_RATE = 0.1;

/**
 * Maximum monthly insurable income, ЗБДОО 2026 as in force from
 * 2026-08-01. Insurance contributions are capped at this level: if gross
 * exceeds €2300, we apply the employee rates to €2300 only. The excess
 * above the cap is NOT exempt from income tax — only the
 * social-contribution base is capped.
 *
 * The statute sets this side in euro, so €2300 is exact and the BGN side
 * (4498.41) is the conversion. Deriving it the other way from the round
 * 4500 BGN the press quotes would publish €2300.81, a figure in no
 * statute — `payroll.py#_pair` is where that direction is fixed.
 */
export const BG_2026_MAX_INSURABLE = 2300.0;

/** Bulgaria 2026 statutory minimum GROSS monthly wage, EUR (1213 BGN). */
export const BG_2026_MIN_WAGE_GROSS = 620.2;

/**
 * OFFLINE SENTINEL — the frozen 2026 payroll parameters, used only when
 * `payroll.json` hasn't loaded (offline build, first paint before fetch
 * resolves). The LIVE source of truth is the pipeline-published
 * `payroll.json`; map it into this shape with `payrollParams(data.payroll)`
 * and pass the result to `bgNetSalary` / `bgGrossFromNet` / `buildLadder`.
 * Keep these numbers in parity with pipeline/src/vyarno_pipeline/payroll.py
 * (a pipeline test asserts it).
 */
export const BG_PAYROLL_DEFAULT = Object.freeze({
  rates: BG_2026_RATES,
  totalEmployeeRate: BG_2026_TOTAL_EMPLOYEE_RATE,
  employerRates: BG_2026_EMPLOYER_RATES,
  totalEmployerRate: BG_2026_TOTAL_EMPLOYER_RATE,
  workAccident: BG_2026_WORK_ACCIDENT,
  incomeTaxRate: BG_2026_INCOME_TAX_RATE,
  maxInsurable: BG_2026_MAX_INSURABLE,
  minWageGross: BG_2026_MIN_WAGE_GROSS,
});

/**
 * Map the published `payroll.json` payload into the params shape the
 * payroll functions expect, falling back to `BG_PAYROLL_DEFAULT` for any
 * missing field (so a partial or absent JSON degrades gracefully). This is
 * what makes the gross→net math data-driven: when BG law changes, the
 * pipeline republishes payroll.json and the SPA needs no code change.
 *
 * @param {object|null|undefined} payload  data.payroll (payroll.json)
 * @returns {{totalEmployeeRate:number, incomeTaxRate:number, maxInsurable:number, minWageGross:number}}
 */
export function payrollParams(payload) {
  if (!payload) return BG_PAYROLL_DEFAULT;
  const rates = payload.employee_contrib_rates || {};
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  // The five per-fund lines are taken from the payload only if ALL FIVE are
  // present and numeric. A partial read is the failure mode that matters: it
  // would render an itemised breakdown whose rows sum to less than the total
  // deduction printed under them, which is precisely the defect the itemised
  // view exists to expose. All-or-nothing keeps the sentinel's five lines
  // together with the sentinel's total.
  const lines = {};
  let complete = true;
  for (const [published, key] of Object.entries(CONTRIB_KEY_BY_PUBLISHED)) {
    const v = rates[published];
    if (!Number.isFinite(v)) {
      complete = false;
      break;
    }
    lines[key] = v;
  }
  // The employer's five lines, read all-or-nothing for the same reason as the
  // employee's above: a partial read renders a labour-cost breakdown whose rows
  // sum to less than the total printed under them.
  const employerLines = {};
  let employerComplete = true;
  for (const [published, key] of Object.entries(CONTRIB_KEY_BY_PUBLISHED)) {
    const v = (payload.employer_contrib_rates || {})[published];
    if (!Number.isFinite(v)) {
      employerComplete = false;
      break;
    }
    employerLines[key] = v;
  }

  // ТЗПБ's span, from the payload's own `work_accident` block. Both ends or
  // neither: a `min` that resolved and a `max` that did not would render as a
  // sector charged exactly its floor, which is a claim the act does not make
  // for any sector spanning more than one rate.
  const wa = payload.work_accident || {};
  const workAccident =
    Number.isFinite(wa.min) && Number.isFinite(wa.max) && wa.min <= wa.max
      ? Object.freeze({ min: wa.min, max: wa.max })
      : BG_PAYROLL_DEFAULT.workAccident;

  return {
    rates: complete ? Object.freeze(lines) : BG_PAYROLL_DEFAULT.rates,
    totalEmployeeRate: num(rates.total, BG_PAYROLL_DEFAULT.totalEmployeeRate),
    employerRates: employerComplete
      ? Object.freeze(employerLines)
      : BG_PAYROLL_DEFAULT.employerRates,
    totalEmployerRate: num(
      (payload.employer_contrib_rates || {}).total,
      BG_PAYROLL_DEFAULT.totalEmployerRate
    ),
    workAccident,
    incomeTaxRate: num(payload.income_tax_rate, BG_PAYROLL_DEFAULT.incomeTaxRate),
    maxInsurable: num(payload.max_insurable_income_eur, BG_PAYROLL_DEFAULT.maxInsurable),
    minWageGross: num(payload.min_wage_gross_eur, BG_PAYROLL_DEFAULT.minWageGross),
  };
}

/**
 * Bulgarian net take-home pay from gross monthly salary.
 *
 * @param {number} gross   gross monthly salary in EUR
 * @param {{totalEmployeeRate:number, incomeTaxRate:number, maxInsurable:number}} [params]
 *   payroll parameters (from `payrollParams(data.payroll)`); defaults to the
 *   frozen `BG_PAYROLL_DEFAULT` offline sentinel
 * @returns {{gross, insurableBase, insurance, taxable, tax, net,
 *           effectiveRatePct, insuranceCapped}}
 *
 * Where:
 *   gross            input salary, unchanged
 *   insurableBase    min(gross, BG_2026_MAX_INSURABLE) — cap for
 *                     social-contribution purposes only
 *   insurance        insurableBase × 13.78%
 *   taxable          gross − insurance (income tax base; NOT capped)
 *   tax              taxable × 10%
 *   net              gross − insurance − tax
 *   effectiveRatePct (gross − net) / gross × 100
 *   insuranceCapped   true if the input exceeded the max-insurable cap
 *
 * Worked example (gross = 1000 EUR, no cap):
 *   insurance = 1000 × 0.1378 = 137.80
 *   taxable   = 1000 − 137.80  = 862.20
 *   tax       = 862.20 × 0.10   = 86.22
 *   net       = 1000 − 137.80 − 86.22 = 775.98
 *   effective = 22.40%
 *
 * Worked example (gross = 3000 EUR, cap kicks in at the 2026-08-01 ceiling):
 *   insurableBase = 2300 (capped)
 *   insurance     = 2300 × 0.1378 = 316.94
 *   taxable       = 3000 − 316.94 = 2683.06
 *   tax           = 2683.06 × 0.10  = 268.31
 *   net           = 3000 − 316.94 − 268.31 = 2414.75
 *   effective     = 19.51%
 */
export function bgNetSalary(gross, params = BG_PAYROLL_DEFAULT) {
  const g = Number(gross);
  if (!Number.isFinite(g) || g <= 0) {
    return {
      gross: g || 0,
      insurableBase: 0,
      insurance: 0,
      taxable: 0,
      tax: 0,
      net: 0,
      effectiveRatePct: 0,
      insuranceCapped: false,
    };
  }
  const insurableBase = Math.min(g, params.maxInsurable);
  const insuranceCapped = g > params.maxInsurable;
  const insurance = insurableBase * params.totalEmployeeRate;
  const taxable = g - insurance;
  const tax = taxable * params.incomeTaxRate;
  const net = g - insurance - tax;
  const effectiveRatePct = g > 0 ? (100 * (g - net)) / g : 0;
  return {
    gross: g,
    insurableBase,
    insurance,
    taxable,
    tax,
    net,
    effectiveRatePct,
    insuranceCapped,
  };
}

/**
 * Inverse of `bgNetSalary` — given a target net monthly salary, recover
 * the gross. The SPA's salary field collects the user's take-home (what
 * they see on the payslip), not their GROSS contract amount; this
 * helper back-computes GROSS so the Sofia comparator card and the
 * prescription math can compare like-with-like.
 *
 * The formula is piecewise because of the social-contribution cap.
 * Below the cap, insurance scales linearly with gross; above the cap,
 * insurance is flat (the cap amount × rate).
 *
 *   Branch 1 (gross <= cap):
 *     net = gross × (1 − R − R_tax × (1 − R))
 *     gross = net / (1 − R − R_tax × (1 − R))
 *           = net / 0.77598
 *
 *   Branch 2 (gross > cap):
 *     net = gross − capR − 0.10 × (gross − capR)
 *         = 0.90 × gross − capR × 0.90
 *     gross = (net + capR × 0.90) / 0.90
 *
 * The cap affects ONLY the social-contribution base, not the income-tax
 * base — so Branch 2 inverts with the (1 − R_tax) factor, NOT the
 * simpler (1 + R_tax) a casual reader would expect.
 *
 * Both candidates are computed; the one whose `bgNetSalary(gross).net`
 * round-trips closer to the input wins. Tiebreak: branch 1.
 *
 * @param {number} net  target net monthly salary in EUR
 * @returns {number}    gross monthly salary that produces this net
 */
export function bgGrossFromNet(net, params = BG_PAYROLL_DEFAULT) {
  const n = Number(net);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const R = params.totalEmployeeRate;
  const Rtax = params.incomeTaxRate;
  const cap = params.maxInsurable;
  const capInsurance = cap * R;

  const denom = 1 - R - Rtax * (1 - R);
  const candidateB1 = n / denom;

  const candidateB2 = (n + capInsurance * (1 - Rtax)) / (1 - Rtax);

  const roundB1 = bgNetSalary(candidateB1, params);
  const roundB2 = bgNetSalary(candidateB2, params);
  const errB1 = Math.abs(roundB1.net - n);
  const errB2 = Math.abs(roundB2.net - n);
  return errB1 <= errB2 ? roundB1.gross : roundB2.gross;
}

// ---------------------------------------------------------------------------
// THE ITEMISED PAYSLIP — the same number, shown line by line
// ---------------------------------------------------------------------------

/** Round to the cent. The unit every figure in the breakdown is displayed in. */
function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Split `total` into cent amounts proportional to `weights`, summing EXACTLY
 * to `round2(total)`.
 *
 * Rounding each line independently does not do this, and the error is
 * visible on screen: at a gross of €601 the five employee lines round to
 * 39.55 + 13.22 + 8.41 + 2.40 + 19.23 = €82.81 under a stated total of
 * €82.82, because sickness-maternity's 8.4114 loses its remainder and
 * nothing gives it back. A breakdown whose rows do not add up to its own
 * total teaches the reader to distrust the total, so the last cent is
 * allocated by largest remainder instead of dropped.
 *
 * One gross in roughly every 2.5 euro of the range does this, so a handful
 * of round salaries will not reveal it — `verify_net_salary.mjs` sweeps.
 *
 * @param {number} total    the amount to split, in EUR
 * @param {number[]} weights  relative shares (the per-fund rates)
 * @returns {number[]} EUR amounts, each a whole number of cents
 */
function allocateToCents(total, weights) {
  const cents = Math.round(total * 100);
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const wSum = w.reduce((a, b) => a + b, 0);
  if (wSum <= 0 || cents <= 0) return w.map(() => 0);

  const exact = w.map((x) => (cents * x) / wSum);
  const out = exact.map(Math.floor);
  const short = cents - out.reduce((a, b) => a + b, 0);
  // Largest fractional remainder first; ties by position, so the split is
  // deterministic and does not depend on the sort's stability.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < short; k += 1) out[order[k].i] += 1;
  return out.map((c) => c / 100);
}

/**
 * The whole payslip for a GROSS salary, line by line, in cents that add up.
 *
 * `bgNetSalary` answers "what is the net"; this answers "where did the rest
 * of it go", which is the question a reader actually checks a calculator
 * with. Every figure here is already rounded to the cent, and each total is
 * computed FROM the rounded figures above it rather than from full
 * precision — so the column the reader adds up by hand is the column that
 * balances. (`bgNetSalary` stays full-precision and is still what every
 * downstream comparison uses; this is the display layer of the same maths.)
 *
 * @param {number} gross  gross monthly salary in EUR
 * @param {{rates:object, totalEmployeeRate:number, incomeTaxRate:number, maxInsurable:number}} [params]
 * @returns {{gross:number, insurableBase:number, insuranceCapped:boolean,
 *            lines:Array<{key:string, ratePct:number, amount:number}>,
 *            insurance:number, taxable:number, incomeTaxRatePct:number,
 *            tax:number, totalDeductions:number, net:number,
 *            effectiveRatePct:number}}
 */
export function bgPayrollBreakdown(gross, params = BG_PAYROLL_DEFAULT) {
  const exact = bgNetSalary(gross, params);
  const rates = params.rates || BG_PAYROLL_DEFAULT.rates;

  const g = round2(exact.gross > 0 ? exact.gross : 0);
  const insurance = round2(exact.insurance);
  // Allocated against the insurance ACTUALLY deducted (base × the total
  // rate), not against a re-multiplication of each line. If a payload ever
  // shipped five lines that do not sum to its own `total`, the rows would
  // still account for every cent withheld rather than for a total nobody
  // is charged.
  const amounts = allocateToCents(
    insurance,
    BG_CONTRIB_LINES.map((k) => rates[k] ?? 0)
  );
  const lines = BG_CONTRIB_LINES.map((key, i) => ({
    key,
    ratePct: 100 * (rates[key] ?? 0),
    amount: amounts[i],
  }));

  const taxable = round2(g - insurance);
  const tax = round2(taxable * params.incomeTaxRate);
  const totalDeductions = round2(insurance + tax);
  const net = round2(g - totalDeductions);

  return {
    gross: g,
    insurableBase: round2(exact.insurableBase),
    insuranceCapped: exact.insuranceCapped,
    lines,
    insurance,
    taxable,
    incomeTaxRatePct: 100 * params.incomeTaxRate,
    tax,
    totalDeductions,
    net,
    effectiveRatePct: g > 0 ? (100 * totalDeductions) / g : 0,
  };
}

/**
 * The itemised payslip for a target NET — the direction the SPA asks in.
 *
 * `bgGrossFromNet` returns a full-precision gross, and the breakdown has to
 * be shown in cents. Rounding that gross to the nearest cent is NOT always
 * the gross that pays the typed net: for €2100 net the exact inverse is
 * €2624.3173, whose nearest cent (€2624.32) works out at €2100.01 once every
 * line is rounded. Both neighbouring cents are therefore tried and the one
 * that reproduces the typed net wins, so the bottom line of the breakdown is
 * the number the reader put in rather than a cent away from it.
 *
 * This is the same class of error, one decimal place down, as the one that
 * makes a net→gross answer wrong wholesale: inverting with the below-ceiling
 * formula (net / 0.77598) and then itemising WITH the ceiling. That gives
 * €2706.26 for €2100 net, over a deduction column that adds up to a
 * different net entirely — a mistake worth tens of euros a month for anyone
 * whose gross clears the ceiling, and invisible to anyone who does not check
 * the column against the answer above it. The fix at both scales is the
 * same — make the inverse answer to the forward function, and check that it
 * does.
 *
 * @param {number} net  target monthly NET take-home in EUR
 * @param {{rates:object, totalEmployeeRate:number, incomeTaxRate:number, maxInsurable:number}} [params]
 * @returns {ReturnType<typeof bgPayrollBreakdown>}
 */
export function bgPayslipFromNet(net, params = BG_PAYROLL_DEFAULT) {
  const n = Number(net);
  if (!Number.isFinite(n) || n <= 0) return bgPayrollBreakdown(0, params);

  const raw = bgGrossFromNet(n, params);
  const candidates = [Math.floor(raw * 100) / 100, Math.ceil(raw * 100) / 100];
  let best = null;
  for (const g of candidates) {
    const b = bgPayrollBreakdown(g, params);
    if (best === null || Math.abs(b.net - n) < Math.abs(best.net - n)) best = b;
  }
  return best;
}

// ---------------------------------------------------------------------------
// THE HOUSEHOLD — several incomes, each taxed on its own
// ---------------------------------------------------------------------------

/**
 * What the household brings home: the sum of the earners' net pay.
 *
 * Anything that is not a positive number is skipped rather than counted as
 * zero-and-included or propagated as NaN. Both failure modes are reachable from
 * the keyboard: a second income field that has been added but not filled in
 * arrives as `undefined`, and a field cleared back to empty arrives the same
 * way. One `NaN` in this sum would blank every figure on the page, so a person
 * who has not been described yet contributes nothing and the rest of the
 * household still answers.
 *
 * @param {Array<number|null|undefined>} nets  one monthly NET take-home per earner
 * @returns {number} EUR/month
 */
export function householdNet(nets) {
  return (nets ?? []).reduce((sum, n) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? sum + v : sum;
  }, 0);
}

/**
 * The household payslip: one itemised breakdown per earner, and the totals.
 *
 * **WHY THIS IS NOT `bgPayslipFromNet(householdNet(nets))`.** The insurance
 * ceiling is a property of one contract, not of a family. Two people earning
 * €2000 gross each are both under the €2300 ceiling and pay the full 13.78% on
 * every euro; one person earning €4000 pays it on €2300 and nothing above.
 * Inverting a combined net as though it were a single salary applies one
 * ceiling to two people and understates the household's gross:
 *
 *   two earners at €2000 gross     net 1551.96 each  = 3103.92 together
 *   inverted as one salary         gross 3765.75     — €234 short of €4000
 *   summed per earner              gross 4000.00     — the contracts they signed
 *
 * The error is silent, it is inside every plausible band, and it grows with the
 * household. So the ONLY entry point for a household is this function, which
 * takes the earners separately and never sees a combined figure.
 *
 * Every earner's column already balances to the cent (`bgPayslipFromNet`), and
 * the household totals are sums of those cent figures rather than a second
 * rounding of full-precision values — so `gross − totalDeductions === net`
 * holds for the household exactly as it holds for each person in it.
 *
 * Non-positive entries are dropped, and each surviving entry carries the
 * `index` it had in the input. The UI draws one row per earner and has to be
 * able to say WHICH earner a column belongs to; re-deriving that from the
 * position in a filtered array would mislabel every earner after a blank one.
 *
 * @param {Array<number|null|undefined>} amounts  one monthly figure per earner
 * @param {{rates:object, totalEmployeeRate:number, incomeTaxRate:number, maxInsurable:number}} [params]
 * @param {'net'|'gross'} [basis]  which figure `amounts` carries
 * @returns {{earners:Array<ReturnType<typeof bgPayrollBreakdown> & {index:number}>,
 *            gross:number, insurance:number, tax:number, totalDeductions:number,
 *            net:number, effectiveRatePct:number, anyCapped:boolean}}
 */
export function bgHouseholdPayroll(amounts, params = BG_PAYROLL_DEFAULT, basis = "net") {
  const earners = [];
  (amounts ?? []).forEach((n, index) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return;
    // In gross mode the reader typed the contract amount, so the payslip is
    // computed FORWARDS and there is no inversion to round-trip. Going
    // gross → net → gross to reuse one code path would put the answer a cent
    // away from the number they typed, on the one line they can check against
    // their own contract.
    earners.push({
      index,
      ...(basis === "gross" ? bgPayrollBreakdown(v, params) : bgPayslipFromNet(v, params)),
    });
  });

  const total = (key) => round2(earners.reduce((s, e) => s + e[key], 0));
  const gross = total("gross");
  const totalDeductions = total("totalDeductions");

  return {
    earners,
    gross,
    insurance: total("insurance"),
    tax: total("tax"),
    totalDeductions,
    net: total("net"),
    // Total deductions over total gross — NOT the mean of the per-earner rates.
    // A €3,000 earner beside a €700 one is weighted by pay, not counted one
    // each, and the two answers differ by whole points once anybody clears the
    // ceiling.
    effectiveRatePct: gross > 0 ? (100 * totalDeductions) / gross : 0,
    anyCapped: earners.some((e) => e.insuranceCapped),
  };
}

/**
 * The household's nominal change in TAKE-HOME pay over the raise window.
 *
 * **Weighted by what each earner was paid BEFORE, not by what they are paid
 * now**, because that is what a percentage change is. Two earners on €1,000
 * today, one of whom got +20% and one nothing, are a household that went from
 * €1,833.33 to €2,000 — a rise of 9.09%, not the 10% a straight average of the
 * two rates gives. The overstatement grows with the spread between them, and it
 * always flatters: the earner who got the bigger rise is the one whose current
 * pay is inflated by it.
 *
 * **It answers in NET terms whichever basis the reader is typing in**, because
 * the figure it feeds is deflated by their own prices, and prices are paid out
 * of take-home. In gross mode a 10% rise on a contract that clears the
 * insurance ceiling is worth more than 10% in the pocket — contributions stop
 * but the pay does not — so converting the before-and-after separately is the
 * only way the answer stays true either side of the ceiling.
 *
 * **NaN unless every earner who has pay also has a raise.** A blank raise
 * treated as 0% is an invented number (docs/principles.md P7) that drags the
 * household's figure down, and one treated as "same as the others" invents a
 * different one. The row that renders this says which income is still missing
 * rather than answering around it.
 *
 * Reduces EXACTLY to the typed raise for a single earner in net mode, which is
 * what it has always been.
 *
 * @param {object} pay
 * @param {'net'|'gross'} pay.basis
 * @param {Array<number|null|undefined>} pay.amounts  one per earner
 * @param {Array<number|null|undefined>} pay.raises   percent, one per earner
 * @param {object} [params]  payroll parameters
 * @returns {number} percent, or NaN when the household is not fully described
 */
export function householdNetRaisePct(
  { basis = "net", amounts, raises },
  params = BG_PAYROLL_DEFAULT
) {
  let now = 0;
  let before = 0;
  const list = amounts ?? [];
  for (let i = 0; i < list.length; i += 1) {
    const amount = Number(list[i]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    // `null`, `undefined` and `""` all coerce to 0, and 0 is a legitimate
    // answer — «нямаше увеличение». So the unanswered cases are checked BEFORE
    // the coercion; without that, a blank field reads as "no raise" and drags
    // the household's figure down with a number nobody entered.
    const stated = (raises ?? [])[i];
    if (stated === null || stated === undefined || stated === "") return NaN;
    const r = Number(stated);
    // −100% and below would put the earlier pay at infinity or make it negative.
    if (!Number.isFinite(r) || r <= -100) return NaN;
    const earlier = amount / (1 + r / 100);
    now += basis === "gross" ? bgNetSalary(amount, params).net : amount;
    before += basis === "gross" ? bgNetSalary(earlier, params).net : earlier;
  }
  if (!(before > 0)) return NaN;
  return 100 * (now / before - 1);
}

// ---------------------------------------------------------------------------
// THE TAX WEDGE — what "flat tax" leaves out (the tax wedge)
// ---------------------------------------------------------------------------

/**
 * The share of the NEXT euro of gross pay that does not reach the pocket.
 *
 * This is the figure the phrase "flat tax" hides, and it is computable from
 * two published parameters:
 *
 *   below the cap:  R + Rtax × (1 − R)   = 13.78% + 10% × 86.22% = 22.402%
 *   above the cap:  Rtax                 = 10.000%
 *
 * because social contributions stop at `maxInsurable` while the income-tax
 * base does not. So the **marginal** rate FALLS at the ceiling — from 22.402%
 * to 10% — and the effective rate peaks there and declines afterwards toward
 * 10%. Bulgaria's tax is flat; its burden is not.
 *
 * Exactly AT the cap the next euro is already outside the insurance base, so
 * the boundary belongs to the upper branch. `bgTaxWedge` relies on that:
 * `peakEffectivePct` is measured at the cap and is the maximum of the curve.
 *
 * Not derived from `bgNetSalary` differences on purpose — a numerical slope
 * would be right to a few decimals and would hide the discontinuity, which is
 * the entire point of the figure.
 *
 * @param {number} gross  gross monthly salary in EUR
 * @param {{totalEmployeeRate:number, incomeTaxRate:number, maxInsurable:number}} [params]
 * @returns {number} percent (22.402 means 22.402%)
 */
export function bgMarginalRatePct(gross, params = BG_PAYROLL_DEFAULT) {
  const g = Number(gross);
  const Rtax = params.incomeTaxRate;
  if (!Number.isFinite(g) || g < 0) return 0;
  if (g >= params.maxInsurable) return 100 * Rtax;
  const R = params.totalEmployeeRate;
  return 100 * (R + Rtax * (1 - R));
}

/**
 * The whole curve, plus the three numbers the panel states in words.
 *
 * `points` is sampled for drawing; `capGross`, `peakEffectivePct`,
 * `marginalBelowPct` and `marginalAbovePct` are computed exactly rather than
 * read off the sample, so the stated figures never depend on where the
 * sampling happened to land. The cap itself is always a sample point — a
 * curve whose only kink is skipped by the sampler is a straight line, which
 * would be a wrong picture rather than a coarse one.
 *
 * `capRisePerMonth` prices the legislated change `payroll.json` has carried,
 * dated and unrendered, since it was published: when the ceiling rises the
 * insurance base widens, and anyone earning above the NEW cap pays
 * `(newCap − cap) × R` more per month. Null when no such change is scheduled.
 *
 * @param {object} args
 * @param {{totalEmployeeRate:number, incomeTaxRate:number, maxInsurable:number}} args.params
 * @param {number} [args.maxGross]   right-hand end of the curve, EUR/month
 * @param {number} [args.steps]      sample count (excluding the forced cap point)
 * @param {number|null} [args.nextCap]  a legislated future max insurable income
 * @returns {{capGross:number, peakEffectivePct:number, marginalBelowPct:number,
 *            marginalAbovePct:number, capRisePerMonth:number|null,
 *            points:Array<{gross:number, effectivePct:number, marginalPct:number}>}}
 */
export function bgTaxWedge({
  params = BG_PAYROLL_DEFAULT,
  maxGross = 6000,
  steps = 60,
  nextCap = null,
} = {}) {
  const cap = params.maxInsurable;
  const top = Math.max(maxGross, cap * 1.5);

  const sampled = [];
  for (let i = 1; i <= steps; i += 1) sampled.push((top * i) / steps);
  sampled.push(cap);
  const grosses = [...new Set(sampled)].sort((a, b) => a - b);

  const points = grosses.map((gross) => ({
    gross,
    effectivePct: bgNetSalary(gross, params).effectiveRatePct,
    marginalPct: bgMarginalRatePct(gross, params),
  }));

  const rise =
    Number.isFinite(nextCap) && nextCap > cap ? (nextCap - cap) * params.totalEmployeeRate : null;

  return {
    capGross: cap,
    // The effective rate at the cap IS the maximum of the curve: below it the
    // rate is constant, above it every extra euro is taxed at less than the
    // average so far. Taken from bgNetSalary so the two can never disagree.
    peakEffectivePct: bgNetSalary(cap, params).effectiveRatePct,
    // Sampled either side of the discontinuity rather than at it, so a change
    // to the boundary convention shows up here as a failing test.
    marginalBelowPct: bgMarginalRatePct(cap - 1, params),
    marginalAbovePct: bgMarginalRatePct(cap + 1, params),
    capRisePerMonth: rise,
    points,
  };
}

// ---------------------------------------------------------------------------
// THE LABOUR TAX WEDGE — the same gap, measured over what the job costs
// ---------------------------------------------------------------------------
//
// **A DIFFERENT DENOMINATOR FROM EVERYTHING ABOVE, AND THAT IS THE POINT.**
// `bgNetSalary().effectiveRatePct` is what leaves a GROSS salary; this is what
// never arrives out of the TOTAL COST of employing somebody. `docs/math.md`
// §"The labour tax wedge, and the denominator that is the whole point" is why
// neither figure may travel without its base named beside it.

/**
 * What one contract costs, and how that cost divides.
 *
 * The definition is OECD/EC's, stated here because more than one is defensible:
 *
 *   labour cost = gross + employer contributions
 *   net         = gross − employee contributions − income tax
 *   wedge       = (labour cost − net) / labour cost
 *
 * **The flat 10% is inside the wedge**, which is the choice a reader is most
 * likely to expect otherwise: under OECD methodology the wedge is every
 * compulsory levy on employing a person, income tax included, and leaving the
 * tax out answers "what do the contributions take" under the wider name.
 *
 * **Both sides stop at the same ceiling.** КСО чл. 6, ал. 3 puts contributions
 * on no more than the maximum insurable income and only THEN splits them
 * between осигурител and осигурено лице, so there is one capped base; чл. 157,
 * ал. 6 and ЗЗО чл. 40, ал. 1, т. 1 put ДЗПО and health on that same base.
 * Capping only the employee's half would keep the wedge near 35% at every
 * salary, and the whole shape above €2300 would be wrong.
 *
 * **`workAccidentRate` carries no default, and JavaScript cannot make that
 * stick.** ТЗПБ is a RANGE until a sector narrows it, so no rate picked here
 * would read as anything but an answer — yet an omitted argument arrives as
 * `undefined` and falls to the zero branch below, a labour cost short by up to
 * 1.1% of gross and complete-looking. The guarantee is therefore structural:
 * both callers take a `{min, max}` band from
 * `view/employer.js#sectorWorkAccident`, which answers the act's whole span for
 * a sector it does not know and so never answers nothing. A third caller is
 * where that breaks. A caller holding a range calls this twice.
 *
 * @param {number} gross  gross monthly salary in EUR
 * @param {object} [params]  from `payrollParams(data.payroll)`
 * @param {number} workAccidentRate  ТЗПБ as a fraction, e.g. 0.005
 * @returns {{gross:number, insurableBase:number, employerSocial:number,
 *            employerAccident:number, employerTotal:number, labourCost:number,
 *            net:number, employeeDeductions:number, wedgePct:number,
 *            netSharePct:number, employeeSharePct:number, employerSharePct:number}}
 */
export function bgLabourCost(gross, params = BG_PAYROLL_DEFAULT, workAccidentRate) {
  const g = Number(gross);
  const z = Number.isFinite(workAccidentRate) && workAccidentRate > 0 ? workAccidentRate : 0;
  if (!Number.isFinite(g) || g <= 0) {
    return {
      gross: 0,
      insurableBase: 0,
      employerSocial: 0,
      employerAccident: 0,
      employerTotal: 0,
      labourCost: 0,
      net: 0,
      employeeDeductions: 0,
      wedgePct: 0,
      netSharePct: 0,
      employeeSharePct: 0,
      employerSharePct: 0,
    };
  }

  const { net, insurableBase } = bgNetSalary(g, params);
  const employerSocial = insurableBase * params.totalEmployerRate;
  const employerAccident = insurableBase * z;
  const employerTotal = employerSocial + employerAccident;
  const labourCost = g + employerTotal;

  return {
    gross: g,
    insurableBase,
    employerSocial,
    employerAccident,
    employerTotal,
    labourCost,
    net,
    employeeDeductions: g - net,
    wedgePct: (100 * (labourCost - net)) / labourCost,
    // The three shares partition the labour cost and sum to 100 by
    // construction, so the chart draws a partition rather than three
    // independently computed bands that might not meet.
    netSharePct: (100 * net) / labourCost,
    employeeSharePct: (100 * (g - net)) / labourCost,
    employerSharePct: (100 * employerTotal) / labourCost,
  };
}

/**
 * The labour-cost curve, sampled, plus the figures the panel states in words.
 *
 * **Evaluated at BOTH ends of the ТЗПБ range and never in the middle.** Ten of
 * the nineteen НСИ sections span several ТЗПБ rates, so a section is a range;
 * `wedgePctAtMin`/`wedgePctAtMax` are what a sentence quotes, and they collapse
 * to one number where the sector is unambiguous. A midpoint would be a rate no
 * statute sets, for a sector nobody is in.
 *
 * `points` carries the shares at the range's LOW end, which is what the stacked
 * chart draws. The two ends differ by 0.38 points of labour cost at most — a
 * third of a pixel on a 132-unit plot — so drawing both would be a precision
 * the picture cannot carry; the band's own label states the range instead.
 *
 * The ceiling is forced into the sample for the reason `bgTaxWedge` forces it:
 * it is the curve's only kink, and a sampler that steps over it draws a
 * straight line.
 *
 * @param {object} args
 * @param {object} args.params
 * @param {{min:number, max:number}} args.workAccident  the sector's ТЗПБ range
 * @param {number} [args.maxGross]
 * @param {number} [args.steps]
 * @returns {{capGross:number, wedgePctAtMin:number, wedgePctAtMax:number,
 *            peakWedgePct:number, endWedgePct:number, ambiguous:boolean,
 *            workAccident:{min:number, max:number},
 *            points:Array<{gross:number, wedgePct:number, netSharePct:number,
 *                          employeeSharePct:number, employerSharePct:number}>}}
 */
export function bgLabourWedge({
  params = BG_PAYROLL_DEFAULT,
  workAccident = BG_PAYROLL_DEFAULT.workAccident,
  maxGross = 6000,
  steps = 60,
} = {}) {
  const cap = params.maxInsurable;
  const top = Math.max(maxGross, cap * 1.5);
  const lo = workAccident?.min ?? 0;
  const hi = workAccident?.max ?? lo;

  const sampled = [];
  for (let i = 1; i <= steps; i += 1) sampled.push((top * i) / steps);
  sampled.push(cap);
  const grosses = [...new Set(sampled)].sort((a, b) => a - b);

  const points = grosses.map((gross) => {
    const c = bgLabourCost(gross, params, lo);
    return {
      gross,
      wedgePct: c.wedgePct,
      netSharePct: c.netSharePct,
      employeeSharePct: c.employeeSharePct,
      employerSharePct: c.employerSharePct,
    };
  });

  return {
    capGross: cap,
    // Quoted at the ceiling, where the curve peaks — below it the wedge is a
    // constant and above it every extra euro dilutes it, exactly as the
    // employee-side curve behaves and for the same reason.
    wedgePctAtMin: bgLabourCost(cap, params, lo).wedgePct,
    wedgePctAtMax: bgLabourCost(cap, params, hi).wedgePct,
    peakWedgePct: bgLabourCost(cap, params, lo).wedgePct,
    endWedgePct: bgLabourCost(top, params, lo).wedgePct,
    // Whether this sector resolves to one rate or a span. The template renders
    // «34,7%» or «34,7–35,1%» off this rather than off comparing two floats.
    ambiguous: hi > lo,
    workAccident: { min: lo, max: hi },
    // The same two as percentages, because a template that multiplies by 100
    // is arithmetic in the render layer — `verify_wiring.mjs` refuses to see
    // it, and the figure it would produce is one no suite can reach.
    workAccidentMinPct: 100 * lo,
    workAccidentMaxPct: 100 * hi,
    points,
  };
}

// ---------------------------------------------------------------------------
// SAVINGS EROSION
// ---------------------------------------------------------------------------

export function cashErosion(cash, officialCumPct) {
  const valueToday = cash / (1 + officialCumPct / 100);
  return { valueToday, eaten: cash - valueToday };
}

// ---------------------------------------------------------------------------
// THE PROPERTY MARKET
// ---------------------------------------------------------------------------
//
// Everything here is a ratio between two published figures, and every one of
// them is computed rather than published for the same reason: the two figures
// come from two publishers, or the ratio is ours. `docs/legal.md` §НСИ forbids
// distributing производни и сборни произведения, so a file mixing an НСИ cell
// with a Eurostat one is a licence breach however carefully it is captioned —
// and the join happens in the reader's own tab instead, exactly as the salary
// ladder joins Eurostat's shape to НСИ's level.
//
// None of these takes a reader's own figure. The market page has no input on
// it, and every function below takes payload values rather than scalars so a
// caller cannot thread one in.

/**
 * Change between two readings of the same series, as a percentage.
 *
 * Null rather than zero when either side is missing, because a market that did
 * not move and a quarter nobody published look identical once a missing value
 * becomes 0 — and the second one is the common case here, at the edges of two
 * series published over different windows.
 *
 * @param {number|null|undefined} now
 * @param {number|null|undefined} before
 * @returns {number|null} percent
 */
export function changePct(now, before) {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return ((now - before) / before) * 100;
}

/**
 * The same quarter one year earlier, as a period label.
 *
 * String arithmetic on the label rather than an index into the series, so a
 * gap in the series cannot silently shift the comparison onto a neighbouring
 * quarter — the year-ago period either exists in the data or the caller gets
 * null and renders nothing.
 *
 * @param {string} period  "YYYY-Qn"
 * @returns {string|null}
 */
export function quarterYearAgo(period) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(period ?? ""));
  return m ? `${Number(m[1]) - 1}-Q${m[2]}` : null;
}

/**
 * Deals, and the change on the same quarter a year earlier.
 *
 * Year-on-year rather than quarter-on-quarter, and that is not a presentation
 * choice: property transactions have a strong seasonal shape, so a fall from
 * Q3 to Q4 measures the calendar. Comparing a quarter with the same quarter is
 * what removes it — the same reason `une_rt_m` is read seasonally adjusted.
 *
 * `field` picks the purchase type, because new builds and existing dwellings
 * move differently in volume and an aggregate that hides which one moved is the
 * reason the payload splits them at all. It defaults to the total rather than
 * being required: a caller that forgets it gets the headline, never a silently
 * partial count of one purchase type presented as the market.
 *
 * @param {Record<string, Record<string, number>>} series  deals.series_by_period
 * @param {string} period  the quarter to report
 * @param {"total"|"new"|"existing"} [field]
 * @returns {{count: number|null, yearAgo: number|null, changePct: number|null}}
 */
export function dealsAtQuarter(series, period, field = "total") {
  const count = series?.[period]?.[field] ?? null;
  const before = series?.[quarterYearAgo(period) ?? ""]?.[field] ?? null;
  return { count, yearAgo: before, changePct: changePct(count, before) };
}

/**
 * Every year-on-year change a quarterly series can state, keyed by the quarter
 * it describes.
 *
 * `dealsAtQuarter` answers this for one quarter, and one quarter is a reading
 * rather than a finding: whether a fall of that size is an ordinary one is a
 * question only the series' own record of changes can answer. So the whole
 * record is available in the same unit the headline figure is in.
 *
 * **Computed off the LABEL, never off position in the series, and the reason is
 * the same one `quarterYearAgo` exists for.** Four places back is the same
 * quarter a year earlier only while nothing is missing; a series with one gap
 * in it silently starts comparing a winter against an autumn, and the answer
 * that produces is a plausible percentage with no question behind it.
 *
 * **Sparse out.** A quarter with no year-ago counterpart gets no entry rather
 * than a null one, so the first year of any series is absent instead of empty —
 * a year-on-year change needs a year behind it, and a plotted zero there is a
 * measurement nobody made.
 *
 * @param {Record<string, number>|null|undefined} entries  {"YYYY-Qn": value}
 * @returns {Record<string, number>} percent, at the quarters that have one
 */
export function yearOnYearChanges(entries) {
  const out = {};
  for (const [period, value] of Object.entries(entries ?? {})) {
    const change = changePct(value, entries[quarterYearAgo(period) ?? ""]);
    if (change !== null) out[period] = change;
  }
  return out;
}

/**
 * The share of the dwelling stock that was nobody's usual residence at the
 * census.
 *
 * Not "stood empty on census night". The census classifies a dwelling as
 * unoccupied when it is not the usual residence of any person at the time of
 * the census, and `cens_21_esms` puts dwellings «with persons present but not
 * included in the census» in that same category — so somebody can be asleep in
 * one. A presence test is the reading the definition exists to rule out, and
 * every surface describing this share has to keep saying so.
 *
 * Computed here rather than published because the two counts are what the
 * census carries and the share is ours — and because a reader checking it
 * needs both numbers in front of them, which is what publishing the counts and
 * deriving the share gives them.
 *
 * @param {{total?: number, unoccupied?: number}|null} census
 * @returns {number|null} percent
 */
export function unoccupiedSharePct(census) {
  const total = census?.total;
  const unoccupied = census?.unoccupied;
  if (!Number.isFinite(total) || !Number.isFinite(unoccupied) || total <= 0) return null;
  return (unoccupied / total) * 100;
}

/**
 * An index level read as a MULTIPLE of the base it is defined against.
 *
 * «272,63, при 100 за 2015 г.» is an economist's object. It has no unit, its
 * anchor is a year the publisher picked, and the magnitude connects to nothing
 * a reader has ever paid — so the digits are precise and the sentence they make
 * is empty. «×2,7 спрямо 2015 г.» is a sentence: same series, same publisher,
 * one division by the base the payload declares.
 *
 * **The base is a parameter and there is no default.** Writing `/100` would be
 * right for `I15_Q` and wrong the day a caller reaches for a series on another
 * base — `I25_Q` is the same measurement putting today at 109 — and the failure
 * would be a plausible number rather than an error. A caller has to say which
 * anchor it means, and `plotSeries#reference` is where it comes from.
 *
 * @param {number|null|undefined} level  the published index reading
 * @param {number|null|undefined} baseLevel  what the base year is written as
 * @returns {number|null} how many times the base the reading is
 */
export function indexTimesBase(level, baseLevel) {
  if (!Number.isFinite(level) || !Number.isFinite(baseLevel) || baseLevel <= 0) return null;
  return level / baseLevel;
}

/**
 * Where a reading sits inside a low–high range, as a fraction of it.
 *
 * **This positions and it does not score, and the difference is the whole
 * reason the function is this small.** 0 is the lowest reading a publisher has
 * printed for that series, 1 is the highest, and what the number in between
 * MEANS is left entirely to the reader: whether a house price index near the
 * top of its own record is good news depends on whether they own or are buying,
 * and nothing here may decide that for them (docs/principles.md P6). So there
 * is no weighting, no combination across series, and no second argument that
 * could turn into one — a caller cannot ask this to rank two indicators against
 * each other, because it is never shown more than one.
 *
 * **Out of range returns null rather than clamping.** The only legitimate call
 * passes a series' own latest reading against that same series' own extremes,
 * where the result is in [0, 1] by construction. A value outside it therefore
 * means two series were crossed, and a clamp would draw that at one end of the
 * track looking exactly like a record — which is the one failure a marker on a
 * line cannot survive.
 *
 * @param {number|null|undefined} value  the reading to place
 * @param {number|null|undefined} low  the lowest the series has been
 * @param {number|null|undefined} high  the highest it has been
 * @returns {number|null} 0…1, or null where there is no range to place it in
 */
export function rangePosition(value, low, high) {
  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (high <= low) return null;
  const at = (value - low) / (high - low);
  return at < 0 || at > 1 ? null : at;
}

/**
 * How far a reading sits BELOW a reference, as a positive percentage.
 *
 * **Null at or above it, and that is the guard rather than a nicety.** The
 * sentence this feeds says a level is below the highest one the publisher has
 * ever printed, and a reading that has just passed its own previous high has to
 * make the page say nothing rather than say «0,0% под него» — a claim the
 * digits beside it contradict, in the direction a reader is least likely to
 * check, on the one comparison this page can make that nobody else makes.
 *
 * @param {number|null|undefined} value
 * @param {number|null|undefined} reference
 * @returns {number|null} percent below, or null if it is not below
 */
export function shortfallPct(value, reference) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) return null;
  return value >= reference ? null : ((reference - value) / reference) * 100;
}

/**
 * How many years of a wage the average dwelling transaction costs.
 *
 * **The cross-publisher join, and the reason it happens in the browser.** The
 * deal value is Eurostat's and the wage is НСИ's, and neither payload may carry
 * the other's number. Both files stay one publisher's all the way here, and
 * this multiplication is the first place they meet.
 *
 * GROSS wage, deliberately, and the caller has to pass a gross figure. A price
 * expressed in years of NET pay is the more useful number to a buyer and the
 * more misleading one to quote, because the net figure depends on the payroll
 * table of the year it was computed in — so the published, unmodified НСИ cell
 * is what this divides by, and the page says which it is.
 *
 * @param {number|null|undefined} dealEur  average transaction, EUR
 * @param {number|null|undefined} monthlyGrossEur  НСИ's published average
 * @returns {number|null} years
 */
export function dealInYearsOfPay(dealEur, monthlyGrossEur) {
  if (!Number.isFinite(dealEur) || !Number.isFinite(monthlyGrossEur) || monthlyGrossEur <= 0) {
    return null;
  }
  return dealEur / (monthlyGrossEur * 12);
}

/**
 * A series quoted in the currency of its own period, in one currency.
 *
 * **A euro denominator does not convert the numerator for you.** ЕЦБ publish
 * lending volumes «in the currency of the period», and Bulgaria adopted the euro
 * on 2026-01-01: the same national market reads 1 389 in December and 447 in
 * January. Divided unconverted into what was paid for the homes, the years
 * before the changeover come out 1.96 times too large — a mortgage-funded share
 * of 153% of the money, on a chart that draws perfectly well.
 *
 * **Null rather than the entries back where either half is missing**, so a
 * caller that lost the rate renders nothing instead of the unconverted series.
 *
 * @param {Record<string, number>|null|undefined} entries  keyed `YYYY-MM`
 * @param {{bgnPerEur?: number|null, euroFrom?: string|null}} opts
 * @returns {Record<string, number>|null} the same periods, all in euro
 */
export function eurosFromMixedCurrency(entries, { bgnPerEur, euroFrom } = {}) {
  if (!Number.isFinite(bgnPerEur) || bgnPerEur <= 0 || !euroFrom) return null;
  const out = {};
  for (const [period, value] of Object.entries(entries ?? {})) {
    if (!Number.isFinite(value)) continue;
    // Lexicographic, which is what an ISO period label is for: `2025-12` sorts
    // before `2026-01` without parsing either of them into a date.
    out[period] = period < euroFrom ? value / bgnPerEur : value;
  }
  return out;
}

/**
 * A monthly or quarterly series added into calendar years — whole years only.
 *
 * **A part year under a full one is a share wrong by the months it is missing,
 * and nothing on the picture says so.** Eurostat disseminate the property cubes
 * a quarter at a time and ЕЦБ publish monthly, so the newest year is short in
 * one of them almost always and in both of them never at the same moment.
 *
 * @param {Record<string, number>|null|undefined} entries  keyed `YYYY-Qn` or `YYYY-MM`
 * @param {number} periodsPerYear  4 for quarters, 12 for months
 * @returns {Record<string, number>} keyed by year, the years that are whole
 */
export function completeYearTotals(entries, periodsPerYear) {
  const years = new Map();
  for (const [period, value] of Object.entries(entries ?? {})) {
    const year = String(period).slice(0, 4);
    if (!/^\d{4}$/.test(year) || !Number.isFinite(value)) continue;
    const before = years.get(year) ?? { total: 0, seen: 0 };
    years.set(year, { total: before.total + value, seen: before.seen + 1 });
  }
  const out = {};
  for (const [year, y] of years) if (y.seen === periodsPerYear) out[year] = y.total;
  return out;
}

/**
 * What a stock grew by over each calendar year, from its December readings.
 *
 * One December against the one before it is the year's net flow: everything lent
 * less everything repaid and written off. It can be negative, and a year where it
 * is says households paid down more than they took out.
 *
 * **Paired off the LABELS, never off position in the series**, for the reason
 * `quarterYearAgo` exists: one month missing from a workbook and the arithmetic
 * silently reaches two Decembers apart, returning a plausible figure with no
 * question behind it.
 *
 * @param {Record<string, number>|null|undefined} entries  keyed `YYYY-MM`
 * @returns {Record<string, number>} keyed by year, the years carrying both ends
 */
export function yearEndGrowth(entries) {
  const out = {};
  for (const [period, value] of Object.entries(entries ?? {})) {
    const december = /^(\d{4})-12$/.exec(period);
    if (!december || !Number.isFinite(value)) continue;
    const before = entries[`${Number(december[1]) - 1}-12`];
    if (Number.isFinite(before)) out[december[1]] = value - before;
  }
  return out;
}

/**
 * One series over another, key by key, as a percentage.
 *
 * **Sparse out.** A key only one side carries gets no entry rather than a null
 * one, so a year the second publisher has not reached yet is absent from the
 * picture instead of drawn at zero — which on a share is a measurement nobody
 * made, at the end of the record a reader looks at first.
 *
 * @param {Record<string, number>|null|undefined} numerators
 * @param {Record<string, number>|null|undefined} denominators
 * @returns {Record<string, number>} percent, at the keys both carry
 */
export function sharePctByKey(numerators, denominators) {
  const out = {};
  for (const [key, value] of Object.entries(numerators ?? {})) {
    const base = denominators?.[key];
    if (!Number.isFinite(value) || !Number.isFinite(base) || base <= 0) continue;
    out[key] = (value / base) * 100;
  }
  return out;
}

/**
 * Each reading less the share of itself a second series says is something else.
 *
 * ЕЦБ publish new mortgage business as one figure with renegotiations inside it,
 * and a household repricing a loan it already has is not somebody buying a home.
 * The share is a share of that same month's volume, so it comes off in whatever
 * currency the volume is already in.
 *
 * @param {Record<string, number>|null|undefined} entries
 * @param {Record<string, number>|null|undefined} sharesPct
 * @returns {Record<string, number>} the periods both carry
 */
export function lessSharePct(entries, sharesPct) {
  const out = {};
  for (const [period, value] of Object.entries(entries ?? {})) {
    const share = sharesPct?.[period];
    if (!Number.isFinite(value) || !Number.isFinite(share)) continue;
    out[period] = value * (1 - share / 100);
  }
  return out;
}
