#!/usr/bin/env node
/**
 * `docs/site.md`'s directory tree names the files that are actually there.
 *
 * That tree is where a contributor meets this directory, and it is a list, so
 * it goes stale the way every hand-kept list goes stale: silently, in the
 * direction of omission. Nothing renders it, nothing imports it, and a file
 * added without a line in it looks exactly like a file that was never meant to
 * be there. The omissions that matter most are the ones a reader has no other
 * route to — the browser resolver, the floors and the runner are what
 * `AGENTS.md` cites as the reason a green run can be believed, and a
 * contributor reading the map to find out what is in `scripts/` should not
 * have to already know they exist.
 *
 * Both directions are checked, because they fail differently. A file on disk
 * and not in the tree is invisible. A file in the tree and not on disk sends
 * somebody looking for something that was deleted, which is worse than silence
 * because it reads as authoritative.
 *
 * ## Why a doc has a test here when prose does not
 *
 * `docs/testing-strategy.md` §"`docs/` is outside its roots" rules out pointing
 * a scanner at documentation, and that decision stands — it is about PROSE,
 * where a regex cannot tell a sentence describing this repository's edit
 * history from one describing an upstream that changed its publication regime,
 * and a guard that fires on legitimate text is one somebody silences.
 *
 * A list of filenames is not prose. `find-chromium.mjs` is either in
 * `scripts/` or it is not, the tree either names it or it does not, and there
 * is no reading of either that makes a mismatch correct. What is checkable here
 * is exactly the part with no judgement in it; the sentences beside each
 * filename are left alone, and reviewing those is still a person's job.
 *
 * Comments are stripped before any filename is read out of the tree, so the
 * paths inside them — `dist/sitemap.xml`, `../data/published/*.json` — describe
 * outputs without being mistaken for entries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const SITE_MD = join(SITE, "..", "docs", "site.md");

/** Extensions the tree spells out. A directory entry carries none of them. */
const NAMED = /[A-Za-z0-9_.-]+\.(?:mjs|js|py|svelte|css|json|txt|svg|png|xml|yml)/g;

/** Directories that are build output or vendored, and belong in no map. */
const SKIP = new Set(["node_modules", "dist", ".sourcemaps", "fonts", ".vite"]);

/** The fenced block that draws `site/`, with every `#` comment removed. */
function treeBody() {
  const md = readFileSync(SITE_MD, "utf8");
  const fenced = md.match(/```\n(site\/\n[\s\S]*?)```/);
  assert.ok(fenced, "docs/site.md no longer contains a fenced tree starting `site/`");
  return fenced[1]
    .split("\n")
    .map((line) => line.split("#")[0])
    .join("\n");
}

const NAMES_IN_TREE = new Set(treeBody().match(NAMED) ?? []);

/** Every filename under `site/`, ignoring build output. */
function filesUnder(dir, out = new Set()) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry === "package-lock.json") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) filesUnder(path, out);
    else out.add(entry);
  }
  return out;
}

const ON_DISK = filesUnder(SITE);

test("every script in site/scripts is named in the docs/site.md tree", () => {
  const missing = readdirSync(join(SITE, "scripts"))
    .filter((f) => !NAMES_IN_TREE.has(f))
    .sort();
  assert.deepEqual(
    missing,
    [],
    `${missing.join(", ")} is in site/scripts/ and not in the tree in docs/site.md — ` +
      "a contributor reading the map to find out what runs will not meet it"
  );
});

test("every page component and lib module is named in the docs/site.md tree", () => {
  const pages = readdirSync(join(SITE, "src")).filter((f) => f.endsWith(".svelte"));
  const lib = readdirSync(join(SITE, "src", "lib"));
  const missing = [...pages, ...lib].filter((f) => !NAMES_IN_TREE.has(f)).sort();
  assert.deepEqual(missing, [], `${missing.join(", ")} is in site/src/ and not in the tree`);
});

test("the docs/site.md tree names no file that is not there", () => {
  const ghosts = [...NAMES_IN_TREE].filter((f) => !ON_DISK.has(f)).sort();
  assert.deepEqual(
    ghosts,
    [],
    `the tree in docs/site.md names ${ghosts.join(", ")}, which is not under site/ — ` +
      "a map pointing at something deleted reads as authoritative and sends a reader looking"
  );
});
