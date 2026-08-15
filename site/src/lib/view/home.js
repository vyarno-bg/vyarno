/**
 * What a home costs the reader who is buying one.
 *
 * Every input the annuity takes is a wrong number waiting to be plausible, so
 * the signatures refuse the wrong ones rather than being tested against them:
 * `mortgagePanel` reads the down payment, the maturity ceiling and both DSTI
 * figures out of the published БНБ limits instead of accepting them, so no
 * caller can quote a 0%-down loan or adopt the regulator's 50% line in place
 * of our 30% one. The rate it amortises is the AAR — the APRC is for comparing
 * offers, and compounding its fees monthly overstates the payment by ~€24 on
 * the published София median (`docs/math.md` §"Three rates").
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_home.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

import { annuityPayment, annuityReverse } from "../mirror.js";

/**
 * The total asking price the mortgage math runs on.
 *
 * "auto" → имот.bg's median for the reader's own град × the size they picked.
 * "manual" → the price they typed for a home they already found.
 *
 * **`eurPerM2Isreal` is the third argument and it is not optional.** The €/m²
 * this receives falls back to `HOME.eurPerM2_offlineFallback`, a round constant
 * with no measurement behind it, whenever the chosen град has no published
 * median — which is now an ordinary state rather than a first-paint flicker: a
 * reader who has picked no област at all, and one whose област имот.bg publish
 * no city for. Multiplied by 70 m² that constant produced a €175,000 home, a
 * €661/month payment and a "44% of your pay" verdict, and it did not stop at
 * the home row: `monthlyMort` is carved out of the money the BASKET's € column
 * is computed from, so an invented mortgage quietly moved thirteen category
 * figures the reader never connected to it.
 *
 * Zero rather than a placeholder, because every consumer already gates on the
 * figure being positive and none of them can gate on a provenance they were
 * not handed. The row that would have printed it says what it is waiting for
 * instead.
 *
 * @param {{priceMode:string, manualPrice:number, eurPerM2:number, m2:number,
 *          eurPerM2IsReal:boolean}} args
 * @returns {number}
 */
export function homePriceFor({ priceMode, manualPrice, eurPerM2, m2, eurPerM2IsReal }) {
  if (priceMode === "manual" && manualPrice > 0) return manualPrice;
  if (!eurPerM2IsReal) return 0;
  return (eurPerM2 || 0) * (m2 || 0);
}

/**
 * The €/m² the price on screen is actually built from, and whose it is.
 *
 * **The sentence quotes a per-square-metre figure in the same breath as the
 * total, so the two have to be the same number.** They were not in manual
 * mode: «70 м² в София ≈ €200 000 (≈2501€/м², медиана)» over a price the
 * reader typed, where 200 000 ÷ 70 is 2857. Both figures were real and the
 * bracket explained the other one — имот.bg's median, captioned as the basis of
 * a price имот.bg had nothing to do with.
 *
 * Same shape as `homePriceFor`, and it takes the same arguments so the two
 * cannot answer about different prices. `isOwn` is a fact rather than a word;
 * the component picks the words.
 *
 * @param {{priceMode:string, manualPrice:number, eurPerM2:number, m2:number,
 *          eurPerM2IsReal:boolean}} args
 * @returns {{eurPerM2:number, isOwn:boolean}}
 */
export function homePriceBasis({ priceMode, manualPrice, eurPerM2, m2, eurPerM2IsReal }) {
  if (priceMode === "manual" && manualPrice > 0) {
    return { eurPerM2: m2 > 0 ? manualPrice / m2 : 0, isOwn: true };
  }
  return { eurPerM2: eurPerM2IsReal ? eurPerM2 || 0 : 0, isOwn: false };
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
