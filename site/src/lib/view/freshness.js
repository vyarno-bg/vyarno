/**
 * Whether the figures on the page are still current.
 *
 * Every payload is judged against ITS OWN cadence and the page's age is taken
 * from the OLDEST of them. Neither is arithmetic, so neither has a formula
 * behind it that a test of `mirror.js` could catch: sixty days is late for a
 * monthly release and exactly normal for a quarterly one, and an age measured
 * from the newest payload reports the panel fresh while the figure a reader is
 * looking at is two quarters behind. A payload that never loaded carries no
 * date at all, and `absent` is its own verdict rather than a silent pass.
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_freshness.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

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
