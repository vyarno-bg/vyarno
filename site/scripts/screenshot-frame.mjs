/**
 * What `docs/img/screenshot.png` is a picture OF, in one place.
 *
 * `make_screenshot.mjs` takes the picture and `verify_render_screenshot.mjs`
 * checks it is still the picture. Both need the same viewport, the same typed
 * figures and the same idea of which text made it into the frame — so a second
 * copy of any of the three would be a guard that drifts from the artefact it
 * guards and then reports green about a different page.
 *
 * Nothing here launches anything, so both importers can read it without paying
 * for the other's browser.
 */

/**
 * The frame, and every number in it is a decision.
 *
 * The shot has to carry the whole claim in one image: figures typed on the
 * left, the reader's own rate and the per-group breakdown that sums to it on
 * the right. That is what both READMEs promise in their alt text, and a frame
 * tight enough to cut the breakdown off shows a form rather than a calculator —
 * so the height is set by how far down the ranked rows reach, not by a round
 * number.
 *
 * 1280 CSS px is the layout's comfortable desktop width. The page stays fluid
 * above it and the two cards keep stretching, which lengthens every line of
 * body copy for no gain; below ~960 the columns stack and the arrangement the
 * alt text describes stops being true.
 *
 * 1.5× is the compromise the display size forces. GitHub renders a README image
 * at about 900 px wide whatever it is given, so the source only has to survive
 * that downscale — and 2× at this width would be a 3 MB PNG in a repository
 * that ships an 1,800-byte favicon.
 */
export const WIDTH = 1280;
export const HEIGHT = 1180;
export const SCALE = 1.5;

/**
 * What is typed in, and why it is not the page defaults.
 *
 * The defaults leave the raise empty, and an empty raise makes «в джоба» read
 * "enter a raise" — the one row that shows what the calculator is FOR, blank in
 * the shot that has to sell it. A salary above the Sofia average also puts the
 * comparator on its positive branch, so the strip shows a verdict rather than
 * an em dash. Round numbers on purpose: nothing here is a claim about anyone.
 */
export const INPUTS = [
  ["#inSalary", "1600"],
  ["#inRaise", "5"],
  ["#inCash", "1000"],
];

/** Where the sidecar lives, relative to the repository root. */
export const SIDECAR = "docs/img/screenshot.txt";

/**
 * Put the page into the state the picture is taken in.
 *
 * Shared because the settle is load-bearing rather than incidental: the inputs
 * are debounced and the basket re-renders off them, so without the wait both
 * the photograph and the check catch the previous figures beside the new ones —
 * and they would catch them at different moments, which is a guard disagreeing
 * with the artefact over a race neither meant to have.
 */
export async function poseForTheShot(page) {
  for (const [selector, value] of INPUTS) await page.fill(selector, value);

  // Filling leaves the caret in the last field, and a focus ring plus number
  // spinners on one arbitrary input photograph as "this box is the important
  // one". Nothing is selected in the state a visitor arrives in.
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * The visible words inside the frame, in reading order.
 *
 * **This is what the guard compares, and it is text rather than pixels on
 * purpose.** The failure worth catching is a copy edit reaching the frame while
 * the image keeps showing the old wording — the shot this replaced still read
 * «най-голямата хапка», carried a salary hint two rewrites old, and dated the
 * data by the day it was downloaded. Every one of those is a wrong claim in the
 * first image a stranger sees, and every one of them is a word. Pixels would
 * add antialiasing and font-hinting differences between machines, and a check
 * that fails for a reason nobody caused is one somebody turns off.
 *
 * Each text node is measured through its own `Range`, so a paragraph that wraps
 * is placed by where its lines actually are. Two consequences are deliberate:
 *
 * - **A zero-size node is skipped**, which is how the other language leaves.
 *   `.l-bg` / `.l-en` are both in the DOM and one is display:none, so measuring
 *   rather than reading `textContent` captures the half a reader was shown.
 * - **A node crossing the bottom edge is skipped.** It is half in the picture,
 *   so it is not something the picture asserts.
 *
 * Whitespace is collapsed before anything is compared, which is what makes the
 * result the same on every machine: the fonts are self-hosted `woff2` and the
 * viewport is fixed, so the words and their order are identical, and only the
 * line breaks between them could ever have differed.
 */
export async function frameText(page) {
  return page.evaluate((height) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.bottom > height) continue;
      parts.push(text);
    }
    return parts.join("\n");
  }, HEIGHT);
}
