#!/usr/bin/env node
/**
 * Contract verification for `src/lib/data.js` — the layer between the
 * published JSON and the SPA — plus the end-to-end checks that run the
 * SPA's own math over the JSON actually committed in `data/published/`.
 *
 * Runs under Node's built-in `node:test` runner, no dependencies.
 * Invoked by `npm run verify:math` from `site/`.
 *
 * Two things are verified here that nothing else could:
 *
 *   1. The FALLBACK CHAINS. `mortgageDefaultRate` picks which of two
 *      genuinely different rates the calculator defaults to, and relabels
 *      when it degrades. A silent tier swap ships a wrong mortgage payment
 *      to someone deciding on a home loan, and no pipeline test can see it
 *      because the bug lives in the SPA.
 *   2. The SHIPPED JSON, read through the SPA's own functions. The pipeline
 *      validates what it publishes; this validates what the browser will
 *      actually compute from the files in the repo — reconciliation, the
 *      index base, the payroll sentinel parity, the salary ladder.
 *
 * If a published file is missing (a fresh clone before the first refresh),
 * the JSON-backed tests skip rather than fail — but the file list itself
 * is asserted, so a DELETED payload is a failure, not a silent skip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  mortgageDefaultRate,
  mortgageAprc,
  mortgageLendingLimits,
  loadAll,
} from "../src/lib/data.js";
import { PAYLOAD_KEYS, PAYLOADS } from "../src/lib/payloads.js";
import { sofiaQuarter } from "../src/lib/view.js";
import { HOME, PRESETS } from "../src/lib/content.js";
import {
  officialInflation,
  officialCumulativeSince2020,
  buildLadder,
  composeLadder,
  percentile,
  payrollParams,
  bgNetSalary,
  BG_PAYROLL_DEFAULT,
} from "../src/lib/mirror.js";
import { published, PUBLISHED_DIR as PUBLISHED } from "./published-payload.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The published filename stems, taken FROM the manifest rather than restated. */
const PAYLOAD_STEMS = PAYLOADS.map((p) => p.file);

const read = published;

// ---------------------------------------------------------------------------
// The mortgage rate fallback chain (data.js#mortgageDefaultRate)
// ---------------------------------------------------------------------------

test("mortgageDefaultRate leads with new_business — the rate a new loan costs", () => {
  const r = mortgageDefaultRate({
    new_business: { value_pct: 2.43, ref_period: "2026-05" },
    outstanding_stock: { value_pct: 2.67, ref_period: "2026-05" },
  });
  assert.equal(r.pct, 2.43);
  assert.equal(r.label, "new_business");
  // The tier's reference month rides along so the hint dates the rate instead
  // of calling it "current" — the property README's provenance section claims.
  assert.equal(r.refPeriod, "2026-05");
});

test("mortgageDefaultRate falls back to outstanding_stock AND relabels", () => {
  // The label is not decoration: the two tiers answer different questions,
  // so the UI must be able to say which one it is showing. A fallback that
  // kept the "new business" label would misdescribe the number. The fallback
  // tier carries its OWN reference month, not the missing one's.
  const r = mortgageDefaultRate({
    new_business: null,
    outstanding_stock: { value_pct: 2.67, ref_period: "2026-04" },
  });
  assert.equal(r.pct, 2.67);
  assert.equal(r.label, "outstanding_stock");
  assert.equal(r.refPeriod, "2026-04");
});

test("mortgageDefaultRate skips a tier present but empty (value_pct null)", () => {
  const r = mortgageDefaultRate({
    new_business: { value_pct: null, aprc: { value_pct: 2.77 } },
    outstanding_stock: { value_pct: 2.67 },
  });
  assert.equal(r.label, "outstanding_stock");
});

test("mortgageDefaultRate ends at the offline sentinel when nothing loaded", () => {
  for (const payload of [null, undefined, {}, { new_business: {}, outstanding_stock: {} }]) {
    const r = mortgageDefaultRate(payload);
    assert.equal(r.pct, HOME.rateDefaultPct);
    assert.equal(r.label, "offline_sentinel");
    // No publisher date, because nothing was fetched — so the hint cannot
    // pretend to a reference month it never had.
    assert.equal(r.refPeriod, null);
  }
});

test("mortgageDefaultRate never returns the APRC as the payment rate", () => {
  // The annuity formula needs the interest rate; the APRC includes fees and
  // would overstate every monthly payment shown.
  const r = mortgageDefaultRate({
    new_business: { value_pct: 2.43, aprc: { value_pct: 2.77 } },
  });
  assert.equal(r.pct, 2.43);
});

test("mortgageAprc returns the fee-inclusive figure with its provenance, or null", () => {
  const a = mortgageAprc({
    new_business: {
      value_pct: 2.43,
      aprc: { value_pct: 2.77, ref_period: "2026-05", source_url: "https://data.ecb.europa.eu/x" },
    },
  });
  assert.deepEqual(a, { pct: 2.77, refPeriod: "2026-05", url: "https://data.ecb.europa.eu/x" });
  // Null (not 0, not undefined) so the caller can omit the line entirely.
  assert.equal(mortgageAprc(null), null);
  assert.equal(mortgageAprc({ new_business: { value_pct: 2.43 } }), null);
  assert.equal(mortgageAprc({ new_business: { aprc: { value_pct: null } } }), null);
});

// ---------------------------------------------------------------------------
// BNB lending limits (data.js#mortgageLendingLimits)
// ---------------------------------------------------------------------------

test("mortgageLendingLimits reads the published regulatory caps", () => {
  const l = mortgageLendingLimits({
    lending_limits: {
      min_down_payment_pct: 15,
      dsti_max_pct: 50,
      maturity_max_years: 30,
      prudent_dsti_pct: 30,
      observed_weighted_avg_dsti_pct: 38.5,
      source_url: "https://bnb.bg/x",
    },
  });
  assert.equal(l.minDownPaymentPct, 15);
  assert.equal(l.maturityMaxYears, 30);
  assert.equal(l.observedDstiPct, 38.5);
});

test("mortgageLendingLimits falls back to the BNB values in force, not to zero", () => {
  // These are legal limits on every BG mortgage. Falling back to 0% down or
  // an unbounded term would let the calculator promise an illegal loan.
  const l = mortgageLendingLimits(null);
  assert.equal(l.minDownPaymentPct, 15);
  assert.equal(l.dstiMaxPct, 50);
  assert.equal(l.maturityMaxYears, 30);
  assert.equal(l.prudentDstiPct, 30);
  assert.equal(l.observedDstiPct, null);
});

test("our prudent DSTI line stays stricter than the regulator's ceiling", () => {
  const l = mortgageLendingLimits(read("mortgage"));
  assert.ok(l.prudentDstiPct < l.dstiMaxPct, `${l.prudentDstiPct} !< ${l.dstiMaxPct}`);
});

// ---------------------------------------------------------------------------
// The shipped payloads
// ---------------------------------------------------------------------------

test("every payload the SPA loads exists in data/published", () => {
  for (const name of PAYLOAD_STEMS) {
    assert.ok(existsSync(join(PUBLISHED, `${name}.json`)), `${name}.json is missing`);
  }
});

test("an unreadable payload fails the suite instead of emptying it", () => {
  // Several suites open a payload behind a guard clause — `if (!headline)
  // return;` — so whatever the reader answers for a file it cannot use decides
  // whether the assertions below that line run at all. A reader that answers
  // `null` to both "not there" and "not JSON" turns a corrupt payload into a
  // green run of a suite that asserted nothing, and the suites that open
  // payloads are the ones checking that no page has frozen a live figure into
  // its prose. So the two answers have to stay distinguishable, and this is
  // what notices when they stop being.
  const dir = mkdtempSync(join(tmpdir(), "vyarno-payload-"));
  try {
    assert.equal(published("absent", dir), null, "a file that is not there is not a failure");

    writeFileSync(join(dir, "corrupt.json"), "{ not json");
    assert.throws(
      () => published("corrupt", dir),
      SyntaxError,
      "a payload that will not parse must reach the suite as a failure"
    );

    writeFileSync(join(dir, "fine.json"), JSON.stringify({ as_of: "2026-01-01" }));
    assert.deepEqual(published("fine", dir), { as_of: "2026-01-01" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every published payload carries a provenance envelope", () => {
  for (const name of PAYLOAD_STEMS) {
    const p = read(name);
    if (!p) continue;
    assert.ok(p.schema_version, `${name}: no schema_version`);
    assert.match(p.as_of, /^\d{4}-\d{2}-\d{2}$/, `${name}: bad as_of`);
    assert.ok(String(p.source_url).startsWith("https://"), `${name}: source_url not https`);
  }
});

test("the SPA's own math lands near the published headline (basket-sum sanity)", () => {
  // The exact identity is gated at publish time
  // (validate.py#validate_chain_reconciliation, ±0.02 pp). This runs the
  // SPA's Σ(w·r) through `officialInflation`/`rateFor` — the exact code path
  // the browser takes — so a change in the SPA's own weighting or anchor
  // lookup is caught, not just a change in the data.
  //
  // The band is 0.5 pp, matching validate.BASKET_SUM_TOLERANCE_PP, because
  // Σ(w·r) is NOT an identity: HICP chain-links at December, so a 12-month
  // window re-weights mid-flight and the two land ~0.16 pp apart on correct
  // BG data. See docs/math.md §"Two reconciliations".
  // Both sides must describe the same month, and after Eurostat's flash they
  // do not: the all-items rate arrives about two weeks before the divisions,
  // so the committed pair holds July's headline against June's basket and the
  // band reads the release itself as a 1.26 pp break. There is no all-items
  // rate at the divisions' month to compare against — Eurostat has not
  // published one — so the comparison has no inputs rather than a looser
  // answer, and the band stays where it is. `latest_index.time` is what says
  // which month the payload's index half describes, and the pipeline's
  // published-contract suite reconciles the two payloads through it meanwhile.
  const headPayload = read("hicp_headline");
  const cats = read("hicp_categories")?.categories;
  const head = headPayload?.headline_rate_pct;
  if (!cats || head == null) return;
  if (headPayload.latest_index?.time !== headPayload.ref_period) {
    assert.match(
      headPayload.notes ?? "",
      /FLASH/,
      `hicp_headline.json is dated ${headPayload.ref_period} with its index at ` +
        `${headPayload.latest_index?.time} and nothing saying why — that is a stale ` +
        `pair, not a flash, and Σ(w·r) has no headline to reconcile against`
    );
    return;
  }
  const spa = officialInflation(cats, "y1");
  assert.ok(
    Math.abs(spa - head) <= 0.5,
    `SPA official inflation ${spa.toFixed(4)}% vs published headline ${head}% — ` +
      `gap ${Math.abs(spa - head).toFixed(4)} pp exceeds the 0.5 pp basket-sum band`
  );
});

test("the published basket is ECOICOP ver.2 — 13 divisions, each with groups", () => {
  // The SPA renders one row per published division and one sub-row per group,
  // so a payload that fell back to the archived ver.1 12-division shape would
  // silently drop CP13 (personal care and other services, 4.4% of BG's basket
  // and its second-fastest riser) off the page, and nothing else would
  // notice.
  const payload = read("hicp_categories");
  if (!payload) return;
  assert.equal(payload.classification?.version, "ECOICOP ver.2");
  assert.equal(payload.classification?.weights_dataset, "prc_hicp_iw");
  const codes = payload.categories.map((c) => c.cp_code);
  assert.deepEqual(
    codes,
    Array.from({ length: 13 }, (_, i) => `CP${String(i + 1).padStart(2, "0")}`)
  );
  for (const c of payload.categories) {
    assert.ok(c.groups?.length > 0, `${c.cp_code}: no groups to drill into`);
    assert.ok(c.eurostat_label, `${c.cp_code}: no upstream label to verify against`);
  }
});

test("published categories are on ONE base, and it is the base the verify link resolves to", () => {
  // docs/math.md §"Invariants that must never break" #1. `latest_index` and
  // `index_by_year` are divided by each other, so they have to share a base;
  // scaling one and not the other inflates every "since 2020" number by the
  // scale factor and no 12-month rate on the page looks wrong.
  //
  // The base is Eurostat's, and `api_url_index` has to resolve to the unit it
  // belongs to. That pairing is what turns the link into a check: a reader who
  // opens it reads the published number back. A payload whose values were
  // scaled would still link to a real Eurostat page, showing different digits.
  const UNIT_BASE = { I15: 2015, I25: 2025 };
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  for (const c of cats) {
    const unit = /[?&]unit=([A-Z0-9_]+)/.exec(c.api_url_index)?.[1];
    assert.equal(
      c.index_base_year,
      UNIT_BASE[unit],
      `${c.cp_code}: published base ${c.index_base_year} is not unit ${unit}'s base`
    );
    assert.equal(c.unit, `index_${c.index_base_year}=100`, `${c.cp_code}: unit is ${c.unit}`);
    // NOT "latest ≥ 2020": a category can genuinely deflate (CP08 phone &
    // internet has). What must hold is that both readings sit on one base, and
    // an HICP index on any of Eurostat's bases lands inside this band.
    assert.ok(
      c.latest_index.value > 50 && c.latest_index.value < 400,
      `${c.cp_code}: latest_index ${c.latest_index.value} is off the published base`
    );
  }
  // A rescaled series gives itself away: dividing through by an anchor makes
  // EVERY category read exactly 100 at that anchor. Eurostat's own values do
  // that for at most one category, by coincidence.
  const at100 = cats.filter((c) => Math.abs(c.index_by_year["2020"] - 100) < 1e-9);
  assert.ok(
    at100.length <= 1,
    `${at100.length} categories read exactly 100 at 2020 — the series has been rebased`
  );
  // The basket-wide cumulative has to land in a sane band for BG since 2020.
  // A base mismatch shows up here as a number in the hundreds of percent.
  const cum = officialCumulativeSince2020(cats);
  assert.ok(cum > 10 && cum < 120, `cumulative since 2020 = ${cum.toFixed(2)}% is implausible`);
});

test("PRESETS.official (first-paint sentinel) tracks the published weights", () => {
  const cats = read("hicp_categories")?.categories;
  if (!cats) return;
  assert.equal(PRESETS.official.length, cats.length);
  const drift = PRESETS.official
    .map((w, i) => [i, w, cats[i].weight_pct])
    .filter(([, w, q]) => Math.abs(w - q) > 3);
  assert.deepEqual(drift, [], "PRESETS.official has drifted >3 pp from the published basket");
});

test("payroll.json and the mirror.js offline sentinel agree", () => {
  // mirror.js's BG_PAYROLL_DEFAULT is what the SPA computes with before
  // payroll.json resolves. If the two disagree, the numbers change under the
  // user mid-paint. The pipeline asserts the same parity from its side.
  const payroll = read("payroll");
  if (!payroll) return;
  const live = payrollParams(payroll);
  // 1e-9, not exact equality: payroll.json rounds the contribution total to
  // 6 dp while mirror.js sums the five float line items. Same number, and a
  // real drift (a rate change) is orders of magnitude larger than this.
  const same = (a, b, what) =>
    assert.ok(Math.abs(a - b) < 1e-9, `${what}: payroll.json ${a} vs mirror.js ${b}`);
  same(live.totalEmployeeRate, BG_PAYROLL_DEFAULT.totalEmployeeRate, "employee rate");
  same(live.incomeTaxRate, BG_PAYROLL_DEFAULT.incomeTaxRate, "income tax");
  same(live.maxInsurable, BG_PAYROLL_DEFAULT.maxInsurable, "max insurable");
  same(live.minWageGross, BG_PAYROLL_DEFAULT.minWageGross, "min wage");
});

test("the published salary ladder ranks the Sofia average earner mid-upper, not top 1%", () => {
  // Regression guard for the unit mismatch (annual household income compared
  // against a monthly net salary) that put almost every Sofia salary at the
  // 99th percentile. Runs the real files through the real SPA path — which now
  // means BOTH files: the Eurostat shape and НСИ's monthly series, joined here
  // rather than in the pipeline.
  const dist = read("salary_dist");
  const sofia = read("sofia_salary");
  const payroll = read("payroll");
  if (!dist || !sofia) return;
  const params = payrollParams(payroll);
  const anchor = sofiaQuarter(sofia);
  assert.ok(anchor.value > 0, "the НСИ series yielded no complete quarter to anchor on");
  const ladder = buildLadder(dist, anchor.value, params);
  assert.equal(ladder.length, 11);
  assert.ok(
    ladder.every((v, i, a) => i === 0 || v > a[i - 1]),
    "ladder must increase"
  );
  const sofiaNet = bgNetSalary(anchor.value, params).net;
  const rank = percentile(sofiaNet, ladder);
  assert.ok(rank > 45 && rank < 85, `Sofia average earner ranked ${rank}, expected mid-upper`);
});

test("the composed ladder never prints a sub-minimum-wage rung", () => {
  // **The floor belongs after re-levelling, in the browser, and the assertion
  // belongs on the composed rung.** Applying it in the pipeline and asserting
  // on the published P1 checks a figure at Eurostat's own level, which is not
  // a Bulgarian wage and cannot be compared to a Bulgarian minimum.
  const dist = read("salary_dist");
  const sofia = read("sofia_salary");
  const payroll = read("payroll");
  if (!dist || !sofia) return;
  const params = payrollParams(payroll);
  const gross = composeLadder(dist, sofiaQuarter(sofia).value, params);
  assert.ok(
    gross.P1 >= params.minWageGross - 0.01,
    `composed P1 = ${gross.P1} gross is below the statutory minimum wage ${params.minWageGross}`
  );
});

test("no НСИ payload carries a second publisher's figures", () => {
  // Scoped to НСИ on purpose, because "one publisher per file" is a stronger
  // rule than the licences make. mortgage.json declares `source: "ecb+bnb"` and
  // carries both publishers' figures deliberately — the ЕЦБ's new-business rate
  // and БНБ's outstanding-stock rate share a payload so the cross-check between
  // them travels with them, and neither publisher forbids it.
  //
  // НСИ do. §2.1.1 of their licence closes with «Нямате право да
  // разпространявате производни и сборни произведения», so a file mixing their
  // figures with anyone else's is the one composition that is contractually
  // barred. The loop below states the general rule that holds for all nine:
  // whatever a payload declares as its source is what it may carry.
  for (const name of PAYLOAD_STEMS) {
    const p = read(name);
    if (!p) continue;
    const declared = String(p.source).split("+");
    assert.ok(
      declared.length >= 1 && declared.every(Boolean),
      `${name}.json declares source="${p.source}", which names no publisher`
    );
    if (declared.includes("nsi")) {
      assert.deepEqual(
        declared,
        ["nsi"],
        `${name}.json declares НСИ alongside ${declared.filter((d) => d !== "nsi")} — ` +
          "their licence forbids distributing a composite, and this file is one."
      );
    }
  }

  // salary_dist.json is Eurostat's shape and sofia_salary.json is НСИ's monthly
  // series; the two meet in the reader's browser. If an `anchor` block or an
  // НСИ URL reappears in salary_dist.json the property is gone, and it would go
  // silently — no number on screen would move.
  const dist = read("salary_dist");
  if (!dist) return;
  assert.equal(dist.source, "eurostat");
  assert.equal(dist.shape?.source, "eurostat");
  assert.ok(!("anchor" in dist), "salary_dist.json carries an НСИ anchor block again");
  assert.ok(
    !("ladder_gross" in dist),
    "salary_dist.json publishes a re-levelled ladder again — that is the composite"
  );
  assert.ok(
    !JSON.stringify(dist).includes("nsi.bg"),
    "salary_dist.json links an НСИ dataset, so it is carrying their data again"
  );

  // And the other half: sofia_salary.json must publish only what НСИ published.
  // `value` is their latest published quarter, verbatim, and view.js#sofiaQuarter
  // selects it rather than deriving anything from the series beside it.
  const sofia = read("sofia_salary");
  if (!sofia) return;
  assert.equal(
    sofia.value,
    sofia.series_by_period?.[sofia.ref_period],
    "sofia_salary.json's headline is not one of the months НСИ published — it " +
      "has become a derived figure again"
  );

  // The same property, activity by activity. Twenty rows means twenty places a
  // derived headline could hide, and none of them would look wrong on screen.
  const sectors = read("sector_salary");
  if (!sectors) return;
  for (const s of sectors.sectors ?? []) {
    assert.equal(
      s.value_eur,
      s.series_by_period?.[sectors.ref_period],
      `sector_salary.json's headline for ${s.en_name} is not the quarter НСИ published`
    );
  }
});

test("sector_salary.json carries no rank, because nobody publishes one", () => {
  // Nobody publishes a pay distribution by economic activity for Bulgaria —
  // Eurostat's earn_ses_monthly carries no NACE section for BG at all — only
  // broad groupings, the finest lumping section J with seven others (probed
  // 2026-08-06, docs/data-sources.md).
  // So a percentile, decile or median in this payload could only have been
  // invented, and it would read exactly like a sourced figure.
  const sectors = read("sector_salary");
  if (!sectors) return;

  const banned = /(percentile|decile|median|p\d{1,2}|rank|spread|quartile)/i;
  for (const s of sectors.sectors ?? []) {
    const offending = Object.keys(s).filter((k) => banned.test(k));
    assert.deepEqual(
      offending,
      [],
      `sector_salary.json's ${s.en_name} row carries ${offending} — there is no ` +
        `published distribution by activity for BG behind any such field`
    );
  }
  // And every row states both of НСИ's own labels: a missing one renders the
  // picker option as a blank line rather than falling back to the other
  // language, which would put an English section name in a Bulgarian list.
  for (const s of sectors.sectors ?? []) {
    assert.ok(s.bg_name && s.en_name, `${s.en_name || s.bg_name} is missing a label`);
  }
});

test("the offline sentinels in content.js still match what the pipeline publishes", () => {
  // These are the numbers the user sees before the JSON resolves. They drift
  // silently, so they are checked against the live payloads with a band wide
  // enough to survive a routine refresh but tight enough to catch neglect.
  const mortgage = read("mortgage");
  const sofia = read("sofia_salary");
  const price = read("sofia_price");
  if (mortgage) {
    const live = mortgageDefaultRate(mortgage).pct;
    assert.ok(
      Math.abs(HOME.rateDefaultPct - live) <= 0.75,
      `HOME.rateDefaultPct ${HOME.rateDefaultPct}% vs published ${live}% — bump the sentinel`
    );
    const limits = mortgageLendingLimits(mortgage);
    assert.equal(HOME.downPaymentPct, limits.minDownPaymentPct);
    assert.equal(HOME.termMaxYears, limits.maturityMaxYears);
  }
  if (sofia) {
    // Compare like with like: both sides go through the same function, and
    // neither side is a hardcoded constant. A sentinel holding a quarterly
    // MEAN checked against a headline that is НСИ's verbatim latest MONTH is
    // comparing two different quantities, and it does it quietly — 1915
    // against 2061 is 7.1% off, inside a 10% band, so the guard passes while
    // the thing it guards has moved. **A guard that survives the change it
    // exists to catch is worse than no guard.**
    const live = sofiaQuarter(sofia).value;
    const offline = sofiaQuarter(HOME.sofiaSalaryFallback).value;
    assert.ok(offline > 0, "the offline sentinel no longer yields a complete quarter");
    assert.ok(
      Math.abs(offline - live) / live <= 0.1,
      `the offline sentinel averages ${offline} but the published series averages ` +
        `${live} — copy the newest complete quarter into HOME.sofiaSalaryFallback`
    );
  }
  if (price) {
    assert.ok(
      Math.abs(HOME.eurPerM2_offlineFallback - price.eur_per_m2_median) / price.eur_per_m2_median <=
        0.2,
      `HOME.eurPerM2_offlineFallback ${HOME.eurPerM2_offlineFallback} is >20% off the published ${price.eur_per_m2_median}`
    );
  }
});

test("loadAll fetches exactly the manifest, and returns it under the manifest's keys", async () => {
  // `loadAll` must derive its fetch list from the manifest rather than holding a
  // copy of it. A second list is how the repo ends up with two answers to "which
  // payloads?", and the one that drifts is always the one nothing renders.
  const src = readFileSync(join(HERE, "..", "src", "lib", "data.js"), "utf-8");
  const start = src.indexOf("export async function loadAll");
  assert.ok(start > 0, "data.js no longer exports loadAll");
  const body = src.slice(start, src.indexOf("\n}", start));
  assert.match(body, /PAYLOADS/, "loadAll no longer reads the manifest");
  assert.doesNotMatch(
    body,
    /fetchJson\(\s*["']/,
    "loadAll names a payload as a string literal instead of taking it from the manifest"
  );

  // …and the shape it returns is the contract the rest of the SPA reads.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    const loaded = await loadAll();
    assert.deepEqual(
      Object.keys(loaded).sort(),
      [...PAYLOAD_KEYS].sort(),
      "loadAll's result keys must be the manifest's keys — components read data.<key>"
    );
    assert.deepEqual(
      Object.values(loaded).filter((v) => v !== null),
      [],
      "a failed fetch must become null, not throw and not a partial object"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("every manifest payload feeds a figure, not just a row in the freshness panel", () => {
  // A payload fetched on every page load and read by no component costs every
  // visitor a request for nothing.
  //
  // The panel makes this easy to lose, because it renders a row for EVERY
  // payload: "is it used?" is trivially true for anything in the manifest. So
  // the search excludes the freshness plumbing and looks for a component reading
  // `data.<key>` for its own figures.
  const FRESHNESS_PLUMBING = new Set(["payloads.js", "DataPanel.svelte"]);
  const sources = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(svelte|js)$/.test(e.name) && !FRESHNESS_PLUMBING.has(e.name)) {
        sources.push(readFileSync(p, "utf-8"));
      }
    }
  };
  walk(join(HERE, "..", "src"));
  const all = sources.join("\n");

  const orphans = PAYLOAD_KEYS.filter((key) => !new RegExp(`data\\.${key}\\b`).test(all));
  assert.deepEqual(
    orphans,
    [],
    `manifest payloads no component reads: ${orphans.join(", ")}. Either wire one ` +
      "up or drop the payload — a dated row in the panel is not a consumer."
  );
});
