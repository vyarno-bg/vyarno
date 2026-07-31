"""The one place the pipeline asks what day it is.

Every published payload carries an `as_of` date, and the site's staleness banner
is computed from the oldest of them. Both are statements about Bulgaria, so the
date has to be Bulgaria's — `date.today()` would hand back the runner's local
date instead, which is a different day for the two hours after midnight EET when
a refresh runs on a UTC host, and different again for a contributor in another
timezone reproducing a published file.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

#: Bulgaria's civil timezone. The published series are national statistics with
#: monthly or annual periods, so the only thing this affects is which calendar
#: day a refresh stamps itself with — but that day is what freshness is measured
#: against.
SOFIA = ZoneInfo("Europe/Sofia")


def today() -> date:
    """Return the current date in Europe/Sofia."""
    return datetime.now(SOFIA).date()
