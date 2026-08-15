/**
 * What a job costs, and how much of that cost never reaches the person doing it.
 *
 * The arithmetic is `mirror.js`'s. What lives here is what those formulas get
 * fed, and this subject's whole hazard is the DENOMINATOR — docs/math.md §"The
 * labour tax wedge, and the denominator that is the whole point". So nothing
 * here returns a bare percentage: every figure travels with the range it was
 * computed over and the flag saying whether that range collapsed, because a
 * sector is a range of ТЗПБ rates far more often than it is a rate.
 *
 * One of the modules under `src/lib/view/`, paired with
 * `scripts/verify_view_employer.mjs`.
 */

import { bgGrossFromNet, bgLabourCost, bgLabourWedge, payrollParams } from "../mirror.js";

/**
 * The ТЗПБ range for a chosen НСИ section, or the whole statutory span.
 *
 * **The fallback is the ACT's span, never the floor.** A reader who has picked
 * no sector, or one the join does not carry, is a reader whose rate is unknown
 * — and «0,4%» is a specific claim about them that happens to be the cheapest
 * one. The span says what is actually known.
 *
 * ЗБДОО sets ТЗПБ by КИД-2025 division and НСИ publish wages by NACE Rev. 2
 * section, so the join is `payroll.py#NSI_SECTION_DIVISIONS`'s problem and it
 * publishes a range per section. What this must not do is narrow one.
 *
 * @param {object|null} payroll  data.payroll (payroll.json), unmodified
 * @param {string} sectorKey  НСИ's English section name, or "" for none
 * @returns {{min:number, max:number, known:boolean}} fractions, not percent
 */
export function sectorWorkAccident(payroll, sectorKey) {
  const span = payrollParams(payroll).workAccident;
  const row = payroll?.work_accident?.by_nsi_section?.[sectorKey];
  const lo = row?.min;
  const hi = row?.max;
  if (!sectorKey || !Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
    return { min: span.min, max: span.max, known: false };
  }
  return { min: lo, max: hi, known: true };
}

/**
 * Everything the «колко струвам на работодателя» disclosure shows, from one call.
 *
 * **It takes the published payload, not a params object**, under the same rule
 * as `payroll.js#taxWedgePanel`: a caller who cannot hand over rates cannot
 * hand over last year's. Taking the payload rather than a pre-resolved ТЗПБ
 * range also stops a caller passing one rate for a sector that spans several.
 *
 * **Per earner, and there is no argument through which a household total could
 * be passed.** The insurance ceiling is a property of one contract on the
 * employer's side exactly as on the employee's, so two people on €2,000 cost
 * full contributions on every euro while one on €4,000 does not; adding the
 * nets and inverting once understates the household's labour cost by hundreds
 * of euro a month (`mirror.js#bgHouseholdPayroll` has the worked example).
 *
 * **Each earner carries both ends of the range**, equal where the sector is
 * unambiguous, so the template renders one figure or two off `ambiguous` rather
 * than off comparing floats.
 *
 * @param {object} args
 * @param {object|null} args.payroll  data.payroll
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} args.pay
 * @param {string} [args.sectorKey]  НСИ's English section name
 * @returns {{workAccident:{min:number, max:number, known:boolean},
 *            ambiguous:boolean, capGross:number, employerRatePct:number,
 *            earners:Array<object>, householdLabourCost:number,
 *            householdNet:number, householdWedgePct:number}}
 */
export function employerCostPanel({ payroll, pay, sectorKey = "" }) {
  const params = payrollParams(payroll);
  const band = sectorWorkAccident(payroll, sectorKey);

  const earners = [];
  (pay?.amounts ?? []).forEach((n, index) => {
    const amount = Number(n);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // In gross mode the reader typed the contract amount the employer's
    // contributions are charged on, so there is nothing to recover.
    const gross = pay?.basis === "gross" ? amount : bgGrossFromNet(amount, params);
    const low = bgLabourCost(gross, params, band.min);
    const high = bgLabourCost(gross, params, band.max);
    earners.push({
      index,
      ordinal: index + 1,
      gross,
      net: low.net,
      // The employer's own lines, at both ends of the sector's range. `net` and
      // the employee's deductions do not move with ТЗПБ, so they are stated
      // once — a second copy would be a second thing to keep true.
      employeeDeductions: low.employeeDeductions,
      employerSocial: low.employerSocial,
      accidentLow: low.employerAccident,
      accidentHigh: high.employerAccident,
      labourCostLow: low.labourCost,
      labourCostHigh: high.labourCost,
      wedgePctLow: low.wedgePct,
      wedgePctHigh: high.wedgePct,
      // Where this contract's wedge tops out on the chart's own y-axis — the
      // same quantity as `wedgePctLow`, named for the axis rather than for the
      // sentence. Carried rather than subtracted in the component, because a
      // marker drawn off the band it belongs to reads as the chart disagreeing
      // with the text beside it.
      wedgeSharePct: low.employerSharePct + low.employeeSharePct,
      overCap: gross >= params.maxInsurable,
    });
  });

  // Household totals are summed from the per-earner figures rather than
  // recomputed from a combined gross, so this and the payslip beside it cannot
  // disagree about either number, and the per-contract ceiling is applied once
  // per contract.
  const sum = (key) => earners.reduce((s, e) => s + e[key], 0);
  const householdLabourCost = sum("labourCostLow");
  const householdNet = sum("net");

  return {
    // The curve and the panel come from ONE call, the way `taxWedgePanel`
    // returns the wedge spread beside its earners: a chart drawn from a second
    // `bgLabourWedge` call would be a second place the ТЗПБ range is chosen,
    // and the one that drifts is the picture rather than the sentence.
    ...bgLabourWedge({ params, workAccident: band }),
    workAccident: band,
    ambiguous: band.max > band.min,
    capGross: params.maxInsurable,
    employerRatePct: 100 * params.totalEmployerRate,
    earners,
    householdLabourCost,
    householdNet,
    // Total cost minus total take-home, over total cost — NOT the mean of the
    // per-earner rates, which is off by whole points the moment one earner
    // clears the ceiling and the other does not.
    householdWedgePct:
      householdLabourCost > 0
        ? (100 * (householdLabourCost - householdNet)) / householdLabourCost
        : 0,
  };
}

/**
 * The labour-cost curve with nobody standing on it — the SYSTEM's partition.
 *
 * `/how/` takes no reader input at all, so this carries no personal figure:
 * published parameters evaluated across a salary range nobody typed — the same
 * ground `country.js#systemWedgeLadder` stands on, and the reason a personal
 * wedge rate stays off any shareable surface (P2) while this does not have to.
 *
 * **It uses the statutory span rather than a sector**, a page with no input
 * having none to use. The chart's own label names which end it is drawn at, so
 * «drawn at 0,4%» is a stated choice about the picture rather than a claim
 * about anybody's employer.
 *
 * @param {object} args
 * @param {object|null} args.payroll  data.payroll
 * @returns {ReturnType<typeof bgLabourWedge> & {employerRatePct:number,
 *            employeeRatePct:number, incomeTaxRatePct:number,
 *            appendix:string, sourceUrl:string, gazetteIssue:number|null,
 *            gazetteDate:string}}
 */
export function systemLabourWedge({ payroll }) {
  const params = payrollParams(payroll);
  const wa = payroll?.work_accident || {};
  return {
    ...bgLabourWedge({ params, workAccident: params.workAccident }),
    employerRatePct: 100 * params.totalEmployerRate,
    employeeRatePct: 100 * params.totalEmployeeRate,
    incomeTaxRatePct: 100 * params.incomeTaxRate,
    // P3: these are the only figures on the site fetched from an act rather
    // than transcribed, so the appendix that sets them is named and its ДВ
    // permalink travels with it. Both empty rather than half-present, for the
    // reason `country.js` states about the gazette pair.
    appendix: (wa.source_url && String(wa.appendix || "")) || "",
    sourceUrl: (wa.appendix && String(wa.source_url || "")) || "",
    gazetteIssue: Number.isInteger(wa.gazette_issue) && wa.gazette_date ? wa.gazette_issue : null,
    gazetteDate: (Number.isInteger(wa.gazette_issue) && wa.gazette_date) || "",
  };
}
