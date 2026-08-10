#!/usr/bin/env node
/**
 * The run is the whole run — every suite on disk is named by a runner.
 *
 * `package.json` names each `verify_*.mjs` file explicitly rather than globbing
 * a directory, and that is the right call: a glob runs whatever happens to be
 * lying in `scripts/`, so a half-finished file picked up by the wildcard fails
 * a run nobody asked it to be part of, and the argument list is the one place a
 * reader can see what `npm run verify:math` actually does.
 *
 * What an explicit list cannot do is notice its own omissions. A suite added
 * tomorrow and left out of the list runs never — not skipped, not reported,
 * simply absent — and every count downstream agrees that everything passed,
 * because from the runner's point of view it did. `check-test-floors.mjs`
 * cannot see it either: a suite that was never in the argument list took no
 * tests away from the total it is comparing against.
 *
 * So the list stays hand-written and this reconciles it against the directory.
 * The same check in reverse catches the other direction — a file renamed or
 * deleted while the runner still names it, which fails the run loudly today but
 * says nothing about why.
 *
 * This file is subject to its own first rule: leave it out of `verify:math` and
 * it stops running, which is exactly the failure it exists to catch. That is
 * not a hole so much as the shape of the problem — something has to be the
 * outermost list. What makes it survivable is that removing a suite from the
 * runner is a visible edit to `package.json`, and this comment is what a
 * reviewer is meant to remember when they see one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYLOAD_FILES } from "../src/lib/payloads.js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");

const pkg = JSON.parse(readFileSync(join(SITE, "package.json"), "utf8"));

/** The suite filenames an npm script hands to `node --test`. */
function namedBy(script) {
  const line = pkg.scripts[script];
  assert.ok(line, `package.json has no "${script}" script`);
  return (line.match(/scripts\/(verify_[A-Za-z0-9_]+\.mjs)/g) ?? []).map((m) =>
    m.replace("scripts/", "")
  );
}

const RUNNERS = ["verify:math", "test:render"];
const named = new Map();
for (const runner of RUNNERS) {
  for (const file of namedBy(runner)) named.set(file, runner);
}

const onDisk = readdirSync(join(SITE, "scripts"))
  .filter((f) => f.startsWith("verify_") && f.endsWith(".mjs"))
  .sort();

test("every suite in scripts/ is named by a runner in package.json", () => {
  const missing = onDisk.filter((f) => !named.has(f));
  assert.deepEqual(
    missing,
    [],
    `${missing.join(", ")} exists but no npm script runs it — a suite left out of ` +
      `the argument list runs never, and every count downstream still reports green. ` +
      `Add it to "verify:math", or to "test:render" if it needs a browser.`
  );
});

test("every suite a runner names is on disk", () => {
  const absent = [...named].filter(([f]) => !onDisk.includes(f));
  assert.deepEqual(
    absent.map(([f, runner]) => `${f} (${runner})`),
    [],
    "an npm script names a suite file that is not there"
  );
});

test("no suite is named by two runners", () => {
  // `verify:math` and `test:render` are separate runs with separate TAP
  // reports, and `check-test-floors.mjs` reads one count from each. A file in
  // both lists is counted twice against two floors, so both drift upward for a
  // reason neither floor is about.
  const twice = [];
  for (const runner of RUNNERS) {
    for (const file of namedBy(runner)) {
      if (named.get(file) !== runner) twice.push(file);
    }
  }
  assert.deepEqual(twice, [], `${twice.join(", ")} is run by more than one npm script`);
});

test("every payload a suite opens is one this repository publishes", () => {
  // **A suite that reads a payload by a name nothing publishes does not fail —
  // it skips.** `published()` answers null for a file that is not there, and
  // every caller guards on that with `if (!x) return;`, which is the right
  // behaviour for a checkout nobody has run a refresh in and the wrong one for
  // a stem that has been renamed. The suite reports a pass having asserted
  // nothing, and the count barely moves because one test out of hundreds went
  // quiet.
  //
  // That is not hypothetical here: `sofia_salary` and `sofia_price` became
  // `region_salary` and `city_price`, and six suites read one or the other.
  // Nothing but this notices the day it happens again.
  // **The scan has to follow the local alias, or it reads almost nothing.**
  // Most suites here do `const read = published;` and then call `read("…")`,
  // which is the whole of `verify_data_contracts.mjs` and `verify_view.mjs` —
  // so a scan for the exported name alone collects a handful of stems and
  // reports a pass over the files it was written for. `read` is NOT a reserved
  // word here either: `verify_legal.mjs` and `verify_static_assets.mjs` bind it
  // to a file reader, so the alias is resolved per file rather than matched by
  // name.
  const stems = new Set();
  for (const file of onDisk) {
    const text = readFileSync(join(SITE, "scripts", file), "utf8");
    const names = new Set(["published"]);
    for (const [, alias] of text.matchAll(/\bpublished\s+as\s+(\w+)/g)) names.add(alias);
    for (const [, alias] of text.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*published\s*;/g)) {
      names.add(alias);
    }
    for (const name of names) {
      const call = new RegExp(String.raw`\b${name}\(\s*"([a-z0-9_]+)"`, "g");
      for (const [, stem] of text.matchAll(call)) stems.add(stem);
    }
  }
  assert.ok(stems.size > 3, "no suite opens a published payload — the scan found nothing");
  const unknown = [...stems].filter(
    (s) => !PAYLOAD_FILES.includes(s) && !SCRATCH_STEMS.includes(s)
  );
  assert.deepEqual(
    unknown,
    [],
    `${unknown.join(", ")} is opened by a suite and published by nothing. ` +
      `\`published()\` answers null for it and the guard clause skips, so the ` +
      `assertions behind it stopped running without a single test going red.`
  );
});

// The three names `verify_data_contracts.mjs` writes into a scratch directory
// to test the reader's own behaviour — absent, malformed and fine. They are
// deliberately not payloads.
const SCRATCH_STEMS = ["absent", "corrupt", "fine"];
