/* THE DARK ROOM — véu de escuridão para AR (passthrough).
 * No modo AR a sala real é visível através da câmara. Para criar o "escape room às escuras",
 * uma esfera invertida e quase opaca cobre tudo, exceto onde passa o feixe da lanterna
 * (máscara cónica calculada no shader a partir da geometria do feixe). */
AFRAME.registerComponent('dark-veil', {
  schema: { darkness: { default: 0.975 } },

  init() {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide,
      uniforms: {
        uOrigin: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) },
        uCos: { value: 0.95 }, uCosIn: { value: 0.98 }, uDark: { value: this.data.darkness }, uOn: { value: 1 }, uTime: { value: 0 },
      },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform vec3 uOrigin; uniform vec3 uDir; uniform float uCos; uniform float uCosIn; uniform float uDark; uniform float uOn; uniform float uTime;
        varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vW - uOrigin);
          float c = dot(d, uDir);
          float lit = smoothstep(uCos, uCosIn, c) * uOn;
          float a = uDark * (1.0 - lit * 0.97);
          a += (h(gl_FragCoord.xy + uTime) - 0.5) * 0.02;   // grão
          gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(a, 0.0, 1.0));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 20), m);
    this.mesh.renderOrder = 9999;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.el.object3D.add(this.mesh);
    this.cam = new THREE.Vector3();
  },

  tick(t) {
    const sc = this.el;
    const active = sc.is('ar-mode');
    this.mesh.visible = active;
    if (!active) return;
    const beam = sc.systems.torch.beam, u = this.mesh.material.uniforms;
    sc.camera.getWorldPosition(this.cam);
    this.mesh.position.copy(this.cam);
    u.uOrigin.value.copy(beam.origin);
    u.uDir.value.copy(beam.dir);
    u.uCos.value = Math.cos(beam.halfAngle * 1.05);
    u.uCosIn.value = Math.cos(beam.halfAngle * 0.35);
    u.uOn.value = beam.on ? 1 : 0;
    u.uTime.value = (t % 1000) * 0.01;
  },
});
