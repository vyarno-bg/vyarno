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
import { SITE } from "./render-dist.mjs";
import { shutdown, skip, withApp } from "./render-harness.mjs";

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
    for (const [what, selector] of [
      ["skip link", "a.skip"],
      ["header", "header.site"],
      ["as-of strip", ".data-strip"],
      ["pay field", ".m-grid .m-pay"],
      ["inputs card", ".m-grid .m-inputs"],
      ["results card shell", ".m-grid .m-results"],
      ["basket sliders", "#sliders .cat"],
      ["results card", ".r-big"],
      ["result rows", ".r-row"],
      ["method drawer", "details.how"],
      ["national strip", ".strip .stat"],
      ["explainer band", ".explain-band"],
      ["footer", "footer"],
    ]) {
      assert.ok(await page.locator(selector).first().count(), `${what} (${selector}) is missing`);
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  });
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

test("the language and theme toggles change the page", { skip }, async () => {
  await withApp(async (page, errors) => {
    const root = page.locator("html");
    assert.equal(
      await root.getAttribute("data-lang"),
      "bg",
      "the default language is not Bulgarian"
    );
    await page.locator("header.site .controls button").nth(1).click();
    await page.waitForTimeout(200);
    assert.equal(await root.getAttribute("data-lang"), "en");

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

// The two pages that carry a skip link. `/legal/`, `/support/` and the 404 have
// the sticky header without one, and that is a design call rather than an
// omission this suite is hiding — those pages put nothing between the header
// and the prose, so there is nothing for a keyboard reader to skip past. Where
// one is added, add its route here and this covers it.
const SKIP_LINK_PAGES = ["/", "/how/"];

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
    await withApp(async (page, errors) => {
      const names = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("header .controls button, .presets")].map(
            (el) => el.getAttribute("aria-label") ?? ""
          )
        );
      const bg = await names();
      assert.equal(
        bg.length,
        3,
        `${bg.length} of the three unlabelled controls carry an aria-label`
      );
      for (const name of bg) {
        assert.match(name, /[Ѐ-ӿ]/, `"${name}" reaches a Bulgarian reader in English`);
      }

      await page.locator("header .controls button").last().click();
      await page.waitForTimeout(300);
      const en = await names();
      for (const [i, name] of en.entries()) {
        assert.ok(name.trim(), "a control lost its accessible name in English");
        assert.notEqual(name, bg[i], `"${name}" is the same string in both languages`);
      }
      assert.deepEqual(errors, [], errors.join(" | "));
    });
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
      // The options are НСИ's twenty rows, and the placeholder is not one of them.
      const options = await picker.locator("option").allInnerTexts();
      assert.equal(
        options.length,
        21,
        `the picker offers ${options.length} rows, expected 20 + the placeholder`
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
      // НСИ's own Bulgarian name for section J, which no reader takes for «ИТ».
      assert.match(
        card,
        /далекосъобщения/,
        "the sector line does not carry НСИ's own section name"
      );
      assert.match(card, /18%/, "the sector gap against €2,100 net is not the published 18%");

      // **The number never renders alone.** A gap shown without these reads as a
      // rank, and no pay distribution by sector is published for BG to rank against.
      assert.match(
        card,
        /разпределение на заплатите по сектори/,
        "the missing-distribution line is absent"
      );
      assert.match(
        card,
        /не значи под средата/,
        "the correction for how much an average flatters is absent"
      );
      assert.match(card, /трудово и служебно правоотношение/, "the coverage line is absent");

      assert.deepEqual(errors, [], errors.join(" | "));
    });
  }
);
