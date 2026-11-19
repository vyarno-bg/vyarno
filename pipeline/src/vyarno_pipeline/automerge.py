"""Let a data pull request merge itself once it is green, unless somebody holds it.

    python3 -m vyarno_pipeline.automerge --pr NUMBER [--repo OWNER/NAME]

Any workflow that opens or relabels a `data/*` pull request calls this, with a
token in `GH_TOKEN` that may write contents and pull requests. It reads the
pull request and does one thing:

- **holds it** when it carries a label in `HOLD_LABELS`, switching auto-merge
  off if it was on. A refresh that raised a flag labels its own PR this way;
  a person does the same to stop one;
- **arms GitHub auto-merge** (`MERGE_METHOD`, the way every data PR has landed)
  when branch protection is what stands between it and `main`. GitHub then
  merges it the moment the five required CI checks report green;
- **refuses** anything else: a PR that changes a file outside `PUBLISHED`, a
  conflict, or a PR nothing is holding back, where arming would merge it before
  CI has reported at all.

Exit 0 when it did what the labels and the branch state ask, 1 when it refused
or the API failed; the PR then waits for a person, which is the safe default.

stdlib only, like `watch.py`: the label workflow runs it on the runner's own
Python with nothing installed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

#: A PR carrying any of these never merges itself. `needs-review` is what a
#: refresh that raised soft flags puts on its own PR; `hold` is a person's.
HOLD_LABELS = frozenset({"hold", "needs-review"})

#: Every data PR on `main` landed as one rebased commit carrying the refresh's
#: own message, with no merge commit and no "(#N)" squash title.
MERGE_METHOD = "REBASE"

#: The only files a pull request may change and still merge itself. A branch
#: named `data/...` is a convention anyone with push access can borrow, so the
#: diff is what is judged: code always waits for a person.
PUBLISHED = "data/published/"

#: GitHub computes mergeability after a push, and reports UNKNOWN until it has.
POLLS = 6
POLL_WAIT = 5.0

QUERY = """
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id state isDraft headRefOid mergeStateStatus
      autoMergeRequest { mergeMethod }
      labels(first: 50) { nodes { name } }
      files(first: 100) { totalCount nodes { path } }
    }
  }
}
"""

ENABLE = """
mutation($id: ID!, $oid: GitObjectID!, $method: PullRequestMergeMethod!) {
  enablePullRequestAutoMerge(
    input: {pullRequestId: $id, expectedHeadOid: $oid, mergeMethod: $method}
  ) { clientMutationId }
}
"""

DISABLE = """
mutation($id: ID!) {
  disablePullRequestAutoMerge(input: {pullRequestId: $id}) { clientMutationId }
}
"""


class ApiError(RuntimeError):
    """GitHub answered with an error, or did not answer."""


def decide(pr: dict) -> tuple[str, str]:
    """What to do with this pull request, and the sentence that says why.

    One of `skip`, `held`, `disarm`, `armed`, `arm`, `wait` or `refuse`.
    """
    if pr["state"] != "OPEN":
        return "skip", f"the pull request is {pr['state'].lower()}"
    labels = {node["name"].lower() for node in pr["labels"]["nodes"]}
    held = sorted(labels & HOLD_LABELS)
    if held:
        if pr["autoMergeRequest"]:
            return "disarm", f"labelled {', '.join(held)}: auto-merge switched off"
        return "held", f"labelled {', '.join(held)}: it waits for a person"
    files = pr["files"]
    outside = [node["path"] for node in files["nodes"] if not node["path"].startswith(PUBLISHED)]
    # Checked before "already armed": a later push that adds code switches it off.
    if outside:
        why = f"it changes {outside[0]}, outside {PUBLISHED}"
    elif not files["nodes"]:
        why = "it changes no file"
    elif files["totalCount"] != len(files["nodes"]):
        why = f"it changes {files['totalCount']} files, more than one read can check"
    else:
        why = ""
    if why:
        if pr["autoMergeRequest"]:
            return "disarm", f"{why}: auto-merge switched off"
        return "refuse", f"{why}, so a person merges it"
    if pr["isDraft"]:
        return "skip", "the pull request is a draft"
    if pr["autoMergeRequest"]:
        return "armed", f"auto-merge is already on ({pr['autoMergeRequest']['mergeMethod']})"
    status = pr["mergeStateStatus"]
    # BLOCKED and BEHIND both mean branch protection is holding it, which is the
    # only state in which auto-merge waits for CI rather than merging at once.
    if status in ("BLOCKED", "BEHIND"):
        return "arm", f"branch protection holds it ({status}); it merges when CI is green"
    if status == "UNKNOWN":
        return "wait", "GitHub has not worked out whether it can merge yet"
    if status == "DIRTY":
        return "refuse", "it conflicts with main"
    return "refuse", (
        f"nothing is holding it back ({status}), so auto-merge would merge it before "
        "CI reports. Either CI is already green and a person can merge it, or branch "
        "protection no longer requires the five CI checks"
    )


def _graphql(query: str, variables: dict, token: str) -> dict:
    url = os.environ.get("GITHUB_GRAPHQL_URL", "https://api.github.com/graphql")
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except OSError as err:
        raise ApiError(str(err)) from err
    if payload.get("errors"):
        raise ApiError("; ".join(error.get("message", "?") for error in payload["errors"]))
    return payload["data"]


def _read(repo: str, number: int, token: str) -> dict:
    owner, name = repo.split("/", 1)
    data = _graphql(QUERY, {"owner": owner, "name": name, "number": number}, token)
    return data["repository"]["pullRequest"]


def run(repo: str, number: int, token: str) -> int:
    """Read the PR, settle what to do, do it. Prints workflow annotations."""
    try:
        pr = _read(repo, number, token)
        action, why = decide(pr)
        for _ in range(POLLS):
            if action != "wait":
                break
            time.sleep(POLL_WAIT)
            pr = _read(repo, number, token)
            action, why = decide(pr)
        if action == "arm":
            variables = {"id": pr["id"], "oid": pr["headRefOid"], "method": MERGE_METHOD}
            _graphql(ENABLE, variables, token)
        elif action == "disarm":
            _graphql(DISABLE, {"id": pr["id"]}, token)
    except ApiError as err:
        print(f"::error::#{number}: GitHub refused: {err}", file=sys.stderr)
        return 1
    if action in ("refuse", "wait"):
        print(f"::warning::#{number} will not merge itself: {why}", file=sys.stderr)
        return 1
    print(f"::notice::#{number}: {why}", file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pr", type=int, required=True, help="pull request number")
    parser.add_argument(
        "--repo",
        default=os.environ.get("GITHUB_REPOSITORY"),
        help="OWNER/NAME (default: $GITHUB_REPOSITORY)",
    )
    args = parser.parse_args(argv)
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token or not args.repo:
        print("::error::needs GH_TOKEN and --repo (or GITHUB_REPOSITORY)", file=sys.stderr)
        return 1
    return run(args.repo, args.pr, token)


if __name__ == "__main__":  # pragma: no cover — the workflows' entry point
    raise SystemExit(main())
