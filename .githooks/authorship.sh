#!/usr/bin/env bash
# The one list of coding-agent identities, attribution lines and branch names
# this repository refuses. The hooks beside this file and CI's `authorship` job
# both run it, so a name added here is enforced in both places at once.
# AGENTS.md §"Branches and authorship" is the rule; this is its enforcement.
#
#   authorship.sh ident NAME EMAIL   a commit author or committer
#   authorship.sh message FILE       a commit message
#   authorship.sh branch NAME        a branch name
#   authorship.sh range REVS...      every commit `git log REVS` lists
#   authorship.sh selftest           the cases at the bottom still hold
#
# Written for bash 3.2, the one macOS ships: no ${var,,}, no mapfile.

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# A denylist, never a roster of approved people: a roster fails a first-time
# contributor's change on a file they cannot edit. Names match WHOLE, because
# "Claude" is an agent and Claudia is a person.
ident_reason() {
  local name email
  name=$(lower "$1")
  email=$(lower "$2")
  case "$email" in
    *noreply@anthropic.com* | *cursoragent@cursor.com* | *+copilot@users.noreply.github.com*)
      echo "a coding agent" && return 1 ;;
    *you@example.com* | *@localhost | *@localhost.localdomain)
      echo "a placeholder identity" && return 1 ;;
  esac
  case "$name" in
    claude | "claude code" | "claude opus"* | "claude sonnet"* | "claude haiku"* | "claude fable"* | \
      cursor | "cursor agent" | codex | devin | aider | "github copilot" | copilot)
      echo "a coding agent" && return 1 ;;
    root | unknown | "your name" | "")
      echo "a placeholder identity" && return 1 ;;
  esac
  return 0
}

# A message may name a tool in its prose; what it may not carry is a line that
# credits one. Reads the message on stdin and stops at git's scissors line,
# below which `commit -v` puts the diff rather than the message.
message_reason() {
  local line low who mail
  local generated='generated (with|by).*(claude|copilot|cursor|codex|devin|aider)'
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "# ------------------------ >8 ------------------------"*) break ;;
      "#"*) continue ;;
    esac
    low=$(lower "$line")
    case "$low" in
      co-authored-by:*)
        who=$(printf '%s' "${line#*:}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]*<.*$//')
        mail=$(printf '%s' "$line" | sed -nE 's/.*<([^>]*)>.*/\1/p')
        if ! ident_reason "$who" "$mail" >/dev/null; then
          echo "a co-author trailer naming a coding agent: $line" && return 1
        fi
        ;;
      *claude.ai/code* | claude-session:*)
        echo "a link to an agent session: $line" && return 1 ;;
    esac
    if [[ $low =~ $generated ]]; then
      echo "a footer crediting a coding agent: $line" && return 1
    fi
  done
  return 0
}

# A branch name says what the change does, never which tool typed it. Only the
# prefix is judged: `site/explain-claude-md` is a description, `claude/x` is a
# signature.
branch_reason() {
  local b
  b=$(lower "${1#refs/heads/}")
  case "$b" in
    claude | claude/* | claude-* | copilot | copilot/* | copilot-* | codex | codex/* | codex-* | \
      cursor | cursor/* | cursor-* | devin | devin/* | devin-*)
      echo "named after a coding agent" && return 1 ;;
  esac
  return 0
}

report() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$*"; else echo "$*"; fi
}

# NUL-delimited because a name and a message are free text and any printable
# separator is a character they can contain; NUL is the one byte git refuses.
check_range() {
  local fail=0 sha an ae cn ce body why count=0
  while IFS= read -r -d '' sha && IFS= read -r -d '' an && IFS= read -r -d '' ae &&
    IFS= read -r -d '' cn && IFS= read -r -d '' ce && IFS= read -r -d '' body; do
    count=$((count + 1))
    if ! why=$(ident_reason "$an" "$ae"); then
      report "$sha is authored by $why: $an <$ae>" && fail=1
    fi
    if ! why=$(ident_reason "$cn" "$ce"); then
      report "$sha is committed by $why: $cn <$ce>" && fail=1
    fi
    if ! why=$(printf '%s\n' "$body" | message_reason); then
      report "$sha carries $why" && fail=1
    fi
  done < <(git log -z --format='%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B' "$@")
  if [ "$fail" -ne 0 ]; then
    report "Commit under your own name and address, and credit no agent in the message."
    report "AGENTS.md §'Branches and authorship' and CONTRIBUTING.md §'Who a commit is from'."
    return 1
  fi
  echo "$count commit(s) checked, each authored and committed by a person and crediting no agent"
}

selftest() {
  local bad=0
  expect() {
    local want=$1 what=$2 got=allow
    shift 2
    "$@" >/dev/null 2>&1 || got=refuse
    [ "$got" = "$want" ] || { echo "selftest: expected $want for $what, got $got" >&2 && bad=1; }
  }
  msg() { printf '%b' "$1" | message_reason; }
  expect refuse "Claude as author" ident_reason "Claude" "someone@example.org"
  expect refuse "a Claude model as author" ident_reason "Claude Opus 5.5" "x@example.org"
  expect refuse "an Anthropic address" ident_reason "Someone" "noreply@anthropic.com"
  expect refuse "Copilot's address" ident_reason "Copilot" "198982749+Copilot@users.noreply.github.com"
  expect refuse "a placeholder" ident_reason "Your Name" "you@example.com"
  expect allow "Claudia" ident_reason "Claudia" "claudia@example.org"
  expect allow "a Cyrillic name" ident_reason "Кирил Аламуров" "k@example.org"
  expect allow "the refresh bot" ident_reason "vyarno-refresh" "vyarno-refresh@users.noreply.github.com"
  expect refuse "a claude/ branch" branch_reason "claude/project-quality-audit-e6lrvb"
  expect refuse "a copilot/ branch" branch_reason "refs/heads/copilot/fix-header"
  expect allow "a data/ branch" branch_reason "data/hicp"
  expect allow "a dependabot branch" branch_reason "dependabot/npm_and_yarn/site/vite-8.3.5"
  expect allow "a description naming a tool" branch_reason "docs/explain-claude-md"
  expect refuse "an agent co-author" msg 'fix\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n'
  expect refuse "a session link" msg 'fix\n\nhttps://claude.ai/code/session_01abc\n'
  expect refuse "a generated-with footer" msg 'fix\n\nGenerated with [Claude Code](https://claude.com/claude-code)\n'
  expect allow "a person as co-author" msg 'fix\n\nCo-authored-by: Claudia Petrova <cp@example.org>\n'
  expect allow "prose naming the tool" msg 'docs: point CLAUDE.md at AGENTS.md\n\nClaude Code reads CLAUDE.md.\n'
  expect allow "a link below the scissors" msg 'fix\n# ------------------------ >8 ------------------------\n+https://claude.ai/code/x\n'
  [ "$bad" -eq 0 ] && echo "authorship selftest: every case holds"
  return "$bad"
}

main() {
  local why
  case "${1:-}" in
    ident) why=$(ident_reason "$2" "$3") || { report "$2 <$3> is $why" && return 1; } ;;
    message) why=$(message_reason <"$2") || { report "the message carries $why" && return 1; } ;;
    branch)
      why=$(branch_reason "$2") || {
        report "branch '$2' is $why. Rename it to <area>/<what-it-does>: git branch -m <new-name>"
        return 1
      }
      ;;
    range) shift && check_range "$@" ;;
    selftest) selftest ;;
    *) echo "usage: $0 ident NAME EMAIL | message FILE | branch NAME | range REVS... | selftest" >&2 && return 2 ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
