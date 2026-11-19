"""A data pull request merges itself only when branch protection is what holds it.

Two failures, and the second is the one that publishes. **A held PR that merges
anyway** puts a figure somebody flagged in front of every reader. **An armed PR
nothing was holding back** merges the instant auto-merge is switched on, before
the five CI checks have reported at all, which is the gate the whole policy
rests on. Nothing here touches the network: `_graphql` is what GitHub would say.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

from vyarno_pipeline import automerge


def _pr(
    status="BLOCKED",
    labels=(),
    armed=False,
    state="OPEN",
    draft=False,
    paths=("data/published/hicp_headline.json",),
    total=None,
) -> dict:
    return {
        "id": "PR_kw",
        "state": state,
        "isDraft": draft,
        "headRefOid": "570ff0f",
        "mergeStateStatus": status,
        "autoMergeRequest": {"mergeMethod": "REBASE"} if armed else None,
        "labels": {"nodes": [{"name": name} for name in labels]},
        "files": {
            "totalCount": len(paths) if total is None else total,
            "nodes": [{"path": path} for path in paths],
        },
    }


@pytest.mark.parametrize(
    ("pr", "action"),
    [
        (_pr("BLOCKED"), "arm"),
        (_pr("BEHIND"), "arm"),
        (_pr("BLOCKED", labels=["needs-review"]), "held"),
        (_pr("BLOCKED", labels=["Hold"]), "held"),
        (_pr("BLOCKED", labels=["hold"], armed=True), "disarm"),
        (_pr("BLOCKED", armed=True), "armed"),
        (_pr("UNKNOWN"), "wait"),
        (_pr("DIRTY"), "refuse"),
        (_pr("CLEAN"), "refuse"),
        (_pr("UNSTABLE"), "refuse"),
        (_pr("BLOCKED", state="MERGED"), "skip"),
        (_pr("BLOCKED", draft=True), "skip"),
        # Only published payloads merge themselves, whatever the branch is called.
        (_pr("BLOCKED", paths=("data/published/x.json", ".github/workflows/ci.yml")), "refuse"),
        (_pr("BLOCKED", paths=("site/src/lib/mirror.js",)), "refuse"),
        (_pr("BLOCKED", paths=("data/published/x.json", "README.md"), armed=True), "disarm"),
        (_pr("BLOCKED", paths=("data/published/x.json",), total=101), "refuse"),
        (_pr("BLOCKED", paths=()), "refuse"),
    ],
)
def test_only_a_pr_branch_protection_is_holding_is_armed(pr: dict, action: str) -> None:
    assert automerge.decide(pr)[0] == action


def _scripted(monkeypatch, *answers: dict) -> list[tuple[str, dict]]:
    """Answer each query with the next PR in `answers`; record the mutations."""
    queue = list(answers)
    mutations: list[tuple[str, dict]] = []

    def _fake(query: str, variables: dict, token: str) -> dict:
        if query is automerge.QUERY:
            return {"repository": {"pullRequest": queue.pop(0)}}
        mutations.append((query, variables))
        return {}

    monkeypatch.setattr(automerge, "_graphql", _fake)
    monkeypatch.setattr(automerge, "POLL_WAIT", 0)
    return mutations


def test_a_fresh_refresh_pr_is_armed_on_its_head_once_github_has_looked(monkeypatch) -> None:
    """Straight after a push GitHub reports UNKNOWN; arming then would refuse a good PR."""
    mutations = _scripted(monkeypatch, _pr("UNKNOWN"), _pr("BLOCKED"))
    assert automerge.run("o/r", 211, "t") == 0
    assert mutations == [
        (automerge.ENABLE, {"id": "PR_kw", "oid": "570ff0f", "method": "REBASE"}),
    ], "armed on anything but the head it read, or with another merge method"


def test_a_hold_label_switches_auto_merge_off_and_passes(monkeypatch) -> None:
    mutations = _scripted(monkeypatch, _pr("BLOCKED", labels=["hold"], armed=True))
    assert automerge.run("o/r", 211, "t") == 0
    assert mutations == [(automerge.DISABLE, {"id": "PR_kw"})]


@pytest.mark.parametrize("status", ["CLEAN", "UNSTABLE", "DIRTY"])
def test_nothing_is_armed_where_auto_merge_would_not_wait_for_ci(monkeypatch, status) -> None:
    """Without required checks a PR is CLEAN the moment it opens, and arming merges it."""
    mutations = _scripted(monkeypatch, _pr(status))
    assert automerge.run("o/r", 211, "t") == 1
    assert mutations == []


def test_the_label_workflow_can_run_it_with_nothing_installed() -> None:
    """`data-pr-hold.yml` runs it on the runner's own Python, as `watch.yml` does `watch`."""
    tree = ast.parse(Path(automerge.__file__).read_text("utf-8"))
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            names = [node.module]
        for name in names:
            assert name.split(".")[0] in sys.stdlib_module_names, (
                f"automerge.py imports {name}; the label workflow installs nothing."
            )
