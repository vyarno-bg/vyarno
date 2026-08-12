#!/usr/bin/env node
/**
 * No suite is allowed to get smaller.
 *
 * ## Why this exists rather than a number in a doc
 *
 * A count written into prose is a count nothing updates. Spread it across the
 * agent instructions, the pull-request template and whatever else greets a
 * contributor, and every copy drifts on its own schedule the moment anybody
 * adds a test — nothing makes them move together, so most of them end up
 * disagreeing with the run. A number that is stale more often than not is one a
 * reader learns to skip past, and that costs the check the only thing it was
 * for. So the counts live here, and what they are checked against is the report
 * each suite writes about itself.
 *
 * ## Floors, not exact counts — and a floor has to stay near the run
 *
 * The failure worth catching is a suite that SHRANK: an assertion deleted to
 * make something pass, a file dropped from the runner's argument list, a suite
 * that silently stopped running. A count going up is somebody doing their job.
 *
 * So these are minimums, and adding tests needs no bookkeeping — which is
 * exactly where `AGENTS.md` wants a person to stop and think rather than
 * quietly edit a number:
 *
 *   > never widen a validation tolerance, delete an assertion or skip a test to
 *   > make something pass
 *
 * That only holds while the minimum is near the count it is checking. A rule
 * for lowering a floor and no rule for raising one moves in one direction:
 * every commit that adds a test widens the gap and nothing ever narrows it. Far
 * enough below the run, a floor stops being a guard — a suite can lose half its
 * tests and still clear a number set when it was half the size, which is this
 * file's own failure passing.
 *
 * So there are two ways to fail here:
 *
 *   - **the count is below the floor** — a suite got smaller. Lower the floor
 *     only in the same commit as the deletion that made it necessary, and say
 *     in the commit message which tests went and why.
 *   - **the floor has fallen further than `DRIFT_ALLOWED` behind the count** —
 *     it is no longer guarding anything. Raise it to what the run reported.
 *
 * The band is what it is because of what the alternatives cost. Ratcheting to
 * the observed count on every green run means the run rewrites this file, so
 * CI writes to the tree it is checking and every commit that adds a test
 * carries an edit nobody made. Raising by hand on every addition is precisely
 * the bookkeeping floors exist to avoid, and bookkeeping nobody needs is
 * bookkeeping done wrong. A band asks for one edit per fifth of growth and buys
 * a bound on how far the guard can rot: no suite can quietly lose more than a
 * fifth of itself, whatever anybody forgets.
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
 * ## A count is what a suite ASSERTED, never what it started
 *
 * **A skipped test asserted nothing, so it may not hold a floor up.** Turning a
 * test into a skip is the same deletion as removing it — the assertion stops
 * running either way, and the one that leaves the count untouched is the one
 * nothing catches. Each suite's count therefore has to exclude its skips, and
 * the two report formats state that differently: TAP's `# pass` line already
 * counts only what passed, while junit-xml's `tests` attribute is the size of
 * the run and carries skips inside it.
 *
 * That is a third way to be short of a floor and it is not either of the two
 * above: the suite ran, it wrote its report, and part of what it reported
 * asserted nothing. The same failure `docs/testing-strategy.md` §"Running
 * everything" names for the render suite — a file of skips exits 0 and looks
 * exactly like a file of passes — reaches whichever suite is counted by its
 * run size.
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

/**
 * What a TAP report asserted. `# pass` is the plan footer's passing count, and
 * it already excludes skips — `node:test` totals them on their own `# skipped`
 * line — so there is nothing to take off.
 *
 * @param {string} text
 * @returns {number|null}
 */
const tapPassed = (text) => {
  const found = /^# pass (\d+)$/m.exec(text);
  return found ? Number(found[1]) : null;
};

/**
 * What a junit-xml report asserted. `tests` is the size of the run and counts
 * skips among it, so the skips come back off: a skipped test asserted nothing
 * and may not hold a floor up.
 *
 * Both attributes are required rather than defaulting `skipped` to zero. A
 * report naming one and not the other is a format this does not understand,
 * and reading a run size as an assertion count is the one thing the
 * subtraction exists to prevent — guessing at the half that is missing is how
 * it would happen anyway.
 *
 * `errors` stays out of the arithmetic. An errored test already fails the run
 * on its own, and subtracting it here would report the same failure twice, the
 * second time as a suite that shrank.
 *
 * @param {string} text
 * @returns {number|null}
 */
const junitAsserted = (text) => {
  const ran = /tests="(\d+)"/.exec(text);
  const skipped = /skipped="(\d+)"/.exec(text);
  return ran && skipped ? Number(ran[1]) - Number(skipped[1]) : null;
};

/** THE ONLY TEST COUNTS IN THE REPOSITORY. Read the header before changing one. */
export const FLOORS = {
  pytest: { floor: 399, report: join(ROOT, ".report-pytest.xml"), count: junitAsserted },
  node: { floor: 517, report: join(SITE, ".report-node.tap"), count: tapPassed },
  render: { floor: 124, report: join(SITE, ".report-render.tap"), count: tapPassed },
};

/**
 * How far a floor may fall behind the count before it is not a floor any more.
 *
 * A fifth, because the number has to be loose enough that ordinary work does
 * not trip it and tight enough that the guard still means something. At this
 * band a suite cannot quietly lose more than a fifth of itself, and a
 * contributor is asked to raise a floor roughly once per fifth the suite grows
 * — one line, in the commit that grew it.
 */
export const DRIFT_ALLOWED = 0.2;

/** The lowest a floor may sit while still guarding a suite of `actual` tests. */
export const floorFor = (actual) => Math.ceil(actual * (1 - DRIFT_ALLOWED));

/**
 * What a suite asserted, or null when it left no usable report.
 *
 * `null` rather than 0, because "did not run" and "ran and passed nothing" are
 * different failures and only one of them is reachable by deleting tests.
 *
 * @param {keyof typeof FLOORS} key
 * @returns {number|null}
 */
export function counted(key) {
  const { report, count } = FLOORS[key];
  if (!existsSync(report)) return null;
  return count(readFileSync(report, "utf8"));
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
    } else if (floor < floorFor(actual)) {
      problems.push(
        `${key}: floor ${floor} is stale against ${actual} tests — raise it to ${actual}, ` +
          `it currently permits losing ${actual - floor} of them`
      );
    }
  }
  return { summary: summary.join(" · "), problems };
}

/** The message a failing floor gets. Exported so `check-all.mjs` prints the same one. */
export function floorsMessage(problems) {
  return (
    `\nFAILED: a floor is not doing its job.\n\n  ${problems.join("\n  ")}\n\n` +
    `A count BELOW its floor means a suite is smaller than it was. Tests move with\n` +
    `the code they protect, in the same commit — if the deletion is deliberate, lower\n` +
    `the floor in site/scripts/check-test-floors.mjs alongside it and say in the commit\n` +
    `message which tests went and why.\n\n` +
    `A STALE floor means the suite outgrew it and it now guards nothing. Raise it to\n` +
    `the count the run reported, in the commit that grew the suite.\n`
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
    console.error(floorsMessage(problems));
    process.exit(1);
  }
}
