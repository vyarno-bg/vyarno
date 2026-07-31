/**
 * Entry point for `/legal/` — the terms, privacy notice, provider
 * identification and source attribution.
 *
 * A second Vite entry rather than a route inside the calculator: it resolves
 * as a real URL on a static host with no rewrite rules, and it does not pull
 * the calculator's bundle in for someone who came to read the terms.
 */
import "./lib/tokens.css";
import { mount } from "svelte";
import Legal from "./Legal.svelte";

export default mount(Legal, { target: document.getElementById("app") });
