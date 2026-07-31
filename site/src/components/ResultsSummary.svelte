<script>
  /**
   * The card's headline: the reader's own inflation, what it costs them a
   * month, the biggest single bite, and the two bars that put their basket
   * next to the average one.
   *
   * `aria-live` is scoped to the headline block, NOT to the whole card:
   * announcing all ~50 numbers on every slider tick makes the calculator
   * unusable with a screen reader.
   */
  import { lang } from "../lib/stores.js";
  import { number, integer, percentSigned } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);
  const signedPct = (x, d = 1) => percentSigned(x, d, $lang);

  // The four non-official chips are hand-made illustrations, not survey data:
  // there is no BG household-budget microdata at the resolution a data-driven
  // version would need. The hint by the chips says so; this carries
  // it to where the NUMBER is read, because a derived figure inherits the
  // obligation to name its source (docs/principles.md P3).
  const PRESET_LABEL_KEY = {
    driver: "presetDriver",
    family: "presetFamily",
    noCar: "presetNoCar",
    pensioner: "presetPensioner",
  };
  const activePresetLabel = $derived(
    PRESET_LABEL_KEY[calc.activePreset] ? t(COPY[PRESET_LABEL_KEY[calc.activePreset]], $lang) : ""
  );
  // Verdict colour follows the basket-vs-average gap, not the level: the
  // question this card answers is "is your basket dearer than the average
  // Bulgarian's?", so a high-but-typical basket is not painted as a loss.
  const verdictCls = $derived(calc.nearOfficial ? "" : calc.dpi > 0 ? "er" : "em");
</script>

<div class="h4row">
  <h4>
    <span class="l-bg">{COPY.yourReal.bg}</span>
    <span class="l-en">{COPY.yourReal.en}</span>
  </h4>
  <span class="mono" style="font-size: var(--fs-fine);color:var(--muted)">
    {calc.anchor === "y1"
      ? $lang === "bg"
        ? "за 1 година"
        : "over 1 year"
      : $lang === "bg"
        ? `от ${calc.anchor} насам`
        : `since ${calc.anchor}`}
  </span>
</div>

<div aria-live="polite" aria-atomic="true">
  <div
    class="r-big mono"
    style="color: {calc.nearOfficial
      ? 'var(--ink)'
      : calc.dpi > 0
        ? 'var(--erode)'
        : 'var(--real-ink)'}"
  >
    {fmt(calc.pi)}<span class="pct">%</span>
  </div>
  <div class="r-lbl">
    {#if calc.anchor === "y1"}
      <span class="l-bg">твоята инфлация за последната година</span>
      <span class="l-en">your inflation over the past year</span>
    {:else}
      <span class="l-bg">поскъпването на твоята кошница от {calc.anchor} насам</span>
      <span class="l-en">your basket's rise since {calc.anchor}</span>
    {/if}
  </div>
  {#if calc.salary > 0}
    <div class="r-money">
      {#if calc.anchor === "y1"}
        ≈ <span class="b">€{fmt0(calc.extra)}</span>
        <span class="l-bg">повече всеки месец</span>
        <span class="l-en">more every month</span>
        <span class="l-bg">ти струва същият живот отпреди година</span>
        <span class="l-en">is what the same life as a year ago costs you</span>
      {:else}
        <span class="l-bg"
          >≈ <span class="b">€{fmt0(calc.extra)}</span> от всяка твоя заплата днес</span
        >
        <span class="l-en"
          >≈ <span class="b">€{fmt0(calc.extra)}</span> of every paycheck today</span
        >
        <span class="l-bg">отиват само за поскъпването от {calc.anchor} насам</span>
        <span class="l-en">goes purely to price rises since {calc.anchor}</span>
      {/if}
    </div>
  {/if}
  {#if calc.bite.category && calc.salary > 0 && calc.weights.reduce((s, x) => s + x, 0) > 0}
    <div class="r-money">
      <!-- «най-голямата хапка» is the English metaphor carried over word for
           word: in Bulgarian «хапка» is a mouthful of food and nothing takes
           one out of a salary. «най-тежко те удря» is how the same thing is
           said out loud, and it names the group that adds the most. -->
      <span class="l-bg">най-тежко те удря: </span>
      <span class="l-en">the biggest bite: </span>
      <span class="b"
        >{$lang === "bg"
          ? calc.bite.category.bg_name.toLowerCase()
          : calc.bite.category.en_name.toLowerCase()}</span
      >
      ≈ <span class="b">€{fmt0(calc.bite.eurPerMonth)}/</span>
      <span class="l-bg">мес</span><span class="l-en">mo</span>
    </div>
  {/if}
</div>

<div class="bars-cap mono">
  {#if calc.anchor === "y1"}
    <span class="l-bg">с колко поскъпна кошницата - за 1 година</span>
    <span class="l-en">how much your basket rose - over 1 year</span>
  {:else}
    <span class="l-bg">с колко поскъпна кошницата - от {calc.anchor} насам</span>
    <span class="l-en">how much your basket rose - since {calc.anchor}</span>
  {/if}
</div>
<div class="vbars">
  <div>
    <div class="gm">
      <span class="lab"
        ><span class="l-bg">{COPY.yourBasket.bg}</span><span class="l-en">{COPY.yourBasket.en}</span
        ></span
      >
      <span
        class="num mono"
        style="color: {calc.nearOfficial
          ? 'var(--ink)'
          : calc.dpi > 0
            ? 'var(--erode)'
            : 'var(--real-ink)'}">{fmt(calc.pi)}%</span
      >
    </div>
    <div class="track">
      <div
        class="fill"
        style="width:{Math.max(
          2,
          (100 * calc.pi) /
            Math.max(calc.pi, calc.off, calc.anchor === 'y1' ? 8 : calc.off * 1.35, 1)
        )}%;background: {calc.nearOfficial
          ? 'var(--real)'
          : calc.dpi > 0
            ? 'var(--erode)'
            : 'var(--real)'}"
      ></div>
    </div>
  </div>
  <div>
    <div class="gm">
      <span class="lab"
        ><span class="l-bg">{COPY.averageBasket.bg}</span><span class="l-en"
          >{COPY.averageBasket.en}</span
        ></span
      >
      <span class="num mono">{fmt(calc.off)}%</span>
    </div>
    <div class="track">
      <div
        class="fill"
        style="width:{(100 * calc.off) /
          Math.max(
            calc.pi,
            calc.off,
            calc.anchor === 'y1' ? 8 : calc.off * 1.35,
            1
          )}%;background: var(--muted)"
      ></div>
    </div>
  </div>
</div>

<p class="m-verdict">
  {#if calc.anchor === "y1"}
    <span class="l-bg"
      ><b>Твоята инфлация: <span class={verdictCls}>{fmt(calc.pi)}%</span>.</b><br
      />Средностатистическата: {fmt(calc.off)}%.</span
    >
    <span class="l-en"
      ><b>Your inflation: <span class={verdictCls}>{fmt(calc.pi)}%</span>.</b><br />The average: {fmt(
        calc.off
      )}%.</span
    >
  {:else}
    <!-- Signed, not «+» glued to a locale-formatted number: a basket
         weighted onto the groups that are falling makes π negative,
         and this line — the card's headline — printed «+−1,2%». -->
    <span class="l-bg"
      ><b>Твоята кошница от {calc.anchor}: <span class={verdictCls}>{signedPct(calc.pi)}</span>.</b
      ><br />Средностатистическата: {signedPct(calc.off)}.</span
    >
    <span class="l-en"
      ><b>Your basket since {calc.anchor}: <span class={verdictCls}>{signedPct(calc.pi)}</span>.</b
      ><br />The average: {signedPct(calc.off)}.</span
    >
  {/if}
  {#if calc.nearOfficial}
    <br /><span class="l-bg">Кошницата ти е близо до средностатистическата.</span>
    <span class="l-en">Your basket is close to the average.</span>
  {:else if calc.dpi > 0}
    <br /><span class="l-bg">При теб е по-скъпо, отколкото при средностатистическия българин.</span>
    <span class="l-en">For you it's pricier than for the average Bulgarian.</span>
  {:else}
    <br /><span class="l-bg">При теб е по-евтино, отколкото при средностатистическия българин.</span
    >
    <span class="l-en">For you it's cheaper than for the average Bulgarian.</span>
  {/if}
</p>

{#if activePresetLabel}
  <p class="m-preset-note">
    <span class="l-bg">{t(COPY.presetActive, "bg", { p: activePresetLabel })}</span>
    <span class="l-en">{t(COPY.presetActive, "en", { p: activePresetLabel })}</span>
  </p>
{/if}

<style>
  /* Layout / shell */
  .m-preset-note {
    margin: 8px 0 0;
    padding: 7px 9px;
    font-size: var(--fs-small);
    line-height: 1.45;
    color: var(--ink-2);
    background: var(--paper-2);
    border-left: 2px solid var(--muted);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  /* Results */
  .r-big {
    font-size: clamp(2.5rem, 6.5vw, 3.5rem);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .r-big .pct {
    font-size: 0.42em;
    font-weight: 600;
    vertical-align: 0.95em;
    margin-left: 0.06em;
    opacity: 0.62;
    letter-spacing: 0;
  }
  .r-lbl {
    font-size: var(--fs-body);
    color: var(--ink-2);
  }
  .r-money {
    font-size: var(--fs-body);
    color: var(--ink-2);
    margin-top: 6px;
  }
  .r-money .b {
    color: var(--ink);
    font-weight: 600;
  }
  .vbars {
    display: flex;
    flex-direction: column;
    gap: 11px;
    margin: 8px 0 6px;
  }
  .vbars .gm {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
  }
  .vbars .gm .lab {
    font-size: var(--fs-meta);
    color: var(--ink-2);
  }
  .vbars .gm .num {
    font-family: var(--mono);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .vbars .track {
    position: relative;
    height: 8px;
    background: var(--track);
    border-radius: 2px;
    margin-top: 5px;
  }
  .vbars .fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    border-radius: 2px;
    transition: width 0.25s;
  }
  .bars-cap {
    font-size: var(--fs-fine);
    color: var(--muted);
    margin-top: 14px;
  }
  .m-verdict {
    font-family: var(--serif);
    font-weight: 500;
    font-size: clamp(var(--fs-strong), 2.2vw, 1.375rem);
    line-height: 1.3;
    letter-spacing: -0.01em;
    margin: 12px 0 0;
    max-width: 46ch;
  }
  .m-verdict .er {
    color: var(--erode);
  }
  .m-verdict .em {
    color: var(--real-ink);
  }
</style>
