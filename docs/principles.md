# Product principles — what Вярно is, and what is closed

**Read this before proposing a feature.** P1–P11 below are cited by identifier
throughout the codebase — `view.js` says "a projection and must be labelled as
one (P5)", `calculator.svelte.js` says "no unsourced defaults (P7)",
`content.js` and the verify suites do the same. The numbers are therefore
stable names, not an ordering. Each principle has already killed a plausible
feature; a proposal that violates one is wrong, and the principle is not.

Who the product is for, and the five properties every number on the screen has
to satisfy, are in [`README.md`](./README.md) §"Who this is for".

## Identity

- **Product:** Вярно / vyarno.bg — «икономиката, честно». A calculator that
  measures Bulgaria's official statistics against one household's own numbers:
  personal inflation, real wage, salary percentile, the tax wedge, rent,
  savings and the path to a home. **A public good: open source
  (Apache-2.0), free to every visitor, and nothing is sold.** No paid tier, no
  donor tier, no feature gating, no billing code. This is what the project *is*,
  not a stage before monetisation — a change that makes any functionality
  conditional on payment or supporter status does not get merged
  (`CONTRIBUTING.md`, and a checkbox in the PR template).
- **Sustained by donations**, which are gratuitous and buy nothing.
  `site/src/lib/support.js` carries the rules about how they may be asked for —
  two static surfaces (the footer line and the explainer's «Кой плаща за
  това?») pointing at `/support/`, no amounts in shipped copy, nothing
  conditioned on use, nothing given in return — and
  `site/scripts/verify_support.mjs` enforces them, including the count: it
  holds the list of files allowed to import that module, so a third surface is
  a red test rather than one more import. Rule 4 (nothing in
  return) is load-bearing legally: attaching any benefit to a donation makes the
  service възмездна and flips `LEGAL_FORM.takesPayment`, which pulls in the rest
  of ЗЕТ чл. 4.
- **Architecture:** a static SPA fetches versioned JSON from `data/published/`.
  A Python pipeline pulls from Eurostat / ЕЦБ / БНБ / имот.bg / НСИ, runs
  validation gates, and writes the JSON. Running that pipeline on a schedule,
  and hosting the build, are the operator's decisions — this repository
  describes the code and deliberately not one machine.
  [`architecture.md`](./architecture.md) is the system map.
- **A consumer's own figures never leave their device**, and the calculator
  works as a static page with no server. **"No backend" is not part of the
  promise** — a server may exist for anything that touches no consumer figure.
  There is no request-time backend, and no design document for one; P1 and P8
  below are the boundary any such thing would have to respect.
- **Tenet:** every number traces to an official upstream series via a verifiable
  URL inside the published JSON. No bluff. Nothing third-party is loaded to
  render it either — no CDN script, no hosted font, no analytics pixel; the CSP
  in `site/public/_headers` is what makes that checkable rather than merely
  intended ([`site.md`](./site.md) §"Conventions for anyone touching `site/`").
- **Licensing, and the one distinction that matters.** The CODE is openly
  licensed (Apache-2.0). **The FIGURES in `data/published/` are not ours to
  license** — they belong to Eurostat, the ЕЦБ, БНБ, НСИ and имот.bg under each
  publisher's own terms, and НСИ's terms forbid redistributing derived and
  composite works outright. Never write copy, docs or a badge describing the
  *data* as open. [`legal.md`](./legal.md) §"Our own licence" has the full
  reasoning and names the test that enforces it.
- **The footer's upstream attribution «Данни от Евростат / ЕЦБ / НСИ / БНБ /
  имот.bg» is a licence condition** of several upstreams *and* the credibility
  claim. Guarded by `test_footer_credits_every_upstream_we_use` in both
  languages; removing a source name to shorten the line is never a cleanup.

## Open source — what the code owes the people reading it

Вярно is Apache-2.0 and the code is written to be read. This section is what an
open licence **obliges**.

**There is no moat and no attempt at one.** The pipeline's gates, the ECOICOP
join, the transforms and the connectors are all readable, deliberately.
Minification and identifier mangling happen because bundlers do that anyway;
they are not protection and must never be described as such. Nothing in this
repository is treated as secret, and nothing should be — **do not introduce a
confidentiality posture by habit.**

Two obligations follow, and neither is about secrecy.

### The privacy boundary

**A consumer's own figures never leave their device.** Salary, rent, savings and
basket are computed in `mirror.js`, client-side, and posted nowhere. Keep
consumer arithmetic in the browser.

> Open source makes this claim *checkable* rather than merely stated. "Your
> numbers never leave your device" is something a reader can confirm by reading
> `mirror.js` and the network tab, instead of trusting us. That is worth
> protecting: **a change that moves consumer arithmetic server-side breaks the
> promise and the proof of it at once.** Do not reopen without reopening the
> privacy notice.

Anything genuinely novel that must run server-side — a benchmarking model, a
scoring method — is designed server-side from the start, for the ordinary
reason that retrofitting the boundary is a rewrite.

### Publish the method

The verify links point at the upstream cubes **by design**, and the in-app
explainer deliberately teaches the method. That is what the project is for.

> **Nothing may degrade the explainer, the verify links or the source
> captions.** A change that makes the product less checkable has the trade
> backwards.

### Hard rules — these fail a review

1. **A new upstream connector ships with its licence terms** read, quoted
   verbatim and dated in [`legal.md`](./legal.md), **and added to
   `site/src/lib/legal.js#UPSTREAMS`**, in the same commit. `verify_legal.mjs`
   fails if the sources page and the footer disagree. **Do not assert a licence
   you have not read.** The connector checklist is in
   [`data-sources.md`](./data-sources.md) §"Checklist for adding a connector".

2. **Never describe the FIGURES as openly licensed.** Identity above, and
   [`legal.md`](./legal.md) §"Our own licence" for the reasoning and the test.

3. **No feature is gated, ever.** No paid tier, no donor tier, no supporter
   badge, no early access. Beyond the project's stated purpose, rule 4 in
   `site/src/lib/support.js` explains the legal mechanism: anything given in
   return for a donation makes the service възмездна and flips
   `LEGAL_FORM.takesPayment`. `verify_support.mjs` fails the build on copy that
   would announce such a thing.

4. **The published legal identity must be true for the legal form we actually
   are**, and `npm run build:release` fails when it is not.
   [`legal.md`](./legal.md) §"The published identity (ЗЕТ чл. 4)" has the rule
   and the two ways people try to silence it.

5. **Source maps stay out of the deploy artefact**, and
   `site/.sourcemaps/` is never committed. [`site.md`](./site.md) §"Source maps
   stay out of the deploy artefact" has the reasoning and the test.

## Product principles — P1 to P11

| # | Principle |
|---|---|
| **P1** | **A consumer's own figures never leave their device.** Salary, rent, savings and basket exist only in their tab. We do not transmit, store, or hold anything that could reconstruct them. *"No backend" is not part of the promise* — a server may exist for anything that touches no consumer figure. |
| **P1a** | **A consumer never needs an account.** Everything the calculator does, it does for an anonymous visitor. If a feature only works once someone identifies themselves, it is not a consumer feature. |
| **P2** | **A shared number must not reconstruct a private one.** `extraPerMonth = salary × π/(100+π)` inverts exactly, so a € absolute beside the percentage it came from reveals the salary. **A rank is not automatically safe either** — `percentile` interpolates over rungs published in `data/published/`, so "ahead of 34%" inverts to the pay just as surely and carries no currency symbol to warn you. Share surfaces carry a rate over a basket, the published national rate, category names and dates. `view.js#sharePayload` is where the list is closed, and it takes no salary. Check every new card against the inversion, not against intent. |
| **P3** | **Every number is sourced, dated and clickable** — including numbers derived from published numbers, which inherit the obligation and must name their inputs and their `as_of`. A chart axis is a number. |
| **P4** | **Freshest possible, never silently stale.** The live cube, not the archived one. `as_of` is surfaced. Anything pinned to a snapshot shows its date prominently. |
| **P5** | **A projection is not a measurement and must be labelled as one.** "Your savings lost €X since 2020" is arithmetic over published indices; "will lose €Y by 2029" is an assumption. Both are allowed; only the first may be stated in the same voice as a Eurostat figure. |
| **P6** | **We describe, we do not advise.** "You spend 26% on transport; the national basket is 14.3%" is data. "You should drive less" is advice. The strongest honest form is a comparison plus a number. |
| **P7** | **No unsourced defaults, no flattering defaults.** The raise field stays blank rather than pre-filled with an invented wage index. The affordability line stays at 30% of net — stricter than the 50% БНБ permits and the ~38.5% BG borrowers carry. |
| **P8** | **Consumer math in the browser; reference math at build time.** The pipeline gates and publishes reference data; `mirror.js` is the only place a *consumer's* math happens, and it happens in their browser. New consumer features add pure functions there with a test in `verify_mirror_math.mjs` — never a fetch of the user's inputs. |
| **P9** | **Verifiability scales down, not away.** If a format physically cannot carry a link, it carries the source name, the date and the domain. |
| **P10** | **No commercial relationship may change a number, a ranking or a default.** Which figure is shown, and how affordable a home looks, cannot depend on who is paying. Nothing is sold and there is nothing to implement. |
| **P11** | **A figure nobody publishes is uncomputed, not concealed.** Where the site derives something an agency could have published and did not — the tax wedge is the shipped example — the framing is "this is computable from the official data and nobody has computed it for you", never "they do not want you to see it". Where an agency has a stated methodological reason, give it; where we cannot tell, say so in one line. Guarded by `verify_copy.mjs`. |

**The calculator must keep working as a static page with no server.** A
request-time server may exist beside it and may do anything touching **no
consumer figure** — an admin surface, an API over the published payloads, a
metering endpoint. There is no such server today and no design document for one;
if one is ever wanted, P1 and P8 are the boundary it has to respect, and the
thing to write down at that point is which side of the line each capability
lands on.

## What is closed — and these are constraints, not preferences

Each of these breaks a promise the site makes to the person using it. Effort and
margin are irrelevant to them, and none is an open question.

| Idea | Why not |
|---|---|
| Crowd-sourced "average real basket" from users | Requires collecting personal spending on a server. P1. The privacy-preserving version — comparing your basket to the *official* one, locally — is what the site already does |
| Accounts, saved profiles, email capture, cross-device sync | Same. "Remember my basket **across devices**" is the one-line request that converts a client-side convenience into a server-side store of somebody's spending pattern — a new decision against P1, not an extension of the local one |
| **Session recording, or any measurement that can see what a consumer typed** | P1 without qualification. A replay of the calculator is a recording of somebody's salary being entered |
| **Selling, sharing or brokering user data** | P1. There is nothing to sell — we hold nothing — and building the capability in order to sell it is what P1 exists to prevent |
| **Any commercial relationship that changes a number** | P10. If money could alter which figure is shown, which lender appears, or how affordable a home looks, it is declined regardless of margin |
| Advice ("cut your spending on X", "refinance now") | P6 |
| Loosening the 30%-of-net affordability line | P7. Homes do not become affordable because a calculator says so |
| A consumer account required to see your own number | P1a |
| Any € absolute on a shareable image beside the percentage it inverts | P2 |
| **A salary percentile on a share surface** | P2. The rungs it is read off are published in `data/published/`, so a rank inverts to the pay to within a rung's width. It looks safe because it carries no currency symbol, which is what makes it worth naming here |
| **A sector pay gap on a share surface** | P2, and it inverts harder than the percentile above. The rank is bounded by a rung's width; a gap divides by one of twenty averages published in `sector_salary.json`, so "18% below Information and communication" is one net wage to the euro — and naming the sector has already narrowed the sender to one of the nineteen sections `view.js#sectorOptions` offers (НСИ's twentieth row is the all-activities total, which is not a sector and is not in the picker). `view.js#sharePayload` takes no sector, which is what makes it unexpressible rather than merely disallowed |
| **A salary percentile *within* a sector, anywhere** | Not a privacy rule — there is no such figure. Nobody publishes a pay distribution by economic activity for Bulgaria: Eurostat's `earn_ses_monthly` carries no NACE section for BG at all — its five `nace_r2` categories are broad groupings, the finest lumping section J with seven others, and only the whole-economy one is populated at the 2022 vintage (probed 2026-08-06). So the sector card compares against an average and says on screen that it is doing so. `mirror.js#meanRungPosition` gives the reader the national correction — a mean sits near the 66th rung — and deliberately accepts no anchor, so it cannot be turned into the sector rank it is there to substitute for |
| **A personal tax-wedge rate on a share surface** | P2. Below the insurance ceiling the effective rate is a constant and says nothing about the reader; above it the rate falls with every extra euro of gross, so it names the salary. The *system* curve — what the wedge is at €1,000 and at €5,000 — is built from published parameters and carries no personal figure at all, and is the one version of this that is open |
| **An OG-image URL with the reader's figures in its query string** | P1. Rendering one needs a server that sees the numbers on fetch, and the link carries them past every unfurler, referrer header and CDN log between the sender and whoever opens it. The client-side canvas in `share-card.js` is the version that keeps the promise |
| **A share count, a click event or a campaign parameter on an outgoing share** | P1. A measurement fired at the moment a basket is shared is a measurement that can see what somebody typed. We do not find out whether sharing works, and that is the trade rather than an oversight |
| A second headline number (НСИ CPI alongside HICP) | Two competing headlines confuse. The distinction is explained in plain language instead ([`math.md`](./math.md)) — an editorial call rather than a promise, and the only row here that could be revisited |

**Funding is decided, not open.** Вярно is a public good sustained by donations:
Apache-2.0, every feature free to everyone, no paid tier, no donor tier, no
billing code. Do not add pricing, billing, paywall or advertising code, copy or
docs. Donations buy nothing — no supporter tier, no badge, no early access, no
ad-free mode — because anything given in return makes the service възмездна,
flips `LEGAL_FORM.takesPayment` and pulls in the rest of ЗЕТ чл. 4
(`site/src/lib/support.js` rule 4, enforced by `verify_support.mjs`).

**How it may be asked is decided too, and the ceiling is two.** The footer
line, one answer inside the explainer's closed disclosure, and `/support/`
behind both. No modal, no interstitial, no toast, no banner, no sticky bar, no
floating button, nothing conditioned on how often somebody has used the site,
and nothing that moves. The reasoning, and what a third surface would cost, is
written out in `support.js` rule 1; raising the ceiling means amending that
rule and the allowlist in `verify_support.mjs` in the same commit, which is the
point of holding the count in a test rather than in a sentence. A grant
that came with a condition touching the table above is declined on those
grounds rather than negotiated.

## Cross-references

- [`README.md`](./README.md) §"Who this is for" — the reader, and the five
  properties every published number satisfies
- [`legal.md`](./legal.md) — each publisher's terms quoted verbatim and dated,
  our own licence, and the published ЗЕТ чл. 4 identity
- [`site.md`](./site.md) — where each of these principles is enforced in the SPA
- [`../AGENTS.md`](../AGENTS.md) — the boundaries in their operative, one-line
  form
