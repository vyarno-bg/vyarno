<script>
  /**
   * `/market/` — what is actually happening in Bulgarian property.
   *
   * The fifth route, built like `/how/`: prerendered in both languages, every
   * figure carrying its publisher, the period it describes and a link to the
   * table it came from. **No input on it, ever.** Every derived value takes
   * payloads rather than scalars (`view.js`), so a reader's own salary has no
   * signature to be threaded into and this page cannot drift into a calculator.
   *
   * THE PAGE TAKES NO VIEW ON THE MARKET, and that is a design constraint
   * rather than a tone. Some of these figures point one way and some the other
   * — prices rising while transactions fall, a price-to-income ratio below its
   * own long-run average while rent inflation runs ahead of the headline — and
   * the page's job is to put them where a reader can see all of them at once.
   * It gives the ratio and stops. `verify_copy.mjs` holds it to that with a
   * vocabulary rule, because "describe, do not advise" is easy to agree with
   * and easy to lose one adjective at a time.
   *
   * WHERE A NUMBER COMES FROM IS PART OF THE NUMBER. Under every digit: the
   * publisher, the period, and a link. Where the figure is ours rather than
   * read off a table, the arithmetic is stated in words and the queries that
   * reproduce it are linked — a reader who does not believe a figure should not
   * have to take our word for it, and the people most likely to doubt this page
   * are the ones it is most worth convincing.
   *
   * The words are here and the wiring is in `view.js`, which is the split the
   * rest of the SPA uses: a claim about which payload field feeds which figure
   * is one a test can hold, and an expression inside a `$derived` is not.
   */
  import { onMount } from "svelte";
  import { lang, theme, chooseLang, langHref, toggleTheme } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import { COPY, t } from "./lib/content.js";
  import { loadAll } from "./lib/data.js";
  import {
    marketVolume,
    marketAverageDeal,
    marketPriceRate,
    marketStructure,
    marketDealInYearsOfPay,
  } from "./lib/view.js";
  import { number, integer, periodLong, httpUrl } from "./lib/format.js";

  const { payloads = null, servedLang = null } = $props();

  if (servedLang) lang.set(servedLang);

  /**
   * The payloads, and the route they are fetched for.
   *
   * `"market"` rather than the whole manifest: the calculator's payroll table
   * and percentile ladder render nothing here, and `payloadsFor` is what stops
   * a reader of this page paying for them (`payloads.js`).
   */
  let data = $state(payloads ?? {});
  onMount(async () => {
    data = await loadAll("market");
  });

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);

  /**
   * A period as a `{bg, en}` pair, never picked by `$lang`.
   *
   * Both languages ship in the DOM at once and the prerender strips the half
   * the entry does not declare, so a caption assembled from the store reaches a
   * crawler in one language only — the same reason every paragraph below is a
   * pair rather than a `t(...)` call.
   */
  const when = (p) => ({ bg: periodLong(p, "bg"), en: periodLong(p, "en") });

  const volume = $derived(marketVolume(data.houseMarket));
  const deal = $derived(marketAverageDeal(data.houseMarket));
  const priceRate = $derived(marketPriceRate(data.houseMarket));
  const structure = $derived(marketStructure(data.houseMarketStructure));
  const yearsOfPay = $derived(marketDealInYearsOfPay(data.houseMarket, data.sectorSalary));

  /** The rent line the calculator already publishes, read here rather than refetched. */
  const rent = $derived(
    (data.hicpCategories?.categories ?? [])
      .flatMap((c) => c.groups ?? [])
      .find((g) => g.cp_code === "CP041") ?? null
  );
</script>

<svelte:head>
  <title>{t(COPY.marketTitle, $lang)}</title>
</svelte:head>

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
      <a class="pill back l-bg" href={langHref("/", "bg")}>← към калкулатора</a>
      <a class="pill back l-en" href={langHref("/", "en")}>← to the calculator</a>
      <button class="pill" onclick={toggleTheme} aria-label="Toggle theme">
        {$theme === "dark" ? "☀" : "☾"}
      </button>
      <a
        class="pill l-bg"
        href={langHref("/market/", "en")}
        hreflang="en"
        aria-label="смени езика"
        onclick={() => chooseLang("en")}>EN</a
      >
      <a
        class="pill l-en"
        href={langHref("/market/", "bg")}
        hreflang="bg"
        aria-label="toggle language"
        onclick={() => chooseLang("bg")}>BG</a
      >
    </div>
  </div>
</header>

<!--
  One figure, with everything that has to travel under it.

  `label`, `source` and `period` arrive as `{bg, en}` pairs and both languages
  render into the DOM, hidden by the rule in `tokens.css` — the served HTML is
  what a crawler and a citing agent read, so a caption picked by `$lang` would
  reach them in one language.

  `period` is what the figure DESCRIBES, never the day it was fetched. On a
  page that may be served for longer than its data is current, that is also the
  mitigation: a figure that has fallen behind is visibly behind rather than
  silently wrong.
-->
{#snippet figure(value, label, source, href, period)}
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

<!--
  How a figure of ours was worked out, and the queries that reproduce it.

  Two obligations meet here and one block discharges both. Eurostat's terms
  permit derivation on condition it is stated clearly to the end user, with
  their non-responsibility clause; and a reader who thinks a number is invented
  needs to be able to get it back themselves. The link is the answer to both,
  so it is the raw query rather than a page about the dataset — open it and the
  digits are there.

  `explain` is a bilingual pair written here rather than read from the payload.
  The payload's own `method` string is English and machine-facing; words a
  reader sees belong to the component that renders them (`site/AGENTS.md`).
-->
{#snippet ourSum(explain, urls)}
  <p class="ours">
    <span class="l-bg"
      >{explain.bg}
      {#each urls ?? [] as url, i (url)}
        <a href={httpUrl(url)} target="_blank" rel="noopener">провери {i + 1}</a>&nbsp;
      {/each}
      <a href="/legal/#sources">{COPY.oursMoreK.bg} →</a></span
    >
    <span class="l-en"
      >{explain.en}
      {#each urls ?? [] as url, i (url)}
        <a href={httpUrl(url)} target="_blank" rel="noopener">check {i + 1}</a>&nbsp;
      {/each}
      <a href="/legal/#sources">{COPY.oursMoreK.en} →</a></span
    >
  </p>
{/snippet}

<main id="main" class="wrap market">
  <h1>
    <span class="l-bg">Пазарът на жилища, с числата на институциите</span>
    <span class="l-en">The property market, in the institutions' own figures</span>
  </h1>

  <p class="lead">
    <span class="l-bg"
      >Тук са официалните числа за жилищния пазар в България: колко сделки има, колко се плаща по
      тях, как се движат цените и колко хора изобщо дължат нещо по жилището си. Под всяко число пише
      кой го публикува, за кой период е и къде да го провериш. Където сметката е наша, пише как е
      направена и стои връзка към заявката, която я връща. Не заемаме страна — числата тук сочат в
      различни посоки и това е част от отговора.</span
    >
    <span class="l-en"
      >These are the official figures for Bulgarian housing: how many deals happen, what is paid for
      them, how prices move, and how many people owe anything on the home they live in. Under every
      number is who publishes it, which period it describes and where to check it. Where the
      arithmetic is ours, it says so, explains it, and links the query that returns it. We take no
      side — these figures point in different directions, and that is part of the answer.</span
    >
  </p>

  <nav class="toc" aria-label="contents">
    <a href="#volume"
      ><span class="l-bg">колко се търгува</span><span class="l-en">how much changes hands</span></a
    >
    <a href="#prices"
      ><span class="l-bg">колко струва</span><span class="l-en">what it costs</span></a
    >
    <a href="#deal"
      ><span class="l-bg">средната сделка</span><span class="l-en">the average deal</span></a
    >
    <a href="#credit"
      ><span class="l-bg">кой купува с кредит</span><span class="l-en">who borrows</span></a
    >
    <a href="#stock"
      ><span class="l-bg">колко жилища има</span><span class="l-en">the housing stock</span></a
    >
    <a href="#ratio"
      ><span class="l-bg">скъпо ли е спрямо доходите</span><span class="l-en"
        >expensive against incomes?</span
      ></a
    >
  </nav>

  <!-- 1 ------------------------------------------------------------------ -->
  <section id="volume">
    <h2>
      <span class="l-bg">Колко се търгува</span>
      <span class="l-en">How much changes hands</span>
    </h2>
    <p>
      <span class="l-bg"
        >Евростат брои жилищата, купени от домакинства през тримесечието — апартаменти и къщи, на
        цената, която реално е платена. Броят се публикува отделно за новото строителство и за
        съществуващите жилища, така че двете движения се виждат поотделно.</span
      >
      <span class="l-en"
        >Eurostat count the dwellings households bought during the quarter — flats and houses, at
        the price actually paid. The count is published separately for new builds and existing
        dwellings, so the two movements can be read apart.</span
      >
    </p>

    {#if volume.deals.value}
      <div class="stats">
        {@render figure(
          fmt0(volume.deals.value),
          COPY.mktKDeals,
          COPY.srcEurostat,
          volume.deals.sourceUrl,
          when(volume.period)
        )}
        {#if volume.changePct.value != null}
          {@render figure(
            `${volume.changePct.value > 0 ? "+" : ""}${fmt(volume.changePct.value)}%`,
            COPY.mktKDealsYoy,
            COPY.srcEurostat,
            volume.changePct.sourceUrl,
            when(volume.period)
          )}
        {/if}
        {#if volume.newBuild != null}
          {@render figure(
            fmt0(volume.newBuild),
            COPY.mktKDealsNew,
            COPY.srcEurostat,
            volume.deals.sourceUrl,
            when(volume.period)
          )}
        {/if}
        {#if volume.existing != null}
          {@render figure(
            fmt0(volume.existing),
            COPY.mktKDealsExisting,
            COPY.srcEurostat,
            volume.deals.sourceUrl,
            when(volume.period)
          )}
        {/if}
      </div>
      {#if volume.changePct.value != null}
        {@render ourSum(
          {
            bg:
              "Промяната спрямо година по-рано е наша сметка: броят за това тримесечие спрямо " +
              "същото тримесечие на предходната година, и двата както са публикувани. Спрямо " +
              "същото тримесечие, а не спрямо предходното, защото сделките имат сезонен ритъм и " +
              "спадът от лято към зима мери календара, не пазара.",
            en:
              "The year-on-year change is our arithmetic: this quarter's count against the same " +
              "quarter a year earlier, both as published. Against the same quarter rather than " +
              "the last one, because transactions have a seasonal shape and a summer-to-winter " +
              "fall measures the calendar rather than the market.",
          },
          volume.changePct.derivedFrom
        )}
      {/if}
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Това не е броят на всички сделки с имоти. Имотният регистър вписва и продажбите на земя,
        гаражи, магазини и офиси, и затова брои чувствително повече от Евростат за същото
        тримесечие. Двете мерят различни неща и нито едното не е сгрешено.</span
      >
      <span class="l-en"
        >This is not a count of all property sales. The land register also records sales of land,
        garages, shops and offices, and so counts considerably more than Eurostat for the same
        quarter. The two measure different things and neither is wrong.</span
      >
    </p>
  </section>

  <!-- 2 ------------------------------------------------------------------ -->
  <section id="prices">
    <h2>
      <span class="l-bg">Колко струва</span>
      <span class="l-en">What it costs</span>
    </h2>
    <p>
      <span class="l-bg"
        >Индексът на цените на жилищата мери с колко се е променила цената на сделките спрямо година
        по-рано. Показваме числото, което Евростат публикува, а не сметка от индекса: НСИ смениха
        базисната година и сами предупреждават, че процент, преизчислен между двете бази, може да се
        различава в последния знак от този, който публикуват.</span
      >
      <span class="l-en"
        >The house price index measures how much transaction prices moved against a year earlier. We
        show the figure Eurostat publish rather than one worked out from the index: НСИ changed the
        base year and warn themselves that a rate recomputed across the two bases can differ in the
        last decimal from the one they publish.</span
      >
    </p>

    {#if priceRate.total.value != null}
      <div class="stats">
        {@render figure(
          `${priceRate.total.value > 0 ? "+" : ""}${fmt(priceRate.total.value)}%`,
          COPY.mktKPriceRate,
          COPY.srcEurostat,
          priceRate.total.sourceUrl,
          when(priceRate.period)
        )}
        {#if priceRate.newBuild != null}
          {@render figure(
            `${priceRate.newBuild > 0 ? "+" : ""}${fmt(priceRate.newBuild)}%`,
            COPY.mktKPriceRateNew,
            COPY.srcEurostat,
            priceRate.total.sourceUrl,
            when(priceRate.period)
          )}
        {/if}
        {#if priceRate.existing != null}
          {@render figure(
            `${priceRate.existing > 0 ? "+" : ""}${fmt(priceRate.existing)}%`,
            COPY.mktKPriceRateExisting,
            COPY.srcEurostat,
            priceRate.total.sourceUrl,
            when(priceRate.period)
          )}
        {/if}
      </div>
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Обявената цена и платената цена са различни неща. Обявените цени на кв. м по градове са в
        калкулатора и идват от имот.bg; числата тук са за сделки и идват от Евростат. Цена на
        квадратен метър по сделки за отделен български град не публикува никой — затова тук няма
        такава таблица.</span
      >
      <span class="l-en"
        >An asking price and a paid price are different things. Asking prices per m² by city are in
        the calculator and come from имот.bg; the figures here are transaction figures and come from
        Eurostat. Nobody publishes a transaction price per square metre for an individual Bulgarian
        city, which is why there is no such table here.</span
      >
    </p>
  </section>

  <!-- 3 ------------------------------------------------------------------ -->
  <section id="deal">
    <h2>
      <span class="l-bg">Средната сделка</span>
      <span class="l-en">The average deal</span>
    </h2>
    <p>
      <span class="l-bg"
        >Евростат публикуват колко жилища са купени и колко е платено общо за тях. Разделено едно на
        друго, това дава средната сделка — число, което никой не публикува наготово. Двете числа, от
        които идва, стоят до него, за да може да се провери наум.</span
      >
      <span class="l-en"
        >Eurostat publish how many dwellings were bought and how much was paid for them in total.
        One divided by the other gives the average deal — a figure nobody publishes ready-made. The
        two numbers it comes from are beside it so the division can be checked by eye.</span
      >
    </p>

    {#if deal.avg.value}
      <div class="stats">
        {@render figure(
          `${fmt0(deal.avg.value)} €`,
          COPY.mktKAvgDeal,
          COPY.srcEurostat,
          deal.avg.sourceUrl,
          when(deal.period)
        )}
        {#if deal.newBuild != null}
          {@render figure(
            `${fmt0(deal.newBuild)} €`,
            COPY.mktKAvgDealNew,
            COPY.srcEurostat,
            deal.avg.sourceUrl,
            when(deal.period)
          )}
        {/if}
        {#if deal.existing != null}
          {@render figure(
            `${fmt0(deal.existing)} €`,
            COPY.mktKAvgDealExisting,
            COPY.srcEurostat,
            deal.avg.sourceUrl,
            when(deal.period)
          )}
        {/if}
        {#if yearsOfPay.value != null}
          {@render figure(
            fmt(yearsOfPay.value),
            COPY.mktKYearsOfPay,
            COPY.srcEurostatNsi,
            yearsOfPay.wageUrl,
            when(yearsOfPay.wagePeriod)
          )}
        {/if}
      </div>

      {@render ourSum(
        {
          bg:
            `Средната сделка е наша сметка: платеното общо за тримесечието, разделено на броя ` +
            `сделки за същото тримесечие — ${fmt0(deal.totalValue)} € върху ${fmt0(deal.deals)} ` +
            `жилища. Това е средно платена сума за жилище, не цена на квадратен метър и не медиана; ` +
            `делът на къщите и апартаментите в тримесечието я движи. Евростат не отговарят за ` +
            `делението, нито за изводи от него.`,
          en:
            `The average deal is our arithmetic: the total paid in the quarter divided by the ` +
            `number of deals in the same quarter — €${fmt0(deal.totalValue)} over ${fmt0(deal.deals)} ` +
            `dwellings. It is a mean amount paid for a dwelling, not a price per square metre and ` +
            `not a median; the quarter's mix of flats and houses moves it. Eurostat are not ` +
            `responsible for the division or for conclusions drawn from it.`,
        },
        deal.avg.derivedFrom
      )}

      {#if yearsOfPay.value != null}
        {@render ourSum(
          {
            bg:
              "Годините заплата са наша сметка върху числата на две институции: средната сделка на " +
              "Евростат, разделена на дванадесет средни брутни заплати на НСИ за всички дейности. " +
              "Двата файла стоят разделени до браузъра ти и се срещат тук — така всеки от тях " +
              "остава числата на един публикуващ. Бруто, а не нето: нетото зависи от данъчната " +
              "таблица на годината, в която е сметнато.",
            en:
              "The years of pay are arithmetic over two institutions' figures: Eurostat's average " +
              "deal divided by twelve of НСИ's published average gross wages across all " +
              "activities. The two files stay apart all the way to your browser and meet here, " +
              "which is what keeps each of them one publisher's data. Gross rather than net: a " +
              "net figure depends on the payroll table of the year it was worked out in.",
          },
          yearsOfPay.derivedFrom
        )}
      {/if}
    {/if}
  </section>

  <!-- 4 ------------------------------------------------------------------ -->
  <section id="credit">
    <h2>
      <span class="l-bg">Кой купува с кредит</span>
      <span class="l-en">Who borrows</span>
    </h2>
    <p>
      <span class="l-bg"
        >Изследването на доходите и условията на живот пита хората какво е жилището им: собствено
        без заем, собствено със заем, или под наем. Делът на собствениците, които дължат нещо по
        жилището си, е малък — и това е контекстът, в който се четат числата отгоре.</span
      >
      <span class="l-en"
        >The income and living-conditions survey asks people what their housing is: owned outright,
        owned with a loan, or rented. The share of owners who owe anything on their home is small —
        and that is the context the figures above are read in.</span
      >
    </p>

    {#if structure.owner.value != null}
      <div class="stats">
        {@render figure(
          `${fmt(structure.owner.value)}%`,
          COPY.mktKOwn,
          COPY.srcEurostat,
          structure.owner.sourceUrl,
          when(structure.owner.refPeriod)
        )}
        {@render figure(
          `${fmt(structure.ownerWithMortgage.value)}%`,
          COPY.mktKOwnMortgage,
          COPY.srcEurostat,
          structure.ownerWithMortgage.sourceUrl,
          when(structure.ownerWithMortgage.refPeriod)
        )}
        {@render figure(
          `${fmt(structure.renterAtMarketPrice.value)}%`,
          COPY.mktKRentMarket,
          COPY.srcEurostat,
          structure.renterAtMarketPrice.sourceUrl,
          when(structure.renterAtMarketPrice.refPeriod)
        )}
      </div>
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Лихвата по нови жилищни кредити, размерът на банковия портфейл и лимитите на БНБ са в
        калкулатора, до ипотечната сметка.</span
      >
      <span class="l-en"
        >The rate on new home loans, the size of the banks' book and the БНБ limits are in the
        calculator, next to the mortgage panel.</span
      >
    </p>
  </section>

  <!-- 5 ------------------------------------------------------------------ -->
  <section id="stock">
    <h2>
      <span class="l-bg">Колко жилища има</span>
      <span class="l-en">The housing stock</span>
    </h2>
    <p>
      <span class="l-bg"
        >Преброяването брои жилищата, не хората: колко конвенционални жилища има в страната и колко
        от тях са били необитавани в нощта на преброяването. «Необитавано» включва вторите жилища и
        вилите, не само празния фонд.</span
      >
      <span class="l-en"
        >The census counts dwellings rather than people: how many conventional dwellings the country
        has, and how many stood unoccupied on census night. "Unoccupied" includes second homes and
        holiday properties, not only genuinely empty stock.</span
      >
    </p>

    {#if structure.dwellings.value}
      <div class="stats">
        {@render figure(
          fmt0(structure.dwellings.value),
          COPY.mktKDwellings,
          COPY.srcEurostat,
          structure.dwellings.sourceUrl,
          when(structure.dwellings.refPeriod)
        )}
        {@render figure(
          fmt0(structure.unoccupied.value),
          COPY.mktKUnoccupied,
          COPY.srcEurostat,
          structure.unoccupied.sourceUrl,
          when(structure.unoccupied.refPeriod)
        )}
        {@render figure(
          `${fmt(structure.unoccupiedPct.value)}%`,
          COPY.mktKUnoccupiedShare,
          COPY.srcEurostat,
          structure.unoccupiedPct.sourceUrl,
          when(structure.unoccupiedPct.refPeriod)
        )}
      </div>

      {@render ourSum(
        {
          bg:
            `Делът е наша сметка: необитаваните жилища върху всички конвенционални жилища от същото ` +
            `преброяване — ${fmt0(structure.unoccupied.value)} върху ` +
            `${fmt0(structure.dwellings.value)}. И двете числа стоят до него.`,
          en:
            `The share is our arithmetic: unoccupied dwellings over all conventional dwellings from ` +
            `the same census — ${fmt0(structure.unoccupied.value)} over ` +
            `${fmt0(structure.dwellings.value)}. Both counts are beside it.`,
        },
        structure.unoccupiedPct.derivedFrom
      )}
    {/if}
  </section>

  <!-- 6 ------------------------------------------------------------------ -->
  <section id="ratio">
    <h2>
      <span class="l-bg">Скъпо ли е спрямо доходите</span>
      <span class="l-en">Expensive against incomes?</span>
    </h2>
    <p>
      <span class="l-bg"
        >Има един официален показател, който сравнява цените на жилищата с доходите и после сравнява
        резултата със собствената му дългосрочна средна стойност за същата страна. При 100
        съотношението е точно колкото средно за периода на реда. Под 100 значи, че спрямо доходите
        жилищата излизат по-евтино, отколкото средно за собствената им история — не че са евтини, и
        не спрямо друга държава.</span
      >
      <span class="l-en"
        >There is one official indicator that compares house prices with incomes and then compares
        the result with its own long-run average for the same country. At 100 the ratio is exactly
        its own average over the series. Below 100 means that against incomes, housing works out
        cheaper than it has over its own history — not that it is cheap, and not against another
        country.</span
      >
    </p>

    {#if structure.priceToIncome.value != null}
      <div class="stats">
        {@render figure(
          fmt(structure.priceToIncome.value),
          COPY.mktKPriceToIncome,
          COPY.srcEurostat,
          structure.priceToIncome.sourceUrl,
          when(structure.priceToIncome.refPeriod)
        )}
        {@render figure(
          `${fmt(structure.overburden.value)}%`,
          COPY.mktKOverburden,
          COPY.srcEurostat,
          structure.overburden.sourceUrl,
          when(structure.overburden.refPeriod)
        )}
        {#if rent}
          {@render figure(
            `${rent.annual_rate_pct > 0 ? "+" : ""}${fmt(rent.annual_rate_pct)}%`,
            COPY.mktKRentInflation,
            COPY.srcEurostat,
            rent.api_url,
            when(rent.ref_period)
          )}
        {/if}
      </div>
    {/if}

    <p class="cap">
      <span class="l-bg"
        >Тези три числа не сочат в една посока и страницата няма да реши вместо теб кое тежи повече.
        Показателят спрямо доходите и делът на домакинствата, които плащат над 40% от дохода си за
        жилище, се движат в една посока; наемите — в друга. Твоята сметка е в калкулатора.</span
      >
      <span class="l-en"
        >These three figures do not point the same way, and the page will not decide for you which
        weighs more. The income-relative indicator and the share of households paying over 40% of
        their income on housing move one way; rents move another. Your own arithmetic is in the
        calculator.</span
      >
    </p>
  </section>

  <p class="onward">
    <span class="l-bg"
      >Как е сметнато всичко останало на сайта е на <a href="/how/">страницата с числата</a>, а
      твоята собствена сметка — в <a href="/">калкулатора</a>.</span
    >
    <span class="l-en"
      >How everything else on the site is worked out is on <a href="/how/">the numbers page</a>, and
      your own arithmetic is in <a href="/">the calculator</a>.</span
    >
  </p>
</main>

<SiteFooter page="market" />

<style>
  /* The masthead is `/how/`'s, for the reason that page carries: `SiteHeader`
     belongs to the calculator and leads with controls this page has none of. */
  .skip {
    position: absolute;
    left: -9999px;
    top: 0;
    z-index: 100;
    background: var(--card);
    color: var(--ink);
    padding: 0.6rem 1rem;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .skip:focus {
    left: 0.75rem;
    top: 0.75rem;
  }
  header.site {
    border-bottom: 1px solid var(--line);
    background: var(--card);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 0.7rem;
    padding-bottom: 0.7rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: inherit;
  }
  .wm {
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .wm small {
    display: block;
    font-weight: 400;
    font-size: 0.72rem;
    color: var(--muted);
    letter-spacing: 0;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .pill {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--ink);
    text-decoration: none;
    cursor: pointer;
  }
  .pill:hover {
    border-color: var(--muted);
  }

  main.market {
    padding-top: 1.5rem;
    padding-bottom: 3rem;
  }
  h1 {
    font-size: 1.6rem;
    line-height: 1.25;
    margin: 0 0 0.75rem;
  }
  .lead {
    color: var(--muted);
    max-width: 44rem;
    margin: 0 0 1.5rem;
  }
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }
  .toc a {
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    text-decoration: none;
    color: var(--muted);
  }
  .toc a:hover {
    color: var(--ink);
    border-color: var(--muted);
  }
  section {
    margin: 0 0 2.75rem;
    max-width: 46rem;
  }
  h2 {
    font-size: 1.15rem;
    margin: 0 0 0.6rem;
  }
  section p {
    margin: 0 0 1rem;
    line-height: 1.6;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1.25rem 0;
  }
  .stat {
    flex: 1 1 10rem;
    min-width: 9rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.7rem 0.8rem;
    background: var(--card);
  }
  .sv {
    font-size: 1.25rem;
    font-weight: 600;
  }
  .sl {
    font-size: 0.82rem;
    margin-top: 0.15rem;
  }
  /* The source line is the smallest thing on the card and the one that makes
     the figure above it usable. It stays a link and stays legible: a provenance
     caption nobody can read is the same as none. */
  .ss {
    font-size: 0.72rem;
    margin-top: 0.35rem;
    color: var(--muted);
  }
  .ss a {
    color: inherit;
  }
  .ours,
  .cap {
    font-size: 0.8rem;
    color: var(--muted);
    line-height: 1.55;
  }
  .onward {
    margin-top: 2.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
    font-size: 0.9rem;
  }

  @media (max-width: 560px) {
    .wm small {
      display: none;
    }
    h1 {
      font-size: 1.35rem;
    }
  }
</style>
