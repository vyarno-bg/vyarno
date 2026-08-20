/**
 * The basket — the thirteen rows, the ready-made presets and the disclosure
 * chips that open onto the working.
 *
 * The rows are drawn from the published payload rather than a frozen list, so
 * a count assertion here is also the check that the iteration is live. The
 * chip and preset tests are about affordance: which control reads as
 * something to press, which state reads as loaded, and what a reader who
 * turned motion off is left with.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DIST } from "./render-dist.mjs";
import { shutdown, skip, withApp } from "./render-harness.mjs";

test("the basket's 12-month window names the divisions' month", { skip }, async () => {
  // The y1 anchor's per-division numbers ARE `categories[].annual_rate_pct`,
  // taken verbatim. Eurostat's flash publishes the all-items rate about two
  // weeks before those, so labelling the window from `hicp_headline.json`
  // dates June's rates as a July window — every figure on the page correct,
  // the sentence over them false, and no pipeline gate able to see it because
  // nothing published is wrong. Asserted in a browser against the payloads the
  // page actually fetched, because the failure is a rendered string.
  const [cats, head] = await Promise.all(
    ["hicp_categories", "hicp_headline"].map(async (n) =>
      JSON.parse(await readFile(join(DIST, "data", "published", `${n}.json`), "utf8"))
    )
  );
  const month = String(cats.categories[0].ref_period);
  await withApp(async (page, errors) => {
    const label = await page.locator("#inAnchor option[value='y1']").innerText();
    assert.ok(
      label.includes(month.replace("-", ".")),
      `the 12-month option reads "${label}" but the divisions describe ${month}`
    );
    if (head.ref_period !== month) {
      assert.ok(
        !label.includes(String(head.ref_period).replace("-", ".")),
        `the 12-month option reads "${label}" — that is the headline's month, and the ` +
          `divisions under it are at ${month}`
      );
    }
    // The hint under the same dropdown has always read the categories. It is
    // in the assertion so the two cannot drift apart again: a label and a hint
    // naming different months is the visible form of this bug.
    const hint = await page.locator("#inAnchor ~ .hint").first().innerText();
    assert.ok(
      hint.includes(month),
      `the anchor hint reads "${hint}" but the divisions describe ${month}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the disclosure chip reads as a control, and not as a verdict", { skip }, async () => {
  // `--real` means the reader's number is the good one, not "clickable". The
  // affordance is carried by SHAPE — a border and a caret — and the accent is
  // reserved for :hover / :focus-visible, where it is unambiguously about the
  // interaction. A resting chip painted in a semantic verdict colour puts two
  // meanings of one colour beside each other.
  await withApp(async (page, errors) => {
    // A salary first, because the payslip breakdown is the chip a reader
    // actually meets and it waits for one — until then the only `.disclose` on
    // the page is the formula block nested inside the closed explainer, whose
    // summary measures 0px because its ancestor is not rendered. Measuring
    // that one asserts nothing about a control anybody can tap.
    await page.locator("#inSalary").fill("2400");
    await page.waitForTimeout(400);

    const chip = page.locator("summary.disclose").first();
    // Same reason as the strip test above. This one degraded twice over: the
    // early return skipped the style assertions, and the caret check below
    // compares two counts that are both zero when the chips are gone, so
    // `assert.equal(carets, chips)` passes on nothing.
    assert.ok(
      await chip.count(),
      "there are no disclosure chips (summary.disclose) on the page at all — " +
        "the control this test describes is gone, not merely restyled"
    );
    const style = await chip.evaluate((el) => {
      // The verdict tokens resolved through the page's own theme, so this
      // reads the same in dark mode and does not restate a hex the tokens own.
      const resolve = (token) => {
        const probe = document.createElement("div");
        probe.style.background = `var(${token})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      };
      const s = getComputedStyle(el);
      return {
        borderWidth: parseFloat(s.borderTopWidth),
        padding: parseFloat(s.paddingTop) + parseFloat(s.paddingBottom),
        height: el.getBoundingClientRect().height,
        background: s.backgroundColor,
        verdicts: ["--real", "--real-soft", "--erode", "--erode-soft"].map(resolve),
      };
    });
    assert.ok(style.borderWidth > 0, "the chip lost its border — nothing marks it as a control");
    assert.ok(style.padding > 0, "the chip lost its padding — the tap target goes back to ~14px");
    assert.ok(
      style.height >= 20,
      `the disclosure control is ${style.height}px tall, which is not a tap target`
    );
    // The half the title claims and the assertions above do not reach. `--real`
    // and `--erode` mean the reader's figure beat or lost to the country's;
    // painting a resting control in either puts two meanings of one colour
    // beside each other, and the reader has to learn which is which per element.
    // Hover and focus-visible may use the accent, where it is unambiguously
    // about the interaction — this measures the chip at rest.
    assert.ok(
      !style.verdicts.includes(style.background),
      `the resting disclosure chip is painted ${style.background}, which is a verdict ` +
        "fill — the affordance is carried by shape, and the accent is for :hover and " +
        ":focus-visible"
    );

    // Every `.disclose` summary carries the caret glyph; without it the chip
    // reads as a static badge rather than something that opens.
    const chips = await page.locator("summary.disclose").count();
    const carets = await page.locator("summary.disclose .dc-caret").count();
    assert.equal(carets, chips, `${chips - carets} disclosure chips have no caret`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the ready-made baskets sit under the rows they fill", { skip }, async () => {
  // Where the chips sit is the whole of what they claim to be. Directly under
  // «За какво отиват парите ти?» five mutually-cancelling buttons ARE the
  // answer to that question, and the thirteen rows below them read as the
  // readout it produced — which is how a reader arrives at "I can't pick 'I
  // drive daily' and 'feeding a family' at the same time", having seen the
  // sliders and classified them as output. Under the list the same chips are
  // somewhere to start, found after the instrument, and no sentence has to
  // say so. Two already do and both lost to this ordering.
  await withApp(async (page, errors) => {
    assert.ok(await page.locator(".presets").count(), "the ready-made basket row is gone");
    const geom = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#sliders .cat")];
      return {
        rows: rows.length,
        lastRowBottom: rows.at(-1)?.getBoundingClientRect().bottom ?? null,
        presetsTop: document.querySelector(".presets").getBoundingClientRect().top,
      };
    });
    assert.ok(geom.rows >= 13, `${geom.rows} basket rows — the published list is not being drawn`);
    assert.ok(
      geom.presetsTop >= geom.lastRowBottom,
      `the ready-made baskets start at ${geom.presetsTop}px, above the last row's bottom edge ` +
        `at ${geom.lastRowBottom}px — they are answering the heading again`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a basket the reader described survives an edit somewhere else", { skip }, async () => {
  // The published basket seeds the sliders ONCE. Seeded on every pass of the
  // effect that clamps the mortgage term, it follows the term — so touching a
  // field on the other side of the card puts thirteen weights, the splits, the
  // preset and the %/€ mode back to the national average, with nothing on
  // screen saying why. Take the `basketSeeded` guard out of
  // `Calculator#syncWithData` and this goes red on the first assertion.
  await withApp(async (page, errors) => {
    const firstWeight = page.locator("#sliders .cat input[type=range]").first();
    await firstWeight.fill("40");
    await page.locator(".m-inputs .homeTog input").first().check();
    await page.locator("#inTerm").fill("22");
    await page.waitForTimeout(300);
    assert.equal(await firstWeight.inputValue(), "40", "editing the term re-seeded the basket");

    await page.locator("#inRate").fill("3,4");
    await page.waitForTimeout(300);
    assert.equal(await firstWeight.inputValue(), "40", "editing the rate re-seeded the basket");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the loaded basket is marked, not crowned", { skip }, async () => {
  // A solid `--ink` fill is the strongest "this is the answer" signal the app
  // has, and the chip it sat on had only seeded thirteen sliders that outrank
  // it. The state still has to be legible — which basket is loaded is a real
  // question — so this asserts both directions: not the ink fill, and not
  // identical to an unpressed chip either.
  await withApp(async (page, errors) => {
    const style = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--ink)";
      document.body.append(probe);
      const ink = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const on = document.querySelector('.presets .chip[aria-pressed="true"]');
      const off = document.querySelector('.presets .chip[aria-pressed="false"]');
      if (!on || !off) return null;
      const read = (el) => {
        const s = getComputedStyle(el);
        return {
          background: s.backgroundColor,
          color: s.color,
          border: parseFloat(s.borderTopWidth),
          borderColor: s.borderTopColor,
        };
      };
      return { ink, on: read(on), off: read(off) };
    });
    assert.ok(
      style,
      "the basket row reports no loaded basket, or no unloaded one to compare it to"
    );
    assert.notEqual(
      style.on.background,
      style.ink,
      "the loaded basket is filled with --ink again — a starting point painted as the verdict"
    );
    assert.ok(
      style.on.border > 0,
      "the loaded chip lost its border, so nothing marks it a control"
    );
    assert.notDeepEqual(
      [style.on.background, style.on.borderColor, style.on.color],
      [style.off.background, style.off.borderColor, style.off.color],
      "the loaded basket is drawn exactly like the ones that are not — nothing says which is on"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "a basket row is a handle, and moving one unseats the ready-made basket",
  { skip },
  async () => {
    // The row competes with the app's own bar charts — `.rank .track` in the
    // results card is the same rail under the same name · code · rate · value
    // line — so the control has to be legible as one before it is touched: 24px
    // of hit area on a phone that has no hover, and a name a screen reader can
    // announce. Then the behaviour that settles which of the two outranks the
    // other: one arrow key on any row and no ready-made basket is loaded any
    // more, because the reader's own number has replaced it.
    await withApp(async (page, errors) => {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll("#sliders .cat > input[type=range]")].map((el) => ({
          height: el.getBoundingClientRect().height,
          name: el.getAttribute("aria-label") ?? "",
        }))
      );
      assert.ok(rows.length >= 13, `${rows.length} division sliders — the list is not being drawn`);
      for (const row of rows) {
        assert.ok(
          row.height >= 24,
          `a basket slider is ${row.height}px of hit area — under a thumb that is a chart, not a control`
        );
        assert.ok(row.name.trim(), "a basket slider has no accessible name");
      }

      const slider = page.locator("#sliders .cat > input[type=range]").first();
      const before = await slider.inputValue();
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      assert.notEqual(
        await slider.inputValue(),
        before,
        "the slider does not move under the keyboard"
      );
      assert.equal(
        await page.locator('.presets .chip[aria-pressed="true"]').count(),
        0,
        "a ready-made basket is still marked as loaded after the reader moved a row of their own"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the basket keeps its affordances for a reader who turned motion off", { skip }, async () => {
  // `tokens.css` drops every animation and transition under
  // `prefers-reduced-motion`, so anything that says "control" by moving says
  // nothing at all to that reader — and every other test in this file runs on
  // a page where motion is on, which is what makes the regression invisible.
  // What has to survive: the hit area, and the row-level focus mark a keyboard
  // reader tracks down thirteen near-identical lines.
  await withApp(
    async (page, errors) => {
      const slider = page.locator("#sliders .cat > input[type=range]").first();
      const box = await slider.boundingBox();
      assert.ok(box.height >= 24, `the slider is ${box.height}px tall with motion off`);

      await slider.focus();
      const row = await page.evaluate(() => {
        const focused = document.querySelector("#sliders .cat:focus-within");
        const plain = document.querySelector("#sliders .cat:not(:focus-within)");
        if (!focused || !plain) return null;
        const read = (el) => {
          const s = getComputedStyle(el);
          return { shadow: s.boxShadow, background: s.backgroundColor };
        };
        return { focused: read(focused), plain: read(plain) };
      });
      assert.ok(row, "focusing a slider marks no row at all");
      assert.notEqual(
        row.focused.shadow,
        "none",
        "the focused row carries no static mark — the affordance is motion, which this reader never sees"
      );
      assert.notEqual(
        row.focused.background,
        row.plain.background,
        "a focused basket row is drawn exactly like an untouched one"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/",
    { reducedMotion: "reduce" }
  );
});

test(
  "the reader can say they do not spend everything, and the euro figures follow",
  { skip },
  async () => {
    // The assumption this control makes visible was being made silently of
    // every visitor: share mode divides a pot and cannot say how big it is, so
    // the app used the whole take-home. Only the euro mode could express
    // anything else, and `spendMode` starts at "pct".
    //
    // Driven in a browser rather than read out of the source because the chain
    // it has to survive is a chain of layers: the range input's value → a
    // handler → `$state` → `basketBudget` → `spendBase` → thirteen rendered €
    // figures and the row that names the remainder. `verify_view_spend.mjs`
    // proves the arithmetic and `verify_wiring.mjs` proves the arguments;
    // neither can see a control that renders but moves nothing.
    await withApp(async (page, errors) => {
      await page.locator("#inSalary").fill("1500");
      await page.waitForTimeout(400);

      const control = page.locator(".spendshare input[type=range]");
      assert.equal(await control.count(), 1, "there is no spend-share control in share mode");
      // The base is `spendable`, so with no housing entered it IS the net pay
      // and the label may say so plainly. The housing branch is asserted at the
      // end, after a rent has been typed.
      assert.match(await page.locator(".ss-lab").innerText(), /чистия си доход/);
      assert.equal(
        await control.inputValue(),
        "100",
        "the control does not start at 'I spend all of it' — any lower default shrinks " +
          "the reader's headline € figure without their having claimed anything (P7)"
      );
      assert.equal(
        await page.locator(".r-row", { hasText: /Неразпределени|Not placed/ }).count(),
        0,
        "money is reported unplaced before the reader has said any of it is"
      );

      const euros = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("#sliders .cat .pc small")].map((el) =>
            Number(el.textContent.replace(/[^\d]/g, ""))
          )
        );
      const before = await euros();
      assert.ok(
        before.filter((x) => x > 0).length >= 10,
        "the € column is not drawn, so nothing here would notice if it stopped following"
      );

      // 100 → 60 in five-point steps. Keyboard rather than a synthetic value,
      // because `oninput` is what carries the claim and setting `.value` in JS
      // does not fire it.
      await control.focus();
      for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(300);
      assert.equal(await control.inputValue(), "60");

      const after = await euros();
      before.forEach((was, i) => {
        if (was < 20) return; // a row of a few euros rounds to the same integer
        assert.ok(
          after[i] < was,
          `row ${i} still reads €${after[i]} after the reader said they spend 60% of their pay`
        );
      });
      // The claim sets the size of the pot, not how it divides: π is normalised
      // by Σa and must not move (docs/math.md §"What `a_i` is a share of").
      const shares = await page.evaluate(() =>
        [...document.querySelectorAll("#sliders .cat .pc > span")].map((el) => el.textContent)
      );
      const total = Math.round(before.reduce((s, x) => s + x, 0));
      const totalAfter = Math.round(after.reduce((s, x) => s + x, 0));
      assert.ok(
        Math.abs(totalAfter / total - 0.6) < 0.02,
        `the € column totals €${totalAfter} against €${total} — a 60% claim did not reach it`
      );
      assert.ok(
        shares.some((s) => s.includes("%")),
        "the share column stopped rendering"
      );

      // …and the remainder now has a row to itself, which in share mode never
      // rendered at all before there was a way to state one.
      const leftover = page.locator(".r-row", { hasText: /Неразпределени|Not placed/ });
      assert.equal(await leftover.count(), 1, "the unplaced money is not reported anywhere");
      assert.match(await leftover.innerText(), /600/, "the unplaced row does not name the €600");

      // Housing changes what the claim is a claim ABOUT. €450 of rent puts the
      // base at €1,050, and a label still naming the net pay alone would say
      // the reader spends 60% of €1,500 over figures carved out of €1,050.
      await page.locator("#inRent").fill("450");
      await page.waitForTimeout(400);
      const labelled = await page.locator(".ss-lab").innerText();
      assert.match(
        labelled,
        /след\s*€?\s*450\s*за жилище/,
        `the label reads "${labelled}" with €450 of rent entered — it names a base ` +
          "€450 larger than the one every figure under it is carved out of"
      );

      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("rent and a mortgage together get one carve-out sentence", { skip }, async () => {
  // Both housing costs live at once is a state the app invites — the home
  // block is for somebody renting now and pricing a purchase. Two sentences
  // there each say the € column is what is left after their own payment and
  // neither mentions the other, so the reader is choosing between three bases
  // and only the sum is the one the arithmetic used.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2200");
    await page.locator("#inRent").fill("650");
    await page.locator("input[type=checkbox]").first().check();
    await page.waitForTimeout(400);

    // The carve-out lines, by what they claim rather than by position: they
    // are `p.leg` like the basket's own legend, and matching the whole card
    // would pick that up too.
    const carved = page.locator("p.leg", { hasText: /остатъка след|carved out of/ });
    assert.equal(
      await carved.count(),
      1,
      "the basket states its base more than once with rent and a mortgage both on"
    );
    const line = await carved.innerText();

    // The sum the € column is genuinely drawn from, read off the page's own
    // leftover row rather than added up here — the two sentences describe one
    // arithmetic, so a test that recomputes it would pass while they disagreed.
    const housing = (await page.locator(".ss-lab").innerText()).match(
      /€?\s*([\d\s ]+)\s*за жилище/
    );
    assert.ok(housing, "the leftover row stopped naming the housing total");
    const total = housing[1].trim();
    assert.ok(
      line.includes(total),
      `the carve-out sentence reads «${line}» while the € figures are drawn from ` +
        `what is left after ${total} — the reader is given no base that is true`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the euro mode's measured remainder is the only one on screen there", { skip }, async () => {
  // Two live controls both meaning "I don't spend everything" can disagree in
  // front of the reader: the euro tally MEASURES the remainder off thirteen
  // typed amounts, the share control STATES it. The euro mode's tally is
  // authoritative there, so the control is not drawn — and flipping back must
  // return it rather than stranding the reader in the mode that has it.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("1500");
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".spendshare").count(), 1);

    // Scoped to the basket's own toolbar: `.seg .segbtn` also matches the pay
    // card's net/gross toggle, and clicking that one changes the salary basis
    // while every assertion below still passes.
    const [pct, eur] = [0, 1].map((i) => page.locator(".basketbar .seg .segbtn").nth(i));
    await eur.click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator(".spendshare").count(),
      0,
      "the stated share is still on screen in euro mode, beside the measured one"
    );
    assert.ok(await page.locator(".budgetbar").count(), "the euro tally is not drawn");

    await pct.click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".spendshare").count(), 1, "the control did not come back");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a typed euro basket survives a trip through the % mode", { skip }, async () => {
  // The conversion rounds through whole percents, so the way back is not the
  // way out: €95 returned as €88 and €25 as €29 — every one of the thirteen
  // amounts moved, worst at the small end, where a reader who says «€25 за
  // спорт» is most certain of the figure. π held throughout (both modes
  // normalise by Σ), which is exactly why nothing else on the page could
  // report it.
  await withApp(async (page, errors) => {
    await page.locator("#inSalary").fill("2150");
    await page.waitForTimeout(300);
    const [pct, eur] = [0, 1].map((i) => page.locator(".basketbar .seg .segbtn").nth(i));
    await eur.click();
    await page.waitForTimeout(300);

    const boxes = page.locator("#sliders .eurin input");
    const mine = [420, 95, 60, 310, 45, 40, 150, 35, 70, 25, 130, 30, 55];
    const n = await boxes.count();
    for (let i = 0; i < n; i += 1) await boxes.nth(i).fill(String(mine[i] ?? 0));
    await page.waitForTimeout(300);
    const typed = await boxes.evaluateAll((els) => els.map((e) => e.value));

    await pct.click();
    await page.waitForTimeout(300);
    await eur.click();
    await page.waitForTimeout(300);

    const back = await page
      .locator("#sliders .eurin input")
      .evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(back, typed, "the reader's own euro amounts came back changed");

    // An edit in the other mode is the reader's newer answer, so it wins over
    // what they typed here — the stash is a copy of an abandoned basket, not a
    // second source of truth the flip keeps reinstating.
    await pct.click();
    await page.waitForTimeout(300);
    const rail = page.locator("#sliders input[type=range]").first();
    await rail.fill("40");
    await page.waitForTimeout(300);
    await eur.click();
    await page.waitForTimeout(300);
    const edited = await page
      .locator("#sliders .eurin input")
      .evaluateAll((els) => els.map((e) => Number(e.value)));
    assert.ok(
      edited[0] > Number(typed[0]),
      `the % edit was discarded on the way back: CP01 is €${edited[0]}, was €${typed[0]}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the basket fits a 360px column, chips and all", { skip }, async () => {
  // 360px is the phone the reader in the report was holding. The chip row
  // wraps to four lines there, and a chip that overhangs the column is the
  // one control nobody scrolls sideways to find.
  await withApp(async (page, errors) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    const geom = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      widest: Math.max(
        ...[...document.querySelectorAll(".presets .chip, #sliders .cat, .spendshare")].map(
          (el) => el.getBoundingClientRect().right
        )
      ),
    }));
    assert.ok(
      geom.scrollWidth <= geom.clientWidth,
      `the page is ${geom.scrollWidth}px wide in a ${geom.clientWidth}px viewport`
    );
    assert.ok(geom.widest <= 360, `the basket's widest element reaches ${geom.widest}px`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a Bulgarian reader's basket table is in Bulgarian only", { skip }, async () => {
  // A Bulgarian reader's thirteen rows carry no English. The pull the other
  // way is real — `eurostat_label` is Eurostat's own wording for the code, and
  // printing it under the name is the obvious way to make the bucket
  // checkable. It costs «Housing, water, electricity, gas and other fuels»
  // under «Ток, вода, парно, наеми»: four lines of a language the reader did
  // not ask for, thirteen times over, in the column a phone has least room for.
  //
  // So the label travels on the verify link instead, which is the row that
  // goes to Eurostat and where `BasketEditor` already carries it. The claim
  // stays checkable and the table stays in one language.
  await withApp(
    async (page, errors) => {
      await page.locator(".m-results details.how summary").first().click();
      await page.waitForTimeout(250);

      const rows = await page.evaluate(() =>
        [...document.querySelectorAll(".m-results details.how tbody tr")].map((tr) => ({
          name: tr.querySelector("td")?.innerText.trim() ?? "",
          title: tr.querySelector("td a")?.getAttribute("title") ?? "",
        }))
      );
      assert.ok(rows.length >= 13, `the drawer drew ${rows.length} basket rows`);
      for (const row of rows) {
        // A Latin letter in the visible name is the label coming back. The
        // language toggle hides the `.l-en` span, so `innerText` is what a
        // Bulgarian reader actually sees.
        assert.ok(
          !/[A-Za-z]/.test(row.name),
          `the basket row «${row.name}» shows Latin script to a Bulgarian reader`
        );
        assert.match(
          row.title,
          /[A-Za-z]/,
          "the verify link stopped carrying Eurostat's own wording for the code, " +
            "so nothing on the row says what the bucket officially is"
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/",
    { viewport: { width: 1280, height: 1200 } }
  );
});

test("every basket rail announces its value with its unit", { skip }, async () => {
  // A range input hands a screen reader its raw `value` and nothing else. The
  // unit lives in the column beside the rail, so a division at 22 per cent and
  // a group at 22 euros are announced identically — and the %/€ toggle, whose
  // entire job is to switch that unit, switches something the reader was never
  // told. `aria-valuetext` is the only place a slider can say it.
  //
  // ONE rule over the whole collection rather than an assertion per rail: a
  // check that cannot go red while this one stays green is a second thing to
  // update, not a second guard. The three shapes have to be ON the page for the
  // rule to mean anything, which is what the counts below are for — the group
  // rails need an opened division to exist at all, and a collection rule that
  // quietly ran over thirteen rows would read as having covered all of them.
  //
  // Both languages, because the announcement is a rendered string like any
  // other: an empty attribute is the missing-translation failure and Cyrillic
  // on the English page (or Latin on the Bulgarian one) is the wrong-language
  // failure, and no other suite here can see either.
  for (const [path, cyrillic] of [
    ["/", true],
    ["/en/", false],
  ]) {
    await withApp(async (page, errors) => {
      await page.locator("#sliders .cat .disc").first().click();
      await page.waitForTimeout(300);

      const rails = await page.evaluate(() => {
        const read = (selector) =>
          [...document.querySelectorAll(selector)].map((el) => ({
            name: el.getAttribute("aria-label") ?? "",
            said: el.getAttribute("aria-valuetext") ?? "",
          }));
        return {
          spend: read(".spendshare input[type=range]"),
          divisions: read("#sliders .cat > input[type=range]"),
          groups: read("#sliders .subs input[type=range]"),
        };
      });
      assert.equal(rails.spend.length, 1, `${path}: no spend-share rail to announce`);
      assert.ok(
        rails.divisions.length >= 13,
        `${path}: ${rails.divisions.length} division rails — the published list is not drawn`
      );
      assert.ok(
        rails.groups.length >= 2,
        `${path}: ${rails.groups.length} group rails — the drill-down did not open, so this ` +
          "rule ran over two of the three shapes"
      );

      for (const rail of [...rails.spend, ...rails.divisions, ...rails.groups]) {
        assert.ok(
          rail.said.trim(),
          `${path}: the rail «${rail.name}» announces its raw number and nothing else`
        );
        assert.match(
          rail.said,
          /\d/,
          `${path}: «${rail.name}» announces "${rail.said}" — a unit with no value in it`
        );
        assert.match(
          rail.said,
          /[%€]/,
          `${path}: «${rail.name}» announces "${rail.said}" — a bare number, which is what a ` +
            "reader who cannot see the column beside it already had"
        );
        assert.equal(
          /[а-яА-Я]/.test(rail.said),
          cyrillic,
          `${path}: «${rail.name}» announces "${rail.said}" in the wrong language`
        );
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    }, path);
  }
});

test(
  "a rail's announcement follows its value, and its unit follows the mode",
  { skip },
  async () => {
    // The two things the rule over the collection cannot see. A constant string
    // satisfies every assertion up there and tells the reader the same thing at
    // both ends of the rail — so the announcement is moved, by the keyboard,
    // which is how the reader it is written for moves it.
    //
    // And the mode: in € mode the division control is a number field, not a
    // range, so the unit moves into its NAME. That asymmetry is deliberate — an
    // `aria-valuetext` on a field replaces the value a screen reader echoes back,
    // so a reader halfway through typing 180 hears a sentence about the number
    // they are replacing.
    await withApp(async (page, errors) => {
      const rail = page.locator("#sliders .cat > input[type=range]").first();
      const said = () => rail.getAttribute("aria-valuetext");

      const before = await said();
      assert.match(before, /%/, `a division rail in share mode announces "${before}"`);

      await rail.focus();
      for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(250);
      assert.notEqual(
        await said(),
        before,
        `the rail still announces "${before}" ten steps along — the announcement is a constant`
      );

      // Scoped to the basket's own toolbar: `.seg .segbtn` also matches the pay
      // card's net/gross toggle, which changes the salary basis and leaves every
      // assertion below passing.
      await page.locator(".basketbar .seg .segbtn").nth(1).click();
      await page.waitForTimeout(300);
      assert.equal(
        await page.locator("#sliders .cat > input[type=range]").count(),
        0,
        "the division rails are still ranges in € mode"
      );
      const field = page.locator("#sliders .cat .eurin input").first();
      assert.match(
        await field.getAttribute("aria-label"),
        /евро на месец/,
        "the € field's name stopped carrying the unit, and its value is now a bare number"
      );
      assert.equal(
        await field.getAttribute("aria-valuetext"),
        null,
        "the € field states a valuetext, which replaces the digits the reader is typing"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test.after(shutdown);
