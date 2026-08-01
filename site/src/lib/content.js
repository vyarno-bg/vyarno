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
  title: { bg: "Вярно - сметни своята инфлация", en: "Vyarno - work out your inflation" },
  h1: { bg: "Твоите числа. Твоята реалност.", en: "Your numbers. Your reality." },
  privacy: {
    bg: "Всичко е анонимно, не събираме лични данни",
    en: "Everything is anonymous, we don't collect personal data",
  },
  brandSmall: { bg: "икономиката, честно", en: "the economy, honestly" },

  // Inputs card
  yourNumbers: { bg: "Твоите числа", en: "Your numbers" },
  // The second inputs card's heading. Net pay sits in a card of its own above
  // it (PayField), so this one needs a name that says what is left rather than
  // repeating «Твоите числа» — two identical headings in one column read as a
  // rendering fault. It also sets the expectation the card is built on: none of
  // it has to be filled in for the page to answer.
  restOfNumbers: { bg: "Ако искаш - още за теб", en: "If you like - more about you" },
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
  // NOT a claim about what people earn. We publish no national median net
  // wage — the only median in the data is the Sofia net ladder's P50 (~€1104),
  // and this placeholder sits at its 34th percentile, on the same screen as
  // the "median NET pay · Sofia" card. Calling it "typical" or "the median"
  // would be false twice over. docs/principles.md P7: no unsourced defaults.
  medianDefault: {
    bg: "числото е просто начална стойност - смени го с твоята заплата",
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
    bg: "по договор (бруто) това е ≈ {g} € - от тях {i} € осигуровки и {t} € данък, или {r}% удръжки",
    en: "on the contract (gross) that's ≈ {g} € - of which {i} € contributions and {t} € tax, i.e. {r}% deducted",
  },
  payGrossHousehold: {
    bg: "по договорите (бруто) заедно ≈ {g} € - от тях {i} € осигуровки и {t} € данък, или {r}% удръжки общо",
    en: "on the contracts (gross) together ≈ {g} € - of which {i} € contributions and {t} € tax, i.e. {r}% deducted overall",
  },
  // Why the household gross is not what one person on the same take-home would
  // earn. This is the whole reason the incomes are entered separately, and a
  // reader checking our gross against a single-salary calculator will otherwise
  // conclude we are wrong — they will get a smaller number, and it will be the
  // wrong one.
  householdSeparate: {
    bg: "Всяка заплата се осигурява поотделно, до свой таван - затова сборът от брутните заплати не е това, което един човек би получавал за същото нето.",
    en: "Each wage is insured separately, up to its own ceiling - so the sum of the gross salaries is not what a single person would be paid for the same take-home.",
  },
  earnerPayslipHead: { bg: "Доход {n} · {s} € нето", en: "Income {n} · {s} € net" },
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
    bg: "таван - осигуровките спират на {cap} €",
    en: "ceiling - contributions stop at {cap} €",
  },
  payslipPension: { bg: "Фонд «Пенсии» (ДОО)", en: "State pension fund (1st pillar)" },
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
    bg: "Ставки за {year} г., трета категория труд, родени след 1959 г. Осигуровките се смятат до осигурителния таван, данъкът - върху целия облагаем доход.",
    en: "{year} rates, third labour category, born after 1959. Contributions are charged up to the insurance ceiling; the tax is charged on the whole taxable income.",
  },
  raiseLabel: { bg: "Увеличение за 1 година", en: "Raise over 1 year" },
  raiseSince: { bg: "Увеличение от {y}", en: "Raise since {y}" },
  raiseHint: { bg: "(приблизително)", en: "(a rough guess)" },
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
    bg: "включи, ако гледаш - ако вече имаш дом или не търсиш, остави изключено",
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
  basketLegend: {
    bg: "13-те групи са официалните на Евростат. До името на всяка: колко е поскъпнала за избрания период. Вдясно: твоят дял и ≈ €/месец.",
    en: "The 13 groups are Eurostat's own. By each name: how much it rose over the chosen period. Right: your share and ≈ €/month.",
  },
  // Shown when home is on. Tells the user why the € column drops after
  // they pick a home: the € per group is carved out of (salary - mortgage)
  // **Both sides carry the currency**, «{mort} €/мес» and "€{mort}/mo". On a
  // page where every other figure carries its unit, a bare number is the one
  // thing a reader has to guess at, and the two languages may not disagree
  // about whether it is there.
  basketCarved: {
    bg: "Имаш активна вноска {mort} €/мес - сумите вдясно вече са от остатъка след нея. Процентите не се променят.",
    en: "You have a €{mort}/mo mortgage active - the € per group is now carved out of what's left after it. Percentages stay the same.",
  },
  // The rent case mirrors basketCarved, so the €/group tracks the leftover
  // after rent exactly as it does after a mortgage payment.
  rentCarved: {
    bg: "Плащаш наем {rent} €/мес - сумите вдясно вече са от остатъка след него. Процентите не се променят.",
    en: "You pay €{rent}/mo rent - the € per group is now carved out of what's left after it. Percentages stay the same.",
  },
  presetOfficial: { bg: "официалната кошница", en: "official basket" },
  presetDriver: { bg: "карам кола всеки ден", en: "I drive daily" },
  presetFamily: { bg: "храня семейство", en: "feeding a family" },
  presetNoCar: { bg: "нямам кола", en: "I don't drive" },
  presetPensioner: { bg: "пенсионер съм", en: "I'm retired" },
  // Says plainly that the four non-official chips are a starting point, not
  // a measured basket. Only the "official basket" chip is real data.
  presetsHint: {
    bg: "Освен „официалната кошница“, останалите са само отправна точка - дръпни плъзгачите към своето харчене.",
    en: 'Apart from "official basket", these are just starting points - drag them towards your own.',
  },
  // Shown in the RESULTS card while a hand-made preset is active. The hint
  // above sits by the chips, but the number it produces ends up 400 px away in
  // the page's headline, in the same voice as the Eurostat figures. A derived
  // figure inherits the obligation to say where it came from (docs/principles.md P3), so
  // the caveat travels with it.
  presetActive: {
    bg: "Числото е сметнато по готовата кошница „{p}“ - тя е измислена от нас за пример, не е измерена. Дръпни плъзгачите към своите разходи, за да стане твое.",
    en: 'This is computed from the ready-made "{p}" basket - our illustration, not a measured one. Drag the sliders to your own spending to make it yours.',
  },

  // Input mode: percentage shares vs actual euros per month
  modePct: { bg: "дял в %", en: "share in %" },
  modeEur: { bg: "€ на месец", en: "€ per month" },
  modeHint: {
    bg: "Повечето хора знаят по-добре колко харчат в евро, отколкото в проценти. Избери както ти е удобно - сметката е същата. В „€ на месец“ не е нужно да разпределиш цялата заплата.",
    en: 'Most people know their euros better than their percentages. Pick whichever suits you - the maths is identical. In "€ per month" you don\'t have to place your whole pay.',
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
    bg: "<b>€{m}</b> на месец остават извън кошницата ти - <b>{p}%</b> от парите, които ти остават. Не е нужно да разпределиш всичко: числото ти е сметнато върху това, което наистина харчиш.",
    en: "<b>€{m}</b> a month stays outside your basket - <b>{p}%</b> of what's left of your take-home. You don't have to place all of it: your number is worked out on what you actually spend.",
  },
  leftLeadWithHousing: {
    bg: "<b>€{m}</b> на месец остават извън кошницата ти - <b>{p}%</b> от парите, които ти остават след <b>€{h}</b> за жилище. Не е нужно да разпределиш всичко: числото ти е сметнато върху това, което наистина харчиш.",
    en: "<b>€{m}</b> a month stays outside your basket - <b>{p}%</b> of what's left of your take-home after the <b>€{h}</b> you said goes to housing. You don't have to place all of it: your number is worked out on what you actually spend.",
  },
  leftYear: {
    bg: "Ако това се повтаря всеки месец, за година са <b>€{y}</b>.",
    en: "If that repeats every month, it comes to <b>€{y}</b> over a year.",
  },
  leftCash: {
    bg: "Оставени в брой, при инфлация {i}% те биха купували с <b>€{e}</b> по-малко след година - колкото <b>€{v}</b> днес. Всяка доходност под {i}% годишно също изостава от цените, само по-бавно.",
    en: "Kept as cash at {i}% inflation, that money would buy <b>€{e}</b> less in a year - as much as <b>€{v}</b> buys today. Any return below {i}% a year still trails prices, just more slowly.",
  },
  leftAssume: {
    bg: "допускане: цените се движат следващата година както през последната. Това е сметка, не прогноза - Евростат не прогнозира.",
    en: "assumption: prices move over the next year as they did over the last. This is arithmetic, not a forecast - Eurostat does not publish one.",
  },
  // Same two-variant pattern as `leftLead*`: the over-budget branch fires
  // regardless of whether the home block is on, and the wording must hold in
  // both cases.
  leftOverNoHousing: {
    bg: "Разпределил си <b>€{m}</b> повече от парите, които ти остават. Числото ти е сметнато точно върху въведеното - провери дали някъде не си сложил повече, отколкото даваш.",
    en: "You've placed <b>€{m}</b> more than you have left. Your number is worked out on exactly what you entered - worth checking whether one of the rows is bigger than what you really pay.",
  },
  leftOverWithHousing: {
    bg: "Разпределил си <b>€{m}</b> повече от парите, които ти остават след <b>€{h}</b> за жилище. Числото ти е сметнато точно върху въведеното - провери дали някъде не си сложил повече, отколкото даваш.",
    en: "You've placed <b>€{m}</b> more than you have left after the <b>€{h}</b> you said goes to housing. Your number is worked out on exactly what you entered - worth checking whether one of the rows is bigger than what you really pay.",
  },

  // Drill-down into ECOICOP groups
  detailToggle: { bg: "покажи по-подробно", en: "show more detail" },
  detailHint: {
    bg: "Всяка група се разпъва на подгрупи - например транспортът се дели на кола, гориво и билети. Отвориш ли я, числото не се променя; променя се само ако преместиш нещо вътре.",
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
    bg: "поевтиня - тегли числото ти надолу",
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
    bg: "Сметнато е с начална заплата €{s} на месец - не с твоята.",
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
    bg: "Увеличението е изядено - твоите цени тичат по-бързо.",
    en: "The raise has been eaten - your prices run faster.",
  },
  pocketZero: {
    bg: "Точно на нула: увеличението ти покрива твоите цени.",
    en: "Exactly level: your raise covers your prices.",
  },
  pocketNearUp: {
    bg: "Почти на нула - увеличението ти изпреварва твоите цени с мъничко.",
    en: "Practically level - your raise is a touch ahead of your prices.",
  },
  pocketNearDn: {
    bg: "Почти на нула - увеличението ти изостава мъничко от твоите цени.",
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
    bg: "Доход {n} - <b>€{s}</b> - изпреварва <b>{r}%</b> от работещите в София.",
    en: "Income {n} - <b>€{s}</b> - is ahead of <b>{r}%</b> of Sofia earners.",
  },
  pctMedian: {
    bg: "Медианната нетна заплата в София е <b>€{m}/мес</b>.",
    en: "The median net pay in Sofia is <b>€{m}/mo</b>.",
  },
  pctHouseholdNote: {
    bg: "Класираме всяка заплата поотделно - стълбицата показва какво изкарват отделните хора, а не домакинствата. Две заплати по €900 не са един човек с €1800.",
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
  pctCaveat: {
    bg: "Сравняваме всяка чиста заплата с това, което изкарват останалите в София. Кой колко изкарва знаем от изследване на Евростат от 2022 г. (само хора на пълен работен ден, без държавната администрация), но то е за цялата страна, а не отделно за София, така че приемаме, че разликата между ниските и високите заплати в София е като в останалата страна. Самите суми преизчисляваме спрямо последната средна заплата за София на НСИ, за да са актуални. Затова числото показва приблизително къде си, а не точно. Извън София същата заплата те нарежда по-нагоре.",
    en: "We compare each take-home pay with what other people in Sofia earn. Who earns what comes from a 2022 Eurostat survey (full-time employees only, public administration excluded), but that survey covers the whole country rather than Sofia alone, so we assume the gap between low and high pay in Sofia looks like the national one. The amounts themselves are set from the latest NSI average wage for Sofia so they stay current. So the figure shows roughly where you stand, not exactly. Outside Sofia the same pay places you higher.",
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
  wedgeK: { bg: "плоският данък", en: "the flat tax" },
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
    bg: "Заплатата ти преди удръжките (бруто) е ≈ <b>€{gross}</b> - над границата, до която се плащат осигуровки (<b>€{cap}</b> на месец). Затова от увеличение на заплатата ти ще удържат само <b>10%</b> данък, а не <b>{peak}%</b>, колкото удържат на човек под границата. Общо от заплатата ти отиват <b>{eff}%</b> - и този дял намалява с всяко следващо увеличение.",
    en: "Your pay before deductions (gross) is ≈ <b>€{gross}</b> - above the line up to which contributions are paid (<b>€{cap}</b> a month). So a raise loses only <b>10%</b> to tax, not the <b>{peak}%</b> taken from someone below the line. In total <b>{eff}%</b> of your pay is taken, and that share shrinks with every further raise.",
  },
  // Shown when the household has more than one income. The lead states the
  // household's own rate — total deductions over total gross, which is NOT the
  // average of the lines under it — and each income then says where it stands,
  // because the ceiling is per contract and that is the entire finding of this
  // row. A single figure over two earners would hide the one thing the chart is
  // drawn to show.
  wedgeHouseholdLead: {
    bg: "Заплатите в домакинството преди удръжките (бруто) са ≈ <b>€{gross}</b> общо. От тях <b>{eff}%</b> отиват за осигуровки и данък. Осигуровките спират на <b>€{cap}</b> бруто на месец - но поотделно за всяка заплата, не за сбора:",
    en: "The household's pay before deductions (gross) is ≈ <b>€{gross}</b> in total. Of it, <b>{eff}%</b> goes to contributions and tax. Contributions stop at <b>€{cap}</b> gross a month - but for each wage on its own, not for the sum:",
  },
  wedgeEarnerLine: {
    bg: "доход {n}: ≈ <b>€{gross}</b> бруто - удържат се <b>{eff}%</b>{cap}",
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
    bg: "Данъкът е плосък - <b>10%</b> за всички. Удръжките не са: осигуровки се плащат само до определена заплата, а данък - върху всичко. Затова при по-висока заплата делът, който се удържа от увеличението, <b>пада</b> от <b>{peak}%</b> на <b>10%</b>. Средното за цялата заплата също пада, но по-бавно - и никога до <b>10%</b>, защото осигуровките до <b>€{cap}</b> вече са платени.",
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
  // «повече НЕЩА» because "5% more" on its own reads as 5% more money, which
  // is the exact confusion this whole row exists to undo.
  standStillTxt: {
    bg: "увеличението ти на фиш трябва да е <b>+{r}%</b> - точно колкото поскъпнаха твоите цени.<br>За да си купуваш с <b>{pct}%</b> повече неща - <b>+{rr}%</b>.",
    en: "your raise on paper has to be <b>+{r}%</b> - exactly as much as your own prices rose.<br>To afford <b>{pct}%</b> more stuff - <b>+{rr}%</b>.",
  },
  // π ≤ 0 is reachable today: several published groups have negative annual
  // rates (телефони −5,2%, техника за свободното време −7,0%), so a basket
  // weighted onto them falls. The line above would then read «трябва да е
  // +−1,2% - точно колкото ПОСКЪПНАХА твоите цени» — a doubled sign under a
  // sentence claiming a rise that did not happen.
  standStillFlat: {
    bg: "твоите цени не са се вдигнали, така че всяко увеличение ти е чиста печалба.<br>За да си купуваш с <b>{pct}%</b> повече неща, стига <b>{rr}</b>.",
    en: "your prices have not risen, so any raise at all is a real gain.<br>To afford <b>{pct}%</b> more stuff, <b>{rr}</b> is enough.",
  },
  rentK: { bg: "наемът", en: "the rent" },
  // The rent row's "what you entered" reminder, mirroring the mortgage row.
  rentEntered: {
    bg: "Ти въведе <b>€{r}/мес</b> наем - това е <b>{p}%</b> от <b>€{s}</b> нетно.",
    en: "You entered <b>€{r}/mo</b> rent - that's <b>{p}%</b> of <b>€{s}</b> net.",
  },
  // The household variant names whose €{s} it is. Rent is one payment out of
  // the money that arrives, whoever earned it — charging it to one earner would
  // report a couple splitting €600 on €1,800 together as carrying 67% each.
  rentEnteredHousehold: {
    bg: "Ти въведе <b>€{r}/мес</b> наем - това е <b>{p}%</b> от <b>€{s}</b> нетно за домакинството.",
    en: "You entered <b>€{r}/mo</b> rent - that's <b>{p}%</b> of the household's <b>€{s}</b> net.",
  },
  // The markup is owned by the copy, not the template: a tag spliced into a
  // template literal renders as literal text.
  rentBurdenTxt: {
    bg: "<b>{p}%</b> от дохода ти - {dir} границата от 30%.<br>{drama}",
    en: "<b>{p}%</b> of your income - {dir} the 30% line.<br>{drama}",
  },
  rentDirOver: { bg: "над", en: "above" },
  rentDirUnder: { bg: "под", en: "below" },
  rentDramaOver: {
    bg: "До <b>{day}-о число</b> работиш само за наема.",
    en: "Until the <b>{day}th</b> you work just for the rent.",
  },
  rentDramaAll: {
    bg: "Целият месец отива за наема - и не стига.",
    en: "The whole month goes to the rent - and it still is not enough.",
  },
  rentDramaFine: {
    bg: "Остава ти за всичко останало.",
    en: "What you have left covers everything else.",
  },
  homeK: { bg: "домът", en: "a home" },
  cashK: { bg: "спестеното", en: "your savings" },
  cashTxt: {
    bg: "Същите <b>€{c}</b> от 2020 г. купуват днес стока за <b>€{t}</b> - инфлацията изяде €{e}.",
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
  // The algebra behind all four figures, in ONE closed block at the very end
  // of the page-level explainer — the last thing on the page, for the one
  // reader in a hundred who wants to re-derive a number by hand. **Not inside
  // the results drawer**, where a «виж формулата» toggle under every item puts
  // four maths panels between the reader and the explanation of their own
  // number. Being right is our job, not theirs.
  // docs/principles.md §"Publish the method" is satisfied by the method being
  // PUBLISHED, not by it being in the way.
  explainMath: {
    bg: "формулите, точно както ги смятаме",
    en: "the formulas, exactly as we compute them",
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
    bg: "Сметките се правят с пълна точност. Закръгляме само това, което показваме - процентите до един знак след запетаята, евровите суми до цяло число. Затова понякога сборът на показаните числа излиза с една стотинка разлика.",
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
  // `test_the_app_states_its_licence_and_claims_nothing_about_the_data`
  // holds both halves.
  footerNote: {
    bg: "Данни от Евростат / ЕЦБ / НСИ / БНБ / имот.bg · Вярно 2026 · кодът е отворен (Apache-2.0)",
    en: "Data from Eurostat / ECB / NSI / BNB / imot.bg · Vyarno 2026 · open source code (Apache-2.0)",
  },
  // Footer link label for the contact address. The four legal-document
  // labels live in `lib/legal.js` next to the documents themselves, so a
  // renamed document cannot leave a stale link label behind.
  contactK: { bg: "Контакт", en: "Contact" },

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
  statSofiaSrc: {
    bg: "НСИ · средна брутна заплата в София-град ≈ {{net}} нето · {{as_of}}",
    en: "NSI · Sofia-city average GROSS ≈ NET {{net}} · {{as_of}}",
  },
  statFastK: { bg: "- най-бързо поскъпващата група", en: "- the fastest-rising group" },
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
    bg: "«Период» е това, което числото описва. «Изтеглено» е денят, в който сме го взели от източника. Различни са, и когато цитираш число, важният е периодът.",
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
  // one late payload out of eight is a different situation from all eight, and a
  // sentence about "the data" not being refreshed claims the latter. The date is
  // the oldest fetch, so a reader can see how far back the laggard goes.
  dataStale: {
    bg: "{n} от числата са закъснели · най-старото е изтеглено на {date}",
    en: "{n} of the figures are overdue · the oldest was fetched on {date}",
  },
  // What is still true while the banner is up: nothing is invented and nothing
  // is guessed, these remain the last officially published figures. No promise
  // of a next update date — Eurostat's HICP release is mid-month but not fixed
  // to a date, and the eight payloads run on three different cadences.
  dataStaleHint: {
    bg: "Показаните числа са последните официално публикувани, които имаме — нищо тук не е предположение. Обновява се ръчно.",
    en: "The figures shown are the last officially published ones we hold — nothing here is estimated. Refreshed by hand.",
  },

  // Loading and failure states. A person who has just typed their salary into
  // a page that then failed needs three things: what happened, that nothing of
  // theirs was lost or sent anywhere, and a way to try again. A bare "reload
  // the page" is the voice of a debug string and says none of them.
  loadingK: { bg: "Зареждане на официалните данни…", en: "Loading the official data…" },
  errHead: { bg: "Данните не се заредиха.", en: "The data didn't load." },
  errBody: {
    bg: "Няма връзка или файловете с данни не отговарят в момента. Нищо от твоите числа не е изгубено и нищо не е изпращано никъде — сметката се случва в браузъра ти. Опитай пак след малко.",
    en: "There's no connection, or the data files aren't responding right now. None of your figures were lost and nothing was sent anywhere — the calculation happens in your browser. Try again in a moment.",
  },
  errRetry: { bg: "Опитай пак", en: "Try again" },
  errContact: {
    bg: "Ако се повтаря, пиши на {email} — това е проблем на нашата страна.",
    en: "If it keeps happening, write to {email} — that's a problem on our side.",
  },

  // Sofia-only home row. Slots:
  //   {m}     apartment size (m²)
  //   {p}     total asking price
  //   {pm2}   per-m² asking price (Sofia median from sofia_price.json)
  //   {y}     years of monthly net pay
  //   {src}   short source caption (e.g. "имоти.бг · 143 квартала · 16.7.2026")
  homeYears: {
    bg: "{m} м² в <b>София</b> ≈ €{p} (≈{pm2}€/м², {basis}) = <b>{y} години</b> цялата ти заплата.",
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
