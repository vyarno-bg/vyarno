/**
 * SPA bootstrap — mount the App component into #app.
 */
import "./lib/tokens.css";
import "./lib/disclosure.css";
import "./lib/card.css";
import "./lib/result-row.css";
import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, {
  target: document.getElementById("app"),
});

export default app;
