/**
 * Where someone can support Вярно, and the rules about how we ask.
 *
 * Вярно is a public good. Every feature is free to everyone, there is no
 * account, nothing is held back and nothing is sold. That is not a stage the
 * project is passing through on the way to a paid tier — it is what the
 * project is. Donations exist so the running costs stay paid, and for no
 * other reason.
 *
 * **The asking rules, because the failure mode here is obvious.** A civic
 * tool that nags is a worse civic tool. So:
 *
 *   1. **Two static surfaces and a page of its own. Nothing that
 *      interrupts.** The ask is one quiet line in the footer, and one answer
 *      to «Кой плаща за това?» inside the explainer's closed disclosure. Both
 *      are prose with a link, both point at `/support/`, and that page is the
 *      only place any of this is explained at length. No modal, no
 *      interstitial, no toast, no banner, no sticky bar, no floating button,
 *      no "you've used this 3 times" prompt, and nothing that moves, pulses or
 *      counts down.
 *
 *      **The second surface is there because a reader asked.** A free tool
 *      that measures a stranger's salary against official statistics owes an
 *      answer to "what is the catch", and the answer — nobody pays us, and no
 *      figure on the page depends on who gave — is the same claim the rest of
 *      the site is built on. It belongs beside «А моите данни?», which is the
 *      other question of that kind, in a disclosure the reader chose to open.
 *
 *      **Two is a ceiling, not a starting point.** What this rule stops is not
 *      any single surface — it is the third, then the fourth, each one
 *      individually reasonable at the moment somebody adds it. So the count is
 *      enforced rather than trusted: `verify_support.mjs` holds the list of
 *      files allowed to import this module, and a fourth one fails the suite.
 *      Adding a component to make the ask harder to miss is still the thing
 *      this comment exists to stop.
 *   2. **Never conditioned on use.** The ask does not appear after a
 *      calculation, does not scale with session count and is not personalised.
 *      It looks identical to a first-time visitor and to a daily one — which
 *      is why both surfaces above are static markup that reads no state.
 *   3. **No amounts in shipped copy.** Partly taste — a suggested figure is a
 *      price by another name — and partly mechanical: `commercialSignals()`
 *      in `legal.js` scans rendered copy for "€N/month" patterns and fails a
 *      release build on a hit, which is exactly the right outcome. Amounts
 *      live on the donation platform, where the person has already decided.
 *   4. **Nothing is given in return.** No supporter tier, no badge, no early
 *      access, no ad-free mode, no name in lights. The moment a donation buys
 *      something, the service is provided срещу възнаграждение and
 *      `LEGAL_FORM.takesPayment` in `legal.js` has to flip — which pulls in
 *      the rest of ЗЕТ чл. 4 (postal address, register entry). Keep gifts
 *      gifts.
 *
 * Rule 4 is the load-bearing one legally. A донация under ЗЗД is gratuitous:
 * the donor gets nothing back, so the service stays безвъзмездна and the
 * identity in `legal.js` stays true. Attaching ANY benefit to a donation
 * changes that analysis and is not a copy tweak.
 */

/**
 * The platforms, in the order they are shown.
 *
 * `live: false` means the account is not open yet and the entry is not
 * rendered — a donate button leading to a 404 is worse than no button.
 * Flip the flag in the same commit that opens the account, and update
 * `.github/FUNDING.yml` to match; `verify_support.mjs` fails if the two
 * disagree.
 */
export const SUPPORT_PLATFORMS = [
  {
    id: "github",
    label: "GitHub Sponsors",
    url: "https://github.com/sponsors/vyarno-bg",
    live: false,
    note: {
      bg: "еднократно или месечно, през GitHub",
      en: "one-off or monthly, through GitHub",
    },
  },
  {
    id: "opencollective",
    label: "Open Collective",
    url: "https://opencollective.com/vyarno",
    live: false,
    note: {
      bg: "с публичен отчет за всеки приход и разход",
      en: "with a public ledger of every payment in and out",
    },
  },
  {
    id: "liberapay",
    label: "Liberapay",
    url: "https://liberapay.com/vyarno",
    live: false,
    note: {
      bg: "нестопанска платформа, повтарящи се дарения",
      en: "non-profit platform, recurring donations",
    },
  },
  {
    id: "kofi",
    label: "Ko-fi",
    url: "https://ko-fi.com/vyarno",
    live: true,
    note: {
      bg: "еднократно, без регистрация",
      en: "one-off, no account needed",
    },
  },
];

/** The platforms with an actually-open account. This is what the UI renders. */
export function livePlatforms(platforms = SUPPORT_PLATFORMS) {
  return platforms.filter((p) => p.live);
}

/**
 * The platform the footer links to directly, or `null` for `/support/`.
 *
 * With exactly one channel open, the footer's «Подкрепа» link and the support
 * page behind it lead to a single outbound link the reader was always going
 * to end at. Sending them through a page to reach it is a click charged for
 * nothing.
 *
 * With two or more, the footer stops choosing. Which platform someone gives
 * through is theirs to pick, the difference between them is what the `note`
 * strings are for, and a footer is the wrong width to explain it in. It goes
 * back to `/support/`, where the cards carry the notes.
 *
 * Rule 1 above still binds either way: this is the SAME one quiet line with
 * the same one link, pointed one hop further along. It is not a second ask,
 * and it may not grow into a button.
 */
export function footerDonateLink(platforms = SUPPORT_PLATFORMS) {
  const live = livePlatforms(platforms);
  return live.length === 1 ? live[0] : null;
}

/**
 * The footer's support line.
 *
 * Deliberately a statement of fact with a link, not an appeal. It says what
 * the project is and what keeps it running; it does not say "please", does
 * not say "help us reach", and asks for nothing specific.
 */
export const SUPPORT_COPY = Object.freeze({
  /** Footer link label. */
  navK: { bg: "Подкрепа", en: "Support" },

  /**
   * The one line shown next to the link. No amounts — see rule 3 above.
   *
   * The second sentence names what the money is for rather than that money
   * exists. «Поддържа се от дарения» is true of a foundation with staff and of
   * one person paying a hosting bill, and the reader cannot tell which they are
   * looking at; the domain and the server are the whole list, so printing the
   * list is both shorter and the more informative sentence. Rule 3 still binds
   * — a cost is named, never a figure.
   */
  line: {
    bg: "Вярно е безплатно за всички и няма платена версия. Домейнът и сървърът се плащат от дарения.",
    en: "Vyarno is free for everyone and has no paid version. The domain and the server are paid for by donations.",
  },

  /**
   * Label on the footer's direct link, which the platform's own name follows:
   * «Дарение през Ko-fi», "Donate via Ko-fi".
   *
   * The platform name is NOT in this string. It comes from the live entry in
   * `SUPPORT_PLATFORMS`, so a channel that closes takes its name out of the
   * footer with it rather than leaving a label naming somewhere nobody can
   * give any more. Naming the destination is also the point of the label: an
   * outbound link that does not say where it goes is the one a person does
   * not click.
   */
  donateK: { bg: "Дарение през", en: "Donate via" },

  /**
   * The explainer's own item, and the second of the two surfaces rule 1
   * allows.
   *
   * It answers a trust question rather than making an ask, and the ordering of
   * the sentences is the whole point: what nobody is paying us for comes
   * first, the donations come last. A reader who has just been told their
   * groceries rose 11% is entitled to know who benefits from that sentence,
   * and the honest answer is stronger for this project than any appeal would
   * be. `verify_copy.mjs`'s no-paid-placement claim in the terms of use says
   * the same thing in the document nobody reads.
   */
  explainK: { bg: "Кой плаща за това?", en: "Who pays for this?" },
  explainBody: {
    bg: "Никой не ни плаща да ти го покаже. Няма реклами, няма платена версия и не взимаме пари от банка, кредитен посредник, брокер или застраховател — нито едно число тук не зависи от това кой плаща. Домейнът и сървърът се покриват от дарения.",
    en: "Nobody pays us to show it to you. There is no advertising, no paid version, and we take no money from a bank, a credit intermediary, a broker or an insurer — no figure here depends on who is paying. The domain and the server are covered by donations.",
  },

  /** The link that closes the explainer item, and the only route it offers. */
  moreK: {
    bg: "Какво покриват и какво не купуват",
    en: "What they cover, and what they do not buy",
  },

  /** Heading for `/support/`. */
  head: { bg: "Подкрепа на проекта", en: "Supporting the project" },

  /**
   * The longer explanation, on `/support/` where someone who followed the
   * link is already reading. Says where money goes and what it does not buy.
   */
  body: {
    bg: "Вярно се поддържа от дарения. Те покриват домейна, сървъра и нищо друго — няма заплати, няма дружество, няма инвеститор. Дарението не купува нищо: няма платена версия, няма допълнителни функции за дарители и никое число на сайта не зависи от това кой е дарил. Ако предпочиташ да не даряваш, нищо не се променя за теб — целият сайт остава напълно достъпен.",
    en: "Vyarno runs on donations. They cover the domain and the server and nothing else — there are no salaries, no company and no investor. A donation buys nothing: there is no paid version, no donor-only features, and no figure on the site depends on who gave. If you would rather not donate, nothing changes for you — the whole site stays fully available.",
  },

  /**
   * Shown in place of the platform list while no account is open yet.
   *
   * It states the fact and stops. What to do instead is the section below,
   * which is on the page whether a channel is open or not — a reader who
   * arrives with no way to give should meet the same answer as one who
   * arrives with four.
   */
  pending: {
    bg: "Каналите за дарение още не са отворени.",
    en: "The donation channels are not open yet.",
  },

  /**
   * Where the money is actually handled, which is not here.
   *
   * It repeats what the privacy notice says about a donor's data, in one
   * sentence, on the page where the decision is being made — the notice is
   * four documents away and this is the moment the answer matters. It links
   * there rather than restating the retention period, so the two cannot drift.
   */
  offsiteK: {
    bg: "Плащането не минава през този сайт",
    en: "The payment does not go through this site",
  },
  offsite: {
    bg: "Вярно не приема плащания и няма форма за дарение — даряваш при платформата, не тук, и данните на картата ти не стигат до нас под никаква форма. Какво получаваме оттам — име или псевдоним, поща, съобщение, сума и дата — стои в Поверителност.",
    en: "Vyarno takes no payments and has no donation form — you give on the platform rather than here, and your card details reach us in no form at all. What we do receive from there — a name or alias, an e-mail address, a message, the amount and the date — is set out in the privacy notice.",
  },
  privacyK: { bg: "Поверителност", en: "The privacy notice" },

  /**
   * The section that says money is not the top of the list, and means it.
   *
   * It stays on the page even while a channel is open, because it is true
   * either way and because a support page that offers exactly one thing to do
   * reads as a donation page. **The code is what is openly licensed here, never
   * the figures** — `docs/legal.md` §"Our own licence", and the same rule the
   * terms of use keep.
   */
  otherK: { bg: "По-полезно от пари", en: "More useful than money" },
  other: {
    bg: "Съобщи за сгрешено число, поправи нещо в кода или просто кажи на някого, че сайтът съществува. Кодът е под лиценз Apache-2.0 и всяка поправка се вижда в хранилището; едно съобщено грешно число струва повече от всяко дарение, защото него никой друг не го е забелязал.",
    en: "Report a wrong figure, fix something in the code, or just tell someone the site exists. The code is Apache-2.0 and every correction is visible in the repository; one reported wrong figure is worth more than any donation, because nobody else had noticed it.",
  },
  issuesK: { bg: "Съобщи за грешка", en: "Report an error" },
});
