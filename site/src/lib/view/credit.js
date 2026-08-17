/**
 * Which published field feeds which figure on `/credit/`.
 *
 * The arithmetic is in `mirror.js` and the words are in the component; what
 * lives here is the wiring, so that "the floating share is БНБ's volume in the
 * up-to-one-year bucket over the total БНБ prints beside it" is a claim a test
 * can hold rather than an expression inside a `$derived`. What is left to get
 * wrong is a share read off the wrong bucket, a rate captioned with a period
 * none of its cells describes, or the ГПР presented where the AAR belongs —
 * each of them a number that is correct under a claim that is not.
 *
 * Every function takes payloads. None takes a scalar, and that is what keeps
 * the page inputless: there is no signature here a reader's own salary could be
 * threaded into, so `/credit/` cannot quietly become a calculator.
 *
 * One of the twelve modules under `src/lib/view/`, paired with
 * `scripts/verify_view_credit.mjs`.
 */

/**
 * A figure with everything the page has to print beside it.
 *
 * Same shape as `view/market.js`'s, and deliberately a second copy rather than
 * a shared import: the two pages read different payloads and the field names
 * they pull provenance out of are the payloads' own. A shared helper would tie
 * `/credit/`'s captions to a change made for `/market/`.
 *
 * @typedef {object} SourcedFigure
 * @property {number|null} value
 * @property {string|null} refPeriod
 * @property {string|null} sourceUrl
 * @property {string|null} dataset
 * @property {string|null} method
 */

/** @returns {SourcedFigure} */
function sourced(value, block, extra = {}) {
  return {
    value: Number.isFinite(value) ? value : null,
    refPeriod: extra.refPeriod ?? block?.ref_period ?? null,
    sourceUrl: extra.sourceUrl ?? block?.source_url ?? null,
    dataset: block?.dataset ?? null,
    method: extra.method ?? null,
  };
}

/**
 * The three rates, and they answer three different questions.
 *
 * They are returned together because the mistake this page exists to prevent is
 * reading one for another: amortising the ГПР overstates the payment, and
 * quoting the outstanding book to somebody about to sign understates it. A
 * caller that wanted only one would be free to caption it as "the" rate.
 *
 * @param {object|null} mortgage
 */
export function creditRates(mortgage) {
  const nb = mortgage?.new_business ?? null;
  const aprc = nb?.aprc ?? null;
  const stock = mortgage?.outstanding_stock ?? null;
  return {
    aar: sourced(nb?.value_pct, nb),
    aprc: sourced(aprc?.value_pct, aprc, { refPeriod: aprc?.ref_period }),
    outstanding: sourced(stock?.value_pct, stock),
    bookVolumeEurM: Number.isFinite(stock?.book_volume_eur_m) ? stock.book_volume_eur_m : null,
  };
}

/**
 * How long the rate on new lending is fixed for.
 *
 * The bucket order is the payload's, not ours: БНБ print them shortest-first
 * and the page draws them that way, so a bucket appearing or moving upstream
 * arrives here rather than being silently dropped by a hardcoded list.
 *
 * `floating` is the first bucket and the page's headline. It is variable-rate
 * lending TOGETHER WITH one-year fixations — БНБ count them as one — which is
 * why nothing here is named `variable`.
 *
 * @param {object|null} mortgage
 */
export function creditFixation(mortgage) {
  const block = mortgage?.fixation ?? null;
  const buckets = Array.isArray(block?.buckets) ? block.buckets : [];
  const first = buckets[0] ?? null;
  return {
    period: block?.ref_period ?? null,
    totalEurM: Number.isFinite(block?.total_eur_m) ? block.total_eur_m : null,
    buckets: buckets.map((b) => ({
      bucket: b.bucket,
      sharePct: Number.isFinite(b.share_pct) ? b.share_pct : null,
      volumeEurM: Number.isFinite(b.volume_eur_m) ? b.volume_eur_m : null,
      ratePct: Number.isFinite(b.rate_pct) ? b.rate_pct : null,
      crossCheckUrl: b.cross_check_url ?? null,
    })),
    floating: sourced(first?.share_pct, block, {
      method:
        "БНБ's own volume in the shortest fixation bucket over the total " +
        "they print beside it, in the same row of the same workbook.",
    }),
    // One number a month, oldest first, so the page can draw the line without
    // knowing which key order the JSON happened to serialise in.
    sharesByPeriod: Object.entries(block?.floating_share_by_period ?? {})
      .map(([period, share]) => ({ period, share }))
      .sort((a, b) => a.period.localeCompare(b.period)),
  };
}

/**
 * How much of «new lending» is a household repricing a loan it already had.
 *
 * @param {object|null} mortgage
 */
export function creditRenegotiation(mortgage) {
  const block = mortgage?.new_business_split ?? null;
  return {
    share: sourced(block?.renegotiated_share_pct, block),
    pureNewEurM: Number.isFinite(block?.pure_new_eur_m) ? block.pure_new_eur_m : null,
    renegotiatedEurM: Number.isFinite(block?.renegotiated_eur_m) ? block.renegotiated_eur_m : null,
    pureNewRatePct: Number.isFinite(block?.pure_new_rate_pct) ? block.pure_new_rate_pct : null,
    renegotiatedRatePct: Number.isFinite(block?.renegotiated_rate_pct)
      ? block.renegotiated_rate_pct
      : null,
    sharesByPeriod: Object.entries(block?.renegotiated_share_by_period ?? {})
      .map(([period, share]) => ({ period, share }))
      .sort((a, b) => a.period.localeCompare(b.period)),
  };
}

/**
 * What a bank may lend, and the stricter line this site draws.
 *
 * `prudentDstiPct` is ours and the other three are БНБ's, so the page has to
 * caption them differently — which is why they arrive under separate names
 * rather than as four rows of one table.
 *
 * @param {object|null} mortgage
 */
export function creditLimits(mortgage) {
  const l = mortgage?.lending_limits ?? null;
  if (!l) return null;
  return {
    ltvMaxPct: l.ltv_max_pct ?? null,
    minDownPaymentPct: l.min_down_payment_pct ?? null,
    dstiMaxPct: l.dsti_max_pct ?? null,
    maturityMaxYears: l.maturity_max_years ?? null,
    observedDstiPct: l.observed_weighted_avg_dsti_pct ?? null,
    observedDstiPeriod: l.observed_dsti_ref_period ?? null,
    prudentDstiPct: l.prudent_dsti_pct ?? null,
    effectiveFrom: l.effective_from ?? null,
    sourceUrl: l.source_url ?? null,
    observedSourceUrl: l.observed_dsti_source_url ?? null,
  };
}

/**
 * What Bulgarian households owe, block by block, and the nineteen-year picture.
 *
 * **The amounts are БНБ's and the headline rate beside them is the ЕЦБ's**, so
 * the two arrive with separate provenance rather than sharing a caption. That is
 * not fussiness: MIR publishes no outstanding-amount volume for BG at all, so
 * mixing publishers is the only way this figure exists, and a single source line
 * over the pair would credit one of them with the other's number.
 *
 * The blocks come out in the payload's order, which the pipeline sorts largest
 * first. A list here would re-sort them in the browser and re-sort them
 * differently the month two blocks cross.
 *
 * @param {object|null} credit
 */
export function creditOutstanding(credit) {
  const block = credit?.outstanding ?? null;
  if (!block) return null;
  const byPeriod = block.volume_by_period ?? {};
  return {
    totalEurM: Number.isFinite(block.total_eur_m) ? block.total_eur_m : null,
    refPeriod: block.ref_period ?? null,
    sourceUrl: block.source_url ?? null,
    overdraftSourceUrl: block.overdraft_source_url ?? null,
    rate: sourced(block.rate_pct, block, {
      refPeriod: block.rate_ref_period,
      sourceUrl: block.rate_source_url,
    }),
    blocks: (Array.isArray(block.blocks) ? block.blocks : []).map((b) => ({
      block: b.block,
      volumeEurM: Number.isFinite(b.volume_eur_m) ? b.volume_eur_m : null,
      ratePct: Number.isFinite(b.rate_pct) ? b.rate_pct : null,
      // Each block's share of what is owed, which is the only thing on this
      // page a reader cannot read straight off a published cell — and the
      // reason the total ships beside its addends.
      sharePct:
        Number.isFinite(b.volume_eur_m) && block.total_eur_m
          ? (100 * b.volume_eur_m) / block.total_eur_m
          : null,
    })),
    // One series per block plus the total, oldest first. `stockSeries` is what
    // the chart draws and the keys are the payload's own, so a block appearing
    // upstream arrives here rather than being dropped by a list.
    series: Object.fromEntries(
      Object.keys(byPeriod).map((key) => [key, plotLevels(byPeriod[key])])
    ),
    startsAt: block.series_starts ?? null,
    methodologyChange: block.methodology_change ?? null,
  };
}

/**
 * A published `{period: value}` map, ordered and measured for a plot.
 *
 * **`min` is clamped at or below zero and there is no way to raise it**, the
 * same contract `view/market.js#plotSeries` holds and for the same reason: an
 * axis cropped to a debt series' own range turns nineteen years of ordinary
 * growth into a cliff. These are euro amounts, so zero is the floor that means
 * something — «nobody owes anything» — and a chart of what a country owes that
 * does not start there is drawing a slope rather than a level.
 *
 * A second copy rather than an import from `view/market.js`, deliberately: that
 * module's version takes a `reference` an index needs and this page has no
 * index, and tying `/credit/`'s axis to a change made for `/market/`'s is the
 * coupling the two-copies rule in this file's header is about.
 *
 * @param {Record<string, number>|null|undefined} entries
 */
function plotLevels(entries) {
  const points = Object.keys(entries ?? {})
    .sort()
    .map((period) => ({ period, value: entries[period] }))
    .filter((p) => Number.isFinite(p.value));
  const values = points.map((p) => p.value);
  return {
    points,
    min: Math.min(0, ...values),
    max: Math.max(0, ...values),
    peak: points.reduce((best, p) => (best && best.value >= p.value ? best : p), null),
    first: points[0] ?? null,
    latest: points[points.length - 1] ?? null,
    from: points[0]?.period ?? null,
    to: points[points.length - 1]?.period ?? null,
  };
}

/**
 * What households have put in the bank, against what they owe it.
 *
 * **Both levels come out of one payload block, and that is the wiring this
 * function exists to hold.** `outstanding` above carries a household loan total
 * too, from БНБ, and it is the better figure for the table it feeds — but
 * БНБ's consumer and housing blocks are sector Домакинства alone where the
 * deposit series counts the non-profit institutions with them. Dividing one by
 * the other would put two populations either side of the ratio, and the ratio
 * is the whole point of drawing the two together. So there is no signature here
 * a caller could feed `outstanding.total_eur_m` into.
 *
 * `scaleMax` is returned rather than left to the component for the same class
 * of reason: two lines on one axis need ONE scale, and a component reaching for
 * `deposits.max` would be right only while deposits are the larger of the two.
 *
 * @param {object|null} credit
 */
export function creditSavings(credit) {
  const block = credit?.savings ?? null;
  if (!block) return null;
  const deposits = plotLevels(block.deposits_by_period);
  const loans = plotLevels(block.loans_by_period);
  // Euro held per euro owed at each end of the window. Ours, from two published
  // levels of the same month (P3) — arithmetic over measurements, nothing
  // carried forward, so it is not a projection (P5).
  const ratioAt = (point, other) =>
    point && other && other.value ? point.value / other.value : null;
  return {
    refPeriod: block.ref_period ?? null,
    depositsEurM: Number.isFinite(block.deposits_eur_m) ? block.deposits_eur_m : null,
    loansEurM: Number.isFinite(block.loans_eur_m) ? block.loans_eur_m : null,
    ratio: Number.isFinite(block.ratio) ? block.ratio : null,
    depositsSourceUrl: block.deposits_source_url ?? null,
    loansSourceUrl: block.loans_source_url ?? null,
    dataset: block.dataset ?? null,
    scope: block.scope ?? null,
    ratioBasis: block.ratio_basis ?? null,
    series: { deposits, loans },
    scaleMax: Math.max(deposits.max, loans.max),
    // How far this loan level sits above БНБ's total in the table above. The
    // page has to account for the two figures differing, and a percentage typed
    // into the sentence would be a number nothing recomputes.
    crossCheckPct: Number.isFinite(block.cross_check?.delta_pct)
      ? block.cross_check.delta_pct
      : null,
    ratioFirst: ratioAt(deposits.first, loans.first),
    ratioLatest: ratioAt(deposits.latest, loans.latest),
    from: deposits.from,
    to: deposits.to,
    startsAt: block.series_starts ?? null,
  };
}

/**
 * How much household lending is not being repaid, and whose.
 *
 * **The two scopes come back together because separately the first one misleads.**
 * A portfolio-wide arrears ratio is read as the household one, and the reason it
 * is not is that corporate lending sits above it — so the page prints both or it
 * prints a number a reader will take for something else. `_role` and
 * `denominator` in the payload say whose loans over what portfolio, and this
 * carries them through rather than leaving the component to reword them.
 *
 * @param {object|null} credit
 */
export function creditArrears(credit) {
  const block = credit?.non_performing ?? null;
  if (!block) return null;
  return {
    households: Number.isFinite(block.households_pct) ? block.households_pct : null,
    corporations: Number.isFinite(block.corporations_pct) ? block.corporations_pct : null,
    allCounterparties: Number.isFinite(block.all_counterparties_pct)
      ? block.all_counterparties_pct
      : null,
    refPeriod: block.ref_period ?? null,
    sourceUrl: block.source_url ?? null,
    scopeSourceUrls: block.scope_source_urls ?? {},
    denominator: block.denominator ?? null,
    reportingPopulation: block.reporting_population ?? null,
    // Households against companies over time, oldest first. Two series and not
    // three: the whole-portfolio ratio is on the page as this quarter's contrast
    // and drawing it as a third line would invite the reading the gate refuses
    // to assert — households have run both above and below it.
    series: {
      households: plotLevels(block.households_by_period),
      corporations: plotLevels(block.corporations_by_period),
    },
  };
}

/**
 * What the same household pays on everything that is not a home — and what it
 * is paid on the money it did not borrow.
 *
 * They arrive together because separately none of them means anything. 21% on a
 * carried card balance is a number; 21% against 2.4% on a mortgage and 1.6% on
 * a deposit is a comparison, which is the strongest form this site is allowed
 * (P6). The order is the order the page draws them: dearest first, because that
 * is the one a reader is most likely not to know.
 *
 * @param {object|null} credit
 */
export function creditProducts(credit) {
  const order = ["card", "consumer", "overdraft", "deposit_term", "deposit_overnight"];
  return order
    .map((key) => {
      const block = credit?.[key] ?? null;
      if (!block) return null;
      return {
        key,
        isDeposit: key.startsWith("deposit"),
        rate: sourced(block.value_pct, block),
        aprcPct: Number.isFinite(block.aprc_pct) ? block.aprc_pct : null,
        aprcSourceUrl: block.aprc_source_url ?? null,
        monthlyVolumeEurM: Number.isFinite(block.monthly_volume_eur_m)
          ? block.monthly_volume_eur_m
          : null,
        monthlyVolumeSourceUrl: block.monthly_volume_source_url ?? null,
        // **How much is owed at that price, and it is a SECOND publisher's
        // figure wherever it exists.** MIR carries no outstanding volume for BG,
        // so every amount here is БНБ's while the rate above it is the ЕЦБ's —
        // which is why the quantity brings its own URL instead of borrowing
        // `rate.sourceUrl`. A page that credited one publisher with the other's
        // number would be wrong in the one way this page cannot afford.
        stockEurM: Number.isFinite(block.stock_eur_m) ? block.stock_eur_m : null,
        stockRatePct: Number.isFinite(block.stock_rate_pct) ? block.stock_rate_pct : null,
        stockRefPeriod: block.stock_ref_period ?? null,
        stockSourceUrl: block.stock_source_url ?? null,
        stockSource: block.stock_source ?? null,
        // On the overdraft block alone: its amount is БНБ's block LESS the card
        // sub-block, because the ЕЦБ's item draws that boundary and БНБ's does
        // not. A derived figure has to say so on the face of it.
        stockBasis: block.stock_basis ?? null,
        // Present on the card block alone. BG reports no APRC for card credit,
        // so the rate has no fees-included companion — which is a different
        // absence from the volume, and the volume is no longer one.
        noAprc: block.no_aprc ?? null,
      };
    })
    .filter(Boolean);
}
