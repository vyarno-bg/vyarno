<script>
  /**
   * The site footer. Shared by the calculator, the legal page and the 404 —
   * one place, so the upstream attribution and the legal links cannot exist
   * on one page and be missing from another.
   *
   * Five things live here and they are not interchangeable:
   *
   * 1. **Upstream attribution** (`COPY.footerNote`) — a licence condition of
   *    several publishers and the product's credibility claim. Never shorten
   *    it. Guarded by `verify_legal.mjs` §"the footer credits every upstream
   *    the pipeline pulls from".
   * 2. **The legal links** — ЗЕТ чл. 4 requires the provider's identifying
   *    information to be permanently and directly accessible, which means a
   *    link from every page rather than a page you have to know about.
   *    Guarded by `verify_legal.mjs` §"the footer links every legal document,
   *    and the page renders every one".
   * 3. **The build stamp** — so a support conversation can start with "which
   *    build are you on" instead of guessing. Discreet on purpose.
   * 4. **The two marked links** — the source and the Facebook page. Neither
   *    is inside the legal nav, because that landmark is labelled "legal" and
   *    holds what discharges ЗЕТ чл. 4; both are here so that a reader who met
   *    this project somewhere else can check it against its own domain.
   * 6. **The content routes** — one per page of published figures, in the order
   *    the masthead offers them, absent on the page a reader is already on. They
   *    are a list rather than a block each, and that is the whole reason this
   *    section exists: written as one `{#if}` per route the footer fell a route
   *    behind the site, and `/credit/` shipped without ever reaching it. A third
   *    copy would have been the third place to remember.
   * 5. **The support line** — one quiet sentence and one link, because the
   *    project is donation-funded and a person is entitled to know that
   *    without being interrupted by it. The rules governing how this may be
   *    asked (no modal, no amounts, nothing conditioned on use, nothing given
   *    in return) are in `support.js` and they are not style preferences.
   */
  // `legal-nav.js`, not `legal.js`: the footer needs four ids and four labels,
  // and importing the module that carries the documents' full text would put
  // ~30 kB of terms of use on the calculator's critical path. `support.js` is
  // tiny and safe to pull in here for the same reason.
  import { COPY, t } from "./content.js";
  import { CONTACT, FACEBOOK_URL, LEGAL_NAV, REPO_URL } from "./legal-nav.js";
  import { SUPPORT_COPY, footerDonateLink } from "./support.js";
  import { BUILD_ID } from "./build.js";

  /**
   * Which page this footer is on: `"legal"`, `"support"`, or `""` elsewhere.
   *
   * It exists so a page does not link to itself, which is noise — on `/legal/`
   * the document links become in-page fragments. One name rather than a
   * boolean per page: several booleans make "on the legal page AND the support
   * page" expressible, which means nothing, and anything expressible
   * eventually gets written.
   */
  const { page = "" } = $props();

  /**
   * The one open channel, or `null` while there are none or several.
   *
   * Read once at module scope because `SUPPORT_PLATFORMS` is a build-time
   * constant — a channel opens in a commit, never in a session.
   */
  const DONATE = footerDonateLink();

  /**
   * The pages of published figures, in the masthead's own order.
   *
   * **A list, because two `{#if}` blocks had already let the footer fall behind
   * the site**: `/credit/` shipped as the sixth route and reached the masthead's
   * `ROUTES` and not this file, so every page's footer offered a reader two of
   * the three places there are to go. A third block would have been a third
   * place to forget.
   *
   * The labels are the footer's own and longer than the masthead's — «кредити»
   * is a chip in a row of four, «Кредитите в България» is a line in a row of
   * links, and the same word does not do both jobs. The `page` values are the
   * ones each route passes to this component, so a route that forgets the prop
   * links to itself, which `verify_render_layout.mjs` catches per page.
   */
  const CONTENT_ROUTES = [
    { href: "/how/", page: "how", label: COPY.howFooterK },
    { href: "/market/", page: "market", label: COPY.marketFooterK },
    { href: "/credit/", page: "credit", label: COPY.creditFooterK },
  ];

  /**
   * The year in the attribution line, from the reader's own clock.
   *
   * Read at render rather than baked at build: `prerender.mjs` freezes this
   * component into every page's HTML, so a build-time constant would keep
   * saying the build's year until somebody happened to deploy — which on a site
   * that republishes when the DATA moves could be a long time after January.
   * The client mounts over the prerendered shell and corrects it either way.
   */
  const YEAR = new Date().getFullYear();
</script>

<footer class="site">
  <!--
    THREE ROWS, AND THE ORDER IS THE POINT: where a reader can go, then whose
    the data is, then who pays for it. They were one flex row, and at 1280px that
    row carried the attribution, four document links, support, contact, two
    content routes, two marked links and the build stamp — ten items under
    `space-between`, so the licence-condition credit competed for space with a
    build hash and lost it first at every width. The rows below give each group
    its own line and let it wrap inside it.
  -->
  <div class="wrap foot mono">
    <!--
      The pages of published figures. A `nav` landmark of its own rather than
      items in the legal one: that landmark is labelled "legal" and holds what
      discharges ЗЕТ чл. 4, and a page of figures is not that — the same
      distinction the marked links below are kept out of it for.
    -->
    {#if CONTENT_ROUTES.some((r) => r.page !== page)}
      <nav class="routes" aria-label={t(COPY.footerRoutesK, "bg")}>
        {#each CONTENT_ROUTES.filter((r) => r.page !== page) as route (route.href)}
          <a class="route-link" href={route.href}>
            <span class="l-bg">{route.label.bg}</span>
            <span class="l-en">{route.label.en}</span>
          </a>
        {/each}
      </nav>
    {/if}

    <nav class="legal-links" aria-label="legal">
      {#each LEGAL_NAV as doc (doc.id)}
        <a href={page === "legal" ? `#${doc.id}` : `/legal/#${doc.id}`}>
          <span class="l-bg">{doc.nav.bg}</span>
          <span class="l-en">{doc.nav.en}</span>
        </a>
      {/each}
      <a href="/support/">
        <span class="l-bg">{SUPPORT_COPY.navK.bg}</span>
        <span class="l-en">{SUPPORT_COPY.navK.en}</span>
      </a>
      <a href="mailto:{CONTACT.general}">
        <span class="l-bg">{COPY.contactK.bg}</span>
        <span class="l-en">{COPY.contactK.en}</span>
      </a>
    </nav>

    <!--
      The two links that carry a mark: the source, and the Facebook page. Both
      answer the same question for a reader who met this project somewhere else
      — is this really them — and neither belongs in the `legal-links` nav,
      because that landmark is labelled "legal" and holds what discharges
      ЗЕТ чл. 4. A repository and a social page are not that.

      Both marks are inline SVG in `currentColor` — GitHub's own Octicon and
      Facebook's own "f". Not an <img>, not a webfont, not a CDN sprite: the CSP
      admits script and images from our own origin and the visit counter and
      nothing else, and an icon is not a reason to spend that. Each is used to
      point at our own page on that service, which is what a brand mark is for;
      nothing here is co-branded and no endorsement is implied.

      `aria-hidden` on each SVG with the label in a real text span, rather than
      an `aria-label` on the anchor: the label is also what a reader sees when
      the viewport has room, so the sighted and the announced name are the same
      string instead of two that can drift.

      They sit in ONE flex item rather than two, because `justify-content:
      space-between` places every item independently: as two, the row count
      decided where each landed, and at 1100px the source finished one line
      while the Facebook page opened the next alone at the left edge beside the
      build stamp — a stray rather than the pair it is. Grouped, they break
      between themselves and nowhere else, which is the only break that reads as
      deliberate. `verify_render_layout.mjs` §"the two marked links in the
      footer stay on one row" holds it at the width where the row is tight.
    -->
    <span class="marks">
      <a class="marked" href={REPO_URL} target="_blank" rel="noopener">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
               0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
               -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
               .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
               -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
               .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
               .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
               0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
          />
        </svg>
        <span class="l-bg">{COPY.repoK.bg}</span>
        <span class="l-en">{COPY.repoK.en}</span>
      </a>

      <!--
        Why this link exists at all: a page posting about the economy under this
        name cannot be verified from Facebook's side, and the check a reader can
        actually run is whether the site links back. So this line is the
        evidence, `legal-nav.js#FACEBOOK_URL` is the single address it and the
        `sameAs` in `index.html` are both read from, and `verify_legal.mjs`
        fails if the two ever name different accounts.

        `rel="me"` beside `noopener` states in markup what the label states in
        words — that the far end is this same identity. It is not a contact
        route, and `FACEBOOK_URL` records why it is not published as one.
      -->
      <a class="marked" href={FACEBOOK_URL} target="_blank" rel="me noopener">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978
               .401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0
               0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686
               1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386
               2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373
               -12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
          />
        </svg>
        <span class="l-bg">{COPY.facebookK.bg}</span>
        <span class="l-en">{COPY.facebookK.en}</span>
      </a>
    </span>

    <span class="build" title="build">{BUILD_ID}</span>
  </div>

  <!--
    The upstream attribution, on its own line. «Данни от Евростат / ЕЦБ / НСИ /
    БНБ / имот.bg» is a licence condition of several of those five publishers
    rather than decoration, and in the row above it was the first thing to be
    squeezed by a build hash. Never shorten it, and never move it out of
    `footer.site` — `verify_render_shell.mjs` checks it is DRAWN and not merely
    present, because `display: none` leaves every text-level guard green while
    the credit reaches nobody.
  -->
  <div class="wrap credits mono">
    <span class="l-bg">{t(COPY.footerNote, "bg", { year: YEAR })}</span>
    <span class="l-en">{t(COPY.footerNote, "en", { year: YEAR })}</span>
  </div>

  <!--
    The support line sits BELOW the credits row, on its own, muted. It is a
    statement of how the project is funded, not a call to action: one
    sentence, no amount, no button styling, no colour that competes with the
    calculator. See support.js for why it may never become more than this.

    The link that follows it carries the same underline as the legal links
    beside it and names where it goes. It is the line's own link rather than
    an addition to it — `footerDonateLink()` returns something only while
    exactly one channel is open, so this stays one sentence and one link
    whatever else is declared in support.js.
  -->
  <div class="wrap support mono">
    <span class="l-bg">{SUPPORT_COPY.line.bg}</span>
    <span class="l-en">{SUPPORT_COPY.line.en}</span>
    {#if DONATE}
      <a class="donate" href={DONATE.url} target="_blank" rel="noopener">
        <span class="l-bg">{SUPPORT_COPY.donateK.bg} {DONATE.label}</span>
        <span class="l-en">{SUPPORT_COPY.donateK.en} {DONATE.label}</span>
      </a>
    {/if}
  </div>
</footer>

<style>
  footer.site {
    margin-top: 44px;
    border-top: 1px solid var(--line);
    background: var(--paper-2);
  }
  .foot {
    padding: 18px 0 10px;
    font-size: var(--fs-fine);
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px 18px;
    flex-wrap: wrap;
    line-height: 1.6;
  }
  /* The attribution's own line, above the funding one and drawn like it: both
     are statements rather than navigation, and the row above is navigation. */
  .credits {
    padding: 2px 0 0;
    font-size: var(--fs-fine);
    color: var(--muted);
    line-height: 1.6;
  }
  /* The two nav groups take the row's width between them and each wraps inside
     itself, so a group never interleaves with the other one — which is what
     `space-between` over ten loose items did at every width between 900 and
     1300px. */
  .routes,
  .legal-links {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  /* The content routes lead the row. `1 1 auto` rather than `0 0 auto`: they are
     the longest labels in the footer («Пазарът на жилища» beside «Кредитите в
     България»), and an item that may not shrink carries them past a 320px
     viewport and widens the document — the failure `.marks` records below for
     the English pair, on the group most likely to hit it first. */
  .routes {
    flex: 1 1 auto;
  }
  .legal-links a {
    color: var(--ink-2);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
  }
  .legal-links a:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }
  /* Drawn exactly like the links in the nav beside it: they sit in the same row
     of small type, and being a different landmark is a fact about the
     accessibility tree rather than something a reader should be able to see. */
  .route-link {
    color: var(--ink-2);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  .route-link:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }
  /* The two links that carry a mark — the source and the Facebook page. The
     legal links' treatment plus the glyph, so each sits in the same row of
     small type rather than announcing itself. One selector rather than one per
     destination: the marks differ, nothing about the treatment does, and a
     parallel rule is a second place for a hover colour to go stale.

     The icon is baseline-aligned to the label by `vertical-align`, not by flex
     centring: this is one line of text inside a `baseline`-aligned footer row,
     and a flex container here would take the anchor's own baseline off the row
     and drop it a pixel below the links beside it. */
  /* The pair, as one item in the row. NOT `display: flex` — `.foot` aligns on
     baselines, and a nested flex container publishes its own baseline and drops
     the pair a pixel below the links beside it, which is the trap the
     `vertical-align` note below already records for the anchors themselves.
     Left as a block of inline anchors, the two break between each other when
     the row runs out and each keeps its icon welded to its label by the
     `white-space: nowrap` they carry.

     `flex: 0 1 auto` rather than `0 0 auto`, and it is load-bearing on the
     ENGLISH routes: "The code on GitHub" and "Vyarno on Facebook" are the
     longer pair, and an item that may not shrink carries them past a 320px
     viewport instead of breaking between them — which widens the document and
     fails `verify_render_layout.mjs` §"the header fits a 320px phone" on all
     five `/en/` routes. Not a gutter question: `--gutter` computes to 0 at that
     width, so a footer link ending at the viewport edge is the content edge. */
  .marks {
    flex: 0 1 auto;
  }
  .marks .marked + .marked {
    margin-left: 14px;
  }
  .marked {
    color: var(--ink-2);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .marked svg {
    vertical-align: -2px;
    margin-right: 5px;
  }
  .marked:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }
  /* The build stamp is already the quietest thing in the row — `--muted` at
     12px mono, inherited from `.foot`. It carries no `opacity` for the reason
     `.support` below spells out: a fade on `--muted` is arithmetic on a
     contrast ratio, and 0.75 here composites to 3.34:1 on `--paper-2` in the
     light theme and 3.93:1 in the dark one. */
  .build {
    letter-spacing: 0.03em;
    flex: 0 0 auto;
  }
  /* Quieter than the credits above it, and no link styling of its own — the
     link is the "Подкрепа" item in the nav row. This is a fact about the
     project, printed at the size of a fact.

     **No `opacity` on this rule, and none on anything inside it.** `--muted`
     carries about a fifth of headroom over WCAG AA on `--paper-2` (5.72:1
     light, 5.98:1 dark — `tokens.css`, `verify_contrast.mjs`), and a fade eats
     it fast: nothing under 0.89 in the light theme or 0.83 in the dark one
     still clears 4.5:1, so the alphas anyone reaches for are all below the
     floor — 0.85 computes to 4.12:1 light. The token check cannot see that,
     because it reads `tokens.css` and the fade would be here;
     `verify_contrast.mjs` therefore parses this rule and recomputes the ratio
     it actually renders at. Quiet is a size and a colour, and the colour is
     already the quietest one that stays readable — going further makes the one
     line the project has unreadable to the people most likely to be squinting
     at a footer. */
  .support {
    padding: 0 0 30px;
    font-size: var(--fs-fine);
    color: var(--muted);
    line-height: 1.6;
  }
  /* The legal links' treatment exactly, and that is the whole specification:
     no background, no padding box, no accent fill. A donate link that reads
     as a button is the ask growing into a component, which support.js rule 1
     forbids by name. */
  .donate {
    margin-left: 0.5em;
    color: var(--ink-2);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  .donate:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }
</style>
