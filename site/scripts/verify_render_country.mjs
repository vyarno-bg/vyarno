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
import { published } from "./published-payload.mjs";

/**
 * A `before` hook that serves one payload with an `as_of` far in the past.
 *
 * The freshness verdict is the one thing on this page no committed file can
 * produce: it is computed against the reader's own clock, so a suite running on
 * green data only ever sees the state where nothing is late. Ageing the file on
 * its way to the tab is what puts the other state on screen, and that state is
 * the whole point of the line under test. Everything else in the payload is
 * served verbatim, so the page under measurement is the real page.
 */
const servedStale = (stem) => async (page) => {
  const aged = { ...published(stem), as_of: "2019-01-01" };
  await page.route(`**/data/published/${stem}.json`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(aged) })
  );
};

test("a payload that stopped refreshing says so on the country page", { skip }, async () => {
  // `/how/` is the page that argues its numbers are checkable, and it could not
  // tell a reader one of them was late. A payload whose workflow stops firing
  // shows an old period caption — which is correct, it is what the figure
  // describes — and the page otherwise looks exactly as it does the day of a
  // refresh. `DataBanner` was on the calculator and nowhere else.
  //
  // It NAMES the payload rather than counting it, which is the difference from
  // the calculator's banner: there the count sits above a disclosure listing
  // every payload with its own date, and this page has no panel to open.
  if (!published("hicp_categories")) return; // no refresh in this checkout

  await withApp(
    async (page, errors) => {
      const note = page.locator(".late");
      assert.equal(await note.count(), 1, "an overdue payload raises no warning on /how/");
      const text = (await note.innerText()).trim();
      // The manifest's own name for it, so a row renamed there renames this.
      assert.ok(
        text.includes("Инфлация по групи"),
        `the warning does not name the late payload: "${text}"`
      );
      assert.match(text, /\d+/, `the warning does not say how late it is: "${text}"`);
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/how/",
    {},
    servedStale("hicp_categories")
  );

  // Nothing at all while every payload is inside its own cadence, which is the
  // ordinary state. A warning that is always up is one nobody reads on the day
  // it means something.
  await withApp(
    async (page, errors) => {
      assert.equal(
        await page.locator(".late").count(),
        0,
        "the overdue warning is up on /how/ with every committed payload inside its own " +
          "cadence. Either a payload has genuinely gone stale — refresh it — or the verdict " +
          "is being computed against something other than `as_of` and the manifest."
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    },
    "/how/",
    {}
  );
});

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

    // **And the имот.bg captions say WHICH date they carry.** The payload holds
    // two facts: `snapshot_date` is имот.bg's own newest published snapshot,
    // `as_of` is the day we fetched it, and the read leaves the first null when
    // the page serves no parseable date list — the case shipped today. A
    // bare «имот.bg · 23.07.2026 г.» therefore lets our download date read as
    // their publication date, on a page whose whole claim is provenance. The
    // calculator has qualified it since the case first turned up.
    for (const block of blocks.filter((b) => b.caption.includes("имот.bg"))) {
      assert.match(
        block.caption,
        /(обновена на|свалена от нас|updated|we fetched it)/,
        `«${block.label.slice(0, 40)}» dates an имот.bg figure without saying whether ` +
          `that is their date or ours: ${block.caption}`
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

test("no figure on the country page is drawn as an em dash", { skip }, async () => {
  // **An em dash where a number goes is what a missed READ looks like**, and
  // it is indistinguishable from a payload that has not loaded. The
  // cheapest-and-dearest-district card reached for `eur_per_m2_min` on the
  // envelope after those fields moved onto each city's row, so it rendered
  // «— – — €» on the one page whose whole claim is that every figure comes
  // from the data — and it did it in served HTML, where a crawler reads it.
  //
  // Over every stat on the page rather than that one card: the payload is
  // reshaped by the pipeline and this is the failure mode a reshape has.
  await withApp(async (page, errors) => {
    const values = await page.locator("main.how .stats .sv").allInnerTexts();
    assert.ok(values.length > 4, "the country page's stat cards are missing");
    for (const v of values) {
      assert.ok(
        /\d/.test(v),
        `a country-page figure carries no digits, which is what a missed payload read looks like: ${v.replace(/\s+/g, " ")}`
      );
    }
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/how/");
});

test("the country page marks a figure its publisher has not finalised", { skip }, async () => {
  // НСИ star a whole year until they settle it, and `region_salary.json` carries
  // `is_preliminary` for the quarter this page reads. The calculator says so on
  // both of its НСИ credit lines; this page showed the same cell as final in
  // four places — the Sofia wage card, the years-of-pay card, the ladder's
  // caption and the quarterly wage table. Telling a reader more certainty than
  // exists is P4, and it lands hardest on the page they came to for provenance.
  //
  // Driven off the payload rather than pinned to today's data: when НСИ
  // finalise the quarter the flag clears, the marker goes with it, and this
  // asserts the absence instead. Either way the page and the payload agree.
  const preliminary = Boolean(published("region_salary").is_preliminary);
  await withApp(async (page, errors) => {
    const captions = await page
      .locator("main.how .ss, main.how p.cap")
      .evaluateAll((els) =>
        els.map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean)
      );
    const nsi = captions.filter((c) => c.includes("НСИ"));
    assert.ok(nsi.length >= 3, `/how/ renders ${nsi.length} НСИ captions, expected at least three`);
    for (const caption of nsi) {
      assert.equal(
        caption.includes("предварителни данни"),
        preliminary,
        preliminary
          ? `an НСИ figure is shown as settled while the payload calls it provisional: ${caption}`
          : `the quarter is final at НСИ and the page still calls it provisional: ${caption}`
      );
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the payroll figures name the ДВ issue, not just its year", { skip }, async () => {
  // The one section on this page whose link cannot reach the instrument:
  // dv.parliament.bg builds permalinks from a session-side id that the issue
  // number does not yield, so a constructed one 404s and the landing page is
  // the honest href. P9 is what that leaves — the caption carries the source
  // name AND the date, and a year is neither: five figures on this section
  // hang off one act, and every ЗБДОО is promulgated in a different issue of
  // whatever year it passes in.
  //
  // Read off the payload so the assertion is the identity rather than a
  // constant that goes stale at the next amendment and gets "fixed" by copying
  // whatever the page shows.
  const payroll = published("payroll");
  const issue = payroll?.gazette_issue;
  assert.ok(issue > 0, "payroll.json carries no ДВ issue for the caption to name");
  const year = payroll.gazette_date.slice(0, 4);

  await withApp(async (page, errors) => {
    // The stat captions and the wedge table's, because the table is computed
    // from those four figures and citing it one act less precisely is the same
    // reader asking which of the two captions is the instrument.
    const captions = [
      ...(await page.locator("#pay .stat .ss").allInnerTexts()),
      ...(await page.locator("#pay p.cap").allInnerTexts()),
    ];
    assert.equal(captions.length, 5, `the payroll section rendered ${captions.length} captions`);
    for (const caption of captions) {
      assert.match(
        caption,
        new RegExp(`(бр\\.|issue)\\s*${issue}\\b`),
        `a payroll figure is cited as «${caption}» — ДВ issue ${issue} is what a ` +
          "reader searches the gazette's archive with, and a year is not it"
      );
      assert.ok(
        caption.includes(year),
        `«${caption}» names an issue with no year beside it, and ДВ restarts its ` +
          "numbering every January"
      );
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the country page answers in the reader's language, both ways", { skip }, async () => {
  // Both languages ship in the DOM at once and one is hidden by CSS, which is
  // exactly why a missing string is invisible in review: the person editing
  // only ever sees one of the two. Here the page is read in both.
  //
  // The English half is read at its OWN URL rather than by switching this page,
  // because that is where a reader meets it: `/how/` and `/en/how/` are two
  // documents mounting one component, and each is served with the other
  // language stripped out of its markup. Reading both is also what catches the
  // entry pair going wrong — a second entry declaring `bg` renders the same
  // heading at both addresses and every count on this page stays right.
  const headings = {};
  for (const [path, where] of [
    ["/how/", "main.how .l-bg, main.how .l-en"],
    ["/en/how/", "main.how .l-bg, main.how .l-en"],
  ]) {
    await withApp(async (page, errors) => {
      const empty = await page.evaluate(
        (sel) =>
          [...document.querySelectorAll(sel)]
            .filter((el) => !el.textContent.trim())
            .map((el) => el.className),
        where
      );
      assert.deepEqual(empty, [], `blank language spans on ${path}: ${empty.join(", ")}`);
      headings[path] = (await page.locator("main.how h1").innerText()).trim();
      assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
    }, path);
  }
  assert.ok(
    headings["/how/"] && headings["/en/how/"],
    "the country page's heading is empty in one language"
  );
  assert.notEqual(
    headings["/en/how/"],
    headings["/how/"],
    "/en/how/ renders the same heading as /how/ — the two entries declare the " +
      "same language, so the English tree is the Bulgarian one at a second URL"
  );
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
