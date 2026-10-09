/*
 * Service worker dell'app Team Contato - V1.0.0 (build 1daaea0e)
 * Generato da strumenti/costruisci-app.cjs. Non modificare a mano: modificare sorgenti/shell/sw.template.js.
 *
 * Regole:
 *  - La pagina (HTML) si chiede SEMPRE alla rete (network-first, saltando la cache HTTP di GitHub Pages
 *    che dura 10 minuti). Se la rete manca o e' troppo lenta: pagina offline elegante.
 *  - Script, stili e immagini del guscio: cache con versione nel nome del file (aggiornamento automatico).
 *  - Dati dell'agenzia: MAI in cache. Le chiamate verso script.google.com e verso il cancello AI non passano da qui.
 *  - Push: mostra SEMPRE una notifica (obbligo di Apple). Accetta il formato semplice e quello dichiarativo (RFC 8030 + Apple 8030).
 *
 * CHANGELOG
 * V1.0.0 (09/10/2026) - prima versione.
 */
'use strict';
const VERSIONE = '1.0.0';
const BUILD = '1daaea0e';
const CACHE = 'tc-app-' + BUILD;
const PRECACHE = [
  "offline.html",
  "manifest.webmanifest",
  "assets/app.396baab81c.css",
  "assets/app.1dc5968c16.js",
  "icone/logo-chiaro.png",
  "icone/icon-96.png",
  "icone/icon-192.png",
  "icone/badge-96.png",
  "icone/apple-touch-icon.png"
];
const TIMEOUT_RETE_MS = 10000;
const ICONA = 'icone/icon-192.png';
const BADGE = 'icone/badge-96.png';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi.filter((n) => n.startsWith('tc-app-') && n !== CACHE).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.disable(); } catch (_) { /* non serve */ } }
    await self.clients.claim();
  })());
});

function conTimeout(promessa, ms) {
  return new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); promessa.then((r) => { clearTimeout(t); ok(r); }, (er) => { clearTimeout(t); no(er); }); });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // dati e login: mai da qui
  if (url.pathname.startsWith('/.well-known/')) return;            // assetlinks.json deve arrivare dalla rete, senza intermediari
  if (url.pathname === '/sw.js') return;

  // 1) pagine: rete prima
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await conTimeout(fetch(req, { cache: 'no-cache' }), TIMEOUT_RETE_MS);
        if (r && r.status >= 500) throw new Error('server');
        return r;
      } catch (_) {
        return (await caches.match('offline.html')) || new Response('Sei offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }
  // 2) configurazione e manifest: rete prima, cache di riserva
  if (url.pathname.endsWith('/config.json') || url.pathname.endsWith('/manifest.webmanifest')) {
    e.respondWith((async () => {
      try { const r = await fetch(req, { cache: 'no-cache' }); if (r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()); } return r; }
      catch (_) { return (await caches.match(req)) || Response.error(); }
    })());
    return;
  }
  // 3) file con la versione nel nome (assets/): cache prima
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
      return r;
    })());
    return;
  }
  // 4) icone e immagini senza versione: subito dalla cache e intanto si rinfrescano
  if (/\.(png|ico|svg|webp|jpg)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(req);
      const rete = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await rete) || Response.error();
    })());
  }
});

/* ---------- Notifiche push ---------- */
function leggiPayload(ev) {
  let d = null;
  if (ev.data) { try { d = ev.data.json(); } catch (_) { try { d = { notification: { title: 'Team Contato', body: ev.data.text() } }; } catch (__) { d = null; } } }
  return d || {};
}
function normalizza(d) {
  // formato dichiarativo: { web_push: 8030, notification: { title, body, navigate, tag, ... }, app_badge: N }
  // formato semplice:     { title, body, url, tag, badge: N }
  const n = d.notification || d;
  const url = n.navigate || n.url || d.url || '/';
  const badge = (typeof d.app_badge === 'number') ? d.app_badge : (typeof d.badge === 'number' ? d.badge : null);
  return {
    titolo: String(n.title || 'Team Contato').slice(0, 120),
    corpo: String(n.body || 'Hai una novità nell’Area Agenti.').slice(0, 400),
    tag: n.tag ? String(n.tag).slice(0, 120) : undefined,
    url: String(url).slice(0, 500),
    silenzioso: n.silent === true,
    badge,
  };
}
function urlSicuro(u) {
  try { const x = new URL(u, self.location.origin); return x.origin === self.location.origin ? x.href : self.location.origin + '/'; }
  catch (_) { return self.location.origin + '/'; }
}

self.addEventListener('push', (ev) => {
  const p = normalizza(leggiPayload(ev));
  ev.waitUntil((async () => {
    // nota: su iPhone ogni push DEVE mostrare una notifica, anche se la finestra e' aperta
    await self.registration.showNotification(p.titolo, {
      body: p.corpo, icon: ICONA, badge: BADGE, tag: p.tag, renotify: false, silent: p.silenzioso,
      lang: 'it', data: { url: urlSicuro(p.url) },
    });
    if (p.badge !== null && self.navigator && 'setAppBadge' in self.navigator) {
      try { if (p.badge > 0) await self.navigator.setAppBadge(p.badge); else await self.navigator.clearAppBadge(); } catch (_) { /* non supportato */ }
    }
  })());
});

async function portaInPrimoPiano(url) {
  const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of lista) {
    if (new URL(c.url).origin === self.location.origin) {
      try { await c.focus(); } catch (_) { /* ignora */ }
      c.postMessage({ tipo: 'vai', url });
      return 'finestra-esistente';
    }
  }
  if (self.clients.openWindow) { await self.clients.openWindow(url); return 'finestra-nuova'; }
  return 'niente';
}

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  ev.waitUntil(portaInPrimoPiano(urlSicuro((ev.notification.data && ev.notification.data.url) || '/')));
});

self.addEventListener('pushsubscriptionchange', (ev) => {
  // il browser ha cambiato iscrizione: la pagina, che ha la sessione, la rimanda al cancello
  ev.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    lista.forEach((c) => c.postMessage({ tipo: 'risincronizza' }));
  })());
});

self.addEventListener('message', (ev) => {
  if (ev.data && ev.data.tipo === 'skipWaiting') self.skipWaiting();
});
