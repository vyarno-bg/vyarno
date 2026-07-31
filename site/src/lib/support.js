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
 *   1. **One quiet line in the footer.** No modal, no interstitial, no
 *      toast, no banner, no "you've used this 3 times" prompt, and nothing
 *      that moves, pulses or counts down. If you are adding a component to
 *      make the ask harder to miss, that is the thing this comment exists to
 *      stop.
 *   2. **Never conditioned on use.** The ask does not appear after a
 *      calculation, does not scale with session count and is not personalised.
 *      It looks identical to a first-time visitor and to a daily one.
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
 * The platform the footer links to directly, or `null` for the legal page.
 *
 * With exactly one channel open, the footer's «Подкрепа» link and the support
 * block behind it lead to a single outbound link the reader was always going
 * to end at. Sending them through a page of legal documents to reach it is
 * two clicks charged for nothing.
 *
 * With two or more, the footer stops choosing. Which platform someone gives
 * through is theirs to pick, the difference between them is what the `note`
 * strings are for, and a footer is the wrong width to explain it in. It goes
 * back to `/legal/#support`, where the cards carry the notes.
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

  /** The one line shown next to the link. No amounts — see rule 3 above. */
  line: {
    bg: "Вярно е безплатно за всички и няма платена версия. Поддържа се от дарения.",
    en: "Vyarno is free for everyone and has no paid version. It runs on donations.",
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

  /** Heading for the block on the legal page. */
  head: { bg: "Подкрепа на проекта", en: "Supporting the project" },

  /**
   * The longer explanation, on the legal page where someone who followed the
   * link is already reading. Says where money goes and what it does not buy.
   */
  body: {
    bg: "Вярно се поддържа от дарения. Те покриват домейна, сървъра и нищо друго — няма заплати, няма дружество, няма инвеститор. Дарението не купува нищо: няма платена версия, няма допълнителни функции за дарители и никое число на сайта не зависи от това кой е дарил. Ако предпочиташ да не даряваш, нищо не се променя за теб — целият сайт остава напълно достъпен.",
    en: "Vyarno runs on donations. They cover the domain and the server and nothing else — there are no salaries, no company and no investor. A donation buys nothing: there is no paid version, no donor-only features, and no figure on the site depends on who gave. If you would rather not donate, nothing changes for you — the whole site stays fully available.",
  },

  /** Shown in place of the platform list while no account is open yet. */
  pending: {
    bg: "Каналите за дарение още не са отворени. Дотогава най-полезната подкрепа е да съобщиш за грешка или да поправиш нещо в кода.",
    en: "The donation channels are not open yet. Until they are, the most useful support is reporting an error or fixing something in the code.",
  },
});
