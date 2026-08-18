/**
 * Entry point for `/404.html`.
 *
 * Built to exactly that filename rather than `404/index.html`, because
 * "serve `404.html` from the deploy root for any unmatched path" is the
 * convention every static host follows without configuration. Keeping to it is
 * what lets this site be served by anything that can serve a directory.
 */
import "./lib/tokens.css";
import "./lib/print.css";
import { mount } from "svelte";
import NotFound from "./NotFound.svelte";
import { startAnalytics } from "./lib/analytics.js";

startAnalytics();

export default mount(NotFound, { target: document.getElementById("app") });
