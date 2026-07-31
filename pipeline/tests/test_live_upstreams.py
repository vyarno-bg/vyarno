"""Live upstream probes. **Skipped by default** — run them deliberately:

    pytest -m live            # only these
    pytest -m live -q -x      # stop at the first upstream that moved

Everything else in the suite is offline (fixtures + respx), because a test
that needs the internet cannot be a gate. These are the opposite: they hit
Eurostat, the ECB, NSI, BNB and imot.bg through the REAL connectors and
assert the live response still has the shape the parsers expect.

Why they exist: every wrong number this project has shipped came from an
upstream moving while the offline fixtures kept passing — a discontinued
cube frozen at Dec 2025, an ECB filter that stopped applying, a BNB
workbook column that shifted. Fixtures pin the parser; these pin the
premise. Run them when a refresh looks odd, and before believing a fixture.

They assert on SHAPE and PLAUSIBILITY, never on an exact current value —
upstream numbers change every month by design, and a test that pinned one
would fail for the wrong reason and get muted.

An environment that blocks an upstream (datacenter IPs get 403 from
imot.bg; BNB omits an intermediate TLS cert) reports SKIP with the reason,
not a failure: "the network here can't reach it" is not evidence that the
endpoint moved.
"""

from __future__ import annotations

import re
from datetime import date

import httpx
import pytest

from vyarno_pipeline import clock
from vyarno_pipeline.sources.bnb import fetch_housing_stock_rate_bg
from vyarno_pipeline.sources.ecb import SERIES_KEYS, fetch_mir_series
from vyarno_pipeline.sources.eurostat import (
    CP_DIVISIONS,
    fetch_hicp_index_bg,
    fetch_hicp_rates_bg,
    fetch_hicp_weights_bg,
    group_codes_in_basket,
)
from vyarno_pipeline.sources.imot import fetch_sofia_avg_prices
from vyarno_pipeline.sources.nsi import fetch_sofia_salary_eu

pytestmark = pytest.mark.live


def _skip_if_blocked_here(exc: Exception, upstream: str, hint: str):
    """Turn an environment-level block into a skip with the reason named."""
    pytest.skip(f"{upstream} unreachable from this environment ({exc!r}). {hint}")


def _months_old(period: str, today: date | None = None) -> int:
    """Whole months between a "YYYY-MM" period and today."""
    today = today or clock.today()
    year, month = (int(p) for p in period.split("-")[:2])
    return (today.year - year) * 12 + (today.month - month)


def _quarters_old(period: str, today: date | None = None) -> int:
    """Whole quarters between a "YYYY-Qn" period and today."""
    today = today or clock.today()
    year, quarter = period.split("-Q")
    return (today.year - int(year)) * 4 + ((today.month - 1) // 3 + 1 - int(quarter))


# ---------------------------------------------------------------------------
# Eurostat — the headline, the categories, the weights
# ---------------------------------------------------------------------------


def test_eurostat_still_serves_the_live_rate_cube():
    """prc_hicp_minr (RCH_A) must answer for CP00 + all 13 ver.2 divisions and
    be current.

    This is the cube the headline and every category rate come from. Its
    predecessor `prc_hicp_manr` was discontinued and froze — silently, with
    HTTP 200 — which is precisely what the freshness assertion catches.
    """
    cube = fetch_hicp_rates_bg(geo="BG", last_periods=3)
    by_cp: dict[str, list] = {}
    for r in cube.rows:
        by_cp.setdefault(r["coicop"], []).append(r)

    assert {"CP00", *CP_DIVISIONS} <= set(by_cp), (
        f"the live cube no longer returns every ver.2 division: "
        f"missing {sorted({'CP00', *CP_DIVISIONS} - set(by_cp))}"
    )
    latest = max(r["time"] for r in cube.rows)
    assert _months_old(latest) <= 4, (
        f"latest published rate is {latest} — more than 4 months old. The "
        f"cube may have been discontinued (this is how prc_hicp_manr died)."
    )
    headline = max(by_cp["CP00"], key=lambda r: r["time"])
    assert -5.0 < float(headline["value"]) < 30.0, (
        f"headline rate {headline['value']}% at {headline['time']} is outside "
        f"any plausible band — check the unit dimension."
    )


def test_eurostat_still_serves_the_index_back_to_2020():
    """The index (I15) must reach back to 2020 — the site's earliest anchor."""
    times = {r["time"] for r in fetch_hicp_index_bg(geo="BG", since_year=2020).rows}
    assert any(t.startswith("2020") for t in times), (
        "the live index no longer covers 2020; every since-2020 number on the site depends on it"
    )
    assert "2020-12" in times, "December 2020 is missing — the rebase base"


def test_eurostat_ver2_weights_still_sum_to_the_full_basket():
    """prc_hicp_iw is per-thousand; the 13 ver.2 divisions must sum to ~1000.

    A basket that stops summing means Eurostat reshuffled the divisions, and
    the chain-reconciliation gate would start failing on the next refresh.
    """
    cube = fetch_hicp_weights_bg(geo="BG", last_periods=1)
    latest_year = max(str(r["time"]) for r in cube.rows)
    by_code = {r["coicop"]: float(r["value"]) for r in cube.rows if str(r["time"]) == latest_year}
    per_mille = sum(by_code[cp] for cp in CP_DIVISIONS)
    assert abs(per_mille - 1000.0) <= 5.0, (
        f"live {CP_DIVISIONS[0]}..{CP_DIVISIONS[-1]} weights sum to {per_mille} "
        f"per-thousand, expected 1000"
    )
    assert cube.dim == "coicop18", (
        f"the weights cube is keyed by {cube.dim!r} — that is the archived "
        f"ver.1 classification, not ver.2"
    )


def test_eurostat_weights_and_rates_still_agree_on_what_each_code_means():
    """The live cross-version check — the premise the whole basket rests on.

    `prc_hicp_iw` and `prc_hicp_minr` must give the SAME English label for
    every code we publish. In July 2026 they did not: the weights came from
    the ver.1 `prc_hicp_inw`, where CP12 means "Miscellaneous goods and
    services", while the rates came from ver.2, where CP12 means "Insurance
    and financial services". Offline fixtures cannot catch that drift
    recurring — only a live probe can.
    """
    from vyarno_pipeline.validate import validate_classification_agreement

    weights = fetch_hicp_weights_bg(geo="BG", last_periods=1)
    rates = fetch_hicp_rates_bg(geo="BG", last_periods=1)
    codes = [*CP_DIVISIONS, *group_codes_in_basket(weights)]

    validate_classification_agreement(
        codes=codes,
        weight_labels=weights.labels,
        rate_labels=rates.labels,
        weights_dim=weights.dim,
        rates_dim=rates.dim,
    )


def test_eurostat_still_publishes_group_level_detail_for_bg():
    """The detailed mode needs level-2 (group) weights AND rates for BG.

    If Eurostat stopped publishing them, every division's drill-down would
    empty out — the group-consistency gate would fail the refresh, and this
    probe says why.
    """
    weights = fetch_hicp_weights_bg(geo="BG", last_periods=1)
    groups = group_codes_in_basket(weights)
    assert len(groups) >= 40, f"only {len(groups)} groups in BG's basket"
    parents = {g[:4] for g in groups}
    assert parents == set(CP_DIVISIONS), (
        f"divisions with no groups: {sorted(set(CP_DIVISIONS) - parents)}"
    )
    rated = {r["coicop"] for r in fetch_hicp_rates_bg(geo="BG", last_periods=1, codes=groups).rows}
    assert set(groups) <= rated, f"groups with a weight but no rate: {sorted(set(groups) - rated)}"


# ---------------------------------------------------------------------------
# ECB MIR — the mortgage tiers
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", sorted(SERIES_KEYS))
def test_every_ecb_series_key_still_resolves(name):
    """Each fully-specified key must return exactly its own series.

    `fetch_mir_series` passes `expect_key`, so this also re-proves the
    identity check against live data: the day the ECB stops applying a
    filter, this fails instead of shipping another country's rate.
    """
    from vyarno_pipeline.sources.ecb import EURO_SWITCH_PERIOD

    series = fetch_mir_series(SERIES_KEYS[name])
    assert series, f"{name}: the live response carried no observations"
    latest = max(series)
    if name.endswith("_bgn"):
        # The BGN legs END at eurozone entry by design — they are the
        # pre-changeover half of the splice, not a live series. What must
        # hold is that they still reach the changeover, or the spliced
        # history would have a hole at the seam.
        assert latest >= EURO_SWITCH_PERIOD or _months_old(latest) >= 1, latest
        assert max(series) >= "2025-12", (
            f"{name}: BGN leg ends at {latest}, before the euro changeover "
            f"({EURO_SWITCH_PERIOD}) — the spliced history would have a gap"
        )
    else:
        assert _months_old(latest) <= 5, (
            f"{name}: latest observation {latest} is stale; MIR normally runs 6-8 weeks behind"
        )
    if "volume" not in name:
        assert 0.25 <= series[latest] <= 12.0, (
            f"{name}: {series[latest]}% at {latest} is outside the plausible "
            f"BG mortgage band — the wrong cell or the wrong series"
        )


# ---------------------------------------------------------------------------
# NSI — the Sofia wage anchor
# ---------------------------------------------------------------------------


def test_nsi_workbook_still_has_the_sofia_city_row():
    """The XLSX must download and still carry the `-Sofia cap.` row.

    NSI republishes this file on its own schedule; a moved row or a renamed
    sheet is caught by the connector's own guards, which this exercises
    against the live workbook rather than the fixture.
    """
    try:
        result = fetch_sofia_salary_eu()
    except httpx.HTTPError as e:
        _skip_if_blocked_here(e, "NSI", "See docs/data-sources.md §Sofia wage.")
    assert result["value_eur"] > 500, result["value_eur"]
    assert result["sofia_province_value_eur"] < result["value_eur"], (
        "Sofia-city must exceed Sofia province — the connector's own "
        "wrong-row guard, re-checked live"
    )
    assert re.fullmatch(r"\d{4}-Q[1-4]", result["ref_period"]), (
        f"NSI headline period {result['ref_period']!r} is not a quarter — the "
        "connector is reading the monthly sheet again"
    )
    assert _quarters_old(result["ref_period"]) <= 3, (
        f"latest NSI quarter {result['ref_period']} is stale"
    )


# ---------------------------------------------------------------------------
# BNB — the outstanding housing book
# ---------------------------------------------------------------------------


def test_bnb_workbook_still_parses_and_agrees_with_the_ecb():
    """The BNB housing column must parse and match ECB MIR's outstanding series.

    They are the same book (BNB reports MIR to the ECB), so agreement is
    evidence both cells are still being read correctly — the live version of
    the cross-check gate.
    """
    from vyarno_pipeline.mortgage import CROSS_CHECK_TOLERANCE_PP

    try:
        rows = fetch_housing_stock_rate_bg()
    except httpx.HTTPError as e:
        _skip_if_blocked_here(
            e,
            "BNB",
            "BNB omits an intermediate certificate; see docs/data-sources.md §'BNB TLS setup'.",
        )
    latest = rows[-1]
    assert 0.25 <= latest["rate_pct"] <= 12.0, latest
    ecb = fetch_mir_series(SERIES_KEYS["outstanding_aar_eur"])
    shared = sorted(set(ecb) & {r["period"] for r in rows})
    assert shared, "BNB and ECB no longer overlap on any month"
    month = shared[-1]
    bnb_pct = next(r["rate_pct"] for r in rows if r["period"] == month)
    assert abs(bnb_pct - ecb[month]) <= CROSS_CHECK_TOLERANCE_PP, (
        f"{month}: BNB {bnb_pct}% vs ECB {ecb[month]}% — one read is wrong"
    )


# ---------------------------------------------------------------------------
# imot.bg — the Sofia €/m² scrape
# ---------------------------------------------------------------------------


def test_imot_page_still_carries_the_district_price_block():
    """The scrape depends on one JS literal; confirm it is still served.

    imot.bg blocks datacenter IPs, so a 403 here is an environment result,
    not a layout change — it skips with that said out loud.
    """
    try:
        raw = fetch_sofia_avg_prices()
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (403, 429):
            _skip_if_blocked_here(
                e,
                "imot.bg",
                "It blocks datacenter IPs; run this from a normal network.",
            )
        raise
    except httpx.HTTPError as e:
        _skip_if_blocked_here(e, "imot.bg", "Network error, not a layout change.")

    assert raw["n_districts"] >= 100, (
        f"only {raw['n_districts']} districts parsed from the live page; the "
        f"real Sofia page carries ~143"
    )
    assert all(100 <= v <= 10_000 for v in raw["districts"].values())

    # The page-publication stamp, which is the ONLY thing that says how old
    # these prices are — `as_of` is the day we looked, not the day imot.bg
    # recomputed. The offline test can never catch a missing stamp: it asserts
    # against the committed fixture, and the fixture is exactly what would go
    # stale.
    assert re.fullmatch(r"\d{1,2}\.\d{1,2}\.\d{4}", raw["page_as_of"] or ""), (
        f"imot.bg served the district block but no parseable 'обновена на' "
        f"date (got {raw['page_as_of']!r}). Without it we cannot tell a page "
        f"refreshed today from one frozen for months. Fix "
        f"sources/imot.py#_extract_page_as_of against the live wording, and "
        f"regenerate fixtures/imot_sredni_ceni_sample.html from this fetch."
    )
