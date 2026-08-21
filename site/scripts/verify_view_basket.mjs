#!/usr/bin/env node
/**
 * The published HICP divisions the basket is built from.
 *
 * Three wrong numbers live here, and each of them survives a correct formula.
 * Rounding the seeded weights to whole percents makes the default basket sum
 * to something other than 100, and the first figure a visitor reads then
 * matches neither Eurostat's rate nor the official-weight basket. A verify
 * link pinned to one category points every row at somebody else's extract, so
 * a reader checking the number is shown a different one. And a sign slip in
 * the fastest-rising card advertises the SLOWEST-rising division as the
 * fastest, which reads as plausible and is exactly backwards.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  officialBasketWeights,
  verifyUrl,
  basketSumQuery,
  fastestRisingDivision,
  divisionRateState,
} from "../src/lib/view/basket.js";
import { officialInflation } from "../src/lib/mirror.js";
import { published } from "./published-payload.mjs";
import { near } from "./near.mjs";

const read = published;

// ---------------------------------------------------------------------------
// The basket the sliders start from
// ---------------------------------------------------------------------------

test("officialBasketWeights seeds the sliders with the EXACT published weights", () => {
  // Rounding each division to a whole percent made the default basket sum to
  // 97, so the first number a visitor read (5.30%) matched neither Eurostat's
  // all-items rate (5.20%) nor the official-weight basket (5.36%) — a third
  // figure from nowhere. The seed must be exact.
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  const w = officialBasketWeights(cats);
  assert.deepEqual(
    w,
    cats.map((c) => c.weight_pct)
  );
  assert.ok(
    Math.abs(w.reduce((s, x) => s + x, 0) - 100) < 0.05,
    `default basket sums to ${w.reduce((s, x) => s + x, 0)}, not ~100`
  );
  // Seeded this way, the default view IS the average basket: the big number
  // and the comparison bar must agree to the last decimal on first paint.
  const seeded =
    cats.reduce((s, c, i) => s + w[i] * c.annual_rate_pct, 0) / w.reduce((s, x) => s + x, 0);
  assert.ok(
    near(seeded, officialInflation(cats, "y1"), 1e-9),
    `default π ${seeded} !== official basket ${officialInflation(cats, "y1")}`
  );
});

test("officialBasketWeights degrades to an empty basket, not a crash", () => {
  assert.deepEqual(officialBasketWeights(null), []);
  assert.deepEqual(officialBasketWeights([]), []);
});

// ---------------------------------------------------------------------------
// Provenance links
// ---------------------------------------------------------------------------

const ROW = {
  cp_code: "CP07",
  api_url: "https://ec.europa.eu/…/prc_hicp_minr?geo=BG&coicop18=CP07&unit=RCH_A&lastTimePeriod=12",
  api_url_index:
    "https://ec.europa.eu/…/prc_hicp_minr?geo=BG&coicop18=CP07&unit=I15&sinceTimePeriod=2020-01",
};

test("verifyUrl points at the extract that CONTAINS the number beside it", () => {
  // At "last 12 months" the figure on screen is the published RCH_A rate; at a
  // year anchor it is derived from the I15 index. Linking to the index cube
  // while showing a rate means the number cannot be found.
  assert.match(verifyUrl(ROW, "y1"), /unit=RCH_A/);
  assert.match(verifyUrl(ROW, 2020), /unit=I15/);
  assert.match(verifyUrl(ROW, "2024"), /unit=I15/);
});

test("verifyUrl describes the row it was handed, never a fixed category", () => {
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  for (const c of cats) {
    assert.ok(
      verifyUrl(c, "y1").includes(`coicop18=${c.cp_code}`),
      `${c.cp_code}: rate link points elsewhere`
    );
    assert.ok(
      verifyUrl(c, 2020).includes(`coicop18=${c.cp_code}`),
      `${c.cp_code}: index link points elsewhere`
    );
    for (const g of c.groups) {
      assert.ok(verifyUrl(g, "y1").includes(`coicop18=${g.cp_code}`));
      assert.ok(verifyUrl(g, 2020).includes(`coicop18=${g.cp_code}`));
    }
  }
  // 13 divisions + 46 groups, each with two anchors — all distinct.
  const all = new Set(
    cats.flatMap((c) => [c, ...c.groups]).flatMap((r) => [verifyUrl(r, "y1"), verifyUrl(r, 2020)])
  );
  assert.equal(all.size, 118, "every published row must have its own two links");
});

test("verifyUrl falls back to the dataset table rather than an empty href", () => {
  assert.match(verifyUrl({}, "y1"), /^https:\/\//);
  assert.match(verifyUrl(null, 2020), /^https:\/\//);
});

test("basketSumQuery asks for every division the sum was taken over", () => {
  // The figure this link sits under is Σ(w·r) across all of them, and `/how/`
  // prints it beside Eurostat's own all-items rate under a caption saying the
  // sum is ours. A disclosure that cannot be re-run is a licence discharged
  // and a sceptic ignored, and a query missing one division returns a set the
  // page's figure cannot be rebuilt from — which reads exactly like a link
  // that works.
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  const url = basketSumQuery(cats);
  for (const c of cats) {
    assert.ok(url.includes(`coicop18=${c.cp_code}`), `${c.cp_code} is not in the sum's query`);
  }
  assert.equal(
    (url.match(/coicop18=/g) ?? []).length,
    cats.length,
    "the query names a different number of divisions than the sum was taken over"
  );
  // The rate cube at the rate unit, not the index one: the figure over it is a
  // twelve-month rate, and `unit=I15` returns the index instead — the same
  // wrong-extract failure `verifyUrl` carries its anchor for.
  assert.match(url, /prc_hicp_minr/);
  assert.match(url, /unit=RCH_A/);
  assert.match(url, /geo=BG/);
});

test("basketSumQuery takes the endpoint from the payload, never from this repo", () => {
  // Everything but the division list has to come off the row, so a pipeline
  // that retargets the cube, the geography, the unit or the window moves this
  // link with it. Built from a base written here, the link keeps returning
  // yesterday's shape while the page shows today's figure.
  const url = basketSumQuery([
    { cp_code: "CP01", api_url: "https://example.test/x?geo=XX&coicop18=CP01&unit=Q" },
    { cp_code: "CP02" },
  ]);
  assert.equal(url, "https://example.test/x?geo=XX&coicop18=CP01&unit=Q&coicop18=CP02");
});

test("basketSumQuery returns nothing rather than a link to nowhere", () => {
  // The caller renders no «провери» at all on an empty string. A fallback URL
  // here would be a link that does not reproduce the figure above it, which is
  // worse than the absence on the one page whose claim is that each one does.
  assert.equal(basketSumQuery([]), "");
  assert.equal(basketSumQuery(null), "");
  assert.equal(basketSumQuery([{ cp_code: "CP01" }]), "");
  assert.equal(basketSumQuery([{ cp_code: "CP01", api_url: "javascript:alert(1)" }]), "");
});

// ---------------------------------------------------------------------------
// Strip cards
// ---------------------------------------------------------------------------

test("fastestRisingDivision picks the HIGHEST rate", () => {
  // Sorting the wrong way advertises the slowest-rising division as the
  // fastest, which reads as entirely plausible and is exactly backwards.
  const cats = [
    { cp_code: "A", annual_rate_pct: 2.3 },
    { cp_code: "B", annual_rate_pct: 11.0 },
    { cp_code: "C", annual_rate_pct: 0.0 },
  ];
  assert.equal(fastestRisingDivision(cats).cp_code, "B");
  assert.equal(fastestRisingDivision([]), null);
  assert.equal(fastestRisingDivision(null), null);
});

test("fastestRisingDivision names the top of the shipped basket, whichever it is", () => {
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  const f = fastestRisingDivision(cats);
  // No division is named here. Which one leads is upstream's to set and it
  // changes by tenths - CP13 at 9.5% over transport at 9.4% - so a code pinned
  // here turns a refresh that is only a refresh red, and teaches the next
  // reader that the fix is to edit the expectation until it matches.
  assert.ok(cats.includes(f), "the card must name a division out of the payload");
  assert.ok(
    cats.every((c) => c.annual_rate_pct <= f.annual_rate_pct),
    "no division may out-rise the one we call fastest"
  );
});

test("fastestRisingDivision does not mutate the caller's array", () => {
  const cats = [{ annual_rate_pct: 1 }, { annual_rate_pct: 9 }, { annual_rate_pct: 5 }];
  const before = cats.map((c) => c.annual_rate_pct);
  fastestRisingDivision(cats);
  assert.deepEqual(
    cats.map((c) => c.annual_rate_pct),
    before
  );
});

test("divisionRateState follows the sign, including where every division fell", () => {
  // The failure it exists for: `fastestRisingDivision` returns a MAXIMUM and
  // promises nothing about its sign, so in a broad price fall the card's own
  // comment says the rate is negative while the label calls it a rise.
  assert.equal(divisionRateState(9.4), "up");
  assert.equal(divisionRateState(-3.2), "down");
  assert.equal(divisionRateState(0), "flat");

  // Inverting the whole basket must invert every verdict. A rule over the pair
  // rather than two assertions: a state function that got the sign right in one
  // direction and not the other is the defect, not a typo.
  for (const r of [0.4, 2.5, 9.4, 41]) {
    assert.equal(divisionRateState(r), "up", `+${r} is not a rise`);
    assert.equal(divisionRateState(-r), "down", `-${r} is not a fall`);
  }
});

test("divisionRateState refuses a direction the printed figure does not show", () => {
  // The dead band is the printed precision. Rates draw at one decimal, so
  // ±0,04 renders as «0,0%» and a verb beside it names a direction the reader
  // cannot see — the rule `pocketVerdictState` keeps at ±1 pp.
  for (const r of [0.04, -0.04, 0.0001, -0.0001, 0]) {
    assert.equal(
      divisionRateState(r),
      "flat",
      `${r} pp is inside the band and must not get a verb`
    );
  }
  // And the edges of the band are outside it, so nothing falls between states.
  assert.equal(divisionRateState(0.05), "up");
  assert.equal(divisionRateState(-0.05), "down");
});

test("divisionRateState says nothing where there is no rate", () => {
  // A division with no published rate must not be handed the flat sentence:
  // «цената ѝ не се е променила» is a claim, and absence is not a measurement.
  for (const bad of [null, undefined, NaN, Infinity, -Infinity, "3.1"]) {
    assert.equal(divisionRateState(bad), "unsaid", `${bad} produced a verdict`);
  }
});
