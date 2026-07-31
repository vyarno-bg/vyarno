"""Published-artefact contracts: what is actually committed under data/published/.

**The pipeline's output, re-checked on the files that ship.** Every gate in
`validate.py` runs at publish time, against live upstream rows, and is gone by
the time anybody reviews a diff. These assert the same properties offline, on
the JSON as committed — which catches the operational half the gates cannot
see: a refresh that ran but was never committed, a payload hand-edited after
its gate passed, a schema that drifted from what `publish.py` promises.

That is why they are pytest and why they live here. The subject is the
pipeline's own artefact, the runner is the pipeline's own runner, and the
assertions are about numbers.

**Nothing here reads Svelte or JavaScript source as text.** Python regexing a
`.svelte` file is a test that breaks on a formatter run and passes through the
failure it was written to catch, and each of those checks has a runner that
owns its language: copy rules go to `verify_copy.mjs` against the imported
`COPY` object, layout to `verify_render.mjs` in a real browser, template wiring
to `verify_wiring.mjs`, licence claims to `verify_legal.mjs`, the `{@html}`
contracts to `verify_template_safety.mjs`. `docs/testing-strategy.md` says
which suite a test belongs in and why.

What belongs here has one shape: an assertion about a published payload.
Anything about the SPA belongs in `site/scripts/`.

One test is not about a payload and is here on purpose:
`test_the_deploy_artefact_stays_lean_and_the_licence_is_declared` asserts on
`site/dist/`, which is the OTHER artefact a release produces. It reads a build
output rather than source, so it has the same character as the rest.

Scoping: read-only, no network, runs in under a fifth of a second.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from vyarno_pipeline import clock

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data" / "published"
MANIFEST = PROJECT_ROOT / "site" / "src" / "lib" / "payloads.js"
PUBLISH = Path(__file__).resolve().parents[1] / "src" / "vyarno_pipeline" / "publish.py"

manifest_src = MANIFEST.read_text(encoding="utf-8")


def _published(name: str) -> dict | None:
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Template contract: COPY with markup must be {@html}-rendered
# ---------------------------------------------------------------------------


def test_every_published_payload_has_a_publisher_and_a_consumer() -> None:
    """The three sides of the data contract must agree, in both directions.

    - a file in `data/published/` that is not in the site's manifest is an
      orphan nothing renders;
    - a manifest row with no file renders an empty card in production;
    - a filename constant in publish.py that names neither is dead code.

    The site side is read from `payloads.js`, which is where the SPA declares
    which payloads it depends on; `loadAll` derives its fetches from that list,
    so there are no filename literals in `data.js` to read instead.
    """
    on_disk = {p.stem for p in DATA_DIR.glob("*.json")}
    manifested = set(re.findall(r'file:\s*"([a-z_0-9]+)"', manifest_src))
    published = set(
        re.findall(r'_FILE:\s*str\s*=\s*"([a-z_0-9]+)\.json"', PUBLISH.read_text(encoding="utf-8"))
    )

    assert manifested, "payloads.js declares no payloads at all — parse failure?"
    assert on_disk == manifested, (
        f"data/published and payloads.js disagree.\n"
        f"  files with no SPA consumer: {sorted(on_disk - manifested)}\n"
        f"  manifest rows with no file: {sorted(manifested - on_disk)}"
    )
    assert published <= on_disk, (
        f"publish.py names files that are not published: {sorted(published - on_disk)}"
    )


def test_every_published_file_ends_in_a_newline() -> None:
    """One write path, so one file shape.

    `publish.write_payload` is what every writer and every CLI arm ends at, and
    it appends the final newline `.editorconfig` requires of every file in the
    tree. A payload missing it was written by something else — a hand-edit, or
    a second serialiser added beside the one in `publish.py` — and the next
    refresh would then show a one-line diff on a file whose numbers never
    moved, which is the kind of noise that gets a real change waved through.
    """
    naked = sorted(p.name for p in DATA_DIR.glob("*.json") if not p.read_bytes().endswith(b"\n"))
    assert not naked, f"published without a final newline: {naked}"


def test_published_hicp_categories_does_not_contain_partial_year_keys():
    """No `index_by_year` key for a year whose December is unpublished.

    Falling back to the latest available month when December is missing would
    store e.g. June 2026 under the key "2026". Consumers treat that key as
    end-of-2026, so every year-anchor number and label built on it would be
    wrong.
    """
    payload = _published("hicp_categories")
    if payload is None:
        pytest.skip("hicp_categories.json not on disk — run a refresh first")

    as_of = payload.get("as_of", "")
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", as_of), f"malformed as_of: {as_of!r}"
    as_of_year, as_of_month = int(as_of[:4]), int(as_of[5:7])
    if as_of_month == 12:
        pytest.skip(f"as_of={as_of} is December — the partial-year rule can't fire")

    for cat in payload["categories"]:
        keys = [int(k) for k in cat["index_by_year"]]
        assert as_of_year not in keys, (
            f"{cat['cp_code']} carries index_by_year[{as_of_year}] but "
            f"{as_of_year} is incomplete at as_of={as_of}."
        )
        assert max(keys) <= as_of_year - 1, (
            f"{cat['cp_code']} carries a future year key {max(keys)}."
        )


def test_published_hicp_categories_latest_index_is_fresh_and_linked():
    """Every category needs a fresh `latest_index` and a link that proves it.

    Freshness: `latest_index.time` ≥ `ref_period`, because the monthly index
    is published at least as early as the annual rate — an older index would
    contradict the rate series.
    Provenance: `api_url_index` must be the same CP's minr cube at unit=I15,
    the series we rebase from, so the user can check the number themselves.
    """
    payload = _published("hicp_categories")
    if payload is None:
        pytest.skip("hicp_categories.json not on disk — run a refresh first")

    for cat in payload["categories"]:
        cp = cat["cp_code"]
        assert "latest_index" in cat, f"{cp}: no latest_index — freshness contract broken"
        li = cat["latest_index"]
        assert set(li) == {"time", "value"}, f"{cp}: latest_index keys {set(li)}"
        assert re.fullmatch(r"\d{4}-\d{2}", str(li["time"])), (
            f"{cp}: latest_index.time {li['time']!r} is not YYYY-MM"
        )
        assert isinstance(li["value"], (int, float)) and li["value"] > 0, (
            f"{cp}: latest_index.value {li['value']!r} is not a positive number"
        )
        assert li["time"] >= cat["ref_period"], (
            f"{cp}: latest_index.time {li['time']} is older than ref_period "
            f"{cat['ref_period']} — the index is never behind the rate."
        )
        assert "prc_hicp_minr" in cat["api_url_index"], (
            f"{cp}: api_url_index does not point at prc_hicp_minr: {cat['api_url_index']}"
        )
        assert "unit=I15" in cat["api_url_index"], (
            f"{cp}: api_url_index is missing unit=I15: {cat['api_url_index']}"
        )


def test_published_hicp_index_is_on_the_2020_base():
    """`index_by_year` and `latest_index` must share the 2020=100 base.

    The SPA divides `latest_index / index_by_year[anchor]`. Publishing
    `latest_index` on Eurostat's raw 2015=100 base while `index_by_year` is
    rebased inflates every since-anchor number by the raw Dec-2020 factor —
    food "up 85% since 2020" when the truth is 60%. See docs/math.md
    §"Invariants that must never break" #1.
    """
    payload = _published("hicp_categories")
    if payload is None:
        pytest.skip("hicp_categories.json not on disk — run a refresh first")

    for cat in payload["categories"]:
        cp = cat["cp_code"]
        assert cat["index_base_year"] == 2020, f"{cp}: index_base_year != 2020"
        assert cat["unit"] == "index_2020=100", f"{cp}: unit is {cat['unit']!r}"
        assert abs(cat["index_by_year"]["2020"] - 100.0) < 1e-6, (
            f"{cp}: index_by_year[2020] = {cat['index_by_year']['2020']}, "
            f"expected exactly 100 after rebasing."
        )
        # A raw 2015=100 reading would sit far outside this band. Categories
        # may legitimately deflate (CP08 is below 100), so this is a band,
        # not a floor.
        assert 50 < cat["latest_index"]["value"] < 400, (
            f"{cp}: latest_index {cat['latest_index']['value']} is not on the 2020=100 base."
        )


def test_published_hicp_reconciles_within_tolerance():
    """The committed JSON must satisfy the basket-sum sanity band offline.

    `validate.py` enforces this at publish time against live Eurostat rows.
    This re-checks the arithmetic on the files in the repo, so a hand-edit or
    a half-finished refresh is caught by `pytest` with no network.

    NB this is the LOOSE band, not the tight one: Σ(w·r) is not an identity
    (the 12-month window straddles December's chain link), so it sits ~0.16 pp
    above the headline on correct BG data. The exact check is
    `validate.validate_chain_reconciliation`, which needs the raw index
    series and therefore runs at publish time only.
    """
    from vyarno_pipeline.sources.eurostat import CP_DIVISIONS
    from vyarno_pipeline.validate import BASKET_SUM_TOLERANCE_PP

    cats_payload, head_payload = _published("hicp_categories"), _published("hicp_headline")
    if cats_payload is None or head_payload is None:
        pytest.skip("published HICP JSON not on disk — run a refresh first")

    cats = cats_payload["categories"]
    headline = head_payload["headline_rate_pct"]
    assert [c["cp_code"] for c in cats] == CP_DIVISIONS, (
        f"published divisions are {[c['cp_code'] for c in cats]}, expected the "
        f"{len(CP_DIVISIONS)} ECOICOP ver.2 divisions"
    )

    total_weight = sum(c["weight_pct"] for c in cats)
    assert abs(total_weight - 100.0) <= 0.05, (
        f"published weights sum to {total_weight:.4f}, expected 100.0"
    )
    weighted = sum(c["weight_pct"] * c["annual_rate_pct"] for c in cats) / total_weight
    gap = abs(weighted - headline)
    assert gap <= BASKET_SUM_TOLERANCE_PP, (
        f"published reconciliation broken: Σ(w·r)/Σw = {weighted:.4f}% vs "
        f"headline {headline:.4f}%, gap {gap:.4f} pp. The committed JSON is "
        f"internally inconsistent — re-run `refresh --source hicp`."
    )


def test_published_hicp_is_all_on_ecoicop_ver2():
    """Guard against a cross-version join reaching the committed payload.

    Every published row must name a ver.2 provenance, and the envelope must
    say so too. A `dataset: prc_hicp_minr+prc_hicp_inw` — a ver.2 rates cube
    joined to a ver.1 weights cube — would otherwise sit in the committed JSON
    where nothing looks at it.
    """
    payload = _published("hicp_categories")
    if payload is None:
        pytest.skip("hicp_categories.json not on disk — run a refresh first")

    c = payload["classification"]
    assert c["version"] == "ECOICOP ver.2"
    assert c["coicop_dim"] == "coicop18"
    assert c["weights_dataset"] == "prc_hicp_iw", (
        "prc_hicp_inw is the ARCHIVED ver.1 weights cube — 12 divisions, no "
        "CP13, and CP12 means 'Miscellaneous goods and services' there"
    )
    assert c["division_count"] == 13
    for cat in payload["categories"]:
        assert "prc_hicp_inw" not in cat["dataset"], (
            f"{cat['cp_code']} still cites the archived ver.1 weights cube"
        )


def test_published_hicp_rows_describe_one_bucket_each():
    """Weight, rate, index, label and link must all be the same bucket.

    The July-2026 failure was a single row carrying a ver.1 weight, a ver.2
    rate and a hand-written label that matched neither. The invariant that
    replaced it: the row's `cp_code` appears in BOTH verify links, and the
    `eurostat_label` is the upstream name of that same code.
    """
    payload = _published("hicp_categories")
    if payload is None:
        pytest.skip("hicp_categories.json not on disk — run a refresh first")

    def check(row, code):
        assert row["eurostat_label"], f"{code}: no upstream label published"
        assert f"coicop18={code}" in row["api_url"], f"{code}: rate link points elsewhere"
        assert f"coicop18={code}" in row["api_url_index"], f"{code}: index link points elsewhere"

    for cat in payload["categories"]:
        check(cat, cat["cp_code"])
        for g in cat["groups"]:
            check(g, g["cp_code"])
            assert g["cp_code"].startswith(cat["cp_code"])


def test_published_cp12_is_insurance_and_cp13_is_present():
    """The user-visible half of the same regression.

    Under a cross-version join CP12's card carries the ver.1 Miscellaneous
    weight (5.898%) next to the ver.2 Insurance rate (3.9%), and CP13 — the
    second fastest-rising division in BG — gets no card at all.
    """
    payload = _published("hicp_categories")
    if payload is None:
        pytest.skip("hicp_categories.json not on disk — run a refresh first")

    cats = {c["cp_code"]: c for c in payload["categories"]}
    assert cats["CP12"]["eurostat_label"] == "Insurance and financial services"
    assert cats["CP12"]["weight_pct"] < 3.0, "that is the ver.1 Miscellaneous weight"
    assert "CP13" in cats, "the 13th ver.2 division is missing from the published basket"
    assert cats["CP13"]["eurostat_label"].startswith("Personal care")


def test_published_groups_sum_to_their_division():
    """The detailed mode re-splits a division across its groups. If they did
    not add up, drilling in would silently resize the division."""
    payload = _published("hicp_categories")
    if payload is None:
        pytest.skip("hicp_categories.json not on disk — run a refresh first")

    for cat in payload["categories"]:
        assert cat["groups"], f"{cat['cp_code']} has no groups to drill into"
        child_sum = sum(g["weight_pct"] for g in cat["groups"])
        assert abs(child_sum - cat["weight_pct"]) < 0.02, (
            f"{cat['cp_code']}: weight {cat['weight_pct']:.4f}% but groups sum to {child_sum:.4f}%"
        )
        of_parent = sum(g["weight_pct_of_parent"] for g in cat["groups"])
        assert abs(of_parent - 100.0) < 0.2, (
            f"{cat['cp_code']}: within-division shares sum to {of_parent:.2f}%"
        )


def test_published_headline_and_categories_are_the_same_vintage():
    """The headline and the category rates must come from the same month.

    They are the same cube at the same publication; a mismatch means one of
    the two was refreshed alone, and the reconciliation identity above would
    be comparing different months.
    """
    cats_payload, head_payload = _published("hicp_categories"), _published("hicp_headline")
    if cats_payload is None or head_payload is None:
        pytest.skip("published HICP JSON not on disk — run a refresh first")

    ref = head_payload["ref_period"]
    mismatched = [c["cp_code"] for c in cats_payload["categories"] if c["ref_period"] != ref]
    assert not mismatched, (
        f"headline ref_period is {ref} but these categories disagree: "
        f"{mismatched}. Refresh both together."
    )


# ---------------------------------------------------------------------------
# The HICP basket UI
# ---------------------------------------------------------------------------


def test_the_deploy_artefact_stays_lean_and_the_licence_is_declared() -> None:
    """Source maps stay out of the deploy artefact, and package.json is Apache-2.0.

    **The reason is hosting, and it is not secrecy.** The source is Apache-2.0
    and public on GitHub, so withholding a source map protects nothing;
    `sourcesContent` for every module is hundreds of kilobytes of payload that
    no visitor's browser asks for, on a small self-managed box serving a
    Bulgarian audience on mobile data. The maps are written
    (`sourcemap: 'hidden'`) and kept beside the build for error reporting —
    they are simply not served.

    Shipping them is therefore a legitimate call: it is a deploy-size trade,
    not a licence question. Make it deliberately, here and in
    `strip-sourcemaps.mjs`, rather than by flipping `sourcemap: true` while
    debugging and forgetting to revert — which is what this guards.
    """
    vite_config = (PROJECT_ROOT / "site" / "vite.config.js").read_text(encoding="utf-8")
    # Comments blanked: the config explains the `sourcemap: 'hidden'` choice in
    # prose that names the setting it is arguing against, and a scan that read
    # prose would fail on the explanation rather than on the setting.
    live = re.sub(r"/\*.*?\*/", "", vite_config, flags=re.DOTALL)
    live = "\n".join("" if ln.lstrip().startswith("//") else ln for ln in live.splitlines())
    assert re.search(r"sourcemap:\s*true", live) is None, (
        "vite.config.js sets `sourcemap: true` — the production build is "
        "shipping our full front-end source again. Use 'hidden'."
    )
    assert re.search(r"sourcemap:\s*['\"]hidden['\"]", live), (
        "vite.config.js no longer sets `sourcemap: 'hidden'`. Either it was "
        "removed (production stack traces become unreadable and no maps are "
        "kept for error reporting) or it was set to something else."
    )

    pkg = json.loads((PROJECT_ROOT / "site" / "package.json").read_text(encoding="utf-8"))
    assert "strip-sourcemaps" in pkg["scripts"]["build"], (
        "`npm run build` no longer runs scripts/strip-sourcemaps.mjs — the "
        "maps stay inside dist/ and get deployed, which is the whole leak."
    )
    assert pkg.get("license") == "Apache-2.0", (
        'site/package.json must declare `license: "Apache-2.0"` to match '
        "LICENSE. A manifest that disagrees with the LICENSE file is what "
        "licence scanners and downstream packagers actually read."
    )
    # `private: true` is npm hygiene, not a licence posture: this is an
    # application, not a library, and nothing here is meant to be published
    # to the npm registry. It says "do not `npm publish` this", which stays
    # true for an Apache-2.0 project whose source is public on GitHub.
    assert pkg.get("private") is True, (
        "site/package.json must stay `private: true` — this is a deployed "
        "app, not a package, and an accidental `npm publish` would put a "
        "vyarno-site package on the registry that nobody maintains."
    )


# ---------------------------------------------------------------------------
# Template contract: the legal pages, and the footer that reaches them
# ---------------------------------------------------------------------------
#
# Закон за електронната търговия чл. 4 requires a commercial site to publish
# who is behind it — name, seat, ЕИК, correspondence details, supervisory
# authority — and to keep that information permanently and directly
# accessible. Before these pages existed the site published none of it: no
# terms, no privacy notice, no contact route, and a footer that was a single
# unlinked string.
#
# The documents' own content is verified in `site/scripts/verify_legal.mjs`,
# where it can be imported and read. What lives here is the wiring that has no
# runtime harness: that every page mounts the shared footer, and that the
# footer's links point at documents which exist.


def test_published_headline_carries_the_all_items_index_on_the_2020_base() -> None:
    """`hicp_headline.json` must publish the CP00 index, not just the rate.

    The savings card asks a cumulative question ("what does money kept since
    2020 buy now"), and without an all-items index the SPA rebuilt one from the
    divisions at current weights — ~41.8% where Eurostat's own chain-linked
    index gives ~39.9%. On €100k of savings that is €960 under the word
    "official".

    Both operands must sit on the 2020=100 base, or the division silently
    inflates by the raw Dec-2020 factor — the failure `math.md` invariant #1
    exists for, and the one a 12-month rate cannot reveal.
    """
    payload = _published("hicp_headline")
    if payload is None:
        pytest.skip("hicp_headline.json not on disk — run a refresh first")

    idx = payload.get("index_by_year")
    latest = payload.get("latest_index")
    assert idx, "hicp_headline.json carries no index_by_year — the savings card falls back"
    assert latest and "value" in latest and "time" in latest

    assert payload.get("index_base_year") == 2020
    assert idx["2020"] == pytest.approx(100.0, abs=1e-9), (
        f"index_by_year['2020'] is {idx['2020']}, not 100 — this series is not "
        f"rebased to the base the SPA divides against"
    )
    # No partial-year key: a year appears only once its December is published.
    assert str(clock.today().year) not in idx, (
        "the current, partial year is in index_by_year — a calendar-year key must mean end-of-year"
    )
    # The freshest index must be the same month as the headline rate: both come
    # from one cube at one publication, so a gap means they were assembled from
    # different runs.
    assert latest["time"] == payload["ref_period"]

    cum = 100 * (latest["value"] / idx["2020"] - 1)
    assert 20 < cum < 80, f"since-2020 cumulative of {cum}% fails the sanity band"


def test_the_all_items_index_and_the_divisions_disagree_as_expected() -> None:
    """The two constructions must both be present AND measurably different.

    This is the test that makes the previous one worth having. Eurostat's
    chain-linked all-items index and Σw·(Iᵢ(now)/Iᵢ(2020) − 1) at current
    weights are both in the 30–60% band, so no range check can tell which one
    the savings card is showing. If they ever converge, the JS-side assertion
    in `verify_view.mjs` stops discriminating too, and this says so.
    """
    head = _published("hicp_headline")
    cats = _published("hicp_categories")
    if head is None or cats is None or not head.get("index_by_year"):
        pytest.skip("payloads not on disk — run a refresh first")

    official = 100 * (head["latest_index"]["value"] / head["index_by_year"]["2020"] - 1)
    rows = cats["categories"]
    total_w = sum(c["weight_pct"] for c in rows)
    reconstruction = (
        100
        * sum(
            c["weight_pct"] * (c["latest_index"]["value"] / c["index_by_year"]["2020"] - 1)
            for c in rows
        )
        / total_w
    )

    assert abs(official - reconstruction) > 1.0, (
        f"the official all-items cumulative ({official:.2f}%) and the divisions "
        f"reconstruction ({reconstruction:.2f}%) are within 1 pp. They are "
        f"structurally different constructions; if they have converged, the "
        f"tests that assert the savings card uses the official one can no "
        f"longer tell the two apart."
    )
    # And the reconstruction is the HIGHER one — fixed current weights applied
    # across six years overstate against an index that re-chains each January.
    assert reconstruction > official


def test_published_unemployment_is_monthly_and_seasonally_adjusted() -> None:
    """`une_rt_m`, not `une_rt_a`.

    The annual cube publishes once a year, so in July 2026 the freshest figure
    it offered was the 2025 average — 3.5%, eighteen months old, and 0.6 pp
    above what the monthly series showed for 2026-05. A card labelled
    «безработица» on a page selling freshness cannot carry a stale annual mean.
    """
    payload = _published("unemployment")
    if payload is None:
        pytest.skip("unemployment.json not on disk — run a refresh first")

    assert "une_rt_m" in payload["dataset"], payload["dataset"]
    assert "s_adj=SA" in payload["dataset"]
    assert "unit=PC_ACT" in payload["dataset"]
    assert "une_rt_m" in payload["source_url"]

    # A monthly ref_period is YYYY-MM. "2025" would be the annual cube again.
    assert re.fullmatch(r"\d{4}-\d{2}", payload["ref_period"]), (
        f"ref_period {payload['ref_period']!r} is not a month — this looks like the annual series"
    )
    assert all(re.fullmatch(r"\d{4}-\d{2}", k) for k in payload["series_by_period"])
    assert len(payload["series_by_period"]) > 24, "a monthly series since 2020 should be long"
    # Sanity band: a national unemployment rate, not thousands of persons.
    assert 0 < payload["value"] < 30, payload["value"]
