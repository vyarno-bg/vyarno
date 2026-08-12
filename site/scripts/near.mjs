/**
 * The float comparator the numeric suites measure worked examples with.
 *
 * It is a module of its own because it carries a TOLERANCE. Every suite that
 * holds a computed figure against a hand-worked one needs the same epsilon, and
 * a comparator copied into each of them is one place per copy where that
 * epsilon can be widened — each edit small enough to read as tidying, none of
 * them visible from the others. `AGENTS.md` bars widening a tolerance to make
 * something pass, and a single definition is what turns such an edit into one
 * line in a file named for it.
 *
 * **A payload read is deliberately NOT shared the same way.**
 * `verify_suites.mjs` checks that every stem a suite hands to `published()` is
 * a file this repository publishes — without it a rename upstream turns each
 * `if (!payload) return;` into a silent skip rather than a failure — and it
 * scans `verify_*.mjs` and nothing else. A `const PAYROLL = read("payroll")`
 * hoisted in here would take that stem out of its sight, so each suite that
 * needs a payload opens it itself.
 */

/**
 * Whether `a` and `b` agree to within `eps`.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} [eps]
 * @returns {boolean}
 */
export const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
