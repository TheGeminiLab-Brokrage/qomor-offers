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
  /* Plan zoom. Deliberately NOT remembered between floors — see renderPlan. */
  zoom: 1,
  /* The custom-plan panel (js/npv.js). `custom` holds the agent's terms —
     { baseId, down, instalments, give, applied } — and is cleared whenever the
     unit or the base plan changes, so terms worked out for one deal can never
     ride along onto another. `give` null means "the maximum". */
  custom: null,
  customOpen: false,
  /* Whether the term is typed as YEARS or as a number of instalments. The two
     are the same schedule; only the box changes. */
  customUnit: 'years',
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
  /* Step 0 prices every available unit against all six plans, so it has to be
     re-priced from the same read that redraws everything else — otherwise a
     unit sold in the sheet would go on being offered by the budget search after
     it had disappeared from the floor plan. */
  afford.rebuild(state.units);

  /* A unit selected before the refresh may have just been sold. Re-resolve it
   * from the new data rather than keeping a stale object on screen — this is
   * the whole point of live sync. */
  if (state.unit) {
    const fresh = state.units.find((u) => u.code === state.unit.code);
    if (!fresh) {
      state.unit = null; state.planId = null;
      state.custom = null; state.customOpen = false;
      $('stepPlan').hidden = true;
      note(t('err.removed'));
    } else if (fresh.state !== 'available') {
      state.unit = fresh; state.planId = null;
      state.custom = null; state.customOpen = false;
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

/** Is this floor divided into wings, or one continuous plate? */
function floorHasBuildings(floorCode) {
  const f = CONFIG.floors.find((x) => x.code === floorCode);
  return !f || f.hasBuildings !== false;
}

function unitsIn(buildingId, floorCode) {
  /* A floor with no wings belongs to whichever building is selected, because it
     belongs to none of them — the ground plaza is one plate numbered 001-178
     and its units carry building: null, so the usual filter would match nothing
     whatever the customer picked.

     Guarded on floorCode being given, which is what keeps the building CARDS
     honest: renderBuildings counts with no floor, and admitting plate units
     there would add all 178 to every building's total. */
  if (floorCode && !floorHasBuildings(floorCode)) {
    return state.units.filter((u) => u.floorCode === floorCode);
  }
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

/* What the FLOOR PLAN shows: available and reserved, never sold.
 *
 * This is a deliberate exception to the rule above, on the user's instruction
 * 2026-08-16 — green for available, yellow for reserved. The rule it bends is
 * the one about prices, and that still holds: a reserved pin shows its status
 * ("Hold", "Booked") where an available one shows a price, so nothing a
 * customer should not see appears next to a unit they cannot buy. A reserved
 * pin is also not selectable, so it cannot reach an offer.
 *
 * Sold units stay absent entirely. Showing every sold unit would bury the few
 * available ones on a floor that is 90% sold, which is the opposite of what
 * the plan is for. */
function plannable(buildingId, floorCode) {
  return unitsIn(buildingId, floorCode)
    .filter((u) => u.state === 'available' || u.state === 'reserved');
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
  const wrap = $('planWrap'), svg = $('planPins'), note = $('planNote');
  const mine = plannable(state.buildingId, state.floorCode);
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

  /* Per floor, because the ground plaza is not the same shape as the rest
     (2.4333 against 2.0441). The drawing's box is sized from this in CSS, so a
     stale value letterboxes or crops the plan and every pin drifts with it. */
  document.documentElement.style.setProperty('--plan-aspect', planAspect(state.floorCode));

  /* Back to 100% whenever the drawing changes. Carrying a 4x zoom across to a
     different floor leaves the agent looking at an unfamiliar corner of a
     drawing they did not choose, with no visible cue that they are zoomed in
     at all. Starting whole is the honest default. */
  state.zoom = 1;
  document.documentElement.style.setProperty('--plan-zoom', 1);
  $('planZoomLevel').textContent = '100%';
  $('planZoomIn').disabled = false;
  $('planZoomOut').disabled = true;
  $('planWrap').classList.remove('zoomed');
  $('planWrap').scrollLeft = 0;
  $('planWrap').scrollTop = 0;

  $('planImg').src = plan.image;
  $('planImg').alt = t('plan.alt', { floor: td('floor', plan.label) });
  svg.innerHTML = '';
  for (const u of pinned) {
    const [x, y] = plan.pins[u.code];
    const b = el('button', 'pin ' + u.state
      + (state.unit && state.unit.code === u.code ? ' on' : ''));
    b.type = 'button';
    /* Percentages, so the pin tracks the drawing at any display size. x and y
       are already fractions of the image's width and height. */
    b.style.left = (x * 100) + '%';
    b.style.top = (y * 100) + '%';
    b.setAttribute('aria-label', tipText(u));
    b.addEventListener('pointerenter', () => showTip(u, b));
    /* Only a mouse leaving should dismiss it. A touch fires pointerleave the
       moment the finger lifts, which would hide the details the tap was for. */
    b.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hideTip(); });
    b.addEventListener('click', () => {
      /* Tap shows the details, on every device: the tooltip for the figure the
         agent is pointing at, and the panel below for everything else. A sold
         or held unit still says what it is — it just cannot be selected. */
      showTip(u, b);
      if (u.state === 'available') selectUnit(u.code);
    });
    svg.appendChild(b);
  }
}

/** One line of unit detail, shared by the tooltip and the pin's accessible name. */
function tipText(u) {
  const money = u.state === 'available'
    ? fmt(u.price) + ' ' + td('currency', CONFIG.currency) : u.status;
  return `${u.code} · ${u.area != null ? u.area + ' m² · ' : ''}${money}`;
}

function showTip(u, pinEl) {
  const tip = $('planTip');
  tip.querySelector('b').textContent = u.code;
  tip.querySelector('i').textContent =
    `${u.area != null ? u.area + ' m²' : ''} · ${u.state === 'available'
      ? fmt(u.price) + ' ' + td('currency', CONFIG.currency) : u.status}`;
  tip.className = 'on' + (u.state === 'available' ? '' : ' off');
  const wrap = $('planWrap');
  const r = wrap.getBoundingClientRect();
  const p = pinEl.getBoundingClientRect();
  /* + scrollLeft/Top because planWrap scrolls once zoomed. getBoundingClientRect
     is viewport-relative, but the tip is positioned against planWrap's padding
     box, which scrolls away underneath it — without this the label detaches
     from its pin by exactly the scroll distance. */
  tip.style.left = (p.left + p.width / 2 - r.left + wrap.scrollLeft) + 'px';
  tip.style.top = (p.top - r.top + wrap.scrollTop) + 'px';
}

/* ------------------------------------------------------------------ zoom --
 *
 * Zooming scales the DRAWING, not the pins. The pin target is a fixed 6px
 * because at 1x the closest two pins in the project are 6.73px apart and
 * anything wider hands a tap to the neighbouring unit. Magnifying the drawing
 * multiplies that 6.73px gap while the targets stay put, so at 3x there is 20px
 * between them — the difference between mouse work and a fingertip. Enlarging
 * the targets instead would reintroduce the overlap this just fixed.
 */
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

function setZoom(next, focusPin) {
  const wrap = $('planWrap');
  const from = state.zoom || 1;
  const to = Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(1, next));
  if (to === from) return;

  /* Keep whatever the agent was looking at under the pointer. Without this the
     view jumps to the top-left on every step and they have to find their unit
     again — which is most of the reason a zoom control gets abandoned. */
  const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / from;
  const cy = (wrap.scrollTop + wrap.clientHeight / 2) / from;

  state.zoom = to;
  document.documentElement.style.setProperty('--plan-zoom', to);
  $('planZoomLevel').textContent = Math.round(to * 100) + '%';
  $('planZoomIn').disabled = to >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  $('planZoomOut').disabled = to <= 1;
  wrap.classList.toggle('zoomed', to > 1);

  wrap.scrollLeft = cx * to - wrap.clientWidth / 2;
  wrap.scrollTop = cy * to - wrap.clientHeight / 2;
  if (focusPin) centreOnPin(focusPin);
  hideTip();
}

/** Scroll a pin to the middle of the frame — used when zooming on a selection. */
function centreOnPin(pinEl) {
  const wrap = $('planWrap');
  const r = wrap.getBoundingClientRect();
  const p = pinEl.getBoundingClientRect();
  wrap.scrollLeft += (p.left + p.width / 2) - (r.left + r.width / 2);
  wrap.scrollTop += (p.top + p.height / 2) - (r.top + r.height / 2);
}

/** The next step up or down the ladder from wherever we are. */
function stepZoom(dir) {
  const now = state.zoom || 1;
  const i = ZOOM_STEPS.findIndex((z) => z > now + 1e-6);
  const next = dir > 0
    ? (i === -1 ? now : ZOOM_STEPS[i])
    : [...ZOOM_STEPS].reverse().find((z) => z < now - 1e-6) ?? 1;
  const sel = state.unit && $('planPins').querySelector('.pin.on');
  setZoom(next, sel);
}

function hideTip() { $('planTip').className = ''; }

/* A touch has no "leave", so the tooltip is dismissed by the next tap that is
 * not on a pin. Without this it would sit over the drawing indefinitely. */
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest || !e.target.closest('#planPins .pin')) hideTip();
}, true);

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
  /* Custom terms belong to one unit. A different unit starts clean. */
  if (!state.unit || state.unit.code !== u.code) { state.custom = null; state.customOpen = false; }
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
  renderCustom();
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

  /* THE RATE PER METRE, list and discounted, added on the user's request
     2026-08-16: it is the first thing a customer asks on the phone, and until
     now the agent had to divide the total by the area in their head while
     talking. Both figures come from the sheet's own columns rather than being
     derived here — see meterPriceFinal in sheet.js — so what the agent says
     matches the workbook the contract is written from.
     One line per rate, list then discounted, because it is read out as a single
     answer. bidiSafe() isolates the whole run in Arabic, so the two numbers
     cannot swap round the arrow. */
  const rate = (label, list, now) => {
    if (!now) return;
    cell(label, u.discount && list && list !== now
      ? t('unit.rateWas', { list: fmt(list), now: fmt(now), currency: cur })
      : t('unit.rateFlat', { now: fmt(now), currency: cur }));
  };
  rate(t('unit.meterPrice'), u.meterPrice, u.meterPriceFinal || u.meterPrice);
  if (u.outdoor) rate(t('unit.meterPriceOutdoor'), u.outdoorPrice, u.outdoorPriceFinal || u.outdoorPrice);
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
     selection itself, so re-rendering it here would just fight the browser.
     Custom terms were worked out against the OLD plan, so they are dropped;
     an open panel restarts from the new plan. */
  sel.onchange = () => {
    state.planId = sel.value;
    state.custom = null;
    renderCustom();
    renderSchedule();
  };

  box.appendChild(label);
  box.appendChild(sel);

  /* The custom-plan button, and a chip that says when custom terms are on the
     offer — the schedule below changes, and the agent must be able to see why. */
  const btn = el('button', 'ghost npvbtn');
  btn.id = 'npvBtn';
  btn.type = 'button';
  btn.onclick = () => { state.customOpen = !state.customOpen; renderCustom(); };
  box.appendChild(btn);
  const chip = el('span', 'npvchip');
  chip.id = 'npvChip';
  box.appendChild(chip);
  syncNpvBar();
}

/* ------------------------------------------------------- custom plans -- */

const basePlan = () => CONFIG.plans.find((p) => p.id === state.planId);

/* Unlocked for the rest of this visit in this tab, and no longer — closing the
   tab locks it again. The fallback flag covers a browser that refuses storage. */
const NPV_UNLOCK = 'qomorNpvUnlocked';
let npvUnlockedHere = false;
function npvUnlocked() {
  try { return npvUnlockedHere || sessionStorage.getItem(NPV_UNLOCK) === '1'; }
  catch { return npvUnlockedHere; }
}

/** How much of the maximum the agent is giving: all of it unless they typed
    less, and never more than the terms are worth. */
const giveOf = (c, r) => (c.give == null ? r.max : Math.min(Math.max(c.give, 0), r.max));

/**
 * The unit and plan the OFFER uses — the one place that decides it.
 *
 * The standard plan and the sheet's price, unless custom terms have been
 * applied AND still earn a discount; then the custom plan at the reduced price.
 * The schedule, the PDF, the WhatsApp text and telemetry all read this, so they
 * cannot disagree about which deal was sent. The broker post deliberately does
 * not: a customer's negotiated terms are not a listing.
 */
function offerTerms() {
  const base = basePlan();
  const c = state.custom;
  if (!base || !c || !c.applied || c.baseId !== base.id) return { unit: state.unit, plan: base, npv: null };
  const r = NPV.evaluate(base, c);
  if (r.verdict !== 'earn') return { unit: state.unit, plan: base, npv: null };
  const give = giveOf(c, r);
  return { unit: NPV.applyDiscount(state.unit, give), plan: r.plan, npv: r, give };
}

function syncNpvBar() {
  const btn = $('npvBtn'), chip = $('npvChip');
  if (!btn) return;
  btn.textContent = (npvUnlocked() ? '' : '🔒 ') + t('npv.open');
  btn.setAttribute('aria-expanded', String(state.customOpen));
  const terms = state.unit ? offerTerms() : null;
  chip.hidden = !(terms && terms.npv);
  if (terms && terms.npv) chip.textContent = t('npv.chip', { pct: pctLabel(terms.give) });
}

function renderCodeForm(box) {
  box.appendChild(el('p', 'npvsub', t('npv.codeLabel')));
  const form = el('form', 'npvcode');
  const input = el('input');
  input.type = 'password';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  const go = el('button', 'cta', t('npv.codeGo'));
  go.type = 'submit';
  const bad = el('span', 'bad');
  form.append(input, go, bad);
  form.onsubmit = async (e) => {
    e.preventDefault();
    bad.textContent = '';
    try {
      if (await NPV.checkCode(input.value)) {
        npvUnlockedHere = true;
        try { sessionStorage.setItem(NPV_UNLOCK, '1'); } catch { /* flag above covers it */ }
        renderCustom();
      } else {
        bad.textContent = t('npv.codeWrong');
        input.select();
      }
    } catch {
      bad.textContent = t('npv.codeInsecure');
    }
  };
  box.appendChild(form);
  setTimeout(() => input.focus(), 0);
}

/**
 * The panel: his down payment and instalment count in, the maximum discount
 * out, then how much of it to give and a button to put it on the offer.
 *
 * The inputs are built once and never rebuilt while the agent types — update()
 * only rewrites the text around them — so focus and the caret stay put.
 */
function renderCustom() {
  const box = $('customBox');
  box.innerHTML = '';
  syncNpvBar();
  if (!state.unit || !state.customOpen) { box.hidden = true; return; }
  box.hidden = false;

  const head = el('div', 'npvhead');
  head.appendChild(el('b', null, t('npv.title')));
  const x = el('button', 'sheet-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', t('npv.close'));
  x.onclick = () => { state.customOpen = false; renderCustom(); };
  head.appendChild(x);
  box.appendChild(head);

  if (!npvUnlocked()) { renderCodeForm(box); return; }

  /* `let`: the panel can move itself to another plan — see switchBase below. */
  let base = basePlan();
  if (!state.custom || state.custom.baseId !== base.id) {
    state.custom = { baseId: base.id, down: base.down, instalments: base.instalments, give: null, applied: false };
  }
  const c = state.custom;
  const cur = td('currency', CONFIG.currency);
  const price = state.unit.price;

  const sub = el('p', 'npvsub', t('npv.sub', { plan: td('plan', base.label) }));
  box.appendChild(sub);
  /* Filled in when the panel moves to another plan by itself. */
  const moved = el('p', 'npvnote');
  moved.hidden = true;
  box.appendChild(moved);
  /* The lump sums this schedule keeps, and what a quarter costs beside them.
     The same down payment over the same number of quarters is a DIFFERENT deal
     with and without them — worth more to the company when the money arrives
     earlier — so it earns a different discount. Without this line that
     difference is invisible until the schedule below, and the discount looks
     arbitrary. */
  const lumps = el('p', 'npvlumps');
  box.appendChild(lumps);

  /* Read a typed amount. Same digit handling as readMoney() in js/afford.js: an
     Arabic keyboard on a phone types ١٥٠٠٠٠٠, and a plain digit strip would
     delete that entirely and read it as zero. Empty is NaN, not 0, so a cleared
     field asks for a number instead of quoting a down payment of nothing. */
  const readMoney = (s) => {
    const cleaned = String(s)
      .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
      .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0)
      .replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned) : NaN;
  };

  /* Quarterly instalments, so four a year — read from CONFIG rather than typed
     in, or a change of frequency would silently halve every year on screen. */
  const perYear = 12 / CONFIG.instalmentEveryMonths;
  const yearsOf = (n) => +(n / perYear).toFixed(2);
  const instOf = (y) => Math.round(y * perYear);

  const field = (parent, label, unitText, value, opts) => {
    const wrap = el('label', 'npvfield');
    const lab = el('span', 'lab', label);
    /* A control that belongs to this field — the term's years/instalments
       switch — sits on the label row rather than above the box. */
    if (opts && opts.extra) lab.appendChild(opts.extra);
    wrap.appendChild(lab);
    const row = el('span', 'row');
    const input = el('input');
    input.type = (opts && opts.type) || 'number';
    input.inputMode = input.type === 'text' ? 'numeric' : 'decimal';
    input.autocomplete = 'off';
    if (opts && opts.step) input.step = opts.step;
    input.value = value;
    row.appendChild(input);
    /* 'npvunit', not 'unit' — .unit is already the unit-card button style. */
    if (unitText) row.appendChild(el('span', 'npvunit', unitText));
    wrap.appendChild(row);
    const hint = el('span', 'hint');
    wrap.appendChild(hint);
    parent.appendChild(wrap);
    return { input, hint };
  };

  /* The customer says "three million down" and "five years" — not "50.68%" and
     "20 quarterly instalments". The panel takes what he says; the percentage and
     the instalment count are derived and read back in the hint under each field.
     A text box, not a number one, so thousands separators can be shown. */
  /* The term can be entered either way. A customer says "five years"; the price
     list says "20 instalments"; they are the same schedule. The switch changes
     only what the box means — c.instalments is what is stored either way. */
  const termMode = state.customUnit === 'inst' ? 'inst' : 'years';
  const seg = el('span', 'npvseg');
  for (const mode of ['years', 'inst']) {
    const b = el('button', null, t(mode === 'years' ? 'npv.years' : 'npv.instCount'));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(mode === termMode));
    b.onclick = () => { state.customUnit = mode; renderCustom(); };
    seg.appendChild(b);
  }

  const fields = el('div', 'npvfields');
  const down = field(fields, t('npv.down'), cur, fmt(Math.round(c.down * price)), { type: 'text' });
  const inst = field(fields, t('npv.term'),
    termMode === 'years' ? t('npv.yearsUnit') : t('npv.instUnit'),
    termMode === 'years' ? yearsOf(c.instalments) : c.instalments,
    { type: 'number', step: termMode === 'years' ? '0.25' : '1', extra: seg });
  box.appendChild(fields);

  const res = el('div', 'npvres');
  const msg = el('p', 'npvmsg');
  const max = el('div', 'npvmax');
  const vs = el('p', 'npvvs');
  const gap = el('p', 'npvgap');
  const giveWrap = el('div', 'npvgive');
  const give = field(giveWrap, t('npv.give'), '%', '', { type: 'number', step: '0.01' });
  const actions = el('div', 'npvactions');
  const apply = el('button', 'cta', t('npv.apply'));
  apply.type = 'button';
  const remove = el('button', 'ghost', t('npv.remove'));
  remove.type = 'button';
  const status = el('span', 'npvstatus');
  actions.append(apply, remove, status);
  res.append(msg, max, vs, gap, giveWrap, actions);
  box.appendChild(res);

  const every = CONFIG.instalmentEveryMonths;
  const showResult = (on) => { [max, vs, giveWrap, actions].forEach((n) => { n.hidden = !on; }); };

  const ladder = NPV.ladder();
  const planName = (p) => td('plan', p.label);

  /* Terms the chosen plan cannot hold move the panel to the nearest plan that
     can (NPV.planFor). The dropdown, the heading and the schedule behind the
     panel all follow, and a note says why — nothing changes silently. */
  /* A share of the price, as money on this unit — every figure the agent reads
     is in the currency the customer is talking in. */
  const money = (frac) => fmt(Math.round(frac * price));

  const switchBase = (to, why) => {
    const from = base;
    base = to;
    state.planId = to.id;
    c.baseId = to.id;
    const sel = $('planSelect');
    if (sel) sel.value = to.id;
    sub.textContent = t('npv.sub', { plan: planName(to) });
    moved.hidden = false;
    moved.textContent = why === 'longer'
      ? t('npv.movedLonger', { to: planName(to), from: planName(from) })
      : t('npv.movedShorter', { to: planName(to), from: planName(from), down: money(from.down), currency: cur });
    if (!c.applied) renderSchedule();
  };

  /* A term said in whichever unit the agent is working in, so guidance never
     answers a question about instalments in years. */
  const termText = (n) => (termMode === 'years'
    ? t('npv.termYears', { y: yearsOf(n) })
    : t('npv.termInst', { n }));

  /* When an entry will not go and no plan can take it, say what WOULD make it
     go, rather than only the range this one plan allows. */
  const instProblem = (n, d) => {
    const longest = ladder[ladder.length - 1];
    const range = () => t('npv.rangeTerm', { min: termText(1), max: termText(base.instalments) });
    if (!(Number.isInteger(n) && n >= 1)) return range();
    if (n > longest.instalments) {
      return t('npv.instMax', { term: termText(longest.instalments), plan: planName(longest) });
    }
    const need = ladder.find((p) => p.instalments >= n);
    if (Number.isFinite(d) && d < need.down) {
      return t('npv.needMoreDown', { term: termText(n), plan: planName(need), down: money(need.down), currency: cur });
    }
    return range();
  };
  const downProblem = (d, lim) => {
    if (!Number.isFinite(d) || d >= lim.downMin - 1e-9) {
      return t('npv.rangeMoney', { min: money(lim.downMin), max: money(lim.downMax), currency: cur });
    }
    const to = NPV.planFor(base, d, c.instalments);
    if (to) {
      return t('npv.downBelow', { plan: planName(base), down: money(base.down), currency: cur, to: planName(to) });
    }
    const lowest = ladder.reduce((a, p) => (p.down < a.down ? p : a));
    if (d < lowest.down) return t('npv.downMinAll', { down: money(lowest.down), currency: cur });
    const most = ladder.filter((p) => p.down <= d + 1e-9).pop();   // longest plan that amount reaches
    return t('npv.downTooLow', { down: money(d), currency: cur, term: termText(most.instalments), plan: planName(most) });
  };

  /* Whether the last pass accepted both fields — read by the blur handlers,
     which reprint an accepted value and leave a refused one on screen. */
  let lastValid = false;

  const update = (allowSwitch) => {
    const amount = readMoney(down.input.value);
    const d = Number.isFinite(amount) ? amount / price : NaN;
    const typed = parseFloat(inst.input.value);
    const n = !Number.isFinite(typed) ? NaN
      : (termMode === 'years' ? instOf(typed) : Math.round(typed));

    /* Move plans first, when these terms cannot be built on the chosen plan but
       can on another. Too many instalments moves at once: the first digits of a
       number are always smaller, so a half-typed count can never trigger it.
       A down payment BELOW the plan's minimum waits until the agent leaves the
       field, because "7" on the way to "70" is below every plan's minimum. */
    if (allowSwitch && Number.isFinite(n) && n >= 1 && Number.isFinite(d)
        && (n > base.instalments || d < base.down - 1e-9)) {
      const to = NPV.planFor(base, d, n);
      if (to && to.id !== base.id) switchBase(to, n > base.instalments ? 'longer' : 'shorter');
    }

    /* The term before the down payment: how many instalments there are decides
       which milestones survive, and that decides how high the down payment can go. */
    const instOk = Number.isFinite(n) && n >= 1 && n <= base.instalments;
    if (instOk) c.instalments = n;
    const lim = NPV.limits(base, c.instalments);
    const downOk = Number.isFinite(d) && d >= lim.downMin - 1e-9 && d <= lim.downMax + 1e-9;
    if (downOk) c.down = d;
    lastValid = downOk && instOk;

    const m = c.instalments * every;
    down.hint.className = 'hint' + (downOk ? '' : ' bad');
    down.hint.textContent = downOk
      ? t('npv.downHint', { pct: pctLabel(+c.down.toFixed(4)), std: pctLabel(base.down),
                            stdAmount: money(base.down), currency: cur })
      : downProblem(d, lim);
    inst.hint.className = 'hint' + (instOk ? '' : ' bad');
    inst.hint.textContent = instOk
      ? (termMode === 'years'
          ? t('npv.instHint', { n: c.instalments, m, std: yearsOf(base.instalments) })
          : t('npv.instHintCount', { y: yearsOf(c.instalments), m, std: base.instalments }))
      : instProblem(n, d);
    /* An entry that will not go also takes custom terms OFF the offer, so the
       PDF can never carry numbers other than the ones on screen. */
    if (!downOk || !instOk) {
      /* The lump-sum line describes a schedule; there is no schedule while an
         entry is refused, and leaving the last valid one up describes terms
         nobody asked for. Typing "32" passes through "3", which IS valid, so
         without this the line reads "each quarter 30%" beside the warning. */
      lumps.hidden = true;
      msg.hidden = true; gap.hidden = true; showResult(false);
      if (c.applied) { c.applied = false; renderSchedule(); }
      syncNpvBar();
      return;
    }

    /* What this schedule IS, in one line: the lump sums it keeps and what a
       plain quarter costs beside them. Cutting the instalments below a lump's
       own quarter drops that lump, and this follows it. */
    const cp = NPV.customPlan(base, c);
    const ms = milestonesFor(cp);
    const each = pctLabel(+levelRate(cp).toFixed(6));
    const items = Object.keys(ms).map((q) =>
      t('npv.lumpItem', { pct: pctLabel(ms[q]), m: Number(q) * every }));
    lumps.hidden = false;
    lumps.textContent = items.length
      ? t('npv.lumps', { list: items.join(' · '), each })
      : t('npv.lumpsNone', { each });

    const r = NPV.evaluate(base, c);
    gap.hidden = !r.gap;
    if (r.gap) {
      gap.textContent = t('npv.gap', { from: td('plan', r.gap.from.label), to: td('plan', r.gap.to.label) });
    }

    if (r.verdict !== 'earn') {
      msg.hidden = false;
      msg.textContent = r.verdict === 'neutral' ? t('npv.none')
        : r.verdict === 'premium' ? t('npv.premium', { plan: td('plan', r.ref.label) })
        : t('npv.invalid');
      showResult(false);
      if (c.applied) { c.applied = false; renderSchedule(); }
      syncNpvBar();
      return;
    }

    msg.hidden = true;
    showResult(true);
    max.innerHTML = '';
    max.appendChild(el('span', null, t('npv.maxLabel')));
    max.appendChild(el('b', null, bidiSafe(pctLabel(r.max))));
    max.appendChild(el('i', null, bidiSafe(`${fmt(price * r.max)} ${cur}`)));
    vs.textContent = t('npv.vs', { plan: td('plan', r.ref.label), rate: pctLabel(CONFIG.npv.rate) });

    const g = giveOf(c, r);
    if (document.activeElement !== give.input) give.input.value = (g * 100).toFixed(2);
    give.hint.textContent = t('npv.keeps', {
      pct: pctLabel(+(r.max - g).toFixed(6)), amount: fmt(price * (r.max - g)), currency: cur,
      price: fmt(Math.round(price * (1 - g))),
    });

    apply.hidden = c.applied;
    remove.hidden = !c.applied;
    status.textContent = c.applied ? t('npv.applied', { pct: pctLabel(g) }) : '';
    if (c.applied) renderSchedule();
    syncNpvBar();
  };

  /* A count that outgrows the plan moves it straight away; a down payment below
     the plan's minimum waits for the agent to leave the field. See update(). */
  down.input.oninput = () => update(false);
  inst.input.oninput = () => update(true);
  /* On leaving a field, print back what is actually in use — the amount with its
     separators, the term rounded to a whole quarter — but only if it was
     accepted, so a refused entry stays on screen beside the reason it was. */
  down.input.onchange = () => { update(true); if (lastValid) down.input.value = money(c.down); };
  inst.input.onchange = () => {
    update(true);
    if (lastValid) inst.input.value = termMode === 'years' ? yearsOf(c.instalments) : c.instalments;
  };
  give.input.oninput = () => {
    const v = parseFloat(give.input.value);
    if (Number.isFinite(v) && v >= 0) c.give = v / 100;
    update();
  };
  give.input.onchange = () => {
    const r = NPV.evaluate(base, c);
    if (r.verdict === 'earn') {
      c.give = giveOf(c, r);
      give.input.value = (c.give * 100).toFixed(2);
    }
    update();
  };
  apply.onclick = () => { c.applied = true; update(); };
  remove.onclick = () => { c.applied = false; update(); renderSchedule(); };

  update();
}

function renderSchedule() {
  /* offerTerms(), not the picker: with custom terms applied, the schedule shows
     the plan and the price the offer will actually carry. */
  const { unit, plan } = offerTerms();
  const { rows, summary } = buildSchedule(unit, plan, new Date());
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
  if (summary.discountPct || summary.planDiscount) {
    const save = el('div', 'saving');
    save.appendChild(el('b', null,
      t('save.headline', { amount: fmt(summary.discountAmount), currency: cur })));
    /* With custom terms applied the saving has two sources, and the line says
       so — the sheet's per-unit discount and the one earned by the terms. */
    const key = !summary.planDiscount ? 'save.detail'
      : summary.discountPct ? 'save.detailPlan' : 'save.detailPlanOnly';
    save.appendChild(el('span', null, t(key, {
      pct: pctLabel(summary.discountPct),
      plan: pctLabel(summary.planDiscount),
      list: fmt(summary.listPrice),
      price: fmt(summary.price),
      currency: cur,
    })));
    box.appendChild(save);
  }

  /* THE YEAR IS A COLUMN, NOT A DIVIDER ROW — reworked 2026-08-16 against a
     layout the client sent, and the point of it is density. The old table spent
     a full-width row on every year heading and then repeated "Year 1 + 3
     months" down a Due column beside it; the client's words were that this "is
     just making it hard to read". The year now appears once, in its own narrow
     column, on the row that year starts, with that year's share of the price
     beside it. Ten divider rows disappear and the schedule reads as one list. */
  const table = el('table');
  const thead = el('thead');
  const hr = el('tr');
  [['table.year', 'yr'], ['table.payment', null], ['table.date', null],
   ['table.amount', 'num'], ['table.pct', 'num'], ['table.yearly', 'num']]
    .forEach(([key, cls]) => hr.appendChild(el('th', cls, t(key))));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const block of scheduleByYear(rows, summary.price)) {
    block.rows.forEach((r, i) => {
      /* `opens` is the row the year starts on: it carries the label and the
         yearly percentage, and it is the row set in bold. Every other row in
         the year leaves both cells empty, which is what makes the year read as
         one group without a heading between them. */
      const opens = i === 0;
      const tr = el('tr', [
        opens ? 'opens' : '',
        block.year === 0 ? 'dp' : '',
        r.milestone ? 'milestone' : '',
      ].filter(Boolean).join(' ') || null);
      tr.appendChild(el('td', 'yr', opens
        ? (block.year === 0 ? t('table.dp') : t('band.year', { y: block.year })) : ''));
      tr.appendChild(el('td', null, tRowLabel(r)));
      tr.appendChild(el('td', null, bidiSafe(fmtDate(r.date))));
      tr.appendChild(el('td', 'num', fmt(r.amount)));
      tr.appendChild(el('td', 'num', fmtPct(r.pct)));
      tr.appendChild(el('td', 'num', opens ? fmtPct(block.pct) : ''));
      tbody.appendChild(tr);
    });
  }
  /* The reference layout ends on a flat 100%, because there the instalments are
     the whole price. Ours are not: the 10% maintenance is charged ON TOP of the
     price, so the schedule foots to 110% of it. Printing 100% here would be a
     wrong number on the document a customer is asked to agree to, so it is
     computed from the rows rather than assumed. */
  const payable = scheduleTotal(rows);
  const tot = el('tr', 'total');
  tot.appendChild(el('td', 'yr', ''));
  tot.appendChild(el('td', null, t('table.total')));
  tot.appendChild(el('td', null, ''));
  tot.appendChild(el('td', 'num', fmt(payable)));
  tot.appendChild(el('td', 'num', fmtPct(summary.price ? (payable / summary.price) * 100 : 0)));
  tot.appendChild(el('td', 'num', ''));
  tbody.appendChild(tot);

  table.appendChild(tbody);
  /* The schedule scrolls inside a box the size of the floor drawing, rather
     than running down the page: a 10-year plan is 40 instalments plus its year
     dividers, which pushed the Send button so far below the fold that an agent
     had to scroll past the whole table to reach it. See .schedwrap. */
  const scroller = el('div', 'schedwrap');
  scroller.appendChild(table);
  box.appendChild(scroller);

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
  /* The offer carries whatever offerTerms() says — the custom plan at its
     reduced price if one is applied, otherwise the standard plan. */
  const { unit, plan } = offerTerms();

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
    const { how, fellBackToEnglish } = await deliverOffer(unit, plan, PLANS[unit.floorCode]);

    /* Record the offer. AFTER the await, so only an offer that actually reached
       the agent is counted — a failed export throws above and is never logged,
       which keeps "offers sent" honest. Not awaited and never able to throw, so
       a dead endpoint cannot cost a sale. */
    if (typeof logOffer === 'function') {
      logOffer(offerRow(CONFIG.telemetry.project, unit, [unit], plan,
                        buildSchedule(unit, plan).summary,
                        { delivery: how === 'shared' ? 'shared' : 'downloaded',
                          lang: lang() }));
    }

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
    /* An Arabic offer that came out English is a WRONG DOCUMENT, not a cosmetic
       problem, and the agent is about to send it. Say so on screen — the console
       warning behind this is no use to anyone holding a phone. */
    if (fellBackToEnglish) {
      note.textContent = t('offer.englishFallback');
      note.className = 'bad';
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

/* ---- the WhatsApp post ----
   The second delivery path, for a broker group rather than one customer.
   Everything it does lives in js/post.js; this is only the wiring. */
$('btnPost').onclick = openPostSheet;
for (const b of document.querySelectorAll('[data-post-close]')) b.onclick = closePostSheet;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('postSheet').hidden) closePostSheet();
});
$('postModes').onclick = (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b || b.dataset.mode === postState.mode) return;
  postState.mode = b.dataset.mode;
  renderPostPreview();
};
$('postTerms').onchange = (e) => {
  postState.terms = e.target.checked;
  $('postText').value = buildPostText();
};
$('postSend').onclick = postShare;
$('postCopy').onclick = async () => {
  const ok = await postCopyText();
  if (ok) postLog(`post-${postState.mode}-copied`);
  postFlash(t(ok ? 'post.copied' : 'post.copyFailed'), !ok);
};

/* ------------------------------------------------------------------ boot -- */

/* Warm the PDF library once the page has settled. It is deliberately not on the
   critical path — see the comment in index.html — but by the time anyone has
   picked a building, a floor and a unit it will long since be cached, so the
   first offer is as instant as it was when it blocked startup. */
(() => {
  /* The Arabic face is warmed with it, but ONLY when the agent is reading
     Arabic — it is 376 KB that an English offer never draws a glyph from, and
     the whole point of warming is to spend idle bandwidth on what will actually
     be used. Switching language mid-session leaves it to be fetched on export,
     which costs a moment once rather than a download nobody needed. */
  const warm = () => {
    loadJsPDF().catch(() => {});                    // silent: it retries on demand
    if (lang() === 'ar') loadArabicFonts().catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 8000 });
  else setTimeout(warm, 4000);
})();

$('btnRefresh').onclick = () => refresh();
$('planZoomIn').onclick = () => stepZoom(+1);
$('planZoomOut').onclick = () => stepZoom(-1);
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
  $('assumptions').textContent = t('footer.assumptions') + ' ' + tAssumptions().join(' ');
  renderSync();
  renderWarnings();
  renderBuildings();
  afford.relang();
  if (state.floorCode) { renderFloors(); renderUnits(); }
  if (state.unit) { renderUnitCard(); renderPlans(); renderCustom(); renderSchedule(); }
}

applyLang();
afford.init();
document.querySelectorAll('#langSw button[data-lang]').forEach((b) => {
  b.onclick = () => setLang(b.getAttribute('data-lang'), renderAll);
});
$('brandBy').textContent = t('brand.by', { developer: CONFIG.developer });
$('assumptions').textContent = t('footer.assumptions') + ' ' + tAssumptions().join(' ');

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

/* One number in config.js sizes every pin — see CONFIG.pinDotPx. Applied once
 * here rather than written into each pin, so the browser resizes them all
 * together and the tap target follows via max() in the stylesheet. */
document.documentElement.style.setProperty('--pin-dot', (CONFIG.pinDotPx || 13) + 'px');

refresh().then(openDeepLink);
