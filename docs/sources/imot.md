# имот.bg — `sources/imot.py`

The only per-city €/m² **level** on the site, and the only connector that cannot
run on a hosted runner. There is no machine-readable BG €/m² level series
anywhere: Eurostat's `hpi_ndh_q` and `prc_hpi_q` are rate-of-change indices, НСИ
publishes none in API form, БНБ none at all. имот.bg's public `sredni-ceni` pages
publish a per-district average they compute themselves from current listings, and
no city figure, so the median across districts is taken where the districts are
read.

[`data-sources.md`](../data-sources.md) is the index, the cross-cutting rules and
the checklist for adding a connector. **The connector's own docstring carries the
mechanics** — the `raioniAvgPrice` literal in `windows-1251` extracted by regex
with no JS execution, the 403 on datacenter IPs, and the four things it must not
do, each with its named guard.

**Everything below was probed on 2026-08-09** from a residential connection in
Bulgaria, across all 27 cities and every archive year each of them serves.

**27 cities**, each at `https://www.imot.bg/sredni-ceni/prodazhbi-{slug}`. София
is the exception: her canonical page is the bare `/sredni-ceni`, and
`prodazhbi-sofiya` 302-redirects there. The Cyrillic→slug map is a dated table in
`regions.py` because it cannot be computed — «Търговище» is `targovishte` with
one `г` and «Кърджали» is `kardzhali` with one `ъ`. The 28th област, Софийска,
has no имот.bg page of any kind; a reader who picks it is told so rather than
handed София's figure.

## What имот.bg say the number is, and what they do not

**Unsettled, and it cannot be settled from here.** Every figure this connector
publishes rests on `raioniAvgPrice` being an average asking price per district,
and имот.bg publish no methodology for it: not what population of listings it
averages, not over what window, not whether a flat advertised by three agencies
counts once or three times, and not whether it is a mean or something else. The
variable name and the page's «Средни цени» heading are all there is, and neither
is a method statement. `/sredni-ceni/prodazhbi-` versus `/sredni-ceni/naemi-` is
a sale-versus-rent split of a classifieds portal's own listings rather than of
concluded deals — имот.bg have no deed data — which is the evidence behind «цени
по обяви, не по сделки», and it is an inference from what имот.bg is rather than
a sentence they wrote.

**This one cannot be re-read from a build environment at all**, which is a
finding rather than an excuse: `www.imot.bg` answers a datacenter IP with 403 on
every path including `/robots.txt` (re-probed **2026-08-13**), and the fixtures
under `pipeline/tests/fixtures/` are **built rather than saved**, so the
repository deliberately holds no copy of their page to read a caption off. What
would settle it: one read of a `sredni-ceni` page from an ordinary Bulgarian
connection looking for any statement of method, plus `/obshti-uslovia`. Until
then the copy may describe the figure's CLASS — an asking price, имот.bg's own,
not a transaction — and may not describe a method.

**`year=` is safe and `date=` is not, and that asymmetry is the most important
thing about the two parameters.** A year имот.bg has no data for returns 200 with
**no literal at all** and a page about a quarter of the usual size, so the parse
fails loudly. An invalid, future or out-of-range `date=` is silently ignored and
the response is byte-identical to the no-parameter baseline — today's numbers
under an old date, with every downstream gate passing because the file is
internally consistent. The connector never sends `date=` at all, and a test over
every URL it can build holds that.

**The page's own `<select name="date">` is the provenance anchor.** Its newest
option — taken by date, not by position, because the order is имот.bg's to change
— is their published snapshot date, and it is what `snapshot_date` carries. That
is a stronger claim than the fetch date: "the day they published" rather than
"the day we looked". Where the list cannot be parsed the field is `null` and the
SPA dates the card by `as_of`, which is a weaker claim honestly stated rather
than the same one.

**There is no «обновена на» field and there never was.** Probed across all 27
cities for the current year plus София back to 2000: **zero pages contain the
substring «обновен»** in any case.

## Which years each city publishes

A year qualifies when it has **at least 6 districts and at least 40% of what that
city publishes in the current year**, and the published window is the **unbroken**
run of qualifying years ending at the current one. All three parts are computed
per city at refresh time; none is a constant.

**The thin early years are wrong rather than merely imprecise.** имот.bg's
coverage grew over two decades, and a median over four districts is not the same
measurement as a median over thirteen: inside the thin years a city's median
moves year over year by multiples of anything a price series does. Those are
sampling artefacts wearing the clothes of price moves, and no gate downstream
would catch one — the file would be internally consistent.

**The unbroken-run clause does most of the work.** A city whose coverage
collapses for a year and recovers has not been measured the same way throughout,
so everything before the gap is disqualified, which drops a city's earliest years
without anyone choosing a cut-off for it.

**Which threshold decides is a fact about city size, worth knowing before either
number is touched.** They cross at 15 districts (6 ÷ 0.40): below that the flat 6
binds and the share clause is slack, above it the share decides. So a small
city's year is admitted on 6 districts however small a share of its own total —
which is the rule working rather than a hole in it, because the flat floor is
what makes a small city's history publishable at all.

What it costs: the largest year-over-year move left inside any published window
is a reading over a floor-sized sample, and nothing on the card says so.
`n_districts` travels on every historical row of `city_price.json` and appears on
no screen, so it is inside the «+X% от YEAR» the card prints. Whether it is a
price move or a composition change cannot be told from the payload, and
tightening either threshold is not a decision to take from the file — it needs
the per-city-year district counts from a live probe, which this repository does
not carry.

Below **five** consecutive years the payload sets `trend_publishable: false` and
the SPA shows the €/m² without a «since YEAR» sentence. The chart still carries
every qualifying year: the data is not in doubt, there is simply not enough of it
to call a trend.

## The sanity bounds, and why they do not widen

Drop any value outside `[100, 10000] €/m²`. The sub-100 values in the history are
**sentinels, not cheap flats** — single-digit €/m² readings, zeros among them —
so widening the band to `[10, 100_000]` would admit some of them and reject
others, which is an arbitrary line through a set of values that are uniformly
junk. `AGENTS.md` forbids widening it in terms.
