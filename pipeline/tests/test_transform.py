"""Tests for transforms between Eurostat cube rows and our observation models."""

import re
from datetime import date

import pytest

from vyarno_pipeline.sources.eurostat import CP_DIVISIONS, HicpCube
from vyarno_pipeline.transform import (
    COICOP_META,
    MissingSeriesError,
    index_years_from_2020,
    latest_monthly_index,
    rows_to_category_observations,
    rows_to_yearly_index,
)

# The two index units `prc_hicp_minr` publishes, and the year each one sets to
# 100. Eurostat's fact, written out here — a test that asked the module under
# test what its own base year is agrees with any answer it gives.
BASE_YEAR_OF_INDEX_UNIT = {"I15": 2015, "I25": 2025}


def test_coicop_metadata_covers_every_ver2_division():
    """All 13 ECOICOP ver.2 divisions have friendly names.

    Ver.1 stopped at CP12 'Miscellaneous goods and services'. Ver.2 splits it
    into CP12 Insurance & financial services and CP13 Personal care, social
    protection & misc. A COICOP_META that still stops at CP12 means CP13 has
    no name — and (before the transform learned to raise) meant it was
    silently dropped from the basket.
    """
    assert set(CP_DIVISIONS) <= set(COICOP_META)
    assert "CP13" in COICOP_META
    for cp, entry in COICOP_META.items():
        assert len(entry) == 2, f"{cp} entry should be (bg_name, en_name)"
        bg_name, en_name = entry
        assert bg_name and en_name, f"{cp} names must be non-empty"


def test_coicop_metadata_names_cp12_as_insurance_not_everything_else():
    """Our friendly name must describe the ver.2 bucket, not the ver.1 one.

    Under ECOICOP ver.1 CP12 was the catch-all ("Всичко останало / Everything
    else"). Under ver.2 the same code means insurance and financial services —
    1.4% of the basket, not 5.9% — and the catch-all content is CP13. A
    friendly name carried over from ver.1 puts an honest-looking label on the
    wrong bucket.
    """
    bg, en = COICOP_META["CP12"]
    assert "остана" not in bg and "else" not in en.lower()
    assert "застрахов" in bg.lower() or "insurance" in en.lower()


def test_coicop_metadata_covers_every_group_of_every_division():
    """Every group name belongs to a division we publish. A group whose
    parent isn't in CP_DIVISIONS is either a typo or a stale ver.1 code."""
    groups = [c for c in COICOP_META if len(c) == 5]
    assert len(groups) >= 40, "the detailed mode needs level-2 names"
    for g in groups:
        assert g[:4] in CP_DIVISIONS, f"{g} has no published parent division"


def test_index_years_from_2020_leaves_every_value_untouched():
    """Eurostat's values reach the payload as they came, at their own base.

    The temptation is to divide through so the anchor year reads a round 100.
    It would move nothing a reader sees — every published figure is a ratio of
    two of these — and it would make each of them a modified figure under
    Eurostat's copyright notice, needing a disclaimer at the number. So the
    thing to protect is that this function does no arithmetic at all.
    """
    src = {2020: 95.0, 2026: 130.0}
    out = index_years_from_2020(src)
    assert out == src
    assert out[2020] == 95.0, "an anchor year rescaled to 100 is a modified figure"


def test_index_years_from_2020_drops_years_the_anchor_selector_cannot_reach():
    """Pre-2020 years are unreachable in the UI, so publishing them is dead weight."""
    src = {2018: 80.0, 2019: 90.0, 2020: 100.0, 2021: 104.0}
    out = index_years_from_2020(src)
    assert set(out) == {2020, 2021}
    assert out[2021] == 104.0


def test_index_years_from_2020_raises_when_2020_missing():
    """The savings card divides by 2020; a series without it renders a blank card.

    Raising here is the difference between a refresh that fails and a page that
    quietly stops answering its own question.
    """
    with pytest.raises(ValueError, match="2020"):
        index_years_from_2020({2019: 90.0, 2021: 110.0})


def test_rows_to_yearly_index_picks_december_when_present():
    """Year-end index is December when December is present in the upstream series."""
    rows = [
        {"time": "2025-06", "value": 100.0},
        {"time": "2025-12", "value": 105.0},
        {"time": "2026-06", "value": 108.0},
        {"time": "2026-12", "value": 112.0},
    ]
    out = rows_to_yearly_index(rows)
    assert out == {2025: 105.0, 2026: 112.0}


def test_rows_to_yearly_index_drops_partial_current_year():
    """A partial current year (months but no December yet) is dropped.

    This is the production case for the current year (e.g. mid-2026: we
    have Jan..Jun 2026 but no Dec 2026 yet). Storing the latest available
    month under the calendar-year key produces a year-end index that
    silently means 'June 2026', not 'end of 2026' — which then poisons
    every downstream consumer that assumes year-end semantics (rateFor's
    year-anchor comparisons, officialCumulativeSince2020, the basket chart,
    the dropdown labels). The honest contract: a year is in the index
    only if it's a completed year.
    """
    rows = [
        {"time": "2023-12", "value": 120.0},
        {"time": "2024-12", "value": 130.0},
        {"time": "2025-12", "value": 140.0},
        {"time": "2026-01", "value": 141.0},
        {"time": "2026-02", "value": 142.0},
        {"time": "2026-03", "value": 143.0},
    ]
    out = rows_to_yearly_index(rows)
    assert out == {2023: 120.0, 2024: 130.0, 2025: 140.0}  # 2026 dropped — no Dec yet


def test_rows_to_yearly_index_drops_a_historical_year_missing_december():
    """A year that never gets a December is dropped, not back-filled.

    Not only the current year: an upstream gap, or a division whose first
    observation lands mid-year, would otherwise be stored under a
    calendar-year key that means something other than "end of year".
    """
    rows = [
        {"time": "2024-12", "value": 130.0},
        {"time": "2025-06", "value": 135.0},  # 2025 never completes
        {"time": "2025-09", "value": 137.0},
        {"time": "2026-12", "value": 150.0},
    ]
    out = rows_to_yearly_index(rows)
    assert out == {2024: 130.0, 2026: 150.0}


def test_latest_monthly_index_returns_most_recent_row():
    """The freshness field: from a flat list of monthly rows, return
    the most recent by `time`, regardless of whether December is in
    the series. This is the value used downstream for "your basket
    is up X% since anchor" — it has to be fresh (the latest month
    Eurostat has published) even when the rate is stale.
    """
    rows = [
        {"time": "2023-12", "value": 120.0},
        {"time": "2024-12", "value": 130.0},
        {"time": "2025-12", "value": 140.0},
        {"time": "2026-01", "value": 141.0},
        {"time": "2026-02", "value": 142.0},
        {"time": "2026-03", "value": 143.0},
    ]
    out = latest_monthly_index(rows)
    assert out == {"time": "2026-03", "value": 143.0}


def test_latest_monthly_index_works_when_only_year_end_data():
    """When the upstream has no partial-year data (e.g. a January
    pipeline run before any month of the new year is published), the
    function still returns the most recent December reading."""
    rows = [
        {"time": "2023-12", "value": 120.0},
        {"time": "2024-12", "value": 130.0},
        {"time": "2025-12", "value": 140.0},
    ]
    out = latest_monthly_index(rows)
    assert out == {"time": "2025-12", "value": 140.0}


def test_latest_monthly_index_returns_none_for_empty_input():
    """Defends against an upstream bug returning 0 rows."""
    assert latest_monthly_index([]) is None


def test_latest_monthly_index_handles_unsorted_input():
    """The upstream may return rows in any order; sort by time."""
    rows = [
        {"time": "2026-02", "value": 142.0},
        {"time": "2025-12", "value": 140.0},
        {"time": "2026-01", "value": 141.0},
    ]
    out = latest_monthly_index(rows)
    assert out == {"time": "2026-02", "value": 142.0}


# ---------------------------------------------------------------------------
# rows_to_category_observations — the division + group builder
# ---------------------------------------------------------------------------
#
# The builder takes two `HicpCube`s (index, rates) plus a weights dict. All
# three are ECOICOP ver.2, so a code's weight, rate, index and label describe
# the same bucket — the property the whole basket rests on.


def _cube(rows, labels=None, dataset="prc_hicp_minr"):
    """A minimal HicpCube around hand-written rows."""
    codes = {r["coicop"] for r in rows}
    return HicpCube(
        rows=rows,
        labels=labels or {c: f"Label {c}" for c in codes},
        dataset=dataset,
        dim="coicop18",
    )


def _full_index_rows(code, base=100.0, step=1.05, latest=("2026-06", None)):
    """Year-end index rows 2020-12…2025-12 plus one fresher month."""
    rows = [
        {"coicop": code, "time": f"{y}-12", "value": base * step ** (y - 2020)}
        for y in range(2020, 2026)
    ]
    t, v = latest
    rows.append({"coicop": code, "time": t, "value": v if v is not None else base * step**6})
    return rows


def _all_division_inputs(rate=5.0):
    """Index + rate rows + weights covering all 13 divisions, no groups."""
    index_rows, rate_rows, weights = [], [], {}
    for cp in CP_DIVISIONS:
        index_rows += _full_index_rows(cp)
        rate_rows.append({"coicop": cp, "time": "2026-06", "value": rate})
        weights[cp] = 100.0 / len(CP_DIVISIONS)
    return index_rows, rate_rows, weights


def test_builder_produces_all_thirteen_divisions():
    """The headline count. 12 would mean CP13 vanished — 4.4% of BG's basket
    and its second-fastest-rising group."""
    index_rows, rate_rows, weights = _all_division_inputs()
    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows),
        weights,
        as_of=date(2026, 7, 1),
    )
    assert list(cats) == CP_DIVISIONS
    assert len(cats) == 13


def test_annual_rate_is_verbatim_from_rch_a_at_the_latest_month():
    """The rate is Eurostat's published figure at the latest month, never
    derived from the index."""
    index_rows = _full_index_rows("CP01")
    rate_rows = [
        {"coicop": "CP01", "time": "2026-05", "value": 8.0},
        {"coicop": "CP01", "time": "2026-06", "value": 10.0},  # latest wins
    ]
    _, _all_rates, weights = _all_division_inputs()
    for cp in CP_DIVISIONS[1:]:
        index_rows += _full_index_rows(cp)
        rate_rows.append({"coicop": cp, "time": "2026-06", "value": 3.0})

    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows),
        weights,
        as_of=date(2026, 7, 1),
    )
    cp01 = cats["CP01"]
    assert cp01.annual_rate_pct == pytest.approx(10.0)
    assert cp01.ref_period == "2026-06"
    assert cp01.weight_pct == pytest.approx(100.0 / 13)
    # Provenance names BOTH ver.2 cubes — a regression to the archived ver.1
    # weights cube would show up right here in the published JSON.
    assert cp01.dataset == "prc_hicp_minr+prc_hicp_iw"


def test_observation_carries_the_upstream_label():
    """`eurostat_label` is the cube's own name for the code — the evidence a
    reader can check our friendly label against."""
    index_rows, rate_rows, weights = _all_division_inputs()
    labels = {cp: f"Label {cp}" for cp in CP_DIVISIONS}
    labels["CP12"] = "Insurance and financial services"
    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows, labels),
        weights,
        as_of=date(2026, 7, 1),
    )
    assert cats["CP12"].eurostat_label == "Insurance and financial services"


def test_latest_index_is_fresher_than_the_year_end_series():
    """`latest_index` is the freshest monthly reading; `index_by_year` is
    year-end only and drops the partial current year."""
    index_rows, rate_rows, weights = _all_division_inputs()
    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows),
        weights,
        as_of=date(2026, 7, 1),
    )
    cp01 = cats["CP01"]
    assert set(cp01.index_by_year) == set(range(2020, 2026))  # 2026 has no Dec yet
    assert cp01.latest_index["time"] == "2026-06"


def test_both_index_fields_reach_the_payload_at_the_cube_s_own_base():
    """REGRESSION GUARD for the base-mismatch bug.

    Every SPA consumer of a since-anchor cumulative divides
    `latest_index.value / index_by_year[anchor]` (rateFor(year),
    officialCumulativeSince2020, contributions), so the two fields have to sit
    on one base. Scaling either of them — most temptingly `index_by_year`, so
    the anchor year reads a round 100 — reports a cumulative wrong by the scale
    factor: food "up 85% since 2020" when the truth is 60%.

    The base here is 115.65, deliberately not 100, so a scaling step fails this
    test on the value it changes. A fixture on 100 would make one no-op and
    could not catch it.
    """
    index_rows = [
        {"coicop": "CP01", "time": "2020-12", "value": 115.65},  # anchor base ≠ 100
        {"coicop": "CP01", "time": "2021-12", "value": 130.0},
        {"coicop": "CP01", "time": "2022-12", "value": 150.0},
        {"coicop": "CP01", "time": "2023-12", "value": 160.0},
        {"coicop": "CP01", "time": "2024-12", "value": 172.14},
        {"coicop": "CP01", "time": "2025-12", "value": 182.45},
        {"coicop": "CP01", "time": "2026-06", "value": 184.98},  # latest
    ]
    rate_rows = [{"coicop": "CP01", "time": "2026-06", "value": 2.3}]
    weights = {"CP01": 21.966}
    for cp in CP_DIVISIONS[1:]:
        index_rows += _full_index_rows(cp)
        rate_rows.append({"coicop": cp, "time": "2026-06", "value": 3.0})
        weights[cp] = 6.5

    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows),
        weights,
        as_of=date(2026, 7, 1),
    )
    cp01 = cats["CP01"]
    assert cp01.index_by_year[2020] == 115.65, "the anchor reading was scaled on the way through"
    assert cp01.latest_index["value"] == 184.98, "the latest reading was scaled on the way through"
    since_2020 = 100 * (cp01.latest_index["value"] / cp01.index_by_year[2020] - 1)
    assert since_2020 == pytest.approx(59.95, abs=0.1)

    # The base and the unit are ONE fact, and the payload states it twice — once
    # as a year and once inside the link a reader clicks to check the level.
    # `prc_hicp_minr` publishes I15 and I25 and nothing between, so a base moved
    # without its unit ships index levels the I15 cube returned under a heading
    # saying 2025=100: every level on the page is then a third of what the
    # verify link answers, and not one ratio the site draws moves, so nothing
    # else here can go red. Compared against the mapping below rather than
    # against `INDEX_BASE_YEAR`, which is the half that would have moved.
    unit = re.search(r"[?&]unit=(I\d\d)", str(cp01.api_url_index)).group(1)
    assert BASE_YEAR_OF_INDEX_UNIT[unit] == cp01.index_base_year == 2015
    assert cp01.unit == "index_2015=100"


# ---- groups ---------------------------------------------------------------


def test_groups_are_nested_under_their_parent_carrying_the_basket_share():
    """The detailed mode's default split starts from `weight_pct` — Eurostat's
    own share of the WHOLE basket. The groups of a division sum to it, which is
    what lets the SPA normalise them against each other and land on the
    within-division shares without a second weight field to compute."""
    index_rows, rate_rows, weights = _all_division_inputs()
    weights["CP07"] = 100.0 / 13
    for code, w, r in (("CP071", 2.0, -0.4), ("CP072", 100.0 / 13 - 2.0, 17.3)):
        index_rows += _full_index_rows(code)
        rate_rows.append({"coicop": code, "time": "2026-06", "value": r})
        weights[code] = w

    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows),
        weights,
        as_of=date(2026, 7, 1),
        group_codes=["CP071", "CP072"],
    )
    cp07 = cats["CP07"]
    assert [g.cp_code for g in cp07.groups] == ["CP071", "CP072"]
    assert all(g.parent_cp_code == "CP07" for g in cp07.groups)
    assert sum(g.weight_pct for g in cp07.groups) == pytest.approx(cp07.weight_pct)
    assert not hasattr(cp07.groups[0], "weight_pct_of_parent"), (
        "a share-of-division field is `weight_pct` restated, and ours rather than Eurostat's"
    )
    assert cp07.groups[1].annual_rate_pct == pytest.approx(17.3)
    # Every other division still renders, just without groups this time.
    assert cats["CP01"].groups == []


def test_group_verify_links_point_at_the_groups_own_extract():
    """Every row — division or group — carries its own verify link. A group
    that linked to its parent's extract would send the user to a different
    number than the one on screen."""
    index_rows, rate_rows, weights = _all_division_inputs()
    index_rows += _full_index_rows("CP072")
    rate_rows.append({"coicop": "CP072", "time": "2026-06", "value": 17.3})
    weights["CP072"] = weights["CP07"]

    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows),
        weights,
        as_of=date(2026, 7, 1),
        group_codes=["CP072"],
    )
    g = cats["CP07"].groups[0]
    assert "coicop18=CP072" in str(g.api_url)
    assert "unit=RCH_A" in str(g.api_url)
    assert "coicop18=CP072" in str(g.api_url_index)
    assert "unit=I15" in str(g.api_url_index)


# ---- loud failures --------------------------------------------------------
#
# The builder RAISES rather than skipping. A silent `continue` is how CP13
# stayed invisible for six months: the count check downstream saw 12 of 12
# because the constant also said 12.


def test_builder_raises_when_a_division_has_no_rate():
    index_rows, rate_rows, weights = _all_division_inputs()
    rate_rows = [r for r in rate_rows if r["coicop"] != "CP13"]
    with pytest.raises(MissingSeriesError, match="CP13"):
        rows_to_category_observations(
            _cube(index_rows),
            _cube(rate_rows),
            weights,
            as_of=date(2026, 7, 1),
        )


def test_builder_raises_when_a_division_has_no_weight():
    index_rows, rate_rows, weights = _all_division_inputs()
    del weights["CP13"]
    with pytest.raises(MissingSeriesError, match="CP13"):
        rows_to_category_observations(
            _cube(index_rows),
            _cube(rate_rows),
            weights,
            as_of=date(2026, 7, 1),
        )


def test_builder_raises_when_a_division_has_no_index():
    index_rows, rate_rows, weights = _all_division_inputs()
    index_rows = [r for r in index_rows if r["coicop"] != "CP13"]
    with pytest.raises(MissingSeriesError, match="CP13"):
        rows_to_category_observations(
            _cube(index_rows),
            _cube(rate_rows),
            weights,
            as_of=date(2026, 7, 1),
        )


def test_builder_raises_for_a_code_with_no_friendly_name():
    """An upstream code we have no name for must stop the publish, not be
    dropped. Dropping is what makes a division disappear silently."""
    index_rows, rate_rows, weights = _all_division_inputs()
    index_rows += _full_index_rows("CP079")
    rate_rows.append({"coicop": "CP079", "time": "2026-06", "value": 1.0})
    weights["CP079"] = 0.5
    with pytest.raises(MissingSeriesError, match="COICOP_META"):
        rows_to_category_observations(
            _cube(index_rows),
            _cube(rate_rows),
            weights,
            as_of=date(2026, 7, 1),
            group_codes=["CP079"],
        )


def test_builder_ignores_cp00_and_unrequested_codes():
    """CP00 is the headline (handled separately by the CLI) and stray codes in
    the cube are not published — but neither is a silent drop of something we
    asked for: only codes in CP_DIVISIONS + group_codes are built."""
    index_rows, rate_rows, weights = _all_division_inputs()
    index_rows += _full_index_rows("CP00")
    rate_rows.append({"coicop": "CP00", "time": "2026-06", "value": 5.2})
    weights["CP00"] = 100.0
    cats = rows_to_category_observations(
        _cube(index_rows),
        _cube(rate_rows),
        weights,
        as_of=date(2026, 7, 1),
    )
    assert "CP00" not in cats
    assert list(cats) == CP_DIVISIONS
