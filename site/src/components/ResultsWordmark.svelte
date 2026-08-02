<!--
  The foot of the results card: the wordmark. Anchored to the bottom of the
  card so it sits clear of the rows above regardless of how tall the inputs
  card is on the left.
-->
<script>
  import { COPY } from "$lib/content.js";
</script>

<div class="r-brand mono">
  <span class="wm2">
    <svg width="13" height="13" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="2" y="6" width="4" height="14" rx="1" fill="var(--muted)" />
      <rect x="16" y="2" width="4" height="18" rx="1" fill="var(--real)" />
    </svg>
    vyarno.bg
  </span>
  <span>
    <span class="l-bg">{COPY.footerNote.bg}</span>
    <span class="l-en">{COPY.footerNote.en}</span>
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
