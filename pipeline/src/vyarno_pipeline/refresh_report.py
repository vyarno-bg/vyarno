"""What a refresh run reports about `data/published/` once its arm has written.

Three answers, and they live together because they turn on one rule: the date to
commit under, whether anything but that date moved, and which other payloads have
gone past their own cadence. The shared rule is which files the run owns.

## Why the decision is here rather than in the workflow

`make check` does not run GitHub Actions, so a decision written into a workflow
is executed by nothing in this repository — a test can only read the YAML and
agree with whatever it says. The decision below has to be able to be WRONG in a
test, because the failure it prevents is a quiet one: a pull request whose whole
diff is dates. This project spends exactly one human look on a published figure,
and a review that moves no number spends it on nothing and teaches the reviewer
to skim the next one.

## Run stamps are ours; an upstream's own date is not

`transform.py` writes `published_at=as_of`, so both fields are the run date
restated and neither is evidence that anybody republished anything. They are
dropped BY NAME AND AT EVERY DEPTH: `hicp_categories.json` carries one inside
each of its thirteen category rows, and a strip reaching only the top level
leaves thirteen moved dates behind to read as a data refresh.

`snapshot_date` (имот.bg's own newest published snapshot) and `gazette_date`
(the Държавен вестник issue behind the payroll table) are the publishers' dates,
not ours. A move in either IS the thing this file exists to detect, so neither
may join the set — the test that holds the set to the payloads is
`test_refresh_report.py`.
"""

from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path

#: Fields the pipeline stamps with the date of the RUN rather than with anything
#: an upstream published. Read the module docstring before adding one: a
#: publisher's own date in here hides a real republication.
RUN_STAMPED = frozenset({"as_of", "published_at"})


def strip_run_stamps(node: object) -> object:
    """Return `node` with every run-stamped field removed, at any depth."""
    if isinstance(node, dict):
        return {k: strip_run_stamps(v) for k, v in node.items() if k not in RUN_STAMPED}
    if isinstance(node, list):
        return [strip_run_stamps(item) for item in node]
    return node


def has_real_change(published: dict, committed: dict | None) -> bool:
    """Did an upstream republish, or is this the same figures on a later day?

    `committed is None` is a source publishing for the first time, which is a
    real change: there is nothing to compare it against and the file has to land.
    """
    if committed is None:
        return True
    return strip_run_stamps(published) != strip_run_stamps(committed)


def owns(source: str, stem: str) -> bool:
    """Does `--source <source>` write `<stem>.json`?

    A `--source` name is not a filename: the option is hyphenated and the payload
    is not. A prefix rather than an equality because `hicp` and `house-market`
    write two files each. Get it wrong and a run owns nothing, which reads below
    as "the upstream republished nothing" and publishes a payload never.
    """
    return stem.startswith(source.replace("-", "_"))


@dataclass(frozen=True)
class Report:
    """What the workflow does next, and what it tells the reviewer it did."""

    as_of: str
    real_change: bool
    #: Payloads this arm owns whose figures moved. Empty is the cached read.
    changed: tuple[str, ...]
    #: Other payloads past their own cadence, each with the numbers behind it.
    stale: tuple[str, ...]


def committed_reader(repo: Path, ref: str) -> Callable[[Path], dict | None]:
    """Read a payload as `ref` has it, or `None` where `ref` does not carry it.

    The working tree is the wrong thing to compare against: the arm has already
    overwritten it. `None` on a missing path rather than a raise, because a
    source's first publish is the same shape as a typo and only one of them is
    an error the run can do anything about.
    """

    def read(path: Path) -> dict | None:
        rel = os.path.relpath(path, repo)
        try:
            blob = subprocess.check_output(
                ["git", "-C", str(repo), "show", f"{ref}:{Path(rel).as_posix()}"],
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            return None
        return json.loads(blob)

    return read


def build_report(
    published_dir: Path,
    source: str,
    cadence: dict[str, int],
    committed: Callable[[Path], dict | None],
    today: date,
) -> Report:
    """Compare what this arm just wrote against what is committed.

    `cadence` is the manifest's own per-payload threshold, printed by
    `site/scripts/payload-cadence.mjs`. A flat number here would report the
    Eurostat property cubes stale for two thirds of a healthy quarter, and a
    staleness list that is mostly wrong is one a reviewer scrolls past on the run
    where it names something real.
    """
    paths = sorted(published_dir.glob("*.json"))

    mine = [path for path in paths if owns(source, path.stem)]
    # This arm's own as_of, never the newest date in the directory: a commit
    # message reading "mortgage as of 2026-08-10" over a payload dated 2026-06-30
    # dates the review wrong, and that date is what a reviewer checks first.
    dates = [json.loads(path.read_text("utf-8")).get("as_of") for path in mine]
    stamped = [value for value in dates if value]
    as_of = max(stamped) if stamped else "unknown"

    changed = tuple(
        path.name
        for path in mine
        if has_real_change(json.loads(path.read_text("utf-8")), committed(path))
    )

    stale = []
    for path in paths:
        if owns(source, path.stem):
            continue
        as_of_other = json.loads(path.read_text("utf-8")).get("as_of")
        if not as_of_other:
            continue
        # A payload with no manifest row renders nowhere on the site, so it is
        # named rather than passed over — the weekly check reports it the same way.
        threshold = cadence.get(path.stem)
        if threshold is None:
            stale.append(f"{path.stem} (not in the payload manifest)")
            continue
        days = (today - date.fromisoformat(as_of_other)).days
        if days > threshold:
            stale.append(f"{path.stem} ({days}d, cadence {threshold}d)")

    return Report(as_of=as_of, real_change=bool(changed), changed=changed, stale=tuple(stale))


def github_output(report: Report) -> str:
    """The `$GITHUB_OUTPUT` block the commit, push and pull-request steps gate on."""
    lines = [
        f"as_of={report.as_of}",
        f"real_change={'yes' if report.real_change else 'no'}",
        f"stale={'yes' if report.stale else 'no'}",
    ]
    if report.stale:
        lines += ["stale_list<<EOF", ", ".join(report.stale), "EOF"]
    return "\n".join(lines) + "\n"


def step_summary(report: Report, source: str) -> str:
    """The run's own page, in one screen, for the outcome that opens nothing.

    A cached read ends green with a `::notice::` in a fold, which in the Actions
    list is indistinguishable from a run that published — so the good outcome is
    the one nobody can confirm without reading the log of a job that did nothing.
    A step summary renders on the run page itself.
    """
    if not report.real_change:
        return (
            f"### {source} — nothing republished\n\n"
            f"The upstream is still serving the figures already committed; only the "
            f"run date moved. No branch, no pull request, and nothing to review.\n"
        )
    published = ", ".join(f"`{name}`" for name in report.changed)
    summary = f"### {source} — republished, as of {report.as_of}\n\n{published}\n"
    if report.stale:
        summary += f"\nOther payloads past their own cadence: {', '.join(report.stale)}\n"
    return summary
