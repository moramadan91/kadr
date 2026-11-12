// Maqto Icons — original line icons drawn for Maqto on a 24x24 grid (round 2px strokes in the editor).
// Every icon is one SVG path string built from the helpers below. To add icons in an update, append
// I('name', 'search tags', ...shapes) at the end; V/F/B make rotated, framed and badged variants.
(() => {
  const lib = {};
  const n = v => +(+v).toFixed(2);
  const C = (x, y, r) => `M${n(x - r)} ${n(y)}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0Z`;
  const E = (x, y, rx, ry) => `M${n(x - rx)} ${n(y)}a${rx} ${ry} 0 1 0 ${n(2 * rx)} 0a${rx} ${ry} 0 1 0 ${n(-2 * rx)} 0Z`;
  const R = (x, y, w, h, r = 0) => !r ? `M${x} ${y}h${w}v${h}h${-w}Z`
    : `M${n(x + r)} ${y}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${n(2 * r - w)}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(2 * r - h)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
  const L = (...p) => { let d = `M${p[0]} ${p[1]}`; for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`; return d; };
  const G = (...p) => L(...p) + 'Z';
  const D = (x, y) => `M${x} ${y}h.01`; // a dot (round cap)
  const pt = (cx, cy, r, a) => [n(cx + r * Math.cos(a * Math.PI / 180)), n(cy + r * Math.sin(a * Math.PI / 180))];
  const A = (cx, cy, r, a0, a1) => { const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1); return `M${x0} ${y0}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1} ${y1}`; };
  const poly = (cx, cy, r, k, rot = -90) => G(...Array.from({ length: k }, (_, i) => pt(cx, cy, r, rot + i * 360 / k)).flat());
  const star = (cx, cy, ro, ri, k = 5, rot = -90) => G(...Array.from({ length: 2 * k }, (_, i) => pt(cx, cy, i % 2 ? ri : ro, rot + i * 180 / k)).flat());
  const rays = (cx, cy, r0, r1, k, rot = 0) => Array.from({ length: k }, (_, i) => L(...pt(cx, cy, r0, rot + i * 360 / k), ...pt(cx, cy, r1, rot + i * 360 / k))).join('');
  const gear = (cx, cy, ro, ri, k) => { const s = 360 / k, p = []; for (let i = 0; i < k; i++) { const a = i * s - 90; p.push(...pt(cx, cy, ri, a - s * 0.32), ...pt(cx, cy, ro, a - s * 0.17), ...pt(cx, cy, ro, a + s * 0.17), ...pt(cx, cy, ri, a + s * 0.32)); } return G(...p); };
  // Move any path: scale s and turn ang degrees around the centre (12,12), mirror left-right first if mx, then shift (tx,ty).
  function tf(d, s = 1, ang = 0, tx = 0, ty = 0, mx = false) {
    const co = Math.cos(ang * Math.PI / 180), si = Math.sin(ang * Math.PI / 180);
    const T = (x, y) => { x = (x - 12) * s * (mx ? -1 : 1); y = (y - 12) * s; return `${n(12 + x * co - y * si + tx)} ${n(12 + x * si + y * co + ty)}`; };
    const tk = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, out = '', prev = '';
    const g = () => +tk[i++];
    while (i < tk.length) {
      if (/[a-zA-Z]/.test(tk[i])) cmd = tk[i++]; else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
      const rel = cmd === cmd.toLowerCase(), U = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
      if (U === 'Z') { out += 'Z'; x = sx; y = sy; prev = 'Z'; continue; }
      if (U === 'M') { x = ox + g(); y = oy + g(); sx = x; sy = y; out += 'M' + T(x, y); }
      else if (U === 'L') { x = ox + g(); y = oy + g(); out += 'L' + T(x, y); }
      else if (U === 'H') { x = ox + g(); out += 'L' + T(x, y); }
      else if (U === 'V') { y = oy + g(); out += 'L' + T(x, y); }
      else if (U === 'C') { const a = [ox + g(), oy + g(), ox + g(), oy + g(), ox + g(), oy + g()]; out += `C${T(a[0], a[1])} ${T(a[2], a[3])} ${T(a[4], a[5])}`; cx = a[2]; cy = a[3]; x = a[4]; y = a[5]; }
      else if (U === 'S') { const r1 = /[CS]/.test(prev) ? [2 * x - cx, 2 * y - cy] : [x, y], a = [ox + g(), oy + g(), ox + g(), oy + g()]; out += `C${T(...r1)} ${T(a[0], a[1])} ${T(a[2], a[3])}`; cx = a[0]; cy = a[1]; x = a[2]; y = a[3]; }
      else if (U === 'Q') { const a = [ox + g(), oy + g(), ox + g(), oy + g()]; out += `Q${T(a[0], a[1])} ${T(a[2], a[3])}`; cx = a[0]; cy = a[1]; x = a[2]; y = a[3]; }
      else if (U === 'T') { const r1 = /[QT]/.test(prev) ? [2 * x - cx, 2 * y - cy] : [x, y], a = [ox + g(), oy + g()]; out += `Q${T(...r1)} ${T(a[0], a[1])}`; cx = r1[0]; cy = r1[1]; x = a[0]; y = a[1]; }
      else if (U === 'A') { const rx = g(), ry = g(), ph = g(), la = g(), sw = g(), ex = ox + g(), ey = oy + g(); out += `A${n(rx * s)} ${n(ry * s)} ${n((mx ? -ph : ph) + ang)} ${la} ${mx ? 1 - sw : sw} ${T(ex, ey)}`; x = ex; y = ey; }
      prev = U;
    }
    return out;
  }
  const I = (name, tags, ...parts) => { lib[name] = [parts.join(''), tags]; return lib[name][0]; };
  const P = name => lib[name][0];
  const V = (name, from, opt = {}, tags) => I(name, tags || lib[from][1], tf(P(from), opt.s ?? 1, opt.a ?? 0, opt.x ?? 0, opt.y ?? 0, opt.m));
  const FR = { circle: [C(12, 12, 10), 0.55], square: [R(3, 3, 18, 18, 2.5), 0.58], octagon: [poly(12, 12, 10.4, 8, -67.5), 0.55] };
  const F = (frame, glyph, name = `${frame}-${glyph}`) => I(name, `${lib[glyph][1]} ${frame}`, FR[frame][0], tf(P(glyph), FR[frame][1]));
  const B = (base, glyph, at, s = 0.38, name = `${base}-${glyph}`) => I(name, `${lib[base][1]} ${glyph}`, P(base), tf(P(glyph), s, 0, at[0] - 12, at[1] - 12));

  // ---- basics & interface ----
  I('check', 'tick done ok yes', L(4, 12.5, 9.5, 18, 20, 6.5));
  I('x', 'close cancel cross no delete', L(6, 6, 18, 18), L(18, 6, 6, 18));
  I('plus', 'add new create', L(12, 5, 12, 19), L(5, 12, 19, 12));
  I('minus', 'remove subtract less', L(5, 12, 19, 12));
  I('equal', 'equals math', L(5, 9, 19, 9), L(5, 15, 19, 15));
  I('divide', 'math', L(5, 12, 19, 12), D(12, 6.5), D(12, 17.5));
  I('asterisk', 'star required', L(12, 4, 12, 20), L(5.1, 8, 18.9, 16), L(18.9, 8, 5.1, 16));
  I('hash', 'hashtag number tag', L(10, 4, 8, 20), L(16, 4, 14, 20), L(4.5, 9, 19.5, 9), L(4, 15, 19, 15));
  I('at-sign', 'email mention at', C(12, 12, 3.6), 'M15.6 8.5v4.6a2.7 2.7 0 0 0 5.4 0V12a9 9 0 1 0-3.6 7.2');
  I('percent', 'discount sale percentage', L(18.5, 5.5, 5.5, 18.5), C(7.2, 7.2, 2.2), C(16.8, 16.8, 2.2));
  I('menu', 'hamburger list nav', L(4, 6.5, 20, 6.5), L(4, 12, 20, 12), L(4, 17.5, 20, 17.5));
  I('more-horizontal', 'dots ellipsis options', D(5.5, 12), D(12, 12), D(18.5, 12));
  I('more-vertical', 'dots ellipsis options kebab', D(12, 5.5), D(12, 12), D(12, 18.5));
  I('grid', 'apps layout tiles', R(4, 4, 6.5, 6.5, 1.5), R(13.5, 4, 6.5, 6.5, 1.5), R(4, 13.5, 6.5, 6.5, 1.5), R(13.5, 13.5, 6.5, 6.5, 1.5));
  I('list', 'items bullets', D(4.5, 6.5), D(4.5, 12), D(4.5, 17.5), L(9, 6.5, 20, 6.5), L(9, 12, 20, 12), L(9, 17.5, 20, 17.5));
  I('search', 'find magnifier look zoom', C(10.5, 10.5, 6.5), L(15.3, 15.3, 20, 20));
  I('zoom-in', 'magnify bigger', P('search'), L(10.5, 7.8, 10.5, 13.2), L(7.8, 10.5, 13.2, 10.5));
  I('zoom-out', 'magnify smaller', P('search'), L(7.8, 10.5, 13.2, 10.5));
  I('settings', 'gear cog options preferences', gear(12, 12, 9.6, 7.4, 8), C(12, 12, 3));
  I('cog', 'gear settings machine', gear(12, 12, 9.4, 6.6, 12), C(12, 12, 2.6));
  I('sliders', 'controls adjust filter', L(4, 7, 20, 7), L(4, 12, 20, 12), L(4, 17, 20, 17), C(9, 7, 2), C(15.5, 12, 2), C(7.5, 17, 2));
  I('filter', 'funnel sort', G(3.5, 5, 20.5, 5, 14, 12.5, 14, 19, 10, 21, 10, 12.5));
  I('home', 'house main start', 'M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z', 'M9.5 20.5v-6h5v6');
  I('house', 'home building start', 'M3 11 12 3.5 21 11', 'M5.5 9v10.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9', R(9.5, 13.5, 5, 7, 0.8));
  I('user', 'person profile account', C(12, 8, 4), 'M4.5 20.5a7.5 7.5 0 0 1 15 0');
  I('users', 'people group team', C(9, 8.5, 3.5), 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M15 5.3a3.5 3.5 0 0 1 0 6.4', 'M18 14.2a6.5 6.5 0 0 1 3.5 5.8');
  I('user-plus', 'add person follow', C(10, 8, 4), 'M2.5 20.5a7.5 7.5 0 0 1 12.6-5.5', L(19, 13, 19, 19), L(16, 16, 22, 16));
  I('user-check', 'verified person', C(10, 8, 4), 'M2.5 20.5a7.5 7.5 0 0 1 12.6-5.5', L(15.5, 17, 17.5, 19, 21.5, 14.5));
  I('user-circle', 'avatar profile', C(12, 12, 10), C(12, 10, 3.2), 'M6.3 18.6a7 7 0 0 1 11.4 0');
  I('bell', 'notification alert ring', 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.8 2H4.2Z', 'M10 21a2.2 2.2 0 0 0 4 0');
  I('bell-ring', 'notification alarm ringing', P('bell'), A(12, 11, 9.5, -150, -120), A(12, 11, 9.5, -60, -30));
  I('bell-off', 'mute silent', P('bell'), L(3, 3, 21, 21));
  I('lock', 'secure password private closed', R(5, 10.5, 14, 10, 2), 'M8 10.5V7.5a4 4 0 0 1 8 0v3', L(12, 14.5, 12, 16.5));
  I('lock-open', 'unlock open unsecure', R(5, 10.5, 14, 10, 2), 'M8 10.5V7.5a4 4 0 0 1 7.6-1.8', L(12, 14.5, 12, 16.5));
  I('key', 'password access unlock', C(7.5, 15.5, 4), L(10.4, 12.6, 20, 3), L(16, 7, 19, 10), L(13.5, 9.5, 15.5, 11.5));
  I('eye', 'view see watch visible show', 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z', C(12, 12, 3));
  I('eye-off', 'hide hidden invisible', P('eye'), L(3, 3, 21, 21));
  I('shield', 'security protect safe', 'M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z');
  I('shield-check', 'secure verified protect', P('shield'), L(8.8, 12, 11, 14.2, 15.5, 9.7));
  I('info', 'about information help', C(12, 12, 10), L(12, 11, 12, 17), D(12, 7.5));
  I('circle-alert', 'warning error alert', C(12, 12, 10), L(12, 7, 12, 13), D(12, 16.8));
  I('triangle-alert', 'warning caution danger', 'M10.3 4.4a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3Z', L(12, 9.5, 12, 13.5), D(12, 17));
  I('circle-help', 'question faq help', C(12, 12, 10), 'M9.3 9.4a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.4-2.7 4', D(12, 17.3));
  I('circle-check', 'done success ok', C(12, 12, 10), L(7.8, 12.3, 10.6, 15.1, 16.3, 9.4));
  I('circle-x', 'close cancel error', C(12, 12, 10), L(9, 9, 15, 15), L(15, 9, 9, 15));
  I('circle-plus', 'add new', C(12, 12, 10), L(12, 7.5, 12, 16.5), L(7.5, 12, 16.5, 12));
  I('circle-minus', 'remove', C(12, 12, 10), L(7.5, 12, 16.5, 12));
  I('badge-check', 'verified badge certified', star(12, 12, 10, 8.3, 12), L(8.5, 12.2, 10.9, 14.5, 15.5, 9.8));
  I('loader', 'loading wait spinner', L(12, 2.5, 12, 6), L(12, 18, 12, 21.5), L(2.5, 12, 6, 12), L(18, 12, 21.5, 12), L(5.3, 5.3, 7.8, 7.8), L(16.2, 16.2, 18.7, 18.7), L(5.3, 18.7, 7.8, 16.2), L(16.2, 7.8, 18.7, 5.3));
  I('loader-circle', 'loading spinner wait', A(12, 12, 9, -90, 180));
  I('refresh-cw', 'reload sync update repeat', 'M20 11a8 8 0 0 0-14.3-4.3', L(5, 3.5, 5, 7.5, 9, 7.5), 'M4 13a8 8 0 0 0 14.3 4.3', L(19, 20.5, 19, 16.5, 15, 16.5));
  I('rotate-cw', 'redo rotate turn', 'M20 12a8 8 0 1 1-2.6-5.9', L(20, 3.5, 20, 8, 15.5, 8));
  I('rotate-ccw', 'undo rotate turn back', tf('M20 12a8 8 0 1 1-2.6-5.9' + L(20, 3.5, 20, 8, 15.5, 8), 1, 0, 0, 0, true));
  I('repeat', 'loop again cycle', 'M4 11V9.5A2.5 2.5 0 0 1 6.5 7H19', L(16, 4, 19, 7, 16, 10), 'M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5', L(8, 20, 5, 17, 8, 14));
  I('shuffle', 'random mix', 'M3 7h3.5c5.5 0 5.5 10 11 10H21', 'M3 17h3.5c2 0 3.2-1.4 4.1-3.1', 'M13.4 10.1C14.3 8.4 15.5 7 17.5 7H21', L(18, 4, 21, 7, 18, 10), L(18, 14, 21, 17, 18, 20));
  I('undo', 'back revert', 'M9 14 4.5 9.5 9 5', 'M4.5 9.5H15a5 5 0 0 1 0 10h-3');
  V('redo', 'undo', { m: true }, 'forward again');
  I('trash', 'delete remove bin garbage', L(3.5, 6.5, 20.5, 6.5), 'M9 6.5V4.5h6v2', 'M5.5 6.5 6.6 19a2 2 0 0 0 2 1.8h6.8a2 2 0 0 0 2-1.8l1.1-12.5', L(10, 11, 10, 16.5), L(14, 11, 14, 16.5));
  I('pencil', 'edit write draw', 'M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z', L(13.5, 6.5, 16.5, 9.5));
  I('pen-line', 'edit sign write', 'M16 4.5a2.1 2.1 0 0 1 3 3L9 17.5l-4 1 1-4Z', L(12, 20.5, 20, 20.5));
  I('copy', 'duplicate clone', R(8.5, 8.5, 12, 12, 2), 'M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3');
  I('clipboard', 'paste board', R(5, 4.5, 14, 17, 2), R(8.5, 2.5, 7, 4, 1));
  I('clipboard-check', 'task done list', P('clipboard'), L(9, 13.5, 11.2, 15.7, 15.5, 11.2));
  I('save', 'disk store', 'M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5Z', R(7, 13, 10, 7.5), L(8, 3.5, 8, 8, 14.5, 8));
  I('download', 'save get arrow down', L(12, 3.5, 12, 15), L(7, 10, 12, 15, 17, 10), 'M4 15.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3.5');
  I('upload', 'send arrow up export', L(12, 15, 12, 3.5), L(7, 8.5, 12, 3.5, 17, 8.5), 'M4 15.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3.5');
  I('external-link', 'open new window', 'M18.5 13.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5h5.5', L(14.5, 3.5, 20.5, 3.5, 20.5, 9.5), L(20.5, 3.5, 11, 13));
  I('log-in', 'sign in enter', 'M14.5 3.5H18a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.5', L(3.5, 12, 14.5, 12), L(10.5, 8, 14.5, 12, 10.5, 16));
  I('log-out', 'sign out exit leave', 'M9.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3.5', L(9.5, 12, 20.5, 12), L(16.5, 8, 20.5, 12, 16.5, 16));
  I('power', 'on off shutdown', L(12, 2.5, 12, 11), 'M7 5.8a8 8 0 1 0 10 0');
  I('maximize', 'fullscreen expand', L(3.5, 8.5, 3.5, 3.5, 8.5, 3.5), L(15.5, 3.5, 20.5, 3.5, 20.5, 8.5), L(20.5, 15.5, 20.5, 20.5, 15.5, 20.5), L(8.5, 20.5, 3.5, 20.5, 3.5, 15.5));
  I('minimize', 'exit fullscreen shrink', L(8.5, 3.5, 8.5, 8.5, 3.5, 8.5), L(20.5, 8.5, 15.5, 8.5, 15.5, 3.5), L(15.5, 20.5, 15.5, 15.5, 20.5, 15.5), L(3.5, 15.5, 8.5, 15.5, 8.5, 20.5));
  I('move', 'drag arrows position', L(12, 3, 12, 21), L(3, 12, 21, 12), L(9.5, 5.5, 12, 3, 14.5, 5.5), L(9.5, 18.5, 12, 21, 14.5, 18.5), L(5.5, 9.5, 3, 12, 5.5, 14.5), L(18.5, 9.5, 21, 12, 18.5, 14.5));
  I('link', 'chain url connect', 'M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6', 'M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6');
  I('paperclip', 'attach attachment', 'M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4');
  I('bookmark', 'save favorite mark', 'M6.5 3.5h11a1 1 0 0 1 1 1v16L12 16.5l-6.5 4v-16a1 1 0 0 1 1-1Z');
  I('flag', 'report mark goal', L(5, 21, 5, 4), 'M5 4.5c4.5-2.5 7 2.5 14 0v9c-7 2.5-9.5-2.5-14 0');
  I('tag', 'price label sale', 'M3.5 4.5v6.6a1.5 1.5 0 0 0 .4 1l8.6 8.6a1.5 1.5 0 0 0 2.1 0l5.8-5.8a1.5 1.5 0 0 0 0-2.1L11.8 4.2a1.5 1.5 0 0 0-1-.4H4.3a.8.8 0 0 0-.8.7Z', D(8, 8.5));
  I('pin', 'pushpin stick', L(12, 16, 12, 22), 'M8.5 3.5h7', 'M9.5 3.5v5L6.5 12v2.5h11V12l-3-3.5v-5');
  I('calendar', 'date schedule event day', R(3.5, 5, 17, 15.5, 2), L(3.5, 10, 20.5, 10), L(8, 3, 8, 7), L(16, 3, 16, 7));
  I('calendar-check', 'event done booked', P('calendar'), L(8.8, 15, 11, 17.2, 15.5, 12.8));
  I('calendar-days', 'month schedule', P('calendar'), D(8, 13.5), D(12, 13.5), D(16, 13.5), D(8, 17), D(12, 17), D(16, 17));
  I('clock', 'time hour watch', C(12, 12, 10), L(12, 6.5, 12, 12, 15.5, 14));
  I('alarm-clock', 'wake time alarm', C(12, 13, 8), L(12, 9, 12, 13, 14.5, 15), L(3, 5.5, 6, 3), L(21, 5.5, 18, 3), L(6.5, 19, 5, 21), L(17.5, 19, 19, 21));
  I('timer', 'stopwatch countdown', C(12, 13.5, 8), L(12, 13.5, 15, 10.5), L(9.5, 2.5, 14.5, 2.5), L(12, 2.5, 12, 5.5));
  I('hourglass', 'wait time sand', L(5.5, 2.5, 18.5, 2.5), L(5.5, 21.5, 18.5, 21.5), 'M7 2.5v3.3a5 5 0 0 0 2 4L12 12l3-2.2a5 5 0 0 0 2-4V2.5', 'M7 21.5v-3.3a5 5 0 0 1 2-4L12 12l3 2.2a5 5 0 0 1 2 4v3.3');
  I('history', 'recent time back', 'M3.5 12a8.5 8.5 0 1 0 2.5-6', L(3.5, 3.5, 3.5, 7.5, 7.5, 7.5), L(12, 7.5, 12, 12, 15, 14));
  I('globe', 'world earth internet web', C(12, 12, 10), L(2, 12, 22, 12), E(12, 12, 4.2, 10));
  I('map-pin', 'location place marker gps', 'M12 21.5s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z', C(12, 9.5, 2.6));
  I('map', 'atlas route guide', G(3, 6, 9, 3.5, 15, 6, 21, 3.5, 21, 18, 15, 20.5, 9, 18, 3, 20.5), L(9, 3.5, 9, 18), L(15, 6, 15, 20.5));
  I('navigation', 'direction gps arrow', G(3.5, 11, 20.5, 3.5, 13, 20.5, 11.2, 12.8));
  I('compass', 'direction explore north', C(12, 12, 10), G(15.8, 8.2, 13.6, 13.6, 8.2, 15.8, 10.4, 10.4));
  I('send', 'paper plane message submit', 'M21 3 3.5 10.2l7 3.3 3.3 7Z', L(21, 3, 10.5, 13.5));
  I('share', 'export forward', 'M4 12.5v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6', L(12, 3, 12, 15), L(7.5, 7.5, 12, 3, 16.5, 7.5));
  I('share-2', 'social network connect', C(18, 5.5, 3), C(6, 12, 3), C(18, 18.5, 3), L(8.6, 10.6, 15.4, 6.9), L(8.6, 13.4, 15.4, 17.1));
  I('mail', 'email letter envelope message', R(2.5, 5, 19, 14, 2), L(3, 6.5, 12, 13, 21, 6.5));
  I('mail-open', 'read email', 'M2.5 10 12 3.5 21.5 10v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 19Z', L(2.8, 10.2, 12, 16, 21.2, 10.2));
  I('inbox', 'tray messages', 'M2.5 13 5.4 5.6a1.5 1.5 0 0 1 1.4-1h10.4a1.5 1.5 0 0 1 1.4 1L21.5 13v5.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2Z', 'M2.5 13H8l1.5 2.5h5L16 13h5.5');
  I('phone', 'call telephone contact', 'M8.5 3.5H5.8a1.8 1.8 0 0 0-1.8 2C4.6 13.4 10.6 19.4 18.5 20a1.8 1.8 0 0 0 2-1.8v-2.7l-4-1.5-2 2a12 12 0 0 1-5-5l2-2Z');
  I('phone-call', 'calling ringing', P('phone'), 'M14.5 2.5a7 7 0 0 1 7 7', 'M14.5 6a3.5 3.5 0 0 1 3.5 3.5');
  I('phone-off', 'hang up end call', P('phone'), L(3, 3, 21, 21));
  I('message-circle', 'chat comment talk bubble', 'M7.5 19.6A9 9 0 1 0 4.4 16.5L3 21Z');
  I('message-square', 'chat comment message', 'M4 4.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-5 3.5V5.5a1 1 0 0 1 1-1Z');
  I('messages', 'chat conversation', 'M3 4.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-4 3v-11a1 1 0 0 1 1-1Z', 'M18 9h2a1 1 0 0 1 1 1v10l-3.5-2.5H11a1 1 0 0 1-1-1v-1');
  I('message-dots', 'typing chat', P('message-circle'), D(8, 12), D(12, 12), D(16, 12));
  I('megaphone', 'announce speaker loud marketing', 'M3.5 9.5v5h3l9 5v-15l-9 5Z', 'M7 14.5l1.5 6h2.5l-1-5', 'M19 9.5a3.5 3.5 0 0 1 0 5');
  I('rss', 'feed blog subscribe', 'M4 11a9 9 0 0 1 9 9', 'M4 4a16 16 0 0 1 16 16', D(5, 19));
  I('wifi', 'internet wireless signal', 'M2 8.5a14.5 14.5 0 0 1 20 0', 'M5 12a10 10 0 0 1 14 0', 'M8.5 15.5a5 5 0 0 1 7 0', D(12, 19));
  I('wifi-off', 'no internet offline', P('wifi'), L(3, 3, 21, 21));
  I('bluetooth', 'wireless connect', L(7, 7, 17, 17, 12, 21.5, 12, 2.5, 17, 7, 7, 17));
  I('signal', 'bars reception', L(4, 20, 4, 17), L(9, 20, 9, 13), L(14, 20, 14, 9), L(19, 20, 19, 4));
  I('battery', 'power charge', R(2.5, 7, 16, 10, 2), L(21.5, 10.5, 21.5, 13.5));
  I('battery-charging', 'charge power energy', P('battery'), L(11.5, 8.5, 9, 12, 12.5, 12, 10, 15.5));
  I('battery-full', 'charged power', P('battery'), L(6, 10, 6, 14), L(9.5, 10, 9.5, 14), L(13, 10, 13, 14));
  I('plug', 'power electric socket', L(9, 2.5, 9, 7), L(15, 2.5, 15, 7), 'M5.5 7h13v4a6.5 6.5 0 0 1-13 0Z', L(12, 17.5, 12, 21.5));
  I('zap', 'lightning flash power energy fast', G(13.5, 2.5, 4.5, 13.5, 11.5, 13.5, 10.5, 21.5, 19.5, 10.5, 12.5, 10.5));
  I('zap-off', 'no power', P('zap'), L(3, 3, 21, 21));
  I('sun', 'day light bright weather', C(12, 12, 4), rays(12, 12, 7, 9.8, 8, 0));
  I('moon', 'night dark sleep', 'M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7Z');
  I('star', 'favorite rate like', star(12, 12.5, 10, 4.3, 5));
  I('heart', 'love like favorite', 'M12 20.5S3 15.1 3 8.9A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 9 2.3c0 6.2-9 11.6-9 11.6Z');
  I('thumbs-up', 'like approve good', 'M7.5 10.5v10h-3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z', 'M7.5 10.5 11.5 3a2.5 2.5 0 0 1 2.5 2.7l-.5 3.8h5.4a2 2 0 0 1 2 2.4l-1.4 6.8a2.2 2.2 0 0 1-2.1 1.8H7.5');
  V('thumbs-down', 'thumbs-up', { a: 180, m: true }, 'dislike bad reject');
  I('hand', 'wave stop palm hello', 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12', 'M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5', 'M14 11.5V5.5a1.5 1.5 0 0 1 3 0v8', 'M17 9.5a1.5 1.5 0 0 1 3 0v4.5a7.5 7.5 0 0 1-7.5 7.5h-1A7 7 0 0 1 6.2 18L3.8 13.8a1.6 1.6 0 0 1 2.6-1.8L8 14');
  I('pointer', 'cursor hand click tap', 'M9.5 13V4.5a1.75 1.75 0 0 1 3.5 0V11', 'M13 10.5a1.75 1.75 0 0 1 3.5 0v1', 'M16.5 11.5a1.75 1.75 0 0 1 3.5 0v3.5a6.5 6.5 0 0 1-6.5 6.5h-1.6a6 6 0 0 1-4.6-2.2l-3-4a1.7 1.7 0 0 1 2.6-2.1L9.5 15');
  I('mouse-pointer', 'cursor arrow select', G(5, 3.5, 18.5, 11, 12.5, 12.5, 9.5, 18.5));
  I('mouse-pointer-click', 'click cursor tap select', G(9, 8.5, 20.5, 14.5, 15.5, 16, 13, 21), L(4, 4, 6, 6), L(9, 2.5, 9, 5), L(2.5, 9, 5, 9), L(6, 12, 4, 14), L(14, 4, 12, 6));
  I('image', 'photo picture gallery', R(3, 3.5, 18, 17, 2.5), C(8.5, 9, 1.8), L(3.5, 17.5, 9, 12, 15, 18), L(13, 16, 15.5, 13.5, 20.5, 18.5));
  I('images', 'gallery photos album', R(6.5, 3, 15, 13.5, 2), 'M17.5 20.5H5a2.5 2.5 0 0 1-2.5-2.5V7.5', L(6.5, 13.5, 10.5, 9.5, 14, 13), L(13, 12, 15.5, 9.5, 21, 15));
  I('camera', 'photo picture shoot', 'M4 7.5h3l1.8-3h6.4l1.8 3h3a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5Z', C(12, 13.5, 3.8));
  I('video', 'camera record film', R(2.5, 6, 13.5, 12, 2), G(16, 10.5, 21.5, 7, 21.5, 17, 16, 13.5));
  I('film', 'movie cinema reel', R(3.5, 2.5, 17, 19, 2), L(7.5, 2.5, 7.5, 21.5), L(16.5, 2.5, 16.5, 21.5), L(3.5, 12, 20.5, 12), L(3.5, 7, 7.5, 7), L(3.5, 17, 7.5, 17), L(16.5, 7, 20.5, 7), L(16.5, 17, 20.5, 17));
  I('clapperboard', 'movie action film director', R(3, 9.5, 18, 11, 1.5), 'M3 9.5 2.5 6a1 1 0 0 1 .8-1.1l15.3-2.6a1 1 0 0 1 1.1.8l.5 2.9Z', L(7.5, 4.3, 9.7, 8), L(12.5, 3.5, 14.7, 7.2));
  I('music', 'song note audio melody', 'M9 18V5.5l11-2V16', C(6.5, 18, 2.5), C(17.5, 16, 2.5), L(9, 9.5, 20, 7.5));
  I('music-2', 'note song melody', 'M10 18V3.5c2.5 1 6 2 7.5 5', C(7, 18, 3));
  I('headphones', 'audio listen music', 'M3.5 17v-5a8.5 8.5 0 0 1 17 0v5', R(3.5, 14, 4.5, 6.5, 1.5), R(16, 14, 4.5, 6.5, 1.5));
  I('mic', 'microphone record voice audio', R(8.5, 2.5, 7, 12, 3.5), 'M5 11a7 7 0 0 0 14 0', L(12, 18, 12, 21.5), L(8.5, 21.5, 15.5, 21.5));
  I('mic-off', 'mute silent', P('mic'), L(3, 3, 21, 21));
  I('volume-2', 'sound speaker audio loud', G(3.5, 9.5, 7, 9.5, 11.5, 5, 11.5, 19, 7, 14.5, 3.5, 14.5), 'M15 9a4 4 0 0 1 0 6', 'M18 6a8 8 0 0 1 0 12');
  I('volume', 'sound speaker quiet', G(5.5, 9.5, 9, 9.5, 13.5, 5, 13.5, 19, 9, 14.5, 5.5, 14.5), 'M17 9.5a3.5 3.5 0 0 1 0 5');
  I('volume-x', 'mute no sound', G(3.5, 9.5, 7, 9.5, 11.5, 5, 11.5, 19, 7, 14.5, 3.5, 14.5), L(15.5, 9.5, 20.5, 14.5), L(20.5, 9.5, 15.5, 14.5));
  I('play', 'start video media', 'M7 4.6v14.8a1 1 0 0 0 1.5.9l12-7.4a1 1 0 0 0 0-1.8l-12-7.4A1 1 0 0 0 7 4.6Z');
  I('pause', 'stop wait media', R(6, 4.5, 4, 15, 1), R(14, 4.5, 4, 15, 1));
  I('stop', 'halt end media', R(5, 5, 14, 14, 2));
  I('circle-play', 'play button video', C(12, 12, 10), G(10, 8.2, 16, 12, 10, 15.8));
  I('circle-pause', 'pause button', C(12, 12, 10), L(10, 9, 10, 15), L(14, 9, 14, 15));
  I('skip-forward', 'next track', G(5, 5, 15, 12, 5, 19), L(19, 5, 19, 19));
  V('skip-back', 'skip-forward', { m: true }, 'previous track');
  I('fast-forward', 'speed forward', G(3, 6, 11, 12, 3, 18), G(12, 6, 20, 12, 12, 18));
  V('rewind', 'fast-forward', { m: true }, 'back speed');
  I('record', 'rec live dot', C(12, 12, 10), C(12, 12, 4.5));
  I('radio', 'broadcast fm', R(2.5, 8, 19, 13, 2), L(6, 8, 17, 3), C(15.5, 14.5, 3), L(5.5, 12, 9.5, 12), L(5.5, 15.5, 9.5, 15.5));
  I('tv', 'television screen watch', R(2.5, 6.5, 19, 13.5, 2), L(7.5, 2.5, 12, 6.5, 16.5, 2.5));
  I('cast', 'stream screen mirror', 'M2.5 8V6a1.5 1.5 0 0 1 1.5-1.5h16A1.5 1.5 0 0 1 21.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-6', 'M2.5 12.5a7 7 0 0 1 7 7', 'M2.5 16a3.5 3.5 0 0 1 3.5 3.5', D(2.8, 19.3));
  I('podcast', 'broadcast audio show', C(12, 10, 2.5), L(12, 13.5, 12, 21), 'M7.1 15.4a7 7 0 1 1 9.8 0', 'M4.3 18.2a11 11 0 1 1 15.4 0');
  I('disc', 'cd vinyl record music', C(12, 12, 10), C(12, 12, 2.5), A(12, 12, 6.5, 200, 250));

  // ---- money & shopping ----
  I('shopping-cart', 'cart buy shop store basket', L(2.5, 3.5, 5, 3.5, 7.5, 15.5, 18.5, 15.5, 20.8, 7, 6, 7), C(9, 19.5, 1.5), C(17, 19.5, 1.5));
  I('shopping-bag', 'bag buy shop store', 'M4.5 7.5h15l-1 12.5a1.5 1.5 0 0 1-1.5 1.4H7a1.5 1.5 0 0 1-1.5-1.4Z', 'M8.5 10V6.5a3.5 3.5 0 0 1 7 0V10');
  I('shopping-basket', 'basket groceries', L(2.5, 9.5, 21.5, 9.5), 'M4 9.5l1.6 9.3a2 2 0 0 0 2 1.7h8.8a2 2 0 0 0 2-1.7L20 9.5', L(8, 9.5, 11, 3.5), L(16, 9.5, 13, 3.5), L(9.5, 13, 9.5, 17), L(14.5, 13, 14.5, 17));
  I('store', 'shop market building', 'M3.5 9.5 5 4h14l1.5 5.5', 'M3.5 9.5a2.8 2.8 0 0 0 5.7 0 2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.7 0', 'M5 12v8.5h14V12', R(9.5, 14.5, 5, 6));
  I('credit-card', 'card pay payment bank', R(2.5, 5, 19, 14, 2), L(2.5, 10, 21.5, 10), L(6, 15, 10, 15));
  I('wallet', 'money purse pay', 'M19 7.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5a2.5 2.5 0 0 0 0 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-11', 'M20.5 12h-3.5a2 2 0 0 0 0 4h3.5');
  I('banknote', 'money cash bill', R(2.5, 6, 19, 12, 2), C(12, 12, 2.5), D(6, 12), D(18, 12));
  I('coins', 'money cash coin', C(9, 9, 6), 'M17.2 10.7a6 6 0 1 1-6.5 6.5', L(8, 7, 9, 6, 9, 12));
  I('dollar', 'money usd currency price', L(12, 2.5, 12, 21.5), 'M17 6.5H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H6.5');
  I('euro', 'money eur currency', 'M18 6.2A7 7 0 1 0 18 17.8', L(4, 10, 13, 10), L(4, 14, 13, 14));
  I('pound', 'money gbp currency', 'M17 6a3.8 3.8 0 0 0-7 2v12.5', L(6.5, 20.5, 18, 20.5), L(6.5, 13, 14, 13), 'M10 20.5a3 3 0 0 0-3-3');
  I('bitcoin', 'crypto btc', 'M7 4h7a3.5 3.5 0 0 1 0 7H7Z', 'M7 11h8a3.5 3.5 0 0 1 0 7H7Z', L(7, 4, 7, 18), L(9.5, 2, 9.5, 4), L(13, 2, 13, 4), L(9.5, 18, 9.5, 20.5), L(13, 18, 13, 20.5));
  I('piggy-bank', 'save money savings', 'M18.5 9.5c-1.4-2.4-4-3.5-7-3.5-4.6 0-8 2.8-8 6.8 0 2.2 1.2 4 3 5.2V20.5h3v-1.6a11 11 0 0 0 4 0v1.6h3v-2.6a6 6 0 0 0 1.8-2.4H21v-4h-1.7a5 5 0 0 0-.8-2Z', 'M10 6.2a2.5 2.5 0 1 1 4.6-.7', D(16, 11));
  I('receipt', 'bill invoice purchase', 'M5 2.5v19l2.3-1.5 2.3 1.5 2.4-1.5 2.4 1.5 2.3-1.5L19 21.5v-19l-2.3 1.5-2.3-1.5L12 4 9.6 2.5 7.3 4Z', L(8.5, 8.5, 15.5, 8.5), L(8.5, 12, 15.5, 12), L(8.5, 15.5, 12.5, 15.5));
  I('gift', 'present box surprise', R(3, 8, 18, 4.5, 1), 'M4.5 12.5v7a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-7', L(12, 8, 12, 21), 'M12 8C10.5 3 6 3 6 5.5S9.5 8 12 8Z', 'M12 8c1.5-5 6-5 6-2.5S14.5 8 12 8Z');
  I('package', 'box parcel delivery', 'M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z', L(3.8, 7.2, 12, 11.7, 20.2, 7.2), L(12, 11.7, 12, 21.5), L(7.8, 4.8, 16.2, 9.4));
  I('briefcase', 'work job business bag', R(2.5, 7, 19, 13.5, 2), 'M8.5 7V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2', L(2.5, 13, 21.5, 13));
  I('chart-line', 'graph stats analytics growth', L(3.5, 3.5, 3.5, 20.5, 20.5, 20.5), L(7, 15, 11, 10.5, 14, 13.5, 20, 7));
  I('chart-column', 'bar graph stats', L(3.5, 3.5, 3.5, 20.5, 20.5, 20.5), L(8, 17, 8, 12), L(12.5, 17, 12.5, 7), L(17, 17, 17, 10));
  I('chart-pie', 'pie graph share', 'M21 12.5A9 9 0 1 1 11.5 3v9.5Z', 'M14.5 2.6A8 8 0 0 1 21.4 9.5h-6.9Z');
  I('trending-up', 'growth rise increase stocks', L(2.5, 17.5, 9, 11, 13, 15, 21.5, 6.5), L(15.5, 6.5, 21.5, 6.5, 21.5, 12.5));
  I('trending-down', 'fall decrease loss', L(2.5, 6.5, 9, 13, 13, 9, 21.5, 17.5), L(15.5, 17.5, 21.5, 17.5, 21.5, 11.5));
  I('target', 'goal aim focus bullseye', C(12, 12, 10), C(12, 12, 6), C(12, 12, 2));
  I('award', 'prize badge ribbon winner', C(12, 9, 6.5), L(8.5, 14.5, 7, 21.5, 12, 19, 17, 21.5, 15.5, 14.5));
  I('medal', 'prize winner first', L(7, 2.5, 10.5, 9.3), L(17, 2.5, 13.5, 9.3), L(10, 2.5, 14, 2.5), C(12, 15, 6), L(12, 12.5, 12, 17.5));
  I('trophy', 'cup winner champion prize', 'M7 3.5h10v6a5 5 0 0 1-10 0Z', 'M7 5.5H4.5v1.5a3.5 3.5 0 0 0 3 3.4', 'M17 5.5h2.5v1.5a3.5 3.5 0 0 1-3 3.4', L(12, 14.5, 12, 18), R(8, 18, 8, 3, 1));
  I('crown', 'king queen royal vip premium', G(3, 7.5, 7.5, 12, 12, 4.5, 16.5, 12, 21, 7.5, 19, 18, 5, 18), L(5, 21, 19, 21));
  I('gem', 'diamond jewel premium', G(6.5, 3.5, 17.5, 3.5, 21.5, 9, 12, 21, 2.5, 9), L(2.5, 9, 21.5, 9), L(9, 3.5, 7.5, 9, 12, 21, 16.5, 9, 15, 3.5));
  I('ticket', 'pass event coupon', 'M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4Z', L(14.5, 6, 14.5, 8), L(14.5, 11, 14.5, 13), L(14.5, 16, 14.5, 18));
  I('scale', 'balance law justice', L(12, 3, 12, 21), L(7.5, 21, 16.5, 21), L(4, 7, 20, 7), 'M2 15l2-7 2 7a2.2 2.2 0 0 1-4 0Z', 'M18 15l2-7 2 7a2.2 2.2 0 0 1-4 0Z');
  I('building', 'office company city', R(4, 2.5, 16, 19, 1.5), L(8, 6.5, 8, 6.6), D(8, 6.5), D(12, 6.5), D(16, 6.5), D(8, 10.5), D(12, 10.5), D(16, 10.5), D(8, 14.5), D(16, 14.5), R(10, 15, 4, 6.5));
  I('building-2', 'office company towers city', R(3, 9, 8, 12.5, 1), 'M11 21.5V4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 21 4v17.5', D(6, 13), D(6, 17), D(14.5, 6.5), D(17.5, 6.5), D(14.5, 10.5), D(17.5, 10.5), D(14.5, 14.5), D(17.5, 14.5), L(2, 21.5, 22, 21.5));
  I('landmark', 'bank museum government', L(2.5, 21, 21.5, 21), G(3, 9, 12, 3.5, 21, 9), L(5.5, 12, 5.5, 18), L(10, 12, 10, 18), L(14, 12, 14, 18), L(18.5, 12, 18.5, 18));
  I('factory', 'industry plant', 'M2.5 21V10l5.5 3.5V10l5.5 3.5V5h3l.5-2.5h2L19.5 5H21.5v16Z', L(7, 17, 8, 17), L(11.5, 17, 12.5, 17), L(16, 17, 17, 17));

  // ---- weather & nature ----
  I('cloud', 'weather sky storage', 'M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.3A3.9 3.9 0 0 1 17.5 18.5Z');
  I('cloud-rain', 'rain weather storm', 'M7 14.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.3A3.9 3.9 0 0 1 17.5 14.5', L(8, 17, 7, 20), L(12, 17, 11, 20), L(16, 17, 15, 20));
  I('cloud-snow', 'snow winter weather', 'M7 14.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.3A3.9 3.9 0 0 1 17.5 14.5', D(8, 18), D(12, 17.5), D(16, 18), D(10, 21), D(14, 21));
  I('cloud-lightning', 'storm thunder weather', 'M7 15.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.3A3.9 3.9 0 0 1 17.5 15.5H16', L(12.5, 11, 10, 16, 14, 16, 11.5, 21));
  I('cloud-sun', 'partly cloudy weather', 'M9 20.5a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.4 1A3 3 0 0 1 17.5 20.5Z', 'M5.6 12.5a4 4 0 0 1 6.9-4', rays(8.5, 9.5, 5.6, 7.3, 5, 190));
  I('cloud-download', 'download cloud save', 'M6.5 16.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.3 3.9 3.9 0 0 1 .7 7.7', L(12, 11, 12, 21), L(8.5, 17.5, 12, 21, 15.5, 17.5));
  I('cloud-upload', 'upload cloud backup', 'M6.5 16.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.3 3.9 3.9 0 0 1 .7 7.7', L(12, 21, 12, 11), L(8.5, 14.5, 12, 11, 15.5, 14.5));
  I('snowflake', 'snow winter cold ice', rays(12, 12, 0, 10, 6, 90), L(9.5, 3.5, 12, 5.5, 14.5, 3.5), L(9.5, 20.5, 12, 18.5, 14.5, 20.5), tf(L(9.5, 3.5, 12, 5.5, 14.5, 3.5) + L(9.5, 20.5, 12, 18.5, 14.5, 20.5), 1, 60), tf(L(9.5, 3.5, 12, 5.5, 14.5, 3.5) + L(9.5, 20.5, 12, 18.5, 14.5, 20.5), 1, -60));
  I('umbrella', 'rain protect weather', 'M2.5 12a9.5 9.5 0 0 1 19 0Z', 'M12 12v6.5a2 2 0 0 0 4 0', L(12, 2.5, 12, 3));
  I('wind', 'air breeze weather', 'M3 8.5h10a2.5 2.5 0 1 0-2.5-2.5', 'M3 12.5h15a2.8 2.8 0 1 1-2.8 2.8', 'M3 16.5h6a2 2 0 1 1-2 2');
  I('thermometer', 'temperature heat weather', 'M10 14.6V5a2 2 0 0 1 4 0v9.6a4 4 0 1 1-4 0Z', L(12, 10, 12, 17));
  I('droplet', 'water drop liquid', 'M12 2.5s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.5 12 2.5 12 2.5Z');
  I('waves', 'water sea ocean', 'M2.5 7c2.4 0 2.4-2 4.8-2s2.4 2 4.7 2 2.4-2 4.7-2 2.4 2 4.8 2', 'M2.5 12c2.4 0 2.4-2 4.8-2s2.4 2 4.7 2 2.4-2 4.7-2 2.4 2 4.8 2', 'M2.5 17c2.4 0 2.4-2 4.8-2s2.4 2 4.7 2 2.4-2 4.7-2 2.4 2 4.8 2');
  I('rainbow', 'colors weather', 'M2.5 18a9.5 9.5 0 0 1 19 0', 'M6 18a6 6 0 0 1 12 0', 'M9.5 18a2.5 2.5 0 0 1 5 0');
  I('sunrise', 'morning dawn', 'M7 17.5a5 5 0 0 1 10 0', L(2.5, 21, 21.5, 21), L(12, 2.5, 12, 8), L(9, 5.5, 12, 2.5, 15, 5.5), L(4.2, 11.5, 5.6, 12.9), L(19.8, 11.5, 18.4, 12.9), L(2, 17.5, 3.5, 17.5), L(20.5, 17.5, 22, 17.5));
  I('sunset', 'evening dusk', 'M7 17.5a5 5 0 0 1 10 0', L(2.5, 21, 21.5, 21), L(12, 8, 12, 2.5), L(9, 5, 12, 8, 15, 5), L(4.2, 11.5, 5.6, 12.9), L(19.8, 11.5, 18.4, 12.9), L(2, 17.5, 3.5, 17.5), L(20.5, 17.5, 22, 17.5));
  I('flame', 'fire hot trending burn', 'M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-4.5-4-6.5-4.5-12-3 2-6.5 5.5-6.5 10a3 3 0 0 1-2-2.5A7.7 7.7 0 0 0 5.5 15a6.5 6.5 0 0 0 6.5 6.5Z', 'M12 21.5a3 3 0 0 1-3-3c0-2 3-4 3-4s3 2 3 4a3 3 0 0 1-3 3Z');
  I('leaf', 'nature eco plant green', 'M4.5 19.5C4.5 9.5 10 4 20 4c0 10-5.5 15.5-15.5 15.5Z', L(4.5, 19.5, 14, 10));
  I('sprout', 'grow plant seed', L(12, 21, 12, 11), 'M12 11C12 6.5 8.5 4.5 4 4.5 4 9 7.5 11 12 11Z', 'M12 14c0-4 3-6.5 8-6.5 0 4-3 6.5-8 6.5Z');
  I('flower', 'nature bloom spring', C(12, 12, 2.6), tf(E(12, 6, 2.6, 3.4), 1, 0), tf(E(12, 6, 2.6, 3.4), 1, 72), tf(E(12, 6, 2.6, 3.4), 1, 144), tf(E(12, 6, 2.6, 3.4), 1, 216), tf(E(12, 6, 2.6, 3.4), 1, 288));
  I('tree-pine', 'forest nature christmas', G(12, 2.5, 18, 10, 15.5, 10, 20, 16, 4, 16, 8.5, 10, 6, 10), L(12, 16, 12, 21.5));
  I('tree', 'nature park forest', C(12, 9, 6.5), L(12, 15.5, 12, 21.5), L(12, 17.5, 15, 14.5));
  I('mountain', 'peak nature outdoors', G(2.5, 19.5, 9, 7, 13, 14, 15.5, 10.5, 21.5, 19.5), L(7, 10.8, 9, 12.5, 11, 10.8));
  I('earth', 'planet world', C(12, 12, 10), 'M3.5 9.5h3.5l2 2v2.5l2 2v5', 'M15.5 3.2V6l-2 2h-2v2.5h3l2.5 2.5v3l2 1.5');
  I('feather', 'light quill write', 'M19.5 4.5a6 6 0 0 0-8.5 0L5 10.5V19h8.5l6-6a6 6 0 0 0 0-8.5Z', L(16, 8, 2.5, 21.5), L(17.5, 15, 9, 15));
  I('paw', 'pet animal dog cat', 'M12 12c-3 0-6 4-6 6.3 0 1.6 1.4 2.2 3 2.2 1.2 0 2-.5 3-.5s1.8.5 3 .5c1.6 0 3-.6 3-2.2C18 16 15 12 12 12Z', E(5, 10, 1.8, 2.2), E(9, 5.5, 1.8, 2.3), E(15, 5.5, 1.8, 2.3), E(19, 10, 1.8, 2.2));
  I('bug', 'insect error debug', R(7.5, 7.5, 9, 13, 4.5), 'M9 7.5a3 3 0 0 1 6 0', L(12, 12, 12, 20.5), L(7.5, 12, 3.5, 11), L(16.5, 12, 20.5, 11), L(7.5, 16, 3.5, 17.5), L(16.5, 16, 20.5, 17.5), L(9.5, 5.5, 8, 3), L(14.5, 5.5, 16, 3));
  I('fish', 'sea animal food', 'M2.5 12s3.5-5.5 10-5.5c4 0 6.5 2.5 8 5.5-1.5 3-4 5.5-8 5.5-6.5 0-10-5.5-10-5.5Z', G(2.5, 12, 0.8, 8.5, 0.8, 15.5), D(16, 11));
  I('bird', 'fly tweet animal', 'M16 7h.01', 'M3.5 20.5 10 14', 'M20.5 7 18 6.5a4 4 0 0 0-7.5 2V13a6.5 6.5 0 0 1-7 6.5c7 1 13-2.5 13-9V9Z');
  I('cat', 'pet animal kitten', 'M5 9.5V3.5l4.5 3.5h5L19 3.5v6a8 8 0 0 1 1 4c0 4.4-3.6 7-8 7s-8-2.6-8-7a8 8 0 0 1 1-4Z', D(9, 13), D(15, 13), L(11, 16.5, 12, 17.5, 13, 16.5));
  I('dog', 'pet animal puppy', 'M7 6.5 4 5 2.5 10.5l3 1.5', 'M17 6.5 20 5l1.5 5.5-3 1.5', 'M6 8.5a6 6 0 0 1 12 0V14a6.5 6.5 0 0 1-12 0Z', D(9.5, 11.5), D(14.5, 11.5), 'M10.5 15.5h3L12 17Z');
  I('rabbit', 'bunny pet animal', 'M8.5 10.5C6 5 6.5 2.5 8 2.5s3.5 3.5 3.5 7.5', 'M15.5 10.5C18 5 17.5 2.5 16 2.5s-3.5 3.5-3.5 7.5', C(12, 15.5, 6), D(10, 14.5), D(14, 14.5));
  I('turtle', 'slow animal', 'M3.5 15a8.5 8.5 0 0 1 17 0Z', L(3, 15, 21, 15), L(6, 15, 5, 18.5), L(18, 15, 19, 18.5), 'M20.5 13.5a2 2 0 1 0 1.5-3', L(9, 8.5, 12, 11.5, 15, 8.5));
  I('butterfly', 'insect spring nature', L(12, 7, 12, 19), 'M12 11C10 5 4 3 3 6s1.5 6 9 5Z', 'M12 11c2-6 8-8 9-5s-1.5 6-9 5Z', 'M12 13c-2 0-7 1-6 5s5 0 6-5Z', 'M12 13c2 0 7 1 6 5s-5 0-6-5Z', L(10.5, 4, 12, 7, 13.5, 4));

  // ---- food & drink ----
  I('coffee', 'cup drink cafe tea hot', 'M4 9.5h13v6.5a4.5 4.5 0 0 1-4.5 4.5h-4A4.5 4.5 0 0 1 4 16Z', 'M17 11h1.5a2.5 2.5 0 0 1 0 5H17', 'M8 2.5c-1 1 1 2 0 3.5', 'M12 2.5c-1 1 1 2 0 3.5');
  I('cup', 'mug drink tea', 'M5 7h12l-1.4 12.5a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3Z', L(4, 7, 18, 7), L(11, 7, 13, 2.5, 16, 2.5));
  I('wine', 'glass drink bar', 'M8 2.5h8l.6 5a4.6 4.6 0 0 1-9.2 0Z', L(12, 12, 12, 21), L(8, 21, 16, 21), L(7.6, 6.5, 16.4, 6.5));
  I('beer', 'mug drink bar pub', R(5, 7, 10, 14, 1.5), 'M15 10h2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H15', 'M5 7a2.5 2.5 0 0 1 2.5-3.5 3 3 0 0 1 5 0A2.5 2.5 0 0 1 15 7', L(8.5, 11, 8.5, 17), L(11.5, 11, 11.5, 17));
  I('pizza', 'food slice italian', 'M3 6.5a20 20 0 0 1 18 0L12 21.5Z', 'M4.3 9.5a16 16 0 0 1 15.4 0', D(10, 12.5), D(14, 13), D(12, 16.5));
  I('cake', 'birthday party dessert', R(3.5, 11, 17, 10, 1.5), 'M3.5 15c1.4 1 2.8 1 4.2 0s2.9-1 4.3 0 2.9 1 4.3 0 2.8-1 4.2 0', L(8, 11, 8, 8), L(12, 11, 12, 8), L(16, 11, 16, 8), 'M8 5.5s-.8-.8 0-2c.8 1.2 0 2 0 2Z', 'M12 5.5s-.8-.8 0-2c.8 1.2 0 2 0 2Z', 'M16 5.5s-.8-.8 0-2c.8 1.2 0 2 0 2Z');
  I('ice-cream-cone', 'dessert sweet summer', G(7, 11.5, 17, 11.5, 12, 21.5), 'M6.5 11.5a5.5 5.5 0 1 1 11 0');
  I('cookie', 'biscuit snack sweet', 'M21.3 12.6A9.3 9.3 0 1 1 11.4 2.7a3.4 3.4 0 0 0 4 4 3.4 3.4 0 0 0 5.9 5.9Z', D(8.5, 9), D(14, 15.5), D(8.5, 15), D(12, 12));
  I('apple', 'fruit food healthy', 'M12 7.5c-1.2-.9-2.6-1.3-4-1C5 7 3.5 10 4 13.5c.6 4 3.5 8 6 8 .8 0 1.3-.5 2-.5s1.2.5 2 .5c2.5 0 5.4-4 6-8 .5-3.5-1-6.5-4-7-1.4-.3-2.8.1-4 1Z', 'M12 7.5c0-2.5 1.5-4.5 4-5');
  I('cherry', 'fruit sweet', C(6.5, 17.5, 3.5), C(17.5, 17.5, 3.5), 'M6.5 14C8 9 10 5 13 2.5c1.5 4 3.3 7.7 4.5 11.5', 'M13 2.5c2 0 5 .5 7 2');
  I('carrot', 'vegetable food', 'M16 8 4 20c4-.5 9-2 12-5 1.8-1.8 1.8-5.2 0-7Z', 'M16 8c0-3 2-5.5 4.5-5.5', 'M16 8c3 0 5.5-2 5.5-4.5', L(8.5, 13.5, 10.5, 15.5), L(11, 11, 13, 13));
  I('egg', 'food breakfast', 'M12 21.5a7 7 0 0 0 7-7C19 9 15.5 2.5 12 2.5S5 9 5 14.5a7 7 0 0 0 7 7Z');
  I('sandwich', 'burger food fast', 'M3.5 11.5a8.5 6 0 0 1 17 0Z', L(2.5, 14.5, 21.5, 14.5), R(3.5, 17, 17, 3.5, 1.5));
  I('donut', 'sweet dessert', C(12, 12, 9.5), C(12, 12, 3), 'M4.5 9.5c1 .8 2.2.6 3-.4M13 5c.7 1 2 1.3 3 .5M17.5 13.5c1-.2 2 .6 2.3 1.5');
  I('utensils', 'restaurant food eat fork knife', L(7, 2.5, 7, 21.5), 'M4 2.5v5a3 3 0 0 0 6 0v-5', 'M17.5 21.5V2.5c-2.5 1.5-3.5 4.5-3.5 8.5v3h3.5');
  I('chef-hat', 'cook kitchen', 'M6.5 14.5a4 4 0 0 1-.5-8 6 6 0 0 1 12 0 4 4 0 0 1-.5 8v6.5h-11Z', L(6.5, 17.5, 17.5, 17.5));
  I('popcorn', 'cinema movie snack', G(5, 9.5, 19, 9.5, 17, 21.5, 7, 21.5), L(10, 9.5, 10.5, 21.5), L(14, 9.5, 13.5, 21.5), 'M5 9.5a2.5 2.5 0 0 1 1.5-4.6 2.8 2.8 0 0 1 5-1.5 2.8 2.8 0 0 1 5 1.5A2.5 2.5 0 0 1 19 9.5');
  I('candy', 'sweet treat', E(12, 12, 4.8, 3.6), G(7.4, 11, 3, 7.5, 3.5, 12.5, 2.5, 16), G(16.6, 13, 21, 16.5, 20.5, 11.5, 21.5, 8));
  I('soup', 'bowl food hot', 'M3 11.5h18a9 9 0 0 1-18 0Z', 'M8 7.5c-.8-1 .8-2 0-3.5', 'M12 7.5c-.8-1 .8-2 0-3.5', 'M16 7.5c-.8-1 .8-2 0-3.5');
  I('milk', 'bottle drink dairy', 'M8.5 2.5h7v3l2 3.5v11a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5V9l2-3.5Z', L(8.5, 5.5, 15.5, 5.5), L(6.5, 12, 17.5, 12));

  // ---- tech & devices ----
  I('smartphone', 'phone mobile device cell', R(6, 2.5, 12, 19, 2.5), L(10.5, 18.5, 13.5, 18.5));
  I('tablet', 'ipad device', R(4, 2.5, 16, 19, 2.5), D(12, 18.3));
  I('laptop', 'computer notebook device', R(4.5, 4.5, 15, 10.5, 1.5), 'M2 19.5h20l-1.8-4.5H3.8Z');
  I('monitor', 'screen display desktop computer', R(2.5, 3.5, 19, 13, 2), L(8, 21, 16, 21), L(12, 16.5, 12, 21));
  I('watch', 'smartwatch time wearable', R(6, 6, 12, 12, 3), 'M8.5 6l.8-3.5h5.4L15.5 6', 'M8.5 18l.8 3.5h5.4l.8-3.5', L(12, 9.5, 12, 12, 13.8, 13));
  I('keyboard', 'type input', R(2, 5.5, 20, 13, 2), D(6, 9.5), D(10, 9.5), D(14, 9.5), D(18, 9.5), D(6, 13), D(18, 13), D(10, 13), D(14, 13), L(8, 15.8, 16, 15.8));
  I('mouse', 'computer click', R(6, 2.5, 12, 19, 6), L(12, 6.5, 12, 9.5));
  I('printer', 'print paper', 'M6.5 9V2.5h11V9', 'M6.5 17.5H4.5a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-2', R(6.5, 14, 11, 7.5));
  I('cpu', 'chip processor hardware', R(5, 5, 14, 14, 2), R(9, 9, 6, 6), L(9, 2, 9, 5), L(15, 2, 15, 5), L(9, 19, 9, 22), L(15, 19, 15, 22), L(2, 9, 5, 9), L(2, 15, 5, 15), L(19, 9, 22, 9), L(19, 15, 22, 15));
  I('server', 'hosting data rack', R(3, 3, 18, 8, 2), R(3, 13, 18, 8, 2), D(7, 7), D(7, 17));
  I('database', 'data storage sql', E(12, 5.5, 8, 3), 'M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3');
  I('hard-drive', 'storage disk', R(2.5, 13, 19, 7.5, 2), 'M2.5 13 6 4.5h12l3.5 8.5', D(6.5, 16.8), D(10, 16.8));
  I('usb', 'cable connect', C(12, 19, 2.5), L(12, 16.5, 12, 3), L(9.5, 5.5, 12, 3, 14.5, 5.5), 'M12 13 7 10.5V8', 'M12 11.5 17 9V7', R(5.8, 6, 2.4, 2.4), C(17, 6, 1.2));
  I('code', 'developer programming html', L(8, 6.5, 2.5, 12, 8, 17.5), L(16, 6.5, 21.5, 12, 16, 17.5));
  I('code-xml', 'brackets slash dev', L(7.5, 7, 2.5, 12, 7.5, 17), L(16.5, 7, 21.5, 12, 16.5, 17), L(14, 4, 10, 20));
  I('terminal', 'console command shell', L(4, 6.5, 9.5, 12, 4, 17.5), L(12, 18, 20, 18));
  I('bot', 'robot ai assistant', R(4, 8, 16, 12, 3), L(12, 8, 12, 4.5), D(12, 3.5), D(9, 13.5), D(15, 13.5), L(2, 13, 4, 13), L(20, 13, 22, 13), L(10, 17, 14, 17));
  I('sparkles', 'magic ai new shine stars', 'M10 3.5 11.6 8.4 16.5 10 11.6 11.6 10 16.5 8.4 11.6 3.5 10 8.4 8.4Z', 'M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9Z', 'M18 3v3M16.5 4.5h3');
  I('qr-code', 'scan code', R(3, 3, 7, 7, 1), R(14, 3, 7, 7, 1), R(3, 14, 7, 7, 1), D(6.5, 6.5), D(17.5, 6.5), D(6.5, 17.5), L(14, 14, 17, 14, 17, 17), L(21, 14, 21, 14.1), L(14, 20.5, 14, 21), L(17.5, 21, 21, 21, 21, 17.5));
  I('scan', 'barcode read frame', L(3, 7.5, 3, 3, 7.5, 3), L(16.5, 3, 21, 3, 21, 7.5), L(21, 16.5, 21, 21, 16.5, 21), L(7.5, 21, 3, 21, 3, 16.5), L(7, 12, 17, 12));
  I('fingerprint', 'identity touch biometric', 'M6.5 18.5C7.5 16 8 14 8 11.5a4 4 0 0 1 8 0c0 .6 0 1.2-.1 1.8', 'M12 11.5c0 3-.6 6-2 8.5', 'M15.5 16.5c-.4 1.5-1 3-1.8 4.5', 'M4 15a24 24 0 0 0 .5-3.5 7.5 7.5 0 0 1 13-5.1', 'M20 11.5c0 1.5-.1 3-.4 4.5');
  I('rocket', 'launch startup fast space', 'M12 2.5c3.5 2.3 5 6 5 10v4H7v-4c0-4 1.5-7.7 5-10Z', C(12, 10, 2), 'M7 13.5 4 17v3l3-1.5', 'M17 13.5 20 17v3l-3-1.5', L(10, 19.5, 10, 21.5), L(14, 19.5, 14, 21.5), L(12, 19.5, 12, 22));
  I('lightbulb', 'idea light tip creative', 'M9 17.5c0-2-3.5-3.5-3.5-8a6.5 6.5 0 0 1 13 0c0 4.5-3.5 6-3.5 8Z', L(9.5, 21, 14.5, 21), L(10, 17.5, 10, 14, 14, 14, 14, 17.5));
  I('magnet', 'attract pull', 'M5 3.5h4.5v8a2.5 2.5 0 0 0 5 0v-8H19v8a7 7 0 0 1-14 0Z', L(5, 8, 9.5, 8), L(14.5, 8, 19, 8));
  I('fan', 'cooling air spin', C(12, 12, 1.8), 'M12 10.2C11 7 11.5 3 14.5 3s3 4-2.5 7.2Z', 'M13.8 12c3.2-1 7.2-.5 7.2 2.5s-4 3-7.2-2.5Z', 'M12 13.8c1 3.2.5 7.2-2.5 7.2s-3-4 2.5-7.2Z', 'M10.2 12C7 13 3 12.5 3 9.5s4-3 7.2 2.5Z');
  I('folder', 'directory files', 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.5h8.4A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z');
  I('file', 'document page paper', 'M14 2.5H6.5a1.5 1.5 0 0 0-1.5 1.5v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z', L(14, 2.5, 14, 7.5, 19, 7.5));
  I('file-text', 'document report notes', P('file'), L(8.5, 12, 15.5, 12), L(8.5, 15.5, 15.5, 15.5), L(8.5, 8.5, 11, 8.5));
  I('notebook', 'notes journal', R(5, 2.5, 15, 19, 1.5), L(9, 2.5, 9, 21.5), L(3, 7, 7, 7), L(3, 12, 7, 12), L(3, 17, 7, 17), L(12.5, 7.5, 16.5, 7.5));
  I('book-open', 'read study learn', 'M2.5 5a9 9 0 0 1 9.5 1.5v14A9 9 0 0 0 2.5 19Z', 'M21.5 5A9 9 0 0 0 12 6.5v14a9 9 0 0 1 9.5-1.5Z');
  I('book', 'read library learn', 'M4.5 19V5a2.5 2.5 0 0 1 2.5-2.5h12.5v16H7a2.5 2.5 0 0 0 0 5h12.5v-3');
  I('graduation-cap', 'education school student university', G(12, 4, 22, 9, 12, 14, 2, 9), 'M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5', L(22, 9, 22, 15));
  I('pen', 'write draw edit', 'M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 3.5 20.5 6 15.5Z');
  I('paintbrush', 'paint art design', 'M18.5 2.5 9.5 11.5l3 3 9-9a2.1 2.1 0 0 0-3-3Z', 'M9.5 11.5c-3 0-4.5 2-4.5 4.5 0 2-1.5 3.5-2.5 4 4.5 1 10 0 10-5.5Z');
  I('palette', 'colors art paint design', 'M12 21.5a9.5 9.5 0 1 1 9.5-9.5c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3c.9 1-.2 2.7-2 2.7Z', D(7.5, 11), D(10, 7), D(14.5, 7), D(17, 10.5));
  I('scissors', 'cut trim', C(6, 6, 3), C(6, 18, 3), L(8.3, 7.8, 20, 17.5), L(8.3, 16.2, 20, 6.5));
  I('ruler', 'measure size', 'M21 7.5 7.5 21a1.5 1.5 0 0 1-2.1 0L3 18.6a1.5 1.5 0 0 1 0-2.1L16.5 3a1.5 1.5 0 0 1 2.1 0L21 5.4a1.5 1.5 0 0 1 0 2.1Z', L(7.5, 12, 9.5, 14), L(10.5, 9, 12, 10.5), L(13.5, 6, 15.5, 8));
  I('wrench', 'tool fix repair settings', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9L6.9 20.1a2.1 2.1 0 0 1-3-3l6.7-6.7a6 6 0 0 1 7.9-7.9Z');
  I('hammer', 'tool build construction', 'M15 12 6.5 20.5a2.1 2.1 0 0 1-3-3L12 9', 'M17.6 15 22 10.6l-6-6-1.5-1.5a5 5 0 0 0-5 0L9 3.5 13 6.5v2Z');
  I('layers', 'stack design', G(12, 2.5, 22, 7.5, 12, 12.5, 2, 7.5), L(2, 12, 12, 17, 22, 12), L(2, 16.5, 12, 21.5, 22, 16.5));
  I('crop', 'cut frame image', 'M6 2.5V16a2 2 0 0 0 2 2h13.5', 'M2.5 6H16a2 2 0 0 1 2 2v13.5');
  I('wand', 'magic effect', L(3, 21, 15, 9), L(13.5, 7.5, 16.5, 10.5), 'M15 3v2M19 5l-1.4 1.4M21 9h-2M19.5 13 18 11.5M11 5 9.6 3.6');
  I('pipette', 'eyedropper color picker', 'M14.5 6.5 17 4a2.1 2.1 0 0 1 3 3l-2.5 2.5', L(12, 6, 18, 12), 'M15 9 6 18l-3 .9.9-3L13 7');
  I('type', 'text font typography', L(5, 6.5, 5, 4, 19, 4, 19, 6.5), L(12, 4, 12, 20), L(9, 20, 15, 20));
  I('bold', 'text strong', 'M6.5 4h7a4 4 0 0 1 0 8h-7Z', 'M6.5 12h8a4 4 0 0 1 0 8h-8Z');
  I('italic', 'text slant', L(10, 4, 19, 4), L(5, 20, 14, 20), L(14.5, 4, 9.5, 20));
  I('underline', 'text', 'M6.5 4v7a5.5 5.5 0 0 0 11 0V4', L(4.5, 20.5, 19.5, 20.5));
  I('align-left', 'text paragraph', L(3.5, 6, 20.5, 6), L(3.5, 10, 14.5, 10), L(3.5, 14, 20.5, 14), L(3.5, 18, 12.5, 18));
  V('align-right', 'align-left', { m: true }, 'text paragraph rtl');
  I('align-center', 'text paragraph', L(3.5, 6, 20.5, 6), L(6.5, 10, 17.5, 10), L(3.5, 14, 20.5, 14), L(7.5, 18, 16.5, 18));
  I('quote', 'quotation testimonial', 'M4 17.5c0-4 1.5-8.5 5.5-10.5', R(4, 11.5, 6, 6, 1.5), 'M13.5 17.5c0-4 1.5-8.5 5.5-10.5', R(13.5, 11.5, 6, 6, 1.5));

  // ---- travel & transport ----
  I('plane', 'flight travel airport trip', 'M21 4.5c-.8-.8-2.3-.7-3.2.2L14 8.5 5.5 6 3.5 8l7 4-3.5 3.5H4.5l-1.5 1.5 3.5 1.5 1.5 3.5 1.5-1.5v-2.5L13 14.5l4 7 2-2-2.5-8.5 3.8-3.8c.9-.9 1-2.4.2-3.2Z');
  I('car', 'vehicle drive auto transport', 'M3.5 16.5V12l2-5.2A2 2 0 0 1 7.4 5.5h9.2a2 2 0 0 1 1.9 1.3l2 5.2v4.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z', L(3.5, 12, 20.5, 12), C(7.5, 17.5, 2), C(16.5, 17.5, 2));
  I('bus', 'transport public city', R(4, 3, 16, 15, 2.5), L(4, 11, 20, 11), L(4, 7, 20, 7), D(8, 14.5), D(16, 14.5), L(6.5, 18, 6.5, 20.5), L(17.5, 18, 17.5, 20.5));
  I('train', 'metro rail transport', R(5, 2.5, 14, 15, 3), L(5, 10, 19, 10), D(9, 13.8), D(15, 13.8), L(8, 17.5, 5.5, 21.5), L(16, 17.5, 18.5, 21.5), L(12, 2.5, 12, 10));
  I('truck', 'delivery shipping lorry', 'M2.5 5.5h11v11h-11Z', 'M13.5 9.5h4l3.5 3.5v3.5h-7.5', C(6.5, 17.5, 2), C(17, 17.5, 2));
  I('bike', 'bicycle cycle ride', C(5.5, 16.5, 3.8), C(18.5, 16.5, 3.8), L(5.5, 16.5, 9.5, 8.5, 15, 8.5, 18.5, 16.5), L(9.5, 8.5, 12, 16.5, 15, 8.5), L(8, 5.5, 11, 5.5), L(9.5, 5.5, 9.5, 8.5), L(14, 5.5, 15, 8.5));
  I('ship', 'boat sea cruise', 'M2.5 15.5h19l-2.5 5h-14Z', 'M5 15.5V10h14v5.5', L(12, 3, 12, 10), 'M12 4h5l-2 2.5 2 2.5h-5');
  I('sailboat', 'boat sea sail', 'M2.5 17.5h19l-2 3.5h-15Z', G(11, 2.5, 11, 15, 4, 15), 'M13.5 5.5c4 2.5 6 6 6 9.5h-6Z');
  I('anchor', 'sea marine harbor', C(12, 5, 2.5), L(12, 7.5, 12, 21.5), L(7.5, 10.5, 16.5, 10.5), 'M3.5 13.5a8.5 8 0 0 0 17 0', L(2, 15, 3.5, 13.5, 5, 15), L(19, 15, 20.5, 13.5, 22, 15));
  I('fuel', 'gas petrol station', R(3.5, 3, 10, 18, 1.5), L(3.5, 10, 13.5, 10), 'M13.5 13h2a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 0 3 0V9l-3-3', L(2, 21, 15, 21));
  I('luggage', 'suitcase travel bag', R(5, 6.5, 14, 13, 2), 'M9 6.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.5', L(9, 10, 9, 16), L(15, 10, 15, 16), L(8, 19.5, 8, 21), L(16, 19.5, 16, 21));
  I('tent', 'camping outdoor', L(2, 20.5, 22, 20.5), L(3.5, 20.5, 12, 4, 20.5, 20.5), L(12, 13, 9, 20.5), L(12, 13, 15, 20.5), L(10, 2, 12, 4, 14, 2));
  I('hotel', 'bed stay sleep', 'M2.5 4.5v15', 'M2.5 15.5h19v4', 'M21.5 15.5v-3a3 3 0 0 0-3-3h-8v6', C(6.5, 11.5, 2));
  I('signpost', 'direction way', L(12, 2.5, 12, 21.5), 'M5 5h12l2.5 2.5L17 10H5Z', 'M19 13H7l-2.5 2.5L7 18h12Z');
  I('route', 'path trip way', C(6, 18.5, 2.5), C(18, 5.5, 2.5), 'M8.5 18.5h8.5a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5');
  I('parking', 'car park p', R(3.5, 3.5, 17, 17, 2.5), 'M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5');
  I('castle', 'tower kingdom fort', 'M3.5 21V6.5h3V9h3V6.5h5V9h3V6.5h3V21Z', 'M10 21v-4.5a2 2 0 0 1 4 0V21', L(12, 6.5, 12, 2.5, 15, 3.5, 12, 4.5));
  I('rocket-launch', 'liftoff space', tf(P('rocket'), 0.9, 45));

  // ---- people & feelings ----
  I('smile', 'happy face emoji glad', C(12, 12, 10), 'M8 14.5a4.5 4.5 0 0 0 8 0', D(9, 9.5), D(15, 9.5));
  I('laugh', 'happy face joy lol', C(12, 12, 10), 'M7.5 13.5h9a4.5 4.5 0 0 1-9 0Z', L(8, 9.5, 10, 8.5), L(16, 9.5, 14, 8.5));
  I('frown', 'sad unhappy face', C(12, 12, 10), 'M8 16.5a4.5 4.5 0 0 1 8 0', D(9, 9.5), D(15, 9.5));
  I('meh', 'neutral face', C(12, 12, 10), L(8.5, 15.5, 15.5, 15.5), D(9, 9.5), D(15, 9.5));
  I('angry', 'mad face', C(12, 12, 10), 'M8 16.5a4.5 4.5 0 0 1 8 0', L(7.5, 8, 10, 9.5), L(16.5, 8, 14, 9.5));
  I('wink', 'face playful', C(12, 12, 10), 'M8 14.5a4.5 4.5 0 0 0 8 0', D(9, 9.5), L(13.8, 9.5, 16.2, 9.5));
  I('heart-eyes', 'love face crush', C(12, 12, 10), 'M8 14.5a4.5 4.5 0 0 0 8 0', tf(P('heart'), 0.22, 0, -3, -2.6), tf(P('heart'), 0.22, 0, 3, -2.6));
  I('cool', 'sunglasses face', C(12, 12, 10), 'M8.5 15a4 4 0 0 0 7 0', 'M5 8.5h14', 'M6 8.5h4.5v1.5a2 2 0 0 1-4 0Z', 'M13.5 8.5H18v1.5a2 2 0 0 1-4 0Z');
  I('surprised', 'wow shock face', C(12, 12, 10), C(12, 15.5, 1.8), D(9, 9.5), D(15, 9.5));
  I('baby', 'child kid infant', C(12, 12, 9.5), D(9, 11), D(15, 11), 'M10 15a2.5 2.5 0 0 0 4 0', 'M12 2.5c-1 1.5-1 3 1 3.5');
  I('person-standing', 'human body man', C(12, 4.5, 2), L(12, 7.5, 12, 14), L(6, 9.5, 18, 9.5), L(12, 14, 8.5, 21), L(12, 14, 15.5, 21));
  I('accessibility', 'wheelchair disabled access', C(15, 4.5, 1.8), 'M8 7.5 12.5 7.5 11 12.5H16l2 6', 'M18 18.5h2.5', 'M9.3 11a5.5 5.5 0 1 0 6.3 6.5');
  I('contact', 'card address book', R(3.5, 4, 17, 17, 2), L(8, 2, 8, 4), L(16, 2, 16, 4), C(12, 11, 2.8), 'M7.5 18a4.5 4.5 0 0 1 9 0');
  I('id-card', 'identity badge', R(2.5, 5, 19, 14, 2), C(8, 11, 2.2), 'M4.5 16a3.5 3.5 0 0 1 7 0', L(14, 10, 18.5, 10), L(14, 13.5, 18.5, 13.5));
  I('handshake', 'deal agreement partner', 'M2.5 11.5 6 8l3 1 3-2 3.5 0L21.5 11.5', 'M2.5 11.5l3 3', 'M21.5 11.5l-3 3', 'M5.5 14.5 10 19a1.4 1.4 0 0 0 2-2', 'M8 17l2.5 2.5a1.4 1.4 0 0 0 2-2', 'M11 15l3 3a1.4 1.4 0 0 0 2-2l-4.5-4.5L9 13a1.5 1.5 0 0 1-2-2l3.5-3', 'M16 16l2.5-1.5');
  I('heart-handshake', 'care support charity', P('heart'), 'M12 6.6 8.8 9.8a1.5 1.5 0 0 0 2.1 2.1L12.5 10.5l3 3', L(14, 15, 15.5, 16.5));
  I('crowd', 'people audience community', C(12, 7, 2.8), C(5, 9, 2.2), C(19, 9, 2.2), 'M7 19a5 5 0 0 1 10 0', 'M2 18a3.5 3.5 0 0 1 5-3.2', 'M22 18a3.5 3.5 0 0 0-5-3.2');
  I('speech', 'talk say bubble comment', 'M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4.5V16h-.5A2.5 2.5 0 0 1 3 13.5Z');
  I('reply', 'answer respond back', L(9.5, 17, 4.5, 12, 9.5, 7), 'M4.5 12h10a5 5 0 0 1 5 5v2');

  // ---- health & fitness ----
  I('heart-pulse', 'health heartbeat medical cardio', P('heart'), L(3.5, 12, 8.5, 12, 10, 9.5, 12.5, 14.5, 14, 12, 20.5, 12));
  I('activity', 'pulse heartbeat health stats', L(2.5, 12, 6.5, 12, 9.5, 4, 14.5, 20, 17.5, 12, 21.5, 12));
  I('stethoscope', 'doctor medical health', 'M5 3H4v5a5 5 0 0 0 10 0V3h-1', 'M9 13v1.5a6 6 0 0 0 12 0v-2', C(21, 10.5, 2));
  I('pill', 'medicine drug capsule', tf(R(2.5, 8.5, 19, 7, 3.5), 1, -45), tf(L(12, 8.5, 12, 15.5), 1, -45));
  I('syringe', 'vaccine injection medical', L(18, 2.5, 21.5, 6), L(19.7, 4.3, 15.5, 8.5), 'M15.5 8.5 6 18l-3 .5.5-3 9.5-9.5', L(17, 10, 14, 7), L(10, 11, 12, 13), L(7.5, 13.5, 9.5, 15.5), L(2.5, 21.5, 4.5, 19.5));
  I('cross', 'medical first aid hospital', 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z');
  I('hospital', 'clinic building medical', R(3.5, 6, 17, 15, 1.5), L(12, 9, 12, 14), L(9.5, 11.5, 14.5, 11.5), 'M8 6V3h8v3', R(10, 16.5, 4, 4.5));
  I('tooth', 'dental dentist teeth', 'M12 5.5c-1.5-1.5-4.5-2.5-6.5-.5S4 11 5 14c.6 1.8 1 7 3 7s1.7-5.5 4-5.5 2 5.5 4 5.5 2.4-5.2 3-7c1-3 1.5-7-.5-9s-5-1-6.5.5Z');
  I('brain', 'mind think smart ai', 'M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 3.5 7 3.5 3.5 0 0 0 4 13a3.5 3.5 0 0 0 3.5 5.5A3 3 0 0 0 12 19.5Z', 'M12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20.5 7 3.5 3.5 0 0 1 20 13a3.5 3.5 0 0 1-3.5 5.5A3 3 0 0 1 12 19.5Z', L(12, 5, 12, 19.5), 'M8.5 9a2.5 2.5 0 0 1 3.5 0M15.5 13a2.5 2.5 0 0 0-3.5 0');
  I('dumbbell', 'gym fitness workout weight', L(7.5, 12, 16.5, 12), R(4.5, 7, 3, 10, 1), R(16.5, 7, 3, 10, 1), L(2.5, 10, 2.5, 14), L(21.5, 10, 21.5, 14));
  I('footprints', 'steps walk', 'M5 16v-2.5C5 11 4 9.5 4 7c0-2.7 1.5-4.5 3.5-4.5 1.4 0 2.5 1.3 2.5 4 0 2.6-1 4.5-1 7V16', 'M5 16h4v2a2 2 0 0 1-4 0Z', 'M19 20v-2.5c0-2.5-1-4.4-1-7 0-2.7 1.1-4 2.5-4' , 'M15 20v-2.5c0-2.5 1-4 1-6.5', 'M15 20h4v1.5a2 2 0 0 1-4 0Z');
  I('weight', 'scale kg mass', 'M6.5 8h11l2.5 13H4Z', C(12, 5, 2.5));
  I('apple-fit', 'diet healthy fruit', tf(P('apple'), 0.9), L(9, 13, 11, 15, 15, 11));
  I('trophy-star', 'winner best', P('trophy'), tf(star(12, 12, 10, 4.3), 0.25, 0, 0, -3.5));

  // ---- home & objects ----
  I('bed', 'sleep rest bedroom', 'M2.5 5v15', 'M2.5 9.5h15a4 4 0 0 1 4 4V20', L(2.5, 16.5, 21.5, 16.5), R(5, 10.5, 5, 3, 1));
  I('sofa', 'couch living room', 'M4.5 11V7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V11', 'M2.5 13a2 2 0 0 1 4 0v2h11v-2a2 2 0 0 1 4 0v4.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5Z', L(5, 19, 5, 21), L(19, 19, 19, 21));
  I('lamp', 'light desk', G(7, 3, 17, 3, 19.5, 11, 4.5, 11), L(12, 11, 12, 19), L(7.5, 21, 16.5, 21), L(12, 19, 12, 21));
  I('door-open', 'enter exit room', 'M13.5 4.5v16.5L4.5 19V3l9 1.5Z', 'M13.5 4.5H19v16h3', L(2, 21, 13.5, 21), D(10.5, 12));
  I('key-round', 'access unlock', C(16, 8, 5.5), D(17.5, 6.5), 'M12 12 3 21v-3h3v-3h3l1-1');
  I('bath', 'bathroom shower clean', 'M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z', 'M6 12V5.5a2.5 2.5 0 0 1 4.7-1.2', L(7, 20, 6, 22), L(17, 20, 18, 22));
  I('shirt', 'clothes fashion wear', 'M8.5 3 3 5.5l1.5 5 3-1V21h9V9.5l3 1 1.5-5L15.5 3a3.5 3.5 0 0 1-7 0Z');
  I('glasses', 'eyewear read vision', C(6.5, 15, 3.5), C(17.5, 15, 3.5), 'M10 15a2 2 0 0 1 4 0', 'M3 15 4.5 6.5h2', 'M21 15l-1.5-8.5h-2');
  I('umbrella-beach', 'summer vacation sea', 'M3.5 11a9 9 0 0 1 17 0Z', L(12, 11, 12, 20.5), L(4, 20.5, 20, 20.5), L(12, 2, 12, 2.5));
  I('camera-retro', 'photo vintage', R(2.5, 6.5, 19, 14, 2), C(12, 13.5, 4), L(5, 4, 9, 4), D(18, 9.5));
  I('trash-2', 'delete bin remove', L(3.5, 6.5, 20.5, 6.5), 'M9 6.5V4.5h6v2', 'M5.5 6.5 6.6 19a2 2 0 0 0 2 1.8h6.8a2 2 0 0 0 2-1.8l1.1-12.5');
  I('box', 'cube package 3d', G(12, 2.5, 21, 7, 21, 17, 12, 21.5, 3, 17, 3, 7), L(3, 7, 12, 11.5, 21, 7), L(12, 11.5, 12, 21.5));
  I('archive', 'storage box files', R(2.5, 3.5, 19, 5, 1), 'M4 8.5v10.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V8.5', L(10, 12.5, 14, 12.5));
  I('puzzle', 'game piece solve', 'M4 7h4.2a2.3 2.3 0 1 1 4.6 0H17v4.2a2.3 2.3 0 1 1 0 4.6V20h-4.2a2.3 2.3 0 1 0-4.6 0H4v-4.2a2.3 2.3 0 1 0 0-4.6Z');
  I('gamepad', 'game play controller', 'M6.5 7.5h11a4.5 4.5 0 0 1 4.4 5.5l-.9 4a2.6 2.6 0 0 1-4.5 1.2L14.5 16h-5l-2 2.2A2.6 2.6 0 0 1 3 17l-.9-4a4.5 4.5 0 0 1 4.4-5.5Z', L(6, 11, 10, 11), L(8, 9, 8, 13), D(15, 10.5), D(17.5, 12.5));
  I('dice', 'game random luck', R(3, 3, 18, 18, 3), D(8, 8), D(16, 8), D(12, 12), D(8, 16), D(16, 16));
  I('party-popper', 'celebrate party confetti', G(4, 20, 8.5, 8, 16, 15.5), 'M14 4.5c.5 1.5 0 3-1.5 3.5', 'M19.5 10c-1.5-.5-3 0-3.5 1.5', D(11, 3.5), D(20.5, 13.5), D(18, 3), L(16, 6, 18, 4), L(20.5, 7, 21.5, 6.5));
  I('balloon', 'party birthday celebrate', E(12, 9, 6, 7), 'M12 16l-1.2 1.6h2.4Z', 'M12 17.6c0 2-2 2-2 3.9');
  I('confetti', 'celebrate party', R(4, 4, 3, 3), tf(R(15, 5, 3, 3), 1, 20), C(9, 15, 1.5), C(18, 16, 1.5), L(11, 4, 12, 7), L(4.5, 11, 7.5, 12.5), L(13, 11, 15, 13), L(5, 20, 7.5, 18.5), L(14, 20, 16, 21));
  I('candle', 'light birthday', R(8.5, 10, 7, 11.5, 1), 'M12 6.5c-1.5 0-2-1.2-2-2s2-2.5 2-2.5 2 1.7 2 2.5-.5 2-2 2Z', L(12, 6.5, 12, 10));
  I('lantern', 'ramadan light lamp', 'M9 5h6l2 3v9l-2 2.5H9L7 17V8Z', L(7, 8, 17, 8), L(7, 17, 17, 17), L(12, 5, 12, 2.5), L(10, 21.5, 14, 21.5), L(12, 19.5, 12, 21.5));
  I('crescent', 'moon ramadan islamic eid', 'M15 3.5a9 9 0 1 0 5.5 15A7.5 7.5 0 0 1 15 3.5Z', tf(star(12, 12, 10, 4.3), 0.25, 0, 5.2, -4.5));
  I('mosque', 'islam prayer ramadan', 'M5 21v-8a7 7 0 0 1 14 0v8', L(3, 21, 21, 21), L(12, 6, 12, 3), 'M10 21v-3a2 2 0 0 1 4 0v3', L(2, 21, 2, 9), L(22, 21, 22, 9));
  I('kaaba', 'mecca islam hajj', G(4, 7, 12, 3.5, 20, 7, 20, 18, 12, 21.5, 4, 18), L(4, 7, 12, 10.5, 20, 7), L(12, 10.5, 12, 21.5), L(4, 10, 12, 13.5, 20, 10));
  I('christmas-tree', 'holiday xmas', P('tree-pine'), tf(star(12, 12, 10, 4.3), 0.2, 0, 0, -11));
  I('snowman', 'winter holiday', C(12, 7, 3.5), C(12, 16, 5.5), D(10.8, 6.3), D(13.2, 6.3), D(12, 14), D(12, 17.5), L(6.5, 13, 3, 11), L(17.5, 13, 21, 11));
  I('ghost', 'halloween spooky', 'M5 21V11a7 7 0 0 1 14 0v10l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2Z', D(9.5, 10.5), D(14.5, 10.5));
  I('skull', 'danger death halloween', 'M12 2.5a8 8 0 0 0-8 8c0 2.6 1.3 4.5 3 5.8V20h10v-3.7c1.7-1.3 3-3.2 3-5.8a8 8 0 0 0-8-8Z', C(9, 11, 1.6), C(15, 11, 1.6), L(10, 20, 10, 17.5), L(14, 20, 14, 17.5));
  I('glasses-3d', 'cinema movie', 'M2.5 9h19v6.5a1.5 1.5 0 0 1-1.5 1.5h-5l-1.5-2.5h-3L9 17H4a1.5 1.5 0 0 1-1.5-1.5Z');
  I('infinity', 'loop forever unlimited', 'M12 12c-2-2.7-3.7-4-5.5-4a4 4 0 0 0 0 8c1.8 0 3.5-1.3 5.5-4Z', 'M12 12c2 2.7 3.7 4 5.5 4a4 4 0 0 0 0-8c-1.8 0-3.5 1.3-5.5 4Z');
  I('atom', 'science physics', C(12, 12, 1.2), E(12, 12, 10, 4), tf(E(12, 12, 10, 4), 1, 60), tf(E(12, 12, 10, 4), 1, -60));
  I('flask', 'science lab chemistry', 'M9.5 2.5h5', 'M10 2.5V9L4.4 18.5A2 2 0 0 0 6.1 21.5h11.8a2 2 0 0 0 1.7-3L14 9V2.5', L(7, 15, 17, 15));
  I('microscope', 'science lab research', 'M6 18h8', 'M3 21.5h18', 'M14 21.5a7 7 0 0 0 0-14', R(8, 2.5, 4, 9, 1), L(10, 11.5, 10, 14), L(7.5, 14, 12.5, 14));
  I('telescope', 'astronomy space', G(4, 10, 16.5, 4, 18.5, 8.5, 6, 14.5), L(18, 3, 20.5, 8), L(11, 12.5, 7.5, 21.5), L(11, 12.5, 14.5, 21.5));
  I('planet', 'space saturn', C(12, 12, 6), 'M4.6 15.4C1.8 18 1.2 20.4 3 21c2.7.9 9-2 13.5-6.5S23.2 3.8 21 3c-1-.4-3 .4-5.2 2.2');
  I('ufo', 'alien space', E(12, 13, 10, 3.5), 'M6.5 11.3a5.5 5.5 0 0 1 11 0', L(7, 16, 5.5, 20), L(17, 16, 18.5, 20), L(12, 16.5, 12, 20));
  I('fire-extinguisher', 'safety emergency', R(8.5, 7.5, 7, 14, 2.5), 'M12 7.5V4.5', 'M10 4.5h5l2.5-1.5', 'M12 4.5c-3 0-5 1.5-5.5 4');
  I('recycle', 'eco environment reuse', 'M7 19H4.8a1.8 1.8 0 0 1-1.5-2.7L5.5 12.5', 'M11 19h8.2a1.8 1.8 0 0 0 1.5-2.7l-1.2-2.3', L(14, 16, 11, 19, 14, 22), 'M8.3 8.6 10.5 4.8a1.8 1.8 0 0 1 3 0L17.6 12', L(4.6, 9.6, 8.3, 8.6, 9.3, 12.3), L(18.6, 8.3, 17.6, 12, 13.9, 11));
  I('trophy-cup', 'champion sport', 'M6 3h12l-1 7a5 5 0 0 1-10 0Z', L(12, 15, 12, 19), L(8, 21, 16, 21), L(8, 19, 16, 19));
  I('soccer', 'football ball sport', C(12, 12, 10), poly(12, 12, 3.5, 5), L(12, 8.5, 12, 2), L(15.3, 10.9, 21.3, 9), L(14.1, 14.8, 17.8, 20.1), L(9.9, 14.8, 6.2, 20.1), L(8.7, 10.9, 2.7, 9));
  I('basketball', 'ball sport', C(12, 12, 10), L(2, 12, 22, 12), L(12, 2, 12, 22), 'M5 4.9a10 10 0 0 1 0 14.2', 'M19 4.9a10 10 0 0 0 0 14.2');
  I('volleyball', 'ball sport beach', C(12, 12, 10), 'M12 12a10 10 0 0 0 5-8.7', 'M12 12a10 10 0 0 1-10 0', 'M12 12a10 10 0 0 0 5 8.7', 'M12 2a14 14 0 0 1 0 10');
  I('tennis', 'ball sport', C(12, 12, 10), 'M5.2 4.7a10 10 0 0 1 0 14.6', 'M18.8 4.7a10 10 0 0 0 0 14.6');
  I('stopwatch', 'sport time race', C(12, 13.5, 8), L(12, 13.5, 12, 9.5), L(10, 2.5, 14, 2.5), L(12, 2.5, 12, 5.5), L(18.5, 6, 20, 4.5));
  I('flag-checkered', 'race finish', L(5, 21, 5, 3.5), R(5, 3.5, 14, 10), R(5, 3.5, 3.5, 3.3), R(12, 3.5, 3.5, 3.3), R(8.5, 6.8, 3.5, 3.3), R(15.5, 6.8, 3.5, 3.3), R(5, 10.1, 3.5, 3.3), R(12, 10.1, 3.5, 3.3));
  I('mountain-flag', 'goal achieve peak', G(2.5, 20.5, 10, 8, 14, 13, 16, 10.5, 21.5, 20.5), L(10, 8, 10, 2.5, 14, 4, 10, 5.5));
  I('crosshair', 'aim target focus', C(12, 12, 9), L(12, 2, 12, 7), L(12, 17, 12, 22), L(2, 12, 7, 12), L(17, 12, 22, 12));
  I('aperture', 'camera lens photo', C(12, 12, 10), L(14.3, 2.3, 8.6, 12), L(20.9, 8.7, 9.7, 8.7), L(18.6, 18.3, 13, 8.6), L(9.7, 21.7, 15.4, 12), L(3.1, 15.3, 14.3, 15.3), L(5.4, 5.7, 11, 15.4));
  I('focus', 'frame camera', L(3, 7.5, 3, 3, 7.5, 3), L(16.5, 3, 21, 3, 21, 7.5), L(21, 16.5, 21, 21, 16.5, 21), L(7.5, 21, 3, 21, 3, 16.5), C(12, 12, 3.5));
  I('ratio', 'aspect frame size', R(3, 6, 18, 12, 2), L(7, 9, 7, 12), L(7, 9, 10, 9), L(17, 15, 17, 12), L(17, 15, 14, 15));
  I('subtitles', 'captions cc text', R(2.5, 4.5, 19, 15, 2), L(6, 12, 9, 12), L(12, 12, 18, 12), L(6, 15.5, 14, 15.5), L(16.5, 15.5, 18, 15.5));
  I('wave-sound', 'audio waveform voice', L(2.5, 10, 2.5, 14), L(6.3, 7, 6.3, 17), L(10.1, 3.5, 10.1, 20.5), L(13.9, 8, 13.9, 16), L(17.7, 5, 17.7, 19), L(21.5, 10, 21.5, 14));
  I('equalizer', 'audio levels mix', L(4, 21, 4, 14), L(4, 10, 4, 3), L(12, 21, 12, 12), L(12, 8, 12, 3), L(20, 21, 20, 16), L(20, 12, 20, 3), L(1.5, 14, 6.5, 14), L(9.5, 8, 14.5, 8), L(17.5, 16, 22.5, 16));
  I('vinyl', 'record music dj', C(12, 12, 10), C(12, 12, 3), C(12, 12, 6.5), D(12, 12));
  I('guitar', 'music instrument', 'M11.5 12.5 20 4l1.5 1.5-8.5 8.5', 'M11.5 12.5a3.5 3.5 0 0 0-5-.5c-1 .7-1 2-2 2.6-1.3.8-2.5 2.2-1.4 4.1 1.1 1.9 3 1.5 4.3.6.9-.6 1.6-1.6 2.7-2a3.6 3.6 0 0 0 1.4-4.8Z', D(8, 15.5), L(19, 2.5, 21.5, 5));
  I('piano', 'music keys instrument', R(2.5, 4, 19, 16, 2), L(8.8, 4, 8.8, 20), L(15.2, 4, 15.2, 20), 'M7 4v9h3.5V4', 'M13.5 4v9H17V4');
  I('drum', 'music beat percussion', E(12, 8, 8.5, 3.5), 'M3.5 8v8c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V8', L(15, 2, 18, 6), L(9, 2, 6, 6));
  I('microphone-stand', 'singer karaoke stage', C(12, 6, 3.5), L(12, 9.5, 12, 21), L(8, 21, 16, 21), L(9.5, 6, 14.5, 6));

  // ---- shapes ----
  I('circle', 'shape round dot', C(12, 12, 9.5));
  I('square', 'shape box', R(3.5, 3.5, 17, 17, 2));
  I('triangle', 'shape', 'M10.3 4.4a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3Z');
  I('diamond', 'shape rhombus', G(12, 2.5, 21.5, 12, 12, 21.5, 2.5, 12));
  I('pentagon', 'shape', poly(12, 12.6, 10, 5));
  I('hexagon', 'shape', poly(12, 12, 10, 6, -90));
  I('octagon', 'shape stop', poly(12, 12, 10.4, 8, -67.5));
  I('star-6', 'shape star hexagram', star(12, 12, 10, 5.8, 6));
  I('star-8', 'shape star burst', star(12, 12, 10, 6.5, 8));
  I('burst', 'badge sale sticker starburst', star(12, 12, 10, 8, 14));
  I('sparkle', 'star shine twinkle', 'M12 2.5c.6 5.2 4.3 8.9 9.5 9.5-5.2.6-8.9 4.3-9.5 9.5-.6-5.2-4.3-8.9-9.5-9.5 5.2-.6 8.9-4.3 9.5-9.5Z');
  I('shapes', 'geometry circle square triangle', C(7, 7, 4.5), R(13, 13, 8.5, 8.5, 1), 'M17 2.5l4.5 8h-9Z', 'M3 21.5l4-7 4 7Z');
  I('cone', 'shape 3d', 'M12 2.5 4 18', 'M12 2.5 20 18', E(12, 18, 8, 3));
  I('cylinder', 'shape 3d', E(12, 5.5, 8, 3), 'M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13');
  I('pyramid', 'shape 3d', G(12, 2.5, 21.5, 17, 12, 21.5, 2.5, 17), L(12, 2.5, 12, 21.5));
  I('ring', 'circle donut shape', C(12, 12, 9.5), C(12, 12, 5));
  I('blob', 'organic shape', 'M17.5 4.5c3 2 4.5 6 3.2 9.8-1.4 4-5.4 6.9-9.5 6.7-4.3-.2-8-3.4-8.6-7.6C2 9.3 4.6 5 8.5 3.6c3-1 6.4-.9 9 .9Z');
  I('squircle', 'shape rounded', 'M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9Z');
  I('spiral', 'swirl hypnotic', 'M12 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0');
  I('zigzag', 'line wave', L(2, 15, 6, 9, 10, 15, 14, 9, 18, 15, 22, 9));
  I('wave', 'line curve sine', 'M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4.5 5 0');
  I('dots-grid', 'pattern', D(6, 6), D(12, 6), D(18, 6), D(6, 12), D(12, 12), D(18, 12), D(6, 18), D(12, 18), D(18, 18));

  // ---- social & brands-free communication ----
  I('heart-plus', 'love add favorite', 'M12 20.5S3 15.1 3 8.9A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 9 2.3c0 1.2-.3 2.3-.8 3.4', L(18, 15, 18, 21), L(15, 18, 21, 18));
  I('heart-crack', 'broken heart sad', P('heart'), L(12, 6.6, 10.5, 10.5, 13.5, 13, 11.5, 17));
  I('hearts', 'love many', tf(P('heart'), 0.7, -12, -3, 1.5), tf(P('heart'), 0.5, 15, 5.5, -5));
  I('comment-heart', 'love message reaction', P('message-circle'), tf(P('heart'), 0.42));
  I('like-bubble', 'reaction notification', P('speech'), tf(P('thumbs-up'), 0.42, 0, 0, -2.5));
  I('live', 'broadcast stream on air', C(12, 12, 2), 'M8.2 15.8a5.4 5.4 0 0 1 0-7.6', 'M15.8 8.2a5.4 5.4 0 0 1 0 7.6', 'M5.1 18.9a9.8 9.8 0 0 1 0-13.8', 'M18.9 5.1a9.8 9.8 0 0 1 0 13.8');
  I('repost', 'retweet share loop', L(17, 2.5, 20.5, 6, 17, 9.5), 'M3.5 11.5V9.5a3.5 3.5 0 0 1 3.5-3.5h13.5', L(7, 21.5, 3.5, 18, 7, 14.5), 'M20.5 12.5v2a3.5 3.5 0 0 1-3.5 3.5H3.5');
  I('emoji-add', 'reaction smile add', 'M21.5 12A9.5 9.5 0 1 1 12 2.5', 'M8 14.5a4.5 4.5 0 0 0 8 0', D(9, 9.5), D(15, 9.5), L(19, 2, 19, 8), L(16, 5, 22, 5));
  I('newspaper', 'news article press', 'M4 21.5h15a2.5 2.5 0 0 0 2.5-2.5V3.5h-15V19a2.5 2.5 0 0 1-5 0V8.5h2.5', R(10, 7, 8, 4), L(10, 14.5, 18, 14.5), L(10, 18, 15, 18));
  I('presentation', 'slides board meeting', L(2.5, 3.5, 21.5, 3.5), R(4, 3.5, 16, 12), L(12, 15.5, 12, 18.5), L(8, 21.5, 12, 18.5, 16, 21.5), L(8, 12, 11, 9, 13.5, 11, 16.5, 7.5));
  I('webcam', 'camera video call', C(12, 10, 7.5), C(12, 10, 2.8), L(12, 17.5, 12, 21.5), L(7.5, 21.5, 16.5, 21.5));
  I('video-call', 'meeting call camera', R(2.5, 5, 13.5, 14, 2), G(16, 10, 21.5, 7, 21.5, 17, 16, 14), C(9.2, 10.5, 2), 'M5.8 16.2a3.5 3.5 0 0 1 6.8 0');
  I('voicemail', 'audio message tape', C(6, 12, 3.5), C(18, 12, 3.5), L(6, 15.5, 18, 15.5));
  I('mail-check', 'email sent read', 'M21.5 12.5V7a2 2 0 0 0-2-2h-15a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8', L(3, 6.5, 12, 13, 21, 6.5), L(15.5, 18.5, 17.5, 20.5, 21.5, 16.5));
  I('bell-dot', 'notification new unread', 'M13.5 5.2A6 6 0 0 0 6 11v5.5l-1.8 2h15.6L18 16.5V13', 'M10 21a2.2 2.2 0 0 0 4 0', C(18.5, 6, 2.5));
  I('chat-check', 'message delivered seen', P('message-circle'), L(8.5, 12, 11, 14.5, 15.5, 10));
  I('inbox-in', 'receive download mail', P('inbox'), L(12, 2, 12, 10), L(9, 7, 12, 10, 15, 7));

  // ---- arrows: each base points right and is turned for the other directions ----
  const DIR4 = { right: 0, down: 90, left: 180, up: 270 };
  const DIR8 = { ...DIR4, 'down-right': 45, 'down-left': 135, 'up-left': 225, 'up-right': 315 };
  const turn = (base, tags, d, dirs) => Object.entries(dirs).forEach(([k, a]) => I(`${base}-${k}`, `${tags} ${k.replace('-', ' ')}`, tf(d, 1, a)));
  turn('arrow', 'arrow direction', L(4, 12, 20, 12) + L(13.5, 5.5, 20, 12, 13.5, 18.5), DIR8);
  turn('chevron', 'chevron caret direction', L(9, 5, 16, 12, 9, 19), DIR4);
  turn('chevrons', 'double chevron fast direction', L(5.5, 6, 11.5, 12, 5.5, 18) + L(12.5, 6, 18.5, 12, 12.5, 18), DIR4);
  turn('caret', 'triangle direction play', G(9, 6, 16, 12, 9, 18), DIR4);
  turn('arrow-to-line', 'arrow end direction', L(3.5, 12, 16, 12) + L(10.5, 6.5, 16, 12, 10.5, 17.5) + L(20.5, 5, 20.5, 19), DIR4);
  turn('arrow-from-line', 'arrow start direction', L(3.5, 5, 3.5, 19) + L(8, 12, 20.5, 12) + L(14.5, 6, 20.5, 12, 14.5, 18), DIR4);
  turn('arrow-big', 'block arrow bold direction', G(3, 9, 12, 9, 12, 4, 21, 12, 12, 20, 12, 15, 3, 15), DIR4);
  turn('arrow-long', 'long arrow direction', L(2, 12, 22, 12) + L(18, 8, 22, 12, 18, 16), DIR4);
  turn('circle-arrow', 'arrow round button direction', C(12, 12, 10) + L(7, 12, 17, 12) + L(13, 8, 17, 12, 13, 16), DIR8);
  turn('square-arrow', 'arrow box direction', R(3, 3, 18, 18, 2.5) + L(7.5, 12, 16.5, 12) + L(12.5, 8, 16.5, 12, 12.5, 16), DIR4);
  turn('circle-chevron', 'chevron round direction', C(12, 12, 10) + L(10.5, 7.5, 15, 12, 10.5, 16.5), DIR4);
  const curve = 'M4 19c0-7.5 5-12 14-12' + L(14, 3, 18, 7, 14, 11);
  I('arrow-curve-right', 'curved arrow turn', curve);
  V('arrow-curve-left', 'arrow-curve-right', { m: true });
  const corner = 'M5 4v7a4 4 0 0 0 4 4h11' + L(15, 10, 20, 15, 15, 20);
  I('corner-down-right', 'corner arrow turn', corner);
  V('corner-down-left', 'corner-down-right', { m: true });
  V('corner-up-right', 'corner-down-right', { a: 180, m: true });
  V('corner-up-left', 'corner-down-right', { a: 180 });
  I('arrow-up-down', 'sort swap vertical', L(7, 20, 7, 4), L(3.5, 7.5, 7, 4, 10.5, 7.5), L(17, 4, 17, 20), L(13.5, 16.5, 17, 20, 20.5, 16.5));
  V('arrow-left-right', 'arrow-up-down', { a: 90 }, 'swap exchange horizontal');
  I('arrows-expand', 'expand fullscreen diagonal', L(14, 3.5, 20.5, 3.5, 20.5, 10), L(20.5, 3.5, 13.5, 10.5), L(10, 20.5, 3.5, 20.5, 3.5, 14), L(3.5, 20.5, 10.5, 13.5));
  I('arrows-shrink', 'collapse diagonal', L(14, 4, 14, 10, 20, 10), L(14, 10, 20.5, 3.5), L(10, 20, 10, 14, 4, 14), L(10, 14, 3.5, 20.5));
  I('arrows-out', 'expand all directions', L(12, 2.5, 12, 21.5), L(2.5, 12, 21.5, 12), L(9.5, 5, 12, 2.5, 14.5, 5), L(9.5, 19, 12, 21.5, 14.5, 19), L(5, 9.5, 2.5, 12, 5, 14.5), L(19, 9.5, 21.5, 12, 19, 14.5));
  I('arrows-in', 'collapse center', L(12, 2.5, 12, 9), L(12, 15, 12, 21.5), L(2.5, 12, 9, 12), L(15, 12, 21.5, 12), L(9.5, 6.5, 12, 9, 14.5, 6.5), L(9.5, 17.5, 12, 15, 14.5, 17.5), L(6.5, 9.5, 9, 12, 6.5, 14.5), L(17.5, 9.5, 15, 12, 17.5, 14.5));
  I('arrows-cycle', 'recycle sync loop', 'M4.5 13A7.5 7.5 0 0 1 17.6 7', L(18, 3, 18, 7.5, 13.5, 7.5), 'M19.5 11A7.5 7.5 0 0 1 6.4 17', L(6, 21, 6, 16.5, 10.5, 16.5));
  I('trending-up-right', 'growth arrow chart', L(3, 20.5, 10, 13.5, 13.5, 17, 21, 9.5), L(15, 9.5, 21, 9.5, 21, 15.5), L(3, 3, 3, 7));
  I('exit', 'leave door out', 'M14 4.5V3.5h-9v17h9v-1', L(9.5, 12, 21, 12), L(17.5, 8.5, 21, 12, 17.5, 15.5));
  I('enter', 'door in come', 'M10 4.5V3.5h9v17h-9v-1', L(3, 12, 14.5, 12), L(11, 8.5, 14.5, 12, 11, 15.5));

  // ---- small glyphs used inside frames ----
  I('exclamation', 'alert warning important', L(12, 4, 12, 14.5), D(12, 19.5));
  I('question', 'help ask what', 'M8 8.5a4 4 0 1 1 5.5 3.7c-1 .4-1.5 1.3-1.5 2.3v1', D(12, 19.5));

  // ---- framed variants ----
  ['heart', 'star', 'user', 'dollar', 'euro', 'percent', 'bell', 'music', 'mail', 'phone', 'lock', 'house', 'camera', 'zap', 'flag', 'sun', 'moon', 'wifi', 'stop', 'skip-forward',
    'power', 'search', 'bookmark', 'tag', 'gift', 'lightbulb', 'shopping-cart', 'trophy', 'crown', 'code', 'hash', 'exclamation', 'question', 'map-pin', 'pencil', 'mic', 'smartphone',
    'flame', 'leaf', 'paw', 'key', 'eye', 'thumbs-up', 'video', 'image', 'equal', 'divide', 'asterisk'].forEach(g => F('circle', g));
  ['check', 'x', 'plus', 'minus', 'play', 'user', 'heart', 'star', 'code', 'terminal', 'percent', 'dollar', 'pen', 'mail', 'menu', 'chart-line', 'exclamation', 'question', 'bot',
    'pause', 'equal', 'asterisk', 'hash', 'activity', 'sparkles', 'smile', 'pi'].filter(g => lib[g]).forEach(g => F('square', g));
  ['x', 'exclamation', 'pause', 'hand', 'minus', 'check'].forEach(g => F('octagon', g));

  // ---- glyph inside a container ----
  [['folder', ['plus', 'minus', 'check', 'x', 'heart', 'lock', 'search'], [12, 14]], ['file', ['plus', 'minus', 'check', 'x', 'code', 'heart', 'lock', 'music', 'image', 'video'], [12, 14]],
    ['calendar', ['plus', 'minus', 'x', 'heart', 'star', 'clock'], [12, 15.3]], ['shopping-bag', ['plus', 'check', 'heart', 'x'], [12, 14.8]], ['message-square', ['plus', 'check', 'heart', 'x', 'question', 'exclamation'], [12, 11]],
    ['shield', ['plus', 'x', 'exclamation', 'lock', 'user', 'heart', 'star'], [12, 11.8]], ['monitor', ['play', 'check', 'x', 'code', 'lock', 'heart', 'user'], [12, 10]], ['smartphone', ['plus', 'check', 'x', 'heart', 'lock', 'bell'], [12, 10.5]]
  ].forEach(([base, gs, at]) => gs.forEach(g => B(base, g, at, base === 'monitor' ? 0.4 : 0.36)));
  window.MaqtoIconLib = lib;
})();
