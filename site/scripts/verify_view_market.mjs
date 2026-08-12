#!/usr/bin/env node
/**
 * Which published field feeds which figure on `/market/`.
 *
 * The page has no input on it, so nothing a reader does can reach any of this
 * and none of the calculator's suites calls it. What is left to get wrong is
 * the wiring itself: a figure read off the wrong block, a card dated by the
 * wrong publisher's clock, a table captioned with a period none of its cells
 * describes, two index lines drawn on one axis from two different bases. Each
 * renders a number that is correct and a claim that is not. The charts add one
 * rule of their own — every series is scaled from zero, because a y-axis
 * cropped to a property series' own range turns any of them into a cliff.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  marketVolume,
  marketAverageDeal,
  marketPriceRate,
  marketStructure,
  marketDealInYearsOfPay,
  marketCities,
  marketNsiNationalRate,
  plotSeries,
  marketVolumeSeries,
  marketPriceIndexSeries,
  marketPriceIndexRealSeries,
  marketIndexReading,
  marketRent,
  marketPriceRateSeries,
  marketAverageDealSeries,
  marketOverburdenSeries,
  marketPriceToIncomeSeries,
  marketRangeStrip,
  RANGE_MIN_POINTS,
  statusLettersUsed,
} from "../src/lib/view/market.js";
import { published } from "./published-payload.mjs";
import { near } from "./near.mjs";

const read = published;

// ---------------------------------------------------------------------------
// `/market/` — which published field feeds which figure
// ---------------------------------------------------------------------------
//
// The page has no input on it, so nothing a reader does can reach these and
// nothing in the calculator's suites calls them. What is left to get wrong is
// the wiring itself: a figure read off the wrong block, a card dated by the
// wrong publisher's clock, a table captioned with a period none of its cells
// describes. Each of those renders a number that is correct and a claim that
// is not, which is the failure this layer exists to make testable.

/** The three Eurostat property cubes, shaped as `house_market.json` carries them. */
const HOUSE_MARKET = Object.freeze({
  ref_period: "2026-Q1",
  deals: {
    dataset: "prc_hpi_hsnq",
    source_url: "https://example.invalid/hsnq",
    api_url: "https://example.invalid/api/hsnq",
    series_by_period: {
      "2025-Q1": { total: 15000, new: 4800, existing: 10200 },
      "2025-Q4": { total: 20000, new: 6400, existing: 13600 },
      "2026-Q1": { total: 16227, new: 5181, existing: 11046 },
    },
  },
  value: {
    dataset: "prc_hpi_hsvq",
    source_url: "https://example.invalid/hsvq",
    api_url: "https://example.invalid/api/hsvq",
    series_by_period: {
      "2026-Q1": { total: 1343368578, new: 565446130, existing: 777922448 },
    },
  },
  price_index: {
    dataset: "prc_hpi_q",
    source_url: "https://example.invalid/hpi",
    api_url: "https://example.invalid/api/hpi",
    // The rate's own reference quarter, which is NOT the payload's: Eurostat
    // publish the index a quarter further than the transaction cubes reach.
    rate_ref_period: "2026-Q2",
    annual_rate_pct: {
      "2026-Q1": { total: 14.8, new: 12.5, existing: 16.3 },
      "2026-Q2": { total: 13.1, new: 11.0, existing: 14.4 },
    },
    series_by_period: { "2026-Q1": { total: 272.63 } },
  },
  avg_deal_eur: {
    derived_from_api_urls: ["https://example.invalid/api/hsvq", "https://example.invalid/api/hsnq"],
    method: "value ÷ count",
    series_by_period: {
      "2026-Q1": { total: 82786.01, new: 109138.42, existing: 70425.72 },
    },
  },
});

test("marketVolume reports the quarter the payload names, not the last key it holds", () => {
  // `ref_period` is the quarter the gates ran against. Reading `max(keys)`
  // instead would report whichever quarter a cube happened to reach — a real
  // Eurostat figure for a period nothing validated, which is the shape of every
  // silent-wrong-number failure on this page.
  const v = marketVolume(HOUSE_MARKET);
  assert.equal(v.period, "2026-Q1");
  assert.equal(v.deals.value, 16227);
  assert.equal(v.newBuild, 5181);
  assert.equal(v.existing, 11046);
  // Against 2025-Q1 the count is UP; against the quarter before it, down. A
  // wiring that reached for the neighbouring key would come back negative.
  assert.ok(v.changePct.value > 0, `year-on-year should be a rise, got ${v.changePct.value}`);
  assert.equal(v.changePct.value, ((16227 - 15000) / 15000) * 100);
  // The provenance travels with the figure or the page cannot print it.
  assert.equal(v.deals.sourceUrl, "https://example.invalid/hsnq");
  assert.deepEqual(v.changePct.derivedFrom, ["https://example.invalid/api/hsnq"]);
  assert.ok(v.changePct.method, "the year-on-year change is ours and says nothing about itself");
  // And a figure read verbatim discloses nothing, so the page cannot label
  // Eurostat's own count as our arithmetic.
  assert.equal(v.deals.method, null);
  assert.equal(v.deals.derivedFrom, null);

  const empty = marketVolume(null);
  assert.equal(empty.deals.value, null);
  assert.equal(empty.changePct.value, null);
});

test("marketAverageDeal carries the two figures its division is checkable from", () => {
  const d = marketAverageDeal(HOUSE_MARKET);
  assert.equal(d.avg.value, 82786.01);
  // Both sides of the division, at the SAME quarter as the quotient. The page
  // prints all three and invites the reader to do it themselves, so a numerator
  // from one quarter and a denominator from another is a page that fails its
  // own check while every individual figure stays a published one.
  assert.equal(d.totalValue, 1343368578);
  assert.equal(d.deals, 16227);
  assert.ok(Math.abs(d.avg.value - d.totalValue / d.deals) < 0.01);
  // Attributed to the VALUE cube, which is where the euro figure comes from,
  // and disclosed with both queries — one of them reproduces nothing.
  assert.equal(d.avg.sourceUrl, "https://example.invalid/hsvq");
  assert.equal(d.avg.derivedFrom.length, 2);
  assert.equal(d.newBuild, 109138.42);
  assert.equal(d.existing, 70425.72);
});

test("marketPriceRate is dated by the index's own quarter, never the payload's", () => {
  // The index cube runs a quarter ahead of the transaction cubes, so the rate's
  // reference period is its own. Dated from `ref_period` the card would print
  // Eurostat's 2026-Q2 rate under a 2026-Q1 heading — a real figure under a
  // period it does not describe, and the payload carries both so nothing else
  // would notice.
  const r = marketPriceRate(HOUSE_MARKET);
  assert.equal(r.period, "2026-Q2");
  assert.equal(r.total.value, 13.1);
  assert.equal(r.total.refPeriod, "2026-Q2");
  assert.equal(r.newBuild, 11.0);
  assert.equal(r.existing, 14.4);
  // **Read, never derived.** The index level sits in the same payload and
  // dividing two of its members would be a rate НСИ warn can differ from the
  // one both publishers print, across their rebasing.
  assert.equal(r.total.method, null);
  assert.equal(r.total.derivedFrom, null);
});

test("marketStructure derives only the share, and dates each cube by its own clock", () => {
  // Four cubes on four clocks in one payload. A census from 2021 shown under
  // the tenure survey's year is a five-year-old dwelling count presented as
  // this year's, on the one page whose promise is that every figure carries the
  // period it describes.
  const structure = {
    tenure: {
      ref_period: "2025",
      owner_pct: 86.1,
      owner_with_mortgage_pct: 1.7,
      rent_market_price_pct: 2.2,
    },
    census_dwellings: {
      ref_period: "2021",
      total: 4258585,
      occupied: 2600911,
      unoccupied: 1657674,
      api_url: "https://example.invalid/api/cens",
    },
    price_to_income: { ref_period: "2024", value: 67.75, unit: "PTIR_LT_AVG" },
    housing_cost_overburden: { ref_period: "2025", value_pct: 6.9 },
  };
  const s = marketStructure(structure);
  assert.equal(s.owner.refPeriod, "2025");
  assert.equal(s.dwellings.refPeriod, "2021");
  assert.equal(s.unoccupied.refPeriod, "2021");
  // The other two cubes are read as series, because the page draws each of them
  // as a chart and quotes its newest reading in the sentence above it. Their
  // own year travels with the series for that reason: two calls to get one
  // figure and its period is how a chart ends up captioned with a year the
  // number beside it does not share.
  assert.equal(marketPriceToIncomeSeries(structure).refPeriod, "2024");
  assert.equal(marketPriceToIncomeSeries(structure).value, 67.75);
  assert.equal(marketOverburdenSeries(structure).refPeriod, "2025");
  assert.equal(marketOverburdenSeries(structure).value, 6.9);
  // …and neither is in `marketStructure` any more, so nothing can read one from
  // there and caption it with the tenure survey's year.
  assert.equal(s.priceToIncome, undefined);
  assert.equal(s.overburden, undefined);
  // The share is ours and says so; the counts are Eurostat's and do not.
  assert.ok(Math.abs(s.unoccupiedPct.value - (1657674 / 4258585) * 100) < 1e-9);
  assert.equal(s.unoccupiedPct.refPeriod, "2021");
  assert.ok(s.unoccupiedPct.method, "the unoccupied share does not disclose itself");
  assert.deepEqual(s.unoccupiedPct.derivedFrom, ["https://example.invalid/api/cens"]);
  for (const key of ["owner", "ownerWithMortgage", "dwellings", "unoccupied"]) {
    assert.equal(s[key].method, null, `${key} is presented as our arithmetic and is not`);
  }
});

test("marketDealInYearsOfPay reads the all-activities GROSS row, and dates both halves", () => {
  // Two publishers, joined here because neither published file may carry the
  // other's number. Three ways this goes wrong and none of them is visible in
  // the figure: a sector row instead of the all-activities one, a net wage
  // instead of the gross the caption names, and one period standing for both.
  const sectorSalary = {
    ref_period: "2025-Q4",
    source_url: "https://example.invalid/nsi-wages",
    sectors: [
      { en_name: "Construction", value_eur: 1100 },
      { en_name: "Total", value_eur: 1407 },
      { en_name: "Information and communication", value_eur: 3900 },
    ],
  };
  const y = marketDealInYearsOfPay(HOUSE_MARKET, sectorSalary);
  assert.equal(y.monthlyGrossEur, 1407, "the wage is not НСИ's all-activities row");
  assert.ok(Math.abs(y.value - 82786.01 / (1407 * 12)) < 1e-12);
  // **Both periods, because the figure describes both.** Eurostat disseminate
  // about a week behind НСИ publishing, so the two part for the days between
  // two releases — and a card naming one of them describes half its own
  // arithmetic.
  assert.equal(y.dealPeriod, "2026-Q1");
  assert.equal(y.wagePeriod, "2025-Q4");
  assert.equal(y.wageUrl, "https://example.invalid/nsi-wages");
  assert.ok(/GROSS/.test(y.method), "the method does not say which wage this divides by");
  // The sector rows are unreachable: there is no argument to pass one through.
  assert.equal(marketDealInYearsOfPay(HOUSE_MARKET, { ...sectorSalary, sectors: [] }).value, null);
  assert.equal(marketDealInYearsOfPay(null, sectorSalary).value, null);
});

test("marketCities dates each column by its own workbook and each row by its own cell", () => {
  // Three periods can disagree in this table. HPI_2.6 and HSI_2.4.5 are two
  // files on НСИ's portal and either can be republished first; each city row is
  // dated by the newest quarter that city carries, so one missing from the
  // latest release keeps the quarter it has; and the payload's own
  // `ref_period` belongs to the NATIONAL block, which this table never draws.
  // Any of the three under a single caption is figures from two periods under a
  // heading claiming one — a misstatement with no wrong digit in it.
  const nsiHousing = {
    ref_period: "2026-Q2",
    national_price_index_yoy: { ref_period: "2026-Q2", value_pct: { total: 13.1 } },
    city_price_index_yoy: {
      ref_period: "2026-Q1",
      source_url: "https://example.invalid/HPI_2.6.xlsx",
      cities: [
        {
          code: "sofiya",
          name_bg: "София",
          name_en: "Sofia",
          ref_period: "2026-Q1",
          value_pct: 16.0,
        },
        { code: "ruse", name_bg: "Русе", name_en: "Ruse", ref_period: "2025-Q4", value_pct: -5.8 },
      ],
    },
    city_deals_yoy: {
      ref_period: "2025-Q4",
      source_url: "https://example.invalid/HSI_2.4.5.xlsx",
      cities: [
        {
          code: "sofiya",
          name_bg: "София",
          name_en: "Sofia",
          ref_period: "2025-Q4",
          value_pct: -19.2,
        },
      ],
    },
  };
  const c = marketCities(nsiHousing);
  assert.equal(
    c.pricePeriod,
    "2026-Q1",
    "the price column is dated by something other than HPI_2.6"
  );
  assert.equal(
    c.dealsPeriod,
    "2025-Q4",
    "the sales column is dated by something other than HSI_2.4.5"
  );
  assert.notEqual(c.pricePeriod, nsiHousing.ref_period, "the table is dated by the national block");
  assert.equal(c.priceUrl, "https://example.invalid/HPI_2.6.xlsx");
  assert.equal(c.dealsUrl, "https://example.invalid/HSI_2.4.5.xlsx");

  // Joined on the city code, never zipped by position: the sales workbook
  // covers a shorter window, so a city in one and not the other has to come
  // back with a null rather than with its neighbour's figure.
  assert.deepEqual(
    c.cities.map((x) => [x.code, x.pricePct, x.pricePeriod, x.dealsPct, x.dealsPeriod]),
    [
      ["sofiya", 16.0, "2026-Q1", -19.2, "2025-Q4"],
      ["ruse", -5.8, "2025-Q4", null, null],
    ]
  );
  // Русе's price is a quarter behind its own column, which is exactly what the
  // cell has to be able to say.
  assert.notEqual(c.cities[1].pricePeriod, c.pricePeriod);
  assert.deepEqual(marketCities(null).cities, []);
});

test("marketNsiNationalRate is НСИ's own cell, reconcilable against Eurostat's", () => {
  // Both publishers' figure for one statistic is on the page deliberately: a
  // reader who checks one against the other finds they agree. That only works
  // while this reads НСИ's block rather than falling through to Eurostat's.
  const n = marketNsiNationalRate({
    national_price_index_yoy: {
      ref_period: "2026-Q1",
      source_url: "https://example.invalid/HPI_1.3.xlsx",
      value_pct: { total: 14.8, new: 12.5, existing: 16.3 },
    },
  });
  assert.equal(n.value, 14.8);
  assert.equal(n.refPeriod, "2026-Q1");
  assert.equal(n.sourceUrl, "https://example.invalid/HPI_1.3.xlsx");
  assert.equal(n.newBuild, 12.5);
  assert.equal(n.existing, 16.3);
  // Selected, never computed: §2.1.1 of НСИ's licence forbids distributing
  // производни произведения, so a disclosure here would be describing a breach.
  assert.equal(n.method, null);
  assert.equal(marketNsiNationalRate(null).value, null);
});

test("the live payloads still carry every field the market wiring reads", () => {
  // The fixtures above pin the wiring; this pins the contract they stand for.
  // A pipeline that stopped writing `rate_ref_period` or renamed
  // `city_deals_yoy` leaves every fixture test green and takes cards off the
  // published page — the one failure a fixture cannot see.
  const market = read("house_market");
  const structure = read("house_market_structure");
  const nsi = read("nsi_housing");
  const sector = read("sector_salary");
  if (!market || !structure || !nsi || !sector) return; // no refresh in this checkout

  assert.ok(marketVolume(market).deals.value > 0);
  assert.ok(marketAverageDeal(market).avg.value > 0);
  assert.equal(typeof marketPriceRate(market).total.value, "number");
  assert.ok(marketPriceRate(market).period, "the published index carries no rate_ref_period");
  assert.ok(marketStructure(structure).unoccupiedPct.value > 0);
  assert.ok(marketDealInYearsOfPay(market, sector).value > 0);
  assert.ok(marketNsiNationalRate(nsi).value != null);

  const cities = marketCities(nsi);
  assert.ok(cities.cities.length >= 6, `only ${cities.cities.length} cities reach the table`);
  assert.ok(cities.pricePeriod && cities.dealsPeriod, "a column reaches the table undated");
  for (const city of cities.cities) {
    assert.ok(city.nameBg && city.nameEn, `${city.code} is named in one language only`);
    assert.ok(city.pricePeriod, `${city.code}'s price cell is undated`);
  }
});

// ---------------------------------------------------------------------------
// `/market/`'s series — the shape every chart is drawn from
// ---------------------------------------------------------------------------

test("plotSeries clamps its own floor at zero and offers no way to raise it", () => {
  // **The honesty contract of the whole file.** A y-axis cropped to a property
  // series' own range turns any of them into a cliff, and the way to keep that
  // off the page is to leave no caller a floor to set — not to ask them nicely.
  const rising = plotSeries({ "2020-Q1": 80, "2020-Q2": 100, "2020-Q3": 260 });
  assert.equal(rising.min, 0, "a positive series does not start at zero");
  assert.equal(rising.max, 260);

  // A signed series keeps its negative half: Eurostat's annual rate ran from
  // +34.6% to −26.8%, and a plot that cropped either end would be describing a
  // different market. What is invariant is that ZERO IS INSIDE the scale.
  const signed = plotSeries({ "2009-Q3": -26.8, "2007-Q4": 34.6, "2026-Q1": 14.8 });
  assert.equal(signed.min, -26.8);
  assert.equal(signed.max, 34.6);

  // Never a floor above zero, whatever the data does.
  const narrow = plotSeries({ a: 250, b: 255, c: 260 });
  assert.equal(narrow.min, 0, "a narrow band cropped its own axis");
  assert.ok(narrow.min <= 0 && narrow.max >= 0);

  // The reference is inside the extent, because a plot whose own rule sits off
  // the top has drawn everything except the thing it is about.
  const ratio = plotSeries({ 2024: 67.75 }, { reference: 100 });
  assert.equal(ratio.max, 100);
  assert.equal(ratio.reference, 100);

  // The readings a text alternative needs, and the order the points come in.
  const many = plotSeries({ 2021: 5, 2019: 9, 2020: 1 });
  assert.deepEqual(
    many.points.map((p) => p.period),
    ["2019", "2020", "2021"]
  );
  assert.equal(many.peak.period, "2019");
  assert.equal(many.trough.period, "2020");
  assert.equal(many.first.period, "2019");
  assert.equal(many.latest.period, "2021");

  assert.deepEqual(plotSeries(null).points, []);
  assert.equal(plotSeries(null).min, 0);
});

test("marketRent cites the publisher's page and queries the row", () => {
  // `hicp_categories.json` carries ONE databrowser page for the whole cube and
  // a query per row, so the two halves of a source line come from two places.
  // Built from the row alone the caption has no page to offer and sends a
  // reader to raw JSON as its first destination — on the page whose argument is
  // that a sceptic can follow the link and check.
  const payload = {
    source_url: "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table",
    categories: [
      {
        groups: [
          { cp_code: "CP045", annual_rate_pct: 3.3, ref_period: "2026-06", api_url: "x/CP045" },
          {
            cp_code: "CP041",
            annual_rate_pct: 10.1,
            ref_period: "2026-06",
            api_url: "https://ec.europa.eu/eurostat/api/x?coicop=CP041",
          },
        ],
      },
    ],
  };
  const rent = marketRent(payload);
  assert.equal(rent.value, 10.1);
  assert.equal(rent.refPeriod, "2026-06");
  assert.match(rent.sourceUrl, /databrowser/, "the rent line cites no page a reader can browse");
  assert.match(rent.apiUrl, /CP041/, "the query behind the rent figure is not the rent row's");

  // CP041 is actual rents paid. CP04 sweeps in water, electricity and gas, and
  // a section asking what housing costs against incomes reads very differently
  // on it — so the row is found by its code and never by position.
  assert.equal(
    marketRent({ ...payload, categories: [{ groups: [payload.categories[0].groups[0]] }] }),
    null,
    "a payload without the rent row returns something for the page to render"
  );
  assert.equal(marketRent(null), null);
});

test("marketIndexReading takes the base year off the payload and divides by its own base", () => {
  // Two claims the page makes in prose, both of which used to be typed. The
  // base year was the literal «2015» in the copy and in the chart's own text
  // alternative; Eurostat rebase, and `I25_Q` is the same measurement putting
  // today at 109 instead of 273 — so both would have kept rendering, beside a
  // chart whose every digit was still right.
  const market = {
    ref_period: "2026-Q1",
    price_index: {
      base_year: 2015,
      source_url: "https://ec.europa.eu/eurostat/databrowser/view/prc_hpi_q/default/table",
      api_url: "https://ec.europa.eu/eurostat/api/x/prc_hpi_q",
      series_by_period: {
        "2015-Q1": { total: 100 },
        "2026-Q1": { total: 250 },
      },
    },
    price_index_real: {
      base_year: 2015,
      source_url: "https://ec.europa.eu/eurostat/databrowser/view/tipsho30/default/table",
      api_url: "https://ec.europa.eu/eurostat/api/x/tipsho30",
      series_by_period: { "2015-Q1": 100, "2008-Q3": 170, "2026-Q1": 160 },
    },
  };
  const r = marketIndexReading(market);
  assert.equal(r.baseYear, 2015, "the base year is not read off the payload");
  assert.equal(r.times, 2.5, "the nominal reading is not the level over its own base");
  assert.equal(r.realTimes, 1.6);
  assert.equal(r.period, "2026-Q1");

  // The shortfall is measured against the DEFLATED series' own maximum, and the
  // period comes back with it so the sentence names a quarter the data carries.
  assert.equal(r.realPeakPeriod, "2008-Q3");
  assert.ok(Math.abs(r.realBelowPeakPct - ((170 - 160) / 170) * 100) < 1e-9);

  // A rebasing moves the year the sentence names AND the level the multiple is
  // measured from, together. Eurostat write the base year as 100 whichever year
  // it is, so the divisor does not change — what changes is which year «×2,5
  // спрямо» is spoken about, and that is the half a literal got wrong. The
  // divisor's own rule is held on `indexTimesBase` in verify_mirror_math.mjs,
  // where a base other than 100 can be passed.
  const rebased = marketIndexReading({
    ...market,
    price_index: {
      ...market.price_index,
      base_year: 2025,
      series_by_period: { "2025-Q1": { total: 100 }, "2026-Q1": { total: 250 } },
    },
  });
  assert.equal(rebased.baseYear, 2025);
  assert.equal(rebased.times, 2.5);

  // …and the quarter the deflated line makes its own high is the quarter the
  // page has to say nothing about, rather than «0,0% под най-високото».
  const atPeak = marketIndexReading({
    ...market,
    price_index_real: {
      ...market.price_index_real,
      series_by_period: { "2015-Q1": 100, "2008-Q3": 170, "2026-Q1": 180 },
    },
  });
  assert.equal(atPeak.realPeakPeriod, "2026-Q1");
  assert.equal(atPeak.realBelowPeakPct, null);

  assert.equal(marketIndexReading(null).times, null);
  assert.equal(marketIndexReading(null).baseYear, null);
});

test("every market series a chart is drawn from contains zero in its scale", () => {
  // The rule above, held over the functions that actually feed the page rather
  // than over a fixture. A new series function that forgot the clamp would draw
  // a chart nothing else on the site would question.
  const market = read("house_market");
  const structure = read("house_market_structure");
  if (!market || !structure) return; // no refresh in this checkout

  const all = {
    volume: marketVolumeSeries(market),
    index: marketPriceIndexSeries(market),
    indexReal: marketPriceIndexRealSeries(market),
    rate: marketPriceRateSeries(market),
    dealNew: marketAverageDealSeries(market, "new"),
    dealExisting: marketAverageDealSeries(market, "existing"),
    overburden: marketOverburdenSeries(structure),
    priceToIncome: marketPriceToIncomeSeries(structure),
  };
  for (const [name, series] of Object.entries(all)) {
    assert.ok(series.points.length > 4, `${name} carries ${series.points.length} points`);
    assert.ok(series.min <= 0, `${name} starts its axis at ${series.min}, above zero`);
    assert.ok(series.max >= 0, `${name}'s axis stops at ${series.max}, below zero`);
    assert.ok(series.sourceUrl, `${name} reaches a chart with no source to caption it`);
    assert.ok(series.apiUrl, `${name} reaches a chart with no query to check it against`);
  }
});

test("the two index lines share a base, so one axis serves both", () => {
  // The nominal index and the deflated one are the same statistic measured two
  // ways, and the page draws them together. That only works while they are on
  // ONE base: `tipsho30` on a different unit would still return a plausible
  // line, three times flatter, and the pair would read as a collapse.
  const market = read("house_market");
  if (!market) return;

  const nominal = marketPriceIndexSeries(market);
  const real = marketPriceIndexRealSeries(market);
  assert.equal(nominal.reference, 100);
  assert.equal(real.reference, 100);
  assert.deepEqual(
    real.points.map((p) => p.period),
    nominal.points.map((p) => p.period),
    "the two indices cover different quarters, so a shared x axis misaligns them"
  );
  // Each averages 100 over its own base year — the identity the pipeline gates
  // and the reason the two are comparable at all.
  for (const [name, series] of [
    ["nominal", nominal],
    ["deflated", real],
  ]) {
    const base = series.points.filter((p) => p.period.startsWith("2015-Q"));
    assert.equal(base.length, 4, `${name} carries ${base.length} quarters of its base year`);
    const mean = base.reduce((sum, p) => sum + p.value, 0) / 4;
    assert.ok(Math.abs(mean - 100) < 0.05, `${name} averages ${mean} across 2015, not 100`);
  }
  // The deflated series has no purchase split, so asking for one must not
  // silently return the total under a new-build label.
  assert.equal(marketPriceIndexRealSeries(market).points.length, real.points.length);
});

test("Eurostat's flags reach the page at the periods they are on, and nowhere else", () => {
  // A break is the publisher declining to call two stretches one measurement.
  // Drawn at the wrong quarter it qualifies the wrong point; drawn everywhere it
  // qualifies nothing.
  const market = read("house_market");
  if (!market) return;

  const nominal = marketPriceIndexSeries(market);
  const real = marketPriceIndexRealSeries(market);
  const periods = new Set(nominal.points.map((p) => p.period));
  for (const [name, series] of [
    ["nominal", nominal],
    ["deflated", real],
  ]) {
    assert.ok(Object.keys(series.flags).length > 0, `${name} carries no flags`);
    for (const [period, letter] of Object.entries(series.flags)) {
      assert.ok(periods.has(period), `${name} flags ${period}, which the series does not carry`);
      assert.match(letter, /^[bepd]+$/, `${name} flags ${period} as ${letter}`);
    }
    assert.ok(
      Object.keys(series.flags).length < series.points.length,
      `${name} flags every point it has, which marks nothing`
    );
  }
  // The key names the letters the data uses and no others: a legend naming a
  // marker nowhere on the chart is a question a reader cannot answer.
  const used = statusLettersUsed([nominal.flags, real.flags]);
  assert.ok(used.length > 0);
  assert.deepEqual(used, [...new Set(used)]);
  for (const letter of used) {
    assert.ok(
      Object.values(nominal.flags).concat(Object.values(real.flags)).join("").includes(letter),
      `the key names ${letter} and no point carries it`
    );
  }
  assert.deepEqual(statusLettersUsed([{}, null]), []);
});

test("the six city sparklines are drawn against one shared scale", () => {
  // Six charts each drawn to its own range are six pictures of the same shape,
  // and comparing rows is the only reason to put a chart in a column.
  const nsi = read("nsi_housing");
  if (!nsi) return;

  const cities = marketCities(nsi);
  assert.ok(cities.cities.length >= 6);
  for (const city of cities.cities) {
    assert.ok(city.priceSeries.points.length > 8, `${city.code} carries no history`);
    // Every city fits inside the shared scale, which is what makes two rows
    // comparable: a city drawn to its own range would fill the same box
    // whatever its numbers.
    assert.ok(
      city.priceSeries.min >= cities.priceScale.min - 1e-9,
      `${city.code} falls below the shared floor`
    );
    assert.ok(
      city.priceSeries.max <= cities.priceScale.max + 1e-9,
      `${city.code} rises above the shared ceiling`
    );
  }
  // The shared scale covers every city and still contains zero.
  assert.ok(cities.priceScale.min <= 0 && cities.priceScale.max >= 0);
  assert.equal(cities.priceScale.min, Math.min(0, ...cities.cities.map((c) => c.priceSeries.min)));
  assert.equal(cities.priceScale.max, Math.max(0, ...cities.cities.map((c) => c.priceSeries.max)));
});

test("the range strip places every row against its own published extremes", () => {
  // The strip at the top of `/market/` says where the newest reading of each
  // series sits inside that series' own record. Two things make that claim
  // true and both are here, checked against the committed payloads rather than
  // against literals — a fixture would pass for one quarter and then report a
  // refreshed market as a regression.
  const market = read("house_market");
  const structure = read("house_market_structure");
  if (!market || !structure) return; // no refresh in this checkout

  const strip = marketRangeStrip(market, structure);
  assert.equal(strip.rows.length, 5, "the strip places five series");
  assert.deepEqual(
    strip.rows.map((r) => r.key),
    ["deals", "index", "indexReal", "rate", "overburden"]
  );

  // **`price_to_income` is kept out, and putting it back is the edit this
  // guards.** It is the obvious sixth row and it is the one series whose VALUE
  // does not read on its own: Eurostat publish `PTIR_LT_AVG` as an index where
  // 100 is Bulgaria's own long-run average of the ratio, so «67,8» means nothing
  // without that 100 — and a one-line row has nowhere to mark it. Placed on a
  // track anyway it draws a dot at the left end of a line labelled «цена спрямо
  // доходите», which reads as "housing has never been more affordable": a
  // verdict, on the indicator whose own section spends three paragraphs on why
  // it may not be read as one. `#ratio` draws it with the rule at 100, which is
  // what `marketPriceToIncomeSeries` passes a `reference` for.
  assert.ok(
    marketPriceToIncomeSeries(structure).points.length > RANGE_MIN_POINTS,
    "price_to_income is short enough that the length gate would exclude it anyway, " +
      "which would make the assertion below pass for the wrong reason"
  );
  assert.ok(
    !strip.rows.some((r) => r.key === "pti"),
    "the strip places price-to-income. Its published value is already an index " +
      "against its own long-run average, and the track cannot draw that 100 — so " +
      "the row says 'at its lowest ever' about a figure whose reference is nowhere " +
      "on it, which is a verdict this page does not make (docs/principles.md P6)."
  );

  for (const row of strip.rows) {
    // **The extremes are the series' own, and the position is the arithmetic
    // over them.** `plotSeries` floors a chart's scale at or below zero so no
    // axis can be cropped; measured that way each of these sits in the top
    // fifth of its track and the strip says the same thing six times.
    assert.ok(row.low <= row.value && row.value <= row.high, `${row.key} sits outside its range`);
    assert.ok(near(row.at, (row.value - row.low) / (row.high - row.low), 1e-9), row.key);
    assert.ok(row.at >= 0 && row.at <= 1, `${row.key} is placed at ${row.at}`);

    // Every row carries what a caption under it has to print: the window it is
    // a position inside, the periods of the three readings it names, and a
    // publisher's page plus the query that returns the figure.
    for (const field of ["from", "to", "latestPeriod", "lowPeriod", "highPeriod"]) {
      assert.ok(row[field], `${row.key} states no ${field}`);
    }
    assert.match(row.sourceUrl ?? "", /^https:\/\//, `${row.key} cites no publisher page`);
    assert.match(row.apiUrl ?? "", /^https:\/\//, `${row.key} links no query`);
    assert.match(row.href, /^#/, `${row.key} points at ${row.href} rather than at a section`);
  }

  // The two index rows arrive as multiples of their own base, which is how the
  // rest of the page reads them. A level of 272.63 in a column headed «сега»
  // beside «×2,7» in the card above it is the same figure written twice, and
  // the reader is left to work out that it is.
  for (const key of ["index", "indexReal"]) {
    const row = strip.rows.find((r) => r.key === key);
    assert.ok(
      row.value > 0.2 && row.value < 20,
      `${key} is placed at ${row.value}, not a multiple`
    );
  }

  // A row that cannot be placed is ABSENT rather than empty, the way the
  // deflated-peak sentence renders nothing rather than «0,0% под него». An
  // empty cell on a strip of positions reads as a position.
  assert.deepEqual(marketRangeStrip(null, null).rows, []);
  assert.deepEqual(marketRangeStrip({}, {}).rows, []);
  // A series too short to have a record: the same points either side of the
  // floor, and the row appears only above it.
  const short = (n) => ({
    housing_cost_overburden: {
      source_url: "https://ec.europa.eu/x",
      api_url: "https://ec.europa.eu/y",
      series_by_period: Object.fromEntries(
        Array.from({ length: n }, (_, i) => [String(2000 + i), 10 + i])
      ),
    },
  });
  assert.equal(marketRangeStrip(null, short(RANGE_MIN_POINTS - 1)).rows.length, 0);
  assert.equal(marketRangeStrip(null, short(RANGE_MIN_POINTS)).rows.length, 1);
  // …and a series that never moved has no range to place anything in.
  assert.deepEqual(
    marketRangeStrip(null, {
      housing_cost_overburden: {
        series_by_period: { 2000: 10, 2001: 10, 2002: 10, 2003: 10, 2004: 10 },
      },
    }).rows,
    []
  );
});
