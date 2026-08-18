/* Live inventory sync.
 *
 * Reads the published Google Sheet on every load. A unit sold in the sheet stops
 * being offerable here; a unit added appears. Nothing is cached between loads
 * beyond the browser's own no-cache handling, so the sales team never has to
 * think about refreshing.
 *
 * Design rule throughout: fail *closed*. Any row we cannot confidently read as
 * available is treated as not available. Hiding a free clinic costs a phone
 * call; selling a sold one costs a customer.
 */

/** RFC-4180-ish CSV parser: handles quoted fields, embedded commas, "" escapes. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

/** "3,375,000.00" -> 3375000. Returns null when there is no number present. */
function parseNumber(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* Header aliases, so renaming a column in the sheet does not break the app.
 * Matched on normalised text, longest-specific first. */
const COLUMNS = {
  building:  ['building', 'project'],
  code:      ['unit code', 'code', 'unit'],
  type:      ['type', 'unit type', 'activity'],
  netArea:   ['net area', 'net'],
  area:      ['area', 'gross area', 'indoor area', 'area m2'],
  outdoor:   ['outdoor', 'outdoor area'],
  floor:     ['floor'],
  meterPrice:['indoor sqm price', 'indoor meter price', 'meter price', 'price per meter'],
  outdoorPrice: ['outdoor sqm price', 'outdoor meter price'],
  /* The discounted rates, added by the client 2026-08-16 so the agent can quote
   * a rate per metre as well as a total. Read rather than derived: they are what
   * the customer's contract will say. */
  meterPriceFinal:   ['final indoor sqm price', 'final indoor meter price'],
  outdoorPriceFinal: ['final outdoor sqm price', 'final outdoor meter price'],
  total:     ['total unit price', 'total price'],
  discount:  ['discount'],
  price:     ['final price', 'net price'],
  status:    ['availability', 'status'],
  admin:     ['admin', 'sales', 'agent'],
};

function mapHeaders(headerRow) {
  const seen = headerRow.map(norm);
  const idx = {};
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    for (const alias of aliases) {
      const at = seen.indexOf(alias);
      if (at !== -1) { idx[key] = at; break; }
    }
  }

  /* THE PROJECT WORKBOOK HAS TWO COLUMNS BOTH HEADED "Outdoor SQM Price".
   *
   * The third-floor workbook names them properly — "Outdoor SQM Price" and
   * "Final Outdoor SQM Price" — but the project one repeats the first name for
   * both, so matching on text alone finds the list rate twice and the
   * discounted rate never. Quoting a discounted rate that is really the list
   * rate is the kind of error that reaches a customer's contract, so resolve it
   * by POSITION when the name is missing: the second occurrence is the
   * discounted one. Verified against all 348 rows carrying an outdoor rate on
   * 2026-08-16 — the second column equals the first times (1 - discount) in
   * every one.
   *
   * Guarded on the pair being distinct, so a workbook that one day names the
   * column correctly is unaffected. */
  if (idx.outdoorPriceFinal === undefined && idx.outdoorPrice !== undefined) {
    const second = seen.indexOf('outdoor sqm price', idx.outdoorPrice + 1);
    if (second !== -1) idx.outdoorPriceFinal = second;
  }
  return idx;
}

/** Floor name as printed in the sheet -> the code used in unit codes. */
const FLOOR_BY_NAME = CONFIG.floors.reduce((m, f) => {
  m[norm(f.name)] = f.code;
  return m;
}, {});

/** Every floor code the project knows, for parseUnitCode to test against. */
const FLOOR_CODES = new Set(CONFIG.floors.map((f) => f.code.toUpperCase()));

/**
 * "QSP-067" -> { building: 'Q', floorCode: 'SP', unit: 67 }
 * "GPL-001" -> { building: null, floorCode: 'GPL', unit: 1 }
 * Null if it doesn't fit.
 *
 * Unit numbers restart per building per floor, so the number alone identifies
 * nothing — only the whole code is unique. Never key inventory on the number.
 *
 * WHY THIS IS NOT ONE REGEX ANY MORE. It used to be one building letter plus
 * two floor letters, which silently mis-parsed the whole ground floor:
 * "GPL-001" matched as building "G" on a floor "PL", inventing both. The two
 * shapes are genuinely ambiguous — GPL-001 is a valid reading either way — so
 * the ambiguity is settled against the FLOOR LIST rather than by counting
 * letters, and the whole-head-is-a-floor reading wins, because a floor code is
 * a fact where a leading building letter is only a guess.
 *
 * The ground plaza is one continuous plate numbered 001-178 with no wings, so
 * its units have no building at all. Callers must treat building as OPTIONAL.
 * It is null rather than a placeholder, so a missing building cannot be
 * mistaken for a real one.
 */
function parseUnitCode(code) {
  /* The suffix is USUALLY a number, but the ground plaza's three anchors are
     lettered: GPL-H, GPL-S and GPL-K, the Hyper Market (1940 m2), Showroom
     (933) and Kids Area (703). They are inventory rows like any other — same
     Type, same area column, same blank price — so refusing them meant three
     permanent warnings and, more to the point, 3576 m2 of the floor that could
     never be pinned or offered. */
  const m = /^([A-Za-z]{2,4})-([0-9]{1,3}|[A-Za-z]{1,2})$/.exec(String(code).trim());
  if (!m) return null;
  const head = m[1].toUpperCase();
  const suffix = m[2].toUpperCase();

  /* `unit` is ONLY EVER A SORT KEY — everything user-facing shows u.code — so a
     synthetic value for the lettered ones is safe. They sort after every
     numbered unit (1000 is far above the 182 the largest floor holds) and
     alphabetically among themselves, which puts the anchors at the end of the
     list rather than interleaved with the numbered shops. */
  const unit = /^\d+$/.test(suffix)
    ? Number(suffix)
    : 1000 + (suffix.charCodeAt(0) - 65);

  if (FLOOR_CODES.has(head)) return { building: null, floorCode: head, unit };

  const floorCode = head.slice(1);
  if (FLOOR_CODES.has(floorCode)) return { building: head[0], floorCode, unit };

  /* Neither reading names a floor this project has. Returning the letter-count
     guess would push an unknown floor downstream to be warned about a second
     time; one clear "not in the expected form" is the better report. */
  return null;
}

/**
 * Turn raw CSV rows into unit objects.
 * Returns { units, warnings } — warnings are surfaced in the UI rather than
 * thrown, so one bad row never takes the whole app down mid-meeting.
 */
function normalizeRows(rows, planAreas, opts = {}) {
  const warnings = [];
  if (!rows.length) return { units: [], warnings: ['The sheet is empty.'] };

  /* Header validation is the ONLY thing standing between this app and pricing
   * off the wrong tab. gviz ignores an unknown `sheet=` parameter and silently
   * serves the first tab, so if the inventory ever stops being first, what
   * arrives here is some other table entirely. Refuse it. */
  const idx = mapHeaders(rows[0]);
  for (const required of ['code', 'status']) {
    if (idx[required] === undefined) {
      return { units: [], warnings: [`The sheet has no "${required}" column — this is not the inventory tab.`] };
    }
  }
  if (idx.price === undefined && idx.total === undefined) {
    return { units: [], warnings: ['The sheet has neither a Final Price nor a Total Unit Price column — this is not the inventory tab.'] };
  }

  const units = [], seenCodes = new Set();

  rows.slice(1).forEach((row, n) => {
    const cell = (key) => (idx[key] === undefined ? '' : (row[idx[key]] ?? '').trim());
    const code = cell('code').toUpperCase();
    if (!code) return;

    const where = `row ${n + 2} (${code})`;
    if (seenCodes.has(code)) { warnings.push(`${where}: duplicate unit code — the later row was ignored.`); return; }
    seenCodes.add(code);

    const parsed = parseUnitCode(code);
    if (!parsed) { warnings.push(`${where}: unit code is not in the expected form (e.g. QSP-067) — skipped.`); return; }

    /* The plan is calculated on Final Price (after the per-unit discount).
     * Fall back to the Total when Final is blank, rather than skipping a real
     * unit over an empty cell — but say so, because a missing Final usually
     * means the discount column was left unset. */
    const total = parseNumber(cell('total'));
    let price = parseNumber(cell('price'));
    if (price === null && total !== null) {
      price = total;
      warnings.push(`${where}: no Final Price — using the Total Unit Price, i.e. no discount.`);
    }
    /* No price, no offer — a unit that cannot be quoted must never reach the
       app. The one caller that wants them anyway is pin-tool.html: placing a
       pin is geometry, not money, and the ground plaza's 178 units are all
       unpriced today. Without this the tool cannot show the very units it
       exists to pin. Nothing that builds an offer passes keepUnpriced. */
    /* An UNRELEASED floor arrives with dashes in every price column. That is
       its normal state, not a fault: ops price a floor when they release it,
       and until then every row of it is legitimately unpriced. Warning per row
       put "GPL-001: no usable price (and 180 more like it)" permanently at the
       top of the app, where it read as a defect and buried the warnings that
       are real. Suppressed on the user's instruction 2026-08-18.

       An UNKNOWN floor code still warns — the default here is to speak up, so
       a floor nobody has declared cannot go quiet by accident. */
    const floor = CONFIG.floors.find((f) => f.code === parsed.floorCode);
    const released = !floor || floor.released !== false;
    if (price === null || price <= 0) {
      if (!opts.keepUnpriced) {
        if (released) warnings.push(`${where}: no usable price — skipped.`);
        return;
      }
      price = null;
    }

    let area = parseNumber(cell('area'));
    const netArea = parseNumber(cell('netArea'));
    const outdoor = parseNumber(cell('outdoor')) || 0;
    let meterPrice = parseNumber(cell('meterPrice'));
    const outdoorPrice = parseNumber(cell('outdoorPrice'));
    let meterPriceFinal = parseNumber(cell('meterPriceFinal'));
    let outdoorPriceFinal = parseNumber(cell('outdoorPriceFinal'));

    /* Discount is written as a percentage in the sheet ("15%"), so parseNumber
     * yields 15, not 0.15. Anything above 1 is therefore a percentage figure. */
    let discount = parseNumber(cell('discount'));
    if (discount !== null && discount > 1) discount /= 100;
    discount = discount || 0;

    // Units the developer has withheld from sale, whatever the sheet says.
    const heldReason = (CONFIG.excludedUnits || {})[code];

    /* A correction recorded in config.js, where the drawing and the sheet
     * disagree and the drawing has been accepted as right. The total price is
     * left alone and the meter price re-derived from it, so the offer's own
     * arithmetic still foots. Applied before the checks below, which would
     * otherwise report a discrepancy that has already been resolved. */
    const override = (CONFIG.unitOverrides || {})[code];
    let overrideNote = null;
    if (override && override.area && override.area !== area) {
      overrideNote = `${code}: using ${override.area} m² instead of the sheet's ${area} m². ${override.reason}`;
      warnings.push(overrideNote);
      area = override.area;
      // Re-derive the rate from the untouched total so the offer still foots.
      meterPrice = (total ?? price) / area;
    }

    /* Cross-foot every piece of arithmetic the sheet already did. All four of
     * these held across all 176 rows on 2026-08-12, so a failure here means
     * the sheet changed shape — surface it rather than quietly pricing off it.
     * Tolerances are in whole currency units except the area one. */
    /* This one checks the gross area against the sheet's own smaller area
     * column. The warning text deliberately names neither that column nor its
     * value: warnings are rendered in the UI, and the client instructed
     * 2026-08-12 that the net figure must never be shown to a customer. The
     * unit code is enough to find the offending row in the sheet. */
    if (netArea && area && Math.abs(area - netArea * CONFIG.loadFactor) > 0.02) {
      warnings.push(`${where}: the gross area ${area} m² does not match the sheet's own area calculation — check this row before quoting it.`);
    }
    if (meterPrice && outdoorPrice &&
        Math.abs(outdoorPrice - meterPrice / CONFIG.outdoorPriceDivisor) > 1) {
      warnings.push(`${where}: outdoor rate ${outdoorPrice.toLocaleString()} is not indoor ÷ ${CONFIG.outdoorPriceDivisor}.`);
    }
    if (area && meterPrice && total) {
      const expect = area * meterPrice + outdoor * (outdoorPrice || 0);
      if (Math.abs(expect - total) > 50) {
        warnings.push(`${where}: ${area} × ${meterPrice.toLocaleString()} + outdoor ≠ ${total.toLocaleString()} (expected ${Math.round(expect).toLocaleString()}).`);
      }
    }
    if (total && Math.abs(total * (1 - discount) - price) > 2) {
      warnings.push(`${where}: ${total.toLocaleString()} less ${(discount * 100).toFixed(0)}% ≠ ${price.toLocaleString()}.`);
    }

    /* The discounted rates get the same treatment as every other figure the
     * sheet hands over: cross-footed, not trusted. Both held on all 712 priced
     * rows on 2026-08-16. A failure here most likely means the two same-named
     * outdoor columns have been reordered, which would put the LIST rate on the
     * offer under the word "after discount". */
    if (meterPrice && meterPriceFinal
        && Math.abs(meterPriceFinal - meterPrice * (1 - discount)) > 1) {
      warnings.push(`${where}: the sheet's discounted indoor rate ${meterPriceFinal.toLocaleString()} is not `
                  + `${meterPrice.toLocaleString()} less ${(discount * 100).toFixed(0)}% — showing the calculated rate.`);
      meterPriceFinal = null;
    }
    if (outdoorPrice && outdoorPriceFinal
        && Math.abs(outdoorPriceFinal - outdoorPrice * (1 - discount)) > 2) {
      warnings.push(`${where}: the sheet's discounted outdoor rate ${outdoorPriceFinal.toLocaleString()} is not `
                  + `${outdoorPrice.toLocaleString()} less ${(discount * 100).toFixed(0)}% — showing the calculated rate.`);
      outdoorPriceFinal = null;
    }
    /* Blank, or rejected just above: fall back to the rate implied by the price
     * the offer is actually built on, so what the agent reads per metre and what
     * they quote as a total can never tell the customer two different stories. */
    if (meterPrice && meterPriceFinal === null) meterPriceFinal = meterPrice * (1 - discount);
    if (outdoorPrice && outdoorPriceFinal === null) outdoorPriceFinal = outdoorPrice * (1 - discount);

    const statusRaw = cell('status');
    const status = norm(statusRaw);
    let state = 'sold';
    if (CONFIG.availableStatuses.includes(status)) state = 'available';
    else if (CONFIG.reservedStatuses.includes(status)) state = 'reserved';
    else if (status && !CONFIG.availableStatuses.includes(status)) state = 'sold';
    if (!status) { warnings.push(`${where}: blank status — treated as not available.`); }

    // A hold overrides an "Available" status — it must not reach an offer.
    if (heldReason) {
      state = 'held';
      warnings.push(`${code} is on hold and cannot be offered: ${heldReason}`);
    }

    /* The Floor column and the unit code must agree. They are written by
     * different people at different times, and a mismatch means one of them is
     * lying about where the customer's unit actually is. */
    const floorName = cell('floor');
    const floorCode = FLOOR_BY_NAME[norm(floorName)];
    if (floorName && !floorCode) {
      warnings.push(`${where}: floor "${floorName}" is not one of the known floors.`);
    } else if (floorCode && floorCode !== parsed.floorCode) {
      warnings.push(`${where}: floor column says "${floorName}" (${floorCode}) but the code says ${parsed.floorCode}.`);
    }

    /* Only cross-check the building on floors that HAVE buildings. The ground
       plaza has none — its column reads "Ground Plaza", the floor's own name —
       so comparing it against a null building would warn on all 178 rows about
       a disagreement that does not exist. `.toUpperCase()` on the null was also
       a crash waiting for the first ground-floor row with a blank column. */
    if (parsed.building) {
      const building = (cell('building') || parsed.building).toUpperCase();
      if (building !== parsed.building) {
        warnings.push(`${where}: building column says "${building}" but the code says ${parsed.building}.`);
      }
    }

    units.push({
      code,
      building: parsed.building,
      floorCode: parsed.floorCode,
      floorName: floorName || (CONFIG.floors.find((f) => f.code === parsed.floorCode) || {}).name || null,
      unit: parsed.unit,
      type: cell('type') || null,
      netArea,
      area: area ?? null,
      outdoor,
      meterPrice,
      outdoorPrice,
      meterPriceFinal,        // indoor rate after the unit's discount
      outdoorPriceFinal,      // outdoor rate after it, null when there is no outdoor
      total: total ?? price,   // pre-discount list price
      discount,                // fraction, e.g. 0.15
      price,                   // Final Price — what the plan is calculated on
      admin: cell('admin') || null,
      status: statusRaw || '—',
      heldReason: heldReason || null,
      // Set when config.js corrected this row, so the UI can say where the
      // number on screen came from rather than silently disagreeing with the sheet.
      areaNote: overrideNote ? override.reason : null,
      state,
    });
  });

  return { units, warnings: collapseWarnings(warnings) };
}

/**
 * Collapse repeated warnings of the same shape into one line.
 *
 * Ground Plaza is laid out in the sheet but carries no prices — 178 rows of
 * "no usable price", which is correct behaviour and completely uninteresting.
 * Left as 178 lines it buries the one warning that actually matters, so the
 * agent stops reading them. Group by message shape, keep the first example,
 * and say how many others there were.
 */
function collapseWarnings(warnings, keep = 4) {
  const groups = new Map();
  for (const w of warnings) {
    // Strip the row/code prefix and any numbers, leaving the shape of the message.
    const shape = w.replace(/^row \d+ \([^)]*\): /, '').replace(/[\d.,]+/g, '#');
    if (!groups.has(shape)) groups.set(shape, []);
    groups.get(shape).push(w);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length <= keep) { out.push(...list); continue; }
    out.push(`${list[0]} (and ${list.length - 1} more like it)`);
  }
  return out;
}

/** One workbook: try each URL in turn, return its units or null. */
async function loadOneSheet(source, planAreas, errors, opts = {}) {
  for (const url of source.urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { errors.push(`${res.status} from ${source.label}`); continue; }
      const text = await res.text();
      // A login page means the sheet stopped being published.
      if (/^\s*</.test(text)) { errors.push(`${source.label} is no longer published publicly`); continue; }

      const { units, warnings } = normalizeRows(parseCSV(text), planAreas, opts);
      if (!units.length) { errors.push(`${source.label}: ${warnings[0] || 'no usable rows'}`); continue; }
      return { units, warnings };
    } catch (err) {
      errors.push(`${source.label}: ${err.message}`);
    }
  }
  return null;
}

/**
 * Fetch every workbook in CONFIG.sheets, falling back through each one's URL
 * list, then to the snapshot.
 *
 * ONE MISSING WORKBOOK MUST NOT LOOK LIKE A SOLD-OUT FLOOR. The third floor is
 * a separate workbook (see CONFIG.sheets), so if it alone fails to load, the
 * app would otherwise open looking perfectly healthy with the entire third
 * floor simply absent — and an agent would tell a customer it was gone. So a
 * partial load keeps what it has, says plainly which inventory is missing, and
 * reports itself as not live, which is what drives the stale badge in the UI.
 */
async function loadInventory(planAreas, opts = {}) {
  const errors = [];
  const sources = CONFIG.sheets || [];

  const loaded = await Promise.all(sources.map((s) => loadOneSheet(s, planAreas, errors, opts)));

  const units = [];
  const warnings = [];
  const seen = new Map();
  let missing = 0;

  loaded.forEach((got, i) => {
    if (!got) {
      missing += 1;
      warnings.push(`Could not load ${sources[i].label} — every unit in it is missing from this list.`);
      return;
    }
    warnings.push(...got.warnings);
    for (const u of got.units) {
      /* Codes cannot collide today — the third-floor workbook is all TH codes
         and the project one has none — but if the client ever lists a unit in
         both, the two rows can disagree on price. Keep the first and name both
         workbooks, rather than letting load order decide what a customer pays. */
      if (seen.has(u.code)) {
        warnings.push(`${u.code} is in both ${seen.get(u.code)} and ${sources[i].label} — `
                    + `using the copy from ${seen.get(u.code)}.`);
        continue;
      }
      seen.set(u.code, sources[i].label);
      units.push(u);
    }
  });

  /* Not collapsed again here — normalizeRows() has already collapsed each
     workbook's own warnings, and running it over the results would append a
     second "(and N more like it)" to lines that already carry one. */
  if (units.length) {
    return { units, warnings, live: !missing, fetchedAt: new Date(), errors };
  }

  // Offline / sheet unreachable: fall back to the snapshot baked in at build
  // time so the app still opens in front of a client. Clearly marked as stale.
  //
  // Snapshots are keyed by project, so one project can never be shown another's
  // units and prices. If this project has no snapshot, say so and show nothing.
  const snap = typeof SNAPSHOTS !== 'undefined' ? SNAPSHOTS[CONFIG.id] : null;
  if (!snap) {
    return {
      units: [],
      warnings: [`Could not reach the ${CONFIG.name} inventory sheet, and there is no saved copy for this project. Check your connection and press Refresh.`],
      live: false,
      fetchedAt: null,
      errors,
    };
  }

  const fromSnapshot = normalizeRows(parseCSV(snap.csv), planAreas);
  return {
    units: fromSnapshot.units,
    warnings: fromSnapshot.warnings,
    live: false,
    fetchedAt: snap.takenAt ? new Date(snap.takenAt) : null,
    errors,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { parseCSV, parseNumber, normalizeRows, parseUnitCode, mapHeaders };
}
