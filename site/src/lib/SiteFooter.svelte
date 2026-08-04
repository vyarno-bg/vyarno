<script>
  /**
   * The site footer. Shared by the calculator, the legal page and the 404 —
   * one place, so the upstream attribution and the legal links cannot exist
   * on one page and be missing from another.
   *
   * Three things live here and they are not interchangeable:
   *
   * 1. **Upstream attribution** (`COPY.footerNote`) — a licence condition of
   *    several publishers and the product's credibility claim. Never shorten
   *    it. Guarded by `test_footer_credits_every_upstream_we_use`.
   * 2. **The legal links** — ЗЕТ чл. 4 requires the provider's identifying
   *    information to be permanently and directly accessible, which means a
   *    link from every page rather than a page you have to know about.
   *    Guarded by `test_the_footer_links_to_every_legal_document`.
   * 3. **The build stamp** — so a support conversation can start with "which
   *    build are you on" instead of guessing. Discreet on purpose.
   * 4. **The support line** — one quiet sentence and one link, because the
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
  import { CONTACT, LEGAL_NAV, REPO_URL } from "./legal-nav.js";
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
  <div class="wrap foot mono">
    <span class="credits">
      <span class="l-bg">{t(COPY.footerNote, "bg", { year: YEAR })}</span>
      <span class="l-en">{t(COPY.footerNote, "en", { year: YEAR })}</span>
    </span>

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
      `/how/`, and deliberately OUTSIDE the nav above for the reason the repo
      link below gives: that landmark is labelled "legal" and holds what
      discharges ЗЕТ чл. 4. A page of published figures is not that.

      It is here as well as in the header because the header belongs to the
      calculator alone — `/legal/` and `/support/` write their own — and a
      reader who has walked into one of those had no way back to the numbers.
      Absent on `/how/` itself: a page that links to itself is noise, which is
      the rule the four document links above already follow.
    -->
    {#if page !== "how"}
      <a class="how-link" href="/how/">
        <span class="l-bg">{COPY.howFooterK.bg}</span>
        <span class="l-en">{COPY.howFooterK.en}</span>
      </a>
    {/if}

    <!--
      The source, next to the build stamp and not inside the legal nav: those
      four links discharge ЗЕТ чл. 4 and this one does not, and a landmark
      labelled "legal" should hold only what is.

      The mark is inline SVG from GitHub's own Octicons set, drawn in
      `currentColor`. Not an <img>, not a webfont, not a CDN sprite — the CSP
      is `img-src 'self' data:` and `connect-src 'self'`, and the privacy
      notice's claim that the browser makes not one third-party request is what
      that policy exists to keep true. An icon is not a reason to spend it.

      `aria-hidden` on the SVG with the label in a real text span, rather than
      an `aria-label` on the anchor: the label is also what a reader sees when
      the viewport has room, so the sighted and the announced name are the same
      string instead of two that can drift.
    -->
    <a class="repo" href={REPO_URL} target="_blank" rel="noopener">
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

    <span class="build" title="build">{BUILD_ID}</span>
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
  .credits {
    flex: 1 1 auto;
  }
  .legal-links {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
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
  /* Drawn exactly like the links in the nav beside it: it sits in the same row
     of small type, and being outside that landmark is a fact about the
     accessibility tree rather than something a reader should be able to see. */
  .how-link {
    color: var(--ink-2);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .how-link:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }
  /* The legal links' treatment plus the mark, so the source sits in the same
     row of small type rather than announcing itself. The icon is baseline-
     aligned to the label by `vertical-align`, not by flex centring: this is
     one line of text inside a `baseline`-aligned footer row, and a flex
     container here would take the anchor's own baseline off the row and drop
     it a pixel below the links beside it. */
  .repo {
    color: var(--ink-2);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .repo svg {
    vertical-align: -2px;
    margin-right: 5px;
  }
  .repo:hover {
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
