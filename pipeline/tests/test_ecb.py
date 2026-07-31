"""Tests for the ECB MIR connector (the BG mortgage new-business tier).

Every fixture is a **recorded upstream response** — real SDMX-JSON from the
ЕЦБ for a fully-specified series key. No synthesised payloads on the happy
path: the point of these tests is that we still parse what the ЕЦБ actually
sends.

The heart of this file is the response-identity suite. Dimension filters
passed as query parameters are silently ignored by that API, which returns all
7,742 MIR series; a parser taking the first one then publishes an Austrian
corporate-loan rate as Bulgaria's mortgage rate. Three tests below
(`test_rejects_multi_series_response`,
`test_rejects_series_that_is_not_the_one_requested`,
`test_the_exact_bug_shape_is_rejected`) exist solely to keep that impossible.
"""

import json
from itertools import pairwise
from pathlib import Path

import httpx
import pytest
import respx

from vyarno_pipeline.sources.ecb import (
    BASE,
    EURO_SWITCH_PERIOD,
    SERIES_KEY_DIMS,
    SERIES_KEYS,
    fetch_mir_series,
    parse_mir_series,
    series_url,
    splice_at_euro_changeover,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


AAR_EUR = "ecb_mir_bg_new_business_aar_eur.json"
AAR_BGN = "ecb_mir_bg_new_business_aar_bgn.json"
APRC_EUR = "ecb_mir_bg_new_business_aprc_eur.json"
APRC_BGN = "ecb_mir_bg_new_business_aprc_bgn.json"
OUTSTANDING_EUR = "ecb_mir_bg_outstanding_aar_eur.json"


# ---------------------------------------------------------------------------
# Series keys — the contract with the ECB cube
# ---------------------------------------------------------------------------


def test_new_business_uses_a2c_not_a22():
    """BG reports new business under A2C; A22 is outstanding-only for BG.

    `BS_ITEM=A22 & IR_BUS_COV=N` has never existed for Bulgaria — the key
    404s.
    """
    for key in (
        "new_business_aar_eur",
        "new_business_aar_bgn",
        "new_business_aprc_eur",
        "new_business_aprc_bgn",
    ):
        parts = SERIES_KEYS[key].split(".")
        assert parts[3] == "A2C", f"{key} must use BS_ITEM=A2C, got {parts[3]}"
        assert parts[9] == "N", f"{key} must be new business (IR_BUS_COV=N)"

    # The outstanding series is the mirror image: A22, coverage O.
    out = SERIES_KEYS["outstanding_aar_eur"].split(".")
    assert out[3] == "A22" and out[9] == "O"


def test_every_series_key_is_bg_households_and_fully_specified():
    """All 10 dimensions present, BG, households — no wildcards.

    A wildcard would reopen the door to a multi-series response.
    """
    for name, key in SERIES_KEYS.items():
        parts = key.split(".")
        assert len(parts) == len(SERIES_KEY_DIMS), (
            f"{name}: expected {len(SERIES_KEY_DIMS)} dimensions, got {len(parts)}"
        )
        assert all(p != "" for p in parts), f"{name}: has a wildcard slot"
        assert parts[0] == "M", f"{name}: must be monthly"
        assert parts[1] == "BG", f"{name}: must be Bulgaria"
        assert parts[7] == "2250", f"{name}: must be households + NPISH"


def test_aar_and_aprc_differ_only_in_data_type():
    """R = annualised agreed rate, C = APRC. Swapping them is a real risk."""
    aar = SERIES_KEYS["new_business_aar_eur"].split(".")
    aprc = SERIES_KEYS["new_business_aprc_eur"].split(".")
    assert aar[5] == "R" and aprc[5] == "C"
    assert [p for i, p in enumerate(aar) if i != 5] == [p for i, p in enumerate(aprc) if i != 5]


def test_series_url_filters_in_the_path_not_the_query_string():
    """The structural fix: the key goes in the URL path.

    A wrong key then 404s instead of returning the whole cube, which is
    exactly what the old query-parameter approach did.
    """
    url = series_url(SERIES_KEYS["new_business_aar_eur"])
    assert url.startswith(f"{BASE}/MIR/M.BG.B.A2C.A.R.A.2250.EUR.N")
    # The dimension names must NOT appear as query parameters.
    query = url.split("?", 1)[1]
    for dim in SERIES_KEY_DIMS:
        assert f"{dim}=" not in query, (
            f"{dim} passed as a query parameter — the ECB ignores those, "
            f"which is how Austria's corporate rate shipped as BG's."
        )


# ---------------------------------------------------------------------------
# Parsing recorded responses
# ---------------------------------------------------------------------------


def test_parses_recorded_new_business_aar():
    """The headline series, verbatim from the recorded response."""
    series = parse_mir_series(load(AAR_EUR), expect_key=SERIES_KEYS["new_business_aar_eur"])
    assert series["2026-05"] == 2.43
    assert series["2026-01"] == 2.46
    assert list(series) == sorted(series), "periods must come out sorted"
    assert all(isinstance(v, float) for v in series.values())


def test_parses_recorded_aprc_and_it_sits_above_the_aar():
    """APRC includes fees, so it must exceed the interest rate."""
    aar = parse_mir_series(load(AAR_EUR))
    aprc = parse_mir_series(load(APRC_EUR))
    assert aprc["2026-05"] == 2.77
    assert aprc["2026-05"] > aar["2026-05"]


def test_recorded_outstanding_series_matches_bnb():
    """ECB's outstanding figure agrees with BNB's housing book (~2.67%).

    They are the same data — BNB reports MIR to the ECB — so this is the
    number `mortgage.py#cross_check_outstanding` gates against.
    """
    series = parse_mir_series(load(OUTSTANDING_EUR))
    assert series["2026-05"] == pytest.approx(2.67, abs=0.01)


def test_omits_unpublished_months_rather_than_zero_filling():
    """A null observation must be dropped, never turned into 0.0.

    A 0% mortgage rate would sail through as a suspiciously good deal.
    """
    payload = load(AAR_EUR)
    series_obj = next(iter(payload["dataSets"][0]["series"].values()))
    observations = series_obj["observations"]
    victim = sorted(observations)[0]
    observations[victim] = [None]

    parsed = parse_mir_series(payload)
    assert 0.0 not in parsed.values()
    assert len(parsed) == len(observations) - 1


# ---------------------------------------------------------------------------
# Response identity: the filter applied, and to the series we asked for
# ---------------------------------------------------------------------------


def test_rejects_multi_series_response():
    """More than one series means the filter didn't apply. Refuse to guess."""
    payload = load(AAR_EUR)
    only = next(iter(payload["dataSets"][0]["series"].values()))
    payload["dataSets"][0]["series"] = {
        "0:0:0:0:0:0:0:0:0:0": only,
        "0:1:0:0:0:0:0:0:0:0": only,
    }
    with pytest.raises(ValueError, match="expected exactly 1 series"):
        parse_mir_series(payload)


def test_rejects_series_that_is_not_the_one_requested():
    """Asking for BG and being handed anything else must raise."""
    payload = load(AAR_EUR)
    with pytest.raises(ValueError, match="different series than requested"):
        parse_mir_series(payload, expect_key="M.AT.B.A20.A.R.A.2240.EUR.O")


def test_the_exact_bug_shape_is_rejected():
    """Reproduce the original failure and assert we now refuse it.

    Old behaviour: unfiltered response → 7,742 series → take the first →
    publish Austria's corporate-loan rate as Bulgaria's mortgage rate.
    """
    payload = load(AAR_EUR)
    dims = payload["structure"]["dimensions"]["series"]
    ref_area = next(d for d in dims if d["id"] == "REF_AREA")
    ref_area["values"] = [{"id": "AT", "name": "Austria"}, *ref_area["values"]]
    only = next(iter(payload["dataSets"][0]["series"].values()))
    # First series is now Austria at index 0 — precisely the old pick.
    payload["dataSets"][0]["series"] = {"0:0:0:0:0:0:0:0:0:0": only}

    with pytest.raises(ValueError, match="different series than requested"):
        parse_mir_series(payload, expect_key=SERIES_KEYS["new_business_aar_eur"])


def test_rejects_reordered_dimensions():
    """A reordered key layout would shift every value one slot. Fail loud."""
    payload = load(AAR_EUR)
    dims = payload["structure"]["dimensions"]["series"]
    dims[1], dims[3] = dims[3], dims[1]
    with pytest.raises(ValueError, match="series dimension order changed"):
        parse_mir_series(payload)


def test_rejects_missing_time_dimension():
    payload = load(AAR_EUR)
    payload["structure"]["dimensions"]["observation"][0]["id"] = "SOMETHING_ELSE"
    with pytest.raises(ValueError, match="TIME_PERIOD"):
        parse_mir_series(payload)


def test_rejects_empty_payload():
    with pytest.raises(ValueError, match="no `structure` block"):
        parse_mir_series({})


# ---------------------------------------------------------------------------
# The BGN → EUR splice at eurozone entry
# ---------------------------------------------------------------------------


def test_splice_takes_bgn_before_and_eur_from_the_changeover():
    spliced = splice_at_euro_changeover(
        {"2025-11": 1.0, "2025-12": 2.0, "2026-01": 999.0},
        {"2025-12": 888.0, "2026-01": 3.0, "2026-02": 4.0},
    )
    assert spliced == {
        "2025-11": 1.0,
        "2025-12": 2.0,
        "2026-01": 3.0,
        "2026-02": 4.0,
    }
    assert 999.0 not in spliced.values(), "BGN must not survive past the switch"
    assert 888.0 not in spliced.values(), "EUR must not be used before the switch"


def test_splice_of_recorded_series_is_continuous():
    """The real splice must not introduce a step — that's our evidence.

    BG's pre-2026 EUR lending was a ~36 m/month niche, so a jump here would
    mean we spliced the wrong pair of series.
    """
    spliced = splice_at_euro_changeover(
        parse_mir_series(load(AAR_BGN)), parse_mir_series(load(AAR_EUR))
    )
    assert spliced["2025-12"] == 2.48  # last BGN month
    assert spliced["2026-01"] == 2.46  # first EUR month
    step = abs(spliced["2026-01"] - spliced["2025-12"])
    assert step < 0.25, f"splice introduced a {step:.2f} pp step"


def test_splice_covers_every_month_with_no_gap():
    spliced = splice_at_euro_changeover(
        parse_mir_series(load(AAR_BGN)), parse_mir_series(load(AAR_EUR))
    )
    periods = list(spliced)
    assert periods[0] == "2020-01"
    assert EURO_SWITCH_PERIOD in spliced
    for earlier, later in pairwise(periods):
        y1, m1 = (int(x) for x in earlier.split("-"))
        y2, m2 = (int(x) for x in later.split("-"))
        assert (y2 - y1) * 12 + (m2 - m1) == 1, f"gap between {earlier} and {later}"


def test_aprc_splice_is_also_continuous():
    spliced = splice_at_euro_changeover(
        parse_mir_series(load(APRC_BGN)), parse_mir_series(load(APRC_EUR))
    )
    assert spliced["2025-12"] == 2.90
    assert spliced["2026-01"] == 2.74


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------


@respx.mock
def test_fetch_requests_the_key_in_the_path_and_parses():
    key = SERIES_KEYS["new_business_aar_eur"]
    route = respx.get(url__startswith=f"{BASE}/MIR/{key}").mock(
        return_value=httpx.Response(200, json=load(AAR_EUR))
    )
    series = fetch_mir_series(key)
    assert route.called
    assert series["2026-05"] == 2.43


@respx.mock
def test_fetch_raises_on_404_so_a_dead_key_cannot_pass_silently():
    key = SERIES_KEYS["new_business_aar_eur"]
    respx.get(url__startswith=f"{BASE}/MIR/{key}").mock(
        return_value=httpx.Response(404, text="Not found")
    )
    with pytest.raises(httpx.HTTPStatusError):
        fetch_mir_series(key)


@respx.mock
def test_fetch_raises_on_network_failure():
    key = SERIES_KEYS["new_business_aar_eur"]
    respx.get(url__startswith=f"{BASE}/MIR/{key}").mock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(httpx.ConnectError):
        fetch_mir_series(key)
