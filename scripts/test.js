/* Qomor Offer Generator — test suite.
 *
 * Run: node scripts/test.js            (offline, uses the CSV snapshot if present)
 *      node scripts/test.js --live     (also fetches the real sheet)
 *
 * Browser scripts are loaded the way the page loads them — concatenated into
 * one Function that returns the globals — so there is no module rewrite and the
 * load order is the real one.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const src = ['js/config.js', 'js/sheet.js', 'js/engine.js', 'js/npv.js']
  .map(read)
  .join('\n')
  /* Each file ends with a CommonJS export guard. Deleting the block by regex
   * unbalances the braces (it eats the `if (...) {` and leaves the `}`), so
   * make the condition false instead: the block stays syntactically whole and
   * simply never runs. */
  .replace(/typeof module !== 'undefined'/g, 'false');

const G = new Function(`${src}
  return { CONFIG, ASSUMPTIONS, parseCSV, parseNumber, normalizeRows, parseUnitCode,
           mapHeaders, buildSchedule, scheduleByYear, scheduleTotal, levelRate,
           milestonesFor, pctLabel, addMonths, fmt, NPV };`)();

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; return true; }
  fail++; failures.push(msg); return false;
}
function eq(a, b, msg) { return ok(a === b, `${msg} — got ${a}, expected ${b}`); }
function near(a, b, tol, msg) {
  return ok(Math.abs(a - b) <= tol, `${msg} — got ${a}, expected ${b} ±${tol}`);
}
function section(name) { console.log(`\n── ${name}`); }

/* ------------------------------------------------------------------ codes -- */
section('unit codes');
{
  const p = G.parseUnitCode('QSP-067');
  ok(p && p.building === 'Q' && p.floorCode === 'SP' && p.unit === 67, 'QSP-067 parses');
  ok(G.parseUnitCode('QTH-001').floorCode === 'TH', 'QTH-001 parses');
  ok(G.parseUnitCode('qsp-067').building === 'Q', 'lower case parses');
  ok(G.parseUnitCode('Q-067') === null, 'missing floor code rejected');
  ok(G.parseUnitCode('QSP067') === null, 'missing dash rejected');
  ok(G.parseUnitCode('QSPX-067') === null, 'three-letter floor rejected');
  ok(G.parseUnitCode('') === null, 'empty rejected');
}

/* ------------------------------------------------------------------ plans -- */
/* What each plan's milestones should be, stated as MONTHS and independently of
   how config happens to express them — the point of a test is to disagree with
   the implementation when the implementation is wrong.
   6y carries a single 10% at delivery on the client's instruction 2026-08-18;
   the others are the standard 5% / 5% / 10% at quarters 4, 8 and 14.
   Delivery moved from month 36 to month 42 (3.5 years) on the client's
   instruction 2026-08-20; quarters 4 and 8 are unaffected. */
const EXPECTED_MILESTONE_MONTHS = {
  '4y': [], '6y': [42], '7y': [12, 24, 42],
  '8y': [12, 24, 42], '9y': [12, 24, 42], '10y': [12, 24, 42],
};

section('plan definitions foot to 100%');
for (const plan of G.CONFIG.plans) {
  const ms = G.milestonesFor(plan);
  const msTotal = Object.values(ms).reduce((s, p) => s + p, 0);
  const level = G.levelRate(plan);
  const total = plan.down + msTotal + level * plan.instalments;
  near(total, 1, 1e-12, `${plan.label}: down + milestones + instalments = 100%`);
  ok(level > 0, `${plan.label}: level instalment rate is positive`);
  eq(Object.keys(ms).length, EXPECTED_MILESTONE_MONTHS[plan.id].length,
     `${plan.label}: milestone count`);
}

/* Against the client's own displayed percentages. Their tabs are rounded to
 * 2dp, so we assert the derived rate matches to within half a displayed unit. */
section('derived rates match the client tabs');
{
  const expected = { '4y': 6.25, '6y': 3.33, '7y': 2.14, '8y': 1.56, '9y': 1.11, '10y': 0.75 };
  for (const plan of G.CONFIG.plans) {
    const shown = +(G.levelRate(plan) * 100).toFixed(2);
    near(shown, expected[plan.id], 0.01, `${plan.label}: quarterly rate ≈ ${expected[plan.id]}%`);
  }
}

/* ------------------------------------------------------------- schedules -- */
section('every plan × representative units sums exactly');
{
  // Synthetic units, per playbook rule 6: never let a test depend on a real
  // unit keeping a particular price.
  const units = [
    { code: 'QSP-001', total: 10118160, discount: 0.15, price: 8600436 },
    { code: 'QFT-001', total: 2745600,  discount: 0.20, price: 2196480 },
    { code: 'QSE-047', total: 3244800,  discount: 0.20, price: 2595840 },
    { code: 'QSP-036', total: 35948900, discount: 0,    price: 35948900 },
    { code: 'ODD-001', total: 1234567,  discount: 0.10, price: 1111110 },
  ];
  const contract = new Date(2026, 7, 5);

  for (const u of units) {
    for (const plan of G.CONFIG.plans) {
      const { rows, summary } = G.buildSchedule(u, plan, contract);
      const label = `${u.code} / ${plan.label}`;

      const paid = rows.filter((r) => !r.maintenance).reduce((s, r) => s + r.amount, 0);
      eq(paid, u.price, `${label}: instalments+down sum to the price`);
      eq(G.scheduleTotal(rows), u.price + summary.maintenance, `${label}: grand total`);

      ok(rows.every((r) => r.amount > 0), `${label}: no zero or negative payment`);
      eq(rows.filter((r) => r.instalment).length, plan.instalments, `${label}: instalment count`);
      eq(rows.filter((r) => r.down).length, 1, `${label}: exactly one down payment`);
      eq(rows.filter((r) => r.maintenance).length, 1, `${label}: exactly one maintenance row`);
      eq(summary.maintenance, Math.round(u.price * 0.10), `${label}: maintenance is 10%`);

      // Dates must march forward, and the term must match the plan.
      const months = rows.map((r) => r.month);
      ok(months.every((m, i) => i === 0 || m >= months[i - 1]), `${label}: months are ordered`);
      const lastInst = rows.filter((r) => r.instalment).pop();
      eq(lastInst.month, plan.instalments * 3, `${label}: term is ${plan.instalments * 3} months`);

      // Milestones land where the client's tabs put them.
      const milestoneMonths = rows.filter((r) => r.milestone).map((r) => r.month);
      const wantMonths = EXPECTED_MILESTONE_MONTHS[plan.id].join(',');
      ok(milestoneMonths.join(',') === wantMonths,
        `${label}: milestones at months ${wantMonths || '(none)'} — got ${milestoneMonths.join(',') || '(none)'}`);
    }
  }
}

section('rounding drift lands on the final instalment, not the middle');
{
  // A price chosen so the level instalment cannot divide evenly.
  const u = { code: 'QSP-999', total: 1000001, discount: 0, price: 1000001 };
  const plan = G.CONFIG.plans.find((p) => p.id === '8y');
  const { rows } = G.buildSchedule(u, plan, new Date(2026, 7, 5));
  const inst = rows.filter((r) => r.instalment && !r.milestone);
  const middles = inst.slice(0, -1).map((r) => r.amount);
  ok(new Set(middles).size === 1, 'all non-final level instalments are identical');
  eq(rows.filter((r) => !r.maintenance).reduce((s, r) => s + r.amount, 0), u.price,
    'still sums to the price exactly');
}

section('percentage labels carry no float noise');
{
  eq(G.pctLabel(0.07), '7%', '0.07 -> "7%" not 7.000000000000001%');
  eq(G.pctLabel(0.0625), '6.25%', '0.0625 -> "6.25%"');
  eq(G.pctLabel(0.09), '9%', '0.09 -> "9%"');
  for (const plan of G.CONFIG.plans) {
    ok(!/\d{6,}/.test(G.pctLabel(plan.down)), `${plan.label}: down label has no float noise`);
  }
}

section('addMonths clamps month ends');
{
  const jan31 = new Date(2026, 0, 31);
  eq(G.addMonths(jan31, 1).getMonth(), 1, '31 Jan + 1 month is in February');
  eq(G.addMonths(jan31, 1).getDate(), 28, '31 Jan + 1 month = 28 Feb (2026)');
  eq(G.addMonths(new Date(2028, 0, 31), 1).getDate(), 29, 'leap year gives 29 Feb');
}

/* ----------------------------------------------------------------- sheet -- */
section('CSV parsing and fail-closed availability');
{
  const header = 'Building,Unit Code,Type,Net Area,Area,Outdoor,Floor,Indoor SQM Price,Outdoor SQM Price,Total Unit Price,Discount,Final Price,Availability,Admin';
  const row = (code, status, extra) =>
    `Q,${code},Retail,32,49.92,0,Sky Plaza,188000,62667,"9,384,960",15%,"7,977,216",${status},Mr/ X${extra || ''}`;

  const csv = [header,
    row('QSP-002', 'Available'),
    row('QSP-003', 'AVAILABLE '),
    row('QSP-004', 'Not Available'),
    row('QSP-005', 'Hold'),
    row('QSP-006', 'Booked'),
    row('QSP-007', 'Sold Out'),
    row('QSP-008', ''),
    row('QSP-009', 'Availabel'),
  ].join('\n');

  const { units, warnings } = G.normalizeRows(G.parseCSV(csv));
  const state = (c) => (units.find((u) => u.code === c) || {}).state;

  eq(units.length, 8, 'all eight rows parsed');
  eq(state('QSP-002'), 'available', 'Available is sellable');
  eq(state('QSP-003'), 'available', 'case and trailing space tolerated');
  eq(state('QSP-004'), 'sold', 'Not Available is not sellable');
  eq(state('QSP-005'), 'reserved', 'Hold is reserved');
  eq(state('QSP-006'), 'reserved', 'Booked is reserved');
  eq(state('QSP-007'), 'sold', 'Sold Out is not sellable');
  eq(state('QSP-008'), 'sold', 'BLANK status fails closed');
  eq(state('QSP-009'), 'sold', 'a typo fails closed');
  ok(warnings.some((w) => /blank status/i.test(w)), 'blank status is reported');

  const u = units.find((x) => x.code === 'QSP-002');
  eq(u.price, 7977216, 'price is the Final Price');
  eq(u.total, 9384960, 'total is the pre-discount price');
  near(u.discount, 0.15, 1e-9, 'discount parsed from "15%" as a fraction');
  eq(u.building, 'Q', 'building from the code');
  eq(u.floorCode, 'SP', 'floor code from the code');
  eq(u.unit, 2, 'unit number from the code');
}

section('embedded commas and quotes survive the parser');
{
  const rows = G.parseCSV('a,b\n"1,840,000.00","say ""hi"""');
  eq(rows[1][0], '1,840,000.00', 'quoted comma number kept whole');
  eq(rows[1][1], 'say "hi"', 'escaped quotes unescaped');
  eq(G.parseNumber('"1,840,000.00"'), 1840000, 'parseNumber strips formatting');
  eq(G.parseNumber(''), null, 'empty is null, not 0');
  eq(G.parseNumber('—'), null, 'dash is null, not 0');

  /* ARABIC-LOCALE NUMERALS — both workbooks have written numbers this way
     since the client replaced them on 2026-08-18. U+066B (٫) is the decimal
     point, U+066C (٬) the thousands separator.

     These are exact-value assertions on purpose. The old code stripped both
     characters instead of reading them, which did not throw and did not warn:
     it returned a number 100x too large for a rate and 10x for an area, and
     the only visible symptom was a per-metre total that no longer reconciled.
     A test that merely checked "is a number" would have passed throughout. */
  eq(G.parseNumber('  188٬000٫00 '), 188000, 'Arabic thousands + decimal separator');
  eq(G.parseNumber('34٫5'), 34.5, 'Arabic decimal separator alone');
  eq(G.parseNumber('  8٬600٬436 '), 8600436, 'Arabic thousands separators alone');
  eq(G.parseNumber('  -   '), null, 'an Arabic-formatted blank is still null');
  /* One row of the live project sheet mixes the two conventions — area "43٫68"
     beside outdoor "12.5" — so both must work in the same pass, not by
     detecting a locale for the file. */
  eq(G.parseNumber('12.5'), 12.5, 'Western decimals still parse alongside');
  eq(G.parseNumber('1,840,000.00'), 1840000, 'Western thousands still parse');
  /* Arabic-Indic digits do not appear in today's sheets. Folded anyway: a
     workbook that writes ٫ is one locale setting from writing ٠١٢. */
  eq(G.parseNumber('٢٥٠٠'), 2500, 'Arabic-Indic digits fold to Western');
  eq(G.parseNumber('۲۵۰۰'), 2500, 'extended Arabic-Indic digits fold too');
}

section('a wrong tab is refused rather than priced off');
{
  const wrong = 'Building,Type,Gross Area,Floor,Availability,Admin\nGround Plaza,Retail,1.56,Ground Plaza,Available,Mr/ X';
  const { units, warnings } = G.normalizeRows(G.parseCSV(wrong));
  eq(units.length, 0, 'no units from the validation-list tab');
  ok(/not the inventory tab/i.test(warnings[0]), 'says the tab is wrong');

  const empty = G.normalizeRows(G.parseCSV('Foo,Bar\n1,2'));
  eq(empty.units.length, 0, 'unknown headers yield nothing');
}

section('sheet arithmetic is cross-footed');
{
  const header = 'Building,Unit Code,Type,Net Area,Area,Outdoor,Floor,Indoor SQM Price,Outdoor SQM Price,Total Unit Price,Discount,Final Price,Availability';
  // Area is not net x 1.56, and the final does not match the discount.
  const bad = `${header}\nQ,QSP-010,Retail,32,99,0,Sky Plaza,188000,62667,9384960,15%,1,Available`;
  const { warnings } = G.normalizeRows(G.parseCSV(bad));
  /* The mismatch must be reported WITHOUT printing the net figure: warnings are
     rendered in the UI, and the client instructed 2026-08-12 that the net area
     never reaches a customer. The unit code is enough to find the row. */
  ok(warnings.some((w) => /gross area 99 m² does not match/.test(w)),
     'load factor mismatch reported');
  ok(!warnings.some((w) => /(^|\D)32(\D|$)/.test(w)),
     'the net area is never named in a warning');
  ok(warnings.some((w) => /≠/.test(w)), 'price mismatch reported');

  const mismatch = `${header}\nQ,QFT-011,Retail,32,49.92,0,Second Floor,188000,62667,9384960,0%,9384960,Available`;
  const w2 = G.normalizeRows(G.parseCSV(mismatch)).warnings;
  ok(w2.some((w) => /floor column says/i.test(w)), 'floor/code disagreement reported');
}

section('an unreleased floor is quiet about its missing prices');
{
  /* Ops price a floor when they release it, so every row of an unreleased floor
     is legitimately unpriced. Warning per row put "GPL-001: no usable price
     (and 180 more like it)" permanently at the top of the app, where it read as
     a defect. Suppressed on the user's instruction 2026-08-18.

     The risk in that change is silencing the warning everywhere, which would
     hide a released unit that really has lost its price — so both halves are
     asserted here, not just the one that was asked for. */
  const h = 'Unit Code,Availability,Final Price,Total Unit Price';
  const { warnings } = G.normalizeRows(G.parseCSV(
    `${h}\nGPL-001,,-,-\nQSE-999,Available,-,-`));

  ok(!warnings.some((w) => /GPL-001/.test(w)),
     'an unreleased floor does not warn about having no price');
  ok(warnings.some((w) => /QSE-999.*no usable price/.test(w)),
     'a RELEASED floor still warns when a unit has no price');

  /* The flag is what does it. Under its old name (`sellable`) it was inert, so
     a test that only checked the outcome would have passed against code that
     read nothing at all. */
  const gpl = G.CONFIG.floors.find((f) => f.code === 'GPL');
  ok(gpl && gpl.released === false, 'GPL is marked unreleased in CONFIG.floors');
  ok(G.CONFIG.floors.filter((f) => f.released === false).length === 1,
     'exactly one floor is unreleased — the rest must keep warning');
}

section('rate per metre, and the two columns with the same name');
{
  /* THE PROJECT WORKBOOK HEADS TWO DIFFERENT COLUMNS "Outdoor SQM Price" —
     the list rate and the discounted one. Matching on text alone finds the list
     rate twice, so the app would show a "discounted" rate that is really the
     list rate, and an agent would quote it. Resolved by position; this is the
     test that says so. */
  const dupHead = 'Building,Unit Code,Type,Net Area,Area,Outdoor,Floor,Indoor SQM Price,'
                + 'Final Indoor SQM Price,Outdoor SQM Price,Outdoor SQM Price,'
                + 'Total Unit Price,Discount,Final Price,Availability';
  const idx = G.mapHeaders(dupHead.split(','));
  eq(idx.outdoorPrice, 9, 'the FIRST "Outdoor SQM Price" is the list rate');
  eq(idx.outdoorPriceFinal, 10, 'the SECOND is read as the discounted rate');

  const row = 'Q,QSP-004,Retail,28,43.68,12.5,Sky Plaza,188000,159800,62667,53267,'
            + '8995173,15%,7645897,Available';
  const { units } = G.normalizeRows(G.parseCSV(`${dupHead}\n${row}`));
  eq(units.length, 1, 'the row survives');
  eq(units[0].meterPrice, 188000, 'list indoor rate read');
  eq(units[0].meterPriceFinal, 159800, 'discounted indoor rate read, not derived');
  eq(units[0].outdoorPrice, 62667, 'list outdoor rate read');
  eq(units[0].outdoorPriceFinal, 53267, 'discounted outdoor rate read from the second column');

  /* Properly named columns must still win — this is the third-floor workbook. */
  const named = dupHead.replace('Outdoor SQM Price,Outdoor SQM Price', 'Outdoor SQM Price,Final Outdoor SQM Price');
  const byName = G.mapHeaders(named.split(','));
  eq(byName.outdoorPriceFinal, 10, 'a properly named Final column is used as-is');

  /* A discounted rate that does not match the discount is the shape of a
     reordered column, so it must be rejected rather than quoted. */
  const wrong = 'Q,QSP-005,Retail,28,43.68,12.5,Sky Plaza,188000,188000,62667,62667,'
              + '8995173,15%,7645897,Available';
  const bad = G.normalizeRows(G.parseCSV(`${dupHead}\n${wrong}`));
  ok(bad.warnings.some((w) => /discounted indoor rate/.test(w)),
     'a discounted rate that ignores the discount is reported');
  eq(Math.round(bad.units[0].meterPriceFinal), Math.round(188000 * 0.85),
     'and the calculated rate is shown instead, so screen and contract agree');

  /* Blank columns: fall back to the rate the price itself implies. */
  const noFinal = 'Building,Unit Code,Type,Net Area,Area,Outdoor,Floor,Indoor SQM Price,'
                + 'Outdoor SQM Price,Total Unit Price,Discount,Final Price,Availability\n'
                + 'Q,QSP-006,Retail,32,49.92,0,Sky Plaza,188000,62667,9384960,15%,7977216,Available';
  const derived = G.normalizeRows(G.parseCSV(noFinal)).units[0];
  eq(Math.round(derived.meterPriceFinal), Math.round(188000 * 0.85),
     'with no Final column at all, the discounted rate is derived');
}

section('duplicate and malformed rows');
{
  const header = 'Building,Unit Code,Type,Net Area,Area,Outdoor,Floor,Indoor SQM Price,Outdoor SQM Price,Total Unit Price,Discount,Final Price,Availability';
  const csv = [header,
    `Q,QSP-020,Retail,32,49.92,0,Sky Plaza,188000,62667,9384960,0%,9384960,Available`,
    `Q,QSP-020,Retail,32,49.92,0,Sky Plaza,188000,62667,9384960,0%,1,Available`,
    `Q,NONSENSE,Retail,32,49.92,0,Sky Plaza,188000,62667,9384960,0%,9384960,Available`,
    `Q,QSP-021,Retail,32,49.92,0,Sky Plaza,188000,62667,,,,Available`,
  ].join('\n');
  const { units, warnings } = G.normalizeRows(G.parseCSV(csv));
  eq(units.length, 1, 'only the first QSP-020 survives; junk rows dropped');
  ok(warnings.some((w) => /duplicate/i.test(w)), 'duplicate reported');
  ok(warnings.some((w) => /not in the expected form/i.test(w)), 'bad code reported');
  ok(warnings.some((w) => /no usable price/i.test(w)), 'priceless row reported');
}

/* ----------------------------------------------------------- custom plans -- */
section('custom plans (npv.js)');
{
  const N = G.NPV;
  const when = new Date(2026, 8, 10);
  const plan = (id) => G.CONFIG.plans.find((p) => p.id === id);
  const ask = (id, down, n) => N.evaluate(plan(id), { down, instalments: n }, when);

  /* THE fairness test: a customer who changes nothing earns nothing. */
  for (const p of G.CONFIG.plans) {
    const r = ask(p.id, p.down, p.instalments);
    eq(r.neutral, 0, `${p.label} unchanged earns exactly 0`);
    eq(r.ref.id, p.id, `${p.label} unchanged is measured against itself`);
    eq(r.verdict, 'neutral', `${p.label} unchanged reads "nothing changed"`);
  }

  /* The reference is the SHORTEST standard plan his last payment fits inside. */
  eq(ask('10y', 0.5, 36).ref.id, '9y', '10y cut to 36 instalments (month 108) → measured against 9y');
  eq(ask('10y', 0.5, 33).ref.id, '9y', '10y cut to 33 (month 99) → still 9y, the shortest it fits inside');
  eq(ask('10y', 0.5, 32).ref.id, '8y', '10y cut to 32 (month 96) → 8y');
  /* RULED 2026-09-11: a plan is anchored at the term it is NAMED for. The 4
     years plan's own instalments stop in month 45, but it is sold as 4 years,
     so a plain 4-year ask (16 quarters, month 48) is measured against it
     rather than falling through to the much softer 6 years plan. */
  eq(ask('6y', 0.1, 16).ref.id, '4y', '6y cut to 16 (month 48, a plain 4 years) → 4y');
  eq(ask('6y', 0.1, 17).ref.id, '6y', '6y cut to 17 (month 51) → 6y, now past the 4 years plan');
  eq(ask('6y', 0.1, 15).ref.id, '4y', '6y cut to 15 (month 45) → 4y');
  eq(N.anchorMonth(plan('4y')), 48, 'the 4 years plan is anchored at 48 months, not its 45');
  for (const id of ['6y', '7y', '8y', '9y', '10y']) {
    eq(N.anchorMonth(plan(id)), N.lastMonth(plan(id)),
       `${id}: name and last payment already agree, so the anchor is unchanged`);
  }

  /* The warning fires on exactly the hole between the 4y and 6y plan ends. */
  const gapAt = (n) => !!ask('6y', 0.1, n).gap;
  ok(!gapAt(15) && !gapAt(16) && gapAt(17) && gapAt(23) && !gapAt(24),
     'gap warning: off at months 45 and 48, on at 51 and 69, off at 72');

  /* Direction: more down on the same plan always earns more. */
  let prev = -Infinity, rising = true;
  for (let d = 0.10; d <= 0.5001; d += 0.05) {
    const r = ask('6y', d, 24);
    if (!(r.neutral > prev)) rising = false;
    prev = r.neutral;
  }
  ok(rising, '6y: every extra 5% down earns a larger discount');
  ok(ask('8y', 0.3, 32).neutral === 0 && ask('8y', 0.3, 30).neutral > 0,
     '8y: finishing two quarters early earns a discount');

  /* An independent present value, built HERE from the plans as stated in
     EXPECTED_MILESTONE_MONTHS rather than through npv.js or engine.js — so a
     change to either that shifts the money is caught, not echoed. */
  const handPV = (down, n, msMonths, msPct) => {
    const level = (1 - down - msPct.reduce((s, p) => s + p, 0)) / n;
    const at = (months) => {
      const d = new Date(when.getFullYear(), when.getMonth() + months, 1);
      d.setDate(Math.min(when.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      return Math.round((d - when) / 86400000);
    };
    let pv = down;
    for (let i = 1; i <= n; i++) {
      const k = msMonths.indexOf(i * 3);
      pv += (level + (k >= 0 ? msPct[k] : 0)) / Math.pow(1.12, at(i * 3) / 365);
    }
    return pv;
  };
  const six = EXPECTED_MILESTONE_MONTHS['6y'];
  const hand = 1 - handPV(0.10, 24, six, [0.10]) / handPV(0.20, 24, six, [0.10]);
  const r20 = ask('6y', 0.20, 24);
  near(r20.neutral, hand, 1e-12, '6y + 10% down matches a hand-built present value');

  /* Applying it: the maximum is rounded DOWN, the price comes off the sheet's
     Final Price, and the schedule foots to the new price. */
  ok(r20.max <= r20.neutral && r20.neutral - r20.max < 0.0001, 'maximum is rounded down to 0.01%');
  const unit = { code: 'QSP-900', price: 5919056, total: 6963595, discount: 0.15, state: 'available' };
  const cut = N.applyDiscount(unit, r20.max);
  eq(cut.price, Math.round(unit.price * (1 - r20.max)), 'applied price = Final Price × (1 − discount)');
  const { rows, summary } = G.buildSchedule(cut, r20.plan, when);
  eq(rows.filter((x) => !x.maintenance).reduce((s, x) => s + x.amount, 0), cut.price,
     'custom schedule foots exactly to the reduced price');
  ok(rows.every((x) => x.amount > 0), 'custom schedule has no zero or negative payment');
  eq(summary.planDiscount, r20.max, 'summary carries the plan discount');
  eq(summary.discountAmount, unit.total - cut.price, 'saving shown = list price − new price');
  eq(summary.planLabel, 'Custom', 'the offer names it a custom plan');

  /* MAINTENANCE IS NOT TOUCHED BY A PAYMENT-TERMS DISCOUNT — ruled 2026-09-11.
     Checked against 10% of the unit's own Final Price, taken from the unit
     BEFORE applyDiscount ran, rather than from the field applyDiscount wrote.
     A test that read priceBeforePlanDiscount would be reading the thing it is
     supposed to be checking. */
  eq(summary.maintenance, Math.round(unit.price * G.CONFIG.maintenanceRate),
     'maintenance stays 10% of the price BEFORE the payment-terms discount');
  ok(summary.maintenance > Math.round(cut.price * G.CONFIG.maintenanceRate),
     'and is therefore MORE than 10% of the reduced price');
  eq(summary.totalPayable, cut.price + summary.maintenance,
     'total payable = reduced price + undiscounted maintenance');
  eq(G.scheduleTotal(rows), summary.totalPayable, 'the rows foot to that total');

  /* The percentage column has to add up to the total printed under it, so the
     maintenance row's share is derived from its amount, not restated as 10%. */
  const maintRow = rows.find((x) => x.maintenance);
  near(maintRow.pctOfBase, summary.maintenance / cut.price, 1e-12,
       'the maintenance row prints its true share of what the customer pays');
  near(rows.reduce((t, x) => t + x.pctOfBase, 0), summary.totalPayable / cut.price, 1e-9,
       'every row percentage sums to the total percentage');

  /* And the regression that matters more: an ORDINARY offer must be unchanged. */
  {
    const plain = G.buildSchedule(unit, plan('8y'), when);
    eq(plain.summary.maintenance, Math.round(unit.price * G.CONFIG.maintenanceRate),
       'no custom terms: maintenance is unchanged');
    eq(plain.rows.find((x) => x.maintenance).pctOfBase, G.CONFIG.maintenanceRate,
       'no custom terms: the maintenance row still prints exactly the rate');
  }

  /* THE TYPED DOWN PAYMENT IS WHAT THE CUSTOMER PAYS. Reported 2026-09-11:
     500,000 typed, 451,400 printed, because the share was taken of the sheet
     price and then applied to the discounted one. Checked by building the
     real schedule and reading the down payment row back, not by re-running
     the solver's own arithmetic. */
  for (const [id, n, want] of [['4y', 15, 500000], ['6y', 24, 1200000],
                               ['8y', 30, 2500000], ['10y', 36, 3000000]]) {
    for (const give of [null, 0.005]) {
      const b = plan(id);
      const f = N.downForMoney(b, n, unit.price, want, give, when);
      const r2 = N.evaluate(b, { down: f, instalments: n }, when);
      const g2 = give == null ? r2.max : Math.min(give, r2.max);
      const sched = G.buildSchedule(N.applyDiscount(unit, g2), r2.plan, when);
      ok(Math.abs(sched.summary.downPayment - want) <= 1,
         `${id}/${n} giving ${give == null ? 'the maximum' : '0.50%'}: typed `
         + `${G.fmt(want)} and the schedule pays ${G.fmt(sched.summary.downPayment)}`);
    }
  }

  /* An amount that cannot be reached must be REFUSED, not silently turned
     into a different one. Raising the down payment lowers the price it is a
     share of, so beyond a point more pounds simply cannot be handed over. */
  {
    const b = plan('10y');
    const range = N.downMoneyRange(b, 36, unit.price, null, when);
    ok(range.max < N.limits(b, 36).downMax * unit.price,
       'the biggest cheque accepted is below the sheet-price ceiling, because the price moves');
    const tooMuch = Math.round(range.max) + 50000;
    const f = N.downForMoney(b, 36, unit.price, tooMuch, null, when);
    ok(!(f <= N.limits(b, 36).downMax + 1e-9),
       `${G.fmt(tooMuch)} down over 36 quarters is out of range and is refused`);
    const okAmount = Math.round(range.max) - 1000;
    const f2 = N.downForMoney(b, 36, unit.price, okAmount, null, when);
    ok(f2 <= N.limits(b, 36).downMax + 1e-9,
       `${G.fmt(okAmount)}, just inside the quoted ceiling, is accepted`);
  }

  /* Limits: at least the base down payment, at most its instalments, and the
     down payment stops one point before the instalments would be zero. */
  const lim = N.limits(plan('10y'), 40);
  near(lim.downMax, 0.79, 1e-12, '10y: down payment can rise to 79% (20% milestones + 1% left)');
  near(N.limits(plan('10y'), 13).downMax, 0.89, 1e-12,
       '10y cut to 13 quarters: the Q14 milestone falls away, so down can rise to 89%');
  eq(ask('10y', 0.8, 40).verdict, 'invalid', 'down + milestones = 100% is refused');

  /* Moving plans when the terms do not fit the one chosen. */
  const moveTo = (from, down, n) => { const p = N.planFor(plan(from), down, n); return p ? p.id : null; };
  eq(moveTo('6y', 0.30, 32), '8y', '6y asked for 32 instalments at 30% down → moves to 8y');
  eq(moveTo('6y', 0.50, 32), '8y', '6y, 32 instalments at 50% down → 8y, the nearest that fits');
  eq(moveTo('6y', 0.50, 40), '10y', '6y, 40 instalments at 50% down → 10y');
  eq(moveTo('6y', 0.10, 32), null, '6y, 32 instalments at only 10% down → no plan fits');
  eq(moveTo('8y', 0.20, 24), '7y', '8y at 20% down, 24 instalments → 7y (nearest), not 6y');
  eq(moveTo('4y', 0.10, 16), '6y', '4y asked for 16 instalments → 6y');
  eq(moveTo('4y', 0.0625, 16), null, '4y at 6.25% down, 16 instalments → nothing (6y needs 10%)');
  eq(moveTo('8y', 0.30, 32), '8y', 'terms that already fit stay on their own plan');
  /* And moving never moves the yardstick: the same final terms reached from
     three starting plans price identically. */
  const same = ['8y', '9y', '10y'].map((id) => ask(id, 0.5, 32).neutral);
  ok(same[0] === same[1] && same[1] === same[2], '50% down / 32 instalments prices the same from 8y, 9y or 10y');

  console.log(`   worked example — 6y plan, 20% down instead of 10%: maximum ${(r20.max * 100).toFixed(2)}%`
    + ` = ${G.fmt(unit.price * r20.max)} EGP on a ${G.fmt(unit.price)} unit`);
}

/* ------------------------------------------------------------ live sheet -- */
async function live() {
  section('live sheet');
  /* BOTH workbooks, each checked on its own. The third floor is a separate
     sheet, and a silent failure there would look exactly like a floor that had
     sold out — so assert each one responds and carries units, not just that the
     merged total is non-empty. */
  const units = [], warnings = [];
  for (const source of G.CONFIG.sheets) {
    const res = await fetch(source.urls[0], { cache: 'no-store' });
    ok(res.ok, `${source.label} responds ${res.status}`);
    const text = await res.text();
    ok(!/^\s*</.test(text), `${source.label} returns CSV, not a login page`);
    const got = G.normalizeRows(G.parseCSV(text));
    ok(got.units.length > 0, `${source.label} parsed ${got.units.length} units`);
    units.push(...got.units);
    warnings.push(...got.warnings);
  }
  ok(units.length > 0, `parsed ${units.length} units across ${G.CONFIG.sheets.length} workbooks`);

  const codes = new Set();
  const clash = units.filter((u) => (codes.has(u.code) ? true : (codes.add(u.code), false)));
  ok(!clash.length, `no unit code appears in two workbooks${clash.length ? ` (${clash[0].code})` : ''}`);

  /* The whole point of this build: the team using it may sell the third floor.
     If TH ever stops arriving, the app still looks healthy and simply offers
     nothing on that floor, which is the failure nobody would notice. */
  const th = units.filter((u) => u.floorCode === 'TH');
  ok(th.length > 0, `third floor present — ${th.length} units, ${th.filter((u) => u.state === 'available').length} available`);

  const avail = units.filter((u) => u.state === 'available');
  console.log(`   ${units.length} units, ${avail.length} available, ${warnings.length} warnings`);
  warnings.slice(0, 8).forEach((w) => console.log(`   ! ${w}`));

  // Every real unit must produce a schedule that foots, on every plan.
  let checked = 0;
  for (const u of units) {
    for (const plan of G.CONFIG.plans) {
      const { rows, summary } = G.buildSchedule(u, plan, new Date(2026, 7, 5));
      const paid = rows.filter((r) => !r.maintenance).reduce((s, r) => s + r.amount, 0);
      if (paid !== u.price) { ok(false, `${u.code}/${plan.id}: sums to ${paid}, not ${u.price}`); }
      else if (!rows.every((r) => r.amount > 0)) { ok(false, `${u.code}/${plan.id}: non-positive row`); }
      else checked++;
    }
  }
  ok(true, `${checked} live schedules all foot exactly`);
}

/* --------------------------------------------------------- worked example -- */
function worked() {
  const u = { code: 'QSP-033', total: 7398820, discount: 0.20, price: 5919056 };
  const plan = G.CONFIG.plans.find((p) => p.id === '8y');
  const { rows, summary } = G.buildSchedule(u, plan, new Date(2026, 7, 5));
  console.log(`\n══ Worked example — ${u.code}, ${plan.label} plan`);
  console.log(`   List price      ${G.fmt(summary.listPrice)} EGP`);
  console.log(`   Discount ${(summary.discountPct * 100).toFixed(0)}%     -${G.fmt(summary.discountAmount)} EGP`);
  console.log(`   Price           ${G.fmt(summary.price)} EGP`);
  console.log(`   Down ${(plan.down * 100).toFixed(0)}%         ${G.fmt(summary.downPayment)} EGP`);
  console.log(`   ${summary.instalmentCount} quarterly × ${G.fmt(summary.instalmentAmount)} EGP`);
  console.log(`   Maintenance ${G.pctLabel(G.CONFIG.maintenanceRate)}  ${G.fmt(summary.maintenance)} EGP  (month ${G.CONFIG.maintenanceDueMonth})`);
  console.log(`   Total payable   ${G.fmt(summary.totalPayable)} EGP`);
  console.log('   first six rows:');
  rows.slice(0, 6).forEach((r) =>
    console.log(`     ${String(r.month).padStart(3)}mo  ${G.fmt(r.amount).padStart(12)}  ${r.label}`));
  const ms = rows.filter((r) => r.milestone);
  ms.forEach((r) => console.log(`     ${String(r.month).padStart(3)}mo  ${G.fmt(r.amount).padStart(12)}  ${r.label}`));
}

/* The Arabic UI, checked the only way it usefully can be from here.
 *
 * A missing translation key is the characteristic bug of a bilingual app and is
 * nearly invisible — t() falls back to English, so a half-translated screen
 * ships unless somebody happens to look at that exact panel in that exact
 * language. check-i18n.js holds the two dictionaries to each other and to the
 * call sites; running it from here means it cannot be forgotten. */
function i18nCheck() {
  const { problems } = require('./check-i18n.js');
  ok(problems.length === 0, 'i18n: EN and AR dictionaries consistent');
  problems.forEach((p) => ok(false, `i18n: ${p}`));
}

/* The Arabic SHAPER, which is the other half of the same problem.
 *
 * check-i18n proves the strings exist; this proves they survive the journey
 * onto the page. They are separate failures: jsPDF's own Arabic parser dropped
 * three letters out of "بيانات الوحدة" without raising anything, so "the PDF
 * generated without an error" is not evidence of anything here. */
function arabicCheck() {
  const r = require('./test-arabic.js');
  ok(r.fail === 0, `arabic: shaping, ordering and no lost letters (${r.pass} checks)`);
  r.failures.forEach((f) => ok(false, `arabic: ${f}`));
}

/* The build stamp has to be identical in three files.
 *
 * index.html asks for `js/app.js?v=N`; sw.js precaches the shell at exactly
 * those URLs and names its cache after the same N. A cache lookup matches the
 * WHOLE url including the query, so if the two drift, every precached file
 * becomes unreachable and the app quietly loses offline support while looking
 * completely healthy online — the kind of fault nobody finds until an agent is
 * somewhere with no signal. `node scripts/bump-build.js` keeps them in step;
 * this makes forgetting it fail the suite instead of shipping. */
function buildStampCheck() {
  const fs = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  const sw = /const BUILD = '(\d+)';/.exec(read('sw.js'));
  ok(!!sw, 'sw.js declares a BUILD number');
  if (!sw) return;
  const build = sw[1];

  const html = read('index.html');
  const stamps = [...html.matchAll(/(?:src|href)="((?:js|css)\/[\w.-]+)(\?v=(\d+))?"/g)];
  const unstamped = stamps.filter((m) => !m[2]).map((m) => m[1]);
  const wrong = stamps.filter((m) => m[3] && m[3] !== build).map((m) => `${m[1]}?v=${m[3]}`);

  ok(stamps.length > 0, `index.html references ${stamps.length} code assets`);
  ok(!unstamped.length,
     `every code asset in index.html carries ?v= (${unstamped.join(', ') || 'all stamped'})`);
  ok(!wrong.length,
     `every stamp matches sw.js BUILD=${build} (${wrong.join(', ') || 'all match'})`);

  // Prefix captured, not spelled out — same file in every app on this stack.
  const version = /version: '[\w-]+?-v(\d+)'/.exec(read('js/config.js'));
  ok(version && version[1] === build,
     `js/config.js telemetry version is v${build}` + (version ? ` (found v${version[1]})` : ''));
}

(async () => {
  if (process.argv.includes('--live')) {
    try { await live(); } catch (e) { ok(false, `live sheet: ${e.message}`); }
  }
  worked();
  i18nCheck();
  arabicCheck();
  buildStampCheck();

  /* Confirmed by the client 2026-09-04 (see config.js), so this is no longer an
     open question — but it stays printed after every run, because these are the
     rules every schedule in the app is built on. */
  console.log('\n══ Plan terms, as confirmed by the client 2026-09-04');
  G.ASSUMPTIONS.forEach((a) => console.log(`   • ${a}`));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { failures.forEach((f) => console.log(`   ✗ ${f}`)); process.exit(1); }
})();
