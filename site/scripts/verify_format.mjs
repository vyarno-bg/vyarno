/**
 * $lib/format.js — the formatters every figure on the page passes through.
 *
 * **They live in a module so that a test can call them.** As closures inside
 * `App.svelte` they are reachable only by rendering the component, and the rule
 * that matters — a percentage never prints two signs — then has to be held by
 * grepping the source rather than by running the code.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  number,
  integer,
  percentShare,
  percentSigned,
  dateShort,
  periodLong,
  label,
  httpUrl,
  ordinalDay,
  parseDecimal,
  decimalText,
  bgIn,
  safeText,
  yearText,
} from "../src/lib/format.js";
import { published } from "./published-payload.mjs";

test("a missing or non-finite value formats as an em dash, never NaN", () => {
  // The calculator renders continuously while someone types, so an empty or
  // half-typed field is an ordinary state that reaches the formatters.
  for (const empty of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(number(empty), "—");
    assert.equal(integer(empty), "—");
    assert.equal(percentSigned(empty), "—");
  }
  assert.equal(dateShort(""), "—");
  assert.equal(dateShort(null), "—");
});

test("the decimal separator follows the language", () => {
  assert.match(number(1234.5, 1, "bg"), /1\s?234,5/);
  assert.match(number(1234.5, 1, "en"), /1,234\.5/);
});

test("integer() rounds rather than truncating", () => {
  assert.equal(integer(1999.6, "en"), "2,000");
  assert.equal(integer(-0.4, "en"), "-0");
});

test("a decimal typed in either notation parses to the same number", () => {
  // The comma is what a Bulgarian reader types, and until the two decimal
  // fields stopped being `type="number"` the browser deleted it before this
  // could see it — «2,75» reaching the mortgage row as 275.
  assert.equal(parseDecimal("2,75"), 2.75);
  assert.equal(parseDecimal("2.75"), 2.75);
  assert.equal(parseDecimal("-0,5"), -0.5);
  // Off this very page: `integer()` groups thousands with a space, and the one
  // it uses is non-breaking.
  assert.equal(parseDecimal("34 102"), 34102);
  assert.equal(parseDecimal("34 102"), 34102);
  assert.equal(parseDecimal("34 102"), 34102);
});

test("a decimal that could mean two things parses to neither", () => {
  // «1,234» is one thousand two hundred and thirty-four to an English reader
  // and 1.234 to a Bulgarian one. Both separators in one string is the case
  // where guessing gets it wrong for half the readers, so nothing is guessed.
  assert.ok(Number.isNaN(parseDecimal("1,234.5")));
  assert.ok(Number.isNaN(parseDecimal("1.234,5")));
  // And the ordinary refusals. `parseFloat` answers 3 to the first of these
  // and 1.2 to the second, which is a number quietly made out of something
  // that is not one.
  assert.ok(Number.isNaN(parseDecimal("3,5%")));
  assert.ok(Number.isNaN(parseDecimal("1.2.3")));
  assert.ok(Number.isNaN(parseDecimal("")));
  assert.ok(Number.isNaN(parseDecimal(null)));
});

test("a field is handed the number back in the reader's own notation", () => {
  // The rate box sits directly above a hint reading «2,41%». It showed "2.41".
  assert.equal(decimalText(2.41, "bg"), "2,41");
  assert.equal(decimalText(2.41, "en"), "2.41");
  assert.equal(decimalText(25, "bg"), "25");
  // Empty, never "NaN" or "—": this goes back into an input the reader edits.
  assert.equal(decimalText(NaN, "bg"), "");
  assert.equal(decimalText(undefined, "bg"), "");
});

test("percentSigned never prints two signs, whichever way the number goes", () => {
  // The bug this exists to prevent: `+{number(x)}%` renders «+−5,0%» as soon
  // as x is negative, and both operands can be — a pay cut is typeable, and a
  // basket weighted onto falling groups makes personal inflation negative.
  assert.equal(percentSigned(5, 1, "en"), "+5.0%");
  assert.equal(percentSigned(-5, 1, "en"), "−5.0%");
  for (const x of [12.34, -12.34, 0, -0.04, -0.05, 0.05]) {
    const rendered = percentSigned(x, 1, "en");
    const signs = rendered.match(/[+−-]/g) ?? [];
    assert.ok(signs.length <= 1, `${rendered} carries ${signs.length} signs`);
  }
});

test("a percentage that rounds to zero is printed without a direction", () => {
  // Eurostat publishes the divisions' annual rates to one decimal, and
  // «Облекло и обувки» is 0.0 in the payload this ships with: the basket read
  // «CP03 · +0,0%», a plus over digits saying prices did not move. The pair
  // either side of it is the reason the sign cannot stay: +0.04 and −0.04
  // print the same magnitude, so a signed rendering hands a reader «+0,0%»
  // and «−0,0%» and asks them to tell the two apart on the sign alone.
  assert.equal(percentSigned(0, 1, "en"), "0.0%");
  assert.equal(percentSigned(0.04, 1, "en"), "0.0%");
  assert.equal(percentSigned(-0.04, 1, "en"), "0.0%");
  assert.equal(percentSigned(0, 0, "en"), "0%");
  assert.equal(percentSigned(0.4, 0, "en"), "0%");

  // And the sign comes back the moment a digit does. This is the half-way
  // case, where deriving the sign by rounding `x` a second time disagrees with
  // the rendering: `Math.round(-0.5)` is `-0` and would drop the minus off a
  // figure printed as 0.1.
  assert.equal(percentSigned(0.05, 1, "en"), "+0.1%");
  assert.equal(percentSigned(-0.05, 1, "en"), "−0.1%");
  assert.equal(percentSigned(-0.05, 1, "bg"), "−0,1%");
});

test("the minus is U+2212, matching the tables it sits beside", () => {
  // The locale's own hyphen is narrower and reads as a dash mid-sentence.
  assert.ok(percentSigned(-1, 1, "bg").startsWith("−"));
});

test("a share takes no plus, and its minus is the site's own", () => {
  // A share of something is not a change in it, so the signed formatter is
  // wrong here in both directions: «+55,7%» over the part of the money that was
  // borrowed invents a movement nobody measured, and `number` would hand the
  // one year households repaid more than they took out `toLocaleString`'s
  // U+002D, the narrow hyphen the rule above exists to keep off the page.
  assert.equal(percentShare(55.712, 1, "bg"), "55,7%");
  assert.equal(percentShare(55.712, 0, "en"), "56%");
  assert.equal(percentShare(-20.272, 1, "bg"), "−20,3%");
  assert.ok(!percentShare(8.8, 1, "en").includes("+"), "a share came back with a direction on it");
  assert.ok(!percentShare(-1, 1, "en").includes("-"), "a share took the locale's hyphen");
  assert.equal(percentShare(null), "—");
});

test("dateShort renders a readable day-month-year in both languages", () => {
  // Both halves written out, because the month is the part that varies: a
  // pattern with `.*` between the day and the year matches every month style
  // Intl offers, «17 July 2026» included. bg-BG renders a short month and a
  // numeric one identically, so the English half is the one that pins it.
  assert.equal(dateShort("2026-07-17", "en"), "17 Jul 2026");
  assert.equal(dateShort("2026-07-17", "bg"), "17.07.2026 г.");
});

test("a monthly reference period is spoken as its own month, in both languages", () => {
  // Nobody reads «2026-06» as June, so the banner, the strip and the explainer
  // all say the month — and the render suites that read those back build their
  // expected string by calling this, which is why a month-index slip has to be
  // caught by a string written out rather than derived.
  assert.equal(periodLong("2026-06", "bg"), "юни 2026 г.");
  assert.equal(periodLong("2026-06", "en"), "June 2026");
  assert.equal(periodLong("2026-01", "bg"), "януари 2026 г.");
  assert.equal(periodLong("2026-01", "en"), "January 2026");
  // December is the month an off-by-one moves into the WRONG YEAR — every other
  // month it only misnames, and «януари 2027 г.» over November's reading dates
  // the whole page thirteen months out.
  assert.equal(periodLong("2026-12", "bg"), "декември 2026 г.");
  assert.equal(periodLong("2026-12", "en"), "December 2026");
  // A quarter and a bare year are the publisher's own label already.
  assert.equal(periodLong("2026-Q1", "bg"), "Q1 2026");
  assert.equal(periodLong("2026-Q1", "en"), "Q1 2026");
  assert.equal(periodLong("2026", "bg"), "2026");
  // Anything outside the pipeline's period shape is the em dash `period()`
  // returns, because these land inside `{@html …}` alongside copy that carries
  // markup — the same property, so usable in the same places.
  for (const bad of ["", null, undefined, "2026-6", "<b>2026</b>", "2026-Q5"]) {
    assert.equal(periodLong(bad, "bg"), "—", String(bad));
    assert.equal(periodLong(bad, "en"), "—", String(bad));
  }
});

test("a day of the month takes the ordinal ending its own language gives it", () => {
  // The rent row prints «до {day} число», and `rentDays` can return any day
  // from 1 to 30. One suffix written into the copy was wrong for eight of the
  // thirty in Bulgarian and six in English — «1-о число» where a reader expects
  // «1-во», "21th" where one expects "21st".
  assert.equal(ordinalDay(1, "bg"), "1-во");
  assert.equal(ordinalDay(2, "bg"), "2-ро");
  assert.equal(ordinalDay(3, "bg"), "3-то");
  assert.equal(ordinalDay(4, "bg"), "4-то");
  assert.equal(ordinalDay(5, "bg"), "5-о");
  assert.equal(ordinalDay(21, "bg"), "21-во");
  assert.equal(ordinalDay(23, "bg"), "23-то");
  assert.equal(ordinalDay(30, "bg"), "30-о");

  assert.equal(ordinalDay(1, "en"), "1st");
  assert.equal(ordinalDay(2, "en"), "2nd");
  assert.equal(ordinalDay(3, "en"), "3rd");
  assert.equal(ordinalDay(4, "en"), "4th");
  assert.equal(ordinalDay(21, "en"), "21st");
  assert.equal(ordinalDay(30, "en"), "30th");
});

test("the teens keep the plain ending, which the last digit alone gets wrong", () => {
  // 11 to 14 are единадесето…четиринадесето and eleventh…fourteenth: the ending
  // the last digit would hand them (-во, -ро, -то / st, nd, rd) is the one
  // thing that must not happen there.
  for (const [day, bg] of [
    [11, "11-о"],
    [12, "12-о"],
    [13, "13-о"],
    [14, "14-о"],
  ]) {
    assert.equal(ordinalDay(day, "bg"), bg);
    assert.equal(ordinalDay(day, "en"), `${day}th`);
  }
});

test("every day the rent row can print is an ordinal, in both languages", () => {
  // `mirror.js#rentDays` clamps to 1..30, so this is the whole domain rather
  // than a sample of it.
  for (let day = 1; day <= 30; day += 1) {
    assert.match(ordinalDay(day, "bg"), /^\d+-(во|ро|то|о)$/, `BG day ${day}`);
    assert.match(ordinalDay(day, "en"), /^\d+(st|nd|rd|th)$/, `EN day ${day}`);
  }
  assert.equal(ordinalDay(null, "bg"), "—");
  assert.equal(ordinalDay(NaN, "en"), "—");
});

test("«във» is written where Bulgarian writes it, and «в» everywhere else", () => {
  // Four of имот.bg's twenty-seven cities and four of НСИ's twenty-eight
  // области begin with В, so a copy string carrying a bare «в» before the slot
  // is ungrammatical for one reader in seven — «в Варна», on the card they came
  // for. The rule lives here rather than as four names in `content.js` because
  // the cities are data: имот.bg add and retire them, and a list goes stale on
  // a refresh nobody connects to it.
  for (const word of ["Варна", "Видин", "Враца", "Велико Търново", "Франция", "фабрика"]) {
    assert.equal(bgIn(word), "във", word);
  }
  for (const word of ["София", "Бургас", "Пловдив", "Русе", "Ямбол", "Хасково"]) {
    assert.equal(bgIn(word), "в", word);
  }
  // The empty state is «в», which is what a sentence with no place in it would
  // have carried anyway.
  for (const empty of ["", null, undefined, "  "]) assert.equal(bgIn(empty), "в");
  assert.equal(bgIn(" Варна"), "във", "a leading space defeated the rule");
});

test("every city and every област the payloads publish gets the right preposition", () => {
  // Over the collection rather than over six names I happened to think of: a
  // city added upstream is covered by this the day it lands, and a rule that
  // was wrong for one of the twenty-seven would show on that city's card only.
  const prices = published("city_price");
  const regions = published("region_salary");
  if (!prices || !regions) return;
  const names = [...prices.cities.map((c) => c.bg_name), ...regions.regions.map((r) => r.bg_name)];
  assert.ok(names.length > 0);
  for (const name of names) {
    assert.equal(bgIn(name), /^[ВФ]/.test(name) ? "във" : "в", name);
  }
});

test("a fetched string cannot carry markup into a template", () => {
  // An област's name is the one value on the page that is TEXT and comes from a
  // publisher. Every other substitution is a number, a date or one of our own
  // COPY strings, which is what makes rendering the templates through `{@html}`
  // safe at all. Escaped rather than trusted: the payload is a file on a CDN,
  // and "НСИ would never" is the assumption that makes a fetched value
  // dangerous to interpolate.
  assert.equal(safeText("<b>x</b>"), "&lt;b&gt;x&lt;/b&gt;");
  assert.equal(safeText('" onload="alert(1)'), "&quot; onload=&quot;alert(1)");
  assert.equal(safeText("A & B"), "A &amp; B");
  assert.equal(safeText("it's"), "it&#39;s");
  // The ampersand goes first, or the escapes escape each other.
  assert.equal(safeText("&lt;"), "&amp;lt;");
  assert.equal(safeText("Велико Търново"), "Велико Търново");
  for (const empty of [null, undefined]) assert.equal(safeText(empty), "");
});

test("a publisher's label reaches the DOM only in the shape a label has", () => {
  // `PayField.svelte` renders НСИ's sector name through `{@html …}`, because the
  // copy around it carries markup. So this admits what a label looks like rather
  // than escaping what it is handed: escaping would let anything through in a
  // mangled form, and a name that is not a name renders as a visibly missing one
  // instead. The whole string has to match — a rule that merely FINDS letters
  // somewhere passes «<img src=x onerror=alert(1)>Търговия», which is the case
  // the `{@html}` makes expensive.
  assert.equal(label("<img src=x onerror=alert(1)>Търговия"), "—");
  assert.equal(label("Търговия<script>alert(1)</script>"), "—");
  assert.equal(label("Образование\n<b>x</b>"), "—");
  assert.equal(label("x".repeat(121)), "—", "a label with no end to it is not a label");
  for (const empty of ["", "   ", null, undefined]) assert.equal(label(empty), "—", String(empty));
});

test("every sector name НСИ publishes survives the label rule intact", () => {
  // The other half of the shape: too strict and a real sector renders as an em
  // dash on the card the reader came for. Over the collection rather than over
  // names I picked, because the ones that would trip it are the ones with НСИ's
  // own punctuation — «Доставяне на води;канализационни услуги,управление на
  // отпадъци и възстановяване» carries a semicolon and an unspaced comma.
  const sectors = published("sector_salary");
  if (!sectors) return;
  assert.ok(sectors.sectors.length > 0);
  for (const s of sectors.sectors) {
    assert.equal(label(s.bg_name), s.bg_name);
    assert.equal(label(s.en_name), s.en_name);
  }
});

test("a source link is a web address or it is no link at all", () => {
  // Every source link on the page comes out of a published payload's
  // `source_url` and is rendered inside `{@html …}` copy. A scheme that is not
  // http(s) reaches an `href` as itself, and `javascript:` in an href is script
  // the reader runs by clicking a citation.
  assert.equal(httpUrl("javascript:alert(1)"), "");
  assert.equal(httpUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(httpUrl("vbscript:msgbox(1)"), "");
  // Not a URL at all, and the empty states — "" rather than an em dash, because
  // this goes into an `href` where a dash would be a broken relative link.
  for (const none of ["", "  ", "nsi.bg/x", null, undefined]) {
    assert.equal(httpUrl(none), "", String(none));
  }
  assert.equal(httpUrl("https://www.nsi.bg/x"), "https://www.nsi.bg/x");
  assert.equal(httpUrl("http://www.nsi.bg/x"), "http://www.nsi.bg/x");
});

test("every source_url the payloads publish survives as itself", () => {
  // The other half again: a rule that refused one of these would drop the
  // attribution link the licence conditions rest on (`docs/legal.md`), on a
  // page that still renders. Eurostat's carry a query string and имот.bg's a
  // path per city, so the collection is the check rather than one example.
  for (const name of ["hicp_categories", "mortgage", "region_salary", "city_price"]) {
    const payload = published(name);
    if (!payload) continue;
    assert.equal(httpUrl(payload.source_url), payload.source_url, name);
  }
});

test("a year prints without a thousands separator", () => {
  // `integer()` groups by locale, and this is the only place the page prints a
  // year out of a payload — имот.bg's per-city baseline, which is data rather
  // than a constant.
  assert.equal(yearText(2015), "2015");
  // The failure it exists for, on the locale that has it: en-GB groups four
  // digits and bg-BG does not, so a year through `integer()` reads «2,015» to
  // an English reader and correctly to a Bulgarian one — which is exactly the
  // shape of bug that ships, because whoever writes it reads the other side.
  assert.equal(integer(2015, "en"), "2,015");
  assert.equal(yearText(2015), integer(2015, "bg"));
  assert.equal(yearText("2003"), "2003");
  assert.equal(yearText(2026.4), "2026");
  for (const none of [0, -5, null, undefined, NaN, "later"]) assert.equal(yearText(none), "");
});
