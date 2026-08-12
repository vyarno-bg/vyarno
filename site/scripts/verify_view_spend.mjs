#!/usr/bin/env node
/**
 * How much of a reader's money the price rise is charged against.
 *
 * The € column beside every division, the leftover row and the exposed-spend
 * figure are all carved out of one base, and the whole class of failure here
 * is carving them out of the wrong one. Point the base at the whole take-home
 * in euro mode and every per-division figure inflates by the ratio between
 * what was typed and what was earned — thirteen numbers a reader never entered,
 * all of them inside the band a reviewer would call plausible. Housing is
 * subtracted before any of it, because rent and a mortgage payment are money
 * already committed.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { headlineRate } from "../src/lib/view/results.js";
import {
  housingCarveOut,
  basketBudget,
  clampSpendShare,
  exposedSpend,
  leftoverIfHeldAsCash,
} from "../src/lib/view/spend.js";
import { published } from "./published-payload.mjs";
import { near } from "./near.mjs";

const read = published;

// ---------------------------------------------------------------------------
// Housing carve-out
// ---------------------------------------------------------------------------

test("housingCarveOut subtracts rent AND the mortgage — a person can carry both", () => {
  const r = housingCarveOut({ salary: 2000, homeOn: true, monthlyMortgage: 600, rent: 300 });
  assert.equal(r.housingCost, 900);
  assert.equal(r.spendable, 1100);
});

test("housingCarveOut ignores the mortgage when the home block is off", () => {
  const r = housingCarveOut({ salary: 2000, homeOn: false, monthlyMortgage: 600, rent: 300 });
  assert.equal(r.housingCost, 300);
  assert.equal(r.spendable, 1700);
});

test("housingCarveOut never returns a negative spendable", () => {
  const r = housingCarveOut({ salary: 500, homeOn: true, monthlyMortgage: 900, rent: 200 });
  assert.equal(r.spendable, 0);
});

// ---------------------------------------------------------------------------
// The basket's budget — what was placed, and what was not
//
// The wrong number this section exists to prevent: the € column, and every
// figure carved out of it, being scaled to the whole spendable amount when the
// reader has said they spend less — whether they said it by typing thirteen
// euro amounts that fall short of their pay, or by stating one share of it.
// Point `spendBase` back at `spendable` in euro mode and the first four cases
// go red; drop the share out of the calculation and the four after them do.
// ---------------------------------------------------------------------------

test("in € mode the spend base is what was TYPED, not the whole budget", () => {
  // €1,000 of a €1,250 budget: the thirteen euro figures must be the reader's
  // own, not their basket inflated by 25% to swallow the rest.
  const b = basketBudget({ spendMode: "eur", amounts: [600, 300, 100], spendable: 1250 });
  assert.equal(b.entered, 1000);
  assert.equal(b.spendBase, 1000, "the € column was rescaled to the full budget");
  assert.equal(b.leftover, 250);
  assert.equal(b.leftoverPerYear, 3000);
  assert.equal(b.leftoverPct, 20);
  assert.equal(b.hasLeftover, true);
  assert.equal(b.over, 0);
});

test("the per-division € figures are exactly what was typed", () => {
  // The template computes `spendBase × amount / Σamount`. With spendBase === Σ
  // that is the identity, which is the whole point: what you typed is what you
  // are shown. The old wiring turned a typed €600 into €750.
  const amounts = [600, 300, 100];
  const b = basketBudget({ spendMode: "eur", amounts, spendable: 1250 });
  amounts.forEach((a, i) => {
    assert.ok(near((b.spendBase * amounts[i]) / b.entered, a), `row ${i} was rescaled`);
  });
});

test("in share mode a caller who states no share gets the whole spendable amount", () => {
  // Shares describe how a pot divides and carry no size, so the app has to
  // assume one — and every assumption below the whole spendable amount shrinks
  // the reader's headline € figure without their having claimed anything
  // (docs/principles.md P7). The parameter is optional for the same reason:
  // absent means unclaimed means all of it. A basket of 22/6/4 still does not
  // mean "€32 of my €1,250" — the leftover comes from the claim, never from
  // what the thirteen shares happen to add to.
  const b = basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable: 1250 });
  assert.equal(b.spendBase, 1250);
  assert.equal(b.leftover, 0);
  assert.equal(b.leftoverPerYear, 0);
  assert.equal(b.hasLeftover, false);
  // …and stating 100 explicitly is the same reader, not a different one.
  assert.deepEqual(
    basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable: 1250, spendSharePct: 100 }),
    b
  );
});

test("a stated spend share carves the € column out of that share and nothing else", () => {
  // €1,250 after housing, "I spend about 80% of it": the thirteen € figures and
  // everything downstream of them are drawn from €1,000, and the €250 becomes a
  // leftover the page can name. Point `spendBase` back at the full `spendable`
  // and the reader is charged for €250 they told us they do not spend.
  const b = basketBudget({
    spendMode: "pct",
    amounts: [22, 6, 4],
    spendable: 1250,
    spendSharePct: 80,
  });
  assert.equal(b.spendBase, 1000);
  assert.equal(b.leftover, 250);
  assert.equal(b.leftoverPct, 20);
  assert.equal(b.leftoverPerYear, 3000);
  assert.equal(b.hasLeftover, true);
  // A share cannot exceed the money it is a share of, so this branch can never
  // report over-allocation — that state needs thirteen typed euro amounts.
  assert.equal(b.over, 0);
});

test("the stated share moves the € column and leaves the shares alone", () => {
  // The division between the rows is the reader's; the size of what is being
  // divided is what the control sets. Halving the claim must halve every €
  // figure and change no row's share of the basket — that is the property that
  // keeps π off this control (mirror.js normalises by Σa).
  const amounts = [22, 6, 4];
  const full = basketBudget({ spendMode: "pct", amounts, spendable: 1250, spendSharePct: 100 });
  const half = basketBudget({ spendMode: "pct", amounts, spendable: 1250, spendSharePct: 50 });
  assert.equal(half.spendBase, full.spendBase / 2);
  amounts.forEach((a, i) => {
    const share = (x) => (x.spendBase * a) / amounts.reduce((s, y) => s + y, 0);
    assert.ok(near(share(half), share(full) / 2), `row ${i} did not follow the claim`);
  });
});

test("the spend share holds at both ends and refuses junk", () => {
  const at = (spendSharePct, spendable = 1250) =>
    basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable, spendSharePct });

  // 0% is a real answer — someone accounting for a month they spent nothing —
  // and it must not divide by anything or produce a negative leftover.
  assert.equal(at(0).spendBase, 0);
  assert.equal(at(0).leftover, 1250);
  assert.equal(at(0).leftoverPct, 100);
  assert.equal(at(100).leftover, 0);
  assert.equal(at(100).hasLeftover, false);

  // Out of range and unusable both land on 100. NaN is the app failing to read
  // an answer, and answering "you spend nothing" on the reader's behalf would
  // empty every € figure on the page (view/spend.js#clampSpendShare).
  assert.equal(at(-30).spendBase, 0, "a negative claim was not clamped to nothing spent");
  assert.equal(at(130).spendBase, 1250, "a claim over 100% spent more than there is");
  assert.equal(at(NaN).spendBase, 1250);
  assert.equal(at(undefined).spendBase, 1250);

  // No salary yet: every figure is zero and none of them is NaN or negative.
  const broke = at(60, 0);
  assert.equal(broke.spendBase, 0);
  assert.equal(broke.leftover, 0);
  assert.equal(broke.leftoverPct, 0);
  assert.equal(broke.hasLeftover, false);
  assert.equal(at(60, -5).spendBase, 0);
});

test("the euro mode ignores the stated share — its remainder is measured", () => {
  // The design decision this pins: only one of the two remainders is ever live.
  // In € mode the leftover is derived from thirteen amounts the reader typed,
  // and honouring a stated claim on top of it would put two answers to "how
  // much do you not spend" on one page, free to disagree. The control is not
  // rendered in this mode; this is what makes that a guarantee rather than a
  // property of the markup.
  const measured = basketBudget({ spendMode: "eur", amounts: [600, 300, 100], spendable: 1250 });
  for (const spendSharePct of [0, 40, 100, NaN]) {
    assert.deepEqual(
      basketBudget({ spendMode: "eur", amounts: [600, 300, 100], spendable: 1250, spendSharePct }),
      measured,
      `a stated share of ${spendSharePct} reached the euro mode's measured remainder`
    );
  }
});

test("clampSpendShare answers with a share, or with the neutral claim", () => {
  assert.equal(clampSpendShare(72), 72);
  assert.equal(clampSpendShare(0), 0);
  assert.equal(clampSpendShare(100), 100);
  assert.equal(clampSpendShare(-1), 0);
  assert.equal(clampSpendShare(101), 100);
  // `+val` on an empty or non-numeric field, and the two infinities.
  assert.equal(clampSpendShare(NaN), 100);
  assert.equal(clampSpendShare(Infinity), 100);
  assert.equal(clampSpendShare(-Infinity), 100);
});

test("over-allocating is reported as over, and still measured on what was typed", () => {
  // Spending more than you take home is a real thing people do (savings,
  // credit). We say so — and we do not quietly clamp their basket down to
  // their pay, because their number is theirs.
  const b = basketBudget({ spendMode: "eur", amounts: [900, 500], spendable: 1250 });
  assert.equal(b.over, 150);
  assert.equal(b.leftover, 0);
  assert.equal(b.hasLeftover, false);
  assert.equal(b.spendBase, 1400);
});

test("a leftover under €1 is rounding, and says nothing", () => {
  // «€0 остават извън кошницата» on a basket that happens to balance is noise
  // on a card that is otherwise all signal.
  const b = basketBudget({ spendMode: "eur", amounts: [1249.4], spendable: 1250 });
  assert.equal(b.hasLeftover, false);
  assert.ok(b.leftover < 1);
});

test("basketBudget survives an empty basket and a salary nobody typed", () => {
  assert.equal(basketBudget({ spendMode: "eur", amounts: [], spendable: 0 }).hasLeftover, false);
  assert.equal(basketBudget({ spendMode: "eur", amounts: null, spendable: 900 }).entered, 0);
  assert.equal(basketBudget({ spendMode: "pct", amounts: [50], spendable: -5 }).spendBase, 0);
  // Negative slider values cannot happen through the UI, but Σ must not go
  // negative if one ever did — it is the denominator of every share.
  assert.equal(
    basketBudget({ spendMode: "eur", amounts: [100, -40], spendable: 900 }).entered,
    100
  );
});

// ---------------------------------------------------------------------------
// What the price rise is charged against
// ---------------------------------------------------------------------------

test("exposedSpend reduces to the whole take-home when nothing is left over", () => {
  // The load-bearing property: this must not move the headline € figure for
  // the readers who never asked for any of this. In share mode
  // spendBase === salary − housingCost, so the sum is the salary again.
  const { housingCost, spendable } = housingCarveOut({
    salary: 2000,
    homeOn: false,
    monthlyMortgage: 0,
    rent: 450,
  });
  const b = basketBudget({ spendMode: "pct", amounts: [22, 6, 4], spendable });
  assert.equal(exposedSpend({ housingCost, spendBase: b.spendBase }), 2000);
});

test("exposedSpend charges the rise only on money that is actually spent", () => {
  // €2,000 pay, €450 rent, €900 of basket entered: prices apply to €1,350, not
  // to the €650 sitting in the account. Feeding `salary` here overstated what
  // the same life costs by exactly the amount the reader put aside.
  const { housingCost, spendable } = housingCarveOut({
    salary: 2000,
    homeOn: false,
    monthlyMortgage: 0,
    rent: 450,
  });
  const b = basketBudget({ spendMode: "eur", amounts: [500, 300, 100], spendable });
  assert.equal(exposedSpend({ housingCost, spendBase: b.spendBase }), 1350);
});

test("exposedSpend follows a stated share the same way it follows typed euros", () => {
  // The headline «≈ €X повече всеки месец» is the figure the whole control
  // exists to correct, and it is the one number a reader quotes. €2,000 pay,
  // €450 rent, "I spend about 70% of what's left": prices apply to the €450 of
  // housing plus €1,085 of basket, not to the whole €2,000. The two ways of
  // saying "I don't spend everything" have to reach it identically — a euro
  // basket of €1,085 against the same pay gives the same €1,535 below.
  const { housingCost, spendable } = housingCarveOut({
    salary: 2000,
    homeOn: false,
    monthlyMortgage: 0,
    rent: 450,
  });
  const stated = basketBudget({
    spendMode: "pct",
    amounts: [22, 6, 4],
    spendable,
    spendSharePct: 70,
  });
  assert.equal(exposedSpend({ housingCost, spendBase: stated.spendBase }), 1535);
  const typed = basketBudget({ spendMode: "eur", amounts: [700, 285, 100], spendable });
  assert.equal(
    exposedSpend({ housingCost, spendBase: typed.spendBase }),
    exposedSpend({ housingCost, spendBase: stated.spendBase }),
    "the stated and the measured routes to the same spending disagree"
  );
});

test("exposedSpend keeps housing in — rent and a mortgage payment are spending", () => {
  assert.equal(exposedSpend({ housingCost: 600, spendBase: 0 }), 600);
  assert.equal(exposedSpend({ housingCost: 0, spendBase: 0 }), 0);
  assert.equal(exposedSpend({ housingCost: undefined, spendBase: undefined }), 0);
});

// ---------------------------------------------------------------------------
// The unplaced money, held as cash
// ---------------------------------------------------------------------------

test("leftoverIfHeldAsCash measures against the HEADLINE, never the user's basket", () => {
  // The wrong wiring is π. Money that is not being spent on this reader's
  // basket is not measured by this reader's basket — and the function takes
  // the payload rather than a rate precisely so no caller can hand it one.
  const r = leftoverIfHeldAsCash({
    leftoverPerYear: 3000,
    headline: { headline_rate_pct: 5.2 },
  });
  assert.equal(r.ratePct, 5.2);
  assert.ok(near(r.valueToday, 3000 / 1.052));
  assert.ok(near(r.eaten, 3000 - 3000 / 1.052));
  // Sanity: ~€148 on €3,000 at 5.2%. A sign slip or a ×100 shows up here.
  assert.ok(r.eaten > 140 && r.eaten < 155, `implausible erosion: ${r.eaten}`);
});

test("leftoverIfHeldAsCash uses the SHIPPED headline rate when handed the payload", () => {
  const headline = read("hicp_headline");
  if (!headline) return;
  const r = leftoverIfHeldAsCash({ leftoverPerYear: 1200, headline });
  assert.equal(r.ratePct, headlineRate(headline));
  assert.ok(r.eaten > 0 && r.eaten < 1200);
});

test("leftoverIfHeldAsCash degrades to zero rather than NaN", () => {
  // No headline payload → rate 0 → the money keeps its value. A NaN here
  // would render "€NaN less in a year" on a card people are asked to trust.
  const r = leftoverIfHeldAsCash({ leftoverPerYear: 3000, headline: null });
  assert.equal(r.ratePct, 0);
  assert.equal(r.valueToday, 3000);
  assert.equal(r.eaten, 0);
  assert.equal(leftoverIfHeldAsCash({ leftoverPerYear: -5, headline: null }).valueToday, 0);
});
