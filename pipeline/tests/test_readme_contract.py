"""The two READMEs, and the one claim they are not allowed to get wrong.

`README.md` and `README.bg.md` are one document in two languages: same sections
in the same order, same commands and same badge URLs. They are NOT sentence-for-
sentence translations, and nothing here tries to make them so — Bulgarian is the
primary language and phrasing written to read well in it is the point, so the
two are expected to drift in wording. A check that forced them to stay identical
would be enforcing the wrong property, and would make improving either one a
chore.

What is NOT allowed to drift is the licence boundary.

**The code is ours and the figures are not.** `data/published/` belongs to
Eurostat, the ЕЦБ, БНБ, НСИ and имот.bg, redistributed under each publisher's
own terms, which differ from one another and from ours. A README that let a
reader think the DATA came under our
Apache grant would misrepresent someone else's rights, and it would do it in
the file most likely to be read and least likely to be tested. NOTICE and
docs/legal.md are authoritative; this keeps both front doors agreeing with them.

The same rule is held for the app's own copy by
`test_the_app_states_its_licence_and_claims_nothing_about_the_data` in
test_published_contracts.py. This is its counterpart for the repository.

Scoping: read-only, no network, runs in milliseconds.
"""

from __future__ import annotations

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
READMES = {
    "README.md": PROJECT_ROOT / "README.md",
    "README.bg.md": PROJECT_ROOT / "README.bg.md",
}

# Phrases that would describe the DATA as openly licensed. Each is a specific
# licensing claim, not a mood: "open data" and «отворени данни» are terms of
# art, and CC0 / public domain are named grants nobody here is in a position to
# make. Saying the CODE is open is fine and both files do — that is why the
# test looks for these exact phrases rather than for the word "open".
FALSE_OPENNESS_CLAIMS = (
    "open data",
    "open-data",
    "отворени данни",
    "свободни данни",
    "public domain",
    "cc0",
    "cc-by",
    "creative commons",
)


@pytest.mark.parametrize("name", sorted(READMES))
def test_both_readmes_exist_and_point_at_each_other(name: str) -> None:
    """Neither front door is a dead end for a reader who wants the other language."""
    text = READMES[name].read_text(encoding="utf-8")
    other = "README.md" if name == "README.bg.md" else "README.bg.md"
    assert f"./{other}" in text, (
        f"{name} no longer links to {other}. A reader who lands on the wrong "
        f"language has no way across, which is the whole reason there are two."
    )


@pytest.mark.parametrize("name", sorted(READMES))
def test_both_readmes_name_the_code_licence(name: str) -> None:
    text = READMES[name].read_text(encoding="utf-8")
    assert "Apache-2.0" in text, (
        f"{name} no longer names the licence. The code is Apache-2.0 and a "
        f"README is where somebody looks first — see LICENSE and NOTICE."
    )


@pytest.mark.parametrize("name", sorted(READMES))
def test_both_readmes_carry_the_data_carve_out(name: str) -> None:
    """The carve-out has to be stated, not merely not-contradicted.

    Both halves have to sit in ONE paragraph: the directory the exception
    applies to, and who the figures actually belong to. Checking the file for
    each separately is not enough — `data/published/` is named in the repo
    layout table and the publishers are named where the sources are described,
    so a version of this file with the carve-out paragraph deleted would still
    contain both. Re-word the paragraph however you like; remove it and this
    goes red.
    """
    text = READMES[name].read_text(encoding="utf-8")
    publishers = ("Eurostat", "Евростат", "НСИ", "БНБ", "ЕЦБ", "имот.bg")
    carve_out = [
        para
        for para in text.split("\n\n")
        if "data/published/" in para and sum(p in para for p in publishers) >= 3
    ]
    assert carve_out, (
        f"{name} has no paragraph naming both `data/published/` and the "
        f"publishers the figures belong to. The carve-out is a statement about "
        f"third-party rights and says nothing without both halves together."
    )
    assert "NOTICE" in text, f"{name} no longer points at NOTICE, which is the authoritative text."


@pytest.mark.parametrize("name", sorted(READMES))
def test_no_readme_describes_the_data_as_openly_licensed(name: str) -> None:
    """The half with teeth. Saying the CODE is open is fine; the DATA is not ours."""
    text = READMES[name].read_text(encoding="utf-8").lower()
    found = [claim for claim in FALSE_OPENNESS_CLAIMS if claim in text]
    assert not found, (
        f"{name} describes the data as openly licensed ({found}). The figures in "
        f"data/published/ are redistributed under each publisher's own terms — "
        f"and we hold no right to grant anyone else a licence over them. "
        f"See NOTICE and docs/legal.md."
    )
