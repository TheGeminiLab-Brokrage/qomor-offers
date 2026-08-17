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
 *
 * THE DRAWINGS WERE REPLACED 2026-08-16 with the client's own composed plans:
 * the same plates rendered onto the aerial photograph, 2412x1180 instead of the
 * old 4967x3509 A1 sheets with their title blocks and margins. The unit
 * numbering is identical — verified wing by wing against the live inventory
 * (SP 65/32/30/50, FT 64/29/29/49, SE-TH 78/27/28/49).
 *
 * The 207 pins were NOT re-traced. Re-running OCR on the new drawings reads
 * badly (122 of 182 labels on SE — the photographic background defeats the
 * layout analysis where the old white sheets were clean), and re-tracing would
 * also have thrown away the by-eye verification the old pins already carried.
 * Instead each pin was TRANSFORMED: OCR supplied enough matches to fit a
 * scale-and-offset per axis, and the verified coordinates were mapped through
 * it. Residuals came out at 1.8-3.3px in x and 0.1-7.3px in y on a drawing
 * whose rooms are about 30px wide, and all three floors were then checked by
 * eye with overlay.ps1 — every pin on its own printed number.
 *
 * One transform PER WING, not one per drawing: a whole-page fit missed by 74px
 * because the four wings were repositioned independently when the plate was
 * composed onto the render. If these drawings are ever replaced again, fit per
 * wing and check the residuals before trusting the result.
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
  SP: { image: 'assets/plans/SP.jpg', label: 'Sky Plaza', pins: {
    /* Building Q: the C-shaped wing. Top bar 042-055 over 056-065, the spine
       033-041 down the left, then the bottom bar 001-014 over 015-032.
       NOTE: the 26 pins placed here by hand on 2026-08-12 assumed the bottom
       bar was 13 units over 13. It is 14 over 18, so those pins drifted up to
       0.048 (about one and a half rooms) and pointed at the wrong units.
       They are replaced below by the values read off the drawing. */
    'QSP-042': [0.0764, 0.2069],
    'QSP-043': [0.0941, 0.2069],
    'QSP-044': [0.1088, 0.2069],
    'QSP-045': [0.1233, 0.2069],
    'QSP-046': [0.1367, 0.2069],
    'QSP-047': [0.1504, 0.2069],
    'QSP-048': [0.1652, 0.2069],
    'QSP-049': [0.1789, 0.2069],
    'QSP-050': [0.1912, 0.2069],
    'QSP-051': [0.2030, 0.2069],
    'QSP-052': [0.2148, 0.2069],
    'QSP-053': [0.2278, 0.2069],
    'QSP-054': [0.2429, 0.2069],
    'QSP-055': [0.2620, 0.2069],

    'QSP-041': [0.0929, 0.2839],

    'QSP-040': [0.0929, 0.3130],
    'QSP-065': [0.1321, 0.3205],
    'QSP-064': [0.1513, 0.3205],
    'QSP-063': [0.1658, 0.3205],
    'QSP-062': [0.1798, 0.3205],
    'QSP-061': [0.1907, 0.3205],
    'QSP-060': [0.2030, 0.3213],
    'QSP-059': [0.2141, 0.3205],
    'QSP-058': [0.2281, 0.3205],
    'QSP-057': [0.2419, 0.3205],
    'QSP-056': [0.2620, 0.3205],

    'QSP-039': [0.1185, 0.3816],

    'QSP-038': [0.1185, 0.4307],

    'QSP-037': [0.1185, 0.4843],

    'QSP-036': [0.1185, 0.5378],

    'QSP-035': [0.0926, 0.5960],
    'QSP-001': [0.1324, 0.6015],
    'QSP-002': [0.1500, 0.6013],
    'QSP-003': [0.1638, 0.6013],
    'QSP-004': [0.1779, 0.6013],
    'QSP-005': [0.1902, 0.6015],
    'QSP-006': [0.2033, 0.6013],
    'QSP-007': [0.2156, 0.6013],
    'QSP-008': [0.2302, 0.6013],
    'QSP-009': [0.2442, 0.6013],
    'QSP-010': [0.2574, 0.6013],
    'QSP-011': [0.2706, 0.6015],
    'QSP-012': [0.2843, 0.6013],
    'QSP-013': [0.3017, 0.6013],
    'QSP-014': [0.3240, 0.6013],

    'QSP-034': [0.0927, 0.6210],

    'QSP-033': [0.0927, 0.6459],

    'QSP-032': [0.0759, 0.7111],
    'QSP-031': [0.0927, 0.7119],
    'QSP-030': [0.1088, 0.7119],
    'QSP-029': [0.1237, 0.7119],
    'QSP-028': [0.1357, 0.7119],
    'QSP-027': [0.1491, 0.7119],
    'QSP-026': [0.1635, 0.7119],
    'QSP-025': [0.1776, 0.7119],
    'QSP-024': [0.1904, 0.7119],
    'QSP-023': [0.2030, 0.7119],
    'QSP-022': [0.2155, 0.7119],
    'QSP-021': [0.2298, 0.7119],
    'QSP-020': [0.2431, 0.7119],
    'QSP-019': [0.2572, 0.7119],
    'QSP-018': [0.2704, 0.7119],
    'QSP-017': [0.2847, 0.7119],
    'QSP-016': [0.3023, 0.7119],
    'QSP-015': [0.3247, 0.7119],

    /* Buildings M, O and R placed by hand in the pin tool 2026-08-17, then
       straightened: each row snapped to its median y so a row of units reads
       as one line. x is untouched — rooms are not evenly wide, and forcing x
       onto a grid walks pins out of their rooms.

       O carried an off-by-one: 005 and 006 were clicked on the same point, so
       every later label sat one room left of the unit it named. Corrected
       against the printed numbers, which is why OSP-023 is absent — the drift
       meant nothing was ever clicked in it. It is left unplaced rather than
       guessed. Verified by eye on the drawing, wing by wing. */
    'MSP-001': [0.5544, 0.294],
    'MSP-002': [0.5344, 0.294],
    'MSP-003': [0.5211, 0.294],
    'MSP-004': [0.5078, 0.294],
    'MSP-005': [0.4944, 0.294],
    'MSP-006': [0.4811, 0.294],
    'MSP-007': [0.4689, 0.294],
    'MSP-008': [0.4544, 0.294],
    'MSP-009': [0.4411, 0.294],
    'MSP-010': [0.4278, 0.294],
    'MSP-011': [0.4144, 0.294],
    'MSP-012': [0.3789, 0.294],
    'MSP-013': [0.3678, 0.294],
    'MSP-014': [0.3567, 0.294],
    'MSP-015': [0.3433, 0.294],
    'MSP-016': [0.3256, 0.294],
    'MSP-017': [0.3267, 0.2306],
    'MSP-018': [0.3433, 0.2306],
    'MSP-019': [0.3556, 0.2306],
    'MSP-020': [0.3667, 0.2306],
    'MSP-021': [0.38, 0.2306],
    'MSP-022': [0.3922, 0.2306],
    'MSP-023': [0.4056, 0.2306],
    'MSP-024': [0.4178, 0.2306],
    'MSP-025': [0.4278, 0.2306],
    'MSP-026': [0.44, 0.2306],
    'MSP-027': [0.4544, 0.2306],
    'MSP-028': [0.4933, 0.2306],
    'MSP-029': [0.5056, 0.2306],
    'MSP-030': [0.5211, 0.2306],
    'MSP-031': [0.5356, 0.2306],
    'MSP-032': [0.5522, 0.2306],
    'OSP-001': [0.8456, 0.294],
    'OSP-002': [0.8156, 0.294],
    'OSP-003': [0.8022, 0.294],
    'OSP-004': [0.7689, 0.294],
    'OSP-005': [0.7511, 0.294],
    'OSP-006': [0.74, 0.294],
    'OSP-007': [0.7267, 0.294],
    'OSP-008': [0.7133, 0.294],
    'OSP-009': [0.7, 0.294],
    'OSP-010': [0.6867, 0.294],
    'OSP-011': [0.6756, 0.294],
    'OSP-012': [0.66, 0.294],
    'OSP-013': [0.65, 0.294],
    'OSP-014': [0.63, 0.294],
    'OSP-015': [0.6289, 0.2238],
    'OSP-016': [0.65, 0.2238],
    'OSP-017': [0.6633, 0.2238],
    'OSP-018': [0.6756, 0.2238],
    'OSP-019': [0.6889, 0.2238],
    'OSP-020': [0.7267, 0.2238],
    'OSP-021': [0.74, 0.2238],
    'OSP-022': [0.7522, 0.2238],
    'OSP-024': [0.7789, 0.2238],
    'OSP-025': [0.7922, 0.2238],
    'OSP-026': [0.8044, 0.2238],
    'OSP-027': [0.8178, 0.2238],
    'OSP-028': [0.8289, 0.2238],
    'OSP-029': [0.8411, 0.2238],
    'OSP-030': [0.86, 0.2238],
    'RSP-001': [0.4233, 0.625],
    'RSP-002': [0.4411, 0.625],
    'RSP-003': [0.4544, 0.625],
    'RSP-004': [0.4678, 0.625],
    'RSP-005': [0.4811, 0.625],
    'RSP-006': [0.4956, 0.625],
    'RSP-007': [0.5078, 0.625],
    'RSP-008': [0.5211, 0.625],
    'RSP-009': [0.5344, 0.625],
    'RSP-010': [0.5478, 0.625],
    'RSP-011': [0.5611, 0.625],
    'RSP-012': [0.5711, 0.625],
    'RSP-013': [0.5833, 0.625],
    'RSP-014': [0.5967, 0.625],
    'RSP-015': [0.61, 0.625],
    'RSP-016': [0.6233, 0.625],
    'RSP-017': [0.6367, 0.625],
    'RSP-018': [0.65, 0.625],
    'RSP-019': [0.6633, 0.625],
    'RSP-020': [0.6767, 0.625],
    'RSP-021': [0.6933, 0.625],
    'RSP-022': [0.7267, 0.625],
    'RSP-023': [0.7411, 0.625],
    'RSP-024': [0.7711, 0.625],
    'RSP-025': [0.7844, 0.684],
    'RSP-026': [0.7656, 0.684],
    'RSP-027': [0.7522, 0.684],
    'RSP-028': [0.7389, 0.684],
    'RSP-029': [0.7278, 0.684],
    'RSP-030': [0.7144, 0.684],
    'RSP-031': [0.7022, 0.684],
    'RSP-032': [0.69, 0.684],
    'RSP-033': [0.6756, 0.684],
    'RSP-034': [0.6622, 0.684],
    'RSP-035': [0.65, 0.684],
    'RSP-036': [0.6367, 0.684],
    'RSP-037': [0.6233, 0.684],
    'RSP-038': [0.61, 0.684],
    'RSP-039': [0.5967, 0.684],
    'RSP-040': [0.5833, 0.684],
    'RSP-041': [0.5722, 0.684],
    'RSP-042': [0.5611, 0.684],
    'RSP-043': [0.5478, 0.684],
    'RSP-044': [0.5356, 0.684],
    'RSP-045': [0.5211, 0.684],
    'RSP-046': [0.4811, 0.684],
    'RSP-047': [0.4678, 0.684],
    'RSP-048': [0.4544, 0.684],
    'RSP-049': [0.4411, 0.684],
    'RSP-050': [0.4233, 0.684],
  } },

  FT: { image: 'assets/plans/FT.jpg', label: 'First Floor', pins: {
    /* All four buildings, placed by hand in the pin tool 2026-08-17 and then
       straightened: runs of CONSECUTIVE unit numbers at a steady y are rows and
       snap to their median; x is untouched. Grouping by number rather than by y
       matters here — Q's vertical spine (033-042) sits at almost exactly the
       bottom row's y, and clustering on y alone pulled it into that row.

       Checked against the verified OCR pins for Q: 61 of 64 within 50px, the
       other three being the wide spine rooms where the click landed left of the
       label. Every wing then checked by eye on the drawing.

       RFT-023/024/025 were pulled onto the top row deliberately: they sit past
       the stair so they break the consecutive run, but their printed numbers are
       on that line. */
    'MFT-001': [0.5463, 0.2985],
    'MFT-002': [0.5296, 0.2985],
    'MFT-003': [0.5148, 0.2985],
    'MFT-004': [0.5019, 0.2985],
    'MFT-005': [0.4889, 0.2985],
    'MFT-006': [0.4759, 0.2985],
    'MFT-007': [0.463, 0.2985],
    'MFT-008': [0.45, 0.2985],
    'MFT-009': [0.4389, 0.2985],
    'MFT-010': [0.4241, 0.2985],
    'MFT-011': [0.413, 0.2985],
    'MFT-012': [0.3944, 0.2985],
    'MFT-013': [0.3593, 0.2985],
    'MFT-014': [0.3426, 0.2985],
    'MFT-015': [0.3259, 0.2985],
    'MFT-016': [0.3259, 0.2344],
    'MFT-017': [0.3444, 0.2344],
    'MFT-018': [0.3537, 0.2344],
    'MFT-019': [0.3648, 0.2344],
    'MFT-020': [0.3759, 0.2344],
    'MFT-021': [0.3889, 0.2344],
    'MFT-022': [0.4019, 0.2344],
    'MFT-023': [0.4148, 0.2344],
    'MFT-024': [0.4259, 0.2344],
    'MFT-025': [0.4389, 0.2344],
    'MFT-026': [0.4519, 0.2344],
    'MFT-027': [0.4981, 0.2344],
    'MFT-028': [0.5278, 0.2344],
    'MFT-029': [0.5481, 0.2344],
    'OFT-001': [0.8463, 0.2985],
    'OFT-002': [0.8296, 0.2985],
    'OFT-003': [0.8148, 0.2985],
    'OFT-004': [0.7778, 0.2985],
    'OFT-005': [0.7593, 0.2985],
    'OFT-006': [0.7426, 0.2985],
    'OFT-007': [0.7296, 0.2985],
    'OFT-008': [0.7148, 0.2985],
    'OFT-009': [0.7056, 0.2985],
    'OFT-010': [0.6907, 0.2985],
    'OFT-011': [0.6778, 0.2985],
    'OFT-012': [0.6648, 0.2985],
    'OFT-013': [0.6556, 0.2985],
    'OFT-014': [0.6407, 0.2985],
    'OFT-015': [0.6222, 0.2985],
    'OFT-016': [0.6222, 0.2306],
    'OFT-017': [0.6389, 0.2306],
    'OFT-018': [0.6537, 0.2306],
    'OFT-019': [0.7148, 0.2306],
    'OFT-020': [0.7296, 0.2306],
    'OFT-021': [0.7407, 0.2306],
    'OFT-022': [0.7519, 0.2306],
    'OFT-023': [0.7667, 0.2306],
    'OFT-024': [0.7778, 0.2306],
    'OFT-025': [0.7907, 0.2306],
    'OFT-026': [0.8037, 0.2306],
    'OFT-027': [0.8167, 0.2306],
    'OFT-028': [0.8278, 0.2306],
    'OFT-029': [0.8463, 0.2306],
    'QFT-001': [0.1185, 0.6306],
    'QFT-002': [0.15, 0.6306],
    'QFT-003': [0.1667, 0.6306],
    'QFT-004': [0.1796, 0.6306],
    'QFT-005': [0.1944, 0.6306],
    'QFT-006': [0.2056, 0.6306],
    'QFT-007': [0.2204, 0.6306],
    'QFT-008': [0.2333, 0.6306],
    'QFT-009': [0.2444, 0.6306],
    'QFT-010': [0.2574, 0.6306],
    'QFT-011': [0.2704, 0.6306],
    'QFT-012': [0.2852, 0.6306],
    'QFT-013': [0.3019, 0.6306],
    'QFT-014': [0.3241, 0.6306],
    'QFT-015': [0.3259, 0.6947],
    'QFT-016': [0.3019, 0.6947],
    'QFT-017': [0.2852, 0.6947],
    'QFT-018': [0.2704, 0.6947],
    'QFT-019': [0.2574, 0.6947],
    'QFT-020': [0.2444, 0.6947],
    'QFT-021': [0.2315, 0.6947],
    'QFT-022': [0.2185, 0.6947],
    'QFT-023': [0.2056, 0.6947],
    'QFT-024': [0.1944, 0.6947],
    'QFT-025': [0.1815, 0.6947],
    'QFT-026': [0.1667, 0.6947],
    'QFT-027': [0.1519, 0.6947],
    'QFT-028': [0.1389, 0.6947],
    'QFT-029': [0.1278, 0.6947],
    'QFT-030': [0.1148, 0.6947],
    'QFT-031': [0.1, 0.6947],
    'QFT-032': [0.0796, 0.6947],
    'QFT-033': [0.0759, 0.6419],
    'QFT-034': [0.0759, 0.6193],
    'QFT-035': [0.0759, 0.5929],
    'QFT-036': [0.0759, 0.574],
    'QFT-037': [0.0963, 0.5363],
    'QFT-038': [0.0926, 0.4834],
    'QFT-039': [0.0926, 0.4344],
    'QFT-040': [0.0926, 0.3853],
    'QFT-041': [0.0907, 0.3136],
    'QFT-042': [0.0815, 0.2532],
    'QFT-043': [0.1, 0.2344],
    'QFT-044': [0.1148, 0.2344],
    'QFT-045': [0.1278, 0.2344],
    'QFT-046': [0.1407, 0.2344],
    'QFT-047': [0.1556, 0.2344],
    'QFT-048': [0.1704, 0.2344],
    'QFT-049': [0.1833, 0.2344],
    'QFT-050': [0.1944, 0.2344],
    'QFT-051': [0.2037, 0.2344],
    'QFT-052': [0.2167, 0.2344],
    'QFT-053': [0.2315, 0.2344],
    'QFT-054': [0.2444, 0.2344],
    'QFT-055': [0.2648, 0.2344],
    'QFT-056': [0.2648, 0.2947],
    'QFT-057': [0.2444, 0.2947],
    'QFT-058': [0.2296, 0.2947],
    'QFT-059': [0.2167, 0.2947],
    'QFT-060': [0.2037, 0.2947],
    'QFT-061': [0.1944, 0.2947],
    'QFT-062': [0.1833, 0.2947],
    'QFT-063': [0.1704, 0.2947],
    'QFT-064': [0.1519, 0.2947],
    'RFT-001': [0.4296, 0.6306],
    'RFT-002': [0.4444, 0.6306],
    'RFT-003': [0.4574, 0.6306],
    'RFT-004': [0.4722, 0.6306],
    'RFT-005': [0.4852, 0.6306],
    'RFT-006': [0.4981, 0.6306],
    'RFT-007': [0.5111, 0.6306],
    'RFT-008': [0.5241, 0.6306],
    'RFT-009': [0.5389, 0.6306],
    'RFT-010': [0.5481, 0.6306],
    'RFT-011': [0.5611, 0.6306],
    'RFT-012': [0.5722, 0.6306],
    'RFT-013': [0.5833, 0.6306],
    'RFT-014': [0.6, 0.6306],
    'RFT-015': [0.613, 0.6306],
    'RFT-016': [0.6241, 0.6306],
    'RFT-017': [0.6389, 0.6306],
    'RFT-018': [0.6481, 0.6306],
    'RFT-019': [0.663, 0.6306],
    'RFT-020': [0.6722, 0.6306],
    'RFT-021': [0.6852, 0.6306],
    'RFT-022': [0.7056, 0.6306],
    'RFT-023': [0.7352, 0.6306],
    'RFT-024': [0.763, 0.6306],
    'RFT-025': [0.7815, 0.6306],
    'RFT-026': [0.7796, 0.6872],
    'RFT-027': [0.763, 0.6872],
    'RFT-028': [0.7481, 0.6872],
    'RFT-029': [0.737, 0.6872],
    'RFT-030': [0.7241, 0.6872],
    'RFT-031': [0.713, 0.6872],
    'RFT-032': [0.7, 0.6872],
    'RFT-033': [0.687, 0.6872],
    'RFT-034': [0.6759, 0.6872],
    'RFT-035': [0.6593, 0.6872],
    'RFT-036': [0.6463, 0.6872],
    'RFT-037': [0.6352, 0.6872],
    'RFT-038': [0.6241, 0.6872],
    'RFT-039': [0.6111, 0.6872],
    'RFT-040': [0.6, 0.6872],
    'RFT-041': [0.5852, 0.6872],
    'RFT-042': [0.5741, 0.6872],
    'RFT-043': [0.563, 0.6872],
    'RFT-044': [0.5519, 0.6872],
    'RFT-045': [0.5407, 0.6872],
    'RFT-046': [0.5259, 0.6872],
    'RFT-047': [0.4593, 0.6872],
    'RFT-048': [0.4463, 0.6872],
    'RFT-049': [0.4296, 0.6872],
  } },

  SE: { image: 'assets/plans/SETH.jpg', label: 'Second Floor',
        sharedWith: 'TH', patchLabel: true, pins: {
    /* On this floor Q closes into a full ring around the courtyard rather than
       the C of the floors below: 015-025 run down the inner spine and 050-060
       down the outer one, so two vertical runs sit beside two long rows.

       All four buildings placed by hand in the pin tool 2026-08-17, then rows
       straightened by consecutive-number run (see the FT note for why not by
       y). Complete, no duplicates, checked by eye wing by wing.

       THE THIRD FLOOR NEEDS NOTHING: TH shares this drawing AND this numbering,
       so the loop under the table re-keys every pin here onto TH. Adding a pin
       here adds it there. */
    'MSE-001': [0.55, 0.2947],
    'MSE-002': [0.5333, 0.2947],
    'MSE-003': [0.5148, 0.2947],
    'MSE-004': [0.5037, 0.2947],
    'MSE-005': [0.4907, 0.2947],
    'MSE-006': [0.4778, 0.2947],
    'MSE-007': [0.463, 0.2947],
    'MSE-008': [0.45, 0.2947],
    'MSE-009': [0.437, 0.2947],
    'MSE-010': [0.3574, 0.2947],
    'MSE-011': [0.3426, 0.2947],
    'MSE-012': [0.3222, 0.2947],
    'MSE-013': [0.3222, 0.223],
    'MSE-014': [0.3426, 0.223],
    'MSE-015': [0.3537, 0.223],
    'MSE-016': [0.363, 0.223],
    'MSE-017': [0.3759, 0.223],
    'MSE-018': [0.3889, 0.223],
    'MSE-019': [0.4019, 0.223],
    'MSE-020': [0.413, 0.223],
    'MSE-021': [0.4241, 0.223],
    'MSE-022': [0.437, 0.223],
    'MSE-023': [0.4537, 0.223],
    'MSE-024': [0.4741, 0.223],
    'MSE-025': [0.5056, 0.223],
    'MSE-026': [0.5315, 0.223],
    'MSE-027': [0.55, 0.223],
    'OSE-001': [0.8537, 0.2947],
    'OSE-002': [0.8352, 0.2947],
    'OSE-003': [0.8222, 0.2947],
    'OSE-004': [0.7444, 0.2947],
    'OSE-005': [0.7352, 0.2947],
    'OSE-006': [0.7222, 0.2947],
    'OSE-007': [0.7093, 0.2947],
    'OSE-008': [0.6944, 0.2947],
    'OSE-009': [0.6833, 0.2947],
    'OSE-010': [0.6704, 0.2947],
    'OSE-011': [0.6574, 0.2947],
    'OSE-012': [0.6463, 0.2947],
    'OSE-013': [0.6278, 0.2947],
    'OSE-014': [0.6259, 0.2268],
    'OSE-015': [0.6444, 0.2268],
    'OSE-016': [0.6704, 0.2268],
    'OSE-017': [0.6981, 0.2268],
    'OSE-018': [0.7222, 0.2268],
    'OSE-019': [0.7333, 0.2268],
    'OSE-020': [0.7463, 0.2268],
    'OSE-021': [0.7593, 0.2268],
    'OSE-022': [0.7722, 0.2268],
    'OSE-023': [0.7852, 0.2268],
    'OSE-024': [0.7981, 0.2268],
    'OSE-025': [0.8093, 0.2268],
    'OSE-026': [0.8241, 0.2268],
    'OSE-027': [0.8352, 0.2268],
    'OSE-028': [0.8537, 0.2268],
    'QSE-001': [0.3222, 0.6306],
    'QSE-002': [0.2981, 0.6306],
    'QSE-003': [0.2833, 0.6306],
    'QSE-004': [0.2685, 0.6306],
    'QSE-005': [0.2537, 0.6306],
    'QSE-006': [0.2407, 0.6306],
    'QSE-007': [0.2278, 0.6306],
    'QSE-008': [0.213, 0.6306],
    'QSE-009': [0.2019, 0.6306],
    'QSE-010': [0.1889, 0.6306],
    'QSE-011': [0.1759, 0.6306],
    'QSE-012': [0.163, 0.6306],
    'QSE-013': [0.1481, 0.6306],
    'QSE-014': [0.1315, 0.6306],
    'QSE-015': [0.1037, 0.608],
    'QSE-016': [0.1037, 0.5702],
    'QSE-017': [0.1037, 0.5476],
    'QSE-018': [0.1037, 0.5249],
    'QSE-019': [0.1037, 0.5023],
    'QSE-020': [0.1037, 0.4721],
    'QSE-021': [0.1037, 0.4457],
    'QSE-022': [0.1019, 0.4193],
    'QSE-023': [0.1037, 0.3966],
    'QSE-024': [0.1037, 0.3702],
    'QSE-025': [0.1148, 0.3325],
    'QSE-026': [0.1315, 0.2872],
    'QSE-027': [0.15, 0.2872],
    'QSE-028': [0.1648, 0.2872],
    'QSE-029': [0.1778, 0.2872],
    'QSE-030': [0.1889, 0.2872],
    'QSE-031': [0.2, 0.2872],
    'QSE-032': [0.213, 0.2872],
    'QSE-033': [0.2278, 0.2872],
    'QSE-034': [0.2426, 0.2872],
    'QSE-035': [0.2648, 0.2872],
    'QSE-036': [0.2611, 0.2306],
    'QSE-037': [0.2407, 0.2306],
    'QSE-038': [0.2259, 0.2306],
    'QSE-039': [0.213, 0.2306],
    'QSE-040': [0.2019, 0.2306],
    'QSE-041': [0.1907, 0.2306],
    'QSE-042': [0.1778, 0.2306],
    'QSE-043': [0.1648, 0.2306],
    'QSE-044': [0.1519, 0.2306],
    'QSE-045': [0.137, 0.2306],
    'QSE-046': [0.1241, 0.2306],
    'QSE-047': [0.1093, 0.2306],
    'QSE-048': [0.0944, 0.2306],
    'QSE-049': [0.0759, 0.2306],
    'QSE-050': [0.0759, 0.2645],
    'QSE-051': [0.0759, 0.291],
    'QSE-052': [0.0759, 0.3211],
    'QSE-053': [0.0759, 0.3778],
    'QSE-054': [0.0759, 0.3966],
    'QSE-055': [0.0759, 0.4193],
    'QSE-056': [0.0759, 0.4457],
    'QSE-057': [0.0759, 0.4683],
    'QSE-058': [0.0759, 0.5023],
    'QSE-059': [0.0759, 0.5287],
    'QSE-060': [0.0759, 0.5513],
    'QSE-061': [0.0759, 0.6947],
    'QSE-062': [0.0944, 0.6947],
    'QSE-063': [0.1093, 0.6947],
    'QSE-064': [0.1222, 0.6947],
    'QSE-065': [0.1352, 0.6947],
    'QSE-066': [0.1481, 0.6947],
    'QSE-067': [0.163, 0.6947],
    'QSE-068': [0.1778, 0.6947],
    'QSE-069': [0.1907, 0.6947],
    'QSE-070': [0.2037, 0.6947],
    'QSE-071': [0.2167, 0.6947],
    'QSE-072': [0.2296, 0.6947],
    'QSE-073': [0.2426, 0.6947],
    'QSE-074': [0.2556, 0.6947],
    'QSE-075': [0.2667, 0.6947],
    'QSE-076': [0.2833, 0.6947],
    'QSE-077': [0.3, 0.6947],
    'QSE-078': [0.3241, 0.6947],
    'RSE-001': [0.4296, 0.6268],
    'RSE-002': [0.4481, 0.6268],
    'RSE-003': [0.463, 0.6268],
    'RSE-004': [0.4759, 0.6268],
    'RSE-005': [0.487, 0.6268],
    'RSE-006': [0.5, 0.6268],
    'RSE-007': [0.5148, 0.6268],
    'RSE-008': [0.5278, 0.6268],
    'RSE-009': [0.5426, 0.6268],
    'RSE-010': [0.5537, 0.6268],
    'RSE-011': [0.5667, 0.6268],
    'RSE-012': [0.5778, 0.6268],
    'RSE-013': [0.5889, 0.6268],
    'RSE-014': [0.6019, 0.6268],
    'RSE-015': [0.6167, 0.6268],
    'RSE-016': [0.6278, 0.6268],
    'RSE-017': [0.6407, 0.6268],
    'RSE-018': [0.6537, 0.6268],
    'RSE-019': [0.6648, 0.6268],
    'RSE-020': [0.6889, 0.6042],
    'RSE-021': [0.7556, 0.6306],
    'RSE-022': [0.7667, 0.6306],
    'RSE-023': [0.7889, 0.6306],
    'RSE-024': [0.7852, 0.6947],
    'RSE-025': [0.7667, 0.6947],
    'RSE-026': [0.7537, 0.6947],
    'RSE-027': [0.7444, 0.6947],
    'RSE-028': [0.7296, 0.6947],
    'RSE-029': [0.7185, 0.6947],
    'RSE-030': [0.7037, 0.6947],
    'RSE-031': [0.6926, 0.6947],
    'RSE-032': [0.6796, 0.6947],
    'RSE-033': [0.6667, 0.6947],
    'RSE-034': [0.6519, 0.6947],
    'RSE-035': [0.6389, 0.6947],
    'RSE-036': [0.6259, 0.6947],
    'RSE-037': [0.6148, 0.6947],
    'RSE-038': [0.6019, 0.6947],
    'RSE-039': [0.5889, 0.6947],
    'RSE-040': [0.5759, 0.6947],
    'RSE-041': [0.5667, 0.6947],
    'RSE-042': [0.5519, 0.6947],
    'RSE-043': [0.5389, 0.6947],
    'RSE-044': [0.5241, 0.6947],
    'RSE-045': [0.5093, 0.6947],
    'RSE-046': [0.4926, 0.6947],
    'RSE-047': [0.463, 0.6947],
    'RSE-048': [0.4481, 0.6947],
    'RSE-049': [0.4278, 0.6947],
  } },

  TH: { image: 'assets/plans/SETH.jpg', label: 'Third Floor', pins: {},
        sharedWith: 'SE', patchLabel: true },

  /* The ground plaza, added 2026-08-17 from the client's 040.png.
   *
   * Unlike every other floor this is CAD linework on white, not a plate
   * composed onto the aerial photograph, so it reads differently in the app and
   * in the PDF. Shipped as-is on the user's instruction; a composed version
   * would match the other three, and swapping to one later would invalidate
   * every pin placed here, exactly as the 2026-08-16 drawing swap did.
   *
   * It also has its OWN ASPECT — 3600x1479, 2.4333, against 2.0441 everywhere
   * else — which is why `aspect` exists on these entries at all. Anything
   * sizing the drawing must read it per floor rather than assume one number.
   *
   * 3600px wide rather than the others' 2412 because this plate carries 178
   * units and their printed numbers have to survive the app's zoom: at 3600 the
   * numbers are still crisp at 1:1, which is about 4.9x in the app.
   *
   * The 178 units are unpriced in the workbook, so none of them reaches the app
   * yet — but the pins are placed, so the floor draws itself the moment ops
   * fill in a price and an availability. */
  GPL: {
    image: 'assets/plans/GPL.jpg', label: 'Ground Plaza', aspect: 3600 / 1479,
    /* All 181, placed by hand in pin-tool.html 2026-08-17 and checked by eye
       against the printed numbers across the whole plate. Complete 001-178 with
       no gaps, no duplicates and no two pins on the same point — that last check
       is what caught building O's off-by-one, where a double-click left every
       later pin one room out. Tightest neighbours are GPL-111/112 at 7.47px in
       the app's 732px frame, comfortably clear of the 6px tap target. */
    pins: {
    'GPL-001': [0.6436, 0.0693],
    'GPL-002': [0.6284, 0.0693],
    'GPL-003': [0.614, 0.0693],
    'GPL-004': [0.6004, 0.0714],
    'GPL-005': [0.5869, 0.0693],
    'GPL-006': [0.5725, 0.0693],
    'GPL-007': [0.5589, 0.0734],
    'GPL-008': [0.542, 0.0714],
    'GPL-009': [0.5268, 0.0693],
    'GPL-010': [0.5132, 0.0693],
    'GPL-011': [0.4988, 0.0673],
    'GPL-012': [0.4827, 0.0673],
    'GPL-013': [0.47, 0.0673],
    'GPL-014': [0.4556, 0.0673],
    'GPL-015': [0.4158, 0.0652],
    'GPL-016': [0.4006, 0.0673],
    'GPL-017': [0.387, 0.0673],
    'GPL-018': [0.3726, 0.0673],
    'GPL-019': [0.3599, 0.0673],
    'GPL-020': [0.3489, 0.0652],
    'GPL-021': [0.3337, 0.0673],
    'GPL-022': [0.3201, 0.0673],
    'GPL-023': [0.3015, 0.0673],
    'GPL-024': [0.2803, 0.0714],
    'GPL-025': [0.2659, 0.0673],
    'GPL-026': [0.2507, 0.0673],
    'GPL-027': [0.2363, 0.0673],
    'GPL-028': [0.221, 0.0673],
    'GPL-029': [0.2058, 0.0673],
    'GPL-030': [0.1931, 0.0673],
    'GPL-031': [0.1778, 0.0652],
    'GPL-032': [0.166, 0.0652],
    'GPL-033': [0.1507, 0.0673],
    'GPL-034': [0.1355, 0.0714],
    'GPL-035': [0.0813, 0.092],
    'GPL-036': [0.0534, 0.094],
    'GPL-037': [0.0203, 0.094],
    'GPL-038': [0.1355, 0.166],
    'GPL-039': [0.1507, 0.166],
    'GPL-040': [0.166, 0.166],
    'GPL-041': [0.1787, 0.1681],
    'GPL-042': [0.1922, 0.1681],
    'GPL-043': [0.2049, 0.1681],
    'GPL-044': [0.2219, 0.1681],
    'GPL-045': [0.2363, 0.1681],
    'GPL-046': [0.2515, 0.166],
    'GPL-047': [0.2668, 0.166],
    'GPL-048': [0.2837, 0.166],
    'GPL-049': [0.3049, 0.166],
    'GPL-050': [0.3193, 0.166],
    'GPL-051': [0.3354, 0.166],
    'GPL-052': [0.3481, 0.166],
    'GPL-053': [0.3599, 0.166],
    'GPL-054': [0.3735, 0.166],
    'GPL-055': [0.3862, 0.166],
    'GPL-056': [0.4031, 0.166],
    'GPL-057': [0.4167, 0.166],
    'GPL-058': [0.4565, 0.1681],
    'GPL-059': [0.47, 0.1681],
    'GPL-060': [0.5149, 0.1599],
    'GPL-061': [0.5276, 0.1599],
    'GPL-062': [0.5437, 0.1599],
    'GPL-063': [0.5589, 0.1578],
    'GPL-064': [0.5742, 0.1578],
    'GPL-065': [0.6098, 0.1578],
    'GPL-066': [0.6292, 0.1578],
    'GPL-067': [0.6436, 0.1599],
    'GPL-068': [0.658, 0.1599],
    'GPL-069': [0.6707, 0.1599],
    'GPL-070': [0.6877, 0.1599],
    'GPL-071': [0.7012, 0.1599],
    'GPL-072': [0.7148, 0.1578],
    'GPL-073': [0.7266, 0.1578],
    'GPL-074': [0.7732, 0.166],
    'GPL-075': [0.7868, 0.166],
    'GPL-076': [0.8037, 0.1475],
    'GPL-077': [0.8045, 0.1907],
    'GPL-078': [0.8045, 0.2236],
    'GPL-079': [0.8071, 0.2751],
    'GPL-080': [0.7732, 0.2771],
    'GPL-081': [0.7224, 0.2771],
    'GPL-082': [0.6953, 0.2812],
    'GPL-083': [0.6665, 0.2854],
    'GPL-084': [0.6369, 0.2874],
    'GPL-085': [0.6064, 0.2874],
    'GPL-086': [0.581, 0.2833],
    'GPL-087': [0.5522, 0.2874],
    'GPL-088': [0.5234, 0.2874],
    'GPL-089': [0.4963, 0.2874],
    'GPL-090': [0.4649, 0.2874],
    'GPL-091': [0.4023, 0.3059],
    'GPL-092': [0.3879, 0.3059],
    'GPL-093': [0.3743, 0.308],
    'GPL-094': [0.3625, 0.308],
    'GPL-095': [0.3489, 0.308],
    'GPL-096': [0.3328, 0.308],
    'GPL-097': [0.3201, 0.3059],
    'GPL-098': [0.3032, 0.3039],
    'GPL-099': [0.2812, 0.2998],
    'GPL-100': [0.2668, 0.3018],
    'GPL-101': [0.2507, 0.3018],
    'GPL-102': [0.2363, 0.2998],
    'GPL-103': [0.2202, 0.3018],
    'GPL-104': [0.2058, 0.2854],
    'GPL-105': [0.1914, 0.2874],
    'GPL-106': [0.1778, 0.2874],
    'GPL-107': [0.1643, 0.2874],
    'GPL-108': [0.1507, 0.2874],
    'GPL-109': [0.1355, 0.2874],
    'GPL-110': [0.8426, 0.7092],
    'GPL-111': [0.8257, 0.7133],
    'GPL-112': [0.8155, 0.7133],
    'GPL-113': [0.7978, 0.7154],
    'GPL-114': [0.7817, 0.668],
    'GPL-115': [0.7554, 0.7112],
    'GPL-116': [0.719, 0.7133],
    'GPL-117': [0.6936, 0.7133],
    'GPL-118': [0.6631, 0.7133],
    'GPL-119': [0.6343, 0.7133],
    'GPL-120': [0.6055, 0.7133],
    'GPL-121': [0.5827, 0.7133],
    'GPL-122': [0.5522, 0.7112],
    'GPL-123': [0.5208, 0.7092],
    'GPL-124': [0.4963, 0.7092],
    'GPL-125': [0.4675, 0.7092],
    'GPL-126': [0.4361, 0.7154],
    'GPL-127': [0.4361, 0.8079],
    'GPL-128': [0.4573, 0.8079],
    'GPL-129': [0.47, 0.8079],
    'GPL-130': [0.4929, 0.8182],
    'GPL-131': [0.5589, 0.81],
    'GPL-132': [0.5776, 0.81],
    'GPL-133': [0.6004, 0.8079],
    'GPL-134': [0.6131, 0.8079],
    'GPL-135': [0.6275, 0.8079],
    'GPL-136': [0.6428, 0.8079],
    'GPL-137': [0.658, 0.8079],
    'GPL-138': [0.6707, 0.8079],
    'GPL-139': [0.686, 0.8079],
    'GPL-140': [0.7004, 0.8079],
    'GPL-141': [0.7148, 0.8059],
    'GPL-142': [0.7283, 0.8121],
    'GPL-143': [0.7724, 0.8121],
    'GPL-144': [0.8062, 0.8717],
    'GPL-145': [0.8342, 0.8717],
    'GPL-146': [0.8638, 0.8738],
    'GPL-147': [0.9011, 0.8655],
    'GPL-148': [0.7724, 0.9458],
    'GPL-149': [0.7419, 0.9478],
    'GPL-150': [0.7283, 0.9499],
    'GPL-151': [0.7165, 0.9478],
    'GPL-152': [0.7012, 0.9499],
    'GPL-153': [0.6843, 0.952],
    'GPL-154': [0.6707, 0.9499],
    'GPL-155': [0.6572, 0.9499],
    'GPL-156': [0.6428, 0.9499],
    'GPL-157': [0.6267, 0.9478],
    'GPL-158': [0.6131, 0.9478],
    'GPL-159': [0.6004, 0.9478],
    'GPL-160': [0.586, 0.9478],
    'GPL-161': [0.5742, 0.9478],
    'GPL-162': [0.5589, 0.9499],
    'GPL-163': [0.5454, 0.952],
    'GPL-164': [0.5293, 0.9478],
    'GPL-165': [0.5158, 0.9478],
    'GPL-166': [0.4997, 0.9478],
    'GPL-167': [0.4844, 0.952],
    'GPL-168': [0.4709, 0.9499],
    'GPL-169': [0.4573, 0.9499],
    'GPL-170': [0.4353, 0.9478],
    'GPL-171': [0.3337, 0.7544],
    'GPL-172': [0.3193, 0.7524],
    'GPL-173': [0.3015, 0.7544],
    'GPL-174': [0.2854, 0.7565],
    'GPL-175': [0.2668, 0.7565],
    'GPL-176': [0.2524, 0.7586],
    'GPL-177': [0.2397, 0.7586],
    'GPL-178': [0.221, 0.7586],

    /* The three lettered anchors, placed 2026-08-17. Verified by sampling the
       drawing underneath each one rather than by eye alone: the blocks are
       colour-filled, so the pixel under the pin is proof of which block it is
       in. H reads blue (218,247,255), K green (229,255,216), S pink
       (255,207,207) — each its own block. H is on the Hyper Market SALES FLOOR,
       not the Hyper Market Storage strip, which is the same blue and the one
       plausible way to get this wrong. */
    'GPL-H': [0.1829, 0.5199],
    'GPL-K': [0.9129, 0.2977],
    'GPL-S': [0.3286, 0.8923],
    },
  },
};

/* Every other drawing is 2412x1180. Stated once, here, rather than repeated on
   four entries — and read through planAspect() so a floor that differs (GPL)
   cannot be sized with somebody else's number. */
const DEFAULT_PLAN_ASPECT = 2412 / 1180;

/** Width divided by height for one floor's drawing. */
function planAspect(floorCode) {
  const p = PLANS[floorCode];
  return (p && p.aspect) || DEFAULT_PLAN_ASPECT;
}

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

/* ---------------------------------------------------------- focus shapes --
 *
 * The third kind of geometry: the outline of the area the PDF's floor page
 * keeps SHARP while the rest of the drawing fades back to PLAN_FADED. Same
 * normalised coordinates as the pins — x a fraction of the image width, y a
 * fraction of its height.
 *
 * Lives here rather than in pdf.js, which is its only reader in the app,
 * because pin-tool.html has to see it to seed the tracer and the tool does not
 * load pdf.js.
 *
 * Keyed by FLOOR, then by building, with ANY for a shape that holds on every
 * floor. Everything currently lives in ANY.
 *
 * That the floors can share one shape is not an assumption, it is a property of
 * how these were traced. The plates are NOT in the same place on every floor:
 * SP's are drawn with a white border the others do not have, which puts its
 * edges about 0.02 further out — roughly 24px on the drawing. A shape traced
 * tight to one floor would leave a band of half-faded wall on another. These
 * were traced on SP with deliberate clearance instead, so each one CONTAINS
 * every floor's plate: 15-48% larger by area, and verified 2026-08-17 to hold
 * all 4 x 3 measured plate outlines and all 470 M/O/R pins across the four
 * floors, with no two shapes overlapping.
 *
 * Trace a replacement the same way — generously — or give the floor its own
 * entry beside ANY, which focusShape() will prefer.
 *
 * A building with no entry falls back to the bounding box of its own pins,
 * which stops at the middle of the outermost rooms. That is a last resort, not
 * a good default.
 */
const FOCUS_SHAPES = {
  ANY: {
    /* Building Q, every floor. Traced by hand in pin-tool.html and confirmed by
       the user 2026-08-17.
       It follows Q's OUTER edge only, so the courtyard the C wraps stays inside
       the shape and is kept sharp along with the building. That is deliberate:
       the courtyard is part of what Q is. Worth knowing before anyone
       "corrects" it — the shape is 41% larger by area than Q's plate alone, and
       points across the middle of the courtyard all test inside. */
    Q: [
      [0.0555, 0.1607],
      [0.2877, 0.1572],
      [0.2877, 0.3801],
      [0.2894, 0.5379],
      [0.3533, 0.5379],
      [0.3550, 0.7642],
      [0.3533, 0.7677],
      [0.0555, 0.7642],
    ],

    /* M, O and R, every floor. Traced by the user on SP, 2026-08-17, replacing
       the measured outlines that stood here for a few hours.
       Plain quads with clearance around the bar, rather than outlines hugging
       the walls — which is what lets one shape serve all four floors.
       The clearance is DELIBERATE and confirmed by the user: the highlight
       catching a band of pavement, and a strip of the neighbouring roof above
       M, is accepted as the price of one shape per building. Do not tighten
       these to the walls to make them look neater — that is what breaks the
       cross-floor fit. If a tighter highlight is ever wanted, trace each floor
       separately and give it its own entry beside ANY. */
    M: [
      [0.2961, 0.1401],
      [0.5838, 0.1469],
      [0.5838, 0.3904],
      [0.2961, 0.3939],
    ],
    O: [
      [0.6006, 0.1469],
      [0.8900, 0.1401],
      [0.8967, 0.3836],
      [0.5989, 0.3870],
    ],
    /* The trace arrived with [0.3903, 0.5379] repeated as its first two points
       — a double click on the opening corner. Dropped: a zero-length edge is
       harmless to the clip but reads as a mistake in the geometry. */
    R: [
      [0.3903, 0.5379],
      [0.8143, 0.5345],
      [0.8214, 0.7757],
      [0.3963, 0.7766],
    ],
  },
};

/** The outline for one building on one floor, or null to fall back to pins. */
function focusShape(floorCode, bId) {
  const perFloor = FOCUS_SHAPES[floorCode];
  return (perFloor && perFloor[bId]) || FOCUS_SHAPES.ANY[bId] || null;
}

if (typeof module !== 'undefined') {
  module.exports = { MASSING, PLANS, pinCount, FOCUS_SHAPES, focusShape, planAspect };
}
