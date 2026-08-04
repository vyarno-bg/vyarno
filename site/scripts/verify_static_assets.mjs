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
import { MOUNT_POINT, PRERENDERED, injectPrerender } from "./prerender.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const site = (...p) => join(HERE, "..", ...p);
const read = (...p) => readFileSync(site(...p), "utf-8");

const ROBOTS = read("public", "robots.txt");
const SECURITY = read("public", ".well-known", "security.txt");

/**
 * A module with its comments blanked, so an assertion lands on what runs.
 *
 * Every bootstrap this file reads explains `replaceChildren()` in its own doc
 * comment, above the line that calls it — which is how a bootstrap that lost
 * the call still satisfies a regex looking for it. A comment describing a rule
 * must never be what satisfies the test for the rule (`verify_wiring.mjs`
 * §`live`).
 */
const code = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");

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
    { loc: "/how/", lastmod: "2026-06-30" },
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

test("the generated sitemap carries every indexable page, /how/ included", () => {
  // The generator's own list, not a sample of it: `/how/` exists to be found
  // by somebody searching for «каква е инфлацията в България», and a page
  // missing from the sitemap is a page a crawler reaches only by following a
  // link from one it already knows. The three-entry array it was added to had
  // gone unchanged since `/support/` landed, which is how the next page would
  // have been left out too.
  const src = read("scripts", "gen-sitemap.mjs");
  const listed = [...src.matchAll(/\{\s*loc:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    listed,
    ["/", "/how/", "/legal/", "/support/"],
    `gen-sitemap.mjs writes ${listed.join(", ")}. Every page that is not ` +
      "noindex belongs in it, and nothing robots.txt disallows does."
  );
});

// ---------------------------------------------------------------------------
// the pages themselves
// ---------------------------------------------------------------------------

/**
 * The pages that are a build entry, in URL order.
 *
 * One list, read by three tests below: the entries exist, `_headers` gives each
 * one a revalidating cache rule, and every one of them carries a `<noscript>`
 * with the upstream attribution. Three hardcoded lists is three chances for a
 * page to be in two of them — and the one it is missing from is the one nobody
 * looks at, because the tests around it stay green.
 */
const ENTRIES = [
  { file: ["index.html"], url: "/index.html" },
  { file: ["how", "index.html"], url: "/how/index.html" },
  { file: ["legal", "index.html"], url: "/legal/index.html" },
  { file: ["support", "index.html"], url: "/support/index.html" },
  { file: ["404.html"], url: "/404.html" },
];

test("every build entry exists where vite.config.js expects it", () => {
  const cfg = read("vite.config.js");
  for (const { file } of ENTRIES) {
    const name = file.join("/");
    assert.ok(existsSync(site(...file)), `${name} is missing — the build input list points at it`);
    assert.ok(
      cfg.includes(`"${name}"`) || cfg.includes(`'${name}'`),
      `vite.config.js no longer builds ${name}; it would silently stop being ` +
        "deployed while the build stays green."
    );
  }
});

// ---------------------------------------------------------------------------
// the prerendered shell
//
// The step itself needs a Vite build and belongs to `verify_render_prerender.mjs`, which
// has one. What is checkable without a build is the contract between the three
// files that have to agree — `index.html` offers a mount point, the build step
// writes the shell into it, `main.js` empties it before mounting — and the
// string surgery in the middle.
// ---------------------------------------------------------------------------

test("every prerendered page has a mount point, and one place that empties it", () => {
  // Both halves, for every page the build writes into. `PRERENDERED` is the
  // list, so a page added there without an entry file to write into — or
  // whose bootstrap forgot the `replaceChildren()` — is a red test rather
  // than a page rendered twice, once frozen at build time and once live.
  const MAINS = {
    app: "main.js",
    how: "how-main.js",
    legal: "legal-main.js",
    support: "support-main.js",
  };
  for (const { name, page } of PRERENDERED) {
    const entry = read(...page);
    assert.ok(
      entry.includes(MOUNT_POINT),
      `${page.join("/")} no longer carries ${MOUNT_POINT} verbatim, so the ` +
        "prerender step has nowhere to write the page. The marker, the " +
        "injection and the mount target move together."
    );
    const bootstrap = MAINS[name];
    assert.ok(bootstrap, `${name} is prerendered and this test does not know its entry point`);
    assert.match(
      code(read("src", bootstrap)),
      /replaceChildren\(\)[\s\S]*mount\(/,
      `${bootstrap} mounts without emptying its target first. \`mount()\` ` +
        "appends, and the built page arrives with the prerendered markup " +
        "already in #app — the reader would get every heading twice."
    );
  }
});

test("injecting the shell refuses a page it cannot place it in", () => {
  const page = `<body>${MOUNT_POINT}<noscript>x</noscript></body>`;
  assert.equal(
    injectPrerender(page, "<h1>Вярно</h1>"),
    '<body><div id="app"><h1>Вярно</h1></div><noscript>x</noscript></body>',
    "the shell has to land inside #app, where main.js empties it again"
  );

  // Prose, run through `String.replace`. `$&` and `$1` are capture references
  // there, so a replacement string would have spliced the mount point back
  // into the middle of the shell.
  assert.ok(injectPrerender(page, "a $& b $1 c").includes("a $& b $1 c"));

  assert.throws(
    () => injectPrerender("<body><div id=app></div></body>", "<h1>x</h1>"),
    /no <div id="app">/,
    "a build whose mount point moved returned the page unchanged instead of " +
      "failing. A prerender that quietly did nothing looks exactly like a " +
      "build that worked."
  );
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
  for (const { url } of ENTRIES) {
    const rule = (blocks[url] ?? []).join(" ");
    assert.match(
      rule,
      /max-age=0/,
      `${url} is not served with max-age=0. A hard-cached entry point keeps ` +
        "loading a bundle whose hashed assets no longer exist — a blank page " +
        "for anyone who visited before the last deploy. Since the prerender " +
        "started writing published figures into `/` and `/how/`, it also keeps " +
        "a cached document from outliving the data in it."
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
  for (const { file: parts } of ENTRIES) {
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
