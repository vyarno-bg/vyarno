"""Ask every upstream in its own window whether it has published since we did.

Run by `.github/workflows/watch.yml` every ten minutes across the hours
`release_calendar.py` says a publisher can release in. It answers one question
per upstream — *has this publisher moved since the arm reading it last ran?* —
and prints the arms that need dispatching. That is the whole reason this exists:
the refresh itself takes three minutes and a runner install, and a poll that
paid that cost could not run every ten minutes.

**Nothing here decides anything about the data.** A probe reads a timestamp,
never a value; the pipeline re-fetches from scratch and every gate runs as it
always did. The worst a wrong probe can do is dispatch a refresh that finds
nothing changed, which the refresh already detects and skips.

**It must not import a module that reaches httpx.** The watcher runs on the
runner's own Python before the pipeline is installed, which is what keeps a
tick down to about fifteen seconds. stdlib only, and
`test_release_calendar.py` holds it to that.

    python3 -m vyarno_pipeline.watch [--all] [--repo PATH]

`--all` ignores the windows and probes every upstream. That is the wide sweep:
a correction lands on no calendar and is still a figure to be first with.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

from vyarno_pipeline.release_calendar import (
    EUROSTAT_UPDATED,
    HTTP_LAST_MODIFIED,
    WATCHED,
    Release,
    payload_stems,
    releases_due,
)

# Named rather than anonymous, because four public services are being polled
# every ten minutes and an operator reading their own logs should be able to
# tell who this is and stop us without guessing.
USER_AGENT = "vyarno.bg release watcher (+https://vyarno.bg)"

TIMEOUT = 20.0

# One retry, then the tick fails. A probe that gives up silently is the shape
# this whole file exists to remove: the watcher would stop watching and the
# only signal would be a payload going stale weeks later.
RETRIES = 2
RETRY_WAIT = 3.0


class ProbeError(RuntimeError):
    """An upstream could not be asked. Never confused with "nothing new"."""


def _request(url: str, method: str) -> tuple[dict[str, str], bytes]:
    request = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return dict(response.headers), response.read()


def _fetch_marker(release: Release) -> datetime:
    """The instant this upstream says it last published."""
    if release.marker == EUROSTAT_UPDATED:
        _, body = _request(release.url, "GET")
        updated = json.loads(body).get("updated")
        if not updated:
            raise ProbeError(f"{release.label}: the response carries no `updated` field")
        return datetime.fromisoformat(updated).astimezone(UTC)
    if release.marker == HTTP_LAST_MODIFIED:
        headers, _ = _request(release.url, "HEAD")
        stamp = headers.get("Last-Modified")
        if not stamp:
            raise ProbeError(f"{release.label}: the response carries no Last-Modified header")
        return parsedate_to_datetime(stamp).astimezone(UTC)
    raise ProbeError(f"{release.label}: unknown marker {release.marker!r}")


def marker_of(release: Release) -> datetime:
    """`_fetch_marker` with one retry, so a dropped connection is not a red run."""
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            return _fetch_marker(release)
        except (urllib.error.URLError, OSError, ValueError, ProbeError) as err:
            last = err
            if attempt + 1 < RETRIES:
                time.sleep(RETRY_WAIT)
    raise ProbeError(f"{release.label}: {last}")


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


EPOCH = datetime.fromtimestamp(0, tz=UTC)


def last_read(repo: Path, source: str, last_runs: dict[str, str]) -> datetime:
    """When this arm last fetched its upstream — which is what a marker beats.

    **The question is when we last LOOKED, not when we last published.** A
    commit date answers the wrong one: `unemployment.json` was touched on
    2026-08-17 by a run that read a cube Eurostat had already updated on
    2026-08-12 and found nothing new to publish, so against a commit date the
    July rate we are missing looks like a release we already have. The `as_of`
    date is wrong in the other direction — it is a day rather than an instant,
    so any marker later in that same day reads as new for ever and the arm is
    dispatched on every tick.

    So the clock is the arm's own last workflow run, whatever it concluded.
    That advances exactly when we read the upstream, which makes a dispatched
    refresh its own acknowledgement. `watch.yml` passes the times in; the
    commit-date fallback is for a person running this by hand off a checkout.
    """
    recorded = last_runs.get(source)
    if recorded:
        return datetime.fromisoformat(recorded.replace("Z", "+00:00")).astimezone(UTC)

    published = repo / "data" / "published"
    stems = sorted(path.stem for path in published.glob("*.json"))
    files = [f"data/published/{stem}.json" for stem in payload_stems(source, stems)]
    stamps = []
    for ref in ("HEAD", f"origin/data/{source}"):
        for path in files:
            iso = _git(repo, "log", "-1", "--format=%cI", ref, "--", path)
            if iso:
                stamps.append(datetime.fromisoformat(iso).astimezone(UTC))
    return max(stamps) if stamps else EPOCH


def sweep(
    repo: Path,
    now: datetime,
    watch_all: bool,
    last_runs: dict[str, str],
) -> dict[str, object]:
    """Probe every upstream in window and report which arms the release moved past."""
    watching = WATCHED if watch_all else releases_due(now)
    refresh: list[dict[str, str]] = []
    failed: list[str] = []
    probed = 0

    for source, releases in sorted(watching.items()):
        ours = last_read(repo, source, last_runs)
        newest: tuple[datetime, Release] | None = None
        for release in releases:
            probed += 1
            try:
                marker = marker_of(release)
            except ProbeError as err:
                print(f"  FAILED {err}", file=sys.stderr)
                failed.append(release.label)
                continue
            ahead = marker > ours
            print(
                f"  {source}: {release.label} — upstream {marker.isoformat()}, "
                f"ours {ours.isoformat()} — {'NEW' if ahead else 'unchanged'}",
                file=sys.stderr,
            )
            if ahead and (newest is None or marker > newest[0]):
                newest = (marker, release)
        if newest:
            refresh.append(
                {
                    "source": source,
                    "detected": f"{newest[1].label} published {newest[0].isoformat()}",
                }
            )

    return {"refresh": refresh, "probed": probed, "failed": failed}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="repository root (default: cwd)")
    parser.add_argument(
        "--all",
        action="store_true",
        help="probe every upstream, ignoring its window — the wide sweep",
    )
    parser.add_argument(
        "--last-run",
        help="JSON of {source: ISO instant} — when each arm last ran. See `last_read`.",
    )
    args = parser.parse_args(argv)

    last_runs = json.loads(Path(args.last_run).read_text("utf-8")) if args.last_run else {}
    now = datetime.now(UTC)
    result = sweep(Path(args.repo).resolve(), now, args.all, last_runs)
    print(json.dumps(result))

    failed = result["failed"]
    if failed:
        print(f"::error::{len(failed)} probe(s) failed: {', '.join(failed)}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":  # pragma: no cover — the workflow's entry point
    raise SystemExit(main())
