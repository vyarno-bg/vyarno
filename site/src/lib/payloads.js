/**
 * The payloads this page depends on — the one list that answers "which data?".
 *
 * Everything derives from it: `data.js#loadAll`, the freshness verdict in
 * `view.js#dataAge`, the data panel, `/version.json`, the sitemap's `lastmod`,
 * and the contract tests that hold pipeline, payload and page together. A
 * payload absent from this list is not fetched, not dated and not shown, so
 * adding one means adding a row — which is also what gives it a name, a source
 * link and a stated cadence.
 *
 * `cadenceDays` lives here rather than in the published envelope. It describes
 * the upstream, so the connector is arguably its owner, but nothing in the
 * pipeline reads it and publishing it would put a second copy in eight JSON
 * files that only a full refresh can correct. One table that cannot drift from
 * itself beats eight that can drift from each other. `docs/data-sources.md` is
 * the authority on each upstream's rhythm; every row below names the one it
 * follows.
 */

/**
 * `d.m.yyyy` (imot.bg's own «обновена на» wording) as an ISO day, or null.
 *
 * Normalised here so every row's `refPeriod` is one of two known shapes — an ISO
 * day or a pipeline period label — and the renderer picks a formatter from
 * `refPeriodIsDayDate` rather than sniffing the string.
 *
 * @param {string | undefined | null} value
 * @returns {string | null}
 */
function isoDay(value) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * One row per payload the page depends on, in the order the panel lists them:
 * prices first, then pay, then housing, then borrowing.
 *
 * - `key`         the property name in the `loadAll()` result. The rest of the
 *                 SPA reads `data.<key>`, so this is part of the contract.
 * - `file`        the published filename stem, `data/published/<file>.json`.
 * - `cadenceDays` how long after a refresh a newer upstream figure is expected.
 *                 Past it the row is "due"; past 1.5× it is "overdue" and the
 *                 page raises the banner. See `view.js#payloadStatus`.
 * - `name`        the panel's row label.
 * - `feeds`       what this payload produces ON THE PAGE. Not decoration: it is
 *                 the reader-facing half of the rule `verify_wiring.mjs` holds
 *                 from the other side — we cite no source that feeds nothing,
 *                 and we show no figure whose source is unnamed.
 * - `refPeriod`   the period the figures DESCRIBE, dug out of the payload.
 *                 Distinct from `as_of`, the day we fetched them, and the one a
 *                 reader quoting the number needs: HICP figures fetched on 27
 *                 July describe June. Each payload keeps it under its own key,
 *                 so the row says where rather than the panel guessing.
 * - `refPeriodSecondary`
 *                 for a payload built from two vintages, the second one, with
 *                 its own label. `salary_dist` is the case: a 2022 survey's
 *                 dispersion re-levelled to a 2026 quarter's average, where
 *                 naming only the quarter would date the whole ladder four
 *                 years later than its shape.
 */
export const PAYLOADS = Object.freeze(
  [
    {
      key: "hicpHeadline",
      file: "hicp_headline",
      // Eurostat's HICP release is monthly, mid-month, not pinned to a date.
      cadenceDays: 31,
      name: { bg: "Официална инфлация", en: "Official inflation" },
      feeds: {
        bg: "числото на Евростат за всички стоки и услуги, и индексът от 2020 г.",
        en: "Eurostat's all-items figure, and the index back to 2020",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
    {
      key: "hicpCategories",
      file: "hicp_categories",
      cadenceDays: 31,
      name: { bg: "Инфлация по групи", en: "Inflation by group" },
      feeds: {
        bg: "13-те групи на кошницата, теглата им и поскъпването на всяка",
        en: "the 13 basket groups, their weights and each one's price rise",
      },
      // The envelope states the rate month; each category repeats it, so the
      // fallback holds for a payload published before the envelope carried it.
      refPeriod: (p) => p?.ref_period ?? p?.categories?.[0]?.ref_period ?? null,
    },
    {
      key: "payroll",
      file: "payroll",
      // Legislative, not statistical: the table changes on 1 January and when
      // parliament amends it. A year plus a day, so a January refresh landing
      // late is not reported as a skipped one.
      cadenceDays: 366,
      name: { bg: "Данъци и осигуровки", en: "Tax and contributions" },
      feeds: {
        bg: "превръщането на брутна в нетна заплата и данъчната тежест",
        en: "the gross-to-net conversion and the tax wedge",
      },
      refPeriod: (p) => (p?.effective_year ? String(p.effective_year) : null),
    },
    {
      key: "sofiaSalary",
      file: "sofia_salary",
      // НСИ publishes the regional wage series quarterly.
      cadenceDays: 92,
      name: { bg: "Средна заплата в София", en: "Sofia average wage" },
      feeds: {
        bg: "сравнението на заплатата ти със средната за София",
        en: "the comparison of your pay with the Sofia average",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
    {
      key: "sectorSalary",
      file: "sector_salary",
      // The same НСИ quarterly release as `sofiaSalary` — one publisher, two
      // cuts of the same labour statistic, so they go stale together.
      cadenceDays: 92,
      name: { bg: "Средна заплата по дейности", en: "Average wage by activity" },
      feeds: {
        bg: "сравнението на заплатата ти със средната за твоя сектор",
        en: "the comparison of your pay with the average for your sector",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
    {
      key: "salaryDist",
      file: "salary_dist",
      // The SES cycle, four years and a day, and nothing shorter is honest.
      //
      // This file is Eurostat's shape at Eurostat's own level — one publisher
      // per file, `docs/legal.md` §НСИ — so every figure in it moves on SES's
      // clock and no other. SES publishes every four years and the 2026 wave
      // is not disseminated until 2028, so a quarterly cadence here reports a
      // payload nobody can refresh as overdue and raises the site-wide
      // staleness banner over a figure that is not stale. **A banner that
      // fires when nothing is wrong is worse than no banner**, because the
      // next one is read as noise too.
      //
      // The level the reader sees is dated separately, by `sofia_salary`'s own
      // quarterly row: the ladder is composed in the browser, so the two
      // vintages are judged on the two clocks they actually follow.
      //
      // Four years plus a day for the same reason `payroll` carries 366: a
      // release landing slightly late is not a skipped release.
      cadenceDays: 1462,
      name: { bg: "Разпределение на заплатите", en: "Pay distribution" },
      feeds: {
        bg: "подредбата, която показва къде си спрямо останалите",
        en: "the ladder showing where you stand against everyone else",
      },
      // The SES wave, which is the only vintage this file carries.
      refPeriod: (p) => p?.ref_period ?? null,
      // A payload built from two vintages names the second one, **and only
      // when the two differ**. SES runs on a four-year cycle — BG's waves are
      // 2002, 2006, 2010, 2014, 2018, 2022 — and Regulation (EU) 2025/941,
      // which replaced Reg (EC) 530/1999 on 2026-01-01, keeps the periodicity
      // at "Every 4 years" and names 2026 as the first reference period under
      // it, with a T+16-month transmission deadline. So the 2022 shape stands
      // until 2028, and a ladder re-levelled to a recent quarter would date
      // that dispersion as current unless the panel named both.
      //
      // While one file carries one vintage the label says nothing, and a row
      // printing "2022" above "shape: Eurostat SES 2022" reads as a defect
      // rather than as provenance. Hence the equality guard: the label is owed
      // when there are two vintages to tell apart and not otherwise.
      refPeriodSecondary: (p) => {
        const year = p?.shape?.ref_year;
        if (!year || String(year) === String(p?.ref_period ?? "")) return null;
        return {
          period: String(year),
          label: { bg: "форма: Евростат SES", en: "shape: Eurostat SES" },
        };
      },
    },
    {
      key: "sofiaPrice",
      file: "sofia_price",
      // imot.bg publishes no release calendar, so this is our own refresh
      // expectation rather than a schedule anyone promised us. A quarter,
      // because a €/m² average moves slowly enough that a month's lag is not a
      // wrong number, only a slightly old one.
      cadenceDays: 92,
      name: { bg: "Цени на жилищата в София", en: "Sofia home prices" },
      feeds: {
        bg: "цената на квадратен метър по квартали и колко струва жилище",
        en: "the €/m² by district and what a home costs",
      },
      // imot.bg's own «обновена на» stamp when the scraper finds one, else the
      // day we scraped. A DAY rather than a statistical period, and that is not
      // a gap in the data: a listings average has no reference month, it is the
      // state of the page when it was read. The page's stamp is often missing,
      // and falling back to `as_of` states that honestly.
      refPeriod: (p) => isoDay(p?.page_as_of_dd_mm_yyyy) ?? p?.as_of ?? null,
      refPeriodIsDayDate: true,
    },
    {
      key: "mortgage",
      file: "mortgage",
      // ECB MIR and БНБ both publish monthly.
      cadenceDays: 31,
      name: { bg: "Лихва по жилищни кредити", en: "Home loan rate" },
      feeds: {
        bg: "лихвата, с която започва ипотечният калкулатор, и лимитите на БНБ",
        en: "the rate the mortgage calculator starts from, and the BNB limits",
      },
      // Two tiers, each with its own reference month. `headline` names the one
      // the calculator defaults to, so the panel dates the figure it shows.
      refPeriod: (p) => p?.[p?.headline]?.ref_period ?? p?.new_business?.ref_period ?? null,
    },
    {
      key: "unemployment",
      file: "unemployment",
      // `une_rt_m` is monthly, seasonally adjusted.
      cadenceDays: 31,
      name: { bg: "Безработица", en: "Unemployment" },
      feeds: {
        bg: "процентът на безработните в лентата с националните числа",
        en: "the unemployment rate in the national figures strip",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
  ].map(Object.freeze)
);

/** The `loadAll()` result keys, in panel order. */
export const PAYLOAD_KEYS = Object.freeze(PAYLOADS.map((p) => p.key));

/** The published filename stems, in panel order. */
export const PAYLOAD_FILES = Object.freeze(PAYLOADS.map((p) => p.file));
