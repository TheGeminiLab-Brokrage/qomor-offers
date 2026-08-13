# Qomor Business Plaza — Offer Generator

Static web app. No server, no database, no build step. Built to the pattern in
`Offer Generator Playbook.md`, using the Eliwah/EMC build as the reference
implementation.

**Status: the data layer and the UI are built and tested. The PDF is not.**

| Layer | State |
|---|---|
| `js/config.js` | Done — all commercial terms derived from the client workbook |
| `js/sheet.js` | Done — live CSV sync, fail-closed, cross-footed |
| `js/engine.js` | Done — six plans, milestone top-ups, exact footing |
| `scripts/test.js` | Done — 380 checks, incl. 3,180 live schedules |
| `js/plan.js` | Done for **Building Q** — 207 pins read off the drawings, verified by eye. M, O, R not pinned (see Floor-plan pins) |
| `js/app.js` | Done — render building picker, floor-plan unit picker, deep links, live refresh |
| `js/pdf.js` | Done — 9-page offer, 11 for a clinic on a 10-year plan. See PDF offer |

Run the tests:

```
node scripts/test.js          # offline
node scripts/test.js --live   # also fetches the real sheet
```

---

## Where every number came from

Nothing here was supplied as a written brief. All of it was **derived from the
client's own Google workbook on 2026-08-12** and verified against the data.

### Pricing

Verified against all 176 rows visible at the time, then re-verified against all
530 live rows — zero exceptions:

```
Area          = <the sheet's smaller area column> × 1.56   (1.56 is in the sheet's validation list)
outdoorPrice  = indoorPrice ÷ 3
Total         = Area × indoorPrice + Outdoor × outdoorPrice
Final         = Total × (1 − Discount)
```

**Everything is quoted on the gross `Area`.** The client instructed on
2026-08-12 that the smaller *net* figure must never be shown, printed or
documented anywhere a customer can see it. It is still read from the sheet, for
one purpose only — cross-checking that the gross area is internally consistent
(`sheet.js`) — and it reaches neither the UI nor the PDF. The warning that check
raises names the unit code but never the net value, because warnings render on
screen.

### The discount

There is **no fixed discount rate**. The app does not compute one at all: it
reads the sheet's `Discount` column per unit and applies `Final = Total ×
(1 − Discount)`, which foots on every one of the 530 rows.

15% is simply the most common value, which is why it appears to be everywhere:

| Discount | All 530 units | Of the 108 available |
|---|---|---|
| 0% | 34 | 0 |
| 10% | 75 | 15 |
| 15% | **231** | **46** |
| 20% | 190 | 47 |

It is not driven by floor, building or unit type — Building Q's First Floor is
all 15%, its Second and Sky Plaza are all 20%, and Building M mixes 10/15/20%
across its floors. Whoever maintains the sheet sets it per unit; change it there
and the app follows on the next refresh.

**Still to confirm with the client:** whether this is a standing price list or a
launch promotion with an expiry — the sheet carries no date, so the app cannot
tell, and an expired discount would be quoted as current.

### Payment plans

Read off the six Arabic plan tabs. Down payment is تعاقد, instalments are
قسط ربع سنوي (quarterly), maintenance is دفعة صيانة.

| Plan | Down | Instalments | Term | Milestones |
|---|---|---|---|---|
| 4 years | 6.25% | 15 | 45 mo | none |
| 6 years | 10% | 24 | 72 mo | none |
| 7 years | 20% | 28 | 84 mo | +5% Q4, +5% Q8, +10% Q12 |
| 8 years | 30% | 32 | 96 mo | same |
| 9 years | 40% | 36 | 108 mo | same |
| 10 years | 50% | 40 | 120 mo | same |

First instalment at +3 months. Maintenance 9% at +36 months, which is also
delivery. The 4- and 6-year plans genuinely have **no** milestone top-ups —
that asymmetry is what the tabs show.

**The quarterly rate is derived, never transcribed.** The client's tabs display
rounded percentages (2.14%, 1.56%, 1.11%) that sum to 99.92%–100%, i.e. they do
not foot. Transcribing them would leave up to 0.08% of the price unpaid — on a
10,000,000 unit that is 8,000 EGP quietly missing from a customer's schedule.
`engine.js` computes `level = (1 − down − milestones) / instalments` and absorbs
rounding drift in the final instalment, so every schedule sums exactly.

---

## Inventory

Live from the published sheet on every load. 530 priced units, 108 available:

| Building | Units | Available | Floors | Mix |
|---|---|---|---|---|
| Q | 207 | 20 | SP 65, FT 64, SE 78 | 129 retail, 78 medical |
| M | 88 | 88 | SP 32, FT 29, SE 27 | 61 retail, 27 medical |
| O | 87 | 0 | SP 30, FT 29, SE 28 | 59 retail, 28 admin |
| R | 148 | 0 | SP 50, FT 49, SE 49 | 99 retail, 49 medical |

### `SE`, the 2nd/3rd floor question — closed twice over

**2026-08-13: the client confirmed the catalogue is wrong.** Its "offices on the
2nd, medical centre on the 3rd" split is a typo the client is correcting in the
deck. So the sheet was right all along and nothing in the app changes. Do not
re-open this from the catalogue, including from a corrected copy — the sheet
remains the authority either way.

The rest of this section is the original working, kept as the record.

### Why it was asked — the sheet governs

**The client ruled on 2026-08-12 that the sheet is the authority.** What a unit
*is* comes from its `Type` column; where it *sits* comes from its `Floor`
column. Nothing is inferred from the catalogue or the drawings. The sheet says
`Second Floor` for all 182 `SE` rows, so that is what the app shows, and the
`Type` column is what decides admin vs clinic.

The rest of this section is kept as the record of why it was asked — do not
re-derive floors from the marketing material.

No row in the sheet carries a `TH` code, yet a third floor clearly exists. Four
pieces of evidence pointed at the units coded `SE` spanning the 2nd **and** the
3rd:

1. The drawing's own title block reads **`2ND-3RD FLOOR SALES PLAN`** — one
   plate serving both floors. (Its area sub-table is headed `FIRST FLOOR`, which
   is a separate title-block error worth reporting to OY Studio.)
2. The client catalogue puts **admin offices on the 2nd floor (3,000 m²)** and
   the **medical centre on the 3rd (15,000 m²)** — two different uses, two
   different floors.
3. `SE` splits into exactly those two uses: **28 Admin** and **154 Medical**.
4. That plate totals **5,695.8 m²**; the sheet's `SE` Medical units total
   **5,698 m²** — the same floor to within 2 m².

That suggested `SE` + Admin → 2nd floor, `SE` + Medical → 3rd floor.

**It was not applied, and will not be.** The catalogue's areas never reconciled
with the sheet either (3,000 vs 1,150 m² admin; 15,000 vs 5,698 m² medical),
because the sheet holds only released, priced stock — which is exactly why it
was flagged rather than assumed. The client's ruling settles it in favour of the
sheet.

Still worth reporting to OY Studio: that drawing's area sub-table is headed
`FIRST FLOOR` on a sheet titled `2ND-3RD FLOOR SALES PLAN`.

Ground Plaza has a further 178 rows with no prices and blank availability, plus
`GPL-H`, `GPL-S`, `GPL-K` for the hypermarket, showroom and kids area. Those are
skipped — the client confirmed Ground Plaza is not being sold.

### Unit codes

`<building><floor>-<unit>` — `QSP-067` is building Q, Sky Plaza, unit 067.
Unit numbers **restart per building per floor**, so the number alone identifies
nothing. Never key inventory on it.

Floors: `GP` Ground Plaza (not sold), `SP` Sky Plaza, `FT` First, `SE` Second,
`TH` Third. **`SP` is Sky Plaza, not "sales plan"** — Sky Plaza is the ground
level and Ground Plaza sits below it.

### Sheet sync traps

- **gviz ignores an unknown `sheet=` parameter** and silently serves the *first*
  tab. Requests for `Availabilty`, `Availability` and `ZZZ_NOT_A_TAB` all
  returned byte-identical data. The tab name is not a usable selector, so
  `normalizeRows` validates the header row and refuses anything that is not the
  inventory. That check is the only thing preventing the app pricing off the
  wrong table.
- CORS verified: `Access-Control-Allow-Origin` echoes the caller's origin and
  `Cache-Control: no-cache` is sent.
- Do **not** read this sheet through a document-reading tool. One such read
  truncated silently at 176 of 530 rows, and a summary built on it reported that
  only Building Q existed. Always use the CSV endpoint.

---

## Floor-plan pins

Every pin in `js/plan.js` is **read off the drawing**, not clicked. The PDFs
have no text layer, but the exported PNGs do not need one: each unit is labelled
with a large horizontal zero-padded 3-digit number, and every other annotation
is either much smaller or carries a decimal point, so font height alone
separates them. Full method and traps: `scripts/pins/README.md`.

| Building | Pinned | Why |
|---|---|---|
| Q | 207 / 207 | Complete on SP, FT and SE; checked by eye pin by pin |
| M | 0 / 88 | Held pending the client confirming the 88-of-88 availability |
| O | 0 / 87 | 100% sold — nothing reaches the UI |
| R | 0 / 148 | 100% sold — nothing reaches the UI |

Because the UI only ever shows available units, Q's 207 pins cover **every unit
a customer can currently be shown**: 20 of the 108 available units are Q, and
the other 88 are M.

Two things this exercise settled:

- **The 26 pins placed by hand on SP were wrong.** They assumed Q's bottom bar
  was 13 units over 13. It is 14 (`001`-`014`) over 18 (`015`-`032`), so the
  hand pins drifted progressively — up to 0.048, about one and a half rooms —
  and `QSP-019` through `QSP-026` pointed at the wrong units. Reading the labels
  instead of estimating them is what caught it.
- **There is no `TH` floor in the inventory at all** — not merely unreleased.
  The sheet contains `FT`, `SE` and `SP` only, and zero rows carry a `TH` code.

---

## PDF offer

`node scripts/test-pdf.js QSP-033 8y` renders a real offer without the browser.
Page order was set by the client 2026-08-13:

| # | Page | Notes |
|---|---|---|
| 1 | Cover | The client's own title slide, out of the catalogue |
| 2 | The project | Areas, features, Badr City map, Google Maps link |
| 3 | The place | One large night render plus three day/night |
| 4 | The medical floor | **Clinics only** — the two interior renders |
| 5 | Your building | Masterplan, everything dimmed except the chosen building |
| 6 | Your floor | Floor drawing with the unit pinned |
| 7 | Your unit | Gross area and price |
| 8+ | Payment plan | Full-width table, same shape as the app's schedule |
| last | Terms | The assumptions above, verbatim |

The schedule flows onto continuation pages rather than being squeezed into
columns — a 10-year plan is 42 rows plus 11 year bands, and the first version
packed that into three narrow columns nobody could read. A 4-year plan fits one
page; a 10-year one takes three.

The building page dims the whole render and paints the customer's building back
in at full brightness through a clip of its own outline. A translucent gold wash
was the obvious approach and it was almost invisible against a night render that
is already warm and lit.

Artwork is built by `scripts/make-renders.ps1` from the client's originals,
which are enormous (one is 8128×5120 / 66 MB). It resamples and re-encodes them
to about 4 MB total, because these offers travel by WhatsApp.

Three traps worth keeping:

- **`doc.rect(x,y,w,h)` before `doc.clip()` does not clip.** The default style
  is `'S'`, which emits `re S` — the `S` paints the rectangle *and ends the
  path*, so the following `W` has nothing to clip with and is ignored. It must
  be `doc.rect(x, y, w, h, null)` to emit `re W n`. This fails silently: it
  draws a stray box and leaves every image unclipped. The first build masked
  the overflow with white rectangles instead, which erased the entire left
  column of the project page and the header bar on every full-bleed render.
- **jsPDF's built-in fonts are WinAnsi.** Arabic and a U+2212 minus both came
  out as mojibake rather than an error. `latin()` strips what cannot be encoded;
  keep any Arabic in `ASSUMPTIONS` inside its own brackets so the strip leaves
  clean prose behind.
- **The masterplan page contains rather than covers.** A cover fit crops the top
  of the render, which is where Building Q sits, and cut the highlight in half.

---

## Assumptions — NOT yet verified against a signed offer

No sample offer has been supplied. These would be settled by one, and are
printed by the test suite so they cannot quietly become fact:

1. The instalment plan is calculated on **Final Price** (after the per-unit
   discount), not on Total Unit Price.
2. The 9% maintenance is calculated on that same Final Price, and is a single
   payment at month 36.
3. The first quarterly instalment falls 3 months after contract.
4. Rounding drift is absorbed by the final instalment.
5. No club, parking, garage, storage or admin fee is added. The plan tabs do
   mention سعر الجراج and سعر المخزن — garage and storage — as separate lines
   that are currently `#N/A`.

**Ask the client for a signed sample offer.** It is the only way to verify the
maths to the pound.

---

## Still needed from the client

- [ ] A **signed sample offer** (see above)
- [ ] Whether maintenance is on the original or the discounted price
- [ ] Whether garage / storage are chargeable extras
- [x] ~~Logo as transparent PNG or SVG~~ — lifted from the catalogue cover
      (`assets/logo.png`). Vector on the page, so rendered at 200dpi and keyed
      off the blue background. A supplied original would still be better for
      print
- [ ] Whether the per-unit discount is a standing price list or a promotion
      with an expiry date (see Pricing)
- [ ] Fact sheet PDF — description, advantages, renders, map (playbook rule 4:
      we do not write the client's marketing copy)
- [ ] A clean wide render for the PDF cover, without branding baked into a corner
- [ ] Contact details for the terms page, and brand colours
- [ ] Confirmation that the six renders are **approved visualisation, not AI
      concept art** — still unanswered, and it gates the picker and the cover
- [ ] **Why Building M is 88 of 88 available** while O and R are 100% sold.
      Until that is confirmed, M's pins are not worth placing — and M is 88 of
      the 108 units the app can currently show
- [x] ~~Whether `SE` means the 2nd floor, the 3rd, or both~~ — settled
      2026-08-12: the sheet governs, for both type and floor. See Inventory
- [ ] Report to OY Studio: the 2nd-3rd floor drawing's area table is headed
      "FIRST FLOOR"

## Front end

The building picker is merged into the app: the render *is* the picker, with a
compact chip and dropdown. Its contract is one call — `selectBuilding(id)` — so
the 3D view, the image map and a plain list are interchangeable and nothing
downstream knows how the building was chosen.

The standalone prototype is kept for reference:
https://claude.ai/code/artifact/c7acb3ba-5900-4271-b762-771bcab57e6b
