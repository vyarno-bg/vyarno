"""Gates for `credit.json` — the products that are not a home loan.

The bands in `credit.py` are the whole of that module's judgement, so what
these check is that each one can still fail: a band nothing trips is a gate
that is not there.
"""

import json
from datetime import date
from pathlib import Path

import pytest

from vyarno_pipeline.credit import (
    PRODUCT_BANDS,
    blended_stock_rate,
    cross_check_household_stock,
    cross_check_stock_rate,
    product_block,
    validate_business_splice,
    validate_card_above_mortgage,
    validate_card_nesting,
    validate_credit_freshness,
    validate_npl_freshness,
    validate_npl_scopes,
    validate_product_series,
    validate_savings_series,
    validate_savings_window,
    validate_stock_series,
)
from vyarno_pipeline.mortgage import MortgageValidationError

PUBLISHED = Path(__file__).resolve().parents[2] / "data" / "published" / "credit.json"


def _series(value: float, months: int = 12) -> dict[str, float]:
    return {f"2026-{m:02d}": value for m in range(1, months + 1)}


def test_each_product_has_its_own_band_and_they_do_not_admit_each_others_extremes():
    validate_product_series(_series(8.76), "consumer")
    validate_product_series(_series(21.15), "card")
    validate_product_series(_series(0.01), "deposit_overnight")
    # The swap this exists for: a card rate landing on the consumer key is a
    # plausible number in the wrong place, and only a per-product band sees it.
    with pytest.raises(MortgageValidationError, match="outside"):
        validate_product_series(_series(21.15), "consumer")
    with pytest.raises(MortgageValidationError, match="outside"):
        validate_product_series(_series(8.76), "deposit_overnight")


def test_a_truncated_response_is_not_published_as_a_short_series():
    with pytest.raises(MortgageValidationError, match="expected at least"):
        validate_product_series(_series(8.76, months=2), "consumer")


def test_a_series_that_arrived_out_of_order_is_not_published():
    # Every reader of these series takes the last key as the latest reading, so
    # an unsorted response publishes a mid-history month as today's rate — or,
    # on the stock series, a balance from years ago as what is owed now. Both
    # validators are asked, because the failure is the same one twice and a
    # second test would only be a second thing to keep in step.
    scrambled = dict(reversed(list(_series(8.76, months=8).items())))
    with pytest.raises(MortgageValidationError, match="not sorted"):
        validate_product_series(scrambled, "consumer")
    with pytest.raises(MortgageValidationError, match="not sorted"):
        validate_stock_series(dict(reversed(list(_stock(11_301.239).items()))), "consumer")


def test_the_company_rate_cannot_be_the_euro_leg_read_whole():
    """The trap this gate exists for, and no band can see it.

    Both legs of the corporate key are plausible rates over their whole length,
    so the euro one read whole publishes a subset of the market as the market
    and every value in it clears `PRODUCT_BANDS["business"]`. What separates
    them is where the record starts.
    """
    lev = {"2017-08": 3.79, "2017-09": 4.14, "2025-12": 4.09}
    euro = {"2007-01": 8.69, "2017-08": 2.05, "2026-01": 4.30}
    spliced = {"2017-08": 3.79, "2017-09": 4.14, "2025-12": 4.09, "2026-01": 4.30}
    validate_business_splice(spliced, lev, "2026-01")
    with pytest.raises(MortgageValidationError, match="DENOMINATED in euro"):
        validate_business_splice(euro, lev, "2026-01")


def test_a_month_before_the_changeover_has_to_be_the_lev_leg():
    """The other half of the same failure, one month at a time.

    A splice that starts in the right place can still take the euro leg's value
    for a month the lev leg publishes — the two run as far as 2.08 pp apart, so
    the result is a rate nothing else here would question.
    """
    lev = {"2017-08": 3.79, "2017-09": 4.14}
    mixed = {"2017-08": 3.79, "2017-09": 5.56}
    with pytest.raises(MortgageValidationError, match="the lev leg"):
        validate_business_splice(mixed, lev, "2026-01")


def test_card_credit_cannot_read_below_a_mortgage():
    validate_card_above_mortgage(21.15, 2.41)
    # Unsecured revolving credit priced under a secured home loan means the two
    # BS_ITEM codes were swapped, and both figures still look like rates.
    with pytest.raises(MortgageValidationError, match="not cheaper"):
        validate_card_above_mortgage(2.41, 21.15)


def test_freshness_uses_the_same_window_as_the_mortgage_arm():
    validate_credit_freshness("2026-06", date(2026, 8, 17))
    with pytest.raises(MortgageValidationError, match="days old"):
        validate_credit_freshness("2025-06", date(2026, 8, 17))


def test_a_product_block_pulls_the_latest_reading_out_of_its_own_series():
    block = product_block("role", {"2026-05": 1.0, "2026-06": 2.0}, "ds", "https://x")
    assert block["ref_period"] == "2026-06"
    assert block["value_pct"] == 2.0
    assert block["_role"] == "role"


def test_the_published_payload_carries_every_gated_block_and_no_invented_volume():
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    for key in PRODUCT_BANDS:
        assert payload[key]["value_pct"] is not None, key
        assert payload[key]["source_url"].startswith("https://")
        assert payload[key]["_role"], f"{key} must say what question it answers"
    # BG still reports no APRC for card credit — the ЕЦБ collect DATA_TYPE_MIR=C
    # on instalment credit only — so nothing here may imply a fees-included
    # figure the way consumer credit carries one.
    assert "no_aprc" in payload["card"]
    assert "aprc_pct" not in payload["card"]
    # The QUANTITY is a different matter and it is not invented: БНБ publish the
    # card balance carried past the interest-free period, so the figure is
    # theirs while the rate above it is the ЕЦБ's. Two publishers on one card
    # means two source lines, which is what this key exists to force.
    assert payload["card"]["stock_source"] == "bnb"
    assert payload["card"]["stock_source_url"] != payload["card"]["source_url"]
    assert payload["card"]["value_pct"] > payload["consumer"]["value_pct"]
    assert payload["deposit_term"]["value_pct"] < payload["consumer"]["value_pct"]


# ---------------------------------------------------------------------------
# The euro amounts, and what is not being repaid
# ---------------------------------------------------------------------------


def _stock(value: float, months: int = 12) -> dict[str, float]:
    return {f"2026-{m:02d}": value for m in range(1, months + 1)}


def test_a_volume_band_is_not_a_rate_band_and_each_block_has_its_own():
    validate_stock_series(_stock(11_301.239), "consumer")
    validate_stock_series(_stock(18_580.075), "housing")
    validate_stock_series(_stock(286.504), "other")
    # The swap a single range over the payload would admit: «Други кредити» at
    # €0.29 bn read into the consumer slot is forty times too small, and every
    # one of these figures is a believable household total on its own.
    with pytest.raises(MortgageValidationError, match="outside"):
        validate_stock_series(_stock(286.504), "consumer")
    with pytest.raises(MortgageValidationError, match="outside"):
        validate_stock_series(_stock(11_301.239), "other")


def test_the_three_revolving_amounts_are_nested_rather_than_summed():
    row = {
        "period": "2026-06",
        "overdraft_eur_m": 695.071,
        "card_eur_m": 490.317,
        "card_outside_grace_eur_m": 370.974,
    }
    validate_card_nesting(row)
    # Read flat, these three add to €1,556 m — more than twice what is owed.
    # The containment is the only thing that says which figure is which.
    with pytest.raises(MortgageValidationError, match="outside-grace"):
        validate_card_nesting({**row, "card_outside_grace_eur_m": 600.0})
    with pytest.raises(MortgageValidationError, match="unreadable cell"):
        validate_card_nesting({**row, "card_eur_m": None})


def test_a_bnb_cell_that_stops_reproducing_its_ecb_series_stops_the_run():
    cross = cross_check_stock_rate(21.1636, 21.15, "card")
    assert cross["delta_pp"] < 0.05
    with pytest.raises(MortgageValidationError, match="differ by"):
        cross_check_stock_rate(13.1999, 6.45, "overdraft")


def test_the_blend_is_weighted_by_what_is_owed_not_by_the_number_of_blocks():
    blocks = {
        "housing": {"volume_eur_m": 18_580.075, "rate_pct": 2.6609},
        "consumer": {"volume_eur_m": 11_301.239, "rate_pct": 6.9058},
        "other": {"volume_eur_m": 286.504, "rate_pct": 4.0255},
        "overdraft": {"volume_eur_m": 695.071, "rate_pct": 13.1999},
    }
    # The ЕЦБ publish 4.51% for the same book, independently. A plain mean of
    # the four rates is 6.70%, so this arithmetic is what the gate is checking.
    assert blended_stock_rate(blocks) == pytest.approx(4.4653, abs=0.001)
    swapped = {
        **blocks,
        "housing": {"volume_eur_m": 11_301.239, "rate_pct": 2.6609},
        "consumer": {"volume_eur_m": 18_580.075, "rate_pct": 6.9058},
    }
    # Transposing two volumes leaves four believable amounts and four
    # believable rates, and moves the blend by almost a whole point — which is
    # what makes this the gate that actually catches a wrong euro amount.
    assert abs(blended_stock_rate(swapped) - blended_stock_rate(blocks)) > 0.9


def test_companies_fall_behind_more_often_than_households_in_every_quarter():
    scopes = {
        "households": {"2025-Q4": 2.3, "2026-Q1": 2.37},
        "corporations": {"2025-Q4": 4.59, "2026-Q1": 4.74},
        "all": {"2025-Q4": 2.42, "2026-Q1": 2.55},
    }
    validate_npl_scopes(scopes)
    # Swap the two counterparty codes and both figures stay entirely plausible
    # while the page says the opposite of the truth. Nothing else would notice.
    with pytest.raises(MortgageValidationError, match="Corporate lending has run above"):
        validate_npl_scopes({**scopes, "corporations": scopes["households"]})
    # A ratio published as a fraction would read as «0,02% не се обслужват».
    with pytest.raises(MortgageValidationError, match="outside"):
        validate_npl_scopes({**scopes, "households": {"2026-Q1": 0.0237}})


def test_the_npl_window_survives_a_whole_gap_between_quarterly_releases():
    # 2026-Q1 is already 139 days old on the day it is the freshest quarter
    # published, so the 150-day MIR window would fail it while it was correct.
    validate_npl_freshness("2026-Q1", date(2026, 8, 17))
    with pytest.raises(MortgageValidationError, match="days old"):
        validate_npl_freshness("2024-Q4", date(2026, 8, 17))


def test_the_published_outstanding_block_adds_up_and_names_two_publishers():
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    block = payload["outstanding"]
    assert sum(b["volume_eur_m"] for b in block["blocks"]) == pytest.approx(
        block["total_eur_m"], abs=0.01
    )
    # The amounts are БНБ's and the rate beside them is the ЕЦБ's own, so the
    # page never prints our arithmetic as though a publisher had said it.
    assert block["source"] == "bnb"
    assert block["rate_source"] == "ecb"
    assert block["cross_check"]["delta_pp"] < 0.30
    latest = block["volume_by_period"]["total"][block["ref_period"]]
    assert latest == pytest.approx(block["total_eur_m"], abs=0.01)


def _levels(start_year: int = 2022, months: int = 54, base: float = 30_000.0) -> dict[str, float]:
    out: dict[str, float] = {}
    year, month = start_year, 1
    for i in range(months):
        out[f"{year}-{month:02d}"] = base + i
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return out


def test_a_month_missing_from_the_middle_stops_the_run():
    # The chart spaces its points evenly, so a hole does not draw as a hole —
    # it shortens the axis and slides every later reading left under year
    # labels that no longer describe it.
    series = _levels()
    validate_savings_series(series, "deposits")
    del series["2024-06"]
    with pytest.raises(MortgageValidationError, match="expected 2024-06"):
        validate_savings_series(series, "deposits")


def test_a_level_series_is_bounded_and_long_enough():
    with pytest.raises(MortgageValidationError, match="outside"):
        validate_savings_series({**_levels(), "2026-06": 56.47}, "deposits")
    with pytest.raises(MortgageValidationError, match="at least"):
        validate_savings_series(_levels(months=12), "deposits")
    with pytest.raises(MortgageValidationError, match="not sorted"):
        validate_savings_series(dict(reversed(list(_levels().items()))), "deposits")


def test_the_two_lines_may_not_cover_different_windows():
    deposits, loans = _levels(), _levels()
    validate_savings_window(deposits, loans)
    # БНБ publish the loan side from 2007 and the deposit side does not exist
    # before 2022, so running the longer line on alone is the available mistake.
    loans["2021-12"] = 14_000.0
    with pytest.raises(MortgageValidationError, match="different months"):
        validate_savings_window(deposits, loans)


def test_bsi_sits_above_bnb_by_the_npish_lending_and_never_below_it():
    ok = cross_check_household_stock(31_544.88, 30_862.889, "2026-06")
    assert ok["delta_pct"] == pytest.approx(2.21, abs=0.01)
    # S.14+S.15 cannot come in under S.14 alone, so a negative gap is a read
    # error rather than a small disagreement between two publishers.
    with pytest.raises(MortgageValidationError, match="outside"):
        cross_check_household_stock(30_000.0, 30_862.889, "2026-06")
    with pytest.raises(MortgageValidationError, match="outside"):
        cross_check_household_stock(40_000.0, 30_862.889, "2026-06")


def test_the_published_savings_block_divides_one_flow_by_itself():
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    block = payload["savings"]
    deposits, loans = block["deposits_by_period"], block["loans_by_period"]
    assert list(deposits) == list(loans)
    assert block["ratio"] == pytest.approx(block["deposits_eur_m"] / block["loans_eur_m"], abs=1e-4)
    # The ratio's denominator is BSI's own loan level and not БНБ's total in
    # `outstanding`, which counts a different sector and would put two
    # populations either side of the divide.
    assert block["loans_eur_m"] != payload["outstanding"]["total_eur_m"]
    assert block["loans_eur_m"] == pytest.approx(deposits and loans[block["ref_period"]])
    for key in ("deposits_source_url", "loans_source_url"):
        assert block[key].startswith("https://data-api.ecb.europa.eu/service/data/BSI/")
