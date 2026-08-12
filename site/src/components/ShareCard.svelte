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
   * ## Four surfaces, and the one that was rejected
   *
   * The share sheet (`navigator.share`) where the browser has one, a row of
   * chat links where it does not, the clipboard, and a downloaded PNG. All
   * four are produced here and none involves a request: the sheet hands the OS
   * a file at the reader's own direction, and a chat link is an address the
   * reader's own browser hands to an app they already have — the reader
   * exporting rather than us transmitting.
   *
   * ## The chat links carry the sentence, and only the sentence
   *
   * `navigator.share` is absent on most desktops, and a desktop reader was
   * left with copy and download and no way to send anything — while
   * `index.html`'s own note says links spread from here to Viber, Messenger
   * or X. Viber is the default channel in this country and had no button
   * anywhere.
   *
   * A `viber://`, `t.me` or `wa.me` address carries TEXT. It cannot attach a
   * file, so **the picture does not travel with it** — which is why the row
   * sits under its own line saying so (`COPY.shareChatNote`) instead of beside
   * the sheet button. The block's claim is that it renders the whole of what
   * leaves; a link that quietly dropped half of it while looking like the
   * button next to it would break exactly that claim.
   *
   * The sentence stands up alone on the way out, which is what makes the trade
   * acceptable: `shareSentence` ends in the full `https://vyarno.bg`, so a
   * recipient has the site itself to check the figures against. P9 asks a
   * format to fall back to the source name, the date and the domain only where
   * it physically CANNOT carry a link — the image does that; a chat message
   * carries the link (`content.js`, `shareCta`).
   *
   * **Facebook Messenger is left out on purpose.** Its web share dialog
   * (`facebook.com/dialog/send`) requires a registered `app_id`, and the
   * `fb-messenger://` scheme reaches only a device with the app installed —
   * which is the case `navigator.share` already covers. Registering an app id
   * to make the desktop half work would put a Meta property between a reader
   * and their own sentence for no gain. It is not an oversight and re-adding
   * it needs a better answer than "it is missing".
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
  import { SHARE_ORIGIN, shareSentence } from "../lib/view/share.js";
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
   * The chat apps a reader can hand the sentence to without a share sheet.
   *
   * Each entry builds ONE address out of the message and nothing else. There is
   * no `utm_`, no `ref=`, no click handler and nothing appended to the site's
   * own address — «a share count, a click event or a campaign parameter on an
   * outgoing share» is on the closed list without qualification
   * (docs/principles.md), so the URL every reader sends is byte-for-byte the
   * URL every other reader sends and there is nothing on the other end to tell
   * them apart. `verify_render_share.mjs` reads the rendered hrefs and holds
   * every parameter of every one of them to that, so a fourth destination
   * added later is covered by the rule rather than by a fourth test.
   *
   * Telegram is the one that takes a second parameter, and it takes it because
   * `t.me/share/url` shares nothing without a `url` — the sentence's own copy
   * of the address is what a recipient keeps if they forward the text on, and
   * the parameter is what makes Telegram accept it at all. It is the bare
   * origin, the same constant the sentence ends with.
   */
  const CHAT_TARGETS = [
    {
      id: "viber",
      label: COPY.shareChatViber,
      href: (text) => `viber://forward?text=${encodeURIComponent(text)}`,
    },
    {
      id: "telegram",
      label: COPY.shareChatTelegram,
      href: (text) =>
        `https://t.me/share/url?url=${encodeURIComponent(SHARE_ORIGIN)}` +
        `&text=${encodeURIComponent(text)}`,
    },
    {
      id: "whatsapp",
      label: COPY.shareChatWhatsApp,
      href: (text) => `https://wa.me/?text=${encodeURIComponent(text)}`,
    },
  ];

  const chatLinks = $derived(CHAT_TARGETS.map((to) => ({ ...to, url: to.href(message) })));

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

<!-- The three marks, drawn here as paths rather than fetched, because nothing
     third-party may reach the reader — the CSP in `public/_headers` pins
     `img-src 'self' data:` and there is no icon font, no sprite sheet and no
     package for this.

     Monochrome and at `currentColor`, so a Viber purple, a Telegram blue and a
     WhatsApp green never land in a row that sits under the number the reader
     came for; the knockouts are painted in the button's own background rather
     than in white, which is what keeps them right in the dark theme. Each is
     `aria-hidden` — the label beside it is the accessible name, so a reader
     using a screen reader hears "Изпрати във Viber" once rather than twice. -->
{#snippet chatIcon(id)}
  <svg class="sh-ic" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    {#if id === "viber"}
      <path
        d="M12 1.6c-2.8 0-5 .7-6.4 2.2-1.3 1.5-1.9 3.7-1.9 6.7 0 3 .6 5.2 1.9 6.7.5.5 1 .9 1.6 1.2v3.9c0 .6.6.8 1 .4l2.8-3.2h1c2.8 0 5-.7 6.4-2.2 1.3-1.5 1.9-3.7 1.9-6.8 0-3-.6-5.2-1.9-6.7-1.4-1.5-3.6-2.2-6.4-2.2z"
        fill="currentColor"
      />
      <path
        d="M9.4 7.3c-.2-.3-.4-.3-.6-.3h-.5c-.2 0-.5.1-.7.3-.3.3-.9.8-.9 2s.9 2.3 1 2.5c.1.2 1.7 2.7 4.2 3.7 2 .8 2.5.7 2.9.6.4 0 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.4-.2-1.6-.8c-.2-.1-.4-.1-.5.1l-.6.7c-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.7-1.2-1.4-1.4-1.7-.1-.2 0-.3.1-.4l.4-.4.2-.4v-.4l-.8-1.7z"
        fill="var(--surface)"
      />
    {:else if id === "telegram"}
      <path
        d="M23 3.2 1.6 11.6c-.5.2-.5.9 0 1.1l5.4 1.9 2 6c.2.5.8.6 1.1.2l2.7-3 4.9 3.6c.5.4 1.2.1 1.3-.5L23.9 4c.1-.6-.4-1-.9-.8zM7.9 14.9l10.6-6.6-8.3 8-.4 4.1-1.9-5.5z"
        fill="currentColor"
      />
    {:else}
      <path
        d="M12 2.3a9.6 9.6 0 0 0-8.2 14.6l-1.4 4.9 5-1.3A9.6 9.6 0 1 0 12 2.3z"
        fill="currentColor"
      />
      <path
        d="M9 7.5c-.2-.4-.4-.4-.6-.4H8c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1s.9 2.3 1 2.5c.1.2 1.7 2.7 4.3 3.8 2 .8 2.5.7 2.9.6.4 0 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.4-.2-1.6-.8c-.2-.1-.4-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.7-1.2-1.4-1.4-1.7-.1-.2 0-.3.1-.4l.4-.4.2-.4v-.4L9 7.5z"
        fill="var(--surface)"
      />
    {/if}
  </svg>
{/snippet}

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

    {#if !canSendFiles}
      <!-- The line comes before the links rather than after them, because it is
           what tells a reader which of the two things above the row these send.
           `aria-labelledby` gives the group the same sentence a sighted reader
           gets from its position. -->
      <p class="sh-chat-note" id="shareChatNote">
        <span class="l-bg">{COPY.shareChatNote.bg}</span>
        <span class="l-en">{COPY.shareChatNote.en}</span>
      </p>
      <div class="sh-chat" role="group" aria-labelledby="shareChatNote">
        {#each chatLinks as link (link.id)}
          <!-- A new tab, and `noreferrer` on top of `noopener`: following one of
               these in the reader's own tab discards everything they typed,
               which is not persisted unless they turned that on themselves —
               and the Referer header is one more thing a chat service would be
               handed about somebody who has only pressed a button. -->
          <a class="sh-chat-link" href={link.url} target="_blank" rel="noopener noreferrer">
            {@render chatIcon(link.id)}
            <span class="l-bg">{link.label.bg}</span>
            <span class="l-en">{link.label.en}</span>
          </a>
        {/each}
      </div>
    {/if}

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
    border: 1px solid var(--control-line);
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
  /* Quieter than the buttons above it and set tight against the row it
     introduces, so the pair reads as one thing: these links send the sentence,
     the controls above send the sentence and the picture. */
  .sh-chat-note {
    margin: 12px 0 6px;
    font-size: var(--fs-small);
    line-height: 1.45;
    color: var(--muted);
  }
  .sh-chat {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* Deliberately the same shape as the unfilled buttons above rather than three
     brand colours: a row of Viber purple, Telegram blue and WhatsApp green is
     louder than the number the reader came for, and it would be the only
     third-party livery on the page. */
  .sh-chat-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: var(--fs-small);
    padding: 7px 13px;
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
    text-decoration: none;
  }
  .sh-chat-link:hover {
    color: var(--ink);
    border-color: var(--muted);
  }
  .sh-note {
    margin: 10px 0 0;
    font-size: var(--fs-small);
    line-height: 1.45;
    color: var(--muted);
  }
</style>
