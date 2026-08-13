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
  sheetId: '1E8ecaVRrxO2vRd1DJTySH9_5oLwnJBDBuOamIfwQV2c',
  sheetUrls: [
    'https://docs.google.com/spreadsheets/d/1E8ecaVRrxO2vRd1DJTySH9_5oLwnJBDBuOamIfwQV2c/gviz/tq?tqx=out:csv',
    'https://docs.google.com/spreadsheets/d/1E8ecaVRrxO2vRd1DJTySH9_5oLwnJBDBuOamIfwQV2c/export?format=csv',
  ],

  /* Fail closed: only these count as sellable. Everything else — including a
   * blank cell or a typo — is not offerable. The client's validation list
   * allows exactly: Available, Not Available, Hold, Booked, Sold Out. */
  availableStatuses: ['available'],
  reservedStatuses: ['hold', 'booked'],

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
    { id: '6y',  label: '6 years',  down: 0.10,   instalments: 24, milestones: false },
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
  floors: [
    { code: 'GP', name: 'Ground Plaza', sellable: false },
    { code: 'SP', name: 'Sky Plaza',    sellable: true  },
    { code: 'FT', name: 'First Floor',  sellable: true  },
    { code: 'SE', name: 'Second Floor', sellable: true  },
    { code: 'TH', name: 'Third Floor',  sellable: true  },
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

  /* Public URL of this app, once it is deployed. When set, the WhatsApp message
   * carries a deep link straight to the unit and plan being quoted. Left null
   * until the client decides where — and whether — this goes public: the app
   * exposes the full price list, every per-unit discount and live availability
   * to anyone holding the link. */
  shareBaseUrl: null,

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
const ASSUMPTIONS = [
  'The instalment plan is calculated on the sheet\'s Final Price (after the per-unit discount), not on the Total Unit Price.',
  'The 9% maintenance is calculated on the same Final Price, and is a single payment at month 36.',
  'The first quarterly instalment falls 3 months after contract.',
  'Rounding drift is absorbed by the final instalment so the schedule sums exactly.',
  /* Keep the Arabic inside its own brackets. The PDF strips anything jsPDF's
   * WinAnsi fonts cannot encode, and a bracketed run strips to "()" which the
   * sanitiser then removes cleanly — inline Arabic would leave "mention / —"
   * stranded mid-sentence on the printed offer. */
  'No club, parking, garage, storage or admin fee is added. The plan tabs list garage and storage (سعر الجراج / سعر المخزن) as separate lines that are currently #N/A.',
];

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

if (typeof module !== 'undefined') module.exports = { CONFIG, ASSUMPTIONS };
