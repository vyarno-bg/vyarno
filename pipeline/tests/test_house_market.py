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
    CubeFetch,
    _cube_to_rows,
    fetch_house_price_index_real_bg,
    fetch_house_sales_count_bg,
    fetch_house_sales_value_bg,
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

# **The dataset codes are written out here, never imported from the module under
# test.** Every route this file registers and every fixture it labels is keyed
# by one of them, so importing the constants would make the whole file agree
# with whatever `sources/eurostat.py` currently says — including the two sales
# codes exchanged, which differ by one letter and would invert `avg_deal_eur`
# end to end while the derivation still reproduced from whatever was in the two
# blocks. `hsnq` counts dwellings and `hsvq` is what was paid for them.
COUNT_DATASET = "prc_hpi_hsnq"
VALUE_DATASET = "prc_hpi_hsvq"
INDEX_DATASET = "prc_hpi_q"
REAL_INDEX_DATASET = "tipsho30"
TENURE_DATASET = "ilc_lvho02"
CENSUS_DWELLINGS_DATASET = "cens_21dwob_r3"
HOUSING_OVERBURDEN_DATASET = "ilc_lvho07a"

STRUCTURE_FIXTURES = {
    TENURE_DATASET: "eurostat_tenure_bg.json",
    CENSUS_DWELLINGS_DATASET: "eurostat_census_dwellings_bg.json",
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
        _fetch("eurostat_house_sales_count_bg.json", COUNT_DATASET),
        _fetch("eurostat_house_sales_value_bg.json", VALUE_DATASET),
        _fetch("eurostat_house_price_index_bg.json", INDEX_DATASET),
        _fetch("eurostat_house_price_real_bg.json", REAL_INDEX_DATASET),
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
    respx.get(f"{EUROSTAT_BASE}/{COUNT_DATASET}").mock(return_value=httpx.Response(200, json=empty))
    with pytest.raises(ValueError, match="expected at least"):
        fetch_house_sales_count_bg(geo="BG")


def _cube_of_quarters(n: int, unit: str = "NR") -> dict:
    """A sales cube carrying `n` quarters, for the checks that need a full window.

    The committed fixtures are trimmed to three quarters so the diff stays
    readable, and the connectors refuse a response with too few periods —
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
            "unit": {"category": {"index": {unit: 0}}},
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
    respx.get(f"{EUROSTAT_BASE}/{COUNT_DATASET}").mock(
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
def test_the_count_and_the_value_come_from_the_cubes_that_hold_them():
    """`hsnq` counts dwellings, `hsvq` is what was paid, and one letter separates them.

    Exchanged at the source, nothing downstream can tell: both connectors still
    fetch a cube that answers, the transform still pairs them on their shared
    quarters, and the gate's derivation check still reproduces — value over
    count is precisely what it recomputes, whichever name points at which cube.
    What inverts is the one figure on the page: an average deal of €58,000
    becomes €0.000017. So each connector's code is pinned to the unit that
    identifies it — a number of dwellings against euro — rather than to the
    module's own constants, which would agree with the exchange.
    """
    respx.get(f"{EUROSTAT_BASE}/{COUNT_DATASET}").mock(
        return_value=httpx.Response(200, json=_cube_of_quarters(45, unit="NR"))
    )
    respx.get(f"{EUROSTAT_BASE}/{VALUE_DATASET}").mock(
        return_value=httpx.Response(200, json=_cube_of_quarters(45, unit="EUR"))
    )

    count = fetch_house_sales_count_bg(geo="BG")
    assert count.dataset == COUNT_DATASET
    assert f"/{COUNT_DATASET}?" in count.api_url
    assert "unit=NR" in count.api_url, "the deal count is not being asked for as a number"

    value = fetch_house_sales_value_bg(geo="BG")
    assert value.dataset == VALUE_DATASET
    assert f"/{VALUE_DATASET}?" in value.api_url
    assert "unit=EUR" in value.api_url, "what households paid is not being asked for in euro"


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
    assert set(block["derived_from"]) == {VALUE_DATASET, COUNT_DATASET}
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


def test_a_headline_average_that_is_not_the_dated_quarter_is_refused(market):
    """The block's headline against the cell the block's own `ref_period` names.

    The reproduction check above walks `series_by_period` and never opens
    `latest`, so the headline is the one figure in this file the derivation
    cannot vouch for: it stays inside the band, the series under it still
    reproduces from both cubes, and `ref_period` goes on naming a quarter the
    headline no longer carries.

    **The fixture is round-tripped through JSON first, because that is the form
    this can go wrong in.** `transform.py` hands `latest` the same dict object
    as the series' newest entry, so in memory the two cannot disagree and the
    mutation below would move both. Serialising splits them into the two
    independent objects the published file carries — which is what the file
    keeps, what a hand-edit touches one of, and what
    `test_published_contracts.py` re-reads.
    """
    market = json.loads(json.dumps(market))
    market["avg_deal_eur"]["latest"]["total"] *= 1.2
    with pytest.raises(ValidationError, match="must BE the cell the payload dates"):
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


# --- the deflated index, and the publisher's own flags ----------------------


def test_the_deflated_index_is_published_beside_the_nominal_one(market):
    """The one comparison this site exists to make, applied to property.

    Nominally the index sits far above its 2008 peak; deflated it does not, and
    a page that draws twenty-one years of prices in the money of the day and
    cannot show the other line has left out the correction it was built for.

    Both come back on the SAME base and the same quarters, which is what lets
    them be drawn on one axis with nothing rescaled in the browser.
    """
    real = market["price_index_real"]
    nominal = market["price_index"]
    assert real["dataset"] == REAL_INDEX_DATASET
    assert real["base_year"] == nominal["base_year"]
    assert set(real["series_by_period"]) <= set(nominal["series_by_period"])
    # A flat map of period → level. `tipsho30` has no purchase dimension, so a
    # split here would be one we invented.
    for period, value in real["series_by_period"].items():
        assert isinstance(value, float), f"{period} is {value!r}, not a bare level"
    assert real["api_url"] != nominal["api_url"]
    assert "deflat" in real["note"].lower()


def test_eurostat_flags_travel_with_the_points_they_are_on(market):
    """A break, an estimate and a provisional reading are the publisher's words.

    Twenty-one years drawn as one unbroken line crosses two breaks Eurostat
    declared and seventeen quarters they call estimates. The page cannot decline
    to draw that unless the payload carries it, and a flag at a quarter the
    series does not hold would mark nothing.
    """
    for key in ("price_index", "price_index_real"):
        block = market[key]
        flags = block["status_by_period"]
        assert flags, f"{key} carries no flags at all — the cube publishes them"
        assert set(flags) <= set(block["series_by_period"]), (
            f"{key} flags a quarter its own series does not carry"
        )
    # The nominal block is split by purchase type and its flags are too, so a
    # renderer marking the total does not have to guess which field a letter is
    # about.
    nominal = market["price_index"]["status_by_period"]
    assert all(isinstance(v, dict) for v in nominal.values())
    assert any("total" in v for v in nominal.values())
    # The deflated block has no split, so its flags are bare letters.
    assert all(isinstance(v, str) for v in market["price_index_real"]["status_by_period"].values())


def test_an_index_on_the_wrong_base_is_refused(market):
    """`I15_Q` and `I25_Q` are one series on two bases and both answer 200.

    The base year is definitional: its four quarters average to 100 by
    construction. Anything else means the cube we read is not the cube we named
    — and the wrong one still draws a perfectly plausible line, three times
    flatter and with today at 109 instead of 273.
    """
    validate_house_market(market)  # the real payload passes

    rebased = json.loads(json.dumps(market))
    base = rebased["price_index"]["base_year"]
    for period in list(rebased["price_index"]["series_by_period"]):
        if period.startswith(f"{base}-Q"):
            for field in rebased["price_index"]["series_by_period"][period]:
                rebased["price_index"]["series_by_period"][period][field] *= 0.4
    with pytest.raises(ValidationError, match="different base"):
        validate_house_market(rebased)


def test_a_flag_outside_eurostats_own_vocabulary_is_refused(market):
    """A marker a reader cannot look up is worse than no marker."""
    tampered = json.loads(json.dumps(market))
    period = next(iter(tampered["price_index_real"]["status_by_period"]))
    tampered["price_index_real"]["status_by_period"][period] = "X"
    with pytest.raises(ValidationError, match="not one of Eurostat"):
        validate_house_market(tampered)

    orphan = json.loads(json.dumps(market))
    orphan["price_index_real"]["status_by_period"]["1999-Q1"] = "b"
    with pytest.raises(ValidationError, match="does not carry"):
        validate_house_market(orphan)


@respx.mock
def test_the_deflated_cube_refuses_a_filter_that_matches_nothing():
    """Same failure mode as every other cube here: a wrong unit answers 200."""
    empty = _cube("eurostat_house_price_real_bg.json") | {"value": {}}
    respx.get(f"{EUROSTAT_BASE}/{REAL_INDEX_DATASET}").mock(
        return_value=httpx.Response(200, json=empty)
    )
    with pytest.raises(ValueError, match="expected at least"):
        fetch_house_price_index_real_bg(geo="BG")
