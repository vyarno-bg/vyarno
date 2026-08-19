# БНБ — `sources/bnb.py`

The mortgage stock and the revolving balances, published as XLSX. Their server
omits a TLS intermediate, so the environment setup below comes before any fetch.

[`data-sources.md`](../data-sources.md) is the index, the cross-cutting rules and
the checklist for adding a connector.

## TLS setup (once per environment)

`www.bnb.bg` serves a certificate issued by `GeoTrust EV RSA CA G2` but **does
not send that intermediate**, so a default trust store fails with `unable to get
local issuer certificate`. **Never disable verification.** Fetch the
intermediate from the leaf's own AIA URL:

```bash
curl -sSL -o /tmp/g2.crt 'http://cacerts.digicert.com/GeoTrustEVRSACAG2.crt'
openssl x509 -in /tmp/g2.crt -inform DER -out /tmp/g2.pem

# system-wide (preferred for a long-lived runtime)
sudo cp /tmp/g2.pem /usr/local/share/ca-certificates/bnb-geotrust-g2.crt
sudo update-ca-certificates --fresh

# or, without root, a one-off bundle
cat /etc/ssl/certs/ca-certificates.crt /tmp/g2.pem > /tmp/bnb-bundle.pem
export SSL_CERT_FILE=/tmp/bnb-bundle.pem

# verify (expect 200)
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://www.bnb.bg/bnbweb/groups/public/documents/bnb_download/s_ir_loan_oa_hh_bg.xlsx
```

Unfixed, `refresh --source mortgage` exits **4** and the error points back here.

## Finding a БНБ file at all

**Every `/Statistics/**/index.htm` path that does not exist answers 200 with an
identical Site Studio shell** — 16,803 bytes to a library user-agent, 27,264 to
a browser one. So a 200 from bnb.bg proves nothing and a byte count is the
test. The paths that DO exist render server-side and carry their download links
in the HTML.

Do not guess them. `https://www.bnb.bg/bnbweb/websites/bnb/sitenavigation.js`
is the site's own navigation tree, and every real path is an `addNode(...)`
argument in it — 116 under `Statistics/` alone, plus `BankSupervision/` and
`RegistersAndServices/`. Extract the paths, fetch those, read the `<table>`
rows for the `bnb_download/` links and their Bulgarian labels. That is how
`s_ir_loan_nbf_hh_bg.xlsx` was found; guessing filenames from the ones we
already had would not have produced it.

## `s_ir_loan_oa_hh_bg.xlsx` — household loans by purpose

Sheet `LOAN_OA_HH`, monthly **2007-01 → present**, one row per month. **The
cell:** Жилищни кредити (housing) × в евро (EUR) × maturity **total** — the rate
into `outstanding_stock.value_pct`, the book beside it into `book_volume_eur_m`.

**Column discovery, never a hardcoded index.** The header is four merged rows —
purpose → currency → maturity — and the connector re-reads them every run,
raising if the labels move:

| Header row | Col | Label | Meaning |
|---|---|---|---|
| 3 | 25 | `Обеми в млн. евро` | divider: rates left, volumes right |
| 4 | 9 / 33 | `Жилищни кредити` | housing block (rates / volumes) |
| 5 | 9 | `в евро` | EUR sub-block |
| 6 | 9 | *(blank)* | the block total ← **our cell** |
| 6 | 10–12 | `до 1 година` / `над 1 до 5 години` / `над 5 години` | maturity buckets |

We take the maturity **total**, not a bucket, because the honest answer to "what
does the average mortgage holder pay" is the whole book.

**«Жилищни кредити» is a purpose, and it is wider than buying a home.** БНБ's
методологически бележки, read **2026-08-13**:

> Жилищни кредити – кредити, предоставени на домакинствата с цел инвестиране в
> жилища за собствено ползване или наем, включително за строителство и за
> подобрения на жилища.

So building a house and renovating one are inside the column, and so is
buy-to-let. What is **not** inside it is the loan a reader might expect to be:
a consumer loan secured on a home goes to the consumption category instead —
«Кредити за потребление … Тук се включват и кредитите за потребление, отпуснати
срещу ипотека.» The distinction is by what the money is for, never by what
secures it.

**And the stock is not every household still repaying something.** The same
notes exclude, from both the balances and the rates over them, «кредитите, които
са необслужвани или преструктурирани с мерки, които пряко или косвено водят до
снижаване на лихвения процент под пазарното ниво за съответния пазарен сегмент».
A defaulted mortgage and one restructured below market are outside the average,
which is the direction that matters: the published rate is over the performing
book, so it is if anything an understatement of what the country is paying.

**Cross-check against ЕЦБ MIR:** this cell and
`M.BG.B.A22.A.R.A.2250.EUR.O` are the same data reported twice — БНБ is the
institution that reports MIR to the ЕЦБ — so they agree to their own rounding.
`mortgage.py#cross_check_outstanding` enforces that as a gate at 0.30 pp, and the
observed delta rides in `cross_check.delta_pp`.

**Methodology change in the payload:** Bulgaria adopted the euro on 2026-01-01.
Per the БНБ methodological note (`st_m_instr_irs_new_2026_bg.pdf`, 19 Feb 2026),
OLP and LEONIA Plus were retired, the BGN column dropped, and pre-2026 EUR
figures **reconstructed** by БНБ from BGN+EUR aggregates — so EUR values before
2026-01 are a reconstruction, not a contemporaneous observation.
`outstanding_stock.methodology_change` cites the PDF verbatim.

> **Do not use `s_ir_loan_oa_rm_hh_bg.xlsx`.** Its title is *"…loans other than
> overdraft for the household sector by original maturity, residual maturity and
> period until the next interest-rate change"*: every purpose blended, no
> housing breakdown at all. Two tells — its volume column covers all household
> lending and so runs far above the housing book, and the rate column beside it
> reads a level no mortgage has carried.

## The same sheet's other two purposes — `credit.json → outstanding`

The header walk takes the purpose it is looking for, because the three blocks sit
at three offsets and are not even the same width: the housing block of the
new-business workbook carries four fixation buckets where consumer and «Други
кредити» carry three. `«Кредити за потребление»` is at cols 1/25 and «Други
кредити» at 17/41, on the grammar tabulated above.

«Кредити за потребление» is a purpose and not a product. It includes a consumer
loan secured on a home (quoted above) and excludes overdrafts and cards
entirely — the workbook's own title is «КРЕДИТИ, **РАЗЛИЧНИ ОТ ОВЪРДРАФТ**». So
it may never be captioned as card debt, which is the read the page has to keep
apart in a sentence.

## `s_ir_ovdr_cc_oa_hh_bg.xlsx` — the revolving balances

Sheet `OVDR_CC_OA_HH`, monthly **2000-03 → present**, and a different grammar:
no purpose row, because there is one purpose, and the blocks NEST.

| Header row | Col | Label | Meaning |
|---|---|---|---|
| 3 | 1 / 7 | `Ефективен годишен процент` / `Обеми в млн. евро` | rates left, volumes right |
| 4 | 1 / 7 | `Овърдрафт2` | the whole block, cards included |
| 4 | 3 / 9 | `в т.ч. кредитни карти2` | **inside** the overdraft block |
| 6 | 4 / 10 | `в т.ч. извън безлихвен гратисен период` | **inside** the card block |

**€695 m ⊃ €490 m ⊃ €371 m, and every one of the three is a believable card
balance.** Read flat they would be added up to roughly twice what is owed, so
`credit.py#validate_card_nesting` holds the containment for every published
month. The trailing digits are БНБ's footnote markers and part of the cell text.

**Which cell answers which ЕЦБ key**, measured month by month over the euro era:

| ЕЦБ MIR key | БНБ cell | Worst Δ |
|---|---|---|
| `A2Z3` extended card credit | «в т.ч. извън безлихвен гратисен период» | 0.014 pp |
| `A2Z1` revolving loans and overdrafts | «Овърдрафт» **less** «в т.ч. кредитни карти» | 0.021 pp |
| `A20` all household loans, outstanding | the four purpose blocks blended by volume | 0.049 pp |

The A2Z1 row is a **subtraction**, because the ЕЦБ's item excludes card credit
and БНБ's block includes it. Nothing about €205 m at 6.46% looks wrong on its own;
what proves the subtraction happened is that the rate it leaves is the one the
ЕЦБ publish. All three ride in the payload as `stock_cross_check`, and
[`legal.md`](./legal.md) §БНБ is where the derivation is disclosed.

**БНБ write «nc» in cells they did not compute**, right through the early 2000s.
`bnb.py#_number` returns None for those rather than 0, because a zero-filled rate
renders as a bank lending for nothing.

---
