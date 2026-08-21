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

import itertools
import json
import statistics
import sys
import time
from collections.abc import Callable
from datetime import date
from pathlib import Path

import click
import httpx

from vyarno_pipeline import clock
from vyarno_pipeline.citations import (
    BROKEN,
    LIVENESS,
    OK,
    REVISED,
    STALE,
    UNCHECKED,
    verify,
)
from vyarno_pipeline.credit import (
    STOCK_SERIES_START,
    blended_stock_rate,
    cross_check_household_stock,
    cross_check_stock_rate,
    product_block,
    savings_ratio,
    validate_business_splice,
    validate_card_above_mortgage,
    validate_card_nesting,
    validate_credit_freshness,
    validate_npl_freshness,
    validate_npl_scopes,
    validate_product_series,
    validate_savings_series,
    validate_savings_window,
    validate_stock_series,
)
from vyarno_pipeline.mortgage import (
    MortgageValidationError,
    cross_check_fixation_rates,
    cross_check_outstanding,
    latest_period,
    lending_limits_at,
    validate_aprc_above_aar,
    validate_fixation_rows,
    validate_freshness,
    validate_new_business_split,
    validate_rate_series,
)
from vyarno_pipeline.payroll import build_payroll_payload, in_force_entry
from vyarno_pipeline.publish import (
    CITY_PRICE_FILE,
    CREDIT_FILE,
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
    write_credit_payload,
    write_hicp_categories,
    write_hicp_headline,
    write_mortgage_payload,
    write_payload,
    write_salary_distribution_payload,
    write_time_series,
)
from vyarno_pipeline.refresh_report import (
    build_report,
    committed_reader,
    github_output,
    step_summary,
)
from vyarno_pipeline.regions import PRICED_REGIONS, REGIONS
from vyarno_pipeline.sources.bnb import (
    FIXATION_BUCKETS,
    LOAN_PURPOSES,
    SHEET_NAME,
    fetch_housing_fixation_bg,
    fetch_housing_stock_rate_bg,
    fetch_loan_stock_bg,
    fetch_overdraft_card_stock_bg,
)
from vyarno_pipeline.sources.bnb import FIXATION_URL as BNB_FIXATION_URL
from vyarno_pipeline.sources.bnb import OVERDRAFT_SHEET as BNB_OVERDRAFT_SHEET
from vyarno_pipeline.sources.bnb import OVERDRAFT_URL as BNB_OVERDRAFT_URL
from vyarno_pipeline.sources.bnb import SOURCE_URL as BNB_SOURCE_URL
from vyarno_pipeline.sources.dv import fetch_tzpb_appendix
from vyarno_pipeline.sources.ecb import (
    BSI_KEYS,
    BSI_SERIES_START,
    BUSINESS_KEYS,
    BUSINESS_SERIES_START,
    CBD2_NPL_SCOPES,
    CONSUMER_KEYS,
    EURO_SWITCH_PERIOD,
    OUTSTANDING_SERIES_START,
    SERIES_KEYS,
    bsi_url,
    cbd2_npl_key,
    cbd2_url,
    fetch_bsi_series,
    fetch_cbd2_series,
    fetch_mir_series,
    fixation_rate_key,
    series_url,
    splice_at_euro_changeover,
)
from vyarno_pipeline.sources.eurostat import (
    CP_DIVISIONS,
    INDEX_SINCE_YEAR,
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
    validate_payroll,
    validate_reconciliation,
    validate_region_salary,
    validate_sector_salary,
    validate_unemployment,
)

# Every arm the CLI offers. `all` is appended where a bulk refresh makes sense
# and left off where a single arm is required, so a command that can date a
# commit with one `as_of` cannot be handed eleven.
REFRESH_SOURCES = [
    "hicp",
    "unemployment",
    "mortgage",
    "credit",
    "city-price",
    "region-salary",
    "sector-salary",
    "salary-dist",
    "payroll",
    "house-market",
    "nsi-housing",
]


@click.group()
def main() -> None:
    """vyarno.bg data pipeline."""


@main.command("verify-citations")
@click.option(
    "--published",
    default=Path("data/published"),
    show_default=True,
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    help="Directory of published payloads to check",
)
@click.option("--only", default=None, help="Check payloads whose stem contains this")
@click.option("--quiet", is_flag=True, help="Print only what is not OK")
def verify_citations(published: Path, only: str | None, quiet: bool) -> None:
    """Every source_url still serves the figure printed beside it.

    Deliberately outside `make check` — it needs a network and six upstreams.
    `citations.py` carries the argument, and the BROKEN/REVISED split that keeps
    an upstream restating a month from reading like a broken link.

    Exits 3 when a citation is BROKEN, 0 otherwise. A revision is not a fault.
    """
    findings = verify(published, only=only)
    order = {BROKEN: 0, REVISED: 1, STALE: 2, UNCHECKED: 3, LIVENESS: 4, OK: 5}
    tally: dict[str, int] = {}
    for finding in sorted(findings, key=lambda f: (order[f.verdict], f.payload, f.where)):
        tally[finding.verdict] = tally.get(finding.verdict, 0) + 1
        if quiet and finding.verdict in (OK, LIVENESS):
            continue
        values = f"{finding.checked} value(s)" if finding.checked else "no value"
        click.echo(f"{finding.verdict:9s} {finding.payload} {finding.where} — {values}")
        if finding.detail:
            click.echo(f"          {finding.detail}")
        click.echo(f"          {finding.url}")
    click.echo("")
    click.echo(
        "  ".join(f"{verdict} {tally.get(verdict, 0)}" for verdict in order if tally.get(verdict))
    )
    checked = sum(f.checked for f in findings)
    click.echo(
        f"{len(findings)} citations, {checked} published values held against their upstream."
    )
    if tally.get(BROKEN):
        click.echo(
            f"ERROR: {tally[BROKEN]} citation(s) do not resolve to what the payload says "
            f"they do. A reader clicking one is told something untrue.",
            err=True,
        )
        sys.exit(3)


@main.command("refresh-report")
@click.option(
    "--source",
    required=True,
    type=click.Choice(REFRESH_SOURCES),
    help=(
        "The arm that has just written. `all` is not accepted: eleven arms "
        "carry eleven as_of dates and a commit can only be dated with one."
    ),
)
@click.option(
    "--published",
    default=Path("data/published"),
    show_default=True,
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    help="Directory of published payloads the arm has just written into",
)
@click.option(
    "--cadence",
    required=True,
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    help="JSON from site/scripts/payload-cadence.mjs — the manifest's own per-payload days",
)
@click.option("--against", default="origin/main", show_default=True, help="Git ref to compare with")
@click.option(
    "--repo",
    default=Path(),
    show_default=True,
    type=click.Path(path_type=Path, exists=True, file_okay=False),
    help="Repository root the ref is read from",
)
@click.option(
    "--github-output",
    "github_output_path",
    default=None,
    type=click.Path(path_type=Path, dir_okay=False),
    help="Append the workflow outputs here ($GITHUB_OUTPUT)",
)
@click.option(
    "--step-summary",
    "step_summary_path",
    default=None,
    type=click.Path(path_type=Path, dir_okay=False),
    help="Append the run's own summary here ($GITHUB_STEP_SUMMARY)",
)
def refresh_report_command(
    source: str,
    published: Path,
    cadence: Path,
    against: str,
    repo: Path,
    github_output_path: Path | None,
    step_summary_path: Path | None,
) -> None:
    """Did an upstream republish, and what should the commit be dated?

    `refresh.yml` gates its commit, push and pull-request steps on `real_change`.
    The decision itself is `refresh_report.py`, which says why it is not in the
    workflow. Exits 0 either way — a run that finds the same figures on a later
    day has done its job.
    """
    report = build_report(
        published_dir=published,
        source=source,
        cadence=json.loads(cadence.read_text("utf-8")),
        committed=committed_reader(repo, against),
        today=clock.today(),
    )
    if github_output_path:
        with github_output_path.open("a", encoding="utf-8") as handle:
            handle.write(github_output(report))
    if step_summary_path:
        with step_summary_path.open("a", encoding="utf-8") as handle:
            handle.write(step_summary(report, source))
    click.echo(github_output(report), nl=False)
    if not report.real_change:
        click.echo(
            f"::notice::{source} — the upstream is still serving the committed figures. "
            f"Only the run date moved, so no pull request."
        )


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
    type=click.Choice([*REFRESH_SOURCES, "all"]),
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
        "(dwellings sold, what was paid, the house price index) plus the three "
        "structure cubes (tenure, the census dwelling stock, "
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
    default=INDEX_SINCE_YEAR,
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
    elif source == "credit":
        _refresh_credit(out, as_of)
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
            ("credit", lambda: _refresh_credit(out, as_of)),
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

    # Gated on the model's own dict rather than on the written file: a gate that
    # reads back what it just published cannot block the publish.
    try:
        click.echo(
            "→ gate: unemployment (headline is the series' own cell; flags are Eurostat's)..."
        )
        validate_unemployment(obs.model_dump(mode="json"))
    except ValidationError as e:
        click.echo(f"GATE FAILED: {e}", err=True)
        sys.exit(3)

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
    flagged = sorted(obs.status_by_period)
    click.echo(
        f"OK: wrote {UNEMPLOYMENT_FILE} ({len(obs.series_by_period)} months "
        f"{min(obs.series_by_period)}→{obs.ref_period}, latest {obs.value:.1f}%"
        + (f", Eurostat flag {', '.join(flagged)}" if flagged else "")
        + ")"
    )


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
    """Build payroll.json from the dated legislative table plus the ТЗПБ table.

    Most BG payroll parameters (contribution rates both sides, flat tax, max
    insurable income, minimum wage) are legislative constants with no
    machine-readable feed, so they live in `payroll.py` as a dated table.
    Publishing them makes the SPA's gross→net math data-driven instead of
    hardcoded — to reflect a law change, edit the table and re-run this.

    The one network call is ТЗПБ: 87 per-activity rates that ЗБДОО resets every
    year, read from the act itself by `sources/dv.py`. It is not best-effort.
    A payroll payload with no `work_accident` block fails `validate.py`, so a
    ДВ outage stops the run rather than publishing a labour cost that is
    complete-looking and short by up to 1,1% of gross.
    """
    click.echo("→ building payroll.json (BG payroll parameters)...")
    entry = in_force_entry(as_of)
    citation = entry["tzpb"]
    click.echo(f"  fetching {citation['appendix']} from ДВ...")
    tzpb = fetch_tzpb_appendix(
        citation["dv_material_id"],
        citation["appendix"],
        expect_issue=citation["gazette_issue"],
        expect_date=citation["gazette_date"].isoformat(),
    )
    click.echo(f"  read {len(tzpb['activities'])} economic activities")
    payload = build_payroll_payload(as_of, tzpb=tzpb)
    validate_payroll(payload)
    write_payload(payload, target_dir=out, filename=PAYROLL_FILE)
    r = payload["employee_contrib_rates"]["total"]
    wa = payload["work_accident"]
    click.echo(
        f"OK: wrote {PAYROLL_FILE} (employee {r * 100:.2f}% + "
        f"{payload['income_tax_rate'] * 100:.0f}% tax, employer "
        f"{payload['employer_contrib_rates']['total'] * 100:.2f}% + ТЗПБ "
        f"{wa['min'] * 100:.1f}–{wa['max'] * 100:.1f}%, cap "
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
        click.echo("→ fetching ECB MIR new business split (pure new loans vs renegotiation)...")
        split = {
            leg: splice_at_euro_changeover(
                fetch_mir_series(SERIES_KEYS[f"new_business_{leg}_bgn"]),
                fetch_mir_series(SERIES_KEYS[f"new_business_{leg}_eur"]),
            )
            for leg in ("aar_pure", "aar_reneg", "vol_pure", "vol_reneg")
        }
        click.echo("→ fetching ECB MIR rates by initial rate fixation...")
        fixation_rates = {
            bucket: splice_at_euro_changeover(
                fetch_mir_series(fixation_rate_key(bucket, "BGN")),
                fetch_mir_series(fixation_rate_key(bucket, "EUR")),
            )
            for bucket in FIXATION_BUCKETS
        }
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
        click.echo("→ fetching BNB new-business XLSX (volumes by initial rate fixation)...")
        fixation_rows = fetch_housing_fixation_bg()
        click.echo(f"  got {len(fixation_rows)} monthly rows")
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

        click.echo("→ gate: the four fixation buckets are all of new housing lending...")
        validate_fixation_rows(fixation_rows)
        cross_check_fixation_rates(
            fixation_rows[-1]["rate_pct"],
            {b: s[max(s)] for b, s in fixation_rates.items() if s},
        )
        click.echo("→ gate: pure new lending + renegotiation = new business...")
        validate_new_business_split(volume, split["vol_pure"], split["vol_reneg"])

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

    fix_ref = fixation_rows[-1]
    fixation = {
        # The one figure on this page a reader can act on without knowing any
        # economics: almost every Bulgarian mortgage repriceS with the ЕЦБ, so
        # the payment on the calculator is a payment for now rather than for the
        # term. Describing that is P6's «comparison plus a number»; what to do
        # about it is not ours to say.
        "_role": (
            "the same new lending, split by how long its interest rate is "
            "fixed for at signing. The first bucket is variable-rate loans "
            "together with one-year fixations — БНБ count them as one and say "
            "so — so it may never be read as «fixed for a year»"
        ),
        "source": "bnb",
        "dataset": (
            "s_ir_loan_nbf_hh_bg.xlsx, sheet LOAN_NBF_HH, Жилищни кредити × "
            "в евро × период на първоначално фиксиране на лихвения процент"
        ),
        "source_url": BNB_FIXATION_URL,
        "ref_period": fix_ref["period"],
        "total_eur_m": fix_ref["total_eur_m"],
        "buckets": [
            {
                "bucket": bucket,
                "volume_eur_m": fix_ref["volume_eur_m"][bucket],
                "share_pct": round(100.0 * fix_ref["volume_eur_m"][bucket] / total, 2),
                "rate_pct": fix_ref["rate_pct"][bucket] or None,
                "cross_check_url": series_url(fixation_rate_key(bucket, "EUR")),
            }
            for bucket in FIXATION_BUCKETS
            for total in [fix_ref["total_eur_m"]]
        ],
        # One number a month rather than four series: the share is what the page
        # draws, the per-bucket rates are a snapshot beside it, and a payload
        # already carrying two 230-month series does not need four more.
        "floating_share_by_period": {
            row["period"]: round(100.0 * row["volume_eur_m"]["up_to_1y"] / row["total_eur_m"], 2)
            for row in fixation_rows
            if row["total_eur_m"]
        },
        "cross_check": (
            "the per-bucket rates are gated against ЕЦБ MIR's own four series "
            "(MATURITY_NOT_IRATE F/I/O/P). The VOLUMES have no second publisher: "
            "the euro leg of MIR carries no volume by fixation, so this workbook "
            "is the only source of the split after 2026-01"
        ),
    }

    # The newest month all three legs carry. They are three requests to one API
    # and the ЕЦБ publish them together, but a share is a ratio and a ratio
    # taken across a month only its numerator has is a division by nothing.
    split_ref = max(set(split["vol_reneg"]) & set(split["vol_pure"]) & set(volume))
    new_business_split = {
        # «Нов бизнес» counts a household repricing the loan it already has, so
        # a record month of «new lending» is not necessarily a record month of
        # houses being bought. The ЕЦБ publish the seam; nothing else does.
        "_role": (
            "how much of the new business above is a household repricing a "
            "loan it already had, rather than borrowing for a home it is "
            "buying now — the two are one figure in every headline"
        ),
        "source": "ecb",
        "dataset": (
            f"MIR {SERIES_KEYS['new_business_vol_pure_eur']} and "
            f"{SERIES_KEYS['new_business_vol_reneg_eur']}, spliced from their BGN legs"
        ),
        "source_url": series_url(SERIES_KEYS["new_business_vol_reneg_eur"]),
        "ref_period": split_ref,
        "pure_new_eur_m": split["vol_pure"][split_ref],
        "renegotiated_eur_m": split["vol_reneg"][split_ref],
        "renegotiated_share_pct": round(
            100.0 * split["vol_reneg"][split_ref] / volume[split_ref], 2
        ),
        "pure_new_rate_pct": split["aar_pure"].get(split_ref),
        "renegotiated_rate_pct": split["aar_reneg"].get(split_ref),
        "renegotiated_share_by_period": {
            period: round(100.0 * split["vol_reneg"][period] / volume[period], 2)
            for period in sorted(set(split["vol_reneg"]) & set(volume))
            if volume[period]
        },
        "basis": (
            "IR_BUS_COV — P «pure new loans» and R «renegotiation» partition N "
            "«new business», and the gate checks they still add up"
        ),
    }

    write_mortgage_payload(
        as_of=as_of,
        new_business=new_business,
        outstanding_stock=outstanding_stock,
        cross_check=cross,
        lending_limits=lending_limits_at(as_of),
        fixation=fixation,
        new_business_split=new_business_split,
        target_dir=out,
    )
    click.echo(
        f"OK: wrote {MORTGAGE_FILE} — "
        f"new_business AAR={aar[aar_ref]}% / APRC={aprc[aprc_ref]}% ({aar_ref}), "
        f"outstanding_stock={bnb_series[bnb_ref]}% ({bnb_ref}), "
        f"floating={fixation['buckets'][0]['share_pct']}%, "
        f"renegotiated={new_business_split['renegotiated_share_pct']}%"
    )


if __name__ == "__main__":
    main()


def _refresh_credit(out: Path, as_of: date) -> None:
    """Refresh `credit.json` — household borrowing other than a home loan.

    Three questions, three upstreams, and they only answer the page together:

      what it COSTS      ЕЦБ MIR, five products spliced at the euro (`ecb.py`)
      what is OWED       БНБ's two stock workbooks, because every MIR
                         outstanding-amount VOLUME key for BG is a 404
      what is NOT PAID   ЕЦБ CBD2, the household-scoped NPL ratio

    The card figure is the one worth the arm: 21% on a balance carried past the
    interest-free period is the highest price a Bulgarian household routinely
    pays for money, and €371 m of it is being paid on.

    Exits: 4 on network, 2 on a changed upstream shape, 3 on a gate.
    """
    try:
        click.echo("→ fetching ECB MIR consumer credit, overdrafts, cards and deposits...")
        raw = {
            name: fetch_mir_series(key)
            for name, key in CONSUMER_KEYS.items()
            if "term_bgn" not in name and not key.endswith(".O")
        }
        # The outstanding-stock legs start at 2022-01 rather than 2020-01, and
        # asking for a 2020 start returns the same 54 months rather than
        # failing, so the argument is documentation more than necessity.
        for name in ("deposit_term_stock_eur", "household_stock_eur"):
            raw[name] = fetch_mir_series(CONSUMER_KEYS[name], start_period=OUTSTANDING_SERIES_START)
        # The mortgage rate for the gate below, fetched rather than read off the
        # neighbouring payload: an arm that depends on a file another arm wrote
        # succeeds or fails by the order they ran in, and `--source credit`
        # alone would compare today's card rate against whatever was on disk.
        mortgage_now = fetch_mir_series(SERIES_KEYS["new_business_aar_eur"])
        click.echo("→ fetching ECB MIR new lending to companies (the other borrower)...")
        # Over the whole comparable record rather than the 2020 default the
        # household keys are pulled on: the lev legs of this key and of the
        # mortgage one both begin at 2017-08, so that is where a comparison
        # between them can begin.
        business = {
            name: fetch_mir_series(key, start_period=BUSINESS_SERIES_START)
            for name, key in BUSINESS_KEYS.items()
        }
        click.echo("→ fetching ECB CBD2 non-performing loans (households vs companies)...")
        npl = {scope: fetch_cbd2_series(cbd2_npl_key(scope)) for scope in CBD2_NPL_SCOPES}
        click.echo("→ fetching ECB BSI household deposits and loans (the levels)...")
        bsi = {name: fetch_bsi_series(key) for name, key in BSI_KEYS.items()}
    except httpx.HTTPError as e:
        click.echo(f"ERROR: ECB fetch failed: {e}", err=True)
        sys.exit(4)
    except ValueError as e:
        click.echo(f"ERROR: ECB response shape/identity check failed: {e}", err=True)
        sys.exit(2)

    try:
        click.echo(
            "→ fetching BNB outstanding balances (loans by purpose, then overdraft/cards)..."
        )
        stock = fetch_loan_stock_bg()
        revolving = fetch_overdraft_card_stock_bg()
        click.echo(
            f"  loan book {len(stock['housing'])} monthly rows, overdraft/cards {len(revolving)}"
        )
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

    spliced = {
        stem: splice_at_euro_changeover(raw[f"{stem}_bgn"], raw[f"{stem}_eur"])
        for stem in (
            "consumer_aar",
            "consumer_aprc",
            "consumer_volume",
            "overdraft_aar",
            "card_aar",
        )
    }
    # The corporate leg splices on the same rule and for a sharper reason: here
    # BOTH currencies were in real use before 2026, so the euro leg is not the
    # ~5% niche it is on mortgages but a differently priced slice of a live
    # market, up to 2.08 pp away from the lev one in the same month.
    spliced["business_aar"] = splice_at_euro_changeover(
        business["business_aar_bgn"], business["business_aar_eur"]
    )

    # Deposits over one window, and it is the source that decides which: the BGN
    # leg of `L22` at this aggregation is a 404, so the term series begins at
    # euro adoption. Drawing the overnight series further back than its pair
    # would compare two products over two periods.
    since = EURO_SWITCH_PERIOD
    deposits = {
        "deposit_overnight": {p: v for p, v in raw["deposit_overnight_eur"].items() if p >= since},
        "deposit_term": {p: v for p, v in raw["deposit_term_eur"].items() if p >= since},
    }
    click.echo(
        f"  consumer {len(spliced['consumer_aar'])} months, card {len(spliced['card_aar'])}, "
        f"deposits {len(deposits['deposit_term'])} (from {since})"
    )

    # ---- the outstanding book, assembled before the gates that read it ------
    # Four blocks that PARTITION what households owe, and one of them contains
    # the other two figures the page prints. БНБ's «Овърдрафт» already includes
    # «в т.ч. кредитни карти», so the total adds the overdraft block whole and
    # the card and overdraft-proper amounts are drawn out of it below.
    revolving_by_period = {r["period"]: r for r in revolving}
    stock_periods = sorted(
        {p for rows in stock.values() for p in (r["period"] for r in rows)}
        & set(revolving_by_period) - {p for p in revolving_by_period if p < STOCK_SERIES_START}
    )
    stock_by_purpose = {purpose: {r["period"]: r for r in rows} for purpose, rows in stock.items()}
    stock_ref = stock_periods[-1]

    def stock_volumes(period: str) -> dict[str, float]:
        """The four amounts that add up to what households owe, at one month."""
        out = {p: stock_by_purpose[p][period]["volume_eur_m"] for p in LOAN_PURPOSES}
        out["overdraft"] = revolving_by_period[period]["overdraft_eur_m"]
        return out

    volume_by_period = {
        purpose: {p: stock_by_purpose[purpose][p]["volume_eur_m"] for p in stock_periods}
        for purpose in LOAN_PURPOSES
    }
    volume_by_period["overdraft"] = {
        p: revolving_by_period[p]["overdraft_eur_m"] for p in stock_periods
    }
    volume_by_period["total"] = {p: round(sum(stock_volumes(p).values()), 3) for p in stock_periods}

    ref_row = revolving_by_period[stock_ref]
    # ЕЦБ A2Z1 «revolving loans and overdrafts» EXCLUDES card credit and БНБ's
    # block includes it, so the amount that belongs beside the 6.45% already on
    # the page is the block less its own sub-block. The rate that subtraction
    # leaves behind is gated against A2Z1 below, which is what proves it
    # happened — €205 m at 6.46% looks no more right than €695 m at 13.2%.
    overdraft_ex_cards_eur_m = round(ref_row["overdraft_eur_m"] - ref_row["card_eur_m"], 3)
    overdraft_ex_cards_rate_pct = round(
        (
            ref_row["overdraft_eur_m"] * ref_row["overdraft_rate_pct"]
            - ref_row["card_eur_m"] * ref_row["card_rate_pct"]
        )
        / overdraft_ex_cards_eur_m,
        4,
    )
    stock_blocks = {
        purpose: {
            "volume_eur_m": stock_by_purpose[purpose][stock_ref]["volume_eur_m"],
            "rate_pct": stock_by_purpose[purpose][stock_ref]["rate_pct"],
        }
        for purpose in LOAN_PURPOSES
    }
    stock_blocks["overdraft"] = {
        "volume_eur_m": ref_row["overdraft_eur_m"],
        "rate_pct": ref_row["overdraft_rate_pct"],
    }

    try:
        click.echo("→ gate: one plausibility band per product...")
        for product, series in (
            ("consumer", spliced["consumer_aar"]),
            ("overdraft", spliced["overdraft_aar"]),
            ("card", spliced["card_aar"]),
            ("deposit_overnight", deposits["deposit_overnight"]),
            ("deposit_term", deposits["deposit_term"]),
            ("business_lending", spliced["business_aar"]),
        ):
            validate_product_series(series, product)

        click.echo("→ gate: the company rate is the splice, not the euro leg whole...")
        validate_business_splice(
            spliced["business_aar"], business["business_aar_bgn"], EURO_SWITCH_PERIOD
        )

        click.echo("→ gate: APRC ≥ AAR on consumer credit...")
        validate_aprc_above_aar(spliced["consumer_aar"], spliced["consumer_aprc"])

        click.echo("→ gate: card credit costs more than a secured home loan...")
        validate_card_above_mortgage(
            spliced["card_aar"][max(spliced["card_aar"])],
            mortgage_now[max(mortgage_now)],
        )

        click.echo("→ gate: one plausibility band per outstanding block...")
        for product in LOAN_PURPOSES:
            validate_stock_series(volume_by_period[product], product)
        validate_stock_series(volume_by_period["overdraft"], "overdraft")
        validate_stock_series(
            {p: revolving_by_period[p]["card_outside_grace_eur_m"] for p in stock_periods},
            "card_outside_grace",
        )

        click.echo("→ gate: the card balance is inside the card is inside the overdraft...")
        for period in stock_periods:
            validate_card_nesting(revolving_by_period[period])

        click.echo("→ gate: БНБ's revolving cells reproduce the ЕЦБ rates beside them...")
        card_cross = cross_check_stock_rate(
            ref_row["card_outside_grace_rate_pct"],
            spliced["card_aar"][max(spliced["card_aar"])],
            "card credit carried past the interest-free period (A2Z3)",
        )
        overdraft_cross = cross_check_stock_rate(
            overdraft_ex_cards_rate_pct,
            spliced["overdraft_aar"][max(spliced["overdraft_aar"])],
            "overdrafts and revolving credit, card credit taken out (A2Z1)",
        )

        click.echo("→ gate: the four blocks blended are the ЕЦБ's household stock rate...")
        household_stock_ref = max(raw["household_stock_eur"])
        stock_cross = cross_check_stock_rate(
            round(blended_stock_rate(stock_blocks), 4),
            raw["household_stock_eur"][household_stock_ref],
            "every household loan on the books, blended over the four blocks (A20)",
        )
        click.echo(
            f"  blended {stock_cross['bnb_pct']}% vs ЕЦБ {stock_cross['ecb_mir_pct']}% "
            f"→ Δ {stock_cross['delta_pp']} pp"
        )

        click.echo("→ gate: what households have and what they owe, over one window...")
        validate_savings_series(bsi["household_deposits"], "BSI household deposits")
        validate_savings_series(bsi["household_loans"], "BSI household loans")
        validate_savings_window(bsi["household_deposits"], bsi["household_loans"])
        savings_ref = max(bsi["household_deposits"])
        savings_cross = cross_check_household_stock(
            bsi["household_loans"][savings_ref],
            volume_by_period["total"][savings_ref],
            savings_ref,
        )
        click.echo(
            f"  ЕЦБ BSI €{savings_cross['ecb_bsi_eur_m']:.0f} m vs БНБ "
            f"€{savings_cross['bnb_eur_m']:.0f} m → {savings_cross['delta_pct']:+}%"
        )

        click.echo("→ gate: companies fall behind more often than households...")
        validate_npl_scopes(npl)
        npl_ref = max(npl["households"])
        validate_npl_freshness(npl_ref, as_of)

        click.echo("→ gate: freshness...")
        validate_credit_freshness(max(spliced["consumer_aar"]), as_of)
        validate_freshness(stock_ref, as_of, "BNB household outstanding balances")
        # BSI is its own ECB release rather than a second table in the MIR one,
        # so it can fall behind the rates on this page without anything else
        # here noticing. The window is MIR's because the lag is: 2026-06 landed
        # 47 days after the month it describes, against a 150-day limit.
        validate_freshness(savings_ref, as_of, "ECB BSI household deposits and loans")
    except MortgageValidationError as e:
        click.echo(f"GATE FAILED: {e}", err=True)
        sys.exit(3)

    consumer_aprc_ref = max(spliced["consumer_aprc"])
    products = {
        "consumer": product_block(
            "what a loan for something other than a home costs — a car, a "
            "renovation, anything paid back in instalments",
            spliced["consumer_aar"],
            f"MIR {CONSUMER_KEYS['consumer_aar_bgn']} spliced with {CONSUMER_KEYS['consumer_aar_eur']}",
            series_url(CONSUMER_KEYS["consumer_aar_eur"]),
            {
                "aprc_pct": spliced["consumer_aprc"][consumer_aprc_ref],
                "aprc_ref_period": consumer_aprc_ref,
                "aprc_source_url": series_url(CONSUMER_KEYS["consumer_aprc_eur"]),
                "monthly_volume_eur_m": spliced["consumer_volume"][max(spliced["consumer_volume"])],
                # БНБ print the same month's new lending at 691.192 m against the
                # ЕЦБ's 701.85, and the two are the same series rather than two
                # definitions: over the euro era they have agreed to 0.1% in five
                # months of six, and the RATES agree to 0.002 pp every month — a
                # 1.5% slice of lending at a different price would move an 8.76%
                # weighted average and it does not. So this stays the ЕЦБ's
                # figure, one publisher per number, and the gap is a vintage.
                "monthly_volume_note": (
                    "ЕЦБ MIR's own new-business volume. БНБ's workbooks print the "
                    "same figure from their own vintage and it can sit ~1% away in "
                    "the newest month; the two are one series reported by one "
                    "institution, not two measurements to average"
                ),
                # **No `stock_eur_m` here, and the absence is the point.** The
                # rate above is NEW BUSINESS — what a consumer loan signed last
                # month costs — while what is owed on consumer credit is an
                # €11.3 bn book at 6.91%. Printing the two together would read as
                # «8.76% on €11.3 bn», which is a rate over a population it does
                # not describe. The stock is published in `outstanding.blocks`
                # beside its own rate instead.
                #
                # Card and overdraft carry both because for them the ЕЦБ's rate
                # IS the rate on the stock: MIR reports revolving credit as new
                # business equal to the outstanding amount, which is why БНБ's
                # outstanding cells reproduce A2Z3 and A2Z1 to 0.02 pp.
            },
        ),
        "overdraft": product_block(
            "what going past zero on a current account costs, and what a "
            "revolving credit line costs — the same item to the ЕЦБ",
            spliced["overdraft_aar"],
            f"MIR {CONSUMER_KEYS['overdraft_aar_bgn']} spliced with "
            f"{CONSUMER_KEYS['overdraft_aar_eur']}",
            series_url(CONSUMER_KEYS["overdraft_aar_eur"]),
            {
                "stock_eur_m": overdraft_ex_cards_eur_m,
                "stock_rate_pct": overdraft_ex_cards_rate_pct,
                "stock_ref_period": stock_ref,
                "stock_source": "bnb",
                "stock_source_url": BNB_OVERDRAFT_URL,
                "stock_dataset": (
                    f"{BNB_OVERDRAFT_URL.rsplit('/', 1)[-1]}, sheet {BNB_OVERDRAFT_SHEET}, "
                    f"Овърдрафт × в евро, less its «в т.ч. кредитни карти» sub-block"
                ),
                # Stated rather than left to be inferred: the ЕЦБ's item excludes
                # card credit and БНБ's block includes it, so this amount is a
                # subtraction and the reader is told so.
                "stock_basis": (
                    "БНБ's overdraft balances with the card sub-block taken out, "
                    "because ЕЦБ A2Z1 excludes card credit and БНБ's «Овърдрафт» "
                    "includes it. The rate the subtraction leaves is gated against "
                    "A2Z1, which is the evidence it was done"
                ),
                "stock_cross_check": overdraft_cross,
            },
        ),
        "card": product_block(
            "what a credit-card balance costs once it is carried past the "
            "interest-free period — «extended credit card credit», which is "
            "the card debt that is not repaid in full each month",
            spliced["card_aar"],
            f"MIR {CONSUMER_KEYS['card_aar_bgn']} spliced with {CONSUMER_KEYS['card_aar_eur']}",
            series_url(CONSUMER_KEYS["card_aar_eur"]),
            {
                "no_aprc": (
                    "BG reports no APRC for this item — the ЕЦБ collect "
                    "DATA_TYPE_MIR=C on instalment credit only — so the rate here "
                    "carries no fees-included companion the way consumer credit does"
                ),
                # The amount is БНБ's and the rate above is the ЕЦБ's, so this
                # figure carries its own source line on the page. They are the
                # same balances: БНБ's «в т.ч. извън безлихвен гратисен период»
                # cell reproduces A2Z3 to 0.014 pp, which the gate holds.
                "stock_eur_m": ref_row["card_outside_grace_eur_m"],
                "stock_rate_pct": ref_row["card_outside_grace_rate_pct"],
                "stock_ref_period": stock_ref,
                "stock_source": "bnb",
                "stock_source_url": BNB_OVERDRAFT_URL,
                "stock_dataset": (
                    f"{BNB_OVERDRAFT_URL.rsplit('/', 1)[-1]}, sheet {BNB_OVERDRAFT_SHEET}, "
                    f"Овърдрафт × в т.ч. кредитни карти × в т.ч. извън безлихвен "
                    f"гратисен период × в евро"
                ),
                "stock_cross_check": card_cross,
            },
        ),
        "deposit_overnight": product_block(
            "what money in a current account earns",
            deposits["deposit_overnight"],
            f"MIR {CONSUMER_KEYS['deposit_overnight_eur']}",
            series_url(CONSUMER_KEYS["deposit_overnight_eur"]),
            {
                "series_starts": since,
                "why_it_starts_there": (
                    "the BGN leg of this key does publish back to 2020 and is cut "
                    "here: its pair starts at the euro, and two deposit products "
                    "drawn over two periods do not compare"
                ),
            },
        ),
        "deposit_term": product_block(
            "what a term deposit earns — the comparator, because a borrowing "
            "rate is only high or low against what the money would otherwise pay",
            deposits["deposit_term"],
            f"MIR {CONSUMER_KEYS['deposit_term_eur']}",
            series_url(CONSUMER_KEYS["deposit_term_eur"]),
            {
                "series_starts": since,
                "why_it_starts_there": (
                    "the BGN leg of this key is a 404 — BG reported term deposits "
                    "by maturity bucket and never at this total before the euro"
                ),
                "monthly_volume_eur_m": raw["deposit_term_volume_eur"][
                    max(raw["deposit_term_volume_eur"])
                ],
                "monthly_volume_source_url": series_url(CONSUMER_KEYS["deposit_term_volume_eur"]),
                # **The two rates answer two questions and the second is the one
                # most people are living in.** 1.58% is what a deposit opened
                # last month was quoted; 0.55% is what the money already in one
                # is earning, because most of it was locked in when deposits paid
                # nothing. A page showing only the first tells a reader their
                # savings are keeping up better than they are.
                "stock_rate_pct": raw["deposit_term_stock_eur"][max(raw["deposit_term_stock_eur"])],
                "stock_ref_period": max(raw["deposit_term_stock_eur"]),
                "stock_source_url": series_url(CONSUMER_KEYS["deposit_term_stock_eur"]),
            },
        ),
    }

    business_ref = max(spliced["business_aar"])
    # The three figures the block's own prose cites, computed rather than
    # typed: a payload that explains its splice with numbers somebody measured
    # once is a payload whose explanation goes stale on the next release.
    business_leg_gap_pp = round(
        max(
            abs(business["business_aar_bgn"][p] - business["business_aar_eur"][p])
            for p in business["business_aar_bgn"]
            if p in business["business_aar_eur"]
        ),
        2,
    )
    business_moves = [
        abs(b - a)
        for a, b in itertools.pairwise(spliced["business_aar"][p] for p in spliced["business_aar"])
    ]
    business_splice_step_pp = round(
        abs(
            spliced["business_aar"][EURO_SWITCH_PERIOD]
            - spliced["business_aar"][_month_before(EURO_SWITCH_PERIOD)]
        ),
        2,
    )
    business_typical_move_pp = round(statistics.median(business_moves), 2)
    small_volume = business["business_small_volume_eur"]
    small_before = [v for p, v in small_volume.items() if p < EURO_SWITCH_PERIOD][-12:]
    small_after = [v for p, v in small_volume.items() if p >= EURO_SWITCH_PERIOD]
    small_volume_before = round(sum(small_before) / len(small_before), 1)
    small_volume_after = round(sum(small_after) / len(small_after), 1)
    business_lending = {
        # **The other borrower.** Every other price in this payload is one a
        # household is quoted; this is what the same banks charge a company for
        # the same kind of term lending in the same month. It is here rather
        # than in a payload of its own because it means nothing alone: what it
        # answers is whether a change in the price of money reaches both.
        "_role": (
            "what a Bulgarian company is charged on a new term loan, over the "
            "agreements signed in the reference month — the corporate twin of "
            "the mortgage rate beside it, so the two can be read against each "
            "other"
        ),
        "source": "ecb",
        "dataset": (
            f"MIR {BUSINESS_KEYS['business_aar_bgn']} (to "
            f"{_month_before(EURO_SWITCH_PERIOD)}) spliced with "
            f"{BUSINESS_KEYS['business_aar_eur']} (from {EURO_SWITCH_PERIOD})"
        ),
        "source_url": series_url(
            BUSINESS_KEYS["business_aar_eur"], start_period=BUSINESS_SERIES_START
        ),
        "ref_period": business_ref,
        "value_pct": spliced["business_aar"][business_ref],
        "series_by_period": spliced["business_aar"],
        "rate_basis": (
            "the MIR rate excluding charges (DATA_TYPE_MIR=R), new business, "
            "non-financial corporations (S.11), loans other than revolving "
            "loans and overdrafts and card credit (BS_ITEM A2A), all loan "
            "sizes, all initial rate-fixation periods"
        ),
        # **Two dimensions differ from the mortgage key, not one.** The
        # counterparty is the obvious one (2240 against 2250); the instrument
        # is the other, because MIR publishes no purpose split for company
        # lending — A2C narrows the household series to house purchase and A2A
        # has no such narrowing to make. Both exclude revolving credit,
        # overdrafts and card debt, so the pair is term lending against term
        # lending, and this is the difference a reader is owed rather than one
        # the payload can call away.
        "comparability": (
            "the mortgage rate is MIR A2C, term lending narrowed to house "
            "purchase; this is MIR A2A, term lending to companies for any "
            "purpose, because MIR carries no purpose split for corporate "
            "borrowing. Both exclude revolving credit, overdrafts and card "
            "debt, both are new business over the same month, and both are "
            "volume-weighted across every bank in Bulgaria"
        ),
        "counterparty": (
            "BS_COUNT_SECTOR 2240, non-financial corporations (S.11) — companies "
            "that produce goods and services, not banks, insurers or funds"
        ),
        "no_aprc": (
            "BG reports no APRC here: БНБ compute the ГПР for consumer and "
            "housing credit only, so a company's rate carries no fees-included "
            "companion and must not be compared with the mortgage ГПР"
        ),
        "currency": "EUR",
        "currency_history": (
            f"BGN through {_month_before(EURO_SWITCH_PERIOD)}, EUR from "
            f"{EURO_SWITCH_PERIOD} (BG adopted the euro on 2026-01-01)"
        ),
        # The same splice as the mortgage series and a stronger reason for it.
        # There the euro leg was a ~36 m/month niche; here both currencies were
        # in real use, so the euro leg is not a rounding error but a different
        # price, and reading it whole would publish nineteen years of the wrong
        # one.
        "methodology_change": (
            f"Bulgaria adopted the euro on 2026-01-01. Before then "
            f"CURRENCY_TRANS=EUR meant loans DENOMINATED in euro rather than "
            f"the currency of the country, and for company lending that was a "
            f"real and differently priced part of the market: over the months "
            f"both legs publish, the lev and euro rates sit as much as "
            f"{business_leg_gap_pp} pp apart. This series is therefore BGN "
            f"through {_month_before(EURO_SWITCH_PERIOD)} spliced with EUR from "
            f"{EURO_SWITCH_PERIOD}. The euro leg publishes months this series "
            f"does not use, and reading it whole would report that slice as "
            f"the market. The splice steps "
            f"{business_splice_step_pp} pp against a median month-to-month move "
            f"of {business_typical_move_pp} pp, so it is an ordinary month for "
            f"this series rather than the near-zero join the mortgage splice "
            f"shows."
        ),
        "series_starts": BUSINESS_SERIES_START,
        "why_it_starts_there": (
            "the lev leg of this key begins here, and so does the lev leg of "
            "the mortgage rate this is compared with. Before it there is no "
            "month in which both are published in the currency Bulgarians "
            "were borrowing in"
        ),
        # **The splice has no volume behind it, unlike the mortgage's.** The
        # all-sizes volume key does not exist for BG, so what stands in is the
        # smallest size bucket — the one an ordinary company borrows in — and
        # the lev leg simply ending.
        "splice_evidence": (
            f"MIR publishes no new-business volume for this aggregation "
            f"({BUSINESS_KEYS['business_aar_eur'].replace('.R.', '.B.')} is a "
            f"404 on both legs), so the evidence is the smallest loan bucket "
            f"instead: euro lending up to EUR 0.25 m averaged "
            f"{small_volume_before} m/month over the year before the "
            f"changeover and {small_volume_after} m/month since, while the lev "
            f"leg stops at {max(business['business_aar_bgn'])}"
        ),
        "splice_evidence_source_url": series_url(
            BUSINESS_KEYS["business_small_volume_eur"], start_period=BUSINESS_SERIES_START
        ),
    }

    outstanding = {
        # The question the rest of this payload does not answer. Every figure
        # beside it is a price; this is the quantity, and «21% на кредитна
        # карта» means something different once a reader knows €371 m of the
        # country's card balances are being charged it.
        "_role": (
            "what Bulgarian households owe, block by block, and what the "
            "balance in each is being charged. The four blocks partition the "
            "book, and БНБ's overdraft block already contains the card "
            "balances, so they are drawn out of it rather than added to it"
        ),
        "source": "bnb",
        "dataset": (
            f"{BNB_SOURCE_URL.rsplit('/', 1)[-1]}, sheet {SHEET_NAME} "
            f"(Кредити за потребление · Жилищни кредити · Други кредити) and "
            f"{BNB_OVERDRAFT_URL.rsplit('/', 1)[-1]}, sheet {BNB_OVERDRAFT_SHEET} "
            f"(Овърдрафт), all × в евро"
        ),
        "source_url": BNB_SOURCE_URL,
        "overdraft_source_url": BNB_OVERDRAFT_URL,
        "ref_period": stock_ref,
        "total_eur_m": round(sum(stock_volumes(stock_ref).values()), 3),
        # **The blended rate is a gate's working, not a figure to print.** The
        # published rate here is the ЕЦБ's own A20, so the amount is БНБ's and
        # the rate beside it is a publisher's rather than our arithmetic — and
        # the gate has already shown the two describe the same book.
        "rate_pct": raw["household_stock_eur"][max(raw["household_stock_eur"])],
        "rate_source": "ecb",
        "rate_ref_period": max(raw["household_stock_eur"]),
        "rate_source_url": series_url(CONSUMER_KEYS["household_stock_eur"]),
        "rate_dataset": f"MIR {CONSUMER_KEYS['household_stock_eur']}",
        "cross_check": stock_cross,
        "blocks": [
            {
                "block": block,
                "volume_eur_m": stock_blocks[block]["volume_eur_m"],
                "rate_pct": stock_blocks[block]["rate_pct"],
            }
            # Largest first, which is the order the page draws them and the order
            # a reader would ask about: the mortgage book is three fifths of what
            # households owe and nothing else comes near it.
            for block in sorted(stock_blocks, key=lambda b: -stock_blocks[b]["volume_eur_m"])
        ],
        "volume_by_period": volume_by_period,
        "series_starts": STOCK_SERIES_START,
        "why_it_starts_there": (
            "the loan workbook begins here. The overdraft workbook reaches back "
            "to 2000 and is cut to match, because a total assembled from four "
            "series over four windows is four questions added together"
        ),
        "currency": "EUR",
        "methodology_change": BNB_METHODOLOGY_CHANGE_NOTE,
    }

    npl_ref = max(npl["households"])
    non_performing = {
        # **Whose loans, over what portfolio.** The figure in the news is a
        # ratio over a bank's whole credit portfolio, and corporate lending —
        # which defaults at about twice the household rate in every quarter the
        # ЕЦБ publish — is most of that denominator. Both scopes are here so the
        # difference is something a reader can see rather than take on trust.
        "_role": (
            "the share of household lending that is not being repaid on time, "
            "and the same share for lending to companies. A single "
            "portfolio-wide ratio mixes the two and is read as the first"
        ),
        "source": "ecb",
        "dataset": (
            "CBD2 I3632, gross non-performing loans and advances as a share of "
            "total gross loans and advances, BS_COUNT_SECTOR S1M households and "
            "NPISH · S11 non-financial corporations · _Z every counterparty"
        ),
        "source_url": cbd2_url(cbd2_npl_key("households")),
        "ref_period": npl_ref,
        "households_pct": round(npl["households"][npl_ref], 2),
        "corporations_pct": round(npl["corporations"][npl_ref], 2),
        "all_counterparties_pct": round(npl["all"][npl_ref], 2),
        "households_by_period": {p: round(v, 2) for p, v in npl["households"].items()},
        "corporations_by_period": {p: round(v, 2) for p, v in npl["corporations"].items()},
        "scope_source_urls": {scope: cbd2_url(cbd2_npl_key(scope)) for scope in CBD2_NPL_SCOPES},
        "reporting_population": (
            "every bank operating in Bulgaria — domestic groups and stand-alone "
            "banks together with foreign-controlled subsidiaries and branches "
            "(CB_REP_SECTOR 67). The narrower 67-minus-foreign population "
            "(CB_REP_SECTOR 11) reports a household ratio well above this one "
            "because it is looking at a minority of the country's lending"
        ),
        "denominator": (
            "total gross loans and advances to the same counterparty sector. It "
            "is not БНБ's own supervisory credit-portfolio ratio, which is built "
            "on a different denominator and published quarterly in a PDF"
        ),
        "quarterly": (
            "CBD2 is quarterly and lands about five months after the quarter it "
            "describes, so this figure is older than every monthly rate beside it "
            "and says which quarter it is"
        ),
    }

    savings = {
        "_role": (
            "what Bulgarian households have put in the bank, against what they "
            "owe it, over the one window both are published on. The two levels "
            "are the ЕЦБ's and the euro-per-euro ratio between them is ours"
        ),
        "source": "ecb",
        "dataset": (
            f"BSI {BSI_KEYS['household_deposits']} (deposit liabilities) and "
            f"{BSI_KEYS['household_loans']} (loans), both domestic counterparty "
            f"(U6), households and NPISH (S.14+S.15), all currencies, stocks"
        ),
        "ref_period": savings_ref,
        "deposits_eur_m": bsi["household_deposits"][savings_ref],
        "deposits_source_url": bsi_url(BSI_KEYS["household_deposits"]),
        "loans_eur_m": bsi["household_loans"][savings_ref],
        "loans_source_url": bsi_url(BSI_KEYS["household_loans"]),
        "ratio": round(
            savings_ratio(
                bsi["household_deposits"][savings_ref], bsi["household_loans"][savings_ref]
            ),
            4,
        ),
        # Ours, so it says so and names its two inputs (P3). Both are published
        # levels in the same flow, so this is arithmetic over measurements and
        # not a projection — nothing here is assumed forward (P5).
        "ratio_basis": (
            "ours: the deposit level divided by the loan level, both ЕЦБ BSI, "
            "same month, same counterparty sector and same counterpart area"
        ),
        "deposits_by_period": bsi["household_deposits"],
        "loans_by_period": bsi["household_loans"],
        "series_starts": BSI_SERIES_START,
        # The whole of the window's justification, because the obvious edit to
        # this block is to draw the loan line further back — БНБ publish it from
        # 2007 and `outstanding` above carries it.
        "why_it_starts_there": (
            "every BG household series in ЕЦБ BSI begins at 2022-01 and none "
            "reaches further back, so the deposit line cannot be drawn before "
            "it. The loan line is cut to match rather than run on alone: two "
            "lines over two windows are two questions on one picture, and the "
            "ratio between them would have no date"
        ),
        "scope": (
            "households resident in Bulgaria (COUNT_AREA U6), together with the "
            "non-profit institutions serving them (S.14+S.15). The ЕЦБ publish "
            "the deposit breakdown by type on the whole-euro-area counterparty "
            "alone, so this block carries the two totals and no split"
        ),
        # БНБ's own total is in `outstanding` above and differs, so the payload
        # holds the two against each other rather than leaving a reader to find
        # the gap and read it as one of them being wrong.
        "cross_check": savings_cross,
        "cross_check_basis": (
            "БНБ's household total for the same month, from the workbooks in "
            "`outstanding`. ЕЦБ BSI runs above it because БНБ's consumer and "
            "housing blocks are sector Домакинства alone while BSI adds the "
            "non-profit institutions serving households"
        ),
    }

    write_credit_payload(
        as_of=as_of,
        products=products,
        business_lending=business_lending,
        outstanding=outstanding,
        non_performing=non_performing,
        savings=savings,
        target_dir=out,
    )
    click.echo(
        f"OK: wrote {CREDIT_FILE} — consumer {products['consumer']['value_pct']}%, "
        f"card {products['card']['value_pct']}%, term deposit "
        f"{products['deposit_term']['value_pct']}%, households owe "
        f"€{outstanding['total_eur_m'] / 1000:.1f} bn at {outstanding['rate_pct']}%, "
        f"NPL households {non_performing['households_pct']}% vs companies "
        f"{non_performing['corporations_pct']}% ({npl_ref})"
    )


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
        click.echo("→ fetching tenure, census stock, overburden...")
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
                    structure_payload["housing_cost_overburden"]["api_url"],
                ],
                _is_real_estat_cube,
            )
            click.echo("  gate: all seven published api_urls return a real cube")
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
