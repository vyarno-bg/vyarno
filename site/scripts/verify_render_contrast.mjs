/**
 * What every piece of text on the page is ACTUALLY painted at.
 *
 * `verify_contrast.mjs` reads `tokens.css` and proves the palette clears WCAG
 * AA. That is a claim about seven colours against three surfaces, and all of it
 * can be true while the page is unreadable, because everything that lands
 * between a token and a reader is arithmetic on the ratio and none of it is in
 * the palette. `opacity: 0.75` over `--muted` costs about 2.4 of ratio; a
 * translucent `--gain-band` under a caption costs about 1.5; an ancestor's fade
 * multiplies into a child's; and an inline `style="opacity:0.8"` is in no
 * `<style>` block for any regex to find. Each of those is a taste dial to look
 * at and a contrast failure to measure, which is why they accumulate — five
 * fades over four components is what a green palette check permits.
 *
 * So this measures the effect instead of the declaration, which is the whole
 * argument for the render suites (`render-harness.mjs` §"What these suites
 * assert"). For every element that owns visible text it walks its ancestor
 * chain, multiplies the `opacity` of each link into the text's alpha,
 * composites every background layer up that same chain — semi-transparent ones
 * included, because `--rule`, `--track` and the four `-soft` tokens are rgba
 * and a layer that lets its backdrop through is not a background — and
 * computes the ratio the reader receives.
 *
 * ## The bar
 *
 * 4.5:1, with the WCAG large-text allowance of 3:1 only where the COMPUTED
 * font-size is >=24px, or >=18.66px at weight >=700. Both are read off
 * `getComputedStyle`, so `font-size: 0.42em` inside a `clamp()` is resolved
 * rather than guessed at: at a phone width that pair is 16.8px and gets no
 * allowance, which is the case the arithmetic exists for.
 *
 * ## What is deliberately not audited
 *
 * - **Elements with no text node of their own.** A container's inherited
 *   `color` paints nothing; auditing it reports ratios for markup a reader
 *   never sees, and a suite that reports noise is one somebody silences.
 * - **Anything not rendered.** Both language variants are always in the DOM and
 *   `tokens.css` hides one with `display: none` — a hidden element still
 *   returns a colour and has no painted background behind it, so it would fail
 *   on nothing. `checkVisibility()` decides, and the other language is reached
 *   by flipping the toggle and walking again.
 * - **Disabled controls.** WCAG 1.4.3 exempts an inactive control, and the
 *   retry on the data-failed state is drawn at `opacity: 0.55` on purpose.
 * - **Non-text graphics.** The mortgage bar caps are `--ink` at `opacity: 0.7`
 *   with no text in them; 1.4.11 asks 3:1 of them and they are far above it.
 *
 * **SVG text IS in scope** — the sparkline's price label and the tax-wedge
 * axis labels are text a reader reads, painted from `--ink-2` and `--muted`,
 * and they are exactly the kind of thing that gets faded. `fill` is read
 * instead of `color` for them. The limit worth knowing: only CSS backgrounds
 * are composited, so a label moved on top of a sibling `<path>` fill would be
 * measured against the card surface behind the chart rather than against the
 * fill. Keep SVG labels off the filled areas, or this suite will report a
 * ratio the reader does not get.
 *
 * **The walk only sees the markup the page is currently rendering**, so the
 * suite has to put the page into the states worth auditing before it looks.
 * The home block is switched on and every `<details>` is opened, which between
 * them are the two biggest gated regions — the mortgage hints, the affordability
 * note and every drill-down body. What stays out of reach is the state no
 * interaction produces: the stale-data banner needs a payload that stopped
 * refreshing, so its ratios are argued in `DataBanner.svelte` and checked by
 * nothing here. A region added behind a new toggle is a region this suite stops
 * covering unless the toggle is added above.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";

/**
 * The walk, serialised so it can be handed to `page.evaluate`.
 *
 * It returns every failing element rather than the first, because the failure
 * this catches arrives in batches — a fade applied to a rule that four
 * components share — and a suite that reports one of five sends the next
 * contributor round the loop five times.
 */
const AUDIT = () => {
  const parse = (value) => {
    const m = /^rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const p = m[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    if (p.slice(0, 3).some(Number.isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  /** Source-over: `fg` at its own alpha on top of an opaque `bg`. */
  const over = (fg, bg) => ({
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1,
  });
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (x, y) => {
    const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
    return (a + 0.05) / (b + 0.05);
  };

  const name = (el) => {
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class");
    return el.tagName.toLowerCase() + (cls ? `.${cls.trim().split(/\s+/).join(".")}` : "");
  };

  const findings = [];
  for (const el of document.body.querySelectorAll("*")) {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.nodeValue)
      .join(" ")
      .trim();
    if (!text) continue;
    if (
      !el.checkVisibility({
        contentVisibilityAuto: true,
        opacityProperty: true,
        visibilityProperty: true,
      })
    )
      continue;
    if (el.closest(":disabled, [aria-disabled='true']")) continue;

    // root -> el, so a background layer can be composited in paint order and
    // each link's opacity multiplied into everything it contains.
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    const styles = chain.map((n) => getComputedStyle(n));

    // `cum[i]` is the opacity every pixel painted by chain[i] arrives at:
    // its own, times each ancestor's. An element's own background and its own
    // text are inside the same group, so both carry the same factor and a fade
    // over an opaque own-background cancels out of the ratio — which is what
    // the browser does.
    const cum = [];
    let acc = 1;
    for (let i = 0; i < chain.length; i++) {
      acc *= Number(styles[i].opacity);
      cum[i] = acc;
    }
    if (!cum[chain.length - 1]) continue;

    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = 0; i < chain.length; i++) {
      const layer = parse(styles[i].backgroundColor);
      if (!layer || !layer.a) continue;
      bg = over({ ...layer, a: layer.a * cum[i] }, bg);
    }

    const style = styles[chain.length - 1];
    const painted = parse(
      el.namespaceURI === "http://www.w3.org/2000/svg" ? style.fill : style.color
    );
    if (!painted) continue; // `fill: none`, or a paint server this cannot resolve
    const alpha = painted.a * cum[chain.length - 1];
    const r = ratio(over({ ...painted, a: alpha }, bg), bg);

    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (r + 0.005 >= need) continue;

    findings.push({
      where: name(el),
      text: text.replace(/\s+/g, " ").slice(0, 48),
      ratio: Number(r.toFixed(2)),
      need,
      size: Number(size.toFixed(1)),
      weight,
      alpha: Number(alpha.toFixed(3)),
    });
  }
  return findings;
};

const OPEN_DETAILS = () => {
  for (const d of document.querySelectorAll("details")) d.open = true;
};

test("no text on the page is painted below its WCAG floor", { skip }, async () => {
  await withApp(async (page, errors) => {
    const theme = page.locator("header .controls button").first();
    const language = page.locator("header .controls button").last();

    const home = page.locator(".homeTog input[type=checkbox]").first();
    assert.ok(await home.count(), "the home block's toggle is gone — half the card is unaudited");
    await home.check();
    await page.waitForTimeout(300);

    const failures = [];
    for (const inDark of [false, true]) {
      for (const inEnglish of [false, true]) {
        await page.evaluate(OPEN_DETAILS);
        const where = `${inDark ? "dark" : "light"}/${inEnglish ? "en" : "bg"}`;
        // The selector has to match something or this is a green test for a
        // page that rendered nothing at all.
        const audited = await page.evaluate(
          () =>
            [...document.body.querySelectorAll("*")].filter((el) =>
              [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim())
            ).length
        );
        assert.ok(
          audited > 100,
          `${where}: only ${audited} elements carry text — did the page render?`
        );

        for (const f of await page.evaluate(AUDIT)) {
          failures.push(
            `${where}  ${f.where}  "${f.text}"  ${f.ratio}:1 (needs ${f.need}:1) ` +
              `at ${f.size}px/${f.weight}, alpha ${f.alpha}`
          );
        }
        await language.click();
        await page.waitForTimeout(200);
      }
      await theme.click();
      await page.waitForTimeout(300);
    }

    assert.deepEqual(
      failures,
      [],
      `text below its contrast floor:\n  ${failures.join("\n  ")}\n\n` +
        `An alpha under 1 in a row above is a fade, and a fade on text is a ` +
        `contrast ratio multiplied down. De-emphasis that survives this is a ` +
        `size and a colour: the type scale has nine steps and --muted is the ` +
        `quietest ink that stays readable. Do not answer this by raising the ` +
        `alpha until it just clears — that is a number tuned to one surface, ` +
        `and the token underneath it is painted on three.`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test.after(shutdown);
