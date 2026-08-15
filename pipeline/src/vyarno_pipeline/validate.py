"""Validation gates. Publish blocks if any of these raise.

Seven gates guard the HICP publish:

1. **Classification agreement** — the weights cube and the rates cube must
   agree, code by code, on what each code *means*. A shared code string is not
   evidence of a shared meaning: joining two classification versions by raw CP
   code puts one bucket's weight next to another bucket's rate.
2. **Chain reconciliation** — the published divisions must reproduce the
   official all-items index movement through HICP's own chain-linking
   identity, to ±0.02 pp.
3. **Basket-sum sanity** — Σ(w·r) must land near the headline. A loose band
   by design (see `BASKET_SUM_TOLERANCE_PP`); the tight check is gate 2.
4. **Group consistency** — each division's groups must sum to the division's
   own weight.
5. **Coverage** — every category has an index value for every required year.
6. **Link status** — every published URL returns 200 AND its body looks like
   an actual Eurostat response (NOT just the status code — Eurostat returns
   200 with an error payload on rate-limit / invalid params, and a naive
   200-check would silently pass that).
7. **Flash marker** — `is_flash` agrees with the two months the headline
   payload publishes. The site prints the marker beside the rate, so a wrong
   one either calls a settled figure an estimate or lets an estimate render as
   settled.

One more guards the НСИ by-sector wage publish, and it is listed apart because
it gates a different payload rather than an eighth property of the same one:

8. **Sector wages** — every activity carries both language names and a value at
   the payload's own reference period, no two rows resolve to one activity, and
   the headline IS the published cell rather than anything computed from it.
"""

from __future__ import annotations

import re
from collections.abc import Callable

import httpx

# ---------------------------------------------------------------------------
# Tolerances
# ---------------------------------------------------------------------------

# Gate 2 — the chain-linked reconciliation. HICP is an annually chain-linked
# Laspeyres index: within a year, the aggregate index relative to the previous
# December is EXACTLY the weighted mean of each division's index relative to
# that same December, using the current year's weights:
#
#     I_total(m) / I_total(Dec, y-1)  ==  Σ_i w_i(y) · I_i(m) / I_i(Dec, y-1)
#
# That is an identity, not an approximation: measured against live BG data for
# every month of 2021-01…2026-06 (66 months), the largest deviation is
# 0.0091 pp, at 2021-02 and 2021-05. Fourteen of the 66 exceed 0.005 pp, so
# 0.005 is NOT the ceiling — an earlier version of this comment said it was,
# and re-running the measurement is the only way that gets caught. 0.02 pp
# leaves ~2.2x headroom over the observed worst case, which is Eurostat's
# 2-decimal index rounding and nothing else. Do NOT widen it — if this trips,
# the weights, the rates and the index are not describing the same basket.
#
# To re-measure: pull prc_hicp_iw for every vintage and prc_hicp_minr I15 for
# CP00 + the divisions, then run this gate month by month with the weights
# vintage matching each month's year.
CHAIN_TOLERANCE_PP: float = 0.02

# Gate 3 — the naive Σ(w·r) vs headline band.
#
# Σ(weight × annual rate) is what the SPA computes for the user's basket, so
# it is worth sanity-checking, but it is NOT an identity: the 12-month window
# straddles the December chain-link, and the official aggregate re-weights at
# that link. The residual grows with the dispersion of category rates. On BG
# 2026-06 data — correct ver.2 weights, correct ver.2 rates — Σ(w·r) is
# 5.356% against a 5.2% headline: a genuine 0.16 pp methodological gap, not
# an error.
#
# This band is therefore deliberately loose. It catches a gross failure (a
# division dropped, a weight vector off by 10×) while gate 2 catches the
# subtle ones with 25× the precision. Read docs/math.md §"Two reconciliations"
# before touching it; widening THIS number hides nothing that gate 2 would
# not still catch, and tightening it would fail on correct data.
BASKET_SUM_TOLERANCE_PP: float = 0.5

# Gate 4 — a division's groups must sum to the division. Eurostat publishes
# per-thousand weights rounded to 2 decimals, so 13 divisions' worth of
# children can miss by a couple of hundredths of a per-mille.
GROUP_SUM_TOLERANCE_PCT: float = 0.02


class ValidationError(Exception):
    """Raised when a validation gate fails. Publish must abort."""


# ---------------------------------------------------------------------------
# Gate 1 — classification agreement
# ---------------------------------------------------------------------------

_LABEL_NOISE = re.compile(r"[^a-z0-9]+")


def _norm_label(label: str) -> str:
    """Normalise an upstream label for comparison (case, punctuation, spacing).

    Deliberately conservative: it folds "Insurance and financial services" and
    "insurance & financial services" together, but keeps "Insurance and
    financial services" distinct from "Miscellaneous goods and services".
    Only cosmetic variation is absorbed; a different bucket still fails.
    """
    return _LABEL_NOISE.sub(" ", label.lower().replace("&", " and ")).strip()


def validate_classification_agreement(
    codes: list[str],
    weight_labels: dict[str, str],
    rate_labels: dict[str, str],
    weights_dim: str,
    rates_dim: str,
) -> None:
    """The weights cube and the rates cube must describe the SAME buckets.

    Three checks, in the order a mismatch actually shows up:

    1. **Same dimension name.** ECOICOP ver.1 cubes are keyed by `coicop`,
       ver.2 by `coicop18`. Two different dimension names mean two different
       classifications, and no per-code comparison below is even meaningful.
    2. **Same code set.** Every code we publish must exist in BOTH cubes. This
       is what catches a division that exists in one version and not the other
       — ver.1 has no CP13 at all.
    3. **Same label per code.** The cubes' own English names for each code
       must match. This is what catches a shared code string standing for two
       different buckets: the ver.1 weights cube calls CP12 "Miscellaneous
       goods and services" while the ver.2 rate cube calls it "Insurance and
       financial services", so joining them by raw code puts one bucket's
       weight next to another bucket's rate on the same card.

    Args:
        codes: the codes about to be published (divisions + groups).
        weight_labels: {code → label} from the weights cube.
        rate_labels: {code → label} from the rates cube.
        weights_dim / rates_dim: the COICOP dimension each cube used.
    """
    if weights_dim != rates_dim:
        raise ValidationError(
            f"classification: weights cube is keyed by {weights_dim!r} but the "
            f"rates cube is keyed by {rates_dim!r}. These are different ECOICOP "
            f"versions — joining them by raw CP code mixes classifications."
        )

    missing_w = [c for c in codes if c not in weight_labels]
    missing_r = [c for c in codes if c not in rate_labels]
    if missing_w or missing_r:
        raise ValidationError(
            f"classification: code(s) absent from a cube — "
            f"missing from weights: {missing_w or 'none'}; "
            f"missing from rates: {missing_r or 'none'}. A code that exists in "
            f"only one cube cannot have a weight and a rate that mean the same "
            f"thing."
        )

    mismatches = [
        (c, weight_labels[c], rate_labels[c])
        for c in codes
        if _norm_label(weight_labels[c]) != _norm_label(rate_labels[c])
    ]
    if mismatches:
        detail = "; ".join(
            f"{c}: weights say {wl!r} but rates say {rl!r}" for c, wl, rl in mismatches
        )
        raise ValidationError(
            f"classification: {len(mismatches)} code(s) mean different things in "
            f"the two cubes — {detail}. Publishing would show one bucket's "
            f"weight next to another bucket's rate."
        )


def validate_meta_labels_cover(codes: list[str], meta: dict[str, tuple]) -> None:
    """Every published code needs a friendly BG/EN name.

    Without this, a new upstream code would either crash the transform or —
    worse, in an earlier design — be silently skipped, which is how a whole
    division can vanish from the basket without anyone noticing.
    """
    missing = [c for c in codes if c not in meta]
    if missing:
        raise ValidationError(
            f"classification: {len(missing)} published code(s) have no friendly "
            f"name in COICOP_META: {missing}. Add Bulgarian/English names in "
            f"transform.py — do not drop the codes."
        )


# ---------------------------------------------------------------------------
# Gate 2 — chain-linked reconciliation
# ---------------------------------------------------------------------------


def validate_chain_reconciliation(
    categories: list,
    total_index_by_period: dict[str, float],
    division_index_by_period: dict[str, dict[str, float]],
    ref_period: str,
    weights_year: str,
) -> None:
    """Reproduce the official all-items index from the divisions, exactly.

    HICP's own aggregation identity within a year `y`, linked at December of
    `y-1`:

        I_total(m) / I_total(Dec, y-1)  ==  Σ_i w_i(y) · I_i(m) / I_i(Dec, y-1)

    We rebuild the left side from the published divisions and compare. Because
    it is an identity rather than an approximation, it holds to a few
    thousandths of a percentage point on correct data — which makes it a real
    test of whether the weights, the rates and the index all describe the same
    basket, on the same classification, at the same vintage.

    Its power, on live BG data at 2026-06:
        weights from the wrong classification → −0.3445 pp  → FAILS
        weights from the right one            → −0.0036 pp  → passes

    Args:
        categories: the CategoryObservation list (divisions only).
        total_index_by_period: {"YYYY-MM": index} for CP00/TOTAL, raw upstream
            base (any base works — the identity is a ratio).
        division_index_by_period: {cp_code: {"YYYY-MM": index}}, same base.
        ref_period: the month being reconciled, e.g. "2026-06".
        weights_year: the vintage of `weight_pct`, e.g. "2026". Must be the
            year of `ref_period` — mixing a weight year with a different rate
            year is the drift this whole gate exists to catch.
    """
    year = ref_period.split("-")[0]
    if weights_year != year:
        raise ValidationError(
            f"chain reconciliation: weights are the {weights_year} vintage but "
            f"the rates are {ref_period}. HICP re-weights every January, so "
            f"these describe different baskets. Wait for Eurostat's annual "
            f"item-weights release (usually late February) before refreshing "
            f"— see docs/validation-gates.md."
        )
    link = f"{int(year) - 1}-12"

    if link not in total_index_by_period or ref_period not in total_index_by_period:
        raise ValidationError(
            f"chain reconciliation: TOTAL index missing {link!r} or "
            f"{ref_period!r} — cannot rebuild the aggregate."
        )

    total_weight = sum(c.weight_pct for c in categories)
    if abs(total_weight - 100.0) > 0.05:
        raise ValidationError(
            f"chain reconciliation: division weights sum to {total_weight:.4f}%, "
            f"expected 100% (sum of {len(categories)} divisions)"
        )

    rebuilt = 0.0
    for c in categories:
        series = division_index_by_period.get(c.cp_code, {})
        if link not in series or ref_period not in series:
            raise ValidationError(
                f"chain reconciliation: {c.cp_code} index missing {link!r} or {ref_period!r}"
            )
        rebuilt += c.weight_pct * series[ref_period] / series[link]
    rebuilt = 100.0 * rebuilt / total_weight

    actual = 100.0 * total_index_by_period[ref_period] / total_index_by_period[link]
    gap = abs(rebuilt - actual)
    if gap > CHAIN_TOLERANCE_PP:
        raise ValidationError(
            f"chain reconciliation: divisions rebuild the all-items index as "
            f"{rebuilt:.4f} (Dec {int(year) - 1} = 100) but Eurostat publishes "
            f"{actual:.4f}; gap {gap:.4f} pp > {CHAIN_TOLERANCE_PP} pp. The "
            f"weights, the rates and the index are not describing the same "
            f"basket — check that all three come from ECOICOP ver.2 cubes."
        )


# ---------------------------------------------------------------------------
# Gate 3 — basket-sum sanity
# ---------------------------------------------------------------------------


def validate_reconciliation(
    categories: list,
    headline_rate_pct: float,
) -> None:
    """Σ(w_i × r_i) / Σw_i must land within a loose band of the headline.

    This mirrors the arithmetic the SPA does for the user's basket, so a gross
    error here would be visible on screen. It is NOT an identity — see
    `BASKET_SUM_TOLERANCE_PP` for why a ~0.16 pp gap is correct on today's BG
    data, and `validate_chain_reconciliation` for the exact check.
    """
    tw = sum(c.weight_pct for c in categories)
    if abs(tw - 100.0) > 0.05:
        raise ValidationError(
            f"weights do not sum to 100: got {tw:.4f} (sum of {len(categories)} categories)"
        )
    weighted = sum(c.weight_pct * c.annual_rate_pct for c in categories) / tw
    gap = abs(weighted - headline_rate_pct)
    if gap > BASKET_SUM_TOLERANCE_PP:
        raise ValidationError(
            f"basket sum: weighted Σ(w·r)={weighted:.4f}% vs headline="
            f"{headline_rate_pct:.4f}%, gap={gap:.4f}pp > tolerance "
            f"{BASKET_SUM_TOLERANCE_PP}pp"
        )


# ---------------------------------------------------------------------------
# Gate 4 — group consistency
# ---------------------------------------------------------------------------


def validate_group_consistency(categories: list) -> None:
    """Each division's groups must sum to the division's own weight.

    The groups are what the SPA's detailed mode lets the user re-split. If
    they did not add up to their parent, drilling into a division would
    silently change the size of that division in the user's basket.

    Also checks every group names its parent correctly and that no division
    is left without groups — a division whose children vanished upstream
    would render as a dead "expand" affordance.
    """
    for c in categories:
        if not c.groups:
            raise ValidationError(
                f"groups: {c.cp_code} has no groups. Eurostat publishes level-2 "
                f"detail for every division; an empty list means the fetch or "
                f"the group discovery broke."
            )
        for g in c.groups:
            if g.parent_cp_code != c.cp_code:
                raise ValidationError(
                    f"groups: {g.cp_code} is nested under {c.cp_code} but names "
                    f"{g.parent_cp_code} as its parent"
                )
            if not g.cp_code.startswith(c.cp_code):
                raise ValidationError(f"groups: {g.cp_code} is not a child code of {c.cp_code}")
        child_sum = sum(g.weight_pct for g in c.groups)
        if abs(child_sum - c.weight_pct) > GROUP_SUM_TOLERANCE_PCT:
            raise ValidationError(
                f"groups: {c.cp_code} weight is {c.weight_pct:.4f}% but its "
                f"{len(c.groups)} groups sum to {child_sum:.4f}% "
                f"(gap {abs(child_sum - c.weight_pct):.4f} pp > "
                f"{GROUP_SUM_TOLERANCE_PCT} pp)"
            )


# ---------------------------------------------------------------------------
# Gate 5 — coverage
# ---------------------------------------------------------------------------


def validate_coverage(
    categories: list,
    years: list[int],
) -> None:
    """Every category AND every group must have an index value for every
    required year.

    Any anchor year (2020..latest) must be computable from the published JSON,
    at both levels — the detailed mode offers the same "since year Y" anchors
    the division view does. A missing year = the site fails to render that
    anchor = ship blocker.

    **`years` has no default, deliberately, and must not be given one.** A
    hardcoded `range(2020, 2027)` demands the CURRENT year, and
    `rows_to_yearly_index` drops the current year until its December reading is
    published — so a defaulted call raises on correct data for eleven months
    out of twelve, and starts demanding 2027 of its own accord in January.
    `cli.py` does not hit it because it passes the
    completed-year window explicitly; anyone calling the gate directly did.

    The window is a property of the run, not of this module: the caller knows
    `since_year` and `as_of`, and naming it at the call site is what keeps the
    partial-year exclusion in one place instead of two that can disagree.
    """
    for c in categories:
        missing = [y for y in years if y not in c.index_by_year]
        if missing:
            raise ValidationError(
                f"coverage: {c.cp_code} missing years {missing} (required: {years})"
            )
        for g in getattr(c, "groups", []):
            missing = [y for y in years if y not in g.index_by_year]
            if missing:
                raise ValidationError(
                    f"coverage: {g.cp_code} (group of {c.cp_code}) missing years "
                    f"{missing} (required: {years})"
                )


# ---------------------------------------------------------------------------
# Gate 6 — link status
# ---------------------------------------------------------------------------


def validate_link_status(
    urls: list[str],
    predicate: Callable[[dict], bool],
    timeout: float = 30.0,
) -> None:
    """Every URL must answer 200 AND its body must satisfy `predicate`.

    NB: Eurostat returns 200 with an error payload on rate-limit / invalid params.
    A naive 200-check would pass that; the predicate forces body inspection.
    """
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        for url in urls:
            try:
                r = client.get(url)
            except httpx.HTTPError as e:
                raise ValidationError(f"link: {url} request failed: {e}") from e
            if r.status_code != 200:
                raise ValidationError(f"link: {url} → HTTP {r.status_code}")
            try:
                payload = r.json()
            except Exception as e:
                raise ValidationError(f"link: {url} body is not JSON: {e}") from e
            if not predicate(payload):
                raise ValidationError(
                    f"link: {url} body failed validation predicate "
                    f"(looks like an error payload, not a real Eurostat response)"
                )


# ---------------------------------------------------------------------------
# Gate 7 — the flash marker
# ---------------------------------------------------------------------------


def validate_headline_flash(
    ref_period: str,
    latest_index_time: str,
    flash: bool,
) -> None:
    """`is_flash` must agree with the two months the headline payload carries.

    Eurostat's flash publishes the all-items rate about two weeks before the
    index and the divisions, so on a flash `ref_period` is one month ahead of
    `latest_index.time` and on a full release the two name the same month.
    That equivalence is what makes the marker checkable at all: nothing else in
    the payload records which release it came from, and the flag is written
    from a detection at the top of the run that a future edit could get wrong
    in either direction.

    Both directions cost the reader something, which is why this is an
    equivalence and not a one-sided check. A missing marker renders Eurostat's
    early estimate on the banner in the same voice as a settled figure, and
    that figure moves when the full release lands. A spurious one hangs
    «експресна оценка» on a rate Eurostat has finalised, so a reader who
    checks against the cube finds the two agree and the site hedging anyway —
    which costs more than it saves, because the whole argument for the marker
    is that it appears only when it is true.

    The index ahead of the rate is a third state and it is not a release shape:
    Eurostat publish the rate for a month at or before the index for it, never
    after, so this is a mis-selected series rather than a flash to be marked.
    """
    if not ref_period or not latest_index_time:
        raise ValidationError(
            f"flash marker: the headline needs both months to be checkable — "
            f"ref_period={ref_period!r}, latest_index.time={latest_index_time!r}. "
            f"A payload that names only one cannot say whether its rate is an "
            f"estimate or a settled reading."
        )
    if latest_index_time > ref_period:
        raise ValidationError(
            f"flash marker: the index is at {latest_index_time} but the rate is "
            f"at {ref_period}. Eurostat never publish an index ahead of the "
            f"all-items rate for the same month — one of the two series is the "
            f"wrong extract."
        )
    split = latest_index_time != ref_period
    if flash and not split:
        raise ValidationError(
            f"flash marker: is_flash is set but the index and the rate are both "
            f"at {ref_period}, which is the full release. Publishing would print "
            f"«експресна оценка» over a figure Eurostat has settled."
        )
    if split and not flash:
        raise ValidationError(
            f"flash marker: the rate is at {ref_period} and the index still at "
            f"{latest_index_time}, which is Eurostat's flash, but is_flash is "
            f"not set. Publishing would render an early estimate in the same "
            f"voice as a settled figure."
        )


# ---------------------------------------------------------------------------
# The by-sector wage gate — НСИ, Labour_1.1.2.1
# ---------------------------------------------------------------------------

# A monthly gross wage outside this band is not a sector average, it is a
# mis-parse. The floor sits below the 2019 low (Accommodation and food service
# activities, 365 EUR) with room to spare, and the ceiling far above the 2026
# high (Information and communication, 3176) so a real sector outgrowing the
# band is a decade away. Widening it is not how a tripped gate gets fixed: the
# failure it exists for is a column index landing on an index number, a count of
# employees, or a percentage — all of which fall outside it by orders of
# magnitude, and none of which look wrong on the screen.
SECTOR_WAGE_MIN_EUR: float = 200.0
SECTOR_WAGE_MAX_EUR: float = 20000.0


def validate_sector_salary(sectors: list[dict], ref_period: str) -> None:
    """Gate the by-sector wage payload before it is written.

    The connector's own guards cover the sheet: block bounds, row count, the
    two editions agreeing cell for cell. This gate covers the PAYLOAD, and the
    property it exists for is the one nothing on screen would reveal —
    **`value_eur` is selected from the series, never computed.** §2.1.1 of НСИ's
    licence forbids distributing производни произведения, so a headline this
    pipeline calculated rather than read would be a licence breach that looks
    exactly like a correct number (docs/legal.md §НСИ).
    """
    if not sectors:
        raise ValidationError("sector wages: no activities parsed")

    seen_en: set[str] = set()
    seen_bg: set[str] = set()
    for s in sectors:
        en, bg = s.get("en_name", ""), s.get("bg_name", "")
        if not en or not bg:
            raise ValidationError(
                f"sector wages: an activity is missing a name in one language "
                f"({en!r} / {bg!r}). Both editions are published by НСИ and the "
                f"picker renders a blank line for a missing string, not a fallback."
            )
        if en in seen_en or bg in seen_bg:
            raise ValidationError(
                f"sector wages: duplicate activity name ({en!r} / {bg!r}). Two "
                f"rows resolved to one activity, so one section's wage is missing."
            )
        seen_en.add(en)
        seen_bg.add(bg)

        series = s.get("series_by_period", {})
        if ref_period not in series:
            raise ValidationError(
                f"sector wages: {en!r} has no value at the payload's own ref_period {ref_period}."
            )
        # Selected, not computed. Identity rather than a tolerance, because
        # there is no arithmetic here that could legitimately round.
        if s.get("value_eur") != series[ref_period]:
            raise ValidationError(
                f"sector wages: {en!r} publishes {s.get('value_eur')} at "
                f"{ref_period} but its series carries {series[ref_period]}. The "
                f"headline must BE the published cell, not a figure derived from it."
            )
        for period, value in series.items():
            if not SECTOR_WAGE_MIN_EUR <= value <= SECTOR_WAGE_MAX_EUR:
                raise ValidationError(
                    f"sector wages: {en!r} at {period} is {value} EUR, outside "
                    f"{SECTOR_WAGE_MIN_EUR}-{SECTOR_WAGE_MAX_EUR}. That is not a "
                    f"monthly wage — the parse landed on the wrong column."
                )


# ---------------------------------------------------------------------------
# The regional wage gate — НСИ, Labour_1.1.2.2
# ---------------------------------------------------------------------------

# A monthly gross wage outside this band is not an област average, it is a
# mis-parse. The same band as the by-sector gate, and for the same reason: the
# failure it exists for is a column index landing on an index number, a count of
# employees or a percentage, all of which miss by orders of magnitude. The
# observed range is narrower than the sector one — 968 (Blagoevgrad) to 1915
# (Sofia-city) at 2026-Q1, against 365 to 3176 across sectors — because
# averaging a whole область over every activity in it is what a regional figure
# does. Do not tighten it onto the observed range: the series runs back to 2020,
# when Vidin was at 405.
REGION_WAGE_MIN_EUR: float = 200.0
REGION_WAGE_MAX_EUR: float = 20000.0


def validate_region_salary(regions: list[dict], ref_period: str, expected_codes: list[str]) -> None:
    """Gate the regional wage payload before it is written.

    The connector's own guards cover the sheet: the full set of области present
    and no unknown ones, the two editions agreeing cell for cell, Sofia-city as
    the maximum. This gate covers the PAYLOAD, and the property it exists for is
    the one nothing on screen would reveal — **`value_eur` is selected from the
    series, never computed.** §2.1.1 of НСИ's licence forbids distributing
    производни произведения, so a headline this pipeline calculated rather than
    read would be a licence breach that looks exactly like a correct number
    (docs/legal.md §НСИ).

    `expected_codes` is passed in rather than imported so the gate states what
    it is checking against and a caller cannot get a pass by publishing a table
    that agrees with itself.
    """
    if not regions:
        raise ValidationError("region wages: no области parsed")

    codes = [r.get("code", "") for r in regions]
    if codes != list(expected_codes):
        raise ValidationError(
            f"region wages: the payload carries {len(codes)} области in an order "
            f"or a set that is not `regions.py#REGIONS`. Every consumer of this "
            f"file joins it to `city_price.json` by code, so a code that is "
            f"missing, renamed or duplicated silently unpairs a wage from a price."
        )

    for r in regions:
        code, en, bg = r.get("code", ""), r.get("en_name", ""), r.get("bg_name", "")
        if not en or not bg:
            raise ValidationError(
                f"region wages: {code!r} is missing a name in one language "
                f"({en!r} / {bg!r}). Both editions are published by НСИ and the "
                f"picker renders a blank line for a missing string, not a fallback."
            )
        series = r.get("series_by_period", {})
        if ref_period not in series:
            raise ValidationError(
                f"region wages: {code!r} has no value at the payload's own ref_period {ref_period}."
            )
        # Selected, not computed. Identity rather than a tolerance, because
        # there is no arithmetic here that could legitimately round.
        if r.get("value_eur") != series[ref_period]:
            raise ValidationError(
                f"region wages: {code!r} publishes {r.get('value_eur')} at "
                f"{ref_period} but its series carries {series[ref_period]}. The "
                f"headline must BE the published cell, not a figure derived from it."
            )
        for period, value in series.items():
            if not REGION_WAGE_MIN_EUR <= value <= REGION_WAGE_MAX_EUR:
                raise ValidationError(
                    f"region wages: {code!r} at {period} is {value} EUR, outside "
                    f"{REGION_WAGE_MIN_EUR}-{REGION_WAGE_MAX_EUR}. That is not a "
                    f"monthly wage — the parse landed on the wrong column."
                )


# ---------------------------------------------------------------------------
# The per-city price gate — имот.bg, sredni-ceni
# ---------------------------------------------------------------------------


def validate_city_price(cities: list[dict], covered_codes: list[str]) -> None:
    """Gate the per-city €/m² payload before it is written.

    The connector's own guards cover each page: the sales-URL check, the
    fractional-value refusal, that city's district floor and the drop ceiling.
    This gate covers the PAYLOAD, and every property it holds is one that would
    otherwise ship a figure looking exactly like a correct one.

    `covered_codes` is passed in rather than imported so the gate states what it
    is checking against and a run cannot pass by agreeing with itself. It is the
    same list the payload publishes as `city_pages`, which is what lets the SPA
    tell «имот.bg publish no city here» from «this refresh did not reach that
    city» — two claims that look identical in the data and only one of which may
    be made in имот.bg's name.
    """
    if not cities:
        raise ValidationError("city prices: no city was read")

    known = set(covered_codes)
    seen: set[str] = set()
    for c in cities:
        code = c.get("code", "")
        if code not in known:
            raise ValidationError(
                f"city prices: {code!r} is not one of the {len(known)} cities "
                f"`regions.py` covers. Every consumer joins this file to "
                f"`region_salary.json` by code, so a code with no wage beside it "
                f"renders a price under a place the reader cannot be told the "
                f"wage for."
            )
        if code in seen:
            raise ValidationError(f"city prices: {code!r} appears twice")
        seen.add(code)

        if not c.get("bg_name") or not c.get("en_name"):
            raise ValidationError(
                f"city prices: {code!r} is missing a name in one language. The "
                f"picker renders a blank line for a missing string, not a fallback."
            )

        median = c.get("eur_per_m2_median")
        if not isinstance(median, (int, float)) or not 100 <= median <= 10_000:
            raise ValidationError(
                f"city prices: {code!r} publishes a median of {median} €/m², "
                f"outside the per-district sanity bounds every row that built it "
                f"had to clear. A median outside them cannot have come from rows "
                f"inside them."
            )
        if not (c.get("eur_per_m2_min", 0) <= median <= c.get("eur_per_m2_max", 0)):
            raise ValidationError(
                f"city prices: {code!r} publishes a median of {median} outside "
                f"its own min-max range ({c.get('eur_per_m2_min')}-"
                f"{c.get('eur_per_m2_max')}). The summary is not describing the "
                f"rows it was computed from."
            )

        history = c.get("historical") or []
        years = [row.get("year") for row in history]
        if years != sorted(years):
            raise ValidationError(f"city prices: {code!r} publishes its years out of order")
        if len(set(years)) != len(years):
            raise ValidationError(f"city prices: {code!r} publishes a year twice")
        # **The run has to be unbroken, and this is where that is checked rather
        # than assumed.** The whole reason a baseline is chosen per city is that
        # имот.bg's coverage of it grew over two decades; a gap in the published
        # years means two coverage eras are being compared as one series, and
        # the percentage over them would read as a price move.
        if years and years != list(range(years[0], years[-1] + 1)):
            raise ValidationError(
                f"city prices: {code!r} has a gap in its published years "
                f"({years[0]}..{years[-1]}). The since-baseline percentage spans "
                f"the whole range, so a gap makes it a comparison across two "
                f"different samples."
            )
        if history:
            if c.get("baseline_year") != years[0]:
                raise ValidationError(
                    f"city prices: {code!r} names {c.get('baseline_year')} as its "
                    f"baseline but its oldest published year is {years[0]}."
                )
            if history[0].get("since_baseline_median_pct") != 0.0:
                raise ValidationError(
                    f"city prices: {code!r} publishes a non-zero change at its own "
                    f"baseline year, so the series is measured from somewhere else."
                )
            if c.get("since_baseline_median_pct") != history[-1].get("since_baseline_median_pct"):
                raise ValidationError(
                    f"city prices: {code!r} headlines a since-baseline change that "
                    f"is not its newest published year's. The headline and the "
                    f"chart would disagree, and only one of them can be right."
                )


# ---------------------------------------------------------------------------
# The property market gates — Eurostat, prc_hpi_*
# ---------------------------------------------------------------------------

# What an average Bulgarian dwelling transaction can plausibly be, in euro.
#
# **Measured on the real series before it was written, which is the only way a
# band means anything.** The published nine-year run is €30,250 (2017-Q3) to
# €82,786 (2026-Q1), so the floor sits a third below the low and the ceiling
# six times above the high. That is deliberately loose: this gate is not
# watching the market, it is watching for a unit error. Dividing euro by nothing,
# reading the count cube as the value cube, or picking up a value in the
# hundreds of millions without its denominator all land orders of magnitude
# outside it, and every one of those looks like an ordinary number on screen.
#
# Tightening it around the current level would make it fail on a genuine market
# move, which is the failure that teaches people to widen tolerances.
AVG_DEAL_MIN_EUR: float = 10_000.0
AVG_DEAL_MAX_EUR: float = 500_000.0


def validate_house_market(payload: dict) -> None:
    """Gate `house_market.json` before it is written.

    Three properties, and the first is the one that would be invisible on the
    page: **the derived average has to be the published value divided by the
    published count, at the same quarter**. The payload carries all three
    numbers, so a reader can check it — and so can this. An average assembled
    from a different quarter's denominator is arithmetically fine, internally
    consistent, and wrong in a way no band would catch.
    """
    deals = payload.get("deals", {}).get("series_by_period", {})
    values = payload.get("value", {}).get("series_by_period", {})
    avg = payload.get("avg_deal_eur", {}).get("series_by_period", {})
    if not deals or not values or not avg:
        raise ValidationError(
            "house market: the payload is missing one of deals, value or "
            "avg_deal_eur. Each of the three is what makes the other two "
            "checkable by a reader."
        )

    for period, row in sorted(avg.items()):
        for field, derived in row.items():
            n = deals.get(period, {}).get(field)
            v = values.get(period, {}).get(field)
            if not n or v is None:
                raise ValidationError(
                    f"house market: avg_deal_eur has {field} at {period} but the "
                    f"published count or value for that quarter does not. The "
                    f"average would be the only figure of the three a reader "
                    f"could not check."
                )
            # Identity, not a tolerance: the payload rounds the quotient to two
            # decimals and nothing else happens to it, so anything further out
            # is a different denominator rather than a rounding difference.
            if abs(derived - v / n) > 0.01:
                raise ValidationError(
                    f"house market: avg_deal_eur[{period}][{field}] is {derived}, "
                    f"but the published value {v} over the published count {n} is "
                    f"{v / n:.2f}. The disclosed derivation does not reproduce."
                )
            if not AVG_DEAL_MIN_EUR <= derived <= AVG_DEAL_MAX_EUR:
                raise ValidationError(
                    f"house market: avg_deal_eur[{period}][{field}] is {derived:,.0f} "
                    f"EUR, outside the {AVG_DEAL_MIN_EUR:,.0f}–{AVG_DEAL_MAX_EUR:,.0f} "
                    f"band. That band is three times wider than the observed "
                    f"series at each end, so a figure outside it is a unit error "
                    f"rather than a market move — find which cube was read wrong."
                )

    # New builds cost more than existing dwellings per transaction, every
    # quarter of the published series, and by a wide margin. This is not a
    # market opinion: it is the arithmetic check that the two purchase codes
    # have not been swapped, which is otherwise a silent relabelling — both
    # series stay plausible and every figure on the page moves.
    for period, row in sorted(avg.items()):
        new, existing = row.get("new"), row.get("existing")
        if new is not None and existing is not None and new <= existing:
            raise ValidationError(
                f"house market: at {period} the average NEW dwelling deal "
                f"({new:,.0f}) is not above the average EXISTING one "
                f"({existing:,.0f}). DW_NEW and DW_EXST differ by one letter and "
                f"swapping them keeps both series plausible — check the codes "
                f"before assuming the market did this."
            )

    rates = payload.get("price_index", {}).get("annual_rate_pct", {})
    if not rates:
        raise ValidationError(
            "house market: no annual rate of change. It is Eurostat's own "
            "published figure and the one the НСИ cross-check reconciles against."
        )

    _validate_index_base(payload)
    _validate_status_flags(payload)


# Eurostat's own flag letters, and the combinations they publish them in. A
# letter outside this set is a vocabulary we have not read, and rendering it as
# a footnote nobody can look up is worse than failing here.
STATUS_FLAGS: frozenset[str] = frozenset({"e", "b", "p", "d", "u", "n", "c", "f", "s", "z"})


def _validate_index_base(payload: dict) -> None:
    """Both indices average 100 across the base year they name.

    **The identity that catches a wrong unit**, which is otherwise invisible:
    `I15_Q` and `I25_Q` are the same series on two bases, both return 200, and
    both draw a plausible line — one of them just puts today at 109 instead of
    273. The base year is definitional, so its four quarters average to 100 by
    construction and anything else means the cube we read is not the cube we
    named.

    It also holds the deflated series to the SAME base as the nominal one, which
    is what lets the page draw them on one axis without rescaling anything.
    """
    for key in ("price_index", "price_index_real"):
        block = payload.get(key, {})
        series = block.get("series_by_period", {})
        base = block.get("base_year")
        if not series or not base:
            raise ValidationError(f"house market: {key} carries no series or no base year")
        quarters = [
            v.get("total") if isinstance(v, dict) else v
            for p, v in series.items()
            if p.startswith(f"{base}-Q")
        ]
        quarters = [q for q in quarters if q is not None]
        if len(quarters) != 4:
            raise ValidationError(
                f"house market: {key} carries {len(quarters)} quarters of its own base "
                f"year {base}, not four. The base year is what 100 means here."
            )
        mean = sum(quarters) / 4
        if abs(mean - 100) > 0.05:
            raise ValidationError(
                f"house market: {key} averages {mean:.2f} across {base}, not 100. "
                f"It is on a different base than the one it names — I15_Q and I25_Q "
                f"both answer 200 and both draw a plausible line."
            )

    # The two indices are the same statistic deflated and not, so they cover the
    # same quarters. A gap means one of them was filtered differently.
    nominal = set(payload["price_index"]["series_by_period"])
    real = set(payload["price_index_real"]["series_by_period"])
    if not real <= nominal:
        raise ValidationError(
            f"house market: the deflated index carries {len(real - nominal)} quarters the "
            f"nominal one does not ({sorted(real - nominal)[:3]}). They are one series "
            f"published twice; a quarter in one and not the other is a wrong slice."
        )


def _validate_status_flags(payload: dict) -> None:
    """Every published flag is a letter Eurostat actually use, at a real period.

    The flags exist so the page can decline to draw an unbroken line across a
    break the publisher declared. A flag at a quarter the series does not carry
    would mark nothing; a letter outside Eurostat's own vocabulary would render
    as a footnote a reader cannot look up.
    """
    for key in ("price_index", "price_index_real"):
        block = payload.get(key, {})
        series = block.get("series_by_period", {})
        for period, flags in (block.get("status_by_period") or {}).items():
            if period not in series:
                raise ValidationError(
                    f"house market: {key} flags {period}, which its own series does not carry."
                )
            entries = flags.items() if isinstance(flags, dict) else [("total", flags)]
            for field, letter in entries:
                if not set(str(letter)) <= STATUS_FLAGS:
                    raise ValidationError(
                        f"house market: {key} flags {period}/{field} as {letter!r}, which is "
                        f"not one of Eurostat's own letters ({''.join(sorted(STATUS_FLAGS))}). "
                        f"A marker a reader cannot look up is worse than none."
                    )


def validate_house_market_structure(payload: dict) -> None:
    """Gate `house_market_structure.json` before it is written.

    Every figure here is a published cell, so there is no derivation to
    reproduce. What there is instead is a set of identities each cube asserts
    about itself — the tenure split is one population and the census counts are
    one stock — and a cube sliced on the wrong dimension breaks them while every
    individual number still looks like a percentage.
    """
    tenure = payload.get("tenure", {})
    own, rent = tenure.get("owner_pct"), tenure.get("rent_pct")
    total = tenure.get("total_pct")
    if own is None or rent is None or total is None:
        raise ValidationError("housing structure: the tenure split is incomplete")
    # EU-SILC publishes each share to one decimal, so the two halves of a split
    # population can miss 100 by a rounding step. 0.2 pp allows that and
    # nothing more — a slice taken over the wrong household composition misses
    # by whole points.
    if abs(own + rent - total) > 0.2:
        raise ValidationError(
            f"housing structure: owners ({own}) plus renters ({rent}) is "
            f"{own + rent}, not the published total {total}. These are one "
            f"population split two ways, so a gap means the slice is not the "
            f"whole population — check hhcomp and rskpovth."
        )
    if tenure.get("owner_with_mortgage_pct", 0) > own:
        raise ValidationError(
            "housing structure: more owners carry a mortgage than there are "
            "owners. OWN_L is a subset of OWN."
        )

    census = payload.get("census_dwellings", {})
    total_dw = census.get("total")
    occupied, unoccupied = census.get("occupied"), census.get("unoccupied")
    if not total_dw or occupied is None or unoccupied is None:
        raise ValidationError("housing structure: the census dwelling counts are incomplete")
    # The census also carries an "unknown occupancy" bucket, so occupied plus
    # unoccupied is at most the total rather than exactly it.
    if occupied + unoccupied > total_dw:
        raise ValidationError(
            f"housing structure: occupied ({occupied:,.0f}) plus unoccupied "
            f"({unoccupied:,.0f}) exceeds the total dwelling stock "
            f"({total_dw:,.0f}). They are subsets of it."
        )


# ---------------------------------------------------------------------------
# The НСИ housing gates
# ---------------------------------------------------------------------------


def validate_nsi_housing(payload: dict) -> None:
    """Gate `nsi_housing.json`: every published figure is a cell НСИ published.

    Gate 8's shape, for the same licence reason. §2.1.1 forbids distributing
    производни произведения, so a headline this pipeline calculated rather than
    selected is a breach that looks exactly like a correct number — and the only
    way to tell from the payload alone is that the headline and the series
    entry at its own reference period are the SAME cell.

    An identity rather than a tolerance, because there is no arithmetic between
    them that could legitimately round.
    """
    national = payload.get("national_price_index_yoy", {})
    period = national.get("ref_period")
    series = national.get("series_by_period", {})
    if not period or period not in series:
        raise ValidationError(
            "nsi housing: the national block names a ref_period its own series "
            "does not carry, so the headline is dated by a quarter nobody published."
        )
    if national.get("value_pct") != series[period]:
        raise ValidationError(
            f"nsi housing: the national headline {national.get('value_pct')} is not "
            f"the published cell at {period}, which is {series[period]}. A figure "
            f"we computed rather than selected is a licence breach that reads as "
            f"a correct number."
        )

    for key in ("city_price_index_yoy", "city_deals_yoy"):
        block = payload.get(key, {})
        cities = block.get("cities", [])
        if not cities:
            raise ValidationError(f"nsi housing: {key} carries no cities")
        seen = set()
        for city in cities:
            code = city.get("code")
            if code in seen:
                raise ValidationError(f"nsi housing: {key} lists {code!r} twice")
            seen.add(code)
            if not city.get("name_bg") or not city.get("name_en"):
                raise ValidationError(
                    f"nsi housing: {key} city {code!r} is missing a name in one "
                    f"language. The page renders a blank line for a missing "
                    f"string, not a fallback."
                )
            at = city.get("ref_period")
            city_series = city.get("series_by_period", {})
            if at not in city_series:
                raise ValidationError(
                    f"nsi housing: {key} city {code!r} names {at} and its series does not carry it"
                )
            if city["value_pct"] != city_series[at]:
                raise ValidationError(
                    f"nsi housing: {key} city {code!r} headlines {city['value_pct']} "
                    f"but the published cell at {at} is {city_series[at]}."
                )


def validate_hpi_across_publishers(nsi_housing: dict, house_market: dict) -> None:
    """НСИ's own house price index change must equal Eurostat's, at one decimal.

    **The strongest gate here.** These are the same statistic reaching us by two
    routes — НСИ compile it and Eurostat disseminate it — so they are not merely
    close, they are the same number printed twice. Anything else means we read
    the wrong quarter, the wrong column or the wrong purchase type on one side,
    and each of those produces a figure that looks entirely reasonable on the
    page. One check catches all three.

    Compared at the newest quarter BOTH carry rather than at each payload's own
    latest: Eurostat disseminate a few days behind НСИ publishing, so a refresh
    landing between the two would otherwise fail on a quarter one side simply
    does not have yet — a false alarm that teaches whoever sees it to distrust
    the gate. **No overlap at all is still a failure**: they are the same
    series, and two non-overlapping windows mean one of them is not what we
    think it is.

    If this fails, the bug is ours. Do not soften it into a band.
    """
    nsi = nsi_housing.get("national_price_index_yoy", {}).get("series_by_period", {})
    estat = house_market.get("price_index", {}).get("annual_rate_pct", {})
    if not nsi or not estat:
        raise ValidationError(
            "hpi cross-check: one of the two publishers' rate series is empty, "
            "so the reconciliation could not run at all."
        )
    shared = sorted(set(nsi) & set(estat))
    if not shared:
        raise ValidationError(
            f"hpi cross-check: НСИ publish {min(nsi)}..{max(nsi)} and Eurostat "
            f"{min(estat)}..{max(estat)}, and the two share no quarter. They are "
            f"the same statistic, so non-overlapping windows mean one of them is "
            f"not the series it is taken for."
        )
    period = shared[-1]
    for field in ("total", "new", "existing"):
        theirs = nsi[period].get(field)
        ours = estat[period].get(field)
        if theirs is None or ours is None:
            continue
        # Both publish to one decimal, so equality is the right comparison and
        # the tolerance exists only to absorb float representation.
        if abs(theirs - ours) > 0.051:
            raise ValidationError(
                f"hpi cross-check: at {period} НСИ publish {theirs}% for {field} "
                f"and Eurostat {ours}%. These are the same statistic by two "
                f"routes. A gap means a wrong quarter, a wrong column or a wrong "
                f"purchase type on our side — find which. Do not widen this."
            )


# ---------------------------------------------------------------------------
# The payroll payload — both sides of the wedge, and the ТЗПБ block
# ---------------------------------------------------------------------------


def validate_payroll(payload: dict) -> None:
    """Gate `payroll.json` before it is written.

    The employee half has never needed one: it is five constants that a pytest
    parity check already holds against `mirror.js`. The employer half does,
    because it is the first payroll figure assembled from a FETCH, and every
    way that fetch can go quietly wrong ends as a labour cost that looks
    finished.

    Four properties, each a wrong number on screen rather than an exception:

      1. **The ТЗПБ block exists.** Without it the site has no accident rate at
         all, and the employer's cost renders 0,4–1,1 points light — inside
         every plausible band, for every reader at once.
      2. **Its span is КСО чл. 6, ал. 1, т. 7's.** A range that has escaped
         «от 0,4 до 1,1 на сто» is a parse that left the rate column.
      3. **Every НСИ section has a range.** A section the join lost renders no
         employer figure for whoever picked it, and nothing else notices.
      4. **The employer total excludes ТЗПБ.** The two are published apart
         because ТЗПБ is not one rate; a total that has absorbed the floor is
         the one shape that makes the range on screen and the total under it
         disagree, and it is what a well-meaning edit produces.
    """
    wa = payload.get("work_accident")
    if not wa:
        raise ValidationError(
            "payroll: no `work_accident` block. ТЗПБ is employer-only and per "
            "economic activity, so its absence does not read as zero — it reads "
            "as a labour cost that is complete and up to 1,1% of gross short. "
            "The ДВ fetch is not best-effort; fix it rather than publishing."
        )

    lo, hi = wa.get("min"), wa.get("max")
    if not isinstance(lo, float) or not isinstance(hi, float) or not 0.004 <= lo <= hi <= 0.011:
        raise ValidationError(
            f"payroll: ТЗПБ spans {lo}–{hi}, outside КСО чл. 6, ал. 1, т. 7's "
            f"«от 0,4 до 1,1 на сто». ЗБДОО may place any activity anywhere "
            f"inside that span and nowhere outside it, so this is the act "
            f"disagreeing with the code it is set under, not a wide year."
        )

    sections = wa.get("by_nsi_section") or {}
    for name, band in sections.items():
        s_lo, s_hi = band.get("min"), band.get("max")
        if not (isinstance(s_lo, float) and isinstance(s_hi, float) and lo <= s_lo <= s_hi <= hi):
            raise ValidationError(
                f"payroll: section {name!r} spans {s_lo}–{s_hi}, which is not "
                f"inside the act's own {lo}–{hi}. A section's range is a "
                f"selection from the appendix and cannot exceed it."
            )
    if not sections:
        raise ValidationError(
            "payroll: `by_nsi_section` is empty, so no reader's sector resolves "
            "to a ТЗПБ range and the card falls back to the whole span for "
            "everyone — silently more vague than the law is."
        )

    employer = payload.get("employer_contrib_rates") or {}
    stated = employer.get("total")
    summed = round(sum(v for k, v in employer.items() if k != "total"), 6)
    if stated != summed:
        raise ValidationError(
            f"payroll: employer lines sum to {summed} under a stated total of "
            f"{stated}. The breakdown and the total must be the same number."
        )
    if stated is None or stated >= 0.1852 + lo:
        raise ValidationError(
            f"payroll: the employer total is {stated}, at or above the "
            f"{0.1852 + lo} it would be with ТЗПБ's floor folded in. The five "
            f"capped funds are the total; ТЗПБ is published as a range beside "
            f"them because it is not one rate."
        )
