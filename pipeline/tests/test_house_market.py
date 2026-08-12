"""The property-market connectors, transform and gates.

Offline, against trimmed real cubes. The fixtures are the live 2026-Q1
responses cut down to three quarters with every dimension left intact, so a
reshape upstream shows up here as a parse failure rather than as a fixture
nobody recognises.

What each test is for, since none of them is checking a number for its own
sake:

- the connectors, that a filter which matches nothing fails loudly. Eurostat
  answer an unknown unit or a misspelled purchase code with 200 OK and an
  empty `value` map, so every wrong query in this module succeeds.
- the transform, that a quarter reaches the payload only when BOTH cubes carry
  it. The value cube starts two years earlier than the count cube.
- the gates, that the one derived figure on the page reproduces from the two
  published figures beside it, and that the two purchase codes have not been
  swapped.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from vyarno_pipeline.sources.eurostat import (
    CENSUS_DWELLINGS_DATASET,
    HOUSE_PRICE_INDEX_DATASET,
    HOUSE_SALES_COUNT_DATASET,
    HOUSE_SALES_VALUE_DATASET,
    HOUSING_OVERBURDEN_DATASET,
    PRICE_TO_INCOME_DATASET,
    TENURE_DATASET,
    CubeFetch,
    _cube_to_rows,
    fetch_house_sales_count_bg,
    fetch_housing_structure_bg,
)
from vyarno_pipeline.transform import (
    build_house_market_payload,
    build_house_market_structure_payload,
)
from vyarno_pipeline.validate import (
    ValidationError,
    validate_house_market,
    validate_house_market_structure,
)

EUROSTAT_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
FIXTURES = Path(__file__).parent / "fixtures"

STRUCTURE_FIXTURES = {
    TENURE_DATASET: "eurostat_tenure_bg.json",
    CENSUS_DWELLINGS_DATASET: "eurostat_census_dwellings_bg.json",
    PRICE_TO_INCOME_DATASET: "eurostat_price_to_income_bg.json",
    HOUSING_OVERBURDEN_DATASET: "eurostat_housing_overburden_bg.json",
}


def _cube(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _fetch(name: str, dataset: str) -> CubeFetch:
    """A fixture as the connector would have returned it."""
    return CubeFetch(
        _cube_to_rows(_cube(name)),
        dataset,
        f"{EUROSTAT_BASE}/{dataset}?format=JSON&lang=EN&geo=BG",
        f"https://ec.europa.eu/eurostat/databrowser/view/{dataset}/default/table?lang=en",
    )


@pytest.fixture
def market() -> dict:
    return build_house_market_payload(
        _fetch("eurostat_house_sales_count_bg.json", HOUSE_SALES_COUNT_DATASET),
        _fetch("eurostat_house_sales_value_bg.json", HOUSE_SALES_VALUE_DATASET),
        _fetch("eurostat_house_price_index_bg.json", HOUSE_PRICE_INDEX_DATASET),
        date(2026, 8, 12),
    )


@pytest.fixture
def structure() -> dict:
    return build_house_market_structure_payload(
        {ds: _fetch(name, ds) for ds, name in STRUCTURE_FIXTURES.items()},
        date(2026, 8, 12),
    )


# --- the connectors --------------------------------------------------------


@respx.mock
def test_a_filter_that_matches_nothing_raises_instead_of_publishing_an_empty_series():
    """The whole failure mode of this module: a wrong filter returns 200 OK.

    `unit=NR` misspelled, `purchase=DW_EXIST` instead of `DW_EXST`, a period
    format the cube does not use — Eurostat answer all of them with a valid
    envelope and an empty `value` map. `_cube_to_rows` emits no rows for absent
    cells, which is correct and is also why nothing further down would notice:
    the payload would carry an empty series and every gate over it would pass
    vacuously.
    """
    empty = _cube("eurostat_house_sales_count_bg.json") | {"value": {}}
    respx.get(f"{EUROSTAT_BASE}/{HOUSE_SALES_COUNT_DATASET}").mock(
        return_value=httpx.Response(200, json=empty)
    )
    with pytest.raises(ValueError, match="expected at least"):
        fetch_house_sales_count_bg(geo="BG")


def _cube_of_quarters(n: int) -> dict:
    """A count cube carrying `n` quarters, for the checks that need a full window.

    The committed fixtures are trimmed to three quarters so the diff stays
    readable, and the connector refuses a response with too few periods —
    correctly, since that is what a filter matching nothing looks like. A test
    about the URL rather than about the data builds its own cube instead of
    being the reason that guard is loosened.
    """
    periods = [f"{2017 + i // 4}-Q{i % 4 + 1}" for i in range(n)]
    return {
        "id": ["freq", "unit", "geo", "time", "purchase"],
        "size": [1, 1, 1, n, 1],
        "dimension": {
            "freq": {"category": {"index": {"Q": 0}}},
            "unit": {"category": {"index": {"NR": 0}}},
            "geo": {"category": {"index": {"BG": 0}}},
            "time": {"category": {"index": {p: i for i, p in enumerate(periods)}}},
            "purchase": {"category": {"index": {"TOTAL": 0}}},
        },
        "value": {str(i): 10000 + i for i in range(n)},
    }


@respx.mock
def test_the_connector_publishes_the_query_it_actually_ran():
    """The URL and the rows come out of one call so they cannot drift.

    A reader who does not believe a figure is told to re-run the query behind
    it, so the query has to be the one that produced the figure — not a URL
    assembled separately from constants that were right when they were typed.
    """
    respx.get(f"{EUROSTAT_BASE}/{HOUSE_SALES_COUNT_DATASET}").mock(
        return_value=httpx.Response(200, json=_cube_of_quarters(37))
    )
    fetched = fetch_house_sales_count_bg(geo="BG")
    requested = str(respx.calls.last.request.url)
    assert fetched.api_url == requested, (
        "the published api_url is not the URL the connector fetched, so a "
        "reader re-running it can get a different answer from the one published"
    )
    for pinned in ("geo=BG", "unit=NR"):
        assert pinned in fetched.api_url, f"{pinned} is missing from the published query"
    # No period bound, in either direction. A window pinned in code is a date
    # somebody has to maintain against an upstream nobody controls, and the
    # series is meant to grow — backwards on a backfill as well as forwards.
    assert "TimePeriod" not in fetched.api_url, (
        "the query bounds the period. The window belongs to the cube, not to us: "
        "pinning it freezes a date in the source that nothing will update."
    )


@respx.mock
def test_every_structure_cube_is_pinned_to_one_slice_of_its_own_population():
    """Each of the four crosses several dimensions, and each has a wrong TOTAL.

    Tenure is crossed with household composition and poverty status; the census
    with building type; overburden with age, sex and poverty status. Leaving any
    of them unpinned returns hundreds of cells, and the transform would have to
    guess which one is the country — a guess that produces a plausible
    percentage every time.
    """
    for dataset, name in STRUCTURE_FIXTURES.items():
        respx.get(f"{EUROSTAT_BASE}/{dataset}").mock(
            return_value=httpx.Response(200, json=_cube(name))
        )
    fetched = fetch_housing_structure_bg(geo="BG")
    assert set(fetched) == set(STRUCTURE_FIXTURES)

    required = {
        TENURE_DATASET: ("hhcomp=TOTAL", "rskpovth=TOTAL"),
        CENSUS_DWELLINGS_DATASET: ("building=TOTAL",),
        PRICE_TO_INCOME_DATASET: ("unit=PTIR_LT_AVG",),
        HOUSING_OVERBURDEN_DATASET: ("age=TOTAL", "sex=T", "rskpovth=TOTAL"),
    }
    for dataset, pins in required.items():
        url = fetched[dataset].api_url
        for pin in pins:
            assert pin in url, f"{dataset} is not pinned to {pin} — its slice is a guess"


# --- the transform ---------------------------------------------------------


def test_a_quarter_reaches_the_average_only_when_both_cubes_carry_it(market):
    """The two cubes are published over different windows.

    The value series starts 2015-Q1 and the count series 2017-Q1, so eight
    quarters carry a value and no count. `value ÷ nothing` is not a small
    error — it is a figure with no denominator, and the way it would show up on
    the page is as an average deal for a quarter nobody counted.
    """
    deals = market["deals"]["series_by_period"]
    values = market["value"]["series_by_period"]
    avg = market["avg_deal_eur"]["series_by_period"]
    assert avg, "no quarter survived the pairing"
    for period in avg:
        assert period in deals and period in values, (
            f"{period} has an average deal but is missing from one of the two "
            f"cubes it is supposed to be computed from"
        )


def test_the_derivation_is_disclosed_with_the_queries_that_reproduce_it(market):
    """Eurostat permit derivation on condition it is stated to the end user.

    Stating it is not only a licence condition — it is the whole answer to
    somebody who thinks the number is invented. The payload names both cubes and
    publishes both queries, so the claim is checkable without trusting us.
    """
    block = market["avg_deal_eur"]
    assert block["_role"].startswith("DERIVED BY US"), "the derivation is not marked as ours"
    assert set(block["derived_from"]) == {HOUSE_SALES_VALUE_DATASET, HOUSE_SALES_COUNT_DATASET}
    assert len(block["derived_from_api_urls"]) == 2
    notes = market["notes"]
    assert "MODIFICATION NOTICE" in notes, "the envelope does not disclose the modification"
    assert "not responsible" in notes, "Eurostat's non-responsibility clause is missing"


def test_the_scope_the_page_depends_on_is_stated_in_the_payload(market):
    """The register counts every sale deed and runs more than twice as high.

    Putting these counts beside the register's without saying so reads as a
    contradiction, and it is the one mistake on this subject that would cost
    the project its credibility. The payload carries the sentence so a consumer
    that renders the figure has the qualification in hand.
    """
    assert "households" in market["disclaimer"].lower()
    assert "register" in market["disclaimer"].lower()


# --- the gates -------------------------------------------------------------


def test_the_gates_pass_on_the_published_cubes(market, structure):
    validate_house_market(market)
    validate_house_market_structure(structure)


def test_an_average_that_does_not_reproduce_is_refused(market):
    """The identity a reader could check by hand, checked before publishing.

    An average built from a different quarter's denominator is arithmetically
    fine, internally consistent, and wrong in a way no plausibility band
    catches — every figure stays the right order of magnitude.
    """
    period = market["ref_period"]
    market["avg_deal_eur"]["series_by_period"][period]["total"] *= 1.2
    with pytest.raises(ValidationError, match="does not reproduce"):
        validate_house_market(market)


def test_swapping_the_two_purchase_codes_is_refused(market):
    """`DW_NEW` and `DW_EXST` differ by one letter, and a swap stays plausible.

    Swapped at the source, counts and values move together, so the derivation
    still reproduces exactly and the band still passes. What does not survive is
    the relationship between them: a new build costs more per transaction than
    an existing dwelling in every quarter of the published series.

    The swap is applied to all three blocks for that reason. Swapping only the
    average trips the derivation check instead, which proves nothing about this
    guard — the failure being modelled is a mislabelling upstream of the
    arithmetic, where every figure still reproduces from every other.
    """
    for block in ("deals", "value", "avg_deal_eur"):
        for row in market[block]["series_by_period"].values():
            row["new"], row["existing"] = row["existing"], row["new"]
    with pytest.raises(ValidationError, match="DW_NEW and DW_EXST"):
        validate_house_market(market)


def test_an_average_outside_the_band_is_refused(market):
    """The band catches a unit error, not a market move — it is 3x wide at each end."""
    market["deals"]["series_by_period"][market["ref_period"]]["total"] = 1.0
    market["value"]["series_by_period"][market["ref_period"]]["total"] = 1.0
    market["avg_deal_eur"]["series_by_period"][market["ref_period"]] = {"total": 1.0}
    with pytest.raises(ValidationError, match="band"):
        validate_house_market(market)


def test_a_tenure_split_that_is_not_one_population_is_refused(structure):
    """Owners plus renters is the population, and a wrong slice misses by whole points."""
    structure["tenure"]["rent_pct"] = 40.0
    with pytest.raises(ValidationError, match="not the published total"):
        validate_house_market_structure(structure)


def test_a_price_to_income_reading_on_the_wrong_unit_is_refused(structure):
    """Only PTIR_LT_AVG indexes the ratio against this country's OWN long-run average.

    The page says a reading below 100 means homes cost less relative to
    Bulgarian incomes than they have on average over the series. On `PTIR_I15`
    that sentence is false — 100 would be 2015 — and the figure would still look
    like a perfectly ordinary index.
    """
    structure["price_to_income"]["unit"] = "PTIR_I15"
    with pytest.raises(ValidationError, match="PTIR_LT_AVG"):
        validate_house_market_structure(structure)
