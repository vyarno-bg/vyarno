# Legal — licensing, the upstream terms, and the published identity

Nothing here is legal advice. What it is: the licence position for every file
this repository ships, with each publisher's own words quoted verbatim, in the
original language, and dated to the day they were read.

**Every position on this page is settled**, and each says what it rests on.
Where one rested on an argument rather than on a permission, the arrangement was
changed until it did not — see §НСИ, which is why `region_salary.json` carries
their published quarters and `salary_dist.json` carries Eurostat's ladder at
Eurostat's own level. Read this page before changing anything about licensing,
and re-read the upstream terms on the cadence at the bottom.

The user-facing form of the shipped documents is
[vyarno.bg/legal/](https://vyarno.bg/legal/), generated from
`site/src/lib/legal.js`.

## Our own licence

**Apache-2.0.** Вярно is a public good: the code is open, every feature is free
to everyone, and there is no paid version, no donor tier and nothing held back.
`LICENSE` carries the licence text and `NOTICE` states its boundary;
`site/package.json` declares `"license": "Apache-2.0"` and
`pipeline/pyproject.toml` declares `license = "Apache-2.0"`. Keep all four in
agreement — a manifest that disagrees with `LICENSE` is what licence scanners
and downstream packagers actually read.

Why Apache-2.0 rather than MIT: §6 withholds trademark rights expressly, and
the combination we want is *fork the code freely, do not call your fork Вярно*.
Apache states that in the licence itself instead of in a side letter nobody
reads. The patent grant is a secondary benefit.

**On the trademark, `NOTICE` used to overstate the position and no longer
does.** Nothing is registered — not at the Патентно ведомство, not at EUIPO,
nowhere — so "are marks of the copyright holder" was a claim of right that does
not exist. Two things follow. An unregistered sign in Bulgaria is protected
mainly through ЗЗК's unfair-competition rules and needs proof of use and of
confusion. And «вярно» is an ordinary Bulgarian adjective meaning "true", used
as the name of a service whose entire claim is accuracy — which is the textbook
descriptive sign, and descriptiveness is an absolute ground of refusal without
acquired distinctiveness. **Filing is a real option with a real chance of
refusal, not a formality that has been deferred**.

**The figures in `data/published/` are outside the Apache grant, and this is the
paragraph to re-read before changing anything about licensing.** They belong to
Eurostat, the ЕЦБ, БНБ, НСИ and имот.bg, are redistributed under each
publisher's own terms, and every payload carries a `source_url` (checked payload by payload,
2026-07-30). We never held the right to license those figures out, so the
Apache grant does not reach them and must never be described as though it does.

This carve-out matters *because* the source is public. An open Apache-2.0
repository invites exactly the assumption that everything inside it may be
redistributed freely, and two of the five publishers make that assumption
false, and the five publishers' terms differ from one another and from ours.

Enforced in code:
`the_app_states_its_licence_scoped_to_the_code_and_claims_nothing_about_the_data` requires the
footer to name the licence, requires the claim to be scoped to the code in both
languages, and fails on any copy that calls the *data* open.
`no_shipped_document_denies_that_the_source_is_published` was added by the
review, after it found the shipped identity page saying «Изходният код на
приложението не се публикува» while the terms of use pointed bulk users at the
repository. Nothing had been checking that the four documents agree with each
other.

## Bundled fonts

Two font families are vendored into `site/public/fonts/`, and each ships the SIL
Open Font Licence 1.1 text beside it. Condition 2 requires that: "each copy
contains the above copyright notice **and this license**". Naming a licence in
`NOTICE` and linking the upstream is not including it.

**Every file is its publisher's own build, byte for byte**, and that is what
keeps the names usable. The eight Cyrillic files are IBM's own split woff2 —
verified identical to `@ibm/plex-sans@1.1.0` and `@ibm/plex-mono@1.0.0` — and
the Source Serif files are Adobe's own WOFF2 release. Both families carry a
Reserved Font Name, «Plex» and «Source», and OFL 1.1 condition 3 forbids a
*Modified* Version from using one. Nothing here is modified, so nothing is
engaged.

**The rule that leaves behind: do not re-subset these files.** SIL's OFL FAQ
2.6 counts subsetting a webfont as modification, so a pass through `pyftsubset`
to save two kilobytes would, at that moment, make every `font-family` line in
`tokens.css` a breach. If a smaller file is ever genuinely needed, change to a
family with no Reserved Font Name.

The review initially got this wrong in the other direction — it read the
276-glyph count as evidence of a subset made here, and briefly renamed the
fonts on that basis. The check that disproves it is a `cmp` against the npm
package. The retraction is recorded here
rather than quietly reverted, because a correction that hides itself is worth
less than the claim it replaces.

## Upstream licensing

A source is `VERIFIED` here only if we read the publisher's own terms. Quotes
are verbatim, in the original language, with the date read. **Do not assert a
licence you have not read.**

| Source | Commercial reuse | Attribution | Derivatives | Terms re-read |
|---|---|---|---|---|
| **Eurostat** | Yes, express | Required | Allowed; must be stated to the end user **and carry a non-responsibility disclaimer** | 2026-07-30 |
| **ЕЦБ** | Yes, with a disclosure | Required | Allowed, must be stated | 2026-07-30 |
| **БНБ** | Yes, not excluded | Required | Must not alter or distort | 2026-07-30 |
| **НСИ** | Yes, express | Required | **Distribution of производни и сборни произведения expressly forbidden** | 2026-07-30 |
| **имот.bg** | No term either way | No term | No term | **2026-07-26 — NOT re-read, see below** |

**One house rule satisfies three of the five: state the transformation, in the
payload and in [`math.md`](./math.md).** Eurostat and the ЕЦБ permit derivation
on condition that it is disclosed; БНБ's «не променяте или изопачавате» is
satisfied by the same disclosure. Eurostat asks for one thing more than the
disclosure — the non-responsibility disclaimer — and НСИ is not in this group at
all: theirs is a prohibition rather than a condition, so no disclosure satisfies
it and the answer has to be architectural. §НСИ is that answer.

**The rule binds the two HICP payloads in particular.** `hicp_headline.json`
and `hicp_categories.json` publish `index_by_year`, `latest_index` and — in the
categories file — `value`, all three carrying Eurostat's own index values, so
there is no modification to disclose on them — but there is a selection,
December out of the monthly series and 2020 onwards, and a reader deciding
whether a verify link ought to match needs to be told which. Both payloads say
it from one constant (`publish.py#INDEX_DERIVATION_NOTE`), so the statement
cannot drift from what the pipeline does. Anything that starts scaling those
values turns the selection into a modification, and the same constant is where
that gets said.

`value` is the third of those and the one that needs a test rather than a
reader's attention: it is the newest completed December, the same reading
`index_by_year` already carries under its newest year key, and nothing in the
SPA reads it. A `value` that drifts off the base therefore moves no figure on
screen and reddens no suite that exercises the page — it sits in a file served
under a Eurostat heading, disagreeing with the unit printed beside it, until
somebody reuses the payload.
`test_published_contracts.py::test_published_hicp_index_is_eurostat_s_own_values_on_the_linked_base`
holds the equality for exactly that reason.

**НСИ is different in kind:** their licence does not ask for a disclosure, it
forbids an act — «Нямате право да разпространявате производни и сборни
произведения» — so the house rule does not reach it. There is no transformation
to state because there is no transformation: every НСИ figure this project
ships is a cell they published, and §НСИ below is what keeps it that way.
имот.bg is the fifth, and carries no term either way.

### Eurostat

Read 2026-07-30 at <https://ec.europa.eu/eurostat/help/copyright-notice>:

> "Reuse of statistical data, metadata, publications, and other dissemination
> tools published on this website for commercial or non-commercial purposes is
> authorised provided the source is acknowledged."

> "When reuse involves translations of publications or modifications to the data
> or text, **this must be stated clearly to the end user of the information**.
> **A disclaimer regarding the non-responsibility of Eurostat shall be
> included.**"

**The wording moved and this document had not noticed.** It used to quote
"downloading and reproduction … for personal use or for further non-commercial
or commercial dissemination are authorised" and "shall be explicitly stated at a
suitably prominent place". Both are superseded. The substance survives, but the
new modification clause names an audience the old one did not: **the end user**,
not a prominent place.

That is worth taking seriously rather than absorbing. A `notes` field in a JSON
file is a statement to a developer reading the payload, not to a reader of
vyarno.bg. The site does surface each derivation to the reader — the method
drawer and the data panel name the transformation next to the figure — so that
half is met, and it is met by the SPA and not by the payload. **If the method
drawer is ever removed, the Eurostat condition breaks with it**, and that
dependency did not exist in writing until now.

**The second sentence is the one that is easy to skip.** "A disclaimer
regarding the non-responsibility of Eurostat **shall** be included" is a
condition, not a note about tone, and three things engage it. `salary_dist.json`
interpolates the intermediate deciles and extrapolates the P1/P99 tails out of
the three deciles SES publishes — genuinely our arithmetic, because there are
no intermediate deciles in the cube to read. `weight_pct` is Eurostat's
item weight converted out of per-thousand into percent, which is a unit rather
than a figure, but it is still not the number their cube returns. And
`house_market.json#avg_deal_eur` is value ÷ count over `prc_hpi_hsvq` and
`prc_hpi_hsnq`, which the payload itself marks `DERIVED BY US` — the test of
whether a figure engages the condition is whether we did arithmetic on their
cube, not whether the result looks like one of their numbers.
`price_index_real` does **not** engage it: `tipsho30` is Eurostat's own deflated
index, published as it stands.

The shipped sources document carries its own section, «Уговорка за
преизчислените числа» / "Disclaimer on the figures we recompute", which names
what we recompute and disclaims Eurostat's responsibility for it. It is a section rather
than a sentence so that a copy edit cannot dissolve it into a paragraph about
something else. The same section states what is *not* modified — the price
index — because that is what tells a reader whether a verify link's digits
ought to match the page.

The commercial-redissemination exclusions (non-EU/EFTA country data, Swiss and
Austrian trade detail, logos and trademarks) touch nothing we pull.

### ЕЦБ

Read 2026-07-30 at
<https://www.ecb.europa.eu/services/disclaimer/html/index.en.html>:

> "When such information is distributed or reproduced, it must appear accurately
> and the ECB must be cited as the source."

> "**When linking to this website from business sites or for promotional
> purposes**, this website must load into the browser's entire window (i.e. it
> must not appear within another website's frame)."

> "If the information is modified by the user (e.g. by seasonal adjustment of
> statistical data or calculation of growth rates) this must be stated
> explicitly."

Plus: where ЕЦБ information is incorporated into documents that are **sold**,
the publisher must inform buyers "both before they pay any subscription or fee
and each time they access the information" that it "may be obtained free of
charge through this website".

Three live consequences:

1. **The footer credits ЕЦБ**, and `the_footer_credits_every_upstream_the_pipeline_pulls_from`
   fails if it stops. The mortgage headline on the front page *is* ЕЦБ MIR.
2. **The framing clause is about linking to `ecb.europa.eu`, and this document
   used to quote it from the middle.** The full sentence opens "When linking to
   this website from business sites or for promotional purposes" — so it governs
   framing of the ЕЦБ's own pages, which we never do. The truncated quote made
   our own conclusion look like a reading rather than the plain text.
3. **A paid feed engages the "obtainable free of charge" disclosure.** Cheap to
   satisfy; it has to be deliberate.

### БНБ

Read 2026-07-30 at
<https://www.bnb.bg/AboutUs/PressOffice/PORightsUsing/index.htm>:

> «Ползвайки интернет страницата на БНБ, вие получавате разрешение да създавате
> връзки, да запаметявате файлове, **да разпространявате и възпроизвеждате
> данни** при условие, че **посочите източника** и **не променяте или изопачавате
> материала**.»

The most permissive of the five: an express grant to distribute and reproduce,
no non-commercial carve-out. Both conditions are met —
`outstanding_stock.value_pct` is the housing column of the workbook verbatim,
with `source_url` and `as_of`.

**The forward constraint this section used to hold in reserve is now live, and
two figures are inside it.** «не променяте или изопачавате» engages wherever a
published number is arithmetic over БНБ's cells rather than one of them, and
`credit.json` carries two:

- `outstanding.total_eur_m` — the four purpose blocks added up. Addition of
  amounts БНБ print in one row, and each addend ships beside the total in
  `outstanding.blocks`, so a reader can take the sum apart.
- `overdraft.stock_eur_m` and `overdraft.stock_rate_pct` — БНБ's «Овърдрафт»
  block **less** its own «в т.ч. кредитни карти» sub-block, because ЕЦБ A2Z1
  draws the boundary there and БНБ do not. A subtraction is the transformation
  most capable of distorting, so `overdraft.stock_basis` states it in the payload
  and the rate it leaves is gated against A2Z1 — БНБ's own figure, reported by
  БНБ to the ЕЦБ, agreeing to 0.021 pp.

The house rule above is what satisfies both: the transformation is stated in the
payload and in [`math.md`](./math.md). What would NOT be covered is publishing
the subtraction without saying it is one, or the total without its addends.

**The two workbooks added on 2026-08-17** — `s_ir_loan_oa_hh_bg.xlsx`'s volume
half and `s_ir_ovdr_cc_oa_hh_bg.xlsx` — are the same publisher under the same
grant re-read that day at the URL above, so this is a wider read of a licence
already verified rather than a new one. Their filenames come from БНБ's own
navigation (`sitenavigation.js`), not from guessing at names.

**This document used to say the page "is not machine-readable … so re-verifying
it needs a human, not a curl". That was wrong.** `curl` returns HTTP 200 and
21,576 bytes; stripping the tags yields 2,020 characters of body text with the
clause in full. The claim had made an easy check look impossible, which is the
expensive kind of wrong. Re-verify it with a curl.

### НСИ

Licence v2.0, «дата на публикуване: 11.08.2022 година», re-read 2026-07-30 at
the URL `legal.js` ships as `termsUrl`. §2.1.1 **in full**, because the sentence
this page used to cut is the sentence the whole arrangement is built around:

> «2.1.1. възпроизвеждате, разпространявате и използвате статистическата
> информация, която Ви е била предоставена чрез един от начините, посочени в
> Раздел 1, т. 1.1, **включително с търговска цел, без да е нужно съгласието на
> трето лице**, но при условие че **посочите името, псевдонима или друг
> идентифициращ автора знак при всяко използване. Нямате право да
> разпространявате производни и сборни произведения.**;»

**The last sentence was missing from this page, and it is the restriction.** The
quote ended at the attribution condition and did not mark the cut — the same
defect this document identifies two sections above in the ЕЦБ framing clause,
committed here against the clause the architecture exists to satisfy. §2.1.2 and
§2.1.3 repeat that sentence word for word for aggregate data and for
methodology texts, so it is not an artefact of one paragraph.

Two further clauses were not quoted either. §2.3.3: «всеки, който използва
данните … се задължава **да не нарушава първоначалното им значение**». And the
licence defines its own verbs in §1.2, which is what disposes of the argument
that used to stand here:

> «1.2.8. „Разпространение" означава всички действия, при които цялата
> информация или част от нея се предоставя, съобщава, **показва или
> представя**.»

> «1.2.9. „Използване" означава възпроизвеждане на информацията,
> **разпространението ѝ сред неограничен брой лица, публичното ѝ
> представяне** …»

**Those definitions rule out the obvious argument, so it is not the one this
page makes.** «Разпространение» carries no fixation requirement and expressly
includes «показва или представя», so "the arithmetic runs in the reader's
browser, nothing is transmitted" decides nothing; and «използване» is defined to
*contain* «разпространението ѝ сред неограничен брой лица», so «използвате» in
§2.1.1 is not a harbour standing outside the prohibition. The prohibition
qualifies the whole grant sentence, use included, wherever the computation
happens.

**What this repository does instead is have no derived figure to argue about.**
The workbook НСИ publish carries both a monthly sheet and one sheet per year of
their own quarterly averages, `2020trimes` … `2026trimes`. `region_salary.json`
carries each област's quarterly series, every row's `value_eur` is НСИ's cell at
the payload's own `ref_period`, and `view/region.js#regionQuarter` selects that
headline rather than computing one. `sector_salary.json` is the same arrangement over their sibling
by-activity table `Labour_1.1.2.1`: twenty rows, each carrying the quarters НСИ
printed and a headline that IS one of them. Every НСИ figure this project ships
— payload, offline sentinel, screen — is a cell НСИ published.

- The Sofia level the site quotes is 1915 EUR at 2026-Q1 because that is what
  НСИ print. It is also more accurate than the alternative: the mean of their
  three rounded monthly cells gives 1914.7. The level the percentile ladder is
  re-levelled onto — 1407 EUR at the same quarter — is their all-activities
  «Общо» cell from the sibling table, selected by `view/country.js#nationalQuarter` for
  the same reason and under the same rule.
- `pctSrc` therefore attributes the level to НСИ without qualification —
  «нивото е от НСИ · средна заплата {quarter}» — which is a true statement only
  while nothing in the chain averages anything. `regionQuarter reads НСИ's
  published quarter and computes nothing` and
  `test_no_figure_is_computed_only_selected` are what hold it, from the browser
  side and the pipeline side.
- No **file** this repository publishes is a composite of НСИ with anyone else.
  `no НСИ payload carries a second publisher's figures` in
  `verify_data_contracts.mjs` asserts that across every published payload, and
  separately that each headline is one of the quarters in the series beside it —
  for all 28 rows of `region_salary.json` and all twenty of `sector_salary.json`,
  the all-activities row the ladder's level comes from included.
- **The by-activity table is read in both of НСИ's own language editions**, so
  the Bulgarian section names are theirs and not our translation of their
  English. That is an accuracy choice before it is a licence one — §2.3.3 binds
  a user «да не нарушава първоначалното им значение», and rendering section J as
  «ИТ» would do exactly that, since НСИ's own name for it is «Създаване и
  разпространение на информация и творчески продукти; далекосъобщения».
- The attribution condition is met at every use: the footer on every page, the
  shipped sources document, and the payload's own `source`, `source_url` and
  `dataset`. The footer guard fails if any of that stops.

**Does the licence read above cover 28 области where it covered one?** Yes, and
the reasoning is that nothing about it is quantified. §2.1.1 grants
«възпроизвеждате, разпространявате и използвате статистическата информация,
която Ви е била предоставена» — the information provided, without a per-series,
per-row or per-volume limit anywhere in it — and the restriction that bites is
on производни и сборни произведения rather than on how much is reproduced.
Twenty-eight rows of the same table under the same grant is more of the same
permission. What has to keep holding is the restriction, and it holds by
construction: `validate_region_salary` fails the publish unless every row's
`value_eur` IS the cell at the payload's own `ref_period`, so there is no
derived figure in the file to argue about. That is a stronger position than the
single-row version had, because it is now checked over 28 rows rather than
asserted over one.

**What remains, stated rather than implied.** The composed pay ladder is still a
scalar multiplication of Eurostat's decile shape by an НСИ figure, displayed on
screen. If §2.1.1's «сборни произведения» reaches a display that puts two
publishers' figures in one chart, that display is within it. Two things answer
that and neither is a permission. The prohibition is written in copyright
vocabulary — what may not be distributed is a **произведение**, and ЗАПСП чл. 3
conditions that on being «резултат на творческа дейност» while чл. 4, т. 4 (read
2026-07-30) puts «новини, факти, сведения и данни» outside copyright altogether.
And the exposure is small in any event: НСИ is a state institute with no
commercial interest here and no damages to claim, the licence binds by use so
any claim is contractual, and the remedy would be "stop". What would change the
assessment is a paid product built on the same composition — see the ЗЗК
paragraph in §имот.bg, which is written against a service that sells nothing.

**The rule that leaves behind, stated at the grain the code actually works
at.** No FILE this repository publishes may carry a figure computed over НСИ's
cells: the pipeline selects, and every НСИ payload is a straight reproduction of
cells they printed. What the browser does with those cells once they are on the
reader's screen is the paragraph above — a comparison the reader asked for,
against a figure that is still НСИ's, computed nowhere we could distribute it
from. `view/payroll.js#regionGap` and `view/payroll.js#sectorComparison` are both that: a
percentage between the reader's own pay and a published average, existing only
in their tab.

The line matters because the two halves have different answers. A derived
figure written into `data/published/` is distributed by us, to everyone, as a
file — squarely what §2.1.1 forbids. A percentage the reader's browser works out
about their own salary is the composition question in the paragraph above, which
is answered there rather than by pretending it does not happen. **Do not
"correct" this section by moving a comparison into a payload to make the
sentence simpler.** The simpler sentence would be the one that breaches the
licence.

That is also why `salary_dist.json` carries the Eurostat ladder at Eurostat's
own level: **one publisher per published file**, so each artefact travels under
one set of terms and a fork inherits that cleanly.

**The split costs no accuracy.** Re-levelling multiplies D1, median and D9 by
the same factor, which adds `ln(f)` to every point of the log-linear model and
leaves both dispersions untouched — so `rung(f) === f × rung(1)`, exactly. The
published rungs carry four decimal places so the browser rounds once rather than
twice; at one decimal on both sides the double-round moves three of the eleven
rungs by €0.10. Every figure the reader sees is unchanged.

**What holds the property in place**, since it is invisible on screen and would
therefore go unnoticed: `test_no_nsi_figure_reaches_the_transform_at_all` fixes
the transform's signature to the Eurostat shape alone;
`no НСИ payload carries a second publisher's figures` in
`verify_data_contracts.mjs` asserts it on what actually ships, and separately
that every `region_salary.json` headline is still one of the quarters in the series
beside it; `test_relevelling_is_a_scalar_multiply` and
`test_rungs_carry_four_decimals_so_the_browser_rounds_once` hold the property
and the precision the split depends on.

### имот.bg — no contractual restriction, and a standing obligation to re-check

Terms of use («ОБЩИ УСЛОВИЯ за ползване на сайта www.imot.bg»), read
2026-07-26. Operator: **«Резон» ООД, ЕИК 121184622**, гр. София, ул. «Карнеги»
11А, ет. 4. Per §I.22 Rezon also runs bazar.bg, holmes.bg, imoti.info and
imoti.com — one counterparty, four portals.

**Re-reading these terms needs an ordinary Bulgarian connection**, and that is a
fact about имот.bg rather than an inconvenience: `www.imot.bg` answers datacenter
IPs with 403 on every path, including `/robots.txt`, so a build environment
cannot check them and neither can an archive. **They were not re-read on
2026-07-30 either.** Both curl and a real Chromium, from two different networks,
got 403 on `/`, on `/obshti-usloviya` and on `/obshti-uslovia`; the Wayback
Machine was unreachable. This section still rests on a reading taken 2026-07-26,
and that is a gap rather than a conclusion.

One of the two open questions moved on evidence short of a reading. `termsUrl`
in `legal.js` now says `/obshti-uslovia`, because that is the spelling search
engines index and `/obshti-usloviya` is indexed nowhere — a dead link in a
ЗЕТ чл. 4 document is a false statement rather than a broken link, so it takes
the spelling with evidence behind it. The other is still open: what sits beside
the site's «2002-2025 ® Copyright imot.bg» line, since a footer copyright notice
is an assertion even if it is not a licence term. Settle both on the next
reading from an ordinary connection.

**What the terms contained about reuse of site content on 2026-07-26: nothing.**
Checked across all seven sections: no copyright or IP reservation in
site content, no prohibition on reproduction, no anti-scraping or
automated-access clause, no database-rights reservation. The only
technical-abuse clause (§I.7) is scoped to agencies flooding the servers with
listings; the only blocking clause (§I.6) to «системни нарушения на **правилата
за публикуване на обяви**». These are marketplace terms governing sellers of
advertising, and §3's browsewrap is addressed to anyone who might «стане
**ползвател на услугите**» — which our pipeline never becomes: it registers
nothing, publishes nothing, pays nothing.

**§V.1/§V.2 is the real exposure and it is not legal:** Rezon may amend the
terms at any time, effective on posting. Our position rests on the current
*absence* of a clause that can appear tomorrow. **That is a monitoring
obligation — re-read these terms every refresh pass and date the reading.**

**On the sui generis database right** (Глава единадесета «а» ЗАПСП, transposing
Directive 96/9/EC): **it does not attach to what we take.** *BHB v William Hill*
(C-203/02, Grand Chamber, 9 November 2004 — verified) and the *Fixtures
Marketing* trio (C-46/02, C-338/02, C-444/02, same date — verified) hold that
the right protects investment in obtaining, verifying or presenting existing
data and expressly not in **creating** it — and Rezon's district averages are
created by Rezon from its own listings. What is taken is district-level
averages: no ad, photo, address, individual property price, agency or phone
number. That half of the analysis is about the KIND of data and does not move
with how much of it there is.

**The quantities moved by two orders of magnitude, so the paragraph that rested
on them is restated rather than carried over.** The connector reads all 27
cities имот.bg publish, each for the current year plus its archive years —
around **650 requests** per refresh at 200 ms spacing, and on the order of
**twenty thousand** district-year cells. It was 13 requests and 143 cells while
the connector read София alone.

What each supporting point is at that scale:

- **Substantiality.** Twenty thousand aggregate cells is a larger claim than 143
  was, and still small against a corpus of millions of live ads Rezon add to
  daily — but "not quantitatively substantial" is an argument about a
  proportion, and the proportion changed. It is a weaker point than it reads on
  the old figures.
- **Art. 7(5), repeated and systematic extraction of insubstantial parts.** This
  is where the change bites hardest. 13 requests on a manual cadence was
  comfortably outside it; 650 on the same cadence is a different fact pattern,
  and Art. 7(5) is aimed at exactly the shape of "each read is small, the series
  of them is not".
- ***CV-Online Latvia v Melons*** (C-762/19, Fifth Chamber, 3 June 2021 —
  verified) makes the controlling test whether re-utilisation risks the maker's
  ability to redeem its investment. Volume does not move that test: we are not a
  portal, host no listings and take no leads. It is the point the position now
  rests on most heavily. *Innoweb v Wegener*
  (C-202/12, 19 December 2013) is the case they would cite, and it is
  distinguishable on the fact that matters — Innoweb served the *listings* in
  competition with Wegener.

**Nobody qualified has re-read this section against the new scale, and it does
not assert that the conclusion survives it.** What is stated is what is checked:
the kind of data taken, the number of requests, and which of the points above
the volume weakened. §V.1/§V.2 means the terms themselves may have been replaced
since 2026-07-26 in any event, and they could not be read on 2026-07-30 or since
— `www.imot.bg` answers this repository's build and session environments with a
403 on every path. **The next reading from an ordinary Bulgarian connection
settles both, and it is owed before the next refresh rather than after it.**

**One correction to how CV-Online is used.** It is not one-way traffic. The same
judgment confirms that a specialised engine copying a substantial part of a
freely accessible database **is** extracting and re-utilising it; the
investment-risk test is what decides whether that is prohibited, not whether it
happened. Cite it for the test, not for immunity.

**What we actually do, stated for the record.** `www.imot.bg` serves datacenter
IPs a 403, so the `sredni-ceni` pages are fetched from an ordinary connection,
by hand, at 200 ms spacing, with a
`User-Agent: Mozilla/5.0 (Vyarno.bg data pipeline)` that says who is asking.
There is no access control on the page and no authentication to pass; nothing is
circumvented. A full refresh is around 650 requests over about two and a half
minutes, an arm run deliberately by a person rather than on a schedule. That is
a fact about the practice, and the analysis above rests on it remaining true.

**НК чл. 319а и сл. (computer crimes) does not reach it — and this paragraph
used to quote a repealed text.** It asserted that the provision requires
«неправомерен достъп до компютърна информация». Those words were replaced: as
amended by ДВ бр. 101/2017 and ДВ бр. 53/2022, чл. 319а, ал. 1 reads

> «Който **неправомерно** осъществи достъп до **информационна система или части
> от нея**, в немаловажни случаи се наказва с лишаване от свобода до шест
> години и с глоба до три хиляди лева.»

(read 2026-07-30). The correction matters because the two texts are not
equivalent: the current one is about a system rather than about information, and
it does not require a protective measure to have been defeated. So "there is no
access control on the page" is no longer the whole answer.

What the element still turns on is «неправомерно». There is no credential to
present, no authentication to pass and no challenge to solve; `sources/imot.py`
sends `User-Agent: Mozilla/5.0 (Vyarno.bg data pipeline)`, rotates no proxy and
forges no identity, and the page is fetched from an ordinary residential
connection because that is where the person running it sits. Reaching a public
page from a class of client the operator serves, identifying yourself while
doing it, is use as served rather than unauthorised access. The
«в немаловажни случаи» threshold is a second filter. Thirteen requests for one
page of published averages was not on the wrong side of it; around 650 across 27
pages is the same character of act — public pages, served as published, at a
rate a person browsing could produce — and a much bigger number, and this
paragraph should not pretend the old one still describes it.

**The honest framing of the residual risk:** this is a criminal provision and
the conclusion rests on a reading of one adverb. It is the paragraph in this
repository where being wrong is most expensive. Nothing about the practice
should change without re-reading it.

**Unfair competition** (ЗЗК чл. 29 и сл.) needs a competitive relationship, and
a free calculator is not a property portal. The scenario that would matter — BG
price levels entering a **paid data feed**, whose buyers would overlap with
Rezon's commercial audience — does not exist: Вярно sells nothing, there is no
billing code, and `CONTRIBUTING.md`, the PR template and `verify_support.mjs`
each make "no feature is gated" a merge condition.

**Do not upgrade that to "and never will be".** A decision recorded in a
repository is a decision that can be revisited, and telling a rights-holder
otherwise is the kind of overclaim that costs the credibility of everything
around it. What is true and checkable is enough: nothing is sold, and the
constraint is enforced in code rather than promised. **If that ever changes,
this section and §НСИ are both re-opened in the same commit** — both are written
against a service that sells nothing.

**What publishing the code changes here.** Once the source is readable,
`sources/imot.py` is a runnable fetcher and `data/published/` travels with every
fork. Neither changes what the analysis above turns on — what is taken, from
where, and how — but both raise the visibility of it, and §V.1/§V.2 means the
terms this section quotes can be replaced at any time.

### The payroll and lending-limit tables

`pipeline/.../payroll.py` and `mortgage.py` transcribe Bulgarian legislation and
БНБ supervisory measures into dated tables. **This is not a rights question.**
ЗАПСП чл. 4 excludes official texts of a legislative, administrative and
judicial nature, and their official translations, from copyright — a statute's
rates are not anyone's to license.

`payroll.json` used to carry `source_url: "https://nap.bg/"`, a bare
homepage, for a payload whose own notes describe it as a transcription of the
State Social Insurance Budget Act and the ЗДДФЛ rate. The attribution should
name the instrument, not the agency.

The same conclusion covers `sources/dv.py`, which fetches ЗБДОО's ТЗПБ appendix
from Държавен вестник rather than transcribing it. ЗАПСП чл. 4, т. 1 puts
«нормативни и индивидуални актове на държавни органи за управление» outside
copyright, so the gazette imposes no condition on reproducing an act it
promulgates — which is why the footer's «Данни от …» line, which exists because
several publishers require the credit, does not name it. The duty that remains
is provenance, and `work_accident` carries the ДВ permalink, the issue and its
date so a reader reaches the appendix itself.

#### The statute reads behind the employer rates

Each read below was made against the primary text on **2026-08-15** and is
quoted verbatim, because none of these rates is a cell anyone publishes —
`payroll.py#EMPLOYER_RATE_DERIVATION` is what turns them into the figures the
site prints, and this is what a reviewer checks that derivation against.

**КСО** (consolidated text as published by МТСП,
`mlsp.government.bg/.../kso24.pdf`):

- чл. 6, ал. 1, т. 2, б. „а“ — фонд „Пенсии“ for those born after 31 December
  1959: «12,8 на сто, а за работещите при условията на I или II категория труд
  и за лицата по чл. 69а – 15,8 на сто».
- чл. 6, ал. 1, т. 4 — «осигурителната вноска за фонд "Пенсии" се увеличава,
  както следва: а) от 1 януари 2017 г. – с 1 процентен пункт, от който 0,56 за
  сметка на осигурителя и 0,44 за сметка на осигуреното лице; б) от 1 януари
  2018 г. – с 1 процентен пункт, от който 0,56 за сметка на осигурителя и 0,44
  за сметка на осигуреното лице».
- чл. 6, ал. 3, т. 9 — «от 1 януари 2011 г. осигурителната вноска за фонд
  "Пенсии" за лицата, родени след 31 декември 1959 г., се разпределя, както
  следва: а) 5,7 на сто за сметка на осигуреното лице …; б) 7,1 на сто за
  сметка на осигурителя …». So the employer's line is 7,1 + 0,56 + 0,56 = 8,22
  and the employee's 5,7 + 0,44 + 0,44 = 6,58.
- чл. 6, ал. 1, т. 5 — «3,5 на сто за фонд "Общо заболяване и майчинство"»;
  т. 6 — «едно на сто за фонд "Безработица"»; ал. 3, т. 7 — «от 1 януари 2009
  г. осигурителната вноска за фондовете "Общо заболяване и майчинство" и
  "Безработица" се разпределя в съотношение 60:40».
- чл. 6, ал. 1, т. 7 — «от 0,4 до 1,1 на сто за фонд "Трудова злополука и
  професионална болест", определени със Закона за бюджета на държавното
  обществено осигуряване за съответната година по групи основни икономически
  дейности»; ал. 6 — «Осигурителните вноски за фонд "Трудова злополука и
  професионална болест" … са за сметка на осигурителите».
- чл. 157, ал. 1, т. 1, б. „в“ — универсален пенсионен фонд «от 2007 г. – 5 на
  сто»; ал. 3 — «за сметка на осигуреното лице – 2,2 на сто … за сметка на
  осигурителя – 2,8 на сто»; ал. 6 — ДЗПО contributions are due «върху
  доходите, за които се дължат осигурителни вноски за държавното обществено
  осигуряване».

**ЗБДОО 2026** (ДВ бр. 68 от 28.07.2026,
`dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=244982`):

- чл. 9 — the maximum insurable income, «от 1 януари до 31 юли … 2 111,64
  евро» and «от 1 август до 31 декември … 2 300 евро».
- чл. 14 — «Определя се следният размер на осигурителната вноска за Фонд
  „Трудова злополука и професионална болест“ по групи основни икономически
  дейности за 2026 г.: 1. от 1 януари до 31 юли – съгласно приложение № 2;
  2. от 1 август до 31 декември – съгласно приложение № 2А».

**ЗБНЗОК 2026** (same issue, `…?idMat=244981`), чл. 2 — «Размерът на
задължителната здравноосигурителна вноска за 2026 г. е 8 на сто». **ЗЗО** чл.
40, ал. 1, т. 1 puts the contribution on «доходът, върху който се дължат вноски
за държавното обществено осигуряване» and splits it 60:40.

**Why the ceiling bounds the employer too**, which the shape of the curve above
€2300 depends on: КСО чл. 6, ал. 3's opening sentence puts contributions «върху
не повече от максималния месечен размер на осигурителния доход» and only THEN
says they «се разпределят между осигурителите и осигурените». There is one
capped base and the split is applied to it. чл. 157, ал. 6 puts ДЗПО on that
same base, and ЗЗО чл. 40, ал. 1, т. 1 does the same for health — so all six
employer lines stop at the ceiling, exactly as the employee's do.

## The published identity (ЗЕТ чл. 4)

`site/src/lib/legal.js` declares `LEGAL_FORM` — today `natural_person`,
`takesPayment: false`, `vatRegistered: false` — and gives every ЗЕТ чл. 4 row a
`dueWhen` of `"always"`, `"paid"` or `"vat"`.

**One of those classifications was wrong, and it was the expensive kind.** чл. 4,
ал. 1 opens «Доставчикът на услуги на информационното общество е длъжен да
предоставя безпрепятствен, пряк и постоянен достъп … до следната информация»
and then lists nine points. Four carry their condition in their own words —
т. 5 «данни за вписване», т. 6 «когато тази дейност подлежи на …», т. 7 «когато
осъществява регулирана професия», т. 8 «ако е регистриран по ЗДДС» — and т. 3
is expressly «ако е различен» from т. 2. **т. 2 — «постоянния си адрес или
седалището и адреса си на управление» — carries none.** It was published here as
`dueWhen: "paid"` with a note reading «дължи се от възмездна услуга», which is a
statement about the law that the law does not make; the возмездност test belongs
to чл. 1, ал. 3 and qualifies the service, not the row. The moment this document
took the position below — that Вярно **is** an information-society service — the
address fell due and nothing was publishing it.

**It is published now, as a route rather than an address.** The provider is a
natural person, so т. 2 means a home address; the row reads «предоставя се
писмено при поискване на contact@vyarno.bg, до три работни дни». That is also
the second limb of C-298/07, which this document had quoted only for its first:
the Court required a provider whose routes are all electronic to give «another,
non-electronic means of communication» to a recipient who asks. One row answers
both, and `the unconditional чл. 4 rows are published now, address included` in
`verify_legal.mjs` fails if it goes back to being conditional.

`npm run build:release` (`scripts/check-identity.mjs`) fails if a row the
current form owes has no value, **or** if the shipped copy advertises a price
while the identity still says the service is free.

**Do not silence a future failure by inventing a registration number, and do not
"fix" it by flipping `takesPayment` to match the copy.** Flipping it is correct
only once payment is genuinely being taken.

The reasoning, recorded in `legal.js` where it binds:

- **чл. 4 т. 4 wanted two routes and the page published one.** In full: «данни
  за кореспонденция, включително телефон и адрес на електронна поща, **за
  осъществяване на пряка и навременна връзка с него**» — and this document used
  to cut the closing qualifier, which is the test. C-298/07 (*deutsche internet
  versicherung*, Fourth Chamber, 16.10.2008 — verified, ruling read
  2026-07-30) was cited as authority that an answered e-mail address suffices;
  read, it holds that a provider must supply "**in addition to its electronic
  mail address**, other information which allows the service provider to be
  contacted rapidly and communicated with in a direct and effective manner", and
  only that this need not be a telephone number. **The second route is the
  public issue tracker**, published as an `issues` row with a three-working-day
  answering commitment. It is a promise about behaviour: if the tracker stops
  being read the row becomes false.
- **That route is weaker than this page used to imply, and the weakness is
  named rather than absorbed.** The Bulgarian transposition puts «телефон»
  inside its own «включително», where Directive 2000/31 art. 5(1)(c) names only
  the e-mail address — so a Bulgarian regulator reading the Bulgarian text sees
  a telephone in the list, and C-298/07 is a directive-conforming reading of a
  national provision that reads otherwise. And three working days is slower than
  the 30-60 minutes the Court was looking at, on a tracker that is
  third-party-hosted and needs an account. What carries the obligation is the
  three routes together, the third being the postal address on request above.
- **чл. 3, ал. 1 does not say what this file said it said.** It is an
  unconditional definition of «доставчик» with no возмездность trigger in it.
- **The ЗЕТ citation pointed at a stale consolidation.** `zet_bg.pdf` stops at
  ДВ бр. 96/2020; the current text runs to ДВ бр. 53/8.07.2022. чл. 1 ал. 3,
  чл. 4 and чл. 4а are identical in both, so no conclusion moved.

**On whether ЗЕТ applies at all.** This file used to argue that donations keep
the service безвъзмездна, so чл. 1, ал. 3's «обикновено са възмездни» puts
Вярно outside ЗЕТ entirely. That leans on a proposition the CJEU has never
accepted: "normally provided for remuneration" has never required the
*recipient* to be the payer. **The position now taken is that Вярно is an
information-society service and owes чл. 4's unconditional points and not the
conditional ones — which is what it publishes anyway.** The answer is the same
either way, which is the only kind of position worth publishing.

## Data protection

Verified against the code on 2026-07-30 and corrected where it did not hold.

- **Nothing a reader types leaves the browser.** The only outbound call in
  `site/src/` is `data.js:22`. No beacon, no XHR, no WebSocket, no image ping,
  no dynamic import. `connect-src 'self'` in `_headers` is what makes that
  checkable rather than promised.
- **No `localStorage` key is written before the visitor has chosen something.**
  A Svelte `writable` calls a new subscriber synchronously with the current
  value, so a subscriber that persists on every value writes on first paint —
  with defaults, for a visitor who has touched nothing — which would make the
  privacy notice's «избраният език» untrue of a first visit and leave the
  storage itself on the weakest available footing: **ЗЕТ чл. 4а, ал. 4, т. 2**
  (the ePrivacy storage rule, and it is in ЗЕТ, not ЗЕС) exempts only storage
  necessary for a service «изрично поискана» by the recipient, and a default
  nobody asked for is not that. `verify_stores.mjs` holds it, and
  `verify_legal.mjs` holds the other half — every key `stores.js` exports has to
  be named in the notice, in both languages, on the commit that adds it.
- **`vyarno_inputs` is the reader's own figures, and it is off until they
  switch it on.** The other three keys are preferences and carry nothing
  personal; this one holds the pay, the rent, the savings and the basket they
  typed. Nothing about the чл. 4а analysis is strained by it — a switch labelled
  «Помни числата ми на това устройство» is the clearest «изрично поискана» this
  codebase has — and no personal data reaches a controller, because the record
  is written in the reader's own browser and never sent: **GDPR art. 4(2) is not
  engaged by us at all**, which is why this bullet is about чл. 4а and not about
  a lawful basis. What the opt-in is really pricing is a risk the site cannot
  see: on a shared device the next person to open the browser reads the figures.
  So the switch starts off (P7), the label states both halves in one line, the
  «forget everything on this device» button sits beside it, and switching off
  deletes the key in the same action. Notice version 1.4 carries it in its own
  section, per the notice's own rule that anything leaving something in the
  reader's browser changes the version in the same release.
- **There is a processor and there is a contract.** The site is delivered by
  Cloudflare, Inc., so the host processes the request data on the controller's
  behalf and **GDPR art. 28(3) needs a written contract**. Cloudflare's standard
  DPA is *incorporated by reference into the Self-Serve Subscription Agreement*
  — their own words, on their GDPR page, read 2026-08-12 — so accepting the
  subscription terms is what concludes it. That is the opposite arrangement from
  a provider whose DPA is a separate tick-box, and the difference is worth
  writing down rather than remembering: with one, the contract exists from the
  first page view; with the other, believing it does is the failure. Re-read it
  on any change of provider — §"Standing commitments" item 4.
- **There IS an art. 44 transfer, and the notice says so.** Cloudflare processes
  request metadata "in our data centers in the United States and Europe" (their
  GDPR page, read 2026-08-12), and on this plan nothing pins the processing to
  the EU — regional pinning is a paid add-on we do not buy. The transfer runs on
  the Commission's SCCs, and Cloudflare is additionally certified under the
  EU-U.S. Data Privacy Framework, under which it undertakes that a DPF transfer
  is not a Restricted Transfer. Both are the processor's, not ours; what is ours
  is stating the transfer in the notice instead of leaving a reader to infer an
  EU-only answer from an EU-only publisher list.
- **The notice states retention as a criterion, because a period is not ours to
  state.** Art. 13(2)(a) wants a period **or** the criteria for one, and the
  criteria are the honest half here: Cloudflare publishes "a limited period of
  time" and no figure in days, per-request records are not available to read or
  export on this plan, and nothing is copied out. So the notice commits to what
  can be kept true — no log of ours, no archive, no file that outlives the
  host's own period — rather than to a number nobody here can hold the host to.
  **A number in the copy that only the host can honour is a promise made with
  someone else's hands.**
- **The response headers in `site/public/_headers` are served by the live
  origin** — confirmed 2026-08-12 against vyarno.bg, every declared rule
  arriving as written. That matters because the privacy notice points at the CSP
  as the thing that makes the two-origin list checkable rather than promised,
  and a declaration a server never applies would make that sentence false.
- **The visit counter, and why it needs no consent banner.** Plausible
  (Plausible Insights OÜ, Tartu, Estonia; read 2026-08-15) sets no cookie and
  writes nothing to the terminal equipment, so ЗЕТ чл. 4а — the transposition of
  ePrivacy art. 5(3) — is not engaged by storage. It does **read** one key,
  `plausible_ignore`, which brings the "gaining access to information already
  stored" limb into view; that read is covered by the same provision's
  strictly-necessary exemption, because the only information it accesses is an
  instruction the reader themselves put there to switch the counting off, and
  honouring it is not something they can be asked to consent to. **The notice
  names the key rather than only the practice**, so the exemption rests on a
  lever a reader can actually reach.
  The lawful basis for the processing itself is legitimate interest, art. 6(1)(f):
  the daily salt is discarded every 24 hours, so no identifier survives to build
  a profile from, there is no cross-site join available to the processor, and
  the fields are the ones the host's log already held. Processing is EU-only —
  Germany, Slovenia and Finland — so unlike the Cloudflare log there is no
  art. 46 transfer to account for, which is why the notice can say so plainly.
  **A measurer that failed any of those is a different decision**, not a
  substitution: `docs/principles.md` §"What is closed" refuses the class rather
  than judging products one by one.
- **What the counter measures is set in ITS dashboard, not in this repository,
  and art. 13(1)(c) is owed on all of it.** Outbound-link clicks with the
  destination address, file downloads, form submissions, scroll depth and dwell
  time arrive switched on in the generated script; `analytics.js` passes no
  options and overrides none. v1.6 of the notice described the pageview alone
  and was therefore incomplete for four days — found by driving the built
  bundle in a browser and reading the posted bodies, which is the only way to
  see it, because no file in the tree disagrees with a notice that is short.
  **Treat a switch in that dashboard as an edit to the notice**, with the
  version bump the rule at the top of `legal.js` asks for. Nothing there may be
  switched on that carries a figure the reader typed; that is P1 and it is
  guarded on our side by `verify_analytics.mjs` refusing a custom event.
- **The origin also adds headers this repository never declared, and one of
  them reaches the reader's browser.** `NEL` and `Report-To` ask the browser to
  post a report about a failed request to the host's reporting address; the
  edge adds `Strict-Transport-Security` and a same-origin `Speculation-Rules`
  pointer. None is a third party — the reporting address is the processor
  already named above — but «браузърът ти не праща нито една заявка към трето
  лице» is a sentence a reader can check, so the notice describes the error
  report in its own paragraph rather than resting on the CSP. It could not rest
  on the CSP anyway: `connect-src` does not govern a Reporting API upload.
  `check-live-headers.mjs` fails on any FURTHER header of that kind, which is
  the guard — the next feature a CDN turns on by default will not announce
  itself.
- **Art. 30 register of processing.** The art. 30(5) exemption for
  organisations under 250 people is not available for processing that is more
  than occasional, and serving a website logs continuously. The register covers
  three operations — the request log, the visit counting above, and the donation
  records §Donations describes — and costs nothing to keep; keep it. The counter
  is a separate entry rather than a line under the log: different processor,
  different purpose, and an art. 30(1)(d) recipient the log's entry does not
  name. **The art. 2(2)(c)
  household exemption is NOT available** — a public website is by definition not
  purely personal or household activity, and C-101/01 *Lindqvist* settled that.
- **The vulnerability safe-harbour** («няма да предприемаме действия срещу теб»
  / "we will take no action against you") is a promise the controller can give
  on its own behalf, and it is worth giving. It does not bind the prosecution
  service, and it should not pretend to. `SECURITY.md` agrees with the notice on
  the channel and the three-working-day acknowledgement.

## Donations, and the tax that reaches them first

Two channels are open: Ko-fi, one-off and needing no account of the person
giving, and GitHub Sponsors, one-off or monthly. `.github/FUNDING.yml` enables
`ko_fi` and `github`, the matching `SUPPORT_PLATFORMS` entries are `live: true`,
and `pipeline/pyproject.toml` carries a live platform's URL under `Funding` —
`verify_support.mjs` reads all three and fails if they disagree, so a channel
cannot be advertised in one place while the others call it closed.

**Two open channels change what the footer does**, and that is by design rather
than a consequence: `footerDonateLink()` returns a platform only while exactly
one is open, so the footer stops choosing for the reader and routes to
`/support/`, where each platform carries the note saying what is different about
it. `verify_support.mjs` and the render suite both assert the shape that
matches the count.

**Ko-fi passes the payment straight through to a Stripe account in the
recipient's own name.** Nothing sits between the donor and the recipient: Ko-fi
holds no balance, Stripe is the acquirer, and the person receiving the gift is
the merchant of record who answers a chargeback and a refund request. That is a
setting rather than a property of the platform — Ko-fi will also hold the
balance and pay out on a schedule, and that arrangement puts a foreign
intermediary in the chain, which is the second of the two facts below. **Do not
change the payout route without re-reading this section**, because the change
that looks like a payments preference is the one that moves who receives what
from whom.

**GitHub Sponsors carries one hazard Ko-fi does not**, and it is a
rule 4 hazard rather than a payments one: GitHub lists sponsors on the
recipient's own profile unless the sponsor marks themselves private. That page
is GitHub's, that default is GitHub's and that setting is the sponsor's, so
nothing there is given by this project — but **mirroring the list onto
vyarno.bg, ordering it, or making the appearance conditional on an amount would
be a name in lights given in return for money**, which flips
`LEGAL_FORM.takesPayment`. The privacy notice states the boundary from the
donor's side, in the version that opened the channel.

A sponsors account also has to belong to `REPO_OWNER`, which `verify_legal.mjs`
enforces: a Sponsor button under any other name sends money to an account this
project does not control, and nothing about opening one would have said so.

**A donation is the second thing this project processes personal data for**, and
the privacy notice carries it from version 1.2, naming both open channels from
1.3: name or alias, e-mail address, message, amount and date, arriving from the
platform rather than from the donor's own keyboard — which is **GDPR art. 14** and not art. 13, a distinction
that decides what has to be told to whom. The art. 30 register gains its second
entry with it. Ko-fi, GitHub and Stripe are each their own controller for what
they hold; none processes on our instructions, so no art. 28 contract is owed to
any of them and §"Standing commitments" item 4 stays about the host alone.

**One question is open, and it is a tax adviser's to close**: whether the
чл. 49, ал. 3 declaration names the дарител. If it does, the municipality is a
recipient of donor data and the notice owes a sentence saying so. It does not
carry one yet — a hedged sentence in a statutory document is worse than a
missing one, and this page publishes settled positions. Ask it in the same
conversation as the обичаен подарък line below, because the two answers arrive
together: a gift that needs no declaration discloses nobody.

**A донация under ЗЗД buys nothing, and `support.js` rule 4 keeps it that way**:
no supporter tier, no badge, no early access, no ad-free mode. Anything given in
return converts the gift into възнаграждение for the service and flips
`LEGAL_FORM.takesPayment`, which pulls in the rest of чл. 4.
`verify_support.mjs` fails the build on copy that would announce such a thing.

**The tax that applies is ЗМДТ, and it reaches a gift before ЗДДФЛ does.** Money
acquired by gift is subject to данък при придобиване на имущество по дарение:

- **чл. 44, ал. 1** — property acquired by gift is taxable, and money is
  property.
- **чл. 47, ал. 1** — the municipality sets the rate within a statutory band:
  0.4–0.8% between siblings and their children, **3.3–6.6% between other
  persons**. Every stranger who donates is an other person.
- **чл. 49, ал. 3** — the recipient declares to the municipality of their
  permanent address and pays **within two months** of acquisition.
- **чл. 48, ал. 1, т. 5** exempts «обичайните подаръци», and the statute does
  not define the term.

**All four were read against the statute on 2026-07-30 and all four hold.** They
had been taken from Столична община's declaration form and from Министерство на
финансите rather than from ЗМДТ itself, which is a weaker provenance than this
page should publish. чл. 44, ал. 1 reads «Обект на облагане с данък са
имуществата, придобити по дарение …»; чл. 47, ал. 1, т. 2 «от 3,3 до 6,6 на сто
- при дарение между лица извън посочените в т. 1», the band set by the
municipality «с наредбата по чл. 1, ал. 2»; чл. 49, ал. 3 «лицата, получили
имущество, подават декларация … и заплащат данъка **в двумесечен срок** от
получаването му», to the municipality of the recipient's постоянен адрес under
ал. 1; чл. 48, ал. 1, т. 5 «обичайните подаръци», undefined.

One clause that was missing and that cuts the other way: **чл. 49, ал. 4**
provides that no declaration is filed «в случаите по … чл. 48, ал. 1, т. 5» — so
a gift small enough to be an обичаен подарък carries neither the tax nor the
two-month filing. Where that line falls is undefined, which is exactly why the
question is worth asking of a tax adviser before a channel opens rather than
after.

Two facts follow from the mechanics rather than from any judgement about them:
the clock is two months from each acquisition, and a foreign intermediary
changes who pays whom — a platform that holds the balance and pays out on a
schedule receives the funds before the recipient does.

The first is live, because Ko-fi is. **It is an obligation on the recipient that
nothing in this repository can check**: every acquisition starts its own
two-month clock under чл. 49, ал. 3, and where the обичаен подарък line of
чл. 48, ал. 1, т. 5 falls is undefined in the statute — a question for a tax
adviser, not one to settle by reading. Ko-fi's own payout record is what the
declaration is made from, and it lives on Ko-fi rather than here.

The second turns on a setting inside the live channel. Ko-fi passing the payment
straight through to Stripe in the recipient's own name keeps it hypothetical;
switching Ko-fi to hold the balance and pay out on a schedule makes it the
arrangement in force, and then the funds are acquired from a foreign
intermediary on the intermediary's calendar rather than from the donor on the
donor's. That is why the payout route is a legal decision rather than a
payments preference, and why the paragraph above says not to change it without
re-reading this section.

## The regulatory perimeter

Which regimes reach a free Bulgarian calculator with no account, no payment and
no third-party content, and why. Recorded so that "we checked" is a list rather
than a claim, and so that the ones sitting just outside are visible when
something changes.

| Regime | In scope | Why |
|---|---|---|
| **ЗЕТ чл. 4** (identification) | **Yes** | Вярно is a услуга на информационното общество; §"The published identity" is what it owes. |
| **ЗЕТ чл. 4а** (storage on the device) | **Yes, exempt** | ал. 4, т. 2 exempts storage «необходими за … предоставяне на услуга на информационното общество, **изрично поискана** от получателя». Every key is written only after the reader changes the setting, which is what makes it requested — `stores.js` swallows the first synchronous call a new subscriber gets, so a default nobody asked for never reaches disk. `verify_stores.mjs` holds it. |
| **GDPR / ЗЗЛД** | **Yes** | Request logs are personal data. §"Data protection" below. The art. 2(2)(c) household exemption is not available — C-101/01 *Lindqvist*. |
| **ЗЗП чл. 68в и сл.** (unfair commercial practices) | **No, today** | §13, т. 2 ЗЗП defines «търговец» as a person who provides services «като част от своята търговска или професионална дейност», and т. 23 defines «търговска практика» as conduct «пряко свързано с насърчаването, продажбата или доставката» of a good or service to a consumer. Nothing is sold, offered for sale or promoted for reward. **This flips the day the service earns anything from a visitor**, and the accuracy claims — «Вярно», «икономиката, честно», «не измисляме нито едно число» — become claims a trader is making. |
| **ЗКНИП** (mortgage credit) | **No** | «Кредитен посредник» requires acting «при извършване на своята търговска дейност **срещу заплащане** в парична или в друга форма» (БНБ's own statement of the definition, read 2026-07-30), and advisory services require a personal recommendation on a specific credit agreement. Вярно presents no lender, brokers nothing, recommends nothing and is paid by nobody. The mortgage panel applies published БНБ limits and a published rate to numbers the reader typed. |
| **ЗПФИ** (investment services) | **No** | No financial instrument is named, offered, compared or recommended; there is no portfolio, no advice and no execution. `docs/principles.md` P6 closes the feature that would change this. |
| **ЗИДПУ / European Accessibility Act** | **No, twice over** | The Act's «услуги за електронна търговия» are defined at §1, т. 40 as services «по индивидуално искане на потребител **с цел сключване на потребителски договор**» — no contract is concluded here — and чл. 46, ал. 3 exempts microenterprises providing services in any event (dv.parliament.bg, read 2026-07-30). Accessibility is still a product commitment; it is not a statutory one. |
| **DSA** (Reg. 2022/2065) | **No** | It binds providers of intermediary services — mere conduit, caching, hosting. Вярно stores and transmits nothing on anyone's behalf and hosts no third-party content. |
| **EU Data Act** (Reg. 2023/2854) | **No** | It reaches connected products, related services and data-processing services. Вярно is none of the three. |
| **AI Act** (Reg. 2024/1689) | **No** | Every figure is deterministic arithmetic over published data; nothing infers, and there is no AI system to classify. |
| **ЗЕС** | **No** | Not an electronic communications network or service. The storage rule people expect to find here is in ЗЕТ чл. 4а. |
| **ЗЗК чл. 29** (unfair competition) | **No** | Needs conduct «при осъществяване на стопанска дейност» damaging «интересите на конкурентите». See §имот.bg. |
| **ЗЗД чл. 45** (delict) | **Always available** | A person who relies on a wrong figure and suffers loss can plead it. Nothing disclaims it away — ЗЗП and ЗЗД limits on excluding liability are why the terms say the disclaimer does not touch rights consumer law gives. What answers it is the practice: every figure sourced, dated, and checked at publish time by the eight gates in [`validation-gates.md`](./validation-gates.md). |
| **`.bg` domain** | **Yes** | register.bg's Общи условия govern the name. They are revised, so this page links to them rather than restating clause numbers. |

## Standing commitments

Six sentences this repository publishes are true only while somebody keeps them
true. Each is published under ЗЕТ чл. 4 or the GDPR.

1. **Answer the issue tracker within three working days.** It is a published
   чл. 4 т. 4 contact route with a stated window, not a courtesy.
2. **Answer a request for the postal address within three working days**, in
   writing, with the address. It is a published чл. 4 т. 2 row, and it is the
   only non-electronic route the site offers.
3. **Re-read what the host injects into a response, on any provider change and
   on any notice edit.** A CDN turns features on by default and does not ask:
   the reporting headers the notice's «Какво вижда хостът» paragraph describes
   arrived that way. `npm run check:headers` against the live origin is the
   reading, and it fails on a directive header the notice does not account for.
   Read 2026-08-12.
4. **Hold the hosting provider's GDPR art. 28 agreement, and re-conclude it if
   the provider changes.** In force with Cloudflare, whose standard DPA is
   incorporated by reference into the Self-Serve Subscription Agreement — read
   2026-08-12. It is worth knowing why this is a standing item rather than a box
   ticked once, and the reason is that **how the contract is concluded is a fact
   about the provider, not about DPAs.** Some incorporate it into the terms the
   account already accepted; others hold it back as a separate agreement that
   ordering a machine does not conclude, and with those, believing you have it
   is the whole failure. A new provider — or a new account with the same one —
   starts that question again from nothing, while the privacy notice keeps
   telling readers the contract exists from the first page view.
5. **Re-read имот.bg's terms on every refresh pass and date the reading.** §V.1
   lets Rezon add a clause at any time, effective on posting, and that section's
   position depends on its continued absence.
6. **Publish no list of donors, and keep the donation records to the tax
   periods that need them.** The privacy notice tells a donor we build no
   profile, send no newsletter and name nobody. A thank-you page is the way that
   promise gets broken by somebody being nice, and it would break `support.js`
   rule 4 in the same movement — a name in lights is something given in return.

And on cadence: **re-read all five licences annually, or on any publisher's site
redesign, and re-date the quotes above.** Eurostat's wording changed under this
project once already, and an undated quote is exactly what that costs.

## Settled — do not re-open

- **There is no company**, registering one is not a pending task, and there will
  not be one unless and until something makes it necessary.
- **The copyright holder owns Вярно outright** — confirmed 2026-07-30: no
  employer IP clause, no co-author, no commissioned asset, no agreement with
  anyone, and the domain is in their own name. That is what made it theirs to
  license under Apache-2.0.
- **The project is a public good and is not for sale.** Every feature is free
  to everyone, there is no paid tier, no donor tier and no enterprise edition,
  and the code is Apache-2.0. Donations are gratuitous and buy nothing.
  `CONTRIBUTING.md` and the PR template both make it a merge condition.
- **The domain is registered and in use.** How `.bg` names are protected is
  governed by register.bg's Общи условия, which are revised — so this page links
  to them rather than restating clause numbers that age.
- **The repository is published without its history**, into a new organisation.
  That is what closes the three findings about what the history carries — a
  personal e-mail address, the live box's topology, and a documented commercial
  plan that contradicted the имот.bg position. It closes them more cleanly than
  a `git filter-repo` pass would have. **The corollary is a standing rule: do
  not import the old history into the public repository**, for any reason. The
  old repository still holds all of it.

## Where the repository lives, and why that is a legal fact

`site/src/lib/legal-nav.js` carries `REPO_OWNER`, `REPO_NAME`, `REPO_SLUG` and
`REPO_URL`, and the shipped documents interpolate them rather than spelling the
URL out. That is not tidiness.

The terms of use send anyone wanting bulk data to the repository **instead of**
scraping the site, and the identity document names it as where the Apache-2.0
grant is exercised. Both are published under ЗЕТ чл. 4. A URL that does not
resolve is therefore not a broken link — it is a false statement in a statutory
identification document, and it fails precisely when someone relies on it.

`verify_legal.mjs` fails on a GitHub URL written by hand into any of the four
legal documents, and on any of the six other files disagreeing with the
constant. Renaming is one edit, and the build fails until every file agrees
with it.

## Cross-references

- [`data-sources.md`](./data-sources.md) — what each upstream publishes and how it is read
- [`math.md`](./math.md) — the provenance contract every derived figure inherits
- `site/src/lib/legal.js` → [vyarno.bg/legal/](https://vyarno.bg/legal/) — the shipped documents
