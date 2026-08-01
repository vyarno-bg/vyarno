<script>
  /**
   * Did the raise beat the prices? Seven states, seven sentences, chosen once
   * in `pocketVerdict` — see docs/site.md §"The pocket row says which state it
   * is in".
   */
  import { lang } from "../lib/stores.js";
  import { number, integer, percentSigned } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);
  const signedPct = (x, d = 1) => percentSigned(x, d, $lang);

  // Which sentence the row tells, decided in one place because the states
  // overlap. A pay CUT is its own case whatever prices did — «увеличението е
  // изядено» is the wrong sentence when there was no raise. And the ±1 pp dead
  // zone has three insides — dead level, a shade ahead, a shade behind —
  // because one verdict calling all three «точно» is false precision to the
  // reader who is a shade behind.
  //
  // It lives here rather than in the calculator because it picks a *sentence*,
  // and the calculator does not import COPY.
  // Which incomes still owe a raise, as one sentence. One name reads better
  // than a list of one, and the plural form takes the numbers joined — the
  // alternative, a sentence per missing income, turns a prompt into a column.
  function missingSentence(l) {
    const names = calc.missingRaises.map((m) => m.ordinal);
    return names.length === 1
      ? t(COPY.pocketMissingOne, l, { n: names[0] })
      : t(COPY.pocketMissingMany, l, { n: names.join(", ") });
  }

  // Each income's own raise, so the combined figure above can be checked.
  function parts(l) {
    return calc.earners
      .map((e, i) =>
        t(COPY.pocketRaiseParts, l, {
          n: i + 1,
          r: Number.isFinite(e.raise) ? signedPct(e.raise) : "—",
        })
      )
      .join(" · ");
  }

  const pocketVerdict = $derived(
    !Number.isFinite(calc.pocket)
      ? null
      : calc.raise === 0
        ? COPY.pocketNone
        : calc.raise < 0
          ? COPY.pocketCut
          : calc.pocket >= 1
            ? COPY.pocketOk
            : calc.pocket <= -1
              ? COPY.pocketBad
              : calc.pocket === 0
                ? COPY.pocketZero
                : calc.pocket > 0
                  ? COPY.pocketNearUp
                  : COPY.pocketNearDn
  );
</script>

<!-- POCKET -->
<div class="r-row">
  <div class="rr-top">
    <span class="rr-k"
      ><span class="l-bg">{COPY.pocket.bg}</span><span class="l-en">{COPY.pocket.en}</span></span
    >
    <span
      class="rr-v mono"
      style="color: {!calc.raiseDirty || !Number.isFinite(calc.raise)
        ? 'var(--ink-2)'
        : calc.pocket >= 1
          ? 'var(--real-ink)'
          : calc.pocket <= -1
            ? 'var(--erode)'
            : 'var(--ink)'}"
      >{!Number.isFinite(calc.pocket)
        ? "—"
        : (calc.pocket >= 0 ? "+" : "−") + fmt(Math.abs(calc.pocket)) + "%"}</span
    >
  </div>
  <div class="rr-t">
    {#if !Number.isFinite(calc.raise)}
      <!-- With several incomes the row names WHICH one is still missing. A
           percentage computed over the earners who happen to have answered,
           printed beside a prompt asking the rest to answer, is a figure about
           part of a household presented as the household's — so the row waits
           and says who it is waiting for. -->
      {#if calc.hasHousehold && calc.missingRaises.length}
        <span class="l-bg">{missingSentence("bg")}</span>
        <span class="l-en">{missingSentence("en")}</span>
      {:else}
        <span class="l-bg"
          >Въведи колко ти вдигнаха заплатата - без число тук не знаем дали изпреварваш цените си.</span
        >
        <span class="l-en"
          >Enter your pay raise - without it we can't tell if you're outrunning your prices.</span
        >
      {/if}
    {:else}
      <span class="l-bg"
        >На фиш{calc.hasHousehold ? ` (${COPY.pocketCombined.bg})` : ""}:
        <span class="b">{signedPct(calc.raise)}</span> · твоите цени:
        <span class="b">{signedPct(calc.pi)}</span>.<br
        />{pocketVerdict.bg}{#if calc.pocketEur !== 0}&nbsp;{@html t(
            calc.pocketEur > 0 ? COPY.pocketMoneyUp : COPY.pocketMoneyDn,
            "bg",
            { m: fmt0(Math.abs(calc.pocketEur)) }
          )}{/if}</span
      >
      <span class="l-en"
        >On paper{calc.hasHousehold ? ` (${COPY.pocketCombined.en})` : ""}:
        <span class="b">{signedPct(calc.raise)}</span> · your prices:
        <span class="b">{signedPct(calc.pi)}</span>.<br
        />{pocketVerdict.en}{#if calc.pocketEur !== 0}&nbsp;{@html t(
            calc.pocketEur > 0 ? COPY.pocketMoneyUp : COPY.pocketMoneyDn,
            "en",
            { m: fmt0(Math.abs(calc.pocketEur)) }
          )}{/if}</span
      >
    {/if}
  </div>
  <!-- The combined figure is not one of the numbers the reader typed — it is
       weighted by what each earner was paid BEFORE, so it does not equal the
       average of the fields either. Showing the parts is what makes it
       checkable rather than merely stated. -->
  {#if calc.hasHousehold && Number.isFinite(calc.raise)}
    <div class="rr-note">
      <span class="l-bg">{parts("bg")}</span>
      <span class="l-en">{parts("en")}</span>
    </div>
  {/if}
  {#if calc.raiseDirty && Number.isFinite(calc.standStillRaise) && Number.isFinite(calc.fivePctRaise)}
    <!-- π ≤ 0 gets its own sentence. The stand-still target IS π,
         so a falling basket would otherwise print «трябва да е
         +−1,2% - точно колкото поскъпнаха твоите цени»: a doubled
         sign under a claim of a rise that did not happen. -->
    <div class="rr-t">
      <span class="l-bg"
        ><b>{COPY.standStillK.bg}:</b>
        {@html calc.pi > 0
          ? t(COPY.standStillTxt, "bg", {
              r: fmt(calc.standStillRaise),
              pct: 5,
              rr: fmt(calc.fivePctRaise),
            })
          : t(COPY.standStillFlat, "bg", { pct: 5, rr: signedPct(calc.fivePctRaise) })}</span
      >
      <span class="l-en"
        ><b>{COPY.standStillK.en}:</b>
        {@html calc.pi > 0
          ? t(COPY.standStillTxt, "en", {
              r: fmt(calc.standStillRaise),
              pct: 5,
              rr: fmt(calc.fivePctRaise),
            })
          : t(COPY.standStillFlat, "en", { pct: 5, rr: signedPct(calc.fivePctRaise) })}</span
      >
    </div>
  {/if}
</div>
