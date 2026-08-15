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
from vyarno_pipeline.payroll import EMPLOYER_RATE_DERIVATION
from vyarno_pipeline.sources.eurostat import _cube_labels, _cube_to_rows
from vyarno_pipeline.validate import (
    BASKET_SUM_TOLERANCE_PP,
    CHAIN_TOLERANCE_PP,
    GROUP_SUM_TOLERANCE_PCT,
    ValidationError,
    validate_chain_reconciliation,
    validate_city_price,
    validate_classification_agreement,
    validate_coverage,
    validate_group_consistency,
    validate_headline_flash,
    validate_link_status,
    validate_meta_labels_cover,
    validate_payroll,
    validate_reconciliation,
    validate_sector_salary,
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
        annual_rate_pct=rate,
        ref_period="2026-06",
        index_base_year=2015,
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
        index_base_year=2015,
        index_by_year=yearly,
        latest_index={"time": f"{last_year}-12", "value": yearly[last_year]},
        ref_period="2026-12",
        published_at=date(2026, 12, 31),
        unit="index_2015=100",
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


def test_classification_agreement_catches_a_division_the_RATES_cube_lacks():
    """The rates half of the paired code check.

    The ver.1 fixture above is short of CP13 on the WEIGHTS side, so both
    directions of the pair fail it and either list comprehension reading
    `weight_labels` passes that case. A code the weights cube publishes and the
    rates cube does not is the other failure, and it is the worse one: the
    division renders with a real weight against a rate from nowhere. The
    message must name the side, because the fix differs by side — a missing
    weight is a retired code, a missing rate is a cube on a different version.
    """
    rate_labels = dict(_labels(RCH))
    del rate_labels["CP13"]
    with pytest.raises(ValidationError) as exc:
        validate_classification_agreement(
            codes=DIVISIONS_V2,
            weight_labels=_labels(IW_V2),
            rate_labels=rate_labels,
            weights_dim="coicop18",
            rates_dim="coicop18",
        )
    msg = str(exc.value)
    assert "missing from rates: ['CP13']" in msg
    assert "missing from weights: none" in msg


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


def test_group_consistency_fails_on_a_group_code_from_another_division():
    """The child-code check, isolated from the parent check above it.

    `parent_cp_code` is CP07 and correct, so the guard that fires first here
    does not; what is wrong is the code itself. Both `api_url`s a group carries
    are built from `cp_code`, so a CP08 group filed under CP07 draws CP07's
    drill-down from CP08's series and links a reader to the cube that disagrees
    with the row above it.
    """
    cat = _cat("CP07", weight=14.0, groups=[_group("CP081", "CP07", 14.0)])
    with pytest.raises(ValidationError, match="not a child code"):
        validate_group_consistency([cat])


def test_group_sum_tolerance_is_the_documented_value():
    """0.02 pp is Eurostat's own rounding and nothing else — they publish
    per-thousand weights to two decimals, so thirteen divisions' worth of
    children can miss by a couple of hundredths of a per-mille and no more."""
    assert GROUP_SUM_TOLERANCE_PCT == 0.02


def test_the_group_sum_band_admits_eurostats_rounding_and_nothing_wider():
    """The band itself, either side of the line.

    A division whose groups miss it by whole points is not the failure this
    tolerance is sized for — that one trips any band. What it has to catch is a
    single group reweighted upstream while its siblings kept their vintage,
    which lands a few hundredths out: the SPA's detailed mode re-splits the
    division across exactly these children, so the drill-down would resize the
    division under the reader without changing a figure on the summary row.
    """
    within = _cat(
        "CP07",
        weight=14.0,
        groups=[_group("CP071", "CP07", 4.0), _group("CP072", "CP07", 9.99)],
    )
    validate_group_consistency([within])

    outside = _cat(
        "CP07",
        weight=14.0,
        groups=[_group("CP071", "CP07", 4.0), _group("CP072", "CP07", 9.97)],
    )
    with pytest.raises(ValidationError, match="groups sum to"):
        validate_group_consistency([outside])


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


# ---------------------------------------------------------------------------
# Gate 7 — the flash marker
# ---------------------------------------------------------------------------


def test_flash_marker_accepts_a_flash_whose_index_is_a_month_behind():
    validate_headline_flash(ref_period="2026-07", latest_index_time="2026-06", flash=True)


def test_flash_marker_accepts_a_full_release_at_one_month():
    validate_headline_flash(ref_period="2026-06", latest_index_time="2026-06", flash=False)


def test_flash_marker_rejects_an_unmarked_flash():
    """The failure the reader meets: an early estimate rendered as settled."""
    with pytest.raises(ValidationError) as e:
        validate_headline_flash(ref_period="2026-07", latest_index_time="2026-06", flash=False)
    assert "is_flash is not set" in str(e.value)


def test_flash_marker_rejects_a_marked_full_release():
    """The other direction: hedging a figure Eurostat has finalised."""
    with pytest.raises(ValidationError) as e:
        validate_headline_flash(ref_period="2026-06", latest_index_time="2026-06", flash=True)
    assert "full release" in str(e.value)


def test_flash_marker_rejects_an_index_ahead_of_the_rate():
    """Not a release shape at all — Eurostat never publish the index first."""
    with pytest.raises(ValidationError):
        validate_headline_flash(ref_period="2026-06", latest_index_time="2026-07", flash=True)


@pytest.mark.parametrize("ref,idx", [("", "2026-06"), ("2026-07", "")])
def test_flash_marker_rejects_a_payload_missing_either_month(ref: str, idx: str):
    """A marker nothing can be checked against is one nobody should trust."""
    with pytest.raises(ValidationError):
        validate_headline_flash(ref_period=ref, latest_index_time=idx, flash=True)


# ---------------------------------------------------------------------------
# Gate 8 — the by-sector wage payload (НСИ, Labour_1.1.2.1)
# ---------------------------------------------------------------------------


def _sector_rows() -> list[dict]:
    """Two activities, each carrying two published quarters."""
    return [
        {
            "en_name": "Total",
            "bg_name": "Общо",
            "value_eur": 1407.0,
            "series_by_period": {"2025-Q4": 1294.0, "2026-Q1": 1407.0},
        },
        {
            "en_name": "Information and communication",
            "bg_name": "Създаване и разпространение на информация",
            "value_eur": 3176.0,
            "series_by_period": {"2025-Q4": 2934.0, "2026-Q1": 3176.0},
        },
    ]


def test_sector_gate_accepts_a_payload_of_published_cells():
    validate_sector_salary(_sector_rows(), "2026-Q1")


def test_sector_gate_rejects_a_headline_it_computed():
    """The check the gate exists for, and the only one nothing on screen shows.

    §2.1.1 of НСИ's terms forbids distributing производни произведения, so a
    headline this pipeline calculated rather than read is a licence breach that
    looks exactly like a correct number. The mean of the two published quarters
    is 3055 — a plausible wage, inside the sanity band, and not a cell НСИ ever
    printed.
    """
    rows = _sector_rows()
    series = rows[1]["series_by_period"]
    rows[1]["value_eur"] = sum(series.values()) / len(series)

    with pytest.raises(ValidationError, match="must BE the published cell"):
        validate_sector_salary(rows, "2026-Q1")


def test_sector_gate_rejects_a_headline_rounded_off_the_published_cell():
    """The identity is an identity, and 0.4 EUR is already a breach.

    The mean-of-two-quarters case above is 121 EUR from the cell, so it trips
    any band anybody might put here. This is the failure that a band would let
    through: НСИ print 3175.6 and the payload headlines 3176 — a rounding that
    reads as a tidier number and is a производно произведение under §2.1.1 all
    the same. Nothing in this path rounds, so there is no width the check can
    afford.
    """
    rows = _sector_rows()
    rows[1]["series_by_period"]["2026-Q1"] = 3175.6
    rows[1]["value_eur"] = 3176.0

    with pytest.raises(ValidationError, match="must BE the published cell"):
        validate_sector_salary(rows, "2026-Q1")


def test_sector_gate_rejects_a_missing_label_in_either_language():
    """A blank label renders the picker option as a blank line, not a fallback."""
    for field in ("en_name", "bg_name"):
        rows = _sector_rows()
        rows[1][field] = ""
        with pytest.raises(ValidationError, match="missing a name"):
            validate_sector_salary(rows, "2026-Q1")


def test_sector_gate_rejects_two_rows_resolving_to_one_activity():
    """Either language on its own is enough to lose a section.

    The two editions are paired by position, so a section can collide in one
    edition and stay distinct in the other — which is exactly the read that
    drifted by a row on one side. The picker is rendered from `bg_name` for a
    Bulgarian reader, so a duplicate there costs the same section it would in
    English, and no English name has to repeat for it to happen.
    """
    for field in ("en_name", "bg_name"):
        rows = _sector_rows()
        rows[1][field] = rows[0][field]
        with pytest.raises(ValidationError, match="duplicate activity"):
            validate_sector_salary(rows, "2026-Q1")


def test_sector_gate_rejects_an_activity_missing_the_reference_quarter():
    """`ref_period` has to be true of the whole table, not part of it."""
    rows = _sector_rows()
    del rows[1]["series_by_period"]["2026-Q1"]
    with pytest.raises(ValidationError, match="no value at the payload"):
        validate_sector_salary(rows, "2026-Q1")


@pytest.mark.parametrize("misparse", [104.3, 116_492.0])
def test_sector_gate_rejects_a_figure_that_is_not_a_monthly_wage(misparse: float):
    """Both ends of the band, because the two catch different columns.

    Labour_1.1.2.1 puts an index number (104.3, the previous year = 100) and a
    headcount (116 492 employees) on the same sheet as the wage, and a column
    index off by one lands on whichever is beside the one we meant. The floor
    catches the index, the ceiling catches the headcount, and a gate holding
    only one side is a gate for one direction of the same off-by-one.

    Widening either is never the fix — every failure the band is written for
    puts the parse on a column that is not a wage, and none of those look wrong
    on screen.
    """
    rows = _sector_rows()
    rows[1]["series_by_period"]["2025-Q4"] = misparse
    rows[1]["value_eur"] = rows[1]["series_by_period"]["2026-Q1"]
    with pytest.raises(ValidationError, match="not a monthly wage"):
        validate_sector_salary(rows, "2026-Q1")


def test_sector_gate_rejects_an_empty_table():
    with pytest.raises(ValidationError, match="no activities parsed"):
        validate_sector_salary([], "2026-Q1")


# ---------------------------------------------------------------------------
# The per-city price gate — имот.bg, sredni-ceni
# ---------------------------------------------------------------------------
#
# Every case below is a payload that is internally consistent and would render
# without a mark on it. That is the whole reason the gate exists: the
# connector's guards cover each PAGE, and what is left is the file — a median
# that cannot have come from the rows under it, a series with a hole in it, a
# headline percentage that disagrees with the chart it heads.

_COVERED = ["varna", "vidin", "sofiya"]


def _city(code="varna", **over):
    """One `city_price.json` city block, valid unless a case breaks it."""
    history = [
        {
            "year": 2022,
            "n_districts": 60,
            "n_dropped": 0,
            "eur_per_m2_median": 1000.0,
            "eur_per_m2_mean": 1020.0,
            "since_baseline_median_pct": 0.0,
        },
        {
            "year": 2023,
            "n_districts": 62,
            "n_dropped": 0,
            "eur_per_m2_median": 1100.0,
            "eur_per_m2_mean": 1120.0,
            "since_baseline_median_pct": 10.0,
        },
        {
            "year": 2024,
            "n_districts": 65,
            "n_dropped": 0,
            "eur_per_m2_median": 1250.0,
            "eur_per_m2_mean": 1270.0,
            "since_baseline_median_pct": 25.0,
        },
    ]
    row = {
        "code": code,
        "bg_name": "Варна",
        "en_name": "Varna",
        "source_url": "https://www.imot.bg/sredni-ceni/prodazhbi-varna",
        "snapshot_date": "15.07.2026",
        "n_districts": 65,
        "n_dropped": 0,
        "eur_per_m2_median": 1250.0,
        "eur_per_m2_mean": 1270.0,
        "eur_per_m2_min": 700.0,
        "eur_per_m2_max": 2400.0,
        "baseline_year": 2022,
        "since_baseline_median_pct": 25.0,
        "trend_publishable": False,
        "historical": history,
    }
    row.update(over)
    return row


def test_city_gate_passes_a_well_formed_payload():
    validate_city_price([_city(), _city("vidin", bg_name="Видин", en_name="Vidin")], _COVERED)


def test_city_gate_rejects_an_empty_read():
    with pytest.raises(ValidationError, match="no city was read"):
        validate_city_price([], _COVERED)


def test_city_gate_rejects_a_code_no_region_covers():
    """The join to `region_salary.json` is by code, so a code with no wage
    beside it renders a price under a place the reader cannot be told the wage
    for — and there is no screen on which that looks wrong."""
    with pytest.raises(ValidationError, match="not one of the"):
        validate_city_price([_city("plovdiv")], _COVERED)


def test_city_gate_rejects_the_same_city_twice():
    with pytest.raises(ValidationError, match="appears twice"):
        validate_city_price([_city(), _city()], _COVERED)


def test_city_gate_rejects_a_city_missing_a_name_in_one_language():
    """A missing string renders as a blank line in the picker, not a fallback."""
    with pytest.raises(ValidationError, match="missing a name"):
        validate_city_price([_city(bg_name="")], _COVERED)


def test_city_gate_rejects_a_median_outside_the_per_district_bounds():
    """Every row that built it had to clear [100, 10000] €/m², so a median
    outside them cannot have come from rows inside them — which means the
    summary is not describing the parse it claims to."""
    for median in (12.5, 40000.0):
        with pytest.raises(ValidationError, match="outside the per-district sanity bounds"):
            validate_city_price([_city(eur_per_m2_median=median)], _COVERED)


def test_city_gate_rejects_a_median_outside_its_own_range():
    """min ≤ median ≤ max is arithmetic, not taste. A median above its own max
    is a summary computed over a different set of rows from the one beside it,
    and both figures are plausible €/m² on their own."""
    with pytest.raises(ValidationError, match=r"outside\s+its own min-max range"):
        validate_city_price([_city(eur_per_m2_max=1000.0)], _COVERED)


def test_city_gate_rejects_years_out_of_order_or_repeated():
    out_of_order = _city()
    out_of_order["historical"] = list(reversed(out_of_order["historical"]))
    with pytest.raises(ValidationError, match="years out of order"):
        validate_city_price([out_of_order], _COVERED)

    repeated = _city()
    repeated["historical"] = repeated["historical"] + [dict(repeated["historical"][-1])]
    with pytest.raises(ValidationError, match="publishes a year twice"):
        validate_city_price([repeated], _COVERED)


def test_city_gate_rejects_a_gap_in_the_published_years():
    """**The since-baseline percentage spans the whole range**, so a hole in it
    compares two coverage eras as one series. имот.bg's per-city coverage grew
    over two decades and a thin year is not the same measurement as a full one
    — `qualifying_years` walks the run backwards from the present for exactly
    this reason, and this is the gate that catches it having been bypassed."""
    gapped = _city()
    gapped["historical"] = [gapped["historical"][0], gapped["historical"][2]]
    gapped["historical"][-1]["since_baseline_median_pct"] = 25.0
    with pytest.raises(ValidationError, match="gap in its published years"):
        validate_city_price([gapped], _COVERED)


def test_city_gate_rejects_a_baseline_year_that_is_not_the_oldest_published():
    """`.at(-1)` against `[0]` is a one-character difference between the rise
    since the baseline and the baseline level itself, and the SPA prints the
    year beside the percentage."""
    with pytest.raises(ValidationError, match="as its baseline but its oldest"):
        validate_city_price([_city(baseline_year=2023)], _COVERED)


def test_city_gate_rejects_a_non_zero_change_at_the_baseline_itself():
    """A series measured from somewhere other than the year it says it is."""
    moved = _city()
    moved["historical"][0]["since_baseline_median_pct"] = 4.0
    with pytest.raises(ValidationError, match="non-zero change at its own"):
        validate_city_price([moved], _COVERED)


def test_city_gate_rejects_a_headline_the_chart_disagrees_with():
    """The card prints the headline and draws the series under it. Two figures
    about the same city, from the same file, and only one of them can be right."""
    with pytest.raises(ValidationError, match="not its newest published year"):
        validate_city_price([_city(since_baseline_median_pct=31.0)], _COVERED)


def test_city_gate_admits_a_city_with_no_history_at_all():
    """имот.bg cover some cities from this year only, and a current €/m² with
    no trend behind it is a complete answer rather than a broken one."""
    validate_city_price(
        [_city(historical=[], baseline_year=0, since_baseline_median_pct=0.0)], _COVERED
    )


# ---------------------------------------------------------------------------
# The payroll payload — the employer half and its ТЗПБ block
# ---------------------------------------------------------------------------


def _payroll(**over) -> dict:
    """A payroll payload that passes, so each test below breaks exactly one thing."""
    payload = {
        "employer_contrib_rates": {
            "pension": 0.0822,
            "pension2": 0.028,
            "sickness_maternity": 0.021,
            "unemployment": 0.006,
            "health": 0.048,
            "total": 0.1852,
        },
        "work_accident": {
            "min": 0.004,
            "max": 0.011,
            "by_nsi_section": {"Construction": {"min": 0.011, "max": 0.011}},
        },
    }
    payload.update(over)
    return payload


def test_a_payroll_payload_with_no_tzpb_block_is_refused() -> None:
    """A missing accident rate does not read as zero — it reads as finished."""
    with pytest.raises(ValidationError, match="no `work_accident` block"):
        validate_payroll(_payroll(work_accident=None))


def test_a_tzpb_span_outside_the_code_is_refused() -> None:
    """КСО чл. 6, ал. 1, т. 7 bounds what ЗБДОО may set, so this cannot widen."""
    with pytest.raises(ValidationError, match="outside КСО"):
        validate_payroll(_payroll(work_accident={**_payroll()["work_accident"], "max": 0.048}))


def test_a_section_range_wider_than_the_act_is_refused() -> None:
    """A section's range is a selection from the appendix and cannot exceed it."""
    wa = {**_payroll()["work_accident"], "by_nsi_section": {"X": {"min": 0.002, "max": 0.011}}}
    with pytest.raises(ValidationError, match="not inside the act's own"):
        validate_payroll(_payroll(work_accident=wa))


def test_a_payload_with_no_section_ranges_is_refused() -> None:
    """Every reader would silently fall back to the whole 0,4–1,1 span."""
    wa = {**_payroll()["work_accident"], "by_nsi_section": {}}
    with pytest.raises(ValidationError, match="`by_nsi_section` is empty"):
        validate_payroll(_payroll(work_accident=wa))


def test_employer_lines_that_do_not_sum_to_their_total_are_refused() -> None:
    rates = {**_payroll()["employer_contrib_rates"], "health": 0.05}
    with pytest.raises(ValidationError, match="sum to"):
        validate_payroll(_payroll(employer_contrib_rates=rates))


def test_an_employer_total_that_has_absorbed_tzpb_is_refused() -> None:
    """The two are published apart because ТЗПБ is a range, not a rate.

    Folding the floor in is right for the sectors sitting at 0,4% and wrong for
    every other one, under a total that claims to be the whole employer cost.
    """
    rates = {**_payroll()["employer_contrib_rates"], "unemployment": 0.01, "total": 0.1892}
    with pytest.raises(ValidationError, match="is published at"):
        validate_payroll(_payroll(employer_contrib_rates=rates))
    # The same amount as a sixth key, which is the other shape the edit takes.
    keyed = {**_payroll()["employer_contrib_rates"], "work_accident": 0.004, "total": 0.1892}
    with pytest.raises(ValidationError, match="keyed"):
        validate_payroll(_payroll(employer_contrib_rates=keyed))


def test_parliament_raising_a_fund_is_not_read_as_a_folded_accident_rate(monkeypatch) -> None:
    """The gate above may not fire on a legislative change.

    An employer total higher than today's is what a fund being raised looks
    like, and ЗБДОО 2026's own draft proposed exactly that — фонд „Пенсии“ from
    14,8% to 16,8%. A gate written as a ceiling on the sum cannot tell that
    apart from ТЗПБ folded in, and would have stopped the publish naming the
    appendix, which would have been the one thing not wrong.

    So the question asked is whether each line equals the statute beside it.
    Move the derivation and the payload together — which is what a transcribed
    rate change IS — and this passes at any level.
    """
    raised = {**EMPLOYER_RATE_DERIVATION["pension"], "employer_parts": (7.1, 0.56, 0.56, 2.0)}
    monkeypatch.setitem(EMPLOYER_RATE_DERIVATION, "pension", raised)
    rates = {**_payroll()["employer_contrib_rates"], "pension": 0.1022, "total": 0.2052}
    validate_payroll(_payroll(employer_contrib_rates=rates))


def test_the_shipped_payroll_payload_passes_its_own_gate() -> None:
    published = json.loads(
        (Path(__file__).resolve().parents[2] / "data" / "published" / "payroll.json").read_text(
            encoding="utf-8"
        )
    )
    validate_payroll(published)
