"""имот.bg average-prices scraper — per-district €/m², for 27 cities.

We read the public `sredni-ceni` pages for the per-district €/m² **asking**
price. имот.bg is the longest-running BG real-estate listings aggregator, and
those pages publish one average asking price per city district, computed by
имот.bg from its own live listings.

    https://www.imot.bg/sredni-ceni                       ← София
    https://www.imot.bg/sredni-ceni/prodazhbi-{slug}      ← the other 26
    …?year=YYYY                                           ← the same, historical

`regions.py` holds the slug for each city; it is a table because it cannot be
computed (§"The slugs are data" there).

**Why this source, not a Eurostat series.** Eurostat's `hpi_ndh_q` is a
rate-of-change index rebased to 2015: it gives Δ% over time, not an absolute
€/m² level, and no machine-readable BG €/m² LEVEL series exists anywhere.

**How the page carries the data.** A JavaScript object literal in windows-1251:

    var raioniAvgPrice = {'Банишора': 2504, 'Борово': 3000, ...};

We regex-extract that one literal — no JS execution — which makes the parse
robust to layout changes in the surrounding HTML.

**Where it is fetched from.** `www.imot.bg` answers datacenter IPs with a 403,
so this is the one connector that needs an ordinary Bulgarian connection. That
is why `city-price` is refreshed by hand while the other eight arms run
anywhere, and why a 403 here is an environment result rather than a parser
regression. A full refresh is 27 cities plus one request per historical year
each — around 650 requests, roughly two and a half minutes at polite spacing.

THE FOUR THINGS THIS CONNECTOR MUST NOT DO
------------------------------------------

Each is a way to publish a wrong number that looks entirely right, and each has
a named guard below.

**1. Publish rentals as sales.** `/sredni-ceni/naemi-{slug}` exists for every
city and serves the SAME `raioniAvgPrice` identifier, with float €/m²/MONTH
values — 1.39 to 32.48 across the cities, every one of them below 100. A parse
that found the literal without checking what page it was on would either drop
every row against the sanity bounds (silently, leaving a thin dataset) or, with
the bounds relaxed, publish a monthly rent as a purchase price. Rentals are out
of scope, and `_assert_sales_page` makes the rentals path unreachable rather
than merely unused: the URL is checked before the fetch and the final URL after
redirects, and a fractional value raises.

**2. Publish today's numbers under an old date.** `date=` is silently ignored
when it is invalid, in the wrong year, in the future or garbage — the response
is byte-identical to the no-`date=` baseline (probed 2026-08-09: four garbage
values all returned md5 5a7472391dcd99c967378f8dbd9091d3 for Burgas, the same
as no parameter at all). So a connector that asked for a snapshot имот.bg does
not have would publish the current one under the requested date, and every gate
downstream would pass because the file would be internally consistent.

**This connector therefore never sends `date=` at all**, and
`test_no_url_this_connector_builds_carries_a_date_parameter` holds that. The
date it publishes is READ from the page instead: every page carries its own
`<select name="date">` of the snapshots имот.bg actually has, and the newest
option is their published snapshot date. That is a stronger provenance claim
than the fetch date — "the day they published" rather than "the day we looked".

`year=` is safe and is used: a year with no data returns no literal at all and
the page drops to about a quarter of its size, which the district floor catches.

**3. Publish a truncated parse as a small city.** District counts run from 141
(София) to 7 (Ловеч), so a flat floor cannot serve both: 20 would reject twelve
real cities, and 5 would accept a Sofia page that returned a fragment. The floor
is therefore a share of what that city itself publishes — see
`_min_districts_for`.

**4. Drop rows silently.** The `[100, 10000]` sanity bounds stay: the sub-100
values in the history are sentinels rather than cheap flats (Burgas 2008 has a
0, 2010 a 5, 2004 a 9; Blagoevgrad 2006 a 4), and widening the band to admit the
13 while still rejecting the 9 would draw an arbitrary line through a set of
values that are uniformly junk. What changes is that the drop is counted,
published per city-year as `n_dropped`, and gated — see `MAX_DROPPED_SHARE`.

THE «обновена на» EXTRACTOR IS GONE
-----------------------------------

There is no «обновена на» stamp on these pages to read. Probed across all 27
cities for the current year plus Sofia back to 2000: zero pages contain the
substring «обновен» in any case. The `<select name="date">` list above is the
date имот.bg actually serve, and it is a stronger provenance claim than a stamp
would have been — every option on it is a snapshot they hold.
"""

from __future__ import annotations

import re
import statistics
from datetime import date
from typing import Any
from urllib.parse import urlparse

import httpx

from vyarno_pipeline import clock
from vyarno_pipeline.regions import SOFIA_CITY_CODE, Region

SOURCE_URL = "https://www.imot.bg/sredni-ceni"
CITY_URL_TEMPLATE = "https://www.imot.bg/sredni-ceni/prodazhbi-{slug}"

# The path prefix that means "sales". Everything this connector reads must be
# under it or be the bare `sredni-ceni` page, which is София's — imot.bg
# 302-redirects `prodazhbi-sofiya` there, so the final URL for that one city
# carries no prefix at all and the check has to allow for it by name.
_SALES_PATH_PREFIX = "/sredni-ceni/prodazhbi-"
_BARE_SALES_PATH = "/sredni-ceni"
# The rentals prefix, refused explicitly rather than by absence. Anything under
# it serves the same variable name at a tenth of the magnitude.
_RENTALS_MARKER = "naemi-"

# Per-district anti-injection sanity bounds. Current-year values across all 27
# cities run 317 to 5747 €/m² per имот.bg's own data (probed 2026-08-09, no
# out-of-band row on any city's current page); values outside this range are
# treated as parsing errors and counted out. See §4 in the module docstring on
# why these do not widen for history.
_MIN_VALID_EUR_M2 = 100
_MAX_VALID_EUR_M2 = 10_000

# The share of a city-year's rows that may be dropped before the run fails.
#
# **Measured, not chosen.** Inside the year windows this connector publishes,
# only 5 of 186 city-years drop anything at all and the worst is Ruse 2003 at 2
# of 20 = 10%; all 27 cities' current-year pages drop none. 20% is twice the
# observed worst case — the same shape as the chain-reconciliation tolerance in
# `validate.py`, which allows a little over twice its own observed maximum.
#
# A drop share above this is not a value problem, it is a parse problem: the
# regex has started matching something that is not a price.
MAX_DROPPED_SHARE = 0.20

# The district floor, as a share of what that city publishes today.
#
# **A flat count cannot do this job.** Counts run 141 (София) to 7 (Ловеч), so a
# floor of 20 rejects twelve real cities outright and a floor of 5 accepts a
# София page that returned five rows because the regex caught a fragment. The
# floor is therefore relative to `regions.py#imot_districts`, that city's own
# count on the probe date, with a small absolute floor under it.
#
# **How this tells a real drift from a truncated parse.** имот.bg do retire and
# merge districts — София moved 143 → 141 between the last published payload and
# the probe, about 1.4%. A truncated parse is not a few per cent, it is an order
# of magnitude: the failure mode is a regex catching one fragment, which yields
# single digits against a three-figure expectation. 60% sits far above any drift
# imot.bg has shown and far below any fragment. A city that legitimately shrinks
# past it fails the run, which is the right outcome — somebody looks, and the
# dated table is updated in the same commit as the finding.
_MIN_DISTRICT_SHARE = 0.60
_MIN_DISTRICT_FLOOR = 5

# Which historical years may be published, per city.
#
# A year qualifies when it has at least `_HISTORY_MIN_DISTRICTS` districts AND at
# least `_HISTORY_MIN_SHARE` of what that city publishes in the current year, and
# the baseline is the earliest year of the UNBROKEN qualifying run ending in the
# current year.
#
# **The thin early years are not merely imprecise, they are wrong.** имот.bg's
# per-city coverage grew over two decades, and a median over four districts is
# not the same measurement as a median over thirteen. Blagoevgrad's median moves
# +219% year over year inside its thin years, on a four-to-six-district sample,
# and Burgas 70% in its own — sampling artefacts wearing the clothes of price
# moves. Publishing "prices up X% since 2003" off those would put a wrong number
# on the screen and no gate downstream would catch it, because the file would be
# internally consistent.
#
# **The unbroken-run clause is what excludes them**, and it does more work than
# the two thresholds. A city whose coverage collapses for one year and recovers
# has not been measured the same way throughout, so everything before the gap is
# disqualified — which is how Blagoevgrad's 2003 and 2004 fall out on their own,
# its 2007 having dropped to 6 districts of a current 13.
#
# The thresholds are deliberately low, because the depth is the point: on the
# 2026-08-09 probe every one of the 26 non-Sofia cities keeps a trend, most of
# them reaching 2003 to 2007.
#
# **The two cross at 15 districts, so which one decides depends on the city.**
# For the 16 cities at or below that — Ловеч at 7 through Враца, Габрово and
# Ямбол at 15 — the share computes 2.8 to 6.0 and the flat 6 binds; the share
# only decides for the 11 larger ones. So a small city's year is admitted on 6
# districts whatever share that is, and in Плевен's case 6 of 11 is 55%, above
# the 40% the rule asks for.
#
# What it costs: the worst year-over-year move left inside any published
# window, Плевен's 120% across 2003-04, is a reading over 6 districts. It is
# published with its own `n_districts` on the row rather than hidden — but that
# is in the file and on no screen, so a reader meeting «+X% от 2003» cannot see
# it. Moving either threshold to exclude it is not a decision to take from the
# published file: it needs the per-city-year counts from a live probe.
_HISTORY_MIN_DISTRICTS = 6
_HISTORY_MIN_SHARE = 0.40

# How long a run has to be before the SPA prints a «since YEAR» sentence. Below
# this the chart still carries every qualifying year — the data is not in doubt,
# there is simply not enough of it to call a trend, and «+2% since last year» in
# the voice of a two-decade series is the wrong claim rather than a small one.
MIN_TREND_YEARS = 5


def _decode_imot_html(raw: bytes) -> str:
    """Decode an imot.bg page body. windows-1251 is the truth; utf-8 is
    only a fallback when the bytes are genuinely utf-8 (newer pages
    sometimes ship as utf-8).
    """
    try:
        return raw.decode("windows-1251")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def _assert_sales_page(url: str) -> None:
    """Refuse any URL that is not one of имот.bg's sales pages.

    Checked on the URL we are about to request AND on the final URL after
    redirects, because the rentals pages serve the same variable name at a tenth
    of the magnitude and nothing about the parsed literal would say which page
    it came from. See §1 in the module docstring.
    """
    path = urlparse(url).path.rstrip("/") or "/"
    if _RENTALS_MARKER in path:
        raise ValueError(
            f"{url} is a rentals page. имот.bg serve the same "
            f"`raioniAvgPrice` identifier there in €/m² per MONTH, so parsing it "
            f"would publish a rent as a purchase price. Rentals are out of scope."
        )
    if path == _BARE_SALES_PATH or path.startswith(_SALES_PATH_PREFIX):
        return
    raise ValueError(
        f"{url} is not an имот.bg sales page: its path is neither "
        f"{_BARE_SALES_PATH!r} (София's canonical page) nor under "
        f"{_SALES_PATH_PREFIX!r}."
    )


def city_url(region: Region, year: int | None = None) -> str:
    """The sales page for one city, optionally for a historical year.

    София's canonical page is the bare `/sredni-ceni`; `prodazhbi-sofiya`
    302-redirects there. Requesting the slug URL for her would work — the
    connector follows redirects — but it would also mean the URL published as
    that city's provenance is one that answers with a redirect rather than the
    page, so the canonical one is used.

    **No `date=`, ever.** See §2 in the module docstring.
    """
    base = (
        SOURCE_URL
        if region.code == SOFIA_CITY_CODE
        else CITY_URL_TEMPLATE.format(slug=region.imot_slug)
    )
    return f"{base}?year={year}" if year is not None else base


def _parse_raioni_avg_price_block(html: str, url: str) -> tuple[dict[str, int], int]:
    """Pull the `var raioniAvgPrice = {...}` literal.

    Returns `(surviving districts, count dropped against the sanity bounds)`.
    The count is the whole point of returning a tuple: a drop that nobody counts
    is a thin dataset published as a complete one.

    Raises when a value is fractional. Sale prices are whole euros per m² on
    every page probed; the rentals literal is floats. So a decimal point here
    means the parse is on the wrong page — a second lock on §1, independent of
    the URL check, because the two fail for different reasons.
    """
    m = re.search(r"var\s+raioniAvgPrice\s*=\s*\{(.+?)\}\s*;", html, re.DOTALL)
    if not m:
        anchor = html.find("raioniAvgPrice")
        # Both branches say "no price literal", because both are the same
        # failure to a caller: this page carries no data. They differ only in
        # what they can show for debugging — a year имот.bg has nothing for
        # serves the form shell with no anchor at all, while a layout change
        # leaves the identifier somewhere the regex no longer reaches.
        detail = (
            "sample around the expected anchor: "
            + html[max(0, anchor - 80) : anchor + 200].replace("\n", " ")
            if anchor >= 0
            else "the 'raioniAvgPrice' identifier is not on the page at all, "
            "which is what имот.bg serve for a year they have no data for"
        )
        raise ValueError(f"{url}: no price literal — {detail}")

    districts: dict[str, int] = {}
    dropped = 0
    for kmatch in re.finditer(r"'((?:[^'\\]|\\.)*)'\s*:\s*(\d+(?:\.\d+)?)", m.group(1)):
        key = kmatch.group(1).strip()
        raw = kmatch.group(2)
        if "." in raw:
            raise ValueError(
                f"{url}: district {key!r} carries the fractional value {raw}. "
                f"имот.bg publish sale prices as whole €/m² and rents as floats, "
                f"so this is a rentals literal — refusing to publish a monthly "
                f"rent as a purchase price."
            )
        val = int(raw)
        if not _MIN_VALID_EUR_M2 <= val <= _MAX_VALID_EUR_M2:
            dropped += 1
            continue
        districts[key] = val
    return districts, dropped


def _snapshot_dates(html: str) -> list[str]:
    """Every `DD.MM.YYYY` in the page's own `<select name="date">`, in page order.

    This list is имот.bg's statement about which snapshots they have. Nothing
    here synthesizes a date, and nothing sends one back — see §2 in the module
    docstring. An unparseable list is not fatal: the prices are still real, and
    the payload says `snapshot_date: null` rather than claiming a day.
    """
    select = re.search(
        r"<select[^>]*\bname\s*=\s*[\"']?date[\"']?[^>]*>(.*?)</select>",
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if not select:
        return []
    return re.findall(r"\b(\d{1,2}\.\d{1,2}\.\d{4})\b", select.group(1))


def _newest_snapshot_date(html: str) -> str | None:
    """The newest date имот.bg's own snapshot list offers, or None.

    Newest BY DATE rather than by position: the list's order is theirs to
    change, and taking the last option because it is last would publish whatever
    they happen to render at the bottom under the words "as published".
    """
    parsed: list[tuple[tuple[int, int, int], str]] = []
    for text in _snapshot_dates(html):
        d, m, y = (int(p) for p in text.split("."))
        try:
            date(y, m, d)
        except ValueError:
            # A date the site could not have a snapshot for. Skipped rather than
            # fatal — one bad option should not cost the provenance of the rest.
            continue
        parsed.append(((y, m, d), text))
    if not parsed:
        return None
    return max(parsed)[1]


def _min_districts_for(region: Region) -> int:
    """The district floor for one city — see `_MIN_DISTRICT_SHARE`."""
    return max(_MIN_DISTRICT_FLOOR, int(region.imot_districts * _MIN_DISTRICT_SHARE))


def _get_page(url: str, timeout: float) -> str:
    """Fetch one sales page, checking what it is before and after redirects."""
    _assert_sales_page(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Vyarno.bg data pipeline)",
        "Accept-Charset": "windows-1251,utf-8;q=0.9",
    }
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()
        # имот.bg redirect `prodazhbi-sofiya` to the bare page, so a redirect is
        # normal — but it is also how a request could land somewhere else
        # entirely, and the literal would not say so.
        _assert_sales_page(str(r.url))
        return _decode_imot_html(r.content)


def fetch_city_prices(region: Region, timeout: float = 30.0) -> dict[str, Any]:
    """Fetch one city's current per-district €/m².

    Returns `{"code", "url", "snapshot_date", "districts", "n_districts",
    "n_dropped"}`. `snapshot_date` is имот.bg's own newest published snapshot,
    read from the page, or None when the list could not be parsed.

    Raises:
        httpx.HTTPError — network failure (403 from a datacenter IP included)
        ValueError      — not a sales page, literal absent, a fractional value,
                          or fewer districts than this city's floor
    """
    url = city_url(region)
    html = _get_page(url, timeout)
    districts, dropped = _parse_raioni_avg_price_block(html, url)

    floor = _min_districts_for(region)
    if len(districts) < floor:
        raise ValueError(
            f"{url}: {len(districts)} valid districts parsed, below this city's "
            f"floor of {floor} ({region.imot_districts} on the probe date × "
            f"{_MIN_DISTRICT_SHARE:.0%}). имот.bg retiring a district or two "
            f"moves this by a few per cent; a count this far down means the "
            f"regex caught a fragment."
        )
    _assert_drop_share(url, len(districts), dropped)

    return {
        "code": region.code,
        "url": url,
        "snapshot_date": _newest_snapshot_date(html),
        "districts": districts,
        "n_districts": len(districts),
        "n_dropped": dropped,
    }


def fetch_city_prices_for_year(region: Region, year: int, timeout: float = 30.0) -> dict[str, Any]:
    """Fetch one city's archive for a single year.

    A year имот.bg has no data for returns 200 with **no literal at all** and a
    page about a quarter of the usual size, so the caller sees a `ValueError`
    from the parse rather than a plausible-looking thin year. That asymmetry
    with `date=` is the reason `year=` is safe to send and `date=` is not.

    No district floor is applied here. The floor belongs to the current-year
    read, which is what the headline is; a historical year is admitted or
    refused by `qualifying_years` instead, on a rule about the whole series
    rather than one year in isolation.
    """
    if year > clock.today().year:
        raise ValueError(f"year {year} is in the future; имот.bg has no archive for it")
    url = city_url(region, year=year)
    html = _get_page(url, timeout)
    districts, dropped = _parse_raioni_avg_price_block(html, url)
    _assert_drop_share(url, len(districts), dropped)
    return {
        "year": year,
        "code": region.code,
        "url": url,
        "districts": districts,
        "n_districts": len(districts),
        "n_dropped": dropped,
    }


def _assert_drop_share(url: str, kept: int, dropped: int) -> None:
    """Fail when too much of a page fell outside the sanity bounds — see §4."""
    total = kept + dropped
    if total and dropped / total > MAX_DROPPED_SHARE:
        raise ValueError(
            f"{url}: {dropped} of {total} rows fell outside "
            f"[{_MIN_VALID_EUR_M2}, {_MAX_VALID_EUR_M2}] €/m², which is "
            f"{dropped / total:.0%} — above the {MAX_DROPPED_SHARE:.0%} ceiling. "
            f"Real pages drop nothing this current and at most 10% historically, "
            f"so this is the regex matching something that is not a price. Do "
            f"not widen the bounds: the out-of-band values are sentinels, not "
            f"cheap flats."
        )


def qualifying_years(per_year: dict[int, int], current_year: int) -> list[int]:
    """Which years of one city's history may be published, newest run only.

    `per_year` maps year -> district count after the sanity filter. Returns the
    unbroken run of qualifying years ending at `current_year`, ascending, or an
    empty list when the current year itself does not qualify.

    The rule and the reasoning are at `_HISTORY_MIN_DISTRICTS`. What matters
    here is that the run is anchored at the present and walked BACKWARDS: a
    qualifying year with a non-qualifying year after it is not part of the same
    measurement, and admitting it would date the series to a coverage era the
    rest of it is not from.
    """
    current = per_year.get(current_year, 0)
    if current <= 0:
        return []
    need = max(_HISTORY_MIN_DISTRICTS, current * _HISTORY_MIN_SHARE)
    run: list[int] = []
    year = current_year
    while per_year.get(year, 0) >= need:
        run.append(year)
        year -= 1
    return sorted(run)


def _summary_stats(districts: dict[str, int]) -> dict[str, float | int]:
    """Median / mean / min / max from a per-district dict.

    Re-filtered against the anti-injection bounds — last line of defence for a
    caller that did not come through the fetcher (a hand-pasted JSON, a cached
    replay, a test bug).
    """
    safe = {k: v for k, v in districts.items() if _MIN_VALID_EUR_M2 <= v <= _MAX_VALID_EUR_M2}
    if not safe:
        raise ValueError("no districts survive the sanity bounds")
    prices = sorted(safe.values())
    return {
        "n_districts": len(safe),
        "eur_per_m2_median": statistics.median(prices),
        "eur_per_m2_mean": round(sum(prices) / len(prices), 1),
        "eur_per_m2_min": min(prices),
        "eur_per_m2_max": max(prices),
    }


def build_city_row(
    region: Region,
    current: dict[str, Any],
    historical: list[dict[str, Any]],
    current_year: int,
) -> dict[str, Any]:
    """One city's block of `city_price.json`.

    `historical` is whatever years were fetched; years that failed are simply
    absent, and `qualifying_years` then decides which of the rest are published.
    The current year's row comes from `current` rather than from the archive
    fetch of the same year, so the headline and the newest point of the trend
    are the same read.

    **`since_baseline_median_pct` is ours and the payload says so.** It is a
    ratio of two имот.bg medians, which are themselves ours — имот.bg publish
    per-district averages and no city median at all — so nothing here is a
    figure of theirs restated.
    """
    stats = _summary_stats(current["districts"])
    by_year = {h["year"]: h for h in historical if "year" in h}
    by_year[current_year] = current
    counts = {
        y: len(
            {k: v for k, v in h["districts"].items() if _MIN_VALID_EUR_M2 <= v <= _MAX_VALID_EUR_M2}
        )
        for y, h in by_year.items()
    }
    years = qualifying_years(counts, current_year)

    rows: list[dict[str, Any]] = []
    baseline_median = 0.0
    for i, year in enumerate(years):
        s = _summary_stats(by_year[year]["districts"])
        median = float(s["eur_per_m2_median"])
        if i == 0:
            baseline_median = median
        rows.append(
            {
                "year": year,
                "n_districts": s["n_districts"],
                "n_dropped": by_year[year].get("n_dropped", 0),
                "eur_per_m2_median": s["eur_per_m2_median"],
                "eur_per_m2_mean": s["eur_per_m2_mean"],
                "since_baseline_median_pct": (
                    0.0 if i == 0 else round(100.0 * (median / baseline_median - 1.0), 1)
                ),
            }
        )

    return {
        "code": region.code,
        "bg_name": region.city_bg,
        "en_name": region.city_en,
        "source_url": current["url"],
        "snapshot_date": current["snapshot_date"],
        "n_districts": stats["n_districts"],
        "n_dropped": current["n_dropped"],
        "eur_per_m2_median": stats["eur_per_m2_median"],
        "eur_per_m2_mean": stats["eur_per_m2_mean"],
        "eur_per_m2_min": stats["eur_per_m2_min"],
        "eur_per_m2_max": stats["eur_per_m2_max"],
        "baseline_year": rows[0]["year"] if rows else 0,
        "since_baseline_median_pct": rows[-1]["since_baseline_median_pct"] if rows else 0.0,
        # Whether the run is long enough for the SPA to print a «since YEAR»
        # sentence. A fact about the series, decided here rather than by each
        # surface counting the rows and reaching its own conclusion.
        "trend_publishable": len(rows) >= MIN_TREND_YEARS,
        "historical": rows,
    }


def build_city_price_payload(
    today: date, cities: list[dict[str, Any]], city_pages: list[str]
) -> dict[str, Any]:
    """The JSON envelope published as data/published/city_price.json.

    **`city_pages` is the coverage claim and `cities` is the run's result**, and
    they are separate fields because they answer separate questions. `city_pages`
    is every област имот.bg serve a `sredni-ceni` page for — 27 of the 28,
    `regions.py#PRICED_REGIONS` — and it is a fact about имот.bg that holds
    whether or not a refresh reached them. `cities` is what this run actually
    read.

    Nothing downstream can tell the two apart without both. A code in neither is
    Софийска област, whose towns имот.bg do not publish, and the SPA is entitled
    to say so in their name; a code in `city_pages` but not in `cities` is a
    refresh that did not get there, and saying «имот.bg не публикува цени за
    Варна» about it is simply false. One list made the second sentence
    unavoidable — it was on screen for twenty-six cities.

    **`all_districts` is not in it.** The per-district dict was published for
    every city and read by nothing — no component, no view function, no verify
    script — and at 27 cities it would be about 120 KB raw and 40 KB gzipped
    that every reader downloads to serve a field nothing renders. What is lost
    with it is the only way to recompute a median from the file itself; the
    median, the mean, the min, the max and the district count stay, which is
    what the page actually cites.
    """
    total_districts = sum(int(c["n_districts"]) for c in cities)
    # `n_dropped` is null on a row read before the counter existed, which is a
    # different claim from zero — a run that did not count is not a run that
    # counted none. Summed as zero here and reported as "recorded" below, so the
    # envelope never states a total it cannot support.
    counted = [c for c in cities if c["n_dropped"] is not None]
    total_dropped = sum(int(c["n_dropped"]) for c in counted)
    with_trend = sum(1 for c in cities if c["trend_publishable"])
    undated = [c["code"] for c in cities if not c["snapshot_date"]]
    unread = [code for code in city_pages if code not in {c["code"] for c in cities}]

    return {
        "schema_version": "2.0",
        "as_of": today.isoformat(),
        "source": "imot.bg",
        "source_url": SOURCE_URL,
        # "read from", not "scraped from": `notes` ships inside the payload, and
        # what this connector does is fetch published pages with a
        # self-identifying User-Agent. docs/legal.md §имот.bg turns on that
        # description being accurate.
        "notes": (
            f"Per-district €/m² asking-price averages read from imot.bg's "
            f"sredni-ceni pages on {today.isoformat()}, for {len(cities)} cities. "
            f"{total_districts} districts parsed in total after counting out "
            f"{total_dropped} values outside [{_MIN_VALID_EUR_M2}, "
            f"{_MAX_VALID_EUR_M2}] €/m² as injection sanity bounds across the "
            f"{len(counted)} city page(s) that recorded a count; each city-year "
            f"publishes its own `n_dropped`. The median is the headline, being "
            f"resistant to long-tail districts; the mean is included for "
            f"completeness. `snapshot_date` is imot.bg's own newest published "
            f"snapshot, read from each page's date list — not the day we looked, "
            f"which is `as_of` above. "
            + (
                f"{len(undated)} city page(s) served no parseable snapshot list "
                f"({', '.join(undated)}), so only `as_of` dates those. "
                if undated
                else ""
            )
            + (
                f"imot.bg serve a sredni-ceni page for {len(city_pages)} cities "
                f"(`city_pages`); this run read {len(cities)} of them"
                + (f", leaving {', '.join(unread)} unread. " if unread else ". ")
            )
            + f"{with_trend} of {len(cities)} cities carry enough consecutive "
            f"years of comparable coverage for a since-baseline comparison; the "
            f"rest publish a current €/m² only. Every median and every "
            f"since-baseline percentage is computed by us from imot.bg's "
            f"per-district averages — imot.bg publish no city median."
        ),
        "payload_name": "city_price",
        # Every област имот.bg serve a page for, whether or not this run reached
        # it. See the docstring: a code missing from `cities` and present here is
        # a gap in the refresh, and a code in neither is a place имот.bg do not
        # publish. Only the second may be said in имот.bg's name.
        "city_pages": list(city_pages),
        "cities": cities,
    }
