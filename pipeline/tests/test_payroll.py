"""Tests for the BG payroll parameter table and its published payload.

These parameters drive the SPA's gross→net math. The table
(`payroll.BG_PAYROLL_TABLE`) is the single source of truth; the frozen
constants in `site/src/lib/mirror.js` must stay in parity with it (they
are only an offline sentinel). The parity assertions below are the guard:
if the law changes and only one side is updated, a test fails.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

import pytest

from vyarno_pipeline import clock
from vyarno_pipeline.payroll import (
    BG_PAYROLL_TABLE,
    BGN_PER_EUR,
    EMPLOYER_RATE_DERIVATION,
    NSI_SECTION_DIVISIONS,
    build_payroll_payload,
    build_work_accident_block,
    in_force_entry,
)
from vyarno_pipeline.sources import dv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
MIRROR_JS = PROJECT_ROOT / "site" / "src" / "lib" / "mirror.js"
PUBLISHED_PAYROLL = PROJECT_ROOT / "data" / "published" / "payroll.json"


def _published_payroll() -> dict:
    """The committed payload. An absent one is a failure, never a skip.

    `data/published/payroll.json` is tracked, so a missing one is not a fresh
    clone or a machine that has never run a refresh — it is a committed file
    somebody deleted or moved, and the two tests below are the only things that
    compare the shipped ceiling against `mirror.js`'s sentinel and against the
    law in force. Standing them down there exits 0 and reads exactly like
    having run them.
    """
    if not PUBLISHED_PAYROLL.exists():
        pytest.fail(
            "data/published/payroll.json is missing. It is committed to the "
            "repository — its absence is the bug, not a reason to stand the "
            "parity and staleness checks down. Restore it with "
            "`git checkout -- data/published/payroll.json`."
        )
    return json.loads(PUBLISHED_PAYROLL.read_text(encoding="utf-8"))


def _mirror_const(name: str) -> float:
    """Read a numeric `export const NAME = <number>;` out of mirror.js.

    The parity test below has to read the SPA's actual sentinel. An earlier
    version hardcoded the same numbers on the Python side and called that a
    parity check — it would have stayed green through any drift in
    mirror.js, which is the only direction the check exists to catch.
    """
    src = MIRROR_JS.read_text(encoding="utf-8")
    m = re.search(rf"export const {re.escape(name)}\s*=\s*([0-9.]+)\s*;", src)
    assert m is not None, (
        f"mirror.js no longer exports a numeric `{name}`. The SPA's offline "
        f"payroll sentinel is gone or was renamed — update both sides."
    )
    return float(m.group(1))


def _mirror_rate_lines() -> dict[str, float]:
    """The five `BG_2026_RATES` employee contribution lines from mirror.js."""
    src = MIRROR_JS.read_text(encoding="utf-8")
    block = re.search(r"BG_2026_RATES = Object\.freeze\(\{(.*?)\}\)", src, re.DOTALL)
    assert block is not None, "mirror.js no longer defines BG_2026_RATES"
    return {k: float(v) for k, v in re.findall(r"(\w+):\s*([0-9.]+),", block.group(1))}


def _fixture_tzpb(as_of: date) -> dict:
    """The ТЗПБ appendix the entry in force on `as_of` cites, off the fixture.

    Offline on purpose. `sources/dv.py` owns whether the fetch is correct and
    `test_dv.py` proves it; what this file needs is a real appendix to build
    payloads out of, and reaching the network here would make every payroll
    test fail on a ДВ outage.
    """
    citation = in_force_entry(as_of)["tzpb"]
    page = (FIXTURES / "dv_zbdoo_2026_tzpb.html").read_text(encoding="utf-8")
    return {
        "appendix": citation["appendix"],
        "source_url": dv.MATERIAL_URL_TEMPLATE.format(material_id=citation["dv_material_id"]),
        "gazette_issue": citation["gazette_issue"],
        "gazette_date": citation["gazette_date"].isoformat(),
        "activities": dv.parse_tzpb_table(page, citation["appendix"]),
    }


def test_in_force_entry_picks_latest_applicable() -> None:
    e = in_force_entry(date(2026, 7, 24))
    assert e["effective_year"] == 2026
    # A date before the whole table falls back to the earliest entry.
    assert in_force_entry(date(2000, 1, 1))["effective_year"] == 2026


def test_employee_rates_sum_to_1378() -> None:
    p = build_payroll_payload(date(2026, 7, 24))
    r = p["employee_contrib_rates"]
    parts = r["pension"] + r["pension2"] + r["sickness_maternity"] + r["unemployment"] + r["health"]
    assert r["total"] == pytest.approx(parts)
    assert r["total"] == pytest.approx(0.1378)


def test_parity_with_spa_frozen_constants() -> None:
    """The published values MUST equal the SPA's offline sentinel.

    `mirror.js#BG_PAYROLL_DEFAULT` is what the SPA computes with until
    `payroll.json` resolves. If the two disagree, the user's net pay changes
    under them mid-paint — and after a legislative change, whichever side
    was forgotten keeps computing last year's law.

    This reads the constants OUT of mirror.js rather than restating them
    here, so drift on either side fails.

    The date pinned here is not arbitrary and is not "today": it is the
    `effective_from` of the entry the sentinel mirrors. `BG_PAYROLL_DEFAULT`
    is a single frozen parameter set, so it can only ever mirror one entry of
    a dated table, and the one it has to mirror is whichever is in force in
    the payload being shipped. Move this date in the same commit that moves
    the sentinel, or this test compares the SPA against a superseded law and
    passes while first paint computes the wrong net pay.
    """
    p = build_payroll_payload(date(2026, 8, 1))
    assert p["income_tax_rate"] == pytest.approx(_mirror_const("BG_2026_INCOME_TAX_RATE"))
    assert p["max_insurable_income_eur"] == pytest.approx(
        _mirror_const("BG_2026_MAX_INSURABLE"), abs=0.01
    )
    assert p["min_wage_gross_eur"] == pytest.approx(
        _mirror_const("BG_2026_MIN_WAGE_GROSS"), abs=0.01
    )


def test_parity_of_every_contribution_line_with_the_spa() -> None:
    """Each of the five employee contribution lines must match mirror.js.

    The SPA applies the total, but it displays the split; a line that drifts
    shows the user a breakdown that doesn't add up to their deduction.
    """
    rates = build_payroll_payload(date(2026, 7, 24))["employee_contrib_rates"]
    mirror = _mirror_rate_lines()
    # mirror.js is camelCase, payroll.py is snake_case — same five lines.
    pairs = {
        "pension": "pension",
        "pension2": "pension2",
        "sickness_maternity": "sicknessMaternity",
        "unemployment": "unemployment",
        "health": "health",
    }
    assert set(mirror) == set(pairs.values()), (
        f"mirror.js BG_2026_RATES lines {sorted(mirror)} no longer match the "
        f"pipeline's {sorted(pairs)}"
    )
    for py_key, js_key in pairs.items():
        assert rates[py_key] == pytest.approx(mirror[js_key], abs=1e-9), (
            f"{py_key}: payroll.py {rates[py_key]} vs mirror.js {mirror[js_key]}"
        )
    assert rates["total"] == pytest.approx(sum(mirror.values()), abs=1e-9)


def test_eur_derived_from_bgn_at_fixed_rate() -> None:
    p = build_payroll_payload(date(2026, 7, 24))
    assert p["bgn_per_eur"] == BGN_PER_EUR
    assert p["max_insurable_income_eur"] == pytest.approx(
        p["max_insurable_income_bgn"] / BGN_PER_EUR, abs=0.01
    )
    assert p["min_wage_gross_eur"] == pytest.approx(p["min_wage_gross_bgn"] / BGN_PER_EUR, abs=0.01)


def test_scheduled_change_surfaced_in_eur() -> None:
    """The mid-2026 max-insurable rise to €2300 must be published so the
    SPA can warn about it — not silently hardcoded."""
    p = build_payroll_payload(date(2026, 7, 24))
    sc = p["scheduled_changes"]
    assert any(
        c["field"] == "max_insurable_income" and c["value_eur"] == pytest.approx(2300.0) for c in sc
    )


# ---------------------------------------------------------------------------
# ЗБДОО 2026 — the ceiling moves on 2026-08-01
# ---------------------------------------------------------------------------


def test_the_ceiling_switches_on_the_legislated_date_and_not_before() -> None:
    """€2111.64 through 2026-07-31, €2300 from 2026-08-01.

    The State Social Insurance Budget Act 2026 was adopted on 2026-07-22 and
    dated 2026-08-01. Publishing the new ceiling early overstates everybody's
    contributions; publishing it late understates them for anyone over the
    line, and silently contradicts the payslip they are holding.
    """
    assert build_payroll_payload(date(2026, 7, 31))["max_insurable_income_eur"] == pytest.approx(
        2111.64
    )
    assert build_payroll_payload(date(2026, 8, 1))["max_insurable_income_eur"] == pytest.approx(
        2300.0
    )
    assert in_force_entry(date(2026, 8, 1))["effective_from"] == date(2026, 8, 1)


def test_the_post_euro_ceiling_is_eur_native_not_a_rounded_bgn_conversion() -> None:
    """€2300 exactly — never 4500 BGN ÷ 1.95583 = €2300.81.

    Bulgaria legislates in euro from 2026-01-01, so the statute says €2300 and
    the BGN figure is the derived one. Press coverage rounds it to "≈4500 лв",
    and converting that back would publish a ceiling €0.81 above the law —
    small, plausible, and wrong for everyone it applies to.
    """
    p = build_payroll_payload(date(2026, 8, 1))
    assert p["max_insurable_income_eur"] == 2300.0
    assert p["max_insurable_income_bgn"] == pytest.approx(2300.0 * BGN_PER_EUR, abs=0.01)
    assert p["max_insurable_income_bgn"] != pytest.approx(4500.0, abs=1.0)


def test_an_entry_must_set_exactly_one_currency_side() -> None:
    """Setting both, or neither, is ambiguous — raise rather than pick one.

    With both set they can disagree, and whichever the builder happens to
    prefer becomes the published figure with no signal that the other exists.
    """
    from vyarno_pipeline.payroll import _pair

    base = {"effective_from": date(2026, 1, 1)}
    with pytest.raises(ValueError, match="exactly one"):
        _pair({**base, "x_eur": 1.0, "x_bgn": 2.0}, "x")
    with pytest.raises(ValueError, match="exactly one"):
        _pair(base, "x")
    assert _pair({**base, "x_bgn": 1213.0}, "x")[0] == pytest.approx(620.20)
    assert _pair({**base, "x_eur": 2300.0}, "x")[1] == pytest.approx(4498.41, abs=0.01)


def test_the_entry_in_force_names_the_gazette_issue_that_promulgated_it() -> None:
    """The four figures on /how/ are captioned off this pair.

    `source_url` is dv.parliament.bg's landing page and can be nothing else —
    their permalinks come from a session-side id the issue number does not
    yield — so P9 puts the instrument in the caption instead of behind a link,
    and a year identifies no act.
    """
    p = build_payroll_payload(date(2026, 8, 2))
    assert p["gazette_issue"] == 68
    assert p["gazette_date"] == "2026-07-28"
    # Promulgation starts the clock, so it cannot fall after the entry is in
    # force. Asserted on the shipped pair rather than only inside the guard,
    # because this is the one direction a plausible typo runs.
    assert date.fromisoformat(p["gazette_date"]) <= date.fromisoformat(p["effective_from"])


def test_a_parameter_set_from_several_acts_publishes_no_single_issue() -> None:
    """The January entry's ceiling, flat rate and minimum wage are three
    statutes, so no issue number is true of the set. Both keys are still
    present and null: absent would leave a consumer unable to tell that from an
    envelope written before the citation shipped."""
    p = build_payroll_payload(date(2026, 3, 1))
    assert p["gazette_issue"] is None
    assert p["gazette_date"] is None


def test_a_half_written_gazette_citation_is_refused() -> None:
    """ДВ's archive is indexed by issue AND year, so half of one finds nothing,
    and a bare date names a day several issues were promulgated on."""
    from vyarno_pipeline.payroll import _gazette

    base = {"effective_from": date(2026, 8, 1)}
    with pytest.raises(ValueError, match="half a"):
        _gazette({**base, "gazette_issue": 68})
    with pytest.raises(ValueError, match="half a"):
        _gazette({**base, "gazette_date": date(2026, 7, 28)})
    with pytest.raises(ValueError, match="numbers its issues"):
        _gazette({**base, "gazette_issue": 0, "gazette_date": date(2026, 7, 28)})
    with pytest.raises(ValueError, match="after it came into force"):
        _gazette({**base, "gazette_issue": 68, "gazette_date": date(2026, 8, 2)})
    assert _gazette({**base, "gazette_issue": 68, "gazette_date": date(2026, 7, 28)}) == (
        68,
        "2026-07-28",
    )
    assert _gazette(base) == (None, None)


def test_a_scheduled_change_carries_a_real_date_not_a_condition() -> None:
    """`effective_from` on a scheduled change must be parseable as a date.

    A condition in that field — "2026 (pending the regular state budget)" —
    becomes false the moment the budget passes, and nothing can tell: the SPA
    renders "when it does" with no date, so a reader five days from the change
    has no way to know. A date is checkable; a condition is prose that rots.
    """
    for entry in (build_payroll_payload(date(2026, 7, 24)),):
        for sc in entry["scheduled_changes"]:
            date.fromisoformat(sc["effective_from"])  # raises if it is prose


def test_the_spa_sentinel_matches_the_payroll_json_actually_shipped() -> None:
    """Parity against the file on disk, not against a frozen build date.

    The other parity tests pin `date(2026, 7, 24)`, which is right for what
    they check but blind to the case that matters: `data/published/payroll.json`
    is republished with a new ceiling and `mirror.js`'s offline sentinel is
    forgotten. Both would stay green while first paint computed a net pay the
    page then corrected a moment later.
    """
    p = _published_payroll()
    assert p["max_insurable_income_eur"] == pytest.approx(
        _mirror_const("BG_2026_MAX_INSURABLE"), abs=0.01
    ), "data/published/payroll.json and mirror.js's sentinel disagree — bump the sentinel"
    assert p["min_wage_gross_eur"] == pytest.approx(
        _mirror_const("BG_2026_MIN_WAGE_GROSS"), abs=0.01
    )
    assert p["income_tax_rate"] == pytest.approx(_mirror_const("BG_2026_INCOME_TAX_RATE"))
    assert p["employee_contrib_rates"]["total"] == pytest.approx(
        sum(_mirror_rate_lines().values()), abs=1e-9
    )


def test_the_published_payroll_is_a_pipeline_output_and_never_behind_the_law() -> None:
    """The shipped payload must be this table's own output, and must not be
    computing net pay under a parameter set the law has already replaced.

    Two failures, one test, because they are the two ends of the same missing
    guard: the SPA reads `max_insurable_income_eur` verbatim and compares no
    date to anything. Which parameter set a reader gets is decided once, in
    `in_force_entry`, at the moment a refresh runs — so the page keeps applying
    whatever the last refresh happened to resolve, for as long as nobody runs
    another one.

    **Behind is the failure that hides.** `payroll` carries a 366-day cadence
    (`site/src/lib/payloads.js`) because the table is legislative rather than
    statistical, so a change taking effect on 1 January and going unrefreshed
    raises no staleness banner until the following December. Every net pay,
    every payslip line and the whole tax-wedge curve would be computed under
    superseded law, and each one looks entirely plausible. That is what the
    second assertion is for, and it is the reason this test reads
    `clock.today()` rather than a pinned date: a guard against falling behind
    the calendar cannot itself be frozen to a day.

    **Ahead is deliberate and stays legal here.** A ceiling is enacted weeks
    before it takes effect, and publishing the payload on the day parliament
    dates it — rather than racing a refresh at midnight — is the safer
    direction and the one this repository takes. So the assertion is
    *not behind*, not *equal*.

    The first assertion is what keeps the second honest: a payload assembled by
    hand could satisfy any date check while carrying a figure the table never
    produced. Rebuilding it from its own `as_of` is the cheapest statement of
    the contract the whole repository rests on — `data/published/` is what the
    pipeline emits, so the diff is the review.

    The rebuild reads the ТЗПБ appendix out of the committed ДВ fixture rather
    than off the network, which makes this the check that the shipped
    `work_accident` block is the act's own table and not a hand-edited one.
    """
    p = _published_payroll()

    stamped = date.fromisoformat(p["as_of"])
    assert p == build_payroll_payload(stamped, tzpb=_fixture_tzpb(stamped)), (
        "data/published/payroll.json is not what `build_payroll_payload` emits "
        f"for its own as_of ({p['as_of']}) — it has been edited by hand, or "
        "BG_PAYROLL_TABLE moved under it. Re-run "
        "`vyarno-pipeline refresh --source payroll`."
    )

    shipped_from = date.fromisoformat(p["effective_from"])
    in_force_from = in_force_entry(clock.today())["effective_from"]
    assert shipped_from >= in_force_from, (
        f"data/published/payroll.json applies the parameter set effective "
        f"{shipped_from}, but {in_force_from} is the one in force today. Every "
        "net pay on the site is being computed under superseded law, and "
        "payroll's 366-day cadence means the staleness banner will not say so. "
        "Run `vyarno-pipeline refresh --source payroll` and bump the mirror.js "
        "sentinel to match."
    )


def test_every_employer_rate_reconstructs_from_the_statute_it_cites() -> None:
    """The table's rates against the pieces of law they are summed from.

    This is the only guard on a transcription. `employer_contrib_rates` is five
    literals; nothing else in the repository can tell 8.22 from 8.88, and the
    wrong one is the answer a reader gets by applying КСО's 60:40 to фонд
    „Пенсии“, which is the split that governs the other four funds and not
    that one.

    The employee side is checked from the same table, because if the two are
    derived together and only one is wrong, the derivation is what is wrong.

    **Every entry, not the one in force.** An entry that is not current today
    is one a refresh dated inside its window still resolves to, and nothing
    else in this file reads the January set's employer rates at all — so
    checking `in_force_entry` alone leaves half the table unguarded until the
    day it stops mattering.
    """
    for entry in BG_PAYROLL_TABLE:
        for fund, working in EMPLOYER_RATE_DERIVATION.items():
            where = f"{entry['effective_from']} {fund}: {working['statute']}"
            assert entry["employer_contrib_rates"][fund] == pytest.approx(
                sum(working["employer_parts"]) / 100, abs=1e-9
            ), where
            assert entry["employee_contrib_rates"][fund] == pytest.approx(
                sum(working["employee_parts"]) / 100, abs=1e-9
            ), where


def test_the_pension_fund_is_not_split_sixty_forty() -> None:
    """Пенсии is 7,1+0,56+0,56, and 60:40 of 14,8 is a different number.

    Named on its own because the other four funds ARE 60:40, so the wrong rule
    is the one that generalises. It is worth 0,66 points of every labour cost
    the site prints.
    """
    entry = in_force_entry(date(2026, 8, 1))
    fund_total = (
        entry["employer_contrib_rates"]["pension"] + entry["employee_contrib_rates"]["pension"]
    )
    assert fund_total == pytest.approx(0.148, abs=1e-9)
    assert entry["employer_contrib_rates"]["pension"] == pytest.approx(0.0822, abs=1e-9)
    assert entry["employer_contrib_rates"]["pension"] != pytest.approx(0.6 * fund_total, abs=1e-4)


def test_the_employer_total_leaves_tzpb_out() -> None:
    """ТЗПБ is per activity, so there is no total that could include it.

    A total quietly carrying the 0,4% floor is the shape that makes the range
    the card prints and the total under it disagree — and it is right for the
    sectors at the floor, which is what makes it survive a spot check.
    """
    p = build_payroll_payload(date(2026, 8, 1), tzpb=_fixture_tzpb(date(2026, 8, 1)))
    lines = {k: v for k, v in p["employer_contrib_rates"].items() if k != "total"}
    assert p["employer_contrib_rates"]["total"] == pytest.approx(sum(lines.values()), abs=1e-9)
    assert p["employer_contrib_rates"]["total"] == pytest.approx(0.1852, abs=1e-9)
    assert p["employer_contrib_rates"]["total"] < 0.1852 + p["work_accident"]["min"]


def test_the_section_map_names_exactly_the_sections_nsi_publish() -> None:
    """A key that stops matching drops that sector's ТЗПБ range silently.

    `sector_salary.json` is what fills the picker, and its `en_name` values are
    НСИ's own — commas without spaces included. A section present in the picker
    and absent here renders no employer figure for whoever chose it; one
    present here and absent from the picker is a range nobody can reach.
    """
    published = json.loads(
        (PROJECT_ROOT / "data" / "published" / "sector_salary.json").read_text(encoding="utf-8")
    )
    offered = {s["en_name"] for s in published["sectors"] if s["en_name"] != "Total"}
    assert set(NSI_SECTION_DIVISIONS) == offered


def test_a_section_spanning_several_rates_publishes_the_span() -> None:
    """Ten of nineteen sections do, and a point estimate would be wrong for most.

    «Преработваща промишленост» is 0,5% for clothing and 1,1% for basic metals.
    Both are in the section a reader picks, so the honest answer is both.
    """
    wa = build_work_accident_block(_fixture_tzpb(date(2026, 8, 1)))
    manufacturing = wa["by_nsi_section"]["Manufacturing"]
    assert (manufacturing["min"], manufacturing["max"]) == (0.005, 0.011)
    # Construction is one rate across all three of its divisions, and still
    # publishes a min and a max — one shape, so no template branches on which.
    construction = wa["by_nsi_section"]["Construction"]
    assert (construction["min"], construction["max"]) == (0.011, 0.011)


def test_the_span_published_is_the_span_the_act_sets() -> None:
    wa = build_work_accident_block(_fixture_tzpb(date(2026, 8, 1)))
    assert (wa["min"], wa["max"]) == (0.004, 0.011)
    assert wa["appendix"] == "Приложение № 2А към чл. 14, т. 2"
    assert wa["gazette_issue"] == 68


def test_a_section_naming_a_division_the_act_lost_is_refused() -> None:
    """КИД renumbering has to stop the run, not narrow a range.

    A dropped division silently removes its rate from whatever section it
    belonged to, so the section reports a tighter range than the law sets —
    more precise-looking and wrong.
    """
    tzpb = _fixture_tzpb(date(2026, 8, 1))
    del tzpb["activities"]["43"]
    with pytest.raises(ValueError, match="carries no rate for КИД division"):
        build_work_accident_block(tzpb)


def test_the_two_dated_entries_cite_the_appendix_in_force_for_each() -> None:
    """чл. 14 splits 2026, and each entry has to read its own half.

    Both point at the same act, and only the appendix differs — so the failure
    this catches is a copy-paste, which produces a table that is right for
    eighty sectors and wrong for seven.
    """
    jan = in_force_entry(date(2026, 3, 1))["tzpb"]
    aug = in_force_entry(date(2026, 8, 1))["tzpb"]
    assert jan["dv_material_id"] == aug["dv_material_id"] == 244982
    assert jan["appendix"] == "Приложение № 2 към чл. 14, т. 1"
    assert aug["appendix"] == "Приложение № 2А към чл. 14, т. 2"
    # The seven that move: reading January's table in August prices food
    # manufacturing at 0,7% when the law says 0,9%.
    jan_rates = build_work_accident_block(_fixture_tzpb(date(2026, 3, 1)))["by_nsi_section"]
    aug_rates = build_work_accident_block(_fixture_tzpb(date(2026, 8, 1)))["by_nsi_section"]
    assert jan_rates["Professional,scientific and technical activities"]["max"] == 0.007
    assert aug_rates["Professional,scientific and technical activities"]["max"] == 0.005
