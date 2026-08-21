"""A refresh opens a pull request when an upstream republished, and at no other time.

The failure this file catches has shipped once: a pull request titled «data
refresh: hicp as of 2026-08-21» whose entire diff was fifteen dates — one `as_of`
in each of the two HICP payloads, plus a `published_at` inside every one of
`hicp_categories.json`'s thirteen category rows. Eurostat had republished
nothing, and this project spends exactly one human look on a published figure.

Two properties keep it out, and they are worth keeping apart. The run-stamped
fields have to leave the comparison AT EVERY DEPTH, because a strip that reaches
the top level of a payload leaves those thirteen in place. And the comparison has
to be RUN by something: a check that reads the workflow and confirms it NAMES the
right fields agrees, correctly and uselessly, with a strip that never reaches
them.

So the tests below call `refresh_report.py`, and the pair fed to the first of
them is the pair from that pull request, byte for byte. `test_cli_dispatch.py`
keeps the other half: that `refresh.yml` asks this module rather than deciding
for itself.
"""

from __future__ import annotations

import json
import subprocess
from datetime import date
from pathlib import Path

import pytest

from vyarno_pipeline.refresh_report import (
    RUN_STAMPED,
    build_report,
    committed_reader,
    has_real_change,
    step_summary,
    strip_run_stamps,
)

FIXTURES = Path(__file__).parent / "fixtures"
PUBLISHED = Path(__file__).resolve().parents[2] / "data" / "published"

# The two committed versions of `hicp_categories.json` either side of the
# refresh commit, verbatim. They are kept whole rather than cut down because the
# claim under test is that NOTHING in them differs but the dates, and a trimmed
# payload only supports that claim for the rows somebody chose to keep.
PR_135_BEFORE = FIXTURES / "hicp_categories_2026_08_19.json"
PR_135_AFTER = FIXTURES / "hicp_categories_2026_08_21.json"


def _load(path: Path) -> dict:
    return json.loads(path.read_text("utf-8"))


def _paths_holding(node: object, wanted: object, path: str = "") -> list[str]:
    """Every path in `node` whose leaf value is `wanted`, at any depth."""
    if isinstance(node, dict):
        return [p for k, v in node.items() for p in _paths_holding(v, wanted, f"{path}.{k}")]
    if isinstance(node, list):
        return [p for i, v in enumerate(node) for p in _paths_holding(v, wanted, f"{path}[{i}]")]
    return [path] if node == wanted else []


def test_a_pair_that_differs_only_by_the_day_it_was_fetched_is_not_a_refresh() -> None:
    """The exact pair from the pull request that moved no number.

    Reading Eurostat twice across a weekend produces this: identical rates,
    identical weights, identical index history, a later run date. A comparison
    that calls it a change opens a branch, a pull request and a CI run over two
    days of the calendar — and the arm it happens to be on is the one that
    refreshes most often, on two crons plus a watcher on both release windows.
    """
    before, after = _load(PR_135_BEFORE), _load(PR_135_AFTER)
    assert before != after, "the fixtures are identical, so this asserts nothing"

    assert not has_real_change(after, before), (
        "the pair from the pull request reads as a data refresh. Every field that "
        "differs between these two files holds the date the pipeline ran."
    )


def test_a_figure_moving_by_a_tenth_of_a_point_is_a_refresh() -> None:
    """The other direction, on the same pair, so the test above cannot pass by inertia.

    A comparison that answered "no change" to everything would satisfy the first
    test perfectly, and would stop the site publishing anything ever — silently,
    because a run that skips its commit still exits 0.
    """
    before = _load(PR_135_BEFORE)
    after = _load(PR_135_AFTER)
    after["categories"][0]["annual_rate_pct"] += 0.1

    assert has_real_change(after, before), (
        "a moved annual rate did not read as a data refresh, so the arm publishes nothing"
    )


def test_a_publisher_s_own_date_moving_is_a_refresh() -> None:
    """`snapshot_date` is имот.bg's newest published snapshot, not the day we looked.

    It is the one date in `data/published/` that looks like a run stamp and is
    the opposite of one: when it moves, имот.bg have published a new snapshot and
    the payload beside it is new data. Adding it to `RUN_STAMPED` would suppress
    exactly the refresh the city arm exists for.
    """
    assert "snapshot_date" not in RUN_STAMPED
    committed = {"as_of": "2026-08-16", "cities": [{"code": "SOF", "snapshot_date": "13.8.2026"}]}
    published = {"as_of": "2026-08-21", "cities": [{"code": "SOF", "snapshot_date": "20.8.2026"}]}

    assert has_real_change(published, committed)


def test_no_committed_payload_carries_a_run_stamp_the_comparison_keeps() -> None:
    """Held against the files in `data/published/`, at every depth.

    `transform.py` writes `published_at=as_of`, so a field holding the payload's
    own `as_of` is the run date restated and moves on any run that lands on a new
    calendar day. Every one of them has to come out of the comparison, wherever
    in the payload it sits, which is why this scans the real payloads rather than
    a list of field names somebody remembered to write down: the name is already
    in the set, and the depth is what a list of names cannot say.
    """
    payloads = sorted(PUBLISHED.glob("*.json"))
    assert payloads, f"no payloads under {PUBLISHED} — this test is asserting nothing"

    for path in payloads:
        payload = _load(path)
        as_of = payload.get("as_of")
        assert as_of, f"{path.name} carries no as_of, so there is no run date to look for"
        surviving = _paths_holding(strip_run_stamps(payload), as_of)
        assert not surviving, (
            f"{path.name} still carries its own as_of at {surviving} after the run "
            f"stamps are dropped, so this arm reports a data refresh on any run "
            f"that lands on a new day. If that field is OURS, name it in "
            f"RUN_STAMPED; if it is the publisher's own date that happens to fall "
            f"on the run date, the payload really has changed and the fix is not here."
        )


def test_a_payload_the_ref_does_not_carry_yet_is_a_first_publish(tmp_path: Path) -> None:
    """A new source has nothing to compare against and has to land.

    Treating "absent" as "unchanged" is the worst-behaved shape available: the
    arm writes a correct, fully gated payload, the run skips its own commit, and
    the report reads as a successful refresh for as long as nobody looks.
    """
    (tmp_path / "credit.json").write_text(json.dumps({"as_of": "2026-08-21", "value": 3.1}))

    report = build_report(
        published_dir=tmp_path,
        source="credit",
        cadence={"credit": 40},
        committed=lambda _path: None,
        today=date(2026, 8, 21),
    )

    assert report.real_change
    assert report.changed == ("credit.json",)


def test_the_commit_is_dated_with_this_arm_s_own_payload(tmp_path: Path) -> None:
    """Never the newest date in the directory, and never a stem that only looks close.

    A commit reading "region-salary as of 2026-08-21" over a payload НСИ dated in
    June dates the review wrong, and that date is the first thing a reviewer
    checks. The hyphen is the trap underneath it: `--source region-salary` writes
    `region_salary.json`, so an arm matched on its own option name owns no files
    at all — which reads as "nothing of mine changed" and publishes nothing while
    reporting success.

    This is where the ownership rule is exercised in both directions, an arm
    claiming too little and one claiming its neighbour's file; the payload names
    the arms really write are held against it in `test_cli_dispatch.py`.
    """
    (tmp_path / "region_salary.json").write_text(json.dumps({"as_of": "2026-06-30"}))
    (tmp_path / "hicp_headline.json").write_text(json.dumps({"as_of": "2026-08-21"}))

    report = build_report(
        published_dir=tmp_path,
        source="region-salary",
        cadence={"region_salary": 120, "hicp_headline": 40},
        committed=lambda _path: None,
        today=date(2026, 8, 21),
    )

    assert report.as_of == "2026-06-30"
    assert report.changed == ("region_salary.json",)


def test_the_staleness_list_reads_each_payload_s_own_cadence(tmp_path: Path) -> None:
    """One threshold cannot serve a monthly release and a four-yearly survey.

    The list is in the pull-request body so a reviewer sees the staleness banner a
    reader would see. A flat number reports the quarterly payloads stale for two
    thirds of every healthy quarter, and a list that is mostly wrong is one a
    reviewer scrolls past on the run where it names something real.

    A payload with no manifest row renders nowhere on the site, so it is named
    rather than passed over.
    """
    (tmp_path / "hicp_headline.json").write_text(json.dumps({"as_of": "2026-08-21"}))
    (tmp_path / "salary_dist.json").write_text(json.dumps({"as_of": "2025-08-21"}))
    (tmp_path / "house_market.json").write_text(json.dumps({"as_of": "2026-06-21"}))
    (tmp_path / "orphan.json").write_text(json.dumps({"as_of": "2026-08-21"}))

    report = build_report(
        published_dir=tmp_path,
        source="hicp",
        cadence={"hicp_headline": 40, "salary_dist": 1500, "house_market": 40},
        committed=lambda _path: None,
        today=date(2026, 8, 21),
    )

    assert report.stale == (
        "house_market (61d, cadence 40d)",
        "orphan (not in the payload manifest)",
    )


def test_the_committed_reader_reads_the_ref_and_not_the_working_tree(tmp_path: Path) -> None:
    """The arm has already overwritten the file the comparison needs.

    Reading the working tree compares a payload with itself, which answers "no
    change" to every refresh there will ever be — the failure that stops
    publishing, reported as a run that went green.
    """
    run = ["git", "-C", str(tmp_path)]
    subprocess.run([*run, "init", "-q"], check=True)
    subprocess.run([*run, "config", "user.email", "t@example.com"], check=True)
    subprocess.run([*run, "config", "user.name", "t"], check=True)
    payload = tmp_path / "data" / "published" / "credit.json"
    payload.parent.mkdir(parents=True)
    payload.write_text(json.dumps({"as_of": "2026-08-19", "value": 3.1}))
    subprocess.run([*run, "add", "-A"], check=True)
    subprocess.run([*run, "commit", "-qm", "committed"], check=True)
    payload.write_text(json.dumps({"as_of": "2026-08-21", "value": 3.4}))

    read = committed_reader(tmp_path, "HEAD")
    assert read(payload) == {"as_of": "2026-08-19", "value": 3.1}
    assert read(payload.parent / "not_published_yet.json") is None


@pytest.mark.parametrize("real_change", [True, False])
def test_the_run_says_on_its_own_page_whether_anything_was_published(real_change: bool) -> None:
    """A correct no-op is a good outcome and has to read as one without opening a log.

    A cached read ends green with a notice folded inside a job that did nothing,
    which in the Actions list is the same picture as a run that published. The
    summary is what the run page renders, so the reviewer who was expecting a
    pull request can see why there is none.
    """
    report = build_report(
        published_dir=PUBLISHED,
        source="hicp",
        cadence={},
        committed=lambda path: None if real_change else _load(path),
        today=date(2026, 8, 21),
    )
    assert report.real_change is real_change

    summary = step_summary(report, "hicp")
    assert "hicp" in summary
    if real_change:
        assert "hicp_headline.json" in summary
    else:
        assert "nothing republished" in summary
