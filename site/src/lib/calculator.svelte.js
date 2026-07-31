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
 * Language does not belong here either. `sofiaPriceDated`, the preset label
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
import { loadAll, mortgageDefaultRate, mortgageAprc, mortgageLendingLimits } from "./data.js";
import { PAYLOADS } from "./payloads.js";
import {
  latestIndexYear,
  officialInflation,
  pocketReal,
  extraPerMonth,
  pocketPerMonth,
  percentile,
  buildLadder,
  rentBurden,
  rentDays,
  homeYears,
  targetRaise,
  bgNetSalary,
  payrollParams,
  divisionRate,
  officialSplit,
  contributions,
  personalInflationDetailed,
} from "./mirror.js";
// The derived values below live in $lib/view as pure functions, so the wiring
// between a formula and its input is testable. Wiring that lives in a
// `$derived(...)` is wiring nothing can test — see view.js's header.
import {
  officialBasketWeights,
  dataAge,
  headlineRate,
  pctAhead as pctAheadOf,
  sofiaQuarter as publishedSofiaQuarter,
  savingsSince2020,
  housingCarveOut,
  basketBudget,
  exposedSpend,
  leftoverIfHeldAsCash,
  homePriceFor,
  clampTerm,
  mortgagePanel,
  verifyUrl,
  taxWedgePanel,
  payslipPanel,
} from "./view.js";

export class Calculator {
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
  // salary = 900 EUR is a round PLACEHOLDER, not a statistic: no published
  // series here carries a national median net wage, so there is nothing to
  // source a "typical" default to (docs/principles.md P7 — no unsourced defaults). For
  // reference, the one median we DO publish is the Sofia net ladder's P50,
  // ~€1,104 (salary_dist.json → buildLadder), and €900 sits at its 34th
  // percentile — which is why the copy under this field asks the user to
  // replace it rather than calling it typical.
  salary = $state(900);
  raise = $state(NaN); // empty by default — no fake nominal wage index
  raiseDirty = $state(false);
  anchor = $state("y1");
  rent = $state(0);
  cash = $state(1000);

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
    this.data = await loadAll();
    this.dataReady = true;
    // Staleness is age-based off `as_of` (the date the pipeline last refreshed
    // each JSON) — no hardcoded release date to maintain — and it is judged per
    // payload against that payload's own cadence, so a quarterly series two
    // months old is fresh while a monthly one two months old is not. The banner
    // fires when some payload is genuinely overdue, and the panel shows which.
    // See view.js#dataAge and the cadences in payloads.js.
    const age = dataAge(this.data, PAYLOADS);
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
   */
  syncWithData = () => {
    if (this.dataReady && this.data.hicpCategories) {
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
    }
    if (this.dataReady && this.data.mortgage) {
      // Only adopt the live default while the user hasn't touched the input.
      if (!this.rateTouched) this.rate = this.mortgageRateData.pct;
    }
    // Clamp the term to the BNB maturity cap (view.js#clampTerm).
    this.term = clampTerm(this.term, this.limits);
    // Do not auto-fill raise. We don't have a nominal wage index.
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
   */
  asOfDisplay = $derived(this.headlineRefPeriod);
  showStaleBanner = $derived(this.dataReady && this.dataStale);
  /** How many payloads are overdue against their own cadence — what the banner counts. */
  dataOverdueCount = $derived(this.dataRows.filter((r) => r.status === "overdue").length);

  // Eurostat's all-items figure, verbatim. `headlineRate` takes only the
  // headline payload so it cannot be handed `categories` and quietly become
  // Σ(w·r) — a different number by ~0.16 pp. See view.js#headlineRate.
  headline = $derived(headlineRate(this.data.hicpHeadline));

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

  // €/m² reading for the home block: prefers data.sofiaPrice.eur_per_m2_median
  // (live, 143 districts), falls back to HOME.eurPerM2_offlineFallback when
  // the JSON hasn't loaded yet (first paint, offline build).
  //
  // `sofiaPriceIsLive` says WHICH of the two is on screen, and every consumer
  // has to ask. The fallback is a round constant with no measurement behind
  // it; presented as имот.bg's median it is a plausible number wearing someone
  // else's provenance, which is worse than showing nothing at all.
  sofiaPriceIsLive = $derived(Boolean(this.data.sofiaPrice?.eur_per_m2_median));
  sofiaEurPerM2 = $derived(
    this.data.sofiaPrice?.eur_per_m2_median || (HOME.eurPerM2_offlineFallback ?? 2500)
  );
  sofiaPriceAsOf = $derived(this.data.sofiaPrice?.as_of ?? "");
  sofiaPricePageDate = $derived(this.data.sofiaPrice?.page_as_of_dd_mm_yyyy ?? "");
  sofiaNDistricts = $derived(this.data.sofiaPrice?.n_districts ?? 0);
  // Sofia price history (imot.bg, 2015..current). The pipeline fetches
  // per-year snapshots on every refresh; the SPA reads this array verbatim
  // (already sorted ascending by year) and renders a small sparkline + the
  // since-2015 delta on the stat card. Empty array → the payload carries no
  // historical block.
  sofiaHistorical = $derived(
    Array.isArray(this.data.sofiaPrice?.historical) ? this.data.sofiaPrice.historical : []
  );
  // The current-year row's since_2015_median_pct. The pipeline guarantees this
  // matches the formula current/baseline - 1 by construction (see
  // build_sofia_price_payload#consistency_invariant).
  sofiaSince2015Pct = $derived(this.sofiaHistorical.at(-1)?.since_2015_median_pct ?? 0);
  // The baseline (2015) median — surfaced in the provenance caption when the
  // historical ladder is present.
  sofiaBaselineYear = $derived(this.sofiaHistorical[0]?.year ?? 0);
  sofiaBaselineMedian = $derived(this.sofiaHistorical[0]?.eur_per_m2_median ?? 0);

  // Sofia-city average monthly GROSS pay — the comparator on the
  // The Sofia average, and the one number two cards and the whole percentile
  // ladder hang off. `sofia_salary.json` publishes НСИ's own quarterly series,
  // so `view.js#sofiaQuarter` selects the headline rather than computing one —
  // that function carries why it is a quarter (the March bonus spike) and why
  // nothing here is allowed to average it (docs/legal.md §НСИ).
  // The offline sentinel goes through the same function as the live payload,
  // because it is the same shape. One implementation, so the offline figure
  // cannot drift from the online one.
  sofiaQuarter = $derived(publishedSofiaQuarter(this.data.sofiaSalary || HOME.sofiaSalaryFallback));
  // **A MEAN, and the name has to keep saying so.** НСИ publish an average
  // gross wage, and `mirror.js#composeLadder` divides it by `shape.ses_mean` —
  // Eurostat's own mean — to get the scalar every rung is multiplied by. Feed
  // that divisor a median instead and the whole ladder shifts by the
  // mean-to-median ratio of a right-skewed wage distribution (about 1.35 on
  // SES's own figures, €949 against €705), which moves every percentile the
  // page reports without moving anything that looks wrong. Nothing downstream
  // can detect the swap, because a rescaled ladder is still a monotonic
  // ladder — so the guard is that the two ends agree by name.
  sofiaMeanGrossEur = $derived(this.sofiaQuarter?.value || 0);
  // The provenance URL for the comparator card. When the live JSON is loaded,
  // link to its source_url (the NSI XLSX endpoint — same place the connector
  // fetched from). Otherwise fall back to the human-readable landing page.
  sofiaMeanGrossUrl = $derived(this.data.sofiaSalary?.source_url || HOME.sofiaMeanGrossSourceUrl);
  // The quarter the figure describes ("2026-Q1"), not НСИ's latest single
  // month — the caption has to date the number actually shown.
  sofiaSalaryAsOf = $derived(this.sofiaQuarter?.refPeriod ?? "");

  // Payroll parameters — live from the pipeline-published payroll.json when
  // loaded, else the frozen offline sentinel (BG_PAYROLL_DEFAULT). All
  // gross↔net math below flows through these, so a BG law change only needs a
  // pipeline re-run, no SPA code change.
  payroll = $derived(payrollParams(this.data.payroll));

  // ---------------------------------------------------------------------
  // Derived: the pay packet
  // ---------------------------------------------------------------------
  // Salary input is NET take-home (most users know their payslip, not their
  // GROSS contract amount), so the contract gross is back-computed from it.
  // `payslipPanel` owns both the inversion and the itemisation, takes the
  // PUBLISHED payload rather than the mapped params, and returns null for an
  // empty field rather than a column of zeroes.
  payslip = $derived(payslipPanel({ payroll: this.data.payroll, netSalary: this.salary }));
  sofiaNet = $derived(bgNetSalary(this.sofiaMeanGrossEur, this.payroll).net);

  // "The flat tax is not flat" — the tax wedge. Takes the PUBLISHED payroll
  // payload (not `payroll`, the already-mapped params) so the panel derives
  // its own parameters and reads the legislated cap change out of the
  // payload's `scheduled_changes`; and takes the NET the user typed, because
  // it recovers the gross itself. Both are §3.3 constraints, not style: the
  // wrong wiring here is a 12.4 pp error that no sanity band would catch.
  wedge = $derived(taxWedgePanel({ payroll: this.data.payroll, netSalary: this.salary }));

  // ---------------------------------------------------------------------
  // Derived: inflation
  // ---------------------------------------------------------------------
  off = $derived(this.categories.length > 0 ? officialInflation(this.categories, this.anchor) : 0);
  pi = $derived(
    this.categories.length > 0
      ? personalInflationDetailed(this.weights, this.categories, this.splits, this.anchor, this.off)
      : 0
  );
  pocket = $derived(Number.isFinite(this.raise) ? pocketReal(this.raise, this.pi) : NaN);

  // What the per-group € column is carved out of: take-home minus the housing
  // payments that are already committed (mortgage when the home block is on,
  // plus rent whenever it's non-zero). A person can have both — buying while
  // still renting until the deal closes.
  carveOut = $derived(
    housingCarveOut({
      salary: this.salary,
      homeOn: this.homeOn,
      monthlyMortgage: this.monthlyMort,
      rent: this.rent,
    })
  );
  housingCost = $derived(this.carveOut.housingCost);
  spendable = $derived(this.carveOut.spendable);

  // What the € column is measured against, and what is left unplaced. In share
  // mode `spendBase` IS `spendable` and there is no leftover; in € mode it is
  // the euros the user actually typed, so nothing on screen rescales their
  // basket up to fill their pay. See view.js#basketBudget.
  budget = $derived(
    basketBudget({
      spendMode: this.spendMode,
      amounts: this.weights,
      spendable: this.spendable,
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
  pocketEur = $derived(Math.round(pocketPerMonth(this.salary, this.pocket)));

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
    this.ranked.length > 0 && this.salary > 0
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
  rentBurdenPct = $derived(rentBurden(this.rent, this.salary));
  rentDay = $derived(rentDays(this.rent, this.salary));

  // Fresh individual-earnings ladder. `salary_dist.json` carries the Eurostat
  // SES shape at SES's own level and nothing else; `buildLadder` re-levels it
  // onto `sofiaMeanGrossEur` and converts each rung to NET. The two publishers'
  // figures meet here, in the reader's tab — see `mirror.js#composeLadder`.
  // `salary` is net take-home, so this is a net-vs-net rank.
  ladder = $derived(
    this.data.salaryDist
      ? buildLadder(this.data.salaryDist, this.sofiaMeanGrossEur, this.payroll)
      : []
  );
  pctRank = $derived(
    this.salary > 0 && this.ladder.length ? percentile(this.salary, this.ladder) : 0
  );
  // Position from the BOTTOM: "you're ahead of {pctAhead}% of households".
  // percentile() returns 1 = bottom 1%, 99 = top 1%. We render this directly
  // (NOT `100 - rank` / "top N%") so higher income → bigger number → the
  // marker moves right and a below-median income never reads as an
  // achievement. Clamp [1, 99] so the extremes don't show 0% / 100%.
  pctAhead = $derived(pctAheadOf(this.pctRank));
  // Provenance for the percentile-card source line (same ↗-link contract as
  // the basket cards). SHAPE = Eurostat SES; LEVEL = NSI Sofia average wage.
  salaryShapeUrl = $derived(this.data.salaryDist?.shape?.source_url ?? "");
  salaryShapeYear = $derived(this.data.salaryDist?.shape?.ref_year ?? "");
  // The LEVEL's provenance comes from the НСИ payload itself. It must not be
  // read from salary_dist.json: copying НСИ's url and period into a Eurostat
  // payload makes that one file a composite of two publishers, which is the
  // thing `no НСИ payload carries a second publisher's figures` forbids.
  salaryAnchorUrl = $derived(this.data.sofiaSalary?.source_url ?? "");
  salaryAnchorPeriod = $derived(this.sofiaQuarter?.refPeriod ?? "");

  homePrice = $derived(
    homePriceFor({
      priceMode: this.priceMode,
      manualPrice: this.manualPrice,
      eurPerM2: this.sofiaEurPerM2,
      m2: this.m2,
    })
  );
  // €/m² reading shown to the user as feedback in manual mode:
  // "your €150,000 ÷ 60 m² = €2,500/m² (Sofia median is €2,501/m²)"
  manualEurPerM2 = $derived(this.m2 > 0 && this.manualPrice > 0 ? this.manualPrice / this.m2 : 0);
  homeYearsVal = $derived(homeYears(this.homePrice, this.salary));
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
      netSalary: this.salary,
      eurPerM2: this.sofiaEurPerM2,
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
  // Headline's ref_period (e.g. "2026-06") — the latest month Eurostat has
  // published the annual rate for. Rate and index now come from the same
  // prc_hicp_minr cube, so this equals the freshest index month.
  headlineRefPeriod = $derived(String(this.data.hicpHeadline?.ref_period ?? ""));
  freshestLatestTime = $derived(
    this.categories.length > 0 ? String(this.categories[0].latest_index?.time ?? "") : ""
  );
  // 12-month window end-point and its 1-year-earlier start, for the y1 option
  // label (e.g. "2025.06 → 2026.06").
  headlinePrevPeriod = $derived.by(() => {
    const r = this.headlineRefPeriod;
    if (!/^\d{4}-\d{2}$/.test(r)) return "";
    const [y, m] = r.split("-").map(Number);
    return `${y - 1}-${String(m).padStart(2, "0")}`;
  });
  yoyWindowLabel = $derived.by(() => {
    const r = this.headlineRefPeriod;
    const p = this.headlinePrevPeriod;
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
  onRateInput = () => {
    this.rateTouched = true;
  };

  /** Anchor change → keep raise empty (we don't have a nominal default). */
  onAnchorChange = (e) => {
    this.anchor = e.target.value === "y1" ? "y1" : +e.target.value;
  };

  onRaiseInput = (e) => {
    this.raiseDirty = true;
    const v = parseFloat(e.currentTarget.value);
    this.raise = isFinite(v) ? v : NaN;
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
   * Switch between percentage shares and euros per month.
   *
   * The conversion preserves the basket exactly: shares → euros multiplies by
   * the spendable amount, euros → shares divides by the total entered. So the
   * personal-inflation number does not move when the user flips the toggle,
   * which is the only behaviour that makes the toggle trustworthy.
   */
  setSpendMode = (mode) => {
    if (mode === this.spendMode) return;
    const total = this.weights.reduce((s, x) => s + (x > 0 ? x : 0), 0);
    if (total > 0) {
      const next =
        mode === "eur"
          ? this.weights.map((w) => Math.round((this.spendable * Math.max(0, w)) / total))
          : this.weights.map((w) => Math.round((100 * Math.max(0, w)) / total));
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

  /** Switch the home block to a hand-typed asking price, seeding it once. */
  useManualPrice = () => {
    if (this.manualPrice === 0) this.manualPrice = Math.round(this.sofiaEurPerM2 * this.m2);
    this.priceMode = "manual";
  };

  useMarketPrice = () => {
    this.priceMode = "auto";
  };
}
