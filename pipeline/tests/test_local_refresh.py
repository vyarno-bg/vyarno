"""The one-command local refresh, against throwaway git repositories.

Every git operation here is real: a bare `origin`, a clone that published
`main`, and the person's own clone with a commit `origin` has never seen and
uncommitted work in three states. Only the arm is replaced, by a function that
writes what имот.bg would have served, because the arm is what needs a
residential connection and what the rest of this file is about is everything
around it.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

from vyarno_pipeline import local_refresh as lr

REPO = Path(__file__).resolve().parents[2]
DAY = date(2026, 11, 21)
LEGAL_ROW = (
    "| **имот.bg** | No term either way | No term | No term | **2026-07-26 — NOT re-read** |\n"
)


def city(
    code: str,
    *,
    price: float = 1000.0,
    n: int = 20,
    snap: str | None = "12.11.2026",
    baseline: int = 2010,
    dropped: int = 0,
) -> dict:
    return {
        "code": code,
        "eur_per_m2_median": price,
        "n_districts": n,
        "n_dropped": dropped,
        "snapshot_date": snap,
        "baseline_year": baseline,
    }


def payload(*cities: dict, as_of: str = "2026-11-15", pages: list[str] | None = None) -> dict:
    return {
        "as_of": as_of,
        "source": "imot.bg",
        "city_pages": pages if pages is not None else [c["code"] for c in cities],
        "cities": list(cities),
    }


COMMITTED = payload(city("vidin", price=966.0, n=18), city("gabrovo", price=982.0, n=17))


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(cwd), *args], check=True, capture_output=True, text=True, encoding="utf-8"
    ).stdout.strip()


def write(path: Path, body: str | dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(body, ensure_ascii=False, indent=2) if isinstance(body, dict) else body
    path.write_text(text, "utf-8")


@pytest.fixture
def repos(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    """`origin`, and a person's clone that is a commit ahead and dirty three ways."""
    config = tmp_path / "gitconfig"
    config.write_text("[init]\n\tdefaultBranch = main\n", "utf-8")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(config))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    # A cloud session sets these as CONTRIBUTING.md advises, and git lets them
    # outrank the identities each repository below configures for itself.
    for var in ("NAME", "EMAIL"):
        monkeypatch.delenv(f"GIT_AUTHOR_{var}", raising=False)
        monkeypatch.delenv(f"GIT_COMMITTER_{var}", raising=False)

    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], check=True)
    seed = tmp_path / "seed"
    subprocess.run(["git", "init", "-q", "-b", "main", str(seed)], check=True)
    git(seed, "config", "user.name", "Seed")
    git(seed, "config", "user.email", "seed@example.org")
    write(seed / "data" / "published" / "city_price.json", COMMITTED)
    write(seed / "data" / "published" / "hicp_headline.json", {"as_of": "2026-11-18", "x": 1})
    write(seed / "docs" / "legal.md", "| Source | … |\n|---|---|\n" + LEGAL_ROW)
    git(seed, "add", ".")
    git(seed, "commit", "-q", "-m", "seed")
    git(seed, "remote", "add", "origin", str(origin))
    git(seed, "push", "-q", "origin", "main")

    person = tmp_path / "person"
    subprocess.run(["git", "clone", "-q", str(origin), str(person)], check=True)
    git(person, "config", "user.name", "Kiril Test")
    git(person, "config", "user.email", "kiril@example.org")
    # A local commit origin has never seen, changing the very payload the arm
    # writes: a run that read the checkout would compare against this.
    write(person / "data" / "published" / "city_price.json", payload(city("vidin", price=1.0)))
    git(person, "commit", "-qam", "local work in progress")
    write(person / "docs" / "legal.md", "edited, not staged\n")
    write(person / "notes.txt", "staged\n")
    git(person, "add", "notes.txt")
    write(person / "scratch.txt", "untracked\n")
    write(person / "site" / "node_modules" / "keep.txt", "installed by make setup\n")
    return {"origin": origin, "person": person}


def snapshot(person: Path) -> tuple[str, str, str, str]:
    return (
        git(person, "rev-parse", "HEAD"),
        git(person, "symbolic-ref", "HEAD"),
        git(person, "status", "--porcelain=v1", "--untracked-files=all"),
        (person / "docs" / "legal.md").read_text("utf-8"),
    )


def arm_writing(fresh: dict, seen: dict | None = None):
    """A stand-in for the arm: records what it was run on, then writes `fresh`."""

    def run(worktree: Path, source: str, env: dict) -> int:
        if seen is not None:
            seen["head"] = git(worktree, "rev-parse", "HEAD")
            seen["payload"] = json.loads(
                (worktree / "data" / "published" / "city_price.json").read_text("utf-8")
            )
            seen["env"] = env
            seen["node_modules"] = (worktree / "site" / "node_modules").exists()
        write(worktree / "data" / "published" / "city_price.json", fresh)
        return 0

    return run


def suites_pass(worktree: Path, stem: str, env: dict) -> bool:
    return True


def remote_branches(origin: Path) -> list[str]:
    return git(origin, "for-each-ref", "--format=%(refname:short)", "refs/heads").split()


# --- the run, end to end ---------------------------------------------------


def test_a_republished_payload_is_committed_on_origin_main_and_pushed(repos, capsys):
    person, origin = repos["person"], repos["origin"]
    before = snapshot(person)
    seen: dict = {}
    fresh = payload(
        city("vidin", price=1003.5, n=18, snap="19.11.2026"),
        city("gabrovo", price=982.0, n=15, snap="19.11.2026"),
        as_of=DAY.isoformat(),
    )

    code = lr.refresh_local(
        person, "city-price", today=DAY, run_arm=arm_writing(fresh, seen), run_suites=suites_pass
    )
    out = capsys.readouterr().out

    assert code == 0, out
    main = git(origin, "rev-parse", "main")
    # origin/main's code and data, not the checkout's commit or its edits.
    assert seen["head"] == main
    assert seen["payload"] == COMMITTED
    branch = f"data/city-price-{DAY.isoformat()}"
    assert branch in remote_branches(origin)
    assert git(origin, "rev-parse", f"{branch}^") == main
    assert (
        git(origin, "log", "-1", "--format=%an <%ae>", branch) == "Kiril Test <kiril@example.org>"
    )
    assert git(origin, "diff", "--name-only", "main", branch) == "data/published/city_price.json"

    message = git(origin, "log", "-1", "--format=%B", branch)
    assert message.startswith(f"data refresh: city-price as of {DAY.isoformat()}\n")
    assert "- gabrovo: district count 17 -> 15 (down 11.8%)" in message
    assert "| vidin | 966.0 → 1003.5 | 18 → 18 | 12.11.2026 → 19.11.2026 |" in message
    assert "last recorded reading 2026-07-26" in message and lr.IMOT_TERMS_URL in message
    assert (
        git(origin, "log", "-1", f"--format=%(trailers:key={lr.FLAGS_TRAILER},valueonly)", branch)
        == "1"
    )
    assert "Signed-off-by: Kiril Test <kiril@example.org>" in message

    # Nothing of the person's moved, and the scratch worktree is gone.
    assert snapshot(person) == before
    assert git(person, "worktree", "list", "--porcelain").count("worktree ") == 1
    assert (person / "site" / "node_modules" / "keep.txt").exists()
    assert seen["node_modules"] is False, "linked only after the arm, for the suites"
    assert out.strip().splitlines()[-1].startswith(f"Pushed {branch}.")
    assert "needs-review" in out.strip().splitlines()[-1]


def test_the_same_figures_on_a_later_day_push_nothing(repos, capsys):
    stale_read = dict(COMMITTED, as_of=DAY.isoformat())
    code = lr.refresh_local(
        repos["person"],
        "city-price",
        today=DAY,
        run_arm=arm_writing(stale_read),
        run_suites=suites_pass,
    )
    assert code == 0
    assert "Nothing new" in capsys.readouterr().out
    assert remote_branches(repos["origin"]) == ["main"]


def test_a_hard_failure_commits_and_pushes_nothing(repos, capsys):
    undated = payload(city("vidin", snap=None), city("gabrovo", snap=None), as_of=DAY.isoformat())
    before = snapshot(repos["person"])
    code = lr.refresh_local(
        repos["person"],
        "city-price",
        today=DAY,
        run_arm=arm_writing(undated),
        run_suites=suites_pass,
    )
    assert code == 3
    assert "snapshot_date" in capsys.readouterr().out
    assert remote_branches(repos["origin"]) == ["main"]
    assert "data/city-price" not in git(repos["person"], "branch", "--list")
    assert snapshot(repos["person"]) == before


def test_a_failing_suite_pushes_nothing(repos):
    fresh = payload(city("vidin", price=1100.0, n=18), city("gabrovo", n=17), as_of=DAY.isoformat())
    code = lr.refresh_local(
        repos["person"],
        "city-price",
        today=DAY,
        run_arm=arm_writing(fresh),
        run_suites=lambda *_: False,
    )
    assert code == 1
    assert remote_branches(repos["origin"]) == ["main"]


def test_a_failing_arm_passes_its_exit_code_through(repos):
    code = lr.refresh_local(
        repos["person"], "city-price", today=DAY, run_arm=lambda *_: 4, run_suites=suites_pass
    )
    assert code == 4
    assert remote_branches(repos["origin"]) == ["main"]


def test_a_branch_name_already_on_origin_gets_a_suffix(repos):
    taken = f"data/city-price-{DAY.isoformat()}"
    git(repos["origin"], "branch", taken, "main")
    fresh = payload(city("vidin", price=1100.0, n=18), city("gabrovo", n=17), as_of=DAY.isoformat())
    assert (
        lr.refresh_local(
            repos["person"],
            "city-price",
            today=DAY,
            run_arm=arm_writing(fresh),
            run_suites=suites_pass,
        )
        == 0
    )
    assert f"{taken}-2" in remote_branches(repos["origin"])
    assert git(repos["origin"], "rev-parse", taken) == git(repos["origin"], "rev-parse", "main")


def test_no_git_identity_is_refused_before_anything_runs(repos):
    git(repos["person"], "config", "--unset", "user.email")
    ran: list[bool] = []
    code = lr.refresh_local(
        repos["person"],
        "city-price",
        today=DAY,
        run_arm=lambda *_: ran.append(True) or 0,
        run_suites=suites_pass,
    )
    assert code == 1 and ran == []


# --- the checks ------------------------------------------------------------


@pytest.mark.parametrize(
    ("fresh", "hard", "soft"),
    [
        (payload(city("vidin", n=18), city("gabrovo", n=17)), [], []),
        (payload(city("vidin", n=18), pages=["vidin", "gabrovo"]), ["read 1 of 2"], []),
        (payload(city("vidin", n=18)), [], ["gabrovo: imot.bg no longer serve"]),
        (payload(city("vidin", n=18), city("gabrovo", n=15)), [], ["17 -> 15 (down 11.8%)"]),
        (payload(city("vidin", n=18), city("gabrovo", n=16)), [], []),
        (payload(city("vidin", n=18, dropped=2), city("gabrovo", n=17)), [], ["vidin: 2 current"]),
        (
            payload(city("vidin", n=18, snap=None), city("gabrovo", n=17)),
            [],
            ["vidin: snapshot_date"],
        ),
        (payload(city("vidin", snap=None), city("gabrovo", snap=None)), ["no city carries"], []),
        (payload(city("vidin", n=18, snap="1.11.2026"), city("gabrovo", n=17)), [], ["went back"]),
        (payload(city("vidin", n=18, baseline=2011), city("gabrovo", n=17)), [], []),
        (payload(city("vidin", n=18, baseline=2013), city("gabrovo", n=17)), [], ["2010 -> 2013"]),
        (payload(city("vidin", n=18, baseline=2020), city("gabrovo", n=17)), ["archive"], []),
        (payload(city("vidin", n=18), city("gabrovo", n=17), city("ruse")), [], ["ruse: new city"]),
    ],
)
def test_each_check_lands_on_its_side(fresh, hard, soft):
    found = lr.city_price_checks(fresh, COMMITTED)
    assert len(found.hard) == len(hard) and len(found.soft) == len(soft), found
    for want, got in zip(hard + soft, found.hard + found.soft, strict=True):
        assert want in got


def test_the_arm_sees_no_proxy_of_any_spelling_and_origin_mains_code(tmp_path):
    env = {"HTTPS_PROXY": "x", "http_proxy": "x", "ALL_PROXY": "x", "PATH": "/bin", "HOME": "/h"}
    out = lr.arm_environment(env, tmp_path)
    assert not [key for key in out if "proxy" in key.lower()]
    assert out["PYTHONPATH"] == str(tmp_path / "pipeline" / "src")
    assert out["PATH"] == "/bin"


def test_the_terms_reading_is_the_one_legal_md_records():
    legal = (REPO / "docs" / "legal.md").read_text("utf-8")
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", lr.last_terms_reading(legal) or "")
    shipped = (REPO / "site" / "src" / "lib" / "legal.js").read_text("utf-8")
    block = shipped[shipped.index('id: "imot"') :]
    assert re.search(r'termsUrl:\s*"([^"]+)"', block)[1] == lr.IMOT_TERMS_URL


def test_the_suites_that_read_the_payload_are_the_ones_run():
    tests, scripts = lr.covering_suites(REPO, "city_price")
    assert {"tests/test_imot.py", "tests/test_published_contracts.py"} <= set(tests)
    assert "tests/test_live_upstreams.py" not in tests
    assert "scripts/verify_view_market.mjs" in scripts
    assert not [name for name in scripts if name.startswith("scripts/verify_render_")]
    # Paths each runner can open from where it starts, not bare names.
    assert all((REPO / "pipeline" / t).is_file() for t in tests)
    assert all((REPO / "site" / s).is_file() for s in scripts)
    tests, _ = lr.covering_suites(REPO, "payroll")
    assert "tests/test_payroll.py" in tests


def test_a_red_suite_is_reported_red(tmp_path):
    tests = tmp_path / "pipeline" / "tests"
    write(tests / "test_reads_it.py", "def test_city_price():\n    assert False\n")
    (tmp_path / "site" / "scripts").mkdir(parents=True)
    # The real environment: Windows cannot start a child's sockets without
    # SYSTEMROOT, so a PATH-only one fails both runs for a reason of its own.
    env = lr.arm_environment(dict(os.environ), tmp_path)
    assert lr.default_run_suites(tmp_path, "city_price", env) is False
    write(tests / "test_reads_it.py", "def test_city_price():\n    assert True\n")
    assert lr.default_run_suites(tmp_path, "city_price", env) is True


def test_progress_prints_through_a_legacy_code_page():
    # What Git Bash on Windows gives `make refresh-local`: a cp1252 pipe.
    code = "from vyarno_pipeline import local_refresh as lr; lr.utf8_stdio(); print('→ имот.bg')"
    env = {**os.environ, "PYTHONIOENCODING": "cp1252", "PYTHONPATH": str(REPO / "pipeline" / "src")}
    env.pop("PYTHONUTF8", None)
    done = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, check=False)
    assert done.returncode == 0, done.stderr.decode("utf-8", "replace")
    assert done.stdout.decode("utf-8").strip() == "→ имот.bg"


def test_a_payroll_diff_names_the_fields_that_moved():
    rows = lr.diff_table(
        "payroll",
        {"as_of": "2027-01-01", "max_insurable_income_eur": 2400.0, "rates": {"pension": 0.0658}},
        {"as_of": "2026-08-15", "max_insurable_income_eur": 2300.0, "rates": {"pension": 0.0658}},
    )
    assert rows[2:] == ["| `max_insurable_income_eur` | 2300.0 | 2400.0 |"]


def test_the_pull_request_workflow_reads_what_the_command_writes(repos):
    # data-pr.yml labels from the trailer and fires on the branch prefix. A
    # rename on either side leaves every refresh labelled, or none opened.
    workflow = (REPO / ".github" / "workflows" / "data-pr.yml").read_text("utf-8")
    assert f"^{lr.FLAGS_TRAILER}:" in workflow
    pattern = re.search(r'branches:\s*\n\s*-\s*"([^"]+)"', workflow)[1]
    assert pattern == "data/**"
    assert lr.branch_name(repos["person"], "payroll", DAY).startswith(pattern[: -len("**")])
    assert re.search(r"^permissions: \{\}$", workflow, re.M), "the default token gets nothing"
    # The label it applies has to be one the merge script holds on, or a
    # flagged refresh merges itself on green.
    from vyarno_pipeline.automerge import HOLD_LABELS

    applied = set(re.findall(r"labels: \['([^']+)'\]", workflow))
    assert applied and applied <= HOLD_LABELS
    assert "python3 -m vyarno_pipeline.automerge --pr" in workflow


@pytest.mark.parametrize(
    "remote",
    ["https://github.com/vyarno-bg/vyarno.git", "git@github.com:vyarno-bg/vyarno.git"],
)
def test_the_pull_request_address_comes_from_either_remote_form(remote):
    assert lr.web_url(remote) == "https://github.com/vyarno-bg/vyarno"
