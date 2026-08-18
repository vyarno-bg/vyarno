/**
 * The picture a reader sends, drawn in their own browser.
 *
 * ## Why this one is a canvas when every chart in the app is inline SVG
 *
 * The charts are SVG because nothing third-party may reach the reader and an
 * SVG needs no library to draw. That reasoning does not decide this file: the
 * artefact here has to leave the page as a PNG — a share sheet takes a file,
 * a chat window takes a raster — and an SVG serialised into an `<img>` loses
 * the page's fonts, because a document loaded as an image resolves no
 * `@font-face` from its parent. Embedding the four woff2 files as base64 to
 * get them back would put half a megabyte of font into every card.
 *
 * A canvas draws with the fonts the page already has and hands back a PNG. It
 * is still zero dependencies and still nothing third-party, which is what the
 * rule was protecting.
 *
 * ## The colours are read, never written
 *
 * Every colour comes out of the live custom properties in `tokens.css` via
 * `readPalette`, so the card follows the reader's theme and — the part that
 * matters — inherits `verify_contrast.mjs`'s AA guarantee instead of standing
 * on a second palette nothing polices. **Do not hardcode a hex value in this
 * file.** A colour that cannot be found in `tokens.css` is a colour no test
 * has ever checked the contrast of.
 *
 * ## What may be on it
 *
 * Not this file's decision. `view/share.js#sharePayload` returns the closed set of
 * shareable fields and takes no salary; this draws what it is given. If you
 * are here to add a figure to the card, the field has to exist in that payload
 * first, which is where P2 is argued.
 */

import { number, periodLong } from "./format.js";
import { t } from "./content.js";
import { barCeiling } from "./view/share.js";

/**
 * The export size, and why it is this one.
 *
 * 1200×630 is what every link unfurler crops least and what
 * `scripts/make_og_image.py` already produces for the static preview, so the
 * generated card and the site's own card are the same shape in a feed.
 */
export const SHARE_CARD = Object.freeze({ width: 1200, height: 630 });

/**
 * The vertical plan, as fixed baselines rather than a flow.
 *
 * Fixed, because the card has to be the same picture whatever it says: a
 * layout that flows puts the source line at a different height for a
 * three-word verdict than for a two-line one, and the footer — the source
 * name, the period and the domain, which P9 requires to be legible without a
 * link — is the first thing that walks off the bottom edge. Everything is
 * measured from the top except the footer, which is measured from the bottom.
 */
const Y = Object.freeze({
  headerBaseline: 66,
  headerRule: 104,
  kicker: 158,
  figure: 274,
  mineLabel: 330,
  mineTrack: 344,
  averageLabel: 400,
  averageTrack: 414,
  verdictFirst: 486,
  verdictLine: 46,
  detail: 556,
  footerRule: 578,
  footerBaseline: 610,
});

const PAD = 64;
const TRACK_HEIGHT = 16;
const CONTENT_WIDTH = SHARE_CARD.width - PAD * 2;

/** Which verdict gets which serif line. String literals: see `view/share.js`. */
const CARD_VERDICT_KEY = Object.freeze({
  dearer: "shareCardVerdictDearer",
  cheaper: "shareCardVerdictCheaper",
  close: "shareCardVerdictClose",
});

/**
 * The line that replaces all three above when `share.ownBasket` is false.
 *
 * Outside `CARD_VERDICT_KEY` on purpose: that map is indexed by `share.verdict`
 * and a key inside it is reachable by a genuine comparison.
 */
const CARD_VERDICT_NO_BASKET = "shareCardVerdictNoBasket";

/**
 * The rest of the `COPY` keys the card is lettered with.
 *
 * Named through this map rather than reached as `copy.shareCardMine`, so that
 * `verify_copy.mjs` — which scans the sources as text — can see them at all. A
 * key nothing appears to render is reported as dead and deleted by the next
 * person tidying up, and the first anyone would know is a blank line on a
 * picture already sent.
 */
const CARD_COPY = Object.freeze({
  tagline: "brandSmall",
  kicker: "shareCardKicker",
  kickerOfficial: "shareCardKickerOfficial",
  mine: "shareCardMine",
  average: "shareCardAverage",
  top: "shareCardTop",
  source: "shareCardSource",
  cta: "shareCardCta",
});

/**
 * Every key whose words end up ON the picture.
 *
 * The distinction this draws is the one that matters for the voice check in
 * `verify_copy.mjs`: these are spoken by the reader to a stranger and must be
 * in the first person, where `shareHead` and `shareNote` are the app talking
 * to the reader and are correctly in the second.
 */
export const SHARE_CARD_COPY_KEYS = Object.freeze([
  ...Object.values(CARD_VERDICT_KEY),
  CARD_VERDICT_NO_BASKET,
  ...Object.values(CARD_COPY),
]);

/**
 * The custom properties the card is drawn with, read off a live element.
 *
 * @param {Element} [el]  anything inside the themed tree; defaults to <html>
 * @returns {Record<string,string>}
 */
export function readPalette(el) {
  const style = getComputedStyle(el ?? document.documentElement);
  const read = (name) => style.getPropertyValue(name).trim();
  return {
    paper: read("--surface"),
    ink: read("--ink"),
    ink2: read("--ink-2"),
    muted: read("--muted"),
    line: read("--line"),
    real: read("--real"),
    realInk: read("--real-ink"),
    erode: read("--erode"),
    track: read("--line-2"),
    serif: read("--serif"),
    sans: read("--sans"),
    mono: read("--mono"),
  };
}

/**
 * Every string on the card, in one object.
 *
 * Split out from the drawing so the wording is testable without a browser —
 * the failure this catches is an unsubstituted `{p}` or a blank line reaching
 * a picture that is already in somebody's chat, and that is a copy bug rather
 * than a rendering one.
 *
 * @param {object} args
 * @param {object} args.share  `view/share.js#sharePayload` output
 * @param {object} args.copy   the `COPY` object
 * @param {'bg'|'en'} args.lang
 */
export function shareCardText({ share, copy, lang = "bg" }) {
  const windowLabel =
    share.anchor === "y1"
      ? t(copy.shareWindowY1, lang)
      : t(copy.shareWindowSince, lang, { y: String(share.anchor) });
  const piText = number(share.piPct, 1, lang);

  return {
    tagline: t(copy[CARD_COPY.tagline], lang),
    // The kicker names whose the figure under it is, so it follows the owner.
    kicker: t(copy[share.ownBasket ? CARD_COPY.kicker : CARD_COPY.kickerOfficial], lang, {
      w: windowLabel,
    }),
    // The unit is a separate slot because it is set separately: `.r-big .pct`
    // in the results card draws the percent sign at 0.42em and raised, and a
    // full-height "%" beside a 116px numeral out-weighs the number it belongs
    // to.
    figure: piText,
    figureUnit: "%",
    // Dropped rather than drawn, on the rule `detail` below already follows:
    // without a described basket this row is the average row again, at the same
    // rate, under a label calling it the sender's.
    mineLabel: share.ownBasket ? t(copy[CARD_COPY.mine], lang) : "",
    mineValue: share.ownBasket ? `${piText}%` : "",
    averageLabel: t(copy[CARD_COPY.average], lang),
    averageValue: `${number(share.officialPct, 1, lang)}%`,
    verdict: t(
      copy[share.ownBasket ? CARD_VERDICT_KEY[share.verdict] : CARD_VERDICT_NO_BASKET],
      lang
    ),
    // Dropped rather than drawn empty when no division leads — a basket with
    // every slider at zero has no biggest bite, and a dangling «Най-тежко
    // удря:» with nothing after it is worse than the silence.
    detail: Number.isFinite(share.topPp)
      ? t(copy[CARD_COPY.top], lang, {
          c: (lang === "bg" ? share.topBgName : share.topEnName).toLowerCase(),
          pp: number(share.topPp, 1, lang),
          p: piText,
        })
      : "",
    source: t(copy[CARD_COPY.source], lang, { d: periodLong(share.refPeriod, lang) }),
    cta: t(copy[CARD_COPY.cta], lang, { u: share.domain }),
  };
}

/**
 * How much of the track each bar fills, as fractions of 1.
 *
 * The ceiling comes from `view/share.js#barCeiling`, which the results card's own
 * pair of bars is drawn against too — an image that disagrees with the screen
 * it was generated from is the defect worth spending an import on.
 *
 * Both bars get a floor, where the results card floors only the reader's own.
 * On screen an average of zero is a track beside twelve other rows and a
 * source caption; alone on a picture, a bar of no width reads as "this figure
 * is missing" rather than as "almost nothing".
 */
export function shareCardBars(share) {
  const ceiling = barCeiling({
    piPct: share.piPct,
    officialPct: share.officialPct,
    anchor: share.anchor,
  });
  const fraction = (value) => Math.min(1, Math.max(0.02, value / ceiling));
  return { mine: fraction(share.piPct), average: fraction(share.officialPct) };
}

/**
 * The colour the headline figure and the reader's own bar are painted.
 *
 * Follows the GAP, not the level, for the same reason the results card does:
 * the question the card answers is whether this basket is dearer than the
 * average one, so a high-but-typical basket is not painted as a loss.
 */
function verdictColour(share, palette) {
  if (share.verdict === "close") return palette.ink;
  return share.verdict === "dearer" ? palette.erode : palette.realInk;
}

/** `text` broken to at most `maxLines` lines that fit `maxWidth`. */
function wrap(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The headline figure, set the way the results card sets it.
 *
 * Two details are carried over deliberately rather than left to the default.
 * The tightening matches `.r-big`'s `letter-spacing: -0.03em`, and a monospace
 * advance is what it is paying for: every cell is the width of the widest
 * digit, so «6,5» draws with air either side of a comma that needs none, at a
 * size where the gap is a third of a numeral. And the percent sign is set
 * small and raised, because at the same height as a 116px numeral it reads as
 * part of the number rather than as its unit.
 *
 * `ctx.letterSpacing` is a no-op in a browser that does not implement it,
 * which is the right failure: slightly loose, never wrong.
 */
function drawFigure(ctx, palette, { value, unit, size, colour }) {
  ctx.textAlign = "left";
  ctx.fillStyle = colour;
  ctx.font = `600 ${size}px ${palette.mono}`;
  ctx.letterSpacing = `${-0.03 * size}px`;
  ctx.fillText(value, PAD, Y.figure);
  const width = ctx.measureText(value).width;
  ctx.letterSpacing = "0px";

  ctx.globalAlpha = 0.62;
  ctx.font = `600 ${Math.round(size * 0.42)}px ${palette.mono}`;
  ctx.fillText(unit, PAD + width + size * 0.06, Y.figure - size * 0.4);
  ctx.globalAlpha = 1;
}

/** One comparison bar: label and value on a line, the track under it. */
function drawBar(ctx, palette, { label, value, fraction, labelY, trackY, fill }) {
  ctx.textAlign = "left";
  ctx.fillStyle = palette.ink2;
  ctx.font = `400 26px ${palette.sans}`;
  ctx.fillText(label, PAD, labelY);

  ctx.textAlign = "right";
  ctx.fillStyle = fill;
  ctx.font = `600 28px ${palette.mono}`;
  ctx.letterSpacing = "-0.56px"; // -0.02em, as `.vbars .gm .num`
  ctx.fillText(value, SHARE_CARD.width - PAD, labelY);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = palette.track;
  ctx.fillRect(PAD, trackY, CONTENT_WIDTH, TRACK_HEIGHT);
  ctx.fillStyle = fill;
  ctx.fillRect(PAD, trackY, CONTENT_WIDTH * fraction, TRACK_HEIGHT);
}

/**
 * Draw the card. The canvas is left at its natural export size.
 *
 * The caller sizes the element and awaits `document.fonts.ready` first — a
 * canvas measures and paints with whatever is loaded at the moment it draws,
 * so a card generated before the woff2 files arrive is silently set in the
 * system stack rather than in the page's own faces.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} args
 * @param {object} args.share  `view/share.js#sharePayload` output
 * @param {object} args.copy
 * @param {'bg'|'en'} args.lang
 * @param {Record<string,string>} args.palette  `readPalette()`
 */
export function drawShareCard(canvas, { share, copy, lang = "bg", palette }) {
  canvas.width = SHARE_CARD.width;
  canvas.height = SHARE_CARD.height;
  const ctx = canvas.getContext("2d");
  const text = shareCardText({ share, copy, lang });
  const bars = shareCardBars(share);
  const accent = verdictColour(share, palette);

  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, SHARE_CARD.width, SHARE_CARD.height);
  ctx.textBaseline = "alphabetic";

  // The wordmark at the proportions of the 22×22 mark in
  // `ResultsWordmark.svelte` — the short muted bar, the tall accented one, and
  // the rule joining their feet. **The rule is part of the mark**: `favicon.svg`,
  // `SiteHeader.svelte` and the bitmaps `scripts/make_og_image.py` draws all
  // carry it, and this is the copy that travels furthest from the site, into
  // chats where nothing else identifies it. Two loose bars are a different mark.
  const s = 34 / 22;
  const top = Y.headerBaseline - 34;
  const markX = (x) => PAD + (x - 2) * s;
  ctx.fillStyle = palette.muted;
  ctx.fillRect(markX(2), top + 6 * s, 4 * s, 14 * s);
  ctx.fillStyle = palette.real;
  ctx.fillRect(markX(16), top + 2 * s, 4 * s, 18 * s);
  ctx.strokeStyle = palette.real;
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(markX(6), top + 19.25 * s);
  ctx.lineTo(markX(16), top + 19.25 * s);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = palette.ink;
  ctx.font = `600 30px ${palette.mono}`;
  ctx.fillText(share.domain, PAD + 24 * s, Y.headerBaseline);

  ctx.textAlign = "right";
  ctx.fillStyle = palette.muted;
  ctx.font = `400 24px ${palette.sans}`;
  ctx.fillText(text.tagline, SHARE_CARD.width - PAD, Y.headerBaseline);

  ctx.fillStyle = palette.line;
  ctx.fillRect(PAD, Y.headerRule, CONTENT_WIDTH, 1);
  ctx.fillRect(PAD, Y.footerRule, CONTENT_WIDTH, 1);

  ctx.textAlign = "left";
  ctx.fillStyle = palette.muted;
  ctx.font = `400 25px ${palette.mono}`;
  ctx.fillText(text.kicker, PAD, Y.kicker);

  drawFigure(ctx, palette, {
    value: text.figure,
    unit: text.figureUnit,
    size: 116,
    colour: accent,
  });

  if (text.mineLabel) {
    drawBar(ctx, palette, {
      label: text.mineLabel,
      value: text.mineValue,
      fraction: bars.mine,
      labelY: Y.mineLabel,
      trackY: Y.mineTrack,
      fill: accent,
    });
  }
  // **A single bar takes the upper pair of baselines, not the lower.** The
  // fixed plan is tuned for two, so dropping the reader's own row left 126px of
  // nothing between the figure and the average — a hole under the biggest
  // object on the card, which reads as a row that failed to draw rather than as
  // one that was never owed. Moved up, the bar stays attached to the figure it
  // quantifies and the slack falls at the paragraph break above the verdict.
  // The footer does not move either way, which is what the fixed plan is for.
  const soloBar = !text.mineLabel;
  drawBar(ctx, palette, {
    label: text.averageLabel,
    value: text.averageValue,
    fraction: bars.average,
    labelY: soloBar ? Y.mineLabel : Y.averageLabel,
    trackY: soloBar ? Y.mineTrack : Y.averageTrack,
    fill: palette.muted,
  });

  ctx.textAlign = "left";
  ctx.fillStyle = palette.ink;
  ctx.font = `600 38px ${palette.serif}`;
  const verdictLines = wrap(ctx, text.verdict, CONTENT_WIDTH, 2);
  verdictLines.forEach((line, i) => {
    ctx.fillText(line, PAD, Y.verdictFirst + i * Y.verdictLine);
  });

  if (text.detail) {
    ctx.fillStyle = palette.ink2;
    ctx.font = `400 25px ${palette.sans}`;
    ctx.fillText(wrap(ctx, text.detail, CONTENT_WIDTH, 1)[0] ?? "", PAD, Y.detail);
  }

  ctx.fillStyle = palette.muted;
  ctx.font = `400 22px ${palette.mono}`;
  ctx.fillText(text.source, PAD, Y.footerBaseline);
  ctx.textAlign = "right";
  ctx.fillText(text.cta, SHARE_CARD.width - PAD, Y.footerBaseline);
}
