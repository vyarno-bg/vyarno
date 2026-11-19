"""The watcher dispatches on a release and on nothing else.

Two failures, opposite and both silent. **Dispatching when nothing published**
runs the pipeline against four public APIs on every tick, finds no change,
opens no pull request, and the only trace is a run history nobody reads.
**Not dispatching when something did** leaves the figure the newspapers are
running on out of this site until a backstop cron fires days later — which is
the whole failure the watcher exists to remove, arriving through the watcher.

So the direction of the comparison, what it is compared against, and what a
failed probe does are each asserted here. Nothing in this file touches the
network: `marker_of` is what the upstream would have said.
"""

from __future__ import annotations

import http.client
import io
import json
import re
import urllib.error
from datetime import UTC, datetime
from email.message import Message
from pathlib import Path

import pytest

from vyarno_pipeline import watch
from vyarno_pipeline.release_calendar import WATCHED

# Inside the НСИ wage window (2026-08-11, 09:30 Sofia) and inside nothing else
# that day. `test_release_calendar.py` owns the window arithmetic; this is a
# fixed instant to run the dispatch logic at.
IN_WINDOW = datetime(2026, 8, 11, 6, 30, tzinfo=UTC)

PUBLISHED = datetime(2026, 8, 11, 7, 54, tzinfo=UTC)


def _markers(value: datetime):
    def _fake(_release):
        return value

    return _fake


def _sources(result: dict) -> set[str]:
    return {entry["source"] for entry in result["refresh"]}


def _ran_at(instant: str) -> dict[str, list[dict[str, str]]]:
    """A run history where every arm last read its upstream at `instant`."""
    return {source: [{"conclusion": "success", "created_at": instant}] for source in WATCHED}


def test_a_marker_past_the_last_run_dispatches_that_arm(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(watch, "marker_of", _markers(PUBLISHED))
    result = watch.sweep(
        tmp_path,
        IN_WINDOW,
        watch_all=False,
        last_runs=_ran_at("2026-08-01T00:00:00Z"),
    )
    assert "region-salary" in _sources(result)
    assert result["failed"] == []


def test_a_marker_behind_the_last_run_dispatches_nothing(monkeypatch, tmp_path) -> None:
    """The arm has already read this release. Running again republishes nothing."""
    monkeypatch.setattr(watch, "marker_of", _markers(PUBLISHED))
    result = watch.sweep(
        tmp_path,
        IN_WINDOW,
        watch_all=False,
        last_runs=_ran_at("2026-08-11T09:00:00Z"),
    )
    assert result["refresh"] == []
    assert result["probed"] > 0, "nothing was probed, so this proves nothing"


def test_a_release_a_red_run_died_on_is_read_again() -> None:
    """2026-08-27: both БНБ arms went red at 11:58 on a file uploaded at 09:52.

    A failed run DID read that upstream, so counting it as the clock put the
    marker permanently behind the run and every tick after it reported
    `unchanged`. The release reached the site four days later, when a different
    publisher moved. So the clock holds at the last success while an arm is
    unlucky, and lets go once it is broken.
    """
    ok = {"conclusion": "success", "created_at": "2026-08-27T01:01:22Z"}
    red = {"conclusion": "failure", "created_at": "2026-08-27T11:58:25Z"}
    assert watch.clock_of([red, ok]) == ok["created_at"]

    # Broken rather than unlucky: past the retries the arm stops being
    # re-dispatched and waits for its monthly backstop.
    reds = [
        {"conclusion": "failure", "created_at": f"2026-08-2{day}T11:58:25Z"}
        for day in (9, 8, 7, 6, 5)
    ]
    assert len(reds) > watch.FAILED_RUN_RETRIES
    assert watch.clock_of([*reds, ok]) == reds[0]["created_at"]

    # A run that never reached its first request read nothing at all.
    unread = {"conclusion": "startup_failure", "created_at": "2026-08-27T23:00:00Z"}
    assert watch.clock_of([unread, ok]) == ok["created_at"]
    assert watch.clock_of([unread]) is None


def test_an_arm_never_run_is_dispatched_however_recent_the_commits_are(
    monkeypatch, tmp_path
) -> None:
    """A supplied run history is the whole answer, and absent from it means never read.

    The failure this replaces was invisible on every green tick. `watch.yml`
    checks out at `fetch-depth: 1`, where `git log -1 -- <payload>` answers with
    the tip commit whatever that commit touched — so an arm missing from the run
    history got a clock reading "the last push to main". A release that landed
    minutes before an unrelated push then read as `unchanged` for ever, and the
    only thing that ever published it was a backstop cron a month later.

    So the repository below is deliberately the hostile case: a payload
    committed seconds ago, which the old fallback would have read as a
    just-refreshed arm.
    """
    published = tmp_path / "data" / "published"
    published.mkdir(parents=True)
    (published / "region_salary.json").write_text("{}", "utf-8")
    for args in (
        ("init", "-q", "-b", "main"),
        ("config", "user.email", "a@b.c"),
        ("config", "user.name", "A"),
        ("add", "-A"),
        ("commit", "-qm", "just now"),
    ):
        watch._git(tmp_path, *args)

    monkeypatch.setattr(watch, "marker_of", _markers(PUBLISHED))
    told = watch.sweep(
        tmp_path, IN_WINDOW, watch_all=False, last_runs={"hicp": "2026-08-01T00:00:00Z"}
    )
    assert "region-salary" in _sources(told), (
        "an arm absent from the run history has never read its upstream, and was not dispatched"
    )

    # `null` is what the workflow writes for an arm with no run at all, and it
    # has to mean the same thing as the key being missing.
    explicit = watch.sweep(tmp_path, IN_WINDOW, watch_all=False, last_runs={"region-salary": None})
    assert "region-salary" in _sources(explicit)

    # And with no run history at all — a person running this by hand — the
    # commit date is all there is, so the same repository answers the other way.
    by_hand = watch.sweep(tmp_path, IN_WINDOW, watch_all=False, last_runs=None)
    assert "region-salary" not in _sources(by_hand)


def test_an_arm_outside_its_window_is_not_even_probed(monkeypatch, tmp_path) -> None:
    """A window is what keeps four public APIs from being polled around the clock.

    An empty `last_runs` is the never-run case for every arm, which reads as
    "the upstream is ahead" — so every arm probed here is an arm dispatched, and
    the difference between the two runs is the window.
    """
    monkeypatch.setattr(watch, "marker_of", _markers(PUBLISHED))
    windowed = watch.sweep(tmp_path, IN_WINDOW, watch_all=False, last_runs={})
    everything = watch.sweep(tmp_path, IN_WINDOW, watch_all=True, last_runs={})
    assert windowed["probed"] < everything["probed"]
    assert "nsi-housing" not in _sources(windowed), "watched on a day НСИ do not publish"
    assert "nsi-housing" in _sources(everything), "the wide sweep skipped an upstream"


def test_a_failed_probe_is_reported_and_the_others_still_dispatch(monkeypatch, tmp_path) -> None:
    """An outage at one publisher must not hold the release another one just made.

    A probe that fails is not "nothing new" — the distinction is the reason
    `ProbeError` exists — so it is named and the tick exits non-zero. What it
    may not do is stop the arms that did get an answer.
    """
    first = True

    def _flaky(release):
        nonlocal first
        if first:
            first = False
            raise watch.ProbeError(f"{release.label}: connection reset")
        return PUBLISHED

    monkeypatch.setattr(watch, "marker_of", _flaky)
    result = watch.sweep(
        tmp_path,
        IN_WINDOW,
        watch_all=False,
        last_runs=_ran_at("2026-08-01T00:00:00Z"),
    )
    assert len(result["failed"]) == 1
    assert _sources(result), "one failed probe silenced every arm in the window"


def test_the_tick_fails_when_a_probe_s_premise_does(monkeypatch, tmp_path) -> None:
    """A 404 or a missing marker: the watcher has stopped seeing that arm at all.

    `--all` rather than a frozen clock: the exit code is what is under test,
    and the wide sweep probes regardless of what hour the suite runs at.
    """

    def _broken(release):
        raise watch.ProbeError(f"{release.label}: HTTP Error 404")

    monkeypatch.setattr(watch, "marker_of", _broken)
    cadence = tmp_path / "cadence.json"
    cadence.write_text(json.dumps(_manifest_cadence()), "utf-8")
    assert watch.main(["--repo", str(tmp_path), "--all", "--cadence", str(cadence)]) == 1


MANIFEST = Path(__file__).resolve().parents[2] / "site" / "src" / "lib" / "payloads.js"


def _manifest_cadence() -> dict[str, int]:
    """`payload-cadence.mjs`'s table, read the way the contract tests read the manifest."""
    src = MANIFEST.read_text("utf-8")
    pairs = re.findall(r'file:\s*"([a-z_0-9]+)"[\s\S]*?cadenceDays:\s*(\d+)', src)
    assert len(pairs) == len(re.findall(r'file:\s*"', src)), "a payload with no cadenceDays"
    return {stem: int(days) for stem, days in pairs}


def _refusing(label_part: str):
    def _fake(release):
        if label_part in release.label:
            raise watch.ProbeError(f"{release.label}: HTTP Error 403", transient=True)
        return PUBLISHED

    return _fake


@pytest.mark.parametrize(
    ("refused", "with_cadence", "code"),
    [
        ("НСИ", True, 0),  # covered: the 92- and 99-day НСИ payloads go stale and fire
        ("earn_ses_monthly", True, 1),  # not covered: a 1462-day cadence fires years late
        ("НСИ", False, 1),  # no table, no backstop known: red, as before
    ],
)
def test_a_refused_probe_is_a_warning_only_where_freshness_covers_it(
    monkeypatch, tmp_path, capsys, refused: str, with_cadence: bool, code: int
) -> None:
    """2026-11-18: НСИ sent one runner 403 for all seven files and the tick went red.

    Nine of a hundred ticks were red that way, every one an upstream that
    answered again, while a refusal that lasts is reported anyway: the arm
    publishes nothing, `as_of` freezes, and freshness-check fires a cadence on.
    """
    monkeypatch.setattr(watch, "marker_of", _refusing(refused))
    args = ["--repo", str(tmp_path), "--all", "--last-run", str(tmp_path / "runs.json")]
    (tmp_path / "runs.json").write_text(json.dumps(_ran_at("2026-08-01T00:00:00Z")), "utf-8")
    if with_cadence:
        (tmp_path / "cadence.json").write_text(json.dumps(_manifest_cadence()), "utf-8")
        args += ["--cadence", str(tmp_path / "cadence.json")]
    assert watch.main(args) == code
    printed = json.loads(capsys.readouterr().out)
    assert _sources(printed), "a refused probe held back the arms that answered"


def test_freshness_reports_every_arm_s_outage_within_a_quarter_but_ses() -> None:
    """Which arms a refused probe may downgrade, against the manifest as it stands.

    If НСИ refused runners for a month, `region_salary` and `sector_salary`
    (92 days) and `nsi_housing` (99) stop advancing, and a refusal spanning the
    next upload fires the Monday after each is a cadence old — within a week of
    the release it cost. `salary_dist` is the one that would not: 1462 days.
    A new arm landing in this set is a decision, not a fixture to update.
    """
    cadence = _manifest_cadence()
    unbacked = {source for source in WATCHED if not watch.backed(source, cadence)}
    assert unbacked == {"salary-dist"}, (
        f"freshness-check does not report an outage of {sorted(unbacked)} within "
        f"{watch.BACKSTOP_DAYS} days, so a refused probe there must stay red."
    )
    for source in ("region-salary", "sector-salary", "nsi-housing"):
        assert watch.backed(source, cadence), f"{source}: a month of НСИ refusing runners"


@pytest.mark.parametrize(
    ("err", "transient"),
    [
        (urllib.error.HTTPError("u", 403, "Forbidden", Message(), io.BytesIO()), True),
        (urllib.error.HTTPError("u", 429, "Too Many", Message(), io.BytesIO()), True),
        (urllib.error.HTTPError("u", 500, "Internal", Message(), io.BytesIO()), True),
        (urllib.error.HTTPError("u", 504, "Gateway", Message(), io.BytesIO()), True),
        (TimeoutError("The read operation timed out"), True),
        (urllib.error.URLError(ConnectionRefusedError(111, "refused")), True),
        (http.client.IncompleteRead(b""), True),
        (urllib.error.HTTPError("u", 404, "Not Found", Message(), io.BytesIO()), False),
        (urllib.error.HTTPError("u", 410, "Gone", Message(), io.BytesIO()), False),
        (watch.ProbeError("x: the response carries no Last-Modified header"), False),
        (ValueError("Expecting value: line 1 column 1"), False),
    ],
)
def test_only_an_upstream_that_may_answer_later_is_transient(monkeypatch, err, transient) -> None:
    """What the ЕЦБ and НСИ actually returned on the red ticks, against what a moved file returns."""

    def _raise(_release):
        raise err

    monkeypatch.setattr(watch, "_fetch_marker", _raise)
    monkeypatch.setattr(watch, "RETRY_WAIT", 0)
    with pytest.raises(watch.ProbeError) as caught:
        watch.marker_of(WATCHED["hicp"][0])
    assert caught.value.transient is transient


@pytest.mark.parametrize("source", sorted(WATCHED))
def test_every_watched_arm_answers_a_marker_the_probe_can_read(source: str) -> None:
    """A marker kind `_fetch_marker` does not know raises rather than returning None."""
    for release in WATCHED[source]:
        assert release.marker in (watch.EUROSTAT_UPDATED, watch.HTTP_LAST_MODIFIED), (
            f"{release.label} is watched with marker {release.marker!r}, which "
            f"`watch.py` cannot read — every tick reports it as a failed probe."
        )
