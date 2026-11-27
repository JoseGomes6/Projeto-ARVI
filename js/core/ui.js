/* THE DARK ROOM — interface DOM (menus, HUD, legendas, cartões de título) */
(function () {
  const DR = window.DR;
  const $ = (id) => document.getElementById(id);
  let subTimer = null, subQueue = [], subBusy = false, typeTimer = null;

  const thumbCache = {};
  function thumb(key) {
    if (!thumbCache[key]) thumbCache[key] = DR.textures.glyph(key).canvas.toDataURL();
    return thumbCache[key];
  }

  /** Dados do caderno de notas (partilhados pelo HUD DOM e pelo HUD 3D). */
  function notebookData() {
    const st = DR.state, out = [];
    if (st.level === 1) {
      st.codeFound.forEach((v) => out.push({ type: 'text', text: v == null ? '_' : String(v), empty: v == null }));
    } else if (st.level === 2) {
      for (let i = 0; i < 4; i++) {
        const has = st.piecesCollected.includes(i);
        out.push(has ? { type: 'img', key: 'frag:' + st.puzzleSolution[i] + ':' + (i + 1) } : { type: 'text', text: '?', empty: true });
      }
    } else if (st.level === 3) {
      st.symbolsFound.forEach((s) => out.push({ type: 'sym', name: s }));
      if (st.symbolsFound.length && st.relationsFound.length) out.push({ type: 'sep' });
      st.relationsFound.forEach((r) => out.push({ type: 'rel', a: r.a, b: r.b }));
      if (!out.length) out.push({ type: 'text', text: '· · ·', empty: true });
    }
    return out;
  }

  DR.ui = {
    $, notebookData,

    init() {
      document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden')));
      $('btn-help').addEventListener('click', () => this.toggleModal('modal-help'));
      $('btn-hint').addEventListener('click', () => DR.bus.emit('hint'));
      const snd = () => { $('btn-sound').textContent = DR.audio.isMuted() ? 'Mudo' : 'Som'; };
      $('btn-sound').addEventListener('click', () => { DR.audio.toggleMute(); snd(); });
      DR.bus.on('mute-toggle', () => { DR.audio.toggleMute(); snd(); this.toast(DR.audio.isMuted() ? 'Som desligado' : 'Som ligado', 1200); });
      $('btn-journal').addEventListener('click', () => { this.renderJournal(); this.toggleModal('modal-journal'); });
      // evita que toques na UI sejam interpretados como "select" XR
      document.querySelectorAll('.ui, .ui *, button').forEach((el) => el.addEventListener('beforexrselect', (e) => e.preventDefault()));
      // grão de filme animado
      const g = $('grain'), c = DR.textures.canvas(128, 128), ctx = c.getContext('2d');
      const draw = () => {
        const img = ctx.createImageData(128, 128);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        g.style.backgroundImage = 'url(' + c.toDataURL() + ')';
      };
      draw(); setInterval(draw, 120);
      DR.bus.on('help', () => { if (DR.state.phase !== 'placing') this.toggleModal('modal-help'); });
    },

    show(id) { $(id).classList.remove('hidden'); },
    hide(id) { $(id).classList.add('hidden'); },
    toggleModal(id) { $(id).classList.toggle('hidden'); },

    enterGameUI() {
      this.hide('menu'); this.hide('end'); this.show('hud');
      if (DR.state.xrKind !== 'vr') this.show('crosshair');
    },

    toast(text, ms) {
      const t = $('toast'); t.textContent = text; t.classList.remove('hidden');
      clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms || 2200);
    },

    flash(kind, ms) {
      const f = $('flash');
      f.classList.toggle('white', kind === 'white');
      f.classList.add('on');
      setTimeout(() => f.classList.remove('on'), ms || 120);
    },

    /* ---------- HUD ---------- */
    hudModel() {
      const st = DR.state, S = DR.story.levels[st.level];
      if (!S) return null;
      return {
        title: S.title, objective: S.objective,
        found: st.levelClues[st.level], total: st.levelTotals[st.level],
        all: st.foundTotal(), allTotal: st.totalClues(),
        notebook: notebookData(),
      };
    },

    updateHud() {
      const m = this.hudModel();
      if (!m) return;
      const parts = m.title.split(' · ');
      $('hud-level').textContent = parts[0];
      $('hud-name').textContent = parts[1] || '';
      $('hud-found').textContent = m.found;
      $('hud-total').textContent = m.total;
      $('hud-objective').textContent = m.objective;
      const nb = $('hud-notebook');
      nb.innerHTML = '';
      m.notebook.forEach((it) => {
        const d = document.createElement('div');
        if (it.type === 'text') { d.className = 'nb-slot' + (it.empty ? ' empty' : ''); d.textContent = it.text; }
        else if (it.type === 'img') { d.className = 'nb-slot'; d.innerHTML = '<img alt="">'; d.firstChild.src = thumb(it.key); }
        else if (it.type === 'sym') { d.className = 'nb-slot'; d.innerHTML = '<img alt="">'; d.firstChild.src = thumb('sym:' + it.name); }
        else if (it.type === 'sep') { d.className = 'nb-sep'; }
        else if (it.type === 'rel') {
          d.className = 'nb-rel';
          d.innerHTML = '<img alt=""><b>→</b><img alt="">';
          d.children[0].src = thumb('sym:' + it.a); d.children[2].src = thumb('sym:' + it.b);
        }
        nb.appendChild(d);
      });
      DR.bus.emit('hud-changed', m);
    },

    prompt(label) {
      const p = $('prompt'), ch = $('crosshair');
      if (!label) { p.classList.add('hidden'); ch.classList.remove('active'); return; }
      const key = DR.state.xrKind ? 'GATILHO' : (matchMedia('(pointer: coarse)').matches ? 'TOCAR' : 'E');
      p.innerHTML = '<kbd>' + key + '</kbd>' + label;
      p.classList.remove('hidden'); ch.classList.add('active');
    },

    /* ---------- narrativa ---------- */
    say(lines, opts) {
      opts = opts || {};
      (Array.isArray(lines) ? lines : [lines]).forEach((l) => subQueue.push({ text: l, journal: opts.journal !== false }));
      if (!subBusy) this._next();
    },
    _next() {
      const el = $('subtitle');
      const item = subQueue.shift();
      if (!item) { subBusy = false; el.classList.add('hidden'); return; }
      subBusy = true;
      if (item.journal) DR.state.journal.push(item.text);
      el.classList.remove('hidden', 'fade'); el.textContent = '';
      let i = 0;
      clearInterval(typeTimer);
      typeTimer = setInterval(() => {
        el.textContent = item.text.slice(0, ++i);
        if (i >= item.text.length) clearInterval(typeTimer);
      }, 28);
      DR.bus.emit('subtitle', item.text);
      const hold = Math.max(3200, item.text.length * 62 + 1400);
      clearTimeout(subTimer);
      subTimer = setTimeout(() => {
        el.classList.add('fade');
        setTimeout(() => this._next(), 900);
      }, hold);
    },
    clearSay() { subQueue = []; subBusy = false; clearTimeout(subTimer); clearInterval(typeTimer); $('subtitle').classList.add('hidden'); },

    async titleCard(title, sub, ms) {
      $('tc-title').textContent = title; $('tc-sub').textContent = sub || '';
      this.show('titlecard');
      await DR.util.sleep(ms || 2800);
      this.hide('titlecard');
    },

    renderJournal() {
      const ol = $('journal-list');
      ol.innerHTML = '';
      if (!DR.state.journal.length) ol.innerHTML = '<li>Ainda não encontraste nada.</li>';
      DR.state.journal.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
    },

    /* ---------- marcação do espaço ---------- */
    placing(count, min, text) {
      $('placing-count').textContent = count + ' / ' + min + (count >= min ? '  ✓' : '');
      if (text) $('placing-text').textContent = text;
    },

    endScreen(secs) {
      const st = DR.state;
      const full = DR.config.maxLevel >= 3;
      $('end-title').textContent = full ? 'Escapaste' : 'Nível 1 concluído';
      $('end-text').textContent = full ? DR.story.ending.join(' ') : DR.story.demoEnd;
      const m = Math.floor(secs / 60), s = Math.round(secs % 60);
      $('end-stats').textContent = 'Tempo: ' + m + ' min ' + String(s).padStart(2, '0') + ' s. Pistas: ' + st.foundTotal() + ' de ' + st.totalClues() + '.';
      this.hide('hud'); this.hide('prompt'); this.hide('crosshair'); this.show('end');
    },
  };
})();
