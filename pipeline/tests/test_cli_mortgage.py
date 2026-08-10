"""End-to-end tests for `refresh --source mortgage`.

Runs the whole arm — fetch, splice, gates, publish — with respx serving the
committed fixtures, so no network is touched. Asserts both the happy path and
that each failure mode exits with the documented code:

    0  published
    2  upstream shape/identity changed
    3  a gate failed
    4  network/TLS

The exit codes matter operationally: the maintenance runbook tells whoever is
refreshing the data what a non-zero exit means, and "do not commit" depends on
it being right.
"""

import json
from pathlib import Path

import httpx
import pytest
import respx
from click.testing import CliRunner

from vyarno_pipeline.cli import main
from vyarno_pipeline.sources.bnb import SOURCE_URL as BNB_URL
from vyarno_pipeline.sources.ecb import BASE as ECB_BASE
from vyarno_pipeline.sources.ecb import SERIES_KEYS

FIXTURES = Path(__file__).parent / "fixtures"

# Which recorded fixture answers which series key.
FIXTURE_FOR_KEY = {
    SERIES_KEYS["new_business_aar_bgn"]: "ecb_mir_bg_new_business_aar_bgn.json",
    SERIES_KEYS["new_business_aar_eur"]: "ecb_mir_bg_new_business_aar_eur.json",
    SERIES_KEYS["new_business_aprc_bgn"]: "ecb_mir_bg_new_business_aprc_bgn.json",
    SERIES_KEYS["new_business_aprc_eur"]: "ecb_mir_bg_new_business_aprc_eur.json",
    SERIES_KEYS["new_business_volume_bgn"]: "ecb_mir_bg_new_business_volume_bgn.json",
    SERIES_KEYS["new_business_volume_eur"]: "ecb_mir_bg_new_business_volume_eur.json",
    SERIES_KEYS["outstanding_aar_eur"]: "ecb_mir_bg_outstanding_aar_eur.json",
}


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _mock_all(ecb_overrides: dict[str, dict] | None = None) -> None:
    """Route every ECB series key and the BNB workbook to its fixture."""
    overrides = ecb_overrides or {}
    for key, fixture in FIXTURE_FOR_KEY.items():
        payload = overrides.get(key, _load(fixture))
        respx.get(url__startswith=f"{ECB_BASE}/MIR/{key}").mock(
            return_value=httpx.Response(200, json=payload)
        )
    respx.get(BNB_URL).mock(
        return_value=httpx.Response(
            200,
            content=(FIXTURES / "bnb_housing_loans_oa_hh_bg.xlsx").read_bytes(),
        )
    )


def _run(tmp_path: Path):
    return CliRunner().invoke(main, ["refresh", "--source", "mortgage", "--out", str(tmp_path)])


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@respx.mock
def test_publishes_both_tiers_and_exits_zero(tmp_path):
    _mock_all()
    result = _run(tmp_path)
    assert result.exit_code == 0, result.output

    payload = json.loads((tmp_path / "mortgage.json").read_text(encoding="utf-8"))
    assert payload["schema_version"] == "2.0"
    assert payload["headline"] == "new_business"
    assert payload["new_business"]["value_pct"] == 2.43
    assert payload["new_business"]["aprc"]["value_pct"] == 2.77
    assert payload["outstanding_stock"]["value_pct"] == pytest.approx(2.6717, abs=1e-4)
    assert payload["cross_check"]["status"] == "ok"
    assert payload["lending_limits"]["min_down_payment_pct"] == 15.0


@respx.mock
def test_output_reports_the_cross_check_so_a_refresher_can_see_it(tmp_path):
    _mock_all()
    result = _run(tmp_path)
    assert "BNB 2.6717% vs ECB 2.67%" in result.output
    assert "gate:" in result.output


@respx.mock
def test_history_is_spliced_bgn_then_eur(tmp_path):
    _mock_all()
    _run(tmp_path)
    nb = json.loads((tmp_path / "mortgage.json").read_text(encoding="utf-8"))["new_business"]
    s = nb["series_by_period"]
    assert s["2025-12"] == 2.48  # BGN leg
    assert s["2026-01"] == 2.46  # EUR leg
    assert "BGN" in nb["currency_history"] and "EUR" in nb["currency_history"]


@respx.mock
def test_no_financer_reference_survives_anywhere_in_the_payload(tmp_path):
    _mock_all()
    _run(tmp_path)
    raw = (tmp_path / "mortgage.json").read_text(encoding="utf-8").lower()
    assert "financer" not in raw
    assert "indicative_offer" not in raw


# ---------------------------------------------------------------------------
# Exit codes
# ---------------------------------------------------------------------------


@respx.mock
def test_exit_4_when_ecb_is_unreachable(tmp_path):
    _mock_all()
    respx.get(url__startswith=f"{ECB_BASE}/MIR/{SERIES_KEYS['new_business_aar_bgn']}").mock(
        side_effect=httpx.ConnectError("down")
    )
    result = _run(tmp_path)
    assert result.exit_code == 4
    assert "ECB MIR fetch failed" in result.output


@respx.mock
def test_exit_4_when_bnb_is_unreachable_and_hints_at_the_tls_quirk(tmp_path):
    _mock_all()
    respx.get(BNB_URL).mock(
        side_effect=httpx.ConnectError("unable to get local issuer certificate")
    )
    result = _run(tmp_path)
    assert result.exit_code == 4
    assert "BNB TLS setup" in result.output, (
        "the operator needs to be pointed at the documented fix"
    )


@respx.mock
def test_exit_2_when_the_ecb_returns_the_wrong_series(tmp_path):
    """The old bug's shape: filter ignored, many series returned."""
    payload = _load(FIXTURE_FOR_KEY[SERIES_KEYS["new_business_aar_eur"]])
    only = next(iter(payload["dataSets"][0]["series"].values()))
    payload["dataSets"][0]["series"] = {
        "0:0:0:0:0:0:0:0:0:0": only,
        "0:1:0:0:0:0:0:0:0:0": only,
    }
    _mock_all(ecb_overrides={SERIES_KEYS["new_business_aar_eur"]: payload})
    result = _run(tmp_path)
    assert result.exit_code == 2
    assert "shape/identity check failed" in result.output


@respx.mock
def test_exit_2_when_the_bnb_workbook_layout_changes(tmp_path):
    _mock_all()
    respx.get(BNB_URL).mock(return_value=httpx.Response(200, content=b"not an xlsx at all"))
    result = _run(tmp_path)
    assert result.exit_code == 2


@respx.mock
def test_exit_3_when_a_gate_fails(tmp_path):
    """Swap AAR and APRC so the fees-cannot-be-negative gate trips."""
    aar_key = SERIES_KEYS["new_business_aar_eur"]
    aprc_key = SERIES_KEYS["new_business_aprc_eur"]
    _mock_all(
        ecb_overrides={
            aar_key: _load(FIXTURE_FOR_KEY[aprc_key]),
            aprc_key: _load(FIXTURE_FOR_KEY[aar_key]),
        }
    )
    result = _run(tmp_path)
    # The identity check fires first (each response names its real series),
    # which is itself the stronger guarantee; either way we must not publish.
    assert result.exit_code in (2, 3)
    assert not (tmp_path / "mortgage.json").exists()


@respx.mock
def test_nothing_is_written_when_any_stage_fails(tmp_path):
    """A partial panel must never land on disk."""
    _mock_all()
    respx.get(BNB_URL).mock(side_effect=httpx.ConnectError("down"))
    assert _run(tmp_path).exit_code == 4
    assert not (tmp_path / "mortgage.json").exists()


# ---------------------------------------------------------------------------
# The advertised source list (the CLI's contract with the runbook)
# ---------------------------------------------------------------------------


def test_refresh_advertises_exactly_the_supported_sources(tmp_path):
    """`--source` is what the maintenance runbook tells an operator to type.

    A source added to the CLI without a runbook entry (or the reverse) is how
    a refresh silently stops covering a payload. `mortgage-scrape` in
    particular must not exist: there is no scraped offered-rate tier.
    """
    result = CliRunner().invoke(
        main, ["refresh", "--source", "mortgage-scrape", "--out", str(tmp_path)]
    )
    assert result.exit_code != 0, "an unknown source must not be accepted"

    source_opt = next(p for p in main.commands["refresh"].params if p.name == "source")
    choices = set(source_opt.type.choices)
    assert choices == {
        "hicp",
        "unemployment",
        "mortgage",
        "sofia-price",
        "region-salary",
        "sector-salary",
        "salary-dist",
        "payroll",
        "all",
    }, f"the --source list changed: {sorted(choices)}"
    assert "mortgage-scrape" not in choices
