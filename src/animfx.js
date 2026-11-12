// Draws the rich animation channels (anims.js / MaqtoShared.vaFx) of one layer: device frames, colour and light,
// reveals, pixelate, blur, wave, glitch, RGB split, glow, 3D turns, stretch/skew, motion blur, ghosts, pieces and particles.
// Used by the preview, the animation thumbnails and the export (which saves these frames as PNGs), so all three match.
// draw(dst, layer, B, q): dst a 2D context; layer a canvas holding only this clip, already moved / scaled / turned;
// B the clip box in layer pixels {x, y, w, h, r (deg)}; q the channels. Everything is a pure function of q (seeded noise).
(function (root) {
  const rnd = root.MaqtoAnims.rnd, clamp = (v, a, b) => Math.min(b, Math.max(a, v)), tau = Math.PI * 2;
  const pool = [];
  const buf = (i, w, h) => {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const c = pool[i] || (pool[i] = document.createElement('canvas'));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true;
    g.clearRect(0, 0, w, h);
    return c;
  };
  const reset = g => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
  const local = (g, B) => { g.setTransform(1, 0, 0, 1, 0, 0); g.translate(B.cx, B.cy); g.rotate(B.rad); };
  const rrect = (g, x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const heart = (g, cx, cy, s) => { // s: width
    g.moveTo(cx, cy + s * 0.35);
    g.bezierCurveTo(cx - s * 0.55, cy - s * 0.05, cx - s * 0.35, cy - s * 0.55, cx, cy - s * 0.25);
    g.bezierCurveTo(cx + s * 0.35, cy - s * 0.55, cx + s * 0.55, cy - s * 0.05, cx, cy + s * 0.35); g.closePath();
  };
  const star = (g, cx, cy, R, r, n = 5, a0 = -Math.PI / 2) => { for (let i = 0; i < n * 2; i++) { const a = a0 + i * Math.PI / n, q = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](cx + q * Math.cos(a), cy + q * Math.sin(a)); } g.closePath(); };
  // axis-aligned bounds of the (turned) box
  const bounds = B => { const c = Math.abs(Math.cos(B.rad)), s = Math.abs(Math.sin(B.rad)), w = B.w * c + B.h * s, h = B.w * s + B.h * c; return { x: B.cx - w / 2, y: B.cy - h / 2, w, h }; };

  /* ---------- device frames (drawn around the box, in its own turned space) ---------- */
  const DEV = {
    phone: { bz: 0.045, sr: 0.13, body: '#0b0b0d', rim: '#55555e', island: 1, keys: 1 },
    phoneW: { bz: 0.045, sr: 0.13, body: '#ececf1', rim: '#b9b9c2', island: 1, keys: 1 },
    tablet: { bz: 0.055, sr: 0.05, body: '#111114', rim: '#4a4a52', cam: 1 },
    watch: { bz: 0.08, sr: 0.24, body: '#121215', rim: '#5a5a63', strap: 1 },
    laptop: { bz: 0.03, sr: 0.015, body: '#121215', rim: '#3a3a40', base: 1, cam: 1, chin: 1.5 },
    tv: { bz: 0.025, sr: 0.006, body: '#070708', rim: '#2a2a2e', stand: 1 },
    browser: { bar: 0.085, sr: 0.03, body: '#eef0f3', rim: '#cfd3da' },
    polaroid: { pad: [0.06, 0.06, 0.06, 0.24], sr: 0, body: '#fbfaf6', rim: '#e4e1d8' },
    film: { pad: [0.16, 0.04, 0.16, 0.04], sr: 0, body: '#0d0d0d', holes: 1 },
    card: { bz: 0.018, sr: 0.07, body: '#ffffff', rim: '#ffffff' },
    round: { round: 1 },
  };
  // Returns the box of the whole device (same centre and turn).
  function frame(g, B, k, back) {
    const d = DEV[k] || DEV.card, w = B.w, h = B.h, m = Math.min(w, h), x = -w / 2, y = -h / 2;
    local(g, B);
    if (d.round) { // circle crop with a white ring
      const r = m / 2;
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, r, 0, tau); g.fill();
      g.globalCompositeOperation = 'source-over'; g.lineWidth = m * 0.03; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, r - g.lineWidth / 2, 0, tau); g.stroke();
      reset(g);
      return { ...B, w: m, h: m };
    }
    const sr = d.sr * m;
    const pad = d.pad ? d.pad.map(v => v * m) : d.bar ? [0, d.bar * h, 0, 0] : [d.bz * m, d.bz * m, d.bz * m, d.bz * m * (d.chin || 1)];
    const bx = x - pad[0], by = y - pad[1], bw = w + pad[0] + pad[2], bh = h + pad[1] + pad[3], br = d.bar ? sr : sr + (d.bz || 0) * m;
    // the screen: rounded, or the back of the device when it is turned away
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000'; g.beginPath(); rrect(g, x, y, w, h, d.bar ? 0 : sr);
    g.fill();
    if (back) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = d.body; g.fillRect(x, y, w, h); }
    // body under the screen, then a soft shadow under the body
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = d.body; g.beginPath(); rrect(g, bx, by, bw, bh, br); g.fill();
    if (d.keys) { g.fillStyle = d.rim; const kw = (d.bz || 0.04) * m * 0.35; for (const [sx, yy, hh] of [[-1, 0.18, 0.08], [-1, 0.3, 0.12], [-1, 0.45, 0.12], [1, 0.3, 0.18]]) g.fillRect(sx < 0 ? bx - kw : bx + bw, by + bh * yy, kw, bh * hh); }
    if (d.strap) { g.fillStyle = '#26262b'; g.beginPath(); rrect(g, -w * 0.36, by - h * 0.55, w * 0.72, bh + h * 1.1, w * 0.12); g.fill(); }
    for (let i = 1; i <= 5; i++) { g.fillStyle = `rgba(0,0,0,${0.06 - i * 0.008})`; g.beginPath(); rrect(g, bx - i * m * 0.012, by + m * 0.03, bw + i * m * 0.024, bh + i * m * 0.012, br + i * m * 0.012); g.fill(); }
    // details over the body
    g.globalCompositeOperation = 'source-over';
    if (d.rim) { g.lineWidth = Math.max(1, m * 0.006); g.strokeStyle = d.rim; g.beginPath(); rrect(g, bx, by, bw, bh, br); g.stroke(); }
    if (d.island && !back) { const iw = m * 0.26, ih = m * 0.07; g.fillStyle = '#000'; g.beginPath(); if (w <= h) rrect(g, -iw / 2, y + m * 0.035, iw, ih, ih / 2); else rrect(g, x + m * 0.035, -iw / 2, ih, iw, ih / 2); g.fill(); }
    if (d.island && back) { g.fillStyle = '#1d1d22'; g.beginPath(); rrect(g, x + m * 0.06, y + m * 0.06, m * 0.42, m * 0.42, m * 0.1); g.fill(); g.fillStyle = '#050506'; for (const [cx, cy] of [[0.17, 0.17], [0.37, 0.17], [0.17, 0.37]]) { g.beginPath(); g.arc(x + m * cx, y + m * cy, m * 0.075, 0, tau); g.fill(); } }
    if (d.cam && !back) { g.fillStyle = '#2a2a30'; g.beginPath(); g.arc(0, by + pad[1] / 2, Math.max(1.5, pad[1] * 0.18), 0, tau); g.fill(); }
    if (d.bar) { // browser chrome: dots and an address pill
      const bh2 = pad[1];
      [['#ff5f57', 0], ['#febc2e', 1], ['#28c840', 2]].forEach(([c, i]) => { g.fillStyle = c; g.beginPath(); g.arc(bx + bh2 * (0.55 + i * 0.42), by + bh2 / 2, bh2 * 0.15, 0, tau); g.fill(); });
      g.fillStyle = '#ffffff'; g.beginPath(); rrect(g, bx + bw * 0.22, by + bh2 * 0.22, bw * 0.56, bh2 * 0.56, bh2 * 0.28); g.fill();
    }
    if (d.holes) { g.fillStyle = '#f2efe6'; const hs = m * 0.05, step = m * 0.11; for (let yy = by + step * 0.3; yy < by + bh - hs; yy += step) for (const xx of [bx + pad[0] * 0.33, bx + bw - pad[0] * 0.33 - hs * 0.8]) { g.beginPath(); rrect(g, xx, yy, hs * 0.8, hs, hs * 0.2); g.fill(); } }
    if (d.base) { // laptop deck under the screen
      const ty = by + bh, tw = bw * 1.2, th = m * 0.055;
      const gr = g.createLinearGradient(0, ty, 0, ty + th); gr.addColorStop(0, '#dfe2e7'); gr.addColorStop(1, '#8e939b');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-bw / 2 - bw * 0.02, ty); g.lineTo(bw / 2 + bw * 0.02, ty); g.lineTo(tw / 2, ty + th * 0.75); g.quadraticCurveTo(tw / 2, ty + th, tw / 2 - th, ty + th); g.lineTo(-tw / 2 + th, ty + th); g.quadraticCurveTo(-tw / 2, ty + th, -tw / 2, ty + th * 0.75); g.closePath(); g.fill();
      g.fillStyle = '#9da2aa'; g.beginPath(); rrect(g, -bw * 0.09, ty, bw * 0.18, th * 0.28, th * 0.14); g.fill();
    }
    if (d.stand) { g.fillStyle = '#1a1a1d'; g.fillRect(-bw * 0.03, by + bh, bw * 0.06, m * 0.07); g.beginPath(); rrect(g, -bw * 0.18, by + bh + m * 0.065, bw * 0.36, m * 0.02, m * 0.01); g.fill(); }
    reset(g);
    return { ...B, w: bw, h: bh + (d.base ? m * 0.055 : d.stand ? m * 0.09 : 0), cx: B.cx + Math.cos(B.rad) * (bx + bw / 2) - Math.sin(B.rad) * (by + bh / 2), cy: B.cy + Math.sin(B.rad) * (bx + bw / 2) + Math.cos(B.rad) * (by + bh / 2) };
  }

  /* ---------- reveal shapes (box-local, p = shown part) ---------- */
  function wipePath(g, wp, w, h, t) {
    const k = wp.k, p = clamp(wp.p, 0, 1), n = wp.n || 8, x = -w / 2, y = -h / 2, D = Math.hypot(w, h);
    g.beginPath();
    const edge = (horiz, pos, amp, per, saw) => { // a filled half with a wavy / zigzag edge at pos along the axis
      const L = horiz ? h : w, N = 48;
      for (let i = 0; i <= N; i++) {
        const v = -L / 2 + L * i / N, o = saw ? amp * (Math.abs(((i / N * per) % 1) * 2 - 1) - 0.5) : amp * Math.sin(i / N * per * tau + t * 5);
        horiz ? g[i ? 'lineTo' : 'moveTo'](pos + o, v) : g[i ? 'lineTo' : 'moveTo'](v, pos + o);
      }
    };
    switch (k) {
      case 'lr': if (wp.wav) { edge(true, x - w * 0.1 + p * w * 1.2, w * wp.wav, 3); g.lineTo(x - w, h); g.lineTo(x - w, -h); } else g.rect(x, y, p * w, h); break;
      case 'rl': g.rect(x + (1 - p) * w, y, p * w, h); break;
      case 'tb': g.rect(x, y, w, p * h); break;
      case 'bt': if (wp.wav) { edge(false, -y + h * 0.1 - p * h * 1.2, h * wp.wav, 3); g.lineTo(w, h); g.lineTo(-w, h); } else g.rect(x, y + (1 - p) * h, w, p * h); break;
      case 'wave': edge(true, x - w * 0.12 + p * w * 1.24, w * 0.06, 2.5); g.lineTo(x - w, h); g.lineTo(x - w, -h); break;
      case 'zigzag': edge(true, x - w * 0.1 + p * w * 1.2, w * 0.08, n, true); g.lineTo(x - w, h); g.lineTo(x - w, -h); break;
      case 'diag': g.save(); g.rotate(Math.atan2(h, w)); g.rect(-D * 2, -D * 2, D * 1.5 + p * D, D * 4); g.restore(); break;
      case 'circle': g.arc(0, 0, p * D / 2, 0, tau); break;
      case 'corner': g.arc(x, y, p * D, 0, tau); break;
      case 'ink': { const R = p * D * 0.62; for (let i = 0; i <= 72; i++) { const a = i / 72 * tau, r = R * (1 + 0.16 * Math.sin(a * 5 + 1) + 0.1 * Math.sin(a * 9 + 2) + 0.06 * Math.sin(a * 17)); g[i ? 'lineTo' : 'moveTo'](r * Math.cos(a), r * Math.sin(a)); } g.closePath(); break; }
      case 'diamond': g.moveTo(0, -h * p); g.lineTo(w * p, 0); g.lineTo(0, h * p); g.lineTo(-w * p, 0); g.closePath(); break;
      case 'star': star(g, 0, 0, p * D * 1.15, p * D * 0.52, 5, -Math.PI / 2 + p * 0.6); break;
      case 'heart': heart(g, 0, -D * 0.1 * p, p * D * 1.9); break;
      case 'tri': { const R = p * D * 1.25; g.moveTo(0, -R); g.lineTo(R * 0.87, R * 0.5); g.lineTo(-R * 0.87, R * 0.5); g.closePath(); break; }
      case 'clock': if (p > 0) { g.moveTo(0, 0); g.arc(0, 0, D, -Math.PI / 2, -Math.PI / 2 + p * tau); g.closePath(); } break;
      case 'rays': for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * tau / n; g.moveTo(0, 0); g.arc(0, 0, D, a, a + p * tau / n); g.closePath(); } break;
      case 'blindsH': for (let i = 0; i < n; i++) g.rect(x, y + i * h / n, w, p * h / n + 0.5); break;
      case 'blindsV': for (let i = 0; i < n; i++) g.rect(x + i * w / n, y, p * w / n + 0.5, h); break;
      case 'splitH': g.rect(-p * w / 2, y, p * w, h); break;
      case 'splitV': g.rect(x, -p * h / 2, w, p * h); break;
      case 'rect': g.rect(-p * w / 2, -p * h / 2, p * w, p * h); break;
      case 'cross': g.rect(x, -p * h / 2, w, p * h); g.rect(-p * w / 2, y, p * w, h); break;
      case 'checker': { const cw = w / n, rows = Math.max(1, Math.round(h / cw)), ch = h / rows; for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) { const s = clamp(p * 2 - ((i + j) % 2), 0, 1); if (s > 0) g.rect(x + (i + 0.5) * cw - cw * s / 2, y + (j + 0.5) * ch - ch * s / 2, cw * s + 0.5, ch * s + 0.5); } break; }
      case 'pixels': { const cw = w / n, rows = Math.max(1, Math.round(h / cw)), ch = h / rows; for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) if (rnd(i * 131 + j, 17) < p) g.rect(x + i * cw, y + j * ch, cw + 0.5, ch + 0.5); break; }
      case 'hex': { const r = w / n / 1.5, rows = Math.ceil(h / (r * 1.73)) + 1; for (let i = -1; i <= n + 1; i++) for (let j = -1; j <= rows; j++) if (rnd(i * 97 + j, 23) < p) { const cx = x + i * r * 1.5, cy = y + j * r * 1.73 + (i % 2 ? r * 0.87 : 0); for (let a = 0; a < 6; a++) g[a ? 'lineTo' : 'moveTo'](cx + r * 1.02 * Math.cos(a * Math.PI / 3), cy + r * 1.02 * Math.sin(a * Math.PI / 3)); g.closePath(); } break; }
      case 'drip': { const cw = w / n; for (let i = 0; i < n; i++) { const l = clamp(p * 1.7 - rnd(i, 5) * 0.7, 0, 1) * (h + cw); if (l <= 0) continue; g.moveTo(x + i * cw, y); g.lineTo(x + (i + 1) * cw + 0.5, y); g.lineTo(x + (i + 1) * cw + 0.5, y + l - cw / 2); g.arc(x + (i + 0.5) * cw, y + l - cw / 2, cw / 2 + 0.25, 0, Math.PI); g.closePath(); } break; }
      case 'stripes': { g.save(); g.rotate(Math.PI / 4); const s = D / n; for (let i = -n; i < n; i++) g.rect(i * s, -D, s * p + 0.5, D * 2); g.restore(); break; }
      default: g.rect(x, y, w, h);
    }
    g.fill('nonzero');
  }

  /* ---------- pixel passes ---------- */
  function pixelate(src, k) {
    const W = src.width, H = src.height, s = buf(6, W / k, H / k), o = buf(7, W, H), so = o.getContext('2d');
    s.getContext('2d').drawImage(src, 0, 0, s.width, s.height);
    so.imageSmoothingEnabled = false; so.drawImage(s, 0, 0, W, H);
    return o;
  }
  function blurred(src, r, slot = 8) { // downscale-upscale: WebKit has no canvas filter
    const W = src.width, H = src.height, f = Math.max(1, r / 1.6);
    const a = buf(slot, W / f, H / f), b = buf(slot + 1, W / f / 2 + 1, H / f / 2 + 1), o = buf(slot + 2, W, H);
    a.getContext('2d').drawImage(src, 0, 0, a.width, a.height);
    if (r > 6) { b.getContext('2d').drawImage(a, 0, 0, b.width, b.height); const ag = a.getContext('2d'); ag.clearRect(0, 0, a.width, a.height); ag.drawImage(b, 0, 0, a.width, a.height); }
    o.getContext('2d').drawImage(a, 0, 0, W, H);
    return o;
  }
  function waved(src, amp, t, B) {
    const W = src.width, H = src.height, o = buf(11, W, H), g = o.getContext('2d'), step = 3, y0 = Math.max(0, Math.floor(B.y - B.h * 0.3)), y1 = Math.min(H, B.y + B.h * 1.3);
    g.drawImage(src, 0, 0, W, y0, 0, 0, W, y0);
    for (let y = y0; y < y1; y += step) g.drawImage(src, 0, y, W, step, amp * Math.sin(y / B.h * 9 + t * 7), y, W, step);
    if (y1 < H) g.drawImage(src, 0, y1, W, H - y1, 0, y1, W, H - y1);
    return o;
  }
  function glitched(src, amt, t, B) {
    const W = src.width, H = src.height, o = buf(12, W, H), g = o.getContext('2d'), seed = Math.floor(t * 18);
    g.drawImage(src, 0, 0);
    const n = 3 + Math.round(amt * 9);
    for (let i = 0; i < n; i++) {
      if (rnd(seed, i * 7 + 1) > 0.35 + amt * 0.6) continue;
      const y = B.y + rnd(seed, i * 7 + 2) * B.h, h = Math.max(2, rnd(seed, i * 7 + 3) * B.h * 0.12), dx = (rnd(seed, i * 7 + 4) - 0.5) * B.w * 0.2 * amt;
      g.clearRect(0, y, W, h); g.drawImage(src, 0, y, W, h, dx, y, W, h);
      if (rnd(seed, i * 7 + 5) < 0.3 * amt) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.5; g.fillStyle = rnd(seed, i * 7 + 6) < 0.5 ? '#00fff0' : '#ff00a0'; g.fillRect(0, y, W, h); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    }
    return o;
  }
  function rgbSplit(src, off) {
    const W = src.width, H = src.height, o = buf(13, W, H), go = o.getContext('2d');
    go.globalCompositeOperation = 'lighter';
    [['#ff0000', -off], ['#00ff00', 0], ['#0000ff', off]].forEach(([c, dx], i) => {
      const ch = buf(14, W, H), g = ch.getContext('2d');
      g.drawImage(src, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = c; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
      go.drawImage(ch, dx, i === 1 ? 0 : -dx * 0.25);
    });
    return o;
  }

  /* ---------- 3D: perspective by strips ---------- */
  function turn(src, R, ang, axisY, pv, slot) {
    const W = src.width, H = src.height, o = buf(slot, W, H), g = o.getContext('2d');
    const th = ang * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), Dp = 2.4 * Math.max(R.w, R.h);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, p0 = axisY ? R.x + pv * R.w : R.y + pv * R.h;
    const len = axisY ? R.w : R.h, N = clamp(Math.ceil(len / 5), 8, 120), st = len / N;
    const proj = v => { const rel = v - p0, Z = rel * s, f = Dp / Math.max(Dp * 0.2, Dp + Z); return [((axisY ? cx : cy) + (p0 + rel * c - (axisY ? cx : cy)) * f), f]; };
    for (let i = 0; i < N; i++) {
      // strip edges snapped to whole pixels: neighbours touch without overlapping (no seams on see-through frames)
      const a = (axisY ? R.x : R.y) + i * st, b = a + st, [A0, fa] = proj(a), [B0, fb] = proj(b), f = (fa + fb) / 2, A = Math.round(A0), k = (Math.round(B0) - A) / st;
      if (!k) continue;
      if (axisY) { g.setTransform(k, 0, 0, f, A - k * a, cy * (1 - f)); g.drawImage(src, a, R.y, st, R.h, a, R.y, st, R.h); }
      else { g.setTransform(f, 0, 0, k, cx * (1 - f), A - k * a); g.drawImage(src, R.x, a, R.w, st, R.x, a, R.w, st); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return o;
  }

  /* ---------- pieces ---------- */
  function tiles(dst, src, R, tl, t) {
    const m = tl.m, p = clamp(tl.p, 0, 1), cols = Math.max(1, m === 'stripsH' ? 1 : tl.n || 6), rows = m === 'stripsV' || m === 'columns' ? 1 : m === 'stripsH' ? tl.n || 10 : Math.max(1, Math.round(cols * R.h / R.w));
    const tw = R.w / cols, th = R.h / rows, W = src.width, H = src.height, cx = R.x + R.w / 2, cy = R.y + R.h / 2, seed = Math.floor(t * 24);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x0 = R.x + i * tw, y0 = R.y + j * th, tx = x0 + tw / 2, ty = y0 + th / 2, r1 = rnd(i * 61 + j, 1), r2 = rnd(i * 61 + j, 2), r3 = rnd(i * 61 + j, 3);
      let dx = 0, dy = 0, rot = 0, sx = 1, sy = 1, a = 1;
      const lag = (o, k = 1.6) => clamp(p * k - o * (k - 1), 0, 1);
      switch (m) {
        case 'explode': case 'shards': { const vx = tx - cx + (r1 - 0.5) * tw, vy = ty - cy + (r2 - 0.5) * th, l = Math.hypot(vx, vy) || 1, d = p * (0.5 + r3) * Math.max(R.w, R.h) * (m === 'shards' ? 1.3 : 0.9); dx = vx / l * d; dy = vy / l * d; rot = p * (r1 - 0.5) * (m === 'shards' ? 900 : 500); sx = sy = 1 - 0.35 * p; a = 1 - p * p; break; }
        case 'fall': { const q = lag(r1); dy = q * q * H; rot = q * (r2 - 0.5) * 120; a = 1 - q * 0.4; break; }
        case 'flip': { const q = lag((i + j) / Math.max(1, cols + rows - 2), 2); sx = Math.cos(q * Math.PI / 2); a = q < 1 ? 1 : 0; break; }
        case 'stripsH': { const q = lag(j / rows); dx = (j % 2 ? 1 : -1) * q * q * (W * 0.9); break; }
        case 'stripsV': { const q = lag(i / cols); dy = (i % 2 ? 1 : -1) * q * q * (H * 0.9); break; }
        case 'columns': { const q = lag(r1); dy = (i % 2 ? -1 : 1) * q * H; a = 1 - q * 0.3; break; }
        case 'pop': { const q = lag(Math.hypot(tx - cx, ty - cy) / Math.hypot(R.w, R.h) * 2, 2); sx = sy = 1 - q; break; }
        case 'vortex': { const ang = p * (1.2 + r1) * Math.PI, vx = tx - cx, vy = ty - cy, k = 1 + p * 1.5; dx = (vx * Math.cos(ang) - vy * Math.sin(ang)) * k - vx; dy = (vx * Math.sin(ang) + vy * Math.cos(ang)) * k - vy; rot = ang * 180 / Math.PI; sx = sy = 1 - 0.5 * p; a = 1 - p * p; break; }
        case 'puzzle': { const q = E3(p); dx = (r1 - 0.5) * W * 1.3 * q; dy = (r2 - 0.5) * H * 1.3 * q; rot = (r3 - 0.5) * 90 * q; break; }
        case 'rise': { const q = lag(i / cols, 2); dy = E3(q) * (H - y0 + th); break; }
        case 'dust': { const q = lag(i / cols * 0.8 + r1 * 0.2, 2); dx = q * (0.08 + r2 * 0.18) * W; dy = -q * (0.06 + r3 * 0.25) * H; rot = q * (r1 - 0.5) * 200; sx = sy = 1 - q * 0.6; a = 1 - q; break; }
        case 'noise': { a = rnd(i * 61 + j, seed) < 1 - p * 0.9 ? 1 : 0; dx = (rnd(i * 61 + j, seed + 1) - 0.5) * tw * p; break; }
      }
      if (a <= 0.01 || Math.abs(sx) < 1e-3 || sy < 1e-3) continue;
      dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = a;
      dst.translate(tx + dx, ty + dy); dst.rotate(rot * Math.PI / 180); dst.scale(sx, sy);
      dst.drawImage(src, x0, y0, tw + 0.6, th + 0.6, -tw / 2, -th / 2, tw + 0.6, th + 0.6);
    }
    reset(dst);
  }
  const E3 = p => p * p * (3 - 2 * p);

  /* ---------- particles ---------- */
  const CONF = ['#ff4d6d', '#ffd23f', '#3bceac', '#5f8bff', '#ff8fab', '#ffffff', '#b388ff'];
  function sparks(g, R, sp, t) {
    const n = sp.n || 20, cx = R.x + R.w / 2, cy = R.y + R.h / 2, Rr = Math.max(R.w, R.h) / 2, k = sp.k, c = sp.c || '#fff';
    reset(g);
    for (let i = 0; i < n; i++) {
      const r1 = rnd(i, 11), r2 = rnd(i, 12), r3 = rnd(i, 13), r4 = rnd(i, 14);
      let x, y, size, a, rot = 0, col = c, shape = 'dot';
      if (sp.loop != null) { // continuous
        const L = sp.loop, ph = (L * (0.25 + r3 * 0.35) + r1) % 1;
        if (k === 'star') { x = cx + (r1 - 0.5) * R.w * 1.15; y = cy + (r2 - 0.5) * R.h * 1.15; const tw = Math.sin(((L * (0.6 + r3) + r4) % 1) * Math.PI); size = Rr * 0.05 * tw; a = tw; shape = 'spark'; }
        else if (k === 'confettiRain') { x = cx + (r1 - 0.5) * R.w * 1.2 + Math.sin(L * 2 + r2 * 9) * Rr * 0.06; y = R.y - R.h * 0.1 + ph * R.h * 1.25; size = Rr * 0.03 * (0.7 + r4); a = 1; rot = L * (r3 - 0.5) * 12; col = CONF[i % CONF.length]; shape = 'rect'; }
        else if (k === 'snow') { x = cx + (r1 - 0.5) * R.w * 1.2 + Math.sin(L * 1.3 + r2 * 9) * Rr * 0.05; y = R.y - R.h * 0.05 + ph * R.h * 1.15; size = Rr * 0.012 * (0.6 + r4 * 1.4); a = 0.9; }
        else if (k === 'bubbleRise') { x = cx + (r1 - 0.5) * R.w + Math.sin(L * 1.5 + r2 * 9) * Rr * 0.05; y = R.y + R.h * 1.05 - ph * R.h * 1.2; size = Rr * 0.03 * (0.6 + r4 * 1.6); a = 0.8 * Math.sin(ph * Math.PI); shape = 'bubble'; }
        else if (k === 'emberRise') { x = cx + (r1 - 0.5) * R.w + Math.sin(L * 3 + r2 * 9) * Rr * 0.04; y = R.y + R.h - ph * R.h * 0.9; size = Rr * 0.012 * (0.5 + r4); a = (1 - ph) * (0.6 + 0.4 * Math.sin(L * 20 + i)); shape = 'glow'; }
        else if (k === 'hearts') { x = cx + (r1 - 0.5) * R.w * 0.9 + Math.sin(L * 2 + r2 * 9) * Rr * 0.06; y = R.y + R.h - ph * R.h * 1.1; size = Rr * 0.07 * (0.6 + r4); a = Math.sin(ph * Math.PI); shape = 'heart'; }
        else continue;
      } else { // a burst over p
        const p = clamp(sp.p, 0, 1), ang = r1 * tau;
        if (k === 'confetti') { const d = Rr * (0.2 + p * (0.9 + r2 * 0.8)); x = cx + Math.cos(ang) * d; y = cy + Math.sin(ang) * d * 0.8 + p * p * Rr * 0.6; size = Rr * 0.035 * (0.7 + r3); a = 1 - Math.pow(p, 3); rot = p * (r4 - 0.5) * 20; col = CONF[i % CONF.length]; shape = 'rect'; }
        else if (k === 'ember') { x = R.x + r1 * R.w; y = R.y + R.h - p * (0.3 + r2 * 0.9) * R.h; size = Rr * 0.012 * (0.6 + r3); a = (1 - p) * (0.5 + 0.5 * Math.sin(p * 30 + i)); shape = 'glow'; }
        else if (k === 'bubble') { const d = Rr * (0.5 + p * (0.4 + r2 * 0.6)); x = cx + Math.cos(ang) * d; y = cy + Math.sin(ang) * d; size = Rr * 0.04 * (0.5 + r3) * (1 + p); a = 1 - p; shape = 'bubble'; }
        else { const d = Rr * (0.3 + p * (0.7 + r2 * 0.7)); x = cx + Math.cos(ang) * d; y = cy + Math.sin(ang) * d; size = Rr * 0.05 * (0.5 + r3) * Math.sin(Math.min(1, p * 1.3) * Math.PI); a = 1 - p * p; shape = 'spark'; }
      }
      if (a <= 0.01 || size <= 0.2) continue;
      g.globalAlpha = clamp(a, 0, 1); g.fillStyle = col; g.strokeStyle = col;
      g.setTransform(1, 0, 0, 1, x, y); g.rotate(rot);
      g.beginPath();
      if (shape === 'spark') { star(g, 0, 0, size, size * 0.18, 4, 0); g.fill(); g.globalAlpha *= 0.5; g.beginPath(); g.arc(0, 0, size * 0.35, 0, tau); g.fill(); }
      else if (shape === 'rect') { g.fillRect(-size / 2, -size * 0.3, size, size * 0.6); }
      else if (shape === 'bubble') { g.lineWidth = Math.max(1, size * 0.12); g.strokeStyle = 'rgba(255,255,255,.9)'; g.arc(0, 0, size, 0, tau); g.stroke(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill(); }
      else if (shape === 'heart') { heart(g, 0, 0, size); g.fill(); }
      else if (shape === 'glow') { const gr = g.createRadialGradient(0, 0, 0, 0, 0, size * 3); gr.addColorStop(0, col); gr.addColorStop(0.3, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.arc(0, 0, size * 3, 0, tau); g.fill(); }
      else { g.arc(0, 0, size, 0, tau); g.fill(); }
    }
    reset(g);
  }

  /* ---------- v2: strip remaps (twist, bend, melt, genie, cylinder, accordion, bulge) ---------- */
  // fn(v, i, N) per strip (v 0..1 across): {o offset and s scale along the strip, c new centre and k thickness across, sh shade, a alpha}
  function remap(src, R, rows, fn, slot) {
    const W = src.width, H = src.height, o = buf(slot, W, H), g = o.getContext('2d');
    const across = rows ? R.h : R.w, N = clamp(Math.ceil(across / 2), 4, 900), step = across / N;
    const c0 = rows ? R.y : R.x, cA = rows ? R.x + R.w / 2 : R.y + R.h / 2;
    for (let i = 0; i < N; i++) {
      const a0 = c0 + i * step, r = fn((i + 0.5) / N, i, N);
      if (!r || r.a === 0) continue;
      const sc = r.s ?? 1, off = r.o || 0, k = r.k ?? 1, cc = r.c ?? (a0 + step / 2), ky = (step * k + 0.6) / step;
      if (Math.abs(sc) < 1e-3 || k <= 0) continue;
      g.globalAlpha = clamp(r.a ?? 1, 0, 1);
      if (rows) { g.setTransform(sc, 0, 0, ky, cA - sc * cA + off, cc - ky * step / 2 - ky * a0); g.drawImage(src, 0, a0, W, step, 0, a0, W, step); }
      else { g.setTransform(ky, 0, 0, sc, cc - ky * step / 2 - ky * a0, cA - sc * cA + off); g.drawImage(src, a0, 0, step, H, a0, 0, step, H); }
      if (r.sh) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = clamp(Math.abs(r.sh), 0, 1); g.fillStyle = r.sh < 0 ? '#000' : '#fff'; if (rows) g.fillRect(0, a0, W, step); else g.fillRect(a0, 0, step, H); g.globalCompositeOperation = 'source-over'; }
    }
    reset(g);
    return o;
  }
  function remaps(cur, R, q) {
    const T = Math.PI;
    if (q.twist) cur = remap(cur, R, true, v => { const c = Math.cos(q.twist * (v - 0.5) * 2 * T / 180); return { s: c, sh: -(1 - Math.abs(c)) * 0.6 }; }, 21);
    if (q.bend) cur = remap(cur, R, true, v => ({ o: q.bend * R.w * Math.pow((v - 0.5) * 2, 2) }), 22);
    if (q.genie > 0.001) { const p = q.genie; cur = remap(cur, R, true, v => { const l = clamp(p * 1.8 - (1 - v) * 0.8, 0, 1); return { s: 1 - 0.94 * E3(l), o: 0 }; }, 23); }
    if (q.melt > 0.001) { const p = q.melt; cur = remap(cur, R, false, (v, i, N) => { const r = rnd(Math.floor(v * 24), 31); return { o: p * p * (0.3 + 0.7 * r) * R.h * 1.3, s: 1 + p * r * 0.6, a: 1 - p * p * 0.8 }; }, 24); }
    if (q.cyl) { const a = clamp(Math.abs(q.cyl), 0.001, 1), cx = R.x + R.w / 2, sg = Math.sign(q.cyl), ph = q.cylP || 0;
      // the content scrolls round the drum (cylP), so at cyl -> 0 it is flat and in place
      const rr = R.w / 2 / Math.sin(a * T / 2);
      cur = remap(cur, R, false, v => { const w = ((v + ph) % 1 + 1) % 1 - 0.5, th = w * a * T, c = Math.cos(th); if (c <= 0.02) return { a: 0 }; return { c: cx + rr * Math.sin(th), k: c * a * T / 2 / Math.sin(a * T / 2), sh: -(1 - c) * 0.7 * sg }; }, 25); }
    if (q.accord > 0.001) { const p = q.accord, n = 8, cx = R.x + R.w / 2, k = Math.cos(p * T / 2);
      cur = remap(cur, R, false, v => { const f = Math.floor(v * n); return { c: cx + (R.x + v * R.w - cx) * k, k, sh: (f % 2 ? -0.5 : 0.25) * p }; }, 26); }
    if (q.bulge) { const b = q.bulge;
      cur = remap(cur, R, true, v => ({ s: 1 + b * 0.35 * Math.cos((v - 0.5) * T) }), 27);
      cur = remap(cur, R, false, v => ({ s: 1 + b * 0.35 * Math.cos((v - 0.5) * T) }), 28); }
    return cur;
  }

  /* ---------- v2: per-pixel passes on the box (twirl, ripple, burn, hue, posterize, thermal, sketch) ---------- */
  let NZ = null;
  const noise = (x, y) => { // smooth seeded value noise, 0..1
    if (!NZ) { NZ = new Float32Array(64 * 64); for (let i = 0; i < NZ.length; i++) NZ[i] = rnd(i, 77); }
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const at = (a, b) => NZ[((b & 63) << 6) | (a & 63)];
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
  const THERM = [[0, 0, 30], [70, 0, 140], [200, 0, 80], [255, 90, 0], [255, 220, 0], [255, 255, 230]];
  function pixops(src, R, q) {
    const W = src.width, H = src.height, x0 = Math.max(0, Math.floor(R.x - R.w * 0.1)), y0 = Math.max(0, Math.floor(R.y - R.h * 0.1));
    const x1 = Math.min(W, Math.ceil(R.x + R.w * 1.1)), y1 = Math.min(H, Math.ceil(R.y + R.h * 1.1)), w = x1 - x0, h = y1 - y0;
    if (w < 2 || h < 2) return src;
    const S = src.getContext('2d').getImageData(x0, y0, w, h).data, out = new ImageData(w, h), D = out.data;
    const cx = R.x + R.w / 2 - x0, cy = R.y + R.h / 2 - y0, rad = Math.max(R.w, R.h) / 2, tw = (q.twirl || 0) * Math.PI / 180, rp = q.ripple || 0, t = q.t || 0;
    const hue = (q.hue || 0) * Math.PI / 180, hc = Math.cos(hue), hs = Math.sin(hue), burn = q.burn || 0, post = q.poster || 0, th = q.thermal || 0, sk = q.sketch || 0;
    // hue rotation matrix (luma preserving)
    const m = hue ? [0.213 + hc * 0.787 - hs * 0.213, 0.715 - hc * 0.715 - hs * 0.715, 0.072 - hc * 0.072 + hs * 0.928,
      0.213 - hc * 0.213 + hs * 0.143, 0.715 + hc * 0.285 + hs * 0.140, 0.072 - hc * 0.072 - hs * 0.283,
      0.213 - hc * 0.213 - hs * 0.787, 0.715 - hc * 0.715 + hs * 0.715, 0.072 + hc * 0.928 + hs * 0.072] : null;
    const lv = post > 0 ? Math.max(2, Math.round(8 - post * 6)) : 0, nsc = 6 / Math.max(R.w, R.h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sx = x, sy = y;
      if (tw || rp) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), f = Math.max(0, 1 - d / rad);
        if (tw && f > 0) { const a = tw * f * f, c = Math.cos(a), s = Math.sin(a); sx = cx + dx * c - dy * s; sy = cy + dx * s + dy * c; }
        if (rp && d > 0) { const o = rp * rad * 0.06 * Math.sin(d / rad * 28 - t * 9) * f; sx += dx / d * o; sy += dy / d * o; }
      }
      sx = Math.round(sx); sy = Math.round(sy);
      const o = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (sy * w + sx) * 4;
      let r = S[i], g = S[i + 1], b = S[i + 2], a = S[i + 3];
      if (!a) continue;
      if (sk) { // edges: dark lines on paper
        const L = (k) => k < 0 || k >= S.length ? 0 : S[k] * 0.3 + S[k + 1] * 0.59 + S[k + 2] * 0.11;
        const gx = L(i + 4) - L(i - 4), gy = L(i + w * 4) - L(i - w * 4), e = Math.min(255, Math.hypot(gx, gy) * 2.5), v = 255 - e;
        r += (v - r) * sk; g += (v * 0.97 - g) * sk; b += (v * 0.92 - b) * sk;
      }
      if (m) { const R2 = r * m[0] + g * m[1] + b * m[2], G2 = r * m[3] + g * m[4] + b * m[5], B2 = r * m[6] + g * m[7] + b * m[8]; r = R2; g = G2; b = B2; }
      if (lv) { const st = 255 / (lv - 1); r = Math.round(r / st) * st; g = Math.round(g / st) * st; b = Math.round(b / st) * st; }
      if (th) { const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255 * (THERM.length - 1), k = Math.min(THERM.length - 2, Math.floor(l)), f = l - k, A = THERM[k], B = THERM[k + 1];
        r += (A[0] + (B[0] - A[0]) * f - r) * th; g += (A[1] + (B[1] - A[1]) * f - g) * th; b += (A[2] + (B[2] - A[2]) * f - b) * th; }
      if (burn > 0) { // dissolve on smooth noise with a glowing edge
        const n = noise((x0 + x) * nsc * 3, (y0 + y) * nsc * 3) * 0.65 + noise((x0 + x) * nsc * 9, (y0 + y) * nsc * 9) * 0.35, e = n - burn * 1.15 + 0.08;
        if (e < 0) continue;
        if (e < 0.06) { const k = 1 - e / 0.06; r += (255 - r) * k; g += (150 * (1 - k) + 230 * k - g) * k; b += (30 - b) * k; }
        else if (e < 0.12) { const k = 1 - (e - 0.06) / 0.06; r *= 1 - 0.7 * k; g *= 1 - 0.75 * k; b *= 1 - 0.8 * k; }
      }
      D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = a;
    }
    const c = buf(30, W, H); c.getContext('2d').putImageData(out, x0, y0);
    return c;
  }
  function halftone(src, R, amt) {
    const W = src.width, H = src.height, cell = Math.max(3, Math.round(Math.min(R.w, R.h) / 34)), x0 = Math.max(0, Math.floor(R.x)), y0 = Math.max(0, Math.floor(R.y));
    const w = Math.min(W, Math.ceil(R.x + R.w)) - x0, h = Math.min(H, Math.ceil(R.y + R.h)) - y0;
    if (w < cell || h < cell) return src;
    const S = src.getContext('2d').getImageData(x0, y0, w, h).data, o = buf(31, W, H), g = o.getContext('2d');
    g.globalAlpha = 1 - amt; g.drawImage(src, 0, 0); g.globalAlpha = 1;
    for (let y = cell / 2; y < h; y += cell) for (let x = (Math.round(y / cell) % 2 ? cell : cell / 2); x < w; x += cell) {
      const i = (Math.floor(y) * w + Math.floor(x)) * 4; if (S[i + 3] < 20) continue;
      const l = (S[i] * 0.3 + S[i + 1] * 0.59 + S[i + 2] * 0.11) / 255, r = cell * 0.62 * Math.sqrt(1 - l * 0.85) * amt;
      g.fillStyle = `rgb(${S[i]},${S[i + 1]},${S[i + 2]})`; g.beginPath(); g.arc(x0 + x, y0 + y, r, 0, tau); g.fill();
    }
    return o;
  }

  /* ---------- v2: overlays in front (ov) and backdrops behind (bg) ---------- */
  function overlay(g, R, ov, t) {
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, M = Math.max(R.w, R.h), p = clamp(ov.p ?? 1, 0, 1), c = ov.c || '#ffffff', seed = Math.floor(t * 16);
    reset(g); g.globalCompositeOperation = 'lighter';
    if (ov.k === 'flare') { // lens flare: bright core and rings along a line through the centre
      const ax = R.x + R.w * (-0.2 + 1.4 * p), ay = R.y + R.h * 0.2, bx = 2 * cx - ax, by = 2 * cy - ay, a = ov.a ?? 1;
      const blob = (x, y, r, col, al) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = al * a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, tau); g.fill(); };
      blob(ax, ay, M * 0.35, 'rgba(255,240,210,1)', 0.9); blob(ax, ay, M * 0.06, '#ffffff', 1);
      g.globalAlpha = 0.5 * a; g.fillStyle = 'rgba(255,230,200,.8)'; g.fillRect(ax - M * 0.8, ay - 1.5, M * 1.6, 3);
      [[0.3, 0.05, '#7fd8ff'], [0.55, 0.09, '#b388ff'], [0.8, 0.04, '#ffd27f'], [1.1, 0.12, '#7fffd4']].forEach(([f, r, col]) => blob(ax + (bx - ax) * f, ay + (by - ay) * f, M * r, col, 0.35));
    } else if (ov.k === 'bolt') { // lightning: jagged branches, new shape every few frames
      if (rnd(seed, 3) > (ov.on ?? 0.6)) { reset(g); return; }
      g.globalAlpha = 1; g.strokeStyle = c; g.shadowColor = c; g.shadowBlur = M * 0.04; g.lineCap = 'round';
      for (let b = 0; b < (ov.n || 2); b++) {
        let x = R.x + R.w * rnd(seed, 10 + b), y = R.y - R.h * 0.05; g.lineWidth = Math.max(1.5, M * 0.008); g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 14; k++) { x += (rnd(seed, b * 50 + k) - 0.5) * R.w * 0.14; y += R.h * 0.08; g.lineTo(x, y); }
        g.stroke();
      }
      g.shadowBlur = 0;
    } else if (ov.k === 'rays') { // god rays from above
      for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.13 + Math.sin(t * 0.7 + i) * 0.03, L = M * 1.6;
        const gr = g.createLinearGradient(cx, R.y - M * 0.4, cx + Math.cos(a + Math.PI) * 0, R.y + R.h); gr.addColorStop(0, `rgba(255,245,220,${0.22 * p})`); gr.addColorStop(1, 'rgba(255,245,220,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(cx, R.y - M * 0.4); g.lineTo(cx + Math.cos(a - Math.PI) * -L * 0.1 + Math.sin(i) * M * 0.05 - L * Math.cos(a + 0.03), R.y - M * 0.4 - L * Math.sin(a + 0.03)); g.lineTo(cx - L * Math.cos(a - 0.03), R.y - M * 0.4 - L * Math.sin(a - 0.03)); g.closePath(); g.fill(); }
    } else if (ov.k === 'speed') { // anime speed lines around the box
      g.globalCompositeOperation = 'source-over'; g.fillStyle = c;
      for (let i = 0; i < 70; i++) { const a = rnd(i, seed % 4 + 40) * tau, r0 = M * (0.55 + rnd(i, seed % 4 + 41) * 0.25), r1 = M * 1.6, wd = M * 0.006 * (0.5 + rnd(i, 43));
        g.globalAlpha = 0.85 * p; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a + wd / r1 * 6) * r1, cy + Math.sin(a + wd / r1 * 6) * r1); g.lineTo(cx + Math.cos(a - wd / r1 * 6) * r1, cy + Math.sin(a - wd / r1 * 6) * r1); g.closePath(); g.fill(); }
    } else if (ov.k === 'ring') { // shockwave rings
      for (let i = 0; i < (ov.n || 2); i++) { const q = clamp(p * 1.3 - i * 0.18, 0, 1); if (q <= 0 || q >= 1) continue;
        g.globalAlpha = (1 - q) * 0.9; g.strokeStyle = c; g.lineWidth = M * 0.03 * (1 - q) + 1; g.shadowColor = c; g.shadowBlur = M * 0.03; g.beginPath(); g.arc(cx, cy, M * (0.1 + q * 0.9), 0, tau); g.stroke(); }
      g.shadowBlur = 0;
    } else if (ov.k === 'leak') { // drifting warm light leaks
      for (let i = 0; i < 3; i++) { const x = R.x + R.w * (0.5 + 0.6 * Math.sin(t * 0.5 + i * 2.1)), y = R.y + R.h * (0.5 + 0.5 * Math.cos(t * 0.4 + i * 1.7)), r = M * (0.5 + 0.2 * i);
        const col = ['255,120,40', '255,60,120', '255,200,80'][i], gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${0.45 * p})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    }
    reset(g);
  }
  function backdrop(g, R, bg, t) {
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, M = Math.max(R.w, R.h), p = clamp(bg.p ?? 1, 0, 1);
    reset(g);
    if (bg.k === 'burst') { g.globalAlpha = p; g.fillStyle = bg.c || '#ffd23f'; g.beginPath(); star(g, cx, cy, M * 0.85 * p, M * 0.55 * p, 14, t * 0.4); g.fill(); g.fillStyle = bg.c2 || '#ff4d6d'; g.beginPath(); star(g, cx, cy, M * 0.68 * p, M * 0.46 * p, 14, t * 0.4 + 0.2); g.fill(); }
    else if (bg.k === 'glow') { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, M * 0.9); gr.addColorStop(0, bg.c || 'rgba(120,200,255,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = p; g.fillStyle = gr; g.fillRect(cx - M, cy - M, M * 2, M * 2); }
    else if (bg.k === 'portal') { for (let i = 0; i < 6; i++) { g.globalAlpha = p * 0.5; g.strokeStyle = i % 2 ? '#7c4dff' : '#00e5ff'; g.lineWidth = M * 0.025; g.shadowColor = g.strokeStyle; g.shadowBlur = M * 0.05; g.beginPath(); g.ellipse(cx, cy, M * (0.55 + i * 0.06) * p, M * (0.62 + i * 0.06) * p, t * (i % 2 ? 1 : -1) * 0.8, 0, tau); g.stroke(); } g.shadowBlur = 0; }
    reset(g);
  }
  function strokeDraw(g, B, st) { // a border drawn around the box, with glow
    const w = B.w, h = B.h, L = 2 * (w + h), p = clamp(st.p ?? 1, 0, 1), lw = Math.max(1.5, Math.min(w, h) * (st.w || 0.02));
    if (p <= 0) return;
    local(g, B); g.strokeStyle = st.c || '#00e5ff'; g.lineWidth = lw; g.shadowColor = g.strokeStyle; g.shadowBlur = lw * 3; g.lineJoin = 'round';
    g.setLineDash([L * p, L]); g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); g.stroke();
    g.setLineDash([]); g.shadowBlur = 0; reset(g);
  }

  let scanPat = null;
  function draw(dst, layer, B0, q) {
    const W = layer.width, H = layer.height, B = { ...B0, cx: B0.x + B0.w / 2, cy: B0.y + B0.h / 2, rad: (B0.r || 0) * Math.PI / 180 };
    let cur = layer;
    const own = () => { if (cur === layer) { const c = buf(0, W, H); c.getContext('2d').drawImage(layer, 0, 0); cur = c; } return cur.getContext('2d'); };
    let FB = B;
    const back = Math.cos(q.ry * Math.PI / 180) * Math.cos(q.rx * Math.PI / 180) < 0;
    if (q.frame) FB = frame(own(), B, q.frame.k, back);
    // colour and light, kept inside the layer's own shape
    const atop = (fill, a, op = 'source-atop') => { const g = own(); reset(g); g.globalCompositeOperation = op; g.globalAlpha = clamp(a, 0, 1); g.fillStyle = fill; g.fillRect(0, 0, W, H); reset(g); };
    if (q.gray > 0 || q.inv > 0) {
      const g = own(), keep = buf(1, W, H); keep.getContext('2d').drawImage(cur, 0, 0);
      if (q.gray > 0) atop('#808080', q.gray, 'saturation');
      if (q.inv > 0) atop('#ffffff', q.inv, 'difference');
      g.globalCompositeOperation = 'destination-in'; g.drawImage(keep, 0, 0); reset(g);
    }
    if (q.tint && q.tint[1] > 0) atop(q.tint[0], q.tint[1]);
    if (q.flash > 0) atop('#ffffff', q.flash);
    if (q.dark > 0) atop('#000000', q.dark);
    if (q.scan > 0) {
      if (!scanPat) { const c = document.createElement('canvas'); c.width = 1; c.height = 4; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1, 2); scanPat = c; }
      const g = own(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = clamp(q.scan * 0.45, 0, 1); g.fillStyle = g.createPattern(scanPat, 'repeat'); g.fillRect(0, 0, W, H); reset(g);
    }
    if (q.shine && q.shine.p > -0.3 && q.shine.p < 1.3) {
      const g = own(), sh = q.shine, w = FB.w, h = FB.h, bw = (sh.w || 0.18) * (sh.v ? h : w);
      local(g, FB); g.globalCompositeOperation = 'source-atop';
      if (!sh.v) g.transform(1, 0, -0.35, 1, 0, 0);
      const pos = sh.v ? -h / 2 + sh.p * h : -w / 2 - w * 0.2 + sh.p * w * 1.4;
      const gr = sh.v ? g.createLinearGradient(0, pos - bw, 0, pos + bw) : g.createLinearGradient(pos - bw, 0, pos + bw, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${sh.sharp ? 0.95 : 0.6})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-w * 1.5, -h * 1.5, w * 3, h * 3); reset(g);
    }
    if (q.wipe) { const g = own(); local(g, FB); g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000'; wipePath(g, q.wipe, FB.w, FB.h, q.t); reset(g); }
    const R = bounds(FB);
    if (q.px > 0.004) { const k = q.px * R.w; if (k >= 2) cur = pixelate(cur, k); }
    if (q.blur > 0.002) { const r = q.blur * Math.min(R.w, R.h); if (r > 0.8) cur = blurred(cur, r); }
    if (q.wave > 0.001) cur = waved(cur, q.wave * R.w, q.t, R);
    if (q.glitch > 0.02) cur = glitched(cur, q.glitch, q.t, R);
    if (q.rgb > 0.002) { const o = q.rgb * R.w; if (o >= 0.7) cur = rgbSplit(cur, o); }
    if (q.twirl || q.ripple || q.burn > 0.001 || q.hue || q.poster > 0.01 || q.thermal > 0.01 || q.sketch > 0.01) cur = pixops(cur, R, q);
    if (q.halftone > 0.02) cur = halftone(cur, R, Math.min(1, q.halftone));
    cur = remaps(cur, R, q);
    // stretch / skew about the pivot, then the 3D turns
    const pv = q.pv || [0.5, 0.5];
    if (q.sx !== 1 || q.sy !== 1 || q.sk) {
      const o = buf(15, W, H), g = o.getContext('2d'), px = R.x + pv[0] * R.w, py = R.y + pv[1] * R.h;
      g.translate(px, py); g.transform(1, 0, Math.tan(q.sk * Math.PI / 180), 1, 0, 0); g.scale(q.sx, q.sy); g.translate(-px, -py);
      g.drawImage(cur, 0, 0); cur = o;
    }
    if (Math.abs(q.ry) > 0.05) cur = turn(cur, R, q.ry, true, pv[0], 16);
    if (Math.abs(q.rx) > 0.05) { const R2 = { x: R.x - R.w * 0.15, y: R.y, w: R.w * 1.3, h: R.h }; cur = turn(cur, R2, q.rx, false, pv[1], 17); }
    // onto the frame
    dst.save(); reset(dst);
    if (q.bg) backdrop(dst, R, q.bg, q.t);
    if (q.reflect > 0.01) { // mirrored copy under the box, fading away
      const o = buf(32, W, H), g = o.getContext('2d'), by = R.y + R.h;
      g.translate(0, by * 2); g.scale(1, -1); g.drawImage(cur, 0, 0); reset(g);
      const gr = g.createLinearGradient(0, by, 0, by + R.h * 0.5); gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(0, by, W, H - by); g.fillStyle = '#000'; g.fillRect(0, 0, W, by); reset(g);
      dst.globalAlpha = clamp(q.reflect, 0, 1); dst.drawImage(o, 0, 0); dst.globalAlpha = 1;
    }
    if (q.extrude > 0.01) { // thickness: darkened copies stepping back
      const o = buf(33, W, H), g = o.getContext('2d'); g.drawImage(cur, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H); reset(g);
      const d = q.extrude * Math.min(R.w, R.h) * 0.08, n = Math.max(2, Math.round(d));
      for (let i = n; i >= 1; i--) dst.drawImage(o, d * i / n, d * i / n);
    }
    if (q.echo > 0.01) { const n = 4, cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      for (let i = n; i >= 1; i--) { const k = 1 + i * 0.09 * q.echo; dst.setTransform(k, 0, 0, k, cx * (1 - k), cy * (1 - k)); dst.globalAlpha = 0.32 * (1 - i / (n + 1)) * Math.min(1, q.echo * 2); dst.drawImage(cur, 0, 0); }
      reset(dst); }
    if (q.mirror) { // kaleidoscope: one part of the box mirrored into the others
      const mk = q.mirror.k, cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      const parts = mk === 'h' ? [[1, 1, 'l'], [-1, 1, 'l']] : mk === 'v' ? [[1, 1, 't'], [1, -1, 't']] : [[1, 1, 'q'], [-1, 1, 'q'], [1, -1, 'q'], [-1, -1, 'q']];
      for (const [sx, sy, m] of parts) {
        dst.save(); dst.beginPath(); dst.rect(sx > 0 ? R.x : cx, sy > 0 ? R.y : cy, m === 't' ? R.w : R.w / 2, m === 'l' ? R.h : R.h / 2);
        dst.clip(); dst.setTransform(sx, 0, 0, sy, cx * (1 - sx), cy * (1 - sy)); dst.drawImage(cur, 0, 0); dst.restore();
      }
      reset(dst);
    } else if (q.tiles && q.tiles.p > 0.001) tiles(dst, cur, R, q.tiles, q.t);
    else {
      for (const gh of q.ghosts) { // where it just was
        dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = gh.o;
        dst.translate(R.x + R.w / 2 + gh.dx * W, R.y + R.h / 2 + gh.dy * H); dst.rotate(gh.r * Math.PI / 180); dst.scale(gh.s, gh.s); dst.translate(-(R.x + R.w / 2), -(R.y + R.h / 2));
        dst.drawImage(cur, 0, 0);
      }
      reset(dst);
      if (q.mb && (Math.abs(q.mb[0]) > 0.002 || Math.abs(q.mb[1]) > 0.002)) {
        const N = 7, vx = q.mb[0] * W, vy = q.mb[1] * H;
        for (let i = N; i >= 1; i--) { dst.globalAlpha = 0.22 * (1 - i / (N + 1)); dst.drawImage(cur, vx * i / N, vy * i / N); }
        dst.globalAlpha = 1;
      }
      dst.drawImage(cur, 0, 0);
    }
    if (q.glow > 0.01) { const gl = blurred(cur, Math.max(4, Math.min(R.w, R.h) * 0.06), 18); dst.globalCompositeOperation = 'lighter'; dst.globalAlpha = clamp(q.glow * 0.75, 0, 1); dst.drawImage(gl, 0, 0); reset(dst); }
    if (q.spark) sparks(dst, R, q.spark, q.t);
    if (q.stroke) strokeDraw(dst, FB, q.stroke);
    if (q.ov) overlay(dst, R, q.ov, q.t);
    dst.restore();
  }

  root.MaqtoFx = { draw, DEV };
})(this);
