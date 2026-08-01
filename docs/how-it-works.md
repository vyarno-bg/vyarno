# How this works, explained plainly

The no-jargon companion to [`math.md`](./math.md). Readable by anyone; the
precise contract is in `math.md`.

The same explanation, shortened, is shown to visitors inside the app — the "How
does this work, and what is Eurostat?" panel above the footer. If the app's
promise changes, this page changes with it.

## 1. The one idea

**We invent no number.** Every figure on the screen is an official number
published by Eurostat, or for a few non-inflation extras by НСИ, БНБ or the ЕЦБ.
The app's whole job is to *copy* those numbers, *combine* them with what a
person tells us they spend, and *link back* to the exact source so anyone can
check. If a number cannot be traced to a public source, it does not belong in
the app.

## 2. What Eurostat is

Eurostat is the European Union's official statistics office. Every month it
measures real consumer prices across Bulgaria — food, electricity, rent, fuel,
medicine — and publishes the results free, public and machine-readable. It is
the same data that produces the inflation figure you hear in the news; we go to
the source instead of quoting a headline.

Bulgaria's price data at Eurostat is **HICP**, the Harmonised Index of Consumer
Prices. "Harmonised" means every EU country measures it the same way. Prices are
grouped into **13 categories** by a standard classification called **ECOICOP**
(`CP01`…`CP13`): CP01 food, CP04 utilities and rent, CP07 transport and fuel,
and so on. **The app's 13 sliders are exactly these 13 categories.** Each splits
again into sub-groups — transport is buying a car, running a car, tickets,
deliveries — and *"show more detail"* lets you set your own split. That matters:
someone who takes the bus daily and someone who fills a tank weekly face very
different transport inflation, even though the national average lumps them
together.

> **A note on the number 13.** Older Bulgarian inflation tables have 12
> categories, the last a catch-all called "Miscellaneous". Eurostat split it:
> CP12 is now insurance and financial services, and a new CP13 covers personal
> care, social protection and everything else. That is why the two do not line
> up.

## 3. The three things we take from Eurostat

| In plain words | Eurostat source | What it gives us |
|---|---|---|
| The **"how much more" %** | `prc_hicp_minr`, unit `RCH_A` | A ready-made annual rate per category: *"food is 2.3% more expensive than a year ago."* |
| The **price index** | `prc_hicp_minr`, unit `I15` | A number per category that climbs as prices rise — the raw material for "since any year" comparisons. |
| The **basket recipe (weights)** | `prc_hicp_iw` | How a typical person splits their money across the 13 categories: food ≈ 22%, transport ≈ 14%. |

The rate and the index live in the **same** Eurostat cube, just at different
"unit" settings, so they are always for the same month. The weights come from a
separate annual dataset.

## 4. What an index is

Instead of tracking prices in currency, Eurostat gives each category an
**index** — a plain number that starts somewhere and climbs as prices go up.
Where it starts does not matter, because only the ratio between two readings
does:

```
food index at the end of 2020 ≈ 115
food index today              ≈ 185
→ 185 ÷ 115 = 1.6 → food costs 60% more than in 2020
```

That single division — today's index ÷ the index in the year you pick — is how
the app produces every "your basket is up X% since [year]" number. Pick 2022 and
it divides by the 2022 index instead. No magic, just a ratio.

### Why the index numbers look odd

Eurostat starts its indices at 100 back in **2015**, so the levels do not read
the way you might expect: food's 2020 index is about 115, not 100, even though
the anchor selector starts at 2020. We leave them exactly as published rather
than rescaling them to a tidier scale, and nothing on screen suffers for it —
every figure the app shows is one index value divided by another, and a common
scale cancels in a division. What it buys is that the "check this number" link
next to a row returns the same digits the app used.

The trap is what happens if only *some* of the values get rescaled. Dividing a
2015-scale number by a 2020-scale one is like measuring your height in inches
at the top and centimetres at the bottom: a number comes out, and it is
nonsense.

**The rule: every index field stays on the base Eurostat published it on.** In
the data that means `index_by_year` and `latest_index` are never scaled, so
they cannot drift apart.

There is a corollary worth knowing. The "last 12 months" number divides this
month's index by the index twelve months ago. If both are wrong by the same
scale factor the error cancels and the number looks perfectly correct — **even
while the "since 2020" number is badly wrong.** So the 12-month view can never be
the only sanity check; always verify a since-a-year number against the raw
Eurostat series too.

## 5. Why your number can differ from "official inflation"

The strip at the top shows one number — Eurostat's official
inflation for the **average** basket, every Bulgarian pooled together. The
calculator shows *your* number, using *your* group shares. They differ for one
honest reason: **your basket is not the average basket.** Spend more than average
on things rising fast and your inflation is higher; spend more on flat or
falling things and it is lower.

Both numbers are for the **same latest month**, taken **verbatim** from
Eurostat. The only difference between them is the basket mix — not the time
window, and not any derivation on our side. You can click through to verify
either.

## 5b. Why НСИ sometimes reports a slightly different number

Bulgaria has **two** official inflation numbers. We show Eurostat's
**harmonised** index (HICP / ХИПЦ) — the EU-wide measure Bulgaria adopted the
euro under. НСИ, the national statistics office, also publishes its own
**national** index (CPI / ИПЦ), computed a slightly different way: a different
basket and a different treatment of housing. For the same month the two are
close but not identical — June 2026 was HICP **5.2%** against national CPI
**5.4%**.

Both are correct; they measure with a slightly different ruler. We deliberately
show **one** number for clarity rather than two that compete, but we say so out
loud in the app's "How does this work?" panel so nobody thinks one source is
wrong. We do not fetch or publish the national CPI.

## 6. Why you can trust the totals: the parts add up

Add up the 13 categories by their basket weights and you get **5.4%**, next to
Eurostat's official headline of **5.2%**. Those are not the same number, and the
honest explanation is worth a paragraph, because most tools quietly hide it.
Eurostat re-does the basket recipe every January and links the new year to the
old one at December, so a "last 12 months" figure spans two recipes while a
simple weighted average uses only this year's. The two land about 0.15 points
apart. Neither is wrong — they answer slightly different questions — so **the app
shows both and never presents one as the other.**

The exact version *does* hold, and it is what the pipeline checks before
publishing: within a single year, the official all-items index is exactly the
weighted average of the 13 categories, linked at the previous December. On
Bulgaria's real data that comes out right to within **0.01 percentage points**,
every month back to 2021 — the worst month is off by 0.009. If it ever fails,
the fix is to repair the connector, **never** to loosen the check until it
passes.

A second gate has nothing to do with arithmetic: before anything is published,
the pipeline checks that Eurostat's *weights* file and its *prices* file agree,
category by category, on what each code means — so a weight for one bucket can
never sit beside a price rise for another.

Two smaller rules keep this trustworthy:

- **The rate is copied verbatim, never recomputed.** Eurostat's published index
  is rounded to two decimals but its published rate comes from a more precise
  internal one. Deriving the rate ourselves would be off by 0.1–0.3 pp —
  invisible on a chart, but on a calculator the categories would not add up to
  the headline and people would notice.
- **Only finished years count.** A year's index enters the "since year" math
  only once December is published. The current half-finished year is dropped,
  otherwise "2026" would secretly mean "June 2026" and every comparison would
  quietly drift.

## 7. The other numbers

A few cards use non-Eurostat sources. Same rule — every number is sourced and
linked:

- **Sofia average wage** — НСИ's Sofia-city gross wage, converted to net for a
  fair net-vs-net comparison with the user's take-home pay.
- **Mortgage rate** — the ЕЦБ's sector average for home loans actually signed
  last month. The all-in cost including fees (the APRC/ГПР) is shown as a
  sub-caption, so the cheaper headline is never the only number on screen.
- **Sofia €/m² home prices** — per-district figures from имот.bg, because no
  official machine-readable €/m² *level* series exists for Bulgaria: Eurostat
  publishes a price *change* index, not an absolute price per square metre.
- **Salary ladder ("where you stand")** — two official numbers combined, because
  neither is enough alone. The **shape** of pay (who earns what) comes from
  Eurostat's Structure of Earnings Survey — the right unit, individual gross
  earnings, but published only every few years. The **level** is the latest
  Sofia average gross wage from НСИ, refreshed each quarter; we scale the shape
  so its average matches today's Sofia wage. Then each rung is converted to net
  and compared to the user's take-home pay.

Full provenance for each is in [`data-sources.md`](./data-sources.md).

## 8. How a number gets from Eurostat to the screen

The pipeline runs on demand, on a laptop: it copies the official data, runs the
gates, and writes eight small JSON files, each stamped with its date. Those files are committed to the repository and shipped
alongside the site.

**Your browser downloads those files and never calls Eurostat.** Everything
personal — your salary, your basket, your rent, your savings — is computed in
your own tab and sent nowhere. That is why the page is fast, why the numbers are
the same for everyone on the same day, and why there is nothing for us to hold
about you. [The privacy notice](https://vyarno.bg/legal/#privacy) says so, and
the Content-Security-Policy the site is served with enforces it.

The full system map is in [`architecture.md`](./architecture.md).

## 9. If you are about to change the math

Read [`math.md`](./math.md) §"Invariants that must never break" first. The short
version:

1. Keep every index field on the base Eurostat published it on — the same one, unscaled (§4).
2. The 12-month view hides base bugs — **also check a since-year number** (§4).
3. Take the official rate **verbatim**; do not recompute it (§6).
4. Never widen a reconciliation tolerance to make a red gate go green (§6).
5. Only completed (December-published) years enter the "since year" math (§6).
6. Real and cumulative change is always a **ratio**, never a subtraction.

## Cross-references

- [`math.md`](./math.md) — the exact formulas and the invariant contract
- [`data-sources.md`](./data-sources.md) — every source, with provenance tags
- [`architecture.md`](./architecture.md) — the system map
