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
`COPY` object, layout to the `verify_render_*.mjs` suites in a real browser, template wiring
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

from vyarno_pipeline import clock, publish, validate
from vyarno_pipeline.mortgage import CROSS_CHECK_TOLERANCE_PP
from vyarno_pipeline.regions import PRICED_REGIONS, REGIONS

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data" / "published"
MANIFEST = PROJECT_ROOT / "site" / "src" / "lib" / "payloads.js"
PUBLISH = Path(__file__).resolve().parents[1] / "src" / "vyarno_pipeline" / "publish.py"

manifest_src = MANIFEST.read_text(encoding="utf-8")


def _published(name: str) -> dict:
    """The committed payload. An absent one is a failure, never a skip.

    Every file under `data/published/` is tracked, so a missing one is
    not a fresh clone, a CI checkout or a machine that has never run a refresh
    — it is a committed file somebody deleted, moved or emptied, which is
    precisely the moment every contract below has something to say. Skipping
    there hands back the one result nobody reads: pytest exits 0, the run is
    green, and the only offline check on what actually ships asserted nothing.
    """
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        pytest.fail(
            f"data/published/{name}.json is missing. It is committed to the "
            f"repository — its absence is the bug, not a reason to stand these "
            f"contracts down. Restore it with "
            f"`git checkout -- data/published/{name}.json`."
        )
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


def test_the_two_nsi_wage_tables_are_written_to_the_files_that_name_them() -> None:
    """The filename constants, against literals and against what each file holds.

    The test above reads the constants out of `publish.py` and compares them as
    a SET, so `REGION_SALARY_FILE` and `SECTOR_SALARY_FILE` exchanged passes it
    — the same two names, still both on disk, still both in the manifest. What
    the exchange does is put the 28-област table in `sector_salary.json` and the
    20 NACE sections in `region_salary.json`, and every consumer joins by
    filename: the SPA's област picker would offer «Създаване и разпространение
    на информация», and the ladder would be re-levelled to whatever wage the
    first области row happened to carry.

    So the pairing is written out here, and each file is checked for the shape
    that belongs to its arm. A wage table is a wage table — the two are told
    apart by the key they publish their rows under and by whether those rows
    carry an област code, and by nothing else.
    """
    assert publish.REGION_SALARY_FILE == "region_salary.json"
    assert publish.SECTOR_SALARY_FILE == "sector_salary.json"

    regions = _published("region_salary")
    assert regions["payload_name"] == "region_salary"
    assert "sectors" not in regions
    # 28 области, and the codes are the join to `city_price.json`. A NACE
    # section has no code at all, which is what makes the two distinguishable
    # from the file alone.
    assert len(regions["regions"]) == 28
    assert {r["code"] for r in regions["regions"]} == {r.code for r in REGIONS}

    sectors = _published("sector_salary")
    assert sectors["payload_name"] == "sector_salary"
    assert "regions" not in sectors
    # NACE Rev.2 sections A–S as НСИ publish them, plus the all-activities row
    # the ladder is re-levelled against. The connector refuses a sheet whose
    # by-activity block is not exactly this many rows.
    assert len(sectors["sectors"]) == 20
    assert all("code" not in s for s in sectors["sectors"])


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


def test_write_payload_writes_lf_on_every_platform() -> None:
    """The published tree is LF wherever the refresh was run from.

    Text mode translates "\\n" to `os.linesep`, so `write_payload` without an
    explicit `newline` writes CRLF on Windows and every one of the eight
    payloads comes out byte-different from the same numbers published on Linux.
    `.gitattributes` normalises them back on commit, which is what makes this
    worth a test rather than obvious: the repository stays clean while the
    working tree does not, and what reads the working tree — `copy-data.mjs`
    filling `dist/`, any byte comparison against the previous publish — sees
    the difference the diff never shows.

    On a POSIX box this passes whatever `write_payload` does, because there
    `os.linesep` is already "\\n". The Windows CI job is what gives it teeth,
    and that is the reason the job exists.
    """
    payload = {"note": "кирилица", "value": 1}
    written = publish.write_payload(payload, DATA_DIR.parent / "_tmp_newline_check", "probe.json")
    try:
        raw = written.read_bytes()
        assert b"\r\n" not in raw, (
            "write_payload produced CRLF. Text mode translates to os.linesep — "
            'pass newline="\\n" so the published shape does not depend on the '
            "machine the refresh ran on."
        )
        assert "кирилица" in raw.decode("utf-8"), "write_payload did not write UTF-8"
    finally:
        written.unlink()
        written.parent.rmdir()


def test_published_hicp_categories_year_keys_are_exactly_the_completed_years():
    """An `index_by_year` key for a year exists exactly when its December does.

    Falling back to the latest available month when December is missing would
    store e.g. June 2026 under the key "2026". Consumers treat that key as
    end-of-2026, so every year-anchor number and label built on it would be
    wrong. Dropping a year whose December HAS published is the same error
    running the other way: the newest anchor silently becomes the year before,
    and the dropdown offers a stale one as its freshest.

    **What decides whether `as_of`'s own year is finished is the payload, not
    the calendar.** Eurostat publishes a month's index about six weeks after
    that month ends, so December's reading lands the following January and an
    `as_of` anywhere inside December still describes an unfinished year — but
    a refresh run once the reading exists legitimately carries the key, and
    `latest_index.time` is the field that says which of the two this payload
    is. Both come out of one `index_fields` call over one set of rows
    (`transform.py`), so the equivalence below is the year-end rule of
    `docs/math.md` invariant #4 read off the artefact.
    """
    payload = _published("hicp_categories")

    as_of = payload.get("as_of", "")
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", as_of), f"malformed as_of: {as_of!r}"
    as_of_year = int(as_of[:4])

    for cat in payload["categories"]:
        keys = [int(k) for k in cat["index_by_year"]]
        latest_month = str(cat["latest_index"]["time"])
        assert max(keys) <= as_of_year, (
            f"{cat['cp_code']} carries a future year key {max(keys)} at as_of={as_of}."
        )
        if latest_month >= f"{as_of_year}-12":
            assert as_of_year in keys, (
                f"{cat['cp_code']} has published {latest_month} but carries no "
                f"index_by_year[{as_of_year}] — a completed year was dropped, so "
                f"the freshest anchor on offer is {max(keys)}."
            )
        else:
            assert as_of_year not in keys, (
                f"{cat['cp_code']} carries index_by_year[{as_of_year}] while its "
                f"freshest index is {latest_month}, so {as_of_year} has no "
                f"year-end reading at as_of={as_of}."
            )


def test_published_hicp_categories_latest_index_is_fresh_and_linked():
    """Every category needs a fresh `latest_index` and a link that proves it.

    Freshness: `latest_index.time` ≥ `ref_period`, because the monthly index
    is published at least as early as the annual rate — an older index would
    contradict the rate series.
    Provenance: `api_url_index` must be the same CP's minr cube at unit=I15 —
    the series the published values ARE, so opening it returns those digits.
    """
    payload = _published("hicp_categories")

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


def test_published_hicp_index_is_eurostat_s_own_values_on_the_linked_base():
    """All three index fields must be Eurostat's values, on the base the link names.

    The SPA divides `latest_index / index_by_year[anchor]`, so the two have to
    share a base; scaling one and not the other inflates every since-anchor
    number by the scale factor — food "up 85% since 2020" when the truth is
    60%. See docs/math.md §"Invariants that must never break" #1.

    And the base has to be the one `api_url_index` resolves to. That is what
    makes the link a check: open it and the published digits come back. A
    payload scaled to some in-house base still links to a genuine Eurostat
    page — showing different numbers, with nothing on the page to say why.

    `value` is the third field, and it is the one that can rot unwatched. No
    part of the SPA reads it, so a wrong `value` moves nothing on screen and
    reddens no other suite — the payload is the only place it is ever seen, and
    the envelope there names Eurostat. It is the newest completed December,
    which is exactly `index_by_year`'s newest entry, so that equality is the
    whole check. Divide it through by the 2020 reading and CP12 publishes
    129.90 where the cube returns 170.37, 23.75% off a base the same object
    names as 2015.
    """
    payload = _published("hicp_categories")

    unit_base = {"I15": 2015, "I25": 2025}
    for cat in payload["categories"]:
        cp = cat["cp_code"]
        unit = re.search(r"[?&]unit=([A-Z0-9_]+)", cat["api_url_index"]).group(1)
        assert cat["index_base_year"] == unit_base[unit], (
            f"{cp}: published base {cat['index_base_year']} is not unit {unit}'s base"
        )
        assert cat["unit"] == f"index_{cat['index_base_year']}=100", (
            f"{cp}: unit is {cat['unit']!r}"
        )
        # Categories may legitimately deflate, so this is a band, not a floor:
        # what it catches is a reading that has been scaled off the base.
        assert 50 < cat["latest_index"]["value"] < 400, (
            f"{cp}: latest_index {cat['latest_index']['value']} is off the published base."
        )
        newest = str(max(int(year) for year in cat["index_by_year"]))
        assert cat["value"] == cat["index_by_year"][newest], (
            f"{cp}: value {cat['value']} is not index_by_year[{newest}] "
            f"({cat['index_by_year'][newest]}). The two name the same reading — "
            f"the newest completed December — so they cannot disagree without "
            f"one of them having been through arithmetic."
        )

    # A rescaled series gives itself away: dividing through by an anchor makes
    # EVERY division read exactly 100 there. Eurostat's own values do that for
    # at most one, by coincidence.
    at_100 = [
        c["cp_code"]
        for c in payload["categories"]
        if abs(c["index_by_year"]["2020"] - 100.0) < 1e-9
    ]
    assert len(at_100) <= 1, f"{len(at_100)} divisions read exactly 100 at 2020: {at_100}"


def test_published_hicp_reconciles_within_tolerance():
    """The committed JSON must satisfy the basket-sum sanity band offline.

    `validate.py` enforces this at publish time against live Eurostat rows.
    This re-checks the arithmetic on the files in the repo, so a hand-edit or
    a half-finished refresh is caught by `pytest` with no network.

    NB this is the LOOSE band, not the tight one: Σ(w·r) is not an identity
    (the 12-month window straddles December's chain link), so it sits ~0.16 pp
    above the headline on correct BG data.

    **The rate half of this cannot run during a flash**, and nothing can make
    it: Σ(w·r) is the divisions' month and the headline is a month ahead, so
    the committed pair holds no all-items RATE at the month the divisions
    describe. Comparing them anyway reads the release itself as a 1.26 pp
    break. What replaces it for those two or three weeks is the CHAIN identity
    below, on the index values both payloads carry at the month they share —
    the same arithmetic `validate.validate_chain_reconciliation` runs at
    publish time, and a tighter check than the one it stands in for. So the
    committed pair is never unreconciled, only reconciled through the other
    field.
    """
    from vyarno_pipeline.sources.eurostat import CP_DIVISIONS
    from vyarno_pipeline.validate import BASKET_SUM_TOLERANCE_PP, CHAIN_TOLERANCE_PP

    cats_payload, head_payload = _published("hicp_categories"), _published("hicp_headline")

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
    index_month = head_payload["latest_index"]["time"]
    same_month = index_month == head_payload["ref_period"]

    if same_month:
        weighted = sum(c["weight_pct"] * c["annual_rate_pct"] for c in cats) / total_weight
        gap = abs(weighted - headline)
        assert gap <= BASKET_SUM_TOLERANCE_PP, (
            f"published reconciliation broken: Σ(w·r)/Σw = {weighted:.4f}% vs "
            f"headline {headline:.4f}%, gap {gap:.4f} pp. The committed JSON is "
            f"internally inconsistent — re-run `refresh --source hicp`."
        )
    else:
        assert "FLASH" in head_payload["notes"], (
            f"the headline rate is at {head_payload['ref_period']} and its index at "
            f"{index_month} with nothing saying why — Σ(w·r) has no headline to "
            f"reconcile against and this is not a flash. Re-run `refresh --source hicp`."
        )

    # Both payloads carry the all-items and per-division index at the month
    # they share, so the chain identity is checkable offline whichever release
    # this is. Every division's index and the total's are Eurostat's own, on
    # one base, so this is an identity rather than a band: it lands within a
    # few thousandths of a point, and the 2 dp the payloads round to is what
    # spends most of that.
    link = str(int(index_month[:4]) - 1)  # the December the chain links through
    rebuilt = (
        100
        * sum(c["weight_pct"] * c["latest_index"]["value"] / c["index_by_year"][link] for c in cats)
        / total_weight
    )
    official = 100 * head_payload["latest_index"]["value"] / head_payload["index_by_year"][link]
    chain_gap = abs(rebuilt - official)
    assert chain_gap <= CHAIN_TOLERANCE_PP, (
        f"published chain reconciliation broken at {index_month}: the divisions "
        f"rebuild {rebuilt:.4f} against the all-items {official:.4f} (December "
        f"{link} = 100 basis), gap {chain_gap:.4f} pp. The two payloads are not "
        f"the same vintage of the same basket — re-run `refresh --source hicp`."
    )


def test_published_hicp_is_all_on_ecoicop_ver2():
    """Guard against a cross-version join reaching the committed payload.

    Every published row must name a ver.2 provenance, and the envelope must
    say so too. A `dataset: prc_hicp_minr+prc_hicp_inw` — a ver.2 rates cube
    joined to a ver.1 weights cube — would otherwise sit in the committed JSON
    where nothing looks at it.
    """
    payload = _published("hicp_categories")

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

    cats = {c["cp_code"]: c for c in payload["categories"]}
    assert cats["CP12"]["eurostat_label"] == "Insurance and financial services"
    assert cats["CP12"]["weight_pct"] < 3.0, "that is the ver.1 Miscellaneous weight"
    assert "CP13" in cats, "the 13th ver.2 division is missing from the published basket"
    assert cats["CP13"]["eurostat_label"].startswith("Personal care")


def test_published_groups_sum_to_their_division():
    """The detailed mode re-splits a division across its groups. If they did
    not add up, drilling in would silently resize the division."""
    payload = _published("hicp_categories")

    for cat in payload["categories"]:
        assert cat["groups"], f"{cat['cp_code']} has no groups to drill into"
        child_sum = sum(g["weight_pct"] for g in cat["groups"])
        assert abs(child_sum - cat["weight_pct"]) < 0.02, (
            f"{cat['cp_code']}: weight {cat['weight_pct']:.4f}% but groups sum to {child_sum:.4f}%"
        )
        # That sum is the whole reason the payload carries one weight per
        # group and not two. The SPA's default split normalises the groups
        # against their own total, so a published share-of-division field would
        # reproduce these same amounts — as a number we computed, sitting in a
        # payload sourced to Eurostat.
        assert "weight_pct_of_parent" not in cat["groups"][0], (
            f"{cat['cp_code']}: a share-of-division field is `weight_pct` restated, and ours"
        )


def test_published_headline_and_categories_are_the_same_vintage():
    """The categories must match the headline's INDEX month, always.

    Normally that is the headline's `ref_period` too — one cube, one call, one
    month — and a mismatch means one of the two payloads was refreshed alone,
    with the reconciliation identity above then comparing different months.

    Eurostat's flash breaks the equality with `ref_period` on purpose: the
    all-items rate for a month is published about two weeks before the
    divisions are, so the headline legitimately runs a month ahead of
    hicp_categories.json until the full release lands. What separates that from
    an accidental solo refresh is the index. A flash carries no index either, so
    the headline's `latest_index` stays back with the divisions; a headline
    refreshed alone off a FULL release moves both of its months forward and
    strands the divisions behind them. So the categories are allowed to lag
    `ref_period`, and never allowed to lag `latest_index.time` — which is the
    month the divisions are actually compared against, in the two tests below
    and in the SPA's savings card.
    """
    cats_payload, head_payload = _published("hicp_categories"), _published("hicp_headline")

    ref = head_payload["ref_period"]
    index_month = (head_payload.get("latest_index") or {}).get("time", ref)
    assert index_month <= ref, (
        f"the all-items index ({index_month}) is ahead of the rate it is published "
        f"beside ({ref}) — Eurostat releases them the other way round"
    )
    mismatched = [
        c["cp_code"] for c in cats_payload["categories"] if c["ref_period"] != index_month
    ]
    assert not mismatched, (
        f"the headline's index is at {index_month} but these categories disagree: "
        f"{mismatched}. Refresh both together."
    )
    if index_month != ref:
        assert "FLASH" in head_payload["notes"], (
            f"headline ref_period {ref} runs ahead of its index {index_month} but the "
            f"payload does not say it is a flash — so this reads as a solo refresh"
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


def test_published_headline_carries_the_all_items_index_unscaled() -> None:
    """`hicp_headline.json` must publish the CP00 index, not just the rate.

    The savings card asks a cumulative question ("what does money kept since
    2020 buy now"), and without an all-items index the SPA rebuilt one from the
    divisions at current weights — ~41.8% where Eurostat's own chain-linked
    index gives ~39.9%. On €100k of savings that is €960 under the word
    "official".

    Both operands must sit on one base, or the division silently inflates by
    whatever scaled them apart — the failure `math.md` invariant #1 exists for,
    and the one a 12-month rate cannot reveal. They do, because neither is
    scaled: this payload's index is Eurostat's, as the categories' is.
    """
    payload = _published("hicp_headline")

    idx = payload.get("index_by_year")
    latest = payload.get("latest_index")
    assert idx, "hicp_headline.json carries no index_by_year — the savings card falls back"
    assert latest and "value" in latest and "time" in latest

    cats = _published("hicp_categories")
    assert payload["index_base_year"] == cats["categories"][0]["index_base_year"], (
        "the headline and the divisions are on different bases — the savings card "
        "and the basket chart would answer the same question differently"
    )
    assert payload["unit"] == f"index_{payload['index_base_year']}=100"
    # No partial-year key: a year appears only once its December is published.
    assert str(clock.today().year) not in idx, (
        "the current, partial year is in index_by_year — a calendar-year key must mean end-of-year"
    )
    # The freshest index is normally the same month as the headline rate: both
    # come from one cube at one publication. A flash is the one release that
    # separates them — the rate arrives about two weeks before that month's
    # index exists — so the index may sit a month behind, and never ahead. Any
    # wider gap is two runs assembled into one payload.
    #
    # Both operands of the savings card's cumulative still come from this
    # payload, on Eurostat's base, so the division stays the one `math.md`
    # invariant #1 describes; what a flash moves is the END-POINT's month, and
    # `latest_index.time` is the field that states it.
    ref, latest_time = payload["ref_period"], latest["time"]
    assert latest_time <= ref, f"the index ({latest_time}) is ahead of the rate ({ref})"
    if latest_time != ref:
        y, m = (int(x) for x in ref.split("-"))
        prev = f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"
        assert latest_time == prev, (
            f"the index is at {latest_time} while the rate is at {ref} — a flash is "
            f"one month early, so anything wider is two runs in one payload"
        )
        assert "FLASH" in payload["notes"]

    cum = 100 * (latest["value"] / idx["2020"] - 1)
    assert 20 < cum < 80, f"since-2020 cumulative of {cum}% fails the sanity band"


def test_the_all_items_index_and_the_divisions_disagree_as_expected() -> None:
    """The two constructions must both be present AND measurably different.

    This is the test that makes the previous one worth having. Eurostat's
    chain-linked all-items index and Σw·(Iᵢ(now)/Iᵢ(2020) − 1) at current
    weights are both in the 30–60% band, so no range check can tell which one
    the savings card is showing. If they ever converge, the JS-side assertion
    in `verify_view_results.mjs` stops discriminating too, and this says so.
    """
    head = _published("hicp_headline")
    cats = _published("hicp_categories")

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


# ---------------------------------------------------------------------------
# The payload gates, re-run on what is committed
# ---------------------------------------------------------------------------

# Every gate below takes the published shape, so the offline run is the SAME
# function the arm ran — not a restatement of it. A restatement is two
# implementations of one identity, and the one nobody edits is the one that
# stops being true.
#
# The arguments a gate compares AGAINST come from `regions.py` and from the
# payload's own `ref_period`, which is how each is called in `cli.py`. Handing
# a gate the list the payload itself publishes would let a wrong table pass by
# agreeing with itself, and the coverage lists are the half that cannot.
_PAYLOAD_GATES = {
    "house_market": lambda p: validate.validate_house_market(p("house_market")),
    "house_market_structure": lambda p: validate.validate_house_market_structure(
        p("house_market_structure")
    ),
    "nsi_housing": lambda p: validate.validate_nsi_housing(p("nsi_housing")),
    "unemployment": lambda p: validate.validate_unemployment(p("unemployment")),
    "payroll": lambda p: validate.validate_payroll(p("payroll")),
    "region_salary": lambda p: validate.validate_region_salary(
        p("region_salary")["regions"],
        p("region_salary")["ref_period"],
        [r.code for r in REGIONS],
    ),
    "sector_salary": lambda p: validate.validate_sector_salary(
        p("sector_salary")["sectors"], p("sector_salary")["ref_period"]
    ),
    "city_price": lambda p: validate.validate_city_price(
        p("city_price")["cities"], [r.code for r in PRICED_REGIONS]
    ),
}


@pytest.mark.parametrize("name", sorted(_PAYLOAD_GATES))
def test_the_committed_payload_still_passes_its_own_gate(name: str) -> None:
    """A gate guards the run that wrote a payload; this guards the file.

    `validate.py` runs once, against rows fetched from an upstream, and is gone
    by the time anybody opens the diff. So nothing between that run and the
    reader re-asks whether the file still holds — and the gates whose whole
    subject is an identity INSIDE one payload are exactly the ones a later edit
    can break without touching a number that looks wrong.

    Measured before this test existed: `nsi_housing`'s national change, its
    Sofia city change, `region_salary`'s Sofia-city wage, `sector_salary`'s
    all-activities wage and `house_market`'s latest average deal could each be
    edited on disk to a figure that reaches the page, and `pytest -q` plus
    `npm run verify:math` stayed green on all five.

    The identities are not restated here. Each gate is called with the
    published shape, so a tolerance or a rule that moves in `validate.py` moves
    for the committed file in the same commit — and a gate somebody softens to
    get a refresh through stops guarding both places at once, which is visible,
    rather than one of them, which is not.
    """
    _PAYLOAD_GATES[name](_published)


def test_the_two_house_price_publishers_still_agree_on_the_committed_files() -> None:
    """НСИ and Eurostat, off disk — the reconciliation the arm can only skip.

    `validate_hpi_across_publishers` runs inside the `nsi-housing` arm and is
    skipped, loudly, when `house_market.json` is not in the output directory.
    Both files are committed, so here it can never be skipped: the two payloads
    carry ONE statistic by two routes, and a disagreement means one of them was
    read at the wrong quarter, the wrong column or the wrong purchase type.

    That is also the only check in this file that holds one payload against
    another, which is why a refresh of either arm alone cannot satisfy it.
    """
    validate.validate_hpi_across_publishers(_published("nsi_housing"), _published("house_market"))


def test_the_published_revolving_amounts_are_still_nested_and_not_added() -> None:
    """БНБ's «в т.ч.» read flat, on the file rather than on the fetch.

    `credit.validate_card_nesting` reads the workbook's three cells, and only
    two of them are published: `card.stock_eur_m` is the balance carried past
    the interest-free period, and `overdraft.stock_eur_m` is the whole block
    less its card sub-block. The containment that survives into the payload is
    therefore that the two of them together fit inside the block they were cut
    from, which `outstanding.blocks` publishes beside them.

    Read flat and summed the three would report roughly twice what households
    owe on revolving credit, and every one of the figures would still look like
    a believable balance — which is the whole reason the fetch has a gate, and
    the reason the file needs one too.
    """
    payload = _published("credit")
    block = next(b for b in payload["outstanding"]["blocks"] if b["block"] == "overdraft")
    card = payload["card"]["stock_eur_m"]
    overdraft = payload["overdraft"]["stock_eur_m"]

    assert card < block["volume_eur_m"], (
        f"the card balance {card} m EUR is not inside the overdraft block "
        f"{block['volume_eur_m']} m EUR it is «в т.ч.» of"
    )
    assert overdraft + card <= block["volume_eur_m"] + 0.001, (
        f"overdraft-less-cards ({overdraft}) plus the card balance ({card}) is "
        f"{overdraft + card} m EUR, above the {block['volume_eur_m']} m EUR block "
        f"both come out of — the sub-block was added rather than contained"
    )
    # The subtraction is what the ЕЦБ cross-check proves happened, and the
    # payload ships that check's own working so the file states its evidence.
    for where in (payload["overdraft"], payload["card"]):
        cross = where["stock_cross_check"]
        assert abs(cross["bnb_pct"] - cross["ecb_mir_pct"]) <= CROSS_CHECK_TOLERANCE_PP, (
            f"БНБ {cross['bnb_pct']}% against ЕЦБ {cross['ecb_mir_pct']}% is "
            f"outside the tolerance the arm published it under"
        )
