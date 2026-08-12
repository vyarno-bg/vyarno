/**
 * The calculator's state: everything the user types, everything derived from
 * it, and the loader that brings the published figures in.
 *
 * ## Why this file exists
 *
 * Held in `App.svelte`'s `<script>`, this state runs to 3,300 lines and the
 * markup cannot be broken up: the inputs card and most of the result rows read
 * something like sixty values out of one reactive graph, so moving a row into a
 * component means threading twenty props into it, and the next row wants a
 * different twenty. `HomeRow` and `TaxWedgeRow` take fifteen props each, which
 * is the shape of the problem rather than a solution to it — extracting more
 * rows that way trades one long file for a dozen wide interfaces.
 *
 * Runes are not confined to `.svelte` files. A `.svelte.js` module compiles the
 * same way, so the graph can live in one object that components read directly
 * — one `calc` prop instead of twenty, and a component's prop list stops
 * describing the graph's internals.
 *
 * ## What belongs here and what does not
 *
 * This is a fifth layer under the four in `docs/site.md`, and it is a thin
 * one on purpose:
 *
 *   Data (`data.js`) → Formula (`mirror.js`) → Wiring (`view.js`)
 *     → **State (this file)** → Render (the components)
 *
 * Nothing here computes. Every derived value is a call into `view.js` or
 * `mirror.js` with named arguments; this file decides *when* those functions
 * run and *what holds their result*, and that is all it is allowed to decide.
 * Arithmetic that appears here is arithmetic no test can reach — the rule
 * `view.js` was extracted to enforce, and moving the graph does not relax it.
 *
 * Language does not belong here either. `cityPriceDated`, the preset label
 * and the share sentence all pick words, so they stay in the components that
 * render them, where `$lang` auto-subscription actually works. What is left is
 * language-agnostic: numbers, and the payloads they came from.
 *
 * ## One convention, no exceptions
 *
 * **Every mutating handler is an arrow-function class field, never a method.**
 * A template that passes a method bare — `oninput={calc.onRaiseInput}` — hands
 * over a detached function whose `this` is `undefined`, and the failure is a
 * runtime error in an event handler, which is to say a silent one. Binding at
 * the call site works too, but it is a rule with an exception to remember, and
 * this is a rule without one.
 */
import { HOME, PRESETS } from "./content.js";
import { parseDecimal } from "./format.js";
import { loadAll, mortgageDefaultRate, mortgageAprc, mortgageLendingLimits } from "./data.js";
import { payloadsFor } from "./payloads.js";
import {
  latestIndexYear,
  officialInflation,
  pocketReal,
  extraPerMonth,
  pocketPerMonth,
  buildLadder,
  rentBurden,
  rentDays,
  homeYears,
  targetRaise,
  bgNetSalary,
  meanRungPosition,
  payrollParams,
  divisionRate,
  officialSplit,
  contributions,
  personalInflationDetailed,
  householdNet as sumHouseholdNet,
} from "./mirror.js";
// The derived values below live in $lib/view as pure functions, so the wiring
// between a formula and its input is testable. Wiring that lives in a
// `$derived(...)` is wiring nothing can test — see view.js's header.
import {
  officialBasketWeights,
  convertPay,
  dataAge,
  earnerRanks,
  headlineIsFlash,
  headlineRate,
  householdRaise,
  netsOf,
  payLadder,
  quarterGrid,
  sectorComparison,
  sectorOptions as publishedSectorOptions,
  regionGap,
  cityHomeAtAverageWage,
  regionQuarter as publishedRegionQuarter,
  nationalQuarter as publishedNationalQuarter,
  nationalRow,
  cityTrend,
  regionNames,
  cityCoverage,
  cityRow,
  SOFIA_CITY_CODE,
  systemWedgeLadder,
  savingsSince2020,
  housingCarveOut,
  basketBudget,
  clampSpendShare,
  exposedSpend,
  leftoverIfHeldAsCash,
  homePriceFor,
  homePriceBasis,
  clampTerm,
  mortgagePanel,
  verifyUrl,
  taxWedgePanel,
  payslipPanel,
  sharePayload,
} from "./view.js";

/**
 * The route this module serves, and the one argument `loadAll` and the panel
 * both take.
 *
 * A constant rather than a parameter because this class **is** the calculator
 * page — nothing else mounts it. Threading it in as an option would let a
 * caller ask for one route's data while the panel dated another's, which is
 * precisely the pairing `payloadsFor` exists to make impossible.
 */
const PAGE = "home";

/**
 * How many incomes the pay card will hold.
 *
 * Not a statement about households — it is where the card stops being
 * readable. Every earner draws an input, a gross summary, a payslip, a
 * comparator sentence and a marker on two charts, and past six of those the
 * card is longer than the results it feeds. The control disappears at the
 * limit rather than the seventh income being accepted and ignored: an input
 * that takes a number and drops it is the failure this bound exists to avoid.
 */
export const MAX_EARNERS = 6;

export class Calculator {
  /**
   * @param {Record<string, object>|null} [payloads]  the `loadAll()` result,
   *   already in hand. Only `scripts/prerender.mjs` passes one: it reads the
   *   published JSONs off disk at build time so the served HTML carries the
   *   country's figures rather than an empty region.
   *
   * **The freshness verdict is deliberately not seeded with them.** `dataAge`
   * judges each payload against its cadence and the current time, and the
   * build's clock is not the reader's — a page stamped "fresh" the day it was
   * built goes on saying so for as long as it is served. `load()` computes it
   * in the reader's own tab, against the reader's own clock, which is the only
   * one that answers the question. So `dataRows` stays empty here and the
   * staleness banner stays down until the bundle runs.
   */
  constructor(payloads = null) {
    if (payloads) {
      this.data = payloads;
      this.dataReady = true;
    }
  }

  // ---------------------------------------------------------------------
  // The published figures
  // ---------------------------------------------------------------------
  data = $state({});
  dataReady = $state(false);
  dataStale = $state(false);
  dataDaysOld = $state(0);
  dataOldestAsOf = $state("");
  /** One row per manifest payload: status, dates, what it feeds. See view.js#dataAge. */
  dataRows = $state([]);
  reloading = $state(false);

  // ---------------------------------------------------------------------
  // What the user types
  // ---------------------------------------------------------------------
  // ONE ENTRY PER EARNER, monthly NET take-home in EUR. Never a household
  // total: the insurance ceiling is per contract, so summing first and
  // inverting afterwards understates a two-earner household's gross by
  // hundreds of euro a month (mirror.js#bgHouseholdPayroll has the worked
  // example). The total is `householdNet` below, derived from this and never
  // typed into.
  //
  // 900 EUR is a round PLACEHOLDER, not a statistic: no published series here
  // carries a national median net wage, so there is nothing to source a
  // "typical" default to (docs/principles.md P7 — no unsourced defaults). It
  // lands near the middle of the net ladder `buildLadder` composes, and that is
  // the reason the copy under this field asks the reader to replace it rather
  // than calling it typical: a round number close to the median is more
  // convincing as a measurement, not less.
  //
  // A single-earner household is a list of one, and the page renders exactly
  // as it did before anybody thought about households. Nothing about the
  // second income exists until the reader asks for it.
  //
  // Each entry is `{ amount, stashed, raise, raiseText }`, never a bare number:
  //   amount     what the reader typed, in whatever `payBasis` says
  //   stashed    the last amount they typed in the OTHER basis, or null
  //   raise      that earner's own change over the window, percent, NaN if unsaid
  //   raiseText  the characters in the raise box, which `raise` is the parse of
  // One object per person rather than four parallel arrays, because removing
  // an income has to remove all four and parallel arrays are where that goes
  // wrong — silently, and one earner out of step.
  //
  // `raiseText` is here rather than in the component for exactly that reason.
  // The raise field is `type="text"` so a comma reaches `parseDecimal` (see
  // format.js), which means something has to hold the string; held beside the
  // template's `{#each}` index it survives the earner it belongs to being
  // removed, and the next reader to add an income inherits somebody else's
  // number in a box the model says is empty.
  earners = $state([{ amount: 900, stashed: null, raise: NaN, raiseText: "" }]);
  /**
   * Which figure the pay fields carry.
   *
   * The reader's payslip states a net and their contract states a gross, and
   * which of the two they know is not something we can guess. Everything below
   * runs on the net either way: `netsOf` is the single place the conversion
   * happens, so no downstream figure has to care.
   *
   * NET stays the default. Every result on this page is a statement about
   * take-home, and the placeholder above is documented against the NET ladder —
   * changing which basis a reader meets first is a P7 decision with no data
   * behind it.
   */
  payBasis = $state("net");
  // Whether the reader has typed over that placeholder. The figures derived
  // from it are second-person claims — what the same life costs *you*, what
  // *your* gross is before deductions, where *you* sit on the national pay ladder —
  // and every one of them is about a person earning the placeholder until this
  // flips.
  //
  // The hint that says so is attached to the input, and on a 360px phone that
  // input sits at y=481 with the first of those claims a screen and a half
  // below it (`card.css` orders the pay card, then the results, then the rest
  // of the inputs). A caveat and its number that far apart are two separate
  // things a reader has to connect for themselves. So this flag exists to make
  // the claims wait instead — the rule `presetActive` already keeps for the
  // hand-made baskets, that a caveat travels with its number rather than with
  // the control that produced it.
  //
  // Adding an income does NOT set it. An empty second field is a question the
  // reader has started answering, not an answer, and the €900 in the first one
  // is still the placeholder every figure is standing on.
  earnersDirty = $state(false);
  // Whether any raise field has been touched. The raises themselves live on
  // the earners; this is only the "has a human been here" flag, and it is
  // separate from `earnersDirty` because the two gate different sentences.
  raiseDirty = $state(false);
  anchor = $state("y1");
  rent = $state(0);
  // Empty, like the rent beside it, and for the same reason the payslip is
  // `null` for a salary nobody typed: «спестеното» is a row that says what
  // inflation took off THIS reader's money, and it has no caveat available to
  // it. The pay placeholder can carry one — «сметнато е с начална заплата
  // €900 на месец, не с твоята» sits on the figure it produced, and the two
  // rows that make a claim about the reader rather than about prices
  // («в джоба», «къде си по заплата») wait for `earnersDirty` instead. A
  // stand-in savings balance has neither route: −€285 under «спестеното»
  // reads as a fact about the visitor before they have typed a character, and
  // a note explaining that the €1,000 above it is ours would be a fourth
  // sentence on a card that already carries three.
  //
  // So the row appears when there is a balance to talk about, which is the
  // rule `rent` and the home block already keep.
  cash = $state(0);

  // The home block.
  homeOn = $state(false);
  m2 = $state(HOME.m2Default);
  rate = $state(HOME.rateDefaultPct);
  // Whether the user has typed over the live rate. Until they have, the
  // published ECB figure wins on every refresh; after, their number is theirs.
  rateTouched = $state(false);
  term = $state(HOME.termDefaultYears);
  // "auto" → price derived from the imot.bg median × m² (the typical-buyer
  // case). "manual" → the user found the home and typed its asking price, so
  // only the payment maths matters.
  priceMode = $state("auto");
  manualPrice = $state(0);

  // ---------------------------------------------------------------------
  // The basket the user is describing
  // ---------------------------------------------------------------------
  //
  // `weights` holds ONE amount per ECOICOP ver.2 division, in published order
  // (CP01…CP13). In "%" mode those amounts are percentage shares; in "€" mode
  // they are euros per month. Nothing downstream cares which: every consumer
  // normalises by Σ, so a basket described as "22, 6, 4, …" and one described
  // as "€330, €90, €60, …" produce the same personal inflation. That is what
  // lets the mode toggle be a pure display choice rather than a second
  // calculator.
  weights = $state([...PRESETS.official]);
  activePreset = $state("official");
  /** "pct" = share sliders · "eur" = actual euros per month. */
  spendMode = $state("pct");
  /**
   * Share mode only: how much of what is left after housing the reader says
   * they actually spend, 0–100.
   *
   * **100 is the only defensible starting value.** Percentage shares describe
   * how a pot divides and say nothing about its size, so before the reader
   * answers, the app has to assume some size for it — and every value below 100
   * shrinks their headline "≈ €X more every month" without their having claimed
   * anything, which is a flattering default over an unsourced one
   * (docs/principles.md P7). A national household savings rate would be a
   * source, and it would still be the wrong one: it is a different household's
   * answer to a question this reader is standing in front of.
   *
   * In euro mode this is ignored — `view.js#basketBudget` measures the
   * remainder off the thirteen typed amounts instead, so the stated claim and
   * the measured one are never both live.
   */
  spendSharePct = $state(100);
  /** Master switch for the ECOICOP level-2 drill-down. */
  detailMode = $state(false);
  /** Which divisions are currently expanded (by index). */
  // A plain Set, never mutated in place: `toggleDivision` builds a new one and
  // reassigns, which is what makes `$state` see the change.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  openDivisions = $state(new Set());
  /**
   * Per-division split across its groups, or `null` for "untouched".
   *
   * `null` is load-bearing, not laziness: an untouched division uses its own
   * published rate, so opening a division to look inside never moves the
   * user's number. Only editing a group does. See mirror.js#divisionRate.
   */
  splits = $state(PRESETS.official.map(() => null));

  /**
   * Whether a payload has already seeded the basket.
   *
   * **The seeding is once per calculator, and this is the field that makes it
   * so.** `syncWithData` runs from an `$effect` that also clamps the term, so
   * it re-runs whenever the reader edits the term or the rate — and a run that
   * seeds overwrites the thirteen weights, the splits, the preset and the %/€
   * mode with the published basket. Unguarded, a reader who spends a minute
   * describing what they buy and then changes the mortgage term watches it go
   * back to the national average, with nothing on screen saying why. Remembered
   * inputs make that worse rather than differently: the reseed is persisted a
   * moment later, so the saved basket goes from the device too.
   *
   * NOT `$state`, deliberately. The effect reads it, and a reactive flag read
   * and written in the same pass is a dependency on the thing being guarded.
   */
  basketSeeded = false;

  /** The method drawer's open state, held here so the header can close it. */
  drawerOpen = $state(false);

  /** The data panel's open state. Same reason: it outlives its component. */
  panelOpen = $state(false);

  // ---------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------
  /**
   * Fetch every published payload and re-derive the staleness verdict.
   *
   * Deliberately has no `catch`: `loadAll` already turns a failed fetch into a
   * `null` payload, so the only way this throws is a bug in our own code, and
   * swallowing that would leave the page in the "loading" state for ever with
   * nothing in the console. Crashing loudly is the correct handling — the
   * calculator's own failure state is for *missing data*, not for a broken
   * loader.
   */
  load = async () => {
    this.data = await loadAll(PAGE);
    this.dataReady = true;
    // Staleness is age-based off `as_of` (the date the pipeline last refreshed
    // each JSON) — no hardcoded release date to maintain — and it is judged per
    // payload against that payload's own cadence, so a quarterly series two
    // months old is fresh while a monthly one two months old is not. The banner
    // fires when some payload is genuinely overdue, and the panel shows which.
    // See view.js#dataAge and the cadences in payloads.js.
    const age = dataAge(this.data, payloadsFor(PAGE));
    this.dataDaysOld = age.daysOld;
    this.dataStale = age.stale;
    this.dataOldestAsOf = age.oldestAsOf;
    this.dataRows = age.rows;
  };

  /**
   * The retry on the failure state. Re-runs the same fetch instead of
   * reloading the page, so anything the user has already typed survives the
   * attempt — a page reload would throw their salary and basket away to fix
   * our network problem.
   */
  reload = async () => {
    if (this.reloading) return;
    this.reloading = true;
    try {
      await this.load();
    } finally {
      this.reloading = false;
    }
  };

  /**
   * Adopt whatever the freshly-loaded payloads imply. Called from an `$effect`
   * in `App.svelte` rather than at the end of `load()`, because the term clamp
   * has to re-run when the *user* types a term past the cap, not only when new
   * data arrives.
   *
   * That is also why the basket is seeded once and not on every run — the same
   * effect fires on a term the reader typed, and a pass that seeds takes their
   * basket with it. `basketSeeded` above carries the failure; the clamp below
   * stays outside the guard because it is the reason this runs at all.
   */
  syncWithData = () => {
    if (this.dataReady && this.data.hicpCategories && !this.basketSeeded) {
      // Seed from the LIVE published weights, not the PRESETS copy, and NOT
      // rounded — rounding each division to a whole percent made the default
      // basket sum to 97 and put a third inflation figure (5.30%) on screen
      // next to Eurostat's 5.20% and the official basket's 5.36%. See
      // view.js#officialBasketWeights.
      this.weights = officialBasketWeights(this.data.hicpCategories.categories);
      this.splits = this.data.hicpCategories.categories.map(() => null);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      this.openDivisions = new Set();
      this.activePreset = "official";
      this.spendMode = "pct";
      this.basketSeeded = true;
    }
    if (this.dataReady && this.data.mortgage) {
      // Only adopt the live default while the user hasn't touched the input.
      if (!this.rateTouched) this.rate = this.mortgageRateData.pct;
    }
    // Clamp the term to the BNB maturity cap (view.js#clampTerm).
    this.term = clampTerm(this.term, this.limits);
    // Do not auto-fill raise. We don't have a nominal wage index.
  };

  /**
   * Everything the reader typed, as plain JSON — what `stores.js` keeps on the
   * device for somebody who asked it to.
   *
   * **The published figures are not in here and must not be.** `data`,
   * `dataRows` and the freshness verdict are re-fetched on every visit and
   * judged against the reader's own clock; a copy of them on the device would
   * be the one thing P4 forbids, a stale payload with no date on screen to say
   * so. What is here is the other half: numbers nobody but the reader can
   * supply, which is exactly what a reload would otherwise throw away.
   *
   * `raiseText` travels and `raise` does not. The parse is one call
   * (`parseDecimal`) and the characters are what the box shows, so storing the
   * string keeps the field and the model saying the same thing — and NaN, which
   * is what an unsaid raise IS, does not survive JSON in the first place.
   *
   * `stashed` stays behind for the opposite reason: it is the amount the reader
   * last typed in the OTHER basis, which is a draft of an edit in progress
   * rather than an answer they gave.
   */
  snapshot = () => ({
    earners: this.earners.map((e) => ({ amount: e.amount, raiseText: e.raiseText })),
    earnersDirty: this.earnersDirty,
    raiseDirty: this.raiseDirty,
    payBasis: this.payBasis,
    anchor: this.anchor,
    rent: this.rent,
    cash: this.cash,
    homeOn: this.homeOn,
    m2: this.m2,
    rate: this.rate,
    rateTouched: this.rateTouched,
    term: this.term,
    priceMode: this.priceMode,
    manualPrice: this.manualPrice,
    weights: [...this.weights],
    splits: this.splits.map((s) => (s ? [...s] : null)),
    activePreset: this.activePreset,
    spendMode: this.spendMode,
    spendSharePct: this.spendSharePct,
    detailMode: this.detailMode,
    sectorKey: this.sectorKey,
  });

  /**
   * Put a saved snapshot back, or refuse it whole.
   *
   * **The three checks here are the ones `stores.js` cannot make**, because
   * each is a fact about a published payload or about this card rather than
   * about the shape of a JSON object: how many divisions the basket has, how
   * many groups each division has, and how many incomes the pay card holds.
   * They are what stops a saved basket from being read back against a payload
   * that has since changed — thirteen weights spread over fourteen divisions is
   * a wrong personal inflation wearing the appearance of the reader's own
   * choice, and no gate upstream can see it because nothing published is wrong.
   *
   * All-or-nothing rather than field by field: a half-applied snapshot is a
   * page half describing the reader, and which half is silent.
   *
   * Called once the payloads have landed, so the seeding in `syncWithData` has
   * already run and this is what the reader ends up looking at.
   *
   * @param {Record<string, any>} saved  a `stores.js#readInputs` result
   * @returns {boolean} whether it was applied
   */
  restore = (saved) => {
    const divisions = this.categories;
    if (saved.earners.length < 1 || saved.earners.length > MAX_EARNERS) return false;
    if (saved.weights.length !== divisions.length) return false;
    if (saved.splits.length !== divisions.length) return false;
    const splitsFit = saved.splits.every(
      (split, i) => split === null || split.length === (divisions[i].groups?.length ?? 0)
    );
    if (!splitsFit) return false;

    this.earners = saved.earners.map((e) => ({
      amount: e.amount,
      stashed: null,
      raise: parseDecimal(e.raiseText),
      raiseText: e.raiseText,
    }));
    this.earnersDirty = saved.earnersDirty;
    this.raiseDirty = saved.raiseDirty;
    this.payBasis = saved.payBasis;
    this.anchor = saved.anchor;
    this.rent = saved.rent;
    this.cash = saved.cash;
    this.homeOn = saved.homeOn;
    this.m2 = saved.m2;
    this.rate = saved.rate;
    this.rateTouched = saved.rateTouched;
    // Through the clamp, not verbatim: the BNB maturity cap is published, so a
    // term saved under a longer one would quote a payment no bank may offer.
    this.term = clampTerm(saved.term, this.limits);
    this.priceMode = saved.priceMode;
    this.manualPrice = saved.manualPrice;
    this.weights = [...saved.weights];
    this.splits = saved.splits.map((s) => (s ? [...s] : null));
    this.activePreset = saved.activePreset;
    this.spendMode = saved.spendMode;
    this.spendSharePct = saved.spendSharePct;
    this.detailMode = saved.detailMode;
    this.sectorKey = saved.sectorKey;
    return true;
  };

  // ---------------------------------------------------------------------
  // Derived: the published payloads, unpacked
  //
  // `data` is `{}` until `load()` replaces it, and `loadAll` puts `null` in
  // for a payload that failed to fetch — so `data.<key>?.field` already covers
  // both the before-fetch and the failed-fetch state, and every consumer below
  // is written to take a missing payload. `dataReady` gates what is RENDERED
  // (App.svelte's loading state) and when the basket is SEEDED
  // (`syncWithData`); it is not a second null check on top of the optional
  // chain, and reading it as one leaves two conditions that can disagree.
  // ---------------------------------------------------------------------
  categories = $derived(this.data.hicpCategories?.categories ?? []);
  /**
   * What the strip header dates itself by: the reference period of the headline
   * inflation figure — the month the prices are FROM, never a fetch date.
   *
   * A reader quoting "inflation is 2.6%" needs to know it is June's figure. That
   * we downloaded it on 27 July tells them nothing and reads as though the prices
   * were current to that day. The fetch dates are in the panel, one per payload.
   *
   * The BASKET's month, not the headline's, and they differ only during
   * Eurostat's flash. "Числата са към…" is a claim about the page, and almost
   * every figure on it — thirteen divisions, forty-six groups, the personal
   * rate, the savings card — comes from `hicp_categories.json`. Dating the page
   * by the one payload that ran ahead would post July over a page of June.
   * The headline keeps its own date either way: it is rendered beside this with
   * `ref_period` in the same strip.
   */
  asOfDisplay = $derived(this.basketRefPeriod || this.headlineRefPeriod);
  showStaleBanner = $derived(this.dataReady && this.dataStale);
  /** How many payloads are overdue against their own cadence — what the banner counts. */
  dataOverdueCount = $derived(this.dataRows.filter((r) => r.status === "overdue").length);

  // Eurostat's all-items figure, verbatim. `headlineRate` takes only the
  // headline payload so it cannot be handed `categories` and quietly become
  // Σ(w·r) — a different number by ~0.16 pp. See view.js#headlineRate.
  headline = $derived(headlineRate(this.data.hicpHeadline));
  // Whether that figure is Eurostat's early estimate for the month. Off the
  // payload's own field — see view.js#headlineIsFlash for why the two months
  // are not the thing to read it from.
  headlineIsFlash = $derived(headlineIsFlash(this.data.hicpHeadline));

  // Derived: mortgage default rate (live, with fallback chain). Wired from
  // mortgage.json when available, otherwise HOME.rateDefaultPct is the offline
  // sentinel. See data.js#mortgageDefaultRate for the chain.
  mortgageRateData = $derived(mortgageDefaultRate(this.data.mortgage));

  // APRC (ГПР) on the same new loans — interest plus fees. Displayed next to
  // the rate, never used as the payment rate: the annuity needs the interest
  // rate, so computing the payment off APRC would overstate it.
  mortgageAprcData = $derived(mortgageAprc(this.data.mortgage));

  // BNB borrower-based limits (LTV-O 85% ⇒ 15% down, DSTI-O 50% of net,
  // maturity 30y). Data-driven so a regulatory change is a pipeline re-run,
  // not a code edit. Falls back to the same literals offline.
  limits = $derived(mortgageLendingLimits(this.data.mortgage));

  // €/m² reading for the home block: prefers the chosen city's own
  // `eur_per_m2_median` row, and falls back to HOME.eurPerM2_offlineFallback
  // when the JSON hasn't loaded yet (first paint, offline build).
  //
  // `cityPriceIsLive` says WHICH of the two is on screen, and every consumer
  // has to ask. The fallback is a round constant with no measurement behind
  // it; presented as имот.bg's median it is a plausible number wearing someone
  // else's provenance, which is worse than showing nothing at all.
  cityRowNow = $derived(cityRow(this.data.cityPrice, this.cityCode));
  cityPriceIsLive = $derived(Boolean(this.cityRowNow?.eur_per_m2_median));
  cityEurPerM2 = $derived(
    this.cityRowNow?.eur_per_m2_median || (HOME.eurPerM2_offlineFallback ?? 2500)
  );
  cityPriceAsOf = $derived(this.data.cityPrice?.as_of ?? "");
  cityPricePageDate = $derived(this.cityRowNow?.snapshot_date ?? "");
  cityNDistricts = $derived(this.cityRowNow?.n_districts ?? 0);
  // The chosen city's own price history. The pipeline fetches one snapshot per
  // qualifying archive year on every refresh; the SPA reads this array verbatim
  // (already sorted ascending by year) and renders a small sparkline plus the
  // since-baseline delta on the stat card. How far back it runs is per city —
  // имот.bg's archive reaches 2003 for three of them and last year for others —
  // so no year belongs in this comment. Empty array → the payload carries no
  // historical block for that city.
  cityHistorical = $derived(
    Array.isArray(this.cityRowNow?.historical) ? this.cityRowNow.historical : []
  );
  // The rise since this city's own baseline year, that year, and whether the
  // run behind them is long enough to be called a trend. All three off
  // `view.js#cityTrend`, on the READER's город.
  //
  // **The baseline is per city and is not a constant.** How far back имот.bg's
  // coverage of a city supports a comparison differs by two decades between
  // София and Смолян, so a year written down here would mean a different
  // sample in every city and a wrong number in most of them.
  //
  // **And it is `this.cityCode`, not `this.referenceCode`.** Taken off
  // `cityHome` — which is `/how/`'s and stays София on purpose — the card
  // printed София's baseline year and София's +232% beside Варна's €/m², under
  // Варна's name, with the chart's own end labels correctly Варна's. Every
  // figure on the card was real and two of them were about somewhere else.
  //
  // Which END of the array each figure comes from is the wiring
  // `docs/site.md` §"A correct formula fed the wrong number" keeps out of the
  // reactive graph: `.at(-1)` against `[0]` is a one-character difference
  // between the rise since the baseline and the baseline level itself. That is
  // what `cityTrend` is for, and it is the one implementation both surfaces
  // call.
  cityTrendNow = $derived(cityTrend(this.data.cityPrice, this.cityCode));
  citySinceBaselinePct = $derived(this.cityTrendNow.sinceBaselinePct);
  cityBaselineYear = $derived(this.cityTrendNow.baselineYear);
  cityTrendPublishable = $derived(this.cityTrendNow.trendPublishable);
  cityBaselineMedian = $derived(this.cityHistorical[0]?.eur_per_m2_median ?? 0);

  // Which област every city-scoped figure below is read from — the reader's
  // own choice, and "" until they make one.
  //
  // **There is no default and the empty string is a real state.** P7: a
  // preselected София hands a Бургас reader Sofia's average wage and Sofia's
  // €/m² wearing the appearance of a choice they made. `view.js#regionQuarter`
  // and `view.js#cityRow` both answer with nothing for "", so every figure
  // downstream is zero and the two cards render what they are waiting for,
  // while every national figure on the page renders in full.
  regionCode = $state("");

  // And which град the €/m² is read from. The same code — `regions.py` keys
  // both payloads by it — but a SEPARATE field, because the two files cover
  // different sets: 28 области have a wage and 27 cities have a price. For
  // Софийска област the wage exists and the price does not, and one field
  // could not express that without the price card borrowing a neighbour's
  // figure, which is the substitution this whole setting exists to end.
  cityCode = $derived(this.regionCode);

  /** НСИ's own name for the chosen област, or "" — never a transliteration,
      and disambiguated by `view.js#regionDisplayName` where their own label
      cannot stand alone in a list. */
  regionNamesNow = $derived(regionNames(this.data.regionSalary, this.regionCode));
  regionNameBg = $derived(this.regionNamesNow.bg);
  regionNameEn = $derived(this.regionNamesNow.en);
  /** имот.bg's own name for the chosen град. Distinct from the област's for
      София, and the same word for the other 26. */
  cityNameBg = $derived(this.cityRowNow?.bg_name ?? "");
  cityNameEn = $derived(this.cityRowNow?.en_name ?? "");
  /** True once a reader has picked. Every city-scoped card gates on this rather
      than on a zero figure: a payload that failed to load and a reader who has
      not chosen are different things, and the copy says different things about
      them. */
  regionChosen = $derived(Boolean(this.regionCode));
  /** Which of the three coverage states the chosen област's €/m² is in —
      имот.bg publish it and we have it, they publish it and this refresh did
      not reach it, or they publish no page for it at all. The last is the only
      one that may be stated in имот.bg's name, and `view.js#cityCoverage`
      carries why. */
  cityCoverageNow = $derived(cityCoverage(this.data.cityPrice, this.cityCode));

  // ---------------------------------------------------------------------
  // The reference област — `/how/`'s, and nobody's
  //
  // **`/how/` is the country page and has no reader in it.** Every figure on
  // it is a function of the published payloads alone, which is what makes it
  // safe to freeze into served HTML (docs/seo.md) and what keeps a page with
  // no inputs from acquiring one. A reader's chosen област is an input, so the
  // four derivations that page renders may not take it — hydrated, the page
  // would rewrite itself into a different set of numbers than the crawler and
  // the first paint saw.
  //
  // So `/how/` names one place and says which: София-city, because it is the
  // largest, because it is the one област whose град and област coincide, and
  // because it is what that page has always been about. That is a different
  // thing from a DEFAULT — the calculator's own cards still show nothing until
  // a reader chooses (P7). A page that says «жилище в София» is stating where
  // its figure is from; a card that says it to somebody who never picked
  // София is answering a question they did not ask.
  // ---------------------------------------------------------------------
  referenceCode = SOFIA_CITY_CODE;
  referenceCityRow = $derived(cityRow(this.data.cityPrice, this.referenceCode));
  /** `/how/`'s €/m² provenance, read off the reference city rather than the
      reader's. */
  refCityPriceIsLive = $derived(Boolean(this.referenceCityRow?.eur_per_m2_median));
  refCityPriceAsOf = $derived(this.data.cityPrice?.as_of ?? "");
  refCityPriceSnapshot = $derived(this.referenceCityRow?.snapshot_date ?? "");
  // The average monthly GROSS pay in that област — the comparator on the strip,
  // and the one number two cards and the whole percentile ladder hang off.
  // `region_salary.json` publishes НСИ's own quarterly series per област, so
  // `view.js#regionQuarter` selects the headline rather than computing one —
  // that function carries why it is a quarter (the March bonus spike) and why
  // nothing here is allowed to average it (docs/legal.md §НСИ).
  // The offline sentinel goes through the same function as the live payload,
  // because it is the same shape. One implementation, so the offline figure
  // cannot drift from the online one.
  regionQuarter = $derived(
    publishedRegionQuarter(this.data.regionSalary || HOME.regionSalaryFallback, this.regionCode)
  );
  // **A MEAN, and the name has to keep saying so.** НСИ publish an average
  // gross wage, and `mirror.js#composeLadder` divides it by `shape.ses_mean` —
  // Eurostat's own mean — to get the scalar every rung is multiplied by. Feed
  // that divisor a median instead and the whole ladder shifts by the
  // mean-to-median ratio of a right-skewed wage distribution (about 1.35 on
  // SES's own figures, €949 against €705), which moves every percentile the
  // page reports without moving anything that looks wrong. Nothing downstream
  // can detect the swap, because a rescaled ladder is still a monotonic
  // ladder — so the guard is that the two ends agree by name.
  regionMeanGrossEur = $derived(this.regionQuarter?.value || 0);
  // The provenance URL for the comparator card. When the live JSON is loaded,
  // link to its source_url (the NSI XLSX endpoint — same place the connector
  // fetched from). Otherwise fall back to the human-readable landing page.
  regionMeanGrossUrl = $derived(
    this.data.regionSalary?.source_url || HOME.regionMeanGrossSourceUrl
  );
  // The quarter the figure describes ("2026-Q1"), not НСИ's latest single
  // month — the caption has to date the number actually shown.
  //
  // Named for the reference period rather than for `as_of`, which every
  // payload also carries and which means the day we fetched the file. The two
  // are weeks apart, and a caption reading «≈ 1486 нето · 2026-07-30» dates
  // Q1's average to a day in July.
  regionWagePeriod = $derived(this.regionQuarter?.refPeriod ?? "");
  // Whether НСИ will still revise that quarter. Read off the same selection as
  // the value and the period, so a card cannot show one quarter's figure under
  // another quarter's marker.
  regionWageIsPreliminary = $derived(Boolean(this.regionQuarter?.isPreliminary));

  // Payroll parameters — live from the pipeline-published payroll.json when
  // loaded, else the frozen offline sentinel (BG_PAYROLL_DEFAULT). All
  // gross↔net math below flows through these, so a BG law change only needs a
  // pipeline re-run, no SPA code change.
  payroll = $derived(payrollParams(this.data.payroll));

  // ---------------------------------------------------------------------
  // Derived: the country, with nobody in it
  //
  // The four below are what `/how/` renders, and every one of them is a
  // function of the published payloads alone — no field on this object that a
  // reader can type into appears in any of their arguments. That is what makes
  // them safe to freeze into served HTML (docs/seo.md) and what keeps a page
  // with no inputs from acquiring one: `cityHome` takes `HOME.m2Default` and
  // NOT `this.m2`, which is the reader's slider and would put their number
  // into a sentence about Sofia.
  // ---------------------------------------------------------------------
  /** The tax wedge at round gross salaries — the system's curve, not a person's. */
  systemWedge = $derived(systemWedgeLadder({ payroll: this.data.payroll }));
  /** The SES ladder as rows, each saying whether SES surveyed it or we modelled it. */
  payLadderRows = $derived(
    payLadder({
      salaryDist: this.data.salaryDist,
      sectorSalary: this.data.sectorSalary,
      payroll: this.data.payroll,
    })
  );
  /** A median Sofia flat priced against the Sofia average wage, in years of it. */
  cityHome = $derived(
    cityHomeAtAverageWage({
      cityPrice: this.data.cityPrice,
      cityCode: this.referenceCode,
      regionSalary: this.data.regionSalary,
      regionCode: this.referenceCode,
      payroll: this.data.payroll,
      m2: HOME.m2Default,
    })
  );
  // НСИ's own quarterly cells, a year to a row — selected, never averaged. The
  // COUNTRY's, because the ladder printed above the table is anchored on the
  // country's average: a table of София's quarters under a national ladder
  // invites the reader to check one against the other and find they do not
  // meet.
  nationalWageGrid = $derived(quarterGrid(nationalRow(this.data.sectorSalary)));

  // ---------------------------------------------------------------------
  // Derived: the pay packet
  // ---------------------------------------------------------------------
  /**
   * What the household brings home, and the denominator of every figure that
   * is about money rather than about a person: the basket, rent, the mortgage
   * cap, the cost of the year's prices.
   *
   * **It is derived and never typed into.** The reader enters earners; this is
   * their sum. There is no field on the page that sets it, so there is no path
   * by which a total reaches the per-person functions that must not see one.
   */
  /**
   * What the reader typed, and what it is. One object, so nothing downstream
   * can receive an amount without its basis — see view.js#payslipPanel.
   */
  pay = $derived({ basis: this.payBasis, amounts: this.earners.map((e) => e.amount) });
  /**
   * Every earner's take-home, whichever basis they typed in. The ONE place a
   * gross becomes a net (view.js#netsOf); everything below reads this and never
   * `pay` — rent, the basket and the 30% mortgage line are all statements about
   * take-home, and fed a gross each is wrong by around 29%.
   */
  nets = $derived(netsOf(this.pay, this.data.payroll));
  householdNet = $derived(sumHouseholdNet(this.nets));
  /** True once the reader has described more than one income. */
  hasHousehold = $derived(this.earners.length > 1);
  /** Whether another income can be added — the card's own limit, not a claim. */
  canAddEarner = $derived(this.earners.length < MAX_EARNERS);

  // Salary input is NET take-home (most users know their payslip, not their
  // GROSS contract amount), so the contract gross is back-computed from it.
  // `payslipPanel` owns both the inversion and the itemisation, takes the
  // PUBLISHED payload rather than the mapped params, and returns null for an
  // empty field rather than a column of zeroes.
  //
  // It is handed `earners` and not `householdNet`, and that is the whole
  // household fix: each contract is inverted against its own insurance
  // ceiling, then the columns are added. The panel takes no scalar, so the
  // total cannot be passed here even by accident.
  payslip = $derived(payslipPanel({ payroll: this.data.payroll, pay: this.pay }));
  regionNet = $derived(bgNetSalary(this.regionMeanGrossEur, this.payroll).net);

  // "The flat tax is not flat" — the tax wedge. Takes the PUBLISHED payroll
  // payload (not `payroll`, the already-mapped params) so the panel derives
  // its own parameters and reads the legislated cap change out of the
  // payload's `scheduled_changes`; and takes the NETS the reader typed, one
  // per earner, because it recovers each gross itself and every earner stands
  // at their own point on the curve. Both are §3.3 constraints, not style: the
  // wrong wiring here is a 12.4 pp error that no sanity band would catch.
  /**
   * The wedge, with the reader on it only once they have put themselves there.
   *
   * Every personal branch of this row is a second-person claim — «Заплатата ти
   * преди удръжките (бруто) е ≈ €1160. От нея 22,4% отиват за осигуровки и
   * данък» — and until `earnersDirty` flips, that is a claim about a person
   * earning the €900 placeholder. The pocket row and the ladder row both
   * decline to answer in that state; this one answered, in the second person,
   * about somebody who had typed nothing (P7).
   *
   * Withholding the AMOUNTS rather than gating the branches is what keeps the
   * row whole: `taxWedgePanel` builds `points`, `capGross` and
   * `peakEffectivePct` from `payroll.json` alone, so the system curve, the
   * ceiling and the chart all still draw. What goes is `earners`, which is the
   * only part of the panel the reader is in — and with it empty the component
   * already renders `wedgeNone` («Удръжките стигат до 22,4% … Въведи заплата
   * горе, за да видиш къде си»), drops the markers and lets the right-edge
   * label back. That branch was written for exactly this state and was
   * unreachable while the placeholder sat in the box.
   *
   * **It is a named pay object, not a conditional inside the call.** Every
   * per-person panel takes `{basis, amounts}` together so an amount cannot
   * reach one without saying which basis it is on — a net read as a gross is
   * ~29% out, in the flattering direction on the mortgage line — and
   * `verify_wiring.mjs` holds that by reading the call. A ternary in the
   * argument list is wiring inside a `$derived`, which is what `view.js`'s
   * header exists to keep out; naming it leaves one identifier at the call site
   * and one place where the empty case is built.
   */
  wedgePay = $derived(this.earnersDirty ? this.pay : { basis: this.payBasis, amounts: [] });
  wedge = $derived(taxWedgePanel({ payroll: this.data.payroll, pay: this.wedgePay }));

  // How each earner compares with the chosen област's average wage — per
  // earner, because НСИ publish a wage rather than a household income. See
  // view.js#regionGap.
  regionGaps = $derived(regionGap({ nets: this.nets, regionNet: this.regionNet }));

  /** The reader's chosen NACE Rev 2 section, by НСИ's own English row name. */
  sectorKey = $state("");
  /** The picker's rows, in НСИ's classification order rather than by wage. */
  sectorOptions = $derived(publishedSectorOptions(this.data.sectorSalary));
  // The chosen sector's published average and the reader's distance from it.
  // Null until they pick one: the card states a figure about somebody's
  // industry, and there is no honest default industry to assume (P7).
  sector = $derived(
    this.sectorKey
      ? sectorComparison({
          sectorSalary: this.data.sectorSalary,
          key: this.sectorKey,
          nets: this.nets,
          payroll: this.data.payroll,
        })
      : null
  );
  // **What stops the sector card reading as a rank.** Nobody publishes a pay
  // distribution by activity for Bulgaria, so `sector.gaps` is a distance from
  // an average and nothing more. This is the national correction for that: on a
  // right-skewed wage distribution an average sits above the middle, so "below
  // your sector's average" is not "below the middle".
  //
  // The card renders only `meanAboveMedian` and `shapeYear` off this. The rest
  // of what it returns is unrendered on purpose — the levels are SES's own and
  // years behind the НСИ quarter beside them, and the rung between them is
  // ours; content.js#sectorAverageFlatters carries that argument.
  //
  // It reads the Eurostat shape alone and never `sector` — a sector average
  // fed into this would produce the sector percentile the feature exists to
  // say nobody publishes. `mirror.js#meanRungPosition` takes no anchor at all,
  // so that cannot be wired here even by accident.
  averageFlatters = $derived(meanRungPosition(this.data.salaryDist));

  /** @param {string} key */
  setSector = (key) => {
    this.sectorKey = key;
  };

  // ---------------------------------------------------------------------
  // Derived: inflation
  // ---------------------------------------------------------------------
  off = $derived(this.categories.length > 0 ? officialInflation(this.categories, this.anchor) : 0);
  pi = $derived(
    this.categories.length > 0
      ? personalInflationDetailed(this.weights, this.categories, this.splits, this.anchor, this.off)
      : 0
  );
  /**
   * The household's nominal change in take-home, and who has not said theirs.
   *
   * Weighted by what each earner was paid BEFORE, which is what a percentage
   * change is — a straight average of the rates overstates it, always in the
   * flattering direction (mirror.js#householdNetRaisePct). With one earner in
   * net mode it is exactly the number they typed.
   */
  raiseState = $derived(
    householdRaise({
      pay: this.pay,
      raises: this.earners.map((e) => e.raise),
      payroll: this.data.payroll,
    })
  );
  raise = $derived(this.raiseState.pct);
  /** The earners still owing a raise, so the row can name them instead of guessing. */
  missingRaises = $derived(this.raiseState.missing);
  pocket = $derived(Number.isFinite(this.raise) ? pocketReal(this.raise, this.pi) : NaN);

  // What the per-group € column is carved out of: take-home minus the housing
  // payments that are already committed (mortgage when the home block is on,
  // plus rent whenever it's non-zero). A person can have both — buying while
  // still renting until the deal closes.
  carveOut = $derived(
    housingCarveOut({
      salary: this.householdNet,
      homeOn: this.homeOn,
      monthlyMortgage: this.monthlyMort,
      rent: this.rent,
    })
  );
  housingCost = $derived(this.carveOut.housingCost);
  spendable = $derived(this.carveOut.spendable);

  // What the € column is measured against, and what is left unplaced. In share
  // mode `spendBase` is the share of `spendable` the reader claims they spend —
  // all of it until they say otherwise; in € mode it is the euros they actually
  // typed, so nothing on screen rescales their basket up to fill their pay.
  // See view.js#basketBudget.
  budget = $derived(
    basketBudget({
      spendMode: this.spendMode,
      amounts: this.weights,
      spendable: this.spendable,
      spendSharePct: this.spendSharePct,
    })
  );
  /** Σ of what the user has entered — the slider/€ denominator. */
  enteredTotal = $derived(this.budget.entered);

  // What the same life costs now — measured on the money that is actually
  // spent, not on the whole pay packet. Identical to `extraPerMonth(salary, π)`
  // for anyone in share mode or with a full € basket; smaller, and truer, for
  // someone who told us they put money aside. See view.js#exposedSpend.
  extra = $derived(
    extraPerMonth(
      exposedSpend({ housingCost: this.housingCost, spendBase: this.budget.spendBase }),
      this.pi
    )
  );
  // The pocket verdict in euro. Rounded here, once, because the copy is CHOSEN
  // by whether it rounds to zero: «≈ €0 повече всеки месец» is noise, so at
  // that size the row says the percentage and stops.
  // The pocket verdict in euro, on the HOUSEHOLD's take-home, because the
  // raise field asks for one figure and gets one. With several earners that
  // figure is the household's own change in pay — the hint under the input
  // says so — and pricing it against one earner's salary would answer a
  // question nobody asked.
  pocketEur = $derived(Math.round(pocketPerMonth(this.householdNet, this.pocket)));

  // What a year of unplaced money would be worth held as cash. Takes the
  // HEADLINE payload, never π — money that is not being spent on the user's
  // basket is not measured by the user's basket. See view.js#leftoverIfHeldAsCash.
  leftoverCash = $derived(
    leftoverIfHeldAsCash({
      leftoverPerYear: this.budget.leftoverPerYear,
      headline: this.data.hicpHeadline,
    })
  );

  /**
   * The exact, additive decomposition of `pi`: Σ ranked[i].contributionPp === pi.
   * Drives both the ranked view and the "biggest bite" line, so the two can
   * never disagree about which group hurts most.
   */
  ranked = $derived(
    this.categories.length > 0
      ? contributions({
          divisions: this.categories,
          amounts: this.weights,
          splits: this.splits,
          anchor: this.anchor,
          spendable: this.budget.spendBase,
        })
      : []
  );
  bite = $derived(
    this.ranked.length > 0 && this.householdNet > 0
      ? {
          index: this.ranked[0].index,
          category: this.ranked[0].division,
          eurPerMonth: this.ranked[0].eurPerMonth,
        }
      : { index: -1, category: null, eurPerMonth: 0 }
  );

  // dpi: gap between the user's basket-weighted rate and the basket-weighted
  // rate using official weights. This is "how different is your basket from
  // the average Bulgarian's?" — a question the user can immediately act on.
  dpi = $derived(this.pi - this.off);
  // Not compared to the headline: the headline is the all-items official rate
  // and now shares the basket's time window, so the only remaining difference
  // is basket mix — which is exactly what this card shows.
  nearOfficial = $derived(
    Math.abs(this.dpi) < (this.anchor === "y1" ? 0.8 : Math.max(1.2, this.off * 0.08))
  );

  /**
   * The fields a share surface may carry, and nothing else.
   *
   * `sharePayload` takes no salary, so no € figure can be derived from what
   * this hands to `ShareCard.svelte` — the inversion `salary × π/(100+π)` has
   * nothing to invert (docs/principles.md P2). `nearOfficial` is passed rather
   * than recomputed so the picture and the verdict above it cannot disagree
   * about the same basket.
   *
   * `basketRefPeriod`, because both percentages on the card are Σ(w·r) over
   * `hicp_categories.json` and the date drawn under them says which month they
   * describe. The headline's own period runs up to a month ahead during
   * Eurostat's flash — the rule `headlineRefPeriod` states below is that it
   * dates the strip and the panel and NOTHING in the basket — so taking it here
   * stamps July over a picture built from June. The card is the one surface
   * that leaves the device, so a wrong month on it is in somebody else's chat
   * before it can be corrected (P4).
   */
  share = $derived(
    this.dataReady
      ? sharePayload({
          pi: this.pi,
          official: this.off,
          near: this.nearOfficial,
          anchor: this.anchor,
          ranked: this.ranked,
          refPeriod: this.basketRefPeriod,
        })
      : null
  );

  // Prescription (B#5): target raise to stand still, and to gain +5% real.
  standStillRaise = $derived(Number.isFinite(this.pi) ? targetRaise(this.pi, 0) : NaN);
  fivePctRaise = $derived(Number.isFinite(this.pi) ? targetRaise(this.pi, 5) : NaN);

  // Savings erosion. Takes the PAYLOADS, not a rate: the card's copy says «от
  // 2020 г.» / "since 2020" in fixed words, so there is deliberately no
  // argument through which the user's own basket rate could be substituted for
  // the official cumulative. It deflates by Eurostat's own all-items index out
  // of hicp_headline.json (~39.9% today) and only rebuilds the cumulative from
  // the divisions (~41.8%) if that payload has no index — `basis` says which,
  // and the drawer copy follows it rather than claiming the official figure
  // either way. See view.js#savingsSince2020.
  cashEroded = $derived(savingsSince2020(this.cash, this.data.hicpHeadline, this.categories));

  // ---------------------------------------------------------------------
  // Derived: rent, the percentile ladder, the home
  // ---------------------------------------------------------------------
  // Rent against the HOUSEHOLD's take-home. A flat is one payment out of the
  // money that arrives, whoever earned it; charging it to one earner would
  // report a couple splitting €600 rent on €1,800 together as carrying a 67%
  // burden each.
  rentBurdenPct = $derived(rentBurden(this.rent, this.householdNet));
  rentDay = $derived(rentDays(this.rent, this.householdNet));

  // Fresh individual-earnings ladder. `salary_dist.json` carries the Eurostat
  // SES shape at SES's own level and nothing else; `buildLadder` re-levels it
  // onto the anchor below and converts each rung to NET. The two publishers'
  // figures meet here, in the reader's tab — see `mirror.js#composeLadder`.
  // `salary` is net take-home, so this is a net-vs-net rank.
  //
  // **The anchor is НСИ's national average — the all-activities «Общо» row —
  // and it may not be any one област's.** The SES shape is national: Eurostat
  // publish D1, the median and D9 for Bulgaria and nothing below that, at any
  // vintage, from any publisher. Multiplying a national spread by София's mean
  // asserts that pay in София is spread the way the country's is, and then
  // ranks a reader in Русе against the result — two true figures making one
  // false sentence, and nothing on screen would show it, because a rescaled
  // ladder is still a monotonic ladder of plausible Bulgarian wages. A
  // national spread times a national mean is the like-for-like pair
  // (`docs/data-sources.md` §"Salary distribution").
  //
  // It also has to be independent of the reader's choice for a plainer reason:
  // the rank is on `/how/` as well as here, and that page renders at build
  // time with nobody in it.
  ladderAnchorGross = $derived(
    publishedNationalQuarter(this.data.sectorSalary || HOME.nationalWageFallback)?.value || 0
  );
  ladder = $derived(
    this.data.salaryDist
      ? buildLadder(this.data.salaryDist, this.ladderAnchorGross, this.payroll)
      : []
  );
  // ONE RANK PER EARNER. The rungs are individual full-time earnings, so a
  // household total read off them is the unit mismatch that once pushed every
  // Sofia salary to the 99th percentile — two people on €900 each are not a
  // person on €1,800. See view.js#earnerRanks.
  //
  // Position from the BOTTOM: "you're ahead of {ahead}% of earners".
  // percentile() returns 1 = bottom 1%, 99 = top 1%. We render that directly
  // (NOT `100 - rank` / "top N%") so higher income → bigger number → the
  // marker moves right and a below-median income never reads as an
  // achievement. `pctAhead` clamps to [1,99] so the extremes don't show 0%.
  ranks = $derived(earnerRanks({ nets: this.nets, ladder: this.ladder }));
  /** The span the row's corner states when there is more than one earner. */
  rankRange = $derived.by(() => {
    const ahead = this.ranks.map((r) => r.ahead);
    if (!ahead.length) return null;
    return { low: Math.min(...ahead), high: Math.max(...ahead) };
  });
  // Provenance for the percentile-card source line (same ↗-link contract as
  // the basket cards). SHAPE = Eurostat SES; LEVEL = НСИ's national average.
  salaryShapeUrl = $derived(this.data.salaryDist?.shape?.source_url ?? "");
  salaryShapeYear = $derived(this.data.salaryDist?.shape?.ref_year ?? "");
  // The LEVEL's provenance comes from the НСИ payload itself. It must not be
  // read from salary_dist.json: copying НСИ's url and period into a Eurostat
  // payload makes that one file a composite of two publishers, which is the
  // thing `no НСИ payload carries a second publisher's figures` forbids.
  //
  // It comes off the SAME payload the level does. Reading the url from one НСИ
  // file and the level from the other sends a reader who clicks it to a
  // workbook the figure above the link is not in — the verify link's whole job
  // is that they can find the cell (P3).
  salaryAnchorUrl = $derived(this.data.sectorSalary?.source_url ?? "");
  salaryAnchorPeriod = $derived(this.payLadderRows.anchorPeriod);
  // What the country's average takes home, for the one line that sets the
  // modelled median beside a mean. It has to be the mean of the SAME
  // population the median is read off: a national median against an област's
  // mean is «средната е по-висока» beside a Видин average that is lower, and
  // the sentence would simply be false there.
  nationalNet = $derived(bgNetSalary(this.payLadderRows.anchorGross, this.payroll).net);

  homePrice = $derived(
    homePriceFor({
      priceMode: this.priceMode,
      manualPrice: this.manualPrice,
      eurPerM2: this.cityEurPerM2,
      m2: this.m2,
      eurPerM2IsReal: this.cityPriceIsLive,
    })
  );
  /** The €/m² the price on screen is built from, and whether it is the
      reader's own. Same arguments as `homePrice` above, so the two cannot
      answer about different prices — see `view.js#homePriceBasis`. */
  homeBasis = $derived(
    homePriceBasis({
      priceMode: this.priceMode,
      manualPrice: this.manualPrice,
      eurPerM2: this.cityEurPerM2,
      m2: this.m2,
      eurPerM2IsReal: this.cityPriceIsLive,
    })
  );
  /** Whether the home block has a price with a source behind it — имот.bg's
      median for the reader's own град, or one they typed. There is no third
      answer: `cityEurPerM2` falls back to a round constant, and everything
      built on it, down to the basket's € column, is then a figure nobody
      published. `HomeRow` says what it is waiting for instead. */
  homePriceIsSourced = $derived(
    this.cityPriceIsLive || (this.priceMode === "manual" && this.manualPrice > 0)
  );
  // €/m² reading shown to the user as feedback in manual mode:
  // "your €150,000 ÷ 60 m² = €2,500/m² (the Варна median is €1,100/m²)"
  manualEurPerM2 = $derived(this.m2 > 0 && this.manualPrice > 0 ? this.manualPrice / this.m2 : 0);
  homeYearsVal = $derived(homeYears(this.homePrice, this.householdNet));
  // The whole home block, from one call. `rate` is the AAR (ECB MIR new
  // business) — the interest rate the annuity needs. The APRC lives beside it
  // as "what it really costs" and must never enter this formula; the down
  // payment and both DSTI figures come out of the published BNB limits rather
  // than being passed in. See view.js#mortgagePanel and docs/math.md
  // §"Which rate goes into the annuity".
  home = $derived(
    mortgagePanel({
      price: this.homePrice,
      ratePct: this.rate,
      termYears: this.term,
      // The HOUSEHOLD's net. A joint application is assessed on the incomes
      // that service the loan, and the 30% line is drawn against the money
      // that actually arrives. This is also the one place where taking the
      // total is strictly stricter than taking one earner: a bigger
      // denominator raises the cap, so the alternative would understate what a
      // couple can carry rather than overstate it.
      netSalary: this.householdNet,
      // Zero where the €/m² is the offline constant, so the "and that buys you
      // N m²" reading cannot be built out of it either. `homePrice` above is
      // already zero there and every consumer gates on the figure.
      eurPerM2: this.cityPriceIsLive ? this.cityEurPerM2 : 0,
      limits: this.limits,
    })
  );
  downPayPct = $derived(this.home.downPaymentPct);
  monthlyMort = $derived(this.home.payment);
  mortShare = $derived(this.home.sharePct);
  // 30%-of-net mortgage cap and the gap (positive = over the line).
  mortCapEur = $derived(this.home.capEur);
  mortCapGap = $derived(this.home.capGap);
  // Reverse "what can I afford?" — given current salary + our 30% line + rate
  // + term, the largest home price / m² the user could carry.
  maxAffordPrice = $derived(this.home.maxPrice);
  maxAffordM2 = $derived(this.home.maxM2);

  // ---------------------------------------------------------------------
  // Derived: the anchor selector's labels
  // ---------------------------------------------------------------------
  // Year-anchor options compare `idx[latestYear] / idx[yearEnd] − 1`. The
  // numerator end-point is the freshest monthly index Eurostat has published
  // (e.g. "2026-06"), which is what this label states — honest about the
  // partial-year end-point. (The year-anchor OPTIONS are still only the
  // completed years 2020..2025; `anchorYears` enforces that.)
  idxLatestYearLabel = $derived(
    this.categories.length > 0
      ? String(
          this.categories[0].latest_index?.time ?? latestIndexYear(this.categories[0].index_by_year)
        )
      : ""
  );
  // Headline's ref_period (e.g. "2026-07") — the latest month Eurostat has
  // published the all-items annual rate for. It dates the national strip and
  // the data panel, and NOTHING in the basket: Eurostat's flash publishes this
  // rate about two weeks ahead of the divisions, so it can name a month the
  // per-division figures do not describe.
  headlineRefPeriod = $derived(String(this.data.hicpHeadline?.ref_period ?? ""));
  // The month the DIVISIONS' 12-month rates describe: `categories[].ref_period`,
  // the field `annual_rate_pct` sits directly beside in the payload.
  //
  // Every label below is built from this and not from the headline, because
  // `rateFor(c, "y1")` returns `annual_rate_pct` verbatim. Take the window from
  // the headline and a flash release dates June's per-division rates as a July
  // window — every number correct, every one of them labelled a month it does
  // not cover, and the hint two lines under the same dropdown naming the real
  // one. docs/site.md §"A correct formula fed the wrong number" is this exact
  // shape: no gate upstream can see it, because nothing published is wrong.
  basketRefPeriod = $derived(
    this.categories.length > 0 ? String(this.categories[0].ref_period ?? "") : ""
  );
  // 12-month window end-point and its 1-year-earlier start, for the y1 option
  // label (e.g. "2025.06 → 2026.06").
  basketPrevPeriod = $derived.by(() => {
    const r = this.basketRefPeriod;
    if (!/^\d{4}-\d{2}$/.test(r)) return "";
    const [y, m] = r.split("-").map(Number);
    return `${y - 1}-${String(m).padStart(2, "0")}`;
  });
  yoyWindowLabel = $derived.by(() => {
    const r = this.basketRefPeriod;
    const p = this.basketPrevPeriod;
    if (!r || !p) return "";
    return `${p.replace("-", ".")} → ${r.replace("-", ".")}`;
  });
  /** Completed years available as anchors, newest first. */
  anchorYears = $derived.by(() => {
    if (!this.data.hicpCategories) return [];
    const latest = +latestIndexYear(this.categories[0]?.index_by_year ?? {});
    const years = [];
    for (let y = 2020; y < latest; y++) years.push(y);
    return years.reverse();
  });

  // ---------------------------------------------------------------------
  // Per-division readings
  // ---------------------------------------------------------------------
  // Functions rather than derived arrays: each is called once per row inside
  // an `{#each}`, where a `$derived` per division would need one signal per
  // row and buy nothing — the whole list recomputes when any weight moves.

  /**
   * The €/month a division gets, given the user's shares.
   *
   * `budget.spendBase`, not `spendable`: in € mode the two differ by whatever
   * the user chose not to place, and dividing the whole budget out over a
   * smaller basket printed thirteen euro figures nobody had typed.
   */
  divisionEur = (i) =>
    this.enteredTotal > 0
      ? (this.budget.spendBase * Math.max(0, this.weights[i])) / this.enteredTotal
      : 0;
  /** The user's share of the basket for a division, in percent. */
  divisionSharePct = (i) =>
    this.enteredTotal > 0 ? (100 * Math.max(0, this.weights[i])) / this.enteredTotal : 0;
  /** The split currently in force for a division (official until edited). */
  splitFor = (i) => this.splits[i] ?? officialSplit(this.categories[i], this.weights[i]);
  /** The rate a division contributes at, honouring any hand-made split. */
  rateForDivision = (i) => divisionRate(this.categories[i], this.splits[i], this.anchor);

  /**
   * Human-facing Eurostat link for a HICP category's ↗.
   *
   * Points at the published JSON-stat dissemination extract for this exact
   * COICOP + BG — the same `api_url`/`api_url_index` the publish-time link
   * gate verifies. We deliberately do NOT link to the rendered Data Browser
   * table: its URL query params only bind single-select "page" dimensions
   * (geo, unit), so a `coicop18=CPxx` param — coicop18 sits on the table's ROW
   * axis as an expandable hierarchy — is silently ignored and every category
   * degrades to the same default table (CP01, Food). The dissemination URL is
   * the only stable, per-row-correct target.
   *
   * Which extract follows the ANCHOR, not the row: at "last 12 months" the
   * number beside the link is the published RCH_A rate, at a year anchor it
   * comes from the I15 index. Sending someone to the index cube to check a
   * rate means they cannot find the figure they clicked. See view.js#verifyUrl.
   */
  estatCatUrl = (cat) => verifyUrl(cat, this.anchor);

  // ---------------------------------------------------------------------
  // Handlers. Arrow fields, per the rule in this file's header.
  // ---------------------------------------------------------------------
  onRateInput = (event) => {
    this.rateTouched = true;
    // The rate field carries the string and this owns the number. It stopped
    // being a `bind:value` when the field stopped being `type="number"` — see
    // format.js#parseDecimal for what that sanitiser was doing to «2,75» — so
    // the parse happens here, once, rather than in the template.
    //
    // A rate that will not parse leaves the last good one standing rather than
    // writing NaN into the annuity: the reader is mid-edit, and the mortgage
    // row answering «€NaN/мес» while they clear the box to retype it is a
    // worse answer than the one they are replacing. A rate of zero or less is
    // refused for the same reason, and `min="0.1"` never refused it — the page
    // has no form, so the attribute drew the spinner and validated nothing.
    const parsed = parseDecimal(event.currentTarget.value);
    if (parsed > 0) this.rate = parsed;
  };

  /** Anchor change → keep raise empty (we don't have a nominal default). */
  onAnchorChange = (e) => {
    this.anchor = e.target.value === "y1" ? "y1" : +e.target.value;
  };

  // Sits alongside `bind:value` rather than replacing it: the bind already
  // carries the number, and all this records is that a human touched the
  // field. Clearing the box back to empty still counts as touched — the
  // reader has told us the placeholder is not theirs, which is the whole
  // question the flag answers. Any earner's field counts, including a second
  // one: typing €700 into it says the €900 above is not a stand-in either.
  // The stash is what the reader last typed in the OTHER basis, so typing here
  // makes it stale — a flip after this must convert rather than restore.
  onEarnerInput = (i) => {
    this.earnersDirty = true;
    this.earners[i].stashed = null;
  };

  /**
   * Add an income to the household.
   *
   * Seeded EMPTY rather than with the placeholder. A second field arriving
   * pre-filled with €900 would add €900 to the rent burden, the mortgage cap
   * and the basket the moment it appeared — a figure the reader never typed,
   * moving every number on the page in the flattering direction. The empty
   * field contributes nothing until it is answered (`mirror.js#householdNet`
   * skips it), so adding a row changes no result.
   */
  addEarner = () => {
    if (!this.canAddEarner) return;
    this.earners = [...this.earners, { amount: null, stashed: null, raise: NaN, raiseText: "" }];
  };

  /**
   * Drop an income. The first one cannot be removed — a household with no
   * incomes has nothing to compute, and the card would have no field to put a
   * salary back into.
   */
  removeEarner = (i) => {
    if (this.earners.length <= 1) return;
    this.earners = this.earners.filter((_, k) => k !== i);
  };

  onRaiseInput = (i, event) => {
    this.raiseDirty = true;
    const text = event.currentTarget.value;
    this.earners[i].raiseText = text;
    // `parseDecimal`, not `parseFloat`: the field is `type="text"` now, so it
    // hands over whatever was typed rather than whatever the number sanitiser
    // left of it, and «3,5» has to mean 3.5 rather than 35. `parseFloat` reads
    // the leading run of digits and discards the rest, which turns «3,5» into
    // 3 and «1.2.3» into 1.2 — a number, quietly, out of something that is not
    // one. NaN is the honest answer to both, and every row downstream already
    // treats an unparsed raise as unsaid.
    this.earners[i].raise = parseDecimal(text);
  };

  /**
   * Switch between typing net and typing gross.
   *
   * The amounts convert in place, so the figure in the box changes and nothing
   * below it does — the contract `setSpendMode` already keeps for the basket's
   * %/€ toggle. What the reader typed in the outgoing basis is stashed, so
   * flipping back restores it verbatim rather than a converted-and-rounded
   * version of itself: the round trip is lossy by a cent in the general case,
   * and a salary that creeps while nobody edits it is its own kind of wrong.
   */
  setPayBasis = (next) => {
    if (next === this.payBasis) return;
    const converted = convertPay(this.pay, this.data.payroll);
    this.earners = this.earners.map((e, i) => ({
      ...e,
      amount: e.stashed ?? converted[i],
      stashed: e.amount,
    }));
    this.payBasis = next;
  };

  applyPreset = (name) => {
    // "official" must mean the LIVE published basket, not the frozen copy in
    // content.js — that copy is a first-paint sentinel and its drift check
    // tolerates ±3 pp, so after an annual Eurostat rebalance this chip would
    // have handed the user last year's basket labelled as the official one
    // (math.md invariant #5: weights are pulled live, never hardcoded).
    const pct =
      name === "official" && this.categories.length > 0
        ? officialBasketWeights(this.categories)
        : PRESETS[name];
    // In € mode a preset means "spread my actual money this way", so the
    // percentages are converted to euros against what's left after housing.
    this.weights =
      this.spendMode === "eur" ? pct.map((p) => Math.round((this.spendable * p) / 100)) : [...pct];
    this.splits = pct.map(() => null);
    this.activePreset = name;
  };

  onSliderInput = (i, val) => {
    this.weights[i] = +val;
    this.activePreset = null;
  };

  /**
   * How much of what is left after housing the reader says they actually spend.
   *
   * Clamped through `view.js#clampSpendShare` on the way into state rather than
   * on the way out, because the label beside the control renders this number
   * and the € figures are carved out of it — a value only one of them rejects
   * is a screen where the claim and the arithmetic describe different people.
   */
  onSpendShareInput = (val) => {
    this.spendSharePct = clampSpendShare(+val);
  };

  /**
   * Switch between percentage shares and euros per month.
   *
   * The conversion preserves the basket exactly, and "exactly" means the
   * thirteen € figures on screen do not move either — not merely that π holds,
   * which it would anyway because both modes normalise by Σ. So each direction
   * converts against the base the € column is actually drawn from
   * (`budget.spendBase`), never against the whole spendable amount: at a 70%
   * claim the latter would hand the reader a euro basket 43% larger than the
   * one they were just looking at, which is the app insisting they spend
   * everything by a different route.
   *
   * Coming back the other way, the euros the reader typed BECOME the claim —
   * a €1,085 basket against €1,550 spendable is a 70% share — so the remainder
   * survives the round trip instead of being silently absorbed. It clamps at
   * 100: a share cannot exceed the money it is a share of, so an over-allocated
   * euro basket lands at "I spend all of it" and the over-allocation is the one
   * thing the flip cannot carry across.
   */
  setSpendMode = (mode) => {
    if (mode === this.spendMode) return;
    const total = this.weights.reduce((s, x) => s + (x > 0 ? x : 0), 0);
    if (total > 0) {
      const next =
        mode === "eur"
          ? this.weights.map((w) => Math.round((this.budget.spendBase * Math.max(0, w)) / total))
          : this.weights.map((w) => Math.round((100 * Math.max(0, w)) / total));
      if (mode === "pct") {
        this.spendSharePct = clampSpendShare(
          this.spendable > 0 ? (100 * this.budget.spendBase) / this.spendable : 100
        );
      }
      // Carry each division's group split across in the same proportion, so a
      // user who has already drilled in doesn't lose their work.
      this.splits = this.splits.map((sp, i) => {
        if (!sp) return null;
        const spTotal = sp.reduce((s, x) => s + (x > 0 ? x : 0), 0);
        if (spTotal <= 0) return null;
        return sp.map((x) => (Math.max(0, x) * next[i]) / spTotal);
      });
      this.weights = next;
    }
    this.spendMode = mode;
  };

  /** Open/close one division's drill-down. */
  toggleDivision = (i) => {
    // SvelteSet would also work here, but it would invite in-place mutation of
    // a value several $derived chains read. Copy-on-write, then reassign.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(this.openDivisions);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    this.openDivisions = next;
  };

  /**
   * Edit one group inside a division.
   *
   * The first edit materialises the split from Eurostat's official
   * within-division shares, so the user is always adjusting away from the
   * national average rather than from zero. The division's own total is left
   * alone: moving money between "buying a car" and "running a car" must not
   * change how much of the basket transport is.
   */
  onGroupInput = (divIndex, groupIndex, val) => {
    const division = this.categories[divIndex];
    const current = this.splits[divIndex] ?? officialSplit(division, this.weights[divIndex]);
    const next = [...current];
    next[groupIndex] = Math.max(0, +val);
    const copy = [...this.splits];
    copy[divIndex] = next;
    this.splits = copy;
    this.activePreset = null;
  };

  /** Drop a hand-made split and go back to Eurostat's own division rate. */
  resetSplit = (divIndex) => {
    const copy = [...this.splits];
    copy[divIndex] = null;
    this.splits = copy;
  };

  /** Switch the home block to a hand-typed asking price, seeding it once.
   *
   * **The seed needs a €/m² somebody published.** `cityEurPerM2` falls back to
   * `HOME.eurPerM2_offlineFallback` where the chosen град has no median, and a
   * field pre-filled from that shows the reader €175,000 as a starting point
   * for a home nobody priced — the defect the blank raise field exists to
   * avoid (P7). With no median the box stays empty and the reader types.
   */
  useManualPrice = () => {
    if (this.manualPrice === 0 && this.cityPriceIsLive) {
      this.manualPrice = Math.round(this.cityEurPerM2 * this.m2);
    }
    this.priceMode = "manual";
  };

  useMarketPrice = () => {
    this.priceMode = "auto";
  };
}
