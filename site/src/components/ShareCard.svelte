<script>
  /**
   * The share block at the foot of the results card.
   *
   * ## It shows the picture rather than hiding it behind a button
   *
   * Every other share widget on the web asks you to trust it with something
   * you cannot see. This one is attached to a calculator whose entire claim is
   * that a reader's own figures stay in their tab, and the strongest way to
   * make that claim is to render the whole of what leaves — the image and the
   * message, both, before anything is sent. `COPY.shareNote` says so in one
   * line and the block is what makes the line checkable.
   *
   * That is also why nothing here reports back. There is no share count, no
   * click event and no campaign parameter on the outgoing link: «any
   * measurement that can see what a consumer typed» is on the closed list
   * without qualification (docs/principles.md), and a share event fired at the
   * moment a basket is shared is exactly that. **We will not find out whether
   * this worked, and that is the trade.**
   *
   * ## Three surfaces, and the one that was rejected
   *
   * The share sheet (`navigator.share`) where the browser has one, the
   * clipboard, and a downloaded PNG. All three are produced here and none
   * involves a request: the sheet hands the OS a file at the reader's own
   * direction, which is the reader exporting rather than us transmitting.
   *
   * An OG-image URL carrying the figures in its query string was rejected
   * rather than deferred. Rendering one needs a server that sees the numbers
   * on fetch, and the link itself carries them past every unfurler, referrer
   * header and CDN log between the sender and whoever opens it — which turns a
   * picture drawn in one tab into a figure readable by every intermediary
   * (P1).
   */
  import { lang, theme } from "../lib/stores.js";
  import { COPY, t } from "../lib/content.js";
  import { number } from "../lib/format.js";
  import { shareSentence } from "../lib/view.js";
  import { SHARE_CARD, drawShareCard, readPalette } from "../lib/share-card.js";

  /** @type {{ share: object|null }} */
  const { share } = $props();

  /** @type {HTMLCanvasElement|undefined} */
  let canvas = $state();
  let copied = $state(false);
  // Asked of the browser rather than assumed: `navigator.share` is absent on
  // most desktops and present on nearly every phone, and the button that opens
  // the sheet is the whole interaction on the device where sharing actually
  // happens. A button that throws when pressed is worse than one never drawn.
  const canSendFiles = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const message = $derived(shareSentence({ share, copy: COPY, lang: $lang }));

  /**
   * The card, redrawn when the numbers, the language or the theme move.
   *
   * `$lang` is read here and not left to the `.l-bg`/`.l-en` CSS the rest of
   * the app switches with: a picture carries one language, so the card is
   * drawn in the one the reader is looking at.
   *
   * Debounced, because a slider drag delivers a value per frame and each one
   * would repaint 1200×630. The trailing edge is the one that matters — the
   * reader looks at the card after they stop dragging, not during.
   */
  $effect(() => {
    // The theme is in here because the palette is read off the DOM, which the
    // reactive graph has no way of seeing change on its own — drop it and a
    // reader who switches to dark keeps the light card until a slider moves.
    const drawn = { share, lang: $lang, theme: $theme };
    if (!canvas || !drawn.share) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      // A canvas paints with the faces loaded at the instant it draws, so a
      // card generated before the woff2 files arrive is silently set in the
      // system stack instead of the page's own.
      await document.fonts?.ready;
      if (cancelled || !canvas) return;
      drawShareCard(canvas, {
        share: drawn.share,
        copy: COPY,
        lang: drawn.lang,
        palette: readPalette(canvas),
      });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  /** The drawn card as a PNG, or null where the canvas has not painted yet. */
  function toPng() {
    return new Promise((resolve) => {
      if (!canvas) return resolve(null);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Denied permission, an insecure origin, or a browser without the API.
      // The message is rendered in full below and is selectable, so there is
      // always a way to send it by hand; a thrown error here must not take the
      // block down.
    }
  }

  async function download() {
    const blob = await toPng();
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "vyarno.png";
    link.click();
    URL.revokeObjectURL(href);
  }

  async function send() {
    const blob = await toPng();
    const files = blob ? [new File([blob], "vyarno.png", { type: "image/png" })] : [];
    // The file and the text in one call where the platform takes both, text
    // alone where it does not: a sheet that rejects the payload outright
    // leaves the reader with nothing, and the sentence carries the link.
    const withFile = { text: message, files };
    const payload = files.length && navigator.canShare?.(withFile) ? withFile : { text: message };
    try {
      await navigator.share(payload);
    } catch {
      // AbortError is what a reader dismissing the sheet looks like, and it is
      // not a failure worth reporting to them.
    }
  }
</script>

<section class="share" aria-labelledby="shareHead">
  <h4 id="shareHead">
    <span class="l-bg">{COPY.shareHead.bg}</span>
    <span class="l-en">{COPY.shareHead.en}</span>
  </h4>

  {#if share}
    <!-- The label sits on a wrapper rather than on the canvas: a `<canvas>` is
         an interactive element as far as ARIA is concerned, so `role="img"` on
         it is a contradiction a screen reader is entitled to resolve either
         way. The canvas itself is hidden, because the picture's whole content
         is repeated as selectable text immediately below. -->
    <div
      class="sh-card"
      role="img"
      aria-label={t(COPY.shareCardAlt, $lang, {
        p: number(share.piPct, 1, $lang),
        o: number(share.officialPct, 1, $lang),
      })}
    >
      <canvas
        bind:this={canvas}
        width={SHARE_CARD.width}
        height={SHARE_CARD.height}
        aria-hidden="true"
      ></canvas>
    </div>

    <p class="sh-msg">{message}</p>

    <div class="sh-acts">
      {#if canSendFiles}
        <button type="button" class="sh-go" onclick={send}>
          <span class="l-bg">{COPY.shareSend.bg}</span>
          <span class="l-en">{COPY.shareSend.en}</span>
        </button>
      {/if}
      <button type="button" onclick={copyText}>
        {#if copied}
          <span class="l-bg">{COPY.shareCopied.bg}</span>
          <span class="l-en">{COPY.shareCopied.en}</span>
        {:else}
          <span class="l-bg">{COPY.shareCopy.bg}</span>
          <span class="l-en">{COPY.shareCopy.en}</span>
        {/if}
      </button>
      <button type="button" onclick={download}>
        <span class="l-bg">{COPY.shareDownload.bg}</span>
        <span class="l-en">{COPY.shareDownload.en}</span>
      </button>
    </div>

    <p class="sh-note">
      <span class="l-bg">{COPY.shareNote.bg}</span>
      <span class="l-en">{COPY.shareNote.en}</span>
    </p>
  {:else}
    <p class="sh-note">
      <span class="l-bg">{COPY.shareWait.bg}</span>
      <span class="l-en">{COPY.shareWait.en}</span>
    </p>
  {/if}
</section>

<style>
  .share {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--line-2);
  }
  /* No type treatment of its own: `.m-card h4` in card.css is the results
     card's section heading, and a serif line here would announce the share
     block as more important than the rows above it — which are the number the
     reader came for. */
  .share h4 {
    margin-bottom: 10px;
  }
  /* The export is 1200×630 and the element is whatever the column allows; the
     browser downsamples, which is the direction that stays sharp. Height is
     left to the aspect ratio rather than set, so the preview cannot disagree
     with the file by a pixel. */
  .sh-card {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .sh-card canvas {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1200 / 630;
  }
  /* Rendered, not hidden behind the copy button: where the clipboard API is
     unavailable — an insecure origin, a denied permission — this is the
     message, and it can be selected by hand. */
  .sh-msg {
    margin: 12px 0 0;
    padding: 9px 11px;
    background: var(--paper-2);
    border-left: 2px solid var(--line);
    border-radius: 0 var(--radius) var(--radius) 0;
    font-size: var(--fs-body);
    line-height: 1.5;
    color: var(--ink-2);
  }
  .sh-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .sh-acts button {
    font-family: inherit;
    font-size: var(--fs-small);
    padding: 7px 13px;
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .sh-acts button:hover {
    color: var(--ink);
    border-color: var(--muted);
  }
  /* The one filled control in the block, and only where the share sheet
     exists — on a phone it is the whole interaction. It stays quieter than the
     headline figure it sits under, for the same reason the donate line in the
     footer is one sentence: the number is what the reader came for. */
  .sh-acts .sh-go {
    color: var(--surface);
    background: var(--real-ink);
    border-color: var(--real-ink);
  }
  .sh-acts .sh-go:hover {
    color: var(--surface);
    background: var(--real);
    border-color: var(--real);
  }
  .sh-note {
    margin: 10px 0 0;
    font-size: var(--fs-small);
    line-height: 1.45;
    color: var(--muted);
  }
</style>
