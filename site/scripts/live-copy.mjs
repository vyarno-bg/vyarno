/**
 * Reading the project's prose as text, with comments blanked.
 *
 * Two suites scan prose for claims, and they need the same two guarantees out
 * of the reader or they are not checking what their names say:
 *
 * 1. **Comments are blanked before anything else happens.** A comment
 *    describing a defect must never satisfy the test for its fix, and this
 *    file's own callers are the proof of the trap — a retired phrasing is
 *    quoted verbatim in the comment explaining why it was retired, three lines
 *    above the string that replaced it.
 * 2. **Blanking runs per file, on text that still has line breaks.** The `//`
 *    pass works line by line, so whitespace-normalising first hands it one
 *    line, blanks nothing, and every `//` comment in the tree counts as live
 *    code for the rest of the run.
 *
 * It is a module rather than a copy in each suite for `scripts/near.mjs`'s
 * reason: two copies of a scanner drift, and the one that drifts is the one
 * whose suite nobody edited that week.
 */
import { readFileSync, readdirSync } from "node:fs";

/**
 * `src` with its comments blanked.
 *
 * Markup comments, block comments and whole-line `//` comments all go;
 * trailing `//` is left alone so a `https://` inside a string literal
 * survives.
 *
 * @param {string} src
 * @returns {string}
 */
export function blankComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}

/**
 * Directories a source scan must never descend into.
 *
 * `dist/` is the trap, and it is not a performance one: a built page is the
 * PREVIOUS build's copy, so a scan reaching it fails on wording the tree no
 * longer contains and passes once somebody rebuilds. That is a check answering
 * a question about an artefact while reading as one about the source.
 */
const SKIP = new Set(["node_modules", "dist", ".git", ".svelte-kit", "coverage"]);

/**
 * Every file under `dir` matching `pattern`, comments blanked, concatenated
 * and whitespace-normalised.
 *
 * Normalised because these checks are about which names appear near each
 * other, not about where Prettier chose to break the line.
 *
 * @param {string} dir  directory to walk
 * @param {RegExp} pattern  tested against each file's basename
 * @returns {string}
 */
export function readSources(dir, pattern = /\.(svelte|js)$/) {
  const parts = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const path = `${d}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (pattern.test(entry.name)) parts.push(blankComments(readFileSync(path, "utf8")));
    }
  };
  walk(dir);
  return parts.join("\n").replace(/\s+/g, " ");
}
