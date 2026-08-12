/**
 * Data layer — fetches the published JSONs from /data/published/.
 *
 * Production contract: the SPA fetches ONLY from /data/<file>.json.
 * Dev server proxies ../data/published/*.json into /data/published/*.json
 * via vite.config.js fs.allow. Production CDN serves them next to the
 * bundle. The user browser NEVER calls upstream APIs.
 *
 * Graceful degradation: if any file 404s or the body is invalid JSON,
 * we return null and surface a non-fatal warning. The page renders
 * with whatever subset loaded.
 */

import { HOME } from "./content.js";
import { payloadsFor } from "./payloads.js";

const BASE = "/data/published";

async function fetchJson(name) {
  const url = `${BASE}/${name}.json`;
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) {
      console.warn(`[vyarno] ${name}.json: HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[vyarno] ${name}.json: ${e.message}`);
    return null;
  }
}

/**
 * Load one route's payloads, in parallel; return whichever succeeded.
 *
 * The list is the manifest's, so adding or removing a payload needs no edit
 * here. Failures become `null` (see `fetchJson`) and the page renders whatever
 * subset loaded, so one 404 costs one card rather than the whole calculator.
 *
 * **The route is required, and `payloadsFor` throws on one no row names.** The
 * argument could default to fetching everything, and that default would be
 * wrong in the direction nothing catches: a page whose key was misspelled would
 * quietly download every payload on the site and still render, so the mistake
 * would show up as a slow page rather than as an error.
 *
 * What the less obvious payloads are, since the manifest names them only for the
 * reader:
 *
 * - `cityPrice` — per-district €/m² scraped from imot.bg/sredni-ceni. On a
 *   miss the home block falls back to a placeholder pill; there is no canonical
 *   Eurostat €/m² to fall back to (it publishes an hpi_ndh_q RATE-OF-CHANGE
 *   index, no absolute level).
 * - `regionSalary` — Sofia-city average monthly GROSS wage, by quarter (НСИ
 *   Labour_1.1.2.2_EUR_EN.xlsx, the "{year}trimes" sheets, row "-Sofia cap.").
 *   On a miss
 *   the comparator falls back to a sentinel, as `HOME.eurPerM2_offlineFallback`
 *   does for the €/m².
 * - `salaryDist` — the individual gross-earnings percentile ladder: Eurostat
 *   SES distribution shape re-levelled to the live НСИ Sofia average. The unit
 *   is what matters — individual EARNINGS, not household disposable income,
 *   which mixes units and pushes almost every Sofia salary into the top few
 *   percent. `ilc_di01` is the wrong unit for this and is not published.
 *
 * @param {string} page  the route key, matched against each row's `pages`
 * @returns {Promise<Record<string, object|null>>} keyed by `PAYLOADS[].key`
 */
export async function loadAll(page) {
  const wanted = payloadsFor(page);
  const loaded = await Promise.all(wanted.map((entry) => fetchJson(entry.file)));
  return Object.fromEntries(wanted.map((entry, i) => [entry.key, loaded[i]]));
}

/**
 * The rate the mortgage calculator starts from (mortgage.json schema 2.0).
 *
 * Leads with `new_business` — the ECB MIR average interest rate on home
 * loans BG banks actually signed last month. That is the honest answer to
 * "what will this cost me", and it is the AAR specifically, because the
 * annuity formula needs the interest rate. The APRC (same loans, fees
 * included) is a strictly higher number shown alongside it, never used as
 * the payment rate — using it would overstate the monthly payment.
 *
 * There is deliberately no "best offer" tier. See
 * docs/data-sources.md §"Not available (do not cite as a working source)".
 *
 *   1. new_business.value_pct        ECB MIR new business AAR — the default
 *   2. outstanding_stock.value_pct   BNB housing book. Only if tier 1 is
 *                                    missing, and it answers a DIFFERENT
 *                                    question (what existing borrowers
 *                                    average), so the UI must relabel — the
 *                                    returned `label` is how it knows.
 *   3. HOME.rateDefaultPct           offline sentinel, reached only if
 *                                    mortgage.json didn't load at all
 *
 * `refPeriod` rides along with the tier: the ECB (or БНБ) reference month the
 * figure describes, so the caption can date the rate rather than calling it
 * "current". That word is exactly what the README's provenance section holds
 * the page away from — every number carries the publisher's date, not a vague
 * "current" — and this line was the last one still leaning on it. Null for the
 * offline sentinel, which has no publisher date because nothing was fetched.
 *
 * @returns {{pct: number, label: string, refPeriod: string|null}} `label`
 *   drives the provenance caption, so the user always sees which tier the
 *   number came from, and `refPeriod` dates it.
 */
export function mortgageDefaultRate(mortgage) {
  const offline = { pct: HOME.rateDefaultPct, label: "offline_sentinel", refPeriod: null };
  if (!mortgage) return offline;

  const nb = mortgage.new_business;
  if (nb && nb.value_pct != null) {
    return { pct: nb.value_pct, label: "new_business", refPeriod: nb.ref_period ?? null };
  }
  const os = mortgage.outstanding_stock;
  if (os && os.value_pct != null) {
    return { pct: os.value_pct, label: "outstanding_stock", refPeriod: os.ref_period ?? null };
  }
  return offline;
}

/**
 * The all-in cost of the same new loans — APRC (ГПР), fees included.
 * Shown next to the rate so "what it really costs" is never hidden.
 * Null when unavailable, so callers can omit the line entirely.
 *
 * @returns {{pct: number, refPeriod: string, url: string} | null}
 */
export function mortgageAprc(mortgage) {
  const a = mortgage?.new_business?.aprc;
  if (!a || a.value_pct == null) return null;
  return { pct: a.value_pct, refPeriod: a.ref_period, url: a.source_url };
}

/**
 * BNB borrower-based limits, in force on every BG mortgage since 2024-10-01
 * (LTV-O ≤ 85% ⇒ 15% minimum down payment, DSTI-O ≤ 50% of net income,
 * maturity ≤ 30 years).
 *
 * Published in mortgage.json so the calculator's caps are data-driven; the
 * literals here are the offline fallback only, mirroring
 * `mortgage.py#BNB_LENDING_LIMITS`. Update both together.
 *
 * @returns {{minDownPaymentPct: number, dstiMaxPct: number,
 *            maturityMaxYears: number, prudentDstiPct: number,
 *            observedDstiPct: number|null, sourceUrl: string|null}}
 */
export function mortgageLendingLimits(mortgage) {
  const l = mortgage?.lending_limits;
  return {
    minDownPaymentPct: l?.min_down_payment_pct ?? 15,
    dstiMaxPct: l?.dsti_max_pct ?? 50,
    maturityMaxYears: l?.maturity_max_years ?? 30,
    prudentDstiPct: l?.prudent_dsti_pct ?? 30,
    observedDstiPct: l?.observed_weighted_avg_dsti_pct ?? null,
    sourceUrl: l?.source_url ?? null,
  };
}

/*
 * Freshness is not computed here. `view/freshness.js#dataAge` owns it, and returns both
 * aggregates together with the per-payload rows behind them — so a caller
 * reaching for "the site's date" has to say which one it means, next to the
 * eight it was derived from.
 */
