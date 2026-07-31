/**
 * The addresses people reach us at, and the names of the four legal documents.
 *
 * This is a separate, deliberately tiny module because **every page imports
 * it** — the footer needs the document names and the contact address on the
 * calculator, the legal page and the 404 alike. `legal.js` carries the
 * documents' actual text (~30 kB of prose in two languages) and is imported
 * only by `/legal/`; putting the two together meant the calculator downloaded
 * the whole terms of use before it could render its first number.
 *
 * `legal.js` builds `DOCS` from `LEGAL_NAV`, so an id or a label still exists
 * in exactly one place. A document added there without an entry here fails
 * `verify_legal.mjs`.
 */

/**
 * Where a person reaches us.
 *
 * One address, named three ways. The three keys are kept because the call
 * sites mean different things — the correspondence data ЗЕТ чл. 4 т. 4
 * requires, a disclosure route security.txt publishes, a GDPR route the
 * privacy notice names — and each may need its own inbox later. Today they
 * all resolve here, because this is the address that exists: publishing one
 * that does not is a contact route that fails silently, which is worse than
 * naming one inbox three times.
 */
export const CONTACT = {
  general: "contact@vyarno.bg",
  security: "contact@vyarno.bg",
  privacy: "contact@vyarno.bg",
};

/**
 * Where the source lives, as one string that the shipped documents interpolate.
 *
 * **This is a legal fact, not a link.** The terms of use send anyone wanting
 * bulk data here instead of scraping the site, and the identity document names
 * it as where the Apache-2.0 grant is exercised. Both are published under
 * ЗЕТ чл. 4, so a URL that 404s is not a broken link — it is a false statement
 * in a legal document, and it is the specific way this breaks: the repository
 * is moving to an organisation account it does not yet have, and six other
 * files plus those two documents each hard-coded the old owner.
 *
 * So it lives here, once, and `verify_legal.mjs` fails on any GitHub URL
 * written directly into the documents, and on any of the six other files that
 * disagrees. Changing the owner is one edit.
 *
 * `REPO_ISSUES_URL` is also the **second contact route under ЗЕТ чл. 4 т. 4** —
 * see the `issues` row in `IDENTITY`. C-298/07 requires an e-mail address plus
 * one other rapid, direct and effective means, and a monitored public issue
 * tracker is the closest thing this architecture has to the answered enquiry
 * template that won that case. It is only that if it is actually monitored.
 */
export const REPO_OWNER = "vyarno-bg";
export const REPO_NAME = "vyarno";
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;
export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const REPO_ISSUES_URL = `${REPO_URL}/issues`;

/**
 * The four documents, in the order they are published and linked, with the
 * short label used in the footer and the on-page contents list.
 */
export const LEGAL_NAV = [
  { id: "terms", nav: { bg: "Условия", en: "Terms" } },
  { id: "privacy", nav: { bg: "Поверителност", en: "Privacy" } },
  { id: "identity", nav: { bg: "Идентификация", en: "Identification" } },
  { id: "sources", nav: { bg: "Източници", en: "Sources" } },
];
