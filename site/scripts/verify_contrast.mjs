#!/usr/bin/env node
/**
 * Contrast verification for `src/lib/tokens.css`.
 *
 * The palette is the one thing in this repo that can go quietly unreadable:
 * a token nudged by a few hex points still "looks fine" to whoever changed
 * it, on their monitor, in their theme. `--muted` is the colour of the
 * SMALLEST text on the page — every source caption, every hint, the 9.5px
 * wordmark tagline — so a few points too light there is the difference between
 * readable and not, and nobody notices for months.
 *
 * So the ratios are pinned here, both themes, computed from the CSS itself
 * rather than from a copy of the values — a token edited in `tokens.css`
 * without re-checking its contrast fails this file.
 *
 * Reading the numbers: WCAG 2.1 AA wants **4.5:1** for body text and **3:1**
 * for large text (>=18.66px bold, or >=24px). Everything below is small text,
 * so 4.5 is the bar, with no exceptions carved out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "..", "src", "lib", "tokens.css"), "utf-8");

/** Pull one `--name: #rrggbb;` out of a given block of the stylesheet. */
function token(block, name) {
  const scope = CSS.slice(CSS.indexOf(block));
  const end = scope.indexOf("}");
  const m = scope.slice(0, end).match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--${name} is not a hex colour in ${block.trim()} — cannot check contrast`);
  return m[1];
}

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance, WCAG 2.1 §"relative luminance". */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio, WCAG 2.1 §"contrast ratio". 1:1 identical, 21:1 max. */
function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const AA_BODY = 4.5;

/** Every ink token, against every surface it is actually painted on. */
const INKS = ["ink", "ink-2", "muted", "real", "real-ink", "erode"];
const SURFACES = ["paper", "paper-2", "surface"];

for (const [themeName, block] of [
  ["light", ":root {"],
  ["dark", 'html[data-theme="dark"] {'],
]) {
  test(`${themeName} theme: every ink clears WCAG AA on every surface`, () => {
    const failures = [];
    for (const ink of INKS) {
      for (const surface of SURFACES) {
        const r = ratio(token(block, ink), token(block, surface));
        if (r < AA_BODY) {
          failures.push(`--${ink} on --${surface}: ${r.toFixed(2)}:1 (needs ${AA_BODY}:1)`);
        }
      }
    }
    assert.deepEqual(
      failures,
      [],
      `${themeName} theme has unreadable text:\n  ${failures.join("\n  ")}\n` +
        `These are all SMALL-text roles — captions, hints, source lines — so ` +
        `the large-text 3:1 allowance does not apply.`
    );
  });
}

test("--muted specifically stays readable — it carries the smallest type", () => {
  // Named on its own because it is the token that failed, and because it is
  // the most tempting one to lighten again: "muted" reads as an instruction
  // to fade it out. Every provenance caption on the page is this colour.
  for (const [themeName, block] of [
    ["light", ":root {"],
    ["dark", 'html[data-theme="dark"] {'],
  ]) {
    for (const surface of SURFACES) {
      const r = ratio(token(block, "muted"), token(block, surface));
      assert.ok(
        r >= AA_BODY,
        `${themeName}: --muted on --${surface} is ${r.toFixed(2)}:1. ` +
          `If a design change genuinely needs it lighter, the source captions ` +
          `have to get bigger first — do not widen this threshold.`
      );
    }
  }
});

test("the two themes are both defined, so neither can be silently dropped", () => {
  assert.ok(CSS.includes(":root {"), "light theme block is gone");
  assert.ok(CSS.includes('html[data-theme="dark"] {'), "dark theme block is gone");
  for (const name of [...INKS, ...SURFACES]) {
    token(":root {", name);
    token('html[data-theme="dark"] {', name);
  }
});

test("text painted ON the accent fill clears AA too, in both themes", () => {
  // The matrix above covers ink-on-paper. It does not cover the inverse, which
  // the page also does: every primary action — the share button, the retry on
  // the data-failed state, the 404's route back to the calculator — is
  // `color: var(--surface)` on `background: var(--real)`. Nothing checked that
  // pair, so darkening `--surface` or lightening `--real` for aesthetic
  // reasons could have made every button on the site unreadable with all three
  // suites green.
  for (const [themeName, block] of [
    ["light", ":root {"],
    ["dark", 'html[data-theme="dark"] {'],
  ]) {
    for (const fill of ["real", "real-ink"]) {
      const r = ratio(token(block, "surface"), token(block, fill));
      assert.ok(
        r >= AA_BODY,
        `${themeName}: --surface text on a --${fill} fill is ${r.toFixed(2)}:1 ` +
          `(needs ${AA_BODY}:1). That is the label on every primary button.`
      );
    }
  }
});
