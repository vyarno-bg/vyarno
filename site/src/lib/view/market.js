/**
 * Which published field feeds which figure on `/market/`.
 *
 * The arithmetic is in `mirror.js` and the words are in the component; what
 * lives here is the wiring, so that "the average deal is divided by НСИ's gross
 * wage" is a claim a test can hold rather than an expression inside a
 * `$derived` nothing can reach. What is left to get wrong is a figure read off
 * the wrong block, a card dated by the wrong publisher's clock, a table
 * captioned with a period none of its cells describes, or two index lines drawn
 * on one axis from two different bases — each of them a number that is correct
 * under a claim that is not.
 *
 * Every function takes payloads. None takes a scalar, and that is what keeps
 * the page inputless: there is no signature here a reader's own salary could be
 * threaded into, so `/market/` cannot quietly become a calculator.
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_market.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

import {
  bgNetSalary,
  completeYearTotals,
  dealInYearsOfPay,
  dealsAtQuarter,
  eurosFromMixedCurrency,
  homeYears,
  indexTimesBase,
  lessSharePct,
  payrollParams,
  rangePosition,
  sharePctByKey,
  shortfallPct,
  unoccupiedSharePct,
  yearEndGrowth,
  yearOnYearChanges,
} from "../mirror.js";
// The size the calculator itself defaults to, so the two pages quote one home.
// A second constant here would be a second answer to "how big", differing from
// the one a reader has already been shown, with nothing on either page saying so.
import { HOME } from "../content.js";
import { regionDisplayName, SOFIA_CITY_CODE } from "./region.js";

/**
 * A figure with everything the page has to print beside it.
 *
 * The shape exists because the requirement is uniform: under every digit, the
 * publisher, the period it describes, a link to the exact table, and — where
 * the number is ours — the arithmetic that produced it and the queries that
 * reproduce it. Returning them together means a caller cannot render the value
 * and forget the provenance, because it arrives in the same object.
 *
 * `method` and `derivedFrom` are null for a figure read verbatim. A renderer
 * shows the derivation note when they are present, so "is this ours?" is
 * answered by the data rather than by whoever wrote the template.
 *
 * @typedef {object} SourcedFigure
 * @property {number|null} value
 * @property {string|null} refPeriod   the period the figure DESCRIBES
 * @property {string|null} sourceUrl   the table a reader opens
 * @property {string|null} apiUrl      the query that returns it
 * @property {string|null} dataset
 * @property {string|null} method      how it was computed, when it is ours
 * @property {string[]|null} derivedFrom  the queries that reproduce it
 */

/**
 * Wrap a published block's figure with its provenance.
 *
 * @param {number|null|undefined} value
 * @param {object|null|undefined} block  the payload block the value came from
 * @param {{method?: string, derivedFrom?: string[], refPeriod?: string}} [extra]
 * @returns {SourcedFigure}
 */
function sourced(value, block, extra = {}) {
  return {
    value: Number.isFinite(value) ? value : null,
    refPeriod: extra.refPeriod ?? block?.ref_period ?? null,
    sourceUrl: block?.source_url ?? null,
    apiUrl: block?.api_url ?? null,
    dataset: block?.dataset ?? null,
    method: extra.method ?? null,
    derivedFrom: extra.derivedFrom ?? null,
  };
}

/**
 * How much changed hands, and how that compares with a year earlier.
 *
 * The quarter reported is the payload's own `ref_period` rather than the last
 * key in the series: the two are the same today and the payload is the one
 * that states which quarter it is describing. Reading the maximum key instead
 * would silently report a quarter the gates never looked at.
 *
 * @param {object|null} houseMarket
 * @returns {{period: string|null, deals: SourcedFigure, newBuild: number|null,
 *            existing: number|null, changePct: SourcedFigure}}
 */
export function marketVolume(houseMarket) {
  const block = houseMarket?.deals ?? null;
  const period = houseMarket?.ref_period ?? null;
  const series = block?.series_by_period ?? {};
  const { count, changePct: yoy } = dealsAtQuarter(series, period ?? "");
  const at = series?.[period ?? ""] ?? {};
  return {
    period,
    deals: sourced(count, block, { refPeriod: period }),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
    // Per purchase type as well as in total, because new builds and existing
    // dwellings move differently in volume and the split is why the payload
    // carries them apart. One year-on-year figure for the total leaves the
    // table's other two rows to be read as though they had not moved.
    changeNewPct: dealsAtQuarter(series, period ?? "", "new").changePct,
    changeExistingPct: dealsAtQuarter(series, period ?? "", "existing").changePct,
    changePct: sourced(yoy, block, {
      refPeriod: period,
      method:
        "This quarter's dwelling count against the same quarter one year " +
        "earlier, both as published. Year-on-year rather than against last " +
        "quarter, because transactions have a seasonal shape and a " +
        "quarter-on-quarter fall would partly measure the calendar.",
      derivedFrom: block?.api_url ? [block.api_url] : null,
    }),
  };
}

/**
 * What a dwelling changed hands for on average, and what it is made of.
 *
 * The value and the count travel with it deliberately. This is the page's
 * signature figure and the one a sceptic reaches for first, so the two numbers
 * it is built from are rendered beside it rather than left in the payload.
 *
 * @param {object|null} houseMarket
 * @returns {{period: string|null, avg: SourcedFigure, newBuild: number|null,
 *            existing: number|null, totalValue: number|null, deals: number|null}}
 */
export function marketAverageDeal(houseMarket) {
  const block = houseMarket?.avg_deal_eur ?? null;
  const period = houseMarket?.ref_period ?? null;
  const at = block?.series_by_period?.[period ?? ""] ?? {};
  return {
    period,
    avg: sourced(at.total, houseMarket?.value ?? null, {
      refPeriod: period,
      method: block?.method ?? null,
      derivedFrom: block?.derived_from_api_urls ?? null,
    }),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
    // Both sides of every row's division, per purchase type. The page prints
    // them beside the quotient and asks the reader to check it, and a row whose
    // numerator and denominator are not on the page is a row they cannot.
    totalValue: houseMarket?.value?.series_by_period?.[period ?? ""]?.total ?? null,
    newValue: houseMarket?.value?.series_by_period?.[period ?? ""]?.new ?? null,
    existingValue: houseMarket?.value?.series_by_period?.[period ?? ""]?.existing ?? null,
    deals: houseMarket?.deals?.series_by_period?.[period ?? ""]?.total ?? null,
    newDeals: houseMarket?.deals?.series_by_period?.[period ?? ""]?.new ?? null,
    existingDeals: houseMarket?.deals?.series_by_period?.[period ?? ""]?.existing ?? null,
  };
}

/**
 * Eurostat's own annual rate of change on the house price index.
 *
 * **Read, never computed.** The index level is in the same payload and the
 * temptation is to divide two of its members — but НСИ rebased the series and
 * warn that a rate recomputed across the two bases can differ in the last
 * decimal from the one both publishers print. The rate we show is the rate
 * they publish, which is also the figure the cross-publisher gate reconciles.
 *
 * @param {object|null} houseMarket
 * @returns {{period: string|null, total: SourcedFigure, newBuild: number|null,
 *            existing: number|null}}
 */
export function marketPriceRate(houseMarket) {
  const block = houseMarket?.price_index ?? null;
  const period = block?.rate_ref_period ?? null;
  const at = block?.annual_rate_pct?.[period ?? ""] ?? {};
  return {
    period,
    total: sourced(at.total, block, { refPeriod: period }),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
  };
}

/**
 * Who owns, who owes, and how much of the stock stood empty.
 *
 * The unoccupied share is derived here from the two published counts; both
 * counts come back with it so the division is checkable on the page.
 *
 * @param {object|null} structure
 * @returns {object}
 */
export function marketStructure(structure) {
  const tenure = structure?.tenure ?? null;
  const census = structure?.census_dwellings ?? null;
  return {
    owner: sourced(tenure?.owner_pct, tenure),
    ownerWithMortgage: sourced(tenure?.owner_with_mortgage_pct, tenure),
    // The whole split rather than the three figures a card row happened to
    // want. Every one of these is a share of the POPULATION on the same base,
    // so owners and renters add to the published total — which is what makes
    // them a table a reader can add up rather than three unrelated percentages.
    // The two rows a four-row table left out, and they are the ones that make
    // the other four add up. Owners without a loan are the overwhelming
    // majority of the country and the page leans on that in two places; a
    // reader had to subtract to find the figure. Reduced-rent and rent-free is
    // the other side of the same identity — with both here every published
    // share is on the page and the column visibly sums to the published total,
    // which is the check a reader can make without leaving it.
    ownerNoMortgage: sourced(tenure?.owner_no_mortgage_pct, tenure),
    renter: sourced(tenure?.rent_pct, tenure),
    renterAtMarketPrice: sourced(tenure?.rent_market_price_pct, tenure),
    renterReducedOrFree: sourced(tenure?.rent_reduced_or_free_pct, tenure),
    dwellings: sourced(census?.total, census),
    occupied: sourced(census?.occupied, census),
    unoccupied: sourced(census?.unoccupied, census),
    unoccupiedPct: sourced(unoccupiedSharePct(census), census, {
      method:
        "Dwellings recorded as unoccupied at the census, over all conventional " +
        "dwellings recorded at the same census. Both counts are published " +
        "beside this figure. 'Unoccupied' is a usual-residence test rather " +
        "than a presence one: the dwelling was nobody's usual residence at the " +
        "census, so second homes, holiday properties and dwellings whose " +
        "occupants were counted elsewhere are all inside it.",
      derivedFrom: census?.api_url ? [census.api_url] : null,
    }),
    // The overburden share is NOT here, and its absence is the wiring saying
    // where it belongs. It is read as a series (`marketOverburdenSeries`),
    // which carries its own newest reading and its own period — so a page
    // drawing the chart and quoting the latest figure takes both from one call
    // and cannot caption a chart with a period the number beside it does not
    // share.
  };
}

/**
 * The average deal expressed in years of the national gross wage.
 *
 * **The one cross-publisher figure on the page.** Eurostat's transaction value
 * over НСИ's published average wage, joined here because neither published
 * file may carry the other's number — the rule that keeps both of them
 * redistributable (`docs/legal.md` §НСИ).
 *
 * It reads the all-activities row rather than any sector, and gross rather than
 * net: the sector rows answer a different question, and a net figure would
 * depend on the payroll table of whichever year converted it, which is a third
 * publisher's law inside a two-publisher ratio.
 *
 * **Both periods come back, because the figure describes both.** Eurostat
 * disseminate the transaction cubes about a week behind НСИ publishing the wage
 * table, so the two quarters agree most of the time and part for the days
 * between two releases. Dated by one of them the card names the period of half
 * its own arithmetic, and the half it names is the one a reader is least likely
 * to check.
 *
 * @param {object|null} houseMarket
 * @param {object|null} sectorSalary
 * @returns {SourcedFigure & {monthlyGrossEur: number|null, dealPeriod: string|null,
 *                            wagePeriod: string|null, wageUrl: string|null}}
 */
export function marketDealInYearsOfPay(houseMarket, sectorSalary) {
  const period = houseMarket?.ref_period ?? null;
  const deal = houseMarket?.avg_deal_eur?.series_by_period?.[period ?? ""]?.total ?? null;
  const all = (sectorSalary?.sectors ?? []).find((s) => s?.en_name === "Total") ?? null;
  const wage = all?.value_eur ?? null;
  return {
    ...sourced(dealInYearsOfPay(deal, wage), houseMarket?.value ?? null, {
      refPeriod: period,
      method:
        "Eurostat's average dwelling transaction divided by twelve times " +
        "НСИ's published average GROSS monthly wage across all activities. " +
        "Two publishers, joined in your browser: neither published file " +
        "carries the other's figure. Gross rather than net, because a net " +
        "wage depends on the payroll table of the year it was worked out in.",
      derivedFrom: houseMarket?.avg_deal_eur?.derived_from_api_urls ?? null,
    }),
    monthlyGrossEur: wage,
    dealPeriod: period,
    wagePeriod: sectorSalary?.ref_period ?? null,
    wageUrl: sectorSalary?.source_url ?? null,
  };
}

/**
 * The six cities, price movement beside sales movement.
 *
 * **Change against change, and never a level against a level.** Every НСИ city
 * series is an index or a percentage, and their own лв./кв.м survey ran to
 * 2014-Q2 and was discontinued, so no transaction price per square metre exists
 * for any Bulgarian city from any publisher. The имот.bg figures the calculator
 * shows are ASKING prices from listings — a different measurement, and putting
 * the two in one column would invent a comparison neither publisher supports.
 *
 * The two blocks are joined on the city code rather than zipped by position:
 * they come from two workbooks with two different coverage windows, and НСИ
 * publish the sales series over a shorter one.
 *
 * **Each column is dated by its own workbook and each cell by its own city, and
 * the table has no single period to be captioned with.** Three periods can
 * disagree here: HPI_2.6 and HSI_2.4.5 are separate files on НСИ's portal and
 * either can be republished first, and `build_nsi_housing_payload` dates every
 * city row by the newest quarter THAT city carries rather than by the block's,
 * so a city missing from the newest release keeps the quarter it has. The
 * payload's own `ref_period` is a fourth thing again — it belongs to the
 * national block, which this table does not draw. A caption naming one quarter
 * for all of it would put figures from two periods under a heading claiming
 * one, which is the failure that needs no wrong number to mislead.
 *
 * @param {object|null} nsiHousing
 * @returns {{pricePeriod: string|null, dealsPeriod: string|null,
 *            priceUrl: string|null, dealsUrl: string|null,
 *            cities: Array<object>}}
 */
export function marketCities(nsiHousing) {
  const price = nsiHousing?.city_price_index_yoy ?? null;
  const deals = nsiHousing?.city_deals_yoy ?? null;
  const dealsBy = new Map((deals?.cities ?? []).map((c) => [c.code, c]));
  const cities = (price?.cities ?? []).map((c) => {
    const d = dealsBy.get(c.code) ?? null;
    return {
      code: c.code,
      nameBg: c.name_bg,
      nameEn: c.name_en,
      pricePct: c.value_pct ?? null,
      pricePeriod: c.ref_period ?? null,
      dealsPct: d?.value_pct ?? null,
      dealsPeriod: d?.ref_period ?? null,
      // **Whether this city's two figures may be drawn as one reading.** The
      // table can print them in two columns whatever their quarters are,
      // because each column carries its own and a cell behind its column says
      // so. A picture cannot: two marks on one track assert they describe the
      // same quarter, and the two workbooks are released separately — so a city
      // НСИ has updated in one file and not the other would have its spring
      // prices drawn against its winter sales, with every digit still correct
      // and nothing on the row to say the pair is not a pair.
      comparable: Boolean(c.ref_period) && Boolean(d?.ref_period) && c.ref_period === d.ref_period,
      // Each city's own history, which the payload has carried all along: НСИ
      // publish forty-five quarters per city and the table showed the newest
      // one. Русе falling while Бургас rises is the sentence the table can
      // make; whether Русе has been falling for a year or for six is the one it
      // cannot, and that is the difference between a number and a finding.
      priceSeries: plotSeries(c.series_by_period, { reference: 0 }),
      dealsSeries: plotSeries(d?.series_by_period, { reference: 0 }),
    };
  });
  return {
    pricePeriod: price?.ref_period ?? null,
    dealsPeriod: deals?.ref_period ?? null,
    priceUrl: price?.source_url ?? null,
    dealsUrl: deals?.source_url ?? null,
    // ONE scale per column, across all six cities. Six sparklines each drawn to
    // its own range are six pictures of the same shape: Русе's fall and Бургас'
    // rise would occupy the same box, and a reader comparing rows — which is
    // the only reason to put six charts in a column — would be comparing
    // nothing. The shared bounds go through the same clamp, so zero is on every
    // one of them.
    priceScale: sharedScale(cities.map((c) => c.priceSeries)),
    dealsScale: sharedScale(cities.map((c) => c.dealsSeries)),
    // **One scale for this quarter's two changes, across all six cities.** Both
    // are percentage changes on the same quarter a year earlier, which is what
    // makes them drawable on one track at all — and drawn per row against each
    // row's own extremes, six cities would each fill their track and the column
    // would say nothing, which is the same failure `priceScale` exists to
    // prevent for the sparklines.
    //
    // Zero is inside it by the same clamp every scale on this page goes
    // through: the whole reading here is which side of zero each mark is on.
    changeScale: {
      min: Math.min(0, ...cities.flatMap((c) => [c.pricePct, c.dealsPct].filter(Number.isFinite))),
      max: Math.max(0, ...cities.flatMap((c) => [c.pricePct, c.dealsPct].filter(Number.isFinite))),
    },
    cities,
  };
}

/**
 * One scale covering several series, so charts drawn side by side compare.
 *
 * Runs through the same clamp `plotSeries` applies: zero is inside every scale
 * on this page, including a shared one.
 *
 * @param {Array<{min: number, max: number}>} series
 */
function sharedScale(series) {
  return {
    min: Math.min(0, ...series.map((s) => s.min)),
    max: Math.max(0, ...series.map((s) => s.max)),
  };
}

/**
 * НСИ's national house price index change — the same statistic Eurostat
 * disseminate, published here by the body that compiles it.
 *
 * Both are on the page deliberately. They agree to the decimal, and a reader
 * who checks one against the other finds that out — which is worth more than
 * either figure alone on a page arguing that its numbers are checkable.
 *
 * @param {object|null} nsiHousing
 * @returns {SourcedFigure & {newBuild: number|null, existing: number|null}}
 */
export function marketNsiNationalRate(nsiHousing) {
  const block = nsiHousing?.national_price_index_yoy ?? null;
  const at = block?.value_pct ?? {};
  return {
    ...sourced(at.total, block),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
  };
}

/**
 * A published `{period: value}` map, shaped for the plot and for the table that
 * has to sit under it.
 *
 * One core for every series on `/market/`, because they differ only in where
 * the numbers come from and every one of them needs the same six things: the
 * ordered points, the extent to build an axis from, the peak and the trough and
 * the latest reading for the text alternative, and the reference the figure is
 * defined against where it has one.
 *
 * **`min` is clamped at or below zero and there is no way to raise it.** That
 * is the whole honesty contract of this file rather than a default: a y-axis
 * cropped to a property series' own range turns any of them into a cliff, and
 * the way to keep that off this page is to leave no caller a floor to set. A
 * signed series — Eurostat's annual rate ran from +34.6% to −26.8% — needs its
 * negative half, so the clamp is `min(0, smallest)` rather than a constant 0:
 * the drawn scale always CONTAINS zero, which is the property that matters, and
 * `verify_view_market.mjs` asserts it over every series function here.
 *
 * @param {Record<string, number>|null|undefined} entries
 * @param {{reference?: number|null}} [opts]  a level the figure is defined
 *   against — 100 for an index, 0 for a rate — included in the extent, because
 *   a plot whose own reference line is off the top has drawn everything except
 *   the thing it is about
 * @returns {{points: Array<{period: string, value: number}>, min: number,
 *            max: number, peak: object|null, trough: object|null,
 *            first: object|null, latest: object|null, from: string|null,
 *            to: string|null, reference: number|null}}
 */
export function plotSeries(entries, { reference = null } = {}) {
  const points = Object.keys(entries ?? {})
    .sort()
    .map((period) => ({ period, value: entries[period] }))
    .filter((p) => Number.isFinite(p.value));
  const values = points.map((p) => p.value);
  const bounds = Number.isFinite(reference) ? [...values, reference] : values;
  return {
    points,
    min: Math.min(0, ...bounds),
    max: Math.max(0, ...bounds),
    peak: points.reduce((best, p) => (best && best.value >= p.value ? best : p), null),
    trough: points.reduce((worst, p) => (worst && worst.value <= p.value ? worst : p), null),
    first: points[0] ?? null,
    latest: points[points.length - 1] ?? null,
    from: points[0]?.period ?? null,
    to: points[points.length - 1]?.period ?? null,
    reference: Number.isFinite(reference) ? reference : null,
  };
}

/**
 * A series with the provenance the caption under it has to print.
 *
 * The data and its publisher come back in one object for the reason `sourced`
 * exists: a chart is a figure, it carries the same obligation as a number, and
 * a renderer that has to fetch its source separately is one that can draw the
 * chart and forget the line.
 *
 * @param {Record<string, number>|null|undefined} entries
 * @param {object|null|undefined} block  the payload block the entries came from
 * @param {{reference?: number|null, unit?: string|null}} [opts]
 */
function sourcedSeries(entries, block, opts = {}) {
  return {
    ...plotSeries(entries, opts),
    sourceUrl: block?.source_url ?? null,
    apiUrl: block?.api_url ?? null,
    dataset: block?.dataset ?? null,
    unit: opts.unit ?? block?.unit ?? null,
  };
}

/**
 * A euro series in millions of euro, which is the unit both lenders publish in.
 *
 * Eurostat's value cube is `unit: "eur"` and carries whole euro, ten digits to
 * the quarter, while `credit.json` and `mortgage.json` are both in millions of
 * them. A ratio taken across that seam is out by a factor of a million and
 * lands as a share of 0.0%, which reads as a payload that failed to fetch
 * rather than as a units error and would sit on the page unquestioned.
 */
const inMillions = (entries) =>
  Object.fromEntries(Object.entries(entries ?? {}).map(([key, value]) => [key, value / 1e6]));

/** One field lifted out of a `{period: {total, new, existing}}` map. */
function field(series, name) {
  return Object.fromEntries(
    Object.entries(series ?? {})
      .map(([period, row]) => [period, row?.[name]])
      .filter(([, value]) => Number.isFinite(value))
  );
}

/**
 * The quarterly transaction count as a series, for drawing.
 *
 * The page's lead finding is a change in VOLUME over time and it was one number
 * and a percentage — the shape that number sits in is the argument, and thirty-
 * seven quarters of it are already in the payload. What comes back is the data;
 * the geometry is the component's, the way `systemWedgeLadder` feeds the tax
 * wedge.
 *
 * @param {object|null} houseMarket
 */
export function marketVolumeSeries(houseMarket) {
  const block = houseMarket?.deals ?? null;
  return sourcedSeries(field(block?.series_by_period, "total"), block);
}

/**
 * The count as a year-on-year change, every quarter that has one.
 *
 * The headline figure beside the count answers "against a year earlier" for one
 * quarter. This is the same arithmetic over the whole record, and it is what
 * lets a reader tell an ordinary quarter from an unusual one — a single −18%
 * places nothing until the other thirty-two changes are beside it.
 *
 * **It is ours, so it carries what reproduces it.** The count is Eurostat's and
 * the division is not, which is the same disclosure `avg_deal_eur` travels
 * with.
 *
 * @param {object|null} houseMarket
 */
export function marketVolumeChangeSeries(houseMarket) {
  const block = houseMarket?.deals ?? null;
  return {
    ...sourcedSeries(yearOnYearChanges(field(block?.series_by_period, "total")), block, {
      reference: 0,
      unit: "percent_change_on_same_quarter_a_year_earlier",
    }),
    derivedFrom: block?.api_url ? [block.api_url] : null,
  };
}

/**
 * The two series a reader has to hold at once, on one row of quarters.
 *
 * How much changed hands and what it changed hands for are the page's first two
 * sections, and what everybody actually argues about is what the two are doing
 * AT THE SAME TIME — which the page could only say by asking a reader to carry
 * one chart to another. Both are already here: the count's own year-on-year
 * change and Eurostat's published annual rate, both percentages, both quarterly.
 *
 * **The window is the INTERSECTION, and that is what makes this wiring rather
 * than two calls in a template.** Eurostat publish the rate from long before
 * they publish the transaction counts, so the two records are of different
 * lengths — and two panels drawn one above the other on different windows put
 * a quarter above a quarter eleven years away from it. The picture would be
 * wrong in the way nothing catches: every digit published, every axis honest,
 * and the one thing the arrangement claims — that these columns and that line
 * describe the same quarters — false. Restricted here, the wrong pairing is not
 * expressible by a caller.
 *
 * **Neither series is captioned as the cause of the other, and nothing here
 * computes a relationship between them.** They are returned apart, on one
 * window, each with its own publisher and its own scale.
 *
 * @param {object|null} houseMarket
 * @returns {{volume: object, price: object}}
 */
export function marketVolumeAgainstPrices(houseMarket) {
  const deals = houseMarket?.deals ?? null;
  const index = houseMarket?.price_index ?? null;
  const volumeAll = yearOnYearChanges(field(deals?.series_by_period, "total"));
  const priceAll = field(index?.annual_rate_pct, "total");
  const shared = Object.keys(volumeAll)
    .filter((period) => Number.isFinite(priceAll[period]))
    .sort();
  const only = (entries) => Object.fromEntries(shared.map((period) => [period, entries[period]]));
  return {
    volume: {
      ...sourcedSeries(only(volumeAll), deals, { reference: 0 }),
      derivedFrom: deals?.api_url ? [deals.api_url] : null,
    },
    price: sourcedSeries(only(priceAll), index, { reference: 0 }),
  };
}

/**
 * **Twenty-one years of the official house price index**, as НСИ compile it and
 * Eurostat disseminate it.
 *
 * Eighty-five quarters were in the payload and the page rendered one number out
 * of that block. What the series carries and the number cannot: the index
 * doubled to 2008, gave back more than a third of it by 2012, and has tripled
 * since — so a reader asking "can this fall" has the publisher's own answer
 * instead of ours. **That is the reason it is here and also the reason the page
 * may not caption it**: showing a bust and today's level on one line is a fact;
 * saying what the pair means is a position.
 *
 * The reference is 100, which is the 2015 base the index is defined against and
 * not a judgement about 2015. **Nominal**, and the page has to say so — nothing
 * published here deflates a quarterly series back to 2005, because the HICP
 * index on this site is annual and starts at 2020.
 *
 * @param {object|null} houseMarket
 * @param {"total"|"new"|"existing"} [purchase]
 */
export function marketPriceIndexSeries(houseMarket, purchase = "total") {
  const block = houseMarket?.price_index ?? null;
  return {
    ...sourcedSeries(field(block?.series_by_period, purchase), block, {
      reference: 100,
      unit: block?.unit ?? null,
    }),
    // Eurostat's own letters on their own points, for the quarters they flagged.
    flags: flagsFor(block?.status_by_period, purchase),
    // **The base year travels with the series, and it is never written down.**
    // Every sentence that makes the index readable names it — «×1 = колкото
    // през 2015 г.» — and Eurostat rebase: `I25_Q` is the same measurement
    // putting today at 109 instead of 273. A year typed into the copy stays
    // right for one rebasing and is then a claim contradicted by every digit
    // beside it, silently, because nothing recomputes prose.
    baseYear: block?.base_year ?? null,
  };
}

/**
 * The SAME index deflated, on the same base and the same quarters.
 *
 * **The one line without which the nominal one can mislead.** Nominally the
 * index sits far above its 2008 peak; deflated it sits below it, and a site
 * whose subject is the gap between a number and what it buys cannot draw
 * twenty-one years of property prices in current prices with the other line
 * unavailable — that is the correction it exists to make, applied to everything
 * except this.
 *
 * `tipsho30` has no purchase dimension: Eurostat deflate the total only, so
 * there is no split to be had and nothing here may imply one.
 *
 * @param {object|null} houseMarket
 */
export function marketPriceIndexRealSeries(houseMarket) {
  const block = houseMarket?.price_index_real ?? null;
  return {
    ...sourcedSeries(block?.series_by_period, block, {
      reference: 100,
      unit: block?.unit ?? null,
    }),
    flags: flagsFor(block?.status_by_period, null),
    baseYear: block?.base_year ?? null,
  };
}

/**
 * Which way a multiple of the base year points, as a state rather than a word.
 *
 * **An index below its base is not «по-скъпи», and this series goes there.**
 * The nominal record opens at ×0,76 and the deflated one sat at ×0,97 as
 * recently as 2013-Q1, so a caption with «по-скъпи» fixed between its slots
 * describes the wrong half of its own chart — the reading is a figure, and so
 * is its direction.
 *
 * The dead band is the PRINTED precision, not a taste: the pages draw a
 * multiple at one decimal, so anything inside ±0,05 renders as ×1,0 and a
 * verdict there narrates a difference the digits beside it do not show. Same
 * refusal as `pocketVerdictState`'s ±1 pp, sized to what this surface prints.
 *
 * @param {number|null|undefined} times  a reading over its base, from `indexTimesBase`
 * @returns {'dearer'|'cheaper'|'level'|'unsaid'}
 */
export function indexVerdictState(times) {
  if (!Number.isFinite(times) || times <= 0) return "unsaid";
  if (times >= 1.05) return "dearer";
  if (times <= 0.95) return "cheaper";
  return "level";
}

/**
 * The index said out loud: how many times the base year, and where the deflated
 * line sits against its own highest reading.
 *
 * **The level was the least readable thing on the page and the data was never
 * the problem.** «Индекс на цените на жилищата, 272,63, при 100 за 2015 г.»
 * asks a reader to hold three conventions at once — that an index has no unit,
 * that its anchor is a year somebody chose, and that 272,63 is a ratio written
 * as if it were a quantity. «×2,7 спрямо 2015 г.» asks nothing and says the
 * same thing, from the same cell.
 *
 * The second half is the reading this page can make that nobody else in
 * Bulgaria makes with sources attached: nominally the index is at its own
 * highest, and deflated it is below where it stood before the 2008 fall. Both
 * come out of the two series' own extremes, so **no year and no level is named
 * anywhere but by the data** — `realPeakPeriod` is read off the deflated series
 * rather than typed, and `shortfallPct` returns null where the latest reading
 * IS the peak, which is the case that would otherwise print «0,0% под него»
 * beside two identical numbers.
 *
 * @param {object|null} houseMarket
 */
export function marketIndexReading(houseMarket) {
  const nominal = marketPriceIndexSeries(houseMarket);
  const real = marketPriceIndexRealSeries(houseMarket);
  return {
    period: nominal.to,
    baseYear: nominal.baseYear,
    times: indexTimesBase(nominal.latest?.value, nominal.reference),
    realTimes: indexTimesBase(real.latest?.value, real.reference),
    nominalPeakPeriod: nominal.peak?.period ?? null,
    realPeakPeriod: real.peak?.period ?? null,
    realBelowPeakPct: shortfallPct(real.latest?.value, real.peak?.value),
    sourceUrl: nominal.sourceUrl,
    apiUrl: nominal.apiUrl,
    realSourceUrl: real.sourceUrl,
    realApiUrl: real.apiUrl,
  };
}

/**
 * The publisher's flags at the periods they apply to, keyed by period.
 *
 * Sparse in, sparse out. A quarter Eurostat did not flag has no entry, so the
 * presence of one MEANS something rather than being a default a renderer has to
 * filter — and a chart marking every quarter marks nothing.
 *
 * @param {Record<string, string|Record<string,string>>|null|undefined} status
 * @param {string|null} purchase  the field, or null where the cube has no split
 */
function flagsFor(status, purchase) {
  return Object.fromEntries(
    Object.entries(status ?? {})
      .map(([period, value]) => [
        period,
        typeof value === "string" ? value : (value?.[purchase ?? ""] ?? null),
      ])
      .filter(([, letter]) => Boolean(letter))
  );
}

/**
 * What Eurostat's flag letters mean, as a key a page can print.
 *
 * `b` break in series, `e` estimated, `p` provisional, `d` definition differs.
 * A letter carries no meaning to a reader on its own, so a chart that marks a
 * point has to be able to say what the mark is — and a marker nobody can look
 * up is worse than none.
 */
export const STATUS_LETTERS = Object.freeze(["b", "e", "p", "d"]);

/**
 * Which flags a series actually carries, in a stable order.
 *
 * Read off the data rather than listed in the template, so a page that prints a
 * key prints the entries it needs and no others — a legend naming a marker that
 * is nowhere on the chart is a question a reader cannot answer.
 *
 * @param {Array<Record<string, string>>} flagMaps
 * @returns {string[]}
 */
export function statusLettersUsed(flagMaps) {
  const seen = new Set();
  for (const map of flagMaps) {
    for (const letter of Object.values(map ?? {})) {
      for (const ch of String(letter)) seen.add(ch);
    }
  }
  return STATUS_LETTERS.filter((letter) => seen.has(letter));
}

/**
 * Eurostat's own published annual rate, every quarter they have published one.
 *
 * **Read, never derived** — the same rule the headline figure follows, and here
 * it matters more: eighty-one quarters recomputed across НСИ's rebasing would
 * differ from the published series in the last decimal at an unknown number of
 * points, and the page's claim is that a reader can check it.
 *
 * Reference zero, so the axis spans the sign change rather than starting at the
 * lowest bar. The series runs +34.6% to −26.8% and a plot that cropped either
 * end would be describing a different market.
 *
 * @param {object|null} houseMarket
 * @param {"total"|"new"|"existing"} [purchase]
 */
export function marketPriceRateSeries(houseMarket, purchase = "total") {
  const block = houseMarket?.price_index ?? null;
  return sourcedSeries(field(block?.annual_rate_pct, purchase), block, { reference: 0 });
}

/**
 * What a dwelling changed hands for, quarter by quarter, split by purchase type.
 *
 * **Split rather than total, and that is what makes it drawable.** The average
 * deal is a mean over whatever was sold that quarter, so a total line moves with
 * the mix of new builds and existing dwellings as well as with prices — and a
 * line chart invites exactly the reading that mix will not support. Within one
 * purchase type the mix is far narrower, and the two lines drawn apart show the
 * gap between them, which is the thing the mix caveat is about.
 *
 * @param {object|null} houseMarket
 * @param {"total"|"new"|"existing"} [purchase]
 */
export function marketAverageDealSeries(houseMarket, purchase = "existing") {
  const block = houseMarket?.avg_deal_eur ?? null;
  return {
    // Attributed to the VALUE cube, which is where the euro figure comes from
    // and the only block of the three carrying a page to link. `avg_deal_eur`
    // is ours and has no `source_url` of its own by design — a derived block
    // that cited a publisher's page would be attributing our division to them.
    ...sourcedSeries(field(block?.series_by_period, purchase), houseMarket?.value ?? null),
    // The disclosure travels with the drawing: this is the one series on the
    // page that is ours rather than a publisher's.
    derivedFrom: block?.derived_from_api_urls ?? null,
  };
}

/**
 * The month ЕЦБ's lending volumes stop being leva.
 *
 * `new_business.monthly_volume` is published «in the currency of the period»
 * and Bulgaria adopted the euro on 2026-01-01, so one national market reads
 * 1 389 in December and 447 in January. The payload states that in prose
 * (`currency_history`) and nowhere a program can read, so the month is named in
 * the layer whose suite can hold it rather than inside the arithmetic.
 */
const LENDING_EURO_FROM = "2026-01";

/**
 * How much of what households paid for homes came from a bank loan — counted
 * two ways, neither of them captioned as the true one.
 *
 * **Nobody publishes this and every half of it is published** (P11): Eurostat
 * carry what households paid for dwellings, БНБ the housing loan book and ЕЦБ
 * the monthly new business. The division happens in the reader's own tab
 * because no file here may hold a second publisher's number (`docs/legal.md`).
 *
 * `net` is БНБ's book at one December against the December before it, so
 * everything repaid is already out of it; it reaches back to the first year
 * Eurostat's value cube covers whole and goes below zero in a year the book
 * shrank. `gross` is every euro ЕЦБ record as lent on a new home loan, less the
 * part they mark as a household repricing one it already had; it starts where
 * that split series starts. The two bracket the answer, which is why both are
 * drawn and neither is drawn alone.
 *
 * **`axis`, `offset` and `span` are what let them share one x-axis.** The two
 * records are of different lengths, and a shorter line placed at its own
 * indices is stretched across the whole box with every reading under a year it
 * does not describe — the failure `marketVolumeAgainstPrices` avoids by cutting
 * both series to one window, which here would throw away the reach-back that is
 * the longer line's whole point. So the window is the union and each line
 * carries where it starts inside it.
 *
 * **Whole calendar years only.** Three quarters of spending under twelve months
 * of lending is a share wrong by the missing quarter, with every digit published
 * and nothing on the picture to say the two windows differ.
 *
 * @param {object|null} houseMarket
 * @param {object|null} credit
 * @param {object|null} mortgage
 * @param {object|null} payroll  read for `bgn_per_eur` and nothing else
 */
export function marketBorrowedShare(houseMarket, credit, mortgage, payroll) {
  const value = houseMarket?.value ?? null;
  const paid = inMillions(completeYearTotals(field(value?.series_by_period, "total"), 4));

  const book = credit?.outstanding ?? null;
  const net = sharePctByKey(yearEndGrowth(book?.volume_by_period?.housing), paid);

  const volume = mortgage?.new_business?.monthly_volume ?? null;
  const split = mortgage?.new_business_split ?? null;
  // The conversion returns null without a rate, so a payload that failed to
  // fetch takes the second line off the chart rather than drawing its pre-euro
  // half 1.96 times too high.
  const lent = completeYearTotals(
    lessSharePct(
      eurosFromMixedCurrency(volume?.series_by_period, {
        bgnPerEur: payroll?.bgn_per_eur,
        euroFrom: LENDING_EURO_FROM,
      }),
      split?.renegotiated_share_by_period
    ),
    12
  );
  const gross = sharePctByKey(lent, paid);

  const axis = [...new Set([...Object.keys(net), ...Object.keys(gross)])].sort();
  const placed = (entries, opts) => {
    const series = sourcedSeries(entries, value, opts);
    return { ...series, span: axis.length, offset: axis.indexOf(series.from ?? "") };
  };

  return {
    axis,
    // Attributed to the VALUE cube, which is the denominator of both lines and
    // the only block among the four carrying a page a reader can browse. Each
    // lender's own file is cited beside it rather than folded in: the claim is
    // that three publishers were joined here and not by any of them.
    net: placed(net, {
      // Zero is a reading on this line: below it, the banks' book shrank over
      // the year, which is a different statement from lending a little.
      reference: 0,
      unit: "percent_of_value_paid",
    }),
    gross: placed(gross, { unit: "percent_of_value_paid" }),
    // ONE disclosure for one chart, so the queries travel together. Split per
    // line it would be two `p.ours` blocks three paragraphs apart, each
    // discharging half of a licence condition on one picture.
    derivedFrom: [value?.api_url, book?.source_url, volume?.source_url, split?.source_url].filter(
      Boolean
    ),
    lenderUrls: { net: book?.source_url ?? null, gross: volume?.source_url ?? null },
    // The changeover the copy names, so the sentence disclosing the conversion
    // takes the month from the same constant the arithmetic did.
    convertedBefore: LENDING_EURO_FROM,
  };
}

/**
 * The share of people whose housing costs pass 40% of their household income,
 * every year EU-SILC has published one.
 *
 * Twenty annual points, of which the page showed the newest. The series is not
 * a trend — 21.2% in 2007, 5.9% in 2010, 20.7% in 2016, 6.9% in 2025 — and a
 * single reading of a figure that has swung by fifteen points twice tells a
 * reader almost nothing about it.
 *
 * @param {object|null} structure
 */
export function marketOverburdenSeries(structure) {
  const block = structure?.housing_cost_overburden ?? null;
  return {
    ...sourcedSeries(block?.series_by_period, block),
    // The newest reading and the year it belongs to, so a sentence naming the
    // figure takes it from the same place the chart does. Read off the block
    // rather than off the last point: the payload states which year it is
    // describing, and the last key in a series is a different fact that
    // happens to agree.
    value: Number.isFinite(block?.value_pct) ? block.value_pct : null,
    refPeriod: block?.ref_period ?? null,
  };
}

/**
 * What renting costs against a year earlier — the calculator's own line, read
 * here rather than fetched again.
 *
 * **The `source_url` is the payload's and the `api_url` is the row's**, and
 * that pairing is the whole reason this is wiring rather than a lookup in the
 * template. `hicp_categories.json` carries one publisher page for the whole
 * cube and a query per row, so a caption built from the row alone has no
 * databrowser link to offer and sends a reader to raw JSON as its FIRST
 * destination — on the page whose argument is that a sceptic can follow the
 * link and check.
 *
 * CP041 is actual rents paid for housing, not imputed rent and not the whole of
 * CP04, which sweeps in water, electricity and gas. A section asking what
 * housing costs against incomes would read very differently on CP04.
 *
 * **It is every actual rent, not only a tenant's own home.** Eurostat's label
 * for the code is «Actual rental payments made for housing», and it splits one
 * level down into CP0411 (a tenant's main residence) and CP0412 (other actual
 * rentals — a second home, a garage). We publish level 2 and not level 3, so
 * the split is not in the payload and the copy beside this figure says «наемите»
 * rather than naming a tenant's own rent. Narrowing that sentence would claim
 * CP0411 while showing CP041.
 *
 * @param {object|null} hicpCategories
 */
export function marketRent(hicpCategories) {
  const row =
    (hicpCategories?.categories ?? [])
      .flatMap((c) => c.groups ?? [])
      .find((g) => g?.cp_code === "CP041") ?? null;
  if (!row) return null;
  return {
    ...sourced(row.annual_rate_pct, null, { refPeriod: row.ref_period ?? null }),
    sourceUrl: hicpCategories?.source_url ?? null,
    apiUrl: row.api_url ?? null,
  };
}

/**
 * The fewest points a series needs before the page will place a reading in it.
 *
 * Five, which is the gate every chart on `/market/` already draws behind. A
 * range over two readings is not a range — it is the pair of them, and a marker
 * halfway along it says "mid-range" about a series with no middle.
 */
export const RANGE_MIN_POINTS = 5;

/**
 * Which series the strip places, in the order it draws them, and where each
 * one's working is on the page.
 *
 * `times` divides by the series' own reference, so an index arrives at the
 * strip in the multiples the rest of the page reads it in rather than as a
 * level nobody has a feel for. `signedPct` and `pct` are already in their
 * units — a change carries its sign, a share does not.
 */
const RANGE_ROWS = Object.freeze(
  [
    // **The count is placed by its year-on-year change and never by its level,
    // because a level of this series carries the calendar in it.** Transactions
    // have a season: the record's highest readings are all fourth quarters, so
    // a first-quarter count sits in the bottom quarter of that record whatever
    // the market is doing — 16 227 dwellings placed at 26% of a track running
    // 11 669 to 29 130, against 55% of the range the first quarters alone
    // occupy. A dot near the left-hand end reads as news, and the news it
    // reports is the month of the year. The change against the same quarter a
    // year earlier has the season divided out of it by construction, which is
    // the same repair the tint on §volume's chart makes for the picture.
    //
    // Signed, for the reason the price rate is: every reading of it is a
    // direction, and «18,5%» without its sign is two different quarters.
    { key: "dealsChange", format: "signedPct", href: "#volume" },
    { key: "index", format: "times", href: "#prices" },
    { key: "indexReal", format: "times", href: "#prices" },
    // Signed, because every reading of it is a direction: the series runs
    // +34.6% to -26.8% and «6,9%» without its sign is two different quarters.
    { key: "rate", format: "signedPct", href: "#prices" },
    // Unsigned, because it is a share of the population and not a change. The
    // signed formatter would print «+6,9%» and invent a movement.
    { key: "overburden", format: "pct", href: "#ratio" },
    // **§borrowed's two shares are NOT here, and the reason is the rule above
    // rather than room.** Each is one publisher's lending over another's
    // turnover, so a row would place a reading of ours inside a record of ours
    // on a strip whose whole claim is that every line is one publisher's one
    // series. The two charts carry their own extremes.
  ].map(Object.freeze)
);

/**
 * **Where today's reading sits inside each published series' own range.**
 *
 * The page answers four questions at the top and then spends every section
 * below on the working, and a reader who wants the whole picture at once has to
 * read all of it. This is that picture: one line per series, each saying how
 * far along its own record the newest reading is — and nothing else.
 *
 * **IT POSITIONS AND IT DOES NOT SCORE.** There is no weighting, no total, and
 * no composite, and that is a constraint rather than an omission. Prices,
 * volume, rates and cost burden point in different directions on purpose;
 * combining them into one figure would decide on the reader's behalf which of
 * them is the bad news, using credibility that belongs to Eurostat, and would
 * produce the single number on this site nobody could check against anything
 * (docs/principles.md P6). Every row here is one publisher's one series, and a
 * reader can open the numbers table under its own chart and find the same three
 * readings.
 *
 * **The extremes are the SERIES' own, never the drawn scale's.** `plotSeries`
 * clamps its `min` at or below zero so a chart cannot crop its axis, which is
 * the right rule for a plot and the wrong one here: placed against a floor of
 * zero, every one of these sits in the top fifth and the strip says the same
 * thing six times. `peak` and `trough` are the highest and lowest readings the
 * publisher has actually printed, which is what "inside its own range" means.
 *
 * **A series whose VALUE does not read on its own does not get a row**, whatever
 * else recommends it. Every figure in a row here stands alone — «×2,7»,
 * «+14,8%», «6,9%» — so the position beside it adds a second fact. An index
 * defined against a reference the row has nowhere to print reads as a verdict
 * instead: a dot at one end of a labelled line, with the level it is measured
 * from nowhere on it.
 *
 * **A row that cannot be placed is absent rather than empty.** A series with
 * fewer than `RANGE_MIN_POINTS` readings, a payload that failed to fetch, a
 * flat series whose peak and trough are the same figure — each returns no row,
 * the way the deflated-peak sentence renders nothing rather than «0,0% под
 * него». An empty cell on a strip of positions reads as a position.
 *
 * @param {object|null} houseMarket
 * @param {object|null} structure
 * @returns {{rows: Array<object>, sources: Array<object>}}
 */
export function marketRangeStrip(houseMarket, structure) {
  const nominal = marketPriceIndexSeries(houseMarket);
  const real = marketPriceIndexRealSeries(houseMarket);
  const series = {
    deals: marketVolumeSeries(houseMarket),
    dealsChange: marketVolumeChangeSeries(houseMarket),
    index: nominal,
    indexReal: real,
    rate: marketPriceRateSeries(houseMarket),
    overburden: marketOverburdenSeries(structure),
  };

  const rows = [];
  for (const row of RANGE_ROWS) {
    const s = series[row.key];
    if (!s || s.points.length < RANGE_MIN_POINTS) continue;
    const at = rangePosition(s.latest?.value, s.trough?.value, s.peak?.value);
    if (at === null) continue;
    // In the units the page shows, so the low, the latest and the high on one
    // line are the three figures a reader could read off the chart below.
    const shown = (v) => (row.format === "times" ? indexTimesBase(v, s.reference) : v);
    rows.push({
      key: row.key,
      format: row.format,
      href: row.href,
      at,
      value: shown(s.latest?.value),
      low: shown(s.trough?.value),
      high: shown(s.peak?.value),
      latestPeriod: s.latest?.period ?? null,
      lowPeriod: s.trough?.period ?? null,
      highPeriod: s.peak?.period ?? null,
      from: s.from,
      to: s.to,
      sourceUrl: s.sourceUrl,
      apiUrl: s.apiUrl,
    });
  }

  return { rows };
}

/**
 * How many years of the local average pay one home costs, in every city with
 * both halves published.
 *
 * **THE JOIN HAPPENS HERE AND MAY NEVER HAPPEN IN A PAYLOAD.** имот.bg's median
 * is ours over their district averages; the wage is НСИ's cell, unmodified.
 * НСИ's licence §2.1.1 forbids distributing производни и сборни произведения,
 * so no file this repository publishes may carry a figure computed over their
 * cells — the division exists in the reader's tab and nowhere else, exactly as
 * `view/payroll.js#regionGap` does it (docs/legal.md §НСИ). Moving this into
 * the pipeline to simplify the wiring would breach the licence.
 *
 * **The wage is SELECTED at one quarter, never averaged over the year.** НСИ
 * publish quarters; a year's mean is a figure they did not print, and the newest
 * year has two quarters in it rather than four — so a mean would compare half a
 * year against a whole one, on a series that rises through the year, and the
 * bias would run in the direction of the finding. The anchor is the quarter the
 * payload's own `ref_period` names, read at that same quarter in every earlier
 * year, so both ends of a comparison describe the same season.
 *
 * **NET, at the payroll table this build ships.** The reader's own years-to-buy
 * in `HomeRow` divides by take-home, and two figures called the same thing on
 * one site may not be a third apart. The conversion is `bgNetSalary`, the same
 * one the calculator runs on the reader's own pay, and the section says whose
 * table it is: below the insurance ceiling it is one factor applied to every
 * city and every year, so it moves the level and no comparison here.
 *
 * **A city missing either half is NAMED, not dropped.** имот.bg serve no page
 * for Софийска област and their archive reaches back further for some cities
 * than others, so НСИ's области outnumber the rows. A reader who knows their
 * own place is absent and cannot find out that it is absent has been told the
 * table is the country. Why имот.bg carry no price is not recorded, because the
 * page does not say: the two absences differ in what имот.bg publish today and
 * not in what this table could be built from.
 *
 * @param {object|null} cityPrice     data.cityPrice (city_price.json)
 * @param {object|null} regionSalary  data.regionSalary (region_salary.json)
 * @param {object|null} payroll       data.payroll (payroll.json)
 * @returns {{rows: Array<object>, omitted: Array<object>, quarter: string|null,
 *            baseYear: number|null, latestYear: number|null, years: number[],
 *            refPeriod: string|null, m2: number, worse: number,
 *            medianChangePct: number|null, aboveCapital: Array<object>,
 *            capital: object|null,
 *            priceUrl: string|null, wageUrl: string|null,
 *            wageUrlBg: string|null}}
 */
export function marketCityAffordability(cityPrice, regionSalary, payroll) {
  const empty = {
    rows: [],
    omitted: [],
    quarter: null,
    baseYear: null,
    latestYear: null,
    years: [],
    refPeriod: null,
    m2: HOME.m2Default,
    worse: 0,
    medianChangePct: null,
    aboveCapital: [],
    priceUrl: null,
    wageUrl: null,
    wageUrlBg: null,
  };

  const refPeriod = String(regionSalary?.ref_period ?? "");
  const match = /^(\d{4})-(Q[1-4])$/.exec(refPeriod);
  if (!match) return empty;
  const [, refYearText, quarter] = match;
  const refYear = Number(refYearText);

  const regions = Array.isArray(regionSalary?.regions) ? regionSalary.regions : [];
  const cities = Array.isArray(cityPrice?.cities) ? cityPrice.cities : [];
  if (!regions.length || !cities.length) return empty;

  /**
   * **THE WINDOW IS THE OVERLAP, AND NEITHER PUBLISHER SETS IT ALONE.**
   *
   * The two release on their own clocks: НСИ publish a quarter of the new year
   * around the middle of it, имот.bg's archive gains its row whenever they
   * recompute. Ended at НСИ's own year, the first release of a January nobody
   * had scraped yet failed EVERY city's newest-year check at once and the whole
   * section stopped rendering — 25 cities gone, no error, no empty state,
   * because a table of nothing is what "no city has both halves" produces.
   *
   * So the window is the years both sides carry: the anchor quarter present for
   * every област, and a price published for at least one град. Whichever
   * publisher is ahead, the table shows the newest year that can actually be
   * computed, and it moves on its own when the other one catches up.
   */
  const wageYears = new Set(
    regions.length
      ? Object.keys(regions[0]?.series_by_period ?? {})
          .filter((key) => key.endsWith(`-${quarter}`))
          .map((key) => Number(key.slice(0, 4)))
          .filter((year) =>
            regions.every((region) =>
              Number.isFinite(region?.series_by_period?.[`${year}-${quarter}`])
            )
          )
      : []
  );
  const priceYears = new Set(
    cities.flatMap((city) =>
      (Array.isArray(city?.historical) ? city.historical : [])
        .filter((entry) => Number.isFinite(entry?.eur_per_m2_median))
        .map((entry) => entry.year)
    )
  );
  const shared = [...wageYears].filter((year) => priceYears.has(year) && year <= refYear).sort();
  if (shared.length < 2) return empty;
  const baseYear = shared[0];
  const latestYear = shared[shared.length - 1];

  const years = [];
  for (let year = baseYear; year <= latestYear; year += 1) years.push(year);
  const params = payrollParams(payroll);
  const priceBy = new Map(cities.map((city) => [city?.code, city]));
  const m2 = HOME.m2Default;

  const rows = [];
  const omitted = [];
  for (const region of regions) {
    const code = region?.code ?? "";
    const city = priceBy.get(code) ?? null;
    // Through the picker's own renamer, so «София(столица)» reaches this table
    // as «София» and Софийска област is not the row above it wearing the same
    // word. One implementation with the control a reader picked their област in.
    const names = {
      code,
      bgName: regionDisplayName(region?.bg_name, "bg"),
      enName: regionDisplayName(region?.en_name, "en"),
    };
    if (!city) {
      omitted.push({ ...names });
      continue;
    }

    const priceBySeries = new Map(
      (Array.isArray(city.historical) ? city.historical : [])
        .filter((entry) => Number.isFinite(entry?.eur_per_m2_median))
        .map((entry) => [entry.year, entry])
    );
    const points = [];
    for (const year of years) {
      const entry = priceBySeries.get(year);
      const gross = region?.series_by_period?.[`${year}-${quarter}`];
      if (!entry || !Number.isFinite(gross) || gross <= 0) continue;
      const net = bgNetSalary(gross, params).net;
      const value = homeYears(entry.eur_per_m2_median * m2, net);
      if (!Number.isFinite(value)) continue;
      points.push({
        year,
        value,
        gross,
        net,
        eurPerM2: entry.eur_per_m2_median,
      });
    }

    // Both ends or no row. A city имот.bg's archive reaches back three years for
    // is a real reading and an unreal comparison: printed in a column headed
    // with the base year it would report a change over a window it does not
    // cover, and the digits either side of it would be right.
    const first = points[0] ?? null;
    const last = points[points.length - 1] ?? null;
    if (!first || !last || first.year !== baseYear || last.year !== latestYear) {
      omitted.push({ ...names });
      continue;
    }

    rows.push({
      ...names,
      points,
      base: first,
      latest: last,
      changePct: ((last.value - first.value) / first.value) * 100,
    });
  }

  // Most years first, which is the order the finding is in: the capital is not
  // at the top of it. Ties by код, so the order is stable across builds.
  rows.sort((a, b) => b.latest.value - a.latest.value || a.code.localeCompare(b.code));

  const capital = rows.find((row) => row.code === SOFIA_CITY_CODE) ?? null;

  return {
    rows,
    omitted,
    quarter,
    baseYear,
    latestYear,
    years,
    refPeriod,
    m2,
    worse: rows.filter((row) => row.changePct > 0).length,
    medianChangePct: median(rows.map((row) => row.changePct)),
    aboveCapital: capital
      ? rows.filter((row) => row.code !== capital.code && row.latest.value >= capital.latest.value)
      : [],
    capital,
    priceUrl: cityPrice?.source_url ?? null,
    wageUrl: regionSalary?.source_url ?? null,
    wageUrlBg: regionSalary?.source_url_bg ?? null,
  };
}

/**
 * The middle of a list, or null where there is nothing to take a middle of.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
