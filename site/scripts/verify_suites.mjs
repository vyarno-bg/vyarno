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
