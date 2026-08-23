#!/usr/bin/env node
/**
 * Whether the figures on the page are still current.
 *
 * Every payload is judged against its OWN cadence and the aggregate age is
 * taken from the OLDEST of them. Neither has arithmetic behind it to catch a
 * slip: sixty days is late for a monthly release and exactly normal for a
 * quarterly one, so one site-wide threshold has to call one of them wrong; an
 * age measured from the newest payload reports the panel fresh while the
 * figure a reader is looking at is two quarters behind; and a payload that
 * never loaded carries no date at all, which reads as fresh to anything that
 * only subtracts.
 *
 * One of the `verify_view_*.mjs` suites; `docs/testing-strategy.md` §"Where a
 * test belongs" says which of them a new case goes in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { dataAge, dataNotice, payloadStatus, STALE_AFTER_DAYS } from "../src/lib/view/freshness.js";
import { PAYLOADS } from "../src/lib/payloads.js";
import { published } from "./published-payload.mjs";

const read = published;

// ---------------------------------------------------------------------------
// Freshness — measured from the OLDEST payload
// ---------------------------------------------------------------------------

const DAY = 86400000;
const NOW = Date.parse("2026-07-25");

/** A manifest row, defaulted, so each test states only what it is about. */
const entry = (key, cadenceDays = 31, extra = {}) => ({
  key,
  file: key,
  cadenceDays,
  name: { bg: key, en: key },
  feeds: { bg: key, en: key },
  refPeriod: (p) => p?.ref_period ?? null,
  ...extra,
});

test("payloadStatus judges a payload against its OWN cadence, not one threshold", () => {
  // 60 days is late for a monthly release and exactly normal for a quarterly
  // one. A single site-wide threshold has to call both the same, and whichever
  // it picks is wrong for one of them.
  const sixtyDaysOld = { as_of: "2026-05-28" };
  assert.equal(payloadStatus(sixtyDaysOld, 31, NOW).status, "overdue", "monthly, 60d → overdue");
  assert.equal(payloadStatus(sixtyDaysOld, 92, NOW).status, "fresh", "quarterly, 60d → fresh");
  assert.equal(payloadStatus(sixtyDaysOld, 366, NOW).status, "fresh", "annual, 60d → fresh");
});

test("payloadStatus reports due before overdue, and absent for a payload that did not load", () => {
  const at = (days, cadence) =>
    payloadStatus({ as_of: "2026-01-01" }, cadence, Date.parse("2026-01-01") + days * DAY).status;
  // Inside the cadence: fresh. Past it the upstream has probably published and
  // we have not fetched — worth a dot, not a banner. Past 1.5× it is a skipped
  // refresh and the banner fires.
  assert.equal(at(31, 31), "fresh");
  assert.equal(at(32, 31), "due");
  assert.equal(at(46, 31), "due");
  assert.equal(at(47, 31), "overdue", "1.5 × 31 = 46.5, so 47 days is over it");
  // A missing payload is not fresh: reporting it so is how a page renders
  // offline sentinels while claiming today's date.
  assert.equal(payloadStatus(null, 31, NOW).status, "absent");
  assert.equal(payloadStatus({}, 31, NOW).status, "absent");
  // No declared cadence falls back to the old flat rule rather than passing.
  assert.equal(
    payloadStatus({ as_of: "2026-01-01" }, undefined, NOW).cadenceDays,
    STALE_AFTER_DAYS
  );
});

test("dataAge measures the aggregate from the OLDEST payload, never the newest", () => {
  // The maximum would let one freshly-republished file stand in for the site's
  // freshness while every other payload stayed where it was. `payroll.json` is
  // hand-maintained and the one most likely to be refreshed alone, so this is
  // the realistic failure rather than a corner case.
  const age = dataAge(
    { hicpHeadline: { as_of: "2026-02-20" }, payroll: { as_of: "2026-07-25" } },
    [entry("hicpHeadline", 31), entry("payroll", 366)],
    NOW
  );
  assert.equal(age.oldestAsOf, "2026-02-20");
  assert.equal(age.daysOld, 155);
  assert.equal(age.newestAsOf, "2026-07-25");
  // …and the verdict names WHICH payload is late: the 5-month-old HICP is
  // overdue on a monthly cadence, the payroll table is not on an annual one.
  assert.equal(age.stale, true, "a 5-month-stale HICP must raise the banner");
  assert.deepEqual(
    age.overdue.map((r) => r.key),
    ["hicpHeadline"]
  );
});

test("dataAge reports a payload that failed to load instead of skipping it", () => {
  const age = dataAge({ a: { as_of: "2026-07-20" }, b: null }, [entry("a"), entry("b")], NOW);
  assert.equal(age.oldestAsOf, "2026-07-20");
  assert.equal(age.stale, false, "a missing payload is not an overdue refresh");
  assert.deepEqual(
    age.missing.map((r) => r.key),
    ["b"],
    "…but it must be visible in the panel rather than silently absent"
  );
});

test("a payload that never arrived reaches the notice, not only the panel", () => {
  // `dataAge` has returned `overdue` and `missing` side by side all along, and
  // every surface reached for `.overdue` alone — so a 404 raised nothing. On
  // `/market/` that took nine of eighteen tables off the page under headings
  // that still promised them, with no line anywhere saying so.
  const age = dataAge(
    { a: { as_of: "2026-07-20" }, b: null, c: { as_of: "2026-01-01" } },
    [entry("a"), entry("b"), entry("c")],
    NOW
  );
  const notice = dataNotice({ age, ready: true });

  assert.deepEqual(
    notice.gone.map((r) => r.key),
    ["b"],
    "the payload that failed to fetch is not in the notice, so nothing warns about it"
  );
  assert.deepEqual(
    notice.late.map((r) => r.key),
    ["c"],
    "the overdue payload dropped out while the missing one was added"
  );
  // The count is both, because the banner announces one number and a reader
  // who is told "1 of the figures" over two broken payloads has been undercounted.
  assert.equal(notice.count, 2);
  assert.equal(notice.show, true);

  // Each row still carries the manifest's own name pair, in both languages —
  // `DataLate` names them and a missing half renders as a blank line.
  for (const row of [...notice.gone, ...notice.late]) {
    assert.equal(typeof row.name.bg, "string");
    assert.equal(typeof row.name.en, "string");
    assert.ok(row.name.bg && row.name.en, `${row.key} carries no name in one language`);
  }
});

test("the notice says nothing until the fetch has resolved", () => {
  // Before `loadAll` resolves, every payload is `absent` — which is this
  // function's own alarm condition. Ungated, the band would announce that every
  // dataset on the site had failed, on every first paint, and then vanish.
  const age = dataAge({}, [entry("a"), entry("b")], NOW);
  assert.equal(age.missing.length, 2, "premise: an unfetched manifest reads as wholly absent");

  const loading = dataNotice({ age, ready: false });
  assert.deepEqual(loading.gone, []);
  assert.deepEqual(loading.late, []);
  assert.equal(loading.show, false, "the band would flash on every page load");

  // And it is not merely quiet — once the fetch resolves on the same verdict it
  // speaks, so the gate delays the warning rather than swallowing it.
  assert.equal(dataNotice({ age, ready: true }).show, true);

  // A caller with no verdict at all gets silence rather than a crash: `/market/`
  // holds `null` until `onMount` runs.
  assert.equal(dataNotice({ age: null, ready: true }).show, false);
});

test("dataAge falls back to today when nothing loaded", () => {
  const age = dataAge({}, [], NOW);
  assert.match(age.oldestAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(age.daysOld, 0);
  assert.equal(age.stale, false);
  assert.deepEqual(age.rows, []);
});

test("dataAge rows carry what the panel renders, including the period", () => {
  // The period a figure DESCRIBES and the day we FETCHED it are different facts,
  // a month apart on the HICP payloads. The row carries both, separately.
  const [row] = dataAge(
    { hicpHeadline: { as_of: "2026-07-27", ref_period: "2026-06", source: "eurostat" } },
    [entry("hicpHeadline", 31)],
    NOW
  ).rows;
  assert.equal(row.asOf, "2026-07-27");
  assert.equal(row.refPeriod, "2026-06");
  assert.equal(row.source, "eurostat");
  assert.equal(row.status, "fresh");
});

test("every manifest payload resolves a reference period from what it publishes", () => {
  // The panel's period column is only honest if every row can find its own
  // period, and they keep it in different places: `mortgage` per rate tier,
  // `payroll` as an effective year, `city_price` as имот.bg's own snapshot day,
  // `salary_dist` as the SES wave. An accessor that silently returns null
  // renders "—" for ever and nobody notices.
  const missing = [];
  for (const p of PAYLOADS) {
    const payload = read(p.file);
    if (!payload) continue;
    if (p.refPeriod(payload) === null) missing.push(p.file);
  }
  assert.deepEqual(
    missing,
    [],
    `manifest rows that cannot date their own figures: ${missing.join(", ")}`
  );
});

test("a payload on two clocks names both of them, not whichever block was asked", () => {
  // A row's period slot is a claim about EVERY figure in the file, and a
  // payload whose blocks run on different releases cannot honour it with one of
  // them picked by name. `credit.json` is the case: eight ECB MIR blocks at a
  // month, and `non_performing` at a quarter about five months behind — so
  // dated by `consumer` alone the row reported June over a Q1 figure.
  //
  // The rule is over the WHOLE manifest rather than over that row, which is
  // what makes a third clock inexpressible: a block added to any payload with a
  // period neither slot names fails here, rather than being dropped silently
  // into a period that is wrong for it.
  //
  // Only top-level blocks carry a `ref_period` of their own; a nested one (a
  // rate tier inside `mortgage`) is that block's business and is dated where it
  // is rendered.
  const unnamed = [];
  for (const p of PAYLOADS) {
    const payload = read(p.file);
    if (!payload) continue;

    const inFile = new Set(
      Object.values(payload)
        .filter((v) => v && typeof v === "object" && !Array.isArray(v))
        .map((v) => v.ref_period)
        .filter((v) => typeof v === "string" && v)
    );
    if (inFile.size < 2) continue; // one clock, and the row above holds it

    const named = new Set(
      [p.refPeriod(payload), p.refPeriodSecondary?.(payload)?.period].filter(Boolean)
    );
    for (const period of inFile) {
      if (!named.has(period)) unnamed.push(`${p.file}: ${period}`);
    }
  }
  assert.deepEqual(
    unnamed,
    [],
    "a block's reference period that no manifest slot names, so the panel dates " +
      `it by another block's clock: ${unnamed.join(", ")}`
  );

  // And the case that prompted it, asserted by name so the row cannot quietly
  // lose its second slot while the sweep above still passes on one clock.
  const credit = read("credit");
  if (credit) {
    const row = PAYLOADS.find((p) => p.key === "credit");
    assert.equal(row.refPeriod(credit), credit.consumer.ref_period);
    assert.equal(row.refPeriodSecondary(credit)?.period, credit.non_performing.ref_period);
    assert.notEqual(
      credit.consumer.ref_period,
      credit.non_performing.ref_period,
      "premise: credit.json still runs on two clocks"
    );
  }
});

test("a second reference period is shown only where there is a second vintage", () => {
  // The label exists so one vintage cannot date another — `salary_dist` is the
  // case it was written for. When the ladder was re-levelled to an НСИ quarter
  // the file held two vintages and the panel owed both; the НСИ split left one,
  // and the row printed "2022" followed by "shape: Eurostat SES 2022". A
  // duplicate reads as a defect on the one panel the whole freshness argument
  // points at.
  for (const p of PAYLOADS) {
    if (!p.refPeriodSecondary) continue;
    const payload = read(p.file);
    if (!payload) continue;
    const secondary = p.refPeriodSecondary(payload);
    if (secondary === null) continue;
    assert.notEqual(
      String(secondary.period),
      String(p.refPeriod(payload)),
      `${p.file} offers a second period equal to its first — the panel would ` +
        "print the same vintage twice, once bare and once labelled."
    );
    // **The label is what says which vintage the period belongs to**, and the
    // panel renders `.l-bg` and `.l-en` from it. A missing half is a blank line
    // rather than a fallback, so the row would print a bare year under a
    // heading that no longer says what it is a year of.
    for (const lang of ["bg", "en"]) {
      assert.equal(
        typeof secondary.label?.[lang],
        "string",
        `${p.file}'s second period carries no ${lang} label`
      );
      assert.ok(
        secondary.label[lang].trim(),
        `${p.file}'s ${lang} label for its second period is empty — it renders as a blank line`
      );
    }
  }

  // And the accessor still fires when the vintages genuinely differ, so this is
  // not satisfied by an accessor that has quietly stopped returning anything.
  const dist = PAYLOADS.find((p) => p.key === "salaryDist");
  assert.deepEqual(
    dist.refPeriodSecondary({ ref_period: "2026-Q1", shape: { ref_year: 2022 } }),
    {
      period: "2022",
      label: { bg: "форма: Евростат SES", en: "shape: Eurostat SES" },
    },
    "a re-levelled ladder must name the SES wave its dispersion came from"
  );
});

test("salary_dist runs on the SES cycle, not on a quarterly clock", () => {
  // It carried 92 days from when the ladder was re-levelled to the latest НСИ
  // quarter. After the split there is nothing quarterly in the file — Eurostat
  // publishes SES every four years — so the row would have gone overdue, and
  // raised the site-wide staleness banner, over a figure that could not be
  // refreshed until the 2026 wave lands in 2028.
  const dist = PAYLOADS.find((p) => p.key === "salaryDist");
  assert.ok(
    dist.cadenceDays > 1400,
    `salary_dist is on a ${dist.cadenceDays}-day cadence. SES is quadrennial; ` +
      "anything shorter reports a payload nobody can refresh as overdue."
  );

  // The property that matters is the banner, so assert on the banner: three
  // years after the committed refresh, with everything else current, the site
  // must still be calling itself fresh.
  const parts = Object.fromEntries(PAYLOADS.map((p) => [p.key, read(p.file)]));
  if (!parts.salaryDist) return;
  const threeYearsOn = Date.parse(parts.salaryDist.as_of) + 1095 * 86_400_000;
  const { status } = payloadStatus(parts.salaryDist, dist.cadenceDays, threeYearsOn);
  assert.equal(status, "fresh", "salary_dist goes stale before the next SES wave exists");
});

test("city_price is refreshed by hand, and the banner is what says it is due", () => {
  // The only payload no job can refresh and no check can verify: имот.bg answer
  // a datacenter IP with 403, so there is no refresh-city-price.yml and the 28
  // citations report UNCHECKED every week. `docs/sources/imot.md` §"How this
  // payload gets refreshed" decides the process — by hand, quarterly — and this
  // is the machinery that process leans on, so it is asserted rather than
  // assumed. Nothing else here would go red if the row lost its cadence: the
  // fallback is 45 days and a shipped payload that young looks fine.
  const city = PAYLOADS.find((p) => p.key === "cityPrice");
  assert.equal(city.cadenceDays, 92, "the documented cadence is a quarter");

  const parts = Object.fromEntries(PAYLOADS.map((p) => [p.key, read(p.file)]));
  if (!parts.cityPrice) return;
  const at = (days) => Date.parse(parts.cityPrice.as_of) + days * DAY;
  // Only this row is asked about: advancing the clock ages every payload, and
  // the monthly ones going overdue alongside it is not what is under test.
  const named = (days) =>
    dataNotice({ age: dataAge(parts, PAYLOADS, at(days)), ready: true }).late.some(
      (r) => r.file === "city_price"
    );

  // A quarter is `due`, not an alarm: a hand-run refresh gets the 46 days
  // OVERDUE_MULTIPLE allows before a reader is told anything.
  assert.equal(payloadStatus(parts.cityPrice, city.cadenceDays, at(92)).status, "fresh");
  assert.equal(payloadStatus(parts.cityPrice, city.cadenceDays, at(120)).status, "due");
  assert.equal(named(138), false, "the banner names it inside the slack a hand refresh gets");

  // Past 138 days the refresh was skipped rather than late, and the banner
  // names the file — to the reader and to whoever opens the site next, which
  // is the whole of the reminder this payload has.
  assert.equal(named(139), true, "139 days on, the banner does not name city_price");
});

test("the shipped payloads are all fresh against their own cadences as committed", () => {
  const parts = Object.fromEntries(PAYLOADS.map((p) => [p.key, read(p.file)]));
  if (!parts.hicpHeadline) return;
  // Measured against the newest as_of in the repo rather than wall-clock: a
  // checkout is reviewed at an unknown time, so this asserts the payloads were
  // refreshed TOGETHER, not that they are current today. Judging each row on its
  // own cadence is what makes a committed partial refresh visible here.
  const newest = Date.parse(dataAge(parts, PAYLOADS).newestAsOf);
  const { overdue, rows } = dataAge(parts, PAYLOADS, newest);
  assert.deepEqual(
    overdue.map((r) => `${r.file} (${r.daysOld}d, cadence ${r.cadenceDays}d)`),
    [],
    "a partial refresh is committed — these payloads lag the newest one by more " +
      "than their own cadence allows"
  );
  assert.equal(rows.length, PAYLOADS.length, "every manifest payload must have a row");
});
