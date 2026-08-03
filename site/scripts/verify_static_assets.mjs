#!/usr/bin/env node
/**
 * Verification for the static files a commercial site is expected to serve:
 * `robots.txt`, `.well-known/security.txt`, the generated `sitemap.xml`, and
 * the 404 page.
 *
 * These are the files nobody looks at again after the day they are written,
 * which is exactly why they need a test. Two failures in particular are
 * invisible: a `robots.txt` whose `Disallow` stops matching the path it was
 * written for (a directory rename), and a `security.txt` past its mandatory
 * `Expires`, which RFC 9116 §2.5.5 says consumers must treat as stale — the
 * file keeps serving 200 and quietly stops counting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ORIGIN, newestAsOf, sitemapXml } from "./gen-sitemap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const site = (...p) => join(HERE, "..", ...p);
const read = (...p) => readFileSync(site(...p), "utf-8");

const ROBOTS = read("public", "robots.txt");
const SECURITY = read("public", ".well-known", "security.txt");

/** Non-comment, non-blank lines — what a crawler or a parser actually reads. */
const directives = (src) =>
  src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

test("robots.txt keeps crawlers out of the published data and lets them at the pages", () => {
  const lines = directives(ROBOTS);
  const star = lines.indexOf("User-agent: *");
  assert.ok(star >= 0, "robots.txt has no `User-agent: *` group at all");

  // The group runs until the next User-agent line.
  const next = lines.findIndex((l, i) => i > star && l.startsWith("User-agent:"));
  const group = lines.slice(star, next === -1 ? undefined : next);

  assert.ok(
    group.includes("Disallow: /data/published/"),
    "robots.txt no longer disallows /data/published/. Those eight files are the " +
      "product; indexing raw JSON helps no reader and invites bulk copying. " +
      "If the data path is renamed, this line moves with it in the same commit."
  );
  assert.ok(
    group.includes("Allow: /"),
    "robots.txt no longer allows the pages. A BG-language product that search " +
      "engines cannot read is invisible to the people it is for."
  );
  assert.ok(
    !group.includes("Disallow: /"),
    "the catch-all group now disallows the whole site — that de-indexes the " +
      "product, including the legal page ЗЕТ чл. 4 requires to be findable."
  );
});

test("robots.txt declines the training crawlers, by the names they use", () => {
  // A typo in a user-agent token is a silent no-op: the crawler reads the file,
  // finds no group addressed to it, and falls through to `User-agent: *`.
  for (const bot of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended"]) {
    const at = directives(ROBOTS).indexOf(`User-agent: ${bot}`);
    assert.ok(at >= 0, `robots.txt no longer names ${bot}`);
    assert.equal(
      directives(ROBOTS)[at + 1],
      "Disallow: /",
      `the ${bot} group does not disallow the site — an empty group is the ` +
        "same as no group at all."
    );
  }
});

test("the AI crawlers that cite are allowed, and still kept out of the payloads", () => {
  // Two failures, and the second is the one nobody would notice.
  //
  // A citing agent silently rejoining the declined list reverses a decision
  // taken on the operators' own documentation, and the only symptom is that
  // ChatGPT and Perplexity stop citing a site nobody is watching the citation
  // rate of.
  //
  // The second: RFC 9309 2.2.1 has a crawler obey the most specific group
  // matching its token WITHOUT merging the catch-all into it. So a group
  // written as `User-agent: X` + `Allow: /` — which is what anybody
  // simplifying this file would write — hands that agent the raw payloads,
  // and the /data/published/ rule three lines above goes on looking like it
  // covers everyone.
  const lines = directives(ROBOTS);
  for (const bot of [
    "OAI-SearchBot",
    "ChatGPT-User",
    "PerplexityBot",
    "Perplexity-User",
    "Claude-SearchBot",
    "Claude-User",
  ]) {
    const at = lines.indexOf(`User-agent: ${bot}`);
    assert.ok(at >= 0, `robots.txt no longer names ${bot}`);

    // A group may open with several User-agent lines; the rules start after
    // the last of them and run to the next one.
    let i = at;
    while (lines[i + 1]?.startsWith("User-agent:")) i += 1;
    const next = lines.findIndex((l, j) => j > i && l.startsWith("User-agent:"));
    const group = lines.slice(i + 1, next === -1 ? undefined : next);

    assert.ok(
      !group.includes("Disallow: /"),
      `${bot} is declined the whole site. It is documented by its operator as ` +
        "surfacing a link to the source rather than training on it, which is " +
        "the side of note 3's test the file puts it on."
    );
    assert.ok(
      group.includes("Disallow: /data/published/"),
      `the ${bot} group does not repeat Disallow: /data/published/. A named ` +
        "group replaces the catch-all rather than adding to it (RFC 9309 " +
        "2.2.1), so without this line that agent is invited into the raw " +
        "payloads while the group above still reads as though it covers them."
    );
  }
});

test("robots.txt points at the sitemap we actually generate", () => {
  assert.ok(
    directives(ROBOTS).includes(`Sitemap: ${ORIGIN}/sitemap.xml`),
    `robots.txt's Sitemap line does not match ${ORIGIN}/sitemap.xml, which is ` +
      "where gen-sitemap.mjs writes it."
  );
});

// ---------------------------------------------------------------------------
// security.txt — RFC 9116
// ---------------------------------------------------------------------------

test("security.txt has the two fields RFC 9116 makes mandatory", () => {
  assert.match(
    SECURITY,
    /^Contact: mailto:contact@vyarno\.bg$/m,
    "security.txt has no Contact field, or it points somewhere that is not ours"
  );
  assert.match(
    SECURITY,
    /^Expires: \d{4}-\d{2}-\d{2}T/m,
    "security.txt has no Expires field — RFC 9116 §2.5.5 requires it"
  );
  assert.match(
    SECURITY,
    /^Policy: https:\/\/vyarno\.bg\/legal\/#security$/m,
    "security.txt's Policy no longer points at the disclosure policy on /legal/"
  );
  assert.match(
    SECURITY,
    /^Canonical: https:\/\/vyarno\.bg\/\.well-known\/security\.txt$/m,
    "security.txt has no Canonical field"
  );
});

test("security.txt is not expiring, and goes red before it expires", () => {
  // 30 days of warning, so this is renewed by a test going red rather than by
  // someone remembering.
  const expires = Date.parse(/^Expires: (.+)$/m.exec(SECURITY)[1]);
  const daysLeft = Math.floor((expires - Date.now()) / 86400000);
  assert.ok(
    daysLeft > 30,
    `security.txt expires in ${daysLeft} days. Past its Expires a consumer ` +
      "must treat the file as stale (RFC 9116 §2.5.5), so it stops working " +
      "while still serving 200. Push the date out a year and re-check the " +
      "address still reaches someone."
  );
});

// ---------------------------------------------------------------------------
// sitemap
// ---------------------------------------------------------------------------

test("the sitemap's lastmod is the newest published as_of, not today", () => {
  assert.equal(newestAsOf([{ as_of: "2026-01-31" }, { as_of: "2026-06-30" }]), "2026-06-30");
  // A datetime `as_of` is truncated, not rejected — <lastmod> takes a date.
  assert.equal(newestAsOf([{ as_of: "2026-06-30T12:00:00Z" }]), "2026-06-30");
  // Junk is ignored rather than sorted as a string, which would win over a
  // real date and put a nonsense lastmod in front of every crawler.
  assert.equal(newestAsOf([{ as_of: "soon" }, { as_of: "2026-02-01" }]), "2026-02-01");
  assert.equal(newestAsOf([{}, { as_of: null }]), null);
  assert.equal(newestAsOf([]), null);
});

test("the sitemap omits lastmod rather than inventing one", () => {
  const xml = sitemapXml([{ loc: "/", lastmod: null }]);
  assert.ok(
    !xml.includes("<lastmod>"),
    "with no readable as_of the sitemap still emits a <lastmod> — a date we " +
      "made up, told to every crawler as fact."
  );
  assert.ok(xml.includes(`<loc>${ORIGIN}/</loc>`));
});

test("the sitemap lists the pages that exist and nothing that is disallowed", () => {
  const xml = sitemapXml([
    { loc: "/", lastmod: "2026-06-30" },
    { loc: "/legal/", lastmod: "2026-07-26" },
    { loc: "/support/" },
  ]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.ok(xml.includes(`<loc>${ORIGIN}/legal/</loc>`));
  assert.ok(
    xml.includes(`<loc>${ORIGIN}/support/</loc>`),
    "the sitemap omits /support/. It is a real page and the one whose whole " +
      "purpose is to be findable by someone looking for it."
  );
  assert.ok(
    !xml.includes("/data/published/") && !xml.includes("404"),
    "the sitemap lists a path robots.txt disallows or a noindex error page — " +
      "crawlers report that back as an error against the site."
  );
});

// ---------------------------------------------------------------------------
// the pages themselves
// ---------------------------------------------------------------------------

test("the four build entries exist where vite.config.js expects them", () => {
  for (const p of [
    ["index.html"],
    ["legal", "index.html"],
    ["support", "index.html"],
    ["404.html"],
  ]) {
    assert.ok(
      existsSync(site(...p)),
      `${p.join("/")} is missing — the build input list points at it`
    );
  }
  const cfg = read("vite.config.js");
  for (const entry of ["index.html", "legal/index.html", "support/index.html", "404.html"]) {
    assert.ok(
      cfg.includes(`"${entry}"`) || cfg.includes(`'${entry}'`),
      `vite.config.js no longer builds ${entry}; it would silently stop being ` +
        "deployed while the build stays green."
    );
  }
});

test("the 404 page is noindex and routes back to the calculator", () => {
  const html = read("404.html");
  assert.match(
    html,
    /<meta name="robots" content="noindex"\s*\/?>/,
    "the 404 page is indexable — search engines will list it as a result"
  );
  const svelte = read("src", "NotFound.svelte");
  assert.match(
    svelte,
    /href="\/"/,
    "the 404 page has no link back to the calculator, which is the only thing " +
      "a person who landed there wants"
  );
  assert.match(
    svelte,
    /SiteFooter/,
    "the 404 page drops the footer, so it loses the upstream attribution and " +
      "the legal links every page carries"
  );
});

test("the legal page is canonical, describable and not noindex", () => {
  const html = read("legal", "index.html");
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/vyarno\.bg\/legal\/"\s*\/?>/,
    "the legal page has no canonical URL"
  );
  assert.ok(
    !/name="robots"[^>]*noindex/.test(html),
    "the legal page is noindex. ЗЕТ чл. 4 wants the provider's identity " +
      "permanently and directly accessible, and a page nobody can find is not " +
      "accessible."
  );
  assert.match(html, /<meta\s+name="description"/, "the legal page has no description");
});

// ---------------------------------------------------------------------------
// The deploy: `_headers` and the host that reads it
// ---------------------------------------------------------------------------
//
// Nothing guarded these until now, and they are the mechanism behind two
// user-facing claims rather than a hosting detail: `connect-src 'self'` is
// what makes "no third-party script can run here" true rather than intended
// (the privacy notice says so in as many words), and the two cache lifetimes
// are what make a refresh reach people the same day.

const HEADERS = read("public", "_headers");

/** The directives inside a `_headers` rule block, keyed by path pattern. */
function headerBlocks(src) {
  const blocks = {};
  let current = null;
  for (const raw of src.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = raw.trim();
      blocks[current] = [];
    } else if (current) {
      blocks[current].push(raw.trim());
    }
  }
  return blocks;
}

test("the CSP still forbids everything the privacy notice says it forbids", () => {
  const csp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(HEADERS)?.[1] ?? "";
  assert.ok(csp, "there is no Content-Security-Policy in _headers at all");

  // Parsed into name → value and compared EXACTLY. A substring check passes
  // for `connect-src 'self' https://api.example.com`, which is the precise
  // widening this test exists to refuse: `'self'` alone is the claim, and one
  // extra origin quietly ends it.
  const directives = Object.fromEntries(
    csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...value] = d.split(/\s+/);
        return [name, value.join(" ")];
      })
  );

  const required = {
    "connect-src": [
      "'self'",
      "the browser could call a third party. The privacy notice states in " +
        "both languages that it cannot, and this directive is the only thing " +
        "making that true. Anything served at request time would live on this " +
        "same origin precisely so this line never has to be widened.",
    ],
    "script-src": [
      "'self'",
      "a third-party script could load — analytics, a pixel, a tag manager. " +
        "The privacy notice says none runs here; this directive is what makes " +
        "that true. Widening it is a decision, not a typo, and the notice " +
        "sentence it would falsify has to change in the same release.",
    ],
    "frame-ancestors": [
      "'none'",
      "the calculator becomes embeddable by anyone. When the embed cards land " +
        "they get their OWN /embed/* block; this one stays restrictive.",
    ],
    "form-action": ["'none'", "there is no form and no endpoint to post to."],
    "object-src": ["'none'", "plugin content becomes loadable."],
    "default-src": ["'self'", "anything not covered above falls back to open."],
    "font-src": [
      "'self'",
      "the fonts could come from a third-party network. They are self-hosted " +
        "on purpose (docs/principles.md §Identity: no Google Fonts, no " +
        "third-party CSS) and the privacy notice says so — a font request " +
        "is a request.",
    ],
    "base-uri": ["'self'", "an injected <base> could re-point every relative URL."],
    "img-src": [
      "'self' data:",
      "images could be loaded from anywhere, which is a tracking pixel with " +
        "extra steps. `data:` is needed for the inline SVG.",
    ],
  };
  for (const [name, [value, why]] of Object.entries(required)) {
    assert.equal(
      directives[name],
      value,
      `the CSP's ${name} is now ${JSON.stringify(directives[name])} instead of ` +
        `${JSON.stringify(value)} — ${why}`
    );
  }
  assert.ok(
    !/script-src[^;]*'unsafe-inline'/.test(csp),
    "the CSP now allows inline SCRIPT. `style-src` needs 'unsafe-inline' " +
      "because Svelte writes style attributes; script never does, and this is " +
      "the single most valuable line in the file."
  );
  assert.ok(!/script-src[^;]*'unsafe-eval'/.test(csp), "the CSP now allows eval in script-src.");
});

test("the two cache lifetimes that ship stale numbers if reversed", () => {
  const blocks = headerBlocks(HEADERS);
  const data = (blocks["/data/published/*"] ?? []).join(" ");
  assert.ok(
    /max-age=300\b/.test(data) && /must-revalidate/.test(data),
    "/data/published/* is no longer short-cached and revalidated. It is the " +
      "whole product and a refresh has to reach people the same day it lands; " +
      "an immutable cache here ships last month's inflation to everyone."
  );
  assert.ok(
    !/immutable/.test(data),
    "/data/published/* is marked immutable — the numbers change, that is the point."
  );
  for (const entry of ["/index.html", "/legal/index.html", "/support/index.html", "/404.html"]) {
    const rule = (blocks[entry] ?? []).join(" ");
    assert.match(
      rule,
      /max-age=0/,
      `${entry} is not served with max-age=0. A hard-cached entry point keeps ` +
        "loading a bundle whose hashed assets no longer exist — a blank page " +
        "for anyone who visited before the last deploy."
    );
  }
  assert.match(
    (blocks["/assets/*"] ?? []).join(" "),
    /immutable/,
    "/assets/* is no longer immutable, so the hashed bundle is re-fetched on " +
      "every visit for no reason."
  );
});

test("the build writes the directory that gets published", () => {
  // `dist/` is the whole deliverable: whatever serves this site copies that
  // directory and nothing else. The failure this prevents is vite's output
  // directory drifting from the name every other script and every hosting
  // config uses, until a release publishes an empty directory with everything
  // green.
  assert.match(
    read("vite.config.js"),
    /outDir:\s*["']dist["']/,
    "vite no longer builds to dist/, which is the directory that gets published."
  );
});

test("every HTML entry carries a <noscript> with the upstream attribution", () => {
  // The calculator renders client-side, so with JavaScript off the body is
  // empty. Two things then go missing that must not: any explanation of what
  // the reader is looking at, and the footer attribution «Данни от Евростат /
  // ЕЦБ / НСИ / БНБ / имот.bg» — a licence condition of several upstreams that
  // has to appear on every page and otherwise renders only from the JS bundle.
  // The <noscript> is where both live for a reader (or crawler) without scripts.
  const ATTRIBUTION = "Данни от Евростат / ЕЦБ / НСИ / БНБ / имот.bg";
  for (const shell of ["index.html", "404.html", ["legal", "index.html"]]) {
    const parts = Array.isArray(shell) ? shell : [shell];
    const html = read(...parts);
    const name = parts.join("/");
    assert.match(
      html,
      /<noscript>/,
      `${name} has no <noscript> — a reader with JavaScript off gets a blank page.`
    );
    assert.ok(
      html.includes(ATTRIBUTION),
      `${name}'s <noscript> does not carry the upstream attribution, which is a ` +
        "licence condition on every page and renders only from the bundle otherwise."
    );
  }
});
