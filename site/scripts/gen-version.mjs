#!/usr/bin/env node
/**
 * Write `dist/version.json` — what is actually live, as a fact a machine can
 * check.
 *
 * Run as the last step of `npm run build`. Without it, "did the deploy actually
 * publish the commit I pushed?" can only be answered with shell access to
 * whatever is serving the site; with it, the answer is one HTTPS request:
 *
 *     curl -s https://vyarno.bg/version.json
 *     {"commit":"a1b2c3d","built_at":"2026-08-01T09:12:33Z",
 *      "data":{"oldest_as_of":"2026-07-23","newest_as_of":"2026-07-27",
 *              "payloads":{"hicp_headline":"2026-07-27", …}}}
 *
 * `data` carries both aggregates and the per-payload map they come from, because
 * "oldest" and "newest" answer different questions — is anything stale, and how
 * recent is the most recent refresh — and one collapsed number cannot be read as
 * either without knowing which it is.
 *
 * That is what turns "deployed" into "verified live", and it is deliberately
 * independent of how the site is deployed: any automation can compare this
 * against the commit it just built, and a person can compare it against what
 * they expected to be live. `_headers` marks it `no-store`, because a cached
 * answer here would report the previous deploy as current.
 *
 * The commit SHA is not sensitive — it is an opaque identifier, and every
 * deploy-verification scheme needs a public fact to compare against.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PAYLOADS } from "../src/lib/payloads.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist");
const DATA = join(HERE, "..", "..", "data", "published");

/** The short SHA, or "unknown" outside a checkout — never a thrown build. */
function commit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: HERE,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Every manifest payload's `as_of`, plus the two aggregates over them.
 *
 * The population is `payloads.js` rather than a directory listing, so the
 * freshness a deployed site reports describes the data it actually serves. A
 * payload that fails to parse maps to `null` instead of dropping out, so a
 * broken file shows here rather than silently improving the aggregates.
 */
function dataFreshness() {
  const payloads = Object.fromEntries(
    PAYLOADS.map(({ file }) => {
      try {
        return [file, JSON.parse(readFileSync(join(DATA, `${file}.json`), "utf-8")).as_of ?? null];
      } catch {
        return [file, null];
      }
    })
  );
  const dates = Object.values(payloads).filter(Boolean).sort();
  return {
    oldest_as_of: dates[0] ?? null,
    newest_as_of: dates[dates.length - 1] ?? null,
    payloads,
  };
}

const data = dataFreshness();
const version = {
  commit: commit(),
  built_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  data,
};

writeFileSync(join(DIST, "version.json"), JSON.stringify(version) + "\n", "utf-8");
console.log(
  `[gen-version] wrote dist/version.json — ${version.commit}, data ` +
    `${data.oldest_as_of ?? "?"} … ${data.newest_as_of ?? "?"}`
);
