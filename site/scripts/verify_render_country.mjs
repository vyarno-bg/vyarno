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

    // The publishers THIS page names, each reachable from it. The footer's
    // attribution line is a licence condition; these are the links that make it
    // checkable. БНБ is not among them: §`#loan` is a pointer now and the
    // outstanding book and the lending limits render on `/credit/`, where
    // `verify_render_credit.mjs` makes the same assertion over the same host.
    const hrefs = await page
      .locator("main.how a[href^='https://']")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")).join(" "));
    for (const host of ["ec.europa.eu", "nsi.bg", "imot.bg", "ecb.europa.eu"]) {
      assert.ok(
        hrefs.includes(host),
        `/how/ renders figures from ${host} and links to none of them`
      );
    }
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test(
  "the wedge curve is drawn on the country page, with nobody standing on it",
  { skip },
  async () => {
    // The section's finding is a shape — flat to the insurance ceiling, falling
    // above it — and five table rows state it only to a reader willing to hold
    // five effective rates in their head. The table is still the exact figures
    // and still open, because a picture is not its own text alternative.
    //
    // **And the marker count is the assertion that matters.** `WedgeChart` draws
    // whatever markers it is handed and cannot tell whose gross they are, so the
    // page with no input is one wrong prop away from plotting a personal
    // effective rate — which inverts to the salary above the ceiling (P2). The
    // wiring keeps that unexpressible (`view/country.js#wedgeCurve` has no `pay`
    // parameter) and this is the same fact read off the drawing, because the
    // failure would be visible on screen and in served HTML.
    await withApp(async (page, errors) => {
      const chart = page.locator("#pay svg.wedge");
      assert.equal(await chart.count(), 1, "the wedge section draws no curve");
      assert.ok(
        (await chart.locator("path.wedge-effective").getAttribute("d"))?.startsWith("M"),
        "the effective-rate line is drawn with no path"
      );
      assert.equal(
        await chart.locator("circle.wedge-you").count(),
        0,
        "somebody is marked on the country page's wedge curve — that marker is a " +
          "reader's own gross, and this page has no reader in it (P2)"
      );
      // The key names both series and the threshold, so the picture is readable
      // without the description a pointer never hears.
      assert.equal(await page.locator("#pay .wedge-key .wk").count(), 3);
      assert.match(
        (await chart.getAttribute("aria-label")) ?? "",
        /\d/,
        "the curve's description carries no figure, so it says a chart is there and " +
          "nothing that is in it"
      );
      // The exact figures stay on the page rather than moving behind the picture.
      assert.ok(
        (await page.locator("#pay table tbody tr").count()) >= 4,
        "the wedge table went away when the chart arrived"
      );
      assert.deepEqual(errors, [], errors.join(" | "));
    }, "/how/");
  }
);

test("the country page says which of its figures is not its publisher's", { skip }, async () => {
  // Σ over the thirteen divisions is ours — Eurostat publish the shares and
  // the rates and never that sum — and it stands beside their own all-items
  // rate, 1.3 pp away during their flash. Captioned «Евростат» it is their
  // figure, in their voice, contradicting their published one, on the page
  // whose whole claim is that a reader can tell whose number is whose.
  //
  // The disclosure has to be able to be RE-RUN, not merely made: Eurostat
  // permit derivation on condition it is stated, and a sceptic needs the rates
  // back. `view/basket.js#basketSumQuery` is the query, and it is asserted here
  // as a link because the licence is discharged on the page rather than in the
  // module.
  await withApp(async (page, errors) => {
    const captions = await page
      .locator("#inflation .stat .ss")
      .evaluateAll((els) => els.map((el) => el.textContent.replace(/\s+/g, " ").trim()));
    assert.equal(captions.length, 2, `§инфлацията rendered ${captions.length} figures`);
    const ours = captions.filter((c) => c.includes("наша сметка"));
    assert.equal(
      ours.length,
      1,
      `exactly one of the two inflation figures is ours; ${ours.length} say so: ${captions.join(" / ")}`
    );
    // And the other one is still Eurostat's own, plainly. A section where both
    // cards disclaim the publisher is the same failure pointing the other way.
    assert.ok(
      captions.some((c) => c.includes("Евростат") && !c.includes("наша сметка")),
      `no figure in §инфлацията is attributed to Eurostat at all: ${captions.join(" / ")}`
    );

    const disclosure = page.locator("#inflation p.ours");
    assert.equal(await disclosure.count(), 1, "the sum carries no derivation disclosure");
    // One per language span, because both ship in the DOM and `tokens.css`
    // hides the one the entry does not declare — a link written into one side
    // only is a blank where the other reader's «провери» goes, which is
    // invisible to whoever edited it.
    const check = disclosure.locator('a[href*="coicop18"]');
    assert.equal(
      await check.count(),
      2,
      "the disclosure's re-run query is missing from one of the two languages"
    );
    const hrefs = await check.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    assert.equal(hrefs[0], hrefs[1], "the two languages check the sum against different queries");
    const href = hrefs[0] ?? "";
    assert.ok(
      (href.match(/coicop18=/g) ?? []).length >= 13,
      `the re-run query asks for ${(href.match(/coicop18=/g) ?? []).length} divisions, and the ` +
        "figure over it is a sum across all of them"
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/how/");
});

test("whose figure it is can be read without reading the caption", { skip }, async () => {
  // Eighteen figures from six publishers, one of which is us. Set at one
  // weight in one colour the answer to «whose is this» is only reachable by
  // reading every caption in turn, and the reader who wants it — somebody
  // deciding what to attribute a number to — is the one least likely to.
  //
  // Asserted as the painted effect rather than as the declaration: the
  // publisher has to be a distinct element AND come out heavier and darker
  // than the period beside it, which survives the same result reached another
  // way.
  await withApp(async (page, errors) => {
    const seen = await page.locator("main.how .stat .ss").evaluateAll((els) =>
      els.map((el) => {
        const pub = el.querySelector(".pub");
        const per = el.querySelector(".per");
        if (!pub || !per) return null;
        const a = getComputedStyle(pub);
        const b = getComputedStyle(per);
        return {
          name: pub.textContent.replace(/\s+/g, " ").trim(),
          weight: Number(a.fontWeight),
          otherWeight: Number(b.fontWeight),
          colour: a.color,
          otherColour: b.color,
        };
      })
    );
    assert.ok(seen.length >= 12, `/how/ rendered ${seen.length} figure captions`);
    for (const row of seen) {
      assert.ok(row, "a figure's caption does not separate its publisher from its period");
      assert.ok(row.name, "a figure's caption names no publisher");
      assert.ok(
        row.weight > row.otherWeight || row.colour !== row.otherColour,
        `«${row.name}» is painted exactly like the date beside it, so the publisher ` +
          "column cannot be scanned"
      );
    }
    // Every publisher on the page, each spelled one way. Two spellings of one
    // upstream read as two upstreams down a column of eighteen.
    const names = new Set(seen.map((r) => r.name));
    assert.ok(
      names.size >= 5,
      `only ${names.size} distinct publishers across ${seen.length} figures: ${[...names].join(" / ")}`
    );
    assert.deepEqual(errors, [], errors.join(" | "));
  }, "/how/");
});

test("the country page ends somewhere, and names both places", { skip }, async () => {
  // A reference page that ends is a reader with nowhere to go. `/market/` was
  // reachable from here only through a clause inside §цената в обявите — a
  // route for somebody who read that section, and none at all for the reader
  // who came for the wedge.
  await withApp(async (page, errors) => {
    const links = await page
      .locator("main.how nav.onward a")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    assert.deepEqual(links, ["/", "/market/"], `the page's routes out are ${links.join(", ")}`);
    // Each says what it gives. «Пазарът на жилища →» answers where it goes and
    // not why anybody would follow it.
    const subs = await page.locator("main.how nav.onward .sub").allInnerTexts();
    assert.equal(subs.length, 2, "a route out carries no line saying what it is for");
    for (const s of subs) assert.ok(s.trim().split(/\s+/).length >= 4, `a bare label: «${s}»`);
    assert.deepEqual(errors, [], errors.join(" | "));
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
    assert.equal(captions.length, 6, `the payroll section rendered ${captions.length} captions`);
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
      // The date is a reader's, never the payload's key. `dateShort` is what
      // turns 2026-07-28 into «28.07.2026 г.» and «28 Jul 2026», and a caption
      // reaching the page in ISO is one that skipped it — the same rule
      // verify_render_market.mjs holds over the market page's periods, on the
      // page whose citations are the whole point of the section.
      assert.doesNotMatch(
        caption,
        /\d{4}-\d{2}/,
        `«${caption}» dates a payroll figure in the notation the pipeline keys ` +
          "it by rather than the one the other captions beside it use"
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
  // somebody edited.
  //
  // `head > title` and not `title`: a `<title>` inside an SVG is the accessible
  // name of a shape, and a chart hangs one on every point it lets a pointer
  // find. A bare selector counts those, so the check went red at 79 over a
  // page whose head was correct. `App.svelte` and `How.svelte` each carry a comment saying
  // the description belongs in the entry file; this is the check behind it, and
  // it needs a browser because the tag never exists until the bundle mounts.
  for (const path of ["/", "/how/"]) {
    await withApp(
      async (page, errors) => {
        const head = await page.evaluate(() => ({
          titles: [...document.querySelectorAll("head > title")].map((el) => el.textContent),
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

test("the labour-cost chart draws a partition rather than three washes", { skip }, async () => {
  // The one suite that runs the app, and the only thing that would notice this
  // chart rendering blank. Three properties, and each fails as a picture that
  // still looks like a chart:
  //
  //  - the three bands are all painted. An unfilled one leaves a gap the eye
  //    reads as a fourth category nobody named.
  //  - they meet. The bands are a partition in `mirror.js#bgLabourCost`, and a
  //    geometry bug that left daylight between two of them would draw the wedge
  //    as bigger or smaller than it is while every number on the page stayed
  //    right.
  //  - the top of the stack is the top of the plot. The employer's band is the
  //    part a reader has never seen, so a stack that stopped short would drop
  //    exactly the series this chart was added for.
  await withApp(async (page, errors) => {
    const svg = page.locator("svg.lc").first();
    assert.ok(await svg.count(), "the labour-cost chart is not on /how/ at all");

    for (const cls of ["lc-net", "lc-employee", "lc-employer"]) {
      const fill = await page
        .locator(`.${cls}`)
        .first()
        .evaluate((el) => getComputedStyle(el).fill);
      assert.ok(fill && fill !== "none", `.${cls} is unfilled (fill: ${fill})`);
    }

    // Sampled down one column of the plot: every y from the top of the frame to
    // the baseline has to be inside exactly one band.
    const gaps = await svg.evaluate((el) => {
      const bands = ["lc-net", "lc-employee", "lc-employer"].map((c) =>
        el.querySelector(`path.${c}`)
      );
      const baseY = Number(el.querySelector("line.lc-base").getAttribute("y1"));
      const x = Number(el.querySelector("line.lc-cap").getAttribute("x1")) - 20;
      const out = [];
      for (let y = 11; y < baseY - 1; y += 0.5) {
        const hits = bands.filter((b) => b.isPointInFill(new DOMPoint(x, y))).length;
        if (hits === 0) out.push(y);
      }
      return { gaps: out.length, baseY };
    });
    assert.equal(
      gaps.gaps,
      0,
      `${gaps.gaps} sampled heights fall in no band at all — the stack has holes, ` +
        "so the wedge it draws is not the wedge it computes"
    );

    // The key names every band that is drawn, and nothing that is not.
    assert.equal(await page.locator("svg.lc").count(), await page.locator(".lc-key").count());
    const keyText = await page.locator(".lc-key").first().innerText();
    assert.ok(keyText.trim().length > 0, "the chart's key rendered empty");

    // The denominator is stated under the picture. Every percentage on this
    // chart is a share of the labour cost, and the other chart on this page is
    // the same euros over the gross — a figure ten points lower and as true.
    const denom = await page.locator(".lc-denom").first().innerText();
    assert.match(denom, /разход за труд|cost of employment/);

    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the two wedge charts state different denominators and share no axis", { skip }, async () => {
  // `docs/math.md` §"Which rate goes into the annuity" refuses this blur for
  // the three mortgage rates. Here it is two charts on one page measuring the
  // same euros: 22.4% of gross and 34.7% of labour cost. Drawn on one axis, or
  // captioned without their bases, a reader cannot say which they are reading.
  await withApp(async (page, errors) => {
    assert.ok(await page.locator("svg.wedge").count(), "the gross-side chart is missing");
    assert.ok(await page.locator("svg.lc").count(), "the labour-cost chart is missing");

    const gross = await page.locator(".wedge-key").first().innerText();
    const cost = await page.locator(".lc-key").first().innerText();
    assert.notEqual(
      gross.trim(),
      cost.trim(),
      "both charts carry the same key, so nothing on screen says they are measured " +
        "against different denominators"
    );

    // Both mark the ceiling, which is what lets a reader line them up, and
    // that is the ONLY thing they are allowed to share.
    assert.ok(await page.locator("line.wedge-cap").count());
    assert.ok(await page.locator("line.lc-cap").count());

    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test("the unemployment curve is drawn, from zero, with the survey's caveat", { skip }, async () => {
  // The figure above it is 3,0% and the series behind it runs from a 6,7%
  // lockdown month, so a cropped axis would draw the fall as unemployment
  // ending. And the caveat is what stops the number being read as the one in
  // the news: this is the labour force survey's count, not the people
  // registered at the labour offices, which is a different and larger figure.
  await withApp(async (page, errors) => {
    const chart = page.locator("main #work .chart");
    assert.equal(await chart.locator("svg.pane .plot-line").count(), 1, "no line was drawn");
    const labels = await chart
      .locator(".yaxis .plot-tick")
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    assert.ok(labels.length >= 4, `the unemployment axis drew ${labels.length} ticks`);
    const values = labels.map((label) => Number(label.replace(/[^\d]/g, "")));
    assert.equal(Math.min(...values), 0, `the axis floors at ${Math.min(...values)}%`);
    const steps = values.slice(1).map((v, i) => v - values[i]);
    for (const step of steps) {
      assert.ok(
        Math.abs(step - steps[0]) < 1e-9,
        `the axis labels ${labels.join(" \u00b7 ")} are not evenly spaced`
      );
    }
    // The years under the plot, so a reader can say WHEN the peak was.
    assert.ok(
      (await chart.locator(".xyears .plot-tick").count()) >= 3,
      "the plot has no time axis"
    );
    const caveat = await page.locator("main #work .cap").first().innerText();
    assert.match(caveat, /бюрата по труда|labour offices/);
    assert.deepEqual(errors, [], `the page logged errors: ${errors.join(" | ")}`);
  }, "/how/");
});

test.after(shutdown);
