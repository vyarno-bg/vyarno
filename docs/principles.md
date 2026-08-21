# Product principles — what Вярно is, and what is closed

**Read this before proposing a feature.** P1–P11 below are cited by identifier
throughout the codebase — `view/spend.js` says "a projection and must be
labelled as one (P5)", `calculator.svelte.js` says "no unsourced defaults (P7)",
`content.js` and the verify suites do the same. The numbers are therefore
stable names, not an ordering. Each principle has already killed a plausible
feature; a proposal that violates one is wrong, and the principle is not.

Who the product is for, and the five properties every number on the screen has
to satisfy, are in [`README.md`](./README.md) §"Who this is for".

## Identity

- **Product:** Вярно / vyarno.bg — «икономиката, честно». A calculator that
  measures Bulgaria's official statistics against one household's own numbers:
  personal inflation, real wage, salary percentile, the tax wedge, rent,
  savings and the path to a home. **Open source (Apache-2.0), and everything
  it publishes today is free to every visitor.** Nothing is sold at present,
  `LEGAL_FORM.takesPayment` says so, and `check-identity.mjs` holds the two in
  agreement.
  **That is a description of today and not a promise about every future**, for
  the reason [`legal.md`](./legal.md) gives about the same claim: a decision
  recorded in a repository is one that can be revisited, and writing "and never
  will be" is an overclaim that costs the credibility of the sentences beside
  it. What a paid surface would owe is §"Charging for something" below; how the
  site is paid for otherwise is §"What is closed".
- **Sustained by donations today, and not by them alone indefinitely** — see
  §"What is closed" on what an advertiser may and may not buy. Donations
  themselves are gratuitous and buy nothing.
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
  render it either — no CDN script, no hosted font, no pixel. **The CSP's origin
  list is the closed list**, and it holds exactly two: our own origin and
  `plausible.io`, which counts visits and is described in the privacy notice's
  own section. A third is a decision priced in three edits — the header, the
  notice, a version bump — and `verify_static_assets.mjs` pins the two lists as
  literals so it cannot be made quietly
  ([`site.md`](./site.md) §"Conventions for anyone touching `site/`").
- **Licensing, and the one distinction that matters.** The CODE is openly
  licensed (Apache-2.0). **The FIGURES in `data/published/` are not ours to
  license** — they belong to Eurostat, the ЕЦБ, БНБ, НСИ and имот.bg under each
  publisher's own terms, and НСИ's terms forbid redistributing derived and
  composite works outright. Never write copy, docs or a badge describing the
  *data* as open. [`legal.md`](./legal.md) §"Our own licence" has the full
  reasoning and names the test that enforces it.
- **The footer's upstream attribution «Данни от Евростат / ЕЦБ / НСИ / БНБ /
  имот.bg» is a licence condition** of several upstreams *and* the credibility
  claim. Guarded by `the_footer_credits_every_upstream_the_pipeline_pulls_from` in both
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

3. **A donation buys nothing, whatever else the project may sell.** No
   supporter tier, no donor badge, no early access, no ad-free mode. This rule
   rests on legal mechanics rather than on taste: a донация under ЗЗД is
   gratuitous, so attaching any benefit to giving converts the gift into
   възнаграждение **for the whole service** and flips
   `LEGAL_FORM.takesPayment` without anybody having decided to sell anything.
   `support.js` rule 4 carries the reasoning and `verify_support.mjs` fails the
   build on copy that would announce such a thing. Selling a product is the
   separate and permitted thing (§"Charging for something"), and routing it
   past the donation channel is what keeps that channel legally simple.

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
| **P1** | **A consumer's own figures never leave their device, unless they have asked for something that cannot be answered on it.** Salary, rent, savings and basket are computed in the reader's own tab, and the free calculator transmits none of them. *"No backend" is not part of the promise* — a server may exist for anything that touches no consumer figure, and a feature that genuinely needs one (a model, a scoring method) is permitted on the terms in §"Charging for something": asked for per use, covered by the privacy notice **before** it ships, and never a silent re-routing of arithmetic that already ran locally. The last clause is the one that carries the weight: the promise is checkable because a reader can watch the network tab, and a feature that quietly posts what used to stay local breaks the proof rather than the policy. |
| **P1a** | **The free calculator never needs an account.** Everything it does today, it does for an anonymous visitor, and putting a figure it already shows behind a sign-in is a regression rather than a product decision. A paid surface may require an account, for the ordinary reason that somebody has to be billed; what it may not do is take the anonymous route away from what was already free. |
| **P2** | **A shared number must not reconstruct a private one.** `extraPerMonth = salary × π/(100+π)` inverts exactly, so a € absolute beside the percentage it came from reveals the salary. **A rank is not automatically safe either** — `percentile` interpolates over rungs published in `data/published/`, so "ahead of 34%" inverts to the pay just as surely and carries no currency symbol to warn you. `SHARE_FIELDS` is the closed list of what may travel — rates, the anchor and its period, the leading division by name and contribution, the domain — and it carries no salary, no euro figure and no rank. `view/share.js#sharePayload` is where the list is closed, and it takes no salary. Check every new card against the inversion, not against intent. |
| **P3** | **Every number is sourced, dated and clickable** — including numbers derived from published numbers, which inherit the obligation and must name their inputs and their `as_of`. A chart axis is a number. |
| **P4** | **Freshest possible, never silently stale.** The live cube, not the archived one. `as_of` is surfaced. Anything pinned to a snapshot shows its date prominently. |
| **P5** | **A projection is not a measurement and must be labelled as one.** "Your savings lost €X since 2020" is arithmetic over published indices; "will lose €Y by 2029" is an assumption. Both are allowed; only the first may be stated in the same voice as a Eurostat figure. |
| **P6** | **We describe, we do not advise.** "You spend 26% on transport; the national basket is 14.3%" is data. "You should drive less" is advice. The strongest honest form is a comparison plus a number. |
| **P7** | **No unsourced defaults, no flattering defaults.** The raise field stays blank rather than pre-filled with an invented wage index. The affordability line stays at 30% of net — stricter than the 50% БНБ permits and the ~38.5% BG borrowers carry. |
| **P8** | **Consumer math in the browser; reference math at build time.** The pipeline gates and publishes reference data; `mirror.js` is the only place a *consumer's* math happens, and it happens in their browser. New consumer features add pure functions there with a test in `verify_mirror_math.mjs` — never a fetch of the user's inputs. |
| **P9** | **Verifiability scales down, not away.** If a format physically cannot carry a link, it carries the source name, the date and the domain. |
| **P10** | **No commercial relationship may change a number, a ranking or a default.** Which figure is shown, which lender appears, and how affordable a home looks cannot depend on who is paying. This is the principle advertising has to be built around rather than one it retires: the moment an advertiser can move a figure, every other number on the page is worth less, including the ones nobody paid for. An offer conditioned on any of the three is declined on those grounds, whatever it is worth. |
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
| Accounts, saved profiles, email capture, cross-device sync | Same. "Remember my basket **across devices**" is the one-line request that converts a client-side convenience into a server-side store of somebody's spending pattern — a new decision against P1, not an extension of the local one. The local half is what the `vyarno_inputs` switch does, and the boundary is the word *devices*: it writes to the reader's own `localStorage`, off until they turn it on, and no request carries it. An account that exists to bill somebody is not this row: what P1 guards is the spending pattern, not the identity |
| **Session recording, or any measurement that can see what a consumer typed** | P1 without qualification. A replay of the calculator is a recording of somebody's salary being entered. **The visit counter is the line, not a step towards it**: `site/src/lib/analytics.js` sends the pageview the loaded script sends by itself, calls `window.plausible(...)` nowhere, and `verify_analytics.mjs` fails on a call appearing. A custom event is the one edit that could carry a figure off the device, so it is refused as a class rather than judged per event |
| **A second measurer, a pixel, a tag manager, or an analytics product that sets an identifier** | The counter was admitted on properties, not on need: no cookie, no storage write, no identifier that survives 24 hours, no cross-site join, EU-only processing, and an opt-out the reader controls. Anything that fails one of those is a different decision and gets argued as one. Two measurers also make the notice's "exactly one thing that is not our code" false, which is a sentence a reader can check |
| **Selling, sharing or brokering user data** | P1. There is nothing to sell — we hold nothing — and building the capability in order to sell it is what P1 exists to prevent |
| **Any commercial relationship that changes a number** | P10. If money could alter which figure is shown, which lender appears, or how affordable a home looks, it is declined regardless of margin |
| Advice ("cut your spending on X", "refinance now") | P6 |
| Loosening the 30%-of-net affordability line | P7. Homes do not become affordable because a calculator says so |
| A sign-in required to see a number that was already free | P1a. An account carried by a paid surface is a different question and is open |
| Any € absolute on a shareable image beside the percentage it inverts | P2 |
| **A salary percentile on a share surface** | P2. The rungs it is read off are published in `data/published/`, so a rank inverts to the pay to within a rung's width. It looks safe because it carries no currency symbol, which is what makes it worth naming here |
| **A sector pay gap on a share surface** | P2, and it inverts harder than the percentile above. The rank is bounded by a rung's width; a gap divides by one of twenty averages published in `sector_salary.json`, so "18% below Information and communication" is one net wage to the euro — and naming the sector has already narrowed the sender to one of the nineteen sections `view/payroll.js#sectorOptions` offers (НСИ's twentieth row is the all-activities total, which is not a sector and is not in the picker). `view/share.js#sharePayload` takes no sector, which is what makes it unexpressible rather than merely disallowed |
| **A salary percentile *within* a sector, anywhere** | Not a privacy rule — there is no such figure. Nobody publishes a pay distribution by economic activity for Bulgaria: Eurostat's `earn_ses_monthly` carries no NACE section for BG at all — its five `nace_r2` categories are broad groupings, the finest lumping section J with seven others, and only the whole-economy one is populated at the 2022 vintage (probed 2026-08-06). So the sector card compares against an average and says on screen that it is doing so. `mirror.js#meanRungPosition` gives the reader the national correction — a mean sits near the 66th rung — and deliberately accepts no anchor, so it cannot be turned into the sector rank it is there to substitute for |
| **A personal tax-wedge rate on a share surface** | P2. Below the insurance ceiling the effective rate is a constant and says nothing about the reader; above it the rate falls with every extra euro of gross, so it names the salary. The *system* curve — what the wedge is at €1,000 and at €5,000 — is built from published parameters and carries no personal figure at all, and is the one version of this that is open |
| **An OG-image URL with the reader's figures in its query string** | P1. Rendering one needs a server that sees the numbers on fetch, and the link carries them past every unfurler, referrer header and CDN log between the sender and whoever opens it. The client-side canvas in `share-card.js` is the version that keeps the promise |
| **A share count, a click event or a campaign parameter on an outgoing share** | P1. A measurement fired at the moment a basket is shared is a measurement that can see what somebody typed. We do not find out whether sharing works, and that is the trade rather than an oversight |
| A second headline number (НСИ CPI alongside HICP) | Two competing headlines confuse. The distinction is explained in plain language instead ([`math.md`](./math.md)) — an editorial call rather than a promise, and the only row here that could be revisited |

**Donations buy nothing, and that is a rule about donations rather than about
revenue.** No supporter tier, no badge, no early access, no ad-free mode,
because anything given in return makes the service възмездна, flips
`LEGAL_FORM.takesPayment` and pulls in the rest of ЗЕТ чл. 4
(`site/src/lib/support.js` rule 4, enforced by `verify_support.mjs`). Selling a
product does not go through that channel and does not disturb it.

## Charging for something

**Nothing here forbids it and the machinery is already built.** `IDENTITY` rows
carry `dueWhen: "always" | "paid" | "vat"`, `identityRows()` publishes the ones
the current form owes, and `verify_legal.mjs` already tests the paid path. What
follows is what a paid surface costs on the day somebody ships one, in the order
the build asks for it.

1. **`LEGAL_FORM.takesPayment` flips in the same commit as the first price.**
   `check-identity.mjs` blocks a release where shipped copy names a price while
   the flag still says the service is free, and it blocks the other direction
   too: flipping the flag makes the ЗЕТ чл. 4 register-entry row due and holds
   the release until that row carries a value. Neither failure is an obstacle to
   route around. Each names a disclosure the law attaches to the decision.
   **Four shipped strings move in that same commit**, and they are the easiest
   thing on this list to miss because each reads as marketing: `SUPPORT_COPY`'s
   three answers about who pays, and the Terms-of-Use clause in `legal.js`
   («няма платена версия, няма заключени функции») — which is a term of the
   agreement with the reader, so `LEGAL_VERSION` moves with it. They are written
   in the present tense on purpose: they state what is true today rather than
   promising a future, and that is what keeps them cheap to change.
2. **A register entry needs something to enter.** `LEGAL_FORM.id` is
   `natural_person`. ЗДДС registration is owed above €51,130 a year, which
   flips `vatRegistered` and publishes a ninth row.
3. **The privacy notice covers the server before the feature reaches it.** A
   paid calculation running off the device processes what the reader typed,
   which is what today's notice says does not happen. The notice and
   `LEGAL_VERSION` move in the release that ships the feature, never after it.
4. **P1, P2 and P10 do not relax, and none of them costs revenue.** The free
   calculator keeps computing locally, a share surface still may not carry a
   figure that inverts to somebody's pay, and no advertiser or buyer moves a
   number. P10 is the one to state plainly to anyone negotiating: the moment a
   figure can be bought, every other figure on the page is worth less,
   including the ones nobody paid for.
5. **The price is visible before the reader commits**, in both languages. ЗЕТ
   чл. 5-6 is the settled half of what else attaches: a търговско съобщение has
   to be identifiable as one and has to name whose it is. The consumer-protection
   questions around distance selling are answered in writing by whoever ships
   the first paid surface, on the same footing as the ЗКНИП question in
   `legal.js` §Advertising: this file does not pre-answer them.

**None of the five is permission, because none is needed.** A paid tier, an
advertisement, a data feed and an enterprise edition are decisions for the
copyright holder. What this section records is what each owes the reader, so the
decision is priced rather than argued.

**Advertising is open, and P10 is what it may not buy.** Donations are not
expected to carry the site alone, so an advertiser paying is a live option and
nothing in this repository should be written as though it were closed. What does
not move is P10: which figure is shown, which lender appears and how affordable a
home looks may not depend on who is paying, and an offer conditioned on any of
them is declined on those grounds rather than negotiated. Three things land with
the first ad and belong in its own release, not after it — ЗЕТ чл. 5-6 labelling
so a търговско съобщение is identifiable on sight and names whose it is, a
section in the privacy notice if the ad reaches the reader's browser from
anywhere but our own origin (the CSP's origin list is the closed list, and it
holds two), and the ЗКНИП question in `legal.js` §Advertising, which is sharpest
for a lender's placement beside a mortgage figure and is answered by whoever
places one.

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
