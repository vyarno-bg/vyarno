"""Tests for the имот.bg per-city €/m² connector.

**Everything here runs against fixtures, and it has to.** `www.imot.bg` answers
datacenter IPs with a 403 — confirmed again from this container — so no test
that CI can run may touch the live site. `fixtures/make_imot_fixtures.py` says
what each fixture encodes and which probe it was transcribed from; the live
check is `test_live_upstreams.py -m live`, run from a Bulgarian connection.

The four failure modes the connector exists to prevent each get a test that
names it, because each publishes a wrong number that looks entirely right:
a rentals page parsed as sales, a snapshot published under a date имот.bg does
not have, a truncated parse published as a small city, and rows dropped
silently.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from vyarno_pipeline import clock
from vyarno_pipeline.regions import PRICED_REGIONS, REGIONS_BY_CODE
from vyarno_pipeline.sources import imot
from vyarno_pipeline.sources.imot import (
    MAX_DROPPED_SHARE,
    MIN_TREND_YEARS,
    SOURCE_URL,
    _min_districts_for,
    _newest_snapshot_date,
    _parse_raioni_avg_price_block,
    build_city_price_payload,
    build_city_row,
    city_url,
    fetch_city_prices,
    fetch_city_prices_for_year,
    qualifying_years,
)

FIXTURES = Path(__file__).parent / "fixtures"
NEWEST_SNAPSHOT = "6.8.2026"

SOFIA = REGIONS_BY_CODE["sofiya"]
TARGOVISHTE = REGIONS_BY_CODE["targovishte"]
RUSE = REGIONS_BY_CODE["ruse"]
LOVECH = REGIONS_BY_CODE["lovech"]

# The current year, from the clock. Every year this module builds is relative to
# it: имот.bg's archive grows by one every January, and a fixture pinned to a
# literal year stops being "the current page" the moment the calendar passes it.
THIS_YEAR = clock.today().year


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _serve(monkeypatch: pytest.MonkeyPatch, name: str, *, final_url: str | None = None):
    """Serve one fixture for every fetch, optionally under a redirected URL.

    Only the page getter is replaced, so the URL checks, the parse, the district
    floor and the drop gate all run exactly as they do in production. `final_url`
    stands in for a redirect имот.bg performed.
    """
    html = imot._decode_imot_html(_fixture(name))

    def fake_get(url: str, timeout: float) -> str:
        imot._assert_sales_page(url)
        imot._assert_sales_page(final_url or url)
        return html

    monkeypatch.setattr(imot, "_get_page", fake_get)


# ---------------------------------------------------------------------------
# 1. Rentals must never be published as sales
# ---------------------------------------------------------------------------


def test_a_rentals_url_is_refused_before_it_is_fetched() -> None:
    """`/sredni-ceni/naemi-{slug}` serves the SAME variable name.

    Values there are €/m² per MONTH — 1.39 to 32.48 across the cities — so a
    parse that reached one would publish a rent as a purchase price. The refusal
    is on the URL, before a request is made, so the path is unreachable rather
    than merely unused.
    """
    with pytest.raises(ValueError, match="rentals page"):
        imot._assert_sales_page("https://www.imot.bg/sredni-ceni/naemi-sofiya")
    with pytest.raises(ValueError, match="rentals page"):
        imot._assert_sales_page("https://www.imot.bg/sredni-ceni/naemi-varna?year=2020")


def test_a_redirect_onto_a_rentals_page_is_refused_after_the_fetch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The URL requested is not the URL answered.

    имот.bg 302-redirect `prodazhbi-sofiya` to the bare page, so a redirect is
    normal here — which is exactly why the final URL has to be checked too. The
    literal alone would never say which page it came from.
    """
    _serve(
        monkeypatch,
        "imot_rentals.html",
        final_url="https://www.imot.bg/sredni-ceni/naemi-sofiya",
    )
    with pytest.raises(ValueError, match="rentals page"):
        fetch_city_prices(SOFIA)


def test_a_fractional_value_is_refused_even_on_a_sales_url() -> None:
    """The second lock, and it fails for a different reason than the first.

    имот.bg publish sale prices as whole €/m² and rents as floats. A decimal
    point in the literal therefore means the parse is on a rentals page whatever
    the URL said — which covers имот.bg moving rentals under the sales prefix,
    the one change that would defeat the URL check on its own.
    """
    html = imot._decode_imot_html(_fixture("imot_rentals.html"))
    with pytest.raises(ValueError, match="fractional value"):
        _parse_raioni_avg_price_block(html, SOURCE_URL)


def test_the_rentals_values_would_not_merely_be_dropped() -> None:
    """Why the two locks above exist rather than trusting the sanity bounds.

    Every rentals value is below 100, so the bounds WOULD drop them all — and
    that is a thin dataset published as a complete one, or a floor failure whose
    message says nothing about rentals. Being explicit is the difference between
    a run that stops and says why and a run that stops and misleads.
    """
    html = imot._decode_imot_html(_fixture("imot_rentals.html"))
    values = [float(v) for v in re.findall(r":\s*(\d+\.\d+)", html)]
    assert values, "the rentals fixture no longer carries float values"
    assert all(v < 100 for v in values)


# ---------------------------------------------------------------------------
# 2. A snapshot may never be published under a date имот.bg does not have
# ---------------------------------------------------------------------------


def test_no_url_this_connector_builds_carries_a_date_parameter() -> None:
    """`date=` is silently ignored when имот.bg does not have it.

    An invalid, future or out-of-range value returns a response byte-identical
    to the no-parameter baseline, so a connector that asked for an old snapshot
    would publish today's numbers under that date and every gate downstream
    would pass, the file being internally consistent.

    The protection is that there is no code path that sends one. This asserts
    that over every URL the connector can build, for every city and every year
    in the archive — a `date=` added later fails here rather than in production.
    """
    for region in PRICED_REGIONS:
        for year in [None, *range(2000, THIS_YEAR + 1)]:
            url = city_url(region, year=year)
            assert "date=" not in url, url


def test_the_snapshot_date_is_read_from_the_page_and_is_the_newest_by_date() -> None:
    """имот.bg's own list is the anchor, and the newest entry is their date.

    Taken by date rather than by position: the list's order is theirs to change,
    and publishing whatever they render last under the words "as published"
    would be a claim about their markup rather than about their data. The
    fixture's list is deliberately out of order for that reason.
    """
    html = imot._decode_imot_html(_fixture("imot_city_large.html"))
    assert _newest_snapshot_date(html) == NEWEST_SNAPSHOT


def test_a_page_with_no_parseable_date_list_publishes_no_date_rather_than_a_wrong_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The prices are still real, so this is not fatal.

    What it must not do is fall back to the fetch date and call it имот.bg's:
    that is the claim the retired «обновена на» extractor was making by
    accident, silently, on every page it ever ran against.
    """
    _serve(monkeypatch, "imot_no_date_list.html")
    assert fetch_city_prices(TARGOVISHTE)["snapshot_date"] is None


def test_the_dead_page_date_extractor_is_gone() -> None:
    """«обновен» appears on no имот.bg page, current or historical.

    Probed across all 27 cities plus Sofia back to 2000: zero matches. The
    extractor that looked for it shipped an empty string for the life of the
    payload, and the fixture that made it look alive was the only place the
    string existed.
    """
    assert not hasattr(imot, "_extract_page_as_of")
    for path in FIXTURES.glob("imot_*.html"):
        assert "обновен" not in imot._decode_imot_html(path.read_bytes())


# ---------------------------------------------------------------------------
# 3. A truncated parse must never be published as a small city
# ---------------------------------------------------------------------------


def test_the_district_floor_passes_the_smallest_city_and_fails_a_fragment() -> None:
    """The two things a flat floor cannot do at once.

    Ловеч publishes 7 districts and is real; a София page that returned 7 is a
    regex that caught a fragment. `_MIN_VALID_DISTRICT_COUNT = 20` rejected the
    first and a floor low enough to pass it would accept the second, so the
    floor is a share of what each city itself publishes.
    """
    assert _min_districts_for(LOVECH) <= LOVECH.imot_districts
    assert _min_districts_for(SOFIA) > LOVECH.imot_districts
    # And the share leaves room for имот.bg retiring districts — София moved
    # 143 to 141 between the last published payload and the probe, ~1.4%.
    assert _min_districts_for(SOFIA) < SOFIA.imot_districts * 0.95


def test_every_covered_city_clears_its_own_floor_at_its_probed_count() -> None:
    """A floor no real city can clear is a feature that ships broken.

    The old flat 20 would have rejected twelve of the twenty-seven outright.
    """
    for region in PRICED_REGIONS:
        assert region.imot_districts >= _min_districts_for(region), region.code


def test_a_thin_page_for_a_large_city_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """The eight-district fixture is a real page for Търговище and a fragment
    for София. Same bytes, opposite verdicts — which is the whole point of a
    per-city floor."""
    _serve(monkeypatch, "imot_city_small.html")
    assert fetch_city_prices(TARGOVISHTE)["n_districts"] == 8
    with pytest.raises(ValueError, match="below this city's floor"):
        fetch_city_prices(SOFIA)


def test_a_year_with_no_data_raises_rather_than_publishing_an_empty_year(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`year=` is the safe parameter, and this is why.

    A year имот.bg has nothing for returns 200 with no literal at all, so the
    parse fails loudly. That asymmetry with `date=`, which silently serves the
    current snapshot, is the single most important thing about these two URL
    parameters.
    """
    _serve(monkeypatch, "imot_no_data_year.html")
    with pytest.raises(ValueError, match="no price literal"):
        fetch_city_prices_for_year(LOVECH, THIS_YEAR - 20)


def test_a_future_year_is_refused_without_a_request(monkeypatch: pytest.MonkeyPatch) -> None:
    """имот.bg has no archive ahead of today, and asking would return the
    current page — the `date=` failure in a different costume."""
    with pytest.raises(ValueError, match="in the future"):
        fetch_city_prices_for_year(SOFIA, THIS_YEAR + 1)


# ---------------------------------------------------------------------------
# 4. Dropped rows must be counted, and a page that drops too many must fail
# ---------------------------------------------------------------------------


def test_out_of_bounds_rows_are_counted_rather_than_only_dropped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The sentinels are real and they stay dropped; what changes is the silence.

    имот.bg's history carries 0, 4, 5, 6, 9 and 13 €/m² rows — sentinels, not
    cheap flats — so the bounds are right and widening them to admit the 13
    while still rejecting the 9 would draw an arbitrary line through junk. The
    defect was that nothing said how many had gone.
    """
    _serve(monkeypatch, "imot_city_with_sentinels.html")
    got = fetch_city_prices(RUSE)
    assert got["n_dropped"] == 2
    assert got["n_districts"] == 18
    # And the dropped values are not in the surviving set at any magnitude.
    assert min(got["districts"].values()) >= 100


def test_a_page_dropping_more_than_the_ceiling_fails_the_run() -> None:
    """Above the ceiling this is not a value problem, it is a parse problem.

    The threshold is measured: inside the windows this connector publishes, only
    5 of 186 city-years drop anything and the worst is 2 of 20. A page dropping
    a fifth of its rows has a regex matching something that is not a price.
    """
    assert MAX_DROPPED_SHARE == 0.20
    imot._assert_drop_share(SOURCE_URL, kept=18, dropped=2)  # 10%, the observed worst
    with pytest.raises(ValueError, match="above the 20% ceiling"):
        imot._assert_drop_share(SOURCE_URL, kept=10, dropped=6)


def test_the_gate_does_not_fire_on_a_page_that_drops_nothing() -> None:
    """A tolerance that fails on correct data is a wrong rule, not a tight one.
    All 27 cities' current pages dropped zero rows on the probe."""
    imot._assert_drop_share(SOURCE_URL, kept=141, dropped=0)


# ---------------------------------------------------------------------------
# Which years may be published
# ---------------------------------------------------------------------------


def test_the_trend_window_is_the_unbroken_run_back_from_the_current_year() -> None:
    """A gap disqualifies everything before it.

    имот.bg's coverage of a city grew over two decades, and a median over four
    districts is not the same measurement as a median over thirteen. The
    thresholds alone would still admit an early year that happens to clear them
    with a collapse just after it; the run is what makes the published series
    one measurement throughout.
    """
    counts = {
        THIS_YEAR - 6: 12,
        THIS_YEAR - 5: 13,
        THIS_YEAR - 4: 5,  # the collapse
        THIS_YEAR - 3: 12,
        THIS_YEAR - 2: 12,
        THIS_YEAR - 1: 13,
        THIS_YEAR: 13,
    }
    assert qualifying_years(counts, THIS_YEAR) == [
        THIS_YEAR - 3,
        THIS_YEAR - 2,
        THIS_YEAR - 1,
        THIS_YEAR,
    ]


def test_a_thin_year_is_excluded_by_the_share_even_when_it_clears_the_count() -> None:
    """Six districts is enough for Ловеч and not for Варна.

    The absolute floor alone would publish Варна's six-district 2004 beside its
    sixty-nine-district present and call the ratio a price move.
    """
    small = dict.fromkeys(range(THIS_YEAR - 3, THIS_YEAR + 1), 7)
    assert qualifying_years(small, THIS_YEAR) == sorted(small)

    large = dict.fromkeys(range(THIS_YEAR - 3, THIS_YEAR + 1), 69)
    large[THIS_YEAR - 3] = 7
    assert THIS_YEAR - 3 not in qualifying_years(large, THIS_YEAR)


def test_a_city_whose_current_year_is_missing_publishes_no_trend() -> None:
    """The run is anchored at the present. Without a current year there is
    nothing for an older year to be comparable TO."""
    assert qualifying_years({THIS_YEAR - 2: 20, THIS_YEAR - 1: 20}, THIS_YEAR) == []
    assert qualifying_years({}, THIS_YEAR) == []


# ---------------------------------------------------------------------------
# The payload
# ---------------------------------------------------------------------------


def _districts(n: int, base: int = 1000) -> dict[str, int]:
    return {f"D{i}": base + i * 10 for i in range(n)}


def _row(region, years: dict[int, int]):
    current = {
        "code": region.code,
        "url": city_url(region),
        "snapshot_date": NEWEST_SNAPSHOT,
        "districts": _districts(years[THIS_YEAR]),
        "n_districts": years[THIS_YEAR],
        "n_dropped": 0,
    }
    historical = [
        {"year": y, "districts": _districts(n, base=400), "n_districts": n, "n_dropped": 0}
        for y, n in sorted(years.items())
        if y != THIS_YEAR
    ]
    return build_city_row(region, current, historical, THIS_YEAR)


def test_the_city_row_carries_both_published_names_and_its_own_source_url() -> None:
    """A blank name renders as a blank line in the picker, not a fallback, and
    a shared source_url would send every city's verify link to София."""
    row = _row(TARGOVISHTE, dict.fromkeys(range(THIS_YEAR - 9, THIS_YEAR + 1), 8))
    assert row["bg_name"] == "Търговище"
    assert row["en_name"] == "Targovishte"
    assert row["source_url"].endswith("/prodazhbi-targovishte")
    assert row["code"] == "targovishte"


def test_sofia_is_published_under_her_canonical_url() -> None:
    """`prodazhbi-sofiya` 302-redirects to the bare page, so publishing the slug
    URL as provenance would point a reader's verify link at a redirect rather
    than at the page the figure came from."""
    row = _row(SOFIA, dict.fromkeys(range(THIS_YEAR - 9, THIS_YEAR + 1), 141))
    assert row["source_url"] == SOURCE_URL


def test_the_since_baseline_percentage_is_measured_from_the_first_published_year() -> None:
    """The baseline is whichever year the rule admitted, per city, and the
    headline percentage has to be measured from that one — not from a constant
    year that means a different sample in every city."""
    years = dict.fromkeys(range(THIS_YEAR - 9, THIS_YEAR + 1), 20)
    row = _row(RUSE, years)
    assert row["baseline_year"] == THIS_YEAR - 9
    assert row["historical"][0]["since_baseline_median_pct"] == 0.0
    assert row["since_baseline_median_pct"] == row["historical"][-1]["since_baseline_median_pct"]
    # The fixture's baseline is built at 400 and the current year at 1000, both
    # 20 districts, so the medians stand in a known ratio.
    assert row["since_baseline_median_pct"] == pytest.approx(
        100
        * (
            row["historical"][-1]["eur_per_m2_median"] / row["historical"][0]["eur_per_m2_median"]
            - 1
        ),
        abs=0.05,
    )


def test_a_short_run_publishes_its_years_but_not_a_trend_sentence() -> None:
    """«+2% since last year» in the voice of a two-decade series is the wrong
    claim rather than a small one — so the chart keeps every qualifying year and
    the sentence is withheld."""
    short = _row(SOFIA, dict.fromkeys(range(THIS_YEAR - 1, THIS_YEAR + 1), 141))
    assert len(short["historical"]) == 2
    assert short["trend_publishable"] is False

    long = _row(SOFIA, dict.fromkeys(range(THIS_YEAR - MIN_TREND_YEARS + 1, THIS_YEAR + 1), 141))
    assert long["trend_publishable"] is True


def test_the_payload_drops_the_per_district_dict() -> None:
    """`all_districts` was published for every city and read by nothing — no
    component, no view function, no verify script. At 27 cities it is ~120 KB
    raw and ~40 KB gzipped on every page load to serve a field nothing renders.
    """
    row = _row(SOFIA, dict.fromkeys(range(THIS_YEAR - 9, THIS_YEAR + 1), 141))
    payload = build_city_price_payload(clock.today(), [row])
    blob = str(payload)
    assert "all_districts" not in blob
    assert "D17" not in blob, "a district name reached the payload"
    # What replaces it: the figures the page actually cites.
    for key in ("eur_per_m2_median", "eur_per_m2_mean", "eur_per_m2_min", "eur_per_m2_max"):
        assert key in payload["cities"][0]


def test_the_payload_notes_state_the_drop_count_and_who_computed_the_median() -> None:
    """имот.bg publish per-district averages and no city median, so the median
    and every percentage off it are ours. A payload that did not say so would
    attribute our arithmetic to them."""
    row = _row(SOFIA, dict.fromkeys(range(THIS_YEAR - 9, THIS_YEAR + 1), 141))
    payload = build_city_price_payload(clock.today(), [row])
    assert "computed by us" in payload["notes"]
    assert "imot.bg publish no city median" in payload["notes"]
    assert payload["payload_name"] == "city_price"
    assert payload["schema_version"] == "2.0"
