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
  import { COPY } from "./content.js";
  import { CONTACT, LEGAL_NAV } from "./legal-nav.js";
  import { SUPPORT_COPY } from "./support.js";
  import { BUILD_ID } from "./build.js";

  /** `true` on the legal page itself, where linking to the same page is noise. */
  const { onLegalPage = false } = $props();
</script>

<footer class="site">
  <div class="wrap foot mono">
    <span class="credits">
      <span class="l-bg">{COPY.footerNote.bg}</span>
      <span class="l-en">{COPY.footerNote.en}</span>
    </span>

    <nav class="legal-links" aria-label="legal">
      {#each LEGAL_NAV as doc (doc.id)}
        <a href={onLegalPage ? `#${doc.id}` : `/legal/#${doc.id}`}>
          <span class="l-bg">{doc.nav.bg}</span>
          <span class="l-en">{doc.nav.en}</span>
        </a>
      {/each}
      <a href={onLegalPage ? "#support" : "/legal/#support"}>
        <span class="l-bg">{SUPPORT_COPY.navK.bg}</span>
        <span class="l-en">{SUPPORT_COPY.navK.en}</span>
      </a>
      <a href="mailto:{CONTACT.general}">
        <span class="l-bg">{COPY.contactK.bg}</span>
        <span class="l-en">{COPY.contactK.en}</span>
      </a>
    </nav>

    <span class="build" title="build">{BUILD_ID}</span>
  </div>

  <!--
    The support line sits BELOW the credits row, on its own, muted. It is a
    statement of how the project is funded, not a call to action: one
    sentence, no amount, no button styling, no colour that competes with the
    calculator. See support.js for why it may never become more than this.
  -->
  <div class="wrap support mono">
    <span class="l-bg">{SUPPORT_COPY.line.bg}</span>
    <span class="l-en">{SUPPORT_COPY.line.en}</span>
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
  .build {
    letter-spacing: 0.03em;
    opacity: 0.75;
    flex: 0 0 auto;
  }
  /* Quieter than the credits above it, and no link styling of its own — the
     link is the "Подкрепа" item in the nav row. This is a fact about the
     project, printed at the size of a fact. */
  .support {
    padding: 0 0 30px;
    font-size: var(--fs-fine);
    color: var(--muted);
    opacity: 0.85;
    line-height: 1.6;
  }
</style>
