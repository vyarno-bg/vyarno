<script>
  /**
   * Did the raise beat the prices? Seven states, seven sentences, chosen once
   * in `pocketVerdict` — see docs/site.md §"The pocket row says which state it
   * is in".
   */
  import { lang } from "../lib/stores.js";
  import { integer, percentSigned } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";
  import { pocketVerdictState } from "../lib/view/results.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt0 = (x) => integer(x, $lang);
  const signedPct = (x, d = 1) => percentSigned(x, d, $lang);

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

  // Which sentence the row tells. The STATE is decided in `view/results.js`,
  // where a
  // unit test can reach it and where the answer block at the top of the card
  // reads the same one — two ladders of thresholds a screen apart drift, and
  // they drift silently, the summary calling a raise ahead while the row calls
  // it level over a number that has not moved. Choosing the WORDS stays here,
  // because the calculator layer does not import COPY.
  //
  // All seven states get their own sentence, and the three insides of the ±1 pp
  // dead zone are three of them: one verdict calling all three «точно» is false
  // precision beside a signed figure the reader can read.
  // The table holds the COPY entries themselves rather than their names. A
  // table of key strings looks equivalent and is not: `verify_copy.mjs` finds
  // a rendered sentence by looking for `COPY.<key>` in the source, so a
  // sentence reached only through a string literal reads to it as one nothing
  // renders — and the check that every one of the seven states still has a
  // sentence goes green over a row that has lost them all.
  const VERDICT = {
    ahead: COPY.pocketOk,
    behind: COPY.pocketBad,
    level: COPY.pocketZero,
    nearUp: COPY.pocketNearUp,
    nearDn: COPY.pocketNearDn,
    none: COPY.pocketNone,
    cut: COPY.pocketCut,
    // No raise entered. The row prompts for one instead of rendering a
    // verdict, so there is no eighth sentence — only the absence of one.
    unsaid: null,
  };
  const pocketVerdict = $derived(VERDICT[pocketVerdictState(calc.raise, calc.pocket)]);

  // The ask speaks only when all three hold: the reader replaced the €900
  // placeholder, they said what they were given, and the shortfall rounds to at
  // least a euro on the contract. The first is P7 — «€2 738 бруто вместо
  // €2 706» is a claim about somebody's own contract, and about our
  // placeholder's until they type. The third is `hasLeftover`'s rule: a row
  // announcing a €0 ask is noise on every pay packet that happens to keep up.
  const standStillAsk = $derived(
    calc.earnersDirty && calc.raiseDirty && (calc.standStill?.grossGap ?? 0) >= 1
  );
  const standStillArgs = $derived({
    n: fmt0(calc.standStill?.netGap ?? 0),
    g: fmt0(calc.standStill?.grossNeeded ?? 0),
    now: fmt0(calc.standStill?.grossNow ?? 0),
    d: fmt0(calc.standStill?.grossGap ?? 0),
  });
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
            : 'var(--ink)'}">{signedPct(calc.pocket)}</span
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
          >Въведи колко ти вдигнаха заплатата. Без число тук не знаем дали изпреварваш цените си.</span
        >
        <span class="l-en"
          >Enter your pay raise. Without it we can't tell if you're outrunning your prices.</span
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
       checkable rather than merely stated, so it stays where the figure is
       rather than going behind the disclosure below. -->
  {#if calc.hasHousehold && Number.isFinite(calc.raise)}
    <div class="rr-note">
      <span class="l-bg">{parts("bg")}</span>
      <span class="l-en">{parts("en")}</span>
    </div>
  {/if}
  {#if standStillAsk}
    <!-- What it would have taken, and it is a second finding rather than the
         working behind the first: the row above says the reader is €56 short,
         this says what closing that costs on the contract. Folded, because
         "what would it have taken" is a question a reader asks after the
         verdict rather than instead of it.

         It appears only where there is an ask to state — the reader replaced
         the placeholder, gave a raise, and is behind by at least a euro. Ahead
         or level, «за да не изоставаш» is answered by the row above, and a
         chip promising an answer that turns out to be «нищо» is a tap spent on
         nothing. -->
    <details class="rr-more">
      <summary class="disclose">
        <span class="dc-caret" aria-hidden="true">›</span>
        <span class="l-bg">{COPY.standStillK.bg}</span>
        <span class="l-en">{COPY.standStillK.en}</span>
      </summary>
      <div class="rr-more-body">
        <div class="rr-t">
          <!-- The ternary sits INSIDE `t(...)`: `verify_template_safety.mjs`
               needs a rooted `COPY.<key>.<lang>` leaf per rendered sentence,
               and a key held in a variable reads to it as markup from nowhere.
               BasketEditor spells its housing variants the same way. -->
          <span class="l-bg"
            >{@html t(
              calc.hasHousehold ? COPY.standStillTxtHousehold : COPY.standStillTxt,
              "bg",
              standStillArgs
            )}</span
          >
          <span class="l-en"
            >{@html t(
              calc.hasHousehold ? COPY.standStillTxtHousehold : COPY.standStillTxt,
              "en",
              standStillArgs
            )}</span
          >
        </div>
      </div>
    </details>
  {/if}
</div>
