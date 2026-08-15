/**
 * Entry point for `/legal/` — the terms, privacy notice, provider
 * identification and source attribution.
 *
 * A second Vite entry rather than a route inside the calculator: it resolves
 * as a real URL on a static host with no rewrite rules, and it does not pull
 * the calculator's bundle in for someone who came to read the terms.
 *
 * `replaceChildren()` before `mount()`, for the reason `main.js` and
 * `how-main.js` carry: `mount()` APPENDS, and this page arrives with the four
 * documents already inside `#app` (scripts/prerender.mjs writes them there so
 * the ЗЕТ чл. 4 identity is in the HTML a crawler is served rather than in the
 * bundle it may never run). Left in place, every heading and every paragraph of
 * the terms would be on the page twice — once frozen at build time and once
 * live.
 */
import "./lib/tokens.css";
import { mount } from "svelte";
import Legal from "./Legal.svelte";
import { startAnalytics } from "./lib/analytics.js";

const target = document.getElementById("app");
target.replaceChildren();

startAnalytics();

export default mount(Legal, { target });
