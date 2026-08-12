/**
 * View module — the derived values `App.svelte` renders, as pure functions.
 *
 * `mirror.js` holds the formulas and `data.js` the fallback chains. This is the
 * layer between them: every number on screen is a formula *wired* to an input,
 * and a correct formula fed the wrong input is still a wrong number on
 * someone's screen. Wiring that lives inside `$derived(...)` in the template
 * has no runtime harness and nothing can test it.
 *
 * So the rule for this file, and the reason it is not just "helpers":
 *
 *   **Where a wrong wiring would be a wrong number, make the wrong wiring
 *   impossible to express — do not merely test against it.**
 *
 * Concretely: `savingsSince2020` takes the published payloads and computes the
 * cumulative itself, so no caller can hand it the user's basket rate by
 * mistake. `headlineRate` reads only the headline payload, so it cannot be
 * handed the categories and quietly become Σ(w·r). `mortgagePanel` reads the
 * down payment out of the published lending limits rather than accepting it,
 * so a caller cannot pass 0%.
 *
 * The template's job after this file is rendering: pick a formatter, choose a
 * colour, place a string. Arithmetic in `App.svelte` belongs here (or in
 * `mirror.js`) with a test in `scripts/verify_view.mjs` — same commit.
 */

import {
  allItemsCumulativeSince2020,
  annuityPayment,
  annuityReverse,
  bgGrossFromNet,
  bgHouseholdPayroll,
  bgMarginalRatePct,
  bgNetSalary,
  bgTaxWedge,
  buildLadder,
  composeLadder,
  dealsAtQuarter,
  dealInYearsOfPay,
  unoccupiedSharePct,
  indexTimesBase,
  shortfallPct,
  flooredCuts,
  homeYears,
  householdNetRaisePct,
  cashErosion,
  officialCumulativeSince2020,
  payrollParams,
  percentile,
  wageGap,
  SALARY_LADDER_CUTS,
} from "./mirror.js";
// The share sentence is a string, and a string this file assembles has to be
// formatted here: a caller that ran `number()` itself would be the half of the
// artefact no test covers, and the locale's decimal comma is part of what the
// reader sends. `t` is the substitution helper, not the copy — every word
// still arrives as an argument.
import { number } from "./format.js";
import { SECTOR_HINTS, t } from "./content.js";

// ---------------------------------------------------------------------------
// THE BASKET THE SLIDERS START FROM
// ---------------------------------------------------------------------------

/**
 * The weights the sliders are seeded with, straight from the published
 * payload.
 *
 * Deliberately NOT rounded. Rounding each division to a whole percent looks
 * like honesty about slider precision, but it makes the default basket sum to
 * 97 and produces a third headline figure that matches neither Eurostat's
 * all-items rate nor the official-weight basket. The slider's own `step` still
 * governs what the *user* can enter; the seed is exact, so the default view is
 * exactly "the average Bulgarian's basket".
 *
 * @param {Array<{weight_pct:number}>} categories
 * @returns {number[]}
 */
export function officialBasketWeights(categories) {
  return (categories ?? []).map((c) => c.weight_pct);
}

// ---------------------------------------------------------------------------
// FRESHNESS
// ---------------------------------------------------------------------------

/**
 * Fallback cadence, in days, for a payload whose manifest row states no
 * `cadenceDays` — so a row added without one still gets a verdict, not a pass.
 *
 * The real rule is per payload, in `payloadStatus`. A single site-wide threshold
 * cannot serve three release rhythms: 45 days is a month and a half late for the
 * monthly HICP release and would condemn the quarterly НСИ wage series every
 * quarter.
 */
export const STALE_AFTER_DAYS = 45;

/**
 * How far past its cadence a payload must be before the page raises the banner.
 *
 * Inside the cadence it is fresh; past it merely "due" — the upstream has
 * probably published and we have not fetched — and past this multiple of it a
 * refresh was genuinely skipped. 1.5 puts a monthly payload's alarm at ~46 days,
 * late enough that an ordinary slip in a hand-run refresh is not an alarm.
 */
export const OVERDUE_MULTIPLE = 1.5;

/**
 * Whole days between an ISO date and `now`, or null if there is no date.
 *
 * @param {string | undefined | null} asOf
 * @param {number} now  epoch ms
 * @returns {number | null}
 */
function daysSince(asOf, now) {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  return Number.isFinite(t) ? Math.floor((now - t) / 86400000) : null;
}

/**
 * One payload's freshness against ITS OWN cadence: fresh, due, or overdue.
 *
 * `absent` is its own verdict rather than a silent pass. A payload that failed
 * to fetch is not fresh, and reporting it as fresh is how a page renders
 * fallback sentinels while claiming today's date.
 *
 * @param {{as_of?: string} | null} payload
 * @param {number} [cadenceDays]  from the manifest; STALE_AFTER_DAYS if absent
 * @param {number} [now]  epoch ms, injectable for tests
 * @returns {{status: "fresh"|"due"|"overdue"|"absent", daysOld: number|null, cadenceDays: number}}
 */
export function payloadStatus(payload, cadenceDays = STALE_AFTER_DAYS, now = Date.now()) {
  const cadence = Number.isFinite(cadenceDays) && cadenceDays > 0 ? cadenceDays : STALE_AFTER_DAYS;
  const daysOld = daysSince(payload?.as_of, now);
  if (daysOld === null) return { status: "absent", daysOld: null, cadenceDays: cadence };
  if (daysOld > cadence * OVERDUE_MULTIPLE) {
    return { status: "overdue", daysOld, cadenceDays: cadence };
  }
  return { status: daysOld > cadence ? "due" : "fresh", daysOld, cadenceDays: cadence };
}

/**
 * Every payload's row for the data panel, plus the page-level verdict.
 *
 * The one place the site decides how fresh it is, and it decides per payload.
 * `stale` means "some payload is overdue against its own cadence", so a
 * quarterly series 60 days old does not raise it.
 *
 * Both aggregates come back, and they travel with the rows they were computed
 * from so neither can be mistaken for the other:
 *
 * - `oldestAsOf` / `daysOld` — the minimum, because the staleness question is
 *   "is ANYTHING here out of date". The maximum would let one
 *   freshly-republished file stand in for seven stale ones, and `payroll.json`
 *   is hand-maintained and the payload most likely to be refreshed alone.
 * - `newestAsOf` — the most recent refresh, for a sentence about the refresh
 *   rather than about the figures.
 *
 * @param {Record<string, {as_of?: string} | null>} parts  the loadAll() result
 * @param {ReadonlyArray<object>} manifest  PAYLOADS, injectable for tests
 * @param {number} [now]  epoch ms, injectable for tests
 * @returns {{rows: Array<object>, oldestAsOf: string, newestAsOf: string,
 *            daysOld: number, stale: boolean, overdue: Array<object>,
 *            missing: Array<object>}}
 */
export function dataAge(parts, manifest = [], now = Date.now()) {
  const rows = manifest.map((entry) => {
    const payload = parts?.[entry.key] ?? null;
    const { status, daysOld, cadenceDays } = payloadStatus(payload, entry.cadenceDays, now);
    return {
      key: entry.key,
      file: entry.file,
      name: entry.name,
      feeds: entry.feeds,
      status,
      daysOld,
      cadenceDays,
      asOf: payload?.as_of ?? null,
      refPeriod: entry.refPeriod?.(payload) ?? null,
      refPeriodIsDayDate: entry.refPeriodIsDayDate === true,
      refPeriodSecondary: entry.refPeriodSecondary?.(payload) ?? null,
      source: payload?.source ?? null,
      sourceUrl: payload?.source_url ?? null,
    };
  });

  const dates = rows
    .map((r) => r.asOf)
    .filter(Boolean)
    .sort();
  const today = new Date(now).toISOString().slice(0, 10);
  const oldestAsOf = dates[0] ?? today;
  const newestAsOf = dates[dates.length - 1] ?? today;

  return {
    rows,
    oldestAsOf,
    newestAsOf,
    daysOld: daysSince(oldestAsOf, now) ?? 0,
    stale: rows.some((r) => r.status === "overdue"),
    overdue: rows.filter((r) => r.status === "overdue"),
    missing: rows.filter((r) => r.status === "absent"),
  };
}

// ---------------------------------------------------------------------------
// THE HEADLINE — verbatim, never derived
// ---------------------------------------------------------------------------

/**
 * Sofia-city's код in `region_salary.json`, and the one place the SPA names an
 * област at all.
 *
 * Every other область reaches the page as data — a row in the payload, with
 * НСИ's own name for it in both languages. This one is a constant because two
 * things are true of Sofia-city and of nowhere else: it is its own statistical
 * region (BG411), so имот.bg's град and НСИ's област are the same area there
 * and only there, and it is the област the page showed before it could show any
 * other. A second code added beside this one is the smell that a place is being
 * special-cased; there should never be one.
 */
export const SOFIA_CITY_CODE = "sofiya";

/**
 * The three states an област's €/m² can be in, and they are three claims.
 *
 * - `priced`  — `city_price.json` carries a row for it.
 * - `unread`  — имот.bg serve a page for it and this refresh did not read it.
 * - `nopage`  — имот.bg serve no page for it at all.
 *
 * **Only `nopage` may be said in имот.bg's name.** «имот.bg не публикува цени
 * за Варна» is false — they publish Варна's — and it is the sentence one flag
 * produces for every city a refresh missed, wearing the wording of the one
 * place it is true of. The payload's `city_pages` is what separates them; see
 * `sources/imot.py#build_city_price_payload`.
 */
export const CITY_PRICED = "priced";
export const CITY_UNREAD = "unread";
export const CITY_NO_PAGE = "nopage";

/**
 * The two НСИ labels that cannot stand alone in a list, and what a person calls
 * them instead.
 *
 * НСИ name BG411 «София(столица)» and the област around it «София», because in
 * their table both are области. In a control asking somebody where they live,
 * one of those is the capital and the other is the only entry on the list that
 * is not a town — and «София (столица)» beside «София (област)», which is what
 * a mechanical bracket rule produces from the same pair, is administrative
 * vocabulary in both halves. «София» and «Софийска област» are what a Bulgarian
 * says out loud.
 *
 * Exported so `verify_view.mjs` can hold the keys against the live payload:
 * a key that matches no row is НСИ having renamed one, and the rename then
 * stops applying silently — «София» would render for the ОБЛАСТ, adjacent to
 * the capital in the same list, with a wage 32% lower behind it.
 */
export const REGION_RENAMES = Object.freeze({
  bg: Object.freeze({ "София(столица)": "София", София: "Софийска област" }),
  en: Object.freeze({ "Sofia cap.": "Sofia", Sofia: "Sofia oblast" }),
});

/**
 * The name the picker, the cards and every caption print for one област.
 *
 * НСИ's own label is the base and stays the base for twenty-six of the
 * twenty-eight; the pair above is renamed, and it is the pair that costs most.
 * The picker sorts the two Софии adjacent, and a reader who takes the wrong one
 * is compared against a wage 32% lower and told nobody publishes a €/m² where
 * they live.
 *
 * **A table of two needs a rule over the whole collection beside it, and that
 * rule is a test rather than a branch in here.** `verify_view.mjs` asserts over
 * the published payload that every option name is non-empty and unique, that
 * both keys above still match a row НСИ publish, and that no name the table did
 * not write is a whole-word prefix of another. So an НСИ split this table does
 * not cover — a «Пловдив(град)» row appearing beside «Пловдив» — fails a run
 * instead of shipping two entries a reader cannot tell apart.
 *
 * The bracket spacing below is the other half of that rule and not decoration:
 * НСИ write no space before the bracket, Bulgarian writes one, and normalising
 * it is what lets the prefix test see such a split at all.
 *
 * @param {string} name   НСИ's own label for this row, in one language
 * @param {"bg"|"en"} lang
 * @returns {string}
 */
export function regionDisplayName(name, lang) {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  return REGION_RENAMES[lang === "bg" ? "bg" : "en"][raw] ?? raw.replace(/(\S)\(/g, "$1 (");
}

/**
 * The области a reader may pick, in the order the picker lists them.
 *
 * **Alphabetical in the reader's own language, not by size.** Size order puts
 * София first, which reads as a default on a control whose whole point is that
 * there is not one (P7) — and it makes a 28-item list on a 360px screen
 * unscannable, because nobody knows where Разград falls in a population
 * ranking. Bulgarian sorts with the BG collator, which orders Cyrillic
 * correctly where a plain `<` does not.
 *
 * The names come out of the payload in each language through
 * `regionDisplayName`, which passes twenty-six of them through unchanged and
 * renames the two Софии. Nothing here transliterates: their Bulgarian for BG411
 * is «София(столица)», which is not a string anybody would arrive at from
 * "Sofia cap.".
 *
 * `coverage` is one of the three states above, and it is carried as a fact
 * about the option rather than as a reason to leave any of them out: НСИ
 * publish a wage for all 28, a reader who lives in any of them gets it, and the
 * missing half is named rather than silently absent (P11).
 *
 * @param {object|null} regionSalary  data.regionSalary (region_salary.json)
 * @param {object|null} cityPrice     data.cityPrice (city_price.json)
 * @param {"bg"|"en"} lang
 * @returns {Array<{code:string, name:string, coverage:string}>}
 */
export function regionOptions(regionSalary, cityPrice, lang) {
  const rows = Array.isArray(regionSalary?.regions) ? regionSalary.regions : [];
  const priced = new Set((cityPrice?.cities ?? []).map((c) => c?.code).filter(Boolean));
  const pages = new Set(cityPrice?.city_pages ?? []);
  const collator = new Intl.Collator(lang === "bg" ? "bg" : "en");
  return rows
    .map((r) => ({
      code: r?.code ?? "",
      name: regionDisplayName(lang === "bg" ? r?.bg_name : r?.en_name, lang),
      coverage: priced.has(r?.code) ? CITY_PRICED : pages.has(r?.code) ? CITY_UNREAD : CITY_NO_PAGE,
    }))
    .filter((o) => o.code && o.name)
    .sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * One област's display name in both languages, or "" for each.
 *
 * Both, because `calculator.svelte.js` is language-agnostic and the components
 * pick. One implementation with the picker's, so a card cannot print a name the
 * option the reader chose it with did not carry.
 *
 * @param {object|null} regionSalary  data.regionSalary (region_salary.json)
 * @param {string} code
 * @returns {{bg: string, en: string}}
 */
export function regionNames(regionSalary, code) {
  const rows = Array.isArray(regionSalary?.regions) ? regionSalary.regions : [];
  const row = rows.find((r) => r?.code === code);
  if (!row) return { bg: "", en: "" };
  return {
    bg: regionDisplayName(row.bg_name, "bg"),
    en: regionDisplayName(row.en_name, "en"),
  };
}

/**
 * Which of the three states one област's €/m² is in — the same answer
 * `regionOptions` puts on the picker, for the cards that render outside it.
 *
 * One implementation, so a card cannot decide the coverage differently from the
 * option the reader chose it with.
 *
 * @param {object|null} cityPrice  data.cityPrice (city_price.json)
 * @param {string} code
 * @returns {string} one of CITY_PRICED / CITY_UNREAD / CITY_NO_PAGE
 */
export function cityCoverage(cityPrice, code) {
  if (cityRow(cityPrice, code)) return CITY_PRICED;
  return (cityPrice?.city_pages ?? []).includes(code) ? CITY_UNREAD : CITY_NO_PAGE;
}

/**
 * One city's whole row out of `city_price.json`, or null.
 *
 * The price twin of `regionRow`, and separate from it because the two payloads
 * cover different sets: 28 области have a wage and 27 cities have a price.
 * Софийска област is the one with a wage and no price, so a lookup that fell
 * back to "the region row's city" would hand a reader in Самоков София's €/m²
 * — the exact substitution this whole change exists to end.
 *
 * @param {{cities?: Array<{code?: string}>} | null | undefined} payload
 * @param {string} code
 * @returns {object|null}
 */
export function cityRow(payload, code) {
  if (!code) return null;
  const rows = Array.isArray(payload?.cities) ? payload.cities : [];
  return rows.find((r) => r?.code === code) ?? null;
}

/**
 * One област's whole row out of `region_salary.json`, or null.
 *
 * The single place a region code becomes a row, so "which област's figures" is
 * answered once rather than by every caller doing its own `.find`. That is the
 * `view.js` rule in `AGENTS.md` — which number feeds which formula lives here
 * and never inside a `$derived` — applied to a lookup rather than a formula,
 * and it is the same rule for the same reason: a second `.find` elsewhere is a
 * second place that can silently answer with a different област.
 *
 * Null for an unknown or absent code, never a first row and never Sofia. See
 * `regionQuarter` on why there is no fallback region.
 *
 * @param {{regions?: Array<{code?: string}>} | null | undefined} payload
 * @param {string} code
 * @returns {object|null}
 */
export function regionRow(payload, code) {
  if (!code) return null;
  const rows = Array.isArray(payload?.regions) ? payload.regions : [];
  return rows.find((r) => r?.code === code) ?? null;
}

/**
 * One област's average gross wage: НСИ's latest published quarterly average,
 * read out of the payload's row for `code`.
 *
 * WHY A QUARTER AND NOT A MONTH
 *
 * Bulgarian wages spike in March on annual bonuses — March 2026 alone was
 * €2061 against a Sofia Q1 average of €1915 — so quoting the latest single
 * month would overstate the average by 7.6% every spring and understate it
 * every April. НСИ report quarterly for the same reason, and the payload
 * carries their quarters.
 *
 * WHY THIS READS RATHER THAN COMPUTES
 *
 * `region_salary.json` carries НСИ's own published quarterly series and nothing
 * else, so the figure on screen is one НСИ published rather than one derived
 * from figures they published. Their licence §2.1.1 forbids distributing
 * производни и сборни произведения, and the cheapest way to stay clear of that
 * is to have no derived figure to argue about (docs/legal.md §НСИ). This
 * function therefore selects; it must never average, rebase or interpolate.
 *
 * WHY THERE IS NO FALLBACK REGION
 *
 * An unknown or absent `code` returns the zeroed shape rather than the largest
 * област, the first row, or Sofia. Every one of those renders a real wage under
 * the wrong place name — the failure this whole change exists to end — and each
 * would look right on screen. A reader who has chosen nothing yet gets no
 * figure, which is P7 and what the card is written to say.
 *
 * The headline is the row's `value_eur` when present, and otherwise the latest
 * key in its series — the same cell, and it keeps a payload written by an older
 * envelope readable.
 *
 * `isPreliminary` is НСИ's own marker for the year the quarter falls in, and it
 * travels with the figure because the card has to say it. They star a sheet
 * title until they finalise the year, so their newest quarter carries it for
 * about a year — long enough that a reader meeting a starred figure has no
 * reason to think it is anything but settled unless told. Both returns carry
 * it: only the headline path is exercised by a live payload, so a flag wired
 * into that one alone drops the marker on the older envelope the fallback is
 * there for.
 *
 * @param {{is_preliminary?: boolean, regions?: Array<{code?: string,
 *          bg_name?: string, en_name?: string, value_eur?: number,
 *          series_by_period?: Record<string, number>}>} | null | undefined} payload
 * @param {string} code  a `regions.py#REGIONS` code, e.g. "sofiya"
 * @returns {{value: number, refPeriod: string, isPreliminary: boolean,
 *            bgName: string, enName: string}} zeroed when unavailable
 */
export function regionQuarter(payload, code) {
  const empty = { value: 0, refPeriod: "", isPreliminary: false, bgName: "", enName: "" };
  const row = regionRow(payload, code);
  if (!row) return empty;

  const isPreliminary = Boolean(payload?.is_preliminary);
  const names = { bgName: row.bg_name ?? "", enName: row.en_name ?? "" };
  const series = row.series_by_period ?? {};
  const quarters = Object.keys(series).filter(
    (k) => /^\d{4}-Q[1-4]$/.test(k) && typeof series[k] === "number"
  );

  if (typeof row.value_eur === "number" && /^\d{4}-Q[1-4]$/.test(payload?.ref_period ?? "")) {
    return { value: row.value_eur, refPeriod: payload.ref_period, isPreliminary, ...names };
  }
  if (!quarters.length) return { ...empty, ...names };
  // "YYYY-Qn" sorts lexicographically as chronologically, for any 4-digit year.
  const refPeriod = quarters.sort()[quarters.length - 1];
  return { value: series[refPeriod], refPeriod, isPreliminary, ...names };
}

/**
 * The COUNTRY's average gross wage: НСИ's all-activities «Общо» row, selected
 * out of `sector_salary.json` the same way `regionQuarter` selects an област's.
 *
 * WHY THIS EXISTS BESIDE `regionQuarter`
 *
 * Two figures on the page answer two different questions and only one of them
 * is about where the reader lives. The wage comparator asks "what does the
 * average person in YOUR област take home", and takes an област. The percentile
 * ladder asks "where does this pay sit among everyone earning one", and the
 * only earnings DISPERSION anybody publishes for Bulgaria is national — so the
 * level it is re-levelled onto has to be national too, or the two halves of one
 * multiplication describe two different populations.
 *
 * `mirror.js#composeLadder` divides this by `shape.ses_mean`, which is
 * Eurostat's mean over the whole country. НСИ's «Общо» is the mean over the
 * whole country. That is the like-for-like pair, and any one област in this
 * position asserts that its own dispersion matches the national one — which
 * nothing measures (`docs/data-sources.md` §"Salary distribution").
 *
 * **The all-activities row is not a sector**, which is why `sectorOptions`
 * drops it from the picker and `sectorComparison` refuses it by name. It is the
 * one place in the app that row is what is wanted, and it is wanted precisely
 * because it is not one activity.
 *
 * Selected, never computed, for the reason `regionQuarter` carries: НСИ's
 * §2.1.1 forbids distributing производни произведения, so the level on screen
 * has to be a cell they printed (docs/legal.md §НСИ).
 *
 * @param {{ref_period?: string, is_preliminary?: boolean,
 *          sectors?: Array<{en_name?: string, value_eur?: number,
 *          series_by_period?: Record<string, number>}>} | null | undefined} payload
 * @returns {{value: number, refPeriod: string, isPreliminary: boolean}} zeroed
 *          when the row or the payload is not there
 */
export function nationalQuarter(payload) {
  const empty = { value: 0, refPeriod: "", isPreliminary: false };
  const rows = Array.isArray(payload?.sectors) ? payload.sectors : [];
  const row = rows.find((s) => s?.en_name === SECTOR_TOTAL_KEY);
  if (!row) return empty;

  const isPreliminary = Boolean(payload?.is_preliminary);
  const series = row.series_by_period ?? {};
  const quarters = Object.keys(series).filter(
    (k) => /^\d{4}-Q[1-4]$/.test(k) && typeof series[k] === "number"
  );

  if (typeof row.value_eur === "number" && /^\d{4}-Q[1-4]$/.test(payload?.ref_period ?? "")) {
    return { value: row.value_eur, refPeriod: payload.ref_period, isPreliminary };
  }
  if (!quarters.length) return empty;
  const refPeriod = quarters.sort()[quarters.length - 1];
  return { value: series[refPeriod], refPeriod, isPreliminary };
}

/**
 * The «Общо» row itself, for the surface that shows its quarterly cells.
 *
 * `/how/` prints НСИ's own series a year to a row, and it prints the country's
 * because the ladder above it is anchored on the country's. One selector, so
 * the table and the anchor cannot end up describing different rows.
 *
 * @param {{sectors?: Array<{en_name?: string}>} | null | undefined} payload
 * @returns {object|null}
 */
export function nationalRow(payload) {
  const rows = Array.isArray(payload?.sectors) ? payload.sectors : [];
  return rows.find((s) => s?.en_name === SECTOR_TOTAL_KEY) ?? null;
}

/**
 * Eurostat's official all-items 12-month rate, exactly as published.
 *
 * This function takes the headline payload and nothing else, on purpose: it
 * physically cannot be handed the category list and quietly become Σ(w·r).
 * The two differ by ~0.16 pp on BG data (December chain link — see
 * docs/math.md §"Two reconciliations"), and the national strip must carry the
 * official figure, not our reconstruction of it.
 *
 * @param {{headline_rate_pct?: number} | null | undefined} payload
 * @returns {number}
 */
export function headlineRate(payload) {
  const v = payload?.headline_rate_pct;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Whether the published headline is Eurostat's flash estimate.
 *
 * Read off the payload's own `is_flash`, never inferred from the months. The
 * two are gated to agree at publish time (`validate.py#validate_headline_flash`),
 * so inferring would give the same answer today and for a worse reason: a
 * payload whose index half is absent has no months to compare, and the
 * inference's answer there is "settled" — a marker missing from a figure that
 * needs it, which is the one direction that misleads a reader rather than
 * merely hedging at them.
 *
 * Absent reads as false, and that is the safe end: it prints the figure with no
 * marker, which is what an envelope written before the field existed means.
 *
 * @param {{is_flash?: boolean} | null | undefined} payload
 * @returns {boolean}
 */
export function headlineIsFlash(payload) {
  return payload?.is_flash === true;
}

/**
 * Whether the all-items headline and the per-division figures are at DIFFERENT
 * months — the state in which the gap between them is mostly not the method.
 *
 * Eurostat's flash publishes the all-items rate about two weeks before any
 * division, so `hicp_headline.json` can sit at 2026-07 while
 * `hicp_categories.json` is wholly at 2026-06 (docs/math.md §"Per-field
 * provenance"). Both figures are theirs at the months they name, and every page
 * that prints them side by side states each period beside its own number.
 *
 * **The PROSE over them is what this exists for.** The gap Σ(w·r) − headline is
 * ~0.16 pp when the two describe one month, which is the January re-weighting
 * and the December chain link and nothing else. During the flash it is several
 * times that and the extra is the month, so a paragraph explaining the whole
 * difference as the re-weighting is false exactly when a reader is most likely
 * to stop and check — the same failure `COPY.explainSameMonth` would be. Static
 * copy cannot be right in both states, so both surfaces branch here rather than
 * each carrying its own comparison to keep in step.
 *
 * Two months or neither: with one payload missing there is nothing to compare,
 * and false is the safer answer — it claims nothing about a month the page
 * cannot name.
 *
 * @param {object} args
 * @param {string} args.headlineMonth  hicp_headline.json's ref_period, "YYYY-MM"
 * @param {string} args.basketMonth    the divisions' ref_period, "YYYY-MM"
 * @returns {boolean}
 */
export function monthsSplit({ headlineMonth, basketMonth }) {
  return Boolean(headlineMonth) && Boolean(basketMonth) && headlineMonth !== basketMonth;
}

// ---------------------------------------------------------------------------
// PERCENTILE — position from the bottom
// ---------------------------------------------------------------------------

/**
 * The rendered percentile position, clamped to [1, 99].
 *
 * `mirror.js#percentile` returns a position FROM THE BOTTOM. This is the only
 * place the SPA is allowed to turn it into a display number, and it is
 * monotonic by construction: more money never produces a smaller output. The
 * inverted framing ("top N%") once rendered a €300/mo income as an
 * achievement; expressing that inversion now requires editing this function,
 * where the test lives.
 *
 * @param {number} rank  mirror.js#percentile output, 0 when unknown
 * @returns {number} 0 when unknown, else 1..99
 */
export function pctAhead(rank) {
  if (!(rank > 0)) return 0;
  return Math.max(1, Math.min(99, Math.round(rank)));
}

// ---------------------------------------------------------------------------
// SAVINGS
// ---------------------------------------------------------------------------

/**
 * What cash held since 2020 buys today.
 *
 * Takes PAYLOADS, never a rate, so the cumulative can only ever be a
 * since-2020 figure. Passing the user's own basket rate here would answer a
 * different question in the same sentence — the card says "от 2020 г." /
 * "since 2020" in fixed copy — and there is no argument to pass it through.
 *
 * **Prefers Eurostat's own all-items index** (`hicp_headline.json`'s CP00
 * `latest_index / index_by_year["2020"]`, both their published values), and
 * falls back to rebuilding the
 * cumulative from the divisions only when the headline payload has no index.
 * The two differ by ~1.9 pp over this span — 39.9% vs 41.8% today — and only
 * the first is a figure Eurostat publishes.
 *
 * **`basis` is returned, and the copy must follow it.** The fallback is a
 * legitimate number but a different one, so it must not inherit the sentence
 * that calls the figure Eurostat's. Labelling our reconstruction as the
 * official rate is the exact defect this function was changed to fix; a silent
 * fallback would reintroduce it whenever the payload degraded.
 *
 * @param {number} cash
 * @param {object|null} headline    published hicp_headline.json
 * @param {Array} categories        published hicp_categories.json entries
 * @returns {{valueToday:number, eaten:number, cumulativePct:number,
 *            basis:'all_items'|'average_basket'|'none'}}
 */
export function savingsSince2020(cash, headline, categories) {
  const official = allItemsCumulativeSince2020(headline);
  if (official != null) {
    return { ...cashErosion(cash, official), cumulativePct: official, basis: "all_items" };
  }
  if ((categories ?? []).length) {
    const pct = officialCumulativeSince2020(categories);
    return { ...cashErosion(cash, pct), cumulativePct: pct, basis: "average_basket" };
  }
  return { ...cashErosion(cash, 0), cumulativePct: 0, basis: "none" };
}

// ---------------------------------------------------------------------------
// HOUSING CARVE-OUT
// ---------------------------------------------------------------------------

/**
 * What the per-division € column is carved out of: take-home minus the housing
 * payments already committed. A person can carry both — buying while still
 * renting until the deal closes.
 *
 * @param {{salary:number, homeOn:boolean, monthlyMortgage:number, rent:number}} args
 * @returns {{housingCost:number, spendable:number}}
 */
export function housingCarveOut({ salary, homeOn, monthlyMortgage, rent }) {
  const housingCost = (homeOn ? Math.max(0, monthlyMortgage || 0) : 0) + (rent > 0 ? rent : 0);
  return { housingCost, spendable: Math.max(0, (salary || 0) - housingCost) };
}

// ---------------------------------------------------------------------------
// THE BASKET'S BUDGET — what was placed, and what was not
// ---------------------------------------------------------------------------

/**
 * The share of take-home a reader may claim they actually spend, 0–100.
 *
 * Exported because the control's handler clamps with it before the number
 * reaches `$state`: the label beside the slider renders that state directly, so
 * a value the arithmetic would reject but the label would print is a screen
 * saying 130% over a base of 100%. Clamping in one place is what stops the
 * claim and the figures carved out of it from describing different readers.
 *
 * **Anything unusable becomes 100, never 0.** A `NaN` out of a parsed field is
 * the app failing to read an answer, and answering it on the reader's behalf
 * with "you spend nothing" would empty every € figure on the page; 100 is the
 * same thing the app says to someone who never touched the control.
 *
 * @param {number} pct
 * @returns {number} 0–100
 */
export function clampSpendShare(pct) {
  if (!Number.isFinite(pct)) return 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * What the € column is measured against, and what the reader has left over.
 *
 * **The two modes measure the remainder differently, and that is the point.**
 * A basket of *percentage shares* says how a pot divides; it cannot say how big
 * the pot is, so the size of anything left outside it has to be STATED —
 * `spendSharePct` is the reader's claim about how much of their take-home
 * actually gets spent. A basket of *euros per month* is a list of real
 * payments, so the remainder is MEASURED off what they typed and needs no
 * claim; the euro mode ignores `spendSharePct` for that reason, and the two
 * cannot contradict each other on screen because only one of them is ever live.
 *
 * So `spendBase` — the amount the per-division € figures and
 * `mirror.js#contributions` are carved out of — is `spendable × s/100` in share
 * mode and **the euros actually entered** in euro mode. Feeding `spendable` to
 * both is the bug this function exists to make unexpressible: it silently
 * rescaled a €1,000 basket up to a €1,250 budget, so someone who typed their
 * real spending was shown thirteen numbers they had never typed, all of them
 * 25% too big, adding to a total they had deliberately not reached. The app was
 * insisting they spend everything.
 *
 * **`spendSharePct` defaults to 100 and every caller that omits it gets the
 * whole spendable amount**, which is both the honest default — a share the
 * reader has not claimed is not a share we may assume, and any other value
 * shrinks their headline € figure in the flattering direction
 * (docs/principles.md P7) — and what keeps this a no-op for a reader who never
 * touches the control.
 *
 * `leftover` is deliberately NOT called savings. Money not placed in a basket
 * is money this calculator has not been told about; it may be saved, invested,
 * sent to family or spent on something the reader forgot. We can state its
 * size and what prices do to money held as cash — we cannot state what it is
 * for (docs/principles.md P6).
 *
 * @param {object} args
 * @param {'pct'|'eur'} args.spendMode
 * @param {number[]} args.amounts   the basket, in whichever unit the mode uses
 * @param {number} args.spendable   take-home minus committed housing
 * @param {number} [args.spendSharePct]  share mode only: how much of `spendable`
 *   the reader says they actually spend, 0–100. Anything unusable is 100.
 * @returns {{entered:number, spendBase:number, leftover:number, over:number,
 *            leftoverPct:number, leftoverPerYear:number, hasLeftover:boolean}}
 */
export function basketBudget({ spendMode, amounts, spendable, spendSharePct }) {
  const entered = (amounts ?? []).reduce((s, x) => s + (x > 0 ? x : 0), 0);
  const budget = Math.max(0, spendable || 0);

  if (spendMode !== "eur") {
    const share = clampSpendShare(spendSharePct);
    const spendBase = (budget * share) / 100;
    const leftover = budget - spendBase;
    return {
      entered,
      spendBase,
      leftover,
      // A share cannot exceed the money it is a share of. Over-allocation is a
      // euro-mode state: it takes thirteen typed amounts to reach it.
      over: 0,
      leftoverPct: budget > 0 ? (100 * leftover) / budget : 0,
      leftoverPerYear: leftover * 12,
      hasLeftover: budget > 0 && leftover >= 1,
    };
  }

  const leftover = Math.max(0, budget - entered);
  return {
    entered,
    spendBase: entered,
    leftover,
    over: Math.max(0, entered - budget),
    leftoverPct: budget > 0 ? (100 * leftover) / budget : 0,
    leftoverPerYear: leftover * 12,
    // A euro or two of rounding is not a decision anybody made, and a row
    // announcing "€0 left over" is noise on every basket that happens to
    // balance. The panel only speaks when there is something to speak about.
    hasLeftover: budget > 0 && leftover >= 1,
  };
}

/**
 * The €/month the reader's own prices actually apply to.
 *
 * `extraPerMonth(salary, π)` answers "what does the same life as a year ago
 * cost now", and it was fed the whole take-home — which asserts that every
 * euro earned is a euro spent on something whose price moved. For anyone who
 * puts money aside that overstates the damage: unspent money does not get more
 * expensive.
 *
 * Housing stays in, because rent and a mortgage payment are spending; they are
 * carved out of the *basket* column so the thirteen divisions describe what is
 * left, not because they are outside the reader's outlay.
 *
 * **This reduces to `salary` exactly whenever nothing is left unplaced** — in
 * share mode at the default 100% claim, `spendBase` is `salary − housingCost`
 * and the sum is the salary again — so the headline € figure is unchanged for
 * everyone who has not deliberately left money out. Only a reader who told us
 * they spend less than they earn, by dragging the share control or by typing a
 * euro basket smaller than their pay, gets a different — smaller, truer —
 * number.
 *
 * @param {{housingCost:number, spendBase:number}} args
 * @returns {number} EUR/month
 */
export function exposedSpend({ housingCost, spendBase }) {
  return Math.max(0, housingCost || 0) + Math.max(0, spendBase || 0);
}

/**
 * What a year of the unplaced money would be worth if it sat in cash.
 *
 * **It takes the headline payload, never a rate**, for the reason the whole
 * file exists: the obvious wrong wiring is π, the reader's own basket rate,
 * and it is wrong in a way no reviewer would spot. Money that is *not* being
 * spent is not being spent on that basket — the yardstick for its purchasing
 * power is the general price level, which is the same choice the savings card
 * already makes and says out loud. A caller who cannot pass a rate cannot pass
 * the wrong one.
 *
 * It is a **projection and must be labelled as one** (docs/principles.md P5): it carries
 * the last twelve months' rate forward over the next twelve. Eurostat forecasts
 * nothing here and neither do we; the copy that renders this says so.
 *
 * @param {object} args
 * @param {number} args.leftoverPerYear  12 × the monthly leftover, EUR
 * @param {object|null} args.headline    published hicp_headline.json
 * @returns {{ratePct:number, valueToday:number, eaten:number}}
 */
export function leftoverIfHeldAsCash({ leftoverPerYear, headline }) {
  const ratePct = headlineRate(headline);
  return { ratePct, ...cashErosion(Math.max(0, leftoverPerYear || 0), ratePct) };
}

// ---------------------------------------------------------------------------
// THE HOME BLOCK
// ---------------------------------------------------------------------------

/**
 * The total asking price the mortgage math runs on.
 *
 * "auto" → имот.bg's median for the reader's own град × the size they picked.
 * "manual" → the price they typed for a home they already found.
 *
 * **`eurPerM2Isreal` is the third argument and it is not optional.** The €/m²
 * this receives falls back to `HOME.eurPerM2_offlineFallback`, a round constant
 * with no measurement behind it, whenever the chosen град has no published
 * median — which is now an ordinary state rather than a first-paint flicker: a
 * reader who has picked no област at all, and one whose област имот.bg publish
 * no city for. Multiplied by 70 m² that constant produced a €175,000 home, a
 * €661/month payment and a "44% of your pay" verdict, and it did not stop at
 * the home row: `monthlyMort` is carved out of the money the BASKET's € column
 * is computed from, so an invented mortgage quietly moved thirteen category
 * figures the reader never connected to it.
 *
 * Zero rather than a placeholder, because every consumer already gates on the
 * figure being positive and none of them can gate on a provenance they were
 * not handed. The row that would have printed it says what it is waiting for
 * instead.
 *
 * @param {{priceMode:string, manualPrice:number, eurPerM2:number, m2:number,
 *          eurPerM2IsReal:boolean}} args
 * @returns {number}
 */
export function homePriceFor({ priceMode, manualPrice, eurPerM2, m2, eurPerM2IsReal }) {
  if (priceMode === "manual" && manualPrice > 0) return manualPrice;
  if (!eurPerM2IsReal) return 0;
  return (eurPerM2 || 0) * (m2 || 0);
}

/**
 * The €/m² the price on screen is actually built from, and whose it is.
 *
 * **The sentence quotes a per-square-metre figure in the same breath as the
 * total, so the two have to be the same number.** They were not in manual
 * mode: «70 м² в София ≈ €200 000 (≈2501€/м², медиана)» over a price the
 * reader typed, where 200 000 ÷ 70 is 2857. Both figures were real and the
 * bracket explained the other one — имот.bg's median, captioned as the basis of
 * a price имот.bg had nothing to do with.
 *
 * Same shape as `homePriceFor`, and it takes the same arguments so the two
 * cannot answer about different prices. `isOwn` is a fact rather than a word;
 * the component picks the words.
 *
 * @param {{priceMode:string, manualPrice:number, eurPerM2:number, m2:number,
 *          eurPerM2IsReal:boolean}} args
 * @returns {{eurPerM2:number, isOwn:boolean}}
 */
export function homePriceBasis({ priceMode, manualPrice, eurPerM2, m2, eurPerM2IsReal }) {
  if (priceMode === "manual" && manualPrice > 0) {
    return { eurPerM2: m2 > 0 ? manualPrice / m2 : 0, isOwn: true };
  }
  return { eurPerM2: eurPerM2IsReal ? eurPerM2 || 0 : 0, isOwn: false };
}

/**
 * Clamp the term to the BNB maturity ceiling.
 *
 * The input's `max` stops the spinner but not a typed or restored value, and
 * quoting a payment over a term no BG bank can legally originate would be a
 * made-up number.
 *
 * @param {number} termYears
 * @param {{maturityMaxYears:number}} limits
 * @returns {number}
 */
export function clampTerm(termYears, limits) {
  const max = limits?.maturityMaxYears ?? 30;
  return Math.min(termYears, max);
}

/**
 * Everything the home result row shows, from one call.
 *
 * `ratePct` is the **AAR** — the annualised agreed rate on new business. It is
 * the interest rate, and the annuity needs an interest rate. The APRC
 * (`mortgage.json → new_business.aprc`) folds fees into an annualised figure
 * and belongs beside the rate as "what it really costs", never inside this
 * formula: at 2026-05's 2.43% AAR vs 2.77% APRC it would overstate a €148,810
 * payment by ~€24/month, which no sanity band would catch. See docs/math.md
 * §"Which rate goes into the annuity", and
 * docs/data-sources.md §"A plausible number is not a verified number".
 *
 * The down payment and both DSTI figures are read out of `limits` (published
 * in `mortgage.json → lending_limits`) rather than accepted as arguments, so a
 * caller cannot pass 0% down or quietly adopt the regulator's 50% ceiling in
 * place of our 30% line.
 *
 * @param {object} args
 * @param {number} args.price        total asking price
 * @param {number} args.ratePct      the AAR, annual percent
 * @param {number} args.termYears
 * @param {number} args.netSalary    monthly NET take-home
 * @param {number} args.eurPerM2     for the "what could I afford" size
 * @param {{minDownPaymentPct:number, prudentDstiPct:number, maturityMaxYears:number}} args.limits
 * @returns {{downPaymentPct:number, downPayment:number, loan:number,
 *            payment:number, sharePct:number, capPct:number, capEur:number,
 *            capGap:number, overCap:boolean, maxLoan:number, maxPrice:number,
 *            maxM2:number}}
 */
export function mortgagePanel({ price, ratePct, termYears, netSalary, eurPerM2, limits }) {
  const downPaymentPct = limits?.minDownPaymentPct ?? 15;
  const capPct = limits?.prudentDstiPct ?? 30;
  const term = clampTerm(termYears, limits);

  const loanFraction = 1 - downPaymentPct / 100;
  const loan = Math.max(0, price) * loanFraction;
  const payment = annuityPayment(loan, ratePct, term);
  const sharePct = netSalary > 0 ? (100 * payment) / netSalary : 0;

  const capEur = Math.max(0, netSalary) * (capPct / 100);
  const maxLoan = annuityReverse(capEur, ratePct, term);
  const maxPrice = loanFraction > 0 ? maxLoan / loanFraction : 0;

  return {
    downPaymentPct,
    downPayment: Math.max(0, price) - loan,
    loan,
    payment,
    sharePct,
    capPct,
    capEur,
    capGap: payment - capEur,
    overCap: payment > capEur,
    maxLoan,
    maxPrice,
    maxM2: eurPerM2 > 0 ? maxPrice / eurPerM2 : 0,
  };
}

// ---------------------------------------------------------------------------
// THE PAYROLL PANELS — the itemised payslip, and the tax wedge behind it
// ---------------------------------------------------------------------------

/**
 * The itemised payslip behind the one-line gross figure under the salary
 * input — every deduction, its statutory rate, and the totals it rolls into.
 *
 * **It takes the published payroll payload, not a params object**, for the
 * same reason `taxWedgePanel` does: the wrong wiring here is a breakdown
 * itemised at last year's rates, which is wrong by a few euro a line and
 * looks entirely plausible. A caller who cannot hand over rates cannot hand
 * over the wrong ones.
 *
 * **It takes the NET the user typed** and inverts it here, rather than
 * accepting a gross from the template. Composing
 * `bgNetSalary(bgGrossFromNet(salary))` inside a `$derived` puts arithmetic in
 * the render layer, which docs/site.md §"A correct formula fed the wrong
 * number" puts in this file instead — and a second
 * caller reading the breakdown straight off the typed net (rather than off
 * the recovered gross) would itemise someone's €2,100 as though €2,100 were
 * the contract amount: every line ~20% light, none of them obviously so.
 *
 * **It takes a LIST, and there is no scalar parameter to pass a total to.**
 * That is the §3.3 rule applied to the household: the insurance ceiling is per
 * contract, so a combined net inverted as one salary understates a two-earner
 * household's gross by hundreds of euro a month (`mirror.js#bgHouseholdPayroll`
 * carries the worked example). A caller holding only `householdNet` cannot
 * express that mistake here, because the argument this function accepts is not
 * the shape that figure has. One earner is a list of one.
 *
 * **The list arrives inside a `pay` object that also states its basis**, so an
 * amount cannot be passed without saying what it is. A gross typed into a
 * parameter named `nets` is a ~29% error on every figure below it, and it looks
 * entirely ordinary — the same class of mistake as the ceiling, one layer up.
 *
 * `null` for an empty field. There is no payslip for a salary nobody typed,
 * and rendering one at zero invites the reader to check a column of zeroes.
 *
 * @param {object} args
 * @param {object|null} args.payroll   data.payroll (payroll.json), unmodified
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} args.pay
 * @returns {null | (ReturnType<typeof bgHouseholdPayroll> & {
 *            maxInsurable:number, effectiveYear:number|null })}
 */
export function payslipPanel({ payroll, pay }) {
  const params = payrollParams(payroll);
  const household = bgHouseholdPayroll(pay?.amounts, params, pay?.basis);
  if (!household.earners.length) return null;

  // The ceiling and the rate year are carried through so the template can name
  // them without re-deriving either — a second derivation is a second chance to
  // take them off the wrong payload, and a breakdown captioned "2026 rates"
  // over last year's figures is wrong in a way nothing else would catch.
  //
  // They ride on EVERY earner as well as on the panel, so the row component
  // renders one earner's breakdown from one object and needs no second prop to
  // stay correct. Attaching them once at the top and letting the row reach for
  // `panel.maxInsurable` is the arrangement where a row can be handed the wrong
  // household's ceiling.
  const carried = {
    maxInsurable: params.maxInsurable,
    effectiveYear: payroll?.effective_year ?? null,
  };
  return {
    ...household,
    earners: household.earners.map((e) => ({ ...e, ordinal: e.index + 1, ...carried })),
    ...carried,
  };
}

/**
 * Everything the "flat tax is not flat" row shows, from one call.
 *
 * **It takes the published payroll payload, not a params object**, and derives
 * the parameters itself with `payrollParams`. That is the §3.3 rule applied to
 * a new panel: the wrong wiring here would be passing hand-written rates, or
 * the previous year's cap, and a caller that cannot supply either cannot make
 * that mistake. It is also why `nextCap` is read out of the payload's own
 * `scheduled_changes` rather than accepted as an argument — a hardcoded €2300
 * would keep rendering a stale "coming change" long after it arrived.
 *
 * **Each earner's position is derived from their GROSS**, recovered from the
 * net they typed with `bgGrossFromNet`. Feeding the net straight in would place
 * someone earning €2,200 gross below a €2,111.64 cap they are actually over —
 * a wrong answer inside every plausible band, exactly the class of error
 * `docs/data-sources.md` §"A plausible number is not a verified number"
 * exists for.
 *
 * **Every earner gets their own point on the curve, and the curve is where the
 * household stops being a single reader.** The whole finding this row exists to
 * show — the effective rate peaks at the ceiling and falls above it — is a
 * statement about one contract. Two people on €1,200 and one on €2,400 sit at
 * three different places on it, and marking their combined pay would put a
 * marker where nobody in the household stands.
 *
 * @param {object} args
 * @param {object|null} args.payroll   data.payroll (payroll.json), unmodified
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} args.pay
 * @returns {{capGross:number, peakEffectivePct:number, marginalBelowPct:number,
 *            marginalAbovePct:number, capRisePerMonth:number|null,
 *            points:Array<{gross:number, effectivePct:number, marginalPct:number}>,
 *            earners:Array<{index:number, gross:number, effectivePct:number,
 *                           marginalPct:number, overCap:boolean}>,
 *            headlineEffectivePct:number|null}}
 */
export function taxWedgePanel({ payroll, pay }) {
  const params = payrollParams(payroll);
  const wedge = bgTaxWedge({ params, nextCap: scheduledMaxInsurable(payroll) });

  const earners = [];
  (pay?.amounts ?? []).forEach((n, index) => {
    const amount = Number(n);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // In gross mode the reader already typed the figure this curve is drawn
    // against, so there is nothing to recover.
    const gross = pay?.basis === "gross" ? amount : bgGrossFromNet(amount, params);
    earners.push({
      index,
      ordinal: index + 1,
      gross,
      effectivePct: bgNetSalary(gross, params).effectiveRatePct,
      marginalPct: bgMarginalRatePct(gross, params),
      overCap: gross >= params.maxInsurable,
    });
  });

  // The household aggregates come from `bgHouseholdPayroll` rather than being
  // re-added here, so the corner of this row and the payslip under the pay
  // field cannot disagree about either figure. A second implementation of the
  // weighted rate is also where the obvious wrong one lives — the plain average
  // of the per-earner rates, which is off by whole points the moment the
  // earners are unequal.
  const household = bgHouseholdPayroll(pay?.amounts, params, pay?.basis);

  return {
    ...wedge,
    earners,
    // What the row's corner states. One earner: their own rate at full
    // precision, which is the figure this row has always shown. Several: the
    // household's, total deductions over total gross.
    headlineEffectivePct: earners.length
      ? earners.length === 1
        ? earners[0].effectivePct
        : household.effectiveRatePct
      : null,
    // Stated in the household sentence. Summing `earners[].gross` in the
    // template would put arithmetic in the render layer, where no test reaches
    // it — docs/site.md §"A correct formula fed the wrong number".
    householdGross: household.gross,
  };
}

// ---------------------------------------------------------------------------
// THE COUNTRY, WITH NOBODY IN IT
//
// Everything from here to the end of this section answers a question about
// Bulgaria rather than about the person reading. That is what lets `/how/`
// render it with no inputs on the page at all — and, because none of it can
// take a reader's figure as an argument, what keeps that page on the right
// side of P1 and P2 by construction rather than by review.
// ---------------------------------------------------------------------------

/**
 * The gross salaries the wedge table is evaluated at, EUR/month.
 *
 * Round numbers on either side of the insurance ceiling, chosen so the shape
 * of the curve is legible from four rows: flat below the cap, falling above
 * it. They are not defaults for anything a reader types (P7 is about those) —
 * nothing on `/how/` takes an input.
 */
export const WEDGE_LADDER_LEVELS = Object.freeze([1000, 2000, 3000, 5000]);

/**
 * What the tax wedge takes at a ladder of gross salaries — the SYSTEM's curve.
 *
 * `taxWedgePanel` above answers the same question about the person at the
 * keyboard, and a PERSONAL wedge rate is closed on any shareable surface
 * (docs/principles.md P2: below the ceiling the effective rate is a constant
 * and says nothing about the reader, and above it the rate falls with every
 * extra euro, so it names the salary). This function carries no personal
 * figure at all — published parameters evaluated at round numbers nobody typed
 * — which is the one version of it the closed list leaves open, in as many
 * words.
 *
 * **The ceiling is always a rung**, for the reason `mirror.js#bgTaxWedge`
 * forces it into its own sample: the curve's only kink is there, and a table
 * that steps over it describes a straight line.
 *
 * It takes the PUBLISHED payroll payload rather than a params object, under
 * the same constraint as `taxWedgePanel` and `payslipPanel` — a caller who
 * cannot hand over rates cannot hand over last year's.
 *
 * **The ДВ citation travels with the four figures it dates.** `source_url` is
 * the gazette's landing page and can be nothing else — their permalinks are
 * built from a session-side id the issue number does not yield — so under P9
 * the caption carries the instrument instead of reaching it, and «бр. 68 от
 * 28.07.2026» is what a reader searches ДВ's archive with. Both fields are
 * null together where the entry's parameters come from several acts, and the
 * caption falls back to the year the set is in force for.
 *
 * @param {object} args
 * @param {object|null} args.payroll  data.payroll (payroll.json), unmodified
 * @param {ReadonlyArray<number>} [args.grossLevels]  EUR/month
 * @returns {{effectiveYear:number|null, maxInsurable:number,
 *            contributionRatePct:number, incomeTaxRatePct:number,
 *            minWageGross:number, gazetteIssue:number|null,
 *            gazetteDate:string,
 *            rungs:Array<{gross:number, net:number, deductions:number,
 *                         effectivePct:number, marginalPct:number,
 *                         atCeiling:boolean, overCeiling:boolean}>}}
 */
export function systemWedgeLadder({ payroll, grossLevels = WEDGE_LADDER_LEVELS }) {
  const params = payrollParams(payroll);
  const levels = [...new Set([...grossLevels, params.maxInsurable])].sort((a, b) => a - b);
  return {
    effectiveYear: payroll?.effective_year ?? null,
    // Both or neither, decided here rather than in the template: the pipeline
    // refuses to publish half a citation, and a caption reading «бр. 68 от —»
    // is the one shape that would survive a payload edited by hand.
    gazetteIssue:
      Number.isInteger(payroll?.gazette_issue) && payroll.gazette_date
        ? payroll.gazette_issue
        : null,
    gazetteDate: (Number.isInteger(payroll?.gazette_issue) && payroll?.gazette_date) || "",
    maxInsurable: params.maxInsurable,
    contributionRatePct: 100 * params.totalEmployeeRate,
    incomeTaxRatePct: 100 * params.incomeTaxRate,
    minWageGross: params.minWageGross,
    rungs: levels.map((gross) => {
      const { net, effectiveRatePct } = bgNetSalary(gross, params);
      return {
        gross,
        net,
        deductions: gross - net,
        effectivePct: effectiveRatePct,
        marginalPct: bgMarginalRatePct(gross, params),
        atCeiling: gross === params.maxInsurable,
        overCeiling: gross > params.maxInsurable,
      };
    }),
  };
}

/**
 * The earnings ladder as rows, with each rung saying whether it was surveyed.
 *
 * `mirror.js#composeLadder` re-levels Eurostat's SES dispersion onto НСИ's
 * latest national quarter and `buildLadder` converts each rung to net; this
 * pairs the two with the cut each belongs to, so a template never has to know
 * that index 5 is the median.
 *
 * **The anchor is the country's average, and it may not become an област's.**
 * The dispersion this re-levels is national — SES publish D1, the median and D9
 * for Bulgaria and nothing below that, at any vintage, from any publisher — so
 * a level from one област would multiply a national spread by a local mean and
 * call the result that област's ranking. Nothing on screen would reveal it: a
 * rescaled ladder is still a monotonic ladder, and every rung on it is still a
 * plausible Bulgarian wage. `docs/data-sources.md` §"Salary distribution" is
 * where the pair is argued.
 *
 * **`surveyed` is the honest half.** SES publishes three points for Bulgaria —
 * D1, the median and D9 — and every other rung between them is interpolated
 * piecewise-lognormal. Rendered in one voice, an interpolation reads as a
 * measurement, which is the defect `COPY.statMedianSubModelled` exists to
 * prevent on the strip's own band.
 *
 * **A rung the statutory floor replaced is neither, and it is one of the three
 * surveyed ones.** D1 re-levels under the minimum wage today, so what P10
 * publishes is the minimum wage; `mirror.js#flooredCuts` says which cuts that
 * happened to, and such a rung carries `atMinWage` and loses `surveyed`.
 * Leaving it surveyed credits Eurostat with a figure out of the ЗБДОО.
 *
 * The anchor's provenance comes from the НСИ payload and the shape's from the
 * Eurostat one, never the other way round: copying НСИ's url and period into a
 * Eurostat payload is what `no НСИ payload carries a second publisher's
 * figures` forbids, and reading them back out crosswise would undo it on the
 * page.
 *
 * @param {object} args
 * @param {object|null} args.salaryDist   data.salaryDist (salary_dist.json)
 * @param {object|null} args.sectorSalary data.sectorSalary (sector_salary.json),
 *                                        for its all-activities «Общо» row
 * @param {object|null} args.payroll      data.payroll (payroll.json)
 * @returns {{anchorGross:number, anchorPeriod:string, anchorUrl:string,
 *            shapeYear:string, shapeUrl:string,
 *            rungs:Array<{cut:number, gross:number, net:number,
 *                         surveyed:boolean, atMinWage:boolean}>}}
 */
export function payLadder({ salaryDist, sectorSalary, payroll }) {
  const params = payrollParams(payroll);
  const anchor = nationalQuarter(sectorSalary);
  const gross = composeLadder(salaryDist, anchor.value, params);
  const net = buildLadder(salaryDist, anchor.value, params);
  const floored = flooredCuts(salaryDist, anchor.value, params);
  return {
    anchorGross: anchor.value,
    anchorPeriod: anchor.refPeriod,
    anchorUrl: sectorSalary?.source_url ?? "",
    shapeYear: String(salaryDist?.shape?.ref_year ?? ""),
    shapeUrl: salaryDist?.shape?.source_url ?? "",
    rungs: SALARY_LADDER_CUTS.map((cut, i) => ({
      cut,
      gross: gross[`P${cut}`] ?? 0,
      net: net[i] ?? 0,
      surveyed: SES_SURVEYED_CUTS.includes(cut) && !floored.has(cut),
      atMinWage: floored.has(cut),
    })),
  };
}

/** The three cuts SES publishes for BG; every rung between them is modelled. */
const SES_SURVEYED_CUTS = Object.freeze([10, 50, 90]);

/**
 * What a median Sofia flat costs, priced against the Sofia average wage.
 *
 * The reader's own version of this is the home block on `/`; this is the
 * country's, so both ends are published figures and there is no argument
 * through which a typed salary could reach it. That is deliberate: a page with
 * no inputs must not grow one by accident, and the same sentence built from
 * `householdNet` would be a claim about somebody.
 *
 * The wage goes through `regionQuarter` — НСИ's own published quarter, selected
 * rather than derived (docs/legal.md §НСИ) — and then through `bgNetSalary`,
 * because `homeYears` is a statement about take-home and a gross would flatter
 * it by about a fifth.
 *
 * `m2` is passed rather than assumed: the size is an assumption the page has to
 * state next to the number, and a function that picked its own would let the
 * page print a price without saying what it is a price of.
 *
 * @param {object} args
 * @param {object|null} args.cityPrice   data.cityPrice (city_price.json)
 * @param {string} args.cityCode          which град the €/m² is read from
 * @param {object|null} args.regionSalary  data.regionSalary (region_salary.json)
 * @param {string} args.regionCode        which област the wage is read from
 * @param {object|null} args.payroll      data.payroll (payroll.json)
 * @param {number} args.m2                floor area the price is quoted for
 * @returns {{eurPerM2:number, eurPerM2Min:number, eurPerM2Max:number,
 *            m2:number, price:number, grossMonthly:number,
 *            netMonthly:number, wagePeriod:string, years:number,
 *            nDistricts:number, sinceBaselinePct:number, baselineYear:number,
 *            trendPublishable:boolean}}
 */
export function cityHomeAtAverageWage({
  cityPrice,
  cityCode,
  regionSalary,
  regionCode,
  payroll,
  m2,
}) {
  const city = cityRow(cityPrice, cityCode);
  const eurPerM2 = city?.eur_per_m2_median ?? 0;
  // The cheapest and dearest district of THIS city. They are fields on the
  // city's row, and a caller reaching for them on the envelope gets undefined
  // — which `integer()` renders as an em dash, so the card draws «— – — €»
  // and looks like a payload that has not loaded rather than a read that
  // missed. That is the shape the country page shipped with.
  const eurPerM2Min = city?.eur_per_m2_min ?? 0;
  const eurPerM2Max = city?.eur_per_m2_max ?? 0;
  const anchor = regionQuarter(regionSalary, regionCode);
  const netMonthly = bgNetSalary(anchor.value, payrollParams(payroll)).net;
  const price = eurPerM2 > 0 && m2 > 0 ? eurPerM2 * m2 : 0;
  return {
    eurPerM2,
    eurPerM2Min,
    eurPerM2Max,
    m2,
    price,
    grossMonthly: anchor.value,
    netMonthly,
    wagePeriod: anchor.refPeriod,
    // Zero, not `homeYears`' own `Infinity`. That sentinel is right for the
    // home block, which is drawn against a salary field a reader may have
    // emptied; here a missing end means a payload did not load, and every
    // other field in this object reports that as 0. One sentinel per object,
    // so a template gates on the figure rather than on which kind of nothing
    // it got.
    years: price > 0 && netMonthly > 0 ? homeYears(price, netMonthly) : 0,
    // Through `cityTrend`, so this page and the calculator cannot read
    // different ends of the same array — or, as they did, the same end of two
    // different cities'.
    ...cityTrend(cityPrice, cityCode),
  };
}

/**
 * One city's trend line — which year it is measured from, how far it has moved
 * since, and whether the run behind that is long enough to say so.
 *
 * **One selection, because the two ENDS of the array are a one-character
 * difference.** `.at(-1)` against `[0]` is the rise since the baseline against
 * the baseline level itself, and `docs/site.md` §"A correct formula fed the
 * wrong number" is why that decision may not live in a `$derived`. It is here
 * so the housing card on `/` and the country example on `/how/` cannot read
 * different ends of the same city's history — and so neither can read a
 * different CITY's, which is the failure it was extracted after: the
 * calculator took these two off the country page's reference city and printed
 * them on the reader's card, so every city but София showed София's baseline
 * year and София's +232% beside its own €/m², under its own name, with the
 * chart's end labels correctly its own.
 *
 * Both figures come off the city's own row rather than off the array beside
 * it, and `validate_city_price` holds the two equal, so a surface showing the
 * headline and a surface showing the series cannot disagree.
 *
 * @param {object|null} cityPrice  data.cityPrice (city_price.json)
 * @param {string} code
 * @returns {{sinceBaselinePct:number, baselineYear:number,
 *            trendPublishable:boolean, nDistricts:number}}
 */
export function cityTrend(cityPrice, code) {
  const city = cityRow(cityPrice, code);
  return {
    sinceBaselinePct: city?.since_baseline_median_pct ?? 0,
    baselineYear: city?.baseline_year ?? 0,
    // Whether the run behind that percentage is long enough to say «since
    // YEAR» in the voice of a trend. Decided in the pipeline, over the whole
    // series, rather than by each surface counting rows and reaching its own
    // conclusion — `sources/imot.py#MIN_TREND_YEARS` carries the threshold and
    // why «+4% от 2024» in that voice is the wrong claim rather than a small
    // one.
    trendPublishable: Boolean(city?.trend_publishable),
    nDistricts: city?.n_districts ?? 0,
  };
}

/**
 * A payload's `series_by_period` as an ordered list of cells.
 *
 * Selection and ordering, and deliberately nothing else. НСИ's payloads carry
 * these series, and their licence forbids distributing производни и сборни
 * произведения (docs/legal.md §НСИ, §2.1.1), so the quarterly series may be
 * shown cell by cell and may not be averaged, rebased or differenced on the
 * way to the screen — including the innocent-looking "and that is +X% since
 * 2020". There is no argument here that would let a caller ask for one.
 *
 * "YYYY-Qn" and "YYYY-MM" both sort lexicographically as chronologically for
 * any four-digit year, which is why one comparator serves every payload.
 *
 * @param {{series_by_period?: Record<string, number>}|null} payload
 * @returns {Array<{period: string, value: number}>} oldest first
 */
export function seriesCells(payload) {
  const series = payload?.series_by_period ?? {};
  return Object.keys(series)
    .filter((k) => typeof series[k] === "number")
    .sort()
    .map((period) => ({ period, value: series[period] }));
}

/** The four columns a quarterly grid has, in order. */
export const QUARTERS = Object.freeze(["Q1", "Q2", "Q3", "Q4"]);

/**
 * A quarterly series as one row per year, four cells wide.
 *
 * Layout, not arithmetic: the same cells `seriesCells` returns, placed in the
 * column their quarter names. A quarterly series long enough to be worth
 * showing is a column of twenty-five one-number rows, which is a scroll box or
 * a page nobody reaches the end of; seven rows of four is the whole of it at
 * once. **Nothing is combined on the way** — the НСИ licence forbids
 * distributing производни и сборни произведения (docs/legal.md §НСИ, §2.1.1),
 * so a year row is four published cells side by side and never their average,
 * however naturally a fifth column would sit there.
 *
 * A quarter with no cell is `null` rather than absent, so a year with a
 * publication still to come renders four columns with a gap in it instead of a
 * short row that reads as a different year's shape.
 *
 * @param {{series_by_period?: Record<string, number>}|null} payload
 * @returns {Array<{year: string, cells: Array<{period: string, value: number}|null>}>}
 *   oldest year first
 */
export function quarterGrid(payload) {
  const byYear = new Map();
  for (const cell of seriesCells(payload)) {
    const match = /^(\d{4})-(Q[1-4])$/.exec(cell.period);
    if (!match) continue;
    const [, year, quarter] = match;
    if (!byYear.has(year)) byYear.set(year, { year, cells: QUARTERS.map(() => null) });
    byYear.get(year).cells[QUARTERS.indexOf(quarter)] = cell;
  }
  // `seriesCells` sorts, and a Map keeps insertion order, so the years arrive
  // oldest first without a second comparator to keep in step with the first.
  return [...byYear.values()];
}

// ---------------------------------------------------------------------------
// THE HOUSEHOLD, EARNER BY EARNER
// ---------------------------------------------------------------------------

/**
 * Every earner's monthly NET take-home, whichever basis they were typed in.
 *
 * **The one place a gross becomes a net**, and therefore the only thing the
 * rest of the page has to trust. Rent as a share of pay, the basket, the 30%
 * mortgage line and the position on the earnings ladder are all statements
 * about take-home; fed a gross they are each wrong by around 29% while looking
 * completely ordinary — and the mortgage one is wrong in the direction that
 * says a home is affordable when it is not, which
 * `AGENTS.md` forbids in as many words.
 *
 * Blanks stay blank rather than becoming zero: a second income field nobody has
 * filled in yet is a person not yet described, and `householdNet` skips it.
 *
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} pay
 * @param {object|null} payroll  data.payroll (payroll.json), unmodified
 * @returns {Array<number|null>} one net per entry, in the same positions
 */
export function netsOf(pay, payroll) {
  const params = payrollParams(payroll);
  return (pay?.amounts ?? []).map((n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    return pay?.basis === "gross" ? bgNetSalary(v, params).net : v;
  });
}

/**
 * The same amounts read in the other basis, for the moment the reader flips the
 * toggle.
 *
 * **Converting in place is what keeps the toggle a display choice.** The figure
 * in the box changes from €900 to €1,160 and not one number below it moves,
 * which is the contract the %/€ basket toggle already keeps
 * (`Calculator#setSpendMode`). The alternative — leaving 900 in the box and
 * re-reading it as a gross — silently rewrites every result on the page while
 * the reader believes they changed a label.
 *
 * Rounded to the cent, because it lands in a number input the reader will type
 * over. The round trip is protected by the caller stashing what was typed, not
 * by this rounding being lossless — it is not: €900 net → €1,159.82 gross →
 * €900.00 back is fine, but the general case drifts a cent per flip and a
 * salary that creeps while nobody edits it is its own kind of wrong.
 *
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} pay
 * @param {object|null} payroll
 * @returns {Array<number|null>}
 */
export function convertPay(pay, payroll) {
  const params = payrollParams(payroll);
  const to = pay?.basis === "gross" ? "net" : "gross";
  return (pay?.amounts ?? []).map((n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    const out = to === "gross" ? bgGrossFromNet(v, params) : bgNetSalary(v, params).net;
    return Math.round(out * 100) / 100;
  });
}

/**
 * The household's nominal change in take-home, and which earners still owe an
 * answer for it.
 *
 * The two travel together because the row renders one or the other and must
 * never render both: a percentage computed over the earners who happen to have
 * filled the field in, beside a prompt asking the rest to fill it in, is a
 * figure about part of a household presented as the household's.
 * `mirror.js#householdNetRaisePct` returns NaN in that state; this says who to
 * name.
 *
 * @param {object} args
 * @param {{basis:'net'|'gross', amounts:Array<number|null|undefined>}} args.pay
 * @param {Array<number|null|undefined>} args.raises  percent, one per earner
 * @param {object|null} args.payroll
 * @returns {{pct:number, missing:Array<{index:number, ordinal:number}>}}
 */
export function householdRaise({ pay, raises, payroll }) {
  const missing = [];
  (pay?.amounts ?? []).forEach((n, index) => {
    const amount = Number(n);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // Same guard as `householdNetRaisePct`, and for the same reason: 0 is an
    // answer and `null` is not, but both coerce to 0. The two must agree about
    // which earners are missing, or the row names nobody while the figure stays
    // NaN.
    const stated = (raises ?? [])[index];
    const r = Number(stated);
    const unanswered =
      stated === null || stated === undefined || stated === "" || !Number.isFinite(r) || r <= -100;
    if (unanswered) missing.push({ index, ordinal: index + 1 });
  });
  return {
    pct: householdNetRaisePct(
      { basis: pay?.basis ?? "net", amounts: pay?.amounts, raises },
      payrollParams(payroll)
    ),
    missing,
  };
}

/**
 * Where each earner sits on the published net-earnings ladder.
 *
 * **The ladder ranks people, not households.** Its rungs are individual
 * full-time earnings (Eurostat SES, re-levelled onto НСИ's Sofia mean — see
 * `mirror.js#buildLadder`), so a household total read off it is a unit
 * mismatch of exactly the kind that once pushed every Sofia salary to the 99th
 * percentile: two people on €900 each would be reported as out-earning 78% of
 * Sofia, when what is true is that each of them out-earns 34%.
 *
 * So this ranks earner by earner and returns one row apiece. There is no
 * argument through which a total could be passed, which is the point.
 *
 * @param {object} args
 * @param {Array<number|null|undefined>} args.nets  monthly NET take-home per earner
 * @param {number[]} args.ladder  the 11 NET rungs from mirror.js#buildLadder
 * @returns {Array<{index:number, net:number, rank:number, ahead:number}>}
 */
export function earnerRanks({ nets, ladder }) {
  if (!ladder?.length) return [];
  const out = [];
  (nets ?? []).forEach((n, index) => {
    const net = Number(n);
    if (!Number.isFinite(net) || net <= 0) return;
    const rank = percentile(net, ladder);
    if (rank > 0) out.push({ index, ordinal: index + 1, net, rank, ahead: pctAhead(rank) });
  });
  return out;
}

/**
 * Each earner against the Sofia average, as a percentage and a direction.
 *
 * **Per earner, because НСИ publish a wage and not a household income.** The
 * comparator asks "how does what you earn compare with what people here earn",
 * and answering it with a two-earner total says a household of two on €900 each
 * is 21% above the average worker. Both halves of that sentence are true
 * numbers; together they are a false claim.
 *
 * The percentage is **rounded before the direction is chosen**, so the word and
 * the figure can never disagree. Choosing «над» off the exact value and then
 * printing a rounded 1% leaves «1% над средната» sitting inside the dead zone
 * the direction words exist to keep quiet about.
 *
 * `direction` and not a word: this file picks numbers, and the component that
 * renders them picks the language. Returning «над» here would put Bulgarian in
 * the layer that has no `$lang` to switch it with.
 *
 * @param {object} args
 * @param {Array<number|null|undefined>} args.nets  monthly NET take-home per earner
 * @param {number} args.regionNet  the chosen област's average wage, net, EUR/month
 * @returns {Array<{index:number, net:number, diffPct:number, magnitudePct:number,
 *                  direction:'above'|'below'|'equal'}>}
 */
export function regionGap({ nets, regionNet }) {
  const ref = Number(regionNet);
  if (!Number.isFinite(ref) || ref <= 0) return [];
  const out = [];
  (nets ?? []).forEach((n, index) => {
    const net = Number(n);
    if (!Number.isFinite(net) || net <= 0) return;
    const gap = wageGap(net, ref);
    if (!gap) return;
    out.push({
      index,
      // Which income the sentence is about, as the reader counts them. Decided
      // here so no template does `index + 1` in the middle of a string —
      // arithmetic in the render layer is arithmetic no test can reach, and
      // `verify_template_safety` refuses to see it interpolated into markup.
      ordinal: index + 1,
      net,
      ...gap,
    });
  });
  return out;
}

/**
 * The chosen sector's published average, and how the reader sits against it.
 *
 * Selection, not arithmetic: the value and the period are НСИ's own published
 * cells, picked by `key` out of `sector_salary.json`. The one computation is
 * the gross-to-net conversion and the gap, both handed to `mirror.js`, both in
 * the reader's own tab.
 *
 * **This returns no rank, and there is none to return.** Nobody publishes a pay
 * distribution by economic activity for Bulgaria — Eurostat's `earn_ses_monthly`
 * carries no NACE section for BG at all, only broad groupings, of which just
 * the whole-economy one is populated at the vintage the site reads —
 * so `gap` is a distance from an average and the copy beside it has to say so.
 * `mirror.js#meanRungPosition` is what lets a reader correct for it, and it is
 * deliberately not reachable from here with a sector figure.
 *
 * @param {object} args
 * @param {object|null} args.sectorSalary  data.sectorSalary (sector_salary.json)
 * @param {string} args.key  the chosen sector's English name, as НСИ print it
 * @param {Array<number|null|undefined>} args.nets  monthly NET per earner
 * @param {object|null} args.payroll  data.payroll
 * @returns {{bgName:string, enName:string, gross:number, net:number,
 *            refPeriod:string, isPreliminary:boolean, sourceUrl:string,
 *            sourceUrlBg:string, gaps:Array<object>} | null} null when unselected
 */
export function sectorComparison({ sectorSalary, key, nets, payroll }) {
  const rows = Array.isArray(sectorSalary?.sectors) ? sectorSalary.sectors : [];
  // The all-activities row resolves to nothing here, not just to nothing in the
  // picker. `sectorOptions` leaves it out because it is not an economic
  // activity; refusing it again at the lookup is what makes that structural
  // rather than a property of one list — a key reaching this function from
  // anywhere else still cannot produce «средната за „Общо“» under a sentence
  // about the reader's own sector.
  const row = rows.find((s) => s?.en_name === key && s?.en_name !== SECTOR_TOTAL_KEY);
  const gross = Number(row?.value_eur);
  if (!row || !Number.isFinite(gross) || gross <= 0) return null;

  const params = payrollParams(payroll);
  const net = bgNetSalary(gross, params).net;
  const gaps = [];
  (nets ?? []).forEach((n, index) => {
    const own = Number(n);
    if (!Number.isFinite(own) || own <= 0) return;
    const gap = wageGap(own, net);
    if (gap) gaps.push({ index, ordinal: index + 1, net: own, ...gap });
  });

  return {
    bgName: String(row.bg_name ?? ""),
    enName: String(row.en_name ?? ""),
    gross,
    net,
    refPeriod: String(sectorSalary?.ref_period ?? ""),
    isPreliminary: Boolean(sectorSalary?.is_preliminary),
    // One URL per language, because the labels differ between the two editions.
    // A Bulgarian reader sent to the English workbook cannot find the row they
    // just read — the verify link has to land on the file the label came from,
    // or it demonstrates nothing (P3, P9).
    sourceUrl: String(sectorSalary?.source_url ?? ""),
    sourceUrlBg: String(sectorSalary?.source_url_bg ?? sectorSalary?.source_url ?? ""),
    gaps,
  };
}

/**
 * The picker's options, in НСИ's own row order with their own labels.
 *
 * Their order is the classification's, not a ranking, and it is kept because
 * re-sorting by wage would turn a list of sections into a league table — a
 * different claim, made by the ordering rather than by any number on it.
 *
 * **The all-activities row is not one of them.** НСИ head the table with
 * `Total` / «Общо», which is the figure the sections are read against rather
 * than an economic activity anybody works in. In a picker labelled «Твоят
 * сектор» it collects the reader who cannot find their own line, and answers
 * them with a distance from the whole economy under a caveat that calls it a
 * broad КИД-2008 section. It stays in the payload — the connector's regression
 * guard is that it sits inside the range of the sections — and is dropped
 * here, where its label would be a claim about somebody's industry.
 *
 * **Each option leads with the everyday words for the work and ends with НСИ's
 * name in full** (`content.js#SECTOR_HINTS`, which is where the reasoning
 * lives). The order is that way round because a phone shows the front of the
 * closed control and truncates the rest, and the front is the part a reader
 * uses to find their line — «Създаване и разпространение на информация и
 * творчески продукти; далекосъобщения» is 78 characters that do not contain
 * the word for anybody's job.
 *
 * **The hint can only ever be added to НСИ's label, never substituted for it.**
 * The template below composes in one direction and there is no branch that
 * returns a hint alone, so an option cannot end up naming a section something
 * НСИ did not call it. A section with no hint — or one they rename tomorrow —
 * falls back to their label by itself, which is the degraded state that is
 * still correct rather than the one that is still readable.
 *
 * @param {object|null} sectorSalary  data.sectorSalary
 * @param {Record<string, {bg:string, en:string}>} [hints]  injectable for tests
 * @returns {Array<{key:string, bg:string, en:string}>}
 */
export function sectorOptions(sectorSalary, hints = SECTOR_HINTS) {
  const rows = Array.isArray(sectorSalary?.sectors) ? sectorSalary.sectors : [];
  const lead = (hint, name) => (hint ? `${hint} — ${name}` : name);
  return rows
    .filter((s) => s?.en_name && s?.bg_name && String(s.en_name) !== SECTOR_TOTAL_KEY)
    .map((s) => {
      const hint = hints?.[String(s.en_name)];
      return {
        key: String(s.en_name),
        bg: lead(hint?.bg, String(s.bg_name)),
        en: lead(hint?.en, String(s.en_name)),
      };
    });
}

/** НСИ's own label for the all-activities row, which is not a sector. */
export const SECTOR_TOTAL_KEY = "Total";

/**
 * The `scheduled_changes` row describing the insurance ceiling, or undefined.
 *
 * `scheduled_changes` is a published, dated, sourced list. Both readers below
 * pick the row by field name rather than by position, so an entry for a
 * different field cannot supply the ceiling's value or its date.
 *
 * @param {object|null} payload  data.payroll
 */
function maxInsurableChange(payload) {
  const rows = payload?.scheduled_changes;
  return Array.isArray(rows) ? rows.find((r) => r?.field === "max_insurable_income") : undefined;
}

/**
 * The legislated next maximum insurable income, if `payroll.json` carries one.
 *
 * Read defensively: a row whose value is not a number must produce `null`
 * rather than a figure the panel would render as a euro amount.
 *
 * @param {object|null} payload  data.payroll
 * @returns {number|null} EUR/month
 */
export function scheduledMaxInsurable(payload) {
  const v = maxInsurableChange(payload)?.value_eur;
  return Number.isFinite(v) ? v : null;
}

/**
 * The date that scheduled change takes effect, as an ISO string, or `null`.
 *
 * **`effective_from` is an ISO date and never prose**, held by
 * `test_a_scheduled_change_carries_a_real_date_not_a_condition`. Prose like
 * "2026 (pending the regular state budget)" leaves the panel able to say only
 * "when it does", and it rots twice over the moment the budget passes: undated,
 * and wrong about the change still being conditional. This returns the value
 * only when it parses, so prose arriving anyway degrades to the dateless
 * wording rather than rendering "pending the regular state budget" as a date.
 *
 * @param {object|null} payload  data.payroll
 * @returns {string|null} "YYYY-MM-DD"
 */
export function scheduledMaxInsurableFrom(payload) {
  const from = maxInsurableChange(payload)?.effective_from;
  if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  return Number.isNaN(Date.parse(from)) ? null : from;
}

// ---------------------------------------------------------------------------
// PROVENANCE LINKS
// ---------------------------------------------------------------------------

const ESTAT_DATASET_FALLBACK =
  "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en";

/**
 * The "↗" verify link for one HICP row, pointing at the extract that actually
 * contains the number shown beside it.
 *
 * `unit` follows the anchor, not the row: at the "last 12 months" anchor the
 * number is the published annual rate (RCH_A), and at a year anchor it is
 * derived from the monthly index (I15). Sending someone to the index cube to
 * check a rate means they cannot find the figure they clicked.
 *
 * We deliberately do NOT link to the rendered Data Browser table: its query
 * params only bind single-select "page" dimensions, so a `coicop18=CPxx` param
 * is silently ignored and every category degrades to the same default table
 * (CP01, Food). The dissemination extract is the only stable, per-row-correct
 * target — and it is the same URL the publish-time link gate verifies.
 *
 * Takes the row it is describing, so it cannot be closed over one fixed
 * category: pointing every link at CP01 now requires changing the call site to
 * pass the wrong row, not just editing one lookup.
 *
 * @param {{api_url?:string, api_url_index?:string}} row  division or group
 * @param {'y1'|number|string} anchor
 * @returns {string}
 */
export function verifyUrl(row, anchor) {
  const url = anchor === "y1" ? row?.api_url : row?.api_url_index;
  return url || ESTAT_DATASET_FALLBACK;
}

// ---------------------------------------------------------------------------
// STRIP CARDS
// ---------------------------------------------------------------------------

/**
 * The division whose 12-month rate is highest — the "fastest-rising group"
 * card. Sorted descending; a sign slip here advertises the *slowest*-rising
 * division as the fastest, which reads as plausible and is exactly backwards.
 *
 * @param {Array<{annual_rate_pct:number}>} categories
 * @returns {object|null}
 */
export function fastestRisingDivision(categories) {
  if (!categories?.length) return null;
  return categories.reduce((best, c) => (c.annual_rate_pct > best.annual_rate_pct ? c : best));
}

// ---------------------------------------------------------------------------
// THE RANKED CONTRIBUTION LIST
// ---------------------------------------------------------------------------

/** How many contribution rows the ranked view draws before folding the rest. */
export const RANK_ROWS_SHOWN = 8;

/**
 * Split `mirror.js#contributions` output into the rows the ranked view draws
 * and one remainder, such that the two together still sum to π.
 *
 * The lead sentence over that list says the rows add up to exactly the user's
 * number, and `contributions` makes that true of all of them: Σ contributionPp
 * === π, exactly. The list is capped at eight rows for readability, though —
 * and on the default Bulgarian basket twelve divisions score above the
 * rendering threshold, so the visible column summed to 5.1 points against a
 * stated 5.4. The sentence was false on screen while every formula behind it
 * was right (docs/site.md §"A correct formula fed the wrong number" rule 4).
 *
 * So the remainder is returned rather than dropped, and it is computed from
 * the WHOLE list minus what is shown — not from the rows that happened to
 * clear the per-row display threshold. A row too small to draw still carries
 * points, and they belong in the total or the identity breaks again.
 *
 * @param {Array<{contributionPp:number}>} ranked  contributions(), sorted
 * @param {number} [limit]  rows to draw
 * @returns {{shown:Array, restN:number, restPp:number}}
 */
export function rankedSplit(ranked, limit = RANK_ROWS_SHOWN) {
  const rows = ranked ?? [];
  const shown = rows.filter((r) => Math.abs(r.contributionPp) >= 0.005).slice(0, limit);
  const total = rows.reduce((s, r) => s + r.contributionPp, 0);
  const drawn = shown.reduce((s, r) => s + r.contributionPp, 0);
  return { shown, restN: rows.length - shown.length, restPp: total - drawn };
}

// ---------------------------------------------------------------------------
// THE PLAIN ANSWER
// ---------------------------------------------------------------------------

/**
 * Which of the seven pocket verdicts a raise and a real change land in.
 *
 * The states are decided here rather than in the row that names them because
 * two surfaces read them: `PocketRow`, which has a sentence for each of the
 * seven, and the answer block at the top of the results card, which collapses
 * the three near-zero cases into one. Two ladders of thresholds written a
 * screen apart drift, and the way they drift is silent — the summary at the
 * top saying the raise is ahead while the row below says it is level, over one
 * number that has not moved.
 *
 * The ±1 pp dead zone has three insides on purpose. «Точно» is bound to
 * `pocket === 0` and nothing else: printed beside a figure reading «−0,3%» it
 * is a false sentence over correct arithmetic. A pay CUT is its own state
 * whatever prices did, because «увеличението е изядено» describes a raise that
 * never happened.
 *
 * @param {number} raisePct   nominal change in take-home, percent
 * @param {number} pocketPct  the same change in real terms, percent
 * @returns {'ahead'|'behind'|'level'|'nearUp'|'nearDn'|'none'|'cut'|'unsaid'}
 */
export function pocketVerdictState(raisePct, pocketPct) {
  if (!Number.isFinite(raisePct) || !Number.isFinite(pocketPct)) return "unsaid";
  if (raisePct === 0) return "none";
  if (raisePct < 0) return "cut";
  if (pocketPct >= 1) return "ahead";
  if (pocketPct <= -1) return "behind";
  if (pocketPct === 0) return "level";
  return pocketPct > 0 ? "nearUp" : "nearDn";
}

/**
 * The three things a reader arrives asking, as states rather than sentences.
 *
 * They arrive wanting to know whether their pay is keeping up, where that puts
 * them, and what is getting dearer or cheaper. Every figure behind those three
 * is already computed and already on the page — spread over three receipt rows
 * two to three screens down a phone. This decides WHICH of them can honestly
 * be stated and in what state; the component that renders it picks the words.
 *
 * **Two of the three refuse to speak, and that is the whole of what this
 * function is for.** `stand` needs `salaryAnswered`, not merely a rank: the
 * ladder is a claim about the reader in the second person, and a visitor on
 * €2,400 told on arrival that they out-earn a third of Sofia has been told
 * something false about themselves before typing a character — the rule
 * `PercentileRow` already keeps, restated here because a summary that outran
 * it would reintroduce the defect one screen higher up. `pay` needs a raise;
 * with none entered there is no real change to report and the clause asks for
 * one instead of computing over an absent number.
 *
 * `mover` reads the reader's OWN basket rows rather than the published
 * divisions, so a reader who has zeroed a slider is not told that the thing
 * they do not buy is what is rising fastest. Highest and lowest rate, not
 * biggest contribution: the headline block already names the group that adds
 * the most, and "what is getting dearer" is a different question from "what is
 * costing me most" — a small, fast-rising row answers the first and not the
 * second.
 *
 * @param {object} args
 * @param {number} args.raise          nominal change in take-home, percent
 * @param {number} args.pocket         the same change in real terms, percent
 * @param {boolean} args.salaryAnswered  whether the reader replaced the placeholder
 * @param {Array<{ahead:number}>} args.ranks    one ladder position per earner
 * @param {Array<{division:object, rate:number, share:number}>} args.ranked  contributions()
 * @returns {{pay:object, stand:object, mover:object}}
 */
export function answerLine({
  raise = NaN,
  pocket = NaN,
  salaryAnswered = false,
  ranks = [],
  ranked = [],
}) {
  const positions = salaryAnswered ? (ranks ?? []) : [];
  const ahead = positions.map((r) => r.ahead);
  // Only rows the reader actually spends on. A division at share 0 contributes
  // nothing to their number, so naming it as what is rising fastest describes
  // somebody else's basket.
  const spent = (ranked ?? []).filter((r) => r.share > 0);
  const dearest = spent.length ? spent.reduce((b, r) => (r.rate > b.rate ? r : b)) : null;
  const cheapest = spent.length ? spent.reduce((b, r) => (r.rate < b.rate ? r : b)) : null;
  return {
    pay: { state: pocketVerdictState(raise, pocket), pocketPct: pocket },
    stand: ahead.length
      ? {
          state: ahead.length > 1 ? "many" : "one",
          low: Math.min(...ahead),
          high: Math.max(...ahead),
        }
      : { state: "unsaid", low: 0, high: 0 },
    mover: {
      // Sign-gated in both directions: a basket where nothing has risen must
      // not be told what rose fastest, and one where nothing has fallen must
      // not be handed the least-bad row as a saving.
      up:
        dearest && dearest.rate > 0 ? { division: dearest.division, ratePct: dearest.rate } : null,
      down:
        cheapest && cheapest.rate < 0
          ? { division: cheapest.division, ratePct: cheapest.rate }
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// SHARE — see docs/principles.md P2
// ---------------------------------------------------------------------------

/** Where a share surface sends a stranger. Checked against the sitemap's own. */
export const SHARE_ORIGIN = "https://vyarno.bg";

/** The same address as a reader says it, for a surface that cannot carry a link. */
export const SHARE_DOMAIN = "vyarno.bg";

/**
 * Everything `sharePayload` is allowed to hand onward, as a closed set.
 *
 * The list is the review surface. A field added to the returned object without
 * being added here fails `verify_view.mjs`, which puts the person adding it in
 * front of P2 at the moment they are deciding — rather than after an image is
 * already in somebody's chat.
 */
export const SHARE_FIELDS = Object.freeze([
  "piPct",
  "officialPct",
  "verdict",
  "anchor",
  "refPeriod",
  "topBgName",
  "topEnName",
  "topPp",
  "domain",
  "url",
]);

/**
 * The only numbers that may cross onto a share surface.
 *
 * **This function has no salary parameter, and that is the guarantee.**
 * `mirror.js#extraPerMonth` is `salary × r/(100+r)`, which inverts exactly, so
 * a € absolute printed beside the percentage it came from publishes the
 * reader's pay to everyone the image reaches (docs/principles.md P2, and the
 * closed list names this case outright). Asserting that no `€` reaches the
 * finished string catches the mistake; taking no salary makes it unexpressible,
 * which is the standard the rest of this file is held to.
 *
 * Three figures the site already computes are excluded for the same reason,
 * and two of them look safe:
 *
 *   - **The ladder position inverts.** `mirror.js#percentile` interpolates over
 *     rungs composed from `salary_dist.json` and `sector_salary.json`, both
 *     committed and public, so "ahead of 34%" reconstructs the net pay to
 *     within a rung's width. It carries no currency symbol and is no safer for
 *     it.
 *   - **A personal tax wedge inverts above the insurance ceiling.** Below the
 *     cap the effective rate is constant and says nothing; above it the rate
 *     falls with every extra euro of gross, so the rate names the salary.
 *   - **The thirteen basket weights** reconstruct no euro on their own, but a
 *     thirteen-number spending profile identifies a household to anyone who
 *     knows them. One category name carries the same story and is one of
 *     thirteen possibilities.
 *   - **The sector gap inverts EXACTLY, and is the strongest of these.** The
 *     ladder position above is bounded by a rung's width — €1,997 at P80
 *     against €2,802 at P90 — so it names a range. A sector gap divides by one
 *     of the section averages published in `sector_salary.json`, so "18% below
 *     Information and communication" is a single net wage to the euro, and the
 *     sector name narrows the sender to one of the nineteen groups `sectorOptions`
 *     offers before the percentage is read at all. It reaches no share surface, and the
 *     parameter list below is what stops it: `sharePayload` takes no sector.
 *
 * What is left is a rate over a basket (thirteen unknowns collapsed into one
 * scalar, and `mirror.js#personalInflation` never sees the pay at all), a
 * published national rate, a category name, a contribution in percentage
 * points, and dates.
 *
 * `near` is passed in rather than recomputed: it is the same boolean the
 * results card colours its verdict with, so the sentence on the image and the
 * sentence on the screen cannot come to opposite conclusions about the same
 * basket.
 *
 * The gap between the two rates is deliberately NOT returned. Both are rendered
 * at one decimal place and their difference is not the difference of their
 * roundings — 7.24 against 4.06 draws as 7,2 and 4,1 over a stated 3,2 — and
 * the two bars say which is longer without arithmetic the reader has to trust.
 *
 * @param {object} args
 * @param {number} args.pi         the reader's own rate, percent
 * @param {number} args.official   the same window on the official basket, percent
 * @param {boolean} args.near      the results card's own "close to average" verdict
 * @param {'y1'|number} args.anchor
 * @param {Array<{division:object, contributionPp:number}>} [args.ranked]
 * @param {string} [args.refPeriod]  the published period the rates are from
 * @returns {object|null} the shareable fields, or null when nothing is measured
 */
export function sharePayload({ pi, official, near, anchor, ranked = [], refPeriod = "" }) {
  if (!Number.isFinite(pi) || !Number.isFinite(official)) return null;

  // Only the leading row, and only its name and its points. Passing the whole
  // division through would carry `eurPerMonth` and `spendEur` onto the card's
  // props, where rendering one is a one-word mistake.
  const top = ranked[0]?.division ? ranked[0] : null;

  return {
    piPct: pi,
    officialPct: official,
    verdict: near ? "close" : pi > official ? "dearer" : "cheaper",
    anchor,
    refPeriod,
    topBgName: top ? top.division.bg_name : "",
    topEnName: top ? top.division.en_name : "",
    topPp: top ? top.contributionPp : NaN,
    domain: SHARE_DOMAIN,
    url: SHARE_ORIGIN,
  };
}

/**
 * Which sentence each verdict gets.
 *
 * The key names are written out as strings so `verify_copy.mjs`'s dead-key
 * scan can see them: it reads the sources as text, and `copy[k]` behind a
 * variable is invisible to it. Same device as `ResultsSummary`'s preset
 * labels.
 */
const SHARE_LINE_KEY = Object.freeze({
  dearer: "shareLineDearer",
  cheaper: "shareLineCheaper",
  close: "shareLineClose",
});

/**
 * Every `COPY` key the share text is assembled from.
 *
 * A share surface is the one place where a missing string is not merely a
 * blank line — it is a message a reader sends to somebody else with `{p}` or
 * `undefined` in it. `verify_copy.mjs` checks each of these exists and that
 * the finished sentence has no unsubstituted brace left in either language.
 */
export const SHARE_COPY_KEYS = Object.freeze([
  ...Object.values(SHARE_LINE_KEY),
  "shareWindowY1",
  "shareWindowSince",
  "shareCta",
]);

/**
 * The text a reader copies or hands to the share sheet.
 *
 * Written in the FIRST person, where every other sentence in the app says
 * «ти». The reader is the author of this one — it is spoken by them to
 * somebody who has never opened the site — and «твоята кошница поскъпна»
 * arriving in a stranger's chat addresses the wrong person.
 *
 * The words live in `content.js` like all the others and are handed in, so
 * this stays the layer that decides which number goes where and the copy stays
 * reviewable in one file.
 *
 * @param {object} args
 * @param {object|null} args.share  `sharePayload()` output
 * @param {object} args.copy        the `COPY` object from `content.js`
 * @param {'bg'|'en'} args.lang
 * @returns {string} the message, or "" when there is nothing to say
 */
export function shareSentence({ share, copy, lang = "bg" }) {
  if (!share) return "";
  const windowLabel =
    share.anchor === "y1"
      ? t(copy.shareWindowY1, lang)
      : t(copy.shareWindowSince, lang, { y: String(share.anchor) });
  const body = t(copy[SHARE_LINE_KEY[share.verdict]], lang, {
    p: number(share.piPct, 1, lang),
    o: number(share.officialPct, 1, lang),
    w: windowLabel,
  });
  return `${body} ${t(copy.shareCta, lang, { u: share.url })}`;
}

/**
 * The value the longer of the two comparison bars is drawn against.
 *
 * A floor, not the larger of the pair: over one year a basket that rose 0.4%
 * against an official 0.3% would otherwise fill the track edge to edge and
 * read as a catastrophe, and the two bars exist to be compared to each other
 * AND to be read as a size. At a year anchor the cumulative figures are large
 * enough that a fixed floor would flatten them instead, so the floor there is
 * relative to the official rise.
 *
 * The results card and the share image draw the same pair of bars, so the
 * ceiling is computed once — the failure worth preventing is the image
 * disagreeing with the screen it was generated from.
 *
 * @param {object} args
 * @param {number} args.piPct
 * @param {number} args.officialPct
 * @param {'y1'|number} args.anchor
 * @returns {number} percent; always at least 1
 */
export function barCeiling({ piPct, officialPct, anchor }) {
  const pi = Number.isFinite(piPct) ? piPct : 0;
  const official = Number.isFinite(officialPct) ? officialPct : 0;
  return Math.max(pi, official, anchor === "y1" ? 8 : official * 1.35, 1);
}

// ---------------------------------------------------------------------------
// THE PROPERTY MARKET
// ---------------------------------------------------------------------------
//
// Which published field feeds which figure on `/market/`. The arithmetic is in
// `mirror.js` and the words are in the component; what lives here is the
// wiring, so that "the average deal is divided by НСИ's gross wage" is a claim
// a test can hold rather than an expression inside a `$derived` nothing can
// reach.
//
// Every function takes payloads. None takes a scalar, and that is what keeps
// the page inputless: there is no signature here a reader's own salary could
// be threaded into, so the country page cannot quietly become a calculator.

/**
 * A figure with everything the page has to print beside it.
 *
 * The shape exists because the requirement is uniform: under every digit, the
 * publisher, the period it describes, a link to the exact table, and — where
 * the number is ours — the arithmetic that produced it and the queries that
 * reproduce it. Returning them together means a caller cannot render the value
 * and forget the provenance, because it arrives in the same object.
 *
 * `method` and `derivedFrom` are null for a figure read verbatim. A renderer
 * shows the derivation note when they are present, so "is this ours?" is
 * answered by the data rather than by whoever wrote the template.
 *
 * @typedef {object} SourcedFigure
 * @property {number|null} value
 * @property {string|null} refPeriod   the period the figure DESCRIBES
 * @property {string|null} sourceUrl   the table a reader opens
 * @property {string|null} apiUrl      the query that returns it
 * @property {string|null} dataset
 * @property {string|null} method      how it was computed, when it is ours
 * @property {string[]|null} derivedFrom  the queries that reproduce it
 */

/**
 * Wrap a published block's figure with its provenance.
 *
 * @param {number|null|undefined} value
 * @param {object|null|undefined} block  the payload block the value came from
 * @param {{method?: string, derivedFrom?: string[], refPeriod?: string}} [extra]
 * @returns {SourcedFigure}
 */
function sourced(value, block, extra = {}) {
  return {
    value: Number.isFinite(value) ? value : null,
    refPeriod: extra.refPeriod ?? block?.ref_period ?? null,
    sourceUrl: block?.source_url ?? null,
    apiUrl: block?.api_url ?? null,
    dataset: block?.dataset ?? null,
    method: extra.method ?? null,
    derivedFrom: extra.derivedFrom ?? null,
  };
}

/**
 * How much changed hands, and how that compares with a year earlier.
 *
 * The quarter reported is the payload's own `ref_period` rather than the last
 * key in the series: the two are the same today and the payload is the one
 * that states which quarter it is describing. Reading the maximum key instead
 * would silently report a quarter the gates never looked at.
 *
 * @param {object|null} houseMarket
 * @returns {{period: string|null, deals: SourcedFigure, newBuild: number|null,
 *            existing: number|null, changePct: SourcedFigure}}
 */
export function marketVolume(houseMarket) {
  const block = houseMarket?.deals ?? null;
  const period = houseMarket?.ref_period ?? null;
  const series = block?.series_by_period ?? {};
  const { count, changePct: yoy } = dealsAtQuarter(series, period ?? "");
  const at = series?.[period ?? ""] ?? {};
  return {
    period,
    deals: sourced(count, block, { refPeriod: period }),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
    // Per purchase type as well as in total, because new builds and existing
    // dwellings move differently in volume and the split is why the payload
    // carries them apart. One year-on-year figure for the total leaves the
    // table's other two rows to be read as though they had not moved.
    changeNewPct: dealsAtQuarter(series, period ?? "", "new").changePct,
    changeExistingPct: dealsAtQuarter(series, period ?? "", "existing").changePct,
    changePct: sourced(yoy, block, {
      refPeriod: period,
      method:
        "This quarter's dwelling count against the same quarter one year " +
        "earlier, both as published. Year-on-year rather than against last " +
        "quarter, because transactions have a seasonal shape and a " +
        "quarter-on-quarter fall would partly measure the calendar.",
      derivedFrom: block?.api_url ? [block.api_url] : null,
    }),
  };
}

/**
 * What a dwelling changed hands for on average, and what it is made of.
 *
 * The value and the count travel with it deliberately. This is the page's
 * signature figure and the one a sceptic reaches for first, so the two numbers
 * it is built from are rendered beside it rather than left in the payload.
 *
 * @param {object|null} houseMarket
 * @returns {{period: string|null, avg: SourcedFigure, newBuild: number|null,
 *            existing: number|null, totalValue: number|null, deals: number|null}}
 */
export function marketAverageDeal(houseMarket) {
  const block = houseMarket?.avg_deal_eur ?? null;
  const period = houseMarket?.ref_period ?? null;
  const at = block?.series_by_period?.[period ?? ""] ?? {};
  return {
    period,
    avg: sourced(at.total, houseMarket?.value ?? null, {
      refPeriod: period,
      method: block?.method ?? null,
      derivedFrom: block?.derived_from_api_urls ?? null,
    }),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
    // Both sides of every row's division, per purchase type. The page prints
    // them beside the quotient and asks the reader to check it, and a row whose
    // numerator and denominator are not on the page is a row they cannot.
    totalValue: houseMarket?.value?.series_by_period?.[period ?? ""]?.total ?? null,
    newValue: houseMarket?.value?.series_by_period?.[period ?? ""]?.new ?? null,
    existingValue: houseMarket?.value?.series_by_period?.[period ?? ""]?.existing ?? null,
    deals: houseMarket?.deals?.series_by_period?.[period ?? ""]?.total ?? null,
    newDeals: houseMarket?.deals?.series_by_period?.[period ?? ""]?.new ?? null,
    existingDeals: houseMarket?.deals?.series_by_period?.[period ?? ""]?.existing ?? null,
  };
}

/**
 * Eurostat's own annual rate of change on the house price index.
 *
 * **Read, never computed.** The index level is in the same payload and the
 * temptation is to divide two of its members — but НСИ rebased the series and
 * warn that a rate recomputed across the two bases can differ in the last
 * decimal from the one both publishers print. The rate we show is the rate
 * they publish, which is also the figure the cross-publisher gate reconciles.
 *
 * @param {object|null} houseMarket
 * @returns {{period: string|null, total: SourcedFigure, newBuild: number|null,
 *            existing: number|null}}
 */
export function marketPriceRate(houseMarket) {
  const block = houseMarket?.price_index ?? null;
  const period = block?.rate_ref_period ?? null;
  const at = block?.annual_rate_pct?.[period ?? ""] ?? {};
  return {
    period,
    total: sourced(at.total, block, { refPeriod: period }),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
  };
}

/**
 * Who owns, who owes, and how much of the stock stood empty.
 *
 * The unoccupied share is derived here from the two published counts; both
 * counts come back with it so the division is checkable on the page.
 *
 * @param {object|null} structure
 * @returns {object}
 */
export function marketStructure(structure) {
  const tenure = structure?.tenure ?? null;
  const census = structure?.census_dwellings ?? null;
  return {
    owner: sourced(tenure?.owner_pct, tenure),
    ownerWithMortgage: sourced(tenure?.owner_with_mortgage_pct, tenure),
    // The whole split rather than the three figures a card row happened to
    // want. Every one of these is a share of the POPULATION on the same base,
    // so owners and renters add to the published total — which is what makes
    // them a table a reader can add up rather than three unrelated percentages.
    // The two rows a four-row table left out, and they are the ones that make
    // the other four add up. Owners without a loan are the overwhelming
    // majority of the country and the page leans on that in two places; a
    // reader had to subtract to find the figure. Reduced-rent and rent-free is
    // the other side of the same identity — with both here every published
    // share is on the page and the column visibly sums to the published total,
    // which is the check a reader can make without leaving it.
    ownerNoMortgage: sourced(tenure?.owner_no_mortgage_pct, tenure),
    renter: sourced(tenure?.rent_pct, tenure),
    renterAtMarketPrice: sourced(tenure?.rent_market_price_pct, tenure),
    renterReducedOrFree: sourced(tenure?.rent_reduced_or_free_pct, tenure),
    dwellings: sourced(census?.total, census),
    occupied: sourced(census?.occupied, census),
    unoccupied: sourced(census?.unoccupied, census),
    unoccupiedPct: sourced(unoccupiedSharePct(census), census, {
      method:
        "Dwellings recorded as unoccupied at the census, over all conventional " +
        "dwellings recorded at the same census. Both counts are published " +
        "beside this figure. 'Unoccupied' means unoccupied on census night, " +
        "which includes second homes and holiday properties.",
      derivedFrom: census?.api_url ? [census.api_url] : null,
    }),
    // Price-to-income and the overburden share are NOT here, and their absence
    // is the wiring saying where they belong. Both are read as series
    // (`marketPriceToIncomeSeries`, `marketOverburdenSeries`), each of which
    // carries its own newest reading and period — so a page drawing the chart
    // and quoting the latest figure takes both from one call and cannot caption
    // a chart with a period the number beside it does not share.
  };
}

/**
 * The average deal expressed in years of the national gross wage.
 *
 * **The one cross-publisher figure on the page.** Eurostat's transaction value
 * over НСИ's published average wage, joined here because neither published
 * file may carry the other's number — the rule that keeps both of them
 * redistributable (`docs/legal.md` §НСИ).
 *
 * It reads the all-activities row rather than any sector, and gross rather than
 * net: the sector rows answer a different question, and a net figure would
 * depend on the payroll table of whichever year converted it, which is a third
 * publisher's law inside a two-publisher ratio.
 *
 * **Both periods come back, because the figure describes both.** Eurostat
 * disseminate the transaction cubes about a week behind НСИ publishing the wage
 * table, so the two quarters agree most of the time and part for the days
 * between two releases. Dated by one of them the card names the period of half
 * its own arithmetic, and the half it names is the one a reader is least likely
 * to check.
 *
 * @param {object|null} houseMarket
 * @param {object|null} sectorSalary
 * @returns {SourcedFigure & {monthlyGrossEur: number|null, dealPeriod: string|null,
 *                            wagePeriod: string|null, wageUrl: string|null}}
 */
export function marketDealInYearsOfPay(houseMarket, sectorSalary) {
  const period = houseMarket?.ref_period ?? null;
  const deal = houseMarket?.avg_deal_eur?.series_by_period?.[period ?? ""]?.total ?? null;
  const all = (sectorSalary?.sectors ?? []).find((s) => s?.en_name === "Total") ?? null;
  const wage = all?.value_eur ?? null;
  return {
    ...sourced(dealInYearsOfPay(deal, wage), houseMarket?.value ?? null, {
      refPeriod: period,
      method:
        "Eurostat's average dwelling transaction divided by twelve times " +
        "НСИ's published average GROSS monthly wage across all activities. " +
        "Two publishers, joined in your browser: neither published file " +
        "carries the other's figure. Gross rather than net, because a net " +
        "wage depends on the payroll table of the year it was worked out in.",
      derivedFrom: houseMarket?.avg_deal_eur?.derived_from_api_urls ?? null,
    }),
    monthlyGrossEur: wage,
    dealPeriod: period,
    wagePeriod: sectorSalary?.ref_period ?? null,
    wageUrl: sectorSalary?.source_url ?? null,
  };
}

/**
 * The six cities, price movement beside sales movement.
 *
 * **Change against change, and never a level against a level.** Every НСИ city
 * series is an index or a percentage, and their own лв./кв.м survey ran to
 * 2014-Q2 and was discontinued, so no transaction price per square metre exists
 * for any Bulgarian city from any publisher. The имот.bg figures the calculator
 * shows are ASKING prices from listings — a different measurement, and putting
 * the two in one column would invent a comparison neither publisher supports.
 *
 * The two blocks are joined on the city code rather than zipped by position:
 * they come from two workbooks with two different coverage windows, and НСИ
 * publish the sales series over a shorter one.
 *
 * **Each column is dated by its own workbook and each cell by its own city, and
 * the table has no single period to be captioned with.** Three periods can
 * disagree here: HPI_2.6 and HSI_2.4.5 are separate files on НСИ's portal and
 * either can be republished first, and `build_nsi_housing_payload` dates every
 * city row by the newest quarter THAT city carries rather than by the block's,
 * so a city missing from the newest release keeps the quarter it has. The
 * payload's own `ref_period` is a fourth thing again — it belongs to the
 * national block, which this table does not draw. A caption naming one quarter
 * for all of it would put figures from two periods under a heading claiming
 * one, which is the failure that needs no wrong number to mislead.
 *
 * @param {object|null} nsiHousing
 * @returns {{pricePeriod: string|null, dealsPeriod: string|null,
 *            priceUrl: string|null, dealsUrl: string|null,
 *            cities: Array<object>}}
 */
export function marketCities(nsiHousing) {
  const price = nsiHousing?.city_price_index_yoy ?? null;
  const deals = nsiHousing?.city_deals_yoy ?? null;
  const dealsBy = new Map((deals?.cities ?? []).map((c) => [c.code, c]));
  const cities = (price?.cities ?? []).map((c) => {
    const d = dealsBy.get(c.code) ?? null;
    return {
      code: c.code,
      nameBg: c.name_bg,
      nameEn: c.name_en,
      pricePct: c.value_pct ?? null,
      pricePeriod: c.ref_period ?? null,
      dealsPct: d?.value_pct ?? null,
      dealsPeriod: d?.ref_period ?? null,
      // Each city's own history, which the payload has carried all along: НСИ
      // publish forty-five quarters per city and the table showed the newest
      // one. Русе falling while Бургас rises is the sentence the table can
      // make; whether Русе has been falling for a year or for six is the one it
      // cannot, and that is the difference between a number and a finding.
      priceSeries: plotSeries(c.series_by_period, { reference: 0 }),
      dealsSeries: plotSeries(d?.series_by_period, { reference: 0 }),
    };
  });
  return {
    pricePeriod: price?.ref_period ?? null,
    dealsPeriod: deals?.ref_period ?? null,
    priceUrl: price?.source_url ?? null,
    dealsUrl: deals?.source_url ?? null,
    // ONE scale per column, across all six cities. Six sparklines each drawn to
    // its own range are six pictures of the same shape: Русе's fall and Бургас'
    // rise would occupy the same box, and a reader comparing rows — which is
    // the only reason to put six charts in a column — would be comparing
    // nothing. The shared bounds go through the same clamp, so zero is on every
    // one of them.
    priceScale: sharedScale(cities.map((c) => c.priceSeries)),
    dealsScale: sharedScale(cities.map((c) => c.dealsSeries)),
    cities,
  };
}

/**
 * One scale covering several series, so charts drawn side by side compare.
 *
 * Runs through the same clamp `plotSeries` applies: zero is inside every scale
 * on this page, including a shared one.
 *
 * @param {Array<{min: number, max: number}>} series
 */
function sharedScale(series) {
  return {
    min: Math.min(0, ...series.map((s) => s.min)),
    max: Math.max(0, ...series.map((s) => s.max)),
  };
}

/**
 * НСИ's national house price index change — the same statistic Eurostat
 * disseminate, published here by the body that compiles it.
 *
 * Both are on the page deliberately. They agree to the decimal, and a reader
 * who checks one against the other finds that out — which is worth more than
 * either figure alone on a page arguing that its numbers are checkable.
 *
 * @param {object|null} nsiHousing
 * @returns {SourcedFigure & {newBuild: number|null, existing: number|null}}
 */
export function marketNsiNationalRate(nsiHousing) {
  const block = nsiHousing?.national_price_index_yoy ?? null;
  const at = block?.value_pct ?? {};
  return {
    ...sourced(at.total, block),
    newBuild: Number.isFinite(at.new) ? at.new : null,
    existing: Number.isFinite(at.existing) ? at.existing : null,
  };
}

/**
 * A published `{period: value}` map, shaped for the plot and for the table that
 * has to sit under it.
 *
 * One core for every series on `/market/`, because they differ only in where
 * the numbers come from and every one of them needs the same six things: the
 * ordered points, the extent to build an axis from, the peak and the trough and
 * the latest reading for the text alternative, and the reference the figure is
 * defined against where it has one.
 *
 * **`min` is clamped at or below zero and there is no way to raise it.** That
 * is the whole honesty contract of this file rather than a default: a y-axis
 * cropped to a property series' own range turns any of them into a cliff, and
 * the way to keep that off this page is to leave no caller a floor to set. A
 * signed series — Eurostat's annual rate ran from +34.6% to −26.8% — needs its
 * negative half, so the clamp is `min(0, smallest)` rather than a constant 0:
 * the drawn scale always CONTAINS zero, which is the property that matters, and
 * `verify_view.mjs` asserts it over every series function here.
 *
 * @param {Record<string, number>|null|undefined} entries
 * @param {{reference?: number|null}} [opts]  a level the figure is defined
 *   against — 100 for an index, 0 for a rate — included in the extent, because
 *   a plot whose own reference line is off the top has drawn everything except
 *   the thing it is about
 * @returns {{points: Array<{period: string, value: number}>, min: number,
 *            max: number, peak: object|null, trough: object|null,
 *            first: object|null, latest: object|null, from: string|null,
 *            to: string|null, reference: number|null}}
 */
export function plotSeries(entries, { reference = null } = {}) {
  const points = Object.keys(entries ?? {})
    .sort()
    .map((period) => ({ period, value: entries[period] }))
    .filter((p) => Number.isFinite(p.value));
  const values = points.map((p) => p.value);
  const bounds = Number.isFinite(reference) ? [...values, reference] : values;
  return {
    points,
    min: Math.min(0, ...bounds),
    max: Math.max(0, ...bounds),
    peak: points.reduce((best, p) => (best && best.value >= p.value ? best : p), null),
    trough: points.reduce((worst, p) => (worst && worst.value <= p.value ? worst : p), null),
    first: points[0] ?? null,
    latest: points[points.length - 1] ?? null,
    from: points[0]?.period ?? null,
    to: points[points.length - 1]?.period ?? null,
    reference: Number.isFinite(reference) ? reference : null,
  };
}

/**
 * A series with the provenance the caption under it has to print.
 *
 * The data and its publisher come back in one object for the reason `sourced`
 * exists: a chart is a figure, it carries the same obligation as a number, and
 * a renderer that has to fetch its source separately is one that can draw the
 * chart and forget the line.
 *
 * @param {Record<string, number>|null|undefined} entries
 * @param {object|null|undefined} block  the payload block the entries came from
 * @param {{reference?: number|null, unit?: string|null}} [opts]
 */
function sourcedSeries(entries, block, opts = {}) {
  return {
    ...plotSeries(entries, opts),
    sourceUrl: block?.source_url ?? null,
    apiUrl: block?.api_url ?? null,
    dataset: block?.dataset ?? null,
    unit: opts.unit ?? block?.unit ?? null,
  };
}

/** One field lifted out of a `{period: {total, new, existing}}` map. */
function field(series, name) {
  return Object.fromEntries(
    Object.entries(series ?? {})
      .map(([period, row]) => [period, row?.[name]])
      .filter(([, value]) => Number.isFinite(value))
  );
}

/**
 * The quarterly transaction count as a series, for drawing.
 *
 * The page's lead finding is a change in VOLUME over time and it was one number
 * and a percentage — the shape that number sits in is the argument, and thirty-
 * seven quarters of it are already in the payload. What comes back is the data;
 * the geometry is the component's, the way `systemWedgeLadder` feeds the tax
 * wedge.
 *
 * @param {object|null} houseMarket
 */
export function marketVolumeSeries(houseMarket) {
  const block = houseMarket?.deals ?? null;
  return sourcedSeries(field(block?.series_by_period, "total"), block);
}

/**
 * **Twenty-one years of the official house price index**, as НСИ compile it and
 * Eurostat disseminate it.
 *
 * Eighty-five quarters were in the payload and the page rendered one number out
 * of that block. What the series carries and the number cannot: the index
 * doubled to 2008, gave back more than a third of it by 2012, and has tripled
 * since — so a reader asking "can this fall" has the publisher's own answer
 * instead of ours. **That is the reason it is here and also the reason the page
 * may not caption it**: showing a bust and today's level on one line is a fact;
 * saying what the pair means is a position.
 *
 * The reference is 100, which is the 2015 base the index is defined against and
 * not a judgement about 2015. **Nominal**, and the page has to say so — nothing
 * published here deflates a quarterly series back to 2005, because the HICP
 * index on this site is annual and starts at 2020.
 *
 * @param {object|null} houseMarket
 * @param {"total"|"new"|"existing"} [purchase]
 */
export function marketPriceIndexSeries(houseMarket, purchase = "total") {
  const block = houseMarket?.price_index ?? null;
  return {
    ...sourcedSeries(field(block?.series_by_period, purchase), block, {
      reference: 100,
      unit: block?.unit ?? null,
    }),
    // Eurostat's own letters on their own points, for the quarters they flagged.
    flags: flagsFor(block?.status_by_period, purchase),
    // **The base year travels with the series, and it is never written down.**
    // Every sentence that makes the index readable names it — «×1 = колкото
    // през 2015 г.» — and Eurostat rebase: `I25_Q` is the same measurement
    // putting today at 109 instead of 273. A year typed into the copy stays
    // right for one rebasing and is then a claim contradicted by every digit
    // beside it, silently, because nothing recomputes prose.
    baseYear: block?.base_year ?? null,
  };
}

/**
 * The SAME index deflated, on the same base and the same quarters.
 *
 * **The one line without which the nominal one can mislead.** Nominally the
 * index sits far above its 2008 peak; deflated it sits below it, and a site
 * whose subject is the gap between a number and what it buys cannot draw
 * twenty-one years of property prices in the money of the day with the other
 * line unavailable — that is the correction it exists to make, applied to
 * everything except this.
 *
 * `tipsho30` has no purchase dimension: Eurostat deflate the total only, so
 * there is no split to be had and nothing here may imply one.
 *
 * @param {object|null} houseMarket
 */
export function marketPriceIndexRealSeries(houseMarket) {
  const block = houseMarket?.price_index_real ?? null;
  return {
    ...sourcedSeries(block?.series_by_period, block, {
      reference: 100,
      unit: block?.unit ?? null,
    }),
    flags: flagsFor(block?.status_by_period, null),
    baseYear: block?.base_year ?? null,
  };
}

/**
 * The index said out loud: how many times the base year, and where the deflated
 * line sits against its own highest reading.
 *
 * **The level was the least readable thing on the page and the data was never
 * the problem.** «Индекс на цените на жилищата, 272,63, при 100 за 2015 г.»
 * asks a reader to hold three conventions at once — that an index has no unit,
 * that its anchor is a year somebody chose, and that 272,63 is a ratio written
 * as if it were a quantity. «×2,7 спрямо 2015 г.» asks nothing and says the
 * same thing, from the same cell.
 *
 * The second half is the reading this page can make that nobody else in
 * Bulgaria makes with sources attached: nominally the index is at its own
 * highest, and deflated it is below where it stood before the 2008 fall. Both
 * come out of the two series' own extremes, so **no year and no level is named
 * anywhere but by the data** — `realPeakPeriod` is read off the deflated series
 * rather than typed, and `shortfallPct` returns null where the latest reading
 * IS the peak, which is the case that would otherwise print «0,0% под него»
 * beside two identical numbers.
 *
 * @param {object|null} houseMarket
 */
export function marketIndexReading(houseMarket) {
  const nominal = marketPriceIndexSeries(houseMarket);
  const real = marketPriceIndexRealSeries(houseMarket);
  return {
    period: nominal.to,
    baseYear: nominal.baseYear,
    times: indexTimesBase(nominal.latest?.value, nominal.reference),
    realTimes: indexTimesBase(real.latest?.value, real.reference),
    nominalPeakPeriod: nominal.peak?.period ?? null,
    realPeakPeriod: real.peak?.period ?? null,
    realBelowPeakPct: shortfallPct(real.latest?.value, real.peak?.value),
    sourceUrl: nominal.sourceUrl,
    apiUrl: nominal.apiUrl,
    realSourceUrl: real.sourceUrl,
    realApiUrl: real.apiUrl,
  };
}

/**
 * The publisher's flags at the periods they apply to, keyed by period.
 *
 * Sparse in, sparse out. A quarter Eurostat did not flag has no entry, so the
 * presence of one MEANS something rather than being a default a renderer has to
 * filter — and a chart marking every quarter marks nothing.
 *
 * @param {Record<string, string|Record<string,string>>|null|undefined} status
 * @param {string|null} purchase  the field, or null where the cube has no split
 */
function flagsFor(status, purchase) {
  return Object.fromEntries(
    Object.entries(status ?? {})
      .map(([period, value]) => [
        period,
        typeof value === "string" ? value : (value?.[purchase ?? ""] ?? null),
      ])
      .filter(([, letter]) => Boolean(letter))
  );
}

/**
 * What Eurostat's flag letters mean, as a key a page can print.
 *
 * `b` break in series, `e` estimated, `p` provisional, `d` definition differs.
 * A letter carries no meaning to a reader on its own, so a chart that marks a
 * point has to be able to say what the mark is — and a marker nobody can look
 * up is worse than none.
 */
export const STATUS_LETTERS = Object.freeze(["b", "e", "p", "d"]);

/**
 * Which flags a series actually carries, in a stable order.
 *
 * Read off the data rather than listed in the template, so a page that prints a
 * key prints the entries it needs and no others — a legend naming a marker that
 * is nowhere on the chart is a question a reader cannot answer.
 *
 * @param {Array<Record<string, string>>} flagMaps
 * @returns {string[]}
 */
export function statusLettersUsed(flagMaps) {
  const seen = new Set();
  for (const map of flagMaps) {
    for (const letter of Object.values(map ?? {})) {
      for (const ch of String(letter)) seen.add(ch);
    }
  }
  return STATUS_LETTERS.filter((letter) => seen.has(letter));
}

/**
 * Eurostat's own published annual rate, every quarter they have published one.
 *
 * **Read, never derived** — the same rule the headline figure follows, and here
 * it matters more: eighty-one quarters recomputed across НСИ's rebasing would
 * differ from the published series in the last decimal at an unknown number of
 * points, and the page's claim is that a reader can check it.
 *
 * Reference zero, so the axis spans the sign change rather than starting at the
 * lowest bar. The series runs +34.6% to −26.8% and a plot that cropped either
 * end would be describing a different market.
 *
 * @param {object|null} houseMarket
 * @param {"total"|"new"|"existing"} [purchase]
 */
export function marketPriceRateSeries(houseMarket, purchase = "total") {
  const block = houseMarket?.price_index ?? null;
  return sourcedSeries(field(block?.annual_rate_pct, purchase), block, { reference: 0 });
}

/**
 * What a dwelling changed hands for, quarter by quarter, split by purchase type.
 *
 * **Split rather than total, and that is what makes it drawable.** The average
 * deal is a mean over whatever was sold that quarter, so a total line moves with
 * the mix of new builds and existing dwellings as well as with prices — and a
 * line chart invites exactly the reading that mix will not support. Within one
 * purchase type the mix is far narrower, and the two lines drawn apart show the
 * gap between them, which is the thing the mix caveat is about.
 *
 * @param {object|null} houseMarket
 * @param {"total"|"new"|"existing"} [purchase]
 */
export function marketAverageDealSeries(houseMarket, purchase = "existing") {
  const block = houseMarket?.avg_deal_eur ?? null;
  return {
    // Attributed to the VALUE cube, which is where the euro figure comes from
    // and the only block of the three carrying a page to link. `avg_deal_eur`
    // is ours and has no `source_url` of its own by design — a derived block
    // that cited a publisher's page would be attributing our division to them.
    ...sourcedSeries(field(block?.series_by_period, purchase), houseMarket?.value ?? null),
    // The disclosure travels with the drawing: this is the one series on the
    // page that is ours rather than a publisher's.
    derivedFrom: block?.derived_from_api_urls ?? null,
  };
}

/**
 * The share of people whose housing costs pass 40% of their household income,
 * every year EU-SILC has published one.
 *
 * Twenty annual points, of which the page showed the newest. The series is not
 * a trend — 21.2% in 2007, 5.9% in 2010, 20.7% in 2016, 6.9% in 2025 — and a
 * single reading of a figure that has swung by fifteen points twice tells a
 * reader almost nothing about it.
 *
 * @param {object|null} structure
 */
export function marketOverburdenSeries(structure) {
  const block = structure?.housing_cost_overburden ?? null;
  return {
    ...sourcedSeries(block?.series_by_period, block),
    // The newest reading and the year it belongs to, so a sentence naming the
    // figure takes it from the same place the chart does. Read off the block
    // rather than off the last point: the payload states which year it is
    // describing, and the last key in a series is a different fact that
    // happens to agree.
    value: Number.isFinite(block?.value_pct) ? block.value_pct : null,
    refPeriod: block?.ref_period ?? null,
  };
}

/**
 * What renting costs against a year earlier — the calculator's own line, read
 * here rather than fetched again.
 *
 * **The `source_url` is the payload's and the `api_url` is the row's**, and
 * that pairing is the whole reason this is wiring rather than a lookup in the
 * template. `hicp_categories.json` carries one publisher page for the whole
 * cube and a query per row, so a caption built from the row alone has no
 * databrowser link to offer and sends a reader to raw JSON as its FIRST
 * destination — on the page whose argument is that a sceptic can follow the
 * link and check.
 *
 * CP041 is actual rents paid for housing, not imputed rent and not the whole of
 * CP04, which sweeps in water, electricity and gas. A section asking what
 * housing costs against incomes would read very differently on CP04.
 *
 * @param {object|null} hicpCategories
 */
export function marketRent(hicpCategories) {
  const row =
    (hicpCategories?.categories ?? [])
      .flatMap((c) => c.groups ?? [])
      .find((g) => g?.cp_code === "CP041") ?? null;
  if (!row) return null;
  return {
    ...sourced(row.annual_rate_pct, null, { refPeriod: row.ref_period ?? null }),
    sourceUrl: hicpCategories?.source_url ?? null,
    apiUrl: row.api_url ?? null,
  };
}

/**
 * Price-to-income against its own long-run average, as a series.
 *
 * The one figure on the page whose meaning is genuinely hard to state in a
 * sentence and trivial to show: a line, a rule at 100, and where the reading
 * sits against its own history is answered without a paragraph.
 *
 * `reference` is 100 by construction — it is what `PTIR_LT_AVG` indexes against.
 *
 * @param {object|null} structure
 */
export function marketPriceToIncomeSeries(structure) {
  const block = structure?.price_to_income ?? null;
  return {
    ...sourcedSeries(block?.series_by_period, block, {
      reference: 100,
      // The unit is the whole claim: only PTIR_LT_AVG indexes the ratio against
      // this country's own long-run average, and a caller drawing a rule at 100
      // over any other unit has drawn a line through nothing.
      unit: block?.unit ?? null,
    }),
    value: Number.isFinite(block?.value) ? block.value : null,
    refPeriod: block?.ref_period ?? null,
  };
}
