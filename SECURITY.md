# Security policy

## Supported versions

`vyarno.bg` is published from the `main` branch of this repository. Only the
latest published release receives security fixes; older releases are not
back-patched.

| Branch  | Supported          |
| ------- | ------------------ |
| `main`  | yes                |
| older   | no                 |

## Reporting a vulnerability

Please report security issues **privately** — **do not file a public GitHub
issue** for a vulnerability. The maintainers want time to ship a fix before the
detail becomes public.

Email: **contact@vyarno.bg**

A good report includes:

- a description of the issue and the impact you believe it has;
- the steps to reproduce, or a proof-of-concept;
- the affected version (commit SHA, release, or date observed);
- your name and how you would like to be credited in the advisory.

You can expect:

- an acknowledgement within three working days;
- a status update within seven working days;
- a coordinated disclosure date agreed with you before any public advisory.

## What is in scope

Anything that affects a reader's trust in the figures or in the privacy of
their personal numbers, including but not limited to:

- a published figure that does not match its source;
- a personal-figure calculation that leaves the reader's browser;
- a content-security-policy directive that the build silently weakens;
- a data-source connector that accepts unauthenticated upstream changes;
- a server-side route that processes a personal figure.

## Out of scope

- denial-of-service against the published static site (it is a CDN in front of
  static files; report the issue to the CDN operator);
- rate-limiting concerns on the public calculator (the calculator runs in the
  reader's browser);
- theoretical attacks that require a man-in-the-middle position between the
  reader and `vyarno.bg` over HTTPS.

## Recognition

Reporters who follow the policy above are credited in the release notes unless
they ask not to be.
