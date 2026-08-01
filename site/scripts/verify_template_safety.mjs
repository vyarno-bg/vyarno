/**
 * Why `svelte/no-at-html-tags` is switched off, expressed as a test.
 *
 * The SPA renders ~60 `{@html …}` interpolations. That rule exists to catch
 * attacker-controlled strings reaching the DOM as markup, and switching it off
 * without evidence would be exactly the kind of thing it is there to prevent.
 * The evidence is two invariants, checked here on every run:
 *
 *   1. The app has no free-text input surface at all. Every control is a
 *      number, range, checkbox or radio, and there is no `<textarea>` and no
 *      `contenteditable`. Nothing a visitor types can be anything but a number.
 *
 *   2. Every `{@html …}` expression is rooted in an in-repo constant — a `COPY`
 *      key from `src/lib/content.js`, or a paragraph from the legal documents
 *      in `src/lib/legal.js`.
 *
 *   3. Every value substituted into one of those templates goes through a
 *      formatter that constrains its shape. This is the half that is easy to
 *      lose: the templates are ours, but a reference period, a source URL and
 *      a maturity limit all arrive in a published payload, and three of them
 *      were being interpolated raw beside copy that carries markup. `period()`
 *      and `httpUrl()` in $lib/format.js exist for exactly this.
 *
 * Together there is no path from a string this repository does not control to
 * the DOM as markup.
 *
 * If either invariant stops holding — someone adds a text field, or renders a
 * fetched string as markup — this fails, and the right response is to escape
 * the value or turn the ESLint rule back on, not to relax the test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { COPY } from "../src/lib/content.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Every .svelte file under src/, as { name, text }. */
function readComponents() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".svelte")) {
        out.push({ name: path.slice(SRC.length + 1), text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(SRC);
  return out;
}

/** Read once: the scans below are read-only and there are three of them. */
const COMPONENTS = readComponents();

/** Every component as one string — the markup-bearing COPY scan reads the tree. */
const ALL_SOURCE = COMPONENTS.map((c) => c.text).join("\n");

/** Markup comments, blanked so an example inside one is not scanned as code. */
function withoutComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, " "));
}

/**
 * The expressions inside `{@html …}`, with nested braces balanced so a
 * `t(COPY.x, $lang, { n: 1 })` call is captured whole rather than cut at its
 * first `}`.
 */
function atHtmlExpressions(source) {
  const text = withoutComments(source);
  const found = [];
  const OPEN = "{@html";
  for (let i = text.indexOf(OPEN); i !== -1; i = text.indexOf(OPEN, i + 1)) {
    let depth = 1;
    let j = i + OPEN.length;
    for (; j < text.length && depth > 0; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
    }
    found.push({
      index: i,
      expression: text
        .slice(i + OPEN.length, j - 1)
        .trim()
        .replace(/\s+/g, " "),
    });
  }
  return found;
}

/**
 * Leaf shapes allowed to produce markup. Each roots the string in a module of
 * in-repo constants:
 *   `t(COPY.key, …)`               content.js, with numeric substitutions
 *   `t(cond ? COPY.a : COPY.b, …)` same, choosing between two COPY keys
 *   `COPY.key.bg.replace(…)`       same, substituting one bolded number
 *   `para.bg` / `para.en`          a legal.js paragraph flagged `html: true`
 *
 * A shape not listed here fails the test by design: a new way of producing
 * markup is a decision that should be made deliberately and written down,
 * not inherited from a pattern that happened to pass a looser regex.
 */
const ROOTED_LEAVES = [
  /^t\(\s*COPY\./,
  /^t\(\s*[^?]*\?\s*COPY\.[A-Za-z0-9_]+\s*:\s*COPY\./,
  /^COPY\.[A-Za-z0-9_]+\.(bg|en)\b/,
  /^para\.(bg|en)$/,
];

/**
 * Split a ternary into its two branches, or return null if it is not one.
 *
 * Counts the `?`s still open so a nested ternary splits at ITS own colon: the
 * rent-burden copy is `a ? b ? c : d : e`, and pairing the first `?` with the
 * first `:` would hand back two fragments that parse as nothing.
 */
function splitTernary(expression) {
  let depth = 0;
  let pending = 0;
  let question = -1;
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (depth === 0 && ch === "?") {
      if (question === -1) question = i;
      pending++;
    } else if (depth === 0 && ch === ":" && question !== -1) {
      if (--pending === 0) {
        return [expression.slice(question + 1, i).trim(), expression.slice(i + 1).trim()];
      }
    }
  }
  return null;
}

/**
 * Split a top-level `+` concatenation into its operands, or null if there is
 * none. Strings and any depth of brackets are skipped, so the `+` inside
 * `.replace("{k}", a + b)` or a `"a+b"` literal is not a split point — only a
 * `+` joining two whole expressions is.
 */
function splitConcat(expression) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let str = null;
  let found = false;
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i];
    if (str) {
      if (ch === str && expression[i - 1] !== "\\") str = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      str = ch;
    } else if ("([{".includes(ch)) {
      depth++;
    } else if (")]}".includes(ch)) {
      depth--;
    } else if (depth === 0 && ch === "+") {
      parts.push(expression.slice(start, i).trim());
      start = i + 1;
      found = true;
    }
  }
  if (!found) return null;
  parts.push(expression.slice(start).trim());
  return parts;
}

/**
 * True when every branch that can produce the rendered string is a rooted leaf.
 * The ternary condition itself is not checked — it decides *which* constant is
 * rendered, it is not rendered.
 *
 * A top-level `+` is rooted only when EVERY operand is. Without that check the
 * leaf regexes — which match a PREFIX, so a `.replace(…)` chain still passes —
 * would also pass `COPY.x.bg + payload.source_url`, laundering a runtime-fetched
 * string into the DOM as markup behind a rooted head. Ternary is split first
 * because it binds looser than `+`, so `cond ? COPY.a.bg : COPY.b.bg + x` is
 * two branches, and the `+` is caught when the second branch recurses.
 */
function isRooted(expression) {
  const branches = splitTernary(expression);
  if (branches !== null) return branches.every(isRooted);
  const parts = splitConcat(expression);
  if (parts !== null) return parts.every(isRooted);
  return ROOTED_LEAVES.some((re) => re.test(expression));
}

test("a rooted head does not launder an unrooted value concatenated after it", () => {
  // The regression: the leaf regexes match a prefix, so before `splitConcat`
  // `COPY.x.bg + evil` passed as "rooted" and a fetched string could reach the
  // DOM as markup. A method chain has no top-level `+` and must still pass; a
  // concatenation of two constants is still safe; a constant plus anything else
  // is not.
  assert.equal(isRooted("COPY.homeYearsSrc.bg"), true);
  assert.equal(isRooted('COPY.statSofiaDiff.bg.replace("{delta}", `<b>${d}</b>`)'), true);
  assert.equal(isRooted("COPY.a.bg + COPY.b.bg"), true);
  assert.equal(isRooted("COPY.x.bg + (data.sofiaPrice?.source_url ?? '')"), false);
  assert.equal(isRooted("COPY.x.bg + fetchedMarkup"), false);
});

test("every {@html} expression is rooted in an in-repo constant", () => {
  const offenders = [];
  for (const { name, text } of COMPONENTS) {
    for (const { index, expression } of atHtmlExpressions(text)) {
      if (!isRooted(expression)) {
        const line = withoutComments(text).slice(0, index).split("\n").length;
        offenders.push(`${name}:${line} → ${expression.slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "These {@html} interpolations render something other than a COPY key or a legal\n" +
      "paragraph. `svelte/no-at-html-tags` is disabled on the strength of that\n" +
      "invariant, so either escape the value or re-enable the rule:\n  " +
      offenders.join("\n  ")
  );
});

/**
 * The identifiers allowed to produce a *value* substituted into an `{@html}`
 * template. Everything here either formats a number or picks a string from a
 * literal table in this repository.
 */
// `rateSourceLabel` and `deltaPhrase` are component-local functions that
// assemble a clause out of a COPY string and an already-formatted number, and
// return nothing else. They are named here rather than matched by shape because
// that is the only way this check can see through a call — and the alternative,
// splicing the clause together from separate holes in the template, is what
// produced «-39% под средната». Add a name here only when the function's whole
// body is COPY plus formatter output.
const SAFE_VALUE_SOURCES =
  /^(fmt0?|fmtDate|signedPct|period|httpUrl|Math\.\w+|Number\.\w+|t|COPY|HOME|rateSourceLabel|deltaPhrase|String)\b/;

/**
 * The `{@const NAME = …}` bindings a component declares, as name → expression.
 *
 * A substitution is often a local built one line above the interpolation
 * (`{@const mort = fmt0(monthlyMort)}`), so resolving these is what lets the
 * check see the formatter behind the name.
 */
function localConsts(source) {
  const out = new Map();
  for (const [, name, value] of source.matchAll(
    /\{@const\s+([A-Za-z_$][\w$]*)\s*=([\s\S]*?)\}\s*\n/g
  )) {
    out.set(name, value.replace(/\s+/g, " ").trim());
  }
  return out;
}

/**
 * Every value substituted into a template, from either form the app uses:
 *
 *   t(COPY.key, lang, { name: VALUE, … })
 *   COPY.key.bg.replace("{name}", VALUE).replace(…)
 *
 * Placeholder names are not values and are not returned — only the expressions
 * whose result reaches the rendered string. Inside a template literal, each
 * `${…}` is returned separately, because the literal text around them is ours.
 */
function substitutions(expression) {
  const values = [];

  // `.replace("{name}", VALUE)` — VALUE is everything to the matching paren.
  for (const match of expression.matchAll(/\.replace\(\s*["'][^"']*["']\s*,/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    for (; i < expression.length && depth > 0; i++) {
      if ("([{".includes(expression[i])) depth++;
      else if (")]}".includes(expression[i])) depth--;
    }
    values.push(expression.slice(start, i - 1).trim());
  }

  // `t(…, { name: VALUE, … })` — the object literal's values.
  const call = expression.match(/\bt\(/);
  if (call) {
    const open = expression.indexOf("{", call.index);
    if (open !== -1) {
      let depth = 0;
      let start = open + 1;
      for (let i = open; i < expression.length; i++) {
        const ch = expression[i];
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) {
          depth--;
          if (depth === 0) {
            values.push(expression.slice(start, i));
            break;
          }
        } else if (depth === 1 && ch === ",") {
          values.push(expression.slice(start, i));
          start = i + 1;
        }
      }
    }
  }

  // Unwrap: drop `name:` labels, and split a template literal into its holes.
  const out = [];
  for (const raw of values) {
    const value = raw
      .trim()
      .replace(/^[A-Za-z_$][\w$]*\s*:/, "")
      .trim();
    if (!value) continue;
    if (value.startsWith("`")) {
      for (const [, hole] of value.matchAll(/\$\{([^}]*)\}/g)) out.push(hole.trim());
    } else {
      out.push(value);
    }
  }
  return out;
}

test("no fetched value is substituted into an {@html} template unformatted", () => {
  // The templates are ours; the values filled into them are not all constants.
  // A reference period, a source label or an as-of date arrives in a published
  // payload, and a payload is fetched at runtime. Each has to pass through a
  // formatter that constrains its shape — `period()` and `fmt()` do — rather
  // than being interpolated as-is beside copy that carries markup.
  const offenders = [];
  for (const { name, text } of COMPONENTS) {
    const consts = localConsts(text);
    const safe = (value, depth = 0) => {
      if (/^["'`]/.test(value) || /^-?[\d.]+$/.test(value)) return true;
      if (SAFE_VALUE_SOURCES.test(value)) return true;
      // A local `{@const}` is safe when the expression behind it is.
      if (depth < 3 && consts.has(value)) return safe(consts.get(value), depth + 1);
      // A ternary is safe when both branches are.
      const branches = splitTernary(value);
      return branches !== null && branches.every((b) => safe(b, depth + 1));
    };
    for (const { index, expression } of atHtmlExpressions(text)) {
      for (const value of substitutions(expression)) {
        if (safe(value)) continue;
        const line = withoutComments(text).slice(0, index).split("\n").length;
        offenders.push(`${name}:${line} → ${value.slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "These values are interpolated into markup without passing through a\n" +
      "formatter that constrains their shape. Wrap them — `period()` for a\n" +
      "reference period, `fmt()`/`fmt0()` for a number:\n  " +
      offenders.join("\n  ")
  );
});

test("the app has no free-text input surface", () => {
  const ALLOWED_TYPES = new Set(["number", "range", "checkbox", "radio"]);
  const offenders = [];
  for (const { name, text } of COMPONENTS) {
    for (const tag of text.match(/<input\b[^>]*>/g) ?? []) {
      const type = tag.match(/type="([a-z]+)"/)?.[1];
      if (!type || !ALLOWED_TYPES.has(type)) offenders.push(`${name}: ${tag.slice(0, 80)}`);
    }
    for (const forbidden of ["<textarea", "contenteditable"]) {
      if (text.includes(forbidden)) offenders.push(`${name}: ${forbidden}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A free-text input appeared. Everything a visitor can enter is currently a\n" +
      "number, which is why rendering COPY through {@html} is safe. Adding text\n" +
      "input means auditing every {@html} path first:\n  " +
      offenders.join("\n  ")
  );
});

test("the {@html} scanner balances nested braces and skips comments", () => {
  // Guard the guard: a naive scan would cut this at the first `}` and then
  // wave through anything after it.
  const nested = '<span>{@html t(COPY.a, $lang, { d: x ? t(COPY.b, $lang) : "" })}</span>';
  const [only] = atHtmlExpressions(nested);
  assert.equal(only.expression, 't(COPY.a, $lang, { d: x ? t(COPY.b, $lang) : "" })');
  assert.ok(isRooted(only.expression));

  // A ternary between two rooted calls is rooted; the condition is not rendered.
  assert.ok(isRooted('n > 0 ? t(COPY.a, "bg", { n: fmt(n) }) : t(COPY.b, "bg")'));

  // A fetched value is not, whichever side of the ternary it sits on.
  assert.ok(!isRooted("payload.notes"));
  assert.ok(!isRooted('n > 0 ? t(COPY.a, "bg") : payload.notes'));

  // `{@html …}` written inside a markup comment is documentation, not code.
  assert.deepEqual(atHtmlExpressions("<!-- wrapped in {@html} because … -->"), []);
});

// ---------------------------------------------------------------------------
// The other direction: copy that CARRIES markup must be rendered as markup
//
// Migrated from the SPA contract file in pipeline/tests/ (now test_published_contracts.py, which keeps only the published-artefact half). The invariants
// above prove that nothing dangerous reaches `{@html}`. This proves the
// converse — that a COPY string containing `<b>` is actually rendered through
// it. Without that, Svelte escapes the angle brackets and the page shows the
// literal text `<b>+6.7%</b>`, which reached the live site once.
//
// The two belong together: they are the same decision seen from both sides,
// and separating them is how one of them gets relaxed without the other.
// ---------------------------------------------------------------------------

/** True if `pos` sits inside an `{@html …}` interpolation. */
function enclosingInterpolationIsHtml(src, pos, window = 1500) {
  // Walks outwards through every brace still open at `pos`, skipping spans that
  // are already closed, so an earlier unrelated `{@html …}` cannot satisfy the
  // check. Every enclosing brace is examined rather than just the nearest,
  // because a render site is routinely nested inside an object literal or a
  // ternary: `{@html t(COPY.a, lang, { d: x ? t(COPY.b) : "" })}` IS
  // html-rendered, and a scanner stopping at the first `{` would wrongly flag
  // COPY.b.
  let depth = 0;
  for (let i = pos - 1; i >= Math.max(0, pos - window); i--) {
    const ch = src[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        if (src.slice(i, i + 6) === "{@html") return true;
      } else depth--;
    }
  }
  return false;
}

/** Every offset at which `src` renders COPY.<key>, through either render path. */
function copyRenderSites(src, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out = [];
  for (const pattern of [
    new RegExp(`COPY\\.${escaped}\\.(?:bg|en)\\s*\\.replace\\(`, "g"),
    new RegExp(`t\\(\\s*COPY\\.${escaped}\\b`, "g"),
  ]) {
    for (const m of src.matchAll(pattern)) out.push(m.index);
  }
  return out.sort((a, b) => a - b);
}

const TAG_IN_STRING = /<[a-zA-Z][a-zA-Z0-9]*(\s[^<>]*)?>/;

test("every COPY string that embeds markup is rendered with {@html}", () => {
  // Importing COPY rather than regexing content.js is the point of the move: a
  // string containing a brace, a nested quote or a template literal no longer
  // defeats the scan, and a key added next month is covered with no new test.
  const withMarkup = Object.entries(COPY)
    .filter(([, v]) => v && typeof v === "object" && (v.bg || v.en))
    .filter(([, v]) => TAG_IN_STRING.test(`${v.bg ?? ""}${v.en ?? ""}`))
    .map(([k]) => k);

  assert.ok(
    withMarkup.length,
    "no COPY string carries HTML markup any more. Either the emphasis markup " +
      "was dropped everywhere (then delete this test) or COPY stopped being " +
      "shaped the way this scan expects."
  );

  const app = ALL_SOURCE;
  const violations = [];
  let rendered = 0;
  for (const key of withMarkup) {
    for (const pos of copyRenderSites(app, key)) {
      rendered++;
      if (!enclosingInterpolationIsHtml(app, pos)) violations.push(key);
    }
  }
  assert.deepEqual(
    violations,
    [],
    "these COPY strings carry embedded HTML but are not rendered with " +
      `{@html …}, so the reader sees literal <b> tags as text: ${violations.join(", ")}`
  );
  assert.ok(
    rendered,
    "none of the markup-bearing COPY keys is rendered anywhere — the scan " +
      "found nothing to check, so it is protecting nothing. Investigate before deleting."
  );
});

test("the {@html} detector actually detects the bug it is written for", () => {
  // A contract test that cannot fail is worse than no test. Feed the detector
  // the exact broken shape, the fixed one, and the nested-ternary case that a
  // naive fixed-width lookback gets wrong.
  const broken = '<span class="l-bg">{t(COPY.standStillTxt, $lang, { r: 1 })}</span>';
  const fixed = '<span class="l-bg">{@html t(COPY.standStillTxt, $lang, { r: 1 })}</span>';
  const nested =
    '<span>{@html t(COPY.a, $lang, { d: x ? t(COPY.standStillTxt, $lang) : "" })}</span>';
  for (const [src, expected] of [
    [broken, false],
    [fixed, true],
    [nested, true],
  ]) {
    const pos = copyRenderSites(src, "standStillTxt")[0];
    assert.equal(enclosingInterpolationIsHtml(src, pos), expected, src);
  }
});
