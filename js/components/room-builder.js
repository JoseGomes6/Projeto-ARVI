/* THE DARK ROOM — constrói a sala virtual (DEMO / MANUAL) a partir do Layout gerado.
 * Em AR os elementos virtuais são ocultados: a sala real é a sala. */
AFRAME.registerComponent('room-builder', {
  init() {
    this.group = new THREE.Group();
    this.el.object3D.add(this.group);
    this.guide = null;
  },

  clear() {
    const sys = this.el.sceneEl.systems['dr-interaction'];
    sys.clearSolids();
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.group.clear();
    this.guide = null;
  },

  mat(kind, w, h, extra) {
    const base = DR.textures.surface(kind);
    const t = base.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, w / 1.6), Math.max(1, h / 1.6));
    return new THREE.MeshStandardMaterial(Object.assign({ map: t, bumpMap: t, bumpScale: 1.6, roughness: 0.92, metalness: 0.02 }, extra || {}));
  },

  box(w, h, d, material, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  },

  build(layout, opts) {
    opts = opts || {};
    this.clear();
    const r = layout.room;
    if (!r.virtual) return;
    const G = this.group;

    // chão / teto / paredes
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), this.mat('floor', r.w, r.d));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; G.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), this.mat('ceil', r.w, r.d));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = r.h; ceil.receiveShadow = true; G.add(ceil);
    [
      { w: r.w, p: [0, r.h / 2, r.minZ], ry: 0 },
      { w: r.d, p: [r.maxX, r.h / 2, 0], ry: -Math.PI / 2 },
      { w: r.w, p: [0, r.h / 2, r.maxZ], ry: Math.PI },
      { w: r.d, p: [r.minX, r.h / 2, 0], ry: Math.PI / 2 },
    ].forEach((s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, r.h), this.mat('wall', s.w, r.h));
      m.position.set(...s.p); m.rotation.y = s.ry; m.receiveShadow = true; G.add(m);
    });
    // rodapé
    const base = this.mat('metal', 4, 0.2);
    [[0, r.minZ + 0.03, r.w, 0.06], [0, r.maxZ - 0.03, r.w, 0.06]].forEach((s) => this.box(s[2], 0.14, s[3], base, s[0], 0, s[1]));
    [[r.minX + 0.03, 0.06, r.d], [r.maxX - 0.03, 0.06, r.d]].forEach((s) => this.box(s[3] || 0.06, 0.14, s[2], base, s[0], 0, 0));

    // adereços
    const wood = () => this.mat('wood', 1.2, 1.2), metal = () => this.mat('metal', 1, 1);
    layout.props.forEach((p) => {
      const g = new THREE.Group();
      g.position.set(p.cx, 0, p.cz);
      g.rotation.y = p.rotY;
      G.add(g);
      switch (p.type) {
        case 'table': {
          this.box(p.w, 0.06, p.d, wood(), 0, p.h - 0.06, 0, g);
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => this.box(0.07, p.h - 0.06, 0.07, wood(), sx * (p.w / 2 - 0.08), 0, sz * (p.d / 2 - 0.08), g));
          break;
        }
        case 'crate': this.box(p.w, p.h, p.d, wood(), 0, 0, 0, g); break;
        case 'barrel': {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(p.w / 2, p.w / 2 * 0.92, p.h, 20), metal());
          b.position.y = p.h / 2; b.castShadow = b.receiveShadow = true; g.add(b);
          break;
        }
        case 'shelf': {
          this.box(p.w, p.h, 0.03, metal(), 0, 0, -p.d / 2 + 0.015, g);
          for (let i = 0; i < 5; i++) this.box(p.w, 0.03, p.d, wood(), 0, 0.2 + i * 0.4, 0, g);
          [-1, 1].forEach((s) => this.box(0.04, p.h, p.d, metal(), s * (p.w / 2 - 0.02), 0, 0, g));
          break;
        }
        case 'cabinet': this.box(p.w, p.h, p.d, metal(), 0, 0, 0, g); break;
        case 'pillar': this.box(p.w, r.h, p.d, this.mat('wall', 1, 3), 0, 0, 0, g); break;
      }
    });

    G.traverse((o) => { if (o.isMesh && o.material.map) o.material.map.anisotropy = 4; });
    this.setVisible(opts.visible !== false);
  },

  /** Em AR a sala virtual não é desenhada (nem bloqueia a luz): usa-se a sala real. */
  setVisible(v) {
    const sys = this.el.sceneEl.systems['dr-interaction'];
    this.group.visible = v;
    sys.clearSolids();
    if (v) sys.addSolids(this.group);
  },

  /** Contorno vermelho da sala (ajuda a alinhar o modo manual em AR). */
  showGuide(layout, v) {
    if (this.guide) { this.group.remove(this.guide); this.guide = null; }
    if (!v || !layout.room.virtual) return;
    const r = layout.room;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w, r.h, r.d)), new THREE.LineBasicMaterial({ color: 0xb3121a }));
    e.position.set((r.minX + r.maxX) / 2, r.h / 2, (r.minZ + r.maxZ) / 2);
    this.guide = e;
    this.group.add(e);
  },
});
