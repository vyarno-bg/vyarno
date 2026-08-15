"""Държавен вестник connector — the ТЗПБ contribution table, as promulgated.

One thing: **the accident-and-occupational-disease contribution rate for every
economic activity**, which the employer pays alone and which nothing else in
this pipeline can supply. КСО чл. 6, ал. 1, т. 7 sets only the span — «от 0,4
до 1,1 на сто» — and delegates the per-activity figures to the year's ЗБДОО;
чл. 6, ал. 6 puts the whole line on the осигурител. So the employer's side of
the labour tax wedge is a range until this table is read, and it is the one
payroll parameter that is genuinely published rather than reconstructed.

    host     : dv.parliament.bg
    document : a ДВ material, addressed by `idMat`
    tables   : Приложение № 2 / № 2А към чл. 14 — code, activity, rate

WHY THIS IS FETCHED AND THE RATE SPLITS ARE NOT
-----------------------------------------------
`payroll.py` keeps the contribution splits as a dated table because they are
not a document anybody publishes: the employer's 8,22% for фонд „Пенсии“ is
КСО чл. 6, ал. 3, т. 9 (7,1) plus чл. 6, ал. 1, т. 4 (0,56 twice), summed by a
reader. There is no cell anywhere holding 8,22.

The ТЗПБ table is the opposite — 87 rows that exist as a table, change every
year, and would be 87 chances to mistype. So it is fetched, and the rates a
person has to derive stay where a person derived them.

ADDRESSED BY `idMat`, WHICH IS NOT DERIVABLE
--------------------------------------------
ДВ's permalinks are built from an id that the issue number does not yield, so
a URL cannot be constructed from «бр. 68 от 28.07.2026» — it has to be found
once and recorded. `payroll.py`'s entry carries the id it was found for, which
is what makes the fetch pinned to ONE act rather than to whatever ДВ currently
serves under a search. An entry pointing at the wrong material fails the
issue/date cross-check below rather than publishing another year's rates.

WHAT THE GATES CATCH
--------------------
Every one of these is a *silent wrong answer* if it passes unchecked, and none
of them is a network error:

  - the appendix heading is absent — чл. 14 was restructured, and the parser
    would otherwise read whichever table follows;
  - the issue or the date on the page disagrees with the entry — the id points
    at a different act;
  - a rate outside КСО's 0,4–1,1 span — the third column is not the rate
    column, or a footnote was read as a row;
  - a duplicate or missing code — the row regex has caught something that is
    not a division line.

A ТЗПБ rate that is wrong by one band moves the employer's cost by 0.7% of
gross. That is inside every plausible band, which is why the checks are on the
structure rather than on the numbers looking sensible.

LICENCE
-------
ЗАПСП чл. 4, т. 1 puts «нормативни и индивидуални актове на държавни органи за
управление» outside copyright, so this text carries a provenance duty to the
reader and no licence condition to anyone (docs/legal.md §Държавен вестник).
"""

from __future__ import annotations

import re
from typing import Any

import httpx

SOURCE_HOST = "dv.parliament.bg"
MATERIAL_URL_TEMPLATE = "https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat={material_id}"

# The statutory span, КСО чл. 6, ал. 1, т. 7. Not a sanity guess: a rate
# outside it is not a surprising figure, it is a parse that has left the rate
# column. ЗБДОО may place any activity anywhere inside the span, so the gate
# can only be the span itself.
_MIN_RATE_PCT = 0.4
_MAX_RATE_PCT = 1.1

# КИД-2025 numbers its divisions with gaps (there is no 04, 34, 40, …), so the
# floor is a count rather than a range. 87 is what ЗБДОО 2026 carries in both
# of its appendices; a table that lost rows to a regex that stopped matching
# would still parse, and would publish «no ТЗПБ rate for this section» for
# whatever it dropped.
_MIN_ROWS = 80

_ROW_RE = re.compile(r"(?is)<tr[^>]*>(.*?)</tr>")
_CELL_RE = re.compile(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>")
_TAG_RE = re.compile(r"(?s)<[^>]+>")
# ДВ head every material with «брой: 68, от дата 28.7.2026 г.». The day and
# month are NOT zero-padded there, which is why this is parsed rather than
# string-compared against an ISO date.
_ISSUE_RE = re.compile(r"брой:\s*(\d+)\s*,\s*от\s*дата\s*(\d{1,2})\.(\d{1,2})\.(\d{4})")


def _text(fragment: str) -> str:
    """Tag-stripped, entity-decoded, whitespace-collapsed cell text."""
    import html as _html

    return re.sub(r"\s+", " ", _html.unescape(_TAG_RE.sub(" ", fragment))).strip()


def _appendix_slice(page: str, appendix: str) -> str:
    """The document from `appendix`'s heading to the next appendix heading.

    Sliced rather than searched whole because every appendix in the act is a
    table of the same shape: ЗБДОО 2026 carries Приложение № 2 (1 Jan – 31 Jul)
    and № 2А (1 Aug – 31 Dec), differing on seven activities. Parsing "the
    ТЗПБ table" out of the whole page would silently pick the first, which is
    the wrong one for eleven months of the year it is published in.
    """
    start = page.find(appendix)
    if start < 0:
        raise ValueError(
            f"{appendix!r} is not in this ДВ material. Either the id points at "
            f"another act, or чл. 14's appendices were renumbered — in both "
            f"cases the table that follows is not the one asked for."
        )
    # `№ 2` is a prefix of `№ 2А`, so the next heading is looked for past the
    # end of this one. Searching from `start` finds this heading again.
    nxt = page.find("Приложение №", start + len(appendix))
    return page[start : nxt if nxt > start else len(page)]


def parse_tzpb_table(page: str, appendix: str) -> dict[str, dict[str, Any]]:
    """The `{КИД code: {name, rate_pct}}` rows of one ТЗПБ appendix.

    Rows are taken by SHAPE — three cells, a two-digit code, a decimal rate —
    rather than by position in the table. The appendix opens with a header row
    and a column-numbering row (`1 2 3`), and both fail that shape, so neither
    has to be counted past.

    Raises ValueError on anything that would publish a partial table.
    """
    rows: dict[str, dict[str, Any]] = {}
    for row in _ROW_RE.findall(_appendix_slice(page, appendix)):
        cells = [_text(c) for c in _CELL_RE.findall(row)]
        if len(cells) != 3:
            continue
        code, name, rate = cells
        if not re.fullmatch(r"\d{2}", code):
            continue
        # ДВ set the same figure as `1,1` in one appendix and `1.1` in the
        # other, in the same act. Both are the same rate and neither is a typo
        # worth failing over — the separator is the typesetter's.
        m = re.fullmatch(r"(\d+)[.,](\d+)", rate)
        if not m:
            continue
        pct = float(f"{m.group(1)}.{m.group(2)}")
        if not _MIN_RATE_PCT <= pct <= _MAX_RATE_PCT:
            raise ValueError(
                f"{appendix}: activity {code} reads {pct}%, outside КСО чл. 6, "
                f"ал. 1, т. 7's «от 0,4 до 1,1 на сто». The third column is "
                f"not the contribution rate."
            )
        if code in rows:
            raise ValueError(
                f"{appendix}: activity {code} appears twice, at {rows[code]['rate_pct']}% "
                f"and {pct}%. One of them is not a division row."
            )
        rows[code] = {"name": name, "rate_pct": pct}

    if len(rows) < _MIN_ROWS:
        raise ValueError(
            f"{appendix}: {len(rows)} activities parsed, fewer than the {_MIN_ROWS} "
            f"a ЗБДОО appendix carries. A short table publishes «no rate for this "
            f"activity» for everything it dropped, which reads like law."
        )
    return rows


def parse_issue(page: str) -> tuple[int, str]:
    """The ДВ issue number and its date, as `(68, "2026-07-28")`.

    Read off the page rather than trusted from the entry, because it is the
    only thing that proves the `idMat` recorded years ago still addresses the
    act the entry describes. ДВ print the date unpadded, so it is rebuilt into
    ISO rather than matched as a string.
    """
    m = _ISSUE_RE.search(page)
    if not m:
        raise ValueError(
            "this ДВ material carries no «брой: N, от дата D.M.YYYY» header, so "
            "there is nothing to check the entry's citation against."
        )
    issue, day, month, year = m.groups()
    return int(issue), f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def _get_page(url: str) -> str:
    """GET a ДВ material as text. The one network call, so tests replace it."""
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.text


def fetch_tzpb_appendix(
    material_id: int,
    appendix: str,
    *,
    expect_issue: int,
    expect_date: str,
) -> dict[str, Any]:
    """Fetch one ЗБДОО ТЗПБ appendix from ДВ, with its citation verified.

    Args:
        material_id: ДВ's own `idMat` for the act (see the module docstring —
            it cannot be derived from the issue number).
        appendix: the heading to read, e.g. «Приложение № 2А към чл. 14, т. 2».
        expect_issue: the ДВ issue the caller's entry cites.
        expect_date: that issue's date, ISO.

    Raises:
        httpx.HTTPError on network/TLS failure (caller exits 4).
        ValueError when the document is not the act the entry describes, or
            the table does not parse whole.
    """
    url = MATERIAL_URL_TEMPLATE.format(material_id=material_id)
    page = _get_page(url)

    issue, issued_on = parse_issue(page)
    if (issue, issued_on) != (expect_issue, expect_date):
        raise ValueError(
            f"ДВ material {material_id} is issue {issue} of {issued_on}; the "
            f"payroll entry cites бр. {expect_issue} от {expect_date}. The id "
            f"addresses a different act, and its ТЗПБ table is a different "
            f"year's law."
        )

    return {
        "material_id": material_id,
        "appendix": appendix,
        "source_url": url,
        "gazette_issue": issue,
        "gazette_date": issued_on,
        "activities": parse_tzpb_table(page, appendix),
    }
