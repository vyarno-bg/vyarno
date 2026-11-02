"""The refresh arm's push cannot clobber a branch it did not fetch.

**The branch outlives the run that made it.** `refresh.yml` creates
`data/<source>` fresh from `main` every time, but the branch is only deleted
when its pull request merges — so a refresh that fires while the last one is
still awaiting review meets a `data/<source>` on origin whose history this
branch does not contain. A plain `git push` is refused as non-fast-forward,
and the whole run fails at the last step with a correct payload already
written to disk.

`merge -s ours` resolves that without a force: it records the stale branch as
an ancestor and keeps THIS tree, byte for byte, so the push fast-forwards and
the pull request shows the newest refresh against `main`. Nothing is lost that
anyone wanted — the superseded commit holds an older read of the same
upstream, and the payload it carried is the one this run just re-fetched.

**The lease is what makes that safe.** `merge -s ours` makes the push a
fast-forward, so the `--force-with-lease` never has to force anything: it is
the assertion that the branch being superseded is still the branch that was
fetched, held against the SHA the fetch returned. A branch that moved in
between — the box's `vyarno-city-price-weekly` cron, a manual `git push` from
Kiril — is refused with the same error a plain push would give, rather than
being clobbered by a refresh that never saw it.

The decision lives in YAML, but YAML is not read by `make check` — only this
test does. A workflow that loses the lease loses the only thing standing
between a routine refresh and somebody else's work, and it loses it silently:
the push still succeeds, on a branch nobody is looking at.

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


def test_push_step_supersedes_a_stale_branch_without_clobbering_it() -> None:
    """`Push` supersedes a stale `data/<source>` without disabling the lease.

    A plain `git push` would refuse the new tip because the local commit is
    not a descendant of the stale remote branch the merge-ours step just
    fetched. `--force-with-lease` is the one exception to the workflow's
    "never force" rule, and it is bounded: the lease holds against the SHA
    the fetch returned, so the push cannot rewrite a branch that moved in
    between.
    """
    text = WORKFLOW.read_text("utf-8")
    steps = _split_steps(text)
    push_steps = [(name, body) for name, body in steps if name == "Push"]
    assert len(push_steps) == 1, (
        f"refresh.yml must have exactly one Push step; found {len(push_steps)}"
    )
    _, push_body = push_steps[0]
    assert "force-with-lease" in push_body, (
        "the Push step must use --force-with-lease; it is the assertion that "
        "the branch being superseded is still the branch that was fetched, and "
        "a plain push has no such assertion."
    )
    assert "merge -s ours" in push_body, (
        "the Push step must keep `merge -s ours` for the supersede path; "
        "removing it is what makes a stale remote branch reject a plain push."
    )
    # The lease has to name the SHA the fetch returned. A bare
    # `--force-with-lease` compares against the local remote-tracking ref,
    # which is stale the moment anything else pushed — so it would protect
    # against nothing.
    assert re.search(r"force-with-lease=\"refs/heads/\$BRANCH:\$EXPECTED\"", push_body), (
        "the Push step's lease must name the SHA the fetch returned "
        "(`--force-with-lease=refs/heads/$BRANCH:$EXPECTED`); a bare "
        "`--force-with-lease` compares against the local remote-tracking ref, "
        "which is stale the moment anything else pushed, and so protects "
        "against nothing."
    )
