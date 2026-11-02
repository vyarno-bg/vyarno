"""Two mechanical guards for the failures of 2026-10-29.

**The payroll arm's exit code.** The 2026-10-29 payroll run died on
`httpx.ConnectError` and exited 1, because `_refresh_payroll` was the only
one of the eleven arms without the `httpx.HTTPError` → exit 4 handler. Exit 1
reads as "the code is broken"; exit 4 reads as "the upstream was
unreachable", and the operator's next move differs — one waits for the
schedule, the other opens the code.

**The ДВ fetch's retry.** The 2026-10-29 refusal is the kind of failure a
single attempt turns into a dead run and a second attempt turns into the
30 ms fetch it normally is. The retry has to be there, and it has to be the
*right* retry: a refused connection is worth another attempt, a wrong
`idMat` is not — that is a changed upstream, and it has to stay loud.

Parsing the workflow with stdlib rather than `pyyaml` keeps these tests off a
new dev dependency, in the same way the rest of this file does.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import httpx
import pytest

from vyarno_pipeline.sources import dv

ROOT = Path(__file__).resolve().parents[2]


def test_every_arm_that_fetches_an_upstream_maps_a_network_failure_to_exit_4() -> None:
    """A network failure must exit 4 in every arm, not just ten of eleven.

    The payroll run of 2026-10-29 died on `httpx.ConnectError` and exited 1
    with a raw traceback, because `_refresh_payroll` was the only arm
    without the handler. The other ten arms catch `httpx.HTTPError` and exit
    4, which is the code `refresh.yml` documents as "network/HTTP" — the
    distinction an operator reads to decide between waiting for the schedule
    and opening the code.

    This asserts the handler is present in the arm's own source, so an arm
    added later without one fails here rather than in a production run.
    """
    cli = (ROOT / "pipeline" / "src" / "vyarno_pipeline" / "cli.py").read_text("utf-8")

    arms = re.findall(r"^def (_refresh_\w+)\(", cli, flags=re.M)
    assert len(arms) >= 11, f"expected the arms to be findable, found {arms}"

    missing = []
    for arm in arms:
        m = re.search(rf"^def {arm}\(.*?(?=^def |\Z)", cli, flags=re.M | re.S)
        assert m is not None, f"could not read the body of {arm}"
        body = m.group(0)
        if "httpx.HTTPError" not in body or "sys.exit(4)" not in body:
            missing.append(arm)

    assert not missing, (
        f"these arms do not map a network failure to exit 4: {missing}. Every "
        "arm that fetches an upstream must catch `httpx.HTTPError` and exit 4 "
        "— the code `refresh.yml` documents as network/HTTP. The payroll arm "
        "died with exit 1 and a raw traceback on 2026-10-29 for exactly this "
        "reason."
    )


class _FakeResponse:
    """The smallest thing `httpx.Client.get` has to hand back.

    `_get_page` calls `raise_for_status()` and reads `.text`, and nothing
    else, so a stub with those two members is the whole contract.
    """

    def __init__(self, text: str = "ok", status_code: int = 200) -> None:
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}",
                request=httpx.Request("GET", "https://dv.parliament.bg/x"),
                response=httpx.Response(self.status_code),
            )


def _fake_transport(monkeypatch: pytest.MonkeyPatch, outcomes: list) -> list:
    """Make every `httpx.Client.get` pop the next outcome; return the calls."""
    calls: list[str] = []

    def fake_get(self, url, *args, **kwargs):
        calls.append(url)
        outcome = outcomes[min(len(calls) - 1, len(outcomes) - 1)]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    return calls


def test_a_refused_connection_is_retried_and_the_second_attempt_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The 2026-10-29 failure, exactly: refused once, then served.

    `httpx.ConnectError` is what the runner got. One attempt and the arm
    dies; one retry and it fetches the page it was always going to fetch.
    """
    monkeypatch.setattr(dv, "RETRY_WAIT", 0.0)
    calls = _fake_transport(
        monkeypatch,
        [httpx.ConnectError("Connection refused"), _FakeResponse("<html>ТЗПБ</html>")],
    )

    page = dv._get_page("https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=1")

    assert page == "<html>ТЗПБ</html>", page
    assert len(calls) == 2, f"the fetch was attempted {len(calls)} times, expected 2"


def test_a_dead_material_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    """A 404 is a wrong `idMat` — a changed upstream, not a flake.

    Retrying it would hide the change behind a second identical failure and
    cost a minute of wall clock to say the same thing twice. It must come
    back on the first attempt, loudly.
    """
    monkeypatch.setattr(dv, "RETRY_WAIT", 0.0)
    calls = _fake_transport(monkeypatch, [_FakeResponse("", status_code=404)])

    with pytest.raises(httpx.HTTPStatusError):
        dv._get_page("https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=1")

    assert len(calls) == 1, f"a 404 was attempted {len(calls)} times, expected 1"


def test_a_failing_upstream_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    """A 5xx is ДВ failing, which is worth one more attempt.

    The opposite of the 404 above: a server-side error is the one status
    where the same request can plausibly succeed a moment later.
    """
    monkeypatch.setattr(dv, "RETRY_WAIT", 0.0)
    calls = _fake_transport(
        monkeypatch,
        [_FakeResponse("", status_code=503), _FakeResponse("<html>ok</html>")],
    )

    page = dv._get_page("https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=1")

    assert page == "<html>ok</html>", page
    assert len(calls) == 2, f"the fetch was attempted {len(calls)} times, expected 2"


def test_a_persistently_refused_connection_gives_up_after_the_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The retry is bounded. A permanent refusal must not become a loop.

    Two attempts is the whole budget: enough to ride out a dropped
    connection, not enough to turn a blocked host into a hang. The error
    that comes out has to be the transport error, so the arm's own
    `httpx.HTTPError` handler still sees it and still exits 4.
    """
    monkeypatch.setattr(dv, "RETRY_WAIT", 0.0)
    calls = _fake_transport(monkeypatch, [httpx.ConnectError("Connection refused")])

    with pytest.raises(httpx.ConnectError):
        dv._get_page("https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=1")

    assert len(calls) == dv.RETRIES, (
        f"the fetch was attempted {len(calls)} times, expected dv.RETRIES ({dv.RETRIES})"
    )


def test_the_payroll_arm_exits_4_on_a_refused_connection(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The exit code has to be 4, and it has to actually happen.

    The arm died on 2026-10-29 with a raw `httpx.ConnectError` traceback and
    exit 1, because it was the only one of the eleven arms without the
    handler. Exit 1 reads as "the code is broken"; exit 4 reads as "the
    upstream was unreachable", and the operator's next move differs — one
    waits for the schedule, the other opens the code.

    This drives the arm rather than reading its source, so a handler that is
    present but unreachable — a `try` that does not wrap the call, an exit
    code that is swallowed further up — fails here rather than in a run.
    """
    from vyarno_pipeline import cli

    monkeypatch.setattr(
        cli,
        "fetch_tzpb_appendix",
        lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("Connection refused")),
    )

    with pytest.raises(SystemExit) as exc:
        cli._refresh_payroll(tmp_path / "payroll.json", date(2026, 10, 29))

    assert exc.value.code == 4, (
        f"a refused connection exited {exc.value.code}, expected 4 — 4 is the "
        "code `refresh.yml` documents as network/HTTP, and the one that tells "
        "the operator to wait for the schedule instead of opening the code."
    )


def test_the_payroll_arm_exits_2_on_a_document_that_is_not_the_cited_act(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A wrong document is a changed upstream, not an unreachable one.

    It must not be dressed up as a network failure: exit 2 says "the
    upstream changed, look at what it published", which is a different
    investigation from "the upstream is down".
    """
    from vyarno_pipeline import cli

    monkeypatch.setattr(
        cli,
        "fetch_tzpb_appendix",
        lambda *a, **k: (_ for _ in ()).throw(ValueError("issue 9 of 2026-08-15")),
    )

    with pytest.raises(SystemExit) as exc:
        cli._refresh_payroll(tmp_path / "payroll.json", date(2026, 10, 29))

    assert exc.value.code == 2, (
        f"a wrong document exited {exc.value.code}, expected 2 — a changed "
        "upstream is not a network failure and must not exit 4."
    )
