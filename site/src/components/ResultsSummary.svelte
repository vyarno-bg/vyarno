<script>
  /**
   * The card's headline: the reader's own inflation, what it costs them a
   * month, the biggest single bite, and the bars that put their basket next to
   * the average one.
   *
   * **Half of what this block says is gated on `calc.basketIsOwn`, and the
   * arithmetic is why.** The basket every visitor arrives on IS the official
   * one, so `pi` and `off` are the same number until a slider moves or a chip
   * is picked — and a headline calling that number «твоята», two bars of
   * identical width, and a verdict pronouncing them close are three claims
   * about a comparison nobody has made. What the card may honestly say before
   * the reader describes anything is what the country's basket did, whose it
   * is, and where to go to make it theirs; the second bar and the verdict are
   * what arrives when there is a second thing to compare.
   *
   * `aria-live` is scoped to the headline block, NOT to the whole card:
   * announcing all ~50 numbers on every slider tick makes the calculator
   * unusable with a screen reader.
   */
  import { lang } from "../lib/stores.js";
  import { number, integer } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";
  import { barCeiling } from "../lib/view/share.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  // The value both bars are drawn against, from `view/share.js` rather than
  // written
  // into the two `style=` expressions below. The share image draws the same
  // pair, and a scale computed in a template is a scale no test can reach — so
  // the two would drift with nothing to notice, and the picture a reader sends
  // would show a different comparison from the one they are looking at.
  const ceiling = $derived(
    barCeiling({ piPct: calc.pi, officialPct: calc.off, anchor: calc.anchor })
  );

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

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

  // The one link from the results back to the inputs. It reaches across a
  // component boundary by id, the same way the header's skip link reaches
  // `#main`: the field is in a sibling component and Svelte gives this one no
  // handle on it, and on a phone it is a screen and a half back up the page.
  //
  // Focus first with the scroll suppressed, then scroll deliberately. The
  // other order scrolls twice — focus() brings the element into view on its
  // own terms and undoes the framing chosen here. `block: "center"` and not
  // "start", so the field does not land under the sticky header. The jump is
  // instant on purpose: a smooth flight across that distance is a long time to
  // watch, and this is a control the reader asked to be taken to.
  //
  // Focusing rather than merely scrolling is the point on a phone — it raises
  // the keyboard, so the tap that says «въведи своята заплата» leaves the
  // reader able to type, instead of needing a second tap on a field they must
  // first find.
  function focusSalary() {
    const field = document.getElementById("inSalary");
    if (!field) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: "center" });
  }

  // The second cross-boundary route, and it exists because the two rates it is
  // about share a screen while the paragraph reconciling them does not. The
  // explainer band is one closed `<details>` at the foot of the page; opening
  // it and landing on the right heading is two steps, and a bare `href="#…"`
  // does only the second — the browsers that expand a closed `<details>` for a
  // fragment inside it are not all of them, and the ones that do not scroll the
  // reader to a collapsed block with nothing in it.
  //
  // By id across the boundary, like `focusSalary` above: the band is a sibling
  // component 3,000px down and Svelte gives this one no handle on it.
  //
  // No focus() here, unlike the salary route. That one exists to raise a
  // keyboard; this one takes the reader somewhere to read, and moving focus to
  // a heading would announce it mid-sentence to a screen reader already
  // reading the results. The scroll is instant for the reason the other is.
  function openReconciliation() {
    const band = document.querySelector(".explain-band details.explain");
    if (band) band.open = true;
    document.getElementById("two-official")?.scrollIntoView({ block: "center" });
  }

  // The longest route on the page: the headline is at y=1,007 at 360px and the
  // basket heading at y=4,675. `block: "start"` because the reader has to
  // arrive at «За какво отиват парите ти?» and its legend — landing among the
  // sliders puts the instruction above the viewport. No focus(), for
  // `openReconciliation`'s reason: there is no keyboard to raise here.
  function showBasket() {
    document.getElementById("basket")?.scrollIntoView({ block: "start" });
  }
</script>

<!-- **The window stays within a screen of the figure it governs.** It is the
     one control here that is not a fact about the reader, and the headline, its
     € line, both bars and the ranked column are all different numbers under a
     different one. Among the household's own fields it sits 3,113px below what
     it decides at 360px, and a reader who never reaches it never learns the big
     figure has a window at all. -->
<div class="h4row">
  <h4>
    <span class="l-bg">{COPY.yourReal.bg}</span>
    <span class="l-en">{COPY.yourReal.en}</span>
  </h4>
  <div class="m-window">
    <!-- The option text is the visible label, so the accessible name is the
         question it answers: a screen reader otherwise meets bare years. -->
    <select
      id="inAnchor"
      aria-label={t(COPY.anchor, $lang)}
      value={calc.anchor === "y1" ? "y1" : String(calc.anchor)}
      onchange={calc.onAnchorChange}
    >
      <option value="y1"
        >{COPY.anchorY1[$lang] ?? COPY.anchorY1.bg}{calc.yoyWindowLabel
          ? ` · ${calc.yoyWindowLabel}`
          : ""}</option
      >
      {#each calc.anchorYears as y (y)}
        <!-- The end-point range lives in a title rather than the option text:
             inline it is wider than the field and the dropdown breaks. -->
        <option
          value={String(y)}
          title={calc.idxLatestYearLabel && calc.idxLatestYearLabel !== String(y)
            ? $lang === "bg"
              ? `от края на ${y} до ${calc.idxLatestYearLabel}`
              : `end-of-${y} → ${calc.idxLatestYearLabel}`
            : ""}
        >
          {y}</option
        >
      {/each}
    </select>
    <div class="hint">
      <span class="l-bg"
        >{calc.anchor === "y1"
          ? t(COPY.anchorY1Hint, "bg", { latest_month: calc.basketRefPeriod })
          : t(COPY.anchorSinceHint, "bg")}</span
      >
      <span class="l-en"
        >{calc.anchor === "y1"
          ? t(COPY.anchorY1Hint, "en", { latest_month: calc.basketRefPeriod })
          : t(COPY.anchorSinceHint, "en")}</span
      >
    </div>
  </div>
</div>

<div aria-live="polite" aria-atomic="true">
  <!-- The colour follows the basket-vs-average GAP, not the level: the question
       this card answers is "is your basket dearer than the average Bulgarian's?",
       so a high-but-typical basket is not painted as a loss. The same triple
       paints the bar fill below, which is drawn against the same comparison. -->
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
  <!-- «Твоята» is earned, not assumed, and the noun is the bar's own so a
       reader meets one name for one number. -->
  <div class="r-lbl">
    {#if calc.basketIsOwn}
      {#if calc.anchor === "y1"}
        <span class="l-bg">твоята инфлация за последната година</span>
        <span class="l-en">your inflation over the past year</span>
      {:else}
        <span class="l-bg">поскъпването на твоята кошница от {calc.anchor} насам</span>
        <span class="l-en">your basket's rise since {calc.anchor}</span>
      {/if}
    {:else if calc.anchor === "y1"}
      <span class="l-bg">поскъпването на средностатистическата кошница за последната година</span>
      <span class="l-en">the average basket's rise over the past year</span>
    {:else}
      <span class="l-bg">поскъпването на средностатистическата кошница от {calc.anchor} насам</span>
      <span class="l-en">the average basket's rise since {calc.anchor}</span>
    {/if}
  </div>
  {#if calc.householdNet > 0}
    <div class="r-money">
      {#if calc.anchor === "y1"}
        ≈ <span class="b">€{fmt0(calc.extra)}</span>
        <span class="l-bg">повече всеки месец</span>
        <span class="l-en">more every month</span>
        <span class="l-bg">ти струва същият живот отпреди година</span>
        <span class="l-en">is what the same life as a year ago costs you</span>
      {:else}
        <span class="l-bg"
          >≈ <span class="b">€{fmt0(calc.extra)}</span> от всеки твой доход днес</span
        >
        <span class="l-en"
          >≈ <span class="b">€{fmt0(calc.extra)}</span> of every paycheck today</span
        >
        <span class="l-bg">отиват само за поскъпването от {calc.anchor} насам</span>
        <span class="l-en">goes purely to price rises since {calc.anchor}</span>
      {/if}
    </div>
  {/if}
  {#if calc.bite.category && calc.householdNet > 0 && calc.weights.reduce((s, x) => s + x, 0) > 0}
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
      <!-- The slash and the unit share a source line because the newline
           between them was rendering as a space: «≈ €13/ мес», against «€/мес»
           closed up in every other rate on the page. Splitting the amount from
           its unit across two lines is what puts whitespace inside a unit. -->
      ≈ <span class="b">€{fmt0(calc.bite.eurPerMonth)}/</span><span class="l-bg">мес</span><span
        class="l-en">mo</span
      >
    </div>
  {/if}
</div>

<!-- What the figures above are standing on, in the order the figures are:
     this note governs the percentage, the €900 one below it governs the euro.
     Both sit above the bars — a caveat under them is 250px past its claim.
     Only the official basket gets a route: a reader on «с кола всеки ден» has
     already found the chips, and one who has touched nothing has met no
     evidence that the thirteen rows exist. -->
{#if activePresetLabel}
  <p class="m-preset-note">
    <span class="l-bg">{t(COPY.presetActive, "bg", { p: activePresetLabel })}</span>
    <span class="l-en">{t(COPY.presetActive, "en", { p: activePresetLabel })}</span>
  </p>
{:else if !calc.basketIsOwn}
  <p class="m-preset-note">
    <span class="l-bg">{COPY.officialBasketActive.bg}</span>
    <span class="l-en">{COPY.officialBasketActive.en}</span>
    <button type="button" onclick={showBasket}>
      <span class="l-bg">{COPY.officialBasketCta.bg} →</span>
      <span class="l-en">{COPY.officialBasketCta.en} →</span>
    </button>
  </p>
{/if}

<!-- Outside the aria-live block above, deliberately. Inside it, the note and
     its button would be re-announced on every slider tick along with the ~50
     figures the live region already re-reads; and it is not a result, it is a
     standing statement about the ones above it. -->
{#if !calc.earnersDirty && calc.householdNet > 0}
  <div class="placeholder">
    <span class="l-bg">{t(COPY.startingSalary, "bg", { s: fmt0(calc.householdNet) })}</span>
    <span class="l-en">{t(COPY.startingSalary, "en", { s: fmt0(calc.householdNet) })}</span>
    <button type="button" onclick={focusSalary}>
      <span class="l-bg">{COPY.startingSalaryCta.bg}</span>
      <span class="l-en">{COPY.startingSalaryCta.en}</span>
    </button>
  </div>
{/if}

<div class="bars-cap mono">
  {#if calc.anchor === "y1"}
    <span class="l-bg">с колко поскъпна кошницата за 1 година</span>
    <span class="l-en">how much your basket rose over 1 year</span>
  {:else}
    <span class="l-bg">с колко поскъпна кошницата от {calc.anchor} насам</span>
    <span class="l-en">how much your basket rose since {calc.anchor}</span>
  {/if}
</div>
<div class="vbars">
  <!-- On the official weights `pi` and `off` are one number, so this row and
       the one below are one figure under two labels at identical widths —
       measured at 191px and 191px. Two equal bars are the strongest "these were
       compared" signal the card has. -->
  {#if calc.basketIsOwn}
    <div>
      <div class="gm">
        <span class="lab"
          ><span class="l-bg">{COPY.yourBasket.bg}</span><span class="l-en"
            >{COPY.yourBasket.en}</span
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
          style="width:{Math.max(2, (100 * calc.pi) / ceiling)}%;background: {calc.nearOfficial
            ? 'var(--real)'
            : calc.dpi > 0
              ? 'var(--erode)'
              : 'var(--real)'}"
        ></div>
      </div>
    </div>
  {/if}
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
      <div class="fill" style="width:{(100 * calc.off) / ceiling}%;background: var(--muted)"></div>
    </div>
  </div>
</div>

<!-- The verdict says what the two bars above it MEAN, and carries no figure of
     its own. Both rates are already stated three lines up — labelled, to one
     decimal, over the period the caption names — so a paragraph that reprints
     them puts the same pair of numbers on screen twice, 20px apart, and the
     reader reads the second copy looking for the difference from the first.
     What the bars cannot say is which of the two is bigger and whether the gap
     is worth calling one: that is a sentence, and this is it.

     Nothing folds and nothing leaves the default view — the figures stay where
     a reader can compare their lengths, which is the one thing the bars are for.
     `the verdict names the comparison in words, over bars that keep both
     figures` in verify_render.mjs holds both halves of that. -->
{#if calc.basketIsOwn}
  <p class="m-verdict">
    {#if calc.nearOfficial}
      <span class="l-bg">Кошницата ти е близо до средностатистическата.</span>
      <span class="l-en">Your basket is close to the average.</span>
    {:else if calc.dpi > 0}
      <span class="l-bg">При теб е по-скъпо, отколкото при средностатистическия българин.</span>
      <span class="l-en">For you it's pricier than for the average Bulgarian.</span>
    {:else}
      <span class="l-bg">При теб е по-евтино, отколкото при средностатистическия българин.</span>
      <span class="l-en">For you it's cheaper than for the average Bulgarian.</span>
    {/if}
  </p>
{/if}

<!-- The bridge between the two official rates, and deliberately a route
     rather than a sentence. The banner's figure and the average-basket bar are
     on screen together and differ for two compounding reasons; the explainer
     answers that in full, three screens down and folded away. Restating the
     answer here would put a third rate beside the bars, which is the second
     headline number `docs/principles.md` closes — and the verdict above is
     figure-free on the same grounds. So this carries the question and nothing
     else. -->
<p class="m-gap-route">
  <button type="button" onclick={openReconciliation}>
    <span class="l-bg">{COPY.explainGapRoute.bg} →</span>
    <span class="l-en">{COPY.explainGapRoute.en} →</span>
  </button>
</p>

<style>
  /* Layout / shell */
  /* One treatment, because the two are the same kind of sentence: a figure
     above is standing on something the reader did not choose — a hand-made
     preset, or the €900 placeholder — and the note says which. Giving the
     newer one its own box would make the page look like it carries two grades
     of caveat when it carries one. */
  .m-preset-note,
  .placeholder {
    margin: 8px 0 0;
    padding: 7px 9px;
    font-size: var(--fs-small);
    line-height: 1.45;
    color: var(--ink-2);
    background: var(--paper-2);
    border-left: 2px solid var(--muted);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  /* The measurement window. `card.css` draws the control itself, so what is
     here is only its size and where it sits.

     **Its own line at every width, and that is a decision rather than an
     outcome.** Left to wrap, the row is a heading with a control beside it
     between 820px and 1000px and a heading above one everywhere else, so a
     reader meeting the page on a tablet and on a laptop learns it twice. The
     `rem` cap and not `ch`: `ch` is the font's own `0` advance and the select
     falls back to a different face per platform, so a rule that decides this by
     measuring text answers differently on somebody else's machine.

     Two steps under the shared control size, and one more below 430px:
     «посл. 12 месеца · 2025.06 → 2026.06» is 296px of mono at `--fs-meta`
     against a 288px card interior at 360px wide, and the tail it loses is the
     end month. A `<select>` is exempt from the 16px floor that stops iOS
     zooming a focused text field, which is what makes the step available. */
  .m-window {
    flex: 1 0 100%;
    min-width: 0;
  }
  .m-window select {
    max-width: 22rem;
    font-size: var(--fs-meta);
    padding: 5px 8px;
  }
  @media (max-width: 430px) {
    .m-window select {
      font-size: var(--fs-fine);
      padding: 6px 4px;
    }
  }
  /* Which months the figure covers, and the half of the control that dates it
     (P3). A note under a control rather than a claim about the figure, and the
     copy is worded so it cannot be read as one. */
  .m-window .hint {
    margin-top: 4px;
    font-family: var(--mono);
    font-size: var(--fs-fine);
    line-height: 1.4;
    color: var(--muted);
  }
  /* The route to the field reads as a link, not as a call to action. A filled
     button here would out-shout the figure it sits under, which is the number
     the reader came for — the same reasoning that keeps the footer's donate
     ask one quiet line. The basket route in `.m-preset-note` is the same kind
     of control pointing at a different card, so it takes the same treatment
     rather than a second one a reader would have to learn. */
  .m-preset-note button,
  .placeholder button {
    display: inline;
    margin: 0;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    color: var(--real-ink);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--real);
    cursor: pointer;
  }
  .m-preset-note button:hover,
  .placeholder button:hover {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
  /* The route to the reconciliation, quieter still than the one to the salary
     field. That one is the page asking for the reader's number; this one is an
     offer to explain a gap they may not have noticed, and a control that
     competes with the verdict above it has made the gap look like a problem
     before saying anything about it. Same underline treatment, one step down
     in size, so it reads as an aside to the bars rather than a third claim.

     The underline is `--muted` and not `--line`: it is the only thing on this
     control saying it IS one, so WCAG 1.4.11 asks 3:1 of it against the paper
     and `--line` is 1.4:1. Quiet is the brief, invisible is not. */
  .m-gap-route {
    margin: 8px 0 0;
    font-size: var(--fs-small);
    line-height: 1.45;
  }
  .m-gap-route button {
    display: inline;
    margin: 0;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    color: var(--ink-2);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--muted);
    cursor: pointer;
  }
  .m-gap-route button:hover {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }

  /* Results */
  .r-big {
    font-size: var(--fs-hero);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  /* The size is what subordinates the sign — 0.42em of the figure beside it,
     raised off the baseline. **No `opacity` on top of that.** The `%` inherits
     the verdict colour set on `.r-big`, and the branch that fires whenever the
     reader's basket is dearer than the average is `--erode`: 0.62 composites to
     2.83:1 light and 2.65:1 dark, and clearing 4.5:1 over that token would take
     0.87 light and 0.96 dark, which is not a fade. 0.42em of the clamp is
     16.8px at the narrow end, under both large-text thresholds (18.66px bold,
     24px), so 4.5:1 is the bar at every viewport width. */
  .r-big .pct {
    font-size: 0.42em;
    font-weight: 600;
    vertical-align: 0.95em;
    margin-left: 0.06em;
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
    /* A rem term in the middle, and the ceiling is a scale step rather than the
       literal `1.375rem` it had been — which was `--fs-h2`'s old value frozen
       into a second file, so the two would have parted the moment either moved. */
    font-size: clamp(var(--fs-strong), 0.95rem + 0.55vw, var(--fs-h3));
    line-height: 1.3;
    letter-spacing: -0.01em;
    margin: 12px 0 0;
    max-width: 46ch;
  }
</style>
