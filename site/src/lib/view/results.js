/**
 * What the results card claims about a reader's own year.
 *
 * The headline is Eurostat's all-items figure verbatim and never Σ(w·r) over
 * the divisions — the two differ by the chain link, so a card that derives it
 * prints a rate no publisher stands behind. `headlineRate` therefore takes
 * only the headline payload: there is no parameter to hand it the categories
 * through. Savings are deflated by the published all-items index rather than
 * by the reader's basket, the ranked column has to add up to what the sentence
 * above it promises with the folded tail included, and the plain answer's
 * verdict is the one the pocket row took rather than a second opinion.
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_results.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

import {
  allItemsCumulativeSince2020,
  cashErosion,
  officialCumulativeSince2020,
} from "../mirror.js";

/**
 * Eurostat's official all-items 12-month rate, exactly as published.
 *
 * This function takes the headline payload and nothing else, on purpose: it
 * physically cannot be handed the category list and quietly become Σ(w·r).
 * The two differ by the December chain link (docs/math.md §"Two
 * reconciliations") — 0.16 pp apart in one month and 0.02 pp in another — so
 * the strip carries the official figure whichever way that gap happens to fall.
 *
 * @param {{headline_rate_pct?: number} | null | undefined} payload
 * @returns {number}
 */
export function headlineRate(payload) {
  const v = payload?.headline_rate_pct;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Whether the published headline is Eurostat's flash estimate.
 *
 * Read off the payload's own `is_flash`, never inferred from the months. The
 * two are gated to agree at publish time (`validate.py#validate_headline_flash`),
 * so inferring would give the same answer today and for a worse reason: a
 * payload whose index half is absent has no months to compare, and the
 * inference's answer there is "settled" — a marker missing from a figure that
 * needs it, which is the one direction that misleads a reader rather than
 * merely hedging at them.
 *
 * Absent reads as false, and that is the safe end: it prints the figure with no
 * marker, which is what an envelope written before the field existed means.
 *
 * @param {{is_flash?: boolean} | null | undefined} payload
 * @returns {boolean}
 */
export function headlineIsFlash(payload) {
  return payload?.is_flash === true;
}

/**
 * Whether the all-items headline and the per-division figures are at DIFFERENT
 * months — the state in which the gap between them is mostly not the method.
 *
 * Eurostat's flash publishes the all-items rate about two weeks before any
 * division, so `hicp_headline.json` can sit at 2026-07 while
 * `hicp_categories.json` is wholly at 2026-06 (docs/math.md §"Per-field
 * provenance"). Both figures are theirs at the months they name, and every page
 * that prints them side by side states each period beside its own number.
 *
 * **The PROSE over them is what this exists for.** The gap Σ(w·r) − headline is
 * ~0.16 pp when the two describe one month, which is the January re-weighting
 * and the December chain link and nothing else. During the flash it is several
 * times that and the extra is the month, so a paragraph explaining the whole
 * difference as the re-weighting is false exactly when a reader is most likely
 * to stop and check — the same failure `COPY.explainSameMonth` would be. Static
 * copy cannot be right in both states, so both surfaces branch here rather than
 * each carrying its own comparison to keep in step.
 *
 * Two months or neither: with one payload missing there is nothing to compare,
 * and false is the safer answer — it claims nothing about a month the page
 * cannot name.
 *
 * @param {object} args
 * @param {string} args.headlineMonth  hicp_headline.json's ref_period, "YYYY-MM"
 * @param {string} args.basketMonth    the divisions' ref_period, "YYYY-MM"
 * @returns {boolean}
 */
export function monthsSplit({ headlineMonth, basketMonth }) {
  return Boolean(headlineMonth) && Boolean(basketMonth) && headlineMonth !== basketMonth;
}

/**
 * What cash held since 2020 buys today.
 *
 * Takes PAYLOADS, never a rate, so the cumulative can only ever be a
 * since-2020 figure. Passing the user's own basket rate here would answer a
 * different question in the same sentence — the card says "от 2020 г." /
 * "since 2020" in fixed copy — and there is no argument to pass it through.
 *
 * **Prefers Eurostat's own all-items index** (`hicp_headline.json`'s CP00
 * `latest_index / index_by_year["2020"]`, both their published values), and
 * falls back to rebuilding the
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

/**
 * Which of the seven pocket verdicts a raise and a real change land in.
 *
 * The states are decided here rather than in the row that names them because
 * two surfaces read them: `PocketRow`, which has a sentence for each of the
 * seven, and the answer block at the top of the results card, which collapses
 * the three near-zero cases into one. Two ladders of thresholds written a
 * screen apart drift, and the way they drift is silent — the summary at the
 * top saying the raise is ahead while the row below says it is level, over one
 * number that has not moved.
 *
 * The ±1 pp dead zone has three insides on purpose. «Точно» is bound to
 * `pocket === 0` and nothing else: printed beside a figure reading «−0,3%» it
 * is a false sentence over correct arithmetic. A pay CUT is its own state
 * whatever prices did, because «увеличението е изядено» describes a raise that
 * never happened.
 *
 * @param {number} raisePct   nominal change in take-home, percent
 * @param {number} pocketPct  the same change in real terms, percent
 * @returns {'ahead'|'behind'|'level'|'nearUp'|'nearDn'|'none'|'cut'|'unsaid'}
 */
export function pocketVerdictState(raisePct, pocketPct) {
  if (!Number.isFinite(raisePct) || !Number.isFinite(pocketPct)) return "unsaid";
  if (raisePct === 0) return "none";
  if (raisePct < 0) return "cut";
  if (pocketPct >= 1) return "ahead";
  if (pocketPct <= -1) return "behind";
  if (pocketPct === 0) return "level";
  return pocketPct > 0 ? "nearUp" : "nearDn";
}

/**
 * The three things a reader arrives asking, as states rather than sentences.
 *
 * They arrive wanting to know whether their pay is keeping up, where that puts
 * them, and what is getting dearer or cheaper. Every figure behind those three
 * is already computed and already on the page — spread over three receipt rows
 * two to three screens down a phone. This decides WHICH of them can honestly
 * be stated and in what state; the component that renders it picks the words.
 *
 * **Two of the three refuse to speak, and that is the whole of what this
 * function is for.** `stand` needs `salaryAnswered`, not merely a rank: the
 * ladder is a claim about the reader in the second person, and a visitor on
 * €2,400 told on arrival that they out-earn a third of Sofia has been told
 * something false about themselves before typing a character — the rule
 * `PercentileRow` already keeps, restated here because a summary that outran
 * it would reintroduce the defect one screen higher up. `pay` needs a raise;
 * with none entered there is no real change to report and the clause asks for
 * one instead of computing over an absent number.
 *
 * `mover` reads the reader's OWN basket rows rather than the published
 * divisions, so a reader who has zeroed a slider is not told that the thing
 * they do not buy is what is rising fastest. Highest and lowest rate, not
 * biggest contribution: the headline block already names the group that adds
 * the most, and "what is getting dearer" is a different question from "what is
 * costing me most" — a small, fast-rising row answers the first and not the
 * second.
 *
 * @param {object} args
 * @param {number} args.raise          nominal change in take-home, percent
 * @param {number} args.pocket         the same change in real terms, percent
 * @param {boolean} args.salaryAnswered  whether the reader replaced the placeholder
 * @param {Array<{ahead:number}>} args.ranks    one ladder position per earner
 * @param {Array<{division:object, rate:number, share:number}>} args.ranked  contributions()
 * @returns {{pay:object, stand:object, mover:object}}
 */
export function answerLine({
  raise = NaN,
  pocket = NaN,
  salaryAnswered = false,
  ranks = [],
  ranked = [],
}) {
  const positions = salaryAnswered ? (ranks ?? []) : [];
  const ahead = positions.map((r) => r.ahead);
  // Only rows the reader actually spends on. A division at share 0 contributes
  // nothing to their number, so naming it as what is rising fastest describes
  // somebody else's basket.
  const spent = (ranked ?? []).filter((r) => r.share > 0);
  const dearest = spent.length ? spent.reduce((b, r) => (r.rate > b.rate ? r : b)) : null;
  const cheapest = spent.length ? spent.reduce((b, r) => (r.rate < b.rate ? r : b)) : null;
  return {
    pay: { state: pocketVerdictState(raise, pocket), pocketPct: pocket },
    stand: ahead.length
      ? {
          state: ahead.length > 1 ? "many" : "one",
          low: Math.min(...ahead),
          high: Math.max(...ahead),
        }
      : { state: "unsaid", low: 0, high: 0 },
    mover: {
      // Sign-gated in both directions: a basket where nothing has risen must
      // not be told what rose fastest, and one where nothing has fallen must
      // not be handed the least-bad row as a saving.
      up:
        dearest && dearest.rate > 0 ? { division: dearest.division, ratePct: dearest.rate } : null,
      down:
        cheapest && cheapest.rate < 0
          ? { division: cheapest.division, ratePct: cheapest.rate }
          : null,
    },
  };
}
