"""Tests for the Държавен вестник connector — the ТЗПБ appendix.

The failure this suite is built around is not a crash. It is a table that
parses SHORT or parses the WRONG appendix, because both publish a plausible
employer cost for somebody's sector and neither raises anything. So most of
what follows feeds the parser a document that is wrong in one specific way and
asserts it refuses, rather than asserting that the good document works.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from vyarno_pipeline.sources import dv

FIXTURES = Path(__file__).resolve().parent / "fixtures"
PAGE = (FIXTURES / "dv_zbdoo_2026_tzpb.html").read_text(encoding="utf-8")

JAN = "Приложение № 2 към чл. 14, т. 1"
AUG = "Приложение № 2А към чл. 14, т. 2"


def test_the_august_appendix_parses_whole() -> None:
    rows = dv.parse_tzpb_table(PAGE, AUG)
    assert len(rows) == 87
    assert rows["41"] == {
        "name": "Строителство на жилищни и нежилищни сгради",
        "rate_pct": 1.1,
    }
    assert rows["62"]["rate_pct"] == 0.4


def test_every_rate_sits_inside_the_span_kso_delegates() -> None:
    """КСО чл. 6, ал. 1, т. 7 bounds what ЗБДОО may set — 0,4 to 1,1 на сто."""
    for appendix in (JAN, AUG):
        for code, row in dv.parse_tzpb_table(PAGE, appendix).items():
            assert 0.4 <= row["rate_pct"] <= 1.1, f"{appendix} {code}"


def test_the_two_appendices_are_read_apart() -> None:
    """чл. 14 splits 2026 in two, and only seven activities move between them.

    The whole reason the appendix is named at the call site. A parser that
    matched «the ТЗПБ table» would take Приложение № 2 for the entry in force
    from 1 August, which is the wrong rate for seven sectors and right for the
    other eighty — the shape of wrong that never announces itself.
    """
    jan, aug = dv.parse_tzpb_table(PAGE, JAN), dv.parse_tzpb_table(PAGE, AUG)
    moved = {c: (jan[c]["rate_pct"], aug[c]["rate_pct"]) for c in jan if jan[c] != aug[c]}
    assert moved == {
        "10": (0.7, 0.9),
        "19": (0.9, 1.1),
        "59": (0.4, 0.5),
        "71": (0.7, 0.5),
        "82": (0.4, 0.5),
        "93": (0.5, 0.7),
        "99": (0.5, 0.4),
    }


def test_both_decimal_separators_read_as_the_same_rate() -> None:
    """ДВ set 1,1 in one appendix and 1.1 in the other, in one act."""
    assert dv.parse_tzpb_table(PAGE, JAN)["02"]["rate_pct"] == 1.1
    assert dv.parse_tzpb_table(PAGE, AUG)["02"]["rate_pct"] == 1.1


def test_an_absent_appendix_is_refused_rather_than_falling_through() -> None:
    with pytest.raises(ValueError, match="not in this ДВ material"):
        dv.parse_tzpb_table(PAGE, "Приложение № 9 към чл. 14, т. 9")


def test_a_rate_outside_the_statutory_span_is_refused() -> None:
    """A third column that is not the rate column, caught by КСО's own bounds."""
    broken = PAGE.replace(
        '<p align="center"><span>1.1</span></p>',
        '<p align="center"><span>4.8</span></p>',
        1,
    )
    with pytest.raises(ValueError, match="outside КСО"):
        dv.parse_tzpb_table(broken, AUG)


def test_a_duplicated_activity_is_refused() -> None:
    rows = re.findall(r"(?s)<tr>\s*<td>\s*<p align=\"center\"><span>02</span>.*?</tr>", PAGE)
    assert rows, "the fixture no longer contains a division row shaped like this"
    with pytest.raises(ValueError, match="appears twice"):
        dv.parse_tzpb_table(PAGE.replace(rows[-1], rows[-1] * 2), AUG)


def test_a_short_table_is_refused() -> None:
    """Eighty rows that parsed is not eighty-seven rows that exist.

    A dropped row publishes no ТЗПБ rate for its whole КИД division, and the
    section that division belongs to then reports a narrower range than the law
    sets — a figure that is wrong in the direction of looking more precise.
    """
    head = PAGE[: PAGE.index(AUG)]
    kept = re.findall(r"(?s)<tr>.*?</tr>", PAGE[PAGE.index(AUG) :])[:20]
    with pytest.raises(ValueError, match="fewer than the"):
        dv.parse_tzpb_table(head + AUG + "<table>" + "".join(kept) + "</table>", AUG)


def test_the_issue_header_reads_as_an_iso_date() -> None:
    """ДВ print «28.7.2026» unpadded; the entry cites 2026-07-28."""
    assert dv.parse_issue(PAGE) == (68, "2026-07-28")


def test_a_material_with_no_issue_header_is_refused() -> None:
    with pytest.raises(ValueError, match="no «брой"):
        dv.parse_issue("<html><body>Приложение № 2А</body></html>")


def test_a_material_id_addressing_another_act_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The id cannot be derived from the issue, so the citation is the check.

    `payroll.py` records an `idMat` once and reuses it. Nothing stops ДВ
    renumbering, and the failure mode is silent: another year's ЗБДОО carries
    an appendix by the same name, full of rates that are the right shape and
    the wrong law.
    """
    monkeypatch.setattr(dv, "_get_page", lambda url: PAGE)
    with pytest.raises(ValueError, match="addresses a different act"):
        dv.fetch_tzpb_appendix(244982, AUG, expect_issue=61, expect_date="2025-07-22")


def test_a_verified_fetch_carries_its_own_citation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dv, "_get_page", lambda url: PAGE)
    got = dv.fetch_tzpb_appendix(244982, AUG, expect_issue=68, expect_date="2026-07-28")
    assert got["gazette_issue"] == 68
    assert got["gazette_date"] == "2026-07-28"
    assert got["source_url"].endswith("idMat=244982")
    assert len(got["activities"]) == 87
