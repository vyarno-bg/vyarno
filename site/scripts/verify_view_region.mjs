#!/usr/bin/env node
/**
 * What the site publishes about the област a reader picked.
 *
 * The picker is the one control on the page whose contents nothing else
 * decides, and its failure is silent on both sides. «София» and
 * «София(столица)» are НСИ's own labels for Софийска област and for the
 * capital, they sort adjacent, and a reader who takes the wrong one is
 * compared against a wage 32% lower and told имот.bg publish no price where
 * they live — both are real области with real figures, so nothing downstream
 * can catch it. An област missing from the list is a reader who simply cannot
 * pick their own, with nothing on screen saying why. And the quarter beside
 * the figure is the one НСИ published, selected rather than computed.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  regionQuarter,
  regionOptions,
  regionDisplayName,
  REGION_RENAMES,
  cityCoverage,
  CITY_PRICED,
  CITY_UNREAD,
  CITY_NO_PAGE,
  CITY_UNKNOWN,
  SOFIA_CITY_CODE,
} from "../src/lib/view/region.js";
import { HOME } from "../src/lib/content.js";
import { published } from "./published-payload.mjs";

const read = published;

// Synthetic quarters for the shape tests below, positioned from the clock
// rather than written down. НСИ publish one sheet per year and the payload's
// newest quarter moves with the calendar, so a fixture pinned to literal years
// stops resembling the live file the moment the year turns — and an assertion
// built on it stops testing what its name claims. Nothing here asserts a
// particular year; it asserts that the newest key wins.
const THIS_YEAR = new Date().getUTCFullYear();
const Q_NOW = `${THIS_YEAR}-Q1`;
const Q_PREV = `${THIS_YEAR - 1}-Q4`;

/** A `region_salary.json`-shaped payload carrying one област. */
function oneRegion(series, { headline = null, isPreliminary = undefined } = {}) {
  const row = { code: "sofiya", en_name: "Sofia cap.", bg_name: "София(столица)" };
  if (headline !== null) row.value_eur = headline;
  return {
    ...(headline === null ? {} : { ref_period: Q_NOW }),
    ...(isPreliminary === undefined ? {} : { is_preliminary: isPreliminary }),
    regions: [{ ...row, series_by_period: series }],
  };
}

test("the picker offers every област, sorted in the reader's own language", () => {
  // The one new control on the page, and nothing else decides what is in it.
  // A row dropped here is an област a reader simply cannot pick — they get the
  // national figures and no wage comparator, with nothing on screen saying why.
  const regions = read("region_salary");
  const prices = read("city_price");
  if (!regions || !prices) return;

  for (const lang of ["bg", "en"]) {
    const options = regionOptions(regions, prices, lang);
    assert.equal(options.length, regions.regions.length, `${lang}: an област is missing`);
    assert.equal(new Set(options.map((o) => o.code)).size, options.length, `${lang}: duplicate`);
    assert.ok(
      options.every((o) => o.name),
      `${lang}: an option has no name, which renders as a blank line rather than a fallback`
    );
    // Sorted with that language's collator. A plain `<` puts Cyrillic in code
    // order, which is not alphabetical order in Bulgarian.
    const collator = new Intl.Collator(lang);
    const sorted = [...options].sort((a, b) => collator.compare(a.name, b.name));
    assert.deepEqual(
      options.map((o) => o.name),
      sorted.map((o) => o.name),
      `${lang}: the options are not in the reader's own alphabetical order`
    );
  }
});

test("no two options in the picker read the same", () => {
  // **The failure: «София» and «София(столица)» sort adjacent.** НСИ's own
  // labels for Софийска област and for the capital are the second and the
  // first of those, and a reader who takes the wrong one is compared against a
  // wage 32% lower and told имот.bg publish no price where they live. Nothing
  // downstream can catch it — both are real области with real figures.
  //
  // The two are renamed by a table of two, and this is the rule over the whole
  // collection that a table needs beside it. Three parts, and each fails on a
  // different upstream move:
  //
  //   1. every name non-empty and unique — the mechanical failures;
  //   2. every key of the table still matches a row НСИ publish, so a rename
  //      upstream stops the rewrite LOUDLY rather than letting «София» render
  //      for the област next to the capital;
  //   3. no name the table did not write is a whole-word prefix of another, so
  //      an НСИ split the table does not cover — a «Пловдив(град)» row beside
  //      «Пловдив» — fails here instead of shipping.
  //
  // The pair the table wrote is exempt from (3) and has to be: «Sofia oblast»
  // begins with «Sofia», deliberately, and there is no English name for
  // Софийска област that does not.
  const regions = read("region_salary");
  const prices = read("city_price");
  if (!regions || !prices) return;

  for (const lang of ["bg", "en"]) {
    const options = regionOptions(regions, prices, lang);
    const names = options.map((o) => o.name);
    assert.ok(
      names.every((n) => n),
      `${lang}: an option has no name`
    );
    assert.equal(new Set(names).size, names.length, `${lang}: two options carry the same name`);

    const raw = regions.regions.map((r) => (lang === "bg" ? r.bg_name : r.en_name));
    for (const key of Object.keys(REGION_RENAMES[lang])) {
      assert.ok(
        raw.includes(key),
        `${lang}: the rename table names "${key}" and НСИ publish no such row — ` +
          `the rewrite has stopped applying and one of the two Софии is now ` +
          `printing under a name that belongs to the other`
      );
    }

    const written = new Set(Object.values(REGION_RENAMES[lang]));
    for (const a of names) {
      for (const b of names) {
        if (a === b || (written.has(a) && written.has(b))) continue;
        assert.ok(
          !b.startsWith(`${a} `),
          `${lang}: "${a}" cannot be told from "${b}" at a glance in a 28-item list`
        );
      }
    }
  }

  // The two the table covers, and what the picker actually prints for them.
  // «София (столица)» and «София (област)» are both administrative vocabulary
  // in a control asking somebody where they live.
  assert.equal(regionDisplayName("София(столица)", "bg"), "София");
  assert.equal(regionDisplayName("София", "bg"), "Софийска област");
  assert.equal(regionDisplayName("Sofia cap.", "en"), "Sofia");
  assert.equal(regionDisplayName("Sofia", "en"), "Sofia oblast");
  // Everything else is НСИ's own label, with the bracket spaced the way
  // Bulgarian spaces it — which is also what lets part (3) above see a split.
  assert.equal(regionDisplayName("Русе", "bg"), "Русе");
  assert.equal(regionDisplayName("Пловдив", "bg"), "Пловдив");
  assert.equal(regionDisplayName("Пловдив(град)", "bg"), "Пловдив (град)");
  assert.equal(regionDisplayName("", "bg"), "");
});

test("a city with no price is told apart from a city nobody read yet", () => {
  // **Only one of the two may be stated in имот.bg's name.** «имот.bg не
  // публикува цени за Варна» is false — they publish Варна's — and a single
  // has-it/has-it-not flag prints exactly that for every city a refresh
  // missed, in the wording borrowed from the one област it is true of.
  // `city_price.json#city_pages` is what separates them.
  const prices = read("city_price");
  const regions = read("region_salary");
  if (!prices || !regions) return;

  assert.ok(Array.isArray(prices.city_pages), "city_price.json publishes no coverage list");
  assert.equal(cityCoverage(prices, SOFIA_CITY_CODE), CITY_PRICED);
  // Софийска област is the one имот.bg serve no page for. Named by its
  // absence from their list rather than by a code written down here.
  const noPage = regions.regions.map((r) => r.code).filter((c) => !prices.city_pages.includes(c));
  assert.deepEqual(
    noPage.map((c) => cityCoverage(prices, c)),
    noPage.map(() => CITY_NO_PAGE)
  );
  assert.equal(noPage.length, 1, "the count of области имот.bg publish no city for moved");
  // Every code they DO serve and this run did not read is `unread`, never
  // `nopage` — that is the whole point of the two lists.
  for (const code of prices.city_pages) {
    const expected = prices.cities.some((c) => c.code === code) ? CITY_PRICED : CITY_UNREAD;
    assert.equal(cityCoverage(prices, code), expected, code);
  }
  // And the picker carries the same three answers, so an option and the card
  // it opens cannot disagree.
  for (const o of regionOptions(regions, prices, "bg")) {
    assert.equal(o.coverage, cityCoverage(prices, o.code), o.code);
  }
});

test("a payload that never arrived says nothing in имот.bg's name", () => {
  // The same objection as the test above, one layer out. Both `unread` and
  // `nopage` are read off `city_pages`, and a missing list is an EMPTY list to
  // `.includes` — so a 404 on `city_price.json` answered `nopage` for every
  // област and the housing card told all twenty-eight «имот.bg публикува цени
  // по градове, а нито един град от тази област не е сред тях», over a list of
  // twenty-seven cities имот.bg do publish. A failed fetch of ours is not a
  // statement about a publisher.
  const regions = read("region_salary");
  const prices = read("city_price");
  if (!regions || !prices) return;

  // Варна is the case that names itself: имот.bg serve it, this is their own
  // list saying so, and it is the город the wording is false about.
  assert.ok(prices.city_pages.includes("varna"), "имот.bg's list no longer carries Варна");

  // Every shape a payload that cannot answer arrives in — a 404 (null), a body
  // that parsed to nothing, and an envelope whose coverage list did not survive.
  for (const absent of [null, undefined, {}, { cities: [] }, { city_pages: [] }]) {
    assert.equal(cityCoverage(absent, "varna"), CITY_UNKNOWN, JSON.stringify(absent));
    assert.equal(cityCoverage(absent, SOFIA_CITY_CODE), CITY_UNKNOWN, JSON.stringify(absent));
    // The picker reads it through the same predicate, so no option carries a
    // coverage the card it opens would contradict.
    const options = regionOptions(regions, absent, "bg");
    assert.ok(options.length > 0, "the wage payload still fills the picker");
    for (const o of options) {
      assert.equal(o.coverage, CITY_UNKNOWN, o.code);
      assert.equal(o.coverage, cityCoverage(absent, o.code), o.code);
    }
  }

  // And the three real answers are untouched: a payload that CAN answer still
  // tells them apart, or this guard would have bought its truth by muting them.
  assert.equal(cityCoverage(prices, "varna"), CITY_PRICED);
  const noPage = regions.regions.map((r) => r.code).filter((c) => !prices.city_pages.includes(c));
  assert.deepEqual(
    noPage.map((c) => cityCoverage(prices, c)),
    noPage.map(() => CITY_NO_PAGE)
  );
});

test("regionQuarter reads НСИ's published quarter and computes nothing", () => {
  // The property docs/legal.md §НСИ turns on, asserted on what actually ships,
  // and asserted for EVERY област rather than for the one the page happens to
  // start on — twenty-seven of the twenty-eight rows are new, and a selection
  // bug that only bites outside Sofia is exactly the class this change adds.
  // An averaging step reintroduced here would move no number a reader could
  // check against anything, so nothing but this would catch it.
  const payload = read("region_salary");
  if (!payload) return;
  for (const row of payload.regions) {
    const q = regionQuarter(payload, row.code);
    assert.match(q.refPeriod, /^\d{4}-Q[1-4]$/, row.code);
    // The headline is a cell in that област's own series, not a function of
    // several and not another област's.
    assert.equal(q.value, row.series_by_period[q.refPeriod], row.code);
    assert.equal(q.value, row.value_eur, row.code);
    // And it is the NEWEST such cell — an off-by-one here would quote last
    // quarter's level indefinitely, which no gate downstream would notice.
    const newest = Object.keys(row.series_by_period)
      .filter((k) => /^\d{4}-Q[1-4]$/.test(k))
      .sort()
      .at(-1);
    assert.equal(q.refPeriod, newest, row.code);
  }
});

test("regionQuarter answers for the област asked for, and for no other", () => {
  // The failure this change makes possible, and the one nothing else would
  // see: a lookup that falls back to the first row, the biggest област or
  // Sofia renders a real НСИ wage under the wrong place name. Every figure
  // stays plausible — they are all Bulgarian wages — so a reader in Видин
  // would be compared against Sofia and told so in a caption naming Видин.
  const payload = read("region_salary");
  if (!payload) return;
  const seen = new Set();
  for (const row of payload.regions) {
    const q = regionQuarter(payload, row.code);
    assert.equal(q.bgName, row.bg_name, row.code);
    seen.add(q.value);
  }
  assert.ok(seen.size > 1, "every област resolved to one figure — the lookup is not selecting");
  // An unknown code is the empty state, never somebody else's wage.
  for (const code of ["", null, undefined, "atlantis"]) {
    assert.deepEqual(regionQuarter(payload, code), {
      value: 0,
      refPeriod: "",
      isPreliminary: false,
      bgName: "",
      enName: "",
    });
  }
});

test("regionQuarter prefers the payload headline, and falls back to the newest key", () => {
  // Two shapes reach this function: the live payload, which carries `value_eur`
  // and `ref_period`, and the offline sentinel in content.js. Both must land on
  // the same quarter, because the sentinel is what a reader sees for the first
  // few hundred milliseconds and a mismatch would flash a different number.
  const series = { [Q_PREV]: 1859, [Q_NOW]: 1915 };
  assert.deepEqual(
    regionQuarter(oneRegion(series, { headline: 1915, isPreliminary: true }), SOFIA_CITY_CODE),
    {
      value: 1915,
      refPeriod: Q_NOW,
      isPreliminary: true,
      bgName: "София(столица)",
      enName: "Sofia cap.",
    }
  );

  assert.deepEqual(regionQuarter(oneRegion(series), SOFIA_CITY_CODE), {
    value: 1915,
    refPeriod: Q_NOW,
    isPreliminary: false,
    bgName: "София(столица)",
    enName: "Sofia cap.",
  });
});

test("the offline sentinel goes through the same selection as the live payload", () => {
  // It is the same shape on purpose, so one implementation serves both and the
  // pre-load figure cannot drift from the loaded one.
  const q = regionQuarter(HOME.regionSalaryFallback, SOFIA_CITY_CODE);
  assert.ok(q.value > 0);
  assert.match(q.refPeriod, /^\d{4}-Q[1-4]$/);
  // And it carries Sofia-city alone — any other област falls back to the empty
  // state rather than to a frozen number nobody refreshes.
  assert.equal(regionQuarter(HOME.regionSalaryFallback, "varna").value, 0);
});

test("regionQuarter carries НСИ's preliminary marker down both paths", () => {
  // The marker is what the card says beside the figure, and it has to come off
  // the same selection the figure did. Absent it, the strip shows the wage as
  // settled while the sector card three rows up marks the same publisher's same
  // quarter «(предварителни данни)» — one release, two claims about it.
  //
  // Both paths, because the headline path and the series fallback are separate
  // returns and only the first one is exercised by a live payload: a flag
  // wired into that one alone passes every test written against today's file
  // and drops the marker on the older envelope the fallback exists for.
  const flagged = { [Q_NOW]: 1915 };
  assert.equal(
    regionQuarter(oneRegion(flagged, { headline: 1915, isPreliminary: true }), SOFIA_CITY_CODE)
      .isPreliminary,
    true
  );
  assert.equal(
    regionQuarter(oneRegion(flagged, { isPreliminary: true }), SOFIA_CITY_CODE).isPreliminary,
    true
  );
  // A publisher that draws no such distinction is not the same claim as one
  // who marked the quarter final, but the card can only stay silent for both.
  assert.equal(regionQuarter(oneRegion(flagged), SOFIA_CITY_CODE).isPreliminary, false);
});

test("regionQuarter ignores a monthly key rather than treating it as a quarter", () => {
  // A payload written by an older envelope carries "YYYY-MM" keys. Selecting
  // one would quote a single month as the quarterly level — and March runs
  // ~7.6% above its own quarter on the published series, which propagates to
  // every rung of the ladder.
  const monthly = oneRegion({
    [`${THIS_YEAR}-01`]: 1865,
    [`${THIS_YEAR}-02`]: 1818,
    [`${THIS_YEAR}-03`]: 2061,
  });
  const q = regionQuarter(monthly, SOFIA_CITY_CODE);
  assert.equal(q.value, 0);
  assert.equal(q.refPeriod, "");
});

test("regionQuarter returns zeros rather than NaN when the payload is missing", () => {
  for (const input of [null, undefined, {}, { regions: [] }, oneRegion({})]) {
    const q = regionQuarter(input, SOFIA_CITY_CODE);
    assert.equal(q.value, 0);
    assert.equal(q.refPeriod, "");
  }
});
