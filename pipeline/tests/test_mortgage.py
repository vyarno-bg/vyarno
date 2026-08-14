"""Tests for the mortgage panel's gates and lending limits.

These are the anti-poison checks. A wrong upstream number must stop the
pipeline, never reach someone deciding on a home loan — so each gate is
tested against both the recorded-real values (must pass) and the specific
wrong values we know are possible (must raise).

The bounds test is calibrated on the two real historical mis-reads:
Austria's corporate outstanding rate (3.37%, in range — which is why the
identity check in `ecb.py`, not the bounds, is what catches it) and BNB's
consumer-credit column (14.83%, out of range — caught here).
"""

import json
from datetime import date
from pathlib import Path

import pytest

from vyarno_pipeline.mortgage import (
    APRC_BELOW_AAR_TOLERANCE_PP,
    BNB_LENDING_LIMITS,
    CROSS_CHECK_TOLERANCE_PP,
    MAX_STALENESS_DAYS,
    MIN_SERIES_MONTHS,
    PRUDENT_DSTI_PCT,
    RATE_MAX_PCT,
    RATE_MIN_PCT,
    MortgageValidationError,
    cross_check_outstanding,
    latest_period,
    lending_limits_at,
    validate_aprc_above_aar,
    validate_freshness,
    validate_rate_series,
)


def series(start_year: int, months: int, value: float) -> dict[str, float]:
    """A synthetic monthly series long enough to clear the length gate."""
    out = {}
    year, month = start_year, 1
    for _ in range(months):
        out[f"{year}-{month:02d}"] = value
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return dict(sorted(out.items()))


PUBLISHED = Path(__file__).resolve().parents[2] / "data" / "published" / "mortgage.json"


# ---------------------------------------------------------------------------
# Rate bounds and completeness
# ---------------------------------------------------------------------------


def test_accepts_a_plausible_series():
    validate_rate_series(series(2020, 36, 2.43), "test")


def test_rejects_the_consumer_credit_misread():
    """14.83% is the neighbouring BNB column. It must never pass as a mortgage."""
    bad = series(2020, 36, 2.43) | {"2023-01": 14.8261}
    with pytest.raises(MortgageValidationError, match="outside the plausible BG"):
        validate_rate_series(bad, "BNB outstanding")


@pytest.mark.parametrize("value", [0.0, -1.0, RATE_MAX_PCT + 0.01, 99.0])
def test_rejects_out_of_band_values(value):
    bad = series(2020, 36, 2.43) | {"2022-06": value}
    with pytest.raises(MortgageValidationError, match="outside the plausible BG"):
        validate_rate_series(bad, "test")


def test_bounds_bracket_the_real_bg_history_without_being_useless():
    """Wide enough for the real range, tight enough to catch consumer credit."""
    assert RATE_MIN_PCT < 2.40, "must admit the 2026 low"
    assert RATE_MAX_PCT > 8.0, "must admit the 2008-era outstanding peak"
    assert RATE_MAX_PCT < 14.0, "must still reject the 14.83% consumer column"


def test_rejects_a_truncated_series():
    """Two years of months, written out, either side of the floor.

    A length built as `MIN_SERIES_MONTHS - 1` is one month short of whatever
    the floor happens to be, so it agrees with a floor of three — and a reply
    carrying a quarter of the series would then publish as complete. The SPA
    draws a trend line off this, and three months cannot show a market.
    """
    assert MIN_SERIES_MONTHS == 24
    validate_rate_series(series(2024, 24, 2.43), "test")
    with pytest.raises(MortgageValidationError, match="expected at least"):
        validate_rate_series(series(2025, 23, 2.43), "test")


def test_rejects_an_empty_series():
    with pytest.raises(MortgageValidationError, match="empty"):
        validate_rate_series({}, "test")


def test_rejects_a_non_numeric_value():
    bad = series(2020, 36, 2.43) | {"2022-06": None}
    with pytest.raises(MortgageValidationError, match="expected a number"):
        validate_rate_series(bad, "test")


def test_rejects_unsorted_periods():
    ordered = series(2020, 36, 2.43)
    shuffled = {k: ordered[k] for k in reversed(list(ordered))}
    with pytest.raises(MortgageValidationError, match="not sorted"):
        validate_rate_series(shuffled, "test")


# ---------------------------------------------------------------------------
# APRC ≥ AAR
# ---------------------------------------------------------------------------


def test_accepts_aprc_above_aar():
    validate_aprc_above_aar({"2026-05": 2.43}, {"2026-05": 2.77})


def test_rejects_aprc_below_aar_because_fees_cannot_be_negative():
    with pytest.raises(MortgageValidationError, match="Fees cannot be negative"):
        validate_aprc_above_aar({"2026-05": 2.77}, {"2026-05": 2.43})


def test_tolerates_rounding_sized_inversions():
    """Two independently rounded series may cross by a hair. That's fine."""
    delta = APRC_BELOW_AAR_TOLERANCE_PP / 2
    validate_aprc_above_aar({"2026-05": 2.43}, {"2026-05": 2.43 - delta})


def test_compares_only_overlapping_periods():
    """The BGN and EUR legs end at different months; no spurious failure."""
    validate_aprc_above_aar({"2026-05": 2.43}, {"2026-04": 1.0})


# ---------------------------------------------------------------------------
# Freshness
# ---------------------------------------------------------------------------


def test_accepts_a_recent_reference_month():
    validate_freshness("2026-05", date(2026, 7, 24), "ECB MIR")


def test_rejects_a_stale_reference_month():
    with pytest.raises(MortgageValidationError, match="do not ship a stale"):
        validate_freshness("2024-01", date(2026, 7, 24), "ECB MIR")


def test_staleness_limit_accommodates_the_lag_without_admitting_a_stopped_source():
    """150 days: past MIR's 6–8 week lag, well short of two quarters.

    Both edges have to be pinned, because a floor alone is satisfied by a limit
    twice the width. Six months past the reference month, "the ЕЦБ stopped
    publishing in January" and "the panel is current" are the same payload —
    the site would go on quoting the January rate under a July `as_of`, which
    is the one failure this gate exists for.
    """
    assert MAX_STALENESS_DAYS == 150
    validate_freshness("2026-05", date(2026, 7, 24), "ECB MIR")  # 53 days: the normal lag
    with pytest.raises(MortgageValidationError, match="do not ship a stale"):
        validate_freshness("2026-01", date(2026, 7, 24), "ECB MIR")  # 173 days


def test_freshness_handles_a_december_reference_month():
    """Month arithmetic must roll the year over correctly."""
    validate_freshness("2025-12", date(2026, 1, 15), "ECB MIR")
    with pytest.raises(MortgageValidationError):
        validate_freshness("2025-12", date(2026, 12, 15), "ECB MIR")


# ---------------------------------------------------------------------------
# BNB vs ECB cross-check
# ---------------------------------------------------------------------------


def test_the_real_pair_agrees():
    result = cross_check_outstanding(bnb_pct=2.6717, ecb_pct=2.67)
    assert result["status"] == "ok"
    assert result["delta_pp"] < 0.01


def test_rejects_the_blended_workbook_value():
    """4.12% (all household loans) vs 2.67% — the gate that catches the file mix-up."""
    with pytest.raises(MortgageValidationError, match="same book"):
        cross_check_outstanding(bnb_pct=4.1209, ecb_pct=2.67)


def test_tolerance_is_tight_because_these_are_the_same_data():
    """BNB reports MIR to the ECB, so only rounding should separate them.

    An absolute, and a pair either side of it built from written-out figures.
    A ceiling of 0.5 admits 0.5 itself — two-thirds wider than the band, on the
    one gate that catches either side's outstanding-stock read drifting — and a
    pair expressed as `± CROSS_CHECK_TOLERANCE_PP / 2` agrees with whatever
    width is set. They agreed to 0.002 pp at 2026-05.
    """
    assert CROSS_CHECK_TOLERANCE_PP == 0.30
    cross_check_outstanding(bnb_pct=2.67, ecb_pct=2.92)  # 0.25 pp apart
    with pytest.raises(MortgageValidationError, match="same book"):
        cross_check_outstanding(bnb_pct=2.67, ecb_pct=3.02)  # 0.35 pp apart


# ---------------------------------------------------------------------------
# Lending limits (BNB borrower-based measures)
# ---------------------------------------------------------------------------


def test_limits_match_the_bnb_press_release():
    """Verbatim from PR_20240911_1_EN, in force 2024-10-01."""
    limits = lending_limits_at(date(2026, 7, 24))
    assert limits["ltv_max_pct"] == 85.0
    assert limits["dsti_max_pct"] == 50.0
    assert limits["maturity_max_years"] == 30
    assert limits["effective_from"] == "2024-10-01"


def test_min_down_payment_is_derived_from_the_ltv_cap():
    """15% down is the regulatory floor, not a convention we invented."""
    limits = lending_limits_at(date(2026, 7, 24))
    assert limits["min_down_payment_pct"] == 15.0
    assert limits["min_down_payment_pct"] == 100 - limits["ltv_max_pct"]


def test_dsti_is_measured_against_net_income():
    """The app's cap is a % of NET pay, so the units must match."""
    limits = lending_limits_at(date(2026, 7, 24))
    assert "net" in limits["dsti_income_basis"].lower()


def test_our_guidance_line_is_stricter_than_the_regulator_and_the_market():
    """The app must not flatter. 30% < ~38.5% observed < 50% legal ceiling.

    30 is written out because the ordering alone admits anything up to 38.5 —
    and a line set at 37 is still "stricter than the market" while being no
    line at all: it approves every payment BG borrowers already average. What
    the 30 is for is the difference between a payment a bank signs off and one
    that leaves room to live, and `AGENTS.md` lists loosening it under NEVER.
    """
    limits = lending_limits_at(date(2026, 7, 24))
    assert PRUDENT_DSTI_PCT == 30.0
    assert limits["observed_weighted_avg_dsti_pct"] > PRUDENT_DSTI_PCT, (
        "our line must be stricter than what BG borrowers actually carry"
    )
    assert limits["observed_weighted_avg_dsti_pct"] < limits["dsti_max_pct"]
    assert limits["prudent_dsti_pct"] == PRUDENT_DSTI_PCT


def test_raises_before_the_measures_took_effect():
    with pytest.raises(MortgageValidationError, match="No BNB lending-limit entry"):
        lending_limits_at(date(2024, 1, 1))


def test_limit_entries_are_dated_and_ordered():
    """Same audit-trail discipline as BG_PAYROLL_TABLE: append, never mutate."""
    dates = [e["effective_from"] for e in BNB_LENDING_LIMITS]
    assert dates == sorted(dates)
    assert len(set(dates)) == len(dates)


# ---------------------------------------------------------------------------
# The published artefact
# ---------------------------------------------------------------------------


def test_published_json_passes_every_gate_it_claims_to():
    """The committed mortgage.json must satisfy the gates that produced it."""
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    nb, os_ = payload["new_business"], payload["outstanding_stock"]

    validate_rate_series(nb["series_by_period"], "published new business")
    validate_rate_series(nb["aprc"]["series_by_period"], "published APRC")
    validate_rate_series(os_["series_by_period"], "published outstanding")
    validate_aprc_above_aar(nb["series_by_period"], nb["aprc"]["series_by_period"])
    assert payload["cross_check"]["delta_pp"] <= CROSS_CHECK_TOLERANCE_PP


def test_published_json_has_no_scraped_offer_tier():
    """There is no scraped offered-rate tier, and one must not appear."""
    raw = PUBLISHED.read_text(encoding="utf-8")
    assert "financer" not in raw.lower()
    payload = json.loads(raw)
    for dead_key in ("indicative_offer", "sector_average", "aggregate_outstanding"):
        assert dead_key not in payload, f"schema 1.0 key {dead_key} still present"


def test_published_json_names_its_headline_tier_explicitly():
    """The SPA reads `headline` rather than inferring from key order."""
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    assert payload["schema_version"] == "2.0"
    assert payload["headline"] == "new_business"
    assert payload["headline"] in payload


def test_published_headline_is_the_aar_not_the_aprc():
    """The payment is computed from the interest rate; APRC would overstate it."""
    nb = json.loads(PUBLISHED.read_text(encoding="utf-8"))["new_business"]
    assert nb["value_pct"] < nb["aprc"]["value_pct"]
    assert "annualised agreed rate" in nb["rate_basis"].lower()


def test_published_tiers_carry_provenance_and_a_role():
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    for name in ("new_business", "outstanding_stock"):
        tier = payload[name]
        assert tier["_role"], f"{name} must say what question it answers"
        assert tier["source"] in ("ecb", "bnb")
        assert tier["source_url"].startswith("https://")
        assert tier["ref_period"] and tier["value_pct"] is not None
        assert tier["methodology_change"], f"{name} must flag the 2026 euro break"


def test_published_json_flags_the_eurozone_methodology_break():
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    for name in ("new_business", "outstanding_stock"):
        note = payload[name]["methodology_change"]
        assert "2026-01-01" in note
        assert "euro" in note.lower()


def test_published_lending_limits_are_present_for_the_spa():
    limits = json.loads(PUBLISHED.read_text(encoding="utf-8"))["lending_limits"]
    assert limits["min_down_payment_pct"] == 15.0
    assert limits["maturity_max_years"] == 30
    assert limits["prudent_dsti_pct"] < limits["dsti_max_pct"]


def test_latest_period_picks_the_newest_month():
    assert latest_period({"2025-12": 1.0, "2026-05": 2.0, "2026-01": 3.0}) == "2026-05"
    with pytest.raises(MortgageValidationError):
        latest_period({})
