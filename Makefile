# One command for the things you have to run before opening a change.
#
# CI (.github/workflows/ci.yml) is the authority on what "green" means. This
# file exists because reproducing it by hand is five commands across three
# directories, two of which need a virtualenv activated first — enough friction
# that people run four of the five and find out about the fifth from CI.
#
# It is deliberately thin: every target below is the same command CI runs, in
# the same order. Two deliberate differences, and they are here rather than
# left for someone to find in a diff:
#
#   `build` runs `npm run build:release`, while CI runs `npm run build`.
#
# The two differ only in `scripts/check-identity.mjs`, which WARNS under
# `build` and FAILS under `build:release`. CI must not go red over a legal fact
# — a preview of a branch is not a publication — but a local `make check` is
# the last thing run before a change is opened, and that is the right place to
# be told the published identity would not be true.
#
#   `render` refuses to start without a browser, where CI simply installs one.
#
# CI never meets that case; a workstation does, and there the render suite
# skips and exits 0. `make check` is what a contributor and an agent trust when
# they say a change is done, so it may not report green over the one suite that
# runs the app having never run it.
#
# Both differences point the same way — `make check` is strictly stricter than
# CI, so local green implies CI green and never the reverse. Everywhere else,
# if the two disagree, CI is right.
#
#   make setup     once, after cloning
#   make check     everything CI runs
#   make help      the full list

# This Makefile needs a POSIX shell, and says so rather than half-working.
#
# `OS` is set to `Windows_NT` by Windows itself, on every version since NT, and
# is absent everywhere else. Under MSYS2, Git Bash, Cygwin and WSL the host may
# be Windows but the shell is POSIX and the paths below resolve; those announce
# themselves in `MSYSTEM`, which native Windows `make` does not set. So this
# guard fires for exactly one case: GNU Make installed on Windows and run from
# cmd.exe or PowerShell.
#
# It refuses instead of adapting because adapting is more than a variable. Make
# hands each recipe to cmd.exe there, and cmd reads `/` as the start of a
# switch — `pipeline/.venv/Scripts/ruff check .` is not a command it can run,
# so every target would need its separators converted, and nothing in CI would
# ever execute the converted form. The `windows` job runs the commands directly
# for that reason. An untested branch that produces
# "The syntax of the command is incorrect" teaches a contributor nothing; a
# refusal that names three shells that do work teaches them where to go.
ifeq ($(OS)$(MSYSTEM),Windows_NT)
  $(error This Makefile needs a POSIX shell. On Windows use Git Bash, MSYS2 or \
    WSL, where every target below works — or run the commands directly, which \
    docs/local-development.md §"On Windows" lists in full)
endif

# `make` defaults to `/bin/sh`, and a recipe written against bash that runs
# under dash fails in ways that read as a broken toolchain rather than a wrong
# shell. Required, not assumed.
SHELL := /bin/bash

PY := pipeline/.venv/bin/python
PYTEST := pipeline/.venv/bin/pytest
# Ruff comes from the venv `make setup` built, not from PATH. CI installs the
# pipeline into the job's own environment so a bare `ruff` resolves there, but
# after `make setup` it lives in the venv and is NOT on a contributor's PATH —
# `make lint` failed with "ruff: command not found" for anyone who had not also
# installed it globally.
RUFF := pipeline/.venv/bin/ruff

.DEFAULT_GOAL := help
.PHONY: help setup lock check fmt lint test build browser render coverage clean

help: ## Show this list
	@echo "Вярно — make targets:"
	@echo
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[1m%-10s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  'make check' needs 'make setup' first. The browser smoke test"
	@echo "  finds a Chromium by itself — Playwright's, the system's, or one"
	@echo "  named by VYARNO_CHROMIUM — and 'make check' fails if there is none"
	@echo "  rather than reporting green over a suite that skipped."

setup: ## Create the Python venv and install both toolchains
	python3 -m venv pipeline/.venv
	$(PY) -m pip install --quiet --upgrade pip
	$(PY) -m pip install --quiet -r pipeline/requirements-dev.txt
	$(PY) -m pip install --quiet -e pipeline --no-deps
	cd site && npm install
	@echo "Ready. 'make check' runs what CI runs."

$(PYTEST):
	@echo "pipeline/.venv is missing — run 'make setup' first." >&2
	@exit 1

fmt: $(PYTEST) ## Apply what `lint` only checks — ruff format, prettier, eslint --fix
	@# `lint` reports and never rewrites, because CI has to report rather than
	@# rewrite. That leaves a contributor reading a ruff diff to work out what
	@# to type. This is what to type. It is not part of `check` — a target that
	@# edits the tree has no business inside the one that verifies it.
	$(RUFF) format .
	cd site && npm run lint:fix

lint: $(PYTEST) ## Ruff, ESLint, Prettier, svelte-check
	$(RUFF) check .
	$(RUFF) format --check .
	cd site && npm run lint
	cd site && npm run check

test: $(PYTEST) ## Both offline suites — pytest and node:test
	$(PYTEST) -q --rootdir pipeline pipeline/tests
	cd site && npm run verify:math

build: ## Production build of the site
	cd site && npm run build:release

# Resolve a browser BEFORE `build`, so a machine with none is told in a second
# rather than after a production build it is about to throw away.
browser:
	@cd site && node scripts/find-chromium.mjs >/dev/null

render: browser build ## Load the built page in a browser and assert it rendered
	@# `npm run test:render` skips rather than fails with no browser, on purpose:
	@# a contributor without one is not blocked. This target promises something
	@# stronger — its name says the page was loaded — and `make check` inherits
	@# that promise, which is the whole point. A check that reports green over
	@# fourteen tests that never ran is worse than one that fails, because the
	@# only suite that runs the app is the only one that can see a page which
	@# throws on render.
	cd site && npm run test:render

lock: ## Regenerate pipeline/requirements*.txt from pyproject.toml
	@# pip-compile reaches into pip's internals, and the current release (7.6.0)
	@# breaks against pip 26 with `cannot import name 'stdlib_pkgs'`. So the lock
	@# is generated in a throwaway venv holding a pip old enough for it, rather
	@# than by pinning the pipeline venv's pip backwards for everyone. Installing
	@# from the lock works on any modern pip — only generating it needs this.
	@#
	@#
	@# Regenerate this on Linux, and in WSL rather than in Git Bash if you are on
	@# Windows. pip-compile resolves for the machine it runs on, so a lock built
	@# under MSYS would drop any dependency whose marker is false there — the
	@# mirror image of the bug that put `colorama` and `tzdata` in
	@# `pyproject.toml` without markers. The guard at the top of this file stops
	@# cmd.exe from reaching any of this; it cannot tell Git Bash from Linux.
	@rm -rf .lockenv
	@python3 -m venv .lockenv
	@.lockenv/bin/pip install --quiet "pip<25" && .lockenv/bin/pip install --quiet pip-tools
	@cd pipeline && ../.lockenv/bin/pip-compile --quiet --generate-hashes --strip-extras \
		--output-file=requirements.txt pyproject.toml
	@cd pipeline && ../.lockenv/bin/pip-compile --quiet --generate-hashes --strip-extras \
		--extra dev --output-file=requirements-dev.txt pyproject.toml
	@rm -rf .lockenv
	@echo "Regenerated pipeline/requirements.txt and requirements-dev.txt."
	@echo "Review the diff, then 'make setup' to install the new pins."

check: lint test render ## Everything CI runs, in CI's order
	@echo
	@echo "All green."

coverage: $(PYTEST) ## Measure both suites; see docs/testing-strategy.md for what is uncovered and why
	$(PYTEST) -q --rootdir pipeline pipeline/tests \
		--cov=vyarno_pipeline --cov-report=term-missing
	@echo
	cd site && node --experimental-test-coverage --test scripts/verify_*.mjs 2>/dev/null \
		| tail -n 40 || true

clean: ## Remove build output and the venv
	@# Node rather than `rm -rf`, which cmd.exe does not have. `force` so a
	@# path that is already gone is not an error — `clean` is run to reach a
	@# state, not to delete four specific directories.
	@node -e "for (const p of ['site/dist','site/node_modules','pipeline/.venv','site/.sourcemaps']) require('node:fs').rmSync(p, {recursive: true, force: true})"
