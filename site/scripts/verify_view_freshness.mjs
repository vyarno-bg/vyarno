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

import { dataAge, payloadStatus, STALE_AFTER_DAYS } from "../src/lib/view/freshness.js";
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
