<!--
  The home row: the monthly mortgage payment, how much of take-home it takes,
  and where that sits against the 30%-of-net line the calculator draws.

  The line is ours, not a bank's — `prudentDstiPct` in
  $lib/mirror.js — and the row says so, next to the real regulatory limits the
  БНБ publishes. Every figure arrives computed; the component draws the bar and
  the reverse "what could I afford" reading.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { bgIn, number, integer, safeText } from "$lib/format.js";

  const {
    /** The row renders only when the home block is switched on. */
    homeOn = false,
    /** Monthly take-home for the WHOLE household, the denominator for every
     * share below. A joint application is assessed on the incomes that service
     * the loan, and the 30% line is drawn against the money that arrives. */
    householdNet = 0,
    /** Annual interest rate (%) and term in years, as entered. */
    rate = 0,
    term = 0,
    /** Deposit share (%), so the loan is (100 − downPayPct)% of the price. */
    downPayPct = 0,
    /** Size in m² and the resulting price. */
    m2 = 0,
    homePrice = 0,
    /** The annuity payment and its share of take-home. */
    monthlyMort = 0,
    mortShare = 0,
    /** The 30%-of-net line in euro, and the signed distance to it. */
    mortCapEur = 0,
    mortCapGap = 0,
    /** Years of whole take-home the price amounts to. */
    homeYearsVal = 0,
    /** The reverse reading: the most this income could carry. */
    maxAffordPrice = 0,
    maxAffordM2 = 0,
    /** БНБ lending limits (DSTI/LTV/maturity) for the same period. */
    limits = {},
    /** The chosen city's €/m² provenance, quoted where the default price
        comes from. */
    cityEurPerM2 = 0,
    cityNDistricts = 0,
    /** True when the €/m² came from city_price.json, not the offline constant. */
    cityPriceIsLive = false,
    cityPriceDated = "",
    cityNameBg = "",
    cityNameEn = "",
    /** Whether the price has a source: имот.bg's median for the reader's own
        град, or one they typed. There is no third answer — see
        `view.js#homePriceFor`. */
    priceIsSourced = false,
    /** The €/m² the price above is built from, and whether it is the reader's
        own — `view.js#homePriceBasis`, so the bracket and the total cannot end
        up describing different prices. */
    basisEurPerM2 = 0,
    basisIsOwn = false,
  } = $props();

  // The prudent line the marker sits on, from mortgage.json →
  // lending_limits.prudent_dsti_pct. It is a passive indicator — it shows
  // where the line is and never rescales the bar.
  const prudentDstiPct = $derived(limits.prudentDstiPct);

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // The €/m² in the bracket is the one the total beside it is built from, and
  // the basis word says whose it is. In manual mode both are the reader's own;
  // captioning their price with имот.bg's median stated that a number they
  // invented came off имот.bg's districts, and the two differed — €200 000 over
  // 70 m² is €2857, not the €2501 it printed.
</script>

<!-- HOME -->
{#if homeOn && householdNet > 0 && !priceIsSourced}
  <!-- **Nothing here is priced until a €/m² comes from somewhere.** With no
       median for the reader's own град the block ran on
       `HOME.eurPerM2_offlineFallback` — a round constant имот.bg never
       published — and printed a €175,000 home, a €661/month payment and a
       "44% of your pay" verdict off it. It did not stop at this row either:
       `monthlyMort` is carved out of the money the basket's € column is
       computed from, so an invented mortgage moved thirteen category figures
       the reader would never have connected to it.

       One sentence for all three ways to get here — nobody has chosen an
       област, имот.bg publish no city for the one they chose, or this refresh
       has not read theirs. WHICH of them it is is on the housing card in the
       strip, in имот.bg's name or in ours as the case may be; what this row
       owes the reader is what to do about it. -->
  <div class="r-row">
    <div class="rr-top">
      <span class="rr-k"
        ><span class="l-bg">{COPY.homeK.bg}</span><span class="l-en">{COPY.homeK.en}</span></span
      >
      <span class="rr-v mono">—</span>
    </div>
    <div class="rr-note">
      <span class="l-bg">{COPY.homeNoPrice.bg}</span>
      <span class="l-en">{COPY.homeNoPrice.en}</span>
    </div>
  </div>
{:else if homeOn && householdNet > 0}
  <div class="r-row">
    <div class="rr-top">
      <span class="rr-k"
        ><span class="l-bg">{COPY.homeK.bg}</span><span class="l-en">{COPY.homeK.en}</span></span
      >
      <span class="rr-v mono">{fmt(homeYearsVal)} {$lang === "bg" ? "г." : "yrs"}</span>
    </div>
    <!-- Through `t()` with the sentence chosen in front of it, because both the
         SENTENCE and the basis word are choices. A reader who typed their own
         price without picking an област told the page what a home costs and not
         where it is, and the with-a-city form renders «70 м² в  ≈ €200 000» —
         a dangling preposition round an empty <b>.

         The €/m² in the bracket is the one the total beside it is built from,
         and the basis word says whose it is. Captioning a price the reader
         typed with имот.bg's median stated that a number they invented came off
         имот.bg's districts, and the two differed: €200 000 over 70 m² is
         €2857, not the €2501 it printed. -->
    <div class="rr-t">
      <span class="l-bg"
        >{@html t(cityNameBg ? COPY.homeYears : COPY.homeYearsNoCity, "bg", {
          v: bgIn(cityNameBg),
          city: safeText(cityNameBg),
          m: fmt0(m2),
          p: fmt0(homePrice),
          pm2: fmt0(basisEurPerM2),
          basis: basisIsOwn
            ? COPY.homeBasisOwn.bg
            : cityPriceIsLive
              ? COPY.homeBasisMedian.bg
              : COPY.homeBasisPlaceholder.bg,
          y: fmt(homeYearsVal),
        })}</span
      >
      <span class="l-en"
        >{@html t(cityNameBg ? COPY.homeYears : COPY.homeYearsNoCity, "en", {
          city: safeText(cityNameEn),
          m: fmt0(m2),
          p: fmt0(homePrice),
          pm2: fmt0(basisEurPerM2),
          basis: basisIsOwn
            ? COPY.homeBasisOwn.en
            : cityPriceIsLive
              ? COPY.homeBasisMedian.en
              : COPY.homeBasisPlaceholder.en,
          y: fmt(homeYearsVal),
        })}</span
      >
    </div>
    <!-- имот.bg's own figure and its provenance, and only where it is what the
         price above came from. Under a price the reader typed it sources
         nothing on screen — the comparison against their €/m² is on the input
         itself, beside the box they typed it into. -->
    {#if !basisIsOwn}
      <div class="rr-note">
        <span class="l-bg"
          >{@html COPY.homeYearsSrc.bg
            .replace("{pm2}", fmt0(cityEurPerM2))
            .replace(
              "{src}",
              $lang === "bg"
                ? cityNDistricts
                  ? `имот.bg · ${cityNDistricts} квартала · ${cityPriceDated}`
                  : "очакваме данни"
                : ""
            )}</span
        >
        <span class="l-en"
          >{@html COPY.homeYearsSrc.en
            .replace("{pm2}", fmt0(cityEurPerM2))
            .replace(
              "{src}",
              $lang === "bg"
                ? ""
                : cityNDistricts
                  ? `imot.bg · ${cityNDistricts} districts · ${cityPriceDated}`
                  : "loading"
            )}</span
        >
      </div>
    {/if}
    <div class="rr-t">
      <span class="l-bg"
        >{@html t(COPY.homeMort, $lang, {
          r: fmt(rate),
          t: fmt0(term),
          d: fmt0(downPayPct),
          pm: fmt0(monthlyMort),
          s: fmt(mortShare, 0),
        })}</span
      >
      <span class="l-en"
        >{@html t(COPY.homeMort, $lang, {
          r: fmt(rate),
          t: fmt0(term),
          d: fmt0(downPayPct),
          pm: fmt0(monthlyMort),
          s: fmt(mortShare, 0),
        })}</span
      >
    </div>
    <!-- 30%-of-net affordability cap: visual bar + text + reverse afford calc. -->
    <div class="rr-note mort-cap">
      <!-- Visual cap bar: 0–100% of salary, vertical line at the
           prudentDstiPct% cap, marker showing where
           the user's actual payment lands. The marker is clamped
           to [0, 100] so an over-budget payment still has a
           visible dot at the right edge with text calling out
           the overflow above the bar.

           {#key mortCapGap} forces the marker to remount whenever
           the user crosses the cap (gap sign flips). The
           remount triggers the .pulse CSS animation for a
           brief visual ping. -->
      {#key Math.sign(mortCapGap)}
        <div class="mort-bar" aria-hidden="true">
          <div
            class="mort-bar-fill"
            style="background:{mortCapGap > 0 ? 'var(--erode)' : 'var(--real)'};
                 width:{Math.min(100, mortShare)}%"
          ></div>
          <div class="mort-bar-cap" style="left:{prudentDstiPct}%"></div>
          <div class="mort-bar-mark pulse" style="left:{Math.min(100, mortShare)}%"></div>
        </div>
      {/key}
      <div class="mort-bar-legend mono">
        <span class="l-bg">0%</span>
        <span class="l-en">0%</span>
        <!-- One Bulgarian word for one threshold, here and in every sentence
             below it: «граница». «линия» is the English "line" carried over,
             and «таван» is what the БНБ limit two paragraphs down is — three
             names for the 30% mark make it read as three different numbers. -->
        <span class="l-bg" style="margin-left:{prudentDstiPct - 5}%">граница {prudentDstiPct}%</span
        >
        <span class="l-en" style="margin-left:{prudentDstiPct - 5}%">{prudentDstiPct}% line</span>
        <span class="l-bg" style="margin-left:auto">100%</span>
        <span class="l-en" style="margin-left:auto">100%</span>
      </div>
      <span class="l-bg"
        >граница {prudentDstiPct}% от нетния доход =
        <b>{fmt0(mortCapEur)} €/мес</b>.
        {#if mortCapGap > 0}
          Вноската е с <b style="color:var(--erode)">{fmt0(mortCapGap)} €/мес над</b> границата.
        {:else}
          Вноската е с <b style="color:var(--real)">{fmt0(-mortCapGap)} €/мес под</b> границата — побира
          се в бюджета.
        {/if}
      </span>
      <span class="l-en"
        >the {prudentDstiPct}%-of-net cap = <b>{fmt0(mortCapEur)}/mo</b>.
        {#if mortCapGap > 0}
          The payment is <b style="color:var(--erode)">{fmt0(mortCapGap)}/mo over</b> the line.
        {:else}
          The payment is <b style="color:var(--real)">{fmt0(-mortCapGap)}/mo under</b> the line - within
          budget.
        {/if}
      </span>
      <!-- Reverse: "what can I afford?" — given salary, rate, term,
           what's the max home the user could finance and stay under
           the 30% cap? Shown whenever the gap > 0 (i.e. the user's
           current pick is unaffordable).

           A second question rather than the working behind the first: the row
           answers "can I carry this one", and this answers "then what could
           I". The line above states which side of the 30% mark the payment
           falls, and the БНБ comparison under it says what that line is and
           is not — both are the claim and its caveat, and both stay. -->
      <details class="rr-more">
        <summary class="disclose">
          <span class="dc-caret" aria-hidden="true">›</span>
          <span class="l-bg">{COPY.discloseAfford.bg}</span>
          <span class="l-en">{COPY.discloseAfford.en}</span>
        </summary>
        {#if mortCapGap > 0}
          <div class="mort-reverse over">
            <span class="l-bg"
              >при този доход, лихва и срок можеш да си позволиш дом до <b
                >{fmt0(maxAffordPrice)} €</b
              >
              · <b>{fmt(maxAffordM2, 0)} м²</b>{cityNameBg
                ? " " + t(COPY.affordWhere, "bg", { v: bgIn(cityNameBg), city: cityNameBg })
                : "."}</span
            >
            <span class="l-en"
              >at this income, rate, and term you can afford up to <b>{fmt0(maxAffordPrice)} €</b>
              · <b>{fmt(maxAffordM2, 0)} m²</b>{cityNameEn
                ? " " + t(COPY.affordWhere, "en", { city: cityNameEn })
                : "."}</span
            >
          </div>
        {:else if monthlyMort > 0}
          <div class="mort-reverse">
            <span class="l-bg"
              >можеш да си позволиш дом до <b>{fmt0(maxAffordPrice)} €</b> ·
              <b>{fmt(maxAffordM2, 0)} м²</b>
              — избраният ({fmt0(homePrice)} €) е под границата.</span
            >
            <span class="l-en"
              >you can afford up to <b>{fmt0(maxAffordPrice)} €</b> ·
              <b>{fmt(maxAffordM2, 0)} m²</b>
              - your pick ({fmt0(homePrice)} €) is under the ceiling.</span
            >
          </div>
        {/if}
      </details>
      <!-- Where our line sits versus the regulator's and versus
           what BG borrowers actually carry. A bank may approve up
           to DSTI 50% — that is not the same as affordable, and
           showing both keeps "this is a stretch" visible instead
           of letting the looser number imply comfort. -->
      <div class="rr-note" style="margin-top:6px">
        <span class="l-bg">
          {prudentDstiPct}% е разумната граница, не законовата: БНБ допуска вноски до
          <b>{fmt0(limits.dstiMaxPct)}%</b>
          от чистия доход{#if limits.observedDstiPct}, а средният българин с ипотека е на ~{fmt(
              limits.observedDstiPct,
              0
            )}%{/if}. Банка може да ти одобри повече, отколкото е удобно да плащаш.
        </span>
        <span class="l-en">
          {prudentDstiPct}% is the sensible line, not the legal one: BNB allows payments up to
          <b>{fmt0(limits.dstiMaxPct)}%</b>
          of net income{#if limits.observedDstiPct}, and the average BG borrower sits at ~{fmt(
              limits.observedDstiPct,
              0
            )}%{/if}. A bank can approve more than is comfortable to pay.
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Mortgage cap bar: 0–100% of salary scale with a vertical line at the
     prudentDstiPct% cap and a marker dot where the user's
     actual payment lands. The fill (left segment) is colored red when
     the marker is past the cap, green when under. */
  .mort-cap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mort-bar {
    position: relative;
    height: 14px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 7px;
    overflow: hidden;
    margin-top: 4px;
  }
  .mort-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 7px 0 0 7px;
    transition:
      width 320ms cubic-bezier(0.4, 0, 0.2, 1),
      background 320ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .mort-bar-cap {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    margin-left: -1px;
    background: var(--ink);
    opacity: 0.7;
  }
  .mort-bar-cap::after {
    content: "";
    position: absolute;
    top: -3px;
    left: -3px;
    width: 8px;
    height: 8px;
    background: var(--ink);
    border-radius: 50%;
    opacity: 0.7;
  }
  /* The marker dot. We don't transition `left` (it would lag behind
     input — the eye wants the marker to snap to the new position and
     the FILL bar to slide to meet it). The fill slides via its width
     transition. The marker dot pulses briefly when the gap sign
     flips (user just crossed the cap), via the .pulse class added
     by the {#key} block on mortCapGap sign changes. */
  .mort-bar-mark {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 3px;
    margin-left: -1.5px;
    background: var(--ink);
    border-radius: 2px;
    box-shadow: 0 0 0 2px var(--paper);
    transition: background 320ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  /* Pulse animation: triggered by {#key} remount when the gap sign
     flips. Two pulses, then settles. ~600ms total — short enough not
     to be annoying when sliders move quickly. */
  @keyframes mort-mark-pulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 2px var(--paper);
    }
    20% {
      transform: scale(1.6);
      box-shadow:
        0 0 0 4px var(--paper),
        0 0 0 6px var(--erode);
    }
    50% {
      transform: scale(1.2);
      box-shadow:
        0 0 0 3px var(--paper),
        0 0 0 4px var(--real);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 2px var(--paper);
    }
  }
  .mort-bar-mark.pulse {
    animation: mort-mark-pulse 600ms ease-out;
  }
  /* Reverse-calc block: fade-in when text changes (salary/m²/term edit) */
  .mort-reverse {
    margin-top: 4px;
    padding: 6px 8px;
    background: var(--paper-2);
    border-left: 3px solid var(--real);
    border-radius: 4px;
    font-size: var(--fs-small);
    color: var(--ink-2);
    line-height: 1.45;
    animation: mort-reverse-fade 280ms ease-out;
  }
  @keyframes mort-reverse-fade {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* When over the cap, color the left border red to match the bar. */
  .mort-reverse.over {
    border-left-color: var(--erode);
  }
  .mort-bar-legend {
    display: flex;
    font-size: var(--fs-micro);
    color: var(--muted);
    line-height: 1;
    margin-bottom: 2px;
  }
</style>
