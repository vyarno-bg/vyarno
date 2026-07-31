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
    BGN_PER_EUR,
    build_payroll_payload,
    in_force_entry,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MIRROR_JS = PROJECT_ROOT / "site" / "src" / "lib" / "mirror.js"


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
    published = PROJECT_ROOT / "data" / "published" / "payroll.json"
    if not published.exists():
        pytest.skip("payroll.json not on disk — run a refresh first")
    p = json.loads(published.read_text(encoding="utf-8"))
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
    """
    published = PROJECT_ROOT / "data" / "published" / "payroll.json"
    if not published.exists():
        pytest.skip("payroll.json not on disk — run a refresh first")
    p = json.loads(published.read_text(encoding="utf-8"))

    stamped = date.fromisoformat(p["as_of"])
    assert p == build_payroll_payload(stamped), (
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
