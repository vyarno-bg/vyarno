/**
 * Invariants over the UI copy — checked against the real `COPY` object.
 *
 * **These rules are asserted against the imported module, never against
 * `content.js` read as text.** Regexing `key: { bg: "…", en: "…" }` out of a
 * JavaScript file and unescaping the matches by hand works until a string
 * contains a brace, a nested quote or a template literal, and even then it can
 * only check the keys somebody remembered to name. Importing `COPY` checks
 * every key there is, and checks the values the app actually renders.
 *
 * Two kinds of rule live here:
 *
 * 1. Structural — every entry ships both languages, every key is rendered,
 *    every rendered key exists. These are general: they cover keys added
 *    tomorrow without anyone adding a test.
 *
 * 2. Editorial — the handful of sentences where the wording is a commitment
 *    rather than a preference: the calculator describes and never advises,
 *    and it never presents a figure as more official than it is.
 *
 * What is NOT here: anything about where a string appears in the layout. That
 * is `verify_render.mjs`, which loads the page.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COPY } from "../src/lib/content.js";
import { PAYLOADS } from "../src/lib/payloads.js";
import { SHARE_COPY_KEYS, SHARE_DOMAIN, SHARE_ORIGIN } from "../src/lib/view.js";
import { shareCardText, SHARE_CARD_COPY_KEYS } from "../src/lib/share-card.js";
import { published } from "./published-payload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

/**
 * A source file with its comments blanked.
 *
 * A comment describing a bug must never satisfy the test for its fix — the
 * explainer carries a comment naming the exact literals it must not print,
 * which is precisely the trap. Markup comments, block comments and whole-line
 * `//` comments all go; trailing `//` is left alone so a `https://` inside a
 * string literal survives.
 */
function blankComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}

/** Every .svelte and .js source under src/, comments blanked, concatenated. */
function readLiveSources() {
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      // Blanked per FILE, before anything is joined or collapsed. The `//`
      // pass above works line by line, so it has to see line breaks — hand it
      // whitespace-normalised text and it gets one line to look at, blanks
      // nothing, and every `//` comment in src/ counts as live code for the
      // rest of this file.
      else if (/\.(svelte|js)$/.test(entry.name))
        parts.push(blankComments(readFileSync(path, "utf8")));
    }
  };
  walk(SRC);
  // Whitespace-normalised: these checks are about which names appear near
  // each other, not about where Prettier chose to break the line.
  return parts.join("\n").replace(/\s+/g, " ");
}

/** Read once: nothing here mutates the tree, and several tests scan it. */
const LIVE_SOURCES = readLiveSources();

/** The `{ bg, en }` entries of COPY, as [key, value] pairs. */
function bilingualEntries() {
  return Object.entries(COPY).filter(
    ([, v]) => v && typeof v === "object" && ("bg" in v || "en" in v)
  );
}

test("every COPY entry ships both languages, non-empty", () => {
  const offenders = [];
  for (const [key, value] of bilingualEntries()) {
    for (const lang of ["bg", "en"]) {
      if (typeof value[lang] !== "string" || value[lang].trim() === "") {
        offenders.push(`COPY.${key}.${lang}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a row rendered in one language only is a blank line for half the " +
      `audience: ${offenders.join(", ")}`
  );
});

test("no COPY key is dead, and no rendered key is missing", () => {
  const sources = LIVE_SOURCES;
  const declared = new Set(Object.keys(COPY));

  // A key with no render site is dead weight that reads as shipped. Both
  // access forms count: `COPY.key`, and the dynamic `COPY[chosenKey]` the
  // Sofia comparator uses, where the key name appears as a string literal.
  const unused = [...declared].filter(
    (key) => !new RegExp(`COPY\\.${key}\\b|["']${key}["']`).test(sources)
  );
  assert.deepEqual(unused, [], `COPY keys nothing renders: ${unused.join(", ")}`);

  // …and the reverse: a typo'd reference renders "undefined" silently.
  const referenced = new Set([...sources.matchAll(/\bCOPY\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const missing = [...referenced].filter((key) => !declared.has(key));
  assert.deepEqual(missing, [], `rendered COPY keys that do not exist: ${missing.join(", ")}`);
});

test("the payload manifest's reader-facing strings follow the COPY rules too", () => {
  // `payloads.js` carries a `name` and a `feeds` sentence per payload, and the
  // data panel renders both. They are copy, and they live outside `COPY` on
  // purpose — a row's label belongs beside the row's cadence and accessor, not
  // in a separate file keyed by payload — so none of the structural rules above
  // reach them. This applies the same three: both languages, non-empty, and the
  // right alphabet in each.
  const offenders = [];
  for (const entry of PAYLOADS) {
    for (const field of ["name", "feeds"]) {
      const value = entry[field];
      for (const lang of ["bg", "en"]) {
        const text = value?.[lang];
        if (typeof text !== "string" || text.trim() === "") {
          offenders.push(`${entry.file}.${field}.${lang} is empty`);
          continue;
        }
        if (lang === "bg" && !/[а-яА-Я]/.test(text)) {
          offenders.push(`${entry.file}.${field}.bg is not in Bulgarian`);
        }
        // НСИ and БНБ have settled English spellings the rest of the copy
        // already uses (NSI, BNB) — see COPY.footerData. A Cyrillic acronym
        // dropped into an English sentence is how this slips through.
        if (lang === "en" && /[а-яА-Я]/.test(text)) {
          offenders.push(`${entry.file}.${field}.en carries Cyrillic: ${text}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("; "));
});

test("every placeholder in a COPY string is substituted somewhere", () => {
  // `t(COPY.x, lang, { … })` fills `{name}` placeholders. One left unfilled
  // renders the literal braces to the reader.
  const sources = LIVE_SOURCES;
  const offenders = [];
  for (const [key, value] of bilingualEntries()) {
    for (const lang of ["bg", "en"]) {
      // Both spellings are in use: `{name}` for `t()` substitution and
      // `{{name}}` for the `.replace()` chains.
      for (const [, name] of (value[lang] ?? "").matchAll(/\{\{?([a-zA-Z_]\w*)\}\}?/g)) {
        // Either `t(COPY.key, lang, { name: … })` or a `.replace("{name}", …)`
        // chain hanging off the key. Dynamic access counts too: `COPY[key]`
        // where the key appears as a string literal nearby — LeftoverRow does
        // this for the housing variants, ResultsSummary for preset labels.
        // The first branch is the simpler direct form: anywhere in the source,
        // either `name:` in an object literal or a `replace("{name}", …)`.
        const directForm = new RegExp(`(\\b${name}\\s*:|replace\\( ?["']\\{{1,2}${name}\\})`);
        // The second branch is the dynamic form: near `COPY.key` or
        // `COPY["key"]`, a `name:` appears within 400 chars. 400 chars is
        // enough for a single Svelte template; longer than that and the
        // substitution would have moved out of the render call.
        const dynamicForm = new RegExp(
          `(COPY\\.${key}\\b|COPY\\[\\s*["']${key}["']\\s*\\]).{0,400}?\\b${name}\\s*:`,
          "s"
        );
        if (!directForm.test(sources) && !dynamicForm.test(sources)) {
          offenders.push(`COPY.${key}.${lang} → {${name}}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `placeholders never substituted: ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Editorial rules: sentences that are commitments, not preferences
// ---------------------------------------------------------------------------

test("the unplaced-money copy describes and never advises", () => {
  // The row names what is left over, so that the € basket is not asserting
  // that every euro of take-home belongs to one of thirteen groups. It does
  // not tell anyone what to do with the remainder: this is a calculator, not
  // financial advice, and the line between the two is the imperative mood.
  const ADVICE = [
    /\bспести\b/i,
    /\bинвестирай\b/i,
    /\bвложи\b/i,
    /\bshould (save|invest|put)\b/i,
    /\byou could invest\b/i,
    /\bconsider (saving|investing)\b/i,
  ];
  for (const key of [
    "leftK",
    "leftLeadNoHousing",
    "leftLeadWithHousing",
    "leftYear",
    "leftOverNoHousing",
    "leftOverWithHousing",
    "leftCash",
  ]) {
    const entry = COPY[key];
    assert.ok(entry, `COPY.${key} is gone — the unplaced-money row lost a line`);
    for (const lang of ["bg", "en"]) {
      for (const pattern of ADVICE) {
        assert.ok(
          !pattern.test(entry[lang]),
          `COPY.${key}.${lang} tells the reader what to do with their money: ` + `${entry[lang]}`
        );
      }
    }
  }
});

test("the no-housing unplaced-money copy never mentions housing by name", () => {
  // The leftover is `leftover / spendable`, and `spendable` is take-home
  // minus committed housing. A reader who never opted into housing sees
  // these two sentences — the «after housing» phrasing read as a lie to
  // them, so neither language may name housing here. The *WithHousing
  // variants render when `housingCost > 0` and are allowed (required, in
  // fact) to mention housing — that is the whole point of the split.
  // The Cyrillic regex uses an explicit non-letter lookbehind because
  // JavaScript's `\b` is ASCII-only — `\bжилищ` doesn't fire against
  // « за жилище».
  const cyrHousing = /(?<![а-яё])жилищ[а-яё]*/i;
  for (const key of ["leftLeadNoHousing", "leftOverNoHousing"]) {
    const entry = COPY[key];
    assert.ok(entry, `COPY.${key} is gone — the unplaced-money row lost a line`);
    assert.ok(!cyrHousing.test(entry.bg), `COPY.${key}.bg mentions housing: ${entry.bg}`);
    assert.ok(!/\bhous(e|ing)\b/i.test(entry.en), `COPY.${key}.en mentions housing: ${entry.en}`);
  }
});

test("the with-housing unplaced-money copy names the housing amount", () => {
  // The split exists so that, when `housingCost > 0`, the denominator is
  // spelled out instead of hidden. The two *WithHousing variants must use
  // the `{h}` placeholder that LeftoverRow fills with `calc.housingCost`,
  // and they must mention housing in both languages — the no-housing rule
  // above is silent about them on purpose.
  const cyrHousing = /(?<![а-яё])жилищ[а-яё]*/i;
  for (const key of ["leftLeadWithHousing", "leftOverWithHousing"]) {
    const entry = COPY[key];
    assert.ok(entry, `COPY.${key} is gone — the unplaced-money row lost a line`);
    assert.ok(
      entry.bg.includes("{h}") && entry.en.includes("{h}"),
      `COPY.${key} lost its {h} placeholder — LeftoverRow fills it with the housing amount`
    );
    assert.ok(
      cyrHousing.test(entry.bg),
      `COPY.${key}.bg must name housing when housing is in the base: ${entry.bg}`
    );
    assert.ok(
      /\bhous(e|ing)\b/i.test(entry.en),
      `COPY.${key}.en must name housing when housing is in the base: ${entry.en}`
    );
  }
});

test("LeftoverRow picks the housing variant by `calc.housingCost`", () => {
  // The component is the only place that decides which copy renders, and a
  // reader who has typed a mortgage or rent (housingCost > 0) must NOT see
  // the no-housing variant — that is the bug this whole branch exists to
  // prevent. The template-safety scanner accepts the ternary form
  // (`cond ? COPY.a : COPY.b`) but rejects dynamic-key access
  // (`COPY[cond ? "a" : "b"]`); the test pins every `{@html}` substitution
  // call individually so a single regression on either BG or EN trips it.
  // It reads the component file directly — searching SOURCES would match
  // this test's own regex string and pass trivially.
  const componentSrc = readFileSync(join(SRC, "components", "LeftoverRow.svelte"), "utf8");
  // Each `{@html t(...)}` invocation in the component that touches a
  // housing-variant key must use the ternary form. Four such lines exist
  // today: BG lead, EN lead, BG over, EN over.
  const lines = componentSrc
    .split("\n")
    .filter(
      (line) => line.includes("{@html") && (line.includes("leftLead") || line.includes("leftOver"))
    );
  assert.equal(
    lines.length,
    4,
    `LeftoverRow must have exactly 4 {@html} substitution lines for the housing variants, found ${lines.length}`
  );
  for (const line of lines) {
    assert.match(
      line,
      /\?\s*COPY\.(leftLeadWithHousing|leftOverWithHousing)\s*:\s*COPY\.(leftLeadNoHousing|leftOverNoHousing)/,
      `LeftoverRow housing-variant line must use the template-safety-approved ternary form, not \`COPY[key]\`: ${line.trim()}`
    );
  }
  assert.ok(
    /housingCost\s*>\s*0/.test(componentSrc),
    "LeftoverRow does not gate the variant on calc.housingCost > 0"
  );
});

test("the euro tally states what was entered, it does not ask for more", () => {
  // In € mode the tally is a statement of what the reader placed against what
  // they have. An earlier wording read as an instruction to fill the basket,
  // which turned a description into a task.
  for (const lang of ["bg", "en"]) {
    const tally = COPY.modeEurTally[lang];
    assert.ok(
      tally.includes("{a}") && tally.includes("{s}"),
      `COPY.modeEurTally.${lang} lost a figure`
    );
    for (const imperative of [
      /\bразпредели\b/i,
      /\bдобави\b/i,
      /\ballocate the rest\b/i,
      /\bfill in\b/i,
    ]) {
      assert.ok(!imperative.test(tally), `COPY.modeEurTally.${lang} instructs: ${tally}`);
    }
  }
});

test("the salary default is never called a median", () => {
  // The prefilled salary is an illustrative round number. Calling it a median
  // — or an average — would attach a statistical claim to a placeholder, and
  // the page has a real median beside it on the comparator card.
  for (const key of ["salaryK", "salaryHint"]) {
    const entry = COPY[key];
    if (!entry) continue;
    for (const lang of ["bg", "en"]) {
      for (const claim of [/\bмедиан/i, /\bmedian\b/i]) {
        assert.ok(
          !claim.test(entry[lang]),
          `COPY.${key}.${lang} describes the default salary as a median: ${entry[lang]}`
        );
      }
    }
  }
});

test("every euro amount in the carve-out copy carries its unit", () => {
  // The EN carve-out lines once read "a {mort}/mo mortgage" — a bare number on
  // a page where every other figure carries its currency, while the BG side
  // said «{mort} €/мес».
  for (const key of ["basketCarved", "rentCarved"]) {
    const entry = COPY[key];
    assert.ok(entry, `COPY.${key} is gone`);
    for (const lang of ["bg", "en"]) {
      for (const [, placeholder] of entry[lang].matchAll(/\{(mort|rent)\}/g)) {
        const around = entry[lang].slice(
          Math.max(0, entry[lang].indexOf(`{${placeholder}}`) - 6),
          entry[lang].indexOf(`{${placeholder}}`) + placeholder.length + 12
        );
        assert.ok(
          around.includes("€"),
          `COPY.${key}.${lang} prints {${placeholder}} without a currency ` +
            `beside it: …${around}…`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Everything below asserts on a SENTENCE. A formula can be perfectly correct
// while the words around it are false, and no behaviour test can see that —
// which is why these are worth keeping at all. They read `COPY` as an object
// rather than regexing `key: { bg: "…" }` out of a JavaScript file, so a
// string carrying a brace, a nested quote or a template literal cannot defeat
// them.
//
// Where a rule is really "this claim must not appear", it is a regex over the
// imported string. Where it is "this claim must appear", it names the key.
// ---------------------------------------------------------------------------

/** The explainer band on its own — it is one component, so no slicing. */
const EXPLAINER = blankComments(
  readFileSync(join(SRC, "components", "ExplainerBand.svelte"), "utf8")
);

const CYRILLIC = /[а-яА-Я]/;

/** The BG and EN strings of a COPY key, asserting both exist. */
function pair(key) {
  const entry = COPY[key];
  assert.ok(entry, `COPY.${key} is gone from content.js`);
  assert.ok(entry.bg && entry.en, `COPY.${key} is empty in one language`);
  return [entry.bg, entry.en];
}

// --- the tax wedge ---------------------------------------------------------

const WEDGE_KEYS = [
  "wedgeK",
  "wedgeUnder",
  "wedgeOver",
  "wedgeNone",
  "wedgeWhy",
  "wedgeAxisEff",
  "wedgeAxisMar",
  "wedgeAxisCap",
];

test("every tax-wedge string ships bilingual, in the right alphabet, and is rendered", () => {
  for (const key of WEDGE_KEYS) {
    const [bg, en] = pair(key);
    assert.match(bg, CYRILLIC, `COPY.${key}.bg is not in Bulgarian`);
    assert.ok(!CYRILLIC.test(en), `COPY.${key}.en carries Bulgarian text`);
    assert.ok(
      LIVE_SOURCES.includes(`COPY.${key}`),
      `COPY.${key} is never rendered — either wire it or delete it ` +
        "(docs/testing-strategy.md: a test that outlives its feature is a bug, " +
        "not furniture)"
    );
  }
});

test("the wedge copy says the rate FALLS at the ceiling", () => {
  // The claim is directional, and inverting it needs no number to change.
  // Above the insurance ceiling the marginal rate drops from 22.402% to 10%:
  // "the rate on your next euro falls above the ceiling" is the entire point of
  // the figure, and a copy edit could reverse it with every arithmetic test
  // still green.
  const [bgWhy, enWhy] = pair("wedgeWhy");
  assert.ok(
    bgWhy.includes("пада"),
    "the BG explainer no longer says the rate FALLS above the ceiling — that direction IS the finding"
  );
  assert.match(
    enWhy,
    /\bfalls\b/,
    "the EN explainer no longer says the rate FALLS above the ceiling"
  );
  for (const text of [bgWhy, enWhy]) {
    assert.ok(
      !/\b(расте|rises|increases)\b/.test(text),
      `the wedge explainer says the rate RISES above the ceiling: ${text}`
    );
  }
});

test("the wedge copy frames the figure as uncomputed, never as concealed", () => {
  // docs/principles.md P11. "They intentionally don't show it" is a claim we cannot
  // source, and it is the difference between a civic tool and a grievance.
  const banned =
    /(скрива|укрива|не искат да|нарочно не|deliberately (?:hides?|omits?)|do(?:es)? not want you to|intentionally (?:hides?|does not show))/i;
  for (const key of WEDGE_KEYS) {
    for (const text of pair(key)) {
      assert.ok(
        !banned.test(text),
        `COPY.${key} frames a derived figure as suppression: ${text}\n` +
          "docs/principles.md P11 — say it is computable and uncomputed, not hidden."
      );
    }
  }
});

test("the only percentage hardcoded in the wedge copy is the published flat rate", () => {
  // Every other figure the card shows is computed from payroll.json. A literal
  // that is not the flat tax rate is a number the next legislative change moves
  // while the sentence keeps asserting it.
  const payroll = published("payroll");
  if (!payroll) return;
  const rate = payroll.income_tax_rate * 100;
  const allowed = new Set([String(rate), rate.toFixed(0), rate.toFixed(1)]);

  let seenAnywhere = false;
  for (const key of WEDGE_KEYS) {
    for (const text of pair(key)) {
      for (const [, literal] of text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
        const normalised = literal.replace(",", ".");
        assert.ok(
          allowed.has(normalised) || allowed.has(String(Number(normalised))),
          `COPY.${key} hardcodes ${literal}% — payroll.json publishes ${rate}%, and ` +
            "the flat rate is the only percentage that may be written into this copy. " +
            "Everything else follows the payload."
        );
        seenAnywhere = true;
      }
    }
  }
  assert.ok(
    seenAnywhere,
    "no wedge sentence quotes the flat rate at all any more — the contrast between " +
      "the flat tax and the non-flat burden is the whole figure"
  );
});

// --- the pocket row and the stand-still target -----------------------------

test("the pocket row has a sentence for every state it can be in", () => {
  // Seven states, seven sentences. A state with no sentence renders a blank
  // line exactly where the reader is looking for the verdict.
  for (const key of [
    "pocketOk",
    "pocketBad",
    "pocketZero",
    "pocketNearUp",
    "pocketNearDn",
    "pocketCut",
    "pocketNone",
  ]) {
    pair(key);
    assert.ok(LIVE_SOURCES.includes(`COPY.${key}`), `COPY.${key} is never rendered`);
  }
});

test("only the exactly-cancelling pocket verdict claims to be exact", () => {
  // «точно» / "exactly" is reserved for `pocket === 0`. The near-miss verdicts
  // are shown for a RANGE of values, so claiming exactness there is false for
  // almost every reader who sees it.
  for (const key of ["pocketNearUp", "pocketNearDn"]) {
    const [bg, en] = pair(key);
    for (const [text, word] of [
      [bg.toLowerCase(), "точно"],
      [en.toLowerCase(), "exactly"],
    ]) {
      assert.ok(
        !text.includes(word),
        `COPY.${key} claims to be "${word}", but it is shown for a range of ` +
          "values rather than for a cancelling one"
      );
    }
  }
});

test("the stand-still target does not claim a rise that did not happen", () => {
  // π ≤ 0 needs its own sentence. Reusing the one with «поскъпнаха» in it tells
  // a reader prices rose in exactly the case where they did not.
  const [riseBg] = pair("standStillTxt");
  const [flatBg] = pair("standStillFlat");
  assert.ok(riseBg.includes("поскъпнаха"), "the π > 0 line no longer names the rise");
  assert.ok(
    !flatBg.includes("поскъпнаха"),
    "the π ≤ 0 line says prices rose. That is the case where they did not."
  );
});

// --- claims about our own numbers ------------------------------------------

test("the one-year projection names itself an assumption", () => {
  // docs/principles.md P5 — a projection may not wear a measurement's voice. `leftCash`
  // runs the last twelve months' rate forward over the next twelve, and it is
  // rendered in the same card as figures taken verbatim from Eurostat.
  const [bg, en] = pair("leftAssume");
  assert.ok(bg.includes("допускане"), "the BG caveat does not name itself an assumption");
  assert.ok(/assumption/i.test(en), "the EN caveat does not name itself an assumption");
  assert.ok(LIVE_SOURCES.includes("COPY.leftCash"), "the cash-erosion sentence is not rendered");
  assert.ok(
    LIVE_SOURCES.includes("COPY.leftAssume"),
    "the one-year figure is rendered without its assumption"
  );
});

test("a hand-made preset says so where its number is read", () => {
  // The four illustrative baskets yield headline figures (4.0%–6.3%) in the
  // same voice as the Eurostat ones. The hint by the chips is 400px from the
  // result, and a derived figure inherits the obligation to name its source
  // (docs/principles.md P3). The "official" basket is real published data and must NOT
  // be labelled as one of our illustrations.
  pair("presetActive");
  assert.ok(LIVE_SOURCES.includes("COPY.presetActive"), "COPY.presetActive is never rendered");

  const map = /PRESET_LABEL_KEY = \{([\s\S]*?)\};/.exec(LIVE_SOURCES);
  assert.ok(map, "PRESET_LABEL_KEY is gone");
  assert.ok(
    !map[1].includes("official"),
    "the official basket is published Eurostat data and must not be labelled as one of our illustrations"
  );
  for (const preset of ["driver", "family", "noCar", "pensioner"]) {
    assert.ok(map[1].includes(preset), `${preset} is no longer caveated`);
  }
});

test("a ready-made basket names a basket, never the reader", () => {
  // Five mutually-cancelling buttons phrased in the first person — «карам кола
  // всеки ден», «пенсионер съм» — are a persona picker, and a persona picker
  // asks which one of these five people you are. A reader answering that
  // question concludes the calculator cannot hold a man who drives to work AND
  // feeds a family, because his row only lets one of them be true: the app
  // then looks like it holds five lives, none of them his. The thirteen
  // sliders are where a mixed life is described, so a chip may name a basket
  // and may not make a claim about the person reading it.
  // `\b` is ASCII-only in JavaScript — a Cyrillic letter is a non-word
  // character to it, so `/\bкарам\b/` matches nothing at all and the rule
  // would pass on every string it exists to catch. The BG side delimits with
  // lookarounds over the alphabet instead.
  const FIRST_PERSON = {
    bg: /(?<![а-яА-Я])(съм|карам|храня|нямам|имам|живея)(?![а-яА-Я])/i,
    en: /\b(I|I'm|my|me)\b/,
  };
  for (const key of [
    "presetOfficial",
    "presetDriver",
    "presetFamily",
    "presetNoCar",
    "presetPensioner",
  ]) {
    const [bg, en] = pair(key);
    assert.ok(!FIRST_PERSON.bg.test(bg), `COPY.${key}.bg speaks as the reader: "${bg}"`);
    assert.ok(!FIRST_PERSON.en.test(en), `COPY.${key}.en speaks as the reader: "${en}"`);
  }

  // The row's own line carries the provenance, because four of the five
  // baskets are invented and the number they produce is read in the same voice
  // as a Eurostat figure (docs/principles.md P3, P7). It has to say which one
  // is not ours by naming who published it.
  const [hintBg, hintEn] = pair("presetsHint");
  assert.match(
    hintBg,
    /Евростат/,
    "the BG line by the chips does not say whose the real basket is"
  );
  assert.match(
    hintEn,
    /Eurostat/,
    "the EN line by the chips does not say whose the real basket is"
  );
  assert.ok(LIVE_SOURCES.includes("COPY.presetsHint"), "the ready-made baskets carry no caveat");
});

test("the over-budget line describes rather than advises", () => {
  // docs/principles.md P6 — we state the gap; the reader draws the conclusion. The
  // `maxAffordPrice` line directly below already says the honest version, with
  // a number in it.
  for (const advice of ["нужен е по-малък дом", "you need a smaller home"]) {
    assert.ok(
      !LIVE_SOURCES.includes(advice),
      `prescriptive copy is back on a live template line: ${advice}`
    );
  }
});

test("the explainer credits НСИ with collecting Bulgarian prices, not Eurostat", () => {
  // НСИ collects the prices; Eurostat harmonises and publishes them. Saying
  // Eurostat collects them is wrong about who does the work, and it is the kind
  // of error a Bulgarian reader spots immediately.
  assert.ok(
    LIVE_SOURCES.includes("ги събира всеки месец НСИ"),
    "the BG explainer no longer says НСИ collects the prices"
  );
  assert.ok(
    LIVE_SOURCES.includes("collected every month by NSI"),
    "the EN explainer no longer says NSI collects the prices"
  );
});

test("the €/m² caption says which date it is showing", () => {
  // имот.bg stamps its own page with a publication date, and the payload
  // carries the date we fetched it. They are different facts, and printing
  // whichever one happens to exist — unqualified — tells the reader a precision
  // the figure does not have.
  assert.ok(
    !LIVE_SOURCES.includes("sofiaPricePageDate || sofiaPriceAsOf"),
    "the €/m² caption prints whichever date it has, unqualified"
  );
  assert.ok(LIVE_SOURCES.includes("sofiaPriceDated"), "the qualified date derivation is gone");
});

test("the modelled pay band says it is modelled", () => {
  // The middle-60% band is interpolated from the ladder; the median beside it
  // is surveyed. Presenting them in one voice makes an interpolation look like
  // a measurement.
  const [bg, en] = pair("statMedianSubModelled");
  assert.ok(bg.length > 3 && en.length > 3, "the modelled caveat is empty");
  assert.ok(
    LIVE_SOURCES.includes("COPY.statMedianSubModelled"),
    "the middle-60% band no longer carries its own modelled caveat"
  );
});

test("no strip source caption is pinned to English", () => {
  // Three strip cards rendered `COPY.srcEurostat.en`, so a Bulgarian reader got
  // an English agency name in the middle of a Bulgarian page.
  const withoutFallback = LIVE_SOURCES.replaceAll("?? COPY.srcEurostat.en}", "");
  assert.ok(
    !withoutFallback.includes("COPY.srcEurostat.en}"),
    "a strip caption still hardcodes the English agency name"
  );
});

// --- the explainer band and the savings drawer -----------------------------

/** The results drawer's markup, comments blanked. */
function drawerBlock() {
  const src = readFileSync(join(SRC, "components", "MethodDrawer.svelte"), "utf8");
  return src.slice(src.indexOf("</script>")).replace(/<!--[\s\S]*?-->/g, " ");
}

/** The `Спестеното.` item of the drawer — the savings explanation. */
function savingsItem() {
  const m = /<b>Спестеното\.<\/b>[\s\S]*?<\/li>/.exec(drawerBlock());
  assert.ok(m, "the savings drawer item is gone");
  return m[0];
}

test("the explainer names both HICP and the national CPI, and says why they differ", () => {
  // vyarno.bg shows Eurostat's harmonised HICP; НСИ publishes a national CPI
  // (ИПЦ) computed slightly differently, and for the same month the two differ
  // by a decimal or two. A reader who saw НСИ's number in the press would
  // otherwise conclude one of them is lying.
  const band = EXPLAINER;
  assert.ok(band.includes("explain-band"), "the explain-band section is gone");

  assert.ok(
    band.includes("HICP") && band.includes("CPI"),
    "the English explainer no longer names both HICP and the national CPI"
  );
  assert.ok(
    band.includes("ХИПЦ") && band.includes("ИПЦ"),
    "the Bulgarian explainer no longer names both ХИПЦ (harmonised) and ИПЦ (national)"
  );
  assert.ok(
    band.includes("harmonised") && band.includes("national"),
    "the note drops the acronyms without explaining that the difference is " +
      "method (EU-harmonised vs national), not error"
  );
});

test("the explainer writes no live figure into its prose", () => {
  // A headline-vs-basket section titled «А защо 5,2% и 5,4% не са едно и също
  // число?», quoting both figures in the body, is right on the day it is typed
  // and wrong a month later: the strip says one thing, the paragraph
  // explaining the strip says another, and the reader cannot tell which is
  // stale. Nothing recomputes prose, so this is the check.
  //
  // Scoped to the CURRENTLY published headline: banning every percentage would
  // ban the section's worked examples ("food rose 8%"), which carry no
  // freshness claim and are what make it readable.
  const headline = published("hicp_headline");
  if (!headline) return;
  const rate = headline.headline_rate_pct;
  const band = EXPLAINER;
  assert.ok(band.includes("explain-band"), "the explain-band section is gone");

  for (const literal of [`${rate}%`, `${rate}%`.replace(".", ",")]) {
    assert.ok(
      !band.includes(literal),
      `the explainer writes ${literal} into its prose. That is today's published ` +
        "all-items rate, and the copy will keep asserting it after the next " +
        "refresh moves it. Point at where the figure is rendered instead of " +
        "restating it."
    );
  }
});

test("the explainer accounts for the headline-versus-basket gap", () => {
  // Σ(w·r) over the published divisions runs about 0.16 pp above Eurostat's
  // all-items headline, because HICP re-weights the basket every January and a
  // 12-month window crosses that link. The explainer must not state the
  // opposite — "the only difference is the basket, not the time" — which reads
  // as an arithmetic error on the one page whose whole promise is that the
  // maths adds up (docs/README.md §"Who this is for", property 3: where two
  // numbers differ, show
  // both AND why).
  const band = EXPLAINER.toLowerCase();
  assert.ok(
    !band.includes("разликата е само кошницата"),
    "the explainer still claims the basket is the ONLY difference between the " +
      "headline and the sum of the divisions — it is not"
  );
  for (const needle of ["януари", "тегл", "january", "weight"]) {
    assert.ok(
      band.includes(needle),
      `the explainer never mentions "${needle}" — the annual re-weighting is the ` +
        "reason the two figures differ, and a non-economist cannot be expected " +
        "to infer it"
    );
  }
});

test("the explainer's 'same month' reassurance follows the months it is about", () => {
  // The paragraph answering "why is my number different from the official one"
  // closes by telling the reader the two are at least comparable, and what
  // makes them comparable is being the same month. Eurostat's flash publishes
  // the all-items rate about two weeks ahead of the per-group figures, so for
  // that fortnight they are not — and a flat "both are for the same latest
  // month" is then false in the one paragraph a doubting reader opened to
  // check. Static copy cannot be right in both states, so the claim branches.
  const band = EXPLAINER;
  assert.ok(band.includes("explain-band"), "the explain-band section is gone");
  for (const claim of ["explainSameMonth", "explainSplitMonth"]) {
    assert.ok(band.includes(claim), `the explainer no longer renders COPY.${claim}`);
  }
  assert.equal(
    band.split("monthsSplit").length - 1 >= 3,
    true,
    "the months claim must branch in BOTH language spans, not just one — a hardcoded " +
      "sentence in the other renders the wrong month for every reader of that language"
  );
  for (const hardcoded of [
    "И двете са за един и същ най-нов месец",
    "Both are for the same latest month",
  ]) {
    assert.ok(
      !band.includes(hardcoded),
      `"${hardcoded}" is written into the explainer as a literal — it is a claim about ` +
        "two months that can be false, so it belongs behind the branch"
    );
  }
});

test("the savings copy does not call our reconstruction the official figure", () => {
  // The savings card deflates by Σw·(Iᵢ(now)/Iᵢ(2020) − 1) at Eurostat's current
  // weights — about 41.8% today. Eurostat's own chain-linked all-items index
  // over the same span is about 39.9%. Describing ours as «общото официално
  // поскъпване за страната» claims the second while computing the first: it is
  // built from official figures but it is not an official figure, and the page
  // already has an honest name for exactly this construction. docs/site.md
  // §"A correct formula fed the wrong number" rule 4 — the arithmetic can be
  // right while the sentence around it is false.
  const block = savingsItem();
  for (const banned of [
    "общото официално поскъпване за страната",
    "the country's overall official price rise",
    "official rise since 2020",
    "официално поскъпване от 2020",
  ]) {
    assert.ok(
      !block.includes(banned),
      `the savings copy calls our weighted reconstruction "${banned}". It is ` +
        "~1.9 pp from Eurostat's published all-items cumulative; name it for what it is."
    );
  }
  for (const required of ["средностатистическата кошница", "the average basket"]) {
    assert.ok(
      block.includes(required),
      `the savings copy no longer says which basket it deflates by ("${required}" missing)`
    );
  }
});

test("the savings copy follows the basis it actually used", () => {
  // `savingsSince2020` returns `basis`, and the fallback — rebuilding from the
  // divisions — is a legitimate but different number. Static copy would
  // reintroduce exactly the mislabelling above, silently, and only for the
  // readers whose fetch failed.
  const block = savingsItem();
  const branches = block.split('cashEroded.basis === "all_items"').length - 1;
  assert.ok(branches >= 2, "the savings prose must branch on the basis used, in both languages");
  for (const claim of ["общия ценови индекс на Евростат", "Eurostat's all-items price index"]) {
    assert.ok(block.includes(claim), `"${claim}" is gone from the savings copy`);
  }
  for (const hedge of ["не се зареди", "didn't load"]) {
    assert.ok(block.includes(hedge), `the fallback branch does not say it is one ("${hedge}")`);
  }
});

test("the payslip names every row in both languages", () => {
  // A half-translated breakdown is a breakdown nobody can check: the whole
  // point of opening it is to read it against a payslip, and a Bulgarian
  // payslip is read in Bulgarian. Every arithmetic test in
  // verify_net_salary.mjs stays green with an untranslated row on screen.
  const keys = [
    "payslipOpen",
    "payslipGross",
    "payslipBase",
    "payslipCap",
    "payslipPension",
    "payslipPension2",
    "payslipSickness",
    "payslipUnemp",
    "payslipHealth",
    "payslipInsurance",
    "payslipTaxable",
    "payslipTax",
    "payslipDeduct",
    "payslipNet",
    "payslipSource",
  ];
  for (const key of keys) {
    const [bg, en] = pair(key);
    assert.match(bg, CYRILLIC, `COPY.${key}.bg is not in Bulgarian`);
    assert.ok(!CYRILLIC.test(en), `COPY.${key}.en carries Bulgarian text`);
    assert.ok(LIVE_SOURCES.includes(`COPY.${key}`), `COPY.${key} is never rendered`);
  }
  // The ceiling row and the provenance line are substitution strings. A missing
  // placeholder renders the literal; a render site that stopped going through
  // `t()` would ship the braces verbatim.
  for (const [key, token] of [
    ["payslipCap", "{cap}"],
    ["payslipSource", "{year}"],
  ]) {
    const [bg, en] = pair(key);
    assert.ok(
      bg.includes(token) && en.includes(token),
      `COPY.${key} lost its ${token} placeholder`
    );
  }
});

test("the percentile sentence is phrased from the bottom, never as a top rank", () => {
  // `percentile()` returns a position FROM THE BOTTOM. "Top 63%" for a
  // below-median income reads as an achievement and is false — and the
  // arithmetic can be perfectly correct while the words invert it. The marker's
  // wiring is held in verify_wiring.mjs; this is the sentence.
  const [bg, en] = pair("pctTopTxt");
  assert.ok(
    bg.toLowerCase().includes("изпреварваш"),
    `COPY.pctTopTxt.bg must phrase the rank from the bottom; got: ${bg}`
  );
  assert.ok(
    en.toLowerCase().includes("ahead of"),
    `COPY.pctTopTxt.en must phrase the rank from the bottom; got: ${en}`
  );
  assert.ok(
    !bg.toLowerCase().includes("топ"),
    `COPY.pctTopTxt.bg uses the inverted framing: ${bg}`
  );
  assert.ok(
    !en.toLowerCase().includes("top "),
    `COPY.pctTopTxt.en uses the inverted framing: ${en}`
  );
});

test("the percentile caveat admits the survey behind it is national", () => {
  // The card states a rank among Sofia earners, and only its LEVEL is Sofia's:
  // the shape it ranks against is Eurostat SES for the whole country, so the
  // sentence rests on Sofia's spread of pay resembling the national one.
  // `salary_dist.json` carries that in a `disclaimer` field, and a payload
  // field is read by nobody this card is written for.
  //
  // The other limits are already admitted — the survey year, who it excludes,
  // that the level is recomputed, that Sofia flatters the reader — which is
  // exactly what makes the omission cost something: a caveat listing four
  // qualifications reads as the complete set.
  const [bg, en] = pair("pctCaveat");
  assert.ok(
    /цялата страна|национал/i.test(bg),
    `COPY.pctCaveat.bg does not say the survey covers the whole country: ${bg}`
  );
  assert.ok(
    /whole country|national/i.test(en),
    `COPY.pctCaveat.en does not say the survey covers the whole country: ${en}`
  );
  assert.ok(
    LIVE_SOURCES.includes("COPY.pctCaveat"),
    "the percentile row no longer renders its caveat"
  );
});

// ---------------------------------------------------------------------------
// The share surfaces — docs/principles.md P2 and P9
// ---------------------------------------------------------------------------

/**
 * A currency on a share surface, and nothing that merely contains one.
 *
 * The lookarounds are load-bearing rather than fussy. `\b` in JavaScript is
 * defined over `[A-Za-z0-9_]`, so it does nothing useful either side of
 * Cyrillic — and a plain substring test flags «Евростат» for containing
 * «евро» and "Eurostat" for containing "Eur". Both belong on the card: P9
 * requires the publisher's name on a format that cannot carry a link, so a
 * check that forbids naming the source would push the card into breaking the
 * principle beside the one it enforces.
 */
const CURRENCY = /€|(?<!\p{L})(EUR|евро|лв)(?!\p{L})/iu;

/**
 * Second person, in either language — «твоята кошница» addressed to a stranger.
 *
 * `\p{L}*` and not `\w*` for the stem endings. `\w` is `[A-Za-z0-9_]` even
 * under the `u` flag, so `тво\w*` matches «тво» and then refuses «твоята»,
 * which is the one form the copy would actually be written in. A pronoun check
 * that cannot see an inflected pronoun passes everything it exists to catch.
 */
const SECOND_PERSON =
  /(?<!\p{L})(тво\p{L}*|теб\p{L}*|ти|ви|вие|ваш\p{L}*|you|your|yours)(?!\p{L})/iu;

/** Enough of a payload to draw a card, at both anchors and every verdict. */
function shareCases() {
  const base = {
    piPct: 7.24,
    officialPct: 5.2,
    anchor: "y1",
    refPeriod: "2026-06",
    topBgName: "Транспорт",
    topEnName: "Transport",
    topPp: 1.62,
    domain: SHARE_DOMAIN,
    url: SHARE_ORIGIN,
  };
  const cases = [];
  for (const anchor of ["y1", 2020]) {
    for (const verdict of ["dearer", "cheaper", "close"]) {
      cases.push({ ...base, anchor, verdict });
      // A basket weighted onto the falling groups, which the noun-phrase
      // wording has to survive: «поскъпна с −1,2%» contradicts its own number.
      cases.push({ ...base, anchor, verdict, piPct: -1.2, topPp: -0.4 });
      // No division leads, so there is no biggest bite to name.
      cases.push({ ...base, anchor, verdict, topBgName: "", topEnName: "", topPp: NaN });
    }
  }
  return cases;
}

test("every line on the share card is filled in, in both languages", () => {
  const offenders = [];
  for (const share of shareCases()) {
    for (const lang of ["bg", "en"]) {
      const text = shareCardText({ share, copy: COPY, lang });
      for (const [slot, value] of Object.entries(text)) {
        // `detail` is the one line the card is allowed to drop — an empty
        // basket has no leading division, and a dangling «Най-тежко удря:»
        // with nothing after it is worse than the silence.
        if (slot === "detail" && !Number.isFinite(share.topPp)) continue;
        if (!value || !String(value).trim()) {
          offenders.push(`${lang} ${share.verdict}@${share.anchor}: ${slot} is blank`);
        }
        if (/[{}]/.test(String(value))) {
          offenders.push(`${lang} ${share.verdict}@${share.anchor}: ${slot} = ${value}`);
        }
        // An em dash is what `format.js` returns for a value it cannot render,
        // and a picture already in somebody's chat is the wrong place to find
        // out that the period was unparseable.
        if (String(value).includes("—")) {
          offenders.push(`${lang} ${share.verdict}@${share.anchor}: ${slot} = ${value}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("; "));
});

test("no share surface prints a currency", () => {
  // P2: `mirror.js#extraPerMonth` is salary × r/(100+r) and inverts exactly,
  // so a euro figure beside the rate it came from publishes the sender's pay
  // to everyone the picture reaches. The closed list in principles.md names
  // this case in as many words.
  const offenders = [];
  for (const share of shareCases()) {
    for (const lang of ["bg", "en"]) {
      for (const [slot, value] of Object.entries(shareCardText({ share, copy: COPY, lang }))) {
        if (CURRENCY.test(String(value))) offenders.push(`${lang} ${slot}: ${value}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("; "));
});

test("the share card carries its source, its period and the domain", () => {
  // P9: verifiability scales down, not away. A picture cannot carry a link, so
  // it carries the publisher's name, the period the figures are from and the
  // address a stranger can type. A shared number with no provenance is the
  // thing this project exists not to be.
  for (const lang of ["bg", "en"]) {
    const text = shareCardText({ share: shareCases()[0], copy: COPY, lang });
    assert.match(text.source, lang === "bg" ? /Евростат/ : /Eurostat/, text.source);
    assert.match(text.source, /2026/, text.source);
    assert.ok(text.cta.includes(SHARE_DOMAIN), text.cta);
  }
});

test("the copy that leaves the device speaks in the first person", () => {
  // Every other sentence in the app says «ти» because it is talking to the
  // reader. These are spoken BY the reader to somebody who has never opened
  // the site, and «твоята кошница» arriving in a stranger's chat addresses the
  // wrong person entirely.
  //
  // The set is the two key lists the share surfaces are actually assembled
  // from, not every key beginning "share": `shareHead` and `shareNote` are the
  // app talking to the reader about what is about to leave, and are correctly
  // in the second person. A heuristic over key names would need an exception
  // list that grows silently; these lists are the code's own.
  // The exception is the invitation, and it is the point rather than an
  // oversight: «Сметни своята» / "Work out yours" is the one clause the sender
  // aims at whoever is reading, and it is what turns a statement into a reason
  // to open the site. So the split is CLAIM in the first person, INVITATION in
  // the second — and the invitation is checked for doing its own job below
  // rather than merely excused from this one.
  const invitations = ["shareCta", "shareCardCta"];
  const spoken = [...SHARE_COPY_KEYS, ...SHARE_CARD_COPY_KEYS].filter(
    (key) => !invitations.includes(key)
  );
  assert.ok(spoken.length > 0, "no share copy found — did the keys get renamed?");
  const offenders = [];
  for (const key of spoken) {
    for (const lang of ["bg", "en"]) {
      if (SECOND_PERSON.test(COPY[key][lang])) offenders.push(`COPY.${key}.${lang}`);
    }
  }
  assert.deepEqual(offenders, [], `share copy addressing the recipient: ${offenders.join(", ")}`);

  // A recipient with no way back has been sent a statistic and no product.
  for (const key of invitations) {
    for (const lang of ["bg", "en"]) {
      assert.ok(COPY[key][lang].includes("{u}"), `COPY.${key}.${lang} names no address`);
    }
  }
});

test("the share note states the boundary rather than advertising it", () => {
  // The line under the preview is the one place the app claims something about
  // its own privacy, so it has to be a description of what is on the picture —
  // checkable by looking at it — and not a badge. It names what is absent.
  for (const lang of ["bg", "en"]) {
    const note = COPY.shareNote[lang];
    const named =
      lang === "bg" ? ["Заплата", "наем", "спестявания"] : ["Salary", "rent", "savings"];
    for (const word of named) assert.ok(note.includes(word), `${lang}: ${note}`);
    assert.doesNotMatch(note, /100%|напълно|гарантирано|completely|fully guaranteed/i, note);
  }
});

// --- /how/, the country's figures on a page of their own -------------------
//
// The page is mostly prose wrapped around published numbers, which makes it
// the likeliest surface in the repository to freeze today's headline into a
// sentence. Everything below is about that risk and about the rules the prose
// still has to satisfy — both languages, no advice (P6), a derivation
// disclosed (Eurostat's terms), and nothing said about НСИ's figures that
// their licence forbids.

/**
 * The `/how/` page on its own — one component, so no slicing.
 *
 * Whitespace-collapsed, because these assertions are about which sentence the
 * page says and Prettier decides where it breaks. A claim checked against the
 * source verbatim goes red on a formatter run, which teaches people to edit
 * the test rather than read it.
 */
const HOW = blankComments(readFileSync(join(SRC, "How.svelte"), "utf-8")).replace(/\s+/g, " ");

/** The `{bg, en}` COPY keys the page owns. */
const HOW_KEYS = Object.keys(COPY).filter((k) => k.startsWith("how"));

/** The other two surfaces that carry prose around a published figure. */
const DRAWER = blankComments(
  readFileSync(join(SRC, "components", "MethodDrawer.svelte"), "utf-8")
).replace(/\s+/g, " ");
const COPY_SRC = blankComments(readFileSync(join(SRC, "lib", "content.js"), "utf-8")).replace(
  /\s+/g,
  " "
);

test("every string the country page owns ships bilingual, in the right alphabet", () => {
  assert.ok(
    HOW_KEYS.length > 10,
    `only ${HOW_KEYS.length} how* COPY keys — the page lost its copy`
  );
  for (const key of HOW_KEYS) {
    const [bg, en] = pair(key);
    // The two proper nouns that are Latin in Bulgarian too. Everything else
    // reaching a Bulgarian reader in Latin script is the defect this checks
    // for, and it is easy to introduce on a page full of dataset names.
    if (!["howSrcImot", "howSrc"].includes(key)) {
      assert.match(bg, CYRILLIC, `COPY.${key}.bg is not in Bulgarian`);
    }
    if (!["howSrcImot", "howSrc"].includes(key)) {
      assert.ok(!CYRILLIC.test(en), `COPY.${key}.en carries Cyrillic: ${en}`);
    }
  }
});

test("no page writes a live figure into its prose", () => {
  // The rule the explainer already keeps, applied to the page most exposed to
  // breaking it. A section headed «инфлацията е 4,1%» is right on the day it
  // is typed and wrong a month later: the figure beside it moves and the
  // sentence explaining it does not, and the reader cannot tell which is
  // stale. Nothing recomputes prose, so this is the check.
  //
  // Scoped to the CURRENTLY published values rather than to every percentage,
  // because a worked example carries no freshness claim and is what makes an
  // explanation readable.
  const headline = published("hicp_headline");
  const price = published("sofia_price");
  const wage = published("sofia_salary");
  if (!headline || !price || !wage) return;

  const live = [
    ["the all-items rate", `${headline.headline_rate_pct}%`],
    ["the Sofia €/m² median", String(price.eur_per_m2_median)],
    ["the Sofia average wage", String(wage.value)],
  ];
  for (const [what, literal] of live) {
    for (const form of [literal, literal.replace(".", ",")]) {
      assert.ok(
        !HOW.includes(form),
        `How.svelte writes ${form} into its markup — that is ${what} as ` +
          "published today, and the copy will keep asserting it after the next " +
          "refresh moves it. Render the figure beside the prose instead."
      );
    }
  }
});

test("the staleness banner has a sentence for the count it is about to print", () => {
  // One late payload out of eight is the commonest way this banner fires, and
  // the plural sentence does not survive it in either language: «1 от числата
  // СА закъснели» needs the participle in the singular, and "1 of the figures
  // are overdue" needs "is". So the singular is its own string rather than the
  // plural with a number substituted, and neither may carry the other's verb.
  const [oneBg, oneEn] = pair("dataStaleOne");
  const [manyBg, manyEn] = pair("dataStale");

  assert.ok(!oneBg.includes("{n}"), "the singular staleness line still interpolates a count");
  assert.ok(!oneEn.includes("{n}"), "the English singular staleness line still counts");
  assert.ok(manyBg.includes("{n}") && manyEn.includes("{n}"), "the plural line lost its count");

  assert.match(oneBg, /закъсняло/, "the Bulgarian singular does not agree with one figure");
  assert.match(manyBg, /закъснели/, "the Bulgarian plural does not agree with several");
  assert.match(oneEn, /\bis\b/, "the English singular says «are» about one figure");
  assert.match(manyEn, /\bare\b/, "the English plural says «is» about several");

  // And the banner has to choose between them, or the pair is decoration.
  const banner = readFileSync(join(SRC, "components", "DataBanner.svelte"), "utf8");
  assert.match(
    banner.replace(/\s+/g, " "),
    /dataOverdueCount === 1 \? COPY\.dataStaleOne : COPY\.dataStale/,
    "DataBanner renders one staleness sentence for every count"
  );
});

test("no prose freezes a date or a count the payloads already carry", () => {
  // The sibling of the rule above, and the one that survives longer before
  // anybody notices. A frozen RATE is caught by the figure beside it moving; a
  // frozen date or count just keeps being asserted — «медианата на 143-те
  // софийски квартала» after имот.bg merges two of them, «изследване на
  // Евростат от 2022 г.» after the four-yearly survey publishes its next round,
  // «Вярно 2026» for the whole of 2027. Each of the three was true when typed
  // and each is a claim the payload beside it contradicts.
  //
  // Checked against the CURRENTLY published values, like the live-figure rule:
  // a worked example that happens to contain a year («индексът в края на
  // 2020 г. е 115») carries no freshness claim and is what makes the
  // explanation readable.
  const price = published("sofia_price");
  const dist = published("salary_dist");

  const frozen = [
    [
      "the имот.bg district count",
      String(price?.n_districts ?? ""),
      [
        ["How.svelte", HOW],
        ["MethodDrawer.svelte", DRAWER],
      ],
    ],
    ["the SES survey year", String(dist?.shape?.ref_year ?? ""), [["content.js", COPY_SRC]]],
  ];
  for (const [what, literal, sources] of frozen) {
    if (!literal) continue;
    for (const [name, src] of sources) {
      assert.ok(
        !src.includes(literal),
        `${name} writes ${literal} into its markup — that is ${what} as ` +
          "published today, and the sentence will keep asserting it after the " +
          "next refresh moves it. Read it off the payload instead."
      );
    }
  }

  // The footer's year is the third case and it has no payload to compare
  // against — it is the reader's own clock, so the check is that the slot is
  // there and no year was typed beside it.
  for (const lang of ["bg", "en"]) {
    const line = COPY.footerNote[lang];
    assert.ok(line.includes("{year}"), `the ${lang} attribution line has no {year} slot`);
    assert.ok(
      !/\b(19|20)\d{2}\b/.test(line.replace("Apache-2.0", "")),
      `the ${lang} attribution line writes a year into the copy: ${line}`
    );
  }
});

test("the country page discloses that three of its figures are ours", () => {
  // Eurostat permits derivation on condition it is disclosed. Three figures on
  // this site are ours rather than a publisher's — the modelled pay ladder,
  // the Sofia €/m² median across имот.bg's districts and the change since 2015
  // built on it — and two of the three are rendered here. The disclosure and
  // the route to the full wording both have to travel with them.
  const [bg, en] = pair("howOurs");
  assert.match(bg, CYRILLIC);
  assert.ok(HOW.includes("COPY.howOurs.bg") && HOW.includes("COPY.howOurs.en"));
  assert.ok(
    (HOW.match(/\{@render ours\(\)\}/g) ?? []).length >= 2,
    "the derivation disclosure is rendered fewer than twice — the modelled " +
      "ladder and the €/m² median each need it beside them, not once at the foot"
  );
  assert.ok(
    HOW.includes('href="/legal/#sources"'),
    "the disclosure no longer routes to the sources document, which carries " +
      "the Eurostat non-responsibility wording it is half of"
  );
  assert.ok(en.length > 20 && bg.length > 20, "the disclosure has been shortened to a label");
});

test("the country page says the НСИ series is selected, never averaged", () => {
  // НСИ's licence forbids distributing производни и сборни произведения, and
  // the architecture that answers it is: select from published cells, never
  // compute over them. The quarterly wage table is the one place on the site
  // that prints a whole НСИ series, so the page says out loud which of the two
  // it is doing — and `view.js#seriesCells` is what makes the sentence true.
  for (const claim of [
    "избираме клетка, не смятаме средни",
    "a cell is selected, never averaged",
  ]) {
    assert.ok(
      HOW.includes(claim),
      `the country page no longer states «${claim}» beside НСИ's own series`
    );
  }
});

test("the country page accounts for the headline-versus-basket gap", () => {
  // Σ(w·r) over the published divisions runs about 0.16 pp above Eurostat's
  // all-items headline, because HICP re-weights the basket every January and a
  // 12-month window crosses that link. This page prints both figures side by
  // side — which is exactly where a reader stops and asks — so it may not
  // claim the basket is the only difference, and it has to name the cause.
  const body = HOW.toLowerCase();
  assert.ok(
    !body.includes("разликата е само кошницата"),
    "the country page claims the basket is the ONLY difference between the " +
      "headline and the sum of the divisions — it is not"
  );
  for (const needle of ["януари", "тегл", "january", "weight"]) {
    assert.ok(
      body.includes(needle),
      `the country page never mentions "${needle}", so a reader meeting the two ` +
        "figures beside each other is left to infer the annual re-weighting"
    );
  }
});

test("the country page's gap paragraph branches on the two months", () => {
  // The same claim the explainer branches, on the page that prints the two
  // figures side by side rather than one of them. `explainSameMonth` /
  // `explainSplitMonth` are shared deliberately: one sentence about one pair of
  // published months, so a correction to it cannot land on one surface and miss
  // the other.
  for (const claim of ["explainSameMonth", "explainSplitMonth"]) {
    assert.ok(HOW.includes(claim), `the country page no longer renders COPY.${claim}`);
  }
  assert.ok(
    (HOW.match(/monthsSplit/g) ?? []).length >= 3,
    "the months claim must branch in BOTH language spans — a hardcoded sentence " +
      "in the other renders the wrong reason for every reader of that language"
  );
  for (const hardcoded of [
    "И двете са за един и същ най-нов месец",
    "Both are for the same latest month",
    "различни месеци",
    "different months",
  ]) {
    assert.ok(
      !HOW.includes(hardcoded),
      `"${hardcoded}" is written into the country page as a literal. Which of the ` +
        "two is true changes with Eurostat's release calendar, so it belongs behind " +
        "the branch."
    );
  }
});

test("the country page describes and never advises", () => {
  // P6. A reference page is where "you should" arrives most naturally, because
  // every section ends in a figure somebody could act on.
  for (const advice of [
    "трябва да",
    "препоръчваме",
    "по-добре е да",
    "you should",
    "we recommend",
    "consider ",
  ]) {
    assert.ok(
      !HOW.toLowerCase().includes(advice),
      `prescriptive copy on the country page: "${advice}". The strongest ` +
        "honest form is a comparison plus a number (P6)."
    );
  }
});

test("the country page frames the wedge curve as uncomputed, never as concealed", () => {
  // P11. The tax wedge is the shipped example of a figure an agency could have
  // published and did not, and the framing is "this is computable from the
  // official data and nobody has computed it for you" — never "they do not
  // want you to see it".
  for (const conspiracy of ["крие", "скрива", "не иска да", "they don't want", "hidden from"]) {
    assert.ok(
      !HOW.toLowerCase().includes(conspiracy),
      `the wedge section imputes a motive ("${conspiracy}"). P11: where an ` +
        "agency has a reason, give it; where we cannot tell, say so in one line."
    );
  }
  assert.ok(
    HOW.includes("никой не е длъжен") && HOW.includes("nobody is obliged"),
    "the wedge section no longer says why the curve is unpublished, which is " +
      "the sentence that keeps 'nobody publishes it' from reading as an accusation"
  );
});

test("the country page keeps the 30% line where P7 put it", () => {
  // The affordability line is deliberately stricter than the 50% БНБ permits
  // and than the ~38.5% BG borrowers carry. A reference page explaining both
  // ceilings is where somebody reasonably concludes ours should match one of
  // them, so the paragraph states that it does not move.
  for (const claim of ["по-строго от", "stricter than"]) {
    assert.ok(HOW.includes(claim), `the 30% line no longer says it is ${claim} the regulator's`);
  }
  assert.ok(
    HOW.includes("не се мести") && HOW.includes("does not move"),
    "the paragraph no longer says the affordability line stays where it is"
  );
});
