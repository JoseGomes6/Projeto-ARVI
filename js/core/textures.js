/* THE DARK ROOM — texturas procedurais (canvas): paredes, números, símbolos, puzzle */
(function () {
  const DR = window.DR;
  const BONE = '#e6dcd2';
  const BLOOD = '#b3121a';
  const cache = {};

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function texFrom(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  /* ------- superfícies da sala ------- */
  function surface(kind, tint) {
    const key = 'surf:' + kind;
    if (cache[key]) return cache[key];
    const S = 512, c = canvas(S, S), g = c.getContext('2d');
    const base = { wall: 78, floor: 62, ceil: 54, wood: 70, metal: 66 }[kind] || 70;
    g.fillStyle = `rgb(${base},${base},${base + 2})`;
    g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 38;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // manchas
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.75;
      gr.addColorStop(0, dark ? 'rgba(0,0,0,0.28)' : 'rgba(120,120,125,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (kind === 'wood') {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      for (let y = 0; y < S; y += 4 + Math.random() * 8) {
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 2);
        g.stroke();
      }
    }
    if (kind === 'floor') {
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3;
      g.strokeRect(0, 0, S, S); g.strokeRect(S / 2, 0, 0, S); g.strokeRect(0, S / 2, S, 0);
    }
    if (kind === 'wall') {
      // fissuras
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        let x = Math.random() * S, y = Math.random() * S;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 14; s++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 22; g.lineTo(x, y); }
        g.stroke();
      }
    }
    return (cache[key] = texFrom(c, [2, 2]));
  }

  /* ------- glifos riscados ------- */
  function glow(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur; }

  function scratchText(g, text, x, y, size) {
    g.font = `700 ${size}px "Courier New", monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // contorno vermelho + núcleo osso: aspeto "riscado a giz"
    glow(g, BLOOD, 28);
    g.fillStyle = BONE; g.fillText(text, x, y);
    glow(g, 'transparent', 0);
    g.globalAlpha = 0.5;
    g.lineWidth = 2; g.strokeStyle = BLOOD;
    g.strokeText(text, x + 1.5, y + 1);
    g.globalAlpha = 1;
  }

  // posição na sequência: 1..4 pequenos traços por baixo do número
  function digitCanvas(value, pos) {
    const c = canvas(256, 256), g = c.getContext('2d');
    scratchText(g, String(value), 128, 112, 190);
    g.fillStyle = BLOOD; glow(g, BLOOD, 12);
    const n = pos, gap = 26, x0 = 128 - ((n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) g.fillRect(x0 + i * gap - 3, 214, 6, 26);
    return c;
  }

  const SYMBOLS = ['eye', 'moon', 'key', 'flame', 'hourglass', 'serpent'];
  const SYMBOL_NAMES = { eye: 'Olho', moon: 'Lua', key: 'Chave', flame: 'Chama', hourglass: 'Ampulheta', serpent: 'Serpente' };

  function drawSymbol(g, name, cx, cy, r, lw, ink) {
    g.save();
    g.translate(cx, cy);
    g.lineWidth = lw || r * 0.1; g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = ink || BONE; g.fillStyle = ink || BONE;
    if (ink) glow(g, 'transparent', 0); else glow(g, BLOOD, r * 0.35);
    g.beginPath();
    switch (name) {
      case 'eye':
        g.moveTo(-r, 0); g.quadraticCurveTo(0, -r * 1.05, r, 0); g.quadraticCurveTo(0, r * 1.05, -r, 0); g.stroke();
        g.beginPath(); g.arc(0, 0, r * 0.38, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(0, 0, r * 0.14, 0, Math.PI * 2); g.fill();
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * r * 0.32, -r * 0.62 + Math.abs(i) * r * 0.1); g.lineTo(i * r * 0.4, -r * 0.92 + Math.abs(i) * r * 0.1); g.stroke(); }
        break;
      case 'moon':
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.moveTo(r * 0.28 + r * 0.7, 0);
        g.arc(r * 0.28, 0, r * 0.7, 0, Math.PI * 2);
        g.fill('evenodd');
        break;
      case 'key':
        g.arc(-r * 0.45, 0, r * 0.38, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(-r * 0.07, 0); g.lineTo(r * 0.95, 0);
        g.moveTo(r * 0.55, 0); g.lineTo(r * 0.55, r * 0.35);
        g.moveTo(r * 0.85, 0); g.lineTo(r * 0.85, r * 0.45); g.stroke();
        break;
      case 'flame':
        g.moveTo(0, -r);
        g.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.8, r * 0.9, 0, r * 0.95);
        g.bezierCurveTo(-r * 0.8, r * 0.9, -r * 0.8, -r * 0.1, -r * 0.2, -r * 0.45);
        g.bezierCurveTo(-r * 0.1, -r * 0.2, 0, -r * 0.5, 0, -r); g.stroke();
        g.beginPath(); g.moveTo(0, r * 0.2);
        g.bezierCurveTo(r * 0.3, r * 0.4, r * 0.2, r * 0.75, 0, r * 0.75);
        g.bezierCurveTo(-r * 0.25, r * 0.75, -r * 0.3, r * 0.4, 0, r * 0.2); g.fill();
        break;
      case 'hourglass':
        g.moveTo(-r * 0.7, -r); g.lineTo(r * 0.7, -r); g.lineTo(-r * 0.7, r); g.lineTo(r * 0.7, r); g.closePath(); g.stroke();
        g.beginPath(); g.moveTo(-r * 0.85, -r); g.lineTo(r * 0.85, -r); g.moveTo(-r * 0.85, r); g.lineTo(r * 0.85, r); g.stroke();
        g.beginPath(); g.moveTo(-r * 0.25, r * 0.95); g.lineTo(r * 0.25, r * 0.95); g.lineTo(0, r * 0.45); g.closePath(); g.fill();
        break;
      case 'serpent':
        for (let a = 0; a < Math.PI * 5.2; a += 0.12) {
          const rr = r * 0.08 + (a / (Math.PI * 5.2)) * r * 0.92;
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
        g.beginPath(); g.arc(r * 0.05, r * 0.05, r * 0.07, 0, Math.PI * 2); g.fill();
        break;
    }
    g.restore();
  }

  function symbolCanvas(name) {
    const c = canvas(256, 256), g = c.getContext('2d');
    // placa circular riscada
    g.strokeStyle = 'rgba(230,220,210,0.55)'; g.lineWidth = 5; glow(g, BLOOD, 14);
    g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke();
    drawSymbol(g, name, 128, 128, 76);
    return c;
  }

  function relationCanvas(a, b) {
    const c = canvas(512, 256), g = c.getContext('2d');
    g.strokeStyle = 'rgba(230,220,210,0.5)'; g.lineWidth = 4; glow(g, BLOOD, 14);
    g.strokeRect(8, 8, 496, 240);
    drawSymbol(g, a, 120, 128, 70);
    drawSymbol(g, b, 392, 128, 70);
    // seta A -> B
    g.strokeStyle = BLOOD; g.lineWidth = 8; glow(g, BLOOD, 18);
    g.beginPath(); g.moveTo(205, 128); g.lineTo(295, 128);
    g.moveTo(268, 100); g.lineTo(298, 128); g.lineTo(268, 156); g.stroke();
    return c;
  }

  /* ------- puzzle dos cubos ------- */
  // fragmento de fotografia rasgado com o símbolo certo de um cubo e a sua posição (traços)
  function fragCanvas(name, pos) {
    const S = 256, c = canvas(S, S), g = c.getContext('2d');
    g.save();
    g.beginPath();
    const pts = [[18, 24], [90, 12], [170, 22], [238, 14], [244, 96], [232, 170], [246, 236], [150, 244], [70, 236], [14, 244], [24, 160], [10, 86]];
    pts.forEach((q, i) => { if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]); });
    g.closePath(); g.clip();
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, '#a79e90'); gr.addColorStop(1, '#6f695f');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.08) + ')'; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    drawSymbol(g, name, 128, 112, 64, 9, '#6b0f14');
    g.fillStyle = '#6b0f14';
    const gap = 26, x0 = 128 - ((pos - 1) * gap) / 2;
    for (let i = 0; i < pos; i++) g.fillRect(x0 + i * gap - 3, 196, 6, 28);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); pts.forEach((q, i) => { if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]); }); g.closePath(); g.stroke();
    return c;
  }

  // face gravada de um cubo de pedra
  function cubeFaceCanvas(name) {
    const S = 256, c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#2b2b2d'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')'; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 8; g.strokeRect(4, 4, S - 8, S - 8);
    g.strokeStyle = 'rgba(230,220,210,0.22)'; g.lineWidth = 3; g.strokeRect(14, 14, S - 28, S - 28);
    drawSymbol(g, name, S / 2, S / 2, 72, 9);
    return c;
  }

  /* ------- etiquetas de interface ------- */
  function labelCanvas(text, w, h, o) {
    o = o || {};
    const c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = o.bg || 'rgba(14,14,16,0.92)'; g.fillRect(0, 0, w, h);
    g.lineWidth = o.border || 3; g.strokeStyle = o.stroke || 'rgba(230,220,210,0.35)';
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    if (o.draw) o.draw(g, w, h);
    if (text) {
      g.fillStyle = o.fg || BONE;
      g.font = `${o.weight || 600} ${o.size || h * 0.5}px ${o.font || '"Helvetica Neue", Arial, sans-serif'}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + (o.dy || 0));
    }
    return c;
  }

  /** Cria (ou devolve da cache) a textura de um glifo a partir de uma chave "tipo:arg1:arg2". */
  function glyph(key) {
    if (cache[key]) return cache[key];
    const p = key.split(':');
    let c;
    switch (p[0]) {
      case 'digit': c = digitCanvas(p[1], +p[2]); break;
      case 'sym': c = symbolCanvas(p[1]); break;
      case 'rel': c = relationCanvas(p[1], p[2]); break;
      case 'frag': c = fragCanvas(p[1], +p[2]); break;
      case 'cube': c = cubeFaceCanvas(p[1]); break;
      default: c = canvas(8, 8);
    }
    return (cache[key] = { canvas: c, texture: texFrom(c) });
  }

  DR.textures = {
    BONE, BLOOD, SYMBOLS, SYMBOL_NAMES,
    canvas, texFrom, surface, labelCanvas, drawSymbol, symbolCanvas, glyph,
  };
})();
