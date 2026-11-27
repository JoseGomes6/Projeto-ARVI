/* THE DARK ROOM — entradas unificadas: teclado/rato/toque (DEMO), controladores e select (WebXR).
 * Tudo é convertido em eventos do barramento: action, torch-toggle, cancel, help, key. */
(function () {
  const DR = window.DR;
  let last = 0;
  const isCoarse = () => window.matchMedia && matchMedia('(pointer: coarse)').matches;

  function action() {
    const now = performance.now();
    if (now - last < 160) return;
    last = now;
    DR.bus.emit('action');
  }

  DR.input = {
    isLocked: () => !!document.pointerLockElement,
    init(scene) {
      const canvasReady = () => scene.canvas;
      window.addEventListener('keydown', (e) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.repeat) return;
        switch (e.code) {
          case 'KeyE': case 'Space': e.preventDefault(); action(); break;
          case 'KeyF': DR.bus.emit('torch-toggle'); break;
          case 'KeyM': DR.bus.emit('mute-toggle'); break;
          case 'KeyG': DR.bus.emit('hint'); break;
          case 'KeyQ': case 'KeyX': DR.bus.emit('cancel'); break;
          case 'KeyH': case 'F1': e.preventDefault(); DR.bus.emit('help'); break;
          case 'Enter': DR.bus.emit('key', { key: 'enter' }); break;
          case 'Backspace': DR.bus.emit('key', { key: 'back' }); break;
          default:
            if (/^(Digit|Numpad)\d$/.test(e.code)) DR.bus.emit('key', { key: e.code.slice(-1) });
        }
      });

      const bindCanvas = () => {
        const c = canvasReady();
        if (!c) return;
        c.addEventListener('click', () => {
          if (scene.is('vr-mode') || scene.is('ar-mode')) return;
          const st = DR.state;
          const playing = st.phase === 'playing' || st.phase === 'placing';
          if (playing && !isCoarse() && !document.pointerLockElement) {
            // primeiro clique: captura o rato (olhar tipo FPS)
            if (c.requestPointerLock) c.requestPointerLock();
            return;
          }
          action();
        });
      };
      if (scene.canvas) bindCanvas(); else scene.addEventListener('render-target-loaded', bindCanvas);

      // roda do rato: foco do feixe
      window.addEventListener('wheel', (e) => DR.bus.emit('torch-focus', { delta: Math.sign(e.deltaY) }), { passive: true });

      // WebXR
      const onXR = () => {
        const session = scene.renderer.xr.getSession();
        if (!session) return;
        session.addEventListener('select', action);
        session.addEventListener('squeezestart', () => DR.bus.emit('torch-toggle'));
      };
      scene.addEventListener('enter-vr', onXR);
      // Comandos Touch (Quest):
      //   gatilho = usar/marcar · grip = lanterna · A = dica (ou concluir marcação) · B = fechar/desfazer
      //   X = menu 3D (ou concluir marcação) · Y = som · stick esq. = andar · stick dir. = rodar
      const hr = document.getElementById('handR'), hl = document.getElementById('handL');
      if (hr) {
        hr.addEventListener('abuttondown', () => DR.bus.emit(DR.state.phase === 'placing' ? 'help' : 'hint'));
        hr.addEventListener('bbuttondown', () => DR.bus.emit('cancel'));
      }
      if (hl) {
        hl.addEventListener('xbuttondown', () => DR.bus.emit('help'));
        hl.addEventListener('ybuttondown', () => DR.bus.emit('mute-toggle'));
      }
    },
  };
})();
