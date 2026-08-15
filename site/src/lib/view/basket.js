/**
 * The published HICP divisions the sliders start from, and the link back out.
 *
 * Three wrong numbers live here and each survives a correct formula. Rounding
 * the seeded weights to whole percents makes the default basket sum to 97 and
 * puts a third headline on the page that matches neither Eurostat's rate nor
 * the official-weight one. A verify link pinned to a single category points
 * every row at somebody else's extract, so the reader who checks is shown a
 * different number than the one they clicked. And the fastest-rising card is a
 * comparison with a direction in it, which is exactly backwards when it slips.
 *
 * One of the eleven modules under `src/lib/view/`, paired with
 * `scripts/verify_view_basket.mjs`; `docs/site.md` §"`src/lib/view/` — one
 * module per subject" says which one a new derived value goes in.
 */

/**
 * The weights the sliders are seeded with, straight from the published
 * payload.
 *
 * Deliberately NOT rounded. Rounding each division to a whole percent looks
 * like honesty about slider precision, but it makes the default basket sum to
 * 97 and produces a third headline figure that matches neither Eurostat's
 * all-items rate nor the official-weight basket. The slider's own `step` still
 * governs what the *user* can enter; the seed is exact, so the default view is
 * exactly "the average Bulgarian's basket".
 *
 * @param {Array<{weight_pct:number}>} categories
 * @returns {number[]}
 */
export function officialBasketWeights(categories) {
  return (categories ?? []).map((c) => c.weight_pct);
}

const ESTAT_DATASET_FALLBACK =
  "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en";

/**
 * The "↗" verify link for one HICP row, pointing at the extract that actually
 * contains the number shown beside it.
 *
 * `unit` follows the anchor, not the row: at the "last 12 months" anchor the
 * number is the published annual rate (RCH_A), and at a year anchor it is
 * derived from the monthly index (I15). Sending someone to the index cube to
 * check a rate means they cannot find the figure they clicked.
 *
 * We deliberately do NOT link to the rendered Data Browser table: its query
 * params only bind single-select "page" dimensions, so a `coicop18=CPxx` param
 * is silently ignored and every category degrades to the same default table
 * (CP01, Food). The dissemination extract is the only stable, per-row-correct
 * target — and it is the same URL the publish-time link gate verifies.
 *
 * Takes the row it is describing, so it cannot be closed over one fixed
 * category: pointing every link at CP01 now requires changing the call site to
 * pass the wrong row, not just editing one lookup.
 *
 * @param {{api_url?:string, api_url_index?:string}} row  division or group
 * @param {'y1'|number|string} anchor
 * @returns {string}
 */
export function verifyUrl(row, anchor) {
  const url = anchor === "y1" ? row?.api_url : row?.api_url_index;
  return url || ESTAT_DATASET_FALLBACK;
}

/**
 * The one extract that returns every rate Σ(w·r) is summed from.
 *
 * `verifyUrl` above answers "where do I check THIS row"; this answers "where
 * do I check the figure printed over all of them", which `/how/` puts on a
 * card of its own beside Eurostat's all-items headline. A derivation that says
 * it is ours has to carry its own way to re-run the sum, and a link to one
 * division is not it.
 *
 * **Built from the rows' own `api_url`s rather than from a URL written here.**
 * The first row's extract already carries the endpoint, the geography, the
 * unit and the window Eurostat published this figure at, so what a second
 * division adds to it is its own `coicop18` — the one dimension the query
 * varies. Spelling the base out in this module would freeze BG, RCH_A and a
 * twelve-month window into the front end and let a pipeline that retargets any
 * of them keep a link that returns different digits than the page shows. The
 * count follows the payload for the same reason nothing else about the
 * classification is written here: thirteen divisions is Eurostat's answer for
 * Bulgaria today, not a constant.
 *
 * The other half of Σ(w·r) — the shares — is deliberately not a second link.
 * `prc_hicp_iw` answers in per mille, so «223,23» comes back for a page
 * showing 22,323%, and a reader following it lands on a figure that reads as
 * contradicting the table it was meant to confirm. The shares are on this page
 * already, one to a row, at the precision Eurostat publishes them.
 *
 * @param {Array<{api_url?:string, cp_code?:string}>} categories
 * @returns {string} empty where no row carries an extract, so a caller falls
 *          back rather than rendering a link to nothing
 */
export function basketSumQuery(categories) {
  const rows = (categories ?? []).filter((c) => c?.cp_code);
  const base = rows.find((c) => typeof c.api_url === "string" && c.api_url.startsWith("https://"));
  if (!base) return "";
  return rows
    .filter((c) => c !== base)
    .reduce((url, c) => `${url}&coicop18=${encodeURIComponent(c.cp_code)}`, base.api_url);
}

/**
 * The division whose 12-month rate is highest — the "fastest-rising group"
 * card. Sorted descending; a sign slip here advertises the *slowest*-rising
 * division as the fastest, which reads as plausible and is exactly backwards.
 *
 * @param {Array<{annual_rate_pct:number}>} categories
 * @returns {object|null}
 */
export function fastestRisingDivision(categories) {
  if (!categories?.length) return null;
  return categories.reduce((best, c) => (c.annual_rate_pct > best.annual_rate_pct ? c : best));
}
