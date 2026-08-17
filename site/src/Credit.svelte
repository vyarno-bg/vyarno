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
    creditFixation,
    creditLimits,
    creditProducts,
    creditRates,
    creditRenegotiation,
  } from "./lib/view/credit.js";
  import { number, periodLong } from "./lib/format.js";

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
        </div>
      {/each}
    </div>
  </section>
</main>

<SiteFooter />

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
</style>
