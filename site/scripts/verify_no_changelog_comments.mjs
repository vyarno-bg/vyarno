#!/usr/bin/env node
/**
 * No comment in this repository narrates its own edit history.
 *
 * `docs/writing-style.md` has said "never write a changelog into the source"
 * since the beginning, and the repository accumulated about two hundred
 * sentences doing exactly that anyway — `// it used to be 92 days`,
 * `// this line previously named ilc_di01`, `// the EN side used to read`. The
 * rule was stated and nothing was checking it, which is the condition under
 * which a rule quietly stops being one.
 *
 * **Why it matters more here than in most repositories.** This one publishes
 * without its history. A reader who hits `// it used to be 92 days` has no
 * `git log` to consult, no commit to blame, no way to find out what changed or
 * why — so the sentence costs them attention and returns nothing. The same
 * sentence in a repository with ten years of history is merely redundant.
 *
 * **What is being banned is the framing, not the reasoning.** This codebase
 * comments the why at length on purpose: a rule with no failure attached is one
 * somebody will reasonably decide to relax. Every one of those failures can be
 * stated in the present tense as a property the code has to keep —
 *
 *   before  // It used to be 92 days, tracking the НСИ anchor. The split left
 *           // the quarterly clock behind running against a figure nobody can
 *           // refresh, so the banner would have fired on 2026-12-10.
 *   after   // SES publishes every four years, so a quarterly cadence here
 *           // reports a payload nobody can refresh as overdue. A banner that
 *           // fires when nothing is wrong is worse than no banner.
 *
 * — and the second is shorter, survives the next change, and tells a reader
 * what they may not do. The first tells them what somebody already did.
 *
 * **Scope.** Comments only. The phrases below are ordinary Bulgarian and
 * English and appear legitimately in user-facing copy — the privacy notice says
 * a practice is "no longer" done, and that is a statement to a reader about the
 * service, not a note to a maintainer about a diff. So this reads comments and
 * never string literals, which is what `extractComments` is for.
 *
 * `docs/legal.md` is deliberately exempt and the exemption is narrow: its
 * retractions are dated records of what an upstream licence said and what a
 * previous reading of it got wrong. That is evidence, not archaeology, and the
 * document argues its own case for keeping them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, extname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

/** Directories that hold no source of ours. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".venv",
  "dist",
  "build",
  ".sourcemaps",
  "__pycache__",
  ".pytest_cache",
  "fixtures",
]);

const CODE = new Set([".js", ".mjs", ".svelte", ".css", ".py"]);

/**
 * The tells, each one a sentence that can only be about a previous state of
 * this repository. Deliberately narrow: a phrase that also has an innocent
 * present-tense reading is a phrase that trains people to add exemptions.
 */
const TELLS = [
  /\bused to\b/i,
  /\bno longer\b/i,
  /\bpreviously\b/i,
  /\bat one point\b/i,
  /\boriginally\b/i,
  /\bhad been\b/i,
  /\bchanged from\b/i,
  /\brenamed from\b/i,
  /\bwas replaced\b/i,
  /\bsince removed\b/i,
  /\bleft behind\b/i,
  /\bthis (?:file|line|comment|section|document|test|check) (?:used|once)\b/i,
  /\bwe (?:used to|once)\b/i,
  /\bbefore the (?:split|rename|refactor|move)\b/i,
  // Bulgarian, for the copy modules and the Svelte markup comments.
  /\bпреди се\b/i,
  /\bпо-рано\b/i,
  /\bвече не\b/i,
];

/**
 * Every comment in a source file, as `{line, text}`.
 *
 * A tolerant scanner rather than a parser, because the repository ships no
 * parser and may not gain one to satisfy a lint. It tracks string state so a
 * `//` inside a URL or a `#` inside a Bulgarian string is not read as a
 * comment, which is the only way this check can be trusted on `content.js`.
 *
 * @param {string} src
 * @param {string} ext
 * @returns {Array<{line: number, text: string}>}
 */
export function extractComments(src, ext) {
  const py = ext === ".py";
  const out = [];
  let i = 0;
  let line = 1;
  const push = (startLine, text) => out.push({ line: startLine, text });

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }

    // Python docstrings and JS template/quoted strings.
    if (py && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.slice(i, i + 3);
      const end = src.indexOf(q, i + 3);
      const stop = end === -1 ? src.length : end + 3;
      // A docstring IS a comment for our purposes — it is prose for a reader.
      push(line, src.slice(i, stop));
      for (let k = i; k < stop; k++) if (src[k] === "\n") line++;
      i = stop;
      continue;
    }

    if (c === '"' || c === "'" || (!py && c === "`")) {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "\n") line++;
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (py && c === "#") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      push(line, src.slice(i, stop));
      i = stop;
      continue;
    }

    if (!py && c === "/" && next === "/" && src[i - 1] !== ":") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      push(line, src.slice(i, stop));
      i = stop;
      continue;
    }

    if (!py && c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      push(line, src.slice(i, stop));
      for (let k = i; k < stop; k++) if (src[k] === "\n") line++;
      i = stop;
      continue;
    }

    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end === -1 ? src.length : end + 3;
      push(line, src.slice(i, stop));
      for (let k = i; k < stop; k++) if (src[k] === "\n") line++;
      i = stop;
      continue;
    }

    i++;
  }
  return out;
}

/** Every source file under `dir`, recursively. */
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (CODE.has(extname(name))) acc.push(full);
  }
  return acc;
}

const FILES = [join(ROOT, "site", "src"), join(ROOT, "site", "scripts"), join(ROOT, "pipeline")]
  .flatMap((d) => walk(d))
  .filter((f) => f !== fileURLToPath(import.meta.url));

test("no source comment describes an earlier version of this code", () => {
  const found = [];
  for (const file of FILES) {
    const src = readFileSync(file, "utf-8");
    for (const { line, text } of extractComments(src, extname(file))) {
      for (const tell of TELLS) {
        const m = tell.exec(text);
        if (!m) continue;
        found.push(`${relative(ROOT, file)}:${line} — "${m[0]}"`);
        break;
      }
    }
  }
  assert.deepEqual(
    found,
    [],
    "these comments narrate the repository's own edit history:\n  " +
      found.join("\n  ") +
      "\n\nState the constraint in the present tense instead. The reasoning is " +
      "worth keeping and the sentence that says what somebody already changed " +
      "is not — this repository publishes without its history, so a reader has " +
      "no commit to look the story up in. docs/writing-style.md §Code comments."
  );
});

test("the comment scanner reads comments and not the strings beside them", () => {
  // Without this the check is unfalsifiable: a scanner that silently returns
  // nothing passes the suite above on any repository at all. It also has to
  // stay off string literals, because the shipped legal copy legitimately tells
  // a reader that a practice is not done, in both languages.
  const js = [
    'const url = "https://example.com/a//b";',
    'const copy = { bg: "вече не събираме", en: "we no longer collect" };',
    "// it used to be 92 days",
    "/* multi\n   previously a quarterly clock */",
  ].join("\n");
  const comments = extractComments(js, ".js");
  assert.equal(comments.length, 2, "expected exactly the two real comments");
  assert.match(comments[0].text, /used to be 92/);
  assert.equal(comments[0].line, 3);
  assert.match(comments[1].text, /previously a quarterly/);

  const py = ['x = "# not a comment"', "# originally a loop", '"""A docstring."""'].join("\n");
  const pyComments = extractComments(py, ".py");
  assert.equal(pyComments.length, 2);
  assert.match(pyComments[0].text, /originally a loop/);

  const svelte = ["<!-- this used to render a pill -->", "<p>no longer shown</p>"].join("\n");
  assert.equal(extractComments(svelte, ".svelte").length, 1);
});
