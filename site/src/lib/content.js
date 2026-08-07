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
  // Offline sentinel for the home block when sofia_price.json hasn't
  // loaded yet (first paint, offline build). The live value comes from
  // data.sofiaPrice?.eur_per_m2_median at runtime (the imot.bg scrape).
  eurPerM2_offlineFallback: 2500,
  // Country-average €/m²: no official BG €/m² level series exists
  // (Eurostat hpi_ndh_q is a rate-of-change index only), so this is
  // reserved null. The "country average" line in the national strip
  // reads HPI cumulative instead.
  eurPerM2_country: null,
  eurPerM2_source: "Sofia median from imot.bg/sredni-ceni (data/published/sofia_price.json)",
  m2Default: 70,
  // Offline sentinel for the Sofia comparator card, used only before
  // sofia_salary.json loads.
  //
  // **It is НСИ's own published quarter**, in the same envelope shape as the
  // payload, because a sentinel is a shipped file like any other and the rule
  // holds for it too: every НСИ figure this project ships is one НСИ published
  // (docs/legal.md §НСИ). It goes through `view.js#sofiaQuarter` like the live
  // payload, so there is one implementation and the offline figure cannot drift
  // from the online one.
  //
  // Refresh via `vyarno-pipeline refresh --source sofia-salary`, then copy
  // `value` and `ref_period` across from the payload.
  sofiaSalaryFallback: {
    value: 1915,
    ref_period: "2026-Q1",
    // НСИ star the year until they finalise it, and the quarter this sentinel
    // mirrors is starred. A sentinel that dropped the marker would show the
    // pre-load card as settled and the loaded one as provisional, on the same
    // figure — so it carries whatever `sofia_salary.json` carries.
    is_preliminary: true,
    series_by_period: { "2026-Q1": 1915 },
  },
  sofiaMeanGrossSource:
    'NSI quarterly labour survey - Sofia-city statistical region, average monthly gross wage, latest published quarter (Labour_1.1.2.2_EUR_EN.xlsx, "{year}trimes" sheets, row "-Sofia cap.")',
  sofiaMeanGrossSourceUrl: "https://www.nsi.bg/en/statistical-data/179/569",
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
  privacy: {
    bg: "Всичко е анонимно, не събираме лични данни",
    en: "Everything is anonymous, we don't collect personal data",
  },
  brandSmall: { bg: "икономиката, честно", en: "the economy, honestly" },
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
  howTblLadder: { bg: "стъпалата на заплатите в София", en: "the Sofia pay rungs" },
  // The header's two buttons carry a glyph and nothing else, so the accessible
  // name is the only thing that says what they do — and it has to arrive in the
  // language the reader is being served. BG is the primary language here; an
  // English-only label leaves a Bulgarian screen-reader user with the one
  // control they cannot guess at from its content.
  themeToggle: { bg: "смени темата", en: "toggle theme" },
  langToggle: { bg: "смени езика", en: "toggle language" },

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
  // NOT a claim about what people earn. We publish no national median net
  // wage — the only median in the data is the Sofia net ladder's P50 (~€1104),
  // and this placeholder sits at its 34th percentile, on the same screen as
  // the "median NET pay · Sofia" card. Calling it "typical" or "the median"
  // would be false twice over. docs/principles.md P7: no unsourced defaults.
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
  // either way (view.js#netsOf).
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
  // trust. Rendered from mirror.js#bgPayslipFromNet via view.js#payslipPanel —
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
  // The default view: Eurostat's official 12-month inflation for the latest
  // published month, taken verbatim (prc_hicp_minr RCH_A). Plain language —
  // "инфлация" is the word a regular person uses; no dataset codes.
  anchorY1Hint: {
    bg: "официалната инфлация на Евростат за последните 12 месеца (до {latest_month})",
    en: "Eurostat's official 12-month inflation, to {latest_month}",
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
  basketCarved: {
    bg: "Имаш активна вноска {mort} €/мес — сумите вдясно вече са от остатъка след нея. Процентите не се променят.",
    en: "You have a €{mort}/mo mortgage active - the € per group is now carved out of what's left after it. Percentages stay the same.",
  },
  // The rent case mirrors basketCarved, so the €/group tracks the leftover
  // after rent exactly as it does after a mortgage payment.
  rentCarved: {
    bg: "Плащаш наем {rent} €/мес — сумите вдясно вече са от остатъка след него. Процентите не се променят.",
    en: "You pay €{rent}/mo rent - the € per group is now carved out of what's left after it. Percentages stay the same.",
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
  // Two jobs, and it exists because of where the results card sits. On a
  // phone it is rendered FIRST (card.css) and the salary field lands 3,100px
  // below it, so «числото е просто начална стойност» — the hint attached to
  // the input — reaches the reader four screens after «≈ €46 повече всеки
  // месец ти струва същият живот». A caveat that far from its number is not a
  // caveat. So the note is repeated here, where the figure is, and it names
  // the amount rather than describing it: a reader who has scrolled past
  // «€900» in the field can match the two.
  //
  // It says «не с твоята» and stops. The card is not wrong — it is a worked
  // example, which is the point of having a default at all — and calling it
  // wrong would teach the reader to distrust figures that are about to become
  // theirs. Naming whose money it is does the whole job.
  startingSalary: {
    bg: "Сметнато е с начална заплата €{s} на месец — не с твоята.",
    en: "Computed with a starting pay of €{s} a month - not yours.",
  },
  // The button beside it. This is the only route from the results to the
  // inputs on a phone, where the two are four screens apart and nothing else
  // on the page links them.
  startingSalaryCta: { bg: "Въведи своята заплата", en: "Enter your own pay" },
  yourBasket: { bg: "твоята кошница", en: "your basket" },
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
    bg: "По чиста заплата си пред <b>{r}%</b> от работещите в София — приблизително, не точно.",
    en: "By take-home pay you are ahead of <b>{r}%</b> of Sofia earners - roughly, not exactly.",
  },
  // The household form states a range and says why it is one: the rungs are
  // individual earnings, so two wages of €900 are two people at the 34th
  // percentile rather than one person at the 78th.
  answerStandMany: {
    bg: "Заплатите в домакинството са пред <b>{low}%</b> до <b>{high}%</b> от работещите в София — всяка поотделно, приблизително.",
    en: "The household's wages are ahead of <b>{low}%</b> to <b>{high}%</b> of Sofia earners - each on its own, roughly.",
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
  // «Въведи заплата ГОРЕ» is what it used to say, and the direction was wrong
  // on every phone: the results card is ordered first there, so the field is
  // below. A prompt that points the wrong way is worse than one that points
  // nowhere, and this row has no need to say where — the button under the
  // headline figure is what carries the reader to the field.
  pctNoSalary: {
    bg: "Въведи своята заплата, за да видиш къде си.",
    en: "Enter your own pay to see where you sit.",
  },
  // Phrased from the BOTTOM ("ahead of {r}%"), NOT "top {n}%". "Top 63%" for
  // a below-median pay reads as an achievement when it isn't. {r} is the rank
  // from the bottom (mirror.js percentile), so higher pay → bigger number →
  // honest and monotonic. Comparator is now INDIVIDUAL NET PAY of Sofia
  // earners: the SES gross-earnings distribution (earn_ses_monthly) re-leveled
  // to the live NSI Sofia average and converted to net — same unit as the
  // input. {m} is the net median (ladder[5]), already monthly (no ÷12).
  pctTopTxt: {
    bg: "По нетна заплата изпреварваш <b>{r}%</b> от работещите в София. Медианната нетна заплата е <b>€{m}/мес</b>.",
    en: "By net pay you're ahead of <b>{r}%</b> of Sofia earners - the median net pay is <b>€{m}/mo</b>.",
  },
  // With several incomes the sentence stops being second person, because the
  // ladder ranks PEOPLE. «Изпреварвате 61%» addressed to a household is a claim
  // about a person who does not exist: the rungs are individual full-time
  // earnings, and a household total read off them is the unit mismatch that
  // once put every Sofia salary in the 99th percentile. So each income gets its
  // own line and the median is stated once underneath.
  pctEarnerLine: {
    bg: "Доход {n} — <b>€{s}</b> — изпреварва <b>{r}%</b> от работещите в София.",
    en: "Income {n} - <b>€{s}</b> - is ahead of <b>{r}%</b> of Sofia earners.",
  },
  pctMedian: {
    bg: "Медианната нетна заплата в София е <b>€{m}/мес</b>.",
    en: "The median net pay in Sofia is <b>€{m}/mo</b>.",
  },
  pctHouseholdNote: {
    bg: "Класираме всяка заплата поотделно — подредбата показва какво изкарват отделните хора, а не домакинствата. Две заплати по €900 не са един човек с €1800.",
    en: "Each wage is ranked on its own - the ladder is what individual people earn, not what households do. Two wages of €900 are not one person on €1,800.",
  },
  // The comparison is now net-vs-net (individual), so it's a direct rank, not
  // a cross-unit approximation. The remaining caveat: the distribution SHAPE
  // is from the 4-yearly Eurostat earnings survey, re-leveled to today's Sofia
  // average — the level is live, the spread is modelled. And it's Sofia, the
  // highest-wage region, so a national rank would be a few points higher.
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
  // exact word they are looking for — on the one card whose job is to admit
  // how the number is built. «преизчисляваме» states the same operation and
  // carries no such reading. The same goes for the explainer band, `legal.js`
  // and the two READMEs, which describe this operation too.
  // **The survey is national, and the sentence has to say so.**
  // `salary_dist.json` carries the admission in its own `disclaimer` field —
  // "the shape is national: using it for Sofia assumes Sofia's dispersion
  // tracks the national one" — and a payload field is read by nobody the card
  // is for. Every other clause here names a limit the reader can weigh (the
  // survey year, who it leaves out, that the level is re-computed, that Sofia
  // flatters them); leaving out the one assumption that the ladder's SHAPE is
  // borrowed from the country made the list read as complete when it was not.
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
  pctCaveat: {
    bg: "Сравняваме всяка чиста заплата с това, което изкарват останалите в София. Кой колко изкарва знаем от изследване на Евростат от {shapeYear} г. (само хора на пълен работен ден, без държавната администрация), но то е за цялата страна, а не отделно за София, така че приемаме, че разликата между ниските и високите заплати в София е като в останалата страна. Самите суми преизчисляваме спрямо последната средна заплата за София на НСИ, за да са актуални. Затова числото показва приблизително къде си, а не точно. Извън София същата заплата те нарежда по-нагоре.",
    en: "We compare each take-home pay with what other people in Sofia earn. Who earns what comes from a {shapeYear} Eurostat survey (full-time employees only, public administration excluded), but that survey covers the whole country rather than Sofia alone, so we assume the gap between low and high pay in Sofia looks like the national one. The amounts themselves are set from the latest NSI average wage for Sofia so they stay current. So the figure shows roughly where you stand, not exactly. Outside Sofia the same pay places you higher.",
  },
  // Per-card source citation — same "every figure carries a link (↗)" contract
  // as the Eurostat basket / imot.bg / NSI cards. Two sources: the SHAPE
  // (Eurostat SES) and the LEVEL (NSI Sofia wage). {shapeUrl}/{shapeYear} come
  // from salary_dist.json's own `shape` block; {anchorUrl}/{anchorPeriod} come
  // from sofia_salary.json, because each publisher's provenance has to travel
  // in that publisher's own payload — copying НСИ's into salary_dist.json is
  // what would make one file a composite of two publishers.
  // Rendered with {@html} because it carries links.
  //
  // The level is НСИ's own published quarterly average, selected by
  // view.js#sofiaQuarter — so this line attributes it to them without
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
  headlineRate: {
    bg: "официална инфлация: {rate}% за {ref_period} (по данни на Евростат)",
    en: "official Eurostat inflation: {rate}% for {ref_period}",
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
  statMedianK: { bg: "медианна нетна заплата · София", en: "median NET pay · Sofia" },
  statMedianSub: {
    bg: "средните 60% взимат €{lo}–€{hi}/мес",
    en: "the middle 60% take €{lo}–€{hi}/mo",
  },
  // The band is the most modelled number on the strip and it was reading in
  // the same voice as the median beside it. Only P10, P50 and P90 are survey
  // anchors: P20 and P80 — the two ends of this range — are interpolated
  // between them, so the card has to say so on the band itself rather than
  // relying on the general "worked out from a 2022 survey" line below.
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
  statSofiaK: { bg: "средна нетна заплата в София", en: "Sofia average NET pay" },
  // One coherent clause rather than spliced fragments: the {delta}
  // placeholder carries the whole "+28% над" / "-28% под" / "≈ на" phrase,
  // built in the template, which is what keeps the Bulgarian grammatical.
  statSofiaDiff: {
    bg: "твоята нетна заплата е <b>{delta}</b> средната нетна заплата в София",
    en: "your net pay is <b>{delta}</b> the Sofia net average",
  },
  // Per income, for the same reason the ladder is: НСИ publish a WAGE. Measured
  // against a two-earner total, a household of two on €900 each reads as 21%
  // above the average worker — two true numbers making one false sentence.
  statSofiaDiffEarner: {
    bg: "доход {n} е <b>{delta}</b> средната нетна заплата в София",
    en: "income {n} is <b>{delta}</b> the Sofia net average",
  },
  statSofiaAbove: { bg: "над", en: "above" },
  statSofiaBelow: { bg: "под", en: "below" },
  statSofiaEqual: { bg: "≈ на", en: "≈" },
  // The sector comparison. Same clause shape as the Sofia pair above and for
  // the same reason: {delta} carries the whole "+28% над" phrase so the
  // Bulgarian stays grammatical, and {sector} is НСИ's own section name in the
  // reader's language — never our translation of the other edition's.
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
  // this one on the card compares the reader with Sofia, and this table is
  // НСИ's country-wide one, so the scope has to be attached to the figure
  // itself — a reader who takes in only the number and its credit must not
  // carry away a Sofia reading of a national average.
  sectorSrc: {
    bg: "НСИ · средна брутна заплата за дейността в страната {gross} € · ≈ {net} € нето по наша сметка · {period}{prelim}",
    en: "NSI · average GROSS for the activity, nationwide {gross} € · ≈ {net} € net, our conversion · {period}{prelim}",
  },
  // **The scope mismatch, said out loud.** НСИ's by-activity table covers the
  // whole country; the Sofia comparison sits three lines above it on the same
  // card, and Sofia pay is structurally higher. Stacked without this, the two
  // read as one scale and the gap to a sector average gets charged entirely to
  // the reader's industry — «144% над средната за „Строителство“» for a Sofia
  // builder is mostly the city. It flatters in nearly every section, which is
  // the direction docs/principles.md P7 says to distrust hardest.
  //
  // {country} is НСИ's own all-activities cell, shown rather than divided into
  // the sector figure: the ratio would be our arithmetic under their name, and
  // this card was already fixed once for exactly that.
  sectorNationwide: {
    bg: "Числото за дейността е за цялата страна — НСИ публикуват {country} € бруто средно за всички дейности. Редът по-горе сравнява със София, където заплатите са по-високи, така че част от разликата ти спрямо сектора е градът, а не работата.",
    en: "The activity figure covers the whole country — NSI publish {country} € gross as the average across all activities. The line above compares with Sofia, where pay is higher, so part of your distance from the sector is the city, not the job.",
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
  // **The sentence the whole feature turns on.** НСИ publish an average by
  // activity and nobody publishes a distribution by one, so the card can say
  // how far the reader is from an average and cannot say where they rank.
  // Stating that is P11's shape — the figure is unpublished, not withheld —
  // and leaving it out would let a reader read a rank into a gap.
  sectorNoRank: {
    bg: "Никой не публикува как са разпределени заплатите по сектори в България. Затова тук сравняваме със средната заплата — това не е класиране.",
    en: "Nobody publishes how pay is spread within a sector in Bulgaria. So this compares you with an average — it is not a rank.",
  },
  // The correction that keeps the line above from being read as bad news.
  // Earnings are right-skewed, so an average is roughly a two-thirds-of-the-
  // way-up figure. Both numbers come from mirror.js#meanRungPosition, which
  // reads Eurostat's shape for the COUNTRY — there is no sector distribution
  // to read them off, which is the point of the sentence before this one.
  // The two halves are not equally solid and must not be said in one voice.
  // Eurostat publish BG's median and mean, so {medianPct} is measured. They
  // publish only D1, the median and D9 — the mean lands between P60 and P70,
  // both of which mirror.js interpolates — so {cut} is read off modelled rungs
  // and says so. P3: a figure derived from published figures inherits the
  // obligation to name its inputs and its vintage.
  // «половината вземат под X% от нея» rather than «медианният работещ взима» —
  // the median as a share of the mean, said the way it is said in Bulgarian.
  // The percentile is said the same way, and for the same reason: «около X% от
  // заетите изкарват под нея» puts the people in the subject and the wage in
  // the comparison, where each belongs. «Стои на X-ия процентил» is jargon a
  // reader is entitled not to know, and «средната изпреварва X% от заетите»
  // hands a wage a verb that wants a person — it overtakes nobody. Both halves
  // of the sentence run person-first, which is what makes it one voice rather
  // than a statistic appended to a sentence.
  // Eurostat publish the mean and the median; the RATIO between them is ours,
  // so both published figures are named and the division is attributed to us.
  // A «(Евростат)» credit spanning a number they never printed is the quiet
  // way this card would stop being checkable.
  // Both figures are GROSS, and the line above this one now ends in a net. Two
  // adjacent sentences pairing a €949 with a €2,573 on different bases invite a
  // reader to compare them, so each names its own — the ratio is what carries
  // over between them, not the levels.
  sectorAverageFlatters: {
    bg: "Средната заплата не е средата. За България Евростат публикуват средна брутна заплата {mean} € и медиана {median} € ({shapeYear} г.); съотношението между тях е наша сметка — половината работещи вземат под {medianPct}% от средната. Около {cut}% от заетите изкарват под нея, сметнато между публикуваните децили, а не измерено. Затова под средната за сектора не означава под средата.",
    en: "An average is not a middle. For Bulgaria Eurostat publish a mean GROSS wage of €{mean} and a median of €{median} ({shapeYear}); the ratio between them is ours — half the country earns less than {medianPct}% of the average. About {cut}% of employees earn less than it, worked out between the published deciles rather than measured. So below your sector's average is not below the middle.",
  },
  // The English has to name «служебно правоотношение» too. НСИ count both
  // employment relationships, and «Държавно управление» is one of the sections
  // in the picker — an English reader who picks it and is told the series
  // covers only labour contracts has been told their own section is excluded
  // from the figure they are being compared against.
  sectorCoverage: {
    bg: "Числата обхващат само наетите по трудово и служебно правоотношение — хората на свободна практика и през собствена фирма не са включени. Дейностите са широки раздели по КИД-2008, а не професии.",
    en: "The figures cover only people on a labour contract or in the civil service — those who are self-employed or work through their own company are not included. Activities are broad NACE Rev 2 sections, not occupations.",
  },
  // The sector card's rule, on the card it is the twin of. НСИ publish 1915
  // gross for Sofia-city at 2026-Q1; the value this card leads with is our
  // payroll conversion of it, so the line carries НСИ's own cell as well and
  // says which step is ours. Their name over a figure only we computed leaves
  // a reader who opens the linked workbook nothing to match against — the
  // whole point of the link.
  statSofiaSrc: {
    bg: "НСИ · средна брутна заплата в София-град {gross} € · ≈ {net} € нето по наша сметка · {period}{prelim}",
    en: "NSI · Sofia-city average GROSS {gross} € · ≈ {net} € net, our conversion · {period}{prelim}",
  },
  statFastK: { bg: "— най-бързо поскъпващата група", en: "- the fastest-rising group" },
  // The housing card's label, and it needs one: every card in the strip has
  // the same anatomy — value, label, chart, source. Folding the place name
  // into the value slot as "София · €175 070" and pushing the rest into the
  // source caption gives this one card a shape none of its neighbours have.
  statHomeK: { bg: "жилище в София", en: "a home in Sofia" },
  // The "{pct}% от 2015" sub-caption on the stat card. Carries the
  // historical archive's own median-vs-2015-median delta (imot.bg
  // historical, NOT HICP). The {pct} placeholder is the current-year
  // row's since_2015_median_pct from sofia_price.json.historical.
  statHomeDelta: { bg: "+{pct}% от 2015 · медиана", en: "+{pct}% since 2015 · median" },
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
    bg: "Показаните числа са последните официално публикувани, които имаме — нищо тук не е предположение. Обновяваме ги ръчно.",
    en: "The figures shown are the last officially published ones we hold — nothing here is estimated. Refreshed by hand.",
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

  // Sofia-only home row. Slots:
  //   {m}     apartment size (m²)
  //   {p}     total asking price
  //   {pm2}   per-m² asking price (Sofia median from sofia_price.json)
  //   {y}     years of monthly net pay
  //   {src}   short source caption (e.g. "имоти.бг · 143 квартала · 16.7.2026")
  homeYears: {
    bg: "{m} м² в <b>София</b> ≈ €{p} (≈{pm2}€/м², {basis}) = колкото изкарваш за <b>{y} години</b>.",
    en: "{m} m² in <b>Sofia</b> ≈ €{p} (≈€{pm2}/m², {basis}) = <b>{y} years</b> of your entire pay.",
  },
  // What the €/m² in that sentence actually IS. When sofia_price.json is on
  // the page it is имот.bg's measured median; when the payload did not load it
  // is HOME.eurPerM2_offlineFallback, a round constant with no measurement
  // behind it. Calling the second one «медиана» is the exact failure this
  // project exists to avoid — a plausible number wearing someone else's
  // provenance. The word is a slot so the sentence cannot claim the wrong one.
  homeBasisMedian: { bg: "медиана", en: "median" },
  homeBasisPlaceholder: { bg: "ориентировъчна стойност, без данни", en: "placeholder, no data" },
  homeYearsSrc: {
    bg: "≈{pm2}€/м² · източник: <b>{src}</b>",
    en: "≈€{pm2}/m² · source: <b>{src}</b>",
  },
  homeMort: {
    bg: "вноска при {r}% за {t} г. ({d}% самоучастие): <b>€{pm}/мес</b> = <b>{s}%</b> от заплатата ти",
    en: "payment at {r}% over {t} yrs ({d}% down): <b>€{pm}/mo</b> = <b>{s}%</b> of your pay",
  },
  // The all-in cost of the same loans (APRC / ГПР): interest plus fees.
  // Shown under the rate input so the cheaper headline number is never the
  // only one the user sees.
  rateAprc: {
    bg: "с всички такси (ГПР) излиза <b>{pct}%</b> · ЕЦБ, нови кредити {p}",
    en: "with all fees (APRC) it comes to <b>{pct}%</b> · ECB, new loans {p}",
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
  howNavK: { bg: "числата", en: "the numbers" },
  howFooterK: { bg: "Числата за България", en: "Bulgaria's numbers" },

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
  howKSofiaWage: { bg: "средна брутна заплата в София", en: "average gross wage in Sofia" },
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
  howKHomeYears: {
    bg: "години от средната нетна заплата за София",
    en: "years of Sofia's average net pay",
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
  // which need no translation and are generated from `view.js#QUARTERS`.
  howColYear: { bg: "година", en: "year" },
  howColWage: { bg: "средна брутна заплата", en: "average gross wage" },
  howColCheck: { bg: "проверка", en: "check" },

  // Row markers.
  howSurveyed: { bg: "измерено", en: "surveyed" },
  howModelled: { bg: "пресметнато", en: "modelled" },
  howAtCeiling: { bg: "таванът", en: "the ceiling" },

  // Captions. `{s}` is the publisher, `{p}` the period the figure describes —
  // never the day we fetched it, which is a different fact and is in the data
  // panel on the calculator.
  howSrc: { bg: "{s} · {p}", en: "{s} · {p}" },
  // The two publishers the strip never names, because no card on it cites
  // them: имот.bg is Latin in both languages, and ДВ has an English name worth
  // spelling out for a reader who has never met it.
  howSrcImot: { bg: "имот.bg", en: "imot.bg" },
  howSrcDv: { bg: "Държавен вестник", en: "the State Gazette" },
  // The Eurostat disclosure obligation, on the page that carries the three
  // figures it applies to (the modelled ladder, the Sofia €/m² median across
  // имот.bg's districts, and the change since 2015 built on it). The link goes
  // to the sources document, which carries the full text and the
  // non-responsibility wording.
  howOurs: {
    bg: "Това число е наше, а не на институцията под него — сметнато е от публикуваните ѝ данни.",
    en: "This figure is ours rather than the publisher's below it — worked out from their published data.",
  },
  howOursMoreK: { bg: "Как и защо", en: "How, and why" },
  howToCalculatorK: { bg: "Сметни своята инфлация", en: "Work out your own inflation" },

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
  // `view.js#sharePayload` is where the rule is made unexpressible rather than
  // merely asserted).
  //
  // A noun phrase, never «поскъпна с {p}%»: a basket weighted onto the groups
  // that are FALLING makes the figure negative, and the verb then contradicts
  // its own number. The comparative closing clause survives either sign — if
  // both fell and mine fell further, «при мен е по-евтино» is still what
  // happened.
  shareWindowY1: { bg: "за последната година", en: "over the past year" },
  shareWindowSince: { bg: "от {y} насам", en: "since {y}" },
  shareLineDearer: {
    bg: "Моята кошница {w}: {p}%. Средната за България: {o}%. При мен е по-скъпо от средното.",
    en: "My basket {w}: {p}%. The national average: {o}%. Mine is dearer than average.",
  },
  shareLineCheaper: {
    bg: "Моята кошница {w}: {p}%. Средната за България: {o}%. При мен е по-евтино от средното.",
    en: "My basket {w}: {p}%. The national average: {o}%. Mine is cheaper than average.",
  },
  shareLineClose: {
    bg: "Моята кошница {w}: {p}%. Средната за България: {o}%. Горе-долу колкото средното.",
    en: "My basket {w}: {p}%. The national average: {o}%. Much the same as average.",
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
  shareCardMine: { bg: "моята кошница", en: "my basket" },
  shareCardAverage: { bg: "средната за България", en: "the national average" },
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
  shareCardSource: { bg: "Данни: Евростат (HICP), {d}", en: "Data: Eurostat (HICP), {d}" },
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
  shareCardAlt: {
    bg: "Картинка за споделяне: моята кошница {p}% срещу средната за България {o}%.",
    en: "Share image: my basket {p}% against the national average {o}%.",
  },
};

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
