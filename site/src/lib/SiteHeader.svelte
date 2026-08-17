<!--
  The masthead: wordmark, the routes to every other page, theme toggle, language
  toggle — plus the skip link that has to precede it in the tab order.

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
             points, where the wordmark goes and which route is left out of the
             row. `null` on /404.html, which is served for a path that matched
             nothing and therefore has no counterpart in the other tree.
    tagline  the {bg, en} pair under the wordmark.

  Everything else — the route words, the two boxed toggles, the glyphs, the
  accessible names and the rule that folds the routes onto the control row — is
  the same on all six entries and lives here once. It owns no state: the two
  toggles write to the `theme`/`lang` stores in $lib/stores.js, which every other
  component reads from directly.

  **A ROUTE IS A WORD AND A TOGGLE IS A BOX, and the shapes carry the
  difference.** Four navigating lozenges beside two switching ones meant the
  first thing a reader met was six identical outlined boxes to sort out. It also
  cost the width that made the bar a compromise: without the pills' borders and
  side padding, all four routes plus the current-page mark fit ONE row at 360px
  in both languages — measured, with the document not widening and no target
  under 44x44 — where three bordered pills had needed 400px against a 328px
  budget.

  EVERY TARGET IS STILL AT LEAST 44x44 CSS PX. The routes take their own line
  below 760px and join the wordmark's above it; 320px is the one width where
  they wrap to two lines, and that is below what this bar is designed to hold.
-->
<script>
  import { theme, lang, chooseLang, langHref, toggleTheme } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";

  const { page = null, tagline = COPY.brandSmall } = $props();

  // The calculator is an entry here rather than a way back, which is why its
  // label carries no arrow: from `/market/` it is beside you, not behind you.
  const ROUTES = [
    { href: "/", label: COPY.calcNavK },
    { href: "/how/", label: COPY.howNavK },
    { href: "/market/", label: COPY.marketNavK },
    { href: "/credit/", label: COPY.creditNavK },
  ];

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
     it lands. It is the one control under the 44px floor, because a target
     that is off-screen until focused has no size to hold. -->
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
        <!-- One unbroken rule, matching favicon.svg and the bitmaps
             `scripts/make_og_image.py` draws. Solid because the Facebook
             profile picture is solid, and that copy of the mark is not ours
             to re-render. -->
        <path d="M6 19.25 L16 19.25" stroke="var(--real)" stroke-width="1.5" fill="none" />
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
    <!-- Written out rather than folded behind a `☰`. The tap a disclosure costs
         is not the objection; `☰` has to be recognised before it can be used
         and a row of words does not, and this site is read by people who came
         for one number rather than by people who read interfaces.

         The labels are ONE WORD EACH IN BOTH LANGUAGES, and the English half is
         the one to watch: «числата» is 71px and "the numbers" was 106px, which
         is what put every English page's bar past the right edge of a 360px
         phone while the Bulgarian one fitted. One anchor per language, because
         the href differs and a pair is how this codebase writes anything that
         does — an English reader sent to the Bulgarian page would arrive at a
         document that declares `bg`, since the URL is what decides the language. -->
    <nav class="routes" aria-label={t(COPY.routesNavK, $lang)}>
      {#each ROUTES as route (route.href)}
        {#if route.href === page}
          <!-- **Marked, not removed.** Dropping the current route left the bar a
               different shape on every page — «имоти» is third from the left on
               `/` and second on `/credit/` — so a reader could not learn where a
               route lives, and on a phone, where the tagline that names the page
               was hidden, nothing on screen said which of the four they were
               reading. The `--real-soft` band with `--real-ink` on it is the
               chip the strip already uses for «this is the one», so it is a mark
               a reader has met.

               A `span` rather than an `a` with `aria-current`, because the
               target does not go anywhere: a 44px tap that reloads the page a
               reader is on is a control that lies. `aria-current` on a
               non-link would announce a state with no role to hold it, so the
               visually-hidden word is what carries it. -->
          <span class="route here l-bg"
            >{route.label.bg}<span class="sr">{COPY.hereK.bg}</span></span
          >
          <span class="route here l-en"
            >{route.label.en}<span class="sr">{COPY.hereK.en}</span></span
          >
        {:else}
          <a class="route l-bg" href={langHref(route.href, "bg")}>{route.label.bg}</a>
          <a class="route l-en" href={langHref(route.href, "en")}>{route.label.en}</a>
        {/if}
      {/each}
    </nav>
    <div class="controls">
      <button class="pill icon" onclick={toggleTheme} aria-label={t(COPY.themeToggle, $lang)}>
        {$theme === "dark" ? "☀" : "☾"}
      </button>
      <!-- The language control, and it is a LINK rather than a button: the two
           languages are two URLs, and a handler that flipped a store would be
           unreachable with JavaScript off, where every entry hardcodes its own
           `data-lang` and nothing on the page can change it. `chooseLang`
           records the choice on the way out; the navigation happens whether or
           not it runs. -->
      <a
        class="pill icon l-bg"
        href={langHref(here, "en")}
        hreflang="en"
        aria-label={COPY.langToggle.bg}
        onclick={() => chooseLang("en")}>EN</a
      >
      <a
        class="pill icon l-en"
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
    /* `--control-line` and not `--line`. The bar's bottom edge is the boundary
       between two surfaces a reader has to be able to tell apart while one of
       them slides under the other, and `--line` on `--paper` is 1.40:1 — a rule
       that is not there. This is the one page rule that is doing a control's
       job, which is the distinction `tokens.css` draws between the two tokens. */
    border-bottom: 1px solid var(--control-line);
  }
  /**
   * One row that wraps into two, rather than two rows that merge into one.
   *
   * `.routes` is a third flex item taking a full basis below 760px, so the same
   * nav — one DOM, one set of links — sits on its own line there and between
   * the wordmark and the controls above it. Rendering it twice and showing one
   * copy per width would put every route in the document twice for every
   * crawler and every reader whose software ignores `display`.
   *
   * `min-height` rather than `height`, and it is a floor and not a layout: a
   * fixed height with no wrap does not make content fit, it makes the overflow
   * leave the box, and a control past the right edge scrolls the whole DOCUMENT
   * sideways on the narrowest phones.
   */
  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    column-gap: 16px;
    min-height: 56px;
  }
  /* The floor reaches the wordmark too: below 560px the tagline is hidden,
     which left this box 22px tall — the smallest target in the header, and the
     one that goes home from five of the six entries. */
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 44px;
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
  .routes,
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .routes {
    order: 3;
    flex-basis: 100%;
    padding-bottom: 8px;
  }
  .controls {
    margin-left: auto;
  }
  /* No `display` on `.pill` or `.route`, deliberately. `.controls` and `.routes`
     are flex containers, so an anchor is blockified anyway — and a `display`
     declaration here ties on specificity with `html[data-lang] .l-en` in
     `tokens.css` once Svelte's scoping class is added, which would leave the
     hidden half of every pair showing or not depending on stylesheet order.
     That is why the 44px height is bought with `padding` and a stated
     `line-height` rather than with `inline-flex`. */

  /**
   * A route, and it is a word on a bar rather than a box.
   *
   * **Six outlined lozenges across the top of a ledger was the one place on this
   * site that looked like a component library.** Four of them navigated and two
   * changed a setting, drawn identically, so the first thing a reader met was six
   * boxes to tell apart. Words for the destinations and a box only on the two
   * controls makes the distinction the shape rather than something to read: the
   * routes are the masthead's sections, the boxed pair are switches.
   *
   * WCAG 1.4.11 is not what the border was buying. It asks 3:1 of a control whose
   * BOUNDARY identifies it — a text field with no visible edge, the case
   * `--control-line` exists for — and a word inside a `nav` landmark is
   * identified by being a word inside a `nav`. 2.5.5 still binds and is bought
   * the same way it was: 13px on a stated `line-height` inside 12px of vertical
   * padding is 44px tall, and `verify_render_layout.mjs` measures every drawn
   * target in the bar at 360px in both languages.
   */
  .route {
    font-family: var(--mono);
    font-size: var(--fs-small);
    line-height: 20px;
    padding: 12px 6px;
    color: var(--ink-2);
    text-decoration: none;
    white-space: nowrap;
    border-radius: var(--radius);
    /* Reserved at rest so hovering a route does not move the one beside it. */
    box-shadow: inset 0 -2px 0 transparent;
  }
  .route:hover {
    color: var(--ink);
    box-shadow: inset 0 -2px 0 var(--real);
  }
  /* The page a reader is on. `--real-soft` under `--real-ink` is the pair the
     national strip's «up» chip already uses, and the reason it is a band rather
     than the hover's underline is that the two must not be confusable: an
     underline appearing under the cursor and an underline meaning "you are here"
     are one mark doing two jobs. */
  .route.here {
    color: var(--real-ink);
    background: var(--real-soft);
    box-shadow: none;
  }
  /* Announced, never drawn. `clip-path` rather than `display: none`, which takes
     the text out of the accessibility tree along with the layout. */
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* **The corner is the site's own, not a lozenge.** `--radius` is what every
     field and picker on the site is drawn with (`card.css`), and these two are
     the same kind of thing — something you operate. A fully-rounded box was the
     one shape in the tree borrowed from somewhere else, at the top of every
     page. The tag name is spelled out rather than written as markup because
     `verify_template_safety.mjs` scans this file's source for a text-entry
     surface, and it is right to: it cannot tell a comment from a template. */
  .pill {
    font-family: var(--mono);
    font-size: var(--fs-small);
    line-height: 18px;
    padding: 12px;
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    text-align: center;
  }
  /* The two controls labelled by a glyph or two letters. Without a width floor
     the theme button renders 23.8px wide at 360px — under WCAG 2.5.8's 24x24
     minimum, not merely under 2.5.5's 44x44. */
  .pill.icon {
    min-width: 44px;
    padding-left: 8px;
    padding-right: 8px;
  }
  .pill:hover {
    border-color: var(--muted);
    color: var(--ink);
  }
  /* **The tagline is drawn at every width, and it is free.** `.brand` carries a
     44px floor for the target; the wordmark and the tagline stacked are 20 + 2 +
     11 = 33px, so the line sits inside a box the bar was already paying for and
     the header is 97px on a phone either way — measured at 320, 360 and 390 in
     both languages.

     It had been hidden below 560px, which is the width where it matters most:
     the tagline is the page's own name on five of the six entries («ЧИСЛАТА»,
     «ИМОТИ», «КРЕДИТИТЕ», «ПОДКРЕПА»), so a phone reader had nothing on screen
     saying which of them they were reading, and on `/` they never saw the one
     sentence the project leads with. Both languages fit on one line at 320px:
     «икономиката, честно» is the longest and it is 137px of an available 216. */
  /* Where the routes stop needing a line of their own. 760px is measured rather
     than picked off a device list: it is the width at which the wordmark, four
     route pills and the two toggles fit one line at the 44px floor in BOTH
     languages, English being the binding half. */
  @media (min-width: 760px) {
    .routes {
      order: 2;
      flex-basis: auto;
      margin-left: auto;
      padding-bottom: 0;
    }
    /* Ruled off from the routes, because on one line the two groups are 22px
       apart and the routes are 20px apart from each other — so the break between
       "places to go" and "switches" was smaller than the gaps inside either. On
       the phone the controls sit beside the wordmark instead and the routes have
       a line of their own, which is separation enough without a rule. */
    .controls {
      order: 3;
      margin-left: 0;
      padding-left: 15px;
      border-left: 1px solid var(--line);
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
