<script>
  /**
   * The payslip working: gross → insurable base → contributions → taxable →
   * tax → net, itemised.
   *
   * The one-line summary beside the salary field is the answer; this is the
   * working. A single gross figure is not checkable — a reader comparing it
   * against another calculator has no way to see WHICH step differs, and the
   * step that differs is nearly always the insurance ceiling. Closed by
   * default: the summary is enough for the reader who believes us, and the
   * table is one click for the reader who does not.
   */
  import { lang } from "../lib/stores.js";
  import { number } from "../lib/format.js";
  import { COPY, t } from "../lib/content.js";

  /** @type {{ payslip: any }} */
  const { payslip } = $props();

  const fmt = (x, d = 1) => number(x, d, $lang);

  // Fund label per contribution key, in the order mirror.js#BG_CONTRIB_LINES
  // enumerates them. A key with no label here would render a nameless row, so
  // the mapping is asserted complete in site/scripts/verify_wiring.mjs rather
  // than defaulted to the key — a row labelled "sicknessMaternity" is a bug
  // that ships silently.
  const PAYSLIP_LABEL = {
    pension: COPY.payslipPension,
    pension2: COPY.payslipPension2,
    sicknessMaternity: COPY.payslipSickness,
    unemployment: COPY.payslipUnemp,
    health: COPY.payslipHealth,
  };
</script>

<details class="payslip">
  <!-- The teaser is the total leaving the pay. It is the one figure the
       summary line above does NOT state (it names contributions and tax
       separately), so it earns its place rather than repeating the sentence
       next to it — and it gives the control a reason to be opened instead of
       only a description of what opening does. -->
  <summary class="disclose">
    <span class="dc-caret" aria-hidden="true">›</span>
    <span class="l-bg">{COPY.payslipOpen.bg}</span>
    <span class="l-en">{COPY.payslipOpen.en}</span>
    <span class="dc-teaser">−{fmt(payslip.totalDeductions, 2)} €</span>
  </summary>
  <table>
    <tbody>
      <tr class="pl-head">
        <th scope="row">
          <span class="l-bg">{COPY.payslipGross.bg}</span>
          <span class="l-en">{COPY.payslipGross.en}</span>
        </th>
        <td>{fmt(payslip.gross, 2)} €</td>
      </tr>
      <!-- The insurable income row exists for the capped case. Below the
           ceiling it equals the gross and says so; above it, it is the whole
           explanation of why the contributions stopped growing, and every
           calculator that gets net→gross wrong gets it wrong here. -->
      <tr>
        <th scope="row">
          <span class="l-bg">{COPY.payslipBase.bg}</span>
          <span class="l-en">{COPY.payslipBase.en}</span>
          {#if payslip.insuranceCapped}
            <span class="pl-note">
              <span class="l-bg"
                >{t(COPY.payslipCap, "bg", { cap: fmt(payslip.maxInsurable, 2) })}</span
              >
              <span class="l-en"
                >{t(COPY.payslipCap, "en", { cap: fmt(payslip.maxInsurable, 2) })}</span
              >
            </span>
          {/if}
        </th>
        <td>{fmt(payslip.insurableBase, 2)} €</td>
      </tr>
      <!-- Driven by mirror.js#BG_CONTRIB_LINES, not by a list written here, so
           a fund the pipeline publishes cannot be deducted from the pay
           without appearing in the column that explains the deduction. -->
      {#each payslip.lines as line (line.key)}
        <tr class="pl-item">
          <th scope="row">
            <span class="l-bg">{PAYSLIP_LABEL[line.key].bg}</span>
            <span class="l-en">{PAYSLIP_LABEL[line.key].en}</span>
            <span class="pl-note">{fmt(line.ratePct, 2)}%</span>
          </th>
          <td>−{fmt(line.amount, 2)} €</td>
        </tr>
      {/each}
      <tr class="pl-sum">
        <th scope="row">
          <span class="l-bg">{COPY.payslipInsurance.bg}</span>
          <span class="l-en">{COPY.payslipInsurance.en}</span>
        </th>
        <td>−{fmt(payslip.insurance, 2)} €</td>
      </tr>
      <tr>
        <th scope="row">
          <span class="l-bg">{COPY.payslipTaxable.bg}</span>
          <span class="l-en">{COPY.payslipTaxable.en}</span>
        </th>
        <td>{fmt(payslip.taxable, 2)} €</td>
      </tr>
      <tr class="pl-item">
        <th scope="row">
          <span class="l-bg">{COPY.payslipTax.bg}</span>
          <span class="l-en">{COPY.payslipTax.en}</span>
          <span class="pl-note">{fmt(payslip.incomeTaxRatePct, 0)}%</span>
        </th>
        <td>−{fmt(payslip.tax, 2)} €</td>
      </tr>
      <tr class="pl-sum">
        <th scope="row">
          <span class="l-bg">{COPY.payslipDeduct.bg}</span>
          <span class="l-en">{COPY.payslipDeduct.en}</span>
        </th>
        <td>−{fmt(payslip.totalDeductions, 2)} €</td>
      </tr>
      <tr class="pl-head">
        <th scope="row">
          <span class="l-bg">{COPY.payslipNet.bg}</span>
          <span class="l-en">{COPY.payslipNet.en}</span>
        </th>
        <td>{fmt(payslip.net, 2)} €</td>
      </tr>
    </tbody>
  </table>
  {#if payslip.effectiveYear}
    <p class="pl-src">
      <span class="l-bg">{t(COPY.payslipSource, "bg", { year: payslip.effectiveYear })}</span>
      <span class="l-en">{t(COPY.payslipSource, "en", { year: payslip.effectiveYear })}</span>
    </p>
  {/if}
</details>

<style>
  .payslip {
    margin-top: 6px;
  }
  .payslip table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 7px;
    font-size: var(--fs-small);
    line-height: 1.45;
  }
  .payslip th,
  .payslip td {
    text-align: left;
    padding: 3px 0;
    font-weight: 400;
    color: var(--ink-2);
    vertical-align: baseline;
  }
  .payslip td {
    text-align: right;
    white-space: nowrap;
    padding-left: 10px;
    font-variant-numeric: tabular-nums;
  }
  /* The per-fund and tax rows are what the totals are made of, so they are
     indented under them rather than styled as peers. */
  .payslip .pl-item th {
    padding-left: 10px;
    color: var(--muted);
  }
  .payslip .pl-item td {
    color: var(--muted);
  }
  .payslip .pl-note {
    color: var(--muted);
    font-size: var(--fs-fine);
    white-space: nowrap;
  }
  .payslip .pl-item .pl-note::before {
    content: "· ";
  }
  .payslip .pl-sum th,
  .payslip .pl-sum td {
    border-top: 1px solid var(--line);
  }
  /* Gross in and net out — the two numbers the reader came for. */
  .payslip .pl-head th,
  .payslip .pl-head td {
    color: var(--ink);
    font-weight: 600;
  }
  .payslip .pl-head:last-child th,
  .payslip .pl-head:last-child td {
    border-top: 1px solid var(--line-2);
  }
  .payslip .pl-src {
    margin: 8px 0 0;
    font-size: var(--fs-fine);
    color: var(--muted);
    line-height: 1.5;
  }
</style>
