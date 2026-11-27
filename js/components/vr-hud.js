/* THE DARK ROOM — HUD 3D para headsets (onde não há DOM overlay).
 * Painel preso à cabeça, discreto, com nível, objetivo, pistas, caderno e legenda atual. */
AFRAME.registerComponent('vr-hud', {
  init() {
    this.canvas = DR.textures.canvas(1024, 300);
    this.tex = DR.textures.texFrom(this.canvas);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0.92 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62 * 300 / 1024), mat);
    this.mesh.renderOrder = 10000;
    this.mesh.position.set(0, -0.27, -0.85);
    this.el.setObject3D('mesh', this.mesh);
    this.mesh.visible = false;
    // aviso do que estás a apontar ("Gatilho · Rodar o cubo 2")
    this.pc = DR.textures.canvas(640, 72);
    this.ptex = DR.textures.texFrom(this.pc);
    this.pm = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.036), new THREE.MeshBasicMaterial({ map: this.ptex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.pm.renderOrder = 10001; this.pm.position.set(0, -0.06, -0.8); this.pm.visible = false;
    this.el.object3D.add(this.pm);
    this.label = null; this.placing = null;
    DR.bus.on('hover', (l) => { this.label = l; this.drawPrompt(); });
    DR.bus.on('placing-changed', (d) => { this.placing = d; this.draw(); });
    this.subtitle = ''; this.subUntil = 0;
    DR.bus.on('hud-changed', () => this.draw());
    DR.bus.on('subtitle', (t) => { this.subtitle = t; this.subUntil = performance.now() + Math.max(4500, t.length * 70); this.draw(); });
  },

  tick(t) {
    const sc = this.el.sceneEl;
    const xr = sc.is('vr-mode') || sc.is('ar-mode');
    let dom = false;
    if (xr && sc.renderer.xr.getSession()) dom = !!sc.renderer.xr.getSession().domOverlayState;
    const show = xr && !dom && (DR.state.phase === 'playing' || DR.state.phase === 'ended' || DR.state.phase === 'placing') && !DR.state.modal;
    this.pm.visible = show && !!this.label && DR.state.phase !== 'placing';
    if (this.mesh.visible !== show) { this.mesh.visible = show; if (show) this.draw(); }
    if (show && this.subtitle && performance.now() > this.subUntil) { this.subtitle = ''; this.draw(); }
  },

  drawPrompt() {
    const g = this.pc.getContext('2d');
    g.clearRect(0, 0, 640, 72);
    if (!this.label) { this.ptex.needsUpdate = true; return; }
    g.fillStyle = 'rgba(6,6,8,0.8)'; g.fillRect(0, 0, 640, 72);
    g.strokeStyle = 'rgba(230,220,210,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 638, 70);
    g.fillStyle = '#b3121a'; g.font = '700 30px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('GATILHO', 20, 37);
    g.fillStyle = '#e6dcd2'; g.font = '600 32px Arial';
    g.fillText(this.label, 170, 37, 450);
    this.ptex.needsUpdate = true;
  },

  draw() {
    const g = this.canvas.getContext('2d'), W = 1024, H = 300, st = DR.state;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(6,6,8,0.78)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(230,220,210,0.25)'; g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
    if (st.phase === 'placing') {
      const d = this.placing || { count: 0, min: 8, text: '' };
      g.fillStyle = '#e6dcd2'; g.font = '700 40px Arial'; g.textAlign = 'left';
      g.fillText('Marcar o espaço  ' + d.count + ' / ' + d.min, 28, 62);
      g.fillStyle = '#9a958f'; g.font = '24px Arial';
      wrap(g, 'Aponta para paredes e mesas e carrega no gatilho. B desfaz. A ou X concluem.', 28, 112, W - 56, 30, 3);
      this.tex.needsUpdate = true; return;
    }
    if (st.phase === 'ended') {
      g.fillStyle = '#e6dcd2'; g.font = '700 54px Arial'; g.textAlign = 'center';
      g.fillText(DR.config.maxLevel >= 3 ? 'Escapaste' : 'Nível 1 concluído', W / 2, 90);
      g.font = '28px Arial'; g.fillStyle = '#b3121a';
      g.fillText('Pistas: ' + st.foundTotal() + ' de ' + st.totalClues(), W / 2, 140);
      this.tex.needsUpdate = true; return;
    }
    const m = DR.ui.hudModel();
    if (!m) return;
    g.textAlign = 'left'; g.fillStyle = '#b3121a'; g.font = '700 30px Arial';
    g.fillText(m.title, 28, 48);
    g.textAlign = 'right'; g.fillStyle = '#e6dcd2'; g.font = '700 44px Arial';
    g.fillText(m.found + ' / ' + m.total, W - 28, 52);
    g.textAlign = 'left'; g.fillStyle = '#9a958f'; g.font = '24px Arial';
    wrap(g, m.objective, 28, 88, W - 56, 28, 2);
    // caderno
    let x = 28;
    m.notebook.forEach((it) => {
      if (it.type === 'text') {
        g.strokeStyle = 'rgba(230,220,210,0.3)'; g.strokeRect(x, 150, 58, 62);
        g.fillStyle = it.empty ? '#4a4846' : '#e6dcd2'; g.font = '700 38px "Courier New"'; g.textAlign = 'center';
        g.fillText(it.text, x + 29, 194); x += 68;
      } else if (it.type === 'img' || it.type === 'sym') {
        const key = it.type === 'img' ? it.key : 'sym:' + it.name, c = DR.textures.glyph(key).canvas;
        g.drawImage(c, x, 150, 62, 62); x += 70;
      } else if (it.type === 'rel') {
        g.drawImage(DR.textures.glyph('sym:' + it.a).canvas, x, 156, 48, 48);
        g.fillStyle = '#b3121a'; g.font = '700 30px Arial'; g.textAlign = 'center'; g.fillText('→', x + 62, 190);
        g.drawImage(DR.textures.glyph('sym:' + it.b).canvas, x + 78, 156, 48, 48); x += 138;
      } else x += 14;
    });
    if (this.subtitle) {
      g.textAlign = 'left'; g.fillStyle = '#e6dcd2'; g.font = 'italic 26px Georgia';
      wrap(g, this.subtitle, 28, 245, W - 56, 30, 2);
    }
    this.tex.needsUpdate = true;
  },
});

function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines) return; }
    else line = test;
  }
  if (n < maxLines) g.fillText(line, x, y + n * lh);
}
