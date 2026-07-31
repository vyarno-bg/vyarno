#!/usr/bin/env node
/**
 * The donation path, checked from both ends.
 *
 * Two files describe where a person can support Вярно, and they are read by
 * different things: `.github/FUNDING.yml` drives GitHub's "Sponsor" button,
 * `site/src/lib/support.js` drives the site's own footer and legal page. A
 * platform enabled in one and not the other is the failure this catches —
 * either a Sponsor button leading somewhere the project does not actually
 * monitor, or a donate link on the site pointing at an account nobody opened.
 *
 * The second failure is the one worth a build break: a dead donate link on a
 * civic tool asking for money reads as either broken or dishonest, and both
 * cost more trust than the donation was worth.
 *
 * Also enforced here, because they are the rules that keep the ask honest and
 * they are easy to erode one commit at a time (see `support.js`):
 *
 *   - no amounts in shipped support copy — a suggested figure is a price, and
 *     `commercialSignals()` in `legal.js` would fail the release build on the
 *     "€N/month" form anyway;
 *   - nothing offered in return — a supporter tier makes the service
 *     возмездна and pulls in the rest of ЗЕТ чл. 4.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const FUNDING = resolve(ROOT, ".github/FUNDING.yml");

const { SUPPORT_PLATFORMS, SUPPORT_COPY, livePlatforms } = await import(
  resolve(__dirname, "../src/lib/support.js")
);

/**
 * The platform ids GitHub's funding file enables, from its uncommented lines.
 *
 * Deliberately a line scan and not a YAML parse: the file is mostly comment
 * by design (the whole point is that a platform stays commented out until its
 * account exists), and a parser would read the commented block as absent
 * without telling us whether it was ever there.
 */
function enabledInFunding() {
  const src = readFileSync(FUNDING, "utf8");
  const keys = {
    github: "github",
    open_collective: "opencollective",
    liberapay: "liberapay",
    ko_fi: "kofi",
  };
  const on = new Set();
  for (const line of src.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const key = trimmed.split(":")[0].trim();
    if (key in keys) on.add(keys[key]);
  }
  return on;
}

test("every platform the site links to has an account, and vice versa", () => {
  const funded = enabledInFunding();
  const live = new Set(livePlatforms().map((p) => p.id));

  for (const id of live) {
    assert.ok(
      funded.has(id),
      `support.js marks "${id}" live: true, so the site renders a donate ` +
        `link for it — but .github/FUNDING.yml still has it commented out. ` +
        `Either the account exists (uncomment it there) or it does not ` +
        `(set live: false here, before this ships a dead link).`
    );
  }
  for (const id of funded) {
    assert.ok(
      live.has(id),
      `.github/FUNDING.yml enables "${id}" but support.js still has it ` +
        `live: false, so GitHub shows a Sponsor button the site itself does ` +
        `not acknowledge. Flip live: true once the account is open.`
    );
  }
});

test("package metadata does not advertise a channel the site calls closed", () => {
  // A third file can announce a donation channel and nothing was reading it:
  // `pipeline/pyproject.toml` carried a `Funding` URL pointing at the
  // maintainer's own GitHub Sponsors page while `support.js` had GitHub
  // Sponsors at `live: false` and `.github/FUNDING.yml` had it commented out.
  // Package metadata is rendered on PyPI and read by tooling, so that was a
  // live donate link on a channel the project said was not open — the exact
  // failure the test above exists to prevent, in the one place it was not
  // looking.
  //
  // The rule is the same in all three files: a channel is advertised only
  // where `support.js` says it is live.
  const src = readFileSync(resolve(ROOT, "pipeline/pyproject.toml"), "utf8");
  const declared = src.match(/^\s*Funding\s*=\s*"([^"]+)"/m);
  const live = livePlatforms();
  if (!declared) {
    assert.equal(
      live.length,
      0,
      `support.js marks ${live.length} platform(s) live but ` +
        "pipeline/pyproject.toml declares no Funding URL. Add it back in the " +
        "same commit that opened the account."
    );
    return;
  }
  assert.ok(
    live.some((p) => declared[1] === p.url),
    `pipeline/pyproject.toml declares Funding = "${declared[1]}", which is ` +
      "not the URL of any platform support.js marks live: true. Package " +
      "metadata must not advertise a channel the site itself says is closed."
  );
});

test("every declared platform has an id, a label and an absolute https url", () => {
  const seen = new Set();
  for (const p of SUPPORT_PLATFORMS) {
    assert.ok(p.id && !seen.has(p.id), `duplicate or missing platform id: ${p.id}`);
    seen.add(p.id);
    assert.ok(p.label, `platform ${p.id} has no label`);
    assert.match(
      p.url,
      /^https:\/\//,
      `platform ${p.id} must have an absolute https URL — a donate link is ` +
        `exactly the link a person checks before trusting it`
    );
    assert.ok(
      p.note?.bg && p.note?.en,
      `platform ${p.id} needs a note in both languages; the site is bilingual ` +
        `and a missing string renders as a blank line, not a fallback`
    );
    assert.equal(
      typeof p.live,
      "boolean",
      `platform ${p.id} needs an explicit live flag — undefined is falsy and ` +
        `would silently hide a platform someone thought they had enabled`
    );
  }
});

test("the support copy names no amount and offers nothing in return", () => {
  const strings = [];
  const walk = (node) => {
    if (typeof node === "string") {
      strings.push(node);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const v of Object.values(node)) walk(v);
  };
  walk(SUPPORT_COPY);
  walk(SUPPORT_PLATFORMS.map((p) => p.note));
  const text = strings.join("\n");

  // An amount, in any of the forms a donation ask tends to take. The site's
  // own release guard catches "€5/month"; this catches the bare "5 лв." and
  // "€5" that it deliberately does not, because here they are always wrong.
  assert.doesNotMatch(
    text,
    /(\d[\d\s.,]*\s*(лв\.?|лева|€|EUR|\$|USD))|([€$]\s?\d)/iu,
    "the support copy names a sum. It must not: a suggested amount is a " +
      "price by another name, and amounts belong on the donation platform " +
      "where the person has already decided to give. See support.js rule 3."
  );

  // Anything offered back turns a gift into a transaction — see support.js
  // rule 4 and LEGAL_FORM.takesPayment in legal.js.
  //
  // These match the AFFIRMATIVE form only, and that is deliberate. The copy
  // is expected — encouraged — to say "there is no paid version, no
  // donor-only features": denying a supporter tier is the honest thing to
  // print, and a guard that fires on its own denial is noise that gets the
  // guard deleted rather than the copy fixed. Same reasoning as
  // `commercialSignals()` in legal.js, which lets the privacy notice say we
  // have no subscription without failing the build.
  const offers = [
    /(дарител\w+)\s+\S*\s*(получава\w*|имат\b|има\b)/iu,
    /donors?\s+(get|receive|unlock)/iu,
    /\b(only|само)\s+(for|за)\s+(donors?|дарител\w+|supporters?)/iu,
    /(early access|ранен достъп)/iu,
    /(unlock\w*|отключв\w+)/iu,
    /(in return for your|в замяна на)/iu,
  ];
  for (const re of offers) {
    const hit = text.match(re);
    assert.equal(
      hit,
      null,
      `the support copy offers something in return (${JSON.stringify(hit?.[0])}). ` +
        "A donation must buy nothing: the moment it does, the service is " +
        "provided срещу възнаграждение and LEGAL_FORM.takesPayment has to " +
        "flip, which pulls in the rest of ЗЕТ чл. 4. See support.js rule 4."
    );
  }
});

test("the footer support line exists in both languages", () => {
  for (const k of ["navK", "line", "head", "body", "pending"]) {
    assert.ok(SUPPORT_COPY[k]?.bg, `SUPPORT_COPY.${k} has no Bulgarian string`);
    assert.ok(SUPPORT_COPY[k]?.en, `SUPPORT_COPY.${k} has no English string`);
  }
});
