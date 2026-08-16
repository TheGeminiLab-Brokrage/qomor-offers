/* Qomor Business Plaza — branded A4-landscape PDF offer.
 *
 * Page order was reset by the client 2026-08-14. It runs as two acts — the
 * project, then the customer's own unit — each opened by a title page, so the
 * reader always knows which one they are in:
 *
 *    1  Cover            the client's own title slide
 *    2  Location         full page: the map, the drive times, the Maps link
 *    3  THE PROJECT      title page, carrying the catalogue figures
 *    4  Hero render      full bleed
 *    5  Renders          day and night
 *    6  (clinics only)   the two clinic interiors
 *    7  UNIT OFFER       title page
 *    8  Your building    masterplan render, the chosen building picked out
 *    9  Your floor       floor drawing, the chosen unit pinned
 *   10  Your unit        areas and price
 *   11  Payment plan     the full schedule, headed by the unit's figures
 *   12  Terms            what is and is not settled
 *
 * Everything the customer reads comes from CONFIG (client catalogue) or from
 * the live sheet. Playbook rule 2: no client content is hard-coded here.
 */

const PW = 297, PH = 210;                 // A4 landscape, mm
const M = 16;                             // page margin

/* Brand ink, sampled off the client's catalogue cover and wordmark. */
const NAVY      = [11, 27, 43];
const NAVY_SOFT = [20, 44, 64];
const GOLD      = [191, 157, 109];
const INK       = [23, 32, 41];
/* The two quiet greys were both a shade too quiet to survive a phone screen —
 * the client's words were "specially what is written in light grey". Measured
 * against their own grounds they were 4.67:1 and 4.83:1, which clears WCAG AA
 * for normal text by a hair and then spends that margin on 6.6 pt labels read
 * at arm's length in daylight. Darkened to 7.3:1 and 7.1:1, comfortably AAA,
 * while staying clearly a step below INK and ON_NAVY so the hierarchy holds. */
const MUTED     = [72, 86, 98];
const LINE      = [218, 226, 233];
const PAPER     = [255, 255, 255];
const ON_NAVY   = [198, 210, 222];        // body text on a navy field
const ON_NAVY_2 = [152, 170, 188];        // and its quieter second rank

/**
 * The brand typefaces — set by registerFonts() once the document exists.
 *
 * They fall back to Helvetica, which is what the offer used to be set in
 * throughout. That fallback is a genuine degradation, not a neutral default:
 * see registerFonts.
 */
let DISPLAY = 'helvetica';                // Marcellus — titles
let SANS    = 'helvetica';                // Montserrat — everything else

/**
 * Whether THIS document is being written in Arabic.
 *
 * Module-level rather than threaded through every function because the whole
 * document is one language: there is no page, and no label, that is Arabic
 * while its neighbour is English. Set once by buildOfferPDF, read by everything
 * below, and reset on every build so one export cannot leak into the next.
 */
let RTL = false;

/**
 * Pull in jsPDF and the brand fonts the first time they are actually needed.
 *
 * Together they are 700 KB and nothing about browsing the inventory needs
 * either, so loading them up front just delayed the first paint. Called by
 * buildOfferPDF, and warmed by app.js once the page is idle so the first offer
 * does not pay for it either. The node test harness assigns window.jspdf and
 * window.QOMOR_FONTS directly, so both branches are no-ops there.
 */
let jspdfPending = null;
let fontsPending = null;
let arabicFontsPending = null;
let arabicCodePending = null;

/**
 * The Arabic shaper and dictionary, fetched if the page did not already load
 * them.
 *
 * THIS EXISTS BECAUSE OF A REAL FAILURE, reported from a phone on 2026-08-15:
 * the app was in Arabic and the offer came out in English.
 *
 * index.html loads js/arabic.js and js/pdf-ar.js with script tags. But the
 * service worker serves code stale-while-revalidate, so the FIRST visit after a
 * deploy gets the PREVIOUS index.html — which has no such tags, because they
 * did not exist yet. js/pdf.js could meanwhile be the new one. The result was
 * new PDF code running with no shaper and no dictionary, and because every
 * lookup falls back to English when they are missing, it produced a perfectly
 * ordinary English document and said nothing.
 *
 * Loading them from here removes the dependency on the shell being current: the
 * only file that has to be new is this one, and if it is not, there is no
 * Arabic code path to miss in the first place.
 */
async function loadArabicSupport() {
  if (typeof window === 'undefined') return;
  if (typeof forPdf === 'function' && typeof pt === 'function') return;
  if (!arabicCodePending) {
    arabicCodePending = Promise.all([
      typeof forPdf === 'function' ? null : loadScript('js/arabic.js', 'forPdf'),
      typeof pt === 'function' ? null : loadScript('js/pdf-ar.js', 'pt'),
    ]).catch((err) => {
      arabicCodePending = null;
      console.warn('arabic support:', err && err.message);
    });
  }
  await arabicCodePending;
}

/**
 * The Arabic face, fetched only when an offer is actually being written in
 * Arabic.
 *
 * 376 KB of base64 for a font with no Latin-only use — see the split in
 * scripts/make-fonts.js. An English export must not pay for it, and an Arabic
 * one only pays on the first export of the session.
 *
 * Failure is NOT fatal, on the same reasoning as the Latin fonts: registerFonts
 * falls back and warns. The Arabic will not render, which is bad, but throwing
 * here would give the agent nothing at all, which is worse.
 */
async function loadArabicFonts() {
  if (typeof window === 'undefined' || window.QOMOR_FONTS_AR) return;
  if (!arabicFontsPending) {
    arabicFontsPending = loadScript('vendor/fonts-ar.js', 'QOMOR_FONTS_AR').catch((err) => {
      arabicFontsPending = null;
      console.warn('arabic fonts:', err && err.message);
    });
  }
  await arabicFontsPending;
}

async function loadJsPDF() {
  /* The two are tracked SEPARATELY and on purpose.
   *
   * jsPDF is the engine and its failure is fatal. The fonts are not: they
   * change how the offer looks, and an offer that looks wrong still beats no
   * offer at all. An earlier version chained them into one promise, so a
   * fonts.js that 404'd — a part-finished deploy, a flaky connection — took the
   * whole export down with it and the agent got nothing. Never couple them
   * again. */
  if (typeof window === 'undefined' || !window.jspdf) {
    if (!jspdfPending) {
      jspdfPending = loadScript('vendor/jspdf.umd.min.js', 'jspdf').catch((err) => {
        jspdfPending = null;              // let a later attempt retry
        throw err;
      });
    }
    await jspdfPending;
  }

  if (typeof window !== 'undefined' && !window.QOMOR_FONTS) {
    if (!fontsPending) {
      fontsPending = loadScript('vendor/fonts.js', 'QOMOR_FONTS').catch((err) => {
        fontsPending = null;
        // Swallowed deliberately: registerFonts falls back to Helvetica.
        console.warn('fonts:', err && err.message);
      });
    }
    await fontsPending;
  }
}

/**
 * Load a classic script, and notice when it arrives but fails to run.
 *
 * `onload` fires once the file has been fetched AND EVALUATED — including when
 * evaluation threw. A bundle that parses on Chrome but not on an older Safari
 * therefore resolves here perfectly happily and quietly defines nothing, and
 * the first symptom surfaces thousands of lines later as a destructuring
 * TypeError with no clue in it: on 2026-08-14 an iPhone reported "Right side of
 * assignment cannot be destructured", which names neither the file nor the
 * fault. `expect` is the global the script is supposed to install, and any
 * evaluation error is captured off `window` and reported with it.
 */
function loadScript(src, expect) {
  return new Promise((resolve, reject) => {
    let evalError = null;
    const onError = (e) => {
      if (e && typeof e.filename === 'string' && e.filename.indexOf(src) !== -1) {
        evalError = e.message;
      }
    };
    window.addEventListener('error', onError);
    const settle = (fn) => { window.removeEventListener('error', onError); fn(); };

    const s = document.createElement('script');
    s.src = src;
    s.onload = () => settle(() => {
      if (expect && !window[expect]) {
        reject(new Error(`${src} loaded but did not run`
          + (evalError ? `: ${evalError}` : ' and defined nothing.')));
      } else {
        resolve();
      }
    });
    s.onerror = () => settle(() =>
      reject(new Error(`Could not load ${src} — check your connection.`)));
    document.head.appendChild(s);
  });
}

/**
 * Load the brand fonts into this document, and report whether it worked.
 *
 * Registration is per DOCUMENT and not on jsPDF.API: addFileToVFS reads
 * `this.internal.vFS`, and the API object has no `internal`, so the usual
 * `(function (jsPDFAPI) {...})(jsPDF.API)` shape from jsPDF's own font
 * converter throws here.
 *
 * WHY THE FONTS ARE EMBEDDED AT ALL. jsPDF's built-in fonts are the PDF
 * "standard 14" — the file merely NAMES Helvetica and trusts the reader to own
 * a copy. Acrobat and Chrome substitute silently, so it looked right on a
 * laptop for weeks; WhatsApp's in-app viewer on Android has no Helvetica, and
 * the client reported the text simply not showing. An offer that renders blank
 * on the device it is actually read on is not an offer.
 *
 * So the Helvetica fallback below is a last resort that reintroduces exactly
 * that bug. It exists only so a font that failed to download still yields a
 * document rather than an exception.
 */
function registerFonts(doc) {
  const w = typeof window !== 'undefined' ? window : {};
  const list = (w.QOMOR_FONTS || []).concat(RTL ? (w.QOMOR_FONTS_AR || []) : []);
  try {
    for (const [file, family, style, b64] of list) {
      doc.addFileToVFS(file, b64);
      doc.addFont(file, family, style);
    }
  } catch (err) {
    console.warn('fonts:', err && err.message);
  }
  const fonts = (doc.getFontList && doc.getFontList()) || {};

  /* An Arabic offer is set ENTIRELY in Amiri, display and body alike, and that
   * is a decision rather than a shortcut. Marcellus and Montserrat have not one
   * Arabic glyph between them, so the Arabic has to come from Amiri whatever
   * else happens; mixing Amiri's Arabic with Montserrat's Latin inside a single
   * run would mean switching fonts mid-string, which jsPDF cannot do in one
   * text() call. Amiri carries full ASCII, so "QSE-050" and "1,404,000" set in
   * it perfectly well, and one Naskh serif throughout reads as a considered
   * document rather than as two documents spliced together.
   *
   * Amiri was briefly swapped out for Noto Naskh Arabic on 2026-08-15, on the
   * theory that its joined forms needed cursive attachment a PDF never applies.
   * That theory was wrong — the letters were being separated by jsPDF reversing
   * the run, see disarmJsPdfArabic() — and the swap cost more than it looked:
   * the Noto subset carried no Latin, no % and no ², so unit codes and every
   * percentage silently vanished from the Arabic offer. Amiri stays.
   *
   * It also quietly removes the Marcellus digit trap — see titleFont(). */
  if (RTL && fonts.Amiri) {
    DISPLAY = 'Amiri';
    SANS    = 'Amiri';
    return true;
  }
  const ok = fonts.Montserrat;
  DISPLAY = ok ? 'Marcellus'  : 'helvetica';
  SANS    = ok ? 'Montserrat' : 'helvetica';
  if (!ok) console.warn('fonts: falling back to Helvetica — text may not render on some phones');
  if (RTL) console.warn('fonts: Arabic face missing — the Arabic will not render');
  return !!ok;
}

/* ------------------------------------------------------- direction, and text */

/**
 * The single funnel every piece of text in the document passes through.
 *
 * English: strips to what the Latin subsets can draw, exactly as before.
 * Arabic: shapes into presentation forms and reorders into drawing order — see
 * js/arabic.js for why both are necessary and why jsPDF cannot be trusted to do
 * either. Nothing may call doc.text() without coming through here, because a
 * string that skips it is not merely styled differently, it is unreadable:
 * disconnected letters in backwards order.
 */
function TX(s) {
  const str = String(s == null ? '' : s);
  if (!RTL) return latin(str);
  return typeof forPdf === 'function' ? forPdf(str) : str;
}

/**
 * Stop jsPDF re-processing Arabic that js/arabic.js has already finished.
 *
 * TX() hands over text that is fully shaped AND already in drawing order. jsPDF
 * assumes neither, and runs two passes of its own over every string. Both are
 * correct for raw logical Arabic and both are destructive here:
 *
 *   preProcessText  -> processArabic(). Re-runs the joining pass. On reordered
 *     text its neighbour test reads the wrong way round, so a lam that merely
 *     ENDS UP beside an alef gets fused into the lam-alef ligature U+FEFB. In
 *     "إجمالي" the letters are alef-then-lam; reversed for drawing they sit
 *     lam-then-alef, and the word silently loses a letter.
 *
 *   postProcessText -> the bidi engine, which defaults to isInputVisual only.
 *     It reverses the run a SECOND time, undoing visualOrder() and putting the
 *     glyphs back in logical order. Every joining form then faces its neighbour
 *     the wrong way, and the letters are drawn side by side without touching.
 *     That is the whole of "the letters are separated not connected"; it was
 *     never the typeface. Amiri was blamed and replaced for this — see
 *     scripts/make-fonts.js.
 *
 * The bidi pass is disarmed per call, by declaring the output visual as well as
 * the input, which makes doBidiReorder an identity. processArabic cannot be
 * disarmed that way: the event holds a direct reference to the function, so
 * reassigning jsPDF.API.__arabicParser__.processArabic does not reach it and it
 * has to be unsubscribed from this document.
 *
 * Wrapping doc.text() rather than editing the call sites is deliberate. There
 * are roughly twenty of them and a missed one is not a visibly wrong option, it
 * is one line of unreadable Arabic in an offer that is otherwise perfect.
 */
function disarmJsPdfArabic(doc) {
  const events = doc.internal && doc.internal.events;
  if (events && typeof events.getTopics === 'function') {
    const topics = events.getTopics() || {};
    for (const token of Object.keys(topics.preProcessText || {})) events.unsubscribe(token);
  }

  /* Measurement reads the parser through the object, not through the captured
     reference, so this one CAN be reassigned — and must be, or getTextWidth()
     measures the ligature it no longer draws and right-aligned runs sit off by
     a glyph. Restored when the document is done with. */
  const parser = window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API
               && window.jspdf.jsPDF.API.__arabicParser__;
  const original = parser && parser.processArabic;
  if (parser) parser.processArabic = (a) => (typeof a === 'string' ? a : (a && a.text));

  const text = doc.text.bind(doc);
  doc.text = (str, x, y, options, ...rest) =>
    text(str, x, y, { ...(options || {}), isInputVisual: true, isOutputVisual: true }, ...rest);

  return () => { if (parser && original) parser.processArabic = original; };
}

/**
 * Grow the document's small type, once, for every call site at once.
 *
 * The client's report on 2026-08-16 was that the offer "requires to zoom in to
 * see it, specially what is written in light grey". They are right: the body
 * and label sizes here run 5.8–8.4 pt, which is fine on a laptop at 100% and
 * genuinely unreadable on the phone the offer is actually opened on.
 *
 * The sizes are set at ~30 call sites, so this scales them centrally instead —
 * missing one would leave a single paragraph at the old size, which reads as a
 * mistake rather than as a smaller style. Wrapping setFontSize also keeps
 * MEASUREMENT honest: getTextWidth() and the align maths both read the active
 * size, so they grow with the text and alignment stays put.
 *
 * It is a taper, NOT a flat multiplier. The display sizes (19–44 pt) are
 * already large and scaling them would only push the titles into the artwork;
 * the whole problem is at the bottom of the scale, so that is where the gain
 * goes. 6.6 pt becomes 8.1, 5.8 becomes 7.1, and anything from 12 pt up is left
 * exactly as drawn.
 *
 * The payment table absorbs this because it solves its own row height (see
 * rowHeightFor) rather than assuming one, so the rows open up to suit.
 */
function readableSize(pt) {
  if (pt >= 12) return pt;                       // display type — already big
  if (pt <= 8) return pt * 1.22;
  return pt * (1.22 - 0.22 * ((pt - 8) / 4));    // taper 8 pt -> 12 pt
}

function enlargeType(doc) {
  const set = doc.setFontSize.bind(doc);
  doc.setFontSize = (pt) => set(readableSize(pt));
  return doc;
}

/**
 * Mirror a text anchor inside the box it belongs to.
 *
 * The user's decision (2026-08-15) was that the TEXT flips and the LAYOUT stays:
 * the Arabic reads right to left and the table columns reverse, but photographs,
 * panels and the cover keep their positions. So mirroring is done per CONTAINER
 * rather than per page — an anchor at `x` inside the box [x0, x1] moves to the
 * mirror-image position within that same box, and nothing outside the box
 * moves. Mirroring the whole page instead would send a panel's caption to the
 * far side of the sheet from the panel it captions.
 *
 * The default box is the page's content width, which is the right container for
 * most of the document.
 */
const ax = (x, x0 = M, x1 = PW - M) => (RTL ? x0 + x1 - x : x);

/** Options for a run that STARTS at its anchor, and one that ENDS at it. */
const startAlign = () => (RTL ? { align: 'right' } : undefined);
const endAlign   = () => (RTL ? undefined : { align: 'right' });

/** Draw a run that starts at `x` within [x0, x1]. */
function tStart(doc, s, x, y, x0, x1) {
  doc.text(TX(s), ax(x, x0, x1), y, startAlign());
}

/** Draw a run that ends at `x` within [x0, x1] — prices, times, figures. */
function tEnd(doc, s, x, y, x0, x1) {
  doc.text(TX(s), ax(x, x0, x1), y, endAlign());
}

function imageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/**
 * Load an image ready for jsPDF.
 *
 * Preferred path: read the file and hand jsPDF a data: URL, so it embeds the
 * JPEG bytes as-is. Passing an <img> element instead sends jsPDF through its
 * canvas path, which re-encodes every render and bloats the file several times
 * over.
 *
 * fetch() is blocked on file://, so opening index.html by double-clicking falls
 * back to the element and simply produces a bigger PDF. That is also why the
 * app must be served over http — see README.
 */
async function loadImage(src) {
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('could not read blob'));
      fr.readAsDataURL(blob);
    });
    const el = await imageElement(dataUrl);
    return { data: dataUrl, format: imageFormat(src, blob.type), width: el.width, height: el.height };
  } catch {
    const el = await imageElement(src);
    return { data: el, format: imageFormat(src), width: el.width, height: el.height };
  }
}

/** Load several images, tolerating any that are missing. */
async function loadImages(list) {
  const out = await Promise.all(
    (list || []).map((s) => loadImage(s).catch((err) => {
      console.warn('artwork:', s, err.message);
      return null;
    })),
  );
  return out.filter(Boolean);
}

/**
 * Fetch every piece of artwork an offer can need, ALL AT ONCE.
 *
 * This exists because the obvious thing — awaiting each image at the point it
 * is drawn — is quietly disastrous over a phone connection. It made the fetches
 * run in seven sequential stages (logo, then cover, then location, then the
 * night renders, then the day renders, then the clinics, then the floor plan)
 * with the connection sitting idle between each. Measured on a throttled 4G
 * profile on 2026-08-14: a 9.7 s export, most of it round-trip latency rather
 * than transfer, and the user's own phone was worse.
 *
 * Requesting them together lets the browser saturate the link, so the wall time
 * falls back to what the bytes actually cost. Values may be a URL, an array of
 * URLs, or null/undefined for a page this offer does not have.
 */
async function loadArtwork(spec) {
  const keys = Object.keys(spec);
  const loaded = await Promise.all(keys.map((k) => {
    const v = spec[k];
    if (Array.isArray(v)) return loadImages(v);
    if (!v) return Promise.resolve(null);
    return loadImage(v).catch((err) => {
      console.warn('artwork:', v, err.message);
      return null;
    });
  }));
  const out = {};
  keys.forEach((k, i) => { out[k] = loaded[i]; });
  return out;
}

/**
 * Which format to tell jsPDF an image is.
 *
 * It matters: jsPDF takes the format as an argument and does not sniff the
 * bytes, so labelling the logo PNG as 'JPEG' produces a corrupt page rather
 * than an error. The logo has to be PNG — it is the only format here carrying
 * an alpha channel, and the wordmark has to be transparent to sit on navy.
 */
function imageFormat(src, mime) {
  if (mime && /png/i.test(mime)) return 'PNG';
  if (/\.png(\?|#|$)/i.test(String(src))) return 'PNG';
  return 'JPEG';
}

/** Cover-fit into a box, cropping the overflow like CSS object-fit:cover. */
function coverRect(img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  return { x: x - (dw - w) / 2, y: y - (dh - h) / 2, w: dw, h: dh };
}

/** Contain-fit — the whole image visible, centred. */
function containRect(img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}

const setFill = (doc, c) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc, c) => doc.setDrawColor(c[0], c[1], c[2]);
const setText = (doc, c) => doc.setTextColor(c[0], c[1], c[2]);

/* The Qomor wordmark, loaded once and reused on every page. header() is
 * synchronous and runs many times, so the artwork must be in hand before the
 * first page is drawn; buildOfferPDF fills this in. */
let WORDMARK = null;
const WORDMARK_ASPECT = 578 / 260;        // assets/logo.png, measured

/**
 * Cover-fit an image inside a box, genuinely clipped to it.
 *
 * A cover fit always overflows on one axis — often far outside the box — so
 * this has to clip rather than paint the spill over afterwards. An earlier
 * version masked the overflow with white rectangles and they silently erased
 * whatever had already been drawn beside the image: the whole left column of
 * the project page, and the header bar on every full-width render.
 */
function drawInBox(doc, img, x, y, w, h) {
  const r = coverRect(img, x, y, w, h);
  doc.saveGraphicsState();
  clipTo(doc, x, y, w, h);
  doc.addImage(img.data, img.format, r.x, r.y, r.w, r.h, undefined, 'FAST');
  doc.restoreGraphicsState();
}

/**
 * Clip everything that follows to a rectangle, until restoreGraphicsState().
 *
 * The `null` style is load-bearing. doc.rect(x,y,w,h) defaults to 'S', which
 * emits `re S` — the S paints the rectangle AND ends the path, so the following
 * `W` has no path to clip with and is silently ignored. Passing null emits the
 * `re W n` the clip actually needs. Getting this wrong does not error: it draws
 * a stray stroked box and leaves every image unclipped.
 */
function clipTo(doc, x, y, w, h) {
  doc.rect(x, y, w, h, null);
  doc.clip();
  doc.discardPath();
}

/**
 * A soft scrim under type that sits on a render, densest at the foot.
 *
 * jsPDF has no gradient fills, and a single translucent rectangle leaves a hard
 * horizontal seam straight across the image — clearly visible on the hero page,
 * and the sort of thing that makes a document look assembled rather than
 * designed. So it is banded, with the opacity ramped quadratically: enough
 * steps that the seams fall below the resolution of any viewer.
 */
function gradientScrim(doc, x, y, w, h, max = 0.78, bands = 18) {
  doc.saveGraphicsState();
  setFill(doc, NAVY);
  const bh = h / bands;
  for (let i = 0; i < bands; i += 1) {
    const t = (i + 1) / bands;                  // 0 at the top of the scrim, 1 at the foot
    doc.setGState(new doc.GState({ opacity: max * t * t }));
    // +0.3 so consecutive bands overlap rather than leave hairlines between them
    doc.rect(x, y + i * bh, w, bh + 0.3, 'F');
  }
  doc.restoreGraphicsState();
}

/**
 * The embedded fonts carry Latin-1 plus a handful of typographic marks and
 * nothing else — deliberately, because that is what keeps them at 94 KB rather
 * than 435 KB (see scripts/make-fonts.js). Anything outside that set has no
 * glyph and prints as a blank box, so it is stripped here, exactly as it was
 * when the built-in WinAnsi fonts were in use. The Arabic in ASSUMPTIONS and a
 * U+2212 minus are the two that turn up in practice.
 */
function latin(s) {
  return String(s)
    .replace(/−/g, '-')                 // minus sign -> hyphen
    .replace(/[^ -ÿ–—‘’“”•]/g, '')
    .replace(/\(\s*[/,\s]*\s*\)/g, '')       // brackets left empty by the strip
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}

/**
 * Tracked-out capitals — the idiom of the client's own wordmark, where
 * "BUSINESS PLAZA" is letterspaced under the Qomor lettering. Every small label
 * in the document is set this way, which is most of what makes the pages read
 * as one family rather than as Helvetica at assorted sizes.
 *
 * Never right-aligned: jsPDF's width measurement does not include the character
 * spacing it is about to emit, so an aligned run overhangs its anchor by the
 * accumulated tracking.
 */
function caps(doc, text, x, y, opts = {}) {
  const { size = 7, colour = MUTED, track = 0.55, style = 'bold', x0, x1 } = opts;
  doc.setFont(SANS, style).setFontSize(size);
  setText(doc, colour);

  /* ARABIC IS NEVER TRACKED OUT, and never uppercased.
   *
   * Letterspacing is the whole idea of this label style in Latin, and it is
   * actively destructive in Arabic: the script is joined, so adding space
   * between characters pulls the joins apart and prints what looks like a
   * word broken into pieces. toUpperCase() is merely a no-op on Arabic, but
   * skipping it costs nothing and says so.
   *
   * Losing the tracking also removes the reason this helper could never be
   * right-aligned — jsPDF measures a run without the character spacing it is
   * about to add, so an aligned tracked run overhangs its anchor. With the
   * tracking off, the measurement is honest and Arabic can align right. */
  if (RTL) {
    tStart(doc, text, x, y, x0, x1);
    return;
  }
  doc.setCharSpace(track);
  doc.text(latin(String(text).toUpperCase()), x, y);
  doc.setCharSpace(0);
}

/**
 * Set a title in Marcellus, or in Montserrat if it contains a digit.
 *
 * Marcellus descends from Trajan's inscriptional capitals and its figures are
 * drawn to match them: the zero is a plain circle and the one is barely
 * distinguishable from an I. Beautiful on "Qomor Business Plaza" — but it turns
 * "Unit QSE-050" into "Unit QSE-O5O" and "10 years plan" into "IO years plan",
 * and this is a document whose entire content is unit codes, dates and money.
 * So any title carrying a digit is set in the sans instead.
 *
 * The size is trimmed with it, because Montserrat's bold runs optically larger
 * than Marcellus at the same point size.
 */
function titleFont(doc, text, size) {
  /* Moot in Arabic: the whole document is Amiri, whose figures are ordinary
     figures, so there is no digit to protect against. */
  const numeric = !RTL && /\d/.test(String(text));
  doc.setFont(numeric ? SANS : DISPLAY, numeric || RTL ? 'bold' : 'normal')
     .setFontSize(numeric ? size * 0.84 : size);
  return doc;
}

function header(doc, title, sub) {
  setFill(doc, NAVY);
  doc.rect(0, 0, PW, 18, 'F');
  setFill(doc, GOLD);
  doc.rect(0, 18, PW, 0.7, 'F');

  /* The wordmark stays in the same corner in both languages, exactly as it does
     in the app's own header — it is a picture of a name, not a run of text. */
  if (WORDMARK) {
    const h = 7.4;
    doc.addImage(WORDMARK.data, WORDMARK.format, M, 5.3, h * WORDMARK_ASPECT, h, undefined, 'FAST');
  } else {
    caps(doc, 'Qomor', M, 12, { size: 11, colour: PAPER, track: 1.4 });
  }

  setText(doc, PAPER);
  titleFont(doc, title, 13);
  doc.text(TX(title), PW / 2, 12.2, { align: 'center' });
  if (sub) {
    setText(doc, GOLD);
    doc.setFont(SANS, 'normal').setFontSize(7.6);
    /* Pinned to the right in BOTH languages, and not mirrored with everything
       else. The wordmark opposite it does not move — it is a picture of a name
       — so mirroring the subtitle drove it straight underneath the logo. When
       one end of a pair is fixed, the other has to be too. */
    doc.text(TX(sub), PW - M, 12, { align: 'right' });
  }
}

function footer(doc, unit, page, dark) {
  setDraw(doc, dark ? NAVY_SOFT : LINE);
  doc.setLineWidth(0.2);
  doc.line(M, PH - 12, PW - M, PH - 12);
  doc.setFont(SANS, 'normal').setFontSize(6.6);
  setText(doc, dark ? ON_NAVY_2 : MUTED);
  tStart(doc, RTL
    ? pt('foot.unit', { name: pd('name', CONFIG.name),
                        location: pd('location', CONFIG.location), code: unit.code })
    : `${CONFIG.name} · ${CONFIG.location} · Unit ${unit.code}`, M, PH - 7.5);
  doc.text(TX(RTL ? pt('foot.indicative')
                  : 'Indicative offer — subject to availability at the time of contract.'),
           PW / 2, PH - 7.5, { align: 'center' });
  /* The page number sits at the edge OPPOSITE the project line, which is the
     whole point of putting it at an edge: pinning it to PW - M in both
     directions printed it on top of the document's own name in Arabic, where
     tStart() has already mirrored that name to the same corner. Digits are not
     mirrored themselves — ax() moves the anchor, TX() is not wanted here. */
  doc.text(String(page), ax(PW - M), PH - 7.5, endAlign());
}

function sectionTitle(doc, text, y) {
  titleFont(doc, text, 21);
  setText(doc, INK);
  tStart(doc, text, M, y);
  setFill(doc, GOLD);
  /* The rule under a section title marks where the title BEGINS, so it moves
     to the other end with the text. */
  doc.rect(RTL ? PW - M - 22 : M, y + 3.4, 22, 1, 'F');
  return y + 13;
}

/** A small label/value stack, the unit of most of these pages. */
function stat(doc, label, value, x, y, valueSize = 13, colour = INK, box) {
  const [x0, x1] = box || [M, PW - M];
  caps(doc, label, x, y, {
    size: 6.6, colour: colour === INK ? MUTED : ON_NAVY_2, track: 0.5, x0, x1,
  });
  doc.setFont(SANS, 'bold').setFontSize(valueSize);
  setText(doc, colour);
  tStart(doc, value, x, y + 6.6, x0, x1);
}

/** A label / value line in a list, value flush to `right`. */
function listRow(doc, label, value, x, right, y, opts = {}) {
  const { size = 8, colour = MUTED, valueColour = INK } = opts;
  /* The pair is mirrored inside its OWN row, so the label stays at the reading
     edge and the figure stays at the far one — the relationship the row is for
     survives, which it would not if only one of the two moved. */
  doc.setFont(SANS, 'normal').setFontSize(size);
  setText(doc, colour);
  tStart(doc, label, x, y, x, right);
  doc.setFont(SANS, 'bold');
  setText(doc, valueColour);
  tEnd(doc, value, right, y, x, right);
}

/** A gold bullet, used for every feature and term in the document. */
function bullet(doc, x, y, colour = GOLD, box) {
  const [x0, x1] = box || [M, PW - M];
  setFill(doc, colour);
  doc.circle(ax(x, x0, x1), y - 1.1, 0.8, 'F');
}

/**
 * The name the sales team asked for — it describes what the customer is looking
 * at rather than identifying the unit, because it is the name that shows up in
 * a WhatsApp chat.
 */
function offerFilename(unit, floor) {
  const use = /medical/i.test(unit.type || '') ? 'clinic'
            : /admin/i.test(unit.type || '') ? 'office' : 'retail';
  const where = (floor && floor.label) || unit.floorName || unit.floorCode;
  const name = `Qomor - ${Math.round(unit.area)}m ${use} offer ${where}.pdf`;
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

/** Draw a normalised polygon (fractions of image WIDTH) over a placed image. */
function drawPolygon(doc, pts, rect, style) {
  const p = pts.map(([x, y]) => [rect.x + x * rect.w, rect.y + y * rect.w]);
  const deltas = p.slice(1).map(([x, y], i) => [x - p[i][0], y - p[i][1]]);
  doc.lines(deltas, p[0][0], p[0][1], [1, 1], style, true);
}

/**
 * Clip to a building's outline, until restoreGraphicsState().
 *
 * Same trap as clipTo(): the `null` style is what stops jsPDF appending a
 * painting operator, leaving the path open for `W n` to clip with.
 */
function clipPolygon(doc, pts, rect) {
  drawPolygon(doc, pts, rect, null);
  doc.clip();
  doc.discardPath();
}

/**
 * Where to crop a floor drawing so the customer's own building fills the page.
 *
 * The sales plan is a single sheet covering Q, M, O and R side by side, plus a
 * title block. Contained whole on an A4 page that put each unit in a room about
 * 2 mm across — the pin was accurate and the drawing under it was unreadable,
 * which is not much use on the page that answers "where is my unit?".
 *
 * The crop is DERIVED from the pins, never measured: the bounding box of every
 * pin belonging to this building on this floor, padded (pins sit at room
 * centres, so the box stops half a room short on each edge). Re-read the pins
 * and the crop follows them.
 *
 * The box is used CONTAINED in the frame, not filling it. Widening it to the
 * frame's 2:1 was the first attempt and it dragged the neighbouring building
 * and the drawing's own title lettering into shot — Q is a tall block on a wide
 * sheet, so the growth all went sideways into M. Letterboxing costs some width
 * and shows nothing but the customer's own building, and the drawing sits on
 * white paper so the margins are invisible.
 *
 * Returns null when there are too few pins to define a box, and the caller
 * falls back to showing the whole sheet.
 *
 * @returns {{cx:number, cy:number, cw:number, ch:number}|null} centre and size,
 *          in image pixels.
 */
function buildingCrop(planDef, bId, img) {
  const pins = Object.keys(planDef.pins || {})
    .filter((code) => code.slice(0, bId.length) === bId)
    .map((code) => planDef.pins[code]);
  if (pins.length < 4) return null;

  /* Pin x is a fraction of the drawing's WIDTH and pin y a fraction of its
     HEIGHT, so the two axes are normalised independently. */
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const [x, y] of pins) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  /* Padding is half a room, no more: a room on this sheet is about 1.5% of the
     image width, and a generous 3.5% pulled the next building's rooms into the
     crop where the mask then sliced them in half. */
  x0 = Math.max(0, x0 - 0.014); x1 = Math.min(1, x1 + 0.014);
  y0 = Math.max(0, y0 - 0.022); y1 = Math.min(1, y1 + 0.022);

  let cw = (x1 - x0) * img.width;
  let ch = (y1 - y0) * img.height;
  const cx = ((x0 + x1) / 2) * img.width;
  const cy = ((y0 + y1) / 2) * img.height;

  /* A building with tightly clustered pins would be magnified past the
     resolution the drawing was exported at. Hold it to a fifth of the sheet. */
  const floor = img.width * 0.2;
  if (cw < floor) { ch *= floor / cw; cw = floor; }

  return { cx, cy, cw, ch };
}

/**
 * A map pin, drawn rather than typed.
 *
 * The Maps link used to be a line of 7pt text in the bottom-left corner of a
 * crowded page, and the client's own reading of the offer was that it was not
 * clear there was a link at all. It is now a gold button with this pin on it.
 */
function mapPin(doc, cx, cy, colour) {
  setFill(doc, colour);
  doc.circle(cx, cy, 2.2, 'F');
  doc.triangle(cx - 1.7, cy + 1.5, cx + 1.7, cy + 1.5, cx, cy + 4.6, 'F');
  setFill(doc, GOLD);
  doc.circle(cx, cy, 0.85, 'F');
}

/**
 * Every image an offer for this unit will draw.
 *
 * ONE definition, used both to build the offer and to warm it — if these two
 * ever drift apart the warm stops covering the build and silently does nothing
 * useful, which is exactly the sort of bug nobody notices.
 *
 * Only FIVE renders, not six: the hero uses night[0] and the grid uses day[0],
 * night[1], day[1], night[2]. `art.day[2]` was being downloaded on every offer
 * and never drawn — half a megabyte over mobile data for nothing. Change the
 * grid on the render page and change these slices with it.
 */
function offerArtworkSpec(unit) {
  const art = CONFIG.art || {};
  const planDef = typeof PLANS !== 'undefined' ? PLANS[unit.floorCode] : null;
  return {
    wordmark:   CONFIG.logo || 'assets/logo.png',
    cover:      art.cover,
    location:   art.location,
    masterplan: art.masterplan,
    floor:      planDef && planDef.image,
    night:      (art.night || []).slice(0, 3),
    day:        (art.day || []).slice(0, 2),
    clinic:     /medical/i.test(unit.type || '') ? (art.clinic || []) : [],
  };
}

/**
 * Pull the artwork into cache before anyone asks for the offer.
 *
 * An offer is about 4.6 MB of renders and drawings, and on a phone that is the
 * whole cost of the export — measured at ~27 s on a throttled 4G profile, and
 * the agent is left staring at "Preparing…" for all of it. But by the time a
 * unit has been picked there is still a payment plan to choose and a schedule
 * to read, which is tens of seconds of the agent doing something else. Spending
 * that window on the download makes the button feel instant without moving a
 * single byte onto the first-paint path.
 *
 * Deliberately fire-and-forget, and deliberately not called until a unit is
 * chosen: someone merely browsing the inventory should never pay for this.
 * Nothing is retained in memory — the service worker keeps the bytes, and
 * loadImage() finds them there.
 */
const warmedArtwork = new Set();
function warmOfferArtwork(unit) {
  if (!unit || typeof fetch !== 'function') return;
  const urls = Object.keys(offerArtworkSpec(unit))
    .map((k) => offerArtworkSpec(unit)[k])
    .reduce((all, v) => all.concat(v), [])
    .filter(Boolean);
  for (const url of urls) {
    if (warmedArtwork.has(url)) continue;
    warmedArtwork.add(url);
    fetch(url).catch(() => warmedArtwork.delete(url));   // retry on the next pick
  }
}

async function buildOfferPDF(unit, plan, floor, contractDate = new Date(), language) {
  /* Last line of defence. The UI already refuses to select anything not
   * available, but the offer is the document a customer acts on, so the export
   * refuses too rather than trusting its caller. */
  if (!unit || unit.state !== 'available') {
    throw new Error(unit && unit.heldReason
      ? `${unit.code} is on hold and cannot be offered — ${unit.heldReason}`
      : `${unit ? unit.code : 'This unit'} is not available, so no offer can be generated.`);
  }
  if (!plan) throw new Error('No payment plan selected.');

  /* THE OFFER IS WRITTEN IN THE LANGUAGE THE AGENT IS READING, on the user's
     instruction 2026-08-15. `language` overrides for the tests, which have no
     i18n.js and must be able to ask for either. Assigned before anything else
     happens because registerFonts and every helper below read it. */
  RTL = (language || (typeof lang === 'function' ? lang() : 'en')) === 'ar';

  await loadJsPDF();
  if (RTL) await Promise.all([loadArabicSupport(), loadArabicFonts()]);

  /* IF THE ARABIC MACHINERY IS NOT THERE, SAY SO — do not quietly write English.
   *
   * Every lookup in this file falls back to its English argument when pt() is
   * missing, which is the right behaviour for one stray label and completely
   * the wrong behaviour for all of them at once: it turns a broken Arabic export
   * into a flawless English one, and the agent sends it. Reported from a phone
   * on 2026-08-15 exactly that way. `fellBackToEnglish` is returned so the UI can
   * tell the agent what they are holding; see the offer button in app.js. */
  let fellBackToEnglish = false;
  if (RTL && typeof pt !== 'function') {
    console.warn('arabic: shaper or dictionary missing — writing this offer in English');
    fellBackToEnglish = true;
    RTL = false;
  }

  /* Check rather than destructure straight into it.
   *
   * `const { jsPDF } = window.jspdf` on an undefined window.jspdf throws the
   * engine's own message, and those messages are useless in the field: Safari
   * says "Right side of assignment cannot be destructured", which the click
   * handler then shows to a salesperson standing in front of a customer. It
   * names neither the library nor the fix. This does. */
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('The PDF library did not load. Reload the page and try again — '
                  + 'if it keeps happening, check the connection.');
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerFonts(doc);
  enlargeType(doc);
  const rearmJsPdfArabic = RTL ? disarmJsPdfArabic(doc) : null;

  const { rows, summary } = buildSchedule(unit, plan, contractDate);
  /* Dates stay en-GB in both languages — the client's standing instruction is
     that every figure on the offer matches the contract the customer signs. */
  const today = contractDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const isClinic = /medical/i.test(unit.type || '');
  const art = CONFIG.art || {};

  /* CONFIG values on their way to the page. `D` is the same idea as td() in
     i18n.js and behaves the same way: unknown values fall through UNCHANGED
     rather than disappearing, so a unit type operations invent tomorrow still
     prints — in English, visibly needing a translation — instead of leaving a
     blank where the customer expects a word. */
  const D = (kind, value) => (RTL && typeof pd === 'function' ? pd(kind, value) : value);
  const S = (key, vars, english) => (RTL && typeof pt === 'function' ? pt(key, vars) : english);

  /* The project's name, address and developer, in the client's own Arabic. */
  const NAME = D('name', CONFIG.name);
  const PLACE = D('location', CONFIG.location);
  const DEV = D('developer', CONFIG.developer);

  const money = (n) => `${fmt(n)} ${D('currency', CONFIG.currency)}`;
  const bId = unit.building;
  const bNameEn = (CONFIG.buildings.find((b) => b.id === bId) || {}).name || `Building ${bId}`;
  /* "Building Q" is a label with a letter in it, not a name — the letter is the
     client's own and stays Latin, the word around it is translated. Anything
     that is not of that shape falls through unchanged, same rule as everywhere
     else here. */
  const bName = RTL && /^Building (.+)$/.test(bNameEn)
    ? S('bld.name', { id: /^Building (.+)$/.exec(bNameEn)[1] }, bNameEn)
    : bNameEn;
  const floorName = D('floor', unit.floorName || unit.floorCode);
  const where = `${D('type', unit.type) || ''} · ${floorName} · ${bName}`.replace(/^ · /, '');
  const area = (n) => `${n} m²`;
  let page = 0;

  /** A white content page with the navy header bar. */
  const newPage = (title, sub) => {
    doc.addPage();
    page += 1;
    setFill(doc, PAPER); doc.rect(0, 0, PW, PH, 'F');
    header(doc, title, sub);
    footer(doc, unit, page, false);
  };

  /** A navy title page — the two act openers, and nothing else. */
  const newDarkPage = () => {
    doc.addPage();
    page += 1;
    setFill(doc, NAVY); doc.rect(0, 0, PW, PH, 'F');
    if (WORDMARK) {
      const h = 8.4;
      doc.addImage(WORDMARK.data, WORDMARK.format, M, 14, h * WORDMARK_ASPECT, h, undefined, 'FAST');
    }
    footer(doc, unit, page, true);
  };

  /* Everything this offer will draw, requested in one go — see loadArtwork,
     and offerArtworkSpec for what "everything" is. */
  const planDef = typeof PLANS !== 'undefined' ? PLANS[unit.floorCode] : null;
  const A = await loadArtwork(offerArtworkSpec(unit));
  WORDMARK = A.wordmark;

  /* ---------- 1. cover — the client's own title slide ---------- */
  page = 1;
  setFill(doc, NAVY); doc.rect(0, 0, PW, PH, 'F');
  const cover = A.cover;
  if (cover) {
    /* The slide is 16:9 and the page is 1.41:1, so cover-fitting crops about
       6% off each side. The lockup is centred on the slide, so it survives. */
    drawInBox(doc, cover, 0, 0, PW, PH * 0.74);
  } else if (WORDMARK) {
    const w = 110;
    doc.addImage(WORDMARK.data, WORDMARK.format, (PW - w) / 2, 55, w, w / WORDMARK_ASPECT, undefined, 'FAST');
  }

  setFill(doc, NAVY);
  doc.rect(0, PH * 0.74, PW, PH * 0.26, 'F');
  setDraw(doc, GOLD); doc.setLineWidth(0.6);
  /* The gold rule marks where the title starts, so it travels with it. */
  doc.line(ax(M), PH * 0.74, ax(M + 26), PH * 0.74);

  setText(doc, PAPER);
  doc.setFont(DISPLAY, RTL ? 'bold' : 'normal').setFontSize(26);
  tStart(doc, S('cover.offer', null, 'Offer'), M, PH * 0.74 + 16);
  doc.setFont(SANS, 'bold').setFontSize(10.5);
  setText(doc, GOLD);
  tStart(doc, S('cover.unit', { code: unit.code }, `Unit ${unit.code}`), M, PH * 0.74 + 24.5);
  doc.setFont(SANS, 'normal').setFontSize(8.4);
  setText(doc, ON_NAVY);
  tStart(doc, where, M, PH * 0.74 + 31);
  tEnd(doc, today, PW - M, PH * 0.74 + 31);
  doc.setFontSize(7.6);
  setText(doc, ON_NAVY_2);
  tEnd(doc, S('cover.by', { location: PLACE, developer: DEV },
              `${CONFIG.location}  ·  Developed by ${CONFIG.developer}`),
       PW - M, PH * 0.74 + 24.5);

  /* ---------- 2. location ---------- */
  const P = CONFIG.project || {};
  const locImg = A.location;
  newPage(S('page.location', null, 'Location'), PLACE);

  /* The map gets the left two thirds of the page rather than a quarter of it.
     On the old combined project page it was one panel among four, and the
     client's reading was that the location did not register at all. */
  const mapX = M, mapY = 26, mapW = 160, mapH = 148;
  if (locImg) {
    setFill(doc, NAVY); doc.rect(mapX, mapY, mapW, mapH, 'F');
    drawInBox(doc, locImg, mapX, mapY, mapW, mapH);
  }

  /* The text column keeps its position beside the map — the user's ruling was
     that the layout stays and the text flips — so every run on it mirrors
     inside [rx, PW - M] and not inside the page. */
  const rx = M + 168, rw = PW - M - rx;
  doc.setFont(DISPLAY, RTL ? 'bold' : 'normal').setFontSize(19);
  setText(doc, INK);
  tStart(doc, PLACE, rx, mapY + 8, rx, PW - M);
  setFill(doc, GOLD);
  doc.rect(ax(rx, rx, PW - M) - (RTL ? 22 : 0), mapY + 12, 22, 1, 'F');

  /* The place names come from the client's own catalogue in Arabic; the times
     are rebuilt, because "2 min" is "دقيقتان" and not "2 دقيقة" — Arabic counts
     two with a dual form that takes no digit at all. See minutes() in pdf-ar.js. */
  const trip = (r) => [D('places', r[0]),
                       RTL && typeof minutes === 'function' ? minutes(r[1]) : r[1]];

  let ly = mapY + 26;
  caps(doc, S('loc.within', null, 'Within Badr City'), rx, ly,
       { colour: INK, size: 7, x0: rx, x1: PW - M });
  ly += 7;
  (P.nearby || []).slice(0, 6).forEach((r, i) => {
    const [place, time] = trip(r);
    listRow(doc, place, time, rx, PW - M, ly + i * 6.2);
  });

  ly += 6 * 6.2 + 8;
  caps(doc, S('loc.wider', null, 'The wider east Cairo'), rx, ly,
       { colour: INK, size: 7, x0: rx, x1: PW - M });
  ly += 7;
  (P.reach || []).slice(0, 6).forEach((r, i) => {
    const [place, time] = trip(r);
    listRow(doc, place, time, rx, PW - M, ly + i * 6.2);
  });

  /* The Google Maps link, as a button. See mapPin() for why. */
  if (CONFIG.mapsUrl) {
    const btnY = mapY + mapH - 20, btnH = 14;
    setFill(doc, GOLD);
    doc.roundedRect(rx, btnY, rw, btnH, 1.8, 1.8, 'F');
    /* The pin leads the label, so it swaps ends with it. */
    mapPin(doc, ax(rx + 10, rx, PW - M), btnY + 5.8, NAVY);
    caps(doc, S('loc.maps', null, 'Open in Google Maps'), rx + 17, btnY + 8.4,
         { size: 8.6, colour: NAVY, track: 0.4, x0: rx, x1: PW - M });
    /* The whole button is the hit target, not just the glyph run — these offers
       are read on a phone, where a 7pt link is unusable. */
    doc.link(rx, btnY, rw, btnH, { url: CONFIG.mapsUrl });

    doc.setFont(SANS, 'normal').setFontSize(6.4);
    setText(doc, MUTED);
    /* A URL is never mirrored or reordered — it is a machine string that has to
       be typeable exactly as printed, so it is drawn LTR whatever the page is
       doing, anchored at the reading edge like the label above it. */
    doc.text(CONFIG.mapsUrl, RTL ? PW - M : rx, btnY + btnH + 5, startAlign());
    doc.link(rx, btnY + btnH + 1.5, rw, 5, { url: CONFIG.mapsUrl });
  }

  /* ---------- 3. THE PROJECT — act one title page ---------- */
  newDarkPage();
  caps(doc, S('proj.eyebrow', null, 'The project'), M, 62, { size: 8, colour: GOLD, track: 2 });
  doc.setFont(DISPLAY, RTL ? 'bold' : 'normal').setFontSize(38);
  setText(doc, PAPER);
  tStart(doc, NAME, M, 80);
  setFill(doc, GOLD);
  doc.rect(RTL ? PW - M - 30 : M, 87, 30, 1, 'F');

  stat(doc, S('proj.builtUp', null, 'Total built-up area'), P.builtUpArea || '—', M, 102, 17, PAPER);
  stat(doc, S('proj.mixedUse', null, 'Mixed-use area'), P.mixedUseArea || '—', M + 72, 102, 17, PAPER);

  /* Three columns of the client's own catalogue figures. The mix and the level
     areas are numbers the customer checks; the features and services are the
     client's own labels, verbatim — playbook rule 4, we do not write their
     marketing copy. */
  /* THE COLUMNS THEMSELVES REVERSE in Arabic, so the first one is the first one
     a reader meets. `column` mirrors a column's box across the page and returns
     it in ordinary left-to-right coordinates; every run inside it is then
     mirrored again within that box by tStart/listRow. Two mirrorings, and both
     are needed: one puts the column on the correct side of the page, the other
     puts the text against the correct edge of the column. */
  const column = (x, w) => (RTL ? { x: PW - x - w, w } : { x, w });
  const K1 = column(M, 76), K2 = column(M + 92, 80), K3 = column(M + 180, PW - M - M - 180);
  const listIn = (k, r, y) => listRow(doc, D(k.kind, r.label), r.area, k.box.x, k.box.x + k.box.w, y,
                                      { size: 7.8, colour: ON_NAVY_2, valueColour: PAPER });

  let cy = 126;
  caps(doc, S('proj.mix', null, 'Use mix'), K1.x, cy,
       { colour: GOLD, x0: K1.x, x1: K1.x + K1.w });
  (P.mix || []).forEach((r, i) => {
    listIn({ kind: 'mix', box: K1 }, r, cy + 7 + i * 5.6);
  });
  let c1y = cy + 7 + (P.mix || []).length * 5.6 + 6;
  caps(doc, S('proj.building', null, 'The building'), K1.x, c1y,
       { colour: GOLD, x0: K1.x, x1: K1.x + K1.w });
  (P.levels || []).forEach((r, i) => {
    listIn({ kind: 'levels', box: K1 }, r, c1y + 7 + i * 5.6);
  });

  /* A bulleted list mirrors as a unit: the bullet leads the line, so it moves
     to the other end and the text starts inboard of it. */
  const bulletList = (k, items, kind, headingKey, headingEn) => {
    caps(doc, S(headingKey, null, headingEn), k.x, cy, { colour: GOLD, x0: k.x, x1: k.x + k.w });
    doc.setFont(SANS, 'normal').setFontSize(7.8);
    (items || []).forEach((f, i) => {
      const yy = cy + 7 + i * 5.6;
      bullet(doc, k.x + 1, yy, GOLD, [k.x, k.x + k.w]);
      setText(doc, ON_NAVY);
      tStart(doc, D(kind, f), k.x + 4.5, yy, k.x, k.x + k.w);
    });
  };
  bulletList(K2, P.features, 'features', 'proj.features', 'Features');
  bulletList(K3, P.services, 'services', 'proj.services', 'Services');

  /* ---------- 4-5. the renders ---------- */
  const night = A.night;
  const day = A.day;

  /* One render, full bleed, no header bar and no margin. This is the single
     biggest thing that makes the document read as a brochure rather than a
     report, and it costs nothing: the artwork is already loaded. */
  const hero = night[0] || day[0];
  if (hero) {
    doc.addPage();
    page += 1;
    setFill(doc, NAVY); doc.rect(0, 0, PW, PH, 'F');
    drawInBox(doc, hero, 0, 0, PW, PH);
    gradientScrim(doc, 0, PH - 62, PW, 62);
    caps(doc, PLACE, M, PH - 26, { size: 7.4, colour: GOLD, track: 1.6 });
    titleFont(doc, NAME, 28);
    setText(doc, PAPER);
    tStart(doc, NAME, M, PH - 13);
    doc.setFont(SANS, 'normal').setFontSize(6.6);
    setText(doc, ON_NAVY_2);
    doc.text(String(page), ax(PW - M), PH - 13, endAlign());
  }

  /* The rest of the set, four up. */
  const grid = [day[0], night[1], day[1], night[2]].filter(Boolean);
  if (grid.length) {
    newPage(S('page.place', null, 'The place'), S('page.placeSub', null, 'By day and by night'));
    const gap = 4;
    const gw = (PW - 2 * M - gap) / 2, gh = (176 - 26 - gap) / 2;
    grid.slice(0, 4).forEach((img, i) => {
      const x = M + (i % 2) * (gw + gap);
      const yy = 26 + Math.floor(i / 2) * (gh + gap);
      setFill(doc, NAVY); doc.rect(x, yy, gw, gh, 'F');
      drawInBox(doc, img, x, yy, gw, gh);
    });
    doc.setFont(SANS, 'normal').setFontSize(7);
    setText(doc, MUTED);
    tStart(doc, S('render.note', null,
                  'Architectural visualisation. Finishes and landscaping are indicative.'), M, 182);
  }

  /* ---------- 6. clinics only ---------- */
  const clinic = A.clinic;
  if (clinic.length) {
    newPage(S('page.medical', null, 'The medical floor'), D('type', unit.type));
    const cy2 = 26, ch = 148, gap = 4;
    /* clinic-2 is a portrait lift-lobby shot; giving it a third of the width
       keeps it from being cropped to a letterbox sliver. */
    const wideW = clinic[1] ? (PW - 2 * M - gap) * 0.66 : (PW - 2 * M);
    setFill(doc, NAVY); doc.rect(M, cy2, wideW, ch, 'F');
    drawInBox(doc, clinic[0], M, cy2, wideW, ch);
    if (clinic[1]) {
      const nx = M + wideW + gap, nw = PW - M - nx;
      setFill(doc, NAVY); doc.rect(nx, cy2, nw, ch, 'F');
      drawInBox(doc, clinic[1], nx, cy2, nw, ch);
    }
    doc.setFont(SANS, 'normal').setFontSize(7);
    setText(doc, MUTED);
    tStart(doc, S('render.clinicNote', null,
                  'Architectural visualisation of the medical floor. Fit-out is indicative.'), M, 182);
  }

  /* ---------- 7. UNIT OFFER — act two title page ---------- */
  newDarkPage();
  caps(doc, NAME, M, 62, { size: 8, colour: GOLD, track: 2 });
  doc.setFont(DISPLAY, RTL ? 'bold' : 'normal').setFontSize(44);
  setText(doc, PAPER);
  tStart(doc, S('offer.title', null, 'Unit Offer'), M, 84);
  setFill(doc, GOLD);
  doc.rect(RTL ? PW - M - 30 : M, 91, 30, 1, 'F');
  /* The unit code is the one string on this page a customer will read back
     over the phone, so it is set in the sans — see titleFont. */
  doc.setFont(SANS, 'bold').setFontSize(22);
  setText(doc, GOLD);
  tStart(doc, S('cover.unit', { code: unit.code }, `Unit ${unit.code}`), M, 108);
  doc.setFont(SANS, 'normal').setFontSize(10.5);
  setText(doc, ON_NAVY);
  tStart(doc, where, M, 117);

  /* The four stats read in order across the page, so in Arabic they read in
     order FROM THE RIGHT: each one is mirrored to the other side of the sheet by
     column(), and its own label and figure are then mirrored again inside it.
     A helper, because getting the two mirrorings out of step is the easy way to
     land a label on one side of the page and its number on the other. */
  const statAt = (label, value, x, w, size, colour) => {
    const k = column(x, w);
    stat(doc, label, value, k.x, 142, size, colour, [k.x, k.x + k.w]);
  };
  statAt(S('offer.area', null, 'Area'), area(unit.area), M, 60, 15, PAPER);
  statAt(S('offer.yourPrice', null, 'Your price'), money(unit.price), M + 62, 104, 15, GOLD);
  statAt(S('offer.plan', null, 'Payment plan'), D('plan', summary.planLabel), M + 168, 62, 15, PAPER);
  statAt(S('offer.prepared', null, 'Prepared'), today, M + 232, PW - M - M - 232, 15, PAPER);

  /* ---------- 8. your building ---------- */
  const master = A.masterplan;
  if (master) {
    newPage(S('page.building', null, 'Your building'), bName);
    const iy = 26, ih = 148;
    /* Contain, not cover. This is the page that answers "where is my unit?",
       so the masterplan has to be whole — a cover fit crops the top of the
       render, which is exactly where Building Q sits, and clipped the highlight
       half away. The letterboxed sides sit on navy so it reads as deliberate. */
    setFill(doc, NAVY); doc.rect(M, iy, PW - 2 * M, ih, 'F');
    const r = containRect(master, M, iy, PW - 2 * M, ih);
    doc.addImage(master.data, master.format, r.x, r.y, r.w, r.h, undefined, 'FAST');

    /* MASSING points are fractions of the image WIDTH (that is also the SVG
       viewBox the app uses), so both axes scale by r.w. Clipped to the same box
       as the render, because a cover fit puts part of the image — and so part
       of the polygon — outside it. */
    const poly = (MASSING.buildings || {})[bId];
    if (poly) {
      /* Spotlight, not a tint. A translucent gold wash over the building was
         almost invisible against a night render that is already warm and lit.
         So: dim the WHOLE render, then paint the customer's building back in at
         full brightness through a clip of its own outline. The eye goes
         straight to the one bright object on the page. */
      doc.saveGraphicsState();
      clipTo(doc, M, iy, PW - 2 * M, ih);
      setFill(doc, [4, 12, 22]);
      doc.setGState(new doc.GState({ opacity: 0.66 }));
      doc.rect(M, iy, PW - 2 * M, ih, 'F');
      doc.setGState(new doc.GState({ opacity: 1 }));
      doc.restoreGraphicsState();

      doc.saveGraphicsState();
      clipPolygon(doc, poly, r);
      doc.addImage(master.data, master.format, r.x, r.y, r.w, r.h, undefined, 'FAST');
      doc.restoreGraphicsState();

      doc.saveGraphicsState();
      clipTo(doc, M, iy, PW - 2 * M, ih);
      setDraw(doc, GOLD);
      doc.setLineWidth(1.6);
      doc.setGState(new doc.GState({ opacity: 0.45 }));
      drawPolygon(doc, poly, r, 'S');          // soft halo under the crisp edge
      doc.setGState(new doc.GState({ opacity: 1 }));
      doc.setLineWidth(0.8);
      drawPolygon(doc, poly, r, 'S');
      doc.restoreGraphicsState();
    }

    doc.setFont(SANS, 'normal').setFontSize(7.6);
    setText(doc, MUTED);
    tStart(doc, poly
      ? S('bld.highlighted', { building: bName, code: unit.code, floor: floorName },
          `${bName} is highlighted. Your unit ${unit.code} is on the ${unit.floorName || unit.floorCode}.`)
      : S('bld.plain', { building: bName, code: unit.code, floor: floorName },
          `${bName}. Your unit ${unit.code} is on the ${unit.floorName || unit.floorCode}.`),
      M, 182);
  }

  /* ---------- 9. your floor ---------- */
  if (planDef && planDef.image) {
    const planImg = A.floor;
    if (planImg) {
      newPage(S('page.floor', null, 'Your floor'),
              D('floor', planDef.label || unit.floorName || unit.floorCode));
      const iy = 26, ih = 148, iw = PW - 2 * M;

      /* Zoom to the customer's own building where the pins allow it, and show
         the whole sheet where they do not. Either way the placed image is
         described by the same rect, so the pin maths below is shared. */
      const crop = buildingCrop(planDef, bId, planImg);
      let rect;
      if (crop) {
        const scale = Math.min(iw / crop.cw, ih / crop.ch);
        rect = { w: planImg.width * scale, h: planImg.height * scale };
        rect.x = M + iw / 2 - crop.cx * scale;
        rect.y = iy + ih / 2 - crop.cy * scale;
      } else {
        rect = containRect(planImg, M, iy, iw, ih);
      }

      doc.saveGraphicsState();
      clipTo(doc, M, iy, iw, ih);
      doc.addImage(planImg.data, planImg.format, rect.x, rect.y, rect.w, rect.h, undefined, 'FAST');

      /* Mask everything outside the crop box.
       *
       * Containing the crop is not the same as isolating it: the frame is wider
       * than Q is, so the neighbouring building stayed in shot, half cut off,
       * looking like a mistake rather than context. These four rectangles trim
       * it back to the customer's own building. Painting white over a drawing
       * that is itself on white paper is invisible — but note the order, which
       * is the trap this file has been bitten by before: masks go down straight
       * after the image and BEFORE the pin, never over finished artwork. */
      if (crop) {
        const scale = rect.w / planImg.width;
        const bx = rect.x + (crop.cx - crop.cw / 2) * scale;
        const by = rect.y + (crop.cy - crop.ch / 2) * scale;
        const bw = crop.cw * scale, bh = crop.ch * scale;
        /* Overscanned by a millimetre on every outer edge. Sized exactly to the
           frame they left a hairline of drawing along it, because the mask and
           the clip round to device pixels independently; the clip discards the
           overspill anyway. */
        const O = 1;
        setFill(doc, PAPER);
        doc.rect(M - O, iy - O, Math.max(0, bx - M + O), ih + 2 * O, 'F');
        doc.rect(bx + bw, iy - O, Math.max(0, M + iw - bx - bw + O), ih + 2 * O, 'F');
        doc.rect(M - O, iy - O, iw + 2 * O, Math.max(0, by - iy + O), 'F');
        doc.rect(M - O, by + bh, iw + 2 * O, Math.max(0, iy + ih - by - bh + O), 'F');
      }

      const pin = planDef.pins && planDef.pins[unit.code];
      if (pin) {
        /* Pin x/y are fractions of the drawing's width and HEIGHT. */
        const px = rect.x + pin[0] * rect.w;
        const py = rect.y + pin[1] * rect.h;
        setDraw(doc, GOLD); doc.setLineWidth(0.5);
        doc.setGState(new doc.GState({ opacity: 0.55 }));
        doc.circle(px, py, 6, 'S');
        doc.setGState(new doc.GState({ opacity: 1 }));
        setFill(doc, [214, 64, 52]);
        doc.circle(px, py, 2.1, 'F');
        setFill(doc, PAPER);
        doc.circle(px, py, 0.7, 'F');

        /* Flip the label to the other side of the pin near the right edge —
           the drawing is clipped to the frame and the code would be cut off. */
        doc.setFont(SANS, 'bold').setFontSize(7.6);
        setText(doc, INK);
        const flip = px + 8 + doc.getTextWidth(unit.code) > M + iw - 2;
        doc.text(unit.code, flip ? px - 8 : px + 8, py + 1, flip ? { align: 'right' } : undefined);
      }
      doc.restoreGraphicsState();

      doc.setFont(SANS, 'normal').setFontSize(7.6);
      setText(doc, MUTED);
      const planLabel = D('floor', planDef.label);
      tStart(doc, pin
        ? S('floor.pinned', { prefix: crop ? `${bName}، ` : '', plan: planLabel, code: unit.code },
            `${crop ? `${bName}, ` : ''}${planDef.label}. Unit ${unit.code} is marked on the drawing.`)
        : S('floor.unpinned', { plan: planLabel, code: unit.code },
            `Drawing of the ${planDef.label}. The exact position of ${unit.code} is confirmed on the stamped layout.`),
        M, 182);
    }
  }

  /* ---------- 10. your unit ---------- */
  newPage(S('page.unit', null, 'Your unit'), unit.code);
  let y = sectionTitle(doc, S('unit.title', { code: unit.code }, `Unit ${unit.code}`), 36);

  /* Five stats in a row, mirrored as a block the same way the title page's are. */
  const unitStat = (label, value, x) => {
    const k = column(x, 50);
    stat(doc, label, value, k.x, y + 8, 13, INK, [k.x, k.x + k.w]);
  };
  unitStat(S('unit.building', null, 'Building'), bName, M);
  unitStat(S('unit.floor', null, 'Floor'), floorName, M + 52);
  unitStat(S('unit.type', null, 'Type'), D('type', unit.type) || '—', M + 104);
  /* Gross area only — the client instructed 2026-08-12 that the sheet's net
     figure is never shown or printed. */
  unitStat(S('unit.area', null, 'Area'), area(unit.area), M + 156);
  if (unit.outdoor) unitStat(S('unit.outdoor', null, 'Outdoor'), area(unit.outdoor), M + 208);

  let py2 = y + 34;
  setDraw(doc, LINE); doc.setLineWidth(0.2);
  doc.line(M, py2, PW - M, py2);
  py2 += 22;

  /* The price, as the one object on the page with any weight to it.
     The PANEL keeps its position — layout stays — but the gold spine down its
     edge marks where the text begins, so that moves with the text. */
  const priceK = column(M + 150, PW - M - (M + 150));
  const panelX = priceK.x, panelW = priceK.w, panelH = 46;
  setFill(doc, NAVY);
  doc.roundedRect(panelX, py2 - 14, panelW, panelH, 2, 2, 'F');
  setFill(doc, GOLD);
  doc.rect(RTL ? panelX + panelW - 1.4 : panelX, py2 - 14, 1.4, panelH, 'F');
  caps(doc, unit.discount ? S('unit.yourPrice', null, 'Your price') : S('unit.price', null, 'Price'),
       panelX + 10, py2, { size: 7, colour: GOLD, track: 0.9, x0: panelX, x1: panelX + panelW - 10 });
  doc.setFont(SANS, 'bold').setFontSize(23);
  setText(doc, PAPER);
  tStart(doc, money(unit.price), panelX + 10, py2 + 15, panelX, panelX + panelW - 10);

  if (unit.discount) {
    const listK = column(M, 70), discK = column(M + 72, 70);
    stat(doc, S('unit.listPrice', null, 'List price'), money(unit.total),
         listK.x, py2, 14, INK, [listK.x, listK.x + listK.w]);
    stat(doc, S('unit.discount', { pct: pctLabel(unit.discount) }, `Discount ${pctLabel(unit.discount)}`),
         `- ${money(unit.total - unit.price)}`, discK.x, py2, 14, INK, [discK.x, discK.x + discK.w]);

    py2 += 52;
    setFill(doc, [250, 246, 238]);
    doc.roundedRect(M, py2 - 8, PW - 2 * M, 24, 2, 2, 'F');
    setFill(doc, GOLD);
    doc.rect(RTL ? PW - M - 1.4 : M, py2 - 8, 1.4, 24, 'F');
    doc.setFont(SANS, 'bold').setFontSize(13);
    setText(doc, [140, 100, 30]);
    tStart(doc, S('unit.save', { amount: money(unit.total - unit.price) },
                  `You save ${money(unit.total - unit.price)}`), M + 8, py2 + 2, M + 8, PW - M - 8);
    doc.setFont(SANS, 'normal').setFontSize(7.8);
    setText(doc, MUTED);
    tStart(doc, S('unit.saveNote', { pct: pctLabel(unit.discount) },
                  `${pctLabel(unit.discount)} off the list price. The payment plan overleaf is calculated on your price.`),
           M + 8, py2 + 9, M + 8, PW - M - 8);
  }

  /* ---------- 11. payment plan ---------- */
  const planLabelTr = D('plan', summary.planLabel);
  newPage(S('page.payment', null, 'Payment plan'),
          S('pay.sub', { code: unit.code, label: planLabelTr },
            `Unit ${unit.code} · ${summary.planLabel}`));
  y = sectionTitle(doc, S('pay.title', { label: planLabelTr }, `${summary.planLabel} plan`), 31);

  /* The unit's own figures repeated here, so the schedule page can be read —
     or forwarded — without turning back. Kept to one line: the row height
     below is solved against the space left, and every millimetre spent here
     comes straight out of the table. */
  doc.setFont(SANS, 'normal').setFontSize(7.6);
  setText(doc, MUTED);
  const outdoorBit = unit.outdoor
    ? S('pay.outdoor', { n: area(unit.outdoor) }, ` + ${unit.outdoor} m² outdoor`) : '';
  tStart(doc, S('pay.line', { where, area: area(unit.area), outdoor: outdoorBit, price: money(unit.price) },
                `${where}  ·  ${unit.area} m²${outdoorBit}  ·  Price ${money(unit.price)}`),
         M, y - 1);

  const statY = y + 8;
  const payStat = (label, value, x, w) => {
    const k = column(x, w);
    stat(doc, label, value, k.x, statY, 11, INK, [k.x, k.x + k.w]);
  };
  payStat(S('pay.down', null, 'Down payment'), money(summary.downPayment), M, 50);
  payStat(S('pay.quarterly', null, 'Quarterly'), money(summary.instalmentAmount), M + 52, 50);
  payStat(S('pay.instalments', null, 'Instalments'), String(summary.instalmentCount), M + 104, 34);
  payStat(S('pay.maintenance', { pct: pctLabel(CONFIG.maintenanceRate) },
            `Maintenance ${pctLabel(CONFIG.maintenanceRate)}`), money(summary.maintenance), M + 140, 58);
  payStat(S('pay.total', null, 'Total payable'), money(summary.totalPayable), M + 200, 50);
  payStat(S('pay.delivery', null, 'Delivery'), summary.deliveryDate.toLocaleDateString('en-GB',
          { month: 'short', year: 'numeric' }), M + 252, PW - M - M - 252);

  /* One full-width table with the same shape as the schedule on screen —
     Due / Payment / Date / Amount / % of price, a band per year, milestone rows
     picked out. */
  const blocks = scheduleByYear(rows, summary.price);
  const TOP = statY + 14, BOTTOM = PH - 22;
  const HEAD_H = 6.5, BAND_H = 4.8, BAND_EXTRA = 0.4;
  const MAX_ROW = 5.6, MIN_ROW = 4.1;

  /* The whole schedule has to land on ONE page — a customer comparing years
     should not be turning back and forth.

     So the row height is SOLVED for the space available rather than picked and
     hoped for. Guessing it is what broke the first attempt: the estimate left
     out the column header and the padding under each year band, and the second
     column ran off the bottom of the page. Here the only inputs are the rows
     and bands this particular plan actually has, so a 4-year plan gets generous
     rows and a 10-year one is tightened just enough to fit. */
  /* NO BAND ROWS ANY MORE — the year is a column, so a ten-year plan spends
     ten fewer rows on headings and every remaining row gets taller for it. */
  const nRows = rows.length;
  const perColH = BOTTOM - TOP - HEAD_H;
  const rowHeightFor = (cols) => (cols * perColH) / nRows;

  let twoCol = false;
  let ROW_H = rowHeightFor(1);
  if (ROW_H < MIN_ROW) { twoCol = true; ROW_H = rowHeightFor(2); }
  ROW_H = Math.min(MAX_ROW, ROW_H);

  const GAP = 9;
  const colW = twoCol ? (PW - 2 * M - GAP) / 2 : PW - 2 * M;
  /* THE FIRST COLUMN IS THE ONE THE READER MEETS FIRST, which in Arabic is the
     one on the right. Without this the schedule started on the left with the
     down payment and continued on the right with year 6 — the two halves in the
     wrong order, which on a payment schedule is not a cosmetic problem. */
  const colX = (c) => M + (RTL && twoCol ? 1 - c : c) * (colW + GAP);

  /* Every row now costs the same, so the split is simply half the rows. */
  const contentH = nRows * ROW_H;
  const splitAt = Math.min(TOP + HEAD_H + contentH / 2, BOTTOM);

  /* Column positions are fractions of the column, so the same code lays out the
     full-width single column and the narrow paired ones.
     `cx` mirrors an anchor inside THIS table column, which is what reverses the
     six fields: Year ends up on the right and Yearly % on the left, and the row
     still reads Year, Instalment, Date, Amount, %, Yearly % in the direction the
     page is read. */
  const cx = (c, x) => ax(x, colX(c), colX(c) + colW);
  const cYear = (c) => cx(c, colX(c) + 1.5);
  const cPay  = (c) => cx(c, colX(c) + colW * 0.14);
  const cDate = (c) => cx(c, colX(c) + colW * 0.37);
  const cAmt  = (c) => cx(c, colX(c) + colW * 0.64);
  const cPct  = (c) => cx(c, colX(c) + colW * 0.80);
  const cYrPct = (c) => cx(c, colX(c) + colW - 1.5);

  /* "Instalment 12 of 32 (includes 10% milestone)" does not fit a half-width
     column; the same fact in a third of the space. In Arabic the label already
     comes from the structured key rather than the English sentence, so only the
     English needs shortening — but the milestone still has to be compressed, and
     tRowLabel gives it back in full. */
  const shortLabel = (r) => {
    if (!RTL) {
      return latin(r.label)
        .replace(/Instalment (\d+) of \d+/, 'Inst. $1')
        .replace(/\s*\(includes (\d+)% milestone\)/, ' +$1%');
    }
    /* The Arabic is built from the row's structured key rather than by
       rewriting the English sentence — engine.js attaches one to every row for
       exactly this. See the note beside labelKey in engine.js. */
    const k = r.labelKey;
    if (!k) return r.label;
    if (k.kind === 'down') return pt('pay.down');
    if (k.kind === 'maintenance') return pt('pay.maintenance', { pct: k.pct });
    return k.milestone
      ? pt('tbl.instMilestone', { i: k.i, n: k.n, pct: k.milestone })
      : pt('tbl.inst', { i: k.i, n: k.n });
  };

  /* A SOLID NAVY HEADER BAR, matching the layout the client sent (theirs is
     black; navy is the same device in this document's palette) and matching the
     total bar at the foot, so the schedule is visibly bracketed. */
  const tableHead = (c, yy) => {
    setFill(doc, NAVY);
    doc.rect(colX(c), yy - 4.2, colW, 6.4, 'F');
    /* No tracking on these: three of the six are right-aligned, and jsPDF does
       not count character spacing when it measures a run for alignment. */
    doc.setFont(SANS, 'bold').setFontSize(5.8);
    setText(doc, PAPER);
    const head = (key, en, at, ends) => {
      const s = RTL ? pt(key) : en;
      doc.text(TX(s), at, yy, ends ? endAlign() : startAlign());
    };
    head('tbl.year', 'YEAR', cYear(c), false);
    head('tbl.payment', 'INSTALLMENT', cPay(c), false);
    head('tbl.date', 'DATE', cDate(c), false);
    head('tbl.amount', 'AMOUNT (EGP)', cAmt(c), true);
    head('tbl.pct', '%', cPct(c), true);
    head('tbl.yearly', 'YEARLY %', cYrPct(c), true);
    return yy + 6.5;
  };

  let col = 0;
  let ty = tableHead(0, TOP);

  /* Move to the next column when this one is full. Only ever called with
     col 0 -> 1; the height maths guarantees two columns are enough for every
     plan the client offers, and the guard below catches it if that ever stops
     being true. */
  const nextColumn = () => { col += 1; ty = tableHead(col, TOP); };

  /* ONE ROW PER PAYMENT, and the year rides on the row it starts.
   *
   * `opensYear` carries the year label and that year's share of the price, and
   * is the row set in bold on a tinted band — it does the work the full-width
   * heading row used to do, in a column, for no extra height.
   *
   * `carried` re-states the year at the top of the second column when a year
   * straddles the split. Without it the right-hand column opens on a bare
   * instalment and the reader has to trace back across the page to find which
   * year they are in. It repeats the label only: the yearly percentage stays
   * where the year actually opened, so it is never stated twice. */
  const GOLD_DARK = [147, 110, 44];
  let carriedYear = false;
  for (const block of blocks) {
    block.rows.forEach((r, i) => {
      if (twoCol && col === 0 && ty > splitAt) { nextColumn(); carriedYear = true; }
      const opensYear = i === 0;
      const showYear = opensYear || carriedYear;
      carriedYear = false;

      const isDown = block.year === 0;
      if (isDown) {                       // the row the customer looks for first
        setFill(doc, [251, 241, 224]);
        doc.rect(colX(col), ty - 3.4, colW, ROW_H, 'F');
      } else if (opensYear) {
        setFill(doc, [250, 245, 236]);
        doc.rect(colX(col), ty - 3.4, colW, ROW_H, 'F');
      } else if (r.milestone) {
        setFill(doc, [253, 250, 244]);
        doc.rect(colX(col), ty - 3.4, colW, ROW_H, 'F');
      }

      const heavy = isDown || opensYear || r.milestone;
      doc.setFont(SANS, heavy ? 'bold' : 'normal').setFontSize(6.2);

      setText(doc, GOLD_DARK);
      doc.text(TX(showYear ? (isDown ? S('tbl.dp', null, 'DP')
                                     : (RTL ? pBand(block.year) : String(block.label)))
                           : ''),
               cYear(col), ty, startAlign());

      setText(doc, heavy ? INK : MUTED);
      doc.text(TX(shortLabel(r)), cPay(col), ty, startAlign());
      /* Dates and figures are never translated and never reordered — they are
         the numbers the customer checks against the contract. They still move
         to the mirrored column, but they read left to right inside it. */
      doc.text(fmtDate(r.date), cDate(col), ty, startAlign());
      setText(doc, INK);
      doc.text(fmt(r.amount), cAmt(col), ty, endAlign());
      setText(doc, heavy ? INK : MUTED);
      doc.text(fmtPct(r.pct), cPct(col), ty, endAlign());
      setText(doc, GOLD_DARK);
      doc.text(opensYear ? fmtPct(block.pct) : '', cYrPct(col), ty, endAlign());

      setDraw(doc, LINE); doc.setLineWidth(0.12);
      doc.line(colX(col), ty + 1.3, colX(col) + colW, ty + 1.3);
      ty += ROW_H;
    });
  }

  /* Total spans the full width under both columns, so it reads as the end of
     the whole schedule rather than the end of the right-hand one. */
  setFill(doc, NAVY);
  doc.rect(M, BOTTOM + 1, PW - 2 * M, 8, 'F');
  setFill(doc, GOLD);
  doc.rect(RTL ? PW - M - 1.4 : M, BOTTOM + 1, 1.4, 8, 'F');
  doc.setFont(SANS, 'bold').setFontSize(8.2);
  setText(doc, PAPER);
  tStart(doc, S('pay.total', null, 'Total payable'), M + 5, BOTTOM + 6.4, M + 5, PW - M - 3);
  tEnd(doc, money(summary.totalPayable), PW - M - 3, BOTTOM + 6.4, M + 5, PW - M - 3);

  /* THE PAYMENT PLAN IS THE LAST PAGE, on the user's instruction 2026-08-15.
     A terms page used to follow it, carrying the ASSUMPTIONS list, a generated-on
     disclaimer and a closing credits card with two live links. It is gone.

     What was on it and where it went:
       · "Indicative offer — subject to availability at the time of contract."
         is in the footer of EVERY page, so the disclaimer itself survives.
       · The ASSUMPTIONS list is still on screen in the app, in both languages.
       · The two links did NOT survive — in particular "View this offer online",
         which deep-linked back to the app so a customer sitting on the offer for
         a week reopened it at today's price rather than a stale sheet of paper.
         That is a real loss; offerShareText() still carries the link in the
         WhatsApp message, which is the only place it now appears. */

  /* __arabicParser__ hangs off the shared jsPDF.API, so put it back before the
     next export — an English offer has no use for a disarmed Arabic parser, but
     leaving a global monkey-patched past the call that needed it is how the next
     bug gets written. */
  if (rearmJsPdfArabic) rearmJsPdfArabic();

  return {
    doc,
    filename: offerFilename(unit, planDef || { label: unit.floorName }),
    fellBackToEnglish,
  };
}

/**
 * The message that travels with the offer.
 *
 * WhatsApp's URL scheme can carry TEXT only — there is no way to attach a file
 * to a wa.me link, and no amount of URL wrangling changes that. So on desktop
 * the PDF is downloaded and this text is prefilled for the agent to send with
 * it; on a phone the share sheet carries the actual file and this is not used.
 * Either way the customer gets the headline numbers in the chat itself, where
 * they are readable without opening an attachment.
 */
function offerShareText(unit, plan, contractDate = new Date()) {
  const { summary } = buildSchedule(unit, plan, contractDate);
  const money = (n) => `${fmt(n)} ${CONFIG.currency}`;
  const out = [
    `*${CONFIG.name}* - ${CONFIG.location}`,
    `Unit ${unit.code} | ${unit.type || ''} | ${unit.floorName || unit.floorCode}`,
    `Area ${unit.area} m2${unit.outdoor ? ` + ${unit.outdoor} m2 outdoor` : ''}`,
    '',
  ];
  if (unit.discount) {
    out.push(`List price ${money(unit.total)}`);
    out.push(`Discount ${pctLabel(unit.discount)} - you save ${money(unit.total - unit.price)}`);
  }
  out.push(`*Price ${money(unit.price)}*`, '');
  out.push(`${summary.planLabel} plan`);
  out.push(`Down payment ${money(summary.downPayment)}`);
  out.push(`${summary.instalmentCount} quarterly instalments of ${money(summary.instalmentAmount)}`);
  out.push(`Maintenance ${pctLabel(CONFIG.maintenanceRate)} - ${money(summary.maintenance)}`);
  out.push(`Delivery ${fmtDate(summary.deliveryDate)}`);
  if (CONFIG.mapsUrl) out.push('', `Location: ${CONFIG.mapsUrl}`);
  if (CONFIG.shareBaseUrl) {
    out.push('', `${CONFIG.shareBaseUrl}#${unit.code}/${plan.id}`);
  }
  return out.join('\n');
}

/** wa.me link with the offer summary prefilled. */
function whatsappUrl(unit, plan, contractDate = new Date()) {
  return 'https://wa.me/?text=' + encodeURIComponent(offerShareText(unit, plan, contractDate));
}

/**
 * Build and hand over the offer.
 *
 * Shares the file where the browser supports it — on a phone that puts the PDF
 * straight into WhatsApp, which is how these actually reach a customer — and
 * downloads it otherwise.
 *
 * @returns {Promise<'shared'|'downloaded'>}
 */
async function deliverOffer(unit, plan, floor, contractDate = new Date()) {
  const { doc, filename, fellBackToEnglish } = await buildOfferPDF(unit, plan, floor, contractDate);
  const file = new File([doc.output('blob')], filename, { type: 'application/pdf' });

  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file] });
      return { how: 'shared', fellBackToEnglish };
    } catch (err) {
      // The agent closing the sheet is a decision, not a failure — don't then
      // download a file they just declined to send.
      if (err && err.name === 'AbortError') return { how: 'shared', fellBackToEnglish };
      console.warn('share failed, downloading instead:', err && err.message);
    }
  }
  doc.save(filename);
  return { how: 'downloaded', fellBackToEnglish };
}

/**
 * Whether this browser can put a PDF into the system share sheet.
 *
 * `navigator.canShare({files})` is NOT sufficient on its own, and trusting it
 * alone is what stranded the offer button on "Preparing…" forever. Chrome on
 * desktop Windows answers TRUE, then `navigator.share()` opens an OS flyout
 * that, on a machine where that flyout does not come up, **never settles** —
 * it neither resolves nor rejects. `await` on it hangs, so the `finally` that
 * re-enables the button never runs and the agent is left with a dead control
 * and no error. Measured 2026-08-16: buildOfferPDF finished in 4.1 s, share was
 * called 75 ms later, and nothing happened after that.
 *
 * So ask the question that was actually meant — *is this a handheld?* — because
 * the desktop branch is the one that works there: download the file and open
 * WhatsApp Web beside it. `maxTouchPoints` cannot answer it (a touchscreen
 * laptop reports 10) and neither can the primary pointer alone. `userAgentData`
 * is definitive where it exists, and `(pointer: coarse)` covers the iPhone and
 * iPad, which have no `userAgentData`.
 */
function isHandheld() {
  try {
    if (typeof navigator === 'undefined') return false;
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function canShareFiles() {
  try {
    return isHandheld()
      && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([new Blob()], 'probe.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}
