# Writing style — commits, pull requests, comments, docs

This file is the one list, and a rule changes here and nowhere else. `AGENTS.md`
carries the short form.

**Two files hold a condensed copy of the rules below, and that is deliberate
rather than an oversight to tidy up.** `CLAUDE.md` imports `AGENTS.md`, so it
forks nothing. `.cursor/rules/vyarno.mdc` and `.github/copilot-instructions.md`
cannot transclude a file — each tool reads only its own — and a pointer they
will not follow is guidance that does not arrive. So each carries an
abbreviated copy that names this file as the source, and the cost is real: the
copies can go stale, and they have. Change a rule here first, then propagate;
never the reverse, and never let a copy carry a rule this file does not.

The standard is a senior engineer writing to a colleague who is going to read
the diff anyway. Not a report to a manager, not a product announcement, and not
a summary of what just happened.

## The one test

**Would a reviewer learn something from this sentence that the diff does not
already tell them?** If no, delete the sentence. Most machine-written prose
fails exactly here: it restates the change in worse detail than the change.

## Commits

Subject line: imperative, sentence case, ≤72 characters, no full stop. An area
prefix (`site:`, `pipeline:`, `ci:`, `docs:`) is optional and earns its place
only when the change is confined to that area.

```
Derive CI's payload list from the SPA manifest instead of hardcoding it
pipeline: lock Python dependencies with pip-compile, hashes included
```

The body answers **why**: what was wrong before, what breaks if this is
reverted, what you rejected and what you ran. Length is not the problem —
commits in this history run twenty lines and every line is load-bearing.
Filler is the problem.

- **Name the failure.** "The `data` job listed the eight payload stems inline,
  so it went stale silently" beats "improves maintainability".
- **State what you ran, with counts.** "314 node:test, the production build,
  and the 15 render tests against real Chromium."
- **Say what you rejected.** "pip-compile, not uv: Dependabot's pip ecosystem
  does not support uv, which was the entire point."
- No `## Summary` / `## Changes` / `## Testing` scaffolding. A commit body is
  prose; use headings only when the change genuinely has parts.
- No bullet list reading back the file names. `git show --stat` does that.
- Never claim a suite passed that you did not run.

## Pull requests

`.github/pull_request_template.md` asks four things. Answer those and stop.
"What this changes" is one or two sentences; "Why" is the reasoning. Skip the
per-file walkthrough — the Files tab is the walkthrough.

Tick a checkbox only after doing the thing it claims. A number-changing PR
without its source link cannot be reviewed, only trusted.

## Code comments

This codebase comments the reasoning rather than the mechanics, sometimes at
length, and that is deliberate: a rule with no failure attached is one somebody
will reasonably decide to relax. The bar is not brevity. It is that the comment
says something the code cannot.

- **Comment the why.** `// 30% of net, deliberately stricter than the 50% БНБ
  permits`.
- **Never narrate the mechanics.** `// Loop over the categories` adds nothing a
  reader of the loop does not have.
- No divider banners, no `// ===== HELPERS =====`.
- No self-attribution: no "AI-generated", no "as requested", no author tags.
- A `TODO` carries a name or an issue number, or it is a wish.

### Write the constraint, never the diff

**No comment in this repository describes an earlier version of this code.**
`used to`, `no longer`, `previously`, `originally`, `left behind` and their kin
are the phrasings to catch in yourself, in comments and docstrings alike.

Nothing enforces this and that is deliberate. A regex over prose cannot tell
`// it used to be 92 days` from a comment that legitimately says a build
artefact holds code no longer in the tree, so the check that was here failed on
sentences that broke no rule — and a style gate that is wrong even occasionally
teaches a contributor to argue with the tooling rather than read the guidance.
It is a review note now. Nobody's contribution is turned away over one.

**This is the rule the repository breaks most often, and the reason is worth
knowing, because knowing it is most of the fix.** You break it while *editing*.
When you change something, the delta is the freshest thing in your head, and
the most natural sentence in the world is the one describing what you just did:
"it used to be 92 days", "the EN side used to read a bare number". The sentence
feels like reasoning because it contains the reasoning. It is a diff.

The test is not "is this true" — it usually is — but **who is it for**. A
reader arriving at this file next year needs to know what they may not do. What
somebody already did is not that, and this repository publishes without its
history, so they cannot even look the story up. The comment costs them
attention and returns nothing.

Every one of these converts, and the converted form is shorter:

| A diff | The constraint underneath it |
|---|---|
| `// It used to be 92 days, tracking the НСИ anchor` | `// SES publishes every four years, so a quarterly cadence here reports a payload nobody can refresh as overdue` |
| `// The EN side used to read "a {mort}/mo mortgage"` | `// Both sides carry the currency — a bare number is the one thing a reader has to guess at` |
| `// This assertion used to say the opposite` | `// The tempting argument for writing the default is that it makes the next visit stable. It does not:` |
| `// The line used to cite ilc_di01` | `// A dataset that sounds like it belongs puts no figure on the page` |

The recipe, when the check goes red: ask what the old version got **wrong**,
then write that as something the code has to keep doing. Keep the numbers, keep
the failure, keep the length — this repository comments reasoning on purpose
and the bar is not brevity. Drop the tense.

**Two things this does not ban.** Naming a bug the code could plausibly
reintroduce, which `testing-strategy.md` asks for — write it as the failure the
guard catches, not as an incident report. And `docs/legal.md`'s retractions,
which are dated records of what an upstream licence said and what a previous
reading of it got wrong: those are evidence, the document argues its own case
for keeping them, and it is exempt from the check.

## Docs and user-facing copy

- Headings are sentence case, in both languages.
- Open with the thing itself. No "In this section we will…", no "Let's dive
  into…".
- Specific numbers beat intensifiers: "±0.02 pp", not "a very tight tolerance".
- **Bold marks the non-negotiables** — the nevers, the gates, the conditions.
  It is not emphasis seasoning; do not scatter it across every third phrase.
- New user-facing copy is written in **both** BG and EN in the same commit. A
  missing string renders as a blank line, not a fallback.
- No emoji. Not in headings, commits, UI, code or PR bodies. Nothing in the
  tree has one today.
- No gradient-and-glow decoration in the SPA either, and no badge that nothing
  measures. `docs/principles.md` is the perimeter.

## The tells

Patterns that read as machine-written. Worth knowing by name, because they are
easy to produce without noticing.

| Tell | Looks like |
|---|---|
| Binary contrast | "This isn't a refactor. It's a rewrite." |
| Throat-clearing | "Here's the thing." "Let's take a look at…" |
| Colon reveal | "The best part: it validates on read." |
| Negative listing | "Not a framework. Not a library. A tool." |
| Dramatic fragmentation | "That's it. That's the whole change." |
| Closing summary | A last paragraph restating the paragraph above it |
| Transition stacking | "Additionally… Moreover… Furthermore…" |
| Importance puffery | "marks a significant milestone", "a robust solution" |
| Weasel attribution | "studies show", "it is widely considered" |
| Fake-strong verb | "serves as a centralized hub for" → "holds" |
| Rule of three | "fast, simple, and reliable" |
| Bulleting prose | Three connected sentences chopped into three bullets |
| Praise vocabulary | comprehensive, seamless, powerful, leverage, delve, robust |

"Successfully implemented X" is a status report to nobody. Say what X now does.

## What not to strip

An anti-slop pass that flattens the house voice has done damage, not good.

- **Em-dashes stay.** They are how this repo attaches a reason to a claim — the
  construction is on nearly every page and it is deliberate. Do not hunt them.
- **Long why-comments stay**, for the reason above.
- **The Bulgarian stays Bulgarian.** Do not anglicise «Икономиката, честно», the
  publisher names, or the footer attribution — that footer is a licence
  condition of several upstreams, not decoration (`docs/legal.md`).
- **Some repetition is the point.** The nevers in `AGENTS.md` are restated in
  `docs/principles.md` because an agent reads one or the other, not both.

## Before you commit

1. Read the subject alone. Does it say what changed?
2. Does the body say anything `git show --stat` does not?
3. Did you run what you claim you ran? A render count of 15 skipped is not 15
   passed, and both exit 0.
4. Any sentence you would not say out loud to a colleague? Cut it.
5. Scan the tells table against your own output.

## Sources

Adapted, not adopted — the rules above are tailored to this repository and two
of them deliberately contradict their source.

- [`yzhao062/agent-style`](https://github.com/yzhao062/agent-style), CC BY 4.0 —
  the generation-time model, and rules 03, 04, 08, A, D, E and H. Its RULE-B
  (avoid em-dashes) and RULE-G (title-case headings) are **not** adopted: both
  fight the house voice, which uses em-dashes structurally and sentence case
  throughout.
- [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop), MIT — the
  tell catalogue.
- [`yetone/kill-ai-slop`](https://github.com/yetone/kill-ai-slop), MIT — the
  no-emoji, no-gradient, no-unearned-badge line for the SPA.
