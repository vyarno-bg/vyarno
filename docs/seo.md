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
| Canonical, OG, Twitter card, JSON-LD | each `.html` entry | one canonical URL per entry, a static 1200×630 preview carrying no figure, and a `WebApplication` / `WebPage` node that describes the code rather than the data — **`license` sits on the `WebApplication` and nowhere else**, because on a `WebPage` full of Eurostat's, БНБ's and НСИ's figures it states that those are Apache-2.0 (`verify_legal.mjs`, `docs/legal.md`) |
| `noindex` on the error page | `site/404.html` | an indexed 404 is a search result that wastes a reader's click |
| `X-Robots-Tag` on the payloads | `site/public/_headers` | the `robots.txt` rule again, in a header, for anything that reaches a JSON directly |
| The prerendered pages | `site/scripts/prerender.mjs` | every indexable entry in the served HTML — the prose on all four, the published figures on the two that read payloads, in the one language the entry declares — below |
| A second content page | `site/how/index.html` → `src/How.svelte` | the informational queries the calculator cannot rank for — below |

Core Web Vitals need nothing: a static bundle, no third-party request at all
(the CSP in `_headers` is what keeps that true), and self-hosted subsetted
fonts.

Measurement is Search Console and Bing Webmaster Tools, and it lives outside
this repository. **Verification by DNS TXT or a `<meta>` tag only.** A
verification `<script>` is a third-party script, which `principles.md`
§"Identity" rules out and the CSP would block — and analytics of any kind is on
the closed list, because a measurement that can see what a consumer typed is a
measurement of somebody's salary.

## The prerendered pages

An entry's `<body>` is `<div id="app"></div>` and a `<noscript>`. Every word the
page says is inside the JavaScript bundle, so a crawler that does not execute
scripts sees a page with no subject. Googlebot renders JavaScript on a second
pass and gets there; Bingbot's second pass is slower and much less reliable, and
an agent that cites its source generally executes nothing at all.

**Every indexable entry is prerendered, whatever its prose is assembled from.**
A page built out of in-repo constants rather than out of a payload has nothing
to go stale and nothing a build could get wrong — and that is an argument about
freshness, not about findability. What decides the second question is what the
crawler is SERVED, and an entry left out of the list is served a mount point:
its `<h1>` is a heading Bing reports as missing, and its subject is one no
search engine has. `/legal/` is the page ЗЕТ чл. 4 wants findable, so the cost
of leaving it out is the obligation the page exists to discharge; `/support/`
exists so the funding answer has an address a person can be given, which it is
not if the address serves an empty div. The one entry that stays out is the 404,
on its own grounds — it is `noindex`, so there is no crawler to serve.

`scripts/prerender.mjs` runs after `vite build`, compiles each page's component
for the server, and writes each result into the mount point of its entry. It
adds no dependency: Svelte 5 ships `svelte/server`, and the SSR compile reuses
`vite.config.js` so the `$lib` alias, the plugin and the `__BUILD_ID__` define
cannot drift from the client build's.

Prerendering a page is half of a pair. `mount()` appends, so the page's
bootstrap has to empty `#app` before it mounts or the reader gets the whole page
twice — the frozen build-time copy above the live one, which passes every
assertion written as "there is at least one of these".
`verify_static_assets.mjs` reads `PRERENDERED` against the bootstraps for that
reason, and the browser suites count the header, the footer and the heading
exactly rather than merely finding them.

It reads the eight published payloads off disk — `PAYLOADS` from
`src/lib/payloads.js`, never a directory listing — and hands them to the
component as a prop. `data.js` is not imported and must not be: that layer is
`fetch`, and there is no fetch in a Node build step. A payload that will not
parse fails the build rather than being rendered around.

### The bilingual DOM, and the copy a crawler gets

**The live DOM carries both languages. The prerendered copy carries one.**

Every string is authored as a pair, `<span class="l-bg">` beside
`<span class="l-en">`, and the rule at the foot of `tokens.css` hides whichever
one `html[data-lang]` does not name. A stylesheet is what a browser applies and
what Googlebot applies. It is not what an agent applies: the six that
`robots.txt` allows by name fetch the HTML and strip the tags, so the `<h1>` of
`/` reaches them as «Твоите числа. Твоята реалност. Your numbers. Your
reality.», and every heading and sentence under it doubles the same way. That is
the worst input for exactly the consumer note 3 of `robots.txt` was written to
attract, and on `/legal/` — the page a citing agent has most reason to parse —
37% of the served bytes are the half it cannot use.

So `prerender.mjs` writes the language its entry declares and drops the other,
reading `data-lang` off `<html>` rather than assuming `bg`, because that
attribute is what `tokens.css` hides by and the two have to agree.
`verify_render_prerender.mjs` §"the served pages carry one language, not two"
counts the class over the raw file for all four entries, which holds however a
future pair is written — one of them is an `<a class="how-more l-en">` rather
than a span today.

**This costs a reader nothing, in either state a reader can be in.** With
JavaScript, `main.js` and its three siblings call `target.replaceChildren()`
before `mount()`, so the prerendered markup is discarded wholesale and the
client renders both languages from scratch — §"Why not hydration" is why the
build renders a second time rather than hydrating. Without JavaScript,
`toggleLang()` is a button handler in `stores.js` that never runs, and all four
entries hardcode `data-lang="bg"`, so the English half is unreachable for as
long as the page is served. A reader with the stylesheet off and the bundle
running is unaffected; one with neither gets less doubled text than before.

What is left of the topical-signal cost is paid by the toggle rather than by the
served page: the document a crawler indexes is now monolingual, and it is the
live DOM that still holds two. `hreflang` stays impossible for the same reason
as ever — one URL.

### The rule: what the payloads decide, and nothing else

**What a published payload decides may be prerendered. What the READER decides,
and what the CLOCK decides, may not.**

The figures are safe because of how the build is assembled rather than because
somebody judged them stable. `site/package.json`'s `build` script is
`vite build && prerender.mjs && copy-data.mjs && …`, and `copy-data.mjs` copies
`data/published/*.json` into `dist/data/published/` — the same files the
prerender just read, for the bundle to fetch at runtime. One build, one set of
files, both ends. **A prerendered figure is exactly as fresh as the payload the
bundle fetches from that deploy**, and each one carries its own reference period
and a verify link on screen, which P3 and P4 require anyway.

Two things stay out, and both are things the build cannot know.

**The calculator region.** Its output is a function of what the reader typed,
and the defaults are not survey figures: the €900 in the pay field is a
placeholder the copy under it asks people to replace (P7). Freezing a result
computed from it into served HTML publishes an answer to a question nobody
asked, and a search result would quote it. `App.svelte` renders that region
empty under `prerender`; the bundle fills it.

**The freshness verdict.** `view.js#dataAge` judges each payload against its
cadence and the current time, and the build's clock is not the reader's — a page
stamped "fresh" the day it was built goes on saying so for as long as it is
served. `Calculator`'s seeded constructor therefore leaves `dataRows` empty and
the staleness banner down, and `DataBanner` drops the per-payload panel rather
than serving four column headings above an empty table. The bundle computes both
in the reader's own tab.

### Why not the wider rule

The stricter version — **refuse every figure a payload decides**, on the
reasoning that a number frozen at build time is a second source of truth for
something P3 and P4 govern — is the one that suggests itself, and widening back
to it costs the site the whole of its served content for nothing. The payload
and the HTML come out of the same build from the same files, so there is no
second source of truth to be a second copy of.

Where that reasoning holds is over the states the build cannot know, which is
why they are named separately above. A prerender rendering `App.svelte` with no
payloads at all — the calculator's loading placeholder in a search result, the
explainer's formula block naming a deflator the page does not use — is genuinely
false HTML, and both are still refused. The answer to it is to give the
prerender the real payloads, never to bake the fallbacks in.

The explainer's formula block shows the difference. It is gated on having the
figures it quotes (`cashEroded.basis !== "none"`) rather than on which build is
rendering, so it waits for the payloads on the reader's first paint too — the
state that needs guarding, and the one no build-time flag can see. The served
HTML then carries the whole published method, which is the §9.2 obligation
`ExplainerBand.svelte` names.

### What this costs, and the one way it can go wrong

There is no deploy job in this repository. `.github/workflows/ci.yml` builds and
tests; it does not deploy and it does not refresh
([`architecture.md`](./architecture.md) §CI), and hosting the build is the
operator's decision. So the guarantee above holds **per build**, not per deploy.

`site/public/_headers` caches `/data/published/*` for 300 s and every HTML entry
at `max-age=0, must-revalidate`, which keeps a reader's HTML and JSON from
drifting apart within a deploy. What it cannot prevent is an operator syncing
refreshed payloads to the host *without* rebuilding: the JSON moves and the
prerendered HTML does not, and a crawler that never runs the bundle reads the
older figures.

**The mitigation is structural rather than procedural.** Every prerendered
figure carries its own reference period on screen and a link to the publisher's
own table, so a page that fell behind is visibly behind — a reader or an agent
sees «Евростат · юни 2026 г.» beside the number and can tell it is not this
month's. `verify_render_country.mjs` asserts the periods and the links are there on
every figure, for exactly this reason. The operator-facing fix is the ordinary
one: refresh the payloads and rebuild, in that order, which is what
`npm run build` does in one command.

### Why not hydration

`mount()` appends to its target, so each bootstrap empties `#app` and the client
renders from scratch. `hydrate()` is the conventional answer and it is the
wrong one here for two reasons. The server deliberately renders **less** than
the client's first frame, which is a hydration mismatch by construction. And
`<svelte:head>` would have to be injected too, leaving the page with two
`<title>` tags — the trap `App.svelte` already carries a comment about for
`<meta name="description">`, where Svelte appends rather than replaces and a
crawler reads the first.

Discarding the already-parsed DOM costs a repaint of markup the same stylesheet
draws the same way, which is cheaper than a hydration that can be wrong.

**A `<meta name="description">` belongs in the `.html` entry files and nowhere
else.** This is the failure most likely to be reintroduced by somebody
improving the head tags.

## `/how/` — the second content page

One page ranks for one query cluster, and the calculator's is «сметни моята
инфлация». Nothing on it answers «каква е инфлацията в България», «колко взима
данъкът» or «колко струва квадратът в София» — informational questions with no
calculator in them, asked by people who will never type a salary into anything.
[`how-it-works.md`](./how-it-works.md) is that content written for a
contributor; `/how/` is it written for a reader, in both languages, with every
figure rendered from a payload and dated.

Seven sections: what inflation is and why a personal rate differs, the 13
divisions as a table with their weights and rates, gross-to-net and the system
wedge at four gross levels, the SES pay ladder with each rung marked surveyed or
modelled, the three mortgage rates and the БНБ caps, the €/m² and the
years-of-salary arithmetic, and unemployment beside НСИ's quarterly wage cells.

Three properties hold it in place, and each has a test:

- **No input, ever.** The whole page is prerendered on the basis that nothing on
  it is the reader's. The four values it reads off `Calculator` —
  `systemWedge`, `payLadderRows`, `sofiaHome`, `sofiaWageCells` — take payloads
  and no scalar, so a personal figure is not expressible rather than merely
  untested (`view.js` §"The country, with nobody in it"). The system wedge curve
  is open by name in `principles.md`'s closed list; the *personal* rate on it is
  not, because it inverts to the salary (P2).
- **Every figure names its publisher, its period and a link.** Three of them are
  ours rather than a publisher's — the modelled ladder, the €/m² median across
  имот.bg's districts, and the change since 2015 built on it — and the Eurostat
  disclosure travels with each, routing to `/legal/#sources` for the
  non-responsibility wording.
- **No figure in prose.** The page is mostly sentences around numbers, which
  makes it the likeliest surface in the repository to freeze today's headline
  into a string. `verify_copy.mjs` §"no page writes a live figure into its
  prose" checks it against the currently published values.

**A claim ABOUT a prerendered figure has to follow the payload too**, and that
is the rule's second half rather than a separate one. §инфлацията prints
Eurostat's headline beside Σ(w·r) over the divisions and explains the gap; which
explanation is true depends on whether the two payloads describe one month, and
during Eurostat's flash they do not (`math.md` §"Two reconciliations"). Static
prose over a payload-decided figure is a figure the build froze in a form no
refresh can correct — the failure the rule refuses everywhere else, wearing
sentences instead of digits. So the paragraph branches on `view.js#monthsSplit`,
which the calculator's explainer already did, and the served HTML is checked
against the months the same `dist/` shipped.

The page is also read by keyboard and at 360px, which is not an SEO property but
is decided in the same markup: each table sits in an `overflow-x: auto` box so
the page body never scrolls sideways, and each box is a named `role="region"`
tab stop, because a scroll container is not focusable on its own and two of the
four hold no link to tab to. What says a table scrolls is the column clipped at
the boundary and the focus ring — the conventional edge shadow is in `How.svelte`
as a comment saying why it is not in the stylesheet.

**Three routes in, and the count is the point.** The one inside the explainer's
«Как работи това?» reaches a reader who opened a disclosure at the foot of the
calculator — someone who has already decided the numbers are worth checking, and
the smallest audience the page has. A page answering "where does this come from"
is wanted BEFORE that decision, so the header carries a pill to it (`SiteHeader`,
beside the theme and language buttons, where `/how/`, `/legal/` and `/support/`
each already put their own one link) and the footer carries a line to it on every
page. The footer link sits OUTSIDE `nav.legal-links`: that landmark is labelled
"legal" and holds what discharges ЗЕТ чл. 4, which a page of published figures is
not. `/how/` does not link to itself, the rule the four document links follow.
`verify_render_layout.mjs` §"the country page is reachable without opening
anything" and
§"every page carries a route to the country page, except itself" hold all of it.
One link, because a second to the same page is navigation noise.

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

**The bilingual DOM stays.** The live page carries both languages at once, as
`<span class="l-bg">` / `<span class="l-en">` hidden by the rule in
`tokens.css`, and the toggle switches between them without a navigation. That
is one URL answering in two languages, so `hreflang` is not expressible — there
is no second URL to point at, which is why `index.html`'s comment above
`og:locale:alternate` says the alternate locale buys an unfurler a language it
can read and is not an `hreflang` pair. It still splits the page's topical
signal, and undoing it is an architecture decision rather than an SEO one.

What the cost is now paid by is the toggle rather than the served document —
see the section below.

## Open questions

**IndexNow.** Bing and Yandex accept a ping when content changes, and this
site's sitemap `lastmod` moves on every pipeline refresh with nothing telling
anyone. There is no deploy job in `.github/workflows/ci.yml`, and hosting the
build is the operator's decision — this repository describes the code and
deliberately not one machine (`principles.md` §"Identity"). So it is either a
documented operator action or a new opt-in workflow, and which one is a
question for whoever runs the deployment.

## Cross-references

- [`site.md`](./site.md) — the SPA module by module, and the five build entries
- [`principles.md`](./principles.md) — P3, P4 and the closed list
- `site/public/robots.txt` — the crawler policy, with its reasoning inline
- `site/scripts/prerender.mjs` — the build step, what it reads and what it refuses to emit
