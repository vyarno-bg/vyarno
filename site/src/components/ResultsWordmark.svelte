<!--
  The foot of the results card: the wordmark. Anchored to the bottom of the
  card so it sits clear of the rows above regardless of how tall the inputs
  card is on the left.
-->
<script>
  import { COPY, t } from "$lib/content.js";

  /**
   * The year in the attribution line, from the reader's own clock, for the
   * reason `SiteFooter.svelte` carries at length: baked at build time it keeps
   * saying the build's year on a site that republishes when the DATA moves.
   *
   * The two components render the same key and each has to substitute it. This
   * one read `COPY.footerNote.bg` straight, so the slot survived to the screen
   * and the results card printed «Вярно {year}» under the five publisher names
   * — on the one line that is a licence condition rather than decoration.
   */
  const YEAR = new Date().getFullYear();
</script>

<div class="r-brand mono">
  <span class="wm2">
    <!-- The mark whole, at 13px: bars and the rule that joins their feet,
         `SiteHeader.svelte`'s geometry. It carries the rule at this size
         because the rule is one unbroken stroke, and a stroke shrinks where
         a row of dashes turns to grit. -->
    <svg width="13" height="13" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="2" y="6" width="4" height="14" rx="1" fill="var(--muted)" />
      <rect x="16" y="2" width="4" height="18" rx="1" fill="var(--real)" />
      <path d="M6 19.25 L16 19.25" stroke="var(--real)" stroke-width="1.5" fill="none" />
    </svg>
    vyarno.bg
  </span>
  <span>
    <span class="l-bg">{t(COPY.footerNote, "bg", { year: YEAR })}</span>
    <span class="l-en">{t(COPY.footerNote, "en", { year: YEAR })}</span>
  </span>
</div>

<style>
  /* The results card is a flex column (App.svelte), and this is its last
     child: `auto` pushes the wordmark to the bottom so it anchors there
     instead of floating mid-card when the inputs card is taller. */
  .r-brand {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--line-2);
    font-size: var(--fs-fine);
    color: var(--muted);
  }
  .r-brand .wm2 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-weight: 500;
  }
</style>
