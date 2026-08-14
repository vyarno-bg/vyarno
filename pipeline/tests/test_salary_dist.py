"""Tests for the individual-earnings shape ladder (build_ses_shape_ladder).

The transform takes the Eurostat SES individual gross-earnings shape
(D1/median/mean/D9) and fills in the intermediate deciles and the tails,
leaving the result at SES's own level. No network — we feed the known BG 2022
SES numbers and assert the output has the right shape, monotonicity and
provenance.

**Why the ladder is published unlevelled.** The site shows this shape
re-levelled onto the current НСИ Sofia average, and that re-levelling happens
in the browser so that each published file stays with one publisher
(`docs/legal.md` §НСИ). Anchoring and the minimum-wage floor are therefore
asserted in `scripts/verify_mirror_math.mjs`, where they happen; what this file
covers is everything true of the shape alone.

The split costs no accuracy because re-levelling is a scalar multiply, and
`test_relevelling_is_a_scalar_multiply` below is the proof — break it and the
browser's arithmetic stops reproducing the published rungs.
"""

import json
import math
import re
from datetime import date
from itertools import pairwise
from pathlib import Path
from statistics import NormalDist

import pytest

from vyarno_pipeline.publish import SALARY_DIST_FILE, write_salary_distribution_payload
from vyarno_pipeline.transform import (
    SALARY_LADDER_CUTS,
    build_ses_shape_ladder,
)

MIRROR_JS = Path(__file__).resolve().parents[2] / "site" / "src" / "lib" / "mirror.js"

# BG 2022 SES, full-time, whole economy (earn_ses_monthly, EUR/month gross).
SES_BG_2022 = {
    "ref_year": "2022",
    "dataset": "earn_ses_monthly",
    "source_url": "https://ec.europa.eu/eurostat/databrowser/view/earn_ses_monthly/default/table?lang=en",
    "d1": 376.0,
    "median": 705.0,
    "mean": 949.0,
    "d9": 1700.0,
}
SOFIA_MEAN_2026 = 1914.7  # NSI Sofia-city average gross, 2026-Q1


def test_ladder_has_one_value_per_cut_in_order():
    out = build_ses_shape_ladder(SES_BG_2022)
    ladder = out["ladder_ses"]
    assert list(ladder) == [f"P{p}" for p in SALARY_LADDER_CUTS]


def test_ladder_is_strictly_increasing():
    ladder = build_ses_shape_ladder(SES_BG_2022)["ladder_ses"]
    values = [ladder[f"P{p}"] for p in SALARY_LADDER_CUTS]
    assert all(a < b for a, b in pairwise(values))


def test_the_three_surveyed_points_are_reproduced_exactly():
    """P10/P50/P90 are Eurostat's D1/median/D9 — not interpolated versions of them.

    The interpolation only fills the gaps between them. If a rung that
    Eurostat actually published came back changed, the model would be
    overwriting a surveyed figure with a modelled one.
    """
    ladder = build_ses_shape_ladder(SES_BG_2022)["ladder_ses"]
    assert ladder["P10"] == pytest.approx(SES_BG_2022["d1"])
    assert ladder["P50"] == pytest.approx(SES_BG_2022["median"])
    assert ladder["P90"] == pytest.approx(SES_BG_2022["d9"])


def test_the_ses_mean_the_browser_divides_by_is_published():
    """`ses_mean` is the divisor in the browser's re-level factor.

    Without it the SPA cannot reconstruct the ladder at all, and there is
    nothing else in the payload it could be inferred from.
    """
    out = build_ses_shape_ladder(SES_BG_2022)
    assert out["ses_mean"] == SES_BG_2022["mean"]


def test_rungs_carry_four_decimals_so_the_browser_rounds_once():
    """One decimal here and three of the eleven rungs land €0.10 out.

    The browser multiplies by the re-level factor and rounds to the displayed
    1 dp. Rounding at 1 dp on both sides is a double-round, and P20, P60 and
    P70 are the rungs it moves. Drop the precision here and
    `verify_mirror_math.mjs`'s reconstruction case goes red.
    """
    ladder = build_ses_shape_ladder(SES_BG_2022)["ladder_ses"]
    for cut, v in ladder.items():
        assert round(v, 4) == v, f"{cut} carries more than four decimals: {v}"
    assert any(round(v, 1) != v for v in ladder.values()), (
        "no rung needs more than one decimal, so this guard is not testing anything "
        "— check the SES inputs are real"
    )


def test_relevelling_is_a_scalar_multiply():
    """The property the pipeline/browser split rests on.

    Re-levelling multiplies D1, median and D9 by the same `f`, which adds
    ln(f) to every point of the log-linear model and leaves both dispersions
    untouched. So a ladder built from scaled inputs equals the published
    ladder scaled — exactly, not approximately. If this ever stops holding,
    the browser's multiplication silently stops reproducing the distribution.
    """
    base = build_ses_shape_ladder(SES_BG_2022)
    f = SOFIA_MEAN_2026 / SES_BG_2022["mean"]
    scaled_inputs = {
        **SES_BG_2022,
        "d1": SES_BG_2022["d1"] * f,
        "median": SES_BG_2022["median"] * f,
        "d9": SES_BG_2022["d9"] * f,
        "mean": SES_BG_2022["mean"] * f,
    }
    scaled = build_ses_shape_ladder(scaled_inputs)
    for cut in base["ladder_ses"]:
        assert scaled["ladder_ses"][cut] == pytest.approx(base["ladder_ses"][cut] * f)
    assert scaled["sigma_bottom"] == base["sigma_bottom"]
    assert scaled["sigma_top"] == base["sigma_top"]


def test_lognormal_dispersion_is_compressed_at_bottom():
    """BG's minimum wage compresses the lower half; the upper half is wider.

    This is a fact about the surveyed distribution, and it survives
    re-levelling untouched — which is exactly why the browser can multiply.
    """
    out = build_ses_shape_ladder(SES_BG_2022)
    assert out["sigma_bottom"] < out["sigma_top"]


def test_the_interpolation_matches_the_documented_model():
    """Piecewise-lognormal in the normal quantile, recomputed independently.

    Written out longhand rather than calling the transform, so a change to the
    model has to be a deliberate change to two places rather than a silent one.
    """
    out = build_ses_shape_ladder(SES_BG_2022)
    z = NormalDist()
    ln10, ln50, ln90 = (math.log(SES_BG_2022[k]) for k in ("d1", "median", "d9"))
    z10, z90 = z.inv_cdf(0.10), z.inv_cdf(0.90)
    sb, st = (ln50 - ln10) / -z10, (ln90 - ln50) / z90
    for p in (30, 70):
        zp = z.inv_cdf(p / 100)
        expected = math.exp(ln50 + (sb if zp <= 0 else st) * zp)
        assert out["ladder_ses"][f"P{p}"] == pytest.approx(expected, abs=1e-4)


def test_each_tail_continues_the_half_it_extends():
    """P1 and P99 are extrapolations, and each has to follow ITS OWN half.

    Neither is surveyed — SES publish D1, the median and D9 and stop — so what
    makes the two end rungs honest is that they carry on the slope of the
    segment they hang off rather than borrowing the other one. BG's halves
    differ by enough for that to matter: the minimum wage compresses the lower
    one and nothing compresses the upper. Extend P99 at the lower half's slope
    and the top rung falls 3484.09 → 2838.02 EUR/month, a €646 move that leaves
    every property this file already checks intact — the three surveyed anchors
    are still exact, the ladder is still strictly increasing, both dispersions
    are unchanged and re-levelling is still a scalar multiply. The percentile
    card would place a Sofia salary in the 99th percentile that is not near it.

    Asserted as slope continuity at the anchor rather than as the formula, so
    it is a property of the published rungs instead of a second copy of the
    model — `test_the_interpolation_matches_the_documented_model` is the copy,
    and it reaches only the two segments between the anchors.
    """
    out = build_ses_shape_ladder(SES_BG_2022)
    ladder = out["ladder_ses"]
    z = NormalDist()
    z1, z10, z90, z99 = (z.inv_cdf(p / 100) for p in (1, 10, 90, 99))

    above_d9 = (math.log(ladder["P99"]) - math.log(ladder["P90"])) / (z99 - z90)
    below_d1 = (math.log(ladder["P10"]) - math.log(ladder["P1"])) / (z10 - z1)
    assert above_d9 == pytest.approx(out["sigma_top"], abs=1e-4)
    assert below_d1 == pytest.approx(out["sigma_bottom"], abs=1e-4)
    assert out["sigma_bottom"] < out["sigma_top"], (
        "the two halves have the same dispersion here, so this test cannot tell "
        "a tail extended along the wrong one from a correct one"
    )


def test_zero_mean_raises():
    with pytest.raises(ValueError):
        build_ses_shape_ladder({**SES_BG_2022, "mean": 0.0})


def test_no_nsi_figure_reaches_the_transform_at_all():
    """The signature is the guard: there is nowhere to pass a level in.

    One publisher per published file is a property of the data layer, and a
    refactor that reintroduced a level parameter here would quietly undo it —
    the payload would start carrying two publishers' figures again and no
    number on screen would move. This fails first.
    """
    import inspect

    params = set(inspect.signature(build_ses_shape_ladder).parameters)
    assert params == {"ses"}, (
        f"build_ses_shape_ladder takes {params}. It must take the Eurostat shape "
        "and nothing else — a second publisher's figure passed in here ends up "
        "in a published file, and each published file carries one publisher. "
        "Re-level in the browser (mirror.js#composeLadder)."
    )


# ---------------------------------------------------------------------------
# The cut points are a cross-language contract
# ---------------------------------------------------------------------------


def test_ladder_cuts_match_the_frontend():
    """`transform.SALARY_LADDER_CUTS` and mirror.js's copy must be identical.

    `buildLadder` maps the composed ladder onto the frontend's cut list
    positionally, and `percentile()` interpolates between them. If the two
    lists drift, every rung is labelled with the wrong percentile — a silent,
    plausible-looking wrong answer rather than a crash.
    """
    src = MIRROR_JS.read_text(encoding="utf-8")
    m = re.search(r"const SALARY_LADDER_CUTS = \[([0-9,\s]+)\]", src)
    assert m is not None, "mirror.js no longer defines SALARY_LADDER_CUTS"
    frontend = [int(x) for x in m.group(1).replace(" ", "").strip(",").split(",")]
    assert frontend == SALARY_LADDER_CUTS, (
        f"cut points drifted: pipeline {SALARY_LADDER_CUTS} vs mirror.js {frontend}"
    )


# ---------------------------------------------------------------------------
# The published payload
# ---------------------------------------------------------------------------


def _write(tmp_path):
    out = write_salary_distribution_payload(
        as_of=date(2026, 7, 24),
        ses=SES_BG_2022,
        shape=build_ses_shape_ladder(SES_BG_2022),
        target_dir=tmp_path,
    )
    return json.loads(out.read_text(encoding="utf-8")), out


def test_published_payload_carries_the_ladder_the_spa_reads(tmp_path):
    """`shape.ladder_ses` with one rung per cut is what composeLadder maps."""
    payload, out = _write(tmp_path)
    assert out.name == SALARY_DIST_FILE
    assert payload["unit"] == "eur_per_month_gross"
    assert list(payload["shape"]["ladder_ses"]) == [f"P{p}" for p in SALARY_LADDER_CUTS]
    assert payload["shape"]["ses_mean"] == SES_BG_2022["mean"]


def test_published_payload_carries_no_second_publisher(tmp_path):
    """One publisher per file, asserted on the file rather than on the function.

    Every figure in this payload has to be Eurostat's. An `anchor` block, an
    НСИ URL or the string "nsi" anywhere in it means two publishers' figures
    are being written to disk in one artefact again.
    """
    payload, _ = _write(tmp_path)
    blob = json.dumps(payload, ensure_ascii=False).lower()
    assert "anchor" not in payload
    assert "nsi.bg" not in blob
    assert "нси" not in blob or "sector_salary.json" in blob, (
        "the payload may mention НСИ only to point at where their data actually "
        "lives; it must not carry any of it"
    )
    assert payload["source"] == "eurostat"
    assert payload["shape"]["source"] == "eurostat"


def test_published_payload_states_its_own_derivation(tmp_path):
    """Eurostat permits derivation on condition that it is disclosed.

    The deciles between D1/median/D9 and the two tails are modelled, so the
    payload has to say so — in `notes` for a machine reader and in `method`
    for anyone reading the file.
    """
    payload, _ = _write(tmp_path)
    assert "DERIVED" in payload["notes"]
    assert payload["shape"]["method"], "the method must be stated in the payload"
    assert payload["shape"]["ref_year"] == SES_BG_2022["ref_year"]
    assert payload["shape"]["dataset"] == SES_BG_2022["dataset"]
    assert payload["shape"]["source_url"].startswith("https://")
    assert "modelled" in payload["disclaimer"], (
        "the disclaimer must admit the middle deciles are modelled, not surveyed"
    )
