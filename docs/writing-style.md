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

`.github/pull_request_template.md` asks five things — the last only where a
data source is touched. Answer those and stop.
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
- **A date, a year or a count never goes into a sentence when a payload carries
  it.** «медианата на 143-те софийски квартала», «изследване на Евростат от
  2022 г.», «Вярно 2026» — each was true when typed and each is a claim the data
  beside it goes on to contradict, silently, because nothing recomputes prose.
  Write the slot and fill it at render. A worked example is the exception and
  reads as one: «ако индексът в края на 2020 г. е 115» asserts nothing about
  today. `verify_copy.mjs` §"no prose freezes a date or a count the payloads
  already carry" checks it against the currently published values.
- **The Bulgarian is the original, not a translation of the English.** Write it
  as somebody would say it out loud: «сметката се прави в браузъра ти», not
  «сметката се случва в браузъра ти» — «се случва» is "happens" carried across
  word for word, and a calque reads as translated even when every word in it is
  already Bulgarian. Grammar the copy cannot dodge belongs in a formatter, not in
  the string — the day of the month takes four different ordinal endings
  (`format.js#ordinalDay`) and «закъсняло»/«закъснели» is a second sentence
  rather than a substituted number.
- No emoji. Not in headings, commits, UI, code or PR bodies. Nothing in the
  tree has one today.
- No gradient-and-glow decoration in the SPA either, and no badge that nothing
  measures. `docs/principles.md` is the perimeter.

### Sentence length is a review note, and there is no ceiling on it

A cap on words per sentence would cost one line. `verify_copy.mjs` already
flattens `Market.svelte` and splits it on `[.!?]` to run the verdict rule, so
the machinery is sitting there. **It stays a review note**, for three reasons
worth reading before anybody adds the line.

**A cap set where the prose sits today codifies today's prose.** Set it above
the longest sentence currently on a page and it fires on nothing, which is a
gate that reports green for work it never looked at. Set it lower and the first
thing it catches is a sentence that has earned its length: «наред с останалото
ги питат и какво е жилището, в което са: тяхно и изплатено, тяхно, но с кредит
по него, или под наем» is a list of three tenure states and splitting it breaks
the parallel that makes the three readable as one set.

**The measurement is not well defined over these files.** A paragraph in the
SPA is `.l-bg` / `.l-en` spans with `{slot}` expressions inside them, and
headings, nav links and column labels sit between paragraphs in source order.
Flatten that and a contents list runs into the heading under it and reports as
one sentence of forty words that nobody wrote. A gate that invents its own
offenders is one a contributor learns to argue with rather than read, which is
the same ground §"Write the constraint, never the diff" gives for leaving that
rule to review.

**Length is a symptom, and not the interesting one.** A sentence saying «повече
ли са жилищата» where the paragraph means «по-скъпи ли са» clears any ceiling at
twenty-six words, and it is the worse error of the two: it does not say what it
means, on the one comparison nobody else in the country publishes with a source
attached. The other direction fails too — a long sentence is usually long
because it is in the wrong layer, and a ceiling gets it cut to fit rather than
moved, which loses the reason it existed.

So what a reviewer reads a page for, in this order:

1. **Which layer is this sentence in?** `/market/` is the worked example and its
   hierarchy is load-bearing: `p.lead` is the answer, `p` is what the figure
   means, `p.ours` is «наша сметка» and the links that reproduce it, `p.cap` is
   the qualifications, and a `<details>` holds the numbers and the derivations.
   **A sentence about METHOD in body copy is in the wrong layer**, and moving it
   costs nothing while deleting it would cost the page a claim it has to keep
   making.

   The line between the two, because it decides what may be moved: **a caveat
   changes how the figure on screen should be read** — an asking price that is
   not a paid price, a mean that is not a middle, a smaller rise that is not a
   fall — and a reader who never sees it draws a wrong conclusion from a number
   they can see, so it stays beside that number whatever it costs in length.
   **Method is how the figure was produced**, and a reader who skips it draws no
   wrong conclusion at all. Where the two are in one paragraph, the caveat is
   usually one clause of it and the rest is the derivation.

   A caveat that qualifies nothing a reader can see is a third thing and the
   cheapest to lose: the year the base is set to, said once beside the chart
   that draws it, is a fact; said again under a strip whose own row labels
   carry it, it is a paragraph nobody finishes.
2. **Two ideas joined by a dash or a colon?** That is what most long sentences
   are, and splitting one loses nothing at all.
3. **An abstract noun used before it is explained?** «индекс», «съотношение»,
   «показател», «дял», «медиана», «отправна година». Each is explained where it
   is first used, or replaced with the thing it means.
4. **Read it out loud in Bulgarian.** It is the only one of the four that
   catches a word which is grammatical, ordinary and wrong.

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
3. Did you run what you claim you ran? A render count of skips is not a count
   of passes, and both exit 0.
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
