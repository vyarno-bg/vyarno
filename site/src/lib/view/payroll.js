/**
 * Where a household's pay stands once it has been taxed.
 *
 * The arithmetic is `mirror.js`'s. What lives here is what those formulas get
 * fed, and the wrong number that looks right: itemise the NET a reader typed as
 * though it were the contract gross and every line comes out about 20% light,
 * with no band anywhere that would flag it. The rates and the insurance ceiling
 * are read out of the published payload rather than written down, each contract
 * is taxed against its own ceiling rather than the household total against one,
 * and a percentile is read from the bottom — «top 63%» for a below-median
 * income reads as an achievement and is false.
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_payroll.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

import {
  bgGrossFromNet,
  bgHouseholdPayroll,
  bgMarginalRatePct,
  bgNetSalary,
  bgTaxWedge,
  householdNetRaisePct,
  payrollParams,
  percentile,
  wageGap,
} from "../mirror.js";
import { SECTOR_HINTS } from "../content.js";

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
 * **It takes a LIST, and there is no scalar parameter to pass a total to.**
 * That is the §3.3 rule applied to the household: the insurance ceiling is per
 * contract, so a combined net inverted as one salary understates a two-earner
 * household's gross by hundreds of euro a month (`mirror.js#bgHouseholdPayroll`
 * carries the worked example). A caller holding only `householdNet` cannot
 * express that mistake here, because the argument this function accepts is not
 * the shape that figure has. One earner is a list of one.
 *
 * **The list arrives inside a `pay` object that also states its basis**, so an
 * amount cannot be passed without saying what it is. A gross typed into a
 * parameter named `nets` is a ~29% error on every figure below it, and it looks
 * entirely ordinary — the same class of mistake as the ceiling, one layer up.
 *
 * `null` for an empty field. There is no payslip for a salary nobody typed,
 * and rendering one at zero invites the reader to check a column of zeroes.
 *
 * @param {object} args
 * @param {object|null} args.payroll   data.payroll (payroll.json), unmodified
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} args.pay
 * @returns {null | (ReturnType<typeof bgHouseholdPayroll> & {
 *            maxInsurable:number, effectiveYear:number|null })}
 */
export function payslipPanel({ payroll, pay }) {
  const params = payrollParams(payroll);
  const household = bgHouseholdPayroll(pay?.amounts, params, pay?.basis);
  if (!household.earners.length) return null;

  // The ceiling and the rate year are carried through so the template can name
  // them without re-deriving either — a second derivation is a second chance to
  // take them off the wrong payload, and a breakdown captioned "2026 rates"
  // over last year's figures is wrong in a way nothing else would catch.
  //
  // They ride on EVERY earner as well as on the panel, so the row component
  // renders one earner's breakdown from one object and needs no second prop to
  // stay correct. Attaching them once at the top and letting the row reach for
  // `panel.maxInsurable` is the arrangement where a row can be handed the wrong
  // household's ceiling.
  const carried = {
    maxInsurable: params.maxInsurable,
    effectiveYear: payroll?.effective_year ?? null,
  };
  return {
    ...household,
    earners: household.earners.map((e) => ({ ...e, ordinal: e.index + 1, ...carried })),
    ...carried,
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
 * **Each earner's position is derived from their GROSS**, recovered from the
 * net they typed with `bgGrossFromNet`. Feeding the net straight in would place
 * someone earning €2,200 gross below a €2,111.64 cap they are actually over —
 * a wrong answer inside every plausible band, exactly the class of error
 * `docs/data-sources.md` §"A plausible number is not a verified number"
 * exists for.
 *
 * **Every earner gets their own point on the curve, and the curve is where the
 * household stops being a single reader.** The whole finding this row exists to
 * show — the effective rate peaks at the ceiling and falls above it — is a
 * statement about one contract. Two people on €1,200 and one on €2,400 sit at
 * three different places on it, and marking their combined pay would put a
 * marker where nobody in the household stands.
 *
 * @param {object} args
 * @param {object|null} args.payroll   data.payroll (payroll.json), unmodified
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} args.pay
 * @returns {{capGross:number, peakEffectivePct:number, marginalBelowPct:number,
 *            marginalAbovePct:number, capRisePerMonth:number|null,
 *            points:Array<{gross:number, effectivePct:number, marginalPct:number}>,
 *            earners:Array<{index:number, gross:number, effectivePct:number,
 *                           marginalPct:number, overCap:boolean}>,
 *            headlineEffectivePct:number|null}}
 */
export function taxWedgePanel({ payroll, pay }) {
  const params = payrollParams(payroll);
  const wedge = bgTaxWedge({ params, nextCap: scheduledMaxInsurable(payroll) });

  const earners = [];
  (pay?.amounts ?? []).forEach((n, index) => {
    const amount = Number(n);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // In gross mode the reader already typed the figure this curve is drawn
    // against, so there is nothing to recover.
    const gross = pay?.basis === "gross" ? amount : bgGrossFromNet(amount, params);
    earners.push({
      index,
      ordinal: index + 1,
      gross,
      effectivePct: bgNetSalary(gross, params).effectiveRatePct,
      marginalPct: bgMarginalRatePct(gross, params),
      overCap: gross >= params.maxInsurable,
    });
  });

  // The household aggregates come from `bgHouseholdPayroll` rather than being
  // re-added here, so the corner of this row and the payslip under the pay
  // field cannot disagree about either figure. A second implementation of the
  // weighted rate is also where the obvious wrong one lives — the plain average
  // of the per-earner rates, which is off by whole points the moment the
  // earners are unequal.
  const household = bgHouseholdPayroll(pay?.amounts, params, pay?.basis);

  return {
    ...wedge,
    earners,
    // What the row's corner states. One earner: their own rate at full
    // precision, which is the figure this row has always shown. Several: the
    // household's, total deductions over total gross.
    headlineEffectivePct: earners.length
      ? earners.length === 1
        ? earners[0].effectivePct
        : household.effectiveRatePct
      : null,
    // Stated in the household sentence. Summing `earners[].gross` in the
    // template would put arithmetic in the render layer, where no test reaches
    // it — docs/site.md §"A correct formula fed the wrong number".
    householdGross: household.gross,
  };
}

/**
 * Every earner's monthly NET take-home, whichever basis they were typed in.
 *
 * **The one place a gross becomes a net**, and therefore the only thing the
 * rest of the page has to trust. Rent as a share of pay, the basket, the 30%
 * mortgage line and the position on the earnings ladder are all statements
 * about take-home; fed a gross they are each wrong by around 29% while looking
 * completely ordinary — and the mortgage one is wrong in the direction that
 * says a home is affordable when it is not, which
 * `AGENTS.md` forbids in as many words.
 *
 * Blanks stay blank rather than becoming zero: a second income field nobody has
 * filled in yet is a person not yet described, and `householdNet` skips it.
 *
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} pay
 * @param {object|null} payroll  data.payroll (payroll.json), unmodified
 * @returns {Array<number|null>} one net per entry, in the same positions
 */
export function netsOf(pay, payroll) {
  const params = payrollParams(payroll);
  return (pay?.amounts ?? []).map((n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    return pay?.basis === "gross" ? bgNetSalary(v, params).net : v;
  });
}

/**
 * The same amounts read in the other basis, for the moment the reader flips the
 * toggle.
 *
 * **Converting in place is what keeps the toggle a display choice.** The figure
 * in the box changes from €900 to €1,160 and not one number below it moves,
 * which is the contract the %/€ basket toggle already keeps
 * (`Calculator#setSpendMode`). The alternative — leaving 900 in the box and
 * re-reading it as a gross — silently rewrites every result on the page while
 * the reader believes they changed a label.
 *
 * Rounded to the cent, because it lands in a number input the reader will type
 * over. The round trip is protected by the caller stashing what was typed, not
 * by this rounding being lossless — it is not: €900 net → €1,159.82 gross →
 * €900.00 back is fine, but the general case drifts a cent per flip and a
 * salary that creeps while nobody edits it is its own kind of wrong.
 *
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} pay
 * @param {object|null} payroll
 * @returns {Array<number|null>}
 */
export function convertPay(pay, payroll) {
  const params = payrollParams(payroll);
  const to = pay?.basis === "gross" ? "net" : "gross";
  return (pay?.amounts ?? []).map((n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    const out = to === "gross" ? bgGrossFromNet(v, params) : bgNetSalary(v, params).net;
    return Math.round(out * 100) / 100;
  });
}

/**
 * The household's nominal change in take-home, and which earners still owe an
 * answer for it.
 *
 * The two travel together because the row renders one or the other and must
 * never render both: a percentage computed over the earners who happen to have
 * filled the field in, beside a prompt asking the rest to fill it in, is a
 * figure about part of a household presented as the household's.
 * `mirror.js#householdNetRaisePct` returns NaN in that state; this says who to
 * name.
 *
 * @param {object} args
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} args.pay
 * @param {Array<number|null|undefined>} args.raises  percent, one per earner
 * @param {object|null} args.payroll
 * @returns {{pct:number, missing:Array<{index:number, ordinal:number}>}}
 */
export function householdRaise({ pay, raises, payroll }) {
  const missing = [];
  (pay?.amounts ?? []).forEach((n, index) => {
    const amount = Number(n);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // Same guard as `householdNetRaisePct`, and for the same reason: 0 is an
    // answer and `null` is not, but both coerce to 0. The two must agree about
    // which earners are missing, or the row names nobody while the figure stays
    // NaN.
    const stated = (raises ?? [])[index];
    const r = Number(stated);
    const unanswered =
      stated === null || stated === undefined || stated === "" || !Number.isFinite(r) || r <= -100;
    if (unanswered) missing.push({ index, ordinal: index + 1 });
  });
  return {
    pct: householdNetRaisePct(
      { basis: pay?.basis ?? "net", amounts: pay?.amounts, raises },
      payrollParams(payroll)
    ),
    missing,
  };
}

/**
 * Where each earner sits on the published net-earnings ladder.
 *
 * **The ladder ranks people, not households.** Its rungs are individual
 * full-time earnings (Eurostat SES, re-levelled onto НСИ's Sofia mean — see
 * `mirror.js#buildLadder`), so a household total read off it is a unit
 * mismatch of exactly the kind that once pushed every Sofia salary to the 99th
 * percentile: two people on €900 each would be reported as out-earning 78% of
 * Sofia, when what is true is that each of them out-earns 34%.
 *
 * So this ranks earner by earner and returns one row apiece. There is no
 * argument through which a total could be passed, which is the point.
 *
 * @param {object} args
 * @param {Array<number|null|undefined>} args.nets  monthly NET take-home per earner
 * @param {number[]} args.ladder  the 11 NET rungs from mirror.js#buildLadder
 * @returns {Array<{index:number, net:number, rank:number, ahead:number}>}
 */
export function earnerRanks({ nets, ladder }) {
  if (!ladder?.length) return [];
  const out = [];
  (nets ?? []).forEach((n, index) => {
    const net = Number(n);
    if (!Number.isFinite(net) || net <= 0) return;
    const rank = percentile(net, ladder);
    if (rank > 0) out.push({ index, ordinal: index + 1, net, rank, ahead: pctAhead(rank) });
  });
  return out;
}

/**
 * Each earner against the Sofia average, as a percentage and a direction.
 *
 * **Per earner, because НСИ publish a wage and not a household income.** The
 * comparator asks "how does what you earn compare with what people here earn",
 * and answering it with a two-earner total says a household of two on €900 each
 * is 21% above the average worker. Both halves of that sentence are true
 * numbers; together they are a false claim.
 *
 * The percentage is **rounded before the direction is chosen**, so the word and
 * the figure can never disagree. Choosing «над» off the exact value and then
 * printing a rounded 1% leaves «1% над средната» sitting inside the dead zone
 * the direction words exist to keep quiet about.
 *
 * `direction` and not a word: this file picks numbers, and the component that
 * renders them picks the language. Returning «над» here would put Bulgarian in
 * the layer that has no `$lang` to switch it with.
 *
 * @param {object} args
 * @param {Array<number|null|undefined>} args.nets  monthly NET take-home per earner
 * @param {number} args.regionNet  the chosen област's average wage, net, EUR/month
 * @returns {Array<{index:number, net:number, diffPct:number, magnitudePct:number,
 *                  direction:'above'|'below'|'equal'}>}
 */
export function regionGap({ nets, regionNet }) {
  const ref = Number(regionNet);
  if (!Number.isFinite(ref) || ref <= 0) return [];
  const out = [];
  (nets ?? []).forEach((n, index) => {
    const net = Number(n);
    if (!Number.isFinite(net) || net <= 0) return;
    const gap = wageGap(net, ref);
    if (!gap) return;
    out.push({
      index,
      // Which income the sentence is about, as the reader counts them. Decided
      // here so no template does `index + 1` in the middle of a string —
      // arithmetic in the render layer is arithmetic no test can reach, and
      // `verify_template_safety` refuses to see it interpolated into markup.
      ordinal: index + 1,
      net,
      ...gap,
    });
  });
  return out;
}

/**
 * The chosen sector's published average, and how the reader sits against it.
 *
 * Selection, not arithmetic: the value and the period are НСИ's own published
 * cells, picked by `key` out of `sector_salary.json`. The one computation is
 * the gross-to-net conversion and the gap, both handed to `mirror.js`, both in
 * the reader's own tab.
 *
 * **This returns no rank, and there is none to return.** Nobody publishes a pay
 * distribution by economic activity for Bulgaria — Eurostat's `earn_ses_monthly`
 * carries no NACE section for BG at all, only broad groupings, of which just
 * the whole-economy one is populated at the vintage the site reads —
 * so `gap` is a distance from an average and the copy beside it has to say so.
 * `mirror.js#meanRungPosition` is what lets a reader correct for it, and it is
 * deliberately not reachable from here with a sector figure.
 *
 * @param {object} args
 * @param {object|null} args.sectorSalary  data.sectorSalary (sector_salary.json)
 * @param {string} args.key  the chosen sector's English name, as НСИ print it
 * @param {Array<number|null|undefined>} args.nets  monthly NET per earner
 * @param {object|null} args.payroll  data.payroll
 * @returns {{bgName:string, enName:string, gross:number, net:number,
 *            refPeriod:string, isPreliminary:boolean, sourceUrl:string,
 *            sourceUrlBg:string, gaps:Array<object>} | null} null when unselected
 */
export function sectorComparison({ sectorSalary, key, nets, payroll }) {
  const rows = Array.isArray(sectorSalary?.sectors) ? sectorSalary.sectors : [];
  // The all-activities row resolves to nothing here, not just to nothing in the
  // picker. `sectorOptions` leaves it out because it is not an economic
  // activity; refusing it again at the lookup is what makes that structural
  // rather than a property of one list — a key reaching this function from
  // anywhere else still cannot produce «средната за „Общо“» under a sentence
  // about the reader's own sector.
  const row = rows.find((s) => s?.en_name === key && s?.en_name !== SECTOR_TOTAL_KEY);
  const gross = Number(row?.value_eur);
  if (!row || !Number.isFinite(gross) || gross <= 0) return null;

  const params = payrollParams(payroll);
  const net = bgNetSalary(gross, params).net;
  const gaps = [];
  (nets ?? []).forEach((n, index) => {
    const own = Number(n);
    if (!Number.isFinite(own) || own <= 0) return;
    const gap = wageGap(own, net);
    if (gap) gaps.push({ index, ordinal: index + 1, net: own, ...gap });
  });

  return {
    bgName: String(row.bg_name ?? ""),
    enName: String(row.en_name ?? ""),
    gross,
    net,
    refPeriod: String(sectorSalary?.ref_period ?? ""),
    isPreliminary: Boolean(sectorSalary?.is_preliminary),
    // One URL per language, because the labels differ between the two editions.
    // A Bulgarian reader sent to the English workbook cannot find the row they
    // just read — the verify link has to land on the file the label came from,
    // or it demonstrates nothing (P3, P9).
    sourceUrl: String(sectorSalary?.source_url ?? ""),
    sourceUrlBg: String(sectorSalary?.source_url_bg ?? sectorSalary?.source_url ?? ""),
    gaps,
  };
}

/**
 * The picker's options, in НСИ's own row order with their own labels.
 *
 * Their order is the classification's, not a ranking, and it is kept because
 * re-sorting by wage would turn a list of sections into a league table — a
 * different claim, made by the ordering rather than by any number on it.
 *
 * **The all-activities row is not one of them.** НСИ head the table with
 * `Total` / «Общо», which is the figure the sections are read against rather
 * than an economic activity anybody works in. In a picker labelled «Твоят
 * сектор» it collects the reader who cannot find their own line, and answers
 * them with a distance from the whole economy under a caveat that calls it a
 * broad КИД-2008 section. It stays in the payload — the connector's regression
 * guard is that it sits inside the range of the sections — and is dropped
 * here, where its label would be a claim about somebody's industry.
 *
 * **Each option leads with the everyday words for the work and ends with НСИ's
 * name in full** (`content.js#SECTOR_HINTS`, which is where the reasoning
 * lives). The order is that way round because a phone shows the front of the
 * closed control and truncates the rest, and the front is the part a reader
 * uses to find their line — «Създаване и разпространение на информация и
 * творчески продукти; далекосъобщения» is 78 characters that do not contain
 * the word for anybody's job.
 *
 * **The hint can only ever be added to НСИ's label, never substituted for it.**
 * The template below composes in one direction and there is no branch that
 * returns a hint alone, so an option cannot end up naming a section something
 * НСИ did not call it. A section with no hint — or one they rename tomorrow —
 * falls back to their label by itself, which is the degraded state that is
 * still correct rather than the one that is still readable.
 *
 * @param {object|null} sectorSalary  data.sectorSalary
 * @param {Record<string, {bg:string, en:string}>} [hints]  injectable for tests
 * @returns {Array<{key:string, bg:string, en:string}>}
 */
export function sectorOptions(sectorSalary, hints = SECTOR_HINTS) {
  const rows = Array.isArray(sectorSalary?.sectors) ? sectorSalary.sectors : [];
  const lead = (hint, name) => (hint ? `${hint} — ${name}` : name);
  return rows
    .filter((s) => s?.en_name && s?.bg_name && String(s.en_name) !== SECTOR_TOTAL_KEY)
    .map((s) => {
      const hint = hints?.[String(s.en_name)];
      return {
        key: String(s.en_name),
        bg: lead(hint?.bg, String(s.bg_name)),
        en: lead(hint?.en, String(s.en_name)),
      };
    });
}

/** НСИ's own label for the all-activities row, which is not a sector. */
export const SECTOR_TOTAL_KEY = "Total";

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
