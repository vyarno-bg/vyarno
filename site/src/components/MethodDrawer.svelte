<!--
  The method drawer under the results: what each figure on the card was worked
  out from, in the reader's own numbers, plus the source links for every
  upstream the page uses.

  It is prose and worked examples, deliberately: the algebra is published once,
  at the end of the explainer band, and repeating it here put a maths prompt
  between the reader and their own explanation.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY } from "$lib/content.js";
  import { number, integer } from "$lib/format.js";
  import { rateFor } from "$lib/mirror.js";

  let {
    /** Bound: the drawer's own open state, which App persists. */
    open = $bindable(false),
    /** Anchor year for every rate quoted below ("y1" or a calendar year). */
    anchor = "y1",
    /** Published divisions and the reader's shares of them. */
    categories = [],
    /** Whether the basket is showing groups as well as divisions. */
    detailMode = false,
    openDivisions = new Set(),
    /** Deposit share (%), quoted in the mortgage worked example. */
    downPayPct = 0,
    /**
     * How many Sofia districts имот.bg published a price for.
     *
     * A prop rather than the literal that was here: имот.bg adds and merges
     * districts, `sofia_price.json` carries the count, and `/how/` already reads
     * it from there. A number typed into this paragraph says 143 for as long as
     * nobody re-reads the sentence, on the one page whose claim is that every
     * figure comes from the data.
     */
    nDistricts = 0,
    /** The reader's within-division split, and helpers over it. */
    splitFor,
    divisionSharePct,
    rateForDivision,
    /** Which index eroded the savings figure; the prose branches on it. */
    cashEroded = { basis: "all_items" },
    /** Builds a category's Eurostat verify link. */
    estatCatUrl,
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);
</script>

<!-- DRAWER -->
<details class="how" bind:open>
  <summary>
    <span>
      <span class="l-bg">{COPY.drawer.bg}</span>
      <span class="l-en">{COPY.drawer.en}</span>
    </span>
    <span class="plus mono">+</span>
  </summary>
  <!-- Each item is a plain sentence and a worked example in round
       numbers. NO ALGEBRA: this is the reader's first explanation of
       their own number, and four «виж формулата» toggles standing
       between them and it bought nothing — the people this page is
       written for do not check our maths, and being right is our job
       rather than theirs. The formulas are not gone — docs/principles.md
       §"Publish the method" keeps the method published: all four moved
       into one closed
       block at the end of the explainer band, `COPY.explainMath`. -->
  <ol>
    <li>
      <!-- «2 пункта» / "2 points" is the statistician's unit for exactly this
           quantity and it is the wrong word here. A percentage point is a
           difference between two percentages, which is a second idea a reader
           has to hold on the first line of the first explanation they open —
           and the sentence needs none of it: the contribution is said, and the
           arithmetic that produced it is said beside it, so «една четвърт от
           8» carries what the unit was there to disambiguate. -->
      <span class="l-bg"
        ><b>Твоята инфлация.</b> Всяка от 13-те групи си има поскъпване и то идва наготово от
        Евростат. Ние само го претегляме според това колко от парите си даваш за групата.
        <i>Пример:</i>
        храната е поскъпнала с 8% и ти яде една четвърт от парите — значи в твоето число храната слага
        <b>2%</b> (една четвърт от 8). Същото за другите 12 групи; сборът е твоята инфлация. Плъзгачите
        променят само дяловете — поскъпванията са на Евростат и не ги пипаме.</span
      >
      <span class="l-en"
        ><b>Your inflation.</b> Each of the 13 groups has its own price rise, taken as published
        from Eurostat. All we do is weigh it by how much of your money goes to that group.
        <i>Example:</i>
        food is up 8% and takes a quarter of your money - so food puts <b>2%</b> into your number (a quarter
        of 8). Same for the other 12 groups; the total is your inflation. The sliders change only the
        shares - the price rises are Eurostat's and we never touch them.</span
      >
    </li>
    <li>
      <!-- WHY IT IS NOT A SUBTRACTION, told as money rather than as
           a rule. The old sentence stated the rule («не се вадят
           едно от друго») and left the reader to work out where the
           missing 0,4 пункта went — so the honest reaction to it was
           "then why is it 7,1 and not 7,5?". The trolley does the
           explaining now: the raise itself is also spent at the new
           prices, so it shrinks with everything else. The arithmetic
           is `pocketReal` (mirror.js) — division, never subtraction —
           and the numbers below are that function's own example. -->
      <span class="l-bg"
        ><b>В джоба.</b> Заплатата ти расте, но цените растат заедно с нея — а новите пари ги харчиш
        по новите цени. <i>Пример:</i> вместо 1000 € получаваш 1127 €. Само че същата количка с
        покупки, която е струвала 1000 €, вече струва 1052 €. Отгоре ти остават 75 € — но и те
        отиват по новите, скъпи цени, така че вършат работа колкото 71 € преди. Затова реално си
        напред със <b>7,1%</b>, а не със 7,5%: увеличението също поскъпва.</span
      >
      <span class="l-en"
        ><b>In your pocket.</b> Your pay grows, but prices grow right along with it - and the new
        money is spent at the new prices. <i>Example:</i> instead of €1,000 you take home €1,127.
        But the same trolley of shopping that used to cost €1,000 now costs €1,052. That leaves €75
        over - and it too is spent at the new, higher prices, so it does the work €71 used to do.
        Which is why you are really
        <b>7.1%</b> ahead, not 7.5%: the raise gets more expensive too.</span
      >
    </li>
    <li>
      <!-- WHAT THIS NUMBER IS, exactly, and it is not "the country's
           overall official price rise" / «общото официално поскъпване
           за страната». It is the same «средностатистическа кошница»
           the results card already names: Σ w·(Iᵢ(now)/Iᵢ(2020) − 1)
           at Eurostat's current weights, which on today's data is
           ~41.8% where Eurostat's own chain-linked all-items index
           over the same span is ~39.9%. Both are built from
           Eurostat's published figures; only one of them IS
           Eurostat's published figure, and the copy has to say which.
           docs/site.md §"A correct formula fed the wrong number"
           rule 4 — a sentence can be false while the arithmetic
           behind it is right, and this is the sentence. -->
      <span class="l-bg"
        ><b>Спестеното.</b> Парите, които си държал настрана от 2020 г., днес купуват по-малко
        стока. <i>Пример:</i> ако цените са се вдигнали общо с 30%, <b>1000 €</b>
        днес купуват толкова, колкото <b>769 €</b> тогава. {#if cashEroded.basis === "all_items"}Тук
          нарочно ползваме общия ценови индекс на Евростат за цялата страна, а не твоята кошница.{:else}Общият
          индекс на Евростат не се зареди, затова смятаме със средностатистическата кошница —
          всичките 13 групи с официалните тегла — а не с твоята.{/if}</span
      >
      <span class="l-en"
        ><b>Your savings.</b> Money you have kept aside since 2020 buys less today.
        <i>Example:</i>
        if prices are up 30% overall, <b>€1,000</b> today buys what <b>€769</b> bought back then. {#if cashEroded.basis === "all_items"}Here
          we deliberately use Eurostat's all-items price index for the whole country, not your
          basket.{:else}Eurostat's all-items index didn't load, so we use the average basket instead
          - all 13 groups at the official weights - rather than your own.{/if}</span
      >
    </li>
    <li>
      <!-- WHAT THE €/m² ACTUALLY IS. имот.bg publishes one AVERAGE
           asking price per Sofia district; we take the MEDIAN ACROSS
           THOSE DISTRICTS, and the count of them comes from the payload
           rather than from this sentence. "медианата от обявите" /
           "the median of the listings" was wrong twice: it is not a
           median over listings, and the underlying prices are what
           sellers ask, not what buyers paid. Say both — this is the
           first thing anyone who knows the market will check. -->
      <span class="l-bg"
        ><b>Домът.</b> Всеки от {fmt0(nDistricts)} софийски квартала си има средна <b>оферта</b> на
        квадратен метър (искана цена, не цена по сделка). Подреждаме ги от евтин към скъп и взимаме
        средния — това е медианата — по избраната квадратура, или по твоята цена, ако си въвел
        такава. „<b>Години</b>“ значи: толкова години цялата ти заплата, до последното евро, би
        отишла за жилището. Вноската е обичайната за банките равна месечна вноска по кредит за {fmt0(
          100 - downPayPct
        )}% от цената (останалите {fmt0(downPayPct)}% са самоучастие), с твоята лихва и твоя срок.</span
      >
      <span class="l-en"
        ><b>A home.</b> Each of Sofia's {fmt0(nDistricts)} districts has its own average
        <b>asking</b> price per square metre (what sellers ask, not what buyers paid). We line them
        up cheapest to dearest and take the middle one - that is the median - times the size you
        picked, or your own price if you entered one. "<b>Years</b>" means: that many years of your
        entire pay, down to the last euro, would go to the home. The payment is the ordinary equal
        monthly bank instalment on a loan of {fmt0(100 - downPayPct)}% of the price (the other {fmt0(
          downPayPct
        )}% being your own money), at your rate and your term.</span
      >
    </li>
  </ol>
  <div class="frm">
    <span class="l-bg">{COPY.drawerPrecision.bg}</span>
    <span class="l-en">{COPY.drawerPrecision.en}</span>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- The table's own scroll box, the pattern /how/ uses for the same five
       columns. `.how` scrolls too, and that is not enough on its own: with only
       the outer box scrolling, reaching the «провери» column drags the prose,
       the source line and the drawer's whole left edge out of the viewport, so
       the reader loses the sentences to see the number. Only the table is wider
       than a phone — the prose above it wraps — so only the table moves.

       `role` and the label are the keyboard half: a scroll container is
       operable with the arrow keys, which needs a tab stop, and a tab stop
       that announces nothing is worse than none. -->
  <div
    class="scroll"
    role="region"
    tabindex="0"
    aria-label={COPY.howTblBasket[$lang] ?? COPY.howTblBasket.en}
  >
    <table>
      <thead>
        <tr>
          <th><span class="l-bg">група</span><span class="l-en">group</span></th>
          <!-- «твое тегло» / «официално» named the columns after the
               statistical term and after nothing at all. They are two
               shares of the same thing — yours and the average
               Bulgarian's — and the headers now say so. -->
          <th><span class="l-bg">твоят дял</span><span class="l-en">your share</span></th>
          <th
            ><span class="l-bg">среден за страната</span><span class="l-en">national average</span
            ></th
          >
          <th
            >{$lang === "bg" ? "поскъпване" : "rise"} ({anchor === "y1"
              ? $lang === "bg"
                ? "за 1 г."
                : "over 1 yr"
              : $lang === "bg"
                ? `от ${anchor}`
                : `since ${anchor}`})</th
          >
          <th><span class="l-bg">провери</span><span class="l-en">verify</span></th>
        </tr>
      </thead>
      <tbody>
        {#each categories as c, i (c.cp_code)}
          <tr>
            <!-- The name and nothing under it. Eurostat's own wording for the
                 code travels on the verify link instead, which is where
                 `BasketEditor` already carries it and what docs/site.md
                 §"Every row stays verifiable" describes: our friendly name is a
                 translation for a reader, the official label is the claim about
                 what the bucket is, and the row that holds the claim is the one
                 that goes to Eurostat.

                 Rendering it under the name put «Housing, water, electricity,
                 gas and other fuels» under «Ток, вода, парно, наеми» for a
                 reader who asked for Bulgarian — four lines of a language they
                 did not choose, thirteen times over, in the column the phone
                 has least room for. -->
            <td>
              <span class="l-bg">{c.bg_name}</span><span class="l-en">{c.en_name}</span>
            </td>
            <td>{fmt0(divisionSharePct(i))}%</td>
            <td>{c.weight_pct.toFixed(3).replace(".", $lang === "bg" ? "," : ".")}%</td>
            <td>{rateForDivision(i) < 0 ? "−" : "+"}{fmt(Math.abs(rateForDivision(i)))}%</td>
            <td
              ><a
                href={estatCatUrl(c)}
                target="_blank"
                rel="noopener"
                title={$lang === "bg"
                  ? `${c.cp_code} · ${c.eurostat_label} — официалните данни на Евростат за точно това число`
                  : `${c.cp_code} · ${c.eurostat_label} - Eurostat's own data for exactly this figure`}
                >{c.cp_code} ↗</a
              ></td
            >
          </tr>
          {#if detailMode && openDivisions.has(i)}
            {#each c.groups ?? [] as g, gi (g.cp_code)}
              {@const sp = splitFor(i)}
              {@const spTotal = sp.reduce((s, x) => s + (x > 0 ? x : 0), 0)}
              <tr class="subrow">
                <td>
                  <span class="l-bg">↳ {g.bg_name}</span><span class="l-en">↳ {g.en_name}</span>
                </td>
                <td
                  >{fmt0(
                    spTotal > 0 ? (divisionSharePct(i) * Math.max(0, sp[gi])) / spTotal : 0
                  )}%</td
                >
                <td>{g.weight_pct.toFixed(3).replace(".", $lang === "bg" ? "," : ".")}%</td>
                <td>{rateFor(g, anchor) < 0 ? "−" : "+"}{fmt(Math.abs(rateFor(g, anchor)))}%</td>
                <td
                  ><a
                    href={estatCatUrl(g)}
                    target="_blank"
                    rel="noopener"
                    title={`${g.cp_code} · ${g.eurostat_label}`}>{g.cp_code} ↗</a
                  ></td
                >
              </tr>
            {/each}
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
  <!-- Exactly the upstreams that feed a number ON THIS PAGE, and
       nothing else. A dataset that sounds like it belongs — `ilc_di01`,
       `namq_10_lp_ulc`, `prc_hpi_q` — is not in a payload and puts no
       figure on the page, and naming one here is the same defect as
       omitting the three that carry the pay ladder, the Sofia wage
       and the €/m². Citing a source we do not use costs exactly what
       failing to cite one we do costs: the claim is that every number
       traces somewhere real, and it is checked one line at a time.
       `test_the_sources_line_names_only_upstreams_this_page_uses`
       holds it. -->
  <div class="srcline">
    <span class="l-bg">източници:</span>
    <span class="l-en">sources:</span>
    <a
      href="https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en"
      target="_blank"
      rel="noopener">prc_hicp_minr</a
    >
    ·
    <a
      href="https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_iw/default/table?lang=en"
      target="_blank"
      rel="noopener">prc_hicp_iw</a
    >
    ·
    <a
      href="https://ec.europa.eu/eurostat/databrowser/view/earn_ses_monthly/default/table?lang=en"
      target="_blank"
      rel="noopener">earn_ses_monthly</a
    >
    ·
    <a
      href="https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table?lang=en"
      target="_blank"
      rel="noopener">une_rt_m</a
    >
    ·
    <a href="https://www.nsi.bg/en/statistical-data/179/569" target="_blank" rel="noopener"
      >{COPY.srcNsiWages[$lang] ?? COPY.srcNsiWages.en}</a
    >
    ·
    <a href="https://www.imot.bg/sredni-ceni" target="_blank" rel="noopener">imot.bg</a> ·
    <a
      href="https://data-api.ecb.europa.eu/service/data/MIR/M.BG.B.A2C.A.R.A.2250.EUR.N?format=jsondata"
      target="_blank"
      rel="noopener">{COPY.srcEcbMir[$lang] ?? COPY.srcEcbMir.en}</a
    >
    ·
    <a
      href="https://bnb.bg/AboutUs/PressOffice/POPressReleases/POPRDate/PR_20240911_1_EN"
      target="_blank"
      rel="noopener">{COPY.srcBnb[$lang] ?? COPY.srcBnb.en}</a
    >
  </div>
</details>

<style>
  .how table tr.subrow td {
    color: var(--muted);
  }
  /* Five columns do not fit a 360px phone in either language, and what says so
     is the clipped column at the boundary plus the focus ring — the same
     affordance /how/ settled on for the same table, and the reasoning against
     an edge shadow is written out there. */
  .scroll {
    overflow-x: auto;
  }
  .scroll:focus-visible {
    outline: 2px solid var(--real);
    outline-offset: 2px;
  }
</style>
