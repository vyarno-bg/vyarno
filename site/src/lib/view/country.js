/**
 * The figures `/how/` renders with nobody in them.
 *
 * Everything here answers a question about Bulgaria rather than about the
 * person reading. That is what lets the page render with no input on it at all
 * — and, because none of these can take a reader's own figure as an argument,
 * what keeps it on the right side of P1 and P2 by construction rather than by
 * review. The wrong numbers are anchoring the pay ladder on one област's
 * average instead of the country's, a wedge rung that misses the insurance
 * ceiling so the curve's peak falls off the table, a citation taken from a
 * publisher that does not own the figure, and a city's trend drawn from
 * another city's series.
 *
 * One of the ten modules under `src/lib/view/`, paired with
 * `scripts/verify_view_country.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

import {
  SALARY_LADDER_CUTS,
  bgMarginalRatePct,
  bgNetSalary,
  bgTaxWedge,
  buildLadder,
  composeLadder,
  flooredCuts,
  homeYears,
  payrollParams,
} from "../mirror.js";
import { SECTOR_TOTAL_KEY } from "./payroll.js";
import { cityRow, regionQuarter } from "./region.js";

/**
 * The COUNTRY's average gross wage: НСИ's all-activities «Общо» row, selected
 * out of `sector_salary.json` the same way `regionQuarter` selects an област's.
 *
 * WHY THIS EXISTS BESIDE `regionQuarter`
 *
 * Two figures on the page answer two different questions and only one of them
 * is about where the reader lives. The wage comparator asks "what does the
 * average person in YOUR област take home", and takes an област. The percentile
 * ladder asks "where does this pay sit among everyone earning one", and the
 * only earnings DISPERSION anybody publishes for Bulgaria is national — so the
 * level it is re-levelled onto has to be national too, or the two halves of one
 * multiplication describe two different populations.
 *
 * `mirror.js#composeLadder` divides this by `shape.ses_mean`, which is
 * Eurostat's mean over the whole country. НСИ's «Общо» is the mean over the
 * whole country. That is the like-for-like pair, and any one област in this
 * position asserts that its own dispersion matches the national one — which
 * nothing measures (`docs/data-sources.md` §"Salary distribution").
 *
 * **The all-activities row is not a sector**, which is why `sectorOptions`
 * drops it from the picker and `sectorComparison` refuses it by name. It is the
 * one place in the app that row is what is wanted, and it is wanted precisely
 * because it is not one activity.
 *
 * Selected, never computed, for the reason `regionQuarter` carries: НСИ's
 * §2.1.1 forbids distributing производни произведения, so the level on screen
 * has to be a cell they printed (docs/legal.md §НСИ).
 *
 * @param {{ref_period?: string, is_preliminary?: boolean,
 *          sectors?: Array<{en_name?: string, value_eur?: number,
 *          series_by_period?: Record<string, number>}>} | null | undefined} payload
 * @returns {{value: number, refPeriod: string, isPreliminary: boolean}} zeroed
 *          when the row or the payload is not there
 */
export function nationalQuarter(payload) {
  const empty = { value: 0, refPeriod: "", isPreliminary: false };
  const rows = Array.isArray(payload?.sectors) ? payload.sectors : [];
  const row = rows.find((s) => s?.en_name === SECTOR_TOTAL_KEY);
  if (!row) return empty;

  const isPreliminary = Boolean(payload?.is_preliminary);
  const series = row.series_by_period ?? {};
  const quarters = Object.keys(series).filter(
    (k) => /^\d{4}-Q[1-4]$/.test(k) && typeof series[k] === "number"
  );

  if (typeof row.value_eur === "number" && /^\d{4}-Q[1-4]$/.test(payload?.ref_period ?? "")) {
    return { value: row.value_eur, refPeriod: payload.ref_period, isPreliminary };
  }
  if (!quarters.length) return empty;
  const refPeriod = quarters.sort()[quarters.length - 1];
  return { value: series[refPeriod], refPeriod, isPreliminary };
}

/**
 * The «Общо» row itself, for the surface that shows its quarterly cells.
 *
 * `/how/` prints НСИ's own series a year to a row, and it prints the country's
 * because the ladder above it is anchored on the country's. One selector, so
 * the table and the anchor cannot end up describing different rows.
 *
 * @param {{sectors?: Array<{en_name?: string}>} | null | undefined} payload
 * @returns {object|null}
 */
export function nationalRow(payload) {
  const rows = Array.isArray(payload?.sectors) ? payload.sectors : [];
  return rows.find((s) => s?.en_name === SECTOR_TOTAL_KEY) ?? null;
}

/**
 * The gross salaries the wedge table is evaluated at, EUR/month.
 *
 * Round numbers on either side of the insurance ceiling, chosen so the shape
 * of the curve is legible from four rows: flat below the cap, falling above
 * it. They are not defaults for anything a reader types (P7 is about those) —
 * nothing on `/how/` takes an input.
 */
export const WEDGE_LADDER_LEVELS = Object.freeze([1000, 2000, 3000, 5000]);

/**
 * What the tax wedge takes at a ladder of gross salaries — the SYSTEM's curve.
 *
 * `taxWedgePanel` above answers the same question about the person at the
 * keyboard, and a PERSONAL wedge rate is closed on any shareable surface
 * (docs/principles.md P2: below the ceiling the effective rate is a constant
 * and says nothing about the reader, and above it the rate falls with every
 * extra euro, so it names the salary). This function carries no personal
 * figure at all — published parameters evaluated at round numbers nobody typed
 * — which is the one version of it the closed list leaves open, in as many
 * words.
 *
 * **The ceiling is always a rung**, for the reason `mirror.js#bgTaxWedge`
 * forces it into its own sample: the curve's only kink is there, and a table
 * that steps over it describes a straight line.
 *
 * It takes the PUBLISHED payroll payload rather than a params object, under
 * the same constraint as `taxWedgePanel` and `payslipPanel` — a caller who
 * cannot hand over rates cannot hand over last year's.
 *
 * **The ДВ citation travels with the four figures it dates.** `source_url` is
 * the gazette's landing page and can be nothing else — their permalinks are
 * built from a session-side id the issue number does not yield — so under P9
 * the caption carries the instrument instead of reaching it, and «бр. 68 от
 * 28.07.2026» is what a reader searches ДВ's archive with. Both fields are
 * null together where the entry's parameters come from several acts, and the
 * caption falls back to the year the set is in force for.
 *
 * @param {object} args
 * @param {object|null} args.payroll  data.payroll (payroll.json), unmodified
 * @param {ReadonlyArray<number>} [args.grossLevels]  EUR/month
 * @returns {{effectiveYear:number|null, maxInsurable:number,
 *            contributionRatePct:number, incomeTaxRatePct:number,
 *            minWageGross:number, gazetteIssue:number|null,
 *            gazetteDate:string,
 *            rungs:Array<{gross:number, net:number, deductions:number,
 *                         effectivePct:number, marginalPct:number,
 *                         atCeiling:boolean, overCeiling:boolean}>}}
 */
export function systemWedgeLadder({ payroll, grossLevels = WEDGE_LADDER_LEVELS }) {
  const params = payrollParams(payroll);
  const levels = [...new Set([...grossLevels, params.maxInsurable])].sort((a, b) => a - b);
  return {
    effectiveYear: payroll?.effective_year ?? null,
    // Both or neither, decided here rather than in the template: the pipeline
    // refuses to publish half a citation, and a caption reading «бр. 68 от —»
    // is the one shape that would survive a payload edited by hand.
    gazetteIssue:
      Number.isInteger(payroll?.gazette_issue) && payroll.gazette_date
        ? payroll.gazette_issue
        : null,
    gazetteDate: (Number.isInteger(payroll?.gazette_issue) && payroll?.gazette_date) || "",
    maxInsurable: params.maxInsurable,
    contributionRatePct: 100 * params.totalEmployeeRate,
    incomeTaxRatePct: 100 * params.incomeTaxRate,
    minWageGross: params.minWageGross,
    rungs: levels.map((gross) => {
      const { net, effectiveRatePct } = bgNetSalary(gross, params);
      return {
        gross,
        net,
        deductions: gross - net,
        effectivePct: effectiveRatePct,
        marginalPct: bgMarginalRatePct(gross, params),
        atCeiling: gross === params.maxInsurable,
        overCeiling: gross > params.maxInsurable,
      };
    }),
  };
}

/**
 * The wedge curve with nobody standing on it.
 *
 * `systemWedgeLadder` above answers this section's question in figures a
 * reader can quote; this answers it in the one thing five rows cannot carry —
 * the SHAPE. The finding is that the share the state takes holds flat up to
 * the insurance ceiling and falls above it, and a reader made to hold five
 * effective rates in their head to see that is being asked to do the drawing.
 *
 * **It exists in order to have no `pay` parameter.**
 * `view/payroll.js#taxWedgePanel` computes the same curve and sits one letter
 * away in an import list, and what it adds is `earners` — one marker per
 * contract, at a gross recovered from what the reader typed. A PERSONAL
 * effective rate inverts to the salary above the ceiling and is closed on
 * every shareable surface (P2); the system's own curve is the version
 * `docs/principles.md`'s closed list leaves open by name. Reaching for the
 * panel here would put the reader onto the country page's picture, and no
 * assertion about the drawing could see it, because the two hand `WedgeChart`
 * the same prop. So they are told apart at the one place the difference is
 * expressible, which is the signature.
 *
 * `mirror.js#bgTaxWedge` is the sampler for both, so the country page and the
 * results card cannot arrive at differently shaped versions of one law — and
 * the ceiling is a sample point there, which is what stops a curve whose only
 * kink is stepped over from being drawn as a straight line.
 *
 * @param {object} args
 * @param {object|null} args.payroll  data.payroll (payroll.json), unmodified
 * @returns {{capGross:number, peakEffectivePct:number, marginalBelowPct:number,
 *            marginalAbovePct:number, capRisePerMonth:number|null,
 *            points:Array<{gross:number, effectivePct:number,
 *                          marginalPct:number}>}}
 */
export function wedgeCurve({ payroll }) {
  return bgTaxWedge({ params: payrollParams(payroll) });
}

/**
 * The earnings ladder as rows, with each rung saying whether it was surveyed.
 *
 * `mirror.js#composeLadder` re-levels Eurostat's SES dispersion onto НСИ's
 * latest national quarter and `buildLadder` converts each rung to net; this
 * pairs the two with the cut each belongs to, so a template never has to know
 * that index 5 is the median.
 *
 * **The anchor is the country's average, and it may not become an област's.**
 * The dispersion this re-levels is national — SES publish D1, the median and D9
 * for Bulgaria and nothing below that, at any vintage, from any publisher — so
 * a level from one област would multiply a national spread by a local mean and
 * call the result that област's ranking. Nothing on screen would reveal it: a
 * rescaled ladder is still a monotonic ladder, and every rung on it is still a
 * plausible Bulgarian wage. `docs/data-sources.md` §"Salary distribution" is
 * where the pair is argued.
 *
 * **`surveyed` is the honest half.** SES publishes three points for Bulgaria —
 * D1, the median and D9 — and every other rung between them is interpolated
 * piecewise-lognormal. Rendered in one voice, an interpolation reads as a
 * measurement, which is the defect `COPY.statMedianSubModelled` exists to
 * prevent on the strip's own band.
 *
 * **A rung the statutory floor replaced is neither, and it is one of the three
 * surveyed ones.** D1 re-levels under the minimum wage today, so what P10
 * publishes is the minimum wage; `mirror.js#flooredCuts` says which cuts that
 * happened to, and such a rung carries `atMinWage` and loses `surveyed`.
 * Leaving it surveyed credits Eurostat with a figure out of the ЗБДОО.
 *
 * The anchor's provenance comes from the НСИ payload and the shape's from the
 * Eurostat one, never the other way round: copying НСИ's url and period into a
 * Eurostat payload is what `no НСИ payload carries a second publisher's
 * figures` forbids, and reading them back out crosswise would undo it on the
 * page.
 *
 * @param {object} args
 * @param {object|null} args.salaryDist   data.salaryDist (salary_dist.json)
 * @param {object|null} args.sectorSalary data.sectorSalary (sector_salary.json),
 *                                        for its all-activities «Общо» row
 * @param {object|null} args.payroll      data.payroll (payroll.json)
 * @returns {{anchorGross:number, anchorPeriod:string, anchorUrl:string,
 *            shapeYear:string, shapeUrl:string,
 *            rungs:Array<{cut:number, gross:number, net:number,
 *                         surveyed:boolean, atMinWage:boolean}>}}
 */
export function payLadder({ salaryDist, sectorSalary, payroll }) {
  const params = payrollParams(payroll);
  const anchor = nationalQuarter(sectorSalary);
  const gross = composeLadder(salaryDist, anchor.value, params);
  const net = buildLadder(salaryDist, anchor.value, params);
  const floored = flooredCuts(salaryDist, anchor.value, params);
  return {
    anchorGross: anchor.value,
    anchorPeriod: anchor.refPeriod,
    anchorUrl: sectorSalary?.source_url ?? "",
    shapeYear: String(salaryDist?.shape?.ref_year ?? ""),
    shapeUrl: salaryDist?.shape?.source_url ?? "",
    rungs: SALARY_LADDER_CUTS.map((cut, i) => ({
      cut,
      gross: gross[`P${cut}`] ?? 0,
      net: net[i] ?? 0,
      surveyed: SES_SURVEYED_CUTS.includes(cut) && !floored.has(cut),
      atMinWage: floored.has(cut),
    })),
  };
}

/** The three cuts SES publishes for BG; every rung between them is modelled. */
const SES_SURVEYED_CUTS = Object.freeze([10, 50, 90]);

/**
 * What a median Sofia flat costs, priced against the Sofia average wage.
 *
 * The reader's own version of this is the home block on `/`; this is the
 * country's, so both ends are published figures and there is no argument
 * through which a typed salary could reach it. That is deliberate: a page with
 * no inputs must not grow one by accident, and the same sentence built from
 * `householdNet` would be a claim about somebody.
 *
 * The wage goes through `regionQuarter` — НСИ's own published quarter, selected
 * rather than derived (docs/legal.md §НСИ) — and then through `bgNetSalary`,
 * because `homeYears` is a statement about take-home and a gross would flatter
 * it by about a fifth.
 *
 * `m2` is passed rather than assumed: the size is an assumption the page has to
 * state next to the number, and a function that picked its own would let the
 * page print a price without saying what it is a price of.
 *
 * @param {object} args
 * @param {object|null} args.cityPrice   data.cityPrice (city_price.json)
 * @param {string} args.cityCode          which град the €/m² is read from
 * @param {object|null} args.regionSalary  data.regionSalary (region_salary.json)
 * @param {string} args.regionCode        which област the wage is read from
 * @param {object|null} args.payroll      data.payroll (payroll.json)
 * @param {number} args.m2                floor area the price is quoted for
 * @returns {{eurPerM2:number, eurPerM2Min:number, eurPerM2Max:number,
 *            m2:number, price:number, grossMonthly:number,
 *            netMonthly:number, wagePeriod:string, years:number,
 *            sourceUrl:string,
 *            nDistricts:number, sinceBaselinePct:number, baselineYear:number,
 *            trendPublishable:boolean}}
 */
export function cityHomeAtAverageWage({
  cityPrice,
  cityCode,
  regionSalary,
  regionCode,
  payroll,
  m2,
}) {
  const city = cityRow(cityPrice, cityCode);
  const eurPerM2 = city?.eur_per_m2_median ?? 0;
  // The cheapest and dearest district of THIS city. They are fields on the
  // city's row, and a caller reaching for them on the envelope gets undefined
  // — which `integer()` renders as an em dash, so the card draws «— – — €»
  // and looks like a payload that has not loaded rather than a read that
  // missed. That is the shape the country page shipped with.
  const eurPerM2Min = city?.eur_per_m2_min ?? 0;
  const eurPerM2Max = city?.eur_per_m2_max ?? 0;
  const anchor = regionQuarter(regionSalary, regionCode);
  const netMonthly = bgNetSalary(anchor.value, payrollParams(payroll)).net;
  const price = eurPerM2 > 0 && m2 > 0 ? eurPerM2 * m2 : 0;
  return {
    eurPerM2,
    eurPerM2Min,
    eurPerM2Max,
    m2,
    price,
    grossMonthly: anchor.value,
    netMonthly,
    wagePeriod: anchor.refPeriod,
    // **THIS city's page at имот.bg**, which is where the district rows the
    // median was taken across actually are.
    //
    // Read off the row rather than held as a constant beside the cards, and
    // for София the two are the same string today: имот.bg's bare
    // `/sredni-ceni` IS that city's page and `prodazhbi-sofiya` 302s to it
    // (`sources/imot.py`). So this changes no link a reader follows now, and
    // that is the case worth naming — a constant that happens to be right for
    // the one city a page shows is a copy of somebody else's routing, and it
    // goes wrong silently, at whichever of the two moves first: имот.bg
    // giving София a path of its own, or this page taking its reference city
    // from anywhere but a hard-coded София. Both leave a link that still
    // resolves, to a page that does not carry the number above it.
    sourceUrl: city?.source_url ?? "",
    // Zero, not `homeYears`' own `Infinity`. That sentinel is right for the
    // home block, which is drawn against a salary field a reader may have
    // emptied; here a missing end means a payload did not load, and every
    // other field in this object reports that as 0. One sentinel per object,
    // so a template gates on the figure rather than on which kind of nothing
    // it got.
    years: price > 0 && netMonthly > 0 ? homeYears(price, netMonthly) : 0,
    // Through `cityTrend`, so this page and the calculator cannot read
    // different ends of the same array — or, as they did, the same end of two
    // different cities'.
    ...cityTrend(cityPrice, cityCode),
  };
}

/**
 * One city's trend line — which year it is measured from, how far it has moved
 * since, and whether the run behind that is long enough to say so.
 *
 * **One selection, because the two ENDS of the array are a one-character
 * difference.** `.at(-1)` against `[0]` is the rise since the baseline against
 * the baseline level itself, and `docs/site.md` §"A correct formula fed the
 * wrong number" is why that decision may not live in a `$derived`. It is here
 * so the housing card on `/` and the country example on `/how/` cannot read
 * different ends of the same city's history — and so neither can read a
 * different CITY's, which is the failure it was extracted after: the
 * calculator took these two off the country page's reference city and printed
 * them on the reader's card, so every city but София showed София's baseline
 * year and София's +232% beside its own €/m², under its own name, with the
 * chart's end labels correctly its own.
 *
 * Both figures come off the city's own row rather than off the array beside
 * it, and `validate_city_price` holds the two equal, so a surface showing the
 * headline and a surface showing the series cannot disagree.
 *
 * @param {object|null} cityPrice  data.cityPrice (city_price.json)
 * @param {string} code
 * @returns {{sinceBaselinePct:number, baselineYear:number,
 *            trendPublishable:boolean, nDistricts:number}}
 */
export function cityTrend(cityPrice, code) {
  const city = cityRow(cityPrice, code);
  return {
    sinceBaselinePct: city?.since_baseline_median_pct ?? 0,
    baselineYear: city?.baseline_year ?? 0,
    // Whether the run behind that percentage is long enough to say «since
    // YEAR» in the voice of a trend. Decided in the pipeline, over the whole
    // series, rather than by each surface counting rows and reaching its own
    // conclusion — `sources/imot.py#MIN_TREND_YEARS` carries the threshold and
    // why «+4% от 2024» in that voice is the wrong claim rather than a small
    // one.
    trendPublishable: Boolean(city?.trend_publishable),
    nDistricts: city?.n_districts ?? 0,
  };
}

/**
 * A payload's `series_by_period` as an ordered list of cells.
 *
 * Selection and ordering, and deliberately nothing else. НСИ's payloads carry
 * these series, and their licence forbids distributing производни и сборни
 * произведения (docs/legal.md §НСИ, §2.1.1), so the quarterly series may be
 * shown cell by cell and may not be averaged, rebased or differenced on the
 * way to the screen — including the innocent-looking "and that is +X% since
 * 2020". There is no argument here that would let a caller ask for one.
 *
 * "YYYY-Qn" and "YYYY-MM" both sort lexicographically as chronologically for
 * any four-digit year, which is why one comparator serves every payload.
 *
 * @param {{series_by_period?: Record<string, number>}|null} payload
 * @returns {Array<{period: string, value: number}>} oldest first
 */
export function seriesCells(payload) {
  const series = payload?.series_by_period ?? {};
  return Object.keys(series)
    .filter((k) => typeof series[k] === "number")
    .sort()
    .map((period) => ({ period, value: series[period] }));
}

/** The four columns a quarterly grid has, in order. */
export const QUARTERS = Object.freeze(["Q1", "Q2", "Q3", "Q4"]);

/**
 * A quarterly series as one row per year, four cells wide.
 *
 * Layout, not arithmetic: the same cells `seriesCells` returns, placed in the
 * column their quarter names. A quarterly series long enough to be worth
 * showing is a column of twenty-five one-number rows, which is a scroll box or
 * a page nobody reaches the end of; seven rows of four is the whole of it at
 * once. **Nothing is combined on the way** — the НСИ licence forbids
 * distributing производни и сборни произведения (docs/legal.md §НСИ, §2.1.1),
 * so a year row is four published cells side by side and never their average,
 * however naturally a fifth column would sit there.
 *
 * A quarter with no cell is `null` rather than absent, so a year with a
 * publication still to come renders four columns with a gap in it instead of a
 * short row that reads as a different year's shape.
 *
 * @param {{series_by_period?: Record<string, number>}|null} payload
 * @returns {Array<{year: string, cells: Array<{period: string, value: number}|null>}>}
 *   oldest year first
 */
export function quarterGrid(payload) {
  const byYear = new Map();
  for (const cell of seriesCells(payload)) {
    const match = /^(\d{4})-(Q[1-4])$/.exec(cell.period);
    if (!match) continue;
    const [, year, quarter] = match;
    if (!byYear.has(year)) byYear.set(year, { year, cells: QUARTERS.map(() => null) });
    byYear.get(year).cells[QUARTERS.indexOf(quarter)] = cell;
  }
  // `seriesCells` sorts, and a Map keeps insertion order, so the years arrive
  // oldest first without a second comparator to keep in step with the first.
  return [...byYear.values()];
}
