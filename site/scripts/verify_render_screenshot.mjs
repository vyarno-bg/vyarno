/**
 * The README screenshot still shows the page the site actually serves.
 *
 * `docs/img/screenshot.png` is the first thing a stranger sees, in both
 * READMEs, above every sentence either of them writes. It is a photograph of a
 * live UI, so it goes wrong the way photographs of live UIs go wrong: the copy
 * underneath it moves and the picture keeps making the old claim. The shot this
 * check was written for had drifted four ways at once — a masthead with one
 * fewer route on it, a segmented control that had not been one, right-aligned
 * figures still shown left-aligned, and half a dozen em dashes the copy had
 * since dropped. Every one of those was a wrong claim in the repository's front
 * door, and nothing in the tree could see any of them.
 *
 * **The words are checked and the pixels are not.** `screenshot-frame.mjs`
 * §"The visible words inside the frame" carries the argument: the failures that
 * matter are wording, and comparing PNGs would import antialiasing and font
 * hinting into a test that has to pass on three operating systems. A check that
 * fails for a reason nobody caused is one somebody turns off, and then the real
 * drift comes back with it.
 *
 * So the sidecar `docs/img/screenshot.txt` is written by the same run that
 * writes the PNG, from the same posed page, and this re-poses that page against
 * the current build and compares. Red here means one of two things and the same
 * fix: the page changed, and the picture of it did not.
 *
 * What this does NOT catch, and it is worth knowing: a layout that broke
 * without changing a word — a column that stopped stacking, a control that lost
 * its border. `make_screenshot.mjs` says to look at the result before
 * committing it, and that is still a person's job.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shutdown, skip, withApp } from "./render-harness.mjs";
import { HEIGHT, SIDECAR, WIDTH, frameText, poseForTheShot } from "./screenshot-frame.mjs";

const REPO = join(dirname(dirname(fileURLToPath(import.meta.url))), "..");

test("the README screenshot shows the words the page renders today", { skip }, async () => {
  const recorded = readFileSync(join(REPO, SIDECAR), "utf8").trim();

  // A sidecar that has lost its contents would make this pass against anything,
  // which is the shape every empty assertion in this repository takes.
  assert.ok(
    recorded.split("\n").length > 40,
    `${SIDECAR} holds only ${recorded.split("\n").length} lines — it is not a record of the frame`
  );

  await withApp(
    async (page, errors) => {
      await poseForTheShot(page);
      const shown = (await frameText(page)).trim();
      assert.deepEqual(errors, [], errors.join(" | "));

      if (shown === recorded) return;

      // Naming the first line that moved, rather than printing two screens of
      // Bulgarian: the diff is almost always one string, and a reader who can
      // see which one knows immediately whether the picture matters.
      const was = recorded.split("\n");
      const now = shown.split("\n");
      const at = was.findIndex((line, i) => line !== now[i]);
      assert.fail(
        `the calculator no longer renders what docs/img/screenshot.png shows.\n` +
          `  first difference at line ${at + 1} of ${SIDECAR}\n` +
          `    the picture claims: ${JSON.stringify(was[at] ?? "(nothing — the frame got shorter)")}\n` +
          `    the page renders:   ${JSON.stringify(now[at] ?? "(nothing — the frame got longer)")}\n\n` +
          "Rebuild and re-shoot, in the commit that moved the copy:\n" +
          "  npm run build && node scripts/make_screenshot.mjs\n" +
          "then LOOK at the image before committing it."
      );
    },
    "/",
    { viewport: { width: WIDTH, height: HEIGHT } }
  );
});

test.after(shutdown);
