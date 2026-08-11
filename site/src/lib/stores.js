/**
 * What this device is allowed to keep: the language, the theme, the област,
 * and — only if the reader asks for it — the figures they typed. Persisted to
 * localStorage; `theme` falls back to prefers-color-scheme, `lang` does not
 * consult the browser at all. Every storage accessor swallows its errors:
 * private mode, an exhausted quota or a policy-disabled store must cost the
 * visitor a persisted preference, never the page.
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

function removeLocalStorage(key) {
  try {
    localStorage.removeItem(key);
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
// Region: one of the codes in `region_salary.json`, or "" for "not chosen".
//
// **THERE IS NO DEFAULT, AND THAT IS P7 RATHER THAN AN OMISSION.** Sofia is the
// tempting one — it is the largest област and the only one this page ever
// showed — and picking it would hand a reader in Бургас Sofia's average wage
// and Sofia's €/m² wearing the appearance of a choice they made. The raise
// field stays blank for exactly this reason. So the two city-scoped cards
// render an explicit "pick your област" state until somebody picks one, while
// every national figure on the page renders in full.
//
// The empty string rather than null: it is what an unselected `<select>`
// carries, so the picker binds to this store directly and there is no third
// state between "the store" and "the control".
//
// **What is NOT validated here**, deliberately: whether the saved code is a
// real област. `stores.js` knows nothing about the payloads and must not start
// fetching them to answer that — a code that no longer exists resolves to no
// row in `view.js#regionRow`, which is the same empty state as no choice at
// all. The shape check below is only that it could be a code.
// ---------------------------------------------------------------------------
const isRegionCode = (v) => typeof v === "string" && /^[a-z][a-z-]{1,30}$/.test(v);

export const REGION_KEY = "vyarno_region";

export const region = writable(readPreference(REGION_KEY, isRegionCode) ?? "");

if (typeof document !== "undefined") {
  // Same `persistOnChange` as lang and theme, and for the same ЗЕТ чл. 4а
  // reason: nothing is written until the visitor actively chooses. A preference
  // persisted on arrival is the weakest version of the "explicitly requested"
  // exemption, and the privacy notice's «избраните от теб» would stop being
  // true of it. There is no DOM side effect — the region changes figures, not
  // presentation — so `apply` is a no-op.
  persistOnChange(region, REGION_KEY, () => {});
}

// ---------------------------------------------------------------------------
// The figures the reader typed — kept only if they ask, on this device only
//
// Everything above is a preference. This one is the salary, the rent, the
// savings and the basket, so it is the one entry in this file where the thing
// stored is the reader themselves.
//
// **P1 protects the reader from US, and this is a different risk with the same
// shape.** «Числата ти остават при теб» is about the network, and it is
// untouched here: nothing below reaches a server, and the calculator still
// computes in the tab. What a stored salary is exposed to is the NEXT PERSON
// ON THIS DEVICE — the shared laptop, the family tablet, the machine in a
// library. That is not a hypothetical the code can price, so the reader prices
// it: the switch is OFF until they turn it on, and the label beside it says
// what turning it on means (`COPY.rememberHint`). A pre-ticked box would be
// this project deciding somebody's living room for them, and P7's rule about
// flattering defaults is the same rule.
//
// **The opt-in is also what the ЗЕТ чл. 4а argument rests on.** The module
// header's «изрично поискана» reading is thin for a preference the visitor set
// and thinner still for one they did not; a figure kept because somebody
// pressed a switch that says «помни числата ми» is the strongest form of it
// this file has.
//
// **ONE KEY, AND NO SEPARATE "IS IT ON" FLAG.** Remembering is on exactly when
// the blob is on disk: the switch writes a snapshot the moment it is turned on,
// and turning it off deletes the key in the same action. A flag beside the data
// is a second thing that can disagree with it, and the disagreement that
// matters is the one where the switch reads off and yesterday's salary is still
// there — the worst state this feature has, and the one it cannot reach.
// ---------------------------------------------------------------------------

export const INPUTS_KEY = "vyarno_inputs";

/**
 * The saved shape's version, and a blob carrying any other number is dropped
 * unread.
 *
 * The failure it exists for is not a crash. A basket of thirteen weights read
 * back after a payload has gained a division lands one number short, and every
 * figure derived from it is wrong while wearing the appearance of a choice the
 * reader made — which is worse than an empty basket, because nothing on screen
 * says a stale shape was involved. Bump this whenever a field below changes
 * meaning, changes name or disappears.
 */
const INPUTS_VERSION = 1;

const isBool = (v) => typeof v === "boolean";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** A number field the reader can empty: `bind:value` on an empty number input is `null`. */
const isAmount = (v) => v === null || isNum(v);
const isText = (v) => typeof v === "string";
const isList = (v, ok) => Array.isArray(v) && v.every(ok);

/**
 * Every field the blob carries, and what it has to look like.
 *
 * **All of them are required.** The writer is `Calculator#snapshot`, so a blob
 * missing one is a blob this version did not write, whatever its `v` says —
 * and «липсва, значи по подразбиране» is how a half-read basket gets onto the
 * page. Junk is absent, never trusted, exactly as `readPreference` treats a
 * language it does not recognise.
 *
 * **What is NOT checked here, deliberately: the sizes.** How many divisions a
 * basket has and how many incomes a household may hold are facts about the
 * published payloads and about the pay card, and `stores.js` knows nothing
 * about either — the same line the region store draws when it declines to ask
 * whether a saved code is a real област. `Calculator#restore` owns those, and
 * drops the blob when they do not match.
 */
const INPUT_FIELDS = {
  earners: (v) =>
    isList(v, (e) => !!e && typeof e === "object" && isAmount(e.amount) && isText(e.raiseText)),
  // The two "has a human been here" flags. They travel with the amounts
  // because the amounts alone cannot say what they mean: restored without
  // them, a reader's own €1,500 is treated as the €900 placeholder and the
  // pocket row, the ladder row and the wedge all decline to answer about
  // figures the reader typed themselves. Set them the other way and the page
  // makes second-person claims about a placeholder (P7). `rateTouched` below
  // is the same kind of field and travels for the same reason: without it the
  // published ECB rate wins on the next load and the reader's own rate is the
  // one thing the home block forgets.
  earnersDirty: isBool,
  raiseDirty: isBool,
  payBasis: (v) => v === "net" || v === "gross",
  anchor: (v) => v === "y1" || (isNum(v) && v >= 2000 && v <= 2100),
  rent: isAmount,
  cash: isAmount,
  homeOn: isBool,
  m2: isAmount,
  rate: isNum,
  rateTouched: isBool,
  term: isAmount,
  priceMode: (v) => v === "auto" || v === "manual",
  manualPrice: isAmount,
  weights: (v) => isList(v, isNum),
  splits: (v) => isList(v, (s) => s === null || isList(s, isNum)),
  activePreset: (v) => v === null || isText(v),
  spendMode: (v) => v === "pct" || v === "eur",
  spendSharePct: (v) => isNum(v) && v >= 0 && v <= 100,
  detailMode: isBool,
  sectorKey: isText,
};

/** The saved fields `INPUT_FIELDS` accepts in full, or `null`. */
function parseInputs(raw) {
  let blob;
  try {
    blob = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!blob || typeof blob !== "object" || blob.v !== INPUTS_VERSION) return null;
  const saved = {};
  for (const [field, isValid] of Object.entries(INPUT_FIELDS)) {
    if (!isValid(blob[field])) return null;
    // Rebuilt field by field rather than handed back as parsed, so anything
    // else the blob carries stops at this line instead of reaching the state
    // object the whole page is derived from.
    saved[field] = blob[field];
  }
  return saved;
}

/**
 * What the reader asked us to keep, or `null` — absent, unreadable, junk, or
 * written by a version whose shape this one cannot read.
 *
 * **A blob we refuse to read is deleted rather than left lying there.** It
 * holds the reader's own figures whether or not this build can use them, and a
 * switch reading "off" over a salary still on the disk is the state this whole
 * design exists to make unreachable.
 */
export function readInputs() {
  let raw;
  try {
    raw = localStorage.getItem(INPUTS_KEY);
  } catch {
    /* private mode, exhausted quota, storage disabled by policy */
    return null;
  }
  if (raw === null) return null;
  const saved = parseInputs(raw);
  if (!saved) removeLocalStorage(INPUTS_KEY);
  return saved;
}

/** Whether this device is keeping the reader's figures. Off until they say so. */
export const rememberInputs = writable(readInputs() !== null);

/** @param {Record<string, unknown>} state  a `Calculator#snapshot` */
export function writeInputs(state) {
  writeLocalStorage(INPUTS_KEY, JSON.stringify({ ...state, v: INPUTS_VERSION }));
}

/**
 * Delete what is stored and stop storing, in one action.
 *
 * The two halves are not separable. Clearing the key while the switch stays on
 * writes the same figures back on the reader's next keystroke, so a "forget"
 * that leaves it on is a button that does nothing — and a switch turned off
 * over a stored salary is the same failure from the other side.
 */
export function forgetInputs() {
  removeLocalStorage(INPUTS_KEY);
  rememberInputs.set(false);
}

/**
 * The switch itself.
 *
 * Turning it ON writes nothing here: `App.svelte`'s effect has the reader's
 * current state and persists it as soon as this flips, which keeps one writer
 * rather than two that can disagree about what is on the device.
 *
 * @param {boolean} on
 */
export function setRememberInputs(on) {
  if (on) rememberInputs.set(true);
  else forgetInputs();
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
