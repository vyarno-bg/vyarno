/**
 * Number and date formatting for the UI, in one place.
 *
 * Every figure on the page passes through here, so the locale rules are stated
 * once: Bulgarian uses a comma for the decimal separator and a space for the
 * thousands group, English uses the reverse, and `toLocaleString` knows both.
 * A non-finite value formats as an em dash rather than "NaN" — the calculator
 * renders continuously as the user types, so half-typed and empty inputs are
 * an ordinary state, not an error.
 *
 * Each function takes the language explicitly. Components hold the store
 * subscription and pass `$lang` down; keeping it out of this module is what
 * makes these testable as plain functions and reusable from a component that
 * has its own language prop.
 */

/** Intl locale for a UI language code. */
function locale(lang) {
  return lang === "bg" ? "bg-BG" : "en-GB";
}

/**
 * A decimal a reader typed, in either notation, as a number — or NaN.
 *
 * **The comma is the Bulgarian decimal separator and this page writes it
 * everywhere**, including in the hint sitting directly under the rate field.
 * `<input type="number">` does not accept it: the HTML value sanitiser strips
 * every character that is not part of a valid floating-point number, so «2,75»
 * arrived as `275` with `validity.valid` true and nothing to show a reader
 * that anything had happened. The mortgage row then stated «вноска при 275,0%
 * за 25 г.: €34 102/мес», an answer in the second person built out of a
 * correctly-typed number multiplied by a hundred. A 3,5% raise became 35%
 * the same way. Setting the browser's locale to bg-BG changes none of it.
 *
 * So the two decimal fields are `type="text" inputmode="decimal"` and arrive
 * here instead. Nothing is lost by that: the page has no `<form>`, so `min`
 * and `step` never validated anything — they drew the spinner arrows, and the
 * mangled value passed `validity.valid` regardless.
 *
 * Both separators are accepted, because both are things a person here types.
 * Spaces go too. `\s` covers the non-breaking and narrow ones `toLocaleString`
 * puts in a thousands group, so a figure pasted back off this very page reads.
 * A string carrying both separators is refused rather than guessed at: «1,234»
 * is one number to a Bulgarian reader and a different one to an English one,
 * and there is no answer here that is right for both.
 */
export function parseDecimal(raw) {
  const text = String(raw ?? "").replace(/\s/g, "");
  if (text === "" || (text.includes(",") && text.includes("."))) return NaN;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
}

/**
 * The inverse: a number as the reader's own notation, for the field to show.
 *
 * Plain rather than grouped — this is what goes back INTO an input, and a
 * thousands space is not something a reader wants to edit around.
 */
export function decimalText(x, lang = "bg") {
  if (!Number.isFinite(x)) return "";
  return String(x).replace(".", lang === "bg" ? "," : ".");
}

/** `x` to `digits` decimal places, or "—" when there is no number to show. */
export function number(x, digits = 1, lang = "bg") {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toLocaleString(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** `x` rounded to whole units — every € amount on the page. */
export function integer(x, lang = "bg") {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toLocaleString(locale(lang), { maximumFractionDigits: 0 });
}

/**
 * A percentage carrying its own sign — one sign, and only where there is a
 * direction to name.
 *
 * `+{number(x)}%` was printed for the raise and for π, and both can be
 * negative — a pay cut is typeable, and a basket weighted onto the groups that
 * are FALLING makes π negative. Either one rendered as «+−5,0%».
 *
 * **A magnitude that rounds to zero takes no sign**, because the sign would be
 * claiming something the digits beside it do not support. Eurostat publishes
 * the divisions' annual rates to one decimal and «Облекло и обувки» is 0.0
 * right now, which the basket rendered as «+0,0%» — prices rose by nothing.
 * The unsigned pair is worse: +0.04 and −0.04 both print «0,0%» of magnitude,
 * so a signed rendering put «+0,0%» beside «−0,0%» and asked a reader to read
 * a difference out of two identical digits. Where the rate is genuinely zero
 * and where it is too small to show at this precision, «0,0%» is the same true
 * statement, and it is the one the published figure will support.
 *
 * The minus is U+2212, matching the table and the pocket figure; the locale's
 * own hyphen is narrower and reads as a dash mid-sentence.
 */
export function signed(x, digits = 1, lang = "bg") {
  if (!Number.isFinite(x)) return "—";
  const magnitude = number(Math.abs(x), digits, lang);
  // Decided by what is about to be PRINTED, never by rounding `x` a second
  // time. The two roundings disagree at the boundary and in opposite
  // directions: `Math.round(-0.5)` is `-0`, which reads as no direction, while
  // `toLocaleString` renders the same input as "0,1", which has one. Reading
  // the digits back off the string cannot drift from them, at any `digits` and
  // in either language — both write 0-9.
  const sign = /[1-9]/.test(magnitude) ? (x < 0 ? "−" : "+") : "";
  return sign + magnitude;
}

/**
 * The same, carrying a percent sign.
 *
 * Built on `signed` rather than repeating it, because the two rules above are
 * what six templates each got a little bit wrong while writing their own: some
 * printed «+0,0%», some took their minus from `toLocaleString` (U+002D), and
 * the ones rendering points did both. A unit is the only thing that separates
 * a share from a contribution in points, so the unit is the only thing that
 * varies here.
 */
export function percentSigned(x, digits = 1, lang = "bg") {
  const magnitude = signed(x, digits, lang);
  return magnitude === "—" ? magnitude : magnitude + "%";
}

/**
 * A percentage that is a SHARE of something rather than a change.
 *
 * Neither of the two above fits one. `percentSigned` writes «+55,7%» over a
 * share of the money paid for homes and invents a movement nobody measured —
 * the objection `view/market.js`'s range strip already makes to signing the
 * housing-cost share. `number` writes the negative half with `toLocaleString`'s
 * U+002D, the narrow hyphen that reads as a dash beside a figure and is the
 * character `signed` exists to keep off the page.
 *
 * A share CAN be negative: net new mortgage debt over a year's purchases is
 * below zero in a year households repaid more than they borrowed, and that
 * reading needs a minus a reader can see.
 */
export function percentShare(x, digits = 1, lang = "bg") {
  const magnitude = number(x, digits, lang);
  return magnitude === "—" ? magnitude : magnitude.replace("-", "−") + "%";
}

/**
 * A day of the month as an ordinal: 23 → «23-то» in BG, "23rd" in EN.
 *
 * Both languages take the ending from the last digit and both make an exception
 * of the teens, and neither was getting it. The rent row wrote «{day}-о число»
 * and "{day}th" for all thirty days `rentDays` can return, so «1-о» stood where
 * a Bulgarian reader expects «1-во», «23-о» where they expect «23-то», and "21th"
 * where an English one expects "21st". Eight of the thirty days were wrong in
 * BG and six in EN — on the sentence that only renders when rent is over 30% of
 * take-home, which is the reader the row is written for.
 *
 * BG: първо, второ, трето, четвърто, then -о from пето up. EN: st, nd, rd, then
 * th. The 11–14 band is -о and -th in both, which is why the check on the last
 * two digits comes first.
 */
export function ordinalDay(day, lang = "bg") {
  if (day === null || day === undefined || !Number.isFinite(day)) return "—";
  const n = Math.trunc(day);
  const teen = n % 100 >= 11 && n % 100 <= 14;
  const endings =
    lang === "bg" ? { 1: "-во", 2: "-ро", 3: "-то", 4: "-то" } : { 1: "st", 2: "nd", 3: "rd" };
  const fallback = lang === "bg" ? "-о" : "th";
  return `${n}${teen ? fallback : (endings[n % 10] ?? fallback)}`;
}

/**
 * A reference period as the publisher writes it: "2026-05", "2026-Q1", "2026".
 *
 * Period labels come from the published payloads and several are rendered
 * inside `{@html …}` alongside copy that carries markup. Everything the
 * pipeline emits matches this shape, so constraining it here costs nothing —
 * and it means no fetched string reaches the DOM as markup even if a payload
 * is ever served from somewhere this repository does not control.
 * `scripts/verify_template_safety.mjs` holds the wider rule.
 */
export function period(value) {
  const text = String(value ?? "");
  return /^[0-9]{4}(-([0-9]{2}|Q[1-4]))?$/.test(text) ? text : "—";
}

/**
 * A reference period as a reader says it: "юни 2026", "Q1 2026", "2026".
 *
 * `period()` above returns the publisher's own label, which is right beside a
 * dataset name and wrong in a sentence — nobody reads "2026-06" as June. Same
 * safety property: anything not matching the pipeline's period shape returns an
 * em dash rather than reaching the DOM, so it is usable in the same places.
 */
export function periodLong(value, lang = "bg") {
  const text = period(value);
  if (text === "—") return text;
  const [year, part] = text.split("-");
  if (!part) return year;
  if (part.startsWith("Q")) return `${part} ${year}`;
  return new Date(Date.UTC(Number(year), Number(part) - 1, 1)).toLocaleDateString(locale(lang), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A publisher's own category label, constrained to the shape a label has.
 *
 * НСИ's NACE Rev 2 section names arrive in `sector_salary.json` — read out of
 * their workbook, in two languages — and the sector sentence renders them
 * inside `{@html …}` because the copy around them carries markup. Every one of
 * them is letters, digits, spaces and a little punctuation, so pinning that
 * shape costs nothing and keeps the third invariant in `site/AGENTS.md` true:
 * no fetched string reaches the DOM as markup. Anything else returns an em
 * dash, which renders as a visibly missing label rather than as itself.
 *
 * Deliberately NOT an escape function. Escaping would let any string through
 * in a mangled form; this admits only what a label looks like, so a payload
 * carrying something else fails visibly instead of rendering oddly.
 */
export function label(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 120) return "—";
  return /^[\p{L}\p{N} .,;:'’()\-/&]+$/u.test(text) ? text : "—";
}

/**
 * A URL that is safe to put in an `href`, or "" if it is not one.
 *
 * Every source link on the page comes out of a published payload's
 * `source_url`. Those payloads are ours and same-origin, but the links are
 * rendered inside `{@html …}` copy, so a value that is not an ordinary web
 * address should produce no link rather than whatever it happens to be —
 * `javascript:` and `data:` are the two that matter.
 */
export function httpUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * An ISO date as "17 юли 2026" / "17 Jul 2026".
 *
 * **Formatted in UTC, because every value here is a DAY and not a moment.**
 * `new Date("2026-08-21")` is midnight UTC, so a reader whose clock is behind
 * it is shown the day before: «21.08.2026 г.» became «20.08.2026 г.» anywhere
 * in the Americas, on the panel whose whole job is provenance. Nothing about
 * the reader's own zone is involved in what day НСИ refreshed a payload.
 *
 * Three of the values are dates somebody is meant to look up with — the ДВ
 * issue that carries the payroll table, the day the БНБ limits came into
 * force, and имот.bg's own «обновена на» snapshot — so a day either way is a
 * citation to the wrong record rather than a cosmetic slip.
 *
 * `periodLong` above pins the zone for the same reason and has all along; this
 * is the same rule applied to the other half of the pair, and a test that
 * only ever ran on a UTC machine could not tell them apart.
 */
export function dateShort(value, lang = "bg") {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A fetched string, safe to interpolate into copy that carries markup.
 *
 * **The one value on this page that is text and comes from a publisher.**
 * Every other substitution is a number, a date or one of our own COPY strings,
 * which is what makes rendering the templates through `{@html}` safe at all —
 * `verify_template_safety.mjs` holds that, and the app deliberately has no
 * free-text input surface. An област's name breaks the pattern: it is НСИ's
 * own string, read out of a payload at runtime, and it lands inside a sentence
 * whose `<b>` has to survive.
 *
 * So it is escaped rather than trusted. Not because НСИ are expected to ship
 * markup, but because "the upstream would never" is the assumption that makes
 * a fetched value dangerous to interpolate — the payload is a file on a CDN,
 * and the guarantee has to hold without knowing who wrote it.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function safeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The Bulgarian preposition for "in", agreeing with the word after it.
 *
 * Bulgarian writes «във» before a word beginning with в- or ф-, and «в»
 * everywhere else. Four of имот.bg's twenty-seven cities and four of НСИ's
 * twenty-eight области begin with В — Варна, Велико Търново, Видин, Враца — so
 * a copy string carrying a bare «в» before a slot is ungrammatical on one
 * reader in seven, on the card they came to the page for.
 *
 * **A rule here rather than a list of exceptions in the copy**, because the
 * cities are data: имот.bg add and retire them, НСИ could rename an област,
 * and a table of four names in `content.js` goes stale on a refresh nobody
 * connects to it. This is the same reasoning `ordinalDay` carries — grammar
 * the copy cannot dodge belongs in a formatter, not in the string
 * (`docs/writing-style.md`).
 *
 * The letter is the whole rule for these names, and it is the rule as taught:
 * «във Варна», «във Видин», «във Франция». Nothing here needs the refinement
 * about consonant clusters, and the English side needs none of it — "in" does
 * not agree with anything.
 *
 * @param {unknown} word  what the preposition will sit in front of
 * @returns {"в"|"във"}
 */
export function bgIn(word) {
  return /^[вфВФ]/.test(String(word ?? "").trim()) ? "във" : "в";
}

/**
 * A calendar year as plain digits — never grouped.
 *
 * `integer()` groups by locale, so a year through it reads «2 015». Years are
 * written without a separator in both languages, and this is the only place
 * the page prints one out of a payload: имот.bg's per-city baseline, which is
 * data rather than a constant.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function yearText(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : "";
}
