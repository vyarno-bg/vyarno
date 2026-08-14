"""Tests for the publish module — writes /data/published/*.json."""

import json
from datetime import date
from pathlib import Path

from vyarno_pipeline.models import CategoryObservation, GroupObservation
from vyarno_pipeline.payroll import build_payroll_payload
from vyarno_pipeline.publish import (
    HICP_CATEGORIES_FILE,
    HICP_HEADLINE_FILE,
    PAYROLL_FILE,
    write_hicp_categories,
    write_hicp_headline,
    write_payload,
)


def _cat(cp: str = "CP01", weight: float = 23.0, rate: float = 2.4) -> CategoryObservation:
    return CategoryObservation(
        dataset="prc_hicp_minr",
        source="eurostat",
        source_url="https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr",
        cp_code=cp,
        bg_name=f"BG {cp}",
        en_name=f"EN {cp}",
        eurostat_label=f"Eurostat label {cp}",
        weight_pct=weight,
        annual_rate_pct=rate,
        api_url=f"https://example.com/{cp}",
        api_url_index=f"https://example.com/index/{cp}",
        index_base_year=2015,
        index_by_year={2020: 100.0, 2021: 104.0, 2026: 150.0},
        latest_index={"time": "2026-12", "value": 150.0},
        ref_period="2026-12",
        published_at=date(2026, 12, 31),
        unit="index_2015=100",
        value=150.0,
    )


def _grp(cp: str, parent: str) -> GroupObservation:
    return GroupObservation(
        cp_code=cp,
        parent_cp_code=parent,
        bg_name=f"BG {cp}",
        en_name=f"EN {cp}",
        eurostat_label=f"Eurostat label {cp}",
        weight_pct=1.0,
        annual_rate_pct=2.4,
        ref_period="2026-12",
        index_base_year=2015,
        index_by_year={2020: 100.0, 2026: 150.0},
        latest_index={"time": "2026-12", "value": 150.0},
        api_url=f"https://example.com/{cp}",
        api_url_index=f"https://example.com/index/{cp}",
    )


def test_write_hicp_categories_writes_versioned_envelope(tmp_path: Path):
    """Output is a JSON file with schema_version + as_of + categories array."""
    cats = {f"CP{n:02d}": _cat(f"CP{n:02d}") for n in range(1, 14)}
    out = write_hicp_categories(
        cats,
        as_of=date(2026, 12, 31),
        target_dir=tmp_path,
        weights_year="2026",
    )

    assert out == tmp_path / HICP_CATEGORIES_FILE
    assert out.exists()

    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["schema_version"] == "1.0"
    assert payload["as_of"] == "2026-12-31"
    assert payload["source"] == "eurostat"
    assert len(payload["categories"]) == 13
    assert payload["categories"][0]["cp_code"] == "CP01"
    assert payload["categories"][0]["weight_pct"] == 23.0
    assert payload["categories"][0]["index_by_year"]["2020"] == 100.0


def test_write_hicp_categories_stamps_the_classification_block(tmp_path: Path):
    """The envelope must say which classification the numbers are on.

    Without it, a reader of the committed JSON cannot tell whether the
    weights and the rates came from the same ECOICOP version — which is
    exactly the question nobody could answer for the months the July-2026
    cross-version join was live.
    """
    out = write_hicp_categories(
        {f"CP{n:02d}": _cat(f"CP{n:02d}") for n in range(1, 14)},
        as_of=date(2026, 12, 31),
        target_dir=tmp_path,
        weights_year="2026",
    )

    c = json.loads(out.read_text(encoding="utf-8"))["classification"]
    assert c["version"] == "ECOICOP ver.2"
    assert c["coicop_dim"] == "coicop18"
    assert c["division_count"] == 13
    assert c["rates_dataset"] == "prc_hicp_minr"
    assert c["weights_dataset"] == "prc_hicp_iw"
    assert c["weights_ref_year"] == "2026"


def test_write_hicp_categories_counts_level_2_rows_under_group_count(tmp_path: Path):
    """`group_count` has to count children, and the block above it counts parents.

    The two sit side by side in the envelope, and a `group_count` that resolved
    to the number of divisions is plausible on sight — thirteen is a number of
    groups a small basket could have. What reads this field is whoever reviews a
    refresh diff: a division whose children vanished upstream shows up as this
    figure dropping and as nothing else in the envelope, so a count of the wrong
    level retires the only signal there is.

    The fixture gives two divisions groups and eleven none, so the group total
    and the division total cannot coincide.
    """
    cats = {f"CP{n:02d}": _cat(f"CP{n:02d}") for n in range(1, 14)}
    cats["CP01"].groups = [_grp(f"CP01{i}", "CP01") for i in (1, 2, 3)]
    cats["CP07"].groups = [_grp(f"CP07{i}", "CP07") for i in (1, 2)]

    payload = json.loads(
        write_hicp_categories(
            cats, as_of=date(2026, 12, 31), target_dir=tmp_path, weights_year="2026"
        ).read_text(encoding="utf-8")
    )
    assert payload["classification"]["division_count"] == 13
    assert payload["classification"]["group_count"] == 5
    # The same two figures in the envelope's prose, which is what a reader who
    # opens the file rather than the block sees first.
    assert "13 ECOICOP ver.2 divisions + 5 groups" in payload["notes"]


def test_write_hicp_categories_dates_the_envelope_with_the_rate_month(tmp_path: Path):
    """The envelope must say which period its figures describe.

    `as_of` is the day we fetched; `ref_period` is the month the rates are FOR,
    and the two are about a month apart. A consumer dating this payload reads the
    envelope, so the period has to be there and not only inside `categories[]`.

    Absent rather than empty-stringed when not supplied: a payload that cannot
    state its period should not claim one.
    """
    cats = {"CP01": _cat("CP01")}
    dated = json.loads(
        write_hicp_categories(
            cats, as_of=date(2026, 7, 27), target_dir=tmp_path, ref_period="2026-06"
        ).read_text(encoding="utf-8")
    )
    assert dated["ref_period"] == "2026-06"
    assert dated["as_of"] == "2026-07-27", "the fetch date and the period are different facts"

    undated = json.loads(
        write_hicp_categories(cats, as_of=date(2026, 7, 27), target_dir=tmp_path / "b").read_text(
            encoding="utf-8"
        )
    )
    assert "ref_period" not in undated


def test_write_hicp_categories_serializes_freshness_fields(tmp_path: Path):
    """The freshness contract: `latest_index` and `api_url_index`
    must round-trip through the publisher into the on-disk JSON.
    The SPA reads these directly; if the publisher drops them, the
    site falls back to the stale year-end series and the user
    loses 6+ months of data freshness.
    """
    cats = {"CP01": _cat("CP01")}
    out = write_hicp_categories(
        cats,
        as_of=date(2026, 12, 31),
        target_dir=tmp_path,
    )
    payload = json.loads(out.read_text(encoding="utf-8"))
    cat0 = payload["categories"][0]
    assert "latest_index" in cat0, (
        "Published JSON dropped latest_index. The SPA's basket-increase "
        "math will fall back to year-end stale data."
    )
    assert cat0["latest_index"] == {"time": "2026-12", "value": 150.0}
    assert "api_url_index" in cat0, (
        "Published JSON dropped api_url_index. The user has no way to verify the freshness number."
    )
    assert cat0["api_url_index"] == "https://example.com/index/CP01"


def test_write_hicp_categories_creates_target_dir(tmp_path: Path):
    """target_dir is created if it doesn't exist."""
    nested = tmp_path / "deep" / "nested" / "path"
    assert not nested.exists()

    cats = {"CP01": _cat()}
    out = write_hicp_categories(cats, as_of=date(2026, 12, 31), target_dir=nested)
    assert out.exists()


def test_write_hicp_categories_is_utf8_safe(tmp_path: Path):
    """Bulgarian names must be written as Cyrillic, not \\uXXXX escapes.

    `ensure_ascii=False` is the reason: with the default the file is still
    valid JSON, but every category label in the repo becomes unreadable in
    review and diffs, which is how a wrong label survives a copy pass.
    """
    cat = _cat()
    cat.bg_name = "Храна и безалк. напитки"
    out = write_hicp_categories({"CP01": cat}, as_of=date(2026, 12, 31), target_dir=tmp_path)
    text = out.read_text(encoding="utf-8")
    assert "Храна и безалк. напитки" in text
    assert "\\u0425" not in text, "Cyrillic was escaped — ensure_ascii=False was lost"
    assert json.loads(text)["categories"][0]["bg_name"] == "Храна и безалк. напитки"


def test_write_hicp_headline_writes_simple_envelope(tmp_path: Path):
    out = write_hicp_headline(
        as_of=date(2026, 12, 31),
        headline_rate_pct=5.2,
        ref_period="2026-12",
        target_dir=tmp_path,
    )
    assert out == tmp_path / HICP_HEADLINE_FILE
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["schema_version"] == "1.0"
    assert payload["headline_rate_pct"] == 5.2
    assert payload["ref_period"] == "2026-12"


def test_write_payroll_payload_round_trips_the_law_table(tmp_path: Path):
    """payroll.json is the SPA's source of truth for gross→net.

    The writer must land every field the SPA reads (`payrollParams` in
    mirror.js maps exactly these four), or the app silently falls back to
    its frozen sentinel and keeps computing the old law after a change.
    """
    payload = build_payroll_payload(date(2026, 7, 24))
    out = write_payload(payload, target_dir=tmp_path, filename=PAYROLL_FILE)

    assert out == tmp_path / PAYROLL_FILE
    on_disk = json.loads(out.read_text(encoding="utf-8"))
    for field in (
        "employee_contrib_rates",
        "income_tax_rate",
        "max_insurable_income_eur",
        "min_wage_gross_eur",
    ):
        assert field in on_disk, f"payroll.json is missing {field} — mirror.js reads it"
    assert on_disk["employee_contrib_rates"]["total"] == payload["employee_contrib_rates"]["total"]
    assert on_disk["as_of"] == "2026-07-24"


def test_published_filenames_are_the_contract_with_the_site(tmp_path: Path):
    """The filename constants are the SPA's fetch paths.

    Renaming one without updating `site/src/lib/data.js` 404s that payload
    at runtime and the card renders empty. The cross-file check lives in
    test_published_contracts.py; this pins the constants themselves.
    """
    assert HICP_CATEGORIES_FILE == "hicp_categories.json"
    assert HICP_HEADLINE_FILE == "hicp_headline.json"
    assert PAYROLL_FILE == "payroll.json"
