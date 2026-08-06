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
 * A percentage carrying its own sign, always.
 *
 * `+{number(x)}%` was printed for the raise and for π, and both can be
 * negative — a pay cut is typeable, and a basket weighted onto the groups that
 * are FALLING makes π negative. Either one rendered as «+−5,0%».
 *
 * The minus is U+2212, matching the table and the pocket figure; the locale's
 * own hyphen is narrower and reads as a dash mid-sentence.
 */
export function percentSigned(x, digits = 1, lang = "bg") {
  if (!Number.isFinite(x)) return "—";
  return (x < 0 ? "−" : "+") + number(Math.abs(x), digits, lang) + "%";
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

/** An ISO date as "17 юли 2026" / "17 Jul 2026". */
export function dateShort(value, lang = "bg") {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
