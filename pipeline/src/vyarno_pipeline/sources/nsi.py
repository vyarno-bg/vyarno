"""НСИ XLSX connectors — the Sofia-city and the by-sector average gross wage.

    https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.2_EUR_EN.xlsx
    https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.1_EUR_EN.xlsx
    https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.1_EUR.xlsx

Two sibling tables from one publisher, in EUR: `1.1.2.2` by region and `1.1.2.1`
by economic activity. Both are read for НСИ's own **published quarterly
averages** — never a month, and never a figure this code computed.

The regional average gross wage table (BG statistical regions and districts),
in EUR. We read the `{year}trimes` sheets — НСИ's own **published quarterly
averages** by region — for `-Sofia cap.` (the Sofia-city statistical region).

**Why the quarter and not the month.** BG wages have a strong seasonal shape and
March is the annual peak, as Q1 bonus and 13th-salary payments land: the
March-over-February step runs +7% to +13% and has grown every year. Anchoring
the salary distribution to a single month scales every rung by whatever seasonal
factor the last refreshed month happened to carry.

**Why НСИ's published quarter and not an average of their months.** The
workbook carries both, and the published quarter is the one to take. It is
authoritative rather than persuasive: for Q1 2026 НСИ publish 1915, where the
mean of their three rounded monthly cells gives 1914.7 — a rounding error with
nothing to buy it. And it keeps every figure in the payload one НСИ published,
which is what §2.1.1 of their licence needs, since it forbids distributing
производни и сборни произведения (docs/legal.md §НСИ).

**The Q4 trap.** Every `{year}trimes` sheet publishes Q4 twice: `IV` and
`IV incl.annual bonuses`. The two diverge by 6-8% (2025: 1859 against 2009)
because the second folds in the 13th salary. Taking the wrong one would step the
whole ladder up every fourth quarter and back down in Q1. We take `IV`, and
`_quarter_columns` refuses any column whose header mentions a bonus.

**The header trap.** The quarter headers mix alphabets — Q1 and Q2 are Cyrillic
І (U+0406), Q3 and Q4 are Latin I and V. `_roman_quarter` folds the Cyrillic
form onto the Latin one rather than matching literals, so the parse survives НСИ
normalising the encoding either way.

**Why EUR, not BGN.** The same table exists in BGN but lags by one quarterly
release cycle. Every other number in the SPA is EUR, so publishing in EUR avoids
a unit mismatch.

**Why the XLSX, not the HTML landing page.** The page uses rowspan/colspan
headers that roll forward every quarter and break naive parsers. The XLSX has a
stable schema — the same column layout for every year sheet.

**The regression guard.** If НСИ restructures the file this connector would
start reading the wrong cells, so it asserts that `-Sofia cap.` sits well above
`-Sofia` (the province) in the same quarter. If the two converge, the selector
matched the wrong row.

THE BY-SECTOR TABLE (`Labour_1.1.2.1`)
--------------------------------------

19 NACE Rev 2 sections plus `Total`, on the same quarterly rhythm. The three
traps above all apply to it unchanged; three more are specific to it.

**Both language editions are read, because the labels are the product.** НСИ
publish the identical table twice — `_EUR_EN.xlsx` with English section names,
`_EUR.xlsx` with Bulgarian ones — and the site needs both. Translating НСИ's
English ourselves would be the whole hazard of this feature in one step: their
Bulgarian name for section J is «Създаване и разпространение на информация и
творчески продукти; далекосъобщения», which nobody mistakes for «ИТ», while a
translation of "Information and communication" invites exactly that reading. So
each label is the one НСИ printed in that language.

**The two editions pin each other.** They carry the same figures, so the rows
are paired by position and every paired cell must be equal. That is what makes
positional pairing safe: if НСИ reorder or insert a row in one edition, the
values stop matching and the parse raises instead of shipping section J's wage
under section K's name.

**Each sheet stacks FOUR blocks, and two of them are titles.** Monthly by
activity, monthly by ownership, quarterly by activity, quarterly by ownership —
and `Total` appears in column 0 of four rows, two of which are section titles
with no data at all. A label scan finds a title row before either data row.
Every block here is therefore bounded from the header row it was found by, and
terminated by the first blank label, so no read can cross into the next block.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
import openpyxl

# Canonical URL. If НСИ moves it,
# `tests/test_nsi.py::test_connector_url_is_nsi_timeseries_xlsx` fails before a
# mis-extracted number can reach production.
SOURCE_URL = (
    "https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.2_EUR_EN.xlsx"
)

# One sheet per year of published quarterly averages: "2020trimes" ..
# "2026trimes". The workbook also carries a monthly sheet ("2019-2026") and a
# quarterly block appended to it; the per-year sheets are the ones that label
# their own year and carry the preliminary marker in their title, so they are
# what we parse.
QUARTERLY_SHEET_SUFFIX = "trimes"

# Row layout of a `{year}trimes` sheet, identical in all seven:
#   r0      = blank padding
#   r1      = title, ending in "*" while the year is preliminary
#   r2      = "(EUR)" unit marker
#   r3      = col 0 "Statistical regions", col 1 "Quarters {year}"
#   r4      = quarter headers: " І", "ІІ", "III", "IV", "IV incl.annual bonuses"
#   r5..    = region rows
# Row indices are not hardcoded below — regions are found by name and the
# quarter columns by their header — because a single inserted row upstream
# would otherwise shift every reading by one region silently.
QUARTER_HEADER_ROW = 4
SOFIA_CAP_REGION_NAME = "-Sofia cap."
SOFIA_PROVINCE_REGION_NAME = "-Sofia"

# Q4 is published twice and the second column includes the 13th salary. Taking
# it would step the ladder up every fourth quarter — see the module docstring.
#
# Both spellings, because the by-sector table is read in both language editions
# and the Bulgarian one heads that column «IV вкл.годишни премии».
#
# The exact match at the end of `_roman_quarter` rejects both spellings on its
# own today, so these markers change no behaviour against the current headers.
# They are what holds if that exact match is ever relaxed to tolerate a trailing
# note in the header — a reasonable-looking change, since it would let the parse
# survive НСИ appending a footnote marker to "IV". Loosen it with only the
# English marker present and the Bulgarian file starts reading Q4 as the
# bonus-inclusive column, which is 12% higher and looks like a good year.
_BONUS_MARKERS = ("bonus", "премии")

_ROMAN_TO_QUARTER = {"I": 1, "II": 2, "III": 3, "IV": 4}

# The quarter headers mix alphabets: Cyrillic І (U+0406) for Q1/Q2, Latin I and
# V for Q3/Q4. Fold the Cyrillic letters onto their Latin twins so the parse
# does not depend on which НСИ used this year.
_CYRILLIC_TO_LATIN = str.maketrans({"\u0406": "I", "\u0456": "I", "\u0430": "a"})


def _roman_quarter(header: object) -> int | None:
    """Quarter number from a header cell, or None if it is not one.

    Returns None for the "IV incl.annual bonuses" column, which is a different
    quantity wearing a quarter's name.
    """
    if header is None:
        return None
    text = str(header).strip().translate(_CYRILLIC_TO_LATIN)
    lowered = text.lower()
    if any(marker in lowered for marker in _BONUS_MARKERS):
        return None
    return _ROMAN_TO_QUARTER.get(text.upper())


def _quarter_columns(header_row: list) -> dict[int, int]:
    """Map sheet column index -> quarter number, for the four plain quarters."""
    cols = {
        i: q
        for i, cell in enumerate(header_row)
        if i > 0 and (q := _roman_quarter(cell)) is not None
    }
    if len(cols) != 4 or sorted(cols.values()) != [1, 2, 3, 4]:
        raise ValueError(
            f"Expected four quarter columns I..IV in the header row, got {cols}. "
            f"НСИ may have restructured the quarterly sheets, or renamed the "
            f"annual-bonus column so that it now parses as a quarter."
        )
    return cols


def _region_row(rows: list, name: str) -> list | None:
    """The first row whose col 0 is exactly `name`."""
    for r in rows:
        if r[0] is not None and str(r[0]).strip() == name:
            return list(r)
    return None


def _parse_quarterly_sheet(ws) -> dict[str, Any]:
    """One `{year}trimes` sheet -> the Sofia-city and province quarterly rows.

    Returns `{"year": int, "is_preliminary": bool, "cap": {q: eur},
    "province": {q: eur}}`. Quarters with no value yet are absent.
    """
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    if len(rows) <= QUARTER_HEADER_ROW:
        raise ValueError(f"Sheet {ws.title!r} has {len(rows)} rows — too few to carry a table.")

    year = int(str(ws.title).replace(QUARTERLY_SHEET_SUFFIX, "").strip())
    # The title carries the preliminary marker for the whole year, e.g.
    # "... IN 2026*". НСИ drop the star when the year is final.
    title = str(rows[1][0] or "")
    is_preliminary = title.rstrip().endswith("*")

    cols = _quarter_columns(rows[QUARTER_HEADER_ROW])
    cap = _region_row(rows, SOFIA_CAP_REGION_NAME)
    prov = _region_row(rows, SOFIA_PROVINCE_REGION_NAME)
    if cap is None or prov is None:
        raise ValueError(
            f"Could not locate {SOFIA_CAP_REGION_NAME!r} or "
            f"{SOFIA_PROVINCE_REGION_NAME!r} in sheet {ws.title!r}. НСИ may have "
            f"renamed a region row."
        )

    def _values(row: list) -> dict[int, float]:
        out: dict[int, float] = {}
        for col, q in cols.items():
            if col < len(row) and isinstance(row[col], (int, float)):
                out[q] = float(row[col])
        return out

    return {
        "year": year,
        "is_preliminary": is_preliminary,
        "cap": _values(cap),
        "province": _values(prov),
    }


def _latest_published_quarter(quarters: dict[str, float]) -> str | None:
    """The most recent "YYYY-Qn" key present, or None if there are none.

    "YYYY-Qn" sorts lexicographically as chronologically for any 4-digit year,
    which is why the key is built that way rather than as a tuple.
    """
    return max(quarters) if quarters else None


def _get_xlsx(url: str, timeout: float = 30.0) -> bytes:
    """Single GET with sane defaults. Raises on non-2xx."""
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        return r.content


def fetch_sofia_salary_eu(url: str = SOURCE_URL) -> dict[str, Any]:
    """Fetch the НСИ regional wage XLSX and return Sofia-city's published
    quarterly series plus its latest reading.

    Returns:
        {
            "value_eur": float,             # НСИ's latest published quarter
            "ref_period": "YYYY-Qn",
            "is_preliminary": bool,         # from that year's title marker
            "sofia_province_value_eur": float,   # same quarter, for the guard
            "series_by_period": {"YYYY-Qn": float, ...},  # every published quarter
        }

    Every value returned is a cell НСИ published. Nothing here is averaged,
    rebased or interpolated — see the module docstring on why that matters.

    Raises:
        httpx.HTTPError — network failure
        ValueError      — no quarterly sheet, structure changed, or the
                          Sofia-city/province regression guard tripped
    """
    raw = _get_xlsx(url)

    # openpyxl needs a file-like object. BytesIO works.
    import io

    # NOT read_only: the quarterly sheets are small and `iter_rows` over a
    # read-only worksheet reports dimensions unreliably on these files.
    wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    sheets = [n for n in wb.sheetnames if n.strip().endswith(QUARTERLY_SHEET_SUFFIX)]
    if not sheets:
        raise ValueError(
            f"No {QUARTERLY_SHEET_SUFFIX!r} sheet found in {url}. Available sheets: {wb.sheetnames}"
        )

    series_by_period: dict[str, float] = {}
    province_by_period: dict[str, float] = {}
    prelim_by_period: dict[str, bool] = {}
    for name in sheets:
        parsed = _parse_quarterly_sheet(wb[name])
        year = parsed["year"]
        for q, v in parsed["cap"].items():
            key = f"{year}-Q{q}"
            series_by_period[key] = v
            prelim_by_period[key] = parsed["is_preliminary"]
        for q, v in parsed["province"].items():
            province_by_period[f"{year}-Q{q}"] = v

    ref_period = _latest_published_quarter(series_by_period)
    if ref_period is None:
        raise ValueError(
            f"Parsed {len(sheets)} quarterly sheet(s) from {url} but found no "
            f"{SOFIA_CAP_REGION_NAME!r} value in any of them."
        )

    cap_val = series_by_period[ref_period]
    prov_val = province_by_period.get(ref_period)
    if prov_val is None:
        raise ValueError(
            f"{SOFIA_CAP_REGION_NAME!r} has a value at {ref_period} but "
            f"{SOFIA_PROVINCE_REGION_NAME!r} does not. The two rows should be "
            f"filled together — НСИ likely restructured the sheet."
        )
    if cap_val <= prov_val:
        # Sofia city wages run 50-70% above the rest of Sofia province. If the
        # two converge or invert, the row selector matched the wrong region.
        raise ValueError(
            f"Regression guard: {SOFIA_CAP_REGION_NAME} ({cap_val}) <= "
            f"{SOFIA_PROVINCE_REGION_NAME} ({prov_val}) at {ref_period}. "
            f"Sofia city has the highest regional wage in BG, so this means "
            f"the wrong row was read — check the region names in the connector."
        )

    return {
        "value_eur": cap_val,
        "ref_period": ref_period,
        "is_preliminary": prelim_by_period[ref_period],
        # Regression-guard evidence, kept so a status banner can show the
        # spread if it ever starts collapsing.
        "sofia_province_value_eur": prov_val,
        "series_by_period": series_by_period,
        # НСИ publish no explicit as_of on the workbook; the CLI stamps the
        # payload from the pipeline's own date.today().
        "fetched_at": None,
    }


# ---------------------------------------------------------------------------
# THE BY-SECTOR TABLE — Labour_1.1.2.1, both language editions
# ---------------------------------------------------------------------------

SECTOR_SOURCE_URL_EN = (
    "https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.1_EUR_EN.xlsx"
)
# The Bulgarian edition of the same table carries no language suffix.
SECTOR_SOURCE_URL_BG = (
    "https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.1_EUR.xlsx"
)

# One sheet per year in each edition, named for the classification in that
# edition's language: "2026NaceRev2" and "2026КИД2008". Both files also carry a
# combined "2019-2026…" sheet; the year regex below excludes it by anchoring on
# exactly four digits, which is also why the suffix is matched rather than
# stripped — "2019-2026Кид2008 " differs from its per-year siblings in case and
# in trailing whitespace, and would survive a `.replace()`.
_SECTOR_SHEET_RE_EN = re.compile(r"^(\d{4})NaceRev2$", re.IGNORECASE)
_SECTOR_SHEET_RE_BG = re.compile(r"^(\d{4})КИД2008$", re.IGNORECASE)

# Column 0 of the row that opens a block, per edition. The same string opens the
# MONTHLY block and the QUARTERLY one, so it never identifies a block by itself —
# `_activity_block_header` also requires the period marker below in column 1.
_ACTIVITY_LABEL_EN = "Economic activity"
_ACTIVITY_LABEL_BG = "Икономически дейности"

# Column 1 of that row: "Months" / "Месеци" opens the monthly block, "Quarters
# 2026" / "Тримесечия на 2026 година" the quarterly one. Matched as a prefix
# because the quarterly marker carries the year and the monthly one does not.
_QUARTERLY_MARKER_EN = "quarters"
_QUARTERLY_MARKER_BG = "тримесечия"

# 19 NACE Rev 2 sections plus the all-activities row that heads them.
_SECTOR_ROW_COUNT = 20


def _activity_block_header(rows: list, activity_label: str, quarterly_marker: str) -> int:
    """Index of the row opening the QUARTERLY by-activity block.

    Both the monthly and the quarterly block open with the same column-0 label,
    so the period marker in column 1 is what tells them apart. Returning the row
    INDEX rather than the row is the point: every read below is bounded from it,
    which is what stops a lookup falling through into the ownership block or
    into one of the two `Total` title rows that carry no data.
    """
    for i, row in enumerate(rows):
        if not row or row[0] is None or str(row[0]).strip() != activity_label:
            continue
        marker = str(row[1] or "").strip().lower() if len(row) > 1 else ""
        if marker.startswith(quarterly_marker):
            return i
    raise ValueError(
        f"No quarterly by-activity block found: no row has {activity_label!r} in "
        f"column 0 and a column-1 marker starting {quarterly_marker!r}. НСИ may "
        f"have renamed the block header or dropped the quarterly table."
    )


def _sector_rows(rows: list, header_row: int) -> list[list]:
    """The data rows of one block: from two below its header to the first blank.

    The blank label is the block terminator НСИ's own layout provides. Without
    it a read runs on into the `Type of ownership` block below, whose rows carry
    wages of the same magnitude and would be silently accepted as sectors.
    """
    out: list[list] = []
    for row in rows[header_row + 2 :]:
        if not row or row[0] is None or not str(row[0]).strip():
            break
        out.append(list(row))
    return out


def _parse_sector_sheet(ws, sheet_re, activity_label: str, quarterly_marker: str) -> dict[str, Any]:
    """One per-year sheet -> `{"year", "is_preliminary", "sectors": [(name, {q: eur})]}`.

    Sectors keep НСИ's row ORDER, because that order is what pairs the two
    language editions against each other in `fetch_sector_salary_eu`.
    """
    match = sheet_re.match(str(ws.title).strip())
    if match is None:
        raise ValueError(f"Sheet {ws.title!r} is not a per-year sector sheet.")
    year = int(match.group(1))

    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    header_row = _activity_block_header(rows, activity_label, quarterly_marker)
    cols = _quarter_columns(rows[header_row + 1])
    data = _sector_rows(rows, header_row)
    if len(data) != _SECTOR_ROW_COUNT:
        raise ValueError(
            f"Sheet {ws.title!r} quarterly block has {len(data)} activity rows, "
            f"expected {_SECTOR_ROW_COUNT} (19 NACE Rev 2 sections plus the "
            f"all-activities total). НСИ may have changed the classification."
        )

    # The title carries the preliminary marker for the whole year, as in the
    # regional workbook: "... IN 2026*", "... ПРЕЗ 2026 ГОДИНА*".
    is_preliminary = str(rows[1][0] or "").rstrip().endswith("*")

    sectors = []
    for row in data:
        values = {
            q: float(row[col])
            for col, q in cols.items()
            if col < len(row) and isinstance(row[col], (int, float))
        }
        sectors.append((str(row[0]).strip(), values))
    return {"year": year, "is_preliminary": is_preliminary, "sectors": sectors}


def _parse_sector_edition(raw: bytes, sheet_re, activity_label: str, quarterly_marker: str) -> dict:
    """One language edition -> row-ordered names plus a period-keyed series each."""
    import io

    wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    sheets = [n for n in wb.sheetnames if sheet_re.match(str(n).strip())]
    if not sheets:
        raise ValueError(
            f"No per-year sector sheet matching {sheet_re.pattern} found. "
            f"Available sheets: {wb.sheetnames}"
        )

    names: list[str] = []
    series: list[dict[str, float]] = []
    prelim_by_period: dict[str, bool] = {}
    for name in sorted(sheets):
        parsed = _parse_sector_sheet(wb[name], sheet_re, activity_label, quarterly_marker)
        year = parsed["year"]
        sheet_names = [n for n, _ in parsed["sectors"]]
        if not names:
            names = sheet_names
            series = [{} for _ in names]
        elif sheet_names != names:
            raise ValueError(
                f"Sheet {name!r} lists activities in a different order or under "
                f"different names than the earlier sheets. Pairing the two "
                f"language editions by position is only safe while the order is "
                f"stable, so this is a hard failure rather than a re-sort."
            )
        for i, (_, values) in enumerate(parsed["sectors"]):
            for q, v in values.items():
                series[i][f"{year}-Q{q}"] = v
                prelim_by_period[f"{year}-Q{q}"] = parsed["is_preliminary"]
    return {"names": names, "series": series, "prelim_by_period": prelim_by_period}


def fetch_sector_salary_eu(
    url_en: str = SECTOR_SOURCE_URL_EN,
    url_bg: str = SECTOR_SOURCE_URL_BG,
) -> dict[str, Any]:
    """Fetch НСИ's by-sector average wage table in both language editions.

    Returns:
        {
            "ref_period": "YYYY-Qn",        # latest quarter EVERY sector carries
            "is_preliminary": bool,
            "sectors": [
                {"en_name": str, "bg_name": str, "value_eur": float,
                 "series_by_period": {"YYYY-Qn": float, ...}},
                ...
            ],
        }

    Every value is a cell НСИ published, in the quarter they published it for.
    Nothing here is averaged, rebased, re-levelled or compared — the comparison
    a reader sees is computed in their browser (docs/legal.md §НСИ).

    Raises:
        httpx.HTTPError — network failure
        ValueError      — structure changed, the two editions disagree, or a
                          regression guard tripped
    """
    en = _parse_sector_edition(
        _get_xlsx(url_en), _SECTOR_SHEET_RE_EN, _ACTIVITY_LABEL_EN, _QUARTERLY_MARKER_EN
    )
    bg = _parse_sector_edition(
        _get_xlsx(url_bg), _SECTOR_SHEET_RE_BG, _ACTIVITY_LABEL_BG, _QUARTERLY_MARKER_BG
    )

    if len(en["names"]) != len(bg["names"]):
        raise ValueError(
            f"The two editions list different activity counts: "
            f"{len(en['names'])} English against {len(bg['names'])} Bulgarian."
        )

    # The editions are paired BY POSITION, so this is the check that makes the
    # pairing safe rather than merely convenient: НСИ publish the same figures in
    # both files, so every paired cell must be equal. An inserted or reordered
    # row shifts one edition against the other and lands here, instead of
    # shipping one section's wage under another section's name.
    for i, (en_name, bg_name) in enumerate(zip(en["names"], bg["names"], strict=True)):
        if en["series"][i] != bg["series"][i]:
            raise ValueError(
                f"Row {i} pairs {en_name!r} with {bg_name!r} but their series "
                f"differ, so the two editions are no longer in the same order. "
                f"Refusing to publish a label from one file against a figure "
                f"from the other."
            )

    # The headline quarter is the latest one EVERY sector carries. A quarter
    # where only some are published would leave the picker with sectors that
    # render blank, and a payload whose `ref_period` is true of part of itself.
    common = set.intersection(*(set(s) for s in en["series"])) if en["series"] else set()
    ref_period = _latest_published_quarter(dict.fromkeys(common, 0.0))
    if ref_period is None:
        raise ValueError(
            f"No quarter is published for all {len(en['names'])} activities in "
            f"{url_en}, so there is no period the whole table describes."
        )

    sectors = [
        {
            "en_name": en_name,
            "bg_name": bg["names"][i],
            "value_eur": en["series"][i][ref_period],
            "series_by_period": dict(en["series"][i]),
        }
        for i, en_name in enumerate(en["names"])
    ]

    # Regression guard, the by-sector counterpart of the Sofia-city one. The
    # all-activities row is an average OVER the sections, so it must sit strictly
    # inside their range. It does not if the row selector drifted onto a title
    # row (two carry the word `Total` and no data), onto the public/private
    # ownership block, or onto the monthly table — where the March bonus spike
    # puts several sections above a quarterly total they are below.
    values = [s["value_eur"] for s in sectors[1:]]
    total = sectors[0]["value_eur"]
    if not values or not (min(values) < total < max(values)):
        raise ValueError(
            f"Regression guard: the all-activities row ({total}) does not sit "
            f"between the lowest ({min(values) if values else 'n/a'}) and highest "
            f"({max(values) if values else 'n/a'}) section at {ref_period}. An "
            f"average over the sections must. The block selector likely matched "
            f"the wrong rows."
        )

    return {
        "ref_period": ref_period,
        "is_preliminary": en["prelim_by_period"].get(ref_period, False),
        "sectors": sectors,
        # НСИ publish no explicit as_of on the workbook; the CLI stamps the
        # payload from the pipeline's own date.today().
        "fetched_at": None,
    }
