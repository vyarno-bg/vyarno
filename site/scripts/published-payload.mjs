/**
 * One reader for `data/published/*.json`, for every suite that opens one.
 *
 * ## Absent is null, malformed throws, and the difference is the whole point
 *
 * A payload that is not there is a checkout nobody has run a refresh in. A
 * suite that cannot find one has nothing to assert about it, so `null` lets it
 * say so and move on, and the guard clauses that read
 * `if (!headline) return;` are written against exactly that.
 *
 * A payload that will not PARSE is a different animal wearing the same coat.
 * Something wrote bytes that are not JSON, and a reader that answers `null` to
 * both questions hands those guard clauses a reason to skip — so the suite
 * reports a pass having asserted nothing. That matters most in the suites that
 * open payloads at all, because what they check with them is that no page has
 * frozen a live figure into its prose: the run goes green precisely when the
 * data it needed to do its job was unreadable.
 *
 * So the two answers are kept apart. A file that is absent is a fact a suite
 * can act on; a file that is unreadable is a failure, and it belongs in the
 * suite's own output with a stack naming the file rather than in a silence
 * that looks like a pass.
 *
 * CI's `data` job parses every payload independently and would also catch a
 * malformed one. That is a backstop for the repository, not for the suite —
 * it says nothing about which assertions ran here, and a contributor running
 * `npm run verify:math` locally never sees it.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where `publish.py` writes. The only copy of this path the suites keep. */
export const PUBLISHED_DIR = join(HERE, "..", "..", "data", "published");

/**
 * A published payload by filename stem, or null when the file is not there.
 *
 * `dir` is here so the two answers above can be tested against a scratch
 * directory. A suite must never point it at one to get a payload it likes:
 * what these suites are for is the figures this repository actually ships.
 *
 * @param {string} name filename stem, without `.json`
 * @param {string} [dir] directory to read from
 * @returns {any|null}
 * @throws {SyntaxError} when the file exists and is not JSON
 */
export function published(name, dir = PUBLISHED_DIR) {
  const path = join(dir, `${name}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}
