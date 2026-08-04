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

const origin = process.argv[2] ?? ORIGIN;
const blocks = parseHeaders(readFileSync(join(SITE, "public", "_headers"), "utf8"));
if (blocks.length === 0) {
  console.error("public/_headers declares no rules at all — nothing to check.");
  process.exit(1);
}

console.log(`Checking ${origin} against site/public/_headers\n`);

let problems = 0;
let unprobed = 0;

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

  const wrong = [];
  for (const [name, want] of Object.entries(expected)) {
    const got = res.headers.get(name);
    if (got === null) wrong.push(`   ${name}: missing\n     declared: ${want}`);
    else if (normalise(got) !== normalise(want))
      wrong.push(`   ${name}:\n     declared: ${want}\n     served:   ${got}`);
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
}

console.log();
if (problems === 0 && unprobed === 0) {
  console.log("The origin serves every header _headers declares.");
  process.exit(0);
}
if (problems === 0) {
  console.log(`No drift found, but ${unprobed} rule(s) had no URL to probe.`);
  process.exit(1);
}
console.log(
  `${problems} header(s) the origin does not serve as declared.\n` +
    "`_headers` is the contract: fix the server to match it, and change the\n" +
    "declaration only in the release that means to change the policy."
);
process.exit(1);
