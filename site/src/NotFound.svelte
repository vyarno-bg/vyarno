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
   * No data fetch, no calculator bundle: a 404 should not cost nine JSON
   * requests.
   */
  import SiteFooter from "./lib/SiteFooter.svelte";
  import SiteHeader from "./lib/SiteHeader.svelte";
  import { COPY } from "./lib/content.js";
  import { CONTACT } from "./lib/legal-nav.js";
</script>

<SiteHeader page={null} tagline={COPY.brandSmall} />

<main id="main" class="wrap nf">
  <p class="code mono">404</p>
  <h1>
    <span class="l-bg">Тази страница я няма.</span>
    <span class="l-en">This page isn't here.</span>
  </h1>
  <p class="lead">
    <span class="l-bg"
      >Адресът е грешен или страницата е премахната. Числата са си на мястото и калкулаторът е на
      един клик оттук.</span
    >
    <span class="l-en"
      >The address is wrong, or the page was removed. The numbers are all still there, and the
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
      > и ще я оправим.</span
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
  /* The skip link's target, offset by the height of the sticky header plus a
     little: a bare `#main` jump parks the first heading underneath it, and a
     reader who is told they arrived somewhere has to arrive there. */
  .nf {
    scroll-margin-top: 64px;
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
    font-size: var(--fs-title);
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
