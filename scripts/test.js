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

const src = ['js/config.js', 'js/sheet.js', 'js/engine.js']
  .map(read)
  .join('\n')
  /* Each file ends with a CommonJS export guard. Deleting the block by regex
   * unbalances the braces (it eats the `if (...) {` and leaves the `}`), so
   * make the condition false instead: the block stays syntactically whole and
   * simply never runs. */
  .replace(/typeof module !== 'undefined'/g, 'false');

const G = new Function(`${src}
  return { CONFIG, ASSUMPTIONS, parseCSV, parseNumber, normalizeRows, parseUnitCode,
           buildSchedule, scheduleByYear, scheduleTotal, levelRate, milestonesFor,
           pctLabel, addMonths, fmt };`)();

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
section('plan definitions foot to 100%');
for (const plan of G.CONFIG.plans) {
  const ms = G.milestonesFor(plan);
  const msTotal = Object.values(ms).reduce((s, p) => s + p, 0);
  const level = G.levelRate(plan);
  const total = plan.down + msTotal + level * plan.instalments;
  near(total, 1, 1e-12, `${plan.label}: down + milestones + instalments = 100%`);
  ok(level > 0, `${plan.label}: level instalment rate is positive`);
  eq(Object.keys(ms).length, plan.milestones ? 3 : 0, `${plan.label}: milestone count`);
}

/* Against the client's own displayed percentages. Their tabs are rounded to
 * 2dp, so we assert the derived rate matches to within half a displayed unit. */
section('derived rates match the client tabs');
{
  const expected = { '4y': 6.25, '6y': 3.75, '7y': 2.14, '8y': 1.56, '9y': 1.11, '10y': 0.75 };
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
      eq(summary.maintenance, Math.round(u.price * 0.09), `${label}: maintenance is 9%`);

      // Dates must march forward, and the term must match the plan.
      const months = rows.map((r) => r.month);
      ok(months.every((m, i) => i === 0 || m >= months[i - 1]), `${label}: months are ordered`);
      const lastInst = rows.filter((r) => r.instalment).pop();
      eq(lastInst.month, plan.instalments * 3, `${label}: term is ${plan.instalments * 3} months`);

      // Milestones land where the client's tabs put them.
      const milestoneMonths = rows.filter((r) => r.milestone).map((r) => r.month);
      if (plan.milestones) {
        ok(milestoneMonths.join(',') === '12,24,36',
          `${label}: milestones at months 12/24/36 — got ${milestoneMonths.join(',')}`);
      } else {
        eq(milestoneMonths.length, 0, `${label}: no milestones`);
      }
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

/* ------------------------------------------------------------ live sheet -- */
async function live() {
  section('live sheet');
  const res = await fetch(G.CONFIG.sheetUrls[0], { cache: 'no-store' });
  ok(res.ok, `sheet responds ${res.status}`);
  const text = await res.text();
  ok(!/^\s*</.test(text), 'response is CSV, not a login page');

  const { units, warnings } = G.normalizeRows(G.parseCSV(text));
  ok(units.length > 0, `parsed ${units.length} units`);
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
  console.log(`   Maintenance 9%  ${G.fmt(summary.maintenance)} EGP  (month ${G.CONFIG.maintenanceDueMonth})`);
  console.log(`   Total payable   ${G.fmt(summary.totalPayable)} EGP`);
  console.log('   first six rows:');
  rows.slice(0, 6).forEach((r) =>
    console.log(`     ${String(r.month).padStart(3)}mo  ${G.fmt(r.amount).padStart(12)}  ${r.label}`));
  const ms = rows.filter((r) => r.milestone);
  ms.forEach((r) => console.log(`     ${String(r.month).padStart(3)}mo  ${G.fmt(r.amount).padStart(12)}  ${r.label}`));
}

(async () => {
  if (process.argv.includes('--live')) {
    try { await live(); } catch (e) { ok(false, `live sheet: ${e.message}`); }
  }
  worked();

  console.log('\n══ Assumptions still to be settled by a signed sample offer');
  G.ASSUMPTIONS.forEach((a) => console.log(`   • ${a}`));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { failures.forEach((f) => console.log(`   ✗ ${f}`)); process.exit(1); }
})();
