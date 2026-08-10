/**
 * Template wiring contracts — which value the markup feeds to which function.
 *
 * These are the invariants that survive as source checks because there is
 * nothing else to check them against. A wrong wiring is not a wrong formula
 * and not a wrong string: `mirror.js` can be perfect, `content.js` can be
 * perfect, and the page can still print thirteen euro figures the reader never
 * typed because the template handed `spendable` to a function that wanted
 * `spendBase`. `verify_view.mjs` proves the arithmetic; the
 * `verify_render_*.mjs` suites prove the page draws. Neither can see which
 * argument the template passed.
 *
 * The other kind of invariant here is architectural: the basket iterates the
 * published payload rather than a literal list. A frozen list in the front end
 * means an upstream reclassification cannot reach the page even once the
 * pipeline publishes it — the app would keep rendering thirteen divisions
 * because thirteen is written down here, not because Eurostat published
 * thirteen. A DOM test would prove it better (render two fixtures, assert the
 * output follows) and would cost a fixture harness; the loop is the cheap
 * proxy, and it is honest about being one.
 *
 * They run in the runner that owns this language rather than in
 * `pipeline/tests/`, where a Python suite asserting on JavaScript can only ever
 * read the file as text. **Where a module exports the thing under test they
 * IMPORT it** rather than regexing it out of a file — `PRESETS`,
 * `BG_CONTRIB_LINES` and the published JSON are all read as values here, so a
 * check covers every entry there is rather than the ones somebody remembered to
 * name in it. `docs/testing-strategy.md` §"Everything about the SPA is Node's"
 * argues both halves.
 *
 * Assertions match on token sequence, never on layout: `flat()` collapses
 * whitespace so a Prettier run cannot fail a test that no behaviour change
 * would. That is not a stylistic preference — introducing Prettier once turned
 * thirty assertions red without breaking anything, because they were pinned to
 * line wrapping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PRESETS } from "../src/lib/content.js";
import { BG_CONTRIB_LINES } from "../src/lib/mirror.js";
import { PAYLOAD_FILES } from "../src/lib/payloads.js";
import { published } from "./published-payload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");

/**
 * The calculator as one string: App.svelte, every component it is composed of,
 * and the rune module holding the state they all read.
 *
 * These tests are about the page a visitor sees, not about which file a given
 * element ended up in, so they read the whole tree. Otherwise moving markup
 * into a component — or the reactive graph into `$lib/calculator.svelte.js` —
 * would silently drop the invariant guarding it. Both of those moves have
 * happened; each time the fix was to widen this list, never to delete a test.
 */
function calculatorSource() {
  const parts = [read("App.svelte"), read("lib", "calculator.svelte.js")];
  for (const name of readdirSync(join(SRC, "components")).sort()) {
    if (name.endsWith(".svelte")) parts.push(read("components", name));
  }
  return parts.join("\n");
}

/**
 * `src` with comments blanked, so assertions land on rendered code.
 *
 * A comment describing a bug must never satisfy the test for its fix. Trailing
 * `//` comments are left alone on purpose — stripping them naively would eat
 * the `//` inside a `https://` string literal.
 *
 * The receiver is then dropped: the reactive graph lives in a class, so every
 * value is spelled `this.salary` where the class defines it and `calc.salary`
 * where a component reads it. Every assertion below is about WHICH value feeds
 * which function and never about which object holds it.
 */
function live(src) {
  let out = src.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
  return out.replace(/\b(?:this|calc)\./g, "");
}

/** `live(src)` with every whitespace run collapsed — match token sequence, not layout. */
const flat = (src) => live(src).replace(/\s+/g, " ").trim();

const APP = calculatorSource();
const LIVE = live(APP);
const FLAT = flat(APP);
const CONTENT = read("lib", "content.js");
// Two sources read on their own, where an assertion is about ONE file rather
// than about the graph: the pay card is the only component that may compute a
// comparison, and `view.js` is where it must have been computed instead.
const PAY = live(read("components", "PayField.svelte"));
const VIEW = read("lib", "view.js");

/**
 * The formulas the explainer band publishes, as they appear on the page.
 *
 * docs/principles.md §"Publish the method" makes publishing it the point of the
 * project rather than a concession, so these are asserted PRESENT in the
 * explainer and ABSENT from the drawer — one place, deliberately.
 */
const MATH_FRAGMENTS = [
  "\u03c0 = \u03a3 (w", // personal inflation
  "(1 + \u03c0) \u2212 1", // the real-income division
  "\u00f7 (1 + ", // cash erosion
  "P = L \u00d7 m \u00f7 (1 \u2212 (1 + m)", // the annuity
];
const MIRROR = read("lib", "mirror.js");

// ---------------------------------------------------------------------------
// The basket follows the classification instead of freezing it
// ---------------------------------------------------------------------------

test("the basket iterates the published categories, not a literal list", () => {
  // A literal list pins the basket's length in the front end, so a
  // reclassification upstream cannot reach the page even once the pipeline
  // publishes it.
  assert.match(
    FLAT,
    /\{#each categories as c, i\b/,
    "the basket must iterate the published categories"
  );
  assert.ok(
    FLAT.includes("data.hicpCategories?.categories"),
    "the category list no longer comes from the published payload"
  );
});

test("the drill-down reads every group field from the payload", () => {
  // No sub-category rate, share or name may be written into the SPA: the
  // pipeline publishes level 2 and the front end renders it. A hardcoded group
  // would drift the moment Eurostat rebalanced the basket, silently.
  assert.match(
    FLAT,
    /\{#each c\.groups as g, gi\b/,
    "the drill-down must iterate published groups"
  );
  for (const field of [
    "g.bg_name",
    "g.en_name",
    "g.cp_code",
    "estatCatUrl(g)",
    "g.eurostat_label",
  ]) {
    assert.ok(FLAT.includes(field), `the drill-down does not render ${field} from the payload`);
  }
  // The payload carries one weight per group — its share of the WHOLE basket,
  // as Eurostat publishes it. A share-of-division field is not there to read,
  // and reading a missing field gives NaN, which `officialSplit` swallows into
  // an equal split: every group in a drill-down showing the same amount, no
  // error, no clue. So the name staying absent is the check.
  assert.ok(
    !live(MIRROR).includes("weight_pct_of_parent"),
    "officialSplit reads a share-of-division field the published payload does not carry"
  );
});

test("every preset covers every published division, and sums to 100", () => {
  // `applyPreset` assigns the whole vector, so a 12-long preset against 13
  // divisions leaves CP13 undefined — it drops out of Σw and vanishes from the
  // basket with no error anywhere.
  //
  // The Python original parsed these vectors out of content.js with a regex.
  // Importing PRESETS checks the values the app actually applies, and covers a
  // preset added next month with no new test written.
  const payload = published("hicp_categories");
  if (!payload) return; // no refresh in this checkout; the pytest side gates the file's presence
  const n = payload.categories.length;

  for (const [name, vector] of Object.entries(PRESETS)) {
    assert.equal(
      vector.length,
      n,
      `PRESETS.${name} has ${vector.length} entries but the published basket has ${n} divisions`
    );
    const total = vector.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `PRESETS.${name} sums to ${total}, expected 100`);
  }
});

test("the basket accepts euros as well as percentages", () => {
  // People know their euros better than their percentages. Both modes feed the
  // same `weights` array, so this is a presentation choice rather than a second
  // calculator — the assertion is that the euro path exists and that switching
  // converts rather than resets.
  assert.ok(FLAT.includes('spendMode === "eur"'), "no euros-per-month entry mode");
  assert.ok(FLAT.includes("setSpendMode"), "the mode toggle is gone");
  assert.ok(CONTENT.includes("modeEur") && CONTENT.includes("modePct"), "the mode labels are gone");
});

// ---------------------------------------------------------------------------
// Nobody is made to spend their whole salary
//
// A euro basket that divides the WHOLE spendable amount across whatever the
// reader entered is the failure this section exists to prevent: type €1,000 of
// a €1,250 budget and all thirteen rows come back 25% larger than typed,
// summing to a total the reader deliberately avoided. Every figure downstream
// — the € column, the ranked rows, "the biggest bite" — inherits it.
//
// `view.js#basketBudget` fixes the arithmetic and `verify_view.mjs` proves it.
// These guard the WIRING: the template must feed `budget.spendBase` to the
// consumers, not `spendable`.
// ---------------------------------------------------------------------------

test("the euro column shows what was typed, not the whole budget", () => {
  const divEur = /divisionEur = \(i\) =>\s*([\s\S]+?);/.exec(LIVE);
  assert.ok(divEur, "divisionEur is gone");
  assert.ok(
    divEur[1].includes("budget.spendBase"),
    "the per-division € column is scaled to the whole budget again — thirteen " +
      "plausible euro figures, none of them the reader's"
  );
  assert.ok(!divEur[1].includes("spendable *"), "divisionEur multiplies the full spendable amount");

  const ranked = /ranked = \$derived\(([\s\S]*?)\n {2}\);/.exec(LIVE);
  assert.ok(ranked, "the ranked contribution list is gone");
  assert.ok(
    ranked[1].includes("spendable: budget.spendBase"),
    "contributions() is being handed the full spendable amount again"
  );
});

test("the reader can say how much of their pay they spend, and it reaches the base", () => {
  // Share mode carries no size, only a division, so before this control the app
  // assumed the pot was the whole take-home — of every reader who never found
  // the euro mode, which is every reader who arrives, because `spendMode`
  // starts at "pct". The claim has to reach `basketBudget`, which is the one
  // place that turns it into `spendBase`; wire the control to anything else and
  // the thirteen € figures, the ranked column and the headline all keep
  // answering the old assumption while a slider on screen says otherwise.
  const budget = /budget = \$derived\(([\s\S]*?)\n {2}\);/.exec(LIVE);
  assert.ok(budget, "the basket budget is gone");
  assert.ok(
    /spendSharePct:\s*spendSharePct/.test(budget[1]),
    "basketBudget is not being told what share of their pay the reader spends"
  );
  assert.ok(FLAT.includes("onSpendShareInput"), "the spend-share control has no handler");
  assert.ok(
    /onSpendShareInput = \(val\) => \{ spendSharePct = clampSpendShare\(\+val\)/.test(FLAT),
    "the stated share reaches $state unclamped — the label beside the control renders " +
      "that number and the € figures are carved out of it, so a value only one of them " +
      "rejects is a screen where the claim and the arithmetic describe different readers"
  );
});

test("only one of the two remainders is ever on screen", () => {
  // The euro mode MEASURES what is left over off thirteen typed amounts; the
  // share control STATES it. Both live at once and the page carries two answers
  // to "how much do you not spend", free to disagree in front of the reader.
  // `basketBudget` ignores the claim in euro mode (verify_view.mjs pins that);
  // this is the other half — the control is not drawn there to ask it.
  const editor = live(read("components", "BasketEditor.svelte"));
  const control = /\{#if ([^}]*)\}\s*<div class="spendshare">/.exec(editor);
  assert.ok(control, "the spend-share control is gone, or no longer gated at all");
  assert.match(
    control[1],
    /spendMode !== "eur"/,
    `the spend-share control renders when \`${control[1].trim()}\` — in euro mode that is a ` +
      "stated remainder beside a measured one"
  );
});

test("the mode toggle converts against the base the € column is drawn from", () => {
  // Flipping %→€ at a 70% claim and scaling by the whole `spendable` hands back
  // a basket 43% larger than the one on screen a moment earlier: the app
  // insisting the whole salary be spent, by a second route, with the reader's
  // own claim as the thing it overrides. Both directions go through
  // `budget.spendBase`, which is `spendable × s/100` on the way out and
  // Σ(typed) on the way back.
  const setMode = /setSpendMode = \(mode\) => \{([\s\S]*?)\n {2}\};/.exec(LIVE);
  assert.ok(setMode, "the mode toggle's handler is gone");
  const body = setMode[1].replace(/\s+/g, " ");
  assert.ok(
    body.includes("budget.spendBase * Math.max(0, w)"),
    "%→€ converts against the whole spendable amount again"
  );
  assert.ok(
    /spendSharePct = clampSpendShare\(/.test(body),
    "€→% drops the reader's remainder instead of carrying it into the claim"
  );
});

test("the price rise is charged only on money that is actually spent", () => {
  // `extraPerMonth(salary, π)` asserts that every euro earned is spent on
  // something whose price moved. For a reader who put money aside it overstates
  // the damage by exactly what they put aside — and it is the headline € figure
  // on the results card.
  const extra = /extra = \$derived\(([\s\S]*?)\n {2}\);/.exec(LIVE);
  assert.ok(extra, "the extra-per-month figure is gone");
  assert.ok(extra[1].includes("exposedSpend"), "extra is charged against the whole salary again");
  assert.ok(!extra[1].includes("extraPerMonth(salary"), "extra takes the raw salary again");
});

// ---------------------------------------------------------------------------
// The payslip breakdown
// ---------------------------------------------------------------------------

test("the payslip renders view.js#payslipPanel and does no arithmetic of its own", () => {
  // Composing `bgNetSalary(bgGrossFromNet(salary))` inline in a `$derived` puts
  // arithmetic in the render layer, where nothing can test it (docs/site.md
  // §"A correct formula fed the wrong number"). With the same numbers shown
  // line by line the stakes are higher: a second call site that itemised the
  // typed NET instead of the recovered gross would put a plausible,
  // uniformly-light column on
  // screen.
  assert.ok(LIVE.includes("payslipPanel({"), "the breakdown must come from view.js#payslipPanel");
  assert.ok(LIVE.includes("payslip.lines"), "the fund rows are not rendered from the panel");
  for (const forbidden of ["bgGrossFromNet(", "bgPayrollBreakdown(", "bgPayslipFromNet("]) {
    assert.ok(
      !LIVE.includes(forbidden),
      `the calculator calls ${forbidden} directly — the gross↔net wiring belongs ` +
        "in view.js#payslipPanel, where a test can reach it"
    );
  }
});

test("every published contribution line gets a labelled row", () => {
  // The rows come from `mirror.js#BG_CONTRIB_LINES` via an `{#each}`, so a
  // contribution cannot be deducted from someone's pay without appearing in the
  // column that explains the deduction. The label map is the other half: a key
  // with no entry renders a nameless row, and a row labelled `sicknessMaternity`
  // is a bug that ships silently.
  assert.ok(
    LIVE.includes("{#each payslip.lines as line"),
    "the fund rows are hardcoded, not iterated"
  );
  assert.equal(
    BG_CONTRIB_LINES.length,
    5,
    `expected five contribution lines, found ${BG_CONTRIB_LINES.join(", ")}`
  );

  const labels = /PAYSLIP_LABEL = \{([\s\S]*?)\n {2}\};/.exec(APP);
  assert.ok(labels, "PAYSLIP_LABEL is gone");
  for (const key of BG_CONTRIB_LINES) {
    assert.match(
      labels[1],
      new RegExp(`\\b${key}:\\s*COPY\\.\\w+`),
      `the contribution line \`${key}\` has no label in PAYSLIP_LABEL — it would render as a nameless row`
    );
  }
});

// ---------------------------------------------------------------------------
// Provenance wiring — the number on screen and the link under it must agree
// ---------------------------------------------------------------------------

test("the ranked view is wired to the exact decomposition", () => {
  // The copy tells the reader "they add up to exactly your number". Built from
  // some other ordering or a re-derived rate, that sentence becomes false with
  // nothing failing.
  assert.ok(LIVE.includes("contributions({"), "the ranked view must use mirror.js#contributions");
  assert.ok(
    LIVE.includes("contributionPp"),
    "the ranked rows no longer carry their pp contribution"
  );
  assert.ok(
    CONTENT.includes("rankHead") && CONTENT.includes("rankRow"),
    "the ranked view's copy keys are gone"
  );
});

test("every basket row carries its own verify link", () => {
  // Divisions link to their own extract; groups link to theirs. A group that
  // inherited its parent's link would send the reader to a different number
  // than the one on their screen. Both levels resolve through `estatCatUrl`,
  // which is `view.js#verifyUrl` bound to the current anchor, so the extract
  // behind the "↗" contains the figure printed beside it.
  assert.ok(LIVE.includes("estatCatUrl(c)"), "division rows lost their verify link");
  assert.ok(LIVE.includes("estatCatUrl(g)"), "group rows lost their own verify link");
  assert.ok(
    LIVE.includes("estatCatUrl = (cat) => verifyUrl(cat, anchor)"),
    "estatCatUrl must resolve through view.js#verifyUrl against the live anchor, " +
      "not pick an extract on its own"
  );
});

test("the percentile marker is bound to the bottom-referenced rank, per earner", () => {
  // `percentile()` returns a position FROM THE BOTTOM (1 = poorest). The
  // inverted `100 - rank` framing rendered a below-median income as "top 63%"
  // and put the marker on the wrong side of the ladder. The arithmetic is
  // tested in verify_view.mjs; this is the wiring, and the wording rule lives
  // in verify_copy.mjs.
  assert.ok(
    LIVE.includes("earnerRanks({ nets: nets, ladder: ladder })"),
    "the calculator no longer ranks through view.js#earnerRanks"
  );
  assert.ok(
    LIVE.includes('style="left:{r.ahead}%"'),
    "the ladder marker must bind to `ahead` so a higher income moves it right"
  );
  // The ladder rungs are INDIVIDUAL earnings. Ranking the household total on
  // them reports two people on €900 each as out-earning 78% of Sofia, which is
  // nobody's position — so the row must draw one marker per earner rather than
  // one for the sum.
  assert.ok(
    /\{#each ranks as r[^}]*\}\s*<span class="me"/.test(FLAT),
    "the ladder draws one marker for the household instead of one per earner"
  );
  assert.ok(
    !LIVE.includes("percentile(householdNet"),
    "the household total is being ranked on a ladder of individual earnings"
  );
});

test("a gross becomes a net in exactly one place", () => {
  // The pay field takes either basis, and everything below it is a statement
  // about TAKE-HOME: rent as a share of pay, the basket, the 30% mortgage line,
  // the position on the earnings ladder. Each is wrong by around 29% when fed a
  // gross, and the mortgage one is wrong in the direction that calls a home
  // affordable — which AGENTS.md forbids in as many words.
  assert.ok(
    LIVE.includes("nets = $derived(netsOf(pay, data.payroll))"),
    "the calculator no longer converts through view.js#netsOf"
  );
  // Every per-person panel takes a `pay` OBJECT, which carries the basis with
  // the amounts, so an amount cannot arrive anywhere without saying what it is.
  //
  // The wedge is fed `wedgePay` rather than `pay` itself: it withholds the
  // amounts until the reader has typed over the placeholder, so the row states
  // no gross for a person who entered nothing. That is still a pay object and
  // is asserted to be one below — what the rule forbids is a bare amount, not a
  // second object. Naming the accepted feeds rather than accepting any
  // expression is what keeps this from passing `pay: nets` or
  // `pay: earners[0].amount`.
  for (const [panel, feed] of [
    ["payslipPanel", "pay"],
    ["taxWedgePanel", "wedgePay"],
  ]) {
    const call = `${panel}({ payroll: data.payroll, pay: ${feed} })`;
    assert.ok(LIVE.includes(call), `${call} is no longer how the panel is fed`);
  }
  // `wedgePay` is the alternative feed, so what it IS gets pinned here too —
  // otherwise the loop above is satisfied by a name and the object behind it is
  // free to become the amounts alone. Both halves: the reader's own pay once
  // they have typed, and a pay object with no amounts before that.
  assert.match(
    FLAT,
    /wedgePay = \$derived\(\s*earnersDirty \? pay : \{ basis: payBasis, amounts: \[\] \}\s*\)/,
    "the wedge's pay object is no longer the reader's own pay gated on having " +
      "typed one — either the gate went, or what stands in for it stopped " +
      "carrying the basis"
  );
  // And the household total is built from the CONVERTED nets, never from what
  // was typed — the one line where a gross would reach the basket and the rent.
  assert.ok(
    LIVE.includes("householdNet = $derived(sumHouseholdNet(nets))"),
    "the household total is no longer summed from the converted nets"
  );
});

test("every income is asked for its own raise", () => {
  // A household's rise is not a number people share. Asking once and applying
  // it to everybody invents the missing answer, and weighting the combined
  // figure by TODAY's pay rather than the earlier pay overstates it — always in
  // the flattering direction (mirror.js#householdNetRaisePct).
  assert.ok(
    LIVE.includes("householdRaise({"),
    "the calculator no longer combines the raises through view.js#householdRaise"
  );
  assert.ok(
    !LIVE.includes("raise = $state("),
    "the raise is a single field again, shared across every earner"
  );
  assert.ok(
    FLAT.includes("{#each earners as earner, i (i)}"),
    "the inputs card no longer draws a raise field per income"
  );
});

test("the anchor dropdown names the window its maths actually uses", () => {
  // Readers could not tell "1 year ago" from "2025" — different maths behind
  // similar labels. The window is derived from the data rather than written
  // down, and a hint under the select flips with the selection. This pins the
  // wiring; the wording is free to change.
  const open = /<select\b[^>]*\bid="inAnchor"/.exec(APP);
  assert.ok(open, 'the anchor <select id="inAnchor"> is gone');
  const close = APP.indexOf("</select>", open.index);
  const block = APP.slice(open.index, close);
  const hint = APP.slice(close, close + 800);

  for (const name of [
    "yoyWindowLabel",
    "basketRefPeriod",
    "basketPrevPeriod",
    "idxLatestYearLabel",
  ]) {
    assert.ok(
      APP.includes(name),
      `\`${name}\` is gone — the anchor options lose the date window that says which months the number covers`
    );
  }
  assert.ok(block.includes("yoyWindowLabel"), "the y1 option renders without its date window");
  assert.ok(block.includes("idxLatestYearLabel"), "year options render as bare years again");
  assert.ok(
    hint.includes("anchorY1Hint") && hint.includes("anchorSinceHint"),
    "the anchor <select> must be followed by a hint explaining the selected maths"
  );
  assert.ok(hint.includes('anchor === "y1"'), "the hint no longer switches on the selected anchor");
});

test("the share card is dated by the month its two figures describe", () => {
  // Both percentages on the card are Σ(w·r) over `hicp_categories.json`, so the
  // date drawn beneath them — «Данни: Евростат (HICP), юни 2026 г.» — has to be
  // the divisions' month. Eurostat's flash publishes the all-items rate about
  // two weeks ahead of them, and for that fortnight `headlineRefPeriod` names a
  // month the basket figures do not cover: the card then read «юли 2026 г.»
  // over June's numbers, with the anchor selector on the same page saying
  // «2025.06 → 2026.06».
  //
  // Pinned here rather than in `verify_view.mjs`, which proves `sharePayload`
  // returns whatever period it was handed and structurally cannot see which one
  // the caller chose. And the card is a canvas, so no render test can read the
  // string back off the DOM either — this wiring is the only place it is
  // visible.
  const call = /sharePayload\(\{[\s\S]*?\}\)/.exec(LIVE);
  assert.ok(call, "the calculator no longer builds its share payload through sharePayload");
  assert.match(
    call[0],
    /refPeriod:\s*basketRefPeriod/,
    `the share card is dated by something other than the basket's own month: ${call[0]}`
  );
});

test("the Sofia comparator reads the live НСИ wage and links to it", () => {
  // The card compares the reader's net pay with Sofia's average wage. It must
  // read the live `region_salary.json` rather than a hardcoded number, and link
  // to that payload's own source, so the figure on screen and the link under it
  // agree.
  assert.ok(
    LIVE.includes("data.regionSalary"),
    "the comparator card is back on a hardcoded number"
  );
  for (const name of ["regionMeanGrossEur", "regionMeanGrossUrl"]) {
    assert.ok(LIVE.includes(name), `the calculator no longer derives \`${name}\``);
  }
  // The gap itself is decided in view.js#regionGap, per earner, and the
  // component only picks the word and the colour. Both halves matter: НСИ
  // publish a WAGE, so measuring a two-earner total against it reports a
  // household of two on €900 each as above the average worker.
  assert.ok(
    LIVE.includes("regionGap({ nets: nets, regionNet: regionNet })"),
    "the comparator no longer computes the (earner − Sofia) gap through view.js"
  );
  assert.ok(
    !PAY.includes("householdNet - regionNet"),
    "the comparator is back on the household total instead of one earner at a time"
  );
});

test("the home block prices m² off the live имот.bg median, and cites imot.bg", () => {
  // Both halves matter: the number once came from a hardcoded €1300 with no
  // source, and the provenance link once pointed at `prc_hicp_minr` — consumer
  // prices, the wrong dataset entirely for property.
  assert.ok(
    APP.includes("data.cityPrice") && APP.includes("cityEurPerM2"),
    "the home block is back on a hardcoded value"
  );
  assert.ok(
    APP.includes("cityEurPerM2 * HOME.m2Default"),
    "the national-strip home stat no longer prices m² off the live Sofia median"
  );

  const at = APP.indexOf('<a href="https://www.imot.bg/sredni-ceni"');
  assert.ok(at > 0, "the home-stat footer no longer links to imot.bg/sredni-ceni");
  const around = APP.slice(Math.max(0, at - 400), at + 400);
  assert.ok(
    !around.includes("prc_hicp_minr/default"),
    "the home-stat footer cites prc_hicp_minr (consumer prices) next to the " +
      "property €/m² reading. Residential prices come from имот.bg."
  );
});

// ---------------------------------------------------------------------------
// The source line: every dataset named produces a figure, and vice versa
// ---------------------------------------------------------------------------

/** Every Eurostat dataset id a rendered payload actually sources from. */
/** A Eurostat dataset id wherever one appears inside a URL on a page. */
const ID_IN_URL = /(?:databrowser\/view\/|1\.0\/data\/)([a-z0-9_]+)/g;

function datasetsInUse() {
  const PROVENANCE_KEYS = new Set(["dataset", "source_url", "api_url", "api_url_index"]);
  const ID = /\b((?:prc|une|ilc|earn|namq|nama|hbs)_[a-z0-9_]+)\b/g;
  const found = new Set();

  // Only provenance-bearing keys are scanned, never prose:
  // `classification.note` names `prc_hicp_inw` precisely to say we must never
  // join it, and a scan over free text would read that warning as a citation
  // and then demand the page advertise it.
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (PROVENANCE_KEYS.has(k) && typeof v === "string") {
          for (const [, id] of v.matchAll(ID)) found.add(id);
        } else walk(v);
      }
    }
  };

  // The manifest is the set of payloads the page renders, so it is also the set
  // whose upstreams the source line owes a citation.
  for (const stem of PAYLOAD_FILES) {
    const payload = published(stem);
    if (payload) walk(payload);
  }
  return found;
}

test("the source line names every Eurostat dataset the page uses, and no others", () => {
  // A dataset that sounds like it belongs — `ilc_di01`, `namq_10_lp_ulc`,
  // `prc_hpi_q` — puts no figure on the page: the first is built into no
  // payload, the other two appear nowhere in the pipeline. The failure runs
  // both ways, and the quieter direction is omission: `earn_ses_monthly` is
  // the entire shape of the pay ladder.
  //
  // The product's one claim is that every number traces to an official series.
  // Naming a source that produced nothing on the page breaks that claim from
  // the other side: the first reader who follows the link finds a dataset with
  // no figure of ours in it.
  const block = /<div class="srcline">([\s\S]*?)<\/div>/.exec(LIVE);
  assert.ok(block, "the .srcline source list is gone");
  const cited = new Set(
    [...block[1].matchAll(/databrowser\/view\/([a-z0-9_]+)\/default/g)].map((m) => m[1])
  );
  assert.ok(cited.size, "the source line cites no Eurostat dataset at all");

  const inUse = datasetsInUse();
  if (!inUse.size) return; // no refresh in this checkout

  const orphaned = [...cited].filter((d) => !inUse.has(d)).sort();
  assert.deepEqual(
    orphaned,
    [],
    `the source line cites Eurostat datasets that feed nothing the SPA renders: ` +
      `${orphaned.join(", ")}. Either the page stopped using them or it never did.`
  );
  const uncredited = [...inUse].filter((d) => !cited.has(d)).sort();
  assert.deepEqual(
    uncredited,
    [],
    `the SPA renders numbers from Eurostat datasets the source line does not ` +
      `name: ${uncredited.join(", ")}. Every figure is supposed to be traceable ` +
      "from the page itself."
  );
});

test("the source line credits the non-Eurostat upstreams too", () => {
  // The Sofia wage level, the €/m², the mortgage rate and the lending caps are
  // not Eurostat figures, and a source list that stops at Eurostat reads as if
  // they were.
  const block = /<div class="srcline">([\s\S]*?)<\/div>/.exec(LIVE);
  assert.ok(block, "the .srcline source list is gone");
  for (const needle of ["nsi.bg", "imot.bg", "data-api.ecb.europa.eu", "bnb.bg"]) {
    assert.ok(block[1].includes(needle), `the source line does not link ${needle}`);
  }
});

test("the ranked column draws the remainder its sentence promises", () => {
  // `rankLead` promises the rows sum to the reader's number, and the list is
  // capped at eight rows. On the default Bulgarian basket twelve divisions
  // clear the drawing threshold, so the visible points summed to 5.1 under a
  // sentence saying 5.4 — false on screen while `mirror.js#contributions` was
  // exactly right. The arithmetic lives in `view.js#rankedSplit`
  // (verify_view.mjs asserts Σshown + rest === π); this asserts the template
  // actually draws the remainder it is handed.
  // Two halves, because the row cap is no longer one number. A narrow column
  // draws five rows and a wide one eight, so the call carries a limit — which
  // `rankedSplit` has always taken and `verify_view.mjs` already exercises at
  // 3 and at 8. What must not change is WHERE the slicing happens, so the
  // check is now the property the exact-string match stood in for: the split
  // goes through view.js, and the template does none of its own. That is
  // strictly more than the old assertion caught — a template that called
  // `rankedSplit(ranked)` and then sliced the result again passed it.
  assert.match(
    LIVE,
    /rankedSplit\(ranked(,\s*[A-Za-z_$][\w$]*)?\)/,
    "the ranked list no longer goes through view.js#rankedSplit — the slicing " +
      "arithmetic has moved back into the template, where nothing can test that " +
      "the column still sums to π"
  );
  const slicing = [...LIVE.matchAll(/\b(ranked|shown|rows)\s*\.\s*slice\(/g)].map((m) => m[0]);
  assert.deepEqual(
    slicing,
    [],
    "the template slices the ranked rows itself: " +
      `${slicing.join(", ")}. Whatever is cut has to be folded into the remainder ` +
      "by rankedSplit, or the column stops summing to the number rankLead promises"
  );
  assert.ok(
    LIVE.includes("COPY.rankRest"),
    "the remainder row is gone. Either render it or stop claiming in " +
      "COPY.rankLead that the rows add up to exactly the reader's number."
  );
  assert.match(
    LIVE,
    /\{#if restN > 0\}/,
    "the remainder row is not conditional on there being one"
  );
  for (const lang of ["bg", "en"]) {
    assert.match(
      LIVE,
      new RegExp(`t\\(COPY\\.rankRest, "${lang}"`),
      `the remainder row is missing its ${lang} variant`
    );
  }
});

test("no percentage is printed with a sign the template wrote itself", () => {
  // `+{fmt(x)}%` renders «+−1,2%» the moment x goes negative, and three of
  // these were reachable on published data: the raise field takes a pay cut,
  // and π follows the sliders onto groups whose annual rate is below zero.
  // `$lib/format.js#percentSigned` is the one place the sign of a displayed
  // percentage is decided; its behaviour is tested in verify_format.mjs and
  // this holds the wiring.
  assert.ok(
    read("lib", "format.js").includes("export function percentSigned("),
    "$lib/format.js no longer exports percentSigned, the one place the sign of " +
      "a displayed percentage is decided"
  );
  assert.ok(
    APP.includes("percentSigned"),
    "the calculator no longer binds signedPct to percentSigned, so a template " +
      "is deciding the sign of a percentage for itself again"
  );
  const glued = [...LIVE.matchAll(/\+\{fmt0?\([^)]*\)/g)].map((m) => m[0]);
  assert.deepEqual(
    glued,
    [],
    `these glue a "+" onto a formatted number, so a negative value renders as ` +
      `"+−1,2%": ${glued.join(", ")}`
  );

  // A sign CHOSEN by testing the number's direction is the same offence, and
  // the regex above cannot see it. Six of these stood across four components —
  // `{rate < 0 ? "" : "+"}{fmt(rate)}` and `{pp >= 0 ? "+" : "−"}` — each
  // avoiding the double sign and getting the other two rules wrong. A rate of
  // 0.0 (Eurostat publishes one decimal, and «Облекло и обувки» is 0.0 on the
  // payload in this tree) printed «+0,0%», prices rose by nothing; and the
  // minus came from `toLocaleString`, U+002D against the U+2212 the rest of
  // the page uses. All of that is what this test's NAME has always claimed to
  // cover, and it went green beside all six for as long as they stood.
  //
  // Anchored on a comparison against 0, not on the quoted sign alone: the
  // basket's fold-out button writes `{open ? "−" : "+"}` for its own glyph,
  // which is a caret rather than the direction of a number, and a rule that
  // cannot tell those apart is one somebody switches off.
  //
  // `format.js` is deliberately outside `LIVE`. The sign has to be decided
  // somewhere, and that is the somewhere.
  const chosen = [...LIVE.matchAll(/[<>]=?\s*0\s*\?\s*(?:"[+−]"|""\s*:\s*"[+−]")/g)].map(
    (m) => m[0]
  );
  assert.deepEqual(
    chosen,
    [],
    `a template picks a sign by testing a number instead of calling signed() ` +
      `or percentSigned(), so its zero reads as a direction and its minus is ` +
      `the wrong glyph: ${chosen.join(", ")}`
  );
});

test("the method stays published, once, at the end of the explainer", () => {
  // docs/principles.md §"Publish the method": the method is public by design and
  // nothing may make the product less checkable. Moving the algebra out of the
  // results drawer keeps
  // that promise only for as long as it lands somewhere a reader can reach —
  // one closed `<details class="fx">` under COPY.explainMath, after the
  // plain-language answers.
  const at = LIVE.indexOf('<section class="explain-band">');
  assert.ok(at > 0, "the explainer band is gone");
  const band = LIVE.slice(at);

  assert.ok(
    band.includes("COPY.explainMath"),
    "the formula block is no longer labelled from COPY.explainMath, so it ships " +
      "in one language only — or it is gone"
  );
  for (const fragment of MATH_FRAGMENTS) {
    assert.ok(
      band.includes(fragment),
      `the explainer no longer publishes "${fragment}". This is the only place ` +
        "the method is written down for a reader \u2014 docs/principles.md keeps " +
        "the method published; move it, never delete it."
    );
  }
  const blocks = LIVE.split('<details class="fx">').length - 1;
  assert.equal(
    blocks,
    1,
    "the method is published in more than one place. One block, at the end of " +
      "the explainer — anything else is the per-item formula toggles growing back."
  );
});

test("the results drawer explains in words and carries no algebra", () => {
  // Each of the drawer's four items is a short plain sentence and an example in
  // round numbers — the reader's first explanation of their OWN number, and it
  // has to be readable at a glance by someone who will never check our
  // arithmetic. Being right is our job, not theirs — a «виж формулата» toggle
  // under each item puts four maths prompts between the reader and the
  // explanation of their own number.
  const src = read("components", "MethodDrawer.svelte");
  const drawer = live(src.slice(src.indexOf("</script>")));

  const details = drawer.split("<details").length - 1;
  assert.equal(
    details,
    1,
    "the drawer has a nested <details> again. Every figure it explains is " +
      "explained in words; a toggle here is the formula block coming back."
  );
  assert.ok(
    !drawer.includes("<code>") && !drawer.includes("COPY.drawerFormula"),
    "the drawer renders a formula again. The method belongs in the explainer " +
      "band's COPY.explainMath block, published once."
  );
  for (const fragment of MATH_FRAGMENTS) {
    assert.ok(
      !drawer.includes(fragment),
      `the drawer shows "${fragment}". It is published in the explainer band; ` +
        "repeating it here is what this change removed."
    );
  }

  const items = [...drawer.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items.length, 4, `the drawer has ${items.length} items, expected 4`);
  items.forEach((item, i) => {
    // Both languages ship in every item, so this counts BG and EN together.
    const prose = item
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    assert.ok(
      prose.length > 150 && prose.length < 1200,
      `drawer item ${i + 1} carries ${prose.length} characters of prose. Under ` +
        "150 it explains nothing; over 1200 it is an essay again, which is the " +
        "state this drawer was shortened out of."
    );
  });
});

test("the Sofia comparator states the gap once, not twice", () => {
  // «-39% под средната» is a double negative: the sign and the direction word
  // say the same thing, and together they read as −39% BELOW, which is +39%.
  const delta = /function deltaPhrase\([\s\S]*?\n {2}\}/.exec(PAY);
  assert.ok(delta, "the Sofia comparator no longer builds a {delta} clause");
  assert.ok(
    !PAY.includes("regionSign") && !PAY.includes("signedPct"),
    "the Sofia comparator emits a sign alongside the direction word again"
  );
  assert.ok(
    delta[0].includes("magnitudePct"),
    "the comparator no longer takes the magnitude unsigned"
  );
  // And the magnitude is unsigned where it is COMPUTED, not fixed up here.
  // `mirror.js#wageGap` is that place for both comparisons on this card — the
  // Sofia average and the reader's sector — so one rounding and one dead band
  // serve both, and neither can drift into emitting a signed magnitude on its
  // own.
  assert.ok(
    MIRROR.includes("magnitudePct: Math.abs(diffPct)"),
    "mirror.js#wageGap no longer publishes an unsigned magnitude"
  );
  assert.ok(
    !VIEW.includes("Math.abs(diffPct)"),
    "view.js computes a gap magnitude again — there is one implementation, in mirror.js"
  );
});

// ---------------------------------------------------------------------------
// `/how/` — the country's figures on a page of their own
//
// The same rule as the calculator's source line, from both directions: we show
// no figure whose source is unnamed, and we cite no source that produced
// nothing on the page. It is checked separately because `/how/` is a build
// entry of its own and `calculatorSource()` deliberately does not read it —
// this page has no calculator in it and none of the assertions above apply.
// ---------------------------------------------------------------------------

const HOW = live(read("How.svelte"));

test("the country page cites every Eurostat dataset it renders, and no others", () => {
  // A dataset named here that feeds nothing sends the first reader who follows
  // the link to a cube with no figure of ours in it. The quieter direction is
  // omission: `earn_ses_monthly` is the entire shape of the pay ladder, and a
  // ladder rendered without it reads as ours rather than as a survey's.
  const cited = new Set([...HOW.matchAll(ID_IN_URL)].map((m) => m[1]));
  assert.ok(cited.size, "the country page links no Eurostat dataset at all");

  const inUse = datasetsInUse();
  if (!inUse.size) return; // no refresh in this checkout

  assert.deepEqual(
    [...cited].filter((d) => !inUse.has(d)).sort(),
    [],
    "the country page links Eurostat datasets that feed nothing it renders"
  );
  assert.deepEqual(
    [...inUse].filter((d) => !cited.has(d)).sort(),
    [],
    "the country page renders figures from Eurostat datasets it never links. " +
      "Every number on it is supposed to be checkable from the page itself (P3)."
  );
});

test("the country page renders no figure it did not get from view.js", () => {
  // The rule the whole five-layer split exists for, on the page furthest from
  // the calculator's own tests. Every figure here comes off one of the four
  // `Calculator` values that take payloads and no scalar — so an arithmetic
  // operator in the markup is either a new derived value with no test behind
  // it, or a reader's figure that has found its way onto a page with no reader.
  const markup = HOW.slice(HOW.indexOf("</script>"));
  // A multiplication or a division between two operands, anywhere in the
  // template. The URL constants live above the slice, so the `/` in an address
  // is out of range; `<br />` and `</div>` do not match because the character
  // before the slash is not an operand.
  const arithmetic = [...markup.matchAll(/[\w)\]]\s*[*/]\s*[\w($]/g)].map((m) => m[0]);
  assert.deepEqual(
    arithmetic,
    [],
    `the country page computes in its markup: ${arithmetic.join(" | ")}. ` +
      "Derived values belong in view.js with a test in verify_view.mjs."
  );
});

test("the country page has no input, and imports nothing that would give it one", () => {
  // Prerendering the whole page rests on nothing here being the reader's. An
  // input would end that quietly — the page would still render and every other
  // test would stay green, while the served HTML started carrying a default
  // somebody chose (P7) or a figure derived from one (P2).
  for (const tag of ["<input", "<textarea", "<select", "contenteditable", "bind:value"]) {
    assert.ok(
      !HOW.includes(tag),
      `How.svelte renders a ${tag}. The page is a reference with no reader in ` +
        "it, and every figure on it is prerendered on exactly that basis."
    );
  }
  // …and none of the reader's own state reaches it. `m2` is the slider in the
  // home block; `HOME.m2Default` is the constant the page states on screen.
  assert.ok(
    !/\bcalc\.(m2|rent|cash|earners|weights|nets|householdNet|payslip|wedge)\b/.test(
      read("How.svelte")
    ),
    "the country page reads a value the reader types into the calculator"
  );
});

// ---------------------------------------------------------------------------
// The sector comparison
// ---------------------------------------------------------------------------

test("the sector card cannot turn an average into a rank", () => {
  const src = calculatorSource();

  // **`meanRungPosition` reads the Eurostat shape and never the sector.** It is
  // the national correction for reading an average as a middle; fed a sector
  // average it would emit a sector percentile, and there is no published
  // distribution by activity for BG behind such a figure. The call site is the
  // last place that can be got wrong, since the function itself takes no
  // anchor.
  const call = /meanRungPosition\(([^)]*)\)/.exec(src);
  assert.ok(call, "the sector card no longer computes how much an average flatters");
  assert.ok(
    /^\s*this\.data\.salaryDist\s*$/.test(call[1]),
    `meanRungPosition is called with "${call[1]}" — it takes the Eurostat shape and nothing else`
  );
  assert.ok(
    !/meanRungPosition\([^)]*sector/i.test(src),
    "meanRungPosition is being handed a sector figure, which would invent a sector rank"
  );
});

test("the sector figure never travels without the sentence that qualifies it", () => {
  const src = calculatorSource();

  // НСИ publish an average by activity and nobody publishes a distribution by
  // one. A gap shown without saying so reads as a rank, so the two are wired
  // together here: render the number and this holds you to the sentence.
  assert.ok(/COPY\.sectorDiff\b/.test(src), "the sector gap is no longer rendered");
  assert.ok(
    /COPY\.sectorNoRank\b/.test(src),
    "the sector gap renders without the line saying no pay distribution by sector is published"
  );
  assert.ok(
    /COPY\.sectorAverageFlatters\b/.test(src),
    "the sector gap renders without the correction for how much an average flatters"
  );
  assert.ok(
    /COPY\.sectorCoverage\b/.test(src),
    "the sector gap renders without saying who the series counts"
  );

  // The section label reaches markup through a formatter, like every other
  // fetched string on the page — `format.js#label`, and template safety holds
  // the wider rule.
  assert.ok(
    !/sector:\s*calc\.sector\.(bg|en)Name/.test(src),
    "an НСИ section name reaches the template unformatted"
  );

  // **One verify link per language.** НСИ publish this table twice and the
  // section names differ between the editions, so a Bulgarian reader sent to
  // the English workbook cannot find the row they just read — the link would
  // demonstrate nothing, which is the whole point of having it (P3, P9).
  assert.ok(
    src.includes("httpUrl(calc.sector.sourceUrlBg)"),
    "the Bulgarian verify link does not point at НСИ's Bulgarian edition"
  );
  assert.ok(
    src.includes("httpUrl(calc.sector.sourceUrl)"),
    "the English verify link does not point at НСИ's English edition"
  );
});
