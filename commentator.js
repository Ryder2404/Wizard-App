'use strict';

/* =========================================================
   Kommentator: erkennt Situationen nach jeder Runde und gibt
   einen passenden Spruch als Sprechblase + Stimme + Soundeffekte aus.

   Spruch-Syntax:
     {name}        Platzhalter (siehe analyze())
     [lachen]      Soundeffekt (siehe sfx.js)
     {{Drache!}}   dramatisch langsam gesprochen, in der Blase in GROSSBUCHSTABEN
   ========================================================= */
const Commentator = (() => {
  const SFX_EMOJI = {
    lachen: '😈', drache: '🐉', bumm: '💥', wahwah: '🎺',
    tada: '🎉', magie: '✨', trommel: '🥁', glocke: '🔔',
  };

  /* ---------- Sprüche ---------- */
  const LINES = {
    start: [
      'Willkommen zu einer neuen Partie Wizard! Möge der Stich mit euch sein. [magie]',
      'Die Karten sind gemischt, die Zauberer sind wach. {names}: Viel Glück. Ihr werdet es brauchen. [lachen]',
      'Achtung, Achtung! Hier spricht euer Kommentator. Ich sehe alles. Ich vergesse nichts. Und ich lache gerne. [lachen]',
      '{dealer} gibt zuerst. Ein verantwortungsvolles Amt. Bitte nicht vermasseln. [magie]',
      '[trommel] Meine Damen und Herren, das Spiel beginnt! Heute im Ring: {names}.',
    ],

    bombOne: [
      'Wurde {names} da etwa von der Bombe hopps genommen? [lachen] Da kann wohl nur noch einer helfen: Der {{Drache!}} [drache]',
      '[bumm] Die Bombe ist hochgegangen! Und in den Trümmern liegt … die Ansage von {names}. [lachen]',
      'Ein Stich, den keiner will, und eine Ansage, die keiner schafft. {names}, die Bombe hat heute ganze Arbeit geleistet. [bumm]',
      '[bumm] Das hat gerummst! {names} sucht noch nach den Einzelteilen der eigenen Ansage. [lachen]',
    ],
    bombMany: [
      'Wurden {names} da etwa von der Bombe hopps genommen? [lachen] Da kann wohl nur noch einer helfen: Der {{Drache!}} [drache]',
      '[bumm] Die Bombe ist hochgegangen! Und in den Trümmern liegen … die Ansagen von {names}. [lachen]',
      '[bumm] Kollateralschaden! Erwischt hat es {names}. Mein Beileid. Nicht wirklich. [lachen]',
      'Die Bombe schlägt zu, und {names} stehen mit rußigen Gesichtern da. [bumm] Schöne Frisuren übrigens. [lachen]',
    ],
    bombSafe: [
      'Die Bombe ist geplatzt, aber alle haben es überlebt. Respekt! [bumm]',
      '[bumm] Eine Explosion, und trotzdem stimmen alle Ansagen. Ihr seid wohl feuerfest.',
    ],

    allHit: [
      'Alle haben ihre Ansage getroffen! Das ist entweder pures Können, oder ihr habt geschummelt. [glocke]',
      'Eine perfekte Runde! Niemand hat sich blamiert. Wie langweilig. [tada]',
      'Alle Ansagen erfüllt. Ich bin fast ein bisschen enttäuscht. Ich hatte mich schon aufs Lachen gefreut.',
      'Hundert Prozent Trefferquote! Ist das hier Wizard oder ein Hellseher-Kongress? [magie]',
      'Alle getroffen! [glocke] Genießt es. So etwas kommt nicht oft vor.',
    ],
    allMiss: [
      'Niemand. Wirklich niemand hat seine Ansage geschafft. [wahwah] Ein kollektives Versagen historischen Ausmaßes.',
      'Alle daneben! [lachen] Ich schlage vor, ihr spielt ab jetzt Mau-Mau.',
      'Eine Runde voller Verlierer. Und ich meine: alle. [wahwah]',
      'Alle haben sich verzockt. [lachen] Das nenne ich Teamgeist!',
    ],

    bigMiss: [
      '{name} wollte {bidW} und hat {tricksW} bekommen. Das ist nicht daneben, das ist in einem anderen Bundesland! [wahwah]',
      '{diff} Stiche daneben, {name}! [lachen] Hast du deine Karten überhaupt angeschaut?',
      '{pts} Punkte für {name}. Autsch. Das tut sogar mir weh, und ich bin nur eine Stimme. [wahwah]',
      '{name}, ich mache mir langsam Sorgen. {diff} Stiche daneben. Soll ich einen Arzt rufen? [lachen]',
    ],
    zeroFail: [
      '{name} hat null Stiche angesagt und trotzdem {tricksW} bekommen. Die Stiche lieben dich einfach, {name}! [lachen]',
      'Null angesagt, {tricksW} kassiert. {name}, das Ziel war es, NICHTS zu tun. Nicht mal das klappt. [wahwah]',
      '{name} wollte heimlich unter dem Radar fliegen. Das Radar hat gewonnen. [lachen]',
    ],
    highHit: [
      '{name} sagt {bidW} an und liefert genau {bidW}. [tada] Selbstvertrauen mit Substanz!',
      'Wow! {pts} Punkte für {name}. Verneigt euch vor dem Oberzauberer! [magie]',
      '{bidW} angesagt, {bidW} gemacht. {name}, du bist mir unheimlich. Ich behalte dich im Auge. [magie]',
    ],
    cloudHit: [
      'Die Wolke hat {name} zum Umplanen gezwungen, und es hat trotzdem gepasst. Wolkig, mit Aussicht auf Punkte! [glocke]',
      '{name} hat die Wolke erwischt und trotzdem getroffen. Da hat jemand den Wetterbericht gelesen. [magie]',
    ],
    cloudMiss: [
      '{name} hatte die Wolke im Stich, und jetzt ist die Ansage vernebelt. [lachen]',
      'Wolke gezogen, Überblick verloren. {name}, heute leider nur trübe Aussichten. [wahwah]',
    ],

    leaderChange: [
      '[trommel] Wir haben einen neuen Spitzenreiter: {leader}! Mit {total} Punkten. Genieß es, solange es dauert.',
      '{leader} übernimmt die Führung! [tada] {prev}, das lässt du dir doch nicht gefallen, oder?',
      'Machtwechsel an der Spitze! [trommel] {leader} sitzt jetzt auf dem Thron. Wackelig, aber immerhin.',
    ],
    missStreak: [
      '{name} liegt jetzt schon {streak} Runden in Folge daneben. [wahwah] Das ist keine Pechsträhne mehr, das ist ein Lebensstil.',
      '{streak} mal hintereinander verfehlt, {name}. Vielleicht einfach mal das Gegenteil von dem ansagen, was du denkst? [lachen]',
      'Bitte ein bisschen Mitleid für {name}. {streak} Runden ohne Treffer. [wahwah] … Okay, das Mitleid ist vorbei. [lachen]',
    ],
    hitStreak: [
      '{name} trifft jetzt schon {streak} Runden in Folge. Ich glaube, {name} kann eure Karten sehen. [magie]',
      '{streak} Treffer am Stück! {name} ist heute nicht zu stoppen. Oder doch? Ein Zauberer zur rechten Zeit wirkt Wunder. [magie]',
    ],
    negative: [
      '{name} ist jetzt im Minus. [wahwah] Minus {absTotal} Punkte. So tief unten wohnen sonst nur die Narren.',
      'Kontostand von {name}: minus {absTotal}. Ich würde sagen: Die Bank ruft gleich an. [lachen]',
    ],
    comeback: [
      '{name} klettert {up} Plätze nach oben! [tada] Ein Comeback wie im Bilderbuch.',
      'Seht mal, wer da von hinten angerauscht kommt: {name}! {up} Plätze gutgemacht. [magie]',
    ],
    overbid: [
      '{sumBids} Stiche angesagt bei nur {cards} Karten. Ihr wart gierig, und die Gier wurde bestraft. [lachen]',
      'Zusammen {sumBids} Stiche angesagt, bei {cards} Karten. Das Mathe-Abitur habt ihr aber schon, oder? [wahwah]',
    ],
    underbid: [
      'Ihr habt zusammen nur {sumBids} Stiche angesagt, bei {cards} Karten. Irgendwer musste die ja nehmen. [lachen]',
    ],
    singleMiss: [
      'Alle haben es geschafft. Außer {names}. [lachen] Einen gibt es immer.',
      'Fast eine perfekte Runde. Fast. Danke, {names}. [wahwah]',
      '{names} hat sich als einzige Person verzockt. Nicht so gucken, das haben alle gesehen. [lachen]',
    ],
    multiMiss: [
      '{names} haben ihre Ansagen verfehlt. Ich hoffe, ihr hattet wenigstens Spaß dabei. [lachen]',
      'Heute im Angebot: Enttäuschung. Abgeholt von {names}. [wahwah]',
      '{names}: Das war nix. Beim nächsten Mal einfach richtig ansagen. So schwer kann das doch nicht sein! [lachen]',
      'Die Verlierer dieser Runde heißen {names}. Applaus! Nein, wartet, das ist kein Applaus. Das bin ich, wie ich lache. [lachen]',
    ],
    firstRound: [
      'Die erste Runde ist geschafft. Nur eine Karte, und schon Drama. [lachen]',
      'Runde eins ist durch. Aufwärmen beendet, ab jetzt wird es ernst. [magie]',
    ],
    neutral: [
      'Runde {n} ist vorbei. {leader} führt mit {total} Punkten. Weiter geht es! [magie]',
      'Weiter im Text. {leader} vorne, {last} hinten. So weit, so erwartbar.',
      'Zwischenstand gefällig? {leader} führt. Und {last}… naja, {last} ist auch dabei. [lachen]',
    ],
    finalNext: [
      '[trommel] Achtung: Jetzt kommt die letzte Runde! Alles oder nichts.',
      'Letzte Runde, Leute. Jetzt zeigt sich, wer der wahre Zauberer ist. [magie]',
    ],

    endNormal: [
      '[trommel] Das Spiel ist vorbei! Der Sieger heißt: {{{winner}!}} [tada] Mit {winnerTotal} Punkten. Herzlichen Glückwunsch!',
      'Und der große Zauberer des Abends ist … [trommel] {{{winner}!}} [tada] {last}, du warst auch dabei. Irgendwie.',
    ],
    endClose: [
      'Was für ein Finale! Nur {margin} Punkte Unterschied! [trommel] Doch am Ende gewinnt {{{winner}!}} [tada] {second}, das war knapp. So knapp. [lachen]',
    ],
    endLandslide: [
      '{winner} gewinnt mit {margin} Punkten Vorsprung. [tada] Das war kein Spiel, das war eine Machtdemonstration. [drache]',
      '[trommel] {{{winner}!}} [tada] Mit sagenhaften {margin} Punkten Vorsprung. Die anderen dürfen jetzt aufräumen. [lachen]',
    ],
    endTie: [
      'Unentschieden an der Spitze! {winners} teilen sich den Sieg. [tada] Wie romantisch.',
    ],
  };

  /* ---------- Einstellungen ---------- */
  const SETTINGS_KEY = 'wz.commentator';
  const settings = { on: true, voice: true, sfx: true, voiceURI: '' };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch { /* egal */ }

  function set(key, value) {
    settings[key] = value;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* egal */ }
    if (!settings.on) stop();
  }

  /* ---------- Stimme ---------- */
  const synth = window.speechSynthesis || null;
  let voices = [];
  const api = { settings, set, onVoices: null };

  function loadVoices() {
    if (!synth) return;
    const list = synth.getVoices().filter((v) => /^de/i.test(v.lang));
    const changed = list.length !== voices.length;
    voices = list;
    if (changed && api.onVoices) api.onVoices();
  }
  if (synth) {
    loadVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
    setTimeout(loadVoices, 800);
  }

  function pickVoice() {
    if (settings.voiceURI) {
      const v = voices.find((x) => x.voiceURI === settings.voiceURI);
      if (v) return v;
    }
    const score = (v) => (/premium|enhanced|erweitert/i.test(v.name) ? 4 : 0)
      + (v.lang === 'de-DE' ? 1 : 0) + (v.localService ? 1 : 0);
    return voices.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }

  /* iOS gibt Ton und Sprache erst nach einer Nutzeraktion frei. */
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    const audioOk = Sfx.unlock();
    if (synth) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    }
    unlocked = audioOk;
  }
  ['touchend', 'click'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));

  /* ---------- Sprechblase ---------- */
  const bubble = document.createElement('div');
  bubble.id = 'bubble';
  bubble.setAttribute('role', 'status');
  bubble.innerHTML = `
    <div class="b-avatar" aria-hidden="true">🧙‍♂️</div>
    <div class="b-text"></div>
    <div class="b-actions">
      <button class="b-btn" data-b="replay" aria-label="Nochmal abspielen">↻</button>
      <button class="b-btn" data-b="close" aria-label="Schließen">✕</button>
    </div>`;
  document.body.appendChild(bubble);

  let hideTimer;
  let lastParts = null;

  bubble.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    if (b.dataset.b === 'close') hide();
    if (b.dataset.b === 'replay' && lastParts) perform(lastParts);
  });

  function show(text) {
    clearTimeout(hideTimer);
    bubble.querySelector('.b-text').textContent = text;
    bubble.classList.remove('show');
    void bubble.offsetWidth; // Animation neu starten
    bubble.classList.add('show');
  }

  function hide() {
    stop();
    clearTimeout(hideTimer);
    bubble.classList.remove('show');
  }

  /* ---------- Abspielen ---------- */
  let token = 0;

  function stop() {
    token++;
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }

  function perform(parts) {
    stop();
    const my = token;
    let i = 0;
    const next = () => {
      if (my !== token) return;
      if (i >= parts.length) {
        hideTimer = setTimeout(() => bubble.classList.remove('show'), 6000);
        return;
      }
      const p = parts[i++];
      if (p.t === 'sfx') {
        if (!settings.sfx) { next(); return; }
        const dur = Sfx.play(p.name);
        setTimeout(next, Math.max(0, dur * 1000 - 150));
        return;
      }
      if (!settings.voice || !synth) {
        // Ohne Stimme trotzdem kurz Zeit lassen, damit Effekte nicht aufeinanderprallen
        setTimeout(next, settings.sfx ? 250 : 0);
        return;
      }
      const u = new SpeechSynthesisUtterance(p.text);
      u.lang = 'de-DE';
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = p.slow ? 0.65 : 1;
      u.pitch = p.slow ? 0.6 : 1;
      let done = false;
      let guard;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        next();
      };
      u.onend = finish;
      u.onerror = finish;
      // Sicherheitsnetz: iOS feuert „onend“ nicht immer zuverlässig
      guard = setTimeout(finish, 2000 + (p.text.length * 95) / u.rate);
      synth.speak(u);
    };
    next();
  }

  function clean(s) {
    return String(s).replace(/[[\]{}]/g, '');
  }

  function build(template, vars) {
    const text = template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? clean(vars[k]) : m));
    const parts = [];
    const say = (s) => {
      const t = s.trim();
      if (t) parts.push({ t: 'say', text: t });
    };
    const re = /\[(\w+)\]|\{\{(.+?)\}\}/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      say(text.slice(last, m.index));
      if (m[1]) parts.push({ t: 'sfx', name: m[1] });
      else parts.push({ t: 'say', text: m[2], slow: true });
      last = re.lastIndex;
    }
    say(text.slice(last));
    const display = parts
      .map((p) => (p.t === 'sfx' ? SFX_EMOJI[p.name] || '' : p.slow ? p.text.toUpperCase() : p.text))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { parts, display };
  }

  function say(template, vars) {
    if (!settings.on) return false;
    const { parts, display } = build(template, vars);
    lastParts = parts;
    show(display);
    perform(parts);
    return true;
  }

  /* ---------- Situationen erkennen ---------- */
  function list(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
  }

  function stiche(x) {
    if (x === 0) return 'keinen Stich';
    if (x === 1) return 'einen Stich';
    return `${x} Stiche`;
  }

  function isHit(r, i) {
    return r.tricks[i] === r.bids[i] + (r.adj[i] || 0);
  }

  function streak(g, i, wantHit) {
    let s = 0;
    for (let k = g.done.length - 1; k >= 0 && isHit(g.done[k], i) === wantHit; k--) s++;
    return s;
  }

  function analyze(g) {
    const k = g.done.length;
    const r = g.done[k - 1];
    const P = g.players.length;
    const name = (i) => g.players[i];
    const pts = roundPoints(r);
    const target = r.bids.map((b, i) => b + (r.adj[i] || 0));
    const idx = g.players.map((_, i) => i);
    const miss = idx.filter((i) => !isHit(r, i));
    const hit = idx.filter((i) => isHit(r, i));
    const before = ranking({ players: g.players, done: g.done.slice(0, k - 1) });
    const after = ranking(g);
    const leader = after.order[0];

    const base = {
      n: k,
      cards: k,
      names: list(miss.map(name)),
      leader: name(leader),
      total: after.totals[leader],
      last: name(after.order[P - 1]),
      sumBids: r.bids.reduce((a, b) => a + b, 0),
    };
    const pv = (i) => ({
      name: name(i),
      bidW: stiche(target[i]),
      tricksW: stiche(r.tricks[i]),
      diff: Math.abs(r.tricks[i] - target[i]),
      pts: pts[i],
    });
    const maxBy = (arr, f) => arr.reduce((best, i) => (best === null || f(i) > f(best) ? i : best), null);

    const c = [];
    const add = (key, prio, vars = {}) => c.push({ key, prio, vars: { ...base, ...vars } });

    if (g.opts.specials && r.noWinner > 0) {
      if (miss.length === 1) add('bombOne', 95);
      else if (miss.length > 1) add('bombMany', 95);
      else add('bombSafe', 88);
    }
    if (miss.length === P) add('allMiss', 90);
    if (!miss.length) add('allHit', 85);

    const big = maxBy(miss, (i) => Math.abs(r.tricks[i] - target[i]));
    if (big !== null && Math.abs(r.tricks[big] - target[big]) >= 3) add('bigMiss', 80, pv(big));

    const zero = maxBy(miss.filter((i) => target[i] === 0), (i) => r.tricks[i]);
    if (zero !== null) add('zeroFail', 70, pv(zero));

    const high = maxBy(hit.filter((i) => target[i] >= 3 && target[i] >= Math.ceil(k / 2)), (i) => target[i]);
    if (high !== null) add('highHit', 62, pv(high));

    if (g.opts.specials) {
      const clouded = idx.filter((i) => r.adj[i]);
      const cm = clouded.find((i) => !isHit(r, i));
      const ch = clouded.find((i) => isHit(r, i));
      if (cm !== undefined) add('cloudMiss', 65, pv(cm));
      if (ch !== undefined) add('cloudHit', 60, pv(ch));
    }

    const ms = maxBy(miss, (i) => streak(g, i, false));
    if (ms !== null && streak(g, ms, false) >= 3) add('missStreak', 75, { name: name(ms), streak: streak(g, ms, false) });
    const hs = maxBy(hit, (i) => streak(g, i, true));
    if (hs !== null && streak(g, hs, true) >= 4) add('hitStreak', 52, { name: name(hs), streak: streak(g, hs, true) });

    if (k >= 2) {
      const soleLeader = (rk) => rk.ranks.filter((x) => x === 1).length === 1;
      if (soleLeader(before) && soleLeader(after) && before.order[0] !== leader) {
        add('leaderChange', 72, { prev: name(before.order[0]) });
      }
      const neg = idx.find((i) => after.totals[i] < 0 && before.totals[i] >= 0);
      if (neg !== undefined) add('negative', 58, { name: name(neg), absTotal: -after.totals[neg] });
      const up = maxBy(idx, (i) => before.ranks[i] - after.ranks[i]);
      if (up !== null && before.ranks[up] - after.ranks[up] >= 2) {
        add('comeback', 55, { name: name(up), up: before.ranks[up] - after.ranks[up] });
      }
    }

    if (base.sumBids >= k + 2 && miss.length >= 2) add('overbid', 50);
    if (base.sumBids <= k - 2 && miss.length >= 2) add('underbid', 48);
    if (miss.length === 1 && P > 1) add('singleMiss', 40);
    if (miss.length >= 2 && miss.length < P) add('multiMiss', 30);
    if (k === 1) add('firstRound', 35);
    add('neutral', 10);
    return c;
  }

  function pickLine(g, key) {
    const arr = LINES[key];
    g.said = g.said || [];
    let free = arr.map((_, i) => i).filter((i) => !g.said.includes(`${key}:${i}`));
    if (!free.length) {
      g.said = g.said.filter((s) => !s.startsWith(`${key}:`));
      free = arr.map((_, i) => i);
    }
    const i = free[Math.floor(Math.random() * free.length)];
    g.said.push(`${key}:${i}`);
    return arr[i];
  }

  /* ---------- Öffentliche Schnittstelle ---------- */
  api.afterRound = (g) => {
    if (!settings.on || !g.done.length) return false;
    const cands = analyze(g);
    let best = null;
    let bestScore = -Infinity;
    cands.forEach((cand) => {
      const s = cand.prio + Math.random() * 18 - (cand.key === g.lastKey ? 40 : 0);
      if (s > bestScore) {
        best = cand;
        bestScore = s;
      }
    });
    g.lastKey = best.key;
    let line = pickLine(g, best.key);
    if (g.done.length === g.rounds - 1) line += ` ${pickLine(g, 'finalNext')}`;
    return say(line, best.vars);
  };

  api.gameStart = (g) => {
    if (!settings.on) return false;
    return say(pickLine(g, 'start'), { names: list(g.players), dealer: g.players[g.dealer0] });
  };

  api.gameEnd = (g) => {
    if (!settings.on || !g.done.length) return false;
    const { order, ranks, totals } = ranking(g);
    const winners = order.filter((i) => ranks[i] === 1);
    const second = order[1];
    const margin = second !== undefined ? totals[order[0]] - totals[second] : 0;
    let key = 'endNormal';
    if (winners.length > 1) key = 'endTie';
    else if (margin <= 20) key = 'endClose';
    else if (margin >= 100) key = 'endLandslide';
    return say(pickLine(g, key), {
      winner: g.players[order[0]],
      winners: list(winners.map((i) => g.players[i])),
      winnerTotal: totals[order[0]],
      second: second !== undefined ? g.players[second] : '',
      last: g.players[order[order.length - 1]],
      margin,
    });
  };

  api.sample = (names) => {
    const wasOn = settings.on;
    settings.on = true;
    say(LINES.bombMany[0], { names: list(names) });
    settings.on = wasOn;
  };

  api.voices = () => voices;
  api.hasSpeech = () => !!synth;
  api.stop = hide;
  return api;
})();
