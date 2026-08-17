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
        // Present on the card block alone, and the page prints it: a price with
        // no quantity has to say it is one.
        noVolume: block.no_volume ?? null,
      };
    })
    .filter(Boolean);
}
