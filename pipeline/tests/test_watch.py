"""The watcher dispatches on a release and on nothing else.

Two failures, opposite and both silent. **Dispatching when nothing published**
runs the pipeline every ten minutes against four public APIs, finds no change,
opens no pull request, and the only trace is a run history nobody reads.
**Not dispatching when something did** leaves the figure the newspapers are
running on out of this site until a backstop cron fires days later — which is
the whole failure the watcher exists to remove, arriving through the watcher.

So the direction of the comparison, what it is compared against, and what a
failed probe does are each asserted here. Nothing in this file touches the
network: `marker_of` is what the upstream would have said.
"""

from __future__ import annotations

from datetime import UTC, datetime

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


def test_a_marker_past_the_last_run_dispatches_that_arm(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(watch, "marker_of", _markers(PUBLISHED))
    result = watch.sweep(
        tmp_path,
        IN_WINDOW,
        watch_all=False,
        last_runs=dict.fromkeys(WATCHED, "2026-08-01T00:00:00Z"),
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
        last_runs=dict.fromkeys(WATCHED, "2026-08-11T09:00:00Z"),
    )
    assert result["refresh"] == []
    assert result["probed"] > 0, "nothing was probed, so this proves nothing"


def test_an_arm_outside_its_window_is_not_even_probed(monkeypatch, tmp_path) -> None:
    """A window is what keeps four public APIs from being polled around the clock.

    An empty `last_runs` over a directory with no payloads is the never-published
    case, which reads as "the upstream is ahead" — so every arm probed here is
    an arm dispatched, and the difference between the two runs is the window.
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
        last_runs=dict.fromkeys(WATCHED, "2026-08-01T00:00:00Z"),
    )
    assert len(result["failed"]) == 1
    assert _sources(result), "one failed probe silenced every arm in the window"


def test_the_tick_fails_when_a_probe_does(monkeypatch, tmp_path) -> None:
    """Otherwise the watcher stops watching and nothing says so for a month.

    `--all` rather than a frozen clock: the exit code is what is under test,
    and the wide sweep probes regardless of what hour the suite runs at.
    """

    def _broken(release):
        raise watch.ProbeError(f"{release.label}: 503")

    monkeypatch.setattr(watch, "marker_of", _broken)
    assert watch.main(["--repo", str(tmp_path), "--all"]) == 1


@pytest.mark.parametrize("source", sorted(WATCHED))
def test_every_watched_arm_answers_a_marker_the_probe_can_read(source: str) -> None:
    """A marker kind `_fetch_marker` does not know raises rather than returning None."""
    for release in WATCHED[source]:
        assert release.marker in (watch.EUROSTAT_UPDATED, watch.HTTP_LAST_MODIFIED), (
            f"{release.label} is watched with marker {release.marker!r}, which "
            f"`watch.py` cannot read — every tick reports it as a failed probe."
        )
