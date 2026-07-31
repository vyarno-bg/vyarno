"""Tests for the validation gates.

If any gate fails, publish aborts. These tests document the contract.

The classification and chain-reconciliation tests carry real trimmed Eurostat
cubes (`fixtures/eurostat_hicp_*.json`), including the ARCHIVED ver.1 weights
cube, so the July-2026 cross-version bug is reproduced from its actual input
rather than from a stub that merely resembles it.
"""

import json
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from vyarno_pipeline.models import CategoryObservation, GroupObservation
from vyarno_pipeline.sources.eurostat import _cube_labels, _cube_to_rows
from vyarno_pipeline.validate import (
    BASKET_SUM_TOLERANCE_PP,
    CHAIN_TOLERANCE_PP,
    ValidationError,
    validate_chain_reconciliation,
    validate_classification_agreement,
    validate_coverage,
    validate_group_consistency,
    validate_link_status,
    validate_meta_labels_cover,
    validate_reconciliation,
)

FIXTURES = Path(__file__).parent / "fixtures"
IW_V2 = json.loads((FIXTURES / "eurostat_hicp_iw_bg.json").read_text(encoding="utf-8"))
INW_V1 = json.loads((FIXTURES / "eurostat_hicp_inw_v1_bg.json").read_text(encoding="utf-8"))
RCH = json.loads((FIXTURES / "eurostat_hicp_rch_bg.json").read_text(encoding="utf-8"))
I15 = json.loads((FIXTURES / "eurostat_hicp_i15_bg.json").read_text(encoding="utf-8"))

DIVISIONS_V2 = [f"CP{n:02d}" for n in range(1, 14)]


def _labels(payload: dict) -> dict[str, str]:
    dim = "coicop" if "coicop" in payload["id"] else "coicop18"
    labels = _cube_labels(payload, dim)
    if "TOTAL" in labels:
        labels["CP00"] = labels.pop("TOTAL")
    return labels


def _index_by_period(payload: dict) -> dict[str, dict[str, float]]:
    dim = "coicop" if "coicop" in payload["id"] else "coicop18"
    out: dict[str, dict[str, float]] = {}
    for r in _cube_to_rows(payload):
        code = "CP00" if r[dim] == "TOTAL" else r[dim]
        out.setdefault(code, {})[str(r["time"])] = float(r["value"])
    return out


def _weights_pct(payload: dict) -> dict[str, float]:
    dim = "coicop" if "coicop" in payload["id"] else "coicop18"
    return {
        ("CP00" if r[dim] == "TOTAL" else r[dim]): float(r["value"]) / 10.0
        for r in _cube_to_rows(payload)
    }


def _group(
    cp: str,
    parent: str,
    weight: float,
    rate: float = 5.0,
    years: tuple[int, ...] = (2020, 2026),
) -> GroupObservation:
    yearly = {y: 100.0 * ((1 + rate / 100) ** (y - 2020)) for y in years}
    return GroupObservation(
        cp_code=cp,
        parent_cp_code=parent,
        bg_name=f"BG {cp}",
        en_name=f"EN {cp}",
        eurostat_label=f"Label {cp}",
        weight_pct=weight,
        weight_pct_of_parent=50.0,
        annual_rate_pct=rate,
        ref_period="2026-06",
        index_base_year=2020,
        index_by_year=yearly,
        latest_index={"time": "2026-06", "value": yearly[max(years)]},
        api_url=f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18={cp}&unit=RCH_A",
        api_url_index=f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18={cp}&unit=I15",
    )


def _cat(
    cp: str,
    weight: float = 100.0 / 13,
    rate: float = 5.0,
    years: tuple[int, ...] = (2020, 2026),
    groups: list[GroupObservation] | None = None,
) -> CategoryObservation:
    """Build a CategoryObservation with a flat growth curve and one group."""
    base = 100.0
    yearly = {y: base * ((1 + rate / 100) ** (y - 2020)) for y in years}
    last_year = max(years)
    if groups is None:
        groups = [_group(f"{cp}1", cp, weight, rate, years)]
    return CategoryObservation(
        dataset="prc_hicp_minr+prc_hicp_iw",
        source="eurostat",
        source_url="https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr",
        cp_code=cp,
        bg_name=f"BG {cp}",
        en_name=f"EN {cp}",
        eurostat_label=f"Label {cp}",
        weight_pct=weight,
        annual_rate_pct=rate,
        api_url=f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18={cp}&unit=RCH_A",
        api_url_index=f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18={cp}&unit=I15&sinceTimePeriod=2020-01",
        index_base_year=2020,
        index_by_year=yearly,
        latest_index={"time": f"{last_year}-12", "value": yearly[last_year]},
        ref_period="2026-12",
        published_at=date(2026, 12, 31),
        unit="index_2020=100",
        value=yearly[2026],
        groups=groups,
    )


def _uniform_cats(
    rate: float = 5.0,
    weight: float = 100.0 / 13,
    years: tuple[int, ...] = (2020, 2026),
) -> list[CategoryObservation]:
    """13 divisions with identical weights and rates → weighted sum = rate."""
    return [_cat(cp, weight=weight, rate=rate, years=years) for cp in DIVISIONS_V2]


# ---------------------------------------------------------------------------
# Gate 1 — classification agreement (the July-2026 regression)
# ---------------------------------------------------------------------------


def test_classification_agreement_passes_for_two_ver2_cubes():
    """The shipped configuration: weights from prc_hicp_iw, rates from
    prc_hicp_minr. Both ver.2, both keyed by coicop18, same label per code."""
    validate_classification_agreement(
        codes=DIVISIONS_V2,
        weight_labels=_labels(IW_V2),
        rate_labels=_labels(RCH),
        weights_dim="coicop18",
        rates_dim="coicop18",
    )


def test_classification_agreement_rejects_the_cp12_label_mismatch():
    """The gate the whole classification rule exists for.

    `prc_hicp_inw` (ECOICOP ver.1) calls CP12 "Miscellaneous goods and
    services" and weights it at 5.898% of the basket. `prc_hicp_minr` (ver.2)
    calls CP12 "Insurance and financial services" and rates it at 3.9%.
    Joining them by the raw string "CP12" puts one bucket's weight next to
    another bucket's rate — and every aggregate check passes, because the
    totals net out.

    The gate must name CP12 and quote BOTH labels: the failure message is the
    only thing standing between a 2am refresh and a wrong number on someone's
    screen.
    """
    with pytest.raises(ValidationError) as exc:
        validate_classification_agreement(
            codes=[f"CP{n:02d}" for n in range(1, 13)],
            weight_labels=_labels(INW_V1),
            rate_labels=_labels(RCH),
            weights_dim="coicop",  # ver.1 dim, as the real cube reports it
            rates_dim="coicop18",
        )
    msg = str(exc.value)
    assert "coicop" in msg and "coicop18" in msg
    assert "ECOICOP" in msg


def test_classification_agreement_catches_label_drift_within_one_dim():
    """Even when both cubes claim the same dimension name, a code that means
    two different things must fail. (If Eurostat ever republishes ver.1
    content under a ver.2 dimension name, the dim check alone would pass.)"""
    weight_labels = dict(_labels(RCH))
    weight_labels["CP12"] = "Miscellaneous goods and services"
    with pytest.raises(ValidationError) as exc:
        validate_classification_agreement(
            codes=DIVISIONS_V2,
            weight_labels=weight_labels,
            rate_labels=_labels(RCH),
            weights_dim="coicop18",
            rates_dim="coicop18",
        )
    msg = str(exc.value)
    assert "CP12" in msg
    assert "Miscellaneous goods and services" in msg
    assert "Insurance and financial services" in msg


def test_classification_agreement_catches_a_division_missing_from_one_cube():
    """CP13 exists only in ver.2. A cube without it cannot supply a weight for
    the division whose rate the other cube publishes."""
    with pytest.raises(ValidationError, match="CP13"):
        validate_classification_agreement(
            codes=DIVISIONS_V2,
            weight_labels=_labels(INW_V1),  # ver.1: no CP13
            rate_labels=_labels(RCH),
            weights_dim="coicop18",  # pretend the dims match, isolate this check
            rates_dim="coicop18",
        )


def test_classification_agreement_tolerates_only_cosmetic_label_differences():
    """Case and punctuation must not fail the gate — meaning must."""
    weight_labels = {"CP12": "insurance & financial services"}
    validate_classification_agreement(
        codes=["CP12"],
        weight_labels=weight_labels,
        rate_labels={"CP12": "Insurance and financial services"},
        weights_dim="coicop18",
        rates_dim="coicop18",
    )


def test_meta_labels_must_cover_every_published_code():
    """A code Eurostat publishes for BG but we have no name for must fail the
    publish, not be silently dropped — a dropped division is invisible."""
    with pytest.raises(ValidationError, match="CP13"):
        validate_meta_labels_cover(DIVISIONS_V2, dict.fromkeys(DIVISIONS_V2[:12], ("bg", "en")))
    validate_meta_labels_cover(DIVISIONS_V2, dict.fromkeys(DIVISIONS_V2, ("bg", "en")))


# ---------------------------------------------------------------------------
# Gate 2 — chain reconciliation
# ---------------------------------------------------------------------------


def _real_divisions(weights: dict[str, float]) -> list[CategoryObservation]:
    """13 divisions carrying REAL live weights, for the chain gate."""
    return [_cat(cp, weight=weights[cp]) for cp in DIVISIONS_V2]


def test_chain_reconciliation_passes_on_real_ver2_data():
    """The identity HICP actually satisfies:

        I_total(m) / I_total(Dec y-1) == Σ_i w_i(y) · I_i(m) / I_i(Dec y-1)

    On live BG data for 2026-06 with 2026 ver.2 weights, the two sides agree
    to ~0.004 pp — which is why this gate can afford a 0.02 pp tolerance
    while the naive Σ(w·r) check needs 0.5 pp.
    """
    index = _index_by_period(I15)
    validate_chain_reconciliation(
        categories=_real_divisions(_weights_pct(IW_V2)),
        total_index_by_period=index["CP00"],
        division_index_by_period=index,
        ref_period="2026-06",
        weights_year="2026",
    )


def test_chain_reconciliation_rejects_ver1_weights_on_ver2_rates():
    """The numeric half of the July-2026 regression.

    Feed the gate the ver.1 weight vector (12 divisions, CP12 = the old
    Miscellaneous bucket, no CP13) against the ver.2 index and it must fail:
    the rebuilt all-items index comes out 0.34 pp below Eurostat's, ~17× the
    tolerance. The old Σ(w·r)-vs-headline gate scored this configuration at a
    comfortable 0.041 pp and waved it through.
    """
    index = _index_by_period(I15)
    v1_weights = _weights_pct(INW_V1)
    cats = [_cat(cp, weight=v1_weights[cp]) for cp in DIVISIONS_V2[:12]]
    with pytest.raises(ValidationError, match="chain reconciliation"):
        validate_chain_reconciliation(
            categories=cats,
            total_index_by_period=index["CP00"],
            division_index_by_period=index,
            ref_period="2026-06",
            weights_year="2026",
        )


def test_chain_reconciliation_rejects_a_stale_weights_vintage():
    """HICP re-weights every January. Publishing 2026 rates against 2025
    weights is the same class of error as the cross-version join, and it has
    a real window every year between the January release and the February
    item-weights release."""
    index = _index_by_period(I15)
    with pytest.raises(ValidationError, match=r"2025 vintage|vintage"):
        validate_chain_reconciliation(
            categories=_real_divisions(_weights_pct(IW_V2)),
            total_index_by_period=index["CP00"],
            division_index_by_period=index,
            ref_period="2026-06",
            weights_year="2025",
        )


def test_chain_reconciliation_fails_when_a_division_is_dropped():
    """Drop CP13 and the weights stop summing to 100 — caught before the
    arithmetic even runs."""
    index = _index_by_period(I15)
    weights = _weights_pct(IW_V2)
    cats = [_cat(cp, weight=weights[cp]) for cp in DIVISIONS_V2[:12]]
    with pytest.raises(ValidationError, match="sum to"):
        validate_chain_reconciliation(
            categories=cats,
            total_index_by_period=index["CP00"],
            division_index_by_period=index,
            ref_period="2026-06",
            weights_year="2026",
        )


def test_chain_tolerance_is_the_documented_value():
    """If someone loosens the tight gate, this screams. 0.02 pp is not a
    guess — it is the observed 0.005 pp maximum deviation across every month
    of 2021-01…2026-06 plus headroom for index rounding."""
    assert CHAIN_TOLERANCE_PP == 0.02


# ---------------------------------------------------------------------------
# Gate 3 — basket-sum sanity
# ---------------------------------------------------------------------------


def test_basket_sum_passes_when_weighted_avg_matches_headline():
    validate_reconciliation(_uniform_cats(rate=5.0), headline_rate_pct=5.0)


def test_basket_sum_passes_within_the_methodological_gap():
    """Σ(w·r) is NOT an identity — the 12-month window straddles December's
    chain link. On correct BG data at 2026-06 it lands 0.16 pp above the
    headline. The band has to accommodate that or it fails on good data."""
    validate_reconciliation(_uniform_cats(rate=5.36), headline_rate_pct=5.2)


def test_basket_sum_fails_beyond_tolerance():
    with pytest.raises(ValidationError, match="basket sum"):
        validate_reconciliation(_uniform_cats(rate=5.0), headline_rate_pct=6.0)


def test_basket_sum_fails_when_weights_dont_sum_to_100():
    """Catch upstream basket restatements and dropped divisions."""
    cats = _uniform_cats(rate=5.0, weight=7.0)  # 13 × 7 = 91, not 100
    with pytest.raises(ValidationError, match="weights"):
        validate_reconciliation(cats, headline_rate_pct=5.0)


def test_basket_sum_with_mixed_rates_weighted_correctly():
    """Two rates, two weights — verify the math, not just the gate."""
    cats = [_cat("CP01", weight=70.0, rate=10.0), _cat("CP02", weight=30.0, rate=2.0)]
    validate_reconciliation(cats, headline_rate_pct=7.6)  # (70×10 + 30×2)/100
    with pytest.raises(ValidationError):
        validate_reconciliation(cats, headline_rate_pct=6.9)  # 0.7 pp gap


def test_basket_sum_tolerance_is_documented_value():
    assert BASKET_SUM_TOLERANCE_PP == 0.5


# ---------------------------------------------------------------------------
# Gate 4 — group consistency
# ---------------------------------------------------------------------------


def test_group_consistency_passes_when_children_sum_to_parent():
    cat = _cat(
        "CP07",
        weight=14.0,
        groups=[_group("CP071", "CP07", 4.0), _group("CP072", "CP07", 10.0)],
    )
    validate_group_consistency([cat])


def test_group_consistency_fails_when_children_dont_sum_to_parent():
    """If the groups didn't add up to their division, drilling into a division
    would silently resize it in the user's basket."""
    cat = _cat(
        "CP07",
        weight=14.0,
        groups=[_group("CP071", "CP07", 4.0), _group("CP072", "CP07", 6.0)],
    )
    with pytest.raises(ValidationError, match="CP07"):
        validate_group_consistency([cat])


def test_group_consistency_fails_on_an_empty_division():
    """A division with no groups renders a dead 'expand' affordance."""
    with pytest.raises(ValidationError, match="no groups"):
        validate_group_consistency([_cat("CP07", weight=14.0, groups=[])])


def test_group_consistency_fails_on_a_misparented_group():
    cat = _cat("CP07", weight=14.0, groups=[_group("CP071", "CP04", 14.0)])
    with pytest.raises(ValidationError, match="parent"):
        validate_group_consistency([cat])


# ---------------------------------------------------------------------------
# Gate 5 — coverage
# ---------------------------------------------------------------------------


def test_coverage_passes_when_all_years_present():
    years = (2020, 2021, 2022, 2023, 2024, 2025, 2026)
    validate_coverage([_cat(cp, years=years) for cp in DIVISIONS_V2], years=list(years))


def test_coverage_fails_when_a_year_missing():
    cats = [_cat("CP01", years=(2020, 2026)), _cat("CP02", years=tuple(range(2020, 2027)))]
    with pytest.raises(ValidationError, match="coverage"):
        validate_coverage(cats, years=list(range(2020, 2027)))


def test_coverage_names_the_category_and_the_missing_years():
    """A failed refresh must say WHICH category and WHICH years, or it's an
    unactionable message at 2am."""
    cats = [_cat("CP01", years=(2020, 2021, 2026)), _cat("CP07", years=(2020, 2026))]
    with pytest.raises(ValidationError) as exc:
        validate_coverage(cats, years=[2020, 2021, 2026])
    assert "CP07" in str(exc.value)
    assert "2021" in str(exc.value)


def test_coverage_also_checks_groups():
    """The detailed mode offers the same 'since year Y' anchors as the
    division view, so a group with a hole in its index is just as broken."""
    thin_group = _group("CP071", "CP07", 100.0 / 13, years=(2020, 2026))
    cat = _cat("CP07", years=(2020, 2021, 2026), groups=[thin_group])
    with pytest.raises(ValidationError, match="CP071"):
        validate_coverage([cat], years=[2020, 2021, 2026])


def test_coverage_checks_the_DIVISION_series_and_not_only_its_groups():
    """The division branch needs a test of its own.

    Every other coverage test builds its categories through `_cat`, which
    attaches one group carrying the SAME year set — so the group loop fires
    first and satisfies the assertion, and the division-level check could be
    replaced with `missing = []` while the whole suite stayed green.

    A division whose own series has a hole while its groups are complete is
    the realistic shape of this: the SPA's division rows and its drill-down
    rows read different published series.
    """
    holed = _cat("CP01", years=(2020, 2026), groups=[])
    with pytest.raises(ValidationError, match="CP01"):
        validate_coverage([holed], years=[2020, 2021, 2026])


def test_coverage_requires_the_caller_to_name_the_year_window():
    """`years` is not optional, and that is the fix rather than the omission.

    This replaces `test_coverage_defaults_to_2020_through_2026`, which pinned a
    hardcoded `range(2020, 2027)` default. That default demanded the current
    year while `rows_to_yearly_index` deliberately drops it until December is
    published, so it raised on correct data for most of any given year — and
    the test's own name would have needed editing every January to stay true.
    The gate is unchanged for every real caller: `cli.py` has always passed the
    completed-year window explicitly.
    """
    with pytest.raises(TypeError):
        validate_coverage([_cat("CP01", years=(2020, 2026))])  # type: ignore[call-arg]

    # And the gate still catches a hole when the window IS named.
    with pytest.raises(ValidationError, match="coverage"):
        validate_coverage([_cat("CP01", years=(2020, 2026))], years=list(range(2020, 2027)))
    full = tuple(range(2020, 2027))
    validate_coverage([_cat("CP01", years=full, groups=[])], years=list(full))


# ---------------------------------------------------------------------------
# Gate 6 — link status
# ---------------------------------------------------------------------------


@respx.mock
def test_link_status_passes_when_body_looks_like_eurostat():
    url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18=CP01"
    respx.get(url).mock(
        return_value=httpx.Response(200, json={"version": "2.0", "dimension": {}, "value": {}})
    )

    def predicate(payload: dict) -> bool:
        return "dimension" in payload and "value" in payload

    validate_link_status([url], predicate, timeout=5)


@respx.mock
def test_link_status_fails_on_200_with_error_payload():
    """Eurostat returns 200 with an error payload on rate-limit / invalid params.
    A naive 200-check would pass this; the body predicate catches it."""
    url = "https://example.com/cp01"
    respx.get(url).mock(return_value=httpx.Response(200, json={"error": "rate limited"}))

    def predicate(payload: dict) -> bool:
        return "dimension" in payload

    with pytest.raises(ValidationError, match="body"):
        validate_link_status([url], predicate, timeout=5)


@respx.mock
def test_link_status_fails_on_non_2xx():
    url = "https://example.com/cp01"
    respx.get(url).mock(return_value=httpx.Response(404, text="not found"))

    def predicate(payload: dict) -> bool:
        return True

    with pytest.raises(ValidationError, match="404"):
        validate_link_status([url], predicate, timeout=5)


@respx.mock
def test_link_status_fails_on_non_json_body():
    url = "https://example.com/cp01"
    respx.get(url).mock(return_value=httpx.Response(200, text="<html>oops</html>"))

    def predicate(payload: dict) -> bool:
        return True

    with pytest.raises(ValidationError, match="JSON"):
        validate_link_status([url], predicate, timeout=5)
