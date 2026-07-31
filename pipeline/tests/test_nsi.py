"""Tests for the НСИ (National Statistical Institute) XLSX connector.

The connector reads `Labour_1.1.2.2_EUR_EN.xlsx` — one `{year}trimes` sheet per
year of НСИ's own published quarterly averages by statistical region — for
`-Sofia cap.` (Sofia-city, BG411). The headline is their latest published
quarter and the series is the rest of that row. Nothing is averaged here, and
`test_no_figure_is_computed_only_selected` is what holds that: the payload is a
straight reproduction, which is what §2.1.1 of НСИ's licence needs
(docs/legal.md §НСИ).

These tests build a fixture workbook that mirrors the live sheet structure —
title row with the preliminary marker, quarter header row mixing Cyrillic and
Latin numerals, the trailing "IV incl.annual bonuses" column, and the region
rows. A fixture locks the tests to the schema rather than to НСИ's numbers,
which move on their own schedule.
"""

from __future__ import annotations

import io
from datetime import date

import openpyxl
import pytest

from vyarno_pipeline.sources import nsi
from vyarno_pipeline.sources.nsi import (
    SOFIA_CAP_REGION_NAME,
    SOFIA_PROVINCE_REGION_NAME,
    SOURCE_URL,
    _quarter_columns,
    _roman_quarter,
    fetch_sofia_salary_eu,
)
from vyarno_pipeline.transform import sofia_salary_observation

# The live headers, byte for byte: Q1/Q2 are Cyrillic І (U+0406), Q3/Q4 are
# Latin. Copied rather than generated, because a generated header would test
# the generator.
LIVE_QUARTER_HEADERS = ["І", "ІІ", "III", "IV"]
BONUS_HEADER = "IV incl.annual bonuses"

# The other regions, so the sheet looks like the live one and the row selector
# has something to walk past.
_OTHER_REGIONS = [
    ("Severozapaden", 1117.0),
    ("-Vidin", 995.0),
    ("-Vratsa", 1245.0),
    ("Yugozapaden", 1708.0),
    ("-Blagoevgrad", 949.0),
    ("-Pernik", 1091.0),
]


def _build_year_sheet(
    wb: openpyxl.Workbook,
    year: int,
    cap: dict[int, float],
    prov: dict[int, float],
    *,
    is_preliminary: bool = True,
    cap_bonus: float | None = None,
    prov_bonus: float | None = None,
    quarter_headers: list[str] | None = None,
) -> None:
    """Append one `{year}trimes` sheet mirroring the live layout.

    `cap`/`prov` map quarter number (1..4) to EUR. `cap_bonus`/`prov_bonus`
    fill the trailing "IV incl.annual bonuses" column, which the connector must
    never read as a quarter.
    """
    ws = wb.create_sheet(f"{year}trimes")
    headers = quarter_headers if quarter_headers is not None else LIVE_QUARTER_HEADERS
    ws.append([None])
    ws.append(
        [
            "AVERAGE GROSS MONTHLY WAGES AND SALARIES OF THE EMPLOYEES UNDER "
            f"LABOUR CONTRACT BY STATISTICAL REGIONS AND DISTRICTS IN {year}"
            + ("*" if is_preliminary else "")
        ]
    )
    ws.append(["(EUR) "])
    ws.append(["Statistical regions", f"Quarters {year}"])
    ws.append([None, *headers, BONUS_HEADER])

    def _row(name: str, values: dict[int, float], bonus: float | None) -> list:
        return [name, *[values.get(q) for q in (1, 2, 3, 4)], bonus]

    for name, base in _OTHER_REGIONS[:3]:
        ws.append(_row(name, dict.fromkeys(cap, base), base * 1.05 if cap_bonus else None))
    ws.append(_row(SOFIA_PROVINCE_REGION_NAME, prov, prov_bonus))
    ws.append(_row(SOFIA_CAP_REGION_NAME, cap, cap_bonus))
    for name, base in _OTHER_REGIONS[3:]:
        ws.append(_row(name, dict.fromkeys(cap, base), None))


def _build_fixture_xlsx(years: dict | None = None, **kwargs) -> bytes:
    """A workbook with the monthly sheet НСИ ship plus the quarterly sheets.

    The monthly sheet is present and deliberately empty of anything the
    connector wants: if the parser ever drifts back to it, these tests fail
    rather than quietly reading a month.
    """
    wb = openpyxl.Workbook()
    wb.active.title = "2019-2026"
    wb.active.append(["Statistical regions"])

    if years is None:
        years = {
            2025: {
                "cap": {1: 1731.0, 2: 1784.0, 3: 1776.0, 4: 1859.0},
                "prov": {1: 1135.0, 2: 1212.0, 3: 1187.0, 4: 1248.0},
                "is_preliminary": False,
                "cap_bonus": 2009.0,
                "prov_bonus": 1320.0,
            },
            2026: {"cap": {1: 1915.0}, "prov": {1: 1294.0}},
        }
    for year, spec in sorted(years.items()):
        _build_year_sheet(wb, year, **{**spec, **kwargs})

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _serve_fixture_xlsx(monkeypatch: pytest.MonkeyPatch, workbook_bytes: bytes) -> None:
    """Make the connector read `workbook_bytes` instead of fetching the live URL.

    Only the download helper is replaced; every parsing, selection and
    regression-guard path below it runs exactly as it does in production.
    """
    monkeypatch.setattr(nsi, "_get_xlsx", lambda url, timeout=30.0: workbook_bytes)


def test_connector_headlines_the_latest_published_quarter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The main path: the headline is НСИ's newest quarterly cell, verbatim."""
    _serve_fixture_xlsx(monkeypatch, _build_fixture_xlsx())
    result = fetch_sofia_salary_eu()

    assert result["value_eur"] == pytest.approx(1915.0)
    assert result["ref_period"] == "2026-Q1"
    assert result["sofia_province_value_eur"] == pytest.approx(1294.0)
    # The whole published history, both years, and nothing else.
    assert result["series_by_period"] == {
        "2025-Q1": 1731.0,
        "2025-Q2": 1784.0,
        "2025-Q3": 1776.0,
        "2025-Q4": 1859.0,
        "2026-Q1": 1915.0,
    }


def test_no_figure_is_computed_only_selected(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every value returned is a cell НСИ published.

    The property `docs/legal.md` §НСИ turns on, and it is invisible on screen:
    an averaging step reintroduced here would move no number a reader could
    check, so nothing but this would notice. The mean of the four 2025 quarters
    is 1787.5 and appears nowhere; every returned figure is in the sheet.
    """
    _serve_fixture_xlsx(monkeypatch, _build_fixture_xlsx())
    result = fetch_sofia_salary_eu()

    published = {1731.0, 1784.0, 1776.0, 1859.0, 1915.0}
    assert set(result["series_by_period"].values()) <= published
    assert result["value_eur"] in published
    assert result["value_eur"] == result["series_by_period"][result["ref_period"]]


def test_the_annual_bonus_column_is_never_read_as_a_quarter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """НСИ publish Q4 twice and the second column folds in the 13th salary.

    Reading it would step the ladder up every fourth quarter and back down in
    Q1 — a 8% swing on the fixture's 2025 (1859 against 2009) that no gate
    downstream would flag, because both are plausible Sofia wages.
    """
    _serve_fixture_xlsx(monkeypatch, _build_fixture_xlsx())
    result = fetch_sofia_salary_eu()

    assert result["series_by_period"]["2025-Q4"] == pytest.approx(1859.0)
    assert 2009.0 not in result["series_by_period"].values()
    assert _roman_quarter(BONUS_HEADER) is None


def test_quarter_headers_parse_in_either_alphabet() -> None:
    """The live headers mix Cyrillic І (U+0406) with Latin I and V.

    Folding one onto the other means the parse survives НСИ normalising the
    encoding in either direction, rather than breaking on a change that is
    invisible in a spreadsheet.
    """
    assert _roman_quarter("І") == 1
    assert _roman_quarter("ІІ") == 2
    assert _roman_quarter(" I ") == 1
    assert _roman_quarter("II") == 2
    assert _roman_quarter("III") == 3
    assert _roman_quarter("iv") == 4
    assert _roman_quarter(None) is None
    assert _roman_quarter("Quarters 2026") is None


def test_all_latin_headers_still_parse(monkeypatch: pytest.MonkeyPatch) -> None:
    """End-to-end version of the above: НСИ fixing their encoding must not
    break the connector."""
    _serve_fixture_xlsx(
        monkeypatch,
        _build_fixture_xlsx(quarter_headers=["I", "II", "III", "IV"]),
    )
    assert fetch_sofia_salary_eu()["ref_period"] == "2026-Q1"


def test_a_header_row_without_four_quarters_is_an_error() -> None:
    """Silence is the wrong failure here.

    If НСИ drop a quarter column or rename the bonus column so that it parses
    as one, the connector must stop rather than publish a series with a hole or
    a bonus-inflated Q4 in it.
    """
    with pytest.raises(ValueError, match="four quarter columns"):
        _quarter_columns([None, "І", "ІІ", "III", BONUS_HEADER])
    with pytest.raises(ValueError, match="four quarter columns"):
        _quarter_columns([None, "І", "ІІ", "III", "IV", "IV"])


def test_the_preliminary_marker_comes_from_the_year_title(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """НСИ mark a whole year preliminary with a `*` on the sheet title and drop
    it when the year is final. The flag has to follow the quarter's own year,
    not the newest sheet in the file."""
    _serve_fixture_xlsx(monkeypatch, _build_fixture_xlsx())
    assert fetch_sofia_salary_eu()["is_preliminary"] is True

    _serve_fixture_xlsx(
        monkeypatch,
        _build_fixture_xlsx(
            years={
                2026: {
                    "cap": {1: 1915.0},
                    "prov": {1: 1294.0},
                    "is_preliminary": False,
                }
            }
        ),
    )
    assert fetch_sofia_salary_eu()["is_preliminary"] is False


def test_regression_guard_when_sofia_city_falls_below_the_province(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the row selector matches the wrong region the numbers stay plausible.

    Sofia city runs 50-70% above the rest of Sofia province, so a converged or
    inverted pair is the signature of a mis-selected row — the one failure mode
    that would otherwise publish a wrong number silently.
    """
    _serve_fixture_xlsx(
        monkeypatch,
        _build_fixture_xlsx(
            years={2026: {"cap": {1: 1200.0}, "prov": {1: 1294.0}}},
        ),
    )
    with pytest.raises(ValueError, match="Regression guard"):
        fetch_sofia_salary_eu()


def test_a_renamed_region_row_is_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """A missing Sofia row must raise rather than fall through to another
    region's numbers."""
    wb = openpyxl.Workbook()
    wb.active.title = "2019-2026"
    ws = wb.create_sheet("2026trimes")
    ws.append([None])
    ws.append(["... IN 2026*"])
    ws.append(["(EUR)"])
    ws.append(["Statistical regions", "Quarters 2026"])
    ws.append([None, *LIVE_QUARTER_HEADERS, BONUS_HEADER])
    ws.append(["Yugozapaden", 1708.0, None, None, None, None])
    buf = io.BytesIO()
    wb.save(buf)
    _serve_fixture_xlsx(monkeypatch, buf.getvalue())

    with pytest.raises(ValueError, match="Could not locate"):
        fetch_sofia_salary_eu()


def test_a_workbook_with_no_quarterly_sheet_is_an_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The monthly sheet alone is not enough. Falling back to it would
    reintroduce the derived figure this connector exists to avoid."""
    wb = openpyxl.Workbook()
    wb.active.title = "2019-2026"
    wb.active.append(["Statistical regions"])
    buf = io.BytesIO()
    wb.save(buf)
    _serve_fixture_xlsx(monkeypatch, buf.getvalue())

    with pytest.raises(ValueError, match="No 'trimes' sheet"):
        fetch_sofia_salary_eu()


def test_connector_url_is_nsi_timeseries_xlsx() -> None:
    """The connector hits the canonical НСИ timeseries XLSX. If НСИ move the
    file, this fails before a mis-extracted number reaches production."""
    assert SOURCE_URL == (
        "https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.2_EUR_EN.xlsx"
    )
    assert "nsi.bg" in SOURCE_URL
    assert SOURCE_URL.endswith(".xlsx")


def test_transform_wraps_into_observation() -> None:
    """The transformer builds a valid TimeSeriesObservation from the connector
    dict. Pin the envelope so the SPA can rely on `data.value` +
    `data.source_url` + `data.ref_period`."""
    scrape = {
        "value_eur": 1915.0,
        "ref_period": "2026-Q1",
        "is_preliminary": True,
        "sofia_province_value_eur": 1294.0,
        "series_by_period": {
            "2025-Q4": 1859.0,
            "2026-Q1": 1915.0,
        },
    }
    obs = sofia_salary_observation(scrape, as_of=date(2026, 7, 30), source_url=SOURCE_URL)

    # The headline is НСИ's published quarter, and it is one of the cells in the
    # series beside it. Both halves matter: a headline outside its own series is
    # a figure this project computed.
    assert obs.value == pytest.approx(1915.0)
    assert obs.ref_period == "2026-Q1"
    assert obs.value == pytest.approx(obs.series_by_period[obs.ref_period])
    assert obs.unit == "eur_per_month"
    assert obs.source == "nsi"
    assert obs.dataset == "Labour_1.1.2.2_EUR_EN.xlsx:sheet={year}trimes:row=-Sofia cap."
    assert len(obs.series_by_period) == 2
    # Notes carry the preliminary flag, the province figure (the
    # regression-guard evidence) and the Q4 column actually taken.
    assert "preliminary" in obs.notes
    assert "1294" in obs.notes
    assert "incl.annual bonuses" in obs.notes
    # Disclaimer names the human-readable landing page so a reader can click
    # through.
    assert "statistical-data/179/569" in (obs.disclaimer or "")
