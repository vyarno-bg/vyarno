"""Bulgarian payroll parameters — the single source of truth.

Most of these are *legislative* constants (social-contribution rates, the flat
income-tax rate, the maximum insurable income, the statutory minimum
wage), not a scraped series: there is no machine-readable API that
publishes them. But the app's contract is "the SPA is a renderer; the
published JSON is the source of truth" — so instead of hardcoding these
in the SPA's `mirror.js`, we keep ONE dated table here and publish it to
`data/published/payroll.json`. To update after a legislative change:
edit the table below (add a new effective-dated entry — do NOT mutate an
old one) and run `vyarno-pipeline refresh --source payroll`.

The one exception is ТЗПБ, and the line between them is whether a figure
EXISTS as a published cell. The employer's 8,22% for фонд „Пенсии“ does not:
it is КСО чл. 6, ал. 3, т. 9's 7,1 plus чл. 6, ал. 1, т. 4's two 0,56 rises,
added up by a reader, so it is transcribed here with the arithmetic beside it.
The ТЗПБ rate for each of 87 economic activities does exist as a table, moves
every year, and is 87 chances to mistype — so it is fetched from Държавен
вестник by `sources/dv.py` and merged in at build time. `tzpb` on each entry
below is the address of the act, not the rates.

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
# How each employer rate in the table below is arrived at, in the statute's own
# pieces. `test_payroll.py` sums these and asserts they reproduce the entries,
# which is the only thing standing between a mistyped 8,22 and a published one.
#
# Only фонд „Пенсии“ needs the working. КСО чл. 6, ал. 3, т. 7 splits ОЗМ and
# „Безработица“ 60:40 and ЗЗО чл. 40, ал. 1, т. 1 splits health the same way,
# so those three are one multiplication. Пенсии is not 60:40 and never has
# been: чл. 6, ал. 3, т. 9 fixes it at 5,7/7,1 of the original 12,8, and the
# two 1-point rises in чл. 6, ал. 1, т. 4 are each split 0,56/0,44 on their own
# terms. Reading the fund at 60:40 gives 8,88 — a plausible number, 0,66 points
# out, and wrong in the same direction for every salary on the site.
# ---------------------------------------------------------------------------
EMPLOYER_RATE_DERIVATION: dict[str, dict[str, Any]] = {
    "pension": {
        # чл. 6, ал. 1, т. 2, б. „а“ — 12,8 на сто, lifted by т. 4's two rises.
        "employer_parts": (7.1, 0.56, 0.56),
        "employee_parts": (5.7, 0.44, 0.44),
        "statute": "КСО чл. 6, ал. 1, т. 2, б. „а“ и т. 4; разпределение чл. 6, ал. 3, т. 9",
    },
    "pension2": {
        # чл. 157, ал. 1, т. 1, б. „в“ — 5 на сто, split by ал. 3 as 2,8/2,2.
        "employer_parts": (2.8,),
        "employee_parts": (2.2,),
        "statute": "КСО чл. 157, ал. 1, т. 1, б. „в“; разпределение чл. 157, ал. 3",
    },
    "sickness_maternity": {
        # чл. 6, ал. 1, т. 5 — 3,5 на сто, 60:40.
        "employer_parts": (2.1,),
        "employee_parts": (1.4,),
        "statute": "КСО чл. 6, ал. 1, т. 5; разпределение чл. 6, ал. 3, т. 7",
    },
    "unemployment": {
        # чл. 6, ал. 1, т. 6 — едно на сто, 60:40.
        "employer_parts": (0.6,),
        "employee_parts": (0.4,),
        "statute": "КСО чл. 6, ал. 1, т. 6; разпределение чл. 6, ал. 3, т. 7",
    },
    "health": {
        # ЗБНЗОК 2026 чл. 2 — 8 на сто, 60:40. The rate is the NHIF budget
        # act's and not ЗЗО's: ЗЗО чл. 29, ал. 3 delegates it a year at a time.
        "employer_parts": (4.8,),
        "employee_parts": (3.2,),
        "statute": "ЗБНЗОК 2026 чл. 2; разпределение ЗЗО чл. 40, ал. 1, т. 1",
    },
}

# ---------------------------------------------------------------------------
# НСИ's economic-activity sections, in КИД-2025 divisions — the join that lets
# a reader's chosen sector say anything about ТЗПБ.
#
# **THE TWO SIDES ARE DIFFERENT CLASSIFICATIONS, AND THAT IS THE WHOLE
# CAVEAT.** НСИ publish average wages by NACE Rev. 2 (КИД-2008) SECTION —
# `sector_salary.json`'s twenty rows, keyed by their English name. ЗБДОО sets
# ТЗПБ by КИД-2025 DIVISION, which is NACE Rev. 2.1. So this map crosses a
# revision as well as a level, and it is ours rather than anybody's published
# correspondence.
#
# Two consequences the site has to state rather than smooth over:
#
#   1. A section spans several rates. Ten of the nineteen do — «Преработваща
#      промишленост» runs 0,5% to 1,1% — so a section resolves to a RANGE and
#      never to a representative rate. Picking the modal division would produce
#      one confident number that is wrong for most of the people reading it.
#   2. Rev. 2.1 moved work between divisions. Division 45 (trade and repair of
#      motor vehicles) has no КИД-2025 successor of its own: the repair half
#      is inside 95, which also serves section S. So 95 appears under two
#      sections here, deliberately — a division belonging to one section is a
#      property of one classification, and this map does not live inside one.
#
# Keys are `sector_salary.json`'s `en_name` verbatim, including НСИ's own
# missing spaces after commas. A key that stops matching drops that section's
# range silently, so `test_payroll.py` checks every key against the published
# payload rather than trusting this list.
# ---------------------------------------------------------------------------
NSI_SECTION_DIVISIONS: dict[str, tuple[str, ...]] = {
    "Agriculture,forestry and fishing": ("01", "02", "03"),
    "Mining and quarrying": ("05", "06", "07", "08", "09"),
    "Manufacturing": tuple(f"{d:02d}" for d in range(10, 34)),
    "Electricity,gas,steam and air conditioning supply": ("35",),
    "Water supply,sewerage,waste management and remediation activities": (
        "36",
        "37",
        "38",
        "39",
    ),
    "Construction": ("41", "42", "43"),
    # 95 carries what Rev. 2's division 45 called repair of motor vehicles.
    "Wholesale and retail trade;repair of motor vehicles and motorcycles": ("46", "47", "95"),
    "Transportation and storage": ("49", "50", "51", "52", "53"),
    "Accommodation and food service activities": ("55", "56"),
    "Information and communication": ("58", "59", "60", "61", "62", "63"),
    "Financial and insurance activities": ("64", "65", "66"),
    "Real estate activities": ("68",),
    "Professional,scientific and technical activities": (
        "69",
        "70",
        "71",
        "72",
        "73",
        "74",
        "75",
    ),
    "Administrative and support service activities": (
        "77",
        "78",
        "79",
        "80",
        "81",
        "82",
    ),
    "Public administration and defence;compulsory social security": ("84",),
    "Education": ("85",),
    "Human health and social work activities": ("86", "87", "88"),
    "Arts,entertainment and recreation": ("90", "91", "92", "93"),
    "Other service activities": ("94", "95", "96"),
}

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
        # The осигурител's side of the SAME five funds, same insured person —
        # III категория труд, born after 1959. Each line is a statute plus its
        # split, and `EMPLOYER_RATE_DERIVATION` below carries the arithmetic
        # that turns the second into the first. They sum to 18,52%, and ТЗПБ
        # is deliberately not among them: it is per economic activity, so it
        # is a range rather than a rate and arrives from `tzpb` instead.
        "employer_contrib_rates": {
            "pension": 0.0822,
            "pension2": 0.0280,
            "sickness_maternity": 0.0210,
            "unemployment": 0.0060,
            "health": 0.0480,
        },
        # ЗБДОО 2026 legislates the WHOLE of 2026 and splits it at 1 August
        # (чл. 14), so both entries in this table read their ТЗПБ table out of
        # one act and differ only in which appendix. The citation rides here
        # rather than on the entry because this entry's own `gazette_issue` is
        # null — its parameters come from several instruments — while its ТЗПБ
        # table comes from exactly one, and `dv.py` refuses a material whose
        # header disagrees with the pair below.
        "tzpb": {
            "dv_material_id": 244982,
            "appendix": "Приложение № 2 към чл. 14, т. 1",
            "gazette_issue": 68,
            "gazette_date": date(2026, 7, 28),
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
        # One change in ЗБДОО 2026 this table still does not carry: държавни
        # служители, съдии, прокурори и следователи start paying a personal
        # share at 80:20 until 2026-12-31 and 60:40 after. That is a different
        # insured category from the III категория труд employee modelled here,
        # and НОИ publish its split beside this one — so the figures that look
        # like corrections to the rates below (пенсии 11,8/3,0, ОЗМ 2,8/0,7)
        # are another category's, not a newer reading of this one. Carrying it
        # would mean a second parameter set and a question the calculator does
        # not ask.
        "effective_from": date(2026, 8, 1),
        "effective_year": 2026,
        "employee_contrib_rates": {
            "pension": 0.0658,
            "pension2": 0.0220,
            "sickness_maternity": 0.0140,
            "unemployment": 0.0040,
            "health": 0.0320,
        },
        "employer_contrib_rates": {
            "pension": 0.0822,
            "pension2": 0.0280,
            "sickness_maternity": 0.0210,
            "unemployment": 0.0060,
            "health": 0.0480,
        },
        # Приложение № 2А, not № 2: чл. 14, т. 2 is the table in force from
        # 1 August, and it moves seven activities. Reading the other one would
        # be right for eighty sectors and wrong for seven — «Производство на
        # хранителни продукти» at 0,7% instead of 0,9%, «Архитектурни и
        # инженерни дейности» at 0,7% instead of 0,5%.
        "tzpb": {
            "dv_material_id": 244982,
            "appendix": "Приложение № 2А към чл. 14, т. 2",
            "gazette_issue": 68,
            "gazette_date": date(2026, 7, 28),
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


def build_work_accident_block(fetched: dict[str, Any]) -> dict[str, Any]:
    """The ТЗПБ block: the statutory span, and the range each НСИ section spans.

    **The per-division table is not published and the per-section ranges are.**
    The site's only question is "what does the reader's sector cost", and it
    asks it with an НСИ section key; 87 division rows would be a payload field
    nothing reads, which is a number nobody checks. What a reader can verify is
    the link, and that reaches the appendix itself.

    A section resolving to ONE rate still publishes `min == max` rather than a
    scalar, so the template renders a range or a figure by comparing them and
    never by asking whether a field is present. The alternative — a scalar for
    the unambiguous nine and a range for the other ten — is two shapes for one
    fact, and the branch that forgets the second one prints «0,5%» over a
    sector that runs to 1,1%.

    Raises ValueError when a section names a division the act does not carry:
    that is the join going stale, and the failure it would otherwise produce is
    a narrower range than the law sets.
    """
    activities = fetched["activities"]

    # ДВ set these as percentages and the payload carries fractions, and the
    # division is not exact: 1.1 / 100 is 0.011000000000000001, which is
    # outside the 0,4–1,1 span КСО sets and would fail its own gate. Rounded
    # once, here, so every consumer of a rate compares the same value.
    def frac(pct: float) -> float:
        return round(pct / 100, 6)

    by_section: dict[str, dict[str, Any]] = {}
    for section, divisions in NSI_SECTION_DIVISIONS.items():
        missing = [d for d in divisions if d not in activities]
        if missing:
            raise ValueError(
                f"{fetched['appendix']} carries no rate for КИД division(s) "
                f"{missing} — mapped to «{section}» by NSI_SECTION_DIVISIONS. "
                f"КИД-2025 has been renumbered, and dropping them silently "
                f"would narrow that section's published range."
            )
        rates = sorted({frac(activities[d]["rate_pct"]) for d in divisions})
        by_section[section] = {"min": rates[0], "max": rates[-1]}

    all_rates = sorted({frac(row["rate_pct"]) for row in activities.values()})
    return {
        "min": all_rates[0],
        "max": all_rates[-1],
        "classification": "КИД-2025",
        "appendix": fetched["appendix"],
        "source_url": fetched["source_url"],
        "gazette_issue": fetched["gazette_issue"],
        "gazette_date": fetched["gazette_date"],
        # Which section the ranges are keyed by, so the SPA never has to guess
        # that these are НСИ's own labels rather than ЗБДОО's activity names.
        "section_classification": "КИД-2008",
        "by_nsi_section": by_section,
    }


def build_payroll_payload(as_of: date, *, tzpb: dict[str, Any] | None = None) -> dict[str, Any]:
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

    employer = dict(e["employer_contrib_rates"])
    # The employer total EXCLUDES ТЗПБ, and the field name cannot say so — so
    # the constraint is stated here and in the payload's `notes`. ТЗПБ is per
    # economic activity, so there is no one number to add; a `total` quietly
    # carrying the 0,4% floor would understate every construction employer by
    # 0,7% of gross and read like the whole figure.
    employer_out = {**employer, "total": round(sum(employer.values()), 6)}

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
        "employer_contrib_rates": employer_out,
        # Absent when the build did not fetch it, and `validate.py` refuses to
        # publish a payroll payload in that state. It may not default to the
        # 0,4% floor or to an empty map: both render as a labour cost that is
        # complete and too low, and the reader has no way to tell.
        **({"work_accident": build_work_accident_block(tzpb)} if tzpb else {}),
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
            "income-tax base is NOT capped). The employer pays a further "
            f"{employer_out['total'] * 100:.2f}% on the same capped base, and "
            "that total EXCLUDES ТЗПБ, which is set per economic activity and "
            "published under `work_accident` as a range. Legislative constants "
            "— there is no machine-readable feed; maintained as a dated table "
            "in pipeline/src/vyarno_pipeline/payroll.py, except the ТЗПБ table, "
            "which is read from Държавен вестник. " + e.get("note", "")
        ),
    }
