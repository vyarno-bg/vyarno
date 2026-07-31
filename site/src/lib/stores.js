/**
 * Lang + theme stores. Persisted to localStorage; `theme` falls back to
 * prefers-color-scheme, `lang` does not consult the browser at all. Every
 * storage accessor swallows its errors: private mode, an exhausted quota or a
 * policy-disabled store must cost the visitor a persisted preference, never
 * the page.
 *
 * NOTHING IS WRITTEN UNTIL THE VISITOR CHOOSES SOMETHING, AND THAT IS A LEGAL
 * CONSTRAINT RATHER THAN A TASTE ONE
 *
 * A Svelte `writable` calls a new subscriber synchronously with the current
 * value, so a subscriber that persists on every value writes both keys on first
 * paint — with defaults, to a visitor who has touched nothing. Two shipped
 * sentences depend on that not happening. The privacy notice says «избраният
 * език» / "your chosen language", which is not true of a default.
 * And ЗЕТ чл. 4а, ал. 4, т. 2 — the Bulgarian transposition of the ePrivacy
 * storage rule, and it lives in ЗЕТ, not ЗЕС — exempts storage «необходими за
 * … предоставяне на услуга на информационното общество, ИЗРИЧНО ПОИСКАНА от
 * получателя». A user-interface preference the visitor actually set is the
 * textbook exempt case. A default they never asked for, persisted on arrival,
 * is the weakest version of that argument and the one a supervisory authority
 * would pick at first.
 *
 * So `persistOnChange` drops the initial call and writes only on a real
 * change. What a visitor can see is identical; what the notice says becomes
 * true.
 */
import { writable } from "svelte/store";

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** A persisted preference `isValid` accepts, or `null` — absent, unreadable or junk. */
function readPreference(key, isValid) {
  let saved = null;
  try {
    saved = localStorage.getItem(key);
  } catch {
    /* private mode, exhausted quota, storage disabled by policy */
  }
  return isValid(saved) ? saved : null;
}

/**
 * Subscribe to `store`, applying `apply` to every value but persisting only
 * the ones that arrive after the subscription.
 *
 * The `first` flag is the whole point: it swallows the synchronous call Svelte
 * makes when the subscriber is registered, so arriving at the page writes
 * nothing. See the module header for why that is not a micro-optimisation.
 *
 * @param {import("svelte/store").Readable<string>} store
 * @param {string} key       localStorage key
 * @param {(v: string) => void} apply  the DOM side effect, which runs always
 */
function persistOnChange(store, key, apply) {
  let first = true;
  store.subscribe((v) => {
    apply(v);
    if (first) {
      first = false;
      return;
    }
    writeLocalStorage(key, v);
  });
}

export const LANG_KEY = "vyarno_lang";
export const THEME_KEY = "vyarno_theme";

// ---------------------------------------------------------------------------
// Lang: "bg" | "en".
//
// BG is the default for everyone who has not chosen otherwise, and
// `navigator.language` is deliberately NOT consulted. This is a calculator of
// Bulgarian prices, Bulgarian payroll law and Sofia housing, written for a
// person living in Bulgaria today (docs/README.md §"Who this is for") — and a
// great many of them
// browse on a phone or a laptop whose UI language is English. Deriving the
// default from the browser handed those people the English site on a product
// whose primary audience is Bulgarian, which is the one guess we can be wrong
// about on first paint. EN remains one tap away in the header and, once
// chosen, wins for good — a saved preference is still read first.
// ---------------------------------------------------------------------------
const isLang = (v) => v === "bg" || v === "en";

/** The language a visitor with no saved preference gets. */
export const DEFAULT_LANG = "bg";

export const lang = writable(readPreference(LANG_KEY, isLang) ?? DEFAULT_LANG);

if (typeof document !== "undefined") {
  persistOnChange(lang, LANG_KEY, (v) => {
    document.documentElement.setAttribute("data-lang", v);
    document.documentElement.setAttribute("lang", v === "bg" ? "bg" : "en");
  });
}

// ---------------------------------------------------------------------------
// Theme: "light" | "dark". Defaults to OS preference.
// ---------------------------------------------------------------------------
const isTheme = (v) => v === "light" || v === "dark";

function initialTheme() {
  const saved = readPreference(THEME_KEY, isTheme);
  if (saved) return saved;
  const prefersDark =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export const theme = writable(initialTheme());

if (typeof document !== "undefined") {
  persistOnChange(theme, THEME_KEY, (v) => {
    document.documentElement.setAttribute("data-theme", v);
  });
}

// ---------------------------------------------------------------------------
// Toggle helpers
// ---------------------------------------------------------------------------
export function toggleLang() {
  lang.update((v) => (v === "bg" ? "en" : "bg"));
}

export function toggleTheme() {
  theme.update((v) => (v === "dark" ? "light" : "dark"));
}
