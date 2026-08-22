"""`refresh --source <name>` reaches the right arm, and `--source all` reaches every one.

The `_refresh_*` functions are network-driven orchestration and are
exercised end to end elsewhere (`test_cli.py` drives the HICP arm through respx
against real trimmed Eurostat cubes; `test_cli_mortgage.py` does the same for
the mortgage arm). What no test covered was the dispatcher above them — forty
lines of pure branching with nothing fetched, which is both the cheapest thing
in the file to test and the one with a bug class of its own.

That bug class is specific: **a connector added without being wired into
`all`.** The pipeline is refreshed in practice with `--source all`, so a source
that works perfectly when named explicitly and is missing from the `all` branch
produces exactly the failure this project is built to prevent — a published
panel where every payload but one is current, that one is months old, and
nothing says so.
The staleness banner would catch it eventually, off the oldest payload, but
"eventually" is after it has shipped.

Asserting the arms are *reached* rather than what they do keeps this fast,
offline, and indifferent to how any one of them works.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
from click.testing import CliRunner

from vyarno_pipeline import cli
from vyarno_pipeline.refresh_report import Report, github_output, owns

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
    "credit": "_refresh_credit",
    "city-price": "_refresh_city_price",
    "region-salary": "_refresh_region_salary",
    "sector-salary": "_refresh_sector_salary",
    "salary-dist": "_refresh_salary_dist",
    "payroll": "_refresh_payroll",
    "house-market": "_refresh_house_market",
    "nsi-housing": "_refresh_nsi_housing",
}

# What each arm is allowed to write. A refresh derives this from the source name
# itself (`refresh_report.owns`), so this table is the other direction: the files
# the arms actually write, held against the rule — see the test below.
ARM_PAYLOADS = {
    "hicp": ["hicp_headline.json", "hicp_categories.json"],
    "unemployment": ["unemployment.json"],
    "mortgage": ["mortgage.json"],
    "credit": ["credit.json"],
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


def test_every_arm_that_fetches_bnb_is_given_the_intermediate() -> None:
    """`www.bnb.bg` does not always send its intermediate, and the fix is per arm.

    `refresh.yml` appends the missing GeoTrust link to certifi's bundle under an
    `if:` naming the arms, so an arm that fetches БНБ and is not named runs the
    same handshake without it. That is green for exactly as long as БНБ's edge
    happens to serve a full chain, and then exits 4 with no rate at all — the
    failure the step exists to remove, arriving at the arm nobody listed. It was
    `credit`, whose two workbooks are the same host as `mortgage`'s.

    Derived from the imports rather than from a list: a third arm reaching
    `sources/bnb.py` has to be named in that condition, and this is what says so.
    """
    package = Path(__file__).resolve().parents[1] / "src" / "vyarno_pipeline"
    tree = ast.parse((package / "cli.py").read_text("utf-8"))

    from_bnb = {
        alias.asname or alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module == "vyarno_pipeline.sources.bnb"
        for alias in node.names
    }
    arm_of = {handler: source for source, handler in ARMS.items()}
    fetches_bnb = {
        arm_of[node.name]
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name in arm_of
        if {n.id for n in ast.walk(node) if isinstance(n, ast.Name)} & from_bnb
    }
    assert fetches_bnb, "no arm imports from sources/bnb.py — has the connector moved?"

    workflow = (
        Path(__file__).resolve().parents[2] / ".github" / "workflows" / "refresh.yml"
    ).read_text("utf-8")
    step = next(
        block for block in re.split(r"^      - name: ", workflow, flags=re.M) if "certifi" in block
    )
    condition = next(line for line in step.splitlines() if line.strip().startswith("if:"))
    missing = sorted(arm for arm in fetches_bnb if f"'{arm}'" not in condition)
    assert not missing, (
        f"{missing} fetch(es) www.bnb.bg but the certificate step's condition does "
        f"not name them: {condition.strip()}"
    )


def test_neither_workflow_decides_for_itself_how_old_is_too_old() -> None:
    """Both age checks read the manifest's cadence, and neither carries a number.

    `refresh.yml` lists the other payloads that have gone quiet in the
    pull-request body so a reviewer sees what a reader would see;
    `freshness-check.yml` fails the weekly run on the same line. A literal in
    either is wrong in a way that reports green: **one threshold cannot serve
    these rhythms.** HICP is monthly, the Eurostat property cubes and НСИ's wage
    tables are quarterly, and the SES ladder behind `salary_dist` is
    disseminated every four years — so a flat thirty days reports a healthy
    quarterly payload stale for sixty-one days of every ninety-one and
    `salary_dist` for all but a month of four. An alert wrong two weeks in three
    is one nobody opens, and it is the only thing watching for a refresh arm
    that has quietly stopped firing.

    Holding the two to each other is what this used to do and it is not enough:
    a number they agree on still drifts from the manifest both of them are
    describing. So each has to READ `payload-cadence.mjs`, which prints
    `PAYLOADS`' own `cadenceDays`. The site's banner is the same table at 1.5×
    (`view/freshness.js#payloadStatus`), which is the headroom between the alert
    and anything a reader sees.
    """
    root = Path(__file__).resolve().parents[2]
    workflow_dir = root / ".github" / "workflows"

    emitter = root / "site" / "scripts" / "payload-cadence.mjs"
    assert emitter.exists(), (
        f"{emitter} is gone. Both workflows shell out to it for the per-payload "
        f"cadence; without it each has to carry its own number again."
    )

    for name in ("refresh.yml", "freshness-check.yml"):
        text = (workflow_dir / name).read_text("utf-8")
        assert "payload-cadence.mjs" in text, (
            f"{name} does not read the payload manifest's cadence. A threshold it "
            f"picks for itself cannot serve a monthly release and a four-yearly "
            f"survey at once, and it fails by crying stale on healthy data."
        )
        literal = re.findall(r"^\s*threshold_days = (\d+)\s*$", text, re.M)
        assert not literal, (
            f"{name} assigns threshold_days = {literal[0]} rather than reading it "
            f"per payload. That is the shape this test exists to keep out: it is "
            f"silently wrong for every payload whose upstream is not monthly."
        )


def test_the_weekly_check_reads_the_data_pull_requests_and_never_merges_them() -> None:
    """Every arm but one opens a PR, and a payload reaches a reader through a merge.

    Nothing in this repository merges them. Left alone the site ages while every
    gate stays green — the refresh ran, the gates passed, the PR opened, CI went
    green on it — and the only other signal is an overdue line on a page the
    reader may never open. So the weekly check reports the open `data/*` pull
    requests beside the stale payloads, which is what makes a staleness alert
    actionable rather than merely true.

    The second half of the assertion is the one worth keeping: auto-merge on
    green is the obvious next step and it is refused, because a data refresh is
    the change where the diff IS the review. This workflow may read the pull
    requests and may never take a write scope over them.
    """
    text = (
        Path(__file__).resolve().parents[2] / ".github" / "workflows" / "freshness-check.yml"
    ).read_text("utf-8")

    assert "pulls.list" in text, (
        "freshness-check.yml no longer reads the open pull requests, so a stale "
        "payload is reported with no indication that its refresh is already "
        "written and waiting for a merge."
    )
    assert re.search(r"^\s+pull-requests: read\s*$", text, re.M), (
        "freshness-check.yml does not take `pull-requests: read` — the listing "
        "step cannot see anything."
    )
    assert not re.search(r"^\s+pull-requests: write\s*$", text, re.M), (
        "freshness-check.yml has taken a write scope over pull requests. This "
        "workflow reports who has not merged the data; it must not become the "
        "thing that merges it (docs/architecture.md §CI)."
    )
    for forbidden in ("pulls.merge", "enablePullRequestAutoMerge", "gh pr merge"):
        assert forbidden not in text, (
            f"freshness-check.yml calls {forbidden}. A data refresh is the change "
            f"where the diff is the review; a bot merging it removes the only "
            f"human look any published figure gets."
        )


def test_every_payload_an_arm_writes_is_owned_by_that_arm() -> None:
    """A payload whose stem does not match its arm never publishes, and CI goes green.

    A refresh works out which files it owns from the `--source` name it was
    given, so the failure this leaves is the worst-behaved one in the pipeline:
    an arm writes a correct, fully-gated payload to disk, the run finds nothing
    of its own changed, the commit and the pull request are skipped, and it
    reports a successful refresh. The payload sits at its first `as_of` for ever
    and the only thing that ever notices is the staleness banner, months later,
    in front of a reader.

    `refresh_report.owns` is called rather than restated: a test carrying its own
    copy of the rule passes whatever the rule does. `hicp` is why it is a prefix
    rather than an equality — one arm, two files. `house-market` is the same
    shape and the reason this test exists: `housing_structure.json` was the
    natural name for its second payload and is owned by no arm at all.
    """
    for source, payloads in sorted(ARM_PAYLOADS.items()):
        for filename in payloads:
            assert owns(source, filename.removesuffix(".json")), (
                f"`--source {source}` writes {filename}, which no arm claims. "
                f"That run publishes nothing and still reports success."
            )


def test_the_payload_table_names_every_arm() -> None:
    """Otherwise an arm added without a payload row is checked by nothing above."""
    assert sorted(ARM_PAYLOADS) == sorted(ARMS), (
        "ARM_PAYLOADS and ARMS disagree about which arms exist, so one of the "
        "two tests above is silently skipping an arm."
    )


def test_the_refresh_workflow_asks_the_pipeline_whether_anything_really_changed() -> None:
    """The decision that opens a pull request is code this repository runs.

    A payload differing only by when it was fetched is not a data refresh, and
    the check that says so has to be able to be WRONG in a test. Written into the
    workflow it cannot: `make check` does not run GitHub Actions, so the only
    thing a test can do with a heredoc is read it and agree with it — which a
    strip that drops the run date at the top level of a payload and nowhere else
    passes comfortably, while opening a pull request whose whole diff is dates.

    So the workflow may call `refresh-report` and may not carry a second copy of
    the decision. `test_refresh_report.py` is what holds the decision itself, on
    the real payloads.

    The output names are checked in the same place because they are the seam: a
    key renamed on one side leaves the commit step reading an empty string, which
    is not `yes`, so the arm goes quiet and every run reports success.
    """
    workflow = (
        Path(__file__).resolve().parents[2] / ".github" / "workflows" / "refresh.yml"
    ).read_text("utf-8")

    assert "vyarno-pipeline refresh-report" in workflow, (
        "refresh.yml no longer asks the pipeline whether the upstream republished. "
        "A comparison written in YAML is executed by nothing in this repository."
    )
    for copied in ("RUN_STAMPED", "git show origin/main", "json.load"):
        assert copied not in workflow, (
            f"refresh.yml carries `{copied}`, so the workflow is deciding for "
            f"itself again. Two copies of this rule means the tested one is not "
            f"necessarily the one that runs."
        )

    emitted = set()
    for report in (
        Report(as_of="2026-08-21", real_change=True, changed=("hicp.json",), stale=("x (9d)",)),
        Report(as_of="unknown", real_change=False, changed=(), stale=()),
    ):
        emitted |= set(re.findall(r"^([a-z_]+)(?:=|<<)", github_output(report), re.M))

    referenced = set(re.findall(r"steps\.meta\.outputs\.([a-z_]+)", workflow))
    missing = sorted(referenced - emitted)
    assert not missing, (
        f"refresh.yml reads {missing} off the report step, and `refresh-report` "
        f"writes no such output. The step that reads it sees an empty string."
    )


def test_nothing_commits_pushes_or_opens_a_pull_request_without_a_real_change() -> None:
    """The answer is only worth having if the publishing steps are gated on it.

    This is the half that lives in the workflow and nowhere else. The comparison
    can be perfect and a run still opens a pull request over two changed dates,
    because the step that commits ran anyway — and the diff a reviewer is then
    asked to look at contains no number at all.
    """
    workflow = (
        Path(__file__).resolve().parents[2] / ".github" / "workflows" / "refresh.yml"
    ).read_text("utf-8")

    publishing = [
        block
        for block in re.split(r"^      - name: ", workflow, flags=re.M)
        if re.search(r"^\s+git commit\b|^\s+git push\b|pulls\.create", block, re.M)
    ]
    assert len(publishing) >= 3, (
        f"expected the commit, the push and the pull request to be three separate "
        f"steps; found {len(publishing)}. Has the publish path moved?"
    )
    for block in publishing:
        name = block.splitlines()[0].strip()
        assert "real_change == 'yes'" in block, (
            f"the `{name}` step runs whatever the comparison decided, so a run that "
            f"re-read the same figures still publishes them."
        )
