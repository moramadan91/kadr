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
const ACCENT = '#5cd3c6';
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
// Speed-curve clips preview from a small pre-retimed copy (proxy_render) played at 1x: changing
// playbackRate every frame makes WebKit stall. Until the copy is ready the original plays stepped.
const pxOk = new Map(), pxPath = new Map();
function pxKey(it) {
  const m = media(it);
  return JSON.stringify([m.path, num(it.in, 0), it.dur, it.curve, !!it.pitch, P.fps, smoothSlow(it) && num(it.speed, 1)]);
}
// smooth slow-mo previews from the proxy too: the export's motion-interpolated frames, made once
const smoothSlow = it => !!it.smooth && (S.hasCurve(it) ? it.curve.pts.some(p => p[1] < 1) : num(it.speed, 1) < 1);
function proxyFor(it) {
  if (!(S.hasCurve(it) || smoothSlow(it)) || media(it).kind !== 'video') return null;
  const key = pxKey(it);
  if (pxPath.has(key)) return pxPath.get(key);
  if (!pxOk.has(key)) {
    const m = media(it), k = Math.min(1, 960 / Math.max(m.w, m.h)), ev = v => Math.max(2, Math.round(v * k / 2) * 2);
    const q = { w: ev(m.w), h: ev(m.h), fps: P.fps, media: { m }, tracks: [{ id: 'v', kind: 'video' }],
      items: [{ id: 'x', track: 'v', media: 'm', start: 0, dur: it.dur, in: num(it.in, 0), curve: it.curve, speed: it.speed, smooth: it.smooth, pitch: it.pitch, fit: 'cover' }] };
    let args;
    try { args = G.buildArgs(q, { out: '__OUT__', codec: 'proxy' }).args.filter(a => a !== '-progress' && a !== 'pipe:1'); } catch { args = null; }
    pxOk.set(key, args ? inv('proxy_render', { args }).then(path => { pxPath.set(key, path); needsDraw = true; return path; }, () => null) : Promise.resolve(null));
  }
  return null;
}
function elFor(it) {
  const m = media(it), px = proxyFor(it), url = px ? urlOf({ path: px }) : urlOf(m), key = chainKey(it);
  let el = els.get(key);
  if (el && el.dataset.src === url) return el;
  if (el) { el.pause(); el.removeAttribute('src'); el.load(); el.remove(); }
  el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
  el.preload = 'auto';
  el.crossOrigin = 'anonymous'; // untainted frames for WebGL grading

  el.playsInline = true;
  el._px = !!px;
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
// Blend modes (Photoshop names -> canvas); the export uses ffmpeg's blend filter with the same modes.
const BLENDS = { multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', softlight: 'soft-light',
  hardlight: 'hard-light', difference: 'difference', exclusion: 'exclusion', addition: 'lighter', dodge: 'color-dodge', burn: 'color-burn' };
// Transition tail: the outgoing clip's last frame, grabbed once with its own decoder (the playback
// element may already be showing the next piece of the same file).
const tails = new Map();
function tailFrame(it) {
  const m = media(it), at = num(it.in, 0) + S.srcAt(it, Math.max(0, it.dur - 0.5 / P.fps)), key = it.media + '@' + at.toFixed(3);
  let c = tails.get(it.id);
  if (c && c._key === key) return c._ok ? c : null;
  if (!c) tails.set(it.id, c = document.createElement('canvas'));
  Object.assign(c, { _key: key, _ok: false });
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto';
  v.onloadeddata = () => { v.currentTime = Math.min(at, v.duration - 0.01); };
  v.onseeked = () => {
    if (c._key === key) {
      const s = Math.min(1, 1280 / v.videoWidth);
      c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s); c._w = c.width;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c._ok = true; needsDraw = true;
    }
    v.removeAttribute('src'); v.load();
  };
  v.src = urlOf(m);
  return null;
}
// Fill layers (solid colour or gradient), drawn at frame size. Points are 0..1 of the layer box.
const FILL_DEF = { type: 'linear', c1: '#000000', a1: 0, c2: '#000000', a2: 0.85, x1: 0.5, y1: 0.35, x2: 0.5, y2: 1, mid: 0.5 };
const fills = new Map();
function hexA(hex, a) { const n = parseInt(String(hex).slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(num(a, 1), 0, 1)})`; }
function paintFill(g, f, w, h) {
  f = { ...FILL_DEF, ...f };
  g.clearRect(0, 0, w, h);
  if (f.type === 'solid') { g.fillStyle = hexA(f.c1, 1); return g.fillRect(0, 0, w, h); }
  const gr = f.type === 'radial'
    ? g.createRadialGradient(f.x1 * w, f.y1 * h, 0, f.x1 * w, f.y1 * h, Math.max(1, Math.hypot((f.x2 - f.x1) * w, (f.y2 - f.y1) * h)))
    : g.createLinearGradient(f.x1 * w, f.y1 * h, f.x2 * w, f.y2 * h);
  const n1 = parseInt(f.c1.slice(1), 16), n2 = parseInt(f.c2.slice(1), 16), mix = (s, k) => Math.round(((n1 >> s & 255) + (n2 >> s & 255)) / 2);
  gr.addColorStop(0, hexA(f.c1, f.a1));
  gr.addColorStop(clamp(num(f.mid, 0.5), 0.02, 0.98), `rgba(${mix(16)},${mix(8)},${mix(0)},${(num(f.a1, 1) + num(f.a2, 1)) / 2})`);
  gr.addColorStop(1, hexA(f.c2, f.a2));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
function fillCanvas(it, w = P.w, h = P.h) {
  const key = JSON.stringify(it.fill) + w + 'x' + h;
  let c = fills.get(it.id);
  if (c && c._key === key) return c;
  if (!c) fills.set(it.id, c = document.createElement('canvas'));
  c.width = w; c.height = h; c._key = key; c._w = w;
  paintFill(c.getContext('2d'), it.fill || {}, w, h);
  return c;
}
// Gradient handles on the preview: start point, end point and the midpoint diamond (as in Photoshop).
const fillPts = (f, L) => { f = { ...FILL_DEF, ...f }; const P1 = [L.ox + f.x1 * L.cw, L.oy + f.y1 * L.ch], P2 = [L.ox + f.x2 * L.cw, L.oy + f.y2 * L.ch], q = num(f.mid, 0.5);
  return { p1: P1, p2: P2, mid: [P1[0] + (P2[0] - P1[0]) * q, P1[1] + (P2[1] - P1[1]) * q] }; };
function drawFillGuide(ctx, f, L) {
  const p = fillPts(f, L), s = P.w / Math.max(1, view.getBoundingClientRect().width); // screen pixel in project units
  ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 3 * s; ctx.strokeStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4 * s;
  ctx.beginPath(); ctx.moveTo(...p.p1); ctx.lineTo(...p.p2); ctx.stroke();
  for (const [pt, r, c] of [[p.p1, 9, f.c1 || '#000'], [p.p2, 7, f.c2 || '#000']]) {
    ctx.beginPath(); ctx.arc(pt[0], pt[1], r * s, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 3 * s; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  ctx.translate(...p.mid); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#fff'; ctx.fillRect(-6 * s, -6 * s, 12 * s, 12 * s);
  ctx.restore();
}
// Denoise / normalize: each source's sound is processed once per effect set (audio_fx, cached),
// then played and exported in its place. Keys are "mediaId|fx".
const dnOk = new Map(), dnReady = new Set();
const fxId = it => it.media + '|' + S.fxKey(it);
function ensureDn(it) {
  const id = fxId(it), mid = it.media, fx = S.fxKey(it);
  if (!dnOk.has(id)) dnOk.set(id, inv('audio_fx', { path: P.media[mid].path, fx }).then(path => {
    (P.media[mid].fx ??= {})[fx] = path; dnReady.add(id); needsDraw = true; return path;
  }, e => { dnOk.delete(id); throw e; }));
  return dnOk.get(id);
}
const dnPrep = () => Promise.all(P.items.filter(i => media(i) && S.fxKey(i)).map(ensureDn));
const dnLive = it => !!S.fxKey(it) && dnReady.has(fxId(it));
function dnEl(it) {
  const key = chainKey(it) + '|dn', url = urlOf({ path: media(it).fx[S.fxKey(it)] });
  let el = els.get(key);
  if (el && el.dataset.src === url) return el;
  if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
  el = document.createElement('audio');
  el.preload = 'auto';
  el.dataset.src = el.src = url;
  els.set(key, el);
  return el;
}
function gcEls() {
  for (const [id, el] of els) if (!item(id.split('|')[0])) { el.pause(); el.removeAttribute('src'); el.load(); el.remove(); els.delete(id); }
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
  const driven = new Set();
  for (const it of ctl.values()) {
    if (S.fxKey(it) && !dnOk.has(fxId(it))) ensureDn(it).catch(() => {});
    const dn = dnLive(it);
    driveEl(elFor(it), it, dn);
    if (dn) { const d = dnEl(it); driven.add(d); driveEl(d, it, false); }
  }
  for (const [k, e] of els) if (k.endsWith('|dn') && !driven.has(e) && !e.paused) e.pause();
}
function driveEl(el, it, silent) {
  {
    const on = active(it, t), lt = clamp(t - it.start, 0, it.dur);
    // a proxy is already retimed: it plays at 1x from the clip's start
    const sp = el._px ? 1 : clamp(S.rateAt(it, lt), 0.0625, 16), want = el._px ? lt : num(it.in, 0) + S.srcAt(it, lt);
    if (el.preservesPitch !== !it.pitch) el.preservesPitch = !it.pitch;
    // Warm-up: just before a cut, run the next clip muted at a crawl from its in-point, so the decoder is
    // already going when the cut arrives (WebKit needs ~0.6 s to start a paused video).
    const warm = !on && playing && it.start > t && it.start - t < 0.8;
    // Fast parts (over 3x) can't be decoded in real time: hold the element paused and jump to the
    // wanted frame whenever the last jump has landed (frame skipping keeps the picture in sync).
    const fast = on && playing && sp > 3;
    // Speed curves change the rate every frame; WebKit stutters on each playbackRate write, so step it.
    const rate = warm ? 0.0625 : el._px ? 1 : S.hasCurve(it) ? +Math.pow(1.15, Math.round(Math.log(sp) / Math.log(1.15))).toFixed(3) : sp, mute = silent || !!it.muted || !on || fast;
    if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
    if (el.muted !== mute) el.muted = mute;
    const vol = clamp(num(it.volume, 1) * S.audioFade(it, t - it.start), 0, 1);
    if (Math.abs(el.volume - vol) > 0.005) el.volume = vol;
    el._hold = fast;
    if (fast) {
      if (!el.paused) el.pause();
      // a jump that hasn't landed in 250 ms is overtaken by a fresh one
      const now = performance.now();
      if ((!el.seeking || now - (el._seekAt || 0) > 250) && Math.abs(el.currentTime - want) > 1 / P.fps) {
        el._seekAt = now;
        if (el.fastSeek && sp > 6) el.fastSeek(want); else el.currentTime = want;
      }
    } else if (on && playing) {
      if (el.paused) { if (Math.abs(el.currentTime - want) > 0.15) el.currentTime = want; el.play().catch(() => {}); }
      else if (Math.abs(el.currentTime - want) > 0.3 * Math.max(1, sp)) el.currentTime = want; // faster clips drift more between frames
    } else if (warm) {
      const in0 = el._px ? 0 : num(it.in, 0);
      if (el.paused) { if (!el.seeking && Math.abs(el.currentTime - in0) > 0.05) el.currentTime = in0; el.play().catch(() => {}); }
    } else {
      if (!el.paused) el.pause();
      if (on && !el.seeking && Math.abs(el.currentTime - want) > 0.5 / P.fps) el.currentTime = want;
      // Preroll: park the next clip on its first frame so the cut starts without a seek.
      else if (!on && playing && it.start > t && it.start - t < 1.5 && !el.seeking && Math.abs(el.currentTime - (el._px ? 0 : num(it.in, 0))) > 0.05) el.currentTime = el._px ? 0 : num(it.in, 0);
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
  // Two modes: the basic grade as math, or (advanced colour) the clip's baked 3D LUT stored as an
  // (N*N) x N strip — x = blue slice * N + red, y = green — read with trilinear blending.
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float; varying vec2 uv; uniform sampler2D tex; uniform sampler2D lut; uniform vec4 rect;
    uniform vec3 slope; uniform vec3 icpt; uniform float sat; uniform float useLut; uniform float n; uniform vec3 key; uniform vec2 kuv;
    uniform float fxId; uniform vec4 fxv; uniform vec2 bsz; uniform float ft;
    vec3 lut3(vec3 v){ vec3 s = clamp(v, 0., 1.) * (n - 1.); float b0 = floor(s.b), b1 = min(b0 + 1., n - 1.);
      vec2 a = vec2((b0 * n + s.r + .5) / (n * n), (s.g + .5) / n), b = vec2((b1 * n + s.r + .5) / (n * n), (s.g + .5) / n);
      return mix(texture2D(lut, a).rgb, texture2D(lut, b).rgb, s.b - b0); }
    vec4 grade(vec2 u){ vec4 c = texture2D(tex, rect.xy + clamp(u, 0., 1.) * rect.zw);
      if (key.z > 0.) { // chroma key: x = similarity, y = blend, z = on; kuv holds the key's CbCr
        vec2 p = vec2(dot(c.rgb, vec3(-.1146, -.3854, .5)), dot(c.rgb, vec3(.5, -.4542, -.0458)));
        float d = length(p - kuv) / 1.4142;
        c.a *= key.y > 0.0001 ? clamp((d - key.x) / key.y, 0., 1.) : step(key.x, d);
      }
      if (useLut > .5) return vec4(lut3(c.rgb), c.a);
      vec3 v = clamp(c.rgb * slope + icpt, 0., 1.);
      mat3 m = mat3(.213 + .787 * sat, .213 - .213 * sat, .213 - .213 * sat, .715 - .715 * sat, .715 + .285 * sat, .715 - .715 * sat, .072 - .072 * sat, .072 - .072 * sat, .072 + .928 * sat);
      return vec4(clamp(m * v, 0., 1.), c.a); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ // clip effects (S.fxVals / S.fxChain): 1 blur 2 shake 3 zoom pulse 4 grain 5 vignette 6 rgb split 7 glitch 8 vhs 9 pixelate 10 invert 11 flash 12 letterbox
      int id = int(fxId + .5); vec2 u = uv; vec4 c;
      if (id == 2 || id == 3) u = .5 + (u - .5) / fxv.z + fxv.xy;
      if (id == 9) { vec2 b = fxv.x / bsz; u = (floor(u / b) + .5) * b; }
      if (id == 1) { float ws = 0.; c = vec4(0.);
        for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) { float w = exp(-float(i * i + j * j) / 4.5); c += grade(u + vec2(float(i), float(j)) * fxv.x / 3. / bsz) * w; ws += w; }
        c /= ws; }
      else if (id >= 6 && id <= 8) { vec2 o = vec2(fxv.x / bsz.x, 0.); c = grade(u); c.r = grade(u + o).r; c.b = grade(u - o).b; }
      else c = grade(u);
      if (id == 4 || id == 8) c.rgb += (hash(floor(uv * bsz) + ft) - .5) * fxv.y;
      if (id == 5) { float d = length((uv - .5) * bsz) / (.5 * length(bsz)), k = cos(fxv.x * d); c.rgb *= d > 1. ? 0. : k * k * k * k; }
      if (id == 8) c.rgb = mix(vec3(dot(c.rgb, vec3(.299, .587, .114))), c.rgb, fxv.z);
      if (id == 10) c.rgb = 1. - c.rgb;
      if (id == 11) c.rgb += fxv.x;
      if (id == 12 && (uv.y < fxv.x || uv.y > 1. - fxv.x)) c = vec4(0., 0., 0., 1.);
      gl_FragColor = vec4(clamp(c.rgb, 0., 1.), c.a); }`));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const texParams = () => { for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); };
  const frameTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, frameTex);
  texParams();
  const U = n => gl.getUniformLocation(prog, n);
  const u = { fxId: U('fxId'), fxv: U('fxv'), bsz: U('bsz'), ft: U('ft'), key: U('key'), kuv: U('kuv'), rect: U('rect'), slope: U('slope'), icpt: U('icpt'), sat: U('sat'), useLut: U('useLut'), n: U('n'), tex: U('tex'), lut: U('lut') };
  gl.uniform1i(u.tex, 0); gl.uniform1i(u.lut, 1);
  const luts = new Map(); // baked table -> texture (a few recent ones)
  const lutTex = L => {
    let t = luts.get(L);
    if (t) return t;
    const n = S.LUT_N, px = new Uint8Array(n * n * n * 4);
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      const i = (r + g * n + b * n * n) * 3, o = (g * n * n + b * n + r) * 4;
      px[o] = Math.round(L.arr[i] * 255); px[o + 1] = Math.round(L.arr[i + 1] * 255); px[o + 2] = Math.round(L.arr[i + 2] * 255); px[o + 3] = 255;
    }
    t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t); texParams();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n * n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.activeTexture(gl.TEXTURE0);
    luts.set(L, t);
    if (luts.size > 24) { const [k, old] = luts.entries().next().value; gl.deleteTexture(old); luts.delete(k); }
    return t;
  };
  // Draws src rect (sx,sy,sw,sh of a WxH source) graded into ctx at (dx,dy,dw,dh).
  return (ctx, src, W, H, sx, sy, sw, sh, dx, dy, dw, dh, g, L) => {
    const ow = Math.max(1, Math.round(Math.min(dw, 2048))), oh = Math.max(1, Math.round(Math.min(dh, 2048)));
    if (c.width !== ow || c.height !== oh) { c.width = ow; c.height = oh; }
    gl.viewport(0, 0, ow, oh);
    gl.uniform1f(u.useLut, L ? 1 : 0);
    if (L) { const t = lutTex(L); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t); gl.activeTexture(gl.TEXTURE0); gl.uniform1f(u.n, S.LUT_N); }
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform4f(u.rect, sx / W, sy / H, sw / W, sh / H);
    gl.uniform3f(u.slope, g.ch[0].slope, g.ch[1].slope, g.ch[2].slope);
    gl.uniform3f(u.icpt, g.ch[0].intercept, g.ch[1].intercept, g.ch[2].intercept);
    gl.uniform1f(u.sat, g.s);
    const K = g.chroma;
    gl.uniform3f(u.key, K ? K.sim : 0, K ? K.blend : 0, K ? 1 : 0);
    if (K) gl.uniform2f(u.kuv, K.uv[0], K.uv[1]);
    const F = g.fx;
    gl.uniform1f(u.fxId, F ? F.i : 0);
    if (F) { gl.uniform4f(u.fxv, ...F.v); gl.uniform2f(u.bsz, dw, dh); gl.uniform1f(u.ft, Math.floor(g.ft * 30)); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.drawImage(c, dx, dy, dw, dh);
  };
})();

// User .cube files, read once: path -> parsed table, or a promise while loading.
const userLuts = new Map();
function loadUserLut(f) {
  if (!userLuts.has(f)) userLuts.set(f, inv('read_lut', { path: f }).then(t => { const L = S.parseCube(t); userLuts.set(f, L); needsDraw = true; return L; },
    e => { userLuts.set(f, null); toast(tr('lutFail') + ': ' + cleanErr(e)); return null; }));
  return Promise.resolve(userLuts.get(f));
}
function userLutFor(it) {
  const f = it.color && it.color.lut && it.color.lut.file;
  if (!f) return null;
  const u = userLuts.get(f);
  if (u === undefined) { loadUserLut(f); return null; }
  return u instanceof Promise ? null : u;
}
// A clip's whole colour (basic + looks + LUT + wheels + curves + HSL) baked once per change.
const lutBake = new Map();
function lutFor(it) {
  const ul = userLutFor(it), key = S.colorKey(it) + (ul ? '|u' : '');
  let c = lutBake.get(it.id);
  if (!c || c.key !== key) { c = { key, arr: S.bakeLut(it, ul) }; lutBake.set(it.id, c); }
  return c;
}
// drawImage with the item's grade applied.
function drawGraded(ctx, it, src, sx, sy, sw, sh, dx, dy, dw, dh, lt = 0) {
  const g = S.grade(it), adv = S.hasColor(it);
  if (S.hasKey(it)) g.chroma = { sim: num(it.chroma.sim, 0.3), blend: num(it.chroma.blend, 0.1), uv: S.keyUV(it.chroma.color) };
  g.fx = S.fxVals(it, lt, dw, dh); g.ft = lt;
  if ((g.identity && !adv && !g.chroma && !g.fx) || !GL) return ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  const W = src.videoWidth || src.naturalWidth || src.width, H = src.videoHeight || src.naturalHeight || src.height;
  try { GL(ctx, src, W, H, sx, sy, sw, sh, dx, dy, dw, dh, g, adv ? lutFor(it) : null); }
  catch (e) { if (!drawGraded.warned) { drawGraded.warned = true; inv('dev_log', { msg: 'grade failed: ' + e }); } ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh); }
}

// Logo removal preview: the box is filled from the pixel rows just above and below it, blended
// top to bottom (export uses ffmpeg delogo, which interpolates from all four edges).
const dlc = document.createElement('canvas');
dlc.width = 8; dlc.height = 2;
// Masks: a scratch canvas per clip box size, and the mask shape cached per settings and size.
const mBox = document.createElement('canvas');
function maskBox(L) {
  const w = Math.round(L.cw), h = Math.round(L.ch);
  if (mBox.width !== w || mBox.height !== h) { mBox.width = w; mBox.height = h; }
  const c = mBox.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
  return c;
}
const maskCache = new Map();
function maskCanvas(M, w, h) {
  const key = JSON.stringify(M) + w + 'x' + h;
  let c = maskCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = w; c.height = h;
    S.drawMask(c.getContext('2d'), M, w, h);
    if (maskCache.size > 12) maskCache.delete(maskCache.keys().next().value);
    maskCache.set(key, c);
  }
  return c;
}
// Dashed outline of the mask shape while its settings are open.
function drawMaskGuide(ctx, M, L) {
  const q = { ...S.MASK_DEF, ...M }, w = L.cw, h = L.ch;
  ctx.save();
  ctx.translate(L.ox + q.x * w, L.oy + q.y * h); ctx.rotate(q.rot * Math.PI / 180);
  ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeStyle = '#5cd3c6';
  ctx.beginPath();
  const D = Math.hypot(w, h);
  if (q.type === 'linear') { ctx.moveTo(-D, 0); ctx.lineTo(D, 0); }
  else if (q.type === 'mirror') { ctx.moveTo(-D, -q.h * h / 2); ctx.lineTo(D, -q.h * h / 2); ctx.moveTo(-D, q.h * h / 2); ctx.lineTo(D, q.h * h / 2); }
  else if (q.type === 'circle') ctx.ellipse(0, 0, q.w * w / 2, q.h * h / 2, 0, 0, Math.PI * 2);
  else ctx.rect(-q.w * w / 2, -q.h * h / 2, q.w * w, q.h * h);
  ctx.stroke();
  ctx.setLineDash([]); ctx.fillStyle = '#5cd3c6'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawDelogo(ctx, it, src, m, k, C, L, u, v) {
  const b = S.logoBox(it.logo, m), dc = dlc.getContext('2d');
  dc.clearRect(0, 0, 8, 2);
  drawGraded(dc, it, src, b.x * k, (b.y - 1) * k, b.w * k, k, 0, 0, 8, 1);
  drawGraded(dc, it, src, b.x * k, (b.y + b.h) * k, b.w * k, k, 0, 1, 8, 1);
  const dx = L.ox + (b.x - C.x) / u - L.cx, dy = L.oy + (b.y - C.y) / v - L.cy;
  ctx.save();
  ctx.beginPath(); ctx.rect(L.ox, L.oy, L.cw, L.ch); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(dlc, 0, 0, 8, 2, dx, dy, b.w / u, b.h / v);
  if (ctx === vctx && sel === it.id && inspTab === 'tVideo' && !playing) {
    ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeStyle = '#5cd3c6';
    ctx.strokeRect(dx, dy, b.w / u, b.h / v);
  }
  ctx.restore();
}

// Adjustment layer (effect / filter on its own clip): re-grades everything drawn below it.
const adjCopy = document.createElement('canvas');
function drawAdj(ctx, it, lt) {
  const c = ctx.canvas;
  if (adjCopy.width !== c.width || adjCopy.height !== c.height) { adjCopy.width = c.width; adjCopy.height = c.height; }
  const g = adjCopy.getContext('2d');
  g.clearRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0);
  ctx.save();
  ctx.globalAlpha = S.fadeAlpha(it, lt) * clamp(num(it.opacity, 1), 0, 1);
  drawGraded(ctx, it, adjCopy, 0, 0, c.width, c.height, 0, 0, P.w, P.h, lt);
  ctx.restore();
}
// ov = {id, lt}: draw that clip at its own local time (animation preview) whatever the playhead says.
function drawVisual(ctx, time, ov, textHook) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, P.w, P.h);
  for (const tr0 of P.tracks.filter(x => x.kind !== 'audio').reverse()) { // bottom of the stack first
    const tid = tr0.id;
    if (tr0.kind === 'text') { if (textHook) textHook(tid); continue; }
    // by start time: a clip's frozen tail is drawn under the next clip's transition
    // a shader transition draws its two clips into their own layers and mixes them
    const gt = glTransAt(tid, time, ov);
    for (const it of P.items.filter(i => i.track === tid && !isText(i)).sort((a, b) => a.start - b.start)) {
      if (gt && (it === gt.a || it === gt.b)) { if (it === gt.b) drawGlTrans(ctx, gt, time); continue; }
      drawItem(ctx, it, time, ov);
    }
  }
}
// One clip of the stack at project time `time` (src: a frame to use instead of the clip's own video).
function drawItem(ctx, it, time, ov, srcOv) {
    const pv = ov && ov.id === it.id, m = media(it);
    if (!m || m.kind === 'audio' || it.hidden) return;
    const end = it.start + it.dur, TO = !pv && time >= end && S.transOut(P, it), tail = !!TO && time < end + TO.d;
    if (TO === false && m.kind === 'video' && active(it, time) && end - time < 2 && S.transOut(P, it)) tailFrame(it); // fetch ahead
    if (!(pv || tail || active(it, time))) return;
    if (m.adj) { drawAdj(ctx, it, pv ? ov.lt : time - it.start); return; }
    let src = srcOv || (m.fill ? fillCanvas(it) : m.kind === 'image' ? imgFor(m) : tail ? tailFrame(it) : elFor(it));
    if (!src) return;
    if (m.fill || src.tagName === 'CANVAS') {} // fill layer / held last frame: always ready
    else if (m.kind === 'image' ? !src.complete || !src.naturalWidth : src.readyState < 2) {
      if (!src._snap) return;
      src = src._snap; // frame-skipping playback: keep the last frame while the next jump lands
    } else if (src._hold && ctx === vctx) {
      const c = src._snap || (src._snap = document.createElement('canvas'));
      if (c.width !== m.w || c.height !== m.h) { c.width = m.w; c.height = m.h; }
      c.getContext('2d').drawImage(src, 0, 0, m.w, m.h);
    }
    const lt = pv ? ov.lt : tail ? it.dur : time - it.start;
    if (m.fill) { m.w = P.w; m.h = P.h; }
    const a = S.withVa(S.animAt(it, lt), lt, P.w, P.h), L = S.layout(a, m, P.w, P.h), C = S.srcCrop(it, m);
    const k = (src.videoWidth || src.naturalWidth || src._w || m.w) / m.w, u = C.w / L.sw, v = C.h / L.sh;
    ctx.save();
    ctx.globalAlpha = S.fadeAlpha(it, lt) * clamp(num(a.opacity, 1), 0, 1);
    if (it.blend && it.blend !== 'normal') ctx.globalCompositeOperation = BLENDS[it.blend] || 'source-over';
    // transitions: TI = this clip coming in, TO = this clip's held tail going out
    const TI = !tail && !pv ? S.transIn(P, it) : null, trIn = TI && lt < TI.d ? TI : null;
    const qi = trIn ? clamp(lt / trIn.d, 0, 1) : 1, qo = tail ? clamp((time - end) / TO.d, 0, 1) : 0;
    if (trIn && (S.TR_DIP[trIn.id] || S.TR_MOVE[trIn.id]) && qi < 0.5) { ctx.restore(); return; }
    // zoom / spin / shake / glitch: [formulas, progress through this side's half]
    const mv = [trIn && S.TR_MOVE[trIn.id] && [S.TR_MOVE[trIn.id].b, (qi - 0.5) * 2], tail && S.TR_MOVE[TO.id] && [S.TR_MOVE[TO.id].a, Math.min(1, qo * 2)]].filter(Boolean);
    const mz = mv.reduce((z, [M, u]) => z * (M.z != null ? S.trVal(M.z, u) : 1), 1), mr = mv.reduce((r, [M, u]) => r + (M.r != null ? S.trVal(M.r, u) : 0), 0);
    const mx = mv.reduce((x, [M, u]) => x + (M.x != null ? S.trVal(M.x, u) : 0), 0);
    if (mx) ctx.translate(mx * P.w, 0);
    if (trIn && trIn.id === 'fade') ctx.globalAlpha *= qi;
    const sl = trIn && S.TR_SLIDE[trIn.id] ? [S.TR_SLIDE[trIn.id], 1 - S.ease3(qi)] : tail && S.TR_SLIDE[TO.id] ? [S.TR_SLIDE[TO.id], -S.ease3(qo)] : null;
    if (sl) ctx.translate(sl[0][0] * P.w * sl[1], sl[0][1] * P.h * sl[1]);
    const [tx, ty] = S.trkAt(it, lt);
    if (tx || ty) ctx.translate(tx * P.w, ty * P.h);
    if (it.flipH || it.flipV || num(a.rotate, 0)) {
      ctx.translate(L.ox + L.cw / 2, L.oy + L.ch / 2);
      ctx.rotate(num(a.rotate, 0) * Math.PI / 180);
      ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
      ctx.translate(-(L.ox + L.cw / 2), -(L.oy + L.ch / 2));
    }
    if (trIn && S.TR_GEQ[trIn.id]) S.transClip(ctx, trIn.id, S.ease3(qi), L.ox, L.oy, L.cw, L.ch);
    if (mz !== 1 || mr) { // inside the clip's own box, as the export crops it
      ctx.beginPath(); ctx.rect(L.ox, L.oy, L.cw, L.ch); ctx.clip();
      ctx.translate(L.ox + L.cw / 2, L.oy + L.ch / 2); ctx.rotate(mr * Math.PI / 180); ctx.scale(mz, mz); ctx.translate(-(L.ox + L.cw / 2), -(L.oy + L.ch / 2));
    }
    const mk = S.hasMask(it) && L.cw >= 1 && L.ch >= 1;
    const dc = mk ? maskBox(L) : ctx;
    if (mk) { dc.save(); dc.translate(-L.ox, -L.oy); }
    drawGraded(dc, it, src, (C.x + L.cx * u) * k, (C.y + L.cy * v) * k, L.cw * u * k, L.ch * v * k, L.ox, L.oy, L.cw, L.ch, lt);
    if (it.logo && it.logo.on) drawDelogo(dc, it, src, m, k, C, L, u, v);
    if (mk) {
      dc.restore();
      dc.globalCompositeOperation = 'destination-in';
      dc.drawImage(maskCanvas(it.mask, Math.round(L.cw), Math.round(L.ch)), 0, 0);
      dc.globalCompositeOperation = 'source-over';
      ctx.drawImage(dc.canvas, 0, 0, Math.round(L.cw), Math.round(L.ch), L.ox, L.oy, Math.round(L.cw), Math.round(L.ch));
      if (ctx === vctx && sel === it.id && inspTab === 'tAdjust' && colSub === 'mask' && !playing) drawMaskGuide(ctx, it.mask, L);
    }
    // dip to black/white: the clip's box fades to the colour (going out) or from it (coming in)
    const dip = trIn && S.TR_DIP[trIn.id] ? [trIn.id, 1 - (qi - 0.5) * 2] : tail && S.TR_DIP[TO.id] ? [TO.id, Math.min(1, qo * 2)] : null;
    if (dip && dip[1] > 0) { ctx.globalAlpha *= dip[1]; ctx.fillStyle = S.TR_DIP[dip[0]]; ctx.fillRect(L.ox, L.oy, L.cw, L.ch); }
    if (ctx === vctx && sel === it.id && m.fill && it.fill && it.fill.type !== 'solid' && !playing) drawFillGuide(ctx, it.fill, L);
    ctx.restore();
}

// ---------- shader transitions (src/gltrans.js) ----------
// The incoming clip b and the held outgoing clip a are drawn into their own full-frame layers, then
// mixed by the transition's fragment shader. The export renders the same frames (renderGlTrans).
const GLX_VS = 'attribute vec2 a;varying vec2 uv0;void main(){uv0=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
// one GL context: frame(id, A, B, q) -> its canvas holding the mixed frame (A, B: same-size canvases)
// WebKit drops a context that holds too many programs, so only the last few stay compiled, and a lost
// context is replaced by a new canvas.
function mkGlx() {
  const progs = new Map();
  let c = null, gl = null, buf = null, tex = [];
  const init = () => {
    if (gl && !gl.isContextLost()) return gl;
    c = document.createElement('canvas'); progs.clear(); tex = [];
    gl = c.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true });
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
      tex.push(t);
    }
    return gl;
  };
  const prog = id => {
    let pr = progs.get(id);
    if (pr) { progs.delete(id); progs.set(id, pr); return pr; } // most recently used last
    while (progs.size >= 12) { const [k, old] = progs.entries().next().value; gl.deleteProgram(old.q); progs.delete(k); }
    const def = KadrGLT.LIST.find(x => x[0] === id);
    const sh = (type, src) => {
      const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(id + ': ' + gl.getShaderInfoLog(o));
      return o;
    };
    const q = gl.createProgram(), vs = sh(gl.VERTEX_SHADER, GLX_VS), fs = sh(gl.FRAGMENT_SHADER, KadrGLT.HEAD + def[2] + '\nvoid main(){gl_FragColor=tr(uv0);}');
    gl.attachShader(q, vs); gl.attachShader(q, fs);
    gl.linkProgram(q);
    gl.deleteShader(vs); gl.deleteShader(fs); // freed with the program
    if (!gl.getProgramParameter(q, gl.LINK_STATUS)) throw new Error(id + ': ' + gl.getProgramInfoLog(q));
    pr = { q, a: gl.getAttribLocation(q, 'a'), tA: gl.getUniformLocation(q, 'tA'), tB: gl.getUniformLocation(q, 'tB'), p: gl.getUniformLocation(q, 'p'), R: gl.getUniformLocation(q, 'R') };
    progs.set(id, pr);
    return pr;
  };
  const frame = (id, A, B, q) => {
    init();
    const pr = prog(id), w = A.width, h = A.height;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h); gl.useProgram(pr.q);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    [A, B].forEach((s, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s); });
    gl.uniform1i(pr.tA, 0); gl.uniform1i(pr.tB, 1); gl.uniform1f(pr.p, clamp(q, 0, 1)); gl.uniform2f(pr.R, w, h);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(pr.a); gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return c;
  };
  return { frame, check: id => { init(); prog(id); } };
}
const GLX = { main: mkGlx(), thumb: mkGlx(), A: document.createElement('canvas'), B: document.createElement('canvas') };
function glTransAt(tid, time, ov) {
  if (ov) return null;
  for (const b of P.items) {
    if (b.track !== tid || !b.trans || !S.GLT.includes(b.trans.id) || time < b.start || time >= b.start + 2.01) continue;
    const T = S.transIn(P, b);
    if (T && time < b.start + T.d) return { id: T.id, a: T.prev, b, q: (time - b.start) / T.d };
  }
  return null;
}
function drawGlTrans(ctx, gt, time, srcA, srcB) {
  for (const c of [GLX.A, GLX.B]) { if (c.width !== P.w || c.height !== P.h) { c.width = P.w; c.height = P.h; } c.getContext('2d').clearRect(0, 0, P.w, P.h); }
  drawItem(GLX.A.getContext('2d'), gt.a, time, null, srcA);
  drawItem(GLX.B.getContext('2d'), gt.b, time, null, srcB);
  try { ctx.drawImage(GLX.main.frame(gt.id, GLX.A, GLX.B, gt.q), 0, 0, P.w, P.h); }
  catch (e) { console.error(e); ctx.drawImage(gt.q < 0.5 ? GLX.A : GLX.B, 0, 0); }
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
  // Enter starts a new line; each paragraph reads right-to-left or left-to-right on its own
  // (auto: its first letter decides; the dir buttons force one way for the whole text).
  const tokens = [], brk = new Set(), tokR = [];
  for (const para of caseText(it.text, st.caseMode).split('\n')) {
    const w = para.split(/\s+/).filter(Boolean);
    if (!w.length) continue;
    const r = st.dir === 'rtl' ? true : st.dir === 'ltr' ? false : /^[^A-Za-z\u0590-\u08FF]*[\u0590-\u08FF]/.test(para);
    if (tokens.length) brk.add(tokens.length);
    for (const x of w) { tokens.push(x); tokR.push(r); }
  }
  const alpha = s.alpha * clamp(num(it.opacity, 1), 0, 1);
  if (alpha <= 0 || !tokens.length || s.sc <= 0 || s.sx <= 0 || s.sy <= 0) return;
  if (ctx === vctx && it.id === editId) return; // being edited in place: the editor box shows it
  const rtl = tokR[0];
  let R = rtl;
  ctx.save();
  ctx.font = `${st.italic ? 'italic ' : ''}${st.weight} ${st.size}px "${st.font}"`;
  wantFont(`${st.weight} 40px "${st.font}"`);
  // Letter spacing splits Arabic joins (kashida/tatweel gaps), so Arabic gets it between words instead.
  const arab = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(it.text);
  if ('letterSpacing' in ctx) ctx.letterSpacing = (arab ? 0 : num(st.spacing, 0)) + 'px';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  const space = ctx.measureText(' ').width + (arab ? num(st.spacing, 0) * 3 : 0), maxW = pr.w * 0.86;
  const widths = tokens.map(tk => ctx.measureText(tk).width);
  const lines = [];
  let cur = [], w = 0;
  tokens.forEach((tk, i) => {
    if (cur.length && (brk.has(i) || w + space + widths[i] > maxW)) { lines.push({ idx: cur, w, rtl: tokR[cur[0]] }); cur = []; w = 0; }
    w += (cur.length ? space : 0) + widths[i];
    cur.push(i);
  });
  if (cur.length) lines.push({ idx: cur, w, rtl: tokR[cur[0]] });
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
      ctx.roundRect((R ? x - w : x) - p, y - st.size * 0.62, w + p * 2, st.size * 1.24, st.size * 0.2); ctx.fill(); ctx.restore();
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
    R = ln.rtl;
    ctx.textAlign = R ? 'right' : 'left';
    if (st.bgOn) {
      ctx.save();
      ctx.globalAlpha = alpha * num(st.bgAlpha, 1);
      ctx.fillStyle = st.bg;
      ctx.beginPath();
      ctx.roundRect(x0 - pad, y - lh / 2, ln.w + pad * 2, lh, st.size * num(st.bgRadius, 0.22));
      ctx.fill();
      ctx.restore();
    }
    let x = R ? x0 + ln.w : x0;
    for (const i of ln.idx) {
      const txt = shown[i];
      if (txt) {
        if (s.tok) {
          const k = s.tok(i), mid = R ? x - widths[i] / 2 : x + widths[i] / 2;
          if (k.a > 0 && k.sc > 0) {
            ctx.save();
            ctx.globalAlpha = alpha * k.a;
            ctx.translate(mid, y + k.dy); ctx.scale(k.sc, k.sc); ctx.translate(-mid, -y);
            glyphs(txt, x, y, i);
            ctx.restore();
          }
        } else glyphs(txt, x, y, i);
      }
      x += (R ? -1 : 1) * (widths[i] + space);
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
  for (const tid of renderOrder(pr, 'text')) for (const it of pr.items) if (it.track === tid && isText(it) && !it.hidden && active(it, time)) out.push(it);
  return out;
}

const view = $('#view'), vctx = view.getContext('2d');
const textBoxes = new Map(); // text id -> on-screen box, filled while drawing the preview
let editId = null; // text being edited in place on the preview (not drawn on the canvas meanwhile)
const selBox = $('#stage').appendChild(Object.assign(document.createElement('div'), { id: 'selbox', hidden: true,
  innerHTML: '<i data-sh="nw"></i><i data-sh="ne"></i><i data-sh="sw"></i><i data-sh="se"></i><button data-sh="del"></button><button data-sh="rot"></button>' }));
selBox.querySelector('[data-sh="del"]').innerHTML = icon('x');
selBox.querySelector('[data-sh="rot"]').innerHTML = icon('rotate-cw');
function draw() {
  if (view.width !== P.w || view.height !== P.h) { view.width = P.w; view.height = P.h; fitView(); }
  let ap = animPreview && item(animPreview.id);
  if (animPreview && (!ap || ap.id !== sel || inspTab !== 'tAnim')) { animPreview = null; ap = null; }
  textBoxes.clear();
  const vt = visibleTexts(P, t);
  drawVisual(vctx, t, ap && !isText(ap) ? { id: ap.id, lt: animPreviewLt(ap) } : null, tid => {
    for (const it of vt) if (it.track === tid && (!ap || it.id !== ap.id)) drawTextItem(vctx, P, it, t - it.start);
    if (ap && isText(ap) && ap.track === tid) drawTextItem(vctx, P, ap, animPreviewLt(ap));
  });
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
  if (inspTab === 'tAnim' && now - (loop.th || 0) > 33) { loop.th = now; animThumbs(now / 1000); }
  if (libTab === 'trans' && now - (loop.tt || 0) > 40) { loop.tt = now; transThumbs(now / 1000); }
  requestAnimationFrame(loop);
}
const clock = { tc: null, at: 0 };
function clockTime() {
  let best = null;
  for (const it of P.items) {
    const m = media(it), el = els.get(chainKey(it));
    // speed-curve clips change rate as they play; WebKit stalls on each change, so wall time leads there
    if (!m || m.kind === 'image' || S.hasCurve(it) || !el || el.paused || el.ended || el.seeking || el.readyState < 3 || !active(it, t)) continue;
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
function seek(v) { animPreview = null; t = clamp(v, 0, Math.max(total(), 0) + 3600); needsDraw = true; } // free to run past the last clip
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
// Speed-curve clips show their curve on the clip: the speed line plus a dot at every curve point.
function curveMarks(it) {
  if (!S.hasCurve(it)) return '';
  const c = it.curve, y = v => (50 - Math.log10(clamp(v, 0.1, 10)) * 40).toFixed(1); // 0.1x bottom, 10x top
  const line = Array.from({ length: 41 }, (_, i) => `${(i * 2.5).toFixed(1)},${y(S.rateAt(it, it.dur * i / 40))}`).join(' ');
  return `<svg class="cvl" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${line}"/></svg>` +
    c.pts.map(p => `<i class="cvp" style="left:${(S.fAtU(c, p[0]) * 100).toFixed(2)}%;top:${y(S.rateAt(it, it.dur * S.fAtU(c, p[0])))}%"></i>`).join('');
}
function clipLabel(it) {
  const off = it.hidden ? icon('eye-off') : '';
  if (isText(it)) return off + icon('type') + esc(it.text);
  const m = media(it);
  return off + icon(m.adj ? 'zap' : m.fill ? 'paint-bucket' : m.kind === 'audio' ? 'music' : m.kind === 'image' ? 'image' : 'film') + esc(m.name) + (S.hasCurve(it) ? `  ⟿ ${tr('cv_' + it.curve.id)}` : num(it.speed, 1) !== 1 ? `  ×${+num(it.speed, 1).toFixed(2)}` : '');
}
function renderTimeline() {
  const width = (Math.max(total(), t) + 30) * pps;
  $('#rows').style.width = $('#ruler').style.width = width + 'px';
  $('#heads').innerHTML = P.tracks.map(x => `<div class="head" data-track="${x.id}" title="${tr('dragTrack')}"><i style="background:${TRACK_COLOR[x.kind]}"></i>${esc(trackLabel(x))}</div>`).join('');
  $('#rows').innerHTML = P.tracks.map(x => `<div class="row${x.id === 'v1' ? ' main' : ''}" data-track="${x.id}">${
    P.items.filter(i => i.track === x.id).map(it => `<div class="clip k-${kindOf(it)}${isSel(it.id) ? ' sel' : ''}${it.hidden ? ' off' : ''}" data-id="${it.id}" style="left:${it.start * pps}px;width:${Math.max(4, it.dur * pps)}px"><div class="h l"></div>${S.transIn(P, it) ? `<b class="trn" data-trn="${it.id}" title="${tr('tr_' + it.trans.id)}">${icon('arrow-right-left')}</b>` : ''}<span>${clipLabel(it)}</span>${kfTimes(it).filter(x => x >= 0 && x <= it.dur).map(x => `<i class="kfd" data-kt="${x}" style="left:${x * pps}px"></i>`).join('')}${curveMarks(it)}<div class="h r"></div></div>`).join('')
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
      else if (x && x !== it.track) {
        const from = P.tracks.findIndex(q => q.id === it.track), to = P.tracks.findIndex(q => q.id === x);
        P.tracks.splice(to, 0, ...P.tracks.splice(from, 1));
      }
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
  const at = ev => { seek(timeAt(ev.clientX)); if ((t + 10) * pps > $('#rows').offsetWidth) renderTimeline(); };
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
const zoomQ = { k: 1, x: 0, raf: 0 };
$('#scroll').addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  zoomQ.k *= Math.exp(-clamp(e.deltaY, -60, 60) * 0.012); // trackpad pinch sends small deltas, mouse wheel big ones
  zoomQ.x = e.clientX;
  if (zoomQ.raf) return;
  zoomQ.raf = requestAnimationFrame(() => {
    const sc = $('#scroll'), ax = zoomQ.x - sc.getBoundingClientRect().left, at = (ax + sc.scrollLeft) / pps;
    setZoom(pps * zoomQ.k);
    sc.scrollLeft = at * pps - ax; // keep the moment under the pointer still
    zoomQ.k = 1; zoomQ.raf = 0;
  });
}, { passive: false });
// The playhead line itself can be grabbed anywhere along its height.
$('#ph').addEventListener('pointerdown', e => { if (e.button === 0) { e.stopPropagation(); scrubFrom(e); } });
// Keyframe diamonds on a clip: drag sideways to move that keyframe (all properties keyed there), click to jump to it.
$('#rows').addEventListener('pointerdown', e => {
  const d = e.target.closest('.kfd');
  if (!d || e.button !== 0) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const it = item(d.closest('.clip').dataset.id), kt = +d.dataset.kt, x0 = e.clientX;
  if (sel !== it.id) select(it.id);
  let moved = false, cur = kt;
  const same = q => Math.abs(q[0] - cur) < 1e-4;
  const mv = ev => {
    if (!moved) { if (Math.abs(ev.clientX - x0) < 3) return; snapshot(); moved = true; }
    const nt = +clamp(Math.round((kt + (ev.clientX - x0) / pps) * P.fps) / P.fps, 0, it.dur).toFixed(4);
    for (const k of Object.keys(it.kf || {})) { for (const q of it.kf[k]) if (same(q)) q[0] = nt; it.kf[k].sort((a, b) => a[0] - b[0]); }
    cur = nt; seek(it.start + nt); renderTimeline(); needsDraw = true;
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (moved) { dirty = true; refresh(); } else seek(it.start + kt); }, { once: true });
}, true);

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
  if (libTab === 'filters' || libTab === 'effects') renderLookCards();
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
  for (const [k, m] of Object.entries(P.media)) if ((m.fill || m.adj) && !P.items.some(i => i.media === k)) delete P.media[k];
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
// Every slider has a number box beside it, in the unit people read (percent, degrees, seconds).
const PCT = /volume|opacity|bgAlpha|crop\.|logo\.|Mix$|lut\.mix|fill\.(a1|a2|mid)/;
const unitOf = k => /Dur$|^(fadeIn|fadeOut|afIn|afOut)$/.test(k) ? 's' : k === 'rotate' ? '°' : PCT.test(k) ? '%' : '';
const dispVal = (k, v) => PCT.test(k) ? Math.round(v * 100) : /size|strokeW|spacing|Blur|Dist|glowSize|rotate/.test(k) ? Math.round(v) : +(+v).toFixed(2);
function setShow(k, v) {
  const nb = document.querySelector(`#inspBody [data-num="${k}"]`);
  if (nb && document.activeElement !== nb) nb.value = dispVal(k, v);
}

const fld = {
  range: (k, label, min, max, step, it, d = 0) =>
    `<div class="f"><div class="lb"><span>${tr(label)}</span></div><div class="spd"><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${num(getPath(it, k), d)}"><span class="nbx"><input type="number" data-num="${k}" step="any" value="${dispVal(k, num(getPath(it, k), d))}"><i>${unitOf(k)}</i></span></div></div>`,
  number: (k, label, step, it) =>
    `<div class="f"><div class="lb"><span>${tr(label)}</span></div><input type="number" data-k="${k}" step="${step}" value="${+num(getPath(it, k), 0).toFixed(3)}"></div>`,
  select: (k, label, opts, it) =>
    `<div class="f"><div class="lb"><span>${tr(label)}</span></div><select data-k="${k}">${opts.map(([v, n]) => `<option value="${esc(v)}"${String(getPath(it, k)) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`,
  color: (k, label, it) => `<label>${tr(label)}<input type="color" data-k="${k}" value="${esc(getPath(it, k))}"></label>`,
  check: (k, label, it) => `<label><input type="checkbox" data-k="${k}"${getPath(it, k) ? ' checked' : ''}>${tr(label)}</label>`,
};
const grp = (title, body) => `<div class="grp"><div class="gh">${tr(title)}</div>${body}</div>`;

// Built-in tracks have their own names; extra video tracks (added for effect layers) are "Video N", counted from the bottom.
function trackLabel(x) {
  const k = 'tr_' + x.id;
  if (tr(k) !== k) return tr(k);
  const vs = P.tracks.filter(y => y.kind === x.kind).reverse();
  return tr('videoN', { n: vs.indexOf(x) + 1 });
}
function inspTabsFor(it) {
  if (!it) return [];
  if (isText(it)) return ['tText', 'tTpl', 'tAnim'];
  const k = media(it).kind;
  if (media(it).adj) return ['tVideo', 'tAdjust'];
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
    setShow(k, v);
  }
}
const kfBar = it => `<div class="kfbar" dir="ltr"><button class="ib" data-kf="prev" title="${tr('kf_prev')}">${icon('chevron-left')}</button>` +
  `<button class="kfb${kfHere(it) ? ' on' : ''}" data-kf="tog" title="${tr('kf_tip')}">${icon('diamond')}<span>${tr('keyframe')}</span></button>` +
  `<button class="ib" data-kf="next" title="${tr('kf_next')}">${icon('chevron-right')}</button></div>`;
const trkBtns = it => grp('tracking', `<button class="wide" id="trkGo">${icon('crosshair')} ${tr(it.trk ? 'trk_redo' : 'trk_go')}</button>` + (it.trk ? `<button class="wide" id="trkClear">${tr('trk_clear')}</button>` : ''));
// Eyedropper: the next click on the preview takes that pixel's colour into the chosen colour box.
let pickInput = null;
function startPick(inp) {
  pickInput = inp;
  view.classList.add('picking');
  toast(tr('pickHint'));
}
function endPick() { pickInput = null; view.classList.remove('picking'); }
view.addEventListener('pointerdown', e => {
  if (!pickInput) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const r = view.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) * P.w / r.width), y = Math.floor((e.clientY - r.top) * P.h / r.height);
  const d = vctx.getImageData(clamp(x, 0, P.w - 1), clamp(y, 0, P.h - 1), 1, 1).data, hx = v => v.toString(16).padStart(2, '0');
  const inp = pickInput; endPick();
  if (!document.body.contains(inp)) return;
  inp.value = '#' + hx(d[0]) + hx(d[1]) + hx(d[2]);
  inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
}, true);
window.addEventListener('keydown', e => { if (pickInput && e.key === 'Escape') endPick(); });
function addPickers(root) {
  for (const inp of root.querySelectorAll('input[type=color]')) {
    if (inp.nextElementSibling && inp.nextElementSibling.classList.contains('pick')) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ib pick'; b.title = tr('pickColor'); b.innerHTML = icon('pipette');
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); startPick(inp); };
    inp.after(b);
  }
}
// Drag sideways on a number field's label to scrub its value.
$('#inspBody').addEventListener('pointerdown', e => {
  const lb = e.target.closest('.f > .lb'), inp = lb && lb.parentElement.querySelector('input[type=number][data-k]');
  if (!inp || e.button !== 0) return;
  e.preventDefault();
  const x0 = e.clientX, v0 = +inp.value || 0, st = +inp.step || 0.01, k = inp.dataset.k;
  const mv = ev => {
    const step = (k === 'start' || k === 'dur') ? 1 / P.fps : st >= 1 ? st : st;
    let v = v0 + Math.round((ev.clientX - x0) / 3) * step;
    if (k === 'dur') v = Math.max(1 / P.fps, v);
    if (k === 'start') v = Math.max(0, v);
    inp.value = +v.toFixed(3);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); inp.dispatchEvent(new Event('change', { bubbles: true })); }, { once: true });
});
function inspector() {
  kfSyncT = -1;
  if (libTab === 'trans') renderTrans();
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
    h.push(`<div class="f"><textarea data-k="text" dir="auto">${esc(it.text)}</textarea></div>`, hideRow(it));
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
      `<div class="tbar"><span>${tr('dir')}</span><div class="tg">${[['ltr', 'pilcrow-right'], ['rtl', 'pilcrow-left']].map(([v, ic]) => `<button data-set="dir" data-v="${v}" class="${st.dir === v ? 'on' : ''}" title="${tr('dir_' + v + 'T')}">${icon(ic)}</button>`).join('')}</div></div>` +
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
      h.push(`<div class="agrid">${list.map(a => `<button data-anim="${a}" class="${a === curA ? 'on' : ''}">${a === 'none' ? icon('x') : `<canvas data-a="${a}" width="120" height="80"></canvas>`}<span>${tr('an_' + a)}</span></button>`).join('')}</div>`);
      if (animSub !== 'loop' && curA !== 'none') h.push(fld.range(animSub === 'in' ? 'inDur' : 'outDur', 'animDur', 0.1, 3, 0.05, it, animSub === 'in' ? 0.5 : 0.4));
      if (V) h.push(fades);
    }
  } else if (inspTab === 'tVideo' && media(it).adj) {
    h.push(`<p class="hint">${tr('adjHint')}</p>`, timing, hideRow(it),
      grp('fxSec', fld.select('fx.id', 'effect', [['', tr('fx_none')], ...S.FX.map(x => [x, tr('fx_' + x)])], it) + (S.fxOf(it) ? fld.range('fx.a', 'fxAmt', 0, 1, 0.01, it, 0.5) : '')),
      grp('filters', fld.select('preset', 'filters', Object.keys(S.PRESETS).map(x => [x, tr('p_' + x)]), it)),
      fld.range('opacity', 'opacity', 0, 1, 0.01, it, 1), fades);
  } else if (inspTab === 'tVideo') {
    const FM = media(it).fill;
    h.push(`<div class="f hint" style="direction:ltr;text-align:start">${esc(media(it).name)}</div>`, timing, hideRow(it));
    if (FM) {
      const f = it.fill = { ...FILL_DEF, ...it.fill }, gr = f.type !== 'solid';
      h.push(grp('fillSec', fld.select('fill.type', 'fillType', ['solid', 'linear', 'radial'].map(x => [x, tr('ft_' + x)]), it) +
        `<div class="inl">${fld.color('fill.c1', gr ? 'color1' : 'color', it)}${gr ? fld.color('fill.c2', 'color2', it) : ''}</div>` +
        (gr ? `<div class="row2">${fld.range('fill.a1', 'op1', 0, 1, 0.01, it, 1)}${fld.range('fill.a2', 'op2', 0, 1, 0.01, it, 1)}</div>` +
          fld.range('fill.mid', 'fillMid', 0.05, 0.95, 0.01, it, 0.5) + `<button class="wide" id="fillSwap">${icon('arrow-right-left')}${tr('fillSwap')}</button><p class="hint">${tr('fillHint')}</p>` : '')));
    }
    const ai = S.animAt(it, kfLt(it));
    h.push(grp('scale', kfBar(it) + fld.select('fit', 'fit_', [['cover', tr('cover')], ['contain', tr('contain')]], it) +
      fld.range('scale', 'scale', 0.1, 3, 0.01, ai, 1) +
      `<div class="row2">${fld.number('x', 'posX', 1, ai)}${fld.number('y', 'posY', 1, ai)}</div>` +
      fld.range('rotate', 'rotation', -180, 180, 1, ai) +
      fld.range('opacity', 'opacity', 0, 1, 0.01, ai, 1) +
      `<div class="inl">${fld.check('flipH', 'flipH', it)}${fld.check('flipV', 'flipV', it)}</div>`));
    h.push(grp('blendSec', fld.select('blend', 'blendMode', ['normal', ...Object.keys(BLENDS)].map(x => [x, tr('bm_' + x)]), it) + `<p class="hint">${tr('blendHint')}</p>`));
    h.push(grp('fxSec', fld.select('fx.id', 'effect', [['', tr('fx_none')], ...S.FX.map(x => [x, tr('fx_' + x)])], it) +
      (S.fxOf(it) ? fld.range('fx.a', 'fxAmt', 0, 1, 0.01, it, 0.5) : '')));
    if (media(it).kind === 'video') h.push(grp('stabSec', it.stabFrom ? `<button class="wide" id="stabOff">${icon('x')}${tr('stabOff')}</button>` :
      fld.select('stabLvl', 'stabLvl', [[1, tr('stab1')], [2, tr('stab2')], [3, tr('stab3')]], { stabLvl: num(it.stabLvl, 2) }) +
      (stabBusy.has(it.media) ? `<p class="hint work">${tr('stabWork')}</p>` : `<button class="wide" id="stabGo">${icon('vibrate')}${tr('stabGo')}</button>`) + `<p class="hint">${tr('stabHint')}</p>`));
    if (it.track !== 'v1') h.push(trkBtns(it));
    if (!FM) h.push(`<div id="cropGrp">${grp('cropSec', `<div class="row2">${fld.range('crop.l', 'cropL', 0, 0.45, 0.01, it)}${fld.range('crop.r', 'cropR', 0, 0.45, 0.01, it)}</div>` +
      `<div class="row2">${fld.range('crop.t', 'cropT', 0, 0.45, 0.01, it)}${fld.range('crop.b', 'cropB', 0, 0.45, 0.01, it)}</div>`)}</div>`);
    const K = it.chroma || {};
    if (!FM) h.push(grp('keySec', `<div class="inl">${fld.check('chroma.on', 'keyOn', it)}</div>` + (K.on ? `<div class="row2"><label>${tr('keyColor')}<input type="color" data-k="chroma.color" value="${esc(K.color || '#00ff00')}"></label><button id="keyPick" data-i="pipette"><span>${tr('keyPick')}</span></button></div>` +
      fld.range('chroma.sim', 'keySim', 0.01, 1, 0.01, it, 0.3) + fld.range('chroma.blend', 'keyBlend', 0, 1, 0.01, it, 0.1) : '') + `<p class="hint">${tr('keyHint')}</p>`));
    const lo = it.logo && it.logo.on;
    if (!FM) h.push(grp('logoSec', `<div class="inl">${fld.check('logo.on', 'logoOn', it)}</div>` + (lo ?
      `<div class="row2">${fld.range('logo.x', 'posX', 0, 0.99, 0.005, it)}${fld.range('logo.y', 'posY', 0, 0.99, 0.005, it)}</div>` +
      `<div class="row2">${fld.range('logo.w', 'lgW', 0.02, 1, 0.005, it, 0.18)}${fld.range('logo.h', 'lgH', 0.02, 1, 0.005, it, 0.1)}</div>` : '') +
      `<p class="hint">${tr('logoHint')}</p>`));
  } else if (inspTab === 'tAudio') {
    if (media(it).kind === 'audio') h.push(`<div class="f hint" style="direction:ltr;text-align:start">${esc(media(it).name)}</div>`, timing);
    h.push(fld.range('volume', 'volume', 0, 2, 0.01, it, 1), `<div class="inl">${fld.check('muted', 'mute', it)}</div>`);
    if (media(it).kind !== 'audio') h.push(`<div class="row2">${fld.range('afIn', 'fadeIn', 0, 5, 0.05, it)}${fld.range('afOut', 'fadeOut', 0, 5, 0.05, it)}</div>`);
    h.push(grp('dnSec', `<div class="inl">${fld.check('norm', 'normalize', it)}</div><p class="hint">${tr('normHint')}</p>` +
      `<div class="inl">${fld.check('denoise', 'denoise', it)}</div><p class="hint">${tr('denoiseHint')}</p>` +
      (S.fxKey(it) && !dnLive(it) ? `<p class="hint work">${tr('dnWork')}</p>` : '')));
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
    h.push(`<div class="seg csub">${['basic', 'hsl', 'curves', 'wheels', 'lut', 'mask'].map(x => `<button data-csub="${x}" class="${x === colSub ? 'on' : ''}">${tr('cs_' + x)}</button>`).join('')}</div>`);
    const C = it.color || {};
    if (colSub === 'basic') {
      h.push(fld.select('preset', 'filter', Object.keys(S.PRESETS).map(p => [p, tr('p_' + p)]), it));
      h.push(fld.range('brightness', 'brightness', 0.5, 1.5, 0.01, it, 1), fld.range('contrast', 'contrast', 0.5, 1.5, 0.01, it, 1));
      h.push(fld.range('saturation', 'saturation', 0, 2, 0.01, it, 1), fld.range('temp', 'temp', -1, 1, 0.01, it));
      h.push(`<div class="row2 cbtns"><button id="autoAdj" data-i="wand-sparkles"><span>${tr('autoAdj')}</span></button><button id="colMatch" data-i="pipette"><span>${tr('colMatch')}</span></button></div><p class="hint">${tr('autoHint')}</p>`);
      h.push(`<button class="wide" id="colReset" data-i="rotate-ccw"><span>${tr('resetAllColor')}</span></button>`);
    } else if (colSub === 'hsl') {
      h.push(`<div class="hsw">${S.HSL_BANDS.map(([b, hc]) => { const v = (C.hsl || {})[b]; const used = v && (num(v.h, 0) || num(v.s, 0) || num(v.l, 0));
        return `<button data-hsl="${b}" class="${b === hslSel ? 'on' : ''}${used ? ' used' : ''}" style="--hc:hsl(${hc} 85% 55%)" title="${tr('hc_' + b)}"></button>`; }).join('')}</div>`);
      h.push(fld.range(`color.hsl.${hslSel}.h`, 'hue', -100, 100, 1, it), fld.range(`color.hsl.${hslSel}.s`, 'saturation', -100, 100, 1, it), fld.range(`color.hsl.${hslSel}.l`, 'lightness', -100, 100, 1, it));
      h.push(`<button class="wide" id="hslReset" data-i="rotate-ccw"><span>${tr('reset')}</span></button>`);
    } else if (colSub === 'curves') {
      h.push(`<div class="seg cch">${['l', 'r', 'g', 'b'].map(c => `<button data-cch="${c}" class="${c === curCh ? 'on' : ''} c-${c}">${tr('ch_' + c)}</button>`).join('')}</div>`);
      h.push(`<div class="cved"><svg id="ccEd" viewBox="0 0 256 256"></svg></div><p class="hint">${tr('curveHint')}</p>`);
      h.push(`<button class="wide" id="curReset" data-i="rotate-ccw"><span>${tr('reset')}</span></button>`);
    } else if (colSub === 'mask') {
      const M = it.mask || {}, ty = S.hasMask(it) ? M.type : 'none';
      const shp = { linear: '<path d="M2 14h20"/><path d="M2 14h20v8H2z" fill="currentColor" opacity=".35"/>', mirror: '<path d="M2 8h20M2 16h20"/><path d="M2 8h20v8H2z" fill="currentColor" opacity=".35"/>', circle: '<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".35"/>', rect: '<rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor" fill-opacity=".35"/>' };
      h.push(`<div class="mshapes">${['none', ...S.MASKS].map(x => `<button data-mask="${x}" class="${x === ty ? 'on' : ''}">${x === 'none' ? icon('x') : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${shp[x]}</svg>`}<span>${tr('mk_' + x)}</span></button>`).join('')}</div>`);
      if (ty !== 'none') {
        h.push(`<div class="row2">${fld.range('mask.x', 'mkX', 0, 1, 0.01, it, 0.5)}${fld.range('mask.y', 'mkY', 0, 1, 0.01, it, 0.5)}</div>`);
        if (ty === 'circle' || ty === 'rect') h.push(`<div class="row2">${fld.range('mask.w', 'lgW', 0.02, 1.5, 0.01, it, 0.5)}${fld.range('mask.h', 'lgH', 0.02, 1.5, 0.01, it, 0.5)}</div>`);
        if (ty === 'mirror') h.push(fld.range('mask.h', 'mkBand', 0.02, 1.5, 0.01, it, 0.5));
        h.push(fld.range('mask.rot', 'rotate', -180, 180, 1, it, 0), fld.range('mask.feather', 'mkFeather', 0, 1, 0.01, it, 0.1));
        if (ty === 'rect') h.push(fld.range('mask.round', 'mkRound', 0, 1, 0.01, it, 0));
        h.push(fld.check('mask.invert', 'mkInvert', it));
      }
    } else if (colSub === 'wheels') {
      h.push(fld.range('color.wheelMix', 'intensity', 0, 1, 0.01, it, 1));
      h.push(`<div class="whls">${['lift', 'gamma', 'gain', 'offset'].map(w => `<div class="whl" data-w="${w}"><b>${tr('w_' + w)}</b><div class="wring" data-wheel="${w}"><i></i></div>${fld.range(`color.wheels.${w}.l`, 'wLum', -1, 1, 0.01, it)}</div>`).join('')}</div>`);
      h.push(`<p class="hint">${tr('wheelHint')}</p><button class="wide" id="whlReset" data-i="rotate-ccw"><span>${tr('reset')}</span></button>`);
    } else {
      if (!lutLib) loadLutLib();
      const lf = C.lut && C.lut.file;
      h.push(`<div class="gh">${tr('lutLib')}</div>${lf ? fld.range('color.lut.mix', 'intensity', 0, 1, 0.01, it, 1) : ''}`);
      h.push(`<div class="looks lutlib"><button id="lutImport" class="add">${icon('upload')}<span>${tr('lutImport')}</span></button><button data-lutf="-1" class="${lf ? '' : 'on'}"><i class="lk0">${icon('x')}</i><span>${tr('lk_none')}</span></button>` +
        (lutLib || []).map((L, i) => `<button data-lutf="${i}" class="${lf === L.path ? 'on' : ''}" title="${esc(L.name)}"><canvas width="64" height="64"></canvas><span dir="ltr">${esc(L.name)}</span>${L.builtin ? '' : `<i class="ldel" data-lutdel="${i}" title="${tr('remove')}">×</i>`}</button>`).join('') + `</div><p class="hint">${tr('lutHint')}</p>`);
      h.push(`<div class="gh">${tr('looks')}</div>${C.look && C.look !== 'none' ? fld.range('color.lookMix', 'intensity', 0, 1, 0.01, it, 1) : ''}`);
      h.push(`<div class="looks">${['none', ...Object.keys(S.LOOKS)].map(l => `<button data-look="${l}" class="${(C.look || 'none') === l ? 'on' : ''}">${l === 'none' ? `<i class="lk0">${icon('x')}</i>` : '<canvas width="64" height="64"></canvas>'}<span>${tr('lk_' + l)}</span></button>`).join('')}</div>`);
    }
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
  if ($('#ccEd')) colorCurveEditor(it);
  if ($('.whls')) wheelsUI(it);
  if ($('.looks')) lookThumbs(it);
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
  if (cr) cr.onclick = () => { snapshot(); Object.assign(it, { preset: 'none', brightness: 1, contrast: 1, saturation: 1, temp: 0 }); delete it.color; refresh(); };
  const col = () => (it.color ??= {});
  const bind = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  bind('#hslReset', () => { snapshot(); if (it.color && it.color.hsl) delete it.color.hsl[hslSel]; refresh(); });
  bind('#curReset', () => { snapshot(); if (it.color && it.color.curves) delete it.color.curves[curCh]; refresh(); });
  bind('#whlReset', () => { snapshot(); if (it.color) { delete it.color.wheels; delete it.color.wheelMix; } refresh(); });
  bind('#lutImport', async () => {
    const f = await TA.dialog.open({ filters: [{ name: 'LUT (.cube)', extensions: ['cube', 'CUBE'] }] });
    if (!f) return;
    let p;
    try { p = await inv('lut_add', { path: f }); } catch (e) { return toast(tr('lutFail') + ': ' + cleanErr(e)); }
    userLuts.delete(p);
    if (!(await loadUserLut(p))) { inv('lut_remove', { path: p }).catch(() => {}); return; }
    snapshot(); col().lut = { file: p, mix: 1 };
    await loadLutLib(); refresh();
  });
  bind('#autoAdj', () => autoAdjust(it));
  bind('#keyPick', () => keyPick(it));
  bind('#hideBtn', () => toggleHidden());
  addPickers(body);
  bind('#stabGo', () => stabilize(it));
  bind('#stabOff', () => { snapshot(); it.media = it.stabFrom; delete it.stabFrom; dirty = true; refresh(); });
  bind('#fillSwap',() => { snapshot(); const f = it.fill; [f.c1, f.c2, f.a1, f.a2] = [f.c2, f.c1, f.a2, f.a1]; dirty = true; refresh(); });
  bind('#colMatch', () => colorMatchPick(it));
}
$('#inspBody').addEventListener('click', e => {
  const it = sel && item(sel);
  if (!it) return;
  const cs = e.target.closest('[data-csub]'), hs = e.target.closest('[data-hsl]'), ch = e.target.closest('[data-cch]'), lk = e.target.closest('[data-look]');
  if (cs) { colSub = cs.dataset.csub; needsDraw = true; inspector(); }
  else if (e.target.closest('[data-mask]')) {
    const x = e.target.closest('[data-mask]').dataset.mask;
    snapshot();
    if (x === 'none') delete it.mask;
    else it.mask = { ...S.MASK_DEF, ...(it.mask || {}), type: x };
    dirty = true; refresh();
  }
  else if (hs) { hslSel = hs.dataset.hsl; inspector(); }
  else if (ch) { curCh = ch.dataset.cch; inspector(); }
  else if (e.target.closest('[data-lutdel]')) {
    const L = lutLib[+e.target.closest('[data-lutdel]').dataset.lutdel];
    inv('lut_remove', { path: L.path }).then(loadLutLib).then(inspector, er => toast(tr('error') + ': ' + cleanErr(er)));
  } else if (e.target.closest('[data-lutf]')) {
    const i = +e.target.closest('[data-lutf]').dataset.lutf, c = (it.color ??= {});
    snapshot();
    if (i < 0) delete c.lut; else c.lut = { file: lutLib[i].path, mix: num(c.lut && c.lut.mix, 1) };
    dirty = true; refresh();
  } else if (lk) { snapshot(); const c = (it.color ??= {}); if (lk.dataset.look === 'none') delete c.look; else { c.look = lk.dataset.look; c.lookMix ??= 1; } dirty = true; refresh(); }
});
$('#inspTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-itab]');
  if (b) { inspTab = b.dataset.itab; inspector(); }
});

let editing = false, animSub = 'in', spdSub = 'std', colSub = 'basic', hslSel = 'red', curCh = 'l';

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
// A clip's frame (at its local time lt) as 96px pixels, for auto colour. Videos use a spare element.
// Background colour for the chroma key: the most common colour around the frame's edges.
async function keyPick(it) {
  const d = await framePixels(it, clamp(t - it.start, 0, it.dur)), n = 96, hist = new Map();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (x > 5 && x < n - 6 && y > 5 && y < n - 6) continue;
    const i = (y * n + x) * 4, k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4, e = hist.get(k) || [0, 0, 0, 0];
    e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2]; hist.set(k, e);
  }
  const b = [...hist.values()].sort((a, c) => c[0] - a[0])[0], hx = v => Math.round(v / b[0]).toString(16).padStart(2, '0');
  snapshot(); it.chroma = { ...(it.chroma || {}), on: true, color: '#' + hx(b[1]) + hx(b[2]) + hx(b[3]) };
  dirty = true; refresh();
}
async function framePixels(it, lt) {
  const m = media(it);
  let src = m.kind === 'image' ? imgFor(m) : null;
  if (!src) {
    src = document.createElement('video'); src.crossOrigin = 'anonymous'; src.muted = true; src.preload = 'auto'; src.src = urlOf(m);
    await new Promise((ok, no) => { src.onloadeddata = ok; src.onerror = no; });
    src.currentTime = num(it.in, 0) + S.srcAt(it, clamp(lt, 0, it.dur - 0.05));
    await new Promise(ok => { src.onseeked = ok; });
  } else if (!src.complete) await new Promise(ok => { src.onload = ok; });
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, 96, 96);
  if (m.kind !== 'image') src.removeAttribute('src');
  return x.getImageData(0, 0, 96, 96).data;
}
function frameStats(d) {
  const ch = [[], [], []], mean = [0, 0, 0], sd = [0, 0, 0], n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) { const v = d[i + k] / 255; ch[k].push(v); mean[k] += v / n; }
  for (let k = 0; k < 3; k++) { for (const v of ch[k]) sd[k] += (v - mean[k]) ** 2 / n; sd[k] = Math.sqrt(sd[k]); ch[k].sort((a, b) => a - b); }
  const q = (k, f) => ch[k][Math.min(n - 1, Math.floor(f * n))];
  return { mean, sd, lo: [0, 1, 2].map(k => q(k, 0.005)), hi: [0, 1, 2].map(k => q(k, 0.995)) };
}
// Auto adjust: per-channel levels from this frame (also neutralises a colour cast), held back to stay natural.
async function autoAdjust(it) {
  let st;
  try { st = frameStats(await framePixels(it, t - it.start)); } catch (e) { return toast(tr('error') + ': ' + cleanErr(e)); }
  snapshot();
  const lo = st.lo.map(v => +Math.min(0.25, v * 0.85).toFixed(4)), hi = st.hi.map(v => +Math.max(0.6, 1 - (1 - v) * 0.85).toFixed(4));
  (it.color ??= {}).auto = { lo, hi };
  dirty = true; refresh(); toast(tr('autoDone'));
}
// Colour match: pick another clip; this clip's mean/contrast per channel is moved onto that clip's.
function colorMatchPick(it) {
  const others = P.items.filter(x => x !== it && media(x) && media(x).kind !== 'audio' && !isText(x));
  if (!others.length) return toast(tr('matchNone'));
  $('#modal').hidden = false;
  $('#mBox').innerHTML = `<h3>${tr('colMatch')}</h3><p class="hint">${tr('matchPick')}</p><div class="mlist">${others.map((x, i) => `<button data-mi="${i}"><b dir="ltr">${esc(media(x).name)}</b><small>${x.start.toFixed(1)}s</small></button>`).join('')}</div><div class="acts"><span class="flex"></span><button id="mNo">${tr('cancel')}</button></div>`;
  $('#mNo').onclick = hideModal;
  $('#mBox').onclick = async e => {
    const b = e.target.closest('[data-mi]');
    if (!b) return;
    const ref = others[+b.dataset.mi];
    hideModal();
    try {
      const a = frameStats(await framePixels(it, t - it.start)), r = frameStats(await framePixels(ref, ref.dur / 2));
      const gain = [0, 1, 2].map(k => +clamp(r.sd[k] / Math.max(0.02, a.sd[k]), 0.5, 2).toFixed(4));
      const off = [0, 1, 2].map(k => +clamp(r.mean[k] - a.mean[k] * gain[k], -0.5, 0.5).toFixed(4));
      snapshot(); (it.color ??= {}).match = { gain, off }; dirty = true; refresh(); toast(tr('matchDone'));
    } catch (er) { toast(tr('error') + ': ' + cleanErr(er)); }
  };
}
// Colour curve editor: drag points, click the line to add one, double-click a point to remove it.
function colorCurveEditor(it) {
  const svg = $('#ccEd'), N = 256, COL = { l: '#e9edf2', r: '#ff5a5a', g: '#4cd964', b: '#4aa3ff' };
  const pts = () => ((it.color ??= {}).curves ??= {})[curCh] ??= [[0, 0], [1, 1]];
  const path = (p, cls, col) => { const f = S.curveFn(p) || (x => x); return `<path class="${cls}" stroke="${col}" d="${Array.from({ length: 65 }, (_, i) => `${i ? 'L' : 'M'}${(i / 64 * N).toFixed(1)} ${((1 - f(i / 64)) * N).toFixed(1)}`).join('')}"/>`; };
  const paint = () => {
    const C = (it.color && it.color.curves) || {};
    svg.innerHTML = `<path class="gl" d="M64 0V256M128 0V256M192 0V256M0 64H256M0 128H256M0 192H256"/><path class="gl1" d="M0 256L256 0"/>` +
      ['l', 'r', 'g', 'b'].filter(c => c !== curCh && C[c]).map(c => path(C[c], 'cv ghost', COL[c])).join('') +
      path(pts(), 'cv', COL[curCh]) + pts().map((q, i) => `<circle data-cp="${i}" cx="${q[0] * N}" cy="${(1 - q[1]) * N}" r="7" fill="${COL[curCh]}"/>`).join('');
  };
  paint();
  const at = ev => { const r = svg.getBoundingClientRect(); return [clamp((ev.clientX - r.left) / r.width, 0, 1), clamp(1 - (ev.clientY - r.top) / r.height, 0, 1)]; };
  svg.onpointerdown = e => {
    snapshot();
    let p = pts(), i = e.target.dataset.cp != null ? +e.target.dataset.cp : -1;
    if (i < 0) { const [x] = at(e), f = S.curveFn(p) || (v => v); p.push([+x.toFixed(4), +f(x).toFixed(4)]); p.sort((a, b) => a[0] - b[0]); i = p.findIndex(q => q[0] === +x.toFixed(4)); }
    const end = i === 0 || i === p.length - 1;
    const mv = ev => {
      const [x, y] = at(ev);
      p[i][1] = +y.toFixed(4);
      if (!end) p[i][0] = +clamp(x, p[i - 1][0] + 0.01, p[i + 1][0] - 0.01).toFixed(4);
      dirty = true; needsDraw = true; paint();
    };
    mv(e);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); paint(); }, { once: true });
  };
  svg.ondblclick = e => {
    const i = e.target.dataset.cp != null ? +e.target.dataset.cp : -1, p = pts();
    if (i <= 0 || i >= p.length - 1) return;
    snapshot(); p.splice(i, 1); dirty = true; needsDraw = true; paint();
  };
}
// Colour wheels: drag the dot to push that tonal range toward a hue; double-click to centre it.
function wheelsUI(it) {
  for (const ring of $$('.wring')) {
    const w = ring.dataset.wheel, dot = ring.firstElementChild;
    const get = () => ((it.color ??= {}).wheels ??= {})[w] ??= {};
    const place = () => { const v = (it.color && it.color.wheels && it.color.wheels[w]) || {}; dot.style.left = 50 + num(v.x, 0) * 50 + '%'; dot.style.top = 50 - num(v.y, 0) * 50 + '%'; };
    place();
    ring.onpointerdown = e => {
      snapshot();
      const r = ring.getBoundingClientRect();
      const mv = ev => {
        let x = (ev.clientX - r.left) / r.width * 2 - 1, y = -((ev.clientY - r.top) / r.height * 2 - 1);
        const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
        const v = get(); v.x = +x.toFixed(3); v.y = +y.toFixed(3);
        dirty = true; needsDraw = true; place();
      };
      mv(e);
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
    };
    ring.ondblclick = () => { snapshot(); const v = get(); v.x = v.y = 0; dirty = true; needsDraw = true; place(); };
  }
}
// LUT library (shipped + imported .cube files).
let lutLib = null;
async function loadLutLib() {
  try { lutLib = await inv('lut_library'); } catch { lutLib = []; }
  if (inspTab === 'tAdjust' && colSub === 'lut') inspector();
  return lutLib;
}
// Look cards show the clip's own current frame through each look.
function lookThumbs(it) {
  const m = media(it), src = m.kind === 'image' ? imgFor(m) : elFor(it);
  const ok = m.kind === 'image' ? src.complete && src.naturalWidth : src.readyState >= 2;
  if (!ok) return;
  const W = src.videoWidth || src.naturalWidth, H = src.videoHeight || src.naturalHeight, s = Math.min(W, H);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, (W - s) / 2, (H - s) / 2, s, s, 0, 0, 64, 64);
  let base;
  try { base = x.getImageData(0, 0, 64, 64); } catch { return; }
  for (const cv of $$('.lutlib [data-lutf] canvas')) {
    const L = lutLib && lutLib[+cv.parentElement.dataset.lutf];
    if (L) loadUserLut(L.path).then(T => {
      if (!T || !cv.isConnected) return;
      const out = new ImageData(64, 64), d = base.data, o = out.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = S.sampleLut(T, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
        o[i] = clamp(v[0], 0, 1) * 255; o[i + 1] = clamp(v[1], 0, 1) * 255; o[i + 2] = clamp(v[2], 0, 1) * 255; o[i + 3] = 255;
      }
      cv.getContext('2d').putImageData(out, 0, 0);
    });
  }
  for (const b of $$('.looks [data-look] canvas')) {
    const f = S.LOOKS[b.parentElement.dataset.look], out = new ImageData(64, 64), d = base.data, o = out.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = f(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      o[i] = clamp(v[0], 0, 1) * 255; o[i + 1] = clamp(v[1], 0, 1) * 255; o[i + 2] = clamp(v[2], 0, 1) * 255; o[i + 3] = 255;
    }
    b.getContext('2d').putImageData(out, 0, 0);
  }
}
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
  const nk = e.target.dataset.num;
  if (!nk || e.target.value === '' || !isFinite(+e.target.value)) return;
  const r = document.querySelector(`#inspBody input[type=range][data-k="${nk}"]`);
  if (!r) return;
  r.value = PCT.test(nk) ? +e.target.value / 100 : +e.target.value;
  r.dispatchEvent(new Event('input', { bubbles: true }));
});
$('#inspBody').addEventListener('change', e => { // out-of-range numbers snap back to what the slider took
  const nk = e.target.dataset.num, r = nk && document.querySelector(`#inspBody input[type=range][data-k="${nk}"]`);
  if (r) e.target.value = dispVal(nk, +r.value);
});
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
  if (k === 'logo.on') {
    if (v && it.logo.w == null) Object.assign(it.logo, { x: 0.78, y: 0.04, w: 0.18, h: 0.1 });
    inspector();
  }
  if ((k === 'denoise' || k === 'norm') && S.fxKey(it) && !dnLive(it)) {
    ensureDn(it).then(() => { toast(tr('dnDone')); if (sel === it.id) inspector(); },
      er => { it[k] = false; if (sel === it.id) inspector(); toast(tr('dnFail') + ': ' + cleanErr(er)); });
    inspector();
  } else if (k === 'denoise' || k === 'norm') inspector();
  if (e.target.type === 'range') setShow(k, v);
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
    it.style[k] = k === 'caseMode' && it.style[k] === v ? 'none' : k === 'dir' && it.style[k] === v ? 'auto' : v; // a second click turns it back off
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
    for (const it of [...P.items].reverse()) if (it.track === order[i] && !isText(it) && !it.hidden && active(it, t) && media(it).kind !== 'audio' && !media(it).adj && inBox(visBox(it, t - it.start), x, y)) return it;
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
view.addEventListener('dblclick', e => {
  const r = view.getBoundingClientRect(), k = P.w / r.width;
  const hit = hitAt((e.clientX - r.left) * k, (e.clientY - r.top) * k);
  if (hit && isText(hit)) editTextInline(hit);
});
function editTextInline(it) {
  const b = textBoxes.get(it.id);
  if (!b || editId) return;
  setPlaying(false);
  select(it.id);
  const st = { ...textDefaults(it.track === 'c1'), ...it.style }, orig = it.text;
  const vr = view.getBoundingClientRect(), sr = $('#stage').getBoundingClientRect(), k = vr.width / P.w;
  const fs = st.size * propNow(it, 'scale') * k, w = Math.max(160, b.w * k + fs);
  const ta = document.createElement('textarea');
  ta.id = 'tedit';
  ta.value = it.text;
  ta.dir = st.dir === 'rtl' || st.dir === 'ltr' ? st.dir : 'auto';
  Object.assign(ta.style, {
    font: `${st.italic ? 'italic ' : ''}${st.weight} ${fs}px "${st.font}", Cairo`, lineHeight: num(st.lineH, 1.3),
    color: st.color, textAlign: st.align || 'center', width: w + 'px',
    left: vr.left - sr.left + b.cx * k - w / 2 + 'px', transform: `rotate(${b.rot}deg)`,
  });
  $('#stage').appendChild(ta);
  editId = it.id;
  needsDraw = true;
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.top = vr.top - sr.top + b.cy * k - ta.offsetHeight / 2 + 'px'; };
  fit();
  ta.focus(); ta.select();
  let snapped = false;
  ta.oninput = () => { if (!snapped) { snapshot(); snapped = true; } it.text = ta.value; fit(); };
  const done = keep => {
    if (editId !== it.id) return;
    editId = null;
    if (!keep) it.text = orig;
    ta.remove();
    if (!it.text.trim()) it.text = orig; // an emptied text keeps its old words
    refresh();
  };
  ta.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') done(false);
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) done(true);
  };
  ta.onblur = () => done(true);
}
view.addEventListener('pointerdown', e => {
  const r = view.getBoundingClientRect(), k = P.w / r.width, x0 = e.clientX, y0 = e.clientY;
  if (e.button !== 0) return;
  const cf = sel && item(sel);
  if (cf && !isText(cf) && media(cf) && media(cf).fill && cf.fill && cf.fill.type !== 'solid' && !cf.hidden && active(cf, t)) {
    const lt = t - cf.start, L = S.layout(S.withVa(S.animAt(cf, lt), lt, P.w, P.h), media(cf), P.w, P.h), p = fillPts(cf.fill, L);
    const px = (x0 - r.left) * k, py = (y0 - r.top) * k, near = q => Math.hypot(q[0] - px, q[1] - py) < 14 * k;
    const hd = near(p.mid) ? 'mid' : near(p.p2) ? 'p2' : near(p.p1) ? 'p1' : null;
    if (hd) {
      snapshot();
      const f = cf.fill;
      const mv = ev => {
        const X = ((ev.clientX - r.left) * k - L.ox) / L.cw, Y = ((ev.clientY - r.top) * k - L.oy) / L.ch;
        if (hd === 'mid') { const dx = f.x2 - f.x1, dy = f.y2 - f.y1; f.mid = +clamp(((X - f.x1) * dx + (Y - f.y1) * dy) / (dx * dx + dy * dy || 1), 0.05, 0.95).toFixed(3); }
        else { f[hd === 'p1' ? 'x1' : 'x2'] = +X.toFixed(4); f[hd === 'p1' ? 'y1' : 'y2'] = +Y.toFixed(4); }
        dirty = true; needsDraw = true;
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); inspector(); }, { once: true });
      return;
    }
  }
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
// Library tab bar slides sideways: trackpad swipe, mouse wheel, or the edge arrows (shown only when there is more that way).
const libBar = (() => {
  const bar = $('#libTabs'), wrap = document.createElement('div');
  wrap.className = 'tabwrap';
  bar.before(wrap); wrap.append(bar);
  const arrow = (side, dx) => { const b = document.createElement('button'); b.className = 'tarr ' + side; b.innerHTML = icon(side === 'l' ? 'chevron-left' : 'chevron-right'); b.onclick = () => bar.scrollBy({ left: dx * bar.clientWidth * 0.7 }); wrap.append(b); return b; };
  const L = arrow('l', -1), R = arrow('r', 1);
  const edges = () => {
    const r = bar.getBoundingClientRect(), kids = [...bar.children].map(c => c.getBoundingClientRect());
    L.hidden = !(Math.min(...kids.map(k => k.left)) < r.left - 1);
    R.hidden = !(Math.max(...kids.map(k => k.right)) > r.right + 1);
  };
  bar.addEventListener('scroll', edges);
  bar.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { bar.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  new ResizeObserver(edges).observe(bar);
  return { edges, show: b => { const r = b.getBoundingClientRect(), q = bar.getBoundingClientRect(); bar.scrollBy({ left: r.left + r.width / 2 - (q.left + q.width / 2) }); setTimeout(edges, 400); } };
})();
function setLibTab(tab) {
  const tb = $(`#libTabs [data-tab="${tab}"]`);
  if (tb) libBar.show(tb);
  libTab = tab;
  if (tab === 'trans') renderTrans();
  if (tab === 'filters' || tab === 'effects') renderLookCards();
  if (tab === 'layers') { renderLayers(); renderOverlays(); }
  if (tab === 'sounds') loadSfx();
  else if (!sfxAudio.paused) sfxAudio.pause();
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
  return Object.entries(P.media).filter(([, m]) => !m.fill && !m.adj && (!q || m.name.toLowerCase().includes(q))).sort(cmp).map(([id]) => id);
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
    vid && ['freeze', freezeFrame], !isText(it) && media(it).kind !== 'audio' && ['rotate90', rotateSel], (isText(it) || media(it).kind !== 'audio') && [it.hidden ? 'showLayer' : 'hideLayer', toggleHidden], ['-'], ['del', removeSel, 'danger']]);
});

/* ---------- hide / show layers ---------- */
const hideRow = it => `<button class="wide hidebtn${it.hidden ? ' on' : ''}" id="hideBtn">${icon(it.hidden ? 'eye-off' : 'eye')}${tr(it.hidden ? 'showLayer' : 'hideLayer')}</button>`;
function toggleHidden() {
  const ids = selIds().filter(id => { const i = item(id); return i && (isText(i) || media(i).kind !== 'audio'); });
  if (!ids.length) return;
  snapshot();
  const v = !item(ids[0]).hidden;
  for (const id of ids) { const i = item(id); if (v) i.hidden = true; else delete i.hidden; }
  dirty = true; refresh();
}

/* ---------- transitions pane ---------- */
// The cut a transition goes on: the selected clip if a clip ends right where it starts, else the
// clip right after the selected one, else the main-track cut nearest the playhead.
function transTarget() {
  const ok = b => b && !isText(b) && media(b) && media(b).kind !== 'audio' && !b.hidden && S.transIn(P, { ...b, trans: { id: 'fade' } });
  const cur = sel && item(sel);
  if (ok(cur)) return cur;
  if (cur) { const nx = P.items.find(i => i.track === cur.track && i.id !== cur.id && Math.abs(i.start - cur.start - cur.dur) < 0.5 / P.fps); if (ok(nx)) return nx; }
  let best = null;
  for (const b of P.items) if (b.track === 'v1' && ok(b) && (!best || Math.abs(b.start - t) < Math.abs(best.start - t))) best = b;
  return best;
}
function renderTrans() {
  const tg = transTarget(), T = tg && S.transIn(P, tg), cur = T ? T.id : 'none';
  $('#transHead').innerHTML = !tg ? `<p class="hint">${tr('trNone')}</p>` :
    `<p class="hint">${tr('trAt', { t: fmt(tg.start) })}</p>` + (T ? `<div class="f"><div class="lb"><span>${tr('dur')}</span><b>${T.d.toFixed(1)}s</b></div>` +
      `<input type="range" id="trDur" min="0.1" max="${Math.min(2, tg.dur).toFixed(2)}" step="0.05" value="${T.d}"></div>` : '');
  if (!TR_CATS.includes(trCat)) trCat = 'hot';
  $('#trCats').innerHTML = TR_CATS.map(c => `<button class="chip${c === trCat ? ' on' : ''}" data-cat="${c}">${tr('trc_' + c)}</button>`).join('');
  const ids = trCat === 'hot' ? TR_HOT : trCat === 'basic' ? S.TRANS : KadrGLT.ids.filter(x => KadrGLT.cat[x] === trCat);
  $('#transCards').innerHTML = ['none', ...ids].map(id => `<button class="trc${id === cur ? ' on' : ''}" data-tr="${id}"${tg ? '' : ' data-off'}>` +
    (S.GLT.includes(id) ? `<i class="tv"><canvas data-gl="${id}" width="160" height="100"></canvas></i>` : `<i class="tv tv-${id}"><b></b></i>`) +
    `<span>${tr('tr_' + id)}</span>${id === 'none' ? '' : `<i class="plus" title="${tr('trApply')}">${icon('plus')}</i>`}</button>`).join('');
  transThumbs(performance.now() / 1000);
  const d = $('#trDur');
  if (d) {
    d.onpointerdown = () => snapshot();
    d.oninput = () => { tg.trans.dur = +d.value; d.previousElementSibling.lastElementChild.textContent = (+d.value).toFixed(1) + 's'; dirty = true; needsDraw = true; };
    d.onchange = () => { renderTimeline(); previewTrans(tg); };
  }
}
// Transition cards: the shader ones play on two sample pictures, each card at its own point in the loop.
const TR_CATS = ['hot', 'basic', ...KadrGLT.CATS];
const TR_HOT = ['lensIn', 'whipL', 'spinZoom', 'glitchBlock', 'flash', 'cubeL', 'swirl', 'leakWarm', 'gallery', 'tiles', 'snap', 'burn', 'shakeCam', 'heart', 'torn', 'rgbSplit', 'fade', 'slideL'];
let trCat = 'hot', trPics = null;
$('#trCats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { trCat = c.dataset.cat; renderTrans(); $('#transCards').scrollTop = 0; } });
function sampleScene2(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 180);
  g.addColorStop(0, '#3fd0c9'); g.addColorStop(1, '#173a63');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 240, 180);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  for (let x = 0; x <= 240; x += 30) { ctx.beginPath(); ctx.moveTo(x, 100); ctx.lineTo(120 + (x - 120) * 2.2, 180); ctx.stroke(); }
  for (const y of [112, 128, 150, 178]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(240, y); ctx.stroke(); }
  ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(70, 52, 22, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(150, 40, 46, 60); ctx.fillStyle = '#173a63'; ctx.fillRect(160, 52, 10, 14); ctx.fillRect(178, 52, 10, 14);
}
function transThumbs(now) {
  const cs = $$('#transCards canvas[data-gl]');
  if (!cs.length) return;
  if (!trPics) trPics = [cardCanvas(sampleScene, 160, 100), cardCanvas(sampleScene2, 160, 100)];
  cs.forEach((c, i) => {
    const per = 2.2, q = clamp(((now + i * 0.37) % per) / per * 1.5 - 0.25, 0, 1);
    try { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(GLX.thumb.frame(c.dataset.gl, trPics[0], trPics[1], q), 0, 0); }
    catch (e) { if (!c._err) { c._err = 1; console.error(e); } }
  });
}
function previewTrans(tg) {
  const T = S.transIn(P, tg);
  if (!T) return;
  setPlaying(false); seek(Math.max(0, tg.start - 0.6)); setPlaying(true);
  clearTimeout(previewTrans.tm);
  previewTrans.tm = setTimeout(() => { if (playing) setPlaying(false); }, (T.d + 1.2) * 1000);
}
$('#transCards').addEventListener('click', e => {
  const b = e.target.closest('[data-tr]'), tg = b && transTarget();
  if (b && !tg) return toast(tr('trNone'));
  if (!tg) return;
  snapshot();
  if (b.dataset.tr === 'none') delete tg.trans;
  else tg.trans = { id: b.dataset.tr, dur: num(tg.trans && tg.trans.dur, 0.5) };
  dirty = true;
  select(tg.id); refresh();
  previewTrans(tg);
});
$('#rows').addEventListener('click', e => {
  const b = e.target.closest('.trn');
  if (!b) return;
  select(b.dataset.trn); setLibTab('trans');
});

/* ---------- fill layers pane ---------- */
const LAYERS = {
  shadow: { type: 'linear', c1: '#000000', a1: 0, c2: '#000000', a2: 0.85, x1: 0.5, y1: 0.4, x2: 0.5, y2: 1, mid: 0.5 },
  gradient: { type: 'linear', c1: '#5cd3c6', a1: 1, c2: '#141518', a2: 1, x1: 0, y1: 0, x2: 1, y2: 1, mid: 0.5 },
  vignette: { type: 'radial', c1: '#000000', a1: 0, c2: '#000000', a2: 0.8, x1: 0.5, y1: 0.5, x2: 1, y2: 1, mid: 0.6 },
  solid: { type: 'solid', c1: '#5cd3c6', a1: 1 },
};
function renderLayers() {
  $('#layerCards').innerHTML = Object.keys(LAYERS).map(id => `<button class="trc" data-layer="${id}"><i class="lv"><canvas width="96" height="56"></canvas></i><span>${tr('ly_' + id)}</span></button>`).join('');
  for (const c of $$('#layerCards canvas')) {
    const g = c.getContext('2d');
    g.fillStyle = '#7d8a96'; g.fillRect(0, 0, 96, 56); g.fillStyle = '#b8c4cc'; g.fillRect(0, 34, 96, 22); // a little "scene" under the layer
    paintFill(g, LAYERS[c.closest('[data-layer]').dataset.layer], 96, 56);
  }
}
function addFill(id) {
  const mid = 'fill_' + uid();
  P.media[mid] = { kind: 'image', fill: true, name: tr('ly_' + id), w: P.w, h: P.h, path: '' };
  const busy = tk => P.items.some(i => i.track === tk && i.start < t + 5 && i.start + i.dur > t);
  const tk = (P.tracks.find(x => x.kind === 'video' && x.id !== 'v1' && !busy(x.id)) || { id: 'v2' }).id;
  const it = addMedia(mid, tk, t);
  it.fill = { ...FILL_DEF, ...LAYERS[id] };
  inspTab = 'tVideo';
  refresh();
}
$('#layerCards').addEventListener('click', e => { const b = e.target.closest('[data-layer]'); if (b) addFill(b.dataset.layer); });
// Overlay clips from the user's library (app data/overlays): added above the video in screen mode, so black drops out.
let ovLib = null;
async function renderOverlays() {
  if (!ovLib) { try { ovLib = await inv('overlay_library'); } catch { ovLib = []; } }
  $('#ovCards').innerHTML = !ovLib.length ? '' : `<div class="gh">${tr('overlays')}</div><div class="trcards">${ovLib.map((o, i) =>
    `<button class="trc" data-ov="${i}"><i class="lv"><video muted loop playsinline preload="metadata" src="${urlOf({ path: o.path })}#t=1"></video></i><span>${esc(o.name)}</span></button>`).join('')}</div>`;
}
$('#ovCards').addEventListener('pointerover', e => { const v = e.target.closest('[data-ov]')?.querySelector('video'); if (v && v.paused) v.play().catch(() => {}); });
$('#ovCards').addEventListener('pointerout', e => { const v = e.target.closest('[data-ov]')?.querySelector('video'); if (v && !e.relatedTarget?.closest?.('[data-ov]')) v.pause(); });
$('#ovCards').addEventListener('click', async e => {
  const b = e.target.closest('[data-ov]');
  if (!b) return;
  const [mid] = addToBin(await inv('probe', { paths: [ovLib[+b.dataset.ov].path] }));
  if (!mid) return;
  const busy = tk => P.items.some(i => i.track === tk && i.start < t + 3 && i.start + i.dur > t);
  let tk = P.tracks.find(x => x.kind === 'video' && x.id !== 'v1' && !busy(x.id));
  if (!tk) { tk = { id: 'v' + uid(), kind: 'video' }; P.tracks.splice(P.tracks.findIndex(x => x.kind === 'video'), 0, tk); }
  const it = addMedia(mid, tk.id, t);
  it.blend = 'screen'; it.muted = true;
  inspTab = 'tVideo'; refresh();
});

/* ---------- sound effects pane ---------- */
let sfxLib = null;
const sfxAudio = new Audio();
async function loadSfx(force) {
  if (!sfxLib || force) { try { sfxLib = await inv('sfx_library'); } catch { sfxLib = []; } }
  const cats = [...new Set(sfxLib.map(s => s.cat))], cur = $('#sfxCat').value;
  $('#sfxCat').innerHTML = `<option value="">${tr('sfxAll')} (${sfxLib.length})</option>` + cats.map(c => `<option${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('');
  renderSfx();
}
function renderSfx() {
  const q = $('#sfxQ').value.trim().toLowerCase(), c = $('#sfxCat').value;
  const list = (sfxLib || []).map((s, i) => [s, i]).filter(([s]) => (!c || s.cat === c) && (!q || (s.name + ' ' + s.cat).toLowerCase().includes(q)));
  $('#sfxList').innerHTML = !sfxLib || !sfxLib.length ? `<p class="hint">${tr('sfxEmpty')}</p>` : list.map(([s, i]) =>
    `<div class="sfx" data-sfx="${i}" title="${esc(s.cat)}"><button class="ib" data-play>${icon(sfxAudio.dataset.i === String(i) && !sfxAudio.paused ? 'pause' : 'play')}</button><span>${esc(s.name)}</span><button class="ib" data-add title="${tr('sfxAdd')}">${icon('plus')}</button></div>`).join('');
}
async function addSfx(s) {
  const [mid] = addToBin(await inv('probe', { paths: [s.path] }));
  const m = mid && P.media[mid];
  if (!m) return;
  const free = P.tracks.filter(x => x.kind === 'audio').map(x => x.id).find(a => !P.items.some(i => i.track === a && i.start < t + m.dur && i.start + i.dur > t)) || 'a2';
  addMedia(mid, free, t);
}
$('#sfxList').addEventListener('click', e => {
  const row = e.target.closest('[data-sfx]'), s = row && sfxLib[+row.dataset.sfx];
  if (!s) return;
  if (e.target.closest('[data-add]')) return addSfx(s);
  if (sfxAudio.dataset.i === row.dataset.sfx && !sfxAudio.paused) sfxAudio.pause();
  else { sfxAudio.src = urlOf(s); sfxAudio.dataset.i = row.dataset.sfx; sfxAudio.play().catch(() => {}); }
  renderSfx();
});
$('#sfxList').addEventListener('dblclick', e => { const row = e.target.closest('[data-sfx]'); if (row) addSfx(sfxLib[+row.dataset.sfx]); });
sfxAudio.onended = sfxAudio.onpause = () => renderSfx();
$('#sfxQ').addEventListener('input', renderSfx);
$('#sfxCat').addEventListener('change', renderSfx);
$('#sfxImport').addEventListener('click', async () => {
  const d = await TA.dialog.open({ directory: true });
  if (!d) return;
  try { const n = await inv('sfx_import', { dir: d }); toast(tr('sfxImported', { n })); loadSfx(true); } catch (e) { toast(tr('error') + ': ' + cleanErr(e)); }
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
// Stabilize: the source is processed once (video_stab, cached) and the clip switches to the steady copy;
// "remove" switches back. The original stays in the bin.
const stabBusy = new Set();
async function stabilize(it) {
  const m = media(it), from = it.media, lvl = num(it.stabLvl, 2);
  if (stabBusy.has(from)) return;
  stabBusy.add(from); inspector();
  try {
    const path = await inv('video_stab', { path: m.path, level: lvl });
    const [id] = addToBin(await inv('probe', { paths: [path] }));
    if (!id) throw new Error('probe');
    P.media[id].name = m.name.replace(/\.[^.]+$/, '') + ' · ' + tr('stabTag');
    snapshot();
    for (const x of P.items) if (x.media === from && (x.id === it.id || msel.has(x.id))) { x.stabFrom = from; x.media = id; }
    dirty = true; toast(tr('stabDone'));
  } catch (e) { toast(tr('stabFail') + ': ' + cleanErr(e)); }
  stabBusy.delete(from);
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
    const fake = { text: LANG === 'ar' ? 'ماكتو' : 'Maqto', style: { ...presetStyle(s.id), size: 46, strokeW: (s.s.strokeW || 0) * 0.45, shadowBlur: 8, shadowDist: 5, glowSize: 16 }, x: 0.5, y: 0.5, dur: 9 };
    b.appendChild(cardCanvas(ctx => { ctx.fillStyle = '#20262f'; ctx.fillRect(0, 0, 240, 180); drawTextItem(ctx, { w: 240, h: 180 }, fake, 5); }));
    ts.appendChild(b);
  }
  renderLookCards();
  renderStickers();
}
// The selected clip's current picture (cover-cropped to 240x180), or null.
function clipThumb(it = sel && item(sel)) {
  const m = it && !isText(it) && media(it);
  if (!m || m.kind === 'audio' || m.fill || m.adj) return null;
  const src = m.kind === 'image' ? imgFor(m) : els.get(chainKey(it));
  const W = src && (src.videoWidth || src.naturalWidth), H = src && (src.videoHeight || src.naturalHeight);
  if (!W || !H) return null;
  const k = Math.max(240 / W, 180 / H);
  return cardCanvas(ctx => ctx.drawImage(src, (240 - W * k) / 2, (180 - H * k) / 2, W * k, H * k));
}
// Filter and effect cards show the selected clip (or a sample picture) with each look applied.
const FX_SHOW = { shake: 0.3, zoomPulse: 0.125, flash: 1 / 6, glitch: 1.1 }; // a moment where the effect shows
function renderLookCards() {
  const scene = clipThumb() || cardCanvas(sampleScene), it = sel && item(sel);
  const fill = (box, list, attr, paint, cap, on) => {
    box.innerHTML = '';
    for (const x of list) {
      const b = document.createElement('button');
      b.className = 'card' + (on === x ? ' on' : '');
      b.dataset[attr] = x;
      b.appendChild(cardCanvas(paint(x)));
      b.insertAdjacentHTML('beforeend', `<span class="cap">${tr(cap + x)}</span>${x === 'none' ? '' : `<i class="plus" data-plus title="${tr('addLayer')}">${icon('plus')}</i>`}`);
      box.appendChild(b);
    }
  };
  fill($('#filterCards'), Object.keys(S.PRESETS), 'preset', p => ctx => drawGraded(ctx, { preset: p }, scene, 0, 0, 240, 180, 0, 0, 240, 180), 'p_', it && it.preset);
  fill($('#fxCards'), S.FX, 'fx', f => ctx => drawGraded(ctx, { fx: { id: f, a: 0.7 } }, scene, 0, 0, 240, 180, 0, 0, 240, 180, FX_SHOW[f] || 0), 'fx_', it && it.fx && it.fx.id);
}
function addAdj(kind, id) {
  const mid = 'adj_' + uid();
  P.media[mid] = { kind: 'image', adj: true, name: tr((kind === 'fx' ? 'fx_' : 'p_') + id), w: P.w, h: P.h, path: '' };
  const busy = tk => P.items.some(i => i.track === tk && i.start < t + 3 && i.start + i.dur > t);
  let tk = P.tracks.find(x => x.kind === 'video' && x.id !== 'v1' && !busy(x.id));
  if (!tk) { tk = { id: 'v' + uid(), kind: 'video' }; P.tracks.splice(P.tracks.findIndex(x => x.kind === 'video'), 0, tk); } // new top video track
  const it = addMedia(mid, tk.id, t);
  it.dur = 3;
  if (kind === 'fx') it.fx = { id, a: 0.5 }; else it.preset = id;
  inspTab = 'tVideo';
  refresh();
}
$('#filterCards').addEventListener('click', e => { const pl = e.target.closest('[data-plus]'); if (pl) { e.stopImmediatePropagation(); addAdj('preset', pl.closest('[data-preset]').dataset.preset); } }, true);
$('#fxCards').addEventListener('click', e => {
  const pl = e.target.closest('[data-plus]');
  if (pl) return addAdj('fx', pl.closest('[data-fx]').dataset.fx);
  const c = e.target.closest('[data-fx]'), it = sel && item(sel);
  if (!c) return;
  if (!it || isText(it) || media(it).kind === 'audio') return toast(tr('fxPick'));
  snapshot();
  if (it.fx && it.fx.id === c.dataset.fx) delete it.fx; // second click removes it
  else it.fx = { id: c.dataset.fx, a: num(it.fx && it.fx.a, 0.5) };
  inspTab = 'tVideo'; dirty = true;
  refresh(); renderLookCards();
});
// Animation grid: every preset plays on a small copy of the clip (or a word for text), looping.
let athumb = { id: null, c: null };
function animThumbs(now) {
  const cs = $$('#inspBody .agrid canvas'), it = sel && item(sel);
  if (!cs.length || !it) return;
  const V = !isText(it);
  if (V && athumb.id !== it.id) athumb = { id: it.id, c: null };
  const pic = V && (athumb.c || (athumb.c = clipThumb(it)) || cardCanvas(sampleScene));
  for (const c of cs) {
    const a = c.dataset.a, g = c.getContext('2d'), W = c.width, H = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, W, H);
    if (V) {
      const per = animSub === 'loop' ? 2.4 : 1.6, u = Math.min(1, (now % per) / (per * 0.6));
      const f = animSub === 'in' ? S.VA_IN[a] : animSub === 'out' ? S.VA_OUT[a] : S.VA_LOOP[a] && S.VA_LOOP[a].f;
      if (!f) continue;
      const d = animSub === 'loop' ? f(now % per, per) : f(u), s = num(d.s, 1) * 0.62;
      g.translate(W / 2 + (d.dx || 0) * W, H / 2 + (d.dy || 0) * H); g.rotate((d.r || 0) * Math.PI / 180);
      g.globalAlpha = clamp(num(d.o, 1), 0, 1);
      g.drawImage(pic, -W * s / 2, -H * s / 2, W * s, H * s);
    } else {
      const D = 3, fake = { text: LANG === 'ar' ? 'أهلاً' : 'Aa', style: { ...presetStyle('plain'), size: 30 }, x: 0.5, y: 0.5, dur: D, inDur: 0.5, outDur: 0.4,
        anim: animSub === 'in' ? a : 'none', out: animSub === 'out' ? a : 'none', loop: animSub === 'loop' ? a : 'none' };
      const lt = animSub === 'in' ? now % 1.4 : animSub === 'out' ? Math.min(D - 1e-3, D - 0.9 + now % 1.3) : 0.6 + now % 2.4;
      drawTextItem(g, { w: W, h: H }, fake, lt);
    }
  }
}
// Stickers: emoji placed as text layers, so they scale, animate and export like any text.
const STICKERS = {
  st_react: '😂 😍 🤯 😱 🥳 😎 🤔 😭 🥹 😡 🤩 😴 🙄 😇 🤫 🫡 👏 👍 👎 🙏 💪 👀 🫶 👋',
  st_hot: '🔥 💯 ❤️ 💔 ✨ ⭐ 🌟 💥 💫 ⚡ 🎉 🎊 🎁 🏆 👑 💎 💰 🚀 🎯 📈 💡 🔔 📌 📍',
  st_mark: '➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ 🔴 🟢 🔵 🟡 ⭕ ❌ ✅ ❗ ❓ ⚠️ 🚫 💬 💭 🆕 🆓 🔝 ✔️ 🔊',
  st_life: '☀️ 🌙 🌈 ☁️ 🌊 🌹 🌸 🍀 ☕ 🍕 🍔 🍩 🎂 🍿 🎵 🎬 📸 🎥 🎤 🎮 ⚽ ✈️ 🚗 🏠',
};
function renderStickers() {
  $('#stickerList').innerHTML = Object.entries(STICKERS).map(([k, v]) => `<div class="gh">${tr(k)}</div><div class="stk">${v.split(' ').map(e => `<button data-st="${e}">${e}</button>`).join('')}</div>`).join('');
}
$('#stickerList').addEventListener('click', e => {
  const b = e.target.closest('[data-st]');
  if (!b) return;
  snapshot();
  const it = { id: uid(), type: 'text', track: 't1', start: t, dur: 3, text: b.dataset.st, style: { ...presetStyle('plain'), size: Math.round(Math.min(P.w, P.h) * 0.22) }, x: 0.5, y: 0.5, anim: 'pop', out: 'fade', sticker: true };
  P.items.push(it);
  sel = it.id; inspTab = 'tAnim'; dirty = true;
  refresh();
});
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
// Adjacent text tracks (no video between them) are rasterized together; each group keeps its place in the stack.
function textGroups(Q) {
  const out = [];
  let cur = null;
  for (const x of Q.tracks.filter(x => x.kind !== 'audio').reverse()) {
    if (x.kind !== 'text') { cur = null; continue; }
    if (!cur) out.push(cur = []);
    cur.push(x.id);
  }
  return out;
}
async function rasterizeTexts(Q, work, tracks = null, pre = 'f') {
  const texts = Q.items.filter(i => isText(i) && !i.hidden && (!tracks || tracks.includes(i.track)));
  if (!texts.length) return null;
  await Promise.all([...new Set(texts.map(i => `${i.style.weight} 40px "${i.style.font}"`))].map(f => document.fonts.load(f).catch(() => {})));
  const c = document.createElement('canvas');
  c.width = Q.w; c.height = Q.h;
  const ctx = c.getContext('2d');
  const N = Math.ceil(S.projectDur(Q) * Q.fps), list = [];
  let last = null;
  for (let f = 0; f < N; f++) {
    if (cancelled) throw new Error(tr('cancelled'));
    const time = f / Q.fps, vis = visibleTexts(Q, time).filter(i => !tracks || tracks.includes(i.track));
    const key = vis.map(it => { const s = textState(it, time - it.start); return it.id + (s.anim || it.trk || S.hasKf(it) ? 'a' + f : 'w' + s.word); }).join('|');
    if (key === last) { list[list.length - 1].frames++; continue; }
    last = key;
    ctx.clearRect(0, 0, Q.w, Q.h);
    for (const it of vis) drawTextItem(ctx, Q, it, time - it.start);
    const name = pre + String(list.length).padStart(5, '0') + '.png';
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await inv('write_frame', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-id': String(work.id), 'x-name': name } });
    list.push({ name, frames: 1 });
    if (list.length % 8 === 0) progress(tr('p_texts'), f / N);
  }
  return list;
}

// Frames of a video clip at the given local times, decoded by ffmpeg (exact, unlike seeking a <video>).
async function clipFrames(it, lts) {
  const m = media(it), at = lts.map(lt => num(it.in, 0) + S.srcAt(it, clamp(lt, 0, it.dur)));
  const s0 = Math.min(...at), span = Math.max(...at) - s0, sc = Math.min(1, 1280 / Math.max(m.w, m.h));
  const w = Math.max(2, Math.round(m.w * sc / 2) * 2), h = Math.max(2, Math.round(m.h * sc / 2) * 2);
  const rate = span > 1e-3 ? clamp(lts.length / span, 1, 120) : 30, st = Math.max(0, s0 - 0.2); // start early: a seek right at the end of a file returns nothing
  const buf = new Uint8Array(await inv('gray_frames', { args: ['-v', 'error', '-ss', st.toFixed(3), '-i', m.path, '-an', '-t', String(s0 - st + span + 2 / rate),
    '-vf', `fps=${rate.toFixed(3)},scale=${w}:${h}`, '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'] }));
  const N = Math.floor(buf.length / (w * h * 4));
  if (!N) throw new Error(tr('trk_noVideo'));
  const cache = new Map();
  return at.map(a => {
    const i = clamp(Math.round((a - st) * rate), 0, N - 1);
    if (!cache.has(i)) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; c._w = w;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.buffer, i * w * h * 4, w * h * 4), w, h), 0, 0);
      cache.set(i, c);
    }
    return cache.get(i);
  });
}
// Shader transitions for the export: each one's frames as PNGs, overlaid just above its track.
async function renderGlTrans(Q, work, fps) {
  const out = [], c = document.createElement('canvas');
  c.width = P.w; c.height = P.h;
  const ctx = c.getContext('2d'), png = async name => {
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await inv('write_frame', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-id': String(work.id), 'x-name': name } });
  };
  const list = Q.items.filter(b => b.trans && S.GLT.includes(b.trans.id) && S.transIn(Q, b));
  for (const [gi, q] of list.entries()) {
    const b = item(q.id), T = b && S.transIn(P, b);
    if (!T) continue;
    const a = T.prev, N = Math.max(1, Math.round(T.d * fps)), times = Array.from({ length: N }, (_, f) => b.start + f / fps);
    progress(tr('p_trans'), gi / list.length);
    const isV = x => media(x).kind === 'video' && !media(x).fill;
    const fa = isV(a) ? (await clipFrames(a, [a.dur - 0.5 / fps]))[0] : undefined, fb = isV(b) ? await clipFrames(b, times.map(t0 => t0 - b.start)) : [];
    const names = [];
    for (let f = 0; f < N; f++) {
      if (cancelled) throw new Error(tr('cancelled'));
      ctx.clearRect(0, 0, P.w, P.h);
      drawGlTrans(ctx, { id: T.id, a, b, q: f / N }, times[f], fa, fb[f]);
      const name = `x${gi}_${String(f).padStart(4, '0')}.png`;
      await png(name); names.push({ name, frames: 1 });
    }
    ctx.clearRect(0, 0, P.w, P.h);
    await png(`x${gi}_end.png`); names.push({ name: `x${gi}_end.png`, frames: 1 }); // clear frame: nothing stays on top after it
    out.push({ track: b.track, start: b.start, path: await inv('write_work', new TextEncoder().encode(G.concatText(names, fps)), { headers: { 'x-id': String(work.id), 'x-name': 'trans' + gi + '.ffconcat' } }) });
  }
  return out;
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
  add(f) { try { localStorage.setItem('kadr.recent', JSON.stringify([f, ...recent.get().filter(x => x !== f)].slice(0, 12))); } catch {} },
  // off the start screen only: the project file itself stays on disk
  remove(f) { try { localStorage.setItem('kadr.recent', JSON.stringify(recent.get().filter(x => x !== f))); localStorage.removeItem('kadr.rmeta:' + f); } catch {} },
  meta(f) { try { return JSON.parse(localStorage.getItem('kadr.rmeta:' + f) || 'null'); } catch { return null; } },
  // a 200px still of the preview + save time + length, shown on the start screen
  snap(f) {
    try {
      const k = 200 / Math.max(view.width, view.height), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(view.width * k)); c.height = Math.max(1, Math.round(view.height * k));
      c.getContext('2d').drawImage(view, 0, 0, c.width, c.height);
      localStorage.setItem('kadr.rmeta:' + f, JSON.stringify({ img: c.toDataURL('image/jpeg', 0.7), t: Date.now(), dur: S.projectDur(P), w: P.w, h: P.h }));
    } catch {}
  },
};
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? tr('justNow') : m < 60 ? m + ' ' + tr('minAgo') : m < 1440 ? Math.round(m / 60) + ' ' + tr('hrAgo') : new Date(ms).toLocaleDateString(LANG === 'ar' ? 'ar-EG' : 'en-GB'); };
const mmss = d => { d = Math.round(d || 0); return String(d / 60 | 0).padStart(2, '0') + ':' + String(d % 60).padStart(2, '0'); };
async function newProj(welcome) {
  if (!welcome && dirty && !(await TA.dialog.ask(tr('unsaved'), { kind: 'warning' }))) return;
  setPlaying(false);
  let ratio = '9:16', fps = 30, res = 1080;
  const rec = welcome ? recent.get() : [], hasRec = welcome && !!lsGet('kadr.recovery', 0);
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
    ${rec.length || hasRec ? `<div class="np-recent"><h4>${tr('recent')}</h4><div class="rgrid">${hasRec ? (m => `<button data-recover class="unsaved"><i class="rdel" data-del title="${tr('removeRecent')}">${icon('x')}</i><span class="rth" style="aspect-ratio:${m.w || 9}/${m.h || 16}">${m.img ? `<img src="${m.img}" alt="">` : icon('film')}${m.dur ? `<em>${mmss(m.dur)}</em>` : ''}</span><b>${tr('unsavedWork')}</b><small>${m.t ? ago(m.t) : ''}</small></button>`)(recent.meta('recovery') || {}) : ''}${rec.map((f, i) => { const m = recent.meta(f) || {};
      return `<button data-rec="${i}" title="${esc(f)}"><i class="rdel" data-del title="${tr('removeRecent')}">${icon('x')}</i><span class="rth" style="aspect-ratio:${m.w || 9}/${m.h || 16}">${m.img ? `<img src="${m.img}" alt="">` : icon('film')}${m.dur ? `<em>${mmss(m.dur)}</em>` : ''}</span><b>${esc(f.split(/[\\/]/).pop().replace(/\.kadr$/, ''))}</b><small>${m.t ? ago(m.t) : ''}</small></button>`; }).join('')}</div></div>` : ''}
    <div class="acts">${welcome ? `<button id="npOpen">${tr('open')}…</button>` : ''}<span class="flex"></span><button id="npNo">${tr(welcome ? 'skip' : 'cancel')}</button><button class="primary" id="npGo">${tr('create')}</button></div></div>`;
  $('#mBox').onclick = e => {
    const b = e.target.closest('.fmt');
    if (b) { ratio = b.dataset.r; $$('.fmt').forEach(x => x.classList.toggle('on', x === b)); }
    const del = e.target.closest('[data-del]');
    if (del) {
      const card = del.closest('button');
      if (card.dataset.recover != null) clearRecovery(); else recent.remove(rec[+card.dataset.rec]);
      const g = card.parentElement; card.remove();
      if (!g.children.length) g.parentElement.remove();
      return;
    }
    const r = e.target.closest('[data-rec]');
    if (r) { hideModal(); openPath(rec[+r.dataset.rec]); }
    if (e.target.closest('[data-recover]')) { hideModal(); restoreRecovery(); }
  };
  $('#mBox').ondblclick = e => { const b = e.target.closest('.fmt'); if (b && b.dataset.r !== 'custom') $('#npGo').click(); };
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
      await dnPrep();
      const Q = S.scaleProject(P, o.k);
      Q.fps = o.fps;
      work = await inv('work_begin');
      const textLists = [];
      for (const [gi, g] of textGroups(Q).entries()) {
        const list = await rasterizeTexts(Q, work, g, 'g' + gi + '_');
        if (list) textLists.push({ track: g[0], path: await inv('write_work', new TextEncoder().encode(G.concatText(list, o.fps)), { headers: { 'x-id': String(work.id), 'x-name': 'text' + gi + '.ffconcat' } }) });
      }
      const transLists = await renderGlTrans(Q, work, o.fps);
      const luts = await writeLuts(Q, work), masks = await writeMasks(Q, work);
      await writeFills(Q, work);
      const { args, duration } = G.buildArgs(Q, { out: o.video, textLists, transLists, codec: o.codec, quality: o.quality, luts, masks });
      progress(tr('p_export'), 0);
      await inv('export_run', { id: work.id, args, concat: null, duration });
      work = null;
    }
    if (o.audio && !cancelled) {
      progress(tr('p_audioExport'), 0);
      await dnPrep();
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
    await dnPrep();
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
  recent.add(f); recent.snap(f);
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
      recent.snap(projectPath);
      if (JSON.stringify(P) === js) { dirty = false; $('#pname').textContent = $('#pname').textContent.replace(/ •$/, ''); }
    } else {
      recPath = recPath || await inv('recovery_path');
      await inv('save_project', { path: recPath, json: js });
      recent.snap('recovery');
      lsSet('kadr.recovery', 1);
    }
    lastAuto = js;
  } catch (e) { /* try again on the next tick */ } finally { autoBusy = false; }
}
setInterval(autosave, 2000);
async function writeFills(Q, work) {
  for (const it of Q.items) {
    const m = Q.media[it.media];
    if (!m || !m.fill || it.hidden) continue;
    const c = document.createElement('canvas'); c.width = Q.w; c.height = Q.h;
    paintFill(c.getContext('2d'), it.fill || {}, Q.w, Q.h);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const id = 'fillx_' + it.id, name = id.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) + '.png';
    Q.media[id] = { kind: 'image', path: await inv('write_work', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-id': String(work.id), 'x-name': name } }), w: Q.w, h: Q.h, name };
    it.media = id;
  }
}
async function writeMasks(Q, work) {
  const out = {};
  for (const it0 of Q.items) {
    const m = media(it0);
    if (!m || m.kind === 'audio' || !S.hasMask(it0)) continue;
    // same box the export cuts the clip to (largest keyframed scale)
    const it = S.bakeVa(it0, Q.w, Q.h), kf = S.hasKf(it) ? it.kf : null, LP = it._loop ? S.VA_LOOP[it._loop] : null;
    const smax = (kf && kf.scale ? Math.max(...kf.scale.map(q => q[1])) : num(it.scale, 1)) * (LP && LP.smax || 1);
    const L = S.layout({ ...it, scale: smax }, m, Q.w, Q.h), w = Math.max(2, Math.round(L.cw)), h = Math.max(2, Math.round(L.ch));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), a = document.createElement('canvas'); a.width = w; a.height = h;
    S.drawMask(a.getContext('2d'), it0.mask, w, h);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.drawImage(a, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const name = 'mask_' + String(it0.id).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) + '.png';
    out[it0.id] = await inv('write_work', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-id': String(work.id), 'x-name': name } });
  }
  return out;
}
async function writeLuts(Q, work) {
  const out = {};
  for (const it of Q.items) {
    const m = media(it);
    if (!m || m.kind === 'audio' || !S.hasColor(it)) continue;
    const f = it.color.lut && it.color.lut.file, ul = f ? await loadUserLut(f) : null;
    const name = 'lut_' + String(it.id).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) + '.cube';
    out[it.id] = await inv('write_work', new TextEncoder().encode(S.cubeText(S.bakeLut(it, ul))), { headers: { 'x-id': String(work.id), 'x-name': name } });
  }
  return out;
}
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
  if (!d.paths || !d.paths.length) return newProj(true); // always the start screen; unsaved work waits there as a card
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
