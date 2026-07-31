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

import { number, integer, percentSigned, dateShort } from "../src/lib/format.js";

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

test("percentSigned prints exactly one sign, whichever way the number goes", () => {
  // The bug this exists to prevent: `+{number(x)}%` renders «+−5,0%» as soon
  // as x is negative, and both operands can be — a pay cut is typeable, and a
  // basket weighted onto falling groups makes personal inflation negative.
  assert.equal(percentSigned(5, 1, "en"), "+5.0%");
  assert.equal(percentSigned(-5, 1, "en"), "−5.0%");
  assert.equal(percentSigned(0, 1, "en"), "+0.0%");
  for (const x of [12.34, -12.34, 0, -0.04]) {
    const rendered = percentSigned(x, 1, "en");
    const signs = rendered.match(/[+−-]/g) ?? [];
    assert.equal(signs.length, 1, `${rendered} carries ${signs.length} signs`);
  }
});

test("the minus is U+2212, matching the tables it sits beside", () => {
  // The locale's own hyphen is narrower and reads as a dash mid-sentence.
  assert.ok(percentSigned(-1, 1, "bg").startsWith("−"));
});

test("dateShort renders a readable day-month-year in both languages", () => {
  assert.match(dateShort("2026-07-17", "en"), /17.*Jul.*2026/);
  assert.match(dateShort("2026-07-17", "bg"), /17.*2026/);
});
