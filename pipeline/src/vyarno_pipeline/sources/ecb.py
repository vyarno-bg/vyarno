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


# ---------------------------------------------------------------------------
# CBD2 — Consolidated Banking Data, and the only household-scoped NPL ratio
# ---------------------------------------------------------------------------
# **The figure in the headlines is not a household figure.** «Необслужваните
# заеми растат до 3,3%» is БНБ's supervisory ratio over the WHOLE credit
# portfolio, which is dominated by corporate lending — and corporate lending
# defaults at about twice the household rate, so the number a reader takes for
# "how many of us are behind" is not one. CBD2 is where the ЕЦБ publish the
# split, quarterly and machine-readable, which is the alternative to parsing a
# 1.8 MB supervisory PDF for one cell.
#
# CBD2 IS NOT MIR: 16 key dimensions rather than 10, in this order, and a
# wildcard key 404s until you have read the DSD. Same two structural rules
# though — filter in the path, verify the response describes what was asked for.
DATAFLOW_CBD2 = "CBD2"
# fmt: off
CBD2_KEY_DIMS: tuple[str, ...] = (
    "FREQ",              # Q    quarterly
    "REF_AREA",          # BG   Bulgaria
    "COUNT_AREA",        # W0   world (the counterparty's residence, not restricted)
    "CB_REP_SECTOR",     # 67   every bank operating in BG · 11 domestic groups only
    "BS_COUNT_SECTOR",   # S1M  households and NPISH · S11 non-financial corporations
    "BS_NFC_ACTIVITY",
    "CB_SECTOR_SIZE",    # A    all sizes
    "CB_REP_FRAMEWRK",   # F    FINREP (IFRS and GAAP)
    "CB_ITEM",           # I3632 gross NPL over gross loans and advances
    "CB_PORTFOLIO",
    "CB_EXP_TYPE",
    "CB_VAL_METHOD",
    "MATURITY_RES",
    "DATA_TYPE",
    "CURRENCY_TRANS",
    "UNIT_MEASURE",      # PC   per cent
)
# fmt: on

# `CB_REP_SECTOR` is the choice that moves the number most, and 67 is the one
# that describes Bulgaria. 11 is domestic banking groups and stand-alone banks
# ALONE, and BG's banking system is majority foreign-owned — so 11 reports 3.97%
# where 67 reports 2.37% at 2026-Q1, for the same households, because it is
# looking at a minority of their loans. 67 adds the foreign-controlled
# subsidiaries and branches, which is every bank a Bulgarian actually borrows
# from.
CBD2_REP_SECTOR = "67"

# Three counterparty scopes of one ratio, and publishing all three is what makes
# the denominator claim checkable rather than asserted: households sit well
# below the whole-portfolio figure precisely because corporates sit well above
# it. `_Z` is "not applicable", which in CBD2 means the ratio is not broken down
# by counterparty at all — the whole book.
# fmt: off
CBD2_NPL_SCOPES: dict[str, str] = {
    "households":   "S1M",
    "corporations": "S11",
    "all":          "_Z",
}
# fmt: on


def cbd2_npl_key(scope: str) -> str:
    """The gross-NPL-ratio series for one counterparty scope."""
    return f"Q.BG.W0.{CBD2_REP_SECTOR}.{CBD2_NPL_SCOPES[scope]}._Z.A.F.I3632._Z._Z._Z._Z._Z._Z.PC"


def cbd2_url(series_key: str, start_period: str = "2020-Q1") -> str:
    """Provenance URL for one CBD2 series. Also the URL we actually fetch."""
    return f"{BASE}/{DATAFLOW_CBD2}/{series_key}?format=jsondata&startPeriod={start_period}"


def fetch_cbd2_series(
    series_key: str,
    start_period: str = "2020-Q1",
    timeout: float = 60.0,
) -> dict[str, float]:
    """Fetch one fully-specified CBD2 series → {"YYYY-Qn": value}."""
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(cbd2_url(series_key, start_period))
        r.raise_for_status()
        return _parse_sdmx_series(r.json(), CBD2_KEY_DIMS, series_key, DATAFLOW_CBD2)


# Everything a household borrows on that is not a mortgage, plus what a deposit
# pays — the comparator, because a rate is only ever high or low against
# something. `BS_ITEM` is the whole difference between these keys:
#
#   A2B   loans for consumption, excluding revolving and card credit
#   A2Z1  revolving loans and overdrafts
#   A2Z3  extended credit card credit — the balance carried past the
#         interest-free period, which is where a card stops being free
#   L21   overnight deposits
#   L22   deposits with an agreed maturity
#
# A2Z1 and A2Z3 carry a rate and no volume for BG, and no APRC: the ЕЦБ collect
# `DATA_TYPE_MIR=C` on instalment credit only. So the card figure is a price
# with no quantity beside it, and the payload says so rather than implying one.
# fmt: off
CONSUMER_KEYS: dict[str, str] = {
    "consumer_aar_bgn":    "M.BG.B.A2B.A.R.A.2250.BGN.N",
    "consumer_aar_eur":    "M.BG.B.A2B.A.R.A.2250.EUR.N",
    "consumer_aprc_bgn":   "M.BG.B.A2B.A.C.A.2250.BGN.N",
    "consumer_aprc_eur":   "M.BG.B.A2B.A.C.A.2250.EUR.N",
    "consumer_volume_bgn": "M.BG.B.A2B.A.B.A.2250.BGN.N",
    "consumer_volume_eur": "M.BG.B.A2B.A.B.A.2250.EUR.N",
    "overdraft_aar_bgn":   "M.BG.B.A2Z1.A.R.A.2250.BGN.N",
    "overdraft_aar_eur":   "M.BG.B.A2Z1.A.R.A.2250.EUR.N",
    "card_aar_bgn":        "M.BG.B.A2Z3.A.R.A.2250.BGN.N",
    "card_aar_eur":        "M.BG.B.A2Z3.A.R.A.2250.EUR.N",
    "deposit_overnight_bgn": "M.BG.B.L21.A.R.A.2250.BGN.N",
    "deposit_overnight_eur": "M.BG.B.L21.A.R.A.2250.EUR.N",
    "deposit_term_bgn":      "M.BG.B.L22.A.R.A.2250.BGN.N",
    "deposit_term_eur":      "M.BG.B.L22.A.R.A.2250.EUR.N",
    # How much went into a term deposit last month, and what the money already
    # in one is earning. `.B.` is the volume and `.O` the outstanding stock, and
    # the pair is the whole point: a household opening a deposit today is quoted
    # the new-business rate, while what most people are actually earning is the
    # stock rate, a third of it.
    "deposit_term_volume_eur": "M.BG.B.L22.A.B.A.2250.EUR.N",
    "deposit_term_stock_eur":  "M.BG.B.L22.A.R.A.2250.EUR.O",
    # Every household loan on the books, at one rate. Nothing else on the page
    # answers "what does the average household loan cost, across everything",
    # and it is the rate `credit.py` gates БНБ's own blocks against.
    "household_stock_eur":     "M.BG.B.A20.A.R.A.2250.EUR.O",
}
# fmt: on

# The outstanding-stock leg carries a RATE and never a size: `…B.A20/A22/A2B/
# L21/L22.A.B.A.2250.EUR.O` is a 404 at every date, probed 2026-08-17. So the
# euro amounts under those rates come from БНБ's workbooks (`sources/bnb.py`)
# and there is no key to add here instead.
#
# The three stock rates above START AT 2022-01 rather than 2020-01. Nothing
# needs doing about that — they are the gate's input and a cross-check needs
# only the month it is checking — but a caller expecting `MIN_SERIES_MONTHS` of
# them from a 2020 start would find 54 months where the new-business keys give
# 78.
OUTSTANDING_SERIES_START = "2022-01"


# ---------------------------------------------------------------------------
# BSI — Balance Sheet Items, the levels underneath the MIR prices
# ---------------------------------------------------------------------------
# MIR says what money COSTS. BSI says how much of it there is: the stock of
# deposits households have placed with BG banks, and the stock of loans those
# banks have made to them, monthly and on one balance sheet.
#
# BSI IS NOT MIR: 11 key dimensions rather than 10, in the order below. Same two
# structural rules though — filter in the path, and verify the response
# describes what was asked for.
#
# WHY `U6` AND NOT `U2`
# ---------------------
# `COUNT_AREA` is the counterparty's residence, and it carries three values for
# BG: `U2` the whole euro area, `U6` domestic, `U5` the other member states.
# They add up — at 2026-06 the deposit total is U6 56,472.6 + U5 451.8 = U2
# 56,924.4 — so `U2` counts €452 m placed in Bulgarian banks by households
# resident ELSEWHERE in the euro area. The page's claim is about households in
# Bulgaria, and the two lines are divided by each other, so both take `U6`.
#
# The cost of that choice is the deposit BREAKDOWN: `L21` overnight, `L22`
# agreed maturity and `L23` at notice are published on `U2` alone and 404 on
# `U6` (probed 2026-08-17). A split of one population charted against a total of
# another is not a split, so the payload carries the totals and no breakdown.
# `A21` and `A23` do not exist for BG at all, on any counterpart area.
#
# WHY BOTH LINES COME FROM HERE AND NOT ONE OF THEM FROM БНБ
# ----------------------------------------------------------
# `credit.json#outstanding` already carries what households owe, from БНБ's
# workbooks, and it is the better figure for the table it feeds — it splits by
# purpose, which BSI cannot. It is the wrong figure to divide deposits by:
# БНБ's own footnote says «данните за кредитите за потребление и за жилищните
# кредити се отнасят само за сектор Домакинства», so those two blocks are S.14
# while every BSI series here is S.14+S.15. BSI runs 2.2–6.1% above БНБ across
# the window for that reason, always above and never below.
#
# A ratio between two populations is wrong under any caption you can give it, so
# the pair that gets divided is one publisher's, one sector's and one
# counterpart area's. `credit.py#cross_check_household_stock` holds the two
# against each other rather than letting them drift apart unwatched.
# fmt: off
# Column-aligned on purpose: this is a reference table read against the
# ECB's own dimension list, not ordinary code.
BSI_SERIES_KEY_DIMS: tuple[str, ...] = (
    "FREQ",              # M     monthly
    "REF_AREA",          # BG    Bulgaria
    "ADJUSTMENT",        # N     neither seasonally nor working-day adjusted
    "BS_REP_SECTOR",     # A     MFIs excluding ESCB
    "BS_ITEM",           # L20   deposit liabilities · A20 loans
    "MATURITY_ORIG",     # A     total
    "DATA_TYPE",         # 1     outstanding amounts at the end of the period
    "COUNT_AREA",        # U6    domestic
    "BS_COUNT_SECTOR",   # 2250  households + NPISH (S.14 + S.15)
    "CURRENCY_TRANS",    # Z01   all currencies combined
    "BS_SUFFIX",         # E     euro
)

BSI_KEYS: dict[str, str] = {
    "household_deposits": "M.BG.N.A.L20.A.1.U6.2250.Z01.E",
    "household_loans":    "M.BG.N.A.A20.A.1.U6.2250.Z01.E",
}
# fmt: on

BSI_DATAFLOW = "BSI"

# Every BG household series in this flow begins here and there is no deeper
# history to ask for: enumerating the whole `BS_ITEM` dimension with a bare `.`
# returns fourteen series and thirteen of them start at this month (probed
# 2026-08-17, `firstNObservations=1`). A window opened wider returns the same 54
# months rather than failing, so this constant documents the limit more than it
# enforces it — and the limit is why the chart it feeds stops where it does.
BSI_SERIES_START = "2022-01"


def bsi_url(series_key: str, start_period: str = BSI_SERIES_START) -> str:
    """Provenance URL for one BSI series. Also the URL we actually fetch."""
    return f"{BASE}/{BSI_DATAFLOW}/{series_key}?format=jsondata&startPeriod={start_period}"


def fetch_bsi_series(
    series_key: str,
    start_period: str = BSI_SERIES_START,
    timeout: float = 60.0,
) -> dict[str, float]:
    """Fetch one fully-specified BSI series → {"YYYY-MM": millions of euro}."""
    url = bsi_url(series_key, start_period)
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        return parse_bsi_series(r.json(), expect_key=series_key)


def parse_bsi_series(
    payload: dict[str, Any],
    expect_key: str | None = None,
) -> dict[str, float]:
    """SDMX-JSON → {"YYYY-MM": value}, verifying the series identity."""
    return _parse_sdmx_series(payload, BSI_SERIES_KEY_DIMS, expect_key, BSI_DATAFLOW)


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
    return _parse_sdmx_series(payload, SERIES_KEY_DIMS, expect_key, DATAFLOW)


def _parse_sdmx_series(
    payload: dict[str, Any],
    expect_dims: tuple[str, ...],
    expect_key: str | None,
    flow: str,
) -> dict[str, float]:
    """The body of the above, for any ECB flow whose dimension order we pin.

    Shared rather than copied because the identity guard is the whole value of
    it, and a second flow's parser written beside this one is a second place for
    that guard to be quietly weaker. What differs between flows is the dimension
    tuple and the period labels, and both arrive as arguments.
    """
    structure = payload.get("structure")
    if not structure:
        raise ValueError(f"ECB {flow} response has no `structure` block")

    # --- observation (time) dimension ------------------------------------
    obs_dims = structure.get("dimensions", {}).get("observation", [])
    if not obs_dims or obs_dims[0].get("id") != "TIME_PERIOD":
        raise ValueError(
            f"ECB {flow}: expected TIME_PERIOD as the observation dimension, "
            f"got {[d.get('id') for d in obs_dims]}. Upstream shape changed."
        )
    time_labels = [v["id"] for v in obs_dims[0]["values"]]

    # --- series dimensions: assert order, then decode identity -----------
    series_dims = structure.get("dimensions", {}).get("series", [])
    got_dims = tuple(d.get("id") for d in series_dims)
    if got_dims != expect_dims:
        raise ValueError(
            f"ECB {flow}: series dimension order changed.\n"
            f"  expected {expect_dims}\n"
            f"  got      {got_dims}\n"
            f"Re-verify the key layout before trusting any value."
        )

    datasets = payload.get("dataSets") or []
    if not datasets:
        raise ValueError(f"ECB {flow} response has no dataSets")
    series_map = datasets[0].get("series") or {}

    # A fully-specified key must select exactly one series. More than one
    # means the filter did not apply and we would be picking arbitrarily.
    if len(series_map) != 1:
        raise ValueError(
            f"ECB {flow}: expected exactly 1 series for a fully-specified key, "
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
            f"ECB {flow}: response describes a different series than requested.\n"
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
                f"ECB {flow}: time index {idx} out of range ({len(time_labels)} periods available)"
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
