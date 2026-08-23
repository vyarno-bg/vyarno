<script>
  /**
   * The plain answer, between the headline figure and the receipt.
   *
   * Readers arrive asking three things — is my pay keeping up, where does that
   * put me, and what is getting dearer or cheaper — and the card answers all
   * three, each under its own derivation, two to three screens down a phone.
   * This says them once, in the order they were asked, before the ranked table
   * starts.
   *
   * It computes nothing. `view/results.js#answerLine` decides which of the three can
   * honestly be stated and in what state; this file picks the words for those
   * states, which is the one thing a component is allowed to decide.
   *
   * **Outside the headline's `aria-live` region, deliberately.** That region is
   * scoped to the big figure and its label so a slider drag re-announces the
   * number the reader is changing and not the fifty around it. Four sentences
   * added to it would be four sentences re-read on every tick of a slider that
   * moves none of them.
   */
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { number, integer } from "$lib/format.js";
  import { answerLine } from "$lib/view/results.js";

  /** @type {{ calc: import("../lib/calculator.svelte.js").Calculator }} */
  const { calc } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  const answer = $derived(
    answerLine({
      raise: calc.raise,
      pocket: calc.pocket,
      salaryAnswered: calc.earnersDirty,
      ranks: calc.ranks,
      ranked: calc.ranked,
    })
  );

  // The seven pocket states collapse to five sentences here. «Точно на нула»,
  // «почти на нула нагоре» and «почти на нула надолу» are three verdicts in
  // the row below because there they sit beside the signed figure and one word
  // covering all three would be false for two of them. Up here there is no
  // figure beside the sentence to contradict, and three near-identical lines
  // in a four-line summary is the density this block exists to undo.
  // The entries themselves rather than their names: `verify_copy.mjs` finds a
  // rendered sentence by looking for `COPY.<key>` in the source, so a table of
  // key strings would leave five of these reading as copy nothing renders.
  const PAY_COPY = {
    ahead: COPY.answerPayAhead,
    behind: COPY.answerPayBehind,
    level: COPY.answerPayLevel,
    nearUp: COPY.answerPayLevel,
    nearDn: COPY.answerPayLevel,
    none: COPY.answerPayNone,
    cut: COPY.answerPayCut,
    unsaid: COPY.answerPayAsk,
  };
  const payCopy = $derived(PAY_COPY[answer.pay.state]);

  // Lower-cased, the way the headline block's «най-тежко те удря» line already
  // treats the same names. The published labels are capitalised because they
  // head a column; dropped into the middle of a sentence they read as a proper
  // noun, and the two lines naming the same division a screen apart would
  // capitalise it differently.
  const divisionName = (division) =>
    ($lang === "bg" ? division.bg_name : division.en_name).toLowerCase();
</script>

<div class="ans">
  <ul>
    <li>
      <!-- The two states that carry a figure are written out rather than
           reached through `PAY_COPY`. `{@html}` is safe on this page only
           because every template it renders is rooted in an in-repo constant,
           and `verify_template_safety.mjs` proves that by reading the literal
           shape at the call site — a lookup through a variable is a shape it
           cannot follow, so it fails rather than waving one through. The
           formatter is called there too, for the same reason: a value that
           reaches the template through a `$derived` name is a value the check
           cannot trace to a formatter.

           The magnitude, never the signed figure: the sentence already says
           which way round it is, and «изпреварва с −2,3%» reads as the
           opposite of itself. -->
      {#if answer.pay.state === "ahead"}
        <span class="l-bg"
          >{@html t(COPY.answerPayAhead, "bg", { p: fmt(Math.abs(answer.pay.pocketPct)) })}</span
        >
        <span class="l-en"
          >{@html t(COPY.answerPayAhead, "en", { p: fmt(Math.abs(answer.pay.pocketPct)) })}</span
        >
      {:else if answer.pay.state === "behind"}
        <span class="l-bg"
          >{@html t(COPY.answerPayBehind, "bg", { p: fmt(Math.abs(answer.pay.pocketPct)) })}</span
        >
        <span class="l-en"
          >{@html t(COPY.answerPayBehind, "en", { p: fmt(Math.abs(answer.pay.pocketPct)) })}</span
        >
      {:else}
        <span class="l-bg">{payCopy.bg}</span>
        <span class="l-en">{payCopy.en}</span>
      {/if}
    </li>
    <li>
      {#if answer.stand.state === "one"}
        <span class="l-bg">{@html t(COPY.answerStandOne, "bg", { r: fmt0(answer.stand.low) })}</span
        >
        <span class="l-en">{@html t(COPY.answerStandOne, "en", { r: fmt0(answer.stand.low) })}</span
        >
      {:else if answer.stand.state === "many"}
        <span class="l-bg"
          >{@html t(COPY.answerStandMany, "bg", {
            low: fmt0(answer.stand.low),
            high: fmt0(answer.stand.high),
          })}</span
        >
        <span class="l-en"
          >{@html t(COPY.answerStandMany, "en", {
            low: fmt0(answer.stand.low),
            high: fmt0(answer.stand.high),
          })}</span
        >
      {:else}
        <span class="l-bg">{COPY.answerStandAsk.bg}</span>
        <span class="l-en">{COPY.answerStandAsk.en}</span>
      {/if}
    </li>
    {#if answer.mover.up}
      <li>
        <span class="l-bg"
          >{t(COPY.answerMoverUp, "bg", {
            name: divisionName(answer.mover.up.division),
            r: fmt(answer.mover.up.ratePct),
          })}</span
        >
        <span class="l-en"
          >{t(COPY.answerMoverUp, "en", {
            name: divisionName(answer.mover.up.division),
            r: fmt(answer.mover.up.ratePct),
          })}</span
        >
        {#if answer.mover.down}
          <span class="l-bg"
            >{t(COPY.answerMoverDown, "bg", {
              name: divisionName(answer.mover.down.division),
              r: fmt(answer.mover.down.ratePct),
            })}</span
          >
          <span class="l-en"
            >{t(COPY.answerMoverDown, "en", {
              name: divisionName(answer.mover.down.division),
              r: fmt(answer.mover.down.ratePct),
            })}</span
          >
        {/if}
      </li>
    {/if}
  </ul>
</div>

<style>
  /* One block, set apart from the headline above it by a rule rather than a
     box. A filled panel here would read as a callout — something added beside
     the answer — and this is the answer. */
  .ans {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  .ans ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  /* Each line is one answer, and the marker is what keeps three of them from
     reading as one paragraph on a phone. A bullet glyph rather than a
     list-style marker so it takes the app's own muted ink and cannot drift
     from the text baseline as the type scale moves. */
  .ans li {
    position: relative;
    padding-left: 14px;
    font-size: var(--fs-body);
    line-height: 1.45;
    color: var(--ink-2);
    max-width: 54ch;
  }
  .ans li::before {
    content: "·";
    position: absolute;
    left: 3px;
    color: var(--muted);
    font-weight: 700;
  }
  .ans :global(b) {
    color: var(--ink);
    font-weight: 600;
  }
</style>
