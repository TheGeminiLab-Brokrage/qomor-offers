/* The WhatsApp post — the second way an offer leaves this app.
 *
 * WHY THIS EXISTS. The PDF offer is a one-to-one document: addressed to a
 * customer, carrying a payment schedule, landing in a chat as an attachment.
 * That is the wrong shape for where most sales actually start. Agents work
 * broker groups, and in a group a PDF reads as a formal offer nobody opens
 * while a formatted post with a plan image and a price reads as a listing and
 * gets forwarded. So the sales teams stopped using the app for that step and
 * started retyping the post by hand for every unit (observed on the Eliwah
 * teams, 2026-08-22), which is slow, drifts off-message, and puts the price
 * back in the hands of whoever is typing.
 *
 * This module hands them the post instead: the header assembled from the live
 * inventory row the PDF uses, the project copy from CONFIG.post, and the floor
 * drawing rendered with the unit pinned.
 *
 * TWO LENGTHS:
 *   short — plan image + the unit and its price. For a broker group, where the
 *           post competes with fifty others and only has to earn a reply.
 *   long  — the same, plus the location render, the map link and the project
 *           itself. For a customer who already asked.
 *
 * WHAT THE IMAGE MUST NOT SHOW. The on-screen plan colours every unit by
 * status. That is for the agent; this image goes to strangers, so it is drawn
 * from the clean drawing with only the offered unit marked. A post must never
 * publish which units are already sold.
 *
 * WHAT THE TEXT MUST NOT CARRY. Not CONFIG.shareBaseUrl. That deep link is
 * right on a customer's own offer — they reopen it at today's price — but this
 * app is a public static site, and a broker group holding that link has the
 * whole inventory, every price and the offer generator itself.
 *
 * AND NEVER THE NET AREA. Standing client instruction, 2026-08-12: the sheet's
 * smaller net figure is never shown, printed or documented anywhere a customer
 * can see. Only `unit.area` (gross) and `unit.outdoor` appear below.
 */

const POST_MAX_W = 1600;
const POST_JPEG_Q = 0.9;

/* Western digits, deliberately: the sales teams' own posts use them, and
 * Arabic-Indic digits with Arabic separators are a known way to have a number
 * read back wrong once it has been copied out of the message. */
const postNum = (n) => Math.round(n).toLocaleString('en-US');

/* Unicode isolates — LEFT-TO-RIGHT ISOLATE … POP DIRECTIONAL ISOLATE.
 *
 * The post is Arabic whatever language the app is in, so it hits the same bidi
 * problem every Arabic screen here does: the algorithm cannot know that "20%"
 * is one atom and renders it "%20". js/i18n.js solves this for the UI with
 * bidiSafe(), but that helper returns its input unchanged when the app is in
 * English — correct there, wrong here, because the POST is Arabic either way.
 * Hence a local, unconditional version. */
function iso(v) {
  const s = String(v);
  /* Arabic values are left alone — they belong to the surrounding run, and
   * forcing one left-to-right is the very reordering this is here to stop:
   * "7 سنوات" wrapped in an LTR isolate renders "سنوات 7". Same rule
   * bidiSafe() applies in js/i18n.js, and it exists because postAr() returns
   * Arabic for some values ('7 years' → '7 سنوات') and Latin for others
   * ('Sky Plaza' has no Arabic and stays as it is). */
  if (/[؀-ۿ]/.test(s) || !/[0-9A-Za-z]/.test(s)) return s;
  return `⁦${s}⁩`;
}

/**
 * Arabic for a value that came from the sheet or CONFIG.
 *
 * NOT td() from js/i18n.js, and the difference matters: td() returns its input
 * unchanged when the app is in English, which is right for the UI and wrong
 * here. The post is Arabic whatever language the agent is working in, so an
 * English session using td() would have produced "تقسيط 7 years" and
 * "Second Floor" inside an otherwise Arabic post. Reads the same table, ignores
 * the current language. Unknown value → unchanged, same as td().
 */
function postAr(kind, value) {
  if (value == null || typeof DATA_AR === 'undefined') return value;
  const map = DATA_AR[kind];
  return (map && map[value] !== undefined) ? map[value] : value;
}

/** What the agent has chosen in the sheet. Survives reopening, not reloading. */
const postState = { mode: 'short', terms: true };

/* ------------------------------------------------------------------ text -- */

/** Arabic for the unit's Type, from CONFIG.post.unitNouns; falls back to the
 *  generic word rather than printing an English type into an Arabic post. */
function postUnitNoun(unit) {
  const P = CONFIG.post || {};
  return (P.unitNouns && P.unitNouns[unit.type]) || P.unitNoun || 'وحدة';
}

/**
 * The unit block — the only part that changes per post, and the only part
 * whose numbers must never be typed by a human.
 */
function postUnitBlock(unit, plan) {
  const P = CONFIG.post || {};
  const lines = [];

  lines.push(`${postUnitNoun(unit)} ${iso(unit.area)} متر`);
  if (unit.outdoor) lines.push(`+ ${iso(unit.outdoor)} متر مساحة خارجية`);

  lines.push(postAr('floor', unit.floorName || unit.floorCode));
  lines.push(`كود الوحدة ${iso(unit.code)}`);
  lines.push('');

  /* The discount is per-unit data read from the sheet, not a rule the app
   * applies — 0/10/15/20% all occur — so it is printed only where the row
   * actually carries one, and the saving is stated in money because that is
   * the number a broker repeats. */
  if (unit.discount) {
    lines.push(`السعر قبل الخصم ${iso(postNum(unit.total))} جنيه`);
    lines.push(`خصم ${iso(pctLabel(unit.discount))} — توفير ${iso(postNum(unit.total - unit.price))} جنيه`);
  }
  lines.push(`📍 السعر ${iso(postNum(unit.price))} جنيه`);

  /* Terms are computed, never written. An agent quoting "20% down" off the top
   * of their head against a plan that is actually 30% is the failure this app
   * exists to prevent, and free text here would reintroduce it. */
  if (postState.terms && plan) {
    const { summary } = buildSchedule(unit, plan);
    lines.push(`💰 مقدم ${iso(pctLabel(summary.downPct != null ? summary.downPct : plan.down))}`
      + ` — ${iso(postNum(summary.downPayment))} جنيه`);
    // DATA_AR already carries the Arabic for every tenor — "7 years" is
    // "7 سنوات" — so the label is looked up, never reassembled from digits.
    const tenor = postAr('plan', plan.label);
    lines.push(`تقسيط ${iso(tenor)}`
      + ` · ${iso(summary.instalmentCount)} قسط ربع سنوي ${iso(postNum(summary.instalmentAmount))} جنيه`);

    /* MILESTONES MUST BE NAMED, or the post is short by up to 20% of the price.
     *
     * A milestone comes out of the 100%, never on top of it — the level
     * instalment is (1 - down - milestones) / instalments — and the engine
     * folds each one INTO its quarter's instalment rather than giving it a row
     * of its own. So `instalmentAmount` is the amount of a PLAIN quarter, and
     * on the 10-year plan "50% down, 40 quarterly instalments of 8,424" adds up
     * to 898,560 against a price of 1,123,200. A broker reading that either
     * mistrusts the post or repeats a total that is 224,640 short.
     *
     * Naming the boosted quarters is the smallest honest fix. It only appears
     * on plans that have them: the 4-year plan has none, and the 6-year plan
     * has a single 10% at delivery. */
    const ms = typeof milestonesFor === 'function' ? milestonesFor(plan) : {};
    const stages = Object.keys(ms).map(Number).sort((a, b) => a - b);
    if (stages.length) {
      lines.push('+ دفعات مرحلية: '
        + stages.map((q) => `${iso(pctLabel(ms[q]))} مع القسط ${iso(q)}`).join('، '));
    }
  }
  return lines;
}

/**
 * @param {'short'|'long'} mode
 * @returns {string} the post, ready to paste into WhatsApp.
 */
function buildPostText(mode = postState.mode) {
  const unit = state.unit;
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  const P = CONFIG.post || {};

  const out = [];
  if (P.title) out.push(P.title);
  if (P.place) out.push(P.place);
  out.push('');
  out.push(...postUnitBlock(unit, plan));

  if (mode === 'long') {
    if (P.body) { out.push('', '━━━━━━━━━━', '', P.body.trim()); }
    // The maps pin, not the app link — see the note at the top of this file.
    if (CONFIG.mapsUrl) out.push('', `📍 الموقع على الخريطة: ${CONFIG.mapsUrl}`);
  }
  if (P.closing) out.push('', P.closing);

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/* ----------------------------------------------------------------- image -- */

const postImgCache = new Map();

function postLoadImage(src) {
  if (postImgCache.has(src)) return postImgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
  // A failed decode must not be remembered as the answer forever.
  p.catch(() => postImgCache.delete(src));
  postImgCache.set(src, p);
  return p;
}

/** Rounded rectangle path — canvas has no primitive for one in older Safari. */
function postRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The floor drawing with this unit marked, as a JPEG blob.
 *
 * Deliberately the same picture the PDF's floor page shows, and for the same
 * reasons recorded there: the WHOLE plate including roads and pavement, because
 * the surroundings are part of how the project reads; the buildings that do not
 * carry the unit merely quieter rather than masked out, so the customer sees
 * the project and their own place inside it; and the unit's code on a callout
 * tag rather than as loose text, because loose text landed on the drawing's own
 * printed room numbers.
 */
async function buildPinnedPlan(unit) {
  const def = PLANS[unit.floorCode];
  if (!def || !def.image) throw new Error('no drawing for this floor');
  const img = await postLoadImage(def.image);

  const scale = Math.min(1, POST_MAX_W / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const bId = unit.building;
  const shape = bId && typeof focusShape === 'function' ? focusShape(unit.floorCode, bId) : null;

  /* Two passes. Faded first, then again at full strength clipped to the
   * building's own outline. Fade ONLY when something is redrawn sharp on top:
   * dimming the plate and never lifting the dim would hand the customer a
   * washed-out drawing of the floor they are buying on. */
  ctx.globalAlpha = shape ? 0.35 : 1;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.globalAlpha = 1;

  if (shape) {
    ctx.save();
    ctx.beginPath();
    shape.forEach(([nx, ny], i) => (i ? ctx.lineTo(nx * w, ny * h) : ctx.moveTo(nx * w, ny * h)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  }

  const pin = def.pins && def.pins[unit.code];
  if (pin) {
    // Pin x/y are fractions of the drawing's width and HEIGHT.
    const px = pin[0] * w, py = pin[1] * h;
    const u = w / 900;                    // one "unit" of pin, scaled to the image

    ctx.strokeStyle = 'rgba(191,157,109,.75)';
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.arc(px, py, 11 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d64034';
    ctx.beginPath(); ctx.arc(px, py, 4.2 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, 1.5 * u, 0, Math.PI * 2); ctx.fill();

    /* The code as a callout that floats above the pin, clamped to the frame so
     * it can never be clipped. If the pin sits near the top the tag goes below
     * it and the tail flips with it. The tail stays on the PIN, not on the
     * tag's centre, so a clamped tag still points at the right room. */
    const fs = Math.round(15 * u);
    ctx.font = `700 ${fs}px "Segoe UI", Arial, sans-serif`;
    const tw = ctx.measureText(unit.code).width;
    const padX = 7 * u, tagH = 13 * u, tail = 5 * u, gap = 2.5 * u;
    const tagW = tw + padX * 2;

    const below = py - (gap + tail + tagH) < 1;
    const tagY = below ? py + gap + tail : py - gap - tail - tagH;
    const tagX = Math.max(1, Math.min(px - tagW / 2, w - tagW - 1));
    const tx = Math.max(tagX + 4 * u, Math.min(px, tagX + tagW - 4 * u));

    ctx.fillStyle = '#9e221c';
    postRoundRect(ctx, tagX, tagY, tagW, tagH, 3 * u);
    ctx.fill();
    ctx.beginPath();
    if (below) {
      ctx.moveTo(tx - 4 * u, tagY); ctx.lineTo(tx + 4 * u, tagY); ctx.lineTo(px, py + gap);
    } else {
      ctx.moveTo(tx - 4 * u, tagY + tagH); ctx.lineTo(tx + 4 * u, tagY + tagH); ctx.lineTo(px, py - gap);
    }
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unit.code, tagX + tagW / 2, tagY + tagH / 2 + 0.5 * u);
  }

  return new Promise((resolve, reject) => cv.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('could not render the drawing'))),
    'image/jpeg', POST_JPEG_Q));
}

async function postFileFromAsset(src, name) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`could not load ${src}`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

/**
 * The images that go with the post: the pinned drawing always, plus the
 * location render in long mode — a broker who does not know the project asks
 * "where?" before anything else.
 */
async function buildPostImages(mode = postState.mode) {
  const unit = state.unit;
  const files = [];

  const plan = await buildPinnedPlan(unit);
  files.push(new File([plan], `Qomor-${unit.code}-plan.jpg`, { type: 'image/jpeg' }));

  const loc = CONFIG.art && CONFIG.art.location;
  if (mode === 'long' && loc) {
    // A missing render must not cost the agent the whole post.
    try { files.push(await postFileFromAsset(loc, 'Qomor-location.jpg')); }
    catch (err) { console.warn('location render:', err.message); }
  }
  return files;
}

/* -------------------------------------------------------------- the sheet -- */

/**
 * Copy that works without a secure context or clipboard permission.
 * The textarea is the fallback and it is also the point: an agent who wants to
 * add a line of their own edits it there and copies what they edited.
 */
async function postCopyText() {
  const ta = $('postText');
  try {
    await navigator.clipboard.writeText(ta.value);
    return true;
  } catch {
    ta.focus();
    ta.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

function postFlash(msg, bad) {
  const n = $('postNote');
  n.textContent = msg;
  n.className = bad ? 'bad' : '';
}

/** Log the post the way an offer is logged, so adoption is measurable. */
function postLog(delivery) {
  if (typeof logOffer !== 'function') return;
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  logOffer(offerRow(CONFIG.telemetry.project, state.unit, [state.unit], plan,
    buildSchedule(state.unit, plan).summary, { delivery, lang: lang() }));
}

/**
 * navigator.share, but it always settles.
 *
 * Even behind isHandheld() this is raced, because the failure it guards against
 * is silent: a promise that neither resolves nor rejects is not an error
 * anywhere, so the `finally` that re-enables the button never runs and the
 * agent is left with a dead control. See canShareFiles() in js/pdf.js for the
 * measurement that established this.
 */
function shareOrTimeOut(payload, ms = 60000) {
  return Promise.race([
    navigator.share(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('share timed out'), { name: 'TimeoutError' })), ms)),
  ]);
}

async function postShare() {
  const btn = $('postSend');
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('offer.preparing');
  try {
    const files = await buildPostImages();
    const text = $('postText').value;

    /* Text and image together where the browser takes both — Android WhatsApp
     * turns the text into the image caption, which is exactly the post. Where
     * it will not, the text is copied and the images are shared alone, and the
     * agent pastes one caption. Copying FIRST, because once the share sheet is
     * open the page has lost focus and the clipboard write is refused. */
    const payload = { files, text };
    const bothOk = typeof navigator.canShare === 'function' && navigator.canShare(payload);
    const copied = await postCopyText();

    const handheld = typeof isHandheld !== 'function' || isHandheld();
    if (handheld && typeof navigator.share === 'function') {
      try {
        await shareOrTimeOut(bothOk ? payload : { files });
        postLog(`post-${postState.mode}`);
        postFlash(bothOk ? t('post.sent') : t('post.sentImageOnly'));
        return;
      } catch (err) {
        // Dismissing the sheet is a decision, not a failure: do not then dump a
        // file into their downloads that they just declined to send.
        if (err && err.name === 'AbortError') { postFlash(t('post.cancelled')); return; }
        console.warn('share failed, saving instead:', err && err.message);
      }
    }

    for (const f of files) postSaveFile(f);
    postLog(`post-${postState.mode}`);
    postFlash(copied ? t('post.saved') : t('post.savedNoCopy'), !copied);
  } catch (err) {
    postFlash(t('post.failed', { message: err.message }), true);
  } finally {
    btn.disabled = false;
    btn.textContent = was;
  }
}

/** Desktop path: put the file in the downloads folder. */
function postSaveFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function renderPostPreview() {
  $('postText').value = buildPostText();
  for (const b of document.querySelectorAll('#postModes button')) {
    b.classList.toggle('on', b.dataset.mode === postState.mode);
  }
  $('postTerms').checked = postState.terms;

  const shots = $('postShots');
  shots.innerHTML = '';
  try {
    for (const f of await buildPostImages()) {
      const im = el('img');
      im.src = URL.createObjectURL(f);
      im.onload = () => setTimeout(() => URL.revokeObjectURL(im.src), 30000);
      shots.appendChild(im);
    }
  } catch (err) {
    shots.appendChild(el('p', 'note', t('post.noImage', { message: err.message })));
  }
}

function openPostSheet() {
  if (!state.unit || !state.planId) return;
  $('postSheet').hidden = false;
  document.body.classList.add('noscroll');
  postFlash('');
  renderPostPreview();
  warnIfStale();
}

/**
 * A post must not quietly carry a price the app is unsure about.
 *
 * This is the one delivery path where a wrong number cannot be taken back. A
 * PDF goes to one customer, who can be sent a corrected one; a post goes into
 * broker groups and is forwarded, screenshotted and quoted for weeks. And the
 * app IS sometimes unsure: when a workbook cannot be reached it falls back to
 * the snapshot in js/data.js and marks itself stale — easy to miss in a header
 * bar while the unit card in front of you looks perfectly normal.
 *
 * Not a hard block. The agent may have good reason, and they can see the date
 * and judge. But it has to be a decision rather than an accident, so it sits
 * beside the Send button instead of up in the header where it was being missed.
 */
function warnIfStale() {
  if (state.live) return;
  postFlash(t('post.stale', {
    date: state.fetchedAt ? fmtDate(state.fetchedAt) : t('post.staleUnknownDate'),
  }), true);
}

function closePostSheet() {
  $('postSheet').hidden = true;
  document.body.classList.remove('noscroll');
}
