#!/usr/bin/env node
/**
 * Regenerate `docs/img/screenshot.png` — the calculator as both READMEs show it.
 *
 * Run: `npm run build` then `node scripts/make_screenshot.mjs` from `site/`.
 *
 * Why this is a script and not a screenshot somebody took. A hand-made image
 * of a live UI is stale from the first copy edit and nothing says so: the shot
 * it replaces still showed «най-голямата хапка», a salary hint two rewrites
 * old, and an as-of banner reading `Данни към 27.07.2026 г.` — the download
 * date, where the page now names the month the prices are FROM. Four wrong
 * claims in the first image a stranger sees, none of them visible to any test.
 * A generator makes that a re-run.
 *
 * The figures in it are whatever `data/published/` holds, so the shot moves
 * with a refresh and never invents a number.
 *
 * **Look at the result before committing it.** Nothing downstream checks these
 * pixels, and a layout that broke is exactly what this image would advertise.
 */
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const SITE = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(SITE, "dist");
const OUT = join(SITE, "..", "docs", "img", "screenshot.png");

/**
 * The frame, and every number in it is a decision.
 *
 * The shot has to carry the whole claim in one image: figures typed on the
 * left, the reader's own rate and the per-group breakdown that sums to it on
 * the right. That is what both READMEs promise in their alt text, and a frame
 * tight enough to cut the breakdown off shows a form rather than a
 * calculator — so the height is set by how far down the ranked rows reach,
 * not by a round number.
 *
 * 1280 CSS px is the layout's comfortable desktop width. The page stays fluid
 * above it and the two cards keep stretching, which lengthens every line of
 * body copy for no gain; below ~960 the columns stack and the arrangement the
 * alt text describes stops being true.
 *
 * 1.5× is the compromise the display size forces. GitHub renders a README
 * image at about 900 px wide whatever it is given, so the source only has to
 * survive that downscale — and 2× at this width would be a 3 MB PNG in a
 * repository that ships an 1,800-byte favicon.
 */
const WIDTH = 1280;
const HEIGHT = 1180;
const SCALE = 1.5;

/**
 * What is typed in, and why it is not the page defaults.
 *
 * The defaults leave the raise empty, and an empty raise makes «в джоба» read
 * "enter a raise" — the one row that shows what the calculator is FOR, blank in
 * the shot that has to sell it. A salary above the Sofia average also puts the
 * comparator on its positive branch, so the strip shows a verdict rather than
 * an em dash. Round numbers on purpose: nothing here is a claim about anyone.
 */
const INPUTS = [
  ["#inSalary", "1600"],
  ["#inRaise", "5"],
  ["#inCash", "1000"],
];

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

/** Serve `dist/` the way a static host does. Same shape as verify_render.mjs. */
function serveDist() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split("?")[0]));
    if (path.includes("..")) {
      res.writeHead(400).end();
      return;
    }
    for (const candidate of [join(DIST, path), join(DIST, path, "index.html")]) {
      try {
        if (!(await stat(candidate)).isFile()) continue;
        res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(candidate)] ?? "text/plain" });
        res.end(await readFile(candidate));
        return;
      } catch {
        /* try the next candidate */
      }
    }
    res.writeHead(404).end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

try {
  await stat(join(DIST, "index.html"));
} catch {
  console.error("no dist/ — run `npm run build` first");
  process.exit(1);
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.VYARNO_CHROMIUM || undefined });
const site = await serveDist();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});

// A page error here would be photographed rather than reported, so it stops
// the run instead.
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`http://127.0.0.1:${site.port}/`, { waitUntil: "networkidle" });
for (const [selector, value] of INPUTS) await page.fill(selector, value);

// Filling leaves the caret in the last field, and a focus ring plus number
// spinners on one arbitrary input photograph as "this box is the important
// one". Nothing is selected in the state a visitor arrives in.
await page.evaluate(() => document.activeElement?.blur());

// The inputs are debounced and the basket re-renders off them; without the
// settle the shot catches the previous figures beside the new ones.
await page.waitForTimeout(600);
await page.evaluate(() => window.scrollTo(0, 0));

if (errors.length) {
  console.error(`the page errored, refusing to photograph it:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}

await writeFile(OUT, await page.screenshot());
await browser.close();
site.server.close();

const { size } = await stat(OUT);
console.log(`wrote docs/img/screenshot.png (${size} bytes, ${WIDTH * SCALE}×${HEIGHT * SCALE})`);
