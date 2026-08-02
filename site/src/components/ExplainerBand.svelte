<!--
  The explainer at the foot of the page: what an index is, where the numbers
  come from, what happens to what the visitor typed, and — in the closed block
  at the end — every formula the calculator uses, published once.

  It is almost entirely prose. The props are the figures the formulas
  quote back, so the algebra shown matches the numbers above it.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, t } from "$lib/content.js";
  import { SUPPORT_COPY } from "$lib/support.js";
  import { integer, periodLong } from "$lib/format.js";

  const {
    /** "y1" for the rolling 12 months, or a year — the formula names it. */
    anchor = "y1",
    /** Deposit share, quoted inside the annuity formula. */
    downPayPct = 0,
    /** Which index the savings figure was eroded by; the prose branches on it. */
    cashEroded = { basis: "all_items" },
    /** The month the strip's all-items headline describes, as "YYYY-MM". */
    headlineMonth = "",
    /** The month the per-group figures describe. Equal to the above, except
     *  during Eurostat's flash — see COPY.explainSplitMonth. */
    basketMonth = "",
  } = $props();

  const fmt0 = (x) => integer(x, $lang);
  // Both months, or neither: with one payload missing there is nothing to
  // compare, and the reassuring sentence is the safer of the two to fall back
  // on — it claims nothing about a month the page cannot name.
  const monthsSplit = $derived(
    Boolean(headlineMonth) && Boolean(basketMonth) && headlineMonth !== basketMonth
  );
</script>

<section class="explain-band">
  <div class="wrap">
    <details class="how explain">
      <summary>
        <span>
          <span class="l-bg">{COPY.explainK.bg}</span>
          <span class="l-en">{COPY.explainK.en}</span>
        </span>
        <span class="plus mono">+</span>
      </summary>

      <p class="ex-lead">
        <span class="l-bg">{COPY.explainLead.bg}</span>
        <span class="l-en">{COPY.explainLead.en}</span>
      </p>

      <div class="ex-body">
        <h4>
          <span class="l-bg">Какво е Евростат?</span><span class="l-en">What is Eurostat?</span>
        </h4>
        <p>
          <span class="l-bg"
            >Евростат е официалната статистическа служба на Европейския съюз. Цените в България -
            хляб, ток, наеми, гориво, лекарства - ги събира всеки месец НСИ, българската статистика,
            и ги изпраща на Евростат, който ги сглобява по единните европейски правила и публикува
            резултата безплатно за всички. Това приложение не измисля цени: то копира официалните
            числа на Евростат и ти ги показва. Затова до всяко число има връзка (иконата ↗) към
            точната таблица на Евростат - за да провериш сам.</span
          >
          <span class="l-en"
            >Eurostat is the official statistics office of the European Union. The prices in
            Bulgaria - bread, electricity, rent, fuel, medicine - are collected every month by NSI,
            the Bulgarian statistics office, and sent to Eurostat, which assembles them under one
            common European method and publishes the result free for everyone. This app invents no
            prices: it copies Eurostat's official numbers and shows them to you. That's why every
            figure carries a link (the ↗ icon) to the exact Eurostat table - so you can check it
            yourself.</span
          >
        </p>

        <h4>
          <span class="l-bg">Какво взимаме от него?</span><span class="l-en"
            >What do we take from it?</span
          >
        </h4>
        <p>
          <span class="l-bg"
            >Три неща: <b>(1)</b> готовия процент инфлация („транспортът е с 11% по-скъп отпреди
            година"); <b>(2)</b> ценовия индекс - число, което показва докъде са стигнали цените на
            всяка група; и <b>(3)</b> теглата на кошницата - каква част от парите на средния човек отива
            за всяка група (храна ≈ 22%, транспорт ≈ 14%).</span
          >
          <span class="l-en"
            >Three things: <b>(1)</b> the ready-made inflation percentage ("transport is 11% more
            expensive than a year ago"); <b>(2)</b> the price index - a number showing how far each
            group's prices have got; and <b>(3)</b> the basket weights - how much of the average person's
            money goes to each group (food ≈ 22%, transport ≈ 14%).</span
          >
        </p>

        <!-- Two rules for this section, both learned the hard way. No metaphor
             that then has arithmetic done inside it ("today's sticker ÷ the
             sticker from the year you pick") — that asks the reader to hold a
             made-up object and a division at once. And one idea per sentence,
             with the numbers said in words before any ÷ appears.

             The figures here must stay recognisable against the published
             payload: a reader who follows the ↗ link lands on the same index
             this paragraph is teaching them to read. -->
        <h4>
          <span class="l-bg">Какво е „индекс"?</span><span class="l-en">What is an "index"?</span>
        </h4>
        <p>
          <span class="l-bg"
            >Индексът е число, което следи цените на една група. Само по себе си то не значи нищо -
            значение има отношението между две негови стойности. Ако индексът на храната в края на
            2020 г. е <b>115</b>, а днес е <b>185</b>, храната е с <b>60% по-скъпа</b> (185 ÷ 115 = 1,6).
            Ако днес беше 150, поскъпването щеше да е 30%. Приложението прави точно това сравнение за
            периода, който си избрал: днешното число срещу числото за твоята година. Откъде тръгва всеки
            индекс няма значение - при делението изходната точка се съкращава, затова оставяме числата
            такива, каквито ги публикува Евростат, и връзката ↗ до реда връща същите цифри.</span
          >
          <span class="l-en"
            >An index is a number that tracks one group's prices. On its own it means nothing - what
            means something is the ratio between two of its readings. If food's index at the end of
            2020 was <b>115</b> and today it is <b>185</b>, food is <b>60% more expensive</b> (185 ÷ 115
            = 1.6). Had today's been 150, the rise would be 30%. The app makes exactly that comparison
            for the period you pick: today's number against the number for your year. Where each index
            starts does not matter - the starting point cancels in the division, so we leave the numbers
            exactly as Eurostat publishes them and the ↗ link on the row returns the same digits.</span
          >
        </p>

        <h4>
          <span class="l-bg">Защо да вярваш на числата?</span><span class="l-en"
            >Why can you trust the numbers?</span
          >
        </h4>
        <p>
          <span class="l-bg"
            >Официалният процент го взимаме <b>дословно</b> от Евростат - не го пресмятаме сами, за
            да не се разминава с публикуваното. Частите се събират: сборът на групите по твоите
            тегла дава общата инфлация. И винаги показваме <b>датата</b> на данните - ако остареят, ще
            видиш кога са обновени за последно, а не „днешни" числа, които всъщност са стари.</span
          >
          <span class="l-en"
            >We take the official percentage <b>verbatim</b> from Eurostat - we don't recompute it
            ourselves, so it never drifts from what's published. The parts add up: the groups,
            weighted by your basket, sum to overall inflation. And we always show the <b>date</b> of the
            data - if it ages, you see when it last refreshed, not "today's" numbers that are secretly
            old.</span
          >
        </p>

        <h4>
          <span class="l-bg">Защо твоето число се различава от „официалната инфлация"?</span><span
            class="l-en">Why does your number differ from the "official inflation"?</span
          >
        </h4>
        <p>
          <span class="l-bg"
            >Числото в лентата най-горе е официалната инфлация на Евростат за <b>цялата</b> кошница
            - всички българи, събрани заедно. Твоето число ползва <b>твоите</b> дялове по групи,
            затова се различава: ако харчиш повече за групи, които поскъпват по-бързо, твоята
            инфлация е по-висока - и обратно. {monthsSplit
              ? t(COPY.explainSplitMonth, "bg", {
                  headline: periodLong(headlineMonth, "bg"),
                  basket: periodLong(basketMonth, "bg"),
                })
              : COPY.explainSameMonth.bg}</span
          >
          <span class="l-en"
            >The number in the strip up top is Eurostat's official inflation for the <b>whole</b>
            basket - every Bulgarian pooled together. Your number uses <b>your</b> group shares, so
            it differs: if you spend more on faster-rising groups, your inflation is higher - and
            vice-versa.
            {monthsSplit
              ? t(COPY.explainSplitMonth, "en", {
                  headline: periodLong(headlineMonth, "en"),
                  basket: periodLong(basketMonth, "en"),
                })
              : COPY.explainSameMonth.en}</span
          >
        </p>

        <!-- **No figure is quoted as a literal here.** The two rates this
             section is about are live, the next refresh can move either, and a
             hardcoded number in prose goes stale silently
             (docs/principles.md P3). It names the two places on the page
             instead — the reader reads the current values off the strip and
             the results card, which is where they already are. -->
        <h4>
          <span class="l-bg">Защо и двете официални числа не съвпадат точно?</span><span
            class="l-en">Why don't the two official numbers match exactly?</span
          >
        </h4>
        <p>
          <span class="l-bg"
            >Числото в лентата най-горе и „средностатистическата кошница" в сметката се разминават с
            една-две десети от процента. И двете са верни и двете идват от Евростат - просто са
            сглобени различно. „Средностатистическата кошница" е сборът на 13-те групи с официалните
            им тегла. Числото в лентата не е такъв сбор: <b>всеки януари Евростат сменя теглата</b>,
            защото хората харчат малко по-различно от миналата година, и свързва новата кошница със
            старата в края на декември. А последните 12 месеца минават <b>през</b> тази смяна - оттам
            идва разликата. Тя е от начина на смятане, не е грешка; затова показваме и двете числа, вместо
            да се правим, че са едно.</span
          >
          <span class="l-en"
            >The number in the strip up top and "the average basket" in the calculation sit a tenth
            or two of a percentage point apart. Both are correct and both come from Eurostat - they
            are simply assembled differently. "The average basket" is the sum of the 13 groups at
            their official weights. The strip's number is not such a sum: <b
              >every January Eurostat changes the weights</b
            >, because people spend a little differently than last year, and links the new basket to
            the old one at the end of December. The last 12 months run <b>through</b> that changeover
            - and that is where the gap comes from. It is the method, not a mistake; which is why we show
            both numbers rather than pretending they are one.</span
          >
        </p>

        <h4>
          <span class="l-bg">Защо по новините чуваш малко различно число?</span><span class="l-en"
            >Why does the news sometimes quote a slightly different number?</span
          >
        </h4>
        <p>
          <span class="l-bg"
            >Защото инфлацията в България се мери по два официални начина и те се разминават съвсем
            малко. Вярно показва <b>хармонизирания</b> индекс на Евростат (ХИПЦ) - мярката, еднаква
            за целия ЕС, по която България влезе в еврозоната. НСИ смята и <b>национален</b> индекс (ИПЦ):
            малко по-различна кошница и различно отчитане на жилищата. Затова двете числа могат да се
            разминат с една-две десети от процента. Никое от тях не е грешно - все едно мериш едно и също
            нещо с две линийки, чиито деления са мъничко различни. Ние показваме само едното (ХИПЦ), за
            да няма две числа, които спорят кое е вярното.</span
          >
          <span class="l-en"
            >Because inflation in Bulgaria is measured in two official ways, and they differ a
            little. Vyarno shows Eurostat's <b>harmonised</b> index (HICP) - the measure that is the
            same across the EU and the one Bulgaria adopted the euro under. NSI also computes a
            <b>national</b> index (CPI): a slightly different basket and a different treatment of housing.
            So the two can sit a tenth or two apart. Neither is wrong - it is like measuring the same
            thing with two rulers whose markings differ slightly. We show only one of them (HICP) so there
            aren't two numbers competing to be right.</span
          >
        </p>

        <h4>
          <span class="l-bg">Откъде знаем заплатите („къде си по заплата")?</span><span class="l-en"
            >How do we know the salaries ("where you stand")?</span
          >
        </h4>
        <p>
          <span class="l-bg"
            >Пак от официални данни, и пак две числа. Първото е <b>кой колко изкарва</b> - от
            изследване на <b>Евростат</b> за заплатите; то показва как са подредени хората: колко
            изкарват малко, колко средно, колко много. Второто е <b>средната заплата в София</b> от
            <b>НСИ</b>
            - най-новата. По нея преизчисляваме сумите в цялата подредба, за да отговарят на днешните
            заплати - изследването на Евростат е отпреди няколко години. После сравняваме
            <b>твоята чиста</b> заплата с получената картина. Затова числото показва приблизително къде
            си, а не точно - никой не е обиколил всички работещи в София този месец. До числото има връзки
            (↗) към Евростат и НСИ.</span
          >
          <span class="l-en"
            >Official data again, and again two numbers. The first is <b>who earns what</b> - from a
            <b>Eurostat</b>
            survey of pay; it shows how people line up: how many earn little, how many in the middle,
            how many a lot. The second is the latest <b>average wage in Sofia</b> from
            <b>NSI</b>. We use it to set the amounts across that line-up to today's pay, because the
            Eurostat survey is a few years old. Then we compare <b>your take-home</b> pay with the resulting
            picture. So the figure shows roughly where you stand, not exactly - nobody polled every worker
            in Sofia this month. Each figure links (↗) to Eurostat and NSI.</span
          >
        </p>

        <h4><span class="l-bg">А моите данни?</span><span class="l-en">And your data?</span></h4>
        <p>
          <span class="l-bg"
            >Заплатата и разходите ти <b>никога</b> не напускат устройството ти. Сметката се случва изцяло
            в браузъра ти - ние не виждаме и не съхраняваме нищо лично.</span
          >
          <span class="l-en"
            >Your salary and spending <b>never</b> leave your device. The whole calculation runs in your
            browser - we never see or store anything personal.</span
          >
        </p>

        <!-- The second of the two surfaces `support.js` rule 1 allows, and it
             sits here rather than anywhere nearer the figures because of what
             it is: an answer to a question, next to the other answer of that
             kind. «А моите данни?» above it is the same shape — a reader who
             has just been told what their groceries cost wants to know what it
             cost them to be told, and who benefited from the sentence.

             It states a fact and offers a link. It does not appeal, it names
             no sum, and nothing about it changes between a first visit and a
             hundredth. If this becomes a call to action, or acquires a second
             copy anywhere on the page, the rule it is permitted by has been
             broken by the code it permits. -->
        <h4>
          <span class="l-bg">{SUPPORT_COPY.explainK.bg}</span><span class="l-en"
            >{SUPPORT_COPY.explainK.en}</span
          >
        </h4>
        <p>
          <span class="l-bg"
            >{SUPPORT_COPY.explainBody.bg}
            <a class="support-more" href="/support/">{SUPPORT_COPY.moreK.bg} →</a></span
          >
          <span class="l-en"
            >{SUPPORT_COPY.explainBody.en}
            <a class="support-more" href="/support/">{SUPPORT_COPY.moreK.en} →</a></span
          >
        </p>

        <!-- THE METHOD, IN ONE PLACE. Every formula behind the four figures in
             the results card, at the very end of the page, closed. One block
             here rather than a toggle under each item in the results drawer:
             algebra inside the drawer sits between a reader and the
             explanation of their own number. Publishing it is the §9.2
             obligation; making the reader step over it is no part of that.
             Nothing may be deleted from this block — an unpublished formula is
             a figure nobody outside this repo can re-derive. -->
        <details class="fx">
          <summary class="disclose">
            <span class="dc-caret" aria-hidden="true">›</span>
            <span class="l-bg">{COPY.explainMath.bg}</span>
            <span class="l-en">{COPY.explainMath.en}</span>
          </summary>
          <span class="l-bg"
            ><b>Твоята инфлация.</b> <code>π = Σ (w<sub>i</sub> ÷ Σw) × r<sub>i</sub></code> - w<sub
              >i</sub
            >
            е твоят дял за група i (плъзгачите; делението на Σw ги свежда до 100%). r<sub>i</sub> е
            официалното поскъпване на групата -
            {#if anchor === "y1"}
              годишният темп (Eurostat, prc_hicp_minr, RCH_A).
            {:else}
              r<sub>i</sub> = I<sub>i</sub>(сега) ÷ I<sub>i</sub>({anchor}) − 1, където I<sub>i</sub
              > е ценовият индекс на групата така, както го публикува Евростат (prc_hicp_minr). Базата
              на индекса се съкращава при делението, затова не я пипаме.
            {/if}
            <br /><b>В джоба.</b> <code>реално = (1 + увеличение) ÷ (1 + π) − 1</code>
            <br /><b>Спестеното.</b> <code>стойност днес = сума ÷ (1 + поскъпване от 2020)</code>,
            където поскъпването е {#if cashEroded.basis === "all_items"}<code
                >I(сега) ÷ I(2020) − 1</code
              > по общия индекс на Евростат (prc_hicp_minr, TOTAL), както е публикуван{:else}сборът
              на 13-те групи с официалните им тегла{/if}
            <br /><b>Домът.</b> <code>цена = €/м² × квадратура</code> ·
            <code>години = цена ÷ (12 × заплата)</code>. Вноската е анюитет:
            <code>P = L × m ÷ (1 − (1 + m)<sup>−n</sup>)</code>, където L = {fmt0(
              100 - downPayPct
            )}% от цената ({fmt0(downPayPct)}% самоучастие), m = годишната лихва ÷ 12, n = срокът ×
            12.</span
          >
          <span class="l-en"
            ><b>Your inflation.</b> <code>π = Σ (w<sub>i</sub> ÷ Σw) × r<sub>i</sub></code> - w<sub
              >i</sub
            >
            is your share for group i (the sliders; dividing by Σw normalises them to 100%). r<sub
              >i</sub
            >
            is the group's official price rise for the chosen period: for "1 year" - the official annual
            rate (Eurostat, prc_hicp_minr, RCH_A); for "since year Y" -
            <code>r<sub>i</sub> = I<sub>i</sub>(now) ÷ I<sub>i</sub>(Y) − 1</code>, where I<sub
              >i</sub
            >
            is the group's price index exactly as Eurostat publishes it (prc_hicp_minr). The index base
            cancels in the division, so we leave it alone.
            <br /><b>In your pocket.</b> <code>real = (1 + raise) ÷ (1 + π) − 1</code>
            <br /><b>Your savings.</b>
            <code>value today = amount ÷ (1 + the rise since 2020)</code>, where the rise is {#if cashEroded.basis === "all_items"}<code
                >I(now) ÷ I(2020) − 1</code
              > on Eurostat's all-items index (prc_hicp_minr, TOTAL) as published{:else}the 13
              groups summed at their official weights{/if}
            <br /><b>A home.</b> <code>price = €/m² × size</code> ·
            <code>years = price ÷ (12 × pay)</code>. The payment is an annuity:
            <code>P = L × m ÷ (1 − (1 + m)<sup>−n</sup>)</code>, where L = {fmt0(100 - downPayPct)}%
            of the price ({fmt0(downPayPct)}% down), m = annual rate ÷ 12, n = term × 12.</span
          >
        </details>
      </div>
    </details>
  </div>
</section>

<style>
  /* "How does this work / what is Eurostat" explainer */
  .explain-band {
    border-top: 1px solid var(--line-2);
    background: var(--paper);
    padding: 22px 0 6px;
  }
  .explain-band .wrap {
    padding: 0 18px;
  }
  .how.explain {
    margin-top: 0;
  }
  .how.explain summary {
    font-size: var(--fs-body);
    color: var(--ink);
  }
  .ex-lead {
    margin: 0 14px 4px;
    padding-top: 4px;
    font-size: var(--fs-body);
    line-height: 1.6;
    color: var(--ink-2);
  }
  .ex-body {
    padding: 4px 14px 14px;
  }
  .ex-body h4 {
    margin: 16px 0 4px;
    font-size: var(--fs-meta);
    font-weight: 700;
    color: var(--ink);
  }
  .ex-body h4:first-child {
    margin-top: 6px;
  }
  .ex-body p {
    margin: 0;
    font-size: var(--fs-meta);
    line-height: 1.62;
    color: var(--ink-2);
  }
  /* An underline and the link colour, at the size of the prose it ends. No
     fill, no padding box, no arrow button — the same specification the
     footer's donate link keeps, for the same reason (support.js rule 1). */
  .support-more {
    color: var(--real-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--real-soft);
    white-space: nowrap;
  }
  .support-more:hover {
    border-bottom-color: var(--real);
  }
</style>
