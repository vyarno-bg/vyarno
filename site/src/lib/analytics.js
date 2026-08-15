/**
 * Visit counting — the one third-party request the site makes.
 *
 * ## Why there is one
 *
 * Donations are not expected to carry this on their own, and the funding that
 * would sit beside them has to be able to state an audience. The host's
 * dashboard cannot: it counts requests to an origin, so a bundle, eleven
 * payloads and a favicon are indistinguishable from eleven readers, and it has
 * no notion of a page being read twice by the same person on the same day.
 *
 * The cost is real and is paid in the open rather than absorbed: one request to
 * `PLAUSIBLE_ORIGIN` per page load, one origin added to the CSP in
 * `public/_headers`, and a section of its own in the privacy notice from
 * v1.6. Anything else that wants to run in a reader's browser pays the same
 * three edits — the list in `_headers` is the whole permission, and it names
 * this origin rather than a class of them.
 *
 * ## What it may not see, which is the part P1 turns on
 *
 * The measured event carries the URL, the referrer, the browser and a country
 * — the fields the host's request log already held — and nothing the reader
 * typed. Salary, rent, savings and basket stay in `mirror.js` in their own tab
 * and are posted nowhere, and `docs/principles.md` still closes session
 * recording and any event fired at the moment a basket is shared. **A custom
 * event or a prop added here is the edit that would break that**, because it is
 * the only place in the tree from which a consumer figure could be made to
 * leave: this module sends the pageview the loaded script sends by itself and
 * calls `window.plausible(...)` nowhere.
 *
 * ## Why this measurer
 *
 * It writes no cookie and no storage key, so nothing about a reader survives
 * the tab. A returning visitor is recognised by a hash of a salt the processor
 * discards every 24 hours, which is an identifier that cannot be joined to
 * anything — including to itself a day later. The one key it touches is
 * `plausible_ignore`, which it READS and never writes: a reader who sets it to
 * `"true"` stops being counted, and that is why the notice names the key rather
 * than only the practice.
 */

/** The single origin `public/_headers` lets the page reach besides its own. */
export const PLAUSIBLE_ORIGIN = "https://plausible.io";

/**
 * The site's own script. The domain it reports is compiled into this filename,
 * so pointing it at another file reports another site's traffic rather than
 * failing.
 */
export const PLAUSIBLE_SCRIPT = `${PLAUSIBLE_ORIGIN}/js/pa-tnlh8vRTKSTvMuk-iNmsc.js`;

/**
 * The only hostname measured, matched exactly.
 *
 * A preview deploy, a LAN address off `npm run dev` and the static server the
 * render suite runs against are all somebody working on the site, and counting
 * them is counting ourselves. Exactness is also what keeps `test:render`
 * hermetic and its `requestfailed` assertion meaningful — the suite that opens
 * a real browser must not depend on a third party being reachable.
 */
export const MEASURED_HOST = "vyarno.bg";

/**
 * Queue, initialise and load the counter, unless this is not the live site.
 *
 * The stub is required rather than defensive: the loaded script initialises
 * only when it finds `plausible.o` already set, which is what `init()` sets, so
 * a page that skips this sends no pageview at all.
 *
 * @param {Document} [doc] the document to attach the script to
 * @param {string} [host] the hostname to measure against `MEASURED_HOST`
 * @returns {boolean} whether the counter was loaded
 */
export function startAnalytics(doc = document, host = location.hostname) {
  if (host !== MEASURED_HOST) return false;

  const win = doc.defaultView;
  win.plausible =
    win.plausible ||
    function () {
      (win.plausible.q = win.plausible.q || []).push(arguments);
    };
  win.plausible.init =
    win.plausible.init ||
    function (options) {
      win.plausible.o = options || {};
    };
  win.plausible.init();

  const tag = doc.createElement("script");
  tag.async = true;
  tag.src = PLAUSIBLE_SCRIPT;
  doc.head.append(tag);
  return true;
}
