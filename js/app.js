/* UI wiring: building -> floor -> unit -> plan.
 *
 * The inventory is re-read from the published sheet on load, on demand, when
 * the tab regains focus, and on a timer. The sales team never has to think
 * about refreshing: if ops mark a unit sold, it stops being offerable here
 * within a minute, and immediately on the next glance at the tab.
 */

const state = {
  units: [],
  warnings: [],
  live: false,
  fetchedAt: null,
  buildingId: null,
  floorCode: null,
  unit: null,
  planId: null,
};

/* Poll while the tab is open. Cheap — the sheet is ~150 KB and gviz sends
 * no-cache, so this is always a real read, never a cached one. */
const REFRESH_MS = 60 * 1000;

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ------------------------------------------------------------------ sync -- */

/* Dates and times are formatted en-GB in BOTH languages, deliberately.
 * The client's instruction is that numbers stay Western — an Arabic locale
 * would render them ١٥/٠٨/٢٠٢٦, which would not match the contract the
 * customer signs. See the header of js/i18n.js. */
const DATE_LOCALE = 'en-GB';

/** "just now" / "3 minutes ago" — how stale the number on screen actually is. */
function ago(date) {
  const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (s < 45) return t('ago.now');
  const m = Math.round(s / 60);
  if (m < 60) return t(m === 1 ? 'ago.min' : 'ago.mins', { n: m });
  const h = Math.round(m / 60);
  return t(h === 1 ? 'ago.hour' : 'ago.hours', { n: h });
}

function renderSync() {
  const bar = $('sync'), text = $('syncText'), counts = $('syncCounts');
  bar.classList.toggle('live', state.live);
  bar.classList.toggle('stale', !state.live && !!state.fetchedAt);

  if (state.live && state.fetchedAt) {
    const clock = state.fetchedAt.toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', minute: '2-digit' });
    text.innerHTML = t('sync.liveAt', { live: t('sync.live'), time: clock, ago: ago(state.fetchedAt) });
  } else if (state.fetchedAt) {
    text.innerHTML = t('sync.offlineAt', {
      offline: t('sync.offline'),
      date: state.fetchedAt.toLocaleDateString(DATE_LOCALE),
    });
  } else {
    text.textContent = t('sync.loading');
  }

  const avail = state.units.filter((u) => u.state === 'available').length;
  counts.textContent = state.units.length
    ? t('sync.counts', { units: state.units.length, available: avail })
    : '';
}

async function refresh({ quiet } = {}) {
  const btn = $('btnRefresh');
  btn.disabled = true;
  if (!quiet) $('syncText').textContent = t('sync.reading');

  const res = await loadInventory();
  state.units = res.units;
  state.warnings = res.warnings;
  state.live = res.live;
  state.fetchedAt = res.fetchedAt || new Date();

  btn.disabled = false;
  renderSync();
  renderWarnings();
  renderBuildings();

  /* A unit selected before the refresh may have just been sold. Re-resolve it
   * from the new data rather than keeping a stale object on screen — this is
   * the whole point of live sync. */
  if (state.unit) {
    const fresh = state.units.find((u) => u.code === state.unit.code);
    if (!fresh) {
      state.unit = null; state.planId = null;
      $('stepPlan').hidden = true;
      note(t('err.removed'));
    } else if (fresh.state !== 'available') {
      state.unit = fresh; state.planId = null;
      $('stepPlan').hidden = true;
      note(t('err.noLonger', { code: fresh.code, status: fresh.status }));
    } else {
      state.unit = fresh;
    }
  }
  if (state.floorCode) renderUnits();
  if (state.unit && state.planId) renderSchedule();
}

let noteMsg = null;
function note(msg) { noteMsg = msg; renderWarnings(); }

function renderWarnings() {
  const box = $('warnings');
  const list = [];
  if (noteMsg) list.push(noteMsg);
  if (!state.live && state.units.length) {
    list.push(t('warn.stale'));
  }
  list.push(...state.warnings);

  box.innerHTML = '';
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  /* The notes themselves stay in English — they name spreadsheet rows and unit
     codes, and they are read by the agent, not the customer. Only the heading
     that counts them is translated. */
  box.appendChild(el('b', null,
    list.length === 1 ? t('warn.one') : t('warn.many', { n: list.length })));
  const ul = el('ul');
  list.forEach((w) => ul.appendChild(el('li', null, w)));
  box.appendChild(ul);
}

/* -------------------------------------------------------------- step 1-2 -- */

function unitsIn(buildingId, floorCode) {
  return state.units.filter((u) =>
    u.building === buildingId && (!floorCode || u.floorCode === floorCode));
}

/* Everything the customer can see is filtered through here. A sold or held
 * unit is not merely greyed out — it is absent, along with its price and area.
 * The agent sits beside the customer; a struck-through price for a unit
 * someone else already bought invites a conversation nobody wants. */
function sellable(buildingId, floorCode) {
  return unitsIn(buildingId, floorCode).filter((u) => u.state === 'available');
}

/* The masterplan render. Polygons are drawn once; their classes are updated on
 * every refresh so availability on the render always matches the sheet. */
let heroBuilt = false;
function renderHero() {
  const img = $('heroImg'), svg = $('heroSvg');
  if (!heroBuilt) {
    img.src = MASSING.image;
    svg.setAttribute('viewBox', MASSING.viewBox);
    for (const [id, poly] of Object.entries(MASSING.buildings)) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      p.setAttribute('points', poly.map((q) => q[0] + ',' + q[1]).join(' '));
      p.dataset.id = id;
      p.addEventListener('pointerenter', () => hoverBuilding(id));
      p.addEventListener('pointerleave', () => hoverBuilding(null));
      p.addEventListener('click', () => selectBuilding(id));
      svg.appendChild(p);
    }
    $('hero').addEventListener('pointermove', (e) => {
      const r = $('hero').getBoundingClientRect();
      const tip = $('heroTip');
      tip.style.left = (e.clientX - r.left) + 'px';
      tip.style.top = (e.clientY - r.top) + 'px';
    });
    $('hero').addEventListener('pointerleave', () => hoverBuilding(null));
    heroBuilt = true;
  }
  for (const p of svg.querySelectorAll('polygon')) {
    p.classList.toggle('sel', state.buildingId === p.dataset.id);
  }
}

function hoverBuilding(id) {
  const tip = $('heroTip');
  for (const p of $('heroSvg').querySelectorAll('polygon')) {
    p.classList.toggle('hot', p.dataset.id === id);
  }
  if (!id) { tip.className = ''; return; }
  const avail = sellable(id).length;
  tip.querySelector('b').textContent = t('building.n', { id });
  tip.querySelector('i').textContent = avail ? t('building.available', { n: avail }) : t('building.none');
  tip.className = 'on' + (avail ? '' : ' off');
}

function renderBuildings() {
  renderHero();

  const sel = $('buildingSel');
  if (!sel.options.length) {
    for (const b of CONFIG.buildings) {
      const o = el('option', null, b.name);
      o.value = b.id;
      sel.appendChild(o);
    }
    sel.onchange = () => selectBuilding(sel.value);
  }
  for (const o of sel.options) {
    const n = sellable(o.value).length;
    // Say why a building cannot be chosen rather than just refusing.
    o.disabled = n === 0;
    o.textContent = t('building.n', { id: o.value })
      + ' — ' + (n ? t('building.available', { n }) : t('building.none'));
  }

  const id = state.buildingId;
  $('buildingChip').textContent = id || '—';
  $('buildingChip').classList.toggle('on', !!id);
  if (id) sel.value = id;
  $('buildingMeta').textContent = id
    ? t('building.meta', { available: sellable(id).length, total: unitsIn(id).length })
    : t('building.tapHint');
}

const TYPE_LABEL = { Retail: 'retail', Medical: 'clinics', Admin: 'admin' };

/**
 * The floor's character, taken straight from the sheet's Type column.
 *
 * Every type actually present is named, commonest first. It used to hide a
 * minority use once the dominant one passed 80%, which meant a floor holding
 * both clinics and admin offices advertised itself as purely "clinics" — the
 * app editorialising about stock it was showing. The sheet decides what a unit
 * is; this only reads it back.
 */
/* `t` is the translate function now, so these counters are named `tally` —
 * a local `t` here shadowed it and every label in this file went blank. */
function useOf(units) {
  const tally = {};
  units.forEach((u) => { const k = u.type || '?'; tally[k] = (tally[k] || 0) + 1; });
  const ranked = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
  if (!ranked.length) return '—';
  return ranked.map((k) => td('typePlural', TYPE_LABEL[k] || k.toLowerCase())).join(' + ');
}
function mix(units) {
  const tally = {};
  units.forEach((u) => { const k = u.type || '?'; tally[k] = (tally[k] || 0) + 1; });
  return Object.keys(tally)
    .map((k) => `${tally[k]} ${td('typePlural', TYPE_LABEL[k] || k.toLowerCase())}`)
    .join(' · ');
}

function selectBuilding(id) {
  state.buildingId = id;
  state.floorCode = null; state.unit = null; state.planId = null;
  $('stepFloor').hidden = false;
  $('stepUnit').hidden = true;
  $('stepPlan').hidden = true;
  renderBuildings();
  renderFloors();
  $('stepFloor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderFloors() {
  const box = $('floors');
  box.innerHTML = '';
  for (const f of CONFIG.floors) {
    const mine = sellable(state.buildingId, f.code);
    const avail = mine.length;
    const btn = el('button', 'card' + (state.floorCode === f.code ? ' on' : ''));
    btn.type = 'button';

    const row = el('div', 'row');
    row.appendChild(el('div', 'id', f.code));
    row.appendChild(el('div', 'pill' + (avail ? '' : ' none'),
      avail ? t('building.available', { n: avail })
            : mine.length ? t('floor.none') : t('floor.notReleased')));
    btn.appendChild(row);

    const body = el('div');
    body.appendChild(el('div', 'val', td('floor', f.name)));
    /* What the floor IS matters more than how many units it holds — a buyer
       asks for "the clinics floor", not "the 78-unit floor". */
    body.appendChild(el('div', 'lab', mine.length ? useOf(mine) : '—'));
    btn.appendChild(body);

    btn.disabled = !mine.length;
    btn.onclick = () => selectFloor(f.code);
    box.appendChild(btn);
  }
}

function selectFloor(code) {
  state.floorCode = code;
  state.unit = null; state.planId = null;
  $('stepUnit').hidden = false;
  $('stepPlan').hidden = true;
  renderFloors();
  renderUnits();
  $('stepUnit').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------------------------------------------------------- step 3 -- */

/* The floor plan with a pin per unit — the EMC pattern. Falls back to the code
 * list when this floor has no pins placed yet, so the app is always usable. */
function renderPlan() {
  const plan = PLANS[state.floorCode];
  const wrap = $('planWrap'), svg = $('planSvg'), note = $('planNote');
  const mine = sellable(state.buildingId, state.floorCode);
  const pinned = mine.filter((u) => plan && plan.pins[u.code]);

  /* Always show the drawing when one exists, even with no pins on it yet.
     The plan is the point of this step; an unpinned drawing is still the floor
     the customer is buying on, and the panel beside it can always select. */
  wrap.hidden = !plan;
  if (!plan) { note.hidden = true; return; }

  if (!pinned.length) {
    note.hidden = false;
    note.textContent = t('plan.nonePinned', { floor: td('floor', plan.label) });
  } else if (pinned.length !== mine.length) {
    note.hidden = false;
    note.textContent = t('plan.somePinned', { pinned: pinned.length, total: mine.length });
  } else {
    note.hidden = true;
  }

  $('planImg').src = plan.image;
  $('planImg').alt = t('plan.alt', { floor: td('floor', plan.label) });
  svg.innerHTML = '';
  for (const u of pinned) {
    const [x, y] = plan.pins[u.code];
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y);
    /* Radius in viewBox units — the viewBox is 1 unit wide, so a radius in
     * pixels here would paint a disc wider than the whole drawing. */
    c.setAttribute('r', 0.009);
    c.setAttribute('class', 'pin ' + u.state + (state.unit && state.unit.code === u.code ? ' on' : ''));
    c.addEventListener('pointerenter', () => {
      const tip = $('planTip');
      tip.querySelector('b').textContent = u.code;
      tip.querySelector('i').textContent =
        `${u.area != null ? u.area + ' m²' : ''} · ${u.state === 'available' ? fmt(u.price) + ' ' + td('currency', CONFIG.currency) : u.status}`;
      tip.className = 'on' + (u.state === 'available' ? '' : ' off');
      const r = $('planWrap').getBoundingClientRect();
      const b = c.getBoundingClientRect();
      tip.style.left = (b.left + b.width / 2 - r.left) + 'px';
      tip.style.top = (b.top - r.top) + 'px';
    });
    c.addEventListener('pointerleave', () => { $('planTip').className = ''; });
    if (u.state === 'available') c.addEventListener('click', () => selectUnit(u.code));
    svg.appendChild(c);
  }
}

/** The panel's current filter/sort, applied to this floor's units. */
function visibleUnits() {
  const ty = $('fltType').value, sort = $('fltSort').value;
  let list = sellable(state.buildingId, state.floorCode);
  if (ty) list = list.filter((u) => (u.type || '') === ty);

  const by = {
    unit: (a, b) => a.unit - b.unit,
    price: (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    area: (a, b) => (a.area || 0) - (b.area || 0),
    'area-desc': (a, b) => (b.area || 0) - (a.area || 0),
  }[sort] || ((a, b) => a.unit - b.unit);
  return list.slice().sort(by);
}

function renderUnits() {
  renderPlan();
  const box = $('units');
  box.innerHTML = '';

  const all = sellable(state.buildingId, state.floorCode);
  $('unitHint').textContent = t('step.3.hint', { n: all.length });

  /* Type filter options come from what is actually on this floor. The VALUE
     stays the sheet's own English — it is what visibleUnits() filters on — and
     only the label shown is translated. */
  const sel = $('fltType'), had = sel.value;
  const types = [...new Set(all.map((u) => u.type).filter(Boolean))].sort();
  sel.innerHTML = '';
  sel.appendChild(el('option', null, t('filter.any'))).value = '';
  types.forEach((ty) => {
    const o = el('option', null, td('type', ty));
    o.value = ty;
    sel.appendChild(o);
  });
  if (types.includes(had)) sel.value = had;

  const list = visibleUnits();
  $('fltCount').textContent = list.length === all.length
    ? t('building.available', { n: all.length })
    : t('filter.someShown', { shown: list.length, total: all.length });

  if (!list.length) {
    box.appendChild(el('p', 'empty', all.length ? t('empty.filter') : t('empty.floor')));
    return;
  }

  for (const u of list) {
    const btn = el('button', `unit ${u.state}` + (state.unit && state.unit.code === u.code ? ' on' : ''));
    btn.type = 'button';
    btn.appendChild(el('div', 'code', u.code));
    btn.appendChild(el('div', 'meta',
      `${u.area != null ? bidiSafe(u.area + ' m²') : '—'}${u.type ? ' · ' + td('type', u.type) : ''}`));
    btn.appendChild(el('div', 'price', fmt(u.price)));

    // Only an explicitly Available unit is clickable. Everything else — sold,
    // reserved, blank, misspelt — is inert.
    if (u.state === 'available') btn.onclick = () => selectUnit(u.code);
    else { btn.disabled = true; btn.title = t('unit.status', { status: u.status }); }
    box.appendChild(btn);
  }
}

function selectUnit(code) {
  const u = state.units.find((x) => x.code === code);
  if (!u || u.state !== 'available') { note(t('err.notAvailable', { code })); return; }
  state.unit = u;
  state.planId = state.planId || CONFIG.plans[0].id;
  /* An offer is now likely, and the agent is about to spend a while on the
     payment plan and the schedule. Spend that time pulling the 4.6 MB of
     renders and drawings the export needs, so the button is not followed by
     half a minute of "Preparing…" on a phone. Fire-and-forget; see pdf.js. */
  warmOfferArtwork(u);
  $('stepPlan').hidden = false;
  renderUnits();
  renderUnitCard();
  renderPlans();
  renderSchedule();
  $('stepPlan').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------------------------------------------------------------- step 4 -- */

function renderUnitCard() {
  const u = state.unit, box = $('unitCard');
  box.innerHTML = '';
  const cell = (label, value) => {
    const d = el('div');
    d.appendChild(el('span', null, label));
    /* bidiSafe, because these values are a mix: "QSP-033" and "39.78 m²" are
       Latin atoms that Arabic would otherwise reorder, while "تجاري" and
       "الدور الأول" belong to the Arabic run and are left alone. */
    d.appendChild(el('b', null, bidiSafe(value)));
    box.appendChild(d);
  };
  const cur = td('currency', CONFIG.currency);
  cell(t('unit.unit'), u.code);
  cell(t('unit.floor'), td('floor', u.floorName || u.floorCode));
  cell(t('unit.type'), td('type', u.type) || '—');
  /* Gross area only. The sheet also carries a smaller net figure; the client
     instructed 2026-08-12 that it must never be shown or printed, so it is read
     for the internal consistency check in sheet.js and goes no further. */
  cell(t('unit.area'), `${u.area ?? '—'} m²`);
  if (u.outdoor) cell(t('unit.outdoor'), `${u.outdoor} m²`);
  /* Show a discount as a rate AND as money. "20%" is an abstraction; "you save
     1,479,764 EGP" is what the customer actually hears. The rate comes from
     the sheet per unit — it is NOT a fixed rate: across the available stock it
     runs at 10%, 15% and 20% depending on the unit. */
  if (u.discount) {
    cell(t('unit.listPrice'), fmt(u.total) + ' ' + cur);
    cell(t('unit.discount', { pct: pctLabel(u.discount) }), '−' + fmt(u.total - u.price) + ' ' + cur);
    cell(t('unit.priceAfter'), fmt(u.price) + ' ' + cur);
  } else {
    cell(t('unit.price'), fmt(u.price) + ' ' + cur);
  }
}

/* A dropdown, not a row of cards. Six plans as cards took a whole band of the
   page directly above the schedule they control; a select puts the choice on
   one line and keeps the numbers in view. Each option carries the down payment
   and instalment count that used to sit in the card, so nothing is lost. */
function renderPlans() {
  const box = $('plans');
  box.innerHTML = '';

  const label = el('label', 'planLabel', t('pay.plan'));
  label.htmlFor = 'planSelect';

  const sel = el('select', 'planSelect');
  sel.id = 'planSelect';
  for (const p of CONFIG.plans) {
    const opt = el('option', null, t('pay.option', {
      label: td('plan', p.label), down: pctLabel(p.down), n: p.instalments,
    }));
    opt.value = p.id;
    if (p.id === state.planId) opt.selected = true;
    sel.appendChild(opt);
  }
  /* Only the schedule needs redrawing — the select already shows the new
     selection itself, so re-rendering it here would just fight the browser. */
  sel.onchange = () => { state.planId = sel.value; renderSchedule(); };

  box.appendChild(label);
  box.appendChild(sel);
}

function renderSchedule() {
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  const { rows, summary } = buildSchedule(state.unit, plan, new Date());
  const box = $('schedule');
  box.innerHTML = '';

  const sum = el('div', 'summary');
  const stat = (label, value) => {
    const d = el('div');
    d.appendChild(el('span', null, label));
    d.appendChild(el('b', null, bidiSafe(value)));
    sum.appendChild(d);
  };
  const cur = td('currency', CONFIG.currency);
  stat(t('pay.down'), fmt(summary.downPayment));
  stat(t('pay.quarterly'), fmt(summary.instalmentAmount));
  stat(t('pay.instalments'), String(summary.instalmentCount));
  stat(t('pay.maintenance', { pct: pctLabel(CONFIG.maintenanceRate) }), fmt(summary.maintenance));
  stat(t('pay.total'), fmt(summary.totalPayable));
  stat(t('pay.delivery'), fmtDate(summary.deliveryDate));
  box.appendChild(sum);

  /* The saving, stated once, plainly, at the point the customer is deciding.
     Both prices are shown so the figure can be checked rather than trusted. */
  if (summary.discountPct) {
    const save = el('div', 'saving');
    save.appendChild(el('b', null,
      t('save.headline', { amount: fmt(summary.discountAmount), currency: cur })));
    save.appendChild(el('span', null, t('save.detail', {
      pct: pctLabel(summary.discountPct),
      list: fmt(summary.listPrice),
      price: fmt(summary.price),
      currency: cur,
    })));
    box.appendChild(save);
  }

  const table = el('table');
  const thead = el('thead');
  const hr = el('tr');
  [t('table.due'), t('table.payment'), t('table.date'), t('table.amount'), t('table.pct')].forEach((h, i) => {
    const th = el('th', i >= 3 ? 'num' : null, h);
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const block of scheduleByYear(rows, summary.price)) {
    /* The year row is a divider, not a subtotal. It used to print the year's
       summed instalments and percentage; the client asked on 2026-08-12 for the
       label alone, so the customer reads one running schedule rather than
       stopping to reconcile a per-year figure. scheduleByYear still computes
       block.total/pct — they are used by the tests, and by nothing on screen. */
    const yr = el('tr', 'yr');
    /* `td` is the data-translation helper now — this cell used to shadow it. */
    const cellYear = el('td', null, tBand(block.year));
    cellYear.colSpan = 5;
    yr.appendChild(cellYear);
    tbody.appendChild(yr);

    for (const r of block.rows) {
      const tr = el('tr', r.milestone ? 'milestone' : null);
      tr.appendChild(el('td', null, tWhen(r.month)));
      tr.appendChild(el('td', null, tRowLabel(r)));
      tr.appendChild(el('td', null, bidiSafe(fmtDate(r.date))));
      tr.appendChild(el('td', 'num', fmt(r.amount)));
      tr.appendChild(el('td', 'num', fmtPct(r.pct)));
      tbody.appendChild(tr);
    }
  }
  const tot = el('tr', 'total');
  tot.appendChild(el('td', null, t('table.total')));
  tot.appendChild(el('td', null, t('pay.planOf', { label: td('plan', summary.planLabel) })));
  tot.appendChild(el('td', null, ''));
  tot.appendChild(el('td', 'num', fmt(scheduleTotal(rows))));
  tot.appendChild(el('td', 'num', ''));
  tbody.appendChild(tot);

  table.appendChild(tbody);
  box.appendChild(table);

  /* The schedule must foot. If it ever does not, say so on screen rather than
   * letting a wrong number reach a customer. */
  const paid = rows.filter((r) => !r.maintenance).reduce((s, r) => s + r.amount, 0);
  if (paid !== summary.price) {
    box.appendChild(el('p', 'empty',
      t('err.footing', { paid: fmt(paid), price: fmt(summary.price) })));
  }
}

/* ----------------------------------------------------------------- offer -- */

/* Generating the PDF takes a second or two — the renders have to be fetched and
   embedded — so the button reports what it is doing rather than appearing dead.
   Failures are shown on screen: this runs in front of a customer, and silently
   producing nothing is the worst outcome. */
$('btnOffer').onclick = async () => {
  const btn = $('btnOffer'), note = $('offerNote');
  if (!state.unit || !state.planId) return;
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  const unit = state.unit;

  /* On a phone the share sheet carries the PDF itself straight into WhatsApp,
     so nothing else is needed. On desktop there is no way to attach a file to a
     wa.me link — WhatsApp's scheme takes text only — so the file downloads and
     WhatsApp Web opens alongside it with the numbers prefilled, ready for the
     agent to drop the PDF in.

     The tab has to be opened HERE, inside the click, and pointed at its URL
     later: building the PDF takes a couple of seconds and a window.open after
     that await is treated as unsolicited and blocked. */
  const willShare = canShareFiles();
  const wa = willShare ? null : window.open('', '_blank');

  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = t('offer.preparing');
  note.textContent = '';
  note.className = '';
  try {
    const how = await deliverOffer(unit, plan, PLANS[unit.floorCode]);
    const url = whatsappUrl(unit, plan);
    if (how === 'shared') {
      note.textContent = t('offer.shared');
    } else if (wa && !wa.closed) {
      wa.location = url;
      note.textContent = t('offer.downloadedTab');
    } else {
      // Popup blocked. Give them something to click rather than failing.
      note.textContent = t('offer.downloaded');
      const a = el('a', null, t('offer.openWhatsapp'));
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      note.appendChild(a);
    }
  } catch (err) {
    if (wa && !wa.closed) wa.close();
    note.textContent = err.message;
    note.className = 'bad';
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = was;
  }
};

/* ------------------------------------------------------------------ boot -- */

/* Warm the PDF library once the page has settled. It is deliberately not on the
   critical path — see the comment in index.html — but by the time anyone has
   picked a building, a floor and a unit it will long since be cached, so the
   first offer is as instant as it was when it blocked startup. */
(() => {
  const warm = () => loadJsPDF().catch(() => {});   // silent: it retries on demand
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 8000 });
  else setTimeout(warm, 4000);
})();

$('btnRefresh').onclick = () => refresh();
['fltType', 'fltSort'].forEach((id) => { $(id).onchange = renderUnits; });

// Coming back to the tab is the moment an agent is about to quote a price.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh({ quiet: true });
});
setInterval(() => { if (!document.hidden) refresh({ quiet: true }); }, REFRESH_MS);
// Keep the "3 minutes ago" honest between fetches.
setInterval(renderSync, 20000);

/**
 * Redraw everything that carries text.
 *
 * The app rebuilds its own DOM on every refresh anyway, so switching language
 * is just a re-render — there is no separate translation pass over live nodes,
 * and therefore nothing that can be missed and left in the wrong language.
 * The one exception is the static furniture in index.html, which applyLang()
 * handles through its data-i18n attributes.
 */
function renderAll() {
  $('brandBy').textContent = t('brand.by', { developer: CONFIG.developer });
  $('assumptions').textContent = t('footer.assumptions') + ' ' + ASSUMPTIONS.join(' ');
  renderSync();
  renderWarnings();
  renderBuildings();
  if (state.floorCode) { renderFloors(); renderUnits(); }
  if (state.unit) { renderUnitCard(); renderPlans(); renderSchedule(); }
}

applyLang();
$('btnLang').onclick = () => setLang(lang() === 'ar' ? 'en' : 'ar', renderAll);
$('brandBy').textContent = t('brand.by', { developer: CONFIG.developer });
$('assumptions').textContent = t('footer.assumptions') + ' ' + ASSUMPTIONS.join(' ');

/**
 * Deep link: #QSP-033/8y reopens a unit and plan.
 *
 * A shared link can outlive the unit — by the time it is opened the unit may
 * have been sold. Say so rather than silently showing nothing, and never
 * bypass the availability check to honour a link.
 */
function openDeepLink() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
  if (!raw) return;
  const [code, planId] = raw.split('/');

  /* #Q/SP opens a building and floor without picking a unit — the form used by
   * the plan view, and by anyone sharing "here is the Sky Plaza layout". */
  if (/^[A-Za-z]$/.test(code) && planId && PLANS[planId.toUpperCase()]) {
    selectBuilding(code.toUpperCase());
    selectFloor(planId.toUpperCase());
    return;
  }

  const u = state.units.find((x) => x.code === String(code).toUpperCase());
  if (!u) { note(t('err.badLink', { code })); return; }

  selectBuilding(u.building);
  selectFloor(u.floorCode);
  if (u.state !== 'available') {
    note(t('err.noLonger', { code: u.code, status: u.status }));
    return;
  }
  if (planId && CONFIG.plans.some((p) => p.id === planId)) state.planId = planId;
  selectUnit(u.code);
}

refresh().then(openDeepLink);
