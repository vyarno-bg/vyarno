# Dated legislative tables — `payroll.py`, `mortgage.py`, `sources/dv.py`

Payroll law and the БНБ borrower-based measures have no machine-readable feed,
so they are dated tables in the tree. Append a new entry; never mutate one.

[`data-sources.md`](../data-sources.md) is the index, the cross-cutting rules and
the checklist for adding a connector.

## BG payroll — `payroll.py#BG_PAYROLL_TABLE` → `payroll.json`

The percentile ladder, the област comparator and the salary verdict all convert
gross↔net using Bulgarian payroll rules, which are legislative constants with no
machine-readable feed. One dated table is the source of truth; the SPA reads it
via `mirror.js#payrollParams(data.payroll)` and threads the result through
`bgNetSalary` / `bgGrossFromNet` / `buildLadder`. The `mirror.js` `BG_2026_*`
constants are an **offline sentinel only**, parity-tested by `test_payroll.py`.

An entry carries the five contribution lines **on both sides** — pension,
pension2, sickness-maternity, unemployment, health, once for the осигурено лице
and once for the осигурител — the flat personal income tax and its absence of
an allowance, the maximum insurable income and the statutory minimum gross
wage. **The figures live in `BG_PAYROLL_TABLE` and nowhere else**, this
file included: `build_payroll_payload(as_of)` picks whichever entry was in force
on the publish date, so what shipped is read off `payroll.json`'s
`effective_from` and not off a list somebody has to remember to update.

**The draft of a budget act is the thing to be careful of**, because a draft
outranks the act itself in search for months after it is superseded: the last
ЗБДОО draft carried a higher insurance ceiling and a raised фонд "Пенсии" rate
for those born after 1959, and neither was enacted. Read the promulgated text.
One change that act does make sits outside this table on purpose: държавни
служители begin paying personal contributions at 80:20, a different insured
category from the III категория труд employee modelled here — and НОИ publish
its split beside this one, so пенсии 11,8/3,0 and ОЗМ 2,8/0,7 are another
category's figures rather than corrections to these.

**No employer rate here is a cell anybody publishes**, which is why
`EMPLOYER_RATE_DERIVATION` carries the working beside each one and
`test_payroll.py` sums it back. Three of the five funds are a single 60:40
split — КСО чл. 6, ал. 3, т. 7 for ОЗМ and „Безработица“, ЗЗО чл. 40, ал. 1,
т. 1 for health. The other two each carry their own ratio, and фонд „Пенсии“ is
the trap: чл. 6, ал. 3, т. 9 fixes it at 7,1/5,7 of the original 12,8 на сто,
and чл. 6, ал. 1, т. 4's two 1-point rises are each split 0,56/0,44 on their
own terms, giving **8,22% employer / 6,58% employee**. Applying 60:40 to the
fund's 14,8 gives 8,88 — a number that looks right, sits 0,66 points out, and
would be wrong in the same direction for every salary on the site. ДЗПО-УПФ is
the quieter one: чл. 157, ал. 3 sets it at **2,8/2,2** of five points, where
60:40 would read 3,0.

**The ДВ citation is a field, not a caption.** The envelope's `source_url` is
dv.parliament.bg's landing page, because that key stands over the WHOLE
parameter set and four instruments produced it: КСО чл. 6 and ЗБНЗОК 2026 чл. 2
for the ten contribution rates, ЗДДФЛ чл. 48, ал. 1 for the flat tax, ЗБДОО
2026 for the insurance ceiling, a ПМС for the minimum wage. A permalink there
would resolve and would answer for a tenth of what it appeared to, which is
worse than a link that reaches nothing. P9 therefore puts the instrument in the
caption instead of behind the link, and an entry that IS one act carries
`gazette_issue` + `gazette_date` — «бр. 68 от 28.07.2026», which is what ДВ's
own archive is searched by.

**A figure whose own act is known gets its own permalink.** The ceiling is the
first: `max_insurable_income_source` cites ДВ material 244982 at ЗБДОО 2026 чл.
9, т. 2, б. „в“ — «максимален месечен размер на осигурителния доход – 2 300
евро», read from that document 2026-08-23. The id is not derivable from the
issue number, so `payroll.py#_ceiling_citation` publishes it only for a
material THIS RUN fetched and whose own «брой: N, от дата D» header matched the
pair recorded beside it; a fetch that disagrees stops the run rather than
shipping a link nothing followed, and no fetch at all publishes no link. Today
the ceiling and the ТЗПБ table are one act, so that fetch is already happening.

The other three are the same work and are not done: each needs its issue found
in ДВ's archive, which is JSF postbacks behind a session ViewState rather than
addressable URLs, so it is a person's search and not a script's. `payroll.py#_gazette` **raises on half a
citation** (the archive is indexed by both, and a date alone names a day
several issues were promulgated on) and on a promulgation dated after the entry
comes into force. Both keys are published as `null` where the set comes from
several acts — the January entry's ceiling is ЗБДОО's, its flat rate ЗДДФЛ чл.
48 ал. 1's and its minimum wage a ПМС's, so no single issue is true of it and
the caption names the year instead. Five figures on `/how/` render off this
pair.

**Which currency is authoritative.** Pre-euro figures were legislated in BGN and
the EUR side is a conversion (1213 BGN → €620.20). From 2026-01-01 Bulgaria
legislates in euro, so the newer figures are **EUR-native** and the BGN side is
the conversion (€2300 → 4498.41 BGN, *not* the round 4500 the press quotes).
An entry therefore sets **exactly one** of `<field>_eur` / `<field>_bgn`;
`payroll.py#_pair` derives the other at the fixed 1.95583 rate and **raises if
both or neither is set**, so the two can never disagree in the output.

**To reflect a law change: add a new effective-dated entry — never mutate an old
one — and re-run `--source payroll`.** `build_payroll_payload(as_of)`
picks whichever entry was in force on the publish date, so an entry can be
landed before it takes effect. `scheduled_changes` documents
known-but-not-yet-effective changes so the SPA can surface them, and each one's
`effective_from` must be an **ISO date, never a condition** — "2026 (pending the
regular state budget)" was true until it wasn't, and nothing could tell.

## Държавен вестник — `sources/dv.py`

The one payroll figure that is fetched, and the line is whether it exists as a
published cell. КСО чл. 6, ал. 1, т. 7 sets only the span — «от 0,4 до 1,1 на
сто» — and delegates the per-activity rates to the year's ЗБДОО; чл. 6, ал. 6
puts the whole line on the осигурител. That is 87 rows in an appendix, reset
every year: a table, and 87 chances to mistype. The rate splits above are the
opposite — no cell anywhere holds 8,22 — so they stay transcribed and this is
read from the act.

## `showMaterialDV.jsp?idMat=…` — Приложение № 2 / № 2А към чл. 14

**The `idMat` cannot be derived and is recorded per entry.** ДВ build their
permalinks from an id the issue number does not yield, so «бр. 68 от
28.07.2026» reaches nothing on its own — the id is found once and stored on the
entry it belongs to. That is also what pins the fetch to ONE act rather than to
whatever a search currently returns, and `fetch_tzpb_appendix` refuses a
material whose own «брой: N, от дата D.M.YYYY» header disagrees with the
entry's citation.

**Name the appendix, never "the ТЗПБ table".** ЗБДОО 2026 legislates the whole
year and чл. 14 splits it: Приложение № 2 runs 1 January – 31 July, № 2А from
1 August. Seven activities move between them — food manufacturing 0,7→0,9%,
architectural and engineering 0,7→0,5%, sport 0,5→0,7%. A parser that took the
first table it found would be right for eighty sectors and wrong for seven,
which is the shape of wrong that never announces itself.

**Two classifications meet here, and the site has to say so.** ЗБДОО sets ТЗПБ
by **КИД-2025 division** (NACE Rev. 2.1); НСИ publish wages by **NACE Rev. 2
section** (`sector_salary.json`). `payroll.py#NSI_SECTION_DIVISIONS` is the
join, it is ours rather than anybody's published correspondence, and it carries
two consequences that may not be smoothed over:

- **Ten of the nineteen sections span several rates.** «Преработваща
  промишленост» runs 0,5% to 1,1%. A section therefore resolves to a RANGE and
  never to a representative rate — a modal division would give one confident
  figure that is wrong for most of the people reading it.
- **Rev. 2.1 moved work between divisions.** Division 45 (trade and repair of
  motor vehicles) has no КИД-2025 successor of its own; its repair half sits
  inside 95, which also serves section S. So 95 appears under two sections in
  the join, deliberately.

`build_work_accident_block` **raises** if a section names a division the
appendix does not carry, because dropping it silently narrows that section's
published range — more precise-looking, and wrong.

**What the payload carries.** `work_accident` publishes the act's own span,
the appendix name, its ДВ permalink and issue, and `by_nsi_section` with a
`{min, max}` per section — always both, even where they are equal, so no
template branches on which shape it got. The 87 division rows are **not**
published: nothing renders them, and a payload field nothing reads is a number
nobody checks.

## БНБ lending limits — `mortgage.py#BNB_LENDING_LIMITS`

Borrower-based measures adopted by the БНБ Governing Council 2024-09-11, in
force 2024-10-01 ([press release](https://bnb.bg/AboutUs/PressOffice/POPressReleases/POPRDate/PR_20240911_1_EN)),
quoted verbatim in the table:

| Limit | Value | Wording |
|---|---|---|
| LTV-O | **≤ 85%** | "the ratio between the loan amount and the value of the immovable property at origination (LTV-O) shall not exceed 85%" |
| DSTI-O | **≤ 50%** | "the ratio between the current debt service amount and the **monthly disposable income** of the debtor at origination (DSTI-O) shall not exceed 50%" |
| Maturity | **≤ 30 years** | "the maximum term of the loan agreement (maturity) shall not exceed 30 years" |
| Deviation allowance | **≤ 5%** | "banks could originate or renegotiate RRE loans with parameters that deviate from the introduced requirements with a total approved or renegotiated volume during the current quarter of up to 5% of the total gross amount of the new or renegotiated RRE loans during the preceding quarter" |

Four caps and the payload carries four, though only three have a surface: the
allowance is `deviation_allowance_pct_of_prior_quarter` and nothing on the site
reads it. It stays because a reader auditing the other three against the
decision meets a fourth there. All four re-read off that press release
**2026-08-23**, which also serves the 2024-10-01 in-force date and the
«monthly disposable income» basis the payload quotes.

**15% down is the regulatory floor**, not a convention — it is `100 − LTV-O`.
DSTI-O is measured against **net** income, which matches the app's "% of net
pay" cap. **Our affordability line is 30%**, deliberately stricter than the
legal 50% and than the ~38.5% weighted-average DSTI-O BG borrowers carry
([macroprudential overview](https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download/bs_mpp_overview_en.pdf));
`test_mortgage.py` asserts `30 < 38.5 < 50` so the ordering cannot silently
invert.

Same rule as payroll: **append a new dated entry, never mutate**, and cite the
БНБ press release in `source_url`.

---
