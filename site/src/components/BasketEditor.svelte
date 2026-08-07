<script>
  /**
   * The basket: which of the thirteen ECOICOP divisions the user's money goes
   * to, and optionally how it splits inside one of them.
   *
   * Every number rendered here — a division's name, its rate, its verify link,
   * its sub-groups — comes out of `hicp_categories.json`. Nothing about the
   * classification is written down in this file, so an upstream reclassification
   * reaches the page through a pipeline run rather than an edit here. That is
   * the invariant `verify_wiring.mjs` §"the basket iterates the published
   * categories, not a literal list" exists to hold.
   */
  import { lang } from "../lib/stores.js";
  import { integer, percentSigned } from "../lib/format.js";
  import { COPY } from "../lib/content.js";
  import { rateFor } from "../lib/mirror.js";
  import { t } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt0 = (x) => integer(x, $lang);
  // The rate beside a row's code, in the same hand as every other signed
  // percentage on the page. Both rows here used to write the sign inline —
  // `{rate < 0 ? "" : "+"}{fmt(rate)}` — which reads as equivalent and is not:
  // it prints «+0,0%» over a rate of zero, and it takes its minus from
  // `toLocaleString`, which is U+002D where the whole page is U+2212.
  const signedPct = (x) => percentSigned(x, 1, $lang);

  // Which spend-share sentence is true of this reader. `spendable` is the
  // household's net pay minus whatever rent or mortgage they entered, so the
  // variant that names only the net pay is exact at zero housing and overstates
  // the base by the housing payment above it. Same gate, same reason, as
  // LeftoverRow.
  const hasHousing = $derived(calc.housingCost > 0);

  // Every figure the carve-out sentence can name, formatted once. Each of the
  // three strings takes the slots it needs and bolds the one it is about, so a
  // shared set cannot hand a sentence a figure formatted a different way from
  // its neighbour's. `housingCost` is view.js#housingCarveOut's — the amount
  // the € column is genuinely carved out of, and the same total the leftover
  // row states one control further down.
  const carvedArgs = $derived({
    rent: fmt0(calc.rent),
    mort: fmt0(calc.monthlyMort),
    total: fmt0(calc.housingCost),
  });
</script>

<!-- BASKET PRESETS + SLIDERS -->
<h4 style="margin-top:14px;margin-bottom:8px">
  <span class="l-bg">{COPY.basketHead.bg}</span>
  <span class="l-en">{COPY.basketHead.en}</span>
</h4>
<p class="leg">
  <span class="l-bg">{COPY.basketLegend.bg}</span>
  <span class="l-en">{COPY.basketLegend.en}</span>
</p>
<!-- Carve-out hint: when a home or a rent is on, the € column is drawn
     from what is left after it and the percentages do not move. It sits
     above the list because it explains a column the reader is about to
     read, not one they have read.

     ONE sentence, whichever housing costs are on. A reader buying while
     still renting is who the home block is for, so both being live is a
     state the app invites — and two sentences there each claim the €
     figures are what is left after their own payment, neither mentioning
     the other. The reader cannot tell whether the base is the salary less
     the rent, less the payment, or less both, and only the last is true.
     The combined variant names the sum instead, and takes it from
     `housingCost` so the sentence and the arithmetic cannot name different
     numbers. -->
{#if calc.homeOn && calc.monthlyMort > 0 && calc.rent > 0}
  <p class="leg" style="color:var(--ink-2); margin-top:2px">
    <span class="l-bg">{@html t(COPY.housingCarved, "bg", carvedArgs)}</span>
    <span class="l-en">{@html t(COPY.housingCarved, "en", carvedArgs)}</span>
  </p>
{:else if calc.rent > 0}
  <p class="leg" style="color:var(--ink-2); margin-top:2px">
    <span class="l-bg">{@html t(COPY.rentCarved, "bg", carvedArgs)}</span>
    <span class="l-en">{@html t(COPY.rentCarved, "en", carvedArgs)}</span>
  </p>
{:else if calc.homeOn && calc.monthlyMort > 0}
  <p class="leg" style="color:var(--ink-2); margin-top:2px">
    <span class="l-bg">{@html t(COPY.basketCarved, "bg", carvedArgs)}</span>
    <span class="l-en">{@html t(COPY.basketCarved, "en", carvedArgs)}</span>
  </p>
{/if}
<!-- INPUT MODE: percentage shares vs actual euros per month.
     People know their euros better than their percentages, so the
     € mode is a first-class way in, not a power-user extra. Both
     modes feed the SAME array (see the `weights` declaration): the
     maths normalises by Σ either way, so flipping the toggle
     cannot move the user's inflation number. -->
<div class="basketbar">
  <div class="seg" role="group" aria-label={$lang === "bg" ? "Как да въведеш" : "How to enter"}>
    <button
      class="segbtn"
      aria-pressed={calc.spendMode === "pct"}
      onclick={() => calc.setSpendMode("pct")}
    >
      <span class="l-bg">{COPY.modePct.bg}</span><span class="l-en">{COPY.modePct.en}</span>
    </button>
    <button
      class="segbtn"
      aria-pressed={calc.spendMode === "eur"}
      onclick={() => calc.setSpendMode("eur")}
    >
      <span class="l-bg">{COPY.modeEur.bg}</span><span class="l-en">{COPY.modeEur.en}</span>
    </button>
  </div>
  <label class="homeTog">
    <input type="checkbox" bind:checked={calc.detailMode} />
    <span class="l-bg">{COPY.detailToggle.bg}</span>
    <span class="l-en">{COPY.detailToggle.en}</span>
  </label>
</div>
<p class="leg">
  <span class="l-bg">{COPY.modeHint.bg}</span>
  <span class="l-en">{COPY.modeHint.en}</span>
</p>
<!-- HOW MUCH OF THE PAY IS SPENT AT ALL. Share mode only, and that is the
     decision this control turns on rather than an omission: the two modes
     answer the same question with different authority. In € mode the
     remainder is MEASURED — thirteen amounts the reader typed, tallied
     against their pay — and a stated claim beside a measured one gives the
     page two answers that can disagree while both are on screen. So the €
     tally keeps speaking for itself and this appears only where nothing else
     can supply the size of the pot.

     It renders at 100% too, unmoved, because that is the whole point: the
     assumption was being made either way, and a reader who never opens this
     card's other mode had no way to see it, let alone disagree. Stating it as
     a first-person claim with a handle on it is what turns a hidden default
     into an answerable question. -->
{#if calc.spendMode !== "eur"}
  <div class="spendshare">
    <!-- Same two-variant split, and the same ternary form, as LeftoverRow:
         the base is `spendable`, so naming the net pay alone overstates it by
         the whole housing payment for a reader who entered one. The ternary
         sits INSIDE `t(...)` because the template-safety scanner needs two
         rooted `COPY.<key>.<lang>` leaves — `COPY[key]` fails that check. -->
    <p class="ss-lab">
      <span class="l-bg"
        >{@html t(
          hasHousing ? COPY.spendShareLeadWithHousing : COPY.spendShareLeadNoHousing,
          "bg",
          {
            p: fmt0(calc.spendSharePct),
            h: fmt0(calc.housingCost),
          }
        )}</span
      >
      <span class="l-en"
        >{@html t(
          hasHousing ? COPY.spendShareLeadWithHousing : COPY.spendShareLeadNoHousing,
          "en",
          {
            p: fmt0(calc.spendSharePct),
            h: fmt0(calc.housingCost),
          }
        )}</span
      >
    </p>
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      value={calc.spendSharePct}
      oninput={(e) => calc.onSpendShareInput(e.currentTarget.value)}
      style="--f:{calc.spendSharePct}%"
      aria-label={t(COPY.spendShareAria, $lang)}
    />
  </div>
{/if}
{#if calc.detailMode}
  <p class="leg">
    <span class="l-bg">{COPY.detailHint.bg}</span>
    <span class="l-en">{COPY.detailHint.en}</span>
  </p>
{/if}
<!-- The € tally, and the bar under it. Both read `budget`
     (view.js#basketBudget) rather than subtracting inline: the
     leftover is stated in three places on this page and they have to
     be one number. The bar deliberately does NOT fill to 100% when
     money is unplaced — the empty part IS the point, and a progress
     bar that only looks finished at the full salary instructs the
     reader to assign every euro, which is the instruction the "not
     placed" row exists to withdraw. -->
{#if calc.spendMode === "eur" && calc.householdNet > 0}
  <div class="budgetbar" aria-hidden="true">
    <div
      class="fill"
      class:over={calc.budget.over > 0}
      style="width:{calc.spendable > 0
        ? Math.min(100, (100 * calc.budget.entered) / calc.spendable)
        : 0}%"
    ></div>
  </div>
  <p class="leg tally">
    <span class="l-bg"
      >{@html t(COPY.modeEurTally, "bg", { a: fmt0(calc.budget.entered), s: fmt0(calc.spendable) })}
      · {@html calc.budget.over > 0
        ? t(COPY.modeEurOver, "bg", { r: fmt0(calc.budget.over) })
        : t(COPY.modeEurLeft, "bg", { r: fmt0(calc.budget.leftover) })}</span
    >
    <span class="l-en"
      >{@html t(COPY.modeEurTally, "en", { a: fmt0(calc.budget.entered), s: fmt0(calc.spendable) })}
      · {@html calc.budget.over > 0
        ? t(COPY.modeEurOver, "en", { r: fmt0(calc.budget.over) })
        : t(COPY.modeEurLeft, "en", { r: fmt0(calc.budget.leftover) })}</span
    >
  </p>
{/if}

<div id="sliders">
  {#each calc.categories as c, i (c.cp_code)}
    {@const open = calc.openDivisions.has(i)}
    {@const edited = calc.splits[i] != null}
    <div class="cat" class:open={open && calc.detailMode}>
      <div class="top">
        <span class="nm">
          {#if calc.detailMode && c.groups?.length}
            <button
              class="disc"
              aria-expanded={open}
              onclick={() => calc.toggleDivision(i)}
              title={$lang === "bg"
                ? `${open ? COPY.detailClose.bg : COPY.detailOpen.bg} — ${c.groups.length} подгрупи`
                : `${open ? COPY.detailClose.en : COPY.detailOpen.en} - ${c.groups.length} sub-groups`}
              >{open ? "−" : "+"}</button
            >
          {/if}
          <span class="l-bg">{c.bg_name}</span>
          <span class="l-en">{c.en_name}</span>
          <!-- Code link and rate travel together (nowrap): when the
               name is long enough to wrap, an orphaned "+1.4%" on
               its own line reads as a broken layout. -->
          <span class="meta">
            <a
              class="vlink"
              href={calc.estatCatUrl(c)}
              target="_blank"
              rel="noopener"
              title={$lang === "bg"
                ? `${c.cp_code} ${c.eurostat_label ? "· " + c.eurostat_label : ""} — официалните данни на Евростат за точно това число`
                : `${c.cp_code} ${c.eurostat_label ? "· " + c.eurostat_label : ""} - Eurostat's own data for exactly this figure`}
              >{c.cp_code} ↗</a
            >
            <span class="yo mono">· {signedPct(calc.rateForDivision(i))}</span>
          </span>
          {#if edited}
            <button
              class="miniundo"
              onclick={() => calc.resetSplit(i)}
              title={$lang === "bg" ? COPY.detailReset.bg : COPY.detailReset.en}
            >
              <span class="l-bg">{COPY.detailEdited.bg} ↺</span>
              <span class="l-en">{COPY.detailEdited.en} ↺</span>
            </button>
          {/if}
        </span>
        <span class="pc mono">
          <span>{fmt0(calc.divisionSharePct(i))}%</span>
          <!-- €/mo per group, carved out of (salary − housing). The
               carve-out shrinks this column whenever housing eats
               more of the pay; the percentages don't move. We show
               the SHARE (not the rate-inclusive cost) so the column
               reads as "how much of your take-home goes here" —
               the natural budget reading. -->
          <small>{calc.householdNet > 0 ? `≈ €${fmt0(calc.divisionEur(i))}` : ""}</small>
        </span>
      </div>
      {#if calc.spendMode === "eur"}
        <span class="eurin">
          <span class="cur">€</span>
          <input
            type="number"
            inputmode="numeric"
            min="0"
            step="5"
            value={calc.weights[i]}
            oninput={(e) => calc.onSliderInput(i, e.currentTarget.value)}
            aria-label={$lang === "bg"
              ? `${c.bg_name} — евро на месец`
              : `${c.en_name} - euros per month`}
          />
        </span>
      {:else}
        <input
          type="range"
          min="0"
          max="45"
          step="1"
          value={calc.weights[i]}
          oninput={(e) => calc.onSliderInput(i, e.currentTarget.value)}
          style="--f:{(100 * calc.weights[i]) / 45}%"
          aria-label={$lang === "bg" ? c.bg_name : c.en_name}
        />
      {/if}

      <!-- DRILL-DOWN: ECOICOP level 2, pipeline-published. Every
           number here (name, rate, default share, verify link)
           comes from hicp_categories.json → categories[].groups[];
           nothing about the sub-level is hardcoded in the SPA. -->
      {#if calc.detailMode && open && c.groups?.length}
        {@const sp = calc.splitFor(i)}
        {@const spTotal = sp.reduce((s, x) => s + (x > 0 ? x : 0), 0)}
        <div class="subs">
          {#each c.groups as g, gi (g.cp_code)}
            <div class="sub">
              <div class="top">
                <span class="nm">
                  <span class="l-bg">{g.bg_name}</span>
                  <span class="l-en">{g.en_name}</span>
                  <span class="meta">
                    <a
                      class="vlink"
                      href={calc.estatCatUrl(g)}
                      target="_blank"
                      rel="noopener"
                      title={`${g.cp_code} · ${g.eurostat_label}`}>{g.cp_code} ↗</a
                    >
                    <span class="yo mono">· {signedPct(rateFor(g, calc.anchor))}</span>
                  </span>
                </span>
                <span class="pc mono">
                  <span>{fmt0(spTotal > 0 ? (100 * Math.max(0, sp[gi])) / spTotal : 0)}%</span>
                  <small
                    >{calc.householdNet > 0 && spTotal > 0
                      ? `≈ €${fmt0((calc.divisionEur(i) * Math.max(0, sp[gi])) / spTotal)}`
                      : ""}</small
                  >
                </span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(1, calc.weights[i])}
                step="0.5"
                value={Math.min(sp[gi], Math.max(1, calc.weights[i]))}
                oninput={(e) => calc.onGroupInput(i, gi, e.currentTarget.value)}
                style="--f:{(100 * Math.min(sp[gi], Math.max(1, calc.weights[i]))) /
                  Math.max(1, calc.weights[i])}%"
                aria-label={$lang === "bg" ? g.bg_name : g.en_name}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<!-- READY-MADE BASKETS, under the rows they fill.
     A row of chips directly beneath «За какво отиват парите ти?» is read as
     the answer to that question, and the thirteen rows below it as the
     readout it produced — so a reader concludes the app holds five lives and
     his is not among them. Two sentences already say the sliders are the
     instrument; both lose, because a sentence cannot outvote a layout that
     puts the shortcut where the answer goes. Below the list the same chips
     are what they actually are: somewhere to start, found after the reader
     has scrolled the thing that does the work.

     There is deliberately no "fit to my housing payment" chip: the right
     column already carves mortgage and rent out of the € figures, and
     rescaling the user's hand-tuned percentages on top of that would
     overwrite what they typed. Nor is there a chip that combines two of the
     four — averaging two invented baskets yields a third with less basis
     than either, in the same voice as a Eurostat figure (P3, P7). Combining
     is what the sliders are. -->
<p class="leg presetlead">
  <span class="l-bg">{COPY.presetsHint.bg}</span>
  <span class="l-en">{COPY.presetsHint.en}</span>
</p>
<div class="presets" role="group" aria-label={t(COPY.presetsAria, $lang)}>
  <button
    class="chip"
    data-preset="driver"
    aria-pressed={calc.activePreset === "driver"}
    onclick={() => calc.applyPreset("driver")}
  >
    <span class="l-bg">{COPY.presetDriver.bg}</span>
    <span class="l-en">{COPY.presetDriver.en}</span>
  </button>
  <button
    class="chip"
    data-preset="noCar"
    aria-pressed={calc.activePreset === "noCar"}
    onclick={() => calc.applyPreset("noCar")}
  >
    <span class="l-bg">{COPY.presetNoCar.bg}</span>
    <span class="l-en">{COPY.presetNoCar.en}</span>
  </button>
  <button
    class="chip"
    data-preset="family"
    aria-pressed={calc.activePreset === "family"}
    onclick={() => calc.applyPreset("family")}
  >
    <span class="l-bg">{COPY.presetFamily.bg}</span>
    <span class="l-en">{COPY.presetFamily.en}</span>
  </button>
  <button
    class="chip"
    data-preset="pensioner"
    aria-pressed={calc.activePreset === "pensioner"}
    onclick={() => calc.applyPreset("pensioner")}
  >
    <span class="l-bg">{COPY.presetPensioner.bg}</span>
    <span class="l-en">{COPY.presetPensioner.en}</span>
  </button>
  <!-- «или» separates the four illustrations from the one real basket. The
       official chip is live Eurostat data with a source behind it, so it
       cannot sit in the same enumeration as four baskets we invented. -->
  <span class="or">
    <span class="l-bg">{COPY.presetsOr.bg}</span>
    <span class="l-en">{COPY.presetsOr.en}</span>
  </span>
  <button
    class="chip"
    data-preset="official"
    aria-pressed={calc.activePreset === "official"}
    onclick={() => calc.applyPreset("official")}
  >
    <span class="l-bg">{COPY.presetOfficial.bg}</span>
    <span class="l-en">{COPY.presetOfficial.en}</span>
  </button>
</div>

<style>
  .presets {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    margin: 2px 0 12px;
  }
  .presetlead {
    margin-top: 14px;
  }
  .presets .or {
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .chip {
    font-family: var(--mono);
    font-size: var(--fs-small);
    border: 1px solid var(--control-line);
    background: var(--paper-2);
    color: var(--ink-2);
    padding: 5px 10px;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--real);
    color: var(--real-ink);
  }
  /* Marked, not crowned. A solid `--ink` fill is the strongest "this is the
     answer" signal the app has, and on a chip that only seeded the sliders it
     says the reader has finished — the loaded basket is a starting position,
     and the thirteen rows above are what settles the number. The accent-soft
     treatment says which one is loaded without outranking them. */
  .chip[aria-pressed="true"] {
    background: var(--real-soft);
    color: var(--real-ink);
    border-color: var(--real);
  }
  .leg {
    margin: 0 0 10px;
    font-size: var(--fs-small);
    color: var(--muted);
    line-height: 1.5;
  }
  /* Basket toolbar: input mode on the left, detail switch on the right. */
  .basketbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin: 2px 0 8px;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .segbtn {
    font-family: var(--mono);
    font-size: var(--fs-small);
    border: 0;
    background: var(--paper-2);
    color: var(--ink-2);
    padding: 5px 11px;
    cursor: pointer;
  }
  .segbtn + .segbtn {
    border-left: 1px solid var(--control-line);
  }
  .segbtn[aria-pressed="true"] {
    background: var(--ink);
    color: var(--paper);
  }
  .leg.tally {
    color: var(--ink-2);
    margin-top: 6px;
  }
  /* Boxed, unlike the thirteen rows below it, because it is not one of them:
     it sets the size of the pot they divide. Sharing their rail — see the
     range rules at the foot of this file — is deliberate and does the
     opposite work, saying it is the same kind of thing to grab; the panel is
     what stops it reading as a fourteenth division. */
  .spendshare {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper-2);
    padding: 8px 10px 4px;
    margin: 0 0 10px;
  }
  .ss-lab {
    margin: 0 0 2px;
    font-size: var(--fs-small);
    color: var(--ink-2);
  }
  /* How much of the spendable amount the basket accounts for. Not a progress
     bar and styled so it cannot be read as one: the unfilled part is the money
     the reader chose not to place, which is a legitimate resting state, so
     there is no target colour, no 100% reward and no "complete" mark. It turns
     the loss colour only when the entered total exceeds what there is. */
  .budgetbar {
    height: 5px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
    margin: 8px 0 0;
  }
  .budgetbar .fill {
    height: 100%;
    background: var(--real);
    border-radius: 3px;
    transition: width 0.25s;
  }
  .budgetbar .fill.over {
    background: var(--erode);
  }

  /* Ledger "green-bar" paper: the basket rows read as one continuous
     accounting printout — full-bleed to the card edge, alternating faint
     green bands, hairline rules between. The subject's own material. */
  #sliders {
    margin: 2px -20px 0;
    border-top: 1px solid var(--line-2);
  }
  .cat {
    margin: 0;
    padding: 8px 20px 10px;
    border-bottom: 1px solid var(--rule);
  }
  .cat:nth-child(even) {
    background: var(--gain-band);
  }
  .cat.open {
    background: var(--paper-2);
  }
  /* Focus is marked on the ROW, not only on the 6px rail inside it. A keyboard
     reader arrowing down the basket is otherwise tracking a two-pixel outline
     against thirteen near-identical lines, and the row's name — the only thing
     that says which division they are about to change — is at the other end of
     it. Last of the three background rules, so it wins over the ledger banding
     and the opened-division tint at equal specificity. */
  .cat:focus-within {
    background: var(--real-soft);
    box-shadow: inset 3px 0 0 var(--real);
  }

  /* Disclosure control for the ECOICOP level-2 drill-down. A plain +/− in
     the mono face — the row is already dense, and an icon would read as
     another number. */
  .disc {
    font-family: var(--mono);
    font-size: var(--fs-meta);
    line-height: 1;
    width: 16px;
    height: 16px;
    padding: 0;
    margin-right: 5px;
    border: 1px solid var(--control-line);
    border-radius: 3px;
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
    vertical-align: baseline;
  }
  .disc:hover {
    border-color: var(--real);
    color: var(--real-ink);
  }
  /* "your own split ↺" — appears only once a division has been hand-split,
     and clicking it restores Eurostat's own rate for that division. */
  .miniundo {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    margin-left: 5px;
    padding: 1px 5px;
    border: 1px solid var(--control-line);
    border-radius: 3px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .miniundo:hover {
    border-color: var(--real);
    color: var(--real-ink);
  }

  /* €/month input, used in place of the slider in "€ per month" mode. This is
     the field most people actually type their own life into, so it carries the
     same 16px floor as the salary box — see `.field input` above for why. */
  .eurin {
    position: relative;
    display: block;
  }
  .eurin .cur {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--mono);
    font-size: var(--fs-body);
    color: var(--muted);
    pointer-events: none;
  }
  .eurin input {
    width: 100%;
    padding: 6px 8px 6px 24px;
    font-family: var(--mono);
    font-size: var(--fs-lead);
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
  }
  .eurin input:focus-visible {
    outline: 2px solid var(--real);
    outline-offset: 1px;
  }

  /* Sub-group rows: indented, quieter, same anatomy as their parent so the
     hierarchy reads without a legend. */
  .subs {
    margin: 6px 0 2px;
    padding-left: 14px;
    border-left: 2px solid var(--line-2);
  }
  .sub {
    padding: 4px 0 6px;
  }
  .sub .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: var(--fs-small);
    margin-bottom: 2px;
  }
  .sub .top .nm {
    color: var(--muted);
  }
  .sub .top .pc {
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--ink-2);
    white-space: nowrap;
  }
  .sub .top .pc small {
    color: var(--muted);
  }
  .sub .top .yo {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
  }
  /* The sub-group rail carries the same groove and handle as its parent, one
     step quieter. A sub-row that reads as a chart while the division above it
     reads as a control teaches the hierarchy wrong: the drill-down is where
     the decisions people actually make live (car vs tickets, rent vs
     electricity), and it is worth nothing if a reader takes it for a
     breakdown. */
  .sub input[type="range"] {
    width: 100%;
    height: 20px;
    margin: 0;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
  }
  .sub input[type="range"]::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      var(--real) 0 var(--f, 50%),
      var(--track) var(--f, 50%) 100%
    );
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .sub input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border-radius: 100px;
    background:
      linear-gradient(var(--real) 0 0) 40% 50% / 1px 5px no-repeat,
      linear-gradient(var(--real) 0 0) 60% 50% / 1px 5px no-repeat,
      var(--surface);
    border: 2px solid var(--real);
  }
  .sub input[type="range"]::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--track);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .sub input[type="range"]::-moz-range-progress {
    height: 4px;
    border-radius: 2px;
    background: var(--real);
  }
  .sub input[type="range"]::-moz-range-thumb {
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border-radius: 100px;
    background:
      linear-gradient(var(--real) 0 0) 40% 50% / 1px 5px no-repeat,
      linear-gradient(var(--real) 0 0) 60% 50% / 1px 5px no-repeat,
      var(--surface);
    border: 2px solid var(--real);
  }
  .sub input[type="range"]:focus-visible {
    outline: 2px solid var(--real);
    outline-offset: 2px;
  }
  .cat .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: var(--fs-meta);
    margin-bottom: 3px;
    gap: 8px;
  }
  .cat .top .nm {
    color: var(--ink-2);
  }
  .cat .top .pc {
    font-family: var(--mono);
    font-size: var(--fs-meta);
    color: var(--ink);
    font-weight: 500;
    white-space: nowrap;
  }
  .cat .top .pc small {
    color: var(--muted);
    font-weight: 400;
  }
  .cat .top .yo {
    font-family: var(--mono);
    font-size: var(--fs-fine);
    color: var(--muted);
  }
  /* Keeps "CP07 ↗ · +11.0%" on one line when the name above it wraps. */
  .meta {
    white-space: nowrap;
  }
  /* `.vlink` is in $lib/card.css — both cards draw it, and the copy that
     lived here did not reach the ranked list next door. */

  /* A basket row has to be legible as something the reader may seize, and it
     is competing with the app's own bar charts: `.rank .track` in the results
     card is the same rounded 5px rail with a coloured fill, under the same
     name · code · rate · value line. Two things separate them, and neither is
     motion — `tokens.css` kills every transition under
     `prefers-reduced-motion`, so an affordance that animates does not exist
     for those readers:

       - the track is a GROOVE. The inset hairline reads as something cut into
         the row; a chart's bar sits on top of it and never carries one.
       - the thumb is a HANDLE, 18px with a grip. A chart has no handle at all,
         and 18px on a 24px input is a tap target rather than a decoration —
         the 360px phone this has to work on has no hover to fall back on.

     The spend-share control takes the same rail for the same reasons, and one
     more: it is drawn at 100% by default, where a rail with no groove and no
     handle is a full green bar reading as a score. */
  .cat input[type="range"],
  .spendshare input[type="range"] {
    width: 100%;
    height: 24px;
    margin: 0;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
  }
  .cat input[type="range"]::-webkit-slider-runnable-track,
  .spendshare input[type="range"]::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      var(--real) 0 var(--f, 50%),
      var(--track) var(--f, 50%) 100%
    );
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .cat input[type="range"]::-webkit-slider-thumb,
  .spendshare input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    margin-top: -6px;
    border-radius: 100px;
    background:
      linear-gradient(var(--real) 0 0) 40% 50% / 1px 7px no-repeat,
      linear-gradient(var(--real) 0 0) 60% 50% / 1px 7px no-repeat,
      var(--surface);
    border: 2px solid var(--real);
  }
  .cat input[type="range"]::-moz-range-track,
  .spendshare input[type="range"]::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--track);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .cat input[type="range"]::-moz-range-progress,
  .spendshare input[type="range"]::-moz-range-progress {
    height: 6px;
    border-radius: 3px;
    background: var(--real);
  }
  .cat input[type="range"]::-moz-range-thumb,
  .spendshare input[type="range"]::-moz-range-thumb {
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    border-radius: 100px;
    background:
      linear-gradient(var(--real) 0 0) 40% 50% / 1px 7px no-repeat,
      linear-gradient(var(--real) 0 0) 60% 50% / 1px 7px no-repeat,
      var(--surface);
    border: 2px solid var(--real);
  }
  .cat input[type="range"]:focus-visible,
  .spendshare input[type="range"]:focus-visible {
    outline: 2px solid var(--real);
    outline-offset: 2px;
  }
</style>
