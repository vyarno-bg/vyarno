/**
 * Entry point for `/404.html`.
 *
 * Built to exactly that filename rather than `404/index.html`, because
 * "serve `404.html` from the deploy root for any unmatched path" is the
 * convention every static host follows without configuration. Keeping to it is
 * what lets this site be served by anything that can serve a directory.
 *
 * `replaceChildren()` before `mount()`, for the reason `/support/`'s entry
 * gives: `mount()` APPENDS, and `scripts/prerender.mjs` writes the whole page
 * into `#app` at build time so a reader with no JavaScript gets a masthead, a
 * heading and a link back to the calculator instead of a dead paragraph. Left
 * in place, every one of those would be on the page twice.
 */
import "./lib/tokens.css";
import "./lib/print.css";
import { mount } from "svelte";
import NotFound from "./NotFound.svelte";
import { startAnalytics } from "./lib/analytics.js";

const target = document.getElementById("app");
target.replaceChildren();

startAnalytics();

export default mount(NotFound, { target });
