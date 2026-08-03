# Findability — how the site is read by a crawler

Вярно is a Bulgarian-language public good, and a person looking for «лична
инфлация» or «колко години заплата за жилище» finds it through a search engine
or not at all. This file holds what that costs the code, and what is
deliberately not done about it.

The crawler policy argues its own case inside `site/public/robots.txt`, at the
point somebody would edit it. Everything else is here.

## What is in place

| Thing | Where | What it does |
|---|---|---|
| `robots.txt` | `site/public/robots.txt` | pages allowed, `/data/published/` disallowed, the sitemap named, and a per-crawler AI policy with its reasoning inline |
| `sitemap.xml` | `site/scripts/gen-sitemap.mjs` | generated at build time so `lastmod` is the newest published `as_of` rather than the day somebody typed it |
| Canonical, OG, Twitter card, JSON-LD | `site/index.html`, `site/legal/index.html`, `site/support/index.html` | one canonical URL per entry, a static 1200×630 preview carrying no figure, and a `WebApplication` node that describes the code rather than the data |
| `noindex` on the error page | `site/404.html` | an indexed 404 is a search result that wastes a reader's click |
| `X-Robots-Tag` on the payloads | `site/public/_headers` | the `robots.txt` rule again, in a header, for anything that reaches a JSON directly |
| The prerendered shell | `site/scripts/prerender.mjs` | the page's own prose in the served HTML — below |

Core Web Vitals need nothing: a static bundle, no third-party request at all
(the CSP in `_headers` is what keeps that true), and self-hosted subsetted
fonts.

Measurement is Search Console and Bing Webmaster Tools, and it lives outside
this repository. **Verification by DNS TXT or a `<meta>` tag only.** A
verification `<script>` is a third-party script, which `principles.md`
§"Identity" rules out and the CSP would block — and analytics of any kind is on
the closed list, because a measurement that can see what a consumer typed is a
measurement of somebody's salary.

## The prerendered shell

`site/index.html`'s `<body>` is `<div id="app"></div>` and a `<noscript>`.
Every word the calculator says is inside the JavaScript bundle, so a crawler
that does not execute scripts sees a page with no subject. Googlebot renders
JavaScript on a second pass and gets there; Bingbot's second pass is slower and
much less reliable.

`scripts/prerender.mjs` runs after `vite build`, compiles `App.svelte` for the
server, and writes the result into the mount point in `dist/index.html`. It
adds no dependency: Svelte 5 ships `svelte/server`, and the SSR compile reuses
`vite.config.js` so the `$lib` alias, the plugin and the `__BUILD_ID__` define
cannot drift from the client build's.

### The rule: only what does not depend on a payload

The shell renders with `data = {}` — the state the calculator is in before
`loadAll()` returns — and two subtrees say something untrue in that state. Both
are gated on a `prerender` prop that only the build sets.

**The calculator region.** Before the payloads arrive it is a loading line;
after they arrive it is figures. Serving either is wrong in a different way: a
placeholder is what a search result would quote, and a figure frozen at build
time is a second source of truth for a number P3 and P4 govern. The region is
empty in the served HTML and the bundle fills it.

**The explainer's formula block.** Its branches are chosen by the anchor and by
which index the savings figure was deflated by, and its deposit share comes
from the published БНБ limits. Rendered with no payloads it states that the
rise since 2020 is the 13 groups summed at their official weights, when the
live page deflates by Eurostat's all-items index — a wrong claim about our own
method, in HTML, reaching whoever reads it rather than runs it. It is not
deleted from anywhere: a reader gets the whole block the moment the bundle
runs, which is the §9.2 obligation `ExplainerBand.svelte` names.

What is left is the header, the h1, the privacy line, the whole of the
explainer's prose and the footer with its upstream attribution — around 17 kB
of Bulgarian and English that is otherwise reachable only by executing the
bundle.

### Why not hydration

`mount()` appends to its target, so `main.js` empties `#app` and the client
renders from scratch. `hydrate()` is the conventional answer and it is the
wrong one here for two reasons. The server deliberately renders **less** than
the client's first frame, which is a hydration mismatch by construction. And
`<svelte:head>` would have to be injected too, leaving the page with two
`<title>` tags — the trap `App.svelte` already carries a comment about for
`<meta name="description">`, where Svelte appends rather than replaces and a
crawler reads the first.

Discarding ~17 kB of already-parsed DOM costs a repaint of markup the same
stylesheet draws the same way, which is cheaper than a hydration that can be
wrong.

**A `<meta name="description">` belongs in the `.html` entry files and nowhere
else.** This is the failure most likely to be reintroduced by somebody
improving the head tags.

## What is deliberately not done

**The declined crawlers stay declined.** GPTBot, ClaudeBot, CCBot,
Google-Extended, Applebot-Extended, meta-externalagent, Bytespider, Amazonbot
and CloudflareBrowserRenderingCrawler are refused on the reasoning in note 3 of
`robots.txt`; the six agents that cite their source are allowed, each repeating
the `/data/published/` `Disallow` because RFC 9309 §2.2.1 does not merge a
specific group with the catch-all. Reopening any of them to chase reach is a
decision for a person, argued in the pull request, not an edit.

**No analytics, ever.** `principles.md` closes session recording, any
measurement that can see what a consumer typed, and a share count, a click
event or a campaign parameter on an outgoing share. We do not find out whether
sharing works, and that is the trade rather than an oversight.

**The bilingual DOM stays.** Both languages ship in the served DOM at once, as
`<span class="l-bg">` / `<span class="l-en">` hidden by the rule in
`tokens.css`. This genuinely splits the page's topical signal, and it makes
`hreflang` impossible because there is one URL to point at — which is why
`index.html`'s comment above `og:locale:alternate` says the alternate locale
buys an unfurler a language it can read and is not an `hreflang` pair. It is a
real cost, named here so nobody has to rediscover it, and undoing it is an
architecture decision rather than an SEO one.

## Open questions

Neither of these is started, and both are product decisions rather than
engineering ones.

**A second content page.** Three URLs is the whole site, so one calculator page
can rank for one query cluster. There is nothing that answers an informational
query — how personal inflation is computed, what the tax wedge is, what a
district costs. [`how-it-works.md`](./how-it-works.md) is exactly that content
and is English-only developer documentation. Nothing in `principles.md` closes
the idea. What it would cost is mechanical and known: a fifth entry in
`vite.config.js#rollupOptions.input`, the two hardcoded four-page lists in
`verify_static_assets.mjs` and `verify_legal.mjs`, the sitemap's three-entry
array, a `max-age=0, must-revalidate` block in `_headers`, and the shared
`<SiteFooter>` mounted on it — the upstream attribution is a licence condition
and ЗЕТ чл. 4 wants the identity reachable from every page.

**IndexNow.** Bing and Yandex accept a ping when content changes, and this
site's sitemap `lastmod` moves on every pipeline refresh with nothing telling
anyone. There is no deploy job in `.github/workflows/ci.yml`, and hosting the
build is the operator's decision — this repository describes the code and
deliberately not one machine (`principles.md` §"Identity"). So it is either a
documented operator action or a new opt-in workflow, and which one is a
question for whoever runs the deployment.

## Cross-references

- [`site.md`](./site.md) — the SPA module by module, and the four build entries
- [`principles.md`](./principles.md) — P3, P4 and the closed list
- `site/public/robots.txt` — the crawler policy, with its reasoning inline
- `site/scripts/prerender.mjs` — the build step and what it refuses to emit
