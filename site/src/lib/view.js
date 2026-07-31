/**
 * View module — the derived values `App.svelte` renders, as pure functions.
 *
 * `mirror.js` holds the formulas and `data.js` the fallback chains. This is the
 * layer between them: every number on screen is a formula *wired* to an input,
 * and a correct formula fed the wrong input is still a wrong number on
 * someone's screen. Wiring that lives inside `$derived(...)` in the template
 * has no runtime harness and nothing can test it.
 *
 * So the rule for this file, and the reason it is not just "helpers":
 *
 *   **Where a wrong wiring would be a wrong number, make the wrong wiring
 *   impossible to express — do not merely test against it.**
 *
 * Concretely: `savingsSince2020` takes the published payloads and computes the
 * cumulative itself, so no caller can hand it the user's basket rate by
 * mistake. `headlineRate` reads only the headline payload, so it cannot be
 * handed the categories and quietly become Σ(w·r). `mortgagePanel` reads the
 * down payment out of the published lending limits rather than accepting it,
 * so a caller cannot pass 0%.
 *
 * The template's job after this file is rendering: pick a formatter, choose a
 * colour, place a string. Arithmetic in `App.svelte` belongs here (or in
 * `mirror.js`) with a test in `scripts/verify_view.mjs` — same commit.
 */

import {
  allItemsCumulativeSince2020,
  annuityPayment,
  annuityReverse,
  bgGrossFromNet,
  bgMarginalRatePct,
  bgNetSalary,
  bgPayslipFromNet,
  bgTaxWedge,
  cashErosion,
  officialCumulativeSince2020,
  payrollParams,
} from "./mirror.js";

// ---------------------------------------------------------------------------
// THE BASKET THE SLIDERS START FROM
// ---------------------------------------------------------------------------

/**
 * The weights the sliders are seeded with, straight from the published
 * payload.
 *
 * Deliberately NOT rounded. Rounding each division to a whole percent looks
 * like honesty about slider precision, but it makes the default basket sum to
 * 97 and produces a third headline figure that matches neither Eurostat's
 * all-items rate nor the official-weight basket. The slider's own `step` still
 * governs what the *user* can enter; the seed is exact, so the default view is
 * exactly "the average Bulgarian's basket".
 *
 * @param {Array<{weight_pct:number}>} categories
 * @returns {number[]}
 */
export function officialBasketWeights(categories) {
  return (categories ?? []).map((c) => c.weight_pct);
}

// ---------------------------------------------------------------------------
// FRESHNESS
// ---------------------------------------------------------------------------

/**
 * Fallback cadence, in days, for a payload whose manifest row states no
 * `cadenceDays` — so a row added without one still gets a verdict, not a pass.
 *
 * The real rule is per payload, in `payloadStatus`. A single site-wide threshold
 * cannot serve three release rhythms: 45 days is a month and a half late for the
 * monthly HICP release and would condemn the quarterly НСИ wage series every
 * quarter.
 */
export const STALE_AFTER_DAYS = 45;

/**
 * How far past its cadence a payload must be before the page raises the banner.
 *
 * Inside the cadence it is fresh; past it merely "due" — the upstream has
 * probably published and we have not fetched — and past this multiple of it a
 * refresh was genuinely skipped. 1.5 puts a monthly payload's alarm at ~46 days,
 * late enough that an ordinary slip in a hand-run refresh is not an alarm.
 */
export const OVERDUE_MULTIPLE = 1.5;

/**
 * Whole days between an ISO date and `now`, or null if there is no date.
 *
 * @param {string | undefined | null} asOf
 * @param {number} now  epoch ms
 * @returns {number | null}
 */
function daysSince(asOf, now) {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  return Number.isFinite(t) ? Math.floor((now - t) / 86400000) : null;
}

/**
 * One payload's freshness against ITS OWN cadence: fresh, due, or overdue.
 *
 * `absent` is its own verdict rather than a silent pass. A payload that failed
 * to fetch is not fresh, and reporting it as fresh is how a page renders
 * fallback sentinels while claiming today's date.
 *
 * @param {{as_of?: string} | null} payload
 * @param {number} [cadenceDays]  from the manifest; STALE_AFTER_DAYS if absent
 * @param {number} [now]  epoch ms, injectable for tests
 * @returns {{status: "fresh"|"due"|"overdue"|"absent", daysOld: number|null, cadenceDays: number}}
 */
export function payloadStatus(payload, cadenceDays = STALE_AFTER_DAYS, now = Date.now()) {
  const cadence = Number.isFinite(cadenceDays) && cadenceDays > 0 ? cadenceDays : STALE_AFTER_DAYS;
  const daysOld = daysSince(payload?.as_of, now);
  if (daysOld === null) return { status: "absent", daysOld: null, cadenceDays: cadence };
  if (daysOld > cadence * OVERDUE_MULTIPLE) {
    return { status: "overdue", daysOld, cadenceDays: cadence };
  }
  return { status: daysOld > cadence ? "due" : "fresh", daysOld, cadenceDays: cadence };
}

/**
 * Every payload's row for the data panel, plus the page-level verdict.
 *
 * The one place the site decides how fresh it is, and it decides per payload.
 * `stale` means "some payload is overdue against its own cadence", so a
 * quarterly series 60 days old does not raise it.
 *
 * Both aggregates come back, and they travel with the rows they were computed
 * from so neither can be mistaken for the other:
 *
 * - `oldestAsOf` / `daysOld` — the minimum, because the staleness question is
 *   "is ANYTHING here out of date". The maximum would let one
 *   freshly-republished file stand in for seven stale ones, and `payroll.json`
 *   is hand-maintained and the payload most likely to be refreshed alone.
 * - `newestAsOf` — the most recent refresh, for a sentence about the refresh
 *   rather than about the figures.
 *
 * @param {Record<string, {as_of?: string} | null>} parts  the loadAll() result
 * @param {ReadonlyArray<object>} manifest  PAYLOADS, injectable for tests
 * @param {number} [now]  epoch ms, injectable for tests
 * @returns {{rows: Array<object>, oldestAsOf: string, newestAsOf: string,
 *            daysOld: number, stale: boolean, overdue: Array<object>,
 *            missing: Array<object>}}
 */
export function dataAge(parts, manifest = [], now = Date.now()) {
  const rows = manifest.map((entry) => {
    const payload = parts?.[entry.key] ?? null;
    const { status, daysOld, cadenceDays } = payloadStatus(payload, entry.cadenceDays, now);
    return {
      key: entry.key,
      file: entry.file,
      name: entry.name,
      feeds: entry.feeds,
      status,
      daysOld,
      cadenceDays,
      asOf: payload?.as_of ?? null,
      refPeriod: entry.refPeriod?.(payload) ?? null,
      refPeriodIsDayDate: entry.refPeriodIsDayDate === true,
      refPeriodSecondary: entry.refPeriodSecondary?.(payload) ?? null,
      source: payload?.source ?? null,
      sourceUrl: payload?.source_url ?? null,
    };
  });

  const dates = rows
    .map((r) => r.asOf)
    .filter(Boolean)
    .sort();
  const today = new Date(now).toISOString().slice(0, 10);
  const oldestAsOf = dates[0] ?? today;
  const newestAsOf = dates[dates.length - 1] ?? today;

  return {
    rows,
    oldestAsOf,
    newestAsOf,
    daysOld: daysSince(oldestAsOf, now) ?? 0,
    stale: rows.some((r) => r.status === "overdue"),
    overdue: rows.filter((r) => r.status === "overdue"),
    missing: rows.filter((r) => r.status === "absent"),
  };
}

// ---------------------------------------------------------------------------
// THE HEADLINE — verbatim, never derived
// ---------------------------------------------------------------------------

/**
 * The Sofia average gross wage the site quotes: НСИ's latest published
 * quarterly average, read out of the payload.
 *
 * WHY A QUARTER AND NOT A MONTH
 *
 * Bulgarian wages spike in March on annual bonuses — March 2026 alone was
 * €2061 against a Q1 average of €1915 — so quoting the latest single month
 * would overstate the Sofia average by 7.6% every spring and understate it
 * every April. НСИ report quarterly for the same reason, and the payload
 * carries their quarters.
 *
 * WHY THIS READS RATHER THAN COMPUTES
 *
 * `sofia_salary.json` carries НСИ's own published quarterly series and nothing
 * else, so the figure on screen is one НСИ published rather than one derived
 * from figures they published. Their licence §2.1.1 forbids distributing
 * производни и сборни произведения, and the cheapest way to stay clear of that
 * is to have no derived figure to argue about (docs/legal.md §НСИ). This
 * function therefore selects; it must never average, rebase or interpolate.
 *
 * The headline is `value`/`ref_period` when present, and otherwise the latest
 * key in the series — which is the same cell, and keeps a payload written by an
 * older envelope readable.
 *
 * @param {{value?: number, ref_period?: string, series_by_period?: Record<string, number>}} payload
 * @returns {{value: number, refPeriod: string}} zeroed when unavailable
 */
export function sofiaQuarter(payload) {
  const empty = { value: 0, refPeriod: "" };
  const series = payload?.series_by_period ?? {};
  const quarters = Object.keys(series).filter(
    (k) => /^\d{4}-Q[1-4]$/.test(k) && typeof series[k] === "number"
  );

  if (typeof payload?.value === "number" && /^\d{4}-Q[1-4]$/.test(payload?.ref_period ?? "")) {
    return { value: payload.value, refPeriod: payload.ref_period };
  }
  if (!quarters.length) return empty;
  // "YYYY-Qn" sorts lexicographically as chronologically, for any 4-digit year.
  const refPeriod = quarters.sort()[quarters.length - 1];
  return { value: series[refPeriod], refPeriod };
}

/**
 * Eurostat's official all-items 12-month rate, exactly as published.
 *
 * This function takes the headline payload and nothing else, on purpose: it
 * physically cannot be handed the category list and quietly become Σ(w·r).
 * The two differ by ~0.16 pp on BG data (December chain link — see
 * docs/math.md §"Two reconciliations"), and the national strip must carry the
 * official figure, not our reconstruction of it.
 *
 * @param {{headline_rate_pct?: number} | null | undefined} payload
 * @returns {number}
 */
export function headlineRate(payload) {
  const v = payload?.headline_rate_pct;
  return Number.isFinite(v) ? v : 0;
}

// ---------------------------------------------------------------------------
// PERCENTILE — position from the bottom
// ---------------------------------------------------------------------------

/**
 * The rendered percentile position, clamped to [1, 99].
 *
 * `mirror.js#percentile` returns a position FROM THE BOTTOM. This is the only
 * place the SPA is allowed to turn it into a display number, and it is
 * monotonic by construction: more money never produces a smaller output. The
 * inverted framing ("top N%") once rendered a €300/mo income as an
 * achievement; expressing that inversion now requires editing this function,
 * where the test lives.
 *
 * @param {number} rank  mirror.js#percentile output, 0 when unknown
 * @returns {number} 0 when unknown, else 1..99
 */
export function pctAhead(rank) {
  if (!(rank > 0)) return 0;
  return Math.max(1, Math.min(99, Math.round(rank)));
}

// ---------------------------------------------------------------------------
// SAVINGS
// ---------------------------------------------------------------------------

/**
 * What cash held since 2020 buys today.
 *
 * Takes PAYLOADS, never a rate, so the cumulative can only ever be a
 * since-2020 figure. Passing the user's own basket rate here would answer a
 * different question in the same sentence — the card says "от 2020 г." /
 * "since 2020" in fixed copy — and there is no argument to pass it through.
 *
 * **Prefers Eurostat's own all-items index** (`hicp_headline.json`'s CP00
 * `latest_index / index_by_year["2020"]`), and falls back to rebuilding the
 * cumulative from the divisions only when the headline payload has no index.
 * The two differ by ~1.9 pp over this span — 39.9% vs 41.8% today — and only
 * the first is a figure Eurostat publishes.
 *
 * **`basis` is returned, and the copy must follow it.** The fallback is a
 * legitimate number but a different one, so it must not inherit the sentence
 * that calls the figure Eurostat's. Labelling our reconstruction as the
 * official rate is the exact defect this function was changed to fix; a silent
 * fallback would reintroduce it whenever the payload degraded.
 *
 * @param {number} cash
 * @param {object|null} headline    published hicp_headline.json
 * @param {Array} categories        published hicp_categories.json entries
 * @returns {{valueToday:number, eaten:number, cumulativePct:number,
 *            basis:'all_items'|'average_basket'|'none'}}
 */
export function savingsSince2020(cash, headline, categories) {
  const official = allItemsCumulativeSince2020(headline);
  if (official != null) {
    return { ...cashErosion(cash, official), cumulativePct: official, basis: "all_items" };
  }
  if ((categories ?? []).length) {
    const pct = officialCumulativeSince2020(categories);
    return { ...cashErosion(cash, pct), cumulativePct: pct, basis: "average_basket" };
  }
  return { ...cashErosion(cash, 0), cumulativePct: 0, basis: "none" };
}

// ---------------------------------------------------------------------------
// HOUSING CARVE-OUT
// ---------------------------------------------------------------------------

/**
 * What the per-division € column is carved out of: take-home minus the housing
 * payments already committed. A person can carry both — buying while still
 * renting until the deal closes.
 *
 * @param {{salary:number, homeOn:boolean, monthlyMortgage:number, rent:number}} args
 * @returns {{housingCost:number, spendable:number}}
 */
export function housingCarveOut({ salary, homeOn, monthlyMortgage, rent }) {
  const housingCost = (homeOn ? Math.max(0, monthlyMortgage || 0) : 0) + (rent > 0 ? rent : 0);
  return { housingCost, spendable: Math.max(0, (salary || 0) - housingCost) };
}

// ---------------------------------------------------------------------------
// THE BASKET'S BUDGET — what was placed, and what was not
// ---------------------------------------------------------------------------

/**
 * What the € column is measured against, and what the reader has left over.
 *
 * **The two modes disagree about whether "left over" can exist, and that is
 * the point.** A basket of *percentage shares* says how the spendable amount
 * divides; by construction it allocates all of it, and there is no remainder
 * to name. A basket of *euros per month* is a list of real payments, and the
 * one thing a person who is careful with money does is not spend all of it.
 *
 * So `spendBase` — the amount the per-division € figures and
 * `mirror.js#contributions` are carved out of — is `spendable` in share mode
 * and **the euros actually entered** in euro mode. Feeding `spendable` to both
 * is the bug this function exists to make unexpressible: it silently rescaled a
 * €1,000 basket up to a €1,250 budget, so someone who typed their real
 * spending was shown thirteen numbers they had never typed, all of them 25%
 * too big, adding to a total they had deliberately not reached. The app was
 * insisting they spend everything.
 *
 * `leftover` is deliberately NOT called savings. Money not placed in a basket
 * is money this calculator has not been told about; it may be saved, invested,
 * sent to family or spent on something the reader forgot. We can state its
 * size and what prices do to money held as cash — we cannot state what it is
 * for (docs/principles.md P6).
 *
 * @param {object} args
 * @param {'pct'|'eur'} args.spendMode
 * @param {number[]} args.amounts   the basket, in whichever unit the mode uses
 * @param {number} args.spendable   take-home minus committed housing
 * @returns {{entered:number, spendBase:number, leftover:number, over:number,
 *            leftoverPct:number, leftoverPerYear:number, hasLeftover:boolean}}
 */
export function basketBudget({ spendMode, amounts, spendable }) {
  const entered = (amounts ?? []).reduce((s, x) => s + (x > 0 ? x : 0), 0);
  const budget = Math.max(0, spendable || 0);

  if (spendMode !== "eur") {
    return {
      entered,
      spendBase: budget,
      leftover: 0,
      over: 0,
      leftoverPct: 0,
      leftoverPerYear: 0,
      hasLeftover: false,
    };
  }

  const leftover = Math.max(0, budget - entered);
  return {
    entered,
    spendBase: entered,
    leftover,
    over: Math.max(0, entered - budget),
    leftoverPct: budget > 0 ? (100 * leftover) / budget : 0,
    leftoverPerYear: leftover * 12,
    // A euro or two of rounding is not a decision anybody made, and a row
    // announcing "€0 left over" is noise on every basket that happens to
    // balance. The panel only speaks when there is something to speak about.
    hasLeftover: budget > 0 && leftover >= 1,
  };
}

/**
 * The €/month the reader's own prices actually apply to.
 *
 * `extraPerMonth(salary, π)` answers "what does the same life as a year ago
 * cost now", and it was fed the whole take-home — which asserts that every
 * euro earned is a euro spent on something whose price moved. For anyone who
 * puts money aside that overstates the damage: unspent money does not get more
 * expensive.
 *
 * Housing stays in, because rent and a mortgage payment are spending; they are
 * carved out of the *basket* column so the thirteen divisions describe what is
 * left, not because they are outside the reader's outlay.
 *
 * **This reduces to `salary` exactly in share mode** (`spendBase` is
 * `salary − housingCost` there), so the headline € figure is unchanged for
 * everyone who has not deliberately left money unplaced. Only a reader who
 * told us they spend less than they earn gets a different — smaller, truer —
 * number.
 *
 * @param {{housingCost:number, spendBase:number}} args
 * @returns {number} EUR/month
 */
export function exposedSpend({ housingCost, spendBase }) {
  return Math.max(0, housingCost || 0) + Math.max(0, spendBase || 0);
}

/**
 * What a year of the unplaced money would be worth if it sat in cash.
 *
 * **It takes the headline payload, never a rate**, for the reason the whole
 * file exists: the obvious wrong wiring is π, the reader's own basket rate,
 * and it is wrong in a way no reviewer would spot. Money that is *not* being
 * spent is not being spent on that basket — the yardstick for its purchasing
 * power is the general price level, which is the same choice the savings card
 * already makes and says out loud. A caller who cannot pass a rate cannot pass
 * the wrong one.
 *
 * It is a **projection and must be labelled as one** (docs/principles.md P5): it carries
 * the last twelve months' rate forward over the next twelve. Eurostat forecasts
 * nothing here and neither do we; the copy that renders this says so.
 *
 * @param {object} args
 * @param {number} args.leftoverPerYear  12 × the monthly leftover, EUR
 * @param {object|null} args.headline    published hicp_headline.json
 * @returns {{ratePct:number, valueToday:number, eaten:number}}
 */
export function leftoverIfHeldAsCash({ leftoverPerYear, headline }) {
  const ratePct = headlineRate(headline);
  return { ratePct, ...cashErosion(Math.max(0, leftoverPerYear || 0), ratePct) };
}

// ---------------------------------------------------------------------------
// THE HOME BLOCK
// ---------------------------------------------------------------------------

/**
 * The total asking price the mortgage math runs on.
 *
 * "auto" → the imot.bg Sofia median × the size the user picked.
 * "manual" → the price they typed for a home they already found.
 *
 * @param {{priceMode:string, manualPrice:number, eurPerM2:number, m2:number}} args
 * @returns {number}
 */
export function homePriceFor({ priceMode, manualPrice, eurPerM2, m2 }) {
  if (priceMode === "manual" && manualPrice > 0) return manualPrice;
  return (eurPerM2 || 0) * (m2 || 0);
}

/**
 * Clamp the term to the BNB maturity ceiling.
 *
 * The input's `max` stops the spinner but not a typed or restored value, and
 * quoting a payment over a term no BG bank can legally originate would be a
 * made-up number.
 *
 * @param {number} termYears
 * @param {{maturityMaxYears:number}} limits
 * @returns {number}
 */
export function clampTerm(termYears, limits) {
  const max = limits?.maturityMaxYears ?? 30;
  return Math.min(termYears, max);
}

/**
 * Everything the home result row shows, from one call.
 *
 * `ratePct` is the **AAR** — the annualised agreed rate on new business. It is
 * the interest rate, and the annuity needs an interest rate. The APRC
 * (`mortgage.json → new_business.aprc`) folds fees into an annualised figure
 * and belongs beside the rate as "what it really costs", never inside this
 * formula: at 2026-05's 2.43% AAR vs 2.77% APRC it would overstate a €148,810
 * payment by ~€24/month, which no sanity band would catch. See docs/math.md
 * §"Which rate goes into the annuity", and
 * docs/data-sources.md §"A plausible number is not a verified number".
 *
 * The down payment and both DSTI figures are read out of `limits` (published
 * in `mortgage.json → lending_limits`) rather than accepted as arguments, so a
 * caller cannot pass 0% down or quietly adopt the regulator's 50% ceiling in
 * place of our 30% line.
 *
 * @param {object} args
 * @param {number} args.price        total asking price
 * @param {number} args.ratePct      the AAR, annual percent
 * @param {number} args.termYears
 * @param {number} args.netSalary    monthly NET take-home
 * @param {number} args.eurPerM2     for the "what could I afford" size
 * @param {{minDownPaymentPct:number, prudentDstiPct:number, maturityMaxYears:number}} args.limits
 * @returns {{downPaymentPct:number, downPayment:number, loan:number,
 *            payment:number, sharePct:number, capPct:number, capEur:number,
 *            capGap:number, overCap:boolean, maxLoan:number, maxPrice:number,
 *            maxM2:number}}
 */
export function mortgagePanel({ price, ratePct, termYears, netSalary, eurPerM2, limits }) {
  const downPaymentPct = limits?.minDownPaymentPct ?? 15;
  const capPct = limits?.prudentDstiPct ?? 30;
  const term = clampTerm(termYears, limits);

  const loanFraction = 1 - downPaymentPct / 100;
  const loan = Math.max(0, price) * loanFraction;
  const payment = annuityPayment(loan, ratePct, term);
  const sharePct = netSalary > 0 ? (100 * payment) / netSalary : 0;

  const capEur = Math.max(0, netSalary) * (capPct / 100);
  const maxLoan = annuityReverse(capEur, ratePct, term);
  const maxPrice = loanFraction > 0 ? maxLoan / loanFraction : 0;

  return {
    downPaymentPct,
    downPayment: Math.max(0, price) - loan,
    loan,
    payment,
    sharePct,
    capPct,
    capEur,
    capGap: payment - capEur,
    overCap: payment > capEur,
    maxLoan,
    maxPrice,
    maxM2: eurPerM2 > 0 ? maxPrice / eurPerM2 : 0,
  };
}

// ---------------------------------------------------------------------------
// THE PAYROLL PANELS — the itemised payslip, and the tax wedge behind it
// ---------------------------------------------------------------------------

/**
 * The itemised payslip behind the one-line gross figure under the salary
 * input — every deduction, its statutory rate, and the totals it rolls into.
 *
 * **It takes the published payroll payload, not a params object**, for the
 * same reason `taxWedgePanel` does: the wrong wiring here is a breakdown
 * itemised at last year's rates, which is wrong by a few euro a line and
 * looks entirely plausible. A caller who cannot hand over rates cannot hand
 * over the wrong ones.
 *
 * **It takes the NET the user typed** and inverts it here, rather than
 * accepting a gross from the template. Composing
 * `bgNetSalary(bgGrossFromNet(salary))` inside a `$derived` puts arithmetic in
 * the render layer, which docs/site.md §"A correct formula fed the wrong
 * number" puts in this file instead — and a second
 * caller reading the breakdown straight off the typed net (rather than off
 * the recovered gross) would itemise someone's €2,100 as though €2,100 were
 * the contract amount: every line ~20% light, none of them obviously so.
 *
 * `null` for an empty field. There is no payslip for a salary nobody typed,
 * and rendering one at zero invites the reader to check a column of zeroes.
 *
 * @param {object} args
 * @param {object|null} args.payroll   data.payroll (payroll.json), unmodified
 * @param {number} args.netSalary      the user's monthly NET take-home, or 0
 * @returns {null | (ReturnType<typeof bgPayslipFromNet> & {
 *            maxInsurable:number, netRequested:number })}
 */
export function payslipPanel({ payroll, netSalary }) {
  const net = Number(netSalary);
  if (!Number.isFinite(net) || net <= 0) return null;

  const params = payrollParams(payroll);
  return {
    ...bgPayslipFromNet(net, params),
    // The ceiling is carried through so the template can name the figure in
    // the "contributions stop here" row without re-deriving it — a second
    // derivation is a second chance to derive it from the wrong payload.
    maxInsurable: params.maxInsurable,
    // What the user actually typed, so a caller can show the rounding gap
    // instead of quietly presenting a cent of drift as the user's own number.
    netRequested: net,
    // The year these rates are legislated for, off the SAME payload the rates
    // came from. A template reading `data.payroll.effective_year` separately
    // would caption a breakdown "2026 rates" on whatever year the payload
    // happened to carry, and the two could drift apart with nothing failing.
    effectiveYear: payroll?.effective_year ?? null,
  };
}

/**
 * Everything the "flat tax is not flat" row shows, from one call.
 *
 * **It takes the published payroll payload, not a params object**, and derives
 * the parameters itself with `payrollParams`. That is the §3.3 rule applied to
 * a new panel: the wrong wiring here would be passing hand-written rates, or
 * the previous year's cap, and a caller that cannot supply either cannot make
 * that mistake. It is also why `nextCap` is read out of the payload's own
 * `scheduled_changes` rather than accepted as an argument — a hardcoded €2300
 * would keep rendering a stale "coming change" long after it arrived.
 *
 * **The user's own position is derived from their GROSS**, recovered from the
 * net they typed with `bgGrossFromNet`. Feeding the net straight in would place
 * someone earning €2,200 gross below a €2,111.64 cap they are actually over —
 * a wrong answer inside every plausible band, exactly the class of error
 * `docs/data-sources.md` §"A plausible number is not a verified number"
 * exists for.
 *
 * @param {object} args
 * @param {object|null} args.payroll   data.payroll (payroll.json), unmodified
 * @param {number} args.netSalary      the user's monthly NET take-home, or 0
 * @returns {{capGross:number, peakEffectivePct:number, marginalBelowPct:number,
 *            marginalAbovePct:number, capRisePerMonth:number|null,
 *            points:Array<{gross:number, effectivePct:number, marginalPct:number}>,
 *            you:null|{gross:number, effectivePct:number, marginalPct:number,
 *                      overCap:boolean}}}
 */
export function taxWedgePanel({ payroll, netSalary }) {
  const params = payrollParams(payroll);
  const wedge = bgTaxWedge({ params, nextCap: scheduledMaxInsurable(payroll) });

  const net = Number(netSalary);
  if (!Number.isFinite(net) || net <= 0) return { ...wedge, you: null };

  const gross = bgGrossFromNet(net, params);
  return {
    ...wedge,
    you: {
      gross,
      effectivePct: bgNetSalary(gross, params).effectiveRatePct,
      marginalPct: bgMarginalRatePct(gross, params),
      overCap: gross >= params.maxInsurable,
    },
  };
}

/**
 * The `scheduled_changes` row describing the insurance ceiling, or undefined.
 *
 * `scheduled_changes` is a published, dated, sourced list. Both readers below
 * pick the row by field name rather than by position, so an entry for a
 * different field cannot supply the ceiling's value or its date.
 *
 * @param {object|null} payload  data.payroll
 */
function maxInsurableChange(payload) {
  const rows = payload?.scheduled_changes;
  return Array.isArray(rows) ? rows.find((r) => r?.field === "max_insurable_income") : undefined;
}

/**
 * The legislated next maximum insurable income, if `payroll.json` carries one.
 *
 * Read defensively: a row whose value is not a number must produce `null`
 * rather than a figure the panel would render as a euro amount.
 *
 * @param {object|null} payload  data.payroll
 * @returns {number|null} EUR/month
 */
export function scheduledMaxInsurable(payload) {
  const v = maxInsurableChange(payload)?.value_eur;
  return Number.isFinite(v) ? v : null;
}

/**
 * The date that scheduled change takes effect, as an ISO string, or `null`.
 *
 * **`effective_from` is an ISO date and never prose**, held by
 * `test_a_scheduled_change_carries_a_real_date_not_a_condition`. Prose like
 * "2026 (pending the regular state budget)" leaves the panel able to say only
 * "when it does", and it rots twice over the moment the budget passes: undated,
 * and wrong about the change still being conditional. This returns the value
 * only when it parses, so prose arriving anyway degrades to the dateless
 * wording rather than rendering "pending the regular state budget" as a date.
 *
 * @param {object|null} payload  data.payroll
 * @returns {string|null} "YYYY-MM-DD"
 */
export function scheduledMaxInsurableFrom(payload) {
  const from = maxInsurableChange(payload)?.effective_from;
  if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  return Number.isNaN(Date.parse(from)) ? null : from;
}

// ---------------------------------------------------------------------------
// PROVENANCE LINKS
// ---------------------------------------------------------------------------

const ESTAT_DATASET_FALLBACK =
  "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en";

/**
 * The "↗" verify link for one HICP row, pointing at the extract that actually
 * contains the number shown beside it.
 *
 * `unit` follows the anchor, not the row: at the "last 12 months" anchor the
 * number is the published annual rate (RCH_A), and at a year anchor it is
 * derived from the monthly index (I15). Sending someone to the index cube to
 * check a rate means they cannot find the figure they clicked.
 *
 * We deliberately do NOT link to the rendered Data Browser table: its query
 * params only bind single-select "page" dimensions, so a `coicop18=CPxx` param
 * is silently ignored and every category degrades to the same default table
 * (CP01, Food). The dissemination extract is the only stable, per-row-correct
 * target — and it is the same URL the publish-time link gate verifies.
 *
 * Takes the row it is describing, so it cannot be closed over one fixed
 * category: pointing every link at CP01 now requires changing the call site to
 * pass the wrong row, not just editing one lookup.
 *
 * @param {{api_url?:string, api_url_index?:string}} row  division or group
 * @param {'y1'|number|string} anchor
 * @returns {string}
 */
export function verifyUrl(row, anchor) {
  const url = anchor === "y1" ? row?.api_url : row?.api_url_index;
  return url || ESTAT_DATASET_FALLBACK;
}

// ---------------------------------------------------------------------------
// STRIP CARDS
// ---------------------------------------------------------------------------

/**
 * The division whose 12-month rate is highest — the "fastest-rising group"
 * card. Sorted descending; a sign slip here advertises the *slowest*-rising
 * division as the fastest, which reads as plausible and is exactly backwards.
 *
 * @param {Array<{annual_rate_pct:number}>} categories
 * @returns {object|null}
 */
export function fastestRisingDivision(categories) {
  if (!categories?.length) return null;
  return categories.reduce((best, c) => (c.annual_rate_pct > best.annual_rate_pct ? c : best));
}

// ---------------------------------------------------------------------------
// THE RANKED CONTRIBUTION LIST
// ---------------------------------------------------------------------------

/** How many contribution rows the ranked view draws before folding the rest. */
export const RANK_ROWS_SHOWN = 8;

/**
 * Split `mirror.js#contributions` output into the rows the ranked view draws
 * and one remainder, such that the two together still sum to π.
 *
 * The lead sentence over that list says the rows add up to exactly the user's
 * number, and `contributions` makes that true of all of them: Σ contributionPp
 * === π, exactly. The list is capped at eight rows for readability, though —
 * and on the default Bulgarian basket twelve divisions score above the
 * rendering threshold, so the visible column summed to 5.1 points against a
 * stated 5.4. The sentence was false on screen while every formula behind it
 * was right (docs/site.md §"A correct formula fed the wrong number" rule 4).
 *
 * So the remainder is returned rather than dropped, and it is computed from
 * the WHOLE list minus what is shown — not from the rows that happened to
 * clear the per-row display threshold. A row too small to draw still carries
 * points, and they belong in the total or the identity breaks again.
 *
 * @param {Array<{contributionPp:number}>} ranked  contributions(), sorted
 * @param {number} [limit]  rows to draw
 * @returns {{shown:Array, restN:number, restPp:number}}
 */
export function rankedSplit(ranked, limit = RANK_ROWS_SHOWN) {
  const rows = ranked ?? [];
  const shown = rows.filter((r) => Math.abs(r.contributionPp) >= 0.005).slice(0, limit);
  const total = rows.reduce((s, r) => s + r.contributionPp, 0);
  const drawn = shown.reduce((s, r) => s + r.contributionPp, 0);
  return { shown, restN: rows.length - shown.length, restPp: total - drawn };
}

// ---------------------------------------------------------------------------
// SHARE — see docs/principles.md P2
// ---------------------------------------------------------------------------

/**
 * The one sentence the share button puts on the clipboard.
 *
 * **It carries percentages and never a € amount, and that is a privacy
 * boundary, not a style choice.** `extraPerMonth = salary × π/(100+π)` inverts
 * exactly: publishing "my inflation is 5.4%, that's €48/month" reveals the
 * salary to the decimal. Any € figure added to this string leaks the user's
 * pay to everyone who reads the message (docs/principles.md P2).
 *
 * Nothing else personal is in scope either — no rent, no savings, no basket
 * shape, no mortgage amount.
 *
 * @param {{lang:string, piPct:number, officialPct:number, anchor:'y1'|number, fmt:(n:number)=>string}} args
 * @returns {string}
 */
export function shareSentence({ lang, piPct, officialPct, anchor, fmt }) {
  const bg = lang === "bg";
  const pi = fmt(piPct);
  const off = fmt(officialPct);
  if (anchor === "y1") {
    return bg
      ? `Моята лична инфлация е ${pi}% - официалната е ${off}%. Сметни своята за 30 секунди, без регистрация: vyarno.bg`
      : `My personal inflation is ${pi}% - the official figure is ${off}%. Work out yours in 30 seconds, no sign-up: vyarno.bg`;
  }
  return bg
    ? `Моята кошница е с ${pi}% по-скъпа от ${anchor}. А твоята заплата вдигна ли се с толкова? Провери: vyarno.bg`
    : `My basket costs ${pi}% more than in ${anchor}. Has your pay risen that much? Check: vyarno.bg`;
}
