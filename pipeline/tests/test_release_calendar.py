"""The release calendar is the schedule, and these hold the workflows to it.

`release_calendar.py` says when each upstream publishes; `watch.yml` polls
those windows and `refresh-<source>.yml` backs each one up. Three files, one
table, and nothing in YAML can read Python — so every number in a workflow is a
copy, and a copy that drifts fails in the shape this project can least afford:
a run that goes green having read an upstream that had not published, or having
not looked on the day it did. Neither leaves a mark anywhere a reader would
see, for a month or a quarter.

So the crons are asserted against the table rather than reviewed. What the
table itself claims — an observed release instant — is evidence a person
gathered and nothing here can check; `test_live_upstreams.py` checks only that
each probe still answers with a marker at all.
"""

from __future__ import annotations

import ast
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

from vyarno_pipeline.refresh_report import owns
from vyarno_pipeline.release_calendar import (
    BACKSTOP,
    ECB_BASE,
    ESTAT_BASE,
    NOT_WATCHED,
    SWEEP_CRON,
    WATCH_CRON,
    WATCHED,
    payload_stems,
    releases_due,
    utc_hours,
)
from vyarno_pipeline.sources.ecb import (
    BSI_KEYS,
    CBD2_NPL_SCOPES,
    CONSUMER_KEYS,
    SERIES_KEYS,
    cbd2_npl_key,
)

from .test_cli_dispatch import ARMS

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"
PACKAGE = ROOT / "pipeline" / "src" / "vyarno_pipeline"


def _crons(workflow: str) -> list[str]:
    text = (WORKFLOWS / workflow).read_text("utf-8")
    return re.findall(r'^\s+- cron: "([^"]+)"\s*$', text, re.M)


def _cron_field(expr: str, index: int) -> set[int]:
    """One cron field expanded to the integers it fires on."""
    field = expr.split()[index]
    if field == "*":
        return set(range(60 if index == 0 else 24))
    values: set[int] = set()
    for part in field.split(","):
        step = 1
        if "/" in part:
            part, raw_step = part.split("/")
            step = int(raw_step)
        if "-" in part:
            low, high = (int(n) for n in part.split("-"))
        else:
            low = high = int(part)
        values.update(range(low, high + 1, step))
    return values


def test_every_arm_is_watched_or_says_why_it_cannot_be() -> None:
    """An arm in neither table is one nothing polls and nothing explains.

    The failure is silent by construction: the arm still has its backstop cron,
    so it publishes on the old rhythm and every gate stays green — the only
    symptom is that this site carries a figure the newspapers ran days ago,
    which nothing in the repository measures. Naming it in `NOT_WATCHED` costs
    a sentence and is the difference between a decision and an oversight.
    """
    accounted = set(WATCHED) | set(NOT_WATCHED)
    assert accounted == set(ARMS), (
        f"these arms are in neither WATCHED nor NOT_WATCHED: "
        f"{sorted(set(ARMS) - accounted)}; and these are in the calendar but "
        f"are not arms: {sorted(accounted - set(ARMS))}"
    )
    assert not set(WATCHED) & set(NOT_WATCHED), "an arm cannot be both watched and not"


@pytest.mark.parametrize("source", sorted(BACKSTOP))
def test_each_arm_carries_the_backstop_the_calendar_gives_it(source: str) -> None:
    """A cron the table does not name is a schedule nobody can reason about.

    The backstop is the second half of a pair — the watcher polls the window,
    this fires once it closes — and the pair only works if both halves are read
    off the same rows. A cron edited in YAML alone is a workflow whose timing no
    longer follows from anything, and it fires unwatched, monthly.
    """
    assert _crons(f"refresh-{source}.yml") == list(BACKSTOP[source]), (
        f"refresh-{source}.yml's schedule and BACKSTOP['{source}'] disagree. The "
        f"table is the source: change it there and copy the line across."
    )


def test_every_arm_has_a_backstop() -> None:
    """A watcher is a single point of failure until something runs without it."""
    watched_or_manual = set(WATCHED) | {"payroll"}
    assert set(BACKSTOP) == watched_or_manual, (
        f"no backstop cron for {sorted(watched_or_manual - set(BACKSTOP))}. If "
        f"`watch.yml` breaks, that arm stops publishing and only the weekly "
        f"freshness check ever notices."
    )


def test_the_watcher_polls_every_hour_a_window_can_reach() -> None:
    """A window outside the poll hours is a release nothing sees.

    The hours are computed from the bands rather than written down because two
    daylight-saving transitions move them: a band quoted 09:00–13:00 Sofia is
    06:00–10:00 UTC in summer and 07:00–11:00 in winter, and a cron hour list
    maintained by hand goes stale the first time a band moves by a quarter of
    an hour. Two years, because the transitions do not fall on the same dates.
    """
    polled = _cron_field(WATCH_CRON, 1)
    for year in (2026, 2027):
        missed = sorted(utc_hours(year) - polled)
        assert not missed, (
            f"{year}: a window falls in UTC hour(s) {missed}, which "
            f"WATCH_CRON ({WATCH_CRON}) never polls. That upstream is watched "
            f"on paper and read by nothing."
        )


def test_the_watch_workflow_runs_the_crons_the_calendar_declares() -> None:
    """Both schedules, verbatim — and the sweep flag matches the line it names.

    `watch.yml` decides it is a wide sweep by comparing `github.event.schedule`
    against the cron string. A sweep line edited in one place and not the other
    does not fail: the workflow runs, probes only the windows that happen to be
    open, and the wide sweep silently stops happening — so a correction landing
    off-calendar is never seen again.
    """
    assert _crons("watch.yml") == [WATCH_CRON, SWEEP_CRON]
    text = (WORKFLOWS / "watch.yml").read_text("utf-8")
    assert f"github.event.schedule == '{SWEEP_CRON}'" in text, (
        "watch.yml's sweep test does not name SWEEP_CRON, so the sweep never fires."
    )


@pytest.mark.parametrize("source", sorted(BACKSTOP))
def test_a_backstop_fires_after_its_arm_s_window_has_closed(source: str) -> None:
    """Inside the window the watcher has already answered; the backstop is for after.

    A backstop landing inside a window is not merely redundant. It reads the
    upstream on a day the watcher is also reading it, so the two race for the
    same `data/<source>` branch — and it spends the run on a day the release
    may not have happened yet, which is the guess the calendar exists to
    remove.
    """
    for cron in BACKSTOP[source]:
        months = _cron_field(cron, 3)
        days = _cron_field(cron, 2)
        for release in WATCHED.get(source, ()):
            clash = sorted(
                (month, day)
                for month in months
                for day in days
                if (not release.months or month in release.months) and day in release.days
            )
            assert not clash, (
                f"refresh-{source}.yml's backstop `{cron}` fires inside "
                f"{release.label}'s own window at {clash[:3]}."
            )


def test_no_backstop_opens_an_upstream_on_a_watch_tick() -> None:
    """Two runs reading one publisher on one minute is one of them wasted.

    Both push `data/<source>`, and the second meets a branch whose history it
    does not contain. `refresh.yml`'s concurrency group is what stops that
    becoming a failed run; keeping the hours apart is what stops it happening.

    Both watch schedules, because the wide sweep probes every upstream whatever
    the window says — so a backstop moved into an hour only the sweep occupies
    (1, 5, 13 or 17 UTC) collides with a tick the other half of this assertion
    cannot see.
    """
    watched_hours = _cron_field(WATCH_CRON, 1) | _cron_field(SWEEP_CRON, 1)
    for source, crons in sorted(BACKSTOP.items()):
        # `payroll` is exempt because nothing watches it: its hour is a
        # statutory boundary in Sofia rather than a window, and no probe ever
        # opens the upstream it reads.
        if source not in WATCHED:
            continue
        for cron in crons:
            overlap = sorted(_cron_field(cron, 1) & watched_hours)
            assert not overlap, (
                f"refresh-{source}.yml's backstop `{cron}` fires in UTC hour(s) "
                f"{overlap}, which `watch.yml` also polls."
            )


def test_the_probe_reads_the_upstream_the_connector_fetches() -> None:
    """A probe pointed at a cube nothing publishes from watches the wrong thing.

    It fails green in both directions: a stale URL answers 404 and reports a
    probe failure that looks like an outage, and a URL for a NEIGHBOURING cube
    answers 200 with a timestamp that moves on somebody else's calendar. So
    every probe target has to be a string the connector itself carries.
    """
    connectors = "\n".join(
        (PACKAGE / "sources" / f"{name}.py").read_text("utf-8")
        for name in ("eurostat", "nsi", "bnb")
    )
    # The ЕЦБ keys are assembled rather than written out, so they are compared
    # as values: a 16-dimension CBD2 key exists nowhere in that file as text.
    ecb_keys = {
        *SERIES_KEYS.values(),
        *CONSUMER_KEYS.values(),
        *BSI_KEYS.values(),
        *(cbd2_npl_key(scope) for scope in CBD2_NPL_SCOPES),
    }
    for source, releases in sorted(WATCHED.items()):
        for release in releases:
            # Stem rather than filename: НСИ's housing workbooks are named in
            # `HOUSING_WORKBOOKS` without the extension, because the connector
            # discovers their URL off НСИ's own pages instead of building it.
            target = release.url.rsplit("/", 1)[-1].split("?")[0].removesuffix(".xlsx")
            assert target in connectors or target in ecb_keys, (
                f"{source}: nothing under sources/ fetches {target!r}, which "
                f"{release.label} is watched at."
            )


def test_the_calendar_and_the_connectors_agree_on_where_an_api_lives() -> None:
    """A base URL copied here is a probe that can outlive the endpoint it names."""
    eurostat = (PACKAGE / "sources" / "eurostat.py").read_text("utf-8")
    ecb = (PACKAGE / "sources" / "ecb.py").read_text("utf-8")
    assert f'BASE = "{ESTAT_BASE}"' in eurostat, "ESTAT_BASE has drifted from sources/eurostat.py"
    assert f'BASE = "{ECB_BASE}"' in ecb, "ECB_BASE has drifted from sources/ecb.py"


def test_the_watcher_imports_nothing_the_runner_would_have_to_install() -> None:
    """A tick runs on the runner's own Python, before the pipeline exists.

    That is what makes a ten-minute poll affordable: no venv, no pip, about
    fifteen seconds. One `import httpx` — or one import of a module that
    reaches it — turns every tick into a full install, and the failure is not
    an error message but a schedule quietly becoming too expensive to keep.
    """
    allowed = {"vyarno_pipeline.release_calendar", "vyarno_pipeline"}
    for module in ("watch.py", "release_calendar.py"):
        tree = ast.parse((PACKAGE / module).read_text("utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                root = name.split(".")[0]
                assert name in allowed or root in sys.stdlib_module_names, (
                    f"{module} imports {name}, which is not in the standard library. "
                    f"The watcher runs before `pip install`."
                )


def test_a_window_is_read_in_its_publisher_s_own_timezone() -> None:
    """Written in UTC a window drifts an hour against the release twice a year.

    НСИ upload between 10:08 and 12:05 Sofia whatever the season, so 06:30 UTC
    is inside their morning in summer and half an hour short of it in winter. A
    calendar that could not tell those apart would either miss a winter release
    or poll an hour nobody publishes in.
    """
    summer = datetime(2026, 8, 11, 6, 30, tzinfo=UTC)
    winter = datetime(2026, 2, 11, 6, 30, tzinfo=UTC)
    assert "region-salary" in releases_due(summer)
    assert "region-salary" not in releases_due(winter)
    assert "region-salary" in releases_due(winter.replace(hour=7, minute=30))


def test_a_source_owns_the_payloads_the_refresh_gives_it() -> None:
    """`hicp` writes two files and `house_market` is a prefix of two more.

    `payload_stems` is a copy of `refresh_report.owns`, kept because a watcher
    tick may import nothing this module cannot. Two copies of one rule drift in
    the direction nobody watches, and the drift is silent both ways: the arm
    publishes a payload the watcher then never counts as read, or the watcher
    dispatches an arm for a file the refresh does not own. So the copies are
    compared over the payloads that actually exist rather than over an example.
    """
    stems = ["hicp_headline", "hicp_categories", "house_market", "house_market_structure"]
    assert payload_stems("hicp", stems) == ["hicp_headline", "hicp_categories"]
    assert payload_stems("house-market", stems) == ["house_market", "house_market_structure"]
    assert payload_stems("credit", stems) == []

    published = sorted(path.stem for path in (ROOT / "data" / "published").glob("*.json"))
    for source in sorted(set(ARMS)):
        assert payload_stems(source, published) == [s for s in published if owns(source, s)], (
            f"`payload_stems` and `refresh_report.owns` disagree about what "
            f"`--source {source}` writes."
        )
