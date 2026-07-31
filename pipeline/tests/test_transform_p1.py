"""Tests for the secondary transforms: unemployment.

The transforms convert raw Eurostat cube rows into TimeSeriesObservation
objects. We don't hit the network — we synthesize small cube-shaped row
dicts and verify the output.

Cube row shape (from `_cube_to_rows` in sources/eurostat.py):
    {freq, <other dims>, geo, time, value}
"""

from datetime import date

import pytest

from vyarno_pipeline.transform import (
    _rows_to_period_map,
    rows_to_unemployment_observation,
)

AS_OF = date(2026, 7, 22)


def test_rows_to_period_map_drops_none_and_picks_last_per_period():
    rows = [
        {"time": "2026-Q1", "value": 0.5},
        {"time": "2025-Q4", "value": 0.3, "freq": "Q"},
        {"time": None, "value": 99.0},  # missing period → dropped
        {"time": "2026-Q1", "value": None},  # missing value → dropped
    ]
    out = _rows_to_period_map(rows)
    assert out == {"2026-Q1": 0.5, "2025-Q4": 0.3}


def _une_row(**kw):
    """A `une_rt_m` row at the published selection, overridable per test."""
    return {
        "s_adj": "SA",
        "sex": "T",
        "age": "TOTAL",
        "unit": "PC_ACT",
        "time": "2026-05",
        "value": 2.9,
        **kw,
    }


def test_rows_to_unemployment_observation_picks_the_published_cell():
    """SA × T × TOTAL(=15-74) × PC_ACT, and nothing adjacent.

    Every neighbour in this cube is a DIFFERENT statistic rather than a
    coarser version of the same one, and three of them are numerically
    plausible as an unemployment rate:
      - `NSA` is the unadjusted reading (3.0 where SA says 2.9),
      - `TC` is a smoothed trend,
      - `Y25-74` excludes the under-25s, whose rate is far higher,
      - `THS_PER` is thousands of people and is not a percentage at all.
    """
    rows = [
        _une_row(),
        _une_row(s_adj="NSA", value=3.0),
        _une_row(s_adj="TC", value=2.8),
        _une_row(age="Y_LT25", value=9.4),
        _une_row(age="Y25-74", value=2.4),
        _une_row(unit="THS_PER", value=94.0),
        _une_row(sex="F", value=3.1),
    ]
    obs = rows_to_unemployment_observation(rows, as_of=AS_OF)
    assert obs.value == 2.9
    assert obs.ref_period == "2026-05"
    assert obs.dataset == "une_rt_m:s_adj=SA:sex=T:age=TOTAL:unit=PC_ACT"
    assert "une_rt_m" in str(obs.source_url)
    assert "seasonally adjusted" in obs.notes


def test_rows_to_unemployment_observation_takes_the_latest_month():
    rows = [
        _une_row(time="2026-03", value=2.9),
        _une_row(time="2026-05", value=2.9),
        _une_row(time="2026-04", value=2.8),
    ]
    obs = rows_to_unemployment_observation(rows, as_of=AS_OF)
    assert obs.ref_period == "2026-05"
    assert set(obs.series_by_period) == {"2026-03", "2026-04", "2026-05"}


@pytest.mark.parametrize(
    "missing",
    [{"s_adj": "NSA"}, {"age": "Y25-74"}, {"unit": "THS_PER"}, {"sex": "F"}],
)
def test_rows_to_unemployment_observation_raises_rather_than_substituting(missing):
    """No fallback branch, on purpose.

    The previous version fell back to `PC_POP` — a percentage of the WHOLE
    population, everyone outside the labour force included — which is a
    materially lower number wearing the same label. `une_rt_m` does not even
    carry `PC_POP`. Publishing any neighbour here would put a different
    statistic under the word «безработица», so the transform raises and the
    CLI exits 2.
    """
    rows = [_une_row(**missing)]
    with pytest.raises(ValueError, match="No une_rt_m rows"):
        rows_to_unemployment_observation(rows, as_of=AS_OF)


def test_rows_to_unemployment_observation_raises_when_no_data():
    with pytest.raises(ValueError, match="No une_rt_m rows"):
        rows_to_unemployment_observation([], as_of=AS_OF)
