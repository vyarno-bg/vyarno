"""CLI entry point for the vyarno.bg data pipeline.

Usage:
    vyarno-pipeline refresh --source hicp --out ../data/published
    vyarno-pipeline refresh --source hicp --out ../data/published --skip-link-check
    vyarno-pipeline refresh --source hicp --out ../data/published --since-year 2020
    vyarno-pipeline refresh --source hpi --out ../data/published
    vyarno-pipeline refresh --source unemployment --out ../data/published
    vyarno-pipeline refresh --source mortgage --out ../data/published
    vyarno-pipeline refresh --source all --out ../data/published

Exit codes:
    0 — published successfully
    2 — input/transform error (missing data, wrong shape)
    3 — validation gate failed (reconciliation / coverage / link / mortgage bounds)
    4 — network/HTTP error
"""

from __future__ import annotations

import json
import sys
import time
from collections.abc import Callable
from datetime import date
from pathlib import Path

import click
import httpx

from vyarno_pipeline import clock
from vyarno_pipeline.mortgage import (
    MortgageValidationError,
    cross_check_outstanding,
    latest_period,
    lending_limits_at,
    validate_aprc_above_aar,
    validate_freshness,
    validate_rate_series,
)
from vyarno_pipeline.payroll import build_payroll_payload
from vyarno_pipeline.publish import (
    CITY_PRICE_FILE,
    HICP_CATEGORIES_FILE,
    HICP_HEADLINE_FILE,
    HOUSE_MARKET_FILE,
    HOUSE_MARKET_STRUCTURE_FILE,
    MORTGAGE_FILE,
    NSI_HOUSING_FILE,
    PAYROLL_FILE,
    REGION_SALARY_FILE,
    SALARY_DIST_FILE,
    SECTOR_SALARY_FILE,
    UNEMPLOYMENT_FILE,
    write_hicp_categories,
    write_hicp_headline,
    write_mortgage_payload,
    write_payload,
    write_salary_distribution_payload,
    write_time_series,
)
from vyarno_pipeline.regions import PRICED_REGIONS, REGIONS
from vyarno_pipeline.sources.bnb import SOURCE_URL as BNB_SOURCE_URL
from vyarno_pipeline.sources.bnb import fetch_housing_stock_rate_bg
from vyarno_pipeline.sources.ecb import (
    EURO_SWITCH_PERIOD,
    SERIES_KEYS,
    fetch_mir_series,
    series_url,
    splice_at_euro_changeover,
)
from vyarno_pipeline.sources.eurostat import (
    CP_DIVISIONS,
    IW_DATASET,
    MINR_DATASET,
    fetch_hicp_index_bg,
    fetch_hicp_rates_bg,
    fetch_hicp_weights_bg,
    fetch_house_price_index_bg,
    fetch_house_price_index_real_bg,
    fetch_house_sales_count_bg,
    fetch_house_sales_value_bg,
    fetch_housing_structure_bg,
    fetch_ses_earnings_bg,
    fetch_unemployment_bg,
    group_codes_in_basket,
)
from vyarno_pipeline.sources.imot import (
    build_city_price_payload,
    build_city_row,
    fetch_city_prices,
    fetch_city_prices_for_year,
)
from vyarno_pipeline.sources.nsi import (
    HOUSING_WORKBOOKS,
    SECTOR_SOURCE_URL_BG,
    SECTOR_SOURCE_URL_EN,
    fetch_housing_workbook,
    fetch_region_salaries_eu,
    fetch_sector_salary_eu,
)
from vyarno_pipeline.sources.nsi import (
    SOURCE_URL as NSI_REGION_SALARY_URL,
)
from vyarno_pipeline.sources.nsi import (
    SOURCE_URL_BG as NSI_REGION_SALARY_URL_BG,
)
from vyarno_pipeline.transform import (
    COICOP_META,
    MissingSeriesError,
    build_house_market_payload,
    build_house_market_structure_payload,
    build_nsi_housing_payload,
    build_region_salary_payload,
    build_sector_salary_payload,
    build_ses_shape_ladder,
    index_fields,
    rows_to_category_observations,
    rows_to_unemployment_observation,
)
from vyarno_pipeline.validate import (
    BASKET_SUM_TOLERANCE_PP,
    CHAIN_TOLERANCE_PP,
    ValidationError,
    validate_chain_reconciliation,
    validate_city_price,
    validate_classification_agreement,
    validate_coverage,
    validate_group_consistency,
    validate_headline_flash,
    validate_house_market,
    validate_house_market_structure,
    validate_hpi_across_publishers,
    validate_link_status,
    validate_meta_labels_cover,
    validate_nsi_housing,
    validate_reconciliation,
    validate_region_salary,
    validate_sector_salary,
)


@click.group()
def main() -> None:
    """vyarno.bg data pipeline."""


# How far back the per-city archive walk starts. имот.bg's deepest city is
# София, whose pages answer from 2000; most others begin 2003 and five 2004.
# The walk starts at the deepest and lets the misses fall out, because a
# per-city start year is a second table that would have to be kept in step with
# имот.bg's own coverage — and a year they have nothing for costs one request
# and returns no literal, which the parse already treats as "no data" rather
# than as a fault.
_ARCHIVE_EARLIEST_YEAR = 2000

# Politeness spacing between имот.bg requests. The probe saw no throttling at
# all — 100 sequential requests, ~190 ms each, every one a 200 — so this buys
# nothing technical. It is here because a full sweep is ~650 requests against
# one publisher's public pages, and the alternative reads as a scrape.
_IMOT_REQUEST_SPACING_S = 0.2


# Methodology notes cited verbatim in mortgage.json, so the published JSON
# carries the link a reader can click. Kept in sync with
# docs/data-sources.md §BNB and §ECB.
BNB_METHODOLOGY_CHANGE_NOTE = (
    "Bulgaria adopted the euro on 2026-01-01. Per the BNB methodological note "
    "(st_m_instr_irs_new_2026_bg.pdf, published 19 Feb 2026), OLP and LEONIA Plus "
    "(BG's old base rates) were retired, the BGN column was dropped from interest "
    "tables, and pre-2026 EUR series were reconstructed by BNB from BGN+EUR "
    "aggregates. So the EUR outstanding-stock figures before 2026-01 are a BNB "
    "reconstruction, not a contemporaneous observation. See "
    "https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download/"
    "st_m_instr_irs_new_2026_bg.pdf"
)

ECB_EURO_SPLICE_NOTE = (
    "Bulgaria adopted the euro on 2026-01-01. Before then home loans were written "
    "in BGN and the EUR series covered a ~36 m/month niche; from 2026-01 "
    "everything is EUR (~600 m/month) and the BGN series stops. This series is "
    "therefore BGN through 2025-12 spliced with EUR from 2026-01 — the rate in "
    "the currency of the day. The splice is continuous (AAR 2.48% → 2.46%, "
    "APRC 2.90% → 2.74%), which is the evidence it is the right one. Reading the "
    "EUR series alone across the changeover would report the pre-2026 niche as "
    "the national mortgage market."
)


def _month_before(period: str) -> str:
    """ "2026-01" -> "2025-12". Labels the pre-splice segment of the series."""
    year, month = (int(p) for p in period.split("-"))
    return f"{year - 1}-12" if month == 1 else f"{year}-{month - 1:02d}"


@main.command(name="refresh")
@click.option(
    "--source",
    required=True,
    type=click.Choice(
        [
            "hicp",
            "unemployment",
            "mortgage",
            "city-price",
            "region-salary",
            "sector-salary",
            "salary-dist",
            "payroll",
            "house-market",
            "nsi-housing",
            "all",
        ]
    ),
    help=(
        "Which dataset to refresh. 'mortgage' pulls ECB MIR (new-business "
        "AAR + APRC) and BNB (outstanding housing stock) into one "
        "mortgage.json; both are required and it fails loud rather than "
        "publishing a partial panel. 'city-price' reads imot.bg/sredni-ceni for "
        "the per-district €/m² averages in each of the 27 covered cities, plus "
        "their yearly archives. It needs an ordinary Bulgarian connection — "
        "www.imot.bg answers datacenter IPs with a 403 — and exits 4 when every "
        "city is unreachable. "
        "'region-salary' fetches the NSI regional wage XLSX in both language "
        "editions for the latest published quarter in every one of the 28 "
        "oblasti (exit 4 on network error). "
        "'sector-salary' fetches NSI's by-economic-activity wage table in both "
        "language editions for the latest published quarter per NACE Rev 2 "
        "section (exit 4 on network error). "
        "'salary-dist' builds the individual gross-earnings percentile ladder "
        "shape (Eurostat SES; the browser re-levels it onto NSI's national "
        "all-activities average). "
        "'house-market' pulls the three quarterly Eurostat property cubes "
        "(dwellings sold, what was paid, the house price index) plus the four "
        "structure cubes (tenure, the census dwelling stock, price-to-income, "
        "housing-cost overburden) and writes BOTH house_market.json and "
        "house_market_structure.json — one arm, two files, because "
        "refresh.yml matches payload stems against the --source name. "
        "'nsi-housing' reads НСИ's own housing workbooks — the national house "
        "price index change and the same figure for the six cities over 120,000 "
        "people, beside the change in the number of sales for those cities. "
        "Every figure is a cell they published; the filenames are discovered "
        "from their portal rather than hardcoded."
    ),
)
@click.option(
    "--out",
    required=True,
    type=click.Path(path_type=Path),
    help="Directory to write /data/published/*.json",
)
@click.option("--geo", default="BG", show_default=True, help="Geography code")
@click.option(
    "--since-year",
    default=2020,
    type=int,
    show_default=True,
    help="Earliest year for index history",
)
@click.option(
    "--skip-link-check", is_flag=True, help="Skip per-CP URL body validation. CI/sandbox only."
)
def refresh(
    source: str,
    out: Path,
    geo: str,
    since_year: int,
    skip_link_check: bool,
) -> None:
    """Pull latest observations, validate, write /data/published/*.json."""
    out.mkdir(parents=True, exist_ok=True)
    as_of = clock.today()

    if source == "hicp":
        _refresh_hicp(out, geo, since_year, skip_link_check, as_of)
    elif source == "unemployment":
        _refresh_unemployment(out, geo, as_of)
    elif source == "mortgage":
        _refresh_mortgage(out, as_of)
    elif source == "city-price":
        _refresh_city_price(out, as_of)
    elif source == "region-salary":
        _refresh_region_salary(out, as_of)
    elif source == "sector-salary":
        _refresh_sector_salary(out, as_of)
    elif source == "salary-dist":
        _refresh_salary_dist(out, as_of)
    elif source == "payroll":
        _refresh_payroll(out, as_of)
    elif source == "house-market":
        _refresh_house_market(out, geo, skip_link_check, as_of)
    elif source == "nsi-housing":
        _refresh_nsi_housing(out, as_of)
    elif source == "all":
        # **`all` is eight publishes, not one transaction.** Each arm writes its
        # own file the moment it has passed its own gates, so an arm that fails
        # leaves the arms before it already rewritten on disk and the arms after
        # it untouched — a directory holding two refresh dates at once.
        #
        # That is the right behaviour and not a shortcoming to engineer away: an
        # arm's output is only ever as good as the gates it just cleared, and
        # holding seven good payloads hostage to an eighth upstream's outage would
        # buy atomicity by discarding work that is correct. `data/published/` is
        # reviewed as a diff before it is committed, which is where a mixed set
        # gets caught.
        #
        # What that costs is knowing WHICH arms landed, and an arm exits the
        # process from inside itself (exit 2 transform, 3 gate, 4 network), so
        # without this the run dies on the failing arm's message alone and the
        # operator is left to read `git status` to find out what changed. Naming
        # the completed arms is the difference between re-running one and
        # re-running eight.
        done: list[str] = []
        arms: list[tuple[str, Callable[[], None]]] = [
            ("hicp", lambda: _refresh_hicp(out, geo, since_year, skip_link_check, as_of)),
            ("unemployment", lambda: _refresh_unemployment(out, geo, as_of)),
            ("mortgage", lambda: _refresh_mortgage(out, as_of)),
            ("city-price", lambda: _refresh_city_price(out, as_of)),
            ("region-salary", lambda: _refresh_region_salary(out, as_of)),
            ("sector-salary", lambda: _refresh_sector_salary(out, as_of)),
            ("salary-dist", lambda: _refresh_salary_dist(out, as_of)),
            ("payroll", lambda: _refresh_payroll(out, as_of)),
            ("house-market", lambda: _refresh_house_market(out, geo, skip_link_check, as_of)),
            ("nsi-housing", lambda: _refresh_nsi_housing(out, as_of)),
        ]
        for name, arm in arms:
            try:
                arm()
            except BaseException:
                # BaseException, because an arm's normal failure path is
                # `sys.exit`, which raises SystemExit — not an Exception. Catching
                # Exception here would report nothing on exactly the failures this
                # exists for. The exit code is re-raised untouched, so `all` still
                # fails with the arm's own 2 / 3 / 4.
                remaining = [n for n, _ in arms if n not in done and n != name]
                click.echo(err=True)
                click.echo(f"ERROR: --source all stopped at {name!r}.", err=True)
                click.echo(
                    f"  written this run: {', '.join(done) if done else '(none)'}",
                    err=True,
                )
                click.echo(
                    f"  not reached: {', '.join(remaining) if remaining else '(none)'}",
                    err=True,
                )
                click.echo(
                    "  data/published/ now holds two refresh dates. Fix the cause, "
                    "then re-run the arms above with --source, or --source all again.",
                    err=True,
                )
                raise
            done.append(name)
            click.echo()
        click.echo("OK: all sources refreshed")
    else:
        click.echo(f"ERROR: unknown source {source!r}", err=True)
        sys.exit(2)


def _is_real_estat_cube(payload: dict) -> bool:
    """True only for a genuine Eurostat ND-cube body.

    Eurostat answers **200 OK with an error payload** on rate-limit and on
    invalid params, so the status code alone proves nothing. A real response
    always carries BOTH `dimension` (what was asked for) and `value` (what came
    back), and both must be present — accepting either lets a body with a
    `value` key and no dimensions through. It must also be non-empty: a 200
    with `value: {}` is a failed query, not a small dataset
    (docs/data-sources.md §"Body-checked link validation").
    """
    return (
        isinstance(payload, dict)
        and "dimension" in payload
        and "value" in payload
        and bool(payload.get("value"))
    )


def _refresh_hicp(out: Path, geo: str, since_year: int, skip_link_check: bool, as_of: date) -> None:
    """The HICP arm: 13 ECOICOP ver.2 divisions + their groups.

    Everything comes from ver.2 cubes keyed by `coicop18` — `prc_hicp_minr`
    for the index and the rate, `prc_hicp_iw` for the weights — so a code's
    weight, rate, index, label and verify link all describe the same bucket.
    The classification-agreement gate proves it rather than assuming it.

    Two release shapes reach this arm. A full release carries every code at the
    same month and writes both payloads. A **flash** carries the all-items rate
    alone, two weeks early, and writes the headline only — `is_flash` below
    detects which one arrived by looking at the cube, and says what that costs
    the three gates whose inputs the flash does not include.
    """
    try:
        click.echo(f"→ fetching item weights ({IW_DATASET}, latest year) for {geo}...")
        weights_cube = fetch_hicp_weights_bg(geo=geo, last_periods=1)
        weights_year = max(str(r["time"]) for r in weights_cube.rows)
        group_codes = group_codes_in_basket(weights_cube)
        click.echo(
            f"  got {len(weights_cube.rows)} weight rows · vintage {weights_year} · "
            f"{len(group_codes)} groups in BG's basket"
        )

        codes = [*CP_DIVISIONS, *group_codes]

        click.echo(f"→ fetching annual rates ({MINR_DATASET} RCH_A, last 12 months)...")
        rate_cube = fetch_hicp_rates_bg(geo=geo, last_periods=12, codes=["CP00", *codes])
        click.echo(f"  got {len(rate_cube.rows)} rows")

        click.echo(f"→ fetching monthly index ({MINR_DATASET} I15, since {since_year})...")
        index_cube = fetch_hicp_index_bg(geo=geo, since_year=since_year, codes=["CP00", *codes])
        click.echo(f"  got {len(index_cube.rows)} rows")
    except httpx.HTTPError as e:
        click.echo(f"ERROR: network failure: {e}", err=True)
        sys.exit(4)
    except ValueError as e:
        click.echo(f"ERROR: upstream response failed its shape check: {e}", err=True)
        sys.exit(2)

    latest_weight_rows = {
        r["coicop"]: float(r["value"]) / 10.0  # per-thousand → percent
        for r in weights_cube.rows
        if str(r["time"]) == weights_year
    }
    weights_total = sum(latest_weight_rows.get(cp, 0.0) for cp in CP_DIVISIONS)
    click.echo(
        f"  weights sum ({CP_DIVISIONS[0]}..{CP_DIVISIONS[-1]}): "
        f"{weights_total:.4f}% (expected 100.0)"
    )
    # Checked here, before the transform, because a basket that doesn't sum is
    # an input-shape failure (exit 2) — and because a division whose weight is
    # wrong enough produces a group share above 100% of its parent, which
    # would otherwise surface as a pydantic traceback instead of this sentence.
    if abs(weights_total - 100.0) > 0.5:
        click.echo(
            f"ERROR: basket weights sum to {weights_total:.4f}%, expected 100.0% "
            f"(Eurostat may have changed the {IW_DATASET} cube layout)",
            err=True,
        )
        sys.exit(2)

    # ---- gate 1: the two cubes must mean the same thing by each code -------
    try:
        click.echo(
            f"→ gate: classification agreement ({len(codes)} codes × "
            f"{IW_DATASET} vs {MINR_DATASET})..."
        )
        validate_classification_agreement(
            codes=codes,
            weight_labels=weights_cube.labels,
            rate_labels=rate_cube.labels,
            weights_dim=weights_cube.dim,
            rates_dim=rate_cube.dim,
        )
        validate_meta_labels_cover(codes, COICOP_META)
    except ValidationError as e:
        click.echo(f"GATE FAILED: {e}", err=True)
        sys.exit(3)

    try:
        cats = rows_to_category_observations(
            index_cube,
            rate_cube,
            latest_weight_rows,
            as_of=as_of,
            group_codes=group_codes,
        )
    except ValueError as e:
        click.echo(f"ERROR: transform failed: {e}", err=True)
        sys.exit(2)

    if len(cats) != len(CP_DIVISIONS):
        click.echo(
            f"ERROR: expected {len(CP_DIVISIONS)} COICOP divisions, got {len(cats)} "
            f"(Eurostat may have changed their cube layout)",
            err=True,
        )
        sys.exit(2)

    cp00_rows = sorted(
        (r for r in rate_cube.rows if r["coicop"] == "CP00"),
        key=lambda r: r["time"],
    )
    headline_row = cp00_rows[-1] if cp00_rows else None
    if headline_row is None:
        click.echo("ERROR: CP00 (TOTAL) headline missing from rate response", err=True)
        sys.exit(2)
    headline_rate = float(headline_row["value"])
    headline_period = str(headline_row.get("time", ""))

    # The index series keyed by PERIOD, not by year — the chain gate needs the
    # December link month itself, which a year-end map keyed by year cannot
    # name.
    raw_index: dict[str, dict[str, float]] = {}
    for r in index_cube.rows:
        raw_index.setdefault(r["coicop"], {})[str(r["time"])] = float(r["value"])

    # Eurostat publishes the all-items rate for a month about two weeks before
    # the full release, and that flash estimate carries TOTAL alone: no
    # divisions, no index, nothing else in the cube for that month. So the
    # freshest CP00 rate can be a month ahead of everything it is normally
    # published beside.
    #
    # Detected from the DATA, never from a date or a flag. A calendar rule
    # ("the last week of the month is flash season") is wrong the first time
    # Eurostat moves a release, and it would be wrong SILENTLY — the run would
    # take the flash branch on a full cube and skip three gates that had their
    # inputs all along. The two conditions below cannot both hold on a full
    # release, because a full release is what puts that month into the index
    # cube and into the divisions' rates.
    #
    # The second condition names CP01..CP13 and nothing else. Neither fetch
    # filters by code upstream — both bring back the whole BG cube — so
    # `rate_cube.rows` also carries Eurostat's own aggregates (FOOD, NRG, SERV,
    # TOT_X_NRG and the rest), and the flash publishes THOSE at the flash month.
    # "Any code other than CP00 has this month" is therefore true on a flash,
    # and the run would go down the full-release path and die on gate 2. The
    # divisions are the right set to ask about: they are what
    # hicp_categories.json is built from, and what the three skipped gates read.
    divisions = set(CP_DIVISIONS)
    division_rate_periods = {str(r["time"]) for r in rate_cube.rows if r["coicop"] in divisions}
    is_flash = (
        headline_period not in raw_index.get("CP00", {})
        and headline_period not in division_rate_periods
    )
    if is_flash:
        click.echo(
            f"  FLASH: {headline_period} carries CP00 alone — the divisions and the "
            f"index are still at {max(division_rate_periods, default='?')}"
        )

    # The all-items index alongside the rate. `raw_index["CP00"]` is the same
    # TOTAL series the chain gate consumes, so this adds no fetch and cannot
    # drift from what that gate checked.
    #
    # It goes through `index_fields` — the SAME helper every division uses —
    # rather than a local copy of the selection rules. Two implementations of
    # "which reading is this year's" in two places is how the numerator and the
    # denominator of a since-year division end up describing different months,
    # which is the one failure `math.md` invariant #1 exists to prevent and the
    # one a 12-month rate cannot reveal.
    #
    # Computed above the gates because gate 7 reads `total_latest["time"]` —
    # the month that actually reaches the payload. Re-deriving "the freshest
    # index month" for the gate would let the gate pass on a month the publish
    # step never writes.
    cp00_index_rows = [
        {"time": t, "value": v} for t, v in sorted(raw_index.get("CP00", {}).items())
    ]
    if not cp00_index_rows:
        click.echo("ERROR: CP00 (TOTAL) index missing from index response", err=True)
        sys.exit(2)
    try:
        total_by_year, total_latest, _ = index_fields(cp00_index_rows, "CP00")
    except MissingSeriesError as e:
        click.echo(f"ERROR: transform failed on the all-items index: {e}", err=True)
        sys.exit(2)

    try:
        if is_flash:
            # Gates 2, 3 and 4 do not run here because their inputs do not
            # exist for this month — not because a flash release is trusted
            # more than a full one.
            #
            # Chain reconciliation rebuilds the all-items index at ref_period
            # out of the divisions' indices, and the flash publishes no index
            # at all, for TOTAL or for anyone else. Basket sum compares Σ(w·r)
            # against the headline, and on a flash those are two different
            # months: the older basket against the newer headline reads the
            # release itself as a break, and measured on BG's 2026-07 flash
            # that is 5.2 against 4.1 — more than twice the tolerance. Group
            # consistency checks a categories payload this path does not write.
            #
            # Gates 1, 5 and 6 DO have their inputs, and still run below: they
            # describe the cube the headline was drawn from, and a flash run
            # that finds that cube broken must not publish off it either.
            click.echo(
                "→ gates: chain reconciliation, basket sum, group consistency "
                "SKIPPED — no index and no divisions at the flash month to feed them"
            )
        else:
            click.echo(
                f"→ gate: chain reconciliation (divisions rebuild the all-items index, "
                f"±{CHAIN_TOLERANCE_PP} pp)..."
            )
            validate_chain_reconciliation(
                categories=list(cats.values()),
                total_index_by_period=raw_index.get("CP00", {}),
                division_index_by_period=raw_index,
                ref_period=headline_period,
                weights_year=weights_year,
            )

            click.echo(
                f"→ gate: basket sum (Σ(w·r) near headline, ±{BASKET_SUM_TOLERANCE_PP} pp)..."
            )
            validate_reconciliation(list(cats.values()), headline_rate)

            click.echo("→ gate: group consistency (each division's groups sum to it)...")
            validate_group_consistency(list(cats.values()))

        # Runs on BOTH release shapes, because both can carry a wrong marker
        # and the wrong one is invisible on screen either way: an unmarked
        # flash reads as settled, and a marked full release hedges a figure
        # Eurostat has finalised. It is the only gate here that checks what
        # the payload SAYS about itself rather than what its figures are.
        click.echo("→ gate: flash marker (is_flash agrees with the two published months)...")
        validate_headline_flash(
            ref_period=headline_period,
            latest_index_time=str(total_latest["time"]),
            flash=is_flash,
        )

        # Coverage gate requires every CP to have every COMPLETED year.
        # A year is "completed" only if its December reading has been
        # published — the as_of year itself is partial mid-year and
        # rows_to_yearly_index drops it. Requiring [as_of.year] would
        # be a permanent gate fail for ~11 months of every year.
        completed_years = list(range(since_year, as_of.year))
        click.echo(
            f"→ gate: coverage (every division AND group, every completed year "
            f"{since_year}→{as_of.year - 1}; partial {as_of.year} excluded)..."
        )
        validate_coverage(list(cats.values()), years=completed_years)

        if not skip_link_check:
            # Both extracts per division, and both for one representative
            # group per division. Which URLs are covered is load-bearing: the
            # SPA renders `api_url_index` as its "↗" at a year anchor, and
            # every group row carries its own pair, so checking `api_url`
            # alone would skip the links the reader actually clicks.
            #
            # Sampling one group per division rather than all 46 keeps the
            # refresh at 39 extra calls instead of 105: the group URLs are
            # built by the same two functions as the divisions', so a shape
            # change breaks them together, and a per-code failure would already
            # have tripped the classification gate.
            urls: list[str] = []
            for c in cats.values():
                urls += [str(c.api_url), str(c.api_url_index)]
                if c.groups:
                    g = c.groups[0]
                    urls += [str(g.api_url), str(g.api_url_index)]
            click.echo(
                f"→ gate: link status ({len(urls)} URLs — both extracts "
                f"per division plus a sampled group, body inspection)..."
            )
            validate_link_status(urls, _is_real_estat_cube)
        else:
            click.echo("→ gate: link status SKIPPED (--skip-link-check)")
    except ValidationError as e:
        click.echo(f"GATE FAILED: {e}", err=True)
        sys.exit(3)

    click.echo(f"→ publishing to {out}/")
    if is_flash:
        # hicp_categories.json is left exactly as it is on disk, byte for byte.
        # Rewriting it with June's figures would move its `as_of` forward while
        # every number inside it stayed the same — a payload dated fresher than
        # anything it carries, and the site's data panel reads `as_of` to decide
        # whether a row is up to date.
        click.echo(f"  {HICP_CATEGORIES_FILE} left untouched — the flash has no divisions")
    else:
        write_hicp_categories(
            cats,
            as_of=as_of,
            target_dir=out,
            weights_year=weights_year,
            # One cube, one call, one month: the same period the headline reports.
            # On the envelope so a consumer can date the payload without reading
            # into `categories[]`.
            ref_period=headline_period,
        )
    # `total_latest` is the freshest month in the INDEX cube, which on a flash
    # is the month before the headline's. That gap is the point: the June index
    # is a figure Eurostat has published, and carrying it keeps the savings card
    # on Eurostat's own chain-linked all-items series. Dropping the key instead
    # would send the SPA down its fallback, which rebuilds the cumulative from
    # the divisions at current weights — 41.8% where the official index gives
    # 39.9%, about €960 per €100k, under prose that tells the reader the index
    # failed to load. Each field states its own month; nothing here is derived.
    write_hicp_headline(
        as_of=as_of,
        headline_rate_pct=headline_rate,
        ref_period=headline_period,
        target_dir=out,
        index_by_year=total_by_year,
        latest_index=total_latest,
        flash=is_flash,
    )

    if is_flash:
        click.echo(
            f"OK: wrote {HICP_HEADLINE_FILE} only (flash headline {headline_rate}% / "
            f"{headline_period}; index still {total_latest['time']}) — "
            f"{HICP_CATEGORIES_FILE} untouched"
        )
        return

    n_groups = sum(len(c.groups) for c in cats.values())
    click.echo(
        f"OK: wrote {HICP_CATEGORIES_FILE} ({len(cats)} divisions + {n_groups} "
        f"groups, {weights_year} weights) + {HICP_HEADLINE_FILE} "
        f"(headline {headline_rate}% / {headline_period})"
    )


def _refresh_unemployment(out: Path, geo: str, as_of: date) -> None:
    try:
        click.echo(f"→ fetching unemployment (une_rt_m, monthly) for {geo}...")
        rows = fetch_unemployment_bg(geo=geo)
        click.echo(f"  got {len(rows)} rows")
    except httpx.HTTPError as e:
        click.echo(f"ERROR: network failure: {e}", err=True)
        sys.exit(4)

    try:
        obs = rows_to_unemployment_observation(rows, as_of=as_of)
    except ValueError as e:
        click.echo(f"ERROR: transform failed: {e}", err=True)
        sys.exit(2)

    write_time_series(
        payload_name="unemployment",
        series=obs,
        target_dir=out,
        filename=UNEMPLOYMENT_FILE,
        notes=(
            f"BG unemployment rate, monthly, seasonally adjusted, total × "
            f"both sexes × 15-74, % of the labour force. "
            f"Latest: {obs.value:.1f}% at {obs.ref_period}."
        ),
    )
    click.echo(f"OK: wrote {UNEMPLOYMENT_FILE} (latest {obs.value:.1f}% at {obs.ref_period})")


def _refresh_city_price(out: Path, as_of: date) -> None:
    """Read imot.bg's sredni-ceni pages for all 27 cities and publish city_price.json.

    One current fetch plus one per historical year per city — around 650
    requests, roughly two and a half minutes at the 200 ms spacing below.
    imot.bg showed no throttling on a 100-request burst during the probe; the
    spacing is politeness rather than a measured requirement.

    Failure modes:
    - Network/timeout/transport on a city's CURRENT fetch -> that city is
      skipped with a WARNING, and the run continues. A 403 is the expected
      shape of this from anywhere but an ordinary Bulgarian connection.
    - Every city failing -> exit 4. That is the datacenter-IP case, and
      reporting it as a partial publish would be misleading.
    - A page-layout change, a rentals page, a fractional value or a count below
      that city's district floor -> that city is skipped with a WARNING. These
      are per-city because imot.bg serve 27 independent pages and one of them
      changing shape is not a reason to withhold the other 26.
    - The payload gate -> exit 3.
    - A per-year historical fetch failing -> that year is omitted. A year imot.bg
      has no data for fails exactly this way, which is why the archive walk goes
      back to `_ARCHIVE_EARLIEST_YEAR` and lets the misses fall out rather than
      holding a per-city start year that would go stale.

    There is NO canonical fallback for a EUR/m2 level — no official BG series
    publishes an absolute one — so a city absent from this file renders its
    price card empty rather than borrowing another city's figure.
    """
    cities: list[dict] = []
    skipped: list[str] = []
    blocked = 0
    for region in PRICED_REGIONS:
        try:
            current = fetch_city_prices(region)
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (403, 429):
                blocked += 1
            skipped.append(region.code)
            click.echo(f"WARNING: {region.code}: {e}; skipping this city.", err=True)
            continue
        except (httpx.HTTPError, ValueError) as e:
            skipped.append(region.code)
            click.echo(f"WARNING: {region.code}: {e}; skipping this city.", err=True)
            continue

        historical: list[dict] = []
        for year in range(_ARCHIVE_EARLIEST_YEAR, as_of.year):
            time.sleep(_IMOT_REQUEST_SPACING_S)
            try:
                historical.append(fetch_city_prices_for_year(region, year))
            except (httpx.HTTPError, ValueError):
                # Overwhelmingly this is "imot.bg has no data for that year",
                # which is the archive's own shape rather than a fault. Only the
                # per-city summary below is worth an operator's attention.
                continue

        row = build_city_row(region, current, historical, as_of.year)
        cities.append(row)
        click.echo(
            f"  {region.code}: {row['eur_per_m2_median']} EUR/m2, "
            f"{row['n_districts']} districts, {len(row['historical'])} years"
            f"{' (no trend)' if not row['trend_publishable'] else ''}"
        )
        time.sleep(_IMOT_REQUEST_SPACING_S)

    if not cities:
        click.echo(
            f"ERROR: no city page could be read ({blocked} of {len(PRICED_REGIONS)} "
            f"were blocked). www.imot.bg answers datacenter IPs with a 403, so run "
            f"this arm from an ordinary Bulgarian connection — never through a "
            f"proxy (docs/legal.md, AGENTS.md).",
            err=True,
        )
        sys.exit(4)

    try:
        validate_city_price(cities, [r.code for r in PRICED_REGIONS])
    except ValidationError as e:
        click.echo(f"ERROR: city price gate failed: {e}", err=True)
        sys.exit(3)

    payload = build_city_price_payload(as_of, cities, [r.code for r in PRICED_REGIONS])
    write_payload(payload, target_dir=out, filename=CITY_PRICE_FILE)
    click.echo(
        f"OK: wrote {CITY_PRICE_FILE} ({len(cities)} cities"
        f"{f', {len(skipped)} skipped: ' + ', '.join(skipped) if skipped else ''})"
    )


def _refresh_region_salary(out: Path, as_of: date) -> None:
    """Fetch the NSI regional wage XLSX (both editions) and publish region_salary.json.

    Failure modes:
    - Network/timeout/transport -> exit 4 (consistent with other refresh arms;
      the comparator card falls back to a sentinel if the JSON is missing on
      read).
    - XLSX sheet missing / structure changed / an oblast row renamed or added /
      the two editions disagreeing -> exit 2. The three-part regression guard
      inside the connector raises `ValueError`, which also exits 2 here.
    - The payload gate -> exit 3.

    Both editions are fetched together because the oblast NAMES are half of
    what this payload is for: a picker has to print them, and a run that got
    only the English file would have to invent the Bulgarian - which is the one
    thing this feature must not do.

    There is NO canonical fallback for a regional average wage. The comparator
    falls back to the last-published region_salary.json if available, and to a
    placeholder if not.
    """
    try:
        click.echo("\u2192 fetching NSI regional wage XLSX (EN + BG editions)...")
        scrape = fetch_region_salaries_eu()
        top = max(scrape["regions"], key=lambda r: r["value_eur"])
        click.echo(
            f"  got {len(scrape['regions'])} oblasti at {scrape['ref_period']}"
            f"{' (preliminary)' if scrape['is_preliminary'] else ''}; "
            f"highest {top['en_name']} {top['value_eur']:.0f} EUR"
        )
    except httpx.HTTPError as e:
        click.echo(f"ERROR: NSI regional XLSX fetch failed: {e}", err=True)
        sys.exit(4)
    except ValueError as e:
        click.echo(f"ERROR: NSI regional XLSX parse failed: {e}", err=True)
        sys.exit(2)

    try:
        validate_region_salary(scrape["regions"], scrape["ref_period"], [r.code for r in REGIONS])
    except ValidationError as e:
        click.echo(f"ERROR: regional wage gate failed: {e}", err=True)
        sys.exit(3)

    payload = build_region_salary_payload(
        scrape,
        as_of=as_of,
        source_url=NSI_REGION_SALARY_URL,
        source_url_bg=NSI_REGION_SALARY_URL_BG,
    )
    write_payload(payload, target_dir=out, filename=REGION_SALARY_FILE)
    click.echo(
        f"OK: wrote {REGION_SALARY_FILE} "
        f"({len(payload['regions'])} oblasti at {payload['ref_period']})"
    )


def _refresh_sector_salary(out: Path, as_of: date) -> None:
    """Fetch НСИ's by-activity wage table (both editions) and publish it.

    Failure modes match `_refresh_region_salary`: exit 4 on network, exit 2 on a
    changed sheet structure or a tripped connector guard, exit 3 on the payload
    gate. The two editions are fetched together because the section names are
    half the payload, and a run that got only one of them would have to invent
    the other language — which is the one thing this feature must not do.

    There is no fallback. The picker is absent rather than wrong if the file is
    missing, the same posture the Sofia comparator takes.
    """
    try:
        click.echo("→ fetching NSI by-activity wage XLSX (EN + BG editions)...")
        scrape = fetch_sector_salary_eu()
        click.echo(
            f"  got {len(scrape['sectors'])} activities at {scrape['ref_period']}"
            f"{' (preliminary)' if scrape['is_preliminary'] else ''}"
        )
    except httpx.HTTPError as e:
        click.echo(f"ERROR: NSI by-activity XLSX fetch failed: {e}", err=True)
        sys.exit(4)
    except ValueError as e:
        click.echo(f"ERROR: NSI by-activity XLSX parse failed: {e}", err=True)
        sys.exit(2)

    try:
        validate_sector_salary(scrape["sectors"], scrape["ref_period"])
    except ValidationError as e:
        click.echo(f"ERROR: sector wage gate failed: {e}", err=True)
        sys.exit(3)

    payload = build_sector_salary_payload(
        scrape,
        as_of=as_of,
        source_url=SECTOR_SOURCE_URL_EN,
        source_url_bg=SECTOR_SOURCE_URL_BG,
    )
    write_payload(payload, target_dir=out, filename=SECTOR_SALARY_FILE)
    top = max(scrape["sectors"][1:], key=lambda s: s["value_eur"])
    click.echo(
        f"OK: wrote {SECTOR_SALARY_FILE} "
        f"({len(scrape['sectors'])} activities at {scrape['ref_period']}; "
        f"highest {top['en_name']} {top['value_eur']:.0f} EUR)"
    )


def _refresh_salary_dist(out: Path, as_of: date) -> None:
    """Build salary_dist.json — the individual gross-earnings shape, Eurostat only.

    One upstream, and no cross-dependency on the НСИ arm: the shape is
    Eurostat's and is published at Eurostat's level. The re-levelling happens in
    the reader's browser, against НСИ's national all-activities average as
    `sector_salary.json` publishes it.

    Failure modes mirror the other Eurostat arms: network → exit 4,
    transform/parse → exit 2.
    """
    try:
        click.echo("→ fetching SES individual earnings shape (earn_ses_monthly)...")
        ses = fetch_ses_earnings_bg()
        click.echo(
            f"  SES {ses['ref_year']}: D1 €{ses['d1']:.0f} · median "
            f"€{ses['median']:.0f} · mean €{ses['mean']:.0f} · D9 €{ses['d9']:.0f}"
        )
    except httpx.HTTPError as e:
        click.echo(f"ERROR: network failure: {e}", err=True)
        sys.exit(4)

    try:
        shape = build_ses_shape_ladder(ses)
    except ValueError as e:
        click.echo(f"ERROR: transform failed: {e}", err=True)
        sys.exit(2)

    write_salary_distribution_payload(as_of=as_of, ses=ses, shape=shape, target_dir=out)
    lg = shape["ladder_ses"]
    click.echo(
        f"OK: wrote {SALARY_DIST_FILE} (SES-level median €{lg['P50']:.0f} · "
        f"P10 €{lg['P10']:.0f} · P90 €{lg['P90']:.0f}; the browser re-levels "
        f"this to НСИ's national average, which stays in sector_salary.json)"
    )


def _refresh_payroll(out: Path, as_of: date) -> None:
    """Build payroll.json from the dated legislative table.

    No network: the BG payroll parameters (contribution rates, flat tax,
    max insurable income, minimum wage) are legislative constants with no
    machine-readable feed, so they live in `payroll.py` as a dated table.
    Publishing them makes the SPA's gross→net math data-driven instead of
    hardcoded — to reflect a law change, edit the table and re-run this.
    """
    click.echo("→ building payroll.json (BG payroll parameters)...")
    payload = build_payroll_payload(as_of)
    write_payload(payload, target_dir=out, filename=PAYROLL_FILE)
    r = payload["employee_contrib_rates"]["total"]
    click.echo(
        f"OK: wrote {PAYROLL_FILE} (employee {r * 100:.2f}% + "
        f"{payload['income_tax_rate'] * 100:.0f}% tax, cap "
        f"€{payload['max_insurable_income_eur']:.2f}, min wage "
        f"€{payload['min_wage_gross_eur']:.2f}, effective "
        f"{payload['effective_year']})"
    )


def _refresh_mortgage(out: Path, as_of: date) -> None:
    """Refresh `mortgage.json` — the two-tier BG mortgage panel.

    Both tiers are official and both MUST succeed; there is no best-effort
    tier and nothing degrades silently. A user deciding on a home loan gets
    a correct number or an error, never a plausible-looking guess.

      new_business      ECB MIR, households, house purchase (A2C):
                        AAR + APRC + volume, BGN spliced to EUR at 2026-01.
      outstanding_stock BNB housing-loan book (s_ir_loan_oa_hh_bg.xlsx).

    Then the gates in `mortgage.py`: plausibility bounds, APRC ≥ AAR,
    freshness, and the BNB-vs-ECB agreement check on the outstanding book.

    Exits: 4 on network/TLS, 2 on a changed upstream shape, 3 on a gate.
    """
    # ---- 1. ECB MIR new business (headline tier) ------------------------
    try:
        click.echo("→ fetching ECB MIR new business (BG households, house purchase)...")
        aar_bgn = fetch_mir_series(SERIES_KEYS["new_business_aar_bgn"])
        aar_eur = fetch_mir_series(SERIES_KEYS["new_business_aar_eur"])
        aprc_bgn = fetch_mir_series(SERIES_KEYS["new_business_aprc_bgn"])
        aprc_eur = fetch_mir_series(SERIES_KEYS["new_business_aprc_eur"])
        vol_bgn = fetch_mir_series(SERIES_KEYS["new_business_volume_bgn"])
        vol_eur = fetch_mir_series(SERIES_KEYS["new_business_volume_eur"])
        click.echo("→ fetching ECB MIR outstanding stock (for the cross-check gate)...")
        ecb_out = fetch_mir_series(SERIES_KEYS["outstanding_aar_eur"])
    except httpx.HTTPError as e:
        click.echo(f"ERROR: ECB MIR fetch failed: {e}", err=True)
        sys.exit(4)
    except ValueError as e:
        # Includes the "filter did not apply" / "wrong series returned"
        # guards: an ignored filter must never pass for real data.
        click.echo(f"ERROR: ECB MIR response shape/identity check failed: {e}", err=True)
        sys.exit(2)

    # BG was a BGN country until 2026-01-01; splice so the history is "the
    # rate in the currency of the day" rather than a pre-2026 EUR niche.
    aar = splice_at_euro_changeover(aar_bgn, aar_eur)
    aprc = splice_at_euro_changeover(aprc_bgn, aprc_eur)
    volume = splice_at_euro_changeover(vol_bgn, vol_eur)
    click.echo(
        f"  AAR {len(aar)} months (BGN→EUR spliced at {EURO_SWITCH_PERIOD}), "
        f"APRC {len(aprc)}, volume {len(volume)}"
    )

    # ---- 2. BNB outstanding housing-loan book ---------------------------
    try:
        click.echo("→ fetching BNB housing-loan XLSX (outstanding stock, EUR)...")
        bnb_rows = fetch_housing_stock_rate_bg()
        click.echo(f"  got {len(bnb_rows)} monthly rows")
    except httpx.HTTPError as e:
        click.echo(
            f"ERROR: BNB fetch failed: {e}\n"
            f"       If this is a TLS 'unable to get local issuer certificate' "
            f"error, see docs/data-sources.md §'BNB TLS setup'.",
            err=True,
        )
        sys.exit(4)
    except ValueError as e:
        click.echo(f"ERROR: BNB XLSX layout changed: {e}", err=True)
        sys.exit(2)

    bnb_series = {r["period"]: r["rate_pct"] for r in bnb_rows}
    bnb_volume = {r["period"]: r["volume_eur_m"] for r in bnb_rows if r["volume_eur_m"] is not None}

    # ---- 3. Gates -------------------------------------------------------
    try:
        click.echo("→ gate: rate plausibility bounds + series completeness...")
        validate_rate_series(aar, "ECB MIR new business AAR")
        validate_rate_series(aprc, "ECB MIR new business APRC")
        validate_rate_series(bnb_series, "BNB outstanding housing stock")
        validate_rate_series(ecb_out, "ECB MIR outstanding (cross-check)")

        click.echo("→ gate: APRC ≥ AAR (fees cannot be negative)...")
        validate_aprc_above_aar(aar, aprc)

        aar_ref = latest_period(aar)
        bnb_ref = latest_period(bnb_series)
        click.echo("→ gate: freshness (both tiers within the publication lag)...")
        validate_freshness(aar_ref, as_of, "ECB MIR new business")
        validate_freshness(bnb_ref, as_of, "BNB outstanding stock")

        click.echo("→ gate: BNB vs ECB MIR agree on the outstanding book...")
        ecb_out_ref = latest_period(ecb_out)
        cross = cross_check_outstanding(
            bnb_pct=bnb_series[bnb_ref],
            ecb_pct=ecb_out[ecb_out_ref],
        )
        click.echo(
            f"  BNB {cross['bnb_outstanding_pct']}% vs ECB "
            f"{cross['ecb_mir_outstanding_pct']}% → Δ {cross['delta_pp']} pp "
            f"(tolerance {cross['tolerance_pp']} pp)"
        )
    except MortgageValidationError as e:
        click.echo(f"GATE FAILED: {e}", err=True)
        sys.exit(3)

    # ---- 4. Publish ------------------------------------------------------
    aprc_ref = latest_period(aprc)
    new_business = {
        # «Нов бизнес» is wider than «нов кредит», and the gap is the reason
        # this string names it. БНБ's own methodological notes for лихвена
        # статистика: «Нов бизнес – всяко ново споразумение между клиента и
        # отчетната единица … Ново споразумение е и всяко предоговаряне на
        # лихвения процент, сроковете и/или други условия по вече съществуващ
        # договор». So a household that renegotiated the loan it already had is
        # inside this average, and the ECB keep a separate renegotiated-amounts
        # series precisely because new agreements and «fresh money» are not the
        # same population.
        "_role": (
            "what a home loan costs if you sign one now — the average across "
            "every bank in Bulgaria, weighted by what each of them lent, over "
            "the agreements signed in the reference month; a renegotiation of "
            "an existing loan is one of those agreements"
        ),
        "source": "ecb",
        "dataset": (
            f"MIR {SERIES_KEYS['new_business_aar_bgn']} (to "
            f"{_month_before(EURO_SWITCH_PERIOD)}) spliced with "
            f"{SERIES_KEYS['new_business_aar_eur']} (from {EURO_SWITCH_PERIOD})"
        ),
        "source_url": series_url(SERIES_KEYS["new_business_aar_eur"]),
        "ref_period": aar_ref,
        "value_pct": aar[aar_ref],
        "series_by_period": aar,
        # DATA_TYPE_MIR=R carries TWO concepts under one code, and the ECB's own
        # codelist name says so: «Annualised agreed rate (AAR) / Narrowly
        # defined effective rate (NDER)». Reg (EU) 1072/2013 lets each NCB pick
        # — «Instead of the annualised agreed rate, NCBs may require their
        # reporting agents to implement the narrowly defined effective rate» —
        # and БНБ describe theirs only as «ефективни годишни проценти», which
        # the ECB manual itself calls an ambiguous term. Both exclude charges
        # and both annualise, so the annuity is fed the right KIND of rate
        # either way; which of the two it is, is not something either publisher
        # has written down.
        "rate_basis": (
            "the MIR rate excluding charges (DATA_TYPE_MIR=R — the ECB name "
            "that code for the annualised agreed rate AND the narrowly defined "
            "effective rate, and neither publisher says which of the two "
            "Bulgaria reports), new business, households and NPISH, lending "
            "for house purchase, all initial rate-fixation periods — this is "
            "the interest rate the monthly payment is computed from"
        ),
        "aprc": {
            # The APRC is the total cost of the CREDIT, not of the purchase,
            # and the boundary is drawn by the two Directives it is defined in
            # rather than by what a buyer pays out. The ECB's MIR manual lists
            # it: interest, commissions, taxes and any other fees the consumer
            # must pay in connection with the credit agreement «except for
            # notarial costs», compulsory ancillary services such as insurance,
            # and the valuation «but excluding registration fees for the
            # transfer of ownership of the immovable property». A Bulgarian
            # buyer pays the notary and the transfer registration, and neither
            # is in this figure.
            "_role": (
                "the same agreements' total cost of credit (ГПР in Bulgarian) "
                "— interest plus the charges the bank requires in order to "
                "lend. The notary and the fee for registering the transfer of "
                "ownership are outside it by the Directives that define it"
            ),
            "dataset": (
                f"MIR {SERIES_KEYS['new_business_aprc_bgn']} spliced with "
                f"{SERIES_KEYS['new_business_aprc_eur']}"
            ),
            "source_url": series_url(SERIES_KEYS["new_business_aprc_eur"]),
            "ref_period": aprc_ref,
            "value_pct": aprc[aprc_ref],
            "series_by_period": aprc,
            # The counterparty sector is 2250 on this key exactly as it is on
            # the AAR key beside it, and 2250 is «Households and non-profit
            # institutions serving households (S.14 and S.15)». Naming only
            # households on one of the two describes a narrower population than
            # the series key asks for, in the file whose job is to say which
            # series each figure came from.
            "rate_basis": (
                "annual percentage rate of charge (APRC), new business, "
                "households and NPISH, lending for house purchase"
            ),
        },
        "monthly_volume": {
            "_role": (
                "how much was lent in the reference month; the evidence for "
                "the BGN→EUR splice (pre-2026 EUR lending was a ~36 m/month "
                "niche, post-2026 it is the whole ~600 m/month market)"
            ),
            "dataset": f"MIR {SERIES_KEYS['new_business_volume_eur']}",
            "source_url": series_url(SERIES_KEYS["new_business_volume_eur"]),
            "unit": "millions, currency of the period",
            "ref_period": latest_period(volume),
            "value": volume[latest_period(volume)],
            "series_by_period": volume,
        },
        "currency": "EUR",
        "currency_history": (
            f"BGN through {_month_before(EURO_SWITCH_PERIOD)}, EUR from "
            f"{EURO_SWITCH_PERIOD} (BG adopted the euro on 2026-01-01)"
        ),
        "methodology_change": ECB_EURO_SPLICE_NOTE,
    }

    outstanding_stock = {
        # Two boundaries a reader would not guess from «жилищни кредити», both
        # БНБ's own. The purpose covers more than buying: «кредити, предоставени
        # на домакинствата с цел инвестиране в жилища за собствено ползване или
        # наем, включително за строителство и за подобрения на жилища» — so
        # building and improving are inside it, while a consumer loan secured on
        # a home is counted under consumption instead. And the stock leaves out
        # «кредитите, които са необслужвани или преструктурирани с мерки, които
        # … водят до снижаване на лихвения процент под пазарното ниво», so it is
        # not an average over every household still repaying something.
        "_role": (
            "what a housing loan already on the books averages, across every "
            "vintage in the ~€18 bn book — NOT what a new borrower is quoted "
            "today. БНБ's housing purpose covers building and improving a home "
            "as well as buying one, and leaves out loans that are "
            "non-performing or restructured below market rates"
        ),
        "source": "bnb",
        "dataset": (
            "s_ir_loan_oa_hh_bg.xlsx, sheet LOAN_OA_HH, "
            "Жилищни кредити (housing loans) × в евро (EUR) × maturity total"
        ),
        "source_url": BNB_SOURCE_URL,
        "ref_period": bnb_ref,
        "value_pct": bnb_series[bnb_ref],
        "series_by_period": bnb_series,
        "book_volume_eur_m": bnb_volume.get(bnb_ref),
        "currency": "EUR",
        "rate_basis": (
            "annual rate on the outstanding stock of EUR housing loans to "
            "households and NPISH, weighted by the balances at the end of the "
            "month — includes older vintages still being amortised, so it "
            "moves slowly and lags new-business rates"
        ),
        "methodology_change": BNB_METHODOLOGY_CHANGE_NOTE,
    }

    write_mortgage_payload(
        as_of=as_of,
        new_business=new_business,
        outstanding_stock=outstanding_stock,
        cross_check=cross,
        lending_limits=lending_limits_at(as_of),
        target_dir=out,
    )
    click.echo(
        f"OK: wrote {MORTGAGE_FILE} — "
        f"new_business AAR={aar[aar_ref]}% / APRC={aprc[aprc_ref]}% ({aar_ref}), "
        f"outstanding_stock={bnb_series[bnb_ref]}% ({bnb_ref})"
    )


if __name__ == "__main__":
    main()


def _refresh_house_market(out: Path, geo: str, skip_link_check: bool, as_of: date) -> None:
    """Publish `house_market.json` and `house_market_structure.json`.

    **One arm, two files, and that is a CI contract rather than a convenience.**
    `refresh.yml` decides which payloads an arm owns by matching stems against
    the `--source` name with hyphens swapped for underscores, so a second arm
    writing a differently-prefixed file would find nothing of its own changed,
    skip the commit and the PR, and report the run green while the payload never
    published. Both stems start with `house_market`, so both are this arm's.

    They are two files rather than one because they move on different clocks.
    The transaction cubes are quarterly; tenure and overburden are annual
    EU-SILC and the dwelling stock is the 2021 census. A single payload's
    freshness row would have to date a quarterly series and a five-year-old
    census at once, and could do neither honestly.
    """
    try:
        click.echo(f"→ fetching house sales, value and price index for {geo}...")
        count = fetch_house_sales_count_bg(geo=geo)
        value = fetch_house_sales_value_bg(geo=geo)
        index = fetch_house_price_index_bg(geo=geo)
        real_index = fetch_house_price_index_real_bg(geo=geo)
        click.echo(
            f"  got {len(count.rows)} count rows, {len(value.rows)} value rows, "
            f"{len(index.rows)} index rows, {len(real_index.rows)} deflated rows"
        )
        click.echo("→ fetching tenure, census stock, price-to-income, overburden...")
        structure = fetch_housing_structure_bg(geo=geo)
        click.echo(f"  got {sum(len(c.rows) for c in structure.values())} structure rows")
    except httpx.HTTPError as e:
        click.echo(f"ERROR: network failure: {e}", err=True)
        sys.exit(4)

    try:
        payload = build_house_market_payload(count, value, index, real_index, as_of)
        structure_payload = build_house_market_structure_payload(structure, as_of)
    except ValueError as e:
        click.echo(f"ERROR: transform failed: {e}", err=True)
        sys.exit(2)

    try:
        validate_house_market(payload)
        click.echo("  gate: avg_deal_eur reproduces from the published count and value")
        click.echo("  gate: both indices average 100 across their own base year")
        validate_house_market_structure(structure_payload)
        click.echo("  gate: the tenure split and the census stock are internally consistent")
        if not skip_link_check:
            # The `api_url`s, not the databrowser pages. Every one of these is
            # published so a reader can re-run the exact query behind a figure,
            # and a link that answers 200 with an error payload proves nothing —
            # which is why this checks the body, the same way the HICP arm does.
            validate_link_status(
                [
                    payload["deals"]["api_url"],
                    payload["value"]["api_url"],
                    payload["price_index"]["api_url"],
                    payload["price_index_real"]["api_url"],
                    structure_payload["tenure"]["api_url"],
                    structure_payload["census_dwellings"]["api_url"],
                    structure_payload["price_to_income"]["api_url"],
                    structure_payload["housing_cost_overburden"]["api_url"],
                ],
                _is_real_estat_cube,
            )
            click.echo("  gate: all eight published api_urls return a real cube")
    except ValidationError as e:
        click.echo(f"ERROR: validation failed: {e}", err=True)
        sys.exit(3)

    write_payload(payload, out, HOUSE_MARKET_FILE)
    write_payload(structure_payload, out, HOUSE_MARKET_STRUCTURE_FILE)

    latest = payload["ref_period"]
    deals = payload["deals"]["series_by_period"][latest]["total"]
    avg = payload["avg_deal_eur"]["latest"].get("total")
    rate = payload["price_index"]["annual_rate_pct"][payload["price_index"]["rate_ref_period"]]
    click.echo(
        f"OK: wrote {HOUSE_MARKET_FILE} ({deals:,.0f} dwellings sold at {latest}, "
        f"average deal {avg:,.0f} EUR, price index {rate.get('total')}% y/y)"
    )
    click.echo(
        f"OK: wrote {HOUSE_MARKET_STRUCTURE_FILE} "
        f"({structure_payload['tenure']['owner_pct']}% own, "
        f"{structure_payload['tenure']['owner_with_mortgage_pct']}% of them with a mortgage)"
    )


def _refresh_nsi_housing(out: Path, as_of: date) -> None:
    """Publish `nsi_housing.json` — НСИ's own housing price and sales changes.

    A second housing payload beside Eurostat's, and separate for a licence
    reason rather than a tidiness one: §2.1.1 forbids distributing производни и
    сборни произведения, so a file mixing НСИ's cells with Eurostat's would be a
    сборно произведение however carefully it were captioned. They meet in the
    reader's browser and never on disk.

    **The cross-publisher reconciliation runs here**, against the Eurostat
    payload already on disk. It is the strongest gate in the pipeline: the two
    are the same statistic reaching us by two routes, so a disagreement is a
    wrong quarter, a wrong column or a wrong purchase type on our side. It is
    skipped only when Eurostat's payload is absent — a checkout that has never
    run `--source house-market` — and says so rather than passing quietly.
    """
    try:
        click.echo("→ discovering НСИ's housing workbooks on their portal...")
        workbooks = {stem: fetch_housing_workbook(stem) for stem in HOUSING_WORKBOOKS}
        for stem, wb in workbooks.items():
            geos = len(wb["data"])
            click.echo(
                f"  {stem}.xlsx — {wb['role']}, {geos} geograph{'y' if geos == 1 else 'ies'}"
            )
    except httpx.HTTPError as e:
        click.echo(f"ERROR: network failure: {e}", err=True)
        sys.exit(4)
    except ValueError as e:
        click.echo(f"ERROR: НСИ's portal no longer lists a workbook: {e}", err=True)
        sys.exit(2)

    try:
        payload = build_nsi_housing_payload(workbooks, as_of)
    except ValueError as e:
        click.echo(f"ERROR: transform failed: {e}", err=True)
        sys.exit(2)

    try:
        validate_nsi_housing(payload)
        click.echo("  gate: every published figure is a cell НСИ published")
        estat_path = out / HOUSE_MARKET_FILE
        if estat_path.exists():
            validate_hpi_across_publishers(payload, json.loads(estat_path.read_text("utf-8")))
            click.echo("  gate: НСИ's house price index change reconciles with Eurostat's")
        else:
            click.echo(
                f"  gate SKIPPED: {HOUSE_MARKET_FILE} is not in {out}, so the "
                f"cross-publisher reconciliation had nothing to check against. "
                f"Run --source house-market first.",
                err=True,
            )
    except ValidationError as e:
        click.echo(f"ERROR: validation failed: {e}", err=True)
        sys.exit(3)

    write_payload(payload, out, NSI_HOUSING_FILE)
    national = payload["national_price_index_yoy"]
    click.echo(
        f"OK: wrote {NSI_HOUSING_FILE} (national {national['value_pct']['total']}% y/y at "
        f"{payload['ref_period']}, {len(payload['city_price_index_yoy']['cities'])} cities)"
    )
