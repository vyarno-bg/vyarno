<script>
  /**
   * `/legal/` — the terms of use, the privacy notice, the provider
   * identification required by ЗЕТ чл. 4, and the source attribution.
   *
   * One page, four documents, deep-linkable (`/legal/#privacy`). It is a
   * separate build entry rather than a route inside the calculator, so it
   * resolves as a real URL on a static host with no rewrite rules, loads
   * without the calculator's bundle, and can be linked to from an invoice or
   * a register entry and still work in five years.
   *
   * It renders `$lib/legal.js` and decides nothing itself. Both languages come
   * from the same `.l-bg` / `.l-en` mechanism the calculator uses, driven by
   * the shared `lang` store, so the toggle carries across pages.
   */
  import SiteFooter from "./lib/SiteFooter.svelte";
  import SiteHeader from "./lib/SiteHeader.svelte";
  import { COPY } from "./lib/content.js";
  import {
    CONTACT,
    DOCS,
    LEGAL_EFFECTIVE,
    LEGAL_FORM,
    LEGAL_VERSION,
    SUPERVISORS,
    UPSTREAMS,
    identityRows,
  } from "./lib/legal.js";

  // Only the ЗЕТ чл. 4 rows the legal form we actually are owes today. Rows
  // that become due when Вярно starts taking payment are declared in legal.js
  // and deliberately not rendered — a row that reads «предстои» for years is
  // indistinguishable from an oversight. `legal.js#identityRows` decides;
  // this page renders.
  const IDENTITY_ROWS = identityRows(LEGAL_FORM);
</script>

<SiteHeader page="/legal/" tagline={COPY.taglineLegal} />

<main id="main" class="wrap legal">
  <!-- One `<h1>` for the page, above the four documents rather than on any one
       of them. The documents are siblings — none is the subject of the page and
       the other three a part of it — so each carried an `<h1>` of its own, and
       a page serving four of them tells a crawler it has four subjects and
       leaves a screen-reader user with no heading that names where they are.
       The level a document sits at is decided here; `legal.js` decides which
       documents there are. -->
  <h1>
    <span class="l-bg">Правна информация</span>
    <span class="l-en">Legal information</span>
  </h1>

  <nav class="toc mono" aria-label="contents">
    {#each DOCS as doc (doc.id)}
      <a href="#{doc.id}">
        <span class="l-bg">{doc.nav.bg}</span>
        <span class="l-en">{doc.nav.en}</span>
      </a>
    {/each}
  </nav>

  <p class="version mono">
    <span class="l-bg">Версия {LEGAL_VERSION} · в сила от {LEGAL_EFFECTIVE.bg}</span>
    <span class="l-en">Version {LEGAL_VERSION} · effective {LEGAL_EFFECTIVE.en}</span>
  </p>

  {#each DOCS as doc (doc.id)}
    <article id={doc.id}>
      <h2>
        <span class="l-bg">{doc.title.bg}</span>
        <span class="l-en">{doc.title.en}</span>
      </h2>

      {#each doc.sections as section (section.id ?? section.h.bg)}
        <section id={section.id ?? undefined}>
          <h3>
            <span class="l-bg">{section.h.bg}</span>
            <span class="l-en">{section.h.en}</span>
          </h3>

          {#each section.p as para, i (i)}
            {#if para.html}
              <p>
                <span class="l-bg">{@html para.bg}</span><span class="l-en">{@html para.en}</span>
              </p>
            {:else}
              <p><span class="l-bg">{para.bg}</span><span class="l-en">{para.en}</span></p>
            {/if}
          {/each}

          {#if section.render === "identity"}
            <dl class="rows">
              {#each IDENTITY_ROWS as row (row.id)}
                <div class="row">
                  <dt>
                    <span class="l-bg">{row.label.bg}</span>
                    <span class="l-en">{row.label.en}</span>
                  </dt>
                  <dd>
                    {#if typeof row.value === "string"}
                      <b>{row.value}</b>
                    {:else}
                      <span class="l-bg">{row.value.bg}</span>
                      <span class="l-en">{row.value.en}</span>
                    {/if}
                    {#if row.note}
                      <span class="note">
                        <span class="l-bg">{row.note.bg}</span>
                        <span class="l-en">{row.note.en}</span>
                      </span>
                    {/if}
                  </dd>
                </div>
              {/each}
            </dl>
          {/if}

          {#if section.render === "supervisors"}
            <ul class="cards">
              {#each SUPERVISORS as s (s.id)}
                <li>
                  <b>
                    <span class="l-bg">{s.name.bg}</span>
                    <span class="l-en">{s.name.en}</span>
                  </b>
                  <span class="note">
                    <span class="l-bg">{s.role.bg} · {s.address.bg}</span>
                    <span class="l-en">{s.role.en} · {s.address.en}</span>
                  </span>
                  <a href={s.url} target="_blank" rel="noopener">{s.url}</a>
                </li>
              {/each}
            </ul>
          {/if}

          {#if section.render === "upstreams"}
            <ul class="cards">
              {#each UPSTREAMS as u (u.id)}
                <li>
                  <b>
                    <span class="l-bg">{u.name.bg}</span>
                    <span class="l-en">{u.name.en}</span>
                  </b>
                  <p class="what">
                    <span class="l-bg">{u.provides.bg}</span>
                    <span class="l-en">{u.provides.en}</span>
                  </p>
                  <p class="terms">
                    <span class="l-bg"><b>Условия:</b> {u.requires.bg}</span>
                    <span class="l-en"><b>Terms:</b> {u.requires.en}</span>
                  </p>
                  <span class="links mono">
                    <a href={u.url} target="_blank" rel="noopener">
                      <span class="l-bg">данните ↗</span>
                      <span class="l-en">the data ↗</span>
                    </a>
                    <a href={u.termsUrl} target="_blank" rel="noopener">
                      <span class="l-bg">условията ↗</span>
                      <span class="l-en">their terms ↗</span>
                    </a>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </article>
  {/each}

  <p class="reach mono">
    <span class="l-bg"
      >Въпрос за нещо на тази страница: <a href="mailto:{CONTACT.general}">{CONTACT.general}</a
      ></span
    >
    <span class="l-en"
      >A question about anything on this page: <a href="mailto:{CONTACT.general}"
        >{CONTACT.general}</a
      ></span
    >
  </p>
</main>

<SiteFooter page="legal" />

<style>
  /* The skip link's target, offset by the height of the sticky header plus a
     little: a bare `#main` jump parks the first heading underneath it, and a
     reader who is told they arrived somewhere has to arrive there. The deep
     links in this page's own contents list carry the same offset. */
  /* The column a definition list and an identity table get; prose below is held
     to `--measure` and is narrower. Four legal documents read end to end is the
     longest continuous reading on the site, so the line length matters here more
     than anywhere. */
  .legal {
    scroll-margin-top: 64px;
    padding: 26px 0 10px;
    max-width: var(--col);
  }
  .toc {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: var(--fs-small);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--line-2);
  }
  .toc a {
    color: var(--ink-2);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
  }
  .toc a:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }

  .version {
    font-size: var(--fs-small);
    color: var(--muted);
    margin: 12px 0 0;
  }

  article {
    padding-top: 30px;
    scroll-margin-top: 66px;
  }
  article + article {
    border-top: 1px solid var(--line-2);
  }
  section {
    scroll-margin-top: 66px;
  }

  /* Three levels, and the sizes are what make the nesting legible: the page,
     the four documents under it, and the sections inside each. A document title
     drawn at the section size reads as a section, and a reader scanning for
     «Поверителност» goes past it. */
  h1 {
    font-family: var(--serif);
    font-size: var(--fs-title);
    line-height: 1.12;
    letter-spacing: -0.018em;
    margin: 0 0 16px;
  }
  h2 {
    font-family: var(--serif);
    font-size: var(--fs-h2);
    line-height: 1.2;
    letter-spacing: -0.012em;
    margin: 0 0 4px;
  }
  /* The third level, and it was `--fs-lead` — body size, told apart from the
     paragraph under it by weight alone. Four documents run end to end here and
     the h3 is what a reader scanning for «Какво може да правиш» is scanning
     for; at the body's own size it reads as a bold sentence. 20 / 24 / 38 over
     16px body, with the family carrying the h2/h3 split as well as the size. */
  h3 {
    font-size: var(--fs-h3);
    line-height: 1.25;
    margin: 30px 0 0;
    color: var(--ink);
  }
  p {
    margin: 9px 0 0;
    max-width: var(--measure);
    font-size: var(--fs-lead);
    line-height: 1.62;
    color: var(--ink-2);
  }

  /* A URL is one word to a line-breaker and this page is made of them — the
     issues address the ЗЕТ чл. 4 identity has to publish, and the supervisory
     authority's. `anywhere` rather than `break-word` because it is the one
     that also lowers min-content, which is what a grid track and a
     shrink-to-fit link are sized by; without it the address held its box open
     and the page scrolled sideways at 200% text. Scoped to this page: nowhere
     else does a reader have to be shown a raw address. */
  main :global(a) {
    overflow-wrap: anywhere;
  }
  .rows {
    margin: 14px 0 0;
  }
  .row {
    display: grid;
    /* `minmax(0, 1fr)` for the reason card.css gives about the calculator's
       own grid: a bare `1fr` takes its minimum from min-content, so the one
       unbreakable string in these rows — the GitHub issues URL, which is the
       value of a row the law requires — sized the track and pushed the whole
       page sideways at 200% text. Capped at zero, the track is the column and
       the URL breaks inside it. */
    grid-template-columns: minmax(150px, 34%) minmax(0, 1fr);
    gap: 4px 16px;
    padding: 9px 0;
    border-top: 1px solid var(--line-2);
  }
  .row dt {
    font-family: var(--mono);
    font-size: var(--fs-fine);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    padding-top: 2px;
  }
  .row dd {
    margin: 0;
    font-size: var(--fs-lead);
    color: var(--ink);
  }
  /* There is no "pending" state any more: a row this legal form does not owe
     is absent from the page rather than rendered as an unkept promise, and a
     row it does owe carries a value or fails the release build — see
     legal.js#identityRows and scripts/check-identity.mjs. */
  .note {
    display: block;
    font-size: var(--fs-meta);
    line-height: 1.5;
    color: var(--muted);
    margin-top: 3px;
  }

  .cards {
    list-style: none;
    margin: 14px 0 0;
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
  .cards p {
    font-size: var(--fs-body);
    margin: 6px 0 0;
  }
  .cards .terms {
    color: var(--muted);
  }
  .cards .links {
    display: flex;
    gap: 14px;
    margin-top: 8px;
    font-size: var(--fs-small);
  }
  .cards .links a {
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
  }
  .cards .links a:hover {
    border-bottom-color: var(--real);
  }
  .cards li > a {
    display: inline-block;
    margin-top: 6px;
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
  }
  .cards li > a:hover {
    border-bottom-color: var(--real);
  }

  .reach {
    margin: 34px 0 0;
    padding-top: 14px;
    border-top: 1px solid var(--line-2);
    font-size: var(--fs-meta);
    color: var(--muted);
  }
  .reach a {
    color: var(--real-ink);
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
