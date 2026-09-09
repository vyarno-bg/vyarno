"""pytest configuration for the pipeline test suite."""

import pytest


# The retry loop sleeps between attempts in production. An offline suite that
# patches permanent transport failures has nothing to gain from waiting — the
# failure is deterministic and the sleep adds only wall-clock time.  Setting the
# module-level constant here once covers every test in the suite without
# requiring per-test monkeypatches.
@pytest.fixture(autouse=True)
def _ecb_no_retry_wait(monkeypatch):
    monkeypatch.setattr("vyarno_pipeline.sources.ecb.RETRY_WAIT", 0.0)
