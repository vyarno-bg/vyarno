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
   * The order is not arbitrary. `LeftoverRow` sits immediately above
   * `SavingsRow` because the two answer the same question about money that is
   * not being spent — one forward on an assumption, one backward on published
   * indices.
   */
  import { rankedSplit } from "../lib/view.js";
  import RankedContributions from "./RankedContributions.svelte";
  import ResultsSummary from "./ResultsSummary.svelte";
  import PocketRow from "./PocketRow.svelte";
  import PercentileRow from "./PercentileRow.svelte";
  import TaxWedgeRow from "./TaxWedgeRow.svelte";
  import RentRow from "./RentRow.svelte";
  import HomeRow from "./HomeRow.svelte";
  import LeftoverRow from "./LeftoverRow.svelte";
  import SavingsRow from "./SavingsRow.svelte";
  import MethodDrawer from "./MethodDrawer.svelte";
  import ShareCard from "./ShareCard.svelte";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator, sofiaPriceDated: string }} */
  const { calc, sofiaPriceDated } = $props();
</script>

<div class="m-card m-results">
  <ResultsSummary {calc} />

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
      downPayPct={calc.downPayPct}
      m2={calc.m2}
      homePrice={calc.homePrice}
      monthlyMort={calc.monthlyMort}
      mortShare={calc.mortShare}
      mortCapEur={calc.mortCapEur}
      mortCapGap={calc.mortCapGap}
      homeYearsVal={calc.homeYearsVal}
      maxAffordPrice={calc.maxAffordPrice}
      maxAffordM2={calc.maxAffordM2}
      limits={calc.limits}
      sofiaEurPerM2={calc.sofiaEurPerM2}
      sofiaNDistricts={calc.sofiaNDistricts}
      sofiaPriceIsLive={calc.sofiaPriceIsLive}
      {sofiaPriceDated}
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

  <ShareCard />
</div>
