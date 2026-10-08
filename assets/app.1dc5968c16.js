/*
 * Guscio app Team Contato - logica - V1.0.1 (09/10/2026)
 *
 * Questo file NON contiene le funzioni dell'Area Agenti: quelle stanno nel Code Block
 * (incollato dentro index.html dal programma di costruzione). Qui c'e' solo cio' che serve a
 * un'app installata: service worker, installazione, notifiche push, badge, avvisi di rete,
 * schermata d'avvio e (spento di default) accesso con codice via email.
 * Nessun dato riservato e nessun segreto: la chiave VAPID e' pubblica.
 *
 * CHANGELOG
 * V1.0.0 (09/10/2026) - prima versione.
 * V1.0.1 (09/10/2026) - revisione: guida iPhone per iOS 26 (Condividi e' dentro il menu ...), passo 'Apri in Safari' solo se serve,
 *   niente ricarica automatica se c'e' una nota non salvata, badge uguale a push (campanella del telefono), uscita: il
 *   dispositivo si disiscrive anche a sessione scaduta, codice di accesso a 8 cifre, fascia offline sotto la barra,
 *   invito 'Installa' non doppio con la sezione 'App sul telefono', icone vere nelle guide Android e computer, /\D/g.
 */
(function () {
  'use strict';
  var APP = window.TC_APP || { versione: '0', build: '0' };
  var D = document, H = D.documentElement;

  /* ---------- configurazione (config.json, riletta a ogni avvio) ---------- */
  var CFG = {
    backend: { endpoint: '' },
    cancello: { url: '', percorsoPush: '/ai/push' },
    push: { attivo: false, chiavePubblica: '' },
    sessione: { chiaviLocalStorage: ['tcag_sessione_v4'], prefissoChiavi: 'tcag_sessione' },
    badge: { selettori: ['#tcag-b-notif2', '#tcag-b-notif', '[data-b=rq]'] },
    loginCodice: { abilitato: false, azioneRichiedi: 'codice-richiedi', azioneVerifica: 'codice-verifica' },
    rinnovoSessione: { abilitato: false, azione: 'dispositivo-rinnova', sogliaOre: 6 },
    android: { apkUrl: '' }
  };
  function unisci(a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] = unisci(a[k] || {}, b[k]); } else { a[k] = b[k]; } } return a; }

  /* ---------- ambiente ---------- */
  var UA = navigator.userAgent;
  var IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var ANDROID = /Android/.test(UA);
  var STANDALONE = H.classList.contains('tc-standalone');
  var IN_APP_BROWSER = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|LinkedInApp|Snapchat/.test(UA);
  var ALTRO_BROWSER_IOS = /CriOS|FxiOS|EdgiOS|OPiOS/.test(UA);
  var SUPPORTO_SW = 'serviceWorker' in navigator;
  var SUPPORTO_PUSH = SUPPORTO_SW && 'PushManager' in window && 'Notification' in window;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage bloccato */ }
    return null;
  }
  function el(tag, cls, html) { var e = D.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function q(s) { return D.querySelector(s); }
  function ritardo(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- sessione del portale (solo lettura) ---------- */
  function leggiSessione() {
    var chiavi = CFG.sessione.chiaviLocalStorage.slice(), migliore = null, i, k;
    try { for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (k && k.indexOf(CFG.sessione.prefissoChiavi) === 0 && chiavi.indexOf(k) < 0) chiavi.push(k); } } catch (e) { /* ignora */ }
    chiavi.forEach(function (c) {
      try {
        var s = JSON.parse(ls(c) || 'null');
        if (s && s.s && s.scade > Date.now() + 60000 && (!migliore || s.scade > migliore.scade)) { migliore = s; migliore.chiave = c; }
      } catch (e) { /* non e' la nostra */ }
    });
    return migliore;
  }

  /* ---------- avvisi ---------- */
  var toastEl, toastT;
  function toast(testo, ms) {
    if (!toastEl) { toastEl = el('div', 'tc-toast'); toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); D.body.appendChild(toastEl); }
    toastEl.textContent = testo; toastEl.classList.add('tc-su');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('tc-su'); }, ms || 3600);
  }

  /* ---------- schermata d'avvio ---------- */
  var avvioT0 = Date.now(), avvioChiuso = false;
  function chiudiAvvio() {
    if (avvioChiuso) return; avvioChiuso = true;
    var a = q('#tc-avvio'); if (!a) return;
    var attesa = Math.max(0, 600 - (Date.now() - avvioT0));
    setTimeout(function () { a.classList.add('tc-via'); setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 500); }, attesa);
  }
  function osservaAvvio() {
    var r = q('#tcag');
    function pronto() {
      var l = q('#tcag-login'), a = q('#tcag-app');
      return (l && !l.hidden) || (a && !a.hidden);
    }
    if (!r || pronto()) { chiudiAvvio(); return; }
    var o = new MutationObserver(function () { if (pronto()) { o.disconnect(); chiudiAvvio(); } });
    o.observe(r, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    setTimeout(chiudiAvvio, 9000); // mai bloccare chi apre l'app
  }

  /* ---------- barra "sei offline" ---------- */
  function osservaRete() {
    var f = el('div', 'tc-fascia', 'Sei offline: i dati si aggiornano appena torna la rete'); f.setAttribute('role', 'status'); D.body.appendChild(f);
    function agg() { f.classList.toggle('tc-su', !navigator.onLine); }
    window.addEventListener('online', agg); window.addEventListener('offline', agg); agg();
  }

  /* ---------- service worker e aggiornamenti ---------- */
  var regSW = null, aggiornamentoPronto = false, nascostoDal = 0, pillola;
  function mostraPillola() {
    if (pillola) return;
    pillola = el('button', 'tc-pillola', 'Nuova versione pronta · tocca per aggiornare'); pillola.type = 'button';
    pillola.addEventListener('click', function () { location.reload(); });   // gesto esplicito dell'utente: si ricarica sempre
    D.body.appendChild(pillola); setTimeout(function () { pillola.classList.add('tc-su'); }, 30);
  }
  function registraSW() {
    if (!SUPPORTO_SW) return Promise.resolve(null);
    return navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
      regSW = reg;
      reg.addEventListener('updatefound', function () {
        var n = reg.installing; if (!n) return;
        n.addEventListener('statechange', function () {
          if (n.state === 'installed' && navigator.serviceWorker.controller) { aggiornamentoPronto = true; mostraPillola(); }
        });
      });
      setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
      return reg;
    }).catch(function () { return null; });
  }
  /* Una nota scritta e non salvata, un campo compilato o una finestra aperta: non si ricarica mai la pagina sotto le mani di chi lavora. */
  function modificheInCorso() {
    var campi = D.querySelectorAll('#tcag textarea, #tcag input:not([type=hidden]):not([type=checkbox]):not([type=radio])'), i;
    for (i = 0; i < campi.length; i++) { if (campi[i].value !== campi[i].defaultValue) return true; }
    return !!D.querySelector('#tcag .modal-bg:not([hidden])');
  }
  D.addEventListener('visibilitychange', function () {
    if (D.hidden) { nascostoDal = Date.now(); return; }
    if (regSW) regSW.update().catch(function () {});
    // tornato dopo piu' di 5 minuti con un aggiornamento pronto: ricarica (la sessione resta, i dati si rileggono)
    // se c'e' del lavoro in corso resta solo la pillola "Nuova versione pronta": decide l'agente
    if (aggiornamentoPronto && nascostoDal && Date.now() - nascostoDal > 5 * 60 * 1000) { if (modificheInCorso()) mostraPillola(); else location.reload(); }
    aggiornaSchede(); aggiornaBadge();
  });
  if (SUPPORTO_SW) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.tipo === 'vai' && d.url) {
        try { var u = new URL(d.url, location.origin); if (u.origin === location.origin) { if (u.hash) location.hash = u.hash; else location.hash = 'oggi'; } } catch (x) { /* url non valido */ }
      } else if (d.tipo === 'risincronizza') { sincronizzaIscrizione(true); }
    });
  }

  /* ---------- installazione ---------- */
  var promptInstall = null, installazioneFatta = STANDALONE;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); promptInstall = e; aggiornaSchede(); });
  window.addEventListener('appinstalled', function () { installazioneFatta = true; promptInstall = null; ls('tc_inst_no', null); aggiornaSchede(); toast('App installata. La trovi tra le tue app.'); });

  var SVG_AGGIUNGI = '<svg viewBox="0 0 34 34" fill="none" stroke="#0a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="24" height="24" rx="6" fill="#eef1f8"/><path d="M17 11v12M11 17h12"/></svg>';
  var SVG_SAFARI = '<svg viewBox="0 0 34 34" fill="none" stroke="#0a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="17" r="12" fill="#eef1f8"/><path d="m21.5 12.5-3 6-6 3 3-6z" fill="#c9a961" stroke="#0a2a5e"/></svg>';
  var SVG_PUNTINI = '<svg viewBox="0 0 34 34" fill="none" stroke="#0a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="28" height="16" rx="8" fill="#eef1f8"/><circle cx="11" cy="17" r="1.6" fill="#c9a961" stroke="#0a2a5e" stroke-width="1.2"/><circle cx="17" cy="17" r="1.6" fill="#c9a961" stroke="#0a2a5e" stroke-width="1.2"/><circle cx="23" cy="17" r="1.6" fill="#c9a961" stroke="#0a2a5e" stroke-width="1.2"/></svg>';
  var SVG_PUNTINI_V = '<svg viewBox="0 0 34 34" fill="none" stroke="#0a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="16" height="28" rx="8" fill="#eef1f8"/><circle cx="17" cy="11" r="1.6" fill="#c9a961" stroke="#0a2a5e" stroke-width="1.2"/><circle cx="17" cy="17" r="1.6" fill="#c9a961" stroke="#0a2a5e" stroke-width="1.2"/><circle cx="17" cy="23" r="1.6" fill="#c9a961" stroke="#0a2a5e" stroke-width="1.2"/></svg>';
  var SVG_MONITOR = '<svg viewBox="0 0 34 34" fill="none" stroke="#0a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="28" height="18" rx="3" fill="#eef1f8"/><path d="M12 29h10M17 24v5"/></svg>';
  var SVG_MONITOR_FRECCIA = '<svg viewBox="0 0 34 34" fill="none" stroke="#0a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="28" height="18" rx="3" fill="#eef1f8"/><path d="M12 29h10M17 24v5"/><path d="M17 9v8M13.500 13.500 17 17l3.500-3.500" stroke="#c9a961"/></svg>';
  var SVG_APP = '<svg viewBox="0 0 34 34" fill="none" stroke="#0a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="20" height="28" rx="4" fill="#eef1f8"/><path d="M14 27h6"/></svg>';

  var velo = null;
  function chiudiFoglio() { if (velo) { velo.classList.remove('tc-su'); var v = velo; velo = null; setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 400); } }
  function apriFoglio(titolo, intro, passiHtml, pulsante) {
    chiudiFoglio();
    velo = el('div', 'tc-velo');
    var f = el('div', 'tc-foglio'); f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true'); f.setAttribute('aria-label', titolo);
    f.innerHTML = '<h2></h2><p></p>' + (passiHtml ? '<ol class="tc-passi">' + passiHtml + '</ol>' : '');
    f.querySelector('h2').textContent = titolo; f.querySelector('p').textContent = intro;
    if (pulsante) { var b = el('button', 'tc-btn'); b.type = 'button'; b.textContent = pulsante.testo; b.addEventListener('click', pulsante.az); f.appendChild(b); }
    var c = el('button', 'tc-btn tc-sec'); c.type = 'button'; c.textContent = 'Chiudi'; c.style.cssText = 'margin-top:6px;width:100%'; c.addEventListener('click', chiudiFoglio); f.appendChild(c);
    velo.appendChild(f); velo.addEventListener('click', function (e) { if (e.target === velo) chiudiFoglio(); });
    D.body.appendChild(velo); setTimeout(function () { velo.classList.add('tc-su'); }, 20);
  }
  function passo(n, svg, testo) { return '<li><span class="tc-n">' + n + '</span>' + svg + '<span class="tc-tx">' + testo + '</span></li>'; }

  function guidaInstallazione() {
    if (promptInstall) {
      apriFoglio('Installa l’app', 'Si apre a schermo intero, con la sua icona. Si aggiorna da sola.', '', {
        testo: 'Installa Team Contato', az: function () { chiudiFoglio(); eseguiInstallazione(); }
      });
    } else if (IOS) {
      // iOS 26: in Safari la barra e' compatta e "Condividi" sta dentro il menu "...". Fino a iOS 18 Condividi e' nella barra.
      var n = 0, passi = '';
      if (IN_APP_BROWSER || ALTRO_BROWSER_IOS) passi += passo(++n, SVG_SAFARI, 'Apri questa pagina in <b>Safari</b>' + (IN_APP_BROWSER ? ' (ora sei in un’altra app: usa «Apri in Safari»)' : ' (ora stai usando un altro browser)'));
      passi += passo(++n, SVG_PUNTINI, 'Tocca <b>⋯</b> in basso a destra, poi <b>Condividi</b>.<br><small>iOS 18 o precedenti: tocca subito <b>Condividi</b>, il quadrato con la freccia.</small>');
      passi += passo(++n, SVG_AGGIUNGI, 'Scegli <b>Aggiungi alla schermata Home</b> (se non c’è, tocca <b>Altro</b>), lascia attivo «Apri come app web», poi <b>Aggiungi</b>');
      passi += passo(++n, SVG_APP, 'Apri <b>Team Contato</b> dalla Home e attiva le notifiche');
      apriFoglio('Aggiungi l’app alla Home', 'Su iPhone si fa da Safari. Niente App Store.', passi);
    } else if (ANDROID) {
      apriFoglio('Installa l’app', 'Dal menu di Chrome in tre secondi.',
        passo(1, SVG_PUNTINI_V, 'Apri il menu <b>⋮</b> in alto a destra di Chrome') +
        passo(2, SVG_AGGIUNGI, 'Tocca <b>Installa app</b> (o «Aggiungi a schermata Home»)') +
        passo(3, SVG_APP, 'Conferma: l’icona <b>Team Contato</b> compare tra le tue app'));
    } else {
      apriFoglio('Installa l’app', 'Funziona con Chrome ed Edge.',
        passo(1, SVG_MONITOR, 'Guarda a destra della barra dell’indirizzo') +
        passo(2, SVG_MONITOR_FRECCIA, 'Clicca l’icona <b>Installa</b> (un monitor con una freccia)') +
        passo(3, SVG_APP, 'Conferma: l’app si apre in una finestra tutta sua'));
    }
  }
  function eseguiInstallazione() {
    if (!promptInstall) { guidaInstallazione(); return; }
    var p = promptInstall; promptInstall = null;
    p.prompt();
    p.userChoice.then(function (r) { if (r && r.outcome !== 'accepted') ls('tc_inst_no', String(Date.now())); aggiornaSchede(); });
  }

  /* ---------- schede in basso (una alla volta) ---------- */
  var schedaEl = null, schedaTipo = '';
  var GIORNI = 86400000;
  function recente(chiave, giorni) { var t = +ls(chiave) || 0; return t && Date.now() - t < giorni * GIORNI; }
  function mostraScheda(tipo, titolo, sotto, bottone, az, nonOra) {
    if (schedaTipo === tipo) return;
    nascondiScheda(true);
    schedaTipo = tipo;
    schedaEl = el('div', 'tc-scheda'); schedaEl.setAttribute('role', 'region'); schedaEl.setAttribute('aria-label', titolo);
    schedaEl.innerHTML = '<img src="icone/icon-96.png" width="44" height="44" alt=""><div class="tc-t"><b></b><span class="tc-s"></span></div><div class="tc-az"></div>';
    schedaEl.querySelector('b').textContent = titolo; schedaEl.querySelector('.tc-s').textContent = sotto;
    var a = schedaEl.querySelector('.tc-az');
    var b1 = el('button', 'tc-btn'); b1.type = 'button'; b1.textContent = bottone; b1.addEventListener('click', az); a.appendChild(b1);
    var b2 = el('button', 'tc-btn tc-sec'); b2.type = 'button'; b2.textContent = 'Non ora'; b2.addEventListener('click', function () { nonOra(); nascondiScheda(); }); a.appendChild(b2);
    D.body.appendChild(schedaEl); var s = schedaEl; setTimeout(function () { s.classList.add('tc-su'); }, 40);
  }
  function nascondiScheda(subito) {
    if (!schedaEl) return; var s = schedaEl; schedaEl = null; schedaTipo = '';
    s.classList.remove('tc-su'); setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, subito ? 0 : 450);
  }
  var primaVistaSessione = 0;
  function aggiornaSchede() {
    if (!D.body) return;
    var sess = leggiSessione();
    if (sess && !primaVistaSessione) primaVistaSessione = Date.now();
    if (!sess) primaVistaSessione = 0;
    // 1) installa (solo fuori dall'app, solo dove ha senso)
    // se la sezione "App sul telefono" dell'Area Agenti e' sullo schermo dice gia' la stessa cosa: niente scheda doppia
    var sez = q('.apx-sez'), sezioneVisibile = !!(sez && sez.getClientRects().length);
    var puoInstallare = !installazioneFatta && !STANDALONE && !sezioneVisibile && (promptInstall || (IOS && !IN_APP_BROWSER));
    if (puoInstallare && !recente('tc_inst_no', 14)) {
      mostraScheda('installa', 'Installa l’app Team Contato',
        IOS ? 'Aggiungila alla Home: si apre a schermo intero e ricevi le notifiche.' : 'Si apre a schermo intero, con la sua icona.',
        IOS ? 'Come si fa' : 'Installa', eseguiInstallazione, function () { ls('tc_inst_no', String(Date.now())); });
      return;
    }
    // 2) notifiche (solo dopo l'accesso, con un piccolo ritardo, mai su iPhone fuori dalla Home)
    var perm = SUPPORTO_PUSH ? Notification.permission : 'unsupported';
    if (CFG.push.attivo && sess && perm === 'default' && !recente('tc_notif_no', 7) && Date.now() - primaVistaSessione > 2500) {
      mostraScheda('notifiche', 'Attiva le notifiche',
        'Ricevi subito le nuove richieste, anche con l’app chiusa.', 'Attiva notifiche', function () { attivaNotifiche(); }, function () { ls('tc_notif_no', String(Date.now())); });
      return;
    }
    nascondiScheda();
  }

  /* ---------- notifiche push ---------- */
  function b64Uint8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')), o = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o;
  }
  function uguali(a, b) { if (!a || !b || a.byteLength !== b.byteLength) return false; var x = new Uint8Array(a), y = new Uint8Array(b); for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; }
  function urlPush(p) { return CFG.cancello.url.replace(/\/+$/, '') + CFG.cancello.percorsoPush.replace(/\/+$/, '') + p; }
  function gwFetch(metodo, p, corpo, sess) {
    var o = { method: metodo, headers: {}, keepalive: !!corpo };
    if (corpo) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(corpo); }
    if (sess) o.headers['Authorization'] = 'Bearer ' + sess.s;
    return fetch(urlPush(p), o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.status = r.status; if (!r.ok && !j.error) j.error = 'HTTP ' + r.status; if (r.ok && j.ok === undefined && p !== '/chiave') j.ok = true; return j; });
    });
  }
  var chiaveCache = '';
  function chiaveVapid() {
    if (CFG.push.chiavePubblica) return Promise.resolve(CFG.push.chiavePubblica);
    if (chiaveCache) return Promise.resolve(chiaveCache);
    return gwFetch('GET', '/chiave').then(function (j) { if (!j.chiave) throw new Error(j.error || 'chiave push non disponibile'); chiaveCache = j.chiave; return chiaveCache; });
  }
  function infoDispositivo() { return { piattaforma: IOS ? 'ios' : ANDROID ? 'android' : 'desktop', standalone: STANDALONE, app: APP.versione, lingua: navigator.language || '' }; }

  function statoNotifiche() {
    if (!SUPPORTO_PUSH) return IOS && !STANDALONE ? 'ios-fuori-home' : 'non-supportato';
    if (!CFG.push.attivo) return 'spento';
    if (Notification.permission === 'denied') return 'negato';
    if (Notification.permission === 'granted' && ls('tc_push_ok')) return 'attive';
    if (Notification.permission === 'granted') return 'concesso';
    return 'da-attivare';
  }

  function sottoscrivi(reg) {
    return chiaveVapid().then(function (chiave) {
      var chiaveBin = b64Uint8(chiave);
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub && sub.options && sub.options.applicationServerKey && !uguali(sub.options.applicationServerKey, chiaveBin.buffer)) {
          return sub.unsubscribe().then(function () { return null; });
        }
        return sub;
      }).then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveBin }); });
    });
  }
  function inviaIscrizione(sub, sess) {
    return gwFetch('POST', '/iscrivi', { subscription: sub.toJSON(), dispositivo: infoDispositivo() }, sess).then(function (j) {
      if (j.ok) { ls('tc_push_ok', JSON.stringify({ endpoint: sub.endpoint, ts: Date.now(), sess: sess.s.slice(-12) })); }
      return j;
    });
  }

  // una sola iscrizione alla volta: due chiamate insieme (avvio + pulsante) creerebbero due iscrizioni e la prima verrebbe invalidata
  var codaIscrizione = Promise.resolve();
  function iscriviInCoda(sess) {
    var p = codaIscrizione.catch(function () {}).then(function () { return navigator.serviceWorker.ready.then(sottoscrivi).then(function (sub) { return inviaIscrizione(sub, sess); }); });
    codaIscrizione = p; return p;
  }

  // chiamata dal gesto dell'utente (pulsante). requestPermission DEVE partire subito, senza attese prima.
  function attivaNotifiche() {
    if (!SUPPORTO_PUSH) { if (IOS && !STANDALONE) guidaInstallazione(); else toast('Questo dispositivo non supporta le notifiche.'); return Promise.resolve(false); }
    var sess = leggiSessione();
    if (!sess) { toast('Accedi prima, poi attiva le notifiche.'); return Promise.resolve(false); }
    var permesso = Notification.requestPermission();
    return Promise.resolve(permesso).then(function (p) {
      if (p !== 'granted') { aggiornaVoce(); aggiornaSchede(); toast(p === 'denied' ? 'Notifiche bloccate: si cambiano nelle impostazioni del telefono o del browser.' : 'Notifiche non attivate.'); return false; }
      toast('Attivo le notifiche…', 40000);
      return iscriviInCoda(sess).then(function (j) {
        if (!j.ok) { toast(j.status === 401 ? 'Sessione scaduta: accedi di nuovo.' : 'Non riesco a registrare le notifiche (' + (j.error || 'errore') + ').', 5200); return false; }
        ls('tc_notif_no', null); nascondiScheda(); aggiornaVoce(); toast('Notifiche attive su questo dispositivo.'); return true;
      });
    }).catch(function (e) { toast('Notifiche non attivate: ' + (e && e.message ? e.message : 'errore'), 5200); aggiornaVoce(); return false; });
  }
  function disattivaNotifiche() {
    var sess = leggiSessione();
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return true;
      var ep = sub.endpoint;
      return sub.unsubscribe().then(function () { return sess ? gwFetch('POST', '/disiscrivi', { endpoint: ep }, sess).catch(function () {}) : null; });
    }).then(function () { ls('tc_push_ok', null); ls('tc_notif_no', String(Date.now())); aggiornaVoce(); toast('Notifiche disattivate su questo dispositivo.'); return true; })
      .catch(function () { toast('Non riesco a disattivarle ora.'); return false; });
  }
  // a ogni avvio: se il permesso c'e' gia', rimette in pari l'iscrizione (idempotente, al massimo una volta al giorno)
  function sincronizzaIscrizione(forza) {
    if (!SUPPORTO_PUSH || !CFG.push.attivo || Notification.permission !== 'granted') return Promise.resolve();
    var sess = leggiSessione(); if (!sess) return Promise.resolve();
    var ultimo = {}; try { ultimo = JSON.parse(ls('tc_push_ok') || '{}'); } catch (e) { /* vuoto */ }
    var fresco = ultimo.ts && Date.now() - ultimo.ts < GIORNI && ultimo.sess === sess.s.slice(-12);
    if (fresco && !forza) return Promise.resolve();
    return iscriviInCoda(sess).then(function () { aggiornaVoce(); }).catch(function () { /* riprova al prossimo avvio */ });
  }

  /* voce "Notifiche" nel menu account del Code Block */
  var voceEl = null;
  function aggiornaVoce() {
    var pop = q('#tcag-pop-acct'); if (!pop) return;
    if (!voceEl || !voceEl.parentNode) {
      voceEl = el('button', 'it'); voceEl.type = 'button'; voceEl.setAttribute('data-tc', 'notifiche');
      var rif = pop.querySelector('[data-act="refresh"]');
      if (rif && rif.parentNode) rif.parentNode.insertBefore(voceEl, rif.nextSibling); else pop.appendChild(voceEl);
      var ver = pop.querySelector('#tcag-pa-ver');
      if (ver && !pop.querySelector('.tc-ver')) { var v = el('div', 'ver tc-ver'); v.textContent = 'App ' + APP.versione + ' (' + APP.build + ')'; ver.parentNode.insertBefore(v, ver.nextSibling); }
    }
    var s = statoNotifiche(), ico = '<svg class="i" width="16" height="16" aria-hidden="true"><use href="#tci-bell"/></svg>';
    var t = { 'da-attivare': 'Attiva notifiche', 'concesso': 'Attiva notifiche', 'attive': 'Notifiche attive · disattiva', 'negato': 'Notifiche bloccate (impostazioni)', 'ios-fuori-home': 'Notifiche: aggiungi l’app alla Home', 'non-supportato': 'Notifiche non supportate', 'spento': 'Notifiche non disponibili' }[s];
    voceEl.innerHTML = ico + '<span></span>'; voceEl.lastChild.textContent = t;
    voceEl.disabled = (s === 'non-supportato' || s === 'spento' || s === 'negato');
    voceEl.style.display = (s === 'spento') ? 'none' : '';
  }
  D.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-tc="notifiche"]');
    if (t) { e.preventDefault(); e.stopPropagation(); var s = statoNotifiche(); if (s === 'attive') disattivaNotifiche(); else if (s === 'ios-fuori-home') guidaInstallazione(); else attivaNotifiche(); return; }
    // Esci: questo dispositivo smette SEMPRE di ricevere le notifiche di quella persona.
    // Il server si avvisa solo se la sessione e' ancora valida; altrimenti ci pensa l'errore 410 del servizio push.
    var out = e.target.closest && e.target.closest('[data-act="logout"]');
    if (out && SUPPORTO_PUSH && SUPPORTO_SW) {
      var sess = leggiSessione();
      navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (!sub) return;
        var ep = sub.endpoint;
        if (sess) gwFetch('POST', '/disiscrivi', { endpoint: ep }, sess).catch(function () {});
        sub.unsubscribe().catch(function () {});
      }).catch(function () {});
      ls('tc_push_ok', null);
    }
  }, true);

  /* ---------- badge dell'icona ---------- */
  var badgeT = 0, ultimoBadge = -1;
  function leggiBadge() {
    var sel = CFG.badge.selettori, i, j, n, lista;
    for (i = 0; i < sel.length; i++) {
      lista = D.querySelectorAll(sel[i]);
      for (j = 0; j < lista.length; j++) {
        if (!lista[j].hidden && lista[j].getClientRects().length) { n = parseInt((lista[j].textContent || '').replace(/\D/g, ''), 10); if (n > 0) return n; }
      }
    }
    return 0;
  }
  function aggiornaBadge() {
    clearTimeout(badgeT);
    badgeT = setTimeout(function () {
      if (!('setAppBadge' in navigator)) return;
      var sess = leggiSessione(), n = sess ? leggiBadge() : 0;
      if (n === ultimoBadge) return; ultimoBadge = n;
      try { (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(function () {}); } catch (e) { /* non supportato */ }
    }, 400);
  }
  function osservaBadge() {
    new MutationObserver(aggiornaBadge).observe(D.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    aggiornaBadge();
  }

  /* ---------- accesso con codice via email (ripiego, SPENTO di default) ---------- */
  function chiamaScript(azione, dati) {
    var m = q('meta[custom-plugin="immobiliare"]'), url = (m && m.getAttribute('webapp-url')) || CFG.backend.endpoint;
    var corpo = { type: 'portale-agenti', azione: azione }; for (var k in dati) corpo[k] = dati[k];
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) })
      .then(function (r) { return r.text(); })
      .then(function (t) { var j; try { j = JSON.parse(t); } catch (e) { throw new Error('Il server non risponde. Riprova tra un minuto.'); } if (!j.ok) { var er = new Error(j.error || 'Operazione non riuscita'); er.status = j.status; throw er; } return j; });
  }
  var codiceMontato = false;
  function montaLoginCodice() {
    if (codiceMontato || !CFG.loginCodice.abilitato) return;
    var carta = q('.tcag-login-carta'), gsi = q('#tcag-gsi'); if (!carta || !gsi) return;
    codiceMontato = true;
    var principale = IOS && STANDALONE;
    var box = el('div', 'tc-codice');
    box.innerHTML = '<div class="tc-o">' + (principale ? 'accesso con codice' : 'oppure') + '</div>' +
      '<button type="button" class="tc-apri">Accedi con un codice via email</button>' +
      '<form novalidate hidden>' +
      '<div class="tc-f1"><label>La tua email di lavoro<input type="email" name="mail" autocomplete="email" inputmode="email" required></label>' +
      '<button type="submit" class="tc-vai" style="width:100%;margin-top:10px">Invia il codice</button></div>' +
      '<div class="tc-f2" hidden><label>Codice di 8 cifre (arriva per email, vale 10 minuti)<input class="tc-cifre" name="codice" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]{8}"></label>' +
      '<button type="submit" class="tc-vai" style="width:100%;margin-top:10px">Entra</button>' +
      '<button type="button" class="tc-link" data-r="1">Rimanda il codice</button></div>' +
      '<p class="tc-msg" role="status"></p></form>';
    if (principale) {
      gsi.parentNode.insertBefore(box, gsi);
      var tx = q('.tcag-login-testo'); if (tx) { tx.textContent = 'Riservata agli agenti del team. Accedi con un codice via email.'; }   // il codice e' la via principale: il testo non parla piu' solo di Google
    } else { gsi.parentNode.insertBefore(box, gsi.nextSibling); }
    var form = box.querySelector('form'), apri = box.querySelector('.tc-apri'), f1 = box.querySelector('.tc-f1'), f2 = box.querySelector('.tc-f2'), msg = box.querySelector('.tc-msg');
    function dire(t, err) { msg.textContent = t || ''; msg.classList.toggle('tc-err', !!err); }
    function mostra() { apri.hidden = true; form.hidden = false; var i = form.mail; if (i) i.focus(); }
    apri.addEventListener('click', mostra); if (principale) mostra();
    var mail = '';
    function richiedi() {
      mail = form.mail.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { dire('Scrivi un indirizzo email valido.', true); return; }
      dire('Invio il codice…');
      chiamaScript(CFG.loginCodice.azioneRichiedi, { email: mail }).then(function () {
        f1.hidden = true; f2.hidden = false; dire('Se l’indirizzo è abilitato, il codice è in arrivo. Controlla anche la posta indesiderata.'); form.codice.focus();
      }).catch(function (e) { dire(e.message, true); });
    }
    function verifica() {
      var c = (form.codice.value || '').replace(/\D/g, '');
      if (c.length !== 8) { dire('Il codice ha 8 cifre.', true); return; }
      dire('Verifico…');
      chiamaScript(CFG.loginCodice.azioneVerifica, { email: mail, codice: c }).then(function (j) {
        // stessa forma che salva il Code Block dopo "Accedi con Google"
        ls(CFG.sessione.chiaviLocalStorage[0], JSON.stringify({ s: j.sessione, scade: j.scade, nome: j.nome || j.email }));
        try { sessionStorage.removeItem('tcag_uscito'); } catch (e) { /* ignora */ }
        location.reload();
      }).catch(function (e) { dire(e.message, true); });
    }
    form.addEventListener('submit', function (ev) { ev.preventDefault(); if (f2.hidden) richiedi(); else verifica(); });
    box.querySelector('[data-r]').addEventListener('click', function () { f2.hidden = true; f1.hidden = false; form.codice.value = ''; dire(''); });
  }
  function osservaLogin() {
    if (!CFG.loginCodice.abilitato) return;
    var r = q('#tcag'); if (!r) return;
    var prova = function () { var l = q('#tcag-login'); if (l && !l.hidden) montaLoginCodice(); };
    new MutationObserver(prova).observe(r, { attributes: true, subtree: true, attributeFilter: ['hidden'] }); prova();
  }

  /* ---------- sessione lunga per dispositivo (SPENTA di default) ---------- */
  function rinnovaSessione() {
    if (!CFG.rinnovoSessione.abilitato) return;
    var s = leggiSessione(); if (!s) return;
    if (s.scade - Date.now() > CFG.rinnovoSessione.sogliaOre * 3600 * 1000) return;
    if (ls('tc_rinnovo_in_corso')) { ls('tc_rinnovo_in_corso', null); return; }  // un solo tentativo per avvio: niente giri di ricarica
    ls('tc_rinnovo_in_corso', '1');
    chiamaScript(CFG.rinnovoSessione.azione, { sessione: s.s }).then(function (j) {
      ls(s.chiave, JSON.stringify({ s: j.sessione, scade: j.scade, nome: j.nome || s.nome }));
      ls('tc_rinnovo_in_corso', null);
      location.reload();   // il Code Block tiene la sessione in memoria: riparte con quella nuova
    }).catch(function () { ls('tc_rinnovo_in_corso', null); });
  }

  /* ---------- installazione richiesta dal sito (?installa=1) ---------- */
  function richiestaInstalla() {
    try {
      var p = new URLSearchParams(location.search);
      if (p.get('installa') === '1' && !STANDALONE) {
        history.replaceState(null, '', location.pathname + location.hash);
        setTimeout(guidaInstallazione, 900);
      } else if (p.has('avvio')) { history.replaceState(null, '', location.pathname + location.hash); }
    } catch (e) { /* ignora */ }
  }

  /* ---------- avvio ---------- */
  /* Se il Code Block ha ancora il segnaposto "TC" al posto del logo, nell'app si usa il castello vero.
     Se il Code Block ha gia' il suo logo (nessun <text> nel simbolo) non si tocca niente. */
  function logoVero() {
    var s = q('#tci-logo');
    if (s && s.querySelector('text')) s.innerHTML = '<image href="icone/logo-chiaro.png" x="0" y="3.5" width="32" height="25"/>';
  }
  function avvia() {
    logoVero();
    osservaAvvio(); osservaRete(); osservaLogin(); osservaBadge(); richiestaInstalla();
    registraSW().then(function () { aggiornaVoce(); sincronizzaIscrizione(false); });
    aggiornaVoce(); aggiornaSchede();
    setInterval(aggiornaSchede, 3000);
    window.addEventListener('storage', function () { aggiornaSchede(); aggiornaBadge(); });
    rinnovaSessione();
  }
  // API minima per le prove e la diagnostica
  window.TC_APP = APP;
  APP.diagnostica = function () {
    return { versione: APP.versione, build: APP.build, standalone: STANDALONE, ios: IOS, android: ANDROID, supportoSW: SUPPORTO_SW, supportoPush: SUPPORTO_PUSH,
      permesso: SUPPORTO_PUSH ? Notification.permission : null, statoNotifiche: statoNotifiche(), sessione: !!leggiSessione(), controller: !!(SUPPORTO_SW && navigator.serviceWorker.controller),
      promptInstallazione: !!promptInstall, schedaVisibile: schedaTipo, badge: leggiBadge(), cfg: { cancello: CFG.cancello.url, push: CFG.push.attivo, loginCodice: CFG.loginCodice.abilitato } };
  };
  // appoggi per le prove automatiche (non usati dall'app)
  APP._prova = { modificheInCorso: modificheInCorso, aggiornamentoPronto: function () { aggiornamentoPronto = true; nascostoDal = Date.now() - 6 * 60 * 1000; } };
  APP.attivaNotifiche = attivaNotifiche; APP.disattivaNotifiche = disattivaNotifiche; APP.guidaInstallazione = guidaInstallazione; APP.sincronizza = sincronizzaIscrizione;

  fetch('config.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (c) { unisci(CFG, c || {}); })
    .then(function () { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', avvia); else avvia(); });
})();
