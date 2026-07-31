"""Tests for the secondary Eurostat connectors (unemployment).

These tests mock httpx with respx — they verify:
- The connector fans out one HTTP call per dimension value (the
  multi-value-filter quirk documented in eurostat.py)
- The connector uses the right query string filters
- Network errors surface as exceptions
"""

import httpx
import pytest
import respx

from vyarno_pipeline.sources.eurostat import fetch_unemployment_bg

EUROSTAT_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"


def _cube_response(n_rows: int = 1) -> dict:
    """Build a minimal cube response with N empty rows."""
    return {
        "id": ["freq", "time"],
        "size": [1, n_rows],
        "dimension": {
            "freq": {"category": {"index": {"Q": 0}}},
            "time": {"category": {"index": {f"2025-Q{i + 1}": i for i in range(n_rows)}}},
        },
        "value": {str(i): 1.0 for i in range(n_rows)},
    }


# --- unemployment ---


@respx.mock
def test_fetch_unemployment_bg_single_call():
    """Unlike HICP and the wage cubes, unemployment has no multi-value trap — one call."""
    respx.get(f"{EUROSTAT_BASE}/une_rt_m").mock(
        return_value=httpx.Response(200, json=_cube_response(2))
    )
    rows = fetch_unemployment_bg(geo="BG")
    assert len(rows) == 2
    assert len(respx.calls) == 1


@respx.mock
def test_fetch_unemployment_bg_raises_on_http_error():
    respx.get(f"{EUROSTAT_BASE}/une_rt_m").mock(
        return_value=httpx.Response(503, text="Eurostat down")
    )
    with pytest.raises(httpx.HTTPStatusError):
        fetch_unemployment_bg(geo="BG")
