"""Bulgarian payroll parameters — the single source of truth.

These are *legislative* constants (social-contribution rates, the flat
income-tax rate, the maximum insurable income, the statutory minimum
wage), not a scraped series: there is no machine-readable API that
publishes them. But the app's contract is "the SPA is a renderer; the
published JSON is the source of truth" — so instead of hardcoding these
in the SPA's `mirror.js`, we keep ONE dated table here and publish it to
`data/published/payroll.json`. To update after a legislative change:
edit the table below (add a new effective-dated entry — do NOT mutate an
old one) and run `vyarno-pipeline refresh --source payroll`.

Why effective-dated entries rather than a single current set: Bulgarian
payroll parameters change on statutory boundaries (usually 1 January,
sometimes mid-year). Keeping the history makes each change auditable, lets
`build_payroll_payload(as_of)` pick whichever set was in force on the publish
date, and lets it surface the next scheduled change.

Every entry carries its own provenance (`source_url` + a human note) so
the published JSON is self-describing. The fixed eurozone conversion
rate is 1.95583 BGN/EUR (irrevocable since BG joined the euro area on
2026-01-01); EUR figures below are BGN ÷ 1.95583, rounded to the cent.
"""

from __future__ import annotations

from datetime import date
from typing import Any

# Irrevocable eurozone conversion rate (BG joined 2026-01-01).
BGN_PER_EUR: float = 1.95583


def _eur(bgn: float) -> float:
    """BGN → EUR at the fixed rate, rounded to the cent."""
    return round(bgn / BGN_PER_EUR, 2)


def _bgn(eur: float) -> float:
    """EUR → BGN at the fixed rate, rounded to the stotinka."""
    return round(eur * BGN_PER_EUR, 2)


def _pair(entry: dict[str, Any], field: str) -> tuple[float, float]:
    """The (EUR, BGN) pair for a legislative amount, from whichever side the
    statute actually sets.

    Pre-euro figures were legislated in BGN and the EUR side is a conversion
    (min wage 1213 BGN → €620.20). From 2026-01-01 Bulgaria legislates in
    euro, so the newer figures are EUR-native and the BGN side is the
    conversion: €2300 is the statutory ceiling, and deriving it from a
    rounded 4500 BGN would publish €2300.81 — a figure in no statute.

    An entry supplies exactly one side; the other is computed at the fixed
    rate, so the two can never drift apart in the output.
    """
    eur, bgn = entry.get(f"{field}_eur"), entry.get(f"{field}_bgn")
    if (eur is None) == (bgn is None):
        raise ValueError(
            f"payroll entry effective {entry['effective_from']} must set "
            f"exactly one of {field}_eur / {field}_bgn — got "
            f"eur={eur!r}, bgn={bgn!r}. Set the side the statute sets."
        )
    if eur is None:
        return _eur(float(bgn)), float(bgn)
    return float(eur), _bgn(float(eur))


def _gazette(entry: dict[str, Any]) -> tuple[int | None, str | None]:
    """The ДВ issue an entry's instrument was promulgated in, as (issue, ISO date).

    `source_url` is dv.parliament.bg's landing page and cannot be anything
    else — their permalinks are built from a session-side id that the issue
    number does not yield, so a constructed one 404s for the reader who checks.
    P9 says a citation that cannot carry a link carries the source name AND the
    date, and «Държавен вестник · 2026» satisfies neither half: a year is not
    an issue, and four figures on the page hang off it.

    (None, None) is a legitimate answer and the reason is the January entry.
    Its parameter set is not one act — ЗБДОО for the ceiling and the five
    contribution lines, ЗДДФЛ чл. 48 ал. 1 for the flat rate, a ПМС for the
    minimum wage — so no single issue number is true of it, and inventing one
    that looks right is worse than a caption that names the year. An entry that
    IS one act carries its issue and the site prints it.

    Half a citation is refused rather than published: an issue with no date is
    unfindable in ДВ's own archive, which is indexed by both, and a date with no
    issue names a day on which several were promulgated.
    """
    issue, when = entry.get("gazette_issue"), entry.get("gazette_date")
    if issue is None and when is None:
        return None, None
    if (issue is None) != (when is None):
        raise ValueError(
            f"payroll entry effective {entry['effective_from']} carries half a "
            f"ДВ citation — issue={issue!r}, date={when!r}. Both or neither: "
            f"the gazette's own archive is indexed by the pair."
        )
    if not isinstance(issue, int) or issue <= 0:
        raise ValueError(
            f"payroll entry effective {entry['effective_from']} has gazette_issue"
            f"={issue!r}. ДВ numbers its issues from 1 within each year."
        )
    if when > entry["effective_from"]:
        raise ValueError(
            f"payroll entry effective {entry['effective_from']} says it was "
            f"promulgated on {when} — after it came into force. Promulgation is "
            f"what starts the clock, so the citation and the entry disagree "
            f"about which act this is."
        )
    return issue, when.isoformat()


# ---------------------------------------------------------------------------
# The dated table. Newest entries LAST. Each entry is the full parameter set
# in force from `effective_from` until the next entry's `effective_from`.
# `scheduled_changes` documents a known future change that is not yet a full
# entry (e.g. a value pending the state budget) so the SPA can warn about it.
# ---------------------------------------------------------------------------
BG_PAYROLL_TABLE: list[dict[str, Any]] = [
    {
        "effective_from": date(2026, 1, 1),
        "effective_year": 2026,
        # Employee-side social-contribution rates, III категория труд,
        # born after 1959 (the default for a typical Sofia office worker).
        # The five lines sum to 13.78%.
        "employee_contrib_rates": {
            "pension": 0.0658,  # ДОО, фонд Пенсии (1st pillar)
            "pension2": 0.0220,  # ДЗПО, Универсален пенсионен фонд (2nd pillar)
            "sickness_maternity": 0.0140,  # ОЗМ
            "unemployment": 0.0040,  # Безработица
            "health": 0.0320,  # ЗОВ, НЗОК
        },
        "income_tax_rate": 0.10,  # flat PIT, no tax-free allowance
        "max_insurable_income_bgn": 4130.0,
        "min_wage_gross_bgn": 1213.0,
        # The rise to €2300 is enacted, not forecast: the National Assembly
        # adopted ЗБДОО 2026 on 22.07.2026 and dated it 01.08.2026. It stays a
        # `scheduled_change` on THIS entry because within this entry's window
        # (01.01–31.07.2026) that is exactly what it is — a change that has
        # not happened yet. The entry below is where it becomes the law.
        "scheduled_changes": [
            {
                "field": "max_insurable_income",
                # Legislated in EUR (post-euro). 2300 × 1.95583 = 4498.41 BGN,
                # so no round BGN figure exists — see `max_insurable_income_eur`
                # on the 2026-08-01 entry for why the EUR side is authoritative.
                "value_eur": 2300.0,
                "effective_from": "2026-08-01",
                "note": (
                    "The maximum insurable income rises from €2111.64 (4130 BGN) "
                    "to €2300 on 2026-08-01, under the State Social Insurance "
                    "Budget Act 2026 adopted by the National Assembly on "
                    "2026-07-22. Until 2026-07-31 inclusive, €2111.64 is in "
                    "force; `in_force_entry` switches on the date."
                ),
            },
        ],
        # A landing page, not a permalink. The instruments are named in `note`
        # below — ЗБДОО for the five contribution rates and the insurance
        # ceiling, ЗДДФЛ чл. 48, ал. 1 for the flat rate, a ПМС for the minimum
        # wage — and ДВ is where each is promulgated. ЗАПСП чл. 4, т. 1 puts
        # «нормативни и индивидуални актове на държавни органи за управление»
        # outside copyright, so this table carries a provenance duty to the
        # reader and no licence condition to anyone. Swap in a per-issue ДВ
        # permalink the next time these rates move.
        "source_url": "https://dv.parliament.bg/",
        "note": (
            "Transcribed from Bulgarian legislation, not from a machine-readable "
            "feed: the five employee contribution rates and the maximum insurable "
            "income are ЗБДОО's, the 10% flat rate is ЗДДФЛ чл. 48, ал. 1, and the "
            "minimum wage is set by ПМС. 2026 rates preserve the 2025 schedule "
            "(NAP position circulated 14.01.2026). Minimum wage 1213 BGN and max "
            "insurable income 4130 BGN are the values in force from 2026-01-01. "
            "ЗАПСП чл. 4 puts official texts of a legislative nature outside "
            "copyright, so this table carries no licence condition — it still "
            "carries a provenance duty."
        ),
    },
    {
        # ЗБДОО 2026, обн. ДВ бр. 68 от 28.07.2026, in force 2026-08-01. Only
        # the insurance ceiling moves: the five employee contribution lines, the
        # flat tax and the minimum wage are unchanged, so they are restated
        # verbatim rather than referenced — an entry is the FULL parameter set
        # in force, and a partial one would silently inherit whatever a future
        # edit did to the row above it.
        #
        # These rates have to survive a re-derivation from press coverage,
        # because the coverage that ranks highest describes the DRAFT budget
        # rather than this act. The draft carried a €2352 ceiling and raised
        # фонд "Пенсии" from 14.8% to 16.8% for those born after 1959, which
        # would have lifted the 6.58% employee pension line and the 13.78% total
        # with it. The National Assembly enacted neither. So anyone reconciling
        # this table against an article dated before 2026-07-22 meets two
        # figures that look like corrections and are not — the enacted text
        # keeps every rate and moves only the ceiling.
        #
        # ЗБДОО 2026 does change two things this table deliberately does not
        # carry. ТЗПБ moves for seven economic activities, and it is wholly
        # employer-side: `employee_contrib_rates` and the tax wedge in
        # `mirror.js` are the employee's own deductions, so no figure the reader
        # sees depends on it. Държавни служители start paying personal
        # contributions at 80:20 until 2026-12-31, then 60:40 — a different
        # insured category from the III категория труд employee this table
        # models. Adding either would mean a second parameter set and a question
        # the calculator does not ask.
        "effective_from": date(2026, 8, 1),
        "effective_year": 2026,
        "employee_contrib_rates": {
            "pension": 0.0658,
            "pension2": 0.0220,
            "sickness_maternity": 0.0140,
            "unemployment": 0.0040,
            "health": 0.0320,
        },
        "income_tax_rate": 0.10,
        # EUR-NATIVE, and this is the first entry that has to be. Bulgaria
        # adopted the euro on 2026-01-01, so the budget act sets this figure in
        # euro: €2300 exactly. Deriving it from a BGN value the way every
        # earlier figure is derived would publish €2300.81 (4500 ÷ 1.95583) —
        # a number no statute contains. `max_insurable_income_bgn` is therefore
        # the DERIVED side here, at the same fixed rate, and comes out
        # 4498.41 BGN rather than the round 4500 the press coverage rounds to.
        "max_insurable_income_eur": 2300.0,
        "min_wage_gross_bgn": 1213.0,
        "scheduled_changes": [],
        # ДВ is where the act is promulgated, and now that it has been, it is
        # the citation rather than the National Assembly's bill page: бр. 68 of
        # 2026-07-28 is the text in force. Still the landing page and not a
        # per-issue permalink — dv.parliament.bg builds those from a session-side
        # id that is not derivable from the issue number, and a guessed one
        # would 404 for the reader who checks. The issue and its date therefore
        # travel as fields: the link cannot reach the instrument, so the caption
        # has to name it (P9), and four figures on /how/ are captioned off this
        # entry.
        "source_url": "https://dv.parliament.bg/",
        "gazette_issue": 68,
        "gazette_date": date(2026, 7, 28),
        "note": (
            "State Social Insurance Budget Act 2026 (ЗБДОО 2026), adopted by "
            "the National Assembly on 2026-07-22, promulgated in ДВ бр. 68 of "
            "2026-07-28 and in force 2026-08-01: the maximum insurable income "
            "rises to €2300 for all insured persons. The five employee "
            "contribution rates, the 10% flat tax and the €620.20 minimum wage "
            "are unchanged from 2026-01-01."
        ),
    },
]


def in_force_entry(as_of: date) -> dict[str, Any]:
    """The parameter set in force on `as_of` (the latest entry whose
    `effective_from` is on or before that date). Falls back to the
    earliest entry if `as_of` predates the whole table."""
    applicable = [e for e in BG_PAYROLL_TABLE if e["effective_from"] <= as_of]
    return applicable[-1] if applicable else BG_PAYROLL_TABLE[0]


def build_payroll_payload(as_of: date) -> dict[str, Any]:
    """Assemble the `payroll.json` payload for the set in force on `as_of`.

    Each amount is published as a EUR/BGN pair, and `_pair` derives whichever
    side the statute does not set — BGN→EUR for the pre-euro figures, EUR→BGN
    from 2026-01-01 onward, where Bulgaria legislates in euro (the ЗБДОО 2026
    ceiling is €2300 exactly, and its BGN side is the derived one). Both sides
    always come from one value at the fixed 1.95583 rate, so they cannot drift
    apart in the output whichever direction the conversion ran.
    """
    e = in_force_entry(as_of)
    rates = dict(e["employee_contrib_rates"])
    total = round(sum(rates.values()), 6)
    rates_out = {**rates, "total": total}

    max_ins_eur, max_ins_bgn = _pair(e, "max_insurable_income")
    min_wage_eur, min_wage_bgn = _pair(e, "min_wage_gross")
    gazette_issue, gazette_date = _gazette(e)

    # Scheduled changes: fill EUR alongside the BGN so the SPA needn't convert.
    scheduled = []
    for sc in e.get("scheduled_changes", []):
        item = dict(sc)
        # Prefer an explicit EUR value (post-euro, figures are cited in EUR);
        # otherwise derive it from the BGN value at the fixed rate.
        if "value_eur" not in item and "value_bgn" in sc:
            item["value_eur"] = _eur(sc["value_bgn"])
        scheduled.append(item)

    return {
        "schema_version": "1.0",
        "as_of": as_of.isoformat(),
        "source": "legislation",
        "source_url": e.get("source_url", ""),
        # Both keys always, `null` where the entry's parameters come from more
        # than one act. An absent key would leave the site unable to tell "this
        # set has no single instrument" from "an envelope written before the
        # citation was published", and those want different captions.
        "gazette_issue": gazette_issue,
        "gazette_date": gazette_date,
        "payload_name": "payroll",
        "effective_year": e["effective_year"],
        "effective_from": e["effective_from"].isoformat(),
        "bgn_per_eur": BGN_PER_EUR,
        "employee_contrib_rates": rates_out,
        "income_tax_rate": e["income_tax_rate"],
        "max_insurable_income_eur": max_ins_eur,
        "max_insurable_income_bgn": max_ins_bgn,
        "min_wage_gross_eur": min_wage_eur,
        "min_wage_gross_bgn": min_wage_bgn,
        # NB: no `min_hourly_wage_bgn`. The statutory hourly minimum is a
        # real figure and worth publishing WHEN something renders it — add it
        # with its consumer and its test in the same commit, not ahead of
        # them. A payload field nothing reads is a number nobody checks.
        "scheduled_changes": scheduled,
        "notes": (
            "Bulgarian payroll parameters for employee net-pay math "
            f"(effective {e['effective_year']}). Employee social contributions "
            f"total {total * 100:.2f}% (III категория труд, born after 1959) "
            f"plus a {e['income_tax_rate'] * 100:.0f}% flat income tax; social "
            "contributions are capped at the maximum insurable income (the "
            "income-tax base is NOT capped). Legislative constants — there is "
            "no machine-readable feed; maintained as a dated table in "
            "pipeline/src/vyarno_pipeline/payroll.py. " + e.get("note", "")
        ),
    }
