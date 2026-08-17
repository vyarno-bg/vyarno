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
    creditLimits,
    creditOutstanding,
    creditProducts,
    creditRates,
    creditRenegotiation,
    creditSavings,
  } from "./lib/view/credit.js";
  import { integer, number, periodLong } from "./lib/format.js";
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
  const fixation = $derived(creditFixation(mortgage));
  const renegotiation = $derived(creditRenegotiation(mortgage));
  const limits = $derived(creditLimits(mortgage));
  const products = $derived(creditProducts(data.credit ?? null));
  const owed = $derived(creditOutstanding(data.credit ?? null));
  const savings = $derived(creditSavings(data.credit ?? null));
  const arrears = $derived(creditArrears(data.credit ?? null));

  // The box every chart on this page is drawn in, in its own units. Two sizes,
  // and the taller one is for the debt levels: nineteen years of two lines that
  // cross needs the height to show where, and the arrears chart is six years of
  // two lines that never do.
  const CH_W = 600,
    CH_H = 150,
    CH_TALL = 200;
  const yOf = (v, axis, h = CH_H) => plotY(v, axis, h);
  const xOf = (i, n) => plotX(i, n, CH_W);
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
      >Какво струва един жилищен кредит, за колко време му е фиксирана лихвата и кой всъщност взема
      новите кредити, по данни на БНБ и ЕЦБ, с източник, период и връзка за всяко число.</span
    >
    <span class="l-en"
      >What a home loan costs, how long its rate is fixed for, and who is actually taking out the
      new loans, from BNB and the ECB, with a source, a period and a link on every figure.</span
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
          <strong>{figure.value === null ? "—" : `${number(figure.value, 2)}%`}</strong>
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
        >Първата е лихвата, от която се смята вноската. Втората е ГПР: същите кредити, но с таксите,
        които банката изисква, за да отпусне заема, така че тя е по-висока и не е числото, с което
        се амортизира кредит. Третата не е за нов кредитополучател, а е средното по вече изплащания
        портфейл, в който има договори отпреди години.</span
      >
      <span class="l-en"
        >The first is the rate the monthly payment is computed from. The second is the APRC: the
        same loans with the charges the bank requires in order to lend, so it is higher and it is
        not the figure a loan is amortised with. The third is not for a new borrower at all, but the
        average across the book already being repaid, which holds agreements signed years ago.</span
      >
    </p>
  </section>

  <!-- 2 ------------------------------------------------------------------ -->
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
            : `${number(fixation.floating.value, 1)}%`}</strong
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
        година, а че банката може да я промени в рамките на година. Обратното на това е четвъртият
        ред.</span
      >
      <span class="l-en"
        >BNB count variable-rate loans and loans fixed for up to a year as one bucket, and say so in
        a footnote under the table. So the first row below does not mean the rate is fixed for a
        year, but that the bank may change it within a year. The fourth row is what the opposite
        looks like.</span
      >
    </p>
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
                >{bucket.sharePct === null ? "—" : `${number(bucket.sharePct, 2)}%`}</td
              >
              <td class="num"
                >{bucket.ratePct === null
                  ? t(COPY.crdNoLending, $lang)
                  : `${number(bucket.ratePct, 2)}%`}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- 3 ------------------------------------------------------------------ -->
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
            : `${number(renegotiation.share.value, 1)}%`}</strong
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
        >В статистиката нов бизнес значи всяко ново споразумение, а предоговарянето на съществуващ
        кредит също е споразумение. ЕЦБ отчитат двете поотделно, а заглавията за рекорден месец по
        жилищно кредитиране не ги разделят.</span
      >
      <span class="l-en"
        >In the statistics, new business means any new agreement, and repricing an existing loan is
        an agreement too. The ECB report the two apart, while headlines about a record month of home
        lending do not.</span
      >
    </p>
  </section>

  <!-- 4 ------------------------------------------------------------------ -->
  {#if limits}
    <section id="limits">
      <h2>
        <span class="l-bg">Докъде може да стигне един кредит</span>
        <span class="l-en">How far a loan is allowed to go</span>
      </h2>
      <div class="stats">
        {@render limitStat(`${number(limits.minDownPaymentPct, 0)}%`, COPY.howKLtv, null, null)}
        {@render limitStat(`${number(limits.dstiMaxPct, 0)}%`, COPY.howKDsti, null, null)}
        {@render limitStat(`${limits.maturityMaxYears}`, COPY.howKMaturity, null, null)}
        <!-- The one measurement among three legal limits, so it is the one that
             carries a period: the banking-system column of БНБ's macroprudential
             review, years behind every ЕЦБ figure beside it (P4). It also has a
             source of its own — the limits press release does not contain it. -->
        {@render limitStat(
          `${number(limits.observedDstiPct, 1)}%`,
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
          >Първите три са в сила от {limits.effectiveFrom} г. и важат за всяка банка в страната. Последната
          не е изискване, а измерване: толкова от дохода си отделят за вноска хората, които са теглили
          кредит наскоро. Калкулаторът тук спира да нарича вноската поносима над {number(
            limits.prudentDstiPct,
            0
          )}% от чистия доход, по-строго и от тавана на БНБ, и от това, което тези хора носят, и не
          се мести.</span
        >
        <span class="l-en"
          >The first three have been in force since {limits.effectiveFrom} and bind every bank in the
          country. The last is not a requirement but a measurement: that is how much of their income people
          who borrowed recently put towards the payment. The calculator here stops calling a payment bearable
          above {number(limits.prudentDstiPct, 0)}% of net income, stricter than the BNB ceiling and
          than what those borrowers carry, and it does not move.</span
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

  <!-- 5 ------------------------------------------------------------------ -->
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
          >Сумата е на БНБ, а лихвата до нея е на ЕЦБ, и това не е разсеяност: ЕЦБ публикуват колко
          струва дългът, но не и колко е голям, а БНБ отчитат и двете в един ред. Затова всяко число
          тук носи собствения си източник. Двете описват един и същи портфейл, което пък се
          проверява при всяко обновяване.</span
        >
        <span class="l-en"
          >The amount is BNB's and the rate beside it is the ECB's, and that is not carelessness:
          the ECB publish what the debt costs but not how large it is, while BNB report both in one
          row. So every figure here carries its own source. That the two describe the same book is
          checked on every refresh.</span
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
                  x1={(tick.at / 100) * CH_W}
                  y1="0"
                  x2={(tick.at / 100) * CH_W}
                  y2={CH_TALL}
                />
              {/each}
              <!-- The total is the quiet line and the two components are the
                   story: housing overtook consumer credit and kept going. Drawn
                   total-first so the components sit on top of it. -->
              <path class="plot-line total" d={path(stock.total, axis, CH_TALL)} />
              <path class="plot-line" d={path(stock.housing, axis, CH_TALL)} />
              <path class="plot-line second" d={path(stock.consumer, axis, CH_TALL)} />
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
          >Сумите са в милиони евро. Овърдрафтът включва и кредитните карти, защото БНБ ги отчитат
          вътре в него, а не отделно, така че четирите реда се събират до общото отгоре без нищо да
          се брои два пъти. Колко точно се дължи по карти е по-долу, при цената на картата.</span
        >
        <span class="l-en"
          >Amounts are in millions of euro. The overdraft row includes credit cards, because BNB
          report them inside it rather than beside it, so the four rows add up to the total above
          with nothing counted twice. How much is owed on cards specifically is below, beside what a
          card costs.</span
        >
      </p>
    </section>
  {/if}

  <!-- 6 ------------------------------------------------------------------ -->
  {#if savings}
    {@const held = savings.series}
    <section id="savings">
      <h2>
        <span class="l-bg">Какво имат домакинствата и какво дължат</span>
        <span class="l-en">What households have and what they owe</span>
      </h2>
      <p class="lede">
        <span class="l-bg"
          >Всяка лихва по-горе е цена. Тук са двете количества под нея: колко държат домакинствата в
          банките и колко дължат на тях. И двете растат, но дългът расте по-бързо, затова на всяко
          евро дълг се падат все по-малко евро в банката.</span
        >
        <span class="l-en"
          >Every rate above is a price. These are the two quantities underneath it: what households
          hold in the banks, and what they owe them. Both are growing and the debt is growing
          faster, so every euro owed is matched by less in the bank than it was.</span
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
        <strong>{savings.ratio === null ? "—" : number(savings.ratio, 2, $lang)}</strong>
        {t(COPY.crdKCushion, $lang)} · {t(COPY.crdSrcOurRatio, $lang)}:
        <!-- The division sign rather than a comma between the two links. They
             are the operands, and two link words side by side read as a list of
             two things rather than as one divided by the other. -->
        <a href={savings.depositsSourceUrl} rel="noopener">{t(COPY.crdKeyHeld, $lang)}</a> ÷
        <a href={savings.loansSourceUrl} rel="noopener">{t(COPY.crdKeyOwedBsi, $lang)}</a>
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
                <line
                  class="plot-year"
                  x1={(tick.at / 100) * CH_W}
                  y1="0"
                  x2={(tick.at / 100) * CH_W}
                  y2={CH_H}
                />
              {/each}
              <path class="plot-line" d={path(held.deposits, axis)} />
              <path class="plot-line second" d={path(held.loans, axis)} />
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
            >по-назад няма: ЕЦБ публикуват тези два реда за България от {periodLong(
              savings.startsAt,
              $lang
            )} нататък, а кредитите са отрязани до депозитите, защото две линии по различни периоди са
            два въпроса на една картинка</span
          >
          <span class="l-en"
            >no further back: the ECB publish these two series for Bulgaria from {periodLong(
              savings.startsAt,
              $lang
            )} onward, and the loan line is cut to match the deposits, because two lines over different
            windows are two questions on one picture</span
          >
        </p>
      {/if}

      <p class="cap">
        <span class="l-bg"
          >Кредитите тук са с {number(savings.crossCheckPct, 1, $lang)}% повече от общото в
          таблицата по-горе и двете числа са верни. БНБ броят само сектор „Домакинства“ при
          потребителските и жилищните кредити, а ЕЦБ броят с тях и нестопанските организации, които
          обслужват домакинствата. Съотношението дели едно и също население само на себе си, затова
          и двете суми тук са на ЕЦБ.</span
        >
        <span class="l-en"
          >The loans here run {number(savings.crossCheckPct, 1, $lang)}% above the total in the
          table further up, and both figures are right. BNB count sector Households alone in the
          consumer and housing blocks, while the ECB count the non-profit institutions serving
          households along with them. The ratio divides one population by itself, which is why both
          amounts here are the ECB's.</span
        >
      </p>
    </section>
  {/if}

  <!-- 7 ------------------------------------------------------------------ -->
  <section id="other">
    <h2>
      <span class="l-bg">Всичко останало, което един човек плаща за пари</span>
      <span class="l-en">Everything else a person pays for money</span>
    </h2>
    <p>
      <span class="l-bg"
        >Жилищният кредит е най-евтиният начин да вземеш пари назаем в България, защото зад него
        стои жилището. Ето какво струват другите, и накрая какво плаща банката на теб.</span
      >
      <span class="l-en"
        >A home loan is the cheapest way to borrow in Bulgaria, because the home stands behind it.
        Here is what the others cost, and at the end what the bank pays you.</span
      >
    </p>
    <div class="stats">
      {#each products as product (product.key)}
        <div class="stat" class:pays={product.isDeposit}>
          <strong>{number(product.rate.value, 2)}%</strong>
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
              >{t(COPY.crdStockOf, $lang)} <strong>{integer(product.stockEurM, $lang)}</strong>
              {t(COPY.crdStockUnit, $lang)}</span
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
              >{t(COPY.crdDepositNew, $lang)}
              <strong>{integer(product.monthlyVolumeEurM, $lang)}</strong>
              {t(COPY.crdStockUnit, $lang)}</span
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
        >Сумите под лихвите са на БНБ, защото ЕЦБ не публикуват колко се дължи по нито един от тези
        продукти. При картите числото е точно това, което се плаща лихва по него: салдото, останало
        след гратисния период, а не всичко изтеглено с карта. При овърдрафта е блокът на БНБ без
        картите в него, защото ЕЦБ слагат границата там, а БНБ не.</span
      >
      <span class="l-en"
        >The amounts under the rates are BNB's, because the ECB publish no outstanding balance for
        any of these products. For cards the figure is exactly the balance interest is charged on:
        what is left after the interest-free period, not everything ever spent on a card. For the
        overdraft it is BNB's block without the cards inside it, because the ECB draw the boundary
        there and BNB do not.</span
      >
    </p>
  </section>

  <!-- 8 ------------------------------------------------------------------ -->
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
          >Когато в новините се появи едно число за необслужваните кредити, то обикновено е по целия
          кредитен портфейл на банките. Това е третото тук, а не първото. Фирмите изостават по-често
          от домакинствата във всяко тримесечие, което ЕЦБ публикуват, така че общото число се
          изтегля нагоре от половината, която не е за хората. Затова тази страница показва и трите,
          с отделна връзка за всяко.</span
        >
        <span class="l-en"
          >When a single non-performing-loans figure turns up in the news it is usually the one over
          a bank's whole credit portfolio. That is the third figure here, not the first. Companies
          fall behind more often than households in every quarter the ECB publish, so the
          portfolio-wide number is pulled up by the half that is not about people. Which is why this
          page shows all three, each with its own link.</span
        >
      </p>
      <p class="cap">
        <span class="l-bg"
          >Числата са на тримесечие и излизат около пет месеца след тримесечието, което описват,
          затова са по-стари от всяка лихва на тази страница и носят своя период. Знаменателят е
          всички кредити и аванси към същите клиенти. Това не е съотношението, което БНБ публикуват
          в тримесечния си надзорен доклад: то е върху друг знаменател и двете не са едно и също
          число.</span
        >
        <span class="l-en"
          >These are quarterly and land about five months after the quarter they describe, so they
          are older than every rate on this page and carry their own period. The denominator is all
          loans and advances to the same borrowers. This is not the ratio BNB publish in their
          quarterly supervisory report: that one is built on a different denominator and the two are
          not the same number.</span
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
                <line
                  class="plot-year"
                  x1={(tick.at / 100) * CH_W}
                  y1="0"
                  x2={(tick.at / 100) * CH_W}
                  y2={CH_H}
                />
              {/each}
              <path class="plot-line second" d={path(arrears.series.corporations, axis)} />
              <path class="plot-line" d={path(arrears.series.households, axis)} />
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
  .credit {
    padding-bottom: 64px;
  }
  /* The same lockup `/how/` and `/market/` give their titles — three content
     pages that a reader arrives at from each other should not each announce
     themselves in a different voice. */
  h1 {
    font-family: var(--serif);
    font-size: clamp(1.5625rem, 4vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin: 28px 0 10px;
  }
  .lede {
    font-size: var(--fs-lead);
    color: var(--ink-2);
    max-width: 62ch;
    margin: 0 0 8px;
  }
  section {
    margin-top: 40px;
  }
  h2 {
    font-family: var(--serif);
    font-size: var(--fs-h3);
    line-height: 1.25;
    margin: 0 0 8px;
    color: var(--ink);
  }
  p {
    max-width: 66ch;
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
    gap: 10px;
    margin: 0 0 14px;
  }
  .stat {
    flex: 1 1 200px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .stat.wide {
    flex-basis: 100%;
  }
  .stat strong {
    font-size: var(--fs-h2, 1.375rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .stat .lbl {
    font-size: var(--fs-small);
    color: var(--ink-2);
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
    max-width: 66ch;
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
