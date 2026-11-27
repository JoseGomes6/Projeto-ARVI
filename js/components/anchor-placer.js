/* THE DARK ROOM — marcação do espaço.
 * AR: usa WebXR Hit Test (superfícies reais: paredes, mesas, chão) e o jogador "carimba" âncoras.
 * Fallback/manual/DEMO: o raio do olhar é testado contra a sala virtual; sem sala nem hit-test
 * usa-se o ponto do olhar a ~2.5 m (aproximação manual).
 * Resultado: lista de âncoras {pos, normal} que o Layout converte em superfícies para as pistas. */
AFRAME.registerComponent('anchor-placer', {
  init() {
    this.active = false;
    this.anchors = [];
    this.min = 8;
    this.hit = null;
    this.hitSource = null;
    this.mode = 'virtual';       // 'hittest' | 'virtual' | 'gaze'
    this.root = new THREE.Group();
    this.el.object3D.add(this.root);

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.08, 40),
      new THREE.MeshBasicMaterial({ color: 0xb3121a, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 }));
    this.reticle.renderOrder = 999;
    this.reticle.visible = false;
    this.root.add(this.reticle);

    this.ray = new THREE.Raycaster();
    this.o = new THREE.Vector3(); this.d = new THREE.Vector3();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion();
    this.z = new THREE.Vector3(0, 0, 1);
    this.markers = [];
    this._action = () => this.place();
    this._cancel = () => this.undo();
  },

  async start(opts) {
    opts = opts || {};
    this.min = opts.min || 8;
    this.anchors = [];
    this.clearMarkers();
    this.active = true;
    this.hit = null;
    this.mode = opts.virtual ? 'virtual' : 'gaze';
    DR.bus.on('action', this._action);
    DR.bus.on('cancel', this._cancel);
    DR.ui.placing(0, this.min);

    const sc = this.el.sceneEl;
    if (!opts.virtual && !opts.forceGaze && sc.is('ar-mode')) {
      try {
        const session = sc.renderer.xr.getSession();
        const vs = await session.requestReferenceSpace('viewer');
        this.hitSource = await session.requestHitTestSource({ space: vs });
        this.mode = 'hittest';
        session.addEventListener('end', () => { this.hitSource = null; });
      } catch (e) {
        console.warn('Hit-test indisponível, a usar marcação por olhar:', e);
        this.mode = 'gaze';
        DR.bus.emit('hit-test-unavailable');
      }
    }
    return this.mode;
  },

  stop() {
    this.active = false;
    this.reticle.visible = false;
    DR.bus.off('action', this._action);
    DR.bus.off('cancel', this._cancel);
    if (this.hitSource) { try { this.hitSource.cancel(); } catch (e) {} this.hitSource = null; }
    this.clearMarkers();
    return this.anchors.slice();
  },

  clearMarkers() { this.markers.forEach((m) => this.root.remove(m)); this.markers = []; },

  place() {
    if (!this.active || !this.hit) return;
    this.anchors.push({ pos: this.hit.pos.clone(), normal: this.hit.normal.clone() });
    const mk = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0xb3121a, side: THREE.DoubleSide }));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    mk.add(ring, dot);
    mk.position.copy(this.hit.pos).addScaledVector(this.hit.normal, 0.01);
    mk.quaternion.setFromUnitVectors(this.z, this.hit.normal);
    this.root.add(mk); this.markers.push(mk);
    DR.audio.place();
    DR.ui.placing(this.anchors.length, this.min);
  },

  undo() {
    if (!this.active || !this.anchors.length) return;
    this.anchors.pop();
    this.root.remove(this.markers.pop());
    DR.ui.placing(this.anchors.length, this.min);
  },

  tick() {
    if (!this.active) return;
    const sc = this.el.sceneEl;
    let hit = null;

    if (this.mode === 'hittest' && this.hitSource && sc.frame) {
      const res = sc.frame.getHitTestResults(this.hitSource);
      const ref = sc.renderer.xr.getReferenceSpace();
      if (res.length) {
        const pose = res[0].getPose(ref);
        if (pose) {
          this.m4.fromArray(pose.transform.matrix);
          const pos = new THREE.Vector3().setFromMatrixPosition(this.m4);
          this.q.setFromRotationMatrix(this.m4);
          // o eixo Y da pose do hit-test é a normal da superfície
          hit = { pos, normal: new THREE.Vector3(0, 1, 0).applyQuaternion(this.q).normalize() };
        }
      }
    } else {
      const sys = sc.systems['dr-interaction'];
      sys.aim(this.o, this.d);
      if (this.mode === 'virtual' && sys.solids.length) {
        this.ray.set(this.o, this.d); this.ray.far = 9;
        const h = this.ray.intersectObjects(sys.solids, false)[0];
        if (h && h.face) {
          const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
          if (n.dot(this.d) > 0) n.negate();
          hit = { pos: h.point.clone(), normal: n };
        }
      } else if (this.mode === 'gaze') {
        // sem hit-test: chão se olhar para baixo, senão uma "parede" a 2.5 m
        if (this.d.y < -0.2) {
          const t = -this.o.y / this.d.y;
          hit = { pos: this.o.clone().addScaledVector(this.d, t), normal: new THREE.Vector3(0, 1, 0) };
        } else {
          const n = new THREE.Vector3(-this.d.x, 0, -this.d.z).normalize();
          hit = { pos: this.o.clone().addScaledVector(this.d, 2.5), normal: n };
        }
      }
    }

    this.hit = hit;
    this.reticle.visible = !!hit;
    if (hit) {
      this.reticle.position.copy(hit.pos).addScaledVector(hit.normal, 0.012);
      this.reticle.quaternion.setFromUnitVectors(this.z, hit.normal);
    }
  },
});
