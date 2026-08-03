#!/usr/bin/env node
/**
 * Verification for `src/lib/legal.js` and `src/lib/legal-nav.js`.
 *
 * The legal pages are the one part of the product where being wrong is not a
 * wrong number but a false statement about who is behind the site — an
 * invented registration number, a contact address that does not resolve, a
 * document linked from the footer that renders empty, or a promise the front
 * page contradicts. None of that is catchable by the math suites, so it is
 * caught here.
 *
 * Each test below was checked by breaking the thing it protects and watching
 * it go red (docs/testing-strategy.md §"The standard a test has to meet").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DOCS,
  IDENTITY,
  LEGAL_EFFECTIVE,
  LEGAL_FORM,
  LEGAL_VERSION,
  SUPERVISORS,
  UPSTREAMS,
  commercialSignals,
  copyStrings,
  docById,
  identityDuties,
  identityRows,
  unpublishedIdentityFields,
} from "../src/lib/legal.js";
import { COPY, HOME } from "../src/lib/content.js";
import { CONTACT, LEGAL_NAV, REPO_OWNER, REPO_SLUG, REPO_URL } from "../src/lib/legal-nav.js";
import { BUILD_ID } from "../src/lib/build.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(HERE, "..", ...p), "utf-8");

const FOOTER = read("src", "lib", "SiteFooter.svelte");
const LEGAL_PAGE = read("src", "Legal.svelte");
const CONTENT = read("src", "lib", "content.js");

const LANGS = ["bg", "en"];

/** Every `{bg, en}` pair reachable from a document, section or table row. */
function* everyPair(node, path = "legal.js") {
  if (node === null || typeof node !== "object") return;
  if (typeof node.bg === "string" && typeof node.en === "string") {
    yield [path, node];
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    yield* everyPair(v, `${path}.${k}`);
  }
}

// ---------------------------------------------------------------------------
// ЗЕТ чл. 4 — the published identity
// ---------------------------------------------------------------------------

test("every ЗЕТ чл. 4 row is declared, including the ones a paid service owes", () => {
  // The unconditional points — name (т. 1), address (т. 2) and correspondence
  // data (т. 4) — plus the activity, are owed by anyone. The register entry
  // (т. 5) and the VAT indication (т. 8) are conditional on their own wording,
  // and they must still be DECLARED here even though they are not published: an
  // obligation that exists nowhere in the file is one nobody notices falling
  // due.
  const required = ["legal_name", "email", "activity", "postal_address", "register_entry", "vat"];
  const ids = IDENTITY.map((r) => r.id);
  for (const id of required) {
    assert.ok(
      ids.includes(id),
      `IDENTITY has no "${id}" row — ЗЕТ чл. 4 covers it, and a row that is ` +
        "absent from the file cannot become due when the legal form changes."
    );
  }
});

test("every identity row says which legal form owes it", () => {
  const known = new Set(["always", "paid", "vat"]);
  for (const row of IDENTITY) {
    assert.ok(row.label?.bg && row.label?.en, `${row.id} has no bilingual label`);
    assert.ok(
      known.has(row.dueWhen),
      `${row.id} has dueWhen="${row.dueWhen}", which identityDuties() does not ` +
        "know — the row would be silently unpublishable and unguardable."
    );
    if (row.value == null) {
      assert.ok(
        row.note?.bg && row.note?.en,
        `${row.id} has no value and no note saying which provision asks for ` +
          "it. An undocumented blank is indistinguishable from an oversight."
      );
    }
  }
});

test("the page publishes exactly the rows this legal form owes, and no blanks", () => {
  // The failure this replaces: four rows sat "предстои" on a live page with no
  // date and no company coming. A reader learns to skip the section, and the
  // one row that matters goes unread with it.
  const rows = identityRows(LEGAL_FORM, IDENTITY);
  assert.ok(rows.length > 0, "the identity table renders nothing at all");
  for (const row of rows) {
    assert.notEqual(
      row.value,
      null,
      `${row.id} is due under LEGAL_FORM="${LEGAL_FORM.id}" but has no value — ` +
        "it would render as an empty legal fact, which reads as if we had answered."
    );
  }
  // And the rows that are NOT due are genuinely absent, not merely styled away.
  const rendered = new Set(rows.map((r) => r.id));
  for (const row of IDENTITY) {
    if (identityDuties(LEGAL_FORM).has(row.dueWhen)) continue;
    assert.ok(
      !rendered.has(row.id),
      `${row.id} is not due but is still published — that is the "pending row ` +
        'forever" failure under a new name.'
    );
  }
});

test("no identity row carries an invented registration number", () => {
  // The specific failure this exists for: someone fills a register number with
  // a plausible nine digits to make the release guard pass.
  const placeholderish = /^(x+|0+|9+|тбд|tbd|n\/?a|123456789|—|-+)$/i;
  for (const row of IDENTITY) {
    if (typeof row.value !== "string") continue;
    assert.ok(
      !placeholderish.test(row.value.trim()),
      `${row.id} = "${row.value}" looks like a placeholder ` +
        "dressed as a fact. Leave it `value: null` instead."
    );
  }
});

test("the release guard passes today, and goes red the day we take payment", () => {
  // Half of the point of the rework: `build:release` must pass NOW, or it gets
  // deleted in frustration rather than fixed.
  assert.deepEqual(
    unpublishedIdentityFields(LEGAL_FORM, IDENTITY),
    [],
    "the release build is blocked on a row this legal form owes — either " +
      "publish the fact or correct its dueWhen."
  );
  // The other half: it must still guard something. Flip the form and the same
  // function has to name what became due, or the guard is decorative.
  //
  // The address is deliberately NOT in that list. ЗЕТ чл. 4, ал. 1, т. 2
  // carries no возмездност condition — that test belongs to чл. 1, ал. 3 and
  // qualifies the service, not the row — so the address is owed and published
  // already. What payment adds is the register entry.
  const paid = { ...LEGAL_FORM, takesPayment: true };
  const dueOnPayment = unpublishedIdentityFields(paid, IDENTITY);
  assert.ok(
    dueOnPayment.includes("register_entry"),
    "taking payment no longer makes the register entry due — " +
      `the guard would stay green through the change that matters. Got: ${dueOnPayment}`
  );
  // VAT is conditional on registration, not on revenue: it must NOT fire early.
  assert.ok(
    !dueOnPayment.includes("vat"),
    "the VAT row fires on the first payment. ЗЕТ чл. 4, т. 8 is owed only " +
      "while registered under ЗДДС, and the threshold is €51,130 a year."
  );
  assert.ok(
    unpublishedIdentityFields({ ...paid, vatRegistered: true }, IDENTITY).includes("vat"),
    "registering for VAT no longer makes the VAT row due."
  );
});

test("the unconditional чл. 4 rows are published now, address included", () => {
  // The failure this exists for: marking the address row `dueWhen: "paid"`,
  // which reads as an obvious tidy-up on a service that takes no payment. ЗЕТ
  // чл. 4, ал. 1 does not support it — т. 5 („данни за вписване"), т. 6
  // („когато тази дейност подлежи на…"), т. 7 („когато осъществява регулирана
  // професия") and т. 8 („ако е регистриран по ЗДДС") carry their conditions on
  // their face and т. 2 does not. A free service owes the address exactly as
  // much as it owes its name, so this asserts the three unconditional rows are
  // published rather than merely declared.
  const published = new Set(identityRows(LEGAL_FORM, IDENTITY).map((r) => r.id));
  for (const id of ["legal_name", "email", "postal_address"]) {
    assert.ok(
      published.has(id),
      `${id} is not published under the current form. ЗЕТ чл. 4, ал. 1 owes it ` +
        "of every доставчик, paid or free."
    );
  }
  const address = IDENTITY.find((r) => r.id === "postal_address");
  assert.equal(
    address.dueWhen,
    "always",
    "the address row is conditional again. There is no возмездност trigger in т. 2."
  );
  // And it has to resolve to something a person can act on. The row is
  // discharged by a route to the address rather than by the address, which is
  // only honest while the route names where to ask.
  for (const lang of ["bg", "en"]) {
    assert.match(
      address.value[lang],
      /contact@vyarno\.bg/,
      `the address row's ${lang} value no longer names where to ask for it, so ` +
        "it promises a route without giving one."
    );
  }
});

test("the guard's commercial tripwire fires on a price and not on prose", () => {
  // Without this, `takesPayment: false` is a knob the guard only ever confirms.
  assert.deepEqual(
    commercialSignals(copyStrings(COPY, HOME, DOCS, IDENTITY)),
    [],
    "the shipped copy advertises a sale while the published identity says the " +
      "service is free. One of the two is wrong."
  );
  // It reads rendered strings, not files — otherwise this module's own regex
  // literals and every comment about pricing would trip it.
  assert.deepEqual(
    commercialSignals(copyStrings({ a: { b: ["Издател — €149 / месец"] } })),
    ["€149 / месец"],
    "copyStrings/commercialSignals stopped seeing a price nested in the copy"
  );
  for (const sale of [
    "Издател: €149 / месец",
    "$9/mo",
    "Купете достъп",
    "Buy now",
    // The currency a Bulgarian price is actually written in. Every one of
    // these walked past the guard while it matched only [€$]: the site's
    // primary language is Bulgarian and the country adopted the euro in 2026,
    // so "лв" and a spelled-out "EUR" are the native forms, not exotic ones.
    "Пълен достъп — 5 лв/месец",
    "9,99 лв./мес",
    "Premium — 5 EUR/month",
    "Full access — 5 BGN/month",
    "10 лева на месец",
    "12 EUR per year",
  ]) {
    assert.ok(
      commercialSignals(sale).length > 0,
      `"${sale}" no longer trips the guard, so the site could start selling ` +
        "while publishing a free service's identity."
    );
  }
  // And it must not fire on the copy that DENIES a sale, or it is noise nobody
  // heeds — which is how the last guard died. The лв amounts matter here too:
  // widening the currency alternation must not make the guard fire on a
  // statutory figure the payslip copy legitimately names.
  for (const prose of [
    "Вярно е безплатен и няма реклама.",
    "Няма абонамент, няма профил и няма плащане.",
    "There is no subscription and nothing to buy.",
    "Максималният осигурителен доход е 4130 лв.",
    "Минималната работна заплата е 1213 лв.",
    "Средна цена 2 501 €/кв.м",
  ]) {
    assert.deepEqual(
      commercialSignals(prose),
      [],
      `the tripwire fires on "${prose}" — a guard that fires on its own denial ` + "gets silenced."
    );
  }
});

test("both supervisory authorities are published with an address and a URL", () => {
  const ids = SUPERVISORS.map((s) => s.id);
  assert.ok(ids.includes("kzp"), "КЗП is gone — ЗЕТ чл. 4 т. 6 names the supervisory body");
  assert.ok(
    ids.includes("kzld"),
    "КЗЛД is gone — GDPR art. 13 needs the DPA a person can complain to"
  );
  for (const s of SUPERVISORS) {
    for (const lang of LANGS) {
      assert.ok(s.name[lang], `${s.id} has no ${lang} name`);
      assert.ok(s.address[lang], `${s.id} has no ${lang} address`);
    }
    assert.match(s.url, /^https:\/\//, `${s.id}'s URL is not https`);
  }
});

// ---------------------------------------------------------------------------
// The documents
// ---------------------------------------------------------------------------

test("all four documents exist, in both languages, with real sections", () => {
  assert.equal(DOCS.length, 4, "a legal document was added or removed");
  for (const id of ["terms", "privacy", "identity", "sources"]) {
    const doc = docById(id);
    assert.ok(doc, `the "${id}" document is gone`);
    assert.ok(doc.sections.length > 0, `"${id}" has no sections`);
    for (const lang of LANGS) {
      assert.ok(doc.title[lang], `"${id}" has no ${lang} title`);
      assert.ok(doc.nav[lang], `"${id}" has no ${lang} nav label`);
    }
    for (const s of doc.sections) {
      for (const lang of LANGS) {
        assert.ok(s.h[lang], `a section of "${id}" has no ${lang} heading`);
      }
      assert.ok(s.p.length > 0 || s.render, `a section of "${id}" renders nothing at all`);
    }
  }
});

test("no legal paragraph is published in one language only", () => {
  for (const [path, pair] of everyPair(DOCS)) {
    for (const lang of LANGS) {
      assert.ok(
        pair[lang].trim().length > 0,
        `${path} is empty in ${lang} — the page would render a blank clause ` +
          "for half its readers."
      );
    }
  }
});

test("a paragraph only carries markup when it says so, and only safe markup", () => {
  // Legal copy is the last place to discover an interpolation rendering as
  // literal `<b>`. A plain paragraph is rendered as text, so any tag in it is
  // a visible bug; an `html: true` one goes through `{@html}`, so anything
  // beyond a link or emphasis is a needless injection surface.
  const TAG = /<[a-zA-Z/!][^>]*>/;
  const SAFE = /^(?:[^<]|<\/?(?:a|b|code)(?:\s+(?:href|target|rel)="[^"<>]*")*\s*>)*$/;
  for (const doc of DOCS) {
    for (const section of doc.sections) {
      for (const para of section.p) {
        for (const lang of LANGS) {
          const body = para[lang];
          if (para.html) {
            assert.match(
              body,
              SAFE,
              `${doc.id}: an html:true paragraph (${lang}) uses a tag outside ` +
                "the <a>/<b>/<code> allowlist."
            );
          } else {
            assert.ok(
              !TAG.test(body),
              `${doc.id}: a plain paragraph (${lang}) contains markup and would ` +
                `render it literally. Add \`html: true\`.\n  ${body.slice(0, 90)}`
            );
          }
        }
      }
    }
  }
});

test("the privacy notice states what is stored and what the host sees", () => {
  // The claims the front-page sentence ("не събираме лични данни") rests on.
  // Checked per language for the same reason the terms are: a disclosure that
  // exists only in English is not a disclosure on a Bulgarian-first site.
  const privacy = docById("privacy");
  const text = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      privacy.sections.flatMap((s) => [s.h[lang], ...s.p.map((p) => p[lang])]).join("\n"),
    ])
  );

  for (const lang of LANGS) {
    for (const claim of ["vyarno_lang", "vyarno_theme", "localStorage"]) {
      assert.ok(
        text[lang].includes(claim),
        `the ${lang} privacy notice no longer names ${claim} — those two keys ` +
          "are the only thing the site persists, so they are the only thing " +
          "there is to disclose."
      );
    }
    assert.match(
      text[lang],
      /IP/,
      `the ${lang} privacy notice no longer mentions the host's request log. ` +
        "Omitting it turns 'we collect nothing' into an overclaim: the server " +
        "that serves the page does log the request, and saying so is the " +
        "difference between a true unusual claim and a false clean one."
    );
    assert.match(
      text[lang],
      /Content-Security-Policy/,
      `the ${lang} privacy notice no longer explains that the no-third-party ` +
        "promise is enforced by the CSP rather than merely intended. That is " +
        "the sentence which makes the rest of the page checkable."
    );
  }
});

test("no shipped document denies that the source is published", () => {
  // This existed as a real defect, not a hypothetical one. The terms of use
  // were rewritten to point bulk users at the repository when the project went
  // Apache-2.0; the identity document, two sections further down the same
  // page, went on saying «Изходният код на приложението не се публикува» —
  // "the site's source is not published". Both were live at vyarno.bg/legal/
  // and they contradicted each other about the one fact the launch consists
  // of, in a document whose subject is who is behind the site.
  //
  // Nothing caught it, because every check on the terms looked only at the
  // terms. This one reads all four documents together: a denial anywhere is a
  // failure, wherever the sentence that contradicts it happens to live.
  const denials = {
    bg: [/кодът[^.]*не се публикува/i, /изходният код[^.]*не се публикува/i],
    en: [/source (?:code )?is not (?:published|open)/i, /the code is not (?:published|open)/i],
  };
  for (const doc of DOCS) {
    for (const lang of LANGS) {
      const body = doc.sections.flatMap((s) => [s.h[lang], ...s.p.map((p) => p[lang])]).join("\n");
      for (const re of denials[lang]) {
        assert.ok(
          !re.test(body),
          `the ${lang} "${doc.id}" document says the source is not published. ` +
            `It is — Apache-2.0, github.com/${REPO_SLUG} — and the terms of ` +
            "use send bulk users there. Two shipped legal documents may not " +
            "disagree about that."
        );
      }
    }
  }
});

test("no document hard-codes the repository owner, and the second route resolves", () => {
  // The repository is moving to an organisation account that does not exist
  // yet, and two shipped documents name it: the terms send bulk users there
  // instead of scraping, and the identity document says that is where the
  // Apache-2.0 grant is exercised. Both are published under ЗЕТ чл. 4, so a
  // URL that 404s is a false statement in a legal document rather than a dead
  // link. It comes from `REPO_SLUG` now; anything written in by hand would
  // survive the rename and be wrong.
  for (const doc of DOCS) {
    for (const lang of LANGS) {
      const body = doc.sections.flatMap((s) => [s.h[lang], ...s.p.map((p) => p[lang])]).join("\n");
      for (const m of body.matchAll(/github\.com\/[\w.-]+\/[\w.-]+/g)) {
        assert.ok(
          m[0].includes(REPO_SLUG),
          `the ${lang} "${doc.id}" document hard-codes ${m[0]}. Interpolate ` +
            "REPO_SLUG from legal-nav.js instead — the owner is changing and " +
            "a stale URL here is a false statement, not a broken link."
        );
      }
    }
  }
  // And the second ЗЕТ чл. 4 т. 4 route is the tracker on the same repository.
  // C-298/07 needs e-mail plus one other rapid, direct and effective means; if
  // this row ever points somewhere else, the reasoning in legal.js stops
  // describing what is published.
  const issues = IDENTITY.find((r) => r.id === "issues");
  assert.ok(issues, "the second contact route is gone. ЗЕТ чл. 4 т. 4 wants two.");
  assert.equal(
    issues.dueWhen,
    "always",
    "the second contact route is owed by everyone, paid or not"
  );
  assert.equal(issues.value, `${REPO_URL}/issues`);
});

test("every file that names the repository names the same one", () => {
  // The rename is coming and it must be one edit, not a hunt. These files each
  // carry the repository URL for their own reason — the package manifests
  // publish it as metadata, CONTRIBUTING and the two READMEs hand it to a
  // person about to clone — and any one of them left behind after the move to
  // an organisation account sends someone to a 404.
  //
  // The legal documents are covered by the test above, which is stricter: for
  // them a stale URL is a false statement under ЗЕТ чл. 4, not an
  // inconvenience.
  const ROOT = join(HERE, "..", "..");
  const files = [
    "pipeline/pyproject.toml",
    "site/package.json",
    "CONTRIBUTING.md",
    "README.md",
    "README.bg.md",
    ".github/FUNDING.yml",
  ];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), "utf-8");
    for (const m of src.matchAll(
      /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?=[\s"'`)\]]|$)/gm
    )) {
      if (m[1] === "sponsors") continue; // handled by the owner check below
      assert.equal(
        `${m[1]}/${m[2]}`,
        REPO_SLUG,
        `${f} points at github.com/${m[1]}/${m[2]} but legal-nav.js says the ` +
          `repository is ${REPO_SLUG}. One of the two is stale, and the shipped ` +
          "terms of use send people to whichever legal-nav.js says."
      );
    }
    for (const m of src.matchAll(/github\.com\/sponsors\/([\w.-]+)/g)) {
      assert.equal(
        m[1],
        REPO_OWNER,
        `${f} points at a sponsors account for "${m[1]}" while the repository ` +
          `owner is "${REPO_OWNER}". If the sponsors account genuinely belongs ` +
          "to a different account, say so here rather than letting it drift."
      );
    }
  }
});

test("the terms prohibit — in both languages — the things the licence relies on", () => {
  // Per language, not over the whole document: a clause deleted from the
  // Bulgarian text while the English survives is a Bulgarian site with no
  // terms, and a check that searches the concatenation of both cannot see it.
  //
  // The paid-placement clause is deliberately about LENDERS, brokers and
  // insurers rather than advertising in general. What sits near the ЗКНИП
  // perimeter is a lender paying to appear beside an affordability figure; a
  // blanket "no paid placement anywhere" would be a wider promise than the
  // credit posture needs, and nothing has decided that wider question.
  // Hence the regex requires the scoped wording — a future blanket sentence
  // must not be able to satisfy this check by accident.
  const terms = docById("terms");
  const text = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      terms.sections.flatMap((s) => [s.h[lang], ...s.p.map((p) => p[lang])]).join("\n"),
    ])
  );

  // THREE CLAUSES WERE DELIBERATELY REMOVED when the project went Apache-2.0,
  // and they must not be re-added by someone restoring this list from git:
  //
  //   - the ban on decompiling and reconstructing source. The source is
  //     published. Prohibiting the reconstruction of something we hand out is
  //     incoherent, and it would read as a threat to the people we want
  //     reading the code.
  //   - the ban on carrying "the logic" into another product. Apache-2.0 §2
  //     expressly GRANTS that. The terms of use may not take back what the
  //     licence gives; a clause that tries is worse than no clause.
  //   - the blanket ban on systematic extraction. Narrowed to a server-load
  //     request, because the honest answer to "I want all the data" is now
  //     `git clone`, not a contract.
  //
  // What replaces them is checked below: the load limit, the route to the
  // repository, and the statement that the FIGURES are not ours to license —
  // which is the one clause protecting a third party rather than us.
  const required = {
    bg: {
      scraping: /обхождане с бот|скриптово изтегляне/,
      "server-load limit": /натоварваш сайта/,
      "repository route for bulk access": /хранилището/,
      "open code licence, scoped to the code": /Кодът е отворен \(Apache-2\.0\)/,
      "the figures are not ours to license": /не са наши/,
      trademark: /ползване на името/,
      "governing law": /правото на Република България|българското право/,
      "no forum clause": /не посочваме кой съд/i,
      "no-advice disclaimer": /не е финансов/,
      "not a recommendation": /не е препоръка/,
      "not a credit intermediary": /не е кредитен посредник/,
      "no paid lender placement": /платено позициониране на кредитор/,
    },
    en: {
      scraping: /crawling with a bot|scripted downloading/,
      "server-load limit": /ordinary use by a person with a browser/,
      "repository route for bulk access": /take it from the repository/,
      "open code licence, scoped to the code": /The code is open \(Apache-2\.0\)/,
      "the figures are not ours to license": /they are not ours/,
      trademark: /suggests a connection or an endorsement/,
      "governing law": /Bulgarian law/,
      "no forum clause": /do not nominate a court/i,
      "no-advice disclaimer": /not financial/,
      "not a recommendation": /no figure[^.]*is a recommendation/,
      "not a credit intermediary": /not a credit intermediary/,
      "no paid lender placement": /paid placement of a lender/,
    },
  };

  for (const lang of LANGS) {
    for (const [what, re] of Object.entries(required[lang])) {
      assert.match(
        text[lang],
        re,
        `the ${lang} terms of use no longer carry the ${what} clause. ` +
          "The robots.txt posture, NOTICE and the mortgage panel's regulated " +
          "perimeter all assume these are present."
      );
    }
  }
});

test("the sources page covers every upstream the footer credits", () => {
  // Same list, two places, and they fail differently: the footer is a licence
  // condition on a page every visitor sees, the sources page is the
  // explanation. Neither may name an upstream the other has forgotten.
  const ids = UPSTREAMS.map((u) => u.id);
  assert.deepEqual(
    [...ids].sort(),
    ["bnb", "ecb", "eurostat", "imot", "nsi"],
    "UPSTREAMS no longer lists exactly the five connectors the pipeline runs. " +
      "Adding or removing a connector moves this table in the same commit " +
      "(docs/data-sources.md)."
  );
  const footerNote = /footerNote:\s*\{([\s\S]*?)\n\s{2}\w/.exec(CONTENT)?.[1] ?? "";
  for (const [bg, en] of [
    ["Евростат", "Eurostat"],
    ["ЕЦБ", "ECB"],
    ["НСИ", "NSI"],
    ["БНБ", "BNB"],
    ["имот.bg", "imot.bg"],
  ]) {
    assert.ok(
      footerNote.includes(bg) && footerNote.includes(en),
      `the footer no longer credits ${en} — and the sources page still ` +
        "explains it, so the two have drifted."
    );
  }
  for (const u of UPSTREAMS) {
    for (const lang of LANGS) {
      assert.ok(u.provides[lang], `${u.id} does not say what it provides (${lang})`);
      assert.ok(u.requires[lang], `${u.id} does not say what its terms require (${lang})`);
    }
    assert.match(u.url, /^https:\/\//, `${u.id}'s data URL is not https`);
    assert.match(u.termsUrl, /^https:\/\//, `${u.id}'s terms URL is not https`);
  }
});

// ---------------------------------------------------------------------------
// Wiring — the footer, the page, the addresses
// ---------------------------------------------------------------------------

test("the footer links every legal document, and the page renders every one", () => {
  // ЗЕТ чл. 4 wants the identity permanently and directly accessible, which in
  // practice means: reachable from every page, not from a page you have to
  // know exists.
  assert.match(
    FOOTER,
    /\{#each LEGAL_NAV as doc/,
    "SiteFooter no longer iterates LEGAL_NAV — a document could be published " +
      "with nothing linking to it. (Asserting on the loop, not on the import: " +
      "the import line survives having the loop emptied.)"
  );
  assert.match(
    FOOTER,
    /\/legal\/#\$\{doc\.id\}/,
    "SiteFooter's links no longer point at /legal/#<id>."
  );
  assert.match(
    LEGAL_PAGE,
    /\{#each DOCS as doc/,
    "Legal.svelte no longer iterates DOCS — adding a document would not " + "render it."
  );
  for (const render of ["identity", "supervisors", "upstreams"]) {
    assert.ok(
      new RegExp(`section\\.render === ['"]${render}['"]`).test(LEGAL_PAGE),
      `Legal.svelte no longer renders the "${render}" block, so that part of ` +
        "legal.js would be silently invisible."
    );
  }
  assert.deepEqual(
    LEGAL_NAV.map((d) => d.id),
    DOCS.map((d) => d.id),
    "LEGAL_NAV and DOCS disagree about which documents exist."
  );
});

test("every published contact address is on our own domain", () => {
  for (const [role, addr] of Object.entries(CONTACT)) {
    assert.match(
      addr,
      /^[a-z]+@vyarno\.bg$/,
      `the ${role} contact address (${addr}) is not a vyarno.bg address. A ` +
        "published contact that does not resolve is worse than none: ЗЕТ чл. 4 " +
        "is satisfied on paper and the mail bounces."
    );
  }
  assert.ok(FOOTER.includes("CONTACT.general"), "the footer no longer offers a contact route");
});

test("SECURITY.md offers the same acknowledgement window as the shipped policy", () => {
  // `security.txt` publishes `Policy: https://vyarno.bg/legal/#security`, so a
  // researcher who starts from the machine-readable route lands on the privacy
  // notice's security section, and one who starts from the repository lands on
  // SECURITY.md. They were promising different things — three working days on
  // the site, seven days in the repository — which means the window we had
  // committed to depended on which door someone came through. Nothing checked
  // it, because every other test in this file reads `legal.js` and none of them
  // had reason to open a Markdown file two directories up.
  //
  // The site's copy is the one under a published commitment, so it is the
  // authority here and the repository file may not offer a slower window. This
  // asserts the pair rather than a literal: if the site ever moves to a
  // different window, this goes red until SECURITY.md moves with it.
  const section = docById("privacy").sections.find((s) => s.id === "security");
  assert.ok(section, "the privacy notice lost its #security section — security.txt links to it");

  const windows = {
    bg: /до три работни дни/,
    en: /within three working days/,
  };
  for (const lang of LANGS) {
    assert.ok(
      section.p.some((p) => windows[lang].test(p[lang])),
      `the ${lang} security section no longer states the acknowledgement window. ` +
        "It is a published commitment, not a courtesy — docs/legal.md " +
        '§"Standing commitments" is where it is kept.'
    );
  }

  const securityMd = readFileSync(join(HERE, "..", "..", "SECURITY.md"), "utf-8");
  assert.match(
    securityMd,
    /Acknowledgement within three working days/,
    "SECURITY.md states an acknowledgement window that is not the one published " +
      "at vyarno.bg/legal/#security. security.txt sends researchers to that " +
      "page and this file is what they read from the repository; two windows " +
      "means whichever they read first decides what we promised."
  );
  assert.ok(
    securityMd.includes(CONTACT.security),
    `SECURITY.md no longer names ${CONTACT.security}, which is the address ` +
      "security.txt and the privacy notice both publish."
  );
});

test("the version and effective date of the documents are stated", () => {
  assert.match(LEGAL_VERSION, /^\d+\.\d+$/, "LEGAL_VERSION is not a version");
  for (const lang of LANGS) {
    assert.ok(LEGAL_EFFECTIVE[lang], `no ${lang} effective date`);
  }
  assert.ok(
    LEGAL_PAGE.includes("LEGAL_VERSION") && LEGAL_PAGE.includes("LEGAL_EFFECTIVE"),
    "the page no longer shows which version of the terms a reader is looking " +
      "at, which is the only thing that makes 'we do not change terms " +
      "retroactively' checkable."
  );
});

test("the build stamp resolves to something and reaches the footer", () => {
  assert.equal(typeof BUILD_ID, "string");
  assert.ok(BUILD_ID.length > 0, "BUILD_ID is empty");
  assert.match(
    FOOTER,
    /class="build"[^>]*>\{BUILD_ID\}</,
    "the footer no longer renders the build stamp — a support conversation " +
      "goes back to guessing which deploy someone is on. (Asserting on the " +
      "render site: the import survives the interpolation being deleted.)"
  );
});

test("no legal copy claims the source is published", () => {
  // Same claim `test_the_app_makes_no_open_source_or_cc_by_claim` guards in
  // the calculator's copy, applied to the legal text — which is exactly where
  // a licence statement is most likely to be written from memory.
  const all = JSON.stringify(DOCS);
  for (const claim of ["CC-BY", "CC BY", "open source", "Open Source", "отворен код"]) {
    assert.ok(
      !all.includes(claim),
      `the legal copy makes an open-source claim (${claim}). See LICENSE.`
    );
  }
});

// ---------------------------------------------------------------------------
// The licence claim and the upstream attribution
//
// Migrated from the SPA contract file in pipeline/tests/ (now test_published_contracts.py, which keeps only the published-artefact half), where they
// overlapped with the checks above on the same module. The footer string
// carries two unrelated things that a careless edit merges: a LICENCE claim
// (Apache-2.0, scoped to the CODE — the figures are not ours to license) and
// UPSTREAM ATTRIBUTION (mandatory, a condition of several publishers' terms).
// ---------------------------------------------------------------------------

/** Every .svelte and .js source under src/, with markup comments blanked. */
function allSources() {
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(svelte|js)$/.test(entry.name)) parts.push(readFileSync(path, "utf8"));
    }
  };
  walk(join(HERE, "..", "src"));
  return parts.join("\n").replace(/<!--[\s\S]*?-->/g, " ");
}

const ALL_SRC = allSources();

test("the app states its licence, scoped to the code, and claims nothing about the data", () => {
  // Вярно is a public good and the code is Apache-2.0, so the copy says so: a
  // civic tool that asks to be trusted should be checkable all the way down —
  // the method, the sources, and the source.
  //
  // The second half is the one with teeth. THE FIGURES ARE NOT OURS TO LICENSE.
  // They belong to Eurostat, the ЕЦБ, БНБ, НСИ and имот.bg, and NOTICE §"What
  // it does not cover" is explicit that the Apache grant stops at our own work.
  // A footer line that let a reader think the DATA came under our open licence
  // would misrepresent someone else's rights — worse than the "All rights
  // reserved" it replaced, because it would be wrong about a third party rather
  // than merely unfriendly.
  const note = COPY.footerNote;
  assert.ok(note, "COPY.footerNote is gone from content.js");

  assert.ok(
    `${note.bg} ${note.en}`.includes("Apache-2.0"),
    "the footer no longer names the licence. The code is Apache-2.0 and the " +
      "footer is where a visitor is told — see LICENSE and NOTICE."
  );
  assert.ok(
    note.bg.includes("кодът"),
    "the Bulgarian footer line no longer scopes the licence to «кодът». An " +
      "unscoped claim reads as covering the figures too, and those belong to " +
      "Eurostat / ЕЦБ / БНБ / НСИ / имот.bg — see NOTICE."
  );
  assert.ok(
    /\bcode\b/.test(note.en),
    "the English footer line no longer scopes the licence to the code. See " +
      "NOTICE §'What it does not cover'."
  );

  for (const claim of ["Всички права запазени", "All rights reserved"]) {
    assert.ok(
      !ALL_SRC.includes(claim),
      `a source file claims reserved rights ("${claim}") on a live line. ` +
        "The project is Apache-2.0 — see LICENSE. If the licence genuinely " +
        "changed, change LICENSE first and this test second."
    );
  }
  // The inverse misrepresentation: claiming the upstream figures are ours to
  // give away.
  for (const overclaim of ["отворени данни", "open data", "данните са свободни"]) {
    assert.ok(
      !ALL_SRC.toLowerCase().includes(overclaim.toLowerCase()),
      `a source file claims the DATA is open ("${overclaim}"). It is not ours ` +
        "to license: the figures belong to Eurostat, the ЕЦБ, БНБ, НСИ and " +
        "имот.bg under each publisher's own terms. Describe the code as open, " +
        "never the figures — NOTICE §2."
    );
  }

  // The three assertions above are PRESENCE checks — "кодът" appears, "code"
  // appears, these three phrasings do not. Presence is not scope, and the gap
  // between them is not theoretical: a footer reading «данните и кодът са
  // отворени (Apache-2.0)» / "open source data and code (Apache-2.0)" satisfies
  // every one of them and is exactly the misrepresentation this test's own
  // comment calls worse than the notice it replaced. Both variants shipped
  // green until this block was added.
  //
  // So the licence CLAUSE is isolated and checked on its own. The footer is
  // "·"-separated and the clause is the segment naming the licence; a data noun
  // inside that segment widens the grant over figures that were never ours.
  // Blocklisting phrasings cannot work — there are unboundedly many — but the
  // clause is one short segment and its subject is either the code or it is
  // wrong.
  const DATA_NOUNS = [
    /данни/i, // данни, данните, данньта…
    /числа/i, // числата
    /\bdata\b/i,
    /\bfigures\b/i,
    /\bnumbers\b/i,
  ];
  for (const [lang, line] of [
    ["bg", note.bg],
    ["en", note.en],
  ]) {
    const clause = line.split("·").find((seg) => seg.includes("Apache-2.0"));
    assert.ok(
      clause,
      `the ${lang} footer no longer has a "·"-separated segment naming ` +
        "Apache-2.0, so the licence claim cannot be scope-checked. Keep the " +
        "licence in its own segment."
    );
    const offender = DATA_NOUNS.find((re) => re.test(clause));
    assert.ok(
      !offender,
      `the ${lang} footer's licence clause (${JSON.stringify(clause.trim())}) ` +
        `names data (${offender}). Apache-2.0 covers OUR work; the figures ` +
        "belong to Eurostat, the ЕЦБ, БНБ, НСИ and имот.bg under each " +
        "publisher's own terms and are not ours to license. The clause may " +
        "name the code and nothing else — NOTICE §2, docs/legal.md."
    );
  }
});

test("no entry's structured data licenses a page of somebody else's figures", () => {
  // The scope check above, in the form a machine reads. `license` on a
  // schema.org node states the terms of THAT node's content — so it belongs on
  // the WebApplication, which is the code Apache-2.0 covers, and nowhere else.
  // On a WebPage whose content is Eurostat's, the ЕЦБ's, БНБ's, НСИ's and
  // имот.bg's figures it says those figures are ours to give away, which is the
  // claim AGENTS.md forbids by name and NOTICE §2 spells out.
  //
  // Worse than the prose version rather than a tidier restatement of it: an
  // agent citing this site parses the JSON-LD and never reads the footer, and
  // /how/ is the entry written for that reader. A person would at least see
  // «Данни от Евростат / ЕЦБ / НСИ / БНБ / имот.bg» under the table.
  //
  // Nested nodes are walked, because moving the property one level down is both
  // the fix and the way to reintroduce the bug while looking like the fix.
  const CODE_TYPES = ["WebApplication", "SoftwareApplication", "SoftwareSourceCode"];
  const entries = ["index.html", join("how", "index.html"), join("legal", "index.html")];

  const offences = [];
  const walk = (node, entry, type = "(root)") => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, entry, type));
    if (node === null || typeof node !== "object") return;
    const here = typeof node["@type"] === "string" ? node["@type"] : type;
    if ("license" in node && !CODE_TYPES.includes(here)) {
      offences.push(`${entry}: "license" on a ${here} node`);
    }
    for (const [k, v] of Object.entries(node)) if (k !== "@type") walk(v, entry, here);
  };

  let blocks = 0;
  for (const entry of entries) {
    let html;
    try {
      html = read("", entry);
    } catch {
      continue; // an entry that does not exist is another test's business
    }
    for (const [, body] of html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    )) {
      blocks += 1;
      walk(JSON.parse(body), entry);
    }
  }

  assert.ok(blocks >= 2, `only ${blocks} JSON-LD blocks found — the entries lost their nodes`);
  assert.deepEqual(
    offences,
    [],
    `${offences.join("; ")}. Apache-2.0 covers OUR work. Put the licence on the ` +
      "WebApplication that describes the code, and leave the page's terms to " +
      "/legal/#sources, where each publisher's own wording is."
  );
});

test("the footer credits every upstream the pipeline pulls from", () => {
  // Both halves are load-bearing and they fail differently:
  //
  // - LICENCE. The ECB's terms permit reproduction only where "the ECB must be
  //   cited as the source"; Eurostat, БНБ and НСИ each require acknowledgement
  //   too. Dropping a name is a licence breach, not a copy tweak (docs/legal.md).
  // - CREDIBILITY. docs/principles.md P3/P9 — every number is sourced. The code being
  //   readable proves the arithmetic; only the source captions prove the inputs.
  //
  // The mortgage headline on the front page is ЕЦБ MIR and the €/m² is имот.bg,
  // so a shortened list is a live licence gap rather than a cosmetic one. If a
  // connector is added or removed this list moves with it, in the same commit.
  const note = COPY.footerNote;
  const required = {
    Eurostat: ["Евростат", "Eurostat"],
    ECB: ["ЕЦБ", "ECB"],
    NSI: ["НСИ", "NSI"],
    BNB: ["БНБ", "BNB"],
    "imot.bg": ["имот.bg", "imot.bg"],
  };
  for (const [source, [bg, en]] of Object.entries(required)) {
    assert.ok(
      note.bg.includes(bg),
      `the footer no longer credits ${source} in Bulgarian ("${bg}"). That list ` +
        "is upstream attribution, not decoration — several publishers require " +
        "it as a licence condition."
    );
    assert.ok(note.en.includes(en), `the footer no longer credits ${source} in English ("${en}").`);
  }
});

test("the recomputed-figures disclaimer accounts for имот.bg", () => {
  // имот.bg imposes no condition either way (docs/legal.md §имот.bg), so this
  // half of the section is owed to the reader and to nobody else — which makes
  // it the half a tidying pass can drop without anything upstream objecting.
  // The housing card prints one €/m² for Sofia beneath a link to a page that
  // publishes 143 district figures and no city total, so a reader who follows
  // the link finds nothing matching the number they arrived from. This section
  // is where they are told that the median across those districts, and the
  // change since 2015 built on it, are ours.
  const section = docById("sources").sections.find((s) => /преизчислените числа/.test(s.h.bg));
  assert.ok(section, "the sources document lost its recomputed-figures section");

  // Each pattern has to pin a claim rather than a keyword, because every
  // keyword here occurs twice in the paragraph. /медиана/ alone matches the
  // clause about the 2015 comparison, so it survives the €/m² losing the word
  // that says which statistic it is; /наши/ alone matches "тези наши
  // преработки" four sentences up, which discloses a different figure for a
  // different publisher. `\w` is ASCII-only in JS, so a Cyrillic suffix
  // needs `\S*`.
  const claims = {
    bg: [
      /имот\.bg/,
      /медиана\S*\s+на[^.]*квартални цени/,
      /промяната спрямо 2015/,
      /числа са наши/,
    ],
    en: [/имот\.bg/, /median across[^.]*district/, /change since 2015/, /figures are ours/],
  };
  for (const lang of LANGS) {
    const body = section.p.map((p) => p[lang]).join("\n");
    for (const re of claims[lang]) {
      assert.match(
        body,
        re,
        `the ${lang} recomputed-figures disclaimer no longer matches ${re}. ` +
          "The Sofia €/m² is a median across имот.bg's per-district rows and " +
          "the since-2015 change is computed from it; naming the four sources " +
          "shown verbatim and omitting the fifth reads as if it were one of them."
      );
    }
  }
});

test("every page mounts the shared footer and none declares its own", () => {
  // The footer carries the upstream attribution (a licence condition) and the
  // legal links (ЗЕТ чл. 4 wants the provider's identity reachable from every
  // page). A page that grew its own <footer> is the same list maintained twice,
  // and the copy drifts.
  //
  // The list is every component that is a build entry's root. A page added to
  // `vite.config.js` and not to this list is a page shipping without the
  // attribution and without the ЗЕТ чл. 4 links, with every suite green — so a
  // new entry belongs here in the commit that adds it.
  for (const page of [
    "App.svelte",
    "How.svelte",
    "Legal.svelte",
    "Support.svelte",
    "NotFound.svelte",
  ]) {
    const src = read("src", page).replace(/<!--[\s\S]*?-->/g, " ");
    assert.ok(
      src.includes("<SiteFooter"),
      `${page} does not mount SiteFooter — it either has no footer at all, ` +
        "losing the upstream attribution and the legal links, or it grew its own"
    );
    assert.ok(
      !/<footer\b/.test(src),
      `${page} declares its own <footer>. There is one footer component ` +
        "(lib/SiteFooter.svelte); a second one drifts."
    );
  }
});
