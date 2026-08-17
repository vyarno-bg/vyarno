<script>
  /**
   * `/credit/` — what borrowing costs in Bulgaria, and what a Bulgarian
   * borrower is actually signing.
   *
   * The sixth route, built like `/market/`: prerendered in both languages,
   * every figure carrying its publisher, the period it describes and a link to
   * the table it came from. **No input on it, ever.** Every derived value takes
   * payloads rather than scalars (`view/credit.js`), so a reader's own salary
   * has no signature to be threaded into and this page cannot drift into the
   * calculator that already exists at `/`.
   *
   * NO LENDER APPEARS ON IT. P10 forbids a commercial relationship moving which
   * lender a reader sees, and the cheapest way to keep that true is to have no
   * list to move: БНБ's own registers are linked so a reader can check the firm
   * in front of them, and nothing here is reproduced or ranked.
   *
   * THE PAGE DESCRIBES AND DOES NOT ADVISE (P6), and this is the page where
   * that is hardest. «99,6% плаваща» plus «лихвата може да се промени» writes
   * "fix your rate" for the reader without our writing it, and that is the
   * honest form: the comparison and the number, with what to do about it left
   * where it belongs. `verify_copy.mjs` holds the vocabulary.
   *
   * The words are here and the wiring is in `view/credit.js`, which is the
   * split the rest of the SPA uses: a claim about which payload field feeds
   * which figure is one a test can hold, and an expression inside a `$derived`
   * is not.
   */
  import { onMount } from "svelte";
  import { lang } from "./lib/stores.js";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import SiteHeader from "./lib/SiteHeader.svelte";
  import DataLate from "./components/DataLate.svelte";
  import { COPY, t } from "./lib/content.js";
  import { loadAll } from "./lib/data.js";
  import { payloadsFor } from "./lib/payloads.js";
  import { dataAge } from "./lib/view/freshness.js";
  import {
    creditArrears,
    creditFixation,
    creditFixationHistory,
    creditLimits,
    creditOutstanding,
    creditProductHistory,
    creditProducts,
    creditRates,
    creditStockHistory,
    creditRenegotiation,
    creditSavings,
  } from "./lib/view/credit.js";
  import { dateShort, integer, number, periodLong } from "./lib/format.js";
  import { niceTicks, pathOf, plotX, plotY, tickAt, yearTicks } from "./lib/plot.js";

  const { payloads = null, servedLang = null } = $props();

  if (servedLang) lang.set(servedLang);

  // `"credit"` rather than the whole manifest: the calculator's payroll table
  // and percentile ladder render nothing here, and `payloadsFor` is what stops
  // a reader of this page paying for them (`payloads.js`).
  let data = $state(payloads ?? {});
  // Set in `onMount` and never seeded from the prop: the verdict is a function
  // of the clock, and the build's clock is not the reader's.
  let late = $state([]);

  onMount(async () => {
    data = await loadAll("credit");
    late = dataAge(data, payloadsFor("credit")).overdue;
  });

  const mortgage = $derived(data.mortgage ?? null);
  const rates = $derived(creditRates(mortgage));
  const stockHistory = $derived(creditStockHistory(mortgage));
  const fixation = $derived(creditFixation(mortgage));
  const fixationHistory = $derived(creditFixationHistory(mortgage));
  const renegotiation = $derived(creditRenegotiation(mortgage));
  const limits = $derived(creditLimits(mortgage));
  const products = $derived(creditProducts(data.credit ?? null));
  const productHistory = $derived(creditProductHistory(data.credit ?? null, mortgage));
  const owed = $derived(creditOutstanding(data.credit ?? null));
  const savings = $derived(creditSavings(data.credit ?? null));
  const arrears = $derived(creditArrears(data.credit ?? null));

  /**
   * The box every chart on this page is drawn in, in its own units. Two sizes,
   * and the taller one is for the debt levels: nineteen years of two lines that
   * cross needs the height to show where.
   *
   * **4:1 is a strip, not a plot.** At 600x150 the rate series' whole descent
   * from 8.4% to 2.6% is 90 units of a box 600 wide, so a nineteen-year fall
   * reads as a slope of about eight degrees and the year the prose points at is
   * a wiggle. 600x230 is the same honest scale at a shape a reader can take a
   * value off — near the 2.5:1 the two panels on `/market/` are drawn at, which
   * is the other page a reader arrives here from.
   */
  const CH_W = 600,
    CH_H = 230,
    CH_TALL = 300;
  const yOf = (v, axis, h = CH_H) => plotY(v, axis, h);
  const xOf = (i, n) => plotX(i, n, CH_W);
  // A year rule's x. `yearTicks` answers in a percentage so one value places
  // both the HTML label in the gutter and the rule inside the box, and this is
  // the inverse it goes back through — the same `plotX` and the same width, so
  // the rule lands on the column it labels rather than a last bit away.
  const yearX = (at) => (at / 100) * CH_W;
  const path = (series, axis, h = CH_H) => pathOf({ ...series, ...axis }, CH_W, h);
  const xTicks = (series) => yearTicks(series, CH_W);
  // Billions on the axis and in the headline, millions in the payload. €30,863 m
  // is not a figure anybody reads, and the table under the chart carries the
  // millions so nothing is lost by rounding the label a reader scans.
  const bn = (m, digits = 1) => number(m / 1000, digits, $lang);

  const PRODUCT_LABEL = {
    card: COPY.crdPCard,
    consumer: COPY.crdPConsumer,
    overdraft: COPY.crdPOverdraft,
    deposit_term: COPY.crdPDepositTerm,
    deposit_overnight: COPY.crdPDepositOvernight,
  };

  const BUCKET_LABEL = {
    up_to_1y: COPY.crdFixUpTo1y,
    "1y_to_5y": COPY.crdFix1to5,
    "5y_to_10y": COPY.crdFix5to10,
    over_10y: COPY.crdFixOver10,
  };

  const BLOCK_LABEL = {
    consumer: COPY.crdBlockConsumer,
    housing: COPY.crdBlockHousing,
    other: COPY.crdBlockOther,
    overdraft: COPY.crdBlockOverdraft,
  };
</script>

<SiteHeader page="/credit/" tagline={COPY.creditTagline ?? COPY.brandSmall} />

<main id="main" class="credit wrap">
  <h1>
    <span class="l-bg">Кредитите в България</span>
    <span class="l-en">Borrowing in Bulgaria</span>
  </h1>
  <p class="lede">
    <span class="l-bg"
      >Какво струва да вземеш пари назаем в България: жилищен кредит, потребителски, овърдрафт,
      кредитна карта. Колко дължат домакинствата, колко имат в банките и каква част от кредитите не
      се връща. Всяко число е на БНБ или на ЕЦБ, с посочен период и връзка към източника.</span
    >
    <span class="l-en"
      >What it costs to borrow money in Bulgaria: a home loan, a consumer loan, an overdraft, a
      credit card. How much households owe, how much they hold in the banks, and how much of it is
      not being repaid. Every figure is BNB's or the ECB's, with its period and a link to the
      source.</span
    >
  </p>

  <DataLate rows={late} inset />

  <!-- 1 ------------------------------------------------------------------ -->
  <section id="rates">
    <h2>
      <span class="l-bg">Трите лихви, и на какъв въпрос отговаря всяка</span>
      <span class="l-en">The three rates, and which question each answers</span>
    </h2>
    <div class="stats">
      {#each [[rates.aar, COPY.howKAar], [rates.aprc, COPY.howKAprc], [rates.outstanding, COPY.howKStock]] as [figure, label] (label.bg)}
        <div class="stat">
          <strong>{figure.value === null ? "—" : `${number(figure.value, 2, $lang)}%`}</strong>
          <span class="lbl">{t(label, $lang)}</span>
          {#if figure.sourceUrl}
            <a class="src" href={figure.sourceUrl} rel="noopener"
              >{periodLong(figure.refPeriod, $lang)}</a
            >
          {/if}
        </div>
      {/each}
    </div>
    <p>
      <span class="l-bg"
        >Първата е лихвата, от която се смята вноската. Втората е ГПР, тоест годишен процент на
        разходите: същите кредити, но с таксите, които банката изисква, за да ти отпусне заема.
        Затова е по-висока, и не с нея се смята вноската. Третата не е за нов кредит: тя е средното
        по всички жилищни кредити, които хората в момента изплащат, включително договори отпреди
        години.</span
      >
      <span class="l-en"
        >The first is the rate the monthly payment is worked out from. The second is the APRC, the
        annual percentage rate of charge: the same loans with the fees the bank requires in order to
        lend, so it is higher, and it is not the one the payment is worked out from. The third is
        not for a new loan at all. It is the average across every housing loan people are repaying
        right now, agreements signed years ago included.</span
      >
    </p>
  </section>

  <!-- 2 ------------------------------------------------------------------ -->
  {#if stockHistory}
    {@const line = stockHistory.series}
    {@const axis = niceTicks(0, line.max, 5)}
    <section id="stock-history">
      <h2>
        <span class="l-bg">Как се е движила тази лихва</span>
        <span class="l-en">How that rate has moved</span>
      </h2>
      <p>
        <span class="l-bg"
          >Това е третата лихва отгоре, месец по месец. Мени се бавно, защото е средно по целия
          остатък от стари и нови договори: спадне ли пазарът, тук се вижда чак когато старите
          кредити се изплатят или се предоговорят. Върхът е {number(
            stockHistory.peak.value,
            2,
            $lang
          )}% през {periodLong(stockHistory.peak.period, $lang)}, а последното измерване е {number(
            stockHistory.latest.value,
            2,
            $lang
          )}%.</span
        >
        <span class="l-en"
          >This is the third rate above, month by month. It moves slowly because it averages the
          whole outstanding book of old and new agreements: when the market falls, it shows here
          only as the older loans are repaid or repriced. The peak is {number(
            stockHistory.peak.value,
            2,
            $lang
          )}% in {periodLong(stockHistory.peak.period, $lang)}, and the latest reading is {number(
            stockHistory.latest.value,
            2,
            $lang
          )}%.</span
        >
      </p>
      <figure class="chart">
        <div class="plot">
          {@render yAxis(
            axis.values.map((v) => ({
              at: tickAt(v, axis),
              label: v === 0 ? "0" : `${number(v, Number.isInteger(v) ? 0 : 1, $lang)}%`,
            }))
          )}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_H}"
            role="img"
            aria-label={t(COPY.crdChartStockRate, $lang, {
              from: periodLong(line.from, $lang),
              to: periodLong(line.to, $lang),
              fromPct: number(line.first?.value, 2, $lang),
              toPct: number(line.latest?.value, 2, $lang),
              peakPct: number(stockHistory.peak.value, 2, $lang),
              peakAt: periodLong(stockHistory.peak.period, $lang),
            })}
          >
            {#each axis.values as v (v)}
              <line class="plot-grid" x1="0" y1={yOf(v, axis)} x2={CH_W} y2={yOf(v, axis)} />
            {/each}
            {#each xTicks(line) as tick (tick.year)}
              <line class="plot-year" x1={yearX(tick.at)} y1="0" x2={yearX(tick.at)} y2={CH_H} />
            {/each}
            <path class="plot-line" d={path(line, axis)} />
            {@render lastPoint(line, axis)}
            <line class="plot-axis" x1="0" y1={yOf(0, axis)} x2={CH_W} y2={yOf(0, axis)} />
            {#each line.points as p, i (p.period)}
              <rect
                class="plot-hit"
                x={xOf(i, line.points.length) - 2}
                y="0"
                width="4"
                height={CH_H}
                ><title>{periodLong(p.period, $lang)}: {number(p.value, 2, $lang)}%</title></rect
              >
            {/each}
          </svg>
          {@render xYears(xTicks(line))}
        </div>
      </figure>
      <p class="note">
        <a href={stockHistory.sourceUrl} rel="noopener">{t(COPY.crdWhoseBnb, $lang)}</a>
        · {periodLong(line.from, $lang)} – {periodLong(line.to, $lang)} ·
        <span class="l-bg"
          >лихвите в евро преди 2026 г. са възстановени от БНБ от отчетите в лева и в евро, а не
          наблюдавани по онова време</span
        >
        <span class="l-en"
          >euro rates before 2026 were reconstructed by BNB from the lev and euro reporting, not
          observed at the time</span
        >
      </p>
    </section>
  {/if}

  <!-- 3 ------------------------------------------------------------------ -->
  <section id="fixation">
    <h2>
      <span class="l-bg">Колко дълго е фиксирана лихвата</span>
      <span class="l-en">How long the rate is fixed for</span>
    </h2>
    <div class="stats">
      <div class="stat wide">
        <strong
          >{fixation.floating.value === null
            ? "—"
            : `${number(fixation.floating.value, 1, $lang)}%`}</strong
        >
        <span class="lbl">{t(COPY.crdKFloating, $lang)}</span>
        {#if fixation.floating.sourceUrl}
          <a class="src" href={fixation.floating.sourceUrl} rel="noopener"
            >{t(COPY.crdWhoseBnb, $lang)} · {periodLong(fixation.period, $lang)}</a
          >
        {/if}
      </div>
    </div>
    <p>
      <span class="l-bg"
        >БНБ броят заедно кредитите с плаваща лихва и тези, фиксирани за до една година, и го казват
        в бележка под таблицата. Затова първият ред отдолу не значи, че лихвата е фиксирана за
        година, а че банката може да я промени в рамките на година.</span
      >
      <span class="l-en"
        >BNB count variable-rate loans and loans fixed for up to a year as one bucket, and say so in
        a footnote under the table. So the first row below does not mean the rate is fixed for a
        year, but that the bank may change it within a year.</span
      >
    </p>
    {#if fixationHistory}
      {@const line = fixationHistory.series}
      {@const axis = niceTicks(0, line.max, 4)}
      <p>
        <span class="l-bg"
          >Така е през целия период, който БНБ публикуват. Делът не е падал под {number(
            fixationHistory.trough.value,
            1,
            $lang
          )}% нито веднъж, а най-ниската му стойност е през {periodLong(
            fixationHistory.trough.period,
            $lang
          )}, когато лихвите в Европа се вдигаха и част от хората избраха фиксирана лихва. После
          делът се върна нагоре.</span
        >
        <span class="l-en"
          >It has been that way across the whole period BNB publish. The share has never once fallen
          below {number(fixationHistory.trough.value, 1, $lang)}%, and its lowest reading is {periodLong(
            fixationHistory.trough.period,
            $lang
          )}, when rates across Europe were rising and some borrowers did fix. Then it went back up.</span
        >
      </p>
      <figure class="chart">
        <div class="plot">
          {@render yAxis(
            axis.values.map((v) => ({ at: tickAt(v, axis), label: `${number(v, 0, $lang)}%` }))
          )}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_H}"
            role="img"
            aria-label={t(COPY.crdChartFixation, $lang, {
              from: periodLong(line.from, $lang),
              to: periodLong(line.to, $lang),
              troughPct: number(fixationHistory.trough.value, 1, $lang),
              troughAt: periodLong(fixationHistory.trough.period, $lang),
              toPct: number(fixationHistory.latest.value, 1, $lang),
            })}
          >
            {#each axis.values as v (v)}
              <line class="plot-grid" x1="0" y1={yOf(v, axis)} x2={CH_W} y2={yOf(v, axis)} />
            {/each}
            {#each xTicks(line) as tick (tick.year)}
              <line class="plot-year" x1={yearX(tick.at)} y1="0" x2={yearX(tick.at)} y2={CH_H} />
            {/each}
            <path class="plot-line" d={path(line, axis)} />
            {@render lastPoint(line, axis)}
            <line class="plot-axis" x1="0" y1={yOf(0, axis)} x2={CH_W} y2={yOf(0, axis)} />
            {#each line.points as p, i (p.period)}
              <rect
                class="plot-hit"
                x={xOf(i, line.points.length) - 2}
                y="0"
                width="4"
                height={CH_H}
                ><title>{periodLong(p.period, $lang)}: {number(p.value, 2, $lang)}%</title></rect
              >
            {/each}
          </svg>
          {@render xYears(xTicks(line))}
        </div>
      </figure>
      <p class="note">
        <a href={fixationHistory.sourceUrl} rel="noopener">{t(COPY.crdWhoseBnb, $lang)}</a>
        · {periodLong(line.from, $lang)} – {periodLong(line.to, $lang)} ·
        <span class="l-bg"
          >делът е от обема на новото кредитиране, а не от броя на договорите, а данните в евро
          преди 2026 г. са възстановени от БНБ от отчетите в лева и в евро</span
        >
        <span class="l-en"
          >the share is of the volume of new lending, not of the number of agreements, and the euro
          figures before 2026 were reconstructed by BNB from the lev and euro reporting</span
        >
      </p>
    {/if}

    <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.crdTblFixation, $lang)}>
      <table class="fig-table">
        <thead>
          <tr>
            <th scope="col">{t(COPY.crdColFixation, $lang)}</th>
            <th scope="col" class="num">{t(COPY.crdColShare, $lang)}</th>
            <th scope="col" class="num">{t(COPY.crdColRate, $lang)}</th>
          </tr>
        </thead>
        <tbody>
          {#each fixation.buckets as bucket (bucket.bucket)}
            <tr>
              <th scope="row">{t(BUCKET_LABEL[bucket.bucket] ?? COPY.crdFixUpTo1y, $lang)}</th>
              <td class="num"
                >{bucket.sharePct === null ? "—" : `${number(bucket.sharePct, 2, $lang)}%`}</td
              >
              <td class="num"
                >{bucket.ratePct === null
                  ? t(COPY.crdNoLending, $lang)
                  : `${number(bucket.ratePct, 2, $lang)}%`}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- 4 ------------------------------------------------------------------ -->
  <section id="renegotiation">
    <h2>
      <span class="l-bg">Колко от новото кредитиране е стар кредит</span>
      <span class="l-en">How much of new lending is an old loan</span>
    </h2>
    <div class="stats">
      <div class="stat wide">
        <strong
          >{renegotiation.share.value === null
            ? "—"
            : `${number(renegotiation.share.value, 1, $lang)}%`}</strong
        >
        <span class="lbl">{t(COPY.crdKReneg, $lang)}</span>
        {#if renegotiation.share.sourceUrl}
          <a class="src" href={renegotiation.share.sourceUrl} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(renegotiation.share.refPeriod, $lang)}</a
          >
        {/if}
      </div>
    </div>
    <p>
      <span class="l-bg"
        >„Нов бизнес“ в статистиката значи всяко ново споразумение с банка. Предоговарянето на стар
        кредит също е споразумение, затова се брои като нов бизнес. ЕЦБ отчитат двете поотделно, а
        заглавията за рекорден месец по жилищно кредитиране ги събират в едно число.</span
      >
      <span class="l-en"
        >In the statistics, new business means any new agreement, and repricing an existing loan is
        an agreement too. The ECB report the two apart, while headlines about a record month of home
        lending do not.</span
      >
    </p>
  </section>

  <!-- 5 ------------------------------------------------------------------ -->
  {#if limits}
    <section id="limits">
      <h2>
        <span class="l-bg">Докъде може да стигне един кредит</span>
        <span class="l-en">How far a loan is allowed to go</span>
      </h2>
      <div class="stats">
        {@render limitStat(
          `${number(limits.minDownPaymentPct, 0, $lang)}%`,
          COPY.howKLtv,
          null,
          null
        )}
        {@render limitStat(`${number(limits.dstiMaxPct, 0, $lang)}%`, COPY.howKDsti, null, null)}
        {@render limitStat(`${limits.maturityMaxYears}`, COPY.howKMaturity, null, null)}
        <!-- The one measurement among three legal limits, so it is the one that
             carries a period: the banking-system column of БНБ's macroprudential
             review, years behind every ЕЦБ figure beside it (P4). It also has a
             source of its own — the limits press release does not contain it. -->
        {@render limitStat(
          `${number(limits.observedDstiPct, 1, $lang)}%`,
          COPY.howKObserved,
          limits.observedSourceUrl,
          limits.observedDstiPeriod
        )}
      </div>
      {#snippet limitStat(value, label, href, period)}
        <div class="stat">
          <strong>{value}</strong>
          <span class="lbl">{t(label, $lang)}</span>
          <a class="src" href={href ?? limits.sourceUrl} rel="noopener"
            >{t(COPY.crdWhoseBnb, $lang)}{period ? ` · ${period.replace("-", " ")}` : ""}</a
          >
        </div>
      {/snippet}
      <p>
        <span class="l-bg"
          >Първите три са в сила от {dateShort(limits.effectiveFrom, $lang)} и важат за всяка банка в
          страната. Последната не е изискване, а измерване: толкова от дохода си отделят за вноска хората,
          които са теглили кредит наскоро. Калкулаторът тук спира да нарича вноската поносима над {number(
            limits.prudentDstiPct,
            0,
            $lang
          )}% от чистия доход, по-строго и от тавана на БНБ, и от това, което тези хора носят. Тази
          граница не се мести.</span
        >
        <span class="l-en"
          >The first three have been in force since {dateShort(limits.effectiveFrom, $lang)} and bind
          every bank in the country. The last is not a requirement but a measurement: that is how much
          of their income people who borrowed recently put towards the payment. The calculator here stops
          calling a payment bearable above {number(limits.prudentDstiPct, 0, $lang)}% of net income,
          stricter than the BNB ceiling and than what those borrowers carry. That line does not
          move.</span
        >
      </p>
      <p class="note">
        <a href={limits.sourceUrl} rel="noopener">{t(COPY.crdWhoseBnb, $lang)}</a>
        ·
        <a href={limits.observedSourceUrl} rel="noopener">
          <span class="l-bg">наблюдаваното съотношение</span>
          <span class="l-en">the observed ratio</span>
        </a>
      </p>
    </section>
  {/if}

  <!-- 6 ------------------------------------------------------------------ -->
  {#if owed}
    {@const stock = owed.series}
    <section id="owed">
      <h2>
        <span class="l-bg">Колко дължат домакинствата</span>
        <span class="l-en">How much households owe</span>
      </h2>
      <div class="stats">
        <div class="stat wide">
          <strong
            >{owed.totalEurM === null
              ? "—"
              : `${bn(owed.totalEurM)} ${t(COPY.crdBn, $lang)}`}</strong
          >
          <span class="lbl">{t(COPY.crdKOwed, $lang)}</span>
          <a class="src" href={owed.sourceUrl} rel="noopener"
            >{t(COPY.crdWhoseBnb, $lang)} · {periodLong(owed.refPeriod, $lang)}</a
          >
        </div>
        <div class="stat">
          <strong>{owed.rate.value === null ? "—" : `${number(owed.rate.value, 2, $lang)}%`}</strong
          >
          <span class="lbl">{t(COPY.crdKOwedRate, $lang)}</span>
          <a class="src" href={owed.rate.sourceUrl} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(owed.rate.refPeriod, $lang)}</a
          >
        </div>
      </div>
      <p>
        <span class="l-bg"
          >ЕЦБ публикуват колко струва дългът, но не и колко е голям. Затова лихвата е тяхна, а
          сумата до нея е на БНБ. Че двете описват едни и същи кредити, се проверява при всяко
          обновяване.</span
        >
        <span class="l-en"
          >The ECB publish what the debt costs but not how large it is. So the rate is theirs and
          the amount beside it is BNB's. That the two describe the same loans is checked on every
          refresh.</span
        >
      </p>

      {#if stock.total?.points.length > 1}
        {@const axis = niceTicks(0, stock.total.max, 4)}
        <figure class="chart">
          <div class="plot">
            {@render yAxis(
              axis.values.map((v) => ({ at: tickAt(v, axis), label: v === 0 ? "0" : bn(v, 0) }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_TALL}"
              role="img"
              aria-label={t(COPY.crdChartStock, $lang, {
                from: periodLong(stock.total.from, $lang),
                to: periodLong(stock.total.to, $lang),
                hFrom: integer(stock.housing?.first?.value, $lang),
                hTo: integer(stock.housing?.latest?.value, $lang),
                cFrom: integer(stock.consumer?.first?.value, $lang),
                cTo: integer(stock.consumer?.latest?.value, $lang),
              })}
            >
              {#each axis.values as v (v)}
                <line
                  class="plot-grid"
                  x1="0"
                  y1={yOf(v, axis, CH_TALL)}
                  x2={CH_W}
                  y2={yOf(v, axis, CH_TALL)}
                />
              {/each}
              {#each xTicks(stock.total) as tick (tick.year)}
                <line
                  class="plot-year"
                  x1={yearX(tick.at)}
                  y1="0"
                  x2={yearX(tick.at)}
                  y2={CH_TALL}
                />
              {/each}
              <!-- The total is the quiet line and the two components are the
                   story: housing overtook consumer credit and kept going. Drawn
                   total-first so the components sit on top of it. -->
              <path class="plot-line total" d={path(stock.total, axis, CH_TALL)} />
              <path class="plot-line" d={path(stock.housing, axis, CH_TALL)} />
              <path class="plot-line second" d={path(stock.consumer, axis, CH_TALL)} />
              {@render lastPoint(stock.total, axis, CH_TALL, "total")}
              {@render lastPoint(stock.consumer, axis, CH_TALL, "second")}
              {@render lastPoint(stock.housing, axis, CH_TALL)}
              <line
                class="plot-axis"
                x1="0"
                y1={yOf(0, axis, CH_TALL)}
                x2={CH_W}
                y2={yOf(0, axis, CH_TALL)}
              />
              {#each stock.total.points as p, i (p.period)}
                <rect
                  class="plot-hit"
                  x={xOf(i, stock.total.points.length) - 2}
                  y="0"
                  width="4"
                  height={CH_TALL}
                  ><title
                    >{periodLong(p.period, $lang)}: {integer(p.value, $lang)}
                    {t(COPY.crdStockUnit, $lang)}</title
                  ></rect
                >
              {/each}
            </svg>
            {@render xYears(xTicks(stock.total))}
          </div>
          <figcaption>
            <span class="key total">{t(COPY.crdKeyTotal, $lang)}</span>
            <span class="key housing">{t(COPY.crdKeyHousing, $lang)}</span>
            <span class="key consumer">{t(COPY.crdKeyConsumer, $lang)}</span>
          </figcaption>
        </figure>
        <p class="note">
          <a href={owed.sourceUrl} rel="noopener">{t(COPY.crdWhoseBnb, $lang)}</a>
          · {periodLong(stock.total.from, $lang)} – {periodLong(stock.total.to, $lang)} ·
          <span class="l-bg"
            >сумите в евро преди 2026 г. са възстановени от БНБ от отчетите в лева и в евро, а не
            наблюдавани по онова време</span
          >
          <span class="l-en"
            >euro amounts before 2026 were reconstructed by BNB from the lev and euro reporting, not
            observed at the time</span
          >
        </p>
      {/if}

      <div class="scroll" role="region" tabindex="0" aria-label={t(COPY.crdTblOwed, $lang)}>
        <table class="fig-table">
          <thead>
            <tr>
              <th scope="col">{t(COPY.crdColBlock, $lang)}</th>
              <th scope="col" class="num">{t(COPY.crdColOwed, $lang)}</th>
              <th scope="col" class="num">{t(COPY.crdColOwedShare, $lang)}</th>
              <th scope="col" class="num">{t(COPY.crdColRate, $lang)}</th>
            </tr>
          </thead>
          <tbody>
            {#each owed.blocks as row (row.block)}
              <tr>
                <th scope="row">{t(BLOCK_LABEL[row.block] ?? COPY.crdBlockOther, $lang)}</th>
                <td class="num"
                  >{row.volumeEurM === null ? "—" : `${integer(row.volumeEurM, $lang)}`}</td
                >
                <td class="num"
                  >{row.sharePct === null ? "—" : `${number(row.sharePct, 1, $lang)}%`}</td
                >
                <td class="num"
                  >{row.ratePct === null ? "—" : `${number(row.ratePct, 2, $lang)}%`}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cap">
        <span class="l-bg"
          >Овърдрафтът включва и кредитните карти, защото БНБ ги отчитат вътре в него, а не отделно,
          така че четирите реда се събират до общото отгоре без нищо да се брои два пъти. Колко
          точно се дължи по карти е по-долу, при цената на картата.</span
        >
        <span class="l-en"
          >The overdraft row includes credit cards, because BNB report them inside it rather than
          beside it, so the four rows add up to the total above with nothing counted twice. How much
          is owed on cards specifically is below, beside what a card costs.</span
        >
      </p>
    </section>
  {/if}

  <!-- 7 ------------------------------------------------------------------ -->
  {#if savings}
    {@const held = savings.series}
    <section id="savings">
      <h2>
        <span class="l-bg">Какво имат домакинствата и какво дължат</span>
        <span class="l-en">What households have and what they owe</span>
      </h2>
      <p class="lede">
        <span class="l-bg"
          >Парите в банките и дългът към тях растат заедно, но дългът расте по-бързо.</span
        >
        <span class="l-en"
          >The money in the banks and the debt to them are growing together, but the debt is growing
          faster.</span
        >
      </p>
      <div class="stats">
        <div class="stat">
          <strong
            >{savings.depositsEurM === null
              ? "—"
              : `${bn(savings.depositsEurM)} ${t(COPY.crdBn, $lang)}`}</strong
          >
          <span class="lbl">{t(COPY.crdKHeld, $lang)}</span>
          <a class="src" href={savings.depositsSourceUrl} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(savings.refPeriod, $lang)}</a
          >
        </div>
        <div class="stat">
          <strong
            >{savings.loansEurM === null
              ? "—"
              : `${bn(savings.loansEurM)} ${t(COPY.crdBn, $lang)}`}</strong
          >
          <span class="lbl">{t(COPY.crdKHeldOwed, $lang)}</span>
          <a class="src" href={savings.loansSourceUrl} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(savings.refPeriod, $lang)}</a
          >
        </div>
      </div>
      <!-- The ratio is ours, so it is not a card: every `.stat` on this page is
           a publisher's figure with a link out to it, and a derived number in
           that row would be the one card a reader could not check. Disclosed
           directly under the two figures it divides, with both of them linked,
           which is the shape `/market/` gives its own derived figures. -->
      <p class="note ours">
        <strong>{savings.ratio === null ? "—" : `${number(savings.ratio, 2, $lang)} €`}</strong>
        <!-- Said as one euro against the other, because a bare «1,79» beside two
             billion-euro figures reads as a third amount rather than as the
             relation between them. The two operands carry the links. -->
        <span class="l-bg"
          >в банката на всяко евро дълг. През {periodLong(savings.from, $lang)} са били {number(
            savings.ratioFirst,
            2,
            $lang
          )} €. Наша сметка:
          <a href={savings.depositsSourceUrl} rel="noopener">парите в банката</a>, разделени на
          <a href={savings.loansSourceUrl} rel="noopener">дълга</a>, за един и същи месец.</span
        >
        <span class="l-en"
          >in the bank for every euro owed. In {periodLong(savings.from, $lang)} it was {number(
            savings.ratioFirst,
            2,
            $lang
          )} €. Ours: <a href={savings.depositsSourceUrl} rel="noopener">the money in the bank</a>
          divided by <a href={savings.loansSourceUrl} rel="noopener">the debt</a>, for the same
          month.</span
        >
      </p>

      {#if held.deposits?.points.length > 1 && held.loans?.points.length > 1}
        {@const axis = niceTicks(0, savings.scaleMax, 4)}
        <figure class="chart">
          <div class="plot">
            {@render yAxis(
              axis.values.map((v) => ({ at: tickAt(v, axis), label: v === 0 ? "0" : bn(v, 0) }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_H}"
              role="img"
              aria-label={t(COPY.crdChartSavings, $lang, {
                from: periodLong(savings.from, $lang),
                to: periodLong(savings.to, $lang),
                dFrom: integer(held.deposits.first?.value, $lang),
                dTo: integer(held.deposits.latest?.value, $lang),
                lFrom: integer(held.loans.first?.value, $lang),
                lTo: integer(held.loans.latest?.value, $lang),
                rFrom: number(savings.ratioFirst, 2, $lang),
                rTo: number(savings.ratioLatest, 2, $lang),
              })}
            >
              {#each axis.values as v (v)}
                <line class="plot-grid" x1="0" y1={yOf(v, axis)} x2={CH_W} y2={yOf(v, axis)} />
              {/each}
              {#each xTicks(held.deposits) as tick (tick.year)}
                <line class="plot-year" x1={yearX(tick.at)} y1="0" x2={yearX(tick.at)} y2={CH_H} />
              {/each}
              <path class="plot-line" d={path(held.deposits, axis)} />
              <path class="plot-line second" d={path(held.loans, axis)} />
              {@render lastPoint(held.loans, axis, CH_H, "second")}
              {@render lastPoint(held.deposits, axis)}
              <line class="plot-axis" x1="0" y1={yOf(0, axis)} x2={CH_W} y2={yOf(0, axis)} />
              <!-- One hit box per month carrying both readings, because the
                   question a reader has at a given month is the gap rather than
                   either line, and two overlapping targets answer half of it. -->
              {#each held.deposits.points as p, i (p.period)}
                <rect
                  class="plot-hit"
                  x={xOf(i, held.deposits.points.length) - 2}
                  y="0"
                  width="4"
                  height={CH_H}
                  ><title
                    >{periodLong(p.period, $lang)}: {integer(p.value, $lang)} / {integer(
                      held.loans.points[i]?.value,
                      $lang
                    )}
                    {t(COPY.crdStockUnit, $lang)}</title
                  ></rect
                >
              {/each}
            </svg>
            {@render xYears(xTicks(held.deposits))}
          </div>
          <figcaption>
            <span class="key">{t(COPY.crdKeyHeld, $lang)}</span>
            <span class="key consumer">{t(COPY.crdKeyOwedBsi, $lang)}</span>
          </figcaption>
        </figure>
        <p class="note">
          <a href={savings.depositsSourceUrl} rel="noopener">{t(COPY.crdWhoseEcb, $lang)}</a>
          · {periodLong(savings.from, $lang)} – {periodLong(savings.to, $lang)} ·
          <span class="l-bg"
            >ЕЦБ имат тези две числа за България само от {periodLong(savings.startsAt, $lang)} насам.
            Дългът го има и от по-рано, но графиката го спира тук: две линии, които тръгват от различни
            години, не се сравняват</span
          >
          <span class="l-en"
            >the ECB only have these two figures for Bulgaria from {periodLong(
              savings.startsAt,
              $lang
            )} onward. The debt goes back further, but the chart stops it here: two lines that start in
            different years cannot be compared</span
          >
        </p>
      {/if}

      <p class="cap">
        <span class="l-bg"
          >Дългът тук е с {number(savings.crossCheckPct, 1, $lang)}% по-голям от общото в таблицата
          по-горе и двете числа са верни. БНБ и ЕЦБ броят малко различни неща: БНБ броят само
          домакинствата, а ЕЦБ броят с тях и сдруженията с нестопанска цел, тоест читалища, църкви,
          синдикати. Затова и двете суми тук са на ЕЦБ: така се дели едно и също.</span
        >
        <span class="l-en"
          >The debt here is {number(savings.crossCheckPct, 1, $lang)}% larger than the total in the
          table above, and both figures are right. BNB and the ECB count slightly different things:
          BNB count households alone, while the ECB count the non-profits that serve them too,
          meaning community centres, churches and trade unions. So both amounts here are the ECB's,
          and the ratio divides like by like.</span
        >
      </p>
    </section>
  {/if}

  <!-- 8 ------------------------------------------------------------------ -->
  <section id="other">
    <h2>
      <span class="l-bg">Какво плащаш за пари, и какво ти плащат</span>
      <span class="l-en">What you pay for money, and what you are paid</span>
    </h2>
    <p>
      <span class="l-bg"
        >Жилищният кредит е най-евтиният начин да вземеш пари назаем в България, защото зад него
        стои жилището.</span
      >
      <span class="l-en"
        >A home loan is the cheapest way to borrow in Bulgaria, because the home stands behind it.</span
      >
    </p>
    <div class="stats">
      {#each products as product (product.key)}
        <div class="stat" class:pays={product.isDeposit}>
          <strong>{number(product.rate.value, 2, $lang)}%</strong>
          <span class="lbl">{t(PRODUCT_LABEL[product.key], $lang)}</span>
          <a class="src" href={product.rate.sourceUrl} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(product.rate.refPeriod, $lang)}</a
          >
          <!-- The quantity, and it is a second publisher's figure: ЕЦБ MIR
               carries no outstanding volume for BG at all, so the amount is
               БНБ's while the rate above it is the ЕЦБ's. Hence its own source
               line rather than a share of the one above. -->
          {#if product.stockEurM !== null}
            <span class="qty"
              ><strong>{integer(product.stockEurM, $lang)}</strong>
              {t(COPY.crdStockUnit, $lang)}
              {t(COPY.crdStockOf, $lang)}</span
            >
            <a class="src" href={product.stockSourceUrl} rel="noopener"
              >{t(COPY.crdWhoseBnb, $lang)} · {periodLong(product.stockRefPeriod, $lang)}</a
            >
          {/if}
          <!-- The deposit contrast: what a new deposit is quoted against what
               the money already in one earns. Both are the ЕЦБ's own, so this
               pair shares the source line above rather than adding one. -->
          {#if product.monthlyVolumeEurM !== null && product.isDeposit}
            <span class="qty"
              ><strong>{integer(product.monthlyVolumeEurM, $lang)}</strong>
              {t(COPY.crdStockUnit, $lang)}
              {t(COPY.crdDepositNew, $lang)}</span
            >
          {/if}
          {#if product.stockRatePct !== null && product.isDeposit}
            <span class="qty"
              >{t(COPY.crdDepositStock, $lang)}
              <strong>{number(product.stockRatePct, 2, $lang)}%</strong></span
            >
            <a class="src" href={product.stockSourceUrl} rel="noopener"
              >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(product.stockRefPeriod, $lang)}</a
            >
          {/if}
        </div>
      {/each}
    </div>
    <p class="cap">
      <span class="l-bg"
        >При картите сумата е само това, върху което наистина текат лихви: парите, останали
        неплатени след гратисния период. С карти се харчи много повече, но по-голямата част се връща
        навреме и не струва нищо. При овърдрафта извадихме картите: лихвата над сумата е на ЕЦБ и не
        важи за карти.</span
      >
      <span class="l-en"
        >For cards, the amount is only what interest actually runs on: the money left unpaid after
        the interest-free period. Far more than that is spent on cards, but most of it is paid back
        in time and costs nothing. For overdrafts we took the cards out: the rate above the amount
        is the ECB's and does not cover cards.</span
      >
    </p>

    {#if productHistory}
      {@const axis = niceTicks(0, productHistory.scaleMax, 5)}
      {@const card = productHistory.series.card}
      {@const consumer = productHistory.series.consumer}
      {@const mortgageLine = productHistory.series.mortgage}
      <h3>
        <span class="l-bg">Кои от тези цени се промениха</span>
        <span class="l-en">Which of these prices changed</span>
      </h3>
      <p>
        <span class="l-bg"
          >Трите не се движат заедно. Потребителският кредит поскъпна до {number(
            consumer.peak.value,
            2,
            $lang
          )}% през {periodLong(consumer.peak.period, $lang)} и оттогава слиза. Лихвата по картата почти
          не се е променила за целия период. А новият жилищен кредит е по-евтин сега, отколкото беше в
          началото на периода.</span
        >
        <span class="l-en"
          >The three do not move together. The consumer loan grew dearer, to {number(
            consumer.peak.value,
            2,
            $lang
          )}% in {periodLong(consumer.peak.period, $lang)}, and has fallen since. The card rate has
          barely moved across the whole period. A new home loan is cheaper now than it was at the
          start of the period.</span
        >
      </p>
      <figure class="chart">
        <div class="plot">
          {@render yAxis(
            axis.values.map((v) => ({ at: tickAt(v, axis), label: `${number(v, 0, $lang)}%` }))
          )}
          <svg
            class="pane"
            viewBox="0 0 {CH_W} {CH_TALL}"
            role="img"
            aria-label={t(COPY.crdChartPrices, $lang, {
              from: periodLong(productHistory.from, $lang),
              to: periodLong(productHistory.to, $lang),
              cardFrom: number(card.first.value, 2, $lang),
              cardTo: number(card.latest.value, 2, $lang),
              consFrom: number(consumer.first.value, 2, $lang),
              consTo: number(consumer.latest.value, 2, $lang),
              consPeak: number(consumer.peak.value, 2, $lang),
              consPeakAt: periodLong(consumer.peak.period, $lang),
              mortFrom: number(mortgageLine.first.value, 2, $lang),
              mortTo: number(mortgageLine.latest.value, 2, $lang),
            })}
          >
            {#each axis.values as v (v)}
              <line
                class="plot-grid"
                x1="0"
                y1={yOf(v, axis, CH_TALL)}
                x2={CH_W}
                y2={yOf(v, axis, CH_TALL)}
              />
            {/each}
            {#each xTicks(card) as tick (tick.year)}
              <line class="plot-year" x1={yearX(tick.at)} y1="0" x2={yearX(tick.at)} y2={CH_TALL} />
            {/each}
            <!-- The mortgage is the floor the other two are read against, and it
                 is drawn at full weight rather than faded the way §6's debt total
                 is. That total is context behind its own components; this line is
                 the section's opening claim, and at 390px a 55%-opacity hairline
                 lying on the zero rule is a claim a phone cannot check. -->
            <path class="plot-line floor" d={path(mortgageLine, axis, CH_TALL)} />
            <path class="plot-line second" d={path(consumer, axis, CH_TALL)} />
            <path class="plot-line" d={path(card, axis, CH_TALL)} />
            {@render lastPoint(mortgageLine, axis, CH_TALL, "floor")}
            {@render lastPoint(consumer, axis, CH_TALL, "second")}
            {@render lastPoint(card, axis, CH_TALL)}
            <line
              class="plot-axis"
              x1="0"
              y1={yOf(0, axis, CH_TALL)}
              x2={CH_W}
              y2={yOf(0, axis, CH_TALL)}
            />
            {#each card.points as p, i (p.period)}
              <rect
                class="plot-hit"
                x={xOf(i, card.points.length) - 2}
                y="0"
                width="4"
                height={CH_TALL}
                ><title
                  >{periodLong(p.period, $lang)}: {number(p.value, 2, $lang)}% ·
                  {number(consumer.points[i]?.value, 2, $lang)}% ·
                  {number(mortgageLine.points[i]?.value, 2, $lang)}%</title
                ></rect
              >
            {/each}
          </svg>
          {@render xYears(xTicks(card))}
        </div>
        <figcaption>
          <span class="key">{t(COPY.crdKeyCard, $lang)}</span>
          <span class="key consumer">{t(COPY.crdKeyConsumerLoan, $lang)}</span>
          <span class="key floor">{t(COPY.crdKeyMortgage, $lang)}</span>
        </figcaption>
      </figure>
      <p class="note">
        <a href={productHistory.sourceUrl} rel="noopener">{t(COPY.crdWhoseEcb, $lang)}</a>
        · {periodLong(productHistory.from, $lang)} – {periodLong(productHistory.to, $lang)} ·
        <span class="l-bg"
          >това са лихвите по договорите, подписани през съответния месец, а не по това, което вече
          изплащаш; до 2026 г. са по кредитите в лева, а оттогава по кредитите в евро. Овърдрафтът и
          депозитите не са на графиката: овърдрафтът се движи като жилищния кредит, а депозитните
          лихви се публикуват едва от януари 2026 г.</span
        >
        <span class="l-en"
          >these are the rates on agreements signed in each month, not on what you are already
          repaying; through 2025 they are the lev lending and from 2026 the euro lending. The
          overdraft and the deposits are not on the chart: the overdraft moves with the home loan,
          and the deposit rates are only published from January 2026</span
        >
      </p>
    {/if}
  </section>

  <!-- 9 ------------------------------------------------------------------ -->
  {#if arrears}
    <section id="arrears">
      <h2>
        <span class="l-bg">Колко от кредитите не се връщат</span>
        <span class="l-en">How much of it is not being repaid</span>
      </h2>
      <div class="stats">
        <div class="stat wide">
          <strong
            >{arrears.households === null
              ? "—"
              : `${number(arrears.households, 2, $lang)}%`}</strong
          >
          <span class="lbl">{t(COPY.crdKArrears, $lang)}</span>
          <a class="src" href={arrears.scopeSourceUrls.households} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(arrears.refPeriod, $lang)}</a
          >
        </div>
        <div class="stat">
          <strong
            >{arrears.corporations === null
              ? "—"
              : `${number(arrears.corporations, 2, $lang)}%`}</strong
          >
          <span class="lbl">{t(COPY.crdKArrearsFirms, $lang)}</span>
          <a class="src" href={arrears.scopeSourceUrls.corporations} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(arrears.refPeriod, $lang)}</a
          >
        </div>
        <div class="stat">
          <strong
            >{arrears.allCounterparties === null
              ? "—"
              : `${number(arrears.allCounterparties, 2, $lang)}%`}</strong
          >
          <span class="lbl">{t(COPY.crdKArrearsAll, $lang)}</span>
          <a class="src" href={arrears.scopeSourceUrls.all} rel="noopener"
            >{t(COPY.crdWhoseEcb, $lang)} · {periodLong(arrears.refPeriod, $lang)}</a
          >
        </div>
      </div>
      <p>
        <span class="l-bg"
          >Когато в новините излезе едно число за необслужваните кредити, то обикновено е за всички
          кредити на банките наведнъж. Това е третото число тук, а не първото. Фирмите изостават с
          плащанията по-често от хората във всяко тримесечие, което ЕЦБ публикуват, затова общото
          число е по-високо от това за домакинствата.</span
        >
        <span class="l-en"
          >When a single figure for bad loans turns up in the news, it is usually for all the banks'
          lending at once. That is the third figure here, not the first. Companies fall behind on
          their payments more often than people do in every quarter the ECB publish, so the combined
          figure sits above the household one.</span
        >
      </p>
      <p class="cap">
        <span class="l-bg"
          >Числата са на тримесечие и излизат около пет месеца след тримесечието, което описват,
          затова са по-стари от всяка лихва на тази страница. Процентът се смята върху всички
          кредити към същите клиенти. БНБ публикуват свой процент в надзорния си доклад, който се
          смята по друг начин и не съвпада с тези.</span
        >
        <span class="l-en"
          >These are quarterly and land about five months after the quarter they describe, so they
          are older than every rate on this page. The percentage is taken over every loan to those
          same borrowers. BNB publish a figure of their own in their supervisory report; it is
          worked out differently and does not match these.</span
        >
      </p>

      {#if arrears.series.households.points.length > 1}
        {@const axis = niceTicks(
          0,
          Math.max(arrears.series.corporations.max, arrears.series.households.max),
          4
        )}
        <figure class="chart">
          <div class="plot">
            {@render yAxis(
              axis.values.map((v) => ({
                at: tickAt(v, axis),
                label: v === 0 ? "0" : `${number(v, 0, $lang)}%`,
              }))
            )}
            <svg
              class="pane"
              viewBox="0 0 {CH_W} {CH_H}"
              role="img"
              aria-label={t(COPY.crdChartArrears, $lang, {
                from: periodLong(arrears.series.households.from, $lang),
                to: periodLong(arrears.series.households.to, $lang),
                hFrom: number(arrears.series.households.first?.value, 2, $lang),
                hTo: number(arrears.series.households.latest?.value, 2, $lang),
                cFrom: number(arrears.series.corporations.first?.value, 2, $lang),
                cTo: number(arrears.series.corporations.latest?.value, 2, $lang),
              })}
            >
              {#each axis.values as v (v)}
                <line class="plot-grid" x1="0" y1={yOf(v, axis)} x2={CH_W} y2={yOf(v, axis)} />
              {/each}
              {#each xTicks(arrears.series.households) as tick (tick.year)}
                <line class="plot-year" x1={yearX(tick.at)} y1="0" x2={yearX(tick.at)} y2={CH_H} />
              {/each}
              <path class="plot-line second" d={path(arrears.series.corporations, axis)} />
              <path class="plot-line" d={path(arrears.series.households, axis)} />
              {@render lastPoint(arrears.series.corporations, axis, CH_H, "second")}
              {@render lastPoint(arrears.series.households, axis)}
              <line class="plot-axis" x1="0" y1={yOf(0, axis)} x2={CH_W} y2={yOf(0, axis)} />
              {#each arrears.series.households.points as p, i (p.period)}
                <rect
                  class="plot-hit"
                  x={xOf(i, arrears.series.households.points.length) - 4}
                  y="0"
                  width="8"
                  height={CH_H}
                  ><title>{periodLong(p.period, $lang)}: {number(p.value, 2, $lang)}%</title></rect
                >
              {/each}
            </svg>
            {@render xYears(xTicks(arrears.series.households))}
          </div>
          <figcaption>
            <span class="key housing">{t(COPY.crdKeyHouseholds, $lang)}</span>
            <span class="key consumer">{t(COPY.crdKeyFirms, $lang)}</span>
          </figcaption>
        </figure>
        <p class="note">
          <a href={arrears.sourceUrl} rel="noopener">{t(COPY.crdWhoseEcb, $lang)}</a>
          · {periodLong(arrears.series.households.from, $lang)} – {periodLong(
            arrears.series.households.to,
            $lang
          )}
        </p>
      {/if}
    </section>
  {/if}
</main>

<!-- The two snippets both charts share. The tick VALUES come out of `plot.js`
     and these place them: HTML in a gutter beside the box, because inside an SVG
     scaled to the viewport an 11px label reaches a phone at 6.2px. `chart.css`
     carries the grid that makes a percentage `top` land on its own gridline. -->
<!--
  The newest reading, marked.

  Every figure on this page is the last point of some series, and on a plot 230
  quarters wide that point is a stub at the right edge with nothing to say it is
  the one the paragraph above just quoted. `chart.css#.plot-last` paints the
  ground around it so it reads as a point rather than as the line thickening.
-->
{#snippet lastPoint(series, axis, h = CH_H, cls = "")}
  {@const p = series?.points?.[series.points.length - 1]}
  {#if p}
    <circle class="plot-last {cls}" cx={CH_W} cy={yOf(p.value, axis, h)} aria-hidden="true" />
  {/if}
{/snippet}

{#snippet yAxis(ticks)}
  <div class="yaxis" aria-hidden="true">
    {#each ticks as tick (tick.label)}
      <span class="plot-tick" style="top:{tick.at.toFixed(2)}%">{tick.label}</span>
    {/each}
  </div>
{/snippet}

{#snippet xYears(ticks)}
  <div class="xyears" aria-hidden="true">
    {#each ticks as tick (tick.year)}
      <span
        class="plot-tick"
        style="left:{tick.at.toFixed(2)}%; transform:translateX({tick.at < 5
          ? '0'
          : tick.at > 95
            ? '-100%'
            : '-50%'})">{tick.year}</span
      >
    {/each}
  </div>
{/snippet}

<SiteFooter page="credit" />

<style>
  /* The same column `/how/` and `/market/` take, and it had been the wrapper's
     full 1120px here — so a reader moving between three sibling documents met
     the same chart at two different widths and the same paragraph at two
     different lengths. */
  .credit {
    padding-bottom: 64px;
    max-width: var(--col);
  }
  /* The same lockup `/how/` and `/market/` give their titles — three content
     pages that a reader arrives at from each other should not each announce
     themselves in a different voice. */
  h1 {
    font-family: var(--serif);
    font-size: var(--fs-title);
    line-height: 1.12;
    letter-spacing: -0.018em;
    margin: 28px 0 10px;
  }
  .lede {
    font-size: var(--fs-lead);
    color: var(--ink-2);
    max-width: var(--measure);
    margin: 0 0 8px;
  }
  section {
    margin-top: 40px;
  }
  h2 {
    font-family: var(--serif);
    font-size: var(--fs-h2);
    line-height: 1.2;
    letter-spacing: -0.012em;
    margin: 0 0 10px;
    color: var(--ink);
  }
  p {
    max-width: var(--measure);
    margin: 0 0 12px;
  }
  .note {
    font-size: var(--fs-small);
    color: var(--muted);
  }
  /* The one figure on this page nobody published. It sits under the two levels
     it divides rather than beside them, and it leads with the number so the
     disclosure reads as a caption on a figure rather than as a footnote. */
  .ours strong {
    font-size: var(--fs-h3);
    color: var(--ink);
    margin-right: 4px;
  }
  .ours a {
    white-space: nowrap;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    /* Wide enough that two tiles' labels do not read as one paragraph now that
       nothing but the gap separates them. */
    gap: 22px;
    /* Air above the tiles' rules. A single wide tile directly under its `h2`
       otherwise reads as a heading with an underline rather than as the top of a
       figure, which is the one place this treatment is ambiguous. */
    margin: 8px 0 14px;
  }
  /* Hung from a rule rather than drawn as a box — `docs/site.md` §"A figure is
     hung from a rule, not drawn in a box" is the argument, and it covers the
     same tile on `/market/` and in the calculator's strip. */
  .stat {
    flex: 1 1 200px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 2px solid var(--ink);
    padding-top: 11px;
  }
  .stat.wide {
    flex-basis: 100%;
  }
  /* `--fs-figure` and not `--fs-h2`: thirteen of these sit under four section
     headings, and a card's number has to outrank the heading over it. */
  .stat strong {
    font-size: var(--fs-figure);
    line-height: 1.02;
    letter-spacing: -0.025em;
    font-variant-numeric: tabular-nums;
  }
  .stat .lbl {
    font-size: var(--fs-meta);
    color: var(--ink-2);
    line-height: 1.35;
  }
  /* Five products read as one ladder, dearest to cheapest. At the shared 200px
     basis the fifth falls past the row and grows to a full-width bar, which
     reads as a different kind of thing rather than the last rung of the same
     one. */
  #other .stat {
    flex-basis: 170px;
  }
  /* What the bank pays you, drawn as the other direction. `--real` is this
     app's "your number is the good one" colour and the deposit rows are the
     only figures on this page that are money coming towards the reader. */
  .stat.pays strong {
    color: var(--real-ink);
  }
  .stat .src {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--muted);
    /* The provenance is a third register under the figure and its label, so it
       gets more air than the 4px between those two — at the flex gap it read as
       a second line of the label. */
    margin-top: 4px;
  }
  /* The quantity under a price. Set at the label's size rather than the
     figure's: it is a second number on a card whose headline is the rate, and
     drawn at the rate's weight the card would have two headlines and say
     neither. */
  .stat .qty {
    font-size: var(--fs-small);
    color: var(--ink-2);
  }
  .stat .qty strong {
    font-size: inherit;
    letter-spacing: 0;
  }
  .cap {
    font-size: var(--fs-small);
    color: var(--muted);
    max-width: var(--measure);
  }
  /* The debt total is context for the two lines that cross over it, so it is
     the quiet one — a third saturated stroke would make the picture a contest
     between three series when the reading is housing against consumer, with
     their sum behind it. */
  :global(.plot-line.total) {
    stroke: var(--ink-2);
    stroke-width: 1;
    stroke-dasharray: none;
    opacity: 0.55;
  }
  /* The third line on the price chart. The neutral ink at full strength and
     undashed, so it is told from the dashed second line by pattern rather than
     by weight — and `.total` may not serve, because it fades to 55% on the
     argument that a sum behind two components is context. This line is one of
     the three being compared. */
  :global(.plot-line.floor) {
    stroke: var(--ink-2);
    stroke-width: 1.5;
  }
  /* The end markers for the two lines that are not `--real` or `--series-2`.
     Each takes the stroke of its own line, or the mark at the end of a series
     names a colour the series is not drawn in. */
  :global(.plot-last.total) {
    fill: var(--ink-2);
    opacity: 0.55;
  }
  :global(.plot-last.floor) {
    fill: var(--ink-2);
  }
  /* The legend. Each key carries the stroke of the line it names, drawn as a
     short rule before the word rather than a swatch, so the mark in the caption
     is the same mark as in the plot. */
  .chart figcaption .key::before {
    content: "";
    display: inline-block;
    width: 14px;
    height: 0;
    margin-right: 5px;
    vertical-align: 0.22em;
    border-top: 2px solid var(--real);
  }
  .chart figcaption .key.consumer::before {
    border-top-style: dashed;
    border-top-color: var(--ink-2);
  }
  .chart figcaption .key.total::before {
    border-top-width: 1px;
    border-top-color: var(--ink-2);
    opacity: 0.55;
  }
  .chart figcaption .key.floor::before {
    border-top-color: var(--ink-2);
  }
  /* The horizontal scroll box the tables sit in, and the focus ring that makes
     it reachable by keyboard. `fig-table.css` styles the table; the box around
     it is the page's. */
  .scroll {
    overflow-x: auto;
    margin: 0 0 10px;
  }
  .scroll:focus-visible {
    outline: 2px solid var(--accent, currentColor);
    outline-offset: 2px;
  }
</style>
