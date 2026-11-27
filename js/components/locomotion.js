/* THE DARK ROOM — locomoção.
 * DEMO: WASD (+Shift) com colisão contra os limites da sala e os adereços.
 * VR: stick esquerdo (além do deslocamento físico). AR: só deslocamento físico (a sala é real). */
AFRAME.registerComponent('locomotion', {
  schema: { speed: { default: 1.7 }, run: { default: 2.8 }, radius: { default: 0.28 } },

  init() {
    this.keys = {};
    this.stick = { x: 0, y: 0 };
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    const hl = document.getElementById('handL');
    if (hl) hl.addEventListener('thumbstickmoved', (e) => { this.stick.x = e.detail.x; this.stick.y = e.detail.y; });
  },

  tick(t, dtMs) {
    const sc = this.el.sceneEl, st = DR.state;
    if (st.phase !== 'playing' || st.modal || sc.is('ar-mode')) return;
    const dt = Math.min(dtMs, 80) / 1000;
    let mx = 0, mz = 0;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) mz -= 1;
    if (k.KeyS || k.ArrowDown) mz += 1;
    if (k.KeyA || k.ArrowLeft) mx -= 1;
    if (k.KeyD || k.ArrowRight) mx += 1;
    if (sc.is('vr-mode')) { mx += this.stick.x; mz += this.stick.y; }
    if (!mx && !mz) return;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    // direção relativa ao olhar (só o yaw)
    const head = document.getElementById('head').object3D;
    head.getWorldQuaternion(this.q);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q); this.fwd.y = 0; this.fwd.normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    const sp = (k.ShiftLeft || k.ShiftRight ? this.data.run : this.data.speed) * dt;
    const pos = this.el.object3D.position;
    const dx = (this.fwd.x * -mz + this.right.x * mx) * sp;
    const dz = (this.fwd.z * -mz + this.right.z * mx) * sp;
    this.moveWithCollision(pos, dx, dz);
  },

  moveWithCollision(pos, dx, dz) {
    const L = DR.world && DR.world.layout, R = this.data.radius;
    let x = pos.x + dx, z = pos.z + dz;
    if (L && L.room.virtual) {
      const r = L.room;
      x = THREE.MathUtils.clamp(x, r.minX + R, r.maxX - R);
      z = THREE.MathUtils.clamp(z, r.minZ + R, r.maxZ - R);
      // círculo contra retângulos dos adereços
      L.props.forEach((p) => {
        {
          const nx = THREE.MathUtils.clamp(x, p.cx - p.hx, p.cx + p.hx);
          const nz = THREE.MathUtils.clamp(z, p.cz - p.hz, p.cz + p.hz);
          const ddx = x - nx, ddz = z - nz, d2 = ddx * ddx + ddz * ddz;
          if (d2 < R * R) {
            if (d2 > 1e-6) { const d = Math.sqrt(d2); x = nx + (ddx / d) * R; z = nz + (ddz / d) * R; }
            else { // dentro do retângulo: expulsa pelo eixo mais curto
              const ex = p.hx + R - Math.abs(x - p.cx), ez = p.hz + R - Math.abs(z - p.cz);
              if (ex < ez) x += Math.sign(x - p.cx || 1) * ex; else z += Math.sign(z - p.cz || 1) * ez;
            }
          }
        }
      });
    }
    this.walked = (this.walked || 0) + Math.hypot(x - pos.x, z - pos.z);
    if (this.walked > 0.62) { this.walked = 0; DR.audio.step(); }
    pos.x = x; pos.z = z;
  },
});
