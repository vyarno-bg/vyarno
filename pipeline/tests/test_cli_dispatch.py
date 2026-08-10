"""`refresh --source <name>` reaches the right arm, and `--source all` reaches every one.

The seven `_refresh_*` functions are network-driven orchestration and are
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

from pathlib import Path

import pytest
from click.testing import CliRunner

from vyarno_pipeline import cli

# Every arm, and the `--source` value that should reach it. This mapping is the
# test: adding a connector means adding a line here, and the `all` test below
# then requires it to be wired into the bulk refresh too.
ARMS = {
    "hicp": "_refresh_hicp",
    "unemployment": "_refresh_unemployment",
    "mortgage": "_refresh_mortgage",
    "sofia-price": "_refresh_sofia_price",
    "region-salary": "_refresh_region_salary",
    "salary-dist": "_refresh_salary_dist",
    "payroll": "_refresh_payroll",
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

    `--source all` is seven publishes rather than one transaction: an arm writes
    its file as soon as its own gates pass, so a failure partway through leaves
    `data/published/` holding two refresh dates. Each arm exits the process from
    inside itself, so the only thing a bare run prints is the failing arm's own
    message — and the operator's next move (re-run one arm, or all seven)
    depends on knowing which of the other six are current.

    Exit code 4 is the network arm's, and it has to survive being reported on:
    swallowing it into a generic 1 loses the distinction between an upstream
    being unreachable and a gate refusing the data, which is the difference
    between waiting and investigating.
    """

    def dies(*_args, **_kwargs):
        raise SystemExit(4)

    monkeypatch.setattr(cli, "_refresh_sofia_price", dies)
    result = _run(tmp_path, "all")

    assert result.exit_code == 4, f"the arm's own exit code was lost: {result.exit_code}"
    out = result.output
    assert "stopped at 'sofia-price'" in out, out
    # Written before the failure, and named so they are not refreshed again.
    for landed in ("hicp", "unemployment", "mortgage"):
        assert landed in out.split("written this run:")[1].split("not reached:")[0], (
            f"`{landed}` completed but the failure report does not list it"
        )
    # Never started, and named so they are not assumed current.
    for skipped in ("region-salary", "salary-dist", "payroll"):
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
