/**
 * What every piece of text — and every control's edge — is ACTUALLY painted at.
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
 * ## The second test: control boundaries, at 3:1
 *
 * WCAG 1.4.11 asks 3:1 of whatever identifies a control, and on this page that
 * is one hairline: a field's `--paper-2` differs from the card's `--surface` by
 * 1.08:1, so the 1px border is the entire boundary. The rule asserted is
 * **where a control draws a border, that border clears 3:1** against the fill
 * inside it or the surface behind it — not that every control must have one.
 * `.rank-more` is identified by its text and its underline, and a native
 * checkbox is drawn by the user agent, which 1.4.11 leaves alone.
 *
 * That leaves one way to make this test green wrongly: delete the border. The
 * affordance assertions are what stop it — `verify_render_basket.mjs` §"the
 * disclosure chip reads as a control" fails on a chip whose `borderWidth` is 0.
 *
 * Sliders are measured by neither: the track's edge is an inset `box-shadow` on
 * a pseudo-element that `getComputedStyle(el)` cannot reach. What identifies
 * them is the thumb, `2px solid var(--real)`, and the `--real` fill against
 * `--track` — both far above 3:1, both argued in `BasketEditor.svelte`.
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

  // Anything a reader operates. `summary` is here because the drill-downs are
  // native disclosures, and `a.pill` because the route out of every page is
  // styled as one of the header's buttons rather than as a link.
  const CONTROLS = "input, select, textarea, button, summary, a.pill";

  const findings = [];
  let texted = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.nodeValue)
      .join(" ")
      .trim();
    if (!text) continue;
    texted++;
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

  // The composited surface behind an element, ignoring its own fill — what a
  // border on it is drawn against on the outside.
  const behind = (el) => {
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    for (const n of chain) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a) acc = over(c, acc);
    }
    return acc;
  };

  const edges = [];
  for (const el of document.querySelectorAll(CONTROLS)) {
    if (
      !el.checkVisibility({
        contentVisibilityAuto: true,
        opacityProperty: true,
        visibilityProperty: true,
      })
    )
      continue;
    if (el.matches(":disabled") || el.closest(":disabled, [aria-disabled='true']")) continue;

    const style = getComputedStyle(el);
    const side = ["Top", "Right", "Bottom", "Left"].find(
      (k) => parseFloat(style[`border${k}Width`]) > 0
    );
    if (!side) continue; // identified by its text, or drawn by the user agent

    const stroke = parse(style[`border${side}Color`]);
    if (!stroke) continue;
    const inside = behind(el);
    const outside = el.parentElement ? behind(el.parentElement) : inside;
    // A border sits between two colours and is discernible if it stands off
    // either one. Both are checked because a control on a card has its own
    // fill on the inside and the card on the outside, and here they differ by
    // 1.08:1 — so this is close to one measurement made twice, and would stop
    // being if a control ever gained a fill of its own.
    const painted = over(stroke, inside);
    const r = Math.max(ratio(painted, inside), ratio(over(stroke, outside), outside));
    if (r + 0.005 >= 3) continue;

    edges.push({ where: name(el), side, ratio: Number(r.toFixed(2)) });
  }

  return {
    text: findings,
    edges,
    audited: texted,
    controls: document.querySelectorAll(CONTROLS).length,
  };
};

const OPEN_DETAILS = () => {
  for (const d of document.querySelectorAll("details")) d.open = true;
};

/**
 * Drive the page through both themes and both languages, calling `collect`
 * with each pass's probe once the page has stopped moving.
 *
 * **The page is walked with motion off, and that is what makes the measurement
 * deterministic rather than fast.** `.mort-reverse` fades in over 280ms and the
 * body cross-fades its background on a theme flip, so a walk timed with a sleep
 * reads real elements at real intermediate values — a Windows runner caught one
 * at `opacity: 0.097` and reported 1.16:1, a frame no reader is ever shown.
 * `tokens.css` drops every animation and transition under
 * `prefers-reduced-motion`, so under it the page is only ever at rest, which is
 * the state WCAG is about. A longer sleep would be the same bet at a higher
 * stake, and the machine that loses it is CI.
 */
async function sweep(collect) {
  await withApp(
    async (page, errors) => {
      const theme = page.locator("header .controls button").first();
      const language = page.locator("header .controls button").last();

      // Belt to the reduced-motion braces: that media query cannot reach a
      // Svelte transition, which is driven from JavaScript. This would.
      const settled = () =>
        page.waitForFunction(() =>
          document
            .getAnimations()
            .every((a) => a.playState === "finished" || a.playState === "idle")
        );

      const home = page.locator(".homeTog input[type=checkbox]").first();
      assert.ok(await home.count(), "the home block's toggle is gone — half the card is unaudited");
      await home.check();
      await settled();

      for (const inDark of [false, true]) {
        for (const inEnglish of [false, true]) {
          await page.evaluate(OPEN_DETAILS);
          await settled();
          collect(
            `${inDark ? "dark" : "light"}/${inEnglish ? "en" : "bg"}`,
            await page.evaluate(AUDIT)
          );
          await language.click();
          await settled();
        }
        await theme.click();
        await settled();
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/",
    { reducedMotion: "reduce" }
  );
}

test("no text on the page is painted below its WCAG floor", { skip }, async () => {
  const failures = [];
  await sweep((where, probe) => {
    // A probe that matched nothing is a green test for a page that rendered
    // nothing, which is the shape every empty assertion in this repo takes.
    assert.ok(probe.audited > 100, `${where}: only ${probe.audited} elements carry text`);
    for (const f of probe.text) {
      failures.push(
        `${where}  ${f.where}  "${f.text}"  ${f.ratio}:1 (needs ${f.need}:1) ` +
          `at ${f.size}px/${f.weight}, alpha ${f.alpha}`
      );
    }
  });

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
});

test("every control that draws its own edge draws it at 3:1", { skip }, async () => {
  const failures = [];
  await sweep((where, probe) => {
    assert.ok(probe.controls > 20, `${where}: only ${probe.controls} controls on the page`);
    for (const f of probe.edges) {
      failures.push(
        `${where}  ${f.where}  border-${f.side.toLowerCase()}  ${f.ratio}:1 (needs 3:1)`
      );
    }
  });

  assert.deepEqual(
    failures,
    [],
    `control boundaries below WCAG 1.4.11:\n  ${failures.join("\n  ")}\n\n` +
      `A field's own fill differs from the card behind it by 1.08:1, so the ` +
      `border IS the boundary — at these ratios the control has no visible ` +
      `edge for a reader with reduced contrast sensitivity. --control-line is ` +
      `the token for this and --line is not: --line rules a page, and nothing ` +
      `asks 3:1 of a table rule or a card edge. Do not answer this by removing ` +
      `the border either — the affordance tests in verify_render_basket.mjs ` +
      `fail on a control whose borderWidth is 0.`
  );
});

test.after(shutdown);
