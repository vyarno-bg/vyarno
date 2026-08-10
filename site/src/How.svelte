<script>
  /**
   * `/how/` — Bulgaria's official figures, on a page of their own.
   *
   * **Why this is a page and not a section of the calculator.** One page ranks
   * for one cluster of queries, and `/` is answering «сметни моята инфлация».
   * Nothing on it answers «каква е инфлацията в България», «колко взима
   * данъкът» or «колко струва квадратът в София» — informational questions
   * with no calculator in them, asked by people who will never type a salary
   * into anything. `docs/seo.md` costs the entry out; `docs/how-it-works.md` is
   * the same explanation written for a contributor, and this is it written for
   * a reader, in both languages, with the figures rendered rather than typed.
   *
   * **Every number here is the country's and none is the reader's.** There is
   * no input on this page and there must never be one: the four values it
   * reads off `Calculator` — `systemWedge`, `payLadderRows`, `cityHome`,
   * `nationalWageGrid` — are functions of the published payloads alone, and each
   * takes payloads rather than scalars precisely so a reader's figure cannot be
   * threaded into one (calculator.svelte.js §"Derived: the country, with nobody
   * in it"). The tax
   * wedge is the case that matters: a PERSONAL effective rate is closed on any
   * shareable surface because it inverts to the salary (P2), and the system's
   * own curve is the version the closed list leaves open.
   *
   * **`syncWithData` is deliberately not called.** It seeds the basket
   * sliders, adopts the live mortgage rate into the reader's field and clamps
   * their term — three pieces of calculator state, none of which exists here.
   * Running it would be work with no output; more to the point, an `$effect`
   * on a page that renders no inputs is where an input eventually gets added.
   */
  import { onMount } from "svelte";
  import { lang, theme, toggleLang, toggleTheme } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import { Calculator } from "./lib/calculator.svelte.js";
  import { COPY, HOME, t } from "./lib/content.js";
  import { QUARTERS, monthsSplit as monthsAreSplit } from "./lib/view.js";
  import { number, integer, periodLong, dateShort, httpUrl } from "./lib/format.js";

  /**
   * The published payloads, read off disk by `scripts/prerender.mjs`.
   *
   * `how-main.js` never passes them: in a browser the page fetches, like every
   * other page here. At build time there is no fetch, so the payloads arrive
   * as a prop and the served HTML carries the figures a crawler — and an agent
   * citing them — would otherwise have to run the bundle to see.
   */
  const { payloads = null } = $props();

  // svelte-ignore state_referenced_locally
  // Reading the initial value is the whole intent: `payloads` is set once by
  // the build and never again, and the Calculator holds what it was given.
  const calc = new Calculator(payloads);
  onMount(calc.load);

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  // Whether Eurostat's flash has the all-items rate a month ahead of the
  // divisions. §инфлацията prints both figures and then explains the gap
  // between them, and which explanation is TRUE depends on this — see
  // `view.js#monthsSplit`, which the calculator's explainer branches on too.
  const monthsSplit = $derived(
    monthsAreSplit({ headlineMonth: calc.headlineRefPeriod, basketMonth: calc.basketRefPeriod })
  );

  // Dates and periods come out as a `{bg, en}` PAIR, not as one string picked
  // by `$lang`, and that is the difference between a page a crawler can read
  // and one it half can. Both languages ship in the DOM at once here (the rule
  // in `tokens.css` hides one), so a caption assembled from `$lang` puts «юли
  // 2026 г.» inside the English span — invisible to a reader, who only ever
  // sees the other one, and served verbatim to whatever indexes the HTML.
  /**
   * The period a figure describes, carrying НСИ's own provisional marker where
   * they have one.
   *
   * НСИ star a whole year until they finalise it, and 2026 is starred. The
   * calculator says so on both of its НСИ credit lines — «… · 2026-Q1
   * (предварителни данни)» — and this page, whose entire job is provenance, was
   * showing the same cell as settled in four places: the wage card, the
   * years-of-pay card, the ladder's caption and the quarterly wage table. A
   * figure the publisher will revise, shown as final, tells the reader more
   * certainty than exists (P4).
   *
   * The marker is `COPY.srcPrelim`, the one both calculator credit lines
   * already share, rather than a second string here: two keys holding the same
   * sentence is how one of them ends up saying something the other does not.
   */
  const when = (p, preliminary = false) => ({
    bg: periodLong(p, "bg") + (preliminary ? t(COPY.srcPrelim, "bg") : ""),
    en: periodLong(p, "en") + (preliminary ? t(COPY.srcPrelim, "en") : ""),
  });
  /** True while НСИ have not finalised the quarter the wage figures come from.
      Both НСИ payloads carry the same quarter under the same marker, and the
      by-activity one is where every wage on this page comes from. */
  const wagesArePreliminary = $derived(Boolean(calc.data.sectorSalary?.is_preliminary));
  const onDay = (d) => ({ bg: dateShort(d, "bg"), en: dateShort(d, "en") });
  /**
   * WHICH date is on the имот.bg figures, said out loud.
   *
   * They carry two different facts. `snapshot_date` is имот.bg's own newest
   * published snapshot, read off that city's `<select name="date">` — the day
   * the SOURCE published the number — and `as_of` is the day our pipeline
   * fetched it. A page that serves no parseable snapshot list leaves the first
   * null, which is the case for the payload currently shipped, so printing
   * whichever is available with no qualifier lets our download date read as
   * имот.bg's publication date.
   *
   * Same two strings as `App.svelte`, so the two pages cannot come to
   * different words for the same distinction.
   */
  const imotDated = $derived(
    calc.refCityPriceSnapshot
      ? {
          bg: t(COPY.srcDatedByPage, "bg", { d: calc.refCityPriceSnapshot }),
          en: t(COPY.srcDatedByPage, "en", { d: calc.refCityPriceSnapshot }),
        }
      : {
          bg: t(COPY.srcDatedByFetch, "bg", { d: dateShort(calc.refCityPriceAsOf, "bg") }),
          en: t(COPY.srcDatedByFetch, "en", { d: dateShort(calc.refCityPriceAsOf, "en") }),
        }
  );
  /** A period that is already language-independent — a year, an ISO effective date. */
  const asIs = (v) => ({ bg: String(v ?? ""), en: String(v ?? "") });

  // The two Eurostat extracts this page cites for figures that are not
  // per-category: the all-items headline and unemployment. Same reasoning as
  // the strip's — they point at the exact dissemination query behind the
  // number rather than the Data Browser table, which silently defaults to
  // CP01/Food for the first and to the dataset's default geo for the second.
  const ESTAT_HEADLINE_URL =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=12";
  const ESTAT_UNEMPLOYMENT_URL =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=BG&s_adj=SA&sex=T&age=TOTAL&unit=PC_ACT&sinceTimePeriod=2020-01";
  const ESTAT_WEIGHTS_URL =
    "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_iw/default/table?lang=en";
  const ESTAT_SES_URL =
    "https://ec.europa.eu/eurostat/databrowser/view/earn_ses_monthly/default/table?lang=en";
  const DV_URL = "https://dv.parliament.bg/";
  // What dates the four payroll figures. `DV_URL` is the gazette's landing
  // page and cannot be a per-issue permalink, so under P9 the caption has to
  // carry the instrument: «бр. 68 от 28.07.2026» is what ДВ's own archive is
  // searched by, and it moves with the next ЗБДОО rather than staying true by
  // accident. The year is the fallback for a parameter set assembled from
  // several acts, where no single issue is true of it.
  const dvWhen = $derived.by(() => {
    const { gazetteIssue, gazetteDate, effectiveYear } = calc.systemWedge;
    if (!gazetteIssue) return asIs(effectiveYear);
    return {
      bg: t(COPY.howSrcDvIssue, "bg", { issue: gazetteIssue, date: dateShort(gazetteDate, "bg") }),
      en: t(COPY.howSrcDvIssue, "en", { issue: gazetteIssue, date: dateShort(gazetteDate, "en") }),
    };
  });
  const IMOT_URL = "https://www.imot.bg/sredni-ceni";
</script>

<svelte:head>
  <!-- Only the title, for the reason `App.svelte` carries at length: a
       `<meta name="description">` here does NOT replace the one in
       how/index.html — Svelte appends it and a crawler reads the first of the
       two. The description belongs in the entry file. -->
  <title>{t(COPY.howTitle, $lang)}</title>
</svelte:head>

<!-- The skip link, and it earns its place here more than on the calculator: the
     header is four tab stops and the contents list below it is seven more, so a
     keyboard reader arriving at a reference page passes eleven controls before
     the first sentence. `#main` carries the same `scroll-margin-top` as the
     sections, which is what keeps the sticky header off the landing. -->
<a class="skip" href="#main">
  <span class="l-bg">{COPY.skipK.bg}</span>
  <span class="l-en">{COPY.skipK.en}</span>
</a>
<header class="site">
  <div class="wrap bar">
    <a class="brand" href="/">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="6" width="4" height="14" rx="1" fill="var(--muted)" />
        <rect x="16" y="2" width="4" height="18" rx="1" fill="var(--real)" />
        <path
          d="M6 20 L16 20"
          stroke="var(--real)"
          stroke-width="1.5"
          stroke-dasharray="2 2"
          fill="none"
        />
      </svg>
      <span class="wm">
        <span class="l-bg">Вярно</span>
        <span class="l-en">Vyarno</span>
        <small>
          <span class="l-bg">числата</span>
          <span class="l-en">the numbers</span>
        </small>
      </span>
    </a>
    <div class="controls">
      <a class="pill back" href="/">
        <span class="l-bg">← към калкулатора</span>
        <span class="l-en">← to the calculator</span>
      </a>
      <button class="pill" onclick={toggleTheme} aria-label="Toggle theme">
        {$theme === "dark" ? "☀" : "☾"}
      </button>
      <button class="pill" onclick={toggleLang} aria-label="Toggle language">
        {$lang === "bg" ? "EN" : "BG"}
      </button>
    </div>
  </div>
</header>

<!--
  One stat block, used about a dozen times below.

  `label` and `source` arrive as `{bg, en}` pairs and both languages are
  rendered into the DOM, hidden by the rule in `tokens.css`. That is not a
  detail here: the served HTML is what a crawler and a citing agent read, and a
  caption assembled from `$lang` would reach them in one language — the same
  reason every paragraph on this page is a `.l-bg` / `.l-en` pair rather than a
  `t(...)` call.

  `when` is the period the figure DESCRIBES, never the day we fetched it. P3
  and P4 both hang off it, and on a page that may be served for longer than its
  data is current it is also the mitigation: a figure that fell behind is
  visibly behind rather than silently wrong.
-->
{#snippet stat(value, label, source, href, period)}
  <div class="stat">
    <div class="sv mono">{value}</div>
    <div class="sl">
      <span class="l-bg">{label.bg}</span>
      <span class="l-en">{label.en}</span>
    </div>
    <div class="ss">
      <a href={httpUrl(href)} target="_blank" rel="noopener">
        <span class="l-bg">{t(COPY.howSrc, "bg", { s: source.bg, p: period.bg })}</span>
        <span class="l-en">{t(COPY.howSrc, "en", { s: source.en, p: period.en })}</span>
      </a>
    </div>
  </div>
{/snippet}

<!-- The Eurostat disclosure obligation, attached to each of the three figures
     it applies to rather than stated once at the foot: the modelled ladder,
     the Sofia €/m² median across имот.bg's districts, and the change since
     2015 computed from it are OURS, and Eurostat's terms permit derivation on
     condition that it is disclosed. The link carries the reader to the full
     wording, including the non-responsibility clause. -->
{#snippet ours()}
  <p class="ours">
    <span class="l-bg"
      >{COPY.oursNote.bg}
      <a href="/legal/#sources">{COPY.oursMoreK.bg} →</a></span
    >
    <span class="l-en"
      >{COPY.oursNote.en}
      <a href="/legal/#sources">{COPY.oursMoreK.en} →</a></span
    >
  </p>
{/snippet}

<main id="main" class="wrap how">
  <h1>
    <span class="l-bg">Числата за България, обяснени</span>
    <span class="l-en">Bulgaria's numbers, explained</span>
  </h1>

  <p class="lead">
    <span class="l-bg"
      >Тук са официалните числа, с които калкулаторът смята: инфлацията и 13-те групи на кошницата,
      данъкът и осигуровките, подредбата на заплатите, лихвата по жилищен кредит, цената на
      квадратен метър в София и безработицата. До всяко стои институцията, която го публикува,
      периодът, за който се отнася, и връзка към таблицата, от която е взето. Нищо тук не е
      измислено от нас и нищо не е закръглено на око.</span
    >
    <span class="l-en"
      >These are the official figures the calculator works from: inflation and the 13 basket groups,
      tax and contributions, how pay is spread out, the home-loan rate, the price of a square metre
      in Sofia, and unemployment. Each one carries the body that publishes it, the period it
      describes, and a link to the table it was taken from. Nothing here is invented and nothing is
      rounded by eye.</span
    >
  </p>

  <nav class="toc" aria-label="contents">
    <a href="#inflation"><span class="l-bg">инфлацията</span><span class="l-en">inflation</span></a>
    <a href="#basket"><span class="l-bg">кошницата</span><span class="l-en">the basket</span></a>
    <a href="#pay"><span class="l-bg">бруто и нето</span><span class="l-en">gross and net</span></a>
    <a href="#ladder"
      ><span class="l-bg">подредбата на заплатите</span><span class="l-en">the pay ladder</span></a
    >
    <a href="#loan"
      ><span class="l-bg">жилищният кредит</span><span class="l-en">the home loan</span></a
    >
    <a href="#home"
      ><span class="l-bg">цената на жилището</span><span class="l-en">what a home costs</span></a
    >
    <a href="#work"
      ><span class="l-bg">работа и заплати</span><span class="l-en">work and pay</span></a
    >
  </nav>

  <!-- 1 ------------------------------------------------------------------ -->
  <section id="inflation">
    <h2>
      <span class="l-bg">Каква е инфлацията и защо твоята е различна</span>
      <span class="l-en">What inflation is, and why yours is different</span>
    </h2>
    <p>
      <span class="l-bg"
        >Официалната инфлация е едно число за цялата страна: с колко са по-скъпи нещата днес спрямо
        преди година. Не всичко тежи еднакво — храната тежи повече от учебниците, защото за нея
        отиват повече пари. Цените ги събира НСИ всеки месец, Евростат ги сглобява по единните
        европейски правила и публикува резултата, а Вярно го взима дословно — не го пресмята наново,
        за да не се разминава с публикуваното.</span
      >
      <span class="l-en"
        >Official inflation is one number for the whole country: how much dearer things are today
        than a year ago. Not everything counts the same — food moves the figure more than textbooks
        do, because more money goes to it. NSI collects the prices every month, Eurostat assembles
        them under one common European method and publishes the result, and Vyarno takes it verbatim
        — never recomputed, so it cannot drift from what is published.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.hicpHeadline}
        {@render stat(
          `${fmt(calc.headline)}%`,
          COPY.howKHeadline,
          COPY.srcEurostat,
          ESTAT_HEADLINE_URL,
          when(calc.headlineRefPeriod)
        )}
      {/if}
      {#if calc.categories.length > 0}
        {@render stat(
          `${fmt(calc.off)}%`,
          COPY.howKBasket,
          COPY.srcEurostat,
          ESTAT_WEIGHTS_URL,
          when(calc.basketRefPeriod)
        )}
      {/if}
    </div>

    <!-- The two figures sit side by side, so the paragraph under them has to
         account for the whole of what a reader can see — and how much of the gap
         the January re-weighting explains depends on whether the two describe
         the same month. During Eurostat's flash they do not, and then most of
         the difference on screen is the fortnight rather than the method: on the
         payloads as this is written the two are 1.26 pp apart where a same-month
         pair is ~0.16 pp. So the cause is named before the method that would
         otherwise be made to carry it, exactly as `ExplainerBand.svelte` does
         over the same two months. Both cards already state their own period;
         this is the prose over them catching up.

         WRITTEN FOR SOMEBODY WHO HAS NEVER MET A PRICE INDEX. The earlier
         version explained the gap in the vocabulary of the method — «сбор на
         13-те групи с тазгодишните тегла», «прозорецът от дванадесет месеца
         минава през тази смяна» — and every one of those phrases needs the
         answer before it can be read. This is the paragraph a doubting reader
         opens FIRST, on the page that exists to remove doubt, so it says which
         number is which, then what changes in January, in the words somebody
         uses about their own shopping. The two figures are unchanged and so is
         the reason for the gap; what went is the requirement to already know. -->
    <p>
      <span class="l-bg"
        >Двете числа горе идват от Евростат и са еднакво официални. Не са едно и също нещо: горното
        е инфлацията за цялата страна, точно както Евростат я публикува, а долното е нашият сбор от
        13-те групи — всяка умножена по това каква част от парите отива за нея. {monthsSplit
          ? t(COPY.explainSplitMonth, "bg", {
              headline: periodLong(calc.headlineRefPeriod, "bg"),
              basket: periodLong(calc.basketRefPeriod, "bg"),
            })
          : COPY.explainSameMonth.bg} Остава още една разлика, и тя е от смятането.
        <b>Всеки януари Евростат обновява кошницата</b>, защото хората харчат малко по-различно от
        предната година. Числото за последните дванадесет месеца минава през тази смяна и хваща и
        двете кошници — старата и новата; нашият сбор ползва само днешната. Затова двете се
        разминават съвсем малко. Показваме и двете, вместо да представим едното за другото.</span
      >
      <span class="l-en"
        >Both figures above come from Eurostat and both are equally official. They are not the same
        thing: the first is inflation for the whole country exactly as Eurostat publishes it, and
        the second is our own sum of the 13 groups — each multiplied by the share of the money that
        goes to it. {monthsSplit
          ? t(COPY.explainSplitMonth, "en", {
              headline: periodLong(calc.headlineRefPeriod, "en"),
              basket: periodLong(calc.basketRefPeriod, "en"),
            })
          : COPY.explainSameMonth.en} One difference is still left, and it comes from the arithmetic.
        <b>Every January Eurostat refreshes the basket</b>, because people spend a little
        differently than the year before. The figure for the last twelve months runs through that
        changeover and catches both baskets - the old one and the new; our sum uses only today's.
        That is why the two come out slightly apart. Both are shown rather than one being passed off
        as the other.</span
      >
    </p>
    <p>
      <span class="l-bg"
        >Твоята инфлация е същата сметка с твоите дялове. Ако храната е една трета от парите ти, а в
        националната кошница е една пета, поскъпването на храната тежи повече при теб. Кошницата се
        описва в калкулатора и сметката се прави изцяло в браузъра ти.</span
      >
      <span class="l-en"
        >Your own inflation is that same sum with your shares in it. If food is a third of your
        money where the national basket puts a fifth, food's price rise weighs more for you. The
        basket is described in the calculator and the arithmetic happens entirely in your browser.</span
      >
    </p>
  </section>

  <!-- 2 ------------------------------------------------------------------ -->
  <section id="basket">
    <h2>
      <span class="l-bg">Кошницата: 13 групи, теглата им и колко е поскъпнала всяка</span>
      <span class="l-en">The basket: 13 groups, their weights, and how far each has risen</span>
    </h2>
    <p>
      <span class="l-bg"
        >Цените се групират по европейска класификация (ECOICOP), която за България дава тринадесет
        групи. Делът на всяка група е каква част от парите на средния човек отива за нея — Евростат
        го публикува веднъж годишно. По-старите български таблици имат дванадесет групи, защото
        последната беше сборна: сега CP12 е застраховки и банкови услуги, а новата CP13 покрива
        лична хигиена и социални услуги. Затова двете подредби не се припокриват.</span
      >
      <span class="l-en"
        >Prices are grouped by a European classification (ECOICOP), which for Bulgaria gives
        thirteen groups. A group's share is how much of the average person's money goes to it;
        Eurostat publishes it once a year. Older Bulgarian tables show twelve groups because the
        last one was a catch-all: CP12 is now insurance and financial services and a new CP13 covers
        personal care and social protection. That is why the two do not line up.</span
      >
    </p>

    {#if calc.categories.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howTblBasket, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">
                <span class="l-bg">{COPY.howColGroup.bg}</span>
                <span class="l-en">{COPY.howColGroup.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColWeight.bg}</span>
                <span class="l-en">{COPY.howColWeight.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColYoy.bg}</span>
                <span class="l-en">{COPY.howColYoy.en}</span>
              </th>
              <th scope="col">
                <span class="l-bg">{COPY.howColCheck.bg}</span>
                <span class="l-en">{COPY.howColCheck.en}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each calc.categories as cat (cat.cp_code)}
              <tr>
                <th scope="row">
                  <span class="code mono">{cat.cp_code}</span>
                  <span class="l-bg">{cat.bg_name}</span>
                  <span class="l-en">{cat.en_name}</span>
                </th>
                <!-- The weight at the precision Eurostat publishes it, not at
                     the strip's. This page says in its own lead that nothing on
                     it is rounded by eye, and a reader following the ↗ link
                     lands on 22.323 rather than on 22.3. -->
                <td class="num mono">{fmt(cat.weight_pct, 3)}%</td>
                <td class="num mono">{fmt(cat.annual_rate_pct)}%</td>
                <td class="mono">
                  <a href={httpUrl(calc.estatCatUrl(cat))} target="_blank" rel="noopener">↗</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          >{t(COPY.howSrc, "bg", {
            s: COPY.srcEurostat.bg,
            p: when(calc.basketRefPeriod).bg,
          })}</span
        >
        <span class="l-en"
          >{t(COPY.howSrc, "en", {
            s: COPY.srcEurostat.en,
            p: when(calc.basketRefPeriod).en,
          })}</span
        >
      </p>
    {/if}
  </section>

  <!-- 3 ------------------------------------------------------------------ -->
  <section id="pay">
    <h2>
      <span class="l-bg">От бруто към нето: какво взимат данъкът и осигуровките</span>
      <span class="l-en">From gross to net: what tax and contributions take</span>
    </h2>
    <p>
      <span class="l-bg"
        >От брутната заплата първо се удържат осигуровките за сметка на работника, а данъкът върху
        дохода се начислява върху остатъка. Ставките са в закона и се сменят с него, не с пазара —
        затова ги четем от публикуваните параметри, а не ги пишем в кода.</span
      >
      <span class="l-en"
        >Employee social contributions come out of the gross first, and income tax is charged on
        what is left. The rates are in statute and change with it rather than with the market —
        which is why they are read from published parameters rather than written into the code.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.payroll}
        {@render stat(
          `${fmt(calc.systemWedge.contributionRatePct, 2)}%`,
          COPY.howKContrib,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
        {@render stat(
          `${fmt(calc.systemWedge.incomeTaxRatePct, 0)}%`,
          COPY.howKTax,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
        {@render stat(
          `${fmt0(calc.systemWedge.maxInsurable)} €`,
          COPY.howKCeiling,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
        {@render stat(
          `${fmt(calc.systemWedge.minWageGross, 2)} €`,
          COPY.howKMinWage,
          COPY.howSrcDv,
          DV_URL,
          dvWhen
        )}
      {/if}
    </div>

    <p>
      <span class="l-bg"
        >Данъкът е един за всички, но осигуровки се плащат само до определена заплата. Под тази
        граница от всяко увеличение се удържа едно и също. Над нея осигуровките спират, така че от
        увеличението остава само данъкът — и колкото по-висока е заплатата, толкова по-малка част от
        нея взима държавата. Таблицата долу показва това при четири различни заплати, сметнато от
        ставките и границата горе. Никоя институция не я публикува: никой не е длъжен да я състави.</span
      >
      <span class="l-en"
        >The tax is the same for everyone, but contributions are only paid up to a certain salary.
        Below that line the same share comes out of any raise. Above it contributions stop, so only
        the tax comes out of a raise - and the higher the pay, the smaller the share of it the state
        takes. The table below shows this at four different salaries, worked out from the rates and
        the line above. No agency publishes it: nobody is obliged to put it together.</span
      >
    </p>

    {#if calc.data.payroll}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howTblWedge, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColGross.bg}</span>
                <span class="l-en">{COPY.howColGross.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColNet.bg}</span>
                <span class="l-en">{COPY.howColNet.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColTaken.bg}</span>
                <span class="l-en">{COPY.howColTaken.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColEffective.bg}</span>
                <span class="l-en">{COPY.howColEffective.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColMarginal.bg}</span>
                <span class="l-en">{COPY.howColMarginal.en}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each calc.systemWedge.rungs as rung (rung.gross)}
              <tr class:mark={rung.atCeiling}>
                <th scope="row" class="num mono">
                  {fmt0(rung.gross)} €
                  {#if rung.atCeiling}
                    <span class="tag">
                      <span class="l-bg">{COPY.howAtCeiling.bg}</span>
                      <span class="l-en">{COPY.howAtCeiling.en}</span>
                    </span>
                  {/if}
                </th>
                <td class="num mono">{fmt0(rung.net)} €</td>
                <td class="num mono">{fmt0(rung.deductions)} €</td>
                <td class="num mono">{fmt(rung.effectivePct)}%</td>
                <td class="num mono">{fmt(rung.marginalPct)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <!-- The table is computed from the four figures above it, so it carries
           their citation rather than a year of its own. Two captions on one
           section naming one publisher at two levels of precision is a reader
           working out which of them is the instrument. -->
      <p class="cap">
        <span class="l-bg">{t(COPY.howSrc, "bg", { s: COPY.howSrcDv.bg, p: dvWhen.bg })}</span>
        <span class="l-en">{t(COPY.howSrc, "en", { s: COPY.howSrcDv.en, p: dvWhen.en })}</span>
      </p>
    {/if}
  </section>

  <!-- 4 ------------------------------------------------------------------ -->
  <section id="ladder">
    <h2>
      <span class="l-bg">Къде сяда една заплата в страната</span>
      <span class="l-en">Where a salary sits in the country</span>
    </h2>
    <p>
      <span class="l-bg"
        >За това трябват две официални числа, защото нито едното не стига само. Първото казва
        <b>колко са разпънати заплатите</b> — с колко човек в горния край изкарва повече от човек в
        долния. То е от изследването на Евростат за заплатите, мери един човек с една заплата, но
        излиза веднъж на четири години, тоест сумите в него са остарели. Второто е
        <b>днешната средна заплата за страната</b>, която НСИ публикува всяко тримесечие. Взимаме
        разпъването от първото и го прилагаме върху днешната средна от второто, за да носят
        стъпалата днешни суми. После всяко стъпало се превръща от бруто в нето. И двете числа са за
        цялата страна: никой не публикува как са разпределени заплатите вътре в една област, затова
        тази подредба не зависи от нея.</span
      >
      <span class="l-en"
        >This needs two official numbers, because neither is enough on its own. The first says
        <b>how far apart wages are</b> — how much more someone near the top earns than someone near
        the bottom. It comes from Eurostat's earnings survey, counts one person and one wage at a
        time, but is published once every four years, so its amounts are out of date. The second is
        <b>today's average wage for the country</b>, which NSI publishes every quarter. We take the
        spread from the first and set it against today's average from the second, so the rungs carry
        today's amounts. Each rung is then converted from gross to net. Both figures are the whole
        country's — nobody publishes how wages are spread inside one oblast, so this ladder does not
        change with the oblast.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.sectorSalary}
        {@render stat(
          `${fmt0(calc.payLadderRows.anchorGross)} €`,
          COPY.howKNationalWage,
          COPY.srcNsiWages,
          calc.payLadderRows.anchorUrl,
          when(calc.payLadderRows.anchorPeriod, wagesArePreliminary)
        )}
      {/if}
    </div>

    {#if calc.payLadderRows.anchorGross > 0 && calc.data.salaryDist}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howTblLadder, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">
                <span class="l-bg">{COPY.howColRung.bg}</span>
                <span class="l-en">{COPY.howColRung.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColGross.bg}</span>
                <span class="l-en">{COPY.howColGross.en}</span>
              </th>
              <th scope="col" class="num">
                <span class="l-bg">{COPY.howColNet.bg}</span>
                <span class="l-en">{COPY.howColNet.en}</span>
              </th>
              <th scope="col">
                <span class="l-bg">{COPY.howColBasis.bg}</span>
                <span class="l-en">{COPY.howColBasis.en}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each calc.payLadderRows.rungs as rung (rung.cut)}
              <tr>
                <th scope="row" class="mono">P{rung.cut}</th>
                <td class="num mono">{fmt0(rung.gross)} €</td>
                <td class="num mono">{fmt0(rung.net)} €</td>
                <td>
                  {#if rung.atMinWage}
                    <!-- Neither of the other two, and the difference is the
                         column's whole point: the figure on this row came out
                         of the ЗБДОО rather than out of Eurostat's survey or
                         out of an interpolation between two of their points.
                         See `mirror.js#flooredCuts`. -->
                    <span class="soft">
                      <span class="l-bg">{COPY.howAtMinWage.bg}</span>
                      <span class="l-en">{COPY.howAtMinWage.en}</span>
                    </span>
                  {:else if rung.surveyed}
                    <span class="l-bg">{COPY.howSurveyed.bg}</span>
                    <span class="l-en">{COPY.howSurveyed.en}</span>
                  {:else}
                    <span class="soft">
                      <span class="l-bg">{COPY.howModelled.bg}</span>
                      <span class="l-en">{COPY.howModelled.en}</span>
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          >Разпъването: <a href={httpUrl(calc.payLadderRows.shapeUrl) || ESTAT_SES_URL}
            >{t(COPY.howSrc, "bg", {
              s: COPY.srcEurostat.bg,
              p: calc.payLadderRows.shapeYear,
            })}</a
          >. Днешната средна:
          <a href={httpUrl(calc.payLadderRows.anchorUrl)}
            >{t(COPY.howSrc, "bg", {
              s: COPY.srcNsiWages.bg,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).bg,
            })}</a
          >.</span
        >
        <span class="l-en"
          >The spread: <a href={httpUrl(calc.payLadderRows.shapeUrl) || ESTAT_SES_URL}
            >{t(COPY.howSrc, "en", {
              s: COPY.srcEurostat.en,
              p: calc.payLadderRows.shapeYear,
            })}</a
          >. Today's average:
          <a href={httpUrl(calc.payLadderRows.anchorUrl)}
            >{t(COPY.howSrc, "en", {
              s: COPY.srcNsiWages.en,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).en,
            })}</a
          >.</span
        >
      </p>
      {@render ours()}
      <p>
        <span class="l-bg"
          >Изследването дава три числа за България: колко изкарват най-ниско платените 10%, колко
          изкарва човекът точно по средата и колко — най-високо платените 10%. Всички стъпала между
          тях са пресметнати, а не преброени, и таблицата казва кое кое е. Затова числото показва
          приблизително къде се нарежда една заплата, а не точно: никой не е обиколил всички
          работещи в страната този месец.</span
        >
        <span class="l-en"
          >The survey gives three figures for Bulgaria: what the lowest-paid 10% earn, what the
          person exactly in the middle earns, and what the highest-paid 10% earn. Every rung between
          them is worked out rather than counted, and the table says which is which. So the figure
          shows roughly where a salary sits, not exactly: nobody polled every worker in the country
          this month.</span
        >
      </p>
      <!-- Only where the floor actually binds, so the paragraph is not
           explaining a row that is not on the table. It reads off the rungs
           rather than off a threshold of its own — a second comparison here
           would be a second thing to keep in step with `flooredCuts`. -->
      {#if calc.payLadderRows.rungs.some((r) => r.atMinWage)}
        <p>
          <span class="l-bg"
            >Изследването е от {calc.payLadderRows.shapeYear} г., а минималната заплата оттогава се е
            вдигнала по-бързо от средната. Затова долните стъпала, преизчислени към днешната средна, излизат
            под минималната — а под нея не е законно да се плаща на човек на пълен работен ден. Тези стъпала
            показват самата минимална заплата и таблицата ги отбелязва така: тя не е нито измерена от
            Евростат, нито пресметната между техните числа.</span
          >
          <span class="l-en"
            >The survey is from {calc.payLadderRows.shapeYear}, and the minimum wage has risen
            faster than the average since. So the bottom rungs, set against today's average, come
            out below the minimum — and below it is not a lawful wage for a full-time employee.
            Those rungs show the minimum wage itself, and the table marks them as that: it is
            neither measured by Eurostat nor worked out between two of their figures.</span
          >
        </p>
      {/if}
    {/if}
  </section>

  <!-- 5 ------------------------------------------------------------------ -->
  <section id="loan">
    <h2>
      <span class="l-bg">Жилищният кредит: коя лихва на какъв въпрос отговаря</span>
      <span class="l-en">The home loan: which rate answers which question</span>
    </h2>
    <p>
      <span class="l-bg"
        >Три числа се наричат „лихвата по жилищен кредит“ и отговарят на три различни въпроса. <b
          >Лихвата по нови кредити</b
        >
        е средното по договорите, подписани миналия месец — това е числото, с което се смята вноската.
        <b>ГПР</b> е за същите кредити, но с прибавените такси: той служи за сравняване на оферти. С
        него не се смята вноска — таксите се плащат отделно, а месечната вноска се смята само върху
        лихвата, така че сметка с ГПР дава вноска, каквато никоя банка не събира.
        <b>Лихвата по изплащаните кредити</b> е средното по всички кредити, които се изплащат в момента,
        включително подписани преди години; то описва какво плащат хората сега, не какво би подписал новият
        кредитополучател.</span
      >
      <span class="l-en"
        >Three numbers all go by "the mortgage rate" and they answer three different questions. The
        <b>rate on new loans</b> is the average across contracts signed last month — the one the
        monthly payment is computed from. The <b>APRC</b> is those same loans with the fees added
        in: it is for comparing offers. It is not what a payment is computed from — the fees are
        paid separately and the monthly payment is computed from the interest alone, so working it
        out from the APRC gives an instalment no bank collects.
        <b>The rate on loans being repaid</b> averages every loan currently being paid off, including
        ones signed years ago; it describes what people are paying now, not what a new borrower would
        sign.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.mortgage}
        {@render stat(
          `${fmt(calc.mortgageRateData.pct, 2)}%`,
          COPY.howKAar,
          COPY.srcEcbMir,
          calc.data.mortgage.new_business?.source_url,
          when(calc.mortgageRateData.refPeriod)
        )}
        {#if calc.mortgageAprcData}
          {@render stat(
            `${fmt(calc.mortgageAprcData.pct, 2)}%`,
            COPY.howKAprc,
            COPY.srcEcbMir,
            calc.mortgageAprcData.url,
            when(calc.mortgageAprcData.refPeriod)
          )}
        {/if}
        {#if calc.data.mortgage.outstanding_stock}
          {@render stat(
            `${fmt(calc.data.mortgage.outstanding_stock.value_pct, 2)}%`,
            COPY.howKStock,
            COPY.srcBnb,
            calc.data.mortgage.outstanding_stock.source_url,
            when(calc.data.mortgage.outstanding_stock.ref_period)
          )}
        {/if}
      {/if}
    </div>

    <p>
      <span class="l-bg"
        >БНБ поставя три граници на всеки нов жилищен кредит в България, в сила от края на 2024 г.
        Вярно ги чете от публикуваните лимити, а не ги пише в кода, за да е промяната в наредбата
        промяна в данните.</span
      >
      <span class="l-en"
        >The BNB places three limits on every new Bulgarian home loan, in force since late 2024.
        Vyarno reads them from the published limits rather than writing them into the code, so a
        change in the rules is a change in the data.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.mortgage?.lending_limits}
        {@render stat(
          `${fmt(calc.limits.minDownPaymentPct, 0)}%`,
          COPY.howKLtv,
          COPY.srcBnb,
          calc.limits.sourceUrl,
          onDay(calc.data.mortgage.lending_limits.effective_from)
        )}
        {@render stat(
          `${fmt(calc.limits.dstiMaxPct, 0)}%`,
          COPY.howKDsti,
          COPY.srcBnb,
          calc.limits.sourceUrl,
          onDay(calc.data.mortgage.lending_limits.effective_from)
        )}
        {@render stat(
          `${fmt(calc.limits.maturityMaxYears, 0)}`,
          COPY.howKMaturity,
          COPY.srcBnb,
          calc.limits.sourceUrl,
          onDay(calc.data.mortgage.lending_limits.effective_from)
        )}
        {#if calc.limits.observedDstiPct !== null}
          {@render stat(
            `${fmt(calc.limits.observedDstiPct)}%`,
            COPY.howKObserved,
            COPY.srcBnb,
            calc.data.mortgage.lending_limits.observed_dsti_source_url,
            onDay(calc.data.mortgage.lending_limits.effective_from)
          )}
        {/if}
      {/if}
    </div>

    <p>
      <span class="l-bg"
        >Калкулаторът чертае своята линия на достъпност при 30% от нетния доход — по-строго от
        тавана, който БНБ допуска, и по-строго от това, което новите кредитополучатели в България
        реално носят. Линията стои там нарочно и не се мести: едно жилище не става достъпно, защото
        калкулаторът е казал, че е.</span
      >
      <span class="l-en"
        >The calculator draws its affordability line at 30% of net income — stricter than the
        ceiling the BNB permits, and stricter than what new Bulgarian borrowers actually carry. It
        sits there deliberately and does not move: a home does not become affordable because a
        calculator said so.</span
      >
    </p>
  </section>

  <!-- 6 ------------------------------------------------------------------ -->
  <section id="home">
    <h2>
      <span class="l-bg">Колко струва квадратният метър и колко заплати е едно жилище</span>
      <span class="l-en">What a square metre costs, and how many salaries a home is</span>
    </h2>
    <p>
      <span class="l-bg"
        >Никоя институция не публикува цената на квадратен метър в България. Евростат казва само с
        колко се е променила — не и колко струва. Затова самата цена идва от обявите: имот.bg
        публикува средна цена на квадратен метър по квартали в София. Това са <b>искани</b> цени, не цени
        по сключени сделки, и между най-евтиния и най-скъпия квартал разликата е няколко пъти.</span
      >
      <span class="l-en"
        >No institution publishes the price of a square metre in Bulgaria. Eurostat says only how
        much it has changed — not what it costs. So the price itself comes from listings: imot.bg
        publishes an average €/m² per Sofia district. These are <b>asking</b> prices rather than prices
        from closed sales, and the cheapest district and the dearest are several times apart.</span
      >
    </p>

    <div class="stats">
      {#if calc.refCityPriceIsLive}
        {@render stat(
          `${fmt0(calc.cityHome.eurPerM2)} €`,
          COPY.howKEurM2,
          COPY.howSrcImot,
          IMOT_URL,
          imotDated
        )}
        {@render stat(
          `${fmt0(calc.cityHome.eurPerM2Min)}–${fmt0(calc.cityHome.eurPerM2Max)} €`,
          {
            bg: t(COPY.howKEurM2Range, "bg", { n: fmt0(calc.cityHome.nDistricts) }),
            en: t(COPY.howKEurM2Range, "en", { n: fmt0(calc.cityHome.nDistricts) }),
          },
          COPY.howSrcImot,
          IMOT_URL,
          imotDated
        )}
        {@render stat(
          `${fmt0(calc.cityHome.price)} €`,
          {
            bg: t(COPY.howKHomePrice, "bg", { m2: fmt0(HOME.m2Default) }),
            en: t(COPY.howKHomePrice, "en", { m2: fmt0(HOME.m2Default) }),
          },
          COPY.howSrcImot,
          IMOT_URL,
          imotDated
        )}
        {#if calc.cityHome.netMonthly > 0}
          {@render stat(
            fmt(calc.cityHome.years),
            COPY.howKHomeYears,
            COPY.srcNsiWages,
            calc.payLadderRows.anchorUrl,
            when(calc.cityHome.wagePeriod, wagesArePreliminary)
          )}
        {/if}
      {/if}
    </div>

    {#if calc.refCityPriceIsLive}
      {@render ours()}
      <p>
        <span class="l-bg"
          >имот.bg публикува по едно число на квартал и нито едно за София като цяло. Медианата на
          {fmt0(calc.cityHome.nDistricts)} квартала и сравнението с {calc.cityHome.baselineYear} г. са
          наши сметки върху техните числа — затова стоят тук, а не се приписват на тях. „Години заплата“
          значи цената, разделена на дванадесет средни нетни заплати за София: сравнение на едно цяло
          жилище с една цяла заплата, без спестявания, без лихва и без нищо друго в живота.</span
        >
        <span class="l-en"
          >imot.bg publishes one figure per district and none for Sofia as a whole. The median
          across
          {fmt0(calc.cityHome.nDistricts)} districts, and the comparison with {calc.cityHome
            .baselineYear}, are our arithmetic over their figures — which is why they are named here
          rather than attributed to them. "Years of pay" means the price divided by twelve average
          net Sofia monthly wages: a whole home against a whole salary, with no savings, no interest
          and nothing else in a life.</span
        >
      </p>
    {/if}
  </section>

  <!-- 7 ------------------------------------------------------------------ -->
  <section id="work">
    <h2>
      <span class="l-bg">Работа и заплати</span>
      <span class="l-en">Work and pay</span>
    </h2>
    <p>
      <span class="l-bg"
        >Безработицата е сезонно изгладена — месечните ѝ колебания от селското стопанство, туризма и
        строителството са извадени, за да се вижда посоката, а не сезонът. Заплатите под нея са
        тримесечните числа на НСИ за страната, така както са публикувани: избираме клетка, не
        смятаме средни от техните числа.</span
      >
      <span class="l-en"
        >Unemployment is seasonally adjusted — the month-to-month swings from farming, tourism and
        construction are taken out so the direction shows rather than the season. The wages below
        are NSI's own quarterly figures for the country, exactly as published: a cell is selected,
        never averaged.</span
      >
    </p>

    <div class="stats">
      {#if calc.data.unemployment}
        {@render stat(
          `${fmt(calc.data.unemployment.value)}%`,
          COPY.howKUnemp,
          COPY.srcEurostat,
          ESTAT_UNEMPLOYMENT_URL,
          when(calc.data.unemployment.ref_period)
        )}
      {/if}
    </div>

    <!-- A year to a row and a quarter to a column, so the whole series is on
         screen at once. One row per quarter is twenty-five rows of a single
         number each, which is either a very long column or a scroll box — and
         a scroll box on a reference page hides the half of the series a reader
         came for behind an affordance they have to notice first.

         `view.js#quarterGrid` does the placing. Nothing is combined on the way:
         a year row is four cells НСИ published, side by side, and the column a
         reader would expect at the end of it — the year's average — is exactly
         what their licence does not allow us to distribute. -->
    {#if calc.nationalWageGrid.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- A scroll container IS interactive to a keyboard, and the rule cannot
           see that: without the attribute the arrow keys reach nothing, which
           is what WAI asks for on a scrollable region. The `role` and the name
           are the other half — a tab stop that announces nothing is worse than
           none. See the .scroll rule below. -->
      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.howColWage, $lang)}>
        <table class="fig-table">
          <!-- A caption rather than a column heading: with the quarters across
               the top and the years down the side there is no column left to
               say what the cells ARE, and a grid of bare euro amounts under a
               heading about unemployment names nothing. It is also what a
               screen reader announces on entering the table. -->
          <caption>
            <span class="l-bg">{COPY.howColWage.bg}</span>
            <span class="l-en">{COPY.howColWage.en}</span>
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span class="l-bg">{COPY.howColYear.bg}</span>
                <span class="l-en">{COPY.howColYear.en}</span>
              </th>
              {#each QUARTERS as quarter (quarter)}
                <th scope="col" class="num mono">{quarter}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each calc.nationalWageGrid as row (row.year)}
              <tr>
                <th scope="row" class="mono">{row.year}</th>
                {#each row.cells as cell, i (QUARTERS[i])}
                  <td class="num mono">
                    {#if cell}
                      {fmt0(cell.value)} €
                    {:else}
                      <span class="soft">—</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          ><a href={httpUrl(calc.payLadderRows.anchorUrl)} target="_blank" rel="noopener"
            >{t(COPY.howSrc, "bg", {
              s: COPY.srcNsiWages.bg,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).bg,
            })}</a
          ></span
        >
        <span class="l-en"
          ><a href={httpUrl(calc.payLadderRows.anchorUrl)} target="_blank" rel="noopener"
            >{t(COPY.howSrc, "en", {
              s: COPY.srcNsiWages.en,
              p: when(calc.payLadderRows.anchorPeriod, wagesArePreliminary).en,
            })}</a
          ></span
        >
      </p>
    {/if}
  </section>

  <p class="onward">
    <a href="/">
      <span class="l-bg">{COPY.howToCalculatorK.bg} →</span>
      <span class="l-en">{COPY.howToCalculatorK.en} →</span>
    </a>
  </p>
</main>

<SiteFooter page="how" />

<style>
  /* The legal and support pages' chrome, and deliberately the same one: three
     pages a reader reaches from the same footer row should not each have their
     own header. */
  header.site {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--hdr);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 54px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 700;
    font-size: var(--fs-h3);
    letter-spacing: -0.01em;
    text-decoration: none;
  }
  .brand .wm {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }
  .brand small {
    font-family: var(--mono);
    font-weight: 500;
    font-size: var(--fs-micro);
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    display: block;
    margin-top: 2px;
  }
  .controls {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pill {
    font-family: var(--mono);
    font-size: var(--fs-small);
    padding: 5px 9px;
    border: 1px solid var(--control-line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
  }
  .pill:hover {
    border-color: var(--muted);
    color: var(--ink);
  }

  main.how {
    padding: 30px 0 10px;
    max-width: 760px;
    /* The skip link's target, offset by the same amount the sections are: a
       bare `#main` jump parks the h1 under the 54px sticky header. */
    scroll-margin-top: 64px;
  }
  h1 {
    font-family: var(--serif);
    font-size: clamp(1.5625rem, 4vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin: 0;
  }
  h2 {
    font-family: var(--serif);
    font-size: var(--fs-h3);
    line-height: 1.25;
    margin: 0 0 8px;
    color: var(--ink);
  }
  section {
    margin-top: 38px;
    padding-top: 20px;
    border-top: 1px solid var(--line);
    scroll-margin-top: 64px;
  }
  p {
    margin: 12px 0 0;
    font-size: var(--fs-lead);
    line-height: 1.62;
    color: var(--ink-2);
  }
  .lead {
    margin-top: 12px;
  }
  .cap {
    margin-top: 6px;
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
  }
  /* The disclosure that a figure is ours. Marked, not buried: it sits directly
     under the number it is about, in the erode accent the app already uses for
     "this one costs you something to believe". */
  .ours {
    margin-top: 10px;
    padding-left: 10px;
    border-left: 2px solid var(--erode);
    font-size: var(--fs-meta);
  }

  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 18px;
    font-family: var(--mono);
    font-size: var(--fs-small);
  }
  .toc a,
  .cap a,
  .ours a,
  .onward a {
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
  }
  .toc a:hover,
  .cap a:hover,
  .ours a:hover,
  .onward a:hover {
    border-bottom-color: var(--real);
  }
  .onward {
    margin: 34px 0 0;
    font-family: var(--mono);
    font-size: var(--fs-small);
  }

  /* The stat blocks. A wrapping flex row for the same reason the national
     strip is one: the count per section is 1, 2, 3 or 4 and no fixed column
     count divides all of them, so a grid leaves a hole on the last row. */
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: stretch;
    margin-top: 16px;
  }
  .stats:empty {
    display: none;
  }
  .stat {
    flex: 1 1 190px;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 13px 15px;
    display: flex;
    flex-direction: column;
  }
  .stat .sv {
    font-size: var(--fs-h2);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .stat .sl {
    font-size: var(--fs-meta);
    color: var(--ink-2);
    margin-top: 6px;
    line-height: 1.35;
  }
  /* Pinned to the foot, so the source captions line up across a row whatever
     the labels above them wrapped to. */
  .stat .ss {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
  }
  .stat .ss a {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px dotted var(--muted);
  }
  .stat .ss a:hover {
    color: var(--real-ink);
    border-bottom-color: var(--real);
  }

  /* The scroll box sits on the wrapper, so a wide table never makes the page
     body scroll sideways on a phone.

     IT IS A TAB STOP (`tabindex="0"` in the markup). A scroll container is not
     focusable on its own and no browser makes it so — so at 360px, where the
     wedge table runs about 190px past the box and holds no link at all, a
     keyboard-only reader could not reach two of its five columns by any means.
     Every box carries the attribute rather than only the ones that overflow,
     because whether a table overflows is a function of the viewport and of
     which language is showing, and neither is known where the markup is
     written.

     WHAT SAYS IT SCROLLS is the clipped column at the boundary, plus the focus
     ring for the keyboard. The conventional edge shadow — two `local` cover
     layers over two `scroll` shadow layers — was tried and is not shippable
     here: the only token faint enough not to fight the ledger palette is
     invisible against it, and `.mark`'s own row background sits above the box's
     background anyway, so the shadow shows through at the ceiling row after
     scrolling to the end. A shadow that is either invisible or wrong on one row
     is worse than the clipped edge it was meant to strengthen. */
  .scroll {
    overflow-x: auto;
    margin-top: 16px;
  }
  /* The focus ring is the keyboard half of the same affordance: the box a
     reader has just landed on is the one the arrow keys will scroll. */
  .scroll:focus-visible {
    outline: 2px solid var(--real);
    outline-offset: 2px;
  }
  /* Skip link — off-screen until focused, the pattern SiteHeader.svelte uses on
     the calculator. Sharing the class rather than the rule is not possible: a
     Svelte component's styles are scoped to it. */
  .skip {
    position: absolute;
    left: -999px;
  }
  .skip:focus {
    left: 16px;
    top: 10px;
    z-index: 99;
    background: var(--surface);
    padding: 8px 12px;
    border: 1px solid var(--ink);
    border-radius: 6px;
    color: var(--ink);
    text-decoration: none;
  }
  .fig-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-meta);
  }
  .fig-table th,
  .fig-table td {
    text-align: left;
    padding: 7px 10px 7px 0;
    border-bottom: 1px solid var(--rule);
    vertical-align: baseline;
  }
  .fig-table thead th {
    font-weight: 600;
    color: var(--muted);
    font-size: var(--fs-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fig-table tbody th {
    font-weight: 500;
    color: var(--ink);
  }
  .fig-table td {
    color: var(--ink-2);
  }
  .fig-table .num {
    text-align: right;
    white-space: nowrap;
  }
  .fig-table .code {
    color: var(--muted);
    font-size: var(--fs-micro);
    margin-right: 6px;
  }
  .fig-table .soft {
    color: var(--muted);
  }
  .fig-table caption {
    text-align: left;
    padding-bottom: 8px;
    font-size: var(--fs-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .fig-table tr.mark {
    background: var(--real-soft);
  }
  .fig-table .tag {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--real-ink);
    margin-left: 6px;
  }
  .fig-table a {
    color: var(--real-ink);
    text-decoration: none;
  }

  @media (max-width: 560px) {
    .brand small {
      display: none;
    }
  }
</style>
