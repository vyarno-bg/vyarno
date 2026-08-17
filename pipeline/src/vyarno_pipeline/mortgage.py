"""Assemble and validate the BG mortgage panel published as `mortgage.json`.

Two tiers, two plainly different questions. Never blur them:

    new_business       "what a home loan costs if you sign one now"
                       ECB MIR new business, households, house purchase.
                       AAR = the interest rate the payment is computed from.
                       APRC = the same loan's all-in cost, fees included.

    outstanding_stock  "what everyone already paying off a home loan averages"
                       BNB housing-loan book (~€18 bn), all vintages.

There is deliberately **no third "best offer" tier.** The predecessor scraped
a comparison site for a "well-shopped offers from ~X%" teaser. Those are
advertised promotional from-rates, conditional on things the number never
states (salary transfer, credit card, insurance bundle), curated editorially,
with no methodology and no guarantee they are current. We now publish the
APRC instead: also "the real cost", but official, monthly, volume-weighted,
fees included, and reported by the banks themselves under regulation. That is
a strictly better answer to the same question — see `docs/data-sources.md`
§"Not available (do not cite as a working source)".

Every gate here is anti-poison: a wrong upstream number should stop the
pipeline, never reach a person deciding on a home loan.
"""

from __future__ import annotations

from datetime import date
from typing import Any

# --------------------------------------------------------------------------
# Validation bounds
# --------------------------------------------------------------------------
# A BG mortgage rate outside this range means we are reading the wrong cell,
# not that the market moved. Historical context for the width: the BG
# new-business series ranges 2.40%–3.88% since 2020, the outstanding book
# reached ~8% in 2008. Consumer-credit cells in the same BNB workbook read
# ~15%, and that is precisely the mis-read this bound catches.
RATE_MIN_PCT = 0.25
RATE_MAX_PCT = 12.0

# APRC includes fees, so it cannot sit below the interest rate it is built
# from. Small tolerance for the two series' independent rounding.
APRC_BELOW_AAR_TOLERANCE_PP = 0.05

# BNB and ECB MIR describe the SAME outstanding book — BNB is the institution
# that reports MIR to the ECB. They agreed to 0.002 pp at 2026-05. If they
# ever diverge materially, one of the two reads is wrong and we stop.
CROSS_CHECK_TOLERANCE_PP = 0.30

# Enough history for the SPA's trend line, and a guard against a truncated
# response being published as if complete.
MIN_SERIES_MONTHS = 24

# MIR is published with roughly a 6–8 week lag. Past ~150 days the panel is
# stale enough that a user could be quoted something materially different.
MAX_STALENESS_DAYS = 150


class MortgageValidationError(ValueError):
    """A gate failed. The CLI turns this into exit code 3."""


# --------------------------------------------------------------------------
# BNB borrower-based measures (lending limits) — legislative, not scraped
# --------------------------------------------------------------------------
# These are hard regulatory limits on every BG mortgage, in force since
# 2024-10-01, adopted by the BNB Governing Council on 2024-09-11 under the
# Law on Credit Institutions. Quoted verbatim from the press release:
#
#   1. loan-to-value at origination (LTV-O) "shall not exceed 85%"
#   2. the ratio between current debt service and the borrower's monthly
#      DISPOSABLE income at origination (DSTI-O) "shall not exceed 50%"
#   3. "the maximum term of the loan agreement (maturity) shall not
#      exceed 30 years"
#
# Banks get a 5%-of-prior-quarter-volume bucket to deviate.
#
# They live here as a dated table for the same reason `payroll.py` does:
# there is no machine-readable feed for them, and publishing them keeps the
# SPA's down-payment and term limits data-driven instead of magic numbers.
# To apply a change, add a NEW dated entry — never mutate an existing one.
BNB_LENDING_LIMITS = [
    {
        "effective_from": "2024-10-01",
        "ltv_max_pct": 85.0,
        "dsti_max_pct": 50.0,
        "maturity_max_years": 30,
        "deviation_allowance_pct_of_prior_quarter": 5.0,
        "dsti_income_basis": "monthly disposable (net) income of the borrower",
        "source": "bnb",
        "source_url": (
            "https://bnb.bg/AboutUs/PressOffice/POPressReleases/POPRDate/PR_20240911_1_EN"
        ),
        # What BG borrowers actually average, from the BNB's own monitoring —
        # so the SPA can say where its guidance line sits versus reality.
        "observed_weighted_avg_dsti_pct": 38.5,
        "observed_dsti_source_url": (
            "https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download/bs_mpp_overview_en.pdf"
        ),
    },
]

# The line the calculator draws. Deliberately stricter than the regulator's
# 50% ceiling and than the ~38.5% BG borrowers average: a payment a bank will
# approve is not the same as a payment that leaves room to live. The UI shows
# all three so "this is a stretch" stays visible rather than being flattered
# away.
PRUDENT_DSTI_PCT = 30.0


def lending_limits_at(as_of: date) -> dict[str, Any]:
    """The lending limits in force on `as_of` (latest effective entry)."""
    applicable = [e for e in BNB_LENDING_LIMITS if date.fromisoformat(e["effective_from"]) <= as_of]
    if not applicable:
        raise MortgageValidationError(
            f"No BNB lending-limit entry effective on {as_of.isoformat()}; "
            f"earliest is {BNB_LENDING_LIMITS[0]['effective_from']}."
        )
    entry = max(applicable, key=lambda e: e["effective_from"])
    out = dict(entry)
    # Derived so the SPA never has to do regulatory arithmetic itself.
    out["min_down_payment_pct"] = round(100.0 - entry["ltv_max_pct"], 2)
    out["prudent_dsti_pct"] = PRUDENT_DSTI_PCT
    return out


# --------------------------------------------------------------------------
# Gates
# --------------------------------------------------------------------------


def validate_rate_series(series: dict[str, float], name: str) -> None:
    """Bounds + completeness for one monthly rate series."""
    if not series:
        raise MortgageValidationError(f"{name}: series is empty")
    if len(series) < MIN_SERIES_MONTHS:
        raise MortgageValidationError(
            f"{name}: only {len(series)} months, expected at least "
            f"{MIN_SERIES_MONTHS}. Upstream response may be truncated."
        )
    for period, value in series.items():
        if not isinstance(value, (int, float)):
            raise MortgageValidationError(f"{name}: {period} is {value!r}, expected a number")
        if not (RATE_MIN_PCT <= value <= RATE_MAX_PCT):
            raise MortgageValidationError(
                f"{name}: {period} = {value}% is outside the plausible BG "
                f"mortgage range [{RATE_MIN_PCT}, {RATE_MAX_PCT}]%. "
                f"This usually means the wrong cell/series is being read "
                f"(e.g. a consumer-credit column), not a market move."
            )
    periods = list(series)
    if periods != sorted(periods):
        raise MortgageValidationError(f"{name}: periods are not sorted")


def validate_aprc_above_aar(
    aar: dict[str, float],
    aprc: dict[str, float],
) -> None:
    """APRC includes fees, so it must not sit below the AAR."""
    for period in sorted(set(aar) & set(aprc)):
        if aprc[period] < aar[period] - APRC_BELOW_AAR_TOLERANCE_PP:
            raise MortgageValidationError(
                f"APRC {aprc[period]}% is below AAR {aar[period]}% at "
                f"{period} by more than {APRC_BELOW_AAR_TOLERANCE_PP} pp. "
                f"Fees cannot be negative — the two series are probably "
                f"swapped (DATA_TYPE_MIR: R = AAR, C = APRC)."
            )


def validate_freshness(ref_period: str, as_of: date, name: str) -> None:
    """`ref_period` ("YYYY-MM") must not be older than MAX_STALENESS_DAYS."""
    year, month = (int(p) for p in ref_period.split("-"))
    # Compare against the END of the reference month.
    end = date(year + month // 12, month % 12 + 1, 1)
    age = (as_of - end).days
    if age > MAX_STALENESS_DAYS:
        raise MortgageValidationError(
            f"{name}: latest period {ref_period} is {age} days old "
            f"(limit {MAX_STALENESS_DAYS}). Upstream may have stopped "
            f"publishing — do not ship a stale mortgage rate."
        )


def cross_check_outstanding(
    bnb_pct: float,
    ecb_pct: float,
) -> dict[str, Any]:
    """BNB vs ECB MIR on the outstanding book — they must agree.

    Same underlying data reported by the same institution, so this is a
    genuine integrity check rather than a comparison of two estimates.
    """
    delta = round(abs(bnb_pct - ecb_pct), 4)
    if delta > CROSS_CHECK_TOLERANCE_PP:
        raise MortgageValidationError(
            f"Outstanding-stock cross-check failed: BNB {bnb_pct}% vs "
            f"ECB MIR {ecb_pct}% differ by {delta} pp (tolerance "
            f"{CROSS_CHECK_TOLERANCE_PP} pp). These are the same book — one "
            f"of the two reads is wrong. Re-verify the BNB housing column "
            f"and the ECB series key before publishing."
        )
    return {
        "bnb_outstanding_pct": bnb_pct,
        "ecb_mir_outstanding_pct": ecb_pct,
        "delta_pp": delta,
        "tolerance_pp": CROSS_CHECK_TOLERANCE_PP,
        "status": "ok",
        "why": (
            "BNB reports MFI Interest Rate Statistics to the ECB, so the two "
            "describe the same outstanding housing-loan book. Agreement here "
            "is evidence both cells are being read correctly."
        ),
    }


# The four fixation buckets are the whole of new housing lending, so they add
# up to the total БНБ prints beside them. The slack is rounding on five printed
# figures, not a modelling allowance — at €767m a month, 0.05 is 0.007%.
FIXATION_SUM_TOLERANCE_EUR_M = 0.05

# A BUCKET is not a market average and cannot be bounded like one. The thin ones
# hold a single month's slice — «над 10 години» has taken as little as €24,000,
# which is one loan — so its printed rate is that borrower's rate: measured,
# buckets run 1.76% to 14.82% while the month's own total never passes 9.45%.
# Hence the total keeps the headline band above and the buckets get this.
#
# **It does not separate housing from consumer credit, and nothing here claims
# it does.** The consumer block in the same workbook reads 8.7–13.4%, inside
# this range on both ends. What stops us reading that block is the header
# assertion in `sources/bnb.py`, which checks the four bucket LABELS sit where
# the housing block says they do. This bound catches a decimal point, not a
# column.
BUCKET_RATE_MAX_PCT = 16.0

# `pure new loans` and `renegotiation` partition `new business` by the ЕЦБ's own
# definition, and BG reports them to the cent: the largest disagreement over 78
# months is 0.01. Anything past this is not rounding, it is the two series
# having stopped describing one population.
SPLIT_SUM_TOLERANCE_EUR_M = 0.05


def validate_fixation_rows(rows: list[dict[str, Any]]) -> None:
    """The four buckets are all of new housing lending, and each is plausible.

    Two failures, and the first is why this gate is worth its lines. БНБ
    reordering the housing block would move money between buckets while leaving
    every total intact — the sum check cannot see that, so `bnb.py` asserts the
    labels — but a bucket dropping out of the workbook, or a column drifting
    into the consumer block beside it, breaks the sum and is caught here.
    """
    if len(rows) < MIN_SERIES_MONTHS:
        raise MortgageValidationError(
            f"BNB fixation split: only {len(rows)} months, expected at least {MIN_SERIES_MONTHS}."
        )
    for row in rows:
        total = row["total_eur_m"]
        parts = row["volume_eur_m"]
        if total is None or any(v is None for v in parts.values()):
            raise MortgageValidationError(
                f"BNB fixation split: {row['period']} has an unreadable cell — "
                f"total {total!r}, buckets {parts!r}."
            )
        summed = sum(parts.values())
        if abs(summed - total) > FIXATION_SUM_TOLERANCE_EUR_M:
            raise MortgageValidationError(
                f"BNB fixation split: {row['period']} buckets sum to {summed:.3f} m "
                f"against a printed total of {total:.3f} m, over the "
                f"{FIXATION_SUM_TOLERANCE_EUR_M} m tolerance. A bucket is missing or "
                f"a column has drifted out of the housing block."
            )
        if not (RATE_MIN_PCT <= row["total_rate_pct"] <= RATE_MAX_PCT):
            raise MortgageValidationError(
                f"BNB fixation split: {row['period']} total rate {row['total_rate_pct']}% is "
                f"outside the headline band [{RATE_MIN_PCT}, {RATE_MAX_PCT}]%."
            )
        # A bucket nobody lent into carries a rate of 0, which is not a rate.
        for bucket, volume in parts.items():
            rate = row["rate_pct"][bucket]
            if volume > 0 and not (RATE_MIN_PCT <= rate <= BUCKET_RATE_MAX_PCT):
                raise MortgageValidationError(
                    f"BNB fixation split: {row['period']} {bucket} lent {volume} m at "
                    f"{rate}%, outside [{RATE_MIN_PCT}, {BUCKET_RATE_MAX_PCT}]%."
                )


def cross_check_fixation_rates(
    bnb_rates: dict[str, float | None],
    ecb_rates: dict[str, float],
) -> None:
    """БНБ and ЕЦБ MIR on the same four buckets — the same reason as the book.

    The volumes are БНБ's alone (the euro leg publishes none), so the rates
    beside them are the only part of this block a second publisher can confirm.
    A bucket only one of them prints is skipped rather than failed: the ЕЦБ omit
    a month nobody lent in and БНБ print a zero.
    """
    for bucket, ecb_pct in ecb_rates.items():
        bnb_pct = bnb_rates.get(bucket)
        if not bnb_pct or not ecb_pct:
            continue
        if abs(bnb_pct - ecb_pct) > CROSS_CHECK_TOLERANCE_PP:
            raise MortgageValidationError(
                f"Fixation cross-check failed on {bucket}: BNB {bnb_pct}% vs ECB MIR "
                f"{ecb_pct}% differ by {abs(bnb_pct - ecb_pct):.4f} pp (tolerance "
                f"{CROSS_CHECK_TOLERANCE_PP} pp). The workbook column and the series "
                f"key have stopped describing the same bucket."
            )


def validate_new_business_split(
    total: dict[str, float],
    pure: dict[str, float],
    renegotiated: dict[str, float],
) -> None:
    """Pure new lending plus renegotiation is new business, month by month."""
    shared = sorted(set(total) & set(pure) & set(renegotiated))
    if not shared:
        raise MortgageValidationError(
            "New-business split: the three volume series share no month. "
            "The pure/renegotiated legs start at 2020-01 — check the splice."
        )
    for period in shared:
        summed = pure[period] + renegotiated[period]
        if abs(summed - total[period]) > SPLIT_SUM_TOLERANCE_EUR_M:
            raise MortgageValidationError(
                f"New-business split: {period} pure {pure[period]} + renegotiated "
                f"{renegotiated[period]} = {summed:.3f} m against new business "
                f"{total[period]} m. IR_BUS_COV P and R partition N — one of the "
                f"three keys is reading a different population."
            )


def latest_period(series: dict[str, float]) -> str:
    """Newest "YYYY-MM" key in a sorted-by-period series."""
    if not series:
        raise MortgageValidationError("cannot take latest period of an empty series")
    return max(series)
