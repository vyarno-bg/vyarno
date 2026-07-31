"""имот.bg average-prices scraper.

We read the public `https://www.imot.bg/sredni-ceni` page for the per-district
€/m² **asking** price in Sofia. имот.bg is the longest-running BG real-estate
listings aggregator, and that page publishes one average asking price per Sofia
district, computed by имот.bg from its own live listings.

The same dataset is exposed per year via
`https://www.imot.bg/sredni-ceni/prodazhbi-sofiya?year=Y` for Y in
2015..current_year. We pull the full ladder on every refresh, so the SPA can
show "+X% since 2015" with no cached baseline. имот.bg is the single source of
truth for the home block, historical and current both.

**Why this source, not a Eurostat series.** Eurostat's `hpi_ndh_q` is a
rate-of-change index rebased to 2015: it gives Δ% over time, not an absolute
€/m² level, and no machine-readable BG €/m² LEVEL series exists anywhere.

**How the page carries the data.** A JavaScript object literal in windows-1251:

    var raioniAvgPrice = {'Банишора': 2504, 'Борово': 3000, ...};

We regex-extract that one literal — no JS execution — which makes the parse
robust to layout changes in the surrounding HTML.

Output shape — one city for now, structured so a second can be added later:

    {
      "as_of": "2026-07-22",
      "source": "имот.bg",
      "source_url": "https://www.imot.bg/sredni-ceni",
      "notes": "Per-district €/m² averages from imot.bg/sredni-ceni ...",
      "payload_name": "sofia_price",
      "city": "София",
      "n_districts": 143,
      "eur_per_m2_median": 2501,   // CITY-WIDE MEDIAN — the headline
      "eur_per_m2_mean": 2546,
      "eur_per_m2_min": 991,
      "eur_per_m2_max": 5567,
      "page_as_of_dd_mm_yyyy": "16.7.2026",
      "all_districts": { "Банишора": 2504, ... },
      "historical": [
        {"year": 2015, "n_districts": 120, "eur_per_m2_median": 757,
         "eur_per_m2_mean": 764.9, "since_2015_median_pct": 0.0},
        ...
        {"year": 2026, "n_districts": 143, "eur_per_m2_median": 2501,
         "eur_per_m2_mean": 2545.7, "since_2015_median_pct": 230.6},
      ]
    }

Failure modes:

- Unreachable or timed out → raise with a clear message; the CLI exits 4. There
  is no fallback for €/m², so the home block renders a placeholder and a "no
  data" pill when the JSON is missing.
- The `var raioniAvgPrice = {...}` literal absent → raise with the HTML slice
  for debugging; the CLI exits 2.
- A per-district value that looks like an injection (negative, NaN, >10000
  €/m²) → skipped and logged.
- One historical year flaky → that year is omitted from `historical`, the
  current-year row stays mandatory, and the CLI prints a WARNING.

**Why this one is run by hand.** `www.imot.bg` answers datacenter IPs with a
403, so this connector needs an ordinary Bulgarian connection — which is why
`--source all` from a cloud runner fails on this arm alone, and why a 403 here
is an environment result rather than a broken parser. The `User-Agent` says
plainly who is asking, and a refresh is a handful of requests: the current
page, plus one per historical year.
"""

from __future__ import annotations

import re
import statistics
from datetime import date
from typing import Any

import httpx

from vyarno_pipeline import clock

SOURCE_URL = "https://www.imot.bg/sredni-ceni"
SOURCE_URL_YEAR_TEMPLATE = "https://www.imot.bg/sredni-ceni/prodazhbi-sofiya?year={year}"
CITY_LABEL_BG = "София"
CITY_LABEL_EN = "Sofia"

# The historical archive we pull on every refresh. имот.bg returns 200 with
# 120+ districts for every year from 2015 to the current one. Below 2015 is
# unverified — hold the bound here until a probe says otherwise.
HISTORICAL_YEAR_MIN = 2015

# Per-district anti-injection sanity bounds. Sofia 2026 ranges
# ~990-5600 €/m² per imot.bg's own data; values outside this range
# are treated as parsing errors and dropped. (e.g. 99999 to poison
# the median, or -50 from a corrupted cell — both get silently
# filtered here.)
_MIN_VALID_EUR_M2 = 100
_MAX_VALID_EUR_M2 = 10_000

# Minimum plausible district count. Real Sofia page returns ~143
# districts; if we matched under this, the regex silently got a
# tiny fragment (imot.bg could serve an error page that coincidentally
# contains the JS literal name).
_MIN_VALID_DISTRICT_COUNT = 20


def _decode_imot_html(raw: bytes) -> str:
    """Decode an imot.bg page body. windows-1251 is the truth; utf-8 is
    only a fallback when the bytes are genuinely utf-8 (newer pages
    sometimes ship as utf-8). Mirrors the existing fetch path.
    """
    try:
        return raw.decode("windows-1251")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def _parse_raioni_avg_price_block(html: str) -> dict[str, int]:
    """Pull the `var raioniAvgPrice = {...}` literal and return the
    surviving district dict. Refuses to ship < 20 valid districts.

    Shared between the current and historical scrapers — the only
    difference between the two URLs is the `?year=` parameter; the
    JS literal is the same shape.
    """
    m = re.search(r"var\s+raioniAvgPrice\s*=\s*\{(.+?)\}\s*;", html, re.DOTALL)
    if not m:
        raise ValueError(
            "imot.bg/sredni-ceni: 'var raioniAvgPrice = {...}' block "
            "not found — page layout changed. Sample around the "
            "expected anchor: "
            + html[html.find("raioniAvgPrice") - 80 : html.find("raioniAvgPrice") + 200]
            if "raioniAvgPrice" in html
            else "(no 'raioniAvgPrice' substring anywhere)"
        )

    districts: dict[str, int] = {}
    for kmatch in re.finditer(r"'((?:[^'\\]|\\.)*)'\s*:\s*(\d+)", m.group(1)):
        key = kmatch.group(1).strip()
        val = int(kmatch.group(2))
        if not _MIN_VALID_EUR_M2 <= val <= _MAX_VALID_EUR_M2:
            continue
        districts[key] = val

    if len(districts) < _MIN_VALID_DISTRICT_COUNT:
        raise ValueError(
            f"imot.bg/sredni-ceni: only {len(districts)} valid districts "
            f"parsed (expected ~140+). Aborting rather than shipping "
            "a thin dataset."
        )
    return districts


def _extract_page_as_of(html: str) -> str:
    """Pull the page's \"обновена на DD.MM.YYYY\" / \"от DD.MM.YYYY\" date.
    Returns \"\" if the page doesn't advertise one (the historical
    archive does not — only the current page does).
    """
    for date_re in (
        r"обновена\s+на\s*(\d{1,2}\.\d{1,2}\.\d{4})",
        r"от\s+(\d{1,2}\.\d{1,2}\.\d{4})",
    ):
        dm = re.search(date_re, html)
        if dm:
            return dm.group(1)
    return ""


def fetch_sofia_avg_prices(timeout: float = 30.0) -> dict[str, Any]:
    """Fetch https://www.imot.bg/sredni-ceni and parse the per-rayon
    average prices for Sofia.

    Returns:
        {
            "page_as_of": str   # "DD.MM.YYYY" if the page publishes it,
                                 # else ""
            "city_label_bg": str,
            "city_label_en": str,
            "districts": {district_name_bg: eur_per_m2, ...},
            "n_districts": int  # count of valid districts
        }

    Raises:
        httpx.HTTPError — network failure
        ValueError — page layout changed, regex didn't match
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Vyarno.bg data pipeline)",
        "Accept-Charset": "windows-1251,utf-8;q=0.9",
    }
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(SOURCE_URL, headers=headers)
        r.raise_for_status()
        html = _decode_imot_html(r.content)

    districts = _parse_raioni_avg_price_block(html)
    page_as_of = _extract_page_as_of(html)
    return {
        "page_as_of": page_as_of,
        "city_label_bg": CITY_LABEL_BG,
        "city_label_en": CITY_LABEL_EN,
        "districts": districts,
        "n_districts": len(districts),
    }


def fetch_sofia_avg_prices_for_year(year: int, timeout: float = 30.0) -> dict[str, Any]:
    """Fetch the historical archive for a single year.

    URL: https://www.imot.bg/sredni-ceni/prodazhbi-sofiya?year={year}
    Returns the same shape as fetch_sofia_avg_prices, but `page_as_of`
    is the year itself (the historical page doesn't advertise a date).

    Raises:
        httpx.HTTPError — network failure
        ValueError — page layout changed, regex didn't match, or year
                     out of the supported range (HISTORICAL_YEAR_MIN..current)
    """
    if year < HISTORICAL_YEAR_MIN:
        raise ValueError(
            f"year {year} is below HISTORICAL_YEAR_MIN={HISTORICAL_YEAR_MIN}; "
            "supported range verified only for 2015..current_year"
        )
    if year > clock.today().year:
        raise ValueError(f"year {year} is in the future; imot.bg has no archive for it")
    url = SOURCE_URL_YEAR_TEMPLATE.format(year=year)
    headers = {
        "User-Agent": "Mozilla/5.0 (Vyarno.bg data pipeline)",
        "Accept-Charset": "windows-1251,utf-8;q=0.9",
    }
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()
        html = _decode_imot_html(r.content)

    districts = _parse_raioni_avg_price_block(html)
    return {
        "year": year,
        "page_as_of": "",  # historical page doesn't advertise one
        "city_label_bg": CITY_LABEL_BG,
        "city_label_en": CITY_LABEL_EN,
        "source_url": url,
        "districts": districts,
        "n_districts": len(districts),
    }


def _summary_stats(districts: dict[str, int]) -> dict[str, float | int]:
    """Median / mean / min / max from a per-district dict. Re-filtered
    against the anti-injection bounds — last line of defence.
    """
    safe = {k: v for k, v in districts.items() if _MIN_VALID_EUR_M2 <= v <= _MAX_VALID_EUR_M2}
    if len(safe) < _MIN_VALID_DISTRICT_COUNT:
        raise ValueError(
            f"only {len(safe)} valid districts after defensive filter "
            f"(expected >= {_MIN_VALID_DISTRICT_COUNT})"
        )
    prices = sorted(safe.values())
    median = statistics.median(prices)
    mean = sum(prices) / len(prices)
    return {
        "n_districts": len(safe),
        "eur_per_m2_median": median,
        "eur_per_m2_mean": round(mean, 1),
        "eur_per_m2_min": min(prices),
        "eur_per_m2_max": max(prices),
    }


def build_sofia_price_payload(
    today: date,
    raw: dict[str, Any],
    historical: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build the JSON envelope we'll publish as data/published/sofia_price.json.

    `historical` is a list of per-year raws (year, districts, n_districts) as
    returned by fetch_sofia_avg_prices_for_year. Years that failed to scrape
    are simply absent from the list — the SPA handles missing years gracefully.

    The historical block is sorted ascending by year, and the first year
    (the baseline) carries `since_2015_median_pct: 0.0`. Every other year
    carries `since_2015_median_pct = current_median / baseline_median - 1`,
    rounded to 1 decimal. The current-year row's `since_2015_median_pct`
    matches the formula by construction (we set it explicitly).

    Median-first ordering aligns with the \"BG €/m² sequence\" the
    user sees elsewhere — the single-number summary a buyer should
    anchor on (Sofia has long-tail districts like \"Докторски
    паметник\" at 5567 €/m², where median beats mean for a heavy-
    tailed distribution).

    Defensive: this function is the LAST line of defence. The
    fetcher already filters out-of-band values; we re-filter here
    so a future caller (manual JSON paste, cached file replay,
    test bug that sneaks past `fetch_sofia_avg_prices`) can't
    ship poisoned numbers. Same anti-injection bounds as the
    fetcher; same >=_MIN_VALID_DISTRICT_COUNT guard.
    """
    current = _summary_stats(raw["districts"])
    # Build the historical ladder. Each row carries the per-year summary
    # stats plus `since_2015_median_pct` (median vs baseline).
    historical_rows: list[dict[str, Any]] = []
    if historical:
        # Sort ascending by year so the SPA can iterate or render a chart.
        sorted_hist = sorted([h for h in historical if "year" in h], key=lambda h: h["year"])
        if not sorted_hist:
            raise ValueError("historical list provided but no rows have a 'year' key")
        baseline_year = sorted_hist[0]["year"]
        baseline_stats = _summary_stats(sorted_hist[0]["districts"])
        baseline_median = float(baseline_stats["eur_per_m2_median"])
        for h in sorted_hist:
            stats = _summary_stats(h["districts"])
            median = float(stats["eur_per_m2_median"])
            if h["year"] == baseline_year:
                pct = 0.0
            else:
                pct = round(100.0 * (median / baseline_median - 1.0), 1)
            historical_rows.append(
                {
                    "year": h["year"],
                    "n_districts": stats["n_districts"],
                    "eur_per_m2_median": stats["eur_per_m2_median"],
                    "eur_per_m2_mean": stats["eur_per_m2_mean"],
                    "since_2015_median_pct": pct,
                }
            )

    # Consistency invariant: the current-year row's since_2015 must
    # match the formula current_median / baseline_median - 1. If the
    # historical ladder doesn't include the current year, compute it
    # from the current raw and the baseline.
    if historical_rows:
        current_year = today.year
        # Find the row whose year == current_year; if present, replace
        # its pct with the formula-derived value so the SPA can trust
        # the JSON. If absent, append one.
        derived_pct = round(
            100.0 * (float(current["eur_per_m2_median"]) / baseline_median - 1.0),
            1,
        )
        replaced = False
        for r in historical_rows:
            if r["year"] == current_year:
                r["since_2015_median_pct"] = derived_pct
                replaced = True
                break
        if not replaced:
            historical_rows.append(
                {
                    "year": current_year,
                    "n_districts": current["n_districts"],
                    "eur_per_m2_median": current["eur_per_m2_median"],
                    "eur_per_m2_mean": current["eur_per_m2_mean"],
                    "since_2015_median_pct": derived_pct,
                }
            )
            historical_rows.sort(key=lambda r: r["year"])

    payload = {
        "schema_version": "1.1",
        "as_of": today.isoformat(),
        "source": "imot.bg",
        "source_url": SOURCE_URL,
        # "read from", not "scraped from": `notes` ships inside the payload,
        # and what this connector does is fetch one published page by hand in a
        # handful of requests with a self-identifying User-Agent. docs/legal.md
        # §имот.bg turns on that description being accurate.
        "notes": (
            f"Per-district €/m² asking-price averages read from "
            f"imot.bg/sredni-ceni on {today.isoformat()}. "
            f"{current['n_districts']} districts parsed after dropping "
            "values outside [100, 10000] €/m² as injection sanity bounds. "
            "Median is the headline (resistant to long-tail districts "
            "like Докторски паметник at 5567 €/m²); mean included for "
            "completeness. "
            + (
                f"imot.bg's own 'обновена на' date on the page: {raw['page_as_of']}."
                if raw["page_as_of"]
                else "The page advertised no 'обновена на' date when it was read, "
                "so the only date this payload can vouch for is the fetch date above."
            )
        ),
        "payload_name": "sofia_price",
        "city": raw["city_label_bg"],
        "city_en": raw["city_label_en"],
        "n_districts": current["n_districts"],
        "eur_per_m2_median": current["eur_per_m2_median"],
        "eur_per_m2_mean": current["eur_per_m2_mean"],
        "eur_per_m2_min": current["eur_per_m2_min"],
        "eur_per_m2_max": current["eur_per_m2_max"],
        "page_as_of_dd_mm_yyyy": raw["page_as_of"],
        "all_districts": {
            k: v for k, v in raw["districts"].items() if _MIN_VALID_EUR_M2 <= v <= _MAX_VALID_EUR_M2
        },
    }
    if historical_rows:
        payload["historical"] = historical_rows
        payload["historical_source_url"] = SOURCE_URL_YEAR_TEMPLATE
    return payload
