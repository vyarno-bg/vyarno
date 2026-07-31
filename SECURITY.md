# Security Policy

## Reporting a vulnerability

**Email contact@vyarno.bg.** Please do not open a public issue for a security
problem.

If this repository's Security tab offers "Report a vulnerability", that private
channel works too. It is a per-repository setting rather than something this
file can turn on, so the email address above is the route that is always there.

Include what you need to make the problem reproducible: the URL or the file, the
steps, and what you think the impact is. A rough report is much better than no
report — do not polish it first.

## What to expect

Вярно is maintained by one person as a public-interest project, so the honest
version rather than a corporate SLA:

- **Acknowledgement within three working days.** That is the window the
  published policy at [vyarno.bg/legal/#security](https://vyarno.bg/legal/#security)
  commits to, and this file may not offer a slower one — `security.txt` sends a
  researcher to that page, so two windows would mean whichever they read first
  decides what we promised. If you have not heard back, assume the mail went
  astray and write again.
- **An assessment and a plan within 30 days**, including "this is not something
  we will fix, and here is why" if that is the answer.
- Credit in the fix commit, if you want it. Say so in your report; the default
  is to credit you by the name you signed with. There is no release note to
  name you in — this project does not cut releases, and README.md §"Versions
  and releases" says why.

There is no bug bounty. Nobody is paid for anything on this project, and
pretending otherwise would waste your time.

## What we will not do

We will not pursue legal action against anyone who reports a problem in good
faith, follows this policy, and gives us a reasonable chance to fix it before
going public. Good faith means: do not access, modify or delete other people's
data, do not degrade the service for other users, and do not extract more data
than you need to demonstrate the issue.

## Scope

**In scope:** vyarno.bg and its subdomains; this repository's code; the
published data payloads.

**Out of scope:**

- The upstream publishers themselves — Eurostat, the ЕЦБ, БНБ, НСИ, имот.bg.
  Report those to them.
- Missing security headers with no demonstrated impact, and automated-scanner
  output pasted without a working proof of concept.

## A note on what this project holds

Worth knowing before you look: **Вярно stores nothing about its users.**
Personal figures — salary, rent, savings, basket — are computed in the browser
and never sent anywhere. There is no account system, no database of users, no
analytics profile and no server-side session. The threat model is therefore
mostly about integrity (a wrong or tampered figure) and availability, not
confidentiality of user data.

An attack that changes a *published number* is the most serious class of bug
this project has. Treat that as high severity even when it looks cosmetic.

## Machine-readable policy

`https://vyarno.bg/.well-known/security.txt` (RFC 9116) carries the same contact
route. Its `Expires` field is checked by `site/scripts/verify_static_assets.mjs`,
which fails the build within 30 days of expiry so it gets renewed by a test
going red rather than by someone remembering.
