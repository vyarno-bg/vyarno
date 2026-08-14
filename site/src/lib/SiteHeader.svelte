<!--
  The masthead: wordmark, one route out, theme toggle, language toggle — plus
  the skip link that has to precede it in the tab order.

  Shared by every page for the same reason `SiteFooter.svelte` is, and it is a
  different reason. The footer is shared because it carries obligations — the
  upstream attribution is a licence condition and the ЗЕТ чл. 4 identity has to
  be reachable from every page. This one is shared because it is a CONTROL BAR,
  and a control that behaves differently on one page than on another is a
  control a reader has to learn twice. The language link, the theme button and
  the skip target are the same three affordances everywhere; the only things
  that legitimately differ are which page you are on and what it is called.

  So exactly two props, and they are the two things a page knows about itself:

    page     the Bulgarian path, which decides where the language control
             points, where the wordmark goes and which route out is offered.
             `null` on /404.html, which is served for a path that matched
             nothing and therefore has no counterpart in the other tree.
    tagline  the {bg, en} pair under the wordmark.

  Everything else — the pills, the glyphs, the accessible names, the rules that
  drop the tagline and tighten the spacing on a phone — is the same on all six
  entries and lives here once. It owns no state: the two toggles write to the `theme`/`lang` stores in
  $lib/stores.js, which every other component reads from directly.
-->
<script>
  import { theme, lang, chooseLang, langHref, toggleTheme } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";

  const { page = null, tagline = COPY.brandSmall } = $props();

  /**
   * Where the language control points, and it is this page's own address.
   *
   * `/404.html` is the exception and passes `null`: it is served for whatever
   * path did not match, so there is no counterpart of it in the other tree to
   * offer. The other tree's root is the honest destination — a reader who
   * switches language from a page that does not exist gets a page that does.
   */
  const here = $derived(page ?? "/");

  /**
   * The wordmark's target, and the two answers are the same intent.
   *
   * On the calculator, home is the page the reader is already on, so the
   * wordmark is an in-page jump past the bar to the content. Everywhere else
   * it is the route home. A single `href="/"` would cost the calculator its
   * jump; a single `href="#main"` would leave five pages with a wordmark that
   * does nothing recognisable.
   */
  const brandHref = $derived(page === "/" ? "#main" : "/");
</script>

<!-- The skip link. The first Tab stop would otherwise be the wordmark, which
     does jump to #main on the calculator but announces itself as the logo —
     and on every other page navigates away instead. So a keyboard or
     screen-reader user has no signposted way past the header without this.
     `scroll-margin-top` on #main keeps the sticky header off the target once
     it lands. -->
<a class="skip" href="#main">
  <span class="l-bg">{COPY.skipK.bg}</span>
  <span class="l-en">{COPY.skipK.en}</span>
</a>
<header class="site">
  <div class="wrap bar">
    <a class="brand" href={brandHref}>
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
          <span class="l-bg">{tagline.bg}</span>
          <span class="l-en">{tagline.en}</span>
        </small>
      </span>
    </a>
    <div class="controls">
      <!-- The route out, and which one it is follows from where the reader is.
           The calculator is the page every other one points back to, so it is
           the one that needs pointing OUT of — two content routes, in the slot
           every other entry uses for its single way back.

           They are links among two buttons on purpose: `.pill` is this bar's
           vocabulary for "a control up here", and giving navigation its own
           treatment would add a second one to a bar with four items in it.

           One anchor per language, because the href differs and a pair is how
           this codebase writes anything that does. The route is the reader's
           own tree's: an English reader sent to the Bulgarian page would
           arrive at a document that declares `bg` and be read it in Bulgarian,
           since the URL is what decides the language.

           The labels are ONE WORD EACH, IN BOTH LANGUAGES, and the English
           half is the half to watch: «числата» is 71px and "the numbers" was
           106px, which is what put every English page's bar past the right
           edge of a 360px phone while the Bulgarian one fitted. The bar has to
           stay on one line at 360px rather than growing a second row on every
           phone, and a length rule kept in one language is not a rule. -->
      {#if page === "/"}
        <a class="pill nav l-bg" href={langHref("/how/", "bg")}>{COPY.howNavK.bg}</a>
        <a class="pill nav l-en" href={langHref("/how/", "en")}>{COPY.howNavK.en}</a>
        <a class="pill nav l-bg" href={langHref("/market/", "bg")}>{COPY.marketNavK.bg}</a>
        <a class="pill nav l-en" href={langHref("/market/", "en")}>{COPY.marketNavK.en}</a>
      {:else if page}
        <a class="pill back l-bg" href={langHref("/", "bg")}>{COPY.backToCalcK.bg}</a>
        <a class="pill back l-en" href={langHref("/", "en")}>{COPY.backToCalcK.en}</a>
      {/if}
      <button class="pill" onclick={toggleTheme} aria-label={t(COPY.themeToggle, $lang)}>
        {$theme === "dark" ? "☀" : "☾"}
      </button>
      <!-- The language control, and it is a LINK rather than a button: the two
           languages are two URLs, and a handler that flipped a store would be
           unreachable with JavaScript off, where every entry hardcodes its own
           `data-lang` and nothing on the page can change it. One anchor per
           language for the same reason as the pair above — the Bulgarian
           reader's control points at the English tree and the English reader's
           points back. `chooseLang` records the choice on the way out; the
           navigation happens whether or not it runs. -->
      <a
        class="pill l-bg"
        href={langHref(here, "en")}
        hreflang="en"
        aria-label={COPY.langToggle.bg}
        onclick={() => chooseLang("en")}>EN</a
      >
      <a
        class="pill l-en"
        href={langHref(here, "bg")}
        hreflang="bg"
        aria-label={COPY.langToggle.en}
        onclick={() => chooseLang("bg")}>BG</a
      >
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
  /**
   * The bar wraps rather than overflowing, and `min-height` rather than
   * `height` is what lets it.
   *
   * This is a floor and not a layout: at every width where the row fits, an
   * auto height resolves to exactly the 54px the minimum sets, so nothing
   * moves. What it removes is the other outcome. A fixed height with no wrap
   * does not make the content fit — it makes the overflow leave the box, and a
   * control past the right edge scrolls the whole DOCUMENT sideways, taking the
   * sticky header and every paragraph with it on the narrowest phones.
   *
   * Measured, at 360px, before the rules below: /en/ ran to 383px and every
   * English page to 386px, while their Bulgarian counterparts fitted. The bar
   * is decided by words, and words are a per-language length — so a bar that
   * can only fit or break is one that will break in some language eventually,
   * whatever any one measurement says today.
   */
  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    column-gap: 16px;
    row-gap: 4px;
    min-height: 54px;
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
  /* No `display` here, deliberately. `.controls` is a flex container, so an
     anchor is blockified anyway — and a `display` declaration on the pill ties
     on specificity with `html[data-lang] .l-en` in `tokens.css` once Svelte's
     scoping class is added, which would leave the hidden half of every pair
     showing or not depending on stylesheet order.

     `text-decoration` and `white-space` are on the shared rule rather than on
     an `a.pill` of their own: four of the five pills in this bar are anchors,
     and the button ignores both. */
  .pill {
    font-family: var(--mono);
    font-size: var(--fs-small);
    padding: 5px 9px;
    border: 1px solid var(--control-line);
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
  /* On a narrow bar the tagline is what has to give. Four controls plus the
     wordmark plus «икономиката, честно» do not fit a 360px bar: measured, the
     tagline wraps to two lines inside a bar fixed at 54px, so it is the brand
     promise rendered as a layout fault. The wordmark still says whose page this
     is, the `<h1>` under it says what the page does, and a route to where the
     numbers come from is worth more on a phone than a subtitle is.

     560px rather than the width the wrap was measured at, because one bar gets
     one breakpoint. The calculator carries four controls and the other entries
     three, so the two crowd at different widths — and a rule that fired at a
     different width per page would be a bar a reader learns twice, which is
     the whole reason this file is shared. Dropping it at the wider of the two
     costs a subtitle between 400px and 560px and buys the same header
     everywhere. */
  @media (max-width: 560px) {
    .brand small {
      display: none;
    }
  }
  /**
   * The bar tightens before it wraps, and this is where the room comes from.
   *
   * Four controls and a wordmark is what a 360px phone cannot hold at desk
   * spacing, and the calculator is the page that carries four. Ten pixels off
   * the bar's gap, two off each control's gap and two off each pill's sides is
   * 28px on that bar — measured, /en/ goes from 383px to 355px inside a 360px
   * viewport, and the Bulgarian pages gain the same margin they did not have.
   *
   * Spacing rather than type: the labels are the smallest thing in the header
   * already, and a pill set smaller than `--fs-small` on the device most
   * readers arrive on is a control they can see and not read.
   */
  @media (max-width: 480px) {
    .bar {
      column-gap: 10px;
    }
    .controls {
      gap: 6px;
    }
    .pill {
      padding-left: 7px;
      padding-right: 7px;
    }
  }
  /* Off-screen until focused. `left` rather than `display: none` or
     `visibility: hidden`, because both of those take the link out of the tab
     order and the link exists to BE the first tab stop. */
  .skip {
    position: absolute;
    left: -999px;
  }
  /* `color` and `text-decoration` are on the focused state and not inherited:
     this is the one link on the page drawn as a box on the surface colour, and
     the link colour means «your number is the good one» in this app rather than
     anything about navigation. */
  .skip:focus {
    left: 16px;
    top: 10px;
    z-index: 99;
    background: var(--surface);
    padding: 8px 12px;
    border: 1px solid var(--ink);
    border-radius: 6px;
    color: var(--ink);
    text-decoration: none;
  }
</style>
