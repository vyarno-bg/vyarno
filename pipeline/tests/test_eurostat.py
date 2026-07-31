"""Tests for the Eurostat HICP connector (ECOICOP ver.2).

Three cubes, all keyed by `coicop18`:
- `prc_hicp_minr` unit=RCH_A — the published annual rate of change per code.
- `prc_hicp_minr` unit=I15   — the monthly index per code.
- `prc_hicp_iw`              — the annual item weights per code.

Each is fetched with ONE unfiltered call for the whole BG slice, rather than
a fan-out per code. `_require_codes` is what makes the single call safe, and
the tests below are what keep it honest.
(Multi-value `coicop18=A+B+C` filters still return empty on these cubes; that
quirk is why we don't filter at all rather than batching.)

The fixtures are REAL trimmed Eurostat responses — see
`fixtures/make_hicp_fixtures.py`. `eurostat_hicp_inw_v1_bg.json` is the
ARCHIVED ver.1 weights cube, kept so the cross-version regression tests have
the actual input that caused the July-2026 bug.
"""

import json
from pathlib import Path

import httpx
import pytest
import respx

from vyarno_pipeline.sources.eurostat import (
    CLASSIFICATION,
    COICOP_DIM,
    CP_DIVISIONS,
    IW_DATASET,
    MINR_DATASET,
    fetch_hicp_index_bg,
    fetch_hicp_rates_bg,
    fetch_hicp_weights_bg,
    group_codes_in_basket,
)

FIXTURES = Path(__file__).parent / "fixtures"
IW = json.loads((FIXTURES / "eurostat_hicp_iw_bg.json").read_text(encoding="utf-8"))
RCH = json.loads((FIXTURES / "eurostat_hicp_rch_bg.json").read_text(encoding="utf-8"))
I15 = json.loads((FIXTURES / "eurostat_hicp_i15_bg.json").read_text(encoding="utf-8"))
INW_V1 = json.loads((FIXTURES / "eurostat_hicp_inw_v1_bg.json").read_text(encoding="utf-8"))

MINR_URL = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{MINR_DATASET}"
IW_URL = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{IW_DATASET}"


def _minr_by_unit(request):
    """Route a prc_hicp_minr call to the fixture matching its `unit` filter."""
    unit = request.url.params["unit"]
    return httpx.Response(200, json=RCH if unit == "RCH_A" else I15)


# ---------------------------------------------------------------------------
# Shape + normalisation
# ---------------------------------------------------------------------------


@respx.mock
def test_fetch_rates_returns_every_division_normalised():
    """RCH_A fetch yields CP00 + all 13 divisions, with coicop18 → coicop and
    the upstream TOTAL code mapped back to our CP00."""
    respx.get(MINR_URL).mock(side_effect=_minr_by_unit)

    cube = fetch_hicp_rates_bg(geo="BG", last_periods=2)

    by_cp: dict[str, list] = {}
    for r in cube.rows:
        by_cp.setdefault(r["coicop"], []).append(r)
    assert {"CP00", *CP_DIVISIONS} <= set(by_cp)
    assert all(COICOP_DIM not in r for r in cube.rows), "upstream dim name leaked"
    assert not any(r["coicop"] == "TOTAL" for r in cube.rows), "TOTAL not mapped to CP00"
    assert by_cp["CP00"][0]["geo"] == "BG"
    assert by_cp["CP00"][0]["unit"] == "RCH_A"
    assert cube.dataset == MINR_DATASET
    assert cube.dim == COICOP_DIM


@respx.mock
def test_fetch_rates_passes_correct_query_params():
    """Eyeball the URL so the base or the filter set can't drift silently."""
    route = respx.get(MINR_URL).mock(side_effect=_minr_by_unit)

    fetch_hicp_rates_bg(geo="BG", last_periods=12)

    params = route.calls.last.request.url.params
    assert params["geo"] == "BG"
    assert params["unit"] == "RCH_A"
    assert params["lastTimePeriod"] == "12"
    assert params["format"] == "JSON"
    # No coicop filter at all: the whole BG slice comes back in one response.
    # A multi-value filter would silently return an EMPTY cube.
    assert "coicop18" not in params
    assert "coicop" not in params


@respx.mock
def test_fetch_index_returns_year_end_periods_per_division():
    respx.get(MINR_URL).mock(side_effect=_minr_by_unit)

    cube = fetch_hicp_index_bg(geo="BG", since_year=2020)

    by_cp: dict[str, list] = {}
    for r in cube.rows:
        by_cp.setdefault(r["coicop"], []).append(r)
    assert {"CP00", *CP_DIVISIONS} <= set(by_cp)
    times = {r["time"] for r in by_cp["CP01"]}
    assert {"2020-12", "2025-12", "2026-06"} <= times
    assert cube.rows[0]["unit"] == "I15"


@respx.mock
def test_fetch_weights_returns_percentages_and_the_ver2_label_for_cp12():
    """The weights cube must be the ver.2 one: it knows CP13, and its CP12 is
    Insurance — not the ver.1 'Miscellaneous goods and services'."""
    respx.get(IW_URL).mock(return_value=httpx.Response(200, json=IW))

    cube = fetch_hicp_weights_bg(geo="BG")

    assert cube.dataset == IW_DATASET
    assert cube.dim == COICOP_DIM
    assert "CP13" in cube.labels
    assert cube.labels["CP12"] == "Insurance and financial services"
    per_mille = {r["coicop"]: r["value"] for r in cube.rows}
    assert abs(sum(per_mille[cp] for cp in CP_DIVISIONS) - 1000) < 1.0


@respx.mock
def test_group_codes_exclude_zero_weight_groups():
    """Eurostat carries structurally-required groups at zero weight for BG
    (CP013, CP082, CP101, CP103). They have no rate, so a card for one would
    be an empty row — they must not reach the basket."""
    respx.get(IW_URL).mock(return_value=httpx.Response(200, json=IW))

    groups = group_codes_in_basket(fetch_hicp_weights_bg(geo="BG"))

    assert all(len(g) == 5 for g in groups), "group codes are CPxxy"
    assert "CP072" in groups, "running your car is in BG's basket"
    for zero_weight in ("CP013", "CP082", "CP101", "CP103"):
        assert zero_weight not in groups
    # Every group belongs to a published division.
    assert all(g[:4] in CP_DIVISIONS for g in groups)


# ---------------------------------------------------------------------------
# Failure modes — the properties that make ONE unfiltered call safe
# ---------------------------------------------------------------------------


@respx.mock
def test_fetch_raises_when_a_required_code_is_missing():
    """A truncated or reshaped response must fail loudly, never publish a
    partial basket. This is the guard that replaced the per-code fan-out."""
    respx.get(MINR_URL).mock(side_effect=_minr_by_unit)

    with pytest.raises(ValueError, match="missing"):
        fetch_hicp_rates_bg(geo="BG", codes=["CP00", "CP99"])


@respx.mock
def test_fetch_weights_rejects_a_ver1_cube():
    """Handing the connector the ARCHIVED ver.1 weights cube must raise.

    `prc_hicp_inw` is keyed by `coicop`, not `coicop18`. Accepting it is what
    put a ver.1 'Miscellaneous' weight next to a ver.2 'Insurance' rate on the
    same CP12 card in July 2026. The dimension name is the earliest possible
    place to catch it — before any code ever gets joined.
    """
    respx.get(IW_URL).mock(return_value=httpx.Response(200, json=INW_V1))

    with pytest.raises(ValueError, match=r"coicop18.*ver\.2|ver\.1"):
        fetch_hicp_weights_bg(geo="BG")


@respx.mock
def test_fetch_raises_on_http_error():
    respx.get(MINR_URL).mock(return_value=httpx.Response(500, text="boom"))

    with pytest.raises(httpx.HTTPStatusError):
        fetch_hicp_index_bg(geo="BG", since_year=2025)


# ---------------------------------------------------------------------------
# Classification constants
# ---------------------------------------------------------------------------


def test_cp_divisions_constant_is_the_ver2_thirteen():
    """ECOICOP ver.2 has THIRTEEN divisions. Ver.1's twelve ended at CP12
    'Miscellaneous goods and services'; ver.2 splits that into CP12 Insurance
    & financial services and CP13 Personal care, social protection & misc.
    A regression to 12 would drop CP13 — 4.4% of BG's basket, and its
    second-fastest-rising group — off the page entirely."""
    assert [f"CP{n:02d}" for n in range(1, 14)] == CP_DIVISIONS
    assert len(CP_DIVISIONS) == 13
    assert CP_DIVISIONS[-1] == "CP13"
    assert COICOP_DIM == "coicop18"
    assert CLASSIFICATION == "ECOICOP ver.2"
