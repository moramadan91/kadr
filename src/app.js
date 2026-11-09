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

const ASPECTS = Object.fromEntries(['9:16', '16:9', '1:1', '4:5', '4:3', '3:4', '21:9'].map(r => [r, dimsFor(r)]));
/* ---------- fonts: bundled Google set, the rest of Google Fonts on demand, and this computer's own fonts ---------- */
const FONT_CAT = window.FONT_CAT || []; // [family, category letter, flags: a = Arabic, b = bundled]
const FontLib = { sys: [], dl: {}, tried: new Set() };
const FW = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };
function regFont(fam, files) {
  for (const f of files) {
    const n = f.split(/[\\/]/).pop(), w = /\[|VariableFont/.test(n) ? '100 900' : String(FW[(n.match(/-([A-Za-z]+)\.ttf$/) || [])[1]] || 400);
    const ff = new FontFace(fam, `url("${MEDIA_BASE + encodeURIComponent(f)}")`, { weight: w });
    document.fonts.add(ff);
    ff.load().then(() => (needsDraw = true)).catch(() => {});
  }
  FontLib.dl[fam] = files;
}
const catOf = f => FONT_CAT.find(c => c[0] === f);
const fontReady = f => FontLib.sys.includes(f) || !!FontLib.dl[f] || (catOf(f) || [, , ''])[2].includes('b') || !catOf(f);
async function fetchFont(f) {
  const files = await inv('font_fetch', { family: f });
  regFont(f, files);
  await document.fonts.load(`400 40px "${f}"`).catch(() => {});
}
// A project that uses a library font this computer hasn't downloaded yet fetches it quietly.
function ensureFonts() {
  for (const it of P.items) {
    const f = isText(it) && it.style && it.style.font;
    if (f && !fontReady(f) && !FontLib.tried.has(f)) { FontLib.tried.add(f); fetchFont(f).then(() => { needsDraw = true; }).catch(e => inv('dev_log', { msg: 'font ' + f + ': ' + e })); }
  }
}
// Canvas draws with a fallback until a face is loaded: ask for it once, then redraw.
const fontAsked = new Set();
function wantFont(spec) {
  if (fontAsked.has(spec) || document.fonts.check(spec)) return;
  fontAsked.add(spec);
  document.fonts.load(spec).then(() => (needsDraw = true)).catch(() => {});
}
let fontTab = 'all';
function fontPicker(it) {
  // compact dropdown under the font button; closes on outside click or Esc
  if ($('#fpop')) return closeFontPop();
  const pop = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'fpop' }));
  pop.innerHTML = `<div class="fpq">${icon('search')}<input id="fpQ" type="search" placeholder="${tr('fontSearch')}" dir="auto"></div>
    <div class="ftabs">${['all', 'ar', 'sys', 'lib'].map(x => `<button data-ft="${x}" class="${x === fontTab ? 'on' : ''}">${tr('ft_' + x)}</button>`).join('')}</div>
    <div id="fpL" class="fpl"></div><p class="fpn">${tr('fontNote')}</p>`;
  const r = $('#fontBtn').getBoundingClientRect(), w = 300, h = 420;
  pop.style.left = clamp(r.right - w, 8, innerWidth - w - 8) + 'px';
  pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  paintIcons(pop);
  const away = e => { if (!pop.contains(e.target) && !e.target.closest('#fontBtn')) closeFontPop(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeFontPop(); } };
  document.addEventListener('pointerdown', away, true);
  window.addEventListener('keydown', onKey, true);
  pop._off = () => { document.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', onKey, true); };
  const cur = it.style.font;
  const list = () => {
    const q = $('#fpQ').value.trim().toLowerCase(), have = f => fontReady(f);
    let rows;
    if (fontTab === 'sys') rows = FontLib.sys.map(f => [f, 'sys']);
    else {
      rows = FONT_CAT.filter(c => fontTab === 'ar' ? c[2].includes('a') : fontTab === 'lib' ? !have(c[0]) : true).map(c => [c[0], have(c[0]) ? 'ok' : 'dl', c[2].includes('a')]);
      if (fontTab === 'all') rows.sort((a, b) => (a[1] === 'dl') - (b[1] === 'dl') || b[2] - a[2]); // ready first, Arabic first
    }
    if (q) rows = rows.filter(r => r[0].toLowerCase().includes(q));
    const more = rows.length > 400;
    $('#fpL').innerHTML = rows.slice(0, 400).map(([f, k]) => `<div class="fr${f === cur ? ' on' : ''}" data-font="${esc(f)}"><span class="fn"${k === 'dl' ? '' : ` style="font-family:'${esc(f)}',Cairo"`}>${esc(f)}</span><span class="fs"${k === 'dl' ? '' : ` style="font-family:'${esc(f)}',Cairo"`}>أبجد Aa</span>${k === 'dl' ? icon('download') : ''}</div>`).join('') +
      (more ? `<p class="hint">${tr('fontMore', { n: rows.length - 400 })}</p>` : rows.length ? '' : `<p class="hint">${tr('fontNone')}</p>`);
    paintIcons($('#fpL'));
  };
  list();
  $('#fpQ').oninput = list;
  $('#fpQ').focus();
  pop.querySelector('.ftabs').onclick = e => { const b = e.target.closest('[data-ft]'); if (!b) return; fontTab = b.dataset.ft; $$('#fpop [data-ft]').forEach(x => x.classList.toggle('on', x === b)); list(); };
  $('#fpL').onclick = async e => {
    const r = e.target.closest('[data-font]');
    if (!r || r.classList.contains('busy')) return;
    const f = r.dataset.font;
    if (!fontReady(f)) {
      r.classList.add('busy');
      try { await fetchFont(f); } catch (er) { r.classList.remove('busy'); return toast(tr('fontFail') + ' ' + (er.message || er)); }
    }
    snapshot();
    it.style.font = f;
    closeFontPop();
    await document.fonts.load(`${it.style.weight || 400} 40px "${f}"`).catch(() => {});
    refresh();
  };
}
function closeFontPop() { const p = $('#fpop'); if (p) { p._off(); p.remove(); } }
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
  $$('[data-ph]').forEach(el => (el.placeholder = tr(el.dataset.ph)));
  $$('[data-tt]').forEach(el => (el.title = tr(el.dataset.tt) + (KEY_HINT[el.dataset.tt] ? '  ' + KEY_HINT[el.dataset.tt] : '')));
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
const msel = new Set(); // timeline multi-selection (always includes sel when used)
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
  const prev = !S.hasCurve(it) && P.items.find(p => p !== it && p.track === it.track && p.media === it.media && num(p.speed, 1) === sp && !S.hasCurve(p) &&
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
    const el = elFor(it), on = active(it, t), lt = clamp(t - it.start, 0, it.dur);
    const sp = clamp(S.rateAt(it, lt), 0.0625, 16), want = num(it.in, 0) + S.srcAt(it, lt);
    if (el.preservesPitch !== !it.pitch) el.preservesPitch = !it.pitch;
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

// ov = {id, lt}: draw that clip at its own local time (animation preview) whatever the playhead says.
function drawVisual(ctx, time, ov) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, P.w, P.h);
  for (const tid of renderOrder(P, 'video')) {
    for (const it of P.items) {
      const pv = ov && ov.id === it.id;
      if (it.track !== tid || isText(it) || !(pv || active(it, time))) continue;
      const m = media(it);
      if (m.kind === 'audio') continue;
      const src = m.kind === 'image' ? imgFor(m) : elFor(it);
      if (m.kind === 'image' ? !src.complete || !src.naturalWidth : src.readyState < 2) continue;
      const lt = pv ? ov.lt : time - it.start;
      const a = S.withVa(S.animAt(it, lt), lt, P.w, P.h), L = S.layout(a, m, P.w, P.h), C = S.srcCrop(it, m);
      const k = (src.videoWidth || src.naturalWidth || m.w) / m.w, u = C.w / L.sw, v = C.h / L.sh;
      ctx.save();
      ctx.globalAlpha = S.fadeAlpha(it, lt) * clamp(num(a.opacity, 1), 0, 1);
      const [tx, ty] = S.trkAt(it, lt);
      if (tx || ty) ctx.translate(tx * P.w, ty * P.h);
      if (it.flipH || it.flipV || num(a.rotate, 0)) {
        ctx.translate(L.ox + L.cw / 2, L.oy + L.ch / 2);
        ctx.rotate(num(a.rotate, 0) * Math.PI / 180);
        ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
        ctx.translate(-(L.ox + L.cw / 2), -(L.oy + L.ch / 2));
      }
      drawGraded(ctx, it, src, (C.x + L.cx * u) * k, (C.y + L.cy * v) * k, L.cw * u * k, L.ch * v * k, L.ox, L.oy, L.cw, L.ch);
      ctx.restore();
    }
  }
}

// Text presets ("Aa" styles). Each only sets the fields it cares about; the rest reset to defaults.
const TEXT_STYLES = (() => { const W = '#ffffff', B = '#000000'; return [
  { id: 'plain', s: {} },
  { id: 'outline', s: { strokeW: 7 } },
  { id: 'outlineW', s: { color: B, stroke: W, strokeW: 7 } },
  { id: 'shadow', s: { shadowOn: true, shadowBlur: 18, shadowDist: 8 } },
  { id: 'softGlow', s: { glowOn: true, glowColor: W, glowSize: 26 } },
  { id: 'yellowOut', s: { color: '#ffe14d', strokeW: 7 } },
  { id: 'redOut', s: { color: '#ff3b3b', stroke: W, strokeW: 7 } },
  { id: 'orange', s: { color: '#ff9a2e', stroke: W, strokeW: 6 } },
  { id: 'blue', s: { color: '#3aa0ff', stroke: W, strokeW: 6 } },
  { id: 'green', s: { color: '#5cff6a', strokeW: 7 } },
  { id: 'greyBox', s: { color: B, bgOn: true, bg: '#9a9a9a' } },
  { id: 'whiteGreyBox', s: { bgOn: true, bg: '#b5b5b5' } },
  { id: 'yellowBox', s: { color: B, bgOn: true, bg: '#ffd43b' } },
  { id: 'purpleBox', s: { bgOn: true, bg: '#7b2cff' } },
  { id: 'purpleOnWhite', s: { color: '#7b2cff', bgOn: true, bg: W } },
  { id: 'box', s: { color: B, bgOn: true, bg: W } },
  { id: 'blackBox', s: { bgOn: true, bg: B } },
  { id: 'greenBlack', s: { color: '#5cff6a', bgOn: true, bg: B } },
  { id: 'accent', s: { color: '#04201e', bgOn: true, bg: ACCENT } },
  { id: 'glitchGreen', s: { color: B, shadowOn: true, shadowColor: '#22e05a', shadowBlur: 0, shadowDist: 7 } },
  { id: 'retro', s: { color: '#ffcf3f', shadowOn: true, shadowColor: '#c2410c', shadowBlur: 0, shadowDist: 8 } },
  { id: 'neonPink', s: { color: '#ffe6ef', glowOn: true, glowColor: '#ff2d6f', glowSize: 30 } },
  { id: 'neonYellow', s: { color: '#fffbe0', glowOn: true, glowColor: '#ffd000', glowSize: 30 } },
  { id: 'neonGreen', s: { color: '#eaffea', glowOn: true, glowColor: '#22e05a', glowSize: 30 } },
  { id: 'gradient', s: { color: '#ffd84d', gradOn: true, fill2: '#ff4d8d', strokeW: 5 } },
  { id: 'yellowHl', s: { strokeW: 6, hl: '#ffd400' } },
  { id: 'serif', s: { font: 'Georgia', weight: 400 } },
  { id: 'impact', s: { font: 'Impact', weight: 400, caseMode: 'upper', strokeW: 5, spacing: 2 } },
]; })();
function textDefaults(caption) {
  return {
    font: 'Cairo', size: caption ? 78 : 110, weight: 800, color: '#ffffff', stroke: '#000000', strokeW: caption ? 6 : 0,
    bg: '#000000', bgOn: false, bgAlpha: 1, bgRadius: 0.22, hl: ACCENT, italic: false, underline: false, caseMode: 'none',
    spacing: 0, lineH: 1.3, align: 'center', shadowOn: false, shadowColor: '#000000', shadowBlur: 12, shadowDist: 6,
    glowOn: false, glowColor: ACCENT, glowSize: 24, gradOn: false, fill2: ACCENT,
  };
}
// Caption templates: a style plus an animation, applied to one caption or all of them.
const CAP_TPL = [
  { id: 'classic', s: { strokeW: 7, hl: '#ffe14d' } },
  { id: 'greenPop', s: { strokeW: 7, hl: '#5cff6a' }, anim: 'wordPop' },
  { id: 'purpleBox', s: { strokeW: 0, shadowOn: true, shadowBlur: 14, shadowDist: 4, hl: '#ffffff', hlBg: '#7b2cff' } },
  { id: 'redBox', s: { font: 'Tajawal', weight: 900, strokeW: 0, shadowOn: true, shadowBlur: 12, shadowDist: 4, hl: '#ffffff', hlBg: '#ff3b3b' } },
  { id: 'yellowBox', s: { font: 'Almarai', weight: 800, strokeW: 5, hl: '#111111', hlBg: '#ffd400' } },
  { id: 'blackBar', s: { strokeW: 0, bgOn: true, bg: '#000000', bgAlpha: 0.72, hl: ACCENT } },
  { id: 'whiteCard', s: { color: '#111111', strokeW: 0, bgOn: true, bg: '#ffffff', hl: '#7b2cff' } },
  { id: 'neon', s: { color: '#ffffff', strokeW: 0, glowOn: true, glowColor: '#ff2d6f', glowSize: 28, hl: '#ff8fb3' }, anim: 'wordFade' },
  { id: 'lalezar', s: { font: 'Lalezar', weight: 400, color: '#ffd84d', strokeW: 0, shadowOn: true, shadowColor: '#c2410c', shadowBlur: 0, shadowDist: 9, hl: '#ffffff' } },
  { id: 'anton', s: { font: 'Anton', weight: 400, caseMode: 'upper', strokeW: 6, spacing: 1, hl: '#ffe14d' }, anim: 'wordPop' },
  { id: 'bebas', s: { font: 'Bebas Neue', weight: 400, caseMode: 'upper', strokeW: 5, spacing: 2, hl: ACCENT } },
  { id: 'elegant', s: { font: 'El Messiri', weight: 700, strokeW: 0, shadowOn: true, shadowBlur: 18, shadowDist: 3, hl: '#ffd27a' }, anim: 'wordRise' },
  { id: 'kufi', s: { font: 'Reem Kufi', weight: 700, strokeW: 6, hl: '#3aa0ff' } },
  { id: 'gradient', s: { gradOn: true, color: '#ffd84d', fill2: '#ff4d8d', strokeW: 5, hl: '#ffffff' } },
  { id: 'minimal', s: { font: 'Tajawal', weight: 700, strokeW: 0, shadowOn: true, shadowBlur: 10, shadowDist: 2, hl: ACCENT }, anim: 'wordFade' },
  { id: 'inverse', s: { color: '#000000', stroke: '#ffffff', strokeW: 7, hl: '#ff3b3b' } },
  { id: 'changa', s: { font: 'Changa', weight: 800, strokeW: 6, hl: '#ff9a2e' }, loop: 'pulse' },
  { id: 'greenBox', s: { font: 'Rubik', weight: 800, strokeW: 0, shadowOn: true, shadowBlur: 10, shadowDist: 3, hl: '#04201e', hlBg: '#5cff6a' }, anim: 'wordPop' },
];
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
function applyTpl(it, id) {
  const tp = CAP_TPL.find(x => x.id === id);
  if (!tp) return;
  snapshot();
  const all = it.track === 'c1' && lsGet('kadr.tplAll', true);
  for (const c of all ? P.items.filter(i => i.track === 'c1' && isText(i)) : [it]) {
    c.style = { ...textDefaults(c.track === 'c1'), ...tp.s, size: c.style.size };
    c.anim = tp.anim || 'none'; c.loop = tp.loop || 'none'; c.tpl = id;
  }
  refresh();
}
const presetStyle = (id, caption) => ({ ...textDefaults(caption), ...((TEXT_STYLES.find(s => s.id === id) || {}).s || {}) });

const ANIM_IN = ['none', 'fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'pop', 'zoomIn', 'grow', 'drop', 'rotateIn', 'spin', 'wipe', 'type', 'wordPop', 'wordFade', 'wordRise',
  'flipIn', 'unfold', 'stretchIn', 'bounceIn', 'elastic', 'swingIn', 'rollIn', 'jackBox', 'blinkIn', 'glitchIn', 'wordDrop', 'wordZoom'];
const ANIM_OUT = ['none', 'fade', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'shrink', 'zoomOut', 'rotateOut', 'sink', 'wipe', 'typeErase',
  'flipOut', 'squash', 'stretchOut', 'fall', 'blinkOut', 'glitchOut', 'wordFadeOut'];
const ANIM_LOOP = ['none', 'pulse', 'float', 'shake', 'swing', 'heartbeat', 'wave', 'flicker', 'jelly', 'bounce', 'tada', 'tilt', 'zoomBeat', 'jitter', 'breathe', 'blink'];
// Repeatable pseudo-random in 0..1 (no Math.random: preview and export must match).
const rnd = x => { const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const elastic = p => p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * 2 * Math.PI / 3) + 1;
const EASE = S.EASE;
const caseText = (txt, m) => m === 'upper' ? txt.toUpperCase() : m === 'lower' ? txt.toLowerCase() : m === 'title' ? txt.replace(/\b\p{L}/gu, c => c.toUpperCase()) : txt;

// Animation state at local time lt. Pure function of (item, lt): preview and export match.
function textState(it, lt) {
  const st = it.style, size = st.size, TAU = Math.PI * 2;
  const inA = { slide: 'slideUp' }[it.anim] || it.anim || 'none', outA = it.out || 'none', loopA = it.loop || 'none';
  const inD = num(it.inDur, 0.5), outD = Math.min(num(it.outDur, 0.4), it.dur), len = it.text.length;
  let alpha = 1, dx = 0, dy = 0, sc = 1, sx = 1, sy = 1, rot = 0, chars = Infinity, wipe = 1, wipeOut = 0, anim = false;
  const toks = [];
  if (inA !== 'none' && lt < inD && !/^(type|word)/.test(inA)) {
    anim = true;
    const p = clamp(lt / inD, 0, 1), e = EASE.out(p);
    switch (inA) {
      case 'fade': alpha = e; break;
      case 'slideUp': alpha = e; dy = (1 - e) * size * 0.8; break;
      case 'slideDown': alpha = e; dy = -(1 - e) * size * 0.8; break;
      case 'slideLeft': alpha = e; dx = (1 - e) * size * 1.6; break;
      case 'slideRight': alpha = e; dx = -(1 - e) * size * 1.6; break;
      case 'pop': sc = 0.6 + 0.4 * EASE.back(p); alpha = Math.min(1, p * 3); break;
      case 'zoomIn': sc = 2.2 - 1.2 * e; alpha = e; break;
      case 'grow': sc = Math.max(0.001, EASE.back(p)); break;
      case 'drop': dy = -(1 - EASE.bounce(p)) * size * 2; alpha = Math.min(1, p * 4); break;
      case 'rotateIn': rot = -(1 - e) * Math.PI / 2; sc = 0.5 + 0.5 * e; alpha = e; break;
      case 'spin': rot = -(1 - e) * TAU; sc = Math.max(0.001, e); break;
      case 'wipe': wipe = e; break;
      case 'flipIn': sy = Math.max(0.01, EASE.back(p)); alpha = Math.min(1, p * 3); break;
      case 'unfold': sx = Math.max(0.01, EASE.back(p)); break;
      case 'stretchIn': sx = 2.6 - 1.6 * e; sy = 0.6 + 0.4 * e; alpha = e; break;
      case 'bounceIn': dy = (1 - EASE.bounce(p)) * size * 2; alpha = Math.min(1, p * 4); break;
      case 'elastic': sc = Math.max(0.01, elastic(p)); break;
      case 'swingIn': rot = -(1 - EASE.back(p)) * 0.7; alpha = e; break;
      case 'rollIn': dx = -(1 - e) * size * 3; rot = -(1 - e) * Math.PI; alpha = e; break;
      case 'jackBox': sc = Math.max(0.01, e); rot = Math.sin(p * Math.PI * 3) * (1 - p) * 0.5; alpha = e; break;
      case 'blinkIn': alpha = p > 0.85 || [0.15, 0.35, 0.55, 0.7].some((x, i) => p > x && p < x + 0.08 + i * 0.02) ? 1 : 0.08; break;
      case 'glitchIn': { const q = Math.floor(p * 14), j = (1 - p) * size; dx = (rnd(q) - 0.5) * j * 1.6; dy = (rnd(q + 7) - 0.5) * j * 0.3; alpha = rnd(q + 3) < p + 0.3 ? 1 : 0.2; break; }
    }
  }
  if (inA === 'type') { chars = Math.floor(lt * Math.max(22, len / Math.max(inD, 0.2))); if (chars < len) anim = true; }
  if (/^word/.test(inA)) {
    const n = it.text.split(/\s+/).filter(Boolean).length, step = Math.min(0.14, inD / Math.max(1, n)), w = 0.28;
    if (lt < (n - 1) * step + w) anim = true;
    toks.push(i => {
      const q = clamp((lt - i * step) / w, 0, 1);
      if (inA === 'wordDrop') return { a: Math.min(1, q * 4), sc: 1, dy: -(1 - EASE.bounce(q)) * size * 0.9 };
      if (inA === 'wordZoom') return { a: EASE.out(q), sc: 2.2 - 1.2 * EASE.out(q), dy: 0 };
      return inA === 'wordPop' ? { a: Math.min(1, q * 3), sc: 0.4 + 0.6 * EASE.back(q), dy: 0 }
        : inA === 'wordRise' ? { a: EASE.out(q), sc: 1, dy: (1 - EASE.out(q)) * size * 0.6 } : { a: EASE.out(q), sc: 1, dy: 0 };
    });
  }
  const r = it.dur - lt;
  if (outA !== 'none' && r < outD) {
    anim = true;
    const p = clamp(1 - r / outD, 0, 1), e = EASE.in(p);
    switch (outA) {
      case 'fade': alpha *= 1 - p; break;
      case 'slideUp': dy -= e * size * 0.8; alpha *= 1 - p; break;
      case 'slideDown': dy += e * size * 0.8; alpha *= 1 - p; break;
      case 'slideLeft': dx -= e * size * 1.6; alpha *= 1 - p; break;
      case 'slideRight': dx += e * size * 1.6; alpha *= 1 - p; break;
      case 'shrink': sc *= Math.max(0.001, 1 - e); break;
      case 'zoomOut': sc *= 1 + e * 1.2; alpha *= 1 - p; break;
      case 'rotateOut': rot += e * Math.PI / 2; sc *= 1 - 0.5 * e; alpha *= 1 - p; break;
      case 'sink': dy += e * size; alpha *= 1 - p; break;
      case 'wipe': wipeOut = EASE.out(p); break;
      case 'typeErase': chars = Math.min(chars, Math.floor(len * (1 - p))); break;
      case 'flipOut': sy *= Math.max(0.01, 1 - e); break;
      case 'squash': sy *= Math.max(0.01, 1 - e); sx *= 1 + 0.5 * e; alpha *= 1 - p * p; break;
      case 'stretchOut': sx *= 1 + 1.6 * e; sy *= 1 - 0.4 * e; alpha *= 1 - p; break;
      case 'fall': dy += e * size * 3; rot += e * 0.6; alpha *= 1 - p * p; break;
      case 'blinkOut': alpha *= p < 0.15 || [0.25, 0.45, 0.62].some((x, i) => p > x && p < x + 0.1 - i * 0.02) ? 1 : 0.08; break;
      case 'glitchOut': { const q = Math.floor(p * 14), j = p * size; dx += (rnd(q + 11) - 0.5) * j * 1.6; dy += (rnd(q + 5) - 0.5) * j * 0.3; alpha *= rnd(q + 2) > p - 0.1 ? 1 - p * 0.5 : 0.1; break; }
      case 'wordFadeOut': {
        const n = it.text.split(/\s+/).filter(Boolean).length;
        toks.push(i => ({ a: 1 - clamp((p * (n + 1) - i), 0, 1), sc: 1, dy: 0 }));
        break;
      }
    }
  }
  if (loopA !== 'none') {
    anim = true;
    switch (loopA) {
      case 'pulse': sc *= 1 + 0.06 * Math.sin(TAU * lt * 1.5); break;
      case 'float': dy += Math.sin(TAU * lt * 0.8) * size * 0.12; break;
      case 'shake': dx += Math.sin(lt * 47) * Math.sin(lt * 13) * size * 0.05; dy += Math.sin(lt * 39) * size * 0.03; break;
      case 'swing': rot += Math.sin(TAU * lt) * 0.08; break;
      case 'heartbeat': sc *= 1 + 0.1 * Math.pow(Math.max(0, Math.sin(TAU * lt * 1.2)), 8); break;
      case 'flicker': alpha *= Math.sin(lt * 23) * Math.sin(lt * 7) > 0.6 ? 0.35 : 1; break;
      case 'wave': toks.push(i => ({ a: 1, sc: 1, dy: Math.sin(TAU * lt * 0.9 - i * 0.7) * size * 0.14 })); break;
      case 'jelly': { const w = Math.sin(TAU * lt * 1.4) * 0.07; sx *= 1 + w; sy *= 1 - w; break; }
      case 'bounce': dy -= Math.abs(Math.sin(Math.PI * lt * 1.6)) * size * 0.22; break;
      case 'tada': { const q = (lt % 2) / 0.9; if (q < 1) { sc *= 1 + 0.1 * Math.sin(Math.PI * q); rot += Math.sin(q * Math.PI * 8) * 0.06 * (1 - q); } break; }
      case 'tilt': rot += Math.sin(TAU * lt * 0.35) * 0.05; break;
      case 'zoomBeat': sc *= 1 + 0.12 * Math.pow(Math.max(0, Math.sin(TAU * lt)), 12); break;
      case 'jitter': { const q = Math.floor(lt * 12); if (rnd(q) > 0.82) { dx += (rnd(q + 1) - 0.5) * size * 0.25; dy += (rnd(q + 2) - 0.5) * size * 0.08; } break; }
      case 'breathe': sc *= 1 + 0.03 * Math.sin(TAU * lt * 0.4); break;
      case 'blink': alpha *= (lt % 1.2) < 0.12 ? 0.25 : 1; break;
    }
  }
  let word = -1;
  if (it.words) for (let i = 0; i < it.words.length; i++) if (it.words[i].s <= lt) word = i;
  const tok = toks.length ? i => toks.reduce((m, f) => { const k = f(i); return { a: m.a * k.a, sc: m.sc * k.sc, dy: m.dy + k.dy }; }, { a: 1, sc: 1, dy: 0 }) : null;
  return { alpha, dx, dy, sc, sx, sy, rot, chars, wipe, wipeOut, tok, anim, word };
}

// pr: project (P, or a scaled copy for export) — sizes come from it.
function drawTextItem(ctx, pr, it, lt) {
  it = S.animAt(it, lt);
  const st = { ...textDefaults(it.track === 'c1'), ...it.style }, s = textState({ ...it, style: st }, lt);
  const tokens = caseText(it.text, st.caseMode).split(/\s+/).filter(Boolean);
  const alpha = s.alpha * clamp(num(it.opacity, 1), 0, 1);
  if (alpha <= 0 || !tokens.length || s.sc <= 0 || s.sx <= 0 || s.sy <= 0) return;
  const rtl = /[֐-ࣿ]/.test(it.text);
  ctx.save();
  ctx.font = `${st.italic ? 'italic ' : ''}${st.weight} ${st.size}px "${st.font}"`;
  wantFont(`${st.weight} 40px "${st.font}"`);
  // Letter spacing splits Arabic joins (kashida/tatweel gaps), so Arabic gets it between words instead.
  const arab = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(it.text);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (arab ? 0 : num(st.spacing, 0)) + 'px';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const space = ctx.measureText(' ').width + (arab ? num(st.spacing, 0) * 3 : 0), maxW = pr.w * 0.86;
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
  const lh = st.size * num(st.lineH, 1.3), tk = S.trkAt(it, lt), cx = (num(it.x, 0.5) + tk[0]) * pr.w, cy = (num(it.y, 0.5) + tk[1]) * pr.h;
  const blockW = Math.max(...lines.map(l => l.w)), top = cy - (lines.length * lh) / 2 + lh / 2;
  const pad = st.size * 0.35;
  if (ctx === vctx) textBoxes.set(it.id, { cx: cx + s.dx, cy: cy + s.dy, w: (blockW + pad * 2) * s.sc * s.sx * num(it.scale, 1), h: lines.length * lh * s.sc * s.sy * num(it.scale, 1), rot: s.rot * 180 / Math.PI + num(it.rotate, 0) });
  ctx.translate(cx + s.dx, cy + s.dy);
  ctx.rotate(s.rot + num(it.rotate, 0) * Math.PI / 180);
  ctx.scale(s.sc * s.sx * num(it.scale, 1), s.sc * s.sy * num(it.scale, 1));
  ctx.translate(-cx, -cy);
  if (s.wipe < 1 || s.wipeOut > 0) { // reveal along the reading direction
    const L = cx - blockW / 2 - pad, full = blockW + pad * 2, a = full * s.wipeOut, b = full * s.wipe;
    ctx.beginPath();
    if (rtl) ctx.rect(L + full - b, top - lh, b - a, lines.length * lh + lh); else ctx.rect(L + a, top - lh, b - a, lines.length * lh + lh);
    ctx.clip();
  }
  ctx.globalAlpha = alpha;
  const hlOK = it.words && it.words.length === tokens.length;
  const lineLeft = ln => st.align === 'left' ? cx - blockW / 2 : st.align === 'right' ? cx + blockW / 2 - ln.w : cx - ln.w / 2;
  const fillFor = (y, i) => {
    if (hlOK && i === s.word) return st.hl;
    if (!st.gradOn) return st.color;
    const g = ctx.createLinearGradient(0, y - st.size / 2, 0, y + st.size / 2);
    g.addColorStop(0, st.color); g.addColorStop(1, st.fill2);
    return g;
  };
  const glyphs = (txt, x, y, i) => {
    if (st.hlBg && hlOK && i === s.word) { // box behind the word being spoken
      const w = widths[i], p = st.size * 0.14;
      ctx.save(); ctx.fillStyle = st.hlBg; ctx.beginPath();
      ctx.roundRect((rtl ? x - w : x) - p, y - st.size * 0.62, w + p * 2, st.size * 1.24, st.size * 0.2); ctx.fill(); ctx.restore();
    }
    if (st.glowOn) {
      ctx.save();
      ctx.shadowColor = st.glowColor; ctx.shadowBlur = st.glowSize; ctx.fillStyle = st.glowColor;
      ctx.fillText(txt, x, y); ctx.fillText(txt, x, y);
      ctx.restore();
    }
    if (st.shadowOn) {
      ctx.shadowColor = st.shadowColor; ctx.shadowBlur = st.shadowBlur;
      ctx.shadowOffsetX = st.shadowDist * 0.7; ctx.shadowOffsetY = st.shadowDist * 0.7;
    }
    if (st.strokeW > 0) { ctx.lineWidth = st.strokeW * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = st.stroke; ctx.strokeText(txt, x, y); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = fillFor(y, i);
    ctx.fillText(txt, x, y);
    ctx.shadowColor = 'transparent';
  };
  lines.forEach((ln, li) => {
    const y = top + li * lh, x0 = lineLeft(ln);
    if (st.bgOn) {
      ctx.save();
      ctx.globalAlpha = alpha * num(st.bgAlpha, 1);
      ctx.fillStyle = st.bg;
      ctx.beginPath();
      ctx.roundRect(x0 - pad, y - lh / 2, ln.w + pad * 2, lh, st.size * num(st.bgRadius, 0.22));
      ctx.fill();
      ctx.restore();
    }
    let x = rtl ? x0 + ln.w : x0;
    for (const i of ln.idx) {
      const txt = shown[i];
      if (txt) {
        if (s.tok) {
          const k = s.tok(i), mid = rtl ? x - widths[i] / 2 : x + widths[i] / 2;
          if (k.a > 0 && k.sc > 0) {
            ctx.save();
            ctx.globalAlpha = alpha * k.a;
            ctx.translate(mid, y + k.dy); ctx.scale(k.sc, k.sc); ctx.translate(-mid, -y);
            glyphs(txt, x, y, i);
            ctx.restore();
          }
        } else glyphs(txt, x, y, i);
      }
      x += (rtl ? -1 : 1) * (widths[i] + space);
    }
    if (st.underline) {
      ctx.fillStyle = st.gradOn ? st.color : st.color;
      ctx.fillRect(x0, y + st.size * 0.52, ln.w, Math.max(2, st.size * 0.06));
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
const textBoxes = new Map(); // text id -> on-screen box, filled while drawing the preview
const selBox = $('#stage').appendChild(Object.assign(document.createElement('div'), { id: 'selbox', hidden: true,
  innerHTML: '<i data-sh="nw"></i><i data-sh="ne"></i><i data-sh="sw"></i><i data-sh="se"></i><button data-sh="del"></button><button data-sh="rot"></button>' }));
selBox.querySelector('[data-sh="del"]').innerHTML = icon('x');
selBox.querySelector('[data-sh="rot"]').innerHTML = icon('rotate-cw');
function draw() {
  if (view.width !== P.w || view.height !== P.h) { view.width = P.w; view.height = P.h; fitView(); }
  let ap = animPreview && item(animPreview.id);
  if (animPreview && (!ap || ap.id !== sel || inspTab !== 'tAnim')) { animPreview = null; ap = null; }
  drawVisual(vctx, t, ap && !isText(ap) ? { id: ap.id, lt: animPreviewLt(ap) } : null);
  textBoxes.clear();
  for (const it of visibleTexts(P, t)) if (!ap || it.id !== ap.id) drawTextItem(vctx, P, it, t - it.start);
  if (ap && isText(ap)) drawTextItem(vctx, P, ap, animPreviewLt(ap));
  syncKfUI();
  placeSelBox();
}
// Animation preview: plays just the chosen animation on the selected text, looping, while the rest of the frame holds still.
let animPreview = null;
function animPreviewLt(it) {
  const inD = num(it.inDur, 0.5), outD = Math.min(num(it.outDur, 0.4), it.dur), sub = animPreview.sub;
  const [a, b] = sub === 'out' ? [Math.max(0, it.dur - outD - 0.5), it.dur] : sub === 'loop' ? [Math.min(inD, it.dur), Math.min(inD + 2, it.dur)] : [0, Math.min(it.dur, inD + 0.6)];
  const span = b - a + (sub === 'out' ? 0.35 : 0), e = (performance.now() - animPreview.at) / 1000 % (span + 0.25);
  return Math.min(a + e, sub === 'out' ? it.dur - 1e-3 : b);
}
function startAnimPreview(it) {
  setPlaying(false);
  animPreview = { id: it.id, sub: animSub, at: performance.now() };
  needsDraw = true;
}
function fitView() {
  const st = $('#stage'), aw = st.clientWidth - 28, ah = st.clientHeight - 28;
  const k = Math.max(0.01, Math.min(aw / P.w, ah / P.h));
  view.style.width = Math.floor(P.w * k) + 'px';
  view.style.height = Math.floor(P.h * k) + 'px';
}
new ResizeObserver(fitView).observe($('#stage'));

/* ---------- resizable panels: drag the gaps between library / player / inspector / timeline ---------- */
const PANES = {
  libW: { el: () => $('#lib'), min: 200, max: () => 560, def: 290 },
  inspW: { el: () => $('#insp'), min: 240, max: () => 560, def: 320 },
  tlH: { el: () => $('#tl'), min: 150, max: () => innerHeight - 320, def: 340 },
};
const paneSize = k => { try { return +localStorage.getItem('kadr.' + k) || PANES[k].def; } catch { return PANES[k].def; } };
const setPane = (k, v) => { v = Math.round(clamp(v, PANES[k].min, Math.max(PANES[k].min, PANES[k].max()))); document.body.style.setProperty('--' + k, v + 'px'); return v; };
const splits = Object.keys(PANES).map(k => {
  setPane(k, paneSize(k));
  const sp = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'split ' + (k === 'tlH' ? 'h' : 'v') }));
  sp.addEventListener('pointerdown', e => {
    const rtl = document.documentElement.dir === 'rtl', x0 = e.clientX, y0 = e.clientY;
    const r = PANES[k].el().getBoundingClientRect(), w0 = k === 'tlH' ? r.height : r.width;
    // library sits at the start edge, inspector at the end edge; flip for RTL
    const sign = k === 'tlH' ? -1 : (k === 'libW') !== rtl ? 1 : -1;
    let v = w0;
    sp.classList.add('on'); document.body.classList.add('resizing'); document.body.style.cursor = getComputedStyle(sp).cursor;
    const mv = ev => { v = setPane(k, w0 + sign * (k === 'tlH' ? ev.clientY - y0 : ev.clientX - x0)); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', () => {
      window.removeEventListener('pointermove', mv);
      sp.classList.remove('on'); document.body.classList.remove('resizing'); document.body.style.cursor = '';
      try { localStorage.setItem('kadr.' + k, String(v)); } catch {}
    }, { once: true });
  });
  sp.addEventListener('dblclick', () => { setPane(k, PANES[k].def); try { localStorage.removeItem('kadr.' + k); } catch {} });
  return [k, sp];
});
function placeSplits() {
  const rtl = document.documentElement.dir === 'rtl', lib = $('#lib').getBoundingClientRect(), insp = $('#insp').getBoundingClientRect(), tl = $('#tl').getBoundingClientRect();
  for (const [k, sp] of splits) {
    if (k === 'tlH') Object.assign(sp.style, { left: tl.left + 'px', width: tl.width + 'px', top: tl.top - 8 + 'px' });
    else {
      const r = k === 'libW' ? lib : insp, atStart = (k === 'libW') !== rtl; // pane's inner edge faces the player
      Object.assign(sp.style, { top: r.top + 'px', height: r.height + 'px', left: (atStart ? r.right : r.left - 8) + 'px' });
    }
  }
}
new ResizeObserver(placeSplits).observe(document.body);
for (const id of ['#lib', '#insp', '#tl']) new ResizeObserver(placeSplits).observe($(id));

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
  if (needsDraw || animPreview) { needsDraw = false; draw(); updatePlayhead(); }
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
  return best && best.it.start + S.ltAt(best.it, best.el.currentTime - num(best.it.in, 0));
}
function setPlaying(v) {
  if (v) animPreview = null;
  playing = v && total() > 0;
  if (playing && t >= total() - 0.01) t = 0;
  const b = $('#bPlay');
  b.dataset.i = playing ? 'pause' : 'play';
  b.innerHTML = icon(b.dataset.i);
  if (!playing) for (const el of els.values()) el.pause();
}
function seek(v) { animPreview = null; t = clamp(v, 0, Math.max(total(), 0)); needsDraw = true; }
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
  return icon(m.kind === 'audio' ? 'music' : m.kind === 'image' ? 'image' : 'film') + esc(m.name) + (S.hasCurve(it) ? `  ⟿ ${tr('cv_' + it.curve.id)}` : num(it.speed, 1) !== 1 ? `  ×${+num(it.speed, 1).toFixed(2)}` : '');
}
function renderTimeline() {
  const width = (Math.max(total(), t) + 30) * pps;
  $('#rows').style.width = $('#ruler').style.width = width + 'px';
  $('#heads').innerHTML = P.tracks.map(x => `<div class="head" data-track="${x.id}" title="${tr('dragTrack')}"><i style="background:${TRACK_COLOR[x.kind]}"></i>${esc(tr('tr_' + x.id))}</div>`).join('');
  $('#rows').innerHTML = P.tracks.map(x => `<div class="row${x.id === 'v1' ? ' main' : ''}" data-track="${x.id}">${
    P.items.filter(i => i.track === x.id).map(it => `<div class="clip k-${kindOf(it)}${isSel(it.id) ? ' sel' : ''}" data-id="${it.id}" style="left:${it.start * pps}px;width:${Math.max(4, it.dur * pps)}px"><div class="h l"></div><span>${clipLabel(it)}</span>${kfTimes(it).filter(x => x >= 0 && x <= it.dur).map(x => `<i class="kfd" style="left:${x * pps}px"></i>`).join('')}<div class="h r"></div></div>`).join('')
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

// Drag a track header up/down to reorder tracks (layer order follows: higher = drawn on top).
$('#heads').addEventListener('pointerdown', e => {
  const h = e.target.closest('.head');
  if (!h || e.button !== 0) return;
  const id = h.dataset.track, y0 = e.clientY;
  let moved = false;
  const mv = ev => {
    if (!moved) { if (Math.abs(ev.clientY - y0) < 4) return; snapshot(); moved = true; }
    const r = $('#heads').getBoundingClientRect(), to = clamp(Math.floor((ev.clientY - r.top) / ROW), 0, P.tracks.length - 1);
    const from = P.tracks.findIndex(x => x.id === id);
    if (to === from) return;
    P.tracks.splice(to, 0, ...P.tracks.splice(from, 1));
    renderTimeline(); needsDraw = true;
    $(`#heads .head[data-track="${id}"]`).classList.add('drag');
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (moved) { dirty = true; refresh(); } }, { once: true });
});
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
  if (!c) { tlMarquee(e); return; }
  const it = item(c.dataset.id);
  if (tool === 'blade') { seek(snap1(timeAt(e.clientX), snapPoints(null))); select(it.id); splitAt(); return; }
  if (e.metaKey || e.ctrlKey || e.shiftKey) { toggleSel(it.id); return; }
  if (msel.size > 1 && msel.has(it.id) && !e.target.classList.contains('h')) return groupMove(e, it);
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
      // a curved clip can only be shortened (its curve covers the source range it has)
      const min = S.hasCurve(o) ? o.start : m ? Math.max(0, o.start - num(o.in, 0) / sp) : 0;
      const s = clamp(snap1(o.start + d, pts), min, o.start + o.dur - 1 / P.fps), shift = s - o.start;
      it.start = s;
      it.dur = o.dur - shift;
      if (m) it.in = num(o.in, 0) + S.srcAt(o, shift);
      if (S.hasCurve(o)) it.curve = S.subCurve(o, shift, o.dur);
      if (o.words) it.words = o.words.map(w => ({ ...w, s: w.s - shift, e: w.e - shift }));
      if (o.kf || o.trk) { const c = JSON.parse(JSON.stringify(o)); S.shiftTimes(c, shift); it.kf = c.kf; it.trk = c.trk; }
    } else {
      const max = S.hasCurve(o) ? o.start + o.dur : m ? o.start + (m.dur - num(o.in, 0)) / sp : Infinity;
      it.dur = clamp(snap1(o.start + o.dur + d, pts), o.start + 1 / P.fps, max) - o.start;
      if (S.hasCurve(o)) it.curve = S.subCurve(o, 0, it.dur);
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
// Several clips selected: drag one and they all shift in time together (tracks stay).
function groupMove(e, lead) {
  if (sel !== lead.id) { sel = lead.id; inspTab = null; inspector(); paintSel(); }
  const group = selIds().map(item).filter(Boolean), o = new Map(group.map(i => [i.id, i.start])), x0 = e.clientX;
  const minStart = Math.min(...group.map(i => i.start)), ids = new Set(group.map(i => i.id));
  const others = P.items.filter(i => !ids.has(i.id));
  const spts = [0, t, ...(P.markers || []), ...others.flatMap(i => [i.start, i.start + i.dur])];
  let changed = false;
  const mv = ev => {
    if (!changed) { if (Math.abs(ev.clientX - x0) < 3) return; snapshot(); changed = true; }
    let d = (ev.clientX - x0) / pps;
    const s = o.get(lead.id) + d, a = snap1(s, spts), b = snap1(s + lead.dur, spts) - lead.dur;
    d += (Math.abs(a - s) <= Math.abs(b - s) ? a : b) - s;
    d = Math.max(d, -minStart);
    for (const i of group) i.start = o.get(i.id) + d;
    renderTimeline();
    needsDraw = true;
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (changed) refresh(); else select(lead.id); }, { once: true }); // plain click picks just this clip
}
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
const selIds = () => msel.size ? [...msel] : sel ? [sel] : [];
const isSel = id => id === sel || msel.has(id);
function paintSel() { $$('.clip').forEach(c => c.classList.toggle('sel', isSel(c.dataset.id))); needsDraw = true; }
function select(id) {
  const had = msel.size;
  msel.clear();
  if (sel === id) { if (had) paintSel(); return; }
  sel = id;
  paintSel();
  inspTab = null;
  inspector();
}
// Cmd/Ctrl/Shift-click adds or removes a clip from the selection.
function toggleSel(id) {
  if (!msel.size && sel) msel.add(sel);
  if (msel.has(id)) msel.delete(id); else msel.add(id);
  const prev = sel;
  sel = msel.has(id) ? id : [...msel].pop() || null;
  if (msel.size < 2) msel.clear();
  paintSel();
  if (sel !== prev) { inspTab = null; inspector(); }
}
// Drag on an empty part of the timeline: rubber-band select. A plain click still moves the playhead.
function tlMarquee(e) {
  const rows = $('#rows'), x0 = e.clientX, y0 = e.clientY, keep = e.metaKey || e.ctrlKey || e.shiftKey, base = new Set(keep ? selIds() : []);
  let box = null;
  const mv = ev => {
    if (!box) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return; box = rows.appendChild(Object.assign(document.createElement('div'), { className: 'marq' })); }
    const l = Math.min(x0, ev.clientX), r = Math.max(x0, ev.clientX), tp = Math.min(y0, ev.clientY), b = Math.max(y0, ev.clientY), R = rows.getBoundingClientRect();
    Object.assign(box.style, { left: l - R.left + 'px', top: tp - R.top + 'px', width: r - l + 'px', height: b - tp + 'px' });
    const ids = new Set(base);
    for (const c of rows.querySelectorAll('.clip')) { const q = c.getBoundingClientRect(); if (q.right > l && q.left < r && q.bottom > tp && q.top < b) ids.add(c.dataset.id); }
    msel.clear();
    if (ids.size > 1) ids.forEach(x => msel.add(x));
    const nsel = ids.has(sel) ? sel : [...ids][0] || null;
    if (nsel !== sel) { sel = nsel; inspTab = null; inspector(); }
    paintSel();
  };
  const up = ev => {
    window.removeEventListener('pointermove', mv);
    if (box) box.parentNode.removeChild(box);
    else { select(null); seek(timeAt(ev.clientX)); }
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
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
  const st = presetStyle(styleId);
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
function splitAt(all) {
  const min = 1 / P.fps;
  const ok = (all ? P.items.filter(i => active(i, t)) : targetsAtPlayhead()).filter(it => t - it.start > min && it.start + it.dur - t > min);
  if (!ok.length) return toast(tr('cutHint'));
  snapshot();
  splitItems(ok);
  refresh();
}
function splitItems(ok) {
  for (const it of ok) {
    const cut = t - it.start, b = JSON.parse(JSON.stringify(it));
    b.id = uid(); b.start = t; b.dur = it.dur - cut; b.fadeIn = 0;
    S.shiftTimes(b, cut);
    if (sourceBound(it)) b.in = num(it.in, 0) + S.srcAt(it, cut);
    if (S.hasCurve(it)) { b.curve = S.subCurve(it, cut, it.dur); it.curve = S.subCurve(it, 0, cut); }
    it.dur = cut; it.fadeOut = 0;
    if (it.words) {
      const w = it.words;
      it.words = w.filter(x => x.s < cut);
      b.words = w.filter(x => x.s >= cut).map(x => ({ ...x, s: x.s - cut, e: x.e - cut }));
      it.text = it.words.map(x => x.w).join(' ');
      b.text = b.words.map(x => x.w).join(' ');
    }
    P.items.push(b);
  }
}
// Q / W: drop the part of the clip before / after the playhead.
function trimTo(side) {
  const min = 1 / P.fps;
  const ok = targetsAtPlayhead().filter(it => t - it.start > min && it.start + it.dur - t > min);
  if (!ok.length) return toast(tr('cutHint'));
  snapshot();
  for (const it of ok) {
    const cut = t - it.start;
    if (side === 'right') { if (S.hasCurve(it)) it.curve = S.subCurve(it, 0, cut); it.dur = cut; continue; }
    if (sourceBound(it)) it.in = num(it.in, 0) + S.srcAt(it, cut);
    if (S.hasCurve(it)) it.curve = S.subCurve(it, cut, it.dur);
    if (it.words) it.words = it.words.filter(x => x.s >= cut).map(x => ({ ...x, s: x.s - cut, e: x.e - cut }));
    S.shiftTimes(it, cut);
    it.start = t;
    it.dur -= cut;
  }
  if (side === 'left' && magnet && ok.some(i => i.track === 'v1')) { pack(); const s = item(sel); if (s) seek(s.start); }
  refresh();
}
function removeSel() {
  const ids = new Set(selIds());
  if (!ids.size) return;
  snapshot();
  P.items = P.items.filter(i => !ids.has(i.id));
  sel = null; msel.clear();
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

let binSig = '';
function refresh() {
  if (MEDIA_BASE) ensureFonts();
  for (const id of msel) if (!item(id)) msel.delete(id);
  if (msel.size < 2) msel.clear();
  pack();
  // library redraws only when its files or their "in use" marks change (thumbnails are <video> elements)
  const sig = Object.keys(P.media).join() + '|' + [...new Set(P.items.map(i => i.media))].join();
  if (sig !== binSig) { binSig = sig; renderBin(); }
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
const showVal = (k, v) => /Dur$/.test(k) ? (+v).toFixed(2) + 's' : k === 'rotate' ? Math.round(v) + '°' : k === 'speed' ? '×' + (+v).toFixed(2) : /volume|opacity|bgAlpha|crop\./.test(k) ? Math.round(v * 100) + '%' : /size|strokeW|spacing|Blur|Dist|glowSize/.test(k) ? String(v | 0) : (+v).toFixed(2);

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
  if (isText(it)) return ['tText', 'tTpl', 'tAnim'];
  const k = media(it).kind;
  return k === 'audio' ? ['tAudio', 'tSpeed'] : k === 'image' ? ['tVideo', 'tAnim', 'tAdjust'] : ['tVideo', 'tAudio', 'tSpeed', 'tAnim', 'tAdjust'];
}

/* ---------- keyframes ---------- */
const KF_DEF = it => ({ x: isText(it) ? 0.5 : 0, y: isText(it) ? 0.5 : 0, scale: 1, rotate: 0, opacity: 1 });
const kfLt = it => clamp(t - it.start, 0, it.dur);
const kfTol = () => 0.5 / P.fps;
const kfTimes = it => it.kf ? [...new Set(S.KF.flatMap(k => (it.kf[k] || []).map(q => q[0])))].sort((a, b) => a - b) : [];
const kfHere = it => kfTimes(it).some(x => Math.abs(x - kfLt(it)) < kfTol());
function kfSet(it, k, lt, v) {
  it.kf ??= {};
  const p = (it.kf[k] ??= []), i = p.findIndex(q => Math.abs(q[0] - lt) < kfTol());
  if (i >= 0) p[i][1] = v; else { p.push([+lt.toFixed(4), v]); p.sort((a, b) => a[0] - b[0]); }
}
// Add a key for every animatable property at the playhead, or remove the key that is there.
function kfToggle(it) {
  snapshot();
  const lt = kfLt(it);
  if (kfHere(it)) {
    for (const k of S.KF) if (it.kf[k]) { it.kf[k] = it.kf[k].filter(q => Math.abs(q[0] - lt) >= kfTol()); if (!it.kf[k].length) delete it.kf[k]; }
    if (!S.hasKf(it)) delete it.kf;
  } else {
    const a = S.animAt(it, lt), d = KF_DEF(it);
    for (const k of S.KF) kfSet(it, k, lt, num(a[k], d[k]));
  }
  refresh();
}
function kfJump(it, dir) {
  const lt = kfLt(it), ts = kfTimes(it);
  const n = dir > 0 ? ts.find(x => x > lt + kfTol()) : [...ts].reverse().find(x => x < lt - kfTol());
  if (n != null) { seek(it.start + n); syncKfUI(true); }
}
// Animated props shown in the inspector follow the playhead.
let kfSyncT = -1;
function syncKfUI(force) {
  const it = sel && item(sel);
  if (!it || editing || (!force && t === kfSyncT)) return;
  kfSyncT = t;
  const b = document.querySelector('#inspBody [data-kf="tog"]');
  if (b) b.classList.toggle('on', kfHere(it));
  if (!S.hasKf(it)) return;
  const a = S.animAt(it, kfLt(it)), d = KF_DEF(it);
  for (const k of S.KF) {
    const el = document.querySelector(`#inspBody [data-k="${k}"]`), v = num(a[k], d[k]);
    if (!el) continue;
    el.value = el.type === 'number' ? +v.toFixed(3) : v;
    const sh = document.querySelector(`#inspBody [data-show="${k}"]`);
    if (sh) sh.textContent = showVal(k, v);
  }
}
const kfBar = it => `<div class="kfbar" dir="ltr"><button class="ib" data-kf="prev" title="${tr('kf_prev')}">${icon('chevron-left')}</button>` +
  `<button class="kfb${kfHere(it) ? ' on' : ''}" data-kf="tog" title="${tr('kf_tip')}">${icon('diamond')}<span>${tr('keyframe')}</span></button>` +
  `<button class="ib" data-kf="next" title="${tr('kf_next')}">${icon('chevron-right')}</button></div>`;
const trkBtns = it => grp('tracking', `<button class="wide" id="trkGo">${icon('crosshair')} ${tr(it.trk ? 'trk_redo' : 'trk_go')}</button>` + (it.trk ? `<button class="wide" id="trkClear">${tr('trk_clear')}</button>` : ''));
function inspector() {
  kfSyncT = -1;
  const body = $('#inspBody'), it = sel && item(sel), tabs = inspTabsFor(it);
  if (!tabs.includes(inspTab)) inspTab = tabs[0] || null;
  $('#inspTabs').innerHTML = tabs.map(x => `<button data-itab="${x}" class="${x === inspTab ? 'on' : ''}">${tr(x)}</button>`).join('');
  $('#inspTabs').hidden = !tabs.length;
  if (!it) {
    const k = (label, also) => `<div><kbd>${KEY_HINT[label]}</kbd>${also ? ` <kbd>${also}</kbd>` : ''} ${tr(label)}</div>`;
    body.innerHTML = `<p class="hint">${tr('nothingSel')}</p><div class="keys"><h4>${tr('shortcuts')}</h4>
      ${k('k_play')}${k('split')}${k('delLeft', 'W')}${k('k_copy', fmtKey('mod+v'))}${k('undo')}${k('select', 'B')}${k('k_frames', '→')}
      <button class="wide" id="bAllKeys">${tr('k_all')}</button></div>`;
    $('#bAllKeys').onclick = showKeys;
    return;
  }
  const h = [];
  const timing = `<div class="row2">${fld.number('start', 'start', 0.01, it)}${fld.number('dur', 'dur', 0.01, it)}</div>`;
  const fades = `<div class="row2">${fld.range('fadeIn', 'fadeIn', 0, 2, 0.05, it)}${fld.range('fadeOut', 'fadeOut', 0, 2, 0.05, it)}</div>`;
  if (inspTab === 'tText') {
    const st = { ...textDefaults(it.track === 'c1'), ...it.style };
    it.style = st;
    h.push(`<div class="f"><textarea data-k="text" dir="auto">${esc(it.text)}</textarea></div>`, timing);
    const pOpen = (() => { try { return localStorage.getItem('kadr.presetsOpen') === '1'; } catch { return false; } })();
    h.push(`<div class="grp"><div class="gh ghx"><span>${tr('presets')}</span><button class="ib pTog${pOpen ? ' open' : ''}" data-ptog title="${tr(pOpen ? 'showLess' : 'showMore')}">${icon('chevron-down')}</button></div>` +
      `<div class="tpresets${pOpen ? '' : ' collapsed'}">${TEXT_STYLES.map(x => `<button data-tpreset="${x.id}" title="${x.id}"></button>`).join('')}</div></div>`);
    h.push(grp('font', `<div class="f"><button class="fontbtn" id="fontBtn" style="font-family:'${esc(st.font)}',Cairo">${esc(st.font)}${icon('chevron-down')}</button></div>` +
      `<div class="row2">${fld.range('style.size', 'size', 20, 260, 1, it)}${fld.select('style.weight', 'weight', [400, 600, 800, 900].map(w => [w, tr('w' + w)]), it)}</div>` +
      `<div class="tbar"><span>${tr('pattern')}</span><div class="tg">` +
        `<button data-tog="bold" class="${st.weight >= 700 ? 'on' : ''}" title="${tr('bold')}"><b>B</b></button>` +
        `<button data-tog="underline" class="${st.underline ? 'on' : ''}" title="${tr('underline')}"><u>U</u></button>` +
        `<button data-tog="italic" class="${st.italic ? 'on' : ''}" title="${tr('italic')}"><i>I</i></button></div></div>` +
      `<div class="tbar"><span>${tr('caseMode')}</span><div class="tg">${[['upper', 'TT'], ['lower', 'tt'], ['title', 'Tt']].map(([v, l]) => `<button data-set="caseMode" data-v="${v}" class="${st.caseMode === v ? 'on' : ''}" title="${tr('case_' + v)}">${l}</button>`).join('')}</div></div>` +
      `<div class="tbar"><span>${tr('align')}</span><div class="tg">${['left', 'center', 'right'].map(v => `<button data-set="align" data-v="${v}" class="${st.align === v ? 'on' : ''}" title="${tr('al_' + v)}">${icon('align-' + v)}</button>`).join('')}</div></div>` +
      `<div class="row2">${fld.range('style.spacing', 'spacing', -5, 40, 1, it)}${fld.range('style.lineH', 'lineH', 0.8, 2.5, 0.05, it, 1.3)}</div>` +
      `<div class="inl">${fld.color('style.color', 'color', it)}${fld.check('style.gradOn', 'gradient', it)}${st.gradOn ? fld.color('style.fill2', 'color2', it) : ''}${it.words ? fld.color('style.hl', 'hl', it) : ''}</div>`));
    h.push(grp('stroke', fld.range('style.strokeW', 'stroke', 0, 20, 1, it) + `<div class="inl">${fld.color('style.stroke', 'strokeColor', it)}</div>`));
    h.push(grp('bg', `<div class="inl">${fld.check('style.bgOn', 'bg', it)}${fld.color('style.bg', 'color', it)}</div>` +
      (st.bgOn ? `<div class="row2">${fld.range('style.bgAlpha', 'opacity', 0, 1, 0.01, it, 1)}${fld.range('style.bgRadius', 'radius', 0, 0.5, 0.01, it, 0.22)}</div>` : '')));
    h.push(grp('shadow', `<div class="inl">${fld.check('style.shadowOn', 'shadow', it)}${fld.color('style.shadowColor', 'color', it)}</div>` +
      (st.shadowOn ? `<div class="row2">${fld.range('style.shadowBlur', 'blur', 0, 60, 1, it)}${fld.range('style.shadowDist', 'distance', 0, 40, 1, it)}</div>` : '')));
    h.push(grp('glow', `<div class="inl">${fld.check('style.glowOn', 'glow', it)}${fld.color('style.glowColor', 'color', it)}</div>` +
      (st.glowOn ? fld.range('style.glowSize', 'size', 2, 80, 1, it) : '')));
    const ai = S.animAt(it, kfLt(it));
    h.push(grp('transform', kfBar(it) + fld.range('x', 'horiz', 0, 1, 0.01, ai, 0.5) + fld.range('y', 'vert', 0, 1, 0.01, ai, 0.5) +
      fld.range('scale', 'scale', 0.1, 4, 0.01, ai, 1) + fld.range('rotate', 'rotation', -180, 180, 1, ai) + fld.range('opacity', 'opacity', 0, 1, 0.01, ai, 1)));
    h.push(trkBtns(it));
    if (it.track === 'c1') h.push(`<button class="wide" id="capAll">${tr('applyAllCaps')}</button>`);
  } else if (inspTab === 'tTpl') {
    const fav = lsGet('kadr.tplFav', []), card = x => `<div class="tpl${it.tpl === x.id ? ' on' : ''}" data-tpl="${x.id}" title="${x.id}"><button class="star${fav.includes(x.id) ? ' on' : ''}" data-fav="${x.id}">${icon('star')}</button></div>`;
    if (it.track === 'c1') h.push(`<label class="tplall"><input type="checkbox" id="tplAll"${lsGet('kadr.tplAll', true) ? ' checked' : ''}>${tr('tplAll')}</label>`);
    if (fav.length) h.push(`<div class="gh">${tr('favorites')}</div><div class="tpls">${CAP_TPL.filter(x => fav.includes(x.id)).map(card).join('')}</div>`);
    h.push(`<div class="gh">${tr('tTpl')}</div><div class="tpls">${CAP_TPL.map(card).join('')}</div>`);
  } else if (inspTab === 'tAnim') {
    {
      const V = !isText(it);
      const key = { in: 'anim', out: 'out', loop: 'loop' }[animSub];
      const list = V ? ['none', ...Object.keys({ in: S.VA_IN, out: S.VA_OUT, loop: S.VA_LOOP }[animSub])] : { in: ANIM_IN, out: ANIM_OUT, loop: ANIM_LOOP }[animSub];
      const curA = ({ slide: 'slideUp' })[it[key]] || it[key] || 'none';
      h.push(`<div class="seg">${['in', 'out', 'loop'].map(x => `<button data-asub="${x}" class="${x === animSub ? 'on' : ''}">${tr('an_' + x)}${(x === 'in' ? it.anim : x === 'out' ? it.out : it.loop) && (x === 'in' ? it.anim : x === 'out' ? it.out : it.loop) !== 'none' ? ' •' : ''}</button>`).join('')}</div>`);
      h.push(`<div class="agrid">${list.map(a => `<button data-anim="${a}" class="${a === curA ? 'on' : ''}">${a === 'none' ? icon('x') : V ? icon('image') : `<b>Aa</b>`}<span>${tr('an_' + a)}</span></button>`).join('')}</div>`);
      if (animSub !== 'loop' && curA !== 'none') h.push(fld.range(animSub === 'in' ? 'inDur' : 'outDur', 'animDur', 0.1, 3, 0.05, it, animSub === 'in' ? 0.5 : 0.4));
      if (V) h.push(fades);
    }
  } else if (inspTab === 'tVideo') {
    h.push(`<div class="f hint" style="direction:ltr;text-align:start">${esc(media(it).name)}</div>`, timing);
    const ai = S.animAt(it, kfLt(it));
    h.push(grp('scale', kfBar(it) + fld.select('fit', 'fit_', [['cover', tr('cover')], ['contain', tr('contain')]], it) +
      fld.range('scale', 'scale', 0.1, 3, 0.01, ai, 1) +
      `<div class="row2">${fld.number('x', 'posX', 1, ai)}${fld.number('y', 'posY', 1, ai)}</div>` +
      fld.range('rotate', 'rotation', -180, 180, 1, ai) +
      fld.range('opacity', 'opacity', 0, 1, 0.01, ai, 1) +
      `<div class="inl">${fld.check('flipH', 'flipH', it)}${fld.check('flipV', 'flipV', it)}</div>`));
    if (it.track !== 'v1') h.push(trkBtns(it));
    h.push(`<div id="cropGrp">${grp('cropSec', `<div class="row2">${fld.range('crop.l', 'cropL', 0, 0.45, 0.01, it)}${fld.range('crop.r', 'cropR', 0, 0.45, 0.01, it)}</div>` +
      `<div class="row2">${fld.range('crop.t', 'cropT', 0, 0.45, 0.01, it)}${fld.range('crop.b', 'cropB', 0, 0.45, 0.01, it)}</div>`)}</div>`);
  } else if (inspTab === 'tAudio') {
    if (media(it).kind === 'audio') h.push(`<div class="f hint" style="direction:ltr;text-align:start">${esc(media(it).name)}</div>`, timing);
    h.push(fld.range('volume', 'volume', 0, 2, 0.01, it, 1), `<div class="inl">${fld.check('muted', 'mute', it)}</div>`);
    if (media(it).kind === 'audio') h.push(fades);
  } else if (inspTab === 'tSpeed') {
    const cv = S.hasCurve(it) ? it.curve : null, sub = cv ? 'curve' : spdSub;
    h.push(`<div class="seg">${['std', 'curve'].map(x => `<button data-ssub="${x}" class="${x === sub ? 'on' : ''}">${tr('sp_' + x)}</button>`).join('')}</div>`);
    const durRow = `<div class="f"><div class="lb"><span>${tr('dur')}</span></div><div class="spdur"><span>${S.srcLen(it).toFixed(1)}s</span><i></i><input type="number" data-k="dur" step="0.1" value="${+it.dur.toFixed(2)}"></div></div>`;
    if (sub === 'std') {
      const sp = num(it.speed, 1);
      h.push(`<div class="f"><div class="lb"><span>${tr('speed')}</span><b data-show="spdLog">×${sp}</b></div><div class="spd"><input type="range" data-k="spdLog" min="-1" max="1" step="0.005" value="${Math.log10(sp)}" list="spdTicks"><input type="number" data-k="speed" min="0.1" max="10" step="0.05" value="${sp}"></div>` +
        `<datalist id="spdTicks"><option value="-1"></option><option value="-0.699"></option><option value="-0.301"></option><option value="0"></option><option value="0.301"></option><option value="0.699"></option><option value="1"></option></datalist>` +
        `<div class="ticks"><span>0.1x</span><span>0.5x</span><span>1x</span><span>2x</span><span>5x</span><span>10x</span></div></div>`, durRow);
    } else {
      h.push(`<div class="cvgrid">${['none', ...Object.keys(S.CURVES)].map(c => `<button data-curve="${c}" class="${(cv ? cv.id : 'none') === c ? 'on' : ''}">${c === 'none' ? icon('x') : curveSvg(S.CURVES[c], c === 'custom')}<span>${tr('cv_' + c)}</span></button>`).join('')}</div>`);
      if (cv) h.push(durRow, `<div class="cved"><svg id="cvEd" viewBox="0 0 300 160" preserveAspectRatio="none"></svg><div class="cvbtns"><button id="cvReset">${tr('reset')}</button><button id="cvAdd" title="${tr('cv_add')}">+</button><button id="cvDel" title="${tr('cv_del')}">−</button></div></div>`);
    }
    if (media(it).kind === 'video' || media(it).hasAudio || media(it).kind === 'audio') h.push(`<div class="inl">${fld.check('pitch', 'pitchShift', it)}</div>`);
    if (media(it).kind === 'video') h.push(`<div class="inl">${fld.check('smooth', 'smoothSlow', it)}</div><p class="hint">${tr('smoothHint')}</p>`);
  } else if (inspTab === 'tAdjust') {
    h.push(fld.select('preset', 'filter', Object.keys(S.PRESETS).map(p => [p, tr('p_' + p)]), it));
    h.push(fld.range('brightness', 'brightness', 0.5, 1.5, 0.01, it, 1), fld.range('contrast', 'contrast', 0.5, 1.5, 0.01, it, 1));
    h.push(fld.range('saturation', 'saturation', 0, 2, 0.01, it, 1), fld.range('temp', 'temp', -1, 1, 0.01, it));
    h.push(`<button class="wide" id="colReset" data-i="rotate-ccw"><span>${tr('resetColor')}</span></button>`);
  }
  body.innerHTML = h.join('');
  paintIcons(body);
  $$('#inspBody [data-tpl]').forEach(b => {
    const tp = CAP_TPL.find(x => x.id === b.dataset.tpl), txt = tr('tplSample'), w = txt.split(' ');
    const fake = { text: txt, words: w.map((x, i) => ({ w: x, s: i, e: i + 1 })), style: { ...textDefaults(true), ...tp.s, size: 64 }, x: 0.5, y: 0.5, dur: 9 };
    b.prepend(cardCanvas(ctx => { ctx.fillStyle = '#3a3f47'; ctx.fillRect(0, 0, 240, 180); drawTextItem(ctx, { w: 240, h: 180 }, fake, 1.5); }, 96, 72));
  });
  const ta = $('#tplAll');
  if (ta) ta.onchange = () => lsSet('kadr.tplAll', ta.checked);
  $$('#inspBody [data-tpreset]').forEach(b => {
    const fake = { text: 'Aa', style: { ...presetStyle(b.dataset.tpreset, false), size: 96, strokeW: num(presetStyle(b.dataset.tpreset).strokeW, 0) * 1.1, shadowBlur: 10, shadowDist: 8, glowSize: 26 }, x: 0.5, y: 0.5, dur: 9 };
    b.appendChild(cardCanvas(ctx => drawTextItem(ctx, { w: 240, h: 180 }, fake, 5), 64, 48));
  });
  if ($('#cvEd')) cvEditor(it);
  if ($('#fontBtn')) $('#fontBtn').onclick = () => fontPicker(it);
  const tg = $('#trkGo'), tc = $('#trkClear');
  if (tg) tg.onclick = () => trackPick(it);
  if (tc) tc.onclick = () => { snapshot(); delete it.trk; refresh(); };
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

let editing = false, animSub = 'in', spdSub = 'std';

/* ---------- speed curves ---------- */
const cvY = (v, h) => (1 - (Math.log10(v) + 1) / 2) * h; // 10x top, 0.1x bottom
function curveSvg(pts, flat) {
  if (flat) return `<svg viewBox="0 0 60 40" class="cvth"><path d="M8 12h44M8 20h44M8 28h44" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="12" r="3"/><circle cx="34" cy="20" r="3"/><circle cx="44" cy="28" r="3"/></svg>`;
  const d = Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${(i / 40 * 56 + 2).toFixed(1)} ${(cvY(S.curveSpeed(pts, i / 40), 32) + 4).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 60 40" class="cvth"><path d="M2 12h56M2 28h56" class="gl"/><path d="M2 20h56" class="gl1"/><path d="${d}" class="cv"/></svg>`;
}
function setCurve(it, id) {
  snapshot();
  const src = S.srcLen(it);
  if (id === 'none') { delete it.curve; it.speed = 1; it.dur = src; }
  else { it.curve = { id, pts: S.CURVES[id].map(p => [...p]), src }; it.speed = 1; it.dur = S.curveDur(it.curve); }
  cvSel = -1;
  refresh();
}
let cvSel = -1;
// Graph editor: drag points (ends move up/down only), + adds a point at the playhead, − removes the chosen one.
function cvEditor(it) {
  const svg = $('#cvEd'), W = 300, H = 160;
  const paint = () => {
    const c = it.curve, d = Array.from({ length: 121 }, (_, i) => `${i ? 'L' : 'M'}${(i / 120 * W).toFixed(1)} ${cvY(S.curveSpeed(c.pts, i / 120), H).toFixed(1)}`).join('');
    const lt = t - it.start, ph = lt >= 0 && lt <= it.dur ? S.uAtF(c, lt / it.dur) * W : -10;
    svg.innerHTML = `<path d="M0 ${H / 4}H${W}M0 ${H * 3 / 4}H${W}" class="gl"/><path d="M0 ${H / 2}H${W}" class="gl1"/>` +
      `<text x="4" y="12">10x</text><text x="4" y="${H / 2 - 4}">1x</text><text x="4" y="${H - 4}">0.1x</text>` +
      `<path d="${d}" class="cv"/><line x1="${ph}" x2="${ph}" y1="0" y2="${H}" class="ph"/>` +
      c.pts.map((p, i) => `<circle data-pt="${i}" cx="${p[0] * W}" cy="${cvY(p[1], H)}" r="7" class="${i === cvSel ? 'on' : ''}"/>`).join('');
    const dd = $('#inspBody [data-k="dur"]');
    if (dd && document.activeElement !== dd) dd.value = +it.dur.toFixed(2);
  };
  const commit = pts => { it.curve = { ...it.curve, pts, edited: true }; it.dur = S.curveDur(it.curve); pack(); renderTimeline(); needsDraw = true; paint(); };
  paint();
  svg.onpointerdown = e => {
    const c = e.target.closest('[data-pt]');
    if (!c) return;
    const i = +c.dataset.pt, n = it.curve.pts.length, r = svg.getBoundingClientRect();
    cvSel = i;
    snapshot();
    const mv = ev => {
      const pts = it.curve.pts.map(p => [...p]);
      const y = clamp((ev.clientY - r.top) / r.height, 0, 1), v = Math.pow(10, (1 - y) * 2 - 1);
      pts[i][1] = +(Math.abs(Math.log10(v)) < 0.03 ? 1 : v).toFixed(3); // snap to 1x
      if (i > 0 && i < n - 1) pts[i][0] = +clamp((ev.clientX - r.left) / r.width, pts[i - 1][0] + 0.02, pts[i + 1][0] - 0.02).toFixed(4);
      commit(pts);
    };
    mv(e);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); dirty = true; inspector(); }, { once: true });
  };
  $('#cvReset').onclick = () => { snapshot(); cvSel = -1; commit(S.CURVES[it.curve.id].map(p => [...p])); };
  $('#cvAdd').onclick = () => {
    const c = it.curve, lt = t - it.start;
    let u = lt > 0 && lt < it.dur ? S.uAtF(c, lt / it.dur) : null;
    if (u == null || c.pts.some(p => Math.abs(p[0] - u) < 0.03)) { // widest gap's middle
      let g = 0;
      for (let i = 1; i < c.pts.length; i++) if (c.pts[i][0] - c.pts[i - 1][0] > c.pts[g + 1][0] - c.pts[g][0]) g = i - 1;
      u = (c.pts[g][0] + c.pts[g + 1][0]) / 2;
    }
    snapshot();
    const pts = [...c.pts.map(p => [...p]), [+u.toFixed(4), +S.curveSpeed(c.pts, u).toFixed(3)]].sort((a, b) => a[0] - b[0]);
    cvSel = pts.findIndex(p => p[0] === +u.toFixed(4));
    commit(pts);
  };
  $('#cvDel').onclick = () => {
    const c = it.curve;
    if (cvSel <= 0 || cvSel >= c.pts.length - 1) return toast(tr('cv_pick'));
    snapshot();
    const pts = c.pts.filter((_, i) => i !== cvSel);
    cvSel = -1;
    commit(pts);
  };
}
$('#inspBody').addEventListener('input', e => {
  const k = e.target.dataset.k, it = sel && item(sel);
  if (!k || !it) return;
  let v = e.target.type === 'checkbox' ? e.target.checked
    : (e.target.type === 'range' || e.target.type === 'number') ? +e.target.value : e.target.value;
  if (typeof v === 'number' && !isFinite(v)) return;
  if (k === 'style.weight') v = +v;
  if (!editing) { snapshot(); editing = true; }
  const m = sourceBound(it);
  if (k === 'speed' || k === 'spdLog') {
    v = clamp(k === 'spdLog' ? Math.pow(10, v) : v, 0.1, 10);
    v = +v.toFixed(v < 1 ? 3 : 2);
    it.dur = S.srcLen(it) / v; // keep the same source range
    it.speed = v;
    delete it.curve;
    const o = $(`#inspBody [data-k="${k === 'speed' ? 'spdLog' : 'speed'}"]`), dd = $('#inspBody [data-k="dur"]');
    if (o) o.value = k === 'speed' ? Math.log10(v) : v;
    if (dd) dd.value = +it.dur.toFixed(2);
  } else if (k === 'dur') {
    if (S.hasCurve(it)) it.dur = Math.max(1 / P.fps, v); // stretches the whole curve
    else if (m && it.track !== 't1' && inspTab === 'tSpeed') { // speed tab: the duration sets the speed
      it.speed = clamp(S.srcLen(it) / Math.max(1 / P.fps, v), 0.1, 10); it.dur = S.srcLen(it) / it.speed;
    } else {
      const max = m ? (m.dur - num(it.in, 0)) / num(it.speed, 1) : Infinity;
      it.dur = clamp(v, 1 / P.fps, max);
    }
  } else if (k === 'start') {
    it.start = Math.max(0, v);
  } else if (it.kf && it.kf[k] && S.KF.includes(k)) {
    kfSet(it, k, kfLt(it), v);
  } else {
    setPath(it, k, v); // caption text with a new word count simply loses the highlight (see drawTextItem)
  }
  const show = document.querySelector(`[data-show="${k}"]`);
  if (show && e.target.type === 'range') show.textContent = showVal(k, v);
  dirty = true;
  if (/^(start|dur|speed|spdLog)$/.test(k)) { pack(); }
  if (k === 'spdLog' || k === 'speed') { const sh = $('#inspBody [data-show="spdLog"]'); if (sh) sh.textContent = '×' + it.speed; }
  if (/^(inDur|outDur)$/.test(k)) startAnimPreview(it);
  renderTimeline();
  needsDraw = true;
});
$('#inspBody').addEventListener('click', e => {
  const it = sel && item(sel);
  if (!it) return;
  const kb = e.target.closest('[data-kf]');
  if (kb) { const a = kb.dataset.kf; return a === 'tog' ? kfToggle(it) : kfJump(it, a === 'next' ? 1 : -1); }
  const sub = e.target.closest('[data-asub]');
  if (sub) {
    animSub = sub.dataset.asub;
    inspector();
    const cur = it[{ in: 'anim', out: 'out', loop: 'loop' }[animSub]];
    if (cur && cur !== 'none') startAnimPreview(it); else animPreview = null;
    return;
  }
  const ss = e.target.closest('[data-ssub]');
  if (ss) {
    spdSub = ss.dataset.ssub;
    if (spdSub === 'std' && S.hasCurve(it)) { snapshot(); const src = S.srcLen(it); delete it.curve; it.speed = 1; it.dur = src; return refresh(); }
    return inspector();
  }
  const cb = e.target.closest('[data-curve]');
  if (cb) { setCurve(it, cb.dataset.curve); return; }
  const fv = e.target.closest('[data-fav]');
  if (fv) {
    const f = lsGet('kadr.tplFav', []), id = fv.dataset.fav;
    lsSet('kadr.tplFav', f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
    return inspector();
  }
  const tp = e.target.closest('[data-tpl]');
  if (tp) return applyTpl(it, tp.dataset.tpl);
  const tg = e.target.closest('[data-tog]');
  if (tg) {
    snapshot();
    const k = tg.dataset.tog;
    if (k === 'bold') it.style.weight = it.style.weight >= 700 ? 400 : 800; else it.style[k] = !it.style[k];
    return refresh();
  }
  const ts = e.target.closest('[data-set]');
  if (ts) {
    snapshot();
    const k = ts.dataset.set, v = ts.dataset.v;
    it.style[k] = k === 'caseMode' && it.style[k] === v ? 'none' : v;
    return refresh();
  }
  const an = e.target.closest('[data-anim]');
  if (an) {
    snapshot();
    it[{ in: 'anim', out: 'out', loop: 'loop' }[animSub]] = an.dataset.anim;
    refresh();
    if (an.dataset.anim !== 'none') startAnimPreview(it); else animPreview = null;
    return;
  }
  if (e.target.closest('[data-ptog]')) {
    const g = $('#inspBody .tpresets'), open = g.classList.toggle('collapsed') === false;
    const b = e.target.closest('[data-ptog]');
    b.classList.toggle('open', open); b.title = tr(open ? 'showLess' : 'showMore');
    try { localStorage.setItem('kadr.presetsOpen', open ? '1' : '0'); } catch {}
    return;
  }
  const pr = e.target.closest('[data-tpreset]');
  if (pr) {
    snapshot();
    const keep = { size: it.style.size, font: it.style.font, weight: it.style.weight, hl: it.style.hl };
    const ps = TEXT_STYLES.find(x => x.id === pr.dataset.tpreset).s;
    it.style = { ...presetStyle(pr.dataset.tpreset, it.track === 'c1'), size: keep.size, hl: keep.hl, ...(ps.font ? {} : { font: keep.font, weight: keep.weight }) };
    refresh();
  }
});
$('#inspBody').addEventListener('change', e => {
  editing = false;
  if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.type === 'number') inspector();
});

/* ---------- preview: selection box, click to select, dragging ---------- */
function visBox(it, lt) {
  const m = media(it), a = S.withVa(S.animAt(it, lt), lt, P.w, P.h), L = S.layout(a, m, P.w, P.h), [tx, ty] = S.trkAt(it, lt);
  return { cx: L.ox + L.cw / 2 + tx * P.w, cy: L.oy + L.ch / 2 + ty * P.h, w: L.cw, h: L.ch, rot: num(a.rotate, 0) };
}
const boxOf = it => isText(it) ? textBoxes.get(it.id) : visBox(it, t - it.start);
function inBox(b, x, y) {
  const r = -b.rot * Math.PI / 180, dx = x - b.cx, dy = y - b.cy;
  const u = dx * Math.cos(r) - dy * Math.sin(r), v = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(u) <= b.w / 2 + 6 && Math.abs(v) <= b.h / 2 + 6;
}
// Topmost thing under the pointer: texts above clips, upper tracks above lower ones.
function hitAt(x, y) {
  const tx = visibleTexts(P, t);
  for (let i = tx.length - 1; i >= 0; i--) { const b = textBoxes.get(tx[i].id); if (b && inBox(b, x, y)) return tx[i]; }
  const order = renderOrder(P, 'video');
  for (let i = order.length - 1; i >= 0; i--)
    for (const it of [...P.items].reverse()) if (it.track === order[i] && !isText(it) && active(it, t) && media(it).kind !== 'audio' && inBox(visBox(it, t - it.start), x, y)) return it;
  return null;
}
function placeSelBox() {
  const it = sel && item(sel), b = it && !playing && msel.size < 2 && active(it, t) && !(media(it) && media(it).kind === 'audio') && boxOf(it);
  selBox.hidden = !b;
  if (!b) return;
  const vr = view.getBoundingClientRect(), sr = $('#stage').getBoundingClientRect(), k = vr.width / P.w;
  Object.assign(selBox.style, { left: vr.left - sr.left + (b.cx - b.w / 2) * k + 'px', top: vr.top - sr.top + (b.cy - b.h / 2) * k + 'px',
    width: Math.max(8, b.w * k) + 'px', height: Math.max(8, b.h * k) + 'px', transform: `rotate(${b.rot}deg)` });
}
// Value of an animatable prop on the selected item, written as a keyframe when that prop is keyframed.
const propNow = (it, k) => num(S.animAt(it, kfLt(it))[k], KF_DEF(it)[k]);
function setProp(it, k, v) { if (it.kf && it.kf[k]) kfSet(it, k, kfLt(it), v); else it[k] = v; }
selBox.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-sh]'), it = sel && item(sel);
  if (!h || !it) return;
  e.preventDefault(); e.stopPropagation();
  if (h.dataset.sh === 'del') return removeSel();
  const r = selBox.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const s0 = propNow(it, 'scale'), r0 = propNow(it, 'rotate'), d0 = Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)), a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
  let changed = false;
  const mv = ev => {
    if (!changed) { snapshot(); changed = true; }
    if (h.dataset.sh === 'rot') {
      let v = r0 + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
      v = ((v + 540) % 360) - 180;
      for (const q of [-180, -90, 0, 90, 180]) if (Math.abs(v - q) < 4) v = q;
      setProp(it, 'rotate', Math.round(v));
    } else setProp(it, 'scale', +clamp(s0 * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0, 0.05, 10).toFixed(3));
    needsDraw = true;
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (changed) { renderTimeline(); inspector(); } }, { once: true });
});
view.addEventListener('pointerdown', e => {
  const r = view.getBoundingClientRect(), k = P.w / r.width, x0 = e.clientX, y0 = e.clientY;
  if (e.button !== 0) return;
  const cur = sel && item(sel), cb = cur && active(cur, t) && !(media(cur) && media(cur).kind === 'audio') && boxOf(cur);
  // keep the current selection when clicking inside it (so you can grab a clip under a text), otherwise pick what's on top
  if (!(cb && inBox(cb, (x0 - r.left) * k, (y0 - r.top) * k))) {
    const hit = hitAt((x0 - r.left) * k, (y0 - r.top) * k);
    select(hit ? hit.id : null);
  }
  const it = sel && item(sel);
  if (!it || !active(it, t) || (media(it) && media(it).kind === 'audio')) return;
  const a0 = S.animAt(it, kfLt(it)), ox = num(a0.x, isText(it) ? 0.5 : 0), oy = num(a0.y, isText(it) ? 0.5 : 0);
  let changed = false;
  const mv = ev => {
    const dx = (ev.clientX - x0) * k, dy = (ev.clientY - y0) * k;
    if (!changed) { snapshot(); changed = true; }
    if (isText(it)) { it.x = clamp(ox + dx / P.w, 0, 1); it.y = clamp(oy + dy / P.h, 0, 1); }
    else { it.x = Math.round(ox + dx); it.y = Math.round(oy + dy); }
    for (const k of ['x', 'y']) if (it.kf && it.kf[k]) kfSet(it, k, kfLt(it), it[k]);
    needsDraw = true;
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (changed) inspector(); }, { once: true });
});

/* ---------- motion tracking (template matching, no model) ---------- */
// Video under the follower at time t: topmost active video clip that isn't the follower itself.
function trackSource(f, time) {
  const order = renderOrder(P, 'video');
  for (let i = order.length - 1; i >= 0; i--)
    for (const it of P.items) if (it !== f && it.track === order[i] && !isText(it) && active(it, time) && media(it).kind === 'video') return it;
  return null;
}
// Pick the box on the preview: drag to draw, buttons to start or cancel.
function trackPick(f) {
  const src = trackSource(f, t);
  if (!src) return toast(tr('trk_noVideo'));
  setPlaying(false);
  const st = $('#stage'), r = () => view.getBoundingClientRect(), sr = () => st.getBoundingClientRect();
  const fp = isText(f) ? [num(f.x, 0.5) + S.trkAt(f, t - f.start)[0], num(f.y, 0.5) + S.trkAt(f, t - f.start)[1]] : [0.5, 0.5];
  let b = { x: clamp(fp[0] - 0.12, 0, 0.76), y: clamp(fp[1] - 0.12 * P.w / P.h, 0, 1 - 0.24 * P.w / P.h), w: 0.24, h: 0.24 * P.w / P.h };
  const ov = document.createElement('div');
  ov.className = 'trkpick';
  ov.innerHTML = `<i class="box"></i><div class="bar"><span>${tr('trk_hint')}</span><button class="primary" data-go>${tr('trk_start')}</button><button data-no>${tr('cancel')}</button></div>`;
  st.appendChild(ov);
  const box = ov.querySelector('.box');
  const place = () => {
    const R = r(), S0 = sr();
    Object.assign(box.style, { left: R.left - S0.left + b.x * R.width + 'px', top: R.top - S0.top + b.y * R.height + 'px', width: b.w * R.width + 'px', height: b.h * R.height + 'px' });
  };
  place();
  const ro = new ResizeObserver(place); ro.observe(st);
  ov.addEventListener('pointerdown', e => {
    if (e.target.closest('.bar')) return;
    const R = r(), fx = x => clamp((x - R.left) / R.width, 0, 1), fy = y => clamp((y - R.top) / R.height, 0, 1);
    const x0 = fx(e.clientX), y0 = fy(e.clientY), inside = x0 > b.x && x0 < b.x + b.w && y0 > b.y && y0 < b.y + b.h, b0 = { ...b };
    const mv = ev => {
      const x = fx(ev.clientX), y = fy(ev.clientY);
      if (inside) b = { ...b0, x: clamp(b0.x + x - x0, 0, 1 - b0.w), y: clamp(b0.y + y - y0, 0, 1 - b0.h) };
      else b = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) };
      place();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
  });
  const close = () => { ro.disconnect(); ov.remove(); };
  ov.querySelector('[data-no]').onclick = close;
  ov.querySelector('[data-go]').onclick = async () => {
    close();
    if (b.w * P.w < 12 || b.h * P.h < 12) return toast(tr('trk_small'));
    try { await runTrack(f, src, b); } catch (e) { hideModal(); if (!cancelled) toast(String(e.message || e)); }
  };
}
async function runTrack(f, src, box) {
  cancelled = false;
  // shortcut: a curved clip is tracked at its average speed; sample the curve if tracking drifts on those.
  const m = media(src), L = S.layout(src, m, P.w, P.h), C = S.srcCrop(src, m), FPS = 15, sp = S.srcLen(src) / src.dur;
  const bw = box.w * P.w, bh = box.h * P.h, sc = clamp(40 / Math.max(bw, bh), 0.03, 1); // template ~40px on its long side
  // Frames cover the clip's on-screen box (L.cw x L.ch at L.ox,L.oy) at work scale, grey, decoded once by ffmpeg.
  const W = Math.max(8, Math.round(L.cw * sc / 2) * 2), H = Math.max(8, Math.round(L.ch * sc / 2) * 2), kx = W / L.cw, ky = H / L.ch;
  const lo = Math.max(f.start, src.start), hi = Math.min(f.start + f.dur, src.start + src.dur), t0 = clamp(t, lo, hi - 1 / FPS);
  // shortcut: whole range is held in memory (W*H bytes per frame); stream it if clips get very long.
  const vf = [];
  if (C.any) vf.push(`scale=${m.w}:${m.h}`, `crop=${C.w}:${C.h}:${C.x}:${C.y}`);
  if (src.flipH) vf.push('hflip');
  if (src.flipV) vf.push('vflip');
  vf.push(`setpts=(PTS-STARTPTS)/${sp}`, `fps=${FPS}`, `scale=${L.sw}:${L.sh}`, `crop=${L.cw}:${L.ch}:${L.cx}:${L.cy}`, `scale=${W}:${H}`, 'format=gray');
  progress(tr('trk_run'), null);
  const buf = new Uint8Array(await inv('gray_frames', { args: ['-v', 'error', '-ss', String(num(src.in, 0) + (lo - src.start) * sp), '-t', String((hi - lo) * sp),
    '-i', m.path, '-an', '-vf', vf.join(','), '-f', 'rawvideo', 'pipe:1'] }));
  const N = Math.floor(buf.length / (W * H));
  if (!N) throw new Error(tr('trk_noVideo'));
  const frame = i => buf.subarray(i * W * H, (i + 1) * W * H);
  const tw = Math.max(4, Math.round(bw * kx)), th = Math.max(4, Math.round(bh * ky));
  const patch = (g, x, y) => { // template at integer top-left, zero-mean
    const p = new Float32Array(tw * th);
    let s = 0;
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) s += p[j * tw + i] = g[clamp(y + j, 0, H - 1) * W + clamp(x + i, 0, W - 1)];
    s /= p.length;
    for (let i = 0; i < p.length; i++) p[i] -= s;
    return p;
  };
  const norm = p => Math.sqrt(p.reduce((a, v) => a + v * v, 0)) || 1;
  // Normalised cross-correlation in a window around (px,py); sub-pixel peak by parabola fit.
  const R = 24;
  const match = (g, tpl, tn, px, py) => {
    const x0 = Math.round(px), y0 = Math.round(py), n = 2 * R + 1, sc2 = new Float32Array(n * n).fill(-2), NN = tw * th;
    let best = -2, bi = 0, bj = 0;
    for (let dj = -R; dj <= R; dj++) {
      const y = y0 + dj;
      if (y < 0 || y + th > H) continue;
      for (let di = -R; di <= R; di++) {
        const x = x0 + di;
        if (x < 0 || x + tw > W) continue;
        let s = 0, ss = 0, st = 0;
        for (let j = 0; j < th; j++) { const o = (y + j) * W + x, q = j * tw; for (let i = 0; i < tw; i++) { const v = g[o + i]; s += v; ss += v * v; st += v * tpl[q + i]; } }
        const r = st / (tn * Math.sqrt(Math.max(ss - s * s / NN, 1e-6)));
        sc2[(dj + R) * n + di + R] = r;
        if (r > best) { best = r; bi = di; bj = dj; }
      }
    }
    const at = (i, j) => Math.abs(i) > R || Math.abs(j) > R ? -2 : sc2[(j + R) * n + i + R];
    const sub = (a, b0, c0) => { const d = a - 2 * b0 + c0; return a > -2 && c0 > -2 && d < 0 ? clamp(0.5 * (a - c0) / d, -0.5, 0.5) : 0; };
    return { x: x0 + bi + sub(at(bi - 1, bj), best, at(bi + 1, bj)), y: y0 + bj + sub(at(bi, bj - 1), best, at(bi, bj + 1)), r: best };
  };
  const i0 = clamp(Math.round((t0 - lo) * FPS), 0, N - 1), timeOf = i => lo + i / FPS;
  const sx = Math.round((box.x * P.w - L.ox) * kx), sy = Math.round((box.y * P.h - L.oy) * ky), tpl0 = patch(frame(i0), sx, sy);
  const pts = [[timeOf(i0) - f.start, 0, 0]];
  let done = 0, lost = 0;
  for (const dir of [1, -1]) {
    let tpl = Float32Array.from(tpl0), tn = norm(tpl), px = sx, py = sy, vx = 0, vy = 0;
    for (let i = i0 + dir; i >= 0 && i < N; i += dir) {
      if (cancelled) throw new Error(tr('cancelled'));
      const g = frame(i), hit = match(g, tpl, tn, px + vx, py + vy);
      if (hit.r < 0.35) lost++; else { vx = (hit.x - px) * 0.7; vy = (hit.y - py) * 0.7; px = hit.x; py = hit.y; }
      if (hit.r > 0.75) { // slow template refresh follows lighting/shape changes without drifting
        const p = patch(g, Math.round(px), Math.round(py));
        for (let k = 0; k < tpl.length; k++) tpl[k] = tpl[k] * 0.9 + p[k] * 0.1;
        tn = norm(tpl);
      }
      pts.push([timeOf(i) - f.start, (px - sx) / kx / P.w, (py - sy) / ky / P.h]);
      if (++done % 10 === 0) { progress(tr('trk_run'), done / N); await new Promise(r => setTimeout(r)); }
    }
  }
  hideModal();
  pts.sort((a, b) => a[0] - b[0]);
  // light smoothing (3-tap) to kill sub-pixel jitter
  const sm = pts.map((p, i) => i && i < pts.length - 1 ? [p[0], (pts[i - 1][1] + p[1] * 2 + pts[i + 1][1]) / 4, (pts[i - 1][2] + p[2] * 2 + pts[i + 1][2]) / 4] : p);
  snapshot();
  f.trk = { pts: sm.map(p => [+p[0].toFixed(4), +p[1].toFixed(5), +p[2].toFixed(5)]) };
  refresh();
  toast(lost > pts.length * 0.2 ? tr('trk_weak') : tr('trk_done'));
}

/* ---------- library ---------- */
function setLibTab(tab) {
  libTab = tab;
  $$('#libTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $$('#lib [data-pane]').forEach(p => (p.hidden = p.dataset.pane !== tab));
}
$('#libTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setLibTab(b.dataset.tab); });

/* ---------- media library: search, sort, grid/list, multi-select, context menu ---------- */
const binSel = new Set();
let binAnchor = null, focusZone = 'tl';
let binView = (() => { try { return localStorage.getItem('kadr.binView') || 'grid'; } catch { return 'grid'; } })();
function binOrder() {
  const q = $('#binQ').value.trim().toLowerCase(), by = $('#binSort').value;
  const cmp = {
    added: (a, b) => num(b[1].added, 0) - num(a[1].added, 0),
    name: (a, b) => a[1].name.localeCompare(b[1].name),
    dur: (a, b) => num(b[1].dur, 0) - num(a[1].dur, 0),
    kind: (a, b) => a[1].kind.localeCompare(b[1].kind) || a[1].name.localeCompare(b[1].name),
  }[by];
  return Object.entries(P.media).filter(([, m]) => !q || m.name.toLowerCase().includes(q)).sort(cmp).map(([id]) => id);
}
function renderBin() {
  for (const id of binSel) if (!P.media[id]) binSel.delete(id);
  const used = new Set(P.items.map(i => i.media));
  $('#binList').className = binView;
  $('#binView').innerHTML = icon(binView === 'grid' ? 'list' : 'layout-grid');
  $('#binList').innerHTML = binOrder().map(id => {
    const m = P.media[id], url = esc(urlOf(m));
    const th = m.kind === 'video' ? `<video src="${url}#t=0.5" muted preload="metadata"></video>`
      : m.kind === 'image' ? `<img src="${url}">` : icon('music');
    return `<div class="mi${binSel.has(id) ? ' sel' : ''}" data-mid="${id}" title="${esc(m.path)}"><div class="th">${th}<span class="du">${m.dur ? fmt(m.dur) : tr('image')}</span>${used.has(id) ? `<span class="used" title="${tr('inUse')}">${icon('check')}</span>` : ''}<button class="del" data-del title="${tr('del')}">${icon('trash-2')}</button></div><div class="nm">${esc(m.name)}</div></div>`;
  }).join('');
  $('#binAll').innerHTML = icon('check');
  paintBinSel();
}
function paintBinSel() {
  $$('#binList .mi').forEach(el => el.classList.toggle('sel', binSel.has(el.dataset.mid)));
  const n = binSel.size, b = $('#binDel');
  b.hidden = !n;
  b.innerHTML = `${icon('trash-2')}<span>${n > 1 ? n : ''}</span>`;
  b.title = n > 1 ? tr('delN', { n }) : tr('del');
}
$('#binAll').onclick = () => { focusZone = 'bin'; binOrder().forEach(id => binSel.add(id)); paintBinSel(); };
$('#binDel').onclick = () => deleteMedia(picked());
function binPick(mid, e) {
  focusZone = 'bin';
  if (e.shiftKey && binAnchor) {
    const o = binOrder(), a = o.indexOf(binAnchor), b = o.indexOf(mid);
    if (!(e.metaKey || e.ctrlKey)) binSel.clear();
    o.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => binSel.add(x));
  } else if (e.metaKey || e.ctrlKey) {
    binSel.has(mid) ? binSel.delete(mid) : binSel.add(mid);
    binAnchor = mid;
  } else {
    if (!binSel.has(mid)) { binSel.clear(); binSel.add(mid); }
    binAnchor = mid;
  }
  paintBinSel();
}
const picked = () => binOrder().filter(id => binSel.has(id));
// Adds clips one after another on a track, starting at `start` (end of the track when null).
function addMany(mids, track, start) {
  let at = start, last;
  for (const mid of mids) { last = addMedia(mid, track, at); at = last.start + last.dur; track = last.track; }
}
$('#binQ').addEventListener('input', renderBin);
$('#binSort').addEventListener('change', renderBin);
$('#binView').onclick = () => { binView = binView === 'grid' ? 'list' : 'grid'; try { localStorage.setItem('kadr.binView', binView); } catch {} renderBin(); };
// Pointer drag from the bin (HTML5 drag-and-drop is off on Windows while native file drop is on).
$('#binList').addEventListener('pointerdown', e => {
  const mi = e.target.closest('.mi');
  if (e.target.closest('[data-del]')) { e.stopPropagation(); return deleteMedia([mi.dataset.mid]); }
  if (!mi) { focusZone = 'bin'; if (e.button === 0) binMarquee(e); return; }
  if (e.button !== 0) return;
  const mid = mi.dataset.mid, x0 = e.clientX, y0 = e.clientY, ghost = $('#ghost');
  const wasSel = binSel.has(mid) && !e.shiftKey && !(e.metaKey || e.ctrlKey);
  if (!wasSel) binPick(mid, e); else focusZone = 'bin';
  let dragging = false;
  const mv = ev => {
    if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    dragging = true;
    const n = binSel.size;
    ghost.hidden = false;
    ghost.textContent = n > 1 ? tr('nClips', { n }) : P.media[mid].name;
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
    if (!dragging) { if (wasSel) { binSel.clear(); binPick(mid, ev); } return; }
    const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.row');
    if (row) addMany(picked(), row.dataset.track, snap1(Math.max(0, timeAt(ev.clientX)), snapPoints(null)));
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up, { once: true });
});
// Drag on empty space: rubber-band select (adds to the selection with ⌘/shift).
function binMarquee(e) {
  const list = $('#binList'), keep = e.metaKey || e.ctrlKey || e.shiftKey, base = keep ? new Set(binSel) : new Set();
  if (!keep) binSel.clear();
  paintBinSel();
  const box = list.appendChild(Object.assign(document.createElement('div'), { className: 'marq' }));
  const x0 = e.clientX, y0 = e.clientY;
  const mv = ev => {
    const l = Math.min(x0, ev.clientX), r = Math.max(x0, ev.clientX), t = Math.min(y0, ev.clientY), b = Math.max(y0, ev.clientY), L = list.getBoundingClientRect();
    Object.assign(box.style, { left: l - L.left + list.scrollLeft + 'px', top: t - L.top + list.scrollTop + 'px', width: r - l + 'px', height: b - t + 'px' });
    binSel.clear(); base.forEach(id => binSel.add(id));
    for (const el of list.querySelectorAll('.mi')) {
      const q = el.getBoundingClientRect();
      if (q.right > l && q.left < r && q.bottom > t && q.top < b) binSel.add(el.dataset.mid);
    }
    paintBinSel();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); box.parentNode.removeChild(box); }, { once: true });
}
$('#binList').addEventListener('dblclick', e => { if (e.target.closest('.mi')) addMany(picked()); });
$('#binList').addEventListener('contextmenu', e => {
  e.preventDefault();
  const mi = e.target.closest('.mi');
  if (!mi) return ctxMenu(e, [['import', importMedia]]);
  if (!binSel.has(mi.dataset.mid)) { binSel.clear(); binPick(mi.dataset.mid, {}); }
  const ids = picked(), one = ids.length === 1 && P.media[ids[0]];
  ctxMenu(e, [
    ['addToTl', () => addMany(ids)],
    one && ['rename', () => renameMedia(ids[0])],
    one && ['revealFinder', () => TA.opener.revealItemInDir(one.path)],
    ['-'],
    [ids.length > 1 ? tr('delN', { n: ids.length }) : 'del', () => deleteMedia(ids), 'danger'],
  ]);
});
async function deleteMedia(ids) {
  if (!ids.length) return;
  const uses = P.items.filter(i => ids.includes(i.media)).length;
  if (uses && !(await TA.dialog.ask(tr('delUsed', { n: uses }), { kind: 'warning' }))) return;
  snapshot();
  for (const id of ids) delete P.media[id];
  P.items = P.items.filter(i => !ids.includes(i.media));
  if (sel && !item(sel)) sel = null;
  binSel.clear();
  refresh();
}
async function renameMedia(id) {
  const name = await askText(tr('rename'), P.media[id].name);
  if (!name || name === P.media[id].name) return;
  snapshot();
  P.media[id].name = name;
  refresh();
}
function askText(title, value) {
  return new Promise(res => {
    $('#modal').hidden = false;
    $('#mBox').innerHTML = `<h3>${esc(title)}</h3><input id="mText" value="${esc(value)}"><div class="acts"><button id="mNo">${tr('cancel')}</button><button class="primary" id="mOk">${tr('ok')}</button></div>`;
    const inp = $('#mText'), done = v => { hideModal(); res(v); };
    inp.select();
    $('#mOk').onclick = () => done(inp.value.trim());
    $('#mNo').onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); else if (e.key === 'Escape') done(null); };
  });
}
// Right-click menu. items: [labelKeyOrText, run, 'danger'?] | ['-'] | falsy (skipped)
function ctxMenu(e, items) {
  const m = $('#ctx');
  m.innerHTML = items.filter(Boolean).map((x, i) => x[0] === '-' ? '<hr>' : `<button data-i="${i}" class="${x[2] || ''}">${esc(tr(x[0]))}</button>`).join('');
  const list = items.filter(Boolean);
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(e.clientX, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(e.clientY, innerHeight - r.height - 6) + 'px';
  m.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; m.hidden = true; list[+b.dataset.i][1](); };
  setTimeout(() => window.addEventListener('pointerdown', ev => { if (!m.contains(ev.target)) m.hidden = true; }, { once: true }));
}
$('#rows').addEventListener('pointerdown', () => (focusZone = 'tl'), true);
$('#rows').addEventListener('contextmenu', e => {
  e.preventDefault();
  const c = e.target.closest('.clip');
  if (!c) return ctxMenu(e, [['k_paste', pasteClip], ['marker', addMarker]]);
  select(c.dataset.id);
  const it = item(c.dataset.id), vid = !isText(it) && media(it).kind === 'video';
  ctxMenu(e, [['split', () => splitAt()], ['k_copy', copySel], ['k_cut', cutSel], ['k_paste', pasteClip], ['dup', duplicateSel],
    vid && ['freeze', freezeFrame], !isText(it) && media(it).kind !== 'audio' && ['rotate90', rotateSel], ['-'], ['del', removeSel, 'danger']]);
});

/* ---------- freeze frame & rotate ---------- */
async function freezeFrame() {
  const cur = sel && item(sel);
  const it = cur && !isText(cur) && media(cur).kind === 'video' && active(cur, t) ? cur
    : P.items.find(i => i.track === 'v1' && active(i, t) && media(i).kind === 'video');
  if (!it) return toast(tr('freezeHint'));
  setPlaying(false);
  const el = elFor(it), want = num(it.in, 0) + S.srcAt(it, t - it.start);
  if (Math.abs(el.currentTime - want) > 0.02 || el.readyState < 2) {
    await new Promise(r => { el.addEventListener('seeked', r, { once: true }); el.currentTime = want; setTimeout(r, 1500); });
  }
  const c = document.createElement('canvas');
  c.width = el.videoWidth; c.height = el.videoHeight;
  c.getContext('2d').drawImage(el, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  let mid;
  try {
    const path = await inv('save_recording', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-ext': 'png' } });
    [mid] = addToBin(await inv('probe', { paths: [path] }));
  } catch (e) { return toast(tr('error') + ': ' + cleanErr(e)); }
  if (!mid) return;
  snapshot();
  const len = 3, cut = t - it.start;
  if (cut > 1 / P.fps && it.dur - cut > 1 / P.fps) splitItems([it]);
  const fr = JSON.parse(JSON.stringify(it));
  Object.assign(fr, { id: uid(), media: mid, start: t, dur: len, in: 0, speed: 1, fadeIn: 0, fadeOut: 0, volume: 0 });
  delete fr.words;
  if (it.track === 'v1' && magnet) fr.start = t - 1e-4; // sorts before the second half when the main track packs
  else for (const x of P.items) if (x.track === it.track && x.start >= t - 1e-6) x.start += len;
  P.items.push(fr);
  sel = fr.id;
  refresh();
}
function rotateSel() {
  const it = sel && item(sel);
  if (!it || isText(it) || media(it).kind === 'audio') return;
  snapshot();
  const r = num(it.rotate, 0) + 90;
  it.rotate = r > 180 ? r - 360 : r;
  refresh();
}
function addToBin(res) {
  const added = [];
  for (const m of res.ok) {
    const have = Object.entries(P.media).find(([, x]) => x.path === m.path);
    if (have) { added.push(have[0]); continue; }
    const id = uid();
    P.media[id] = { ...m, added: Date.now() };
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

function cardCanvas(paint, w = 240, h = 180) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.scale(w / 240, h / 180);
  paint(ctx);
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
    const fake = { text: LANG === 'ar' ? 'كادر' : 'Kadr', style: { ...presetStyle(s.id), size: 46, strokeW: (s.s.strokeW || 0) * 0.45, shadowBlur: 8, shadowDist: 5, glowSize: 16 }, x: 0.5, y: 0.5, dur: 9 };
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
/* ---------- updates: auto (download quietly, install on restart or quit) or manual (button only) ---------- */
const updMode = {
  get() { try { return localStorage.getItem('kadr.updMode') || 'auto'; } catch { return 'auto'; } },
  set(v) { try { localStorage.setItem('kadr.updMode', v); } catch {} },
};
let updReady = null; // downloaded, waiting to be installed
const updLog = e => inv('dev_log', { msg: 'update: ' + e });
async function autoUpdate() {
  if (!TA.updater || updMode.get() !== 'auto') return;
  try {
    const u = await TA.updater.check();
    if (!u) return;
    await u.download();
    updReady = u;
    $('#bUpd').classList.add('dot');
    toast(tr('updReady', { v: u.version }), { label: tr('updRestart'), run: installNow });
  } catch (e) { updLog(e); } // offline or no release yet
}
async function installNow() {
  if (!updReady) return;
  if (dirty && (await TA.dialog.ask(tr('updSaveFirst'), { title: tr('updates'), kind: 'warning' }))) { await save(); if (dirty) return; }
  setPlaying(false);
  progress(tr('p_install'), null);
  try { await updReady.install(); await TA.process.relaunch(); } catch (e) { hideModal(); toast(String(e)); }
}
// Quitting with an update downloaded installs it on the way out.
async function quitNow() {
  if (updReady) { progress(tr('p_install'), null); try { await updReady.install(); } catch (e) { updLog(e); } }
  inv('quit_app');
}
async function updateDialog() {
  const cur = TA.app ? await TA.app.getVersion().catch(() => '') : '';
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<div class="upd"><h3>${tr('updates')}</h3><p class="hint">${tr('curVer')} <bdi>v${esc(cur)} ${tr('beta')}</bdi></p>
    <div id="uState" class="ustate"></div>
    <div class="umode"><div class="gh">${tr('updHow')}</div>
      ${['auto', 'manual'].map(m => `<label class="uopt"><input type="radio" name="um" value="${m}"${updMode.get() === m ? ' checked' : ''}><span><b>${tr('upd_' + m)}</b><small>${tr('upd_' + m + 'Hint')}</small></span></label>`).join('')}</div>
    <div class="acts"><button id="uCheck">${icon('refresh-cw')}${tr('updCheck')}</button><span class="flex"></span><button id="uClose">${tr('close')}</button><button class="primary" id="uGo" hidden></button></div></div>`;
  paintIcons($('#mBox'));
  $('#mBox').querySelectorAll('[name="um"]').forEach(r => (r.onchange = () => updMode.set(r.value)));
  $('#uClose').onclick = hideModal;
  const st = $('#uState'), go = $('#uGo');
  const show = (html, btn, run) => { st.innerHTML = html; go.hidden = !btn; if (btn) { go.textContent = btn; go.disabled = false; go.onclick = run; } };
  const chk = $('#uCheck');
  chk.onclick = () => check();
  if (updReady) return show(`<p>${tr('updReady', { v: esc(updReady.version) })}</p>`, tr('updRestart'), installNow);
  check();
  // "Check for updates" button: asks the update server now, every time it is pressed
  async function check() {
  chk.disabled = true; chk.classList.add('busy');
  show(`<p class="hint">${tr('updChecking')}</p>`);
  if (!TA.updater) { chk.disabled = false; chk.classList.remove('busy'); return show(`<p class="hint">${tr('updNoUpdater')}</p>`); }
  let u;
  try { u = await TA.updater.check(); } catch (e) { updLog(e); u = false; }
  if (!$('#uCheck')) return; // dialog closed meanwhile
  chk.disabled = false; chk.classList.remove('busy');
  const when = `<small class="uwhen">${tr('updLast')} ${new Date().toLocaleTimeString(LANG === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' })}</small>`;
  if (u === false) return show(`<p>${tr('updOffline')}</p>${when}`);
  if (!u) return show(`<p class="ok">${icon('check')} ${tr('updLatest')}</p>${when}`);
  const notes = u.body ? `<p class="hint unotes">${esc(u.body)}</p>` : '';
  show(`<p><b>${tr('updNew', { v: esc(u.version) })}</b></p>${notes}`, tr('updGet'), async () => {
    go.disabled = true;
    let total = 0, got = 0;
    st.insertAdjacentHTML('beforeend', `<div class="pbar"><i id="uBar"></i></div>`);
    try {
      await u.download(ev => {
        if (ev.event === 'Started') total = ev.data.contentLength || 0;
        else if (ev.event === 'Progress') { got += ev.data.chunkLength; if (total) $('#uBar').style.width = Math.round(got / total * 100) + '%'; }
      });
      updReady = u;
      $('#bUpd').classList.add('dot');
      installNow();
    } catch (e) { updLog(e); show(`<p>${tr('updFailed')}</p>`, tr('retry'), updateDialog); }
  });
  }
}
$('#bUpd').onclick = updateDialog;
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
    const key = vis.map(it => { const s = textState(it, time - it.start); return it.id + (s.anim || it.trk || S.hasKf(it) ? 'a' + f : 'w' + s.word); }).join('|');
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
/* ---------- new project / welcome ---------- */
const FORMATS = [ // [ratio, label key, platforms]
  ['9:16', 'f_vertical', 'TikTok · Reels · Shorts'], ['16:9', 'f_wide', 'YouTube'], ['1:1', 'f_square', 'Instagram · Facebook'],
  ['4:5', 'f_portrait', 'Instagram'], ['4:3', 'f_classic', 'TV · iPad'], ['3:4', 'f_classicV', 'Pinterest'], ['21:9', 'f_cinema', 'Cinema'],
];
function dimsFor(ratio) { // short side 1080, even numbers
  const [a, b] = ratio.split(':').map(Number), even = v => Math.round(v / 2) * 2;
  return a >= b ? [even(1080 * a / b), 1080] : [1080, even(1080 * b / a)];
}
const recent = {
  get() { try { return JSON.parse(localStorage.getItem('kadr.recent') || '[]'); } catch { return []; } },
  add(f) { try { localStorage.setItem('kadr.recent', JSON.stringify([f, ...recent.get().filter(x => x !== f)].slice(0, 8))); } catch {} },
};
async function newProj(welcome) {
  if (!welcome && dirty && !(await TA.dialog.ask(tr('unsaved'), { kind: 'warning' }))) return;
  setPlaying(false);
  let ratio = '9:16', fps = 30, res = 1080;
  const rec = welcome ? recent.get() : [];
  const shape = r => { const [a, b] = r.split(':').map(Number), k = 30 / Math.max(a, b); return `<i class="shape" style="width:${a * k}px;height:${b * k}px"></i>`; };
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<div class="npx">
    <div class="np-head"><h3>${tr(welcome ? 'welcome' : 'k_new')}</h3>${welcome ? `<p class="hint">${tr('welcomeSub')}</p>` : ''}</div>
    <div class="np-grid">${FORMATS.map(([r, k, pl]) => `<button class="fmt${r === ratio ? ' on' : ''}" data-r="${r}">${shape(r)}<b>${r}</b><span>${tr(k)}</span><small>${pl}</small></button>`).join('')}
      <button class="fmt" data-r="custom"><i class="shape dash" style="width:26px;height:26px"></i><b>${tr('custom')}</b><span dir="ltr"><input id="npW" type="number" value="1080" min="16" max="8192"> × <input id="npH" type="number" value="1920" min="16" max="8192"></span></button></div>
    <div class="np-row">
      <label class="f"><span>${tr('np_name')}</span><input id="npName" value="${esc(tr('untitled'))}"></label>
      <label class="f"><span>${tr('resolution')}</span><select id="npRes">${RES.map(([n, v]) => `<option value="${v}"${v === res ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f"><span>${tr('fps')}</span><select id="npFps">${[24, 25, 30, 50, 60].map(f => `<option${f === fps ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
    </div>
    ${rec.length ? `<div class="np-recent"><h4>${tr('recent')}</h4>${rec.map((f, i) => `<button data-rec="${i}"><b>${esc(f.split(/[\\/]/).pop().replace(/\.kadr$/, ''))}</b><small>${esc(f)}</small></button>`).join('')}</div>` : ''}
    <div class="acts">${welcome ? `<button id="npOpen">${tr('open')}…</button>` : ''}<span class="flex"></span><button id="npNo">${tr(welcome ? 'skip' : 'cancel')}</button><button class="primary" id="npGo">${tr('create')}</button></div></div>`;
  $('#mBox').onclick = e => {
    const b = e.target.closest('.fmt');
    if (b) { ratio = b.dataset.r; $$('.fmt').forEach(x => x.classList.toggle('on', x === b)); }
    const r = e.target.closest('[data-rec]');
    if (r) { hideModal(); openPath(rec[+r.dataset.rec]); }
  };
  $('#npNo').onclick = hideModal;
  if ($('#npOpen')) $('#npOpen').onclick = () => { hideModal(); open(); };
  $('#npGo').onclick = () => {
    let w, h;
    if (ratio === 'custom') { const e = v => Math.max(16, Math.round(clamp(+v || 1080, 16, 8192) / 2) * 2); w = e($('#npW').value); h = e($('#npH').value); }
    else [w, h] = dimsFor(ratio);
    hideModal();
    P = Object.assign(newProject(), { w, h, fps: +$('#npFps').value, res: +$('#npRes').value, name: $('#npName').value.trim() || tr('untitled') });
    projectPath = null; sel = null; t = 0; dirty = false;
    lastAuto = JSON.stringify(P); clearRecovery();
    undoStack.length = redoStack.length = 0;
    binSel.clear();
    syncSettings();
    refresh();
  };
}

/* ---------- export ---------- */
const QUALITY = [['low', 'q_low'], ['rec', 'q_rec'], ['high', 'q_high']];
const pref = (k, d) => { try { return localStorage.getItem('kadr.x.' + k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('kadr.x.' + k, v); } catch {} };
async function exportDialog() {
  if (!total()) return toast(tr('emptyTl'));
  setPlaying(false);
  const short = Math.min(P.w, P.h);
  let dir = pref('dir', '');
  if (!dir) try { dir = await TA.path.desktopDir(); } catch {}
  const cover = document.createElement('canvas');
  cover.width = 360; cover.height = Math.round(360 * P.h / P.w);
  cover.getContext('2d').drawImage(view, 0, 0, cover.width, cover.height);
  const res0 = +pref('res', P.res || short), base = projectPath ? projectPath.split(/[\\/]/).pop().replace(/\.kadr$/, '') : (P.name || 'kadr-export');
  const opt = (id, list, v) => `<select id="${id}">${list.map(([val, n]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<div class="xp">
    <div class="xp-cover"></div>
    <div class="xp-form">
      <h3>${tr('exportTitle')}</h3>
      <label class="xr"><span>${tr('np_name')}</span><input id="xName" value="${esc(base)}"></label>
      <div class="xr"><span>${tr('exportTo')}</span><div class="xdir"><input id="xDir" value="${esc(dir)}" readonly><button class="ib" id="xPick" data-i="folder-open"></button></div></div>
      <label class="xsec"><input type="checkbox" id="xVid" checked> <b>${tr('video')}</b></label>
      <div id="xVidBox">
        <label class="xr"><span>${tr('resolution')}</span>${opt('xRes', RES.map(([n, v]) => [v, n]), RES.some(r => r[1] === res0) ? res0 : 1080)}</label>
        <label class="xr"><span>${tr('bitrate')}</span>${opt('xQ', QUALITY.map(([v, k]) => [v, tr(k)]), pref('q', 'rec'))}</label>
        <label class="xr"><span>${tr('codec')}</span>${opt('xCodec', [['h264', 'H.264'], ['hevc', 'HEVC / H.265'], ['prores', 'ProRes 422']], pref('codec', 'h264'))}</label>
        <label class="xr"><span>${tr('format')}</span>${opt('xFmt', [['mp4', 'mp4'], ['mov', 'mov']], pref('fmt', 'mp4'))}</label>
        <label class="xr"><span>${tr('fps')}</span>${opt('xFps', [24, 25, 30, 50, 60].map(f => [f, f + 'fps']), P.fps)}</label>
        ${IS_MAC ? `<label class="xr"><span>${tr('hw')}</span><input type="checkbox" id="xHw"${pref('hw', '1') === '1' ? ' checked' : ''}></label>` : ''}
      </div>
      <label class="xsec"><input type="checkbox" id="xAud"${pref('aud', '0') === '1' ? ' checked' : ''}> <b>${tr('audioFile')}</b></label>
      <div id="xAudBox"><label class="xr"><span>${tr('format')}</span>${opt('xAFmt', [['mp3', 'MP3'], ['wav', 'WAV'], ['m4a', 'AAC (m4a)']], pref('afmt', 'mp3'))}</label></div>
    </div>
    <div class="xp-foot"><span id="xInfo"></span><span class="flex"></span><button id="xNo">${tr('cancel')}</button><button class="primary" id="xGo">${tr('exportGo')}</button></div></div>`;
  $('.xp-cover').appendChild(cover);
  paintIcons($('#mBox'));
  const sync = () => {
    const vid = $('#xVid').checked, aud = $('#xAud').checked, pr = $('#xCodec').value === 'prores';
    $('#xVidBox').classList.toggle('off', !vid);
    $('#xAudBox').classList.toggle('off', !aud);
    if (pr) $('#xFmt').value = 'mov';
    $('#xFmt').disabled = pr;
    if ($('#xHw')) $('#xHw').disabled = pr;
    const sh = +$('#xRes').value, area = sh * sh * Math.max(P.w, P.h) / Math.min(P.w, P.h), fps = +$('#xFps').value;
    const q = { low: 0.6, rec: 1, high: 1.8 }[$('#xQ').value], codec = $('#xCodec').value;
    const mbps = codec === 'prores' ? 147 * area / (1920 * 1080) * fps / 30 : 8 * q * area / (1920 * 1080) * fps / 30 * (codec === 'hevc' ? 0.6 : 1);
    const mb = total() * ((vid ? mbps : 0) + (aud ? ($('#xAFmt').value === 'wav' ? 1.536 : 0.192) : 0) + (vid ? 0.192 : 0)) / 8;
    $('#xInfo').innerHTML = `${tr('duration')}: <bdi>${fmt(total())}</bdi> · ${tr('size')}: <bdi>~${mb < 1000 ? Math.max(1, Math.round(mb)) + ' MB' : (mb / 1000).toFixed(1) + ' GB'}</bdi>`;
    $('#xGo').disabled = !vid && !aud;
  };
  $('#mBox').onchange = sync;
  sync();
  $('#xPick').onclick = async () => { const d = await TA.dialog.open({ directory: true, defaultPath: $('#xDir').value || undefined }); if (d) $('#xDir').value = d; };
  $('#xNo').onclick = hideModal;
  $('#xGo').onclick = async () => {
    const name = $('#xName').value.trim().replace(/[\\/:*?"<>|]/g, '-') || 'kadr-export', d = $('#xDir').value;
    if (!d) return toast(tr('pickFolder'));
    const sep = d.includes('\\') ? '\\' : '/', at = ext => d.replace(/[\\/]$/, '') + sep + name + '.' + ext;
    const vid = $('#xVid').checked, aud = $('#xAud').checked, codecSel = $('#xCodec').value;
    const o = {
      k: +$('#xRes').value / short, fps: +$('#xFps').value, quality: $('#xQ').value,
      codec: codecSel + (codecSel !== 'prores' && $('#xHw') && $('#xHw').checked ? '_hw' : ''),
      video: vid && at(codecSel === 'prores' ? 'mov' : $('#xFmt').value), audio: aud && at($('#xAFmt').value),
    };
    Object.entries({ dir: d, res: $('#xRes').value, q: o.quality, codec: codecSel, fmt: $('#xFmt').value, hw: $('#xHw')?.checked ? '1' : '0', aud: aud ? '1' : '0', afmt: $('#xAFmt').value })
      .forEach(([k, v]) => setPref(k, v));
    const exists = (await Promise.all([o.video, o.audio].filter(Boolean).map(f => inv('path_exists', { path: f })))).some(Boolean);
    if (exists && !(await TA.dialog.ask(tr('overwrite'), { kind: 'warning' }))) return;
    hideModal();
    doExport(o);
  };
}
async function doExport(o) {
  if (typeof o === 'number') o = { k: o, fps: arguments[1], codec: arguments[2], video: arguments[3], quality: 'rec' }; // dev demo form
  cancelled = false;
  let work = null;
  try {
    if (o.video) {
      progress(tr('p_texts'), 0);
      const Q = S.scaleProject(P, o.k);
      Q.fps = o.fps;
      work = await inv('work_begin');
      const list = await rasterizeTexts(Q, work);
      const { args, duration } = G.buildArgs(Q, { out: o.video, textList: list ? work.path + '/text.ffconcat' : null, codec: o.codec, quality: o.quality });
      progress(tr('p_export'), 0);
      await inv('export_run', { id: work.id, args, concat: list ? G.concatText(list, o.fps) : null, duration });
      work = null;
    }
    if (o.audio && !cancelled) {
      progress(tr('p_audioExport'), 0);
      work = await inv('work_begin');
      const { args, duration } = G.buildArgs(P, { out: o.audio, audioExport: o.audio.split('.').pop() });
      await inv('export_run', { id: work.id, args, concat: null, duration });
      work = null;
    }
    hideModal();
    const out = o.video || o.audio;
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
  const ar = Object.keys(ASPECTS).find(k => ASPECTS[k][0] === P.w && ASPECTS[k][1] === P.h);
  $('#aspect').innerHTML = Object.keys(ASPECTS).map(r => `<option>${r}</option>`).join('') + (ar ? '' : `<option value="custom">${P.w}×${P.h}</option>`);
  $('#aspect').value = ar || 'custom';
  renderBin();
}
async function save(as) {
  let f = as ? null : projectPath;
  if (!f) f = await TA.dialog.save({ defaultPath: (P.name || (LANG === 'ar' ? 'مشروع' : 'project')) + '.kadr', filters: [{ name: 'Kadr', extensions: ['kadr'] }] });
  if (!f) return;
  if (!f.endsWith('.kadr')) f += '.kadr';
  try { await inv('save_project', { path: f, json: JSON.stringify(P) }); } catch (e) { return toast(tr('error') + ': ' + cleanErr(e)); }
  projectPath = f;
  recent.add(f);
  dirty = false;
  lastAuto = JSON.stringify(P);
  clearRecovery();
  refresh();
  toast(tr('saved'));
}
// Autosave: a project with a file is written to it ~2s after each change; untitled work goes to a
// recovery file that reopens on the next launch (crash, force quit, power cut).
let lastAuto = '', recPath = null, autoBusy = false;
const clearRecovery = () => lsSet('kadr.recovery', 0);
async function autosave() {
  if (!MEDIA_BASE || autoBusy) return;
  const js = JSON.stringify(P);
  if (js === lastAuto) return;
  if (!projectPath && !P.items.length && !Object.keys(P.media).length) return;
  autoBusy = true;
  try {
    if (projectPath) {
      await inv('save_project', { path: projectPath, json: js });
      if (JSON.stringify(P) === js) { dirty = false; $('#pname').textContent = $('#pname').textContent.replace(/ •$/, ''); }
    } else {
      recPath = recPath || await inv('recovery_path');
      await inv('save_project', { path: recPath, json: js });
      lsSet('kadr.recovery', 1);
    }
    lastAuto = js;
  } catch (e) { /* try again on the next tick */ } finally { autoBusy = false; }
}
setInterval(autosave, 2000);
async function restoreRecovery() {
  if (!lsGet('kadr.recovery', 0)) return false;
  try {
    const r = await inv('open_project', { path: await inv('recovery_path') });
    P = Object.assign(newProject(), r.project);
  } catch { clearRecovery(); return false; }
  projectPath = null; sel = null; t = 0; dirty = true;
  lastAuto = JSON.stringify(P);
  undoStack.length = redoStack.length = 0;
  syncSettings();
  refresh();
  toast(tr('recovered'));
  return true;
}
async function open() {
  if (dirty && !(await TA.dialog.ask(tr('unsaved'), { kind: 'warning' }))) return;
  const f = await TA.dialog.open({ filters: [{ name: 'Kadr', extensions: ['kadr'] }] });
  if (f) openPath(f, true);
}
async function openPath(f, asked) {
  if (!asked && dirty && !(await TA.dialog.ask(tr('unsaved'), { kind: 'warning' }))) return;
  let r;
  try { r = await inv('open_project', { path: f }); } catch (e) { return toast(tr('error') + ': ' + cleanErr(e)); }
  setPlaying(false);
  P = Object.assign(newProject(), r.project);
  projectPath = f;
  recent.add(f);
  sel = null; t = 0; dirty = false;
  lastAuto = JSON.stringify(P); clearRecovery();
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

$('#aspect').onchange = e => { if (!ASPECTS[e.target.value]) return; snapshot(); [P.w, P.h] = ASPECTS[e.target.value]; syncSettings(); refresh(); };
$('#bImport').onclick = importMedia;
$('#bText').onclick = () => addText('plain');
$('#bCaps').onclick = autoCaptions;
$('#bExport').onclick = exportDialog;
$('#bSave').onclick = e => save(e.shiftKey);
$('#bOpen').onclick = open;
$('#bNew').onclick = () => newProj();
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
$('#bRotate').onclick = rotateSel;
$('#bFreeze').onclick = freezeFrame;
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
$('#bLang').onclick = () => { LANG = LANG === 'ar' ? 'en' : 'ar'; applyLang(); renderLibCards(); refresh(); requestAnimationFrame(placeSplits); };

/* ---------- keyboard: CapCut-style keymap. One table drives the keys, the tooltips and the shortcuts sheet ---------- */
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
let clipBoard = null;
function copySel() { const it = sel && item(sel); if (it) clipBoard = JSON.parse(JSON.stringify(it)); }
function cutSel() { copySel(); removeSel(); }
function pasteClip() {
  if (!clipBoard || (clipBoard.media && !P.media[clipBoard.media])) return;
  snapshot();
  const b = { ...JSON.parse(JSON.stringify(clipBoard)), id: uid(), start: t };
  const c = b.track === 'v1' && magnet && P.items.find(i => i.track === 'v1' && active(i, t));
  if (c) b.start = t - c.start > c.dur / 2 ? c.start + c.dur - 1e-4 : c.start - 1e-4; // land on the nearest cut
  P.items.push(b);
  sel = b.id;
  refresh();
}
function selectStep(dir) {
  const cur = sel && item(sel), track = cur ? cur.track : 'v1';
  const row = P.items.filter(i => i.track === track).sort((a, b) => a.start - b.start);
  const k = cur ? row.indexOf(cur) + dir : dir < 0 ? row.findLastIndex(i => i.start < t) : row.findIndex(i => i.start + i.dur > t);
  if (row[k]) { select(row[k].id); seek(row[k].start); }
}
function jumpCut(dir) {
  const eps = 0.5 / P.fps, pts = [0, total(), ...(P.markers || []), ...P.items.flatMap(i => [i.start, i.start + i.dur])];
  const next = dir > 0 ? Math.min(...pts.filter(p => p > t + eps)) : Math.max(...pts.filter(p => p < t - eps));
  if (isFinite(next)) seek(next);
}
const frameDur = () => 1 / P.fps;
const KEYMAP = [
  ['g_file', [
    [['mod+n'], 'k_new', () => newProj()], [['mod+o'], 'open', open], [['mod+s'], 'save', () => save()],
    [['mod+shift+s'], 'k_saveAs', () => save(true)], [['mod+i'], 'import', importMedia], [['mod+e'], 'export', exportDialog]]],
  ['g_edit', [
    [['mod+z'], 'undo', () => restore(undoStack, redoStack)], [['mod+shift+z', 'mod+y'], 'redo', () => restore(redoStack, undoStack)],
    [['mod+c'], 'k_copy', copySel], [['mod+x'], 'k_cut', cutSel], [['mod+v'], 'k_paste', pasteClip],
    [['mod+d'], 'dup', duplicateSel], [['delete'], 'del', () => (focusZone === 'bin' && binSel.size ? deleteMedia(picked()) : removeSel())], [['esc'], 'k_deselect', () => { select(null); binSel.clear(); paintBinSel(); }], [['mod+a'], 'k_selAllMedia', () => {
      if (focusZone === 'tl' && P.items.length) { msel.clear(); P.items.forEach(i => msel.add(i.id)); if (!isSel(sel)) sel = P.items[0].id; if (msel.size < 2) msel.clear(); paintSel(); inspector(); return; }
      binOrder().forEach(x => binSel.add(x)); paintBinSel(); focusZone = 'bin';
    }]]],
  ['g_timeline', [
    [['c', 'mod+b', 's'], 'split', () => splitAt()], [['mod+shift+b'], 'k_splitAll', () => splitAt(true)],
    [['q'], 'delLeft', () => trimTo('left')], [['w'], 'delRight', () => trimTo('right')],
    [['v'], 'select', () => setTool('select')], [['b'], 'blade', () => setTool('blade')],
    [['['], 'k_selPrev', () => selectStep(-1)], [[']'], 'k_selNext', () => selectStep(1)],
    [['p'], 'magnet', () => $('#bMagnet').click()], [['n'], 'snap', () => $('#bSnap').click()], [['m'], 'marker', addMarker], [['alt+shift+f'], 'freeze', freezeFrame], [['alt+r'], 'rotate90', rotateSel],
    [['mod+='], 'zoomIn', () => setZoom(pps * 1.4)], [['mod+-'], 'zoomOut', () => setZoom(pps / 1.4)],
    [['mod+0', 'shift+z'], 'fit', () => $('#bFit').click()]]],
  ['g_player', [
    [['space'], 'k_play', () => setPlaying(!playing)], [['l'], 'play', () => setPlaying(true)], [['k'], 'k_pause', () => setPlaying(false)],
    [['j', 'shift+left'], 'k_back', () => { setPlaying(false); seek(t - 1); }], [['shift+right'], 'k_fwd', () => seek(t + 1)],
    [['left'], 'k_frames', () => seek(t - frameDur())], [['right'], 'k_frames', () => seek(t + frameDur())],
    [['up'], 'k_prevCut', () => jumpCut(-1)], [['down'], 'k_nextCut', () => jumpCut(1)],
    [['home'], 'k_start', () => seek(0)], [['end'], 'k_end', () => seek(total())]]],
  ['g_help', [[['shift+/', 'mod+/'], 'shortcuts', showKeys]]],
];
function fmtKey(spec) {
  if (spec === 'shift+/') return '?';
  const names = { mod: MAC ? '⌘' : 'Ctrl', shift: MAC ? '⇧' : 'Shift', alt: MAC ? '⌥' : 'Alt', space: 'Space', delete: 'Delete', esc: 'Esc',
    left: '←', right: '→', up: '↑', down: '↓', home: 'Home', end: 'End', '=': '+', '/': '/' };
  return spec.split('+').map(x => names[x] ?? x.toUpperCase()).join(MAC ? '' : '+');
}
const KEY_RUN = new Map(), KEY_HINT = {};
for (const [, rows] of KEYMAP) for (const [ks, label, run] of rows) { ks.forEach(k => KEY_RUN.set(k, run)); KEY_HINT[label] ??= fmtKey(ks[0]); }
// Physical key (e.code), so the shortcuts also work with an Arabic keyboard layout.
function keyCombo(e) {
  const c = e.code, named = { Space: 'space', BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Slash: '/', Delete: 'delete', Backspace: 'delete',
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end', Escape: 'esc', NumpadAdd: '=', NumpadSubtract: '-' };
  const k = c.startsWith('Key') ? c.slice(3).toLowerCase() : c.startsWith('Digit') ? c.slice(5) : named[c];
  return k && ((e.metaKey || e.ctrlKey) ? 'mod+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey ? 'shift+' : '') + k;
}
function showKeys() {
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<div class="ksheet"><h3>${tr('shortcuts')}</h3><div class="kcols">${KEYMAP.map(([g, rows]) => `<section><h4>${tr(g)}</h4>${rows.reduce((m, [ks, label]) => (m.at(-1)?.[1] === label ? m.at(-1)[0].push(...ks) : m.push([[...ks], label]), m), []).map(([ks, label]) =>
    `<div><span>${tr(label)}</span><span>${ks.map(k => `<kbd>${fmtKey(k)}</kbd>`).join(' ')}</span></div>`).join('')}</section>`).join('')}</div>
    <div class="acts"><button id="mClose">${tr('close')}</button></div></div>`;
  $('#mClose').onclick = hideModal;
}
$('#bKeys').onclick = showKeys;
// Window close / Cmd+Q: offer to save unsaved work first (Rust holds the close until quit_app).
let quitting = false;
TA.event.listen('quit-requested', async () => {
  if (quitting) return;
  await autosave();
  if (!dirty || !P.items.length && !Object.keys(P.media).length) return quitNow();
  quitting = true;
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<h3>${tr('quitTitle')}</h3><p class="hint">${tr('quitAsk')}</p><div class="acts"><button id="qNo">${tr('dontSave')}</button><span class="flex"></span><button id="qCancel">${tr('cancel')}</button><button class="primary" id="qSave">${tr('save')}</button></div>`;
  const done = () => { quitting = false; hideModal(); };
  $('#qCancel').onclick = done;
  $('#qNo').onclick = () => { clearRecovery(); quitNow(); };
  $('#qSave').onclick = async () => { done(); await save(); if (!dirty) quitNow(); };
});
window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (!$('#modal').hidden) { if (e.key === 'Escape' && $('#mBox .ksheet')) hideModal(); return; }
  const run = KEY_RUN.get(keyCombo(e));
  if (!run) return;
  e.preventDefault();
  run();
});

(async () => {
MEDIA_BASE = await inv('media_base');
inv('fonts_downloaded').then(m => { for (const [f, files] of Object.entries(m || {})) regFont(f, files); ensureFonts(); }).catch(() => {});
inv('system_fonts').then(v => { FontLib.sys = v || []; }).catch(() => {});
paintIcons();
applyLang();
setLibTab('media');
document.fonts.load('800 40px "Cairo"').then(renderLibCards);
// Bundled fonts load on first use; redraw (and re-paint template cards) once they arrive.
document.fonts.addEventListener('loadingdone', () => { needsDraw = true; if (inspTab === 'tTpl' && document.activeElement.tagName !== 'INPUT') inspector(); });
syncSettings();
refresh();
requestAnimationFrame(loop);
setTimeout(autoUpdate, 3000);

inv('dev_demo').then(async d => {
  if (!d.paths || !d.paths.length) return (await restoreRecovery()) || newProj(true);
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
