"""Gates for `credit.json` — what a household borrows on that is not a home.

Four products and a comparator, and the reason they are one payload is that
they answer one question between them: what does credit cost, what does the
money cost that is not borrowed, and how much of each is owed. A card balance
carried past the interest-free period costs about nine times what a mortgage
costs, and neither figure means much without the other on the page.

**One band per product, never one band for the payload.** The bands below are
the whole of this module's judgement. A single range wide enough to admit both a
0.01% overnight deposit and a 21% card rate admits everything, which is a gate
that cannot fail — and the failure it exists for is exactly a series landing
under the wrong label, where the value is perfectly plausible for what it is and
wrong for where it was put.

**A euro amount needs its own band and cannot borrow a rate's.** The stock
blocks run from €0.2 bn to €18.6 bn, so one range over all of them admits every
cell in the workbook. What actually catches a wrong volume is the last gate
here: four amounts and four rates blend to a figure the ЕЦБ publish
independently, and a volume in the wrong slot moves that blend.
"""

from __future__ import annotations

import itertools
from datetime import date
from typing import Any

from vyarno_pipeline.mortgage import (
    CROSS_CHECK_TOLERANCE_PP,
    MortgageValidationError,
    validate_freshness,
)

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


# Measured over the full published history of each block (2007-01 → 2026-06),
# then given room above. Consumer has run €1.9–11.3 bn, housing €1.8–18.6 bn,
# «Други кредити» €0.17–0.61 bn, overdraft €0.4–1.0 bn and the card balance
# carried past the interest-free period €0.17–0.48 bn.
#
# **The two large blocks overlap because over nineteen years they have occupied
# the same range**, and a band tight enough to separate today's €11.3 bn from
# today's €18.6 bn would have tripped somewhere in 2015. What no band here
# admits is another block's ORDER OF MAGNITUDE: «Други кредити» read into the
# consumer slot is forty times too small, and that is the swap this catches.
#
# It does not catch a maturity bucket read as its block's total, and nothing
# here pretends to — `bnb.py` asserts the block's own column carries a blank
# maturity label, which is the gate for that. This one catches a decimal point
# and a transposed block.
STOCK_BANDS: dict[str, tuple[float, float]] = {
    "consumer": (1_000.0, 30_000.0),
    "housing": (1_000.0, 60_000.0),
    "other": (50.0, 2_000.0),
    "overdraft": (50.0, 3_000.0),
    "card_outside_grace": (50.0, 2_000.0),
}

# The first month every stock block is published at. The loan workbook starts
# here; the overdraft one reaches back to 2000 and is cut to match, because a
# total assembled from four series over four windows is four different questions
# added together.
STOCK_SERIES_START = "2007-01"


def validate_stock_series(series: dict[str, float], product: str) -> None:
    """Bounds and completeness for one product's outstanding euro amounts."""
    low, high = STOCK_BANDS[product]
    if len(series) < MIN_MONTHS:
        raise MortgageValidationError(
            f"{product} stock: only {len(series)} months, expected at least {MIN_MONTHS}."
        )
    for period, value in series.items():
        if not isinstance(value, (int, float)) or not (low <= value <= high):
            raise MortgageValidationError(
                f"{product} stock: {period} = {value!r} m EUR, outside "
                f"[{low}, {high}] m. That band is this block's own — an amount "
                f"plausible in itself but outside it means a column from a "
                f"different block landed here."
            )
    if list(series) != sorted(series):
        raise MortgageValidationError(f"{product} stock: periods are not sorted")


def validate_card_nesting(row: dict[str, Any]) -> None:
    """The three revolving amounts are nested, and adding them triple-counts.

    БНБ print «в т.ч. кредитни карти» inside «Овърдрафт», and «в т.ч. извън
    безлихвен гратисен период» inside that. Every one of the three is a
    believable card balance on its own, so the containment is the only thing
    that says which is which — and it is the difference between «българските
    домакинства дължат €371 млн. по карти» and a figure almost twice it.
    """
    overdraft = row["overdraft_eur_m"]
    card = row["card_eur_m"]
    outside = row["card_outside_grace_eur_m"]
    if None in (overdraft, card, outside):
        raise MortgageValidationError(
            f"Overdraft/card stock at {row['period']}: an unreadable cell — "
            f"overdraft {overdraft!r}, cards {card!r}, outside the grace period "
            f"{outside!r}. БНБ write «nc» where they did not compute one."
        )
    if not (outside <= card <= overdraft):
        raise MortgageValidationError(
            f"Overdraft/card stock at {row['period']}: expected "
            f"outside-grace ({outside}) <= cards ({card}) <= overdraft "
            f"({overdraft}) m EUR. БНБ nest these three «в т.ч.», so this "
            f"ordering is what identifies them — read flat they would be added "
            f"up instead of contained."
        )


def cross_check_stock_rate(bnb_pct: float, ecb_pct: float, what: str) -> dict[str, Any]:
    """One БНБ cell against the ЕЦБ MIR series it is, or reproduces.

    The same instrument as `mortgage.cross_check_outstanding` and the same
    tolerance, for the same reason: БНБ report MIR to the ЕЦБ, so agreement is
    evidence both sides are being read correctly rather than two estimates
    landing near each other. Measured over the euro era the three checks this
    serves came in at 0.014 pp (the card balance past the grace period against
    A2Z3), 0.021 pp (the overdraft block less its card sub-block against A2Z1)
    and 0.049 pp (all four blocks blended against A20) — every one of them
    inside a sixth of the tolerance.

    **The overdraft one is a subtraction and that is why it is worth a gate.**
    ЕЦБ A2Z1 excludes card credit and БНБ's «Овърдрафт» includes it, so the
    figure the page prints is the block minus its own sub-block. Nothing about
    €205 m at 6.46% looks wrong; what proves the subtraction happened is that
    the rate it leaves behind is the one the ЕЦБ publish.
    """
    delta = round(abs(bnb_pct - ecb_pct), 4)
    if delta > CROSS_CHECK_TOLERANCE_PP:
        raise MortgageValidationError(
            f"{what}: БНБ {bnb_pct}% vs ЕЦБ MIR {ecb_pct}% differ by {delta} pp "
            f"(tolerance {CROSS_CHECK_TOLERANCE_PP} pp). These describe the same "
            f"balances — one of the two reads is wrong. Re-verify the workbook "
            f"column and the series key before publishing the amount beside it."
        )
    return {"bnb_pct": bnb_pct, "ecb_mir_pct": ecb_pct, "delta_pp": delta}


def blended_stock_rate(blocks: dict[str, dict[str, float]]) -> float:
    """The rate on every household loan, weighted by what is owed on each."""
    total = sum(b["volume_eur_m"] for b in blocks.values())
    if not total:
        raise MortgageValidationError("Household stock: the four blocks sum to nothing.")
    return sum(b["volume_eur_m"] * b["rate_pct"] for b in blocks.values()) / total


# A ratio, so the band is only there to catch a unit change — the ЕЦБ switching
# I3632 to a fraction would put 0.0237 where 2.37 belongs, and «0,02% от
# кредитите не се обслужват» is a sentence a reader would believe. Measured
# 2020-Q1 → 2026-Q1 the three scopes have run 2.3% to 10.7%.
NPL_BAND_PCT = (0.1, 50.0)

# CBD2 is quarterly and lands about five months after the quarter it describes,
# so the window has to survive a whole gap between releases: at 2026-08-17 the
# freshest quarter is 2026-Q1, already 139 days old, and 2026-Q2 is not due for
# months. The 150-day MIR window would fail this series on the day it was
# correct. Two quarters plus the lag is what that comes to.
NPL_MAX_STALENESS_DAYS = 300


def validate_npl_scopes(scopes: dict[str, dict[str, float]]) -> None:
    """The NPL ratios are ratios, and companies default more than households.

    **The ordering is the gate worth having, and it is the page's whole claim.**
    A portfolio-wide ratio in a headline is read as the household one, and the
    reason that is wrong is that corporate lending sits above it — 4.74% against
    households' 2.37% at 2026-Q1, and higher in every one of the 25 quarters
    CBD2 publishes. Swap the two counterparty codes and both figures stay
    entirely plausible while the page says the opposite of the truth; nothing
    else here would notice.

    **What is NOT asserted: that households sit below the whole-portfolio
    figure.** They do at 2026-Q1 and they did not before 2024 — households ran
    above the all-counterparty ratio in sixteen of these quarters, because that
    denominator carries balances with central banks that default on nothing. So
    no gate claims it and no copy may either.
    """
    low, high = NPL_BAND_PCT
    for scope, series in scopes.items():
        if not series:
            raise MortgageValidationError(f"NPL {scope}: series is empty")
        for period, value in series.items():
            if not isinstance(value, (int, float)) or not (low <= value <= high):
                raise MortgageValidationError(
                    f"NPL {scope}: {period} = {value!r}%, outside [{low}, {high}]%. "
                    f"CBD2 publishes I3632 as a percentage — a value this far out "
                    f"means the unit changed, not the market."
                )
        if list(series) != sorted(series):
            raise MortgageValidationError(f"NPL {scope}: periods are not sorted")

    households, corporations = scopes["households"], scopes["corporations"]
    for period in sorted(set(households) & set(corporations)):
        if corporations[period] <= households[period]:
            raise MortgageValidationError(
                f"NPL at {period}: companies {corporations[period]}% against "
                f"households {households[period]}%. Corporate lending has run above "
                f"household lending in every quarter CBD2 publishes — check "
                f"BS_COUNT_SECTOR on both keys (S1M households, S11 corporations)."
            )


def validate_npl_freshness(ref_period: str, as_of: date) -> None:
    """`ref_period` ("YYYY-Qn") must not be older than NPL_MAX_STALENESS_DAYS."""
    year, quarter = ref_period.split("-Q")
    end_month = int(quarter) * 3
    end = date(int(year) + end_month // 12, end_month % 12 + 1, 1)
    age = (as_of - end).days
    if age > NPL_MAX_STALENESS_DAYS:
        raise MortgageValidationError(
            f"ECB CBD2 NPL: latest quarter {ref_period} is {age} days old "
            f"(limit {NPL_MAX_STALENESS_DAYS}). Two release cycles have passed "
            f"without one landing — do not ship a stale arrears figure."
        )


# What households have and what they owe, both from ECB BSI, both in millions
# of euro. One band over the pair rather than one each: these two grow into each
# other's range by construction — the whole subject is the gap closing — so a
# band tight enough to tell them apart would be a band that trips the month it
# gets interesting. What this catches is a unit change or a column from another
# balance-sheet item, which is three orders of magnitude away, not five percent.
#
# A swap of the two needs no band at all: `_parse_sdmx_series` refuses any
# response whose decoded key is not the one requested, so neither series can
# arrive under the other's name.
SAVINGS_BAND_EUR_M = (1_000.0, 500_000.0)

# Both BSI series start here and neither publishes a month before it.
SAVINGS_MIN_MONTHS = 36


def validate_savings_series(series: dict[str, float], name: str) -> None:
    """Bounds, length and an unbroken run of months for one BSI level series.

    **The contiguity check is the one that matters, and it is not tidiness.**
    The chart places its points at even intervals across the box
    (`plot.js#plotX`), so a month missing from the middle does not leave a gap —
    it silently shortens the axis and slides every later reading a step to the
    left, against a time axis that goes on labelling the years it thinks it has.
    Nothing about the picture looks wrong afterwards.
    """
    low, high = SAVINGS_BAND_EUR_M
    if len(series) < SAVINGS_MIN_MONTHS:
        raise MortgageValidationError(
            f"{name}: only {len(series)} months, expected at least {SAVINGS_MIN_MONTHS}."
        )
    for period, value in series.items():
        if not isinstance(value, (int, float)) or not (low <= value <= high):
            raise MortgageValidationError(
                f"{name}: {period} = {value!r} m EUR, outside [{low}, {high}] m. "
                f"That is a unit change or a different balance-sheet item, not a "
                f"move in the market."
            )
    periods = list(series)
    if periods != sorted(periods):
        raise MortgageValidationError(f"{name}: periods are not sorted")
    for earlier, later in itertools.pairwise(periods):
        year, month = int(earlier[:4]), int(earlier[5:7])
        expected = f"{year + month // 12}-{month % 12 + 1:02d}"
        if later != expected:
            raise MortgageValidationError(
                f"{name}: {earlier} is followed by {later}, expected {expected}. "
                f"A month missing from the middle shortens the chart's axis "
                f"instead of leaving a hole in its line."
            )


def validate_savings_window(deposits: dict[str, float], loans: dict[str, float]) -> None:
    """The two lines cover exactly the same months, or they are not comparable.

    A chart whose lines run over different windows is two questions on one
    picture, and the ratio drawn from them is a figure for no date at all. The
    loan series reaches back to 2007 on БНБ's workbooks and the deposit series
    does not exist before 2022 anywhere, so the temptation this refuses is to
    draw the longer one further back than the shorter.
    """
    if set(deposits) != set(loans):
        only_deposits = sorted(set(deposits) - set(loans))
        only_loans = sorted(set(loans) - set(deposits))
        raise MortgageValidationError(
            f"Savings against debt: the two series cover different months — "
            f"{len(only_deposits)} only in deposits ({only_deposits[:3]}), "
            f"{len(only_loans)} only in loans ({only_loans[:3]}). Cut both to "
            f"the overlap or publish neither."
        )


# BSI counts S.14+S.15 and БНБ's consumer and housing blocks count S.14 alone,
# so BSI sits above БНБ by the NPISH lending in between: 2.2% at 2026-06, 6.1%
# at 2022-01, above it in all 54 months. The ceiling is a wide multiple of that
# rather than a fit to it, because the gap is a real quantity that moves and
# only its SIGN is structural.
STOCK_AGREEMENT_MAX_PCT = 12.0


def cross_check_household_stock(bsi_eur_m: float, bnb_eur_m: float, period: str) -> dict[str, Any]:
    """ECB BSI's household loan stock against БНБ's own total for the same month.

    Two publishers over one country's banks, so they have to describe the same
    book to within the sector difference — and that difference has a direction.
    BSI below БНБ would mean the S.14+S.15 series had come in under an S.14 one,
    which is arithmetically impossible and therefore a read error somewhere.
    """
    if bnb_eur_m <= 0:
        raise MortgageValidationError(
            f"Household stock cross-check at {period}: БНБ total is {bnb_eur_m!r} m EUR."
        )
    delta_pct = round(100 * (bsi_eur_m / bnb_eur_m - 1), 3)
    if not (0 < delta_pct <= STOCK_AGREEMENT_MAX_PCT):
        raise MortgageValidationError(
            f"Household stock cross-check at {period}: ЕЦБ BSI €{bsi_eur_m} m vs "
            f"БНБ €{bnb_eur_m} m is {delta_pct:+}%, outside (0, "
            f"{STOCK_AGREEMENT_MAX_PCT}]%. BSI counts S.14+S.15 and БНБ's "
            f"consumer and housing blocks count S.14, so BSI is above БНБ by the "
            f"NPISH lending and by nothing else. Below it, or far above it, means "
            f"one of the two reads is wrong."
        )
    return {"ecb_bsi_eur_m": bsi_eur_m, "bnb_eur_m": bnb_eur_m, "delta_pct": delta_pct}


def savings_ratio(deposits_eur_m: float, loans_eur_m: float) -> float:
    """Euro held per euro owed. Ours, from two published levels (P3)."""
    if loans_eur_m <= 0:
        raise MortgageValidationError(
            f"Savings ratio: loans are {loans_eur_m!r} m EUR, nothing to divide by."
        )
    return deposits_eur_m / loans_eur_m


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
