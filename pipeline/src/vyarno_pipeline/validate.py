"""Validation gates. Publish blocks if any of these raise.

Six gates guard the HICP publish:

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

One more guards the НСИ by-sector wage publish, and it is listed apart because
it gates a different payload rather than a seventh property of the same one:

7. **Sector wages** — every activity carries both language names and a value at
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
