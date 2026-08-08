/**
 * $lib/format.js — the four functions every figure on the page passes through.
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
  percentSigned,
  dateShort,
  ordinalDay,
  parseDecimal,
  decimalText,
} from "../src/lib/format.js";

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

test("dateShort renders a readable day-month-year in both languages", () => {
  assert.match(dateShort("2026-07-17", "en"), /17.*Jul.*2026/);
  assert.match(dateShort("2026-07-17", "bg"), /17.*2026/);
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
