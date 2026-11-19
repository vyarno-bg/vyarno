"""One command for the arms that have to run from a person's own machine.

`city-price` cannot run on a hosted runner (имот.bg answer a datacenter IP with
403) and `payroll` reads Държавен вестник, which times out from GitHub's. So
both are refreshed from a laptop, and this is everything that refresh is,
end to end:

    make refresh-local                         # SOURCE=city-price by default
    make refresh-local SOURCE=payroll
    pipeline\\.venv\\Scripts\\python -m vyarno_pipeline.local_refresh --source payroll

**The person's checkout is never touched.** The run happens in a temporary
`git worktree` at `origin/main`, outside the checkout: their branch, index,
uncommitted edits and stash stay exactly as they were, and what runs is the
code and data on `origin/main` rather than whatever happens to be checked out.
The arm and `refresh-report` are child processes whose `PYTHONPATH` puts that
worktree's `pipeline/src` ahead of the venv's editable install.

**What stops a run, and what only goes in front of a reviewer.** The arm's own
gates, the hard checks in `city_price_checks` and the offline suites stop it
before anything is committed. Soft flags travel in the commit body and in a
`Refresh-Flags:` trailer, which `.github/workflows/data-pr.yml` reads to label
the pull request it opens from this push.

Exit codes follow `cli.py`: 0 pushed or nothing new, the arm's own 2/3/4 passed
through, 3 for a hard check, 4 for a push the remote refused, 1 for anything
the person has to fix on their side (no git identity, no `make setup`).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from vyarno_pipeline import clock
from vyarno_pipeline.refresh_report import owns, strip_run_stamps

#: The arms this runs. Every other arm has a `refresh-<source>.yml` that runs it
#: on a hosted runner, and a second, laptop-made pull request for the same
#: payload is a race with that one rather than a convenience.
LOCAL_SOURCES = ("city-price", "payroll")

#: Where a person re-reads имот.bg's terms. `site/src/lib/legal.js` ships the
#: same URL as `termsUrl`, and `test_local_refresh.py` holds the two together.
IMOT_TERMS_URL = "https://www.imot.bg/obshti-uslovia"

#: The trailer `data-pr.yml` labels a pull request from. A count, so the
#: workflow never has to read prose to decide.
FLAGS_TRAILER = "Refresh-Flags"

# local-development.md §"--source city-price", checks 3 and 6. A district count
# falling by a tenth is worth opening the page for (gabrovo went 17 -> 15 on
# 2026-11-15); a baseline moving by a year is ordinary, by a decade it means
# имот.bg's archive changed shape and every «since YEAR» on /market/ with it.
DISTRICT_DROP_FLAG = 0.10
BASELINE_SHIFT_FLAG = 2
BASELINE_SHIFT_FAIL = 10


@dataclass
class Checks:
    """What the automated read of a fresh payload found."""

    hard: list[str] = field(default_factory=list)
    soft: list[str] = field(default_factory=list)


def city_price_checks(new: dict[str, Any], old: dict[str, Any] | None) -> Checks:
    """The six checks local-development.md lists, as far as a program can make them.

    Check 2, "moved nothing but `as_of`", is `refresh_report`'s, and the 60%
    district floor is the arm's own gate; both run elsewhere in this module.
    """
    out = Checks()
    cities = {c["code"]: c for c in new.get("cities", [])}
    pages = list(new.get("city_pages", []))
    before = {c["code"]: c for c in (old or {}).get("cities", [])}

    unread = [code for code in pages if code not in cities]
    if unread:
        out.hard.append(
            f"read {len(cities)} of {len(pages)} city pages; not read: {', '.join(unread)}. "
            f"A 403 from a flaky connection is worth re-running; the WARNINGs above say which"
        )
    gone = [code for code in before if code not in cities and code not in unread]
    for code in gone:
        out.soft.append(f"{code}: imot.bg no longer serve a page for it, so it leaves the site")

    undated = [code for code, c in cities.items() if not c.get("snapshot_date")]
    if cities and len(undated) == len(cities):
        out.hard.append("no city carries a snapshot_date: imot.bg's date list changed markup")
    else:
        for code in undated:
            out.soft.append(f"{code}: snapshot_date is null, so the card dates it by our fetch")

    for code, city in cities.items():
        prev = before.get(code)
        if city.get("n_dropped"):
            out.soft.append(
                f"{code}: {city['n_dropped']} current-year district value(s) outside the "
                f"sanity bounds were dropped"
            )
        if prev is None:
            out.soft.append(f"{code}: new city, {city.get('n_districts')} districts")
            continue
        was, now = prev.get("n_districts") or 0, city.get("n_districts") or 0
        if was and now < was and (was - now) / was >= DISTRICT_DROP_FLAG:
            out.soft.append(
                f"{code}: district count {was} -> {now} (down {100 * (was - now) / was:.1f}%)"
            )
        b_was, b_now = prev.get("baseline_year"), city.get("baseline_year")
        if isinstance(b_was, int) and isinstance(b_now, int):
            shift = abs(b_now - b_was)
            if shift >= BASELINE_SHIFT_FAIL:
                out.hard.append(
                    f"{code}: baseline_year {b_was} -> {b_now}, which means имот.bg's archive "
                    f"changed shape rather than that coverage drifted"
                )
            elif shift >= BASELINE_SHIFT_FLAG:
                out.soft.append(f"{code}: baseline_year {b_was} -> {b_now}")
        now_day, was_day = _day(city.get("snapshot_date")), _day(prev.get("snapshot_date"))
        if now_day and was_day and now_day < was_day:
            out.soft.append(
                f"{code}: snapshot went back, {prev['snapshot_date']} -> {city['snapshot_date']}"
            )
    return out


def _day(text: object) -> tuple[int, int, int] | None:
    """имот.bg's `d.m.yyyy`, as a sortable tuple."""
    match = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", str(text or ""))
    return (int(match[3]), int(match[2]), int(match[1])) if match else None


def diff_table(source: str, new: dict[str, Any], old: dict[str, Any] | None) -> list[str]:
    """The markdown table a reviewer reads first: what moved, was → now."""
    if source == "city-price":
        before = {c["code"]: c for c in (old or {}).get("cities", [])}
        rows = [
            "| Code | €/m² (was → now) | districts (was → now) | snapshot (was → now) |",
            "|---|---|---|---|",
        ]
        for city in new.get("cities", []):
            prev = before.pop(city["code"], {})
            rows.append(
                f"| {city['code']} | {prev.get('eur_per_m2_median', 'new')} → "
                f"{city.get('eur_per_m2_median')} | {prev.get('n_districts', 'new')} → "
                f"{city.get('n_districts')} | {prev.get('snapshot_date', 'new')} → "
                f"{city.get('snapshot_date')} |"
            )
        for code, prev in before.items():
            rows.append(
                f"| {code} | {prev.get('eur_per_m2_median')} → gone | "
                f"{prev.get('n_districts')} → gone | {prev.get('snapshot_date')} → gone |"
            )
        return rows
    moved = [
        (path, was, now)
        for path, (was, now) in _leaf_changes(
            strip_run_stamps(old or {}), strip_run_stamps(new)
        ).items()
    ]
    rows = ["| Field | was | now |", "|---|---|---|"]
    rows += [f"| `{path}` | {was} | {now} |" for path, was, now in moved[:40]]
    if len(moved) > 40:
        rows.append(f"| … and {len(moved) - 40} more | | |")
    return rows


def _leaf_changes(old: Any, new: Any, path: str = "") -> dict[str, tuple[Any, Any]]:
    if isinstance(old, dict) and isinstance(new, dict):
        out: dict[str, tuple[Any, Any]] = {}
        for key in list(old) + [k for k in new if k not in old]:
            out.update(_leaf_changes(old.get(key), new.get(key), f"{path}.{key}".lstrip(".")))
        return out
    if isinstance(old, list) and isinstance(new, list) and len(old) == len(new):
        out = {}
        for i, (a, b) in enumerate(zip(old, new, strict=True)):
            out.update(_leaf_changes(a, b, f"{path}[{i}]"))
        return out
    return {} if old == new else {path: (_short(old), _short(new))}


def _short(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    return text if len(text) <= 60 else text[:57] + "…"


def last_terms_reading(legal_md: str) -> str | None:
    """The date `docs/legal.md`'s licence table records for имот.bg's terms."""
    for line in legal_md.splitlines():
        if line.startswith("| **имот.bg**"):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            found = re.search(r"\d{4}-\d{2}-\d{2}", cells[-1])
            return found.group(0) if found else None
    return None


def arm_environment(env: dict[str, str], worktree: Path) -> dict[str, str]:
    """The child's environment: no proxy of any spelling, and `origin/main`'s code.

    Belt to `sources/imot.py`'s `trust_env=False`, which is the guarantee for
    the one host where it is a legal point; here it holds for every arm.
    """
    out = {key: value for key, value in env.items() if not key.upper().endswith("_PROXY")}
    out["PYTHONPATH"] = str(worktree / "pipeline" / "src")
    out.pop("PYTHONHOME", None)
    # On Windows a piped child writes its stdout in the ANSI code page, which has
    # no Cyrillic: UTF-8 mode makes what the arms print, and what is read back
    # from them below, one encoding on every platform.
    out["PYTHONUTF8"] = "1"
    return out


def covering_suites(worktree: Path, stem: str) -> tuple[list[str], list[str]]:
    """The offline test files that read this payload, by naming its file.

    Chosen by what the suites say rather than kept as a list, so a suite added
    for the payload joins the run without anybody editing this. The browser
    suites are left to CI's push run, which has a Chromium.
    """
    # Relative to the directory each runner starts in: `pipeline/` and `site/`.
    tests = sorted(
        f"tests/{path.name}"
        for path in (worktree / "pipeline" / "tests").glob("test_*.py")
        if stem in path.read_text("utf-8") and path.name != "test_live_upstreams.py"
    )
    scripts = sorted(
        f"scripts/{path.name}"
        for path in (worktree / "site" / "scripts").glob("verify_*.mjs")
        if not path.name.startswith("verify_render_") and stem in path.read_text("utf-8")
    )
    return tests, scripts


def _run(cmd: list[str], cwd: Path, env: dict[str, str]) -> int:
    return subprocess.run(cmd, cwd=cwd, env=env, check=False).returncode


def default_run_arm(worktree: Path, source: str, env: dict[str, str]) -> int:
    """`vyarno-pipeline refresh` as `origin/main` has it, into the worktree's data."""
    cmd = [sys.executable, "-m", "vyarno_pipeline.cli", "refresh", "--source", source]
    cmd += ["--out", str(worktree / "data" / "published")]
    return _run(cmd, worktree / "pipeline", env)


def default_run_suites(worktree: Path, stem: str, env: dict[str, str]) -> bool:
    tests, scripts = covering_suites(worktree, stem)
    print(f"→ offline suites over {stem}.json: {len(tests)} pytest file(s), {len(scripts)} node")
    if tests:
        cmd = [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *tests]
        if _run(cmd, worktree / "pipeline", env) != 0:
            return False
    if scripts:
        node = shutil.which("node")
        if node is None:
            print("ERROR: node is not on PATH, so the site suites cannot run. `make setup`.")
            return False
        # `dot`: a pass is one character, a failure still prints in full.
        if _run([node, "--test", "--test-reporter=dot", *scripts], worktree / "site", env) != 0:
            return False
    return True


def _git(repo: Path, *args: str, capture: bool = True) -> str:
    done = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=capture,
        text=True,
        encoding="utf-8",
    )
    return (done.stdout or "").strip()


def _git_ok(repo: Path, *args: str) -> bool:
    done = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=False)
    return done.returncode == 0


def branch_name(repo: Path, source: str, day: date) -> str:
    """`data/<source>-<date>`, with a suffix when that one is already taken."""
    base = f"data/{source}-{day.isoformat()}"
    for n in range(1, 50):
        name = base if n == 1 else f"{base}-{n}"
        local = _git_ok(repo, "rev-parse", "--verify", "--quiet", f"refs/heads/{name}")
        remote = _git(repo, "ls-remote", "--heads", "origin", name)
        if not local and not remote:
            return name
    raise RuntimeError(f"forty-nine branches named {base}-n already exist")


def web_url(remote: str) -> str | None:
    """The browser address of a GitHub remote, from either URL form."""
    match = re.search(r"github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$", remote)
    return f"https://github.com/{match[1]}/{match[2]}" if match else None


def _link_node_modules(repo: Path, worktree: Path) -> Path | None:
    """Give the worktree the checkout's `site/node_modules`, as a link it can drop.

    One suite imports `vite.config.js`, so the site suites need the packages
    `make setup` installed. A junction on Windows, where a symlink needs
    developer mode; `_unlink` removes the link and never what it points at.
    """
    target = repo / "site" / "node_modules"
    link = worktree / "site" / "node_modules"
    if not target.is_dir() or link.exists():
        return None
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError:
        if os.name != "nt":
            return None
        subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], check=False)
    return link if link.exists() else None


def _unlink(link: Path | None) -> bool:
    """Remove the link, and only the link, before anything deletes the worktree.

    `rmdir` on Windows removes a junction or a directory symlink and refuses a
    real directory with anything in it, so it cannot reach the target either way.
    """
    if link is None:
        return True
    try:
        if os.name == "nt":
            link.rmdir()
        else:
            link.unlink()
    except OSError:
        return False
    return not link.exists() and not link.is_symlink()


def _report(worktree: Path, source: str, base: str, env: dict[str, str]) -> dict[str, str]:
    """`refresh-report`'s verdict, exactly as `refresh.yml` asks for it."""
    scratch = Path(tempfile.mkdtemp(prefix="vyarno-report-"))
    cadence, output = scratch / "cadence.json", scratch / "output"
    node = shutil.which("node")
    script = worktree / "site" / "scripts" / "payload-cadence.mjs"
    known = False
    if node and script.exists():
        made = subprocess.run(
            [node, str(script)], capture_output=True, text=True, encoding="utf-8", check=False
        )
        known = made.returncode == 0
        cadence.write_text(made.stdout if known else "{}", "utf-8")
    else:
        cadence.write_text("{}", "utf-8")
    cmd = [sys.executable, "-m", "vyarno_pipeline.cli", "refresh-report", "--source", source]
    cmd += ["--published", str(worktree / "data" / "published"), "--cadence", str(cadence)]
    cmd += ["--against", base, "--repo", str(worktree), "--github-output", str(output)]
    done = subprocess.run(
        cmd, cwd=worktree, env=env, capture_output=True, text=True, encoding="utf-8", check=False
    )
    if done.returncode != 0:
        shutil.rmtree(scratch, ignore_errors=True)
        raise RuntimeError(f"refresh-report exited {done.returncode}: {done.stderr.strip()}")
    parsed: dict[str, str] = {}
    heredoc: str | None = None
    for line in output.read_text("utf-8").splitlines():
        if heredoc is not None:
            if line == "EOF":
                heredoc = None
            else:
                parsed[heredoc] = (parsed[heredoc] + "\n" + line).lstrip("\n")
        elif line.endswith("<<EOF"):
            heredoc = line[: -len("<<EOF")]
            parsed[heredoc] = ""
        elif "=" in line:
            key, value = line.split("=", 1)
            parsed[key] = value
    shutil.rmtree(scratch, ignore_errors=True)
    if not known:
        parsed.pop("stale_list", None)
    return parsed


def commit_message(
    source: str,
    as_of: str,
    base: str,
    files: list[str],
    checks: Checks,
    table: list[str],
    terms: str | None,
    stale: str = "",
) -> str:
    """Subject, then the body `data-pr.yml` turns into the pull request."""
    lines = [
        f"data refresh: {source} as of {as_of}",
        "",
        f"`vyarno-pipeline refresh --source {source}` at origin/main {base[:12]}, run from "
        f"this machine's own connection with no proxy. Wrote {', '.join(files)}.",
        "",
    ]
    if checks.soft:
        lines += ["Soft flags, for a person to look at before merging:", ""]
        lines += [f"- {flag}" for flag in checks.soft] + [""]
    else:
        lines += ["Soft flags: none.", ""]
    lines += [*table, ""]
    if stale:
        lines += [f"Other payloads past their own cadence: {stale}", ""]
    if source == "city-price":
        lines += [
            f"имот.bg terms: last recorded reading {terms or 'not found'} (docs/legal.md). "
            f"Re-read {IMOT_TERMS_URL} and date the reading there.",
            "",
        ]
    lines.append(f"{FLAGS_TRAILER}: {len(checks.soft)}")
    return "\n".join(lines) + "\n"


def refresh_local(
    repo: Path,
    source: str,
    *,
    today: date | None = None,
    run_arm: Callable[[Path, str, dict[str, str]], int] = default_run_arm,
    run_suites: Callable[[Path, str, dict[str, str]], bool] = default_run_suites,
) -> int:
    """Run one arm from `origin/main` in a scratch worktree, and push what it wrote."""
    day = today or clock.today()
    name = _git(repo, "config", "user.name") if _git_ok(repo, "config", "user.name") else ""
    email = _git(repo, "config", "user.email") if _git_ok(repo, "config", "user.email") else ""
    if not name or not email:
        print("ERROR: set your own git identity first: git config user.name / user.email")
        return 1
    print("→ fetching origin/main (your checkout, branch and uncommitted work are not touched)")
    _git(repo, "fetch", "--quiet", "origin", "main")
    base = _git(repo, "rev-parse", "origin/main")
    _git(repo, "worktree", "prune")
    worktree = Path(tempfile.mkdtemp(prefix=f"vyarno-{source}-"))
    link = None
    try:
        _git(repo, "worktree", "add", "--quiet", "--detach", str(worktree), base)
        if source == "city-price":
            legal = worktree / "docs" / "legal.md"
            terms = last_terms_reading(legal.read_text("utf-8")) if legal.exists() else None
            print(f"→ имот.bg terms: {IMOT_TERMS_URL} (last recorded reading: {terms or 'none'})")
        else:
            terms = None
        env = arm_environment(dict(os.environ), worktree)
        print(f"→ running --source {source} at origin/main {base[:12]}, with no proxy")
        code = run_arm(worktree, source, env)
        if code != 0:
            print(f"STOPPED: the arm exited {code}; nothing was committed.")
            return code

        published = worktree / "data" / "published"
        files = sorted(p.name for p in published.glob("*.json") if owns(source, p.stem))
        new = {f: json.loads((published / f).read_text("utf-8")) for f in files}
        old = {f: _committed(worktree, base, f"data/published/{f}") for f in files}
        checks = Checks()
        if source == "city-price":
            checks = city_price_checks(new["city_price.json"], old["city_price.json"])
        for flag in checks.soft:
            print(f"  soft flag: {flag}")
        if checks.hard:
            for failure in checks.hard:
                print(f"STOPPED: {failure}")
            print("Nothing was committed or pushed.")
            return 3

        try:
            verdict = _report(worktree, source, base, env)
        except RuntimeError as exc:
            print(f"STOPPED: {exc}")
            return 1
        if verdict.get("real_change") != "yes":
            print(f"Nothing new: {source} on origin/main already carries these figures.")
            return 0
        link = _link_node_modules(repo, worktree)
        if not run_suites(worktree, source.replace("-", "_"), env):
            print("STOPPED: an offline suite failed over the new payload; nothing was pushed.")
            return 1

        branch = branch_name(repo, source, day)
        table = [row for f in files for row in diff_table(source, new[f], old[f])]
        as_of = verdict.get("as_of", day.isoformat())
        stale = verdict.get("stale_list", "")
        message = commit_message(source, as_of, base, files, checks, table, terms, stale)
        _git(worktree, "switch", "--quiet", "-c", branch)
        _git(worktree, "add", "--", *(f"data/published/{f}" for f in files))
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".txt", delete=False) as fh:
            fh.write(message)
        try:
            _git(worktree, "commit", "--quiet", "--signoff", "-F", fh.name, capture=False)
        finally:
            Path(fh.name).unlink()
        if subprocess.run(["git", "-C", str(worktree), "push", "-u", "origin", branch]).returncode:
            print(f"STOPPED: the push of {branch} was refused; the commit is on your local branch.")
            return 4
        url = web_url(_git(repo, "remote", "get-url", "origin"))
        where = f" at {url}/pulls" if url else ""
        fate = (
            f"labelled needs-review for the {len(checks.soft)} soft flag(s) above, so it "
            f"waits for you"
            if checks.soft
            else "it merges itself once CI is green; label it hold to stop that"
        )
        print(f"Pushed {branch}. GitHub opens its pull request{where}: {fate}.")
        return 0
    finally:
        if _unlink(link):
            _git_ok(repo, "worktree", "remove", "--force", str(worktree))
            shutil.rmtree(worktree, ignore_errors=True)
        else:
            print(f"NOTE: left {worktree} in place; remove its site/node_modules link by hand.")
        _git_ok(repo, "worktree", "prune")


def _committed(worktree: Path, ref: str, path: str) -> dict[str, Any] | None:
    try:
        return json.loads(_git(worktree, "show", f"{ref}:{path}"))
    except subprocess.CalledProcessError:
        return None


def utf8_stdio() -> None:
    """Print UTF-8 wherever Python picked a legacy code page for a pipe.

    `make refresh-local` under Git Bash hands this process a pipe, and Windows
    then encodes it in cp1252, which has neither «→» nor Cyrillic: the first
    progress line would raise rather than print.
    """
    for stream in (sys.stdout, sys.stderr):
        encoding = (getattr(stream, "encoding", None) or "").lower().replace("-", "")
        if encoding != "utf8" and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(prog="python -m vyarno_pipeline.local_refresh")
    parser.add_argument("--source", choices=LOCAL_SOURCES, default="city-price")
    parser.add_argument("--repo", type=Path, default=None, help="checkout to run from")
    args = parser.parse_args(argv)
    start = args.repo or Path.cwd()
    try:
        repo = Path(_git(start, "rev-parse", "--show-toplevel"))
    except subprocess.CalledProcessError:
        print(f"ERROR: {start} is not inside a clone of the repository.")
        return 1
    return refresh_local(repo, args.source)


if __name__ == "__main__":
    sys.exit(main())
