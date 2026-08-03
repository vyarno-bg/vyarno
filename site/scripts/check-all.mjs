#!/usr/bin/env node
/**
 * Everything CI runs, in CI's order, on any platform.
 *
 * `make check` is the same thing and is not available to everyone: GNU Make is
 * not part of a Windows install, and under cmd.exe the Makefile refuses rather
 * than half-working (see the guard at the top of it). That left a Windows
 * contributor running nine commands by hand and reading five separate counts,
 * which is not a check — it is a checklist, and the step people skip is the
 * expensive one. This file is the one command.
 *
 *     cd site && npm run check:all
 *
 * **`Makefile` delegates its `lint`, `test`, `render` and `check` targets
 * here**, so the sequence has one home. Two runners with two copies of the
 * command list is the drift this avoids: the copy nobody uses goes stale, and
 * it goes stale silently because the person who changed the other one had no
 * reason to open it.
 *
 * Two deliberate differences from CI, inherited from the Makefile and repeated
 * here because this file is now where they live:
 *
 *   - `build:release` rather than `build`. The two differ only in
 *     `check-identity.mjs`, which WARNS under one and FAILS under the other.
 *     CI must not go red over a legal fact — a branch preview is not a
 *     publication — but this runs immediately before a change is opened, which
 *     is the right moment to be told the published identity would not be true.
 *   - The render suite may not be skipped. `npm run test:render` exits 0 with
 *     no browser, having asserted nothing, so `find-chromium.mjs` runs first
 *     and a machine with no browser is told in a second rather than after a
 *     production build it is about to throw away.
 *
 * Both make this stricter than CI, in the same direction: green here implies
 * green there and never the reverse.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
// The test counts live in one file, and it is not this one — see its header for
// why they are floors and why they are not written into any doc. CI calls the
// same script directly, because it runs the suites itself rather than through
// this orchestrator.
import { FLOORS, checkFloors, floorsMessage } from "./check-test-floors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(__dirname, "..");
const ROOT = resolve(SITE, "..");

const isWindows = process.platform === "win32";

// A virtualenv puts its executables in `Scripts` on Windows and `bin`
// everywhere else, and gives them a `.exe` suffix there. Resolved rather than
// assumed because the alternative is `ruff: command not found` for anyone who
// has not also installed the tools globally — which is everyone who followed
// the setup instructions.
const VENV = join(ROOT, "pipeline", ".venv", isWindows ? "Scripts" : "bin");
const exe = (name) => join(VENV, isWindows ? `${name}.exe` : name);

const SETUP_HINT = isWindows
  ? "  cd pipeline\n" +
    "  python -m venv .venv\n" +
    "  .\\.venv\\Scripts\\Activate.ps1\n" +
    "  pip install -r requirements-dev.txt\n" +
    "  pip install -e . --no-deps\n" +
    "  cd ..\\site && npm install"
  : "  make setup";

/**
 * The stages, and what each one is allowed to assume about the one before.
 *
 * `render` depends on `build` having just run — it loads `dist/`, so a stale
 * bundle means asserting against a build nobody made from the source in front
 * of them. Keeping the build inside the render stage rather than beside it is
 * what makes that ordering impossible to get wrong from the command line.
 */
const STAGES = {
  lint: [
    [exe("ruff"), ["check", "."], ROOT],
    [exe("ruff"), ["format", "--check", "."], ROOT],
    ["npm", ["run", "lint"], SITE],
    ["npm", ["run", "check"], SITE],
  ],
  test: [
    [
      exe("pytest"),
      [
        "-q",
        "--rootdir",
        "pipeline",
        join("pipeline", "tests"),
        `--junitxml=${FLOORS.pytest.report}`,
      ],
      ROOT,
    ],
    ["npm", ["run", "verify:math"], SITE],
  ],
  render: [
    ["node", [join("scripts", "find-chromium.mjs")], SITE],
    ["npm", ["run", "build:release"], SITE],
    ["npm", ["run", "test:render"], SITE],
  ],
};

/** Which floors a stage is answerable for. */
const COUNTED_BY_STAGE = { lint: [], test: ["pytest", "node"], render: ["render"] };

const ORDER = ["lint", "test", "render"];

const requested = process.argv[2] ?? "all";
const stages = requested === "all" ? ORDER : [requested];
for (const stage of stages) {
  if (!STAGES[stage]) {
    console.error(`Unknown stage "${stage}". Use one of: ${ORDER.join(", ")}, all.`);
    process.exit(2);
  }
}

if (!existsSync(exe("ruff")) || !existsSync(exe("pytest"))) {
  console.error(
    `The Python toolchain is not installed — no ruff or pytest under\n` +
      `${VENV}\n\nRun:\n\n${SETUP_HINT}\n`
  );
  process.exit(1);
}

// A report left behind by an earlier run would be read as this one's, and a
// suite that failed to start would then pass its own floor on last week's
// number. Removed before the stage that writes it, never after.
for (const stage of stages) {
  for (const key of COUNTED_BY_STAGE[stage]) rmSync(FLOORS[key].report, { force: true });
}

for (const stage of stages) {
  for (const [command, args, cwd] of STAGES[stage]) {
    console.log(`\n> ${command} ${args.join(" ")}`);
    // Windows: npm is `npm.cmd`, and since the CVE-2024-27980 fix Node refuses
    // to spawn a `.cmd` without a shell. Only the npm calls need it; the venv
    // executables and node are real binaries, and handing those to a shell
    // would put a path containing spaces at the mercy of its quoting.
    const viaShell = isWindows && command === "npm";
    const result = spawnSync(viaShell ? "npm.cmd" : command, args, {
      cwd,
      stdio: "inherit",
      shell: viaShell,
    });
    if (result.error) {
      console.error(`\n${command} could not be started: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      // A child killed by a signal reports status null, and exiting 0 on that
      // would report a run that never finished as a run that passed.
      console.error(`\nFAILED at: ${command} ${args.join(" ")}`);
      process.exit(result.status ?? 1);
    }
  }
}

// The counts, and the floors they had to clear. Reported at the end rather
// than left for the reader to find: three suites print three summaries hundreds
// of lines apart, and the one that matters is whichever shrank.
const { summary, problems } = checkFloors(stages.flatMap((stage) => COUNTED_BY_STAGE[stage]));
if (summary) console.log(`\n${summary}`);
if (problems.length) {
  console.error(floorsMessage(problems));
  process.exit(1);
}

console.log("\nAll green.");
