#!/usr/bin/env node
/**
 * No suite is allowed to get smaller.
 *
 * ## Why this exists rather than a number in a doc
 *
 * The expected counts used to be written out in prose, and by the end they were
 * in five places: `AGENTS.md`, the pull-request template, `check-all.mjs`, the
 * Cursor rules and the Copilot instructions. Three of the five were wrong — the
 * Cursor copy said 14 render tests and the Copilot copy said 15, against an
 * actual 25 — because a count changes whenever anybody adds a test and nothing
 * made them change together. A number that is stale more often than not is one
 * a reader learns to skip, which costs the check the only thing it was for.
 *
 * ## Floors, not exact counts
 *
 * The failure worth catching is a suite that SHRANK: an assertion deleted to
 * make something pass, a file dropped from the runner's argument list, a suite
 * that silently stopped running. A count going up is somebody doing their job.
 *
 * So these are minimums. Adding tests needs no bookkeeping at all, and only
 * removing them fails — which is exactly where `AGENTS.md` wants a person to
 * stop and think rather than quietly edit a number:
 *
 *   > never widen a validation tolerance, delete an assertion or skip a test to
 *   > make something pass
 *
 * **Lower a floor only in the same commit as the deletion that made it
 * necessary, and say in the commit message which tests went and why.**
 *
 * ## Where the numbers come from
 *
 * The suites already write them. `verify:math` and `test:render` run a TAP
 * reporter alongside the live one, and pytest writes its junit-xml — so nothing
 * is run twice, and the count is the runner's own rather than something parsed
 * out of prose.
 *
 * A MISSING report is a failure in its own right, and not the same as a count
 * of zero: `test:render` exits 0 having asserted nothing when it finds no
 * browser, and that is precisely the run that must not pass. `make render`
 * gates on `find-chromium.mjs` first; this is the second lock on the same door,
 * and it is the one that also covers CI calling the suites directly.
 *
 * Usage — name the suites whose reports should be there:
 *
 *     node scripts/check-test-floors.mjs pytest node render
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SITE, "..");

/** THE ONLY TEST COUNTS IN THE REPOSITORY. Read the header before changing one. */
export const FLOORS = {
  pytest: { floor: 288, report: join(ROOT, ".report-pytest.xml"), of: /tests="(\d+)"/ },
  node: { floor: 338, report: join(SITE, ".report-node.tap"), of: /^# pass (\d+)$/m },
  render: { floor: 30, report: join(SITE, ".report-render.tap"), of: /^# pass (\d+)$/m },
};

/**
 * What a suite reported, or null when it left no usable report.
 *
 * `null` rather than 0, because "did not run" and "ran and passed nothing" are
 * different failures and only one of them is reachable by deleting tests.
 *
 * @param {keyof typeof FLOORS} key
 * @returns {number|null}
 */
export function counted(key) {
  const { report, of } = FLOORS[key];
  if (!existsSync(report)) return null;
  const found = of.exec(readFileSync(report, "utf8"));
  return found ? Number(found[1]) : null;
}

/**
 * Check the named suites.
 *
 * @param {Array<keyof typeof FLOORS>} keys
 * @returns {{summary: string, problems: string[]}}
 */
export function checkFloors(keys) {
  const summary = [];
  const problems = [];
  for (const key of keys) {
    if (!FLOORS[key]) {
      problems.push(`${key}: not a suite this knows about`);
      continue;
    }
    const { floor } = FLOORS[key];
    const actual = counted(key);
    if (actual === null) {
      problems.push(`${key}: no count — the suite wrote no report, so it did not run`);
      continue;
    }
    summary.push(`${key} ${actual} (floor ${floor})`);
    if (actual < floor) {
      problems.push(
        `${key}: ${actual} tests against a floor of ${floor} — ${floor - actual} went missing`
      );
    }
  }
  return { summary: summary.join(" · "), problems };
}

/** The message a shrunk suite gets. Exported so `check-all.mjs` prints the same one. */
export function shortfallMessage(problems) {
  return (
    `\nFAILED: a suite is smaller than it was.\n\n  ${problems.join("\n  ")}\n\n` +
    `Tests move with the code they protect, in the same commit. If this deletion is\n` +
    `deliberate, lower the floor in site/scripts/check-test-floors.mjs alongside it\n` +
    `and say in the commit message which tests went and why.\n`
  );
}

// Only when run directly. `check-all.mjs` imports the functions above so the
// whole run reports its counts once, at the end, rather than twice.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const keys = process.argv.slice(2);
  if (!keys.length) {
    console.error(`Name the suites to check: ${Object.keys(FLOORS).join(" ")}`);
    process.exit(2);
  }
  const { summary, problems } = checkFloors(keys);
  if (summary) console.log(summary);
  if (problems.length) {
    console.error(shortfallMessage(problems));
    process.exit(1);
  }
}
