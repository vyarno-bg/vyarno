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
from vyarno_pipeline.transform import build_sector_salary_payload, sofia_salary_observation

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
    # **The preliminary marker is a FIELD, not a sentence.** Nobody reads a
    # payload's prose, and the strip has to put the marker beside the figure —
    # it reached `notes` and stopped there, so the Sofia card showed 1915 as
    # settled while the sector card three rows up marked НСИ's same quarter
    # «(предварителни данни)». This figure also re-levels every ladder rung.
    assert obs.is_preliminary is True
    assert (
        sofia_salary_observation(
            {**scrape, "is_preliminary": False}, as_of=date(2026, 7, 30), source_url=SOURCE_URL
        ).is_preliminary
        is False
    )
    # Notes carry it too, the province figure (the regression-guard evidence)
    # and the Q4 column actually taken.
    assert "preliminary" in obs.notes
    assert "1294" in obs.notes
    assert "incl.annual bonuses" in obs.notes
    # Disclaimer names the human-readable landing page so a reader can click
    # through.
    assert "statistical-data/179/569" in (obs.disclaimer or "")


# ---------------------------------------------------------------------------
# The by-sector table — Labour_1.1.2.1, both language editions
# ---------------------------------------------------------------------------

# The Bulgarian edition heads its bonus column differently, which is why the
# connector carries both markers. Copied from the live file, not translated.
BONUS_HEADER_BG = "IV вкл.годишни премии"

# Nineteen NACE Rev 2 sections in НСИ's own order, plus the all-activities row
# that heads them. Trimmed to the shape that matters — the two `Total` title
# rows, the ownership block and the quarterly/monthly split — with НСИ's own
# missing spaces after commas preserved, because the row labels are matched
# exactly and tidying them is how the lookup stops matching.
_SECTOR_NAMES_EN = [
    "Total",
    "Agriculture,forestry and fishing",
    "Mining and quarrying",
    "Manufacturing",
    "Electricity,gas,steam and air conditioning supply",
    "Water supply,sewerage,waste management and remediation activities",
    "Construction",
    "Wholesale and retail trade;repair of motor vehicles and motorcycles",
    "Transportation and storage",
    "Accommodation and food service activities",
    "Information and communication",
    "Financial and insurance activities",
    "Real estate activities",
    "Professional,scientific and technical activities",
    "Administrative and support service activities",
    "Public administration and defence;compulsory social security",
    "Education",
    "Human health and social work activities",
    "Arts,entertainment and recreation",
    "Other service activities",
]
_SECTOR_NAMES_BG = [
    "Общо",
    "Селско, горско и рибно стопанство",
    "Добивна промишленост",
    "Преработваща промишленост",
    "Производство и разпределение на електрическа и топлинна енергия",
    "Доставяне на води;канализационни услуги,управление на отпадъци",
    "Строителство",
    "Търговия; ремонт на автомобили и мотоциклети",
    "Транспорт, складиране и съобщения",
    "Хотелиерство и ресторантьорство",
    "Създаване и разпространение на информация и творчески продукти; далекосъобщения",
    "Финансови и застрахователни дейности",
    "Операции с недвижими имоти",
    "Професионални дейности и научни изследвания",
    "Административни и спомагателни дейности",
    "Държавно управление",
    "Образование",
    "Хуманно здравеопазване и социална работа",
    "Култура,спорт и развлечения",
    "Други дейности",
]

# The quarterly figures the fixture publishes for 2026-Q1. `Total` sits inside
# the range of the sections, which is the connector's regression guard.
_Q1_2026 = [
    1407.0,
    981.0,
    1713.0,
    1201.0,
    2060.0,
    1048.0,
    1110.0,
    1220.0,
    1214.0,
    870.0,
    3176.0,
    2226.0,
    1259.0,
    1923.0,
    1209.0,
    1591.0,
    1437.0,
    1382.0,
    1260.0,
    1014.0,
]

# March is the annual bonus peak, so the MONTHLY block carries visibly
# different figures. If the parser ever reads the monthly table instead, the
# assertions below land on these rather than on the published quarter.
_MARCH_BONUS_MULTIPLE = 1.14
_MARCH_2026 = [v * _MARCH_BONUS_MULTIPLE for v in _Q1_2026]


def _build_sector_year_sheet(
    wb: openpyxl.Workbook,
    year: int,
    *,
    names: list[str],
    quarterly: list[float],
    sheet_suffix: str,
    activity_label: str,
    ownership_label: str,
    months_label: str,
    quarters_label: str,
    total_title: str,
    bonus_header: str,
    is_preliminary: bool = True,
    quarter_headers: list[str] | None = None,
) -> None:
    """Append one per-year sheet with all FOUR blocks the live file stacks.

    Monthly by activity, monthly by ownership, quarterly by activity, quarterly
    by ownership — plus the two rows that carry the word `Total` in column 0 and
    no data at all. Those two are the reason a label-only lookup cannot work,
    so a fixture without them would test a sheet НСИ do not publish.
    """
    ws = wb.create_sheet(f"{year}{sheet_suffix}")
    headers = quarter_headers if quarter_headers is not None else LIVE_QUARTER_HEADERS
    star = "*" if is_preliminary else ""

    ws.append([None])
    ws.append([f"AVERAGE GROSS MONTHLY WAGES AND SALARIES ... {year}{star}"])
    ws.append([total_title])  # a TITLE row carrying `Total` and no figures
    ws.append(["(EUR) "])

    # Block 1 — monthly by activity. Twelve month columns; only March is filled,
    # and with the bonus-inflated figure.
    ws.append([activity_label, months_label])
    ws.append([None, *["I", "II", "III", "IV", "V", "VI"]])
    # Derived from this sheet's own quarterly figures rather than from the
    # module constant, so the monthly block has one row per activity whatever
    # list of activities the sheet carries. The bonus multiple is what matters:
    # a parser that reads the monthly table lands on a visibly different number.
    for name, q in zip(names, quarterly, strict=True):
        ws.append([name, None, None, q * _MARCH_BONUS_MULTIPLE])
    ws.append([None])
    ws.append([None])

    # Block 2 — monthly by ownership.
    ws.append(["(EUR) "])
    ws.append([ownership_label, months_label])
    ws.append([None, *["I", "II", "III"]])
    ws.append(["Public sector", None, None, 1412.0])
    ws.append(["Private sector", None, None, 1497.0])
    ws.append([None])
    ws.append([None])

    # Block 3 — quarterly by activity. The one the connector must read.
    ws.append([total_title])  # the SECOND `Total` title row
    ws.append(["(EUR) "])
    ws.append([activity_label, f"{quarters_label} {year}"])
    ws.append([None, *headers, bonus_header])
    for name, q1 in zip(names, quarterly, strict=True):
        # Q4 and the bonus column are filled for the earlier year only; for the
        # current one Q1 is all НСИ have published.
        ws.append([name, q1, None, None, None, None])
    ws.append([None])
    ws.append([None])

    # Block 4 — quarterly by ownership. Immediately after the block above, so a
    # read that does not stop at the blank label runs straight into it.
    ws.append(["(EUR) "])
    ws.append([ownership_label, f"{quarters_label} {year}"])
    ws.append([None, *headers, bonus_header])
    ws.append(["Public sector", 1398.0])
    ws.append(["Private sector", 1410.0])
    ws.append(["*Preliminary data"])


def _sector_edition_spec(bulgarian: bool, names: list[str] | None = None) -> dict:
    """Every label that differs between the two language editions, in one place.

    The tests that give the two YEARS different activity lists or different
    lengths build their sheets one at a time, and they need the same labels this
    does. Writing the pairs out twice is how one copy ends up with «Тримесечия»
    against `Quarters` and a fixture that tests the wrong edition.
    """
    return {
        "names": names or (_SECTOR_NAMES_BG if bulgarian else _SECTOR_NAMES_EN),
        "sheet_suffix": "КИД2008" if bulgarian else "NaceRev2",
        "activity_label": "Икономически дейности" if bulgarian else "Economic activity",
        "ownership_label": "Форма на собственост" if bulgarian else "Type of ownership",
        "months_label": "Месеци" if bulgarian else "Months",
        "quarters_label": "Тримесечия на" if bulgarian else "Quarters",
        "total_title": "\xa0Общо" if bulgarian else "Total",
        "bonus_header": BONUS_HEADER_BG if bulgarian else BONUS_HEADER,
    }


def _sector_workbook(bulgarian: bool) -> openpyxl.Workbook:
    """A workbook with the combined sheet both editions carry, and nothing else.

    That sheet's name must NOT match the per-year pattern; if it ever does, the
    parser reads a sheet whose columns are years rather than quarters.
    """
    wb = openpyxl.Workbook()
    wb.active.title = "2019-2026Кид2008 " if bulgarian else "2019-2026NaceRev2"
    wb.active.append(["Икономически дейности" if bulgarian else "Economic activity"])
    return wb


def _saved(wb: openpyxl.Workbook) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_sector_xlsx(
    *,
    bulgarian: bool = False,
    quarterly: list[float] | None = None,
    names: list[str] | None = None,
    **kwargs,
) -> bytes:
    """One language edition of the by-sector workbook, both years."""
    wb = _sector_workbook(bulgarian)
    spec = {**_sector_edition_spec(bulgarian, names), **kwargs}
    _build_sector_year_sheet(wb, 2025, quarterly=[v * 0.92 for v in _Q1_2026], **spec)
    _build_sector_year_sheet(wb, 2026, quarterly=quarterly or _Q1_2026, **spec)
    return _saved(wb)


def _serve_sector_fixtures(
    monkeypatch: pytest.MonkeyPatch,
    en: bytes | None = None,
    bg: bytes | None = None,
) -> None:
    """Serve each language edition from the URL the connector asks for."""
    en_bytes = en if en is not None else _build_sector_xlsx()
    bg_bytes = bg if bg is not None else _build_sector_xlsx(bulgarian=True)

    def _fake(url: str, timeout: float = 30.0) -> bytes:
        return bg_bytes if url == nsi.SECTOR_SOURCE_URL_BG else en_bytes

    monkeypatch.setattr(nsi, "_get_xlsx", _fake)


def test_sector_connector_reads_the_published_quarter_not_the_month(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The quarterly block, chosen past two `Total` title rows and a monthly one.

    Four blocks share the sheet and two rows carry `Total` with no figures, so a
    label-only lookup finds a row of blanks first and the monthly table second.
    March is the annual bonus peak — 14% above the quarter in this fixture — so
    reading the wrong block overstates every sector without looking wrong.
    """
    _serve_sector_fixtures(monkeypatch)
    result = nsi.fetch_sector_salary_eu()

    assert result["ref_period"] == "2026-Q1"
    assert len(result["sectors"]) == 20
    by_name = {s["en_name"]: s["value_eur"] for s in result["sectors"]}
    assert by_name["Total"] == pytest.approx(1407.0)
    assert by_name["Information and communication"] == pytest.approx(3176.0)
    # And nothing from the monthly block reached the payload.
    assert all(v not in _MARCH_2026 for v in by_name.values())


def test_the_ownership_block_is_never_read_as_an_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The block ends at the first blank label, not at the end of the sheet.

    `Public sector` and `Private sector` sit two rows below the last activity
    and carry wages of the same magnitude, so a read that runs on accepts them
    as sections and reports 22 activities where НСИ publish 19 plus a total.
    """
    _serve_sector_fixtures(monkeypatch)
    names = {s["en_name"] for s in nsi.fetch_sector_salary_eu()["sectors"]}

    assert "Public sector" not in names
    assert "Private sector" not in names


def test_the_annual_bonus_column_is_never_read_as_a_sector_quarter() -> None:
    """`IV incl.annual bonuses` is a different quantity wearing Q4's name.

    Checked in BOTH spellings, because the by-sector table is read in both
    editions and the Bulgarian one heads that column «IV вкл.годишни премии».
    A guard that fires in one language leaves the other file undefended.
    """
    assert _roman_quarter(BONUS_HEADER) is None
    assert _roman_quarter(BONUS_HEADER_BG) is None
    assert _roman_quarter("IV") == 4

    header = [None, *LIVE_QUARTER_HEADERS, BONUS_HEADER_BG]
    assert _quarter_columns(header) == {1: 1, 2: 2, 3: 3, 4: 4}


def test_the_two_language_editions_must_agree_cell_for_cell(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Positional pairing is only safe while the two editions are in step.

    НСИ publish the same figures in both files, so an inserted or reordered row
    shows up as a value mismatch. Without this the connector would ship section
    J's wage under section K's Bulgarian name — plausible on screen, and wrong
    in exactly the way nobody would query.
    """
    shuffled = list(_Q1_2026)
    shuffled[10], shuffled[11] = shuffled[11], shuffled[10]
    _serve_sector_fixtures(monkeypatch, bg=_build_sector_xlsx(bulgarian=True, quarterly=shuffled))

    with pytest.raises(ValueError, match="no longer in the same order"):
        nsi.fetch_sector_salary_eu()


def test_a_year_sheet_that_reorders_the_activities_is_an_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One edition's own sheets must list the activities in one order.

    The series a sector carries is accumulated ACROSS the per-year sheets by
    POSITION, so a year that reorders its rows welds one section's earlier
    quarters onto another section's later ones — and the headline `value_eur`,
    read at the newest quarter, becomes the wrong section's wage under the right
    section's name.

    The cross-edition check cannot see this. It compares English against
    Bulgarian, and НСИ reorder both files together, so both sides move and every
    paired cell still matches. This is the only guard between a re-cut
    classification and a picker that quietly answers «Строителство» with
    Information and communication's 3176.
    """
    swapped = list(_SECTOR_NAMES_EN)
    swapped[10], swapped[11] = swapped[11], swapped[10]

    def _mixed_edition(bulgarian: bool = False) -> bytes:
        """2025 in НСИ's order, 2026 with two sections transposed."""
        wb = _sector_workbook(bulgarian)
        ordered = _SECTOR_NAMES_BG if bulgarian else _SECTOR_NAMES_EN
        spec = _sector_edition_spec(bulgarian)
        _build_sector_year_sheet(
            wb, 2025, **{**spec, "names": ordered}, quarterly=[v * 0.92 for v in _Q1_2026]
        )
        _build_sector_year_sheet(
            wb, 2026, **{**spec, "names": ordered if bulgarian else swapped}, quarterly=_Q1_2026
        )
        return _saved(wb)

    _serve_sector_fixtures(monkeypatch, en=_mixed_edition(), bg=_mixed_edition(bulgarian=True))

    with pytest.raises(ValueError, match="different order or under"):
        nsi.fetch_sector_salary_eu()


def test_an_activity_count_that_is_not_nineteen_plus_the_total_is_an_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """НСИ publish 19 NACE Rev 2 sections and one all-activities row.

    The block is bounded by a blank label, which is layout rather than meaning:
    a stray blank inside the table truncates it, and a filled row where НСИ left
    a gap extends it into whatever sits below. Either way the picker silently
    offers a different list of sections than the classification has, and every
    figure on it still looks like a wage. The count is the only thing that
    notices a section went missing.
    """
    short_values = list(_Q1_2026)[:-1]

    def _short_edition(bulgarian: bool = False) -> bytes:
        """Both years one section short — «Други дейности» never published."""
        wb = _sector_workbook(bulgarian)
        spec = _sector_edition_spec(
            bulgarian, list(_SECTOR_NAMES_BG if bulgarian else _SECTOR_NAMES_EN)[:-1]
        )
        _build_sector_year_sheet(wb, 2025, quarterly=[v * 0.92 for v in short_values], **spec)
        _build_sector_year_sheet(wb, 2026, quarterly=short_values, **spec)
        return _saved(wb)

    _serve_sector_fixtures(monkeypatch, en=_short_edition(), bg=_short_edition(bulgarian=True))

    with pytest.raises(ValueError, match="activity rows, expected 20"):
        nsi.fetch_sector_salary_eu()


def test_the_headline_quarter_is_one_every_activity_carries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`ref_period` is the latest quarter published for ALL of them, not for any.

    НСИ fill the quarterly block column by column, and a release caught mid-way
    has a newer quarter for some sections and not others. Taking the latest
    quarter ANY section carries gives the payload a `ref_period` that is true of
    part of itself: the sections that have it render, and the rest are a picker
    entry that answers with nothing.

    Here 2026-Q2 exists for exactly one section, so a connector reading the union
    would headline Q2 while eighteen sections stop at Q1.
    """
    _serve_sector_fixtures(monkeypatch)
    ragged = nsi.fetch_sector_salary_eu()
    assert ragged["ref_period"] == "2026-Q1"

    # Give ONE section a further quarter, in both editions so the cell-for-cell
    # check still passes and this guard is the only thing left to trip.
    def _with_extra_quarter(bulgarian: bool = False) -> bytes:
        raw = _build_sector_xlsx(bulgarian=bulgarian)
        wb = openpyxl.load_workbook(io.BytesIO(raw))
        ws = wb["2026КИД2008" if bulgarian else "2026NaceRev2"]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        header = nsi._activity_block_header(
            rows,
            "Икономически дейности" if bulgarian else "Economic activity",
            "тримесечия" if bulgarian else "quarters",
        )
        # Column C is Q2 in the quarterly block; the row two below the header
        # opens the data and is the all-activities row's first section.
        ws.cell(row=header + 3, column=3, value=1000.0)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    _serve_sector_fixtures(
        monkeypatch, en=_with_extra_quarter(), bg=_with_extra_quarter(bulgarian=True)
    )
    result = nsi.fetch_sector_salary_eu()

    assert result["ref_period"] == "2026-Q1", (
        "the headline moved to a quarter only one activity carries, so the "
        "payload's ref_period is true of part of itself"
    )
    assert all(result["ref_period"] in s["series_by_period"] for s in result["sectors"]), (
        "an activity has no value at the payload's own ref_period"
    )


def test_the_all_activities_row_must_sit_inside_the_sections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An average over the sections cannot be above all of them.

    The by-sector counterpart of the Sofia-city/province guard: if the block
    selector drifts onto a title row or the ownership table, the relationship
    between the total and the sections it averages is what breaks first.
    """
    impossible = [9999.0, *_Q1_2026[1:]]
    _serve_sector_fixtures(
        monkeypatch,
        en=_build_sector_xlsx(quarterly=impossible),
        bg=_build_sector_xlsx(bulgarian=True, quarterly=impossible),
    )

    with pytest.raises(ValueError, match="Regression guard"):
        nsi.fetch_sector_salary_eu()


def test_no_sector_figure_is_computed_only_selected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every figure returned is a cell НСИ published.

    The same property `test_no_figure_is_computed_only_selected` holds for the
    regional table, and it is invisible on screen for the same reason: an
    averaging step here would move no number a reader could check against the
    workbook. The mean of a sector's two published quarters appears nowhere.
    """
    _serve_sector_fixtures(monkeypatch)
    result = nsi.fetch_sector_salary_eu()

    published = set(_Q1_2026) | {v * 0.92 for v in _Q1_2026}
    for sector in result["sectors"]:
        assert set(sector["series_by_period"].values()) <= published
        assert sector["value_eur"] == sector["series_by_period"][result["ref_period"]]


def test_sector_labels_are_нси_own_strings_in_both_languages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The Bulgarian label is НСИ's, never a translation of their English.

    Section J is the case the feature turns on: НСИ call it «Създаване и
    разпространение на информация и творчески продукти; далекосъобщения», which
    no reader mistakes for «ИТ». A translated "Information and communication"
    would invite exactly that reading, so the label has to come from their own
    Bulgarian edition.
    """
    _serve_sector_fixtures(monkeypatch)
    sectors = nsi.fetch_sector_salary_eu()["sectors"]
    j = next(s for s in sectors if s["en_name"] == "Information and communication")

    assert j["bg_name"] == _SECTOR_NAMES_BG[10]
    assert "далекосъобщения" in j["bg_name"]
    assert all(s["bg_name"] and s["en_name"] for s in sectors)


def test_the_sector_preliminary_marker_comes_from_the_year_title(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """НСИ star a whole year on the sheet title until they finalise it.

    The counterpart of `test_the_preliminary_marker_comes_from_the_year_title`
    for the by-sector table, and the flag is load-bearing rather than
    decorative: it is what puts «(предварителни данни)» on the source line
    under the reader's own gap. A parse that stops finding the star fails
    SILENTLY to `False`, and the card then shows a figure НСИ will revise as a
    settled one — more certainty than exists (P4), with no other assertion in
    this file disturbed.
    """
    _serve_sector_fixtures(monkeypatch)
    assert nsi.fetch_sector_salary_eu()["is_preliminary"] is True

    _serve_sector_fixtures(
        monkeypatch,
        en=_build_sector_xlsx(is_preliminary=False),
        bg=_build_sector_xlsx(bulgarian=True, is_preliminary=False),
    )
    assert nsi.fetch_sector_salary_eu()["is_preliminary"] is False


def test_the_transform_carries_the_preliminary_flag_into_the_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The connector reads the star; this is what puts it in the file.

    `test_the_sector_preliminary_marker_comes_from_the_year_title` above stops
    at the scrape. Between it and the reader is `build_sector_salary_payload`,
    and the flag has to survive that step: hardwiring it to `False` there
    publishes a preliminary quarter as settled with every connector assertion
    in this file still passing, because none of them looks at the payload.

    The site suites cannot cover the gap either. They read the COMMITTED
    `sector_salary.json`, so a transform that dropped the flag would look
    correct until a refresh regenerated the file — and then go red in a data
    commit, a long way from the line that caused it.
    """
    _serve_sector_fixtures(monkeypatch)
    scrape = nsi.fetch_sector_salary_eu()
    assert scrape["is_preliminary"] is True

    def _payload(flag: bool) -> dict:
        return build_sector_salary_payload(
            {**scrape, "is_preliminary": flag},
            as_of=date(2026, 8, 6),
            source_url=nsi.SECTOR_SOURCE_URL_EN,
            source_url_bg=nsi.SECTOR_SOURCE_URL_BG,
        )

    # Both ways, so a hardwired constant fails whichever one it was hardwired
    # to. Asserting only the True case passes a payload stuck at True, which
    # marks every finalised quarter provisional.
    assert _payload(True)["is_preliminary"] is True
    assert _payload(False)["is_preliminary"] is False

    # And the figures reach the payload as the cells they were. The gate holds
    # the same identity from the payload's own side; this holds it across the
    # step that builds it, where a rounding or a unit conversion would go.
    built = _payload(True)
    assert [s["value_eur"] for s in built["sectors"]] == [s["value_eur"] for s in scrape["sectors"]]
    assert built["ref_period"] == scrape["ref_period"]
