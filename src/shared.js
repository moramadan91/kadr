// Shared by the renderer (preview) and main (ffmpeg export) so both draw the same picture.
(function (root) {
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const PRESETS = {
    none: {},
    warm: { temp: 0.35, s: 1.1 },
    cool: { temp: -0.35, s: 0.95 },
    vivid: { s: 1.45, c: 1.1 },
    matte: { c: 0.82, b: 1.06, s: 0.9 },
    bw: { s: 0, c: 1.15 },
    cinema: { c: 1.15, s: 0.85, temp: -0.15, b: 0.96 },
    vintage: { s: 0.7, temp: 0.3, c: 0.88, b: 1.04 },
  };

  // Per channel out = v*slope + intercept (0..1), then saturation.
  // Preview: SVG feComponentTransfer + feColorMatrix. Export: lutrgb + hue=s.
  function grade(it) {
    const p = PRESETS[it.preset] || {};
    const b = num(it.brightness, 1) * num(p.b, 1);
    const c = num(it.contrast, 1) * num(p.c, 1);
    const s = num(it.saturation, 1) * num(p.s, 1);
    const t = num(it.temp, 0) + num(p.temp, 0);
    const ch = [1 + t * 0.25, 1, 1 - t * 0.25].map(g => ({ slope: b * g * c, intercept: 0.5 * (1 - c) }));
    const identity = ch.every(x => Math.abs(x.slope - 1) < 1e-4 && Math.abs(x.intercept) < 1e-4) && Math.abs(s - 1) < 1e-4;
    const key = ch.map(x => x.slope.toFixed(4) + ',' + x.intercept.toFixed(4)).join(';') + ';' + s.toFixed(4);
    return { ch, s, identity, key };
  }

  /* ---------- color: everything past the basic grade is baked into one 3D LUT per clip ---------- */
  // HSL bands (hue centres in degrees), the order of the swatches in the panel.
  const HSL_BANDS = [['red', 0], ['orange', 30], ['yellow', 60], ['green', 120], ['cyan', 180], ['blue', 225], ['purple', 270], ['magenta', 315]];
  const LUT_N = 33;

  // Built-in looks: our own colour functions (no third-party LUT files), r,g,b in 0..1.
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const satAdj = (c, l, s) => l + (c - l) * s;
  const scurve = (v, k) => { const x = v - 0.5; return clamp(0.5 + x * (1 + k) - 4 * k * x * x * x, 0, 1); };
  const tone = (r, g, b, sh, hi, amt) => { // split toning: shadow colour sh, highlight colour hi
    const l = lum(r, g, b), ws = (1 - l) * (1 - l) * amt, wh = l * l * amt;
    return [r + (sh[0] - 0.5) * ws + (hi[0] - 0.5) * wh, g + (sh[1] - 0.5) * ws + (hi[1] - 0.5) * wh, b + (sh[2] - 0.5) * ws + (hi[2] - 0.5) * wh];
  };
  const LOOKS = {
    tealOrange: (r, g, b) => tone(scurve(r, .15), scurve(g, .15), scurve(b, .15), [0.2, 0.55, 0.65], [0.85, 0.6, 0.35], 0.55),
    warm: (r, g, b) => [r * 1.08 + .02, g * 1.02, b * 0.9],
    cool: (r, g, b) => [r * 0.92, g * 1.0, b * 1.1 + .02],
    golden: (r, g, b) => tone(r * 1.06, g * 1.02, b * .88, [0.55, 0.45, 0.35], [0.95, 0.75, 0.4], 0.5),
    film: (r, g, b) => { const l = lum(r, g, b); return tone(scurve(r, .2) * .96 + .03, scurve(g, .2) * .96 + .03, scurve(b, .2) * .92 + .05, [0.4, 0.55, 0.5], [0.6, 0.55, 0.45], 0.3).map(c => satAdj(c, l, 0.9)); },
    vintage: (r, g, b) => { const l = lum(r, g, b); return [satAdj(r, l, .7) * .85 + .12, satAdj(g, l, .7) * .82 + .1, satAdj(b, l, .7) * .7 + .1]; },
    fade: (r, g, b) => [r * .82 + .1, g * .82 + .1, b * .82 + .11],
    moody: (r, g, b) => { const l = lum(r, g, b); return tone(...[r, g, b].map(c => satAdj(c, l, .7) * .92), [0.35, 0.5, 0.55], [0.5, 0.5, 0.5], 0.45).map(c => scurve(c, .2)); },
    bleach: (r, g, b) => { const l = lum(r, g, b); return [r, g, b].map(c => scurve(satAdj(c, l, .45), .35)); },
    pastel: (r, g, b) => { const l = lum(r, g, b); return [r, g, b].map(c => satAdj(c * .8 + .18, l * .8 + .18, 1.1)); },
    vivid: (r, g, b) => { const l = lum(r, g, b); return [r, g, b].map(c => scurve(satAdj(c, l, 1.45), .12)); },
    neon: (r, g, b) => tone(...[r, g, b].map(c => satAdj(c, lum(r, g, b), 1.3)), [0.35, 0.25, 0.75], [0.85, 0.4, 0.8], 0.6),
    cyber: (r, g, b) => tone(r, g, b, [0.2, 0.6, 0.75], [0.9, 0.35, 0.7], 0.6),
    sepia: (r, g, b) => { const l = lum(r, g, b); return [l * 1.07 + .05, l * .95 + .02, l * .75]; },
    mono: (r, g, b) => { const l = lum(r, g, b); return [l, l, l]; },
    noir: (r, g, b) => { const l = scurve(lum(r, g, b), .5); return [l, l, l]; },
  };

  // Monotone cubic through sorted [x,y] points (0..1), so curves never overshoot.
  function curveFn(pts) {
    if (!pts || pts.length < 2) return null;
    const P = [...pts].sort((a, b) => a[0] - b[0]), n = P.length;
    if (n === 2 && P[0][0] === 0 && P[0][1] === 0 && P[1][0] === 1 && P[1][1] === 1) return null;
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / Math.max(1e-6, P[i + 1][0] - P[i][0]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
      if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return x => {
      if (x <= P[0][0]) return P[0][1];
      if (x >= P[n - 1][0]) return P[n - 1][1];
      let i = 0; while (x > P[i + 1][0]) i++;
      const h = P[i + 1][0] - P[i][0], t = (x - P[i][0]) / h, t2 = t * t, t3 = t2 * t;
      return clamp((2 * t3 - 3 * t2 + 1) * P[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * P[i + 1][1] + (t3 - t2) * h * m[i + 1], 0, 1);
    };
  }
  // Wheel {x,y} (unit disc) -> a colour push that keeps brightness: cosines 120 degrees apart.
  const wheelRgb = w => { if (!w) return [0, 0, 0]; const a = Math.atan2(num(w.y, 0), num(w.x, 0)), r = Math.min(1, Math.hypot(num(w.x, 0), num(w.y, 0))); return [0, 2, 4].map(k => Math.cos(a - k * Math.PI / 3 * 1) * r); };
  function rgb2hsl(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 1e-6) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }
  function hsl2rgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m];
  }
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  // Does the clip use anything beyond the basic grade?
  function hasColor(it) {
    const c = it.color;
    if (!c) return false;
    if (c.look && c.look !== 'none' && num(c.lookMix, 1) > 0) return true;
    if (c.auto || c.match) return true;
    if (c.lut && c.lut.file && num(c.lut.mix, 1) > 0) return true;
    if (c.hsl && Object.values(c.hsl).some(v => v && (num(v.h, 0) || num(v.s, 0) || num(v.l, 0)))) return true;
    if (c.curves && Object.values(c.curves).some(curveFn)) return true;
    if (c.wheels && Object.values(c.wheels).some(w => w && (num(w.x, 0) || num(w.y, 0) || num(w.l, 0)))) return true;
    return false;
  }
  // One clip's whole colour pipeline as f(r,g,b) -> [r,g,b]. userLut: parsed .cube {n, d} when c.lut.file is set.
  function colorFn(it, userLut) {
    const c = it.color || {}, g = grade(it);
    const look = c.look && LOOKS[c.look], lm = clamp(num(c.lookMix, 1), 0, 1);
    const ul = c.lut && c.lut.file && userLut, um = clamp(num(c.lut && c.lut.mix, 1), 0, 1);
    const cv = c.curves || {}, cl = curveFn(cv.l), cr = curveFn(cv.r), cg = curveFn(cv.g), cb = curveFn(cv.b);
    const W = c.wheels || {}, mixW = clamp(num(c.wheelMix, 1), 0, 1);
    const lift = wheelRgb(W.lift).map(v => v * 0.15 * mixW), gam = wheelRgb(W.gamma).map(v => v * 0.35 * mixW), gain = wheelRgb(W.gain).map(v => v * 0.3 * mixW), off = wheelRgb(W.offset).map(v => v * 0.1 * mixW);
    const liftL = num(W.lift && W.lift.l, 0) * 0.15 * mixW, gamL = num(W.gamma && W.gamma.l, 0) * 0.5 * mixW, gainL = num(W.gain && W.gain.l, 0) * 0.5 * mixW, offL = num(W.offset && W.offset.l, 0) * 0.15 * mixW;
    const bands = HSL_BANDS.map(([k, hc]) => { const v = (c.hsl || {})[k]; return v && (num(v.h, 0) || num(v.s, 0) || num(v.l, 0)) ? [hc, num(v.h, 0) / 100, num(v.s, 0) / 100, num(v.l, 0) / 100] : null; }).filter(Boolean);
    const A = c.auto, M = c.match; // auto levels (per-channel black/white points), colour match (gain + offset)
    return (r, gg, b) => {
      let v = [r, gg, b];
      if (A) v = v.map((x, i) => (x - A.lo[i]) / Math.max(0.05, A.hi[i] - A.lo[i]));
      if (M) v = v.map((x, i) => x * M.gain[i] + M.off[i]);
      if (A || M) v = v.map(x => clamp(x, 0, 1));
      if (ul) { const u = sampleLut(ul, v[0], v[1], v[2]); v = v.map((x, i) => x + (u[i] - x) * um); }
      if (look) { const u = look(v[0], v[1], v[2]); v = v.map((x, i) => x + (clamp(u[i], 0, 1) - x) * lm); }
      if (!g.identity) {
        v = v.map((x, i) => clamp(x * g.ch[i].slope + g.ch[i].intercept, 0, 1));
        const l = lum(v[0], v[1], v[2]); v = v.map(x => clamp(satAdj(x, l, g.s), 0, 1));
      }
      v = v.map((x, i) => {
        x = clamp(x + off[i] + offL, 0, 1);
        x = clamp(x + (lift[i] + liftL) * (1 - x), 0, 1);
        x = clamp(x * (1 + gain[i] + gainL), 0, 1);
        return Math.pow(x, 1 / Math.max(0.1, 1 + gam[i] + gamL));
      });
      if (cl) v = v.map(cl);
      if (cr) v[0] = cr(v[0]); if (cg) v[1] = cg(v[1]); if (cb) v[2] = cb(v[2]);
      if (bands.length) {
        let [h, s, l] = rgb2hsl(v[0], v[1], v[2]), dh = 0, ds = 0, dl = 0;
        const ws = Math.min(1, s * 3); // greys are left alone
        for (const [hc, bh, bs, bl] of bands) {
          const w = Math.max(0, 1 - hueDist(h, hc) / 40) * ws;
          dh += bh * 30 * w; ds += bs * w; dl += bl * 0.2 * w;
        }
        h = (h + dh + 360) % 360; s = clamp(s * (1 + ds), 0, 1); l = clamp(l + dl, 0, 1);
        v = hsl2rgb(h, s, l);
      }
      return v.map(x => clamp(x, 0, 1));
    };
  }
  // Trilinear sample of a parsed cube {n, d: Float32Array rgb, red fastest}.
  function sampleLut(L, r, g, b) {
    const n = L.n, f = x => clamp(x, 0, 1) * (n - 1), R = f(r), G = f(g), B = f(b);
    const r0 = Math.floor(R), g0 = Math.floor(G), b0 = Math.floor(B), r1 = Math.min(n - 1, r0 + 1), g1 = Math.min(n - 1, g0 + 1), b1 = Math.min(n - 1, b0 + 1);
    const fr = R - r0, fg = G - g0, fb = B - b0, at = (i, j, k, c) => L.d[(i + j * n + k * n * n) * 3 + c], out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const c00 = at(r0, g0, b0, c) * (1 - fr) + at(r1, g0, b0, c) * fr, c10 = at(r0, g1, b0, c) * (1 - fr) + at(r1, g1, b0, c) * fr;
      const c01 = at(r0, g0, b1, c) * (1 - fr) + at(r1, g0, b1, c) * fr, c11 = at(r0, g1, b1, c) * (1 - fr) + at(r1, g1, b1, c) * fr;
      out[c] = (c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb;
    }
    return out;
  }
  function parseCube(text) {
    let n = 0; const d = [];
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s[0] === '#') continue;
      const m = /^LUT_3D_SIZE\s+(\d+)/i.exec(s);
      if (m) { n = +m[1]; continue; }
      if (/^[-+\d.]/.test(s)) { const p = s.split(/\s+/).map(Number); if (p.length >= 3 && p.slice(0, 3).every(isFinite)) d.push(p[0], p[1], p[2]); }
    }
    if (!n || d.length !== n * n * n * 3) throw new Error('not a 3D .cube LUT');
    return { n, d: new Float32Array(d) };
  }
  // N^3 table (red fastest, like .cube) of the clip's colour.
  function bakeLut(it, userLut, n = LUT_N) {
    const f = colorFn(it, userLut), out = new Float32Array(n * n * n * 3);
    let o = 0;
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      const v = f(r / (n - 1), g / (n - 1), b / (n - 1));
      out[o++] = v[0]; out[o++] = v[1]; out[o++] = v[2];
    }
    return out;
  }
  const cubeText = (arr, n = LUT_N) => { const L = [`LUT_3D_SIZE ${n}`]; for (let i = 0; i < arr.length; i += 3) L.push(arr[i].toFixed(5) + ' ' + arr[i + 1].toFixed(5) + ' ' + arr[i + 2].toFixed(5)); return L.join('\n') + '\n'; };
  const colorKey = it => JSON.stringify([it.color || null, grade(it).key]);

  const even = v => Math.max(2, Math.round(v / 2) * 2);

  // Source crop in fractions {l,r,t,b}; returns the cropped source rect in source pixels.
  function srcCrop(it, m) {
    const c = it.crop || {}, l = clamp(num(c.l, 0), 0, 0.45), r = clamp(num(c.r, 0), 0, 0.45);
    const t = clamp(num(c.t, 0), 0, 0.45), b = clamp(num(c.b, 0), 0, 0.45);
    const w = Math.max(2, Math.round(m.w * (1 - l - r) / 2) * 2), h = Math.max(2, Math.round(m.h * (1 - t - b) / 2) * 2);
    return { x: Math.round(m.w * l), y: Math.round(m.h * t), w, h, any: l + r + t + b > 0 };
  }

  // Logo-removal box in source pixels, kept 1px inside the frame (ffmpeg delogo refuses boxes touching the edge).
  function logoBox(lo, m) {
    const w = Math.max(2, Math.round(clamp(num(lo.w, 0.18), 0.01, 1) * m.w)), h = Math.max(2, Math.round(clamp(num(lo.h, 0.1), 0.01, 1) * m.h));
    const x = clamp(Math.round(num(lo.x, 0) * m.w), 1, Math.max(1, m.w - w - 1)), y = clamp(Math.round(num(lo.y, 0) * m.h), 1, Math.max(1, m.h - h - 1));
    return { x, y, w: Math.max(2, Math.min(w, m.w - x - 2)), h: Math.max(2, Math.min(h, m.h - y - 2)) };
  }

  // Where a clip lands on the W x H frame. Scale (cropped) source to (sw,sh), crop (cw,ch) at (cx,cy), place at (ox,oy).
  function layout(it, m0, W, H) {
    const sc0 = srcCrop(it, m0), m = { w: sc0.w, h: sc0.h };
    const sc = num(it.scale, 1), bw = W * sc, bh = H * sc;
    const k = (it.fit === 'contain' ? Math.min : Math.max)(bw / m.w, bh / m.h);
    const sw = even(m.w * k), sh = even(m.h * k);
    const cw = Math.min(sw, even(bw)), ch = Math.min(sh, even(bh));
    const cx = Math.round((sw - cw) / 2), cy = Math.round((sh - ch) / 2);
    const ox = Math.round((W - cw) / 2 + num(it.x, 0)), oy = Math.round((H - ch) / 2 + num(it.y, 0));
    return { sw, sh, cw, ch, cx, cy, ox, oy };
  }

  // Whole-file audio effects a clip asks for ('' = none): key of the cached processed copy in media.fx.
  const fxKey = it => (it.denoise ? 'd' : '') + (it.norm ? 'n' : '');
  // Sound fades: a video clip's picture fades also fade its sound; afIn/afOut fade only the sound.
  function audioFade(it, lt) {
    const fi = Math.max(num(it.fadeIn, 0), num(it.afIn, 0)), fo = Math.max(num(it.fadeOut, 0), num(it.afOut, 0));
    let a = 1;
    if (fi > 0) a = Math.min(a, lt / fi);
    if (fo > 0) a = Math.min(a, (it.dur - lt) / fo);
    return clamp(a, 0, 1);
  }
  function fadeAlpha(it, lt) {
    const fi = num(it.fadeIn, 0), fo = num(it.fadeOut, 0);
    let a = 1;
    if (fi > 0) a = Math.min(a, lt / fi);
    if (fo > 0) a = Math.min(a, (it.dur - lt) / fo);
    return clamp(a, 0, 1);
  }

  const projectDur = p => p.items.reduce((m, i) => Math.max(m, i.start + i.dur), 0);

  // Same project at k times the resolution (export at 2K/4K). Pixel offsets and text sizes scale; fractions don't.
  function scaleProject(p, k) {
    const q = JSON.parse(JSON.stringify(p));
    if (k === 1) return q;
    q.w = Math.round(p.w * k / 2) * 2;
    q.h = Math.round(p.h * k / 2) * 2;
    for (const it of q.items) {
      if (typeof it.x === 'number' && it.type !== 'text') it.x *= k;
      if (typeof it.y === 'number' && it.type !== 'text') it.y *= k;
      if (it.kf && it.type !== 'text') for (const f of ['x', 'y']) if (it.kf[f]) it.kf[f] = it.kf[f].map(([t, v]) => [t, v * k]);
      if (it.style) for (const f of ['size', 'strokeW', 'spacing', 'shadowBlur', 'shadowDist', 'glowSize']) if (typeof it.style[f] === 'number') it.style[f] *= k;
    }
    return q;
  }

  // whisper.cpp JSON (-ml 1 -sow) -> [{w,s,e}] in seconds. Punctuation-only tokens join the previous word.
  function parseWhisper(json) {
    const out = [];
    for (const seg of json.transcription || []) {
      const w = (seg.text || '').trim();
      if (!w || /^[\[(].*[\])]$/.test(w)) continue;
      const s = seg.offsets.from / 1000, e = seg.offsets.to / 1000;
      if (/^[\p{P}\p{S}]+$/u.test(w) && out.length) { out[out.length - 1].w += w; out[out.length - 1].e = e; continue; }
      out.push({ w, s, e });
    }
    return out;
  }

  // Words -> caption chunks of a few words each.
  function groupWords(words, maxWords = 3, maxGap = 0.6, maxChars = 22) {
    const out = [];
    let cur = null;
    for (const w of words) {
      const last = cur && cur.words[cur.words.length - 1];
      const brk = !cur || cur.words.length >= maxWords || w.s - cur.end > maxGap ||
        (cur.text + ' ' + w.w).length > maxChars || /[.!?؟،,]$/.test(last.w);
      if (brk) { cur = { start: w.s, end: w.e, words: [], text: '' }; out.push(cur); }
      cur.words.push(w);
      cur.end = w.e;
      cur.text = cur.words.map(x => x.w).join(' ');
    }
    return out;
  }

  // Motion tracking: it.trk.pts = [[lt, fx, fy], ...] sorted by lt; offsets are fractions of the frame size.
  function trkAt(it, lt) {
    const p = it.trk && it.trk.pts;
    if (!p || !p.length) return [0, 0];
    if (lt <= p[0][0]) return [p[0][1], p[0][2]];
    for (let i = 1; i < p.length; i++) if (lt <= p[i][0]) {
      const a = p[i - 1], b = p[i], u = (lt - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    }
    const z = p[p.length - 1];
    return [z[1], z[2]];
  }
  // Piecewise curve [[lt, v], ...] as an ffmpeg expression: a flat sum of pieces (no deep nesting).
  // off shifts lt into the filter's clock (item start for overlay's global t, 0 for local t); tv names that clock.
  function pwExpr(pts, off, smooth, tv = 't') {
    const T = x => (x + off).toFixed(4), V = v => (+v).toFixed(4), n = pts.length;
    if (n === 1) return V(pts[0][1]);
    const parts = [`lt(${tv},${T(pts[0][0])})*${V(pts[0][1])}`, `gte(${tv},${T(pts[n - 1][0])})*${V(pts[n - 1][1])}`];
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1], b = pts[i], d = b[0] - a[0];
      if (d <= 0) continue;
      const u = `(${tv}-${T(a[0])})/${d.toFixed(4)}`, f = smooth ? `(${u})*(${u})*(3-2*(${u}))` : u;
      parts.push(`gte(${tv},${T(a[0])})*lt(${tv},${T(b[0])})*(${V(a[1])}+${V(b[1] - a[1])}*${f})`);
    }
    return parts.join('+');
  }
  function trkExpr(it, size, axis) {
    const p = it.trk && it.trk.pts;
    return p && p.length ? pwExpr(p.map(q => [q[0], q[axis + 1] * size]), it.start, false) : '0';
  }

  // Keyframes: it.kf = { x|y|scale|rotate|opacity: [[lt, v], ...] } sorted by lt, smoothstep between keys.
  const KF = ['x', 'y', 'scale', 'rotate', 'opacity'];
  function kfVal(p, lt) {
    if (lt <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) if (lt <= p[i][0]) {
      const a = p[i - 1], b = p[i], u = (lt - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * u * u * (3 - 2 * u);
    }
    return p[p.length - 1][1];
  }
  const hasKf = it => !!(it.kf && KF.some(k => it.kf[k] && it.kf[k].length));
  function animAt(it, lt) { // item with its keyframed props resolved at local time lt
    if (!hasKf(it)) return it;
    const o = { ...it };
    for (const k of KF) if (it.kf[k] && it.kf[k].length) o[k] = kfVal(it.kf[k], lt);
    return o;
  }
  // Keyframes and tracking are pinned to the content: dropping d seconds from the front moves them back by d.
  function shiftTimes(it, d) {
    if (it.kf) for (const k of KF) if (it.kf[k]) it.kf[k] = it.kf[k].map(([t, v]) => [+(t - d).toFixed(4), v]);
    if (it.trk) it.trk = { pts: it.trk.pts.map(([t, x, y]) => [+(t - d).toFixed(4), x, y]) };
  }

  // Visual (image/video/logo) animations: in/out play over it.inDur/it.outDur, loop runs all clip long.
  // Each returns deltas {dx, dy (fractions of the frame), s (scale factor), r (degrees), o (opacity factor)}.
  const EASE = {
    out: p => 1 - Math.pow(1 - p, 3), in: p => p * p * p,
    back: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    bounce: p => { const n = 7.5625, d = 2.75; return p < 1 / d ? n * p * p : p < 2 / d ? n * (p -= 1.5 / d) * p + 0.75 : p < 2.5 / d ? n * (p -= 2.25 / d) * p + 0.9375 : n * (p -= 2.625 / d) * p + 0.984375; },
  };
  const VA_IN = {
    fade: u => ({ o: EASE.out(u) }),
    slideUp: u => ({ dy: (1 - EASE.out(u)) * 0.6 }),
    slideDown: u => ({ dy: -(1 - EASE.out(u)) * 0.6 }),
    slideLeft: u => ({ dx: (1 - EASE.out(u)) * 0.6 }),
    slideRight: u => ({ dx: -(1 - EASE.out(u)) * 0.6 }),
    pop: u => ({ s: 0.6 + 0.4 * EASE.back(u), o: Math.min(1, u * 3) }),
    zoomIn: u => ({ s: 2 - EASE.out(u), o: EASE.out(u) }),
    grow: u => ({ s: Math.max(0.01, EASE.back(u)) }),
    drop: u => ({ dy: -(1 - EASE.bounce(u)) * 0.5, o: Math.min(1, u * 4) }),
    rotateIn: u => ({ r: -(1 - EASE.out(u)) * 90, s: 0.5 + 0.5 * EASE.out(u), o: EASE.out(u) }),
    spin: u => ({ r: -(1 - EASE.out(u)) * 360, s: Math.max(0.01, EASE.out(u)) }),
    rise: u => ({ dy: (1 - EASE.out(u)) * 0.12, o: EASE.out(u) }),
  };
  const VA_OUT = {
    fade: u => ({ o: 1 - u }),
    slideUp: u => ({ dy: -EASE.in(u) * 0.6 }),
    slideDown: u => ({ dy: EASE.in(u) * 0.6 }),
    slideLeft: u => ({ dx: -EASE.in(u) * 0.6 }),
    slideRight: u => ({ dx: EASE.in(u) * 0.6 }),
    shrink: u => ({ s: Math.max(0.01, 1 - EASE.in(u)) }),
    zoomOut: u => ({ s: 1 + EASE.in(u), o: 1 - u }),
    rotateOut: u => ({ r: EASE.in(u) * 90, s: 1 - 0.5 * EASE.in(u), o: 1 - u }),
    spinOut: u => ({ r: EASE.in(u) * 360, s: Math.max(0.01, 1 - EASE.in(u)) }),
    sink: u => ({ dy: EASE.in(u) * 0.12, o: 1 - u }),
  };
  // Loops: f for the preview, e builds the same curve as an ffmpeg expression of local time L (exact, no sampling).
  const VA_LOOP = {
    pulse: { f: (L) => ({ s: 1 + 0.05 * Math.sin(2 * Math.PI * 1.2 * L) }), e: { s: L => `1+0.05*sin(2*PI*1.2*${L})` }, smax: 1.05 },
    breathe: { f: (L) => ({ s: 1 + 0.04 * Math.sin(2 * Math.PI * 0.4 * L) }), e: { s: L => `1+0.04*sin(2*PI*0.4*${L})` }, smax: 1.04 },
    heartbeat: { f: (L) => ({ s: 1 + 0.08 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 1.1 * L)), 8) }), e: { s: L => `1+0.08*pow(max(0,sin(2*PI*1.1*${L})),8)` }, smax: 1.08 },
    float: { f: (L) => ({ dy: 0.015 * Math.sin(2 * Math.PI * 0.6 * L) }), e: { dy: L => `0.015*sin(2*PI*0.6*${L})` } },
    shake: { f: (L) => ({ dx: 0.01 * Math.sin(L * 47) * Math.sin(L * 13), dy: 0.006 * Math.sin(L * 39) }), e: { dx: L => `0.01*sin(${L}*47)*sin(${L}*13)`, dy: L => `0.006*sin(${L}*39)` } },
    swing: { f: (L) => ({ r: 6 * Math.sin(2 * Math.PI * 0.8 * L) }), e: { r: L => `6*sin(2*PI*0.8*${L})` } },
    spinLoop: { f: (L) => ({ r: 90 * L }), e: { r: L => `90*${L}` } },
    kenBurns: { f: (L, d) => ({ s: 1 + 0.15 * L / d, dx: 0.03 * L / d }), e: { s: (L, d) => `1+0.15*${L}/${(+d).toFixed(4)}`, dx: (L, d) => `0.03*${L}/${(+d).toFixed(4)}` }, smax: 1.15 },
  };
  const vaIn = it => it.type !== 'text' && VA_IN[it.anim] ? it.anim : null;
  const vaOut = it => it.type !== 'text' && VA_OUT[it.out] ? it.out : null;
  const vaLoop = it => it.type !== 'text' && VA_LOOP[it.loop] ? it.loop : null;
  const hasVa = it => !!(vaIn(it) || vaOut(it) || vaLoop(it));
  function vaDelta(it, lt, loop = true) {
    const d = { dx: 0, dy: 0, s: 1, r: 0, o: 1 };
    const add = q => { if (!q) return; d.dx += q.dx || 0; d.dy += q.dy || 0; d.s *= num(q.s, 1); d.r += q.r || 0; d.o *= num(q.o, 1); };
    const inD = Math.min(num(it.inDur, 0.5), it.dur), outD = Math.min(num(it.outDur, 0.4), it.dur);
    if (vaIn(it) && lt < inD) add(VA_IN[it.anim](clamp(lt / inD, 0, 1)));
    if (vaOut(it) && it.dur - lt < outD) add(VA_OUT[it.out](clamp(1 - (it.dur - lt) / outD, 0, 1)));
    if (loop && vaLoop(it)) add(VA_LOOP[it.loop].f(lt, it.dur));
    return d;
  }
  // Resolved item (after animAt) with its visual animation applied; x/y are pixels, so deltas scale by W/H.
  function withVa(a, lt, W, H, loop = true) {
    if (!hasVa(a)) return a;
    const d = vaDelta(a, lt, loop);
    return { ...a, x: num(a.x, 0) + d.dx * W, y: num(a.y, 0) + d.dy * H, scale: num(a.scale, 1) * d.s, rotate: num(a.rotate, 0) + d.r, opacity: num(a.opacity, 1) * d.o };
  }
  // Export: in/out (and any keyframes under them) are sampled into linear keyframes; the loop stays an exact expression (_loop).
  function bakeVa(it, W, H) {
    if (!hasVa(it)) return it;
    const o = { ...it, _loop: vaLoop(it) };
    if (!vaIn(it) && !vaOut(it)) return o;
    const dur = it.dur, inD = Math.min(num(it.inDur, 0.5), dur), outD = Math.min(num(it.outDur, 0.4), dur), ts = new Set([0, dur]);
    const span = (a, b, st) => { for (let x = a; x < b; x += st) ts.add(+x.toFixed(4)); ts.add(+b.toFixed(4)); };
    if (vaIn(it)) span(0, inD, 1 / 30);
    if (vaOut(it)) span(dur - outD, dur, 1 / 30);
    if (hasKf(it)) for (const k of KF) if (it.kf[k]) { const p = it.kf[k]; for (let i = 0; i < p.length; i++) { ts.add(p[i][0]); if (i) span(p[i - 1][0], p[i][0], 0.1); } }
    const times = [...ts].filter(x => x >= 0 && x <= dur).sort((a, b) => a - b);
    const rows = times.map(x => withVa(animAt(it, x), x, W, H, false));
    o.kf = {};
    for (const k of KF) {
      const v = rows.map(r => num(r[k], k === 'scale' || k === 'opacity' ? 1 : 0));
      if (v.some(x => Math.abs(x - v[0]) > 1e-6)) o.kf[k] = times.map((x, i) => [x, +v[i].toFixed(5)]);
    }
    o._lin = true;
    return o;
  }

  // Speed curves. it.curve = { id, pts: [[u, speed]], src }: u is the position in the source range (0..1),
  // src the source seconds the clip covers. Speed eases between points on a log scale; it.dur stretches the
  // whole curve (the shape is relative), so trimming/splitting only has to keep the source range right.
  const CURVES = {
    custom: [[0, 1], [0.25, 1], [0.5, 1], [0.75, 1], [1, 1]],
    montage: [[0, 1], [0.1, 1], [0.42, 5], [0.65, 0.2], [0.82, 1], [1, 1]],
    hero: [[0, 1], [0.3, 5], [0.43, 0.25], [0.57, 0.25], [0.7, 5], [1, 1]],
    bullet: [[0, 5], [0.4, 5], [0.47, 0.25], [0.53, 0.25], [0.6, 5], [1, 5]],
    jumpCut: [[0, 0.3], [0.42, 0.3], [0.5, 5], [0.58, 0.3], [1, 0.3]],
    flashIn: [[0, 5], [0.4, 5], [0.6, 1], [1, 1]],
    flashOut: [[0, 1], [0.4, 1], [0.6, 5], [1, 5]],
  };
  function curveSpeed(pts, u) {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) {
      const a = pts[i - 1], b = pts[i], q = (u - a[0]) / Math.max(1e-6, b[0] - a[0]), e = q * q * (3 - 2 * q);
      return Math.pow(10, Math.log10(a[1]) + (Math.log10(b[1]) - Math.log10(a[1])) * e);
    }
    return pts[pts.length - 1][1];
  }
  // Cumulative output time over u, normalised to 0..1 (table of N steps), plus G = output seconds per source second at shape scale.
  const curveTabs = new WeakMap();
  function curveTab(c) {
    let tb = curveTabs.get(c);
    if (tb) return tb;
    const N = 400, g = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) g[i] = g[i - 1] + 1 / curveSpeed(c.pts, (i - 0.5) / N) / N;
    const G = g[N];
    for (let i = 0; i <= N; i++) g[i] /= G;
    curveTabs.set(c, tb = { g, N, G });
    return tb;
  }
  const curveDur = c => c.src * curveTab(c).G; // natural duration of a curve
  function uAtF(c, f) { // output fraction -> source fraction
    const { g, N } = curveTab(c);
    f = clamp(f, 0, 1);
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[m] <= f) lo = m; else hi = m; }
    return (lo + (f - g[lo]) / Math.max(1e-12, g[hi] - g[lo])) / N;
  }
  function fAtU(c, u) { // source fraction -> output fraction
    const { g, N } = curveTab(c), x = clamp(u, 0, 1) * N, i = Math.min(N - 1, Math.floor(x));
    return g[i] + (g[i + 1] - g[i]) * (x - i);
  }
  const hasCurve = it => !!(it.curve && it.curve.pts && it.curve.pts.length > 1 && it.curve.src > 0);
  const srcLen = it => hasCurve(it) ? it.curve.src : it.dur * num(it.speed, 1);
  // Seconds into the source (from it.in) at local time lt, and back.
  const srcAt = (it, lt) => hasCurve(it) ? it.curve.src * uAtF(it.curve, lt / it.dur) : lt * num(it.speed, 1);
  const ltAt = (it, so) => hasCurve(it) ? it.dur * fAtU(it.curve, so / it.curve.src) : so / num(it.speed, 1);
  // Playback rate at local time lt.
  function rateAt(it, lt) {
    if (!hasCurve(it)) return num(it.speed, 1);
    const c = it.curve, u = uAtF(c, lt / it.dur);
    return c.src / it.dur * curveSpeed(c.pts, u) * curveTab(c).G;
  }
  // The part of a curved clip between local times a and b, as a new curve (resampled shape, its own source length).
  function subCurve(it, a, b) {
    const c = it.curve, u0 = uAtF(c, a / it.dur), u1 = uAtF(c, b / it.dur), n = 16, pts = [];
    for (let i = 0; i <= n; i++) pts.push([+(i / n).toFixed(4), +curveSpeed(c.pts, u0 + (u1 - u0) * i / n).toFixed(4)]);
    return { id: c.id, pts, src: +(c.src * (u1 - u0)).toFixed(5), edited: true };
  }

  // Masks: a shape in the clip box's own 0..1 space. Preview uses the alpha directly; the export
  // gets the same canvas as a grey PNG through alphamerge.
  const MASKS = ['linear', 'mirror', 'circle', 'rect'];
  const MASK_DEF = { x: 0.5, y: 0.5, w: 0.5, h: 0.5, rot: 0, feather: 0.1, round: 0, invert: false };
  const hasMask = it => !!(it.mask && MASKS.includes(it.mask.type));
  function drawMask(ctx, M, w, h) {
    const q = { ...MASK_DEF, ...M }, cx = q.x * w, cy = q.y * h, D = Math.hypot(w, h), fp = Math.max(0.5, q.feather * 0.25 * D);
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(cx, cy); ctx.rotate(q.rot * Math.PI / 180);
    if (q.type === 'linear' || q.type === 'mirror') {
      const half = q.type === 'mirror' ? q.h * h / 2 : 0, g = ctx.createLinearGradient(0, -half - fp / 2, 0, half + fp / 2);
      const e = fp / (2 * half + fp);
      if (q.type === 'linear') { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, '#fff'); ctx.fillStyle = g; ctx.fillRect(-D, -fp / 2, 2 * D, 2 * D); }
      else { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(e, '#fff'); g.addColorStop(1 - e, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(-D, -half - fp / 2, 2 * D, 2 * half + fp); }
    } else if (q.type === 'circle') {
      const rx = Math.max(1, q.w * w / 2), ry = Math.max(1, q.h * h / 2);
      ctx.scale(1, ry / rx);
      const r = rx + fp / 2, g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, '#fff'); g.addColorStop(clamp((rx - fp / 2) / r, 0, 0.999), '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    } else {
      const rw = q.w * w, rh = q.h * h, rr = clamp(q.round, 0, 1) * Math.min(rw, rh) / 2, off = 4 * D;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-rw / 2 + off, -rh / 2, rw, rh, rr); else ctx.rect(-rw / 2 + off, -rh / 2, rw, rh);
      // the soft edge is the shadow of a shape drawn off-canvas
      ctx.shadowColor = '#fff'; ctx.shadowBlur = fp / 2; ctx.shadowOffsetX = -off * ctx.getTransform().a; ctx.shadowOffsetY = -off * ctx.getTransform().b;
      ctx.fillStyle = '#fff'; ctx.fill();
    }
    ctx.restore();
    if (q.invert) { ctx.save(); ctx.globalCompositeOperation = 'xor'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
  }

  // Chroma key: same formula as ffmpeg's chromakey (UV distance to the key colour).
  const hasKey = it => !!(it.chroma && it.chroma.on);
  function keyUV(hex) {
    const n = parseInt(String(hex || '#00ff00').slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    return [-0.1146 * r - 0.3854 * g + 0.5 * b, 0.5 * r - 0.4542 * g - 0.0458 * b]; // BT.709 Cb, Cr (centred)
  }
  // Transitions live on the incoming clip (it.trans = {id, dur}). The clip just before it on the same
  // track holds its last frame underneath until the transition ends, so total length never changes.
  const TRANS = ['fade', 'black', 'white', 'slideL', 'slideR', 'slideU', 'slideD', 'wipeL', 'wipeR', 'wipeU', 'wipeD', 'circle', 'split', 'zoomIn', 'spin', 'shake', 'glitch'];
  // shader transitions (src/gltrans.js): drawn by the app, the export overlays their rendered frames
  const GLT = typeof module !== 'undefined' && module.exports ? require('./gltrans').ids : root.MaqtoGLT ? root.MaqtoGLT.ids : [];
  const TR_SLIDE = { slideL: [1, 0], slideR: [-1, 0], slideU: [0, 1], slideD: [0, -1] }; // where the new clip comes in from
  const TR_DIP = { black: '#000000', white: '#ffffff' };
  // revealed part of the new clip at progress P, over its own box (X, Y in a W x H box): ffmpeg geq form
  const TR_GEQ = { wipeL: 'gte(X,W*(1-P))', wipeR: 'lte(X,W*P)', wipeU: 'gte(Y,H*(1-P))', wipeD: 'lte(Y,H*P)',
    circle: 'lte(hypot(X-W/2,Y-H/2),hypot(W,H)/2*P)', split: 'lte(abs(X-W/2),W/2*P)' };
  const ease3 = q => q * q * (3 - 2 * q); // smoothstep, same as the export's expression
  // Cut-in-the-middle transitions: the outgoing clip (a) moves over the first half, the new clip (b)
  // over the second. Formulas use U (0..1 through that half) and E (U eased); z = zoom inside the
  // clip box, r = degrees, x = sideways shift as a share of the frame width, rgb = colour split.
  // The same strings are ffmpeg expressions in the export and evaluated here for the preview.
  const TR_MOVE = {
    zoomIn: { a: { z: '1+0.8*E' }, b: { z: '1.8-0.8*E' } },
    spin: { a: { z: '1+2*E*(2-E)', r: '90*E' }, b: { z: '3-2*E*E', r: '-90*(1-E)' } }, // zoom keeps the box covered while it turns (9:16 at 45° needs ~2x)
    shake: { a: { z: '1+0.15*U', x: '0.06*sin(2*PI*3*U)*U' }, b: { z: '1.15-0.15*U', x: '0.06*sin(2*PI*3*U)*(1-U)' } },
    glitch: { a: { z: '1.05', x: '0.04*(mod(floor(U*12)*7,3)-1)', rgb: 1 }, b: { z: '1.05', x: '0.04*(mod(floor(U*12)*5,3)-1)', rgb: 1 } },
  };
  const trSub = (e, u) => String(e).replace(/\bE\b/g, easeExpr(`(${u})`)).replace(/\bU\b/g, `(${u})`);
  // Tiny evaluator for those formulas (the app's CSP forbids eval): numbers, + - * /, unary minus,
  // brackets, PI and the functions below.
  const TR_F = { sin: Math.sin, cos: Math.cos, floor: Math.floor, pow: Math.pow, mod: (a, b) => a - b * Math.floor(a / b), clip: (v, a, b) => Math.min(b, Math.max(a, v)) };
  function trEval(src) {
    const tk = src.match(/\d*\.?\d+(?:e[-+]?\d+)?|[A-Za-z_]\w*|[-+*/(),]/g) || [];
    let i = 0;
    const peek = () => tk[i], eat = x => { if (tk[i] !== x) throw new Error('expected ' + x + ' in ' + src); i++; };
    const prim = () => {
      const t = tk[i++];
      if (t === '(') { const v = sum(); eat(')'); return v; }
      if (t === '-') return -prim();
      if (t === '+') return prim();
      if (/^[\d.]/.test(t)) return +t;
      if (t === 'PI') return Math.PI;
      if (TR_F[t]) { eat('('); const a = [sum()]; while (peek() === ',') { i++; a.push(sum()); } eat(')'); return TR_F[t](...a); }
      throw new Error('bad token ' + t + ' in ' + src);
    };
    const prod = () => { let v = prim(); while (peek() === '*' || peek() === '/') v = tk[i++] === '*' ? v * prim() : v / prim(); return v; };
    const sum = () => { let v = prod(); while (peek() === '+' || peek() === '-') v = tk[i++] === '+' ? v + prod() : v - prod(); return v; };
    const v = sum();
    if (i !== tk.length) throw new Error('trailing input in ' + src);
    return v;
  }
  const trVal = (e, u) => e == null ? null : trEval(trSub(e, u));
  const easeExpr = q => `(3*pow(${q},2)-2*pow(${q},3))`;
  // same shapes as TR_GEQ, as a canvas clip path
  function transClip(ctx, id, p, x, y, w, h) {
    ctx.beginPath();
    if (id === 'wipeL') ctx.rect(x + w * (1 - p), y, w * p, h);
    else if (id === 'wipeR') ctx.rect(x, y, w * p, h);
    else if (id === 'wipeU') ctx.rect(x, y + h * (1 - p), w, h * p);
    else if (id === 'wipeD') ctx.rect(x, y, w, h * p);
    else if (id === 'circle') ctx.arc(x + w / 2, y + h / 2, Math.hypot(w, h) / 2 * p, 0, Math.PI * 2);
    else if (id === 'split') ctx.rect(x + w / 2 * (1 - p), y, w * p, h);
    ctx.clip();
  }
  const visualClip = (p, i) => { const m = i.media && p.media[i.media]; return !!m && m.kind !== 'audio' && !i.hidden; };
  function transIn(p, it) {
    const T = it.trans;
    if (!T || !(TRANS.includes(T.id) || GLT.includes(T.id)) || !visualClip(p, it)) return null;
    const tol = 0.5 / (p.fps || 30);
    const prev = p.items.find(i => i.id !== it.id && i.track === it.track && visualClip(p, i) && Math.abs(i.start + i.dur - it.start) < tol);
    return prev ? { id: T.id, d: clamp(num(T.dur, 0.5), 0.1, Math.min(2, it.dur)), dir: num(T.dir, 0) & 3, ease: T.ease || 'lin', prev } : null;
  }
  function transOut(p, it) {
    for (const b of p.items) if (b !== it && b.track === it.track && b.trans) { const r = transIn(p, b); if (r && r.prev === it) return { ...r, next: b }; }
    return null;
  }

  // Blend modes: the export's ffmpeg blend mode, and whether the layer is blend's first input (measured
  // against the canvas / W3C formulas: dodge and burn take the layer first, the rest the base).
  const BLEND_FF = { multiply: ['multiply'], screen: ['screen'], overlay: ['overlay'], darken: ['darken'], lighten: ['lighten'], softlight: ['softlight'],
    hardlight: ['hardlight'], difference: ['difference'], exclusion: ['exclusion'], addition: ['addition'], dodge: ['dodge', 1], burn: ['burn', 1] };

  // Clip effects (amount a 0..1). The preview runs them in the WebGL grade shader from fxVals (ids are
  // FX index + 1); the export runs fxChain as ffmpeg filters in clip time, on the clip's w x h box.
  const FX = ['blur', 'shake', 'zoomPulse', 'grain', 'vignette', 'rgbSplit', 'glitch', 'vhs', 'pixelate', 'invert', 'flash', 'letterbox'];
  const fxOf = it => it && it.fx && FX.includes(it.fx.id) ? { id: it.fx.id, a: clamp(num(it.fx.a, 0.5), 0, 1) } : null;
  const fxShake = (m, t) => [m * Math.sin(t * 37) * Math.sin(t * 13), m * Math.sin(t * 29 + 1) * Math.sin(t * 7)];
  const FXE = { // shared time curves: [js, ffmpeg] of clip time t
    pulse: [t => Math.pow(Math.max(0, Math.sin(2 * Math.PI * 2 * t)), 4), 'pow(max(0,sin(2*PI*2*t)),4)'],
    flash: [t => Math.pow(Math.max(0, Math.sin(2 * Math.PI * 1.5 * t)), 8), 'pow(max(0,sin(2*PI*1.5*t)),8)'],
    burst: [t => (Math.floor(t * 8) * 7919) % 13 > 8 ? 1 : 0, 'gt(mod(floor(t*8)*7919,13),8)'],
  };
  const fxSplit = (a, w, k) => Math.max(1, Math.round(a * k * w));
  function fxVals(it, t, w, h) {
    const f = fxOf(it);
    if (!f) return null;
    const a = f.a, v = [0, 0, 1, 0];
    switch (f.id) {
      case 'blur': v[0] = a * 0.02 * w; break;
      case 'shake': { const m = a * 0.03, [dx, dy] = fxShake(m, t); v[0] = dx; v[1] = dy; v[2] = 1 / (1 - 2 * m); break; }
      case 'zoomPulse': v[2] = 1 + 0.12 * a * FXE.pulse[0](t); break;
      case 'grain': v[1] = a * 0.31; break;
      case 'vignette': v[0] = 0.2 + a * 0.9; break;
      case 'rgbSplit': v[0] = fxSplit(a, w, 0.02); break;
      case 'glitch': v[0] = FXE.burst[0](t) * fxSplit(a, w, 0.05); break;
      case 'vhs': v[0] = fxSplit(a, w, 0.008); v[1] = a * 0.2; v[2] = 1 - 0.35 * a; break;
      case 'pixelate': v[0] = Math.max(2, Math.round(a * 0.05 * w)); break;
      case 'flash': v[0] = 0.6 * a * FXE.flash[0](t); break;
      case 'letterbox': v[0] = Math.round(a * 0.16 * h) / h; break;
    }
    return { i: FX.indexOf(f.id) + 1, v };
  }
  function fxChain(it, w, h) {
    const f = fxOf(it);
    if (!f) return [];
    const a = f.a, ev = x => Math.max(2, Math.round(x / 2) * 2), r3 = x => (+x).toFixed(3);
    switch (f.id) {
      case 'blur': return [`gblur=sigma=${r3(a * 0.01 * w)}`];
      case 'shake': { const m = a * 0.03, z = 1 / (1 - 2 * m);
        return [`scale=${ev(w * z)}:${ev(h * z)}`, `crop=${w}:${h}:x='(iw-ow)/2+${r3(m)}*sin(t*37)*sin(t*13)*iw':y='(ih-oh)/2+${r3(m)}*sin(t*29+1)*sin(t*7)*ih'`]; }
      case 'zoomPulse': { const Z = `(1+${r3(0.12 * a)}*${FXE.pulse[1]})`;
        return [`scale=w='trunc(iw*${Z}/2)*2':h='trunc(ih*${Z}/2)*2':eval=frame`, `crop=${w}:${h}:(iw-ow)/2:(ih-oh)/2`]; }
      case 'grain': return [`noise=alls=${Math.round(a * 40)}:allf=t+u`];
      case 'vignette': return [`vignette=angle=${r3(0.2 + a * 0.9)}`];
      case 'rgbSplit': { const o = fxSplit(a, w, 0.02); return ['format=gbrap', `rgbashift=rh=-${o}:bh=${o}`]; }
      case 'glitch': { const o = fxSplit(a, w, 0.05); return ['format=gbrap', `rgbashift=rh=-${o}:bh=${o}:enable='${FXE.burst[1]}'`]; }
      case 'vhs': { const o = fxSplit(a, w, 0.008);
        return ['format=gbrap', `rgbashift=rh=-${o}:bh=${o}`, `noise=alls=${Math.round(a * 25)}:allf=t+u`, `hue=s=${r3(1 - 0.35 * a)}`]; }
      case 'pixelate': { const b = Math.max(2, Math.round(a * 0.05 * w));
        return [`scale=${Math.max(1, Math.round(w / b))}:${Math.max(1, Math.round(h / b))}:flags=neighbor`, `scale=${w}:${h}:flags=neighbor`]; }
      case 'invert': return ['negate'];
      case 'flash': return [`eq=brightness='${r3(0.6 * a)}*${FXE.flash[1]}':eval=frame`];
      case 'letterbox': { const b = Math.round(a * 0.16 * h);
        return b < 1 ? [] : [`drawbox=x=0:y=0:w=iw:h=${b}:color=black:t=fill`, `drawbox=x=0:y=ih-${b}:w=iw:h=${b}:color=black:t=fill`]; }
    }
    return [];
  }

  const api = { FX, fxOf, fxVals, fxChain, TR_MOVE, trSub, trVal, BLEND_FF, TRANS, GLT, TR_SLIDE, TR_DIP, TR_GEQ, ease3, easeExpr, transClip, transIn, transOut, hasKey, keyUV, MASKS, MASK_DEF, hasMask, drawMask, num, clamp, CURVES, curveSpeed, curveDur, uAtF, fAtU, hasCurve, srcLen, srcAt, ltAt, rateAt, subCurve, EASE, VA_IN, VA_OUT, VA_LOOP, hasVa, vaDelta, withVa, bakeVa, PRESETS, grade, HSL_BANDS, LOOKS, LUT_N, hasColor, colorFn, curveFn, parseCube, sampleLut, bakeLut, cubeText, colorKey, srcCrop, logoBox, layout, fadeAlpha, audioFade, fxKey, projectDur, scaleProject, parseWhisper, groupWords, trkAt, trkExpr, pwExpr, KF, kfVal, hasKf, animAt, shiftTimes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaqtoShared = api;
})(this);
