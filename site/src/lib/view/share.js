/**
 * What leaves the page when a reader shares it — `docs/principles.md` P2.
 *
 * A share surface is the one place a personal figure could travel, so the
 * guarantee is built into the signature rather than asserted downstream of it.
 * `mirror.js#extraPerMonth` is salary × π/(100+π) and inverts exactly, so «my
 * inflation is 5.4%, that's €48 a month» hands the salary to everyone who
 * reads the message; `sharePayload` therefore takes no salary at all — there is
 * nothing for a caller to pass and nothing downstream to invert. `SHARE_FIELDS`
 * is the closed list of what does travel, and adding to it is where the
 * argument happens.
 *
 * Check a new field against the INVERSION rather than against the presence of a
 * euro sign: the ladder position reconstructs the pay to within a rung's width
 * off two committed payloads, and a personal tax-wedge rate inverts above the
 * insurance ceiling. The dangerous ones look safe.
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_share.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

import { number } from "../format.js";
import { t } from "../content.js";

/** Where a share surface sends a stranger. Checked against the sitemap's own. */
export const SHARE_ORIGIN = "https://vyarno.bg";

/** The same address as a reader says it, for a surface that cannot carry a link. */
export const SHARE_DOMAIN = "vyarno.bg";

/**
 * Everything `sharePayload` is allowed to hand onward, as a closed set.
 *
 * The list is the review surface. A field added to the returned object without
 * being added here fails `verify_view_share.mjs`, which puts the person adding
 * it in front of P2 at the moment they are deciding — rather than after an
 * image is already in somebody's chat.
 */
export const SHARE_FIELDS = Object.freeze([
  "piPct",
  "officialPct",
  "verdict",
  "ownBasket",
  "anchor",
  "refPeriod",
  "topBgName",
  "topEnName",
  "topPp",
  "domain",
  "url",
]);

/**
 * The only numbers that may cross onto a share surface.
 *
 * **This function has no salary parameter, and that is the guarantee.**
 * `mirror.js#extraPerMonth` is `salary × r/(100+r)`, which inverts exactly, so
 * a € absolute printed beside the percentage it came from publishes the
 * reader's pay to everyone the image reaches (docs/principles.md P2, and the
 * closed list names this case outright). Asserting that no `€` reaches the
 * finished string catches the mistake; taking no salary makes it unexpressible,
 * which is the standard the rest of this file is held to.
 *
 * Three figures the site already computes are excluded for the same reason,
 * and two of them look safe:
 *
 *   - **The ladder position inverts.** `mirror.js#percentile` interpolates over
 *     rungs composed from `salary_dist.json` and `sector_salary.json`, both
 *     committed and public, so "ahead of 34%" reconstructs the net pay to
 *     within a rung's width. It carries no currency symbol and is no safer for
 *     it.
 *   - **A personal tax wedge inverts above the insurance ceiling.** Below the
 *     cap the effective rate is constant and says nothing; above it the rate
 *     falls with every extra euro of gross, so the rate names the salary.
 *   - **The thirteen basket weights** reconstruct no euro on their own, but a
 *     thirteen-number spending profile identifies a household to anyone who
 *     knows them. One category name carries the same story and is one of
 *     thirteen possibilities.
 *   - **The sector gap inverts EXACTLY, and is the strongest of these.** The
 *     ladder position above is bounded by a rung's width — €1,997 at P80
 *     against €2,802 at P90 — so it names a range. A sector gap divides by one
 *     of the section averages published in `sector_salary.json`, so "18% below
 *     Information and communication" is a single net wage to the euro, and the
 *     sector name narrows the sender to one of the nineteen groups `sectorOptions`
 *     offers before the percentage is read at all. It reaches no share surface, and the
 *     parameter list below is what stops it: `sharePayload` takes no sector.
 *
 * What is left is a rate over a basket (thirteen unknowns collapsed into one
 * scalar, and `mirror.js#personalInflation` never sees the pay at all), a
 * published national rate, a category name, a contribution in percentage
 * points, and dates.
 *
 * `near` is passed in rather than recomputed: it is the same boolean the
 * results card colours its verdict with, so the sentence on the image and the
 * sentence on the screen cannot come to opposite conclusions about the same
 * basket.
 *
 * The gap between the two rates is deliberately NOT returned. Both are rendered
 * at one decimal place and their difference is not the difference of their
 * roundings — 7.24 against 4.06 draws as 7,2 and 4,1 over a stated 3,2 — and
 * the two bars say which is longer without arithmetic the reader has to trust.
 *
 * **`activePreset` decides `ownBasket` HERE, not at the call site**, so both
 * share surfaces read one flag — the failure `near` is passed in to prevent,
 * one state further back. The four presets count as the reader's own: clicking
 * one is a claim somebody makes, arriving at the default is not.
 *
 * @param {object} args
 * @param {number} args.pi         the reader's own rate, percent
 * @param {number} args.official   the same window on the official basket, percent
 * @param {boolean} args.near      the results card's own "close to average" verdict
 * @param {string|null} args.activePreset  the loaded basket, or null once hand-edited
 * @param {'y1'|number} args.anchor
 * @param {Array<{division:object, contributionPp:number}>} [args.ranked]
 * @param {string} [args.refPeriod]  the published period the rates are from
 * @returns {object|null} the shareable fields, or null when nothing is measured
 */
export function sharePayload({
  pi,
  official,
  near,
  activePreset = null,
  anchor,
  ranked = [],
  refPeriod = "",
}) {
  if (!Number.isFinite(pi) || !Number.isFinite(official)) return null;

  // Only the leading row, and only its name and its points. Passing the whole
  // division through would carry `eurPerMonth` and `spendEur` onto the card's
  // props, where rendering one is a one-word mistake.
  const top = ranked[0]?.division ? ranked[0] : null;

  return {
    piPct: pi,
    officialPct: official,
    verdict: near ? "close" : pi > official ? "dearer" : "cheaper",
    ownBasket: activePreset !== "official",
    anchor,
    refPeriod,
    topBgName: top ? top.division.bg_name : "",
    topEnName: top ? top.division.en_name : "",
    topPp: top ? top.contributionPp : NaN,
    domain: SHARE_DOMAIN,
    url: SHARE_ORIGIN,
  };
}

/**
 * Which sentence each verdict gets.
 *
 * The key names are written out as strings so `verify_copy.mjs`'s dead-key
 * scan can see them: it reads the sources as text, and `copy[k]` behind a
 * variable is invisible to it. Same device as `ResultsSummary`'s preset
 * labels.
 */
const SHARE_LINE_KEY = Object.freeze({
  dearer: "shareLineDearer",
  cheaper: "shareLineCheaper",
  close: "shareLineClose",
});

/**
 * Every `COPY` key the share text is assembled from.
 *
 * A share surface is the one place where a missing string is not merely a
 * blank line — it is a message a reader sends to somebody else with `{p}` or
 * `undefined` in it. `verify_copy.mjs` checks each of these exists and that
 * the finished sentence has no unsubstituted brace left in either language.
 */
export const SHARE_COPY_KEYS = Object.freeze([
  ...Object.values(SHARE_LINE_KEY),
  "shareLineNoBasket",
  "shareWindowY1",
  "shareWindowSince",
  "shareCta",
]);

/**
 * The text a reader copies or hands to the share sheet.
 *
 * Written in the FIRST person, where every other sentence in the app says
 * «ти». The reader is the author of this one — it is spoken by them to
 * somebody who has never opened the site — and «твоята кошница поскъпна»
 * arriving in a stranger's chat addresses the wrong person.
 *
 * The words live in `content.js` like all the others and are handed in, so
 * this stays the layer that decides which number goes where and the copy stays
 * reviewable in one file.
 *
 * @param {object} args
 * @param {object|null} args.share  `sharePayload()` output
 * @param {object} args.copy        the `COPY` object from `content.js`
 * @param {'bg'|'en'} args.lang
 * @returns {string} the message, or "" when there is nothing to say
 */
export function shareSentence({ share, copy, lang = "bg" }) {
  if (!share) return "";
  const windowLabel =
    share.anchor === "y1"
      ? t(copy.shareWindowY1, lang)
      : t(copy.shareWindowSince, lang, { y: String(share.anchor) });
  // With no basket described the two rates are one number. `shareLineNoBasket`
  // carries it once and has no `{p}` slot at all.
  const body = share.ownBasket
    ? t(copy[SHARE_LINE_KEY[share.verdict]], lang, {
        p: number(share.piPct, 1, lang),
        o: number(share.officialPct, 1, lang),
        w: windowLabel,
      })
    : t(copy.shareLineNoBasket, lang, {
        o: number(share.officialPct, 1, lang),
        w: windowLabel,
      });
  return `${body} ${t(copy.shareCta, lang, { u: share.url })}`;
}

/**
 * The value the longer of the two comparison bars is drawn against.
 *
 * A floor, not the larger of the pair: over one year a basket that rose 0.4%
 * against an official 0.3% would otherwise fill the track edge to edge and
 * read as a catastrophe, and the two bars exist to be compared to each other
 * AND to be read as a size. At a year anchor the cumulative figures are large
 * enough that a fixed floor would flatten them instead, so the floor there is
 * relative to the official rise.
 *
 * The results card and the share image draw the same pair of bars, so the
 * ceiling is computed once — the failure worth preventing is the image
 * disagreeing with the screen it was generated from.
 *
 * @param {object} args
 * @param {number} args.piPct
 * @param {number} args.officialPct
 * @param {'y1'|number} args.anchor
 * @returns {number} percent; always at least 1
 */
export function barCeiling({ piPct, officialPct, anchor }) {
  const pi = Number.isFinite(piPct) ? piPct : 0;
  const official = Number.isFinite(officialPct) ? officialPct : 0;
  return Math.max(pi, official, anchor === "y1" ? 8 : official * 1.35, 1);
}
