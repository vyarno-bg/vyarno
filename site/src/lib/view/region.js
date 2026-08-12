/**
 * The област a reader picked, and what the payloads publish about it.
 *
 * The picker is the one control whose contents nothing downstream decides, so
 * its failure is silent on both sides: «София» and «София(столица)» are НСИ's
 * own labels for Софийска област and for the capital, they sort adjacent, and
 * a reader who takes the wrong one is compared against a wage 32% lower and
 * told имот.bg publish no price where they live. Both are real области with
 * real figures, so no gate anywhere can catch it.
 *
 * Every function here SELECTS a published row rather than computing one, and
 * each takes the code as an argument — a figure and its label have to be about
 * the same place, and a selector that defaulted to a reference област would
 * print София's baseline under Варна's name
 * (`docs/site.md` §"A correct formula fed the wrong number").
 *
 * One of the ten modules under `src/lib/view/`, paired with
 * `scripts/verify_view_region.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

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
 * Exported so `verify_view_region.mjs` can hold the keys against the live
 * payload: a key that matches no row is НСИ having renamed one, and the rename
 * then stops applying silently — «София» would render for the ОБЛАСТ, adjacent
 * to the capital in the same list, with a wage 32% lower behind it.
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
 * rule is a test rather than a branch in here.** `verify_view_region.mjs`
 * asserts over the published payload that every option name is non-empty and
 * unique, that both keys above still match a row НСИ publish, and that no name
 * the table did not write is a whole-word prefix of another. So an НСИ split
 * this table does not cover — a «Пловдив(град)» row appearing beside «Пловдив»
 * — fails a run instead of shipping two entries a reader cannot tell apart.
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
