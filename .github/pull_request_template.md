# What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!--
The reasoning, not the diff. If this reverses an earlier decision, say which
one and why — several files in this repo carry "do not re-litigate this"
comments precisely so the reasoning survives the person who had it.

If a coding agent wrote a substantial part, one line saying so belongs here.
It tells a reviewer where to look hardest — see CONTRIBUTING.md.
-->

## Does this change a published number?

- [ ] No — code, docs, styling or tooling only
- [ ] Yes — and I have said which number, from which source, below

<!--
If yes: which figure, which upstream series, and the link. A number-changing PR
without its source link cannot be reviewed, only trusted.
-->

## Checks

- [ ] `make check` passes — or, by hand:
- [ ] `cd pipeline && pytest -q` passes
- [ ] `cd site && npm run verify:math` passes
- [ ] `cd site && npm run build` passes
- [ ] `cd site && npm run test:render` reports **15 passed** — the only suite
      that runs the app, and 15 *skipped* also exits 0
- [ ] New or changed user-facing copy is written in **both** BG and EN
      (a missing string renders as a blank line, not a fallback)

## If this touches a data source

- [ ] The publisher's reuse terms are quoted **verbatim, in the original
      language, with the date read** in `docs/legal.md`
- [ ] `site/src/lib/legal.js#UPSTREAMS` updated in this same commit

## Confirmations

- [ ] This adds no paid tier, donor tier, feature gate or any functionality
      conditional on payment or supporter status
- [ ] Nothing here describes the **figures** in `data/published/` as openly
      licensed — the code is Apache-2.0, the data is not ours to license
      (see `NOTICE`)
- [ ] No secrets, keys, tokens or personal addresses are committed
- [ ] Every commit is signed off (`git commit -s`) — the Developer Certificate
      of Origin, see `CONTRIBUTING.md` §"Licensing of contributions"
