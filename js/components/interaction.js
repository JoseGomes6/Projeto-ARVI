/* THE DARK ROOM — sistema de interação / deteção de colisões.
 * Um raio parte do feixe da lanterna (controlador) ou do centro da vista (cabeça) e é testado
 * contra todos os objetos "interactable" e contra a geometria sólida da sala (oclusão).
 * O alvo atual recebe o evento "interact" quando o jogador carrega em E / clica / prime o gatilho. */
AFRAME.registerSystem('dr-interaction', {
  init() {
    this.solids = [];        // meshes que bloqueiam luz e raio
    this.targets = [];       // entidades com o componente "interactable"
    this.hover = null;
    this.ray = new THREE.Raycaster();
    this.o = new THREE.Vector3();
    this.d = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    DR.bus.on('action', () => this.activate());
  },

  addSolids(root) { root.traverse((o) => { if (o.isMesh) this.solids.push(o); }); },
  clearSolids() { this.solids.length = 0; },
  register(el) { if (!this.targets.includes(el)) this.targets.push(el); },
  unregister(el) {
    this.targets = this.targets.filter((e) => e !== el);
    if (this.hover === el) this.setHover(null);
  },

  /** Raio de pontaria: controlador (se a lanterna lá estiver) ou centro da câmara. */
  aim(o, d) {
    const torch = this.el.systems.torch;
    if (torch.comp && torch.comp.onController) { o.copy(torch.beam.origin); d.copy(torch.beam.dir); return; }
    const cam = this.el.camera;
    cam.getWorldPosition(o);
    cam.getWorldDirection(d);
  },

  available(el) {
    const c = el.components.interactable;
    if (!c || !c.data.enabled) return false;
    if (DR.state.modal !== c.data.modal) return false;
    const hc = el.components['hidden-clue'];
    if (hc && hc.r < 0.55) return false;
    return true;
  },

  setHover(el) {
    if (el === this.hover) return;
    if (this.hover) this.hover.emit('hover-end');
    this.hover = el;
    if (el) { el.emit('hover-start'); DR.ui.prompt(el.components.interactable.data.label); }
    else DR.ui.prompt(null);
  },

  tick() {
    if (DR.state.phase !== 'playing') { if (this.hover) this.setHover(null); return; }
    this.aim(this.o, this.d);
    this.ray.set(this.o, this.d);
    this.ray.far = 7;
    const modal = DR.state.modal;
    let best = null, bestD = Infinity;
    for (const el of this.targets) {
      if (!this.available(el)) continue;
      const hits = this.ray.intersectObject(el.object3D, true);
      if (hits.length) {
        if (hits[0].distance < bestD) { bestD = hits[0].distance; best = el; }
      } else if (!modal && el.components['hidden-clue']) {
        // assistência de mira: pistas já reveladas aceitam um pequeno desvio angular
        el.object3D.getWorldPosition(this.tmp);
        this.tmp.sub(this.o);
        const dist = this.tmp.length();
        if (dist < 5 && Math.acos(THREE.MathUtils.clamp(this.tmp.divideScalar(dist).dot(this.d), -1, 1)) < 0.075 && dist < bestD) {
          bestD = dist; best = el;
        }
      }
    }
    if (best && !modal && this.solids.length) {
      const s = this.ray.intersectObjects(this.solids, false)[0];
      if (s && s.distance < bestD - 0.09) best = null;
    }
    this.setHover(best);
  },

  activate() {
    if (DR.state.phase !== 'playing' || !this.hover) return;
    DR.audio.click();
    this.hover.emit('interact');
  },
});

AFRAME.registerComponent('interactable', {
  schema: { label: { default: 'Examinar' }, enabled: { default: true }, modal: { default: false } },
  init() { this.sys = this.el.sceneEl.systems['dr-interaction']; this.sys.register(this.el); },
  remove() { this.sys.unregister(this.el); },
});
