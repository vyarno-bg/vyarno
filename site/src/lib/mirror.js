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

/**
 * Inverse of pocketReal: given inflation and a desired real pocket,
 * what nominal raise is required?
 *
 *   (1 + r/100) / (1 + pi/100) − 1 = pocket/100
 *   1 + r/100 = (1 + pocket/100) × (1 + pi/100)
 *   r = 100 × [(1 + pocket/100) × (1 + pi/100) − 1]
 *
 * For pocket=0 (just stand still) → r = π exactly.
 * For pocket=+5% (gain 5% real purchasing power) → r = (1+π) × 1.05 − 1.
 *
 * @param {number} piPct        e.g. 3.5
 * @param {number} pocketPct    e.g. 0 for "stand still", 5 for "gain 5% real"
 * @returns {number} percent
 */
export function targetRaise(piPct, pocketPct) {
  return 100 * ((1 + pocketPct / 100) * (1 + piPct / 100) - 1);
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
const SALARY_LADDER_CUTS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

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
 * Re-level the published Eurostat shape onto today's Sofia average.
 *
 * WHY THIS ARITHMETIC IS HERE AND NOT IN THE PIPELINE
 *
 * One publisher per file, joined at the last possible moment.
 * `salary_dist.json` is Eurostat's shape at Eurostat's own level;
 * `sofia_salary.json` is НСИ's monthly figures as НСИ published them. Each
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
 * The statutory minimum wage floors P1 *after* scaling, which is the only
 * place it means anything: an unlevelled rung is not a wage anyone earns.
 *
 * @param {{shape?: {ladder_ses?: Record<string, number>, ses_mean?: number}}} dist
 * @param {number} anchorGrossMean  today's Sofia mean gross, EUR/month
 * @param {object} [params]  payroll params (from `payrollParams(data.payroll)`)
 * @returns {Record<string, number>} GROSS EUR/month per cut, or {} if unusable
 */
export function composeLadder(dist, anchorGrossMean, params = BG_PAYROLL_DEFAULT) {
  const shape = dist?.shape;
  const sesMean = shape?.ses_mean;
  const rungs = shape?.ladder_ses;
  if (!rungs || !(sesMean > 0) || !(anchorGrossMean > 0)) return {};
  const f = anchorGrossMean / sesMean;
  const out = {};
  for (const p of SALARY_LADDER_CUTS) {
    const base = rungs[`P${p}`];
    if (base == null) continue;
    const scaled = p <= 1 ? Math.max(base * f, params.minWageGross) : base * f;
    out[`P${p}`] = Math.round(scaled * 10) / 10;
  }
  return out;
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
 * @param {number} anchorGrossMean  today's Sofia mean gross, EUR/month
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
  return {
    rates: complete ? Object.freeze(lines) : BG_PAYROLL_DEFAULT.rates,
    totalEmployeeRate: num(rates.total, BG_PAYROLL_DEFAULT.totalEmployeeRate),
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
// SAVINGS EROSION
// ---------------------------------------------------------------------------

export function cashErosion(cash, officialCumPct) {
  const valueToday = cash / (1 + officialCumPct / 100);
  return { valueToday, eaten: cash - valueToday };
}
