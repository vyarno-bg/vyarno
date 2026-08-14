#!/usr/bin/env node
/**
 * What a home costs the reader who is buying one.
 *
 * Every input the annuity takes is a wrong number waiting to be plausible.
 * The AAR is what the payment is amortised from — the APRC is for comparing
 * offers and the outstanding-stock rate answers a third question (docs/math.md
 * §"Three rates"). The down payment comes from the published БНБ minimum
 * rather than from the caller, the term is clamped to the published maturity
 * ceiling before anything is quoted, and the affordability line is drawn at
 * our 30% of net rather than the 50% the regulator permits. A €/m² has to
 * price the home the bracket beside it names, or the total and the rate it was
 * built from describe two different cities.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { homePriceFor, homePriceBasis, clampTerm, mortgagePanel } from "../src/lib/view/home.js";
import { annuityPayment } from "../src/lib/mirror.js";
import { published } from "./published-payload.mjs";
import { near } from "./near.mjs";

const read = published;

/**
 * The BNB limits as published — the shape `mortgagePanel` consumes.
 *
 * **Every DSTI figure published carries a different number, and the fixture has
 * to keep them different.** A `limits` that omits `observedDstiPct` cannot tell
 * a cap read from our prudent line apart from one read from the market's
 * observed average: both land on the `?? 30` fallback, so `capPct === 30` holds
 * either way. On the published 38.5 the cap on €1486 net moves €446 → €572,
 * `maxPrice` rises ~28%, and the over-the-line warning stops firing for the band
 * of readers between the two.
 */
const LIMITS = {
  minDownPaymentPct: 15,
  dstiMaxPct: 50,
  maturityMaxYears: 30,
  prudentDstiPct: 30,
  observedDstiPct: 38.5,
};

// ---------------------------------------------------------------------------
// The home block
// ---------------------------------------------------------------------------

test("homePriceFor uses the typed price only in manual mode", () => {
  const real = { eurPerM2: 2500, m2: 70, eurPerM2IsReal: true };
  assert.equal(homePriceFor({ priceMode: "auto", manualPrice: 99999, ...real }), 175000);
  assert.equal(homePriceFor({ priceMode: "manual", manualPrice: 150000, ...real }), 150000);
  // Manual mode with nothing typed yet falls back to the market price rather
  // than pricing a €0 home.
  assert.equal(homePriceFor({ priceMode: "manual", manualPrice: 0, ...real }), 175000);
});

test("homePriceFor prices nothing off a €/m² nobody published", () => {
  // **The €/m² handed to this function is not always a measurement.**
  // `cityEurPerM2` falls back to `HOME.eurPerM2_offlineFallback`, a round
  // constant, whenever the chosen град has no published median — which is an
  // ordinary state now rather than a first-paint flicker: a reader who has
  // picked no област, and one whose област имот.bg publish no city for.
  //
  // Multiplied by 70 m² that constant is a €175,000 home, and the row built a
  // €661/month payment and a "44% of your pay" verdict on it. It reached
  // further than the row, too: `monthlyMort` is carved out of the money the
  // basket's € column is computed from.
  const fake = { eurPerM2: 2500, m2: 70, eurPerM2IsReal: false };
  assert.equal(homePriceFor({ priceMode: "auto", manualPrice: 0, ...fake }), 0);
  assert.equal(
    homePriceFor({ priceMode: "auto", manualPrice: 99999, ...fake }),
    0,
    "auto mode reached for a price the reader typed for a different question"
  );
  assert.equal(
    homePriceFor({ priceMode: "manual", manualPrice: 0, ...fake }),
    0,
    "manual mode with nothing typed fell back to the constant"
  );
  // A price the reader typed is sourced whatever имот.bg publish — it is the
  // one they are asking about.
  assert.equal(homePriceFor({ priceMode: "manual", manualPrice: 150000, ...fake }), 150000);
});

test("the €/m² in the bracket is the one the total beside it was built from", () => {
  // **The sentence quotes both in one breath, so they have to be the same
  // price.** They were not in manual mode: «70 м² в София ≈ €200 000
  // (≈2501€/м², медиана)» over a price the reader typed, where 200 000 ÷ 70 is
  // 2857. Both figures were real, and the bracket explained the other one —
  // имот.bg's median, captioned as the basis of a price имот.bg had nothing to
  // do with.
  const real = { eurPerM2: 2500, m2: 70, eurPerM2IsReal: true };
  const auto = homePriceBasis({ priceMode: "auto", manualPrice: 0, ...real });
  assert.deepEqual(auto, { eurPerM2: 2500, isOwn: false });

  const own = homePriceBasis({ priceMode: "manual", manualPrice: 200000, ...real });
  assert.equal(own.isOwn, true);
  assert.ok(near(own.eurPerM2, 200000 / 70, 1e-9));
  // The identity that matters: the quoted €/m² times the area IS the total in
  // the same sentence, whichever mode produced it.
  for (const args of [
    { priceMode: "auto", manualPrice: 0, ...real },
    { priceMode: "manual", manualPrice: 200000, ...real },
    { priceMode: "manual", manualPrice: 0, ...real },
  ]) {
    assert.ok(
      near(homePriceBasis(args).eurPerM2 * args.m2, homePriceFor(args), 1e-6),
      `the bracket describes a different price from the total: ${JSON.stringify(args)}`
    );
  }
  // And with no published median the auto reading is nothing rather than the
  // offline constant, matching the zero `homePriceFor` returns there.
  const fake = { eurPerM2: 2500, m2: 70, eurPerM2IsReal: false };
  assert.deepEqual(homePriceBasis({ priceMode: "auto", manualPrice: 0, ...fake }), {
    eurPerM2: 0,
    isOwn: false,
  });
});

test("clampTerm holds the term at the BNB maturity ceiling", () => {
  // The input's `max` stops the spinner but not a typed or restored value.
  // A 40-year quote is a payment no BG bank can legally originate.
  assert.equal(clampTerm(40, LIMITS), 30);
  assert.equal(clampTerm(25, LIMITS), 25);
  assert.equal(clampTerm(40, {}), 30, "with no published limits, still cap at 30");
});

test("mortgagePanel amortises the AAR, never the fee-inclusive APRC", () => {
  // docs/data-sources.md §"A plausible number is not a verified number". The
  // APRC (2.77% at 2026-05) folds fees into an annualised
  // figure; compounding them monthly overstates the payment. At the published
  // Sofia median this is ~€24/month — plausible enough that no sanity band
  // would catch it, which is exactly why it needs a test.
  const args = {
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  };
  const aar = mortgagePanel(args);
  const aprc = mortgagePanel({ ...args, ratePct: 2.77 });
  assert.ok(near(aar.payment, annuityPayment(175070 * 0.85, 2.43, 25), 1e-9));
  assert.ok(
    aprc.payment - aar.payment > 15,
    `APRC vs AAR must be a visible €/month gap, got ${aprc.payment - aar.payment}`
  );
  // Pin the shipped figure so a silent rate swap moves it.
  assert.ok(aar.payment > 655 && aar.payment < 670, aar.payment);
});

test("mortgagePanel takes the down payment from the published BNB cap, not the caller", () => {
  // LTV-O is capped at 85%, so 15% down is the largest loan a BG bank may
  // legally write. A caller must not be able to quote a 0%-down payment.
  const p = mortgagePanel({
    price: 200000,
    ratePct: 2.5,
    termYears: 25,
    netSalary: 1500,
    eurPerM2: 2500,
    limits: LIMITS,
    // these are ignored on purpose — the function reads `limits`
    downPaymentPct: 0,
    minDownPaymentPct: 0,
  });
  assert.equal(p.downPaymentPct, 15);
  assert.equal(p.loan, 170000);
  assert.equal(p.downPayment, 30000);
});

test("mortgagePanel draws the affordability line at OUR 30%, not the regulator's 50%", () => {
  // docs/principles.md P7. A payment a bank will approve is not a payment that leaves
  // room to live; adopting the legal ceiling would make homes look reachable.
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.equal(p.capPct, 30);
  assert.ok(near(p.capEur, 1486 * 0.3, 1e-9));
  assert.ok(p.capPct < LIMITS.dstiMaxPct, "our line must stay stricter than the law");
  assert.ok(
    p.capPct < LIMITS.observedDstiPct,
    "our line must stay stricter than what the average BG borrower actually carries"
  );
  // At the published Sofia median this purchase IS a stretch, and the app has
  // to keep saying so.
  assert.ok(p.overCap, "the Sofia median at the average wage must read as over the line");
  assert.ok(p.sharePct > 40 && p.sharePct < 50, p.sharePct);
});

test("mortgagePanel's fallback affordability line is 30%, not the regulator's 50%", () => {
  // The `?? 30` default holds when a degraded mortgage.json carries no
  // `prudent_dsti_pct`. The test above always passes a complete `limits`, so
  // that branch was unexercised — `?? 30` could become `?? 50` (the ceiling the
  // 30% line exists to undercut, docs/principles.md P7) with every suite green.
  const partial = { minDownPaymentPct: 15, maturityMaxYears: 30 };
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: partial,
  });
  assert.equal(p.capPct, 30, "the fallback line must be our 30%, not the 50% BNB permits");
  assert.ok(near(p.capEur, 1486 * 0.3, 1e-9));
});

test("mortgagePanel's fallback down payment is the 15% BNB minimum, not nothing", () => {
  // The sibling of the branch above, on the other constant a degraded
  // mortgage.json can leave out. Every test that quotes a payment passes a
  // complete `limits`, so `?? 15` could become `?? 0` and quote a 100% loan —
  // €200,000 borrowed against a home a BG bank may only write 85% of, with a
  // payment ~18% higher than any offer the reader could sign.
  const partial = { prudentDstiPct: 30, maturityMaxYears: 30 };
  const p = mortgagePanel({
    price: 200000,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: partial,
  });
  assert.equal(p.downPaymentPct, 15, "the fallback deposit must be the published LTV-O floor");
  assert.equal(p.loan, 170000);
  assert.equal(p.downPayment, 30000);
});

test("capGap is signed from the reader's side of the line, over and under", () => {
  // `HomeRow.svelte` branches on `mortCapGap > 0` for the whole verdict — the
  // bar colour, the «над»/«под» word and the euro figure beside it. With the
  // subtraction the other way round a reader €215/month OVER the line is told
  // in the green colour that they are €215 under it, and the sentence and the
  // number are both wrong in the direction that sells the purchase. Zero has no
  // sign, so the round-trip case below cannot see this.
  const base = { ratePct: 2.43, termYears: 25, netSalary: 1486, eurPerM2: 2501, limits: LIMITS };
  const over = mortgagePanel({ ...base, price: 175070 });
  assert.ok(over.overCap);
  assert.ok(over.capGap > 0, `over the line the gap must read positive, got ${over.capGap}`);
  assert.ok(near(over.capGap, over.payment - over.capEur, 1e-9));

  const under = mortgagePanel({ ...base, price: 90000 });
  assert.ok(!under.overCap);
  assert.ok(under.capGap < 0, `under the line the gap must read negative, got ${under.capGap}`);
  assert.ok(near(-under.capGap, under.capEur - under.payment, 1e-9));
});

test("mortgagePanel's reverse calc round-trips against its own forward calc", () => {
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  // A home priced at exactly maxPrice must land exactly on the cap.
  const atCap = mortgagePanel({
    price: p.maxPrice,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.ok(near(atCap.payment, p.capEur, 1e-6), `${atCap.payment} vs ${p.capEur}`);
  assert.ok(near(atCap.capGap, 0, 1e-6));
  assert.ok(near(p.maxM2, p.maxPrice / 2501, 1e-9));
});

test("mortgagePanel clamps an over-long term before quoting anything", () => {
  const long = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 40,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  const capped = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 30,
    netSalary: 1486,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.ok(near(long.payment, capped.payment, 1e-9), "a 40y term must quote as 30y");
});

test("mortgagePanel degrades without a salary instead of dividing by zero", () => {
  const p = mortgagePanel({
    price: 175070,
    ratePct: 2.43,
    termYears: 25,
    netSalary: 0,
    eurPerM2: 2501,
    limits: LIMITS,
  });
  assert.equal(p.sharePct, 0);
  assert.equal(p.capEur, 0);
  assert.equal(p.maxLoan, 0);
});

test("the published limits keep our line stricter than the law and the market", () => {
  const m = read("mortgage");
  if (!m) return;
  const l = m.lending_limits;
  assert.ok(l.prudent_dsti_pct < l.observed_weighted_avg_dsti_pct);
  assert.ok(l.observed_weighted_avg_dsti_pct < l.dsti_max_pct);
});
