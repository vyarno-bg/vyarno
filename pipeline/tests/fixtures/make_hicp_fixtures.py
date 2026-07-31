"""Regenerate the committed HICP cube fixtures from live Eurostat.

Run from the repo root when Eurostat reshapes a cube or Bulgaria's group set
changes:

    python pipeline/tests/fixtures/make_hicp_fixtures.py

It writes four files next to this script, each a REAL Eurostat ND-cube
response trimmed to the codes and periods the tests need — same `id` / `size`
/ `dimension` / `value` layout the connector parses in production, so a test
that passes against them is testing the real parser, not a hand-written stub.

    eurostat_hicp_iw_bg.json     ECOICOP ver.2 item weights (prc_hicp_iw)
    eurostat_hicp_rch_bg.json    ver.2 annual rates      (prc_hicp_minr RCH_A)
    eurostat_hicp_i15_bg.json    ver.2 monthly index     (prc_hicp_minr I15)
    eurostat_hicp_inw_v1_bg.json ARCHIVED ver.1 weights  (prc_hicp_inw)

The last one is deliberate: it is the input that produced the July-2026
cross-version bug, kept so the regression test can prove the
classification-agreement gate rejects it.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
HERE = Path(__file__).parent

# Periods the tests need: every December from 2020 (the rebase base) through
# 2025 (the chain link month), plus the two most recent published months.
INDEX_PERIODS = [f"{y}-12" for y in range(2020, 2026)] + ["2026-05", "2026-06"]
RATE_PERIODS = ["2026-05", "2026-06"]


def _trim(payload: dict, dim: str, keep_codes: set[str], keep_times: list[str]) -> dict:
    """Rebuild an ND-cube keeping only `keep_codes` × `keep_times`."""
    dims: list[str] = payload["id"]
    sizes: list[int] = payload["size"]
    cats = [payload["dimension"][d]["category"] for d in dims]
    inv = [{v: k for k, v in c["index"].items()} for c in cats]

    decoded: list[tuple[dict[str, str], float]] = []
    for linear_str, val in payload["value"].items():
        rem = int(linear_str)
        idxs: list[int] = []
        for s in reversed(sizes):
            idxs.insert(0, rem % s)
            rem //= s
        decoded.append(({dims[i]: inv[i][idxs[i]] for i in range(len(dims))}, val))

    times = [t for t in keep_times if t in payload["dimension"]["time"]["category"]["index"]]
    kept = [(row, val) for row, val in decoded if row[dim] in keep_codes and row["time"] in times]
    codes = sorted({row[dim] for row, _ in kept}, key=lambda c: (c != "TOTAL", c))

    new_cats: dict[str, dict] = {}
    new_sizes: list[int] = []
    for d, cat in zip(dims, cats):
        if d == dim:
            members = codes
        elif d == "time":
            members = times
        else:
            members = list(cat["index"].keys())
        new_cats[d] = {
            "label": cat.get("label", {}).get(d, d),
            "category": {
                "index": {m: i for i, m in enumerate(members)},
                "label": {m: cat.get("label", {}).get(m, m) for m in members},
            },
        }
        new_sizes.append(len(members))

    strides: list[int] = []
    acc = 1
    for s in reversed(new_sizes):
        strides.insert(0, acc)
        acc *= s
    values: dict[str, float] = {}
    for row, val in kept:
        linear = sum(
            new_cats[d]["category"]["index"][row[d]] * strides[i] for i, d in enumerate(dims)
        )
        values[str(linear)] = val

    return {
        "version": payload.get("version", "2.0"),
        "class": "dataset",
        "label": payload["label"],
        "source": payload.get("source", "ESTAT"),
        "updated": payload.get("updated", ""),
        "value": values,
        "id": dims,
        "size": new_sizes,
        "dimension": new_cats,
    }


def main() -> None:
    with httpx.Client(timeout=180.0, follow_redirects=True) as client:

        def get(dataset: str, **params: object) -> dict:
            r = client.get(
                f"{BASE}/{dataset}", params={"format": "JSON", "lang": "EN", "geo": "BG", **params}
            )
            r.raise_for_status()
            return r.json()

        iw = get("prc_hicp_iw", lastTimePeriod=1)
        keep = {"TOTAL"} | {
            c
            for c in iw["dimension"]["coicop18"]["category"]["index"]
            if re.fullmatch(r"CP\d{2,3}", c)
        }
        (HERE / "eurostat_hicp_iw_bg.json").write_text(
            json.dumps(_trim(iw, "coicop18", keep, ["2026"]), ensure_ascii=False, indent=1) + "\n"
        )

        rch = get("prc_hicp_minr", unit="RCH_A", lastTimePeriod=2)
        (HERE / "eurostat_hicp_rch_bg.json").write_text(
            json.dumps(_trim(rch, "coicop18", keep, RATE_PERIODS), ensure_ascii=False, indent=1)
            + "\n"
        )

        i15 = get("prc_hicp_minr", unit="I15", sinceTimePeriod="2020-01")
        (HERE / "eurostat_hicp_i15_bg.json").write_text(
            json.dumps(_trim(i15, "coicop18", keep, INDEX_PERIODS), ensure_ascii=False, indent=1)
            + "\n"
        )

        inw = get("prc_hicp_inw", lastTimePeriod=1)
        keep_v1 = {"CP00"} | {
            c
            for c in inw["dimension"]["coicop"]["category"]["index"]
            if re.fullmatch(r"CP\d{2}", c)
        }
        (HERE / "eurostat_hicp_inw_v1_bg.json").write_text(
            json.dumps(_trim(inw, "coicop", keep_v1, ["2025"]), ensure_ascii=False, indent=1) + "\n"
        )

    print("wrote 4 fixtures to", HERE)


if __name__ == "__main__":
    main()
