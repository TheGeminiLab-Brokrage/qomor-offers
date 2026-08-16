/* Geometry registry.
 *
 * Two kinds of geometry, both in NORMALISED coordinates so they survive any
 * display size:
 *
 *   MASSING  — polygons over the night render, one per building. Traced by the
 *              client on the render itself. x and y are fractions of the image
 *              WIDTH, so y runs 0..0.63 on the 2000x1260 render. That is also
 *              the SVG viewBox, so these paste straight in with no conversion.
 *
 *   PLANS    — one entry per floor drawing: the image, and one PIN per unit.
 *              Pins, not traced room outlines: an outline traced off a drawing
 *              is never exact, and a highlight a few pixels off a wall looks
 *              sloppy in front of a customer. A dot in the middle of a room is
 *              unambiguous, and the drawing already labels every room.
 *              Pin x/y are fractions of the image width and height.
 *
 * HOW THE PINS ARE PRODUCED (2026-08-12)
 * The PDFs have no text layer, but the exported PNGs do not need one: the
 * drawings label every unit with a large, horizontal, zero-padded 3-digit
 * number ("018"), while every other annotation is either much smaller
 * ("AREA : 22.50 M2") or contains a decimal point ("208.00"). So the labels are
 * read straight off the raster with Tesseract and the pin is the centre of the
 * label. Font height alone separates unit numbers from everything else.
 *
 * Two traps worth keeping written down:
 *   1. Whole-page OCR silently DROPS scattered labels — on the SE drawing it
 *      lost 050, 052, 053, 054 and 056 while reading their neighbours at
 *      confidence 96. The page is OCR'd in overlapping tiles for that reason.
 *   2. Every building restarts at 001, so a bare number identifies nothing.
 *      A label only becomes a pin once its spatial cluster is matched against
 *      the unit count the LIVE SHEET reports for that building and floor, and
 *      the cluster's numbers are exactly 1..N with no duplicates. Anything
 *      short of that is reported, never filled in by guesswork.
 *
 * Building Q is complete and was checked by eye against the drawings, pin by
 * pin. M, O and R are NOT pinned yet — see the note on PLANS below.
 */

/* Building outlines on the render. Traced by the client 2026-08-12; letters
 * corrected by them the same day (the earlier guess was wrong by the cycle
 * Q->O->M->R->Q). Q is the C-shaped wing. */
const MASSING = {
  image: 'assets/render.jpg',
  viewBox: '0 0 1 0.63',
  buildings: {
    Q: [[.586,.123],[.571,.122],[.523,.112],[.539,.105],[.645,.079],[.663,.075],[.812,.098],[.811,.107],[.881,.116],[.803,.155],[.789,.157],[.724,.144],[.785,.116],[.686,.097]],
    M: [[.568,.211],[.636,.180],[.626,.179],[.659,.164],[.669,.164],[.676,.156],[.686,.158],[.706,.150],[.784,.168],[.700,.214],[.692,.212],[.674,.222],[.681,.224],[.654,.237],[.650,.238],[.643,.238],[.632,.237],[.614,.232],[.573,.219],[.573,.208]],
    O: [[.300,.435],[.505,.322],[.534,.305],[.595,.273],[.603,.265],[.589,.255],[.547,.238],[.534,.237],[.522,.237],[.510,.240],[.491,.249],[.402,.291],[.389,.286],[.374,.293],[.363,.287],[.329,.302],[.329,.313],[.317,.319],[.324,.326],[.284,.344],[.226,.371],[.215,.377],[.208,.387],[.218,.402],[.263,.434],[.275,.438],[.287,.438]],
    R: [[.186,.218],[.276,.192],[.270,.190],[.410,.149],[.415,.149],[.445,.140],[.446,.137],[.462,.132],[.476,.127],[.535,.142],[.434,.176],[.445,.181],[.312,.229],[.302,.224],[.225,.249],[.214,.252],[.197,.252],[.164,.238],[.150,.229],[.163,.221]],
  },
};

/* One entry per floor code. `image` is the drawing; `pins` maps a full unit
 * code to a point on it.
 *
 * ONLY BUILDING Q IS PINNED. The live sheet shows O and R are 100% sold and M
 * is 100% unsold (88 of 88) — an anomaly the client still has to confirm — so
 * Q is the only building with pins so far. Because the UI only ever shows
 * available units, this covers every Q unit a customer can currently be shown.
 * M, O and R can be produced by the same pipeline once M is confirmed.
 *
 * THE THIRD FLOOR IS REAL AND SELLABLE as of 2026-08-16 — it arrived in its own
 * workbook (see CONFIG.sheets), so the old note here saying no TH units exist is
 * gone. TH does not get its own pins: SE and TH are one drawing AND one plate,
 * so SE's are re-keyed onto it by the loop below the table.
 */
const PLANS = {
  SP: { image: 'assets/plans/SP.png', label: 'Sky Plaza', pins: {
    /* Building Q: the C-shaped wing. Top bar 042-055 over 056-065, the spine
       033-041 down the left, then the bottom bar 001-014 over 015-032.
       NOTE: the 26 pins placed here by hand on 2026-08-12 assumed the bottom
       bar was 13 units over 13. It is 14 over 18, so those pins drifted up to
       0.048 (about one and a half rooms) and pointed at the wrong units.
       They are replaced below by the values read off the drawing. */
    'QSP-042': [0.1560, 0.2965],
    'QSP-043': [0.1707, 0.2965],
    'QSP-044': [0.1829, 0.2965],
    'QSP-045': [0.1949, 0.2965],
    'QSP-046': [0.2060, 0.2965],
    'QSP-047': [0.2174, 0.2965],
    'QSP-048': [0.2296, 0.2965],
    'QSP-049': [0.2410, 0.2965],
    'QSP-050': [0.2512, 0.2965],
    'QSP-051': [0.2610, 0.2965],
    'QSP-052': [0.2708, 0.2965],
    'QSP-053': [0.2815, 0.2965],
    'QSP-054': [0.2941, 0.2965],
    'QSP-055': [0.3099, 0.2965],

    'QSP-041': [0.1697, 0.3407],

    'QSP-040': [0.1697, 0.3574],
    'QSP-065': [0.2022, 0.3617],
    'QSP-064': [0.2181, 0.3617],
    'QSP-063': [0.2301, 0.3617],
    'QSP-062': [0.2417, 0.3617],
    'QSP-061': [0.2508, 0.3617],
    'QSP-060': [0.2610, 0.3622],
    'QSP-059': [0.2702, 0.3617],
    'QSP-058': [0.2818, 0.3617],
    'QSP-057': [0.2932, 0.3617],
    'QSP-056': [0.3099, 0.3617],

    'QSP-039': [0.1909, 0.3968],

    'QSP-038': [0.1909, 0.4250],

    'QSP-037': [0.1909, 0.4558],

    'QSP-036': [0.1909, 0.4865],

    'QSP-035': [0.1694, 0.5199],
    'QSP-001': [0.2024, 0.5231],
    'QSP-002': [0.2170, 0.5230],
    'QSP-003': [0.2285, 0.5230],
    'QSP-004': [0.2402, 0.5230],
    'QSP-005': [0.2504, 0.5231],
    'QSP-006': [0.2612, 0.5230],
    'QSP-007': [0.2714, 0.5230],
    'QSP-008': [0.2835, 0.5230],
    'QSP-009': [0.2951, 0.5230],
    'QSP-010': [0.3061, 0.5230],
    'QSP-011': [0.3170, 0.5231],
    'QSP-012': [0.3284, 0.5230],
    'QSP-013': [0.3428, 0.5230],
    'QSP-014': [0.3613, 0.5230],

    'QSP-034': [0.1695, 0.5343],

    'QSP-033': [0.1695, 0.5486],

    'QSP-032': [0.1556, 0.5860],
    'QSP-031': [0.1695, 0.5865],
    'QSP-030': [0.1829, 0.5865],
    'QSP-029': [0.1952, 0.5865],
    'QSP-028': [0.2052, 0.5865],
    'QSP-027': [0.2163, 0.5865],
    'QSP-026': [0.2282, 0.5865],
    'QSP-025': [0.2399, 0.5865],
    'QSP-024': [0.2505, 0.5865],
    'QSP-023': [0.2610, 0.5865],
    'QSP-022': [0.2713, 0.5865],
    'QSP-021': [0.2832, 0.5865],
    'QSP-020': [0.2942, 0.5865],
    'QSP-019': [0.3059, 0.5865],
    'QSP-018': [0.3169, 0.5865],
    'QSP-017': [0.3287, 0.5865],
    'QSP-016': [0.3433, 0.5865],
    'QSP-015': [0.3619, 0.5865],
  } },

  FT: { image: 'assets/plans/FT.png', label: 'First Floor', pins: {
    /* 055 and 015 were missed by the tiled pass and recovered by re-OCRing
       their corner of the drawing at 4x; both came back at confidence 96 on a
       y that matches their row neighbours exactly. */
    'QFT-043': [0.1607, 0.2801],
    'QFT-044': [0.1742, 0.2801],
    'QFT-045': [0.1874, 0.2801],
    'QFT-046': [0.1981, 0.2801],
    'QFT-047': [0.2121, 0.2801],
    'QFT-048': [0.2251, 0.2801],
    'QFT-049': [0.2368, 0.2801],
    'QFT-050': [0.2472, 0.2801],
    'QFT-051': [0.2586, 0.2801],
    'QFT-052': [0.2685, 0.2801],
    'QFT-053': [0.2806, 0.2801],
    'QFT-054': [0.2940, 0.2801],
    'QFT-055': [0.3107, 0.2801],

    'QFT-042': [0.1430, 0.2880],

    'QFT-041': [0.1513, 0.3470],
    'QFT-064': [0.2087, 0.3521],
    'QFT-063': [0.2252, 0.3521],
    'QFT-062': [0.2366, 0.3521],
    'QFT-061': [0.2469, 0.3521],
    'QFT-060': [0.2573, 0.3521],
    'QFT-059': [0.2686, 0.3521],
    'QFT-058': [0.2809, 0.3521],
    'QFT-057': [0.2940, 0.3521],
    'QFT-056': [0.3108, 0.3521],

    'QFT-040': [0.1749, 0.3966],

    'QFT-039': [0.1749, 0.4278],

    'QFT-038': [0.1749, 0.4602],

    'QFT-037': [0.1749, 0.4930],

    'QFT-036': [0.1435, 0.5221],
    'QFT-001': [0.1789, 0.5221],

    'QFT-035': [0.1488, 0.5325],
    'QFT-002': [0.2061, 0.5365],
    'QFT-003': [0.2236, 0.5365],
    'QFT-004': [0.2352, 0.5365],
    'QFT-005': [0.2463, 0.5365],
    'QFT-006': [0.2583, 0.5365],
    'QFT-007': [0.2699, 0.5365],
    'QFT-008': [0.2829, 0.5365],
    'QFT-009': [0.2944, 0.5365],
    'QFT-010': [0.3074, 0.5365],
    'QFT-011': [0.3191, 0.5365],
    'QFT-012': [0.3321, 0.5365],
    'QFT-013': [0.3471, 0.5365],
    'QFT-014': [0.3677, 0.5365],

    'QFT-034': [0.1488, 0.5470],

    'QFT-033': [0.1488, 0.5624],

    'QFT-032': [0.1418, 0.6074],
    'QFT-031': [0.1591, 0.6074],
    'QFT-030': [0.1732, 0.6074],
    'QFT-029': [0.1856, 0.6074],
    'QFT-028': [0.1965, 0.6074],
    'QFT-027': [0.2090, 0.6074],
    'QFT-026': [0.2225, 0.6074],
    'QFT-025': [0.2350, 0.6074],
    'QFT-024': [0.2462, 0.6074],
    'QFT-023': [0.2581, 0.6074],
    'QFT-022': [0.2703, 0.6074],
    'QFT-021': [0.2830, 0.6074],
    'QFT-020': [0.2951, 0.6074],
    'QFT-019': [0.3074, 0.6074],
    'QFT-018': [0.3185, 0.6074],
    'QFT-017': [0.3313, 0.6074],
    'QFT-016': [0.3468, 0.6074],
    'QFT-015': [0.3677, 0.6074],
  } },

  SE: { image: 'assets/plans/SETH.png', label: 'Second Floor',
        sharedWith: 'TH', patchLabel: true, pins: {
    /* On this floor Q closes into a full ring around the courtyard rather than
       the C of the floors below. 050-060 run down the left spine. */
    'QSE-049': [0.1387, 0.2581],
    'QSE-048': [0.1560, 0.2579],
    'QSE-047': [0.1693, 0.2580],
    'QSE-046': [0.1817, 0.2579],
    'QSE-045': [0.1933, 0.2581],
    'QSE-044': [0.2064, 0.2579],
    'QSE-043': [0.2193, 0.2580],
    'QSE-042': [0.2315, 0.2580],
    'QSE-041': [0.2425, 0.2580],
    'QSE-040': [0.2535, 0.2579],
    'QSE-039': [0.2639, 0.2580],
    'QSE-038': [0.2756, 0.2580],
    'QSE-037': [0.2889, 0.2580],
    'QSE-036': [0.3075, 0.2580],

    'QSE-050': [0.1387, 0.3001],

    'QSE-051': [0.1387, 0.3146],

    'QSE-052': [0.1387, 0.3319],
    'QSE-026': [0.1911, 0.3274],
    'QSE-027': [0.2065, 0.3274],
    'QSE-028': [0.2203, 0.3274],
    'QSE-029': [0.2320, 0.3274],
    'QSE-030': [0.2419, 0.3274],
    'QSE-031': [0.2529, 0.3274],
    'QSE-032': [0.2644, 0.3274],
    'QSE-033': [0.2756, 0.3274],
    'QSE-034': [0.2895, 0.3274],
    'QSE-035': [0.3075, 0.3274],

    'QSE-025': [0.1757, 0.3491],

    'QSE-053': [0.1387, 0.3689],
    'QSE-024': [0.1757, 0.3673],

    'QSE-054': [0.1388, 0.3838],
    'QSE-023': [0.1757, 0.3823],

    'QSE-055': [0.1387, 0.3994],
    'QSE-022': [0.1756, 0.3961],

    'QSE-056': [0.1387, 0.4159],
    'QSE-021': [0.1757, 0.4132],

    'QSE-057': [0.1387, 0.4337],
    'QSE-020': [0.1757, 0.4298],

    'QSE-058': [0.1387, 0.4499],
    'QSE-019': [0.1757, 0.4471],

    'QSE-059': [0.1387, 0.4659],
    'QSE-018': [0.1757, 0.4641],

    'QSE-060': [0.1387, 0.4792],
    'QSE-017': [0.1757, 0.4775],

    'QSE-016': [0.1757, 0.4903],

    'QSE-015': [0.1757, 0.5032],

    'QSE-014': [0.1889, 0.5142],
    'QSE-013': [0.2032, 0.5142],
    'QSE-012': [0.2171, 0.5141],
    'QSE-011': [0.2300, 0.5142],
    'QSE-010': [0.2414, 0.5141],
    'QSE-009': [0.2530, 0.5142],
    'QSE-008': [0.2645, 0.5141],
    'QSE-007': [0.2771, 0.5142],
    'QSE-006': [0.2899, 0.5141],
    'QSE-005': [0.3019, 0.5142],
    'QSE-004': [0.3133, 0.5142],
    'QSE-003': [0.3260, 0.5142],
    'QSE-002': [0.3412, 0.5141],
    'QSE-001': [0.3629, 0.5141],

    'QSE-061': [0.1383, 0.5835],
    'QSE-062': [0.1543, 0.5835],
    'QSE-063': [0.1680, 0.5835],
    'QSE-064': [0.1815, 0.5835],
    'QSE-065': [0.1918, 0.5835],
    'QSE-066': [0.2047, 0.5835],
    'QSE-067': [0.2170, 0.5835],
    'QSE-068': [0.2303, 0.5835],
    'QSE-069': [0.2414, 0.5835],
    'QSE-070': [0.2535, 0.5835],
    'QSE-071': [0.2643, 0.5835],
    'QSE-072': [0.2774, 0.5835],
    'QSE-073': [0.2900, 0.5836],
    'QSE-074': [0.3012, 0.5835],
    'QSE-075': [0.3131, 0.5835],
    'QSE-076': [0.3267, 0.5835],
    'QSE-077': [0.3421, 0.5835],
    'QSE-078': [0.3631, 0.5835],
  } },

  TH: { image: 'assets/plans/SETH.png', label: 'Third Floor', pins: {},
        sharedWith: 'SE', patchLabel: true },
};

/* Re-key a shared floor's pins from the floor it shares its drawing with.
 *
 * `sharedWith` sat here as inert data until 2026-08-16 — nothing read it — which
 * was harmless only while TH had no inventory. It has 182 units now.
 *
 * Transferring the pins is sound because SE and TH are not merely one drawing,
 * they are one PLATE. Checked against both live workbooks: the two floors carry
 * the same 182 unit numbers, with identical areas and identical types, zero
 * exceptions. So the point marking QSE-050 is the point that marks QTH-050.
 * Re-keyed here rather than pasted into the table so the two floors cannot
 * drift apart when a pin is corrected.
 *
 * A floor that has its own pins is left alone, which is also what stops SE and
 * TH copying from each other forever — they name each other. */
for (const [floorCode, plan] of Object.entries(PLANS)) {
  const source = plan.sharedWith && PLANS[plan.sharedWith];
  if (!source || Object.keys(plan.pins).length) continue;
  for (const [unitCode, xy] of Object.entries(source.pins)) {
    plan.pins[unitCode.replace(`${plan.sharedWith}-`, `${floorCode}-`)] = xy;
  }
}

/** Every pin placed so far, for the "is this floor ready?" check in the UI. */
function pinCount(floorCode) {
  const p = PLANS[floorCode];
  return p ? Object.keys(p.pins).length : 0;
}

if (typeof module !== 'undefined') module.exports = { MASSING, PLANS, pinCount };
