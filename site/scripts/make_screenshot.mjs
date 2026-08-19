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
 * It writes two files. The PNG is the picture; `docs/img/screenshot.txt` is the
 * words that were inside the frame when it was taken, and it is what
 * `verify_render_screenshot.mjs` holds the built page to — so a copy edit that
 * reaches the frame goes red in the render suite rather than waiting for
 * somebody to notice the README.
 *
 * **Look at the result before committing it.** The words are checked and the
 * PIXELS are not, so a layout that broke without changing a word is still
 * something only a person sees.
 */
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { HEIGHT, SCALE, SIDECAR, WIDTH, frameText, poseForTheShot } from "./screenshot-frame.mjs";

const SITE = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(SITE, "dist");
const REPO = join(SITE, "..");
const OUT = join(REPO, "docs", "img", "screenshot.png");
const OUT_TEXT = join(REPO, SIDECAR);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

/** Serve `dist/` the way a static host does. Same shape as render-harness.mjs. */
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
await poseForTheShot(page);

if (errors.length) {
  console.error(`the page errored, refusing to photograph it:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}

await writeFile(OUT, await page.screenshot());

// The sidecar is what makes the image checkable. `verify_render_screenshot.mjs`
// re-poses this same page and compares, so a copy edit that reaches the frame
// fails the render suite instead of sitting in the README until somebody looks.
await writeFile(OUT_TEXT, `${await frameText(page)}\n`);

await browser.close();
site.server.close();

const { size } = await stat(OUT);
console.log(`wrote docs/img/screenshot.png (${size} bytes, ${WIDTH * SCALE}×${HEIGHT * SCALE})`);
console.log(`wrote ${SIDECAR} — the words the frame asserts`);
