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

  const api = { num, clamp, PRESETS, grade, srcCrop, layout, fadeAlpha, projectDur, scaleProject, parseWhisper, groupWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KadrShared = api;
})(this);
