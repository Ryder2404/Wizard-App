'use strict';

/* =========================================================
   Soundeffekte – komplett per Web Audio erzeugt (keine Dateien,
   funktioniert offline). Sfx.play(name) gibt die Dauer in Sekunden zurück.
   Hinweis: Auf dem iPhone sind diese Töne bei aktivem Lautlos-Schalter stumm.
   ========================================================= */
const Sfx = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /** Muss einmal aus einer Nutzeraktion (Tippen) heraus aufgerufen werden – iOS-Vorgabe. */
  function unlock() {
    const c = init();
    if (!c) return false;
    if (c.state !== 'running') c.resume();
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
    return c.state === 'running';
  }

  /* ---------- Bausteine ---------- */
  function gain(value = 0, dest = master) {
    const g = ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  /** Hüllkurve: schneller Anstieg, dann exponentielles Ausklingen. */
  function env(g, t, attack, peak, hold, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  function osc(type, freq, t, dur, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function noise(t, dur, dest) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    return s;
  }

  function filter(type, freq, q, dest) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  function distortion(amount, dest) {
    const ws = ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    ws.curve = curve;
    ws.connect(dest);
    return ws;
  }

  /* ---------- Effekte ---------- */
  const effects = {
    // Heller Glockenklang: Ansage getroffen
    glocke(t) {
      [[1318.5, 0], [1975.5, 0.12]].forEach(([f, dt]) => {
        const g = gain();
        env(g, t + dt, 0.005, 0.28, 0, 1.0);
        osc('sine', f, t + dt, 1.1, g);
        const g2 = gain();
        env(g2, t + dt, 0.005, 0.06, 0, 0.5);
        osc('sine', f * 2.76, t + dt, 0.6, g2);
      });
      return 1.1;
    },

    // Aufsteigendes Glitzern
    magie(t) {
      [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => {
        const g = gain();
        env(g, t + i * 0.06, 0.01, 0.13, 0, 0.5);
        osc('triangle', f, t + i * 0.06, 0.6, g);
      });
      const g = gain();
      env(g, t, 0.2, 0.05, 0.2, 0.5);
      noise(t, 0.9, filter('highpass', 6000, 0.7, g));
      return 0.9;
    },

    // Fanfare „da-da-da-daaa“
    tada(t) {
      const brass = (f, start, dur, vol) => {
        const g = gain();
        env(g, start, 0.03, vol, dur * 0.6, dur * 0.4 + 0.2);
        const lp = filter('lowpass', 800, 1, g);
        lp.frequency.setValueAtTime(700, start);
        lp.frequency.linearRampToValueAtTime(3200, start + 0.06);
        lp.frequency.linearRampToValueAtTime(1600, start + dur);
        osc('sawtooth', f, start, dur + 0.2, lp);
        osc('sawtooth', f * 1.004, start, dur + 0.2, lp);
      };
      brass(392, t, 0.11, 0.14);
      brass(392, t + 0.14, 0.11, 0.14);
      brass(392, t + 0.28, 0.11, 0.14);
      brass(523.3, t + 0.42, 0.9, 0.16);
      brass(659.3, t + 0.42, 0.9, 0.09);
      brass(784, t + 0.42, 0.9, 0.08);
      return 1.6;
    },

    // Traurige Posaune „wah wah wah waaah“
    wahwah(t) {
      const notes = [[311, 0, 0.38], [294, 0.45, 0.38], [277, 0.9, 0.38], [262, 1.35, 1.0]];
      notes.forEach(([f, dt, dur], i) => {
        const start = t + dt;
        const g = gain();
        env(g, start, 0.04, 0.2, dur * 0.7, dur * 0.3);
        const lp = filter('lowpass', 500, 5, g);
        lp.frequency.setValueAtTime(350, start);
        lp.frequency.linearRampToValueAtTime(1300, start + dur * 0.5);
        lp.frequency.linearRampToValueAtTime(500, start + dur);
        const o = osc('sawtooth', f, start, dur, lp);
        if (i === notes.length - 1) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 6;
          depth.gain.value = 7;
          lfo.connect(depth);
          depth.connect(o.frequency);
          lfo.start(start);
          lfo.stop(start + dur + 0.1);
        }
      });
      return 2.45;
    },

    // Explosion
    bumm(t) {
      const g = gain();
      env(g, t, 0.005, 0.9, 0.05, 1.3);
      const lp = filter('lowpass', 3000, 0.8, g);
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(80, t + 1.2);
      noise(t, 1.4, lp);
      const g2 = gain();
      env(g2, t, 0.005, 0.9, 0.05, 0.6);
      const o = osc('sine', 110, t, 0.7, g2);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.5);
      return 1.4;
    },

    // Drachenbrüllen
    drache(t) {
      const out = gain();
      env(out, t, 0.25, 0.75, 0.9, 1.0);
      const lp = filter('lowpass', 2200, 0.7, out);
      const dist = distortion(30, lp);

      // Knurren: Amplitudenmodulation
      const growl = ctx.createGain();
      growl.gain.value = 0.6;
      growl.connect(dist);
      const am = ctx.createOscillator();
      const amDepth = ctx.createGain();
      am.frequency.value = 28;
      amDepth.gain.value = 0.4;
      am.connect(amDepth);
      amDepth.connect(growl.gain);
      am.start(t);
      am.stop(t + 2.3);

      [88, 91.5].forEach((f) => {
        const o = osc('sawtooth', f, t, 2.2, growl);
        o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.6);
        o.frequency.linearRampToValueAtTime(f * 0.7, t + 2.1);
        const vib = ctx.createOscillator();
        const vd = ctx.createGain();
        vib.frequency.value = 7;
        vd.gain.value = 6;
        vib.connect(vd);
        vd.connect(o.frequency);
        vib.start(t);
        vib.stop(t + 2.3);
      });

      const bp = filter('bandpass', 300, 1.2, growl);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.linearRampToValueAtTime(900, t + 0.6);
      bp.frequency.linearRampToValueAtTime(250, t + 2.1);
      noise(t, 2.2, bp);
      return 2.2;
    },

    // Hämisches „Muahahaha“
    lachen(t) {
      const syllable = (start, dur, f0, f1, vol, fromU) => {
        const g = gain();
        env(g, start, 0.02, vol, dur * 0.4, dur * 0.6);
        const f1Start = fromU ? 350 : 750;
        [[f1Start, 750, 6, 1], [fromU ? 800 : 1150, 1150, 8, 0.55], [2500, 2500, 10, 0.2]].forEach(([fa, fb, q, amp]) => {
          const a = gain(amp, g);
          const bp = filter('bandpass', fa, q, a);
          bp.frequency.setValueAtTime(fa, start);
          bp.frequency.linearRampToValueAtTime(fb, start + dur * 0.5);
          const o = osc('sawtooth', f0, start, dur + 0.1, bp);
          o.frequency.linearRampToValueAtTime(f1, start + dur);
        });
        // Hauchlaut „h“
        const h = gain();
        env(h, start - 0.03, 0.01, vol * 0.5, 0.02, 0.05);
        noise(start - 0.03, 0.1, filter('bandpass', 1500, 1, h));
      };
      syllable(t + 0.03, 0.34, 150, 200, 0.5, true);
      const pitches = [215, 205, 195, 182, 170, 158];
      pitches.forEach((f, i) => syllable(t + 0.45 + i * 0.17, 0.13, f, f * 0.93, 0.5 - i * 0.04, false));
      return 1.65;
    },

    // Trommelwirbel mit Beckenschlag
    trommel(t) {
      const rollEnd = 1.3;
      for (let dt = 0; dt < rollEnd; dt += 0.038) {
        const vol = 0.06 + (dt / rollEnd) * 0.3;
        const g = gain();
        env(g, t + dt, 0.003, vol, 0, 0.07);
        noise(t + dt, 0.1, filter('bandpass', 2500, 0.8, g));
        const g2 = gain();
        env(g2, t + dt, 0.003, vol * 0.6, 0, 0.05);
        osc('triangle', 190, t + dt, 0.08, g2);
      }
      const crash = t + rollEnd + 0.05;
      const g = gain();
      env(g, crash, 0.005, 0.45, 0, 1.3);
      noise(crash, 1.4, filter('highpass', 5000, 0.5, g));
      const g2 = gain();
      env(g2, crash, 0.005, 0.7, 0, 0.4);
      const o = osc('sine', 120, crash, 0.5, g2);
      o.frequency.exponentialRampToValueAtTime(55, crash + 0.4);
      return rollEnd + 0.9;
    },
  };

  function play(name) {
    const c = init();
    const fx = effects[name];
    if (!c || !fx) return 0;
    if (c.state !== 'running') c.resume();
    return fx(c.currentTime + 0.03);
  }

  return { unlock, play, names: Object.keys(effects) };
})();
