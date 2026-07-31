#!/usr/bin/env node
/**
 * Post-build step: copy the published JSONs into dist/data/published/
 * so the production bundle is fully self-contained.
 *
 * vite.config.js's build.emptyOutDir wipes the entire dist/, so this
 * runs after `vite build` to repopulate the data dir.
 *
 * Source: ../data/published/*.json
 * Target: dist/data/published/*.json
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/copy-data.mjs lives at site/scripts/. The published JSONs are at
// <repo-root>/data/published/. From site/scripts/ that's ../../data/published.
const SRC = resolve(__dirname, "../../data/published");
const DEST = resolve(__dirname, "../dist/data/published");

const srcStat = await stat(SRC).catch(() => null);
if (!srcStat || !srcStat.isDirectory()) {
  console.error(`[copy-data] source not found: ${SRC}`);
  process.exit(1);
}

await mkdir(DEST, { recursive: true });

const files = await readdir(SRC);
let count = 0;
for (const f of files) {
  if (!f.endsWith(".json")) continue;
  await cp(join(SRC, f), join(DEST, f));
  count++;
}

console.log(`[copy-data] copied ${count} JSON files → ${DEST}`);
