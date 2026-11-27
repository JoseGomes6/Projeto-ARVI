/* THE DARK ROOM — painéis 3D interativos (teclado, montagem do puzzle, altar de símbolos).
 * Abrem à frente do jogador, são apontados com a lanterna/cabeça/controlador e ativados
 * com o mesmo botão de ação do resto do jogo. Nada de ecrãs 2D de perguntas e respostas:
 * são objetos no espaço que o jogador usa depois de os ter encontrado no escuro. */
(function () {
  const U = DR.util;
  let current = null;

  function el(parent, attrs) {
    const e = document.createElement('a-entity');
    Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    parent.appendChild(e);
    return e;
  }
  function label(parent, x, y, w, h, text, extra) {
    return el(parent, { position: `${x} ${y} 0.002`, 'ui-button': Object.assign({ w, h, label: text, static: true, bg: '#0a0a0b', line: '#2c2a29' }, extra || {}) });
  }
  function button(parent, x, y, w, h, props, name, onPress) {
    const b = el(parent, {
      position: `${x} ${y} 0.01`,
      'ui-button': Object.assign({ w, h }, props),
      interactable: { label: name || 'Selecionar', modal: true },
    });
    b.addEventListener('interact', onPress);
    return b;
  }
  const set = (e, k, v) => e.setAttribute('ui-button', k, v);

  function openRoot(w, h, title, onClose) {
    DR.panels.close();
    const sc = document.querySelector('a-scene'), cam = sc.camera;
    const o = new THREE.Vector3(), f = new THREE.Vector3();
    cam.getWorldPosition(o); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const root = document.createElement('a-entity');
    const full = new THREE.Vector3(); cam.getWorldDirection(full);
    const p = o.clone().addScaledVector(f, 0.85); p.y = o.y + THREE.MathUtils.clamp(full.y * 0.85, -0.4, 0.4) - 0.04;
    root.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
    const dir = o.clone().sub(p), pitch = -Math.asin(dir.y / dir.length());
    root.setAttribute('rotation', `${THREE.MathUtils.radToDeg(pitch)} ${THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z))} 0`);
    document.getElementById('world').appendChild(root);
    el(root, { position: '0 0 -0.004', 'ui-button': { w, h, static: true, bg: '#08080a', line: '#7d1218' } });
    label(root, 0, h / 2 - 0.05, w - 0.16, 0.07, title, { size: 0.55, fg: '#b3121a', bg: '#08080a', line: '#08080a' });
    button(root, w / 2 - 0.045, h / 2 - 0.05, 0.065, 0.065, { label: '✕', size: 0.6 }, 'Fechar', () => DR.panels.close());
    DR.state.modal = true;
    DR.audio.click();
    current = { root, onClose, cleanup: [] };
    return root;
  }

  DR.panels = {
    isOpen: () => !!current,
    close() {
      if (!current) return;
      const c = current; current = null;
      c.cleanup.forEach((f) => f());
      DR.props.remove(c.root);
      DR.state.modal = false;
      DR.ui.prompt(null);
      if (c.onClose) c.onClose();
    },

    /* ---------------- NÍVEL 1: teclado ---------------- */
    keypad(onSolved) {
      const root = openRoot(0.46, 0.76, 'Fechadura', null);
      let code = '', locked = false;
      const disp = el(root, { position: '0 0.25 0.004', 'ui-button': { w: 0.38, h: 0.1, label: '_ _ _ _', size: 0.62, static: true, bg: '#050808', fg: '#d6cbc0', line: '#3a1114' } });
      const show = (txt, color) => {
        const t = txt != null ? txt : (code.split('').concat(['_', '_', '_', '_']).slice(0, 4).join(' '));
        set(disp, 'label', t); set(disp, 'flash', color || '');
      };
      const press = (d) => {
        if (locked) return;
        if (d === 'C') code = '';
        else if (d === 'OK') return submit();
        else if (code.length < 4) code += d;
        DR.audio.key(); show();
      };
      const submit = () => {
        if (locked) return;
        if (code.length < 4) { DR.audio.error(); return; }
        locked = true;
        if (code === DR.state.code.join('')) {
          show('ABERTO', '#0d3a1c'); DR.audio.unlock();
          setTimeout(() => { DR.panels.close(); onSolved(); }, 1100);
        } else {
          show('ERRO', '#4a0d12'); DR.audio.error(); DR.ui.flash('red', 160);
          DR.bus.emit('torch-flicker', { ms: 500 });
          setTimeout(() => { code = ''; locked = false; show(); }, 1100);
        }
      };
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
      keys.forEach((k, i) => {
        const x = (i % 3 - 1) * 0.125, y = 0.11 - Math.floor(i / 3) * 0.125;
        button(root, x, y, 0.11, 0.11, { label: k, size: k.length > 1 ? 0.36 : 0.55, line: k === 'OK' ? '#b3121a' : '#5a5652' }, 'Tecla ' + k, () => press(k));
      });
      const onKey = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'back') { code = code.slice(0, -1); show(); } else if (e.key === 'enter') submit(); };
      DR.bus.on('key', onKey);
      current.cleanup.push(() => DR.bus.off('key', onKey));
    },

    /* ---------------- NÍVEL 2: mesa de montagem ---------------- */
    puzzle(onSolved) {
      const root = openRoot(0.92, 0.6, 'Montagem', null);
      const S = DR.state;
      const slotPiece = [null, null, null, null];           // slot -> índice da peça
      const order = DR.panels._trayOrder || (DR.panels._trayOrder = U.shuffle([0, 1, 2, 3]));
      let selected = null, locked = false;
      const status = label(root, 0, -0.245, 0.8, 0.06, 'Seleciona um fragmento e depois o seu lugar.', { size: 0.5, fg: '#8b8782' });
      const slots = [], tiles = [];
      const size = 0.19;

      const refresh = () => {
        slots.forEach((b, i) => {
          const p = slotPiece[i];
          set(b, 'img', p == null ? '' : 'piece:' + p);
          set(b, 'label', p == null ? '+' : '');
        });
        tiles.forEach((b) => {
          const p = b.pieceIdx, have = S.piecesCollected.includes(p), placed = slotPiece.includes(p);
          set(b, 'img', have && !placed ? 'piece:' + p : '');
          set(b, 'label', have ? '' : '?');
          set(b, 'disabled', !have || placed);
          set(b, 'selected', selected === p);
        });
      };
      const check = () => {
        if (slotPiece.some((p) => p == null)) return;
        if (slotPiece.every((p, i) => p === i)) {
          locked = true; set(status, 'label', 'A fotografia está completa.'); set(status, 'fg', '#e6dcd2');
          slots.forEach((b) => set(b, 'flash', '#0d3a1c')); DR.audio.unlock();
          setTimeout(() => { DR.panels.close(); onSolved(); }, 1500);
        } else {
          DR.audio.error(); set(status, 'label', 'As peças não encaixam. Tenta outra ordem.'); set(status, 'fg', '#b3121a');
          slots.forEach((b) => { set(b, 'flash', '#4a0d12'); setTimeout(() => set(b, 'flash', ''), 450); });
        }
      };

      for (let i = 0; i < 4; i++) {
        const x = -0.33 + (i % 2) * (size + 0.02), y = 0.1 - Math.floor(i / 2) * (size + 0.02);
        slots.push(button(root, x, y, size, size, { label: '+', size: 0.4, bg: '#0c0c0e' }, 'Colocar fragmento', () => {
          if (locked) return;
          if (selected != null && slotPiece[i] == null) { slotPiece[i] = selected; selected = null; DR.audio.place(); }
          else if (selected == null && slotPiece[i] != null) { slotPiece[i] = null; DR.audio.click(); }
          else if (selected != null) { const prev = slotPiece[i]; slotPiece[i] = selected; selected = prev; DR.audio.place(); }
          set(status, 'label', 'Seleciona um fragmento e depois o seu lugar.'); set(status, 'fg', '#8b8782');
          refresh(); check();
        }));
      }
      label(root, 0.235, 0.215, 0.34, 0.045, 'FRAGMENTOS', { size: 0.5, fg: '#5a5652' });
      order.forEach((p, i) => {
        const x = 0.14 + (i % 2) * 0.19, y = 0.1 - Math.floor(i / 2) * 0.19;
        const t = button(root, x, y, size - 0.02, size - 0.02, { label: '?', size: 0.4 }, 'Pegar fragmento', () => {
          if (locked || !S.piecesCollected.includes(p) || slotPiece.includes(p)) return;
          selected = selected === p ? null : p; DR.audio.key(); refresh();
        });
        t.pieceIdx = p; tiles.push(t);
      });
      refresh();
    },

    /* ---------------- NÍVEL 3: altar de símbolos ---------------- */
    symbols(onSolved) {
      const root = openRoot(0.78, 0.66, 'Altar', null);
      const seq = [];
      let locked = false;
      const slotEls = [];
      for (let i = 0; i < 4; i++) slotEls.push(el(root, { position: `${(i - 1.5) * 0.15} 0.2 0.004`, 'ui-button': { w: 0.13, h: 0.13, label: '_', static: true, bg: '#050808', size: 0.5, line: '#3a1114' } }));
      const show = (flash) => slotEls.forEach((b, i) => { set(b, 'img', seq[i] ? 'sym:' + seq[i] : ''); set(b, 'label', seq[i] ? '' : '_'); set(b, 'flash', flash || ''); });
      DR.textures.SYMBOLS.forEach((s, i) => {
        const x = (i % 3 - 1) * 0.2, y = 0.03 - Math.floor(i / 3) * 0.2;
        button(root, x, y, 0.17, 0.17, { img: 'sym:' + s }, DR.textures.SYMBOL_NAMES[s], () => {
          if (locked || seq.length >= 4 || seq.includes(s)) return;
          seq.push(s); DR.audio.key(); show();
        });
      });
      button(root, -0.16, -0.27, 0.22, 0.07, { label: 'APAGAR', size: 0.42 }, 'Apagar', () => { if (!locked) { seq.pop(); DR.audio.click(); show(); } });
      button(root, 0.16, -0.27, 0.22, 0.07, { label: 'CONFIRMAR', size: 0.42, line: '#b3121a' }, 'Confirmar sequência', () => {
        if (locked || seq.length < 4) return;
        locked = true;
        if (seq.every((s, i) => s === DR.state.sequence[i])) {
          show('#0d3a1c'); DR.audio.unlock();
          setTimeout(() => { DR.panels.close(); onSolved(); }, 1300);
        } else {
          show('#4a0d12'); DR.audio.error(); DR.audio.scare(); DR.ui.flash('red', 200);
          DR.bus.emit('torch-flicker', { ms: 900 });
          setTimeout(() => { seq.length = 0; locked = false; show(); }, 1200);
        }
      });
    },
  };

  DR.bus.on('cancel', () => { if (current) DR.panels.close(); });
})();
