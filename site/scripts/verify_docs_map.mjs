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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PAYLOADS } from "../src/lib/payloads.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const REPO = join(SITE, "..");
const SITE_MD = join(REPO, "docs", "site.md");

/**
 * The gate count is deliberately NOT checked here, and the reason is the rule.
 *
 * There is no single number to check it against. `docs/validation-gates.md`
 * numbers eight; seven of those block a full HICP release and the eighth runs
 * only under `--source sector-salary`; five more gate the mortgage panel from
 * another module; `validate.py` defines fifteen `validate_*` functions, because
 * the numbered table is the HICP set and every other `--source` carries gates
 * the table does not number. So "seven gate lines is the pass condition", "the
 * five mortgage gates" and "the eight gates in validation-gates.md" are three
 * different true sentences, and a scan matching a numeral against the word
 * `gate` calls two of them wrong.
 *
 * That is the failure `docs/testing-strategy.md` §"`docs/` is outside its
 * roots" describes — a guard that fires on legitimate text is one somebody
 * silences — and it is what separates this from the payload count below, where
 * there is one directory, one manifest and one right answer.
 */

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
  // `src/lib` has a subdirectory in it, so the listing is recursive and yields
  // files only. A flat read would name the directory itself — which the tree
  // draws without an extension and this check would report as missing — while
  // saying nothing about the modules inside it, which are the part a reader
  // opening the map is looking for.
  const missing = [...pages, ...filesUnder(join(SITE, "src", "lib"))]
    .filter((f) => !NAMES_IN_TREE.has(f))
    .sort();
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

// ---------------------------------------------------------------------------
// COUNTS WRITTEN INTO PROSE
// ---------------------------------------------------------------------------
//
// `AGENTS.md` bars writing a TEST count into a doc, and gives the reason: the
// number goes stale in the one direction nobody notices, because nothing reads
// it. The reason is not about tests. Add a payload and every sentence in the
// tree that counts them is wrong, in a dozen places at once, and none of it
// reaches a reader — the data panel counts at runtime — so the only person
// misled is the next contributor, who has no way to tell which number to trust.
//
// This is the same admission `treeBody` above rests on. A count of files is not
// prose: `data/published/` holds nine JSONs or it does not, the sentence says
// nine or it does not, and there is no reading of either that makes a mismatch
// correct. The sentences AROUND the number are still nobody's business but a
// reviewer's — the scan matches a numeral word immediately against the thing it
// counts, and never a bare "eight" anywhere in a paragraph.

/**
 * Numerals in the forms these docs write them — spelled out in either language,
 * and as digits.
 *
 * The digits are here because prose is not the only place a payload gets
 * counted. A repo map draws its tree in a fenced block and a README draws its
 * flowchart in mermaid, and neither spells a number out: `← 8 files, committed`
 * and `data/published/*.json<br/>8 payloads` both sat two payloads behind the
 * directory while every spelled-out sentence in the same files was corrected.
 * A diagram is the first thing a contributor reads and the last thing anybody
 * re-reads, so it is exactly where a stale count survives longest.
 */
const NUMERALS = new Map([
  ["5", 5],
  ["6", 6],
  ["7", 7],
  ["8", 8],
  ["9", 9],
  ["10", 10],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["пет", 5],
  ["петте", 5],
  ["шест", 6],
  ["шестте", 6],
  ["седем", 7],
  ["седемте", 7],
  ["осем", 8],
  ["осемте", 8],
  ["девет", 9],
  ["деветте", 9],
  ["десет", 10],
  ["десетте", 10],
  ["11", 11],
  ["12", 12],
  ["13", 13],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["единадесет", 11],
  ["единадесетте", 11],
  ["дванадесет", 12],
  ["дванадесетте", 12],
  ["тринадесет", 13],
  ["тринадесетте", 13],
]);

const WORD = [...NUMERALS.keys()].join("|");

/**
 * Word boundaries that hold on both alphabets.
 *
 * **`\b` is defined against `[A-Za-z0-9_]` and nothing else**, so between a
 * space and «д» there is no boundary at all — both sides are non-word to it.
 * A pattern anchored with `\b` therefore matches every English and digit form
 * in these files and **not one Bulgarian one**, which is the worst shape a
 * guard can take: it reports green over the half it never looked at.
 * `README.bg.md` carried «дванадесет JSON файла» against thirteen published
 * payloads while the English sentence three lines away was correct and checked.
 *
 * Lookarounds on letters-or-digits do what `\b` was meant to do here, in both
 * scripts, and keep the adjacency rule the whole scan rests on.
 */
const OPEN = "(?<![\\p{L}\\p{N}])";
const CLOSE = "(?![\\p{L}\\p{N}])";

/**
 * A numeral naming what it counts, with NOTHING between the two.
 *
 * Adjacency is what keeps this off ordinary prose. "Eight arms write nine
 * payloads" is a true sentence in `docs/testing-strategy.md` and a window of a
 * few words would read the eight as the payload count; requiring the noun to
 * follow the numeral immediately (optionally through one qualifier the docs
 * actually use) leaves that sentence alone and still catches every form these
 * files write — "nine JSONs", "nine published payloads", "nine small JSON
 * files", "nine envelopes", «девет JSON файла», «деветте JSON файла», and the
 * digit forms a tree or a flowchart node uses: "9 payloads, committed",
 * «9 JSON файла».
 *
 * The noun is what keeps the digits safe to read. A bare "8" in a diagram is
 * a build entry, a breakpoint or a version — `Vite 8` sits four lines from the
 * payload count in `architecture.md`'s own tree — and none of those is followed
 * by the word `payloads`.
 */
const PAYLOAD_COUNT = new RegExp(
  `${OPEN}(${WORD})\\s+(?:small\\s+|published\\s+|committed\\s+)?` +
    `(?:JSONs?|payloads?|envelopes?|JSON\\s+файла)${CLOSE}`,
  "giu"
);

/**
 * A sentence naming a SUBSET, which the pattern above cannot tell from a total.
 *
 * "eight payloads are current and the ninth is months old" counts the same nine
 * files correctly, and so would "eight of the nine". The tell is an ordinal or
 * a partitive in the same sentence; without one, a numeral against `payloads`
 * is the whole set. Skipping these is what keeps the check off prose it has no
 * business judging — a guard that fires on a true sentence is one somebody
 * turns off, and then the stale totals come back with it.
 */
const NAMES_A_SUBSET = new RegExp(
  `${OPEN}(?:eighth|ninth|tenth|eleventh|twelfth|thirteenth|of the|` +
    `осмият|деветият|десетият|от деветте|от тринадесетте)${CLOSE}`,
  "iu"
);

/**
 * `docs/writing-style.md` quotes example sentences to argue about how they are
 * written, including one about a list of payload stems going stale. Quoted
 * prose is not a claim about today's repository, and rewriting somebody's
 * example to keep a counter happy would be editing the illustration rather
 * than the thing illustrated.
 *
 * This file is the second case and for the same reason: the comments below
 * quote "nine JSONs" and "Eight arms write nine payloads" as specimens of the
 * sentences the scan has to catch and the sentences it has to leave alone.
 * Correcting a specimen to today's count would delete the example.
 */
const NOT_A_CLAIM = new Set(["writing-style.md", "verify_docs_map.mjs"]);

/** Every markdown file in the repository, outside build output and vendor dirs. */
function markdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry === ".git" || entry === ".venv") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) markdownFiles(path, out);
    else if (entry.endsWith(".md") && !NOT_A_CLAIM.has(entry)) out.push(path);
  }
  return out;
}

/**
 * Source files, because a count in a comment goes stale the same way.
 *
 * The docs were not where the worst of these were hiding. `payloads.js` argued
 * against publishing `cadenceDays` because it would put "a second copy in nine
 * JSON files"; `content.js` explained the staleness banner by "the nine
 * payloads"; `legal.js` justified the per-payload panel because "one date
 * across nine payloads" can only describe one of them. Each is the sentence
 * the markdown scan was written to catch, in a file it never opened — and each
 * sits directly above the code somebody edits when they add a payload, which
 * is when it is read and believed.
 *
 * The adjacency rule is what makes this safe to point at code: the numeral has
 * to be followed immediately by the thing it counts, so `PAYLOADS.length`, a
 * version, an index and a byte size all go past untouched.
 */
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry === ".git" || entry === ".venv" || entry === "__pycache__")
      continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/[.](?:js|mjs|py)$/.test(entry) && !NOT_A_CLAIM.has(entry)) out.push(path);
  }
  return out;
}

test("no doc or comment counts the published payloads wrong", () => {
  const files = [...markdownFiles(REPO), ...sourceFiles(REPO)];
  assert.ok(files.length > 10, `only ${files.length} files found — the scan lost its root`);
  const actual = PAYLOADS.length;
  assert.ok(actual > 0, "the payload manifest is empty, so there is nothing to count against");

  const wrong = [];
  let matched = 0;
  for (const file of files) {
    // Scanned by SENTENCE, not by line. These docs wrap at 80 columns, so the
    // numeral and the ordinal that qualifies it routinely land on different
    // lines — "eight payloads are current and the / ninth is months old" reads
    // as a wrong total to anything that looks at one line at a time.
    const prose = readFileSync(file, "utf8").replace(/\s*\n\s*/g, " ");
    for (const sentence of prose.split(/(?<=[.!?])\s+/)) {
      if (NAMES_A_SUBSET.test(sentence)) continue;
      for (const m of sentence.matchAll(PAYLOAD_COUNT)) {
        matched += 1;
        const said = NUMERALS.get(m[1].toLowerCase());
        if (said === actual) continue;
        wrong.push(
          `${file.slice(REPO.length + 1)}: says ${said}, there are ${actual} — ` +
            `"${sentence.trim().slice(0, 110)}"`
        );
      }
    }
  }

  // A pattern that stopped matching is a green test for every stale count in
  // the tree, which is the shape every empty assertion in this repo takes.
  assert.ok(matched >= 6, `the payload-count scan matched only ${matched} sentences`);
  assert.deepEqual(
    wrong,
    [],
    `something counts the published payloads wrong:\n  ${wrong.join("\n  ")}\n\n` +
      "Fix the sentence, not this test. `AGENTS.md` bars writing a test count " +
      "into a doc for this reason and the reason is not about tests: a number " +
      "nothing reads only ever goes stale, and it goes stale silently."
  );
});

// ---------------------------------------------------------------------------
// THE ROUTE TABLE
// ---------------------------------------------------------------------------

/**
 * `docs/site.md`'s Layout table names every entry the build actually produces.
 *
 * That table is the first thing a reader meets in the SPA doc and it is the
 * only place the routes are listed with what each one is FOR, so a route
 * missing from it is a page nobody knows exists. It fails the way the file
 * tree above fails — silently, by omission — and it had: `/credit/` was in the
 * Bulgarian half and the English row beside it still read "those five again"
 * over five paths, so the one page a reader would have had to go looking for
 * was the one the table did not have.
 *
 * The comparison is against `vite.config.js#rollupOptions.input`, which is what
 * decides the answer: an entry there is a file the build emits and a URL a
 * static host resolves, and an entry not there is neither, whatever any table
 * says.
 *
 * **A route is looked for by its DIRECTORY, not by its full path**, because the
 * table legitimately abbreviates the English half to `en/how/…` rather than
 * writing six more `index.html`s that say nothing. `en/how/` is in that string
 * either way, and it is the part that identifies the route.
 */
test("the docs/site.md route table names every entry the build emits", () => {
  const config = readFileSync(join(SITE, "vite.config.js"), "utf8");
  const inputs = [...config.matchAll(/resolve\(__dirname,\s*"([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(inputs.length > 5, `only ${inputs.length} build entries parsed — the scan lost them`);

  const layout = readFileSync(SITE_MD, "utf8");
  const missing = inputs
    .filter((entry) => {
      // `how/index.html` is identified by `how/`; a root or bare entry
      // (`index.html`, `404.html`) has no directory and is looked for whole.
      const dir = entry.includes("/") ? `${entry.slice(0, entry.lastIndexOf("/"))}/` : entry;
      return !layout.includes(dir);
    })
    .sort();

  assert.deepEqual(
    missing,
    [],
    `vite.config.js builds ${missing.join(", ")}, which docs/site.md's Layout table ` +
      "does not name — a route absent from that table is a page a reader has no route to"
  );
});

// ---------------------------------------------------------------------------
// THE WIRING LAYER'S PAIRING
// ---------------------------------------------------------------------------

/**
 * Every `view/` module has the suite of the same stem, and every suite a module.
 *
 * This pairing is what four docs describe the wiring layer BY — one module per
 * subject, one suite per module — and until now the only thing holding it was
 * that somebody had written a matching count into each of them. Counts are the
 * wrong instrument: they were all reading eleven against twelve modules, none
 * of them could go red, and the number was never the claim anybody relied on.
 * The claim is that a subject cannot be added without the suite that covers it,
 * and that is checkable exactly.
 *
 * Both directions, because they fail differently. A module with no suite is a
 * subject nothing tests while the docs say every subject is tested. A suite
 * with no module tests a file that has been deleted or renamed, and passes.
 *
 * `verify_suites.mjs` is the neighbouring check and a different one: it holds
 * the suite to being RUN by a runner in `package.json`. A suite can be run and
 * still cover nothing.
 */
test("every view/ module is paired with the suite of the same stem", () => {
  const modules = readdirSync(join(SITE, "src", "lib", "view"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/[.]js$/, ""));
  const suites = readdirSync(join(SITE, "scripts"))
    .filter((f) => /^verify_view_.+[.]mjs$/.test(f))
    .map((f) => f.replace(/^verify_view_|[.]mjs$/g, ""));

  assert.ok(
    modules.length > 5,
    `only ${modules.length} view modules found — the scan lost its root`
  );

  const unsuited = modules.filter((m) => !suites.includes(m)).sort();
  assert.deepEqual(
    unsuited,
    [],
    `src/lib/view/${unsuited.join(", ")} has no verify_view_*.mjs of the same stem — ` +
      "the wiring layer is described everywhere as one suite per subject, and this " +
      "subject is the exception nothing would report"
  );

  const orphans = suites.filter((s) => !modules.includes(s)).sort();
  assert.deepEqual(
    orphans,
    [],
    `verify_view_${orphans.join(", verify_view_")} names no module in src/lib/view/ — ` +
      "a suite whose subject was renamed still runs and still passes"
  );
});

// ---------------------------------------------------------------------------
// §-CITATIONS
// ---------------------------------------------------------------------------
//
// These docs cite each other, and the suites, by quoting a title: `math.md`
// §"Which rate goes into the annuity", `verify_copy.mjs` §"the market page
// writes no year". The quoted string is the whole address — there is no link to
// follow and nothing resolves it — so a rename anywhere silently turns every
// citation of it into a dead end that still reads as authoritative.
//
// That is not hypothetical. Renaming one test to cover the masthead as well as
// the footer left `site.md` citing a name no suite had; two more citations named
// tests that had never existed under those names, each introduced with "holds
// it", which is the failure worth catching — a doc asserting a guard that is not
// there is worse than a doc saying nothing, because it retires the question.
//
// The check is deliberately the weakest one that catches a rename: does the
// quoted string appear in the file it names, anywhere, at all? Not "is it a
// heading", because these citations legitimately point at a `//` line comment,
// at a numbered heading whose number the citation drops, and at a bold sentence
// inside a section. Not "does it match exactly", because the house style
// abbreviates a long title down to its distinctive half. Every one of those
// resolves for a reader who searches the file, and a check that failed them
// would be a check somebody turns off — which `docs/testing-strategy.md`
// §"`docs/` is outside its roots" is the standing argument about.

/** Every file the citations can address, indexed by basename. */
function pathsUnder(dir, out = new Map()) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry === ".git" || entry === ".venv" || entry === "__pycache__")
      continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) pathsUnder(path, out);
    else if (!out.has(entry)) out.set(entry, path);
  }
  return out;
}

/**
 * Backticks stripped, whitespace flattened, case folded.
 *
 * The flattening is what makes this work on prose wrapped at 80 columns: a
 * quoted title routinely straddles a newline, so anything comparing line by line
 * reads half a title and reports every long citation as broken.
 */
const flat = (s) => s.replace(/[`*]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** `name.ext` immediately before a `§"…"`, and the title it quotes. */
const CITATION = /(?:([A-Za-z0-9_./-]+\.(?:md|mjs|js|py|svelte|css))[`)\]]*\s*)?§\s*"([^"]+)"/g;

test("every §-citation in the docs resolves to something in the file it names", () => {
  const byName = pathsUnder(REPO);
  const bodies = new Map();
  const body = (path) => {
    if (!bodies.has(path)) bodies.set(path, flat(readFileSync(path, "utf8")));
    return bodies.get(path);
  };

  const dangling = [];
  let checked = 0;

  for (const file of markdownFiles(REPO)) {
    const here = file.slice(REPO.length + 1);
    const prose = readFileSync(file, "utf8").replace(/\s*\n\s*/g, " ");

    for (const [, named, quoted] of prose.matchAll(CITATION)) {
      checked += 1;
      const want = flat(quoted);

      // A citation naming no file addresses this one, or a file named just
      // before it in the same sentence — both spellings are in use, so a bare
      // one is satisfied by any doc carrying the title.
      if (!named) {
        if (body(file).includes(want)) continue;
        if (markdownFiles(REPO).some((f) => body(f).includes(want))) continue;
        dangling.push(`${here}: §"${quoted}" — no doc carries that title`);
        continue;
      }

      // A citation spells the path from wherever the writer was standing:
      // `./math.md` from a sibling, `site/AGENTS.md` from the repo root, and a
      // bare `verify_copy.mjs` for a file everybody knows by name. Resolving
      // repo-relative BEFORE falling back to the basename is what keeps
      // `site/AGENTS.md` from matching the root `AGENTS.md`, which is a
      // different file with different rules in it.
      const candidates = [join(dirname(file), named), join(REPO, named)];
      const target = candidates.find(existsSync) ?? byName.get(named.split("/").pop());
      if (!target) {
        dangling.push(`${here}: ${named} §"${quoted}" — ${named} is not in the repository`);
        continue;
      }
      if (body(target).includes(want)) continue;
      dangling.push(
        `${here}: ${named} §"${quoted}" — ${target.slice(REPO.length + 1)} does not ` +
          "contain that string, so the section or test was renamed and the citation was not"
      );
    }
  }

  // A regex that stopped matching is a green test for every dead citation in
  // the tree, which is the shape every empty assertion in this repo takes.
  assert.ok(checked >= 90, `the citation scan matched only ${checked} references`);
  assert.deepEqual(
    dangling,
    [],
    `a §-citation names something that is not there:\n  ${dangling.join("\n  ")}\n\n` +
      "Repoint the citation at what the thing is called now. If it named a test " +
      "that does not exist, say what actually holds the constraint — or that " +
      "nothing does."
  );
});
