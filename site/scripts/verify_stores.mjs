#!/usr/bin/env node
/**
 * Behaviour verification for `src/lib/stores.js` — the language and theme
 * preferences, their fallbacks, and what happens when localStorage refuses.
 *
 * `stores.js` reads localStorage at module-evaluation time, so each case
 * installs its own fake `localStorage` / `document` / `navigator` /
 * `matchMedia` and then imports the module under a unique query string to
 * defeat the ESM module cache. Break `readPreference` on purpose — return the
 * raw value without validating it, or skip the write-through — and watch these
 * go red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

/** A localStorage stand-in. `throwing: true` models private mode / quota. */
function fakeStorage(initial = {}, { throwing = false } = {}) {
  const map = new Map(Object.entries(initial));
  const boom = () => {
    throw new Error("QuotaExceededError");
  };
  return {
    map,
    getItem: throwing ? boom : (k) => (map.has(k) ? map.get(k) : null),
    setItem: throwing
      ? boom
      : (k, v) => {
          map.set(k, String(v));
        },
    removeItem: throwing
      ? boom
      : (k) => {
          map.delete(k);
        },
  };
}

let caseId = 0;

/**
 * Install the browser globals `stores.js` reads, import a fresh copy of it,
 * and hand back the module plus the storage it wrote through.
 */
async function loadStores({ storage, language = "bg-BG", prefersDark = false }) {
  globalThis.localStorage = storage;
  globalThis.matchMedia = (q) => ({ matches: prefersDark && q.includes("dark") });
  Object.defineProperty(globalThis, "navigator", {
    value: { language },
    configurable: true,
    writable: true,
  });
  // The subscribers only run when a `document` exists, and they are the half
  // of the module that writes the key back, so the fake has to be present.
  globalThis.document = {
    documentElement: {
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
    },
  };
  const mod = await import(`../src/lib/stores.js?case=${++caseId}`);
  return { mod, storage, docEl: globalThis.document.documentElement };
}

const read = (s, k) => (s.map.has(k) ? s.map.get(k) : null);

// --------------------------------------------------------------------------
// A saved preference wins over the browser
// --------------------------------------------------------------------------

test("a saved preference beats the browser's guess", async () => {
  // Someone who chose EN + light under a dark OS must get EN + light back.
  const storage = fakeStorage({ vyarno_lang: "en", vyarno_theme: "light" });
  const { mod } = await loadStores({ storage, language: "bg-BG", prefersDark: true });

  assert.equal(get(mod.lang), "en", "the saved language was ignored");
  assert.equal(get(mod.theme), "light", "the saved theme was ignored");
});

test("the keys are the ones the privacy notice names", async () => {
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage });

  assert.equal(mod.LANG_KEY, "vyarno_lang");
  assert.equal(mod.THEME_KEY, "vyarno_theme");
});

test("a junk stored value is discarded, not adopted", async () => {
  // Only "bg"/"en" and "light"/"dark" are preferences; anything else falls
  // through to the defaults.
  const storage = fakeStorage({ vyarno_lang: "fr", vyarno_theme: "sepia" });
  const { mod } = await loadStores({ storage, language: "en-GB", prefersDark: true });

  assert.equal(get(mod.lang), "bg", "the default should decide here");
  assert.equal(get(mod.theme), "dark", "prefers-color-scheme should decide here");
});

// --------------------------------------------------------------------------
// The defaults a first-time visitor gets
// --------------------------------------------------------------------------

test("a first-time visitor gets BG whatever their browser's language is", async () => {
  // This is the whole point of not reading navigator.language: the product is
  // BG-first, and a Bulgarian on an English-language phone is the common case,
  // not the exception. Point this back at the browser and watch it go red.
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage, language: "en-GB", prefersDark: true });

  assert.equal(get(mod.lang), "bg");
  assert.equal(mod.DEFAULT_LANG, "bg");
  // The theme, by contrast, DOES follow the OS — a dark-mode preference is a
  // statement about this device, not a guess about who the reader is.
  assert.equal(get(mod.theme), "dark");
  // ...and NEITHER default is persisted. The tempting argument for writing
  // them is that it makes the next visit stable. It does not: the next visit
  // reaches the same defaults by the same route — BG because `DEFAULT_LANG` is
  // BG, dark because the OS still says dark — so the write buys nothing and
  // costs the two claims in the module header. See the "arriving at the page
  // writes nothing at all" case.
  assert.equal(read(storage, mod.LANG_KEY), null);
  assert.equal(read(storage, mod.THEME_KEY), null);
});

test("no navigator at all is not an error, and still yields BG", async () => {
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage, language: undefined, prefersDark: false });
  assert.equal(get(mod.lang), "bg");
  assert.equal(get(mod.theme), "light");
});

test("a visitor who chose EN keeps EN, browser language notwithstanding", async () => {
  // The default must never overwrite a choice: it applies only when nothing
  // is stored. A returning EN reader on a bg-BG browser still gets EN.
  const storage = fakeStorage({ vyarno_lang: "en" });
  const { mod } = await loadStores({ storage, language: "bg-BG" });
  assert.equal(get(mod.lang), "en");
});

test("a localStorage that throws does not break the page", async () => {
  // Private mode, quota exhausted, storage disabled by policy: every accessor
  // throws. The stores must still resolve and the toggles must still work.
  const storage = fakeStorage({}, { throwing: true });
  const { mod } = await loadStores({ storage, language: "en-GB", prefersDark: true });

  assert.equal(get(mod.lang), "bg");
  assert.equal(get(mod.theme), "dark");
  assert.doesNotThrow(() => mod.toggleLang());
  assert.equal(get(mod.lang), "en");
});

// --------------------------------------------------------------------------
// The toggles
// --------------------------------------------------------------------------

test("the toggles write through to storage and to the DOM attributes", async () => {
  const storage = fakeStorage({});
  const { mod, docEl } = await loadStores({ storage, language: "bg-BG" });

  mod.toggleLang();
  mod.toggleTheme();
  assert.equal(read(storage, mod.LANG_KEY), "en");
  assert.equal(read(storage, mod.THEME_KEY), "dark");
  // ...and through to the attributes tokens.css switches on.
  assert.equal(docEl.attrs["data-lang"], "en");
  assert.equal(docEl.attrs["data-theme"], "dark");
});

test("arriving at the page writes nothing at all", async () => {
  // The load-bearing one. A Svelte `writable` calls a new subscriber
  // synchronously with the current value, so a subscriber that persists on
  // every value writes both keys on first paint — with defaults, for a visitor
  // who has chosen nothing.
  //
  // Two shipped sentences ride on this. The privacy notice says «избраният
  // език» / "your chosen language", and ЗЕТ чл. 4а, ал. 4, т. 2 exempts only
  // storage necessary for a service «изрично поискана» by the recipient. A
  // default nobody asked for is neither.
  //
  // Delete the `first` guard in `persistOnChange` and this goes red while
  // every other case in this file stays green — which is the point of having
  // it separately from the write-through case below.
  const storage = fakeStorage({});
  const { docEl } = await loadStores({ storage, language: "en-GB", prefersDark: true });

  assert.deepEqual(
    [...storage.map.keys()],
    [],
    "loading the page persisted a preference the visitor never expressed"
  );
  // The DOM side still has to be applied on load, or the page renders in the
  // wrong theme until the first toggle.
  assert.equal(docEl.attrs["data-lang"], "bg");
  assert.equal(docEl.attrs["data-theme"], "dark");
});

test("a stored preference is not rewritten just by being read", async () => {
  // The same guard, from the other side: a returning visitor's existing keys
  // must survive untouched rather than be re-written with the same value.
  const storage = fakeStorage({ vyarno_lang: "en", vyarno_theme: "light" });
  const seen = [];
  const original = storage.setItem;
  storage.setItem = (k, v) => {
    seen.push(k);
    original(k, v);
  };
  await loadStores({ storage, language: "bg-BG" });
  assert.deepEqual(seen, [], `loading rewrote ${seen.join(", ")}`);
});

test("nothing but the three documented keys is ever written", async () => {
  // The privacy notice names exactly three keys, and names them. A fourth
  // would make the shipped sentence untrue — which is why the count is held
  // here rather than left to review.
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage, language: "bg-BG" });
  mod.toggleLang();
  mod.toggleTheme();
  mod.region.set("varna");

  assert.deepEqual(
    [...storage.map.keys()].sort(),
    [mod.LANG_KEY, mod.THEME_KEY, mod.REGION_KEY].sort()
  );
});

test("the region is not written until the reader picks one", async () => {
  // The same ЗЕТ чл. 4а argument as lang and theme, and the one the notice's
  // «само ако ги смениш» turns on: a preference persisted on arrival is a
  // preference the visitor never asked for. `persistOnChange` swallows the
  // synchronous first call Svelte makes when the subscriber registers, so
  // merely loading the page writes nothing.
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage, language: "bg-BG" });
  assert.equal(read(storage, mod.REGION_KEY), null);
  assert.equal(mod.REGION_KEY, "vyarno_region");

  // And there is no default: a reader who has chosen nothing gets no област,
  // rather than the largest one wearing the appearance of a choice (P7).
  let current = null;
  mod.region.subscribe((v) => (current = v))();
  assert.equal(current, "");
});

test("a junk saved region is ignored rather than rendered", async () => {
  // `stores.js` knows nothing about the payloads, so it cannot check that a
  // code is a real област — and must not start fetching them to find out. What
  // it can refuse is a value that could not be a code at all.
  for (const junk of ["../../etc", "<script>", "VARNA", "x".repeat(64), "1"]) {
    const storage = fakeStorage({ vyarno_region: junk });
    const { mod } = await loadStores({ storage, language: "bg-BG" });
    let current = null;
    mod.region.subscribe((v) => (current = v))();
    assert.equal(current, "", `${junk} was accepted as a region code`);
  }
});
