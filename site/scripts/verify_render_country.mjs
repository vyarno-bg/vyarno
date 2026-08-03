/**
 * `/how/` — the country's figures on a page of their own.
 *
 * The page is prerendered in full and then mounted over, which makes it the
 * one route where "the bundle never ran" is invisible to an element check: the
 * frozen copy is still standing and still says the right thing. So these hold
 * both ends — that the live table replaced the prerendered one, that every
 * figure names a source and a period, and that the page answers in the
 * reader's language whichever way they arrived.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {} from "./render-dist.mjs";
import { shutdown, skip, withApp } from "./render-harness.mjs";

test("the country page mounts over its prerender rather than beside it", { skip }, async () => {
  // The failure `how-main.js`'s `replaceChildren()` prevents, checked on the
  // page rather than on the file: `mount()` appends, and this entry arrives
  // with the whole prerendered page already in `#app`. Left in place a reader
  // gets every heading and every table twice — the second copy live and the
  // first frozen at build time, which is the version that would be wrong first.
  await withApp(async (page, errors) => {
    for (const [what, selector] of [
      ["header", "header.site"],
      ["h1", "main h1"],
      ["footer", "footer.site"],
    ]) {
      assert.equal(await page.locator(selector).count(), 1, `${what} appears twice on /how/`);
    }
    // Every section the contents list promises, drawn and carrying figures.
    const sections = await page.locator("main.how section[id]").count();
    assert.ok(sections >= 7, `/how/ rendered ${sections} sections`);
    assert.equal(
      await page.locator("main.how nav.toc a").count(),
      sections,
      "the contents list and the sections have parted company — one of them " +
        "names something that is not there"
    );
    assert.ok(
      (await page.locator("main.how table tbody tr").count()) >= 20,
      "the tables on /how/ drew almost no rows, so a payload is not reaching them"
    );
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("every figure on the country page names a source and a period", { skip }, async () => {
  // P3, on the page whose whole claim is that it holds. A stat block with no
  // caption is a number a reader cannot check; a caption with no period is a
  // number they cannot date, which is also the only thing that would make a
  // page outliving its data visibly behind rather than silently wrong (P4).
  await withApp(async (page, errors) => {
    const blocks = await page.locator("main.how .stat").evaluateAll((els) =>
      els.map((el) => ({
        label: (el.querySelector(".sl")?.textContent ?? "").trim(),
        caption: (el.querySelector(".ss")?.textContent ?? "").trim(),
        href: el.querySelector(".ss a")?.getAttribute("href") ?? "",
      }))
    );
    assert.ok(blocks.length >= 12, `/how/ rendered ${blocks.length} figures`);
    for (const block of blocks) {
      assert.ok(block.label, "a figure on /how/ carries no label saying what it is");
      assert.match(
        block.href,
        /^https:\/\//,
        `«${block.label.slice(0, 40)}» links to "${block.href}" rather than out to its publisher`
      );
      assert.match(
        block.caption,
        /\d{4}/,
        `«${block.label.slice(0, 40)}» carries no year in its caption, so the ` +
          "figure is undated (P3, P4)"
      );
    }

    // The five publishers, each reachable from the page that names their
    // figures. The footer's attribution line is a licence condition; these are
    // the links that make it checkable.
    const hrefs = await page
      .locator("main.how a[href^='https://']")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")).join(" "));
    for (const host of ["ec.europa.eu", "nsi.bg", "imot.bg", "ecb.europa.eu", "bnb.bg"]) {
      assert.ok(
        hrefs.includes(host),
        `/how/ renders figures from ${host} and links to none of them`
      );
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the country page answers in the reader's language, both ways", { skip }, async () => {
  // Both languages ship in the DOM at once and one is hidden by CSS, which is
  // exactly why a missing string is invisible in review: the person editing
  // only ever sees one of the two. Here the page is read in both.
  await withApp(async (page, errors) => {
    const empty = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("main.how .l-bg, main.how .l-en")) {
        if (!el.textContent.trim()) out.push(el.className);
      }
      return out;
    });
    assert.deepEqual(empty, [], `blank language spans on /how/: ${empty.join(", ")}`);

    const bg = (await page.locator("main.how h1").innerText()).trim();
    await page.locator("header.site .pill").last().click();
    await page.waitForTimeout(300);
    const en = (await page.locator("main.how h1").innerText()).trim();
    assert.ok(bg && en, "the country page's heading is empty in one language");
    assert.notEqual(en, bg, "the heading is the same string in both languages");
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the country page fits a phone, and its wide tables scroll inside it", { skip }, async () => {
  // Five columns do not fit 360px, so each table sits in an `overflow-x: auto`
  // box. The failure that box exists to prevent is the PAGE scrolling sideways
  // instead — which puts the sticky header, the contents list and every
  // paragraph on a horizontal ride at the width most Bulgarian readers arrive
  // at. The two halves are asserted together because dropping the box fixes
  // neither and passes the second on its own.
  for (const width of [360, 390]) {
    await withApp(
      async (page, errors) => {
        const seen = await page.evaluate(() => ({
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          boxes: [...document.querySelectorAll("main.how .scroll")].map((el) => ({
            over: el.scrollWidth - el.clientWidth,
            inViewport:
              el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1,
          })),
        }));
        assert.ok(
          seen.docScroll <= seen.docClient + 1,
          `/how/ scrolls sideways at ${width}px (${seen.docScroll} against ${seen.docClient})`
        );
        assert.ok(seen.boxes.length >= 4, `/how/ rendered ${seen.boxes.length} scroll boxes`);
        for (const box of seen.boxes) {
          assert.ok(box.inViewport, `a table box reaches past the ${width}px viewport`);
        }
        assert.ok(
          seen.boxes.some((b) => b.over > 0),
          `no table on /how/ overflows its box at ${width}px, so either the ` +
            "tables shrank out of the shape this protects or the box stopped " +
            "clipping and the page is about to scroll instead"
        );
        assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
      },
      "/how/",
      { viewport: { width, height: 780 } }
    );
  }
});

test("a keyboard reader can reach every column of every table", { skip }, async () => {
  // A scroll container is not focusable on its own, and two of the four on
  // `/how/` contain no link either — so at a phone width the wedge table's last
  // two columns were unreachable by any keyboard means at all, on a page whose
  // whole content is tables. The box is a tab stop AND carries a name, because
  // a tab stop that announces nothing is its own defect.
  await withApp(
    async (page, errors) => {
      const boxes = await page.locator("main.how .scroll").evaluateAll((els) =>
        els.map((el) => ({
          tabIndex: el.tabIndex,
          role: el.getAttribute("role"),
          label: (el.getAttribute("aria-label") ?? "").trim(),
        }))
      );
      assert.ok(boxes.length >= 4, `/how/ rendered ${boxes.length} scroll boxes`);
      const names = new Set();
      for (const box of boxes) {
        assert.equal(box.tabIndex, 0, "a table's scroll box is not a tab stop");
        assert.equal(box.role, "region", "a focusable scroll box announces no role");
        assert.ok(box.label, "a focusable scroll box has no accessible name");
        names.add(box.label);
      }
      assert.equal(
        names.size,
        boxes.length,
        `two scroll boxes share a name (${[...names].join(" / ")}) — a landmark ` +
          "list that repeats one label tells a reader which tables exist and not " +
          "which is which"
      );

      // And it actually scrolls once focused, which is the whole point of the
      // attribute rather than a property of having it.
      const moved = await page.evaluate(async () => {
        const box = [...document.querySelectorAll("main.how .scroll")].find(
          (el) => el.scrollWidth > el.clientWidth
        );
        if (!box) return null;
        box.focus();
        const before = box.scrollLeft;
        box.scrollLeft = before + 40;
        return { focused: document.activeElement === box, before, after: box.scrollLeft };
      });
      assert.ok(moved, "no table overflows at this width, so the box under test is the wrong one");
      assert.ok(moved.focused, "the scroll box refused focus");
      assert.ok(moved.after > moved.before, "the focused box did not scroll");
      assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
    },
    "/how/",
    { viewport: { width: 360, height: 780 } }
  );
});

test("mounting adds no second title or description to the head", { skip }, async () => {
  // `<svelte:head>` APPENDS to the real head rather than replacing what the
  // entry file put there, so a component that declares a `<meta
  // name="description">` leaves the reader's page carrying two — and a crawler
  // that DOES run the bundle takes the first, which is no longer the one
  // somebody edited. `App.svelte` and `How.svelte` each carry a comment saying
  // the description belongs in the entry file; this is the check behind it, and
  // it needs a browser because the tag never exists until the bundle mounts.
  for (const path of ["/", "/how/"]) {
    await withApp(
      async (page, errors) => {
        const head = await page.evaluate(() => ({
          titles: [...document.querySelectorAll("title")].map((el) => el.textContent),
          descriptions: document.querySelectorAll('meta[name="description"]').length,
          canonicals: document.querySelectorAll('link[rel="canonical"]').length,
        }));
        assert.equal(head.titles.length, 1, `${path} has titles: ${head.titles.join(" | ")}`);
        assert.ok(head.titles[0]?.trim(), `${path} mounted an empty title`);
        assert.equal(
          head.descriptions,
          1,
          `${path} carries ${head.descriptions} descriptions once mounted — see ` +
            "docs/seo.md §'Why not hydration'. The description belongs in the " +
            "entry file, never in <svelte:head>."
        );
        assert.equal(head.canonicals, 1, `${path} carries ${head.canonicals} canonical links`);
        assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
      },
      path,
      {}
    );
  }
});

test("the country page's stat rows leave no orphaned cell", { skip }, async () => {
  // The rule the national strip is already held to, on the page that repeats
  // the shape seven times with one to four cards per row. `flex: 1 1 190px` in
  // a wrapping row is what makes a lone last card fill its row instead of
  // sitting at a third of the width beside two empty cells; a fixed column
  // count would look identical at one width and leave the hole at another.
  for (const width of [1280, 768, 390]) {
    await withApp(
      async (page, errors) => {
        const groups = await page.locator("main.how .stats").evaluateAll((els) =>
          els.map((el) =>
            [...el.children].map((k) => {
              const r = k.getBoundingClientRect();
              return { top: Math.round(r.top), right: Math.round(r.right) };
            })
          )
        );
        assert.ok(groups.length >= 5, `/how/ rendered ${groups.length} stat rows`);
        for (const [i, cards] of groups.entries()) {
          const rows = new Map();
          for (const c of cards) {
            const key = [...rows.keys()].find((t) => Math.abs(t - c.top) < 4) ?? c.top;
            rows.set(key, [...(rows.get(key) ?? []), c]);
          }
          const full = Math.max(...cards.map((c) => c.right));
          for (const [top, row] of rows) {
            const reached = Math.max(...row.map((c) => c.right));
            assert.ok(
              full - reached < 8,
              `at ${width}px, stat group ${i}'s row at y=${top} stops ` +
                `${full - reached}px short of the others — its last card is ` +
                "followed by an empty cell"
            );
          }
        }
        assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
      },
      "/how/",
      { viewport: { width, height: 900 } }
    );
  }
});

test.after(shutdown);
