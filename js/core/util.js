/* THE DARK ROOM — utilitários e barramento de eventos */
(function () {
  const DR = (window.DR = window.DR || {});

  DR.util = {
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    smoothstep(e0, e1, x) {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };

  // Barramento de eventos muito simples (desacopla UI, níveis e componentes)
  const handlers = {};
  DR.bus = {
    on(evt, fn) {
      (handlers[evt] = handlers[evt] || []).push(fn);
      return () => DR.bus.off(evt, fn);
    },
    off(evt, fn) {
      handlers[evt] = (handlers[evt] || []).filter((f) => f !== fn);
    },
    emit(evt, data) {
      (handlers[evt] || []).slice().forEach((f) => {
        try { f(data); } catch (e) { console.error('[bus:' + evt + ']', e); }
      });
    },
  };
})();
