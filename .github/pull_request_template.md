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

- [ ] `make check` passes — or `cd site && npm run check:all`, which runs the
      same sequence. The render suite reports **15 passed**, and a green **0**
      means it found no browser rather than that it passed
- [ ] New or changed user-facing copy is written in **both** BG and EN
      (a missing string renders as a blank line, not a fallback)
- [ ] This adds no paid tier, donor tier, feature gate or any functionality
      conditional on payment or supporter status

## If this touches a data source

- [ ] The publisher's reuse terms are quoted **verbatim, in the original
      language, with the date read** in `docs/legal.md`
- [ ] `site/src/lib/legal.js#UPSTREAMS` updated in this same commit
