<script>
  /**
   * The right-hand card: the reader's own inflation, then the receipt.
   *
   * This file is deliberately only a running order. Each row is its own
   * component and owns its own sentences, so the question "which rows does the
   * calculator answer, and in what order" is answered by reading forty lines
   * of markup rather than by scrolling six hundred. Adding a row means adding
   * a component and one line here; that is the whole ceremony.
   *
   * The order is not arbitrary. `ResultsAnswer` sits between the headline and
   * the ranked table because it is the answer and the table is the working:
   * the three things a reader arrives asking are otherwise spread over rows
   * that begin two and three screens down a phone, each behind its own
   * derivation. `LeftoverRow` sits immediately above `SavingsRow` because the
   * two answer the same question about money that is not being spent — one
   * forward on an assumption, one backward on published indices.
   */
  import { rankedSplit } from "../lib/view/results.js";
  import RankedContributions from "./RankedContributions.svelte";
  import ResultsSummary from "./ResultsSummary.svelte";
  import ResultsAnswer from "./ResultsAnswer.svelte";
  import PocketRow from "./PocketRow.svelte";
  import PercentileRow from "./PercentileRow.svelte";
  import TaxWedgeRow from "./TaxWedgeRow.svelte";
  import RentRow from "./RentRow.svelte";
  import HomeRow from "./HomeRow.svelte";
  import LeftoverRow from "./LeftoverRow.svelte";
  import SavingsRow from "./SavingsRow.svelte";
  import MethodDrawer from "./MethodDrawer.svelte";
  import ShareCard from "./ShareCard.svelte";
  import ResultsWordmark from "./ResultsWordmark.svelte";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator, cityPriceDated: string }} */
  const { calc, cityPriceDated } = $props();
</script>

<div class="m-card m-results">
  <ResultsSummary {calc} />

  <ResultsAnswer {calc} />

  <RankedContributions
    ranked={calc.ranked}
    {rankedSplit}
    enteredTotal={calc.enteredTotal}
    householdNet={calc.householdNet}
    pi={calc.pi}
    estatCatUrl={calc.estatCatUrl}
  />

  <div class="r-rows">
    <PocketRow {calc} />
    <PercentileRow {calc} />
    <TaxWedgeRow wedge={calc.wedge} />
    <RentRow {calc} />
    <HomeRow
      homeOn={calc.homeOn}
      householdNet={calc.householdNet}
      rate={calc.rate}
      term={calc.term}
      downPayPct={calc.downPayPct}
      m2={calc.m2}
      homePrice={calc.homePrice}
      monthlyMort={calc.monthlyMort}
      mortShare={calc.mortShare}
      mortCapEur={calc.mortCapEur}
      mortCapGap={calc.mortCapGap}
      homeYearsVal={calc.homeYearsVal}
      cityNameBg={calc.cityNameBg}
      cityNameEn={calc.cityNameEn}
      maxAffordPrice={calc.maxAffordPrice}
      maxAffordM2={calc.maxAffordM2}
      limits={calc.limits}
      cityEurPerM2={calc.cityEurPerM2}
      cityNDistricts={calc.cityNDistricts}
      cityPriceIsLive={calc.cityPriceIsLive}
      priceIsSourced={calc.homePriceIsSourced}
      basisEurPerM2={calc.homeBasis.eurPerM2}
      basisIsOwn={calc.homeBasis.isOwn}
      {cityPriceDated}
    />
    <LeftoverRow {calc} />
    <SavingsRow {calc} />
  </div>

  <MethodDrawer
    bind:open={calc.drawerOpen}
    anchor={calc.anchor}
    categories={calc.categories}
    detailMode={calc.detailMode}
    openDivisions={calc.openDivisions}
    splitFor={calc.splitFor}
    divisionSharePct={calc.divisionSharePct}
    rateForDivision={calc.rateForDivision}
    downPayPct={calc.downPayPct}
    cashEroded={calc.cashEroded}
    estatCatUrl={calc.estatCatUrl}
  />

  <ShareCard share={calc.share} />

  <ResultsWordmark />
</div>
