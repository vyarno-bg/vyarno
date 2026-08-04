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
  import { lang, theme, toggleLang, toggleTheme } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
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
          <span class="l-bg">правна информация</span>
          <span class="l-en">legal information</span>
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

<main id="main" class="wrap legal">
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
      <h1>
        <span class="l-bg">{doc.title.bg}</span>
        <span class="l-en">{doc.title.en}</span>
      </h1>

      {#each doc.sections as section (section.id ?? section.h.bg)}
        <section id={section.id ?? undefined}>
          <h2>
            <span class="l-bg">{section.h.bg}</span>
            <span class="l-en">{section.h.en}</span>
          </h2>

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
      >Въпрос по нещо от тази страница: <a href="mailto:{CONTACT.general}">{CONTACT.general}</a
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

  .legal {
    padding: 26px 0 10px;
    max-width: 760px;
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

  h1 {
    font-family: var(--serif);
    font-size: clamp(1.5625rem, 4vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin: 0 0 4px;
  }
  h2 {
    font-size: var(--fs-lead);
    line-height: 1.3;
    margin: 26px 0 0;
    color: var(--ink);
  }
  p {
    margin: 9px 0 0;
    font-size: var(--fs-lead);
    line-height: 1.62;
    color: var(--ink-2);
  }

  .rows {
    margin: 14px 0 0;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(150px, 34%) 1fr;
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
      grid-template-columns: 1fr;
    }
    .brand small {
      display: none;
    }
  }
</style>
