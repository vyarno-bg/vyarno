#!/usr/bin/env node
/**
 * `npm run build`, with `VYARNO_RELEASE=1` set for the whole chain.
 *
 * The flag exists for `check-identity.mjs`, which warns on a development build
 * and **fails** on a release one — the difference between "this preview is
 * missing a ЗЕТ чл. 4 row" and "this must not ship". So the release path has to
 * set an environment variable across six commands.
 *
 * `"build:release": "VYARNO_RELEASE=1 npm run build"` is how a POSIX shell says
 * that, and it is not portable: cmd.exe reads `VYARNO_RELEASE=1` as the name of
 * a program and PowerShell rejects it outright, so the one command that builds
 * what gets published was the one command a Windows contributor could not run.
 * A release built there would also have been the dangerous kind of broken —
 * had the prefix somehow been ignored rather than fatal, the build would have
 * succeeded as a development build and shipped past the guard that is supposed
 * to stop it.
 *
 * This file is deliberately a wrapper around `npm run build` rather than a
 * second copy of its six steps. The step list has one home, and a release build
 * runs exactly what a development build runs — differing in one environment
 * variable and nothing else, which is the only way the release path stays
 * tested by the ordinary one.
 *
 * `cross-env` does this in one line and is not here: `site/package.json`
 * declares no runtime dependencies and the devDependencies are the three that
 * build the app plus the ones that lint or drive it. Fifteen lines of Node is
 * cheaper than the first dependency added for convenience.
 */
import { spawnSync } from "node:child_process";

// Windows: npm is `npm.cmd`, and since the CVE-2024-27980 fix Node refuses to
// spawn a `.cmd` without a shell. Every argument here is a literal, so there is
// nothing for a shell to interpolate.
const isWindows = process.platform === "win32";

const result = spawnSync(isWindows ? "npm.cmd" : "npm", ["run", "build"], {
  stdio: "inherit",
  shell: isWindows,
  env: { ...process.env, VYARNO_RELEASE: "1" },
});

if (result.error) {
  console.error(`[release-build] could not start npm: ${result.error.message}`);
  process.exit(1);
}

// A child killed by a signal reports status null. Exiting 0 on that would
// report a build that never finished as a build that passed.
process.exit(result.status ?? 1);
