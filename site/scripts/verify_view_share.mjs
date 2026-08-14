#!/usr/bin/env node
/**
 * What leaves the page when a reader shares it — docs/principles.md P2.
 *
 * A share surface is the one place a personal figure could travel, so the
 * guarantee is built into the signature rather than asserted downstream of it:
 * `sharePayload` never receives a salary, and a function that never receives
 * one cannot leak one however it is called. What is left to check is that the
 * closed list of fields stays closed, that no sentence carries a currency in
 * either language, that the verdict is the results card's own rather than a
 * second opinion formed here, and that the link sends a stranger to the
 * address the sitemap publishes.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  sharePayload,
  shareSentence,
  barCeiling,
  SHARE_FIELDS,
  SHARE_COPY_KEYS,
  SHARE_ORIGIN,
  SHARE_DOMAIN,
} from "../src/lib/view/share.js";
import { COPY } from "../src/lib/content.js";
import { ORIGIN as SITEMAP_ORIGIN } from "./gen-sitemap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// SHARE — docs/principles.md P2
// ---------------------------------------------------------------------------

/** A basket whose leading division is transport, at a plausible pair of rates. */
const SHARE_RANKED = [
  { division: { bg_name: "Транспорт", en_name: "Transport" }, contributionPp: 1.62 },
  { division: { bg_name: "Храна", en_name: "Food" }, contributionPp: 1.1 },
];

const shareArgs = (over = {}) => ({
  pi: 7.24,
  official: 5.2,
  near: false,
  anchor: "y1",
  ranked: SHARE_RANKED,
  refPeriod: "2026-06",
  ...over,
});

test("sharePayload carries only the closed set of fields", () => {
  const share = sharePayload(shareArgs());

  // The list is the review surface: a field added to the payload without being
  // added to SHARE_FIELDS lands here, which is where P2 gets argued rather
  // than after a picture is in somebody's chat.
  assert.deepEqual(
    Object.keys(share).sort(),
    [...SHARE_FIELDS].sort(),
    "a share surface grew a field nobody signed off"
  );

  // Every value is a primitive. An object would carry whatever else is hanging
  // off it — `ranked[0]` alone brings `eurPerMonth` and `spendEur`, and
  // rendering one of those is a one-word mistake in a template.
  for (const [key, value] of Object.entries(share)) {
    assert.ok(
      value === null || typeof value !== "object",
      `share.${key} is an object, so it carries fields nothing here has checked`
    );
  }
});

test("sharePayload cannot be handed a salary", () => {
  // The guarantee is the signature, not an assertion downstream of it:
  // `mirror.js#extraPerMonth` is salary × r/(100+r) and inverts exactly, so a
  // function that never receives the salary cannot leak one however it is
  // called. Break it by adding a `salary` parameter and this goes red.
  //
  // The file read has to be the one that DECLARES it. A path pointing at a
  // module the function has moved out of finds no signature at all, and the
  // `assert.ok` below is what turns that into a failure rather than a green
  // run over an empty match.
  const source = readFileSync(join(HERE, "..", "src", "lib", "view", "share.js"), "utf8");
  const signature = /export function sharePayload\(\{([^}]*)\}/.exec(source);
  assert.ok(signature, "sharePayload no longer takes a destructured object");
  const params = signature[1]
    .split(",")
    .map((p) => p.split("=")[0].trim())
    .filter(Boolean);
  // `activePreset` is a basket's NAME — "official", one of the four chips, or
  // null once hand-edited — and carries no figure of any kind. It is in the
  // list because the list is exhaustive: a parameter added here is one somebody
  // has to justify, which is the whole mechanism.
  assert.deepEqual(params, [
    "pi",
    "official",
    "near",
    "activePreset",
    "anchor",
    "ranked",
    "refPeriod",
  ]);

  // And the money words are absent from what it returns, whatever it was fed.
  const share = sharePayload(shareArgs());
  assert.ok(!/salary|net|eur|€/i.test(JSON.stringify(share)), JSON.stringify(share));
});

test("the share verdict is the results card's verdict, not a second opinion", () => {
  // `near` is the caller's, so the picture and the sentence above it cannot
  // reach opposite conclusions about one basket. Recompute it here and the two
  // drift the first time the band moves.
  assert.equal(sharePayload(shareArgs({ near: true })).verdict, "close");
  assert.equal(sharePayload(shareArgs({ near: false })).verdict, "dearer");
  assert.equal(sharePayload(shareArgs({ pi: 3.1, near: false })).verdict, "cheaper");
  // A basket weighted onto the groups that are falling is negative, and still
  // ranks against the average rather than against zero.
  assert.equal(sharePayload(shareArgs({ pi: -1.2, near: false })).verdict, "cheaper");
});

test("sharePayload withholds itself when nothing has been measured", () => {
  assert.equal(sharePayload(shareArgs({ pi: NaN })), null);
  assert.equal(sharePayload(shareArgs({ official: NaN })), null);
  // An empty basket has no leading division, and the card drops the line
  // rather than drawing «Най-тежко удря:» with nothing after it.
  const empty = sharePayload(shareArgs({ ranked: [] }));
  assert.equal(empty.topBgName, "");
  assert.ok(Number.isNaN(empty.topPp));
});

test("no share sentence carries a currency, in either language", () => {
  // The closed list names this case outright: «any € absolute on a shareable
  // image beside the percentage it inverts». Checked at every anchor and every
  // verdict, because one variant is all it takes.
  const anchors = ["y1", 2020, 2023];
  const verdicts = [
    { near: true },
    { near: false },
    { pi: 3.1, near: false },
    { pi: -1.2, near: false },
    // The state every visitor arrives in: the official weights, so `pi` and
    // `official` are one number and the sentence is a different one. It is in
    // this sweep rather than only in its own test because the sweep is what
    // checks EVERY sentence at every anchor for a currency and an unfilled
    // slot, and a branch outside it is a branch outside that guarantee.
    { activePreset: "official", pi: 5.2, near: true },
  ];
  for (const anchor of anchors) {
    for (const over of verdicts) {
      for (const lang of ["bg", "en"]) {
        const share = sharePayload(shareArgs({ anchor, ...over }));
        const sentence = shareSentence({ share, copy: COPY, lang });
        // Lookarounds, not `\b`: JavaScript's word boundary is defined over
        // ASCII, so it does nothing either side of Cyrillic, and a plain
        // substring test flags «Евростат» for containing «евро». The source
        // name has to stay sayable — P9 puts it on the surfaces that cannot
        // carry a link.
        assert.doesNotMatch(
          sentence,
          /€|(?<!\p{L})(EUR|евро|лв)(?!\p{L})/iu,
          `${lang} @ ${anchor}: ${sentence}`
        );
        assert.doesNotMatch(sentence, /[{}]/, `unsubstituted placeholder: ${sentence}`);
        assert.ok(sentence.includes(SHARE_ORIGIN), `no way back to the site: ${sentence}`);
      }
    }
  }
});

test("the share sentence speaks the reader's own numbers in their own locale", () => {
  const share = sharePayload(shareArgs());
  // A decimal comma in BG and a point in EN — the reader is sending this on,
  // so it has to read as their language writes numbers.
  assert.match(shareSentence({ share, copy: COPY, lang: "bg" }), /7,2%/);
  assert.match(shareSentence({ share, copy: COPY, lang: "en" }), /7\.2%/);
  // The national figure travels with it. A lone personal rate is the number
  // nobody can place, and placing it is the whole point of sending it.
  assert.match(shareSentence({ share, copy: COPY, lang: "bg" }), /5,2%/);
  assert.equal(shareSentence({ share: null, copy: COPY, lang: "bg" }), "");
});

test("a basket the reader has not described is not sent as theirs", () => {
  // Arriving is not a claim. On the official weights `pi` and `official` are
  // the same number, so all three verdict lines print one rate twice and close
  // by pronouncing on the difference — «Моята кошница: 5,4%. Средната кошница
  // за България: 5,4%. Горе-долу колкото средното.» Nothing in that is false
  // and none of it is about the sender.
  const official = sharePayload(shareArgs({ activePreset: "official", pi: 5.2, near: true }));
  assert.equal(official.ownBasket, false);

  for (const lang of ["bg", "en"]) {
    const sentence = shareSentence({ share: official, copy: COPY, lang });
    assert.ok(
      sentence.includes(lang === "bg" ? "5,2%" : "5.2%"),
      `the national figure is gone: ${sentence}`
    );
    // Once, not twice. The count is the assertion — a line that names the same
    // rate at both ends is the one this exists to keep off the surface.
    assert.equal(
      sentence.split(lang === "bg" ? "5,2%" : "5.2%").length - 1,
      1,
      `the same rate is printed twice: ${sentence}`
    );
    assert.ok(sentence.includes(SHARE_ORIGIN), `no way back to the site: ${sentence}`);
  }

  // Every other basket is the reader's, including the four ready-made chips: a
  // reader who picked «с кола всеки ден» has said something about their life,
  // and `presetActive` is what tells them on screen that the weights behind it
  // are ours. `null` is a hand-edited basket.
  for (const preset of [null, "driver", "family", "noCar", "pensioner"]) {
    assert.equal(
      sharePayload(shareArgs({ activePreset: preset })).ownBasket,
      true,
      `activePreset=${preset} is not being treated as the reader's own basket`
    );
    assert.match(
      shareSentence({
        share: sharePayload(shareArgs({ activePreset: preset })),
        copy: COPY,
        lang: "bg",
      }),
      /7,2%/,
      `activePreset=${preset} lost the reader's own rate`
    );
  }
});

test("every COPY key the share text needs exists", () => {
  const missing = SHARE_COPY_KEYS.filter((key) => !COPY[key]?.bg || !COPY[key]?.en);
  assert.deepEqual(missing, [], `share copy keys missing a language: ${missing.join(", ")}`);
});

test("the share link is the address the sitemap publishes", () => {
  // Two constants naming the same site is one constant and one guess. The
  // sitemap's is the canonical one; this is what a stranger reads off a
  // picture, and they have to be the same place.
  assert.equal(SHARE_ORIGIN, SITEMAP_ORIGIN);
  assert.equal(SHARE_ORIGIN, `https://${SHARE_DOMAIN}`);
});

test("the comparison bars are scaled against one ceiling, with a floor", () => {
  // Without the floor, a basket that rose 0.4% against an official 0.3% fills
  // the track edge to edge and reads as a catastrophe.
  assert.equal(barCeiling({ piPct: 0.4, officialPct: 0.3, anchor: "y1" }), 8);
  // Above the floor the taller of the pair sets the scale, so the two bars are
  // a comparison rather than two independent drawings.
  assert.equal(barCeiling({ piPct: 12, officialPct: 5.2, anchor: "y1" }), 12);
  // At a year anchor the cumulative figures are large enough that a fixed
  // floor of 8 would flatten them, so the floor is relative to the official
  // rise instead.
  assert.equal(barCeiling({ piPct: 30, officialPct: 41, anchor: 2020 }), 41 * 1.35);
  // Never zero: a ceiling of zero divides every bar width into infinity.
  assert.equal(barCeiling({ piPct: NaN, officialPct: NaN, anchor: "y1" }), 8);
  assert.equal(barCeiling({ piPct: 0, officialPct: 0, anchor: 2020 }), 1);
});
