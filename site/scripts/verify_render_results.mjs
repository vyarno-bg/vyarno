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

test("the headline says whose basket it is until the reader says otherwise", { skip }, async () => {
  // Every visitor arrives on Eurostat's weights, so the biggest figure on the
  // page is the country's until they move something. Three things have to hold
  // at once for that to be honest, and each fails differently: the label must
  // not call it theirs, a note must say whose it is, and the note must carry
  // the route — the basket heading is 3,668px below this figure at 360px, and a
  // caveat naming a control four screens away has no second half.
  await withApp(async (page, errors) => {
    const label = page.locator(".r-lbl");
    const note = page.locator(".m-card .m-preset-note");

    const before = (await label.innerText()).replace(/\s+/g, " ").trim();
    assert.doesNotMatch(
      before,
      /тво[яей]/i,
      `the headline claims the country's basket as the reader's: "${before}"`
    );
    assert.match(
      before,
      /средностатистическата кошница/,
      `the headline names no basket at all: "${before}"`
    );
    assert.equal(await note.count(), 1, "nothing on the card says whose basket the figure is");
    assert.match(
      (await note.innerText()).replace(/\s+/g, " ").trim(),
      /Евростат/,
      "the note does not name the basket the figure was computed from"
    );

    // The route lands the reader on the heading that says what the thirteen
    // rows are, not partway down the list of them. Asserted as "on screen and
    // near the top" rather than at a pixel: the assertion is that the reader
    // arrives able to read the instruction.
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(200);
    await note.locator("button").click();
    await page.waitForTimeout(300);
    const box = await page.locator("#basket").boundingBox();
    assert.ok(
      box && box.y >= 0 && box.y < 200,
      `the basket heading sits at ${box ? Math.round(box.y) : "nowhere"}px after the route was taken`
    );

    // And the claim is earned the moment the reader describes anything: the
    // label takes «твоята» back and the note goes, because what it caveats has
    // stopped being true.
    await page.locator("#sliders .cat > input[type=range]").nth(6).fill("40");
    await page.waitForTimeout(400);
    assert.match(
      (await label.innerText()).replace(/\s+/g, " ").trim(),
      /тво[яей]/i,
      "the headline still disowns a basket the reader has edited"
    );
    assert.equal(await note.count(), 0, "the note outlived the basket it was a caveat about");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the window the figure is measured over is a control beside it", { skip }, async () => {
  // The anchor decides which two dates the published index is read at, and the
  // headline, its € line, both bars and the ranked column are all different
  // numbers under a different one. A reader who never finds it never learns the
  // figure has a window — so the constraint is the DISTANCE, and the assertion
  // is that both fit one phone screen together rather than that the select sits
  // in a named element.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(200);

    const [select, figure] = await Promise.all([
      page.locator("#inAnchor").boundingBox(),
      page.locator(".r-big").boundingBox(),
    ]);
    assert.ok(select && figure, "the anchor control or the headline figure is gone");
    assert.ok(
      Math.abs(select.y - figure.y) < 780,
      `the window control is ${Math.round(Math.abs(select.y - figure.y))}px from the figure it ` +
        `governs, on a 780px screen`
    );

    // Changing it changes the headline. Without this the control could be moved
    // anywhere and left wired to nothing.
    const before = await page.locator(".r-big").innerText();
    await page.locator("#inAnchor").selectOption("2020");
    await page.waitForTimeout(400);
    assert.notEqual(
      (await page.locator(".r-big").innerText()).trim(),
      before.trim(),
      "the headline ignored the window it is measured over"
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
    // The bars own the figures: each rate labelled, to one decimal, over the
    // period the caption above them names. Dropping one of a live PAIR to
    // shorten the card takes a published number off the default view, and
    // `barCeiling` exists so the two can be compared by length.
    //
    // The paragraph under them owns the words. It says which rate is bigger and
    // whether the gap is worth calling one — the thing two bars cannot say — and
    // it says it without a figure, because a percentage there is the pair above
    // reprinted 20px lower, and a reader who meets the same number twice looks
    // for the difference between the copies.
    //
    // **Both halves are gated on there being two baskets.** Until a slider
    // moves, the reader's weights ARE Eurostat's, so a second bar is the first
    // one relabelled — identical rate, identical width — and the paragraph
    // reports the official basket's distance from itself as a finding about the
    // reader. What the card may say then is one basket's rise; what arrives on
    // the first drag is the comparison. This test walks that transition, and
    // the count of bars is the load-bearing assertion at both ends.
    await withApp(async (page, errors) => {
      const bars = page.locator(".vbars .num");
      const verdict = page.locator("p.m-verdict");

      // Default load: the reader's weights ARE the official ones, so there is
      // one basket on the card and nothing to compare it with. One bar, and no
      // verdict — the paragraph pronounces on a gap, and the gap is zero
      // because the two sides are one number rather than because two baskets
      // came out alike.
      const onLoad = (await bars.allInnerTexts()).map((s) => s.trim());
      assert.equal(
        onLoad.length,
        1,
        `the card draws a comparison before there is one: ${onLoad.join(" | ")}`
      );
      assert.match(
        onLoad[0],
        /\d+[.,]\d%/,
        `the bar states no rate to one decimal: "${onLoad[0]}"`
      );
      assert.equal(
        await verdict.count(),
        0,
        "the card pronounces on a comparison between the official basket and itself"
      );

      // A weight moved onto transport, so the basket parts company with the
      // average one — and the comparison arrives as the result of doing
      // something rather than as the state the reader landed in.
      // Scoped to the basket's own rows. An unscoped `input[type="range"]` counts
      // every rail on the page, so the index means "the seventh division" only
      // for as long as nothing else on the card is a slider — and the
      // spend-share control above the list is one.
      await page.locator("#sliders .cat > input[type=range]").nth(6).fill("40");
      await page.waitForTimeout(400);

      const moved = (await bars.allInnerTexts()).map((s) => s.trim());
      assert.equal(moved.length, 2, `the comparison lost a bar: ${moved.join(" | ")}`);
      for (const shown of moved) {
        assert.match(shown, /\d+[.,]\d%/, `a bar states no rate to one decimal: "${shown}"`);
      }
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

test("a ranked row sends the reader to the slider behind it", { skip }, async () => {
  // The ranked list answers "which of the thirteen is my number made of" in the
  // reader's own points, exactly — and it is a readout 3,500px from the
  // controls. The route is what makes it navigation, so the assertion is that
  // the row a reader tapped is the row they arrive at, focused: sending them to
  // the basket generally is what the headline note already does.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(200);

    const row = page.locator(".rank .rankrow").first();
    const code = await row.locator("a.vlink").innerText();
    const cp = code.replace(/[^A-Z0-9]/g, "");
    await row.locator("button.rk-to").click();
    await page.waitForTimeout(300);

    assert.equal(
      await page.evaluate(() => document.activeElement?.closest(".cat")?.id),
      `cat-${cp}`,
      `the top ranked row is ${cp} and the reader landed somewhere else`
    );
    const box = await page.locator(`#cat-${cp}`).boundingBox();
    const height = page.viewportSize().height;
    assert.ok(
      box.y >= 0 && box.y + box.height <= height,
      `${cp} sits at ${Math.round(box.y)}px in a ${height}px viewport — off screen`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the two official rates have a route between them, on one screen", { skip }, async () => {
  // The banner's official rate and the average-basket bar are visible together
  // on a 1100x1000 screen and differ for two compounding reasons — a flash
  // month against the divisions' month, and Σ(w·r) against the chain-linked
  // all-items. The explainer reconciles them well, three screens down inside a
  // closed disclosure that a reader who has already decided one figure is
  // wrong will not open. A route is what closes that, and it has to be a route
  // rather than a repeat: a third rate beside the bars is the second headline
  // number docs/principles.md closes.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.waitForTimeout(300);

    const route = page.locator(".m-gap-route button");
    assert.equal(await route.count(), 1, "the two rates share a screen with nothing between them");

    // On screen WITH the figures it is about — a route below the fold answers
    // a question the reader has already stopped asking.
    const banner = await page.locator(".data-strip-inner .off-fig").boundingBox();
    const box = await route.boundingBox();
    assert.ok(banner && box, "the banner or the route did not render a box");
    assert.ok(
      box.y + box.height <= 1000,
      `the route sits at y=${Math.round(box.y)} on a 1000px screen showing the ` +
        `banner at y=${Math.round(banner.y)} — the reader has to scroll to find it`
    );

    // It states no rate. Restating the reconciliation beside the bars is the
    // arrangement this replaces, and the verdict a few lines up is figure-free
    // for the same reason.
    const text = await route.innerText();
    assert.doesNotMatch(
      text,
      /\d/,
      `the route carries a figure — «${text}» — which is a third rate next to the two bars`
    );

    // And it arrives. Two steps, because the destination is inside a closed
    // `<details>`: a bare fragment link scrolls some browsers to a collapsed
    // block with nothing in it.
    const band = page.locator(".explain-band details.explain");
    assert.equal(await band.evaluate((el) => el.open), false, "the band starts open");
    await route.click();
    await page.waitForTimeout(400);
    assert.equal(
      await band.evaluate((el) => el.open),
      true,
      "the route left the explainer closed, so it scrolled to a folded block"
    );
    const heading = await page.locator("#two-official").boundingBox();
    assert.ok(heading, "the reconciliation heading is not on the page — the route lands nowhere");
    assert.ok(
      heading.y >= 0 && heading.y <= 1000,
      `the route opened the band but left the answer at y=${Math.round(heading.y)}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ladder row ranks nobody who has not typed a salary", { skip }, async () => {
  // «Изпреварваш 34% от работещите в страната» is a claim about the READER, in
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

test("a row built on an optional figure waits until there is one", { skip }, async () => {
  // The rent and the savings balance are the two amounts the calculator can
  // answer without, and their rows are the two that state a second-person
  // result off them: «това е 40% от €1500 нетно», «инфлацията изяде €285».
  // Neither has a caveat available to it the way the €900 pay placeholder
  // does — that note sits on the figure it produced and says whose salary it
  // is — so a stand-in balance renders as a finding about a visitor who has
  // typed nothing. The rule both rows keep is `payslipPanel`'s: there is no
  // receipt for a number nobody entered (view/payroll.js).
  //
  // Over both rows rather than over the one that broke it. A check naming
  // «спестеното» stays green when the rent field acquires a friendly default
  // next, and the two rows are one rule, not two.
  await withApp(async (page, errors) => {
    const rows = { "#inRent": "наемът", "#inCash": "спестеното" };
    for (const [input, heading] of Object.entries(rows)) {
      const row = page.locator(".r-rows > .r-row").filter({ hasText: heading });
      assert.equal(
        await row.count(),
        0,
        `«${heading}» is on the card before anything was typed into ${input}, so ` +
          "it is stating a result off a figure the reader never gave"
      );
      const field = page.locator(input);
      assert.equal(await field.inputValue(), "0", `${input} does not start empty`);
    }
    await page.locator("#inSalary").fill("1500");
    await page.locator("#inRent").fill("600");
    await page.locator("#inCash").fill("1000");
    await page.waitForTimeout(400);
    for (const heading of Object.values(rows)) {
      assert.equal(
        await page.locator(".r-rows > .r-row").filter({ hasText: heading }).count(),
        1,
        `«${heading}» stayed away after a figure was typed for it`
      );
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("no amount on the results card is separated from its unit", { skip }, async () => {
  // «≈ €13/ мес», because the slash closed a <span> and the unit opened the
  // next one on the following source line, and Svelte renders that newline as
  // a space. Every other rate on the page is «€/мес» closed up.
  //
  // Read off the DOM rather than out of the template: the seam is whitespace,
  // and a source assertion on whitespace is one Prettier can fail without any
  // behaviour changing — the mistake verify_wiring.mjs's header records paying
  // for once already. A rule over the whole card rather than over this one
  // line, because the defect is the amount/unit seam and there are a dozen of
  // them.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2100");
    await page.waitForTimeout(400);
    const card = await page.locator(".m-results").innerText();
    // No `\b` after the unit: JS word boundaries are defined on [A-Za-z0-9_],
    // so there is never one at the end of «мес» and the pattern matched
    // nothing at all on the Bulgarian page. Caught by breaking the template on
    // purpose and watching this stay green.
    const split = [...card.matchAll(/\S*\/[ \t\n]+(?:мес|mo|м²|г\.)/g)].map((m) => m[0]);
    assert.deepEqual(split, [], `an amount is separated from its unit: ${split.join(" | ")}`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the wedge row states no gross for anyone who has not typed a salary", { skip }, async () => {
  // Same rule as the ladder row above, on the row that was breaking it.
  // «Заплатата ти преди удръжките (бруто) е ≈ €1160. От нея 22,4% отиват за
  // осигуровки и данък» is a claim about the reader's own contract, and on
  // first paint it was a claim about whoever earns the €900 placeholder — with
  // the pocket row and the ladder row both declining to answer beside it (P7).
  //
  // What the row must NOT lose is the system curve. `wedgeNone` states the
  // peak and the ceiling, the chart still draws, and both are built from
  // payroll.json with no reader in them — so the assertions run in both
  // directions: no personal gross before, the personal sentence after, and the
  // chart throughout.
  await withApp(async (page, errors) => {
    const row = page.locator(".r-row").filter({ hasText: "колко не стига до теб" });
    assert.equal(await row.count(), 1, "the wedge row is missing from the results card");

    const idle = await row.innerText();
    assert.doesNotMatch(
      idle,
      /Заплатата ти преди удръжките/i,
      `the wedge stated a placeholder's gross: ${idle.replace(/\s+/g, " ")}`
    );
    assert.match(
      idle,
      /Въведи заплата горе/i,
      `the wedge row lost the sentence written for this state: ${idle.replace(/\s+/g, " ")}`
    );
    assert.ok(await page.locator("svg.wedge").count(), "the system curve stopped being drawn");

    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);
    const answered = await row.innerText();
    assert.match(
      answered,
      /Заплатата ти преди удръжките/i,
      `the wedge stayed silent after a salary was typed: ${answered.replace(/\s+/g, " ")}`
    );
    assert.ok(await page.locator("svg.wedge").count(), "the chart went away once a salary arrived");
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
    assert.match(answer, /пред \d+% от работещите/i, "no ladder clause");
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
      /пред \d+% от работещите/i,
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

test("every figure a receipt row emphasises is painted like an emphasis", { skip }, async () => {
  // **A `<b>` the copy carries and a `<span class="b">` a component builds are
  // the same emphasis and were not the same style.** `result-row.css` lifted
  // the class to `--ink` at 600; the tag inherited the sentence's `--ink-2` and
  // carried nothing but the browser's default bold. Almost every figure in a
  // receipt row lives in the copy — «Заплатата ти купува с ≈ <b>€51</b> повече
  // всеки месец» has its amount in `content.js` — so the rule reached the few
  // spliced in by hand and missed the hundred that matter.
  //
  // Nothing caught it, and nothing could: the page renders, the figure is bold,
  // and the only tell is that it is the same grey as the words around it. An
  // emphasis indistinguishable in colour from its own sentence is not one.
  //
  // Asserted as "differs from the sentence it sits in" rather than "equals
  // `--ink`", because the claim is about contrast rather than about a token —
  // it stays true if the palette moves and goes red the moment either half of
  // the selector is dropped.
  await withApp(async (page, errors) => {
    await page.selectOption("#region-select", "varna");
    await page.locator("#inSalary").fill("2100");
    await page.locator("#inRent").fill("600");
    await page.locator("#inCash").fill("10000");
    await page.waitForTimeout(300);
    const raise = page.locator("#inRaise");
    if (await raise.count()) await raise.fill("8");
    await page.waitForTimeout(500);

    const marks = await page.evaluate(() =>
      [...document.querySelectorAll(".m-results .r-row .rr-t")].flatMap((line) => {
        const around = getComputedStyle(line).color;
        return [...line.querySelectorAll("b, .b")].map((el) => ({
          tag: el.tagName,
          text: el.innerText.replace(/\s+/g, " ").slice(0, 24),
          own: getComputedStyle(el).color,
          around,
        }));
      })
    );
    assert.ok(marks.length > 3, `only ${marks.length} emphasised figures found — the scan missed`);
    // Both spellings are on the page, or one of them could be styled and the
    // other absent and this would pass on the half that works.
    const tags = new Set(marks.map((m) => m.tag));
    assert.deepEqual([...tags].sort(), ["B", "SPAN"], `only ${[...tags]} reached the rows`);
    for (const m of marks) {
      assert.notEqual(
        m.own,
        m.around,
        `<${m.tag.toLowerCase()}> «${m.text}» is painted ${m.own}, the same as the ` +
          "sentence it sits in — bold alone at this size is not a figure standing out"
      );
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test.after(shutdown);
