/**
 * Static UI content: presets, BG/EN labels, slider hint copy.
 * Hand-curated copy, NOT data. Source of truth for what every label
 * says in both languages. Mirrors the prototype's voice rules:
 *   - nominal is "на фиш"
 *   - means labelled "средно, не медиана"
 *   - hints idiomatic ("и на око става")
 *   - one anchor per sentence, consistent "ти"
 *   - decimal commas in BG (handled by Intl)
 *   - the savings row states plainly that the money buys less
 */

/**
 * Starting baskets — one number per ECOICOP ver.2 division, in the published
 * order CP01…CP13:
 *
 *   CP01 food · CP02 alcohol & tobacco · CP03 clothing · CP04 utilities &
 *   rent · CP05 furnishings · CP06 health · CP07 transport · CP08 phone,
 *   internet & devices · CP09 leisure, sport & culture · CP10 education ·
 *   CP11 eating out & hotels · CP12 insurance & banking · CP13 personal care
 *   & other services
 *
 * `official` is Eurostat's actual BG basket (prc_hicp_iw, 2026). It is
 * replaced at runtime by the live weights from `hicp_categories.json`; the
 * copy here is only what first paint shows before the fetch resolves, and
 * the parity check in `verify_data_contracts.mjs` keeps it honest.
 *
 * The other four are HAND-MADE illustrative starting points, not survey
 * data — a nudge in a direction, meant to be dragged from. They are labelled
 * as "a starting point" in the UI for exactly that reason. Each sums to 100.
 */
export const PRESETS = {
  official: [
    22.323, 5.919, 4.128, 9.936, 6.543, 7.483, 14.277, 6.332, 7.274, 1.484, 8.462, 1.415, 4.423,
  ],
  driver: [20, 4, 3, 10, 4, 5, 26, 5, 6, 1, 8, 3, 5],
  family: [30, 2, 6, 14, 5, 7, 11, 5, 5, 5, 4, 2, 4],
  // The brief's own example: someone with no car who eats a lot. Transport
  // drops to public-transport-only and the money lands on food and home.
  noCar: [30, 4, 4, 14, 6, 7, 5, 6, 8, 2, 9, 1, 4],
  // Pension-age: heavier on food, utilities and health; almost nothing on
  // education, transport or eating out.
  pensioner: [34, 4, 3, 20, 5, 16, 6, 5, 3, 0, 2, 1, 1],
};

export const HOME = {
  // Offline sentinel for the home block when city_price.json hasn't
  // loaded yet (first paint, offline build). The live value comes from
  // data.cityPrice?.eur_per_m2_median at runtime (the imot.bg scrape).
  eurPerM2_offlineFallback: 2500,
  // Country-average €/m²: no official BG €/m² level series exists
  // (Eurostat hpi_ndh_q is a rate-of-change index only), so this is
  // reserved null. The "country average" line in the national strip
  // reads HPI cumulative instead.
  eurPerM2_country: null,
  eurPerM2_source:
    "Per-city median across imot.bg/sredni-ceni district averages (data/published/city_price.json)",
  m2Default: 70,
  // Offline sentinel for the wage comparator, in the shape `region_salary.json`
  // publishes and read through the same `view/region.js#regionQuarter` the live payload
  // is — one implementation, so the offline figure cannot drift from the online
  // one.
  //
  // **It is НСИ's own published quarter**, because a sentinel is a shipped
  // figure like any other and the rule holds for it too: every НСИ figure this
  // project ships is one НСИ published (docs/legal.md §НСИ).
  //
  // **It carries Sofia-city alone, and that is not an oversight.** A sentinel is
  // what renders before a fetch lands; twenty-eight области of frozen wages
  // would be twenty-eight numbers going quietly stale in a source file, each
  // looking exactly like the live one. One is enough to keep the card from
  // reflowing, and any other област falls back to the empty state rather than
  // to a figure nobody refreshed.
  //
  // Refresh via `vyarno-pipeline refresh --source region-salary`, then copy
  // `value_eur` and `ref_period` across from the payload.
  regionSalaryFallback: {
    ref_period: "2026-Q1",
    // НСИ star the year until they finalise it, and the quarter this sentinel
    // mirrors is starred. A sentinel that dropped the marker would show the
    // pre-load card as settled and the loaded one as provisional, on the same
    // figure — so it carries whatever `region_salary.json` carries.
    is_preliminary: true,
    regions: [
      {
        code: "sofiya",
        en_name: "Sofia cap.",
        bg_name: "София(столица)",
        value_eur: 1915,
        series_by_period: { "2026-Q1": 1915 },
      },
    ],
  },
  regionMeanGrossSource:
    'NSI quarterly labour survey - by oblast, average monthly gross wage, latest published quarter (Labour_1.1.2.2_EUR_EN.xlsx + Labour_1.1.2.2_EUR.xlsx, "{year}trimes" sheets, district rows)',
  regionMeanGrossSourceUrl: "https://www.nsi.bg/en/statistical-data/179/569",
  // Offline sentinel for the LEVEL the percentile ladder is re-levelled onto —
  // НСИ's all-activities «Общо» row, in the shape `sector_salary.json`
  // publishes and read through the same `view/country.js#nationalQuarter` the live
  // payload is. One implementation, so the pre-load rungs cannot be composed
  // differently from the loaded ones.
  //
  // A DIFFERENT figure from `regionSalaryFallback` above, and the difference is
  // the point: that one is one област's mean and this one is the country's, and
  // the ladder may only ever take the second (view/country.js#payLadder).
  //
  // Refresh via `vyarno-pipeline refresh --source sector-salary`, then copy
  // `value_eur` and `ref_period` across from the payload's «Total» row.
  nationalWageFallback: {
    ref_period: "2026-Q1",
    // НСИ star the year until they finalise it, and the quarter this mirrors is
    // starred — same reasoning as the region sentinel above.
    is_preliminary: true,
    sectors: [
      {
        en_name: "Total",
        bg_name: "Общо",
        value_eur: 1407,
        series_by_period: { "2026-Q1": 1407 },
      },
    ],
  },
  // Offline sentinel for the mortgage rate, used only before mortgage.json
  // loads. Mirrors the published ECB MIR new-business AAR (2.43% at 2026-05)
  // — the average interest rate on BG home loans signed that month.
  rateDefaultPct: 2.43,
  rateDefaultSource: "ECB MIR · new BG home loans",
  termDefaultYears: 25,
  // 15% down is not a convention — it is the BNB's LTV-O cap of 85%, binding
  // on every BG mortgage since 2024-10-01. Live value comes from
  // mortgage.json → lending_limits.min_down_payment_pct; this is the offline
  // fallback. Mirrors mortgage.py#BNB_LENDING_LIMITS — update both together.
  downPaymentPct: 15,
  // BNB maturity cap for residential-real-estate loans. The term input is
  // clamped to this: no BG bank can originate a longer mortgage.
  termMaxYears: 30,
};

export const COPY = {
  // Page-level
  title: { bg: "Вярно — сметни своята инфлация", en: "Vyarno - work out your inflation" },
  h1: { bg: "Твоите числа. Твоята реалност.", en: "Your numbers. Your reality." },
  // P1 IN THE APP'S OWN VOICE, AND UNCONDITIONALLY. The promise this product
  // stands on is that a reader's figures never leave their device — `mirror.js`
  // is what makes it so — and «не събираме лични данни» is a narrower claim
  // wearing the same clothes: it says what WE do, where the reader wants to
  // know where their salary goes. Every other place the strong form is said is
  // reached only by a reader who went looking: `rememberHint` belongs to a
  // switch that has to be opened, the privacy notice is a document behind the
  // footer, and the <noscript> is served to nobody running JavaScript. This
  // line is the one a stranger meets in the first screen, so it is the one that
  // has to carry it.
  //
  // «Това устройство», not «твоя браузър»: the figures survive a reload in
  // `localStorage` when the switch above is on, which is still the device and
  // is what `rememberHint` qualifies two elements below.
  privacy: {
    bg: "Числата ти не напускат това устройство. Няма регистрация и не събираме лични данни.",
    en: "Your figures never leave this device. No sign-up, and we collect no personal data.",
  },
  brandSmall: { bg: "икономиката, честно", en: "the economy, honestly" },
  // The switch that keeps the reader's figures on this device, and the line
  // under it. The label has to carry the device in it — «запомни числата ми»
  // on its own is the sentence a reader would read as an account, on a page
  // whose first promise is that there is no server to hold one.
  rememberToggle: {
    bg: "Помни числата ми на това устройство",
    en: "Remember my figures on this device",
  },
  // Both halves of what saying yes means, in one line, because a reader decides
  // here and nowhere else: the promise that holds (nothing is sent), and the
  // risk that opens (whoever picks up the same device next). The privacy notice
  // says the same thing at length; this is the version that arrives in time to
  // change the answer.
  rememberHint: {
    bg: "Числата остават в този браузър и пак не се изпращат никъде. На общо устройство ги вижда и следващият, който отвори сайта.",
    en: "The figures stay in this browser and are still sent nowhere. On a shared device the next person to open the site sees them too.",
  },
  rememberForget: {
    bg: "Изтрий запазеното от това устройство",
    en: "Forget everything on this device",
  },
  // The first tab stop on every page that has a sticky header, and the same
  // string on each: a reader who has learnt where it goes on the calculator
  // meets the identical control on `/how/`. One key rather than a literal per
  // header, because a label that drifts between two pages is a label the second
  // page's reader has to read again.
  skipK: { bg: "Към съдържанието", en: "Skip to content" },
  // The accessible names of `/how/`'s four scroll boxes. Five columns do not
  // fit a 360px phone, so each table sits in an `overflow-x: auto` box — and a
  // box like that is not focusable on its own, which leaves a keyboard-only
  // reader unable to scroll it at all. Two of the four contain no link either,
  // so there is nothing inside to tab to that would scroll it for them.
  // `tabindex="0"` fixes the reaching; `role="region"` needs a NAME to be worth
  // announcing, and «превъртаща се област» four times over is not one.
  //
  // A single string rather than a `{bg, en}` pair in the DOM: `aria-label` is
  // one attribute and ARIA has no bilingual form, so it follows `$lang` the way
  // the share card's alt text does. The prerender therefore serves the Bulgarian
  // name, which is the default language a reader arrives in.
  howTblBasket: { bg: "13-те групи на кошницата", en: "the 13 basket groups" },
  howTblWedge: {
    bg: "данък и осигуровки по нива на брутната заплата",
    en: "tax and contributions by gross pay level",
  },
  howTblLadder: { bg: "стъпалата на заплатите в страната", en: "the pay rungs, nationwide" },
  // The header's two buttons carry a glyph and nothing else, so the accessible
  // name is the only thing that says what they do — and it has to arrive in the
  // language the reader is being served. BG is the primary language here; an
  // English-only label leaves a Bulgarian screen-reader user with the one
  // control they cannot guess at from its content.
  themeToggle: { bg: "смени темата", en: "toggle theme" },
  langToggle: { bg: "смени езика", en: "toggle language" },
  // The one route out of every page that is not the calculator, in the slot
  // the calculator uses for its two routes in. The arrow is part of the string
  // rather than a pseudo-element, because it is a direction and not decoration:
  // read out, «← към калкулатора» and «към калкулатора» say the same thing, and
  // seen, the arrow is what separates a way back from a fifth destination.
  // The same bar and the same rule: «← към калкулатора» is 153px and "← to the
  // calculator" was 169px, on a bar that has 16px less to give in English
  // because "Vyarno" is wider than «Вярно». The article and the preposition are
  // what a header sheds first — nothing about a back link needs them, and the
  // arrow already says which direction it goes.
  backToCalcK: { bg: "← към калкулатора", en: "← calculator" },
  // What the masthead's wordmark is subtitled with, page by page. A tagline is
  // a prop rather than markup inside the header because the header is shared
  // and this is the one word in it that is about WHICH page you are on — and a
  // string JavaScript passes as a prop belongs here rather than inlined in a
  // template (`site/AGENTS.md` §Copy).
  //
  // `brandSmall` above covers the calculator and `/404.html`: the first is the
  // page the promise is about, and the second is served for a path that matched
  // nothing, so naming a subject it does not have would be a subtitle that
  // lies. `/how/` and `/market/` share one key rather than holding two copies of
  // «числата» — they are the two pages of published figures, and a header that
  // called them different things would be claiming a distinction the tables do
  // not make.
  taglineFigures: { bg: "числата", en: "the numbers" },
  taglineLegal: { bg: "правна информация", en: "legal information" },
  taglineSupport: { bg: "подкрепа", en: "support" },

  // Inputs card
  yourNumbers: { bg: "Твоите числа", en: "Your numbers" },
  // The second inputs card's heading. Net pay sits in a card of its own above
  // it (PayField), so this one needs a name that says what is left rather than
  // repeating «Твоите числа» — two identical headings in one column read as a
  // rendering fault. It also sets the expectation the card is built on: none of
  // it has to be filled in for the page to answer.
  restOfNumbers: { bg: "Ако искаш — още за теб", en: "If you like - more about you" },
  netPay: { bg: "Нетна заплата", en: "Net pay" },
  // ONE person's take-home, and the hint has to keep saying so. It used to
  // offer «твоята или общо за домакинството» — enter yours, or the household's
  // — which invites the reader to add two payslips up and type the total. That
  // is the one entry this calculator cannot compute correctly: contributions
  // stop at a ceiling per contract, so a combined net inverted as a single
  // salary understates the household's gross by hundreds of euro a month. The
  // household is described by adding incomes, and `earnerAddHint` under the
  // field is where that is said.
  netPayHint: {
    bg: "(чистата заплата на един човек, на месец)",
    en: "(one person's take-home, monthly)",
  },
  // The same field in the other basis. The label and the hint have to follow
  // the toggle: a box holding €2,983 under «Нетна заплата» is a wrong number
  // with a correct one inside it, and the reader has no way to tell which of
  // the two the page believes.
  grossPay: { bg: "Брутна заплата", en: "Gross pay" },
  grossPayHint: {
    bg: "(брутната заплата на един човек по договор, на месец)",
    en: "(one person's gross contract pay, monthly)",
  },
  // NOT a claim about what people earn. Nobody publishes a national median net
  // wage; the only median in the data is the P50 of the ladder this site
  // composes, and it is on screen a few hundred pixels away under «медианна
  // нетна заплата · страната». A placeholder sitting near it and called
  // "typical" or "the median" would be borrowing that card's provenance.
  // docs/principles.md P7: no unsourced defaults.
  medianDefault: {
    bg: "числото е просто начална стойност — смени го със своята заплата",
    en: "that's just a starting value - replace it with your own pay",
  },

  // MORE THAN ONE INCOME
  //
  // Each income is entered on its own, and that is arithmetic rather than
  // presentation. Social contributions stop at the ceiling PER CONTRACT, so two
  // people on €2000 gross each pay the full 13.78% on all of it while one
  // person on €4000 pays it on €2300 and nothing above. Add the nets together
  // first and invert once, and the household's gross comes out €234 a month
  // short of the contracts they actually signed. Every string below has to keep
  // saying «всеки» / "each", because the numbers depend on it being true.
  earnerAdd: { bg: "+ добави още един доход", en: "+ add another income" },
  earnerLabel: { bg: "Доход {n}", en: "Income {n}" },
  earnerRemove: { bg: "Премахни доход {n}", en: "Remove income {n}" },
  earnerAddHint: {
    bg: "(ако в домакинството влизат две или повече заплати, въведи всяка поотделно)",
    en: "(if two or more wages come into the household, enter each one separately)",
  },
  householdTotal: {
    bg: "общо в домакинството: <b>{s} €</b> нето на месец",
    en: "the household brings home <b>{s} €</b> net a month",
  },
  // The one-line answer under the pay field. Unchanged wording for a single
  // earner — it is the sentence that was already there.
  payGross: {
    bg: "по договор (бруто) това е ≈ {g} € — от тях {i} € осигуровки и {t} € данък, или {r}% удръжки",
    en: "on the contract (gross) that's ≈ {g} € - of which {i} € contributions and {t} € tax, i.e. {r}% deducted",
  },
  payGrossHousehold: {
    bg: "по договорите (бруто) заедно ≈ {g} € — от тях {i} € осигуровки и {t} € данък, или {r}% удръжки общо",
    en: "on the contracts (gross) together ≈ {g} € - of which {i} € contributions and {t} € tax, i.e. {r}% deducted overall",
  },
  // Why the household gross is not what one person on the same take-home would
  // earn. This is the whole reason the incomes are entered separately, and a
  // reader checking our gross against a single-salary calculator will otherwise
  // conclude we are wrong — they will get a smaller number, and it will be the
  // wrong one.
  householdSeparate: {
    bg: "Върху всяка заплата се плащат осигуровки поотделно, до собствения ѝ таван — затова сборът от брутните заплати не е това, което един човек би получавал за същото нето.",
    en: "Each wage is insured separately, up to its own ceiling - so the sum of the gross salaries is not what a single person would be paid for the same take-home.",
  },
  earnerPayslipHead: { bg: "Доход {n} · {s} € нето", en: "Income {n} · {s} € net" },

  // NET OR GROSS
  //
  // The payslip states a net and the contract states a gross, and which of the
  // two a reader knows is not something to guess at. The toggle changes only
  // which one they type: the amounts convert in place, so the number in the box
  // moves and nothing below it does. Everything downstream runs on the net
  // either way (view/payroll.js#netsOf).
  basisNet: { bg: "нето", en: "net" },
  basisGross: { bg: "бруто", en: "gross" },
  basisGroup: { bg: "Каква заплата въвеждаш", en: "Which figure you are entering" },
  basisHint: {
    bg: "Въведи каквото знаеш — чистото, което ти влиза, или брутното от договора. Сметките отдолу са едни и същи.",
    en: "Enter whichever you know - what actually reaches you, or the gross on your contract. The figures below are the same either way.",
  },
  // Both readings, always, so the toggle never leaves the reader wondering
  // which basis the page is in. `payGross` below states the same conversion in
  // a sentence; this is the pair at a glance, next to the field.
  payBothNet: { bg: "{n} € нето · {g} € бруто", en: "{n} € net · {g} € gross" },
  // In gross mode the answer runs the other way: they typed the contract, so
  // the sentence reports what reaches them.
  payNetFromGross: {
    bg: "на ръка (нето) това е ≈ {n} € — удържат се {i} € осигуровки и {t} € данък, или {r}%",
    en: "in hand (net) that's ≈ {n} € - {i} € contributions and {t} € tax are withheld, i.e. {r}%",
  },
  payNetFromGrossHousehold: {
    bg: "на ръка (нето) заедно ≈ {n} € — удържат се {i} € осигуровки и {t} € данък, или {r}% общо",
    en: "in hand (net) together ≈ {n} € - {i} € contributions and {t} € tax withheld, i.e. {r}% overall",
  },
  // The itemised payslip behind the back-computed gross. The one-line summary
  // under the salary input states a gross, a contributions figure and a tax
  // figure; this is the same arithmetic opened out, so a reader can check it
  // against their own payslip line by line instead of taking one number on
  // trust. Rendered from mirror.js#bgPayslipFromNet via view/payroll.js#payslipPanel —
  // every euro below is computed, never written here.
  //
  // Every row is cent-exact and the column balances: the five fund lines sum
  // to the contributions total, and gross − total deductions is the net the
  // reader typed. That is not decoration. The common net→gross failure is to
  // invert without the insurance ceiling and then itemise with it, which
  // prints a gross whose own deduction column pays a different net — €2706.26
  // for €2100 net, off by tens of euros a month, and inside the band where a
  // figure still looks right. The breakdown being auditable is what makes the
  // claim checkable rather than merely stated.
  payslipOpen: { bg: "виж разбивката по пера", en: "show the breakdown, line by line" },
  payslipGross: { bg: "Брутно възнаграждение", en: "Gross pay" },
  payslipBase: { bg: "Осигурителен доход", en: "Insurable income" },
  // Shown only when the gross is over the ceiling, which is the single thing
  // most net→gross calculators get wrong. Naming the figure is what lets a
  // reader see WHY the contributions stopped growing with the salary.
  payslipCap: {
    bg: "таван — осигуровките спират на {cap} €",
    en: "ceiling - contributions stop at {cap} €",
  },
  // The fund's own name, spelled the way the statute that names it spells it:
  // КСО чл. 18 sets out фонд „Пенсии“, and a payslip row is where a reader is
  // most likely to be holding the two side by side.
  payslipPension: { bg: "Фонд „Пенсии“ (ДОО)", en: "State pension fund (1st pillar)" },
  payslipPension2: {
    bg: "Допълнително задължително пенсионно осигуряване (ДЗПО)",
    en: "Supplementary mandatory pension (2nd pillar)",
  },
  payslipSickness: { bg: "Общо заболяване и майчинство", en: "Sickness and maternity" },
  payslipUnemp: { bg: "Безработица", en: "Unemployment" },
  payslipHealth: { bg: "Здравно осигуряване (НЗОК)", en: "Health insurance (NHIF)" },
  payslipInsurance: { bg: "Общо осигурителни вноски", en: "Total social contributions" },
  payslipTaxable: { bg: "Облагаем доход", en: "Taxable income" },
  payslipTax: { bg: "Данък общ доход", en: "Income tax" },
  payslipDeduct: { bg: "Общо удръжки", en: "Total deductions" },
  payslipNet: { bg: "Нетно възнаграждение", en: "Net pay" },
  // The provenance line. The rates are not ours and the reader should not have
  // to take our word for which year they are — docs/principles.md §"Identity", no bluff.
  payslipSource: {
    bg: "Ставки за {year} г., трета категория труд, родени след 1959 г. Осигуровките се смятат до осигурителния таван, данъкът — върху целия облагаем доход.",
    en: "{year} rates, third labour category, born after 1959. Contributions are charged up to the insurance ceiling; the tax is charged on the whole taxable income.",
  },
  raiseLabel: { bg: "Увеличение за 1 година", en: "Raise over 1 year" },
  raiseSince: { bg: "Увеличение от {y}", en: "Raise since {y}" },
  raiseHint: { bg: "(приблизително)", en: "(a rough guess)" },
  // One raise per income, because a household's rise is not one number people
  // share. The combined figure is weighted by what each earner was paid BEFORE
  // — see mirror.js#householdNetRaisePct — and every income has to answer
  // before it can be stated at all: a blank read as 0% is an invented number
  // that drags the household's figure down (P7).
  raiseLabelEarner: {
    bg: "Увеличение за 1 година — доход {n}",
    en: "Raise over 1 year - income {n}",
  },
  raiseSinceEarner: { bg: "Увеличение от {y} — доход {n}", en: "Raise since {y} - income {n}" },
  pocketMissingOne: {
    bg: "Въведи увеличението и за доход {n} — иначе не знаем какво стана с дохода на домакинството.",
    en: "Enter the raise for income {n} too - without it we cannot tell what happened to the household's pay.",
  },
  pocketMissingMany: {
    bg: "Въведи увеличението и за останалите доходи ({n}) — иначе не знаем какво стана с дохода на домакинството.",
    en: "Enter the raise for the other incomes ({n}) too - without them we cannot tell what happened to the household's pay.",
  },
  // The combined figure is not one of the numbers the reader typed, so the row
  // shows the parts it was built from. Without them «на фиш: +9,1%» is a figure
  // nobody entered and nobody can check.
  pocketRaiseParts: { bg: "доход {n}: {r}", en: "income {n}: {r}" },
  pocketCombined: { bg: "общо за домакинството", en: "the household together" },
  // Inline hint under the raise input explaining why we ask for it.
  // Sits below the input box (not in the label) so the field reads
  // as a complete unit like the other inputs. Tells the user the
  // raise is what makes the "in your pocket" verdict meaningful.
  raiseHelp: {
    bg: "помага да разбереш дали изпреварваш инфлацията",
    en: "helps us see if you're outrunning inflation",
  },
  anchor: { bg: "Спрямо кога мериш?", en: "Measured since when?" },
  // Abbreviated because the option renders as `{label} · {yoyWindow}`, and the
  // window — «2025.06 → 2026.06» — is the half that says which months the
  // number covers. Spelled out, the two together overflow the select and the
  // window is what gets clipped.
  anchorY1: { bg: "посл. 12 месеца", en: "last 12 months" },
  // **Both hints describe the WINDOW and neither names the measure**, and the
  // select's position is why. It sits in the results card's heading row, four
  // lines above the headline figure — which is Σ(w·r) over the thirteen
  // divisions and NOT the all-items rate Eurostat publishes: 5,4% against the
  // 4,1% in the banner. A hint reading «официалната инфлация на Евростат» there
  // captions the reconstruction with the name of the other number, and a reader
  // reads the caption nearest the figure. `docs/site.md` §"A correct formula
  // fed the wrong number" #5 is this failure with a month in place of a name.
  //
  // Saying which months are compared is also what the anchor actually chooses,
  // and it is the half that dates the figure (P3). `{latest_month}` is the
  // DIVISIONS' month and never the headline's — during Eurostat's flash the two
  // are a fortnight apart, and `verify_render_basket.mjs` asserts the rendered
  // hint against the payload the page fetched for exactly that reason.
  anchorY1Hint: {
    bg: "(сравнява цените днес с цените отпреди 12 месеца — до {latest_month})",
    en: "(compares today's prices with prices 12 months earlier - to {latest_month})",
  },
  anchorSinceHint: {
    bg: "(сравнява днешните цени с цените в края на избраната година)",
    en: "(compares today's prices with prices at the end of the chosen year)",
  },
  rent: { bg: "Наем на месец", en: "Monthly rent" },
  rentHint: { bg: "(0, ако нямаш)", en: "(0 if none)" },
  cash: { bg: "Спестявания в брой", en: "Cash savings" },
  // No year in this hint: anchoring it to the index base year ages the copy
  // out the day the base moves. State the fact — cash earns nothing.
  cashHint: { bg: "(не носят лихва · 0, ако нямаш)", en: "(earns no interest · 0 if none)" },

  // Home block
  homeHeading: { bg: "Домът", en: "A home" },
  homeToggle: { bg: "гледам жилище за покупка", en: "I'm eyeing a home to buy" },
  homeHint: {
    bg: "включи, ако гледаш — ако вече имаш дом или не търсиш, остави изключено",
    en: "turn on if you're looking - leave off if you already own or aren't shopping",
  },
  // Price source radio, for someone who has already found a home. The
  // default is "from market" — homePrice is the имот.bg median × m². Manual
  // means the user typed the asking price for a specific home; the m² field
  // is still shown because the years-to-buy calc needs it, but it is then
  // decoupled from the price.
  priceModeAuto: { bg: "пазарна цена", en: "market price" },
  priceModeManual: { bg: "ще въведа цена", en: "I'll enter a price" },
  m2Label: { bg: "Квадратура", en: "Size" },
  manualPriceLabel: { bg: "Цена на имота (общо)", en: "Home price (total)" },
  rateLabel: { bg: "Лихва по ипотека", en: "Mortgage rate" },
  termLabel: { bg: "Срок", en: "Term" },
  // The live rate, dated by the reference month it comes from rather than
  // called "current". The README's provenance section makes concrete dates a
  // property of every figure and disclaims the word "current" by name; this
  // line was the one number on the page that said "current" and carried no
  // date of its own — the reference month sat only on the APRC sub-caption
  // below it and in the data panel. {p} is period(mortgageRateData.refPeriod).
  rateDefaultLive: {
    bg: "източник: <b>{src}</b> · {pct}% · {p}",
    en: "source: <b>{src}</b> · {pct}% · {p}",
  },
  // The fallback rate, shown only when mortgage.json did not load. The old
  // wording was "офлайн сенза" / "offline sentinel" — internal vocabulary
  // ("sentinel" is what the code calls the constant) rendered straight at a
  // user, and "сенза" is not a Bulgarian word at all. What a reader needs to
  // know is that this number is a stand-in and why, so the copy says that.
  rateDefaultOffline: {
    bg: "резервна стойност · данните не се заредиха · източник: <b>{src}</b> · {pct}%",
    en: "fallback value · live data didn't load · source: <b>{src}</b> · {pct}%",
  },

  // Sliders / basket
  basketHead: { bg: "За какво отиват парите ти?", en: "Where does your money go?" },
  // The line has to say whose the rows are before it says how to read them.
  // Thirteen rows carrying a name, a rate, a share and a €/month have the same
  // anatomy as the ranked contributions in the results card — name, code, rate,
  // value, bar — and a reader who has met that row as an OUTPUT reads these as
  // one too. A legend that opens by explaining the columns confirms it: it is
  // the app teaching them to read a table one line before they decide it is one.
  basketLegend: {
    bg: "Тринайсетте групи са на Евростат, но числата до тях са твои — всеки ред се мести. До името е поскъпването за избрания период, вдясно — твоят дял и ≈ €/месец.",
    en: "The thirteen groups are Eurostat's, but the numbers beside them are yours - every row moves. By the name, how much it rose over the chosen period; on the right, your share and ≈ €/month.",
  },
  // Shown when home is on. Tells the user why the € column drops after
  // they pick a home: the € per group is carved out of (salary - mortgage)
  // **Both sides carry the currency**, «{mort} €/мес» and "€{mort}/mo". On a
  // page where every other figure carries its unit, a bare number is the one
  // thing a reader has to guess at, and the two languages may not disagree
  // about whether it is there.
  //
  // The `<b>` is in the string rather than spliced round the value at the call
  // site, so the three carve-out lines can share one set of already-formatted
  // arguments and each still bolds the figure ITS sentence is about.
  basketCarved: {
    bg: "Имаш активна вноска <b>{mort}</b> €/мес — сумите вдясно вече са от остатъка след нея. Процентите не се променят.",
    en: "You have a €<b>{mort}</b>/mo mortgage active - the € per group is now carved out of what's left after it. Percentages stay the same.",
  },
  // The rent case mirrors basketCarved, so the €/group tracks the leftover
  // after rent exactly as it does after a mortgage payment.
  rentCarved: {
    bg: "Плащаш наем <b>{rent}</b> €/мес — сумите вдясно вече са от остатъка след него. Процентите не се променят.",
    en: "You pay €<b>{rent}</b>/mo rent - the € per group is now carved out of what's left after it. Percentages stay the same.",
  },
  // **Both at once, and the pair above may not simply stack.** Somebody renting
  // now while pricing a home is who the home block is for, so this is a state
  // the app invites rather than an edge case. Rendered as two sentences, each
  // says the € column is what is left after ITS OWN payment and neither
  // mentions the other, so a reader cannot tell which of three bases the
  // figures are drawn from — after the rent, after the mortgage, or after both.
  // Only the third is true.
  //
  // So the combined figure is named, once, and it is the one bolded: the rent
  // and the payment are on the two controls the reader just used, and the total
  // is the number nothing else on the page has told them yet. It has to be
  // `view/spend.js#housingCarveOut`'s `housingCost` — the same sum the € column is
  // actually carved out of, and the same one the leftover row states one
  // control further down. A sentence adding two figures the reader can also see
  // is a sentence that can disagree with the arithmetic beside it.
  housingCarved: {
    bg: "Плащаш наем {rent} €/мес и вноска {mort} €/мес — общо <b>{total}</b> €/мес за жилище. Сумите вдясно вече са от остатъка след тях. Процентите не се променят.",
    en: "You pay €{rent}/mo rent and a €{mort}/mo mortgage - €<b>{total}</b>/mo for housing in all. The € per group is now carved out of what's left after them. Percentages stay the same.",
  },
  // **The chips name a basket, never a person.** In the first person - «карам
  // кола всеки ден», «пенсионер съм» - five mutually-cancelling buttons are a
  // persona picker, and a persona picker asks which one of these five people
  // you are. A reader who answers that question has answered the wrong one: he
  // concluded the calculator could not represent a man who drives to work AND
  // feeds a family, because the row he was reading only lets one be true. The
  // thirteen sliders are where a mixed life is described, so nothing here may
  // sound like a claim about the reader.
  presetOfficial: { bg: "официалната кошница", en: "official basket" },
  presetDriver: { bg: "с кола всеки ден", en: "a car every day" },
  presetFamily: { bg: "със семейство", en: "with a family" },
  presetNoCar: { bg: "без кола", en: "no car" },
  presetPensioner: { bg: "на пенсия", en: "on a pension" },
  presetsOr: { bg: "или", en: "or" },
  // Names the row for a screen reader, which otherwise meets five unexplained
  // buttons after the thirteen sliders.
  presetsAria: { bg: "готови кошници", en: "ready-made baskets" },
  // Labels the row AND carries its provenance, because the four are invented
  // and the number they produce is read in the same voice as a Eurostat figure
  // (P3, P7). It states what the baskets are; what to do with the sliders is
  // the interface's job, not a sentence's - two sentences already tried and
  // lost to a chip row that looked like the answer.
  presetsHint: {
    bg: "Готови кошници, ако ти е по-лесно да тръгнеш от нещо: четирите са наши, измислени за пример, а „официалната кошница“ е на Евростат.",
    en: 'Ready-made baskets, if it helps to start from something: the four are ours, invented as illustrations, and the "official basket" is Eurostat\'s.',
  },
  // Shown in the RESULTS card while a hand-made preset is active. The hint
  // above sits by the chips, but the number it produces ends up 400 px away in
  // the page's headline, in the same voice as the Eurostat figures. A derived
  // figure inherits the obligation to say where it came from (docs/principles.md P3), so
  // the caveat travels with it.
  presetActive: {
    bg: "Числото е сметнато по готовата кошница „{p}“ — тя е измислена от нас за пример, не е измерена. Дръпни плъзгачите към своите разходи, за да стане твое.",
    en: 'This is computed from the ready-made "{p}" basket - our illustration, not a measured one. Drag the sliders to your own spending to make it yours.',
  },
  // The same caveat for the basket EVERY reader starts on, and it was the one
  // basket without one. `presetActive` covers the four we invented; the
  // official weights are real published data, so nothing here may call them an
  // illustration (`verify_copy.mjs` holds that from the other side by refusing
  // "official" a place in PRESET_LABEL_KEY). What is wrong with them is not
  // their provenance but whose they are.
  //
  // Measured, before this existed: a reader who typed a salary and nothing
  // else met «5,4% твоята инфлация», a bar labelled «твоята кошница» at 5,4%
  // and a second labelled «средностатистическата кошница» at 5,4%, both fills
  // 191px wide, under «Кошницата ти е близо до средностатистическата.» Every
  // figure was Eurostat's own and the sentence over them reported a
  // coincidence as a finding — the card comparing the official basket with
  // itself and calling the result a verdict.
  //
  // It says whose the number is and what would make it theirs, and stops
  // there. The basket is not wrong: it is the country's answer to a question
  // the reader has not answered yet, which is the only defensible thing to
  // stand on before they do (docs/principles.md P7).
  officialBasketActive: {
    bg: "Числото е сметнато по официалната кошница на Евростат — средното за България, не твоето. Дръпни плъзгачите към своите разходи, за да стане твое.",
    en: "This is computed from Eurostat's official basket - the average for Bulgaria, not yours. Drag the sliders to your own spending to make it yours.",
  },
  // The route to the sliders, and it is the whole reason the sentence above is
  // actionable. Measured at 360px: the headline sits at y=1,007 and the basket
  // heading at y=4,675 — 3,668px, 4.7 screens, past the entire receipt, the
  // област picker, rent, savings and the mortgage block. A caveat naming a
  // control that far away is a caveat with no second half.
  officialBasketCta: { bg: "Опиши разходите си", en: "Describe your spending" },

  // Input mode: percentage shares vs actual euros per month
  modePct: { bg: "дял в %", en: "share in %" },
  modeEur: { bg: "€ на месец", en: "€ per month" },
  // The third sentence is load-bearing and belongs to both halves of the
  // toggle. Naming only «€ на месец» made not-placing-everything read as a
  // property of one entry mode, so a reader in the other one - which is the one
  // everybody starts in - had no reason to look for it. Each mode reaches it
  // differently: the € tally measures what is left off thirteen typed amounts,
  // the share control states it in one number.
  modeHint: {
    bg: "Повечето хора знаят по-добре колко харчат в евро, отколкото в проценти. Избери както ти е удобно — сметката е същата. И по двата начина не е нужно да разпределиш цялата заплата.",
    en: "Most people know their euros better than their percentages. Pick whichever suits you - the maths is identical. Neither way asks you to place your whole pay.",
  },
  // ---- How much of the pay is spent at all --------------------------------
  // Share mode carries no size, only a division, so the app has to assume how
  // big the pot is - and it assumed the whole pay packet, silently, of every
  // reader who never found the € mode. This control is that assumption written
  // out as a claim the reader can disagree with, which is why the sentence is
  // in the first person and states a figure rather than asking for one.
  //
  // Two variants, on `housingCost > 0`, for the reason `leftLead*` below has
  // them: the base is `spendable`, which is the household's net pay MINUS any
  // rent or mortgage the reader entered. Naming the net pay alone is exact for
  // the reader who entered no housing and overstates the base by the whole
  // housing payment for the one who did — «100% от чистия си доход» over a
  // €1,500 net with €450 of rent claims €1,500 where the arithmetic uses
  // €1,050. Naming neither leaves «това, което ми остава»: true in both cases
  // and concrete in neither, which is the wording this replaced. So the
  // sentence states the net pay and adds the carve-out only where there is one
  // to add, and `verify_copy.mjs` pins both halves of that rule.
  spendShareLeadNoHousing: {
    bg: "Харча ≈ <b>{p}%</b> от чистия си доход",
    en: "I actually spend ≈ <b>{p}%</b> of my take-home pay",
  },
  spendShareLeadWithHousing: {
    bg: "Харча ≈ <b>{p}%</b> от чистия си доход след <b>€{h}</b> за жилище",
    en: "I actually spend ≈ <b>{p}%</b> of my take-home pay after the <b>€{h}</b> for housing",
  },
  spendShareAria: {
    bg: "дял от парите, които наистина харчиш",
    en: "share of your money you actually spend",
  },

  // ---- What a slider says out loud ----------------------------------------
  // A range input hands a screen reader its raw `value` and nothing else, and
  // every rail in the basket carries a number whose unit is written somewhere
  // else on the row: a division at 22 per cent and a group at 22 euros are
  // announced identically, so the unit the %/€ toggle exists to switch is the
  // one thing that is never spoken. These are the `aria-valuetext` of each, and
  // each says the same figure the row prints beside the rail.
  //
  // **Every number in them arrives through `format.js#integer`**, the formatter
  // the visible row uses. A slider announcing "22.0" over a row printing «22»
  // is one figure with two spellings, and the one a reader can check is the one
  // they cannot see.
  //
  // «около», never «≈»: a screen reader reads the symbol out as "almost equal
  // to" or skips it altogether, and neither is a word the sentence needs.
  //
  // The two spend-share variants split on housing for the reason
  // `spendShareLead*` above does — `spendable` is the net pay MINUS any rent or
  // mortgage, so naming the pay alone claims a base €450 larger than the one
  // the arithmetic used, and an announcement is the whole of what that reader
  // gets.
  spendShareValueNoHousing: {
    bg: "{p}% от чистия доход",
    en: "{p}% of take-home pay",
  },
  spendShareValueWithHousing: {
    bg: "{p}% от чистия доход след €{h} за жилище",
    en: "{p}% of take-home pay after the €{h} for housing",
  },
  divisionValue: {
    bg: "{p}% от кошницата, около €{e} на месец",
    en: "{p}% of the basket, about €{e} a month",
  },
  divisionValueNoEuro: {
    bg: "{p}% от кошницата",
    en: "{p}% of the basket",
  },
  // The group rail is the one whose bare number misleads most: its maximum is
  // its own division's weight, so 22 there is 22 of something the reader has to
  // have seen to know the size of. Naming the division is what turns it back
  // into a share.
  groupValue: {
    bg: "{p}% от {d}, около €{e} на месец",
    en: "{p}% of {d}, about €{e} a month",
  },
  groupValueNoEuro: {
    bg: "{p}% от {d}",
    en: "{p}% of {d}",
  },
  // Shown in € mode: how much of their take-home they have placed so far.
  // **A statement of what they have done, in both languages, never an
  // imperative.** «разпредели …» reads as an instruction to keep going until
  // the basket has swallowed the whole salary, which is the one thing the €
  // mode exists not to require.
  modeEurTally: {
    bg: "разпределил си <b>€{a}</b> от <b>€{s}</b> на месец",
    en: "you've placed <b>€{a}</b> of <b>€{s}</b> a month",
  },
  modeEurLeft: {
    bg: "<b>€{r}</b> остават извън кошницата",
    en: "<b>€{r}</b> stays outside the basket",
  },
  modeEurOver: { bg: "с <b>€{r}</b> над заплатата ти", en: "<b>€{r}</b> more than your pay" },

  // ---- What is NOT in the basket -----------------------------------------
  // The row that keeps the calculator from insisting the whole pay packet be
  // spent. It states the size of what is left unplaced, the year it adds up
  // to, and what prices do to money held as cash — three measurements. It does
  // not tell anyone to save or to invest: "you should put this in an index
  // fund" is advice, which docs/principles.md P6 closes. The strongest honest
  // form is a comparison plus a number, which is what `leftCash`'s second
  // sentence is.
  leftK: { bg: "Неразпределени", en: "Not placed" },
  // The LeftoverRow picks one of two variants of the lead sentence depending
  // on whether housing is in the base: when `housingCost > 0`, the
  // denominator (`spendable`) is take-home minus what the reader said goes
  // to housing, and naming the amount makes the math legible. When it's
  // zero, "what's left of your take-home" is the honest description — the
  // older "after housing" phrasing read as a lie to anyone who never
  // entered any housing (verify_copy pins both rules).
  leftLeadNoHousing: {
    bg: "<b>€{m}</b> на месец остават извън кошницата ти — <b>{p}%</b> от парите, които ти остават. Не е нужно да разпределиш всичко: числото ти е сметнато върху това, което наистина харчиш.",
    en: "<b>€{m}</b> a month stays outside your basket - <b>{p}%</b> of what's left of your take-home. You don't have to place all of it: your number is worked out on what you actually spend.",
  },
  leftLeadWithHousing: {
    bg: "<b>€{m}</b> на месец остават извън кошницата ти — <b>{p}%</b> от парите, които ти остават след <b>€{h}</b> за жилище. Не е нужно да разпределиш всичко: числото ти е сметнато върху това, което наистина харчиш.",
    en: "<b>€{m}</b> a month stays outside your basket - <b>{p}%</b> of what's left of your take-home after the <b>€{h}</b> you said goes to housing. You don't have to place all of it: your number is worked out on what you actually spend.",
  },
  leftYear: {
    bg: "Ако това се повтаря всеки месец, за година са <b>€{y}</b>.",
    en: "If that repeats every month, it comes to <b>€{y}</b> over a year.",
  },
  leftCash: {
    bg: "Оставени в брой, при инфлация {i}% те биха купували с <b>€{e}</b> по-малко след година — колкото <b>€{v}</b> днес. Ако ги вложиш някъде и ти носят по-малко от {i}% на година, пак изостават от цените, само по-бавно.",
    en: "Kept as cash at {i}% inflation, that money would buy <b>€{e}</b> less in a year - as much as <b>€{v}</b> buys today. Put somewhere that pays less than {i}% a year, it still trails prices, just more slowly.",
  },
  leftAssume: {
    bg: "допускане: цените се движат следващата година както през последната. Това е сметка, не прогноза — Евростат не прогнозира.",
    en: "assumption: prices move over the next year as they did over the last. This is arithmetic, not a forecast - Eurostat does not publish one.",
  },
  // Same two-variant pattern as `leftLead*`: the over-budget branch fires
  // regardless of whether the home block is on, and the wording must hold in
  // both cases.
  leftOverNoHousing: {
    bg: "Разпределил си <b>€{m}</b> повече от парите, които ти остават. Числото ти е сметнато точно върху въведеното — провери дали някъде не си сложил повече, отколкото даваш.",
    en: "You've placed <b>€{m}</b> more than you have left. Your number is worked out on exactly what you entered - worth checking whether one of the rows is bigger than what you really pay.",
  },
  leftOverWithHousing: {
    bg: "Разпределил си <b>€{m}</b> повече от парите, които ти остават след <b>€{h}</b> за жилище. Числото ти е сметнато точно върху въведеното — провери дали някъде не си сложил повече, отколкото даваш.",
    en: "You've placed <b>€{m}</b> more than you have left after the <b>€{h}</b> you said goes to housing. Your number is worked out on exactly what you entered - worth checking whether one of the rows is bigger than what you really pay.",
  },

  // Drill-down into ECOICOP groups
  detailToggle: { bg: "покажи по-подробно", en: "show more detail" },
  detailHint: {
    bg: "Всяка група се разпъва на подгрупи — например транспортът се дели на кола, гориво и билети. Отвориш ли я, числото не се променя; променя се само ако преместиш нещо вътре.",
    en: "Each group opens into sub-groups - transport splits into buying a car, running it, and tickets. Opening one changes nothing; only moving something inside does.",
  },
  detailOpen: { bg: "разпъни", en: "expand" },
  detailClose: { bg: "затвори", en: "collapse" },
  detailEdited: { bg: "по твоето разпределение", en: "your own split" },
  detailReset: { bg: "върни официалното", en: "reset to official" },

  // Ranked contribution view
  rankHead: { bg: "Кое качва точно твоето число?", en: "What's pushing your number up?" },
  rankLead: {
    bg: "Всяка група добавя своя дял към твоите {pi}%. Сборът им е точно твоето число.",
    en: "Each group adds its share to your {pi}%. They add up to exactly your number.",
  },
  rankPp: { bg: "пункта", en: "points" },
  // The per-row plain-language line. {s} spend, {r} rise, {e} what it costs.
  rankRow: {
    bg: "даваш ≈ <b>€{s}</b>/мес · поскъпна с <b>{r}%</b> · това ти струва ≈ <b>€{e}</b> повече на месец",
    en: "you spend ≈ <b>€{s}</b>/mo · it rose <b>{r}%</b> · that costs you ≈ <b>€{e}</b> more a month",
  },
  rankRowNoPay: {
    bg: "поскъпна с <b>{r}%</b> · твоят дял е <b>{w}%</b>",
    en: "it rose <b>{r}%</b> · your share of it is <b>{w}%</b>",
  },
  rankFalling: {
    bg: "поевтиня — тегли числото ти надолу",
    en: "got cheaper - pulling your number down",
  },
  // The tail of the list. Only the eight biggest rows are drawn, but
  // `rankLead` promises the rows add up to exactly the user's number — so the
  // remainder has to be on screen or the promise is false for anyone who
  // checks it with a calculator. {n} groups, {pp} their combined points.
  // The accessible name for a ranked row's own name, which is a control: a
  // screen reader otherwise meets «Транспорт и гориво, бутон» beside a link to
  // Eurostat and has no way to tell the two destinations apart.
  rankToRow: { bg: "Към „{c}“ в кошницата", en: 'Go to "{c}" in the basket' },
  rankRest: {
    bg: "останалите {n} групи заедно · {pp} пункта",
    en: "the other {n} groups together · {pp} points",
  },
  // The control that unfolds the rest of the table where it was capped for
  // width. It names the full count rather than saying «повече», so the reader
  // knows the size of what they are opening before they open it — thirteen
  // rows is a different decision from three.
  rankShowAll: { bg: "покажи всички {n} групи", en: "show all {n} groups" },
  rankShowFewer: { bg: "покажи по-малко", en: "show fewer" },
  rankNoSalary: {
    bg: "въведи заплата горе, за да видиш и в евро",
    en: "enter your pay above to see this in euros too",
  },
  // Results card
  yourReal: { bg: "Твоето реално", en: "Your real picture" },
  // What the card says while the salary is still the €900 placeholder.
  //
  // Two jobs, and it exists because of the distance between the field and the
  // figures priced off it. On a 360px phone the pay card is first, the results
  // card second and the rest of the inputs third (`card.css`, `.m-pay` /
  // `.m-results` / `.m-inputs`), which puts the salary input at y=481 and this
  // note at y=1053 — a screen and a half apart, with «числото е просто начална
  // стойност» left behind at the field. A caveat that far from its number is
  // not a caveat. So it is repeated here, where the figure is, and it names the
  // amount rather than describing it: a reader who scrolled past «€900» in the
  // field can match the two.
  //
  // It says «не с твоята» and stops. The card is not wrong — it is a worked
  // example, which is the point of having a default at all — and calling it
  // wrong would teach the reader to distrust figures that are about to become
  // theirs. Naming whose money it is does the whole job.
  startingSalary: {
    bg: "Сметнато е с начална заплата €{s} на месец — не с твоята.",
    en: "Computed with a starting pay of €{s} a month - not yours.",
  },
  // The button beside it. It focuses `#inSalary` rather than merely scrolling,
  // which on a phone raises the keyboard — so the one tap leaves the reader
  // able to type instead of hunting for a field a screen and a half back up.
  startingSalaryCta: { bg: "Въведи своята заплата", en: "Enter your own pay" },
  yourBasket: { bg: "твоята кошница", en: "your basket" },
  // **The route from the two rates to where they are reconciled, and it states
  // no figure of its own.** The banner's official rate and the average-basket
  // bar are visible together on a 1100×1000 screen, they differ for two
  // compounding reasons — July against June, and Σ(w·r) against the
  // chain-linked all-items — and the explainer answers it well about 3,000px
  // down, inside a closed disclosure. A reader who has already concluded one
  // of the two is wrong does not open that.
  //
  // A question rather than a claim, because the alternative is restating the
  // reconciliation beside the bars, and that puts a third rate on the card —
  // `docs/principles.md` closes a second headline number, and the verdict
  // under the bars is deliberately figure-free for the same reason.
  //
  // **No size in it.** «малко различно» is true of a tenth or two and false
  // during Eurostat's flash, when the two are a month apart and the gap is
  // several times that — which is exactly when a reader stops to ask.
  explainGapRoute: {
    bg: "защо официалното число горе не е същото",
    en: "why the official figure up top isn't the same",
  },
  // The basket-weighted number using official weights was once called
  // "официалната кошница" (the official basket), which users misread as the
  // all-items headline. Renamed to "средностатистическата кошница" (the
  // average Bulgarian's basket) so the label matches what the number is.
  // The verdict card compares the user's basket to this average — "are you
  // close to the average Bulgarian?" — the question the user can answer.
  averageBasket: { bg: "средностатистическата кошница", en: "the average basket" },

  // ---------------------------------------------------------------------
  // THE PLAIN ANSWER — the three things a reader arrives asking, said once
  // in ordinary words before the receipt starts.
  //
  // Every figure in this block is already computed and already on the page,
  // in the pocket row, the ladder row and the ranked list. What it buys is
  // WHERE: on a 390px phone those three rows begin 2,000px, 2,300px and
  // 1,400px down, so a reader who scrolls two screens has met the headline
  // percentage and none of the answers it implies.
  //
  // Two of the four lines refuse to compute — `answerPayAsk` and
  // `answerStandAsk` — and the refusals are the point rather than a fallback.
  // The ladder ranks the READER in the second person, so stating a position
  // for the €900 placeholder tells a visitor something false about
  // themselves before they have typed anything (the rule `PercentileRow`
  // keeps, and this block sits a screen above it).
  //
  // `answerStandOne` and `answerStandMany` carry «приблизително, не точно» in
  // the sentence itself. The full caveat — which survey, which year, who it
  // leaves out, that Sofia flatters — stays where it is, unfolded, one screen
  // below. What may not happen is the rank travelling to the top of the card
  // with nothing attached: this is the same figure that row refuses to print
  // in its corner without its sentence.
  answerLead: {
    bg: "Ето какво значи <b>{pi}</b> за теб:",
    en: "Here is what <b>{pi}</b> means for you:",
  },
  answerPayAhead: {
    bg: "Увеличението ти изпреварва твоите цени с <b>{p}%</b>.",
    en: "Your raise is ahead of your prices by <b>{p}%</b>.",
  },
  answerPayBehind: {
    bg: "Увеличението ти изостава от твоите цени с <b>{p}%</b>.",
    en: "Your raise falls short of your prices by <b>{p}%</b>.",
  },
  // One line for all three insides of the ±1 pp dead zone. The row below
  // separates them, because there it sits beside the signed figure and
  // «точно» would be false for two of the three; up here there is no figure
  // beside it to contradict.
  answerPayLevel: {
    bg: "Увеличението ти и твоите цени вървят наравно.",
    en: "Your raise and your prices are running level.",
  },
  answerPayNone: {
    bg: "Заплатата ти е стояла на място.",
    en: "Your pay has stood still.",
  },
  answerPayCut: {
    bg: "Заплатата ти е намаляла.",
    en: "Your pay went down.",
  },
  answerPayAsk: {
    bg: "Кажи колко ти вдигнаха заплатата, за да видиш дали изпреварваш цените си.",
    en: "Say what your raise was, to see whether you are outrunning your prices.",
  },
  answerStandOne: {
    bg: "По чиста заплата си пред <b>{r}%</b> от работещите в страната — приблизително, не точно.",
    en: "By take-home pay you are ahead of <b>{r}%</b> of earners in the country - roughly, not exactly.",
  },
  // The household form states a range and says why it is one: the rungs are
  // individual earnings, so two wages of €900 are two people at the 34th
  // percentile rather than one person at the 78th.
  answerStandMany: {
    bg: "Заплатите в домакинството са пред <b>{low}%</b> до <b>{high}%</b> от работещите в страната — всяка поотделно, приблизително.",
    en: "The household's wages are ahead of <b>{low}%</b> to <b>{high}%</b> of earners in the country - each on its own, roughly.",
  },
  answerStandAsk: {
    bg: "Въведи своята заплата, за да видиш къде си спрямо останалите.",
    en: "Enter your own pay to see where you sit against everyone else.",
  },
  // The two movers carry a category name, which is published data rather than
  // copy — so these render as text and carry no markup of their own. A name
  // interpolated into an {@html} template is a fetched string reaching the DOM
  // as markup, which is the one thing verify_template_safety.mjs is for.
  answerMoverUp: {
    bg: "Най-бързо поскъпва: {name} ({r}%).",
    en: "Rising fastest: {name} ({r}%).",
  },
  answerMoverDown: {
    bg: "Поевтинява: {name} ({r}%).",
    en: "Getting cheaper: {name} ({r}%).",
  },

  // ---------------------------------------------------------------------
  // The labels on the "one tap further in" controls inside the receipt rows.
  // Each names what is behind it rather than the act of opening it: a reader
  // decides whether to tap on the strength of what they would get.
  discloseByEarner: { bg: "по доход", en: "income by income" },
  discloseWedgeWhy: { bg: "защо делът пада", en: "why the share falls" },
  discloseRankWhy: { bg: "покажи защо", en: "show why" },
  discloseRankWhyHide: { bg: "скрий защо", en: "hide why" },
  discloseLeftYear: { bg: "за година, и в брой", en: "over a year, and as cash" },
  discloseAfford: { bg: "какво можеш да си позволиш", en: "what you could afford" },

  // Rows
  pocket: { bg: "в джоба", en: "in your pocket" },
  // The verdict, one line per state the row can actually be in. The old set
  // had three and the middle one said «увеличението ТОЧНО покрива твоите
  // цени» for anything inside ±1 pp — so a screen reading «−0,3%» claimed to
  // be exact, next to a minus sign the reader can see. The ±1 dead zone is
  // right (without it the verdict flips on rounding noise); the word «точно»
  // inside it was not. It now belongs to the one case that earns it, and the
  // near-zero band says which side of the line it is on.
  pocketOk: { bg: "Изпреварваш собствените си цени.", en: "You are outrunning your own prices." },
  pocketBad: {
    bg: "Увеличението е изядено — твоите цени тичат по-бързо.",
    en: "The raise has been eaten - your prices run faster.",
  },
  pocketZero: {
    bg: "Точно на нула: увеличението ти покрива твоите цени.",
    en: "Exactly level: your raise covers your prices.",
  },
  pocketNearUp: {
    bg: "Почти на нула — увеличението ти изпреварва твоите цени с мъничко.",
    en: "Practically level - your raise is a touch ahead of your prices.",
  },
  pocketNearDn: {
    bg: "Почти на нула — увеличението ти изостава мъничко от твоите цени.",
    en: "Practically level - your raise falls a touch short of your prices.",
  },
  // NO raise is the most common state of all — and «увеличението е изядено»
  // was being told to people who never got one. The money clause after it
  // carries the consequence, so this sentence only has to state the fact.
  pocketNone: { bg: "Нямаш увеличение.", en: "You had no raise." },
  // A pay CUT is typeable (the field takes any number, and people do move to
  // a worse-paid job). «Увеличението е изядено» is the wrong sentence for it
  // too: there was no raise to eat.
  pocketCut: {
    bg: "Заплатата ти е намаляла, не се е вдигнала.",
    en: "Your pay went down, not up.",
  },
  // The percentage in money, appended to the verdict — this was the only row
  // on the card that never landed in euro, and «−0,3%» is an abstraction
  // where «≈ €6 на месец» is a fact about the reader's month. Dropped when it
  // rounds to zero rather than printed as «≈ €0». Sign and amount come from
  // mirror.js#pocketPerMonth.
  pocketMoneyUp: {
    bg: "Заплатата ти купува с ≈ <b>€{m}</b> повече всеки месец.",
    en: "Your pay buys about <b>€{m}</b> more every month.",
  },
  pocketMoneyDn: {
    bg: "Заплатата ти купува с ≈ <b>€{m}</b> по-малко всеки месец.",
    en: "Your pay buys about <b>€{m}</b> less every month.",
  },
  pctK: { bg: "къде си по заплата", en: "where you stand" },
  // The row's empty state, and it now covers the untouched placeholder as well
  // as an empty field — see PercentileRow.
  //
  // It names no direction, and that is the point rather than an omission. This
  // row sits well down the results card, and where the field is relative to it
  // depends on the layout: beside it in the left column on a desktop, a long
  // way back up on a phone. A prompt that points the wrong way is worse than
  // one that points nowhere, and nothing here needs to point at all — the
  // button under the headline figure is what carries the reader to the field,
  // and it focuses it rather than merely scrolling to it.
  pctNoSalary: {
    bg: "Въведи своята заплата, за да видиш къде си.",
    en: "Enter your own pay to see where you sit.",
  },
  // Phrased from the BOTTOM ("ahead of {r}%"), NOT "top {n}%". "Top 63%" for
  // a below-median pay reads as an achievement when it isn't. {r} is the rank
  // from the bottom (mirror.js percentile), so higher pay → bigger number →
  // honest and monotonic. The comparator is INDIVIDUAL NET PAY across the
  // country: Eurostat's SES gross-earnings distribution (earn_ses_monthly)
  // re-levelled onto НСИ's national all-activities average and converted to net
  // — the same unit as the input. {m} is the net median (ladder[5]), already
  // monthly (no ÷12).
  pctTopTxt: {
    bg: "По нетна заплата изпреварваш <b>{r}%</b> от работещите в страната. Медианната нетна заплата е <b>€{m}/мес</b>.",
    en: "By net pay you're ahead of <b>{r}%</b> of earners in the country - the median net pay is <b>€{m}/mo</b>.",
  },
  // With several incomes the sentence stops being second person, because the
  // ladder ranks PEOPLE. «Изпреварвате 61%» addressed to a household is a claim
  // about a person who does not exist: the rungs are individual full-time
  // earnings, and a household total read off them is the unit mismatch that
  // once put every Sofia salary in the 99th percentile. So each income gets its
  // own line and the median is stated once underneath.
  pctEarnerLine: {
    bg: "Доход {n} — <b>€{s}</b> — изпреварва <b>{r}%</b> от работещите в страната.",
    en: "Income {n} - <b>€{s}</b> - is ahead of <b>{r}%</b> of earners in the country.",
  },
  pctMedian: {
    bg: "Медианната нетна заплата в страната е <b>€{m}/мес</b>.",
    en: "The median net pay in the country is <b>€{m}/mo</b>.",
  },
  pctHouseholdNote: {
    bg: "Класираме всяка заплата поотделно — подредбата показва какво изкарват отделните хора, а не домакинствата. Две заплати по €900 не са един човек с €1800.",
    en: "Each wage is ranked on its own - the ladder is what individual people earn, not what households do. Two wages of €900 are not one person on €1,800.",
  },
  // The comparison is net-vs-net (individual), so it's a direct rank, not a
  // cross-unit approximation. The remaining caveat: the distribution SHAPE is
  // from the 4-yearly Eurostat earnings survey, re-levelled onto НСИ's newest
  // national average — the level is live, the spread is modelled.
  // "Ориентир, не присъда" was a word-for-word calque of "a guide, not a
  // verdict". «Присъда» in Bulgarian is what a court hands down; nobody says it
  // about a number, and the sentence read as translated English. The same goes
  // for «формата на разпределението, изравнена към…» — correct statistics,
  // unreadable to the person the page is for. Say what the number is worth in
  // the words someone would use out loud.
  //
  // **«нагласяваме» is out of bounds anywhere near a figure.** In everyday
  // Bulgarian «нагласен» is what a rigged match or a fixed election is, so a
  // sentence saying we «нагласяваме» the amounts hands a suspicious reader the
  // exact word they are looking for — on the card whose job is to admit how
  // the number is built. «преизчисляваме» states the same operation and
  // carries no such reading. It binds every place that describes the
  // re-levelling: the explainer band, `legal.js` and the two READMEs.
  // **Both halves are the country's, and the sentence has to say so**, because
  // the picker two cards up moves other figures by область and this one it
  // does not. A reader who has just told the page where they live will read
  // any rank on it as local unless told otherwise — and in Благоевград, whose
  // average is half София's, that reading is out by tens of percentile points
  // in the direction that flatters nobody.
  //
  // **What may not be said is that the ladder is their област's**, and no
  // wording gets around it: nobody publishes a pay distribution below the
  // national level for Bulgaria, at any vintage, from any publisher
  // (`docs/data-sources.md` §"Salary distribution"). So the limit is named
  // instead of hidden — P11, a figure nobody publishes is uncomputed rather
  // than concealed.
  //
  // **Where the LEVEL comes from is `pctSrc`'s to say, not this sentence's.**
  // «нивото е от НСИ · средна заплата {anchorPeriod}» is the line directly
  // under this one, it carries the link that evidences the claim and the
  // quarter the claim is dated by, and a prose copy of it here is the same
  // admission twice on one card — two strings to keep in step, and 14 words
  // of a caveat a reader has to finish for any of it to protect them.
  // Said in the words for a gap between wages, not in the words for a
  // statistical dispersion, for the same reason «нагласяваме» is out of bounds
  // below: this is the one card whose job is admitting how the number is made,
  // and it fails if the admission needs a statistician to parse.
  //
  // **The survey year is a slot, not a literal.** SES runs every four years, and
  // the sentence beside it — `pctSrc`, two lines down the same card — reads the
  // year out of `salary_dist.json`. A year typed into the prose is a year that
  // keeps saying the old round after the payload has moved to the next one, on
  // the card whose whole claim is that it tells you what the figure is built
  // from. Nothing on this page may state a date the data does not.
  // **The two halves do not cover the same people, and the card has to say so.**
  // The shape is SES: full-time employees, firms of ten or more, NACE B–S
  // excluding O. The level it is scaled onto is НСИ's all-activities average —
  // every firm size, public administration and agriculture included. A scalar
  // re-level fixes the MEAN of the two by construction, so the level mismatch
  // costs nothing; what is left is whether the wider group's pay is spread the
  // same way, and no publisher measures that. SES carries no firm-size
  // dimension for BG at any vintage, and neither section A nor section O is a
  // category in the cube at any vintage, so the gap cannot be closed and cannot
  // be signed: including firms under ten would widen the bottom, including
  // section O would probably narrow it — at the 2018 vintage, the one where BG
  // still carries activity groupings, D9/D1 runs 2.71 for education-health-arts
  // against 5.18 for business services. That is P11 — uncomputed and said out
  // loud, never quietly corrected by a factor nobody publishes.
  pctCaveat: {
    bg: "Сравняваме всяка чиста заплата с това, което изкарват работещите в цялата страна. Кой колко изкарва знаем от изследване на Евростат от {shapeYear} г. (само хора на пълен работен ден, само във фирми с поне 10 души, без държавната администрация), а нивото е днешната средна заплата за страната — а тя е за всички наети, включително в малките фирми, в администрацията и в земеделието. Двете не са едни и същи хора, а как са разпределени заплатите в по-широката група никой не мери, така че колко мести това подредбата не може да се пресметне. Затова числото показва приблизително къде си, а не точно. Подредбата не се мести и с това къде живееш — никой не публикува как са разпределени заплатите вътре в една област — така че там, където заплатите са по-ниски, същата заплата те нарежда по-нагоре, отколкото пише тук.",
    en: "We compare each take-home pay with what people earn across the whole country. Who earns what comes from a {shapeYear} Eurostat survey (full-time employees only, in firms with 10 or more staff, public administration excluded), and the level is today's average wage for the country — which covers every employee, small firms, public administration and agriculture included. The two are not the same people, and nobody measures how pay is spread across the wider group, so how far that moves the ranking cannot be worked out. So the figure shows roughly where you stand, not exactly. The ranking does not move with where you live either — nobody publishes how pay is spread inside one oblast — so where wages are lower the same pay places you higher than it says here.",
  },
  // Per-card source citation — same "every figure carries a link (↗)" contract
  // as the Eurostat basket / imot.bg / NSI cards. Two sources: the SHAPE
  // (Eurostat SES) and the LEVEL (NSI Sofia wage). {shapeUrl}/{shapeYear} come
  // from salary_dist.json's own `shape` block; {anchorUrl}/{anchorPeriod} come
  // from the НСИ payload, because each publisher's provenance has to travel
  // in that publisher's own payload — copying НСИ's into salary_dist.json is
  // what would make one file a composite of two publishers.
  // Rendered with {@html} because it carries links.
  //
  // The level is НСИ's own published quarterly average, selected by
  // view/region.js#regionQuarter — so this line attributes it to them without
  // qualification, which is only true while nothing here averages anything.
  pctSrc: {
    bg: 'източник: <a href="{shapeUrl}" target="_blank" rel="noopener">Евростат · структура на заплатите {shapeYear}</a> · нивото е от <a href="{anchorUrl}" target="_blank" rel="noopener">НСИ · средна заплата {anchorPeriod}</a>',
    en: 'source: <a href="{shapeUrl}" target="_blank" rel="noopener">Eurostat · earnings structure {shapeYear}</a> · level from <a href="{anchorUrl}" target="_blank" rel="noopener">NSI · average wage {anchorPeriod}</a>',
  },
  // ---------------------------------------------------------------------
  // THE TAX WEDGE — the tax wedge, and the framing rule applies to
  // every sentence here. The claim is "this is computable from the official
  // data and nobody has computed it for you", NEVER "they hide it". Both
  // inputs are published by the state: НАП publishes the rates, the ceiling
  // is in the budget act, and `payroll.json` carries both with their date.
  //
  // {gross} the user's gross, back-computed from the net they typed ·
  // {eff} effective rate on the whole salary · {cap} the maximum insurable
  // income · {peak} the effective rate at the cap.
  //
  // WORDING. Every marginal-rate sentence — and the chart's own key — says
  // «от увеличението» / "of a raise", never «върху следващото евро» / "on the
  // next euro". The latter is the textbook phrase and it is exactly what the
  // dashed curve plots, but "the next euro" is an economist's abstraction: a
  // reader does not experience euros arriving one at a time. What actually
  // happens to a person is a RAISE. Same number, same curve, a situation the
  // reader has lived through.
  // ---------------------------------------------------------------------
  // The label names the reader's question, not the economics. «Плоският
  // данък» is a concept somebody has to already hold to know why the row is
  // there; «колко не стига до теб» is what they were wondering. The row's own
  // sentences still say «плосък» — the finding is that the flat tax is not the
  // whole story — so nothing is lost by keeping the term out of the label.
  wedgeK: { bg: "колко не стига до теб", en: "how much never reaches you" },
  // Shown when the user has typed a salary and is BELOW the ceiling.
  // Below the ceiling the effective and the marginal rate are the SAME number
  // — provably, since insurance scales with gross there — so the sentence says
  // so rather than printing {eff} twice and reading like a bug.
  //
  // The user typed a NET salary, so the sentence opens with the gross it was
  // back-computed from: without it, "{eff}% of your gross" is a percentage of
  // a number the reader never entered and cannot see.
  wedgeUnder: {
    bg: "Заплатата ти преди удръжките (бруто) е ≈ <b>€{gross}</b>. От нея <b>{eff}%</b> отиват за осигуровки и данък. Ако ти вдигнат заплатата, от увеличението ще удържат същите <b>{eff}%</b>. Така е до <b>€{cap}</b> бруто на месец: над тази граница осигуровките спират и от всичко отгоре се плаща само <b>10%</b> данък.",
    en: "Your pay before deductions (gross) is ≈ <b>€{gross}</b>. Of it, <b>{eff}%</b> goes to contributions and tax. If you get a raise, the same <b>{eff}%</b> is taken out of the raise. That holds up to <b>€{cap}</b> gross a month: above that line contributions stop, and everything above it is taxed at <b>10%</b> only.",
  },
  // Shown when the user is ABOVE the ceiling.
  wedgeOver: {
    bg: "Заплатата ти преди удръжките (бруто) е ≈ <b>€{gross}</b> — над границата, до която се плащат осигуровки (<b>€{cap}</b> на месец). Затова от увеличение на заплатата ти ще удържат само <b>10%</b> данък, а не <b>{peak}%</b>, колкото удържат на човек под границата. Общо от заплатата ти отиват <b>{eff}%</b> — и този дял намалява с всяко следващо увеличение.",
    en: "Your pay before deductions (gross) is ≈ <b>€{gross}</b> - above the line up to which contributions are paid (<b>€{cap}</b> a month). So a raise loses only <b>10%</b> to tax, not the <b>{peak}%</b> taken from someone below the line. In total <b>{eff}%</b> of your pay is taken, and that share shrinks with every further raise.",
  },
  // Shown when the household has more than one income. The lead states the
  // household's own rate — total deductions over total gross, which is NOT the
  // average of the lines under it — and each income then says where it stands,
  // because the ceiling is per contract and that is the entire finding of this
  // row. A single figure over two earners would hide the one thing the chart is
  // drawn to show.
  wedgeHouseholdLead: {
    bg: "Заплатите в домакинството преди удръжките (бруто) са ≈ <b>€{gross}</b> общо. От тях <b>{eff}%</b> отиват за осигуровки и данък. Осигуровките спират на <b>€{cap}</b> бруто на месец — но поотделно за всяка заплата, не за сбора:",
    en: "The household's pay before deductions (gross) is ≈ <b>€{gross}</b> in total. Of it, <b>{eff}%</b> goes to contributions and tax. Contributions stop at <b>€{cap}</b> gross a month - but for each wage on its own, not for the sum:",
  },
  wedgeEarnerLine: {
    bg: "доход {n}: ≈ <b>€{gross}</b> бруто — удържат се <b>{eff}%</b>{cap}",
    en: "income {n}: ≈ <b>€{gross}</b> gross - <b>{eff}%</b> deducted{cap}",
  },
  wedgeEarnerOverCap: { bg: " (над границата)", en: " (over the line)" },
  // Shown when no salary has been entered — the figure without a person in it.
  wedgeNone: {
    bg: "Удръжките стигат до <b>{peak}%</b> от заплатата при <b>€{cap}</b> бруто на месец, а над тази граница делът намалява. Въведи заплата горе, за да видиш къде си.",
    en: "Deductions reach <b>{peak}%</b> of pay at <b>€{cap}</b> gross a month; above that line the share shrinks. Enter your pay above to see where you are.",
  },
  // The one line that says why this is worth looking at. Asserts only the
  // directional finding (rate FALLS above the ceiling); earlier drafts
  // closed with claims the product could not source, all of which were
  // removed.
  // The last sentence is about the LINE, and it earns its length. The line
  // keeps falling to the right of the ceiling, which a reader has no reason to
  // expect from something described as a share of the whole salary — nothing
  // above the ceiling changes. It falls because the contributions are frozen
  // while the salary they are divided by is not, so the average dilutes. And
  // it never reaches the flat rate: it approaches 10% and stays above it at
  // every salary, which is why the chart must not be allowed to read as though
  // the line lands there.
  wedgeWhy: {
    bg: "Данъкът е плосък — <b>10%</b> за всички. Удръжките не са: осигуровки се плащат само до определена заплата, а данък — върху всичко. Затова при по-висока заплата делът, който се удържа от увеличението, <b>пада</b> от <b>{peak}%</b> на <b>10%</b>. Средното за цялата заплата също пада, но по-бавно — и никога до <b>10%</b>, защото осигуровките до <b>€{cap}</b> вече са платени.",
    en: "The tax is flat - <b>10%</b> for everyone. The deductions are not: contributions are paid only up to a certain salary, while tax applies to all of it. So on a higher salary the share taken out of a raise <b>falls</b> from <b>{peak}%</b> to <b>10%</b>. The average over the whole salary falls too, but more slowly - and never to <b>10%</b>, because the contributions up to <b>€{cap}</b> have still been paid.",
  },
  // The chart key. The two curves are the effective and the marginal rate;
  // named here by what each one is a share OF, which is the only difference a
  // reader has to hold on to.
  //
  // «средно» / "on average" is load-bearing rather than a qualifier. A share
  // of the whole salary reads as a fixed property of the salary, and a fixed
  // property has no reason to fall across the chart; an average has every
  // reason to, once the thing being averaged stops growing.
  wedgeAxisEff: {
    bg: "удържа се средно от цялата заплата",
    en: "taken from the whole salary, on average",
  },
  wedgeAxisMar: { bg: "удържа се от увеличението", en: "taken from a raise" },
  wedgeAxisCap: { bg: "дотук се плащат осигуровки", en: "contributions stop here" },

  standStillK: { bg: "за да не изоставаш", en: "to stand still" },
  // Two tiers, both from targetRaise(pi, pocket): stand-still = pi exactly,
  // +5% real = 100*((1+0.05)*(1+pi/100)-1). See mirror.js#targetRaise.
  // "Номинално увеличение" / "real purchasing power" are the textbook terms for
  // the two tiers. The page already has a plainer word for nominal — «на фиш»,
  // used in the pocket row — and the real tier is easier to picture as what the
  // money can buy than as an abstraction called purchasing power.
  // «твоите цени», never «твоите разходи»: the row above already names this
  // quantity «твоите цени», and one thing under two names makes the reader
  // stop and ask whether they are the same number. They are.
  // A PRICE rises, it does not itself get dearer — «цената се вдигна», while
  // «поскъпна» takes the thing bought as its subject («храната поскъпна»),
  // which is how every other sentence here uses it: the ranked row, the basket
  // legend and the results headline all put a group of goods in front of it.
  // «повече НЕЩА» because "5% more" on its own reads as 5% more money, which
  // is the exact confusion this whole row exists to undo.
  standStillTxt: {
    bg: "увеличението ти на фиш трябва да е <b>+{r}%</b> — точно колкото се вдигнаха твоите цени.<br>За да си купуваш с <b>{pct}%</b> повече неща — <b>+{rr}%</b>.",
    en: "your raise on paper has to be <b>+{r}%</b> - exactly as much as your own prices rose.<br>To afford <b>{pct}%</b> more stuff - <b>+{rr}%</b>.",
  },
  // π ≤ 0 is reachable today: several published groups have negative annual
  // rates (телефони −5,2%, техника за свободното време −7,0%), so a basket
  // weighted onto them falls. The line above would then read «трябва да е
  // +−1,2% - точно колкото СЕ ВДИГНАХА твоите цени» — a doubled sign under a
  // sentence claiming a rise that did not happen.
  standStillFlat: {
    bg: "твоите цени не са се вдигнали, така че всяко увеличение ти е чиста печалба.<br>За да си купуваш с <b>{pct}%</b> повече неща, стига <b>{rr}</b>.",
    en: "your prices have not risen, so any raise at all is a real gain.<br>To afford <b>{pct}%</b> more stuff, <b>{rr}</b> is enough.",
  },
  rentK: { bg: "наемът", en: "the rent" },
  // The rent row's "what you entered" reminder, mirroring the mortgage row.
  rentEntered: {
    bg: "Ти въведе <b>€{r}/мес</b> наем — това е <b>{p}%</b> от <b>€{s}</b> нетно.",
    en: "You entered <b>€{r}/mo</b> rent - that's <b>{p}%</b> of <b>€{s}</b> net.",
  },
  // The household variant names whose €{s} it is. Rent is one payment out of
  // the money that arrives, whoever earned it — charging it to one earner would
  // report a couple splitting €600 on €1,800 together as carrying 67% each.
  rentEnteredHousehold: {
    bg: "Ти въведе <b>€{r}/мес</b> наем — това е <b>{p}%</b> от <b>€{s}</b> нетно за домакинството.",
    en: "You entered <b>€{r}/mo</b> rent - that's <b>{p}%</b> of the household's <b>€{s}</b> net.",
  },
  // The markup is owned by the copy, not the template: a tag spliced into a
  // template literal renders as literal text.
  rentBurdenTxt: {
    bg: "<b>{p}%</b> от дохода ти — {dir} границата от 30%.<br>{drama}",
    en: "<b>{p}%</b> of your income - {dir} the 30% line.<br>{drama}",
  },
  rentDirOver: { bg: "над", en: "above" },
  rentDirUnder: { bg: "под", en: "below" },
  // `{day}` arrives already carrying its ordinal ending from
  // `format.js#ordinalDay` — the suffix is not the same for every day in either
  // language, and a single one written into the string was wrong for eight days
  // of the thirty in Bulgarian.
  rentDramaOver: {
    bg: "До <b>{day} число</b> работиш само за наема.",
    en: "Until the <b>{day}</b> you work just for the rent.",
  },
  rentDramaAll: {
    bg: "Целият месец отива за наема — и не стига.",
    en: "The whole month goes to the rent - and it still is not enough.",
  },
  rentDramaFine: {
    bg: "Остава ти за всичко останало.",
    en: "What you have left covers everything else.",
  },
  homeK: { bg: "домът", en: "a home" },
  cashK: { bg: "спестеното", en: "your savings" },
  cashTxt: {
    bg: "Същите <b>€{c}</b> от 2020 г. купуват днес стока за <b>€{t}</b> — инфлацията изяде €{e}.",
    en: "The same <b>€{c}</b> since 2020 buy <b>€{t}</b> worth today - inflation ate €{e}.",
  },

  // "How does this work / what is Eurostat" explainer (plain-language,
  // page-level, distinct from the formula-heavy `drawer` in the results
  // card). Body copy is inlined in App.svelte as .l-bg/.l-en blocks —
  // same pattern the drawer uses for rich bilingual prose.
  explainK: {
    bg: "Как работи това и какво е Евростат?",
    en: "How does this work, and what is Eurostat?",
  },
  explainLead: {
    bg: "Накратко: не измисляме нито едно число. Взимаме официалните данни на Евростат, показваме ти ги и ти даваме връзка да ги провериш сам.",
    en: "In short: we invent no number. We take Eurostat's official data, show it to you, and give you a link to check it yourself.",
  },
  // The closing line of "why does your number differ from the official one".
  // The reassuring half of that answer is that the two are comparable, and what
  // makes them comparable is being the same month — so the sentence has to
  // follow the months rather than assert them.
  //
  // Eurostat publishes the all-items rate about two weeks before the figures
  // per group, and for that fortnight the two on this page are a month apart.
  // Saying "both are for the same latest month" then is false, and false in the
  // one paragraph a doubting reader opened to check. The split version names
  // both months and says why they differ, because a reader who spots the gap
  // unexplained has no way to tell it from a stale page.
  explainSameMonth: {
    bg: "И двете са за един и същ най-нов месец.",
    en: "Both are for the same latest month.",
  },
  // The months land at the END of each sentence on purpose: `periodLong` writes
  // the Bulgarian month as «юни 2026 г.» — the abbreviation carries its own full
  // stop — so a sentence built to continue after it either doubles the stop or
  // has to strip one, and stripping it would be reaching into a formatter to fix
  // a sentence. English gets its own full stop because "June 2026" has none.
  explainSplitMonth: {
    bg: "Този път двете са за различни месеци — Евростат публикува общата инфлация около две седмици преди разбивката по групи, а ние показваме всяко число с неговия месец, вместо да задържим по-новото. Общото е за {headline}, а числата по групи — за {basket}",
    en: "This time the two are for different months - Eurostat publishes the overall rate about two weeks before the group breakdown, and we show each figure with its own month rather than hold the newer one back. The overall figure is for {headline}, the per-group figures for {basket}.",
  },
  // The algebra behind all four figures, in ONE closed block at the very end
  // of the page-level explainer — the last thing on the page, for the one
  // reader in a hundred who wants to re-derive a number by hand. **Not inside
  // the results drawer**, where a «виж формулата» toggle under every item puts
  // four maths panels between the reader and the explanation of their own
  // number. Being right is our job, not theirs.
  // docs/principles.md §"Publish the method" is satisfied by the method being
  // PUBLISHED, not by it being in the way.
  //
  // The label has to say what OPENING it is for, and that opening it is
  // nobody's homework. A summary that names the formulas and vouches for their
  // exactness is addressed to a reader who already wanted algebra; everyone
  // else reads it as the part of the page they are failing to understand, on a
  // page whose whole claim is that the numbers are checkable by ordinary
  // people. Naming the reason — you can work a figure out yourself — invites
  // the one reader in a hundred without conscripting the other ninety-nine.
  explainMath: {
    bg: "формулите, ако искаш да пресметнеш някое число на ръка",
    en: "the formulas, if you want to work a figure out by hand",
  },

  // Drawer. Prose and worked examples in round numbers — no algebra. This is
  // the reader's first explanation of their own number and it has to be
  // readable at a glance; the formulas live at the end of the explainer band
  // above (`explainMath`), one block, closed by default.
  drawer: {
    bg: "Как е сметнато? Простичко, с таблицата и източниците",
    en: "How is it worked out? In plain words, with the table and sources",
  },
  drawerPrecision: {
    bg: "Сметките се правят с пълна точност. Закръгляме само това, което показваме — процентите до един знак след запетаята, евровите суми до цяло число. Затова понякога сборът на показаните числа излиза с една стотинка разлика.",
    en: "The maths runs at full precision. Only what we display is rounded - percentages to one decimal, euro amounts to whole euros. That is why the figures on screen can add up a cent apart.",
  },

  // Footer
  // The source list is UPSTREAM ATTRIBUTION, not boilerplate, and it is
  // load-bearing twice over: it is a condition of several upstream licences
  // (docs/legal.md) and it is the product's credibility claim (docs/principles.md P3/P9
  // — every number is sourced, dated and clickable). All five must be named —
  // the mortgage headline on this page is ЕЦБ MIR and the €/m² is имот.bg,
  // and the ЕЦБ's terms require it to "be cited as the source". Removing a
  // name to shorten the line is never a cleanup;
  // `site/scripts/verify_legal.mjs` ("the footer credits every upstream")
  // fails if any of the five disappears, in either language.
  //
  // The licence claim on this line is deliberate and it is checked. Вярно is
  // a public good: the code is Apache-2.0 and the line says so, because a
  // civic tool that asks people to trust it should be checkable all the way
  // down — the method, the sources AND the source code.
  //
  // What the line must NEVER say is that the DATA is Apache-2.0. It is not
  // ours to license (NOTICE, §"What it does not cover"), which is why the
  // wording scopes the licence to «кодът» / "the code" and leaves the five
  // publishers named separately as the attribution they require.
  // `verify_legal.mjs` §"the app states its licence, scoped to the code, and
  // claims nothing about the data" holds both halves.
  // `{year}` is the year the reader is in, from their own clock — never a
  // literal. A footer that says 2026 through the whole of 2027 is the oldest
  // stale-date bug there is, and on this page it lands next to five publisher
  // names and a licence, where "last touched years ago" is the one impression
  // the line exists to prevent.
  footerNote: {
    bg: "Данни от Евростат / ЕЦБ / НСИ / БНБ / имот.bg · Вярно {year} · кодът е отворен (Apache-2.0)",
    en: "Data from Eurostat / ECB / NSI / BNB / imot.bg · Vyarno {year} · open source code (Apache-2.0)",
  },
  // Footer link label for the contact address. The four legal-document
  // labels live in `lib/legal.js` next to the documents themselves, so a
  // renamed document cannot leave a stale link label behind.
  contactK: { bg: "Контакт", en: "Contact" },
  // The repository link's accessible name. The footer note beside it says the
  // code is open; this is where a reader goes to read it, and «отворен код»
  // with no address is a claim with no source — which is the one thing this
  // product is not allowed to print. The mark alone carries no name for a
  // screen reader, so the label is not decoration: it is the link's text.
  repoK: { bg: "Кодът в GitHub", en: "The code on GitHub" },

  // National strip
  stripHead: { bg: "Страната накратко", en: "The country at a glance" },
  // Alongside the "Data as of {date}" banner: the verbatim official
  // all-items HICP annual rate (prc_hicp_minr, TOTAL, RCH_A) and the month
  // it covers — the same latest month the calculator's default (y1) uses.
  // Plain language, no dataset code. "инфлация" is the everyday word for
  // how much prices went up; "ставка" sounds like a bank rate.
  // `{flash}` lands at the END, next to the period it qualifies rather than
  // next to the publisher's name — the estimate is a property of this month's
  // reading, not of Eurostat. Which is also why the Bulgarian carries the
  // attribution up front: two parentheticals in a row read as an aside about
  // an aside, and the marker is the one a reader has to see.
  headlineRate: {
    bg: "официална инфлация по данни на Евростат: {rate}% за {ref_period}{flash}",
    en: "official Eurostat inflation: {rate}% for {ref_period}{flash}",
  },
  statInfK: { bg: "инфлация за година", en: "annual inflation" },
  // Always-on "typical pay" card. The MEDIAN (half earn less, half more) is
  // the honest "what people actually earn" number — unlike the average, it
  // isn't pulled up by a few very high earners. {lo}/{hi} are the middle-60%
  // net range (P20–P80 of the ladder), a genuinely new number not shown
  // anywhere else. Both are NET monthly EUR (buildLadder output).
  // «нетна заплата», never «нето-заплата». The compound reads as a
  // transliteration of an English label, and the same quantity is called
  // «нетна заплата» in the input label, the payslip and the percentile row —
  // one thing under two names makes a reader stop and check whether they are
  // the same number.
  statMedianK: { bg: "медианна нетна заплата · страната", en: "median NET pay · nationwide" },
  statMedianSub: {
    bg: "средните 60% взимат €{lo}–€{hi}/мес",
    en: "the middle 60% take €{lo}–€{hi}/mo",
  },
  // The band is the most modelled number on the strip and it was reading in
  // the same voice as the median beside it. Only P10, P50 and P90 are survey
  // anchors: P20 and P80 — the two ends of this range — are interpolated
  // between them, so the card has to say so on the band itself rather than
  // relying on the general "worked out from a {shapeYear} survey" line below.
  statMedianSubModelled: {
    bg: "(двата края са пресметнати между измерените стойности)",
    en: "(both ends are worked out between the surveyed points)",
  },
  // The mean-vs-median insight — most people don't know the average is
  // skewed upward. Shown as the card's source/foot line.
  statMedianVsMean: {
    bg: "средната (€{mean}) е по-висока — дърпат я нагоре най-високите заплати",
    en: "the average (€{mean}) sits higher — a few top salaries pull it up",
  },
  // Carries BOTH dates: the shape's survey year and the level's quarter.
  // The card was the only figure on the page with no date on it, while the
  // percentile row beside it cited both (docs/principles.md P3).
  statMedianSrc: {
    bg: "Евростат {shapeYear} + НСИ {anchorPeriod}",
    en: "Eurostat {shapeYear} + NSI {anchorPeriod}",
  },
  statMedianModelled: {
    bg: "кой колко изкарва е изчислено по изследване от {shapeYear} г.",
    en: "who earns what is worked out from a {shapeYear} survey",
  },
  // **Every one of these names the област, and none of them hardcodes which.**
  // НСИ publish the wage by област and the reader picks theirs, so a label
  // reading «в София» beside a Варна figure is the exact failure this whole
  // setting exists to end — and it is invisible, because both are plausible
  // Bulgarian wages. `{region}` is НСИ's own name for it in the reader's
  // language, out of the payload, never a transliteration.
  statRegionK: {
    bg: "средна нетна заплата · {region}",
    en: "average NET pay · {region}",
  },
  // What the card says before a reader has picked. There is no default (P7):
  // Sofia-by-default would hand a Бургас reader Sofia's average wearing the
  // appearance of a choice they made, which is the same defect the blank raise
  // field exists to avoid.
  //
  // **It asks for a place, not for an «област».** The control above it asks
  // «Къде живееш?» and the two empty states are the only other place the reader
  // is told what is missing — a prompt naming an administrative unit sends them
  // looking for a control that is not there.
  statRegionUnset: {
    bg: "средна нетна заплата · избери къде живееш",
    en: "average NET pay · choose where you live",
  },
  statRegionUnsetHint: {
    bg: "кажи по-горе къде живееш, за да сравним заплатата ти със средната там",
    en: "say above where you live, to compare your pay with the average there",
  },
  // One coherent clause rather than spliced fragments: the {delta}
  // placeholder carries the whole "+28% над" / "-28% под" / "≈ на" phrase,
  // built in the template, which is what keeps the Bulgarian grammatical.
  statRegionDiff: {
    bg: "твоята нетна заплата е <b>{delta}</b> средната за {region}",
    en: "your net pay is <b>{delta}</b> the {region} net average",
  },
  // Per income, for the same reason the ladder is: НСИ publish a WAGE. Measured
  // against a two-earner total, a household of two on €900 each reads as 21%
  // above the average worker — two true numbers making one false sentence.
  statRegionDiffEarner: {
    bg: "доход {n} е <b>{delta}</b> средната за {region}",
    en: "income {n} is <b>{delta}</b> the {region} net average",
  },
  statRegionAbove: { bg: "над", en: "above" },
  statRegionBelow: { bg: "под", en: "below" },
  statRegionEqual: { bg: "≈ на", en: "≈" },
  // The sector comparison. Same clause shape as the Sofia pair above and for
  // the same reason: {delta} carries the whole "+28% над" phrase so the
  // Bulgarian stays grammatical, and {sector} is НСИ's own section name in the
  // reader's language — never our translation of the other edition's.
  // The place picker. Its own block rather than beside the sector one, because
  // the two answer different questions and only this one moves which published
  // figures the page reads.
  //
  // **IT ASKS A QUESTION AND THE QUESTION IS NOT «КОЯ Е ТВОЯТА ОБЛАСТ».**
  // «Област» is what НСИ call the row the wage comes from; a person knows the
  // town they live in, and for twenty-six of the twenty-eight the two are the
  // same word anyway — Варна, Пловдив, Бургас, Русе. What the vocabulary bought
  // was nothing: every имот.bg city is an областен център, so an «област»
  // picker and a place picker are the same 28 entries and not one number
  // changes. What it cost was a reader looking for a control they had no name
  // for. The word survives only where it says what a figure COVERS —
  // `statRegionSrc` and `sectorNationwide` — never as the thing being asked.
  regionLabel: { bg: "Къде живееш?", en: "Where do you live?" },
  regionNone: { bg: "— избери —", en: "— choose —" },
  // The suffix on the one option имот.bg publishes no price for. In the list
  // rather than out of it: НСИ publish a wage for Софийска област and a reader
  // who lives there should get it, with the missing half named rather than
  // silently absent.
  regionNoPriceSuffix: { bg: "(без цени на жилища)", en: "(no home prices)" },
  // **The one thing a reader has to know about the choice they just made**, and
  // the whole of it: the two cards it moves are drawn at two different scales.
  // The wage is НСИ's for the whole област — Варна's figure includes Девня,
  // Провадия and Белослав — while имот.bg publish nothing outside the town
  // itself, so a reader in Девня gets a correct wage and the city's price. A
  // picker labelled by place name is the framing that could hide that, which is
  // why the line is here rather than dropped with the vocabulary.
  //
  // **No counts in it.** «имот.bg публикува цени за 27 от 28-те» is a sentence
  // about our own last refresh wearing имот.bg's name, and the number stops
  // moving the day somebody forgets to re-read it. The two cards state their own
  // coverage, each beside its own figure.
  regionHint: {
    bg: "Заплатата е средната за цялата област, а цените на жилищата — само за самия град.",
    en: "The wage is the average for the whole oblast; the home prices are the town's alone.",
  },
  sectorLabel: { bg: "Твоят сектор", en: "Your sector" },
  sectorNone: { bg: "— избери дейност —", en: "— choose an activity —" },
  // «средната» carries «нетна заплата» from the subject, so naming it twice in
  // one sentence is the translation showing through rather than a clarification.
  sectorDiff: {
    bg: "твоята нетна заплата е <b>{delta}</b> средната за „{sector}“",
    en: 'your net pay is <b>{delta}</b> the average for "{sector}"',
  },
  sectorDiffEarner: {
    bg: "доход {n} е <b>{delta}</b> средната за „{sector}“",
    en: 'income {n} is <b>{delta}</b> the average for "{sector}"',
  },
  // НСИ publish a GROSS average, and it is the only figure on this line that is
  // theirs. The net beside it is our payroll conversion of it, so both are named
  // and the step between them is attributed — the same standard the calibration
  // sentence below meets for Eurostat's mean and median. Showing the net alone
  // under an «НСИ ·» credit puts their name over our arithmetic and leaves the
  // reader who opens the workbook with no figure to match the row against.
  // «в страната» / "nationwide" is load-bearing, not decoration. The line above
  // this one on the card compares the reader with their own област, and this
  // table is НСИ's country-wide one, so the scope has to be attached to the
  // figure itself — a reader who takes in only the number and its credit must
  // not carry away a local reading of a national average.
  sectorSrc: {
    bg: "НСИ · средна брутна заплата за дейността в страната {gross} € · ≈ {net} € нето по наша сметка · {period}{prelim}",
    en: "NSI · average GROSS for the activity, nationwide {gross} € · ≈ {net} € net, our conversion · {period}{prelim}",
  },
  // **The scope mismatch, said out loud.** НСИ's by-activity table covers the
  // whole country; the област comparison sits three lines above it on the same
  // card, and the two scopes differ in every област — София pay is structurally
  // higher, Благоевград's is half of it. Stacked without this, the two read as
  // one scale and the gap to a sector average gets charged entirely to the
  // reader's industry: «144% над средната за „Строителство“» for a builder in
  // София is mostly the city. It flatters in nearly every section, which is the
  // direction docs/principles.md P7 says to distrust hardest.
  //
  // **No euro level in it, and that is what keeps the sentence readable.** The
  // claim is that two scopes are being stacked, and the sentence makes it in
  // words; НСИ's all-activities cell beside it is evidence for a comparison
  // this sentence does not ask the reader to make. What it does instead is put
  // a third euro figure on a card that already carries the sector gross, our
  // net conversion of it and the reader's own pay — and a reader weighing 3176
  // against 1407 has started answering "is my industry well paid", which is a
  // different question and one this line cannot settle for them.
  //
  // **The other comparison is named by what it says, never by where it sits.**
  // Three lines separate the two on screen — the sector picker, the sector gap
  // and the НСИ credit — and the nearest line above this one is the no-rank
  // caveat, which qualifies the very comparison being qualified again here. A
  // reader pointed at «the row above» reads it as that one and the sentence
  // inverts: it then says the sector figure is the local one. Naming the
  // comparison also survives the card being reordered, which a positional
  // phrase does not.
  //
  // «разликата ти спрямо сектора» for the same reason. Two gaps are on screen
  // by the time this renders and only one of them is the city's.
  sectorNationwide: {
    bg: "Дейността е за цялата страна, а сравнението по-горе е само за твоята област. Затова част от разликата ти спрямо сектора идва от това къде живееш, а не от работата.",
    en: "The activity is for the whole country, while the comparison above covers your oblast alone. So part of your gap against the sector comes from where you live, not from the job.",
  },
  // НСИ mark a whole year preliminary until they finalise it, and 2026 is. A
  // figure they will revise, shown as though it were settled, is the reader
  // being told more certainty than exists (P4). Empty for a final quarter.
  //
  // One marker for both НСИ credit lines rather than one each. The two carry
  // the same publisher's sibling tables at the same quarter under the same
  // star, and two keys holding the same string is how one of them ends up
  // saying something the other does not.
  srcPrelim: { bg: " (предварителни данни)", en: " (preliminary)" },
  // Eurostat's flash, and it gets its OWN words rather than reusing the marker
  // above. «Предварителни данни» is what НСИ print over a quarter they will
  // finalise at the end of the year: the figure stands, the sheet is not
  // closed. Eurostat's flash is a different state — the all-items rate for a
  // month, published about two weeks ahead of that month's index and its
  // divisions, and replaced by the full reading rather than confirmed by it.
  // «Експресна оценка» is the term the publisher's own Bulgarian uses for it,
  // and the site prints both markers on the same screen, so the one thing they
  // may not do is read as the same claim.
  //
  // Shared by the banner and the strip card for the reason srcPrelim is shared
  // by the two НСИ credit lines: one string cannot drift from itself.
  srcFlash: { bg: " (експресна оценка)", en: " (flash estimate)" },
  // **The sentence the whole feature turns on.** НСИ publish an average by
  // activity and nobody publishes a distribution by one, so the card can say
  // how far the reader is from an average and cannot say where they rank.
  // Stating that is P11's shape — the figure is unpublished, not withheld —
  // and leaving it out would let a reader read a rank into a gap.
  sectorNoRank: {
    bg: "Това е сравнение със средна заплата, а не класиране — никой не публикува как са разпределени заплатите вътре в един сектор у нас.",
    en: "This compares you with an average, not a rank — nobody publishes how pay is spread inside a Bulgarian sector.",
  },
  // The correction that keeps the line above from being read as bad news.
  // Earnings are right-skewed, so an average sits above the middle and a reader
  // told they are «под средната за сектора» hears «под средата», which does not
  // follow. `mirror.js#meanRungPosition` reads Eurostat's shape for the COUNTRY
  // — there is no sector distribution to read it off, which is the point of the
  // sentence before this one.
  //
  // **One sentence, and no figure in it.** The three earlier drafts of this
  // caveat all carried the evidence — Eurostat's mean and median, and the rung
  // the mean lands on — and every one of them cost the reader more than it
  // returned. Two problems, and the second is why showing the pair is not an
  // option to go back to:
  //
  // The Eurostat pair is at SES's own level, and SES runs four-yearly against
  // an НСИ table that moves every quarter — so the pair is between one and
  // five years behind the figures beside it, and never level with them. Every
  // other euro on the site is re-levelled to the current anchor before a reader
  // sees it — the ladder multiplies the shape by (target mean / ses_mean) for
  // exactly this reason — and this string was the one place raw SES euros
  // reached the page. Under НСИ's national all-activities figure for the
  // current quarter, and well under it because wages moved in between, an SES
  // "average wage" is not read as a survey level from an earlier round however
  // it is dated: it is read as a contradiction, and the reader is left working
  // out which of the two numbers is the wrong one. A date does not fix that.
  //
  // And the rung was ours. Eurostat publish D1, the median and D9 for BG and
  // nothing between, so a percentile of the mean is interpolated — which P3
  // obliges us to mark, and «наша сметка, изчислено … а не измерено» is three
  // clauses of methodology in a caveat that has to be finished to protect
  // anybody. A figure that needs more disclaimer than it carries argument is
  // one to drop, not one to explain harder.
  //
  // What is left is the claim itself, credited and dated: the reader can check
  // it against Eurostat's SES for the year named. It is weaker evidence than
  // the pair and it is read by more people, which is the trade being made.
  //
  // **Nothing on screen backs it, so the code has to.** `meanAboveMedian` is
  // the published median sitting below the published mean, and the card renders
  // this only where that holds — see the gate in PayField.
  //
  // **«Наети», not «заети».** In Bulgarian official statistics «заети» is
  // employed PERSONS, the self-employed among them, and SES surveys neither
  // them nor everybody who is employed: its population is employees, full-time
  // here, in firms of ten or more, NACE B–S excluding O. The claim itself —
  // more than half earn under the average — is the survey's own median sitting
  // under its own mean (€705 against €949 at 2022), so it is true OF THAT
  // POPULATION and of no wider one, and the sentence has to name the population
  // it is true of.
  //
  // Person-first in both languages: the people are the subject and the wage is
  // what they are compared against. «Стои на X-ия процентил» is jargon a reader
  // is entitled not to know, and «средната изпреварва X% от наетите» hands a
  // wage a verb that wants a person — it overtakes nobody.
  //
  // The level is named GROSS because the credit line above this one ends in a
  // net. Two adjacent sentences pairing a country-wide gross with a local net
  // on unstated bases invite a comparison neither supports.
  sectorAverageFlatters: {
    bg: "Средната не е средата: в България повече от половината наети на пълен работен ден изкарват под средната брутна заплата (Евростат, {shapeYear} г.), затова „под средната за сектора“ не значи „под средата“.",
    en: "An average is not a middle: in Bulgaria more than half of full-time employees earn less than the average GROSS wage (Eurostat, {shapeYear}), so below your sector's average does not mean below the middle.",
  },
  // The English has to name «служебно правоотношение» too. НСИ count both
  // employment relationships, and «Държавно управление» is one of the sections
  // in the picker — an English reader who picks it and is told the series
  // covers only labour contracts has been told their own section is excluded
  // from the figure they are being compared against.
  sectorCoverage: {
    bg: "Броят се само наетите по трудово и служебно правоотношение — не и работещите на свободна практика или през собствена фирма. Дейностите са широки раздели по КИД-2008, а не професии.",
    en: "Only people on a labour contract or in the civil service are counted — not the self-employed or anyone working through their own company. Activities are broad NACE Rev 2 sections, not occupations.",
  },
  // **The chip that holds the two sentences above.** Four caveats under one
  // number is past the length anybody finishes, and a caveat nobody finishes
  // protects nobody — so the two that say what the FIGURE is stay in the open
  // (a comparison with an average rather than a rank, and an average for the
  // country rather than for Sofia) and the two that say how to READ a gap the
  // reader has already been told is a gap from an average go one tap down.
  //
  // Which is the split the pattern was built for: the receipt rows keep the
  // claim, its caveat, its source and its verify link on the page and put the
  // working behind the chip. Nothing here is a source caption or a verify link,
  // and nothing behind it contradicts a sentence still on screen — «средната
  // не е средата» elaborates «сравнение със средна заплата, а не класиране»,
  // which does not fold.
  //
  // «Още» / "more" alone is a label that states what the control does. This
  // one says what is behind it, which is what a reader decides on.
  discloseSectorMore: {
    bg: "какво още казва тази средна",
    en: "what else that average says",
  },
  // The sector card's rule, on the card it is the twin of. НСИ publish a gross
  // per област; the value this card leads with is our payroll conversion of one
  // of those cells, so the line carries НСИ's own figure as well and says which
  // step is ours. Their name over a figure only we computed leaves a reader who
  // opens the linked workbook nothing to match against — the whole point of the
  // link.
  // **This is where the wage's SCOPE belongs, and it is load-bearing.** The
  // label above it is a bare place name — «средна нетна заплата · Варна» — and
  // the housing card two positions along says «жилище във Варна» about a figure
  // that really is the town's. Read together with nothing else, the two invite
  // one reading of «Варна», and only one of them is drawn at that scale: НСИ's
  // wage covers the whole област, Девня and Провадия and Белослав included. A
  // reader in Девня is getting a correct wage and somebody else's town's price,
  // and the difference has to be stated somewhere they will actually be looking.
  //
  // The word stays away from the name — «за областта · {region}» rather than «в
  // област {region}» — because «в област София» reads as a nesting that does
  // not exist. It states the scope; the slot states the place.
  statRegionSrc: {
    bg: "НСИ · средна брутна заплата за цялата област · {region} · {gross} € · ≈ {net} € нето по наша сметка · {period}{prelim}",
    en: "NSI · average GROSS pay for the whole oblast · {region} · {gross} € · ≈ {net} € net, our conversion · {period}{prelim}",
  },
  statFastK: { bg: "— най-бързо поскъпващата група", en: "- the fastest-rising group" },
  // The housing card's label, and it needs one: every card in the strip has
  // the same anatomy — value, label, chart, source. Folding the place name
  // into the value slot as "София · €175 070" and pushing the rest into the
  // source caption gives this one card a shape none of its neighbours have.
  // «{v}» is «в» or «във», from `format.js#bgIn`. Bulgarian writes «във»
  // before a в- or ф- word, and four of имот.bg's cities begin with В, so a
  // bare «в» here is ungrammatical for a reader in Варна, Видин, Враца or
  // Велико Търново. A rule rather than four names written down: the cities are
  // data, and a list goes stale on a refresh nobody connects to it.
  statHomeK: { bg: "жилище {v} {city}", en: "a home in {city}" },
  // What the housing card says before an област is picked. Two different
  // absences, and the copy has to tell them apart: nobody chose yet, against
  // имот.bg publishing no price for the one област whose towns are not among
  // their 27 cities. The second is P11 — a figure nobody publishes is
  // uncomputed rather than concealed, and saying which is which is the
  // difference between the two.
  statHomeUnset: { bg: "жилище · избери къде живееш", en: "a home · choose where you live" },
  // The €/m² caption under the housing card, and the sparkline's accessible
  // name. Both once said «за София» beside a figure that follows the reader's
  // own град — true for one city in twenty-seven, and the screen-reader one is
  // the version nobody reviewing the page would ever see.
  statHomeMedianOf: {
    bg: "медиана за {city} от обявите",
    en: "{city} median from public listings",
  },
  statHomeChartLabel: {
    bg: "Медианна цена на кв. м {v} {city}, {from}–{to}",
    en: "Median €/m² in {city}, {from}–{to}",
  },
  // The bracket beside a hand-typed asking price. It names the city the
  // median belongs to, because the €/m² beside it is whichever град the reader
  // picked — «софийската медиана» there is a real имот.bg figure under a place
  // the reader does not live in.
  manualVsMedian: {
    bg: "(медианата за {city} е {pm2} €/м²)",
    en: "(the {city} median is €{pm2}/m²)",
  },
  // Where the square metres a reader could afford would be. The €/m² behind
  // them is whichever град they picked, so a sentence naming София put a real
  // figure under the wrong place. A reader in manual price mode has typed a
  // price for somewhere they did not name, and the template ends the sentence
  // after the area rather than reaching for a place — this key is added to a
  // sentence, never substituted for the end of one.
  affordWhere: { bg: "{v} {city}.", en: "in {city}." },
  // The home row with no €/m² behind it. Says what to do rather than which of
  // the three absences it is — the housing card in the strip says which, in
  // имот.bg's name or in ours as the case may be, and repeating it here would
  // be the same admission twice on one screen.
  homeNoPrice: {
    bg: "Още нямаме цена на квадратен метър, с която да сметнем жилището — кажи по-горе къде живееш или въведи своя цена.",
    en: "We have no €/m² to price a home with yet — say above where you live, or enter your own price.",
  },
  // **The sentence names имот.bg, so it has to be true of имот.bg.** It reads
  // for the one област whose towns are not among the 27 cities they publish,
  // and it names no place: «за София» was flatly false — имот.bg publish
  // София's prices, and the област beside the capital shares its name — while
  // «за {област}» fired for every city a refresh had not reached yet.
  statHomeNoCity: {
    bg: "имот.bg публикува цени по градове, а нито един град от тази област не е сред тях",
    en: "imot.bg publishes prices by city, and no town in this oblast is among them",
  },
  // The other absence, and a different claim: имот.bg do publish this city and
  // this refresh has not read it. Ours to fix, so the copy says so rather than
  // putting it on them.
  statHomeAwaited: {
    bg: "жилище · {city} · очакваме данни от имот.bg",
    en: "a home · {city} · waiting on imot.bg data",
  },
  // The "{pct} от {y}" sub-caption on the stat card. Carries имот.bg's own
  // median-against-baseline-median delta (their historical pages, NOT HICP).
  //
  // **The year is a placeholder because it is per city.** How far back имот.bg's
  // coverage of a city supports a comparison differs by two decades between
  // София and Смолян, so a year written into this string would be right for one
  // city and wrong for the rest — and it is the kind of wrong nobody spots,
  // because every year in the range is a plausible one to have measured from.
  //
  // **The sign is the formatter's and never the string's.** «+{pct}%» fed an
  // unsigned number renders «+-5%» for a city whose median fell, and имот.bg
  // publish 27 of them with two decades of history each — the case is
  // reachable in a way it was not while the card was София's alone.
  // `percentSigned` carries the sign, the minus glyph the rest of the page
  // uses, and no sign at all where the figure rounds to zero.
  statHomeDelta: { bg: "{pct} от {y} · медиана", en: "{pct} since {y} · median" },
  statUnempK: { bg: "безработица · 15-74 г.", en: "unemployment · age 15-74" },

  // As-of banner.
  //
  // `{period}` is the REFERENCE PERIOD of the headline inflation figure — the
  // month the prices are from, not the day we downloaded it. The two are a month
  // apart, and a date reads as "prices current to this day" when it is not.
  // Download dates are per payload, in the panel the next key opens.
  dataAsOf: { bg: "Числата са към {period}", en: "Figures for {period}" },
  dataPanelToggle: { bg: "всички данни и източници", en: "all data and sources" },
  dataPanelTitle: { bg: "Данните на тази страница", en: "The data on this page" },
  // Why the panel has two date columns, said once, in the reader's words.
  dataPanelNote: {
    bg: "„Период“ е това, което числото описва. „Изтеглено“ е денят, в който сме го взели от източника. Различни са, и когато цитираш число, важният е периодът.",
    en: "“Period” is what the figure describes. “Fetched” is the day we took it from the source. They are not the same, and when you quote a figure the period is the one that matters.",
  },
  dataPanelHeadWhat: { bg: "какво захранва", en: "what it feeds" },
  dataPanelHeadPeriod: { bg: "период", en: "period" },
  dataPanelHeadFetched: { bg: "изтеглено", en: "fetched" },
  dataPanelHeadSource: { bg: "източник", en: "source" },
  // Per-row status, judged against that payload's own cadence: the HICP release
  // is monthly, the НСИ wage series quarterly, the payroll table annual.
  dataRowFresh: { bg: "обновено", en: "up to date" },
  dataRowDue: { bg: "предстои обновяване", en: "refresh due" },
  dataRowOverdue: { bg: "закъсняло с {n} дни", en: "{n} days overdue" },
  dataRowAbsent: { bg: "не се зареди", en: "did not load" },
  // The staleness banner. `n` is the COUNT OF OVERDUE PAYLOADS, not a day count:
  // one late payload out of nine is a different situation from all nine, and a
  // sentence about "the data" not being refreshed claims the latter. The date is
  // the oldest fetch, so a reader can see how far back the laggard goes.
  dataStale: {
    bg: "{n} от числата са закъснели · най-старото е изтеглено на {date}",
    en: "{n} of the figures are overdue · the oldest was fetched on {date}",
  },
  // One overdue payload out of nine is the commonest way this banner fires, and
  // the plural sentence does not survive it: «1 от числата са закъснели» is not
  // a sentence a Bulgarian would write, and "1 of the figures are overdue" is
  // not one an English speaker would either. Bulgarian also needs the neuter
  // singular agreement on the participle, so this is a separate string rather
  // than a suffix stitched on.
  dataStaleOne: {
    bg: "Едно от числата е закъсняло · изтеглено е на {date}",
    en: "One of the figures is overdue · it was fetched on {date}",
  },
  // What is still true while the banner is up: nothing is invented and nothing
  // is guessed, these remain the last officially published figures. No promise
  // of a next update date — Eurostat's HICP release is mid-month but not fixed
  // to a date, and the nine payloads run on three different cadences.
  dataStaleHint: {
    bg: "Показаните числа са последните официално публикувани, които имаме — нищо тук не е предположение.",
    en: "The figures shown are the last officially published ones we hold — nothing here is estimated.",
  },

  // The same warning for `/market/` and `/how/`, which have no data panel to
  // open — so it NAMES what is late instead of counting it. See DataLate.svelte
  // for why that is a second sentence rather than a parameter on the first.
  dataLateOne: {
    bg: "Едно от числата на тази страница е закъсняло: {names}.",
    en: "One of the figures on this page is overdue: {names}.",
  },
  dataLateSome: {
    bg: "{n} от числата на тази страница са закъснели: {names}.",
    en: "{n} of the figures on this page are overdue: {names}.",
  },
  // A payload's own name and its own age. «(преди {n} дни)» rather than a
  // participle agreeing with the name, which every one of the twelve would
  // decline differently; and it is never asked for a singular, because the
  // shortest cadence on the site is a month and a row is overdue only past
  // 1.5× its own.
  dataLateAge: { bg: "{name} (преди {n} дни)", en: "{name} ({n} days ago)" },
  dataLateHint: {
    bg: "Показаното е последното официално публикувано — нищо тук не е предположение. Под всяко число пише за кой период е.",
    en: "What is shown is the last officially published figure — nothing here is estimated. Under each one is the period it describes.",
  },

  // Loading and failure states. A person who has just typed their salary into
  // a page that then failed needs three things: what happened, that nothing of
  // theirs was lost or sent anywhere, and a way to try again. A bare "reload
  // the page" is the voice of a debug string and says none of them.
  loadingK: { bg: "Зареждане на официалните данни…", en: "Loading the official data…" },
  errHead: { bg: "Данните не се заредиха.", en: "The data didn't load." },
  errBody: {
    bg: "Няма връзка или файловете с данни не отговарят в момента. Нищо от твоите числа не е изгубено и нищо не е изпращано никъде — сметката се прави в браузъра ти. Опитай пак след малко.",
    en: "There's no connection, or the data files aren't responding right now. None of your figures were lost and nothing was sent anywhere — the calculation happens in your browser. Try again in a moment.",
  },
  errRetry: { bg: "Опитай пак", en: "Try again" },
  errContact: {
    bg: "Ако се повтаря, пиши на {email} — проблемът е при нас.",
    en: "If it keeps happening, write to {email} — that's a problem on our side.",
  },

  // The home row, for whichever град the reader picked. Slots:
  //   {v}     «в» or «във», from format.js#bgIn
  //   {city}  имот.bg's own name for that град
  //   {m}     apartment size (m²)
  //   {p}     total asking price
  //   {pm2}   per-m² asking price (that city's median from city_price.json)
  //   {basis} what the €/m² beside it IS — a median, the reader's own, or a
  //           placeholder
  //   {y}     years of monthly net pay
  //   {src}   short source caption: имот.bg, that city's district count, the
  //           date
  homeYears: {
    bg: "{m} м² {v} <b>{city}</b> ≈ €{p} (≈{pm2}€/м², {basis}) = колкото изкарваш за <b>{y} години</b>.",
    en: "{m} m² in <b>{city}</b> ≈ €{p} (≈€{pm2}/m², {basis}) = <b>{y} years</b> of your entire pay.",
  },
  // The same sentence with no place in it. A reader who typed their own price
  // without choosing an област has told the page what a home costs and not
  // where it is, and the version above renders «70 м² в  ≈ €200 000» — a
  // dangling preposition round an empty <b>. There is nothing to put in the
  // slot and nothing that needs to go there: the price is theirs.
  homeYearsNoCity: {
    bg: "{m} м² ≈ €{p} (≈{pm2}€/м², {basis}) = колкото изкарваш за <b>{y} години</b>.",
    en: "{m} m² ≈ €{p} (≈€{pm2}/m², {basis}) = <b>{y} years</b> of your entire pay.",
  },
  // What the €/m² in that sentence actually IS. When city_price.json is on
  // the page it is имот.bg's measured median; when the payload did not load it
  // is HOME.eurPerM2_offlineFallback, a round constant with no measurement
  // behind it. Calling the second one «медиана» is the exact failure this
  // project exists to avoid — a plausible number wearing someone else's
  // provenance. The word is a slot so the sentence cannot claim the wrong one.
  homeBasisMedian: { bg: "медиана", en: "median" },
  // The third basis: the reader typed the price, so the €/m² beside it is
  // theirs divided by their own square metres, and neither figure is имот.bg's
  // to caption. «медиана» there stated that a price the reader invented came
  // off имот.bg's districts.
  homeBasisOwn: { bg: "твоята цена", en: "your price" },
  homeBasisPlaceholder: { bg: "ориентировъчна стойност, без данни", en: "placeholder, no data" },
  homeYearsSrc: {
    bg: "≈{pm2}€/м² · източник: <b>{src}</b>",
    en: "≈€{pm2}/m² · source: <b>{src}</b>",
  },
  homeMort: {
    bg: "вноска при {r}% за {t} г. ({d}% самоучастие): <b>€{pm}/мес</b> = <b>{s}%</b> от заплатата ти",
    en: "payment at {r}% over {t} yrs ({d}% down): <b>€{pm}/mo</b> = <b>{s}%</b> of your pay",
  },
  // **What that share is a share OF, said where the share is.** The figure
  // above is the annuity — principal and interest — because that is what an
  // annuity formula computes and what a bank's amortisation schedule collects.
  // It is not everything a mortgage costs per month: property insurance is
  // mandatory on a mortgaged home, life cover is often required or required for
  // the advertised rate, and the account the instalment is collected from
  // usually carries a fee. Those are inside the ГПР quoted under the rate field
  // and outside this line.
  //
  // **No number in it, and that is not squeamishness.** Nobody publishes what
  // those add for a Bulgarian mortgage, so any figure here would be one this
  // project invented — and it would land on the row where a reader is deciding
  // whether they can carry a house. What can be said honestly is the direction,
  // and the direction is the one that matters: the share on screen is a floor.
  //
  // It sits on the mortgage row rather than only on `/how/` because the 30%
  // line is drawn against this figure, and the whole argument for that line is
  // that it is deliberately unflattering (docs/principles.md P7). A caveat that
  // lives one page away from the verdict it qualifies protects nobody.
  homeMortExcludes: {
    bg: "Това е само вноската по кредита. Застраховките и таксата по сметката вървят отгоре, всеки месец — влизат в ГПР, когато банката ги иска, за да отпусне кредита, но в тази сума ги няма.",
    en: "That is the loan instalment alone. Insurance and the account fee run on top of it every month — they count towards the APRC where the bank requires them in order to lend, but they are not in this figure.",
  },
  // The total cost of the same credit (APRC / ГПР): interest plus the charges
  // the bank requires in order to lend. Shown under the rate input so the
  // cheaper headline number is never the only one the user sees.
  //
  // **«Всички такси» is a promise the indicator does not keep.** The APRC is
  // defined by Directives 2008/48/EC and 2014/17/EU, which take in «interest,
  // commissions, taxes and any other kind of fees which the consumer is
  // required to pay in connection with the credit agreement … except for
  // notarial costs» and the valuation «but excluding registration fees for the
  // transfer of ownership». A Bulgarian buyer pays both of those, so a caption
  // saying every fee is in the figure sends them to a notary they were told
  // they had already counted.
  rateAprc: {
    bg: "с таксите по кредита (ГПР) излиза <b>{pct}%</b> · ЕЦБ, нови кредити {p}",
    en: "with the loan's charges (APRC) it comes to <b>{pct}%</b> · ECB, new loans {p}",
  },
  // Why 15% down and a 30-year ceiling are not our choices but the law's.
  limitsNote: {
    bg: "БНБ ограничава ипотеките: до {ltv}% от цената на имота (значи поне {d}% самоучастие) и до {ty} г. срок.",
    en: "BNB caps mortgages: up to {ltv}% of the price (so at least {d}% down) and a {ty}-year term.",
  },

  // The two different dates a scraped figure can carry, and the reason they
  // are two keys rather than one date slot: имот.bg stamps its own page with
  // «обновена на DD.MM.YYYY», which is when the SOURCE published the number.
  // When that stamp is missing from the page we only know when WE fetched it.
  // Printing either one unqualified dates the figure by whichever we happened
  // to have — and on a page whose whole promise is freshness, "this is the
  // day the source published it" and "this is the day we downloaded it" are
  // not the same claim.
  srcDatedByPage: { bg: "обновена на {d}", en: "updated {d}" },
  srcDatedByFetch: { bg: "свалена от нас на {d}", en: "we fetched it {d}" },

  // Agency name used as the source label on Eurostat-sourced strip
  // cards (inflation, fastest-rising, unemployment). Other agencies
  // (NSI, BNB, ECB) are written inline in the per-card source-caption
  // row instead.
  srcEurostat: { bg: "Евростат", en: "Eurostat" },
  // The other three agency names, for the table's source line. They exist as
  // COPY keys rather than template literals for the same reason `srcEurostat`
  // does: a Latin "NSI"/"BNB" sitting inside otherwise-Bulgarian caption text
  // is the defect this file is meant to prevent.
  // No interior "·": the source list already separates its entries with one,
  // so "NSI · wages" reads as two sources rather than one.
  srcNsiWages: { bg: "НСИ заплати", en: "NSI wages" },
  // Two publishers on one figure, for the one number on `/market/` that joins
  // them. Named in full rather than as "Евростат" alone: a caption crediting
  // one publisher for a ratio built from two is the attribution error that
  // costs the most and shows the least.
  srcEurostatNsi: { bg: "Евростат и НСИ", en: "Eurostat and NSI" },
  srcEcbMir: { bg: "ЕЦБ MIR", en: "ECB MIR" },
  srcBnb: { bg: "БНБ", en: "BNB" },
  // Period qualifier on the strip sub-line ("за 1 г. · Евростат" / "in 1 yr ·
  // Eurostat"). Spelled out, because "YoY" does not read as a 12-month
  // comparison to a non-specialist.
  yoyLabel: { bg: "за 1 г.", en: "in 1 yr" },

  // --- /how/ — the country's figures, on a page of their own ---------------
  //
  // What is HERE and what is inline in `How.svelte`, and the line between them
  // is the one `ExplainerBand.svelte` already draws: long bilingual prose is
  // inlined as `.l-bg` / `.l-en` blocks in the component, because a paragraph
  // split across a copy file and a template is edited in two places and reads
  // as neither. Everything below is a LABEL, a column heading or a caption
  // with a placeholder in it — the things that repeat, that sit next to a
  // number, and that a reader compares against each other.
  //
  // Not one of them states a figure. The page is mostly prose around published
  // numbers, which makes it the likeliest place in the repository to
  // accidentally freeze today's headline into a sentence; every figure below
  // arrives as a substitution or is rendered beside the string, never inside
  // it (`verify_copy.mjs` §"no page writes a live figure into its prose").
  howTitle: { bg: "Вярно — числата за България", en: "Vyarno — Bulgaria's numbers" },
  // The route to the page, from the one paragraph on the calculator that is
  // already about where the numbers come from.
  howMoreK: {
    bg: "Всички числа за България, с източниците им",
    en: "All of Bulgaria's figures, with their sources",
  },
  // The route out of the home row, and the wording is the difference that
  // earns a second link: `howMoreK` offers the figures behind the calculator,
  // this one offers what the market is doing. A reader who has just been told
  // their home is N years of pay is asking the second question, not the first.
  marketMoreK: {
    bg: "Какво прави пазарът на жилища",
    en: "What the property market is doing",
  },
  // The page's two standing routes, and they exist because `howMoreK` was the
  // only one: a link inside a disclosure at the foot of the calculator, which
  // is open for nobody who has not already decided to read about method. A page
  // carrying every figure the site runs on, with its publisher and its period,
  // is the answer to "where does this come from" — the question a first-time
  // reader has before they trust a single number on the screen, and they ask it
  // at the top of the page rather than 4,000px down inside a closed drawer.
  //
  // Two labels rather than one because the slots differ: the header pill sits
  // beside two glyph buttons on a 360px bar, and the footer line has room to
  // say which numbers.
  // ONE WORD IN BOTH LANGUAGES, and the English half is the half that has to be
  // watched: «числата» is 75px and "the numbers" was 106px, which is what put
  // every English page's header past the right edge of a 360px phone while the
  // Bulgarian one fitted. A rule kept in one language is not a rule.
  howNavK: { bg: "числата", en: "numbers" },
  // One word, because it shares the bar with `howNavK`, a theme button and a
  // language link, and the bar has to stay on one line at 360px.
  //
  // The word has to name the SUBJECT rather than the page. «пазарът» is what
  // the page calls itself and it is not what a reader scanning a header reads:
  // beside «числата» it says "the market" of nothing in particular, and a
  // Bulgarian reader has to open it to find out which one. «имоти» is the word
  // they would use for the topic out loud. The precise «жилищен пазар» is two
  // words and puts this bar on a second row on every phone.
  //
  // The English half is held to the same rule and has 18px less room to do it
  // in, because "Vyarno" is wider than «Вярно» before a control is drawn.
  // "property" is 79px against «имоти»'s 55px, and measured at 360px that is
  // the 12px that wrapped the calculator's English bar to two rows. "homes" is
  // the everyday word for the same topic, which is exactly what «имоти» is to a
  // Bulgarian reader — the register is the match, not the dictionary.
  marketNavK: { bg: "имоти", en: "homes" },
  howFooterK: { bg: "Числата за България", en: "Bulgaria's numbers" },
  marketFooterK: { bg: "Пазарът на жилища →", en: "The property market →" },

  // Stat labels. Each one says what the number IS, so the figure above it can
  // be a bare number and the caption under it can be a source and a date.
  howKHeadline: {
    bg: "официална инфлация за 12 месеца",
    en: "official inflation over 12 months",
  },
  howKBasket: {
    bg: "сборът на 13-те групи, всяка според дела си",
    en: "the 13 groups added up, each by its share",
  },
  howKContrib: {
    bg: "осигуровки за сметка на работника",
    en: "employee social contributions",
  },
  howKTax: { bg: "данък върху дохода", en: "income tax" },
  howKCeiling: { bg: "максимален осигурителен доход", en: "maximum insurable income" },
  howKMinWage: { bg: "минимална брутна заплата", en: "minimum gross wage" },
  howKNationalWage: {
    bg: "средна брутна заплата в страната",
    en: "average gross wage, nationwide",
  },
  howKAar: { bg: "лихва по нови жилищни кредити", en: "rate on new home loans" },
  howKAprc: { bg: "ГПР по същите кредити", en: "APRC on the same loans" },
  howKStock: {
    bg: "средна лихва по всички изплащани кредити",
    en: "average rate across every loan being repaid",
  },
  howKLtv: { bg: "минимално самоучастие (БНБ)", en: "minimum down payment (BNB)" },
  howKDsti: {
    bg: "максимална вноска от чистия доход (БНБ)",
    en: "most of take-home that may go to the payment (BNB)",
  },
  howKMaturity: { bg: "максимален срок (БНБ)", en: "maximum term (BNB)" },
  howKObserved: {
    bg: "колко от дохода отива за вноска при новите кредити",
    en: "how much of income goes to the payment on new loans",
  },
  howKEurM2: { bg: "медианна цена на кв. м в София", en: "median €/m² in Sofia" },
  // The spread the prose calls "several times apart", so the claim has its own
  // figures under it rather than asking to be taken on trust. Both ends are
  // имот.bg's own per-district cells, picked rather than computed.
  howKEurM2Range: {
    bg: "най-евтиният и най-скъпият от {n} квартала",
    en: "the cheapest and the dearest of {n} districts",
  },
  howKHomePrice: {
    bg: "жилище от {m2} кв. м по тази медиана",
    en: "a {m2} m² home at that median",
  },
  howKUnemp: { bg: "безработица, сезонно изгладена", en: "unemployment, seasonally adjusted" },

  // Table column headings.
  howColGroup: { bg: "група", en: "group" },
  howColWeight: { bg: "дял в кошницата", en: "share of the basket" },
  howColYoy: { bg: "за 12 месеца", en: "over 12 months" },
  howColGross: { bg: "бруто", en: "gross" },
  howColNet: { bg: "нето", en: "net" },
  howColTaken: { bg: "взето", en: "taken" },
  // The two columns that say what is taken, and each is named after what it is
  // a share OF rather than after the term for it. «Ефективна ставка» and
  // «маргинална ставка» are the textbook pair, and between them they are the
  // whole finding of this table — a reader who has to look up both names has
  // been handed the table and not the finding.
  //
  // «Върху следващото евро» was the second one's plain-language attempt and it
  // is not plainer, it is just shorter: nobody is paid one euro at a time. The
  // rule the calculator's own wedge copy states — every marginal sentence says
  // «от увеличението», never «върху следващото евро», because a raise is the
  // thing that actually happens to a person — applies to a column heading too.
  howColEffective: { bg: "удържа се от заплатата", en: "taken from the pay" },
  howColMarginal: { bg: "удържа се от увеличението", en: "taken from a raise" },
  howColRung: { bg: "стъпало", en: "rung" },
  howColBasis: { bg: "измерено или пресметнато", en: "surveyed or modelled" },
  // The wage series is laid out a year to a row and a quarter to a column, so
  // the row header names the year and the four column headings are "Q1".."Q4",
  // which need no translation and are generated from `view/country.js#QUARTERS`.
  howColYear: { bg: "година", en: "year" },
  howColWage: { bg: "средна брутна заплата", en: "average gross wage" },
  howColCheck: { bg: "проверка", en: "check" },

  // Row markers.
  howSurveyed: { bg: "измерено", en: "surveyed" },
  howModelled: { bg: "пресметнато", en: "modelled" },
  // **The third answer, and it exists because the other two would both be
  // false.** A scalar re-level moves the whole SES shape by however much the
  // MEAN moved, and Bulgaria's minimum wage has moved faster — so the bottom
  // deciles land under a wage it is not lawful to pay a full-time employee and
  // `mirror.js#composeLadder` floors them. The number those rungs then publish
  // is the minimum wage out of the ЗБДОО: not Eurostat's measurement, and not
  // interpolated between two of theirs either. «Измерено» beside it credits
  // Eurostat with a figure from a Bulgarian budget act, on the one column whose
  // whole job is telling a measurement from a model.
  howAtMinWage: { bg: "минималната заплата", en: "the minimum wage" },
  howAtCeiling: { bg: "таванът", en: "the ceiling" },

  // Captions. `{s}` is the publisher, `{p}` the period the figure describes —
  // never the day we fetched it, which is a different fact and is in the data
  // panel on the calculator.
  howSrc: { bg: "{s} · {p}", en: "{s} · {p}" },

  // `/market/`'s labels — the figure cards' and the tables'. Inline prose on
  // that page is written as `.l-bg` / `.l-en` pairs in the component, the way
  // `How.svelte` writes its paragraphs; these are here because a label is
  // passed as a value to a snippet rather than written into the template.
  //
  // Every one of them names WHAT IS COUNTED rather than what it means. "Dwellings
  // sold", not "the market"; "owners with a loan", not "leverage". A label that
  // interprets is the cheapest place for a view of the market to get onto a page
  // that must not carry one.
  marketTitle: {
    bg: "Вярно — пазарът на жилища",
    en: "Vyarno — the property market",
  },
  // The four answers at the top of the page, and every one of them is a
  // SENTENCE that names what is counted, of whom, and against what. The row
  // they replaced was «67,8 · цени спрямо доходите, при 100 = собствената
  // дългосрочна средна» — a definition standing in for a statement, of a ratio
  // of a ratio to its own historical average, which the chart three paragraphs
  // above already drew with the rule at 100 in it.
  //
  // «толкова» carries the figure into the sentence, so the card reads as one
  // line out loud: «×2,7 — толкова пъти повече се плаща за жилище днес». A
  // label that repeats the unit («×2,7 пъти повече») says «times» twice.
  // **The English half is written as English, not carried across word for
  // word.** «толкова пъти повече се плаща» is how the figure is said out loud
  // in Bulgarian; "that many times more is paid for a home today" is the same
  // clause with the same parts in the same order, and it reads as a translation
  // because it is one — a passive with the subject withheld, under a number
  // that has already given it. English puts the home first and the multiple
  // where «толкова» is, which is the same job done the way the language does
  // it.
  mktKTimesNominal: {
    bg: "толкова пъти повече се плаща за жилище днес, отколкото през {year} г.",
    en: "a home today costs that many times what it cost in {year}",
  },
  // The year is on BOTH multiples and not only on the first. A card carrying a
  // «×N» whose base is stated on the card beside it reads correctly only while
  // the two stay adjacent, and it is the second card that a reader quotes — the
  // deflated figure is the one nobody else in Bulgaria publishes with a source
  // attached. A multiple with no anchor named is the mild form of what keeps a
  // figure off the range strip: a value that does not read on its own
  // (view/market.js#marketRangeStrip).
  mktKTimesReal: {
    bg: "толкова пъти повече от {year} г., след като се извади поскъпването на всичко останало",
    en: "that many times what it cost in {year}, once the rise in everything else is taken out",
  },
  // "dwellings households across the country bought in the quarter" is four
  // nouns before the verb that governs them, which English readers parse by
  // backtracking: «жилища са купили домакинствата» is ordinary Bulgarian and
  // the same order in English is a pile. The agent goes after the thing.
  mktKDeals: {
    bg: "жилища са купили домакинствата в цялата страна за тримесечието",
    en: "dwellings bought by households across the country in the quarter",
  },
  // «бруто» is taught by not being used: the wage in the division is the one
  // before tax and contributions, which is not the money anybody receives, and
  // a reader who takes it for take-home has the answer wrong by the whole tax
  // wedge.
  //
  // **That caveat belongs beside the figure and not inside this label.** It is
  // stated in full in the «наша сметка» block directly under the answer row —
  // on screen, in body type, unopened — and a card that carries it as well is
  // carrying it twice: at 360px the second copy runs the label to eight lines,
  // this card is the tallest of the four, and a flex row is as tall as its
  // tallest member, so the duplicate sets the height of the whole summary a
  // reader came for.
  mktKYearsOfPay: {
    bg: "толкова години средна заплата струва средното жилище",
    en: "the average home costs that many years of the average wage",
  },
  // The figure tables. A row of loose cards is what most of this page was, and
  // it reads as a wall: four boxes of the same size, the same weight and the
  // same colour, with the thing that separates them in the smallest type on the
  // card. Where the figures share a subject — three purchase types, one tenure
  // split, one census — a table says what the cards were trying to.
  //
  // Every one of these is a HEADING rather than a sentence. The prose above
  // each table carries the meaning; a column head that explains is a column
  // head that wraps to three lines at 360px.
  mktColKind: { bg: "Вид жилище", en: "Type of dwelling" },
  mktRowTotal: { bg: "Общо", en: "Total" },
  mktRowNew: { bg: "Ново строителство", en: "Newly built" },
  mktRowExisting: { bg: "Съществуващи", en: "Existing" },
  mktColCount: { bg: "Брой сделки", en: "Dwellings sold" },
  mktColYoy: { bg: "Спрямо година по-рано", en: "Against a year earlier" },
  mktColAvgPaid: { bg: "Средно платено", en: "Average paid" },
  mktColTotalPaid: { bg: "Платено общо", en: "Total paid" },
  mktColEurostat: { bg: "Евростат", en: "Eurostat" },
  mktColNsi: { bg: "НСИ", en: "NSI" },
  mktTblVolume: {
    bg: "Брой сделки по вид жилище",
    en: "Dwellings sold by type",
  },
  mktTblPrices: {
    bg: "Промяна в цените на сделките, от двамата публикуващи",
    en: "Change in transaction prices, from both publishers",
  },
  mktTblDeal: {
    bg: "Средно платено за жилище, и числата, от които идва",
    en: "Average paid per dwelling, and the figures it comes from",
  },
  mktTblTenure: { bg: "Как живеят хората", en: "How people live" },
  mktTblStock: { bg: "Жилищен фонд при преброяването", en: "The dwelling stock at the census" },
  mktColHowLive: { bg: "Как живеят", en: "How people live" },
  mktColShareOfPeople: { bg: "Дял от хората", en: "Share of people" },
  mktRowOwn: { bg: "В собствено жилище", en: "In a home they own" },
  mktRowOwnLoan: { bg: "— от тях със заем по жилището", en: "— of them with a loan on it" },
  mktRowOwnNoLoan: { bg: "— от тях без заем", en: "— of them with no loan" },
  mktRowRent: { bg: "Под наем", en: "Renting" },
  mktRowRentMarket: { bg: "— от тях по пазарна цена", en: "— of them at the market price" },
  // «на намален наем или без наем» rather than Eurostat's «reduced price or
  // free»: what it covers is a flat from a relative, a service flat, or living
  // where nobody charges you, and a reader has to be able to place themselves
  // in the row. It is by far the larger half of renting in Bulgaria, so a table
  // that showed only the market-price half described the smaller case.
  mktRowRentReduced: {
    bg: "— от тях на намален наем или без наем",
    en: "— of them at a reduced rent or none",
  },
  mktColDwelling: { bg: "Жилища", en: "Dwellings" },
  mktColHowMany: { bg: "Колко", en: "How many" },
  mktRowAllDwellings: { bg: "Всички жилища", en: "All dwellings" },
  mktRowOccupied: { bg: "Обитавани", en: "Occupied" },
  mktRowUnoccupied: { bg: "Необитавани", en: "Unoccupied" },
  mktRowUnoccupiedShare: { bg: "Дял необитавани", en: "Share unoccupied" },
  // The numbers tables under the charts. A plot shows a shape and hides every
  // value in it; twenty-one years of an index is exactly the case where a
  // reader wants ONE quarter and the chart cannot give it to them. The table is
  // also the WCAG text alternative and the thing that makes the page quotable,
  // so it carries every point rather than a sample.
  mktColPeriod: { bg: "Период", en: "Period" },

  // The range strip: one row per published series, saying where the newest
  // reading sits inside that series' own record. Positions, never scores —
  // nothing here weighs one row against another, and there is no combined
  // figure for a label to name (view/market.js#marketRangeStrip).
  mktTblRange: {
    bg: "Къде е всяко число в собствената си история",
    en: "Where each figure sits in its own record",
  },
  mktColRangeWhat: { bg: "Показател", en: "Indicator" },
  mktColRangeWhere: { bg: "Спрямо своята история", en: "Against its own history" },
  mktColRangeNow: { bg: "Сега", en: "Now" },
  // The two price rows are the same measurement twice, so the pair has to read
  // as a pair: the second is the first with the rise in everything else taken
  // out. A term of art in either half breaks that — a label on a strip is read
  // with nothing around it, so it may not depend on a paragraph elsewhere on
  // the page having been read first.
  mktRangeIndex: { bg: "цените на сделките", en: "transaction prices" },
  mktRangeIndexReal: {
    bg: "цените на сделките, без поскъпването на всичко останало",
    en: "transaction prices, with the rise in everything else taken out",
  },
  // **«промяната» alone is not enough on a strip that places two of them.** A
  // row headed «промяната за една година» three rows under «промяната в броя
  // сделки за една година» is a reader's mistake waiting to happen: a strip row
  // is read with nothing around it, and the two are a percentage each with no
  // unit to tell them apart. Each says what it is the change IN.
  mktRangeRate: {
    bg: "промяната в цените за една година",
    en: "the change in prices over one year",
  },
  mktRangeDealsChange: {
    bg: "промяната в броя сделки за една година",
    en: "the change in dwellings sold over one year",
  },
  mktRangeOverburden: {
    bg: "дял на хората с тежки разходи за жилище",
    en: "share of people with heavy housing costs",
  },
  // The track's own text alternative. A dot on a line is unreadable without
  // one, and the three readings it names are the three a reader would take off
  // the chart in the section this row links to.
  mktRangeMark: {
    bg: "{what}: най-ниско {low} през {lowAt}, най-високо {high} през {highAt}. Сега {now} през {nowAt}.",
    en: "{what}: lowest {low} in {lowAt}, highest {high} in {highAt}. Now {now} in {nowAt}.",
  },
  mktOpenQuarters: {
    bg: "виж числата — всички {n} тримесечия",
    en: "read the numbers — all {n} quarters",
  },
  mktOpenYears: { bg: "виж числата — всички {n} години", en: "read the numbers — all {n} years" },
  // The two disclosure labels that hold METHOD rather than numbers, and both
  // are plain statements of what is inside. A summary phrased as a question
  // («Как е сметнато?») asks the reader to decide whether they have the
  // question before it tells them what the answer is about; a reader skimming
  // for the derivation is looking for the noun.
  mktHowMade: { bg: "Как е сметнато", en: "How it is worked out" },
  mktHowLinks: {
    bg: "Какво отварят двете връзки под всяко число",
    en: "What the two links under every figure open",
  },
  mktColIndex: { bg: "Индекс", en: "Index" },
  mktColChange: { bg: "Промяна", en: "Change" },
  mktColShare: { bg: "Дял", en: "Share" },
  mktColSold: { bg: "Продадени жилища", en: "Dwellings sold" },
  mktColAvgNew: { bg: "Ново, средно", en: "New, average" },
  mktColAvgExisting: { bg: "Съществуващо, средно", en: "Existing, average" },
  mktTblIndexNumbers: {
    bg: "Индекс на цените на жилищата по тримесечия",
    en: "House price index by quarter",
  },
  mktTblRateNumbers: {
    bg: "Годишна промяна на цените по тримесечия",
    en: "Annual price change by quarter",
  },
  mktTblVolumeNumbers: {
    bg: "Брой продадени жилища по тримесечия",
    en: "Dwellings sold by quarter",
  },
  mktTblDealNumbers: {
    bg: "Средно платено за жилище по тримесечия",
    en: "Average paid per dwelling by quarter",
  },
  mktTblOverburdenNumbers: {
    bg: "Дял на хората с разходи за жилище над 40% от разполагаемия доход, по години",
    en: "Share of people spending over 40% of disposable income on housing, by year",
  },
  mktTblCityNumbers: {
    bg: "Годишна промяна на цените по градове и тримесечия",
    en: "Annual price change by city and quarter",
  },
  mktTblCityDealNumbers: {
    bg: "Годишна промяна на броя сделки по градове и тримесечия",
    en: "Annual change in the number of sales by city and quarter",
  },
  // Two disclosures under one table, so each has to say which series it opens.
  // «виж числата — всички 45 тримесечия» twice over is two identical labels on
  // two different sets of figures.
  mktOpenCityPrices: {
    bg: "виж цените по градове — всички {n} тримесечия",
    en: "read the prices by city — all {n} quarters",
  },
  mktOpenCityDeals: {
    bg: "виж броя сделки по градове — всички {n} тримесечия",
    en: "read the sales counts by city — all {n} quarters",
  },
  // The charts' accessible names. Built from the payload at render, because a
  // description naming a peak or a period is a figure written into prose.
  // Told in MULTIPLES of the base year, the way the chart's own axis is. A
  // screen reader hearing «двеста седемдесет и две цяло шейсет и три» has been
  // read a number and told nothing; «два цяло и седем пъти повече, отколкото
  // през две хиляди и петнайсета» is the same cell and is a sentence.
  mktChartIndex: {
    bg: "Колко пъти по-скъпи са жилищата спрямо {base} г., по тримесечия от {from} до {to}. Повече пари: най-ниско ×{low} през {lowAt}, най-високо ×{peak} през {peakAt}, а за {to} — ×{last}. По-скъпо от всичко друго: най-високо ×{realPeak} през {realPeakAt}, а за {to} — ×{realLast}.",
    en: "How many times dearer homes are than in {base}, by quarter from {from} to {to}. More money: the lowest is ×{low} in {lowAt}, the highest ×{peak} in {peakAt}, and for {to} it is ×{last}. Dearer than everything else: the highest is ×{realPeak} in {realPeakAt}, and for {to} it is ×{realLast}.",
  },
  mktChartRate: {
    bg: "Годишна промяна на цените на жилищата по тримесечия, от {from} до {to}. Най-силен спад {low} през {lowAt}, най-силно поскъпване {peak} през {peakAt}; за {to} — {last}.",
    en: "Annual change in house prices by quarter, {from} to {to}. The steepest fall is {low} in {lowAt} and the steepest rise {peak} in {peakAt}; for {to} it is {last}.",
  },
  mktChartDeal: {
    bg: "Средно платено за жилище по тримесечия, от {from} до {to}, отделно за ново строителство и за съществуващи жилища. За {to} — {new} евро за ново и {existing} евро за съществуващо.",
    en: "Average paid per dwelling by quarter, {from} to {to}, new builds and existing dwellings apart. For {to} it is €{new} for a new build and €{existing} for an existing one.",
  },
  mktChartOverburden: {
    bg: "Дял на хората, чието домакинство дава над 40% от разполагаемия си доход за жилище, по години от {from} до {to}. Най-високо {peak}% през {peakAt}, най-ниско {low}% през {lowAt}; за {to} — {last}%.",
    en: "Share of people whose household spends over 40% of its disposable income on housing, by year {from} to {to}. The highest is {peak}% in {peakAt} and the lowest {low}% in {lowAt}; for {to} it is {last}%.",
  },
  // The two panels drawn on one row of quarters, and their own accessible
  // names. The count panel needs its own because it is not the count — it is
  // the count's movement, in percent — and a reader hearing the price chart's
  // description under it would be told the same thing twice.
  mktChartVolumeChange: {
    bg: "Годишна промяна на броя продадени жилища по тримесечия, от {from} до {to}. Най-силен спад {low} през {lowAt}, най-силен ръст {peak} през {peakAt}; за {to} — {last}.",
    en: "Annual change in the number of dwellings sold, by quarter from {from} to {to}. The steepest fall is {low} in {lowAt} and the steepest rise {peak} in {peakAt}; for {to} it is {last}.",
  },
  // Above each panel rather than beside it. Two plots stacked on one row of
  // quarters have one x-axis between them, so the label is what says which
  // number each is — and it names the unit, because both panels are drawn in
  // percent and neither is a level.
  mktPanelDeals: {
    bg: "брой сделки, спрямо същото тримесечие година по-рано",
    en: "dwellings sold, against the same quarter a year earlier",
  },
  mktPanelPrices: {
    bg: "цените на сделките, спрямо същото тримесечие година по-рано",
    en: "transaction prices, against the same quarter a year earlier",
  },
  mktColSoldChange: { bg: "Сделки, промяна", en: "Sales, change" },
  mktColPriceChange: { bg: "Цени, промяна", en: "Prices, change" },
  mktTblPairNumbers: {
    bg: "Сделки и цени за едни и същи тримесечия",
    en: "Sales and prices, for the same quarters",
  },
  // The tint on the count chart. It marks the quarters that share the newest
  // reading's place in the year, so the sawtooth names itself: what a reader
  // sees repeating is the calendar, and the marked columns are the ones the
  // year-on-year figure actually compares.
  mktKeySeason: { bg: "същото тримесечие всяка година", en: "the same quarter each year" },
  // The per-city column that draws the two changes the row already prints. Its
  // head names the quarter rather than the measure, because the measure is the
  // two columns either side of it and the one thing the picture adds is that
  // they belong to the same quarter.
  mktColCityNow: { bg: "Двете, едно до друго", en: "The two, side by side" },
  mktKeyCityPrice: { bg: "цени", en: "prices" },
  mktKeyCityDeals: { bg: "брой сделки", en: "sales" },
  mktChartCityNow: {
    bg: "{city}: цените са {price}, а броят сделки {deals}, за {at} спрямо същото тримесечие година по-рано.",
    en: "{city}: prices are {price} and the number of sales {deals}, for {at} against the same quarter a year earlier.",
  },
  // The census bar. Two counts and the share between them, said once for a
  // reader who cannot see the drawing.
  mktChartStock: {
    bg: "Жилищата при преброяването: {occupied} обитавани и {unoccupied} необитавани, или {share}% от всички.",
    en: "Dwellings at the census: {occupied} occupied and {unoccupied} unoccupied, which is {share}% of them all.",
  },
  mktStockOccupied: { bg: "обитавани", en: "occupied" },
  mktStockUnoccupied: { bg: "необитавани", en: "unoccupied" },
  mktChartCity: {
    bg: "{city}: годишна промяна на цените по тримесечия, от {from} до {to}. За {to} — {last}%.",
    en: "{city}: annual price change by quarter, {from} to {to}. For {to} it is {last}%.",
  },
  // The deflated line, and the letters Eurostat put on their own points.
  //
  // «изчистено от инфлация» is the phrase a statistical release uses and a
  // person does not. What it MEANS is that everything else got dearer too and
  // that rise has been taken out, so the key says that instead — six words a
  // reader can repeat to somebody else, which is the test this page is written
  // to. The column head is short because it heads a column; the paragraph above
  // the chart is where the idea is taught.
  // **A key says what its line counts, in words a reader needs no paragraph to
  // decode.** The economists' name for the first is a nominal index, «в парите
  // от деня», and the phrase teaches nobody — it is a fixed expression whose
  // parts do not add up, and a reader who has not met it reads past the chart
  // rather than asking. What the line actually counts is money handed over.
  //
  // The pair has to be a pair, and «повече» in both halves is what makes it
  // one: more money against dearer-than-everything-else. That is also the whole
  // distinction — the price rose 2.7 times while money itself buys less, so
  // against the rest of a household's spending the rise is smaller. A key
  // naming the operation instead («без поскъпването на всичко останало») says
  // what was DONE to the line rather than what it now measures, which leaves a
  // reader holding a subtraction and no result.
  mktKeyNominal: { bg: "повече пари", en: "more money" },
  mktKeyReal: {
    bg: "по-скъпо от всичко друго",
    en: "dearer than everything else",
  },
  // **Not «Без инфлацията».** On this site "inflation" is a specific published
  // series — the HICP the whole calculator is built on — and Eurostat deflate
  // this index by the national accounts household consumption deflator, which
  // is a near neighbour and not that. A head naming the reader's own figure
  // invites them to check one series against another and find a discrepancy
  // that is not an error. The page's own phrase for the pair is «без
  // поскъпването на всичко останало», and this is its short form.
  mktColIndexReal: { bg: "Без поскъпването", en: "Rise taken out" },
  mktColFlag: { bg: "Бележка", en: "Note" },
  // Eurostat mark their own numbers and the letters mean nothing to a reader
  // alone. Printed only for the letters a series actually carries — a key
  // naming a marker that is nowhere on the chart is a question nobody can
  // answer.
  //
  // Each says what the letter MEANS for the number under it, rather than
  // naming it. «b — прекъсване в реда» is what a statistical release calls a
  // break and it tells a reader nothing about what to do with the figure;
  // «оттук нататък се мери по друг начин» tells them the two halves of the line
  // are not one measurement, which is the only reason the mark is drawn.
  mktFlagB: {
    bg: "b — оттук нататък се мери по друг начин",
    en: "b — measured a different way from here on",
  },
  mktFlagE: { bg: "e — изчислено, не измерено", en: "e — worked out rather than measured" },
  mktFlagP: { bg: "p — още не е окончателно", en: "p — not final yet" },
  mktFlagD: { bg: "d — броено по друго определение", en: "d — counted to a different definition" },
  mktFlagsLead: { bg: "Бележките са на Евростат:", en: "The notes are Eurostat's:" },

  // What a rule on a plot is. Written beside the chart, because a dashed line
  // nobody explained is a line a reader has to guess at.
  //
  // **The year is a slot and it was a literal.** Eurostat rebase — `I25_Q` is
  // the same measurement putting today at 109 instead of 273 — so «2015» typed
  // here stays right until the day it silently stops being, next to a chart
  // whose every digit is still correct. `price_index.base_year` is in the
  // payload and has been all along.
  // «средното за», not «нивото от». The base is the year's ANNUAL AVERAGE and
  // no single quarter of it equals 100, so the ×1 rule passes between that
  // year's own points rather than through one — and a caption promising "the
  // {year} level" sends a reader looking for the quarter that touches the line.
  mktRefIndexBase: { bg: "×1 = средното за {year} г.", en: "×1 = the {year} average" },
  mktRefZero: {
    bg: "0 = без промяна спрямо година по-рано",
    en: "0 = no change on a year earlier",
  },
  mktKeyNew: { bg: "ново строителство", en: "new builds" },
  mktKeyExisting: { bg: "съществуващи", en: "existing" },
  // A slot, never a written year: НСИ's city series starts where their workbook
  // starts, and a column head saying «От 2015 г.» is a claim about the data
  // that the next republication can falsify while every figure under it stays
  // right.
  // **The sparkline column's head describes the COLUMN, never a span the figure
  // beside it covers.** «От Q1 2015» sat between two percentage columns and was
  // read as the period those percentages were measured over — so a reader took
  // «Цени на сделките · Q1 2026 · От Q1 2015» as one claim, that prices had
  // moved by that much since 2015. Every cell in this table is a change on the
  // same quarter a year earlier, and the little chart is that same reading
  // plotted once per quarter, so naming the quarters is what the head has to
  // do. A bare «От {from}» names a starting point, and a starting point is
  // exactly what a cumulative reading needs to look plausible.
  mktColCityTrend: { bg: "Всяко тримесечие от {from}", en: "Every quarter since {from}" },

  // The second link under every figure, and it exists because the first one
  // does not land where a reader expects. Eurostat's table view opens with all
  // of a dataset's units at once — `prc_hpi_hsnq` carries a count, two indices
  // and three rates — so a reader following «16 227 · Евростат» arrives at a
  // table showing −19.8 for the same country and quarter, which is the
  // quarter-on-quarter rate. That is one click from the page's whole argument
  // to a figure that contradicts it. The query link returns this number and
  // nothing else.
  mktSrcQuery: { bg: "точно това число", en: "this exact figure" },
  // The charts' accessible names. Built from the payload at render, because a
  // description naming a peak or a period is a figure written into prose.
  mktChartVolume: {
    bg: "Брой продадени жилища по тримесечия, от {from} до {to}. Най-много са {peak} през {peakAt}, а през {to} — {last}.",
    en: "Dwellings sold per quarter, {from} to {to}. The highest is {peak} in {peakAt}; in {to} it is {last}.",
  },

  // The six-city table's column heads and its accessible name. Short, because
  // the columns are narrow and the sentence above the table already says these
  // are changes rather than levels.
  mktColCity: { bg: "Град", en: "City" },
  // **Both figure columns name the comparison, not just the subject.** Every
  // cell under them is НСИ's «изменение спрямо съответното тримесечие на
  // предходната година» — a change on a year earlier — and «Цени на сделките»
  // and «Брой сделки» are the names of LEVELS. A head naming a level over a
  // column of changes leaves the correction to the paragraph above the table,
  // and a table is read without its paragraph. The column head is where a
  // reader who scrolled straight to their own city meets the figure.
  //
  // Long enough to wrap, which the `.fig-table thead th.num` rule below already
  // permits and the cells still refuse — the same trade «Спрямо година по-рано»
  // bought on the volume table.
  mktColPrice: {
    bg: "Цени на сделките, спрямо година по-рано",
    en: "Transaction prices, against a year earlier",
  },
  mktColDeals: {
    bg: "Брой сделки, спрямо година по-рано",
    en: "Number of sales, against a year earlier",
  },
  mktTblCities: {
    bg: "Цени и брой сделки по градове",
    en: "Prices and number of sales by city",
  },
  // НСИ's name, for a caption that is otherwise Bulgarian. A Latin "NSI" inside
  // Bulgarian caption text is the defect `srcEurostat` exists to prevent.
  srcNsi: { bg: "НСИ", en: "NSI" },
  // The two publishers the strip never names, because no card on it cites
  // them: имот.bg is Latin in both languages, and ДВ has an English name worth
  // spelling out for a reader who has never met it.
  howSrcImot: { bg: "имот.bg", en: "imot.bg" },
  // What goes in `howSrc`'s `{p}` slot for the four payroll figures. ДВ cannot
  // be linked per issue — their permalinks are built from a session-side id the
  // issue number does not yield — so P9 says the caption carries the instrument
  // itself, and an issue plus its date is what ДВ's own archive is searched by.
  // A year identifies no act: every one of the four figures is set by a
  // different statute promulgated in a different issue of the same year.
  howSrcDvIssue: { bg: "бр. {issue} от {date}", en: "issue {issue} of {date}" },
  howSrcDv: { bg: "Държавен вестник", en: "the State Gazette" },
  // The Eurostat disclosure obligation, on the two surfaces that carry the
  // figures it applies to: the modelled ladder, the €/m² median across
  // имот.bg's districts for one city, and the change since that city's baseline
  // year built on it. The link goes to the sources document, which carries the
  // full text and the non-responsibility wording.
  oursNote: {
    bg: "Това число е наше, а не на институцията под него — сметнато е от публикуваните ѝ данни.",
    en: "This figure is ours rather than the publisher's below it — worked out from their published data.",
  },
  oursMoreK: { bg: "Как и защо", en: "How, and why" },
  // Under a figure of ours, in `howSrc`'s `{s}` slot, where every other card
  // puts a publisher's name. Eurostat's terms permit derivation on condition it
  // is disclosed, and Σ over the thirteen divisions is a figure Eurostat never
  // printed — «Евростат» in that slot on a card beside their own all-items rate
  // hands them a number 1.3 pp from the one they published, in their own voice,
  // on the page whose whole claim is that a reader can tell whose figure is
  // whose. The inputs are still theirs and the caption still says so.
  howSrcOurSum: {
    bg: "наша сметка от числата на Евростат",
    en: "our sum over Eurostat's figures",
  },
  // What each route out gives a reader who has read the figures. The link text
  // alone answers "where does this go" and not "why would I", and the two
  // destinations answer different questions — one puts the reader's own numbers
  // against these, the other carries the same country at a different subject.
  howToCalculatorK: { bg: "Сметни своята инфлация", en: "Work out your own inflation" },
  howToCalculatorSub: {
    bg: "със своя кошница и своята заплата, тук в браузъра",
    en: "with your own basket and your own pay, here in the browser",
  },
  howToMarketK: { bg: "Пазарът на жилища", en: "The property market" },
  howToMarketSub: {
    bg: "колко жилища се купуват, колко се плаща за тях и как се движи официалният индекс",
    en: "how many dwellings are bought, what is paid for them and how the official index moves",
  },

  // --- Sharing -------------------------------------------------------------
  //
  // EVERY CLAIM BELOW IS IN THE FIRST PERSON, AND THAT IS THE ONE RULE THIS
  // BLOCK HAS.
  //
  // The rest of the app says «ти» because it is talking to the reader. These
  // sentences are spoken BY the reader TO somebody who has never opened the
  // site, so «твоята кошница поскъпна» arrives in a stranger's chat addressing
  // the wrong person. The reader is the author here, not the audience.
  //
  // The invitation is the deliberate exception and is checked for being one:
  // «Сметни своята» is aimed at whoever is reading, and it is what turns a
  // statement into a reason to open the site.
  //
  // Nothing here carries a € amount, and that is a privacy boundary rather
  // than a stylistic one: `mirror.js#extraPerMonth` is salary × r/(100+r), so
  // a euro figure printed beside the rate it came from publishes the sender's
  // pay to everyone the message reaches (docs/principles.md P2, and
  // `view/share.js#sharePayload` is where the rule is made unexpressible rather than
  // merely asserted).
  //
  // A noun phrase, never «поскъпна с {p}%»: a basket weighted onto the groups
  // that are FALLING makes the figure negative, and the verb then contradicts
  // its own number. The comparative closing clause survives either sign — if
  // both fell and mine fell further, «при мен е по-евтино» is still what
  // happened.
  shareWindowY1: { bg: "за последната година", en: "over the past year" },
  shareWindowSince: { bg: "от {y} насам", en: "since {y}" },
  // THE SECOND FIGURE IS A BASKET, AND EVERY SURFACE HAS TO CALL IT ONE.
  //
  // It is `officialInflation` — the thirteen published divisions under
  // Eurostat's own weights, Σ(w·r) — and it is NOT the all-items rate Eurostat
  // publishes. The two differ, because a 12-month window straddles the December
  // chain link and because the divisions and the headline can be a month apart
  // during the flash: 5,4% against 4,1% at the time of writing.
  //
  // «Средната за България» said the second thing while carrying the first. The
  // results card has already been through this once — the same number used to be
  // «официалната кошница» and was renamed «средностатистическата кошница»
  // precisely because readers took it for the headline — and the share strings
  // then reached for a name that reads as the headline harder than the one that
  // was rejected. On the surface that carries no link to check.
  //
  // So the noun travels with the number. A stranger reading this in a chat is
  // told what the 5,4% is a rate OVER, and «средният българин» in the card's own
  // verdict lines is the same person.
  shareLineDearer: {
    bg: "Моята кошница {w}: {p}%. Средната кошница за България: {o}%. При мен е по-скъпо от средното.",
    en: "My basket {w}: {p}%. The average Bulgarian's basket: {o}%. Mine is dearer than average.",
  },
  shareLineCheaper: {
    bg: "Моята кошница {w}: {p}%. Средната кошница за България: {o}%. При мен е по-евтино от средното.",
    en: "My basket {w}: {p}%. The average Bulgarian's basket: {o}%. Mine is cheaper than average.",
  },
  shareLineClose: {
    bg: "Моята кошница {w}: {p}%. Средната кошница за България: {o}%. Горе-долу колкото средното.",
    en: "My basket {w}: {p}%. The average Bulgarian's basket: {o}%. Much the same as average.",
  },
  // ONE rate, because before a basket is described the three lines above are
  // «Моята кошница: 5,4%. Средната кошница за България: 5,4%. Горе-долу
  // колкото средното.» — the same figure twice and a clause reporting their
  // sameness as a finding. The four chips still say «моята кошница»: clicking
  // one is a claim somebody makes, arriving is not.
  //
  // **Passive because a participle here agrees with the sender.** «Още не съм
  // описал» is masculine and nothing knows who is sending it; every other
  // first-person string on these surfaces is ungendered by carrying no
  // participle at all.
  shareLineNoBasket: {
    bg: "Кошницата ми още не е описана. Средната кошница за България {w}: {o}%.",
    en: "I haven't described my own basket yet. The average Bulgarian's basket {w}: {o}%.",
  },
  // The full address, not the bare domain: this is the one surface that CAN
  // carry a link, and P9 asks a format to scale verifiability down only where
  // it physically cannot. The image, which cannot, falls back to `shareCardCta`
  // below and the domain in plain text.
  shareCta: { bg: "Сметни своята: {u}", en: "Work out yours: {u}" },

  // --- The generated image -------------------------------------------------
  //
  // Read by a stranger, at a glance, with no link to click — so the source
  // name, the period and the domain are on the picture itself (P9).
  shareCardKicker: { bg: "моята кошница · {w}", en: "my basket · {w}" },
  // What the picture is of when the sender has not described a basket. The
  // kicker names the figure below it, so it has to change with the figure's
  // owner — a card headed «моята кошница» over the country's number says the
  // one thing the sentence beside it is being rewritten to stop saying.
  shareCardKickerOfficial: {
    bg: "средната кошница за България · {w}",
    en: "the average Bulgarian's basket · {w}",
  },
  shareCardMine: { bg: "моята кошница", en: "my basket" },
  // The bar label, under the same rule as the sentences above: it names a
  // basket because that is what the figure beside it is.
  shareCardAverage: { bg: "средната кошница за България", en: "the average Bulgarian's basket" },
  // The same three verdicts the results card states in the second person. They
  // are written out again rather than shared with `m-verdict` because the
  // person changes; keeping the wording otherwise identical is what stops the
  // image and the screen it came from reading as two different judgements.
  shareCardVerdictDearer: {
    bg: "При мен е по-скъпо, отколкото при средния българин.",
    en: "For me it's pricier than for the average Bulgarian.",
  },
  shareCardVerdictCheaper: {
    bg: "При мен е по-евтино, отколкото при средния българин.",
    en: "For me it's cheaper than for the average Bulgarian.",
  },
  shareCardVerdictClose: {
    bg: "Кошницата ми е близо до средната.",
    en: "My basket is close to the average one.",
  },
  // The fourth state, and the one that is not a verdict: with no basket
  // described there are not two things to compare, so the line says which
  // question is still open instead of answering it. It replaces the three above
  // rather than joining them — a picture cannot carry both «Кошницата ми е
  // близо до средната» and «още не съм я описал» without one of them being the
  // reader's basket and the other not.
  //
  // No em dash, for the reason the block below `shareCardTop` gives: «—» is the
  // glyph `format.js` emits for a value it could not render, and the check that
  // finds an unfilled slot on a card already in somebody's chat looks for it.
  // Ungendered for the reason `shareLineNoBasket` above gives at length: a
  // past participle here agrees with whoever is sending the picture, and the
  // app has never been told.
  shareCardVerdictNoBasket: {
    bg: "Кошницата ми още не е описана.",
    en: "I haven't described my own basket yet.",
  },
  // {pp} of {p} points, never a euro amount and never a sum the reader is
  // invited to add up: this is one row's share of the total, which is exactly
  // what the ranked list beneath the results already says.
  //
  // **No string drawn onto the card may contain an em dash**, which is why this
  // one is punctuated unlike every other Bulgarian sentence in the file. «—» is
  // what `format.js` returns for a value it cannot render, and the card is the
  // one surface that leaves the device: a reader finds out the period was
  // unparseable when the picture is already in somebody else's chat. So the
  // dash the card cannot use is the dash the check looks for
  // (`verify_copy.mjs` §"every line on the share card is filled in").
  shareCardTop: {
    bg: "Най-тежко удря: {c} - {pp} от {p} пункта",
    en: "The biggest bite: {c} - {pp} of {p} points",
  },
  // THE PICTURE HAS TO NAME WHAT ITS BIGGEST OBJECT COUNTS. The card is read by
  // a stranger in a chat window with nothing else on screen, and the largest
  // thing on it is a numeral: «6,5» over a kicker naming a basket, two bars and
  // a verdict about what is dearer. Between them those imply a price rise and
  // none of them says one, so the word arrives here, on the line that already
  // carries the publisher and the period P9 asks for.
  //
  // A noun, never «поскъпна с». A basket weighted onto the divisions that are
  // FALLING makes the figure negative, and a verb then contradicts its own
  // number — the same rule the sentences above this block are written under.
  // «Инфлация» survives either sign, which is why it and not «поскъпване».
  shareCardSource: {
    bg: "Инфлация по данни на Евростат (HICP), {d}",
    en: "Inflation from Eurostat (HICP) data, {d}",
  },
  shareCardCta: { bg: "сметни своята на {u}", en: "work out yours at {u}" },

  // --- The share block in the results card ---------------------------------
  //
  // These three ARE the app talking to the reader, and are in the second
  // person on purpose.
  shareHead: { bg: "Сподели числото си", en: "Share your number" },
  // The block renders the picture rather than describing it, and this line is
  // why: a product whose claim is that a reader's figures stay on their device
  // should show the whole of what leaves it, not put it behind a button.
  shareNote: {
    bg: "Това е всичко, което напуска устройството ти. Заплата, наем и спестявания не влизат в картинката — от процент не се вади сума.",
    en: "This is everything that leaves your device. Salary, rent and savings are not in the picture - a percentage yields no amount.",
  },
  shareWait: {
    bg: "Картинката ще е готова, щом числата се заредят.",
    en: "The picture is ready once the figures load.",
  },
  // The button hands the picture to the OS share sheet, whose destinations are
  // social apps and group chats, so the label names the act rather than the
  // transport: a word like «изпрати» / "send" promises one named recipient that
  // the sheet never asks for. The two buttons beside it name their own outcome
  // the same way — copy the text, download the picture.
  shareSend: { bg: "Сподели", en: "Share" },
  shareCopy: { bg: "Копирай текста", en: "Copy the text" },
  shareCopied: { bg: "Копирано", en: "Copied" },
  shareDownload: { bg: "Свали картинката", en: "Download the image" },
  // The chat links, shown where the browser has no share sheet — which is most
  // desktops, and where a reader was previously left with copy and download.
  //
  // **The note says what does NOT travel, and that is the whole reason it is
  // here.** A `viber://`, `t.me` or `wa.me` address carries text and cannot
  // attach a file, so the picture the block is showing stays behind. The block
  // claims to render the whole of what leaves (`shareNote` below); three links
  // that looked like the button beside them while sending half of it would make
  // that claim false on the surface it is written on. Naming the absence is the
  // same move `shareNote` makes about the salary.
  //
  // «Изпрати» here where `shareSend` above deliberately avoids it: the share
  // sheet asks for no recipient, so «изпрати» would promise one it never
  // requests. Each of these three opens its app on a chat picker, so one named
  // recipient is exactly what the reader is about to choose.
  shareChatNote: {
    bg: "Връзките отдолу пращат само изречението — картинката не тръгва с тях. Свали я и я прикачи, ако искаш да пътува и тя.",
    en: "The links below send the sentence only - the picture does not travel with them. Download it and attach it yourself if you want it to go too.",
  },
  shareChatViber: { bg: "Изпрати във Viber", en: "Send to Viber" },
  shareChatTelegram: { bg: "Изпрати в Telegram", en: "Send to Telegram" },
  shareChatWhatsApp: { bg: "Изпрати в WhatsApp", en: "Send to WhatsApp" },
  // The alt text describes the picture, so it names the second figure the way
  // the picture does. A screen-reader user is the one reader who gets this
  // sentence INSTEAD of the bars, not alongside them.
  shareCardAlt: {
    bg: "Картинка за споделяне: моята кошница {p}% срещу средната кошница за България {o}%.",
    en: "Share image: my basket {p}% against the average Bulgarian's basket {o}%.",
  },
};

/**
 * What kind of work is inside each НСИ section, in the words people use.
 *
 * **НСИ's section names are written for the classification, not for the person
 * being classified.** Section J is «Създаване и разпространение на информация и
 * творчески продукти; далекосъобщения», and a software developer scanning
 * nineteen lines of that register does not stop on it — the word for their job
 * is two levels down, in division 62, «Дейности в областта на информационните
 * технологии», which the picker never shows. A list somebody cannot find
 * themselves in is a feature that quietly serves the readers who already know
 * their КИД code.
 *
 * So each option leads with the everyday words and carries НСИ's full name
 * after them. **The name is never replaced**, here or anywhere: the moment a
 * section is picked, every sentence stating a figure uses `bg_name` / `en_name`
 * straight from the payload, and the source line credits НСИ over their own
 * label. This is navigation; the claims stay theirs. `verify_view_payroll.mjs`
 * holds both halves — the option ends with НСИ's name in full, and no hint
 * reaches a figure.
 *
 * **Every item is a division inside the section it describes**, off НСИ's own
 * КИД-2008 structure — «кол центрове» is 82, «зъболекари» is 86, «кино и ТВ»
 * is 59 and 60. That is what keeps these from drifting into a claim: writing
 * «ИТ» alone for J would be one, because J is also publishing, film, radio and
 * telecoms, and its average is diluted across all of it. Naming the breadth
 * costs a few words and tells the reader what the figure is an average OF —
 * the same thing `sectorCoverage` says about who is counted.
 *
 * An empty string is a decision, not a gap: `Строителство`, `Образование` and
 * `Хотелиерство и ресторантьорство` say what they are, and a hint under them
 * would be words a reader has to skip. Keyed by `en_name`, the payload's own
 * key, so a section НСИ rename or add turns up as a red test rather than as a
 * line with nothing in front of it.
 */
export const SECTOR_HINTS = Object.freeze({
  "Agriculture,forestry and fishing": {
    bg: "земеделие, гори, риболов",
    en: "farming, forestry, fishing",
  },
  "Mining and quarrying": {
    bg: "мини и кариери, нефт и газ",
    en: "mines and quarries, oil and gas",
  },
  Manufacturing: {
    bg: "заводи и фабрики, храни, облекло, машини, електроника",
    en: "factories, food, clothing, machinery, electronics",
  },
  "Electricity,gas,steam and air conditioning supply": {
    bg: "ток, топлофикация, газ",
    en: "power, district heating, gas",
  },
  "Water supply,sewerage,waste management and remediation activities": {
    bg: "ВиК, отпадъци, рециклиране",
    en: "water, waste, recycling",
  },
  Construction: { bg: "", en: "" },
  "Wholesale and retail trade;repair of motor vehicles and motorcycles": {
    bg: "магазини, търговия на едро, автосервизи",
    en: "shops, wholesale, car repair",
  },
  "Transportation and storage": {
    bg: "шофьори, куриери, складове, поща",
    en: "drivers, couriers, warehouses, post",
  },
  "Accommodation and food service activities": { bg: "", en: "" },
  "Information and communication": {
    bg: "ИТ и софтуер, телекоми, издателства, кино и ТВ",
    en: "IT and software, telecoms, publishing, film and TV",
  },
  "Financial and insurance activities": {
    bg: "банки, застрахователи, пенсионни фондове",
    en: "banks, insurers, pension funds",
  },
  "Real estate activities": {
    bg: "агенции за имоти, наеми",
    en: "estate agencies, letting",
  },
  "Professional,scientific and technical activities": {
    bg: "адвокати, счетоводители, инженери, реклама, наука",
    en: "lawyers, accountants, engineers, advertising, research",
  },
  "Administrative and support service activities": {
    bg: "охрана, почистване, подбор на кадри, кол центрове",
    en: "security, cleaning, recruitment, call centres",
  },
  "Public administration and defence;compulsory social security": {
    bg: "държавна и общинска администрация, армия, полиция",
    en: "state and municipal administration, army, police",
  },
  Education: { bg: "", en: "" },
  "Human health and social work activities": {
    bg: "болници, лекари, зъболекари, социални грижи",
    en: "hospitals, doctors, dentists, social care",
  },
  "Arts,entertainment and recreation": {
    bg: "театри, музеи, спорт, хазарт",
    en: "theatres, museums, sport, gambling",
  },
  "Other service activities": {
    bg: "сдружения, ремонт на техника, фризьори и козметика",
    en: "associations, repairs, hairdressing and beauty",
  },
});

/**
 * Returns the BG or EN string from a {bg, en} pair, with optional
 * {placeholder} substitution.
 */
export function t(bgEnObj, lang = "bg", subs = {}) {
  let s = bgEnObj[lang] ?? bgEnObj.bg;
  for (const [k, v] of Object.entries(subs)) {
    s = s.replaceAll("{" + k + "}", String(v));
  }
  return s;
}
