"""Tests for the observation models.

These tests are the contract between the pipeline and the published JSON.
If you change Observation or CategoryObservation, change these first.
"""

from datetime import date

import pytest
from pydantic import ValidationError

from vyarno_pipeline.models import CategoryObservation, Observation


def test_observation_minimal_required_fields():
    """An Observation needs dataset/source/url/period/date/unit/value."""
    o = Observation(
        dataset="prc_hicp_manr",
        source="eurostat",
        source_url="https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_manr",
        ref_period="2026-06",
        published_at=date(2026, 7, 17),
        unit="percent",
        value=5.2,
    )
    assert o.value == 5.2
    assert o.unit == "percent"
    assert o.source == "eurostat"


def test_observation_rejects_unknown_source():
    """Source must be one of the whitelisted literal values.

    The whitelist is what keeps an unaudited upstream out of the published
    JSON: a new source has to be added here AND get a connector module.
    """
    with pytest.raises(ValidationError):
        Observation(
            dataset="x",
            source="bogus",
            source_url="https://example.com",
            ref_period="2026-06",
            published_at=date(2026, 7, 17),
            unit="percent",
            value=1.0,
        )


def test_category_observation_carries_index_history():
    """CategoryObservation extends Observation with COICOP metadata + index history."""
    c = CategoryObservation(
        dataset="prc_hicp_minr",
        source="eurostat",
        source_url="https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr",
        cp_code="CP01",
        bg_name="Храна и безалк. напитки",
        en_name="Food & soft drinks",
        eurostat_label="Food and non-alcoholic beverages",
        weight_pct=23.0,
        annual_rate_pct=2.4,
        api_url="https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=BG&coicop=CP01",
        api_url_index="https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18=CP01&unit=I15&sinceTimePeriod=2020-01",
        index_base_year=2015,
        index_by_year={2020: 100.0, 2021: 104.0, 2026: 150.0},
        latest_index={"time": "2026-12", "value": 150.0},
        ref_period="2026-12",
        published_at=date(2026, 7, 17),
        unit="index_2015=100",
        value=150.0,
    )
    assert c.cp_code == "CP01"
    assert c.weight_pct == 23.0


def _category_kwargs(**overrides):
    """A complete, valid CategoryObservation kwargs set, minus overrides.

    Complete on purpose: an earlier version of the empty-index test omitted
    `api_url_index` and `latest_index` as well, so pydantic rejected it for
    the missing fields and the test passed without ever reaching the
    index_by_year validator it claimed to exercise.
    """
    kwargs = {
        "dataset": "prc_hicp_minr",
        "source": "eurostat",
        "source_url": "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr",
        "cp_code": "CP01",
        "bg_name": "x",
        "en_name": "x",
        "eurostat_label": "X",
        "weight_pct": 1.0,
        "annual_rate_pct": 1.0,
        "api_url": "https://example.com/cp01",
        "api_url_index": "https://example.com/index/cp01",
        "index_base_year": 2015,
        "index_by_year": {2020: 100.0, 2026: 150.0},
        "latest_index": {"time": "2026-12", "value": 150.0},
        "ref_period": "2026-12",
        "published_at": date(2026, 7, 17),
        "unit": "index_2015=100",
        "value": 150.0,
    }
    kwargs.update(overrides)
    return kwargs


def test_category_kwargs_helper_builds_a_valid_observation():
    """Guard the guard: if the baseline kwargs stopped being valid, every
    rejection test below would pass for the wrong reason."""
    assert CategoryObservation(**_category_kwargs()).cp_code == "CP01"


def test_category_index_validator_rejects_empty_dict():
    """An empty index_by_year is meaningless — reject at construction.

    Everything else is present and valid, so this can only fail on the
    validator under test.
    """
    with pytest.raises(ValidationError, match="index_by_year cannot be empty"):
        CategoryObservation(**_category_kwargs(index_by_year={}))


def test_category_index_validator_rejects_a_non_positive_base():
    """A base-year index of 0 makes every since-anchor ratio infinite."""
    with pytest.raises(ValidationError, match="must be > 0"):
        CategoryObservation(**_category_kwargs(index_by_year={2020: 0.0, 2026: 150.0}))


def test_category_weight_must_be_a_percentage():
    """weight_pct is a basket share; outside [0,100] the reconciliation
    identity is meaningless."""
    for bad in (-1.0, 100.1):
        with pytest.raises(ValidationError):
            CategoryObservation(**_category_kwargs(weight_pct=bad))
