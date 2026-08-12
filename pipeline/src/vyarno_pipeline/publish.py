"""Write validated observations to /data/published/*.json.

The JSON layout is the contract between pipeline and site. The site reads these
files at runtime — never hits Eurostat from the user's browser.

Filename constants are part of the contract. Don't rename without updating
`site/src/lib/payloads.js`, where the SPA declares which payloads it reads.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from vyarno_pipeline.models import CategoryObservation, TimeSeriesObservation
from vyarno_pipeline.sources.eurostat import (
    CLASSIFICATION,
    COICOP_DIM,
    INDEX_BASE_YEAR,
    IW_DATASET,
    MINR_DATASET,
)

# Site reads these exact filenames. If you rename, grep for these in site/.
HICP_CATEGORIES_FILE: str = "hicp_categories.json"
HICP_HEADLINE_FILE: str = "hicp_headline.json"
UNEMPLOYMENT_FILE: str = "unemployment.json"
MORTGAGE_FILE: str = "mortgage.json"
CITY_PRICE_FILE: str = "city_price.json"
REGION_SALARY_FILE: str = "region_salary.json"
SECTOR_SALARY_FILE: str = "sector_salary.json"
SALARY_DIST_FILE: str = "salary_dist.json"
PAYROLL_FILE: str = "payroll.json"
HOUSE_MARKET_FILE: str = "house_market.json"
# The stem has to START with `house_market`, and that is a CI contract rather
# than a naming preference. `refresh.yml` decides which payloads an arm owns by
# matching stems against `--source` with the hyphens swapped for underscores, so
# a file called `housing_structure.json` is owned by no arm: the workflow finds
# nothing of its own changed, skips the commit and the PR, and reports the run
# green while the payload never publishes. One arm writes both these files.
HOUSE_MARKET_STRUCTURE_FILE: str = "house_market_structure.json"
NSI_HOUSING_FILE: str = "nsi_housing.json"


def write_payload(payload: dict, target_dir: Path, filename: str) -> Path:
    """Write one already-shaped payload dict to `target_dir/filename`.

    The single write path for `data/published/`: same encoding, same indent,
    same final newline for every file, so a payload assembled elsewhere (the
    payroll table, the imot.bg scrape) cannot land on disk in a shape that
    differs from the ones the writers below produce. Every writer in this
    module ends here.

    `newline="\\n"` because text mode otherwise translates every "\\n" to
    `os.linesep`, which on Windows means the whole published tree is written
    CRLF — the same eight files, byte-different, on a refresh run from a
    different machine than the last one. `.gitattributes` normalises them back
    on commit, so the damage is not in the repository but in everything that
    reads the working tree before git does: the copy `site/scripts/copy-data.mjs`
    puts into `dist/`, and any byte comparison against what was published last
    time. One argument is cheaper than a rule about which machine may run a
    refresh.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    out = target_dir / filename
    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return out


# Eurostat's condition on reuse is not "attribute us" alone. Read 2026-07-30:
# "When reuse involves translations of publications or modifications to the data
# or text, this must be stated clearly to the end user of the information."
#
# Every index value in these two payloads is now Eurostat's own, at the unit
# `sources/eurostat.py` names, arriving in the JSON as the cube returned it.
# What is left is a SELECTION — which readings appear, not what they say:
# `rows_to_yearly_index` keeps December and drops any year without one, and
# `index_years_from_2020` drops the years the anchor selector cannot reach.
#
# So this note describes a choice of rows rather than a modification of them,
# and keeping it that way is worth some discipline. Every figure the site
# builds from the index is a ratio of two of its own members, so scaling the
# series — to make an anchor year read 100, to fit a chart axis — cannot move
# anything a reader sees. What it can do is put a number in front of that
# reader which no Eurostat page will return, under a heading naming Eurostat,
# and oblige every one of those numbers to carry a modification disclaimer.
# Selection carries no such obligation. The trade is all cost, no benefit.
#
# One string, used by both writers, so the statement cannot drift from what the
# pipeline does. If a scaling step is ever justified, this sentence says so in
# the same commit, and the word is "modified", not "selected".
INDEX_DERIVATION_NOTE = (
    "index_by_year and latest_index carry Eurostat's published index values "
    "unmodified, at the unit named in each row's api_url_index — open it and "
    "the same digits come back. What is ours is the SELECTION: index_by_year "
    "takes the December reading of each year out of the monthly series (a year "
    "without a December is omitted) and starts at 2020, and latest_index is the "
    "most recent month published. The annual rate of change is Eurostat's own "
    "figure, unmodified."
)


def _to_jsonable(obj):
    """Pydantic v2 model → JSON-safe dict (dates → ISO strings, HttpUrl → str)."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    raise TypeError(f"Cannot serialize {type(obj)} to JSON")


def _envelope(
    as_of: date,
    source: str,
    source_url: str,
    notes: str = "",
) -> dict:
    """Common envelope for every published file. Site reads `as_of` to render
    the strip's "next data" date honestly and to detect stale files."""
    return {
        "schema_version": "1.0",
        "as_of": as_of.isoformat(),
        "source": source,
        "source_url": source_url,
        "notes": notes,
    }


def write_hicp_categories(
    categories: dict[str, CategoryObservation],
    as_of: date,
    target_dir: Path,
    filename: str = HICP_CATEGORIES_FILE,
    weights_year: str = "",
    ref_period: str = "",
) -> Path:
    """Write the ECOICOP ver.2 divisions, each with its groups nested.

    The site reads `categories[*].index_by_year` to compute cumulative rates
    against any anchor year back to 2020 — that's the whole reason this
    payload is bulky instead of pre-computed. Each division also carries
    `groups[]` (ECOICOP level 2), which drives the SPA's detailed mode; no
    sub-category number is ever hardcoded in the front end.

    `ref_period` is the month the rates and the latest index describe — the same
    month every category carries and `hicp_headline.json` reports. It sits on the
    envelope because that is where a consumer looks for "what period is this";
    the site's data panel dates this payload by it.

    The envelope's `classification` block is the provenance for the thing that
    broke in July 2026: it names the version, the COICOP dimension, the
    division count, and BOTH source datasets with the weights vintage. If a
    future reader wonders whether the weights and rates are on the same
    classification, this block answers it without reading the pipeline.
    """
    n_groups = sum(len(c.groups) for c in categories.values())
    payload = _envelope(
        as_of=as_of,
        source="eurostat",
        source_url=(
            f"https://ec.europa.eu/eurostat/databrowser/view/{MINR_DATASET}/default/table?lang=en"
        ),
        notes=(
            f"Generated by vyarno-pipeline. {len(categories)} ECOICOP ver.2 "
            f"divisions + {n_groups} groups; division weights sum to 100 "
            f"(validated at publish time). {INDEX_DERIVATION_NOTE}"
        ),
    )
    if ref_period:
        payload["ref_period"] = ref_period
    payload["classification"] = {
        "version": CLASSIFICATION,
        "coicop_dim": COICOP_DIM,
        "division_count": len(categories),
        "group_count": n_groups,
        "rates_dataset": MINR_DATASET,
        "weights_dataset": IW_DATASET,
        "weights_ref_year": weights_year,
        "note": (
            "Weights, rates and the index all come from ECOICOP ver.2 cubes "
            "keyed by coicop18, so every code's weight, rate, index, label and "
            "verify link describe the same bucket. The archived ver.1 weights "
            "cube (prc_hicp_inw) has 12 divisions, no CP13, and a different "
            "meaning for CP12 — never join it with these."
        ),
    }
    payload["categories"] = [_to_jsonable(c) for c in categories.values()]
    return write_payload(payload, target_dir, filename)


def write_hicp_headline(
    as_of: date,
    headline_rate_pct: float,
    ref_period: str,
    target_dir: Path,
    filename: str = HICP_HEADLINE_FILE,
    index_by_year: dict[int, float] | None = None,
    latest_index: dict | None = None,
    flash: bool = False,
) -> Path:
    """Write the CP00 all-items headline — the 12-month rate AND the index.

    Used by the national-strip dashboard. Kept separate from categories.json
    so the strip can render without loading the full categories payload.

    **Why the index is here too.** The savings card asks "what does money kept
    since 2020 buy now", which is a cumulative, not a 12-month rate. Without an
    all-items index the SPA had to rebuild one as Σ wᵢ·(Iᵢ(now)/Iᵢ(2020) − 1)
    at the current weights — about 41.8% on today's data, where Eurostat's own
    chain-linked all-items index gives 39.9%. Both are honest arithmetic over
    published figures, but only one of them is a figure Eurostat publishes, and
    on a card about somebody's savings that difference is €960 per €100k.

    `index_by_year` and `latest_index` come through the same `index_fields` the
    categories use, so a since-year figure computed from this payload and one
    computed from a division sit on the same base (`math.md` invariant #1) —
    Eurostat's, in both cases, because neither is scaled on the way through.

    **`flash`** says the rate is Eurostat's early all-items estimate, published
    about two weeks before the rest of the month's cube. It changes no figure.
    It writes `is_flash` and the sentence in `notes` that stops `ref_period` and
    `latest_index.time` looking like a bug when they name different months.

    **The flag is written even though the two months already imply it**, and
    the reason is what a consumer does with the answer. The site prints a
    marker beside the rate, and a marker is a claim about the release: reading
    it off `ref_period != latest_index.time` means every renderer re-derives
    the same rule, and any of them can be handed a payload whose index half is
    missing — `latest_index` is optional here — and quietly conclude "settled".
    A publisher that knows which release it fetched owes the reader the fact
    rather than the evidence for it. `validate_headline_flash` keeps the two
    honest: the flag and the months have to agree or nothing is written.
    """
    payload = _envelope(
        as_of=as_of,
        source="eurostat",
        source_url=(
            f"https://ec.europa.eu/eurostat/databrowser/view/{MINR_DATASET}/default/table?lang=en"
        ),
        notes=(
            f"Headline all-items HICP for BG ({CLASSIFICATION}, TOTAL, annual "
            f"rate of change). "
            + (
                "This is Eurostat's FLASH estimate: the all-items rate for "
                "ref_period, published ahead of the divisions and of that "
                "month's index, so latest_index names an earlier month than "
                "ref_period does and hicp_categories.json is a month behind "
                "this payload. Both figures are published Eurostat readings at "
                "the months they each name. "
                if flash
                else ""
            )
            + INDEX_DERIVATION_NOTE
        ),
    )
    payload["headline_rate_pct"] = headline_rate_pct
    payload["ref_period"] = ref_period
    # Always present, both ways round. A field that appears only on a flash is
    # one a consumer reads as absent-means-false, and absent also means "an
    # older envelope that never carried it" — two different states behind one
    # missing key, on the field that decides whether the banner hedges.
    payload["is_flash"] = flash
    if index_by_year:
        payload["index_base_year"] = INDEX_BASE_YEAR
        payload["unit"] = f"index_{INDEX_BASE_YEAR}=100"
        payload["index_by_year"] = {str(y): v for y, v in sorted(index_by_year.items())}
    if latest_index:
        payload["latest_index"] = latest_index
    return write_payload(payload, target_dir, filename)


def write_time_series(
    payload_name: str,
    series: TimeSeriesObservation,
    target_dir: Path,
    filename: str,
    notes: str = "",
) -> Path:
    """Write a TimeSeriesObservation to its target JSON file.

    Common envelope (as_of / source / source_url) plus the model's own
    fields (dataset, ref_period, value, series_by_period, etc.). The
    `notes` parameter is used by the CLI to add a per-call note ("Generated
    by vyarno-pipeline. Weights sum to 100..." style).
    """
    env = _envelope(
        as_of=series.published_at,
        source=series.source,
        source_url=str(series.source_url),
        notes=notes,
    )
    payload = {**env, "payload_name": payload_name}
    payload.update(_to_jsonable(series))
    return write_payload(payload, target_dir, filename)


def write_salary_distribution_payload(
    as_of: date,
    ses: dict,
    shape: dict,
    target_dir: Path,
    filename: str = SALARY_DIST_FILE,
) -> Path:
    """Write the individual gross-earnings percentile ladder — Eurostat only.

    - `ses`   — Eurostat SES distribution shape (fetch_ses_earnings_bg).
    - `shape` — build_ses_shape_ladder output: the ladder at SES's own level,
      plus the SES mean the browser divides by and the two log-dispersions.

    **Every figure in this file is Eurostat's**, which keeps it to one
    publisher's data and one publisher's terms. The ladder the reader sees is
    this shape multiplied by (НСИ national average / SES mean), and that
    multiplication happens in their browser — `mirror.js#composeLadder` — over
    НСИ's own published quarter in `sector_salary.json`. The spread here is
    Bulgaria's and nobody publishes one below that, so the level it meets has to
    be Bulgaria's too (docs/data-sources.md §"Salary distribution").

    Splitting it costs nothing in accuracy: the re-level is a scalar multiply,
    so `rung(f) == f * rung(1)` exactly, which is why the rungs below carry
    four decimal places instead of one. See `build_ses_shape_ladder`.

    GROSS EUR/month. The SPA converts each rung to NET via the single BG-payroll
    function (mirror.js#bgNetSalary) before comparing, because the salary input
    is net take-home.
    """
    env = _envelope(
        as_of=as_of,
        source="eurostat",
        source_url=ses["source_url"],
        notes=(
            "Individual gross-earnings distribution for Bulgaria, at Eurostat's "
            f"own level (SES earn_ses_monthly, {ses['ref_year']}). DERIVED from "
            "the published D1/median/D9: the intermediate deciles are "
            "interpolated and the P1/P99 tails extrapolated (see shape.method). "
            "This file carries no figure from any other publisher. The site "
            "re-levels it to the current national average in the reader's "
            "browser; that average is НСИ's all-activities figure, published "
            "unmodified in sector_salary.json. The shape is Bulgaria's and no "
            "publisher measures one below that, so the ranking it supports is "
            "the country's rather than any one област's. "
            "GROSS EUR/month. See docs/data-sources.md."
        ),
    )
    payload = {
        **env,
        "payload_name": "salary_dist",
        "unit": "eur_per_month_gross",
        "ref_period": ses["ref_year"],
        "shape": {
            "_role": "SHAPE: individual gross-earnings distribution, at SES's own level",
            "source": "eurostat",
            "dataset": ses["dataset"],
            "ref_year": ses["ref_year"],
            "source_url": ses["source_url"],
            "ses_gross_eur": {
                "d1": ses["d1"],
                "median": ses["median"],
                "mean": ses["mean"],
                "d9": ses["d9"],
            },
            "ses_mean": shape["ses_mean"],
            "sigma_bottom": shape["sigma_bottom"],
            "sigma_top": shape["sigma_top"],
            "ladder_ses": shape["ladder_ses"],
            "method": (
                "Eurostat SES individual gross-earnings shape (D1/median/D9). "
                "Intermediate deciles piecewise-lognormal in the normal "
                "quantile, matching D1/median/D9 exactly; P1/P99 tails "
                "extrapolated by the nearest segment's log-slope. Rungs are at "
                "SES's own level and in SES's own units — multiply by "
                "(target mean / ses_mean) to re-level. Four decimal places so "
                "that multiplication rounds once, not twice."
            ),
        },
        "disclaimer": (
            "Individual-employee GROSS monthly earnings, from the 4-yearly "
            "Eurostat Structure of Earnings Survey — the only official BG "
            "earnings-distribution source. The middle deciles and the tails are "
            "modelled, not directly surveyed, and the shape is national: using "
            "it for Sofia assumes Sofia's dispersion tracks the national one."
        ),
    }
    return write_payload(payload, target_dir, filename)


def write_mortgage_payload(
    as_of: date,
    new_business: dict,
    outstanding_stock: dict,
    cross_check: dict,
    lending_limits: dict,
    target_dir: Path,
    filename: str = MORTGAGE_FILE,
) -> Path:
    """Write `mortgage.json` (schema 2.0).

    Two rate tiers answering two different questions, plus the regulatory
    limits every BG mortgage is bound by. The sections are assembled and
    gated in `mortgage.py`; this function only shapes the envelope.

    - `new_business` — ECB MIR, households, house purchase, new business.
      `value_pct` is the AAR (the interest rate the monthly payment is
      computed from); `aprc` carries the same loans' all-in cost with fees.
      **This is the headline** — `headline` names it explicitly so the SPA
      never has to guess which tier to default to.
    - `outstanding_stock` — BNB housing-loan book: what everyone already
      repaying a mortgage averages. NOT what a new borrower is quoted.
    - `cross_check` — BNB vs ECB MIR on the outstanding book; they describe
      the same data and must agree (gate, not decoration).
    - `lending_limits` — BNB borrower-based measures (LTV-O 85% ⇒ 15% down,
      DSTI-O 50%, maturity 30y) so the SPA's caps are data-driven.

    Schema 2.0 replaced 1.0's three sections
    (`sector_average` / `aggregate_outstanding` / `indicative_offer`). The
    scraped `indicative_offer` tier is gone for good; see
    `docs/data-sources.md` §"Not available (do not cite as a working source)".
    """
    payload = _envelope(
        as_of=as_of,
        source="ecb+bnb",
        source_url=new_business["source_url"],
        notes=(
            "BG mortgage panel. Two tiers: new_business (ECB MIR — what a "
            "home loan costs if you sign one now; AAR plus APRC with fees) "
            "and outstanding_stock (BNB — what everyone already repaying a "
            "home loan averages). Both official and monthly. No scraped "
            "offered-rate tier by design."
        ),
    )
    payload["schema_version"] = "2.0"
    # Names the tier the calculator defaults to, so the contract is explicit
    # in the data rather than implied by key order in the SPA.
    payload["headline"] = "new_business"
    payload["new_business"] = new_business
    payload["outstanding_stock"] = outstanding_stock
    payload["cross_check"] = cross_check
    payload["lending_limits"] = lending_limits
    return write_payload(payload, target_dir, filename)
