#!/usr/bin/env node
/**
 * Release guard: refuse to publish a legal identity that is not true for
 * whatever we actually are.
 *
 * The property worth protecting is not "a company registration number
 * exists" — a guard whose only satisfiable state is its own deletion gets
 * deleted. It is:
 *
 *   **the published identity is complete and true for the legal form we are.**
 *
 * So the guard reads `legal.js#LEGAL_FORM` and checks two things:
 *
 *   1. **Completeness.** Every ЗЕТ чл. 4 row this form owes (`dueWhen`
 *      matching the form) carries a value. Today that is the name, the
 *      contact e-mail and the activity — all real — so `build:release`
 *      PASSES. The day `takesPayment` flips to `true`, the postal address and
 *      the register entry become due and this goes red, which is exactly when
 *      someone needs to be told.
 *
 *   2. **Truthfulness of the form itself.** A self-declared `takesPayment:
 *      false` would make check 1 a guard that only confirms what it was told.
 *      So the shipped user-facing copy is scanned for the markers of a sale —
 *      a price per month, a subscription, a checkout — and a hit while the
 *      identity still says "free" fails the build. This is the half that
 *      cannot be satisfied by editing a flag.
 *
 * Two modes:
 *
 *   - `npm run build` — WARNS. Development, preview deploys and CI must not
 *     be blocked on a legal fact.
 *   - `npm run build:release` (sets `VYARNO_RELEASE=1`) — FAILS. This is the
 *     command that builds what actually gets published.
 *
 * To close a future failure: publish the fact in `src/lib/legal.js` (set the
 * row's `value`), or correct `LEGAL_FORM` to say what we have become. Never
 * invent a registration number to make this pass — a placeholder ЕИК on a
 * live site is a false registration number, not a missing detail.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src");
const LEGAL = resolve(SRC, "lib/legal.js");

// `await import()` takes a URL, not a path. On POSIX `resolve()` returns a
// path the loader happens to accept; on Windows it is `C:\…` and the loader
// rejects it with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. `pathToFileURL` is the
// documented way to bridge the two.
const {
  DOCS,
  IDENTITY,
  LEGAL_FORM,
  commercialSignals,
  copyStrings,
  identityRows,
  unpublishedIdentityFields,
} = await import(pathToFileURL(LEGAL).href);
const { COPY, HOME } = await import(pathToFileURL(resolve(SRC, "lib/content.js")).href);
const { SUPPORT_COPY, SUPPORT_PLATFORMS } = await import(
  pathToFileURL(resolve(SRC, "lib/support.js")).href
);

const isRelease = process.env.VYARNO_RELEASE === "1";
const problems = [];

// --- 1. Every row this legal form owes is actually published. ---------------
const missing = unpublishedIdentityFields(LEGAL_FORM, IDENTITY);
for (const id of missing) {
  const row = IDENTITY.find((r) => r.id === id);
  problems.push(
    `  - ${id}: ${row?.label?.en ?? id} — ЗЕТ чл. 4 owes this once ` +
      `dueWhen="${row?.dueWhen}" applies, and it has no value.`
  );
}

// --- 2. The form's own claim, checked against what we ship. -----------------
// The rendered strings, not the files: `COPY`/`HOME` are the calculator's copy
// and `DOCS`/`IDENTITY` the published documents. Reading the source instead
// would trip on a comment explaining why we do NOT sell subscriptions. Docs are
// not shipped to anyone, so they stay out of scope too.
//
// `SUPPORT_COPY` and the platform notes ship in the footer, in the explainer
// band and on `/support/`, and they are the copy most likely to acquire a price —
// a suggested amount is the first thing anybody reaches for when a donation
// channel is not converting. The scan covers every module whose strings reach
// a reader, and this is one of them.
const signals = commercialSignals(
  copyStrings(COPY, HOME, DOCS, IDENTITY, SUPPORT_COPY, SUPPORT_PLATFORMS)
);
if (signals.length > 0 && !LEGAL_FORM.takesPayment) {
  problems.push(
    `  - LEGAL_FORM.takesPayment is false, but the shipped copy sells ` +
      `something: ${signals.map((s) => JSON.stringify(s)).join(", ")}. ` +
      `Either that copy should not ship, or the identity is now a paid ` +
      `service's identity and owes the rest of ЗЕТ чл. 4.`
  );
}

if (problems.length === 0) {
  const published = identityRows(LEGAL_FORM, IDENTITY)
    .map((r) => r.id)
    .join(", ");
  console.log(
    `[check-identity] the published identity is complete for ` +
      `LEGAL_FORM="${LEGAL_FORM.id}" (${published})`
  );
  process.exit(0);
}

if (isRelease) {
  console.error(
    "[check-identity] RELEASE BLOCKED — the published legal identity is not " +
      `true for what we are:\n${problems.join("\n")}\n\n` +
      "Fix it in src/lib/legal.js — publish the fact, or correct LEGAL_FORM. " +
      "Do not invent a registration number to make this pass.\n" +
      "For a preview or a local build, run `npm run build` (no VYARNO_RELEASE).\n"
  );
  process.exit(1);
}

console.warn(
  `[check-identity] WARNING — not release-ready:\n${problems.join("\n")}\n` +
    "  (a release build, VYARNO_RELEASE=1, refuses to ship while this is " +
    "non-empty)\n"
);
