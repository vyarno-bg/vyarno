/**
 * The share card and the share text.
 *
 * The card is drawn in a canvas from the reader's own comparison, which makes
 * it the one surface where a personal figure could leave the tab as a picture.
 * P2 and P9: the drawing carries the rates and no euro figure, and it follows
 * the theme and language the reader is actually looking at.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";

test("the share card draws the reader's own comparison, and no euro figure", { skip }, async () => {
  await withApp(async (page, errors) => {
    // A weight moved onto transport, so the basket parts company with the
    // official one and the card has a verdict to state.
    await page.locator("#inSalary").fill("2400");
    // Scoped to the basket's own rows. An unscoped `input[type="range"]` counts
    // every rail on the page, so the index means "the seventh division" only
    // for as long as nothing else on the card is a slider — and the
    // spend-share control above the list is one.
    await page.locator("#sliders .cat > input[type=range]").nth(6).fill("40");
    await page.waitForTimeout(600);

    const block = page.locator("section.share");
    assert.equal(await block.count(), 1, "no share block at the foot of the results");

    // The picture exists and has actually been painted. A canvas that was
    // never drawn is the failure this suite is for: every other test in the
    // repository would stay green while the reader sees an empty rectangle.
    const painted = await page.evaluate(() => {
      const canvas = document.querySelector("section.share canvas");
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        if (seen.size > 4) break;
      }
      return { width: canvas.width, height: canvas.height, colours: seen.size };
    });
    assert.ok(painted, "the share block rendered no canvas");
    assert.deepEqual(
      { width: painted.width, height: painted.height },
      { width: 1200, height: 630 },
      "the export is not the 1200x630 every unfurler crops least"
    );
    assert.ok(painted.colours > 2, "the canvas is one flat colour, so nothing was drawn on it");

    // It leaves the page as a PNG, which is what a share sheet and a chat
    // window both take. Produced from the canvas, so nothing is fetched.
    const png = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL("image/png").slice(0, 22)
    );
    assert.equal(png, "data:image/png;base64,", png);

    // P2, on the surface the reader is about to send: `extraPerMonth` is
    // salary x r/(100+r) and inverts exactly, so a euro figure beside the rate
    // publishes the 2,400 typed above. The results card above this block is
    // full of them; this block may carry none.
    const shown = await block.innerText();
    assert.doesNotMatch(shown, /€|(?<!\p{L})(EUR|евро|лв)(?!\p{L})/iu, shown.replace(/\s+/g, " "));
    assert.doesNotMatch(shown, /2[\s,.]?400/, `the salary reached the share block: ${shown}`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the share text names both rates and a way back to the site", { skip }, async () => {
  await withApp(async (page, errors) => {
    // Scoped to the basket's own rows. An unscoped `input[type="range"]` counts
    // every rail on the page, so the index means "the seventh division" only
    // for as long as nothing else on the card is a slider — and the
    // spend-share control above the list is one.
    await page.locator("#sliders .cat > input[type=range]").nth(6).fill("40");
    await page.waitForTimeout(600);

    // Rendered rather than hidden behind the copy button: where the clipboard
    // API is unavailable this IS the message, and it can be selected by hand.
    const message = await page.locator("section.share .sh-msg").innerText();
    assert.match(message, /https:\/\/vyarno\.bg/, `no route back to the site: ${message}`);
    // Two rates, so a recipient who has never opened the site can place the
    // sender's number against something. One number alone is a claim nobody
    // can read.
    const rates = message.match(/-?\d+,\d+%/g) ?? [];
    assert.ok(rates.length >= 2, `the message states no comparison: ${message}`);

    // Three surfaces, and the fallbacks are always there. The share sheet is
    // absent in headless Chromium, which is exactly the desktop case: the
    // reader must still be able to copy the text and download the picture.
    for (const name of [/копирай текста/i, /свали картинката/i]) {
      assert.equal(await page.getByRole("button", { name }).count(), 1, `missing: ${name}`);
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the shared picture follows the reader's theme and language", { skip }, async () => {
  await withApp(async (page, errors) => {
    // Reading the pixel is a second state question, and the canvas answers it
    // itself: `ShareCard`'s draw is debounced and waits on `document.fonts`, so
    // an unpainted canvas hands back transparent black — a colour, which every
    // comparison below would accept. Alpha is what says it has been drawn.
    const painted = () =>
      page.waitForFunction(() => {
        const canvas = document.querySelector("section.share canvas");
        return Boolean(canvas) && canvas.getContext("2d").getImageData(4, 4, 1, 1).data[3] > 0;
      });
    const corner = async () => {
      await painted();
      return page.evaluate(() => {
        const canvas = document.querySelector("section.share canvas");
        const { data } = canvas.getContext("2d").getImageData(4, 4, 1, 1);
        return `${data[0]},${data[1]},${data[2]}`;
      });
    };
    /**
     * Wait for the card to be REDRAWN, then let the assertion speak.
     *
     * A repaint has no state of its own to poll — the canvas was already
     * opaque — so the change itself is the signal, and the bound exists only to
     * cap how long a card that never redraws stalls the suite. It returns the
     * instant the pixels move, so it is not a duration the runner has to keep
     * up with; on the failure it is bounding, the assertion below reports what
     * went wrong rather than a timeout.
     */
    const redrawn = (was) =>
      page
        .waitForFunction(
          (prev) => document.querySelector("section.share canvas").toDataURL() !== prev,
          was,
          { timeout: 5000 }
        )
        .catch(() => {});

    const light = await corner();
    const png = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL()
    );
    await page.locator("header.site .controls button").first().click();
    await redrawn(png);
    const dark = await corner();
    // Both themes are AA-verified by verify_contrast.mjs, and the card is
    // drawn from the same custom properties — so a card that ignored the theme
    // would be standing on a palette nothing has ever checked.
    assert.notEqual(light, dark, "the card kept the light ground in the dark theme");

    // A picture carries one language, so it is drawn in the one the reader is
    // looking at rather than left to the .l-bg/.l-en CSS the rest of the app
    // switches with.
    const before = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL()
    );
    await page.locator("header.site .controls button").nth(1).click();
    await redrawn(before);
    const after = await page.evaluate(() =>
      document.querySelector("section.share canvas").toDataURL()
    );
    assert.notEqual(before, after, "the card stayed in the same language as the page changed");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test.after(shutdown);
