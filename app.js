'use strict';

/* =========================================================
   Wizard Begleiter – Punkteblock & Regelhilfe (PWA)
   Reines HTML/CSS/JS, kein Build-Schritt nötig.
   ========================================================= */

const COLORS = ['#e5484d', '#3e8ef7', '#30a46c', '#f5c518', '#a78bfa', '#fb923c'];
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const BASE_DECK = 60;

const TRUMPS = [
  { id: 'red', label: 'Rot', color: '#d63a3f' },
  { id: 'blue', label: 'Blau', color: '#2f6fd6' },
  { id: 'green', label: 'Grün', color: '#23875a' },
  { id: 'yellow', label: 'Gelb', color: '#c99a06' },
  { id: 'none', label: 'Kein Trumpf', color: '#4b4470' },
];

/* ---------- Speicher (robust gegen private Tabs etc.) ---------- */
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* Speicher nicht verfügbar – App läuft trotzdem */ }
  },
};

const state = {
  view: 'home',
  prev: null,
  tab: 'round',
  game: store.get('wz.game', null),
  history: store.get('wz.history', []),
  draft: null,
  viewing: null, // Index in history für die Ergebnisansicht
  lastFinishedId: null,
};

function save() {
  store.set('wz.game', state.game);
  store.set('wz.history', state.history);
}

/* ---------- Hilfsfunktionen ---------- */
const $ = (sel) => document.querySelector(sel);
const app = $('#app');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function sum(arr) {
  return arr.reduce((a, b) => a + (b || 0), 0);
}

function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0';
}

function defaultRounds(playerCount) {
  return Math.floor(BASE_DECK / playerCount);
}

function points(bid, adj, tricks) {
  const target = bid + (adj || 0);
  return tricks === target ? 20 + 10 * tricks : -10 * Math.abs(tricks - target);
}

function roundPoints(round) {
  return round.bids.map((b, i) => points(b, round.adj[i], round.tricks[i]));
}

function totals(game, upTo = game.done.length) {
  const t = game.players.map(() => 0);
  game.done.slice(0, upTo).forEach((r) => {
    roundPoints(r).forEach((p, i) => { t[i] += p; });
  });
  return t;
}

function ranking(game) {
  const t = totals(game);
  const order = game.players.map((_, i) => i).sort((a, b) => t[b] - t[a]);
  // Gleichstand = gleicher Platz
  const ranks = [];
  order.forEach((p, k) => {
    ranks[p] = k > 0 && t[p] === t[order[k - 1]] ? ranks[order[k - 1]] : k + 1;
  });
  return { order, ranks, totals: t };
}

function roundNo(game) {
  return game.done.length + 1;
}

function dealerOf(game, n) {
  return (game.dealer0 + n - 1) % game.players.length;
}

function orderFrom(game, n) {
  const p = game.players.length;
  const d = dealerOf(game, n);
  return Array.from({ length: p }, (_, k) => (d + 1 + k) % p);
}

function newRound(game) {
  const p = game.players.length;
  return {
    phase: 'bid',
    bids: Array(p).fill(null),
    tricks: Array(p).fill(null),
    adj: Array(p).fill(0),
    noWinner: 0,
    trump: null,
  };
}

/** Bei aktivierter Regel „Ansagen dürfen nicht aufgehen“: verbotener Wert für den Geber. */
function forbiddenBid(game) {
  if (!game.opts.noEvenBids) return null;
  const n = roundNo(game);
  const order = orderFrom(game, n);
  const dealer = order[order.length - 1];
  const others = order.slice(0, -1);
  if (others.some((i) => game.cur.bids[i] === null)) return null;
  const f = n - sum(others.map((i) => game.cur.bids[i]));
  return f >= 0 && f <= n ? { player: dealer, value: f } : null;
}

/* ---------- Toast & Dialog ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function ask(title, text, buttons) {
  const dlg = $('#dialog');
  dlg.innerHTML = `
    <h2>${esc(title)}</h2>
    ${text ? `<p>${esc(text)}</p>` : ''}
    <div class="actions">
      ${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
    </div>`;
  return new Promise((resolve) => {
    const done = (value) => {
      dlg.close();
      resolve(value);
    };
    dlg.querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => done(buttons[+btn.dataset.i].value);
    });
    dlg.oncancel = (e) => { e.preventDefault(); done(null); };
    dlg.onclick = (e) => { if (e.target === dlg) done(null); };
    dlg.showModal();
  });
}

/* ---------- Bildschirm anlassen während des Spiels ---------- */
let wakeLock = null;
async function updateWakeLock() {
  const want = state.view === 'game' && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* nicht unterstützt oder verweigert */ }
}
document.addEventListener('visibilitychange', updateWakeLock);

/* =========================================================
   Navigation
   ========================================================= */
function go(view, opts = {}) {
  state.prev = opts.back ?? (view === 'home' ? null : 'home');
  state.view = view;
  if (opts.tab) state.tab = opts.tab;
  render();
  window.scrollTo(0, 0);
}

$('#backBtn').onclick = () => go(state.prev || 'home');
$('#menuBtn').onclick = () => openGameMenu();

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/* =========================================================
   Rendering
   ========================================================= */
function render() {
  const views = { home: viewHome, setup: viewSetup, game: viewGame, rules: viewRules, final: viewFinal };
  const { title, html, footer } = (views[state.view] || viewHome)();
  $('#title').textContent = title;
  $('#backBtn').hidden = state.view === 'home';
  $('#menuBtn').hidden = state.view !== 'game';
  app.innerHTML = html + (footer ? `<div class="footer-bar"><div class="inner">${footer}</div></div>` : '');
  updateWakeLock();
}

/* ---------- Startseite ---------- */
function viewHome() {
  const g = state.game;
  let html = `
    <div class="hero">
      <img src="icons/icon-192.png" alt="">
      <h2>Wizard Begleiter</h2>
      <p>30 Jahre Jubiläumsedition</p>
    </div>`;

  if (g) {
    const n = roundNo(g);
    const { order, totals: t } = ranking(g);
    html += `
      <div class="card">
        <h2>Laufendes Spiel</h2>
        <p class="muted small" style="margin:0 0 12px">Runde ${n} von ${g.rounds} · Führung: ${esc(g.players[order[0]])} (${t[order[0]]})</p>
        <div class="stack">
          <button class="btn primary" data-act="resume">Weiterspielen</button>
          <button class="btn" data-act="new-game">Neues Spiel</button>
        </div>
      </div>`;
  } else {
    html += `<div class="card stack"><button class="btn primary" data-act="new-game">Neues Spiel starten</button></div>`;
  }

  html += `<div class="card stack"><button class="btn" data-act="rules">📖 Regeln &amp; Sonderkarten</button></div>`;

  if (state.history.length) {
    html += `<div class="card"><h2>Letzte Spiele</h2>`;
    state.history.slice(0, 10).forEach((h, idx) => {
      const { order, totals: t } = ranking(h);
      const date = new Date(h.finishedAt || h.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      html += `
        <div class="entry" data-act="show-history" data-i="${idx}" style="cursor:pointer">
          <div class="who"><span class="name">🏆 ${esc(h.players[order[0]])}</span></div>
          <span class="pill gold">${t[order[0]]} P.</span>
          <div class="sub"><span>${date}</span><span>·</span><span>${h.players.length} Spieler · ${h.done.length} Runden</span></div>
        </div>`;
    });
    html += `<button class="btn small-btn danger" style="margin-top:12px" data-act="clear-history">Verlauf löschen</button></div>`;
  }

  if (!isStandalone()) {
    html += `
      <div class="card install-hint">
        <h2>📲 Als App installieren</h2>
        <ol class="small muted">
          <li>Diese Seite in <b>Safari</b> öffnen</li>
          <li>Unten auf <b>Teilen</b> tippen (Quadrat mit Pfeil)</li>
          <li><b>„Zum Home-Bildschirm“</b> wählen → <b>Hinzufügen</b></li>
        </ol>
        <p class="small muted" style="margin:8px 0 0">Danach startet die App im Vollbild mit eigenem Icon und funktioniert auch offline.</p>
      </div>`;
  }

  return { title: 'Wizard', html };
}

/* ---------- Spiel einrichten ---------- */
function startDraft(players) {
  const last = store.get('wz.lastPlayers', null);
  const names = players || (last && last.length >= MIN_PLAYERS ? last : ['', '', '', '']);
  state.draft = {
    players: names.slice(0, MAX_PLAYERS),
    dealer0: 0,
    rounds: defaultRounds(names.length),
    roundsTouched: false,
    opts: { ...store.get('wz.lastOpts', { specials: true, noEvenBids: false }) },
  };
}

function viewSetup() {
  const d = state.draft;
  const p = d.players.length;
  if (!d.roundsTouched) d.rounds = defaultRounds(p);
  if (d.dealer0 >= p) d.dealer0 = 0;

  const rows = d.players.map((name, i) => `
    <div class="player-input">
      <span class="dot" style="background:${COLORS[i]}"></span>
      <input class="field" data-name="${i}" value="${esc(name)}" placeholder="Spieler ${i + 1}"
             autocomplete="off" autocapitalize="words" enterkeyhint="next" maxlength="16">
      <button class="icon-btn" data-act="p-up" data-i="${i}" aria-label="Nach oben" ${i === 0 ? 'disabled style="opacity:.25"' : ''}>↑</button>
      <button class="icon-btn" data-act="p-del" data-i="${i}" aria-label="Entfernen" ${p <= MIN_PLAYERS ? 'disabled style="opacity:.25"' : ''}>✕</button>
    </div>`).join('');

  const dealerOpts = d.players.map((name, i) => `<option value="${i}" ${i === d.dealer0 ? 'selected' : ''}>${esc(name || `Spieler ${i + 1}`)}</option>`).join('');

  const html = `
    <div class="card">
      <h2>Spieler <span class="muted small">(in Sitzreihenfolge, im Uhrzeigersinn)</span></h2>
      ${rows}
      ${p < MAX_PLAYERS ? '<button class="btn small-btn" data-act="p-add">+ Spieler hinzufügen</button>' : ''}
    </div>

    <div class="card">
      <h2>Erster Geber</h2>
      <div class="row">
        <select class="field grow" data-dealer>${dealerOpts}</select>
        <button class="btn small-btn" style="width:auto" data-act="dealer-random">🎲 Zufall</button>
      </div>
    </div>

    <div class="card">
      <h2>Anzahl Runden</h2>
      <div class="row">
        <div class="grow muted small">Standard: ${BASE_DECK} Karten ÷ ${p} Spieler = <b>${defaultRounds(p)}</b> Runden</div>
        ${stepper('rounds', 0, d.rounds, 1, 30)}
      </div>
    </div>

    <div class="card">
      <h2>Optionen</h2>
      ${switchRow('specials', d.opts.specials, 'Sonderkarten der Jubiläumsedition', 'Wolke (Ansage ±1) und Bombe (Stich ohne Gewinner) bei der Wertung berücksichtigen')}
      ${switchRow('noEvenBids', d.opts.noEvenBids, 'Ansagen dürfen nicht aufgehen', 'Der Geber darf nicht so ansagen, dass die Summe der Ansagen der Kartenzahl entspricht')}
    </div>`;

  return {
    title: 'Neues Spiel',
    html,
    footer: '<button class="btn primary" data-act="start-game">Spiel starten</button>',
  };
}

function switchRow(key, on, label, hint) {
  return `
    <label class="switch-row">
      <span class="label">${label}<small>${hint}</small></span>
      <span class="switch"><input type="checkbox" data-opt="${key}" ${on ? 'checked' : ''}><span></span></span>
    </label>`;
}

function stepper(kind, i, val, min, max) {
  const unset = val === null || val === undefined;
  return `
    <div class="stepper">
      <button data-act="dec" data-kind="${kind}" data-i="${i}" aria-label="Weniger" ${!unset && val <= min ? 'disabled' : ''}>−</button>
      <span class="val ${unset ? 'unset' : ''}">${unset ? '?' : val}</span>
      <button data-act="inc" data-kind="${kind}" data-i="${i}" aria-label="Mehr" ${!unset && val >= max ? 'disabled' : ''}>+</button>
    </div>`;
}

/* ---------- Spielansicht ---------- */
function viewGame() {
  const g = state.game;
  if (!g) return viewHome();
  const tabs = `
    <div class="tabs">
      <button class="${state.tab === 'round' ? 'on' : ''}" data-act="tab" data-tab="round">Runde</button>
      <button class="${state.tab === 'sheet' ? 'on' : ''}" data-act="tab" data-tab="sheet">Tabelle</button>
      <button class="${state.tab === 'trump' ? 'on' : ''}" data-act="tab" data-tab="trump">Trumpf</button>
    </div>`;
  const n = roundNo(g);
  const title = `Runde ${n} / ${g.rounds}`;

  if (state.tab === 'sheet') return { title, html: tabs + viewSheet(g, true) };
  if (state.tab === 'trump') return { title, html: tabs + viewTrump(g) };

  const cur = g.cur;
  const order = orderFrom(g, n);
  const dealer = dealerOf(g, n);
  const t = totals(g);

  let html = tabs + `
    <div class="round-head">
      <div>
        <div class="big">Runde ${n} <small>von ${g.rounds}</small></div>
        <div class="muted small">Geber: <b>${esc(g.players[dealer])}</b> · Beginnt: <b>${esc(g.players[order[0]])}</b></div>
      </div>
      <span class="pill gold">${n} ${n === 1 ? 'Karte' : 'Karten'}</span>
    </div>
    ${trumpBanner(g)}`;

  let footer;

  if (cur.phase === 'bid') {
    const bidSum = sum(cur.bids);
    const allSet = cur.bids.every((b) => b !== null);
    const firstOpen = order.find((i) => cur.bids[i] === null);
    const forb = forbiddenBid(g);

    html += `<div class="card"><h2>Ansagen</h2>`;
    order.forEach((i) => {
      html += `
        <div class="entry ${i === firstOpen ? 'active' : ''}">
          <div class="who">
            <span class="dot" style="background:${COLORS[i]}"></span>
            <span class="name">${esc(g.players[i])}</span>
            ${i === dealer ? '<span class="pill">Geber</span>' : ''}
          </div>
          ${stepper('bid', i, cur.bids[i], 0, n)}
          ${forb && forb.player === i ? `<div class="sub">⚠︎ Darf nicht <b>${forb.value}</b> ansagen</div>` : ''}
        </div>`;
    });

    const diff = bidSum - n;
    let pill = '';
    if (allSet) {
      pill = diff === 0 ? '<span class="pill">geht auf</span>'
        : diff > 0 ? `<span class="pill bad">überreizt ${signed(diff)}</span>`
          : `<span class="pill good">unterreizt ${signed(diff)}</span>`;
    }
    html += `<div class="status"><span>Angesagt: <b>${bidSum}</b> von ${n} Stichen</span>${pill}</div></div>`;

    const blocked = forb && cur.bids[forb.player] === forb.value;
    footer = `<button class="btn primary" data-act="to-tricks" ${!allSet || blocked ? 'disabled' : ''}>Weiter zu den Stichen</button>`;
  } else {
    const expected = n - (cur.noWinner || 0);
    const trickSum = sum(cur.tricks);
    const allSet = cur.tricks.every((x) => x !== null);
    const ok = allSet && trickSum === expected;

    html += `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px">
      <h2 style="margin:0">Stiche</h2>
      <button class="btn small-btn" style="width:auto" data-act="all-hit">✓ Alle wie angesagt</button>
    </div>`;
    order.forEach((i) => {
      const bid = cur.bids[i];
      const adj = cur.adj[i] || 0;
      const tr = cur.tricks[i];
      let result = '';
      if (tr !== null) {
        const p = points(bid, adj, tr);
        result = `<span class="delta ${p > 0 ? 'good' : 'bad'}">${signed(p)}</span>`;
      }
      html += `
        <div class="entry">
          <div class="who">
            <span class="dot" style="background:${COLORS[i]}"></span>
            <span class="name">${esc(g.players[i])}</span>
          </div>
          ${stepper('trick', i, tr, 0, n)}
          <div class="sub">
            <span>Ansage <b>${bid}${adj ? ` → ${bid + adj}` : ''}</b></span>
            ${result}
            ${g.opts.specials ? `
              <span style="margin-left:auto" class="mini-seg" aria-label="Wolke">
                <button class="${adj === -1 ? 'on' : ''}" data-act="adj" data-i="${i}" data-v="-1" ${bid === 0 ? 'disabled' : ''}>☁︎ −1</button>
                <button class="${adj === 0 ? 'on' : ''}" data-act="adj" data-i="${i}" data-v="0">–</button>
                <button class="${adj === 1 ? 'on' : ''}" data-act="adj" data-i="${i}" data-v="1">☁︎ +1</button>
              </span>` : ''}
          </div>
        </div>`;
    });

    if (g.opts.specials) {
      html += `
        <div class="entry">
          <div class="who"><span class="name">💣 Stiche ohne Gewinner</span></div>
          ${stepper('noWinner', 0, cur.noWinner || 0, 0, Math.min(2, n))}
          <div class="sub">Durch die Bombe gewinnt niemand den Stich.</div>
        </div>`;
    }

    const d = trickSum - expected;
    html += `<div class="status"><span>Verteilt: <b>${trickSum}</b> von ${expected} Stichen</span>
      ${allSet ? (d === 0 ? '<span class="pill good">passt ✓</span>' : `<span class="pill bad">${d > 0 ? `${d} zu viel` : `${-d} zu wenig`}</span>`) : ''}
    </div></div>`;

    footer = `
      <button class="btn secondary" data-act="to-bids">‹ Ansagen</button>
      <button class="btn primary" data-act="save-round" ${ok ? '' : 'disabled'}>${n >= g.rounds ? 'Spiel beenden' : 'Runde speichern'}</button>`;
  }

  // Kompakter Zwischenstand
  if (g.done.length) {
    const { order: rk, ranks } = ranking(g);
    const last = roundPoints(g.done[g.done.length - 1]);
    html += `<div class="card standings"><h2>Zwischenstand</h2>`;
    rk.forEach((i) => {
      html += `
        <div class="entry">
          <span class="rank ${ranks[i] === 1 ? 'first' : ''}">${ranks[i]}.</span>
          <div class="who"><span class="dot" style="background:${COLORS[i]}"></span><span class="name">${esc(g.players[i])}</span></div>
          <span><span class="delta ${last[i] > 0 ? 'good' : 'bad'}">${signed(last[i])}</span>&nbsp; <span class="score">${t[i]}</span></span>
        </div>`;
    });
    html += `</div>`;
  }

  return { title, html, footer };
}

function trumpBanner(g) {
  const tr = TRUMPS.find((x) => x.id === g.cur.trump);
  if (!tr) return '';
  return `<div class="trump-banner" style="background:${tr.color}" data-act="tab" data-tab="trump">
    <span>Trumpf: ${tr.label}</span><span class="small">ändern ›</span></div>`;
}

function viewTrump(g) {
  const n = roundNo(g);
  const isLast = n === g.rounds && n * g.players.length >= BASE_DECK;
  return `
    <div class="card">
      <h2>Trumpf dieser Runde</h2>
      <p class="muted small" style="margin-top:0">Wird oben im Rundenbildschirm angezeigt – falls jemand vergisst, was Trumpf ist.</p>
      <div class="trump-grid">
        ${TRUMPS.map((t) => `<button style="background:${t.color}" class="${g.cur.trump === t.id ? 'on' : ''}" data-act="trump" data-id="${t.id}">${t.label}</button>`).join('')}
        <button style="background:#2a2061" data-act="trump" data-id="">Zurücksetzen</button>
      </div>
      ${isLast ? '<p class="small" style="color:var(--gold);margin:12px 0 0">Letzte Runde: Alle Karten sind verteilt – es wird ohne Trumpf gespielt.</p>' : ''}
    </div>
    <div class="card">
      <h2>Aufgedeckte Karte bestimmt Trumpf</h2>
      <div class="rule"><div class="emoji">🔢</div><div><b>Farbkarte</b><p>Ihre Farbe ist Trumpf.</p></div></div>
      <div class="rule"><div class="emoji">🧙</div><div><b>Zauberer</b><p>Der Geber sieht sich seine Karten an und bestimmt die Trumpffarbe.</p></div></div>
      <div class="rule"><div class="emoji">🃏</div><div><b>Narr</b><p>Diese Runde gibt es keinen Trumpf.</p></div></div>
      <div class="rule"><div class="emoji">🐺</div><div><b>Werwolf</b><p>Wer den Werwolf auf der Hand hat, tauscht ihn gegen die Trumpfkarte und bestimmt die Trumpffarbe (oder kein Trumpf).</p></div></div>
      <div class="rule"><div class="emoji">🧛</div><div><b>Vampir</b><p>Wird der Vampir ausgespielt, kopiert er die Trumpfkarte – inklusive aller Effekte, falls dort eine Sonderkarte liegt.</p></div></div>
    </div>`;
}

/* ---------- Tabelle (auch für abgeschlossene Spiele) ---------- */
function viewSheet(g, live) {
  const { order, ranks, totals: t } = ranking(g);
  let html = '';

  if (!g.done.length) {
    return '<div class="card center muted">Noch keine Runde gespielt.</div>';
  }

  if (live) {
    html += `<div class="card standings"><h2>Stand nach ${g.done.length} ${g.done.length === 1 ? 'Runde' : 'Runden'}</h2>`;
    order.forEach((i) => {
      html += `
        <div class="entry">
          <span class="rank ${ranks[i] === 1 ? 'first' : ''}">${ranks[i]}.</span>
          <div class="who"><span class="dot" style="background:${COLORS[i]}"></span><span class="name">${esc(g.players[i])}</span></div>
          <span class="score">${t[i]}</span>
        </div>`;
    });
    html += `</div>`;
  }

  const running = g.players.map(() => 0);
  html += `<div class="card"><h2>Punkteblock</h2><div class="table-wrap"><table class="sheet">
    <thead><tr><th>#</th>${g.players.map((p, i) => `<th><span style="color:${COLORS[i]}">●</span> ${esc(p)}</th>`).join('')}</tr></thead><tbody>`;
  g.done.forEach((r, k) => {
    const pts = roundPoints(r);
    html += `<tr><td>${k + 1}</td>`;
    pts.forEach((p, i) => {
      running[i] += p;
      const adj = r.adj[i] ? `${r.adj[i] > 0 ? '+' : '−'}☁︎` : '';
      html += `<td class="${p > 0 ? 'hit' : 'miss'}"><span class="pts">${running[i]}</span><span class="bt">${r.bids[i]}${adj}/${r.tricks[i]} · ${signed(p)}</span></td>`;
    });
    html += `</tr>`;
  });
  html += `<tr class="total"><td>Σ</td>${t.map((x) => `<td>${x}</td>`).join('')}</tr>`;
  html += `</tbody></table></div><p class="small muted" style="margin:10px 0 0">Kleine Zahlen: Ansage / Stiche · Rundenpunkte</p></div>`;

  if (live) {
    html += `<div class="card"><button class="btn" data-act="undo-round">↩︎ Letzte Runde korrigieren</button></div>`;
  }
  return html;
}

/* ---------- Ergebnis ---------- */
function viewFinal() {
  const g = state.history[state.viewing];
  if (!g) return viewHome();
  const { order, ranks, totals: t } = ranking(g);
  const medals = ['🥇', '🥈', '🥉'];
  const podium = [order[1], order[0], order[2]].filter((i) => i !== undefined);
  const heights = { 1: 120, 2: 90, 3: 66 };

  let html = `<div class="podium">`;
  podium.forEach((i) => {
    const r = ranks[i];
    html += `<div class="p ${r === 1 ? 'first' : ''}">
      <div class="nm">${esc(g.players[i])}</div><div class="sc">${t[i]} Punkte</div>
      <div class="bar" style="height:${heights[r] || 60}px">${medals[r - 1] || ''}</div></div>`;
  });
  html += `</div>`;

  html += `<div class="card standings"><h2>Endstand</h2>`;
  order.forEach((i) => {
    const hits = g.done.filter((r) => r.tricks[i] === r.bids[i] + (r.adj[i] || 0)).length;
    html += `
      <div class="entry">
        <span class="rank ${ranks[i] === 1 ? 'first' : ''}">${ranks[i]}.</span>
        <div class="who"><span class="dot" style="background:${COLORS[i]}"></span><span class="name">${esc(g.players[i])}</span></div>
        <span class="score">${t[i]}</span>
        <div class="sub" style="padding-left:36px">${hits} von ${g.done.length} Ansagen getroffen (${Math.round((hits / g.done.length) * 100)} %)</div>
      </div>`;
  });
  html += `</div>`;
  html += viewSheet(g, false);

  const canFix = state.viewing === 0 && g.id === state.lastFinishedId && !state.game;
  html += `<div class="card stack">
    ${canFix ? '<button class="btn" data-act="reopen">↩︎ Letzte Runde korrigieren</button>' : ''}
    <button class="btn danger" data-act="delete-history" data-i="${state.viewing}">Spiel aus Verlauf löschen</button>
  </div>`;

  return {
    title: 'Ergebnis',
    html,
    footer: `<button class="btn secondary" data-act="home">Start</button><button class="btn primary" data-act="rematch">Revanche</button>`,
  };
}

/* ---------- Regeln ---------- */
function viewRules() {
  const rule = (emoji, name, text, tag = '') => `
    <div class="rule"><div class="emoji">${emoji}</div><div><b>${name}${tag ? `<span class="tag">${tag}</span>` : ''}</b><p>${text}</p></div></div>`;

  const html = `
    <div class="card">
      <h2>Ablauf</h2>
      <ul class="small">
        <li>60 Karten: Zahlen 1–13 in Rot, Blau, Grün, Gelb, dazu je 4 Zauberer und Narren.</li>
        <li>In Runde 1 bekommt jeder 1 Karte, in Runde 2 zwei Karten usw. – Rundenzahl: 60 ÷ Spielerzahl.</li>
        <li>Die nächste Karte vom Stapel wird aufgedeckt und bestimmt Trumpf. In der letzten Runde gibt es keinen Trumpf.</li>
        <li>Links vom Geber beginnend sagt jeder an, wie viele Stiche er machen wird.</li>
        <li>Links vom Geber wird ausgespielt. Farbe muss bedient werden – Zauberer und Narren dürfen immer gespielt werden.</li>
        <li>Der Geber wechselt im Uhrzeigersinn.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Wer gewinnt den Stich?</h2>
      <ul class="small">
        <li>Der <b>erste Zauberer</b> im Stich gewinnt immer.</li>
        <li>Sonst gewinnt der <b>höchste Trumpf</b>, sonst die <b>höchste Karte der ausgespielten Farbe</b>.</li>
        <li><b>Narren</b> verlieren immer. Besteht ein Stich nur aus Narren, gewinnt der erste Narr.</li>
        <li>Wird ein Zauberer ausgespielt, darf jeder beliebig zugeben. Wird ein Narr ausgespielt, bestimmt die nächste Farbkarte die Farbe.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Wertung</h2>
      <ul class="small">
        <li><b>Ansage getroffen:</b> 20 Punkte + 10 Punkte pro Stich</li>
        <li><b>Daneben:</b> −10 Punkte pro Stich Abweichung (egal ob zu viel oder zu wenig)</li>
      </ul>
      <p class="small muted" style="margin:6px 0 0">Beispiel: 2 angesagt, 2 gemacht → 40 Punkte. 2 angesagt, 4 gemacht → −20 Punkte.</p>
    </div>

    <div class="card">
      <h2>Sonderkarten</h2>
      <p class="small muted" style="margin-top:0">Alle Sonderkarten sind optional – mischt nur die ein, die ihr mögt.</p>
      ${rule('🐉', 'Drache', 'Darf immer gespielt werden und ist die höchste Karte – schlägt sogar Zauberer. Nur die Fee besiegt ihn.')}
      ${rule('🧚', 'Fee', 'Darf immer gespielt werden und ist die niedrigste Karte. Liegt aber der Drache im Stich, gewinnt die Fee.')}
      ${rule('💣', 'Bombe', 'Den Stich mit der Bombe gewinnt niemand – er zählt für keine Ansage. In der App unter „Stiche ohne Gewinner“ eintragen.')}
      ${rule('☁️', 'Wolke', 'Wert 9¾. Wer den Stich mit der Wolke gewinnt, muss seine Ansage um 1 erhöhen oder verringern. In der App über „☁︎ ±1“ eintragen.')}
      ${rule('🤹', 'Jongleur', 'Wert 7½. Nach dem Stich mit dem Jongleur gibt jeder gleichzeitig eine Handkarte verdeckt an den linken Nachbarn weiter.')}
      ${rule('🐺', 'Werwolf', 'Wer ihn zu Rundenbeginn hat, tauscht ihn gegen die Trumpfkarte und bestimmt die Trumpffarbe – oder dass ohne Trumpf gespielt wird.')}
      ${rule('🎭', 'Gestaltwandler', 'Beim Ausspielen entscheidest du, ob er als Zauberer oder als Narr zählt.')}
      ${rule('🧙‍♀️', 'Hexe', 'Mit der Hexe tauschst du eine deiner Handkarten mit einer Karte aus dem Stich. Details im Regelheft.', 'neu')}
      ${rule('🧛', 'Vampir', 'Kopiert die aufgedeckte Trumpfkarte – liegt dort eine Sonderkarte, übernimmt er alle ihre Effekte. Liegt dort der Werwolf, wird sofort eine neue Trumpfkarte aufgedeckt. Eröffnet der Vampir den Stich, gelten die Bedienregeln der kopierten Karte.', 'neu')}
    </div>
    <p class="small muted center">Kurzfassung ohne Gewähr – im Zweifel gilt das Regelheft von AMIGO.</p>`;

  return { title: 'Regeln', html };
}

/* =========================================================
   Aktionen
   ========================================================= */
const actions = {
  home: () => go('home'),
  rules: () => go('rules', { back: state.view }),
  resume: () => go('game'),

  'new-game': async () => {
    if (state.game) {
      const ok = await ask('Neues Spiel starten?', 'Das laufende Spiel wird verworfen.', [
        { label: 'Verwerfen & neu starten', cls: 'danger', value: true },
        { label: 'Abbrechen', value: false },
      ]);
      if (!ok) return;
    }
    startDraft();
    go('setup');
  },

  'p-add': () => {
    if (state.draft.players.length < MAX_PLAYERS) state.draft.players.push('');
    render();
    const inputs = app.querySelectorAll('[data-name]');
    inputs[inputs.length - 1]?.focus();
  },
  'p-del': ({ i }) => {
    if (state.draft.players.length > MIN_PLAYERS) state.draft.players.splice(+i, 1);
    render();
  },
  'p-up': ({ i }) => {
    const p = state.draft.players;
    const k = +i;
    if (k > 0) [p[k - 1], p[k]] = [p[k], p[k - 1]];
    render();
  },
  'dealer-random': () => {
    state.draft.dealer0 = Math.floor(Math.random() * state.draft.players.length);
    render();
    const d = state.draft;
    toast(`${d.players[d.dealer0] || `Spieler ${d.dealer0 + 1}`} gibt zuerst`);
  },

  'start-game': () => {
    const d = state.draft;
    const players = d.players.map((n, i) => n.trim() || `Spieler ${i + 1}`);
    store.set('wz.lastPlayers', players);
    store.set('wz.lastOpts', d.opts);
    state.game = {
      id: Date.now().toString(36),
      createdAt: Date.now(),
      players,
      dealer0: d.dealer0,
      rounds: d.rounds,
      opts: { ...d.opts },
      done: [],
      cur: null,
    };
    state.game.cur = newRound(state.game);
    save();
    go('game', { tab: 'round' });
  },

  tab: ({ tab }) => {
    state.tab = tab;
    render();
    window.scrollTo(0, 0);
  },

  inc: ({ kind, i }) => step(kind, +i, +1),
  dec: ({ kind, i }) => step(kind, +i, -1),

  adj: ({ i, v }) => {
    state.game.cur.adj[+i] = +v;
    save();
    render();
  },

  'all-hit': () => {
    const c = state.game.cur;
    c.tricks = c.bids.map((b, i) => Math.max(0, b + (c.adj[i] || 0)));
    save();
    render();
  },

  'to-tricks': () => {
    state.game.cur.phase = 'tricks';
    save();
    render();
    window.scrollTo(0, 0);
  },
  'to-bids': () => {
    state.game.cur.phase = 'bid';
    save();
    render();
  },

  'save-round': () => {
    const g = state.game;
    const c = g.cur;
    g.done.push({ bids: c.bids, tricks: c.tricks, adj: c.adj, noWinner: c.noWinner || 0, trump: c.trump });
    if (g.done.length >= g.rounds) {
      finishGame();
      return;
    }
    g.cur = newRound(g);
    save();
    render();
    window.scrollTo(0, 0);
    toast(`Runde ${g.done.length} gespeichert`);
  },

  'undo-round': async () => {
    const g = state.game;
    if (!g.done.length) return;
    const ok = await ask('Letzte Runde korrigieren?', `Runde ${g.done.length} wird wieder geöffnet. Eingaben der aktuellen Runde gehen verloren.`, [
      { label: 'Runde öffnen', cls: 'primary', value: true },
      { label: 'Abbrechen', value: false },
    ]);
    if (!ok) return;
    reopenLast(g);
  },

  reopen: () => {
    const g = state.history.shift();
    state.game = g;
    delete g.finishedAt;
    reopenLast(g);
  },

  trump: ({ id }) => {
    state.game.cur.trump = id || null;
    save();
    state.tab = 'round';
    render();
  },

  'show-history': ({ i }) => {
    state.viewing = +i;
    go('final');
  },

  'delete-history': async ({ i }) => {
    const ok = await ask('Spiel löschen?', 'Das Ergebnis wird aus dem Verlauf entfernt.', [
      { label: 'Löschen', cls: 'danger', value: true },
      { label: 'Abbrechen', value: false },
    ]);
    if (!ok) return;
    state.history.splice(+i, 1);
    save();
    go('home');
  },

  'clear-history': async () => {
    const ok = await ask('Verlauf löschen?', 'Alle gespeicherten Ergebnisse werden entfernt.', [
      { label: 'Alles löschen', cls: 'danger', value: true },
      { label: 'Abbrechen', value: false },
    ]);
    if (!ok) return;
    state.history = [];
    save();
    render();
  },

  rematch: async () => {
    const g = state.history[state.viewing];
    if (state.game) {
      const ok = await ask('Revanche starten?', 'Das laufende Spiel wird verworfen.', [
        { label: 'Verwerfen & neu starten', cls: 'danger', value: true },
        { label: 'Abbrechen', value: false },
      ]);
      if (!ok) return;
    }
    startDraft(g.players);
    state.draft.opts = { ...g.opts };
    state.draft.dealer0 = (g.dealer0 + 1) % g.players.length;
    if (g.rounds !== defaultRounds(g.players.length)) {
      state.draft.rounds = g.rounds;
      state.draft.roundsTouched = true;
    }
    go('setup');
  },
};

function reopenLast(g) {
  const r = g.done.pop();
  g.cur = { ...r, phase: 'tricks' };
  save();
  state.tab = 'round';
  go('game');
}

function finishGame() {
  const g = state.game;
  g.finishedAt = Date.now();
  delete g.cur;
  state.history.unshift(g);
  state.history = state.history.slice(0, 50);
  state.game = null;
  state.lastFinishedId = g.id;
  state.viewing = 0;
  save();
  go('final');
}

function step(kind, i, dir) {
  if (kind === 'rounds') {
    const d = state.draft;
    d.rounds = Math.min(30, Math.max(1, d.rounds + dir));
    d.roundsTouched = true;
    render();
    return;
  }

  const g = state.game;
  const c = g.cur;
  const n = roundNo(g);

  if (kind === 'noWinner') {
    c.noWinner = Math.min(2, n, Math.max(0, (c.noWinner || 0) + dir));
  } else if (kind === 'bid') {
    let v = c.bids[i];
    v = v === null ? (dir > 0 ? 1 : 0) : v + dir;
    v = Math.min(n, Math.max(0, v));
    // Verbotenen Wert des Gebers überspringen, wenn möglich
    const prev = c.bids[i];
    c.bids[i] = v;
    const forb = forbiddenBid(g);
    if (forb && forb.player === i && v === forb.value) {
      const skip = v + dir;
      if (skip >= 0 && skip <= n) c.bids[i] = skip;
      else if (prev !== null) c.bids[i] = prev;
    }
    // Wolke-Anpassung darf die Ansage nicht negativ machen
    if (c.bids[i] === 0 && c.adj[i] < 0) c.adj[i] = 0;
  } else if (kind === 'trick') {
    let v = c.tricks[i];
    v = v === null ? (dir > 0 ? 1 : 0) : v + dir;
    c.tricks[i] = Math.min(n, Math.max(0, v));
  }
  save();
  render();
}

/* ---------- Spielmenü ---------- */
async function openGameMenu() {
  const g = state.game;
  if (!g) return;
  const choice = await ask('Spiel', `${g.players.length} Spieler · Runde ${roundNo(g)} von ${g.rounds}`, [
    { label: '📖 Regeln & Sonderkarten', value: 'rules' },
    { label: '↩︎ Letzte Runde korrigieren', value: 'undo' },
    { label: '🏁 Spiel jetzt beenden', value: 'end' },
    { label: '🗑 Spiel verwerfen', cls: 'danger', value: 'discard' },
    { label: 'Schließen', value: null },
  ]);
  if (choice === 'rules') go('rules', { back: 'game' });
  if (choice === 'undo') {
    if (g.done.length) actions['undo-round']();
    else toast('Noch keine Runde gespielt');
  }
  if (choice === 'end') {
    if (!g.done.length) {
      toast('Noch keine Runde gespielt');
      return;
    }
    const ok = await ask('Spiel beenden?', `Das Spiel wird nach ${g.done.length} Runden gewertet. Die aktuelle Runde wird nicht gezählt.`, [
      { label: 'Beenden & auswerten', cls: 'primary', value: true },
      { label: 'Abbrechen', value: false },
    ]);
    if (ok) finishGame();
  }
  if (choice === 'discard') {
    const ok = await ask('Spiel verwerfen?', 'Das Spiel wird gelöscht und nicht im Verlauf gespeichert.', [
      { label: 'Verwerfen', cls: 'danger', value: true },
      { label: 'Abbrechen', value: false },
    ]);
    if (ok) {
      state.game = null;
      save();
      go('home');
    }
  }
}

/* ---------- Event-Delegation ---------- */
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn({ ...el.dataset });
});

app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.name !== undefined) {
    state.draft.players[+t.dataset.name] = t.value;
    // Namen in der Geber-Auswahl live aktualisieren, ohne neu zu rendern
    const opt = app.querySelector(`[data-dealer] option[value="${t.dataset.name}"]`);
    if (opt) opt.textContent = t.value || `Spieler ${+t.dataset.name + 1}`;
  }
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.opt) state.draft.opts[t.dataset.opt] = t.checked;
  if (t.hasAttribute('data-dealer')) state.draft.dealer0 = +t.value;
});

app.addEventListener('keydown', (e) => {
  // „Weiter“ auf der iOS-Tastatur springt zum nächsten Namensfeld
  if (e.key === 'Enter' && e.target.dataset.name !== undefined) {
    e.preventDefault();
    const next = app.querySelector(`[data-name="${+e.target.dataset.name + 1}"]`);
    if (next) next.focus();
    else e.target.blur();
  }
});

/* ---------- Start ---------- */
if (state.game && state.game.cur) state.view = 'game';
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
