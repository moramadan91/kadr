'use strict';
window.addEventListener('error', e => window.__TAURI__?.core.invoke('dev_log', { msg: `${e.message} @${e.lineno}` }));
window.addEventListener('unhandledrejection', e => window.__TAURI__?.core.invoke('dev_log', { msg: 'rejection: ' + (e.reason && (e.reason.stack || e.reason)) }));
const S = window.KadrShared, G = window.KadrGraph, I18N = window.KadrI18n, ICONS = window.KadrIcons;
const TA = window.__TAURI__;
const inv = TA.core.invoke;
const { clamp, num } = S;
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<svg class="ic" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;
const IS_MAC = /Mac/.test(navigator.userAgent);
if (IS_MAC) document.documentElement.classList.add('mac');

const ASPECTS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const FONTS = ['Cairo', 'Geeza Pro', 'Arial', 'Helvetica Neue', 'Georgia', 'Impact'];
const ACCENT = '#2ee6d6';
const ROW = 46;
const IN_T = 0.35, OUT_T = 0.25;
const MEDIA_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];

/* ---------- language ---------- */
let LANG = (() => { try { return localStorage.getItem('kadr.lang') || 'ar'; } catch { return 'ar'; } })();
const tr = (k, vars) => { let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.en[k] ?? k; if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]); return s; };
function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  $$('[data-t]').forEach(el => (el.textContent = tr(el.dataset.t)));
  $$('[data-tt]').forEach(el => (el.title = tr(el.dataset.tt)));
  try { localStorage.setItem('kadr.lang', LANG); } catch {}
}
function paintIcons(root = document) {
  root.querySelectorAll('[data-i]').forEach(el => { if (!el.querySelector(':scope > svg.ic')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.i)); });
}

/* ---------- project & history ---------- */
function newProject() {
  return {
    version: 2, w: 1080, h: 1920, fps: 30, media: {}, items: [], markers: [],
    tracks: [
      { id: 'c1', kind: 'text' }, { id: 't1', kind: 'text' }, { id: 'v2', kind: 'video' },
      { id: 'v1', kind: 'video' }, { id: 'a1', kind: 'audio' }, { id: 'a2', kind: 'audio' },
    ],
  };
}
let P = newProject(), projectPath = null, dirty = false;
let sel = null, t = 0, playing = false, pps = 60, lastTick = 0, needsDraw = true, cancelled = false;
let tool = 'select', magnet = true, snapOn = true, inspTab = null, libTab = 'media';
const undoStack = [], redoStack = [];

const item = id => P.items.find(i => i.id === id);
const media = it => it && it.media && P.media[it.media];
const isText = it => it && it.type === 'text';
const active = (it, time) => time >= it.start && time < it.start + it.dur;
const kindOf = it => (isText(it) ? 'text' : media(it).kind);
const total = () => S.projectDur(P);
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60), x = Math.floor(s % 60), f = Math.floor((s % 1) * P.fps + 1e-6); return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };
const renderOrder = (pr, kind) => pr.tracks.filter(x => x.kind === kind).map(x => x.id).reverse();
let MEDIA_BASE = '';
const urlOf = m => MEDIA_BASE + encodeURIComponent(m.path);
const cleanErr = e => String(e && e.message || e).replace(/^Error: /, '');

function snapshot() {
  undoStack.push(JSON.stringify(P));
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  dirty = true;
}
function restore(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(P));
  P = JSON.parse(from.pop());
  if (sel && !item(sel)) sel = null;
  dirty = true;
  syncSettings();
  refresh();
}

/* ---------- media elements ---------- */
const els = new Map(), imgs = new Map();
const mediaHold = document.body.appendChild(Object.assign(document.createElement('div'), { ariaHidden: 'true' }));
mediaHold.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:.01;pointer-events:none;z-index:-1';
// Pieces of one clip that play back to back (a split) share one media element, so a cut plays through
// without restarting the decoder (WebKit takes ~0.6 s to start a paused video).
const chainKeys = new Map();
function chainKey(it) {
  let k = chainKeys.get(it);
  if (k) return k;
  const sp = num(it.speed, 1), eps = 1e-4;
  const prev = P.items.find(p => p !== it && p.track === it.track && p.media === it.media && num(p.speed, 1) === sp &&
    Math.abs(p.start + p.dur - it.start) < eps && Math.abs(num(p.in, 0) + p.dur * sp - num(it.in, 0)) < eps);
  chainKeys.set(it, k = prev ? chainKey(prev) : it.id);
  return k;
}
function elFor(it) {
  const m = media(it), url = urlOf(m), key = chainKey(it);
  let el = els.get(key);
  if (el && el.dataset.src === url) return el;
  el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
  el.preload = 'auto';
  el.crossOrigin = 'anonymous'; // untainted frames for WebGL grading

  el.playsInline = true;
  el.dataset.src = url;
  el.src = url;
  el.addEventListener('seeked', () => (needsDraw = true));
  el.addEventListener('loadeddata', () => (needsDraw = true));
  // WebKit only feeds fresh frames to drawImage from a <video> that is in the document.
  if (m.kind !== 'audio') mediaHold.appendChild(el);
  els.set(key, el);
  return el;
}
function imgFor(m) {
  const url = urlOf(m);
  let im = imgs.get(url);
  if (!im) { im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => (needsDraw = true); im.src = url; imgs.set(url, im); }
  return im;
}
function gcEls() {
  for (const [id, el] of els) if (!item(id)) { el.pause(); el.removeAttribute('src'); el.load(); el.remove(); els.delete(id); }
}
function syncMedia() {
  // One controller per element: the active piece, else the next one coming up.
  const ctl = new Map();
  for (const it of P.items) {
    const m = media(it);
    if (!m || m.kind === 'image') continue;
    const k = chainKey(it), c = ctl.get(k);
    if (!c || (!active(c, t) && (active(it, t) || (it.start > t && (c.start <= t || it.start < c.start))))) ctl.set(k, it);
  }
  for (const it of ctl.values()) {
    const el = elFor(it), sp = num(it.speed, 1), on = active(it, t);
    const want = num(it.in, 0) + (t - it.start) * sp;
    // Warm-up: just before a cut, run the next clip muted at a crawl from its in-point, so the decoder is
    // already going when the cut arrives (WebKit needs ~0.6 s to start a paused video).
    const warm = !on && playing && it.start > t && it.start - t < 0.8;
    const rate = warm ? 0.0625 : sp, mute = !!it.muted || !on;
    if (el.playbackRate !== rate) el.playbackRate = rate;
    if (el.muted !== mute) el.muted = mute;
    const vol = clamp(num(it.volume, 1) * S.fadeAlpha(it, t - it.start), 0, 1);
    if (Math.abs(el.volume - vol) > 0.005) el.volume = vol;
    if (on && playing) {
      if (el.paused) { if (Math.abs(el.currentTime - want) > 0.15) el.currentTime = want; el.play().catch(() => {}); }
      else if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
    } else if (warm) {
      if (el.paused) { if (!el.seeking && Math.abs(el.currentTime - num(it.in, 0)) > 0.05) el.currentTime = num(it.in, 0); el.play().catch(() => {}); }
    } else {
      if (!el.paused) el.pause();
      if (on && !el.seeking && Math.abs(el.currentTime - want) > 0.5 / P.fps) el.currentTime = want;
      // Preroll: park the next clip on its first frame so the cut starts without a seek.
      else if (!on && playing && it.start > t && it.start - t < 1.5 && !el.seeking && Math.abs(el.currentTime - num(it.in, 0)) > 0.05) el.currentTime = num(it.in, 0);
    }
  }
}

/* ---------- drawing (shared by preview and export raster) ---------- */
// Color grade on the GPU: per-channel slope/intercept, then SVG-style saturate matrix.
// Same math as lutrgb + hue=s in the export. (WebKit has no canvas ctx.filter, so no CSS/SVG filters.)
const GL = (() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 uv; uniform sampler2D tex; uniform vec4 rect;
    uniform vec3 slope; uniform vec3 icpt; uniform float sat;
    void main(){ vec4 c = texture2D(tex, rect.xy + uv * rect.zw); vec3 v = clamp(c.rgb * slope + icpt, 0., 1.);
      mat3 m = mat3(.213 + .787 * sat, .213 - .213 * sat, .213 - .213 * sat, .715 - .715 * sat, .715 + .285 * sat, .715 - .715 * sat, .072 - .072 * sat, .072 - .072 * sat, .072 + .928 * sat);
      gl_FragColor = vec4(clamp(m * v, 0., 1.), c.a); }`));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const U = n => gl.getUniformLocation(prog, n);
  const u = { rect: U('rect'), slope: U('slope'), icpt: U('icpt'), sat: U('sat') };
  // Draws src rect (sx,sy,sw,sh of a WxH source) graded into ctx at (dx,dy,dw,dh).
  return (ctx, src, W, H, sx, sy, sw, sh, dx, dy, dw, dh, g) => {
    const ow = Math.max(1, Math.round(Math.min(dw, 2048))), oh = Math.max(1, Math.round(Math.min(dh, 2048)));
    if (c.width !== ow || c.height !== oh) { c.width = ow; c.height = oh; }
    gl.viewport(0, 0, ow, oh);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform4f(u.rect, sx / W, sy / H, sw / W, sh / H);
    gl.uniform3f(u.slope, g.ch[0].slope, g.ch[1].slope, g.ch[2].slope);
    gl.uniform3f(u.icpt, g.ch[0].intercept, g.ch[1].intercept, g.ch[2].intercept);
    gl.uniform1f(u.sat, g.s);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.drawImage(c, dx, dy, dw, dh);
  };
})();

// drawImage with the item's grade applied.
function drawGraded(ctx, it, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  const g = S.grade(it);
  if (g.identity || !GL) return ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  const W = src.videoWidth || src.naturalWidth || src.width, H = src.videoHeight || src.naturalHeight || src.height;
  try { GL(ctx, src, W, H, sx, sy, sw, sh, dx, dy, dw, dh, g); }
  catch (e) { if (!drawGraded.warned) { drawGraded.warned = true; inv('dev_log', { msg: 'grade failed: ' + e }); } ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh); }
}

function drawVisual(ctx, time) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, P.w, P.h);
  for (const tid of renderOrder(P, 'video')) {
    for (const it of P.items) {
      if (it.track !== tid || isText(it) || !active(it, time)) continue;
      const m = media(it);
      if (m.kind === 'audio') continue;
      const src = m.kind === 'image' ? imgFor(m) : elFor(it);
      if (m.kind === 'image' ? !src.complete || !src.naturalWidth : src.readyState < 2) continue;
      const L = S.layout(it, m, P.w, P.h), C = S.srcCrop(it, m);
      const k = (src.videoWidth || src.naturalWidth || m.w) / m.w, u = C.w / L.sw, v = C.h / L.sh;
      ctx.save();
      ctx.globalAlpha = S.fadeAlpha(it, time - it.start) * num(it.opacity, 1);
      if (it.flipH || it.flipV) {
        ctx.translate(L.ox + L.cw / 2, L.oy + L.ch / 2);
        ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
        ctx.translate(-(L.ox + L.cw / 2), -(L.oy + L.ch / 2));
      }
      drawGraded(ctx, it, src, (C.x + L.cx * u) * k, (C.y + L.cy * v) * k, L.cw * u * k, L.ch * v * k, L.ox, L.oy, L.cw, L.ch);
      ctx.restore();
    }
  }
}

const TEXT_STYLES = [
  { id: 'plain', s: { color: '#ffffff', strokeW: 0, bgOn: false } },
  { id: 'outline', s: { color: '#ffffff', stroke: '#000000', strokeW: 7, bgOn: false } },
  { id: 'box', s: { color: '#ffffff', strokeW: 0, bgOn: true, bg: '#000000' } },
  { id: 'accent', s: { color: '#04201e', strokeW: 0, bgOn: true, bg: ACCENT } },
  { id: 'yellow', s: { color: '#ffffff', stroke: '#000000', strokeW: 6, bgOn: false, hl: '#ffd400' } },
  { id: 'serif', s: { font: 'Georgia', weight: 400, color: '#ffffff', strokeW: 0, bgOn: false } },
];
function textDefaults(caption) {
  return { font: 'Cairo', size: caption ? 78 : 110, weight: 800, color: '#ffffff', stroke: '#000000', strokeW: caption ? 6 : 0, bg: '#000000', bgOn: false, hl: ACCENT };
}

function textState(it, lt) {
  const st = it.style, A = it.anim || 'none';
  const p = clamp(lt / IN_T, 0, 1), e = 1 - Math.pow(1 - p, 3);
  let alpha = 1, dy = 0, sc = 1, chars = Infinity, anim = false;
  if (A === 'fade') { alpha = e; anim = p < 1; }
  else if (A === 'slide') { alpha = e; dy = (1 - e) * st.size * 0.8; anim = p < 1; }
  else if (A === 'pop') {
    const c1 = 1.70158, c3 = c1 + 1, back = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    sc = 0.6 + 0.4 * back; alpha = Math.min(1, p * 3); anim = p < 1;
  } else if (A === 'type') { chars = Math.floor(lt * 22); anim = chars < it.text.length; }
  if (it.out === 'fade') { const q = clamp((it.dur - lt) / OUT_T, 0, 1); alpha *= q; if (q < 1) anim = true; }
  let word = -1;
  if (it.words) for (let i = 0; i < it.words.length; i++) if (it.words[i].s <= lt) word = i;
  return { alpha, dy, sc, chars, anim, word };
}

// pr: project (P, or a scaled copy for export) — sizes come from it.
function drawTextItem(ctx, pr, it, lt) {
  const st = it.style, s = textState(it, lt);
  const tokens = it.text.split(/\s+/).filter(Boolean);
  if (s.alpha <= 0 || !tokens.length) return;
  const rtl = /[֐-ࣿ]/.test(it.text);
  ctx.save();
  ctx.font = `${st.weight} ${st.size}px "${st.font}"`;
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const space = ctx.measureText(' ').width, maxW = pr.w * 0.86;
  const widths = tokens.map(tk => ctx.measureText(tk).width);
  const lines = [];
  let cur = [], w = 0;
  tokens.forEach((tk, i) => {
    if (cur.length && w + space + widths[i] > maxW) { lines.push({ idx: cur, w }); cur = []; w = 0; }
    w += (cur.length ? space : 0) + widths[i];
    cur.push(i);
  });
  if (cur.length) lines.push({ idx: cur, w });
  let shown = tokens;
  if (s.chars < Infinity) {
    let left = s.chars;
    shown = tokens.map(tk => { const v = tk.slice(0, Math.max(0, left)); left -= tk.length + 1; return v; });
  }
  const lh = st.size * 1.3, cx = num(it.x, 0.5) * pr.w, cy = num(it.y, 0.5) * pr.h + s.dy;
  const top = cy - (lines.length * lh) / 2 + lh / 2;
  ctx.translate(cx, cy); ctx.scale(s.sc, s.sc); ctx.translate(-cx, -cy);
  ctx.globalAlpha = s.alpha;
  const hlOK = it.words && it.words.length === tokens.length;
  lines.forEach((ln, li) => {
    const y = top + li * lh;
    if (st.bgOn) {
      const px = st.size * 0.35;
      ctx.fillStyle = st.bg;
      ctx.beginPath();
      ctx.roundRect(cx - ln.w / 2 - px, y - lh / 2, ln.w + px * 2, lh, st.size * 0.22);
      ctx.fill();
    }
    let x = rtl ? cx + ln.w / 2 : cx - ln.w / 2;
    for (const i of ln.idx) {
      const txt = shown[i];
      if (txt) {
        if (st.strokeW > 0) { ctx.lineWidth = st.strokeW * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = st.stroke; ctx.strokeText(txt, x, y); }
        ctx.fillStyle = hlOK && i === s.word ? st.hl : st.color;
        ctx.fillText(txt, x, y);
      }
      x += (rtl ? -1 : 1) * (widths[i] + space);
    }
  });
  ctx.restore();
}

function visibleTexts(pr, time) {
  const out = [];
  for (const tid of renderOrder(pr, 'text')) for (const it of pr.items) if (it.track === tid && isText(it) && active(it, time)) out.push(it);
  return out;
}

const view = $('#view'), vctx = view.getContext('2d');
function draw() {
  if (view.width !== P.w || view.height !== P.h) { view.width = P.w; view.height = P.h; fitView(); }
  drawVisual(vctx, t);
  for (const it of visibleTexts(P, t)) drawTextItem(vctx, P, it, t - it.start);
}
function fitView() {
  const st = $('#stage'), aw = st.clientWidth - 28, ah = st.clientHeight - 28;
  const k = Math.max(0.01, Math.min(aw / P.w, ah / P.h));
  view.style.width = Math.floor(P.w * k) + 'px';
  view.style.height = Math.floor(P.h * k) + 'px';
}
new ResizeObserver(fitView).observe($('#stage'));

/* ---------- transport ---------- */
function loop(now) {
  chainKeys.clear();
  if (playing) {
    // The playing clip is the clock (no seeks fighting the decoder); wall time only if it stalls > 0.8 s.
    const tc = clockTime();
    if (tc !== null && tc !== clock.tc) { clock.tc = tc; clock.at = now; }
    t = tc !== null && now - clock.at < 800 ? Math.max(t, tc) : t + (now - lastTick) / 1000;
    if (t >= total()) { t = total(); setPlaying(false); }
    needsDraw = true;
    follow();
  }
  lastTick = now;
  syncMedia();
  if (needsDraw) { needsDraw = false; draw(); updatePlayhead(); }
  requestAnimationFrame(loop);
}
const clock = { tc: null, at: 0 };
function clockTime() {
  let best = null;
  for (const it of P.items) {
    const m = media(it), el = els.get(chainKey(it));
    if (!m || m.kind === 'image' || !el || el.paused || el.ended || el.seeking || el.readyState < 3 || !active(it, t)) continue;
    if (best && best.it.track === 'v1') continue;
    best = { it, el };
  }
  return best && best.it.start + (best.el.currentTime - num(best.it.in, 0)) / num(best.it.speed, 1);
}
function setPlaying(v) {
  playing = v && total() > 0;
  if (playing && t >= total() - 0.01) t = 0;
  const b = $('#bPlay');
  b.dataset.i = playing ? 'pause' : 'play';
  b.innerHTML = icon(b.dataset.i);
  if (!playing) for (const el of els.values()) el.pause();
}
function seek(v) { t = clamp(v, 0, Math.max(total(), 0)); needsDraw = true; }
function updatePlayhead() {
  $('#ph').style.left = t * pps + 'px';
  $('#tc').textContent = fmt(t);
}
function follow() {
  const sc = $('#scroll'), x = t * pps;
  if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = x - 60;
}

/* ---------- timeline ---------- */
const TRACK_COLOR = { video: 'rgb(62,132,255)', audio: 'rgb(74,210,110)', text: 'rgb(168,112,255)' };
function clipLabel(it) {
  if (isText(it)) return icon('type') + esc(it.text);
  const m = media(it);
  return icon(m.kind === 'audio' ? 'music' : m.kind === 'image' ? 'image' : 'film') + esc(m.name) + (num(it.speed, 1) !== 1 ? `  ×${num(it.speed, 1)}` : '');
}
function renderTimeline() {
  const width = (Math.max(total(), t) + 30) * pps;
  $('#rows').style.width = $('#ruler').style.width = width + 'px';
  $('#heads').innerHTML = P.tracks.map(x => `<div class="head"><i style="background:${TRACK_COLOR[x.kind]}"></i>${esc(tr('tr_' + x.id))}</div>`).join('');
  $('#rows').innerHTML = P.tracks.map(x => `<div class="row${x.id === 'v1' ? ' main' : ''}" data-track="${x.id}">${
    P.items.filter(i => i.track === x.id).map(it => `<div class="clip k-${kindOf(it)}${it.id === sel ? ' sel' : ''}" data-id="${it.id}" style="left:${it.start * pps}px;width:${Math.max(4, it.dur * pps)}px"><div class="h l"></div><span>${clipLabel(it)}</span><div class="h r"></div></div>`).join('')
  }</div>`).join('');
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find(s => s * pps >= 70) || 300;
  let ticks = '';
  for (let s = 0; s * pps < width; s += step) ticks += `<div class="tick" style="left:${s * pps}px">${fmt(s).replace(/:00$/, '')}</div>`;
  ticks += (P.markers || []).map((m, i) => `<div class="mk" data-mk="${i}" style="left:${m * pps}px"></div>`).join('');
  $('#ruler').innerHTML = ticks;
  $('#tdur').textContent = fmt(total());
  $('#tl').classList.toggle('blade', tool === 'blade');
  updatePlayhead();
}

function compatible(it, trackId) {
  const x = P.tracks.find(q => q.id === trackId);
  if (!x) return false;
  if (isText(it)) return x.kind === 'text';
  const k = media(it).kind;
  return k === 'audio' ? x.kind === 'audio' : k === 'image' ? x.kind === 'video' : x.kind !== 'text';
}
function trackAt(clientY) {
  const r = $('#rows').getBoundingClientRect(), i = Math.floor((clientY - r.top) / ROW);
  return P.tracks[i] && P.tracks[i].id;
}
const timeAt = clientX => { const sc = $('#scroll'); return (clientX - sc.getBoundingClientRect().left + sc.scrollLeft) / pps; };
function snapPoints(exceptId) {
  const pts = [0, t, ...(P.markers || [])];
  for (const i of P.items) if (i.id !== exceptId) pts.push(i.start, i.start + i.dur);
  return pts;
}
function snap1(v, pts) {
  if (!snapOn) return v;
  const th = 8 / pps;
  let best = v, d = th;
  for (const p of pts) if (Math.abs(p - v) < d) { d = Math.abs(p - v); best = p; }
  return best;
}
function sourceBound(it) {
  const m = media(it);
  return m && m.kind !== 'image' && m.dur ? m : null;
}
// Magnetic main track: clips on v1 sit end to end from 0, in start order.
function pack() {
  if (!magnet) return;
  let at = 0;
  for (const it of P.items.filter(i => i.track === 'v1').sort((a, b) => a.start - b.start)) { it.start = at; at += it.dur; }
}

$('#rows').addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const c = e.target.closest('.clip');
  if (!c) { select(null); scrubFrom(e); return; }
  const it = item(c.dataset.id);
  if (tool === 'blade') { seek(snap1(timeAt(e.clientX), snapPoints(null))); select(it.id); splitAt(); return; }
  select(it.id);
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const x0 = e.clientX, o = JSON.parse(JSON.stringify(it)), pts = snapPoints(it.id);
  const sp = num(o.speed, 1), m = sourceBound(it);
  let changed = false;
  const onMove = ev => {
    const d = (ev.clientX - x0) / pps;
    if (!changed) { if (Math.abs(ev.clientX - x0) < 3) return; snapshot(); changed = true; }
    if (mode === 'move') {
      let s = Math.max(0, o.start + d);
      const a = snap1(s, pts), b = snap1(s + o.dur, pts) - o.dur;
      s = Math.abs(a - s) <= Math.abs(b - s) ? a : b;
      it.start = Math.max(0, s);
      const x = trackAt(ev.clientY);
      if (x && compatible(it, x)) it.track = x;
    } else if (mode === 'l') {
      const min = m ? Math.max(0, o.start - num(o.in, 0) / sp) : 0;
      const s = clamp(snap1(o.start + d, pts), min, o.start + o.dur - 1 / P.fps), shift = s - o.start;
      it.start = s;
      it.dur = o.dur - shift;
      if (m) it.in = num(o.in, 0) + shift * sp;
      if (o.words) it.words = o.words.map(w => ({ ...w, s: w.s - shift, e: w.e - shift }));
    } else {
      const max = m ? o.start + (m.dur - num(o.in, 0)) / sp : Infinity;
      it.dur = clamp(snap1(o.start + o.dur + d, pts), o.start + 1 / P.fps, max) - o.start;
    }
    renderTimeline();
    needsDraw = true;
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    if (changed) refresh();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
});
$('#rows').addEventListener('pointermove', e => {
  let bl = $('.bladeline');
  if (tool !== 'blade' || !e.target.closest('.clip')) { if (bl) bl.remove(); return; }
  if (!bl) { bl = document.createElement('div'); bl.className = 'bladeline'; $('#scroll').appendChild(bl); }
  bl.style.left = timeAt(e.clientX) * pps + 'px';
});

function scrubFrom(e) {
  const at = ev => seek(timeAt(ev.clientX));
  at(e);
  const mv = ev => at(ev);
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
}
$('#ruler').addEventListener('pointerdown', e => {
  const mk = e.target.closest('.mk');
  if (mk) { seek(P.markers[+mk.dataset.mk]); return; }
  scrubFrom(e);
});
$('#ruler').addEventListener('dblclick', e => {
  const mk = e.target.closest('.mk');
  if (!mk) return;
  snapshot();
  P.markers.splice(+mk.dataset.mk, 1);
  refresh();
});

function setZoom(v) { pps = clamp(v, 8, 400); $('#zoom').value = pps; renderTimeline(); }
$('#zoom').addEventListener('input', e => setZoom(+e.target.value));
$('#scroll').addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(pps * (e.deltaY < 0 ? 1.15 : 0.87));
}, { passive: false });

/* ---------- edits ---------- */
function select(id) {
  if (sel === id) return;
  sel = id;
  $$('.clip.sel').forEach(c => c.classList.remove('sel'));
  if (id) { const c = document.querySelector(`.clip[data-id="${id}"]`); if (c) c.classList.add('sel'); }
  inspTab = null;
  inspector();
}

function addMedia(mid, trackId, start) {
  const m = P.media[mid];
  const probe = { media: mid };
  if (!trackId || !compatible(probe, trackId)) trackId = m.kind === 'audio' ? 'a1' : 'v1';
  if (start == null) start = P.items.filter(i => i.track === trackId).reduce((a, i) => Math.max(a, i.start + i.dur), 0);
  snapshot();
  const it = { id: uid(), track: trackId, media: mid, start, dur: m.kind === 'image' ? 5 : m.dur, in: 0, speed: 1, volume: 1 };
  if (m.kind !== 'audio') Object.assign(it, { fit: 'cover', scale: 1, x: 0, y: 0, opacity: 1, preset: 'none', brightness: 1, contrast: 1, saturation: 1, temp: 0 });
  P.items.push(it);
  sel = it.id;
  inspTab = null;
  refresh();
  return it;
}

function addText(styleId) {
  snapshot();
  const st = { ...textDefaults(false), ...((TEXT_STYLES.find(s => s.id === styleId) || {}).s || {}) };
  const it = { id: uid(), type: 'text', track: 't1', start: t, dur: 3, text: tr('defaultText'), style: st, x: 0.5, y: 0.5, anim: 'pop', out: 'fade' };
  P.items.push(it);
  sel = it.id;
  inspTab = null;
  refresh();
}

function targetsAtPlayhead() {
  const s = sel && item(sel);
  return s && active(s, t) ? [s] : P.items.filter(i => active(i, t));
}
function splitAt() {
  const min = 1 / P.fps;
  const ok = targetsAtPlayhead().filter(it => t - it.start > min && it.start + it.dur - t > min);
  if (!ok.length) return toast(tr('cutHint'));
  snapshot();
  for (const it of ok) {
    const cut = t - it.start, b = JSON.parse(JSON.stringify(it));
    b.id = uid(); b.start = t; b.dur = it.dur - cut; b.fadeIn = 0;
    it.dur = cut; it.fadeOut = 0;
    if (sourceBound(it)) b.in = num(it.in, 0) + cut * num(it.speed, 1);
    if (it.words) {
      const w = it.words;
      it.words = w.filter(x => x.s < cut);
      b.words = w.filter(x => x.s >= cut).map(x => ({ ...x, s: x.s - cut, e: x.e - cut }));
      it.text = it.words.map(x => x.w).join(' ');
      b.text = b.words.map(x => x.w).join(' ');
    }
    P.items.push(b);
  }
  refresh();
}
// Q / W: drop the part of the clip before / after the playhead.
function trimTo(side) {
  const min = 1 / P.fps;
  const ok = targetsAtPlayhead().filter(it => t - it.start > min && it.start + it.dur - t > min);
  if (!ok.length) return toast(tr('cutHint'));
  snapshot();
  for (const it of ok) {
    const cut = t - it.start;
    if (side === 'right') { it.dur = cut; continue; }
    if (sourceBound(it)) it.in = num(it.in, 0) + cut * num(it.speed, 1);
    if (it.words) it.words = it.words.filter(x => x.s >= cut).map(x => ({ ...x, s: x.s - cut, e: x.e - cut }));
    it.start = t;
    it.dur -= cut;
  }
  if (side === 'left' && magnet && ok.some(i => i.track === 'v1')) { pack(); const s = item(sel); if (s) seek(s.start); }
  refresh();
}
function removeSel() {
  if (!sel) return;
  snapshot();
  P.items = P.items.filter(i => i.id !== sel);
  sel = null;
  refresh();
}
function duplicateSel() {
  const it = sel && item(sel);
  if (!it) return;
  snapshot();
  const b = JSON.parse(JSON.stringify(it));
  b.id = uid();
  b.start = it.start + it.dur - (it.track === 'v1' && magnet ? 0.0001 : 0);
  P.items.push(b);
  sel = b.id;
  refresh();
}
function addMarker() {
  snapshot();
  P.markers = [...(P.markers || []).filter(m => Math.abs(m - t) > 1e-3), t].sort((a, b) => a - b);
  refresh();
}
function mirrorSel() {
  const it = sel && item(sel);
  if (!it || isText(it) || media(it).kind === 'audio') return;
  snapshot();
  it.flipH = !it.flipH;
  refresh();
}

function refresh() {
  pack();
  renderTimeline();
  inspector();
  gcEls();
  needsDraw = true;
  const name = projectPath ? projectPath.split(/[\\/]/).pop().replace(/\.kadr$/, '') : tr('untitled');
  $('#pname').textContent = name + (dirty ? ' •' : '');
  $('#bUndo').disabled = !undoStack.length;
  $('#bRedo').disabled = !redoStack.length;
}

/* ---------- inspector ---------- */
const getPath = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
function setPath(o, k, v) { const ks = k.split('.'); const last = ks.pop(); ks.reduce((a, x) => (a[x] ??= {}), o)[last] = v; }
const showVal = (k, v) => k === 'speed' ? '×' + (+v).toFixed(2) : /volume|opacity|crop\./.test(k) ? Math.round(v * 100) + '%' : /size|strokeW/.test(k) ? String(v | 0) : (+v).toFixed(2);

const fld = {
  range: (k, label, min, max, step, it, d = 0) =>
    `<div class="f"><div class="lb"><span>${tr(label)}</span><b data-show="${k}">${showVal(k, num(getPath(it, k), d))}</b></div><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${num(getPath(it, k), d)}"></div>`,
  number: (k, label, step, it) =>
    `<div class="f"><div class="lb"><span>${tr(label)}</span></div><input type="number" data-k="${k}" step="${step}" value="${+num(getPath(it, k), 0).toFixed(3)}"></div>`,
  select: (k, label, opts, it) =>
    `<div class="f"><div class="lb"><span>${tr(label)}</span></div><select data-k="${k}">${opts.map(([v, n]) => `<option value="${esc(v)}"${String(getPath(it, k)) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`,
  color: (k, label, it) => `<label>${tr(label)}<input type="color" data-k="${k}" value="${esc(getPath(it, k))}"></label>`,
  check: (k, label, it) => `<label><input type="checkbox" data-k="${k}"${getPath(it, k) ? ' checked' : ''}>${tr(label)}</label>`,
};
const grp = (title, body) => `<div class="grp"><div class="gh">${tr(title)}</div>${body}</div>`;

function inspTabsFor(it) {
  if (!it) return [];
  if (isText(it)) return ['tText', 'tAnim'];
  const k = media(it).kind;
  return k === 'audio' ? ['tAudio', 'tSpeed'] : k === 'image' ? ['tVideo', 'tAnim', 'tAdjust'] : ['tVideo', 'tAudio', 'tSpeed', 'tAnim', 'tAdjust'];
}

function inspector() {
  const body = $('#inspBody'), it = sel && item(sel), tabs = inspTabsFor(it);
  if (!tabs.includes(inspTab)) inspTab = tabs[0] || null;
  $('#inspTabs').innerHTML = tabs.map(x => `<button data-itab="${x}" class="${x === inspTab ? 'on' : ''}">${tr(x)}</button>`).join('');
  $('#inspTabs').hidden = !tabs.length;
  if (!it) {
    const k = (a, b) => `<div><kbd>${a}</kbd> ${tr(b)}</div>`;
    body.innerHTML = `<p class="hint">${tr('nothingSel')}</p><div class="keys"><h4>${tr('shortcuts')}</h4>
      ${k('Space', 'k_play')}${k('S', 'k_split')}${k('Q / W', 'k_q')}${k('Delete', 'k_del')}${k('⌘D', 'k_dup')}
      ${k('⌘Z / ⇧⌘Z', 'k_undo')}${k('← → / ⇧', 'k_frame')}${k('V / B', 'k_tool')}${k('M', 'k_marker')}</div>`;
    return;
  }
  const h = [];
  const timing = `<div class="row2">${fld.number('start', 'start', 0.01, it)}${fld.number('dur', 'dur', 0.01, it)}</div>`;
  const fades = `<div class="row2">${fld.range('fadeIn', 'fadeIn', 0, 2, 0.05, it)}${fld.range('fadeOut', 'fadeOut', 0, 2, 0.05, it)}</div>`;
  if (inspTab === 'tText') {
    h.push(`<div class="f"><textarea data-k="text" dir="auto">${esc(it.text)}</textarea></div>`, timing);
    h.push(grp('font', fld.select('style.font', 'font', FONTS.map(f => [f, f]), it) +
      `<div class="row2">${fld.range('style.size', 'size', 20, 260, 1, it)}${fld.select('style.weight', 'weight', [400, 600, 800, 900].map(w => [w, tr('w' + w)]), it)}</div>` +
      `<div class="inl">${fld.color('style.color', 'color', it)}${it.words ? fld.color('style.hl', 'hl', it) : ''}</div>`));
    h.push(grp('stroke', fld.range('style.strokeW', 'stroke', 0, 20, 1, it) + `<div class="inl">${fld.color('style.stroke', 'strokeColor', it)}</div>`));
    h.push(grp('bg', `<div class="inl">${fld.check('style.bgOn', 'bg', it)}${fld.color('style.bg', 'color', it)}</div>`));
    h.push(grp('horiz', fld.range('x', 'horiz', 0, 1, 0.01, it, 0.5) + fld.range('y', 'vert', 0, 1, 0.01, it, 0.5)));
    if (it.track === 'c1') h.push(`<button class="wide" id="capAll">${tr('applyAllCaps')}</button>`);
  } else if (inspTab === 'tAnim') {
    if (isText(it)) {
      h.push(fld.select('anim', 'animIn', ['none', 'fade', 'slide', 'pop', 'type'].map(a => [a, tr('a_' + a)]), it));
      h.push(fld.select('out', 'animOut', [['none', tr('a_none')], ['fade', tr('o_fade')]], it));
    } else h.push(fades);
  } else if (inspTab === 'tVideo') {
    h.push(`<div class="f hint" style="direction:ltr;text-align:start">${esc(media(it).name)}</div>`, timing);
    h.push(grp('scale', fld.select('fit', 'fit_', [['cover', tr('cover')], ['contain', tr('contain')]], it) +
      fld.range('scale', 'scale', 0.1, 3, 0.01, it, 1) +
      `<div class="row2">${fld.number('x', 'posX', 1, it)}${fld.number('y', 'posY', 1, it)}</div>` +
      fld.range('opacity', 'opacity', 0, 1, 0.01, it, 1) +
      `<div class="inl">${fld.check('flipH', 'flipH', it)}${fld.check('flipV', 'flipV', it)}</div>`));
    h.push(`<div id="cropGrp">${grp('cropSec', `<div class="row2">${fld.range('crop.l', 'cropL', 0, 0.45, 0.01, it)}${fld.range('crop.r', 'cropR', 0, 0.45, 0.01, it)}</div>` +
      `<div class="row2">${fld.range('crop.t', 'cropT', 0, 0.45, 0.01, it)}${fld.range('crop.b', 'cropB', 0, 0.45, 0.01, it)}</div>`)}</div>`);
  } else if (inspTab === 'tAudio') {
    if (media(it).kind === 'audio') h.push(`<div class="f hint" style="direction:ltr;text-align:start">${esc(media(it).name)}</div>`, timing);
    h.push(fld.range('volume', 'volume', 0, 2, 0.01, it, 1), `<div class="inl">${fld.check('muted', 'mute', it)}</div>`);
    if (media(it).kind === 'audio') h.push(fades);
  } else if (inspTab === 'tSpeed') {
    h.push(fld.range('speed', 'speed', 0.25, 4, 0.05, it, 1));
  } else if (inspTab === 'tAdjust') {
    h.push(fld.select('preset', 'filter', Object.keys(S.PRESETS).map(p => [p, tr('p_' + p)]), it));
    h.push(fld.range('brightness', 'brightness', 0.5, 1.5, 0.01, it, 1), fld.range('contrast', 'contrast', 0.5, 1.5, 0.01, it, 1));
    h.push(fld.range('saturation', 'saturation', 0, 2, 0.01, it, 1), fld.range('temp', 'temp', -1, 1, 0.01, it));
    h.push(`<button class="wide" id="colReset" data-i="rotate-ccw"><span>${tr('resetColor')}</span></button>`);
  }
  body.innerHTML = h.join('');
  paintIcons(body);
  const ca = $('#capAll');
  if (ca) ca.onclick = () => {
    snapshot();
    for (const c of P.items) if (c.track === 'c1' && isText(c)) { c.style = { ...it.style }; c.anim = it.anim; c.out = it.out; c.x = it.x; c.y = it.y; }
    refresh();
  };
  const cr = $('#colReset');
  if (cr) cr.onclick = () => { snapshot(); Object.assign(it, { preset: 'none', brightness: 1, contrast: 1, saturation: 1, temp: 0 }); refresh(); };
}
$('#inspTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-itab]');
  if (b) { inspTab = b.dataset.itab; inspector(); }
});

let editing = false;
$('#inspBody').addEventListener('input', e => {
  const k = e.target.dataset.k, it = sel && item(sel);
  if (!k || !it) return;
  let v = e.target.type === 'checkbox' ? e.target.checked
    : (e.target.type === 'range' || e.target.type === 'number') ? +e.target.value : e.target.value;
  if (typeof v === 'number' && !isFinite(v)) return;
  if (k === 'style.weight') v = +v;
  if (!editing) { snapshot(); editing = true; }
  const m = sourceBound(it);
  if (k === 'speed') {
    v = clamp(v, 0.25, 4);
    it.dur = it.dur * num(it.speed, 1) / v; // keep the same source range
    it.speed = v;
  } else if (k === 'dur') {
    const max = m ? (m.dur - num(it.in, 0)) / num(it.speed, 1) : Infinity;
    it.dur = clamp(v, 1 / P.fps, max);
  } else if (k === 'start') {
    it.start = Math.max(0, v);
  } else {
    setPath(it, k, v); // caption text with a new word count simply loses the highlight (see drawTextItem)
  }
  const show = document.querySelector(`[data-show="${k}"]`);
  if (show && e.target.type === 'range') show.textContent = showVal(k, v);
  dirty = true;
  if (/^(start|dur|speed)$/.test(k)) { pack(); }
  renderTimeline();
  needsDraw = true;
});
$('#inspBody').addEventListener('change', e => {
  editing = false;
  if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'number') inspector();
});

/* ---------- preview dragging ---------- */
view.addEventListener('pointerdown', e => {
  const it = sel && item(sel);
  if (!it || !active(it, t) || (media(it) && media(it).kind === 'audio')) return;
  const r = view.getBoundingClientRect(), k = P.w / r.width, x0 = e.clientX, y0 = e.clientY;
  const ox = num(it.x, isText(it) ? 0.5 : 0), oy = num(it.y, isText(it) ? 0.5 : 0);
  let changed = false;
  const mv = ev => {
    const dx = (ev.clientX - x0) * k, dy = (ev.clientY - y0) * k;
    if (!changed) { snapshot(); changed = true; }
    if (isText(it)) { it.x = clamp(ox + dx / P.w, 0, 1); it.y = clamp(oy + dy / P.h, 0, 1); }
    else { it.x = Math.round(ox + dx); it.y = Math.round(oy + dy); }
    needsDraw = true;
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (changed) inspector(); }, { once: true });
});

/* ---------- library ---------- */
function setLibTab(tab) {
  libTab = tab;
  $$('#libTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $$('#lib [data-pane]').forEach(p => (p.hidden = p.dataset.pane !== tab));
}
$('#libTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setLibTab(b.dataset.tab); });

function renderBin() {
  $('#binList').innerHTML = Object.entries(P.media).map(([id, m]) => {
    const url = esc(urlOf(m));
    const th = m.kind === 'video' ? `<video src="${url}#t=0.5" muted preload="metadata"></video>`
      : m.kind === 'image' ? `<img src="${url}">` : icon('music');
    return `<div class="mi" data-mid="${id}" title="${esc(m.path)}"><div class="th">${th}<span class="du">${m.dur ? fmt(m.dur) : tr('image')}</span></div><div class="nm">${esc(m.name)}</div></div>`;
  }).join('');
}
// Pointer drag from the bin (HTML5 drag-and-drop is off on Windows while native file drop is on).
$('#binList').addEventListener('pointerdown', e => {
  const mi = e.target.closest('.mi');
  if (!mi || e.button !== 0) return;
  const mid = mi.dataset.mid, x0 = e.clientX, y0 = e.clientY, ghost = $('#ghost');
  let dragging = false;
  const mv = ev => {
    if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    dragging = true;
    ghost.hidden = false;
    ghost.textContent = P.media[mid].name;
    ghost.style.left = ev.clientX + 12 + 'px';
    ghost.style.top = ev.clientY + 12 + 'px';
    $$('.row.over').forEach(r => r.classList.remove('over'));
    const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.row');
    if (row) row.classList.add('over');
  };
  const up = ev => {
    window.removeEventListener('pointermove', mv);
    ghost.hidden = true;
    $$('.row.over').forEach(r => r.classList.remove('over'));
    if (!dragging) return;
    const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.row');
    if (row) addMedia(mid, row.dataset.track, snap1(Math.max(0, timeAt(ev.clientX)), snapPoints(null)));
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
});
$('#binList').addEventListener('dblclick', e => {
  const mi = e.target.closest('.mi');
  if (mi) addMedia(mi.dataset.mid);
});
function addToBin(res) {
  const added = [];
  for (const m of res.ok) {
    const have = Object.entries(P.media).find(([, x]) => x.path === m.path);
    if (have) { added.push(have[0]); continue; }
    const id = uid();
    P.media[id] = m;
    added.push(id);
  }
  if (res.bad.length) toast(tr('unsupported') + ': ' + res.bad.join(' · '));
  dirty = true;
  renderBin();
  return added;
}
async function importMedia() {
  const r = await TA.dialog.open({ multiple: true, filters: [{ name: 'Media', extensions: MEDIA_EXT }] });
  if (!r) return;
  addToBin(await inv('probe', { paths: Array.isArray(r) ? r : [r] }));
}
TA.webviewWindow.getCurrentWebviewWindow().onDragDropEvent(async e => {
  const p = e.payload;
  $('#lib').classList.toggle('drop', p.type === 'enter' || p.type === 'over');
  if (p.type === 'drop' && p.paths.length) {
    setLibTab('media');
    addToBin(await inv('probe', { paths: p.paths }));
  }
});

function cardCanvas(paint) {
  const c = document.createElement('canvas');
  c.width = 240; c.height = 180;
  paint(c.getContext('2d'));
  return c;
}
function sampleScene(ctx) {
  const g = ctx.createLinearGradient(0, 0, 240, 180);
  g.addColorStop(0, '#f6a35c'); g.addColorStop(0.5, '#d9566b'); g.addColorStop(1, '#3a4fa8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 240, 180);
  ctx.fillStyle = '#ffe7a8'; ctx.beginPath(); ctx.arc(170, 60, 26, 0, 7); ctx.fill();
  ctx.fillStyle = '#1f2a44'; ctx.beginPath(); ctx.moveTo(0, 180); ctx.lineTo(80, 100); ctx.lineTo(140, 150); ctx.lineTo(200, 110); ctx.lineTo(240, 140); ctx.lineTo(240, 180); ctx.fill();
}
function renderLibCards() {
  const ts = $('#textStyles');
  ts.innerHTML = '';
  for (const s of TEXT_STYLES) {
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.style = s.id;
    const fake = { text: LANG === 'ar' ? 'كادر' : 'Kadr', style: { ...textDefaults(false), ...s.s, size: 46, strokeW: (s.s.strokeW || 0) * 0.45 }, x: 0.5, y: 0.5, dur: 9 };
    b.appendChild(cardCanvas(ctx => { ctx.fillStyle = '#20262f'; ctx.fillRect(0, 0, 240, 180); drawTextItem(ctx, { w: 240, h: 180 }, fake, 5); }));
    ts.appendChild(b);
  }
  const fc = $('#filterCards');
  fc.innerHTML = '';
  for (const p of Object.keys(S.PRESETS)) {
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.preset = p;
    const scene = cardCanvas(sampleScene);
    b.appendChild(cardCanvas(ctx => drawGraded(ctx, { preset: p }, scene, 0, 0, 240, 180, 0, 0, 240, 180)));
    b.insertAdjacentHTML('beforeend', `<span class="cap">${tr('p_' + p)}</span>`);
    fc.appendChild(b);
  }
}
$('#textStyles').addEventListener('click', e => { const c = e.target.closest('[data-style]'); if (c) addText(c.dataset.style); });
$('#filterCards').addEventListener('click', e => {
  const c = e.target.closest('[data-preset]'), it = sel && item(sel);
  if (!c) return;
  if (!it || isText(it) || media(it).kind === 'audio') return toast(tr('filtersHint'));
  snapshot();
  it.preset = c.dataset.preset;
  inspTab = 'tAdjust';
  refresh();
});

/* ---------- modal / toast ---------- */
function progress(label, p) {
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<div>${esc(label)}${p != null ? ` — ${Math.round(p * 100)}%` : ''}</div><div class="pbar"><i style="width:${Math.round((p || 0) * 100)}%"></i></div><div class="acts"><button id="mCancel">${tr('cancel')}</button></div>`;
  $('#mCancel').onclick = () => { cancelled = true; inv('cancel'); };
}
const hideModal = () => ($('#modal').hidden = true);
TA.event.listen('progress', e => progress(tr('p_' + e.payload.label), e.payload.p));

/* ---------- auto update (GitHub Releases, signed) ---------- */
async function checkUpdate() {
  if (!TA.updater) return;
  let u;
  try { u = await TA.updater.check(); } catch (e) { return inv('dev_log', { msg: 'update check: ' + e }); } // offline or no release yet
  if (!u || !(await TA.dialog.ask(tr('updAsk').replace('{v}', u.version), { title: tr('updTitle') }))) return;
  if (dirty) await save();
  let total = 0, got = 0;
  progress(tr('p_update'), 0);
  try {
    await u.downloadAndInstall(ev => {
      if (ev.event === 'Started') total = ev.data.contentLength || 0;
      else if (ev.event === 'Progress') { got += ev.data.chunkLength; if (total) progress(tr('p_update'), got / total); }
    });
    await TA.process.relaunch();
  } catch (e) { hideModal(); toast(String(e)); }
}
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.run; el.appendChild(b); }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 8000 : 4500);
}

/* ---------- export ---------- */
async function rasterizeTexts(Q, work) {
  const texts = Q.items.filter(isText);
  if (!texts.length) return null;
  await Promise.all([...new Set(texts.map(i => `${i.style.weight} 40px "${i.style.font}"`))].map(f => document.fonts.load(f).catch(() => {})));
  const c = document.createElement('canvas');
  c.width = Q.w; c.height = Q.h;
  const ctx = c.getContext('2d');
  const N = Math.ceil(S.projectDur(Q) * Q.fps), list = [];
  let last = null;
  for (let f = 0; f < N; f++) {
    if (cancelled) throw new Error(tr('cancelled'));
    const time = f / Q.fps, vis = visibleTexts(Q, time);
    const key = vis.map(it => { const s = textState(it, time - it.start); return it.id + (s.anim ? 'a' + f : 'w' + s.word); }).join('|');
    if (key === last) { list[list.length - 1].frames++; continue; }
    last = key;
    ctx.clearRect(0, 0, Q.w, Q.h);
    for (const it of vis) drawTextItem(ctx, Q, it, time - it.start);
    const name = 'f' + String(list.length).padStart(5, '0') + '.png';
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await inv('write_frame', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-id': String(work.id), 'x-name': name } });
    list.push({ name, frames: 1 });
    if (list.length % 8 === 0) progress(tr('p_texts'), f / N);
  }
  return list;
}

const RES = [['720p', 720], ['1080p', 1080], ['2K', 1440], ['4K', 2160]];
function exportDialog() {
  if (!total()) return toast(tr('emptyTl'));
  setPlaying(false);
  const short = Math.min(P.w, P.h);
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<h3>${tr('exportTitle')}</h3>
    <label class="f"><span>${tr('resolution')}</span><select id="xRes">${RES.map(([n, v]) => `<option value="${v}"${v === short ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="f"><span>${tr('fps')}</span><select id="xFps">${[24, 25, 30, 50, 60].map(f => `<option${f === P.fps ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
    <label class="f"><span>${tr('codec')}</span><select id="xCodec"><option value="h264">H.264 (MP4)</option><option value="hevc">HEVC / H.265</option></select></label>
    ${IS_MAC ? `<label class="inl"><input type="checkbox" id="xHw" checked>${tr('hw')}</label>` : ''}
    <div class="acts"><button id="xNo">${tr('cancel')}</button><button class="primary" id="xGo">${tr('exportGo')}</button></div>`;
  $('#xNo').onclick = hideModal;
  $('#xGo').onclick = () => {
    const k = +$('#xRes').value / short, fps = +$('#xFps').value;
    const codec = $('#xCodec').value + ($('#xHw') && $('#xHw').checked ? '_hw' : '');
    hideModal();
    doExport(k, fps, codec);
  };
}
async function doExport(k, fps, codec, preset) {
  const out = preset || await TA.dialog.save({ defaultPath: 'kadr-export.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] });
  if (!out) return;
  cancelled = false;
  let work = null;
  try {
    progress(tr('p_texts'), 0);
    const Q = S.scaleProject(P, k);
    Q.fps = fps;
    work = await inv('work_begin');
    const list = await rasterizeTexts(Q, work);
    const { args, duration } = G.buildArgs(Q, { out, textList: list ? work.path + '/text.ffconcat' : null, codec });
    progress(tr('p_export'), 0);
    await inv('export_run', { id: work.id, args, concat: list ? G.concatText(list, fps) : null, duration });
    work = null;
    hideModal();
    toast(tr('exported') + ': ' + out.split(/[\\/]/).pop(), { label: tr('reveal'), run: () => TA.opener.revealItemInDir(out) });
  } catch (e) {
    hideModal();
    toast(cancelled ? tr('cancelled') : tr('error') + ': ' + cleanErr(e));
  } finally {
    if (work) inv('work_end', { id: work.id });
  }
}

/* ---------- captions ---------- */
async function autoCaptions() {
  const hasAudio = P.items.some(i => { const m = media(i); return m && !i.muted && (m.kind === 'audio' || m.hasAudio); });
  if (!hasAudio) return toast(tr('needAudio'));
  const old = P.items.filter(i => i.track === 'c1');
  if (old.length && !(await TA.dialog.ask(tr('replaceCaps'), { kind: 'warning' }))) return;
  setPlaying(false);
  cancelled = false;
  let work = null;
  try {
    if (!(await inv('model_ready'))) {
      if (!(await TA.dialog.ask(tr('modelAsk'), { title: tr('genCaptions') }))) return;
      progress(tr('p_model'), 0);
      await inv('model_download');
    }
    progress(tr('p_audio'), 0);
    work = await inv('work_begin');
    const { args } = G.buildArgs(P, { out: work.path + '/mix.wav', audioOnly: true });
    const json = await inv('transcribe', { id: work.id, audioArgs: args, lang: $('#capLang').value });
    work = null;
    hideModal();
    const words = S.parseWhisper(JSON.parse(json));
    if (!words.length) return toast(tr('noSpeech'));
    snapshot();
    const style = old.length && isText(old[0]) ? old[0].style : textDefaults(true);
    P.items = P.items.filter(i => i.track !== 'c1');
    const groups = S.groupWords(words);
    groups.forEach((g, i) => {
      const next = groups[i + 1];
      const end = next && next.start - g.end < 0.5 ? next.start : g.end + 0.25;
      P.items.push({
        id: uid(), type: 'text', track: 'c1', start: g.start, dur: Math.max(0.2, end - g.start), text: g.text,
        words: g.words.map(w => ({ w: w.w, s: w.s - g.start, e: w.e - g.start })),
        style: { ...style }, x: 0.5, y: 0.72, anim: 'pop', out: 'none',
      });
    });
    refresh();
    toast(tr('capsDone', { n: groups.length }));
  } catch (e) {
    hideModal();
    const m = cleanErr(e);
    toast(cancelled ? tr('cancelled') : m === 'whisper' ? tr('needWhisper') : tr('error') + ': ' + m);
  } finally {
    if (work) inv('work_end', { id: work.id });
  }
}

/* ---------- voiceover ---------- */
let rec = null;
async function toggleRecord() {
  if (rec) { rec.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast(tr('micDenied')); }
  const mime = ['audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const r = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const chunks = [], at = t;
  r.ondataavailable = e => e.data.size && chunks.push(e.data);
  r.onstop = async () => {
    stream.getTracks().forEach(x => x.stop());
    rec = null;
    $('#bRec').classList.remove('rec');
    setPlaying(false);
    const blob = new Blob(chunks, { type: r.mimeType });
    const ext = r.mimeType.includes('mp4') ? 'm4a' : 'webm';
    try {
      const path = await inv('save_recording', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-ext': ext } });
      const [mid] = addToBin(await inv('probe', { paths: [path] }));
      if (mid) {
        const free = ['a1', 'a2'].find(a => !P.items.some(i => i.track === a && i.start < at + P.media[mid].dur && i.start + i.dur > at)) || 'a2';
        addMedia(mid, free, at);
      }
    } catch (e) { toast(tr('error') + ': ' + cleanErr(e)); }
  };
  r.start();
  rec = r;
  $('#bRec').classList.add('rec');
  toast(tr('recording'));
  setPlaying(true);
}

/* ---------- project ---------- */
function syncSettings() {
  $('#aspect').value = Object.keys(ASPECTS).find(k => ASPECTS[k][0] === P.w && ASPECTS[k][1] === P.h) || '9:16';
  renderBin();
}
async function save(as) {
  let f = as ? null : projectPath;
  if (!f) f = await TA.dialog.save({ defaultPath: (LANG === 'ar' ? 'مشروع' : 'project') + '.kadr', filters: [{ name: 'Kadr', extensions: ['kadr'] }] });
  if (!f) return;
  if (!f.endsWith('.kadr')) f += '.kadr';
  try { await inv('save_project', { path: f, json: JSON.stringify(P) }); } catch (e) { return toast(tr('error') + ': ' + cleanErr(e)); }
  projectPath = f;
  dirty = false;
  refresh();
  toast(tr('saved'));
}
async function open() {
  if (dirty && !(await TA.dialog.ask(tr('unsaved'), { kind: 'warning' }))) return;
  const f = await TA.dialog.open({ filters: [{ name: 'Kadr', extensions: ['kadr'] }] });
  if (!f) return;
  let r;
  try { r = await inv('open_project', { path: f }); } catch (e) { return toast(tr('error') + ': ' + cleanErr(e)); }
  setPlaying(false);
  P = Object.assign(newProject(), r.project);
  projectPath = f;
  sel = null; t = 0; dirty = false;
  undoStack.length = redoStack.length = 0;
  syncSettings();
  refresh();
  if (r.missing.length) toast(tr('missing') + ': ' + r.missing.join(' · '));
}

function setTool(x) {
  tool = x;
  $('#tSelect').classList.toggle('on', x === 'select');
  $('#tBlade').classList.toggle('on', x === 'blade');
  renderTimeline();
}

$('#aspect').onchange = e => { snapshot(); [P.w, P.h] = ASPECTS[e.target.value]; refresh(); };
$('#bImport').onclick = importMedia;
$('#bText').onclick = () => addText('plain');
$('#bCaps').onclick = autoCaptions;
$('#bExport').onclick = exportDialog;
$('#bSave').onclick = e => save(e.shiftKey);
$('#bOpen').onclick = open;
$('#bUndo').onclick = () => restore(undoStack, redoStack);
$('#bRedo').onclick = () => restore(redoStack, undoStack);
$('#bPlay').onclick = () => setPlaying(!playing);
$('#bBack').onclick = () => seek(0);
$('#bFwd').onclick = () => seek(total());
$('#tSelect').onclick = () => setTool('select');
$('#tBlade').onclick = () => setTool('blade');
$('#bSplit').onclick = splitAt;
$('#bDelL').onclick = () => trimTo('left');
$('#bDelR').onclick = () => trimTo('right');
$('#bDel').onclick = removeSel;
$('#bDup').onclick = duplicateSel;
$('#bMarker').onclick = addMarker;
$('#bMirror').onclick = mirrorSel;
$('#bCrop').onclick = () => {
  const it = sel && item(sel);
  if (!it || isText(it) || media(it).kind === 'audio') return;
  inspTab = 'tVideo';
  inspector();
  $('#cropGrp').scrollIntoView({ behavior: 'smooth' });
};
$('#bRec').onclick = toggleRecord;
$('#bMagnet').onclick = () => { magnet = !magnet; $('#bMagnet').classList.toggle('on', magnet); if (magnet) { snapshot(); refresh(); } };
$('#bSnap').onclick = () => { snapOn = !snapOn; $('#bSnap').classList.toggle('on', snapOn); };
$('#bZoomIn').onclick = () => setZoom(pps * 1.4);
$('#bZoomOut').onclick = () => setZoom(pps / 1.4);
$('#bFit').onclick = () => setZoom(($('#scroll').clientWidth - 40) / Math.max(total(), 1));
$('#bLang').onclick = () => { LANG = LANG === 'ar' ? 'en' : 'ar'; applyLang(); renderLibCards(); refresh(); };

window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select') || !$('#modal').hidden) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? restore(redoStack, undoStack) : restore(undoStack, redoStack); }
  else if (mod && k === 's') { e.preventDefault(); save(e.shiftKey); }
  else if (mod && k === 'o') { e.preventDefault(); open(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicateSel(); }
  else if (mod && k === 'e') { e.preventDefault(); exportDialog(); }
  else if (mod && k === 'i') { e.preventDefault(); importMedia(); }
  else if (mod) return;
  else if (k === 's') splitAt();
  else if (k === 'q') trimTo('left');
  else if (k === 'w') trimTo('right');
  else if (k === 'm') addMarker();
  else if (k === 'v') setTool('select');
  else if (k === 'b') setTool('blade');
  else if (k === 'delete' || k === 'backspace') removeSel();
  else if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); seek(t + (k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / P.fps)); }
  else if (k === 'home') seek(0);
  else if (k === 'end') seek(total());
  else if (k === 'escape') select(null);
});

(async () => {
MEDIA_BASE = await inv('media_base');
paintIcons();
applyLang();
setLibTab('media');
document.fonts.load('800 40px "Cairo"').then(renderLibCards);
syncSettings();
refresh();
requestAnimationFrame(loop);
setTimeout(checkUpdate, 3000);

inv('dev_demo').then(async d => {
  if (!d.paths || !d.paths.length) return;
  const ids = addToBin(await inv('probe', { paths: d.paths }));
  for (const id of ids) addMedia(id, P.media[id].kind === 'image' ? 'v2' : null, P.media[id].kind === 'image' ? 1 : null);
  const pic = P.items.find(i => P.media[i.media]?.kind === 'image');
  if (pic) Object.assign(pic, { scale: 0.3, y: -560 });
  addText('accent');
  seek(1.5);
  P.items.find(i => P.media[i.media]?.kind === 'video').preset = 'bw';
  setTimeout(() => {
    draw();
    const vi = P.items.find(i => P.media[i.media]?.kind === 'video'), ve = elFor(vi);
    inv('dev_log', { msg: `video ready=${ve.readyState} err=${ve.error && ve.error.code} canvas=${view.width}x${view.height}` });
    const px = vctx.getImageData(P.w * 0.25, P.h * 0.4, 1, 1).data; // yellow bar -> gray when B&W preview works
    inv('dev_log', { msg: 'preview pixel ' + Array.from(px).join(',') + ' items ' + P.items.length });
    if (d.export) doExport(1, P.fps, 'h264_hw', d.export);
  }, 2500);
});
})();
