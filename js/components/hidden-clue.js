/* THE DARK ROOM — pista escondida.
 * A pista é invisível (opacity 0) e só se revela progressivamente quando o feixe da lanterna
 * incide DIRETAMENTE sobre ela: teste do cone (ângulo + tamanho angular do objeto), alcance,
 * orientação da superfície e oclusão (raycast contra a geometria sólida da sala).
 * Quando a luz sai, volta a desvanecer. Ao completar a revelação dispara "clue-found" (1x). */
AFRAME.registerComponent('hidden-clue', {
  schema: {
    id: { default: '' },
    revealTime: { default: 1.15 },  // segundos de luz direta até 100%
    fadeTime: { default: 0.9 },     // segundos até voltar a esconder-se
    range: { default: 11 },
    size: { default: 0.3 },         // diâmetro aproximado (m), para o teste angular
    inner: { default: 0.8 },        // fração do cone considerada "luz direta"
    group: { default: '' },
  },

  init() {
    this.r = 0;
    this.found = false;
    this.occTimer = 0;
    this.occluded = false;
    this.heard = false;
    this.wp = new THREE.Vector3();
    this.wq = new THREE.Quaternion();
    this.nrm = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.mats = [];
    this.collect();
    this.apply(0);
  },

  /** Recolhe os materiais que devem desvanecer (marcados com userData.fade). */
  collect() {
    this.mats.length = 0;
    this.el.object3D.traverse((o) => {
      if (o.material && o.material.userData && o.material.userData.fade != null) this.mats.push(o.material);
    });
  },

  apply(r) {
    const vis = r > 0.003;
    this.el.object3D.visible = vis;
    if (!vis) return;
    if (!this.mats.length) this.collect();
    // pequeno "tremeluzir" enquanto a pista ainda está a emergir
    const flick = r < 0.98 ? 1 - 0.35 * (1 - r) * Math.random() : 1;
    const e = r * r * (3 - 2 * r);
    this.mats.forEach((m) => { m.opacity = e * flick * m.userData.fade; });
  },

  tick(t, dtMs) {
    const dt = Math.min(dtMs, 100) / 1000;
    const beam = this.el.sceneEl.systems.torch.beam;
    let k = 0;

    if (window.DR && DR.debugReveal) {
      k = 1;
    } else if (beam.on) {
      const o = this.el.object3D;
      o.updateWorldMatrix(true, false);
      this.wp.setFromMatrixPosition(o.matrixWorld);
      o.getWorldQuaternion(this.wq);
      this.nrm.set(0, 0, 1).applyQuaternion(this.wq);
      this.v.copy(this.wp).sub(beam.origin);
      const dist = this.v.length();
      if (dist < this.data.range && dist > 0.05) {
        this.v.divideScalar(dist);
        const ang = Math.acos(THREE.MathUtils.clamp(this.v.dot(beam.dir), -1, 1));
        const sizeAng = Math.atan((this.data.size * 0.5) / dist);
        const half = beam.halfAngle;
        const off = ang - sizeAng;                         // distância angular ao centro do feixe
        const facing = -this.v.dot(this.nrm);              // a superfície tem de olhar para o jogador
        if (off < half * this.data.inner && facing > 0.1) {
          // quanto mais central, mais depressa revela
          k = 1 - THREE.MathUtils.smoothstep(off, half * 0.25, half * this.data.inner);
          k = Math.max(k, 0.25) * (1 - THREE.MathUtils.smoothstep(dist, this.data.range * 0.6, this.data.range));
          k *= 0.5 + 0.5 * Math.min(1, facing * 2);
          // oclusão (a cada ~120 ms)
          this.occTimer -= dt;
          if (this.occTimer <= 0) {
            this.occTimer = 0.12;
            const solids = this.el.sceneEl.systems['dr-interaction'].solids;
            this.ray.set(beam.origin, this.v);
            this.ray.far = dist - 0.06;
            this.occluded = solids.length ? this.ray.intersectObjects(solids, false).length > 0 : false;
          }
          if (this.occluded) k = 0;
        }
      }
    }

    const before = this.r;
    if (k > 0) this.r = Math.min(1, this.r + (k * dt) / this.data.revealTime);
    else this.r = Math.max(0, this.r - dt / this.data.fadeTime);
    if (this.r === before && this.r === 0) return;
    this.apply(this.r);

    if (!this.heard && this.r > 0.2) { this.heard = true; DR.audio.reveal(0.2); }
    if (this.r < 0.02) this.heard = false;
    if (!this.found && this.r >= 0.97) this.forceFound();
  },

  /** Marca a pista como encontrada (1x) e avisa o jogo. */
  forceFound() {
    if (this.found) return;
    this.found = true;
    this.el.emit('clue-found', { id: this.data.id });
    DR.bus.emit('clue-found', { el: this.el, id: this.data.id, group: this.data.group });
  },
});
