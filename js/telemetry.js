/* Offer analytics — the client half.
 *
 * Drop this file into an offer generator, load it BEFORE app.js, and call
 * logOffer() once per issued offer. Identical in every app; what differs is the
 * mapping at the call site, which stays in that app.
 *
 * THREE RULES, in priority order over anything else this file might want to do:
 *
 * 1. It must never break an offer. This runs in front of a customer. Every
 *    call is wrapped, every failure is swallowed, and nothing is awaited — an
 *    analytics endpoint being down must not cost a sale.
 * 2. It must be INERT until configured. With no CONFIG.telemetry.url it does
 *    nothing at all, so it can ship to production disabled and be switched on
 *    by a one-line config change rather than a code deploy.
 * 3. It must never send anything the customer typed. Only what the app already
 *    knows: unit, plan, price, language, device.
 */

/** Random, per-sitting, not per-person. Lets us tell "one agent sent 8 offers"
 *  from "8 agents sent 1", which is a different fact about the day. Kept in
 *  sessionStorage so it dies with the tab and identifies nobody. */
function telemetrySession() {
  try {
    const KEY = 'offer.session';
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
        .replace(/-/g, '').slice(0, 16);
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch (_) {
    return null;   // private mode, storage disabled — not worth a failure
  }
}

/* Same question the share button asks, and for the same reason: capability
   ("can this browser share?") is not the same as device, and Chrome on a
   desktop answers yes. maxTouchPoints cannot answer it either — a touchscreen
   laptop reports 10. */
function telemetryDevice() {
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile ? 'mobile' : 'desktop';
    }
    return window.matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  } catch (_) {
    return null;
  }
}

/**
 * Record one issued offer. Fire and forget — never awaited, never throws.
 *
 * @param {object} fields  Columns from schema.sql. Anything omitted stays null.
 */
function logOffer(fields) {
  try {
    const cfg = (typeof CONFIG !== 'undefined' && CONFIG.telemetry) || {};
    if (!cfg.url || !cfg.key) return;          // inert until configured

    const body = Object.assign({
      event: 'offer_issued',
      client_at: new Date().toISOString(),
      session_id: telemetrySession(),
      device: telemetryDevice(),
      app_version: cfg.version || null,
      user_agent: (navigator.userAgent || '').slice(0, 300),
    }, fields);

    /* keepalive lets the request outlive the page — an agent who shares and
       immediately switches to WhatsApp would otherwise have the row dropped
       mid-flight. sendBeacon cannot be used: it sets no headers, and Supabase
       needs the apikey one. */
    fetch(cfg.url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    }).catch(() => {});                        // offline, blocked, down — fine
  } catch (_) {
    /* Deliberately empty. An offer must go out even if this file is broken. */
  }
}

/** Build the row for a unit + plan. Shared by both codebases so the two apps
 *  cannot drift into recording subtly different things. `unit` may be a single
 *  unit or a combined one; `units` is the list it was built from. */
function offerRow(project, unit, units, plan, summary, extra) {
  const list = (units && units.length ? units : [unit]).filter(Boolean);
  return Object.assign({
    project,
    units: list.map((u) => ({
      code: u.code, type: u.type || null,
      area: u.area != null ? Number(u.area) : null,
      price: u.price != null ? Number(u.price) : null,
    })),
    unit_codes: list.map((u) => u.code).filter(Boolean),
    unit_count: list.length,
    combined: list.length > 1 || !!(unit && unit.combined),

    unit_type: unit && unit.type || null,
    floor_code: unit && (unit.floorCode || unit.floor) != null
      ? String(unit.floorCode != null ? unit.floorCode : unit.floor) : null,
    floor_name: unit && unit.floorName || null,
    building: unit && unit.building || null,
    area: unit && unit.area != null ? Number(unit.area) : null,
    outdoor_area: unit && unit.outdoor != null ? Number(unit.outdoor) : null,

    list_price: unit && unit.total != null ? Number(unit.total) : null,
    discount: unit && unit.discount != null ? Number(unit.discount) : null,
    final_price: unit && unit.price != null ? Number(unit.price) : null,

    plan_id: plan && plan.id || null,
    plan_label: plan && plan.label || null,
    down_payment: summary && summary.downPayment != null ? Number(summary.downPayment) : null,
    instalment_amount: summary && summary.instalmentAmount != null ? Number(summary.instalmentAmount) : null,
    instalment_count: summary && summary.instalmentCount != null ? Number(summary.instalmentCount) : null,
    maintenance: summary && summary.maintenance != null ? Number(summary.maintenance) : null,
    total_payable: summary && summary.totalPayable != null ? Number(summary.totalPayable) : null,
  }, extra || {});
}

if (typeof window !== 'undefined') {
  window.logOffer = logOffer;
  window.offerRow = offerRow;
}
if (typeof module !== 'undefined') {
  module.exports = { logOffer, offerRow, telemetrySession, telemetryDevice };
}
