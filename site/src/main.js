/**
 * SPA bootstrap — mount the App component into #app.
 */
import "./lib/tokens.css";
import "./lib/disclosure.css";
import "./lib/card.css";
import "./lib/result-row.css";
import "./lib/print.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { fetchPayloads } from "./lib/calculator.svelte.js";
import { startAnalytics } from "./lib/analytics.js";

const target = document.getElementById("app");

startAnalytics();

// `prerender.mjs` writes the page into #app, figures included. Swapped for a
// client frame with no payloads yet, every section moves down when the fetch
// lands (CLS 0.89 on a phone); swapped once they are in hand, in one task,
// nothing on screen survives the swap to move. #app is emptied first because
// `mount()` appends, and marked live because the frozen copy looks the same.
fetchPayloads().then((payloads) => {
  target.replaceChildren();
  mount(App, { target, props: { payloads } });
  target.dataset.live = "";
});
