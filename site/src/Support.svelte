<script>
  /**
   * `/support/` — how the project is paid for, what that buys and what it
   * does not.
   *
   * **Why this is a page and not a section of `/legal/`.** It carries no legal
   * obligation, it is not versioned with the four documents, and `legal.js`
   * says so in two comments — so it was already sitting outside the `DOCS`
   * loop, appended after four documents a reader has to scroll past. It is
   * also the one thing at that URL somebody might arrive wanting, and reaching
   * it cost them the ~30 kB of terms of use the legal entry loads. A separate
   * build entry resolves as a real URL on a static host with no rewrite rules,
   * which is what makes it linkable from a README, a repository description or
   * a conversation.
   *
   * `support.js` governs what may be said here, and rule 1 governs how many
   * places may say it. This page is the one place any of it is explained at
   * length; the footer line and the explainer item are prose with a link.
   */
  import { lang, theme, toggleLang, toggleTheme } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import { REPO_ISSUES_URL } from "./lib/legal-nav.js";
  import { SUPPORT_COPY, livePlatforms } from "./lib/support.js";

  // Only platforms whose account is actually open. A channel stays `live:
  // false` in `support.js` until someone opens the account, so this renders
  // the honest "not open yet" line rather than links to 404s.
  const SUPPORT_LIVE = livePlatforms();
</script>

<header class="site">
  <div class="wrap bar">
    <a class="brand" href="/">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="6" width="4" height="14" rx="1" fill="var(--muted)" />
        <rect x="16" y="2" width="4" height="18" rx="1" fill="var(--real)" />
        <path
          d="M6 20 L16 20"
          stroke="var(--real)"
          stroke-width="1.5"
          stroke-dasharray="2 2"
          fill="none"
        />
      </svg>
      <span class="wm">
        <span class="l-bg">Вярно</span>
        <span class="l-en">Vyarno</span>
        <small>
          <span class="l-bg">подкрепа</span>
          <span class="l-en">support</span>
        </small>
      </span>
    </a>
    <div class="controls">
      <a class="pill back" href="/">
        <span class="l-bg">← към калкулатора</span>
        <span class="l-en">← to the calculator</span>
      </a>
      <button class="pill" onclick={toggleTheme} aria-label="Toggle theme">
        {$theme === "dark" ? "☀" : "☾"}
      </button>
      <button class="pill" onclick={toggleLang} aria-label="Toggle language">
        {$lang === "bg" ? "EN" : "BG"}
      </button>
    </div>
  </div>
</header>

<main id="main" class="wrap support">
  <h1>
    <span class="l-bg">{SUPPORT_COPY.head.bg}</span>
    <span class="l-en">{SUPPORT_COPY.head.en}</span>
  </h1>
  <p class="lead">
    <span class="l-bg">{SUPPORT_COPY.body.bg}</span>
    <span class="l-en">{SUPPORT_COPY.body.en}</span>
  </p>

  {#if SUPPORT_LIVE.length > 0}
    <!-- Each card names the platform and what is different about it, because
         that difference is the whole reason more than one is listed. The link
         prints its own URL: a donate link is exactly the link a person reads
         before deciding to trust it. -->
    <ul class="cards">
      {#each SUPPORT_LIVE as p (p.id)}
        <li>
          <b>{p.label}</b>
          <span class="note">
            <span class="l-bg">{p.note.bg}</span>
            <span class="l-en">{p.note.en}</span>
          </span>
          <a href={p.url} target="_blank" rel="noopener">{p.url}</a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="note">
      <span class="l-bg">{SUPPORT_COPY.pending.bg}</span>
      <span class="l-en">{SUPPORT_COPY.pending.en}</span>
    </p>
  {/if}

  <h2>
    <span class="l-bg">{SUPPORT_COPY.offsiteK.bg}</span>
    <span class="l-en">{SUPPORT_COPY.offsiteK.en}</span>
  </h2>
  <p>
    <span class="l-bg">{SUPPORT_COPY.offsite.bg}</span>
    <span class="l-en">{SUPPORT_COPY.offsite.en}</span>
  </p>
  <p class="onward">
    <a href="/legal/#privacy">
      <span class="l-bg">{SUPPORT_COPY.privacyK.bg} →</span>
      <span class="l-en">{SUPPORT_COPY.privacyK.en} →</span>
    </a>
  </p>

  <h2>
    <span class="l-bg">{SUPPORT_COPY.otherK.bg}</span>
    <span class="l-en">{SUPPORT_COPY.otherK.en}</span>
  </h2>
  <p>
    <span class="l-bg">{SUPPORT_COPY.other.bg}</span>
    <span class="l-en">{SUPPORT_COPY.other.en}</span>
  </p>
  <p class="onward">
    <a href={REPO_ISSUES_URL} target="_blank" rel="noopener">
      <span class="l-bg">{SUPPORT_COPY.issuesK.bg} →</span>
      <span class="l-en">{SUPPORT_COPY.issuesK.en} →</span>
    </a>
  </p>
</main>

<SiteFooter page="support" />

<style>
  /* The legal page's chrome, and deliberately the same: two pages a reader
     reaches from the same footer row should not each have their own header. */
  header.site {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--hdr);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 54px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 700;
    font-size: var(--fs-h3);
    letter-spacing: -0.01em;
    text-decoration: none;
  }
  .brand .wm {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }
  .brand small {
    font-family: var(--mono);
    font-weight: 500;
    font-size: var(--fs-micro);
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    display: block;
    margin-top: 2px;
  }
  .controls {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pill {
    font-family: var(--mono);
    font-size: var(--fs-small);
    padding: 5px 9px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
  }
  .pill:hover {
    border-color: var(--muted);
    color: var(--ink);
  }

  main.support {
    padding: 30px 0 10px;
    max-width: 680px;
  }
  h1 {
    font-family: var(--serif);
    font-size: clamp(1.5625rem, 4vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin: 0;
  }
  h2 {
    font-size: var(--fs-lead);
    line-height: 1.3;
    margin: 30px 0 0;
    color: var(--ink);
  }
  p {
    margin: 9px 0 0;
    font-size: var(--fs-lead);
    line-height: 1.62;
    color: var(--ink-2);
  }
  .lead {
    margin-top: 12px;
  }
  .note {
    font-size: var(--fs-meta);
    color: var(--muted);
  }

  /* No filled background, no padding box, no accent block — the same rule the
     footer's donate link keeps. A page about donations is where a button would
     look most reasonable and is exactly where support.js rule 1 is aimed. */
  .onward a {
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
  }
  .onward a:hover {
    border-bottom-color: var(--real);
  }

  .cards {
    list-style: none;
    margin: 18px 0 0;
    padding: 0;
  }
  .cards li {
    padding: 13px 15px;
    margin-top: 10px;
    background: var(--surface);
    border: 1px solid var(--line-2);
    border-left: 2px solid var(--real);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .cards b {
    font-size: var(--fs-lead);
    color: var(--ink);
  }
  .cards .note {
    display: block;
    line-height: 1.5;
    margin-top: 3px;
  }
  .cards li > a {
    display: inline-block;
    margin-top: 6px;
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
    overflow-wrap: anywhere;
  }
  .cards li > a:hover {
    border-bottom-color: var(--real);
  }

  @media (max-width: 560px) {
    .brand small {
      display: none;
    }
  }
</style>
