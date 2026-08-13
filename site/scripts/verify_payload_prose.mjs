/**
 * The claims a shipped payload's prose makes, against the same claims on the
 * page.
 *
 * ## The failure this suite exists for
 *
 * `data/published/*.json` carries forty prose fields — `notes`, `method`,
 * `disclaimer`, `_role`, `note`, `rate_basis` — every one of them written by the
 * pipeline to say what an upstream measures, and **not one of them is rendered
 * by the SPA**. So they are read by nobody in the normal course of things, and
 * a sentence in one can go false and stay false while every gate is green.
 *
 * That is not hypothetical. `transform.py` wrote «'unoccupied' there means
 * unoccupied on census night» into `house_market_structure.json` and went on
 * writing it after `/market/` had been corrected to the usual-residence test
 * the census actually applies — the page and the payload contradicted each
 * other inside one repository for a full round. The `og:description` on
 * `/market/` carried «празен фонд» through the same round, for a second reason:
 * `verify_copy.mjs` walks `src/` and the entry shells are not in `src/`.
 *
 * ## Why the general check is not buildable, and what is
 *
 * The tempting guard is "a payload's prose and the page's sentence about the
 * same figure must agree". They are two free-text sentences written for two
 * different readers — one machine-facing and English, one bilingual and
 * addressed to somebody who did not come for the statistics — and no rule
 * decides whether two paragraphs make the same claim. Any check strong enough
 * to catch a real drift would fail on every honest rewrite, which is the shape
 * `docs/testing-strategy.md` rejects under "a guard that fires on legitimate
 * text is one somebody silences".
 *
 * What IS buildable is narrower and has teeth on exactly the failure that
 * shipped: **a claim retired for being false may not survive anywhere.** Both
 * halves are inside the repository, so unlike the upstream-definition guard
 * (`docs/data-sources.md` §"Why there is no gate on any of this") there is
 * something real to read. The rule is the one
 * `docs/testing-strategy.md` §"When a prose test IS right" already argues for:
 * **ban the construction, never the co-occurrence.** A list of phrasings that
 * MAKE a retired claim needs no exception list; a rule over words that appear
 * near each other needs one immediately, and its first entry is the sentence
 * written to correct the claim.
 *
 * ## What it costs, and what it does not catch
 *
 * The table grows by one entry per claim found false, which is the standing
 * rule's own exception — "a bug we actually shipped and could plausibly
 * reintroduce — keep the guard and name the bug". What it cannot see is payload
 * prose that has merely gone STALE in words nobody has banned: an upstream
 * re-scopes a series, the page is rewritten, the payload keeps a sentence that
 * is now wrong in phrasing no list anticipated. Nothing here catches that, and
 * nothing could — it is the same dated-read problem in a smaller box, and the
 * read is what answers it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { readSources } from "./live-copy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const SRC = join(SITE, "src");
const PUBLISHED = join(SITE, "..", "data", "published");

/** The payload keys that hold prose rather than a figure, a code or a URL. */
const PROSE_KEYS = new Set([
  "notes",
  "method",
  "disclaimer",
  "_role",
  "note",
  "rate_basis",
  "currency_history",
]);

/**
 * Every prose string in the shipped payloads, as `[where, text]`.
 *
 * Walked rather than listed: a payload gaining a `_role` gains coverage with no
 * edit here, which is §"Is there already a rule over the collection" applied to
 * the collection this suite is about.
 *
 * @returns {Array<[string, string]>}
 */
function payloadProse() {
  const found = [];
  for (const file of readdirSync(PUBLISHED)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const walk = (node, path) => {
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        const at = `${path}/${key}`;
        if (PROSE_KEYS.has(key) && typeof value === "string") found.push([at, value]);
        else walk(value, at);
      }
    };
    walk(JSON.parse(readFileSync(join(PUBLISHED, file), "utf8")), file);
  }
  return found;
}

/**
 * The reader-facing prose of the static entry shells.
 *
 * `og:description` and `twitter:description` are sentences a person reads in a
 * chat client or a search result and no component renders, so they are outside
 * every other suite's roots. This is where «празен фонд» lived.
 *
 * Comments blanked, same as every other surface, and this is the file where
 * that matters most: each corrected description sits under a markup comment
 * QUOTING the phrasing it replaced, so a scan reading comments is satisfied by
 * the warning and never checks the string.
 *
 * @returns {string}
 */
const shellProse = () => readSources(SITE, /\.html$/);

/**
 * Claims found false against a publisher's own definition, and retired.
 *
 * Each entry names the phrasings that MAKE the claim, in whichever languages it
 * was made in, and why it is wrong. A phrasing here must be specific enough
 * that no correct sentence contains it — `why` is what a reader of a failure
 * needs, and the corrected wording is in the tree rather than in this table so
 * that the guard bans a claim rather than pinning a sentence.
 */
const RETIRED = [
  {
    why:
      "The census classifies a dwelling as unoccupied when it is nobody's " +
      "usual residence, and cens_21_esms puts dwellings «with persons present " +
      "but not included in the census» in that same category. A presence test " +
      "is the reading the definition exists to rule out.",
    phrasings: [
      "unoccupied on census night",
      "stood empty on census night",
      "нощта на преброяването",
      "празен фонд",
      "empty stock,",
    ],
  },
  {
    why:
      "prc_hpi_inx_esms scopes the sales series to dwellings purchased AT " +
      "MARKET PRICES, which rules out self-build, a sale to a sitting tenant " +
      "at a discount and a sale between family members — each of which has a " +
      "price that was actually paid.",
    phrasings: ["at the price actually paid", "at the price paid.", "на реално платената цена"],
  },
  {
    why:
      "The APRC excludes notarial costs and the fee for registering the " +
      "transfer of ownership, by the two Directives that define it, and its " +
      "fee composition differs between member states. No caption may promise " +
      "that every fee is inside it.",
    phrasings: ["с всички такси (ГПР)", "with all fees (APRC)"],
  },
  {
    why:
      "ilc_lvho07a is 40% of DISPOSABLE income net of housing allowances, and " +
      "an owner's mortgage INTEREST counts towards the numerator where the " +
      "capital they are repaying does not. Written as plain «income» the " +
      "threshold reads against a gross figure, which is a materially different " +
      "line.",
    phrasings: ["40% of income", "40% of its income", "40% от дохода", "40% от дохода си"],
  },
  {
    why:
      "prc_hicp_esms: national HICPs are produced by the National Statistical " +
      "Institutes and only the European aggregates by Eurostat. Eurostat set " +
      "the method and check it was followed; НСИ build Bulgaria's index.",
    phrasings: ["Евростат ги сглобява", "Eurostat assembles them"],
  },
];

test("no retired claim survives in a shipped payload's prose", () => {
  // The payload half. Nothing renders these strings, so this is the only thing
  // between a false sentence here and the next person who reads the file to
  // find out what a figure means.
  const offenders = [];
  for (const [where, text] of payloadProse()) {
    for (const { phrasings, why } of RETIRED) {
      for (const phrasing of phrasings) {
        if (text.includes(phrasing)) offenders.push(`${where}: «${phrasing}» — ${why}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a payload still makes a claim its publisher does not:\n  " + offenders.join("\n  ")
  );
});

test("no retired claim survives in the copy, the shells or the wiring", () => {
  // The page half, over a surface wider than verify_copy.mjs's: `src/` plus the
  // static entry shells, whose og:description a reader meets before the page
  // has loaded and which no component renders.
  const surfaces = [
    ["src/", readSources(SRC)],
    ["entry shells", shellProse()],
  ];
  const offenders = [];
  for (const [name, text] of surfaces) {
    for (const { phrasings, why } of RETIRED) {
      for (const phrasing of phrasings) {
        if (text.includes(phrasing)) offenders.push(`${name}: «${phrasing}» — ${why}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a reader-facing surface still makes a claim its publisher does not:\n  " +
      offenders.join("\n  ")
  );
});

test("every payload prose field is in this suite's reach", () => {
  // The guard on the guard. `PROSE_KEYS` is a hand-kept list, and a payload
  // that starts carrying its prose under a key nobody added here is covered by
  // nothing while the suite goes on passing — the exact shape of subset test
  // docs/testing-strategy.md §"Is there already a rule over the collection"
  // warns about, which is why the floor is asserted rather than the membership.
  //
  // Counted rather than enumerated: adding a `_role` to a payload needs no edit
  // here, and removing every prose field from one would still be caught.
  const prose = payloadProse();
  assert.ok(
    prose.length >= 40,
    `${prose.length} prose fields reached across data/published/. Forty were ` +
      "read by hand and given a verdict; a smaller number means a key this " +
      "suite does not know about, or a payload that stopped saying what it " +
      "measures."
  );
  for (const [where, text] of prose) {
    assert.ok(text.trim().length > 0, `${where} is an empty prose field, which claims nothing`);
  }
});
