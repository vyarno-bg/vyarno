/**
 * The payloads this page depends on — the one list that answers "which data?".
 *
 * Everything derives from it: `data.js#loadAll`, the freshness verdict in
 * `view/freshness.js#dataAge`, the data panel, `/version.json`, the sitemap's `lastmod`,
 * and the contract tests that hold pipeline, payload and page together. A
 * payload absent from this list is not fetched, not dated and not shown, so
 * adding one means adding a row — which is also what gives it a name, a source
 * link and a stated cadence.
 *
 * `cadenceDays` lives here rather than in the published envelope. It describes
 * the upstream, so the connector is arguably its owner, but nothing in the
 * pipeline reads it and publishing it would put a second copy in every JSON
 * file that only a full refresh can correct. One table that cannot drift from
 * itself beats one copy per payload that can drift from each other. `docs/data-sources.md` is
 * the authority on each upstream's rhythm; every row below names the one it
 * follows.
 *
 * `pages` is what keeps that list from becoming a tax. The site has more than
 * one page that reads data, and a manifest with no route on it means every
 * reader fetches every payload — somebody opening the calculator pays for the
 * property market's quarterly series, and somebody reading the market page
 * pays for the payroll table. Neither renders a figure from what it downloaded.
 * So each row names the routes that need it, `payloadsFor` is the only way to
 * ask, and it **throws on a route no row names** rather than returning nothing:
 * a typo'd page key would otherwise fetch an empty list, render every fallback
 * sentinel, and look exactly like an upstream outage.
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
 * - `pages`       the routes that render a figure from it. Not "the routes it
 *                 may appear on": a row listing a page that shows nothing from
 *                 it is a request every visitor to that page pays for and
 *                 nobody sees. `/legal/` and `/support/` name no payload at all
 *                 and fetch nothing, which is why they are absent from every
 *                 row rather than present with an empty list.
 * - `cadenceDays` how long after a refresh a newer upstream figure is expected.
 *                 Past it the row is "due"; past 1.5× it is "overdue" and the
 *                 page raises the banner. See `view/freshness.js#payloadStatus`.
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
      pages: ["home"],
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
      // `/market/` reads one group of it — CP041, rent — beside the housing
      // figures. Cheaper than a second payload carrying the same Eurostat cell,
      // and it cannot disagree with the calculator about what rent did.
      pages: ["home", "market"],
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
      // `/market/` reads `bgn_per_eur` and nothing else. ЕЦБ publish lending
      // volumes «in the currency of the period», so the leg before the euro
      // changeover has to be converted before it meets a euro denominator.
      pages: ["home", "market"],
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
      key: "regionSalary",
      file: "region_salary",
      pages: ["home"],
      // НСИ publishes the regional wage series quarterly.
      cadenceDays: 92,
      name: { bg: "Средна заплата по области", en: "Average wage by oblast" },
      feeds: {
        bg: "сравнението на заплатата ти със средната за твоята област",
        en: "the comparison of your pay with the average for your oblast",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
    {
      key: "sectorSalary",
      file: "sector_salary",
      // `/market/` reads the all-activities row, and only that row: the average
      // dwelling transaction expressed in years of pay is Eurostat's figure over
      // НСИ's, joined in the browser because neither published file may carry
      // the other's number.
      pages: ["home", "market"],
      // The same НСИ quarterly release as `regionSalary` — one publisher, two
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
      pages: ["home"],
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
      // The level the reader sees is dated separately, by the НСИ payload's own
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
      key: "cityPrice",
      file: "city_price",
      pages: ["home"],
      // imot.bg publishes no release calendar, so this is our own refresh
      // expectation rather than a schedule anyone promised us. A quarter,
      // because a €/m² average moves slowly enough that a month's lag is not a
      // wrong number, only a slightly old one.
      cadenceDays: 92,
      name: { bg: "Цени на жилищата по градове", en: "Home prices by city" },
      feeds: {
        bg: "цената на квадратен метър в твоя град и колко струва жилище",
        en: "the €/m² in your city and what a home costs",
      },
      // имот.bg's own newest published snapshot, read from each page's own
      // `<select name="date">`, else the day we read it. A DAY rather than a
      // statistical period, and that is not a gap in the data: a listings
      // average has no reference month, it is the state of the page when it was
      // read.
      //
      // **The panel dates the whole file, so it takes the OLDEST city's
      // snapshot.** A refresh reads 27 pages over a couple of minutes and
      // имот.bg recompute them on their own schedule, so the newest of them
      // would date the file by whichever city happened to be freshest and hide
      // the one that was not.
      refPeriod: (p) => {
        const days = (p?.cities ?? [])
          .map((c) => isoDay(c?.snapshot_date))
          .filter(Boolean)
          .sort();
        return days[0] ?? p?.as_of ?? null;
      },
      refPeriodIsDayDate: true,
    },
    {
      key: "houseMarket",
      file: "house_market",
      pages: ["market"],
      // Eurostat publish the quarter about three months after it closes, and
      // the value cube lands about a week behind the count cube. A quarter plus
      // a week, so a refresh that waits for the slower of the two is not
      // reported as a skipped one.
      cadenceDays: 99,
      name: { bg: "Сделки с жилища", en: "Home sales" },
      feeds: {
        bg: "колко жилища се купуват, колко се плаща за тях и средната сделка",
        en: "how many dwellings are bought, what is paid, and the average deal",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
    {
      key: "houseMarketStructure",
      file: "house_market_structure",
      pages: ["market"],
      // The slowest clock on the site after `salary_dist`. Tenure and
      // overburden are annual EU-SILC and the dwelling counts are a census, so
      // a quarterly cadence here would mark the row due three months after
      // every refresh and raise the banner over figures no refresh can change.
      // A year plus a day, for the reason `payroll` carries 366.
      cadenceDays: 366,
      name: { bg: "Жилищен фонд и собственост", en: "Housing stock and tenure" },
      feeds: {
        bg: "кой живее в собствено жилище, кой дължи по него и колко жилища стоят празни",
        en: "who owns their home, who owes on it, and how many dwellings stand empty",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
    {
      key: "nsiHousing",
      file: "nsi_housing",
      pages: ["market"],
      // НСИ publish the quarter about three months after it closes and roughly
      // a week ahead of Eurostat's dissemination of the same figures, so this
      // moves on the same clock as `houseMarket` and slightly earlier.
      cadenceDays: 99,
      name: { bg: "Цени и сделки по градове", en: "Prices and sales by city" },
      feeds: {
        bg: "как се движат цените и броят сделки в шестте най-големи града",
        en: "how prices and transaction counts move in the six largest cities",
      },
      refPeriod: (p) => p?.ref_period ?? null,
    },
    {
      key: "mortgage",
      file: "mortgage",
      // `/market/` reads the lending VOLUMES rather than the rate: how much was
      // handed over on new home loans, less the part that is a household
      // repricing a loan it already had, against what was paid for dwellings.
      pages: ["home", "credit", "market"],
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
      key: "credit",
      file: "credit",
      // `/market/` reads one block of it — the housing loan book, December
      // against December, which is the net money the banks put into buying.
      pages: ["credit", "market"],
      // ECB MIR, the same monthly release `mortgage` reads.
      cadenceDays: 31,
      name: { bg: "Лихви по потребителски кредити", en: "Consumer credit rates" },
      feeds: {
        bg: "какво струват потребителският кредит, овърдрафтът и кредитната карта, и какво плаща депозитът",
        en: "what a consumer loan, an overdraft and a credit card cost, and what a deposit pays",
      },
      // Five products, one release, so any of them dates the file. Consumer
      // credit is the one with a volume behind it.
      refPeriod: (p) => p?.consumer?.ref_period ?? null,
    },
    {
      key: "unemployment",
      file: "unemployment",
      pages: ["home"],
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

/**
 * Every route named by a row, derived from the rows rather than declared beside
 * them — a second list of page names is one more thing that can disagree with
 * the manifest, and the disagreement would be silent.
 */
export const PAYLOAD_PAGES = Object.freeze([...new Set(PAYLOADS.flatMap((p) => p.pages))].sort());

/**
 * The rows one route needs — the only way to ask, so `loadAll` and the panel
 * cannot answer it differently.
 *
 * That pairing is the point. `view/freshness.js#dataAge` reports a row it was given no
 * payload for as `absent`, and `absent` is what the page renders its "some data
 * is missing" state from. Hand the panel the whole manifest while fetching one
 * route's share of it and every unfetched payload reads as an upstream that
 * failed — a permanent warning about data the page was never going to show.
 *
 * @param {string} page  a route key; every one in use appears in `PAYLOAD_PAGES`
 * @returns {ReadonlyArray<object>} the matching rows, in panel order
 */
export function payloadsFor(page) {
  const rows = PAYLOADS.filter((entry) => entry.pages.includes(page));
  if (!rows.length) {
    throw new Error(
      `payloadsFor: no payload names the route "${page}". Routes in use are ` +
        `${PAYLOAD_PAGES.join(", ")}. A route that genuinely needs no data does not ` +
        "call this — /legal/ and /support/ fetch nothing at all."
    );
  }
  return Object.freeze(rows);
}
