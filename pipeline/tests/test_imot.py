"""Tests for the imot.bg average-prices scraper (sources/imot.py).

Covers four failure surfaces:

1. **Decode.** imot.bg ships windows-1251 bytes and the meta tag can lie.
   A utf-8 decode turns every district name into mojibake and the parse
   silently yields nothing.
2. **Schema regression.** The literal `var raioniAvgPrice = {...}` block is
   the only thing we depend on. If imot.bg drops or rephrases it, the
   connector must FAIL LOUD rather than ship zero data.
3. **Anti-injection bounds.** Values outside [100, 10000] €/m² (someone
   injecting 99999 to poison the median, or a negative) must be dropped
   before they touch the summary stats.
4. **Thin-dataset guard.** Fewer than 20 surviving districts means the
   regex matched a fragment — abort rather than publish a 2-district
   "median" as if it were the city.

No network: the tests feed the connector's own parse functions a committed
fixture page. The fixture is a realistic 43-district Sofia page saved as
windows-1251, large enough to clear the connector's own 20-district floor —
an earlier 7-district fixture was below it, which forced the tests to
re-implement the regex instead of calling the parser. That re-implementation
tested nothing: breaking the connector's regex or its encoding left the
suite green.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from vyarno_pipeline import clock
from vyarno_pipeline.sources import imot

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "imot_sredni_ceni_sample.html"


def _read_fixture_bytes() -> bytes:
    """The sample page as the same bytes imot.bg would serve."""
    return FIXTURE_PATH.read_bytes()


def test_connector_decodes_windows_1251_not_utf8():
    """The connector's own decode must yield Cyrillic, not mojibake.

    Calls `_decode_imot_html` — the function the fetch path uses — so a
    refactor that swaps the encoding fails here.
    """
    html = imot._decode_imot_html(_read_fixture_bytes())
    assert "София" in html
    assert "квартали" in html
    assert "обновена на 16.7.2026" in html


def test_connector_parses_the_district_block_from_the_page():
    """The core parse step, through the production function.

    Pins four known district values, so a regex that starts matching a
    different literal (or dropping quoted keys with spaces) is caught.
    """
    html = imot._decode_imot_html(_read_fixture_bytes())
    districts = imot._parse_raioni_avg_price_block(html)
    assert districts["Банишора"] == 2504
    assert districts["Лозенец"] == 2950
    assert districts["Докторски паметник"] == 5567
    assert districts["Връбница 1"] == 2304


def test_connector_drops_out_of_band_values_at_parse_time():
    """Injected values never reach the summary stats.

    The fixture carries a 99999 and a -50; both must be gone before any
    median/mean is computed.
    """
    districts = imot._parse_raioni_avg_price_block(imot._decode_imot_html(_read_fixture_bytes()))
    assert "Invalid Huge" not in districts
    assert "Invalid Negative" not in districts
    assert max(districts.values()) < 10_000
    assert min(districts.values()) >= 100


def test_connector_raises_when_the_price_block_disappears():
    """A page without the literal is a layout change, not an empty city."""
    with pytest.raises(ValueError, match="raioniAvgPrice"):
        imot._parse_raioni_avg_price_block("<html><body>maintenance</body></html>")


def test_connector_raises_on_a_thin_district_block():
    """A fragment that happens to contain the literal must not publish.

    Five districts is not a city median; the connector aborts instead.
    """
    thin = "var raioniAvgPrice = {'A': 1000,'B': 1100,'C': 1200,'D': 1300,'E': 1400};"
    with pytest.raises(ValueError, match="only 5 valid districts"):
        imot._parse_raioni_avg_price_block(thin)


def test_connector_reads_the_page_publication_date():
    """The `обновена на DD.MM.YYYY` stamp is the provenance the card shows."""
    html = imot._decode_imot_html(_read_fixture_bytes())
    assert imot._extract_page_as_of(html) == "16.7.2026"
    assert imot._extract_page_as_of("<html>no date here</html>") == ""


def test_build_payload_summary_stats_are_correct():
    """Lock the published-JSON contract: median, mean (rounded to 1
    decimal), min, max, n_districts. If these fields silently drift
    (e.g. someone rounds mean to int and loses precision), this
    catches it."""
    raw = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "16.7.2026",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": {
                "A": 1000,
                "B": 2000,
                "C": 3000,
                "D": 4000,
                "E": 5000,
                "F": 6000,
                "G": 7000,
                "H": 8000,
                "A2": 1000,
                "B2": 2000,
                "C2": 3000,
                "D2": 4000,
                "E2": 5000,
                "F2": 6000,
                "G2": 7000,
                "H2": 8000,
                "A3": 1000,
                "B3": 2000,
                "C3": 3000,
                "D3": 4000,
                # 20 valid values, median = the avg of 10th+11th
                # sorted = avg(5000, 5000) = 5000
            },
            "n_districts": 20,
        },
    )
    assert raw["eur_per_m2_median"] == 4000
    assert raw["eur_per_m2_mean"] == 4100.0
    assert raw["eur_per_m2_min"] == 1000
    assert raw["eur_per_m2_max"] == 8000
    assert raw["n_districts"] == 20


def test_build_payload_skips_out_of_band_values():
    """Anti-injection: values outside [100, 10000] €/m² must be
    dropped BEFORE summary stats are computed — they don't pollute
    the median/mean/min/max."""
    raw = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "16.7.2026",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": {
                # 20 real values (sorted ascending)
                "A": 1000,
                "B": 1100,
                "C": 1200,
                "D": 1300,
                "E": 1400,
                "F": 1500,
                "G": 1600,
                "H": 1700,
                "I": 1800,
                "J": 1900,
                "K": 2000,
                "L": 2100,
                "M": 2200,
                "N": 2300,
                "O": 2400,
                "P": 2500,
                "Q": 2600,
                "R": 2700,
                "S": 2800,
                "T": 2900,
                # Out-of-band — would poison the median
                "INJECTED_HIGH": 99_999,
                "INJECTED_LOW": 50,
                "INJECTED_NEGATIVE": -100,
            },
            "n_districts": 23,
        },
    )
    # 20 valid → median = the avg of 10th+11th = avg(1900, 2000) = 1950
    assert raw["n_districts"] == 20  # 23 - 3 dropped
    assert raw["eur_per_m2_median"] == 1950
    # Min = 1000 (not 50 or -100)
    assert raw["eur_per_m2_min"] == 1000
    # Max = 2900 (not 99999)
    assert raw["eur_per_m2_max"] == 2900


def test_build_payload_refuses_thin_dataset():
    """Defensive: if the regex somehow matches a tiny fragment
    (e.g. imot.bg accidentally serves an error page that
    coincidentally contains the substring), we fail loud rather
    than ship a 2-district avg as if it were 143-district truth.
    Threshold = < 20 valid districts."""
    with pytest.raises(ValueError, match=r"only .* valid districts"):
        imot.build_sofia_price_payload(
            date(2026, 7, 22),
            {
                "page_as_of": "",
                "city_label_bg": "София",
                "city_label_en": "Sofia",
                # 19 valid — one short of the 20 threshold
                "districts": {f"D{i}": 2000 + i * 100 for i in range(19)},
                "n_districts": 19,
            },
        )
    # 20 valid (threshold) — accepted
    raw = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": {f"D{i}": 2000 + i * 100 for i in range(20)},
            "n_districts": 20,
        },
    )
    assert raw["n_districts"] == 20


def test_build_payload_uses_actual_median_not_floor_of_even_list():
    """Catches the subtle bug where median is computed by integer
    division: prices[len(prices)//2] returns the LOWER-MIDDLE for
    even-sized lists. statistics.median() correctly averages the
    two middle values. For our test data, values {100,200,300,400}
    should give median = 250 (avg of 200 and 300), not 200."""
    raw = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": {
                f"D{i}": v
                for i, v in enumerate(
                    # 20 elements, median at the avg of 9th+10th sorted
                    # Sorted (insertion order matches sort here):
                    # 100, 200, 300, 400, 1500, 1600, 1700, 1800, 1900, 2000,
                    # 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2900, 3000
                    # median = (2000 + 2100) / 2 = 2050.0
                    [
                        100,
                        200,
                        300,
                        400,
                        1500,
                        1600,
                        1700,
                        1800,
                        1900,
                        2000,
                        2100,
                        2200,
                        2300,
                        2400,
                        2500,
                        2600,
                        2700,
                        2800,
                        2900,
                        3000,
                    ]
                )
            },
            "n_districts": 20,
        },
    )
    # statistics.median() of an even-sized list = avg of the two
    # middle values. Here (val[9] + val[10]) / 2 = (2000 + 2100) / 2.
    assert raw["eur_per_m2_median"] == 2050.0


def test_payload_envelope_shape():
    """Lock the top-level schema_version + as_of + source + the
    three MEDIAN / MEAN / MIN / MAX tuple. If anyone accidentally
    renames `eur_per_m2_median` → `median_eur_per_m2` (it's an
    easy slip in a copy-paste), this test catches it."""
    raw = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "16.7.2026",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": {f"D{i}": 2000 + 100 * i for i in range(20)},
            "n_districts": 20,
        },
    )
    for key in (
        "schema_version",
        "as_of",
        "source",
        "source_url",
        "notes",
        "payload_name",
        "city",
        "city_en",
        "n_districts",
        "eur_per_m2_median",
        "eur_per_m2_mean",
        "eur_per_m2_min",
        "eur_per_m2_max",
        "page_as_of_dd_mm_yyyy",
        "all_districts",
    ):
        assert key in raw, f"key `{key}` missing from payload envelope"

    assert raw["schema_version"] == "1.1"
    assert raw["as_of"] == "2026-07-22"
    assert raw["source"] == "imot.bg"
    assert raw["source_url"] == imot.SOURCE_URL
    assert raw["payload_name"] == "sofia_price"
    assert raw["city"] == "София"
    assert raw["city_en"] == "Sofia"
    # Notes paragraph should mention the median-first ordering
    # rationale and the page date — if those drift, downstream
    # readers lose the data-provenance trail.
    notes = raw["notes"]
    assert "median" in notes.lower()
    assert "16.7.2026" in notes


# ---------------------------------------------------------------------------
# Historical archive
# ---------------------------------------------------------------------------
# The imot.bg page also exposes per-year snapshots via
# https://www.imot.bg/sredni-ceni/prodazhbi-sofiya?year=Y. The pipeline
# fetches years 2015..current_year on every refresh and the SPA surfaces
# "+X% since 2015" with the per-year medians. These tests pin that
# behavior so future refactors don't accidentally regress the historical
# ladder.


def _hist_raw(year: int, vals: dict[str, int]) -> dict:
    """Build a minimal per-year raw dict matching the shape
    fetch_sofia_avg_prices_for_year returns."""
    return {
        "year": year,
        "page_as_of": "",
        "city_label_bg": "София",
        "city_label_en": "Sofia",
        "source_url": f"https://www.imot.bg/sredni-ceni/prodazhbi-sofiya?year={year}",
        "districts": vals,
        "n_districts": len(vals),
    }


def _districts(values: list[int]) -> dict[str, int]:
    """Build a 20-district dict with the given values (so the
    _summary_stats guard of >= 20 districts passes)."""
    return {f"D{i}": v for i, v in enumerate(values)}


def test_historical_year_min_constant_is_2015():
    """2015 is the historical lower bound.

    имот.bg returns 200 with 120+ districts for 2015..current_year; below 2015
    is unverified. The guard in `fetch_sofia_avg_prices_for_year` refuses an
    earlier year, and this pins the constant."""
    assert imot.HISTORICAL_YEAR_MIN == 2015


def test_historical_year_below_min_raises():
    """fetch_sofia_avg_prices_for_year(2014) must raise ValueError
    because the historical archive below 2015 has not been verified."""
    with pytest.raises(ValueError, match="below HISTORICAL_YEAR_MIN"):
        imot.fetch_sofia_avg_prices_for_year(2014)


def test_historical_year_in_future_raises():
    """A future year is invalid — imot.bg has no archive for it."""
    future = clock.today().year + 5
    with pytest.raises(ValueError, match="in the future"):
        imot.fetch_sofia_avg_prices_for_year(future)


def test_build_payload_with_historical_baseline_first_year_is_zero():
    """The historical block's first year (the baseline) must carry
    `since_2015_median_pct: 0.0` by construction. The current year's
    row must match the formula current_median / baseline_median - 1."""
    # Baseline: 2015 median = 1000
    historical = [
        _hist_raw(2015, _districts([1000] * 20)),
        _hist_raw(2026, _districts([1500] * 20)),  # current: +50%
    ]
    payload = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {  # current raw
            "page_as_of": "16.7.2026",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": _districts([1500] * 20),
            "n_districts": 20,
        },
        historical=historical,
    )
    rows = payload["historical"]
    assert len(rows) == 2
    assert rows[0]["year"] == 2015
    assert rows[0]["since_2015_median_pct"] == 0.0
    assert rows[1]["year"] == 2026
    assert rows[1]["since_2015_median_pct"] == 50.0


def test_build_payload_historical_sorted_ascending():
    """Pass the historical rows in DESCENDING order; the payload must
    sort them ascending. The current year is 2026 with a baseline of
    2015 = 1000 and values 1000, 1500, 2000, 1750 — i.e. compute
    each pct in order."""
    historical = [
        _hist_raw(2026, _districts([2000] * 20)),
        _hist_raw(2023, _districts([1750] * 20)),
        _hist_raw(2015, _districts([1000] * 20)),
        _hist_raw(2018, _districts([1500] * 20)),
    ]
    payload = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": _districts([2000] * 20),
            "n_districts": 20,
        },
        historical=historical,
    )
    years = [r["year"] for r in payload["historical"]]
    assert years == sorted(years), f"historical not ascending: {years}"


def test_build_payload_historical_consistency_invariant():
    """Consistency invariant: current_year_row.since_2015_median_pct
    MUST equal current_median / baseline_median - 1, regardless of
    what the historical row carried. The build_payload() re-computes
    the current-year pct from the formula so the SPA can trust the
    JSON."""
    # Historical ladder carries a WRONG pct for 2026 (someone
    # hand-edited the JSON to 999.0). The build pass must override
    # it with the formula-derived value.
    historical = [
        _hist_raw(2015, _districts([1000] * 20)),
        _hist_raw(2026, _districts([1500] * 20)),
    ]
    historical[1]["since_2015_median_pct"] = 999.0  # bogus
    payload = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": _districts([1500] * 20),
            "n_districts": 20,
        },
        historical=historical,
    )
    current_year_row = next(r for r in payload["historical"] if r["year"] == 2026)
    assert current_year_row["since_2015_median_pct"] == 50.0, (
        "consistency invariant broken: current-year pct must equal "
        "current_median / baseline_median - 1 (50%), not the bogus "
        "value from the historical ladder (999.0)"
    )


def test_build_payload_historical_appends_current_year_if_missing():
    """If the historical list doesn't include the current year, the
    build pass must append a row for it using the current raw's
    median. This handles the case where the pipeline fetches 2015..2025
    but the current year is 2026 (so 2026 needs to be added from the
    current raw)."""
    historical = [
        _hist_raw(2015, _districts([1000] * 20)),
        _hist_raw(2025, _districts([1900] * 20)),
    ]
    payload = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": _districts([2000] * 20),
            "n_districts": 20,
        },
        historical=historical,
    )
    years = [r["year"] for r in payload["historical"]]
    assert 2026 in years, (
        "current year (2026) was not in the historical list AND not "
        "appended by build_payload() — the historical block is missing "
        "the most recent year."
    )
    current_year_row = next(r for r in payload["historical"] if r["year"] == 2026)
    assert current_year_row["since_2015_median_pct"] == 100.0  # 2000/1000 - 1


def test_build_payload_no_historical_keeps_v10_shape():
    """Backward compatibility: build_payload() with historical=None
    returns the v1.0-shaped envelope (no `historical` key). This is
    the test run by the pipeline's existing CLI before the per-year
    scrape loop lands — must not break."""
    payload = imot.build_sofia_price_payload(
        date(2026, 7, 22),
        {
            "page_as_of": "16.7.2026",
            "city_label_bg": "София",
            "city_label_en": "Sofia",
            "districts": _districts([2500] * 20),
            "n_districts": 20,
        },
    )
    assert "historical" not in payload, (
        "build_payload() with historical=None must NOT emit a "
        "`historical` key — the v1.0 envelope shape is preserved."
    )
    assert payload["schema_version"] == "1.1", (
        "schema_version bumped to 1.1 even when no historical block "
        "is shipped — the consumer contract changed."
    )
