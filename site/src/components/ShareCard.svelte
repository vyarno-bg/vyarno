<!--
  The foot of the results card: the share button, the reminder that the
  sentence it copies carries no euro figure, and the wordmark.

  The sentence itself is built in $lib/view.js#shareSentence, where the rule
  that it names percentages only — never an amount — is tested. This component
  owns the control and the copy-to-clipboard, and takes the two percentages
  rather than the finished sentence: composing it here keeps the "no euro
  figure ever leaves the page" rule and the button that would break it in one
  file.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { number } from "$lib/format.js";
  import { COPY, t } from "$lib/content.js";
  import { shareSentence } from "$lib/view.js";

  const {
    /** The reader's own basket rate, in percent. */
    piPct = 0,
    /** The same basket weighted officially, in percent. */
    officialPct = 0,
    /** "y1" or a year — decides which sentence `shareSentence` builds. */
    anchor = "y1",
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);

  // Percentages only, never a € amount: `extraPerMonth = salary × π/(100+π)`
  // inverts exactly, so a € figure beside the percentage would publish the
  // user's salary to everyone who reads the message (docs/principles.md P2). The sentence
  // is built in view.js#shareSentence, where that rule is tested.
  const sharePayload = $derived(shareSentence({ lang: $lang, piPct, officialPct, anchor, fmt }));

  // Writable $derived: it tracks the language on its own, and `shareNow`
  // overrides it with the "copied" confirmation until the timeout restores it.
  let shareLabel = $derived(t(COPY.share, $lang));

  async function shareNow() {
    try {
      if (navigator.share) {
        await navigator.share({ text: sharePayload });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(sharePayload);
        shareLabel = t(COPY.shareCopied, $lang);
        setTimeout(() => {
          shareLabel = t(COPY.share, $lang);
        }, 1800);
      }
    } catch {
      /* user cancelled */
    }
  }
</script>

<!-- SHARE -->
<div class="r-share">
  <button class="sharebtn" onclick={shareNow}>
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <path
        d="M12 5.5a2 2 0 100-4 2 2 0 000 4zM4 10a2 2 0 100-4 2 2 0 000 4zM12 14.5a2 2 0 100-4 2 2 0 000 4zM5.8 7.2l4.4-2.4M5.8 8.8l4.4 2.4"
      />
    </svg>
    {shareLabel}
  </button>
  <span class="fine">
    <span class="l-bg">{COPY.shareFine.bg}</span>
    <span class="l-en">{COPY.shareFine.en}</span>
  </span>
</div>

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
  /* Share */
  .r-share {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 16px;
    flex-wrap: wrap;
  }
  .sharebtn {
    font-weight: 600;
    font-size: var(--fs-body);
    color: var(--paper);
    background: var(--ink);
    border: 0;
    border-radius: var(--radius);
    padding: 10px 15px;
    cursor: pointer;
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .sharebtn:hover {
    filter: brightness(1.15);
  }
  .r-share .fine {
    font-size: var(--fs-fine);
    color: var(--muted);
    max-width: 34ch;
  }
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
