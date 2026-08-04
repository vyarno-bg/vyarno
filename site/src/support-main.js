/**
 * Entry point for `/support/` — how the project is paid for.
 *
 * Its own Vite entry for the same two reasons `/legal/` has one: it resolves
 * as a real URL on a static host with no rewrite rules, so it can be linked to
 * from outside and still work; and someone who came to read four paragraphs
 * about funding does not download the calculator to do it.
 *
 * `replaceChildren()` before `mount()`, the half that is easy to miss when
 * copying an entry point: `mount()` APPENDS, and this page arrives with the
 * whole ask already inside `#app` (scripts/prerender.mjs writes it there so a
 * crawler is served the funding answer rather than an empty div). Left in
 * place, the heading and every paragraph would be on the page twice — once
 * frozen at build time and once live.
 */
import "./lib/tokens.css";
import { mount } from "svelte";
import Support from "./Support.svelte";

const target = document.getElementById("app");
target.replaceChildren();

export default mount(Support, { target });
