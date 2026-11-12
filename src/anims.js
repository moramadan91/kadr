// Clip animations beyond the basic set: 3D, blur, glitch, light/VFX, reveals, shatter, elastic and device frames.
// Pure math, no DOM: shared by the preview and the export (which renders these frames through the same canvas code, animfx.js).
// IN[id](u): u 0..1, identity at u = 1. OUT[id](u) = IN[id](1 - u): identity at u = 0. LOOP[id](L, d): L seconds into a clip of d.
// Channels: dx dy (fraction of the frame) s r o (as basic), plus
//   sx sy (stretch) sk (skew deg) ry rx (3D turn deg) pv [x, y] (3D pivot, box 0..1) blur px (box fractions) rgb (box fraction)
//   glitch wave scan flash dark gray inv glow (0..1) tint [colour, amount] shine (band position 0..1) mb [x, y] (motion blur)
//   wipe {k, p, n} (reveal shape, p = shown part) tiles {m, p, n} (pieces, p = apart) spark {k, p, n} frame {k} trail (ghosts)
(function (root) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const E = {
    out: p => 1 - Math.pow(1 - p, 3), in: p => p * p * p, io: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    expo: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)), quad: p => 1 - (1 - p) * (1 - p),
    back: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    elastic: p => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * 2 * Math.PI / 3) + 1),
    bounce: p => { const n = 7.5625, d = 2.75; return p < 1 / d ? n * p * p : p < 2 / d ? n * (p -= 1.5 / d) * p + 0.75 : p < 2.5 / d ? n * (p -= 2.25 / d) * p + 0.9375 : n * (p -= 2.625 / d) * p + 0.984375; },
  };
  // seeded hash -> 0..1 (no Math.random: every frame is a pure function of time)
  const rnd = (a, b = 0) => { let t = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; t = Math.imul(t ^ (t >>> 13), 1274126177); t ^= t >>> 16; return (t >>> 0) / 4294967296; };
  const decay = (u, f = 3, k = 4) => Math.exp(-k * u) * Math.sin(u * f * 2 * Math.PI); // damped wobble, 0 at u = 0
  const wob = u => decay(u, 2.5, 5);
  const tau = 2 * Math.PI, sin = Math.sin, cos = Math.cos;

  const IN = {}, LOOP = {}, NAMES = [], CAT = {}, CATS = [];
  const cat = (id, ar, en) => CATS.push([id, ar, en]);
  const I = (id, ar, en, c, f) => { IN[id] = f; NAMES.push([id, ar, en]); CAT[id] = c; };
  const Lp = (id, ar, en, c, f) => { LOOP[id] = f; NAMES.push([id, ar, en]); CAT[id] = c; };

  cat('3d', 'ثلاثي الأبعاد', '3D'); cat('blur', 'بلور وفوكس', 'Blur & focus'); cat('glitch', 'جليتش', 'Glitch');
  cat('vfx', 'مؤثرات وإضاءة', 'VFX & light'); cat('reveal', 'كشف وأشكال', 'Reveal'); cat('shatter', 'تكسير وقطع', 'Shatter');
  cat('elastic', 'مطّاط وحركة', 'Elastic & motion'); cat('device', 'موبايل وأجهزة', 'Devices');

  /* ---------- 3D ---------- */
  I('flip3dY', 'قلبة 3D أفقي', '3D flip', '3d', u => { const e = E.out(u); return { ry: 90 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('flip3dX', 'قلبة 3D رأسي', '3D flip vertical', '3d', u => { const e = E.out(u); return { rx: 90 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('flip3dYb', 'قلبة 3D عكسي', '3D flip back', '3d', u => { const e = E.back(u); return { ry: -90 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('flip3dXb', 'قلبة 3D لتحت', '3D flip down', '3d', u => { const e = E.back(u); return { rx: -90 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('doorL', 'باب من الشمال', 'Door left', '3d', u => ({ ry: -95 * (1 - E.out(u)), pv: [0, 0.5], o: clamp(u * 4, 0, 1) }));
  I('doorR', 'باب من اليمين', 'Door right', '3d', u => ({ ry: 95 * (1 - E.out(u)), pv: [1, 0.5], o: clamp(u * 4, 0, 1) }));
  I('doorT', 'باب من فوق', 'Hatch top', '3d', u => ({ rx: 95 * (1 - E.out(u)), pv: [0.5, 0], o: clamp(u * 4, 0, 1) }));
  I('doorB', 'باب من تحت', 'Hatch bottom', '3d', u => ({ rx: -95 * (1 - E.out(u)), pv: [0.5, 1], o: clamp(u * 4, 0, 1) }));
  I('signSwing', 'يافطة متعلقة', 'Hanging sign', '3d', u => ({ rx: 80 * (1 - E.elastic(u)), pv: [0.5, 0], o: clamp(u * 5, 0, 1) }));
  I('tumble3d', 'تقلّب 3D', '3D tumble', '3d', u => { const e = E.out(u); return { ry: 360 * (1 - e), rx: 30 * (1 - e), s: 0.4 + 0.6 * e, o: clamp(u * 3, 0, 1) }; });
  I('cubeInL', 'مكعب من الشمال', 'Cube from left', '3d', u => { const e = E.io(u); return { ry: -90 * (1 - e), dx: -0.35 * (1 - e), pv: [1, 0.5] }; });
  I('cubeInR', 'مكعب من اليمين', 'Cube from right', '3d', u => { const e = E.io(u); return { ry: 90 * (1 - e), dx: 0.35 * (1 - e), pv: [0, 0.5] }; });
  I('cubeInU', 'مكعب من فوق', 'Cube from top', '3d', u => { const e = E.io(u); return { rx: 90 * (1 - e), dy: -0.3 * (1 - e), pv: [0.5, 1] }; });
  I('cubeInD', 'مكعب من تحت', 'Cube from bottom', '3d', u => { const e = E.io(u); return { rx: -90 * (1 - e), dy: 0.3 * (1 - e), pv: [0.5, 0] }; });
  I('tiltRise', 'طلوع بميلان', 'Tilt rise', '3d', u => { const e = E.out(u); return { rx: 65 * (1 - e), dy: 0.25 * (1 - e), o: clamp(u * 2.5, 0, 1) }; });
  I('tiltFall', 'نزول بميلان', 'Tilt fall', '3d', u => { const e = E.out(u); return { rx: -65 * (1 - e), dy: -0.25 * (1 - e), o: clamp(u * 2.5, 0, 1) }; });
  I('spinY3d', 'لفّة 3D سريعة', '3D spin', '3d', u => { const e = E.out(u); return { ry: 720 * (1 - e), s: 0.3 + 0.7 * e }; });
  I('coinFlip', 'قلبة عملة', 'Coin flip', '3d', u => { const e = E.out(u); return { rx: 540 * (1 - e), dy: -0.25 * sin(Math.PI * u) * (1 - u * 0.3), s: 0.6 + 0.4 * e }; });
  I('roll3d', 'تدحرج 3D', '3D roll', '3d', u => { const e = E.out(u); return { rx: 360 * (1 - e), dy: 0.4 * (1 - e) }; });
  I('zoomTilt', 'زووم بميلان', 'Zoom tilt', '3d', u => { const e = E.out(u); return { s: 1 + (1 - e), rx: 35 * (1 - e), ry: -25 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('depthIn', 'عمق من بعيد', 'Depth in', '3d', u => { const e = E.out(u); return { s: 0.2 + 0.8 * e, ry: 30 * (1 - e), blur: 0.08 * (1 - e), o: clamp(u * 2, 0, 1) }; });
  I('swivel', 'لفّة كرسي', 'Swivel', '3d', u => { const e = E.back(u); return { ry: -70 * (1 - e), dx: 0.2 * (1 - e), r: 8 * (1 - e) }; });
  I('pageTurn', 'قلب صفحة', 'Page turn', '3d', u => ({ ry: -150 * (1 - E.io(u)), pv: [0, 0.5] }));
  I('twistX', 'لفّة رأسية', 'Vertical twist', '3d', u => { const e = E.out(u); return { rx: 180 * (1 - e), s: 0.5 + 0.5 * e, o: clamp(u * 3, 0, 1) }; });
  I('portal3d', 'بوابة', 'Portal', '3d', u => { const e = E.out(u); return { s: Math.max(0.01, e), ry: 180 * (1 - e), rgb: 0.06 * (1 - e), glow: 0.8 * (1 - e) }; });
  I('fold3d', 'فرد ورقة', 'Unfold', '3d', u => ({ rx: 90 * (1 - E.back(u)), pv: [0.5, 0], s: 1, o: clamp(u * 6, 0, 1) }));
  I('perspSlide', 'سلايد منظور', 'Perspective slide', '3d', u => { const e = E.out(u); return { ry: 55 * (1 - e), dx: 0.6 * (1 - e) }; });
  I('perspSlideR', 'سلايد منظور يمين', 'Perspective slide right', '3d', u => { const e = E.out(u); return { ry: -55 * (1 - e), dx: -0.6 * (1 - e) }; });

  /* ---------- blur & focus ---------- */
  I('blurIn', 'ظهور بلور', 'Blur in', 'blur', u => ({ blur: 0.14 * (1 - E.out(u)), o: E.out(u) }));
  I('focusPull', 'سحب فوكس', 'Focus pull', 'blur', u => { const e = E.out(u); return { blur: 0.18 * (1 - e), s: 1 + 0.15 * (1 - e) }; });
  I('zoomBlurIn', 'زووم بلور', 'Zoom blur', 'blur', u => { const e = E.expo(u); return { s: 1 + 0.6 * (1 - e), blur: 0.1 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('mbLeft', 'سلايد بموشن بلور', 'Motion slide left', 'blur', u => { const e = E.expo(u); return { dx: 0.7 * (1 - e), mb: [0.12 * (1 - e), 0] }; });
  I('mbRight', 'سلايد بموشن بلور يمين', 'Motion slide right', 'blur', u => { const e = E.expo(u); return { dx: -0.7 * (1 - e), mb: [-0.12 * (1 - e), 0] }; });
  I('mbUp', 'طلوع بموشن بلور', 'Motion slide up', 'blur', u => { const e = E.expo(u); return { dy: 0.7 * (1 - e), mb: [0, 0.12 * (1 - e)] }; });
  I('mbDown', 'نزول بموشن بلور', 'Motion slide down', 'blur', u => { const e = E.expo(u); return { dy: -0.7 * (1 - e), mb: [0, -0.12 * (1 - e)] }; });
  I('whipL', 'سحبة سريعة', 'Whip', 'blur', u => { const e = E.expo(u); return { dx: 1.1 * (1 - e), mb: [0.25 * (1 - e), 0], sk: -15 * (1 - e) }; });
  I('whipR', 'سحبة سريعة يمين', 'Whip right', 'blur', u => { const e = E.expo(u); return { dx: -1.1 * (1 - e), mb: [-0.25 * (1 - e), 0], sk: 15 * (1 - e) }; });
  I('dreamy', 'حالم', 'Dreamy', 'blur', u => { const e = E.out(u); return { blur: 0.08 * (1 - e), glow: 0.9 * (1 - e), o: e, s: 1.05 - 0.05 * e }; });
  I('lensIn', 'عدسة', 'Lens', 'blur', u => { const e = E.out(u); return { s: 1.4 - 0.4 * e, blur: 0.06 * (1 - e), rgb: 0.05 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('pixelIn', 'بكسلات', 'Pixelate', 'blur', u => ({ px: 0.14 * Math.pow(1 - u, 2), o: clamp(u * 4, 0, 1) }));
  I('pixelZoom', 'بكسل زووم', 'Pixel zoom', 'blur', u => { const e = E.out(u); return { px: 0.1 * (1 - e), s: 0.6 + 0.4 * e, o: clamp(u * 3, 0, 1) }; });
  I('mosaicFade', 'موزاييك', 'Mosaic fade', 'blur', u => ({ px: 0.08 * (1 - u), o: E.out(u) }));
  I('blurSpin', 'لفّة بلور', 'Blur spin', 'blur', u => { const e = E.out(u); return { r: -120 * (1 - e), blur: 0.1 * (1 - e), s: 0.6 + 0.4 * e, o: clamp(u * 3, 0, 1) }; });
  I('blurDrop', 'نزول بلور', 'Blur drop', 'blur', u => { const e = E.bounce(u); return { dy: -0.5 * (1 - e), blur: 0.06 * (1 - E.out(u)) }; });

  /* ---------- glitch ---------- */
  const flick = (u, a = 9) => (rnd(Math.floor(u * 24), a) < u * 1.2 ? 1 : 0.15);
  I('glitchIn', 'جليتش', 'Glitch', 'glitch', u => ({ glitch: 1 - u, rgb: 0.04 * (1 - u), o: u > 0.85 ? 1 : flick(u) }));
  I('rgbIn', 'فصل ألوان', 'RGB split', 'glitch', u => ({ rgb: 0.1 * (1 - E.out(u)), o: clamp(u * 4, 0, 1) }));
  I('vhsIn', 'شريط VHS', 'VHS', 'glitch', u => ({ rgb: 0.03 * (1 - u), scan: 0.6 * (1 - u), glitch: 0.6 * (1 - u), tint: ['#6a3cff', 0.25 * (1 - u)], wave: 0.02 * (1 - u), o: clamp(u * 3, 0, 1) }));
  I('digitalIn', 'تجميع ديجيتال', 'Digital build', 'glitch', u => ({ wipe: { k: 'pixels', p: u, n: 18 }, rgb: 0.03 * (1 - u) }));
  I('stutterIn', 'تقطيع', 'Stutter', 'glitch', u => { const st = Math.floor(u * 6); return { dx: u > 0.8 ? 0 : (rnd(st, 3) - 0.5) * 0.12, o: u > 0.8 ? 1 : st % 2 ? 1 : 0.25, s: u > 0.8 ? 1 : 1 + rnd(st, 5) * 0.1 }; });
  I('signalIn', 'إشارة ضعيفة', 'Bad signal', 'glitch', u => ({ wave: 0.06 * (1 - u), rgb: 0.05 * (1 - u), scan: 0.5 * (1 - u), o: clamp(u * 3, 0, 1) }));
  I('tvOn', 'تشغيل تلفزيون', 'TV on', 'glitch', u => { const a = clamp(u / 0.45, 0, 1), b = clamp((u - 0.35) / 0.65, 0, 1); return { sx: 0.02 + 0.98 * E.out(a), sy: 0.01 + 0.99 * E.out(b), flash: 1 - b }; });
  I('scanIn', 'سكان', 'Scan', 'glitch', u => ({ wipe: { k: 'tb', p: E.io(u) }, scan: 0.5 * (1 - u), shine: { p: E.io(u), v: 1 } }));
  I('glitchSlide', 'سلايد جليتش', 'Glitch slide', 'glitch', u => { const e = E.expo(u); return { dx: 0.5 * (1 - e), glitch: 1 - u, rgb: 0.05 * (1 - u) }; });
  I('datamosh', 'داتاموش', 'Datamosh', 'glitch', u => ({ px: 0.05 * (1 - u), glitch: 1 - u, rgb: 0.03 * (1 - u), tint: ['#00ffa0', 0.2 * (1 - u)] }));
  I('crtIn', 'شاشة قديمة', 'CRT', 'glitch', u => ({ scan: 0.8 * (1 - u), sy: 0.05 + 0.95 * E.back(u), flash: 0.5 * (1 - u), gray: 0.6 * (1 - u) }));
  I('noiseIn', 'تشويش', 'Static', 'glitch', u => ({ tiles: { m: 'noise', p: 1 - u, n: 24 }, rgb: 0.02 * (1 - u) }));

  /* ---------- VFX & light ---------- */
  I('flashIn', 'فلاش', 'Flash', 'vfx', u => ({ flash: 1 - E.out(u) }));
  I('burnIn', 'حرق', 'Burn in', 'vfx', u => ({ tint: ['#ff6a00', 0.8 * (1 - u)], flash: 0.6 * (1 - u), o: E.out(u), glow: 0.6 * (1 - u) }));
  I('shineIn', 'لمعة', 'Shine', 'vfx', u => ({ o: clamp(u * 3, 0, 1), shine: { p: E.io(u) } }));
  I('glowIn', 'توهّج', 'Glow', 'vfx', u => { const e = E.out(u); return { glow: 1 - e, s: 0.8 + 0.2 * E.back(u), o: clamp(u * 3, 0, 1) }; });
  I('lightning', 'برق', 'Lightning', 'vfx', u => { const k = Math.floor(u * 10); return { flash: u > 0.7 ? 0 : rnd(k, 7) > 0.5 ? 0.9 : 0, o: u > 0.5 ? 1 : rnd(k, 2) > 0.4 ? 1 : 0, tint: ['#9fd8ff', 0.3 * (1 - u)] }; });
  I('neonIn', 'نيون', 'Neon', 'vfx', u => ({ tint: ['#00e5ff', 0.5 * (1 - u)], glow: 1 - u, o: u > 0.6 ? 1 : flick(u, 4) }));
  I('holoIn', 'هولوجرام', 'Hologram', 'vfx', u => ({ tint: ['#40c4ff', 0.6 * (1 - u)], scan: 0.7 * (1 - u), rgb: 0.02 * (1 - u), o: (0.4 + 0.6 * u) * (u > 0.7 ? 1 : flick(u, 6) > 0.5 ? 1 : 0.6), glow: 0.5 * (1 - u) }));
  I('inkIn', 'نقطة حبر', 'Ink drop', 'vfx', u => ({ wipe: { k: 'ink', p: E.io(u) } }));
  I('smokeIn', 'دخان', 'Smoke', 'vfx', u => { const e = E.out(u); return { blur: 0.1 * (1 - e), gray: 1 - e, o: e, dy: 0.06 * (1 - e), s: 1.08 - 0.08 * e }; });
  I('sparkleIn', 'لمعان نجوم', 'Sparkle', 'vfx', u => ({ o: E.out(u), s: 0.9 + 0.1 * E.back(u), spark: { k: 'star', p: u, n: 22, c: '#fff6c8' } }));
  I('confettiIn', 'كونفيتي', 'Confetti', 'vfx', u => ({ s: 0.5 + 0.5 * E.back(u), o: clamp(u * 4, 0, 1), spark: { k: 'confetti', p: u, n: 40 } }));
  I('heatIn', 'سراب حرارة', 'Heat haze', 'vfx', u => ({ wave: 0.04 * (1 - u), blur: 0.03 * (1 - u), o: E.out(u), tint: ['#ffb070', 0.2 * (1 - u)] }));
  I('xrayIn', 'أشعة إكس', 'X-ray', 'vfx', u => ({ inv: u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4, gray: 1 - u, o: clamp(u * 3, 0, 1) }));
  I('colorIn', 'الألوان بتيجي', 'Color bloom', 'vfx', u => ({ gray: 1 - E.io(u), glow: 0.4 * (1 - u) }));
  I('duotoneIn', 'دويتون', 'Duotone', 'vfx', u => ({ tint: ['#ff2d87', 0.7 * (1 - E.io(u))], o: clamp(u * 3, 0, 1) }));
  I('fireIn', 'نار', 'Fire', 'vfx', u => ({ wipe: { k: 'bt', p: E.io(u), wav: 0.08 }, tint: ['#ff5a00', 0.6 * (1 - u)], spark: { k: 'ember', p: u, n: 26, c: '#ffb347' } }));
  I('magicIn', 'سحر', 'Magic', 'vfx', u => ({ wipe: { k: 'circle', p: E.out(u) }, spark: { k: 'star', p: u, n: 30, c: '#c8a8ff' }, glow: 0.6 * (1 - u) }));
  I('bubbleIn', 'فقاعة', 'Bubble', 'vfx', u => ({ wipe: { k: 'circle', p: E.back(u) }, spark: { k: 'bubble', p: u, n: 18 }, s: 0.9 + 0.1 * E.out(u) }));
  I('beamIn', 'شعاع ضوء', 'Light beam', 'vfx', u => ({ wipe: { k: 'lr', p: E.io(u) }, shine: { p: E.io(u), w: 0.06, sharp: 1 }, glow: 0.4 * (1 - u) }));

  /* ---------- reveal ---------- */
  const W = (id, ar, en, k, n, e = E.io) => I(id, ar, en, 'reveal', u => ({ wipe: { k, p: e(u), n } }));
  W('wipeL', 'مسح من الشمال', 'Wipe right', 'lr'); W('wipeR', 'مسح من اليمين', 'Wipe left', 'rl');
  W('wipeU', 'مسح من تحت', 'Wipe up', 'bt'); W('wipeD', 'مسح من فوق', 'Wipe down', 'tb');
  W('wipeDiag', 'مسح مايل', 'Diagonal wipe', 'diag'); W('irisIn', 'دايرة', 'Iris', 'circle', 0, E.out);
  W('cornerIris', 'دايرة من الركن', 'Corner iris', 'corner'); W('diamondIn', 'معيّن', 'Diamond', 'diamond', 0, E.out);
  W('starIn', 'نجمة', 'Star', 'star', 0, E.out); W('heartIn', 'قلب', 'Heart', 'heart', 0, E.out);
  W('clockIn', 'عقارب ساعة', 'Clock', 'clock'); W('blindsH', 'شيش أفقي', 'Blinds', 'blindsH', 8);
  W('blindsV', 'شيش رأسي', 'Vertical blinds', 'blindsV', 8); W('checkerIn', 'شطرنج', 'Checker', 'checker', 6);
  W('splitH', 'فتح من النص', 'Split open', 'splitH'); W('splitV', 'فتح رأسي', 'Split open vertical', 'splitV');
  W('rectIris', 'مستطيل من النص', 'Box reveal', 'rect', 0, E.out); W('crossIn', 'علامة زائد', 'Cross', 'cross', 0, E.out);
  W('triIn', 'مثلث', 'Triangle', 'tri', 0, E.out); W('waveWipe', 'موجة', 'Wave wipe', 'wave');
  W('dripIn', 'تنقيط', 'Drip', 'drip', 14); W('pixelsIn', 'مربعات عشوائية', 'Pixel dissolve', 'pixels', 14, u => u);
  W('stripesIn', 'شرايط مايلة', 'Diagonal stripes', 'stripes', 7); W('zigzagIn', 'زجزاج', 'Zigzag', 'zigzag', 9);
  W('hexIn', 'خلية نحل', 'Honeycomb', 'hex', 7, u => u); W('radialIn', 'أشعة', 'Radial', 'rays', 12);
  I('maskZoom', 'دايرة بزووم', 'Iris zoom', 'reveal', u => { const e = E.out(u); return { wipe: { k: 'circle', p: e }, s: 1.3 - 0.3 * e }; });
  I('slideReveal', 'كشف بسلايد', 'Slide reveal', 'reveal', u => { const e = E.io(u); return { wipe: { k: 'lr', p: e }, dx: -0.15 * (1 - e) }; });
  I('curtain', 'ستارة', 'Curtain', 'reveal', u => ({ wipe: { k: 'tb', p: E.bounce(u) } }));
  I('spiralIn', 'حلزون', 'Spiral', 'reveal', u => ({ wipe: { k: 'clock', p: E.io(u) }, r: -90 * (1 - E.out(u)), s: 0.7 + 0.3 * E.out(u) }));

  /* ---------- shatter ---------- */
  const T = (id, ar, en, m, n, e = E.out) => I(id, ar, en, 'shatter', u => ({ tiles: { m, p: 1 - e(u), n } }));
  T('assemble', 'تجميع شظايا', 'Assemble', 'explode', 6); T('tilesFall', 'بلاطات نازلة', 'Falling tiles', 'fall', 6);
  T('flipTiles', 'بلاطات بتتقلب', 'Flip tiles', 'flip', 6, u => u); T('stripsH', 'شرايح أفقية', 'Strips', 'stripsH', 10);
  T('stripsV', 'شرايح رأسية', 'Vertical strips', 'stripsV', 10); T('gridPop', 'شبكة بتظهر', 'Grid pop', 'pop', 6, u => u);
  T('vortexIn', 'دوّامة قطع', 'Vortex', 'vortex', 7); T('puzzleIn', 'بازل', 'Puzzle', 'puzzle', 4);
  T('blocksRise', 'بلوكات طالعة', 'Rising blocks', 'rise', 8, u => u); T('dustIn', 'تراب', 'Dust', 'dust', 26, u => u);
  T('shardsIn', 'زجاج متجمع', 'Glass shards', 'shards', 5); T('columnsIn', 'أعمدة', 'Columns', 'columns', 9, u => u);

  /* ---------- elastic & motion ---------- */
  I('jellyIn', 'جيلي', 'Jelly', 'elastic', u => { const w = wob(u); return { sx: 1 + 0.35 * w, sy: 1 - 0.3 * w, s: clamp(u * 4, 0.01, 1) }; });
  I('springUp', 'سوستة لفوق', 'Spring up', 'elastic', u => ({ dy: 0.5 * (1 - E.elastic(u)) }));
  I('springL', 'سوستة من الشمال', 'Spring left', 'elastic', u => ({ dx: -0.6 * (1 - E.elastic(u)) }));
  I('springR', 'سوستة من اليمين', 'Spring right', 'elastic', u => ({ dx: 0.6 * (1 - E.elastic(u)) }));
  I('squashDrop', 'وقعة بانضغاط', 'Squash drop', 'elastic', u => { const e = E.bounce(u), hit = u > 0.36 ? Math.exp(-6 * (u - 0.36)) * Math.abs(sin((u - 0.36) * 16)) * (1 - u) : 0; return { dy: -0.6 * (1 - e), sx: 1 + 0.3 * hit, sy: 1 - 0.3 * hit }; });
  I('rubber', 'أستيك', 'Rubber band', 'elastic', u => { const w = wob(u); return { sx: 1 + 0.5 * w, sy: 1 - 0.4 * w }; });
  I('bounceZoom', 'زووم مطّاط', 'Elastic zoom', 'elastic', u => ({ s: Math.max(0.01, E.elastic(u)) }));
  I('popTwist', 'بوب بلفّة', 'Pop twist', 'elastic', u => ({ s: Math.max(0.01, E.back(u)), r: -25 * (1 - E.out(u)) }));
  I('pendulum', 'بندول', 'Pendulum', 'elastic', u => ({ r: 35 * Math.exp(-4 * u) * cos(u * 3 * tau) * (u < 1 ? 1 : 0), dy: -0.05 * (1 - E.out(u)), o: clamp(u * 5, 0, 1) }));
  I('skewIn', 'دخول مايل', 'Skew in', 'elastic', u => { const e = E.back(u); return { sk: 40 * (1 - e), dx: 0.5 * (1 - E.out(u)) }; });
  I('stretchIn', 'مطّ أفقي', 'Stretch', 'elastic', u => { const e = E.back(u); return { sx: 3 - 2 * e, sy: 0.3 + 0.7 * e, o: clamp(u * 3, 0, 1) }; });
  I('stretchUp', 'مطّ رأسي', 'Tall stretch', 'elastic', u => { const e = E.back(u); return { sy: 3 - 2 * e, sx: 0.3 + 0.7 * e, o: clamp(u * 3, 0, 1) }; });
  I('zoomSpin', 'زووم بلفّة', 'Zoom spin', 'elastic', u => { const e = E.out(u); return { s: 3 - 2 * e, r: 180 * (1 - e), o: clamp(u * 2, 0, 1) }; });
  I('orbitIn', 'مدار', 'Orbit', 'elastic', u => { const e = E.out(u), a = (1 - e) * tau * 0.75; return { dx: 0.4 * (1 - e) * cos(a), dy: 0.4 * (1 - e) * sin(a), s: 0.4 + 0.6 * e, trail: 0.5 }; });
  I('slingshot', 'نبلة', 'Slingshot', 'elastic', u => { const e = E.back(u); return { dx: u < 0.25 ? 0.08 * (u / 0.25) - 0.5 : -0.42 * (1 - E.elastic((u - 0.25) / 0.75)), s: 0.85 + 0.15 * e }; });
  I('shakeIn', 'هزّة دخول', 'Shake in', 'elastic', u => { const a = Math.exp(-5 * u); return { dx: 0.05 * a * sin(u * 60), dy: 0.03 * a * sin(u * 47), s: 1.1 - 0.1 * E.out(u), o: clamp(u * 6, 0, 1) }; });
  I('punchIn', 'بانش', 'Punch', 'elastic', u => ({ s: 1.35 - 0.35 * E.expo(u), flash: 0.5 * (1 - E.out(u)) }));
  I('riseTilt', 'طلوع بلفّة', 'Rise tilt', 'elastic', u => { const e = E.back(u); return { dy: 0.4 * (1 - E.out(u)), r: -12 * (1 - e), o: clamp(u * 3, 0, 1) }; });
  I('arcIn', 'قوس', 'Arc', 'elastic', u => { const e = E.out(u); return { dx: -0.5 * (1 - e), dy: -0.35 * sin(Math.PI * (1 - e)), r: -30 * (1 - e), trail: 0.4 }; });
  I('wobbleIn', 'ترجرج', 'Wobble', 'elastic', u => ({ sk: 25 * wob(u), r: 6 * wob(u), s: clamp(u * 5, 0.01, 1) }));
  I('dropSpin', 'وقعة بلفّة', 'Spin drop', 'elastic', u => ({ dy: -0.6 * (1 - E.bounce(u)), r: 200 * (1 - E.out(u)) }));
  I('ghostIn', 'شبح', 'Ghost trail', 'elastic', u => { const e = E.out(u); return { dx: 0.6 * (1 - e), trail: 0.7, o: clamp(u * 3, 0, 1) }; });
  I('zigzagMove', 'دخول زجزاج', 'Zigzag in', 'elastic', u => { const e = E.out(u); return { dy: 0.6 * (1 - e), dx: 0.12 * sin(u * 5 * Math.PI) * (1 - e), trail: 0.4 }; });

  const OUT = {};
  for (const k in IN) OUT[k] = u => IN[k](1 - u);

  /* ---------- loops ---------- */
  const at = (L, a) => clamp(L / a, 0, 1); // intro progress in the first a seconds
  Lp('sway3d', 'تمايل 3D', '3D sway', '3d', L => ({ ry: 18 * sin(L * tau * 0.35) }));
  Lp('tilt3d', 'ميلان 3D', '3D tilt', '3d', L => ({ ry: 14 * sin(L * tau * 0.3), rx: 10 * sin(L * tau * 0.23 + 1) }));
  Lp('spin3d', 'لفّ 3D مستمر', '3D spin loop', '3d', L => ({ ry: 120 * L }));
  Lp('flipLoop', 'قلب كل شوية', 'Flip every beat', '3d', L => { const k = L % 2.5, q = clamp((k - 2) / 0.5, 0, 1); return { ry: 360 * E.io(q) }; });
  Lp('rock3d', 'هزهزة 3D', '3D rock', '3d', L => ({ rx: 12 * sin(L * tau * 0.5), r: 3 * sin(L * tau * 0.5 + 1) }));
  Lp('wobbleLoop', 'ترجرج مستمر', 'Wobble loop', 'elastic', L => ({ sk: 6 * sin(L * tau * 0.8) }));
  Lp('jellyLoop', 'جيلي مستمر', 'Jelly loop', 'elastic', L => ({ sx: 1 + 0.05 * sin(L * tau * 1.4), sy: 1 - 0.05 * sin(L * tau * 1.4) }));
  Lp('bounceLoop', 'نطّ', 'Bounce loop', 'elastic', L => { const b = Math.abs(sin(L * Math.PI * 1.4)); return { dy: -0.05 * b, sy: 1 - 0.06 * (1 - b) * (1 - b), sx: 1 + 0.06 * (1 - b) * (1 - b) }; });
  Lp('orbitLoop', 'مدار مستمر', 'Orbit loop', 'elastic', L => ({ dx: 0.025 * cos(L * tau * 0.5), dy: 0.025 * sin(L * tau * 0.5) }));
  Lp('figure8', 'رقم 8', 'Figure eight', 'elastic', L => ({ dx: 0.03 * sin(L * tau * 0.4), dy: 0.02 * sin(L * tau * 0.8) }));
  Lp('pendLoop', 'بندول مستمر', 'Pendulum loop', 'elastic', L => ({ r: 10 * sin(L * tau * 0.6) }));
  Lp('beatPunch', 'بانش على الإيقاع', 'Beat punch', 'elastic', L => { const k = (L * 2) % 1; return { s: 1 + 0.07 * Math.exp(-8 * k), flash: 0.18 * Math.exp(-10 * k) }; });
  Lp('quake', 'زلزال', 'Earthquake', 'elastic', L => ({ dx: 0.02 * sin(L * 71) * sin(L * 13), dy: 0.02 * sin(L * 53 + 1), r: 1.5 * sin(L * 37) }));
  Lp('glitchLoop', 'جليتش مستمر', 'Glitch loop', 'glitch', L => { const k = L % 1.6, on = k > 1.3 ? 1 : 0; return { glitch: on, rgb: on * 0.04, dx: on * (rnd(Math.floor(L * 20), 1) - 0.5) * 0.04 }; });
  Lp('rgbLoop', 'ألوان مهزوزة', 'RGB pulse', 'glitch', L => ({ rgb: 0.02 * (1 + sin(L * tau * 1.2)) }));
  Lp('vhsLoop', 'VHS مستمر', 'VHS loop', 'glitch', L => ({ scan: 0.4, rgb: 0.012, wave: 0.006 * (1 + sin(L * 3)), glitch: (L % 3) > 2.8 ? 0.8 : 0, tint: ['#6a3cff', 0.12] }));
  Lp('flicker', 'وميض', 'Flicker', 'glitch', L => ({ o: rnd(Math.floor(L * 12), 4) > 0.15 ? 1 : 0.45 }));
  Lp('signalLoop', 'إشارة بتقطع', 'Signal loss', 'glitch', L => { const on = (L % 2.2) > 1.9 ? 1 : 0; return { wave: on * 0.05, rgb: on * 0.04, scan: 0.25 + on * 0.4 }; });
  Lp('crtLoop', 'شاشة قديمة مستمر', 'CRT loop', 'glitch', L => ({ scan: 0.55, gray: 0.3, flash: 0.04 * (1 + sin(L * 50)) }));
  Lp('neonLoop', 'نيون بينبض', 'Neon pulse', 'vfx', L => ({ glow: 0.5 + 0.4 * sin(L * tau * 0.8), tint: ['#00e5ff', 0.15] }));
  Lp('shineLoop', 'لمعة كل شوية', 'Shine loop', 'vfx', L => ({ shine: { p: clamp(((L % 2.4) - 1.6) / 0.8, 0, 1) * 1.4 - 0.2 } }));
  Lp('holoLoop', 'هولوجرام مستمر', 'Hologram loop', 'vfx', L => ({ tint: ['#40c4ff', 0.35], scan: 0.5, o: 0.82 + 0.18 * (rnd(Math.floor(L * 10), 8) > 0.2 ? 1 : 0), dy: 0.006 * sin(L * tau * 0.5), glow: 0.3 }));
  Lp('heatLoop', 'سراب', 'Heat wave', 'vfx', L => ({ wave: 0.012 }));
  Lp('glowPulse', 'توهّج بينبض', 'Glow pulse', 'vfx', L => ({ glow: 0.35 + 0.35 * sin(L * tau * 0.6) }));
  Lp('sparkleLoop', 'نجوم بتلمع', 'Sparkles', 'vfx', L => ({ spark: { k: 'star', loop: L, n: 16, c: '#fff6c8' } }));
  Lp('confettiLoop', 'كونفيتي نازل', 'Confetti rain', 'vfx', L => ({ spark: { k: 'confettiRain', loop: L, n: 40 } }));
  Lp('bubblesLoop', 'فقاعات', 'Bubbles', 'vfx', L => ({ spark: { k: 'bubbleRise', loop: L, n: 18 } }));
  Lp('emberLoop', 'شرار', 'Embers', 'vfx', L => ({ spark: { k: 'emberRise', loop: L, n: 26, c: '#ffb347' }, tint: ['#ff7a1a', 0.08] }));
  Lp('snowLoop', 'تلج', 'Snow', 'vfx', L => ({ spark: { k: 'snow', loop: L, n: 40, c: '#ffffff' } }));
  Lp('heartsLoop', 'قلوب طايرة', 'Floating hearts', 'vfx', L => ({ spark: { k: 'hearts', loop: L, n: 12, c: '#ff4d7a' } }));
  Lp('dreamLoop', 'حلم', 'Dream', 'blur', L => ({ glow: 0.4, blur: 0.006 * (1 + sin(L * tau * 0.4)) }));
  Lp('focusLoop', 'فوكس بيتنفس', 'Breathing focus', 'blur', L => ({ blur: 0.025 * Math.max(0, sin(L * tau * 0.35)) }));
  Lp('bwBeat', 'أبيض وأسود على الإيقاع', 'Mono beat', 'vfx', L => ({ gray: (L % 1) < 0.5 ? 1 : 0 }));
  Lp('waveFlag', 'علم بيرفرف', 'Waving flag', 'vfx', L => ({ wave: 0.02, sk: 3 * sin(L * tau * 0.7) }));

  /* ---------- devices (loops: the frame stays all clip long) ---------- */
  const dev = (id, ar, en, k, f, s = 0.72) => Lp(id, ar, en, 'device', (L, d) => ({ frame: { k }, s, ...f(L, d) }));
  dev('phone', 'موبايل', 'Phone', 'phone', () => ({}));
  dev('phoneFloat', 'موبايل طاير', 'Floating phone', 'phone', L => ({ dy: 0.012 * sin(L * tau * 0.45), ry: 12 * sin(L * tau * 0.25), rx: 5 * sin(L * tau * 0.3 + 1) }));
  dev('phoneRise', 'موبايل طالع', 'Phone rise', 'phone', L => { const e = E.out(at(L, 1)); return { dy: 0.6 * (1 - e) + 0.01 * sin(L * tau * 0.45), rx: 50 * (1 - e) + 4 * sin(L * tau * 0.3), ry: -10 * (1 - e) }; });
  dev('phoneSpin', 'موبايل بيلف', 'Spinning phone', 'phone', L => { const e = E.out(at(L, 1.2)); return { ry: 360 * (1 - e) + 15 * sin(L * tau * 0.3) }; });
  dev('phoneTilt', 'موبايل مايل', 'Tilted phone', 'phone', L => ({ ry: -24 + 4 * sin(L * tau * 0.25), rx: 8, r: -4 }), 0.7);
  dev('phoneWhite', 'موبايل أبيض', 'White phone', 'phoneW', L => ({ dy: 0.01 * sin(L * tau * 0.45), ry: 8 * sin(L * tau * 0.25) }));
  dev('phoneZoom', 'موبايل بزووم', 'Phone zoom', 'phone', L => { const e = E.io(at(L, 1.4)); return { s: 0.72 + 0.6 * (1 - e) }; }, 1);
  dev('phoneFlip', 'موبايل بيتقلب', 'Phone flip', 'phone', L => { const e = E.back(at(L, 1)); return { ry: -180 * (1 - e), dx: 0.3 * (1 - e) }; });
  dev('phoneSlide', 'موبايل سلايد', 'Phone slide', 'phone', L => { const e = E.out(at(L, 0.9)); return { dx: -0.9 * (1 - e), r: -15 * (1 - e), ry: 30 * (1 - e) }; });
  dev('tablet', 'تابلت', 'Tablet', 'tablet', L => ({ ry: 8 * sin(L * tau * 0.25), dy: 0.008 * sin(L * tau * 0.4) }), 0.8);
  dev('laptop', 'لابتوب', 'Laptop', 'laptop', L => ({ dy: 0.008 * sin(L * tau * 0.4) }), 0.72);
  dev('laptopOpen', 'لابتوب بيتفتح', 'Laptop opens', 'laptop', L => ({ rx: -90 * (1 - E.out(at(L, 1.2))), pv: [0.5, 1] }), 0.72);
  dev('tv', 'تلفزيون', 'TV', 'tv', L => ({ flash: 0.6 * (1 - at(L, 0.4)), sy: 0.02 + 0.98 * E.out(at(L, 0.35)) }), 0.74);
  dev('browser', 'متصفح', 'Browser window', 'browser', L => ({ dy: 0.008 * sin(L * tau * 0.4), ry: 6 * sin(L * tau * 0.2) }), 0.8);
  dev('polaroid', 'صورة بولارويد', 'Polaroid', 'polaroid', L => ({ r: -4 + 3 * sin(L * tau * 0.35), dy: 0.006 * sin(L * tau * 0.5) }), 0.7);
  dev('filmFrame', 'شريط فيلم', 'Film frame', 'film', L => ({ dy: 0.004 * (rnd(Math.floor(L * 12), 3) - 0.5), flash: 0.05 * rnd(Math.floor(L * 12), 9) }), 0.82);
  dev('roundFloat', 'دايرة طايرة', 'Round bubble', 'round', L => ({ dy: 0.015 * sin(L * tau * 0.45), s: 0.62 * (1 + 0.02 * sin(L * tau * 0.6)) }), 0.62);
  dev('cardTilt', 'كارت 3D', '3D card', 'card', L => ({ ry: 16 * sin(L * tau * 0.25), rx: 8 * sin(L * tau * 0.2 + 1), shine: { p: (L * 0.25) % 1.6 - 0.3 } }), 0.82);
  dev('phoneLand', 'موبايل بالعرض', 'Landscape phone', 'phone', L => ({ ry: 10 * sin(L * tau * 0.25), dy: 0.008 * sin(L * tau * 0.45) }), 0.86);
  dev('watch', 'ساعة ذكية', 'Smartwatch', 'watch', L => ({ ry: 10 * sin(L * tau * 0.25) }), 0.55);

  const api = { E, rnd, IN, OUT, LOOP, NAMES, CAT, CATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaqtoAnims = api;
})(this);
