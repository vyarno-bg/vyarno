/**
 * How much of a reader's money the price rise is charged against.
 *
 * The € column beside every division, the leftover row and the exposed-spend
 * figure are all carved out of one base, and the whole class of failure here is
 * carving them out of the wrong one. Point the base at the whole take-home in
 * euro mode and every per-division figure inflates by the ratio between what
 * was typed and what was earned — thirteen numbers the reader never entered,
 * every one of them inside the band a reviewer would call plausible. Housing
 * comes out first, because rent and a mortgage payment are money already
 * committed.
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_spend.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

import { cashErosion } from "../mirror.js";
import { headlineRate } from "./results.js";

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

/**
 * The share of take-home a reader may claim they actually spend, 0–100.
 *
 * Exported because the control's handler clamps with it before the number
 * reaches `$state`: the label beside the slider renders that state directly, so
 * a value the arithmetic would reject but the label would print is a screen
 * saying 130% over a base of 100%. Clamping in one place is what stops the
 * claim and the figures carved out of it from describing different readers.
 *
 * **Anything unusable becomes 100, never 0.** A `NaN` out of a parsed field is
 * the app failing to read an answer, and answering it on the reader's behalf
 * with "you spend nothing" would empty every € figure on the page; 100 is the
 * same thing the app says to someone who never touched the control.
 *
 * @param {number} pct
 * @returns {number} 0–100
 */
export function clampSpendShare(pct) {
  if (!Number.isFinite(pct)) return 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * What the € column is measured against, and what the reader has left over.
 *
 * **The two modes measure the remainder differently, and that is the point.**
 * A basket of *percentage shares* says how a pot divides; it cannot say how big
 * the pot is, so the size of anything left outside it has to be STATED —
 * `spendSharePct` is the reader's claim about how much of their take-home
 * actually gets spent. A basket of *euros per month* is a list of real
 * payments, so the remainder is MEASURED off what they typed and needs no
 * claim; the euro mode ignores `spendSharePct` for that reason, and the two
 * cannot contradict each other on screen because only one of them is ever live.
 *
 * So `spendBase` — the amount the per-division € figures and
 * `mirror.js#contributions` are carved out of — is `spendable × s/100` in share
 * mode and **the euros actually entered** in euro mode. Feeding `spendable` to
 * both is the bug this function exists to make unexpressible: it silently
 * rescaled a €1,000 basket up to a €1,250 budget, so someone who typed their
 * real spending was shown thirteen numbers they had never typed, all of them
 * 25% too big, adding to a total they had deliberately not reached. The app was
 * insisting they spend everything.
 *
 * **`spendSharePct` defaults to 100 and every caller that omits it gets the
 * whole spendable amount**, which is both the honest default — a share the
 * reader has not claimed is not a share we may assume, and any other value
 * shrinks their headline € figure in the flattering direction
 * (docs/principles.md P7) — and what keeps this a no-op for a reader who never
 * touches the control.
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
 * @param {number} [args.spendSharePct]  share mode only: how much of `spendable`
 *   the reader says they actually spend, 0–100. Anything unusable is 100.
 * @returns {{entered:number, spendBase:number, leftover:number, over:number,
 *            leftoverPct:number, leftoverPerYear:number, hasLeftover:boolean}}
 */
export function basketBudget({ spendMode, amounts, spendable, spendSharePct }) {
  const entered = (amounts ?? []).reduce((s, x) => s + (x > 0 ? x : 0), 0);
  const budget = Math.max(0, spendable || 0);

  if (spendMode !== "eur") {
    const share = clampSpendShare(spendSharePct);
    const spendBase = (budget * share) / 100;
    const leftover = budget - spendBase;
    return {
      entered,
      spendBase,
      leftover,
      // A share cannot exceed the money it is a share of. Over-allocation is a
      // euro-mode state: it takes thirteen typed amounts to reach it.
      over: 0,
      leftoverPct: budget > 0 ? (100 * leftover) / budget : 0,
      leftoverPerYear: leftover * 12,
      hasLeftover: budget > 0 && leftover >= 1,
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
 * **This reduces to `salary` exactly whenever nothing is left unplaced** — in
 * share mode at the default 100% claim, `spendBase` is `salary − housingCost`
 * and the sum is the salary again — so the headline € figure is unchanged for
 * everyone who has not deliberately left money out. Only a reader who told us
 * they spend less than they earn, by dragging the share control or by typing a
 * euro basket smaller than their pay, gets a different — smaller, truer —
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
