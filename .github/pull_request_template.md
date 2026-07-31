## What is being changed

Cite `docs/principles.md` P-numbers if the change crosses a principle, or `docs/math.md` if a formula moved.

## Why

The constraint the code has to keep doing. State what you rejected before writing it, and what breaks if this is reverted.

## Verification

- [ ] `make check` with `VYARNO_CHROMIUM` set, all green
- [ ] target slice N/M green; pre-existing failures (if any) listed separately
- [ ] new user-facing copy in both languages in the same commit
- [ ] numbers cited in the body are the ones I observed, not the ones I expected
