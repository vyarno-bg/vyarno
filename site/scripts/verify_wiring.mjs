/**
 * Template wiring contracts — which value the markup feeds to which function.
 *
 * These are the invariants that survive as source checks because there is
 * nothing else to check them against. A wrong wiring is not a wrong formula
 * and not a wrong string: `mirror.js` can be perfect, `content.js` can be
 * perfect, and the page can still print thirteen euro figures the reader never
 * typed because the template handed `spendable` to a function that wanted
 * `spendBase`. `verify_view.mjs` proves the arithmetic; `verify_render.mjs`
 * proves the page draws. Neither can see which argument the template passed.
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
 * These lived in `the SPA contract file in pipeline/tests/ (now test_published_contracts.py, which keeps only the published-artefact half)` until the
 * migration described in docs/testing-strategy.md. They read the same sources;
 * what changed is that they now run in the runner that owns this language, and
 * that where a module exports the thing under test they IMPORT it rather than
 * regexing it out of a file — `PRESETS`, `BG_CONTRIB_LINES` and the published
 * JSON are all read as values here.
 *
 * Assertions match on token sequence, never on layout: `flat()` collapses
 * whitespace so a Prettier run cannot fail a test that no behaviour change
 * would. That is not a stylistic preference — introducing Prettier once turned
 * thirty assertions red without breaking anything, because they were pinned to
 * line wrapping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PRESETS } from "../src/lib/content.js";
import { BG_CONTRIB_LINES } from "../src/lib/mirror.js";
import { PAYLOAD_FILES } from "../src/lib/payloads.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const DATA_DIR = join(HERE, "..", "..", "data", "published");
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

/** A published payload, or null when no refresh has been run in this checkout. */
function published(name) {
  const path = join(DATA_DIR, `${name}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

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
  assert.ok(
    live(MIRROR).includes("weight_pct_of_parent"),
    "the default within-division split must come from the published shares"
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

test("the percentile marker is bound to the bottom-referenced rank", () => {
  // `percentile()` returns a position FROM THE BOTTOM (1 = poorest). The
  // inverted `100 - pctRank` framing rendered a below-median income as "top
  // 63%" and put the marker on the wrong side of the ladder. The arithmetic is
  // tested in verify_view.mjs; this is the wiring, and the wording rule lives
  // in verify_copy.mjs.
  assert.ok(
    LIVE.includes("pctAheadOf(pctRank)"),
    "the calculator no longer derives pctAhead from view.js#pctAhead"
  );
  assert.ok(
    LIVE.includes('style="left:{pctAhead}%"'),
    "the ladder marker must bind to `pctAhead` so a higher income moves it right"
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
    "headlineRefPeriod",
    "headlinePrevPeriod",
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

test("the Sofia comparator reads the live НСИ wage and links to it", () => {
  // The card compares the reader's net pay with Sofia's average wage. It must
  // read the live `sofia_salary.json` rather than a hardcoded number, and link
  // to that payload's own source, so the figure on screen and the link under it
  // agree.
  assert.ok(LIVE.includes("data.sofiaSalary"), "the comparator card is back on a hardcoded number");
  for (const name of ["sofiaMeanGrossEur", "sofiaMeanGrossUrl"]) {
    assert.ok(LIVE.includes(name), `the calculator no longer derives \`${name}\``);
  }
  assert.ok(
    LIVE.includes("salary - sofia"),
    "the comparator no longer computes the (reader − Sofia) gap"
  );
});

test("the home block prices m² off the live имот.bg median, and cites imot.bg", () => {
  // Both halves matter: the number once came from a hardcoded €1300 with no
  // source, and the provenance link once pointed at `prc_hicp_minr` — consumer
  // prices, the wrong dataset entirely for property.
  assert.ok(
    APP.includes("data.sofiaPrice") && APP.includes("sofiaEurPerM2"),
    "the home block is back on a hardcoded value"
  );
  assert.ok(
    APP.includes("sofiaEurPerM2 * HOME.m2Default"),
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
  const offenders = [...LIVE.matchAll(/\+\{fmt0?\([^)]*\)/g)].map((m) => m[0]);
  assert.deepEqual(
    offenders,
    [],
    `these glue a "+" onto a formatted number, so a negative value renders as ` +
      `"+−1,2%": ${offenders.join(", ")}`
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
  const delta = /@const sofiaDelta =[\s\S]*?\}(?=\s*\{@const)/.exec(FLAT);
  assert.ok(delta, "the Sofia comparator no longer builds a {delta} clause");
  assert.ok(
    !LIVE.includes("sofiaSign"),
    "the Sofia comparator emits a sign alongside the direction word again"
  );
  assert.ok(
    delta[0].includes("Math.abs(sofiaDiff)"),
    "the comparator no longer takes the magnitude unsigned"
  );
});
