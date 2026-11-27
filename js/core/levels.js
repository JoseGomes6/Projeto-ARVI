/* THE DARK ROOM — progressão e lógica dos três níveis.
 * Cada nível pede ao Layout superfícies (dispersas pela sala), pendura aí as pistas escondidas
 * e uma estação (teclado / mesa de montagem / altar). A conclusão de um nível desbloqueia o seguinte. */
(function () {
  const U = DR.util, S = DR.story;
  let layout = null, levelEls = [], door = null, stationEl = null, ending = false;
  let guideTimer = null, lastProgress = 0, lastHint = -1e9, nextTick = 0;

  const track = (el) => { levelEls.push(el); return el; };
  const isHoriz = (s) => Math.abs(s.normal.y) > 0.6;

  /* ---------------------------------------------------------------- */
  const builders = {
    1() {
      const code = [];
      for (let i = 0; i < 4; i++) code.push(U.randInt(0, 9));
      if (code.every((c) => c === code[0])) code[3] = (code[0] + 3) % 10;
      DR.state.code = code;
      DR.state.codeFound = [null, null, null, null];

      // parede, mesa, perto da porta e um objeto: 4 locais bem afastados
      const spots = [
        layout.pick(1, { kinds: ['wall'] })[0],
        layout.pick(1, { kinds: ['table', 'object'] })[0],
        layout.nearDoor(),
        layout.pick(1, { kinds: ['floor', 'object', 'table'] })[0],
      ].filter(Boolean);
      const order = U.shuffle([0, 1, 2, 3]);
      spots.forEach((s, i) => {
        const pos = order[i];
        track(DR.props.clue(s, { key: 'digit:' + code[pos] + ':' + (pos + 1), size: 0.42, id: 'digit' + pos, group: 'digit', pos, value: code[pos] }));
      });
      const st = layout.pick(1, { kinds: ['wall'], minDist: 1.4 })[0];
      stationEl = track(DR.props.terminal(st, {
        icon: 'keypad', w: 0.32, h: 0.46, label: 'Usar o teclado',
        onUse: () => DR.panels.keypad(() => DR.levels.complete(1)),
      }));
    },

    2() {
      DR.state.piecesCollected = [];
      // símbolo certo de cada um dos 4 cubos (aleatório em cada partida)
      const all = DR.textures.SYMBOLS;
      const solution = U.shuffle(all).slice(0, 4);
      DR.state.puzzleSolution = solution;
      // cada cubo tem 4 faces diferentes (uma delas é a certa) e começa rodado ao acaso, nunca já resolvido
      let faces, rots;
      do {
        faces = solution.map((sym) => U.shuffle([sym].concat(U.shuffle(all.filter((x) => x !== sym)).slice(0, 3))));
        rots = solution.map(() => U.randInt(0, 3));
      } while (solution.every((sym, i) => faces[i][(4 - rots[i]) % 4] === sym));

      layout.pick(4, { minDist: 1.5 }).forEach((s, i) => {
        const el = DR.props.clue(s, { key: 'frag:' + solution[i] + ':' + (i + 1), size: 0.34, id: 'piece' + i, group: 'piece', idx: i, interact: 'Recolher fragmento' });
        el.addEventListener('interact', () => collectPiece(el));
        track(el);
      });
      const st = layout.pick(1, { kinds: ['table', 'floor', 'wall'], minDist: 1.4 })[0];
      stationEl = track(DR.props.cubePuzzle(st, { solution, faces, rots, onSolved: () => DR.levels.complete(2) }));
    },

    3() {
      const all = U.shuffle(DR.textures.SYMBOLS);
      const seq = all.slice(0, 4), decoy = all[4];
      DR.state.sequence = seq;
      DR.state.symbolsFound = [];
      DR.state.relationsFound = [];
      const plaques = U.shuffle(seq.concat([decoy]));
      layout.pick(5, { minDist: 1.3 }).forEach((s, i) => {
        track(DR.props.clue(s, { key: 'sym:' + plaques[i], size: 0.42, id: 'sym-' + plaques[i], group: 'symbol', sym: plaques[i] }));
      });
      // setas: seq[i] -> seq[i+1]
      layout.pick(3, { minDist: 1.3 }).forEach((s, i) => {
        track(DR.props.clue(s, { key: 'rel:' + seq[i] + ':' + seq[i + 1], size: 0.6, id: 'rel' + i, group: 'relation', a: seq[i], b: seq[i + 1] }));
      });
      const st = layout.pick(1, { kinds: ['floor', 'table', 'object'], minDist: 1.4 })[0];
      stationEl = track(DR.props.terminal(st, {
        icon: 'altar', w: 0.4, h: 0.46, label: 'Usar o altar',
        onUse: () => DR.panels.symbols(() => DR.levels.complete(3)),
      }));
    },
  };

  function collectPiece(el) {
    const info = el.clueInfo, hc = el.components['hidden-clue'];
    if (hc) hc.forceFound();
    if (!DR.state.piecesCollected.includes(info.idx)) DR.state.piecesCollected.push(info.idx);
    DR.audio.collect();
    DR.ui.toast('Fragmento ' + DR.state.piecesCollected.length + ' / 4 recolhido');
    el.setAttribute('interactable', 'enabled', false);
    el.removeAttribute('hidden-clue');
    el.object3D.visible = false;
    DR.ui.updateHud();
  }

  /* ---------------------------------------------------------------- */
  function onClue(e) {
    const st = DR.state, lv = st.level, info = e.el.clueInfo;
    if (!info || st.phase !== 'playing') return;
    lastProgress = performance.now();
    st.levelClues[lv]++;
    if (info.group === 'digit') st.codeFound[info.pos] = info.value;
    else if (info.group === 'symbol') { if (!st.symbolsFound.includes(info.sym)) st.symbolsFound.push(info.sym); }
    else if (info.group === 'relation') st.relationsFound.push({ a: info.a, b: info.b });
    DR.audio.found();
    DR.ui.flash('red', 90);
    DR.ui.updateHud();
    const lines = S.levels[lv].clues;
    DR.ui.say(lines[Math.min(st.levelClues[lv] - 1, lines.length - 1)]);
  }

  /* ---------------- dicas e sinal de proximidade ---------------- */
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), fwd = new THREE.Vector3();

  /** Pistas ainda por descobrir (ou por recolher) no nível atual. */
  function pending() {
    return levelEls.filter((e) => {
      const hc = e.components && e.components['hidden-clue'];
      return hc && !hc.found;
    });
  }

  function describeDirection(el, cam) {
    el.object3D.getWorldPosition(v1);
    cam.getWorldPosition(v2);
    cam.getWorldDirection(fwd);
    const dx = v1.x - v2.x, dz = v1.z - v2.z;
    const dist = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, -dz) - Math.atan2(fwd.x, -fwd.z);   // + = direita
    let a = Math.atan2(Math.sin(ang), Math.cos(ang));
    const side = Math.abs(a) < 0.6 ? 'à tua frente' : Math.abs(a) > 2.4 ? 'atrás de ti' : a > 0 ? 'à tua direita' : 'à tua esquerda';
    const dy = v1.y - v2.y;
    const level = dy > 0.7 ? ', mais acima' : dy < -0.9 ? ', perto do chão' : '';
    const far = dist > 4 ? ' e longe' : dist < 2 ? ' e perto' : '';
    return 'Experimenta olhar ' + side + level + far + '.';
  }

  function giveHint(auto) {
    const st = DR.state;
    if (st.phase !== 'playing' || st.modal) return;
    const now = performance.now();
    if (!auto && now - lastHint < 15000) { DR.ui.toast('Espera um pouco para outra dica.', 1500); return; }
    const cam = document.getElementById('scene').camera;
    const left = pending();
    let text;
    if (left.length) {
      cam.getWorldPosition(v2);
      left.sort((a, b) => {
        a.object3D.getWorldPosition(v1); const da = v1.distanceTo(v2);
        b.object3D.getWorldPosition(v1); return da - v1.distanceTo(v2);
      });
      text = describeDirection(left[0], cam);
    } else if (stationEl) text = 'Já tens o que precisas. Procura o ' + (st.level === 1 ? 'teclado' : st.level === 2 ? 'puzzle dos cubos' : 'altar') + ' (o LED vermelho a piscar).';
    else return;
    lastHint = now;
    DR.audio.hint();
    DR.ui.say(text, { journal: false });
  }

  function guideLoop() {
    const st = DR.state;
    if (st.phase !== 'playing') return;
    const sc = document.getElementById('scene'), cam = sc.camera;
    cam.getWorldPosition(v2); cam.getWorldDirection(fwd);
    DR.audio.setListener(v2, fwd);
    if (st.modal) return;
    const now = performance.now();
    // sinal de proximidade: "tic" localizado na direção da pista mais próxima
    const left = pending();
    let best = null, bd = Infinity;
    left.forEach((e) => { e.object3D.getWorldPosition(v1); const d = v1.distanceTo(v2); if (d < bd) { bd = d; best = e; } });
    if (best && bd < 4.5 && now > nextTick) {
      best.object3D.getWorldPosition(v1);
      DR.audio.tick3d(v1.clone(), 0.16 * (1 - bd / 5));
      nextTick = now + Math.max(350, Math.min(1700, bd * 380));
    }
    // dica automática se ficares muito tempo sem progresso
    if (now - lastProgress > 80000 && now - lastHint > 60000) giveHint(true);
  }

  DR.bus.on('hint', () => giveHint(false));

  DR.levels = {
    begin(l) {
      layout = l;
      DR.world = DR.world || {};
      DR.world.layout = l;
      ending = false;
      DR.state.reset();
      DR.state.phase = 'playing';
      DR.state.startedAt = performance.now();
      DR.ui.enterGameUI();
      DR.bus.off('clue-found', onClue);
      DR.bus.on('clue-found', onClue);
      // a porta existe desde o início (fechada, só visível quando iluminada)
      door = DR.props.door(l.door);
      DR.ui.say(S.intro);
      if (DR.ui.isHeadset()) DR.ui.say('Gatilho usa. Grip liga a lanterna. A dá uma dica. X abre o menu.', { journal: false });
      this.start(1);
    },

    async start(n) {
      const st = DR.state;
      st.level = n; st.modal = false;
      layout.resetUsed();
      lastProgress = performance.now(); lastHint = -1e9;
      clearInterval(guideTimer); guideTimer = setInterval(guideLoop, 180);
      levelEls.forEach((e) => DR.props.remove(e)); levelEls = [];
      builders[n]();
      DR.ui.updateHud();
      if (n > 1) {
        await DR.ui.titleCard(S.levels[n].title, S.levels[n].sub, 2800);
        DR.bus.emit('torch-flicker', { ms: 900 });
      } else {
        DR.ui.toast(S.levels[1].sub, 3500);
      }
    },

    async complete(n) {
      const st = DR.state;
      if (ending) return;
      st.modal = false;
      DR.audio.unlock();
      if (n < DR.config.maxLevel) {
        DR.ui.say(S.levels[n].outro);
        await U.sleep(2600);
        DR.ui.flash('white', 400);
        await U.sleep(1500);
        this.start(n + 1);
        return;
      }
      // final: a porta abre
      ending = true;
      DR.ui.say(S.levels[n].outro);
      DR.audio.door();
      const dc = door && door.components['door-prop'];
      if (dc) dc.open();
      await U.sleep(3600);
      DR.ui.flash('white', 1500);
      await U.sleep(1200);
      st.phase = 'ended';
      clearInterval(guideTimer);
      DR.audio.stopAmbience();
      DR.ui.clearSay();
      if (n >= 3) DR.ui.say(S.ending, { journal: false });
      DR.ui.endScreen((performance.now() - st.startedAt) / 1000);
      if (DR.ui.isHeadset()) DR.panels.finish();
      DR.bus.emit('hud-changed', null);
    },

    hintNow: () => giveHint(false),

    cleanup() {
      clearInterval(guideTimer);
      DR.panels.close();
      levelEls.forEach((e) => DR.props.remove(e)); levelEls = [];
      if (door) DR.props.remove(door);
      door = null;
      DR.ui.clearSay();
    },
  };
})();
