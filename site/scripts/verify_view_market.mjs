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
  marketVolumeChangeSeries,
  marketVolumeAgainstPrices,
  marketAverageDealSeries,
  marketOverburdenSeries,
  marketRangeStrip,
  marketBorrowedShare,
  RANGE_MIN_POINTS,
  statusLettersUsed,
  marketCityAffordability,
  COVERAGE_SHIFT,
  CITY_SHORT_ARCHIVE,
} from "../src/lib/view/market.js";
import { CITY_NO_PAGE } from "../src/lib/view/region.js";
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
    // **The cube reaches a quarter past the payload's own `ref_period`, and it
    // has to.** `ref_period` is the quarter the gates ran against; the newest
    // key is whatever Eurostat's cube happened to reach. With the two equal in
    // the fixture, `max(keys)` and `ref_period` are the same string and no
    // assertion on this block can tell which one the wiring read — the
    // substitution `marketVolume`'s docstring warns about would report a real
    // count for a quarter nothing validated, with every suite green.
    series_by_period: {
      "2025-Q1": { total: 15000, new: 4800, existing: 10200 },
      "2025-Q4": { total: 20000, new: 6400, existing: 13600 },
      "2026-Q1": { total: 16227, new: 5181, existing: 11046 },
      "2026-Q2": { total: 30000, new: 9000, existing: 21000 },
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
  // One rule over all three rows of the table rather than three assertions:
  // each row's change is the year-on-year of ITS OWN count. New builds and
  // existing dwellings move differently in volume — which is why the payload
  // carries them apart — so the two crossed leaves both figures published, both
  // plausible and both against the wrong row.
  for (const [field, change, now, before] of [
    ["total", v.changePct.value, 16227, 15000],
    ["new", v.changeNewPct, 5181, 4800],
    ["existing", v.changeExistingPct, 11046, 10200],
  ]) {
    assert.ok(
      near(change, ((now - before) / before) * 100, 1e-9),
      `${field} is not its own change`
    );
  }
  assert.notEqual(v.changeNewPct, v.changeExistingPct);
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
  // The same invitation, per purchase type: the page prints the numerator and
  // the denominator of EVERY row beside its quotient, so each row's two sides
  // have to be that row's. A new-build value over a new-build count is €109,138
  // and over an existing count it is €150,149 — both euro figures, one of them
  // an average of nothing, and only the row's own division says which.
  for (const [type, avg, value, deals] of [
    ["total", d.avg.value, d.totalValue, d.deals],
    ["new", d.newBuild, d.newValue, d.newDeals],
    ["existing", d.existing, d.existingValue, d.existingDeals],
  ]) {
    assert.ok(Math.abs(avg - value / deals) < 0.01, `${type}: ${avg} is not ${value} ÷ ${deals}`);
  }
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

/**
 * The tenure survey and the census, shaped as `house_market_structure.json`
 * carries them.
 *
 * **The tenure split is here in full, and the full split is what makes the
 * panel checkable.** Every share is on one base, so the column sums to the
 * published total and each sub-share sits inside its own total — a renter share
 * of 13.9% containing 2.2% at a market price. Two adjacent fields of the same
 * type read into each other's slot leave six percentages that are all published
 * and one table that no longer adds up, and a partial fixture cannot see it: a
 * field the fixture omits reads as `undefined` from either slot.
 */
const STRUCTURE = Object.freeze({
  tenure: {
    ref_period: "2025",
    total_pct: 100.0,
    owner_pct: 86.1,
    owner_with_mortgage_pct: 1.7,
    owner_no_mortgage_pct: 84.4,
    rent_pct: 13.9,
    rent_market_price_pct: 2.2,
    rent_reduced_or_free_pct: 11.7,
  },
  census_dwellings: {
    ref_period: "2021",
    total: 4258585,
    occupied: 2600911,
    unoccupied: 1657674,
    api_url: "https://example.invalid/api/cens",
  },
  housing_cost_overburden: { ref_period: "2025", value_pct: 6.9 },
});

test("marketStructure derives only the share, and dates each cube by its own clock", () => {
  // Four cubes on four clocks in one payload. A census from 2021 shown under
  // the tenure survey's year is a five-year-old dwelling count presented as
  // this year's, on the one page whose promise is that every figure carries the
  // period it describes.
  const s = marketStructure(STRUCTURE);
  assert.equal(s.owner.refPeriod, "2025");
  assert.equal(s.dwellings.refPeriod, "2021");
  assert.equal(s.unoccupied.refPeriod, "2021");
  // The overburden cube is read as a series, because the page draws it as a
  // chart and quotes its newest reading in the sentence above it. Its own year
  // travels with the series for that reason: two calls to get one figure and
  // its period is how a chart ends up captioned with a year the number beside
  // it does not share.
  assert.equal(marketOverburdenSeries(STRUCTURE).refPeriod, "2025");
  assert.equal(marketOverburdenSeries(STRUCTURE).value, 6.9);
  // …and it is not in `marketStructure` any more, so nothing can read it from
  // there and caption it with the tenure survey's year.
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

test("every figure on the structure panel is the published field of its own name", () => {
  // **The panel's slots are all the same type, so a wrong one is invisible in
  // the digit.** Occupied and unoccupied are both dwelling counts in the
  // millions; the renter total and the market-price renter share are both
  // percentages of one population. Read into each other's slot the page prints
  // an empty-stock share of 61% and a market-rent share larger than the whole
  // rented sector, with every number published and no gate in the pipeline able
  // to see a swap that happens in the browser.
  //
  // The unoccupied share is the one derived figure here and it recomputes from
  // the census block rather than from the panel, so it cannot see the panel's
  // own fields move — which is why it is checked AGAINST them below rather than
  // against the payload a second time.
  const s = marketStructure(STRUCTURE);
  const c = STRUCTURE.census_dwellings;
  const t = STRUCTURE.tenure;

  assert.deepEqual(
    [s.dwellings.value, s.occupied.value, s.unoccupied.value],
    [c.total, c.occupied, c.unoccupied]
  );
  assert.ok(
    near(s.unoccupiedPct.value, (100 * s.unoccupied.value) / s.dwellings.value, 1e-9),
    "the share on the panel is not the share of the two counts printed beside it"
  );

  assert.deepEqual(
    [
      s.owner.value,
      s.ownerWithMortgage.value,
      s.ownerNoMortgage.value,
      s.renter.value,
      s.renterAtMarketPrice.value,
      s.renterReducedOrFree.value,
    ],
    [
      t.owner_pct,
      t.owner_with_mortgage_pct,
      t.owner_no_mortgage_pct,
      t.rent_pct,
      t.rent_market_price_pct,
      t.rent_reduced_or_free_pct,
    ]
  );
  // The identities the column is a table rather than six percentages: each pair
  // of sub-shares adds to its own total, and the two totals to the published
  // 100%. A reader checks the column by adding it up, so the panel has to add
  // up on the values the panel itself returns.
  assert.ok(near(s.ownerWithMortgage.value + s.ownerNoMortgage.value, s.owner.value, 1e-9));
  assert.ok(near(s.renterAtMarketPrice.value + s.renterReducedOrFree.value, s.renter.value, 1e-9));
  assert.ok(near(s.owner.value + s.renter.value, t.total_pct, 1e-9));
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
// `/market/`'s cross-city affordability table — the three-payload join
// ---------------------------------------------------------------------------

/** имот.bg's archive, shaped as `city_price.json` carries it. */
const CITY_PRICE = Object.freeze({
  as_of: "2026-08-16",
  source_url: "https://example.invalid/imot",
  city_pages: ["sofiya", "varna", "vratsa", "smolyan"],
  cities: [
    {
      code: "sofiya",
      bg_name: "София",
      en_name: "Sofia",
      source_url: "https://example.invalid/imot/sofiya",
      historical: [
        { year: 2020, eur_per_m2_median: 1200, n_districts: 100 },
        { year: 2021, eur_per_m2_median: 1300, n_districts: 100 },
        { year: 2022, eur_per_m2_median: 1400, n_districts: 102 },
      ],
    },
    {
      code: "varna",
      bg_name: "Варна",
      en_name: "Varna",
      source_url: "https://example.invalid/imot/varna",
      // Half as many districts again by the end, which is the composition
      // change the row has to disclose.
      historical: [
        { year: 2020, eur_per_m2_median: 900, n_districts: 20 },
        { year: 2021, eur_per_m2_median: 1000, n_districts: 24 },
        { year: 2022, eur_per_m2_median: 1150, n_districts: 30 },
      ],
    },
    {
      code: "vratsa",
      bg_name: "Враца",
      en_name: "Vratsa",
      source_url: "https://example.invalid/imot/vratsa",
      historical: [
        { year: 2020, eur_per_m2_median: 400, n_districts: 12 },
        { year: 2021, eur_per_m2_median: 480, n_districts: 12 },
        { year: 2022, eur_per_m2_median: 640, n_districts: 12 },
      ],
    },
    {
      // имот.bg publish this city and their archive starts after the base year.
      code: "smolyan",
      bg_name: "Смолян",
      en_name: "Smolyan",
      source_url: "https://example.invalid/imot/smolyan",
      historical: [{ year: 2022, eur_per_m2_median: 700, n_districts: 8 }],
    },
  ],
});

/** НСИ's quarters, shaped as `region_salary.json` carries them. */
const REGION_SALARY = Object.freeze({
  ref_period: "2022-Q2",
  is_preliminary: true,
  dataset: "Labour_1.1.2.2",
  source_url: "https://example.invalid/nsi/en.xlsx",
  source_url_bg: "https://example.invalid/nsi/bg.xlsx",
  regions: [
    {
      code: "sofiya",
      bg_name: "София(столица)",
      en_name: "Sofia cap.",
      value_eur: 1600,
      // Q1 and Q2 differ in every year, so a wiring that read the wrong quarter
      // — or averaged the four — comes back with a figure no assertion here
      // could mistake for the right one.
      series_by_period: {
        "2020-Q1": 1000,
        "2020-Q2": 1200,
        "2020-Q3": 1300,
        "2020-Q4": 1500,
        "2021-Q1": 1100,
        "2021-Q2": 1300,
        "2021-Q3": 1400,
        "2021-Q4": 1600,
        "2022-Q1": 1400,
        "2022-Q2": 1600,
      },
    },
    {
      code: "varna",
      bg_name: "Варна",
      en_name: "Varna",
      value_eur: 1000,
      series_by_period: {
        "2020-Q1": 700,
        "2020-Q2": 800,
        "2020-Q3": 850,
        "2020-Q4": 950,
        "2021-Q1": 780,
        "2021-Q2": 880,
        "2021-Q3": 900,
        "2021-Q4": 1000,
        "2022-Q1": 900,
        "2022-Q2": 1000,
      },
    },
    {
      code: "vratsa",
      bg_name: "Враца",
      en_name: "Vratsa",
      value_eur: 900,
      series_by_period: {
        "2020-Q1": 600,
        "2020-Q2": 700,
        "2020-Q3": 720,
        "2020-Q4": 800,
        "2021-Q1": 680,
        "2021-Q2": 780,
        "2021-Q3": 800,
        "2021-Q4": 880,
        "2022-Q1": 800,
        "2022-Q2": 900,
      },
    },
    {
      code: "smolyan",
      bg_name: "Смолян",
      en_name: "Smolyan",
      value_eur: 800,
      series_by_period: {
        "2020-Q2": 600,
        "2020-Q3": 610,
        "2021-Q2": 700,
        "2021-Q3": 710,
        "2022-Q2": 800,
        "2022-Q3": 810,
      },
    },
    {
      // НСИ publish a wage for it and имот.bg serve no page: the one область
      // that is in a payload here and can never be a row.
      code: "sofia-oblast",
      bg_name: "София",
      en_name: "Sofia",
      value_eur: 1100,
      series_by_period: {
        "2020-Q2": 900,
        "2020-Q3": 910,
        "2021-Q2": 1000,
        "2021-Q3": 1010,
        "2022-Q2": 1100,
        "2022-Q3": 1110,
      },
    },
  ],
});

const PAYROLL = Object.freeze({
  employee_contrib_rates: { total: 0.1378 },
  income_tax_rate: 0.1,
  max_insurable_income_eur: 2300,
});

/** One row out of the answer, by код. */
const rowFor = (result, code) => result.rows.find((r) => r.code === code);

test("marketCityAffordability reads one quarter per year, and averages nothing", () => {
  // **The licence property and the seasonal one, held together.** НСИ forbid
  // distributing производни и сборни произведения, so every wage in this table
  // has to be a cell they printed rather than a mean of four — and the same
  // selection is what stops the two ends of a comparison describing different
  // seasons. A year's mean would fail both at once, and the figure it produced
  // would sit in a plausible column with nothing on the page to contradict it.
  const a = marketCityAffordability(CITY_PRICE, REGION_SALARY, PAYROLL);
  assert.equal(a.quarter, "Q2", "the anchor quarter is not the payload's own ref_period");
  assert.equal(a.baseYear, 2020);
  assert.equal(a.latestYear, 2022);
  assert.deepEqual(a.years, [2020, 2021, 2022]);

  for (const row of a.rows) {
    const series = REGION_SALARY.regions.find((r) => r.code === row.code).series_by_period;
    for (const point of row.points) {
      // The cell itself, by identity: `2020-Q2` and not the mean of 2020, and
      // not `2020-Q1` either.
      assert.equal(
        point.gross,
        series[`${point.year}-Q2`],
        `${row.code} ${point.year} divides by a wage НСИ did not print at Q2`
      );
    }
  }

  // …and it is that област's own wage. A lookup that fell back to the first row
  // would put София's 1600 under Варна's name, on a table whose whole point is
  // that the two differ (`docs/site.md` §"A correct formula fed the wrong
  // number").
  assert.equal(rowFor(a, "varna").latest.gross, 1000);
  assert.equal(rowFor(a, "vratsa").latest.gross, 900);

  // The net is the published payroll table's, not a constant frozen here: at
  // 13.78% and 10% the 1600 gross pays 1241.568 net, and 70 m² at €1400 is
  // 98,000 over twelve months of it.
  const sofia = rowFor(a, "sofiya");
  assert.ok(near(sofia.latest.net, 1600 * (1 - 0.1378) * 0.9, 1e-9));
  assert.ok(near(sofia.latest.value, (1400 * a.m2) / (sofia.latest.net * 12), 1e-12));
  assert.equal(a.m2, 70, "the size is not the one the calculator itself defaults to");
});

test("the window is the years both publishers cover, whichever is ahead", () => {
  // **The failure this refuses emptied the whole section, silently.** The two
  // release on their own clocks: ended at НСИ's own year, the first quarter of
  // a January имот.bg had not scraped yet failed every city's newest-year check
  // at once, and 25 rows became none with no error anywhere — a table of
  // nothing is exactly what "no city has both halves" produces.
  const a = marketCityAffordability(CITY_PRICE, REGION_SALARY, PAYROLL);
  assert.deepEqual([a.baseYear, a.latestYear], [2020, 2022]);

  // НСИ a year ahead: the table stays on the newest year that can be computed.
  const wagesAhead = {
    ...REGION_SALARY,
    ref_period: "2023-Q2",
    regions: REGION_SALARY.regions.map((r) => ({
      ...r,
      series_by_period: { ...r.series_by_period, "2023-Q2": r.series_by_period["2022-Q2"] + 100 },
    })),
  };
  const ahead = marketCityAffordability(CITY_PRICE, wagesAhead, PAYROLL);
  assert.equal(ahead.latestYear, 2022, "НСИ publishing first empties the table");
  assert.ok(ahead.rows.length >= 3);

  // имот.bg a year ahead: the same, from the other side.
  const pricesAhead = {
    ...CITY_PRICE,
    cities: CITY_PRICE.cities.map((c) => ({
      ...c,
      historical: [...c.historical, { ...c.historical.at(-1), year: 2023 }],
    })),
  };
  const other = marketCityAffordability(pricesAhead, REGION_SALARY, PAYROLL);
  assert.equal(other.latestYear, 2022, "имот.bg publishing first empties the table");
  assert.ok(other.rows.length >= 3);

  // And the anchor follows НСИ's own quarter rather than being written down.
  const q3 = { ...REGION_SALARY, ref_period: "2022-Q3" };
  assert.equal(marketCityAffordability(CITY_PRICE, q3, PAYROLL).quarter, "Q3");
});

test("an област with no row is named with the reason it has none", () => {
  // A table of three under a heading saying «по градове» reads as the country.
  // Two different absences and therefore two different reasons: «имот.bg не
  // публикуват цени за Смолян» is false — they publish this year's — and it is
  // the sentence one flag would produce for both.
  const a = marketCityAffordability(CITY_PRICE, REGION_SALARY, PAYROLL);
  assert.deepEqual(
    a.omitted.map((o) => [o.code, o.reason]),
    [
      ["smolyan", CITY_SHORT_ARCHIVE],
      ["sofia-oblast", CITY_NO_PAGE],
    ]
  );
  // Every област НСИ publish is accounted for: a row or a reason, never gone.
  assert.deepEqual(
    [...a.rows.map((r) => r.code), ...a.omitted.map((o) => o.code)].sort(),
    REGION_SALARY.regions.map((r) => r.code).sort()
  );
  // Both Софии keep the picker's own names, so the област is not the capital
  // wearing the same word.
  assert.equal(a.omitted.find((o) => o.code === "sofia-oblast").bgName, "Софийска област");
  assert.equal(rowFor(a, "sofiya").bgName, "София");
});

test("the affordability rows are ordered by the newest reading", () => {
  // The finding IS the order: the capital is not at the top of it, and a table
  // sorted by anything else buries that. Nothing else in the section says so —
  // there is no chart here, so the ordering carries the whole comparison and
  // the prose above quotes the rows it produced.
  const a = marketCityAffordability(CITY_PRICE, REGION_SALARY, PAYROLL);
  assert.deepEqual(
    a.rows.map((r) => r.code),
    ["varna", "sofiya", "vratsa"]
  );
  assert.ok(rowFor(a, "varna").latest.value > rowFor(a, "sofiya").latest.value);
  assert.deepEqual(
    a.aboveCapital.map((r) => r.code),
    ["varna"],
    "the cities above the capital are not the ones the order says they are"
  );
  // Two of the three got dearer against pay and София got easier, which is what
  // makes this count a count rather than the number of rows.
  assert.equal(a.worse, 2);
  assert.ok(rowFor(a, "sofiya").changePct < 0);
});

test("a city whose district set moved carries both counts, and one whose did not carries none", () => {
  // имот.bg's median is taken across whichever districts they published that
  // year, so where the set grew by half the move is partly composition. The
  // failure this catches is a flag computed off the wrong pair — the two counts
  // of one year, or the change in price — which discloses nothing while looking
  // exactly like disclosure.
  const a = marketCityAffordability(CITY_PRICE, REGION_SALARY, PAYROLL);
  const varna = rowFor(a, "varna");
  assert.equal(varna.nBase, 20);
  assert.equal(varna.nLatest, 30);
  assert.equal(varna.coverageShifted, true, "a district set half as large again is not disclosed");

  assert.equal(rowFor(a, "vratsa").coverageShifted, false, "an unchanged set is flagged anyway");
  // София's 100 → 102 is inside the line and stays quiet: a flag on every row
  // marks nothing.
  assert.equal(rowFor(a, "sofiya").coverageShifted, false);
  assert.ok(COVERAGE_SHIFT > 0 && COVERAGE_SHIFT < 1, "the line is not a proportion");
});

test("the live payloads still carry the affordability wiring's own fields", () => {
  // The contract behind the fixtures above: имот.bg's `historical` blocks and
  // НСИ's quarterly series both, joined at a quarter neither payload knows the
  // other has. A refresh that stopped writing `n_districts`, or an НСИ release
  // that moved `ref_period` to a quarter their archive does not reach back to,
  // empties this table with every fixture test green.
  const cityPrice = read("city_price");
  const regionSalary = read("region_salary");
  const payroll = read("payroll");
  if (!cityPrice || !regionSalary || !payroll) return; // no refresh in this checkout

  const a = marketCityAffordability(cityPrice, regionSalary, payroll);
  assert.ok(a.rows.length >= 20, `only ${a.rows.length} cities reach the table`);
  assert.ok(a.capital, "the capital has no row, so nothing on the page can be read against it");
  assert.equal(a.refPeriod, regionSalary.ref_period);
  for (const row of a.rows) {
    assert.ok(row.bgName && row.enName, `${row.code} is named in one language only`);
    assert.equal(row.points.length, a.years.length, `${row.code} has a year missing from its path`);
    assert.ok(row.latest.value > 0 && row.base.value > 0, `${row.code} draws a non-positive year`);
    assert.ok(
      Number.isFinite(row.nBase) && Number.isFinite(row.nLatest),
      `${row.code} carries no district count, so its composition change cannot be disclosed`
    );
  }
  // Every област is a row or a named absence, on the live payloads too.
  assert.equal(a.rows.length + a.omitted.length, regionSalary.regions.length);
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
  //
  // **Keyed by quarter, because a quarter is what every series on this page is
  // keyed by and an integer-like key sorts itself.** JavaScript enumerates
  // `{2021:…, 2019:…}` in ascending numeric order whatever the insertion order
  // was, so an unsorted implementation comes back sorted and the ordering claim
  // holds vacuously. `"2021-Q1"` is not an array index, so the object hands back
  // insertion order and the sort is the only thing that can produce this. Every
  // chart, every text alternative and every strip row on `/market/` is built out
  // of `first`, `latest`, `from` and `to`, so an unordered series draws the
  // record backwards and reports the oldest quarter as the newest reading.
  const many = plotSeries({ "2021-Q1": 5, "2019-Q3": 9, "2020-Q2": 1 });
  assert.deepEqual(
    many.points.map((p) => p.period),
    ["2019-Q3", "2020-Q2", "2021-Q1"]
  );
  assert.equal(many.peak.period, "2019-Q3");
  assert.equal(many.trough.period, "2020-Q2");
  assert.equal(many.first.period, "2019-Q3");
  assert.equal(many.latest.period, "2021-Q1");
  assert.equal(many.from, "2019-Q3");
  assert.equal(many.to, "2021-Q1");

  assert.deepEqual(plotSeries(null).points, []);
  assert.equal(plotSeries(null).min, 0);
});

test("a series asked for one purchase type never comes back with another's", () => {
  // Every quarterly block on this page is a `{period: {total, new, existing}}`
  // map and one lift-out reads all of them, so a fall-through to `total`
  // collapses the split everywhere at once: the two average-deal lines the
  // chart draws APART — the gap between them is what the mix caveat is about —
  // land on top of each other, and the new-build rate is labelled new while
  // reading the total. Three distinct series is the property, held over both
  // functions that take the argument rather than over one of them.
  for (const [name, of] of [
    ["avg deal", (purchase) => marketAverageDealSeries(HOUSE_MARKET, purchase)],
    ["price rate", (purchase) => marketPriceRateSeries(HOUSE_MARKET, purchase)],
  ]) {
    const values = ["total", "new", "existing"].map((p) => of(p).latest?.value);
    assert.ok(
      values.every(Number.isFinite),
      `${name} returns no reading for one of the three purchase types: ${values}`
    );
    assert.equal(new Set(values).size, 3, `${name} draws ${values} for three different questions`);
  }
  // Named, so the fall-through is caught by the figure rather than only by the
  // three being unequal: `total` is the mean over the whole quarter's mix and
  // sits BETWEEN the two, which is what makes a fall-through plausible.
  assert.equal(marketAverageDealSeries(HOUSE_MARKET, "new").latest.value, 109138.42);
  assert.equal(marketAverageDealSeries(HOUSE_MARKET, "existing").latest.value, 70425.72);
  assert.equal(marketAverageDealSeries(HOUSE_MARKET, "total").latest.value, 82786.01);
});

test("each drawn series carries the level its own units are defined against", () => {
  // `reference` is what the chart draws its rule at and what `indexTimesBase`
  // divides by, so it is a claim about what the numbers MEAN rather than a
  // drawing option. An index measured from 100 is «×2,7 спрямо 2015 г.»; the
  // same series referenced at 0 is a level with no anchor, and a rate
  // referenced at 100 puts its own zero line — the whole reading of a signed
  // series — off the bottom of the plot and reports every quarter of a 21-year
  // record as a fall. Held as a table over all ten series rather than on the two
  // it happened to be asserted for, so a new one has to say which it is.
  const market = read("house_market");
  const structure = read("house_market_structure");
  if (!market || !structure) return; // no refresh in this checkout

  const borrowed = marketBorrowedShare(market, read("credit"), read("mortgage"), read("payroll"));
  const expected = [
    // An index: 100 is the base year, which is what the multiples are read from.
    [100, "index", marketPriceIndexSeries(market)],
    [100, "indexReal", marketPriceIndexRealSeries(market)],
    // A signed change: zero is the reading, so the axis has to contain it by
    // definition rather than by whatever the data happened to do.
    [0, "rate", marketPriceRateSeries(market)],
    [0, "volumeChange", marketVolumeChangeSeries(market)],
    [0, "pairVolume", marketVolumeAgainstPrices(market).volume],
    [0, "pairPrice", marketVolumeAgainstPrices(market).price],
    // A share that CROSSES zero: a year below the rule is one the loan book
    // shrank, so the axis has to contain it by definition rather than by
    // whatever the three publishers happened to do that decade.
    [0, "borrowedNet", borrowed.net],
    // A count, a euro figure and a share of the population are defined against
    // nothing, and a rule drawn at an invented level would be ours. The gross
    // count is one of those: a share of a whole rather than a change.
    [null, "borrowedGross", borrowed.gross],
    [null, "volume", marketVolumeSeries(market)],
    [null, "dealNew", marketAverageDealSeries(market, "new")],
    [null, "dealExisting", marketAverageDealSeries(market, "existing")],
    [null, "overburden", marketOverburdenSeries(structure)],
  ];
  for (const [reference, name, series] of expected) {
    assert.equal(series.reference, reference, `${name} is defined against ${series.reference}`);
  }
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
  //
  // **The series starts a decade before the base, and the fixture has to keep
  // that gap.** Eurostat set the index to 100 at the base year and publish it
  // from long before — 2005-Q1 against a 2015 base in the committed payload. A
  // fixture whose first quarter falls inside its own base year cannot tell
  // `block.base_year` apart from the year the record opens, and that conflation
  // is the one `verify_copy.mjs` bans the WORDING of: called the start of the
  // series, the base leaves ten years of quarters drawn to the left of the year
  // the words call the beginning, all of them under the ×1 rule with nothing to
  // explain why.
  const market = {
    ref_period: "2026-Q1",
    price_index: {
      base_year: 2015,
      source_url: "https://ec.europa.eu/eurostat/databrowser/view/prc_hpi_q/default/table",
      api_url: "https://ec.europa.eu/eurostat/api/x/prc_hpi_q",
      series_by_period: {
        "2005-Q1": { total: 60 },
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
  // Both lines carry it, and neither reads it off its own first quarter.
  for (const [name, series] of [
    ["nominal", marketPriceIndexSeries(market)],
    ["deflated", marketPriceIndexRealSeries(market)],
  ]) {
    assert.equal(series.baseYear, 2015, `${name}'s base year is not the payload's base_year`);
    assert.notEqual(
      String(series.baseYear),
      series.from.slice(0, 4),
      `${name} takes its base year from the quarter the record opens at`
    );
  }
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
      series_by_period: { "2005-Q1": { total: 60 }, "2026-Q1": { total: 250 } },
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

  const borrowed = marketBorrowedShare(market, read("credit"), read("mortgage"), read("payroll"));
  const all = {
    borrowedNet: borrowed.net,
    borrowedGross: borrowed.gross,
    volume: marketVolumeSeries(market),
    volumeChange: marketVolumeChangeSeries(market),
    pairVolume: marketVolumeAgainstPrices(market).volume,
    pairPrice: marketVolumeAgainstPrices(market).price,
    index: marketPriceIndexSeries(market),
    indexReal: marketPriceIndexRealSeries(market),
    rate: marketPriceRateSeries(market),
    dealNew: marketAverageDealSeries(market, "new"),
    dealExisting: marketAverageDealSeries(market, "existing"),
    overburden: marketOverburdenSeries(structure),
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

test("the count's year-on-year series compares like quarters, and says it is ours", () => {
  // The change beside the count is one quarter against the same quarter a year
  // earlier; this is the same arithmetic over the whole record, and the whole
  // record is what says whether a given quarter's movement is an ordinary one.
  const change = marketVolumeChangeSeries(HOUSE_MARKET);

  // The fixture holds 2025-Q1, 2025-Q4 and 2026-Q1. Only one of those has the
  // same quarter a year behind it, so only one change exists — a series that
  // returned three would be comparing whatever key sits four places back.
  assert.deepEqual(
    change.points.map((p) => p.period),
    ["2026-Q1"]
  );
  assert.ok(near(change.points[0].value, ((16227 - 15000) / 15000) * 100, 1e-9));

  // 2025-Q4 is the neighbouring quarter and the higher count, and it is exactly
  // what a quarter-on-quarter reading would compare 2026-Q1 against. A change
  // computed that way is −18.9% here by coincidence and measures the calendar.
  assert.ok(change.points[0].value > 0, "the change is falling, so it was read against Q4");

  // It is Eurostat's count and our division, so it carries what re-runs it —
  // and it cites the count's own cube, never `avg_deal_eur`'s pair of queries.
  assert.deepEqual(change.derivedFrom, [HOUSE_MARKET.deals.api_url]);
  assert.equal(change.sourceUrl, HOUSE_MARKET.deals.source_url);
  assert.equal(change.reference, 0, "a signed series drawn without its zero rule");

  assert.deepEqual(marketVolumeChangeSeries(null).points, []);
  assert.deepEqual(marketVolumeChangeSeries({}).derivedFrom, null);
});

test("the two panels drawn together are restricted to the quarters they share", () => {
  // Two plots stacked one above the other claim their columns describe the same
  // quarters, and the two published records are not the same length: Eurostat
  // publish the price rate from long before they publish the transaction
  // counts. Drawn on their own windows the panels put a quarter above a quarter
  // years away from it — every digit published, both axes honest, and the one
  // thing the arrangement asserts false. The restriction is here rather than in
  // the template so a caller cannot express the wrong pairing.
  const market = read("house_market");
  if (!market) return; // no refresh in this checkout

  const { volume, price } = marketVolumeAgainstPrices(market);
  const rate = marketPriceRateSeries(market);
  const change = marketVolumeChangeSeries(market);

  assert.deepEqual(
    volume.points.map((p) => p.period),
    price.points.map((p) => p.period),
    "the two panels are drawn over different quarters"
  );
  assert.equal(volume.from, price.from);
  assert.equal(volume.to, price.to);
  assert.ok(volume.points.length > 4, "the pair is too short to draw");

  // The published rate reaches back further than the counts do, so the shared
  // window has to be SHORTER than one of the two records — if it is not, this
  // test would pass on an implementation that did no restricting at all.
  assert.ok(
    rate.points.length > price.points.length,
    `the price record is ${rate.points.length} quarters and the shared window ` +
      `${price.points.length}. With the two equal, nothing here would catch a pair drawn on ` +
      "two different windows."
  );
  // …and the change's own record is what the strip places, so it is NOT cut to
  // the shared window: the two callers want different things from one series.
  assert.equal(change.points.length, volume.points.length);

  // Each panel keeps its own publisher and its own extremes. One scale over the
  // two would flatten a rate that moves within twenty points against a count
  // that has moved by ninety.
  assert.equal(price.sourceUrl, market.price_index.source_url);
  assert.equal(volume.sourceUrl, market.deals.source_url);
  assert.deepEqual(volume.derivedFrom, [market.deals.api_url]);
  assert.notEqual(volume.max, price.max);

  assert.deepEqual(marketVolumeAgainstPrices(null).volume.points, []);
  assert.deepEqual(marketVolumeAgainstPrices({}).price.points, []);
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
    // **The sparkline ends on the figure in the column beside it.** Two
    // histories per row, both quarterly percentage changes, both in the same
    // shape — crossed, every price cell draws that city's sales record and the
    // row reads as a fall while its number says a rise. The scale is derived
    // from the series, so it stays self-consistent under the swap and cannot
    // see it; only the tie back to the row's own headline can. HPI_2.6 runs
    // from 2015 and HSI_2.4.5 from 2022, so the two are not interchangeable
    // records either.
    for (const [column, series, value, period] of [
      ["price", city.priceSeries, city.pricePct, city.pricePeriod],
      ["sales", city.dealsSeries, city.dealsPct, city.dealsPeriod],
    ]) {
      assert.equal(
        series.latest?.value ?? null,
        value,
        `${city.code}'s ${column} chart ends off it`
      );
      assert.equal(series.to, period, `${city.code}'s ${column} chart ends in another quarter`);
    }
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

test("a city's two changes are drawable only when they describe one quarter", () => {
  // The table prints the two figures in two columns whatever their quarters
  // are, because each column carries its own and a cell behind its column says
  // so. A picture cannot: two marks on one track assert one quarter, and the
  // two НСИ workbooks are released separately — so the wiring decides, and a
  // template cannot make the claim on its own.
  const nsi = read("nsi_housing");
  if (!nsi) return; // no refresh in this checkout

  const cities = marketCities(nsi);
  for (const city of cities.cities) {
    assert.equal(
      city.comparable,
      Boolean(city.pricePeriod) && city.pricePeriod === city.dealsPeriod,
      `${city.code} is marked comparable against ${city.pricePeriod} and ${city.dealsPeriod}`
    );
  }

  // The shared scale covers every mark the column can draw and contains zero,
  // which is the whole reading: which side of it each figure sits on.
  const drawn = cities.cities.flatMap((c) => [c.pricePct, c.dealsPct]).filter(Number.isFinite);
  assert.ok(drawn.length >= 6, `${drawn.length} city figures to place`);
  assert.ok(cities.changeScale.min <= Math.min(...drawn));
  assert.ok(cities.changeScale.max >= Math.max(...drawn));
  assert.ok(cities.changeScale.min <= 0 && cities.changeScale.max >= 0);

  // A city whose two files are a quarter apart is not comparable, whichever
  // side is behind. Built from the payload's own rows so the case is real
  // rather than invented, and asserted in both directions.
  const one = nsi.city_price_index_yoy.cities[0];
  const behind = {
    ...nsi,
    city_deals_yoy: {
      ...nsi.city_deals_yoy,
      cities: nsi.city_deals_yoy.cities.map((c) =>
        c.code === one.code ? { ...c, ref_period: "1999-Q1" } : c
      ),
    },
  };
  const parted = marketCities(behind).cities.find((c) => c.code === one.code);
  assert.equal(parted.comparable, false, "a city whose two workbooks disagree is still drawn");
  assert.equal(parted.pricePct, one.value_pct, "the figures themselves stop being published");
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
  // **Which unit a row prints in and which section it opens are per-row facts,
  // and neither reads wrong on its own.** Two rows' formats exchanged prints
  // «×0,1» where a share belongs and «+2,7%» where a multiple does — both
  // formatters succeed, both figures are the published one, and the sentence
  // the row makes is false. Two hrefs exchanged sends a reader checking the
  // volume row to the price section, where the working for the figure they
  // clicked is not. The rule below catches a row printed in a unit that needs a
  // reference beside it; only the table catches a unit that is merely another
  // row's.
  assert.deepEqual(
    strip.rows.map((r) => [r.key, r.format, r.href]),
    [
      ["dealsChange", "signedPct", "#volume"],
      ["index", "times", "#prices"],
      ["indexReal", "times", "#prices"],
      ["rate", "signedPct", "#prices"],
      ["overburden", "pct", "#ratio"],
    ]
  );

  // **THE COUNT IS PLACED BY ITS YEAR-ON-YEAR CHANGE AND NEVER BY ITS LEVEL.**
  // A level of this series carries the calendar: the record's highest readings
  // are all fourth quarters, so a first-quarter count sits near the bottom of
  // that record whatever the market is doing, and a dot near the left-hand end
  // reports the month of the year as though it were news. Held as a property of
  // the published data rather than as a spelling — with the level row gone,
  // what is asserted is that the level and the change would still have placed
  // differently, which is the fact that justifies the removal and the fact that
  // stops the row coming back.
  const counts = Object.entries(market.deals.series_by_period)
    .sort()
    .map(([, r]) => r.total)
    .filter(Number.isFinite);
  const levelAt =
    (counts[counts.length - 1] - Math.min(...counts)) / (Math.max(...counts) - Math.min(...counts));
  const change = strip.rows.find((r) => r.key === "dealsChange");
  assert.equal(
    change.sourceUrl,
    market.deals.source_url,
    "the count's change row cites a publisher other than the block it is computed from"
  );
  assert.ok(
    Math.abs(levelAt - change.at) > 0.05,
    `the count's level places at ${levelAt.toFixed(2)} and its year-on-year change at ` +
      `${change.at.toFixed(2)} — within a rounding of each other. The level row was dropped ` +
      "because the two say different things and the level's is the calendar; if they now agree, " +
      "the reason has gone and the removal should be revisited rather than left standing."
  );
  assert.ok(
    change.low < 0 && change.high > 0,
    `the change row spans ${change.low} to ${change.high} and does not cross zero — a signed ` +
      "series whose record is one-sided is not the year-on-year change of a count that has fallen."
  );

  // **A series whose value does not read on its own does not get a row**, and
  // that rule is what the strip's shape rests on. Every figure in the «сега»
  // column here stands alone — a count, «×2,7», «+14,8%», «6,9%» — so the
  // position beside it adds a second fact rather than needing one. An index
  // defined against a reference the row has nowhere to print would read as a
  // verdict instead: a dot at one end of a labelled line, with the level it is
  // measured from nowhere on it.
  for (const row of strip.rows) {
    assert.ok(
      ["count", "times", "signedPct", "pct"].includes(row.format),
      `${row.key} is drawn in ${row.format}, which is not one of the units a strip row can ` +
        "print without a reference beside it"
    );
  }

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

test("the borrowed share joins two publishers in one currency, over whole years", () => {
  // The one figure on the page built from four payloads, and every seam in it
  // is a wrong NUMBER rather than a wrong picture: Eurostat's value cube is in
  // euro and both lenders are in millions of them, ЕЦБ's lending is «in the
  // currency of the period» so its leg before the euro is leva, and a year
  // either publisher has not finished is a share short by the months it lacks.
  //
  // Recomputed here from the raw cubes rather than through the same helpers, so
  // a wrong argument in the wiring cannot agree with itself.
  const market = read("house_market");
  const credit = read("credit");
  const mortgage = read("mortgage");
  const payroll = read("payroll");
  if (!market || !credit || !mortgage || !payroll) return; // no refresh in this checkout

  const borrowed = marketBorrowedShare(market, credit, mortgage, payroll);
  const paidEurM = (year) =>
    ["Q1", "Q2", "Q3", "Q4"].reduce(
      (sum, q) => sum + market.value.series_by_period[`${year}-${q}`].total,
      0
    ) / 1e6;

  const housing = credit.outstanding.volume_by_period.housing;
  for (const point of borrowed.net.points) {
    const grew = housing[`${point.period}-12`] - housing[`${Number(point.period) - 1}-12`];
    assert.ok(
      near(point.value, (grew / paidEurM(point.period)) * 100, 1e-9),
      `${point.period}: ${point.value} is not БНБ's year over Eurostat's`
    );
  }

  const volume = mortgage.new_business.monthly_volume.series_by_period;
  const split = mortgage.new_business_split.renegotiated_share_by_period;
  const months = (year) =>
    Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  // The changeover, spelled out here rather than imported: a test that took the
  // month from the module under test would pass whatever month that module had.
  const lent = (year, convert) =>
    months(year).reduce((sum, period) => {
      const eur =
        convert && period < "2026-01" ? volume[period] / payroll.bgn_per_eur : volume[period];
      return sum + eur * (1 - split[period] / 100);
    }, 0);

  for (const point of borrowed.gross.points) {
    const year = point.period;
    assert.ok(
      near(point.value, (lent(year, true) / paidEurM(year)) * 100, 1e-9),
      `${year}: ${point.value} is not what ЕЦБ lent, in euro, against Eurostat's turnover`
    );
    // …and not the figure the same sum reaches with the leva leg left alone,
    // which is what a conversion quietly dropped would put on the page. Asserted
    // only over the years that HAVE a leva leg: once the whole record is euro
    // the two sums are the same and there is nothing left to get wrong.
    if (months(year).some((period) => period < "2026-01")) {
      assert.ok(
        Math.abs(point.value - (lent(year, false) / paidEurM(year)) * 100) > 1,
        `${year} is drawn at the figure the pre-euro leg reaches unconverted`
      );
    }
  }

  // **The two lines share one x-axis, so where the shorter one starts inside it
  // has to be a fact rather than a guess.** Placed at its own indices it is
  // stretched across the whole box and every reading lands under a year it does
  // not describe — a picture that is wrong while every digit in it is published.
  for (const [name, series] of [
    ["net", borrowed.net],
    ["gross", borrowed.gross],
  ]) {
    assert.equal(series.span, borrowed.axis.length, `${name} is placed on a different axis`);
    assert.deepEqual(
      series.points.map((p) => p.period),
      borrowed.axis.slice(series.offset, series.offset + series.points.length),
      `${name}'s readings do not sit on the years its offset claims`
    );
  }
});
