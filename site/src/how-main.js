/**
 * Entry point for `/how/` — Bulgaria's official figures, with their sources.
 *
 * Its own Vite entry for the same reason `/legal/` and `/support/` have one: it
 * resolves as a real URL on a static host with no rewrite rules, so it can be
 * linked to from outside — a search result, a citation, a message — and still
 * work.
 *
 * `replaceChildren()` before `mount()`, and this is the half that is easy to
 * miss when copying `support-main.js`: `mount()` APPENDS, and this page arrives
 * with the prerendered markup already inside `#app` (scripts/prerender.mjs
 * writes it there so a crawler that runs no JavaScript still gets the figures).
 * Left in place, every heading and every table would be on the page twice —
 * once frozen at build time and once live.
 */
import "./lib/tokens.css";
import "./lib/fig-table.css";
import "./lib/chart.css";
import "./lib/print.css";
import { mount } from "svelte";
import How from "./How.svelte";
import { fetchPayloads } from "./lib/calculator.svelte.js";
import { startAnalytics } from "./lib/analytics.js";
import { landOnFragment } from "./lib/fragment.js";

const target = document.getElementById("app");

startAnalytics();

// The prerendered page stays until the payloads are in hand: `main.js` says why.
fetchPayloads().then((payloads) => {
  target.replaceChildren();
  mount(How, { target, props: { payloads } });
  target.dataset.live = "";
  landOnFragment();
});
