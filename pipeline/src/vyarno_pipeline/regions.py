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

So `imot_slug` is `None` for exactly one row, and that is a fact about coverage
rather than a gap to fill: a reader in Самоков gets НСИ's wage for their област
and is told plainly that имот.bg publishes no price for it, which is better than
being handed Sofia's.

**Nothing here may be computed at runtime.** `test_nsi.py` asserts that every
`NSI_EN`/`NSI_BG` label below is present in the live workbook and that the
workbook carries no district row this table does not name, and the `-m live`
test in `test_live_upstreams.py` asserts that имот.bg's own dropdown still
offers exactly the 27 Cyrillic names in `city_bg`. A city added, renamed or
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

    `city_bg` is имот.bg's own dropdown value and `city_en` НСИ's English label
    for the same place, both published rather than transliterated. They differ
    from `nsi_bg`/`nsi_en` in one row and it is the important one: НСИ call
    BG411 «-София(столица)» because in their table it is an област, while
    имот.bg's page is the city of София. Everywhere else the област and its
    capital share a name, which is exactly what makes the distinction easy to
    lose — and «Sofia» rather than «Sofia cap.» is what this project already
    published for that city.

    `imot_districts` is how many districts имот.bg served for that city on the
    probe date above, and 0 for the one with no page. It is the district floor's
    REFERENCE, never a count the parse has to match — `sources/imot.py` carries
    why the guard is a share of it, and why a share is what tells имот.bg
    retiring two districts apart from a regex catching a fragment.
    """

    code: str
    nsi_en: str
    nsi_bg: str
    city_bg: str | None
    city_en: str | None
    imot_slug: str | None
    imot_districts: int


# Probed 2026-08-09 (имот.bg dropdown, 27 cities) and 2026-08-10 (НСИ
# Labour_1.1.2.2, both editions, 28 district rows). Ordered as НСИ order them —
# by statistical region, north-west to south-central — because that is the order
# the workbook is read in and a diff against it should read straight down.
REGIONS: tuple[Region, ...] = (
    # Северозападен
    Region("vidin", "-Vidin", "-Видин", "Видин", "Vidin", "vidin", 19),
    Region("vratsa", "-Vratsa", "-Враца", "Враца", "Vratsa", "vratsa", 15),
    Region("lovech", "-Lovech", "-Ловеч", "Ловеч", "Lovech", "lovech", 7),
    Region("montana", "-Montana", "-Монтана", "Монтана", "Montana", "montana", 10),
    Region("pleven", "-Pleven", "-Плевен", "Плевен", "Pleven", "pleven", 11),
    # Северен централен
    Region(
        "veliko-tarnovo",
        "-Veliko Tarnovo",
        "-Велико Търново",
        "Велико Търново",
        "Veliko Tarnovo",
        "veliko-tarnovo",
        11,
    ),
    Region("gabrovo", "-Gabrovo", "-Габрово", "Габрово", "Gabrovo", "gabrovo", 15),
    Region("razgrad", "-Razgrad", "-Разград", "Разград", "Razgrad", "razgrad", 11),
    Region("ruse", "-Ruse", "-Русе", "Русе", "Ruse", "ruse", 26),
    Region("silistra", "-Silistra", "-Силистра", "Силистра", "Silistra", "silistra", 9),
    # Североизточен
    Region("varna", "-Varna", "-Варна", "Варна", "Varna", "varna", 69),
    Region("dobrich", "-Dobrich", "-Добрич", "Добрич", "Dobrich", "dobrich", 23),
    Region(
        "targovishte", "-Targovishte", "-Търговище", "Търговище", "Targovishte", "targovishte", 8
    ),
    Region("shumen", "-Shumen", "-Шумен", "Шумен", "Shumen", "shumen", 21),
    # Югоизточен
    Region("burgas", "-Burgas", "-Бургас", "Бургас", "Burgas", "burgas", 27),
    Region("sliven", "-Sliven", "-Сливен", "Сливен", "Sliven", "sliven", 11),
    Region(
        "stara-zagora",
        "-Stara Zagora",
        "-Стара Загора",
        "Стара Загора",
        "Stara Zagora",
        "stara-zagora",
        26,
    ),
    Region("yambol", "-Yambol", "-Ямбол", "Ямбол", "Yambol", "yambol", 15),
    # Югозападен
    Region(
        "blagoevgrad",
        "-Blagoevgrad",
        "-Благоевград",
        "Благоевград",
        "Blagoevgrad",
        "blagoevgrad",
        13,
    ),
    Region("kyustendil", "-Kyustendil", "-Кюстендил", "Кюстендил", "Kyustendil", "kyustendil", 11),
    Region("pernik", "-Pernik", "-Перник", "Перник", "Pernik", "pernik", 22),
    # имот.bg publishes no page for Софийска област — see the module docstring.
    Region("sofia-oblast", "-Sofia", "-София", None, None, None, 0),
    Region("sofiya", "-Sofia cap.", "-София(столица)", "София", "Sofia", "sofiya", 141),
    # Южен централен
    Region("kardzhali", "-Kardzhali", "-Кърджали", "Кърджали", "Kardzhali", "kardzhali", 8),
    Region("pazardzhik", "-Pazardzhik", "-Пазарджик", "Пазарджик", "Pazardzhik", "pazardzhik", 13),
    Region("plovdiv", "-Plovdiv", "-Пловдив", "Пловдив", "Plovdiv", "plovdiv", 41),
    Region("smolyan", "-Smolyan", "-Смолян", "Смолян", "Smolyan", "smolyan", 9),
    Region("haskovo", "-Haskovo", "-Хасково", "Хасково", "Haskovo", "haskovo", 19),
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

# The 27 with an имот.bg page, in the same order.
PRICED_REGIONS: tuple[Region, ...] = tuple(r for r in REGIONS if r.imot_slug)
