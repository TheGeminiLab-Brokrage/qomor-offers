/* Step 0 — search by budget.
 *
 * The rest of the app asks: which building, which floor, which unit, then what
 * does it cost. Customers arrive with the answer to the last question and
 * nothing else — "I have a million and a half and I can do sixty a month". This
 * searches in that direction: every available unit against all six plans,
 * keeping the combinations the budget actually covers.
 *
 * It OWNS NOTHING. Picking a result calls the same selectBuilding / selectFloor
 * / selectUnit that the masterplan pins and the unit list call, so the offer,
 * the schedule, the PDF and the WhatsApp post are reached by exactly one path
 * and this screen cannot drift out of step with them.
 *
 * THE ONE THING TO GET RIGHT IS THE MONTHLY FIGURE. Instalments are QUARTERLY
 * (CONFIG.instalmentEveryMonths = 3), so a customer's "per month" is a third of
 * an instalment they will never actually be billed. It is the headline because
 * that is how people hold a budget, but the quarterly amount they really pay is
 * printed beside it every time, never instead of it.
 *
 * AND THE SCHEDULE IS NOT LEVEL. The 6/7/8/9/10-year plans carry milestone
 * top-ups — +5% at Q4, +5% at Q8, +10% at Q14 for most of them — so three
 * quarters are far larger than the rest, and 10% maintenance falls due at month
 * 42 on every plan.
 *
 * WHICH PAYMENT THE BUDGET IS TESTED AGAINST IS A QUESTION THIS SCREEN ASKS,
 * AND IT HAS NO DEFAULT (user's decision, 2026-09-04). The first cut defaulted
 * to the largest instalment, reasoning that a customer should be qualified
 * against the biggest payment they face. That rejected plans they can plainly
 * afford: GPL-001 on the 9-year plan is 1,485,120 down and 41,253 a quarter —
 * about 13,750 a month — and it was refused at a 60,000 budget because its
 * single delivery milestone is 412,533. The opposite default is no safer: it
 * qualifies a customer on a plan carrying three payments ten times the size of
 * the rest. At 1,500,000 / 60,000 the two readings return 168 units and 104.
 *
 * So `S.strict` is null until an agent answers, and null renders the question
 * instead of a result. Do not give it a starting value to make the screen look
 * finished on load — an agent reads whatever is on screen and never notices a
 * switch they did not have to touch, which is a default wearing a disguise.
 */
const afford = (function () {

  const $ = (id) => document.getElementById(id);

  const S = {
    down: 0,
    monthly: 0,
    building: '',
    type: '',
    floor: '',
    sort: 'area-desc',
    /* null = unanswered. Not false — false is a real answer, and the difference
       between "not asked yet" and "covered separately" is the whole design. */
    strict: null,
    open: false,
    /* Every unit x plan pair, priced once when the inventory lands. ~180
       available units against six plans is a few milliseconds of work, so the
       budget can be re-tested on every keystroke without rebuilding anything. */
    combos: [],
    available: 0,
    hits: [],
    picked: {},          // unit code -> the plan the agent tapped on that card
    shown: 3,
  };

  /* THREE at a time (user's instruction, 2026-09-04). A budget that fits 168
     units is a wall of cards nobody reads, and the useful ones are at the top
     because the list is sorted. Three fills a phone screen without scrolling
     past the answer, and "show more" is there for the rest. */
  const PAGE = 3;

  /* ------------------------------------------------------------ numbers -- */

  /* Western digits in both languages — the client's rule, see js/i18n.js. */
  const group = (n) => new Intl.NumberFormat('en-EG').format(Math.round(n));

  /* Areas are NOT rounded. The sheet writes 43.68 m² and the contract will say
     43.68; showing "44" here and 43.68 on the offer two clicks later is the app
     disagreeing with itself about the number the price is built on. */
  const area = (n) => new Intl.NumberFormat('en-EG', { maximumFractionDigits: 2 }).format(n);

  /** Read a typed budget. Anything that is not a digit is ignored, so
   *  "1,500,000", "1 500 000" and "1500000" are the same number. Arabic-Indic
   *  digits are folded first: the field is a plain text input and an Arabic
   *  keyboard on a phone will produce ١٥٠٠٠٠٠, which the digit strip would
   *  otherwise delete entirely and read as a budget of zero. */
  function readMoney(input) {
    const cleaned = String(input.value)
      .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
      .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0)
      .replace(/[^\d]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  const reprint = (input, value) => { input.value = value ? group(value) : ''; };

  /* -------------------------------------------------------------- pricing -- */

  /** Price one unit under one plan and pull out the numbers a budget is tested
   *  against. `maxInstalment` is the milestone ceiling — see the header. */
  function priceCombo(unit, plan, contractDate) {
    const built = buildSchedule(unit, plan, contractDate);
    const s = built.summary;
    let maxInstalment = 0;
    for (const r of built.rows) {
      if (r.instalment && r.amount > maxInstalment) maxInstalment = r.amount;
    }
    return {
      unit,
      planId: plan.id,
      planLabel: plan.label,
      downPct: plan.down,
      down: s.downPayment,
      level: s.instalmentAmount,
      maxInstalment,
      milestoneRows: s.milestoneRows,
      termMonths: s.termMonths,
      maintenance: s.maintenance,
      price: s.price,
      discountPct: s.discountPct,
    };
  }

  /** Re-price everything. Called by app.js on every inventory refresh, so a unit
   *  sold in the sheet stops being offered here within the minute, exactly as it
   *  does everywhere else in the app. */
  function rebuild(units) {
    const contractDate = new Date();
    /* Available only. A unit on hold or booked must never be offered, and this
       is the one screen where it would be tempting to pad a thin result with
       nearly-available stock. */
    const pool = units.filter((u) => u.state === 'available' && u.price > 0);
    S.available = pool.length;
    const combos = [];
    for (const u of pool) {
      for (const plan of CONFIG.plans) combos.push(priceCombo(u, plan, contractDate));
    }
    S.combos = combos;
    fillFilters(pool);
    if (S.open) draw();
  }

  /* --------------------------------------------------------------- search -- */

  const quarterly = () => S.monthly * 3;

  /** The instalment a combination is judged on. Never called before the question
   *  is answered — draw() returns early on a null strict.
   *
   *  THE MAINTENANCE IS NEVER IN HERE, whichever way the question is answered.
   *  Ruled by the user 2026-09-04: it is a single 10% payment at month 42, three
   *  and a half years out and on a date the customer knows, so testing it
   *  against a monthly budget would disqualify people over money they are not
   *  being asked for monthly. It reaches both readings only as a printed line on
   *  the card. `level` and `maxInstalment` are both taken from rows carrying
   *  `instalment: true`, and the maintenance row does not — so this holds
   *  structurally rather than by remembering to exclude it here. */
  const testAmount = (c) => (S.strict ? c.maxInstalment : c.level);

  /* A unit on a floor with no wings — the ground plaza — has building === null,
     and it must NOT vanish when a building is chosen. That plate is one
     continuous floor numbered straight through, so it belongs to the project
     rather than to Q, M, O or R, and the app already shows it under every
     building (CONFIG.floors hasBuildings, the user's decision 2026-08-17). This
     screen follows the same rule: filtering to Building Q still offers it.
     Excluding it would make a priced, available unit unreachable through a
     filter that looks like it only narrows the list. */
  const matchesBuilding = (c) =>
    !S.building || c.unit.building === S.building || c.unit.building === null;

  const matchesRest = (c) =>
    (!S.type || c.unit.type === S.type) &&
    (!S.floor || c.unit.floorCode === S.floor);

  const passesFilters = (c) => matchesBuilding(c) && matchesRest(c);

  const fitsBudget = (c, down, quarter) => c.down <= down && testAmount(c) <= quarter;

  /** Group the qualifying combinations by unit — one card per unit, offering
   *  every plan that fits. A customer does not want the same shop six times. */
  function search() {
    const down = S.down, quarter = quarterly();
    const byUnit = new Map();

    for (const c of S.combos) {
      if (!passesFilters(c) || !fitsBudget(c, down, quarter)) continue;
      if (!byUnit.has(c.unit.code)) byUnit.set(c.unit.code, { unit: c.unit, fits: [] });
      byUnit.get(c.unit.code).fits.push(c);
    }

    const hits = [...byUnit.values()];
    for (const h of hits) {
      // Cheapest to carry first, so a card opens on the easiest plan that fits.
      h.fits.sort((a, b) => a.level - b.level || a.down - b.down);
      h.best = h.fits[0];
    }

    const key = {
      'area-desc':  (h) => -(h.unit.area || 0),
      'monthly':    (h) => h.best.level,
      'price':      (h) => h.unit.price,
      'price-desc': (h) => -h.unit.price,
    }[S.sort];
    hits.sort((a, b) => key(a) - key(b) || a.unit.code.localeCompare(b.unit.code));

    S.hits = hits;
  }

  /** How many units fit at a given budget. Drives the unlock nudge, so it quotes
   *  a number rather than a vague "try increasing your budget". */
  function countAt(down, quarter) {
    const seen = new Set();
    for (const c of S.combos) {
      if (passesFilters(c) && fitsBudget(c, down, quarter)) seen.add(c.unit.code);
    }
    return seen.size;
  }

  /* Round a recommendation UP to something a person would actually say out loud.
     Up, never down, so the rounded figure still clears the threshold it was
     derived from — and it usually clears a few more, which is why the count is
     recomputed at the rounded value rather than at the exact one. */
  const roundUpTo = (n, step) => Math.ceil(n / step) * step;

  /**
   * The cheapest increase that brings at least one MORE unit into reach, and how
   * many arrive with it.
   *
   * This replaced a fixed "+10% and see what happens" probe, which stayed silent
   * whenever the next unit needed 11%. The agent was then told nothing at all,
   * which reads as "this is everything" when it is really "you were close".
   * So the threshold is derived from the inventory instead of guessed: the
   * smallest quarterly instalment above the current budget, and the smallest
   * down payment above the current cash, among units that do not already fit.
   *
   * Two levers, because the plans are gated by both and they are not
   * interchangeable in a sales conversation — one asks the customer for more
   * every month for years, the other for more cash today. Whichever needs the
   * smaller proportional increase is the one recommended.
   *
   * Returns null only when nothing more exists to unlock under these filters,
   * which is the one case worth staying quiet about.
   */
  function nextUnlock() {
    const have = new Set(S.hits.map((h) => h.unit.code));
    const quarter = quarterly();
    let needQuarter = null, needDown = null;

    for (const c of S.combos) {
      if (!passesFilters(c) || have.has(c.unit.code)) continue;
      const q = testAmount(c);
      // Cash is already enough; only the instalment is out of reach.
      if (c.down <= S.down && q > quarter && (needQuarter === null || q < needQuarter)) {
        needQuarter = q;
      }
      // The instalment is already affordable; only the down payment is short.
      if (q <= quarter && c.down > S.down && (needDown === null || c.down < needDown)) {
        needDown = c.down;
      }
    }

    const options = [];
    if (needQuarter !== null) {
      const monthly = roundUpTo(needQuarter / 3, 500);
      const n = countAt(S.down, monthly * 3) - S.hits.length;
      if (n > 0) {
        options.push({ kind: 'monthly', value: monthly, n,
                       rise: (monthly - S.monthly) / (S.monthly || 1) });
      }
    }
    if (needDown !== null) {
      const cash = roundUpTo(needDown, 10000);
      const n = countAt(cash, quarter) - S.hits.length;
      if (n > 0) {
        options.push({ kind: 'cash', value: cash, n,
                       rise: (cash - S.down) / (S.down || 1) });
      }
    }
    if (!options.length) return null;
    options.sort((a, b) => a.rise - b.rise);
    return options[0];
  }

  /** The combination that comes closest to fitting, measured as the worse of the
   *  two overshoots — so "what would it take?" is answered with a real unit.
   *
   *  `pred` is which units are eligible. It is a parameter so the empty result
   *  can ask a second, wider question: nothing in this building, so what is the
   *  closest anywhere else? */
  function nearestMiss(pred = passesFilters) {
    let best = null, bestScore = Infinity;
    for (const c of S.combos) {
      if (!pred(c)) continue;
      const score = Math.max(c.down / (S.down || 1), testAmount(c) / (quarterly() || 1));
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  /* --------------------------------------------------------------- render -- */

  function unitWhere(u) {
    const floor = (CONFIG.floors.find((f) => f.code === u.floorCode) || {}).name || u.floorCode;
    return u.building
      ? t('building.n', { id: u.building }) + ' · ' + td('floor', floor)
      : td('floor', floor);
  }

  function card(hit) {
    const u = hit.unit;
    const c = hit.fits.find((f) => f.planId === S.picked[u.code]) || hit.best;

    const n = el('article', 'hit');

    const top = el('div', 'top');
    top.appendChild(el('span', 'id', u.code));
    if (u.type) top.appendChild(el('span', 'pill', td('type', u.type)));
    top.appendChild(el('span', 'where', unitWhere(u)));
    n.appendChild(top);

    /* The monthly figure is a division, so it carries a ~ and the real quarterly
       amount sits directly under it. Never one without the other — the customer
       is billed the quarterly one. bidiSafe keeps the Latin/number runs from
       being reordered inside an Arabic line. */
    const head = el('div', 'headline');
    /* The unit ("/ month") is a <small> rather than part of the big number, so
       "~40,917 / month" stays on one line in a 272px card instead of breaking
       after the slash. */
    const money = (big, unit, small) => {
      const d = el('div');
      const n = el('div', 'n', big);
      if (unit) n.appendChild(el('small', null, ' ' + unit));
      d.appendChild(n);
      d.appendChild(el('div', 'k', small));
      return d;
    };
    head.appendChild(money(
      bidiSafe('~' + group(c.level / 3)),
      t('budget.perMonth'),
      bidiSafe(t('budget.everyQuarter', { n: group(c.level) }))));
    head.appendChild(money(
      bidiSafe(group(c.down)),
      null,
      bidiSafe(t('budget.down', { pct: pctLabel(c.downPct) }))));
    n.appendChild(head);

    const facts = el('div', 'facts');
    const fact = (html) => { const s = el('span'); s.innerHTML = html; facts.appendChild(s); };
    if (u.area) {
      fact(`<b>${area(u.area)}</b> m²` +
        (u.outdoor ? ' ' + t('budget.outdoor', { n: area(u.outdoor) }) : ''));
    }
    fact(t('budget.priceIs', {
      price: `<b>${group(c.price)}</b>`, currency: td('currency', CONFIG.currency),
    }));
    if (c.discountPct) fact(t('budget.afterDiscount', { pct: `<b>${pctLabel(c.discountPct)}</b>` }));
    /* The plan is named here and not only on the chips, because the chips are
       hidden when a single plan fits — the common case — and a card that never
       says which plan it quoted is unusable. */
    fact(t('budget.onPlan', { plan: `<b>${td('plan', c.planLabel)}</b>` }));
    n.appendChild(facts);

    if (hit.fits.length > 1) {
      const row = el('div', 'planrow');
      for (const f of hit.fits) {
        const b = el('button', 'planchip' + (f.planId === c.planId ? ' on' : ''),
                     td('plan', f.planLabel));
        b.type = 'button';
        b.onclick = () => { S.picked[u.code] = f.planId; draw(); };
        row.appendChild(b);
      }
      n.appendChild(row);
    }

    /* What the headline does not say. Both are real payments the customer makes
       and neither is inside the monthly figure. */
    const items = [];
    if (c.milestoneRows) {
      items.push(t('budget.milestoneQuarters', {
        n: c.milestoneRows, amount: group(c.maxInstalment),
      }));
    }
    items.push(t('budget.maintenanceDue', {
      pct: pctLabel(CONFIG.maintenanceRate),
      amount: group(c.maintenance),
      month: CONFIG.maintenanceDueMonth,
    }));
    n.appendChild(el('div', 'spike', bidiSafe(t('budget.alsoDue', { items: items.join(' · ') }))));

    const foot = el('div', 'foot');
    const go = el('button', 'cta', t('budget.build'));
    go.type = 'button';
    /* Straight into the normal flow — the same calls the pins make. */
    go.onclick = () => pick(u.code, c.planId);
    foot.appendChild(go);
    n.appendChild(foot);

    return n;
  }

  function draw() {
    const hits = $('hits'), nothing = $('nothing'), stretch = $('stretch'),
          more = $('btnMore'), tally = $('tally');

    $('qHint').textContent = t('budget.quarterHint', { q: group(quarterly()) });
    $('msQuestion').textContent = t('budget.msQuestion');

    /* Unanswered: show nothing at all. Rendering one reading and leaving the
       agent to notice the switch afterwards is the same as having a default. */
    $('milestoneAsk').classList.toggle('unanswered', S.strict === null);
    $('awaiting').hidden = S.strict !== null;
    if (S.strict === null) {
      hits.innerHTML = '';
      tally.hidden = stretch.hidden = more.hidden = nothing.hidden = true;
      $('bNote').hidden = true;
      return;
    }

    search();
    renderBuildingNote();
    hits.innerHTML = '';
    tally.hidden = false;
    $('tallyBig').textContent = S.hits.length;
    $('tallyOf').textContent = t('budget.tally', {
      available: S.available, down: group(S.down), monthly: group(S.monthly),
    });

    if (!S.hits.length) {
      nothing.hidden = false;
      stretch.hidden = more.hidden = true;
      renderNothing(nothing);
      return;
    }

    nothing.hidden = true;
    const frag = document.createDocumentFragment();
    for (const h of S.hits.slice(0, S.shown)) frag.appendChild(card(h));
    hits.appendChild(frag);

    more.hidden = S.hits.length <= S.shown;
    more.textContent = t('budget.more', {
      n: Math.min(PAGE, S.hits.length - S.shown), total: S.hits.length,
    });

    renderUnlock(stretch);
  }

  /** The recommendation. Shown WHENEVER more units can be unlocked (the user's
   *  instruction, 2026-09-05), not only when a fixed +10% probe happened to
   *  clear a threshold. Hidden only when there is genuinely nothing left. */
  function renderUnlock(box) {
    const next = nextUnlock();
    if (!next) { box.hidden = true; return; }

    const monthly = next.kind === 'monthly';
    const key = 'budget.' + (monthly ? 'unlockMonthly' : 'unlockCash')
              + (next.n === 1 ? 'One' : '');

    box.hidden = false;
    box.textContent = '';
    box.appendChild(document.createTextNode(bidiSafe(
      t(key, { amount: group(next.value), n: next.n }) + ' ')));

    const apply = el('button', null, t('budget.apply'));
    apply.type = 'button';
    apply.onclick = () => {
      if (monthly) { S.monthly = next.value; reprint($('inMonthly'), S.monthly); }
      else { S.down = next.value; reprint($('inDown'), S.down); }
      S.shown = PAGE;
      draw();
    };
    box.appendChild(apply);
  }

  /** "There is nothing available in Building O." — said whenever the chosen
   *  building holds no available stock of its own, whether or not the list came
   *  back empty. It usually does NOT come back empty: the ground plaza belongs
   *  to no building and is offered under all of them, so an agent who picked O
   *  would otherwise see a card and reasonably assume it was in O. */
  function renderBuildingNote() {
    const box = $('bNote');
    const ownStock = S.building
      && S.combos.some((c) => c.unit.building === S.building);
    if (!S.building || ownStock) { box.hidden = true; return; }

    box.hidden = false;
    box.textContent = t('budget.noneInBuilding', {
      building: t('building.n', { id: S.building }),
    }) + ' ';
    const clear = el('button', null, t('budget.clearBuilding'));
    clear.type = 'button';
    clear.onclick = () => {
      S.building = '';
      $('inBuilding').value = '';
      S.shown = PAGE;
      draw();
    };
    box.appendChild(clear);
  }

  /** "Open QSE-050" — the unit named in an empty result, made selectable.
   *
   *  Naming a unit the agent then has to go and find by hand is a dead end: the
   *  screen has already worked out which unit it is and on which plan, and the
   *  customer in the room is asking about that one. Labelled with the code, so
   *  two of these on the same message stay unambiguous.
   *
   *  It opens the unit at the plan the message quoted, which is NOT one the
   *  budget covers — that is the point, the agent is showing what it would take
   *  — so the offer that follows is the real schedule for it. */
  function openUnitButton(combo) {
    const b = el('button', 'cta small', bidiSafe(t('budget.openUnit', {
      code: combo.unit.code, plan: td('plan', combo.planLabel),
    })));
    b.type = 'button';
    b.onclick = () => pick(combo.unit.code, combo.planId);
    const p = el('p', 'act');
    p.appendChild(b);
    return p;
  }

  function renderNothing(box) {
    const near = nearestMiss();

    /* Nothing at all under these filters — in practice, a building with no
       available stock. Do not stop at "no matches": the agent asked about a
       building because a customer asked about it, and they still need an
       answer. Say the building is empty, then answer the question they were
       really asking by looking again without it. */
    if (!near) {
      box.textContent = '';
      if (S.building) {
        const elsewhere = nearestMiss(matchesRest);
        box.appendChild(el('p', null, t('budget.noneInBuilding', {
          building: t('building.n', { id: S.building }),
        })));
        if (elsewhere) {
          box.appendChild(el('p', 'alt', bidiSafe(t('budget.closestElsewhere', {
            code: elsewhere.unit.code,
            where: unitWhere(elsewhere.unit),
            plan: td('plan', elsewhere.planLabel),
            down: group(elsewhere.down),
            monthly: group(Math.ceil(testAmount(elsewhere) / 3)),
          }))));
          box.appendChild(openUnitButton(elsewhere));
          const clear = el('button', null, t('budget.clearBuilding'));
          clear.type = 'button';
          clear.onclick = () => {
            S.building = '';
            $('inBuilding').value = '';
            S.shown = PAGE;
            draw();
          };
          const p = el('p');
          p.appendChild(clear);
          box.appendChild(p);
        }
      } else {
        box.textContent = t('budget.noneAtAll');
      }
      return;
    }

    const needMonthly = Math.ceil(testAmount(near) / 3);
    const lines = [t('budget.none', {
      code: near.unit.code,
      area: near.unit.area ? ` (${area(near.unit.area)} m²)` : '',
      plan: td('plan', near.planLabel),
      down: group(near.down),
      monthly: group(needMonthly),
    })];
    if (near.down > S.down) lines.push(t('budget.noneCash', { n: group(near.down - S.down) }));
    if (needMonthly > S.monthly) lines.push(t('budget.noneMonthly', { n: group(needMonthly - S.monthly) }));

    /* Say WHICH rule refused it. With the strict answer chosen, an empty result
       is usually not "too expensive" at all — the ordinary instalment fits and
       only the one-off milestone quarter does not, which reads as a bug unless
       the screen says so plainly. */
    let cheap = null;
    if (S.strict) {
      cheap = S.combos
        .filter((c) => passesFilters(c) && c.down <= S.down && c.level <= quarterly())
        .sort((a, b) => a.level - b.level)[0] || null;
    }

    box.textContent = '';
    box.appendChild(el('p', null, bidiSafe(lines.join(' '))));
    /* Both named units are selectable. The agent is standing in front of someone
       asking about them, and reading a unit code they then have to hunt for in
       the floor plan is where this screen would stop being useful. */
    box.appendChild(openUnitButton(near));

    if (cheap) {
      box.appendChild(el('p', 'alt', bidiSafe(t('budget.noneMilestone', {
        code: cheap.unit.code,
        plan: td('plan', cheap.planLabel),
        monthly: group(cheap.level / 3),
        max: group(cheap.maxInstalment),
      }))));
      box.appendChild(openUnitButton(cheap));
    }
  }

  /* ---------------------------------------------------------------- wiring -- */

  /** Hand a chosen unit to the normal flow and step out of the way. */
  function pick(code, planId) {
    const u = state.units.find((x) => x.code === code);
    /* The inventory refreshes on a timer, so a result can be sold between being
       drawn and being tapped. Report it and re-price rather than opening a unit
       that is no longer for sale. */
    if (!u || u.state !== 'available') {
      note(t('err.notAvailable', { code }));
      rebuild(state.units);
      return;
    }
    /* ORDER MATTERS. selectBuilding() and selectFloor() both clear state.planId
       — they are the "start again from here" calls — so the plan has to be set
       between them and selectUnit(), which is where it is read. Setting it first
       looks right and silently opens every offer on the 4-year plan, whatever
       the card said. openDeepLink() sequences it the same way. */
    selectBuilding(u.building);
    selectFloor(u.floorCode);
    if (CONFIG.plans.some((p) => p.id === planId)) state.planId = planId;
    selectUnit(u.code);
    toggle(false);
  }

  function toggle(open) {
    S.open = open;
    $('budgetBody').hidden = !open;
    $('budgetOpen').setAttribute('aria-expanded', String(open));
    $('stepBudget').classList.toggle('open', open);
    if (open) draw();
  }

  /** Rebuild the three selects. Types come from the sheet's own values, so a new
   *  type added by operations appears rather than being silently dropped. */
  function fillFilters(pool) {
    const opt = (sel, value, label) => {
      const o = el('option', null, label);
      o.value = value;
      if (value === sel.value) o.selected = true;
      sel.appendChild(o);
    };

    /* EVERY building is listed, including one with nothing available — it is
       labelled as empty instead of being dropped. Hiding it was the first cut
       and it is the wrong call: an agent filters by building because a customer
       asked about that building, and a filter that silently has no Building O
       leaves them unable to answer. Picking an empty one says so and offers the
       closest unit elsewhere — see renderNothing(). */
    const building = $('inBuilding');
    building.innerHTML = '';
    opt(building, '', t('budget.anyBuilding'));
    const withStock = new Set(pool.map((u) => u.building).filter(Boolean));
    for (const b of CONFIG.buildings) {
      const name = t('building.n', { id: b.id });
      opt(building, b.id, withStock.has(b.id) ? name : `${name} — ${t('building.none')}`);
    }
    building.value = S.building;

    const type = $('inType');
    type.innerHTML = '';
    opt(type, '', t('budget.anyType'));
    for (const ty of [...new Set(pool.map((u) => u.type).filter(Boolean))].sort()) {
      opt(type, ty, td('type', ty));
    }
    type.value = S.type;

    const floor = $('inFloor');
    floor.innerHTML = '';
    opt(floor, '', t('budget.anyFloor'));
    const present = new Set(pool.map((u) => u.floorCode));
    for (const f of CONFIG.floors) {
      if (present.has(f.code)) opt(floor, f.code, td('floor', f.name));
    }
    floor.value = S.floor;

    /* If a chosen value no longer exists — the last unit in that building sold
       while the panel was open — the select falls back to "any". Follow it in
       the state, or the screen would show "Any building" while still filtering
       to a building that has nothing, which reads as the search being broken. */
    S.building = building.value;
    S.type = type.value;
    S.floor = floor.value;

    const sort = $('inSort');
    sort.innerHTML = '';
    opt(sort, 'area-desc', t('budget.sortArea'));
    opt(sort, 'monthly', t('budget.sortMonthly'));
    opt(sort, 'price', t('budget.sortPrice'));
    opt(sort, 'price-desc', t('budget.sortPriceDesc'));
    sort.value = S.sort;
  }

  function init() {
    const inDown = $('inDown'), inMonthly = $('inMonthly');
    S.down = readMoney(inDown);
    S.monthly = readMoney(inMonthly);

    $('budgetOpen').onclick = () => toggle(!S.open);

    inDown.oninput = () => { S.down = readMoney(inDown); S.shown = PAGE; draw(); };
    inMonthly.oninput = () => { S.monthly = readMoney(inMonthly); S.shown = PAGE; draw(); };
    // Reformat on the way out, so typing is never fighting a re-inserted comma.
    inDown.onblur = () => reprint(inDown, S.down);
    inMonthly.onblur = () => reprint(inMonthly, S.monthly);

    /* SELECT THE WHOLE AMOUNT ON FOCUS. Reported from a phone 2026-09-05: both
       fields were "a bit hard" to change. The field arrives holding 1,500,000
       and focus left the caret at the end of it, so replacing the number meant
       nine backspaces on a numeric keypad — or a long-press, "select all", then
       type. Selecting it means one tap and type over it, which is what anyone
       expects of a field that already has a value in it.
       On FOCUS only, never on click: a second tap in an already-focused field
       must still place the caret, or correcting one digit becomes impossible.
       Deferred a frame because iOS Safari discards a selection made
       synchronously inside the focus handler. */
    for (const input of [inDown, inMonthly]) {
      input.addEventListener('focus', () => {
        requestAnimationFrame(() => {
          try { input.setSelectionRange(0, input.value.length); } catch { /* not selectable */ }
        });
      });
      /* "Done" on the keypad closes it and reformats, instead of leaving the
         agent hunting for somewhere neutral to tap on a full screen. */
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    }

    $('inBuilding').onchange = (e) => { S.building = e.target.value; S.shown = PAGE; draw(); };
    $('inType').onchange = (e) => { S.type = e.target.value; S.shown = PAGE; draw(); };
    $('inFloor').onchange = (e) => { S.floor = e.target.value; S.shown = PAGE; draw(); };
    $('inSort').onchange = (e) => { S.sort = e.target.value; draw(); };
    $('btnMore').onclick = () => { S.shown += PAGE; draw(); };

    const seg = $('msSeg');
    seg.onclick = (e) => {
      const btn = e.target.closest('button[data-strict]');
      if (!btn) return;
      S.strict = btn.dataset.strict === '1';
      for (const b of seg.children) b.classList.toggle('on', b === btn);
      S.shown = PAGE;
      draw();
    };
  }

  /** Language switch: the selects and every drawn card are rebuilt from t(). */
  function relang() {
    fillFilters(S.combos.map((c) => c.unit));
    if (S.open) draw();
  }

  return { init, rebuild, relang };
})();
