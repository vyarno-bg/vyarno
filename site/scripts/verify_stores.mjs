#!/usr/bin/env node
/**
 * Behaviour verification for `src/lib/stores.js` — the three preferences, the
 * figures a reader can ask this device to keep, their fallbacks, and what
 * happens when localStorage refuses.
 *
 * Two claims run through the whole file and both are shipped sentences rather
 * than taste. **Nothing is written before the visitor asks** — ЗЕТ чл. 4а,
 * ал. 4, т. 2 exempts storage for a service «изрично поискана», and the privacy
 * notice says «само ако ги смениш». And **what is stored is exactly the keys the
 * notice names**, which `verify_legal.mjs` holds from the other end by reading
 * them out of `stores.js` itself.
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

/**
 * A snapshot in the shape `Calculator#snapshot` writes — every field, because
 * every field is required and the point of several cases below is what happens
 * when one of them is not what it says it is.
 *
 * Two divisions rather than thirteen: `stores.js` validates the shape and never
 * the sizes, so the number here says nothing and a shorter fixture is a shorter
 * diff to read. The size check lives in `Calculator#restore`, against the
 * divisions actually published.
 */
const SAVED = {
  earners: [{ amount: 1500, raiseText: "3,5" }],
  earnersDirty: true,
  raiseDirty: true,
  payBasis: "net",
  anchor: "y1",
  rent: 600,
  cash: 4000,
  homeOn: true,
  m2: 65,
  rate: 2.75,
  rateTouched: true,
  term: 25,
  priceMode: "manual",
  manualPrice: 180000,
  weights: [40, 60],
  splits: [null, [30, 30]],
  activePreset: null,
  spendMode: "eur",
  spendSharePct: 80,
  detailMode: true,
  sectorKey: "Information and communication",
};

/** `SAVED` as it sits on the device, version stamp and all. */
const storedInputs = (over = {}) => ({
  vyarno_inputs: JSON.stringify({ ...SAVED, v: 1, ...over }),
});

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

test("nothing but the documented keys is ever written", async () => {
  // The privacy notice names the keys one by one, so a key written here and
  // absent there makes a shipped sentence untrue. The set is the guard, and it
  // widens only alongside the notice — `verify_legal.mjs` §"the privacy notice
  // states what is stored and what the host sees" reads the names straight out
  // of `stores.js` and fails on a key the notice does not carry, in either
  // language, on the commit that adds it.
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage, language: "bg-BG" });
  mod.toggleLang();
  mod.toggleTheme();
  mod.region.set("varna");
  mod.setRememberInputs(true);
  mod.writeInputs(SAVED);

  assert.deepEqual(
    [...storage.map.keys()].sort(),
    [mod.LANG_KEY, mod.THEME_KEY, mod.REGION_KEY, mod.INPUTS_KEY].sort()
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

// --------------------------------------------------------------------------
// The reader's own figures
// --------------------------------------------------------------------------

test("a device nobody has opted in on holds no figures", async () => {
  // The load-bearing one for this feature, and the same argument as «arriving
  // at the page writes nothing at all» one screen up: ЗЕТ чл. 4а, ал. 4, т. 2
  // exempts storage for a service «изрично поискана», and a salary kept because
  // the site felt like keeping it is not that. The switch is what the reader
  // asks with, so it starts off and the module writes nothing on the way past.
  //
  // Default `rememberInputs` to `true` and this goes red on its first line;
  // write the snapshot from the module rather than from the effect that reads
  // the switch and it goes red on the second.
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage, language: "bg-BG" });

  assert.equal(get(mod.rememberInputs), false, "this device is remembering by default");
  assert.deepEqual([...storage.map.keys()], [], "loading the page wrote something");
  assert.equal(mod.readInputs(), null);
});

test("the figures come back exactly as they went in", async () => {
  const storage = fakeStorage({});
  const { mod } = await loadStores({ storage, language: "bg-BG" });

  mod.setRememberInputs(true);
  mod.writeInputs(SAVED);

  assert.equal(get(mod.rememberInputs), true);
  assert.deepEqual(mod.readInputs(), SAVED, "what came back is not what was saved");
});

test("a stored blob is what says this device is remembering", async () => {
  // There is no second «is it on» flag: the switch reads the presence of the
  // key. Give it its own flag and this stays green while the two can disagree —
  // which is the state where the switch says off over a stored salary.
  const storage = fakeStorage(storedInputs());
  const { mod } = await loadStores({ storage, language: "bg-BG" });
  assert.equal(get(mod.rememberInputs), true);
});

test("switching off deletes the figures, it does not merely stop writing", async () => {
  // A switch that stops writing and leaves yesterday's salary on the disk is
  // the worst state this feature has: the reader has been told it is off, and
  // the next person to open the browser is looking at their pay.
  for (const stop of ["setRememberInputs", "forgetInputs"]) {
    const storage = fakeStorage(storedInputs());
    const { mod } = await loadStores({ storage, language: "bg-BG" });
    assert.equal(get(mod.rememberInputs), true);

    if (stop === "forgetInputs") mod.forgetInputs();
    else mod.setRememberInputs(false);

    assert.equal(read(storage, mod.INPUTS_KEY), null, `${stop} left the figures on the device`);
    assert.equal(get(mod.rememberInputs), false, `${stop} left the switch on`);
  }
});

test("a snapshot from another shape is dropped, and not left lying there", async () => {
  // A basket saved against thirteen divisions and read back against fourteen is
  // a wrong personal inflation wearing the appearance of the reader's own
  // choice, so a version this build cannot read is refused whole — and the key
  // goes with it, because it holds the reader's figures whether or not anything
  // here can still use them.
  for (const raw of [
    JSON.stringify({ ...SAVED, v: 2 }),
    JSON.stringify({ ...SAVED }),
    JSON.stringify([SAVED]),
    "null",
    "{",
    "",
  ]) {
    const storage = fakeStorage({ vyarno_inputs: raw });
    const { mod } = await loadStores({ storage, language: "bg-BG" });
    assert.equal(mod.readInputs(), null, `${raw.slice(0, 24)} was accepted`);
    assert.equal(read(storage, mod.INPUTS_KEY), null, `${raw.slice(0, 24)} survived on the device`);
    assert.equal(get(mod.rememberInputs), false);
  }
});

test("one junk field is enough to refuse the whole snapshot", async () => {
  // Field by field would leave a page half describing the reader with nothing
  // saying which half — so every field is checked and any failure drops all of
  // them. The loop covers whatever `INPUT_FIELDS` holds today: drop a field
  // from the validator and its case here stops being refused.
  const junk = {
    earners: [{ amount: "1500", raiseText: "3" }],
    earnersDirty: "yes",
    raiseDirty: 1,
    payBasis: "brutto",
    anchor: 1999,
    rent: "600",
    // Not `NaN`: `JSON.stringify` writes it as `null`, which is a legitimate
    // value for a field the reader can empty, so the fixture would be testing
    // that an empty savings box is accepted.
    cash: true,
    homeOn: "true",
    m2: [],
    rate: null,
    rateTouched: null,
    term: {},
    priceMode: "market",
    manualPrice: "180000",
    weights: [40, "60"],
    splits: [null, [30, null]],
    activePreset: 3,
    spendMode: "percent",
    spendSharePct: 140,
    detailMode: "on",
    sectorKey: 7,
  };
  assert.deepEqual(
    Object.keys(junk).sort(),
    Object.keys(SAVED).sort(),
    "the junk table and the snapshot describe different shapes"
  );

  for (const [field, bad] of Object.entries(junk)) {
    const storage = fakeStorage(storedInputs({ [field]: bad }));
    const { mod } = await loadStores({ storage, language: "bg-BG" });
    assert.equal(mod.readInputs(), null, `a junk ${field} was accepted`);
  }
});

test("a browser that refuses to store costs the memory, never the page", async () => {
  // Private mode, quota exhausted, storage disabled by policy. Every accessor
  // throws, and the switch, the write and the wipe all have to be no-ops rather
  // than an error in an event handler.
  const storage = fakeStorage({}, { throwing: true });
  const { mod } = await loadStores({ storage, language: "bg-BG" });

  assert.equal(get(mod.rememberInputs), false);
  assert.doesNotThrow(() => mod.setRememberInputs(true));
  assert.doesNotThrow(() => mod.writeInputs(SAVED));
  assert.doesNotThrow(() => mod.forgetInputs());
  assert.equal(mod.readInputs(), null);
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
