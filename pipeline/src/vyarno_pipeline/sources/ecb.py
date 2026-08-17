"""ЕЦБ SDMX connector for the mortgage panel.

MIR = MFI Interest Rate Statistics. BG's central bank reports it, the ЕЦБ
publishes it — so this is the official, monthly, machine-readable record of
what Bulgarian banks actually charged for home loans last month.

We pull three series (BG households, sector-wide):

    NEW BUSINESS  AAR    — the interest rate on loans signed last month
    NEW BUSINESS  APRC   — the same loans' all-in cost, fees included
    NEW BUSINESS  volume — how much was lent (justifies the currency splice)

The outstanding-stock rate comes from БНБ (`bnb.py`); we also pull the ЕЦБ's own
outstanding series here purely as a cross-check gate, because the two must agree
(БНБ is the institution that reports MIR to the ЕЦБ).

TWO STRUCTURAL RULES — DO NOT REMOVE EITHER
-------------------------------------------
1. **Filter in the URL PATH, never the query string.** SDMX-2.1 selects a series
   with a dot-separated key appended to the flow ref. The ЕЦБ API **silently
   ignores unknown query parameters**, so a query-string filter returns the
   entire MIR flow (7,742 series, 18.7 MB) and a parser taking the first series
   gets a confident wrong number. A wrong key in the path returns 404 — a loud,
   catchable failure.

2. **Verify the response describes what we asked for.** `parse_mir_series`
   re-reads the dimension metadata the ЕЦБ sends back and asserts it matches the
   requested key, and refuses any response carrying more than one series. A
   filter that stops applying then raises instead of producing garbage.

WHY `A2C` AND NOT `A22`
-----------------------
`A22` ("Lending for house purchase") exists for BG **outstanding amounts only** —
BG reports no new business under it, and the key 404s. New business for house
purchase is `A2C` ("Lending for house purchase excluding revolving loans and
overdrafts, convenience and extended credit card debt"): 28 BG series, monthly.

WHY WE SPLICE BGN → EUR AT 2026-01
----------------------------------
Bulgaria adopted the euro on 2026-01-01. Before that, home loans were written in
BGN and the EUR series covered a tiny niche of euro-denominated lending; after
it, everything is EUR and the BGN series stops. Monthly new-business volume
makes the size of that difference obvious:

    2025 average   BGN 1,090 m/month   ·   EUR 36 m/month  (niche)
    2026-05          — (series ended)  ·   EUR 599 m/month  (everything)

So "the rate a Bulgarian was quoted" is the BGN series through 2025-12 and the
EUR series from 2026-01, spliced into one continuous series in the currency of
the day. Reading the EUR series alone before 2026 would report a 36 m/month
niche as the national mortgage market.

The splice is smooth, which is the evidence it is the right one:

    AAR   2025-12 BGN 2.48%  →  2026-01 EUR 2.46%
    APRC  2025-12 BGN 2.90%  →  2026-01 EUR 2.74%
"""

from __future__ import annotations

from typing import Any

import httpx

BASE = "https://data-api.ecb.europa.eu/service/data"
DATAFLOW = "MIR"

# Dimension order of a MIR series key. The ECB defines it; we assert the
# responses still match this order so a reordering upstream fails loud
# instead of silently shifting every value one slot.
# fmt: off
# Column-aligned on purpose: this is a reference table read against the
# ECB's own dimension list, not ordinary code.
SERIES_KEY_DIMS: tuple[str, ...] = (
    "FREQ",                 # M   monthly
    "REF_AREA",             # BG  Bulgaria
    "BS_REP_SECTOR",        # B   deposit-taking corporations except the central bank
    "BS_ITEM",              # A2C new-business house purchase / A22 outstanding
    "MATURITY_NOT_IRATE",   # A   total (all initial rate-fixation periods)
    "DATA_TYPE_MIR",        # R   AAR · C   APRC · B   business volume
    "AMOUNT_CAT",           # A   total
    "BS_COUNT_SECTOR",      # 2250 households + NPISH (S.14 + S.15)
    "CURRENCY_TRANS",       # BGN pre-2026 · EUR from 2026
    "IR_BUS_COV",           # N   new business · O   outstanding amount
)
# fmt: on

# The month BG joined the eurozone. Periods strictly before this come from
# the BGN series, this month and after from the EUR series.
EURO_SWITCH_PERIOD = "2026-01"

# Every series we pull, keyed by the role it plays in mortgage.json.
# fmt: off
# Column-aligned so the ten SDMX dimensions line up and a wrong slot is
# visible by eye.
SERIES_KEYS: dict[str, str] = {
    # Headline tier — what a new borrower signs.
    "new_business_aar_bgn":    "M.BG.B.A2C.A.R.A.2250.BGN.N",
    "new_business_aar_eur":    "M.BG.B.A2C.A.R.A.2250.EUR.N",
    # Same loans, all-in cost including fees (ГПР in Bulgarian).
    "new_business_aprc_bgn":   "M.BG.B.A2C.A.C.A.2250.BGN.N",
    "new_business_aprc_eur":   "M.BG.B.A2C.A.C.A.2250.EUR.N",
    # Monthly lending volume — provenance for the currency splice.
    "new_business_volume_bgn": "M.BG.B.A2C.A.B.A.2250.BGN.N",
    "new_business_volume_eur": "M.BG.B.A2C.A.B.A.2250.EUR.N",
    # Outstanding stock — cross-check only; BNB is the published source.
    "outstanding_aar_eur":     "M.BG.B.A22.A.R.A.2250.EUR.O",
    # New business split by what it actually is. IR_BUS_COV carries four values
    # for BG, not two: P «pure new loans» and R «renegotiation» partition N, to
    # the cent, every month since 2020-01. So «new lending» is two populations
    # and the ECB publish the seam — a fifth of it is households repricing a
    # loan they already had, which is a different fact from a fifth more houses
    # being bought.
    "new_business_aar_pure_bgn":   "M.BG.B.A2C.A.R.A.2250.BGN.P",
    "new_business_aar_pure_eur":   "M.BG.B.A2C.A.R.A.2250.EUR.P",
    "new_business_aar_reneg_bgn":  "M.BG.B.A2C.A.R.A.2250.BGN.R",
    "new_business_aar_reneg_eur":  "M.BG.B.A2C.A.R.A.2250.EUR.R",
    "new_business_vol_pure_bgn":   "M.BG.B.A2C.A.B.A.2250.BGN.P",
    "new_business_vol_pure_eur":   "M.BG.B.A2C.A.B.A.2250.EUR.P",
    "new_business_vol_reneg_bgn":  "M.BG.B.A2C.A.B.A.2250.BGN.R",
    "new_business_vol_reneg_eur":  "M.BG.B.A2C.A.B.A.2250.EUR.R",
}
# fmt: on

# `MATURITY_NOT_IRATE`, the fifth dimension, is the INITIAL RATE-FIXATION
# PERIOD on new business and not the loan's maturity — the ECB's own title for
# `F` reads «loans to households for house purchase with a variable rate and an
# interest rate fixation period of up to one year». `A` is therefore "all
# fixations", which is what every key above pins.
#
# The rates split four ways and the volumes do not: `…{F,I,O,P}.B.…EUR.N` is a
# 404 at every bucket and every date, so the euro leg carries no volume by
# fixation and the share has to come from БНБ's own workbook
# (`bnb.fetch_housing_fixation_bg`). The BGN leg did carry it, which is why the
# rates below still splice.
FIXATION_KEYS: dict[str, str] = {
    "up_to_1y": "F",
    "1y_to_5y": "I",
    "5y_to_10y": "O",
    "over_10y": "P",
}


def fixation_rate_key(bucket: str, currency: str) -> str:
    """The A2C new-business AAR series for one initial rate-fixation bucket."""
    return f"M.BG.B.A2C.{FIXATION_KEYS[bucket]}.R.A.2250.{currency}.N"


# Human-readable provenance URL for a series key (what we cite in the JSON
# so a reader can click through to the same numbers).
def series_url(series_key: str, start_period: str = "2020-01") -> str:
    """Provenance URL for one MIR series. Also the URL we actually fetch."""
    return f"{BASE}/{DATAFLOW}/{series_key}?format=jsondata&startPeriod={start_period}"


def fetch_mir_series(
    series_key: str,
    start_period: str = "2020-01",
    timeout: float = 60.0,
) -> dict[str, float]:
    """Fetch one fully-specified MIR series → {"YYYY-MM": value}.

    `series_key` must be a complete dot-separated key (all 10 dimensions).
    A wildcard or wrong key 404s rather than returning a superset — that is
    the point (see module docstring).

    Raises:
        httpx.HTTPError  on network/HTTP failure (caller exits 4).
        ValueError       if the response doesn't describe the series we
                         asked for, or its shape changed (caller exits 2).
    """
    url = series_url(series_key, start_period)
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        return parse_mir_series(r.json(), expect_key=series_key)


# ---------------------------------------------------------------------------
# Pure parsing — tests feed it committed fixtures, no network
# ---------------------------------------------------------------------------


def parse_mir_series(
    payload: dict[str, Any],
    expect_key: str | None = None,
) -> dict[str, float]:
    """SDMX-JSON → {"YYYY-MM": value}, verifying the series identity.

    `expect_key` is the dot-separated key we requested. When given, the
    dimension metadata in the response must decode to exactly that key.
    This is the guard that makes a silently-ignored filter impossible to
    mistake for real data — the failure mode that shipped Austrian
    corporate loan rates as Bulgaria's mortgage rate.
    """
    structure = payload.get("structure")
    if not structure:
        raise ValueError("ECB MIR response has no `structure` block")

    # --- observation (time) dimension ------------------------------------
    obs_dims = structure.get("dimensions", {}).get("observation", [])
    if not obs_dims or obs_dims[0].get("id") != "TIME_PERIOD":
        raise ValueError(
            f"ECB MIR: expected TIME_PERIOD as the observation dimension, "
            f"got {[d.get('id') for d in obs_dims]}. Upstream shape changed."
        )
    time_labels = [v["id"] for v in obs_dims[0]["values"]]

    # --- series dimensions: assert order, then decode identity -----------
    series_dims = structure.get("dimensions", {}).get("series", [])
    got_dims = tuple(d.get("id") for d in series_dims)
    if got_dims != SERIES_KEY_DIMS:
        raise ValueError(
            f"ECB MIR: series dimension order changed.\n"
            f"  expected {SERIES_KEY_DIMS}\n"
            f"  got      {got_dims}\n"
            f"Re-verify the key layout before trusting any value."
        )

    datasets = payload.get("dataSets") or []
    if not datasets:
        raise ValueError("ECB MIR response has no dataSets")
    series_map = datasets[0].get("series") or {}

    # A fully-specified key must select exactly one series. More than one
    # means the filter did not apply and we would be picking arbitrarily.
    if len(series_map) != 1:
        raise ValueError(
            f"ECB MIR: expected exactly 1 series for a fully-specified key, "
            f"got {len(series_map)}. The dimension filter did not apply — "
            f"refusing to guess which series is Bulgaria's. "
            f"(Filter in the URL path, never the query string.)"
        )

    positional_key, series = next(iter(series_map.items()))
    decoded = ".".join(
        series_dims[i]["values"][int(idx)]["id"] for i, idx in enumerate(positional_key.split(":"))
    )
    if expect_key is not None and decoded != expect_key:
        raise ValueError(
            f"ECB MIR: response describes a different series than requested.\n"
            f"  requested {expect_key}\n"
            f"  returned  {decoded}\n"
            f"Refusing to publish a number for the wrong country/product."
        )

    # --- observations -----------------------------------------------------
    out: dict[str, float] = {}
    for time_idx_str, val_array in (series.get("observations") or {}).items():
        idx = int(time_idx_str)
        if idx >= len(time_labels):
            raise ValueError(
                f"ECB MIR: time index {idx} out of range ({len(time_labels)} periods available)"
            )
        raw = val_array[0] if val_array else None
        if raw is None:
            continue  # genuinely unpublished month — omit, never zero-fill
        out[time_labels[idx]] = float(raw)
    # SDMX does not guarantee time order; sort by the "YYYY-MM" label.
    return dict(sorted(out.items()))


def splice_at_euro_changeover(
    bgn_series: dict[str, float],
    eur_series: dict[str, float],
    switch_period: str = EURO_SWITCH_PERIOD,
) -> dict[str, float]:
    """One continuous series in "the currency of the day".

    BGN for periods before `switch_period`, EUR from it onward. See the
    module docstring for why reading the EUR series alone across the
    changeover misreports a niche as the national market.
    """
    out = {p: v for p, v in bgn_series.items() if p < switch_period}
    out.update({p: v for p, v in eur_series.items() if p >= switch_period})
    return dict(sorted(out.items()))
