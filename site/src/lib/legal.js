/**
 * Legal identity, the four legal documents, and the upstream attribution
 * table — the single source of truth for all of it, in both languages.
 *
 * WHY THIS IS A DATA MODULE AND NOT MARKUP
 *
 * Закон за електронната търговия чл. 4 requires a доставчик на услуги на
 * информационното общество to publish its identifying information — the name,
 * the address, correspondence data, and, *where the condition applies*, the
 * register entry, the supervisory body and the VAT indication — in a form that
 * is permanently and directly accessible. That is a *contract*, exactly like a
 * published payload's schema is a contract, so it is held as data that a test
 * can assert on rather than as prose buried in a template. `Legal.svelte`
 * renders it; it decides nothing.
 *
 * Two consequences worth knowing before editing:
 *
 * 1. **`dueWhen` is load-bearing, and it replaced `pending: true`.** Вярно is
 *    one person's side project, not a company, and it is free. Which rows of
 *    чл. 4 it owes depends on that — see `LEGAL_FORM` below. A row that the
 *    law does not ask of us today is not published as "предстои"; it is not
 *    published at all, and it is declared here so that
 *    `scripts/check-identity.mjs` can fail the release build on the day it
 *    becomes due. A permanent "pending" row is a promise nobody keeps; an
 *    invented ЕИК is a false registration number. Neither can happen now.
 * 2. **A paragraph is plain text unless it says `html: true`.** Only
 *    `<a>`, `<b>` and `<code>` are allowed in the ones that do, and
 *    `verify_legal.mjs` enforces that. Legal copy is the last place to
 *    discover an interpolation renders as literal markup.
 */

/**
 * Version and effective date of the published documents.
 *
 * The privacy notice describes **this version**, not all future time. That is
 * deliberate and it cuts both ways: it does not commit the site to never
 * gaining a capability, and it does not let the site gain one quietly. Anything
 * that starts running in a visitor's browser, storing something in it, or
 * reaching a third party is a new section in the notice plus a bump here, **in
 * the same release as the behaviour** — never a release later.
 *
 * Bump the minor for an added or changed practice; the date moves with it.
 *
 * **Never edit a published version in place.** The site is live, so every
 * version here has been in force for somebody, and a practice that changes
 * under a version number that does not move leaves the notice describing a
 * site nobody is being served while claiming to describe the one they are.
 * Bump, always. The shortcut is only ever available before anything has been
 * served at all, and that moment has passed.
 */
export const LEGAL_VERSION = "1.3";
export const LEGAL_EFFECTIVE = { bg: "1 август 2026 г.", en: "1 August 2026" };

import { CONTACT, LEGAL_NAV, REPO_ISSUES_URL, REPO_SLUG } from "./legal-nav.js";

// Re-exported so `/legal/`'s own imports stay in one line; the definition
// lives in `legal-nav.js` because every page needs it and no page but this
// one needs the documents below.
export { CONTACT };

/**
 * WHAT WE LEGALLY ARE, and it is the input to everything below.
 *
 * Вярно is one employed person's side project. There is no company, and there
 * will not be one unless something makes it necessary. Nobody has paid for
 * anything, the site carries no advertising, and it sells nothing — so it earns
 * nothing from any visitor.
 *
 * That is not a detail, it is the whole shape of the ЗЕТ чл. 4 obligation:
 *
 *   ЗЕТ чл. 1, ал. 3 — „Услуги на информационното общество са такива услуги
 *   […] които **обикновено са възмездни** и се предоставят от разстояние чрез
 *   използването на електронни средства след изрично изявление от страна на
 *   получателя на услугата."
 *
 * Read 2026-07-30 in the Ministry of Economy's consolidated text
 * (https://www.mi.government.bg/file/2015/09/zakon_za_elektronnata_targoviq-2024.pdf,
 * consolidated to ДВ бр. 53 от 8.07.2022 г.). **Cite that text and not
 * `zet_bg.pdf`**, which stops at ДВ бр. 96/2020 and is two amendments behind.
 * чл. 1, ал. 3, чл. 4 and чл. 4а are word-for-word identical in the two, so
 * nothing below turns on it — a citation still may not point at a stale
 * consolidation, because the next reader cannot know the identity holds
 * without checking, which is the work a citation exists to save.
 *
 * Four of чл. 4's points are conditional on their own face — т. 5 (вписване в
 * търговски или друг публичен регистър), т. 6 (контролен орган, „когато тази
 * дейност подлежи на уведомителен, регистрационен или лицензионен режим"),
 * т. 7 (регулирана професия) and т. 8 („съответно указание, **ако** е
 * регистриран по ЗДДС") — and none of those conditions is met by a natural
 * person who is in no register, needs no licence and is not VAT-registered.
 *
 * **т. 2 is NOT one of them.** чл. 4, ал. 1 opens „Доставчикът на услуги на
 * информационното общество е длъжен да предоставя… достъп до следната
 * информация" and т. 2 then reads, without a condition of any kind,
 * „постоянния си адрес или седалището и адреса си на управление". The
 * возмездност test lives in чл. 1, ал. 3 and qualifies the SERVICE, not the
 * row — reading it into т. 2 makes the address conditional on something the
 * provision does not mention. Since this module takes the position below that
 * Вярно IS an information-society service, т. 2 falls due alongside т. 1 and
 * т. 4.
 *
 * **What is published instead of the address.** The provider is a natural
 * person, so т. 2's „постоянен адрес" is a residential address, and publishing
 * it permanently on an indexed page is irreversible. The row is therefore
 * discharged by a route to it — supplied in writing, on request, within three
 * working days. That also covers the second limb of C-298/07, which requires a
 * provider whose routes are electronic to offer „another, non-electronic means
 * of communication" to a recipient who asks for one.
 *
 * Like the `issues` row, this is a promise about behaviour. An unanswered
 * request makes it false, and the fix then is to publish the address.
 *
 * **The decision, so it is not re-litigated:** we publish the name, the
 * activity, a contact route that is answered, a second written route and the
 * on-request postal address. The register row and the VAT row are declared
 * below rather than published, so the guard fires on the day the answer
 * changes.
 *
 * **чл. 3, ал. 1 is not part of that reasoning, and it is the article people
 * reach for.** It reads «Доставчик на услуги е физическо или юридическо лице,
 * което предоставя услуги на информационното общество» — an unconditional
 * definition of who a доставчик is, with no возмездность trigger anywhere in
 * it. The возмездность test is чл. 1, ал. 3's, and it qualifies the SERVICE,
 * not the person. An argument that rests чл. 3 on возмездность is reading a
 * condition into a definition.
 *
 * **т. 4 needs TWO routes.** In full: «данни за кореспонденция, включително
 * телефон и адрес на електронна поща, **за осъществяване на пряка и навременна
 * връзка с него**». The closing qualifier is the test, and it sits in the
 * Bulgarian text rather than only in the case law: direct, and timely. Quote
 * the point without it and it reads as a list of fields.
 *
 * C-298/07 (deutsche internet versicherung, Fourth Chamber, 16.10.2008) was
 * cited here as authority that an answered e-mail address is enough. Read, it
 * says the opposite: a provider must supply "**in addition to its electronic
 * mail address**, other information which allows the service provider to be
 * contacted rapidly and communicated with in a direct and effective manner",
 * and only that this "does not necessarily have to be a telephone number". The
 * German provider won because it had an enquiry template it answered within
 * 30-60 minutes — that was the second route, and it is why it won.
 *
 * The argument in the `email` row, that a number nobody answers is worse than
 * no number, is still right and was never an answer to т. 4. So the second
 * route is the public issue tracker (`issues` below), with a stated answering
 * window. If that stops being monitored the row becomes a false statement and
 * the fix is a telephone number or a postal address, not a quieter promise.
 *
 * **Two things about that which are weaker than they look, recorded so nobody
 * relies on them harder than they bear.** First, the Bulgarian transposition
 * names «телефон» inside its own «включително», where Directive 2000/31
 * art. 5(1)(c) names only the e-mail address; a Bulgarian reader of the
 * Bulgarian text sees a telephone in the list, and C-298/07 is a
 * directive-conforming reading of a national text that reads otherwise.
 * Second, three working days is slower than the 30-60 minutes the Court was
 * looking at, and the tracker is hosted by a third party and needs an account.
 * The route is real and it is answered; it is not as strong as the one that
 * won that case. What carries the weight is the combination — an answered
 * e-mail address, a public written route, and the postal address on request
 * below.
 *
 * Flipping `takesPayment` to `true` is what the first paid transaction costs
 * in this file. `scripts/check-identity.mjs` also cross-checks the flag
 * against the shipped copy, so it cannot quietly stay `false` while the site
 * advertises a price.
 *
 * **Advertising is part of this determination, not a separate question.** The
 * reasoning above rests on the service being free to the visitor and earning
 * nothing from them; carrying ads would make it revenue-earning and settle
 * чл. 1, ал. 3 against us outright, alongside the ЗЗП rules on identifying
 * commercial communication. **The project's direction closes this: Вярно carries no
 * advertising** (`docs/principles.md`). It is recorded here rather than merely
 * forbidden elsewhere, because the day someone reopens it, this comment and the
 * privacy notice change in the same release as the behaviour — not afterwards.
 *
 * **Donations, and the tempting argument this file declines to make.** The
 * tempting one: a донация under ЗЗД is gratuitous, so the service stays
 * безвъзмездна and чл. 1, ал. 3 keeps Вярно outside ЗЕТ entirely. It leans on
 * a proposition the CJEU has never accepted — "normally provided for
 * remuneration" has never required the RECIPIENT to be the payer, and a
 * service funded by someone other than its users is still remunerated. Reader
 * donations sit closer to recipient-side funding than advertising does, not
 * further from it.
 *
 * The position taken instead is that Вярно **is** an information-society
 * service, and that it owes чл. 4's unconditional points and not the
 * conditional ones — which is what it publishes anyway. That costs nothing on
 * this page and buys the thing that matters: the same answer whether the
 * service is inside ЗЕТ or outside it, so the conclusion never depends on
 * winning an argument it does not need to have. **A position that survives
 * only one reading of чл. 1, ал. 3 is not worth publishing.**
 *
 * `takesPayment` stays false because nothing is sold and a gift buys nothing.
 * Attaching a benefit to giving is what would flip it.
 */
export const LEGAL_FORM = Object.freeze({
  id: "natural_person",
  /** No company. The provider is a natural person. */
  incorporated: false,
  /**
   * Nothing on this site is sold, and no visitor pays for anything.
   *
   * **Donations do not change this, and the reason is precise.** Вярно
   * accepts donations (see `support.js`), but a донация under ЗЗД is
   * gratuitous: the donor receives nothing in return, so the service is
   * still provided безвъзмездно and чл. 4's "paid" rows stay undue.
   *
   * What WOULD flip this flag is attaching any benefit to giving — a
   * supporter tier, a donor badge, early access, an ad-free mode, anything
   * a person gets because they paid. That converts the gift into
   * възнаграждение for the service, makes the identity above incomplete,
   * and owes the postal address and register entry. `support.js` rule 4
   * forbids it and `verify_support.mjs` fails the build on the copy that
   * would announce it. If the project ever decides otherwise, this flag
   * moves in the same commit — do not leave it saying "free" while the
   * site sells something.
   */
  takesPayment: false,
  /** Not registered under ЗДДС — so чл. 4 т. 8 asks for nothing. */
  vatRegistered: false,
});

/**
 * Provider identification — ЗЕТ чл. 4.
 *
 * `dueWhen` says which legal form owes the row, and it is the only thing that
 * decides whether the row is published:
 *
 *   "always" — owed by anyone providing this service, paid or not.
 *   "paid"   — owed once the service is provided срещу възнаграждение.
 *   "vat"    — owed only while registered under ЗДДС (чл. 4, т. 8).
 *
 * A row that is not due is **not rendered**, rather than rendered as
 * „предстои" forever. `identityRows()` decides; `Legal.svelte` renders what it
 * is given and decides nothing.
 */
export const IDENTITY = [
  {
    id: "trade_name",
    label: { bg: "Име на услугата", en: "Service" },
    value: "Вярно · vyarno.bg",
    dueWhen: "always",
  },
  {
    id: "legal_name",
    label: { bg: "Доставчик на услугата", en: "Provider" },
    value: "Кирил Аламуров",
    dueWhen: "always",
    note: {
      bg: "физическо лице, което е и носител на авторските права. Вярно е личен проект, а не дружество: няма търговско дружество, няма съдружници и никой не е плащал за нищо. Ако това се промени, се променя и този раздел.",
      en: "a natural person, who is also the copyright holder. Vyarno is one person's side project and not a company: there is no company, no partners, and nobody has paid for anything. If that changes, this section changes with it.",
    },
  },
  {
    id: "email",
    label: { bg: "Електронна поща за кореспонденция", en: "Correspondence e-mail" },
    value: CONTACT.general,
    dueWhen: "always",
    note: {
      bg: "това е начинът за връзка и на него се отговаря. Няма телефон, защото няма да го вдига никой — а посочен номер, който не отговаря, е по-лош от липсващ.",
      en: "this is the contact route, and it is answered. There is no telephone number, because nobody would answer it — and a number that goes unanswered is worse than none.",
    },
  },
  {
    // The SECOND correspondence route, and it exists because чл. 4 т. 4 asks
    // for «данни за кореспонденция, включително телефон и адрес на електронна
    // поща» — plural — and C-298/07 reads the identical Directive 2000/31
    // art. 5(1)(c) as e-mail PLUS another rapid, direct and effective means.
    // One address was not enough, whatever the reasoning attached to it.
    //
    // A public issue tracker is the closest thing this architecture has to the
    // enquiry template that satisfied the Court in that case: it is direct
    // (it reaches the provider, not an intermediary), effective (it is
    // answered in writing and the answer stays public), and verifiable by
    // anyone in a way an unanswered telephone is not. It is the weakest of the
    // three candidates on *speed*, which is why the note commits to a window
    // rather than leaving it to be inferred.
    //
    // **This row is a promise about behaviour, not a link.** If the tracker
    // stops being read, the row becomes false and the honest fix is to publish
    // a telephone number or a postal address, not a quieter promise.
    id: "issues",
    // «Втори канал», not «Втори път»: «път» carries "time/occasion" as readily
    // as "route", so «Втори път за връзка» reads first as "a second time we
    // get in touch" — the wrong sentence on the row that discharges ЗЕТ
    // чл. 4 т. 4.
    label: { bg: "Втори канал за връзка", en: "Second contact route" },
    value: REPO_ISSUES_URL,
    dueWhen: "always",
    note: {
      bg: "публичен и проследим — въпросът и отговорът остават видими за всички. Отговаряме до три работни дни. Ако предпочиташ да не пишеш публично, използвай електронната поща по-горе.",
      en: "public and traceable — the question and the answer both stay visible to everyone. We answer within three working days. If you would rather not write in public, use the e-mail address above.",
    },
  },
  {
    id: "activity",
    label: { bg: "Дейност", en: "Activity" },
    value: {
      bg: "Онлайн калкулатор върху официална статистика, предоставян безплатно. Дейността се извършва в Република България и не подлежи на лицензиране или разрешителен режим.",
      en: "An online calculator over official statistics, provided free of charge. The activity is carried out in the Republic of Bulgaria and is not subject to licensing or authorisation.",
    },
    dueWhen: "always",
  },
  {
    // ЗЕТ чл. 4, ал. 1, т. 2 is unconditional; this row carried
    // `dueWhen: "paid"` and a note asserting otherwise. See the module comment.
    // The provider is a natural person, so the row is discharged by a route to
    // the address rather than by printing it, which also covers the
    // non-electronic fallback C-298/07 requires. If the request goes
    // unanswered, publish the address.
    id: "postal_address",
    label: { bg: "Адрес за кореспонденция", en: "Correspondence address" },
    value: {
      bg: "предоставя се писмено при поискване на contact@vyarno.bg, до три работни дни",
      en: "supplied in writing on request to contact@vyarno.bg, within three working days",
    },
    dueWhen: "always",
    note: {
      bg: "ЗЕТ чл. 4, ал. 1, т. 2. Доставчикът е физическо лице и постоянният адрес е домашен — затова тук стои пътят до него, а не самият адрес. Ако ти трябва адрес за писмо или за подаване на документ, пиши и ще го получиш.",
      en: "ЗЕТ art. 4(1)(2). The provider is a natural person and the permanent address is a home address — so what stands here is the route to it rather than the address itself. If you need an address to write to or to serve a document at, ask and you will be given it.",
    },
  },
  // ---- Not published today, because none of it exists. Declared so that the
  // release guard knows what becomes due the day `LEGAL_FORM` changes. ----
  {
    id: "register_entry",
    label: { bg: "Вписване в публичен регистър", en: "Public-register entry" },
    value: null,
    dueWhen: "paid",
    note: {
      bg: "ЗЕТ чл. 4, т. 5 — ЕИК по БУЛСТАТ или в Търговския регистър, ако бъде извършено вписване.",
      en: "ЗЕТ art. 4(5) — the БУЛСТАТ or Commercial Register number, once there is an entry to publish.",
    },
  },
  {
    id: "vat",
    label: { bg: "Регистрация по ЗДДС", en: "VAT registration" },
    value: null,
    dueWhen: "vat",
    note: {
      bg: "ЗЕТ чл. 4, т. 8 — дължи се само при регистрация по ЗДДС.",
      en: "ЗЕТ art. 4(8) — owed only while registered for VAT.",
    },
  },
];

/**
 * Supervisory authorities — ЗЕТ чл. 4, т. 6 and GDPR чл. 13, § 2, б. „г“.
 *
 * КЗП supervises e-commerce and consumer protection; КЗЛД is the data
 * protection authority. Neither licenses us — we publish them because a
 * person has to know where to complain, which is the point of the clause.
 */
export const SUPERVISORS = [
  {
    id: "kzp",
    name: {
      bg: "Комисия за защита на потребителите (КЗП)",
      en: "Bulgarian Commission for Consumer Protection (КЗП)",
    },
    role: {
      bg: "надзор върху електронната търговия и защитата на потребителите",
      en: "supervision of e-commerce and consumer protection",
    },
    address: {
      bg: "гр. София 1000, пл. „Славейков“ № 4А, ет. 3, 4 и 6",
      en: "4A Slaveykov Sq., floors 3, 4 and 6, Sofia 1000, Bulgaria",
    },
    url: "https://kzp.bg/",
  },
  {
    id: "kzld",
    name: {
      bg: "Комисия за защита на личните данни (КЗЛД)",
      en: "Commission for Personal Data Protection (КЗЛД)",
    },
    role: {
      bg: "надзорен орган по Общия регламент за защита на данните (ОРЗД / GDPR)",
      en: "supervisory authority under the General Data Protection Regulation (GDPR)",
    },
    address: {
      bg: "гр. София 1592, бул. „Проф. Цветан Лазаров“ № 2",
      en: "2 Prof. Tsvetan Lazarov Blvd., Sofia 1592, Bulgaria",
    },
    url: "https://www.cpdp.bg/",
  },
];

/**
 * The five upstreams, what each one provides, and what its terms require of
 * us. Sourced from `docs/legal.md` §"Upstream licensing", where each
 * publisher's own wording is quoted verbatim with the date it was read.
 *
 * This list is the public face of a licence condition, not a credits roll:
 * several of these publishers permit reuse only on the condition that they
 * are cited. Adding or removing a connector moves this table in the same
 * commit (docs/data-sources.md), and `test_the_sources_page_covers_every_upstream`
 * fails if it drifts from the footer.
 */
export const UPSTREAMS = [
  {
    id: "eurostat",
    name: { bg: "Евростат", en: "Eurostat" },
    // This lists only what a reader can find ON the site. Naming a dataset we
    // do not render — `ilc_di01` was the case — makes a licence disclosure cite
    // a source for data nobody can locate, which is the defect
    // `verify_wiring.mjs` guards from the method drawer's side.
    provides: {
      bg: "Хармонизираният индекс на потребителските цени за България (ХИПЦ) — официалната инфлация, 13-те групи на кошницата и техните тегла, индексът на цените по години и безработицата. Формата на разпределението на заплатите идва от изследването за структурата на заплатите.",
      en: "Bulgaria's Harmonised Index of Consumer Prices (HICP) — the official inflation figure, the 13 basket divisions with their weights, the price index by year and the unemployment rate. The shape of the pay distribution comes from the Structure of Earnings Survey.",
    },
    requires: {
      bg: "Позволява възпроизвеждане и разпространение, включително с търговска цел, при посочване на Евростат като източник. Когато данните са адаптирани или преизчислени, това трябва да е заявено ясно на крайния потребител и да е придружено от уговорка, че Евростат не носи отговорност — затова показваме числата им непроменени, където може, описваме преработката до самото число, където не може, а уговорката стои по-долу.",
      en: "Permits reproduction and dissemination, commercial included, provided Eurostat is acknowledged as the source. Where data are adapted or modified this must be stated clearly to the end user and accompanied by a disclaimer of Eurostat's responsibility — so we show their figures untouched where we can, describe the rework next to the figure where we cannot, and the disclaimer stands below.",
    },
    url: "https://ec.europa.eu/eurostat/data/database",
    termsUrl: "https://ec.europa.eu/eurostat/help/copyright-notice",
  },
  {
    id: "ecb",
    name: { bg: "Европейска централна банка (ЕЦБ)", en: "European Central Bank (ECB)" },
    provides: {
      bg: "Лихвата по новоотпуснатите жилищни кредити в България и годишният процент на разходите (ГПР) по същите кредити — числата зад ипотечния панел.",
      en: "The interest rate on newly granted Bulgarian home loans and the annual percentage rate of charge (APRC) on the same loans — the figures behind the mortgage panel.",
    },
    requires: {
      bg: "Информацията трябва да се възпроизвежда точно и ЕЦБ да е посочена като източник. Всяко преобразуване се обявява. Данните са свободно достъпни безплатно на страницата на ЕЦБ.",
      en: "Information must appear accurately and the ECB must be cited as the source. Any alteration is stated. The data are freely obtainable at no charge from the ECB's own website.",
    },
    url: "https://data.ecb.europa.eu/",
    termsUrl: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
  },
  {
    id: "bnb",
    name: { bg: "Българска народна банка (БНБ)", en: "Bulgarian National Bank (БНБ)" },
    provides: {
      bg: "Средната лихва по действащия жилищен кредитен портфейл — редът данни, с който проверяваме числото на ЕЦБ — и надзорните ограничения за жилищните кредити: до 85% от цената на имота, до 50% от дохода за обслужване на дълга и до 30 години срок.",
      en: "The average rate on the outstanding housing-loan book — the independent series we cross-check the ECB figure against — and the borrower-based limits on mortgages: up to 85% of the property price, up to 50% of income for debt service, and a 30-year maximum term.",
    },
    requires: {
      bg: "Изрично разрешение да се разпространяват и възпроизвеждат данни при условие, че се посочи източникът и материалът не се променя или изопачава.",
      en: "An express permission to distribute and reproduce data, provided the source is cited and the material is neither altered nor distorted.",
    },
    url: "https://www.bnb.bg/Statistics/index.htm",
    termsUrl: "https://www.bnb.bg/AboutUs/PressOffice/PORightsUsing/index.htm",
  },
  {
    id: "nsi",
    name: {
      bg: "Национален статистически институт (НСИ)",
      en: "National Statistical Institute of Bulgaria (НСИ)",
    },
    provides: {
      bg: "Средната месечна брутна работна заплата за София-град — числото, по което преизчисляваме сумите в подредбата на заплатите, за да отговарят на днешните нива.",
      en: "The average monthly gross wage for Sofia city — the figure the amounts on the pay ladder are set from, so that they match today's levels.",
    },
    requires: {
      bg: "Позволява възпроизвеждане, разпространяване и използване, включително с търговска цел, при условие че НСИ е посочен при всяко използване, и забранява разпространяването на производни и сборни произведения. Затова показваме числата на НСИ така, както са публикувани: средната заплата за тримесечие е тяхната, а не сметната от нас.",
      en: "Permits reproduction, distribution and use, commercial included, provided НСИ is named at every use, and forbids distributing derived and composite works. So we show НСИ's figures exactly as published: the quarterly average wage is theirs, not one we computed.",
    },
    url: "https://www.nsi.bg/en/statistical-data/179/569",
    termsUrl:
      "https://www.nsi.bg/pages/licenz-za-izpolzvaneto-na-statisticheskata-informaciya-proizvejdana-i-razprostranyavana-ot-nacionalniya-statisticheski-institut-485",
  },
  {
    id: "imot",
    name: { bg: "имот.bg", en: "imot.bg" },
    provides: {
      bg: "Средните обявени цени на квадратен метър по квартали в София, които самият сайт изчислява и публикува, плюс по един годишен архив назад до 2015 г. Това са цени по обяви, не по сделки — разликата е важна и е написана до числото.",
      en: "The average asking price per square metre by Sofia district, which the site itself computes and publishes, plus one archived snapshot per year back to 2015. These are asking prices, not transaction prices — a distinction that matters and is stated next to the figure.",
    },
    requires: {
      bg: "Общите условия на сайта не съдържат клауза за ползване на съдържанието. Взимаме само публикуваните средни стойности по квартали — не обяви, не снимки, не адреси, не цени на конкретни имоти — ръчно, с малък брой заявки, с ясно представящ се потребителски агент и без да заобикаляме никаква защита. Посочваме източника с връзка.",
      en: "The site's terms of use contain no clause governing reuse of content. We take only the published district averages — no listings, no photographs, no addresses, no individual property prices — manually, in a handful of requests, with a self-identifying user agent, and without circumventing any protection. We name the source and link to it.",
    },
    url: "https://www.imot.bg/sredni-ceni",
    // `/obshti-uslovia`, and the spelling is not obvious: imot.bg answers 403
    // to every datacenter IP on every path, `/robots.txt` included, so this URL
    // cannot be resolved from a build environment. What can be checked is that
    // search engines index this spelling and index nothing at
    // `/obshti-usloviya`. A dead link in a ЗЕТ чл. 4 document is a false
    // statement rather than a broken link, so it takes the spelling with
    // evidence behind it until a reading from an ordinary Bulgarian connection
    // settles it.
    termsUrl: "https://www.imot.bg/obshti-uslovia",
  },
];

/**
 * The four documents. Each section is `{ h, p }`; each paragraph is a
 * `{bg, en}` pair, plain text unless flagged `html: true` (in which case only
 * `<a>`, `<b>` and `<code>` may appear — `verify_legal.mjs` enforces it).
 *
 * `render` names a structured block that `Legal.svelte` draws instead of
 * prose: "identity" the ЗЕТ чл. 4 table, "supervisors" the authorities,
 * "upstreams" the source-by-source attribution.
 *
 * The bodies are keyed by id and joined to `LEGAL_NAV` below, so the order
 * they are published in and the labels they are linked by live in one place —
 * the module every page imports.
 */
const DOC_BODIES = [
  // -------------------------------------------------------------------------
  {
    id: "terms",
    title: { bg: "Условия за ползване", en: "Terms of use" },
    sections: [
      {
        h: { bg: "Какво е Вярно", en: "What Vyarno is" },
        p: [
          {
            bg: "Вярно е калкулатор върху официална статистика. Въвеждаш своите числа, той ги сравнява с публикувани данни на Евростат, ЕЦБ, БНБ, НСИ и обявените цени на имот.bg, и показва какво излиза. До всяко число има връзка към първоизточника, за да можеш да го провериш сам.",
            en: "Vyarno is a calculator over official statistics. You enter your own figures, it compares them with published data from Eurostat, the ECB, БНБ, НСИ and asking prices from imot.bg, and shows you the result. Every figure carries a link to its upstream source so you can check it yourself.",
          },
          {
            bg: "Вярно описва, а не съветва. Показва число и от какво е сметнато; изводът е твой.",
            en: "Vyarno describes; it does not advise. It shows a figure and what it was computed from; the conclusion is yours.",
          },
        ],
      },
      {
        h: { bg: "Това не е финансов съвет", en: "This is not financial advice" },
        p: [
          {
            bg: "Нищо на този сайт не е финансов, инвестиционен, данъчен, правен или кредитен съвет и нито едно число не е препоръка. Вярно не е кредитен посредник, не предлага кредити, не сравнява оферти на банки и не получава възнаграждение от кредитор, брокер или застраховател. Няма платено позициониране на кредитор, брокер или застраховател: никой от тях не плаща за присъствие тук и нито едно число не зависи от това кой плаща.",
            en: "Nothing on this site is financial, investment, tax, legal or credit advice, and no figure it produces is a recommendation. Vyarno is not a credit intermediary, does not offer credit, does not compare bank offers, and receives no remuneration from any lender, broker or insurer. There is no paid placement of a lender, broker or insurer: none of them pays to appear here, and no figure depends on who is paying.",
          },
          {
            bg: "Ипотечният панел прилага надзорните ограничения на БНБ и стандартна анюитетна формула върху публикувана лихва. Границата от 30% от нетния доход е наша, по-строга от разрешеното от закона — тя не е решение на кредитор и никоя банка не е обвързана с нея. Решение за кредит взимат кредиторът и ти.",
            en: "The mortgage panel applies БНБ's borrower-based limits and a standard annuity formula to a published interest rate. The 30%-of-net-income line is ours and is deliberately stricter than the law allows — it is not a lender's decision and no bank is bound by it. A credit decision is made by the lender and by you.",
          },
        ],
      },
      {
        h: { bg: "Какво може да правиш", en: "What you may do" },
        p: [
          {
            bg: "Можеш да заредиш и да ползваш сайта в браузър, колкото пъти искаш, без регистрация и безплатно — за каквото ти е нужно, лично или работно, включително с търговска цел. Няма платена версия, няма заключени функции и няма нищо, което да се отваря срещу пари: това, което виждаш, е всичко, което съществува. Можеш да цитираш отделно число в статия, презентация или разговор, ако посочиш и източника, от който то идва, и датата, за която се отнася. Това е насърчено, а не търпяно: цитирането с източник е точно ползването, за което сайтът е направен.",
            en: "You may load and use the site in a browser as often as you like, with no account and at no cost — for whatever you need it for, personal or professional, commercial use included. There is no paid version, no locked features and nothing that money would unlock: what you see is all there is. You may quote an individual figure in an article, a presentation or a conversation, provided you also name the source it comes from and the date it refers to. This is encouraged rather than tolerated: sourced quotation is exactly the use the site was built for.",
          },
        ],
      },
      {
        h: { bg: "Какво не може", en: "What you may not do" },
        p: [
          {
            bg: "Да натоварваш сайта по начин, различен от нормално ползване от човек с браузър: обхождане с бот, скриптово изтегляне в цикъл, повтарящо се теглене на файловете с данни. Вярно работи на един малък сървър и това е молба за възпитание, не защита на нещо тайно — виж следващия абзац за по-добрия начин.",
            en: "Loading the site in any way other than ordinary use by a person with a browser: crawling with a bot, scripted downloading in a loop, repeatedly pulling the data files. Vyarno runs on one small server, and this is a request for courtesy rather than protection of anything secret — the next paragraph has the better route.",
          },
          {
            bg: "Представяне на наши числа като чужди или на чужди като наши, вграждане, което премахва посочването на източника, както и ползване на името „Вярно“, домейна или знака по начин, който създава впечатление за връзка или одобрение. Може да кажеш, че работата ти стъпва на Вярно — това е вярно и е добре дошло; не може да наречеш своя версия „Вярно“.",
            en: "Presenting our figures as someone else's or someone else's as ours, embedding that removes the source attribution, and using the name “Вярно”, the domain or the mark in a way that suggests a connection or an endorsement. You may say your work is based on Вярно — that is accurate and welcome; you may not call your own version “Вярно”.",
          },
          {
            bg: `Ако ти трябва достъп до данните по машинен път, не го извличай от сайта — вземи го от хранилището. Кодът е отворен (Apache-2.0), а публикуваните файлове с данни са в git с история, схема и дата на обновяване: ${REPO_SLUG}. Така получаваш повече, отколкото би изстъргал, и никой сървър не страда.`,
            en: `If you need machine access to the data, do not scrape it from the site — take it from the repository. The code is open (Apache-2.0) and the published data files are in git with their history, schema and refresh date: ${REPO_SLUG}. You get more than scraping would give you, and no server suffers for it.`,
            html: false,
          },
          {
            bg: "Едно уточнение за самите числа: те не са наши и не можем да ти ги преотстъпим. Отвореният лиценз покрива кода, не статистиката — всяко число носи адреса на своя източник, а условията на съответния издател са това, което важи за него. Виж раздел „Източници“ по-долу.",
            en: "One thing about the figures themselves: they are not ours and we cannot license them to you. The open licence covers the code, not the statistics — every figure carries the address of its source, and that publisher's terms are what govern it. See the “Sources” section below.",
          },
        ],
      },
      {
        h: { bg: "Числата не са наши", en: "The figures are not ours" },
        p: [
          {
            bg: "Статистиката, която Вярно показва, е произведена от Евростат, ЕЦБ, БНБ, НСИ и имот.bg и остава подчинена на условията на всеки от тях. Ние не сме в позиция да ти дадем права върху нея и не претендираме, че ти предоставяме такива. Какво предоставя всеки източник и какво изисква е описано в раздел „Източници“ по-долу.",
            en: "The statistics Vyarno shows are produced by Eurostat, the ECB, БНБ, НСИ and imot.bg and remain subject to each publisher's own terms. We are not in a position to grant you rights in them and do not purport to. What each source provides and what it requires is set out in the “Sources” section below.",
          },
          {
            bg: "Схемата, полетата, подредбата, подборът на източници и проверките, през които минават данните, преди да бъдат публикувани, са наши.",
            en: "The schema, the field names, the arrangement, the selection of sources and the checks the data pass before publication are ours.",
          },
        ],
      },
      {
        h: { bg: "Точност, наличност и отговорност", en: "Accuracy, availability and liability" },
        p: [
          {
            bg: "Полагаме сериозни усилия числата да са верни: всяко публикуване минава през автоматични проверки, а всяко число носи източник и дата. Но статистиката се ревизира от органите, които я произвеждат, обявените цени не са цени по сделки, а разпределението на заплатите е моделирано върху изследване. Затова сайтът се предоставя „както е“, без гаранция за точност, пълнота или пригодност за конкретна цел, и не носим отговорност за решения, взети въз основа на показаното.",
            en: "We take real care that the figures are right: every publication passes automated checks, and every figure carries a source and a date. But statistics are revised by the bodies that produce them, asking prices are not transaction prices, and the pay distribution is modelled from a survey. The site is therefore provided “as is”, without warranty of accuracy, completeness or fitness for a particular purpose, and we are not liable for decisions taken on the basis of what it shows.",
          },
          {
            bg: "Не обещаваме непрекъснат достъп. Може да променим, спрем или премахнем част от сайта. Обновяването на данните се прави ръчно и датата на последното обновяване е винаги видима на страницата — ако е остаряла, сайтът го казва сам, вместо да го скрие.",
            en: "We do not promise uninterrupted access, and we may change, suspend or withdraw any part of the site. Data refreshes are done by hand and the date of the last refresh is always visible on the page — if it is old, the site says so itself rather than hiding it.",
          },
          {
            bg: "Тези условия не ограничават правата, които потребителското законодателство дава на потребителите и които не могат да бъдат ограничавани по договор.",
            en: "Nothing in these terms limits rights that consumer law gives to consumers and that cannot be limited by agreement.",
          },
        ],
      },
      {
        h: { bg: "Приложимо право", en: "Governing law" },
        p: [
          {
            bg: "Приложимо е правото на Република България. Не посочваме кой съд е компетентен: за потребител това се урежда от закона — Регламент (ЕС) 1215/2012 му дава правото да съди и да бъде съден по своето местоживеене — и клауза, която казва друго, е недействителна. По-честно е да не я пишем, отколкото да я напишем и после да я оттеглим в същото изречение.",
            en: "Bulgarian law applies. We do not nominate a court: for a consumer that is settled by law — Regulation (EU) 1215/2012 gives them the right to sue and be sued where they are domiciled — and a clause saying otherwise is ineffective. Not writing one is more honest than writing one and taking it back in the same sentence.",
          },
          {
            bg: "Ако имаш възражение като потребител, можеш да се обърнеш и към Комисията за защита на потребителите (данните са по-долу).",
            en: "As a consumer you may also complain to the Commission for Consumer Protection (details below).",
          },
        ],
      },
      {
        h: { bg: "Промени в тези условия", en: "Changes to these terms" },
        p: [
          {
            bg: "Ако променим условията, качваме новата версия тук с нов номер и нова дата на влизане в сила. Не сменяме условия със задна дата.",
            en: "If we change these terms we publish the new version here with a new number and a new effective date. We do not change terms retroactively.",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "privacy",
    title: { bg: "Поверителност", en: "Privacy" },
    sections: [
      {
        h: {
          bg: "Краткият отговор: числата ти остават при теб",
          en: "The short answer: your figures stay with you",
        },
        p: [
          {
            bg: "Заплатата, наемът, спестяванията и кошницата, които въвеждаш, се смятат изцяло в твоя браузър и никога не се изпращат никъде. Не съществува сървър, който да ги получи. Не искаме име, не искаме електронна поща, няма регистрация и няма профил. Единственото, което те извежда извън сайта, е връзката за дарение — какво става, ако я използваш, е описано по-долу.",
            en: "The salary, rent, savings and basket you enter are computed entirely in your browser and are never sent anywhere. There is no server to receive them. We ask for no name, no e-mail address, there is no registration and there is no account. The only thing that takes you off the site is the donation link — what happens if you use it is set out below.",
          },
          {
            bg: "Останалото описва сайта такъв, какъвто е в тази версия на документа. Днес на страницата не работят инструменти за анализ на посещаемостта, следящи скриптове, пиксели, реклама, скриптове на трети страни и бисквитки. Ако някога добавим нещо, което се изпълнява в твоя браузър или оставя следа в него, то получава свой раздел тук и версията на този документ се сменя — в същото издание, преди промяната да стигне до теб, а не след нея.",
            en: "The rest describes the site as it stands in this version of the document. Today the page runs no audience-measurement tool, no tracking script, no pixel, no advertising, no third-party script and no cookie. If we ever add something that runs in your browser or leaves anything in it, it gets its own section here and this document's version changes — in the same release, before the change reaches you, not after it.",
          },
          {
            bg: "Затова страницата е кратка: описва малко, защото сайтът прави малко. Ако това се промени, страницата ще стане по-дълга, а не по-обща.",
            en: "That is why this page is short: it describes little because the site does little. If that changes, this page gets longer rather than vaguer.",
          },
        ],
      },
      {
        h: { bg: "Какво се пази — на твоето устройство", en: "What is stored — on your device" },
        p: [
          {
            bg: "Две настройки, и то само ако ги смениш: езикът и светлата или тъмната тема. Ако не пипнеш нищо, не записваме нищо — първото зареждане не оставя следа в браузъра ти. Смениш ли едното, то се пази в localStorage под ключа vyarno_lang или vyarno_theme. Това не са бисквитки, но правилото за съхраняване на данни в устройството ти важи и за тях (чл. 4а от Закона за електронната търговия); пазим ги, защото ти си поискал точно тази настройка, и затова не те питаме отново. Не се изпращат при заявка и не съдържат нищо лично. Изчистваш ги от настройките на браузъра си, когато поискаш.",
            en: "Two preferences, and only if you change them: the language and the light or dark theme. Touch nothing and nothing is written — a first load leaves no trace in your browser. Change one and it is kept in localStorage under the key vyarno_lang or vyarno_theme. These are not cookies, but the rule about storing data on your device covers them anyway (art. 4a of the Bulgarian E-Commerce Act); we keep them because you asked for that specific setting, which is why we do not ask you again. They are never sent with a request and contain nothing personal. You can clear them from your browser's settings whenever you like.",
          },
        ],
      },
      {
        h: { bg: "Какво вижда хостът", en: "What the host sees" },
        p: [
          {
            bg: "Тук сме точни, защото „не събираме нищо“ лесно става неточно. Като всеки уеб сървър, машината, която доставя страницата, записва обичайния ред в журнала си: IP адрес, момент, поискан адрес и вид браузър. Това е необходимо, за да стигне страницата до теб и да се защитим от злоупотреба, и е единственото, което съществува за твоето посещение.",
            en: "We are precise here, because “we collect nothing” slips easily into being untrue. Like every web server, the machine that delivers the page records the ordinary log line: IP address, timestamp, requested URL and browser type. That is what it takes to get the page to you and to defend against abuse, and it is the only thing that exists about your visit.",
          },
          {
            bg: "Тези редове може да ги четем обобщено — колко посещения има, кои страници се отварят и откъде идват хората. Това е броене, а не проследяване: не изграждаме профил за теб, не свързваме журнала с друг източник и не го предоставяме на трети лица. Журналът стои на сървър, който наемаме в Европейския съюз и администрираме сами; данните не напускат ЕС. Пазим го не повече от 14 дни, след което файловете се изтриват автоматично — не пазим архив и не го копираме другаде.",
            en: "We may read those lines in aggregate — how many visits there are, which pages get opened and where people arrive from. That is counting, not tracking: we build no profile of you, we join the log to no other source, and we pass it to no third party. The log sits on a server we rent inside the European Union and administer ourselves; the data does not leave the EU. We keep it for no more than 14 days, after which the files are deleted automatically — we keep no archive and copy it nowhere else.",
          },
        ],
      },
      {
        h: { bg: "Ако решиш да дариш", en: "If you choose to donate" },
        p: [
          {
            bg: "Този сайт не приема плащания и няма форма за дарение. Има само връзки към Ko-fi и GitHub Sponsors — натиснеш ли някоя от тях, излизаш от vyarno.bg. Ако не ги натиснеш, нищо в този раздел не се отнася за теб.",
            en: "This site takes no payments and has no donation form. What it has is links to Ko-fi and GitHub Sponsors — follow one and you leave vyarno.bg. If you do not follow them, nothing in this section is about you.",
          },
          {
            bg: "Ko-fi, GitHub и Stripe са отделни дружества със свои условия и своя политика за поверителност; там си техен потребител, а не наш. Плащането минава изцяло през платформата и нейния доставчик на разплащания: данните на картата ти не преминават през този сайт и не стигат до нас под никаква форма.",
            en: "Ko-fi, GitHub and Stripe are separate companies with their own terms and their own privacy policies; there you are their user, not ours. The payment goes entirely through the platform and its own payment provider: your card details do not pass through this site and do not reach us in any form.",
          },
          {
            bg: "От дарението получаваме името или псевдонима, който си въвел, електронната ти поща, съобщението, ако си оставил такова, сумата и датата. Основанието е самото дарение — то е договор, макар и безвъзмезден — и задължението ни да отчетем полученото пред данъчните органи. Пазим тези записи, докато текат данъчните срокове, които се отнасят за тях, и не ги ползваме за друго: не изграждаме профил, не пращаме бюлетин и не публикуваме списък на дарителите.",
            en: "From the donation we receive the name or alias you entered, your e-mail address, your message if you left one, the amount and the date. The basis is the donation itself — a contract, gratuitous though it is — and our obligation to account to the tax authorities for what we receive. We keep those records for as long as the tax periods that apply to them run, and we use them for nothing else: we build no profile, we send no newsletter, and we publish no list of donors.",
          },
          {
            // GitHub Sponsors shows sponsors on the recipient's own GitHub
            // profile unless the sponsor sets themselves private. That is the
            // platform's page and the person's own setting there, and the
            // notice has to say so: "we publish no list of donors" is true of
            // vyarno.bg and would otherwise read as a promise that a name
            // becomes public nowhere.
            //
            // It is also the boundary `support.js` rule 4 sits behind on this
            // channel. Copying that list onto vyarno.bg would make it
            // something the project gives back for a donation — which is
            // exactly what flips `LEGAL_FORM.takesPayment`.
            bg: "Някои платформи показват дарителите на своята собствена страница — GitHub Sponsors прави така, освен ако не се отбележиш като частен дарител там. Това е тяхната страница и твоята настройка при тях; ние не пренасяме такъв списък тук, не подреждаме дарители и не даваме нищо в замяна на дарение.",
            en: "Some platforms show supporters on a page of their own — GitHub Sponsors does, unless you mark yourself a private sponsor there. That is their page and your setting with them; we copy no such list onto this site, we rank nobody, and we give nothing in return for a donation.",
          },
          {
            bg: "Правата ти по ОРЗД важат и за този запис и се упражняват на същия адрес — contact@vyarno.bg. За това, което Ko-fi, GitHub или Stripe държат за теб, се обърни към тях: ние нямаме достъп до профила ти при тях и не можем да го променим.",
            en: "Your GDPR rights cover that record too and are exercised at the same address — contact@vyarno.bg. For what Ko-fi, GitHub or Stripe hold about you, go to them: we have no access to your account with any of them and cannot change it.",
          },
        ],
      },
      {
        h: {
          bg: "Защо това е техническо, а не обещание",
          en: "Why this is enforced, not promised",
        },
        p: [
          {
            bg: "Обещанието не е достатъчно, затова е заковано в самата страница. Политиката за сигурност на съдържанието (Content-Security-Policy), с която сайтът се доставя, позволява на браузъра да се свързва само с vyarno.bg и никъде другаде, и да изпълнява само наш код. Ако някой добави следящ скрипт, той няма да проработи скришом — той ще се счупи.",
            en: "A promise is not enough, so it is nailed down in the page itself. The Content-Security-Policy the site is served with allows the browser to connect only to vyarno.bg and nowhere else, and to execute only our own code. If someone added a tracking script it would not quietly work — it would break.",
          },
          {
            bg: "Шрифтовете също са наши и се доставят от нашия адрес, а не от чужда мрежа за доставка. Към тази версия браузърът ти не праща нито една заявка към трето лице. Ако някога се наложи, политиката трябва да бъде разхлабена явно и видимо — и този раздел се сменя заедно с нея, в същото издание.",
            en: "The fonts are ours too and are served from our own address rather than a third-party network. As of this version your browser makes not one request to a third party. If that ever has to change, the policy must be relaxed explicitly and visibly — and this section changes with it, in the same release.",
          },
        ],
      },
      {
        h: { bg: "Твоите права", en: "Your rights" },
        p: [
          {
            bg: "Администратор на лични данни по смисъла на ОРЗД (GDPR) е лицето, посочено в раздел „Идентификация“ по-долу. Правното основание за краткото журналиране на заявки е легитимният интерес да доставим страницата, да я защитим от злоупотреба и да преценим обобщено дали изобщо някой я ползва. Единственият получател на данните от журнала е доставчикът на хостинг, който поддържа машината и обработва журнала само по наше указание, по договор по чл. 28 от ОРЗД. Няма друг получател на журнала; за дарението важи разделът по-горе.",
            en: "The data controller for the purposes of the GDPR is the person identified in the “Identification” section below. The legal basis for briefly logging requests is the legitimate interest in delivering the page, protecting it from abuse, and judging in aggregate whether anyone is using it at all. The only recipient of the log data is the hosting provider that keeps the machine running, which processes the log solely on our instructions under a GDPR art. 28 contract. The log has no other recipient; for a donation, the section above applies.",
          },
          {
            bg: "ОРЗД ти дава право на достъп, коригиране, изтриване, ограничаване, преносимост и възражение. Тук те опират в необичайна практическа граница: освен журнала на заявките и — ако си дарил — записа за дарението, ние не държим нищо, свързано с теб, така че няма към какво друго да се приложат. Ако все пак искаш да упражниш някое от тях или просто да провериш какво имаме, пиши на contact@vyarno.bg — отговаряме в срок до един месец.",
            en: "The GDPR gives you rights of access, rectification, erasure, restriction, portability and objection. Here they meet an unusual practical limit: apart from the request log and — if you have donated — the record of that donation, we hold nothing connected to you, so there is nothing else for them to attach to. If you would like to exercise one anyway, or simply to check what we have, write to contact@vyarno.bg — we answer within one month.",
          },
          {
            bg: "Ако смяташ, че обработваме данни неправомерно, имаш право на жалба до Комисията за защита на личните данни (данните са по-долу).",
            en: "If you believe we process data unlawfully you have the right to complain to the Commission for Personal Data Protection (details below).",
          },
        ],
      },
      {
        h: { bg: "Деца и особени категории данни", en: "Children and special categories" },
        p: [
          {
            bg: "Сайтът не е насочен към деца и не изисква възраст, защото не изисква нищо. Не обработваме особени категории лични данни. Данните, които въвеждаш, са лични по същество — точно затова не ги искаме и не ги получаваме.",
            en: "The site is not directed at children and does not ask for an age, because it asks for nothing. We process no special categories of personal data. The figures you enter are personal in substance — which is precisely why we neither ask for them nor receive them.",
          },
        ],
      },
      {
        h: { bg: "Ако това някога се промени", en: "If this ever changes" },
        p: [
          {
            bg: "Изречението на първата страница — „Всичко е анонимно, не събираме лични данни“ — е обещание, което трябва да остане вярно. Ако някога построим нещо, което го променя, изречението се променя в същото издание, а не по-късно. Обещанието не бива да оцелява след истината.",
            en: "The sentence on the front page — “everything is anonymous, we don't collect personal data” — is a promise that has to stay true. If we ever build something that changes it, the sentence changes in the same release, not later. A promise must not outlive the truth.",
          },
        ],
      },
      {
        h: { bg: "Съобщаване на уязвимост", en: "Reporting a vulnerability" },
        id: "security",
        p: [
          {
            bg: "Ако си намерил проблем в сигурността, пиши на contact@vyarno.bg. Опиши какво си видял и как да го възпроизведем; ако е нужно, ще уговорим начин за размяна на криптирани съобщения. Потвърждаваме получаването до три работни дни.",
            en: "If you have found a security problem, write to contact@vyarno.bg. Describe what you saw and how to reproduce it; if it helps we will agree a way to exchange encrypted messages. We acknowledge receipt within three working days.",
          },
          {
            bg: "Молим за разумно поведение: без изтегляне на данни в обем, без промяна или изтриване на нещо, без изпробвания, които влошават достъпа на други хора, и без разгласяване, преди да сме имали възможност да поправим. Ако се държиш така, няма да предприемаме действия срещу теб. Не плащаме награди — сайтът не държи чужди лични данни, така че наградата би била в непропорционален размер спрямо риска.",
            en: "We ask for reasonable behaviour: no bulk data extraction, no modifying or deleting anything, no testing that degrades access for other people, and no disclosure before we have had a chance to fix it. Behave that way and we will take no action against you. We do not pay bounties — the site holds no one else's personal data, so a bounty would be out of proportion to the risk.",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "identity",
    title: { bg: "Идентификация на доставчика", en: "Provider identification" },
    sections: [
      {
        h: { bg: "Кой предоставя услугата", en: "Who provides the service" },
        p: [
          {
            bg: "Вярно е личен проект на едно физическо лице, предоставя се безплатно и не продава нищо. Няколко от точките на чл. 4 от Закона за електронната търговия се дължат само при вписване в регистър, при лицензионен режим или при регистрация по ЗДДС — нито едно от които не е налице тук, а и не зависи от това дали услугата е платена. Останалите се дължат от всеки доставчик и стоят по-долу: име, дейност, два работещи пътя за връзка и адрес за кореспонденция при поискване.",
            en: "Vyarno is one natural person's side project, provided free of charge, and it sells nothing. Several points of art. 4 of the Bulgarian E-Commerce Act are owed only on entry in a register, under a licensing regime, or on VAT registration — none of which applies here, and none of which turns on whether the service is paid for. The rest are owed by every provider and stand below: a name, an activity, two working contact routes and a correspondence address on request.",
          },
          {
            bg: "Адресът се дава при поискване, а не се отпечатва тук, защото доставчикът е физическо лице и постоянният му адрес е домашен. Пътят до него е публикуван и се отговаря по него; ако това някога спре да е вярно, правилният отговор е да се отпечата адресът, а не да се смекчи изречението.",
            en: "The address is given on request rather than printed here, because the provider is a natural person and their permanent address is a home address. The route to it is published and it is answered; if that ever stops being true, the right answer is to print the address, not to soften the sentence.",
          },
          {
            bg: "Няма редове, отбелязани като „предстои“, и това е нарочно: ред, който стои „предстои“ с години, не се различава от пропуск. Ако някой ден Вярно започне да получава плащания, законът иска повече — вписване в регистър, при случай и регистрация по ЗДДС — и тогава те се появяват тук в същото издание, в което се появи и първото плащане.",
            en: "No row here is marked “pending”, and that is deliberate: a row that reads “pending” for years is indistinguishable from an oversight. If Vyarno ever starts taking payment the law asks for more — a register entry, and VAT registration where it applies — and those appear here in the same release as the first payment, not later.",
          },
        ],
        render: "identity",
      },
      {
        h: { bg: "Надзорни органи", en: "Supervisory authorities" },
        p: [
          {
            bg: "Дейността не подлежи на лицензиране. Тези органи не ни разрешават да работим — посочваме ги, защото трябва да знаеш къде да се обърнеш, ако имаш възражение.",
            en: "The activity is not subject to licensing. These authorities do not authorise us — we name them because you should know where to turn if you have a complaint.",
          },
        ],
        render: "supervisors",
      },
      {
        h: { bg: "Права и марки", en: "Rights and marks" },
        p: [
          {
            bg: `Приложението, кодът, текстовете, оформлението, схемата на публикуваните данни и подборът на източници са на носителя на авторските права. Изходният код е публикуван под лиценз Apache-2.0 в ${REPO_SLUG} — свободен е за ползване, промяна и разпространение. Числата обаче не са наши и лицензът не ги покрива: те остават подчинени на условията на всеки издател (виж раздел „Източници“). „Вярно“, „Vyarno“ и домейнът vyarno.bg се ползват като означения на този проект; регистрирана търговска марка няма и не твърдим, че има, но молим никой да не нарича своя версия „Вярно“.`,
            en: `The application, its code, its copy, its design, the schema of the published data and the selection of sources belong to the copyright holder. The source is published under the Apache-2.0 licence at ${REPO_SLUG} — free to use, modify and redistribute. The figures are not ours and the licence does not reach them: they remain subject to each publisher's own terms (see the “Sources” section). “Вярно”, “Vyarno” and the domain vyarno.bg are used as this project's identifiers; there is no registered trade mark and we do not claim one, but we ask that nobody call their own version “Вярно”.`,
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "sources",
    title: { bg: "Източници на данните", en: "Where the data comes from" },
    sections: [
      {
        h: {
          bg: "Пет източника и нито едно измислено число",
          en: "Five sources and not one invented figure",
        },
        p: [
          {
            bg: "Вярно не произвежда статистика. Взима публикувани данни от пет източника, проверява ги и ги показва с дата и връзка към първоизточника. Затова всяко число на сайта може да бъде проверено — включително срещу нас.",
            en: "Vyarno produces no statistics. It takes published data from five sources, checks it, and shows it with a date and a link to the original. That is why every figure on the site can be checked — including against us.",
          },
          {
            // The last sentence points at the per-payload panel, not at a
            // single date: one date across eight payloads can only describe one
            // of them.
            bg: "Данните не се дърпат от браузъра ти в момента на сметката. Изтеглят се, преминават през проверки и се публикуват като файлове заедно със сайта, така че страницата да е бърза и числата да са едни и същи за всички. Горе на страницата има списък с всяко число, периода, за който се отнася, и деня, в който сме го изтеглили.",
            en: "The data is not pulled from your browser at the moment of calculation. It is fetched, put through validation checks, and published as files alongside the site — so the page is fast and everyone sees the same figures. At the top of the page is a list of every figure, the period it refers to, and the day we fetched it.",
          },
        ],
        render: "upstreams",
      },
      {
        // Eurostat's copyright notice (read 2026-07-30) does not stop at
        // "state the modification". It continues: "A disclaimer regarding the
        // non-responsibility of Eurostat shall be included." The pay ladder is
        // modelled from their deciles and the basket weights are converted out
        // of per-thousand, so the condition is engaged and this section is how
        // it is met. It is a licence condition rather than a courtesy, which is
        // why it is its own section: folded into a paragraph about something
        // else, a copy edit dissolves it without anyone noticing what was lost.
        //
        // The paragraph also states what is NOT modified, and that half earns
        // its space. A reader who opens a verify link needs to know whether the
        // digits should match before deciding that a mismatch is a mistake —
        // for the index they should, and saying so is what makes the link a
        // check rather than a decoration.
        //
        // имот.bg is in here on the reader's account rather than a publisher's.
        // They impose no condition at all (docs/legal.md §имот.bg), so nothing
        // obliges this sentence — but the housing card prints one €/m² for
        // Sofia under a link to a page that publishes 143 district figures and
        // no city total, and a reader who follows that link has to be able to
        // find out where the single number came from. Naming the four sources
        // whose figures are verbatim and leaving the fifth unmentioned reads as
        // if it belonged in the same set.
        h: { bg: "Уговорка за преизчислените числа", en: "Disclaimer on the figures we recompute" },
        p: [
          {
            bg: "Ценовият индекс на Евростат стои тук такъв, какъвто е публикуван — не го пребазираме и не го преизчисляваме. Наш е само изборът кои четения показваме: за всяка година вземаме декемврийското, а годините без декември изпадат. Едно число обаче е наистина преизчислено — подредбата на заплатите е моделирана от трите публикувани децила на изследването за структурата на заплатите, защото Евростат публикува само тях, а между тях няма междинни. Обозначено е до самото число. Тежестите на групите в кошницата са на Евростат, но в проценти, а не в промили, както ги публикуват. Евростат не носи отговорност за тези наши преработки, нито за изводите, които някой прави от тях — отговорността е наша. Числата на НСИ, БНБ и ЕЦБ се показват така, както са публикувани. Кварталните цени на имот.bg — също, но имот.bg не публикува обща стойност за София. Числото за града на тази страница е медианата на техните квартални цени, а промяната спрямо 2015 г. сравнява същата медиана с медианата за онази година. Двете числа са наши.",
            en: "Eurostat's price index stands here as published — we do not rebase it and we do not recompute it. What is ours is only the choice of which readings to show: for each year we take the December one, and a year without a December drops out. One figure is genuinely recomputed: the pay ladder is modelled from the three published deciles of the Structure of Earnings Survey, because those three are all Eurostat publishes and there is nothing in between them. It is marked as such next to the figure. The basket weights are Eurostat's, shown in percent rather than the per-thousand they publish. Eurostat bears no responsibility for that work of ours, nor for any conclusion drawn from it — the responsibility is ours. The figures from НСИ, БНБ and the ECB are shown as published. So are имот.bg's per-district prices, but имот.bg publishes no city-wide figure for Sofia. The €/m² for the city on this page is the median across their districts, and the change since 2015 compares that same median against the one for that year. Both of those figures are ours.",
          },
        ],
      },
      {
        h: { bg: "Какво изисква това от теб", en: "What that asks of you" },
        p: [
          {
            bg: "Ако цитираш число оттук, посочи източника, от който то идва, и датата, за която се отнася. Не защото искаме признание, а защото няколко от изброените публикуват при точно това условие — и защото число без дата и източник е слух.",
            en: "If you quote a figure from here, name the source it comes from and the date it refers to. Not because we want credit, but because several of the publishers above permit reuse on exactly that condition — and because a figure with no date and no source is a rumour.",
          },
        ],
      },
    ],
  },
];

/**
 * The four documents, in publication order, each with its short nav label.
 *
 * Throwing here rather than rendering a document with no label is deliberate:
 * a legal page that silently drops a section is the failure mode worth being
 * loud about, and `verify_legal.mjs` catches it before a build.
 */
export const DOCS = LEGAL_NAV.map(({ id, nav }) => {
  const body = DOC_BODIES.find((d) => d.id === id);
  if (!body) throw new Error(`legal.js: no document body for "${id}"`);
  return { ...body, nav };
});

/**
 * Which `dueWhen` classes the given legal form actually owes.
 *
 * @param {{takesPayment:boolean, vatRegistered:boolean}} form
 * @returns {Set<string>}
 */
export function identityDuties(form = LEGAL_FORM) {
  const due = new Set(["always"]);
  if (form?.takesPayment) due.add("paid");
  if (form?.vatRegistered) due.add("vat");
  return due;
}

/**
 * The rows `/legal/` publishes under the given form — and only those.
 *
 * A row the law does not ask of us is absent from the page rather than
 * rendered as „предстои". A row that sits "pending" indefinitely is
 * indistinguishable from an oversight, and trains a reader to ignore the
 * section.
 *
 * @param {{takesPayment:boolean, vatRegistered:boolean}} [form]
 * @param {Array} [rows]
 */
export function identityRows(form = LEGAL_FORM, rows = IDENTITY) {
  const due = identityDuties(form);
  return rows.filter((r) => due.has(r.dueWhen));
}

/**
 * Rows the current legal form owes and that carry no value — the release
 * guard's failure list.
 *
 * Today this is empty, and `npm run build:release` passes. It stops being
 * empty the moment `LEGAL_FORM.takesPayment` (or `vatRegistered`) flips,
 * which is exactly when someone needs to be told that the published identity
 * has fallen out of step with what we have become. Kept a pure function so it
 * is testable without a build.
 *
 * @returns {string[]} row ids
 */
export function unpublishedIdentityFields(form = LEGAL_FORM, rows = IDENTITY) {
  return identityRows(form, rows)
    .filter((r) => r.value == null)
    .map((r) => r.id);
}

/**
 * Text that would mean the site sells something — the guard's independent
 * check on `LEGAL_FORM.takesPayment`.
 *
 * Without this, `takesPayment: false` is a self-declared knob and the guard
 * only ever confirms what it was told. With it, shipping a price, a
 * subscription or a checkout while the identity still says "free" fails the
 * release build.
 *
 * Matched against **rendered copy** — the string values the modules export,
 * collected by `copyStrings` — never against file text: source comments and
 * this function's own regex literals would trip it. Docs are out of scope on
 * purpose: they describe the product to us, they are not shipped to anyone.
 *
 * @param {string} text  concatenated user-facing copy
 * @returns {string[]}   the markers found, for the guard's message
 */
export function commercialSignals(text = "") {
  // Two families, and neither is a bare keyword. A price with a period
  // attached is a price list; an imperative to pay is a checkout. The word
  // "абонамент" on its own is not — the privacy notice is entitled to say we
  // do not have one, and a guard that fires on its own denial is noise.
  // `\b` is ASCII-only in JS, so the Cyrillic alternatives use a
  // `(?!\p{L})` lookahead instead.
  //
  // CURRENCY: the symbol alone is not enough. This is a Bulgarian-language site
  // in a country that adopted the euro in 2026, so a price is at least as
  // likely to be written "5 лв/месец" or "5 EUR/month" as "€5/month" — and an
  // earlier version of this guard, matching only [€$], missed every one of
  // those. A tripwire that a native phrasing walks straight past is not a
  // tripwire. `лв.` is listed before `лв` so the alternation prefers the
  // longer form.
  const CUR = "€|\\$|лв\\.|лв|лева|лeva|EUR|BGN|leva";
  const PER = "мес(ец|ечно)?|month(ly)?|mo|год(ина|ишно)?|year(ly)?|yr|annum";
  const markers = [
    // symbol/word BEFORE the amount:  €5 / month,  BGN 5 / month
    new RegExp(`(?:${CUR})\\s?\\d[\\d\\s.,]*\\s*\\/\\s*(?:${PER})(?!\\p{L})`, "giu"),
    // symbol/word AFTER the amount:  5€/month,  9,99 лв/мес,  5 EUR/month
    new RegExp(`\\d[\\d\\s.,]*\\s?(?:${CUR})\\s*\\/\\s*(?:${PER})(?!\\p{L})`, "giu"),
    // "10 лева на месец" / "10 EUR per month" — the same price, spelled out
    new RegExp(`\\d[\\d\\s.,]*\\s?(?:${CUR})\\s+(?:на|per|a)\\s+(?:${PER})(?!\\p{L})`, "giu"),
    /(купи|купете|плати сега|платете сега|абонирай се|абонирайте се|поръчай|поръчайте)(?!\p{L})/giu,
    /(buy now|subscribe now|start your free trial|checkout|upgrade to)(?!\p{L})/giu,
  ];
  const hits = new Set();
  for (const re of markers) {
    for (const m of text.matchAll(re)) hits.add(m[0].trim());
  }
  return [...hits];
}

/**
 * Every string reachable from the given copy objects, joined.
 *
 * The input to `commercialSignals`. Walking the exported data rather than
 * reading the file is what keeps the tripwire honest: a comment explaining why
 * we do not sell subscriptions must not read as a subscription.
 *
 * @param {...unknown} roots
 * @returns {string}
 */
export function copyStrings(...roots) {
  const out = [];
  const walk = (node) => {
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const v of Object.values(node)) walk(v);
  };
  roots.forEach(walk);
  return out.join("\n");
}

/** A document by id, or `undefined`. */
export function docById(id, docs = DOCS) {
  return docs.find((d) => d.id === id);
}
