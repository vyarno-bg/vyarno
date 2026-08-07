/**
 * Payroll, and the household with more than one income.
 *
 * Two incomes are two contracts, each with its own ceiling and its own
 * ladder position — modelling them as one salary is a wrong number that every
 * arithmetic suite would still call right, because the arithmetic is right and
 * the input is not. These drive the interface that produces that input, and
 * hold the rule that adding an income changes nothing until it is answered.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";

test("the placeholder's payslip and comparator wait for a salary", { skip }, async () => {
  // The gross, the deductions and the Sofia comparison are facts about
  // whoever earns the €900 placeholder until the reader replaces it — the same
  // reasoning that keeps the ladder row silent. Withholding them also keeps
  // the first paint short enough that the headline figure stays on the first
  // screen of a phone with the pay field above it.
  await withApp(async (page, errors) => {
    const pay = page.locator(".m-pay");
    const idle = await pay.innerText();
    // Matched on the payslip's own sentences, not on the word «бруто» alone:
    // the net/gross toggle is a CONTROL labelled with it, and it is drawn
    // whether or not anybody has typed. What must wait is the figures.
    assert.doesNotMatch(
      idle,
      /по договор|на ръка|осигуровки и|под средната|над средната/i,
      `the pay card describes a placeholder's payslip: ${idle.replace(/\s+/g, " ")}`
    );
    assert.equal(
      await pay.locator("details.payslip").count(),
      0,
      "a payslip was itemised for whoever earns the placeholder"
    );

    // The hint under the field describes the €900, so it belongs to the same
    // state as the figures above: present while the placeholder is what is in
    // the box, gone the moment it is not. Left standing it tells a reader that
    // the pay they just typed «е просто начална стойност».
    assert.match(
      idle,
      /просто начална стойност/i,
      `the placeholder is in the box with nothing saying so: ${idle.replace(/\s+/g, " ")}`
    );

    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const answered = await pay.innerText();
    assert.match(
      answered,
      /по договор/i,
      "the payslip summary never appeared after a salary was typed"
    );
    assert.doesNotMatch(
      answered,
      /просто начална стойност/i,
      `the reader's own pay is still called a starting value: ${answered.replace(/\s+/g, " ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("neither pay comparison is painted as a verdict", { skip }, async () => {
  // `--real` and `--erode` mean the reader's figure beat or lost to the
  // country's, and they are right where a quantity HAS a good end — a rent
  // burden, a basket rising faster than the average one. A distance from a
  // mean does not have one. Both Sofia's mean and the country's sit above
  // their medians, so «41% над средната» painted green tells a reader they are
  // doing well by a measure that is not the middle, which is what the card's
  // own flattery caveat denies and what `mirror.js#meanRungPosition` exists to
  // correct. P6: we describe, we do not advise.
  //
  // Both directions, because the failure that matters is half a fix — a
  // neutral «над» beside a red «под» still reads the gap as a verdict, and it
  // is the reading a reader below the average is likeliest to take personally.
  await withApp(async (page, errors) => {
    const verdicts = await page.evaluate(() => {
      const resolve = (token) => {
        const probe = document.createElement("div");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      return ["--real", "--real-ink", "--erode", "--erode-ink"].map(resolve);
    });

    // €2,100 is above the Sofia average and below section J's, so one pass
    // already covers both directions; €900 puts both below, which is where the
    // red used to land hardest.
    const seen = new Set();
    for (const pay of ["2100", "900"]) {
      await page.locator("#inSalary").fill(pay);
      await page.waitForTimeout(300);
      await page.locator("#sector-pick").selectOption("Information and communication");
      await page.waitForTimeout(300);

      const lines = await page
        .locator(".m-pay .gap")
        .evaluateAll((els) =>
          els.map((el) => ({ text: el.innerText, color: getComputedStyle(el).color }))
        );
      assert.equal(lines.length, 2, `€${pay} rendered ${lines.length} comparison lines, not 2`);
      for (const line of lines) {
        assert.ok(
          !verdicts.includes(line.color),
          `«${line.text.slice(0, 48)}» is painted ${line.color}, which is a verdict ` +
            "colour — a distance from an average has no good end"
        );
        // The sign is still on the page. Dropping the colour is only honest
        // while the direction is a word, and a line that lost both says
        // nothing.
        // Whitespace, never `\b`: a JS word boundary is defined on
        // [A-Za-z0-9_], so it never fires beside Cyrillic and `\bнад\b`
        // matches nothing at all — an assertion that passes whatever the page
        // says.
        const word = line.text.match(/(?:^|\s)(над|под)(?:\s|$)/);
        assert.ok(word, `«${line.text.slice(0, 48)}» states no direction at €${pay}`);
        seen.add(word[1]);
      }
    }
    assert.deepEqual(
      [...seen].sort(),
      ["над", "под"],
      "only one direction was exercised, so a half-neutralised pair would pass"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("adding an income changes nothing until it is answered", { skip }, async () => {
  // A second field seeded with the €900 placeholder would add €900 to the rent
  // burden, the mortgage cap and the basket the moment it appeared — a figure
  // the reader never typed, moving every number on the page in the flattering
  // direction. So the row arrives empty and contributes nothing.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    // The gross out of the summary line, whichever of the two wordings is on
    // screen. The SENTENCE is expected to change — with two incomes it has to
    // say which one it is about — and the FIGURE is expected not to.
    const grossNow = async () =>
      /бруто\)[^\d]*([\d\s\u00a0\u202f]+)/.exec(await page.locator(".m-pay").innerText())?.[1];

    const before = await page.locator(".r-big").innerText();
    const grossBefore = await grossNow();
    assert.ok(grossBefore, "no gross was rendered for a typed salary");

    await page.getByRole("button", { name: /добави още един доход/i }).click();
    await page.waitForTimeout(400);

    assert.equal(await page.locator("#inEarner1").count(), 1, "no second field appeared");
    assert.equal(
      await page.locator(".r-big").innerText(),
      before,
      "an empty second income moved the reader's inflation figure"
    );
    assert.equal(
      await grossNow(),
      grossBefore,
      "an empty second income moved the household's gross"
    );
    assert.equal(
      await page.locator(".m-pay details.payslip").count(),
      1,
      "an empty second income drew a payslip for a person nobody described"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("two incomes are taxed as two contracts, not as one salary", { skip }, async () => {
  // THE DEFECT THIS FEATURE EXISTS TO FIX, checked on the rendered page rather
  // than on a function. Two people taking home €2,000 each are both under the
  // insurance ceiling, so their contracts come to ≈€5,078 gross. Adding the
  // nets first and inverting once applies one ceiling to two people and prints
  // ≈€4,761 — €317 a month adrift, inside every plausible band, and wrong in a
  // way no other test on this page can see.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2000");
    await page.getByRole("button", { name: /добави още един доход/i }).click();
    await page.locator("#inEarner1").fill("2000");
    await page.waitForTimeout(400);

    const pay = await page.locator(".m-pay").innerText();
    const gross = Number(
      (/по договорите \(бруто\) заедно ≈ ([\d\s ]+)/.exec(pay)?.[1] ?? "0").replace(/\D/g, "")
    );
    assert.ok(
      gross >= 5000,
      `the household's gross rendered as ${gross}, which is the single-salary ` +
        "inversion rather than the sum of two contracts"
    );
    // One payslip per person, because a payslip is a document one person gets.
    assert.equal(await page.locator(".m-pay details.payslip").count(), 2, "not one payslip each");
    assert.match(pay, /общо в домакинството/i, "the household total is not stated");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ladder ranks each earner, and marks each of them", { skip }, async () => {
  // The rungs are individual full-time earnings. Ranking a household total on
  // them reports two people on €900 each as out-earning 78% of Sofia — a
  // position nobody in that household holds.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("900");
    await page.getByRole("button", { name: /добави още един доход/i }).click();
    await page.locator("#inEarner1").fill("900");
    await page.waitForTimeout(400);

    const row = page.locator(".r-row").filter({ hasText: "къде си по заплата" });
    assert.equal(await row.locator(".pctbar .me").count(), 2, "not one marker per earner");
    // The per-income lines are the working behind the corner's range and sit
    // one tap in. Opened here rather than asserted through the closed
    // disclosure, because what this test is about is that each income is
    // ranked on its own rung — not where on the card that is said.
    await row.locator("details.rr-more summary").first().click();
    await page.waitForTimeout(200);
    const text = await row.innerText();
    assert.match(text, /доход 1/i, "the first income has no line of its own");
    assert.match(text, /доход 2/i, "the second income has no line of its own");
    // Two equal earners sit at the same rung, so the corner states one figure
    // rather than a range — and it is each of theirs, not their sum's.
    const alone = /доход 1[^\n]*изпреварва[^\d]*(\d+)%/i.exec(text)?.[1];
    assert.ok(alone, `no rank was rendered for the first income: ${text.replace(/\s+/g, " ")}`);
    assert.ok(
      Number(alone) < 50,
      `€900 was ranked at the ${alone}th percentile — the household total was ranked instead`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("switching to gross moves the field and nothing else", { skip }, async () => {
  // The toggle is a display choice, the same contract the basket's %/€ toggle
  // keeps: the number in the box changes and no result does. Re-reading the
  // typed 900 as a gross instead would rewrite every figure on the page while
  // the reader believes they changed a label.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const inflation = await page.locator(".r-big").innerText();
    const pairBefore = await page.locator(".m-pay .pair").innerText();

    await page.getByRole("button", { name: /^бруто$/i }).click();
    await page.waitForTimeout(400);

    const typed = Number(await page.locator("#inSalary").inputValue());
    assert.ok(
      typed > 2400 * 1.2,
      `the field still reads ${typed} — the toggle relabelled the number instead of converting it`
    );
    assert.equal(
      await page.locator(".r-big").innerText(),
      inflation,
      "flipping the basis moved the reader's inflation figure"
    );
    assert.equal(
      await page.locator(".m-pay .pair").innerText(),
      pairBefore,
      "flipping the basis moved the net/gross pair it is supposed to leave alone"
    );

    // Back again restores exactly what was typed, rather than a rounded
    // conversion of a rounded conversion.
    await page.getByRole("button", { name: /^нето$/i }).click();
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator("#inSalary").inputValue(),
      "2400",
      "the salary crept on a round trip"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "each income is asked for its own raise, and the row waits for all of them",
  { skip },
  async () => {
    // A household's rise is not one number people share, and a blank read as 0%
    // is an invented figure that drags the combined answer down. So the pocket
    // row names the income still missing rather than answering around it.
    await withApp(async (page, errors) => {
      await page.locator("#inSalary").fill("1000");
      await page.getByRole("button", { name: /добави още един доход/i }).click();
      await page.locator("#inEarner1").fill("1000");
      await page.waitForTimeout(400);

      assert.equal(
        await page.locator("#inRaise1").count(),
        1,
        "the second income got no raise field"
      );

      await page.locator("#inRaise").fill("20");
      await page.waitForTimeout(400);
      const row = page.locator(".r-row").filter({ hasText: "джоб" }).first();
      const waiting = await row.innerText();
      assert.match(
        waiting,
        /доход 2/i,
        `the row did not name the income it is waiting for: ${waiting.replace(/\s+/g, " ")}`
      );

      await page.locator("#inRaise1").fill("0");
      await page.waitForTimeout(400);
      const answered = await row.innerText();
      // €1,000 each, one at +20% and one at nothing: the household went from
      // €1,833 to €2,000, a rise of 9.1% — NOT the 10% a plain average gives.
      assert.match(
        answered,
        /9[.,]1%/,
        `the combined raise was not weighted by the earlier pay: ${answered.replace(/\s+/g, " ")}`
      );
      assert.match(
        answered,
        /доход 1: \+20/i,
        "the parts the combined figure was built from are not shown"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test.after(shutdown);
