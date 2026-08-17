/**
 * The page as a whole: that it mounts, that it logs nothing, and the parts
 * every route shares.
 *
 * What lands here is what belongs to no single region — the client replacing
 * the prerendered shell rather than appearing beside it, the console staying
 * empty, the footer's route to donating, the language and theme toggles, the
 * two documentary pages, and the accessibility guarantees that hold across
 * routes rather than inside one component.
 *
 * The console assertion is the point of the whole render suite and every test
 * in it repeats it: a component that throws during render leaves the
 * surrounding markup standing, so asserting on elements alone passes on a page
 * the visitor sees as half-drawn.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { SITE, attribution } from "./render-dist.mjs";
import { READY, shutdown, skip, withApp } from "./render-harness.mjs";
import { published } from "./published-payload.mjs";
import { bgNetSalary, payrollParams, wageGap } from "../src/lib/mirror.js";

test("the built page mounts over the shell rather than beside it", { skip }, async () => {
  await withApp(async (page, errors) => {
    // One of each landmark. `mount()` appends, so a build that stopped
    // emptying #app would draw the header, the explainer and the footer twice
    // — with the second copy live and the first one frozen at build time.
    for (const [what, selector] of [
      ["header", "header.site"],
      ["h1", "main h1"],
      ["explainer band", ".explain-band"],
      ["footer", "footer.site"],
    ]) {
      assert.equal(await page.locator(selector).count(), 1, `${what} appears twice`);
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  });
});

test("the calculator renders with no console errors", { skip }, async () => {
  await withApp(async (page, errors) => {
    // Every region, so a component that silently rendered nothing is caught.
    // `header.site` and `.explain-band` are not on this list, and the test
    // above is why: it counts both to EXACTLY one on this same route, which is
    // the same claim with the duplicate case closed as well. A second entry
    // that cannot go red while a broader one stays green is a second thing to
    // update rather than a second guard (docs/testing-strategy.md §"What does
    // NOT get a test").
    for (const [what, selector] of [
      ["skip link", "a.skip"],
      ["as-of strip", ".data-strip"],
      ["pay field", ".m-grid .m-pay"],
      ["inputs card", ".m-grid .m-inputs"],
      ["results card shell", ".m-grid .m-results"],
      ["basket sliders", "#sliders .cat"],
      ["results card", ".r-big"],
      ["result rows", ".r-row"],
      ["method drawer", "details.how"],
      ["national strip", ".strip .stat"],
      ["footer", "footer"],
    ]) {
      assert.ok(await page.locator(selector).first().count(), `${what} (${selector}) is missing`);
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  });
});

test("the sticky masthead paints a ground of its own, in both themes", { skip }, async () => {
  // The bar is `position: sticky` over scrolling prose, so its background is
  // the whole of what separates the two. Pointing it at a custom property that
  // does not exist is not an error anywhere in the toolchain: the declaration
  // becomes invalid at computed-value time, `background-color` resolves to
  // transparent, and every route on the site scrolls THROUGH its own header in
  // both themes with the render suites green.
  //
  // `verify_render_contrast.mjs` cannot stand in for this. It composites the
  // ancestor layers behind a piece of text and SKIPS any layer at alpha 0, so a
  // header with no ground is measured against the body ground it assumes is
  // behind — the reading it would give if the defect were not there.
  //
  // Both themes, through the control a reader presses, because `--hdr` is
  // declared once per theme block and one of them can lose it alone. The
  // grounds have to differ for the same reason: a light ground carried into the
  // dark theme is a bar that cannot be read, not a bar with no bar.
  await withApp(async (page, errors) => {
    const ground = () =>
      page.evaluate(() => {
        const bg = getComputedStyle(document.querySelector("header.site")).backgroundColor;
        const parts = bg.match(/[\d.]+/g) ?? [];
        return {
          theme: document.documentElement.getAttribute("data-theme"),
          bg,
          alpha: parts.length === 4 ? Number(parts[3]) : 1,
        };
      });

    const first = await ground();
    await page.locator("header.site .controls button").first().click();
    await page.waitForTimeout(200);
    const second = await ground();

    for (const seen of [first, second]) {
      assert.ok(
        seen.alpha > 0,
        `the ${seen.theme} masthead has no background of its own (${seen.bg}), so the ` +
          "page scrolls through the one bar that stays on screen"
      );
    }
    assert.notEqual(
      first.bg,
      second.bg,
      `both themes paint the masthead ${first.bg}, so one of them is drawing a bar ` +
        "in the other theme's ground"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the upstream attribution is on screen, in the language the page serves",
  { skip },
  async () => {
    // Every other guard on this line reads it as TEXT — `verify_legal.mjs` over
    // `COPY.footerNote`, `verify_render_prerender.mjs` over the served HTML — and
    // a string in the markup is not a credit. `display: none` on the rule that
    // carries it leaves both of those green while «Данни от Евростат / ЕЦБ / НСИ
    // / БНБ / имот.bg» reaches nobody at any address, and several of those five
    // publishers ask for it as a licence condition rather than as a courtesy
    // (docs/legal.md).
    //
    // Both languages: the pair is two elements, one hidden by the rule that
    // decides which document a reader is on, and that is the same mechanism a
    // hidden credit would arrive through.
    for (const [path, lang] of [
      ["/", "bg"],
      ["/en/", "en"],
    ]) {
      await withApp(async (page, errors) => {
        const seen = await page.evaluate((text) => {
          const carrying = [...document.querySelectorAll("footer.site *")].filter(
            (el) => el.textContent.trim() === text
          );
          return {
            inDom: carrying.length,
            drawn: carrying
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.width > 0 && r.height > 0).length,
          };
        }, attribution(lang));
        assert.ok(
          seen.inDom >= 1,
          `${path} carries no element holding the ${lang} attribution at all`
        );
        assert.equal(
          seen.drawn,
          1,
          `${path} draws ${seen.drawn} of the ${seen.inDom} elements holding the ${lang} ` +
            "attribution. The five publishers have to be credited where a reader can " +
            "read them, and exactly once."
        );
        assert.deepEqual(errors, [], errors.join(" | "));
      }, path);
    }
  }
);

test("the as-of strip writes both its dates the same way", { skip }, async () => {
  // The bar carries two months and they are not always the same one: the page
  // is dated by the basket's period and the headline by its own, which runs up
  // to a month ahead during Eurostat's flash. Saying so is the bar's whole job.
  //
  // It could not do it while one date went through `periodLong` and the other
  // was interpolated raw — «ЧИСЛАТА СА КЪМ ЮНИ 2026 Г. · ОФИЦИАЛНА ИНФЛАЦИЯ:
  // 4,1% ЗА 2026-07» asks a reader to convert an ISO period before they can
  // even see that the two differ.
  //
  // Asserted as the absence of an ISO period rather than the presence of a
  // month name, so it holds for whatever month the payloads carry and for the
  // English bar too.
  await withApp(async (page, errors) => {
    const strip = await page.locator(".data-strip .data-strip-inner").innerText();
    const iso = [...strip.matchAll(/\d{4}-\d{2}(?!-)/g)].map((m) => m[0]);
    assert.deepEqual(iso, [], `the as-of strip states a raw period: ${strip.replace(/\s+/g, " ")}`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the page that could not load says so and states no date", { skip }, async () => {
  // The third state a reader actually reaches, and the one nothing opened
  // before: `loadAll` turns a failed fetch into a null payload rather than
  // throwing, so `dataReady` flips either way and the calculator is replaced by
  // its failure card.
  //
  // The as-of line was drawn over that with no month to name and read «ЧИСЛАТА
  // СА КЪМ —» — a half-written sentence above a card that had just explained
  // the failure properly. `periodLong("")` returns the em dash it returns for
  // any value it cannot render, which is right in a table cell and is not a
  // date.
  //
  // What the card itself must keep saying is the other half: a reader who has
  // typed a salary into a page that then failed needs to know nothing of theirs
  // was lost or sent anywhere. That is a privacy claim (P1) and it is asserted
  // here rather than assumed.
  await withApp(
    async (page) => {
      assert.ok(await page.locator(".load-fail").count(), "the failure card was never reached");
      assert.doesNotMatch(
        await page
          .locator(".data-strip")
          .innerText()
          .catch(() => ""),
        /Числата са към/i,
        "the as-of line is drawn over a page with no figures on it"
      );
      const card = await page.locator(".load-fail").innerText();
      assert.match(card, /Данните не се заредиха/i, `the failure card lost its heading: ${card}`);
      assert.match(
        card,
        /нищо не е изпращано никъде/i,
        `the failure card stopped saying nothing was sent: ${card}`
      );
    },
    "/",
    {},
    // Aborted rather than 404'd: a reader with no connection is the case, and a
    // 404 would exercise the server's fallback instead of the fetch's failure.
    (page) => page.route("**/data/published/*.json", (r) => r.abort())
  );
});

test("the footer's route to donating is a link, on every page", { skip }, async () => {
  // The footer is shared, so this is the ask as a reader meets it on the
  // calculator — not on `/legal/`, where they already went looking for it.
  //
  // The shape depends on how many channels are open, and the suite asserts
  // whichever one `support.js` currently produces rather than pinning the
  // single-channel case: a direct outbound link while exactly one channel is
  // open, and `/support/` once the destination is a choice the footer is the
  // wrong width to explain. Pinning "exactly one `a.donate`" would go red the
  // day a second account opens — on a change that broke nothing — which is how
  // a suite teaches people to edit it rather than read it.
  //
  // The computed-background assertion is the one that needs a browser, and it
  // is the rule this suite exists to hold: `support.js` rule 1 forbids the ask
  // growing into a component, and "a donate button" is what every donation
  // guide recommends adding next. A CSS rule filling it in reads as a tidy
  // style tweak in a diff and lands as the thing the module forbids by name.
  const { livePlatforms, footerDonateLink } = await import(
    pathToFileURL(join(SITE, "src", "lib", "support.js")).href
  );
  const direct = footerDonateLink();

  await withApp(async (page, errors) => {
    const donate = page.locator("footer a.donate");
    assert.equal(
      await donate.count(),
      direct ? 1 : 0,
      direct
        ? "one channel is open, so the footer prints one direct donate link"
        : `${livePlatforms().length} channels are open, so the footer must not ` +
            "pick one for the reader — the route is the Подкрепа item, which " +
            "leads to the page where each platform carries its note"
    );

    // Whichever shape it took, there is a route out of the footer and it is a
    // link. A support line with nothing to follow is a statement about money
    // with no answer to it.
    const route = direct ? donate : page.locator("footer a[href^='/support/']");
    assert.ok(await route.count(), "the footer offers no route to supporting the project");

    const href = await route.first().getAttribute("href");
    assert.match(
      href ?? "",
      direct ? /^https:\/\// : /^\/support\//,
      `the footer's support route points at ${href}`
    );
    if (direct) {
      assert.equal(
        await donate.getAttribute("rel"),
        "noopener",
        "an outbound link opened in a new tab needs rel=noopener"
      );
    }
    assert.ok(
      (await route.first().innerText()).trim().length > 0,
      "the support route renders no text — a missing string is a blank line, not a fallback"
    );

    const bg = await route.first().evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.match(
      bg,
      /rgba\(0, 0, 0, 0\)|transparent/,
      `the footer's support link is drawn with a filled background (${bg}), which ` +
        "makes it a button. support.js rule 1: the ask is one quiet line and one link."
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("typing a salary moves the euro figures", { skip }, async () => {
  await withApp(async (page, errors) => {
    const salary = page.locator("input[type=number]").first();
    await salary.fill("1200");
    await page.waitForTimeout(300);
    const low = await page.locator(".r-money").first().innerText();
    await salary.fill("4000");
    await page.waitForTimeout(300);
    const high = await page.locator(".r-money").first().innerText();
    assert.notEqual(low, high, "the euro figure did not follow the salary input");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the home block draws its mortgage bar and the wedge chart", { skip }, async () => {
  await withApp(async (page, errors) => {
    // The home block prices nothing until a €/m² comes from somewhere, and
    // there is no default област (P7) — so picking one is part of the
    // scenario rather than setup around it. Without it the row renders what
    // it is waiting for, and every assertion below would be about that.
    await page.selectOption("#region-select", "sofiya");
    await page.locator("input[type=number]").first().fill("2500");
    await page.waitForTimeout(300);
    assert.ok(await page.locator(".wedge").count(), "the tax-wedge chart is not drawn");
    const homeToggle = page.locator(".homeTog input[type=checkbox]").first();
    if (await homeToggle.count()) await homeToggle.check();
    await page.waitForTimeout(300);
    assert.ok(await page.locator(".mort-bar").count(), "the mortgage cap bar is not drawn");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

// The euro is computed from the rate and the term; the sentence beside it is
// written from two more props, and nothing made them the same two numbers. A
// call site that forgets them leaves `HomeRow`'s own `= 0` defaults in the
// slots, so the row reads «вноска при 0,0% за 0 г.» over a payment that moves
// correctly whenever the reader edits either field — every figure right, the
// sentence describing them wrong, and no gate upstream able to see it because
// nothing published is at fault (docs/site.md §"A correct formula fed the wrong
// number"). Reading the two back off the rendered sentence is what closes it:
// the assertion fails the moment the row stops being handed what it describes.
test(
  "the mortgage sentence states the rate and the term the payment was built from",
  {
    skip,
  },
  async () => {
    await withApp(async (page, errors) => {
      // The home block prices nothing until a €/m² comes from somewhere, and
      // there is no default област (P7) — so picking one is part of the
      // scenario rather than setup around it. Without it the row renders what
      // it is waiting for, and every assertion below would be about that.
      await page.selectOption("#region-select", "sofiya");
      await page.locator("input[type=number]").first().fill("2500");
      const homeToggle = page.locator(".homeTog input[type=checkbox]").first();
      if (await homeToggle.count()) await homeToggle.check();
      await page.waitForTimeout(300);

      // Typed rather than read off the defaults: a rate that happened to match
      // whatever `HomeRow` falls back to would pass without the props arriving.
      await page.locator("#inRate").fill("3.5");
      await page.locator("#inTerm").fill("20");
      await page.waitForTimeout(300);

      const row = await page.locator(".r-row", { hasText: "вноска при" }).first().innerText();
      assert.match(row, /вноска при\s*3,5%/, `the rate is not in the sentence: ${row}`);
      assert.match(row, /за\s*20\s*г\./, `the term is not in the sentence: ${row}`);
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

test("the home block prices nothing before a €/m² has a source", { skip }, async () => {
  // **The state this is for looks exactly like a working one.** With no place
  // chosen, `cityEurPerM2` falls back to
  // `HOME.eurPerM2_offlineFallback` — a round constant имот.bg never published
  // — and the row printed «70 м² в  ≈ €175 000», a €661/month payment and a
  // "44% of your pay" verdict off it, with an empty <b> where the city goes.
  // Every figure was internally consistent, which is why nothing else here
  // caught it.
  //
  // It also reached past the row: `monthlyMort` is carved out of the money the
  // basket's € column is computed from, so an invented mortgage moved thirteen
  // category figures the reader would never have connected to it. Hence the
  // second half — the carve-out sentence has to be absent too.
  await withApp(async (page, errors) => {
    await page.locator("input[type=number]").first().fill("2500");
    const homeToggle = page.locator(".homeTog input[type=checkbox]").first();
    assert.ok(await homeToggle.count(), "the home toggle is missing");
    await homeToggle.check();
    await page.waitForTimeout(400);

    const row = page.locator(".r-row", { hasText: "домът" }).first();
    assert.ok(await row.count(), "the home row is not on the card");
    const text = (await row.innerText()).replace(/\s+/g, " ");
    assert.doesNotMatch(text, /€\s?\d/, `the row priced a home with no €/m² behind it: ${text}`);
    assert.ok(!(await row.locator(".mort-bar").count()), "the affordability bar was drawn");
    assert.match(text, /къде живееш|where you live/i, `the row says nothing: ${text}`);

    // The basket's € column is computed from take-home less housing. A
    // mortgage that does not exist may not be carved out of it.
    const basket = (await page.locator(".m-card").first().innerText()).replace(/\s+/g, " ");
    assert.doesNotMatch(
      basket,
      /вноската|the payment/i,
      `the basket carved out a mortgage the home row refused to state: ${basket}`
    );

    // And it recovers: pick a place with a published €/m² and the row prices.
    await page.selectOption("#region-select", "sofiya");
    await page.waitForTimeout(400);
    const priced = (await row.innerText()).replace(/\s+/g, " ");
    assert.match(priced, /€\s?\d/, `the row stayed empty after a place was picked: ${priced}`);
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("every decimal field takes the separator this page writes", { skip }, async () => {
  // `<input type="number">` sanitises its value to a valid floating-point
  // number, and the comma is not part of one. A reader typing «2,75» into the
  // mortgage rate — the notation of the hint directly under that field, and of
  // every figure on the page — got 275, `validity.valid` true, and the row
  // below stating «вноска при 275,0% за 25 г.: €34 102/мес» as their answer.
  // The raise field turned «3,5» into 35 the same way. Neither showed a reader
  // anything was wrong, and a bg-BG browser locale did not change it.
  //
  // Keystrokes, not `fill()`: `fill()` assigns `.value`, which on a number
  // input the browser rejects outright rather than mangling, so the failing
  // path is the one only typing reaches.
  //
  // Over every field marked as decimal rather than over the two that broke.
  // The next one added is the case this is for, and the check costs a
  // keystroke each.
  await withApp(async (page, errors) => {
    const home = page.locator(".homeTog input[type=checkbox]").first();
    if (await home.count()) await home.check();
    await page.waitForTimeout(300);

    const fields = page.locator("input[inputmode=decimal]");
    const n = await fields.count();
    assert.ok(n >= 2, `the page offers ${n} decimal fields, so this checks nothing`);

    for (let i = 0; i < n; i++) {
      const field = fields.nth(i);
      const id = (await field.getAttribute("id")) ?? `decimal field ${i}`;
      await field.fill("");
      await field.pressSequentially("2,75", { delay: 15 });
      await page.waitForTimeout(200);
      assert.equal(
        await field.inputValue(),
        "2,75",
        `#${id} did not keep «2,75». A field that silently drops the comma ` +
          "reads the number a hundred times too large and says so in a sentence"
      );
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

// --------------------------------------------------------------------------
// Remembering the reader's figures — the three states, in a real browser
//
// `verify_stores.mjs` holds what the module does when it is called. What it
// cannot see is whether anything CALLS it: the write-through is an `$effect` in
// `App.svelte`, so a page that persisted a salary nobody asked it to persist —
// or one that quietly stopped — would pass every case in that file. This is the
// only suite that runs the app.
// --------------------------------------------------------------------------

/** Reload and wait for the calculator to come back up, restore included. */
async function reopen(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY["/"]);
  await page.waitForTimeout(300);
}

const rememberBox = (page) => page.locator(".remember input[type=checkbox]");

test("a first visit leaves nothing on this device", { skip }, async () => {
  // ЗЕТ чл. 4а, ал. 4, т. 2 exempts storage for a service «изрично поискана» by
  // the recipient, and the switch is what asking looks like. So a visitor who
  // types a salary and never touches it has to leave no trace at all — not a
  // preference, and above all not the salary.
  await withApp(async (page, errors) => {
    await page.locator("input[type=number]").first().fill("1234");
    await page.locator("#inRent").fill("700");
    await page.waitForTimeout(300);

    assert.equal(await rememberBox(page).isChecked(), false, "the switch arrives ticked");
    assert.deepEqual(
      await page.evaluate(() => Object.keys(localStorage)),
      [],
      "the page wrote something the reader never asked it to keep"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("switched on, the figures survive a reload", { skip }, async () => {
  await withApp(async (page, errors) => {
    const salary = page.locator("input[type=number]").first();
    const firstWeight = page.locator("#sliders .cat input[type=range]").first();
    await salary.fill("1234");
    await firstWeight.fill("40");
    await rememberBox(page).check();
    await page.waitForTimeout(300);

    await reopen(page);

    assert.equal(await rememberBox(page).isChecked(), true, "the switch came back off");
    assert.equal(await salary.inputValue(), "1234", "the salary did not come back");
    assert.equal(await firstWeight.inputValue(), "40", "the basket did not come back");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("switched off, the figures are gone from the device at once", { skip }, async () => {
  // Not «stops writing»: the key goes in the same action. A switch that reads
  // off over yesterday's salary is the one state this feature must not have.
  await withApp(async (page, errors) => {
    const salary = page.locator("input[type=number]").first();
    await salary.fill("1234");
    await rememberBox(page).check();
    await page.waitForTimeout(300);
    assert.ok(
      await page.evaluate(() => localStorage.getItem("vyarno_inputs")),
      "switching it on kept nothing"
    );

    await rememberBox(page).uncheck();
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("vyarno_inputs")),
      null,
      "the figures are still on the device"
    );

    await reopen(page);
    assert.equal(await rememberBox(page).isChecked(), false);
    assert.notEqual(await salary.inputValue(), "1234", "a reload brought the salary back");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("a payload that will not load does not empty the device", { skip }, async () => {
  // The restore judges a saved basket by the divisions published today, and a
  // failed fetch leaves the page with none — so a restore gated on
  // `dataReady` rather than on the divisions refuses every snapshot and
  // clears the device, erasing the reader's own figures to report our network
  // problem. The snapshot waits for the retry instead. Swap the guard in
  // `App.svelte` and this goes red; nothing else in the suite would notice.
  await withApp(async (page) => {
    await page.locator("input[type=number]").first().fill("1234");
    await rememberBox(page).check();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => localStorage.getItem("vyarno_inputs"));
    assert.ok(stored, "switching it on kept nothing");

    await page.route("**/data/published/*.json", (r) => r.abort());
    await reopen(page);

    assert.ok(await page.locator(".load-fail").count(), "the failure state was never reached");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("vyarno_inputs")),
      stored,
      "a failed fetch threw the reader's own figures away"
    );
  });
});

test(
  "the forget button empties the device without being switched off first",
  { skip },
  async () => {
    await withApp(async (page, errors) => {
      const forget = page.locator(".remember button.forget");
      assert.equal(
        await forget.isDisabled(),
        true,
        "it offers to clear a device with nothing on it"
      );

      await page.locator("input[type=number]").first().fill("1234");
      await rememberBox(page).check();
      await page.waitForTimeout(300);
      assert.equal(await forget.isDisabled(), false);

      await forget.click();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => localStorage.getItem("vyarno_inputs")), null);
      assert.equal(
        await rememberBox(page).isChecked(),
        false,
        "it wiped the device and kept writing"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);

/** The one language control a reader can see, whichever half of the pair it is. */
const langLink = (page) =>
  page.locator("header.site .controls a.pill[hreflang]").locator("visible=true");

test("the language control navigates, and the path survives it", { skip }, async () => {
  // **The toggle is a navigation now, and that is the whole of this change.**
  // A CSS switch could only ever serve one document in two languages: the
  // prerender writes the language the entry declares and drops the other, so
  // the English half reached no crawler at any URL, and an `hreflang` pair had
  // no second address to point at (docs/seo.md).
  //
  // Asserted as a round trip because a one-way check passes on a control that
  // sends every page to `/en/`. The path is what has to survive: a reader who
  // came for the country's figures and pressed EN wants the country's figures
  // in English, not the calculator.
  for (const [from, to] of [
    ["/", "/en/"],
    ["/how/", "/en/how/"],
  ]) {
    await withApp(async (page, errors) => {
      assert.equal(
        await page.locator("html").getAttribute("data-lang"),
        "bg",
        `${from} is not served in Bulgarian`
      );
      // An anchor, not a button: with JavaScript off nothing on this page can
      // change `data-lang`, so a handler would leave a reader on the one
      // language their document declares with no way out. `href` is what
      // degrades, and this is the assertion that fails if it goes back to
      // being a control that only scripts can operate.
      assert.equal(
        await langLink(page).getAttribute("href"),
        to,
        `the language control on ${from} does not point at ${to}`
      );

      await langLink(page).click();
      await page.waitForURL((url) => url.pathname === to);
      await page.waitForFunction(READY[to]);
      assert.equal(
        await page.locator("html").getAttribute("data-lang"),
        "en",
        `${to} was served in Bulgarian — the URL is what decides the language`
      );
      // And navigating IS choosing, so the preference is on the device: the
      // ЗЕТ чл. 4а argument in stores.js turns on storage the visitor asked
      // for, and pressing this is the asking.
      assert.equal(await page.evaluate(() => localStorage.getItem("vyarno_lang")), "en");

      await langLink(page).click();
      await page.waitForURL((url) => url.pathname === from);
      await page.waitForFunction(READY[from]);
      assert.equal(
        await page.locator("html").getAttribute("data-lang"),
        "bg",
        `the way back from ${to} did not land on a Bulgarian document`
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    }, from);
  }
});

test("a stored language decides the root, and no other address", { skip }, async () => {
  // The two halves of the rule, in a browser, because neither is visible from
  // `stores.js` alone: what a document DECLARES is written into the entry file
  // and read off `<html data-lang>` at runtime.
  //
  // `/how/` with `en` on the device is the case that matters. It was served as
  // a Bulgarian document — its `lang`, its canonical and its `hreflang` set all
  // say so — and rendering it in English because this device once stored a
  // preference makes the page contradict the document a crawler and a reader
  // were both handed. The root is the exception because it is the one address
  // that names no language: it is what a person types.
  await withApp(async (page, errors) => {
    await page.evaluate(() => localStorage.setItem("vyarno_lang", "en"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(READY["/"]);
    assert.equal(
      await page.locator("html").getAttribute("data-lang"),
      "en",
      "a stored choice no longer decides the root, which is the one URL a " +
        "reader reaches without naming a language"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });

  await withApp(async (page, errors) => {
    await page.evaluate(() => localStorage.setItem("vyarno_lang", "en"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(READY["/how/"]);
    assert.equal(
      await page.locator("html").getAttribute("data-lang"),
      "bg",
      "a stored preference overrode the language /how/ was served as. The " +
        "English half of this page has its own URL now, and the reader is one " +
        "link from it."
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/how/");
});

test("the theme toggle changes the page", { skip }, async () => {
  await withApp(async (page, errors) => {
    const root = page.locator("html");
    const before = await root.getAttribute("data-theme");
    await page.locator("header.site .controls button").first().click();
    await page.waitForTimeout(200);
    assert.notEqual(await root.getAttribute("data-theme"), before, "the theme toggle did nothing");
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test("the legal page renders every published document", { skip }, async () => {
  await withApp(async (page, errors) => {
    // `h2, h3` because the four documents sit under one page-level heading:
    // `<h1>` names the page, each document is an `<h2>` and its sections are
    // `<h3>`. Following the selector down a level is the whole edit — what is
    // being counted is still that every document reached the page.
    const headings = await page.locator("h2, h3").allInnerTexts();
    assert.ok(headings.length > 3, `the legal page rendered ${headings.length} headings`);

    // Exactly one of each, not merely present. `mount()` appends and this page
    // arrives prerendered, so a bootstrap that stopped emptying `#app` draws
    // the whole page twice — the frozen build-time copy above the live one —
    // and every assertion written as "there is at least one" passes on it.
    for (const [what, selector] of [
      ["page heading", "main.legal h1"],
      ["header", "header.site"],
      ["footer", "footer.site"],
    ]) {
      assert.equal(await page.locator(selector).count(), 1, `the legal page draws ${what} twice`);
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/legal/");
});

test("the support page resolves as its own URL and carries the whole ask", { skip }, async () => {
  // `/support/` exists so the funding answer has an address a person can be
  // given, which means the thing to assert is that the address resolves — a
  // static host serves `support/index.html` for it or it does not, and there
  // is no router to fall back on. A mistyped Vite entry ships a 404 at the one
  // URL the footer and the explainer both point at, with every other suite
  // green.
  //
  // The counts are exact for the same reason the legal page's are: the page is
  // prerendered, `mount()` appends, and a bootstrap that stopped emptying `#app`
  // serves the ask twice with every "at least one" assertion still green.
  await withApp(async (page, errors) => {
    assert.equal(
      await page.locator("main.support h1").count(),
      1,
      "the support page does not carry exactly one heading"
    );
    assert.ok(
      (await page.locator("main.support a[href^='https://']").count()) > 0,
      "the support page offers no outbound link — a page about how to give " +
        "that gives no route is worse than the footer line it replaced"
    );
    for (const [what, selector] of [
      ["header", "header.site"],
      ["footer", "footer.site"],
    ]) {
      assert.equal(await page.locator(selector).count(), 1, `the support page draws ${what} twice`);
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/support/");
});

// Every page carries the skip link, because every page carries the same
// masthead — four tab stops before a word of prose, on all six entries. The
// list is written out rather than derived so that adding an entry is a visible
// decision here too.
const SKIP_LINK_PAGES = ["/", "/how/", "/market/", "/legal/", "/support/", "/404.html"];

for (const path of SKIP_LINK_PAGES) {
  test(
    `the skip link on ${path} is the first tab stop and lands clear of the header`,
    { skip },
    async () => {
      // `.skip` had styles and no element wearing them once. It is the first thing
      // a keyboard user meets, and it has to clear the sticky header when it lands
      // — otherwise it moves focus to a heading drawn underneath the header, which
      // is worse than not having it, because the reader is told they arrived.
      //
      // The clearance is measured against the header's own rendered height rather
      // than asserted to be merely positive: a scroll offset of 8px under a 64px
      // header satisfies `> 0` and lands the reader in exactly the place this is
      // for. /how/ has the most to lose — eleven controls, the header's four and
      // the contents list's seven, sit before its first sentence — but the two
      // pages share the pattern and the failure, so they share the assertion.
      await withApp(async (page, errors) => {
        const link = page.locator("a.skip");
        assert.equal(await link.count(), 1, `${path} has no skip link`);
        assert.equal(await link.first().getAttribute("href"), "#main");

        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => document.activeElement?.className ?? "");
        assert.ok(focused.includes("skip"), `the first tab stop on ${path} is "${focused}"`);

        const clearance = await page.evaluate(() => {
          const main = document.querySelector("#main");
          return (
            (parseFloat(getComputedStyle(main).scrollMarginTop) || 0) -
            document.querySelector("header.site").getBoundingClientRect().height
          );
        });
        assert.ok(
          clearance > 0,
          `on ${path}, #main's scroll offset is ${clearance}px short of the sticky header, ` +
            "so the skip link lands the reader underneath it"
        );
        assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
      }, path);
    }
  );
}

test("the calculator asks in two places and neither interrupts", { skip }, async () => {
  // `support.js` rule 1 permits exactly two surfaces on this page, and the
  // second one — «Кой плаща за това?» — is permitted BECAUSE it sits inside a
  // disclosure the reader chose to open. Rendering it open by default, or
  // lifting it out of the band, converts an answer into an interruption
  // without changing a word of the copy, which is precisely the change no
  // string check can see.
  await withApp(async (page, errors) => {
    // Counted by PLACE, not by anchor: both language variants sit in the DOM
    // at once (`.l-bg` / `.l-en`, hidden with `display:none`), so a link
    // written inside a sentence is two `<a>` elements and a link beside one is
    // a single element wrapping both spans. Anchors would therefore measure
    // how the copy is assembled; what rule 1 caps is how many parts of the
    // page ask.
    const total = await page.locator("a[href^='/support/']").count();
    const footer = await page.locator("footer a[href^='/support/']").count();
    const explainer = await page.locator(".explain-band a[href^='/support/']").count();
    assert.ok(footer > 0, "the footer no longer routes to /support/");
    assert.ok(explainer > 0, "the explainer's support item is missing");
    assert.equal(
      footer + explainer,
      total,
      "the calculator points at /support/ from a third place. Rule 1 allows " +
        "the footer line and the explainer's answer; a third surface means " +
        "amending the rule, not adding the link."
    );

    const item = page.locator(".explain-band a[href^='/support/']").first();
    assert.equal(
      await item.isVisible(),
      false,
      "the explainer's support answer is visible before the reader opened the " +
        "band. Inside a closed disclosure is the whole reason rule 1 allows it."
    );

    const bg = await item.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.match(
      bg,
      /rgba\(0, 0, 0, 0\)|transparent/,
      `the explainer's support link is drawn with a filled background (${bg}), ` +
        "which makes it a button — the same thing rule 1 forbids the footer's."
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  });
});

test(
  "the controls that carry no words name themselves in the reader's language",
  { skip },
  async () => {
    // A glyph button's accessible name is the only thing that says what it does,
    // and BG is the primary language here — an English label leaves a Bulgarian
    // screen-reader user with the controls they cannot guess at from content.
    // The basket's chip row is the same case: five buttons after thirteen
    // sliders, announced as a group or as nothing.
    //
    // Counted over what a reader can SEE. The language control is a pair of
    // anchors, one per language, and the hidden half carries the other
    // language's label by design — a count over the DOM would report the
    // English name as a Bulgarian control's, on the page where it is
    // `display: none`.
    const names = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll("header .controls [aria-label], .presets")]
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.getAttribute("aria-label") ?? "")
      );

    await withApp(async (page, errors) => {
      const bg = await names(page);
      assert.equal(
        bg.length,
        3,
        `${bg.length} of the three unlabelled controls carry an aria-label`
      );
      for (const name of bg) {
        assert.match(name, /[Ѐ-ӿ]/, `"${name}" reaches a Bulgarian reader in English`);
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    });

    // The English page rather than the same page after a click, because that
    // is what a reader gets: the two languages are two documents now.
    await withApp(async (page, errors) => {
      const en = await names(page);
      assert.equal(en.length, 3, `${en.length} controls carry an aria-label on /en/`);
      for (const name of en) {
        assert.ok(name.trim(), "a control lost its accessible name in English");
        assert.doesNotMatch(name, /[Ѐ-ӿ]/, `"${name}" reaches an English reader in Bulgarian`);
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    }, "/en/");
  }
);

test.after(shutdown);

test(
  "picking a sector shows НСИ's average with the sentence that qualifies it",
  { skip },
  async () => {
    await withApp(async (page, errors) => {
      await page.locator("input[type=number]").first().fill("2100");
      await page.waitForTimeout(300);

      const picker = page.locator("#sector-pick");
      assert.ok(await picker.count(), "the sector picker is not on the page");
      // НСИ's nineteen sections and the placeholder. Their all-activities row is
      // the twentieth in the payload and is not an activity anybody works in, so
      // a list labelled «Твоят сектор» must not carry it.
      const options = await picker.locator("option").allInnerTexts();
      assert.equal(
        options.length,
        20,
        `the picker offers ${options.length} rows, expected 19 sections + the placeholder`
      );
      assert.ok(
        !options.some((o) => ["Total", "Общо"].includes(o.trim())),
        "the all-activities row is offered as somebody's sector"
      );
      assert.ok(
        options.every((o) => o.trim().length > 0),
        "an option renders blank — a missing label is a blank line, not a fallback"
      );

      // Nothing is asserted about anybody's industry until they name one.
      assert.equal(await page.locator(".m-pay .caveat").count(), 0);

      await picker.selectOption("Information and communication");
      await page.waitForTimeout(300);

      const card = await page.locator(".m-pay").innerText();
      // The credit line on its own. The claims about what «НСИ ·» spans are
      // claims about this line, and a figure matched against the whole card can
      // be satisfied by one of the reader's own numbers a few rows up.
      const credit = await page.locator(".m-pay .src").innerText();
      // НСИ's own Bulgarian name for section J, INSIDE the claim rather than
      // anywhere on the card. The picker's own option carries that name too —
      // it leads with «ИТ и софтуер…» and ends with НСИ's label — so a match
      // against the whole card is satisfied by the control the reader just
      // used, and would stay green if the sentence itself started saying «ИТ».
      // The quoted slot in «средната за „…“» is the claim.
      assert.match(
        card,
        /средната за „[^„“]*далекосъобщения/,
        "the sector claim does not name the section in НСИ's own words"
      );
      // Every figure below comes out of the payload through the page's own
      // payroll function, so a quarterly refresh moves the expectation with the
      // cell. Frozen here, each is an assertion that fails on the data being
      // current rather than on the card being wrong.
      const sectorGross = published("sector_salary").sectors.find(
        (s) => s.en_name === "Information and communication"
      ).value_eur;
      const sectorNet = Math.round(
        bgNetSalary(sectorGross, payrollParams(published("payroll"))).net
      );
      const spaced = (n) => new RegExp(String(n).replace(/^(\d)(\d{3})$/, "$1\\s?$2"));

      // The lookbehind is load-bearing: the card carries the reader's own
      // deduction rate a few rows up, so a bare `8%` matches inside `20,8%` and
      // the assertion passes on a card showing no gap at all.
      const gapPct = wageGap(2100, sectorNet).magnitudePct;
      assert.match(
        card,
        new RegExp(`(?<![\\d,])${gapPct}%`),
        `€2,100 net against a sector net of ${sectorNet} is ${gapPct}%, ` +
          `and the card shows something else`
      );
      // **НСИ's own figure, on screen, beside the one we derived from it.** The
      // gross is the cell in their workbook; the net is our payroll conversion.
      // Showing only the net under an «НСИ ·» credit puts their name over our
      // arithmetic and leaves a reader who opens the file with nothing to match
      // the row against.
      assert.match(
        credit,
        spaced(sectorGross),
        "НСИ's published gross for the section is not on the card — only our net conversion is"
      );
      // **The net slot, by value.** The gross above and the attribution below
      // are both satisfied by a template that renders the gross into both
      // slots, and the card then claims НСИ's section average takes home every
      // lev of itself — a reference net a fifth too high, which tells a reader
      // they are twice as far behind their industry as they are.
      assert.match(
        credit,
        spaced(sectorNet),
        `our conversion of НСИ's ${sectorGross} gross is ${sectorNet} net and the credit line ` +
          `shows neither — its net slot is carrying something else: ${credit}`
      );
      assert.match(
        credit,
        /(по наша сметка|our conversion)/,
        "the gross-to-net step is not attributed to us"
      );
      assert.match(
        credit,
        /(предварителни данни|preliminary)/,
        "2026 is preliminary at НСИ and the card shows the figure as settled"
      );

      // **The number never renders alone, and these two never fold.** A gap
      // shown without them reads as a rank, and no pay distribution by sector
      // is published for BG to rank against. `innerText` returns what a reader
      // sees, so a sentence moved inside a closed `<details>` fails here —
      // which is the point: these say what the figure IS.
      assert.match(
        card,
        /как са разпределени заплатите/,
        "the missing-distribution line is absent, or has been folded behind the chip"
      );
      // The scope of the figure, on the card, in the reader's language. The
      // Sofia comparison renders a few lines above this one and Sofia pay is
      // structurally higher, so a gap to a national sector average that does
      // not say it is national charges the city to the reader's industry.
      assert.match(
        card,
        /за цялата страна/,
        "the card does not say the activity figure covers the whole country"
      );

      // **The other two are one tap down, and the tap is on the page.** Four
      // caveats under one number is past the length a reader finishes, so the
      // two qualifying how to READ the gap sit behind the chip — but behind it
      // and gone are different things, and only one of them is a shorter card.
      const more = page.locator(".m-pay details.caveat-more");
      assert.ok(await more.count(), "the folded caveats have no control to open them");
      assert.doesNotMatch(
        card,
        /под средата|трудово и служебно правоотношение/,
        "a folded caveat is rendering in the open — the block is four sentences again"
      );
      // The chip's own words carry the claim, so a reader who never opens it
      // has still been told the average has more to it than its level.
      assert.match(
        await more.locator("summary").innerText(),
        /(средна|average)/i,
        "the chip does not say what is behind it, only that something is"
      );
      await more.locator("summary").click();
      const opened = await more.innerText();
      assert.match(
        opened,
        /под средната за сектора.{0,20}под средата/,
        "the correction for how much an average flatters is absent"
      );
      assert.match(opened, /трудово и служебно правоотношение/, "the coverage line is absent");
      // Both languages inside the disclosure too. A missing string renders as a
      // blank line rather than a fallback, and a folded one is a blank line
      // nobody meets in review.
      const blank = await more.evaluate(
        (el) => [...el.querySelectorAll(".l-bg, .l-en")].filter((n) => !n.textContent.trim()).length
      );
      assert.equal(blank, 0, "a language span inside the sector disclosure is empty");

      // **And the colour agrees with the two sentences above.** The card says
      // the figure is a comparison rather than a rank, and that «под средната
      // за сектора» does not mean «под средата» — while the gap itself was
      // drawn in `--erode`, the red that paints «инфлацията изяде €285» and
      // «над границата от 30%». Colour is a claim (P6) and it is read before
      // either sentence, so a reader met the verdict first and the denial
      // after. Asserted as "not the erode red" in both directions rather than
      // as one hex, so a palette change moves with it.
      // Resolved through a probe element rather than read off the custom
      // property: `getComputedStyle().color` answers in `rgb(...)` and the
      // token is a hex, so comparing the two directly is an assertion that can
      // never match — it would pass whatever the gap is painted.
      const erode = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--erode)";
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      // Selected by `.gap`, the class that names what the line IS. It carried
      // `.hint` too, which is the class the caveats under it carry — and a
      // selector matching both would go on passing if the claim were ever
      // restyled into one of them.
      const gapColour = () =>
        page
          .locator(".m-pay .gap")
          .filter({ hasText: "средната за „" })
          .first()
          .evaluate((el) => getComputedStyle(el).color);
      const below = await gapColour();
      await page.locator("input[type=number]").first().fill("4200");
      await page.waitForTimeout(300);
      const above = await gapColour();
      assert.equal(below, above, "the sector gap changes colour with its direction");
      for (const c of [below, above]) {
        assert.notEqual(
          c,
          erode,
          `the sector gap is painted the erode red (${c}), which grades a comparison`
        );
      }

      // **Each language gets its own edition's label.** НСИ print the section
      // twice — «Създаване и разпространение на информация и творчески
      // продукти; далекосъобщения» and "Information and communication" — and
      // the card renders both spans whatever the reader picked, so handing the
      // English one the Bulgarian name is a one-character edit that leaves the
      // Bulgarian card word-perfect. `format.js#label` admits any letter,
      // Cyrillic included, so nothing below this catches it either.
      const english = (await page.locator(".m-pay .l-en").allTextContents()).join(" ");
      assert.match(
        english,
        /Information and communication/,
        "the English sector sentence does not carry НСИ's own English section name"
      );
      assert.doesNotMatch(
        english,
        /[Ѐ-ӿ]/,
        `a Bulgarian string reaches the English pay card: ${english.replace(/\s+/g, " ")}`
      );

      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);
