#!/usr/bin/env node
/**
 * The live origin serves what `public/_headers` declares — asked over HTTP.
 *
 * `_headers` is the deployment contract whoever serves the site, and
 * `verify_static_assets.mjs` pins every directive in it exactly. What neither
 * can see is the other half: a host that does not read `_headers` natively
 * needs the same policy in its own syntax, and that translation is made by
 * hand. A block added here and not there is a rule that exists in the
 * repository, passes every test, ships in `dist/` — and is served by nobody.
 *
 * That failure is silent in the direction that matters. The reader gets a 200
 * and a page, so nothing reports an error; what they lose is whatever the
 * missing block carried. `/llms.txt` declares `charset=utf-8` because the file
 * carries Cyrillic — the attribution line and the publisher names, which are a
 * licence condition and are not translated. Served as bare `text/plain`, a
 * browser falls back to the reader's own default, which in this country is
 * windows-1251, and «Вярно» arrives as «Р’СЏСЂРЅРѕ». Nothing in the build can
 * tell: the bytes on disk are correct UTF-8 and the declaration is right.
 * Only the response says otherwise.
 *
 * So this is a DEPLOY-time check, not a build-time one, and it is deliberately
 * outside `make check` — it needs a network and a deployed site, and a suite
 * that fails when the office wifi drops is one people learn to skip. Run it
 * after a deploy that touched `_headers`, and when a header-shaped bug is
 * reported:
 *
 *     npm run check:headers                     # https://vyarno.bg
 *     npm run check:headers -- https://staging  # anywhere else
 *
 * It reads the rules out of `_headers` rather than restating them, so a block
 * added there is probed here with no second edit. Wildcard patterns are
 * resolved to a real URL — the first font on disk, the first published payload,
 * an asset named by the served `index.html` — because `/assets/*` has no fixed
 * path to ask for and a rule nobody probes is a rule nobody checks.
 *
 * A mismatch prints the path, the header, what was declared and what came back.
 * That output is what a server config gets written from; this file does not
 * emit nginx, because the translation depends on a deployment this repository
 * does not describe, and a generator for a config we cannot test would be a
 * guess with authority.
 *
 * ## A mismatch is not always a config that drifted
 *
 * **A CDN that cached a response keeps the HEADERS it stored with it, and a
 * revalidation does not refresh them.** `/robots.txt` has been failing on a CSP
 * with no `https://plausible.io` in `script-src` or `connect-src` — which is
 * this project's own CSP as it read before the visit counter was admitted. The
 * origin is correct and serves the declared header; one edge object is old.
 *
 * The two requests that tell those apart, and the reason the diagnosis is worth
 * writing down rather than re-deriving:
 *
 *     curl -sSI https://vyarno.bg/robots.txt          → HIT,  W/"9e08…", stale CSP
 *     curl -sSI https://vyarno.bg/robots.txt?cb=1     → MISS,  "9e08…", declared CSP
 *
 * Same body, same etag value, weak against strong. A cache miss going to the
 * origin proves the config; the hit is a stored copy whose 304s keep it alive
 * past any `max-age`. The fix is a purge at the CDN and not an edit here, and
 * editing `_headers` to match the stale copy would make a real drift permanently
 * invisible — which is what the failure message below is warning against.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ORIGIN } from "./gen-sitemap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..");

/**
 * `_headers` as ordered [pattern, {name: value}] pairs.
 *
 * Order is kept because the format's own precedence rule depends on it: every
 * matching block applies, and a later one wins the headers it names. `/*` then
 * `/llms.txt` is a site-wide policy with one path adding to it, which is
 * exactly how the file is written.
 */
function parseHeaders(src) {
  const blocks = [];
  let current = null;
  for (const raw of src.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: {} };
      blocks.push(current);
    } else if (current) {
      const line = raw.trim();
      const colon = line.indexOf(":");
      if (colon < 1) continue;
      current.headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }
  return blocks;
}

/** Does a `_headers` path pattern cover this path? `*` is the only wildcard used. */
function covers(pattern, path) {
  const rx = new RegExp(
    "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
  );
  return rx.test(path);
}

/** Every header that should come back for a path, later blocks winning. */
function expectedFor(blocks, path) {
  const out = {};
  for (const { pattern, headers } of blocks) {
    if (covers(pattern, path)) Object.assign(out, headers);
  }
  return out;
}

/** The first file under a directory, as a URL path. Null if there is none. */
function firstFileUnder(dir, urlPrefix) {
  let entries;
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return null;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const nested = firstFileUnder(full, `${urlPrefix}/${name}`);
      if (nested) return nested;
    } else if (!name.startsWith(".")) {
      return `${urlPrefix}/${name}`;
    }
  }
  return null;
}

/**
 * A concrete URL path to probe a wildcard pattern with.
 *
 * A pattern with no `*` is its own probe. The rest are resolved against
 * something real, because a made-up path answers 404 and a 404 carries a
 * different rule set on most hosts — which would report the deploy as broken
 * when only the sample was.
 */
async function probeFor(pattern, origin) {
  if (!pattern.includes("*")) return pattern;
  if (pattern === "/*") return "/";
  if (pattern === "/fonts/*") return firstFileUnder(join(SITE, "public", "fonts"), "/fonts");
  if (pattern === "/data/published/*") {
    const first = readdirSync(join(REPO, "data", "published"))
      .filter((f) => f.endsWith(".json"))
      .sort()[0];
    return first ? `/data/published/${first}` : null;
  }
  if (pattern === "/assets/*") {
    // Hashed filenames, so the served index.html is the only place that knows
    // one. Reading it from the origin rather than from a local `dist/` also
    // keeps this honest about WHICH build is deployed.
    const res = await fetch(new URL("/", origin), { redirect: "follow" });
    const html = await res.text();
    return html.match(/\/assets\/[A-Za-z0-9._-]+/)?.[0] ?? null;
  }
  return null;
}

/** Whitespace and case are not part of what a header means; the value is. */
const normalise = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+/g, " ");

async function headOrGet(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (res.status !== 405 && res.status !== 501) return res;
  const get = await fetch(url, { redirect: "follow" });
  await get.arrayBuffer();
  return get;
}

/**
 * Response headers that make the BROWSER go somewhere — fetch a resource,
 * open a connection, post a report.
 *
 * `_headers` is checked for drift in one direction: every rule it declares has
 * to arrive. That misses the direction a CDN actually drifts in, which is
 * adding something nobody declared. These headers are the ones where that
 * matters, because each is an instruction to the reader's browser rather than
 * a property of the response, and the privacy notice makes a checkable claim
 * about exactly that: «браузърът ти не праща нито една заявка към трето лице».
 * A `Link: <https://…>; rel=preconnect` or a reporting endpoint on another
 * origin falsifies that sentence without changing one line in this repository.
 *
 * The CSP does not cover this. `connect-src` governs fetch and XHR; a Reporting
 * API upload is not subject to it, which is precisely why the notice describes
 * error reporting in its own paragraph instead of pointing at the policy.
 */
const DIRECTIVE_HEADERS = [
  "link",
  "nel",
  "refresh",
  "report-to",
  "reporting-endpoints",
  "speculation-rules",
];

/**
 * The ones the notice already accounts for, and what accounts for them.
 *
 * A name is in here because the published notice describes it, never because
 * it is common or harmless. Adding a name is a privacy-notice edit first and a
 * line here second — in that order, and in the same release.
 */
const DISCLOSED = new Map([
  ["nel", "network error reporting — privacy notice, «Какво вижда хостът»"],
  ["report-to", "network error reporting — privacy notice, «Какво вижда хостът»"],
  ["speculation-rules", "same-origin prefetch, served from /cdn-cgi/ on this origin"],
]);

/**
 * The routes whose address has to resolve to exactly one canonical form.
 *
 * Every page of the site, both language trees, because the failure is per route:
 * `/credit/` shipped as the sixth route and `https://vyarno.bg/credit` 404'd
 * until the host learned about it, while `/how` had redirected for months. A
 * list stated once here is a route covered the day it is added, which is the
 * same lesson `verify_render_layout.mjs` records for the footer.
 */
const ROUTES = [
  "/how/",
  "/market/",
  "/credit/",
  "/legal/",
  "/support/",
  "/en/how/",
  "/en/market/",
  "/en/credit/",
  "/en/legal/",
  "/en/support/",
];

/**
 * One address per page, and the host is part of the address.
 *
 * **This is the class of drift `_headers` cannot see at all.** A header is a
 * property of a response; this is about which response you get, and it is
 * decided in a CDN dashboard rather than in this repository — so nothing in the
 * build can go red for it and only a live request can tell.
 *
 * Two rules, and both were broken here:
 *
 * - **`www` must 301 to the apex.** `www.vyarno.bg` answered 522 (the CDN could
 *   not reach an origin for it) while the apex served fine, so every link,
 *   citation and QR code written with the `www` a person expects reached a
 *   Cloudflare error page.
 * - **A slash-less route must redirect ONCE to its trailing-slash form.** Two
 *   hops is a redirect chain a crawler discounts and a reader pays for twice;
 *   zero hops means two URLs serve one page, which splits whatever authority
 *   either has and gives an unfurler a choice to get wrong.
 *
 * `redirect: "manual"` throughout, deliberately: `follow` is what the header
 * probes below use and it would report a 301 chain as a clean 200, which is
 * precisely the state this exists to find.
 */
async function checkCanonicalHost(origin) {
  const bad = [];
  // Routes the origin does not serve at either address. Reported apart from the
  // failures because they are not one: a route that has not shipped yet is the
  // ordinary state of a branch, and calling it drift trains an operator to skip
  // the whole check.
  const undeployed = [];
  const url = new URL(origin);
  const apex = url.hostname.replace(/^www\./, "");

  // The `www` host, asked for the root. Its own try/catch: a DNS name that does
  // not resolve is a different report from one that resolves and misbehaves, and
  // a site with no `www` record at all is not broken.
  const wwwUrl = `${url.protocol}//www.${apex}/`;
  try {
    const res = await fetch(wwwUrl, { method: "HEAD", redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status !== 301) {
      bad.push(
        `   ${wwwUrl} — HTTP ${res.status}, expected 301 to the apex\n` +
          (location ? `     location: ${location}\n` : "") +
          "     A 5xx here is the shape the 522 took: the apex serves and the\n" +
          "     host a reader types does not. Add the redirect rule at the CDN."
      );
    } else if (!location || new URL(location, wwwUrl).hostname !== apex) {
      bad.push(`   ${wwwUrl} — 301s to ${location}, which is not ${apex}`);
    } else {
      console.log(`ok www.${apex} 301s to ${apex}`);
    }
  } catch (err) {
    bad.push(`   ${wwwUrl} — ${err.message} (no www record, or it does not answer)`);
  }

  for (const route of ROUTES) {
    const slashless = route.replace(/\/$/, "");
    const target = new URL(slashless, origin);
    let res;
    try {
      res = await fetch(target, { method: "HEAD", redirect: "manual" });
    } catch (err) {
      bad.push(`   ${target} — ${err.message}`);
      continue;
    }
    if (res.status < 300 || res.status > 399) {
      // **Ask for the canonical form before blaming the redirect.** A route
      // that is not deployed at all answers 404 at BOTH addresses, and a check
      // that stops at the first one reports it in the words of a missing CDN
      // rule — sending an operator to a dashboard to fix a branch that has not
      // merged. The two states need opposite actions, so they get opposite
      // sentences. This host adds the trailing-slash redirect by itself for
      // routes it serves, which is why "not deployed" is the likelier reading
      // of a 404 here and why it is not a failure of this check's own subject.
      const canonical = await fetch(new URL(route, origin), {
        method: "HEAD",
        redirect: "manual",
      }).catch(() => null);
      if (res.status === 404 && canonical?.status === 404) {
        undeployed.push(
          `   ${route} — 404 at both ${slashless} and ${route}, so the route is not\n` +
            "     deployed. Nothing to add at the CDN: merge and deploy, then re-run."
        );
        continue;
      }
      bad.push(
        `   ${slashless} — HTTP ${res.status} while ${route} answers ` +
          `${canonical?.status ?? "nothing"}\n` +
          "     The page is served and its slash-less address is not a redirect to\n" +
          "     it: a 404 needs the rule adding, a 200 means two URLs serve one\n" +
          "     page and neither is canonical."
      );
      continue;
    }
    const location = res.headers.get("location");
    const landed = location ? new URL(location, target).pathname : null;
    if (landed !== route) {
      bad.push(
        `   ${slashless} — ${res.status} to ${location ?? "(no location)"}, wanted ${route}`
      );
      continue;
    }
    // One hop and no more: the trailing-slash form must answer for itself.
    const final = await fetch(new URL(route, origin), { method: "HEAD", redirect: "manual" });
    if (final.status >= 300 && final.status <= 399) {
      bad.push(
        `   ${route} — ${slashless} redirects here and this redirects on to ` +
          `${final.headers.get("location")}, so the route is a two-hop chain`
      );
      continue;
    }
    console.log(`ok ${slashless} → ${route} (${res.status}), and ${route} answers ${final.status}`);
  }
  if (undeployed.length) {
    console.log(`\n-- ${undeployed.length} route(s) not deployed at this origin`);
    for (const line of undeployed) console.log(line);
  }
  return bad;
}

const origin = process.argv[2] ?? ORIGIN;
const blocks = parseHeaders(readFileSync(join(SITE, "public", "_headers"), "utf8"));
if (blocks.length === 0) {
  console.error("public/_headers declares no rules at all — nothing to check.");
  process.exit(1);
}

console.log(`Checking ${origin} against site/public/_headers\n`);

let problems = 0;
let unprobed = 0;
// Paths `_headers` declares that this origin does not serve yet. Counted so the
// summary can say so, never added to `problems`: a route that has not shipped
// is the ordinary state of a branch and not drift between repo and CDN.
let undeployedPaths = 0;

// The canonical-host rules first, because a route that does not resolve to one
// address makes every header result below ambiguous about which URL it describes.
const canonical = await checkCanonicalHost(origin);
if (canonical.length) {
  problems += canonical.length;
  console.log(`\nFAIL canonical host and route form — ${canonical.length} problem(s)`);
  for (const line of canonical) console.log(line);
}
console.log();

// One request per PATH, not per rule. `/*` and `/` both resolve to `/`, and
// the expected set is the merge of every matching block either way — asking
// twice would report the same headers twice and hide nothing.
const probes = new Map();
for (const { pattern } of blocks) {
  const path = await probeFor(pattern, origin);
  if (!path) {
    // Loud rather than skipped: the rules this cannot resolve are the ones
    // nothing else checks either, and a silent skip reads as a pass.
    console.log(`?  ${pattern} — no URL to probe it with, NOT checked`);
    unprobed += 1;
    continue;
  }
  if (!probes.has(path)) probes.set(path, []);
  probes.get(path).push(pattern);
}

for (const [path, patterns] of probes) {
  const expected = expectedFor(blocks, path);
  const url = new URL(path, origin);
  let res;
  try {
    res = await headOrGet(url);
  } catch (err) {
    console.log(`!  ${path} — ${err.message}`);
    problems += 1;
    continue;
  }

  // **A 404's headers are not this path's headers, so they are not compared.**
  // `_headers` describes the page; a not-found response is a different response
  // with its own policy, and diffing the two reports `cache-control: no-store`
  // as drift when what actually happened is that the route has not shipped. That
  // is the same false alarm the canonical-host section above untangles, arriving
  // through the other half of this file — four of them at once on the branch that
  // added `/credit/` to `_headers` before the route was deployed.
  if (res.status === 404) {
    console.log(`-- ${path} — 404, so the route is not deployed here; headers not compared`);
    undeployedPaths += 1;
    continue;
  }

  const wrong = [];
  for (const [name, want] of Object.entries(expected)) {
    const got = res.headers.get(name);
    if (got === null) wrong.push(`   ${name}: missing\n     declared: ${want}`);
    else if (normalise(got) !== normalise(want))
      wrong.push(`   ${name}:\n     declared: ${want}\n     served:   ${got}`);
  }

  // Declared names are compared case-insensitively: `_headers` writes
  // `Cache-Control` and a header name is case-insensitive by definition, so
  // matching the literal spelling would report a declared header as undeclared.
  const declared = new Set(Object.keys(expected).map((n) => n.toLowerCase()));
  const notes = [];
  for (const name of DIRECTIVE_HEADERS) {
    const got = res.headers.get(name);
    if (got === null || declared.has(name)) continue;
    const why = DISCLOSED.get(name);
    if (why) {
      notes.push(`   note ${name}: ${why}`);
      continue;
    }
    wrong.push(
      `   ${name}: served but declared nowhere\n     served:   ${got}\n` +
        "     A header that sends the browser somewhere is a privacy-notice\n" +
        "     change before it is a header change. Read where it points."
    );
  }

  const named = patterns.filter((p) => p !== path);
  const from = named.length ? `  (${named.join(", ")})` : "";
  if (wrong.length === 0) {
    console.log(`ok ${path}${from} — ${Object.keys(expected).length} headers as declared`);
  } else {
    problems += wrong.length;
    console.log(`FAIL ${path}${from} — HTTP ${res.status}`);
    for (const line of wrong) console.log(line);
  }
  for (const line of notes) console.log(line);
}

console.log();
const deployNote = undeployedPaths
  ? ` (${undeployedPaths} declared path(s) not deployed at this origin yet)`
  : "";
if (problems === 0 && unprobed === 0) {
  console.log(
    `The origin serves one address per route, with every header _headers declares.${deployNote}`
  );
  process.exit(0);
}
if (problems === 0) {
  console.log(`No drift found, but ${unprobed} rule(s) had no URL to probe.`);
  process.exit(1);
}
console.log(
  `${problems} problem(s) the origin does not serve as declared.\n` +
    "`_headers` is the contract for the headers: fix the server to match it, and\n" +
    "change the declaration only in the release that means to change the policy.\n" +
    "The canonical-host rules are not in `_headers` and cannot be — they decide\n" +
    "WHICH response you get, which is a CDN rule rather than a header."
);
process.exit(1);
