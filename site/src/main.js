/**
 * SPA bootstrap — mount the App component into #app.
 */
import "./lib/tokens.css";
import "./lib/disclosure.css";
import "./lib/card.css";
import "./lib/result-row.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { startAnalytics } from "./lib/analytics.js";

const target = document.getElementById("app");

// `mount()` APPENDS to its target, and the built page arrives with the shell
// already inside #app: `scripts/prerender.mjs` renders it there so a crawler
// that runs no JavaScript still gets the page's prose. Left in place, every
// heading, the explainer and the footer would be on the page twice. Emptying
// the target is what makes the prerendered markup a crawler's copy rather than
// a second one for the reader — it is discarded here, and the client renders
// from scratch exactly as it does in dev, where the target is empty already.
target.replaceChildren();

startAnalytics();

const app = mount(App, { target });

export default app;
