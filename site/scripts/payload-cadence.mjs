#!/usr/bin/env node
/**
 * Every payload's stem and the cadence it is expected to refresh on, as JSON.
 *
 * The two refresh workflows decide when a payload has gone quiet, and neither
 * can read `PAYLOADS` — one is a Python heredoc and the other is
 * `actions/github-script`. So this prints the one table for them rather than
 * letting either carry a number of its own.
 *
 * **A single threshold cannot serve these rhythms, and using one turns the
 * alert into noise.** HICP is monthly, the Eurostat property cubes and НСИ's
 * wage tables are quarterly, and the SES ladder behind `salary_dist` is
 * disseminated every four years. Held to a flat thirty days, a healthy
 * quarterly payload is reported stale for sixty-one days out of every
 * ninety-one and `salary_dist` for all but a month of four years — a weekly
 * alert that is wrong two weeks in three is one a maintainer stops opening,
 * and it is the only thing watching for an arm that has silently stopped
 * firing. `freshness-check.yml`'s own header makes that argument about its
 * import list; the threshold underneath it is the same failure.
 *
 * The verdict here is "past its own cadence", which is `payloadStatus`'s *due*
 * rather than its *overdue*. That is deliberate and it is the headroom: the
 * page raises its banner at `OVERDUE_MULTIPLE` × the same cadence, so the
 * alert reaches a maintainer while a reader is still being served a figure
 * nothing has called late (`view/freshness.js`).
 *
 * Prints `{"<stem>": <days>, …}` on stdout and nothing else, because a
 * workflow parses it.
 */
import { PAYLOADS } from "../src/lib/payloads.js";

process.stdout.write(
  JSON.stringify(Object.fromEntries(PAYLOADS.map((p) => [p.file, p.cadenceDays])))
);
