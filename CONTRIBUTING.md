# Contributing to Вярно

Thank you for being here. Вярно is a public-interest tool: free for everyone,
no paid version, no locked features. Anything that makes it more accurate, more
checkable or easier to use is welcome.

**The most valuable contribution is a wrong number.** If a figure on the site
looks wrong, open an issue before anything else. A civic tool that is confidently
wrong is worse than no tool, and you have found the bug that matters most.

## Ways to help, roughly by value

1. **Report an incorrect figure** — with the source and the reference date if
   you have them. Use the "Incorrect figure" issue template.
2. **Report a source that moved or broke.** Upstream publishers restructure
   their sites; a dead `source_url` is a real defect.
3. **Improve the Bulgarian copy.** The site is bilingual and Bulgarian is the
   primary language. Clumsy phrasing in BG is a bug.
4. **Accessibility and readability fixes.** Contrast, keyboard navigation,
   screen-reader labels.
5. **Code and documentation.**

You do not need to be a programmer to do 1–3, and they are the ones that keep
the project honest.

## Local setup

A fresh clone builds with only public dependencies. There is no private
registry, no licence key and no hidden step.

```bash
git clone https://github.com/vyarno-bg/vyarno.git
cd vyarno

# Pipeline (Python 3.11+)
cd pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && pip install -e . --no-deps
pytest -q

# Site (Node 22)
cd ../site
npm install
npm run dev            # http://localhost:5173
```

On Windows: `python -m venv .venv` and `.\.venv\Scripts\Activate.ps1`, and
`cd site && npm run check:all` where this page says `make check` — same
sequence, no `make` needed. CI runs the whole thing on `windows-latest` so it
stays that way —
[`docs/local-development.md`](./docs/local-development.md) §"On Windows".

Before opening a pull request, run what CI runs:

```bash
make check      # all of the below, in CI's order
```

Or by hand, if you would rather see the steps:

```bash
# Python: lint, layout, and the pipeline suite.
# Activate FIRST — ruff is installed into pipeline/.venv by the setup above and
# is not on PATH until then.
cd pipeline && source .venv/bin/activate
ruff check .. && ruff format --check ..
pytest -q

# Site: lint, types, the module suites, the build, and the built page
cd ../site
npm run lint && npm run check
npm run verify:math
npm run build && npm run test:render
```

`ruff`, `eslint`, `prettier` and `svelte-check` are configured — please do not
reformat around them or disable a rule without saying why in the same commit.
`npm run lint:fix` applies what is auto-fixable.

`npm run test:render` needs a Chromium. `make check` finds one for you —
Playwright's own, a system install, or whatever `VYARNO_CHROMIUM` names — and
fails if there is none, because run bare that suite skips and exits 0, and a
file of skips looks exactly like a file of passes. Where nothing resolves,
`cd site && npx playwright install chromium`. It is the only suite that runs
the app, so it is the one worth having.

`docs/local-development.md` has the longer version, including how to work
without network access, and `docs/testing-strategy.md` explains which suite a
new test belongs in.

## The one hard rule about data: never assert a licence you have not read

This is not a style preference. It exists because the project's whole claim is
that its numbers are checkable, and it has bitten before.

A new upstream source ships in the **same commit** as its terms — read, quoted
verbatim in the original language, and dated — in `docs/legal.md`, plus an entry
in `site/src/lib/legal.js#UPSTREAMS`. `verify_legal.mjs` fails if the sources
page and the footer disagree.

"It's public data, so it's probably fine" is exactly the reasoning this rule
exists to stop.

The connectors identify themselves honestly in the `User-Agent` and fetch on a
human cadence — a handful of requests per refresh, not a crawl. That is how the
existing five are written, and a new one that looks different should say why.

## The figures are not ours

The code is Apache-2.0. **The numbers in `data/published/` are not** — they
belong to Eurostat, the ЕЦБ, БНБ, НСИ and имот.bg under each publisher's terms.
See [`NOTICE`](./NOTICE).

Practically, for a contributor: do not add copy, documentation or a README
badge that describes the *data* as openly licensed, and do not add a feature
that redistributes the data as a bulk dataset without checking the upstream
terms first. `test_the_app_states_its_licence_and_claims_nothing_about_the_data`
enforces the first half.

## What gets merged

- **Every change passes the validation gates.** `docs/validation-gates.md`
  explains the six of them. They exist because a silently wrong number is the
  worst failure this project has.
- **A number-changing PR says which number and why**, with the upstream link.
- **New copy is written in both languages.** A missing string renders as a
  blank line, not a fallback.
- **No feature is gated.** Вярно has no paid tier and no donor tier; a change
  that makes any functionality conditional on payment or supporter status will
  not be merged. This is what the project *is*, not a phase.
- Match the surrounding code. The codebase comments the *why* rather than the
  *what*, sometimes at length, and that is deliberate.
- **A test moves with the code it protects, in the same commit.**
  [`docs/testing-strategy.md`](./docs/testing-strategy.md) is the full rule,
  including the standard a test has to meet — break the production code on
  purpose and watch the test go red.

## Contributions written with a coding agent

Welcome, and the bar does not move. A change is judged on whether it is right,
not on what typed it — [`AGENTS.md`](./AGENTS.md) exists precisely so an agent
arrives knowing the constraints. Four things are asked on top of the rules
above.

**You are the author.** Read every line before you send it and be ready to
answer for it in review. "The agent wrote it" is not available as an
explanation for a number that turned out wrong, and this project ships figures
people make decisions about.

**Run the checks yourself, and never report a count you did not produce.**
`make check` prints what it ran, and so does `npm run check:all`. A PR body
quoting counts from a run that never happened is the one failure that costs a
reviewer their ability to trust anything else in the description.

**Say so in the pull request** when an agent wrote a substantial part — one
line under "Why" is enough. It tells a reviewer where to look hardest, which is
the whole purpose; it is not a disclaimer and it does not weigh against the
change. This is deliberately not the same thing as tagging the code: no
`// AI-generated` in a comment, no author tags, no `Co-authored-by` bot trailer
([`writing-style.md`](./docs/writing-style.md) §"Code comments"). The claim
belongs where a reviewer reads it once, not scattered through files where it
rots.

**Keep the diff small enough to review.** An agent can produce a thousand-line
change as easily as a fifty-line one, and the reviewing capacity here is one
person. Split by reason-for-changing: a formula, its test and the doc paragraph
that explains it are one commit; an unrelated tidy-up is a different PR.

Five things agent-written changes here get wrong more than people do, each
already a rule above and each caught by something:

- **widening a tolerance or deleting an assertion** to make a suite pass. A
  gate that fails on real data is a wrong formula
  ([`validation-gates.md`](./docs/validation-gates.md));
- **narrating the edit in a comment** — `// this used to be 92 days`. The
  freshest thing in your context after a change is the delta, and it is the one
  thing a reader does not need: git has it, dated and attributed, and the
  comment is a second copy that nothing keeps honest. Nothing fails the build
  over it — it comes up in review;
- **writing new copy in one language.** A missing string renders as a blank
  line, not a fallback;
- **describing the published figures as openly licensed.** The code is
  Apache-2.0 and the data is not ours to license (see [`NOTICE`](./NOTICE));
- **inventing an organisational, legal or registration fact** to fill a gap — a
  maintainer count, a review SLA, a badge measuring nothing.

## Who a commit is from

**Every commit is authored by the person who is answerable for it** — you under
your own name and address, a contributor under theirs. That is the same rule as
the section above, in the field a reader checks first, and CI enforces it: a
commit authored by `Claude`, `Cursor`, `Codex` or a placeholder like
`Your Name <you@example.com>` fails the `authorship` job.

The list of rejected identities is a denylist rather than a roster of approved
contributors. A roster would fail a first-time contributor's PR on a file they
cannot edit, and the names match whole — Claude is refused, Claudia is a
person.

**A cloud agent session is where this goes wrong**, because the container sets
its own git identity and is rebuilt from scratch every session, so
`git config user.email` does not survive. Set yours in the environment's own
variables, which do:

```
GIT_AUTHOR_NAME       Your Name
GIT_AUTHOR_EMAIL      you@example.com
GIT_COMMITTER_NAME    Your Name
GIT_COMMITTER_EMAIL   you@example.com
```

Commits older than the rule keep the identity they were made under. Rewriting
them would change every SHA in the published history to restate something the
repository already knows.

**This does not compete with disclosing that an agent wrote the change.** The
author field records who answers for the code; the line in the PR body records
how it was produced. A reviewer needs both, and they are not the same question.

If you sign off (`git commit -s`, see below), the `Signed-off-by` line names
the same person as the author — it is a statement about the right to submit,
and it is worth nothing made in somebody else's name.

## Where the project's conventions live

This file covers how to get set up and open a change. **What makes a change
*right* is [`docs/`](./docs/README.md)** — the provenance rules every published
number has to satisfy, the five-layer split in the SPA, the testing rule, and
what the code owes the people reading it. Each doc is long because most of it
is the reasoning behind a rule, and a rule without its failure attached is one
somebody will reasonably decide to relax.

[`AGENTS.md`](./AGENTS.md) at the root is the short operative version of the
same ground — the commands, the boundaries, and a pointer per topic. It has
that filename because coding agents load a root `AGENTS.md` automatically, and
it is deliberately kept small because they load it on *every* task; `pipeline/`
and `site/` carry their own for the same reason. It is worth reading first, by
a person too.

## Commit and PR hygiene

Small, focused commits with messages that explain the reasoning. If a change
reverses an earlier decision, say which one and why — several files carry
"do not re-litigate this" comments precisely so the reasoning survives.

[`docs/writing-style.md`](./docs/writing-style.md) has the specifics: what
belongs in a subject line versus a body, why comments here explain the why at
length, and the machine-written habits worth catching before review does. It
applies to prose from a person and prose from a coding agent alike — the agents
are pointed at it by [`AGENTS.md`](./AGENTS.md), which they read automatically.

## Reporting a security problem

Do **not** open a public issue. See [`SECURITY.md`](./SECURITY.md).

## Code of conduct

[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) applies to every space the project
uses. Report problems to the address in that file.

## Licensing of contributions

By contributing you agree that your contribution is licensed under Apache-2.0,
the same licence as the project (see Apache-2.0 §5). There is no separate CLA
and no copyright assignment — you keep your copyright.

**A sign-off is welcome and no pull request waits for one.** `git commit -s`
adds a line saying you wrote the contribution or otherwise have the right to
submit it under Apache-2.0:

```
Signed-off-by: Your Name <you@example.com>
```

That is the [Developer Certificate of Origin](https://developercertificate.org/)
1.1. It asks for no rights beyond the licence §5 already grants, it costs one
flag, and it can be read by anyone from the git log — which is why it is worth
having: `NOTICE` asks forks not to use the project's name, and a request like
that is easier to make from a repository that can say where each line of its
own code came from.

It is a request rather than a gate, and the distinction is the point. Nothing
in CI checks for the trailer, so a rule that only a reviewer can enforce is a
rule that turns a contribution into a round trip over a missing line — for a
record that §5 already makes legally unnecessary. Add it if it costs you
nothing. If a change arrives without it, that is not something anyone here will
send it back over.
