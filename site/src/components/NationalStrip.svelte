<!--
  The national strip: five or six stat cards under the calculator, describing
  the country rather than the visitor.

  Everything here is read-only — published figures and the links that prove
  them. The one piece of state it owns is the measured width of the Sofia
  housing card, which the sparkline is drawn against.
-->
<script>
  import { lang } from "$lib/stores.js";
  import { COPY, HOME, t } from "$lib/content.js";
  import { number, integer, percentSigned, period, safeText, yearText } from "$lib/format.js";
  import { fastestRisingDivision } from "$lib/view.js";

  const {
    /** Published HICP divisions, for the fastest-rising card. */
    categories = [],
    /** The loaded payloads, for the two cards that read them directly. */
    data = {},
    /** Official annual HICP rate; the strip's first card. */
    headline = 0,
    /** True when that rate is Eurostat's flash estimate for the month — their
        early all-items reading, ahead of the index and the divisions. The
        card's source line carries the marker, beside the month it qualifies. */
    headlineIsFlash = false,
    /** 11-point gross earnings ladder; index 5 is the median. */
    ladder = [],
    /** The chosen област's average NET wage, for the comparator card. */
    regionNet = 0,
    /** The COUNTRY's average NET wage. The median card's foot line sets the
        modelled median beside a mean, and both have to describe the same
        people: a national median against an област's mean says «средната е
        по-висока» where НСИ publish a lower one, and in Видин it is. */
    nationalNet = 0,
    /** НСИ's own name for that област, in each language, or "" before a reader
        has picked one. Both languages arrive because the strip renders both
        and lets CSS pick — a single string would put a Bulgarian name in the
        English column. */
    regionNameBg = "",
    regionNameEn = "",
    /** НСИ's own published gross for the same quarter, which `regionNet` is our
        conversion of. Both go on the card: the credit beside them is theirs. */
    regionMeanGross = 0,
    salaryShapeUrl = "",
    salaryShapeYear = "",
    salaryAnchorPeriod = "",
    /** The chosen city's €/m² median and its provenance. */
    cityEurPerM2 = 0,
    /** имот.bg's own name for that град, in each language. Distinct from the
        област's on purpose: they are the same word for 26 of the 28 and NOT
        for София, and the two cards are about different areas. */
    cityNameBg = "",
    cityNameEn = "",
    /** True once the reader has picked an област. The two city-scoped cards
        gate on this rather than on a zero figure, because "nobody has chosen"
        and "the payload did not load" are different claims and the copy says
        different things about them. */
    regionChosen = false,
    /** True when НСИ publish a wage for the chosen област and имот.bg publish
        no price for its towns. Софийска област is the only one. */
    regionHasNoCity = false,
    regionMeanGrossUrl = "",
    regionWagePeriod = "",
    /** НСИ star the year until they finalise it; the card has to say so. */
    regionWageIsPreliminary = false,
    cityNDistricts = 0,
    /** True when the €/m² came from city_price.json, not the offline constant. */
    cityPriceIsLive = false,
    cityPriceDated = "",
    /** Per-year €/m² medians back to 2015, for the sparkline. */
    cityHistorical = [],
    citySinceBaselinePct = 0,
    cityBaselineYear = 0,
    cityBaselineMedian = 0,
    /** Builds a category's Eurostat verify link; anchor-dependent, so it is
        passed in rather than rebuilt here. */
    estatCatUrl,
  } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);
  const fmt0 = (x) => integer(x, $lang);
  /** НСИ's name for the chosen област, in one language. */
  const regionName = (l) => safeText(l === "bg" ? regionNameBg : regionNameEn);
  /** имот.bg's name for the chosen град, in one language. */
  const cityName = (l) => safeText(l === "bg" ? cityNameBg : cityNameEn);
  const signedPct = (x, d = 1) => percentSigned(x, d, $lang);

  // Everything on the Sofia card's source line, built in one place so the two
  // language spans cannot be handed different numbers. The gross is НСИ's own
  // published cell and the net is our conversion of it; the em dash is what a
  // missing payload renders as, because a caption reading «0 €» under their
  // name is a figure nobody published.
  //
  // It takes the language rather than reading `$lang`, because one of these is
  // a TRANSLATED string and the rest are digits. Both language spans are in the
  // DOM whatever the reader chose, so a shared `$lang` lookup files
  // «(предварителни данни)» inside the English sentence for every Bulgarian
  // reader — invisible to them, and to a suite reading only what is on screen.
  const regionSrcArgs = (lang) => ({
    region: regionName(lang),
    gross: regionMeanGross > 0 ? fmt0(regionMeanGross) : "—",
    net: regionNet > 0 ? fmt0(regionNet) : "—",
    period: period(regionWagePeriod),
    // Empty for a settled quarter, so the marker is absent rather than negated.
    prelim: regionWageIsPreliminary ? t(COPY.srcPrelim, lang) : "",
  });

  // The sparkline is drawn in user units scaled to the card's measured width,
  // so it has no intrinsic size to lay out against until the card exists.
  let histW = $state(300);

  // Both are singleton figures rather than one per category, so their verify
  // links are fixed extracts rather than anything derived. They point at the
  // exact dissemination query behind the number, not the Data Browser table:
  // that would land on the silently-defaulted CP01/Food view (the headline is
  // all-items, CP00 → TOTAL upstream) or on the dataset's default geo instead
  // of BG. The bare dataset links in the Sources footer stay as they are —
  // those cite whole datasets, not a single figure.
  const estatHeadlineUrl =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=BG&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=12";
  const estatUnempUrl =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=BG&s_adj=SA&sex=T&age=TOTAL&unit=PC_ACT&sinceTimePeriod=2020-01";
</script>

<section class="strip">
  <div class="shead">
    <h2>
      <span class="l-bg">{COPY.stripHead.bg}</span>
      <span class="l-en">{COPY.stripHead.en}</span>
    </h2>
    <span class="rule"></span>
    <!-- No "next data" line here: the page header already shows it, and
         the same string twice on first paint competes with the strip's
         actual job (five stat cards). -->
  </div>
  <!-- The strip is a flex row, not an auto-fit grid, and the order runs
       tiles-then-feature on purpose.

       The grid produced a 5-up row plus a lone sixth card sitting in an
       otherwise empty row — the count is 5 or 6 depending on whether a
       salary has been typed, and no fixed column count divides both. In
       a wrapping flex row every item grows, so a row is always full: the
       tail cards widen instead of leaving a hole, at every width and
       either count. The Sofia housing card carries a 12-year sparkline,
       so it takes a wider basis and a heavier grow — and it goes LAST,
       because the one card that may end up alone on a row is then the
       one that reads well at full width. -->
  <div class="stats">
    {#if headline > 0}
      <div class="stat">
        <div class="sv mono">
          <span>{fmt(headline)}%</span>
          <span class="sd up mono"
            >{COPY.yoyLabel[$lang] ?? COPY.yoyLabel.en} · {COPY.srcEurostat[$lang] ??
              COPY.srcEurostat.en}</span
          >
        </div>
        <div class="sl">
          <span class="l-bg">{COPY.statInfK.bg}</span><span class="l-en">{COPY.statInfK.en}</span>
        </div>
        <div class="ss">
          <a href={estatHeadlineUrl} target="_blank" rel="noopener"
            >{COPY.srcEurostat[$lang] ?? COPY.srcEurostat.en}</a
          >
          · {data.hicpHeadline?.ref_period ?? ""}{headlineIsFlash ? t(COPY.srcFlash, $lang) : ""}
        </div>
      </div>
    {/if}
    <!-- Median NET pay card — ALWAYS ON (no salary needed). The median
         is the honest "what people actually earn" figure: half of the
         country's earners take less, half take more. Unlike the average it isn't
         pulled up by a handful of very high salaries — the foot line
         spells out that gap. {ladder} is the net rung array from
         buildLadder: [5]=P50 (median), [2]=P20, [8]=P80. -->
    {#if ladder.length}
      <div class="stat">
        <div class="sv mono">
          <span>{fmt0(ladder[5])} €</span>
        </div>
        <div class="sl">
          <span class="l-bg">{COPY.statMedianK.bg}</span>
          <span class="l-en">{COPY.statMedianK.en}</span>
        </div>
        <!-- ONE footer block, three lines. These were three sibling
             `.ss` blocks, each with its own rule and 10px of padding —
             which made this card twice the height of its neighbours and
             read as a wall of grey. Every fact stays; only the borders
             between them go. The card was once the one figure on the
             page carrying no date and no caveat, so the modelled-spread
             line and the mean-vs-median line are load-bearing (P3). -->
        <div class="ss">
          <div>
            <!-- The band's own caveat, on the band. ladder[2] (P20) and
                 ladder[8] (P80) are interpolated between the SES survey's
                 P10/P50/P90 anchors — more modelled than the median beside
                 them, so they may not be spoken in the same voice as it. -->
            <span class="l-bg"
              >{COPY.statMedianSub.bg
                .replace("{lo}", fmt0(ladder[2]))
                .replace("{hi}", fmt0(ladder[8]))}
              {COPY.statMedianSubModelled.bg}</span
            >
            <span class="l-en"
              >{COPY.statMedianSub.en
                .replace("{lo}", fmt0(ladder[2]))
                .replace("{hi}", fmt0(ladder[8]))}
              {COPY.statMedianSubModelled.en}</span
            >
            {#if salaryShapeUrl}
              · <a href={salaryShapeUrl} target="_blank" rel="noopener"
                >{t(COPY.statMedianSrc, $lang, {
                  shapeYear: salaryShapeYear,
                  anchorPeriod: salaryAnchorPeriod,
                })}</a
              >
            {/if}
          </div>
          {#if salaryShapeYear}
            <div>
              <span class="l-bg"
                >{t(COPY.statMedianModelled, "bg", { shapeYear: salaryShapeYear })}</span
              >
              <span class="l-en"
                >{t(COPY.statMedianModelled, "en", { shapeYear: salaryShapeYear })}</span
              >
            </div>
          {/if}
          {#if nationalNet > 0}
            <div>
              <span class="l-bg"
                >{COPY.statMedianVsMean.bg.replace("{mean}", fmt0(nationalNet))}</span
              >
              <span class="l-en"
                >{COPY.statMedianVsMean.en.replace("{mean}", fmt0(nationalNet))}</span
              >
            </div>
          {/if}
        </div>
      </div>
    {/if}
    <!-- Sofia comparator card: net vs net. The same bgNetSalary
         formula is applied to both sides, so the comparison is
         apples-to-apples. No personal verdict here — this is a country
         reference card, and the verdict lives under the salary input,
         next to the number it compares against. -->
    <!-- Always on, like every other card here. Gating it on a typed
         salary makes "the country at a glance" change shape with what
         the reader entered, and leaves the strip with a card count no
         column layout divides. Nothing on this card is personal:
         `regionNet` comes from sofia_salary.json alone. The personal
         verdict against it lives under the salary input, where the
         number it compares to is. -->
    <!-- Three states, and they are three different claims. A wage, which is
         НСИ's for the област the reader picked; nobody has picked yet, which
         is a prompt and not a missing figure; and a chosen област whose wage
         did not load, which is the payload being absent and is what the
         `regionNet > 0` branch is gated on. Collapsing the first two would
         either show a number about somewhere the reader may not live or show
         nothing with no way to fix it. -->
    {#if !regionChosen}
      <div class="stat">
        <div class="sv mono"><span>—</span></div>
        <div class="sl">
          <span class="l-bg">{COPY.statRegionUnset.bg}</span>
          <span class="l-en">{COPY.statRegionUnset.en}</span>
        </div>
        <div class="ss">
          <span class="l-bg">{COPY.statRegionUnsetHint.bg}</span>
          <span class="l-en">{COPY.statRegionUnsetHint.en}</span>
        </div>
      </div>
    {:else if regionNet > 0}
      <div class="stat">
        <div class="sv mono">
          <span>{fmt0(regionNet)} €</span>
        </div>
        <div class="sl">
          <span class="l-bg">{t(COPY.statSofiaK, "bg", { region: regionName("bg") })}</span>
          <span class="l-en">{t(COPY.statSofiaK, "en", { region: regionName("en") })}</span>
        </div>
        <div class="ss">
          <a href={regionMeanGrossUrl} target="_blank" rel="noopener">
            <span class="l-bg">{t(COPY.statSofiaSrc, "bg", regionSrcArgs("bg"))}</span>
            <span class="l-en">{t(COPY.statSofiaSrc, "en", regionSrcArgs("en"))}</span>
          </a>
        </div>
      </div>
    {/if}
    {#if categories.length > 0}
      {@const fastest = fastestRisingDivision(categories)}
      <div class="stat">
        <div class="sv mono" style="color: var(--erode)">
          <!-- Signed: `fastestRisingDivision` returns the highest rate
               there is, which in a broad price fall is still a negative
               one. Nothing guarantees the maximum is above zero. -->
          <span>{signedPct(fastest.annual_rate_pct)}</span>
          <span class="sd down mono"
            >{COPY.yoyLabel[$lang] ?? COPY.yoyLabel.en} · {COPY.srcEurostat[$lang] ??
              COPY.srcEurostat.en}</span
          >
        </div>
        <div class="sl">
          <span class="l-bg">{fastest.bg_name}</span><span class="l-en">{fastest.en_name}</span>
          <span class="l-bg">{COPY.statFastK.bg}</span><span class="l-en">{COPY.statFastK.en}</span>
        </div>
        <div class="ss">
          <a href={estatCatUrl(fastest)} target="_blank" rel="noopener"
            >{COPY.srcEurostat[$lang] ?? COPY.srcEurostat.en}</a
          >
          · {fastest.ref_period}
        </div>
      </div>
    {/if}
    <!-- No `.sd` beside the value. The badge slot says what KIND of number the
         card carries — «за 1 г. · Евростат» on the two rates, nothing on the
         two pay levels, because a level is not a change over a period. An
         unemployment rate is a level too, and the string this card put there
         was its reference month, which the source line under it already
         states: one month, printed twice, 199px apart in the same card. The
         rule the strip keeps is that a card names each of its facts once and
         its period in the source line, where every other card's period is. -->
    {#if data.unemployment}
      <div class="stat">
        <div class="sv mono">
          <span>{fmt(data.unemployment.value)}%</span>
        </div>
        <div class="sl">
          <span class="l-bg">{COPY.statUnempK.bg}</span>
          <span class="l-en">{COPY.statUnempK.en}</span>
        </div>
        <div class="ss">
          <a href={estatUnempUrl} target="_blank" rel="noopener"
            >{COPY.srcEurostat[$lang] ?? COPY.srcEurostat.en}</a
          >
          · {data.unemployment.ref_period}
        </div>
      </div>
    {/if}
    <!-- The housing card is the only one carrying a chart, so it is the
         only one that is not a tile: it takes a wider basis, sits last,
         and follows the same value → label → chart → source anatomy as
         its neighbours instead of stuffing the sparkline into the source
         caption, which is what starved it of width. -->
    <!-- Gated on the payload being LIVE, not merely on the number being
         non-zero. The offline fallback is a round constant; this card
         captions it «медиана за София от обявите» and cites
         imot.bg/sredni-ceni under it, so rendering it from the sentinel
         attributed a figure имот.bg never published to имот.bg — with «0
         квартала» as the only tell. The strip's own rule is that every card
         is gated on its own payload; this restores it. -->
    <!-- The same three-state split as the wage card, plus a fourth that only
         this one has: an област имот.bg publishes no city for. Софийска област
         is the case, and it is P11 in one line — a figure nobody publishes is
         uncomputed rather than concealed, so the card names имот.bg and says
         they do not publish it, instead of going blank or borrowing София's. -->
    {#if categories.length > 0 && !regionChosen}
      <div class="stat">
        <div class="sv mono"><span>—</span></div>
        <div class="sl">
          <span class="l-bg">{COPY.statHomeUnset.bg}</span>
          <span class="l-en">{COPY.statHomeUnset.en}</span>
        </div>
      </div>
    {:else if categories.length > 0 && regionHasNoCity}
      <div class="stat">
        <div class="sv mono"><span>—</span></div>
        <div class="sl">
          <span class="l-bg">{t(COPY.statHomeNoCity, "bg", { region: regionName("bg") })}</span>
          <span class="l-en">{t(COPY.statHomeNoCity, "en", { region: regionName("en") })}</span>
        </div>
      </div>
    {:else if categories.length > 0 && cityPriceIsLive && cityEurPerM2 > 0}
      {@const hP = cityEurPerM2 * HOME.m2Default}
      <div class="stat wide">
        <div class="sv mono" style="color: var(--erode)">
          <span>€{fmt0(hP)}</span>
          <span class="sd down mono">{$lang === "bg" ? "70 м² по медиана" : "70 m² at median"}</span
          >
        </div>
        <div class="sl">
          <span class="l-bg">{t(COPY.statHomeK, "bg", { city: cityName("bg") })}</span>
          <span class="l-en">{t(COPY.statHomeK, "en", { city: cityName("en") })}</span>
        </div>
        {#if cityHistorical.length > 1}
          {@const _minH = Math.min(...cityHistorical.map((r) => r.eur_per_m2_median))}
          {@const _maxH = Math.max(...cityHistorical.map((r) => r.eur_per_m2_median))}
          {@const _rH = _maxH - _minH || 1}
          {@const _last = cityHistorical.length - 1}
          <!-- The plot grows with the card instead of staying a 22px
               ribbon: a 12-point series across 1000px at 22px tall is a
               flat line with no shape in it. Capped so it stays a
               sparkline and never becomes the card. -->
          {@const _h = Math.round(Math.min(96, Math.max(52, histW * 0.11)))}
          {@const _padX = 6}
          {@const _padT = 16}
          {@const _padB = 8}
          {@const _x = (i) => (_last === 0 ? histW / 2 : _padX + (i * (histW - 2 * _padX)) / _last)}
          {@const _y = (v) => _h - _padB - ((v - _minH) / _rH) * (_h - _padT - _padB)}
          <!-- The viewBox is the measured pixel width, so the plot draws
               1:1. A fixed-width box stretched to fit with
               preserveAspectRatio="none" scales x and y by different
               factors: the stroke thins out and every year marker
               renders as an ellipse. -->
          <div class="hist" bind:clientWidth={histW}>
            <svg
              viewBox="0 0 {histW} {_h}"
              width="100%"
              height={_h}
              role="img"
              aria-label={($lang === "bg"
                ? "Медианна цена на кв. м в София, "
                : "Sofia median €/m², ") +
                `${cityHistorical[0].year}–${cityHistorical[_last].year}`}
            >
              <polyline
                points={cityHistorical
                  .map((r, i) => `${_x(i).toFixed(1)},${_y(r.eur_per_m2_median).toFixed(1)}`)
                  .join(" ")}
                fill="none"
                stroke="var(--erode)"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              {#each cityHistorical as r, i (r.year)}
                <circle
                  cx={_x(i).toFixed(1)}
                  cy={_y(r.eur_per_m2_median).toFixed(1)}
                  r={i === _last ? 4 : 2}
                  fill="var(--erode)"
                  stroke="var(--surface)"
                  stroke-width={i === _last ? 2 : 0}
                />
              {/each}
              <!-- Direct end labels: the first and last observation carry
                   their own value, so the reader never has to match a
                   floating legend to a point. -->
              <text class="hist-lbl" x={_x(0)} y={_y(cityHistorical[0].eur_per_m2_median) - 9}
                >€{fmt0(cityBaselineMedian)}</text
              >
              <text
                class="hist-lbl"
                x={_x(_last)}
                y={_y(cityHistorical[_last].eur_per_m2_median) - 11}
                text-anchor="end">€{fmt0(cityEurPerM2)}</text
              >
            </svg>
            <div class="hist-axes mono">
              <span>{cityBaselineYear}</span>
              <span>{cityHistorical[_last].year}</span>
            </div>
            <div class="hist-delta mono">
              <span class="l-bg"
                >{@html t(COPY.statHomeDelta, "bg", {
                  pct: fmt(citySinceBaselinePct, 0),
                  y: yearText(cityBaselineYear),
                })}</span
              >
              <span class="l-en"
                >{@html t(COPY.statHomeDelta, "en", {
                  pct: fmt(citySinceBaselinePct, 0),
                  y: yearText(cityBaselineYear),
                })}</span
              >
            </div>
          </div>
        {/if}
        <div class="ss">
          <div title={HOME.eurPerM2_source}>
            <span class="l-bg">≈{fmt0(cityEurPerM2)}€/м² · медиана за София от обявите</span>
            <span class="l-en">≈€{fmt0(cityEurPerM2)}/m² · Sofia median from public listings</span>
          </div>
          <div>
            <a href="https://www.imot.bg/sredni-ceni" target="_blank" rel="noopener"
              >imot.bg/sredni-ceni</a
            >
            · {cityNDistricts}
            {$lang === "bg" ? "квартала" : "districts"} · {cityPriceDated || "—"}
          </div>
          <!-- Three of the figures on this card are OURS, and the credit line
               above names имот.bg. They publish one average per district and
               nothing for Sofia as a whole, so the median across the districts,
               the price of a 70 m² home built on it and the change since the
               baseline year are all our arithmetic over their cells. A
               publisher's name spanning our own working is the quiet way a card
               stops being checkable — a reader who opens the link has nothing to
               match the number against (P3).
               `/how/` has carried this disclosure beside the same three figures
               since they were added; the calculator was the surface that did
               not. Same key, so the two cannot drift into different admissions
               of the same thing. -->
          <div class="ours">
            <span class="l-bg"
              >{COPY.oursNote.bg}
              <a href="/legal/#sources">{COPY.oursMoreK.bg} →</a></span
            >
            <span class="l-en"
              >{COPY.oursNote.en}
              <a href="/legal/#sources">{COPY.oursMoreK.en} →</a></span
            >
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  /* National strip */
  .strip {
    margin-top: 40px;
    border-top: 1px solid var(--line);
    padding-top: 22px;
  }
  .strip .shead {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .strip .shead h2 {
    font-weight: 700;
    font-size: var(--fs-body);
    letter-spacing: 0.02em;
    margin: 0;
    text-transform: uppercase;
    color: var(--muted);
  }
  .strip .shead .rule {
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  /* A wrapping flex row, not a grid. `auto-fit` columns hold their width, so
     a card count that does not divide by the column count leaves a hole — five
     up and a lone sixth stranded on its own row. Here every card grows, so the
     tail of a row widens to fill it and there is never an empty cell, at any
     width and whether the strip carries five cards or six. */
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    /* Cards in the same row stay the same height, so the row reads as a row of
       tiles rather than a ragged edge. Their captions do NOT stretch to meet
       the bottom — see `.ss`. */
    align-items: stretch;
  }
  /* Every stat card has the same internal structure regardless of height:
     headline, label, source caption, each following the one above it. */
  .stat {
    flex: 1 1 180px;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 13px 15px;
    display: flex;
    flex-direction: column;
  }
  /* The one card with a chart in it takes a row of its own. Two reasons, and
     the second is the one that bites: the 12-year sparkline needs the width
     (at a tile's 180px it was a scribble), and a card twice its neighbours'
     height sharing their row would stretch each of them to match it, which is
     how you get a stat tile with 120px of nothing under its label. */
  .stat.wide {
    flex: 1 1 100%;
  }
  /* The caption follows its own card's label, and is NOT pushed to the foot of
     the tallest card in the row.

     `margin-top: auto` bought one thing — the captions' rules lining up across
     the row — and it charged for it in the only currency a tile has. The
     median-pay card carries three footer lines to its neighbours' one, which
     makes it 302px where they need around 130, and stretch hands every one of
     them the difference as a hole between the label and the caption: measured
     at 1280px, 175px in the inflation tile, 138px in the fastest-rising one,
     199px in unemployment. «Страната накратко» read as four mostly-empty
     boxes, and the caption each one ended with had visibly come loose from the
     figure it dates.

     The alignment is worth having where the cards are comparable and this row
     is the case where they are not. What replaces it is the ordinary rule for
     a caption: it sits under the thing it captions. The slack goes to the
     bottom of the short cards, where trailing space in a stretched tile reads
     as room rather than as something missing. */
  .stat .ss {
    padding-top: 10px;
    border-top: 1px solid var(--rule);
    font-size: var(--fs-micro);
    color: var(--muted);
  }
  /* Extra footer lines stack inside the ONE footer block. Three sibling `.ss`
     blocks meant three rules and three paddings, which is what made the
     median-pay card twice the height of its neighbours. */
  .stat .ss > div + div {
    margin-top: 5px;
  }
  .stat .sv {
    font-size: var(--fs-h2);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .stat .sd {
    font-size: var(--fs-fine);
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 2px;
  }
  .stat .sd.up {
    color: var(--real-ink);
    background: var(--real-soft);
  }
  /* `--erode-ink` on the band, mirroring `.up` above: the soft fill is
     translucent, so writing `--erode` on it renders at 3.90:1 in the dark
     theme even though `--erode` on the bare surface is 4.86:1. */
  .stat .sd.down {
    color: var(--erode-ink);
    background: var(--erode-soft);
  }
  .stat .sl {
    font-size: var(--fs-meta);
    color: var(--ink-2);
    margin-top: 6px;
    line-height: 1.35;
  }
  /* Sofia price history sparkline: a polyline of the median €/m² from 2015
     to the current year, one marker per year and a ringed marker on the
     latest. The axes show the year range and the baseline→current € pair;
     the since-2015 delta is rendered in the erode colour so it reads as a
     "this is what it costs you" figure rather than a feature. The SVG is
     drawn at the measured pixel width (`histW`), so nothing is stretched. */
  .hist {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--rule);
  }
  .hist svg {
    display: block;
    overflow: visible;
  }
  .hist-axes {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: var(--fs-micro);
    color: var(--muted);
    margin-top: 4px;
  }
  .hist-lbl {
    font-size: var(--fs-micro);
    fill: var(--ink-2);
    font-family: var(--mono);
  }
  .hist-delta {
    font-size: var(--fs-fine);
    color: var(--erode);
    margin-top: 4px;
    font-weight: 600;
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
</style>
