"""Pure transforms between Eurostat cube rows and our observation models.

COICOP_META is the static contract — it pins the friendly Bulgarian/English
names for every ECOICOP ver.2 code we publish (13 divisions plus their
groups). Weights are NOT in this dict because they drift annually (Eurostat
rebalances the basket every year) and a wrong weight silently breaks the
reconciliation gate. Weights come from `prc_hicp_iw` at refresh time — see
`rows_to_category_observations`.

The friendly names are OURS (plain language, for a person who has never heard
of COICOP). Each observation also carries `eurostat_label`, the cube's own
official English name, so nothing is ever hidden behind our wording.

Provenance contract (single source of truth for headline math):
- `annual_rate_pct` is taken VERBATIM from `prc_hicp_minr` (unit=RCH_A,
  Eurostat's published annual rate of change) at the latest available month.
  NOT derived from the index.
- `index_by_year` and `latest_index` are Eurostat's own index values from the
  SAME `prc_hicp_minr` cube at `INDEX_UNIT`, published unscaled. The pipeline
  chooses which readings appear — December, and 2020 onwards — and changes
  none of them.
- `weight_pct` comes from `prc_hicp_iw` for the most recent year — refreshed
  every run, never hardcoded.
- All three cubes are ECOICOP **ver.2**, keyed by `coicop18`, so a code's
  weight, rate, index, label and verify link all describe the same bucket.
  `validate.validate_classification_agreement` fails the publish if they
  ever stop agreeing.

Two traps this module exists to keep shut:
1. Reading the rate from an archived cube pins the published headline to the
   month that cube was frozen while the index runs months ahead.
2. Reading weights from the ver.1 `prc_hicp_inw` while reading rates from the
   ver.2 `prc_hicp_minr` puts one bucket's weight beside another bucket's rate
   and drops CP13 entirely. See sources/eurostat.py.
"""

from __future__ import annotations

import math
from datetime import date
from statistics import NormalDist
from typing import Any

from pydantic import HttpUrl

from vyarno_pipeline.models import (
    CategoryObservation,
    GroupObservation,
    TimeSeriesObservation,
)
from vyarno_pipeline.regions import REGIONS
from vyarno_pipeline.sources.eurostat import (
    CENSUS_DWELLINGS_DATASET,
    CP_DIVISIONS,
    HOUSE_PRICE_INDEX_BASE_YEAR,
    HOUSE_PRICE_INDEX_UNIT,
    HOUSE_PRICE_RATE_UNIT,
    HOUSE_SALES_VALUE_UNIT,
    HOUSING_OVERBURDEN_DATASET,
    INDEX_BASE_YEAR,
    INDEX_UNIT,
    IW_DATASET,
    MINR_DATASET,
    PRICE_TO_INCOME_DATASET,
    PRICE_TO_INCOME_UNIT,
    TENURE_DATASET,
    CubeFetch,
    HicpCube,
)
from vyarno_pipeline.sources.nsi import HOUSING_CITIES

# Friendly names for Bulgaria's HICP basket, ECOICOP ver.2.
#   code → (bg_name, en_name)
#
# Divisions (CP01..CP13) are the default view; groups (CPxxy) are the detailed
# drill-down. Names are deliberately everyday Bulgarian/English — "Гориво и
# поддръжка на колата", not "Operation of personal transport equipment". The
# official Eurostat wording travels alongside in `eurostat_label`.
#
# Every BG name is a complete noun phrase, however tight the column: shortening
# "канцеларски материали" to the bare adjective saves eleven characters and
# leaves a slider label that no Bulgarian sentence could end on. These strings
# are the basket rows a reader drags, not internal keys.
#
# A code present here but absent from BG's basket is simply skipped (Eurostat
# carries structurally-required groups at zero weight); a code present in the
# basket but missing here fails the publish, so this table cannot silently
# fall behind an upstream reclassification.
# fmt: off
# Column-aligned on purpose: BG and EN labels are read as a two-column table
# when checking a translation, and the formatter would collapse the columns.
COICOP_META: dict[str, tuple[str, str]] = {
    # -- divisions -----------------------------------------------------------
    "CP01": ("Храна и безалк. напитки",     "Food & soft drinks"),
    "CP02": ("Алкохол и цигари",            "Alcohol & tobacco"),
    "CP03": ("Облекло и обувки",            "Clothing & footwear"),
    "CP04": ("Ток, вода, парно, наеми",     "Utilities & rents"),
    "CP05": ("Дом и обзавеждане",           "Furnishings & upkeep"),
    "CP06": ("Здраве и лекарства",          "Health & medicines"),
    "CP07": ("Транспорт и гориво",          "Transport & fuel"),
    "CP08": ("Телефон, интернет и техника", "Phone, internet & devices"),
    "CP09": ("Свободно време и култура",    "Leisure, sport & culture"),
    "CP10": ("Образование",                 "Education"),
    "CP11": ("Заведения и хотели",          "Eating out & hotels"),
    "CP12": ("Застраховки и банки",         "Insurance & banking"),
    "CP13": ("Лична грижа и други услуги",  "Personal care & other services"),
    # -- CP01 groups ---------------------------------------------------------
    "CP011": ("Храна",                       "Food"),
    "CP012": ("Безалкохолни напитки",        "Soft drinks"),
    "CP013": ("Услуги за преработка на храни", "Food processing services"),
    # -- CP02 groups ---------------------------------------------------------
    "CP021": ("Алкохол",                     "Alcohol"),
    "CP022": ("Услуги за производство на алкохол", "Alcohol production services"),
    "CP023": ("Цигари и тютюн",              "Tobacco"),
    # -- CP03 groups ---------------------------------------------------------
    "CP031": ("Облекло",                     "Clothing"),
    "CP032": ("Обувки",                      "Footwear"),
    # -- CP04 groups ---------------------------------------------------------
    "CP041": ("Наем",                        "Rent"),
    "CP043": ("Ремонт и поддръжка на жилището", "Home repairs & upkeep"),
    "CP044": ("Вода и такси за жилището",    "Water & dwelling charges"),
    "CP045": ("Ток, газ и отопление",        "Electricity, gas & heating"),
    # -- CP05 groups ---------------------------------------------------------
    "CP051": ("Мебели и килими",             "Furniture & carpets"),
    "CP052": ("Домашен текстил",             "Household textiles"),
    "CP053": ("Домакински уреди",            "Appliances"),
    "CP054": ("Съдове и прибори",            "Tableware & utensils"),
    "CP055": ("Инструменти за дома и градината", "Tools for house & garden"),
    "CP056": ("Препарати и услуги за домакинството", "Cleaning & household services"),
    # -- CP06 groups ---------------------------------------------------------
    "CP061": ("Лекарства и здравни продукти", "Medicines & health products"),
    "CP062": ("Прегледи и извънболнична помощ", "Outpatient care"),
    "CP063": ("Болнично лечение",            "Hospital care"),
    "CP064": ("Други здравни услуги",        "Other health services"),
    # -- CP07 groups ---------------------------------------------------------
    "CP071": ("Купуване на кола",            "Buying a vehicle"),
    "CP072": ("Гориво и поддръжка на колата", "Running your car"),
    "CP073": ("Билети и пътнически транспорт", "Tickets & passenger transport"),
    "CP074": ("Транспорт на товари и доставки", "Freight & delivery"),
    # -- CP08 groups ---------------------------------------------------------
    "CP081": ("Телефони и техника",          "Phones & devices"),
    "CP082": ("Софтуер (без игри)",          "Software (excl. games)"),
    "CP083": ("Телефон, интернет и ТВ",      "Phone, internet & TV"),
    # -- CP09 groups ---------------------------------------------------------
    "CP091": ("Техника за свободното време", "Recreational equipment"),
    "CP092": ("Стоки за свободното време",   "Other recreational goods"),
    "CP093": ("Градина и домашни любимци",   "Garden & pets"),
    "CP094": ("Спорт и развлечения",         "Sport & entertainment"),
    "CP095": ("Културни стоки",              "Cultural goods"),
    "CP096": ("Кино, театър, музеи",         "Cinema, theatre & museums"),
    "CP097": ("Книги, вестници, канцеларски материали", "Books, papers & stationery"),
    "CP098": ("Пакетни почивки",             "Package holidays"),
    # -- CP10 groups ---------------------------------------------------------
    "CP101": ("Детска градина и начално училище", "Early years & primary school"),
    "CP102": ("Средно образование",          "Secondary education"),
    "CP103": ("Следгимназиално обучение",    "Post-secondary (non-university)"),
    "CP104": ("Висше образование",           "University"),
    "CP105": ("Курсове и обучения",          "Courses & training"),
    # -- CP11 groups ---------------------------------------------------------
    "CP111": ("Заведения за хранене",        "Eating & drinking out"),
    "CP112": ("Хотели и нощувки",            "Hotels & stays"),
    # -- CP12 groups ---------------------------------------------------------
    "CP121": ("Застраховки",                 "Insurance"),
    "CP122": ("Банкови и финансови услуги",  "Banking & financial services"),
    # -- CP13 groups ---------------------------------------------------------
    "CP131": ("Лична хигиена и козметика",   "Personal care & cosmetics"),
    "CP132": ("Бижута, часовници, аксесоари", "Jewellery, watches & accessories"),
    "CP133": ("Социални грижи",              "Social care"),
    "CP139": ("Други услуги",                "Other services"),
}
# fmt: on


def index_years_from_2020(index_by_year: dict[int, float]) -> dict[int, float]:
    """Keep 2020 onwards. Values pass through at whatever base they arrive on.

    This selects years; it scales nothing. Every figure the site builds out of
    the series is a ratio of two of its own members —
    `latest_index / index_by_year[anchor]` — and a ratio is unchanged by the
    base both members sit on. So dividing through to make 2020 read 100 would
    move no number a reader sees, and it would turn every published level into
    one Eurostat cannot be asked to stand behind. Their copyright notice makes
    that a disclosure obligation, not a matter of taste: adapted data has to be
    declared as adapted, with a disclaimer, at every figure. Publishing their
    values is how that obligation stops existing.

    2020 must be present, and the failure is loud rather than a short map: the
    savings card divides by it (`allItemsCumulativeSince2020`), so a series
    that skipped it would render a blank card and no error. Earlier years are
    dropped because the anchor selector cannot reach them.
    """
    if 2020 not in index_by_year:
        raise ValueError("2020 not in index_by_year — the since-2020 anchor has no base")
    return {y: v for y, v in index_by_year.items() if y >= 2020}


def rows_to_yearly_index(rows: list[dict]) -> dict[int, float]:
    """Collapse a flat list of {time: 'YYYY-MM', value: ...} rows to year-end index.

    A year is included in the output only if December is present in the
    upstream series for that year. Years without a December reading —
    i.e. the current, partial year (we have Jan..Jun 2026 but no Dec
    2026 yet) — are dropped entirely. Storing the latest available month
    under the calendar-year key would silently mean "June 2026" rather
    than "end of 2026" and contaminate every downstream consumer that
    assumes year-end semantics (rateFor's year-anchor comparisons,
    officialCumulativeSince2020, the basket chart, the dropdown labels).

    Historical years that legitimately have no December (an upstream
    data gap, a new division whose first observation lands mid-year)
    are also dropped — better to show "no data" than to show a wrong
    year-end figure.
    """
    out: dict[int, float] = {}
    for r in rows:
        year, month = r["time"].split("-")
        # Only December: an incomplete year (the current one, or an upstream
        # gap) has no year-end reading and is dropped rather than approximated.
        if month == "12":
            out.setdefault(int(year), r["value"])
    return out


def latest_monthly_index(rows: list[dict]) -> dict | None:
    """Return the most recent {time, value} row from a flat list,
    regardless of whether December is in the series.

    This is the freshest index level, used for the "since year Y"
    basket-increase math (`latest_index / index_by_year[Y] - 1`). It is
    a separate output from the year-end series (`rows_to_yearly_index`):
    the year-end series answers "what is the index at end-of-year?" and
    this answers "what is the most recent reading Eurostat has published?".
    Since the rate (RCH_A) and the index (I15) now come from the same
    `prc_hicp_minr` cube, this month equals the rate's `ref_period`.

    Returns None if the input is empty.
    """
    if not rows:
        return None
    # Sort by time string ("YYYY-MM" sorts lexicographically as
    # chronological, which is correct for any 4-digit year).
    latest = max(rows, key=lambda r: r["time"])
    return {"time": str(latest["time"]), "value": float(latest["value"])}


def rate_api_url(cp: str, geo: str = "BG") -> str:
    """The per-code RCH_A (annual rate) dissemination extract — the verify link."""
    return (
        f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
        f"/{MINR_DATASET}?geo={geo}&coicop18={cp}&unit=RCH_A&lastTimePeriod=12"
    )


def index_api_url(cp: str, geo: str = "BG", since_year: int = 2020) -> str:
    """The per-code index dissemination extract — the since-year link.

    It resolves to the same unit the payload's values came from, which is what
    makes it a check rather than a gesture: a reader who opens it reads the
    published number back, digit for digit, instead of a series they would have
    to rescale first.
    """
    return (
        f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
        f"/{MINR_DATASET}?geo={geo}&coicop18={cp}&unit={INDEX_UNIT}"
        f"&sinceTimePeriod={since_year}-01"
    )


class MissingSeriesError(ValueError):
    """A code we intend to publish has no usable rate / weight / index.

    Raised instead of skipping the code: a silently dropped division is
    exactly how CP13 went missing for six months. If Eurostat genuinely stops
    publishing something, that is a decision for a human, not a `continue`.
    """


def index_fields(
    rows: list[dict],
    cp: str,
) -> tuple[dict[int, float], dict[str, float | str], float]:
    """(index_by_year from 2020, latest_index, the latest year-end value).

    Both index fields are Eurostat's own values off one cube at one unit, so
    they share a base by construction rather than by an arithmetic step
    somebody has to keep matched. That is the whole safety argument: the SPA
    divides one by the other, and the way that division used to be able to go
    wrong was one of them being rescaled and the other not. There is now
    nothing to rescale (docs/math.md invariant #1).

    `index_by_year` is year-end only (see `rows_to_yearly_index`);
    `latest_index` is the freshest monthly reading, December or not.
    """
    if not rows:
        raise MissingSeriesError(f"{cp}: no index rows")
    yearly = index_years_from_2020(rows_to_yearly_index(rows))
    if not yearly:
        raise MissingSeriesError(f"{cp}: no year-end index reading")
    latest = latest_monthly_index(rows)
    if latest is None:
        raise MissingSeriesError(f"{cp}: no monthly index reading")
    return yearly, latest, yearly[max(yearly)]


def rows_to_category_observations(
    index_cube: HicpCube,
    rate_cube: HicpCube,
    weights: dict[str, float],
    as_of: date,
    group_codes: list[str] | None = None,
) -> dict[str, CategoryObservation]:
    """Build {cp_code: CategoryObservation} for the 13 ECOICOP ver.2 divisions.

    All three inputs are ver.2 (`coicop18`): `prc_hicp_minr` I15 for the index,
    `prc_hicp_minr` RCH_A for the rate, `prc_hicp_iw` for the weights. Because
    they share a classification, a code's weight, rate, index, label and verify
    link describe the same bucket — the invariant the whole basket rests on.

    Per code (division or group):

    - `annual_rate_pct` — VERBATIM from the RCH_A rows at the LATEST month.
      Eurostat's published figure, never derived from the index.
    - `ref_period` — that month (e.g. "2026-06").
    - `index_by_year` / `latest_index` — Eurostat's index values off the
      `INDEX_UNIT` rows, unscaled (see `index_fields`).
    - `weight_pct` — from `weights` (percent of the whole basket).
    - `eurostat_label` — the rates cube's own English name for the code.
    - `api_url` / `api_url_index` — the RCH_A and index dissemination extracts.

    `group_codes` (ECOICOP level 2, e.g. CP072) are nested under their parent
    division. A group carries only its share of the WHOLE basket: the SPA's
    within-division default split normalises the groups against each other, so
    a share-of-parent field would be the same number twice, one of them ours.
    Pass None to publish divisions only.

    Raises `MissingSeriesError` if any requested code lacks a rate, a weight or
    an index. Nothing is skipped silently.
    """
    by_cp_index: dict[str, list[dict]] = {}
    for r in index_cube.rows:
        by_cp_index.setdefault(r["coicop"], []).append(r)

    # Latest rate reading per CP (max-by-time over the RCH_A rows).
    latest_rate_per_cp: dict[str, dict] = {}
    for r in rate_cube.rows:
        cp = r["coicop"]
        prev = latest_rate_per_cp.get(cp)
        if prev is None or r["time"] > prev["time"]:
            latest_rate_per_cp[cp] = r

    def _require(cp: str) -> tuple[dict, float, str, str, str]:
        if cp not in COICOP_META:
            raise MissingSeriesError(
                f"{cp}: no friendly name in COICOP_META. Eurostat publishes it "
                f"for BG, so the basket would be incomplete without it — add "
                f"a Bulgarian/English name rather than dropping the code."
            )
        rate_row = latest_rate_per_cp.get(cp)
        if rate_row is None:
            raise MissingSeriesError(f"{cp}: no {rate_cube.dataset} RCH_A rate row")
        if cp not in weights:
            raise MissingSeriesError(f"{cp}: no basket weight (Σ would be wrong)")
        bg_name, en_name = COICOP_META[cp]
        return rate_row, weights[cp], bg_name, en_name, rate_cube.labels.get(cp, "")

    groups_by_parent: dict[str, list[GroupObservation]] = {}
    for cp in group_codes or []:
        rate_row, weight_pct, bg_name, en_name, label = _require(cp)
        yearly, latest, _ = index_fields(by_cp_index.get(cp, []), cp)
        parent = cp[:4]
        groups_by_parent.setdefault(parent, []).append(
            GroupObservation(
                cp_code=cp,
                parent_cp_code=parent,
                bg_name=bg_name,
                en_name=en_name,
                eurostat_label=label,
                weight_pct=weight_pct,
                annual_rate_pct=float(rate_row["value"]),
                ref_period=str(rate_row["time"]),
                index_base_year=INDEX_BASE_YEAR,
                index_by_year=yearly,
                latest_index=latest,
                api_url=HttpUrl(rate_api_url(cp)),
                api_url_index=HttpUrl(index_api_url(cp)),
            )
        )

    out: dict[str, CategoryObservation] = {}
    for cp in CP_DIVISIONS:
        rate_row, weight_pct, bg_name, en_name, label = _require(cp)
        yearly, latest, latest_year_value = index_fields(by_cp_index.get(cp, []), cp)
        out[cp] = CategoryObservation(
            dataset=f"{rate_cube.dataset}+{IW_DATASET}",
            source="eurostat",
            source_url=(
                f"https://ec.europa.eu/eurostat/databrowser/view/{MINR_DATASET}"
                f"/default/table?lang=en"
            ),
            cp_code=cp,
            bg_name=bg_name,
            en_name=en_name,
            eurostat_label=label,
            weight_pct=weight_pct,
            annual_rate_pct=float(rate_row["value"]),
            api_url=HttpUrl(rate_api_url(cp)),
            api_url_index=HttpUrl(index_api_url(cp)),
            index_base_year=INDEX_BASE_YEAR,
            index_by_year=yearly,
            latest_index=latest,
            ref_period=str(rate_row["time"]),
            published_at=as_of,
            unit=f"index_{INDEX_BASE_YEAR}=100",
            value=latest_year_value,
            groups=sorted(groups_by_parent.get(cp, []), key=lambda g: g.cp_code),
        )
    return out


def build_region_salary_payload(
    scrape: dict,
    as_of: date,
    source_url: str,
    source_url_bg: str,
) -> dict:
    """Shape НСИ's regional wage scrape into the published payload.

    Beside `build_sector_salary_payload` because it is one publisher's two cuts
    of one quarterly release — `1.1.2.2` by област against `1.1.2.1` by economic
    activity — read the same way, for НСИ's own published quarter. Like that
    one it builds a plain dict rather than a `TimeSeriesObservation`, because
    that model carries one series and this payload carries twenty-eight.

    **Nothing here computes.** Every figure is a cell НСИ published; the gap a
    reader sees between their pay and their област's average is arithmetic in
    their own tab (`mirror.js`), which is where P8 puts it and what §2.1.1 of
    НСИ's licence needs, since it forbids distributing производни произведения
    (docs/legal.md §НСИ).

    **There is no national row and none is derived.** The workbook carries six
    statistical regions and twenty-eight области and no Bulgaria total, so
    averaging the области to make one would be exactly the производно
    произведение above — and it would be wrong arithmetic besides, an unweighted
    mean over regions of wildly different employment. The national figure the
    salary ladder is anchored on is НСИ's own «Общо» row, published in
    `sector_salary.json`.
    """
    regions = scrape["regions"]
    ref_period = str(scrape["ref_period"])
    is_preliminary = bool(scrape.get("is_preliminary", False))
    prelim_marker = " (preliminary)" if is_preliminary else ""
    top = max(regions, key=lambda r: r["value_eur"])
    low = min(regions, key=lambda r: r["value_eur"])

    return {
        "schema_version": "1.0",
        "as_of": as_of.isoformat(),
        "source": "nsi",
        "source_url": source_url,
        "notes": (
            f"Average GROSS monthly wage by област (BG districts), as published "
            f"by НСИ and unmodified. Each област's `value_eur` is НСИ's latest "
            f"published QUARTERLY average at {ref_period}{prelim_marker}; "
            f"`series_by_period` is their full quarterly series from the "
            f"`{{year}}trimes` sheets. {len(regions)} области, {top['en_name']} "
            f"highest at {top['value_eur']:.0f} EUR and {low['en_name']} lowest "
            f"at {low['value_eur']:.0f} EUR. Nothing in this file is computed by "
            f"us — no gap, no ratio, no national average. The quarter is НСИ's "
            f"own reporting period and avoids the March bonus spike that "
            f"dominates their single-month readings; the Q4 column taken is "
            f"`IV`, not `IV incl.annual bonuses`. Област names are НСИ's own in "
            f"each language, from the English and Bulgarian editions of the same "
            f"table. All values in EUR (fixed 1.95583 BGN/EUR)."
        ),
        "payload_name": "region_salary",
        "source_url_bg": source_url_bg,
        "dataset": (
            "Labour_1.1.2.2_EUR_EN.xlsx + Labour_1.1.2.2_EUR.xlsx:sheet={year}trimes:district rows"
        ),
        "ref_period": ref_period,
        "published_at": as_of.isoformat(),
        "unit": "eur_per_month",
        "is_preliminary": is_preliminary,
        "regions": [
            {
                "code": r["code"],
                "en_name": r["en_name"],
                "bg_name": r["bg_name"],
                "value_eur": r["value_eur"],
                "series_by_period": r["series_by_period"],
            }
            for r in regions
        ],
        # НСИ's Bulgarian edition titles the table «НАЕТИТЕ ЛИЦА ПО ТРУДОВО И
        # СЛУЖЕБНО ПРАВООТНОШЕНИЕ» and the English one shortens that to "under
        # labour contract", dropping the civil service. The shorter reading
        # understates what the figure averages over, and it does so most in the
        # област where the civil service concentrates, which is the one the
        # ladder used to be anchored on.
        "disclaimer": (
            "An област is НСИ's district, not a city. The number is the average "
            "GROSS wage across all employees on a labour contract or in the "
            "civil service in the област (not net; not a median; not specific to "
            "any industry or occupation), reported for НСИ's own quarter. Only "
            "Sofia-city is both — it is its own statistical region, BG411, so "
            "there the област and the град are the same area. The Q4 figure "
            "excludes annual bonuses, which НСИ publish as a separate column. "
            "EUR figures from NSI use the fixed eurozone rate 1.95583 BGN/EUR — "
            "no FX adjustment over time. "
            "Landing page: https://www.nsi.bg/en/statistical-data/179/569"
        ),
    }


# ---------------------------------------------------------------------------
# P1 transforms — unemployment, mortgage rate
# ---------------------------------------------------------------------------


def _rows_to_period_map(rows: list[dict]) -> dict[str, float]:
    """Flat helper: collapse a list of {time: 'YYYY-Qx', value: N} rows into
    a dict {period: value}. Takes the LAST occurrence per period (in case
    the cube returns duplicates — defensive).
    """
    return {
        str(r["time"]): float(r["value"])
        for r in rows
        if r.get("time") is not None and r.get("value") is not None
    }


# ---------------------------------------------------------------------------
# Salary distribution — fresh, individual-earnings percentile ladder
# ---------------------------------------------------------------------------

# The 1st-percentile floor is NOT here any more. It has to be applied after the
# ladder is re-levelled to today's Sofia average, and that now happens in the
# reader's browser (`mirror.js#composeLadder`), which takes the minimum wage
# from payroll.json. Flooring an unlevelled rung would floor a number that is
# not a wage.

# Percentile cut points of the published ladder. MUST stay in lockstep with
# the frontend's `percentile()` cuts in site/src/lib/mirror.js.
SALARY_LADDER_CUTS: list[int] = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99]


def build_ses_shape_ladder(ses: dict[str, Any]) -> dict[str, Any]:
    """The individual gross-earnings percentile ladder, at Eurostat SES's own level.

    **The ladder stays at SES's level and takes no second publisher's figure.**
    Everything here comes from three Eurostat aggregates — D1, the median and D9
    — so the file this produces carries one publisher's data and one
    publisher's terms. The re-levelling onto the current Sofia average happens
    in the reader's browser (`site/src/lib/mirror.js#composeLadder`), where the
    scalar it needs is read from НСИ's own monthly figures. Same numbers on
    screen, one publisher per file.

    **The re-levelling is exactly a scalar multiply, which is what makes the
    split lossless.** Every rung below is `exp(ln_at(z))`, and `ln_at` is built
    from `ln(d1)`, `ln(med)` and `ln(d9)`. Multiplying all three inputs by `f`
    adds `ln(f)` to every one of them, so it adds `ln(f)` to `ln_at(z)` for
    every z — and `sigma_bottom` and `sigma_top`, being differences of logs,
    do not move at all. Hence `rung(f) == f * rung(1)` for every cut, exactly.
    The browser multiplies; nothing is approximated.

    Method (documented in the published JSON's `shape.method`):
    1. Fill the intermediate deciles by piecewise-lognormal interpolation in
       the standard-normal quantile z (locally lognormal between the three
       anchors P10/P50/P90, matching them exactly).
    2. Extrapolate the P1/P99 tails along the nearest segment's log-slope.

    The statutory-minimum-wage floor on P1 is **not** applied here: it belongs
    after the re-levelling, because an unlevelled P1 is not a wage anyone earns.
    `mirror.js#composeLadder` applies it.

    Rungs are rounded to 4 decimal places, not 1. The browser multiplies them
    before rounding to the displayed 1 dp, and rounding twice at 1 dp moves
    three of the eleven rungs by €0.10.

    Returns:
        {"ladder_ses": {"P1": .., "P10": .., ..., "P99": ..},  # EUR/mo gross
         "ses_mean": float,                                    # the divisor
         "sigma_bottom": float, "sigma_top": float}   # local log-dispersion
    """
    d1, med, d9, mean = (
        float(ses["d1"]),
        float(ses["median"]),
        float(ses["d9"]),
        float(ses["mean"]),
    )
    if mean <= 0:
        raise ValueError("SES mean must be positive to serve as the re-level divisor")
    z = NormalDist()
    ln10, ln50, ln90 = math.log(d1), math.log(med), math.log(d9)
    z10, z90 = z.inv_cdf(0.10), z.inv_cdf(0.90)
    sigma_bottom = (ln50 - ln10) / (0 - z10)  # log-EUR per z, lower half
    sigma_top = (ln90 - ln50) / (z90 - 0)  # log-EUR per z, upper half

    def ln_at(zp: float) -> float:
        if zp <= z10:
            return ln10 + sigma_bottom * (zp - z10)
        if zp <= 0:
            return ln50 + sigma_bottom * (zp - 0)
        if zp <= z90:
            return ln50 + sigma_top * (zp - 0)
        return ln90 + sigma_top * (zp - z90)

    ladder = {f"P{p}": round(math.exp(ln_at(z.inv_cdf(p / 100))), 4) for p in SALARY_LADDER_CUTS}
    return {
        "ladder_ses": ladder,
        "ses_mean": mean,
        "sigma_bottom": round(sigma_bottom, 4),
        "sigma_top": round(sigma_top, 4),
    }


def rows_to_unemployment_observation(
    rows: list[dict],
    as_of: date,
) -> TimeSeriesObservation:
    """Build a TimeSeriesObservation for `une_rt_m` MONTHLY unemployment.

    Filters to seasonally adjusted × total (= 15-74) × both sexes × PC_ACT
    — Eurostat's own headline monthly rate, and the one BG media quote.

    Every part of that selection is load-bearing, and there is **no fallback
    branch**: each dimension has a neighbour that is a different statistic
    rather than a rougher version of the same one, so a missing cell must
    raise rather than quietly publish the neighbour.

    - `s_adj=SA`: `NSA` is unadjusted and swings seasonally; publishing it
      under a month label invites a month-on-month read that is mostly
      calendar. `TC` is a smoothed trend, not an observation.
    - `age=TOTAL`: in `une_rt_m` this IS 15-74. There is no `Y15-74` code
      here — that spelling belongs to the annual cube.
    - `unit=PC_ACT`: `THS_PER` is thousands of people.

    The previous version filtered `age == "Y15-74"` against `une_rt_a` and
    fell back to `PC_POP` — a percentage of the whole population, including
    everyone not in the labour force, which is a materially lower number
    wearing the same label.
    """
    filtered = [
        r
        for r in rows
        if r.get("s_adj") == "SA"
        and r.get("sex") == "T"
        and r.get("age") == "TOTAL"
        and r.get("unit") == "PC_ACT"
    ]
    series = _rows_to_period_map(filtered)
    if not series:
        raise ValueError(
            "No une_rt_m rows for s_adj=SA × sex=T × age=TOTAL × unit=PC_ACT. "
            "Eurostat has recoded a dimension; re-enumerate the cube rather "
            "than relaxing the filter — every neighbouring cell is a "
            "different statistic, not a coarser one."
        )
    latest_period = max(series.keys())
    return TimeSeriesObservation(
        dataset="une_rt_m:s_adj=SA:sex=T:age=TOTAL:unit=PC_ACT",
        source="eurostat",
        source_url=HttpUrl(
            "https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table?lang=en"
        ),
        ref_period=latest_period,
        published_at=as_of,
        unit="percent",
        value=series[latest_period],
        series_by_period=series,
        notes=(
            "Monthly unemployment rate, seasonally adjusted, total × both "
            "sexes × 15-74, PC_ACT (percentage of the labour force)."
        ),
    )


# NOTE: the mortgage panel deliberately does NOT use TimeSeriesObservation.
# Its payload carries two tiers plus a nested APRC series, monthly volumes and
# the BNB lending limits, which the flat single-value model cannot express.
# See `mortgage.py` for the gates and `publish.write_mortgage_payload` for the
# shape.


def build_sector_salary_payload(
    scrape: dict,
    as_of: date,
    source_url: str,
    source_url_bg: str,
) -> dict:
    """Shape НСИ's by-sector wage scrape into the published payload.

    Beside `build_region_salary_payload` because it is the same publisher's
    sibling table — `Labour_1.1.2.1` by economic activity against `1.1.2.2` by
    region — read the same way, for НСИ's own published quarter. It builds a
    plain dict rather than a `TimeSeriesObservation` because that model carries
    one series and this payload carries twenty.

    **Nothing here computes, and that is the design rather than an economy.**
    Every figure a reader will find interesting — the gap to their own pay, the
    ratio between two sectors, the distance from the all-activities average — is
    arithmetic over these cells, and §2.1.1 of НСИ's licence forbids
    distributing производни произведения. So the file carries the cells НСИ
    published and the browser does the comparing (`mirror.js`), which is where
    P8 puts a consumer's own figures in any case.

    **There is no rank in this payload and there cannot be one.** Nobody
    publishes a pay distribution by sector for Bulgaria: Eurostat's
    `earn_ses_monthly` carries no NACE section for BG at all — its five
    `nace_r2` categories are broad groupings, the finest of which lumps section
    J with seven others, and only the whole-economy one is populated at the
    2022 vintage. An average is the finest thing that exists, so
    a contributor looking for a sector median to add here will not find one
    upstream — `docs/data-sources.md` §"НСИ — average wage by economic activity"
    has the probe and the date.

    Both URLs are НСИ's: one table, two language editions, read together
    because the section NAMES are half of what this payload is for.
    """
    sectors = scrape["sectors"]
    ref_period = str(scrape["ref_period"])
    is_preliminary = bool(scrape.get("is_preliminary", False))
    prelim_marker = " (preliminary)" if is_preliminary else ""
    total = next((s for s in sectors if s["en_name"] == "Total"), None)
    total_note = f"All activities at {ref_period}: {total['value_eur']:.0f} EUR. " if total else ""

    return {
        "schema_version": "1.0",
        "as_of": as_of.isoformat(),
        "source": "nsi",
        "source_url": source_url,
        "notes": (
            f"Average GROSS monthly wage by economic activity (NACE Rev 2 "
            f"sections), as published by НСИ and unmodified. Each activity's "
            f"`value_eur` is НСИ's latest published QUARTERLY average at "
            f"{ref_period}{prelim_marker}; `series_by_period` is their full "
            f"quarterly series. {total_note}Nothing in this file is computed by "
            f"us — no gap, no ratio, no rank. The quarter is НСИ's own reporting "
            f"period and avoids the March bonus spike that dominates their "
            f"single-month readings; the Q4 column taken is `IV`, not `IV "
            f"incl.annual bonuses`. Section names are НСИ's own in each language, "
            f"from the English and Bulgarian editions of the same table. Covers "
            f"people on a labour contract AND in the civil service. NO pay DISTRIBUTION by "
            f"sector is published for Bulgaria by anyone, so these are averages "
            f"and support no percentile. All values in EUR (fixed 1.95583 "
            f"BGN/EUR)."
        ),
        "payload_name": "sector_salary",
        "source_url_bg": source_url_bg,
        "dataset": (
            "Labour_1.1.2.1_EUR_EN.xlsx + Labour_1.1.2.1_EUR.xlsx:"
            "sheet={year}NaceRev2|{year}КИД2008:quarterly by-activity block"
        ),
        "ref_period": ref_period,
        "published_at": as_of.isoformat(),
        "unit": "eur_per_month",
        "is_preliminary": is_preliminary,
        "sectors": [
            {
                "en_name": s["en_name"],
                "bg_name": s["bg_name"],
                "value_eur": s["value_eur"],
                "series_by_period": s["series_by_period"],
            }
            for s in sectors
        ],
        # НСИ's Bulgarian edition titles the table «НАЕТИТЕ ЛИЦА ПО ТРУДОВО И
        # СЛУЖЕБНО ПРАВООТНОШЕНИЕ» and the English one shortens that to "under
        # labour contract", dropping the civil service. The shorter reading tells
        # anyone who picks «Държавно управление» — one of the nineteen sections
        # here — that their own section is outside the figure they are compared
        # against, so the payload states what the Bulgarian title states.
        "disclaimer": (
            "Average GROSS wage across all employees on a labour contract or in "
            "the civil service in the activity (not net; not a median and not a "
            "rank). НСИ publish no "
            "distribution by activity, and neither does anyone else, so there is "
            "no percentile to read off this. Self-employed people and those "
            "working through their own company are outside the series by "
            "construction. NACE Rev 2 sections are broad: 'Information and "
            "communication' is publishing, film, broadcasting and "
            "telecommunications alongside software. The Q4 figure excludes "
            "annual bonuses, which НСИ publish as a separate column."
        ),
    }


# ---------------------------------------------------------------------------
# The property market
# ---------------------------------------------------------------------------

# Eurostat's own purchase codes → the field names the payload uses. Publishing
# `new` and `existing` rather than `DW_NEW` and `DW_EXST` keeps the two
# spellings that differ by one letter out of the site entirely, where a typo
# reads as a missing figure rather than as an error.
PURCHASE_FIELDS: dict[str, str] = {
    "TOTAL": "total",
    "DW_NEW": "new",
    "DW_EXST": "existing",
}


def _rows_by_period_and_purchase(
    rows: list[dict], unit: str | None = None
) -> dict[str, dict[str, float]]:
    """Collapse cube rows to {period: {total|new|existing: value}}.

    Rows whose purchase code is not one of the three are dropped rather than
    carried under their upstream name — a fourth code appearing upstream is a
    reshaped cube, and the coverage check in `build_house_market_payload` is
    what notices it.
    """
    out: dict[str, dict[str, float]] = {}
    for r in rows:
        if unit is not None and r.get("unit") != unit:
            continue
        field = PURCHASE_FIELDS.get(str(r.get("purchase")))
        if field is None or r.get("value") is None or r.get("time") is None:
            continue
        out.setdefault(str(r["time"]), {})[field] = float(r["value"])
    return out


def _flags_by_period(rows: list[dict], unit: str | None = None) -> dict[str, dict[str, str]]:
    """Eurostat's own flags on their own cells, {period: {field: letter}}.

    Sparse on purpose: a quarter Eurostat did not flag carries no entry, so the
    published map is a few dozen bytes and its presence at a period MEANS
    something rather than being a default the reader has to filter.

    `e` estimated, `b` break in series, `p` provisional, `d` definition differs,
    and combinations. **They are the publisher's statement about their own
    number**, and a chart that draws an unbroken line across a flagged break has
    made a claim on their behalf that they declined to make.
    """
    out: dict[str, dict[str, str]] = {}
    for r in rows:
        if unit is not None and r.get("unit") != unit:
            continue
        field = PURCHASE_FIELDS.get(str(r.get("purchase")))
        flag = r.get("status")
        if field is None or not flag or r.get("time") is None:
            continue
        out.setdefault(str(r["time"]), {})[field] = str(flag)
    return out


def build_house_market_payload(
    count: CubeFetch,
    value: CubeFetch,
    index: CubeFetch,
    real_index: CubeFetch,
    as_of: date,
) -> dict:
    """Shape the three Eurostat property cubes into `house_market.json`.

    One publisher, one file. Everything here is Eurostat's — the deal counts,
    what was paid, the index level and the annual rate — which is what lets the
    one derived figure in it be disclosed as a derivation of Eurostat data
    rather than as a composite of two publishers'.

    **`avg_deal_eur` is ours, and it is the reason this payload carries a
    modification notice.** Eurostat permit derivation on condition it is stated
    clearly to the end user and carries their non-responsibility clause, so the
    envelope says so in the same words `INDEX_DERIVATION_NOTE` uses for the
    HICP selection. Nobody publishes an average Bulgarian dwelling transaction;
    the two cubes that make one are both here, at the same vintage, from the
    same publisher.

    **A quarter is published only where both cubes have it.** The value series
    starts two years before the count series, so eight quarters carry a value
    and no count — and `value ÷ nothing` is not a small error, it is a number
    with no denominator. Pairing on the intersection is what keeps a partial
    quarter out rather than a zero in.

    Purchase splits ride along on all three because the split is the story: new
    builds and existing dwellings move differently in price and in volume, and
    an average deal that mixes them hides which one moved.
    """
    counts = _rows_by_period_and_purchase(count.rows)
    values = _rows_by_period_and_purchase(value.rows)
    levels = _rows_by_period_and_purchase(index.rows, unit=HOUSE_PRICE_INDEX_UNIT)
    rates = _rows_by_period_and_purchase(index.rows, unit=HOUSE_PRICE_RATE_UNIT)
    level_flags = _flags_by_period(index.rows, unit=HOUSE_PRICE_INDEX_UNIT)
    # `tipsho30` has no `purchase` dimension — Eurostat deflate the total only —
    # so it is read straight rather than through the purchase collapser, and the
    # page may not imply a split it does not have.
    real_levels = {
        str(r["time"]): float(r["value"])
        for r in real_index.rows
        if r.get("value") is not None and r.get("time") is not None
    }
    real_flags = {
        str(r["time"]): str(r["status"])
        for r in real_index.rows
        if r.get("status") and r.get("time") is not None
    }

    if not counts or not values or not levels or not rates or not real_levels:
        raise ValueError(
            "house market: one of the five series came back empty "
            f"(counts {len(counts)}, values {len(values)}, index {len(levels)}, "
            f"rates {len(rates)}, deflated {len(real_levels)}). A cube that "
            f"filtered to nothing answers 200."
        )

    # The intersection, and only where BOTH sides carry a total to divide.
    paired = sorted(
        p
        for p in set(counts) & set(values)
        if counts[p].get("total") and values[p].get("total") is not None
    )
    if not paired:
        raise ValueError(
            "house market: the count and value cubes share no quarter carrying "
            "both a deal count and a value. They are published on different "
            "windows, so an empty intersection means one of them was filtered "
            "to nothing rather than that the market stopped."
        )

    avg_deal: dict[str, dict[str, float]] = {}
    for period in paired:
        row: dict[str, float] = {}
        for field in ("total", "new", "existing"):
            n = counts[period].get(field)
            v = values[period].get(field)
            if n and v is not None:
                # Two decimals rather than whole euro: this is an average, and
                # rounding it to the euro invites reading it as a price
                # somebody paid.
                row[field] = round(v / n, 2)
        if row:
            avg_deal[period] = row

    latest = paired[-1]
    latest_rate_period = max(rates)

    return {
        "schema_version": "1.0",
        "as_of": as_of.isoformat(),
        "source": "eurostat",
        "source_url": count.page_url,
        "notes": (
            "Bulgaria's residential property market as Eurostat publish it, "
            "quarterly: how many dwellings households bought, what they paid, "
            "and the official house price index with Eurostat's own annual rate "
            "of change, in the money of the day AND deflated. Scope is "
            "dwellings bought by households at the price "
            "actually paid — flats and houses, VAT included on new builds, "
            "notary and agency fees excluded, land only as the plot under a "
            "house. Standalone land, garages, shops and offices are outside it, "
            "as are state and municipal sales, gifts, inheritances, "
            "court-executor sales and self-build. "
            "MODIFICATION NOTICE, per Eurostat's reuse conditions: every figure "
            "under deals, value, price_index, annual_rate_pct and "
            "price_index_real is Eurostat's own, unmodified, at the unit each "
            "block names. `avg_deal_eur` is "
            "OURS — the value cube divided by the count cube, quarter by "
            "quarter and purchase type by purchase type, published only for the "
            "quarters both cubes carry. Eurostat is not responsible for that "
            "division or for any conclusion drawn from it."
        ),
        "payload_name": "house_market",
        "ref_period": latest,
        "deals": {
            "_role": "COUNT: dwellings sold, as published",
            "dataset": count.dataset,
            "source_url": count.page_url,
            "api_url": count.api_url,
            "unit": "count",
            "series_by_period": {p: counts[p] for p in sorted(counts)},
        },
        "value": {
            "_role": "VALUE: what households paid for them, as published",
            "dataset": value.dataset,
            "source_url": value.page_url,
            "api_url": value.api_url,
            "unit": HOUSE_SALES_VALUE_UNIT.lower(),
            "series_by_period": {p: values[p] for p in sorted(values)},
        },
        "price_index": {
            "_role": "INDEX + RATE: the official house price index, as published",
            "dataset": index.dataset,
            "source_url": index.page_url,
            "api_url": index.api_url,
            "unit": f"index_{HOUSE_PRICE_INDEX_BASE_YEAR}=100",
            "base_year": HOUSE_PRICE_INDEX_BASE_YEAR,
            "series_by_period": {p: levels[p] for p in sorted(levels)},
            # Eurostat's published rate, never computed from the index above.
            # НСИ rebased to 2025=100 from the start of 2026 and warn that a
            # rate recomputed across the two bases can differ in the last
            # decimal — which is the decimal the cross-publisher gate compares.
            "annual_rate_pct": {p: rates[p] for p in sorted(rates)},
            "rate_ref_period": latest_rate_period,
            # Eurostat's own flags, on the level series a chart draws.
            "status_by_period": {p: level_flags[p] for p in sorted(level_flags)},
        },
        "price_index_real": {
            "_role": "INDEX: the SAME index deflated, as published",
            "dataset": real_index.dataset,
            "source_url": real_index.page_url,
            "api_url": real_index.api_url,
            "unit": f"index_{HOUSE_PRICE_INDEX_BASE_YEAR}=100_deflated",
            "base_year": HOUSE_PRICE_INDEX_BASE_YEAR,
            # No purchase split, because Eurostat publish none: `tipsho30` has
            # no `purchase` dimension and a page implying one would be inventing
            # a series.
            "series_by_period": {p: real_levels[p] for p in sorted(real_levels)},
            "status_by_period": {p: real_flags[p] for p in sorted(real_flags)},
            "note": (
                "The house price index divided by the national accounts "
                "deflator for private final consumption, as Eurostat publish "
                "it. Same 2015 base and same quarters as the nominal index "
                "above, so the two are read on one axis. Nothing here is "
                "computed by us: this is their deflated series, not their "
                "nominal one with our arithmetic on it."
            ),
        },
        "avg_deal_eur": {
            "_role": "DERIVED BY US: value ÷ count, per quarter and purchase type",
            "derived_from": [value.dataset, count.dataset],
            # The two queries a sceptic runs to reproduce every figure here.
            # Naming the datasets alone would leave them to guess the filters,
            # and a different filter is how two people get two answers from one
            # dataset and both believe the other is lying.
            "derived_from_api_urls": [value.api_url, count.api_url],
            "unit": "eur",
            "series_by_period": avg_deal,
            "latest": avg_deal.get(latest, {}),
            "method": (
                "Eurostat's published quarterly transaction value divided by "
                "Eurostat's published quarterly transaction count, for the "
                "quarters both cubes carry. Not a price per square metre and "
                "not a median: it is the mean amount paid for a dwelling, and a "
                "quarter's mix of flats and houses moves it. Eurostat publish "
                "neither this figure nor any per-city equivalent."
            ),
        },
        "disclaimer": (
            "Dwellings bought by HOUSEHOLDS, at the price paid. This is not a "
            "count of all property sales: the property register records every "
            "sale deed — land, garages, shops, offices — and runs more than "
            "twice as high for the same quarter. The two measure different "
            "things and neither is wrong."
        ),
    }


def build_house_market_structure_payload(structure: dict[str, CubeFetch], as_of: date) -> dict:
    """Shape the four Eurostat structure cubes into `house_market_structure.json`.

    Who owns, who owes, how many homes stood empty at the census, and whether
    any of it is expensive against what people earn. None of these is quarterly
    and none is a transaction, which is why they are a second file rather than
    more keys on the first: they move on four different clocks, and a payload
    whose freshness row has to describe an annual survey and a 2021 census at
    once can date neither honestly.

    Nothing here is derived. The unoccupied SHARE a reader sees is computed in
    their browser from the two counts published below, for the same reason
    every other cross-figure comparison is: this file stays a set of cells
    Eurostat published.
    """
    tenure_cube = structure[TENURE_DATASET]
    census_cube = structure[CENSUS_DWELLINGS_DATASET]
    ptir_cube = structure[PRICE_TO_INCOME_DATASET]
    burden_cube = structure[HOUSING_OVERBURDEN_DATASET]
    tenure_rows, census_rows = tenure_cube.rows, census_cube.rows
    ptir_rows, burden_rows = ptir_cube.rows, burden_cube.rows

    def latest_of(rows: list[dict]) -> str:
        periods = [str(r["time"]) for r in rows if r.get("time") is not None]
        if not periods:
            raise ValueError("housing structure: a cube came back with no period")
        return max(periods)

    tenure_period = latest_of(tenure_rows)
    tenure = {
        str(r["tenure"]): float(r["value"])
        for r in tenure_rows
        if str(r.get("time")) == tenure_period and r.get("value") is not None
    }
    for code in ("TOTAL", "OWN", "OWN_L", "RENT", "RENT_MKT"):
        if code not in tenure:
            raise ValueError(
                f"housing structure: tenure cube is missing {code!r} at "
                f"{tenure_period}. The seven codes are one split of one "
                f"population and a missing one means the slice moved."
            )

    census_period = latest_of(census_rows)
    census = {
        str(r["housing"]): float(r["value"])
        for r in census_rows
        if str(r.get("time")) == census_period and r.get("value") is not None
    }
    for code in ("DW", "DW_OC", "DW_NOC"):
        if code not in census:
            raise ValueError(f"housing structure: census cube is missing {code!r}")

    ptir = _rows_to_period_map(ptir_rows)
    burden = _rows_to_period_map(burden_rows)
    ptir_period = max(ptir)
    burden_period = max(burden)

    return {
        "schema_version": "1.0",
        "as_of": as_of.isoformat(),
        "source": "eurostat",
        "source_url": tenure_cube.page_url,
        "notes": (
            "The structure of Bulgarian housing, from four Eurostat cubes on "
            "four different clocks: tenure and housing-cost overburden are "
            "annual EU-SILC, the dwelling counts are a census snapshot, and the "
            "price-to-income ratio is annual. Every figure is Eurostat's own, "
            "unmodified. Nothing here is derived — the unoccupied share and any "
            "comparison between these figures is computed in the reader's "
            "browser from the counts below."
        ),
        "payload_name": "house_market_structure",
        "ref_period": tenure_period,
        "tenure": {
            "_role": "TENURE: how the population lives, % of people",
            "dataset": tenure_cube.dataset,
            "source_url": tenure_cube.page_url,
            "api_url": tenure_cube.api_url,
            "unit": "percent_of_population",
            "ref_period": tenure_period,
            "total_pct": tenure["TOTAL"],
            "owner_pct": tenure["OWN"],
            # The figure that explains the rest of the page. An owner-occupied
            # country where almost nobody is leveraged is one where price is set
            # at the margin by a very small number of borrowers.
            "owner_with_mortgage_pct": tenure["OWN_L"],
            "owner_no_mortgage_pct": tenure.get("OWN_NL"),
            "rent_pct": tenure["RENT"],
            "rent_market_price_pct": tenure["RENT_MKT"],
            "rent_reduced_or_free_pct": tenure.get("RENT_FR"),
        },
        "census_dwellings": {
            "_role": "STOCK: conventional dwellings by occupancy, at the census",
            "dataset": census_cube.dataset,
            "source_url": census_cube.page_url,
            "api_url": census_cube.api_url,
            "unit": "count",
            "ref_period": census_period,
            "total": census["DW"],
            "occupied": census["DW_OC"],
            "unoccupied": census["DW_NOC"],
        },
        "price_to_income": {
            "_role": "RATIO: price-to-income against this country's OWN long-run average",
            "dataset": ptir_cube.dataset,
            "source_url": ptir_cube.page_url,
            "api_url": ptir_cube.api_url,
            "unit": PRICE_TO_INCOME_UNIT,
            "ref_period": ptir_period,
            "value": ptir[ptir_period],
            "series_by_period": ptir,
            "note": (
                "100 is this country's own long-run average, not another "
                "country's level. A reading below 100 says homes cost less "
                "relative to Bulgarian incomes than they have on average over "
                "the series; it says nothing about whether they are cheap."
            ),
        },
        "housing_cost_overburden": {
            "_role": "BURDEN: share of people spending over 40% of income on housing",
            "dataset": burden_cube.dataset,
            "source_url": burden_cube.page_url,
            "api_url": burden_cube.api_url,
            "unit": "percent_of_population",
            "ref_period": burden_period,
            "value_pct": burden[burden_period],
            "series_by_period": burden,
        },
        "disclaimer": (
            "EU-SILC is a sample survey of private households, so tenure and "
            "overburden carry sampling error and exclude people not living in "
            "private households. The dwelling counts are a census snapshot — the "
            "census block names its own year and no newer count exists; "
            "'unoccupied' there means unoccupied on census night, which covers "
            "second homes and holiday properties alongside genuinely empty stock."
        ),
    }


def build_nsi_housing_payload(workbooks: dict[str, dict], as_of: date) -> dict:
    """Shape НСИ's housing workbooks into `nsi_housing.json`.

    **Every figure here is a cell НСИ published, selected and never computed.**
    §2.1.1 of their licence forbids distributing производни и сборни
    произведения, so a percentage this pipeline calculated rather than read
    would be a licence breach that looks exactly like a correct number — the
    same reason `sector_salary.json` carries no gap, ratio or rank
    (`docs/legal.md` §НСИ). The one arithmetic step is rounding the workbook's
    stored float to the one decimal НСИ print, which is reading the cell as
    published rather than deriving from it.

    It is its own payload rather than more keys on `house_market.json` for the
    same licence reason: one publisher per published artefact, so a file mixing
    НСИ's cells with Eurostat's would be a сборно произведение however carefully
    it were captioned. The two meet in the reader's browser, never on disk.

    The city rows carry a percentage and no level, and that is the upstream
    rather than a choice: every НСИ city series is an index or a change, and
    their own лв./кв.м survey ended in 2014. So `/market/` compares change
    against change and says out loud that no publisher gives a transaction price
    per square metre for a Bulgarian city.
    """
    by_code = {r.code: r for r in REGIONS}

    def block(stem: str, geography_keyed: bool) -> dict:
        wb = workbooks[stem]
        data = wb["data"]
        out: dict[str, Any] = {
            "dataset": f"{stem}.xlsx",
            "source_url": wb["url"],
            "sheet": wb["sheet"],
            "unit": "percent_change_on_same_quarter_a_year_earlier",
            "note": (
                "НСИ's own published change on the same quarter of the previous "
                "year, selected from the workbook named above and not computed "
                "here. The workbook stores the float their subtraction produced, "
                "so a cell printed as -19.2 is held as -19.200000000000003; the "
                "published value is theirs at the precision they print it."
            ),
        }
        if not geography_keyed:
            series = data[""]
            latest = max(series["total"])
            out["ref_period"] = latest
            out["series_by_period"] = {
                p: {f: series[f][p] for f in ("total", "new", "existing") if p in series.get(f, {})}
                for p in sorted(series["total"])
            }
            out["value_pct"] = out["series_by_period"][latest]
            return out

        cities = []
        for bg_name, code in HOUSING_CITIES.items():
            series = data.get(bg_name)
            if series is None:
                raise ValueError(
                    f"{stem}: НСИ's workbook carries no rows for {bg_name!r}. The "
                    f"six cities are named in the file's own footnote and a "
                    f"missing one means the label changed or a footnote marker "
                    f"is no longer being stripped."
                )
            region = by_code[code]
            latest = max(series["total"])
            cities.append(
                {
                    "code": code,
                    "name_bg": region.city_bg,
                    "name_en": region.city_en,
                    "ref_period": latest,
                    "value_pct": series["total"],
                    "series_by_period": {p: series["total"][p] for p in sorted(series["total"])},
                }
            )
        out["cities"] = cities
        out["ref_period"] = max(c["ref_period"] for c in cities)
        # Each city's headline is its own latest cell, so a city НСИ has not yet
        # published for this quarter is dated by the quarter it HAS, rather than
        # being shown under a heading naming a quarter it is missing from.
        for city in cities:
            city["value_pct"] = city["series_by_period"][city["ref_period"]]
        return out

    national = block("HPI_1.3", geography_keyed=False)
    return {
        "schema_version": "1.0",
        "as_of": as_of.isoformat(),
        "source": "nsi",
        "source_url": workbooks["HPI_1.3"]["url"],
        "notes": (
            "НСИ's housing price and sales statistics, as published. The "
            "national house price index change on the same quarter a year "
            "earlier, and the same figure for the six cities over 120,000 "
            "people, beside the change in the NUMBER of sales for those cities. "
            "Nothing in this file is computed by us — no gap, no ratio, no rank, "
            "and no level: every НСИ city series is an index or a percentage, "
            "and their лв./кв.м survey ran to 2014-Q2 and was discontinued, so "
            "no transaction price per square metre exists for any Bulgarian "
            "city from any publisher."
        ),
        "payload_name": "nsi_housing",
        "ref_period": national["ref_period"],
        "national_price_index_yoy": national,
        "city_price_index_yoy": block("HPI_2.6", geography_keyed=True),
        "city_deals_yoy": block("HSI_2.4.5", geography_keyed=True),
        "disclaimer": (
            "Transaction prices for dwellings bought by households, and the "
            "number of those transactions. A percentage change, never a level: "
            "these say how much prices and volumes moved, not what anything "
            "costs. The asking prices per square metre elsewhere on this site "
            "are имот.bg's listings and a different measurement."
        ),
    }
