#!/usr/bin/env node
/**
 * What the results card claims about a reader's own year.
 *
 * The headline is Eurostat's all-items figure verbatim and never Σ(w·r) over
 * the divisions — the two differ by the chain link, and a card that derives it
 * prints a rate no publisher stands behind. Savings are deflated by Eurostat's
 * own index rather than by the reader's basket, so «what your cash lost» stays
 * a fact about the currency. The ranked column has to add up to what the
 * sentence above it claims, folded tail included. And the plain answer's
 * verdict has to be the same verdict the row beside it took: one state over a
 * ±1pp dead zone prints «точно на нула» beside a figure reading «−0,3%».
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  headlineIsFlash,
  headlineRate,
  monthsSplit,
  savingsSince2020,
  rankedSplit,
  pocketVerdictState,
  answerLine,
  RANK_ROWS_SHOWN,
} from "../src/lib/view/results.js";
import { contributions, personalInflationDetailed } from "../src/lib/mirror.js";
import { published } from "./published-payload.mjs";
import { near } from "./near.mjs";

const read = published;

// ---------------------------------------------------------------------------
// The headline — verbatim, never derived
// ---------------------------------------------------------------------------

test("headlineRate returns Eurostat's all-items figure verbatim", () => {
  assert.equal(headlineRate({ headline_rate_pct: 5.2 }), 5.2);
  assert.equal(headlineRate(null), 0);
  assert.equal(headlineRate({}), 0);
  assert.equal(headlineRate({ headline_rate_pct: null }), 0);
});

test("the flash marker is read off the payload, not off its two months", () => {
  // The equivalence between the flag and the months is gated at publish time,
  // so the interesting cases here are the ones where a months-based inference
  // and the field disagree. Both directions matter to the reader: an unmarked
  // estimate reads as settled, and a marked settled figure hedges for nothing.
  assert.equal(headlineIsFlash({ is_flash: true }), true);
  assert.equal(headlineIsFlash({ is_flash: false }), false);
  // No months at all, and the answer is still the field's.
  assert.equal(
    headlineIsFlash({ is_flash: true, ref_period: "2026-07" }),
    true,
    "a payload whose index half never loaded still says which release it is"
  );
  // Absent means "an envelope written before the field existed", and the safe
  // reading of that is no marker rather than a hedge nobody can check.
  assert.equal(headlineIsFlash({}), false);
  assert.equal(headlineIsFlash(null), false);
  assert.equal(headlineIsFlash(undefined), false);
  // Truthy is not true: a string, a 1 or an object would all mark the banner
  // if this took anything JavaScript calls true.
  assert.equal(headlineIsFlash({ is_flash: "no" }), false);
});

test("the published headline says which Eurostat release it came from", () => {
  const head = read("hicp_headline");
  if (!head) return;
  assert.equal(
    typeof head.is_flash,
    "boolean",
    "hicp_headline.json carries no is_flash — the banner cannot say whether its " +
      "figure is Eurostat's estimate for the month or their settled reading"
  );
  // The gate that holds the flag to the payload's months lives in the
  // pipeline; this is the same property read off what actually shipped, so a
  // hand-edited payload cannot put a marker on the page that the figures
  // contradict.
  const split = head.latest_index?.time !== head.ref_period;
  assert.equal(
    head.is_flash,
    split,
    `hicp_headline.json is dated ${head.ref_period} with its index at ` +
      `${head.latest_index?.time} and is_flash=${head.is_flash} — the flag and ` +
      `the months disagree about which release this is`
  );
});

test("monthsSplit answers only when it has both months", () => {
  assert.equal(monthsSplit({ headlineMonth: "2026-07", basketMonth: "2026-06" }), true);
  assert.equal(monthsSplit({ headlineMonth: "2026-06", basketMonth: "2026-06" }), false);
  // A payload that did not load leaves one side empty, and "" !== "2026-06" is
  // true — which would put the split sentence, naming a month the page cannot
  // print, in front of a reader whose page is missing half its figures.
  assert.equal(monthsSplit({ headlineMonth: "", basketMonth: "2026-06" }), false);
  assert.equal(monthsSplit({ headlineMonth: "2026-07", basketMonth: "" }), false);
  assert.equal(monthsSplit({ headlineMonth: "", basketMonth: "" }), false);
});

test("the two surfaces that explain the gap agree about which months they have", () => {
  // The pages print the same pair of published months and draw the same
  // conclusion from them, so the comparison lives in one function. Two copies
  // of `a !== b` is how one of them ends up saying "both are for the same
  // latest month" during a flash while the other names two.
  const head = read("hicp_headline");
  const cats = read("hicp_categories");
  if (!head || !cats) return;
  const live = monthsSplit({
    headlineMonth: String(head.ref_period ?? ""),
    basketMonth: String(cats.categories?.[0]?.ref_period ?? ""),
  });
  assert.equal(
    live,
    head.ref_period !== cats.categories[0].ref_period,
    "monthsSplit disagrees with the published payloads about whether the " +
      "headline and the divisions describe one month"
  );
});

// ---------------------------------------------------------------------------
// Savings — always the official since-2020 cumulative
// ---------------------------------------------------------------------------

test("savingsSince2020 deflates by EUROSTAT'S OWN all-items index", () => {
  // The card's copy says "от 2020 г." / "since 2020" in fixed words. Passing
  // the user's own basket rate would answer a different question in the same
  // sentence — so there is no argument to pass it through.
  //
  // And the cumulative is Eurostat's published all-items index, never our
  // reconstruction of one from the divisions. The two sit ~1.9 pp apart over
  // this span, so showing the reconstruction under the word "official" is a
  // false label on a number that is nearly two points out.
  const head = read("hicp_headline");
  const cats = read("hicp_categories")?.categories;
  if (!head || !cats) return;
  const r = savingsSince2020(10000, head, cats);
  assert.equal(r.basis, "all_items", "did not use the published all-items index");

  const expected = 100 * (head.latest_index.value / head.index_by_year["2020"] - 1);
  assert.ok(near(r.cumulativePct, expected, 1e-9), `${r.cumulativePct} vs ${expected}`);
  assert.ok(near(r.valueToday, 10000 / (1 + r.cumulativePct / 100), 1e-9));
  assert.ok(near(r.eaten, 10000 - r.valueToday, 1e-9));

  // A user's own basket rate is single-digit; the since-2020 cumulative is
  // ~40%. If the two were ever swapped, `eaten` would be off by ~7x.
  assert.ok(r.eaten > 2500, `eaten ${r.eaten} looks like a 12-month rate, not since-2020`);

  // And it must be MEASURABLY the official figure, not the reconstruction.
  // Both are in the 30-60% band, so a band check cannot tell them apart —
  // this is the assertion that can.
  const reconstruction = savingsSince2020(10000, null, cats).cumulativePct;
  assert.ok(
    Math.abs(reconstruction - r.cumulativePct) > 1,
    `the all-items index (${r.cumulativePct}) and the divisions reconstruction ` +
      `(${reconstruction}) are within 1 pp — this test can no longer tell which ` +
      `one the card is showing`
  );
});

test("savingsSince2020 falls back to the divisions, and SAYS it did", () => {
  // The fallback is a legitimate number but a different one. If it inherited
  // the "Eurostat's own index" sentence, a degraded payload would reintroduce
  // exactly the mislabelling this function was changed to remove — so `basis`
  // has to change with it, and the drawer copy keys off `basis`.
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  for (const head of [
    null,
    undefined,
    {},
    { index_by_year: {} },
    { latest_index: {} },
    { index_by_year: { 2020: 0 }, latest_index: { value: 140 } },
  ]) {
    const r = savingsSince2020(10000, head, cats);
    assert.equal(r.basis, "average_basket", `bad basis for ${JSON.stringify(head)}`);
    assert.ok(r.cumulativePct > 30 && r.cumulativePct < 60, r.cumulativePct);
  }
});

test("savingsSince2020 eats nothing with no payloads or no cash", () => {
  assert.equal(savingsSince2020(10000, null, []).eaten, 0);
  assert.equal(savingsSince2020(10000, null, []).basis, "none");
  assert.equal(savingsSince2020(10000, null, null).valueToday, 10000);
  assert.equal(savingsSince2020(0, null, []).eaten, 0);
});

// ---------------------------------------------------------------------------
// THE RANKED LIST — the column has to add up to what the sentence claims
// ---------------------------------------------------------------------------

test("rankedSplit keeps Σ(shown) + rest === π exactly", () => {
  // `contributions` is an exact decomposition of the user's inflation, and
  // COPY.rankLead tells the reader so. The list is capped at eight rows, so
  // without the remainder the visible column stops short — which is what it
  // did: 5.1 points on screen under a sentence promising 5.4.
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  const amounts = cats.map((c) => c.weight_pct);
  const ranked = contributions({
    divisions: cats,
    amounts,
    splits: [],
    anchor: "y1",
    spendable: 900,
  });
  const pi = personalInflationDetailed(amounts, cats, [], "y1", 0);
  const { shown, restN, restPp } = rankedSplit(ranked);

  const drawn = shown.reduce((s, r) => s + r.contributionPp, 0);
  assert.ok(
    near(drawn + restPp, pi, 1e-9),
    `shown ${drawn} + rest ${restPp} = ${drawn + restPp}, but the sentence says ${pi}`
  );
  // The bug this replaces: enough divisions score that rows really are folded.
  assert.ok(restN > 0, "the default BG basket must exercise the remainder path");
  assert.ok(shown.length <= RANK_ROWS_SHOWN);
});

test("rankedSplit folds sub-threshold rows into the remainder, never off the page", () => {
  // A row too small to draw still carries points. Computing the remainder
  // from the *drawable* rows instead of all of them re-opens the same hole
  // one decimal further down.
  const rows = [
    { contributionPp: 3 },
    { contributionPp: 2 },
    { contributionPp: 1 },
    { contributionPp: 0.001 },
    { contributionPp: 0.002 },
  ];
  const { shown, restN, restPp } = rankedSplit(rows, 3);
  assert.equal(shown.length, 3);
  assert.equal(restN, 2);
  assert.ok(near(restPp, 0.003, 1e-12), `sub-threshold points vanished: ${restPp}`);
});

test("rankedSplit is a no-op tail when everything fits", () => {
  const rows = [{ contributionPp: 2 }, { contributionPp: 1 }];
  const { shown, restN, restPp } = rankedSplit(rows, 8);
  assert.equal(shown.length, 2);
  assert.equal(restN, 0);
  assert.ok(near(restPp, 0, 1e-12));
});

test("rankedSplit survives an empty or missing list", () => {
  for (const input of [[], null, undefined]) {
    const { shown, restN, restPp } = rankedSplit(input);
    assert.deepEqual(shown, []);
    assert.equal(restN, 0);
    assert.equal(restPp, 0);
  }
});

// --- the plain answer ------------------------------------------------------

test("pocketVerdictState keeps «точно» to the one case that cancels exactly", () => {
  // The ±1 pp dead zone has three insides, and one verdict over all three
  // prints «точно на нула» beside a figure reading «−0,3%». Two surfaces read
  // these states now — the pocket row and the answer block — so a threshold
  // that moves here moves in both, which is the whole reason it is one
  // function.
  assert.equal(pocketVerdictState(6, 2), "ahead");
  assert.equal(pocketVerdictState(2, -2), "behind");
  assert.equal(pocketVerdictState(5, 0), "level");
  assert.equal(pocketVerdictState(5, 0.4), "nearUp");
  assert.equal(pocketVerdictState(5, -0.4), "nearDn");
  // The boundaries belong to the decided verdicts, not to the dead zone.
  assert.equal(pocketVerdictState(6, 1), "ahead");
  assert.equal(pocketVerdictState(4, -1), "behind");
});

test("pocketVerdictState reads a pay cut and a frozen wage as their own states", () => {
  // «Увеличението е изядено» is the wrong sentence for someone who never got
  // one, and for someone whose pay fell there was no raise to eat. Both are
  // reachable: the field takes any number.
  assert.equal(pocketVerdictState(0, -5), "none");
  assert.equal(pocketVerdictState(-3, -8), "cut");
  // …and a cut is a cut even where prices fell faster than the pay did.
  assert.equal(pocketVerdictState(-3, 2), "cut");
  for (const [raise, pocket] of [
    [NaN, NaN],
    [NaN, 3],
    [3, NaN],
  ]) {
    assert.equal(pocketVerdictState(raise, pocket), "unsaid");
  }
});

test("the plain answer ranks nobody who has not typed a salary", () => {
  // The ladder is a claim about the READER, in the second person. A visitor on
  // €2,400 told on arrival that they out-earn a third of Sofia has been told
  // something false about themselves before typing a character, and no caveat
  // rescues it — the rule `PercentileRow` keeps in its corner. The answer block
  // sits a screen ABOVE that row, so it has to keep the same rule or the defect
  // simply moves up the page.
  const ranks = [{ ahead: 34 }];
  const untouched = answerLine({ salaryAnswered: false, ranks, ranked: [] });
  assert.equal(untouched.stand.state, "unsaid");
  assert.equal(untouched.stand.low, 0);

  const answered = answerLine({ salaryAnswered: true, ranks, ranked: [] });
  assert.equal(answered.stand.state, "one");
  assert.equal(answered.stand.low, 34);
});

test("the plain answer states a household's position as a range", () => {
  // The rungs are individual full-time earnings, so there is no single
  // position for a household to occupy and no non-arbitrary way to pick one
  // earner to speak for it. «Пред 34-62%» is true about where these people
  // sit; any single figure in that sentence is not.
  const many = answerLine({
    salaryAnswered: true,
    ranks: [{ ahead: 62 }, { ahead: 34 }, { ahead: 51 }],
    ranked: [],
  });
  assert.equal(many.stand.state, "many");
  assert.equal(many.stand.low, 34);
  assert.equal(many.stand.high, 62);
});

test("the plain answer names movers out of the reader's own basket", () => {
  // A division the reader spends nothing on contributes nothing to their
  // number, so naming it as what is rising fastest describes somebody else's
  // life — and the whole card is about theirs.
  const div = (name) => ({ bg_name: name, en_name: name });
  const ranked = [
    { division: div("not mine"), rate: 40, share: 0 },
    { division: div("transport"), rate: 11, share: 0.2 },
    { division: div("food"), rate: 4, share: 0.3 },
    { division: div("phones"), rate: -5, share: 0.1 },
  ];
  const answer = answerLine({ salaryAnswered: true, ranked });
  assert.equal(answer.mover.up.division.bg_name, "transport");
  assert.equal(answer.mover.up.ratePct, 11);
  assert.equal(answer.mover.down.division.bg_name, "phones");
});

test("the plain answer invents no mover where the basket has none", () => {
  // Both directions are sign-gated. A basket where nothing fell must not be
  // handed its least-bad row as a saving, and one where nothing rose must not
  // be told what rose fastest — «поевтинява: транспорт (+4,0%)» is a false
  // sentence built out of correct arithmetic.
  const div = (name) => ({ bg_name: name, en_name: name });
  const allUp = answerLine({
    ranked: [
      { division: div("food"), rate: 4, share: 0.5 },
      { division: div("rent"), rate: 2, share: 0.5 },
    ],
  });
  assert.ok(allUp.mover.up);
  assert.equal(allUp.mover.down, null);

  const allDown = answerLine({
    ranked: [
      { division: div("phones"), rate: -5, share: 0.5 },
      { division: div("tech"), rate: -7, share: 0.5 },
    ],
  });
  assert.equal(allDown.mover.up, null);
  assert.equal(allDown.mover.down.division.bg_name, "tech");

  const empty = answerLine({});
  assert.equal(empty.mover.up, null);
  assert.equal(empty.mover.down, null);
  assert.equal(empty.stand.state, "unsaid");
  assert.equal(empty.pay.state, "unsaid");
});

test("the plain answer takes its pay verdict from the same states as the row", () => {
  // Two ladders of thresholds a screen apart drift silently: the summary
  // calling a raise ahead while the row below calls it level, over a number
  // neither of them moved. This asserts they are one function rather than two
  // that happen to agree today.
  for (const [raise, pocket] of [
    [6, 2],
    [2, -2],
    [5, 0.4],
    [0, -5],
    [-3, 1],
    [NaN, NaN],
  ]) {
    assert.equal(
      answerLine({ raise, pocket }).pay.state,
      pocketVerdictState(raise, pocket),
      `the answer block decided ${raise}/${pocket} for itself`
    );
  }
});
