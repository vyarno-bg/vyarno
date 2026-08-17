"""Gates for `credit.json` — what a household borrows on that is not a home.

Four products and a comparator, and the reason they are one payload is that
they answer one question between them: what does credit cost, and what does the
money cost that is not borrowed. A card balance carried past the interest-free
period costs about nine times what a mortgage costs, and neither figure means
much without the other on the page.

**One band per product, never one band for the payload.** The bands below are
the whole of this module's judgement. A single range wide enough to admit both a
0.01% overnight deposit and a 21% card rate admits everything, which is a gate
that cannot fail — and the failure it exists for is exactly a series landing
under the wrong label, where the value is perfectly plausible for what it is and
wrong for where it was put.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from vyarno_pipeline.mortgage import MortgageValidationError, validate_freshness

# Measured over the full published history of each series (2007-01 → 2026-06 on
# the euro leg), then given room on both sides. Consumer credit has run
# 8.7–13.4%, cards 19.6–22.4%, overdrafts 5.9–9.0%, term deposits 0.1–6.5% and
# overnight deposits have sat at 0.01% for years.
#
# The bands overlap deliberately where the products do — an overdraft and a
# consumer loan are not far apart — because a band tighter than the market is a
# gate that trips on a real move. What no two of them admit is each other's
# extremes, which is the swap this catches.
PRODUCT_BANDS: dict[str, tuple[float, float]] = {
    "consumer": (2.0, 20.0),
    "overdraft": (2.0, 20.0),
    "card": (8.0, 40.0),
    "deposit_overnight": (0.0, 8.0),
    "deposit_term": (0.0, 10.0),
}

# Deposits are published from euro adoption and no earlier, and it is a gap in
# the source rather than a choice: `M.BG.B.L22.A.R.A.2250.BGN.N` is a 404 — BG
# reported term deposits on the BGN leg by maturity bucket only, never at the
# total this compares. The overnight series does splice, but a page putting two
# deposit products side by side has to draw them over one window or the
# comparison is between two different periods.
MIN_MONTHS = 6


def validate_product_series(series: dict[str, float], product: str) -> None:
    """Bounds and completeness for one product's rate series."""
    low, high = PRODUCT_BANDS[product]
    if len(series) < MIN_MONTHS:
        raise MortgageValidationError(
            f"{product}: only {len(series)} months, expected at least {MIN_MONTHS}."
        )
    for period, value in series.items():
        if not isinstance(value, (int, float)) or not (low <= value <= high):
            raise MortgageValidationError(
                f"{product}: {period} = {value!r}%, outside [{low}, {high}]%. "
                f"That band is this product's own — a value plausible in itself "
                f"but outside it means the series landed under the wrong label."
            )
    if list(series) != sorted(series):
        raise MortgageValidationError(f"{product}: periods are not sorted")


def validate_card_above_mortgage(card_pct: float, mortgage_pct: float) -> None:
    """Card credit costs more than a secured home loan. Always, everywhere.

    Not a claim about the market — a claim about which series is which. An
    unsecured revolving balance priced below a mortgage would mean the two keys
    had been swapped, and both figures would still look like rates.
    """
    if card_pct <= mortgage_pct:
        raise MortgageValidationError(
            f"Extended card credit reads {card_pct}% against a mortgage's {mortgage_pct}%. "
            f"Unsecured revolving credit is not cheaper than a secured home loan — "
            f"check BS_ITEM on both keys (A2Z3 card, A2C house purchase)."
        )


def validate_credit_freshness(ref_period: str, as_of: date) -> None:
    """The same 150-day window `mortgage.py` holds MIR to, for the same reason."""
    validate_freshness(ref_period, as_of, "ECB MIR consumer credit")


def product_block(
    role: str,
    series: dict[str, float],
    dataset: str,
    source_url: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One product's published block, with the latest reading pulled out."""
    ref = max(series)
    return {
        "_role": role,
        "source": "ecb",
        "dataset": dataset,
        "source_url": source_url,
        "ref_period": ref,
        "value_pct": series[ref],
        "series_by_period": series,
        **(extra or {}),
    }
