/* THE DARK ROOM — lanterna.
 * Um SpotLight real (ilumina a sala virtual) + um cone volumétrico subtil (poeira no ar) +
 * a geometria do feixe exposta ao resto do jogo (sistema "torch"): origem, direção e ângulo.
 * É esse feixe que o hidden-clue, o interactor e o dark-veil consultam. */
AFRAME.registerSystem('torch', {
  init() {
    this.comp = null;
    this.beam = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), halfAngle: 0.3, cosOuter: 0.95, on: true };
  },
  tick() {
    if (this.comp) this.comp.getBeam(this.beam);
  },
});

AFRAME.registerComponent('flashlight', {
  schema: {
    intensity: { default: 24 },
    distance: { default: 15 },
    penumbra: { default: 0.85 },
    minAngle: { default: 10 },   // graus (feixe fechado)
    maxAngle: { default: 26 },   // graus (feixe aberto)
    color: { default: '#ffedd2' },
  },

  init() {
    const D = this.data, el = this.el;
    this.focus = 0.45;
    this.on = true;
    this.flickerUntil = 0;
    this.holder = el.object3D;

    const light = new THREE.SpotLight(new THREE.Color(D.color), D.intensity, D.distance, 0.3, D.penumbra, 1.7);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.08;
    light.shadow.camera.far = D.distance;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    light.position.set(0, 0, 0);
    light.target.position.set(0, 0, -1);
    el.object3D.add(light, light.target);
    this.light = light;

    // cone volumétrico (poeira iluminada)
    const g = new THREE.ConeGeometry(1, 1, 40, 1, true);
    g.translate(0, -0.5, 0);
    g.rotateX(Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(D.color) }, uOpacity: { value: 0.13 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying float vT;
        void main(){
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          vT = clamp(-position.z, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity;
        varying vec3 vN; varying vec3 vV; varying float vT;
        void main(){
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float a = edge * pow(1.0 - vT, 1.8) * smoothstep(0.0, 0.08, vT) * uOpacity;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.cone = new THREE.Mesh(g, m);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 3;
    el.object3D.add(this.cone);

    this.sys = this.el.sceneEl.systems.torch;
    this.sys.comp = this;
    this.applyFocus();

    this._toggle = () => this.toggle();
    this._focus = (d) => { this.focus = THREE.MathUtils.clamp(this.focus - d.delta * 0.08, 0, 1); this.applyFocus(); };
    this._flicker = (d) => { this.flickerUntil = performance.now() + ((d && d.ms) || 700); };
    DR.bus.on('torch-toggle', this._toggle);
    DR.bus.on('torch-focus', this._focus);
    DR.bus.on('torch-flicker', this._flicker);

    // Em VR a lanterna passa para o controlador direito (apontamento real "targetRay").
    const hand = document.getElementById('handR');
    if (hand) {
      hand.addEventListener('controllerconnected', () => {
        hand.object3D.add(this.holder);
        this.holder.position.set(0, 0, 0);
        this.holder.rotation.set(0, 0, 0);
        this.onController = true;
      });
      hand.addEventListener('controllerdisconnected', () => {
        const head = document.getElementById('head');
        if (head) head.object3D.add(this.holder);
        this.onController = false;
      });
    }
  },

  applyFocus() {
    const D = this.data;
    const deg = THREE.MathUtils.lerp(D.maxAngle, D.minAngle, this.focus);
    this.angle = THREE.MathUtils.degToRad(deg);
    this.light.angle = this.angle;
    const len = 6, r = len * Math.tan(this.angle);
    this.cone.scale.set(r, r, len);
  },

  toggle() {
    this.on = !this.on;
    this.light.visible = this.on;
    this.cone.visible = this.on;
    DR.audio.torch(this.on);
  },

  getBeam(out) {
    const o = this.holder;
    o.updateWorldMatrix(true, false);
    out.origin.setFromMatrixPosition(o.matrixWorld);
    out.dir.set(0, 0, -1).transformDirection(o.matrixWorld);
    out.halfAngle = this.angle;
    out.cosOuter = Math.cos(this.angle);
    out.on = this.on;
    return out;
  },

  tick(t) {
    if (!this.on) return;
    const D = this.data;
    let f = 0.965 + 0.035 * Math.sin(t * 0.031) * Math.sin(t * 0.0113);
    if (performance.now() < this.flickerUntil) f *= Math.random() < 0.5 ? 0.1 : 0.9;
    this.light.intensity = D.intensity * f;
    this.cone.material.uniforms.uOpacity.value = 0.13 * f;
  },

  remove() {
    DR.bus.off('torch-toggle', this._toggle);
    DR.bus.off('torch-focus', this._focus);
    DR.bus.off('torch-flicker', this._flicker);
    if (this.sys.comp === this) this.sys.comp = null;
  },
});
