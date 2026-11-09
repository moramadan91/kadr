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

  const api = { num, clamp, CURVES, curveSpeed, curveDur, uAtF, fAtU, hasCurve, srcLen, srcAt, ltAt, rateAt, subCurve, EASE, VA_IN, VA_OUT, VA_LOOP, hasVa, vaDelta, withVa, bakeVa, PRESETS, grade, srcCrop, logoBox, layout, fadeAlpha, projectDur, scaleProject, parseWhisper, groupWords, trkAt, trkExpr, pwExpr, KF, kfVal, hasKf, animAt, shiftTimes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KadrShared = api;
})(this);
