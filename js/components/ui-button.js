/* THE DARK ROOM — botão/etiqueta 3D desenhado em canvas (painéis de teclado, puzzle e símbolos).
 * Os painéis são "ecrãs" emissivos (MeshBasicMaterial) para serem legíveis mesmo às escuras. */
AFRAME.registerComponent('ui-button', {
  schema: {
    w: { default: 0.1 }, h: { default: 0.1 },
    label: { default: '' }, img: { default: '' },     // img = chave de glifo (ex.: "sym:eye")
    size: { default: 0.5 },                           // altura do texto relativa à altura do botão
    bg: { default: '#101012' }, fg: { default: '#e6dcd2' }, line: { default: '#5a5652' },
    selected: { default: false }, disabled: { default: false },
    flash: { default: '' },                            // cor temporária (feedback certo/errado)
    static: { default: false }, align: { default: 'center' },
  },

  init() {
    const D = this.data;
    this.px = 900;                                      // píxeis por metro
    const cw = Math.max(32, Math.min(1024, Math.round(D.w * this.px)));
    const ch = Math.max(32, Math.min(1024, Math.round(D.h * this.px)));
    this.canvas = DR.textures.canvas(cw, ch);
    this.tex = DR.textures.texFrom(this.canvas);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(D.w, D.h), mat);
    this.el.setObject3D('mesh', this.mesh);
    this.hover = false;
    this.el.addEventListener('hover-start', () => { this.hover = true; this.draw(); });
    this.el.addEventListener('hover-end', () => { this.hover = false; this.draw(); });
    this.draw();
  },

  update() { if (this.canvas) this.draw(); },

  draw() {
    const D = this.data, g = this.canvas.getContext('2d'), w = this.canvas.width, h = this.canvas.height;
    let bg = D.bg, line = D.line, fg = D.fg;
    if (!D.static) {
      if (this.hover && !D.disabled) { line = '#b3121a'; bg = '#1a1214'; }
      if (D.selected) { line = '#e6dcd2'; bg = '#2a1114'; }
    }
    if (D.flash) { bg = D.flash; }
    if (D.disabled) fg = '#4a4846';
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.lineWidth = D.static ? 2 : 4; g.strokeStyle = line;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    if (D.img) {
      const src = DR.textures.glyph(D.img).canvas, s = Math.min(w, h) * 0.86;
      g.globalAlpha = D.disabled ? 0.25 : 1;
      g.drawImage(src, (w - s * (src.width / src.height)) / 2, (h - s) / 2, s * (src.width / src.height), s);
      g.globalAlpha = 1;
    }
    if (D.label) {
      g.fillStyle = fg;
      g.font = `600 ${Math.round(h * D.size)}px "Helvetica Neue", Arial, sans-serif`;
      g.textBaseline = 'middle';
      g.textAlign = D.align;
      const x = D.align === 'left' ? 14 : D.align === 'right' ? w - 14 : w / 2;
      g.fillText(D.label, x, h / 2 + h * 0.03, w - 24);
    }
    this.tex.needsUpdate = true;
  },

  remove() {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.el.removeObject3D('mesh');
  },
});
