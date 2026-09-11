/* Custom payment plans — "he wants better terms than the standard plan, what
 * discount has he earned?"
 *
 * The same method as the Qomor Deal Desk workbook, brought into the app so an
 * agent can answer it in front of the customer and put the answer on the offer.
 *
 * ── THE ONE IDEA ───────────────────────────────────────────────────────────
 * Every plan is worth some fraction of the price TODAY. Pay more up front, or
 * finish sooner, and that fraction rises. So the company can give back exactly
 * what the better terms are worth — and not a pound more:
 *
 *     maximum discount  =  1 − PV(standard plan) / PV(his plan)
 *
 * At exactly that discount the company is indifferent between the two. It is a
 * CEILING, not an offer: whatever the agent keeps below it is margin, which is
 * why the panel always shows "discount to give" beside the maximum.
 *
 * ── WHICH STANDARD PLAN HE IS MEASURED AGAINST ─────────────────────────────
 * Nobody chooses it. It is the SHORTEST standard plan his own last payment still
 * fits inside. Letting a person pick the comparison lets the same concession look
 * big or small depending only on which plan they picked; snapping to the NEAREST
 * plan lets a plan be stretched a quarter into a softer yardstick. Both were
 * tried in the workbook and both leaked money. Do not change this rule here
 * without changing it there in the same session.
 *
 * ── WHAT IS IN THE PRESENT VALUE ───────────────────────────────────────────
 * Down payment, instalments and milestone top-ups — the price. NOT maintenance:
 * it is charged on top of the price and falls at month 42 whatever plan is
 * chosen. Dates are real calendar dates from today, discounted Actual/365, the
 * workbook's own method.
 *
 * The cash flows are built from the SAME helpers the schedule uses —
 * milestonesFor() and levelRate() in engine.js — so the plan that is priced here
 * is the plan that prints, milestone for milestone.
 */

const NPV = (() => {
  const every = () => CONFIG.instalmentEveryMonths;

  /* The month of his LAST payment. The engine puts instalment i at month i × 3
     (the first falls three months after contract), so the last is n × 3. If the
     engine ever gains a delayed first instalment this must follow it: a term is
     read from payment DATES, and the workbook's second term-lock bug came from
     forgetting that. */
  const lastMonth = (plan) => plan.instalments * every();

  /* The term a standard plan is SOLD as, in months, read from its own label.

     THE 4 YEARS PLAN DOES NOT LAST 4 YEARS. Its 15 quarterly instalments end
     in month 45, which is 3.75 years, and every other plan lands exactly on
     its name. Anchoring it at 45 meant a customer asking for a plain 4 years
     (16 quarters, month 48) fell past it and was measured against the 6 years
     plan instead — a softer yardstick that handed him a far bigger discount
     for three months more. Ruled 2026-09-11: a plan is anchored at the term
     it is NAMED for, so 4 years means 4 years.

     Read from the label rather than typed in again, because the label is the
     name the client sells under and a second copy of it would be one edit away
     from disagreeing. Never BELOW the real last payment: a plan whose name
     understated its own length would otherwise be anchored before it ends.
     A custom plan has no such name and simply anchors at its last payment. */
  function namedMonths(plan) {
    const m = /^\s*(\d+(?:\.\d+)?)/.exec(String(plan.label || ''));
    return m ? Math.round(Number(m[1]) * 12) : 0;
  }
  const anchorMonth = (plan) => Math.max(namedMonths(plan), lastMonth(plan));

  /** Every payment towards the price, as {month, pct} of the price. */
  function flows(plan) {
    const ms = milestonesFor(plan);
    const level = levelRate(plan);
    const out = [{ month: 0, pct: plan.down }];
    for (let i = 1; i <= plan.instalments; i++) {
      out.push({ month: i * every(), pct: level + (ms[i] || 0) });
    }
    return out;
  }

  /** Present value of a plan, as a FRACTION of its price. */
  function pv(plan, contractDate, rate) {
    const base = contractDate || new Date();
    const r = rate == null ? CONFIG.npv.rate : rate;
    return flows(plan).reduce((sum, f) => {
      /* Whole days, rounded: local dates can straddle a clock change, and an
         hour of daylight saving is not a day of interest. */
      const days = Math.round((addMonths(base, f.month) - base) / 86400000);
      return sum + f.pct / Math.pow(1 + r, days / 365);
    }, 0);
  }

  /** The standard plans, shortest first — read from CONFIG, never restated. */
  const ladder = () => CONFIG.plans.slice().sort((a, b) => anchorMonth(a) - anchorMonth(b));

  /** The shortest standard plan his last payment fits inside. Past the longest
      plan he is measured against the longest, and reads as a premium. */
  function referenceFor(plan) {
    /* HIS last payment against THEIR advertised term — the two sides of this
       comparison are deliberately different. He is measured by when his money
       actually arrives; they are measured by what they are sold as. */
    const m = lastMonth(plan);
    const all = ladder();
    return all.find((p) => anchorMonth(p) >= m) || all[all.length - 1];
  }

  /* Where two neighbouring standard plans end more than a year apart, anything
     landing between them is measured against the longer one, and that flatters
     it. No comparison rule can remove this — the price list has the hole — so
     the panel says so instead. Derived from the plans, so it moves with them. */
  function gapAround(plan) {
    const m = lastMonth(plan), all = ladder();
    for (let k = 1; k < all.length; k++) {
      const a = anchorMonth(all[k - 1]), b = anchorMonth(all[k]);
      if (b - a > 12 && m > a && m < b) return { from: all[k - 1], to: all[k] };
    }
    return null;
  }

  /** His plan: the base plan's shape and milestones, with his down payment and
      his number of instalments. A milestone whose quarter no longer exists falls
      away (milestonesFor does that) and its share is spread over what is left. */
  function customPlan(base, terms) {
    return {
      id: 'custom',
      label: 'Custom',
      custom: true,
      baseId: base.id,
      down: terms.down,
      instalments: terms.instalments,
      milestones: base.milestones,
    };
  }

  /* What the agent may type. Only BETTER terms than the plan he started from:
     at least its down payment, at most its number of instalments. The down
     payment stops one point short of leaving nothing for the instalments,
     because a schedule of zero payments is not a plan. */
  function limits(base, instalments) {
    const ms = milestonesFor(Object.assign({}, base, { instalments }));
    const msTotal = Object.values(ms).reduce((s, p) => s + p, 0);
    return {
      downMin: base.down,
      downMax: Math.max(base.down, 1 - msTotal - 0.01),
      instMin: 1,
      instMax: base.instalments,
    };
  }

  /** The answer for one set of terms. */
  function evaluate(base, terms, contractDate) {
    const plan = customPlan(base, terms);
    const level = levelRate(plan);
    const ref = referenceFor(plan);
    const pvRef = pv(ref, contractDate);
    const pvWant = pv(plan, contractDate);
    const neutral = pvWant > 0 ? 1 - pvRef / pvWant : 0;

    let verdict = 'earn';
    if (!(level > 0)) verdict = 'invalid';
    else if (Math.abs(neutral) < 5e-7) verdict = 'neutral';   // nothing changed
    else if (neutral < 0) verdict = 'premium';                 // worth LESS than the yardstick

    /* Rounded DOWN to 0.01%, so the figure the agent can apply never exceeds
       what the terms are actually worth. */
    const max = verdict === 'earn' ? Math.floor(neutral * 10000 + 1e-9) / 10000 : 0;

    return {
      plan, ref, pvRef, pvWant, neutral, max, level, verdict,
      lastMonth: lastMonth(plan),
      gap: gapAround(plan),
    };
  }

  /** The unit as the offer should see it once a discount is given: the price
      comes down, everything else is the sheet's. The plan discount is recorded
      so the PDF and the WhatsApp text can say where the saving came from. */
  function applyDiscount(unit, give) {
    const g = Math.max(0, Number(give) || 0);
    return Object.assign({}, unit, {
      price: Math.round(unit.price * (1 - g)),
      planDiscount: g,
      priceBeforePlanDiscount: unit.price,
    });
  }

  /* The passcode is compared as a SHA-256 fingerprint so the digits are not
     sitting in the page source. It is a speed bump, not security: this is a
     public static site, the check runs in the browser, and a four-digit code
     can be tried exhaustively in a moment. It keeps the panel away from casual
     hands — nothing more. crypto.subtle needs https or localhost. */
  async function checkCode(code) {
    if (!window.crypto || !crypto.subtle) throw new Error('insecure');
    const bytes = new TextEncoder().encode(String(code).trim());
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex === CONFIG.npv.passcodeHash;
  }

  /**
   * The least and the most the customer can actually hand over on contract.
   *
   * NOT simply the down-payment limits times the price. Raising the down
   * payment earns a discount, the discount lowers the price, and the money is
   * a share OF that lowered price — so the largest cheque the panel can accept
   * is well under downMax of the sheet price. Quoting the sheet-price figure
   * would print a range whose top end is refused the moment it is typed.
   */
  function downMoneyRange(base, instalments, price, give, contractDate) {
    const lim = limits(base, instalments);
    const at = (f) => {
      const r = evaluate(base, { down: f, instalments }, contractDate);
      const g = r.verdict === 'earn'
        ? (give == null ? r.max : Math.min(Math.max(give, 0), r.max))
        : 0;
      return f * price * (1 - g);
    };
    return { min: at(lim.downMin), max: at(lim.downMax) };
  }

  /**
   * The down-payment FRACTION that makes the customer actually pay `money`.
   *
   * MONEY IS CIRCULAR HERE, and that is the whole reason this exists. The
   * schedule is built on the price AFTER the discount, so a down payment held
   * as a share of the SHEET price comes out smaller than the agent typed —
   * 500,000 printed as 451,400 on a real offer, reported 2026-09-11. What the
   * agent means is "the customer hands over this much on contract", so the
   * fraction has to be the one that still produces that money once the
   * discount those very terms earn has come off the price:
   *
   *     f  =  money / (price × (1 − discount(f)))
   *
   * Solved by repeated substitution. The loop gain is f × d(discount)/df,
   * which is about 0.02 at a small down payment and stays under 0.3 at the
   * largest this panel allows, so it converges in a few passes; the early
   * exit ends it long before the cap.
   *
   * `give` is how much of the maximum is actually being given — null for all
   * of it. It belongs here because giving less means a higher price means a
   * smaller fraction, and the money has to stay put either way.
   */
  function downForMoney(base, instalments, price, money, give, contractDate) {
    if (!(price > 0) || !Number.isFinite(money)) return NaN;
    let f = money / price;
    for (let i = 0; i < 40; i++) {
      const lim = limits(base, instalments);
      /* Price the CLAMPED guess. An out-of-range fraction produces a nonsense
         plan whose discount could walk the iteration somewhere it cannot come
         back from. The UNCLAMPED value is what is returned, so the caller
         still sees — and refuses — an entry that does not fit. */
      const probe = Math.min(Math.max(f, lim.downMin), lim.downMax);
      const r = evaluate(base, { down: probe, instalments }, contractDate);
      const g = r.verdict === 'earn'
        ? (give == null ? r.max : Math.min(Math.max(give, 0), r.max))
        : 0;
      const next = money / (price * (1 - g));
      if (Math.abs(next - f) < 1e-12) return next;
      f = next;
    }
    return f;
  }

  /** Can these terms be built on this plan — its down payment or more, its
      instalments or fewer, and something left for the instalments? */
  function fits(base, down, n) {
    if (!(Number.isInteger(n) && n >= 1 && n <= base.instalments)) return false;
    const lim = limits(base, n);
    return down >= lim.downMin - 1e-9 && down <= lim.downMax + 1e-9;
  }

  /* The plan to move to when the agent types terms the chosen plan cannot hold
     — 32 instalments on the 6-year plan, or 20% down on the 8-year. Of the
     plans that CAN hold them, the one nearest the plan he started from, so the
     schedule changes as little as possible. Null when no plan can.
     This only picks the starting shape (which lump sums the plan keeps). What
     the deal is COMPARED against is still referenceFor(), which reads nothing
     but his final terms — so moving plans cannot move the discount's yardstick. */
  function planFor(current, down, n) {
    const all = ladder();
    const at = (p) => all.findIndex((q) => q.id === p.id);
    const ci = at(current);
    const ok = all.filter((p) => fits(p, down, n));
    ok.sort((a, b) => Math.abs(at(a) - ci) - Math.abs(at(b) - ci) || at(a) - at(b));
    return ok[0] || null;
  }

  return { evaluate, limits, applyDiscount, checkCode, pv, flows, referenceFor, lastMonth,
           customPlan, gapAround, fits, planFor, ladder, downForMoney, anchorMonth,
           downMoneyRange };
})();

if (typeof module !== 'undefined') module.exports = { NPV };
