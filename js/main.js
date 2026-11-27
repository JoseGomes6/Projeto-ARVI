/* THE DARK ROOM — arranque: menu, deteção de WebXR, escolha do modo e do espaço, início do jogo. */
(function () {
  const $ = (id) => document.getElementById(id);
  const scene = $('scene');
  const params = new URLSearchParams(location.search);
  DR.debugReveal = params.has('reveal');             // ?reveal => todas as pistas visíveis (debug)
  const sel = { mode: 'demo', xrKind: 'ar', space: 'auto' };
  const xr = { ar: false, vr: false };

  /* ---------------- menu ---------------- */
  function refreshMenu() {
    document.querySelectorAll('.card').forEach((c) => {
      const on = c.dataset.mode === sel.mode;
      c.classList.toggle('selected', on); c.setAttribute('aria-checked', on);
    });
    const isXR = sel.mode === 'xr';
    $('opt-xrkind').hidden = !(isXR && xr.ar && xr.vr);
    $('lbl-auto').textContent = isXR ? 'Automático (AR hit-test)' : 'Aleatório';
    $('opt-dims').hidden = isXR && sel.space === 'auto';
    $('dim-random').parentElement.hidden = sel.space === 'manual';
    const hint = $('start-hint');
    hint.classList.remove('warn');
    if (isXR && !xr.ar && !xr.vr) {
      hint.textContent = 'WebXR não está disponível neste dispositivo. Usa o modo no computador.';
      hint.classList.add('warn');
    } else if (isXR) {
      const kind = xr.ar && (!xr.vr || sel.xrKind === 'ar') ? 'ar' : 'vr';
      hint.textContent = kind === 'ar'
        ? 'Em AR marcas as paredes e mesas da sala real, que fica às escuras à tua volta.'
        : 'Em VR a sala é virtual. O comando direito é a lanterna.';
    } else {
      hint.textContent = sel.space === 'manual'
        ? 'Define as dimensões da sala e marca onde queres as pistas.'
        : 'A sala é gerada de novo em cada partida. Clica no ecrã para controlar o rato.';
    }
  }

  async function probeXR() {
    const status = $('xr-status');
    try {
      if (navigator.xr) {
        xr.ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
        xr.vr = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
      }
    } catch (e) { /* sem WebXR */ }
    if (xr.ar || xr.vr) {
      status.textContent = 'Disponível: ' + [xr.ar && 'AR', xr.vr && 'VR'].filter(Boolean).join(' e ') + '. A sala adapta-se ao espaço real ou às medidas que definires.';
      sel.xrKind = xr.ar ? 'ar' : 'vr';
      document.querySelector(`input[name=xrkind][value=${sel.xrKind}]`).checked = true;
    } else {
      status.textContent = 'Sem WebXR neste dispositivo (precisa de HTTPS e de um Quest ou Chrome no Android).';
    }
    refreshMenu();
  }

  function setupMenu() {
    document.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { sel.mode = c.dataset.mode; refreshMenu(); }));
    document.querySelectorAll('input[name=space]').forEach((r) => r.addEventListener('change', () => { sel.space = r.value; refreshMenu(); }));
    document.querySelectorAll('input[name=xrkind]').forEach((r) => r.addEventListener('change', () => { sel.xrKind = r.value; refreshMenu(); }));
    $('btn-start').addEventListener('click', startGame);
    $('btn-restart').addEventListener('click', () => location.reload());
    refreshMenu();
    probeXR();
  }

  /* ---------------- marcação do espaço ---------------- */
  function placingPhase(opts, headset) {
    return new Promise((resolve) => {
      const placer = scene.components['anchor-placer'];
      DR.state.phase = 'placing';
      DR.ui.hide('menu'); DR.ui.show('placing');
      if (DR.state.xrKind !== 'vr') DR.ui.show('crosshair');
      placer.start(opts).then((mode) => {
        const txt = mode === 'hittest'
          ? 'Aponta para paredes, mesas e chão e toca (ou prime o gatilho) para marcar. Marca pelo menos 8 pontos, bem espalhados.'
          : opts.virtual
            ? 'Aponta para paredes, mesas e chão e marca com E ou clique. Podes concluir quando quiseres; o resto é gerado.'
            : 'Sem hit-test, a marcação usa o ponto para onde olhas. Marca paredes e mesas à tua volta e conclui quando quiseres.';
        DR.ui.placing(0, 8, txt + (headset ? ' Para concluir, botão A ou X.' : ' Para concluir, o botão ou a tecla H.'));
      });
      const finish = () => {
        cleanup();
        DR.ui.hide('placing');
        resolve(placer.stop());
      };
      const onHelp = () => { if (placer.anchors.length) finish(); };
      const onEnter = (e) => { if (e.key === 'enter' && placer.anchors.length) finish(); };
      const auto = setInterval(() => { if (headset && placer.anchors.length >= 12) finish(); }, 500);
      const cleanup = () => { clearInterval(auto); DR.bus.off('help', onHelp); DR.bus.off('key', onEnter); $('btn-finish').onclick = null; $('btn-undo').onclick = null; };
      $('btn-finish').onclick = finish;
      $('btn-undo').onclick = () => placer.undo();
      DR.bus.on('key', onEnter);
      // enquanto se marca, "ajuda" (H / botão A) conclui em vez de abrir o modal
      DR.bus.on('help', onHelp);
    });
  }

  /* ---------------- início ---------------- */
  async function startGame() {
    DR.audio.unlock();                       // tem de ser síncrono (gesto do utilizador)
    const st = DR.state;
    st.mode = sel.mode; st.space = sel.space;
    st.dims = {
      w: parseFloat($('dim-w').value) || 5.5, d: parseFloat($('dim-d').value) || 5, h: parseFloat($('dim-h').value) || 2.7,
    };
    st.dims.w = DR.util.clamp(st.dims.w, 3, 12); st.dims.d = DR.util.clamp(st.dims.d, 3, 12); st.dims.h = DR.util.clamp(st.dims.h, 2.2, 4);
    const randomize = sel.space === 'auto' && $('dim-random').checked;
    const builder = $('room').components['room-builder'];

    let kind = null;
    if (sel.mode === 'xr') {
      kind = xr.ar && (!xr.vr || sel.xrKind === 'ar') ? 'ar' : xr.vr ? 'vr' : null;
      if (!kind) { DR.ui.toast('WebXR indisponível. A iniciar no modo normal.', 3500); }
      else {
        try {
          if (kind === 'ar') await scene.enterAR(); else await scene.enterVR();
        } catch (e) {
          console.warn('Falha ao entrar em XR:', e);
          DR.ui.toast('Não foi possível iniciar a sessão XR. A iniciar no modo normal.', 3500);
          kind = null;
        }
      }
    }
    st.xrKind = kind;
    st.mode = kind ? 'xr' : 'demo';
    DR.audio.startAmbience();
    $('menu').classList.add('hidden');
    const headset = !!kind && !(scene.renderer.xr.getSession() && scene.renderer.xr.getSession().domOverlayState);

    let layout;
    if (kind === 'ar' && sel.space === 'auto') {
      // espaço físico: âncoras marcadas com hit-test -> sala adaptada
      builder.clear();
      const anchors = await placingPhase({ virtual: false }, headset);
      layout = DR.layout.generate({ anchors, dims: st.dims, randomize: true });
    } else {
      layout = DR.layout.generate({ dims: st.dims, randomize });
      builder.build(layout, { visible: kind !== 'ar' });
      if (sel.space === 'manual') {
        if (kind === 'ar') builder.showGuide(layout, true);
        const anchors = await placingPhase({ virtual: kind !== 'ar', forceGaze: kind === 'ar' }, headset);
        layout.addAnchors(anchors);
        builder.showGuide(layout, false);
      }
    }
    DR.ui.hide('placing');
    DR.levels.begin(layout);
  }

  /* ecrã inicial: lanterna que segue o rato/dedo; sem interação, deriva sozinha */
  function initMenuLight() {
    const menu = $('menu');
    try {
      $('menu-wall').style.backgroundImage = 'url(' + DR.textures.surface('wall').image.toDataURL() + ')';
      $('menu-glyph').src = DR.textures.symbolCanvas('eye').toDataURL();
    } catch (e) { /* sem textura: o menu continua utilizável */ }
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { menu.classList.add('lit-all'); return; }
    let tx = innerWidth * 0.5, ty = innerHeight * 0.3, x = tx, y = ty, last = performance.now() - 3000;
    const move = (e) => { tx = e.clientX; ty = e.clientY; last = performance.now(); };
    menu.addEventListener('pointermove', move);
    menu.addEventListener('pointerdown', move);
    let flick = 0;
    const frame = (t) => {
      if (menu.classList.contains('hidden')) return;
      if (t - last > 3500) {
        tx = innerWidth * (0.5 + 0.34 * Math.sin(t / 2600));
        ty = innerHeight * (0.5 + 0.32 * Math.sin(t / 1900 + 1));
      }
      x += (tx - x) * 0.14; y += (ty - y) * 0.14;
      if (flick <= 0 && Math.random() < 0.004) flick = 6;
      const f = flick > 0 ? (flick-- % 2 ? 0.72 : 1) : 1 + 0.025 * Math.sin(t / 130);
      menu.style.setProperty('--mx', x + 'px');
      menu.style.setProperty('--my', y + 'px');
      menu.style.setProperty('--r', Math.round(Math.min(innerWidth, innerHeight) * 0.3 * f + 90) + 'px');
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function ready() {
    initMenuLight();
    DR.ui.init();
    DR.input.init(scene);
    setupMenu();
    if (params.has('autostart')) startGame();
  }

  if (scene.hasLoaded) ready(); else scene.addEventListener('loaded', ready);
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyH' && DR.state.phase === 'menu') e.preventDefault(); });
})();
