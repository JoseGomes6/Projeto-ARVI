/* THE DARK ROOM — objetos do jogo: pistas (glifos), terminais/estações e a porta de saída. */
(function () {
  const U = DR.util;
  const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

  /** Rotação (graus, ordem YXZ) que alinha +Z com a normal da superfície, com rolamento aleatório. */
  function orientation(normal, kind) {
    const q = new THREE.Quaternion().setFromUnitVectors(Z, normal);
    const roll = new THREE.Quaternion().setFromAxisAngle(Z, kind === 'wall' ? U.rand(-0.12, 0.12) : U.rand(0, Math.PI * 2));
    q.multiply(roll);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return { x: THREE.MathUtils.radToDeg(e.x), y: THREE.MathUtils.radToDeg(e.y), z: THREE.MathUtils.radToDeg(e.z) };
  }

  /* ---- glifo: plano com textura que desvanece (opcionalmente pousado num "livro") ---- */
  AFRAME.registerComponent('glyph-plane', {
    schema: { key: { default: '' }, size: { default: 0.3 }, book: { default: false } },
    init() {
      const D = this.data, tex = DR.textures.glyph(D.key);
      const aspect = tex.canvas.width / tex.canvas.height;
      const w = D.size * (aspect >= 1 ? 1 : aspect), h = w / aspect;
      const mat = new THREE.MeshBasicMaterial({ map: tex.texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      mat.userData.fade = 1;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.renderOrder = 4;
      let z = 0.004;
      if (D.book) {
        const bm = new THREE.MeshStandardMaterial({ color: 0x2b211d, roughness: 0.8, transparent: true, opacity: 0 });
        bm.userData.fade = 1;
        const book = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.05, 0.04), bm);
        book.position.z = 0.02; book.castShadow = true;
        this.el.object3D.add(book);
        z = 0.042;
      }
      mesh.position.z = z;
      this.el.setObject3D('mesh', mesh);
    },
    remove() { this.el.removeObject3D('mesh'); },
  });

  /* ---- LED vermelho que pisca (sempre visível: guia discreto para as estações) ---- */
  AFRAME.registerComponent('blink-led', {
    schema: { rate: { default: 1.6 } },
    init() {
      this.mat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 10), this.mat);
      this.el.setObject3D('mesh', m);
      const l = new THREE.PointLight(0xff1a1a, 0.5, 1.4, 2);
      this.el.object3D.add(l);
      this.l = l;
    },
    tick(t) {
      const on = (t / 1000 * this.data.rate) % 1 < 0.18 ? 1 : 0.12;
      this.mat.color.setRGB(1 * on, 0.16 * on, 0.16 * on);
      this.l.intensity = 0.5 * on;
    },
  });

  /* ---- terminal / estação: caixa metálica com ícone gravado e LED ---- */
  AFRAME.registerComponent('terminal-prop', {
    schema: { icon: { default: 'keypad' }, w: { default: 0.34 }, h: { default: 0.46 } },
    init() {
      const D = this.data, g = new THREE.Group();
      const metal = new THREE.MeshStandardMaterial({ map: DR.textures.surface('metal'), color: 0x9a9a9a, roughness: 0.55, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(D.w, D.h, 0.07), metal);
      body.position.z = 0.035; body.castShadow = body.receiveShadow = true; g.add(body);
      // placa com ícone (lit, só se vê com a lanterna)
      const c = DR.textures.canvas(256, Math.round(256 * D.h / D.w)), x = c.getContext('2d');
      x.fillStyle = '#1b1b1d'; x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = '#7d1218'; x.lineWidth = 4; x.strokeRect(10, 10, c.width - 20, c.height - 20);
      x.fillStyle = '#d6cbc0'; x.strokeStyle = '#d6cbc0';
      if (D.icon === 'keypad') {
        for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) x.fillRect(48 + q * 56, 90 + r * 50, 40, 34);
        x.fillStyle = '#b3121a'; x.fillRect(48, 36, 152, 30);
      } else {
        DR.textures.drawSymbol(x, 'eye', c.width / 2, c.height * 0.45, 70, 7);
        x.fillStyle = '#b3121a'; x.fillRect(48, c.height - 60, 152, 12);
      }
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(D.w * 0.86, D.h * 0.86),
        new THREE.MeshStandardMaterial({ map: DR.textures.texFrom(c), roughness: 0.7, metalness: 0.1 }));
      plate.position.z = 0.0715; plate.receiveShadow = true; g.add(plate);
      this.el.setObject3D('mesh', g);
      // LED
      const led = document.createElement('a-entity');
      led.setAttribute('position', `${D.w / 2 - 0.035} ${D.h / 2 - 0.035} 0.09`);
      led.setAttribute('blink-led', '');
      this.el.appendChild(led);
    },
    remove() { this.el.removeObject3D('mesh'); },
  });


  /* ---- puzzle dos cubos (estilo Uncharted): cada cubo roda 90º até mostrar o símbolo certo ---- */
  AFRAME.registerComponent('puzzle-cube', {
    init() {
      const spec = this.el.cubeSpec;       // { faces: [frente, direita, trás, esquerda], rot }
      this.rot = spec.rot;                 // passos de 90º
      this.cur = this.rot * Math.PI / 2;
      this.faces = spec.faces;
      this.mats = [];
      const blank = new THREE.MeshStandardMaterial({ color: 0x202022, roughness: 0.9 });
      const face = (n) => {
        const m = new THREE.MeshStandardMaterial({ map: DR.textures.glyph('cube:' + n).texture, roughness: 0.85, metalness: 0.05, emissive: 0x000000 });
        this.mats.push(m); return m;
      };
      // ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z
      const mats = [face(this.faces[1]), face(this.faces[3]), blank, blank, face(this.faces[0]), face(this.faces[2])];
      this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mats);
      this.mesh.castShadow = this.mesh.receiveShadow = true;
      this.mesh.rotation.y = this.cur;
      this.el.setObject3D('mesh', this.mesh);
      this.setGlow(0x000000);
      this.el.addEventListener('hover-start', () => { if (!this.locked) this.setGlow(0x2a0608); });
      this.el.addEventListener('hover-end', () => { if (!this.locked) this.setGlow(0x000000); });
      this.el.addEventListener('interact', () => this.turn());
    },
    setGlow(hex) { this.mats.forEach((m) => m.emissive.setHex(hex)); },
    /** Símbolo que está virado para o jogador (frente do cubo). */
    front() { return this.faces[(4 - (this.rot % 4)) % 4]; },
    turn() {
      if (this.locked) return;
      this.rot++;
      DR.audio.place();
      this.el.emit('cube-turned', { index: this.el.cubeIndex });
    },
    lock() { this.locked = true; this.setGlow(0x0b3a1a); this.el.setAttribute('interactable', 'enabled', false); },
    tick(t, dtMs) {
      const target = this.rot * Math.PI / 2;
      if (Math.abs(target - this.cur) > 0.002) {
        this.cur += (target - this.cur) * Math.min(1, dtMs / 1000 * 14);
        this.mesh.rotation.y = this.cur;
      }
    },
    remove() { this.el.removeObject3D('mesh'); },
  });

  AFRAME.registerComponent('cube-puzzle', {
    init() {
      const cfg = this.el.cubeCfg;         // { solution, faces[4][4], rots[4], onSolved }
      this.cfg = cfg;
      const g = new THREE.Group();
      const stone = new THREE.MeshStandardMaterial({ map: DR.textures.surface('metal'), color: 0x8a8a8a, roughness: 0.7, metalness: 0.4 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 0.3), stone);
      base.position.y = -0.025; base.castShadow = base.receiveShadow = true; g.add(base);
      this.el.setObject3D('mesh', g);
      this.cubes = [];
      for (let i = 0; i < 4; i++) {
        const c = document.createElement('a-entity');
        c.cubeSpec = { faces: cfg.faces[i], rot: cfg.rots[i] };
        c.cubeIndex = i;
        c.setAttribute('position', `${(i - 1.5) * 0.265} 0.1 0`);
        c.setAttribute('puzzle-cube', '');
        c.setAttribute('interactable', { label: 'Rodar o cubo ' + (i + 1) });
        this.el.appendChild(c);
        this.cubes.push(c);
      }
      const led = document.createElement('a-entity');
      led.setAttribute('position', '0.52 0.02 0.16');
      led.setAttribute('blink-led', '');
      this.el.appendChild(led);
      this.el.addEventListener('cube-turned', () => this.check());
    },
    solved() { return this.cubes.every((c, i) => c.components['puzzle-cube'] && c.components['puzzle-cube'].front() === this.cfg.solution[i]); },
    check() {
      if (this.done || !this.solved()) return;
      this.done = true;
      this.cubes.forEach((c) => c.components['puzzle-cube'].lock());
      DR.audio.unlock();
      setTimeout(() => this.cfg.onSolved(), 1400);
    },
    remove() { this.el.removeObject3D('mesh'); },
  });

  /* ---- porta de saída ---- */
  AFRAME.registerComponent('door-prop', {
    init() {
      const g = new THREE.Group(), w = 0.98, h = 2.0;
      const metal = new THREE.MeshStandardMaterial({ map: DR.textures.surface('metal'), color: 0x8a8a8a, roughness: 0.5, metalness: 0.7 });
      const frame = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.8 });
      const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
      add(new THREE.BoxGeometry(0.09, h + 0.09, 0.12), frame, -w / 2 - 0.045, 0, 0.05);
      add(new THREE.BoxGeometry(0.09, h + 0.09, 0.12), frame, w / 2 + 0.045, 0, 0.05);
      add(new THREE.BoxGeometry(w + 0.18, 0.09, 0.12), frame, 0, h / 2 + 0.045, 0.05);
      // luz "do outro lado" (só se acende quando a porta abre)
      this.glow = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      this.glow.position.z = -0.01; this.glow.visible = false; g.add(this.glow);
      // folha da porta, com dobradiça à esquerda
      this.leaf = new THREE.Group(); this.leaf.position.x = -w / 2; g.add(this.leaf);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), metal);
      panel.position.set(w / 2, 0, 0.03); panel.castShadow = panel.receiveShadow = true; this.leaf.add(panel);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.3 }));
      handle.rotation.z = Math.PI / 2; handle.position.set(w - 0.12, -0.05, 0.09); this.leaf.add(handle);
      this.el.setObject3D('mesh', g);
      this.opening = 0; this.t0 = 0;
      const led = document.createElement('a-entity');
      led.setAttribute('position', `${w / 2 + 0.12} 0.7 0.12`);
      led.setAttribute('blink-led', 'rate: 0.8');
      this.el.appendChild(led);
    },
    open() {
      this.opening = 1; this.t0 = performance.now();
      this.glow.visible = true;
      this.light = new THREE.PointLight(0xffffff, 0, 8, 1.5);
      this.light.position.set(0, 0, -0.4); this.el.object3D.add(this.light);
    },
    tick() {
      if (!this.opening) return;
      const p = Math.min(1, (performance.now() - this.t0) / 3200);
      this.leaf.rotation.y = -p * p * 1.7;   // abre para dentro da sala
      this.light.intensity = p * 220;
    },
  });

  /* ---------------------------------------------------------------- */
  DR.props = {
    container() { return document.getElementById('world'); },

    /** Cria uma pista escondida numa superfície. cfg: {key, size, id, group, collect?} */
    clue(surface, cfg) {
      const el = document.createElement('a-entity');
      const horiz = Math.abs(surface.normal.y) > 0.6 && surface.kind !== 'ceiling';
      const rot = orientation(surface.normal, surface.kind);
      el.setAttribute('position', `${surface.pos.x} ${surface.pos.y} ${surface.pos.z}`);
      el.setAttribute('rotation', `${rot.x} ${rot.y} ${rot.z}`);
      el.setAttribute('glyph-plane', { key: cfg.key, size: cfg.size, book: horiz });
      el.setAttribute('hidden-clue', { id: cfg.id, size: cfg.size * (horiz ? 1.2 : 1), group: cfg.group || '' });
      if (cfg.interact) el.setAttribute('interactable', { label: cfg.interact });
      el.clueInfo = cfg;
      el.surface = surface;
      this.container().appendChild(el);
      return el;
    },

    /** Estação (teclado / mesa de montagem / altar). */
    terminal(surface, cfg) {
      const el = document.createElement('a-entity');
      let pos = surface.pos.clone(), normal = surface.normal.clone();
      if (Math.abs(normal.y) > 0.5) {            // superfície horizontal: coloca a caixa de pé, virada para o centro
        pos.y += cfg.h / 2 + (surface.kind === 'ceiling' ? -1.2 : 0.02);
        normal = new THREE.Vector3(-pos.x, 0, -pos.z);
        if (normal.lengthSq() < 0.01) normal.set(0, 0, 1);
        normal.normalize();
        pos.addScaledVector(normal, -0.05);
      }
      const q = new THREE.Quaternion().setFromUnitVectors(Z, normal);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      el.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
      el.setAttribute('rotation', `${THREE.MathUtils.radToDeg(e.x)} ${THREE.MathUtils.radToDeg(e.y)} ${THREE.MathUtils.radToDeg(e.z)}`);
      el.setAttribute('terminal-prop', { icon: cfg.icon, w: cfg.w, h: cfg.h });
      el.setAttribute('interactable', { label: cfg.label });
      el.addEventListener('interact', cfg.onUse);
      this.container().appendChild(el);
      return el;
    },


    /** Puzzle de cubos numa superfície: de pé, virado para o centro da sala (ou para fora da parede). */
    cubePuzzle(surface, cfg) {
      const el = document.createElement('a-entity');
      const pos = surface.pos.clone();
      let n;
      if (Math.abs(surface.normal.y) > 0.5) { n = new THREE.Vector3(-pos.x, 0, -pos.z); if (n.lengthSq() < 0.01) n.set(0, 0, 1); }
      else { n = new THREE.Vector3(surface.normal.x, 0, surface.normal.z); pos.addScaledVector(n.clone().normalize(), 0.15); }
      n.normalize();
      const yaw = THREE.MathUtils.radToDeg(Math.atan2(n.x, n.z));
      el.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
      el.setAttribute('rotation', `0 ${yaw} 0`);
      el.cubeCfg = cfg;
      el.setAttribute('cube-puzzle', '');
      this.container().appendChild(el);
      return el;
    },

    door(d) {
      const el = document.createElement('a-entity');
      const q = new THREE.Quaternion().setFromUnitVectors(Z, d.normal);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      el.setAttribute('position', `${d.pos.x + d.normal.x * 0.07} ${d.pos.y} ${d.pos.z + d.normal.z * 0.07}`);
      el.setAttribute('rotation', `0 ${THREE.MathUtils.radToDeg(e.y)} 0`);
      el.setAttribute('door-prop', '');
      this.container().appendChild(el);
      return el;
    },

    remove(el) { if (el && el.parentNode) el.parentNode.removeChild(el); },
  };
})();
