/* Payment schedule maths — Qomor Business Plaza.
 *
 * Terms derived from the client's own payment-plan tabs (see config.js).
 * Six plans, all quarterly:
 *
 *   plan   down    instalments  term    milestones
 *   4y     6.25%   15           45 mo   none
 *   6y     10%     24           72 mo   none
 *   7y     20%     28           84 mo   +5% Q4, +5% Q8, +10% Q14
 *   8y     30%     32           96 mo   same
 *   9y     40%     36          108 mo   same
 *   10y    50%     40          120 mo   same
 *
 * The level quarterly rate is DERIVED, never transcribed:
 *
 *     level = (1 - down - sum(milestones)) / instalments
 *
 * This matters. The client's tabs display rounded percentages — 2.14%, 1.56%,
 * 1.11% — which sum to 99.92%-100%, i.e. they do NOT foot. Transcribing those
 * display values would leave up to 0.08% of the price unpaid, which on a
 * 10,000,000 unit is 8,000 EGP going missing from a customer's schedule.
 * Deriving the rate and absorbing the drift in the final instalment means the
 * rows always sum to the price exactly.
 *
 * The four commercial rules behind this — discounted base, maintenance, first
 * instalment date, no extra fees — were CONFIRMED by the client 2026-09-04.
 * They are listed in CONFIG's ASSUMPTIONS and printed by the tests. Still not
 * cross-checked against an issued offer document; see the note in config.js.
 */

const round = (n) => Math.round(n);

/** Add whole months, clamping to the last day when the target month is shorter
 *  (31 Jan + 1 month -> 28/29 Feb, not 2/3 March). */
function addMonths(date, months) {
  const d = new Date(date.getTime());
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return d;
}

const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** The milestone top-ups that apply to a plan, as a quarter -> fraction map.
 *
 * `plan.milestones` is one of:
 *   false      no milestones,
 *   true       the standard set in CONFIG.milestones (5% Q4, 5% Q8, 10% Q12),
 *   an array   this plan's OWN set — the 6-year plan carries a single 10% at
 *              delivery, which is not the standard three-milestone shape.
 *
 * Whatever comes back, levelRate() subtracts its total from the amount spread
 * over the instalments, so the plan still foots to exactly 100%. A milestone can
 * never be stacked on top of an already-complete schedule. */
function milestonesFor(plan) {
  if (!plan.milestones) return {};
  const list = Array.isArray(plan.milestones) ? plan.milestones : CONFIG.milestones;
  const map = {};
  for (const m of list) {
    if (m.quarter <= plan.instalments) map[m.quarter] = m.pct;
  }
  return map;
}

/** The level quarterly rate, derived so the plan foots to exactly 100%. */
function levelRate(plan) {
  const ms = milestonesFor(plan);
  const msTotal = Object.values(ms).reduce((s, p) => s + p, 0);
  return (1 - plan.down - msTotal) / plan.instalments;
}

/**
 * Build the full payment schedule for a unit under a plan.
 *
 * `basePrice` is the price the plan is calculated on — the sheet's Final Price,
 * i.e. after the per-unit discount. Maintenance is calculated on the same base.
 * Both are assumptions pending a sample offer; change them here, nothing
 * downstream hard-codes either.
 *
 * `contractDate` anchors the calendar: it is the day the proposal is generated,
 * so every due date derives from it.
 *
 * @returns {{rows: Array, summary: Object}}
 */
function buildSchedule(unit, plan, contractDate = new Date()) {
  const listPrice = unit.total != null ? unit.total : unit.price;
  const base = unit.price;                     // Final Price — see above
  const maintenance = round(base * CONFIG.maintenanceRate);
  const at = (month) => addMonths(contractDate, month);

  const ms = milestonesFor(plan);
  const level = levelRate(plan);

  const rows = [];
  const down = round(base * plan.down);
  /* Every row carries BOTH an English `label`/`when` and a language-neutral
   * `labelKey`. The strings stay exactly as they were — the tests assert on
   * them and the PDF prints them — while the Arabic UI renders from the key
   * instead (see tRowLabel in i18n.js). Adding the key rather than replacing
   * the string is what keeps this change invisible to everything downstream. */
  rows.push({
    month: 0,
    label: 'Down payment',
    labelKey: { kind: 'down' },
    when: monthLabel(0),
    date: at(0),
    amount: down,
    pctOfBase: plan.down,
    down: true,
  });

  /* Build the instalments at full precision first, then settle the rounding
   * once at the end. Rounding each row independently and hoping is how a
   * schedule ends up a few pounds short of the price it claims to total. */
  const raw = [];
  for (let i = 1; i <= plan.instalments; i++) {
    const pct = level + (ms[i] || 0);
    raw.push({ i, pct, exact: base * pct });
  }

  let running = down;
  raw.forEach((r, n) => {
    const isLast = n === raw.length - 1;
    // The last instalment absorbs all accumulated drift, so rows sum exactly.
    const amount = isLast ? base - running : round(r.exact);
    running += amount;
    const month = r.i * CONFIG.instalmentEveryMonths;
    rows.push({
      month,
      label: ms[r.i]
        ? `Instalment ${r.i} of ${plan.instalments} (includes ${pctLabel(ms[r.i])} milestone)`
        : `Instalment ${r.i} of ${plan.instalments}`,
      labelKey: {
        kind: 'instalment',
        i: r.i,
        n: plan.instalments,
        milestone: ms[r.i] ? pctLabel(ms[r.i]) : null,
      },
      when: monthLabel(month),
      date: at(month),
      amount,
      pctOfBase: r.pct,
      instalment: true,
      milestone: !!ms[r.i],
    });
  });

  rows.push({
    month: CONFIG.maintenanceDueMonth,
    label: `Maintenance (${pctLabel(CONFIG.maintenanceRate)})`,
    labelKey: { kind: 'maintenance', pct: pctLabel(CONFIG.maintenanceRate) },
    when: monthLabel(CONFIG.maintenanceDueMonth),
    date: at(CONFIG.maintenanceDueMonth),
    amount: maintenance,
    pctOfBase: CONFIG.maintenanceRate,
    maintenance: true,
    note: 'Due on delivery',
  });

  // Same-month ties: down payment first, then instalments, then maintenance.
  const rank = (r) => (r.down ? 0 : r.instalment ? 1 : 2);
  rows.sort((a, b) => a.month - b.month || rank(a) - rank(b));

  const instalments = rows.filter((r) => r.instalment);
  const levelRows = instalments.filter((r) => !r.milestone);

  return {
    rows,
    summary: {
      planId: plan.id,
      planLabel: plan.label,
      contractDate,
      listPrice,                                   // Total Unit Price, pre-discount
      discountPct: unit.discount || 0,
      discountAmount: round(listPrice - base),
      price: base,                                 // Final Price — the plan's base
      downPayment: down,
      downPct: plan.down,
      instalmentCount: plan.instalments,
      instalmentAmount: levelRows.length ? levelRows[0].amount : 0,
      levelPct: level,
      milestoneRows: instalments.filter((r) => r.milestone).length,
      termMonths: plan.instalments * CONFIG.instalmentEveryMonths,
      deliveryDate: at(CONFIG.deliveryMonth),
      maintenance,
      totalPayable: base + maintenance,
    },
  };
}

/**
 * Group a schedule into year blocks, the way the payment tables present it.
 * Anything on the contract date sits in its own block ahead of year 1.
 */
function scheduleByYear(rows, base) {
  const yearOf = (m) => (m === 0 ? 0 : Math.ceil(m / 12));
  const blocks = [];

  for (const r of rows) {
    const year = yearOf(r.month);
    let block = blocks.find((b) => b.year === year);
    if (!block) {
      block = { year, label: year === 0 ? 'On contract' : `Year ${year}`, rows: [], total: 0 };
      blocks.push(block);
    }
    block.rows.push({ ...r, pct: base ? (r.amount / base) * 100 : 0 });
    block.total += r.amount;
  }

  blocks.sort((a, b) => a.year - b.year);
  for (const b of blocks) b.pct = base ? (b.total / base) * 100 : 0;
  return blocks;
}

/** "3.21%" — two decimals throughout so the column stays a readable stack. */
const fmtPct = (n) => `${(n || 0).toFixed(2)}%`;

/**
 * A rate held as a fraction, written as a percentage: 0.07 -> "7%".
 *
 * Not just `frac * 100`: in floating point that gives 7.000000000000001, which
 * had reached a customer PDF on an earlier build.
 */
const pctLabel = (frac) => `${+(frac * 100).toFixed(4)}%`;

/** 0 -> "On contract", 3 -> "Month 3", 12 -> "Year 1", 18 -> "Year 1 + 6 months". */
function monthLabel(m) {
  if (m === 0) return 'On contract';
  if (m % 12 === 0) return `Year ${m / 12}`;
  if (m < 12) return `Month ${m}`;
  const y = Math.floor(m / 12), r = m % 12;
  return `Year ${y} + ${r} month${r === 1 ? '' : 's'}`;
}

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(Math.round(n));

const fmtMoney = (n) => `${fmt(n)} ${CONFIG.currency}`;

/** Sanity check used by the tests and at load: every schedule must sum correctly. */
function scheduleTotal(rows) {
  return rows.reduce((s, r) => s + r.amount, 0);
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildSchedule, scheduleByYear, scheduleTotal, monthLabel,
    levelRate, milestonesFor, fmt, fmtMoney, fmtPct, pctLabel, addMonths, fmtDate,
  };
}
