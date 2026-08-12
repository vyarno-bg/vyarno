"""`refresh --source <name>` reaches the right arm, and `--source all` reaches every one.

The eight `_refresh_*` functions are network-driven orchestration and are
exercised end to end elsewhere (`test_cli.py` drives the HICP arm through respx
against real trimmed Eurostat cubes; `test_cli_mortgage.py` does the same for
the mortgage arm). What no test covered was the dispatcher above them — forty
lines of pure branching with nothing fetched, which is both the cheapest thing
in the file to test and the one with a bug class of its own.

That bug class is specific: **a connector added without being wired into
`all`.** The pipeline is refreshed in practice with `--source all`, so a source
that works perfectly when named explicitly and is missing from the `all` branch
produces exactly the failure this project is built to prevent — a published
panel where eight payloads are current, one is months old, and nothing says so.
The staleness banner would catch it eventually, off the oldest payload, but
"eventually" is after it has shipped.

Asserting the arms are *reached* rather than what they do keeps this fast,
offline, and indifferent to how any one of them works.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from click.testing import CliRunner

from vyarno_pipeline import cli

# Every arm, and the `--source` value that should reach it. This mapping is the
# test: adding a connector means adding a line here, and the `all` test below
# then requires it to be wired into the bulk refresh too.
#
# **An arm missing from here is worse than untested.** The fixture patches what
# this names and nothing else, so an unlisted arm is not skipped by `--source
# all` — it RUNS, against its live upstream, inside a suite that is supposed to
# be offline and under a second. The coverage assertion below then passes
# because the arm it forgot is not in the set it compares, and the suite stays
# green on a network call nobody meant to make. `pytest -m live` is where a
# fetch belongs.
ARMS = {
    "hicp": "_refresh_hicp",
    "unemployment": "_refresh_unemployment",
    "mortgage": "_refresh_mortgage",
    "city-price": "_refresh_city_price",
    "region-salary": "_refresh_region_salary",
    "sector-salary": "_refresh_sector_salary",
    "salary-dist": "_refresh_salary_dist",
    "payroll": "_refresh_payroll",
    "house-market": "_refresh_house_market",
    "nsi-housing": "_refresh_nsi_housing",
}

# What each arm is allowed to write. `refresh.yml` derives this from the source
# name itself, so this table restates the rule the workflow applies rather than
# adding one — see the test below for why it is worth restating.
ARM_PAYLOADS = {
    "hicp": ["hicp_headline.json", "hicp_categories.json"],
    "unemployment": ["unemployment.json"],
    "mortgage": ["mortgage.json"],
    "city-price": ["city_price.json"],
    "region-salary": ["region_salary.json"],
    "sector-salary": ["sector_salary.json"],
    "salary-dist": ["salary_dist.json"],
    "payroll": ["payroll.json"],
    "house-market": ["house_market.json", "house_market_structure.json"],
    "nsi-housing": ["nsi_housing.json"],
}


@pytest.fixture
def called(monkeypatch) -> list[str]:
    """Replace every refresh arm with a recorder. Nothing touches the network."""
    seen: list[str] = []

    def recorder(name):
        def _fn(*_args, **_kwargs):
            seen.append(name)

        return _fn

    for arm in ARMS.values():
        monkeypatch.setattr(cli, arm, recorder(arm))
    return seen


def _run(tmp_path: Path, source: str):
    return CliRunner().invoke(cli.main, ["refresh", "--source", source, "--out", str(tmp_path)])


@pytest.mark.parametrize(("source", "arm"), sorted(ARMS.items()))
def test_each_source_reaches_its_own_arm(tmp_path: Path, called, source: str, arm: str) -> None:
    result = _run(tmp_path, source)
    assert result.exit_code == 0, result.output
    assert called == [arm], f"--source {source} ran {called or 'nothing'}, expected [{arm}]"


def test_source_all_runs_every_one_of_them(tmp_path: Path, called) -> None:
    """The whole point of the file. A source missing here is a silently stale payload."""
    result = _run(tmp_path, "all")
    assert result.exit_code == 0, result.output

    missing = sorted(set(ARMS.values()) - set(called))
    assert not missing, (
        f"`--source all` does not run {missing}. A connector that only refreshes "
        f"when named explicitly leaves its payload behind on every bulk refresh, "
        f"which is the panel going quietly out of date one file at a time."
    )
    assert len(called) == len(set(called)), f"`--source all` runs an arm twice: {called}"


def test_a_failed_arm_names_what_all_already_wrote_and_keeps_its_exit_code(
    tmp_path: Path, called, monkeypatch
) -> None:
    """A mid-run failure has to name every payload it has already written.

    `--source all` is eight publishes rather than one transaction: an arm writes
    its file as soon as its own gates pass, so a failure partway through leaves
    `data/published/` holding two refresh dates. Each arm exits the process from
    inside itself, so the only thing a bare run prints is the failing arm's own
    message — and the operator's next move (re-run one arm, or all eight)
    depends on knowing which of the other seven are current.

    Exit code 4 is the network arm's, and it has to survive being reported on:
    swallowing it into a generic 1 loses the distinction between an upstream
    being unreachable and a gate refusing the data, which is the difference
    between waiting and investigating.
    """

    def dies(*_args, **_kwargs):
        raise SystemExit(4)

    monkeypatch.setattr(cli, "_refresh_city_price", dies)
    result = _run(tmp_path, "all")

    assert result.exit_code == 4, f"the arm's own exit code was lost: {result.exit_code}"
    out = result.output
    assert "stopped at 'city-price'" in out, out
    # Written before the failure, and named so they are not refreshed again.
    for landed in ("hicp", "unemployment", "mortgage"):
        assert landed in out.split("written this run:")[1].split("not reached:")[0], (
            f"`{landed}` completed but the failure report does not list it"
        )
    # Never started, and named so they are not assumed current.
    for skipped in ("region-salary", "sector-salary", "salary-dist", "payroll"):
        assert skipped in out.split("not reached:")[1], (
            f"`{skipped}` never ran but the failure report does not list it"
        )
    assert "_refresh_payroll" not in called, "an arm after the failure still ran"


def test_an_unknown_source_exits_2_and_says_what_the_real_ones_are(tmp_path: Path, called) -> None:
    """Silence on a typo would read as success and publish nothing, which is worse.

    The rejection comes from `--source`'s `click.Choice`, before `refresh()` is
    entered — which is why the message lists every valid source rather than only
    naming the bad one. `refresh()` keeps its own `else: unknown source` branch
    for a direct call from Python, and that branch is unreachable through the
    CLI; do not delete it to chase the coverage line, and do not expect it here.
    """
    result = _run(tmp_path, "hicp-categories")
    assert result.exit_code == 2, result.output
    assert "invalid value for '--source'" in result.output.lower()
    for source in ARMS:
        assert source in result.output, f"the error does not offer `{source}` as an alternative"
    assert called == []


def test_the_output_directory_is_created_before_any_arm_runs(tmp_path: Path, called) -> None:
    """A refresh into a fresh checkout must not fail on a missing directory."""
    target = tmp_path / "does" / "not" / "exist"
    result = _run(target, "payroll")
    assert result.exit_code == 0, result.output
    assert target.is_dir()


# The workflow that refreshes an arm, or the reason there is none.
#
# `city-price` is the whole exception list and it is not an oversight:
# `имот.bg` answers a datacenter IP with a 403, so the arm cannot run on a
# hosted runner at all and is refreshed from an ordinary Bulgarian connection
# by hand (`docs/data-sources.md` §"Where you fetch from is part of the
# connector's design"). Anything else added here needs a reason of that kind —
# "not written yet" is the state this test exists to fail on.
REFRESHED_BY_HAND = {"city-price"}


def test_every_arm_is_either_scheduled_or_named_as_manual() -> None:
    """An arm with no workflow and no exception is a payload that never updates.

    `--source all` reaching every arm proves the dispatcher is complete; it says
    nothing about whether anything ever CALLS it. A connector can be written,
    gated, wired into `all`, published once — and then sit at that first
    `as_of` forever, because the file that would fire it monthly was never
    added. Nothing else notices in time: CI does not refresh, a green pipeline
    run is a run that happened, and the freshness check reports the age of a
    payload rather than the absence of a schedule. The staleness banner is the
    backstop, and by then a reader has already been shown the stale figure.

    So the reconciliation is the test, in both directions. A workflow naming a
    source the CLI does not offer is the same defect from the other side: it
    fails every month with an invalid `--source`, in a scheduled run nobody
    watches.
    """
    workflow_dir = Path(__file__).resolve().parents[2] / ".github" / "workflows"
    scheduled = {
        match.group(1)
        for path in workflow_dir.glob("refresh-*.yml")
        for match in [re.search(r"^\s+source:\s*(\S+)\s*$", path.read_text("utf-8"), re.M)]
        if match
    }

    unscheduled = sorted(set(ARMS) - scheduled - REFRESHED_BY_HAND)
    assert not unscheduled, (
        f"no refresh workflow fires {unscheduled}, and nothing names them manual. "
        f"Add .github/workflows/refresh-<source>.yml, or put the source in "
        f"REFRESHED_BY_HAND with the reason it cannot run on a runner."
    )

    unknown = sorted(scheduled - set(ARMS))
    assert not unknown, (
        f"a refresh workflow passes --source {unknown}, which the CLI does not "
        f"accept. That run fails on click's own validation, monthly, unwatched."
    )


def test_the_refresh_workflow_commits_under_an_identity() -> None:
    """A runner has no git identity, so `git commit` there aborts with exit 128.

    It aborts at the end of the job, after the install, the live fetch and a
    correct payload written to disk — so every step before it is green and the
    one thing the run exists to do is the one thing that does not happen. On a
    cron, that is a month of a payload not publishing and a red mark nobody is
    looking at.

    The assertion is that the two live in the SAME `run:` block, which is the
    only arrangement that cannot come apart: a separate configure step can be
    moved, renamed, made conditional or dropped while the commit step still
    reads as complete on its own.
    """
    workflow = (
        Path(__file__).resolve().parents[2] / ".github" / "workflows" / "refresh.yml"
    ).read_text("utf-8")

    committing = [
        block
        for block in re.split(r"^      - name: ", workflow, flags=re.M)
        if re.search(r"^\s+git commit\b", block, re.M)
    ]
    assert committing, "no step in refresh.yml runs `git commit` — has the publish path moved?"
    for block in committing:
        name = block.splitlines()[0].strip()
        assert re.search(r"^\s+git config user\.email\b", block, re.M), (
            f"the `{name}` step commits without setting user.email in the same block. "
            f"A runner carries no identity: git aborts with exit 128 after the payload "
            f"is already written."
        )
        assert re.search(r"^\s+git config user\.name\b", block, re.M), (
            f"the `{name}` step commits without setting user.name in the same block."
        )


def test_every_payload_an_arm_writes_is_owned_by_that_arm() -> None:
    """A payload whose stem does not match its arm never publishes, and CI goes green.

    `refresh.yml` works out which files a run owns by taking the `--source`
    name, swapping hyphens for underscores, and keeping payload stems that
    equal it or start with it. Nothing checks the other direction, and the
    failure that leaves is the worst-behaved one in the pipeline: an arm writes
    a correct, fully-gated payload to disk, the workflow finds nothing of its
    own changed, the commit and the PR are skipped, and the run reports a
    successful refresh. The payload sits at its first `as_of` for ever and the
    only thing that ever notices is the staleness banner, months later, in
    front of a reader.

    `hicp` is the reason the rule is `startswith` rather than equality — one
    arm, two files. `house-market` is the same shape and the reason this test
    exists: `housing_structure.json` was the natural name for its second
    payload and is owned by no arm at all.
    """
    for source, payloads in sorted(ARM_PAYLOADS.items()):
        prefix = source.replace("-", "_")
        for filename in payloads:
            stem = filename.removesuffix(".json")
            assert stem == prefix or stem.startswith(prefix), (
                f"`--source {source}` writes {filename}, but refresh.yml only "
                f"claims stems equal to or starting with {prefix!r}. That run "
                f"publishes nothing and still reports success."
            )


def test_the_payload_table_names_every_arm() -> None:
    """Otherwise an arm added without a payload row is checked by nothing above."""
    assert sorted(ARM_PAYLOADS) == sorted(ARMS), (
        "ARM_PAYLOADS and ARMS disagree about which arms exist, so one of the "
        "two tests above is silently skipping an arm."
    )
