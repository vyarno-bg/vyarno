/**
 * The build stamp.
 *
 * `__BUILD_ID__` is replaced at build time by `vite.config.js` with the short
 * git SHA plus the build date (`a1b2c3d · 2026-08-01`). It is rendered small
 * in the footer for one reason: a support conversation, or a bug report, can
 * start with *which build are you on* instead of a guess. Without it the only
 * way to identify a deploy is the hashed asset filename, which nobody reads
 * out loud.
 *
 * The `typeof` guard is not decoration — `verify_legal.mjs` imports this
 * module in plain node, where the define does not exist. It must not throw
 * there.
 */
export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
