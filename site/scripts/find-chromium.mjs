#!/usr/bin/env node
/**
 * Find a Chromium that `verify_render.mjs` can actually launch.
 *
 * That suite is the only one that runs the app, and it skips rather than fails
 * where no browser can be launched — a contributor without one is not blocked,
 * and CI installs one. The choice has a sharp edge: a run with no browser exits
 * 0 having asserted nothing, so a green result can cover fourteen tests that
 * never loaded the page. That is the failure this file exists to close.
 *
 * **A single environment variable is not enough of an answer.** It is a step
 * every contributor and every agent has to remember on every run, and the cost
 * of forgetting is silent success — the worst shape a check can have. So the
 * toolchain looks for a browser rather than asking to be handed one.
 *
 * **Every candidate is proved by launching it.** The failure that matters here
 * is a browser directory present at a revision Playwright does not expect:
 * `PLAYWRIGHT_BROWSERS_PATH` holds `chromium-1194`, Playwright wants 1234, and
 * `chromium.launch()` fails pointing at a path that does not exist. No
 * file-existence check can see that, so this one starts a browser and closes
 * it. A second's work buys the only answer worth having.
 *
 * Run as a script it prints the resolved path on stdout, or explains the fix on
 * stderr and exits 1. `make render` gates on that exit code, which is what
 * makes a green `make check` mean the page was loaded.
 */
import { readdirSync, statSync, accessSync, constants } from "node:fs";
import { join, delimiter } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * What a Chromium binary is called on each platform Playwright ships for,
 * including the headless shell — it is a full browser for our purposes and it
 * is what a slim container image tends to have.
 */
const BROWSER_FILENAMES = new Set([
  "chrome",
  "chrome.exe",
  "chrome-headless-shell",
  "chrome-headless-shell.exe",
  "chromium",
  "chromium.exe",
  "Chromium",
  "Google Chrome",
]);

/**
 * Where a system package manager puts one, per platform.
 *
 * Anything Playwright manages itself is found by walking its own directory and
 * anything on `PATH` is found by resolving `PATH`, so this list is only for
 * browsers installed where neither looks.
 *
 * Windows needs its own entries and needs them built from the environment: the
 * program-files directories are localised and relocatable, so `C:\Program
 * Files` is a guess and `%ProgramFiles%` is the answer. A 32-bit Chrome on a
 * 64-bit machine lands in `%ProgramFiles(x86)%` and a per-user install lands in
 * `%LOCALAPPDATA%`, which is where Chrome puts itself when the installer runs
 * without administrator rights — the common case on a managed work laptop.
 *
 * **Edge counts.** It is Chromium with a different shell, Playwright drives it
 * through the same protocol, and it is on every Windows machine by default —
 * which on the one platform where a contributor is least likely to have run
 * `npx playwright install` is the difference between the render suite running
 * and the render suite being skipped. Every candidate here is still proved by
 * launching it, so an Edge that cannot be driven loses to the next entry.
 */
const WINDOWS_ROOTS = [
  process.env.ProgramFiles,
  process.env["ProgramFiles(x86)"],
  process.env.LOCALAPPDATA,
].filter(Boolean);

const SYSTEM_PATHS =
  process.platform === "win32"
    ? WINDOWS_ROOTS.flatMap((root) => [
        join(root, "Google", "Chrome", "Application", "chrome.exe"),
        join(root, "Chromium", "Application", "chrome.exe"),
        join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      ])
    : [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/local/bin/chromium",
        "/snap/bin/chromium",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ];

/**
 * Names worth resolving against `PATH`, for a browser installed anywhere else.
 *
 * The `.exe` forms are Windows-only and harmless elsewhere — a POSIX machine
 * has no `chrome.exe` to find, and listing them unconditionally costs one
 * `stat` per PATH entry against the alternative of a second platform branch.
 */
const PATH_NAMES = [
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
  "chrome.exe",
  "chromium.exe",
  "msedge.exe",
];

function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Executables under `dir` that are named like a Chromium.
 *
 * Depth-bounded rather than layout-matched: Playwright nests a browser two
 * levels down on Linux (`chromium-1194/chrome-linux/chrome`) and five inside a
 * macOS bundle, and the layout is theirs to change. Matching on the filename
 * within a bounded walk survives that; a hardcoded list of relative paths is a
 * list that goes stale on somebody else's release schedule.
 */
function walkForBrowsers(dir, depth = 6) {
  if (depth < 0) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkForBrowsers(path, depth - 1));
    else if (BROWSER_FILENAMES.has(entry.name) && isExecutableFile(path)) found.push(path);
  }
  return found;
}

function onPath() {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  return dirs.flatMap((dir) => PATH_NAMES.map((name) => join(dir, name))).filter(isExecutableFile);
}

/**
 * Candidates in the order they should win.
 *
 * `VYARNO_CHROMIUM` is first because an explicit setting is a decision, not a
 * hint — an environment that ships its own browser, or a machine where
 * `npx playwright install` is not wanted. `null` means "let Playwright use the
 * browser it manages", which is CI's case and the revision it pins. The
 * discovered paths come last, because a browser found by searching is a
 * fallback and should never quietly override a stated one.
 */
function candidates() {
  const managedRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return [
    ...(process.env.VYARNO_CHROMIUM ? [process.env.VYARNO_CHROMIUM] : []),
    null,
    ...(managedRoot && managedRoot !== "0" ? walkForBrowsers(managedRoot) : []),
    ...SYSTEM_PATHS.filter(isExecutableFile),
    ...onPath(),
  ].filter((path, i, all) => all.indexOf(path) === i);
}

/**
 * A launched Chromium and the path it came from, or `null` where none works.
 *
 * The caller owns the browser and has to close it. Handing back the live
 * instance rather than a path is what keeps the render suite to one launch:
 * the only proof that a candidate works is a browser, so throwing it away to
 * return a string would mean starting a second one.
 */
export async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    // Playwright is a devDependency. Without `npm install` there is no suite
    // to run here, and that is a setup problem rather than a missing browser.
    return null;
  }
  for (const executablePath of candidates()) {
    try {
      const browser = await chromium.launch(executablePath ? { executablePath } : {});
      return { browser, executablePath: executablePath ?? managedPath(chromium) };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function managedPath(chromium) {
  try {
    return chromium.executablePath();
  } catch {
    return "(Playwright-managed)";
  }
}

const NO_BROWSER = `No launchable Chromium found.

The render suite is the only one that runs the app, and with no browser it
skips and exits 0 — reporting success over fourteen tests that never loaded
the page. Install one:

    cd site && npx playwright install chromium

or point VYARNO_CHROMIUM at a browser already on this machine.`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const found = await launchChromium();
  if (!found) {
    console.error(NO_BROWSER);
    process.exit(1);
  }
  await found.browser.close();
  console.log(found.executablePath);
}
