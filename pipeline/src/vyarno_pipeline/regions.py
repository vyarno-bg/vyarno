"""The 28 Bulgarian области, and the one table that joins two publishers.

Two upstreams describe a place and neither uses the other's name for it. НСИ
publish the average wage per **област** (`Labour_1.1.2.2`), keyed by a row label
like `-Veliko Tarnovo` / «-Велико Търново». имот.bg publish the €/m² per
**град**, keyed by a URL slug like `veliko-tarnovo`. Nothing derives one from
the other, so the join is a table.

**The slugs are data, not a transliteration rule.** Probed against имот.bg's own
dropdown on 2026-08-09: «Търговище» is `targovishte` with one `г`, «Кърджали»
is `kardzhali` with one `ъ`, and a naive transliteration produces neither. Two
more that a rule would miss: «София» does not answer at
`/sredni-ceni/prodazhbi-sofiya` at all — that URL 302-redirects to the bare
`/sredni-ceni`, which is the canonical Sofia page — and «Софийска област» has no
имот.bg page of any kind, because имот.bg publishes cities and Софийска област's
towns are not among them.

So `IMOT_SLUG` is `None` for exactly one row, and that is a fact about coverage
rather than a gap to fill: a reader in Самоков gets НСИ's wage for their област
and is told plainly that имот.bg publishes no price for it, which is better than
being handed Sofia's.

**Nothing here may be computed at runtime.** `test_nsi.py` asserts that every
`NSI_EN`/`NSI_BG` label below is present in the live workbook and that the
workbook carries no district row this table does not name, and the `-m live`
test in `test_live_upstreams.py` asserts that имот.bg's own dropdown still
offers exactly the 27 Cyrillic names in `IMOT_NAME`. A city added, renamed or
retired upstream therefore fails a run rather than going quietly missing.

**No NUTS codes.** Only BG411 (Sofia-city) is established anywhere in this
repository, and publishing twenty-seven more from memory would be asserting
facts nobody here has checked — `docs/data-sources.md` §"A plausible number is
not a verified number" rule 3. The field is absent rather than guessed.
"""

from __future__ import annotations

from typing import NamedTuple


class Region(NamedTuple):
    """One област, as both publishers name it.

    `code` is this project's own key and the join between the two published
    payloads: `region_salary.json`'s district rows and `city_price.json`'s city
    rows are keyed by it, so the SPA needs no mapping of its own. It is имот.bg's
    slug wherever there is one, which makes 27 of the 28 codes a name the
    upstream already uses.

    `nsi_en` / `nsi_bg` are НСИ's row labels **verbatim**, leading hyphen and
    all — the hyphen is how their sheet distinguishes an област from the
    statistical region above it, and matching on the exact string is what stops
    a lookup for «София» finding «Софийска област».
    """

    code: str
    nsi_en: str
    nsi_bg: str
    imot_name: str | None
    imot_slug: str | None


# Probed 2026-08-09 (имот.bg dropdown, 27 cities) and 2026-08-10 (НСИ
# Labour_1.1.2.2, both editions, 28 district rows). Ordered as НСИ order them —
# by statistical region, north-west to south-central — because that is the order
# the workbook is read in and a diff against it should read straight down.
REGIONS: tuple[Region, ...] = (
    # Северозападен
    Region("vidin", "-Vidin", "-Видин", "Видин", "vidin"),
    Region("vratsa", "-Vratsa", "-Враца", "Враца", "vratsa"),
    Region("lovech", "-Lovech", "-Ловеч", "Ловеч", "lovech"),
    Region("montana", "-Montana", "-Монтана", "Монтана", "montana"),
    Region("pleven", "-Pleven", "-Плевен", "Плевен", "pleven"),
    # Северен централен
    Region(
        "veliko-tarnovo", "-Veliko Tarnovo", "-Велико Търново", "Велико Търново", "veliko-tarnovo"
    ),
    Region("gabrovo", "-Gabrovo", "-Габрово", "Габрово", "gabrovo"),
    Region("razgrad", "-Razgrad", "-Разград", "Разград", "razgrad"),
    Region("ruse", "-Ruse", "-Русе", "Русе", "ruse"),
    Region("silistra", "-Silistra", "-Силистра", "Силистра", "silistra"),
    # Североизточен
    Region("varna", "-Varna", "-Варна", "Варна", "varna"),
    Region("dobrich", "-Dobrich", "-Добрич", "Добрич", "dobrich"),
    Region("targovishte", "-Targovishte", "-Търговище", "Търговище", "targovishte"),
    Region("shumen", "-Shumen", "-Шумен", "Шумен", "shumen"),
    # Югоизточен
    Region("burgas", "-Burgas", "-Бургас", "Бургас", "burgas"),
    Region("sliven", "-Sliven", "-Сливен", "Сливен", "sliven"),
    Region("stara-zagora", "-Stara Zagora", "-Стара Загора", "Стара Загора", "stara-zagora"),
    Region("yambol", "-Yambol", "-Ямбол", "Ямбол", "yambol"),
    # Югозападен
    Region("blagoevgrad", "-Blagoevgrad", "-Благоевград", "Благоевград", "blagoevgrad"),
    Region("kyustendil", "-Kyustendil", "-Кюстендил", "Кюстендил", "kyustendil"),
    Region("pernik", "-Pernik", "-Перник", "Перник", "pernik"),
    # имот.bg publishes no page for Софийска област — see the module docstring.
    Region("sofia-oblast", "-Sofia", "-София", None, None),
    Region("sofiya", "-Sofia cap.", "-София(столица)", "София", "sofiya"),
    # Южен централен
    Region("kardzhali", "-Kardzhali", "-Кърджали", "Кърджали", "kardzhali"),
    Region("pazardzhik", "-Pazardzhik", "-Пазарджик", "Пазарджик", "pazardzhik"),
    Region("plovdiv", "-Plovdiv", "-Пловдив", "Пловдив", "plovdiv"),
    Region("smolyan", "-Smolyan", "-Смолян", "Смолян", "smolyan"),
    Region("haskovo", "-Haskovo", "-Хасково", "Хасково", "haskovo"),
)

# The Sofia-city code, named rather than repeated. Sofia-city is the one place in
# Bulgaria where имот.bg's град and НСИ's област are the same area — it is its
# own statistical region, BG411 — which is why a Sofia-only version of this app
# could pair the two figures without the geography showing.
SOFIA_CITY_CODE = "sofiya"

# Софийска област, and the reason the picker has 28 entries and the price
# payload 27. Held as a constant because two guards and one doc paragraph refer
# to "the one област with no city page" and none of them should hardcode which.
SOFIA_OBLAST_CODE = "sofia-oblast"

REGIONS_BY_CODE: dict[str, Region] = {r.code: r for r in REGIONS}
REGION_BY_NSI_EN: dict[str, Region] = {r.nsi_en: r for r in REGIONS}
REGION_BY_NSI_BG: dict[str, Region] = {r.nsi_bg: r for r in REGIONS}

# The 27 with an имот.bg page, in the same order.
PRICED_REGIONS: tuple[Region, ...] = tuple(r for r in REGIONS if r.imot_slug)
