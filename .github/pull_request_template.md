<!-- One test for this PR: would a reviewer learn something from this
     template that the diff does not already tell them? If not, cut it.
     Fill the placeholders; the body fills the template and stops. -->

## What is being changed

<!-- One or two sentences. Cite `docs/principles.md` P-numbered rules if the
     change crosses one, or `docs/math.md` if a formula moved. -->

## Why

<!-- The constraint the code has to keep doing. Not the diff, not
     "previously X, now Y" — the failure this change rules out, and what
     you rejected before writing it. -->

## Verification

<!-- Every box below is required. A count that moved without a change is a
     finding, not noise. See AGENTS.md §Commands. -->

- [ ] `make check` with `VYARNO_CHROMIUM` set — all green
- [ ] target slice of the suite **N/M** green; pre-existing failures (if any) **K** listed separately
- [ ] `git diff` reviewed against the constraint above
- [ ] new user-facing copy in **both** languages, in the same commit
