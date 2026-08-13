"""Eurostat JSON API client.

Endpoints:
    https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}

HICP datasets, all on ECOICOP ver.2:

- `prc_hicp_minr`: monthly cube carrying BOTH the **index** (unit=I15/I25) AND
  the **annual rate of change** (unit=RCH_A) per COICOP code. Source for
  `fetch_hicp_rates_bg` (RCH_A) and `fetch_hicp_index_bg` (I15).
- `prc_hicp_iw`: annual **item weights** per COICOP code. Source for
  `fetch_hicp_weights_bg`.

Both are keyed by `coicop18`, so weight, rate and index for a given code
describe the SAME bucket. That is the load-bearing property, and
`validate.validate_classification_agreement` proves it per code before publish.

**Never read weights from `prc_hicp_inw`.** It is the archived ECOICOP ver.1
cube: 12 divisions, no CP13, CP12 means "Miscellaneous goods and services", it
is keyed by `coicop`, and it rejects `coicop18` with HTTP 400. Joining it to the
ver.2 rate cube by raw CP code puts one bucket's weight beside another bucket's
rate. **A shared code string is not evidence of a shared meaning.**

The official ver.2 index base is 2025=100 (unit=I25); we request I15 (2015=100,
provided as a recalculated back-series) because the whole published back-series
sits on one base there, and every figure the site builds from the index is a
ratio of two of its own members, which does not move when the base does.
Whichever unit we ask for, the values we publish are the ones the cube returns
— see `INDEX_UNIT` below.

Response shape (ND-cube): `id` lists dimensions, `size` their cardinalities,
`dimension.<name>.category.index` maps category label → linear index,
`dimension.<name>.category.label` maps it to the official English name, and
`value` maps linear index → number. We flatten to rows and keep the label map,
because the label is how we PROVE two cubes agree on what a code means.

WHY WE FETCH THE WHOLE BG SLICE IN ONE CALL
-------------------------------------------
Multi-value `coicop18` filters (`A+B+C`) return 200 OK with no value rows — the
query fails *successfully*. An UNFILTERED query (geo + unit only) returns the
complete BG slice in a single response (~570 KB for 78 months of index data,
~6 s), verified value-for-value against a per-code fan-out. Since we publish 13
divisions and ~50 groups, fan-out would mean ~130 requests per refresh.

What makes the single call safe is `_require_codes`: every code we intend to
publish must be present in the response, or the fetch raises. A truncated or
reshaped response fails loudly instead of publishing a partial basket.
"""

from __future__ import annotations

import re
from typing import Any, NamedTuple

import httpx

BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"

# ---------------------------------------------------------------------------
# HICP classification constants (ECOICOP ver.2)
# ---------------------------------------------------------------------------

# The COICOP dimension name on every ver.2 HICP cube. A cube that answers to
# `coicop` is the archived ver.1 classification and must not be joined with
# these. Asserted per fetch.
COICOP_DIM: str = "coicop18"

# Human-readable name of the classification, published in the JSON envelope so
# a reader of data/published/hicp_categories.json can see which version the
# numbers are on without reading this file.
CLASSIFICATION: str = "ECOICOP ver.2"

# The 13 ver.2 divisions. CP00 is our internal alias for the upstream TOTAL
# (all-items headline). Don't reorder or rename — the published JSON's
# `cp_code` field is part of the site contract.
CP_DIVISIONS: list[str] = [f"CP{n:02d}" for n in range(1, 14)]

# Dataset codes. Both ver.2; both keyed by `coicop18`.
MINR_DATASET: str = "prc_hicp_minr"  # index (I15) + annual rate (RCH_A)
IW_DATASET: str = "prc_hicp_iw"  # item weights

# The index unit we request, and the base year that unit is published on.
# They are one fact and travel together: we publish Eurostat's index values
# untouched, so the base named in the payload has to be the base of the cube
# the verify link resolves to. `prc_hicp_minr` offers exactly two index units,
# I15 and I25 — there is no 2020 base to ask for, which is why the site works
# in ratios instead. Switching to I25 means changing both lines, and every
# published index level moves; no ratio the site renders does.
INDEX_UNIT: str = "I15"
INDEX_BASE_YEAR: int = 2015

# A ver.2 GROUP code is a division plus one digit (CP011 "Food", CP072
# "Operation of personal transport equipment", ...). This is the second level
# of the hierarchy and the depth the SPA's detailed mode exposes. Which groups
# exist is discovered from the weights cube at refresh time, never hardcoded —
# Eurostat's group set differs per country and moves between vintages.
GROUP_CODE_RE = re.compile(r"^CP\d{3}$")


class HicpCube(NamedTuple):
    """One fetched HICP slice, with the metadata needed to prove its identity.

    `rows`    — flat rows shaped {freq, unit, coicop, geo, time, value}. The
                upstream `coicop18` dim is normalized to `coicop` and the
                upstream headline code `TOTAL` to our `CP00`, so downstream
                code never has to know the upstream taxonomy.
    `labels`  — {our code → the cube's own official English label}. This is
                what the classification-agreement gate compares across cubes:
                two cubes that give one code different labels are on different
                classifications, and the publish must abort.
    `dataset` — the Eurostat dataset code the rows came from.
    `dim`     — the COICOP dimension name the cube actually used. Must be
                `coicop18` for ver.2.
    """

    rows: list[dict[str, Any]]
    labels: dict[str, str]
    dataset: str
    dim: str


def _cube_to_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten Eurostat's ND-cube response to rows of {dim_label: value}.

    The Eurostat JSON Stats v2 layout encodes values as a flat dict keyed by linear
    index. We decode each linear index back to (i0, i1, ..., iN-1) using the
    `size` array as row-major strides (last dim varies fastest).
    """
    dims: list[str] = payload["id"]
    sizes: list[int] = payload["size"]
    cat_indexes = [payload["dimension"][d]["category"]["index"] for d in dims]
    # invert: linear index → category label
    cat_labels = [{v: k for k, v in ci.items()} for ci in cat_indexes]
    values: dict[str, float] = payload["value"]
    # Eurostat's own flags on their own numbers, keyed by the same linear index
    # as the values: `e` estimated, `b` break in series, `p` provisional, `d`
    # definition differs, and combinations of them. **They are a statement the
    # publisher makes and we do not**, so a series drawn as one unbroken line
    # across a flagged break is a claim they did not make on our behalf.
    # Carried only where present, so a cube with no flags emits the rows it
    # always did.
    status: dict[str, str] = payload.get("status") or {}

    out: list[dict[str, Any]] = []
    for linear_str, val in values.items():
        linear = int(linear_str)
        idxs: list[int] = []
        rem = linear
        for s in reversed(sizes):
            idxs.insert(0, rem % s)
            rem //= s
        row: dict[str, Any] = {dims[i]: cat_labels[i][idxs[i]] for i in range(len(dims))}
        row["value"] = val
        flag = status.get(linear_str)
        if flag:
            row["status"] = flag
        out.append(row)
    return out


def _cube_labels(payload: dict[str, Any], dim: str) -> dict[str, str]:
    """Extract {category code → official English label} for one dimension.

    The label is the cube's own answer to "what does this code mean". Two
    cubes that disagree here are on different classification versions, no
    matter how identical their code strings look.
    """
    cat = payload["dimension"][dim]["category"]
    return {code: cat.get("label", {}).get(code, "") for code in cat["index"]}


def _get(url: str, params: dict[str, Any], timeout: float = 30.0) -> dict[str, Any]:
    """Single GET with sane defaults. Raises on non-2xx."""
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(url, params=params)
        r.raise_for_status()
        return r.json()


def _assert_ver2_dim(payload: dict[str, Any], dataset: str) -> None:
    """The cube must carry `coicop18`. A cube keyed by `coicop` is ECOICOP
    ver.1 (archived, 12 divisions) and must never reach the transform."""
    if COICOP_DIM not in payload["id"]:
        raise ValueError(
            f"{dataset}: expected the {COICOP_DIM!r} dimension (ECOICOP ver.2), "
            f"got dimensions {payload['id']}. A cube keyed by 'coicop' is the "
            f"archived ver.1 classification — do not join it with ver.2 data."
        )


def _normalize_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten + rename `coicop18`→`coicop` and upstream `TOTAL`→our `CP00`."""
    rows = _cube_to_rows(payload)
    for row in rows:
        code = row.pop(COICOP_DIM)
        row["coicop"] = "CP00" if code == "TOTAL" else code
    return rows


def _require_codes(cube: HicpCube, codes: list[str]) -> None:
    """Every code we intend to publish must be present, or fail loudly.

    This is what makes the single unfiltered fetch safe: without it a
    truncated, reshaped or country-empty response looks exactly like a
    successful refresh, and quietly publishes a partial basket.
    """
    have = {r["coicop"] for r in cube.rows}
    missing = [c for c in codes if c not in have]
    if missing:
        raise ValueError(
            f"{cube.dataset}: response is missing {len(missing)} required "
            f"COICOP codes {missing[:8]}{'…' if len(missing) > 8 else ''} "
            f"(got {len(have)} codes). Upstream reshaped the cube."
        )


def _to_cube(payload: dict[str, Any], dataset: str) -> HicpCube:
    """A fetched ND-cube as a `HicpCube`, ver.2 identity checked first.

    The three steps have to travel together: assert the cube is keyed by
    `coicop18`, keep its own labels, and rename the upstream headline code
    `TOTAL` to our `CP00`. A cube assembled without the assertion is a ver.1
    slice wearing ver.2 field names, and nothing downstream can tell.
    """
    _assert_ver2_dim(payload, dataset)
    labels = _cube_labels(payload, COICOP_DIM)
    labels["CP00"] = labels.pop("TOTAL", "Total")
    return HicpCube(_normalize_rows(payload), labels, dataset, COICOP_DIM)


def _fetch_minr(geo: str, unit: str, extra: dict[str, Any]) -> HicpCube:
    """One unfiltered `prc_hicp_minr` call for a whole (geo × unit) slice."""
    payload = _get(
        f"{BASE}/{MINR_DATASET}",
        {"format": "JSON", "lang": "EN", "geo": geo, "unit": unit, **extra},
        timeout=120.0,
    )
    return _to_cube(payload, MINR_DATASET)


def fetch_hicp_rates_bg(
    geo: str = "BG",
    last_periods: int = 12,
    codes: list[str] | None = None,
) -> HicpCube:
    """Monthly **annual rate of change** (RCH_A) for the most recent months.

    Source: `prc_hicp_minr` (ECOICOP ver.2), unit=RCH_A — the SAME cube
    `fetch_hicp_index_bg` reads the index from, so rate and index are always the
    same live vintage.

    One unfiltered HTTP call returns the complete BG slice: CP00 (headline),
    every division and every group. `codes` is the set that MUST be present
    (defaults to CP00 + the 13 divisions); anything missing raises.
    """
    cube = _fetch_minr(geo, "RCH_A", {"lastTimePeriod": last_periods})
    _require_codes(cube, codes if codes is not None else ["CP00", *CP_DIVISIONS])
    return cube


def fetch_hicp_index_bg(
    geo: str = "BG",
    since_year: int = 2020,
    codes: list[str] | None = None,
) -> HicpCube:
    """Monthly index on `INDEX_UNIT`'s base since `since_year`, one call.

    The values travel through to `data/published/` unchanged — the pipeline
    selects which of them to publish (December, and 2020 onwards) and scales
    none of them. `INDEX_BASE_YEAR` is what the payload names as their base,
    so the two constants are the only place the choice of unit is recorded.
    """
    cube = _fetch_minr(geo, INDEX_UNIT, {"sinceTimePeriod": f"{since_year}-01"})
    _require_codes(cube, codes if codes is not None else ["CP00", *CP_DIVISIONS])
    return cube


def fetch_hicp_weights_bg(geo: str = "BG", last_periods: int = 1) -> HicpCube:
    """Annual HICP **item weights** (per-thousand) for the most recent year.

    Source: `prc_hicp_iw` — the ECOICOP **ver.2** weights cube, keyed by
    `coicop18`, the same dimension `prc_hicp_minr` uses. This is the whole
    point: weight and rate for a code now describe the same bucket.

    Do NOT read weights from `prc_hicp_inw` — the archived ver.1 cube. See the
    module docstring.

    Values are per-thousand (all divisions sum to 1000; CP00/TOTAL is 1000);
    the transform converts to percent. Rows carry `time` = the weight year,
    which the reconciliation gate checks against the rate month's year.
    """
    payload = _get(
        f"{BASE}/{IW_DATASET}",
        {"format": "JSON", "lang": "EN", "geo": geo, "lastTimePeriod": last_periods},
        timeout=60.0,
    )
    cube = _to_cube(payload, IW_DATASET)
    _require_codes(cube, ["CP00", *CP_DIVISIONS])
    return cube


def group_codes_in_basket(weights: HicpCube) -> list[str]:
    """The ver.2 GROUP codes Bulgaria actually spends money on, sorted.

    Discovered from the weights cube rather than hardcoded: the group set is
    country- and vintage-specific. Groups with a zero weight are excluded —
    Eurostat carries them for structural completeness (BG has four: CP013,
    CP082, CP101, CP103) but publishes no rate for them, so a card for one
    would be an empty row the user cannot act on.
    """
    latest = _latest_time(weights.rows)
    return sorted(
        r["coicop"]
        for r in weights.rows
        if r["time"] == latest and GROUP_CODE_RE.match(r["coicop"]) and r["value"] > 0
    )


def _latest_time(rows: list[dict[str, Any]]) -> str:
    """The most recent `time` string across rows ("YYYY" or "YYYY-MM")."""
    if not rows:
        raise ValueError("no rows to take a latest period from")
    return max(str(r["time"]) for r in rows)


# -------------------------------------------------------------------
# P1 datasets
# -------------------------------------------------------------------

# NO CONNECTOR FOR `ilc_di01`, and none should be added without a consumer.
# Household equivalised disposable income is the wrong unit for any question this
# site asks about one person's salary — it pushes almost every Sofia wage into the
# top few percent. `earn_ses_monthly` below is the right unit. A connector whose
# payload nothing renders is not free either: an unread payload still dates the
# deployed site and still gets cited as a source.

# Structure of Earnings Survey (SES) — the only official BG source for an
# individual-employee gross-earnings distribution. 4-yearly (2018, 2022, ...),
# so it is stale in level but is the freshest distribution SHAPE that exists;
# the LEVEL is re-levelled to the live НСИ Sofia wage in transform.py. Slice:
# whole economy (B-S_X_O), all occupations, full-time, both sexes, all ages —
# the only sensible default for a "where does my salary stand" ladder.
SES_MONTHLY_DATASET = "earn_ses_monthly"
SES_MONTHLY_SLICE: dict[str, str] = {
    "nace_r2": "B-S_X_O",  # Industry, construction & services (excl. public admin)
    "isco08": "TOTAL",  # all occupations
    "worktime": "FT",  # full-time (comparable monthly figures; PT dilutes)
    "age": "TOTAL",
    "sex": "T",
}
# indic_se code → our field name. EUR (not PPS) to match the rest of the SPA.
SES_INDICATORS: dict[str, str] = {
    "D1_E_EUR": "d1",  # first decile (bottom-10% threshold)
    "MED_E_EUR": "median",  # median (D5)
    "MEAN_E_EUR": "mean",  # arithmetic mean (the re-leveling anchor point)
    "D9_E_EUR": "d9",  # ninth decile (top-10% threshold)
}


def fetch_ses_earnings_bg(geo: str = "BG") -> dict[str, Any]:
    """Latest SES gross MONTHLY employee earnings for BG (distribution shape).

    Hits `earn_ses_monthly` narrowed to the whole-economy, full-time,
    both-sexes, all-ages slice and pulls the four published distribution
    points: D1, median, mean, D9 (all in EUR).

    Returns a shaped dict:
        {"ref_year": "2022", "d1": 376.0, "median": 705.0,
         "mean": 949.0, "d9": 1700.0, "dataset": ..., "source_url": ...}

    This is the *individual employee gross earnings* distribution — the correct
    unit for a "where does my salary stand" comparison, unlike `ilc_di01`'s
    household disposable income. SES is 4-yearly, so the LEVEL is stale:
    `transform.build_ses_shape_ladder` fills the gaps between these three
    points and publishes the result at SES's own level; the re-level onto the
    live НСИ Sofia average happens in the reader's browser, so each published
    file stays with one publisher. Raises if any of the four indicators is
    missing for the latest year — loud beats silently wrong.
    """
    url = f"{BASE}/{SES_MONTHLY_DATASET}"
    params = {
        "format": "JSON",
        "lang": "EN",
        "geo": geo,
        "lastTimePeriod": 1,
        **SES_MONTHLY_SLICE,
    }
    rows = _cube_to_rows(_get(url, params))
    if not rows:
        raise ValueError(f"SES {SES_MONTHLY_DATASET} returned no rows for {geo}")
    latest = max(r["time"] for r in rows)
    vals: dict[str, float] = {}
    for r in rows:
        if r.get("time") != latest:
            continue
        ind = r.get("indic_se")
        if ind in SES_INDICATORS and r.get("value") is not None:
            vals[SES_INDICATORS[ind]] = float(r["value"])
    missing = [name for name in ("d1", "median", "mean", "d9") if name not in vals]
    if missing:
        raise ValueError(f"SES {SES_MONTHLY_DATASET} BG missing {missing} for {latest}")
    return {
        "ref_year": str(latest),
        "dataset": SES_MONTHLY_DATASET,
        "source_url": (
            f"https://ec.europa.eu/eurostat/databrowser/view/{SES_MONTHLY_DATASET}"
            "/default/table?lang=en"
        ),
        **vals,
    }


# -------------------------------------------------------------------
# The property market
# -------------------------------------------------------------------

# Three quarterly cubes, all fed by НСИ, all describing the same thing from
# different angles: how many dwellings households bought, what they paid in
# total, and how the price per dwelling moved.
#
# **What is in them is narrower than "House sales" suggests, and the page's
# wording depends on getting this right.** Both the Eurostat ESMS
# (`prc_hpi_inx_esms`) and НСИ's ППЖ metadata (nsi.bg/bg/content/19699) scope
# these to dwellings bought by households AT MARKET PRICES: flats and houses,
# VAT included on new builds, notary and agency fees excluded, the land
# component of the dwelling included. A market price is the test rather than a
# price that changed hands, which is what rules out a sale to a sitting tenant
# at a discount and a sale between family members — both have a price actually
# paid. Standalone land, agricultural land, garages, shops and offices are out,
# as are gifts, inheritances, court-executor sales and self-build. That is why
# the register's «Продажби» column may never be quoted beside these — it counts
# every sale deed and runs more than twice as high.
HOUSE_SALES_COUNT_DATASET = "prc_hpi_hsnq"  # number of dwellings sold
HOUSE_SALES_VALUE_DATASET = "prc_hpi_hsvq"  # what was paid for them
HOUSE_PRICE_INDEX_DATASET = "prc_hpi_q"  # the official house price index
# The SAME index deflated by the national accounts deflator for private final
# consumption, on the same 2015 base and the same 85 quarters.
#
# **It is the difference between the two most important sentences this page can
# say.** Nominally the index sits 77% above its 2008 peak; deflated it sits
# below it. A site whose whole subject is the gap between a number and what it
# buys cannot draw twenty-one years of property prices in the money of the day
# and leave the other line unavailable — that is the correction it exists to
# make, applied to everything except this.
HOUSE_PRICE_REAL_DATASET = "tipsho30"

# `DW_EXST`, not `DW_EXIST`. A misspelled purchase code filters the cube to
# nothing and Eurostat answers 200 with an empty `value` — the query fails
# successfully, which is the failure mode `_require_periods` exists to catch.
PURCHASE_CODES: tuple[str, ...] = ("TOTAL", "DW_NEW", "DW_EXST")

# No `sinceTimePeriod` on any of these, deliberately.
#
# The two sales cubes start at different quarters — the value series runs
# several years further back than the count series — and pinning either window
# in code puts a date in the source that has to be maintained against an
# upstream nobody controls. Asking for everything costs one small response and
# means the series extends by itself, backwards as well as forwards: a
# backfilled quarter appears without an edit, and no year in this file can go
# stale.
#
# What makes that safe is already here. `_cube_to_rows` emits nothing for an
# absent cell rather than a zero, and `build_house_market_payload` pairs the
# two cubes on the quarters they SHARE — so the quarters that carry a value and
# no count simply do not produce an average, instead of producing one divided
# by nothing.

# The value unit, pinned by name rather than taken as it comes.
#
# The cube offers `EUR` and `NAC`, and today they return identical figures for
# every quarter back to 2015-Q1 — Eurostat restated the whole national-currency
# series when Bulgaria adopted the euro. That equality is a fact about their
# current restatement policy, not a property of the units: `NAC` means
# "whatever this country's currency is", so its meaning is defined outside this
# cube and can be redefined without the cube changing shape. `EUR` cannot mean
# anything else. Pinning it costs nothing while they agree and is the whole
# defence if they ever stop, and `_require_periods` raises rather than falling
# back if it is absent — the discipline `sources/ecb.py` applies at the same
# boundary.
HOUSE_SALES_VALUE_UNIT = "EUR"

# The index unit, and the same argument as `INDEX_UNIT` above: the cube offers
# I15_Q and I25_Q, and the whole back-series sits on one base at I15_Q. НСИ
# themselves moved to 2025=100 from the start of 2026 under Regulation (EU)
# 2025/1182 and warn that rates recomputed across the two bases can differ by
# rounding — which is a reason to read the RATE they publish rather than to
# compute one from the index, and `RCH_A` is exactly that figure.
HOUSE_PRICE_INDEX_UNIT = "I15_Q"
HOUSE_PRICE_INDEX_BASE_YEAR = 2015
HOUSE_PRICE_RATE_UNIT = "RCH_A"


def _require_periods(rows: list[dict[str, Any]], dataset: str, unit: str, minimum: int) -> None:
    """The response must carry a plausible number of periods, or fail loudly.

    Eurostat answers a filter that matches nothing with 200 OK and an empty
    `value` map, so a mistyped unit or purchase code produces a successful HTTP
    call, no rows, and — without this — a payload with an empty series in it.
    `_cube_to_rows` emits nothing for an absent cell rather than a zero, which
    is the right behaviour and also the silent one.
    """
    periods = {str(r["time"]) for r in rows}
    if len(periods) < minimum:
        raise ValueError(
            f"{dataset} (unit={unit}): got {len(periods)} periods, expected at "
            f"least {minimum}. A 200 with too few rows is what a wrong unit or "
            f"purchase code looks like — Eurostat filters to nothing and still "
            f"answers OK."
        )


class CubeFetch(NamedTuple):
    """One fetched cube, with the query that produced it.

    The rows and the URL come out of the same call and cannot drift apart,
    which is the whole reason this is a return value rather than a pair of
    functions a caller has to keep in step. Every published figure names the
    query it came from, and a reader who does not believe the figure can run
    the query.
    """

    rows: list[dict[str, Any]]
    dataset: str
    api_url: str
    page_url: str


def house_dataset_url(dataset: str) -> str:
    """The databrowser table a reader clicking through lands on."""
    return f"https://ec.europa.eu/eurostat/databrowser/view/{dataset}/default/table?lang=en"


def house_api_url(dataset: str, params: dict[str, Any]) -> str:
    """The exact API query behind a published figure, as a URL anyone can open.

    Published beside the databrowser link rather than instead of it, because
    the two answer different people. The databrowser page is where a reader
    goes to look; this is what a sceptic runs to get the same digits back, and
    it is the one a machine can check — `validate_link_status` fetches it and
    inspects the BODY, because Eurostat answer a rate-limited or malformed
    query with 200 OK and an error payload.

    It carries the filters the fetcher used, so "where did this come from" has
    a complete answer rather than a dataset name and a shrug.
    """
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{BASE}/{dataset}?{query}"


def fetch_house_sales_count_bg(geo: str = "BG") -> CubeFetch:
    """Dwellings SOLD per quarter, split new / existing / total.

    The count half of the average deal, and the series that carries the part of
    this market nobody states out loud: transactions have been falling while
    prices rise. Rows are {freq, unit, geo, time, purchase, value}.
    """
    params = {"format": "JSON", "lang": "EN", "geo": geo, "unit": "NR"}
    rows = _cube_to_rows(_get(f"{BASE}/{HOUSE_SALES_COUNT_DATASET}", params, timeout=60.0))
    _require_periods(rows, HOUSE_SALES_COUNT_DATASET, "NR", minimum=30)
    return CubeFetch(
        rows,
        HOUSE_SALES_COUNT_DATASET,
        house_api_url(HOUSE_SALES_COUNT_DATASET, params),
        house_dataset_url(HOUSE_SALES_COUNT_DATASET),
    )


def fetch_house_sales_value_bg(geo: str = "BG") -> CubeFetch:
    """What households PAID for those dwellings per quarter, in euro.

    The value half of the average deal. This cube reaches further back than the
    count cube, so the two overlap on fewer quarters than either one carries —
    the transform pairs them and keeps only the quarters that have both.
    """
    params = {"format": "JSON", "lang": "EN", "geo": geo, "unit": HOUSE_SALES_VALUE_UNIT}
    rows = _cube_to_rows(_get(f"{BASE}/{HOUSE_SALES_VALUE_DATASET}", params, timeout=60.0))
    _require_periods(rows, HOUSE_SALES_VALUE_DATASET, HOUSE_SALES_VALUE_UNIT, minimum=40)
    return CubeFetch(
        rows,
        HOUSE_SALES_VALUE_DATASET,
        house_api_url(HOUSE_SALES_VALUE_DATASET, params),
        house_dataset_url(HOUSE_SALES_VALUE_DATASET),
    )


def fetch_house_price_index_bg(geo: str = "BG") -> CubeFetch:
    """The official house price index: the level, and Eurostat's own annual rate.

    Two units in one call — the index on `HOUSE_PRICE_INDEX_UNIT`'s base and
    `RCH_A`, the annual rate of change. The rate is fetched rather than computed
    from the index for a reason НСИ state themselves: the two bases round
    differently, so a rate derived here would disagree in the last decimal with
    the rate both publishers print. That last decimal is what the НСИ↔Eurostat
    reconciliation gate compares.
    """
    params = {"format": "JSON", "lang": "EN", "geo": geo}
    rows = _cube_to_rows(_get(f"{BASE}/{HOUSE_PRICE_INDEX_DATASET}", params, timeout=60.0))
    for unit in (HOUSE_PRICE_INDEX_UNIT, HOUSE_PRICE_RATE_UNIT):
        _require_periods(
            [r for r in rows if r.get("unit") == unit],
            HOUSE_PRICE_INDEX_DATASET,
            unit,
            minimum=40,
        )
    return CubeFetch(
        rows,
        HOUSE_PRICE_INDEX_DATASET,
        house_api_url(HOUSE_PRICE_INDEX_DATASET, params),
        house_dataset_url(HOUSE_PRICE_INDEX_DATASET),
    )


def fetch_house_price_index_real_bg(geo: str = "BG") -> CubeFetch:
    """The deflated house price index — the same series in constant prices.

    One unit, and it is the one that matches: `I15_Q` puts the deflated index on
    the same 2015 base and the same quarterly frequency as the nominal series,
    so the two are drawn against one axis without anything being rescaled here.
    A different unit would still return 200 and a plausible line.

    `tipsho30` has no `purchase` dimension: Eurostat deflate the total only, so
    there is no new-build/existing split to be had and the page may not imply
    one.
    """
    params = {"format": "JSON", "lang": "EN", "geo": geo, "unit": HOUSE_PRICE_INDEX_UNIT}
    rows = _cube_to_rows(_get(f"{BASE}/{HOUSE_PRICE_REAL_DATASET}", params, timeout=60.0))
    _require_periods(rows, HOUSE_PRICE_REAL_DATASET, HOUSE_PRICE_INDEX_UNIT, minimum=40)
    return CubeFetch(
        rows,
        HOUSE_PRICE_REAL_DATASET,
        house_api_url(HOUSE_PRICE_REAL_DATASET, params),
        house_dataset_url(HOUSE_PRICE_REAL_DATASET),
    )


# The three structure cubes. None is quarterly and none is about a transaction —
# together they answer "who owns, who owes, how many homes stand empty, and how
# many people are paying more for housing than they can carry", which is the
# half of the market the transaction series cannot see.
TENURE_DATASET = "ilc_lvho02"  # own / own-with-mortgage / rent
CENSUS_DWELLINGS_DATASET = "cens_21dwob_r3"  # occupied vs unoccupied, 2021 census
HOUSING_OVERBURDEN_DATASET = "ilc_lvho07a"  # households spending >40% of income on housing


def fetch_housing_structure_bg(geo: str = "BG") -> dict[str, CubeFetch]:
    """The three structure cubes, each over its own slice, keyed by dataset.

    Three calls rather than one, because they share no dimensions beyond `geo`
    and each needs its own filter. Every one of those filters has a wrong answer
    that returns 200:

    - **tenure** is a seven-way split (`TOTAL`, `OWN`, `OWN_L`, `OWN_NL`,
      `RENT`, `RENT_MKT`, `RENT_FR`) crossed with household composition and
      poverty status. `hhcomp=TOTAL` and `rskpovth=TOTAL` are the whole
      population; leaving either unpinned returns 357 cells and the transform
      would have to guess which one is the country.
    - **the census** splits by occupancy AND building type, so `building=TOTAL`
      is what "all dwellings" means. `housing=DW_NOC` alone is the unoccupied
      count; against `DW` it is the share that stood empty.
    - **overburden** is crossed with age, sex and poverty status, and the
      headline is all three at `TOTAL`/`T`/`TOTAL`. The below-poverty slice runs
      several times higher and is not the figure anyone quotes.

    Returns raw rows per dataset; the transform picks the cells.
    """
    calls: dict[str, dict[str, Any]] = {
        TENURE_DATASET: {
            "geo": geo,
            "hhcomp": "TOTAL",
            "rskpovth": "TOTAL",
            "unit": "PC",
            "lastTimePeriod": 1,
        },
        CENSUS_DWELLINGS_DATASET: {"geo": geo, "building": "TOTAL", "unit": "NR"},
        HOUSING_OVERBURDEN_DATASET: {
            "geo": geo,
            "age": "TOTAL",
            "sex": "T",
            "rskpovth": "TOTAL",
            "unit": "PC",
        },
    }
    out: dict[str, CubeFetch] = {}
    for dataset, filters in calls.items():
        params = {"format": "JSON", "lang": "EN", **filters}
        rows = _cube_to_rows(_get(f"{BASE}/{dataset}", params, timeout=60.0))
        if not rows:
            raise ValueError(
                f"{dataset}: no rows for {geo}. Every filter above has a spelling "
                f"that returns 200 with an empty cube, so an empty response here "
                f"is a wrong dimension code rather than a country with no data."
            )
        out[dataset] = CubeFetch(
            rows, dataset, house_api_url(dataset, params), house_dataset_url(dataset)
        )
    return out


UNEMPLOYMENT_DATASET = "une_rt_m"


def fetch_unemployment_bg(
    geo: str = "BG",
    since_period: str = "2020-01",
) -> list[dict[str, Any]]:
    """MONTHLY unemployment rate for BG (15-74, both sexes).

    **`une_rt_m`, not `une_rt_a`.** The annual cube publishes one figure a
    year, so in July 2026 the freshest thing it had was the 2025 average —
    eighteen months old, on a page whose whole promise is that the number
    reflects now. `une_rt_m` carries the same concept monthly and is the
    series Eurostat's own releases and the Bulgarian press quote.

    We hit it with no further filters — the BG slice is small — and the
    transform picks the cell. Returns rows shaped
    {freq, s_adj, age, unit, sex, geo, time, value}.

    Three dimensions have to be pinned and each one has a wrong answer that
    looks right:

    - **`s_adj`** is `NSA` / `SA` / `TC`. Eurostat's headline monthly rate is
      **SA** (seasonally adjusted); `NSA` is the raw reading and swings with
      the season, so a month-to-month comparison of NSA figures measures the
      calendar as much as the labour market.
    - **`age`** is `TOTAL` / `Y_LT25` / `Y25-74`. **`TOTAL` here means 15-74**
      — the monthly cube does not offer a literal `Y15-74` code, which the
      annual cube does. A transform ported across without checking would
      filter to nothing.
    - **`unit`** is `PC_ACT` (percentage of the labour force, the headline) or
      `THS_PER` (thousands of persons). `THS_PER` is not a percentage and
      renders as a preposterous one if it slips through.
    """
    return _cube_to_rows(
        _get(
            f"{BASE}/{UNEMPLOYMENT_DATASET}",
            {"format": "JSON", "lang": "EN", "geo": geo, "sinceTimePeriod": since_period},
        )
    )
