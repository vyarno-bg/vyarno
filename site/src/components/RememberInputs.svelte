<!--
  The switch that decides whether this device keeps the reader's figures, and
  the control that wipes them.

  It sits under «числата ти остават при теб» rather than down among the fields,
  because it qualifies that sentence: the promise about the network is
  unchanged, and what changes is who else can pick up this laptop and read a
  salary. A reader deciding that has to be looking at both claims at once.

  Off is drawn as off — no pre-ticked box, no "recommended", nothing that
  reads as the site's preference (P7). The two controls are one unit for the
  same reason: a switch that stops writing while yesterday's figures stay on
  the disk is the state this pair exists to make unreachable, so the way out
  is beside the way in rather than inside a disclosure the reader has to think
  to open.

  `forgetInputs` is disabled with nothing stored, which is what says there is
  nothing to clear — the alternative is a button that answers a reader's
  «махни ги» with no visible difference.
-->
<script>
  import { rememberInputs, setRememberInputs, forgetInputs } from "$lib/stores.js";
  import { COPY } from "$lib/content.js";
</script>

<div class="remember">
  <div class="row">
    <label class="tog">
      <input
        type="checkbox"
        checked={$rememberInputs}
        onchange={(e) => setRememberInputs(e.currentTarget.checked)}
      />
      <span class="l-bg">{COPY.rememberToggle.bg}</span>
      <span class="l-en">{COPY.rememberToggle.en}</span>
    </label>
    <button type="button" class="forget" onclick={forgetInputs} disabled={!$rememberInputs}>
      <span class="l-bg">{COPY.rememberForget.bg}</span>
      <span class="l-en">{COPY.rememberForget.en}</span>
    </button>
  </div>
  <p class="hint">
    <span class="l-bg">{COPY.rememberHint.bg}</span>
    <span class="l-en">{COPY.rememberHint.en}</span>
  </p>
</div>

<style>
  .remember {
    margin: 0 0 18px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .tog {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--ink-2);
    cursor: pointer;
    user-select: none;
  }
  .tog input {
    accent-color: var(--real);
    width: 15px;
    height: 15px;
    margin: 0;
    cursor: pointer;
  }
  .forget {
    font-family: var(--mono);
    font-size: var(--fs-small);
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
    padding: 5px 9px;
    cursor: pointer;
  }
  .forget:hover:not(:disabled) {
    border-color: var(--muted);
  }
  .forget:disabled {
    color: var(--muted);
    cursor: default;
  }
  .hint {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    line-height: 1.5;
    color: var(--muted);
    max-width: 62ch;
    margin: 6px 0 0;
  }
</style>
