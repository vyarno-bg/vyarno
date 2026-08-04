<script>
  /**
   * The 404 page.
   *
   * A static host's default 404 is a white page with a monospace sentence and
   * no way back — which is a fine thing for a hobby project and a bad one for
   * a product someone is paying for. This keeps the brand, says plainly what
   * happened, and offers the two routes that are actually useful: the
   * calculator and the legal page.
   *
   * No data fetch, no calculator bundle: a 404 should not cost eight JSON
   * requests.
   */
  import { lang, theme, toggleLang, toggleTheme } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import { CONTACT } from "./lib/legal-nav.js";
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
          <span class="l-bg">икономиката, честно</span>
          <span class="l-en">the economy, honestly</span>
        </small>
      </span>
    </a>
    <div class="controls">
      <button class="pill" onclick={toggleTheme} aria-label="Toggle theme">
        {$theme === "dark" ? "☀" : "☾"}
      </button>
      <button class="pill" onclick={toggleLang} aria-label="Toggle language">
        {$lang === "bg" ? "EN" : "BG"}
      </button>
    </div>
  </div>
</header>

<main id="main" class="wrap nf">
  <p class="code mono">404</p>
  <h1>
    <span class="l-bg">Тази страница я няма.</span>
    <span class="l-en">This page isn't here.</span>
  </h1>
  <p class="lead">
    <span class="l-bg"
      >Адресът е грешен или страницата е премахната. Числата са си на мястото — калкулаторът е на
      един клик оттук.</span
    >
    <span class="l-en"
      >The address is wrong, or the page was removed. The numbers are all still there — the
      calculator is one click away.</span
    >
  </p>
  <div class="actions">
    <a class="cta" href="/">
      <span class="l-bg">Към калкулатора</span>
      <span class="l-en">To the calculator</span>
    </a>
    <a class="alt" href="/legal/">
      <span class="l-bg">Правна информация</span>
      <span class="l-en">Legal information</span>
    </a>
  </div>
  <p class="tell mono">
    <span class="l-bg"
      >Стигнал си дотук по връзка от наша страница? Пиши на <a href="mailto:{CONTACT.general}"
        >{CONTACT.general}</a
      > — ще я оправим.</span
    >
    <span class="l-en"
      >Did a link on our own site bring you here? Write to <a href="mailto:{CONTACT.general}"
        >{CONTACT.general}</a
      > and we'll fix it.</span
    >
  </p>
</main>

<SiteFooter />

<style>
  header.site {
    background: var(--hdr);
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
    margin-top: 2px;
  }
  .controls {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
  .pill {
    font-family: var(--mono);
    font-size: var(--fs-small);
    padding: 5px 9px;
    border: 1px solid var(--control-line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
  }
  .pill:hover {
    border-color: var(--muted);
    color: var(--ink);
  }

  .nf {
    padding: 12vh 0 8vh;
    max-width: 620px;
  }
  .code {
    font-size: var(--fs-small);
    letter-spacing: 0.18em;
    color: var(--muted);
    margin: 0 0 10px;
  }
  h1 {
    font-family: var(--serif);
    font-size: clamp(1.875rem, 6vw, 2.75rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .lead {
    font-size: var(--fs-lead);
    line-height: 1.6;
    color: var(--ink-2);
    margin: 14px 0 0;
    max-width: 46ch;
  }
  .actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 24px;
  }
  .cta {
    background: var(--real);
    color: var(--surface);
    padding: 10px 18px;
    border-radius: var(--radius);
    font-weight: 600;
    font-size: var(--fs-lead);
    text-decoration: none;
  }
  .cta:hover {
    background: var(--real-ink);
  }
  .alt {
    padding: 10px 16px;
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
    font-size: var(--fs-lead);
    color: var(--ink-2);
    text-decoration: none;
  }
  .alt:hover {
    border-color: var(--muted);
    color: var(--ink);
  }
  .tell {
    margin: 30px 0 0;
    font-size: var(--fs-small);
    line-height: 1.6;
    color: var(--muted);
  }
  .tell a {
    color: var(--real-ink);
  }
</style>
