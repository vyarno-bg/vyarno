#!/usr/bin/env node
/**
 * Verification for the static files a commercial site is expected to serve:
 * `robots.txt`, `llms.txt`, `.well-known/security.txt`, the generated
 * `sitemap.xml`, and the 404 page.
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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ORIGIN, newestAsOf, sitemapXml } from "./gen-sitemap.mjs";
import { fillDate } from "./gen-jsonld.mjs";
import { PAYLOADS } from "../src/lib/payloads.js";
import {
  LANGS,
  MOUNT_POINT,
  PRERENDERED,
  dropOtherLanguages,
  entryLang,
  injectPrerender,
} from "./prerender.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const site = (...p) => join(HERE, "..", ...p);
const read = (...p) => readFileSync(site(...p), "utf-8");

const ROBOTS = read("public", "robots.txt");
const SECURITY = read("public", ".well-known", "security.txt");
const LLMS = read("public", "llms.txt");

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
    "robots.txt no longer disallows /data/published/. Those nine files are the " +
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
// llms.txt
// ---------------------------------------------------------------------------

test("llms.txt names every page the sitemap does, and the route to the data", () => {
  // Read out of the generator rather than retyped, the way the sitemap test
  // above does: a page added to the site and left out of this file is the one
  // an agent never learns exists, and nothing else would report it.
  const listed = [...read("scripts", "gen-sitemap.mjs").matchAll(/\{\s*loc:\s*"([^"]+)"/g)].map(
    (m) => m[1]
  );
  assert.ok(listed.length >= 4, "gen-sitemap.mjs lists no pages to check llms.txt against");
  for (const loc of listed) {
    assert.ok(
      LLMS.includes(`${ORIGIN}${loc}`),
      `llms.txt does not name ${ORIGIN}${loc}. The file is a map of the site ` +
        "for a consumer that will not crawl it, so a page missing from it is a " +
        "page that consumer has no route to."
    );
  }
  assert.ok(
    LLMS.includes("github.com/vyarno-bg/vyarno"),
    "llms.txt does not point a machine at the repository. robots.txt " +
      "disallows /data/published/ for every group and the terms of use name " +
      "the repository as the route, so without it the answer to 'where is the " +
      "data' is nowhere."
  );
  assert.ok(
    !LLMS.includes("/data/published/"),
    "llms.txt points at /data/published/, which every crawler group is " +
      "disallowed from. A map that sends an agent somewhere robots.txt refuses " +
      "it is a contradiction it reports back."
  );
});

test("llms.txt lists every published payload, and counts them right", () => {
  // The page list above is read out of `gen-sitemap.mjs` for the reason this
  // one is read out of `PAYLOADS`: a hand-kept list goes stale by omission, and
  // this one did. `sector_salary` shipped and the file kept saying "Eight JSON
  // payloads" over eight stems, so the consumer this file is written for — one
  // that reads a map instead of crawling — was told the ninth does not exist.
  //
  // Nothing else could have caught it. `verify_docs_map.mjs` scans the counts
  // written into `.md` files and `public/` is not markdown; the render suites
  // load pages and this file is not one. The check has to be here or nowhere.
  for (const { file } of PAYLOADS) {
    assert.ok(
      new RegExp(`^\\s*[-*]\\s+${file}\\b`, "m").test(LLMS),
      `llms.txt does not list ${file}. Every payload the page depends on is ` +
        "named here, because robots.txt disallows /data/published/ and this " +
        "file is the only place an agent learns what the data covers."
    );
  }

  // The total is spelled out a paragraph above the list, so the two can
  // disagree — and a number nobody reads back only ever goes stale.
  const said = /\b(five|six|seven|eight|nine|ten|\d+)\s+JSON payloads\b/i.exec(LLMS);
  assert.ok(said, "llms.txt no longer states how many payloads there are, above the list");
  const WORDS = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const n = WORDS[said[1].toLowerCase()] ?? Number(said[1]);
  assert.equal(
    n,
    PAYLOADS.length,
    `llms.txt says ${said[1]} JSON payloads and the manifest holds ${PAYLOADS.length}`
  );
});

test("llms.txt carries the attribution and claims nothing about the data", () => {
  // `verify_legal.mjs` scans src/ for these overclaims and cannot see a file in
  // public/, so the same check lives here rather than on review. THE FIGURES
  // ARE NOT OURS TO LICENSE — they belong to five publishers under five sets of
  // terms, and НСИ's forbid redistributing производни и сборни произведения
  // outright (NOTICE §2, docs/legal.md). This is the file written for the
  // consumer least able to check the claim.
  for (const overclaim of ["отворени данни", "open data", "данните са свободни"]) {
    assert.ok(
      !LLMS.toLowerCase().includes(overclaim.toLowerCase()),
      `llms.txt claims the DATA is open ("${overclaim}"). Describe the code as ` +
        "open, never the figures."
    );
  }
  assert.ok(
    LLMS.includes("Данни от Евростат / ЕЦБ / НСИ / БНБ / имот.bg"),
    "llms.txt drops the upstream attribution. It is a licence condition of " +
      "several of those publishers rather than decoration, and it is not " +
      "translated — see docs/legal.md."
  );
  assert.ok(
    /Apache-2\.0/.test(LLMS),
    "llms.txt does not name the licence the code is under, so a reader has " +
      "the disclaimer about the figures with nothing to contrast it against"
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
    ["/", "/how/", "/legal/", "/support/", "/en/", "/en/how/", "/en/legal/", "/en/support/"],
    `gen-sitemap.mjs writes ${listed.join(", ")}. Every page that is not ` +
      "noindex belongs in it, and nothing robots.txt disallows does. Both " +
      "languages of a page are listed: they are separate documents with " +
      "separate canonicals, and a sitemap naming one half leaves the other " +
      "discoverable by link alone."
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
  { file: ["en", "index.html"], url: "/en/index.html" },
  { file: ["en", "how", "index.html"], url: "/en/how/index.html" },
  { file: ["en", "legal", "index.html"], url: "/en/legal/index.html" },
  { file: ["en", "support", "index.html"], url: "/en/support/index.html" },
  { file: ["404.html"], url: "/404.html" },
];

/**
 * The entries a crawler is meant to hold, which is every one but the 404.
 *
 * `404.html` carries a bare `noindex` and no canonical, so the head rules
 * below — one canonical, a complete `hreflang` set — are about a page it is
 * not. Filtered out of the list rather than named separately, so an entry
 * added to `ENTRIES` is covered by both without anybody remembering.
 */
const INDEXABLE = ENTRIES.filter(({ url }) => url !== "/404.html");

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

/** The `hreflang` set and the canonical of a built entry, as a crawler reads them. */
function headLinks(html) {
  const alternates = {};
  for (const [, tag, href] of html.matchAll(
    /<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/?>/g
  )) {
    alternates[tag] = href;
  }
  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/g)].map(
    (m) => m[1]
  );
  return { alternates, canonicals };
}

test("every page names both languages of itself, and each one names it back", () => {
  // **`hreflang` is reciprocal or it is nothing.** Google discards a set where
  // A names B and B does not name A — both documents keep serving and the pair
  // is simply never treated as a pair, which is the failure mode a reader of
  // either page cannot see and no other check in this repository can either.
  // The English tree exists so an English query has a document to rank, and an
  // unreciprocated set is that tree ranking against its own Bulgarian
  // counterpart instead of beside it.
  //
  // Written as ONE rule over the collection rather than as an assertion per
  // page: eight hand-written sets is eight chances for one of them to name
  // seven pages, and the one it forgets is the one nobody opens. A page added
  // to `ENTRIES` is checked by this the moment it is added.
  //
  // Each set names ITSELF too. A page's own canonical among its alternates is
  // what tells a crawler which member of the group this document is; a set that
  // lists only the other language leaves the group with a member it cannot
  // place.
  const published = new Map();
  for (const { file } of INDEXABLE) {
    const name = file.join("/");
    const { alternates, canonicals } = headLinks(read(...file));
    assert.equal(
      canonicals.length,
      1,
      `${name} carries ${canonicals.length} canonical links, and a crawler reads ` +
        "the first — two of them is a page whose own address is a guess"
    );
    assert.deepEqual(
      Object.keys(alternates).sort(),
      ["bg", "en", "x-default"],
      `${name} publishes hreflang ${Object.keys(alternates).join(", ") || "(none)"}. ` +
        "Every indexable page is served in two languages and has to name both " +
        "plus the x-default, or a search engine has no group to put it in."
    );
    published.set(canonicals[0], alternates);
  }
  assert.equal(
    published.size,
    INDEXABLE.length,
    "two entries claim the same canonical URL, so one of them is telling every " +
      "crawler it is the other page"
  );

  for (const [canonical, set] of published) {
    assert.ok(
      Object.values(set).includes(canonical),
      `${canonical} does not name itself among its own alternates`
    );
    assert.equal(
      set["x-default"],
      set.bg,
      `${canonical}'s x-default is ${set["x-default"]} rather than the Bulgarian ` +
        "page. It is what a search engine serves a reader whose language it " +
        "cannot place, and this is a calculator of Bulgarian prices written " +
        "for a person living in Bulgaria (docs/README.md)."
    );
    for (const tag of ["bg", "en"]) {
      const other = published.get(set[tag]);
      assert.ok(
        other,
        `${canonical} names ${set[tag]} as its ${tag} alternate and no entry is ` +
          "canonical at that URL — the alternate points at a page that does not " +
          "claim to be one"
      );
      assert.deepEqual(
        other,
        set,
        `${canonical} and ${set[tag]} publish different hreflang sets. A set that ` +
          "is not reciprocal is discarded whole, so both pages keep serving and " +
          "neither is ever treated as the other's alternate."
      );
    }
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
  for (const { name, pages } of PRERENDERED) {
    // Both addresses a component answers at. A row whose English entry lost its
    // mount point fails the build, and the Bulgarian one beside it would have
    // gone on passing this while `/en/…` shipped an empty div.
    for (const page of pages) {
      const entry = read(...page);
      assert.ok(
        entry.includes(MOUNT_POINT),
        `${page.join("/")} no longer carries ${MOUNT_POINT} verbatim, so the ` +
          "prerender step has nowhere to write the page. The marker, the " +
          "injection and the mount target move together."
      );
    }
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

test("the crawler's copy is served in the language its entry declares", () => {
  // The pair is `<span class="l-bg">` beside `<span class="l-en">`, hidden one
  // way or the other by a rule in `tokens.css`. CSS reaches a browser and
  // Googlebot; an agent that fetches the HTML and strips the tags reads both
  // halves run together, and the six agents `robots.txt` allows by name are
  // that kind of consumer.
  const pair =
    '<p><span class="l-bg">Твоите числа.</span> <span class="l-en">Your numbers.</span></p>';
  assert.equal(
    dropOtherLanguages(pair, "bg"),
    '<p><span class="l-bg">Твоите числа.</span> </p>',
    "the served page carries the language its entry does not declare"
  );
  // Symmetric, because the class to drop is decided by the entry rather than
  // written into the step: an entry declaring `en` keeps the English.
  assert.equal(
    dropOtherLanguages(pair, "en"),
    '<p> <span class="l-en">Your numbers.</span></p>',
    "the step drops a fixed language instead of the one the entry does not declare"
  );
  // Untouched markup stays byte-identical. A stripper that reassembled the
  // whole page would be a second thing that can corrupt it.
  const plain = '<main class="how"><h1>Числата</h1></main>';
  assert.equal(dropOtherLanguages(plain, "bg"), plain);

  assert.throws(
    () => dropOtherLanguages(pair, "de"),
    /not a language this site is written in/,
    "stripping against a language nothing is authored in would empty the page"
  );
});

test("the language strip drops the tag it matched, at the depth it matched", () => {
  // Two elements away from being wrong, and neither reports itself.
  //
  // The container is a `<span>` in every case but one: `ExplainerBand.svelte`
  // writes the route to `/how/` as `<a class="how-more l-en" href="/how/">`, so
  // a `<span`-keyed stripper serves an English link on `/` and every other
  // assertion stays green.
  assert.equal(
    dropOtherLanguages('<p><a class="how-more l-en" href="/how/">More →</a></p>', "bg"),
    "<p></p>",
    "a language class on any tag but <span> survives the strip"
  );
  // And the scan counts opens and closes of that tag rather than running to
  // the first `</span>`. A non-greedy match closes on the CHILD's tag and
  // leaves the parent's closer behind, which a parser reads as content
  // escaping the element.
  assert.equal(
    dropOtherLanguages('<p><span class="l-en">a <span>b</span> c</span>!</p>', "bg"),
    "<p>!</p>",
    "a nested element of the same tag ends the scan early, leaving stray markup"
  );
  // `<b>` and `<a>` genuinely nest inside these spans — /legal/ carries
  // `<span class="l-en"><b>Terms:</b> Permits reproduction…</span>` — so the
  // scan must not stop at the first `</` either.
  assert.equal(
    dropOtherLanguages('<span class="l-en"><b>Terms:</b> Permits…</span><i>x</i>', "bg"),
    "<i>x</i>",
    "the scan stops at the first closing tag of any kind"
  );
  // A `.l-bg` inside a `.l-en` goes with its parent, which is what the CSS
  // does: `display: none` takes the subtree.
  assert.equal(
    dropOtherLanguages('<span class="l-en">x <span class="l-bg">y</span></span>z', "bg"),
    "z",
    "the dropped subtree is rescanned, so its own children are put back"
  );
});

test("the entry decides which language it is served in", () => {
  assert.equal(
    entryLang('<!doctype html>\n<html lang="bg" data-lang="bg" data-theme="light">'),
    "bg"
  );
  assert.equal(entryLang('<html data-lang="en">'), "en");
  // The attribute is what `tokens.css` hides a language by. An entry with none
  // leaves the step guessing, and a guess serves markup the stylesheet
  // disagrees with — half a page of `display: none`.
  assert.throws(() => entryLang('<html lang="bg">'), /data-lang=null/);
  assert.throws(() => entryLang('<html data-lang="">'), /data-lang=""/);
});

test("every entry declares a language the strip can be run against", () => {
  // The step reads this attribute off each built entry. An entry that lost it
  // fails the build rather than shipping a page in both languages again, and
  // this is the same fact checked without one.
  for (const { file } of ENTRIES) {
    const name = file.join("/");
    assert.ok(
      LANGS.includes(entryLang(read(...file))),
      `${name} declares no language on <html>, and the prerender reads that ` +
        "attribute to decide which half of every string a crawler is served"
    );
  }
});

test("every indexable entry opts into a full snippet, and the 404 into none", () => {
  // Bulgaria is in the EU, where Google truncates snippets and image previews
  // for publishers who have not asked otherwise — and that limit governs how
  // much of a page can appear in a result AND in an AI Overview. This site's
  // whole purpose is that a figure reaches a person with its source attached,
  // so a longer quotation of it is the outcome wanted rather than a leak.
  //
  // One loop over `ENTRIES`, not four assertions: a page added to the build
  // and left out of the opt-in is the one nobody notices, because everything
  // around it stays green.
  for (const { file, url } of ENTRIES) {
    const html = read(...file);
    const meta = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1];
    if (url === "/404.html") {
      // The one entry that stays out, and it stays out both ways: `noindex`
      // and nothing else. A max-snippet directive on an error page asks for a
      // fuller preview of a result that should not exist.
      assert.equal(
        meta,
        "noindex",
        "404.html no longer carries a bare noindex — an indexed error page is " +
          "a search result that wastes a reader's click"
      );
      continue;
    }
    assert.ok(meta, `${file.join("/")} carries no robots meta, so the EU default truncates it`);
    for (const directive of ["index", "follow", "max-snippet:-1", "max-image-preview:large"]) {
      assert.ok(
        meta.includes(directive),
        `${file.join("/")}'s robots meta is "${meta}" and does not ask for ` +
          `${directive}. Without it the EU default decides how much of this ` +
          "page a result or an AI Overview may quote."
      );
    }
    assert.ok(
      !/\bnoindex\b/.test(meta),
      `${file.join("/")} is noindex. Every page in the sitemap is meant to be ` +
        "found, and /legal/ is the one ЗЕТ чл. 4 wants findable."
    );
  }
});

test("the dateModified slot is filled from a payload, never left in the page", () => {
  // The entries are static HTML with no templating, so the date a crawler
  // reads this site's freshness off is a token the build substitutes. The
  // failure the throw catches is the step running against an entry that lost
  // its slot: `replaceAll` on a string that is not there returns the page
  // unchanged and exits 0, which is a build that shipped no dateModified while
  // reporting success.
  assert.equal(
    fillDate('{"dateModified": "__DATA_LASTMOD__"}', "__DATA_LASTMOD__", "2026-08-02"),
    '{"dateModified": "2026-08-02"}'
  );
  assert.throws(
    () => fillDate('{"name": "Вярно"}', "__DATA_LASTMOD__", "2026-08-02"),
    /no __DATA_LASTMOD__ in the built entry/,
    "an entry with no slot was rewritten unchanged, so the page ships without " +
      "the field and the build reports success"
  );
  // And a date nothing decided is refused rather than invented. `newestAsOf`
  // returns null when no payload carries a readable `as_of`, and a page
  // stating it changed on "null" is worse than one stating nothing.
  for (const bad of [null, "", "soon", "2026-08"]) {
    assert.throws(
      () => fillDate('{"dateModified": "__DATA_LASTMOD__"}', "__DATA_LASTMOD__", bad),
      /is not an ISO day/,
      `${JSON.stringify(bad)} reached the served page as this site's freshness`
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

/** Every `.txt` under `public/`, as the URL path it is served at. */
function servedTextFiles(dir = site("public"), urlPrefix = "") {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...servedTextFiles(full, `${urlPrefix}/${name}`));
    else if (name.endsWith(".txt")) found.push({ url: `${urlPrefix}/${name}`, full });
  }
  return found;
}

test("every .txt the site serves declares the charset its Cyrillic needs", () => {
  // A rule over the collection rather than three named files: robots.txt,
  // llms.txt and security.txt all carry Cyrillic today, and the next one added
  // will too — the publisher names and the attribution line are a licence
  // condition and are not translated.
  //
  // `text/plain` with no charset is decoded with the browser's own default,
  // which in Bulgaria is windows-1251, so «Данни от Евростат» arrives as
  // «Р”Р°РЅРЅРё РѕС‚ Р•РІСЂРѕСЃС‚Р°С‚». The bytes on disk are correct UTF-8
  // throughout, which is why nothing else here can see it: the file is right
  // and the RESPONSE is wrong. This checks the declaration;
  // `check-live-headers.mjs` checks that the origin actually sends it.
  const blocks = headerBlocks(HEADERS);
  const files = servedTextFiles();
  assert.ok(files.length > 0, "no .txt found under public/ — this test just stopped checking");
  let checked = 0;
  for (const { url, full } of files) {
    if (!/[\u0080-\uffff]/.test(readFileSync(full, "utf-8"))) continue;
    checked += 1;
    assert.match(
      (blocks[url] ?? []).join(" "),
      /Content-Type:\s*text\/plain;\s*charset=utf-8/i,
      `${url} carries non-ASCII and _headers gives it no charset. Served as ` +
        "bare text/plain a browser falls back to its own default — " +
        "windows-1251 here — and every Cyrillic line renders as mojibake."
    );
  }
  assert.ok(
    checked > 0,
    "no served .txt carries non-ASCII any more, so this test passed without " +
      "checking anything. Delete it, or find where the Cyrillic went."
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
