#!/usr/bin/env node
/**
 * Post-build step: move source maps OUT of the deploy artefact.
 *
 * `build.sourcemap: true` emits `dist/assets/index-*.js.map` — hundreds of
 * kilobytes carrying `sourcesContent` for every module, `mirror.js` and
 * `view.js` verbatim, comments included. Minification is cosmetic while that
 * file is deployed: anyone opening devtools reads the original source.
 *
 * So the config sets `sourcemap: 'hidden'`, which still WRITES the maps but
 * omits the `//# sourceMappingURL=` comment from the bundle. That on
 * its own is not enough — the .map files are still inside `dist/`, and
 * `dist/` is what gets deployed. A map is trivially findable at the
 * conventional `<bundle>.js.map` path whether or not the comment points
 * at it. So this script moves them somewhere the deploy never sees.
 *
 * Why 'hidden' + move, rather than `sourcemap: false`: no maps at all
 * means production stack traces are unreadable — a minified frame with no
 * function name and no line number. Keeping the maps out of band means we
 * can upload them to an error-reporting service later (Sentry et al. take
 * exactly this artefact) and get readable traces back without ever
 * serving them from the web root. See docs/site.md §"Source maps".
 *
 * Where they go: site/.sourcemaps/ — gitignored, adjacent to the build,
 * regenerated on every build. Not a deploy path.
 *
 * This script FAILS THE BUILD if any readable source of ours survives in
 * dist/. That is the point: the protection has to be enforced by the
 * build, not by a convention someone remembers. See docs/site.md
 * §"Source maps stay out of the deploy artefact".
 */
import { mkdir, readdir, rename, rm, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative, sep } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");
const MAPS = resolve(__dirname, "../.sourcemaps");

/** Every file under `dir`, recursively, as absolute paths. */
async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const all = await walk(DIST);
if (all.length === 0) {
  console.error(`[strip-sourcemaps] dist/ is empty or missing: ${DIST}`);
  console.error(`[strip-sourcemaps] run \`vite build\` first`);
  process.exit(1);
}

// 1. Move every .map out of the artefact.
await rm(MAPS, { recursive: true, force: true });
await mkdir(MAPS, { recursive: true });

const maps = all.filter((f) => f.endsWith(".map"));
for (const m of maps) {
  // `relative()` returns platform-native separators (`\` on Windows, `/` on
  // POSIX); `replaceAll("/", "__")` only sees POSIX. Collapsing both means the
  // destination is a single filename under MAPS, which is what `rename` needs
  // on Windows — the destination directory exists, but nesting `assets\` under
  // it would require a second `mkdir` per source subdirectory.
  const dest = join(MAPS, relative(DIST, m).replaceAll(sep, "__"));
  await rename(m, dest);
}

// 2. Belt and braces: strip any `//# sourceMappingURL=` that survived.
//    `sourcemap: 'hidden'` should mean there are none, but a dependency
//    shipping its own pre-built map comment would leave a dangling
//    reference that 404s in every visitor's devtools.
let commentsStripped = 0;
for (const f of all.filter((f) => f.endsWith(".js") || f.endsWith(".css"))) {
  const before = await readFile(f, "utf8");
  const after = before
    .replace(/^\s*\/\/# sourceMappingURL=.*$/gm, "")
    .replace(/^\s*\/\*# sourceMappingURL=.*?\*\/\s*$/gm, "");
  if (after !== before) {
    await writeFile(f, after);
    commentsStripped++;
  }
}

// 3. Prove it. A map that came back under a different name, or a bundler
//    that inlined one as a data: URI, both defeat step 1 silently — so
//    assert the property we actually care about rather than the step we
//    took. `sourcesContent` is the field that carries readable source.
const survivors = [];
for (const f of await walk(DIST)) {
  if (f.endsWith(".map")) {
    survivors.push(`${relative(DIST, f)} (source map in the deploy artefact)`);
    continue;
  }
  if (!/\.(js|css|html)$/.test(f)) continue;
  const body = await readFile(f, "utf8");
  if (body.includes("sourcesContent")) {
    survivors.push(`${relative(DIST, f)} (inlined sourcesContent)`);
  }
  if (/sourceMappingURL=data:/.test(body)) {
    survivors.push(`${relative(DIST, f)} (inlined data: source map)`);
  }
}

if (survivors.length > 0) {
  console.error("[strip-sourcemaps] FAILED — readable source reaches dist/:");
  for (const s of survivors) console.error(`  - ${s}`);
  process.exit(1);
}

console.log(
  `[strip-sourcemaps] moved ${maps.length} map(s) → ${MAPS}` +
    (commentsStripped ? `, stripped ${commentsStripped} sourceMappingURL comment(s)` : "") +
    `, dist/ carries no sourcesContent`
);
