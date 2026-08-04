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
 *
 * **This file knows what a token is worth against a flat surface, and that is
 * all it knows.** It cannot see a fade declared in a component, a translucent
 * band painted under the text, or two of those multiplying.
 * `verify_render_contrast.mjs` walks the built page and measures what the
 * reader is actually given. It is the broader guard; the `.support` test at
 * the bottom of this file overlaps it deliberately and says why.
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
const INKS = ["ink", "ink-2", "muted", "real", "real-ink", "erode", "erode-ink"];
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
  // to fade it out. Every provenance caption on the page is this colour, and
  // 94 call sites paint from it at 11-13px.
  //
  // It is held ABOVE the floor rather than on it, at 5.47:1 at worst in the
  // light theme and 5.61:1 at worst in the dark one. A token at exactly 4.5
  // passes this assertion and still reads thin, because the page composites
  // on top of it: a `--gain-band` or `--real-soft` row behind a caption is a
  // translucent layer, and it costs about 1.5 of ratio all by itself.
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

test("the footer's support line renders at the ratio its token promises", () => {
  // Everything above reads `tokens.css`, so a fade applied anywhere else is
  // invisible to all of it — and `--muted`'s headroom over AA is about a
  // fifth, which a fade spends immediately. Nothing under 0.89 in the light
  // theme still clears 4.5:1 on `--paper-2`: `opacity: 0.85` composites to
  // 4.12:1, on the one sentence that says how the project is paid for.
  //
  // `opacity` is what makes this class of defect invisible in review: it looks
  // like a taste dial and it is arithmetic on a contrast ratio. So this
  // recomputes the ratio the rule actually renders at, reading the component
  // rather than the palette, and the lever cannot be pulled quietly.
  //
  // **This is not a duplicate of `verify_render_contrast.mjs`, which measures
  // every fade on the page and this one rule among them.** That suite needs a
  // browser and SKIPS without one; this file always runs. Between a
  // contributor with no Chromium and a re-faded footer there is nothing else,
  // which is the test docs/testing-strategy.md §"Would this go red while a
  // broader check stays green?" asks — it goes red on a run where the broader
  // one asserted nothing at all. Do not retire it as redundant.
  const FOOTER = readFileSync(join(HERE, "..", "src", "lib", "SiteFooter.svelte"), "utf-8");
  const rule = FOOTER.match(/\.support\s*\{([^}]*)\}/);
  assert.ok(rule, ".support is gone from SiteFooter.svelte — the support line with it?");

  const colour = rule[1].match(/color:\s*var\(--([\w-]+)\)/);
  assert.ok(colour, ".support no longer paints its text from a token");
  const fade = rule[1].match(/opacity:\s*([\d.]+)/);
  const alpha = fade ? Number(fade[1]) : 1;

  for (const [themeName, block] of [
    ["light", ":root {"],
    ["dark", 'html[data-theme="dark"] {'],
  ]) {
    // The footer sits on --paper-2. Compositing a partly transparent
    // foreground over it is what the browser does, so it is what this does.
    const bg = token(block, "paper-2");
    const fg = token(block, colour[1]);
    const mixed =
      "#" +
      [1, 3, 5]
        .map((i) => {
          const f = parseInt(fg.slice(i, i + 2), 16);
          const b = parseInt(bg.slice(i, i + 2), 16);
          return Math.round(alpha * f + (1 - alpha) * b)
            .toString(16)
            .padStart(2, "0");
        })
        .join("");
    const r = ratio(mixed, bg);
    assert.ok(
      r >= AA_BODY,
      `${themeName}: the footer support line renders at ${r.toFixed(2)}:1 ` +
        `(--${colour[1]} at opacity ${alpha} on --paper-2), below ${AA_BODY}:1. ` +
        `Quiet is a size and a colour; --${colour[1]} is already the quietest ` +
        `token that stays readable, and fading it further makes the line ` +
        `unreadable rather than discreet.`
    );
  }
});

test("--control-line clears the 3:1 WCAG asks of a control's boundary", () => {
  // WCAG 1.4.11, and 3:1 rather than 4.5 because it is not text. It gets its
  // own assertion because it is the only token in the palette with a bar of
  // its own, and because the tempting edit is to point a control's border back
  // at `--line`: they look interchangeable and one of them is a hairline
  // ruling a page while the other is the entire visible extent of an input.
  // A field's `--paper-2` fill differs from the card's `--surface` by 1.08:1,
  // so nothing else marks where the control begins.
  //
  // `verify_render_contrast.mjs` measures the borders the page actually draws,
  // which is the stronger check and the one that catches a rule pointed at the
  // wrong token. It needs a browser and skips without one. This does not.
  for (const [themeName, block] of [
    ["light", ":root {"],
    ["dark", 'html[data-theme="dark"] {'],
  ]) {
    for (const surface of SURFACES) {
      const r = ratio(token(block, "control-line"), token(block, surface));
      assert.ok(
        r >= 3,
        `${themeName}: --control-line on --${surface} is ${r.toFixed(2)}:1, under 3:1. ` +
          `Every field, chip, pill and disclosure edge is this colour, and at ` +
          `that ratio a reader with reduced contrast sensitivity cannot see ` +
          `where the control is.`
      );
    }
  }
});

test("the two themes are both defined, so neither can be silently dropped", () => {
  assert.ok(CSS.includes(":root {"), "light theme block is gone");
  assert.ok(CSS.includes('html[data-theme="dark"] {'), "dark theme block is gone");
  for (const name of [...INKS, ...SURFACES, "control-line"]) {
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
