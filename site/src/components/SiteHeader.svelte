<!--
  The masthead: wordmark, theme toggle, language toggle — plus the skip link
  that has to precede it in the tab order.

  It owns no state. The two toggles write to the `theme`/`lang` stores in
  $lib/stores.js, which every other component reads from directly, so nothing
  is threaded through props.
-->
<script>
  import { theme, lang, toggleLang, toggleTheme } from "$lib/stores.js";
  import { COPY } from "$lib/content.js";
</script>

<!-- The skip link. `.skip` has had styles in this file all along with no
     element wearing them: the first Tab stop was the wordmark, which does jump
     to #main but announces itself as the logo, so a keyboard or screen-reader
     user had no signposted way past the header. `scroll-margin-top` on #main
     keeps the sticky header off the target once it lands. -->
<a class="skip" href="#main">
  <span class="l-bg">Към съдържанието</span>
  <span class="l-en">Skip to content</span>
</a>
<header class="site">
  <div class="wrap bar">
    <a class="brand" href="#main">
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
          <span class="l-bg">{COPY.brandSmall.bg}</span>
          <span class="l-en">{COPY.brandSmall.en}</span>
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

<style>
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
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .pill {
    font-family: var(--mono);
    font-size: var(--fs-small);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-2);
    padding: 6px 9px;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .pill:hover {
    border-color: var(--muted);
  }
  /* Skip link for accessibility */
  .skip {
    position: absolute;
    left: -999px;
  }
  .skip:focus {
    left: 16px;
    top: 10px;
    z-index: 99;
    background: var(--surface);
    padding: 8px 12px;
    border: 1px solid var(--ink);
    border-radius: var(--radius);
  }
</style>
