"""When each upstream publishes, and the window we watch it in.

**No arm may guess a day.** None of these five publishers fixes its release
date a month ahead: Eurostat loaded the July unemployment rate on 2026-08-12,
НСИ uploaded the 2026-Q2 wage workbooks on 2026-08-11 at 10:54 Sofia and the
housing three on 2026-06-23, and the ЕЦБ's MIR release lands anywhere between
the last day of M+1 and the 5th of M+2. A single scheduled shot set late enough
to be safe is days behind a figure that is in every Bulgarian newsroom the
morning it lands; set on the release it reads an upstream that has not moved
and then publishes nothing for a whole period.

So this table says, per upstream cube or file, what marker moves when its
publisher releases, which timezone that publisher quotes its hour in, and which
days of which months to expect it. `watch.py` probes exactly those inside their
own window and dispatches the arm the moment the marker passes the arm's last
run, which puts a refresh pull request up within about ten minutes of the
release. The cron in each `refresh-<source>.yml` is a backstop for a broken
watcher and nothing else — it fires after the window has closed, which is the
last hour at which running unconditionally is still right.

**`observed` is evidence, not a promise.** It is an instant somebody watched a
publisher hit, dated so the next reader knows how old the observation is. Widen
a window rather than trimming it to the one release that was seen: a probe
costs a single HTTP request and a window that closes too early costs a period.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Eurostat quote their release hour in Luxembourg local time and the ЕЦБ theirs
# in Frankfurt; both keep CET/CEST, so one zone answers for the pair. НСИ and
# БНБ quote Sofia, which is an hour further east and shifts on the same dates.
CET = "Europe/Brussels"
EET = "Europe/Sofia"

# What a probe reads. `EUROSTAT_UPDATED` is the `updated` field every ND-cube
# response carries; `HTTP_LAST_MODIFIED` is the header, which is what the ЕЦБ's
# SDMX service, НСИ's portal and БНБ's document server all answer a HEAD with.
EUROSTAT_UPDATED = "eurostat-updated"
HTTP_LAST_MODIFIED = "http-last-modified"

# Restated from `sources/eurostat.py#BASE` and `sources/ecb.py#BASE` rather than
# imported: a probe has to run before the pipeline is installed, so nothing here
# may import a module that reaches httpx. `test_release_calendar.py` holds the
# two copies together.
ESTAT_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
ECB_BASE = "https://data-api.ecb.europa.eu/service/data"
NSI_TIMESERIES = "https://www.nsi.bg/sites/default/files/files/data/timeseries"
BNB_DOWNLOAD = "https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download"

# Eurostat publish a news release at 11:00 and load everything else in batches
# that have run at 09:0x and at 23:00 — of 1,225 updates in their own
# `statistics-update.rss` feed on 2026-08-19, 758 carried 11:00, 288 carried
# 23:00 and the rest 09:01–09:34. The morning band covers both daytime
# instants; the night band is the batch, and on its own it is enough for a cube
# that has only ever moved in one.
ESTAT_BANDS = ((time(8, 45), time(11, 45)), (time(22, 45), time(23, 45)))
ESTAT_NIGHT_BAND = ((time(22, 45), time(23, 45)),)

# The ЕЦБ stamp a release 10:00 Frankfurt to the second — MIR, BSI and CBD2 all
# answered `08:00:00 GMT` on their last publication when read in August 2026.
ECB_BANDS = ((time(9, 45), time(10, 45)),)

# НСИ and БНБ publish to a calendar that names the day but not the hour, and
# the file appears before the announcement does: 10:08 and 10:54 Sofia for the
# two wage workbooks on 2026-08-11, 12:05 for the housing three on 2026-06-23,
# 11:36–11:41 for БНБ's rate sheets on 2026-07-27. The band brackets all five.
SOFIA_BANDS = ((time(9, 0), time(13, 0)),)


@dataclass(frozen=True)
class Release:
    """One upstream cube or file, and when its publisher has been seen to move it.

    `months` empty means every month. `days` are days of the month in the
    publisher's own timezone, which is also where `bands` are read — a window
    written in UTC would drift by an hour twice a year against the release it
    is meant to bracket.
    """

    label: str
    url: str
    marker: str
    tz: str
    months: tuple[int, ...]
    days: tuple[int, ...]
    bands: tuple[tuple[time, time], ...]
    observed: str

    def due(self, now: datetime) -> bool:
        """Is `now` inside this release's own window?"""
        local = now.astimezone(ZoneInfo(self.tz))
        if self.months and local.month not in self.months:
            return False
        if local.day not in self.days:
            return False
        clock = local.time()
        return any(start <= clock < end for start, end in self.bands)


def _estat(dataset: str) -> str:
    """One cell of a cube — the cheapest request that still carries `updated`.

    `geo=BG&lastTimePeriod=1` answers in about 4 kB. The `updated` field is the
    dataset's, not the cell's, so the filter costs nothing in precision.
    """
    return f"{ESTAT_BASE}/{dataset}?format=JSON&geo=BG&lastTimePeriod=1"


def _ecb(dataflow: str, series_key: str) -> str:
    """One observation of one series. Read with HEAD; only the header matters."""
    return f"{ECB_BASE}/{dataflow}/{series_key}?lastNObservations=1&format=jsondata"


# The upstreams each arm depends on, and the window each is watched in.
#
# An arm appears once per upstream calendar rather than once per file, because
# the calendars genuinely differ: `house-market` reads three quarterly property
# cubes released in the month after the quarter AND three structure cubes that
# move with the annual EU-SILC round, and watching the second set on the first
# set's days would never see them.
WATCHED: dict[str, tuple[Release, ...]] = {
    "hicp": (
        Release(
            label="prc_hicp_minr — rate and index",
            url=_estat("prc_hicp_minr"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            # Two releases a month reach this one cube, so the window is two
            # spans. The flash lands on the month's own last working day and
            # carries BG's all-items rate ahead of the rest — the figure every
            # newsroom runs, published alone under `is_flash` by
            # `cli.py#_refresh_hicp`. The full release fills in the index and
            # the divisions around the middle of the following month. Watch
            # only the second span and no flash headline is ever published:
            # the full release replaces it before that shot fires.
            months=(),
            days=(15, 16, 17, 18, 19, 20, 26, 27, 28, 29, 30, 31, 1, 2, 3),
            bands=ESTAT_BANDS,
            observed="2026-07-31 11:00 Brussels — July flash, the rate only",
        ),
        Release(
            label="prc_hicp_iw — basket weights",
            url=_estat("prc_hicp_iw"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(),
            days=(15, 16, 17, 18, 19, 20),
            bands=ESTAT_BANDS,
            # The vintage that matters arrives about late February, but the
            # cube is re-loaded through the year and a weight change moves
            # every category figure, so it is watched on the same days as the
            # rates it has to share a vintage with.
            observed="2026-07-18 11:00 Brussels",
        ),
    ),
    "unemployment": (
        Release(
            label="une_rt_m",
            url=_estat("une_rt_m"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(),
            days=tuple(range(1, 21)),
            bands=ESTAT_BANDS,
            observed="2026-08-12 23:00 Brussels — July rate",
        ),
    ),
    "house-market": (
        Release(
            label="prc_hpi_hsnq — dwellings sold",
            url=_estat("prc_hpi_hsnq"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(1, 4, 7, 10),
            days=tuple(range(1, 15)),
            bands=ESTAT_BANDS,
            observed="2026-07-02 11:00 Brussels — 2026-Q1",
        ),
        Release(
            label="prc_hpi_hsvq — what was paid for them",
            url=_estat("prc_hpi_hsvq"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(1, 4, 7, 10),
            days=tuple(range(1, 15)),
            bands=ESTAT_BANDS,
            # A week behind the other two on the same quarter. Watching the
            # three cubes as one release would mean waiting for the slowest:
            # separately, the run on the 2nd finds the value cube still a
            # quarter back, pairs on the quarters both carry and publishes
            # nothing, and the run on the 9th publishes the new quarter.
            observed="2026-07-09 23:00 Brussels — 2026-Q1, a week behind hsnq",
        ),
        Release(
            label="prc_hpi_q — house price index",
            url=_estat("prc_hpi_q"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(1, 4, 7, 10),
            days=tuple(range(1, 15)),
            bands=ESTAT_BANDS,
            observed="2026-07-02 11:00 Brussels — 2026-Q1",
        ),
        Release(
            label="tipsho30 — deflated house price index",
            url=_estat("tipsho30"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(1, 4, 7, 10),
            days=tuple(range(1, 15)),
            bands=ESTAT_BANDS,
            observed="2026-07-02 11:00 Brussels — 2026-Q1",
        ),
        Release(
            label="ilc_lvho02 — tenure",
            url=_estat("ilc_lvho02"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(5, 6),
            days=tuple(range(1, 32)),
            bands=ESTAT_BANDS,
            # EU-SILC's annual round, whose day inside the round Eurostat do
            # not fix — two whole months of window rather than a guessed
            # fortnight. A round that slipped past June is caught by the wide
            # sweep instead, which is what that sweep is for.
            observed="2026-06-11 23:00 Brussels",
        ),
        Release(
            label="ilc_lvho07a — housing cost overburden",
            url=_estat("ilc_lvho07a"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(5, 6),
            days=tuple(range(1, 32)),
            bands=ESTAT_BANDS,
            observed="2026-06-08 23:00 Brussels",
        ),
        Release(
            label="cens_21dwob_r3 — 2021 census dwelling stock",
            url=_estat("cens_21dwob_r3"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(5,),
            days=tuple(range(1, 32)),
            bands=ESTAT_NIGHT_BAND,
            # A census cube: it moves when the round is revised and not
            # otherwise, so it is watched in the batch that carried the last
            # revision and nowhere else.
            observed="2025-05-21 23:00 Brussels",
        ),
    ),
    "salary-dist": (
        Release(
            label="earn_ses_monthly — the ladder's shape",
            url=_estat("earn_ses_monthly"),
            marker=EUROSTAT_UPDATED,
            tz=CET,
            months=(2, 3, 4, 5),
            days=tuple(range(1, 32)),
            bands=ESTAT_NIGHT_BAND,
            # SES is disseminated every four years and has only ever moved in
            # the night batch, so one band a day is the whole watch. The next
            # wave is 2026's, transmitted April 2028 (`docs/data-sources.md`
            # §"Update watch-list").
            observed="2026-02-09 23:00 Brussels",
        ),
    ),
    "mortgage": (
        Release(
            label="ЕЦБ MIR — new-business housing rates",
            url=_ecb("MIR", "M.BG.B.A2C.A.R.A.2250.EUR.N"),
            marker=HTTP_LAST_MODIFIED,
            tz=CET,
            months=(),
            days=(26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8),
            bands=ECB_BANDS,
            # Month M lands between the last day of M+1 and the 5th of M+2.
            observed="2026-07-31 10:00 Frankfurt — June",
        ),
        Release(
            label="БНБ s_ir_loan_oa_hh_bg.xlsx — outstanding housing stock",
            url=f"{BNB_DOWNLOAD}/s_ir_loan_oa_hh_bg.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(),
            days=(24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8),
            bands=SOFIA_BANDS,
            observed="2026-07-27 11:40 Sofia",
        ),
    ),
    "credit": (
        Release(
            label="ЕЦБ MIR — consumer, overdraft, card and corporate rates",
            url=_ecb("MIR", "M.BG.B.A2B.A.R.A.2250.EUR.N"),
            marker=HTTP_LAST_MODIFIED,
            tz=CET,
            months=(),
            days=(26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8),
            bands=ECB_BANDS,
            observed="2026-07-31 10:00 Frankfurt — June",
        ),
        Release(
            label="ЕЦБ BSI — deposit and loan levels",
            url=_ecb("BSI", "M.BG.N.A.A20.A.1.U6.2250.Z01.E"),
            marker=HTTP_LAST_MODIFIED,
            tz=CET,
            months=(),
            days=(24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5),
            bands=ECB_BANDS,
            # Its own release, four days ahead of MIR's on the same month. The
            # arm gates BSI's reference period against MIR's, so catching one
            # without the other is a run that publishes nothing, not a payload
            # with a level a month older than the rate beside it.
            observed="2026-07-27 10:00 Frankfurt",
        ),
        Release(
            label="ЕЦБ CBD2 — household NPL ratio",
            url=_ecb("CBD2", "Q.BG.W0.67.S1M._Z.A.F.I3632._Z._Z._Z._Z._Z._Z.PC"),
            marker=HTTP_LAST_MODIFIED,
            tz=CET,
            months=(),
            days=tuple(range(1, 9)),
            bands=ECB_BANDS,
            # Quarterly, and the ЕЦБ do not tie it to the MIR release, so it is
            # watched over the first week of every month instead.
            observed="2026-08-07 10:00 Frankfurt",
        ),
        Release(
            label="БНБ s_ir_ovdr_cc_oa_hh_bg.xlsx — revolving balances",
            url=f"{BNB_DOWNLOAD}/s_ir_ovdr_cc_oa_hh_bg.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(),
            days=(24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8),
            bands=SOFIA_BANDS,
            observed="2026-07-27 11:41 Sofia",
        ),
        Release(
            label="БНБ s_ir_loan_nbf_hh_bg.xlsx — non-financial household loans",
            url=f"{BNB_DOWNLOAD}/s_ir_loan_nbf_hh_bg.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(),
            days=(24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8),
            bands=SOFIA_BANDS,
            observed="2026-07-27 11:36 Sofia",
        ),
    ),
    "region-salary": (
        Release(
            label="НСИ Labour_1.1.2.2_EUR.xlsx — wage by област",
            url=f"{NSI_TIMESERIES}/Labour_1.1.2.2_EUR.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(2, 5, 8, 11),
            days=tuple(range(5, 21)),
            bands=SOFIA_BANDS,
            # About six weeks after the quarter closes, on a day НСИ's own
            # calendar moves: the 11th for 2026-Q2, the 15th historically.
            observed="2026-08-11 10:54 Sofia — 2026-Q2",
        ),
        Release(
            label="НСИ Labour_1.1.2.2_EUR_EN.xlsx — the English edition",
            url=f"{NSI_TIMESERIES}/Labour_1.1.2.2_EUR_EN.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(2, 5, 8, 11),
            days=tuple(range(5, 21)),
            bands=SOFIA_BANDS,
            # Both editions are read and they are uploaded 45 minutes apart, so
            # the arm is watched on whichever moves first and the run reads the
            # pair the connector already reconciles.
            observed="2026-08-11 10:08 Sofia — 2026-Q2",
        ),
    ),
    "sector-salary": (
        Release(
            label="НСИ Labour_1.1.2.1_EUR.xlsx — wage by economic activity",
            url=f"{NSI_TIMESERIES}/Labour_1.1.2.1_EUR.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(2, 5, 8, 11),
            days=tuple(range(5, 21)),
            bands=SOFIA_BANDS,
            observed="2026-08-11 10:54 Sofia — 2026-Q2",
        ),
        Release(
            label="НСИ Labour_1.1.2.1_EUR_EN.xlsx — the English edition",
            url=f"{NSI_TIMESERIES}/Labour_1.1.2.1_EUR_EN.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(2, 5, 8, 11),
            days=tuple(range(5, 21)),
            bands=SOFIA_BANDS,
            observed="2026-08-11 10:08 Sofia — 2026-Q2",
        ),
    ),
    "nsi-housing": (
        Release(
            label="НСИ HPI_1.3.xlsx — national price index",
            url=f"{NSI_TIMESERIES}/HPI_1.3.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(3, 6, 9, 12),
            days=tuple(range(18, 29)),
            bands=SOFIA_BANDS,
            # About a week ahead of Eurostat disseminating the same statistic,
            # which is what the cross-publisher gate reconciles against at the
            # newest quarter both carry.
            #
            # The three housing URLs are built here where the connector
            # discovers its own off НСИ's topic pages, and the asymmetry is
            # safe in this direction only: a probe that 404s reports a failed
            # probe and a red tick, which is the signal to go and look. A
            # CONNECTOR that guessed could resolve to a different vintage and
            # publish it, which is why it does not guess.
            observed="2026-06-23 12:05 Sofia — 2026-Q1",
        ),
        Release(
            label="НСИ HPI_2.6.xlsx — six-city price index",
            url=f"{NSI_TIMESERIES}/HPI_2.6.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(3, 6, 9, 12),
            days=tuple(range(18, 29)),
            bands=SOFIA_BANDS,
            observed="2026-06-23 12:05 Sofia — 2026-Q1",
        ),
        Release(
            label="НСИ HSI_2.4.5.xlsx — six-city sales count",
            url=f"{NSI_TIMESERIES}/HSI_2.4.5.xlsx",
            marker=HTTP_LAST_MODIFIED,
            tz=EET,
            months=(3, 6, 9, 12),
            days=tuple(range(18, 29)),
            bands=SOFIA_BANDS,
            observed="2026-06-23 12:05 Sofia — 2026-Q1",
        ),
    ),
}

# The two arms nothing watches, and why watching them would say nothing.
NOT_WATCHED: dict[str, str] = {
    "payroll": (
        "There is no upstream to poll. The constants are a dated legislative "
        "table edited by hand and the one fetch is the ТЗПБ appendix, which "
        "changes when a new ЗБДОО is promulgated and not on any day a probe "
        "could read off a header. What decides this arm is a statutory "
        "boundary, so its cron fires at Sofia midnight instead."
    ),
    "city-price": (
        "имот.bg answers a datacenter IP with a 403, so neither a probe nor a "
        "refresh can run on a hosted runner at all. Refreshed by hand from an "
        'ordinary Bulgarian connection (docs/data-sources.md §"Where you '
        "fetch from is part of the connector's design\")."
    ),
}

# The cron each `refresh-<source>.yml` carries, and it is a backstop: the
# watcher is how data arrives, this is what runs if the watcher is broken.
#
# **Every one fires after its window has closed**, which is the only time left
# at which running unconditionally is still right — inside the window the
# watcher either has already fired or will, and a duplicate run costs a wasted
# fetch. 12:xx UTC sits outside the hours `WATCH_CRON` polls, so a backstop and
# a watch tick never open the same upstream on the same minute.
BACKSTOP: dict[str, tuple[str, ...]] = {
    # Two windows, two backstops: the flash the papers run, then the full cube.
    "hicp": ("20 12 4 * *", "20 12 21 * *"),
    "unemployment": ("30 12 21 * *",),
    "house-market": ("40 12 15 1,4,7,10 *",),
    "salary-dist": ("50 12 1 6 *",),
    "mortgage": ("20 12 9 * *",),
    "credit": ("30 12 9 * *",),
    "region-salary": ("40 12 21 2,5,8,11 *",),
    "sector-salary": ("50 12 21 2,5,8,11 *",),
    "nsi-housing": ("20 12 29 3,6,9,12 *",),
    # Not a backstop — the whole schedule. `clock.py` stamps `as_of` in Sofia,
    # so 22:05 UTC on the last day of a month is 00:05 on the 1st there and the
    # run picks up the entry that came into force five minutes earlier. Firing
    # on the 1st in UTC would be two hours later for no gain; firing before
    # 22:00 UTC would publish the table the new law replaced.
    "payroll": ("5 22 28,29,30,31 * *",),
}

# When `watch.yml` looks. The first line is the release watch: every ten
# minutes across the UTC hours any window in this table can occupy, offset off
# the hour because a run scheduled at :00 is the one GitHub delays under load.
# The second is a wide sweep that probes every upstream regardless of window,
# because a correction lands on no calendar and is still a figure to be first
# with. `test_release_calendar.py` holds the first line to `utc_hours()`.
WATCH_CRON = "5-55/10 6-10,20-22 * * *"
SWEEP_CRON = "40 1,5,9,13,17,21 * * *"


def releases_due(now: datetime) -> dict[str, tuple[Release, ...]]:
    """Every watched upstream whose own window contains `now`, by source."""
    due = {source: tuple(r for r in releases if r.due(now)) for source, releases in WATCHED.items()}
    return {source: releases for source, releases in due.items() if releases}


def utc_hours(year: int) -> set[int]:
    """The UTC hours any window in this table occupies over one whole year.

    Computed rather than written down, because the answer depends on two
    daylight-saving transitions that do not fall on the same dates every year
    and on bands quoted in two different zones. A cron hour list maintained by
    hand goes stale the first time a band moves by fifteen minutes.
    """
    hours: set[int] = set()
    cursor = datetime(year, 1, 1, tzinfo=UTC)
    end = datetime(year + 1, 1, 1, tzinfo=UTC)
    step = timedelta(minutes=10)
    while cursor < end:
        if any(r.due(cursor) for releases in WATCHED.values() for r in releases):
            hours.add(cursor.hour)
        cursor += step
    return hours


def payload_stems(source: str, stems: list[str]) -> list[str]:
    """The published stems `--source {source}` owns, out of `stems`.

    The rule is `refresh.yml`'s — swap hyphens for underscores and keep stems
    equal to that or starting with it — and it lives there because that is the
    workflow whose commit step depends on it. Restated here only as a call.
    """
    prefix = source.replace("-", "_")
    return [stem for stem in stems if stem == prefix or stem.startswith(prefix)]
