/* THE DARK ROOM — geração adaptativa do layout.
 *
 * O jogo nunca usa uma sala fixa. Existem duas origens para o espaço:
 *  - "virtual": sala procedural (modo DEMO) ou com dimensões definidas pelo utilizador (modo MANUAL);
 *  - "anchors": pontos marcados no espaço físico (AR Hit Test) ou apontados pelo utilizador.
 * Em ambos os casos o resultado é um conjunto de "superfícies" (posição + normal + tipo) onde os
 * níveis penduram pistas e estações. A seleção maximiza a distância entre pistas para obrigar
 * o jogador a percorrer a sala.
 */
(function () {
  const DR = window.DR;
  const U = DR.util;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V3(0, 1, 0);

  const KIND_LABEL = { wall: 'parede', table: 'mesa', floor: 'chão', ceiling: 'teto', object: 'objeto', door: 'porta' };

  function surface(kind, pos, normal, extra) {
    return Object.assign({ kind, pos, normal, label: KIND_LABEL[kind] || 'superfície', real: false }, extra || {});
  }

  function classifyAnchor(a) {
    const n = a.normal, y = a.pos.y;
    let kind = 'wall';
    if (n.y > 0.7) kind = y < 0.45 ? 'floor' : y < 1.35 ? 'table' : 'object';
    else if (n.y < -0.7) kind = 'ceiling';
    return surface(kind, a.pos.clone(), n.clone().normalize(), { real: true });
  }

  // paredes: 0 norte(z-) 1 este(x+) 2 sul(z+) 3 oeste(x-); normal aponta para o interior
  function wallFrame(room, i) {
    switch (i) {
      case 0: return { origin: V3(0, 0, room.minZ), tangent: V3(1, 0, 0), normal: V3(0, 0, 1), len: room.w };
      case 1: return { origin: V3(room.maxX, 0, 0), tangent: V3(0, 0, 1), normal: V3(-1, 0, 0), len: room.d };
      case 2: return { origin: V3(0, 0, room.maxZ), tangent: V3(-1, 0, 0), normal: V3(0, 0, -1), len: room.w };
      default: return { origin: V3(room.minX, 0, 0), tangent: V3(0, 0, -1), normal: V3(1, 0, 0), len: room.d };
    }
  }

  function rectHits(p, x, z, pad) {
    return Math.abs(x - p.cx) < p.hx + pad && Math.abs(z - p.cz) < p.hz + pad;
  }

  class Layout {
    constructor(room) {
      this.room = room;
      this.props = [];
      this.surfaces = [];
      this.pool = [];
      this.used = [];
      this.door = null;
      this.start = V3(0, 0, 0);
      this.source = 'virtual';
    }

    /** Junta pontos marcados pelo jogador (prioritários na seleção) às superfícies existentes. */
    addAnchors(list) {
      list.forEach((a) => this.surfaces.push(classifyAnchor(a)));
      this.resetUsed();
    }

    /* -------- amostragem -------- */
    wallSpot(opts) {
      opts = opts || {};
      for (let t = 0; t < 40; t++) {
        const wi = opts.wall != null ? opts.wall : U.randInt(0, 3);
        const f = wallFrame(this.room, wi);
        const u = U.rand(-f.len / 2 + 0.55, f.len / 2 - 0.55);
        const y = U.rand(0.55, Math.min(2.1, this.room.h - 0.45));
        const p = f.origin.clone().addScaledVector(f.tangent, u).add(V3(0, y, 0));
        if (this.door && p.distanceTo(this.door.pos) < 1.25) continue;
        const px = p.x + f.normal.x * 0.3, pz = p.z + f.normal.z * 0.3;
        if (this.props.some((pr) => y < pr.h + 0.25 && rectHits(pr, px, pz, 0.15))) continue;
        return surface('wall', p.addScaledVector(f.normal, 0.012), f.normal.clone());
      }
      return null;
    }

    floorSpot() {
      const r = this.room;
      for (let t = 0; t < 40; t++) {
        const x = U.rand(r.minX + 0.5, r.maxX - 0.5), z = U.rand(r.minZ + 0.5, r.maxZ - 0.5);
        if (Math.hypot(x, z) < 0.9) continue;
        if (this.props.some((p) => rectHits(p, x, z, 0.35))) continue;
        if (this.door && Math.hypot(x - this.door.pos.x, z - this.door.pos.z) < 1.1) continue;
        return surface('floor', V3(x, 0.012, z), UP.clone());
      }
      return null;
    }

    ceilingSpot() {
      const r = this.room;
      return surface('ceiling', V3(U.rand(r.minX + 0.8, r.maxX - 0.8), r.h - 0.012, U.rand(r.minZ + 0.8, r.maxZ - 0.8)), V3(0, -1, 0));
    }

    /* -------- seleção com dispersão máxima -------- */
    resetUsed() {
      this.pool = this.surfaces.slice();
      this.used = [];
    }

    pick(n, opts) {
      opts = opts || {};
      const kinds = opts.kinds;
      const minDist = opts.minDist != null ? opts.minDist : 1.1;
      const out = [];
      for (let i = 0; i < n; i++) {
        let cands = this.pool.filter((s) => !kinds || kinds.includes(s.kind));
        if (!cands.length) cands = this.pool.slice();
        if (!cands.length) break;
        const refs = this.used.map((s) => s.pos).concat(opts.avoid || [], [this.start]);
        let best = null, bestScore = -1;
        cands.forEach((s) => {
          let md = Infinity;
          refs.forEach((r) => { md = Math.min(md, s.pos.distanceTo(r)); });
          const score = md + (s.real ? 0.9 : 0) + Math.random() * 0.6 - (md < minDist ? 5 : 0);
          if (score > bestScore) { bestScore = score; best = s; }
        });
        this.pool.splice(this.pool.indexOf(best), 1);
        this.used.push(best);
        out.push(best);
      }
      return out;
    }

    /** Ponto de parede junto à porta (nível 1: "perto da porta"). */
    nearDoor() {
      const d = this.door;
      const tangent = V3(-d.normal.z, 0, d.normal.x);
      const side = Math.random() < 0.5 ? 1 : -1;
      const p = d.pos.clone().addScaledVector(tangent, side * 1.05);
      p.y = U.rand(1.0, 1.6);
      return surface('wall', p.addScaledVector(d.normal, 0.012), d.normal.clone(), { label: 'perto da porta' });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sala virtual (DEMO / MANUAL)                                        */
  /* ------------------------------------------------------------------ */
  const PROP_DEFS = {
    table:   { w: 1.3, d: 0.7, h: 0.78 },
    crate:   { w: 0.62, d: 0.62, h: 0.62 },
    barrel:  { w: 0.55, d: 0.55, h: 0.9 },
    shelf:   { w: 1.1, d: 0.36, h: 1.9, wall: true },
    cabinet: { w: 0.9, d: 0.5, h: 1.7, wall: true },
    pillar:  { w: 0.45, d: 0.45, h: 99 },
  };

  function virtualLayout(dims, randomize) {
    let { w, d, h } = dims;
    if (randomize) { w = U.rand(4.2, 6.4); d = U.rand(4.2, 6.4); h = U.rand(2.5, 3.0); }
    const room = { w, d, h, minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, virtual: true };
    const L = new Layout(room);
    L.source = 'virtual';

    // porta
    const wi = U.randInt(0, 3), f = wallFrame(room, wi);
    const u = U.rand(-f.len / 2 + 1.2, f.len / 2 - 1.2);
    L.door = {
      pos: f.origin.clone().addScaledVector(f.tangent, u).add(V3(0, 1.0, 0)),
      normal: f.normal.clone(), wall: wi,
    };

    // adereços (colocados com rejeição para não se sobreporem nem bloquearem porta/início)
    const types = U.shuffle(['table', 'crate', 'barrel', 'shelf', 'cabinet', 'crate', 'pillar']);
    const count = U.randInt(4, 6);
    for (let i = 0; i < types.length && L.props.length < count; i++) {
      const t = types[i], def = PROP_DEFS[t];
      for (let tries = 0; tries < 30; tries++) {
        let x, z, rotY;
        if (def.wall) {
          const pwi = U.randInt(0, 3), pf = wallFrame(room, pwi);
          const pu = U.rand(-pf.len / 2 + 0.9, pf.len / 2 - 0.9);
          const c = pf.origin.clone().addScaledVector(pf.tangent, pu).addScaledVector(pf.normal, def.d / 2 + 0.02);
          x = c.x; z = c.z; rotY = Math.atan2(pf.normal.x, pf.normal.z);
        } else {
          x = U.rand(room.minX + 0.8, room.maxX - 0.8); z = U.rand(room.minZ + 0.8, room.maxZ - 0.8);
          rotY = t === 'table' ? U.pick([0, Math.PI / 2]) + U.rand(-0.2, 0.2) : U.rand(0, Math.PI);
        }
        const cos = Math.abs(Math.cos(rotY)), sin = Math.abs(Math.sin(rotY));
        const hx = (def.w * cos + def.d * sin) / 2, hz = (def.w * sin + def.d * cos) / 2;
        const p = { type: t, cx: x, cz: z, hx, hz, w: def.w, d: def.d, h: Math.min(def.h, room.h), rotY };
        if (rectHits(p, 0, 0, 0.8)) continue;
        const dz = L.door.pos.clone().addScaledVector(L.door.normal, 0.9);
        if (rectHits(p, dz.x, dz.z, 0.6)) continue;
        if (L.props.some((q) => Math.abs(p.cx - q.cx) < p.hx + q.hx + 0.35 && Math.abs(p.cz - q.cz) < p.hz + q.hz + 0.35)) continue;
        L.props.push(p);
        break;
      }
    }

    // superfícies
    for (let i = 0; i < 20; i++) { const s = L.wallSpot(); if (s) L.surfaces.push(s); }
    for (let i = 0; i < 5; i++) { const s = L.floorSpot(); if (s) L.surfaces.push(s); }
    for (let i = 0; i < 2; i++) L.surfaces.push(L.ceilingSpot());
    L.props.forEach((p) => {
      if (p.type === 'pillar') return;
      const ox = U.rand(-p.hx * 0.5, p.hx * 0.5), oz = U.rand(-p.hz * 0.5, p.hz * 0.5);
      if (p.type === 'shelf' || p.type === 'cabinet') {
        // face frontal (normal virada para o interior)
        const n = V3(Math.sin(p.rotY), 0, Math.cos(p.rotY));
        const pos = V3(p.cx, U.rand(0.6, p.h - 0.35), p.cz).addScaledVector(n, p.d / 2 + 0.012);
        L.surfaces.push(surface('object', pos, n));
      } else {
        L.surfaces.push(surface(p.type === 'table' ? 'table' : 'object', V3(p.cx + ox, p.h + 0.012, p.cz + oz), UP.clone()));
      }
    });
    L.resetUsed();
    return L;
  }

  /* ------------------------------------------------------------------ */
  /* Sala a partir de âncoras (AR hit-test / pontos marcados)           */
  /* ------------------------------------------------------------------ */
  function anchorLayout(anchors) {
    const surfaces = anchors.map(classifyAnchor);
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0, maxY = 2.4;
    surfaces.forEach((s) => {
      minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z);
      if (s.kind === 'ceiling') maxY = Math.max(maxY, s.pos.y);
    });
    const pad = 0.4;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    // garante uma área mínima jogável em torno da origem
    if (maxX - minX < 3.4) { const c = (maxX + minX) / 2; minX = c - 1.7; maxX = c + 1.7; }
    if (maxZ - minZ < 3.4) { const c = (maxZ + minZ) / 2; minZ = c - 1.7; maxZ = c + 1.7; }
    const room = { w: maxX - minX, d: maxZ - minZ, h: maxY, minX, maxX, minZ, maxZ, virtual: false };
    const L = new Layout(room);
    L.source = 'anchors';

    // porta = parede marcada mais distante do início (ou parede sintetizada)
    const walls = surfaces.filter((s) => s.kind === 'wall');
    if (walls.length) {
      walls.sort((a, b) => b.pos.length() - a.pos.length());
      const w = walls[0];
      const n = V3(w.normal.x, 0, w.normal.z).normalize();
      L.door = { pos: V3(w.pos.x, 1.0, w.pos.z), normal: n, wall: -1 };
      surfaces.splice(surfaces.indexOf(w), 1);
    } else {
      const f = wallFrame(room, U.randInt(0, 3));
      L.door = { pos: f.origin.clone().add(V3(0, 1.0, 0)), normal: f.normal.clone(), wall: -1 };
    }
    L.surfaces = surfaces;
    // completa com pontos sintéticos para haver sempre superfícies suficientes
    const need = Math.max(0, 22 - L.surfaces.length);
    for (let i = 0; i < need; i++) {
      const r = Math.random();
      const s = r < 0.65 ? L.wallSpot() : r < 0.9 ? L.floorSpot() : L.ceilingSpot();
      if (s) L.surfaces.push(s);
    }
    L.resetUsed();
    return L;
  }

  DR.layout = {
    generate(opts) {
      if (opts.anchors && opts.anchors.length) return anchorLayout(opts.anchors);
      return virtualLayout(opts.dims, opts.randomize);
    },
    classifyAnchor,
    KIND_LABEL,
  };
})();
