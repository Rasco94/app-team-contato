/*
 * Service worker dell'app Team Contato - V1.2.0 (build fb21adc4)
 * Generato da strumenti/costruisci-app.cjs. Non modificare a mano: modificare sorgenti/shell/sw.template.js.
 *
 * Regole:
 *  - PAGINA (index.html, 400 KB circa): si chiede alla rete con scadenza breve (TIMEOUT_PAGINA_MS = 1,5 s).
 *    Se la rete risponde in tempo si usa quella. Se tarda (o manca) si serve SUBITO la copia in cache e la rete
 *    finisce in sottofondo: se la pagina e' cambiata si aggiorna la copia e si avvisano le finestre aperte
 *    ({tipo:'aggiornamento-pronto'} = pillola "Nuova versione pronta"). Senza copia (primo avvio): si aspetta
 *    la rete fino a 10 s, poi pagina offline. Si salta sempre la cache HTTP di GitHub Pages (10 minuti).
 *  - config.json e manifest: rete con scadenza 1,5 s, poi copia. Di proposito NON "copia prima": config.json porta
 *    l'indirizzo dello script (l'8/10 un indirizzo cambiato ha fermato tutto) e non va mai servito vecchio se la rete risponde.
 *  - Script, stili e immagini del guscio: cache con versione nel nome del file (aggiornamento automatico).
 *  - Cache versionata: tc-app-<build>; le vecchie si cancellano in 'activate'.
 *  - Dati dell'agenzia: MAI in cache. Le chiamate verso script.google.com e verso il cancello AI non passano da qui.
 *  - Push: mostra SEMPRE una notifica (obbligo di Apple), poi avvisa le finestre aperte con
 *    {tipo:'push', id, badge, ts} (nessun testo): la pagina aggiorna la campanella subito. Accetta il formato
 *    semplice e quello dichiarativo (RFC 8030 + Apple 8030).
 *
 * CHANGELOG
 * V1.0.0 (09/10/2026) - prima versione.
 * V1.1.0 (09/10/2026) - velocita' e tempo reale: pagina con scadenza 1,5 s e copia in cache (index.html nel precache),
 *   avviso 'aggiornamento-pronto' alle finestre quando la copia viene rinnovata, config/manifest con scadenza 1,5 s,
 *   push -> postMessage {tipo:'push'} a tutte le finestre, risposta a {tipo:'versione'} per le prove.
 */
'use strict';
const VERSIONE = '1.2.0';
const BUILD = 'fb21adc4';
const CACHE = 'tc-app-' + BUILD;
const PRECACHE = [
  "offline.html",
  "index.html",
  "manifest.webmanifest",
  "assets/app.f7685afec5.css",
  "assets/app.8e81ecd243.js",
  "icone/logo-chiaro.png",
  "icone/icon-96.png",
  "icone/icon-192.png",
  "icone/badge-96.png",
  "icone/apple-touch-icon.png"
];
const PAGINA = 'index.html';             // chiave unica della pagina in cache ('/', '/index.html', '/?avvio=app' sono lo stesso file)
const TIMEOUT_PAGINA_MS = 1500;          // oltre: si serve la copia (se c'e')
const TIMEOUT_CONFIG_MS = 1500;
const TIMEOUT_RETE_MS = 10000;           // senza copia: attesa massima prima della pagina offline
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

async function avvisaFinestre(msg) {
  const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  lista.forEach((c) => { try { c.postMessage(msg); } catch (_) { /* finestra chiusa */ } });
}

function chiavePagina() { return new Request(new URL(PAGINA, self.registration.scope).href); }

function ugualiByte(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/* Pagina: rete con scadenza, poi copia. Ritorna { risposta, lavoro }: 'lavoro' e' cio' che deve finire dopo la risposta. */
async function rispondiPagina(req) {
  const cache = await caches.open(CACHE);
  const chiave = chiavePagina();
  const haCopia = !!(await cache.match(chiave));
  let servitaDaCopia = false;
  const rete = fetch(req, { cache: 'no-cache' }).then((r) => {
    if (r.status >= 500) throw new Error('server');
    return r;
  });
  const lavoro = (async () => {                       // aggiorna la copia a risposta ottenuta e avvisa se e' cambiata
    let r; try { r = await rete; } catch (_) { return; }
    if (!r || !r.ok || r.redirected || r.type === 'opaqueredirect') return;
    const perCopia = r.clone(), perConfronto = r.clone();          // le copie si fanno SUBITO: la risposta originale va alla pagina
    const nuova = await perConfronto.arrayBuffer();
    const vecchiaR = await cache.match(chiave);
    const vecchia = vecchiaR ? await vecchiaR.arrayBuffer() : null;
    if (vecchia && ugualiByte(nuova, vecchia)) return;
    await cache.put(chiave, perCopia);                              // la risposta vera, non una ricostruita (intestazioni di compressione comprese)
    if (servitaDaCopia && vecchia) await avvisaFinestre({ tipo: 'aggiornamento-pronto' });
  })();
  const offline = async () => (await caches.match('offline.html')) || new Response('Sei offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  try {
    const r = await conTimeout(rete, haCopia ? TIMEOUT_PAGINA_MS : TIMEOUT_RETE_MS);
    return { risposta: r, lavoro };
  } catch (_) {
    const copia = await cache.match(chiave);
    if (copia) { servitaDaCopia = true; return { risposta: copia, lavoro }; }
    return { risposta: await offline(), lavoro };
  }
}

/* config.json e manifest: rete con scadenza, poi copia */
async function rispondiConfig(req) {
  const c = await caches.open(CACHE);
  const rete = fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
  const copia = await c.match(req);
  if (!copia) { try { return { risposta: await rete, lavoro: Promise.resolve() }; } catch (_) { return { risposta: Response.error(), lavoro: Promise.resolve() }; } }
  try {
    const r = await conTimeout(rete, TIMEOUT_CONFIG_MS);
    return { risposta: r.ok ? r : copia, lavoro: Promise.resolve() };
  } catch (_) { return { risposta: copia, lavoro: rete.catch(() => null) }; }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // dati e login: mai da qui
  if (url.pathname.startsWith('/.well-known/')) return;            // assetlinks.json deve arrivare dalla rete, senza intermediari
  if (url.pathname === '/sw.js') return;

  // 1) pagina dell'app: rete con scadenza, poi copia
  if (req.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    e.respondWith((async () => { const { risposta, lavoro } = await rispondiPagina(req); e.waitUntil(lavoro.catch(() => {})); return risposta; })());
    return;
  }
  // 1b) altre pagine (404, ecc.): rete, pagina offline se manca
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
  // 2) configurazione e manifest: rete con scadenza, copia di riserva
  if (url.pathname.endsWith('/config.json') || url.pathname.endsWith('/manifest.webmanifest')) {
    e.respondWith((async () => { const { risposta, lavoro } = await rispondiConfig(req); e.waitUntil(lavoro); return risposta; })());
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
    const mostra = self.registration.showNotification(p.titolo, {
      body: p.corpo, icon: ICONA, badge: BADGE, tag: p.tag, renotify: false, silent: p.silenzioso,
      lang: 'it', data: { url: urlSicuro(p.url) },
    });
    // V1.1.0: le finestre aperte lo sanno SUBITO (campanella): solo id, numero e ora, MAI il testo
    const avviso = avvisaFinestre({ tipo: 'push', id: p.tag || null, badge: p.badge, ts: Date.now() });
    await Promise.all([mostra.catch(() => {}), avviso.catch(() => {})]);
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
  ev.waitUntil(avvisaFinestre({ tipo: 'risincronizza' }));
});

self.addEventListener('message', (ev) => {
  const d = ev.data || {};
  if (d.tipo === 'skipWaiting') self.skipWaiting();
  else if (d.tipo === 'versione' && ev.source) { try { ev.source.postMessage({ tipo: 'versione', versione: VERSIONE, build: BUILD, cache: CACHE }); } catch (_) { /* ignora */ } }
});
