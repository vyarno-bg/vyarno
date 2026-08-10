"""Regenerate the имот.bg page fixtures.

    python pipeline/tests/fixtures/make_imot_fixtures.py

**These are built rather than saved, and that is forced.** `www.imot.bg` answers
datacenter IPs with a 403, so neither CI nor a cloud session can capture a live
page; the shapes below are transcribed from a probe run on **2026-08-09** from a
residential connection in Bulgaria. Every structural fact they encode — the
windows-1251 encoding, the `var raioniAvgPrice` literal, the `<select
name="date">` snapshot list, the absence of any «обновен» string, the rentals
page serving the same identifier in floats, a no-data year serving no literal at
all — is from that probe.

What that means for anyone reading a green test run: these fixtures prove the
PARSER handles имот.bg's shapes, and they cannot prove имот.bg still serves
them. The live check is `test_live_upstreams.py -m live`, run from an ordinary
Bulgarian connection.

Values are deliberately not the real per-district prices. The connector
publishes a median, a mean and a range and never a district's own figure, so a
fixture carrying real district names against invented prices would be a file
that looks like data and is not. These carry generated names.
"""

from __future__ import annotations

from pathlib import Path

HERE = Path(__file__).parent

# The snapshot list имот.bg render on every page. Weekly entries; the probe
# counted 32 for 2026 running 1.1.2026 to 6.8.2026. Deliberately NOT in date
# order, because the connector must take the newest by date rather than the last
# option rendered — the order is имот.bg's to change.
SNAPSHOT_DATES = ["30.7.2026", "6.8.2026", "1.1.2026", "23.7.2026"]
NEWEST_SNAPSHOT = "6.8.2026"


def _page(title: str, districts: dict[str, float], *, dates: list[str] | None = None) -> bytes:
    """One имот.bg page, windows-1251, with the literal and the snapshot list."""
    options = "".join(
        f'<option value="{d}">{d}</option>' for d in (SNAPSHOT_DATES if dates is None else dates)
    )
    rows = ",\n    ".join(f"'{name}': {value}" for name, value in districts.items())
    html = f"""<!DOCTYPE html>
<html lang="bg">
<head><title>{title} | Imot.bg</title>
<meta http-equiv="Content-Type" content="text/html; charset=windows-1251">
</head>
<body>
<div class="container">
  <h1>{title}</h1>
  <form method="get">
    <select name="date">{options}</select>
    <select name="year"><option value="2026">2026</option></select>
  </form>
  <script>
  var colors = [[0,"#00009f"],[700,"#5465fc"],[1000,"#6a9cf3"]];
  var raioniAvgPrice = {{
    {rows}
  }};
  </script>
</div>
</body>
</html>
"""
    return html.encode("windows-1251")


def _no_literal_page(title: str) -> bytes:
    """A year имот.bg has no data for: 200, the form shell, and no literal.

    The probe measured these at ~28 kB against ~100 kB for a data year. The
    absence of the literal is the signal, not the size.
    """
    options = "".join(f'<option value="{d}">{d}</option>' for d in SNAPSHOT_DATES)
    html = f"""<!DOCTYPE html>
<html lang="bg">
<head><title>{title} | Imot.bg</title>
<meta http-equiv="Content-Type" content="text/html; charset=windows-1251">
</head>
<body>
<div class="container">
  <h1>{title}</h1>
  <form method="get"><select name="date">{options}</select></form>
  <p>Няма данни за избраната година.</p>
</div>
</body>
</html>
"""
    return html.encode("windows-1251")


def main() -> None:
    # The biggest city, so the parse meets the largest district count and the
    # widest value range. Sofia's live page carried 141 districts at 1108-5747
    # on the probe date.
    big = {f"Квартал {i}": 1100 + i * 33 for i in range(141)}
    (HERE / "imot_city_large.html").write_bytes(_page("Средни цени в София", big))

    # The smallest, which is what the flat 20-district floor used to reject
    # outright. Търговище served 8 districts at 1002-1342.
    small = {f"Район {i}": 1002 + i * 48 for i in range(8)}
    (HERE / "imot_city_small.html").write_bytes(_page("Средни цени в Търговище", small))

    # A page carrying values on both sides of the sanity bounds. The historical
    # sentinels the probe found are 0, 4, 5, 6, 9, 13 — these stand in for them.
    with_junk = {f"Район {i}": 900 + i * 40 for i in range(18)}
    with_junk["Промишлена зона"] = 9
    with_junk["Стопански двор"] = 0
    (HERE / "imot_city_with_sentinels.html").write_bytes(_page("Средни цени в Русе", with_junk))

    # Rentals: the same identifier, floats, every value below 100.
    rentals = {f"Квартал {i}": round(4.5 + i * 0.83, 2) for i in range(20)}
    (HERE / "imot_rentals.html").write_bytes(_page("Наеми в София", rentals))

    (HERE / "imot_no_data_year.html").write_bytes(_no_literal_page("Средни цени в Ловеч"))

    # A page whose date list cannot be parsed. имот.bg have always rendered one,
    # so this is the defensive branch rather than an observed shape: the prices
    # are still real and the payload says `snapshot_date: null` instead of
    # claiming a day.
    (HERE / "imot_no_date_list.html").write_bytes(_page("Средни цени", small, dates=[]))

    print(f"wrote 6 fixtures to {HERE}")


if __name__ == "__main__":
    main()
