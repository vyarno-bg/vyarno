"""The refresh arm regenerates the README screenshot when its data moves it.

The screenshot the home page renders is read by every reader, in both READMEs.
A data refresh can change what the page prints — a `ref_period` advancing so
that two clocks collapse together removes the row the strip labels, and the
label on the next row takes over. `verify_render_screenshot.mjs` is the suite
that catches it; CI goes red on a green payload when nobody regenerates the
sidecar alongside the data. PR #164 (data refresh: mortgage as of 2026-09-02)
went red for exactly that reason: the bot committed the new mortgage rate,
the strip label changed from «всички изплащани» to «ecb+bnb», and the sidecar
still claimed the first.

`docs/img/screenshot.txt` and `docs/img/screenshot.png` are the only place a
reviewer can see the home page without opening a browser, and a bot cannot
open one. So `refresh.yml` is what runs the regeneration, and this file is
what holds it to that responsibility.

The decision lives in YAML, but YAML is not read by `make check` — only this
test does. A workflow that loses the step loses the bot's ability to ship its
own fix, and the PR goes red on a green figure. Asserting the step exists is
what makes the rule mechanical rather than aspirational, in the same way
`test_release_calendar.py` holds the crons to the release table: a copy that
drifts fails in the shape this project can least afford, and a one-line
assertion here catches it before CI does.

Parsing the workflow with stdlib rather than `pyyaml` keeps this test off a
new dev dependency — `pyproject.toml` would carry it for one assertion, and
the pipeline has no other need.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "refresh.yml"


def _split_steps(text: str) -> list[tuple[str, str]]:
    """Return `(name, body)` for each top-level `- name:` step.

    The workflow has six-space indentation for each step, with the `name:`
    line at column 7. Splitting on `^      - name: ` gives the step bodies,
    each starting with the step's name on its own line; the regex keeps the
    comment lines and run-blocks intact.
    """
    chunks = re.split(r"^      - name: ", text, flags=re.M)
    out: list[tuple[str, str]] = []
    for chunk in chunks[1:]:
        first_line, _, rest = chunk.partition("\n")
        out.append((first_line.strip(), rest))
    return out


def _by_id(steps: list[tuple[str, str]], step_id: str) -> tuple[str, str] | None:
    """Return the step whose `id:` matches, or None if no step carries it."""
    for name, body in steps:
        m = re.search(r"^\s+id:\s*([\w-]+)\s*$", body, re.M)
        if m and m.group(1) == step_id:
            return name, body
    return None


def test_reshoot_step_present() -> None:
    """`refresh.yml` regenerates the README screenshot after the data commit.

    A bot that ships only the JSON payload cannot answer a sidecar that drifted
    in the same commit — the sidecar is in `docs/img/`, not in
    `data/published/`. The step is the bridge: it amends the data commit so the
    PR carries the rebuilt shot as part of the same change, and CI's
    `verify_render_screenshot.mjs` passes on the first run rather than after
    a human opens a terminal.

    A workflow that drops this step re-introduces the PR #164 regression class.
    """
    text = WORKFLOW.read_text("utf-8")
    steps = _split_steps(text)
    reshoot = _by_id(steps, "reshoot")
    assert reshoot is not None, (
        "refresh.yml has no step with id 'reshoot' — the data refresh arm no "
        "longer regenerates docs/img/screenshot.{png,txt}, and a bot PR will "
        "fail CI's verify_render_screenshot.mjs every time the page moves. "
        "Add the step back, modelled on the one this commit introduced."
    )
    name, body = reshoot
    # The step runs only when there is a real data change. Anything else means
    # it runs against a no-op PR and burns the runner budget.
    assert "steps.diff.outputs.changed" in body, f"the {name!r} step must skip when no data changed"
    assert "steps.meta.outputs.real_change" in body, (
        f"the {name!r} step must skip when the pipeline did not move a figure"
    )
    # And it must actually amend the data commit, not just regenerate the shot.
    assert "git commit --amend" in body, (
        "the reshoot step must amend the data commit so the regenerated "
        "shot ships in the same PR; a follow-up commit is what re-introduced "
        "the original problem on PR #164."
    )
    assert "docs/img/screenshot.png" in body and "docs/img/screenshot.txt" in body, (
        "the reshoot step must include both the PNG and the sidecar in the "
        "amend; the sidecar alone leaves the PNG inconsistent with the page."
    )


def test_push_step_uses_force_with_lease_when_amended() -> None:
    """`Push` accepts the reshoot amend without disabling the safety net.

    A plain `git push` would refuse the amended tip because the local commit
    is no longer a descendant of the stale remote `data/<source>` branch the
    merge-ours step just fetched. `--force-with-lease` is the one exception
    to the workflow's "never force" rule: it rewrites the amend this run
    made, and nothing else, because the lease holds against the SHA the
    fetch returned. Without it, the bot cannot ship its own screenshot fix
    on a branch that was already pushed for an earlier refresh.
    """
    text = WORKFLOW.read_text("utf-8")
    steps = _split_steps(text)
    push_steps = [(name, body) for name, body in steps if name == "Push"]
    assert len(push_steps) == 1, (
        f"refresh.yml must have exactly one Push step; found {len(push_steps)}"
    )
    _, push_body = push_steps[0]
    assert "force-with-lease" in push_body, (
        "the Push step must use --force-with-lease to accept the reshoot "
        "amend; a plain push rejects the rewritten tip, and the workflow "
        "loses the only way it has to ship its own screenshot fix."
    )
    assert "merge -s ours" in push_body, (
        "the Push step must keep `merge -s ours` for the supersede path; "
        "removing it is what makes a stale remote branch reject a plain push."
    )


def test_reshoot_runs_after_commit_and_before_push() -> None:
    """The order matters: amend before push, push after the amend.

    A reshoot step placed after Push would amend a tip that has already been
    pushed, and the push below it would silently lose the change. A reshoot
    step placed before Commit would have no commit to amend.
    """
    text = WORKFLOW.read_text("utf-8")
    steps = _split_steps(text)
    names = [name for name, _ in steps]
    assert "Commit" in names, "refresh.yml has no Commit step"
    assert "Push" in names, "refresh.yml has no Push step"
    reshoot_name = next((name for name, body in steps if "id: reshoot" in body), None)
    assert reshoot_name is not None, "refresh.yml has no step with id 'reshoot'"
    assert names.index("Commit") < names.index(reshoot_name), (
        "the reshoot step must run after Commit so it has a tip to amend"
    )
    assert names.index(reshoot_name) < names.index("Push"), (
        "the reshoot step must run before Push so the amended tip is what the push ships"
    )
