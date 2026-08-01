/**
 * Entry point for `/support/` — how the project is paid for.
 *
 * Its own Vite entry for the same two reasons `/legal/` has one: it resolves
 * as a real URL on a static host with no rewrite rules, so it can be linked to
 * from outside and still work; and someone who came to read four paragraphs
 * about funding does not download the calculator to do it.
 */
import "./lib/tokens.css";
import { mount } from "svelte";
import Support from "./Support.svelte";

export default mount(Support, { target: document.getElementById("app") });
