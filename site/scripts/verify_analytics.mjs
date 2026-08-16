#!/usr/bin/env node
/**
 * Verification for `src/lib/analytics.js` — the one third-party request.
 *
 * Three things are worth holding here and none of them is the counting itself,
 * which is the processor's job and visible in its dashboard the same day.
 *
 * **The host gate.** Nothing loads off vyarno.bg. A preview deploy and the
 * static server `test:render` opens are somebody working on the site, so
 * counting them is counting ourselves — and the render suite treats a failed
 * request as an error, which stops meaning anything the moment a third party
 * has to be reachable for the suite to pass.
 *
 * **The CSP covers what the module loads.** `verify_static_assets.mjs` pins the
 * two origin lists as literals so a third origin is a red test; that is the
 * direction that matters and it is deliberately blind to this file. This is the
 * other direction — the counter repointed at an origin the header does not
 * name, which fails in a browser console on the live site and nowhere else.
 *
 * **It sends no consumer figure.** P1 does not survive a custom event, and this
 * module is the only place in the tree one could be written.
 *
 * Each test below was checked by breaking the thing it protects and watching it
 * go red (docs/testing-strategy.md §"The standard a test has to meet").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MEASURED_HOST,
  PLAUSIBLE_ORIGIN,
  PLAUSIBLE_SCRIPT,
  startAnalytics,
} from "../src/lib/analytics.js";
import { DOCS } from "../src/lib/legal.js";
import { blankComments } from "./live-copy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(HERE, "..", ...p), "utf-8");

const HEADERS = read("public", "_headers");

// Comments blanked, and the trap is this file's own subject: the docstring
// explaining that nothing calls `window.plausible(...)` is itself a call as far
// as a regex is concerned.
const SOURCE = blankComments(read("src", "lib", "analytics.js"));

/**
 * A document stand-in that records what was appended to `<head>`.
 *
 * Enough of a DOM for `startAnalytics` and no more: the alternative is standing
 * up a browser to observe one `<script>` tag, which is what `test:render` is
 * for and what the host gate keeps it out of.
 */
function fakeDocument() {
  const appended = [];
  const win = {};
  return {
    appended,
    win,
    defaultView: win,
    createElement: () => ({}),
    head: { append: (node) => appended.push(node) },
  };
}

test("the counter loads on the live site and on nothing else", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "192.168.1.20",
    "vyarno.pages.dev",
    "vyarno.bg.example.com",
    "www.vyarno.bg",
  ]) {
    const doc = fakeDocument();
    assert.equal(
      startAnalytics(doc, host),
      false,
      `${host} would be counted. Every host but the canonical one is either ` +
        "somebody working on the site or an address we do not serve, and the " +
        "render suite's `requestfailed` assertion stops meaning anything as " +
        "soon as a third party has to answer for it to pass."
    );
    assert.deepEqual(doc.appended, [], `${host} got a script tag anyway`);
    assert.deepEqual(doc.win, {}, `${host} had the queue stub installed anyway`);
  }
});

test("the live host gets one script, from the origin the header allows", () => {
  const doc = fakeDocument();
  assert.equal(startAnalytics(doc, MEASURED_HOST), true);
  assert.equal(doc.appended.length, 1, "the counter was loaded more or less than once");
  assert.equal(doc.appended[0].src, PLAUSIBLE_SCRIPT);
  assert.equal(doc.appended[0].async, true, "a synchronous script blocks the parser");
  assert.ok(
    PLAUSIBLE_SCRIPT.startsWith(`${PLAUSIBLE_ORIGIN}/`),
    "the script is served from somewhere other than the declared origin, so " +
      "the origin the CSP names is not the origin the page fetches"
  );
});

test("the loaded script finds the state it refuses to initialise without", () => {
  // Not defensive plumbing: the counter initialises only where it finds
  // `plausible.o` already set, so a page that skips the stub sends nothing at
  // all — and does it silently, on the live site, which is the one place this
  // cannot be observed from a test.
  const doc = fakeDocument();
  startAnalytics(doc, MEASURED_HOST);
  assert.equal(typeof doc.win.plausible, "function");
  assert.deepEqual(doc.win.plausible.o, {}, "init() left no options object for the script to find");
});

test("the CSP names the origin the counter fetches and posts to", () => {
  const csp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(HEADERS)?.[1] ?? "";
  for (const directive of ["script-src", "connect-src"]) {
    const value = new RegExp(`${directive}([^;]*)`).exec(csp)?.[1] ?? "";
    assert.ok(
      value.split(/\s+/).includes(PLAUSIBLE_ORIGIN),
      `the CSP's ${directive} does not name ${PLAUSIBLE_ORIGIN}, so the ` +
        "counter is fetched or posts to an origin the browser will block. " +
        "The failure is a console error on the live site and a silent zero in " +
        "the dashboard — nothing else in the run can see it."
    );
  }
});

test("the module sends nothing but the pageview the script sends itself", () => {
  // The queue stub is a function called `plausible`, so a custom event is one
  // call away and would be the only route out of this tab for a figure the
  // reader typed. `mirror.js` computes them and posts nothing; that holds only
  // while nothing here posts either.
  const calls = [...SOURCE.matchAll(/plausible\s*\(/g)].map((m) => m[0]);
  assert.deepEqual(
    calls,
    [],
    "something in analytics.js calls the counter directly. A custom event is " +
      "the one edit that can carry a salary, a rent or a basket off the " +
      "device, and docs/principles.md closes it by name — including the share " +
      "count, which is a measurement taken at the moment a basket is shared."
  );
});

test("the privacy notice describes the counter, in both languages", () => {
  // Read off the module rather than hand-kept: the notice is what the CSP
  // widening was paid for, and a counter shipped without its section is the
  // failure the version-bump rule at the top of legal.js exists to prevent.
  const privacy = DOCS.find((d) => d.id === "privacy");
  const host = new URL(PLAUSIBLE_ORIGIN).hostname;

  for (const lang of ["bg", "en"]) {
    const text = privacy.sections
      .flatMap((s) => [s.h[lang], ...s.p.map((p) => p[lang])])
      .join("\n");
    for (const claim of [host, "Plausible Insights OÜ", "plausible_ignore"]) {
      assert.ok(
        text.includes(claim),
        `the ${lang} privacy notice does not name ${claim}. The origin is what ` +
          "a reader checks the CSP against, the processor is a GDPR art. 13 " +
          "recipient, and the key is the only lever they have to switch the " +
          "counting off."
      );
    }
  }
});

test("the notice discloses the events a reader cannot find in the source", () => {
  // v1.6 described pageviews and nothing else while outbound-link clicks, file
  // downloads and scroll-and-dwell were being sent — switched on in the
  // counter's dashboard, so no file here contradicted it and no test could
  // read it. Prose is the only evidence available, which is why the check is
  // that the prose EXISTS rather than that it matches a config.
  //
  // A weak guard by this suite's standards, and deliberately kept: what it
  // catches is the summary somebody shortens back to "we count visits", which
  // is exactly how the first version was written.
  const privacy = DOCS.find((d) => d.id === "privacy");
  const disclosed = {
    // `\w` is ASCII-only in JS, so a Cyrillic stem cannot be matched with one —
    // the same trap `legal.js#commercialSignals` records about `\b`. These are
    // literal enough not to need it.
    bg: [/извън vyarno\.bg/, /свалянето на файл/, /докъде си стигнал/, /колко време/],
    en: [/off vyarno\.bg/, /[Dd]ownloading a file/, /how far down/, /how long/],
  };
  for (const [lang, patterns] of Object.entries(disclosed)) {
    const text = privacy.sections
      .flatMap((s) => [s.h[lang], ...s.p.map((p) => p[lang])])
      .join("\n");
    for (const re of patterns) {
      assert.match(
        text,
        re,
        `the ${lang} privacy notice no longer discloses ${re}. The counter ` +
          "records a followed link with its destination, a download, the " +
          "scroll depth and the dwell time; a notice that lists only the " +
          "pageview understates it, on the page whose own standard is that " +
          "«не събираме нищо» slips easily into being untrue."
      );
    }
  }
});
