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
    product_block,
    validate_card_above_mortgage,
    validate_credit_freshness,
    validate_product_series,
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


def test_the_published_payload_carries_five_products_and_no_invented_volume():
    payload = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    for key in PRODUCT_BANDS:
        assert payload[key]["value_pct"] is not None, key
        assert payload[key]["source_url"].startswith("https://")
        assert payload[key]["_role"], f"{key} must say what question it answers"
    # A price with no quantity has to say it is one (P11): BG reports neither a
    # volume nor an APRC for card credit, and the payload must not imply either.
    assert "no_volume" in payload["card"]
    assert "monthly_volume_eur_m" not in payload["card"]
    assert "aprc_pct" not in payload["card"]
    assert payload["card"]["value_pct"] > payload["consumer"]["value_pct"]
    assert payload["deposit_term"]["value_pct"] < payload["consumer"]["value_pct"]
