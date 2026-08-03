/**
 * The results card — the headline, the verdict, the ladder and the working
 * under them.
 *
 * This is where the reader's own number is placed against the country's, so
 * these are mostly about what may be said and when: a rank that waits for a
 * salary, a caveat that never travels without the figure it qualifies, a
 * disclosure that opens onto both languages, and a live region scoped to the
 * headline rather than to fifty numbers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shutdown, skip, withApp } from "./render-harness.mjs";

test("the results card announces the headline, not fifty numbers", { skip }, async () => {
  // The whole `.m-card` was a polite live region, so a screen-reader user
  // dragging a slider had the big number, both bars, the verdict, eight ranked
  // rows, five result rows and the formula table re-announced on every tick.
  await withApp(async (page, errors) => {
    const cardIsLive = await page.locator('.m-card[aria-live="polite"]').count();
    assert.equal(
      cardIsLive,
      0,
      "the entire results card is a live region again — every slider tick " +
        "re-announces every number in it"
    );
    assert.ok(
      await page.locator('[aria-live="polite"][aria-atomic="true"]').count(),
      "the headline block lost its live region — the number the reader is " +
        "changing is no longer announced at all"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the verdict names the comparison in words, over bars that keep both figures",
  { skip },
  async () => {
    // Two halves of one rule, and they pull against each other — which is why
    // they are asserted together rather than in two tests that can be satisfied
    // one at a time.
    //
    // The bars own the figures: the reader's rate and the average, labelled, to
    // one decimal, over the period the caption above them names. Deleting one
    // to shorten the card takes a published number off the default view, and
    // `barCeiling` exists so the pair can be compared by length.
    //
    // The paragraph under them owns the words. It says which rate is bigger and
    // whether the gap is worth calling one — the thing two bars cannot say — and
    // it says it without a figure, because a percentage there is the pair above
    // reprinted 20px lower, and a reader who meets the same number twice looks
    // for the difference between the copies.
    await withApp(async (page, errors) => {
      const bars = page.locator(".vbars .num");
      const verdict = page.locator("p.m-verdict");

      // Default load: the reader's weights ARE the official ones, so the two
      // rates agree and the card's verdict is the near one.
      const onLoad = (await bars.allInnerTexts()).map((s) => s.trim());
      assert.equal(onLoad.length, 2, `the comparison lost a bar: ${onLoad.join(" | ")}`);
      for (const shown of onLoad) {
        assert.match(shown, /\d+[.,]\d%/, `a bar states no rate to one decimal: "${shown}"`);
      }
      assert.match(await verdict.innerText(), /близо до средностатистическата/);

      // A weight moved onto transport, so the basket parts company with the
      // average one and the verdict has a direction to state.
      await page.locator('input[type="range"]').nth(6).fill("40");
      await page.waitForTimeout(400);

      const moved = (await bars.allInnerTexts()).map((s) => s.trim());
      assert.notEqual(
        moved[0],
        onLoad[0],
        "the reader's bar ignored a weight moved onto transport"
      );
      assert.notEqual(
        moved[0],
        moved[1],
        "the two bars state the same rate after the basket moved"
      );

      const said = (await verdict.innerText()).replace(/\s+/g, " ").trim();
      assert.match(said, /по-скъпо|по-евтино/, `the verdict states no direction: "${said}"`);
      assert.doesNotMatch(
        said,
        /\d/,
        `the verdict reprints a figure the bars above it already carry: "${said}"`
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the explainer causes no horizontal overflow on a 360px viewport", { skip }, async () => {
  // The explainer (`ExplainerBand.svelte`) opens a disclosure containing a nested
  // `.fx` block with unbreakable math tokens (`<code>`, `<sub>`, `<sup>`). Without
  // `overflow-x: auto` on `.how` and `overflow-wrap: anywhere` on `.how .fx code`,
  // these tokens force the box wider than the page and the page scrolls
  // horizontally on a phone viewport.
  //
  // Two things must hold: the page has no horizontal overflow when the explainer
  // is open, and the explainer's right edge stays within the viewport.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 360, height: 800 });

    // Open the explainer (the outer `.how` disclosure at the foot of the page).
    const explainer = page.locator(".explain-band > .wrap > details.how");
    assert.ok(
      await explainer.count(),
      "the explainer (details.how in .explain-band) is missing from the page"
    );
    await explainer.locator("summary").first().click();
    await page.waitForTimeout(200);

    // Open the nested math block inside it.
    const mathBlock = explainer.locator("details.fx");
    if (await mathBlock.count()) {
      await mathBlock.locator("summary").first().click();
      await page.waitForTimeout(200);
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    assert.ok(
      scrollWidth <= clientWidth,
      `the page is ${scrollWidth}px wide with a ${clientWidth}px viewport ` +
        "— the explainer caused horizontal overflow"
    );

    const explainerRight = await page.evaluate(() => {
      const el = document.querySelector(".explain-band details.how");
      if (!el) return null;
      return el.getBoundingClientRect().right;
    });
    assert.ok(
      explainerRight !== null,
      "the explainer (details.how in .explain-band) has no bounding rect — it is missing or invisible"
    );
    assert.ok(
      explainerRight <= 360,
      `the explainer's right edge is ${explainerRight}px, past the 360px viewport`
    );

    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "an untouched salary is named where its figures are, and clears on typing",
  { skip },
  async () => {
    // The €900 default is a worked example, and the hint that says so is bound
    // to the input. On a phone the results card is ordered first (card.css) and
    // that input lands ~3,100px below the figures it qualifies, so the caveat
    // has to be repeated where the numbers are or it reaches the reader four
    // screens late. The amount is interpolated, not written into the copy, so
    // the note cannot drift from `Calculator#salary`.
    await withApp(async (page, errors) => {
      const note = page.locator(".m-card .placeholder");
      assert.equal(
        await note.count(),
        1,
        "the results card names no starting salary on first paint"
      );
      assert.match(
        await note.innerText(),
        /900/,
        "the note does not carry the amount it is a caveat about"
      );

      // …and it goes the moment the figures become the reader's own. A caveat
      // that outlives its cause teaches the reader to read past it.
      await page.locator("#inSalary").fill("2400");
      await page.waitForTimeout(300);
      assert.equal(
        await note.count(),
        0,
        "the starting-salary note survived the reader typing their own pay"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the route from the headline to the salary field lands on it", { skip }, async () => {
  // The link from the figures to the field they are priced off. It has to
  // focus rather than merely scroll: focus is what raises the phone keyboard,
  // so one tap leaves the reader typing instead of hunting.
  //
  // Assert the focus, never the distance. The phone order puts the pay field
  // above the results, so the journey is short and this button is a
  // convenience rather than the only connection across 3,100px — but a check
  // gated on a minimum gap (1,500px was the tempting threshold) turns itself
  // off the moment the page gets shorter, which is exactly when somebody would
  // most like to know the link still works.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.waitForTimeout(200);

    await page.locator(".m-card .placeholder button").click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "inSalary",
      "the button did not put the caret in the salary field"
    );

    // Focused, and actually on screen: `focus({preventScroll: true})` without
    // the scroll that follows it leaves the reader typing into a field 3,000px
    // away, with the page still showing the figure they tapped.
    const box = await page.locator("#inSalary").boundingBox();
    const height = page.viewportSize().height;
    assert.ok(
      box.y >= 0 && box.y + box.height <= height,
      `the salary field sits at ${Math.round(box.y)}px in a ${height}px viewport — off screen`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ladder row ranks nobody who has not typed a salary", { skip }, async () => {
  // «Изпреварваш 34% от работещите в София» is a claim about the READER, in
  // the second person, and on first paint it is a claim about whoever earns
  // the €900 placeholder. Unlike the euro figures above it, no caveat makes
  // an unasked ranking land well, so the row waits — the same thing PocketRow
  // does with an empty raise.
  //
  // Both halves are gated: the corner figure as well as the sentence. A bare
  // «пред 34%» above a prompt asking for a salary is the claim with its
  // caveat removed.
  await withApp(async (page, errors) => {
    const row = page.locator(".r-row").filter({ hasText: "къде си по заплата" });
    assert.equal(await row.count(), 1, "the ladder row is missing from the results card");
    const idle = await row.innerText();
    assert.doesNotMatch(
      idle,
      /изпреварваш|пред \d/i,
      `the ladder ranked an untouched placeholder: ${idle.replace(/\s+/g, " ")}`
    );

    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const answered = await row.innerText();
    assert.match(
      answered,
      /изпреварваш/i,
      `the ladder stayed silent after a salary was typed: ${answered.replace(/\s+/g, " ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("nothing that makes a figure checkable is folded out of view", { skip }, async () => {
  // The results card tiers what it shows: the figure, one plain sentence and
  // its caveat stay put, and the working goes one tap in. Three things may
  // never take that trip, and they are the three a density pass reaches for
  // first because they are small and grey — a source caption, a verify link,
  // and the reference period beside them.
  //
  // «Nothing may degrade the explainer, the verify links or the source
  // captions» (docs/principles.md §"Publish the method"). A caption a reader
  // has to go looking for has been downgraded as surely as one that was
  // deleted, and this is the check that says so, because the difference is
  // invisible in a diff that only adds a `<details>`.
  //
  // The explainer band and the method drawer are exempt by name: both are
  // whole sections behind one disclosure, they carry no figure of their own
  // that is not repeated on the card, and putting the published method behind
  // one summary is the §9.2 obligation met rather than dodged.
  await withApp(async (page, errors) => {
    // A salary, so every row that waits for one is drawn and can be checked.
    await page.locator("#inSalary").fill("2400");
    await page.locator("#inRent").fill("600");
    await page.waitForTimeout(400);

    const buried = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll(".rr-note.ss, .ss, .vlink")) {
        for (let n = el.parentElement; n; n = n.parentElement) {
          if (n.classList?.contains("explain-band")) break;
          if (n.tagName === "DETAILS" && !n.open) {
            out.push(`${el.className} — «${(el.textContent || "").trim().slice(0, 60)}»`);
            break;
          }
        }
      }
      return out;
    });
    assert.deepEqual(
      buried,
      [],
      "these source captions or verify links sit inside a disclosure that is " +
        "closed by default, so a reader has to find them before they can " +
        "check anything:\n  " +
        buried.join("\n  ")
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ladder's caveat never travels without the rank it qualifies", { skip }, async () => {
  // The rule the whole tiering runs on: prose may move down a tier, a caveat
  // attached to a claim still on screen may not. This is the instance that
  // matters most, because the ladder's caveat is the longest paragraph on the
  // card and therefore the most tempting thing on it to fold — and the claim
  // it qualifies is a second-person ranking of the reader against their
  // neighbours, read off a national survey re-levelled onto Sofia.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);

    const row = page.locator(".r-row").filter({ hasText: "къде си по заплата" });
    const shown = await row.innerText();
    assert.match(shown, /изпреварваш/i, "the ladder states no rank to qualify");
    // `innerText` skips a closed `<details>`, which is the whole point: this
    // fails if the caveat is folded even though the string is still in the DOM.
    assert.match(
      shown,
      /приблизително къде си, а не точно/i,
      `the rank is on screen and its caveat is not: ${shown.replace(/\s+/g, " ").slice(0, 300)}`
    );

    // The answer block restates the same rank a screen higher, so it carries
    // the short form of the same admission rather than the bare figure.
    const answer = await page.locator(".ans").innerText();
    assert.match(
      answer,
      /приблизително/i,
      `the answer block ranks the reader with nothing attached: ${answer.replace(/\s+/g, " ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the plain answer sits between the headline and the working", { skip }, async () => {
  // Readers arrive asking three things and the card answers each under its own
  // derivation, two and three screens down a phone. The answer block says them
  // once, in front — which is only true while it is drawn after the figure it
  // is about and before the table that explains it. Asserted as an ordering,
  // never as a pixel: every number here moves with the next copy edit.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);

    const y = await page.evaluate(() => {
      const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? null;
      return { big: top(".r-big"), answer: top(".ans"), rank: top(".rank"), pocket: null };
    });
    assert.ok(y.big !== null && y.answer !== null && y.rank !== null, "a region is missing");
    assert.ok(y.answer > y.big, "the plain answer is drawn above the figure it is about");
    assert.ok(
      y.rank > y.answer,
      "the ranked table is drawn above the answer it is the working for"
    );

    // …and it says what it is for. The pay verdict and the ladder position are
    // otherwise the pocket row and the ladder row, well below the fold.
    const answer = await page.locator(".ans").innerText();
    assert.match(answer, /изпреварва|изостава|наравно|стояла|намаляла|вдигнаха/i, "no pay clause");
    assert.match(answer, /работещите в София/i, "no ladder clause");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the plain answer waits for a salary before it places the reader", { skip }, async () => {
  // The same rule as the ladder row itself, one screen higher up. A summary
  // that outran it would put «изпреварваш 34%» about the €900 placeholder at
  // the top of the card — the exact defect PercentileRow refuses to print in
  // its own corner, reintroduced above it.
  await withApp(async (page, errors) => {
    const idle = await page.locator(".ans").innerText();
    assert.doesNotMatch(
      idle,
      /изпреварваш \d|пред \d/i,
      `the answer ranked an untouched placeholder: ${idle.replace(/\s+/g, " ")}`
    );
    assert.match(idle, /Въведи своята заплата/i, "the answer neither ranks nor asks");

    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const answered = await page.locator(".ans").innerText();
    assert.match(
      answered,
      /пред \d+% от работещите в София/i,
      `the answer stayed silent after a salary was typed: ${answered.replace(/\s+/g, " ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("every disclosure on the card opens onto both languages", { skip }, async () => {
  // A missing string renders as a blank line rather than a fallback, and
  // inside a closed `<details>` it renders as a blank line nobody has looked
  // at. Opening each one and reading both language subtrees is the only way
  // this is visible: the copy suite checks that COPY entries ship in pairs,
  // not that a template rendered both of them.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2400");
    await page.locator("#inRaise").fill("4");
    await page.waitForTimeout(400);

    const empty = await page.evaluate(() => {
      const out = [];
      for (const details of document.querySelectorAll(".m-results details.rr-more")) {
        details.open = true;
        const body = details.querySelector(".rr-more-body, ul, div");
        const text = (sel) =>
          [...(body?.querySelectorAll(sel) ?? [])].map((s) => s.textContent.trim()).join("");
        const label = (details.querySelector("summary")?.textContent || "").trim().slice(0, 40);
        if (!text(".l-bg")) out.push(`${label} — nothing in Bulgarian`);
        if (!text(".l-en")) out.push(`${label} — nothing in English`);
      }
      return out;
    });
    assert.deepEqual(empty, [], empty.join("; "));

    // And the chips are real controls, which the disclosure test above checks
    // for the first `summary.disclose` on the page — these are the ones inside
    // the results card, which that test never reaches.
    const chips = await page.locator(".m-results summary.disclose").count();
    assert.ok(chips > 0, "the results card folds nothing, or folds it without a disclosure chip");
    assert.equal(
      await page.locator(".m-results summary.disclose .dc-caret").count(),
      chips,
      "a disclosure in the results card has no caret, so it reads as a badge"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("every verify link is drawn the same, in both cards", { skip }, async () => {
  // `.vlink` is the "↗" that makes a row checkable, and it is drawn in the
  // basket and in the ranked contributions — two components, so a scoped
  // `<style>` can only reach one of them. It did: the ranked list rendered
  // browser-default 14px sans with a solid underline and `white-space:
  // normal`, which on a 390px phone broke the line between «CP09» and its
  // arrow and left the arrow hanging alone.
  //
  // Comparing the two against each other rather than against literal values
  // is deliberate — the point is that neither can be restyled alone.
  await withApp(async (page, errors) => {
    const styles = await page.evaluate(() => {
      const read = (el) => {
        const s = getComputedStyle(el);
        return {
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          color: s.color,
          whiteSpace: s.whiteSpace,
          borderBottomStyle: s.borderBottomStyle,
          textDecorationLine: s.textDecorationLine,
        };
      };
      const basket = document.querySelector("#sliders .vlink");
      const ranked = document.querySelector(".rank .vlink");
      return { basket: basket && read(basket), ranked: ranked && read(ranked) };
    });
    assert.ok(styles.basket, "no verify link in the basket");
    assert.ok(styles.ranked, "no verify link in the ranked contributions");
    assert.deepEqual(
      styles.ranked,
      styles.basket,
      "the two cards draw the same link differently — a scoped copy of `.vlink` " +
        "has come back into one component and left the other on browser defaults"
    );
    assert.equal(
      styles.ranked.whiteSpace,
      "nowrap",
      "the code and its arrow can break across lines"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test.after(shutdown);
