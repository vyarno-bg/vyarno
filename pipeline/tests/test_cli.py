"""Tests for the CLI entry point.

We mock httpx via respx so the full refresh path runs without network. The
canned responses are REAL trimmed Eurostat cubes (see
`fixtures/make_hicp_fixtures.py`), so these exercise the actual parser,
the actual ver.2 labels and the actual BG weights — not a stub that merely
resembles them.

The failure-mode tests mutate a copy of a fixture, which means each one
describes a specific way upstream can break and proves the CLI exits with
the documented code (2 = input/transform, 3 = gate, 4 = network).
"""

import json
from pathlib import Path

import httpx
import pytest
import respx
from click.testing import CliRunner

from vyarno_pipeline.cli import main

FIXTURES = Path(__file__).parent / "fixtures"
MINR_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr"
IW_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_iw"
INW_V1_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_inw"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def cubes() -> dict[str, dict]:
    """Fresh, independently mutable copies of the three live cubes."""
    return {
        "rch": _fixture("eurostat_hicp_rch_bg.json"),
        "i15": _fixture("eurostat_hicp_i15_bg.json"),
        "iw": _fixture("eurostat_hicp_iw_bg.json"),
    }


def _mock(cubes: dict[str, dict], *, rate_side_effect=None) -> None:
    """Route prc_hicp_minr by its `unit` filter, and prc_hicp_iw to the weights."""

    def minr(request):
        if request.url.params["unit"] == "RCH_A":
            if rate_side_effect is not None:
                return rate_side_effect(request)
            return httpx.Response(200, json=cubes["rch"])
        return httpx.Response(200, json=cubes["i15"])

    respx.get(MINR_URL).mock(side_effect=minr)
    respx.get(IW_URL).mock(return_value=httpx.Response(200, json=cubes["iw"]))


def _set_value(cube: dict, code: str, new_value: float) -> None:
    """Overwrite every observation for one COICOP code, in place."""
    dims: list[str] = cube["id"]
    sizes: list[int] = cube["size"]
    dim = "coicop" if "coicop" in dims else "coicop18"
    axis = dims.index(dim)
    stride = 1
    for s in sizes[axis + 1 :]:
        stride *= s
    target = cube["dimension"][dim]["category"]["index"][code]
    for key in list(cube["value"]):
        if (int(key) // stride) % sizes[axis] == target:
            cube["value"][key] = new_value


def _run(tmp_path: Path, *extra: str):
    return CliRunner().invoke(
        main,
        ["refresh", "--source", "hicp", "--out", str(tmp_path), *extra],
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@respx.mock
def test_refresh_hicp_publishes_thirteen_divisions_with_their_groups(tmp_path: Path, cubes):
    """End-to-end on real BG data: weights + rates + index → 13 divisions,
    each with its ECOICOP level-2 groups → both files on disk."""
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 0, f"CLI failed:\n{result.output}"
    payload = json.loads((tmp_path / "hicp_categories.json").read_text())
    codes = [c["cp_code"] for c in payload["categories"]]
    assert codes == [f"CP{n:02d}" for n in range(1, 14)]
    assert sum(len(c["groups"]) for c in payload["categories"]) >= 40
    assert all(c["groups"] for c in payload["categories"]), "every division drills down"
    assert (tmp_path / "hicp_headline.json").exists()


@respx.mock
def test_published_cp12_is_insurance_and_cp13_exists(tmp_path: Path, cubes):
    """Every row describes one bucket, and CP13 is published.

    Joined across classification versions, a CP12 card carries the ver.1
    *Miscellaneous* weight (5.898%) beside the ver.2 *Insurance* rate (3.9%),
    and CP13 — personal care and other services, 4.4% of the basket — is not
    published at all.
    """
    _mock(cubes)

    assert _run(tmp_path, "--skip-link-check").exit_code == 0
    cats = {
        c["cp_code"]: c
        for c in json.loads((tmp_path / "hicp_categories.json").read_text())["categories"]
    }

    cp12 = cats["CP12"]
    assert cp12["eurostat_label"] == "Insurance and financial services"
    assert cp12["weight_pct"] < 3.0, "the ver.1 Miscellaneous weight was 5.898%"
    assert "insurance" in cp12["en_name"].lower()

    cp13 = cats["CP13"]
    assert cp13["eurostat_label"].startswith("Personal care")
    assert cp13["weight_pct"] > 3.0
    # CP12 and CP13 together are what ver.1's single CP12 covered.
    assert cp12["weight_pct"] + cp13["weight_pct"] == pytest.approx(5.84, abs=0.3)


@respx.mock
def test_published_envelope_names_both_ver2_datasets(tmp_path: Path, cubes):
    """The classification block is the provenance a future reader checks when
    they wonder whether weights and rates are on the same version."""
    _mock(cubes)

    assert _run(tmp_path, "--skip-link-check").exit_code == 0
    payload = json.loads((tmp_path / "hicp_categories.json").read_text())

    c = payload["classification"]
    assert c["version"] == "ECOICOP ver.2"
    assert c["coicop_dim"] == "coicop18"
    assert c["division_count"] == 13
    assert c["rates_dataset"] == "prc_hicp_minr"
    assert c["weights_dataset"] == "prc_hicp_iw"
    assert c["weights_ref_year"] == "2026"
    assert all(cat["dataset"] == "prc_hicp_minr+prc_hicp_iw" for cat in payload["categories"])


@respx.mock
def test_refresh_hicp_publishes_the_headline_from_cp00_at_its_own_month(tmp_path: Path, cubes):
    """The headline must be TOTAL's own latest RCH_A reading, not a category's.

    Publishing a category rate as the all-items headline would be the single
    most visible wrong number on the site, and no reconciliation gate can
    catch it (they compare against whatever headline is passed).
    """
    _mock(cubes)

    assert _run(tmp_path, "--skip-link-check").exit_code == 0
    headline = json.loads((tmp_path / "hicp_headline.json").read_text())
    assert headline["headline_rate_pct"] == pytest.approx(5.2)
    assert headline["ref_period"] == "2026-06"

    # …and the categories payload carries the SAME month. One cube, one call,
    # one month: were these to disagree, the site's data panel would date two
    # payloads from a single refresh differently and one would be wrong. Asserted
    # here because it is the wiring into both writers that can drift.
    categories = json.loads((tmp_path / "hicp_categories.json").read_text())
    assert categories["ref_period"] == headline["ref_period"]
    assert {c["ref_period"] for c in categories["categories"]} == {headline["ref_period"]}


# ---------------------------------------------------------------------------
# Gate failures — every one of these must leave the published files untouched
# ---------------------------------------------------------------------------


@respx.mock
def test_refresh_aborts_when_the_weights_cube_is_the_archived_ver1_one(tmp_path: Path, cubes):
    """THE regression. Point the weights fetch at `prc_hicp_inw` (ECOICOP
    ver.1) and the refresh must die before anything is written.

    This is the exact configuration that shipped: ver.1 weights joined to
    ver.2 rates by raw CP code. Exit 2 — the response fails its shape check
    (`coicop`, not `coicop18`) before any gate even runs.
    """
    cubes["iw"] = _fixture("eurostat_hicp_inw_v1_bg.json")
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 2, result.output
    assert "coicop18" in result.output
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_aborts_when_a_code_means_different_things_in_the_two_cubes(tmp_path: Path, cubes):
    """The label half of the same regression, isolated: same dimension name,
    but the weights cube calls CP12 by its ver.1 name."""
    cubes["iw"]["dimension"]["coicop18"]["category"]["label"]["CP12"] = (
        "Miscellaneous goods and services"
    )
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 3, result.output
    assert "GATE FAILED" in result.output
    assert "CP12" in result.output
    assert "Insurance and financial services" in result.output
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_aborts_when_the_weights_vintage_lags_the_rates(tmp_path: Path, cubes):
    """HICP re-weights every January and Eurostat publishes the new item
    weights ~late February, so there is a real window each year when the
    rates are ahead of the weights. Publishing across it would mix baskets."""
    tcat = cubes["iw"]["dimension"]["time"]["category"]
    tcat["index"] = {"2025": 0}
    tcat["label"] = {"2025": "2025"}
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 3, result.output
    assert "vintage" in result.output or "2025" in result.output
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_aborts_when_a_division_stops_reconciling(tmp_path: Path, cubes):
    """Corrupt one division's index and the chain gate must catch it: the
    divisions stop rebuilding Eurostat's own all-items movement."""
    _set_value(cubes["i15"], "CP07", 100.0)  # flat transport index
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 3, result.output
    assert "chain reconciliation" in result.output
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_aborts_when_the_basket_weights_do_not_sum_to_100(tmp_path: Path, cubes):
    """A basket that doesn't sum means the weight cube changed shape.

    Publishing anyway would silently rescale every personal-inflation number.
    This is an input-shape failure, so exit 2 — checked before the transform
    runs, so the operator gets a sentence rather than a pydantic traceback.
    """
    _set_value(cubes["iw"], "CP01", 115.0)  # half of BG's real food weight
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 2, result.output
    assert "weights sum to" in result.output
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_aborts_when_the_headline_diverges_from_the_basket(tmp_path: Path, cubes):
    """Σ(w·r) is a loose band, but a headline a full point away from the
    basket means the two are not the same vintage or the same country."""
    _set_value(cubes["rch"], "TOTAL", 12.0)
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 3, result.output
    assert "basket sum" in result.output
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_aborts_on_coverage_failure(tmp_path: Path, cubes):
    """Punch a hole in the middle of the index and the coverage gate must
    fail: 2022 would render as a broken anchor in the year dropdown.

    2020-12 (the rebase base), 2025-12 (the chain link) and 2026-06 (the
    latest month) are kept so the earlier gates pass and this one is what
    actually fires.
    """
    cube = cubes["i15"]
    keep = ["2020-12", "2021-12", "2023-12", "2024-12", "2025-12", "2026-06"]
    tcat = cube["dimension"]["time"]["category"]
    dropped = {tcat["index"][t] for t in tcat["index"] if t not in keep}
    time_axis = cube["id"].index("time")
    stride = 1
    for s in cube["size"][time_axis + 1 :]:
        stride *= s
    n_time = cube["size"][time_axis]
    cube["value"] = {
        k: v for k, v in cube["value"].items() if (int(k) // stride) % n_time not in dropped
    }
    _mock(cubes)

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 3, result.output
    assert "coverage" in result.output.lower()
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_link_gate_rejects_a_200_with_an_error_body(tmp_path: Path, cubes):
    """The link gate runs for real when --skip-link-check is absent.

    Eurostat answers 200 with an error payload when rate-limited, so the gate
    inspects the body. The data fetch succeeds; the link-check requests (which
    re-request each published RCH_A api_url, and therefore carry a coicop18
    filter the bulk fetch does not) get the error payload.
    """

    def rate_side_effect(request):
        if "coicop18" in request.url.params:  # a link-check call
            return httpx.Response(200, json={"error": "Too Many Requests"})
        return httpx.Response(200, json=cubes["rch"])

    _mock(cubes, rate_side_effect=rate_side_effect)

    result = _run(tmp_path)

    assert result.exit_code == 3, result.output
    assert "link" in result.output.lower()
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_link_gate_covers_the_INDEX_extract_the_ui_actually_links_to(tmp_path: Path, cubes):
    """The "↗" the user clicks is the index extract at a year anchor.

    A gate checking only `api_url` covers the RCH_A extract — 13 of the 118
    URLs we publish — while the SPA's verify link resolves to `api_url_index`
    whenever the anchor is a year, and every one of the 46 group rows carries
    its own pair. A provenance gate that skips the links the reader clicks is
    not gating provenance.

    Here ONLY the I15 link-check calls return an error body, and the refresh
    must still fail.
    """

    def index_only_error(request):
        # Link-check calls carry a single-code coicop18 filter; the bulk
        # index fetch does not.
        if "coicop18" in request.url.params and request.url.params["unit"] == "I15":
            return httpx.Response(200, json={"error": "Too Many Requests"})
        return None

    def minr(request):
        if request.url.params["unit"] == "RCH_A":
            return httpx.Response(200, json=cubes["rch"])
        return index_only_error(request) or httpx.Response(200, json=cubes["i15"])

    respx.get(MINR_URL).mock(side_effect=minr)
    respx.get(IW_URL).mock(return_value=httpx.Response(200, json=cubes["iw"]))

    result = _run(tmp_path)

    assert result.exit_code == 3, result.output
    assert "link" in result.output.lower()
    assert "unit=I15" in result.output, "the gate failed on something, but not on the index extract"
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_link_gate_reaches_the_group_rows_too(tmp_path: Path, cubes):
    """46 group rows each publish their own two links, and the drill-down
    renders them. Only the group (5-character CPnnn) link-checks fail here."""

    def minr(request):
        code = request.url.params.get("coicop18")
        if code and len(code) > 4:  # a group link-check, e.g. CP072
            return httpx.Response(200, json={"error": "Too Many Requests"})
        if request.url.params["unit"] == "RCH_A":
            return httpx.Response(200, json=cubes["rch"])
        return httpx.Response(200, json=cubes["i15"])

    respx.get(MINR_URL).mock(side_effect=minr)
    respx.get(IW_URL).mock(return_value=httpx.Response(200, json=cubes["iw"]))

    result = _run(tmp_path)

    assert result.exit_code == 3, result.output
    assert "link" in result.output.lower()
    assert not (tmp_path / "hicp_categories.json").exists()


@respx.mock
def test_refresh_link_gate_rejects_an_EMPTY_but_well_formed_cube(tmp_path: Path, cubes):
    """A 200 with `value: {}` is a failed query, not a small dataset.

    A predicate accepting a body carrying EITHER `dimension` OR `value` lets
    a well-formed envelope with nothing in it pass (docs/data-sources.md
    §"Body-checked link validation" —
    body-checked link validation).
    """

    def minr(request):
        if "coicop18" in request.url.params:  # any link-check call
            return httpx.Response(200, json={"dimension": {}, "value": {}})
        if request.url.params["unit"] == "RCH_A":
            return httpx.Response(200, json=cubes["rch"])
        return httpx.Response(200, json=cubes["i15"])

    respx.get(MINR_URL).mock(side_effect=minr)
    respx.get(IW_URL).mock(return_value=httpx.Response(200, json=cubes["iw"]))

    result = _run(tmp_path)

    assert result.exit_code == 3, result.output
    assert "link" in result.output.lower()


def test_is_real_estat_cube_demands_both_keys_and_a_non_empty_value() -> None:
    from vyarno_pipeline.cli import _is_real_estat_cube

    assert _is_real_estat_cube({"dimension": {"geo": {}}, "value": {"0": 5.2}})
    # Eurostat's 200-with-an-error-payload, the whole reason this is a
    # predicate and not a status-code check.
    assert not _is_real_estat_cube({"error": "Too Many Requests"})
    # Either key alone is not enough — the old check was an `or`.
    assert not _is_real_estat_cube({"value": {"0": 5.2}})
    assert not _is_real_estat_cube({"dimension": {"geo": {}}})
    # Well-formed and empty is a failed filter.
    assert not _is_real_estat_cube({"dimension": {"geo": {}}, "value": {}})
    assert not _is_real_estat_cube([])


@respx.mock
def test_refresh_exits_4_on_network_failure(tmp_path: Path, cubes):
    """A network error is exit 4, distinct from a gate failure — the runbook
    branches on the code."""
    respx.get(IW_URL).mock(side_effect=httpx.ConnectError("no route to host"))

    result = _run(tmp_path, "--skip-link-check")

    assert result.exit_code == 4, result.output
    assert "network" in result.output.lower()
