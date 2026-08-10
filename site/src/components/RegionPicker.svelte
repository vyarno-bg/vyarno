<script>
  /**
   * Which област the reader lives in — the one control that moves the wage
   * comparator and the €/m² and moves nothing else.
   *
   * **A native `<select>`, and inline rather than a modal.** Three reasons, and
   * the first two are not preferences. `docs/seo.md` prerenders every indexable
   * entry, and what the READER decides may not be baked into served HTML — so a
   * blocking overlay would either ship shut to a crawler or pop in after
   * hydration, over a page it was meant to gate. And a native select degrades
   * to a working form control with no JavaScript, where a custom listbox
   * degrades to nothing. The third is the phone: 28 options one-handed at 360px
   * is what the platform's own picker is for, and no listbox written here would
   * beat it.
   *
   * It sits in the inputs column, above the two cards it governs, because a
   * control belongs next to the thing it changes.
   *
   * **There is no default option, and the empty one is not a placeholder.**
   * `docs/principles.md` P7: a preselected София hands a Бургас reader Sofia's
   * numbers wearing the appearance of a choice they made, which is exactly what
   * the blank raise field exists to avoid. So the empty value is a real state
   * the page renders — the two city-scoped cards say what they are waiting for
   * — and it is what a reader who has chosen nothing keeps.
   */
  import { lang, region } from "../lib/stores.js";
  import { COPY, t } from "../lib/content.js";
  import { CITY_PRICED } from "../lib/view.js";

  /**
   * @type {{
   *   options: Array<{code: string, name: string, coverage: string}>,
   * }}
   */
  const { options = [] } = $props();

  // The options with no €/m² are marked in the list rather than left out of
  // it: НСИ publish a wage for every област and a reader who lives in one
  // should get it, with the missing half named. P11 — a figure nobody
  // publishes is uncomputed, not concealed.
  //
  // **Two ways to have no price, and the suffix does not tell them apart.**
  // Which of them it is decides what the housing card may SAY — only «имот.bg
  // publish none» may be said in имот.bg's name — but on a 28-item list at
  // 360px both are the same fact to a reader choosing: there is no €/m² behind
  // this one. The distinction is drawn where the sentence is.
  const priced = $derived(options.filter((o) => o.coverage === CITY_PRICED).length);
</script>

<div class="region">
  <label class="lbl" for="region-select">
    <span class="l-bg">{COPY.regionLabel.bg}</span>
    <span class="l-en">{COPY.regionLabel.en}</span>
  </label>
  <select id="region-select" bind:value={$region} disabled={options.length === 0}>
    <option value="">{$lang === "bg" ? COPY.regionNone.bg : COPY.regionNone.en}</option>
    {#each options as o (o.code)}
      <option value={o.code}
        >{o.name}{o.coverage === CITY_PRICED
          ? ""
          : ` ${t(COPY.regionNoPriceSuffix, $lang)}`}</option
      >
    {/each}
  </select>
  <p class="hint">
    <span class="l-bg">{t(COPY.regionHint, "bg", { n: options.length, p: priced })}</span>
    <span class="l-en">{t(COPY.regionHint, "en", { n: options.length, p: priced })}</span>
  </p>
</div>

<style>
  /* No `select` rule here on purpose. The global stylesheet already styles
     every control on the page, and a local border re-declared with `--line`
     fails WCAG 1.4.11 at 1.24:1 — `verify_render_contrast.mjs` catches it. A
     second definition of a control's edge is a second thing to keep above 3:1,
     and this one had no reason to exist. */
  .region {
    display: block;
    margin-bottom: 0.9rem;
  }
  .lbl {
    display: block;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .hint {
    margin: 0.35rem 0 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
</style>
