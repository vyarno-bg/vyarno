"""НСИ XLSX connector — the Sofia-city average quarterly gross wage.

    https://www.nsi.bg/sites/default/files/files/data/timeseries/Labour_1.1.2.2_EUR_EN.xlsx

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
"""

from __future__ import annotations

from typing import Any

import httpx
import openpyxl

# Canonical URL. If НСИ moves it,
# `tests/test_nsi.py::test_nsi_url_responds_with_xlsx` fails before a
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
_BONUS_MARKER = "bonus"

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
    if _BONUS_MARKER in text.lower():
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
