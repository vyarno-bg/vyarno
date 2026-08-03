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
        ...[...document.querySelectorAll(".presets .chip, #sliders .cat")].map(
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

test.after(shutdown);
