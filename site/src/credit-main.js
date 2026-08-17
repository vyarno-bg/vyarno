/**
 * Entry point for `/credit/` — what borrowing costs in Bulgaria.
 *
 * Its own Vite entry for the reason `/how/`, `/legal/` and `/support/` have
 * one: it resolves as a real URL on a static host with no rewrite rules, so it
 * can be linked to from outside — a search result, a citation, a message — and
 * still work.
 *
 * `replaceChildren()` before `mount()`, and this is the half that is easy to
 * miss when copying an entry point: `mount()` APPENDS, and this page arrives
 * with the prerendered markup already inside `#app` (scripts/prerender.mjs
 * writes it there so a crawler that runs no JavaScript still gets the
 * figures with their sources attached). Left in place, every heading, every
 * figure and every provenance line would be on the page twice — once frozen at
 * build time and once live — and every "at least one of these is present"
 * assertion would still pass.
 */
import "./lib/tokens.css";
import "./lib/fig-table.css";
import { mount } from "svelte";
import Credit from "./Credit.svelte";
import { startAnalytics } from "./lib/analytics.js";

const target = document.getElementById("app");
target.replaceChildren();

startAnalytics();

export default mount(Credit, { target });
