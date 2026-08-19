/* Service worker: makes the app open without a connection, and makes the
 * browser treat it as installable rather than as a bookmark.
 *
 * THE ONE RULE THAT MATTERS: this must never cache the inventory.
 *
 * The whole point of the app is that a unit sold in the Google Sheet stops
 * being offerable immediately. A service worker that served a cached sheet
 * would break that silently and an agent would sell a sold clinic. So anything
 * not on our own origin is passed straight through and never touched — the
 * sheet lives on docs.google.com, so it can never be served from here.
 *
 * Bump CACHE when the app shell changes, or returning phones keep the old one.
 */
const CACHE = 'qomor-offers-v27';

/* Code is revalidated; artwork is not.
 *
 * See the fetch handler. This split exists because cache-first on the app's own
 * JavaScript is a trap: the cached copy is only ever replaced when THIS FILE
 * changes, so a deploy that touches js/ and not sw.js leaves every returning
 * phone running the old code forever, and the two halves of the app can drift
 * out of step with each other. That was reproduced on 2026-08-14 — a browser
 * held a stale js/pdf.js across three reloads and a cache wipe. */
const CODE = /\.(js|css|html|webmanifest)$/i;

/* The shell: enough to boot and render, kept small so the first visit on mobile
 * data is quick. The heavy print assets — the renders and the floor drawings,
 * about 5 MB of them — are deliberately NOT here. They are cached on first use
 * instead, see below, so opening the app on mobile data does not pull the whole
 * PDF artwork set before anything appears. */
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/i18n.js',
  'js/arabic.js',
  'js/pdf-ar.js',
  'js/config.js',
  'js/plan.js',
  'js/sheet.js',
  'js/engine.js',
  'js/telemetry.js',
  'js/pdf.js',
  'js/app.js',
  /* jsPDF is NOT precached, and neither are the embedded fonts. At 410 KB,
   * 291 KB and — for Arabic — a further 376 KB they competed for bandwidth with
   * the very first paint on a phone, which is the moment that matters most; all
   * are fetched and cached on first use instead, and app.js warms them when
   * idle. js/arabic.js and js/pdf-ar.js above ARE precached: together they are
   * a few KB, and they are needed to draw a single Arabic label. */
  'site.webmanifest',
  'assets/logo.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* Individually, not addAll: one 404 in the list would otherwise abort the
     * whole install and leave the app with no offline support at all.
     *
     * And NOT `new Request(url, { cache: 'reload' })`, which is the obvious
     * thing and was here until 2026-08-14. It forces a fresh network request
     * for every file — but the browser has just downloaded index.html, the CSS
     * and all five scripts to render the page, so the install pulled the entire
     * shell down a SECOND time, competing with the 395 KB hero preload and the
     * inventory fetch on exactly the first visit, on exactly the worst
     * connection. The user's phone sat on "Loading inventory…" for ~40 s.
     *
     * The plain form reuses what the browser already has. Serving a slightly
     * stale shell costs nothing now that code is stale-while-revalidate below:
     * it corrects itself on the next load either way. */
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Off-origin: the Google Sheet, and nothing else. Never intercepted, so the
  // inventory is always live and always the browser's own request.
  if (url.origin !== self.location.origin) return;

  /* THE INTERNAL TOOLS ARE NEVER CACHED, at all, in either direction.
   *
   * pin-tool.html writes coordinates that are pasted into the source. If it
   * boots against a stale js/plan.js it shows a stale floor list and stale
   * drawings, and pins placed on the wrong drawing are worse than no pins —
   * they look right and point at nothing. That happened on 2026-08-17: the
   * tool opened without the ground floor and showing the CAD sheets replaced
   * on 2026-08-16, because the shared js/*.js came back from a cache written
   * several deploys earlier.
   *
   * Offline support is worthless here anyway — the tool cannot do anything
   * without the live inventory. So the tool and the modules it pulls (marked
   * with ?tool) go straight to the network, and are never written to the
   * cache where they could shadow the app's own copies. */
  if (url.pathname.endsWith('/pin-tool.html') || url.searchParams.has('tool')) return;

  /* Navigations go network-first so a deployed update is picked up as soon as
   * there is a connection, falling back to the cached page when there isn't. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req))
          || (await caches.match('index.html'))
          || (await caches.match('./'))
          || Response.error();
      }
    })());
    return;
  }

  /* CODE — stale-while-revalidate. The cached copy is served immediately, so
   * startup stays as fast as cache-first, but a fresh copy is fetched in the
   * background and written over it, so the NEXT load is current. That is what
   * makes a deploy reach a returning phone without this file having to change.
   * The offline guarantee is unaffected: if the revalidation fails, the cached
   * copy has already been served. */
  if (CODE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const fetching = fetch(req).then((fresh) => {
        if (fresh.ok && fresh.type === 'basic') cache.put(req, fresh.clone());
        return fresh;
      });
      if (hit) {
        // Don't let the tab close out from under the revalidation.
        event.waitUntil(fetching.catch(() => {}));
        return hit;
      }
      try { return await fetching; } catch { return Response.error(); }
    })());
    return;
  }

  /* EVERYTHING ELSE — renders, floor plans, icons — cache-first. This artwork
   * is effectively immutable and big enough (about 5 MB) that re-fetching it
   * for every PDF would be wasteful on mobile data. A miss is fetched and kept,
   * which is how the print assets end up available offline after the first
   * offer has been generated. Replace a render and its filename changes, or
   * bump CACHE. */
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
