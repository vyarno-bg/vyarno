"""Observation models — the contract between pipeline and /data/published/*.json.

Every published series carries provenance (dataset code, source URL, as-of date)
and a payload. CategoryObservation additionally carries index history keyed by year
so the site can compute cumulative rates against any anchor year back to 2020.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator

# Whitelisted data sources. New source = add here AND to a connector module.
Source = Literal["eurostat", "nsi", "ecb", "bnb"]


class Observation(BaseModel):
    """One data point with full provenance. Base contract for every published file."""

    dataset: str
    source: Source
    source_url: HttpUrl
    ref_period: str  # e.g. "2026-06" or "Q1-2026"
    published_at: date
    unit: str  # "percent" | "index_2015=100" | "eur" | "eur_per_year" | "count"
    value: float


class GroupObservation(BaseModel):
    """One ECOICOP ver.2 **group** — the second level of the hierarchy.

    A division (CP07 Transport) splits into groups (CP071 buying a vehicle,
    CP072 running it, CP073 tickets, CP074 freight). The SPA's detailed mode
    renders these so a non-driver who eats a lot can describe their actual
    spending instead of accepting the division average.

    Same contract as `CategoryObservation`, minus the envelope fields the
    parent already carries: `weight_pct` is the share of the WHOLE basket (so
    all groups across all divisions sum to 100), and both index fields carry
    Eurostat's own values.

    There is deliberately no share-of-division field. The SPA's drill-down
    normalises a division's groups against each other, and that normalisation
    cancels the division's own weight — so a share-of-parent number would be
    `weight_pct` restated, except computed by us and therefore a figure
    Eurostat would have to be disclaimed for.

    `eurostat_label` is the cube's own English name for the code. It is the
    evidence that weight, rate and index describe the same bucket — the
    classification-agreement gate compares it across the weights and rates
    cubes, and the SPA shows it on the row's verify link.
    """

    cp_code: str  # e.g. "CP072"
    parent_cp_code: str  # e.g. "CP07"
    bg_name: str
    en_name: str
    eurostat_label: str
    weight_pct: float = Field(ge=0, le=100)
    annual_rate_pct: float
    ref_period: str
    index_base_year: int
    index_by_year: dict[int, float]
    latest_index: dict[str, float | str]
    api_url: HttpUrl
    api_url_index: HttpUrl


class CategoryObservation(Observation):
    """One COICOP division across time, with its groups nested underneath.

    Carries index history (`index_by_year`) so ANY anchor year from 2020 to now
    can compute `idx_now / idx_Y - 1` without an extra API call. This is the
    architectural reason we don't trust upstream pre-computed cumulative rates.

    The `latest_index` field is the freshest monthly index reading (e.g.
    2026-06) — separate from `index_by_year` (year-end only) because the SPA's
    "since year Y" math needs the most current end-point. The per-category YoY
    `annual_rate_pct` is the verbatim RCH_A rate at the same month, so the whole
    observation is one live vintage. See `rows_to_yearly_index` for the
    year-end exclusion rule that keeps `index_by_year` honest.

    BASE CONTRACT (do not break): `index_by_year` and `latest_index` carry
    Eurostat's published values off one cube at one unit, and `index_base_year`
    names that unit's base. The SPA divides `latest_index / index_by_year[anchor]`,
    so the two have to sit on the same base; scaling either one — to make an
    anchor year read 100, to match a chart axis — inflates every since-anchor
    cumulative by the scale factor, and a 12-month rate cannot reveal it. The
    protection is that there is no arithmetic here to get wrong. See
    docs/math.md §"Invariants that must never break" #1.
    """

    cp_code: str  # "CP01".."CP13" (ECOICOP ver.2 has 13 divisions)
    bg_name: str
    en_name: str
    # The cube's own official English name for this code (e.g. CP12 →
    # "Insurance and financial services"). Published so a reader can tell at a
    # glance which classification the row is on, and compared across the
    # weights and rates cubes by the classification-agreement gate.
    eurostat_label: str
    weight_pct: float = Field(ge=0, le=100)
    annual_rate_pct: float
    api_url: HttpUrl  # prc_hicp_minr RCH_A (rate) — the rate's provenance link
    api_url_index: HttpUrl  # prc_hicp_minr index — the since-year math link
    index_base_year: int
    index_by_year: dict[int, float]
    # {"time": "YYYY-MM", "value": float} — pydantic can't enforce the
    # value-shape, so we use a string|float union and let the producer
    # (transform.py) guarantee the contract.
    latest_index: dict[str, float | str]
    # The division's groups (ECOICOP level 2). Empty only if upstream stops
    # publishing them; the group-coverage gate fails the publish first.
    groups: list[GroupObservation] = Field(default_factory=list)

    @field_validator("index_by_year")
    @classmethod
    def _index_must_be_nonempty_with_positive_base(cls, v: dict[int, float]) -> dict[int, float]:
        if not v:
            raise ValueError("index_by_year cannot be empty")
        base_year = min(v.keys())
        if v[base_year] <= 0:
            raise ValueError(f"base year {base_year} index must be > 0 (got {v[base_year]})")
        return v


class TimeSeriesObservation(BaseModel):
    """Generic time-series payload for non-COICOP datasets.

    Used for wage index, decile slider, housing price index, unemployment,
    mortgage rate — any single-variable series indexed by period.

    `series_by_period` is the canonical {period_label: value} map. Periods
    are stored as strings (e.g. "2026-Q1", "2025", "2026-05") so the
    rendered JSON is human-readable without a separate period taxonomy.
    """

    dataset: str
    source: Source
    source_url: HttpUrl
    ref_period: str
    published_at: date
    unit: str
    value: float  # latest observation (for dashboard summaries)
    series_by_period: dict[str, float]
    notes: str = ""
    # Optional: methodology-change note (BG eurozone discontinuity etc.)
    methodology_change: str | None = None
    # Optional: caveat text surfaced to the user in the UI
    disclaimer: str | None = None
    # Optional: the publisher marks this reading provisional and will revise it.
    #
    # A flag rather than a sentence in `notes`, because the SPA has to render it
    # beside the figure and no reader opens the JSON. НСИ star a whole year's
    # sheet title until they finalise it, so their latest quarter is provisional
    # for around a year after it is first published — long enough that "the
    # current quarter" and "a settled quarter" are the same thing to anybody
    # reading the card. `None` where the publisher makes no such distinction,
    # which is not the same claim as `False`.
    is_preliminary: bool | None = None
