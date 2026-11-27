/* THE DARK ROOM — áudio sintetizado (WebAudio, sem ficheiros externos) */
(function () {
  const DR = window.DR;
  let ctx = null, master = null, ambience = null, noiseBuf = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, when) {
    if (!ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq || 800; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  DR.audio = {
    unlock: ensure,
    startAmbience() {
      if (!ensure() || ambience) return;
      const out = ctx.createGain(); out.gain.value = 0.0001;
      out.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 4);
      out.connect(master);
      [43.6, 65.4, 98.1].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.04 + i * 0.03;
        const lg = ctx.createGain(); lg.gain.value = f * 0.01;
        lfo.connect(lg); lg.connect(o.frequency);
        const g = ctx.createGain(); g.gain.value = 0.12 / (i + 1);
        o.connect(g); g.connect(out); o.start(); lfo.start();
      });
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = 0.05;
      s.connect(f); f.connect(g); g.connect(out); s.start();
      ambience = out;
      // ruídos esporádicos (gotas / rangidos)
      const drip = () => {
        if (!ambience) return;
        tone(DR.util.rand(900, 1500), 0.25, 'sine', 0.04, 0, 400);
        setTimeout(drip, DR.util.rand(6000, 16000));
      };
      setTimeout(drip, 5000);
    },
    stopAmbience() {
      if (!ambience) return;
      ambience.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
      ambience = null;
    },
    /* ---- som espacial e mute ---- */
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    setListener(p, f) {
      if (!ctx) return;
      const L = ctx.listener;
      if (L.positionX) {
        L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
        L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    },
    /** "Tic" localizado no espaço: soa na direção da pista por descobrir. */
    tick3d(pos, gain) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain(), pn = ctx.createPanner();
      pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = 1; pn.rolloffFactor = 1.1;
      if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; }
      else pn.setPosition(pos.x, pos.y, pos.z);
      o.type = 'sine'; o.frequency.value = 1180;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g); g.connect(pn); pn.connect(master);
      o.start(t); o.stop(t + 0.15);
    },
    step() { noise(0.09, 0.07, 260); tone(70 + Math.random() * 20, 0.08, 'sine', 0.06); },
    hint() { tone(523, 0.5, 'sine', 0.1); tone(659, 0.7, 'sine', 0.08, 0.15); },
    click() { tone(900, 0.06, 'square', 0.05); },
    key() { tone(520, 0.07, 'triangle', 0.08); },
    torch(on) { noise(0.05, 0.15, 3000); tone(on ? 300 : 220, 0.08, 'square', 0.05); },
    reveal(p) { tone(180 + p * 380, 0.35, 'sine', 0.05 + p * 0.05); },
    found() { tone(392, 0.5, 'sine', 0.16); tone(587, 0.8, 'sine', 0.12, 0.12); tone(784, 1.2, 'sine', 0.08, 0.25); },
    collect() { tone(300, 0.2, 'triangle', 0.14, 0, 700); noise(0.12, 0.1, 1800); },
    place() { tone(150, 0.12, 'square', 0.12, 0, 90); noise(0.08, 0.12, 600); },
    error() { tone(120, 0.5, 'sawtooth', 0.18, 0, 70); noise(0.4, 0.12, 300); },
    unlock() {
      noise(0.5, 0.2, 400);
      [262, 330, 392, 523].forEach((f, i) => tone(f, 0.9, 'sine', 0.13, 0.2 + i * 0.13));
    },
    door() { noise(2.4, 0.25, 140); tone(55, 2.4, 'sawtooth', 0.12, 0, 40); },
    scare() { noise(0.7, 0.25, 200); tone(70, 0.8, 'sawtooth', 0.12, 0, 35); },
    heartbeat() { tone(55, 0.14, 'sine', 0.3); tone(48, 0.16, 'sine', 0.24, 0.2); },
  };
})();
