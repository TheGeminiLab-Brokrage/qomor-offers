/* Qomor Business Plaza — project configuration.
 *
 * Everything project-specific lives here. Playbook rule 2: no client's content
 * may ever be hard-coded anywhere else, or it ends up on another client's
 * document. (9MC shipped with EMC's renders and a map of the wrong city.)
 *
 * ALL commercial terms below were DERIVED from the client's own workbook on
 * 2026-08-12, not supplied as a written brief:
 *   - the pricing formula was reverse-engineered from the Availabilty tab and
 *     checked against all 176 rows with zero exceptions
 *   - the six plans were read off the Arabic payment-plan tabs
 * They have NOT been confirmed against a signed sample offer. See ASSUMPTIONS.
 */

const CONFIG = {
  id: 'qomor',
  /* "Business PLAZA", not "Business Park" — the client's own catalogue and the
   * wordmark on the cover both read BUSINESS PLAZA. The app said Park until
   * 2026-08-12. */
  name: 'Qomor Business Plaza',
  developer: 'El Shihry Developments',
  /* Named on the catalogue's partners page; not the developer. */
  partners: ['Elghanem Real Estate Developments', 'Kunuz Developments'],
  consultant: 'OY Studio',
  currency: 'EGP',
  logo: 'assets/logo.png',

  /* ---------------------------------------------------------------- sheet --
   * gviz first: it echoes the caller's Origin (so CORS works from anywhere)
   * and sends Cache-Control: no-cache. Verified 2026-08-12 returning HTTP 200,
   * text/csv, Access-Control-Allow-Origin echoed.
   *
   * TRAP: gviz IGNORES an unknown `sheet=` parameter and silently serves the
   * FIRST tab instead of erroring — requests for "Availabilty", "Availability"
   * and "ZZZ_NOT_A_TAB" all returned byte-identical data. The tab name is
   * therefore NOT a reliable selector. The inventory happens to be the first
   * tab today; normalizeRows() validates the header row and fails closed if it
   * ever stops being, which is the only real protection.
   */
  /* TWO WORKBOOKS, AND WHICH TEAM THIS APP IS FOR.
   *
   * The client replaced the single workbook on 2026-08-16. There are three
   * partners: one has a sales team cleared to sell the whole project INCLUDING
   * the third floor, the other two may not sell the third floor at all. So the
   * inventory now arrives as two separate workbooks, and which of them an app
   * reads is what decides what that app is allowed to sell.
   *
   * THIS BUILD IS FOR THE TEAM CLEARED FOR EVERYTHING, so it reads both. A
   * second app for the other two teams comes later and reads `project` ONLY —
   * dropping `thirdFloor` from this list is the whole change, which is why the
   * sources are a list rather than two fields. Do not "tidy" it back into one.
   *
   * Every unit in `thirdFloor` is a TH code and every unit in `project` is not,
   * so the merge cannot collide; loadInventory() still refuses a duplicate code
   * and names the workbook it came from.
   *
   * gviz first: it echoes the caller's Origin (so CORS works from anywhere) and
   * sends Cache-Control: no-cache, which is what keeps a sold unit from being
   * offered. `export?format=csv` is the fallback.
   *
   * TRAP, unchanged: gviz IGNORES an unknown `sheet=` parameter and silently
   * serves the FIRST tab instead of erroring, so the tab name is not a usable
   * selector. The inventory is the first tab in both workbooks today;
   * normalizeRows() validates the header row and fails closed if that changes.
   */
  sheets: [
    {
      key: 'project',
      label: 'the project inventory',
      id: '1ZC2rmCo_mBOi1bREmFhJ1p4wY9fxvieqsyATCkmm5cQ',
      urls: [
        'https://docs.google.com/spreadsheets/d/1ZC2rmCo_mBOi1bREmFhJ1p4wY9fxvieqsyATCkmm5cQ/gviz/tq?tqx=out:csv',
        'https://docs.google.com/spreadsheets/d/1ZC2rmCo_mBOi1bREmFhJ1p4wY9fxvieqsyATCkmm5cQ/export?format=csv',
      ],
    },
    {
      key: 'thirdFloor',
      label: 'the third-floor inventory',
      id: '1uwcijImIaofSNdXlGzdDAvsm8Ujo7MAUZRx-rw2BqeI',
      urls: [
        'https://docs.google.com/spreadsheets/d/1uwcijImIaofSNdXlGzdDAvsm8Ujo7MAUZRx-rw2BqeI/gviz/tq?tqx=out:csv',
        'https://docs.google.com/spreadsheets/d/1uwcijImIaofSNdXlGzdDAvsm8Ujo7MAUZRx-rw2BqeI/export?format=csv',
      ],
    },
  ],

  /* Fail closed: only these count as sellable. Everything else — including a
   * blank cell or a typo — is not offerable. The client's validation list
   * allows exactly: Available, Not Available, Hold, Booked, Sold Out. */
  availableStatuses: ['available'],
  reservedStatuses: ['hold', 'booked'],

  /* ------------------------------------------------------------ plan pins --
   * How big the dot on the floor plan is, in screen pixels, measured across
   * (its diameter). CHANGE THIS ONE NUMBER to resize every pin in the app.
   *
   * 4, with a tap target of 6px fixed in the stylesheet. The drawing is 2412px
   * wide shown in 732px of a 1080px page (1080 - 44 padding - 290 unit panel -
   * 14 gap), so it renders at 0.3035.
   *
   * THE CONSTRAINT IS THE CLOSEST PAIR, NOT THE AVERAGE ONE. Every earlier
   * attempt here was sized against 9.5px, which is the MEDIAN gap between
   * neighbouring pins. The real minimum, measured across all four floors, is
   * 6.73px — QSE-053 and QSE-054, on Q's vertical spine. Anything wider than
   * that overlaps somewhere, and where targets overlap the click goes to
   * whichever pin was drawn last rather than the one under the pointer.
   *
   * The history is worth keeping, because every step of it was sized against
   * the wrong number. 13 with a 34px target covered three or four units at
   * once. 7 with a 12px target still overlapped. 5 with an 8px target looked
   * safe against the 9.5px median but still contested 46 pins against the true
   * 6.73px minimum, and was reported a third time as hard to select.
   *
   * So the target is 6px rather than the dot plus 3. Six is under 6.73, which
   * means no two targets touch: a click either selects the pin under it or
   * selects nothing. Missing and getting nothing is a far better failure than
   * getting the neighbouring unit.
   *
   * The dot is 4 so it sits inside that target rather than spilling past its
   * own hit area. Larger is possible — the dots themselves do not merge until
   * 6.73 — but a dot wider than the target invites clicks on the part of it
   * that does not respond. Change both together or not at all.
   *
   * BOTH ARE MULTIPLIED BY THE PLAN ZOOM in the stylesheet, and these numbers
   * are the values at 100%. That is what finally answers the phone: the gap
   * between pins scales with the drawing, so scaling the target with it holds
   * the same 6 : 6.73 ratio at every level — at 4x the target is 24px against a
   * 26.9px gap, still with no overlap, and wide enough for a fingertip.
   * The first version of the zoom held the target at a fixed 6px, reasoning
   * that magnifying the drawing should push the pins apart instead of enlarging
   * them. It does push them apart — and it leaves a 6px target adrift in 27px
   * of dead space, so zooming in made the pin HARDER to hit while shrinking it
   * to a speck against the enlarged rooms. Reported immediately. Do not
   * reintroduce it.
   *
   * The pin tool has a slider that previews any value against the real drawing
   * and prints the number to paste back here.
   *
   * Sizes are in px rather than a fraction of the drawing so they hold steady
   * on a phone, where the drawing shrinks but the finger does not. Diameters,
   * not radii, because that is what the tool shows. */
  pinDotPx: 4,

  /* --------------------------------------------------------------- pricing --
   * Verified against all 530 rows of the Availabilty tab, zero exceptions:
   *     Area          = <the sheet's own smaller area column> x LOAD_FACTOR
   *     outdoorPrice  = indoorPrice / OUTDOOR_PRICE_DIVISOR
   *     Total         = Area x indoorPrice + Outdoor x outdoorPrice
   *     Final         = Total x (1 - Discount)
   *
   * Everything is quoted on the GROSS Area. The client instructed on
   * 2026-08-12 that the smaller (net) figure must never be shown, printed or
   * documented anywhere the customer can see. It is still READ, purely to
   * cross-check that the gross area is internally consistent — see the
   * loadFactor check in sheet.js — and it must never reach the UI or the PDF. */
  loadFactor: 1.56,
  outdoorPriceDivisor: 3,

  /* ----------------------------------------------------------------- plans --
   * Read off the six Arabic payment-plan tabs. Down payment is تعاقد (on
   * contract); instalments are قسط ربع سنوي (quarterly).
   *
   * The 7/8/9/10-year plans carry three milestone top-ups ON TOP of the level
   * quarterly amount — +5% at Q4, +5% at Q8, +10% at Q12. The 4- and 6-year
   * plans have none: their quarterly figure is simply level throughout. That
   * asymmetry is what the tabs show; it is not a transcription slip.
   *
   * `instalments` is the count of quarterly payments after the down payment.
   * The level quarterly rate is DERIVED, never hard-coded, so the schedule
   * always foots to exactly 100%:
   *     level = (100% - down - sum(milestones)) / instalments
   */
  instalmentEveryMonths: 3,
  firstInstalmentMonth: 3,
  milestones: [
    { quarter: 4, pct: 0.05 },
    { quarter: 8, pct: 0.05 },
    { quarter: 12, pct: 0.10 },
  ],
  plans: [
    { id: '4y',  label: '4 years',  down: 0.0625, instalments: 15, milestones: false },
    /* A single 10% at DELIVERY. The client adjusted this plan and added it,
       instructed and CONFIRMED 2026-08-18 — they were asked specifically
       whether the 10% comes out of the 100% or on top of it, and it comes
       out: the quarterly instalment absorbs it. Do not reopen this.
       Delivery is month 36 and instalments are quarterly, so that is quarter 12
       — the same quarter the 9% maintenance falls due, which is deliberate:
       both land at handover.
       Given as this plan's own array rather than `true`, because `true` means
       the standard 5% / 5% / 10% at quarters 4, 8 and 12, and this plan takes
       only the last of those. The level instalment drops from 3.75% to 3.333%
       to absorb it, so the plan still foots to exactly 100%. */
    { id: '6y',  label: '6 years',  down: 0.10,   instalments: 24,
      milestones: [{ quarter: 12, pct: 0.10 }] },
    { id: '7y',  label: '7 years',  down: 0.20,   instalments: 28, milestones: true  },
    { id: '8y',  label: '8 years',  down: 0.30,   instalments: 32, milestones: true  },
    { id: '9y',  label: '9 years',  down: 0.40,   instalments: 36, milestones: true  },
    { id: '10y', label: '10 years', down: 0.50,   instalments: 40, milestones: true  },
  ],

  /* ----------------------------------------------------------- maintenance --
   * 9% on every plan, due at month 36, which is also the delivery date. */
  maintenanceRate: 0.09,
  maintenanceDueMonth: 36,
  deliveryMonth: 36,

  /* --------------------------------------------------------------- floors --
   * The client sheet's own vocabulary. `code` is the middle segment of a unit
   * code: QSP-067 = building Q, Sky Plaza, unit 067.
   *
   * NOTE "SP" is Sky Plaza, NOT "sales plan". Sky Plaza is the ground level;
   * Ground Plaza sits below it and is not sold (hypermarket, showroom, kids
   * area) — it has no rows in the sheet. GP is a placeholder code: no Ground
   * Plaza unit exists to read a real one from. */
  /* GPL, not GP: the workbook codes its ground-floor units GPL-001..GPL-178,
     so the code here has to be what the sheet actually writes or every row
     mismatches. It is also the one floor whose codes carry NO building letter
     — the ground plaza is a single continuous plate, numbered straight through,
     not four wings each restarting at 001. See parseUnitCode.

     WARNING: `sellable` IS INERT. Nothing reads it — the name collides with
     app.js's own sellable(building, floor) function, which is a different thing
     entirely, so it reads like a switch and is really a comment. Flipping it
     changes nothing. Left in place only because it documents intent; delete it
     or make it real, but do not trust it. (The same trap as `sharedWith` in
     plan.js, which sat as inert data until 2026-08-16.)

     What ACTUALLY keeps the ground floor dark is the data: all 181 rows arrive
     with dashes in every price column and an empty Availability cell, and the
     parser fails closed on both. Ops filling those in is enough to make the
     units parse — but NOT enough to make them visible, because the app is
     navigated building-first and these units have no building. See unitsIn(). */
  /* hasBuildings: false marks a floor that is ONE CONTINUOUS PLATE with no
     wings. Unlike `sellable` above it is read — by floorHasBuildings() in
     app.js — and it is what makes the ground plaza reachable: the app is
     navigated building-first, so a floor whose units belong to no building
     would otherwise match no selection and stay invisible however well priced.
     On such a floor the building filter is skipped, and the floor is listed
     under EVERY building, on the user's decision 2026-08-17. */
  floors: [
    { code: 'GPL', name: 'Ground Plaza', sellable: false, hasBuildings: false },
    { code: 'SP',  name: 'Sky Plaza',    sellable: true  },
    { code: 'FT',  name: 'First Floor',  sellable: true  },
    { code: 'SE',  name: 'Second Floor', sellable: true  },
    { code: 'TH',  name: 'Third Floor',  sellable: true  },
  ],

  /* Letters corrected by the client 2026-08-12; an earlier guess had them
   * shuffled by the cycle Q->O->M->R->Q. Q is the C-shaped wing. */
  buildings: [
    { id: 'Q', name: 'Building Q' },
    { id: 'M', name: 'Building M' },
    { id: 'O', name: 'Building O' },
    { id: 'R', name: 'Building R' },
  ],

  /* Where the drawing and the sheet disagree and the drawing has been accepted
   * as right. Replaces the area and RE-DERIVES the meter price from the total,
   * so the offer still foots. Never override a total price. */
  unitOverrides: {},
  excludedUnits: {},

  /* ------------------------------------------------------------ PDF story --
   * Playbook rule 4: the description and advantages come VERBATIM from the
   * client's fact sheet. None has been supplied, so these stay empty and the
   * PDF renders without those pages rather than inventing copy that goes out
   * over the client's name. */
  /* Everything below is the CLIENT'S OWN material, read off their catalogue
   * ("cataloue qomor arabic partneres final.pdf", supplied 2026-08-13). The
   * deck is in Arabic; the English here is a literal rendering of the client's
   * own labels and figures and NOT new marketing copy — playbook rule 4 still
   * stands, we do not write the client's prose. Each block cites the slide it
   * came from so any wording can be checked against the source.
   *
   * The two headline areas are different measures, not a contradiction:
   * 90,000 m² is the total built-up area (p14), 49,000 m² is the mixed-use
   * area that the 31,000 / 3,000 / 15,000 split adds up to (p10). */
  location: 'Badr City, Cairo',
  mapsUrl: 'https://maps.app.goo.gl/9hFUfLZfbe9gFTB76?g_st=aw',

  /* Public URL of this app. The WhatsApp message carries a deep link straight
   * to the unit and plan being quoted.
   *
   * Deliberately the github.io address and not qomor.thegeminilab.com yet: the
   * custom domain has no DNS record at the time of writing, and a link nobody
   * can open is worse than an ugly one. Pages redirects github.io -> the custom
   * domain once it is live, so links already sent keep working; switch this to
   * the custom domain only after DNS resolves. */
  shareBaseUrl: 'https://qomor.thegeminilab.com/',

  project: {
    builtUpArea:  '90,000 m²',   // p14 المساحة البنائية الإجمالية
    mixedUseArea: '49,000 m²',   // p10 إجمالي مساحة المشروع متعددة الاستخدامات

    /* Use mix, p10/p14. The catalogue also attributes a floor to each use
     * (offices 2nd, medical 3rd). That is deliberately NOT reproduced here:
     * the sheet is the authority for floors, it puts both on Second Floor, and
     * printing the catalogue's attribution would contradict the unit page of
     * the very same document. */
    mix: [
      { label: 'Retail',          area: '31,000 m²' },
      { label: 'Offices',         area: '3,000 m²'  },
      { label: 'Medical centre',  area: '15,000 m²' },
    ],
    levels: [
      { label: 'Ground Plaza', area: '6,000 m²'  },
      { label: 'Sky Plaza',    area: '11,000 m²' },
      { label: 'Sky Strip',    area: '2,000 m²'  },
      { label: 'Parking',      area: '17,000 m²' },   // p19
      { label: 'Hypermarket',  area: '3,000 m²'  },   // p18
    ],

    features: [            // p21 مميزات المشروع
      'First strip mall in Badr City',
      'Restaurant cluster',
      'Sky Plaza',
      'Bank cluster',
      'Show rooms',
      'Kids area',
      'Welcome fountain',
      'Gym',
    ],
    services: [            // p20 خدمات المشروع
      'High-speed fibre-optic internet',
      '24-hour security and CCTV',
      'Dedicated clinic entrances',
      'Integrated fire safety system',
      'Service corridors for restaurants and retail',
      'Advanced air-conditioning',
      'Baby care room',
      'Step-free access throughout',
    ],

    nearby: [              // p7 within Badr City
      ['Badr University', '2 min'],
      ['Tourist Walkway', '2 min'],
      ['Egyptian-Russian University', '2 min'],
      ['Industrial Zone', '5 min'],
      ['Suez Road', '5 min'],
      ['Cairo–Ismailia Road', '5 min'],
    ],
    reach: [               // p5 to the wider east-Cairo destinations
      ['Shorouk City', '10 min'],
      ['Madinaty', '15 min'],
      ['Obour City', '15 min'],
      ['New Administrative Capital', '15 min'],
      ['10th of Ramadan City', '20 min'],
      ['New Cairo (Fifth Settlement)', '25 min'],
    ],
  },

  /* Artwork for the PDF. Built by scripts/make-renders.ps1 from the client's
   * originals; see that script for which source fed which file. Night and day
   * are separate sets so an offer can lead with whichever suits. `clinic` is
   * used ONLY when the unit's Type is Medical. */
  art: {
    cover:    'assets/renders/cover.jpg',
    location: 'assets/renders/location.jpg',
    masterplan: 'assets/render.jpg',
    night: ['assets/renders/night-1.jpg', 'assets/renders/night-2.jpg', 'assets/renders/night-3.jpg'],
    day:   ['assets/renders/day-1.jpg',   'assets/renders/day-2.jpg',   'assets/renders/day-3.jpg'],
    clinic: ['assets/renders/clinic-1.jpg', 'assets/renders/clinic-2.jpg'],
  },

  /* Not supplied yet — the PDF omits the contact strip rather than inventing
   * a phone number that would go out over the client's name. */
  contact: null,
};

/* Assumptions a signed sample offer would settle. Surfaced in the UI and
 * printed by the test suite so they cannot quietly become fact. */
const ASSUMPTION_TEXT = {
  finalPrice: 'The instalment plan is calculated on the sheet\'s Final Price (after the per-unit discount), not on the Total Unit Price.',
  maintenance: 'The 9% maintenance is calculated on the same Final Price, and is a single payment at month 36.',
  firstInstalment: 'The first quarterly instalment falls 3 months after contract.',
  rounding: 'Rounding drift is absorbed by the final instalment so the schedule sums exactly.',
  /* Keep the Arabic inside its own brackets. The PDF strips anything jsPDF's
   * WinAnsi fonts cannot encode, and a bracketed run strips to "()" which the
   * sanitiser then removes cleanly — inline Arabic would leave "mention / —"
   * stranded mid-sentence on the printed offer. */
  noFees: 'No club, parking, garage, storage or admin fee is added. The plan tabs list garage and storage (سعر الجراج / سعر المخزن) as separate lines that are currently #N/A.',
};

/* The order they are shown in, everywhere. */
const ASSUMPTION_ORDER = ['finalPrice', 'maintenance', 'firstInstalment', 'rounding', 'noFees'];

/* Unchanged in shape and order — the app prints this on screen, the tests print
 * it after every run, and ASSUMPTIONS_AR in i18n.js is held against it by
 * length. Derived from the map so there is one copy of each sentence. */
const ASSUMPTIONS = ASSUMPTION_ORDER.map((k) => ASSUMPTION_TEXT[k]);

/* WHAT THE CUSTOMER'S TERMS PAGE PRINTS — everything except `rounding`.
 *
 * That one is an internal integrity note, not a term of sale: it says the last
 * instalment absorbs sub-pound drift so the schedule foots exactly. True, and
 * worth keeping in front of us until a signed sample offer confirms it, but it
 * describes our arithmetic rather than anything the buyer agrees to, and on the
 * page it read as an admission that the numbers need adjusting. Dropped from
 * print on the client's instruction 2026-08-18; kept in ASSUMPTIONS above so
 * the app and the tests still carry it.
 *
 * Keyed, not sliced by index, so reordering the list above cannot silently
 * change which term the customer sees. */
const TERMS_ORDER = ASSUMPTION_ORDER.filter((k) => k !== 'rounding');

/* RULED BY THE CLIENT 2026-08-12: the SHEET is the authority for what a unit is
 * and where it sits. Whether a unit is admin or a clinic comes from its Type
 * column, and its floor comes from its Floor column — nothing is inferred from
 * the catalogue or the drawings.
 *
 * This closes an open question. The drawing is titled "2ND-3RD FLOOR SALES
 * PLAN" and the catalogue puts admin offices on the 2nd floor and the medical
 * centre on the 3rd, which suggested the 154 SE Medical units might really be
 * third-floor stock. The sheet says "Second Floor" for all 182 SE rows, so
 * "Second Floor" is what the app shows. Do not re-derive this from the
 * marketing material. */

if (typeof module !== 'undefined') {
  module.exports = {
    CONFIG, ASSUMPTIONS, ASSUMPTION_TEXT, ASSUMPTION_ORDER, TERMS_ORDER,
  };
}
