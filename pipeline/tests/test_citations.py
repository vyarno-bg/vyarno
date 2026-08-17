"""Can the citation check still fail?

`citations.py` is a check that mostly reports OK, which is the shape of thing
that quietly stops working. So these hold the two halves it would fail at: the
verdicts have to be reachable, and the walk has to reach every citation in every
payload — a URL nothing visits is a URL nothing checks, and the report would say
so in a total nobody reads.

Offline. The network half is the command itself, deliberately out of `make
check` (`citations.py` §"Where it runs").
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from vyarno_pipeline.citations import (
    BROKEN,
    LIVENESS,
    OK,
    REVISED,
    STALE,
    UNCHECKABLE,
    _compare,
    _derived,
    _spliced,
    extract,
    tolerance_for,
)

PUBLISHED = Path(__file__).resolve().parents[2] / "data" / "published"

# Every host the walk knows how to read. A citation to anything else has to be
# named in UNCHECKABLE with a reason, which is what the last test holds.
READABLE_HOSTS = {"data-api.ecb.europa.eu", "ec.europa.eu"}


def test_a_value_that_moved_is_a_revision_and_not_a_broken_link():
    live = {"2026-05": 8.95, "2026-06": 8.76}
    assert _compare(live, {"2026-06": 8.76})[0] == OK
    verdict, detail, _ = _compare(live, {"2026-06": 8.90})
    assert verdict == REVISED
    assert "published 8.9" in detail and "upstream 8.76" in detail


def test_a_response_with_none_of_the_payloads_periods_is_broken():
    # The failure this exists for: a key that still resolves, still returns
    # SDMX, and describes a different series. Every period misses.
    verdict, detail, _ = _compare({"1999-01": 1.0}, {"2026-06": 8.76})
    assert verdict == BROKEN
    assert "serves something else" in detail


def test_an_upstream_ahead_of_the_payload_is_stale_and_not_a_fault():
    verdict, _, _ = _compare({"2026-06": 8.76, "2026-07": 8.80}, {"2026-06": 8.76})
    assert verdict == STALE


def test_a_citation_with_nothing_to_check_says_so_rather_than_passing():
    # `LIVENESS` and `OK` must not be the same word in the report: one means the
    # URL resolved and nothing was compared.
    verdict, _, checked = _compare({"2026-06": 8.76}, {})
    assert verdict == LIVENESS
    assert checked == 0


def test_the_tolerance_is_the_rounding_the_payload_already_did():
    # 8.76 against 8.7551 is the same figure; 8.76 against 8.90 is not.
    assert abs(8.7551 - 8.76) <= tolerance_for(8.76)
    assert abs(8.90 - 8.76) > tolerance_for(8.76)
    # An integer-valued payload figure is not given two decimals of slack.
    assert tolerance_for(1225.0) < 1.0


def test_a_spliced_series_is_only_held_to_the_currency_its_url_serves():
    # Every wording the payloads use for it, because no block uses all three and
    # missing one holds a BGN month to a euro key.
    assert _spliced({"dataset": "MIR …BGN.N spliced with …EUR.N"})
    assert _spliced({"unit": "millions, currency of the period"})
    assert _spliced({"_role": "the evidence for the BGN→EUR splice"})
    assert not _spliced({"dataset": "MIR M.BG.B.L22.A.R.A.2250.EUR.N"})


def test_a_derived_total_is_checked_through_its_components():
    node = {
        "total_eur_m": 30_862.889,
        "blocks": [{"block": "housing", "volume_eur_m": 18_580.075}],
        "source_url": "https://www.bnb.bg/x.xlsx",
    }
    assert _derived(node, "")
    # The sum is ours and is in no cell of the workbook; the addend is a cell.
    ((_, _, want),) = [(w, u, x) for w, u, x in extract(node)]
    assert want == {"housing": 18_580.075}


def test_a_second_citation_in_the_block_keeps_its_own_component():
    # The four blocks of what households owe come out of two workbooks, and the
    # overdraft one is cited separately. Holding the loan workbook to all four
    # reported a cell missing that was never supposed to be in it.
    node = {
        "total_eur_m": 100.0,
        "blocks": [
            {"block": "housing", "volume_eur_m": 60.0},
            {"block": "overdraft", "volume_eur_m": 40.0},
        ],
        "source_url": "https://www.bnb.bg/loans.xlsx",
        "overdraft_source_url": "https://www.bnb.bg/overdrafts.xlsx",
    }
    wants = {where: want for where, _, want in extract(node)}
    assert wants["source_url"] == {"housing": 60.0}
    assert "overdraft" not in wants["source_url"]


def test_a_bare_url_beside_two_series_checks_neither_rather_than_merging_them():
    # `non_performing` carries households and corporations beside a source_url
    # that is the household key. Merged, the household series was held to the
    # corporate figures and reported a revision every quarter on a correct
    # payload — the check reporting a fault it invented.
    node = {
        "ref_period": "2026-Q1",
        "households_by_period": {"2026-Q1": 2.37},
        "corporations_by_period": {"2026-Q1": 4.74},
        "source_url": "https://data-api.ecb.europa.eu/service/data/CBD2/Q.BG…",
    }
    ((_, _, want),) = extract(node)
    assert want == {}


def test_a_eurostat_citation_is_read_at_the_unit_it_declares():
    # One block, two cubes: the annual rate and the index. Picked by field-name
    # order instead, «2,3%» was held against an index of 182,45 on all thirteen
    # divisions at once.
    node = {
        "ref_period": "2026-06",
        "value": 182.45,
        "annual_rate_pct": 2.3,
        "api_url": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&unit=RCH_A",
        "api_url_index": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&unit=I15",
    }
    wants = {where: want for where, _, want in extract(node)}
    assert wants["api_url"] == {"2026-06": 2.3}
    assert wants["api_url_index"] == {"2026-06": 182.45}


def test_every_citation_in_every_payload_is_read_or_named_unreadable():
    """The walk reaches all of them, and each has somewhere to go.

    **This is the test that stops the report's totals from lying.** A new
    `source_url` on a host nothing reads would be counted, printed as UNCHECKED
    and scroll past; here it fails until somebody writes the sentence saying
    which it is. The complement matters as much: a citation the walk never
    visits is absent from the totals altogether.
    """
    seen: list[tuple[str, str]] = []
    for path in sorted(PUBLISHED.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for _where, url, _ in extract(payload):
            seen.append((path.name, url))
    assert seen, "the walk found no citations at all"

    homeless = sorted(
        {
            f"{name} {url}"
            for name, url in seen
            if urlparse(url).netloc not in READABLE_HOSTS
            and urlparse(url).netloc not in UNCHECKABLE
            and not urlparse(url).netloc.endswith("bnb.bg")
            and not url.lower().endswith(".xlsx")
        }
    )
    assert not homeless, (
        "citations on a host with no reader and no entry in UNCHECKABLE. Add a "
        "branch to check_one, or a sentence saying why it cannot be read:\n  "
        + "\n  ".join(homeless[:6])
    )

    # And the walk has to find what a plain grep for a URL finds, or the totals
    # are over a subset nobody declared.
    def grep(node) -> int:
        if isinstance(node, dict):
            return sum(
                1 if isinstance(v, str) and v.startswith("http") and ("url" in k) else grep(v)
                for k, v in node.items()
            )
        if isinstance(node, list):
            return sum(grep(v) for v in node)
        return 0

    total = sum(grep(json.loads(p.read_text(encoding="utf-8"))) for p in PUBLISHED.glob("*.json"))
    assert len(seen) == total, f"the walk visited {len(seen)} citations, a grep finds {total}"
