/**
 * The prerendered pages — the built HTML as a crawler reads it.
 *
 * `scripts/prerender.mjs` renders every indexable entry on the server at build
 * time, so each page carries its prose — and, on the two that read payloads,
 * the country's figures — before the bundle runs. The assertions here hold the
 * rule from both sides — what has to be there, and what may never be — and they
 * need the build rather than a browser. That the pages still work once the
 * bundle replaces them is a browser test and lives in the suites beside this
 * one.
 *
 * **The rule is that a payload may decide a prerendered figure, and neither
 * the reader nor the clock may.** The wider version — refuse every figure a
 * payload decides, because a number frozen at build time is a second source of
 * truth for one P3 and P4 govern — is the one that suggests itself, and the
 * build's own order is what makes it wrong: `package.json`'s `build` runs
 * `vite build`, then `prerender.mjs`, then `copy-data.mjs`, which copies the
 * same `data/published/*.json` the prerender just read into
 * `dist/data/published/` for the bundle to fetch. One build, one set of files,
 * both ends. What these tests still refuse is what no payload decides: the
 * calculator's output belongs to the reader (P7 — the EUR 900 is a
 * placeholder, not a survey figure), and the freshness verdict belongs to
 * their clock.
 *
 * `COPY` is imported rather than quoted, so this checks the rule (the page
 * carries its own copy) instead of pinning sentences that can be rewritten for
 * a good reason tomorrow. The FIGURES are read back out of the payloads in
 * `dist/`, for the same reason: the assertion is that the served HTML agrees
 * with the JSON shipped beside it, not that it says 4.1%.
 *
 * This is the one render suite that opens NO browser — it reads `dist/` off
 * disk, which is why it imports `render-dist.mjs` rather than the harness.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
// The page dates a figure with this, so an assertion about what a crawler
// reads has to write the month the same way rather than approximating it.
import { periodLong } from "../src/lib/format.js";
// The two documentary pages assemble their prose from these rather than from a
// payload, so the assertions below read the same constants the page renders —
// the rule being checked is that the page carries its own copy, not that it
// still says any particular sentence.
import { DOCS } from "../src/lib/legal.js";
import { SUPPORT_COPY } from "../src/lib/support.js";
import { COPY, DIST, attribution, needsBuild, servedText, shipped } from "./render-dist.mjs";

test(
  "the built page carries its prose without running any JavaScript",
  { skip: needsBuild },
  async () => {
    const html = await readFile(join(DIST, "index.html"), "utf8");
    for (const [what, text] of [
      ["the headline", COPY.h1.bg],
      ["the headline in English", COPY.h1.en],
      ["the privacy line", COPY.privacy.bg],
      ["the explainer's lead", COPY.explainLead.bg],
      ["the explainer's lead in English", COPY.explainLead.en],
      ["the upstream attribution", attribution("bg")],
    ]) {
      assert.ok(
        html.includes(text),
        `${what} is not in the served HTML. Bingbot's second pass is slow and ` +
          "unreliable, so a page whose every word is inside the bundle has no " +
          "subject for it to index at all — see docs/seo.md."
      );
    }
  }
);

test(
  "the built page carries the national figures, and each one is dated",
  { skip: needsBuild },
  async () => {
    // The point of the amendment, asserted against the payloads shipped in the
    // SAME dist/ — so this goes red if the prerender ever stops reading them,
    // and stays green through every refresh.
    const html = await servedText("index.html");
    const [headline, categories, unemployment] = await Promise.all(
      ["hicp_headline", "hicp_categories", "unemployment"].map(shipped)
    );

    // The rate as the page prints it: Bulgarian decimal comma, one place. The
    // prerender renders in the default language, which is BG.
    const bgDecimal = (x) => x.toFixed(1).replace(".", ",");
    const fastest = categories.categories.reduce((a, b) =>
      b.annual_rate_pct > a.annual_rate_pct ? b : a
    );
    for (const [what, text] of [
      ["the headline inflation rate", `${bgDecimal(headline.headline_rate_pct)}%`],
      ["the month the headline describes", headline.ref_period],
      ["the unemployment rate", `${bgDecimal(unemployment.value)}%`],
      ["the month unemployment describes", unemployment.ref_period],
      ["the fastest-rising division's name", fastest.bg_name],
      ["the fastest-rising division's name in English", fastest.en_name],
    ]) {
      assert.ok(
        html.includes(text),
        `${what} is not in the served HTML, though dist/data/published/ carries ` +
          "it. The strip is the page's answer to a crawler and to an agent " +
          "citing it — see docs/seo.md §'The rule'."
      );
    }

    // Every card is dated and every card links out. A figure without its
    // reference period on screen is the one thing that could make a page that
    // outlived its data silently wrong rather than visibly behind (P3, P4).
    assert.ok(
      html.includes("eurostat/api/dissemination"),
      "the prerendered strip carries no Eurostat verify link, so a reader of " +
        "the HTML has a figure with nothing to check it against (P3)"
    );
  }
);

test("the built page bakes in nothing the reader decides", { skip: needsBuild }, async () => {
  const html = await readFile(join(DIST, "index.html"), "utf8");
  assert.ok(
    !html.includes(COPY.loadingK.bg),
    "the loading placeholder is in the served HTML. It is what the calculator " +
      "region renders before the payloads arrive, and a crawler would index it " +
      "as the page's content."
  );
  // The calculator region itself. Its figures are computed from the €900 in
  // the pay field, which the copy under it asks the reader to replace — a
  // worked example, not a survey figure (P7). Serving one is publishing an
  // answer to a question nobody asked.
  for (const [what, marker] of [
    ["the pay field", 'class="m-pay'],
    ["the inputs card", 'class="m-inputs'],
    ["the results card", 'class="m-results'],
    ["the basket sliders", 'id="sliders"'],
  ]) {
    assert.ok(
      !html.includes(marker),
      `${what} is in the served HTML. Everything in that region is a function ` +
        "of what the reader typed, and at build time nobody has."
    );
  }
  // The freshness verdict, which is a function of the clock rather than of a
  // payload. A page stamped "fresh" the day it was built goes on saying so for
  // as long as it is served, and the reader's own tab is the only place that
  // question can be answered.
  assert.ok(
    !html.includes(COPY.dataPanelToggle.bg),
    "the per-payload freshness panel is in the served HTML. Its rows are " +
      "computed against the build's clock, not the reader's — see the seeded " +
      "constructor in calculator.svelte.js."
  );
});

test(
  "the prerendered formula block names the method the page actually used",
  { skip: needsBuild },
  async () => {
    // The half of the old rule that was genuinely about a false statement
    // rather than about staleness — and the reason it is now served rather
    // than withheld. With no payloads the block says the rise since 2020 is
    // the 13 groups summed at their official weights; the page in front of the
    // reader deflates by Eurostat's all-items index, which the build now has.
    const html = await readFile(join(DIST, "index.html"), "utf8");
    const headline = await shipped("hicp_headline");
    assert.ok(
      html.includes(COPY.explainMath.bg) && html.includes('class="fx"'),
      "the explainer's formula block is missing from the served HTML. " +
        "Publishing the method is the §9.2 obligation ExplainerBand names, and " +
        "with the payloads in hand every branch of it is true."
    );
    assert.ok(
      Object.keys(headline.index_by_year ?? {}).length > 0,
      "hicp_headline.json carries no index, so the assertion below is about " +
        "a branch the page could not have taken"
    );
    assert.ok(
      html.includes("prc_hicp_minr, TOTAL"),
      "the served formula block does not name the all-items index. That is " +
        "the fallback branch — the 13 groups summed — and it describes a " +
        "method the page did not use."
    );
  }
);

test(
  "the second page carries the country's figures, without JavaScript",
  { skip: needsBuild },
  async () => {
    // `/how/` exists to answer the informational queries the calculator cannot
    // rank for, which it can only do if the answers are in the HTML. Read back
    // against the shipped payloads rather than pinned to today's numbers.
    const html = await servedText("how", "index.html");
    const [categories, payroll, price, mortgage] = await Promise.all(
      ["hicp_categories", "payroll", "sofia_price", "mortgage"].map(shipped)
    );

    for (const [what, text] of [
      ["the page's own title", COPY.howTitle.bg],
      ["the upstream attribution", attribution("bg")],
      ["the wedge table's heading", COPY.howColEffective.bg],
      ["the wedge table's heading in English", COPY.howColEffective.en],
      ["the ladder's modelled marker", COPY.howModelled.bg],
      ["the Eurostat derivation disclosure", COPY.howOurs.bg],
      ["the Eurostat derivation disclosure in English", COPY.howOurs.en],
    ]) {
      assert.ok(html.includes(text), `${what} is not in the served HTML of /how/`);
    }

    // Both languages, in the DOM at once. A missing string renders as a blank
    // line rather than a fallback, and on this page the blank line would be
    // half the content — which nobody looking at the rendered page in their own
    // language would ever see.
    for (const [what, text] of [
      ["the lead heading", "Числата за България"],
      ["the lead heading in English", "Bulgaria's numbers"],
    ]) {
      assert.ok(html.includes(text), `${what} is not in the served HTML of /how/`);
    }

    // The figures, each read out of the payload the same build shipped.
    const bgInt = (x) => Math.round(x).toLocaleString("bg-BG", { maximumFractionDigits: 0 });
    for (const [what, text] of [
      ["a division's official weight", `${categories.categories[0].weight_pct}`.replace(".", ",")],
      ["the insurance ceiling", bgInt(payroll.max_insurable_income_eur)],
      ["the Sofia €/m² median", bgInt(price.eur_per_m2_median)],
      ["the new-business mortgage rate", `${mortgage.new_business.value_pct}`.replace(".", ",")],
      ["the month the mortgage rate describes", "2026"],
    ]) {
      assert.ok(
        html.includes(text),
        `${what} is not in the served HTML of /how/, though the payload beside ` +
          "it carries the figure"
      );
    }
  }
);

test(
  "the second page blames the right thing for the gap a reader can see",
  { skip: needsBuild },
  async () => {
    // §инфлацията prints Eurostat's all-items headline beside Σ(w·r) over the 13
    // divisions and then explains why they differ. The January re-weighting and
    // the December chain link account for ~0.16 pp of it — but only when the two
    // describe the SAME month. Eurostat's flash publishes the all-items rate
    // about two weeks ahead of any division, and on a payload pair split that
    // way the two figures are several times further apart, almost all of it the
    // fortnight. A paragraph that names the re-weighting either way is true and
    // is not the reason for what is on screen, in the one place a reader who
    // spotted the gap went to look.
    //
    // Asserted against the payloads shipped in the SAME dist/, so it follows
    // whichever state Eurostat's calendar is in on the day rather than pinning
    // today's. Both branches are checked here because both ship: only one of
    // them is reachable per build, and the unreachable one is the sentence that
    // would be wrong.
    const html = await servedText("how", "index.html");
    const [headline, categories] = await Promise.all(
      ["hicp_headline", "hicp_categories"].map(shipped)
    );
    const headlineMonth = String(headline.ref_period ?? "");
    const basketMonth = String(categories.categories?.[0]?.ref_period ?? "");
    assert.ok(headlineMonth && basketMonth, "a payload carries no reference period to compare");

    if (headlineMonth === basketMonth) {
      assert.ok(
        html.includes(COPY.explainSameMonth.bg) && html.includes(COPY.explainSameMonth.en),
        "the two figures describe one month and the page does not say so — the " +
          "reassurance that they are comparable is the whole of why the " +
          "re-weighting is then the entire explanation"
      );
      return;
    }

    // The prerender renders in BG, and `periodLong` is what the page dates a
    // figure with — so these are the exact strings a crawler reads.
    for (const month of [headlineMonth, basketMonth]) {
      assert.ok(
        html.includes(periodLong(month, "bg")),
        `the served /how/ never names ${periodLong(month, "bg")}. The headline ` +
          `is at ${headlineMonth} and the divisions at ${basketMonth}, so most ` +
          "of the gap the page prints is the month rather than the method, and " +
          "the prose has to say which month each figure is"
      );
    }
    assert.ok(
      !html.includes(COPY.explainSameMonth.bg),
      "the page tells the reader both figures are for the same latest month " +
        `while shipping ${headlineMonth} beside ${basketMonth}`
    );
  }
);

test(
  "the documentary pages are served with a heading over their own prose",
  { skip: needsBuild },
  async () => {
    // What a crawler is served is the whole of what it indexes, and prose
    // assembled from in-repo constants is no more present in the HTML than a
    // figure read from a payload: left out of `PRERENDERED`, these two pages
    // ship a mount point and a `<noscript>`, and the heading a search engine
    // reports as missing is sitting in the bundle. `/legal/` is the page ЗЕТ
    // чл. 4 wants findable and `/support/` is the address the funding answer
    // has, so neither can be a page whose subject only a JavaScript-executing
    // crawler can see.
    //
    // Exactly one `<h1>`, counted INSIDE the mount point rather than over the
    // document: `/legal/` publishes four sibling documents, none of which is
    // the page, and four `<h1>`s is the same defect wearing the opposite
    // symptom. A count taken over the whole file would also pass on a heading
    // somebody put in the entry HTML, where `replaceChildren()` deletes it the
    // moment the bundle runs.
    for (const [page, texts] of [
      [["legal", "index.html"], DOCS.flatMap((doc) => [doc.title.bg, doc.title.en])],
      [
        ["support", "index.html"],
        [SUPPORT_COPY.head.bg, SUPPORT_COPY.head.en, SUPPORT_COPY.body.bg, SUPPORT_COPY.body.en],
      ],
    ]) {
      const where = page.join("/");
      const html = await servedText(...page);
      const mounted = html.slice(html.indexOf('<div id="app">'));
      const headings = (mounted.match(/<h1[\s>]/g) ?? []).length;
      assert.equal(
        headings,
        1,
        `${where} serves ${headings} <h1> elements inside #app, and a page needs ` +
          "exactly one — see docs/seo.md §'The prerendered pages'"
      );
      for (const text of texts) {
        assert.ok(
          mounted.includes(text),
          `${where} does not carry "${text.slice(0, 40)}…" in the served HTML, ` +
            "though the module it renders from does. Both languages ship in the " +
            "DOM at once, so a page missing one of them is missing it from the " +
            "crawler's copy too."
        );
      }
    }
  }
);

test(
  "a served page's head carries one title, one description, one canonical",
  { skip: needsBuild },
  async () => {
    // What a crawler that runs nothing reads. The prerender deliberately drops
    // the component's `<svelte:head>` (`prerender.mjs`), so the head a crawler
    // gets is the entry file's alone — which makes this the check on the entry
    // files themselves, where a second description arrives by somebody adding
    // one next to an og:description they were already editing. The runtime half
    // of the same rule is a browser test further down, because `<svelte:head>`
    // reaches the head only once the bundle runs.
    for (const page of [
      ["index.html"],
      ["how", "index.html"],
      ["legal", "index.html"],
      ["support", "index.html"],
    ]) {
      const html = await readFile(join(DIST, ...page), "utf8");
      const where = page.join("/");
      for (const [what, pattern] of [
        ["<title>", /<title[\s>]/g],
        ['<meta name="description">', /<meta[^>]+name="description"/g],
        ['<link rel="canonical">', /<link[^>]+rel="canonical"/g],
      ]) {
        assert.equal(
          (html.match(pattern) ?? []).length,
          1,
          `${where} does not carry exactly one ${what}, and a crawler reads the first`
        );
      }
    }
  }
);

test("the second page has no input on it at all", { skip: needsBuild }, async () => {
  // The whole basis for prerendering `/how/` in full is that nothing on it is
  // the reader's. An input would end that quietly: the page would still render,
  // the tests above would still pass, and the served HTML would start carrying
  // a default somebody chose (P7) or a figure derived from one (P2).
  const html = await readFile(join(DIST, "how", "index.html"), "utf8");
  const body = html.slice(html.indexOf('<div id="app">'));
  for (const tag of ["<input", "<textarea", "<select", "contenteditable"]) {
    assert.ok(
      !body.includes(tag),
      `/how/ renders a ${tag} — the page is a reference with no reader in it, ` +
        "and every figure on it is prerendered on exactly that basis"
    );
  }
});

test("every post-build step left the file it exists to write", { skip: needsBuild }, async () => {
  // A post-build step that does nothing exits 0, and `npm run build` reports
  // success — so the only thing that can catch one is reading `dist/`
  // afterwards. The shape it takes is a run-directly guard that stops matching:
  // `` `file://${process.argv[1]}` `` is not a URL on Windows, where Node hands
  // argv[1] a native `D:\a\...` path, so the step is skipped on one platform
  // and nowhere else. Both generators use `pathToFileURL` for that reason.
  //
  // Named files rather than a count, because the failure is one step going
  // quiet while the rest still run.
  for (const [what, file, mustContain] of [
    ["the sitemap", "sitemap.xml", "<loc>https://vyarno.bg/</loc>"],
    ["the build stamp", "version.json", '"commit"'],
    ["the published payloads", join("data", "published", "hicp_headline.json"), '"as_of"'],
  ]) {
    const body = await readFile(join(DIST, file), "utf8").catch(() => null);
    assert.ok(body !== null, `${what} is not in dist/ — the step that writes it did not run`);
    assert.ok(
      body.includes(mustContain),
      `${what} is in dist/ but does not carry ${mustContain}, so the step ran and wrote nothing useful`
    );
  }
});
