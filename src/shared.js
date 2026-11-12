// Shared by the renderer (preview) and main (ffmpeg export) so both draw the same picture.
(function (root) {
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Filters. The first ones are plain slope/saturation grades (kept as they were for old projects);
  // the rest carry f(r,g,b) -> [r,g,b], baked with the clip's colour into its LUT (preview and export alike).
  const PRESETS = {
    none: {},
    warm: { temp: 0.35, s: 1.1, cat: 'basic' },
    cool: { temp: -0.35, s: 0.95, cat: 'basic' },
    vivid: { s: 1.45, c: 1.1, cat: 'basic' },
    matte: { c: 0.82, b: 1.06, s: 0.9, cat: 'basic' },
    bw: { s: 0, c: 1.15, cat: 'bw' },
    cinema: { c: 1.15, s: 0.85, temp: -0.15, b: 0.96, cat: 'cine' },
    vintage: { s: 0.7, temp: 0.3, c: 0.88, b: 1.04, cat: 'retro' },
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

  /* ---------- filter library: small colour steps (CSS filter maths + layer blend modes), chained ---------- */
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const mat = m => v => [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
  const BL = { // blend mode per channel: a = picture, b = layer colour
    normal: (a, b) => b, multiply: (a, b) => a * b, screen: (a, b) => 1 - (1 - a) * (1 - b),
    overlay: (a, b) => a < .5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b), hardlight: (a, b) => b < .5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b),
    softlight: (a, b) => b <= .5 ? a - (1 - 2 * b) * a * (1 - a) : a + (2 * b - 1) * ((a <= .25 ? ((16 * a - 12) * a + 4) * a : Math.sqrt(a)) - a),
    lighten: Math.max, darken: Math.min, exclusion: (a, b) => a + b - 2 * a * b,
    dodge: (a, b) => b >= 1 ? 1 : Math.min(1, a / (1 - b)), burn: (a, b) => b <= 0 ? 0 : 1 - Math.min(1, (1 - a) / b),
  };
  const F = {
    con: k => v => v.map(x => (x - .5) * k + .5),
    bri: k => v => v.map(x => x * k),
    sat: s => mat([.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, .213 - .213 * s, .715 + .285 * s, .072 - .072 * s, .213 - .213 * s, .715 - .715 * s, .072 + .928 * s]),
    gray: a => F.sat(1 - a),
    sep: a => mat([.393 + .607 * (1 - a), .769 - .769 * (1 - a), .189 - .189 * (1 - a), .349 - .349 * (1 - a), .686 + .314 * (1 - a), .168 - .168 * (1 - a), .272 - .272 * (1 - a), .534 - .534 * (1 - a), .131 + .869 * (1 - a)]),
    hue: deg => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
      return mat([.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, .213 - c * .213 + s * .143, .715 + c * .285 + s * .14, .072 - c * .072 - s * .283, .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072]); },
    blend: (mode, h, a = 1) => { const c = hex(h); return v => v.map((x, i) => x + (BL[mode](x, c[i]) - x) * a); },
    gain: (r, g, b) => v => [v[0] * r, v[1] * g, v[2] * b],
    lift: k => v => v.map(x => k + x * (1 - k)), // fade the blacks up to k
    gamma: k => v => v.map(x => Math.pow(x, 1 / k)),
    curve: k => v => v.map(x => scurve(x, k)),
    tone: (sh, hi, a) => v => tone(v[0], v[1], v[2], sh, hi, a),
    mix: m => mat(m),
    ramp: (...hs) => { const cs = hs.map(hex); return v => { const t = clamp(lum(...v), 0, 1) * (cs.length - 1), i = Math.min(cs.length - 2, Math.floor(t)), f = t - i; return cs[i].map((x, k) => x + (cs[i + 1][k] - x) * f); }; },
    keep: (hc, w = 35) => v => { // keep one hue, the rest grey
      const [r, g, b] = v, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = lum(r, g, b);
      if (d < 1e-4) return [l, l, l];
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      const dist = Math.min(Math.abs(h - hc), 360 - Math.abs(h - hc)), k = clamp(1 - (dist - w) / 20, 0, 1) * clamp(d * 4, 0, 1);
      return v.map(x => l + (x - l) * k);
    },
    inv: () => v => v.map(x => 1 - x),
    sol: () => v => v.map(x => x > .5 ? 1 - x : x),
    look: k => v => LOOKS[k](...v),
  };
  const chain = ops => (r, g, b) => { let v = [r, g, b]; for (const o of ops) v = o(v).map(x => clamp(x, 0, 1)); return v; };
  const { con, bri, sat, gray, sep, hue, blend, gain, lift, gamma, curve, tone: tn, mix, ramp, keep, look } = F;
  const duo = (a, b) => [gray(1), ramp(a, b)];
  const post = n => v => v.map(x => Math.round(x * n) / n); // poster levels
  const amp = (k, ...ops) => v => { const o = chain(ops)(...v); return v.map((x, i) => x + (o[i] - x) * k); }; // push a look k times further
  const lflip = () => v => { const k = 1 - 2 * lum(...v); return v.map(x => x + k); }; // light flipped, hue kept
  // [id, category, English, Arabic, ...steps]
  [
    ['bright', 'basic', 'Bright', 'منوّر', bri(1.12), con(.95)],
    ['soft', 'basic', 'Soft', 'ناعم', con(.9), lift(.04)],
    ['punch', 'basic', 'Punch', 'قوي', con(1.25), sat(1.2)],
    ['crisp', 'basic', 'Crisp', 'حاد', curve(.12), con(1.08), sat(1.05)],
    ['fresh', 'basic', 'Fresh', 'منعش', bri(1.05), sat(1.15), hue(-5), blend('screen', '#e0f7ff', .08)],
    ['natural', 'basic', 'Natural', 'طبيعي', con(1.05), sat(1.06)],
    ['rosy', 'social', 'Rosy', 'وردي', con(1.1), bri(1.1), sat(1.3), blend('screen', '#f36abc', .3)],
    ['dusty', 'social', 'Dusty', 'ترابي', hue(-20), con(.9), sat(.85), bri(1.2), blend('darken', '#420a0e', .2)],
    ['glow', 'social', 'Glow', 'توهج', hue(-10), con(.9), bri(1.1), sat(1.5)],
    ['brass', 'social', 'Brass', 'نحاسي', sep(.5), con(1.4), blend('lighten', '#a12cc7', .31)],
    ['mint', 'social', 'Mint', 'نعناعي', con(.9), bri(1.1), blend('overlay', '#a8dfc1', .4)],
    ['clear', 'social', 'Clear', 'صافي', con(1.2), sat(1.35), blend('overlay', '#7fbbe3', .2)],
    ['dawn', 'social', 'Dawn', 'فجر', con(.9), sep(.2), blend('overlay', '#d0ba8e', .5)],
    ['lavender', 'social', 'Lavender', 'لافندر', bri(1.05), hue(-10), blend('softlight', '#e6e6fa')],
    ['icy', 'social', 'Icy', 'ثلجي', bri(1.2), con(.9), sat(1.1), blend('multiply', '#a6b1ff', .5)],
    ['blaze', 'social', 'Blaze', 'لهب', blend('dodge', '#382c34'), blend('overlay', '#b77d21')],
    ['airy', 'social', 'Airy', 'هوائي', con(.9), blend('dodge', '#22253f'), blend('darken', '#f2f2f2', .8)],
    ['lofi', 'social', 'Lo-fi', 'لوفاي', sat(1.1), con(1.5)],
    ['meadow', 'social', 'Meadow', 'مرج', sep(.25), bri(.95), con(.95), sat(1.5), blend('softlight', '#03e61a', .2)],
    ['blush', 'social', 'Blush', 'خجول', con(1.1), sat(1.1), blend('overlay', '#ffc8c8', .4)],
    ['peach', 'social', 'Peach', 'خوخي', sep(.2), con(1.2), bri(1.05), sat(1.2), blend('darken', '#f7b099', .56), blend('lighten', '#004696', .4)],
    ['tide', 'social', 'Tide', 'مدّ', blend('softlight', '#3c8a8a', .6), sat(1.1)],
    ['cream', 'social', 'Cream', 'كريمي', sep(.22), bri(1.1), con(.85), sat(.75), blend('softlight', '#efcdad', .5)],
    ['sunrise', 'social', 'Sunrise', 'شروق', bri(1.05), sep(.2), con(.9), sat(.9), blend('overlay', '#e8a25b', .3)],
    ['dreamy', 'social', 'Dreamy', 'حالم', sat(.66), bri(1.05), blend('lighten', '#45290c', .4), blend('softlight', '#7d6918', .5)],
    ['pale', 'social', 'Pale', 'باهت', con(.75), sat(.85), bri(1.15), blend('softlight', '#f09580', .2)],
    ['toast', 'social', 'Toast', 'محمّص', con(1.5), bri(.9), blend('screen', '#804e0f', .35)],
    ['valley', 'social', 'Valley', 'وادي', con(1.08), bri(1.08), sep(.08), blend('exclusion', '#3a0339', .5)],
    ['lagoon', 'social', 'Lagoon', 'بحيرة', bri(1.1), hue(-10), sep(.3), sat(1.6), blend('screen', '#0044cc', .3)],
    ['willow', 'social', 'Willow', 'صفصاف', gray(.5), con(.95), bri(.9), blend('overlay', '#d4a9af', .4)],
    ['warmFilm', 'film', 'Warm film', 'فيلم دافي', curve(.08), lift(.03), gain(1.04, 1, .94), sat(.9), tn([.45, .5, .55], [.62, .55, .45], .3)],
    ['goldFilm', 'film', 'Gold film', 'فيلم ذهبي', gain(1.08, 1.02, .85), curve(.12), sat(1.1)],
    ['slide', 'film', 'Slide film', 'سلايد', sat(1.5), curve(.25), gain(1, 1.02, 1.04)],
    ['greenFilm', 'film', 'Green film', 'فيلم أخضر', tn([.4, .55, .45], [.55, .55, .45], .4), curve(.1)],
    ['tungsten', 'film', 'Tungsten', 'تنجستن', gain(.9, .98, 1.15), curve(.15), tn([.3, .45, .6], [.65, .55, .5], .3)],
    ['expired', 'film', 'Expired film', 'فيلم منتهي', hue(8), sat(.8), lift(.08), gain(1.05, .95, 1)],
    ['cross', 'film', 'Cross process', 'كروس', v => [scurve(v[0], .3), scurve(v[1], .2) * 1.05, v[2] * .7 + .1]],
    ['bleach', 'film', 'Bleach', 'بليتش', look('bleach')],
    ['instant', 'film', 'Instant', 'فوري', lift(.06), gain(1.03, 1, .95), sat(.85), con(.9), blend('screen', '#ffe9c4', .1)],
    ['classicFilm', 'film', 'Classic film', 'فيلم كلاسيك', sat(1.25), curve(.2), gain(1.05, 1, .92)],
    ['filmLook', 'film', 'Film look', 'لوك فيلم', look('film')],
    ['golden', 'film', 'Golden hour', 'الساعة الدهبية', look('golden')],
    ['tealOrange', 'cine', 'Teal & orange', 'تيل وبرتقالي', look('tealOrange')],
    ['blockbuster', 'cine', 'Blockbuster', 'بلوكباستر', curve(.25), tn([.15, .5, .65], [.95, .6, .3], .7)],
    ['codeGreen', 'cine', 'Code green', 'أخضر الشفرة', gain(.85, 1.05, .85), tn([.2, .45, .3], [.6, .7, .5], .4), curve(.2)],
    ['desert', 'cine', 'Desert', 'صحراء', gain(1.1, 1, .75), sat(.9), curve(.1)],
    ['arctic', 'cine', 'Arctic', 'قطبي', gain(.9, .98, 1.12), sat(.8), lift(.03)],
    ['moonlight', 'cine', 'Moonlight', 'ضي القمر', gain(.8, .9, 1.15), bri(.9), sat(.7)],
    ['dune', 'cine', 'Dune', 'كثبان', tn([.35, .3, .25], [1, .75, .45], .6), curve(.1)],
    ['thriller', 'cine', 'Thriller', 'إثارة', sat(.6), curve(.3), tn([.3, .45, .4], [.5, .5, .5], .4)],
    ['epic', 'cine', 'Epic', 'ملحمي', curve(.3), sat(1.15), tn([.25, .4, .55], [.9, .7, .5], .45)],
    ['neonNight', 'cine', 'Neon night', 'ليل نيون', sat(1.2), tn([.3, .2, .7], [.9, .4, .8], .6)],
    ['western', 'cine', 'Western', 'ويسترن', sep(.4), gain(1.1, .98, .8), curve(.2)],
    ['scifi', 'cine', 'Sci-fi', 'خيال علمي', gain(.85, 1, 1.1), tn([.2, .5, .6], [.6, .6, .6], .5), curve(.2)],
    ['drama', 'cine', 'Drama', 'دراما', curve(.4), sat(.8)],
    ['softSkin', 'portrait', 'Soft skin', 'بشرة ناعمة', lift(.03), con(.92), gain(1.04, 1, .98), sat(.95), blend('softlight', '#ffd9c4', .3)],
    ['peachy', 'portrait', 'Peachy', 'مشمشي', gain(1.06, 1, .94), blend('overlay', '#ffb38a', .15)],
    ['rosyCheeks', 'portrait', 'Rosy cheeks', 'خدود وردي', blend('softlight', '#ff8fa3', .35)],
    ['honey', 'portrait', 'Honey', 'عسلي', gain(1.08, 1.03, .88), sat(1.05), lift(.02)],
    ['porcelain', 'portrait', 'Porcelain', 'بورسلين', bri(1.06), sat(.8), gain(1, 1, 1.03), lift(.03)],
    ['bronze', 'portrait', 'Bronze', 'برونزي', gain(1.1, 1, .85), curve(.15), sat(1.1)],
    ['studio', 'portrait', 'Studio', 'استوديو', curve(.12), sat(1.03), bri(1.03)],
    ['glowSkin', 'portrait', 'Glowing skin', 'بشرة منوّرة', con(.95), blend('screen', '#ffe0cc', .2)],
    ['milk', 'portrait', 'Milk', 'حليبي', lift(.08), sat(.85), bri(1.04)],
    ['cocoa', 'portrait', 'Cocoa', 'كاكاو', gain(1, .92, .82), curve(.1), sat(.9)],
    ['tasty', 'life', 'Tasty', 'شهي', sat(1.3), gain(1.06, 1.02, .92), curve(.1)],
    ['greenery', 'life', 'Greenery', 'خضرة', sat(1.2), gain(.98, 1.06, .96)],
    ['ocean', 'life', 'Ocean', 'محيط', gain(.92, 1, 1.1), sat(1.2)],
    ['sunny', 'life', 'Sunny', 'مشمس', gain(1.08, 1.05, .9), bri(1.05), sat(1.15)],
    ['sunset', 'life', 'Sunset', 'غروب', tn([.45, .3, .4], [1, .6, .3], .55), sat(1.1)],
    ['autumn', 'life', 'Autumn', 'خريف', gain(1.1, .98, .8), sat(1.1), tn([.45, .35, .3], [.8, .6, .4], .3)],
    ['spring', 'life', 'Spring', 'ربيع', gain(1, 1.05, .98), sat(1.1), lift(.03), blend('screen', '#e8ffe0', .1)],
    ['winter', 'life', 'Winter', 'شتاء', gain(.92, .98, 1.1), sat(.75), bri(1.05)],
    ['tropical', 'life', 'Tropical', 'استوائي', sat(1.4), hue(-8), curve(.1)],
    ['city', 'life', 'City', 'مدينة', sat(.85), curve(.2), gain(.95, 1, 1.05)],
    ['vibrant', 'life', 'Vibrant', 'حيوي', look('vivid')],
    ['mono', 'bw', 'Mono', 'مونو', look('mono')],
    ['noir', 'bw', 'Noir', 'نوار', look('noir')],
    ['ink', 'bw', 'Ink', 'حبر', sep(.3), con(1.1), bri(1.1), gray(1)],
    ['moon', 'bw', 'Moon', 'قمر', gray(1), con(1.1), bri(1.1), blend('softlight', '#a0a0a0'), blend('lighten', '#383838')],
    ['highKey', 'bw', 'High key', 'فاتح', gray(1), bri(1.2), con(.9), lift(.05)],
    ['lowKey', 'bw', 'Low key', 'غامق', gray(1), gamma(.8), curve(.4)],
    ['redBw', 'bw', 'Red filter B&W', 'أبيض وأسود أحمر', mix([.6, .3, .1, .6, .3, .1, .6, .3, .1]), con(1.1)],
    ['greenBw', 'bw', 'Green filter B&W', 'أبيض وأسود أخضر', mix([.2, .7, .1, .2, .7, .1, .2, .7, .1]), con(1.05)],
    ['sepia', 'bw', 'Sepia', 'سيبيا', look('sepia')],
    ['selenium', 'bw', 'Selenium', 'سيلينيوم', gray(1), tn([.45, .4, .5], [.5, .5, .5], .4)],
    ['cyanotype', 'bw', 'Cyanotype', 'سيانوتايب', ...duo('#0b2a4a', '#cfe8f5')],
    ['platinum', 'bw', 'Platinum', 'بلاتيني', gray(1), gain(1.02, 1, .96), lift(.04), con(.95)],
    ['grit', 'bw', 'Grit', 'خشن', gray(1), curve(.6)],
    ['seventies', 'retro', '70s', 'السبعينات', gain(1.1, 1, .8), sat(.8), lift(.06), blend('overlay', '#e8a96b', .2)],
    ['eighties', 'retro', '80s', 'التمانينات', sat(1.3), tn([.35, .25, .6], [.95, .55, .75], .4)],
    ['nineties', 'retro', '90s', 'التسعينات', sat(.9), lift(.05), gain(1, 1.02, .96), con(.9)],
    ['lomo', 'retro', 'Lomo', 'لومو', sat(1.3), curve(.35), gain(1.05, 1, .9)],
    ['faded', 'retro', 'Faded', 'باهت قديم', look('fade')],
    ['retroPop', 'retro', 'Retro pop', 'ريترو بوب', sat(1.4), con(1.1), blend('overlay', '#ffcc66', .15)],
    ['oldPhoto', 'retro', 'Old photo', 'صورة قديمة', sep(.7), lift(.08), con(.85)],
    ['vhsColor', 'retro', 'VHS colour', 'ألوان VHS', sat(1.2), gain(1.05, 1, 1.08), lift(.05), hue(-6)],
    ['sunbleached', 'retro', 'Sun-bleached', 'محروق شمس', lift(.1), sat(.6), gain(1.05, 1.02, .95)],
    ['disco', 'retro', 'Disco', 'ديسكو', hue(20), sat(1.3)],
    ['moody', 'mood', 'Moody', 'مودي', look('moody')],
    ['darkForest', 'mood', 'Dark forest', 'غابة مظلمة', gain(.85, .95, .85), gamma(.85), sat(.8), tn([.25, .4, .3], [.5, .5, .5], .4)],
    ['rainy', 'mood', 'Rainy', 'ممطر', gain(.92, .96, 1.04), sat(.6), lift(.03), con(.9)],
    ['gloomy', 'mood', 'Gloomy', 'كئيب', sat(.5), bri(.9), con(1.1)],
    ['night', 'mood', 'Night', 'ليل', gain(.75, .85, 1.1), bri(.8), sat(.8)],
    ['dusk', 'mood', 'Dusk', 'شفق', tn([.3, .25, .45], [.9, .6, .5], .5), bri(.95)],
    ['melancholy', 'mood', 'Melancholy', 'حزين', gray(.6), gain(.95, 1, 1.05), lift(.04)],
    ['smoke', 'mood', 'Smoke', 'دخاني', sat(.4), lift(.1), con(.85)],
    ['velvet', 'mood', 'Velvet', 'مخملي', tn([.4, .2, .35], [.85, .6, .6], .45), curve(.15)],
    ['storm', 'mood', 'Storm', 'عاصفة', gain(.9, .95, 1), curve(.35), sat(.55)],
    ['bleak', 'mood', 'Bleak', 'باهت بارد', sat(.35), gain(.95, 1, 1.05), curve(.2)],
    ['duoPink', 'creative', 'Pink duotone', 'دوتون بينك', ...duo('#2b0f54', '#ff7eb6')],
    ['duoBlue', 'creative', 'Blue duotone', 'دوتون أزرق', ...duo('#0b1d51', '#6ee7ff')],
    ['duoGold', 'creative', 'Gold duotone', 'دوتون دهبي', ...duo('#2d1b00', '#ffd36e')],
    ['duoGreen', 'creative', 'Green duotone', 'دوتون أخضر', ...duo('#002b1f', '#a8ff78')],
    ['duoRed', 'creative', 'Red duotone', 'دوتون أحمر', ...duo('#2a0000', '#ff6b6b')],
    ['duoPurple', 'creative', 'Purple duotone', 'دوتون بنفسجي', ...duo('#1a0033', '#c084fc')],
    ['keepRed', 'creative', 'Only red', 'الأحمر بس', keep(0)],
    ['keepYellow', 'creative', 'Only yellow', 'الأصفر بس', keep(55, 25)],
    ['keepGreen', 'creative', 'Only green', 'الأخضر بس', keep(120)],
    ['keepBlue', 'creative', 'Only blue', 'الأزرق بس', keep(215)],
    ['thermal', 'creative', 'Thermal', 'حراري', gray(1), ramp('#000010', '#2b0a8c', '#c0137b', '#ff6a00', '#ffe600', '#ffffff')],
    ['infrared', 'creative', 'Infrared', 'أشعة حمرا', mix([-.2, 1.2, 0, .2, .6, .2, .2, .2, .6]), curve(.15)],
    ['negative', 'creative', 'Negative', 'نيجاتيف', F.inv()],
    ['solarize', 'creative', 'Solarize', 'سولاريز', F.sol(), con(1.6)],
    ['neon', 'creative', 'Neon', 'نيون', look('neon')],
    ['cyber', 'creative', 'Cyber', 'سايبر', look('cyber')],
    ['pastel', 'creative', 'Pastel', 'باستيل', look('pastel')],
    ['popArt', 'creative', 'Pop art', 'بوب آرت', sat(2), curve(.5)],
    ['hueShift', 'creative', 'Hue shift', 'لف الألوان', hue(90)],
    ['alien', 'creative', 'Alien', 'فضائي', hue(140), sat(1.2)],
    ['gameboy', 'creative', 'Game screen', 'شاشة جيم', gray(1), ramp('#0f380f', '#306230', '#8bac0f', '#9bbc0f')],
    // v1.1 library: 100+ more, same steps
    ['brightPop', 'basic', 'Bright pop', 'منوّر وحيوي', bri(1.08), sat(1.15), con(1.05)],
    ['gentle', 'basic', 'Gentle', 'هادي', con(.92), sat(.92), lift(.03)],
    ['deep', 'basic', 'Deep', 'عميق', con(1.18), gamma(.92)],
    ['cleanWhite', 'basic', 'Clean white', 'أبيض نضيف', bri(1.1), lift(.05), sat(.9)],
    ['warmTouch', 'basic', 'Warm touch', 'لمسة دفا', gain(1.05, 1.01, .94)],
    ['coolTouch', 'basic', 'Cool touch', 'لمسة برودة', gain(.95, 1, 1.06)],
    ['richColor', 'basic', 'Rich colour', 'ألوان مليانة', sat(1.3), curve(.12)],
    ['lowSat', 'basic', 'Low colour', 'ألوان هادية', sat(.7)],
    ['contrasty', 'basic', 'Contrast', 'تباين', curve(.3)],
    ['lifted', 'basic', 'Lifted', 'مرفوع', lift(.08), con(1.05)],
    ['feedGlow', 'social', 'Feed glow', 'لمعة فيد', bri(1.06), tn([.5, .45, .5], [1, .8, .6], .35), sat(1.1)],
    ['coral', 'social', 'Coral', 'كورال', blend('softlight', '#ff7f6a', .35), sat(1.05)],
    ['sage', 'social', 'Sage', 'مريمية', tn([.4, .55, .45], [.75, .8, .65], .4), sat(.85), lift(.04)],
    ['beige', 'social', 'Beige', 'بيج', sat(.75), blend('multiply', '#f3e2c7', .5), lift(.05)],
    ['blueHour', 'social', 'Blue hour', 'الساعة الزرقا', tn([.25, .35, .7], [.7, .65, .8], .5), con(1.05)],
    ['goldenHour', 'social', 'Golden glow', 'الساعة الدهبي', tn([.55, .4, .3], [1, .75, .35], .55), sat(1.1)],
    ['softPink', 'social', 'Soft pink', 'بمبي ناعم', blend('screen', '#ffd1dc', .25), sat(.95)],
    ['cleanLook', 'social', 'Clean', 'كلين', bri(1.05), sat(.88), tn([.5, .5, .5], [.75, .65, .6], .25)],
    ['moodBoard', 'social', 'Mood board', 'مود بورد', sat(.8), lift(.06), tn([.45, .45, .5], [.7, .6, .5], .35)],
    ['juicy', 'social', 'Juicy', 'عصير', sat(1.4), curve(.1), gain(1.03, 1, .97)],
    ['mintPop', 'social', 'Mint pop', 'نعناع', tn([.3, .6, .55], [.8, .95, .85], .4), sat(1.1)],
    ['portraitFilm', 'film', 'Portrait film', 'فيلم بورتريه', curve(.12), tn([.45, .5, .5], [.75, .6, .45], .4), sat(.9), lift(.03)],
    ['vividFilm', 'film', 'Vivid film', 'فيلم ألوان قوية', sat(1.35), curve(.2), gain(1.04, 1, .96)],
    ['greenCast', 'film', 'Green cast', 'فيلم مخضّر', tn([.4, .58, .45], [.6, .6, .5], .4), curve(.15)],
    ['slideFilm', 'film', 'Slide stock', 'فيلم شرائح', sat(1.5), curve(.3), gamma(.95)],
    ['nightFilm', 'film', 'Night film', 'فيلم ليلي', tn([.25, .45, .55], [.95, .55, .35], .6), curve(.15), lift(.03)],
    ['pushed', 'film', 'Pushed', 'فيلم مدفوع', con(1.3), sat(1.1), lift(.05)],
    ['halfFrame', 'film', 'Half frame', 'نص كادر', look('film'), gain(1.04, 1, .94), lift(.04)],
    ['disposable', 'film', 'Disposable', 'كاميرا رمي', sat(1.2), blend('softlight', '#ffe08a', .3), curve(.1), lift(.03)],
    ['filmFade', 'film', 'Faded film', 'فيلم باهت', look('film'), lift(.1), sat(.85)],
    ['redScale', 'film', 'Redscale', 'ريد سكيل', mix([1, .2, 0, .4, .6, 0, .1, .2, .3]), curve(.15)],
    ['agedFilm', 'film', 'Aged film', 'فيلم قديم', look('vintage'), tn([.4, .4, .5], [.8, .65, .45], .35)],
    ['orangeHaze', 'cine', 'Orange haze', 'ضباب برتقاني', tn([.3, .35, .45], [1, .6, .3], .6), con(1.1), sat(.9)],
    ['emerald', 'cine', 'Emerald', 'زمردي', tn([.2, .5, .4], [.6, .75, .55], .5), con(1.1)],
    ['steel', 'cine', 'Steel', 'حديد', sat(.6), tn([.3, .4, .55], [.6, .65, .7], .5), con(1.15)],
    ['heat', 'cine', 'Heat', 'حر', gain(1.08, 1, .85), con(1.1), sat(.9)],
    ['coldWar', 'cine', 'Cold war', 'حرب باردة', sat(.45), gain(.95, 1, 1.05), curve(.25)],
    ['neoNoir', 'cine', 'Neo noir', 'نيو نوار', tn([.15, .3, .5], [.9, .4, .6], .6), con(1.2), sat(.8)],
    ['dayForNight', 'cine', 'Day for night', 'ليل من نهار', gain(.55, .65, .95), con(1.15), sat(.6)],
    ['brightBlock', 'cine', 'Bright blockbuster', 'بلوكباستر منوّر', look('tealOrange'), bri(1.06), sat(1.1)],
    ['redPlanet', 'cine', 'Red planet', 'كوكب أحمر', gain(1.1, .85, .7), curve(.2)],
    ['indie', 'cine', 'Indie', 'إندي', sat(.8), lift(.06), tn([.45, .5, .5], [.7, .6, .5], .3), curve(.1)],
    ['bunker', 'cine', 'Bunker', 'مخبأ', sat(.5), gamma(.85), tn([.35, .4, .35], [.6, .6, .5], .4)],
    ['silk', 'portrait', 'Silk', 'حرير', con(.92), lift(.03), tn([.5, .45, .45], [.8, .65, .55], .3)],
    ['tan', 'portrait', 'Tan', 'سمار', gain(1.06, .98, .88), sat(1.05)],
    ['rose', 'portrait', 'Rose', 'وردي', blend('softlight', '#ffb3c1', .4)],
    ['ivory', 'portrait', 'Ivory', 'عاجي', bri(1.06), sat(.85), blend('screen', '#fff1dc', .2)],
    ['caramel', 'portrait', 'Caramel', 'كراميل', tn([.5, .4, .3], [.9, .7, .5], .45), sat(.95)],
    ['fair', 'portrait', 'Fair', 'فاتح', bri(1.08), gamma(1.08), sat(.92)],
    ['studioCool', 'portrait', 'Studio cool', 'استوديو بارد', gain(.97, 1, 1.04), con(1.06), sat(.9)],
    ['matteSkin', 'portrait', 'Matte skin', 'بشرة مط', lift(.06), con(.95), sat(.95)],
    ['sunKissed', 'portrait', 'Sun kissed', 'بوسة شمس', blend('softlight', '#ffc070', .35), bri(1.03)],
    ['blushPop', 'portrait', 'Blush pop', 'خدود', sat(1.1), blend('overlay', '#ff9aa8', .15)],
    ['picnic', 'life', 'Picnic', 'نزهة', sat(1.2), gain(1.03, 1.04, .95)],
    ['beach', 'life', 'Beach', 'بحر', tn([.3, .55, .65], [.95, .85, .65], .45), bri(1.04)],
    ['forest', 'life', 'Forest', 'غابة', gain(.95, 1.06, .92), sat(1.1), con(1.05)],
    ['street', 'life', 'Street', 'شارع', sat(.85), curve(.2), gain(1, 1, 1.02)],
    ['coffee', 'life', 'Coffee', 'قهوة', tn([.35, .25, .2], [.85, .7, .5], .5), sat(.85)],
    ['foodie', 'life', 'Foodie', 'أكلات', sat(1.25), gain(1.05, 1.01, .92), curve(.1)],
    ['snowDay', 'life', 'Snow day', 'يوم تلج', bri(1.1), gain(.95, 1, 1.07), sat(.85)],
    ['roadTrip', 'life', 'Road trip', 'رحلة', gain(1.07, 1, .88), con(1.1), lift(.03)],
    ['garden', 'life', 'Garden', 'جنينة', sat(1.25), tn([.35, .5, .35], [.8, .85, .6], .3)],
    ['harbor', 'life', 'Harbor', 'ميناء', tn([.25, .4, .55], [.8, .75, .65], .4), sat(.95), con(1.05)],
    ['cityLights', 'life', 'City lights', 'أنوار المدينة', tn([.2, .25, .5], [1, .7, .4], .55), con(1.1), sat(1.15)],
    ['silver', 'bw', 'Silver', 'فضي', gray(1), curve(.2), gain(.98, 1, 1.03)],
    ['charcoal', 'bw', 'Charcoal', 'فحم', gray(1), gamma(.8), con(1.2)],
    ['softBw', 'bw', 'Soft B&W', 'أبيض وأسود ناعم', gray(1), con(.85), lift(.05)],
    ['hardBw', 'bw', 'Hard B&W', 'أبيض وأسود حاد', gray(1), curve(.6)],
    ['warmBw', 'bw', 'Warm B&W', 'أبيض وأسود دافي', gray(1), tn([.5, .45, .4], [.62, .55, .45], .5)],
    ['blueBw', 'bw', 'Blue B&W', 'أبيض وأسود أزرق', gray(1), tn([.35, .42, .6], [.55, .55, .6], .5)],
    ['newsprint', 'bw', 'Newsprint', 'جرنال', gray(1), con(1.4), lift(.08), gain(1, .98, .93)],
    ['ghost', 'bw', 'Ghost', 'شبح', gray(1), bri(1.2), con(.75), lift(.1)],
    ['blueFilter', 'bw', 'Blue filter', 'فلتر أزرق', mix([0, .2, .8, 0, .2, .8, 0, .2, .8]), curve(.2)],
    ['yellowFilter', 'bw', 'Yellow filter', 'فلتر أصفر', mix([.5, .45, .05, .5, .45, .05, .5, .45, .05]), curve(.15)],
    ['greenTintBw', 'bw', 'Green tint', 'أخضر باهت', gray(1), tn([.4, .5, .42], [.6, .62, .55], .45)],
    ['polaroid', 'retro', 'Polaroid', 'بولارويد', look('vintage'), tn([.35, .45, .55], [.9, .8, .6], .35), lift(.05)],
    ['chrome64', 'retro', 'Chrome 64', 'كروم ٦٤', sat(1.3), curve(.25), gain(1.05, 1, .92)],
    ['fifties', 'retro', 'Fifties', 'الخمسينات', sat(.7), tn([.45, .5, .55], [.95, .75, .6], .45), lift(.06)],
    ['sixties', 'retro', 'Sixties', 'الستينات', sat(1.15), gain(1.04, 1.02, .88), lift(.05), con(.92)],
    ['y2k', 'retro', 'Y2K', 'الألفينات', sat(1.2), tn([.4, .3, .65], [.75, .85, .95], .45), bri(1.04)],
    ['camcorder', 'retro', 'Camcorder', 'كاميرا فيديو', sat(1.25), con(1.1), gain(1, 1.03, 1.05), lift(.04)],
    ['postcard', 'retro', 'Postcard', 'كارت بوستال', sat(1.3), lift(.08), gain(1.04, .99, .9)],
    ['threeStrip', 'retro', 'Three strip', 'تلات شرايط', mix([1.3, -.15, -.15, -.15, 1.3, -.15, -.15, -.15, 1.3]), curve(.1)],
    ['faded80s', 'retro', 'Faded 80s', 'تمانينات باهتة', look('fade'), tn([.5, .35, .55], [.8, .65, .75], .4)],
    ['arcade', 'retro', 'Arcade', 'أركيد', sat(1.6), curve(.35), hue(-8)],
    ['oldTv', 'retro', 'Old TV', 'تلفزيون قديم', sat(.55), gain(.95, 1.05, 1), con(1.15), lift(.04)],
    ['fog', 'mood', 'Fog', 'شبورة', lift(.18), con(.8), sat(.7)],
    ['twilight', 'mood', 'Twilight', 'آخر النهار', tn([.3, .3, .6], [.75, .55, .6], .55), gamma(.92)],
    ['ember', 'mood', 'Ember', 'جمر', tn([.3, .15, .1], [1, .55, .25], .6), gamma(.9), sat(.9)],
    ['lonely', 'mood', 'Lonely', 'وحيد', sat(.4), gain(.95, 1, 1.05), lift(.05)],
    ['mystic', 'mood', 'Mystic', 'غامض', tn([.35, .25, .55], [.6, .75, .7], .5), con(1.1), sat(.85)],
    ['haunted', 'mood', 'Haunted', 'مسكون', sat(.3), tn([.35, .45, .4], [.6, .6, .55], .45), gamma(.85)],
    ['candle', 'mood', 'Candlelight', 'ضوء شمعة', gain(1.1, .92, .7), gamma(.9), curve(.1)],
    ['deepSea', 'mood', 'Deep sea', 'قاع البحر', gain(.6, .9, 1.1), con(1.1), sat(.9)],
    ['ashes', 'mood', 'Ashes', 'رماد', sat(.25), lift(.08), con(.9)],
    ['bloodMoon', 'mood', 'Blood moon', 'قمر دموي', tn([.3, .1, .15], [.9, .45, .4], .6), sat(.8), con(1.1)],
    ['calm', 'mood', 'Calm', 'هدوء', sat(.75), tn([.45, .5, .55], [.7, .7, .7], .3), lift(.05)],
    ['keepOrange', 'creative', 'Only orange', 'البرتقاني بس', keep(30)],
    ['keepPink', 'creative', 'Only pink', 'البمبي بس', keep(330)],
    ['xray', 'creative', 'X-ray', 'أشعة إكس', gray(1), F.inv(), gamma(.7), tn([.2, .35, .5], [.8, .9, 1], .5)],
    ['duoTeal', 'creative', 'Duo teal', 'لونين تيل', ...duo('#002b36', '#7fffd4')],
    ['duoSunset', 'creative', 'Duo sunset', 'لونين غروب', ...duo('#3d0c45', '#ffb347')],
    ['duoCoffee', 'creative', 'Duo coffee', 'لونين بني', ...duo('#2b1a0f', '#f5e6c8')],
    ['tritone', 'creative', 'Tritone', 'تلات ألوان', gray(1), ramp('#1a1033', '#d7263d', '#fbd87f')],
    ['hueFlip', 'creative', 'Hue flip', 'ألوان مقلوبة', hue(180)],
    ['channelSwap', 'creative', 'Channel swap', 'تبديل قنوات', mix([0, 0, 1, 0, 1, 0, 1, 0, 0])],
    ['heatMap', 'creative', 'Heat map', 'خريطة حرارة', gray(1), ramp('#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000')],
    ['psychedelic', 'creative', 'Psychedelic', 'سايكيدليك', sat(2.2), hue(60), curve(.3)],
    ['goldFoil', 'creative', 'Gold foil', 'دهبي لامع', gray(1), ramp('#1a1206', '#8a6a1f', '#f3d77a', '#fffbe6')],
    ['matrix', 'creative', 'Matrix', 'ماتريكس', gray(1), ramp('#000000', '#003b00', '#00ff41', '#d4ffd9')],
    // ---- second batch: basic
    ['openShadows', 'basic', 'Open shadows', 'ضل مفتوح', amp(1.5, gamma(1.25))],
    ['deepShadows', 'basic', 'Deep shadows', 'ضل غامق', gamma(.8), con(1.05)],
    ['tameHighlights', 'basic', 'Tame highlights', 'هايلايت هادي', amp(1.25, curve(-.15), bri(.97))],
    ['lessGreen', 'basic', 'Less green', 'أخضر أقل', amp(1.5, gain(1.02, .93, 1.02))],
    ['logLook', 'basic', 'Log look', 'بروفايل فلات', con(.6), sat(.6), lift(.12)],
    ['dehaze', 'basic', 'Dehaze', 'إزالة شبورة', amp(1.75, lift(-.06), sat(1.1), con(1.05))],
    ['overexpose', 'basic', 'Overexpose', 'تعريض زيادة', gamma(1.4), bri(1.08)],
    ['underexpose', 'basic', 'Underexpose', 'تعريض أقل', bri(.7), gamma(.95)],
    // social
    ['cottonCandy', 'social', 'Cotton candy', 'غزل البنات', tn([.6, .5, .75], [1, .75, .85], .6), lift(.05), sat(1.1)],
    ['bubblegum', 'social', 'Bubblegum', 'لبانة', blend('softlight', '#ff6fb5', .5), sat(1.2), bri(1.05)],
    ['lemonade', 'social', 'Lemonade', 'ليمونادة', blend('softlight', '#fff35c', .5), bri(1.06), hue(5)],
    ['matcha', 'social', 'Matcha', 'ماتشا', amp(1.75, tn([.4, .5, .35], [.8, .85, .6], .5), sat(.85), lift(.04))],
    ['sorbet', 'social', 'Sorbet', 'سوربيه', amp(1.25, tn([.55, .35, .5], [1, .8, .6], .6), con(.95))],
    ['skyBlue', 'social', 'Sky', 'سما', blend('overlay', '#7ec8ff', .35), bri(1.05)],
    ['icedTea', 'social', 'Iced tea', 'شاي مثلج', amp(1.5, tn([.45, .35, .25], [.9, .75, .5], .5), con(1.1), sat(.9))],
    ['berry', 'social', 'Berry', 'توت', hue(-15), blend('softlight', '#a0225a', .5), sat(1.15)],
    ['aqua', 'social', 'Aqua', 'أكوا', amp(1.5, mix([.9, .1, 0, 0, 1, .05, 0, .15, 1]), bri(1.04))],
    ['butter', 'social', 'Butter', 'زبدة', amp(1.25, lift(.05), blend('multiply', '#fff0c2', .6), bri(1.08))],
    ['grape', 'social', 'Grape', 'عنب', amp(1.25, tn([.35, .2, .45], [.8, .7, .9], .55))],
    ['citrus', 'social', 'Citrus', 'حمضيات', hue(8), sat(1.3), blend('softlight', '#ffb000', .35)],
    ['cloudNine', 'social', 'Cloud nine', 'سحابة', lift(.1), con(.85), sat(.8), blend('screen', '#dfe8ff', .2)],
    ['popcorn', 'social', 'Popcorn', 'فشار', amp(1.25, blend('overlay', '#ffd38a', .3), curve(.1), bri(1.04))],
    ['denim', 'social', 'Denim', 'جينز', tn([.2, .3, .5], [.75, .8, .9], .5), sat(.8)],
    ['flamingo', 'social', 'Flamingo', 'فلامينجو', amp(1.25, gain(1.08, .94, 1), blend('softlight', '#ff8fa3', .4))],
    ['kiwi', 'social', 'Kiwi', 'كيوي', amp(1.5, gain(.98, 1.06, .9), sat(1.2), curve(.08))],
    ['oatMilk', 'social', 'Oat milk', 'لبن شوفان', amp(1.25, sat(.6), lift(.08), blend('multiply', '#f3e6d0', .5), bri(1.1))],
    ['mango', 'social', 'Mango', 'مانجا', amp(1.5, tn([.6, .35, .2], [1, .8, .3], .5), sat(1.15))],
    ['seaGlass', 'social', 'Sea glass', 'إزاز بحر', tn([.3, .55, .5], [.8, .95, .9], .5), sat(.85), lift(.05)],
    ['lilac', 'social', 'Lilac', 'ليلك', gain(1, .95, 1.08), blend('softlight', '#c8a2ff', .4), lift(.04)],
    ['goldDust', 'social', 'Gold dust', 'تراب دهب', amp(1.25, blend('overlay', '#c9a227', .3), sat(.9), con(1.1))],
    ['coconut', 'social', 'Coconut', 'جوز هند', bri(1.1), sat(.85), tn([.5, .45, .4], [1, .98, .92], .5)],
    ['pistachio', 'social', 'Pistachio', 'فستق', amp(1.25, tn([.45, .5, .3], [.85, .95, .75], .45), lift(.05), sat(.95))],
    ['sunbeam', 'social', 'Sunbeam', 'شعاع', blend('screen', '#ffcf70', .25), con(1.05)],
    ['blueberry', 'social', 'Blueberry', 'بلوبيري', amp(1.5, tn([.15, .15, .45], [.7, .7, .95], .5), sat(1.1))],
    // film
    ['reversal', 'film', 'Reversal', 'ريفرسال', amp(1.75, curve(.3), sat(1.35), gain(.98, 1, 1.04))],
    ['magentaCast', 'film', 'Magenta cast', 'لون ماجنتا', amp(1.75, gain(1.04, .95, 1.04), lift(.04), curve(.1))],
    ['amberStock', 'film', 'Amber stock', 'فيلم كهرماني', amp(2, tn([.45, .35, .2], [.95, .75, .45], .5), con(1.05))],
    ['matteFilm', 'film', 'Matte film', 'فيلم مطفي', amp(1.75, lift(.1), curve(.15), sat(.85), gain(1.02, 1, .97))],
    ['pastelStock', 'film', 'Pastel stock', 'فيلم باستيل', lift(.12), sat(.75), tn([.5, .55, .6], [1, .9, .85], .4)],
    ['printFilm', 'film', 'Print film', 'فيلم طباعة', amp(1.5, curve(.25), tn([.25, .4, .45], [.85, .7, .5], .3), sat(.95))],
    ['blueFade', 'film', 'Blue fade', 'بهتان أزرق', amp(1.25, lift(.08), gain(.95, .98, 1.06), sat(.85))],
    ['redFade', 'film', 'Red fade', 'بهتان أحمر', amp(1.25, lift(.08), gain(1.06, .97, .94), sat(.85))],
    ['superEight', 'film', 'Super 8', 'سوبر ٨', tn([.45, .35, .25], [1, .85, .6], .5), con(1.15), sat(1.1), lift(.03)],
    ['sixteenMm', 'film', '16mm', '١٦ مم', amp(1.5, curve(.2), sat(.9), tn([.3, .4, .35], [.7, .62, .5], .35), lift(.05))],
    ['leakyFilm', 'film', 'Leaky film', 'فيلم مسرّب', blend('screen', '#ff7a3d', .18), lift(.04), sat(1.05)],
    ['overDeveloped', 'film', 'Over developed', 'تحميض زيادة', amp(1.5, curve(.35), sat(1.25), bri(1.05), gain(1.03, 1, .96))],
    ['underDeveloped', 'film', 'Under developed', 'تحميض ناقص', con(.8), bri(.9), sat(.75), lift(.06), gain(.97, 1.02, 1)],
    ['blueTungsten', 'film', 'Blue tungsten', 'تنجستن أزرق', amp(1.5, gain(.85, .95, 1.15), curve(.12))],
    ['pinkStock', 'film', 'Pink stock', 'فيلم وردي', amp(1.5, tn([.5, .35, .45], [1, .8, .75], .4), lift(.05))],
    // cine
    ['tealGold', 'cine', 'Teal & gold', 'تيل ودهبي', amp(1.75, tn([.15, .45, .5], [.95, .75, .35], .6), curve(.15))],
    ['ultraviolet', 'cine', 'Ultraviolet', 'فوق البنفسجي', amp(1.75, tn([.25, .15, .5], [.7, .5, .9], .55), curve(.15))],
    ['nordic', 'cine', 'Nordic', 'إسكندنافي', amp(1.25, sat(.7), gain(.95, 1, 1.05), curve(.1), lift(.03))],
    ['yellowTint', 'cine', 'Yellow tint', 'صفرة', amp(1.5, gain(1.08, 1.02, .75), sat(.9), curve(.1))],
    ['bleachedTeal', 'cine', 'Bleached teal', 'تيل باهت', amp(1.25, sat(.55), tn([.2, .45, .5], [.7, .7, .65], .4), curve(.25))],
    ['redRoom', 'cine', 'Red room', 'أوضة حمرا', gain(1.15, .8, .8), curve(.2), sat(.9)],
    ['sodiumLamps', 'cine', 'Sodium lamps', 'لمبات صوديوم', tn([.4, .25, .1], [1, .7, .3], .6), sat(.8)],
    ['mercuryLamps', 'cine', 'Mercury lamps', 'لمبات زئبق', amp(1.25, tn([.15, .4, .3], [.7, .95, .8], .55), sat(.8))],
    ['magicHour', 'cine', 'Magic hour', 'ساعة سحرية', amp(1.75, tn([.35, .25, .45], [1, .7, .4], .5), curve(.1))],
    ['warZone', 'cine', 'War zone', 'حرب', sat(.45), gain(1.02, 1, .9), curve(.3), bri(.95)],
    ['heist', 'cine', 'Heist', 'سرقة', amp(1.25, tn([.15, .3, .4], [.8, .75, .65], .5), sat(.75), curve(.2))],
    ['spaceOpera', 'cine', 'Space opera', 'فضاء', amp(1.25, tn([.1, .1, .3], [.95, .75, .55], .6), sat(1.1), curve(.2))],
    ['monsoon', 'cine', 'Monsoon', 'موسم مطر', amp(1.5, tn([.2, .35, .35], [.65, .75, .7], .45), sat(.7), bri(.95))],
    ['submarine', 'cine', 'Submarine', 'غواصة', gain(.7, 1.05, 1.1), curve(.25), sat(.8)],
    ['polarNight', 'cine', 'Polar night', 'ليل قطبي', gain(.75, .9, 1.2), bri(.85), curve(.2)],
    ['goldenAge', 'cine', 'Golden age', 'العصر الدهبي', sep(.35), curve(.2), sat(1.1), gain(1.03, 1, .9)],
    ['techNoir', 'cine', 'Tech noir', 'تيك نوار', amp(1.25, tn([.1, .2, .35], [.85, .3, .6], .5), sat(.8), curve(.3))],
    ['musical', 'cine', 'Musical', 'استعراضي', amp(1.75, sat(1.5), curve(.15), tn([.4, .3, .5], [1, .85, .6], .3))],
    ['wasteland', 'cine', 'Wasteland', 'أرض خراب', tn([.35, .3, .2], [.95, .8, .55], .55), sat(.6), curve(.25)],
    ['jungle', 'cine', 'Jungle', 'غابة استوائية', gain(.9, 1.08, .9), sat(1.2), curve(.15), tn([.1, .3, .2], [.8, .9, .6], .3)],
    ['courtroom', 'cine', 'Courtroom', 'محكمة', amp(1.75, sat(.65), tn([.3, .35, .3], [.85, .8, .7], .4), curve(.15))],
    ['hospital', 'cine', 'Hospital', 'مستشفى', amp(1.25, gain(.92, 1.05, 1), sat(.6), bri(1.08), con(1.05))],
    ['gangster', 'cine', 'Gangster', 'عصابات', sep(.3), sat(.6), curve(.35), bri(.92)],
    ['dreamSequence', 'cine', 'Dream sequence', 'مشهد حلم', amp(1.5, lift(.12), blend('screen', '#c9b7ff', .2), sat(.9), con(.85))],
    ['flashback', 'cine', 'Flashback', 'فلاش باك', sep(.5), lift(.1), con(.85), blend('screen', '#ffe9c4', .15)],
    ['villain', 'cine', 'Villain', 'شرير', tn([.25, .35, .1], [.6, .7, .4], .5), curve(.3), sat(.7)],
    // retro
    ['forties', 'retro', 'Forties', 'الأربعينات', amp(1.75, sep(.4), sat(1.2), curve(.2), gain(1.05, .98, .85))],
    ['handTinted', 'retro', 'Hand tinted', 'ملون باليد', sat(.45), lift(.08), tn([.45, .4, .35], [.95, .85, .8], .4), blend('softlight', '#f2a0a0', .2)],
    ['autochrome', 'retro', 'Autochrome', 'أوتوكروم', sat(.6), lift(.1), con(.85), gain(1, 1.02, .85), tn([.4, .45, .3], [.9, .8, .6], .4)],
    ['broadcast', 'retro', 'Broadcast', 'بث قديم', amp(1.5, sat(1.3), gain(1.05, 1, .92), curve(.1), lift(.04))],
    ['rentalTape', 'retro', 'Rental tape', 'شريط إيجار', amp(1.5, gain(.92, 1, 1.1), sat(.85), lift(.06), con(.9))],
    ['magazine', 'retro', 'Magazine', 'مجلة قديمة', tn([.4, .3, .2], [.95, .85, .7], .45), sat(.8), con(1.1)],
    ['printShop', 'retro', 'Print shop', 'استوديو تصوير', amp(2, lift(.06), sat(1.15), gain(1.04, 1, .94), curve(.12))],
    ['mod', 'retro', 'Mod', 'مود', sat(1.4), curve(.25), hue(8)],
    ['driveIn', 'retro', 'Drive-in', 'سينما عربيات', amp(2, tn([.25, .2, .35], [.95, .7, .5], .5), lift(.05), sat(1.1))],
    ['motel', 'retro', 'Motel', 'موتيل', amp(1.5, tn([.3, .4, .35], [.9, .7, .55], .45), sat(.85), gain(1, 1.03, .95))],
    ['jukebox', 'retro', 'Jukebox', 'جوك بوكس', amp(1.75, sat(1.35), tn([.4, .15, .3], [1, .8, .5], .35))],
    ['diner', 'retro', 'Diner', 'مطعم قديم', amp(1.5, gain(1.08, 1, .92), sat(1.2), blend('softlight', '#ff4a4a', .15))],
    ['cassette', 'retro', 'Cassette', 'كاسيت', amp(1.5, lift(.07), sat(.9), gain(1.05, .98, .9), curve(.1))],
    ['slideShow', 'retro', 'Slide show', 'عرض شرايح', amp(1.5, curve(.2), sat(1.25), gain(1, 1.02, 1.06), lift(.05))],
    ['woodPanel', 'retro', 'Wood panel', 'خشب سبعيناتي', amp(1.25, tn([.35, .25, .15], [.85, .7, .45], .6), sat(.75))],
    ['tintype', 'retro', 'Tintype', 'تين تايب', amp(1.25, gray(1), tn([.3, .3, .25], [.75, .75, .7], .5), curve(.3), lift(.05))],
    ['comicPrint', 'retro', 'Comic print', 'طباعة كوميكس', amp(1.25, sat(1.5), curve(.3), gain(1, .97, .9), lift(.05))],
    ['kinescope', 'retro', 'Kinescope', 'كينسكوب', gray(.85), curve(.3), gain(1, 1, 1.08), lift(.06)],
    // portrait
    ['almond', 'portrait', 'Almond', 'لوز', amp(2, tn([.5, .4, .35], [1, .88, .75], .45), lift(.03), sat(.95))],
    ['oliveSkin', 'portrait', 'Olive skin', 'بشرة زيتوني', amp(2, gain(1.02, 1.02, .92), sat(.9), curve(.08))],
    ['pearl', 'portrait', 'Pearl', 'لولي', lift(.06), sat(.85), bri(1.06), tn([.5, .5, .55], [1, .97, .97], .4)],
    ['bridal', 'portrait', 'Bridal', 'عروسة', lift(.08), bri(1.1), sat(.8), blend('softlight', '#fff0f0', .5)],
    ['editorial', 'portrait', 'Editorial', 'مجلات', amp(1.75, curve(.25), sat(.8), gain(1.02, 1, .98))],
    ['glam', 'portrait', 'Glam', 'جلام', amp(2, blend('overlay', '#e8b77a', .3), curve(.15), sat(1.05))],
    ['deepTones', 'portrait', 'Deep tones', 'درجات عميقة', amp(1.75, gamma(.9), sat(1.1), tn([.35, .25, .2], [.85, .7, .6], .3))],
    ['clay', 'portrait', 'Clay', 'صلصال', sat(.7), tn([.45, .35, .3], [.9, .75, .65], .5), con(1.05)],
    // life
    ['noon', 'life', 'Noon', 'الضهر', amp(2, bri(1.08), con(1.1), gain(1.03, 1.02, .95))],
    ['blossom', 'life', 'Blossom', 'زهر', amp(1.25, gain(1.04, .97, 1.02), lift(.04), sat(1.1), blend('softlight', '#ffd1e3', .4))],
    ['bakery', 'life', 'Bakery', 'مخبز', amp(1.5, tn([.5, .35, .2], [1, .88, .65], .45), lift(.03))],
    ['spices', 'life', 'Spices', 'بهارات', amp(1.5, gain(1.08, .96, .85), sat(1.3), curve(.15))],
    ['iceCream', 'life', 'Ice cream', 'آيس كريم', lift(.08), sat(1.1), bri(1.06), tn([.6, .55, .65], [1, .92, .9], .35)],
    ['nightMarket', 'life', 'Night market', 'سوق بالليل', amp(1.5, tn([.15, .15, .35], [1, .7, .35], .55), sat(1.2), curve(.15))],
    ['rooftop', 'life', 'Rooftop', 'سطوح', amp(2, tn([.3, .35, .5], [.95, .75, .6], .4), con(1.05))],
    ['poolside', 'life', 'Poolside', 'جنب البيسين', amp(1.25, gain(.92, 1.03, 1.08), sat(1.25), bri(1.05))],
    ['campfire', 'life', 'Campfire', 'نار مخيم', amp(1.5, tn([.25, .12, .05], [1, .7, .35], .6), bri(.95))],
    ['skiTrip', 'life', 'Ski trip', 'رحلة تزلج', amp(1.5, bri(1.1), gain(.95, 1, 1.06), curve(.1), sat(1.1))],
    ['countryside', 'life', 'Countryside', 'ريف', amp(1.25, gain(1, 1.04, .92), sat(1.1), tn([.35, .4, .25], [.95, .9, .7], .3))],
    ['oldTown', 'life', 'Old town', 'المدينة القديمة', amp(1.75, tn([.4, .33, .25], [.95, .85, .7], .45), sat(.85), con(1.05))],
    ['subway', 'life', 'Subway', 'مترو', gain(.92, 1.05, .95), sat(.75), curve(.2)],
    ['workout', 'life', 'Workout', 'تمرين', amp(2, curve(.3), sat(.8), gain(1, 1, 1.04))],
    ['wedding', 'life', 'Wedding', 'فرح', amp(1.25, lift(.05), bri(1.08), tn([.5, .45, .45], [1, .92, .8], .4))],
    ['cafeWindow', 'life', 'Café window', 'شباك كافيه', amp(1.5, tn([.4, .3, .25], [.95, .85, .7], .4), lift(.06), sat(.9))],
    ['desertNight', 'life', 'Desert night', 'ليل الصحرا', gain(.8, .9, 1.15), tn([.1, .15, .35], [.9, .75, .55], .4), bri(.9)],
    ['eid', 'life', 'Eid', 'عيد', amp(1.25, sat(1.3), bri(1.06), blend('softlight', '#ffd27a', .3))],
    // mood
    ['abyss', 'mood', 'Abyss', 'هاوية', bri(.75), gain(.85, .95, 1.1), curve(.25), sat(.7)],
    ['insomnia', 'mood', 'Insomnia', 'أرق', amp(1.75, gain(.95, 1.05, .95), sat(.6), lift(.05), con(.9))],
    ['nostalgia', 'mood', 'Nostalgia', 'حنين', lift(.08), sep(.25), sat(.85), blend('softlight', '#ffcc99', .25)],
    ['eerie', 'mood', 'Eerie', 'مخيف', amp(1.25, tn([.2, .35, .2], [.7, .75, .6], .5), sat(.55), bri(.9))],
    ['heartbreak', 'mood', 'Heartbreak', 'قلب مكسور', amp(1.75, tn([.3, .2, .3], [.8, .7, .75], .45), sat(.6), bri(.92))],
    ['serene', 'mood', 'Serene', 'سكينة', amp(1.75, lift(.06), sat(.8), gain(.97, 1, 1.04), con(.9))],
    ['rage', 'mood', 'Rage', 'غضب', gain(1.2, .85, .8), curve(.35), sat(1.1)],
    ['tension', 'mood', 'Tension', 'توتر', amp(1.5, curve(.4), sat(.7), gain(1, 1.02, .95))],
    ['daydream', 'mood', 'Daydream', 'سرحان', amp(1.75, lift(.12), sat(.85), blend('screen', '#ffe0f0', .2), con(.88))],
    ['isolation', 'mood', 'Isolation', 'عزلة', sat(.35), gain(.95, 1, 1.06), bri(.95)],
    ['warmMemory', 'mood', 'Warm memory', 'ذكرى دافية', amp(2, tn([.45, .35, .3], [1, .85, .65], .5), lift(.05), sat(.9))],
    ['coldMorning', 'mood', 'Cold morning', 'صبح ساقع', amp(1.75, gain(.93, 1, 1.08), lift(.05), sat(.85), bri(1.04))],
    ['smog', 'mood', 'Smog', 'تلوث', amp(1.25, tn([.45, .42, .3], [.8, .78, .65], .5), lift(.1), sat(.6), con(.85))],
    ['toxic', 'mood', 'Toxic', 'سام', gain(.9, 1.15, .7), curve(.25), sat(.8)],
    ['drowsy', 'mood', 'Drowsy', 'نعسان', lift(.1), con(.8), sat(.75), gain(1.02, 1, .97)],
    ['fever', 'mood', 'Fever', 'سخونية', amp(1.5, gain(1.12, .95, .88), lift(.04), sat(1.1), bri(1.04))],
    ['blues', 'mood', 'Blues', 'بلوز', amp(1.5, tn([.1, .2, .45], [.6, .7, .9], .55), sat(.7))],
    ['violetNight', 'mood', 'Violet night', 'ليل بنفسجي', tn([.3, .15, .45], [.75, .65, .9], .5), bri(.92), sat(.85)],
    ['lateNight', 'mood', 'Late night', 'آخر الليل', bri(.82), tn([.15, .15, .3], [.9, .8, .6], .45), curve(.15)],
    ['grief', 'mood', 'Grief', 'حزن', sat(.3), bri(.9), con(.9), gain(1.02, 1, .95), lift(.06)],
    // bw
    ['glowBw', 'bw', 'Glow B&W', 'أبيض وأسود منوّر', amp(1.25, gray(1), lift(.08), gamma(1.2), blend('screen', '#ffffff', .08))],
    ['infraredBw', 'bw', 'Infrared B&W', 'إنفرارد أبيض وأسود', mix([-.2, 1.4, -.2, -.2, 1.4, -.2, -.2, 1.4, -.2]), curve(.2)],
    ['orangeBw', 'bw', 'Orange filter B&W', 'فلتر برتقالي', amp(1.25, mix([.6, .35, .05, .6, .35, .05, .6, .35, .05]), curve(.15))],
    ['matteBw', 'bw', 'Matte B&W', 'أبيض وأسود مطفي', gray(1), lift(.15), con(.9)],
    ['crushedBw', 'bw', 'Crushed B&W', 'أسود مكبوس', gray(1), gamma(.7), curve(.3)],
    ['goldTone', 'bw', 'Gold tone', 'تون دهبي', amp(1.25, gray(1), tn([.45, .45, .45], [.85, .7, .4], .6))],
    ['splitBw', 'bw', 'Split tone B&W', 'سبليت تون', gray(1), tn([.3, .4, .6], [.8, .65, .4], .6)],
    ['graphicBw', 'bw', 'Graphic B&W', 'أبيض وأسود جرافيك', gray(1), con(2.2)],
    ['portraitBw', 'bw', 'Portrait B&W', 'بورتريه أبيض وأسود', mix([.5, .4, .1, .5, .4, .1, .5, .4, .1]), gamma(1.1), lift(.03)],
    ['nightBw', 'bw', 'Night B&W', 'ليل أبيض وأسود', gray(1), gamma(.8), gain(.9, .95, 1.05), curve(.2)],
    ['grainyBw', 'bw', 'Film B&W', 'فيلم أبيض وأسود', mix([.3, .6, .1, .3, .6, .1, .3, .6, .1]), curve(.25), lift(.04)],
    ['sabattier', 'bw', 'Sabattier', 'سباتييه', gray(1), F.sol(), gain(1.9, 1.9, 1.9), con(1.2)],
    ['bleachedBw', 'bw', 'Bleached B&W', 'أبيض وأسود مبيّض', gray(1), gamma(1.5), curve(.4)],
    ['roseBw', 'bw', 'Rose B&W', 'أبيض وأسود وردي', amp(1.25, gray(1), tn([.45, .4, .45], [.75, .6, .65], .5))],
    ['lithPrint', 'bw', 'Lith print', 'ليث', gray(1), curve(.5), tn([.25, .2, .15], [.9, .75, .6], .5)],
    // creative
    ['navyOrangeDuo', 'creative', 'Navy & orange duo', 'دوو كحلي وبرتقالي', ...duo('#14213d', '#fca311')],
    ['limeDuo', 'creative', 'Lime duo', 'دوو ليموني', ...duo('#1b1b3a', '#c6ff00')],
    ['candyDuo', 'creative', 'Candy duo', 'دوو حلويات', ...duo('#ff006e', '#ffbe0b')],
    ['roseGold', 'creative', 'Rose gold', 'روز جولد', ...duo('#4a1c2a', '#f4c2a1')],
    ['aquaVioletDuo', 'creative', 'Aqua & violet duo', 'دوو أكوا وبنفسجي', ...duo('#240046', '#00f5d4')],
    ['rustDuo', 'creative', 'Rust duo', 'دوو صدا', ...duo('#1d1d1d', '#d35400')],
    ['plumPeach', 'creative', 'Plum & peach', 'برقوق وخوخ', ...duo('#3d0c3a', '#ffcfa8')],
    ['cmyDuo', 'creative', 'Cyan & magenta', 'سيان وماجنتا', ...duo('#00b4d8', '#ff4ecd')],
    ['neonTritone', 'creative', 'Neon tritone', 'تريتون نيون', gray(1), ramp('#120136', '#ff00a0', '#00fff0')],
    ['fireMap', 'creative', 'Fire map', 'خريطة نار', gray(1), ramp('#000000', '#9b1d20', '#ff9e00', '#fff4c2')],
    ['synthwave', 'creative', 'Synthwave', 'سينث ويف', gray(1), ramp('#2b0f54', '#ab1f65', '#ff4f0f', '#ffcf40')],
    ['vaporwave', 'creative', 'Vaporwave', 'فيبر ويف', gray(1), ramp('#2d00f7', '#f20089', '#ffd6ff')],
    ['silverGold', 'creative', 'Silver & gold', 'فضي ودهبي', gray(1), ramp('#1c1c1c', '#9e9e9e', '#d4af37', '#fff3c4')],
    ['mintChoco', 'creative', 'Mint choco', 'نعناع وشوكولاتة', gray(1), ramp('#2b1608', '#6b3e26', '#98f5e1')],
    ['lavaLamp', 'creative', 'Lava lamp', 'لافا', gray(1), ramp('#2a0845', '#ff2e63', '#ffd166')],
    ['bioluminescent', 'creative', 'Bioluminescent', 'مضيء', gray(1), ramp('#000814', '#003566', '#00f5d4')],
    ['electric', 'creative', 'Electric', 'كهربا', gray(1), ramp('#000000', '#3a0ca3', '#4cc9f0', '#ffffff')],
    ['duskMap', 'creative', 'Dusk map', 'خريطة مغرب', gray(1), ramp('#0d1b2a', '#415a77', '#e0b1cb', '#fdf0d5')],
    ['copperMap', 'creative', 'Copper', 'نحاس', gray(1), ramp('#1a0f0a', '#b87333', '#ffe0c2')],
    ['poster', 'creative', 'Poster', 'بوستر', post(2), sat(1.1)],
    ['onlyPurple', 'creative', 'Only purple', 'بنفسجي بس', keep(285, 30)],
    ['onlyCyan', 'creative', 'Only cyan', 'سماوي بس', keep(185, 25)],
    ['lumaFlip', 'creative', 'Light flip', 'قلب الإضاءة', lflip()],
    ['anaglyphColour', 'creative', 'Red & cyan', 'أحمر وسيان', mix([1, 0, 0, 0, .5, .5, 0, .5, .5])],
    ['brownNegative', 'creative', 'Brown negative', 'نيجاتيف بني', F.inv(), sep(1)],
    ['swapRGB', 'creative', 'Channel spin', 'لف القنوات', v => [v[2], v[0], v[1]]],
    ['swapBGR', 'creative', 'Reverse channels', 'قنوات معكوسة', v => [v[1], v[2], v[0]]],
    ['greenToRed', 'creative', 'Green to red', 'الأخضر أحمر', v => [v[1], v[0], v[2]]],
    ['infraredPink', 'creative', 'Pink infrared', 'إنفرا بمبي', v => [Math.max(v[1], v[0]), v[0] * .6, v[1] * .9], con(1.1)],
    ['acidMap', 'creative', 'Acid map', 'خريطة أسيد', gray(1), ramp('#1b0033', '#00ff9c', '#fff200')],
    ['lavaMap', 'creative', 'Lava map', 'حمم', gray(1), ramp('#000000', '#7a0000', '#ff5a00', '#ffe9a0')],
    ['iceMap', 'creative', 'Ice map', 'تلج', gray(1), ramp('#020a2a', '#2f6fd8', '#bff3ff', '#ffffff')],
    ['toxicMap', 'creative', 'Toxic map', 'خريطة سامة', gray(1), ramp('#0c1a00', '#6aa000', '#e8ff3a')],
    ['rainbowMap', 'creative', 'Rainbow map', 'قوس قزح', gray(1), ramp('#3a00a8', '#0090ff', '#00d06a', '#ffd000', '#ff3000')],
    ['candyMap', 'creative', 'Candy map', 'حلاوة', gray(1), ramp('#5a0a5a', '#ff4fa0', '#7ff0ff')],
    ['bronzeMap', 'creative', 'Bronze map', 'برونز', gray(1), ramp('#1a0d05', '#8a4a1a', '#f2c890')],
    ['jadeMap', 'creative', 'Jade', 'يشم', gray(1), ramp('#001410', '#1f7a5a', '#d8ffe8')],
    ['crimsonMoon', 'creative', 'Crimson moon', 'قمر قرمزي', gray(1), ramp('#0a0000', '#6a0010', '#ff7040')],
    ['oceanDepth', 'creative', 'Ocean depth', 'عمق البحر', gray(1), ramp('#000814', '#003566', '#00b4d8', '#caf0f8')],
    ['nightVision', 'creative', 'Night vision', 'رؤية ليلية', gray(1), con(1.3), ramp('#001000', '#20ff40')],
    ['plasmaMap', 'creative', 'Plasma', 'بلازما', gray(1), ramp('#000030', '#6000a0', '#ff0060', '#ffa000', '#ffffa0')],
    ['xrayBlue', 'creative', 'Blue X-ray', 'أشعة زرقا', gray(1), F.inv(), ramp('#000a14', '#9fd8ff')],
    ['posterBW', 'bw', 'Poster BW', 'بوستر أبيض وأسود', gray(1), post(3), con(1.1)],
    ['halfInvert', 'creative', 'Half invert', 'نص عكس', v => v.map((x, i) => i === 0 ? 1 - x : x)],
    ['blueInvert', 'creative', 'Blue invert', 'أزرق معكوس', v => [v[0], v[1], 1 - v[2]]],
    ['greenInvert', 'creative', 'Green invert', 'أخضر معكوس', v => [v[0], 1 - v[1], v[2]]],
    ['solarGold', 'creative', 'Gold solarize', 'سولار دهبي', F.sol(), ramp('#140800', '#ffcc40')],
    ['mono2', 'creative', 'Red & black', 'أحمر وأسود', gray(1), con(1.6), ramp('#000000', '#e00020')],
    ['blueprint', 'creative', 'Blueprint', 'بلوبرنت', gray(1), F.inv(), ramp('#0a2a6a', '#e8f0ff')],
    ['flatPop', 'creative', 'Flat pop', 'بوب مسطح', post(1), sat(1.5)],
    ['dusk2', 'creative', 'Violet dusk', 'غروب بنفسجي', gray(1), ramp('#0d0221', '#7b2cbf', '#ff9e00')],
    ['mintChoc', 'creative', 'Mint & choco', 'نعناع وبني', gray(1), ramp('#2a1408', '#7fffd4')],
  ].forEach(([id, cat, en, ar, ...ops]) => { PRESETS[id] = { cat, en, ar, f: chain(ops) }; });
  const presetFn = it => { const p = PRESETS[it.preset]; return p && p.f; };

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
    if (presetFn(it)) return true;
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
    const look = c.look && LOOKS[c.look], lm = clamp(num(c.lookMix, 1), 0, 1), pf = presetFn(it);
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
      if (pf) v = pf(v[0], v[1], v[2]);
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
  const colorKey = it => JSON.stringify([it.color || null, grade(it).key, presetFn(it) ? it.preset : '']);

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
      if (it.style) for (const x of [...(it.style.strokes || []), ...(it.style.shadows || [])]) for (const f of ['w', 'blur', 'dist']) if (x[f] != null) x[f] = +x[f] * k;
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
  // Rich animations (anims.js): their basic channels go through the path above; the rest (3D, blur, glitch, reveals,
  // pieces, device frames) is drawn by animfx.js, and the export renders those stretches as frames from the same code.
  const AX = typeof module !== 'undefined' && module.exports ? require('./anims.js') : root.MaqtoAnims;
  const RICH = { in: new Set(), out: new Set(), loop: new Set() };
  if (AX) {
    for (const k in AX.IN) { VA_IN[k] = AX.IN[k]; RICH.in.add(k); }
    for (const k in AX.OUT) { VA_OUT[k] = AX.OUT[k]; RICH.out.add(k); }
    for (const k in AX.LOOP) { VA_LOOP[k] = { f: AX.LOOP[k], e: {} }; RICH.loop.add(k); }
  }
  const FXK = ['sk', 'ry', 'rx', 'blur', 'px', 'rgb', 'glitch', 'wave', 'scan', 'flash', 'dark', 'gray', 'inv', 'glow',
    'twist', 'bend', 'melt', 'cyl', 'cylP', 'accord', 'bulge', 'genie', 'twirl', 'ripple', 'burn', 'hue', 'poster', 'thermal', 'sketch', 'halftone', 'echo', 'extrude', 'reflect'];
  const FXO = ['pv', 'tint', 'shine', 'mb', 'wipe', 'tiles', 'spark', 'frame', 'bg', 'ov', 'stroke', 'mirror'];
  // The rich channels of an item at local time lt (null when none of its animations is rich right now).
  function vaFx(it, lt) {
    if (it.type === 'text') return null;
    const inD = Math.min(num(it.inDur, 0.5), it.dur), outD = Math.min(num(it.outDur, 0.4), it.dur), parts = [];
    if (RICH.in.has(it.anim) && lt < inD) parts.push([VA_IN[it.anim], clamp(lt / inD, 0, 1), 0.05 / inD]);
    if (RICH.out.has(it.out) && it.dur - lt < outD) parts.push([VA_OUT[it.out], clamp(1 - (it.dur - lt) / outD, 0, 1), 0.05 / outD]);
    if (RICH.loop.has(it.loop)) parts.push([u => VA_LOOP[it.loop].f(u, it.dur), lt, 0.05]);
    if (!parts.length) return null;
    const q = { sx: 1, sy: 1, t: lt, ghosts: [] };
    for (const k of FXK) q[k] = 0;
    for (const [f, u, du] of parts) {
      const d = f(u);
      q.sx *= num(d.sx, 1); q.sy *= num(d.sy, 1);
      for (const k of FXK) if (d[k]) q[k] += d[k];
      for (const k of FXO) if (d[k] != null) q[k] = d[k];
      if (d.trail) for (let i = 1; i <= 4; i++) { // ghosts: where the layer was a moment ago, relative to now
        const g = f(Math.max(0, u - i * du));
        q.ghosts.push({ dx: num(g.dx, 0) - num(d.dx, 0), dy: num(g.dy, 0) - num(d.dy, 0), s: num(g.s, 1) / num(d.s, 1), r: num(g.r, 0) - num(d.r, 0), o: d.trail * (1 - i / 5) * 0.6 });
      }
    }
    return q;
  }
  // Local time spans the export renders as frames (rich in / out / loop), and their frame counts.
  function richSegs(it) {
    if (it.type === 'text' || it.hidden) return [];
    if (RICH.loop.has(it.loop)) return [[0, it.dur]];
    const s = [], inD = Math.min(num(it.inDur, 0.5), it.dur), outD = Math.min(num(it.outDur, 0.4), it.dur);
    if (RICH.in.has(it.anim)) s.push([0, inD]);
    if (RICH.out.has(it.out)) { const a = it.dur - outD; if (s.length && a <= s[0][1]) s[0][1] = it.dur; else s.push([a, it.dur]); }
    return s;
  }
  const segFrames = (sg, fps) => Math.max(1, Math.round((sg[1] - sg[0]) * fps));
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
  const FX = ['blur', 'shake', 'zoomPulse', 'grain', 'vignette', 'rgbSplit', 'glitch', 'vhs', 'pixelate', 'invert', 'flash', 'letterbox',
    'bounce', 'sway', 'earthquake', 'zoomIn', 'zoomOut', 'zoomBeat', 'drunk', 'tilt', 'wobble', 'mirror', 'mirrorV', 'quad', 'grid9', 'split3', 'kaleido',
    'wave', 'ripple', 'bulge', 'pinch', 'swirl', 'posterize', 'comic', 'emboss', 'sharpen', 'sketch', 'dots', 'scanlines', 'nightVision', 'oldFilm',
    'strobe', 'blackout', 'rgbSplitV', 'ghost', 'hueCycle', 'border', 'slices'];
  const FX_CAT = { basic: ['blur', 'sharpen', 'vignette', 'grain', 'letterbox', 'border', 'flash', 'invert'],
    motion: ['shake', 'earthquake', 'bounce', 'sway', 'zoomPulse', 'zoomBeat', 'zoomIn', 'zoomOut', 'drunk', 'wobble', 'tilt'],
    glitch: ['glitch', 'rgbSplit', 'rgbSplitV', 'slices', 'strobe', 'blackout', 'ghost', 'hueCycle'],
    retro: ['vhs', 'oldFilm', 'scanlines', 'nightVision', 'pixelate', 'posterize'],
    distort: ['wave', 'ripple', 'bulge', 'pinch', 'swirl'],
    mirror: ['mirror', 'mirrorV', 'kaleido', 'quad', 'grid9', 'split3'],
    art: ['comic', 'sketch', 'emboss', 'dots'] };
  const q4 = x => Math.round(x * 1e4) / 1e4; // numbers that go into ffmpeg, used as-is by the preview too
  /* ---------- formula effects: one definition makes both the preview shader and the export geq ---------- */
  // x, y = where each output pixel reads the clip (0..1); c = its colour per channel (0..1); d = named parts.
  // U V = output pixel, T = clip time, a = amount, AR = width/height, PX PY = centred position in height
  // units, PR PA = its radius and angle, C = the read channel, L = luma there, R0 G0 B0 = the read colour,
  // pick(r,g,b) = a value per channel (in x or y it reads each channel from its own place).
  const FXG = [
    // motion
    { id: 'gHeartbeat', cat: 'motion', en: 'Heartbeat', ar: 'نبض قلب', d: [['z', '1+a*0.1*(pow(max(0,sin(7.54*T)),16)+0.6*pow(max(0,sin(7.54*T-0.7)),16))']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'gBreathe', cat: 'motion', en: 'Breathe', ar: 'تنفّس', d: [['z', '1+a*0.08*(0.5-0.5*cos(2.094*T))']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'gFloat', cat: 'motion', en: 'Float', ar: 'طفو', d: [['z', '1+a*0.08']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z+a*0.03*sin(2.513*T)' },
    { id: 'gOrbit', cat: 'motion', en: 'Orbit', ar: 'دوران كاميرا', d: [['z', '1+a*0.1']], x: '0.5+(U-0.5)/z+a*0.035*cos(3.1416*T)', y: '0.5+(V-0.5)/z+a*0.035*sin(3.1416*T)' },
    { id: 'gStopMotion', cat: 'motion', en: 'Stop motion', ar: 'ستوب موشن', d: [['f', 'floor(T*8)'], ['z', '1+a*0.06']], x: '0.5+(U-0.5)/z+(rnd(f)-0.5)*a*0.05', y: '0.5+(V-0.5)/z+(rnd(f+3.1)-0.5)*a*0.05' },
    { id: 'gSpin', cat: 'motion', en: 'Spin', ar: 'لفّ مستمر', d: [['ang', 'a*T*1.2'], ['zc', 'hypot(AR,1)/min(AR,1)'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'gSwing', cat: 'motion', en: 'Swing', ar: 'مرجحة', d: [['ang', 'a*0.2*sin(3.77*T)'], ['zc', '1+a*0.2*max(AR,1/AR)'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'gJello', cat: 'motion', en: 'Jello', ar: 'جيلي', d: [['z', '1+a*0.05']], x: '0.5+(U-0.5)/z+a*0.02*sin(V*20+T*30)', y: '0.5+(V-0.5)/z' },
    { id: 'gScroll', cat: 'motion', en: 'Endless slide', ar: 'تزحلق مستمر', x: 'fr(U+T*a*0.3)' },
    { id: 'gScrollUp', cat: 'motion', en: 'Endless rise', ar: 'طلوع مستمر', y: 'fr(V+T*a*0.3)' },
    { id: 'gZoomSteps', cat: 'motion', en: 'Zoom steps', ar: 'زووم درجات', d: [['z', '1+a*0.1*floor(fr(T*0.5)*4)']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'gVertigo', cat: 'motion', en: 'Vertigo', ar: 'دوخة', d: [['w', '0.5-0.5*cos(2.094*T)'], ['z', '1+a*0.35*w*(1-PR*1.4)+a*0.2']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'gStretchBeat', cat: 'motion', en: 'Stretch beat', ar: 'مطّ على الإيقاع', d: [['s', '1+a*0.15*pow(max(0,sin(6.2832*T)),8)']], x: '0.5+(U-0.5)/s', y: '0.5+(V-0.5)/(1+(s-1)*0.3)' },
    // distort
    { id: 'gFisheye', cat: 'distort', en: 'Fisheye', ar: 'عين السمكة', d: [['k', '1+a*0.8*PR*PR']], x: '0.5+PX/k/AR', y: '0.5+PY/k' },
    { id: 'gPincushion', cat: 'distort', en: 'Pincushion', ar: 'وسادة', d: [['k', '(1+a*0.5*PR*PR)/(1+a*0.5*0.33)']], x: '0.5+PX*k/AR', y: '0.5+PY*k' },
    { id: 'gUnderwater', cat: 'distort', en: 'Underwater', ar: 'تحت الماية', d: [['z', '1+a*0.04']], x: '0.5+(U-0.5)/z+a*0.012*sin(V*25+T*3)', y: '0.5+(V-0.5)/z+a*0.012*cos(U*20+T*2.5)', c: 'mix(C,C*pick(0.8,0.97,1.12),a)' },
    { id: 'gHeatHaze', cat: 'distort', en: 'Heat haze', ar: 'سراب', x: 'U+a*0.006*sin(V*80-T*12)+a*0.004*sin(V*37+T*7)' },
    { id: 'gFrosted', cat: 'distort', en: 'Frosted glass', ar: 'زجاج مصنفر', d: [['gx', 'floor(U*160)'], ['gy', 'floor(V*160)']], x: 'U+(rnd(gx+gy*1.37)-0.5)*a*0.03', y: 'V+(rnd(gx*1.7+gy*0.71+5)-0.5)*a*0.03' },
    { id: 'gReeded', cat: 'distort', en: 'Reeded glass', ar: 'زجاج مضلّع', x: 'U+a*0.05*(fr(U*30)-0.5)' },
    { id: 'gShear', cat: 'distort', en: 'Shear', ar: 'ميلان', d: [['z', '1+a*0.3']], x: '0.5+(U-0.5)/z+(V-0.5)*a*0.2', y: '0.5+(V-0.5)/z' },
    { id: 'gWaveV', cat: 'distort', en: 'Flag wave', ar: 'علم بيرفرف', d: [['z', '1+a*0.07']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z+a*0.03*sin(U*12+T*3)' },
    { id: 'gZigzag', cat: 'distort', en: 'Zigzag', ar: 'زجزاج', d: [['z', '1+a*0.06']], x: '0.5+(U-0.5)/z+a*0.025*(abs(fr(V*10)-0.5)*4-1)', y: '0.5+(V-0.5)/z' },
    { id: 'gMelt', cat: 'distort', en: 'Melt', ar: 'سيحان', y: 'V-a*0.25*V*rnd(floor(U*90))' },
    { id: 'gStairs', cat: 'distort', en: 'Stairs', ar: 'سلالم', x: 'U+(floor(V*8)/8-0.4375)*a*0.2' },
    { id: 'gTunnel', cat: 'distort', en: 'Tunnel', ar: 'نفق', x: 'fr(PA/6.2832+0.5)', y: 'fr(0.12/max(PR,0.01)+T*a*0.6)' },
    { id: 'gTinyPlanet', cat: 'distort', en: 'Tiny planet', ar: 'كوكب صغير', x: 'mix(U,fr(PA/6.2832+0.75),a)', y: 'mix(V,clip(1-PR*1.8,0,1),a)' },
    // mirror
    { id: 'gMirrorDiag', cat: 'mirror', en: 'Diagonal mirror', ar: 'مراية مايلة', x: 'sel(gt(U,V),V,U)', y: 'sel(gt(U,V),U,V)' },
    { id: 'gKaleido6', cat: 'mirror', en: 'Kaleidoscope 6', ar: 'كاليدوسكوب ٦', d: [['aa', 'abs(mod(PA+T*a*0.5,1.0472)-0.5236)']], x: '0.5+PR*cos(aa)/AR', y: '0.5+PR*sin(aa)' },
    { id: 'gMirrorTiles', cat: 'mirror', en: 'Mirror tiles', ar: 'مرايات مكررة', d: [['n', '1+floor(a*3.99)']], x: '1-abs(mod(U*n,2)-1)', y: '1-abs(mod(V*n,2)-1)' },
    { id: 'gFlipH', cat: 'mirror', en: 'Flip sideways', ar: 'قلب أفقي', x: '1-U' },
    { id: 'gFlipV', cat: 'mirror', en: 'Upside down', ar: 'مقلوب', y: '1-V' },
    // glitch
    { id: 'gBlockShift', cat: 'glitch', en: 'Block shift', ar: 'إزاحة بلوكات', d: [['h', 'rnd(floor(V*20)+floor(T*10)*7.3)']], x: 'U+sel(gt(h,1-a*0.3),(rnd(h*13)-0.5)*0.3,0)' },
    { id: 'gScanJitter', cat: 'glitch', en: 'Line jitter', ar: 'سطور بتترعش', x: 'U+a*0.012*(rnd(floor(V*300)+floor(T*30)*3.1)-0.5)' },
    { id: 'gVRoll', cat: 'glitch', en: 'Vertical roll', ar: 'صورة بتلف', d: [['r', 'fr(V+T*a*0.6)']], y: 'r', c: 'C*sstep(0,0.03,r)' },
    { id: 'gRgbWave', cat: 'glitch', en: 'RGB wave', ar: 'موجة ألوان', x: 'U+pick(1,0,-1)*a*0.012*sin(V*30+T*5)' },
    { id: 'gAberration', cat: 'glitch', en: 'Lens aberration', ar: 'زيغ عدسة', d: [['k', '1+pick(-1,0,1)*a*0.03*PR']], x: '0.5+(U-0.5)*k', y: '0.5+(V-0.5)*k' },
    { id: 'gRgbJitter', cat: 'glitch', en: 'RGB jitter', ar: 'ألوان بتترعش', d: [['f', 'floor(T*10)']], x: 'U+(rnd(f+pick(0,7,13))-0.5)*a*0.03', y: 'V+(rnd(f+pick(3,9,17))-0.5)*a*0.02' },
    { id: 'gAnaglyph', cat: 'glitch', en: '3D glasses', ar: 'نضارة 3D', x: 'U+pick(-1,1,1)*a*0.012', c: 'L' },
    { id: 'gStatic', cat: 'glitch', en: 'TV static', ar: 'تشويش', c: 'mix(C,rnd(floor(U*320)*1.3+floor(V*560)*0.7+floor(T*24)*5.1),a*0.6)' },
    { id: 'gDigital', cat: 'glitch', en: 'Digital blocks', ar: 'بلوكات ديجيتال', d: [['bx', 'floor(U*24)'], ['by', 'floor(V*40)'], ['on', 'gt(rnd(bx*0.37+by*1.31+floor(T*8)*2.7),1-a*0.3)']], x: 'sel(on,(bx+0.5)/24,U)', y: 'sel(on,(by+0.5)/40,V)', c: 'sel(on,floor(C*4+0.5)/4,C)' },
    { id: 'gBadTV', cat: 'glitch', en: 'Bad TV', ar: 'تلفزيون بايظ', x: 'U+a*0.02*sin(V*6+T*4)*sin(T*1.3)+a*0.01*(rnd(floor(V*200)+floor(T*30))-0.5)', c: 'C*(1-a*0.15+a*0.15*sin(V*600))+(rnd(floor(U*300)+floor(V*500)*1.3+floor(T*24))-0.5)*a*0.2' },
    { id: 'gVhsTrack', cat: 'retro', en: 'VHS tracking', ar: 'تراكينج VHS', d: [['bn', 'sstep(0.06,0,abs(V-fr(T*0.3)*1.2+0.1))'], ['j', 'rnd(floor(V*200)+floor(T*30))']], x: 'U+bn*a*0.12*(j-0.5)', c: 'C+bn*a*0.35*(j-0.3)' },
    // colour
    { id: 'gSolarize', cat: 'color', en: 'Solarize', ar: 'سولارايز', c: 'mix(C,sel(gt(C,0.5),1-C,C)*1.6,a)' },
    { id: 'gXray', cat: 'color', en: 'X-ray', ar: 'أشعة إكس', c: 'mix(C,(1-L)*pick(0.75,0.9,1.1),a)' },
    { id: 'gInfrared', cat: 'color', en: 'Infrared', ar: 'أشعة تحت الحمرا', c: 'mix(C,pick(G0*1.2,R0*0.4+B0*0.2,B0*0.7+G0*0.2),a)' },
    { id: 'gSwapRB', cat: 'color', en: 'Swap colours', ar: 'بدّل الألوان', c: 'mix(C,pick(B0,G0,R0),a)' },
    { id: 'gThermal', cat: 'color', en: 'Thermal', ar: 'حراري', c: 'mix(C,clip(pick(1.6*L-0.25,2.2*L*L-0.2,abs(sin(L*3.77))*(1-L*0.6)),0,1),a)' },
    { id: 'gCyber', cat: 'color', en: 'Cyberpunk', ar: 'سايبربانك', c: 'C+a*(pick(0.25,-0.08,0.3)*(1-L)+pick(-0.05,0.2,0.25)*L)' },
    { id: 'gBleach', cat: 'color', en: 'Bleach bypass', ar: 'مبيّض', c: 'mix(C,clip((L+(C-L)*0.4-0.5)*1.4+0.5,0,1),a)' },
    { id: 'gRainbow', cat: 'color', en: 'Rainbow flow', ar: 'قوس قزح ماشي', d: [['Y', '0.299*R0+0.587*G0+0.114*B0'], ['I', '0.596*R0-0.274*G0-0.322*B0'], ['Q', '0.211*R0-0.523*G0+0.312*B0'], ['h', '6.2832*(U*0.7+T*0.25)'], ['I2', 'cos(h)*I-sin(h)*Q'], ['Q2', 'sin(h)*I+cos(h)*Q']],
      c: 'mix(C,Y+pick(0.956*I2+0.621*Q2,-0.272*I2-0.647*Q2,-1.106*I2+1.703*Q2),a)' },
    { id: 'gTechnicolor', cat: 'color', en: 'Two-strip colour', ar: 'تكنيكلر', c: 'mix(C,pick(R0*1.1,(G0+B0)*0.55,(G0+B0)*0.55),a)' },
    { id: 'gNegFilm', cat: 'color', en: 'Film negative', ar: 'نيجاتيف فيلم', c: 'mix(C,(1-C)*pick(1,0.75,0.55),a)' },
    { id: 'gChrome', cat: 'color', en: 'Chrome', ar: 'كروم', c: 'mix(C,abs(sin(L*9.42))*pick(0.9,0.95,1),a)' },
    { id: 'gGold', cat: 'color', en: 'Gold', ar: 'دهبي', c: 'mix(C,mix(pick(0.1,0.05,0),pick(1,0.85,0.4),L),a)' },
    { id: 'gIce', cat: 'color', en: 'Ice', ar: 'تلج', c: 'mix(C,L*pick(0.7,0.9,1.15)+0.05,a)' },
    { id: 'gWarhol', cat: 'color', en: 'Pop art 4', ar: 'بوب آرت', d: [['t', 'floor(U*2)+2*floor(V*2)'], ['on', 'step(0.45,L)']], x: 'fr(U*2)', y: 'fr(V*2)',
      c: 'mix(C,sel(lt(t,0.5),mix(pick(0.2,0.05,0.4),pick(1,0.2,0.6),on),sel(lt(t,1.5),mix(pick(0.05,0.2,0.4),pick(0.1,0.85,1),on),sel(lt(t,2.5),mix(pick(0.4,0.1,0.05),pick(1,0.9,0.1),on),mix(pick(0.05,0.3,0.1),pick(0.5,1,0.3),on)))),a)' },
    // light
    { id: 'gFlicker', cat: 'light', en: 'Flicker', ar: 'رعشة نور', c: 'C*(1-a*0.35*rnd(floor(T*24)))' },
    { id: 'gSpotlight', cat: 'light', en: 'Spotlight', ar: 'سبوت لايت', c: 'C*(1-a*0.85*sstep(0.12,0.42,hypot(PX-0.25*sin(T*0.8),PY-0.15*sin(T*1.1))))' },
    { id: 'gLeak', cat: 'light', en: 'Light leak', ar: 'تسريب ضوء', c: 'C+a*pick(1,0.45,0.15)*exp(-hypot(PX-0.5*sin(T*0.5),PY+0.3)*3)*1.3' },
    { id: 'gSunset', cat: 'light', en: 'Sunset glow', ar: 'وهج الغروب', d: [['g', 'mix(pick(1,0.55,0.2),pick(0.55,0.1,0.6),V)']], c: '1-(1-C)*(1-g*a*0.6)' },
    { id: 'gPulseLight', cat: 'light', en: 'Light pulse', ar: 'نبضة نور', c: 'C*(1+a*0.6*pow(max(0,sin(12.566*T)),6))' },
    // art
    { id: 'gHatch', cat: 'art', en: 'Cross hatch', ar: 'تظليل قلم', d: [['s1', 'fr((PX+PY)*70)'], ['s2', 'fr((PX-PY)*70)'], ['ink', 'max(lt(s1,0.5*(1-L*1.6)),lt(s2,0.5*(0.6-L*1.6)))']], c: 'mix(C,1-ink*0.9,a)' },
    { id: 'gWoodcut', cat: 'art', en: 'Woodcut', ar: 'حفر خشب', c: 'mix(C,step(0.5+0.5*sin(PY*300+L*8),L),a)' },
    { id: 'gStipple', cat: 'art', en: 'Stipple', ar: 'تنقيط', c: 'mix(C,step(rnd(floor(U*AR*500)*1.1+floor(V*500)*0.37),L),a)' },
    { id: 'gMosaic', cat: 'art', en: 'Mosaic tiles', ar: 'موزاييك', d: [['n', '60-a*45'], ['fx', 'fr(U*n*AR)'], ['fy', 'fr(V*n)'], ['g', 'sstep(0,0.07,min(fx,fy))*(1-sstep(0.93,1,max(fx,fy)))']], x: '(floor(U*n*AR)+0.5)/(n*AR)', y: '(floor(V*n)+0.5)/n', c: 'C*(0.35+0.65*g)' },
    { id: 'gLed', cat: 'art', en: 'LED wall', ar: 'شاشة ليد', d: [['n', '140-a*100']], x: '(floor(U*n*AR)+0.5)/(n*AR)', y: '(floor(V*n)+0.5)/n', c: 'C*sstep(0.48,0.34,hypot(fr(U*n*AR)-0.5,fr(V*n)-0.5))*1.3' },
    // retro
    { id: 'gGameboy', cat: 'retro', en: 'Game console', ar: 'جيم بوي', d: [['n', '160-a*100'], ['q', 'floor(clip(L,0,0.999)*4)/3']], x: '(floor(U*n*AR)+0.5)/(n*AR)', y: '(floor(V*n)+0.5)/n', c: 'mix(pick(0.06,0.22,0.06),pick(0.61,0.74,0.06),q)' },
    { id: 'g8bit', cat: 'retro', en: '8-bit', ar: '٨ بت', d: [['n', '120-a*80']], x: '(floor(U*n*AR)+0.5)/(n*AR)', y: '(floor(V*n)+0.5)/n', c: 'floor(C*4+0.5)/4' },
    { id: 'gCrt', cat: 'retro', en: 'CRT screen', ar: 'شاشة قديمة', d: [['k', 'floor(fr(U*240*AR)*3)'], ['msk', 'sel(lt(abs(k-pick(0,1,2)),0.5),1,0.45)']], c: 'mix(C,C*msk*(0.8+0.2*sin(V*1696))*1.3,a)' },
    { id: 'gSecurity', cat: 'retro', en: 'Security camera', ar: 'كاميرا مراقبة', c: 'mix(C,L*pick(0.85,1,0.85)*(0.9+0.1*sin(V*1600))+(rnd(floor(U*300)+floor(V*520)*1.3+floor(T*24))-0.5)*0.1,a)' },
    { id: 'gFilmGate', cat: 'retro', en: 'Old projector', ar: 'بروجكتور قديم', y: 'V+a*0.004*sin(T*25)', c: 'C*(1-a*0.15*rnd(floor(T*24)))*(1-a*0.5*sstep(0.35,0.75,PR))' },
    { id: 'gScratches', cat: 'retro', en: 'Film scratches', ar: 'خدوش فيلم', d: [['f', 'floor(T*24)'], ['ln', 'sstep(0.002,0,abs(U-rnd(f)))+sstep(0.0015,0,abs(U-rnd(f+7)))*gt(rnd(f+3),0.5)']], c: 'C*(1-clip(ln,0,1)*a*0.7)' },
    { id: 'gDust', cat: 'retro', en: 'Dust', ar: 'تراب', d: [['ix', 'floor(U*AR*60)'], ['iy', 'floor(V*60)']], c: 'C*(1-gt(rnd(ix*1.3+iy*7.1+floor(T*12)*3.7),0.995-a*0.012)*0.8)' },
    // overlays
    { id: 'gSnow', cat: 'overlay', en: 'Snow', ar: 'تلج نازل', d: [['cx', 'U*AR*14+0.3*sin(T+V*3)'], ['cy', 'V*14-T*1.5'], ['ix', 'floor(cx)'], ['iy', 'floor(cy)']],
      c: 'C+sstep(0.12,0.04,hypot(fr(cx)-rnd(ix*7.1+iy*3.3),fr(cy)-rnd(ix*1.9+iy*5.7)))*gt(rnd(ix+iy*9.1),0.4)*a*1.2' },
    { id: 'gRain', cat: 'overlay', en: 'Rain', ar: 'مطر', d: [['cx', 'U*AR*40'], ['cy', 'V*6-T*10'], ['r', 'rnd(floor(cx)*3.1+floor(cy)*7.7)']], c: 'C*(1-a*0.15)+sstep(0.08,0,abs(fr(cx)-r))*sstep(0,0.6,fr(cy))*gt(r,0.5)*a*0.6' },
    { id: 'gSparkle', cat: 'overlay', en: 'Sparkles', ar: 'لمعة نجوم', d: [['cx', 'U*AR*20'], ['cy', 'V*20'], ['id', 'floor(cx)*1.7+floor(cy)*9.3']],
      c: 'C+exp(-hypot(fr(cx)-rnd(id),fr(cy)-rnd(id+2.1))*40)*pow(max(0,sin(T*4+rnd(id+5)*6.28)),6)*gt(rnd(id+7.3),0.7)*a*2' },
    { id: 'gConfetti', cat: 'overlay', en: 'Confetti', ar: 'كونفيتي', d: [['cx', 'U*AR*12+0.5*sin(T*0.7+V*4)'], ['cy', 'V*12-T*2'], ['id', 'floor(cx)*2.3+floor(cy)*5.1']],
      c: 'mix(C,0.4+0.6*rnd(id+pick(1,2,3)),clip(lt(max(abs(fr(cx)-rnd(id)),abs(fr(cy)-rnd(id+3.3))),0.08)*gt(rnd(id+5.7),0.5)*a*2,0,1))' },
    { id: 'gBubbles', cat: 'overlay', en: 'Bubbles', ar: 'فقاعات', d: [['cx', 'U*AR*8'], ['cy', 'V*8+T*1.2'], ['id', 'floor(cx)*3.7+floor(cy)*1.3']],
      c: 'C+sstep(0.03,0,abs(hypot(fr(cx)-0.5,fr(cy)-0.5)-0.15-0.2*rnd(id)))*gt(rnd(id+4.4),0.45)*a*0.8' },
    { id: 'gGrid', cat: 'overlay', en: 'Grid lines', ar: 'شبكة', d: [['ln', 'max(sstep(0.05,0,fr(U*AR*12)),sstep(0.05,0,fr(V*12)))']], c: 'mix(C,pick(0.4,0.85,1),ln*a*0.6)' },
    { id: 'gStripes', cat: 'overlay', en: 'Moving stripes', ar: 'خطوط ماشية', c: 'C*(1-step(0.5,fr((PX+PY)*8+T*a))*a*0.3)' },
    // ---- second batch (h*): motion
    { id: 'hHandheld', cat: 'motion', en: 'Handheld', ar: 'كاميرا في الإيد', d: [['z', '1+a*0.06']], x: '0.5+(U-0.5)/z+a*0.012*(sin(T*1.3)+0.5*sin(T*2.9+1))', y: '0.5+(V-0.5)/z+a*0.01*(sin(T*1.7+2)+0.5*sin(T*3.7))' },
    { id: 'hPunch', cat: 'motion', en: 'Punch in', ar: 'ضربة زووم', d: [['z', '1+a*0.15*exp(-fr(T*1.2)*6)']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'hTiltSnap', cat: 'motion', en: 'Dutch snaps', ar: 'ميلة بتتنطط', d: [['s', 'sstep(0.35,0.5,fr(T*0.5))-sstep(0.85,1,fr(T*0.5))'], ['ang', 'a*0.24*(s-0.5)'], ['zc', '1+a*0.14*max(AR,1/AR)'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'hPanScan', cat: 'motion', en: 'Pan and scan', ar: 'بان يمين وشمال', d: [['z', '1+a*0.3']], x: '0.5+(U-0.5)/z+(1-1/z)*0.5*sin(T*0.8)', y: '0.5+(V-0.5)/z' },
    { id: 'hKenBurns', cat: 'motion', en: 'Ken Burns', ar: 'كين بيرنز', d: [['z', '1+a*0.25*(0.5-0.5*cos(T*0.4))']], x: '0.5+(U-0.5)/z+(1-1/z)*0.3', y: '0.5+(V-0.5)/z-(1-1/z)*0.2' },
    { id: 'hSquash', cat: 'motion', en: 'Squash and stretch', ar: 'ضغط ومط', d: [['s', 'a*0.07*sin(T*6)']], x: '0.5+(U-0.5)/(1+a*0.07+s)', y: '1-(1-V)/(1+a*0.07-s)' },
    { id: 'hPitch', cat: 'motion', en: 'Tilt back', ar: 'ميلة لورا', d: [['w', '1+a*0.25*sin(T*1.5)*(V-0.5)'], ['z', '1+a*0.15']], x: '0.5+(U-0.5)/(w*z)', y: '0.5+(V-0.5)/z' },
    { id: 'hYaw', cat: 'motion', en: 'Side turn', ar: 'لفة جانبية', d: [['w', '1+a*0.3*sin(T*1.2)*(U-0.5)'], ['z', '1+a*0.2']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/(w*z)' },
    { id: 'hImpact', cat: 'motion', en: 'Impact shake', ar: 'هزة خبطة', d: [['m', 'a*0.04*exp(-fr(T*0.7)*5)'], ['z', '1+a*0.1']], x: '0.5+(U-0.5)/z+m*sin(T*83)', y: '0.5+(V-0.5)/z+m*cos(T*71)' },
    { id: 'hFigure8', cat: 'motion', en: 'Figure eight', ar: 'رقم تمانية', d: [['z', '1+a*0.1']], x: '0.5+(U-0.5)/z+a*0.035*sin(T*1.6)', y: '0.5+(V-0.5)/z+a*0.03*sin(T*3.2)' },
    { id: 'hHanging', cat: 'motion', en: 'Hanging sign', ar: 'يافطة متعلقة', d: [['ang', 'a*0.12*sin(T*2.5)'], ['zc', '1+a*0.3'], ['qx', 'PX*cos(ang)-V*sin(ang)'], ['qy', 'PX*sin(ang)+V*cos(ang)']], x: '0.5+qx/zc/AR', y: '0.5+(qy-0.5)/zc' },
    { id: 'hTwistZoom', cat: 'motion', en: 'Twist zoom', ar: 'زووم ملفوف', d: [['w', 'sin(T*2)'], ['ang', 'a*0.25*w'], ['zc', '1+a*(0.52+0.1*w)'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'hParallax', cat: 'motion', en: 'Parallax slide', ar: 'تزحلق بعمق', x: 'fr(U+T*a*(0.05+0.3*V*V))' },
    { id: 'hBoat', cat: 'motion', en: 'Boat rock', ar: 'مركب بيتهز', d: [['ang', 'a*0.06*sin(T*1.4)'], ['zc', '1+a*0.18'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy+a*0.02*sin(T*1.4+1.5)' },
    { id: 'hRumble', cat: 'motion', en: 'Rumble', ar: 'رجّة', d: [['z', '1+a*0.04']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z+a*0.012*sin(T*90)*sin(T*6.3)' },
    { id: 'hReframe', cat: 'motion', en: 'Reframe jumps', ar: 'تكوين بيتغير', d: [['f', 'floor(T*0.8)'], ['z', '1+a*0.4']], x: '0.5+(U-0.5)/z+(rnd(f)-0.5)*(1-1/z)', y: '0.5+(V-0.5)/z+(rnd(f+4.7)-0.5)*(1-1/z)' },
    { id: 'hWhipLoop', cat: 'motion', en: 'Whip pans', ar: 'لفات سريعة', x: 'fr(U+(floor(T*0.5)+sstep(0.8,1,fr(T*0.5)))*(0.25+0.75*a))' },
    { id: 'hCardFlip', cat: 'motion', en: 'Card flip', ar: 'قلب كارت', d: [['cc', 'cos(sstep(0.75,1,fr(T*(0.15+0.4*a)))*6.2832)'], ['xx', '0.5+(U-0.5)/(sel(gt(cc,0),1,-1)*max(abs(cc),0.02))']], x: 'xx', c: 'C*lt(abs(xx-0.5),0.5)' },
    { id: 'hRollShutter', cat: 'motion', en: 'Rolling shutter', ar: 'شتر مايل', d: [['z', '1+a*0.08']], x: '0.5+(U-0.5)/z+a*0.06*sin(T*7)*(V-0.5)', y: '0.5+(V-0.5)/z' },
    { id: 'hSpring', cat: 'motion', en: 'Spring zoom', ar: 'زووم سوستة', d: [['f', 'fr(T*0.5)*2'], ['z', '1+a*0.14*abs(sin(f*10))*exp(-f*2.5)']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'hClockTick', cat: 'motion', en: 'Clock ticks', ar: 'تكات ساعة', d: [['ang', 'a*0.1*(floor(T)+sstep(0,0.12,fr(T)))'], ['zc', 'hypot(AR,1)/min(AR,1)'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'hRotShake', cat: 'motion', en: 'Spin shake', ar: 'هزة لف', d: [['ang', 'a*0.05*sin(T*31)*sin(T*5)'], ['zc', '1+a*0.06*max(AR,1/AR)+a*0.01'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'hShiver', cat: 'motion', en: 'Shiver', ar: 'رعشة', d: [['z', '1+a*0.03+a*0.012*sin(T*60)']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'hStepSlide', cat: 'motion', en: 'Step slide', ar: 'تزحلق خطوات', x: 'fr(U+(floor(T)+sstep(0.7,1,fr(T)))*(0.1+0.4*a))' },
    { id: 'hPushIn', cat: 'motion', en: 'Slow push in', ar: 'دخول بطيء', d: [['z', '1+min(T*a*0.05,a*0.6)']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'hPullOut', cat: 'motion', en: 'Slow pull out', ar: 'خروج بطيء', d: [['z', '1+max(a*0.5-T*a*0.05,0)']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z' },
    { id: 'hSlowPan', cat: 'motion', en: 'Slow pan', ar: 'بان بطيء', d: [['z', '1+a*0.3']], x: '0.5+(U-0.5)/z+(1-1/z)*(min(T*0.08,1)-0.5)', y: '0.5+(V-0.5)/z' },
    { id: 'hWalkCam', cat: 'motion', en: 'Walking camera', ar: 'كاميرا ماشية', d: [['z', '1+a*0.08'], ['ang', 'a*0.012*sin(T*2.5)'], ['qx', '(PX*cos(ang)-PY*sin(ang))/z'], ['qy', '(PX*sin(ang)+PY*cos(ang))/z']], x: '0.5+qx/AR+a*0.008*sin(T*2.5)', y: '0.5+qy+a*0.014*(abs(sin(T*5))-0.5)' },
    // distort
    { id: 'hOrb', cat: 'distort', en: 'Glass orb', ar: 'كورة إزاز', d: [['k', 'sqrt(max(1-PR*PR/0.1444,0))'], ['f', '1-a*0.6*k']], x: '0.5+PX*f/AR', y: '0.5+PY*f', c: 'C*(1+a*0.25*k-a*0.2*gt(PR,0.38))+sstep(0.012,0,abs(PR-0.38))*a*0.5' },
    { id: 'hWetWindow', cat: 'distort', en: 'Wet window', ar: 'شباك مبلول', d: [['cx', 'floor(U*AR*14)'], ['yy', 'fr(V*2-T*(0.3+rnd(cx))*0.3+rnd(cx+3))'], ['w', 'sstep(0.5,0,abs(fr(U*AR*14)-0.5))*sstep(0.6,0.2,yy)*gt(rnd(cx+8),0.55)']], x: 'U+w*a*0.02', y: 'V-w*a*0.03', c: 'C*(1+w*a*0.15)' },
    { id: 'hBugEye', cat: 'distort', en: 'Bug eye', ar: 'عين حشرة', d: [['gy', 'V*7'], ['gx', 'U*AR*7+0.5*mod(floor(V*7),2)'], ['fx', 'fr(gx)-0.5'], ['fy', 'fr(gy)-0.5']], x: 'mix(U,0.5+fx*1.1,a)', y: 'mix(V,0.5+fy*1.1,a)', c: 'C*(1-a*0.85*sstep(0.38,0.5,hypot(fx,fy)))' },
    { id: 'hGlassBlocks', cat: 'distort', en: 'Glass blocks', ar: 'طوب إزاز', d: [['fx', 'fr(U*AR*7)-0.5'], ['fy', 'fr(V*7)-0.5']], x: 'U-fx*a*0.06/AR', y: 'V-fy*a*0.06', c: 'C*(1+a*0.3*(fy*0.6-fx*0.4)-a*0.4*sstep(0.42,0.5,max(abs(fx),abs(fy))))' },
    { id: 'hCenterStretch', cat: 'distort', en: 'Centre stretch', ar: 'مط من النص', x: '0.5+(U-0.5)*pow(abs(U-0.5)*2,a*0.8)' },
    { id: 'hBend', cat: 'distort', en: 'Smile bend', ar: 'انحناء', d: [['z', '1+a*0.15']], x: '0.5+(U-0.5)/z', y: '0.5+(V-0.5)/z-a*0.12*((U-0.5)*(U-0.5)*4-0.33)*sin(T*1.2)' },
    { id: 'hTwist', cat: 'distort', en: 'Twist', ar: 'لفة حلزون', d: [['ang', 'a*1.2*PY*sin(T*1.2)'], ['zc', '1+a*0.6'], ['qx', '(PX*cos(ang)-PY*sin(ang))/zc'], ['qy', '(PX*sin(ang)+PY*cos(ang))/zc']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'hShatter', cat: 'distort', en: 'Shattered glass', ar: 'إزاز مكسور', d: [['gx', 'U*AR*5'], ['gy', 'V*4'], ['tr', 'gt(fr(gx)+fr(gy)*0.7,0.85)'], ['id', 'floor(gx)*3.1+floor(gy)*7.7+tr*1.9']], x: 'U+(rnd(id)-0.5)*a*0.04', y: 'V+(rnd(id+2.2)-0.5)*a*0.04', c: 'C*(0.9+0.2*rnd(id+5))*(1-a*0.6*sstep(0.03,0,min(min(fr(gx),fr(gy)),abs(fr(gx)+fr(gy)*0.7-0.85))))' },
    { id: 'hTiltTiles', cat: 'distort', en: 'Tilted tiles', ar: 'بلاط مايل', d: [['cx', 'floor(U*AR*6)'], ['cy', 'floor(V*6)'], ['an', '(rnd(cx+cy*7.3)-0.5)*a*1.3'], ['fx', 'fr(U*AR*6)-0.5'], ['fy', 'fr(V*6)-0.5']], x: '(cx+0.5+fx*cos(an)-fy*sin(an))/(AR*6)', y: '(cy+0.5+fx*sin(an)+fy*cos(an))/6', c: 'C*(1-0.85*gt(max(abs(fx*cos(an)+fy*sin(an)),abs(fy*cos(an)-fx*sin(an))),0.4))' },
    { id: 'hScanLens', cat: 'distort', en: 'Scanner lens', ar: 'عدسة ماسحة', d: [['dy', 'V-0.5-0.4*sin(T*1.1)'], ['w', 'exp(-dy*dy*90)']], y: 'V-dy*w*a*0.5', c: 'C*(1+w*a*0.15)' },
    { id: 'hPleats', cat: 'distort', en: 'Pleats', ar: 'كسرات', d: [['f', 'fr(U*10)']], x: '(floor(U*10)+f+a*0.06*sin(f*6.2832))/10', c: 'C*(1-a*0.3*sin(f*6.2832))' },
    { id: 'hWhirlpools', cat: 'distort', en: 'Whirlpools', ar: 'دوامات', d: [['fx', 'fr(U*2)-0.5'], ['fy', 'fr(V*2)-0.5'], ['ang', 'a*10*max(0.4-hypot(fx*AR,fy),0)*sin(T+1)']], x: '(floor(U*2)+0.5+(fx*AR*cos(ang)-fy*sin(ang))/AR)/2', y: '(floor(V*2)+0.5+fx*AR*sin(ang)+fy*cos(ang))/2' },
    { id: 'hRings', cat: 'distort', en: 'Rotating rings', ar: 'حلقات بتلف', d: [['ang', 'a*0.5*sin(T*1.3)*(mod(floor(PR*8),2)*2-1)'], ['qx', 'PX*cos(ang)-PY*sin(ang)'], ['qy', 'PX*sin(ang)+PY*cos(ang)']], x: '0.5+qx/AR', y: '0.5+qy', c: 'C*(1-a*0.4*sstep(0.42,0.5,abs(fr(PR*8)-0.5)))' },
    { id: 'hSectors', cat: 'distort', en: 'Sector shift', ar: 'شرايح دايرية', d: [['s', 'floor((PA+3.1416)*1.9099)'], ['k', '(PR+a*0.06*sin(T*2+s*1.7))/max(PR,0.001)']], x: '0.5+PX*k/AR', y: '0.5+PY*k' },
    { id: 'hSilk', cat: 'distort', en: 'Silk', ar: 'حرير', d: [['w', 'U*8+V*5+T*2'], ['z', '1+a*0.05']], x: '0.5+(U-0.5)/z+sin(w)*a*0.015', y: '0.5+(V-0.5)/z+sin(w)*a*0.01', c: 'C*(1+a*0.18*cos(w))' },
    { id: 'hInsideOut', cat: 'distort', en: 'Inside out', ar: 'جوه برة', d: [['k', 'mix(1,sel(lt(PR,0.75),min((0.75-PR)/max(PR,0.001),3),1),a)']], x: '0.5+PX*k/AR', y: '0.5+PY*k' },
    { id: 'hRollBubble', cat: 'distort', en: 'Rolling bubble', ar: 'فقاعة ماشية', d: [['cx', 'fr(T*0.15+0.35)*(AR+0.8)-AR/2-0.4'], ['dx', 'PX-cx'], ['r', 'hypot(dx,PY)'], ['k', '1-a*0.6*sstep(0.35,0,r)']], x: '0.5+(cx+dx*k)/AR', y: '0.5+PY*k', c: 'C+sstep(0.015,0,abs(r-0.35))*a*0.4' },
    { id: 'hFunhouse', cat: 'distort', en: 'Funhouse mirror', ar: 'مراية ملاهي', d: [['s', '1+a*0.55*sin(U*7+T*0.6)']], x: '0.5+(U-0.5)/(1+a*0.1)', y: '0.5+(V-0.5)/(s+a*0.55)' },
    { id: 'hCylinder', cat: 'distort', en: 'Spinning cylinder', ar: 'أسطوانة بتلف', d: [['s', '(U-0.5)*2'], ['th', 'atan2(s,sqrt(max(1-s*s,0.0001)))']], x: 'fr(mix(U,0.5+th/3.1416,a)+T*0.08*a)', c: 'C*mix(1,sqrt(max(1-s*s,0))*0.7+0.3,a)' },
    { id: 'hGlobe', cat: 'distort', en: 'Globe', ar: 'كرة أرضية', d: [['r', '0.2+0.3*a'], ['s', 'PX/r'], ['t', 'PY/r'], ['z', 'sqrt(max(1-s*s-t*t,0.0001))']], x: 'fr(0.5+atan2(s,z)/6.2832+T*0.05)', y: '0.5+atan2(t,sqrt(max(1-t*t,0.0001)))/3.1416', c: 'C*gt(1-s*s-t*t,0)*(0.35+0.65*sqrt(z))' },
    { id: 'hHourglass', cat: 'distort', en: 'Hourglass', ar: 'ساعة رملية', d: [['xx', '0.5+(U-0.5)*(1+a*0.8*exp(-(V-0.5)*(V-0.5)*20))']], x: 'xx', c: 'C*lt(abs(xx-0.5),0.5)' },
    { id: 'hBubbleWrap', cat: 'distort', en: 'Bubble wrap', ar: 'بابل راب', d: [['fx', 'fr(U*AR*9)-0.5'], ['fy', 'fr(V*9)-0.5'], ['k', 'sstep(0.42,0.2,hypot(fx,fy))']], x: 'U-fx*k*a*0.05/AR', y: 'V-fy*k*a*0.05', c: 'C*(1+k*a*0.25*(0.3-fx-fy))' },
    { id: 'hPaperFold', cat: 'distort', en: 'Folded paper', ar: 'ورقة متطبقة', d: [['f', 'fr(U*3)'], ['sg', 'mod(floor(U*3),2)*2-1']], x: 'U+sg*a*0.01*sin(f*3.1416)', c: 'C*(1+a*0.22*sg*(f-0.5)+a*0.08*(fr(V*2)-0.5))-a*0.25*sstep(0.015,0,min(f,1-f))' },
    { id: 'hPageCurl', cat: 'distort', en: 'Page corner', ar: 'طرف ورقة', d: [['lc', '((1-U)*AR+(1-V))/1.414'], ['s', 'a*0.25*(1+0.15*sin(T*2))']], c: 'sel(lt(lc,s),0.08,sel(lt(lc,s*2),0.95-0.35*(s*2-lc)/max(s,0.01),C*(1-0.3*sstep(0.06,0,lc-s*2)*gt(s,0.001))))' },
    { id: 'hPuddle', cat: 'distort', en: 'Rain puddle', ar: 'مطر في بركة', d: [['gx', 'U*AR*5'], ['gy', 'V*5'], ['id', 'floor(gx)+floor(gy)*7.3'], ['ph', 'fr(T*0.8+rnd(id))'], ['r', 'hypot(fr(gx)-0.3-0.4*rnd(id+1),fr(gy)-0.3-0.4*rnd(id+2))'], ['w', 'sin((r-ph*0.5)*60)*sstep(0.06,0,abs(r-ph*0.5))*(1-ph)']], x: 'U+w*a*0.008', y: 'V+w*a*0.008', c: 'C*(1+w*a*0.2)' },
    // mirror
    { id: 'hKaleidoTunnel', cat: 'mirror', en: 'Kaleido tunnel', ar: 'نفق كاليدو', d: [['m', 'abs(mod(PA+3.1416,1.5708)-0.7854)'], ['r', '0.1+fr(PR*1.5-T*a*0.3)*0.5']], x: '0.5+r*cos(m)/AR', y: '0.5+r*sin(m)' },
    { id: 'hTriptych', cat: 'mirror', en: 'Zoom triptych', ar: 'تلت لقطات', d: [['z', '1+floor(U*3)*a*0.6'], ['f', 'fr(U*3)']], x: '0.5+(f-0.5)/3/z', y: '0.5+(V-0.5)/z', c: 'C*(1-0.85*sstep(0.012,0,min(f,1-f)))' },
    { id: 'hBrick', cat: 'mirror', en: 'Brick wall', ar: 'حيطة طوب', d: [['n', '2+floor(a*3)'], ['gy', 'V*n'], ['gx', 'U*n+0.5*mod(floor(V*n),2)']], x: 'fr(gx)', y: 'fr(gy)', c: 'C*(1-0.8*sstep(0.03,0,min(min(fr(gx),1-fr(gx)),min(fr(gy),1-fr(gy)))))' },
    { id: 'hFrameInFrame', cat: 'mirror', en: 'Frame in frame', ar: 'صورة جوة صورة', d: [['ins', 'lt(abs(U-0.5),0.275)*lt(abs(V-0.5),0.275)']], x: 'sel(ins,0.5+(U-0.5)/0.55,U)', y: 'sel(ins,0.5+(V-0.5)/0.55,V)', c: 'mix(sel(ins,C,C*(1-a*0.6)),1,lt(abs(max(abs(U-0.5),abs(V-0.5))-0.275),0.005))' },
    { id: 'hLake', cat: 'mirror', en: 'Lake reflection', ar: 'انعكاس بحيرة', d: [['lo', 'gt(V,0.6)']], x: 'sel(lo,U+a*0.004*sin(V*90+T*3),U)', y: 'sel(lo,0.6-(V-0.6)*1.2+a*0.006*sin(V*150-T*4),V)', c: 'sel(lo,C*pick(0.6,0.72,0.82),C)' },
    { id: 'hCheckerFlip', cat: 'mirror', en: 'Checker flip', ar: 'شطرنج مقلوب', d: [['n', '2+floor(a*4)'], ['fl', 'mod(floor(U*n)+floor(V*n),2)']], x: 'sel(fl,(floor(U*n)+1-fr(U*n))/n,U)', y: 'sel(fl,(floor(V*n)+1-fr(V*n))/n,V)' },
    { id: 'hStripFlip', cat: 'mirror', en: 'Strip flip', ar: 'شرايح مقلوبة', d: [['n', '6+floor(a*10)']], x: 'sel(mod(floor(U*n),2),(floor(U*n)+1-fr(U*n))/n,U)' },
    { id: 'hPinwheel', cat: 'mirror', en: 'Pinwheel', ar: 'مروحة', d: [['an', 'floor((PA+3.1416+T*a*0.4)/1.5708)*1.5708-T*a*0.4'], ['qx', '(PX*cos(an)+PY*sin(an))*0.55'], ['qy', '(PY*cos(an)-PX*sin(an))*0.55']], x: '0.5+qx/AR', y: '0.5+qy' },
    { id: 'hMovingMirror', cat: 'mirror', en: 'Moving mirror', ar: 'مراية ماشية', d: [['m', '0.5+0.3*a*sin(T*0.9)']], x: 'm-abs(U-m)' },
    { id: 'hTileMarquee', cat: 'mirror', en: 'Tile marquee', ar: 'بلاط ماشي', d: [['gx', 'U*3+T*a*0.4*(mod(floor(V*3),2)*2-1)']], x: 'fr(gx)', y: 'fr(V*3)' },
    { id: 'hSpinTiles', cat: 'mirror', en: 'Spinning copies', ar: 'نسخ بتلف', d: [['fx', 'fr(U*3)-0.5'], ['fy', 'fr(V*3)-0.5'], ['an', 'T*a*1.5*(mod(floor(U*3)+floor(V*3),2)*2-1)'], ['k', '0.98/hypot(AR,1)']], x: '0.5+(fx*AR*cos(an)-fy*sin(an))*k/AR', y: '0.5+(fx*AR*sin(an)+fy*cos(an))*k', c: 'C*(1-0.7*sstep(0.47,0.5,max(abs(fx),abs(fy))))' },
    { id: 'hMirrorPan', cat: 'mirror', en: 'Mirror pan', ar: 'بان مراية', x: '1-abs(fr((U-0.5)/(1+a*0.5)*0.5+T*0.06)*2-1)' },
    { id: 'hOpenBook', cat: 'mirror', en: 'Open book', ar: 'كتاب مفتوح', x: 'fr(U*2)', y: '0.5+(V-0.5)*(1+a*0.08*sstep(0.5,0,abs(U-0.5)))', c: 'C*(1-a*0.5*sstep(0.12,0,abs(U-0.5)))*(1-a*0.15*sstep(0.4,0.5,abs(U-0.5)))' },
    // glitch
    { id: 'hPixelSmear', cat: 'glitch', en: 'Pixel smear', ar: 'سحب بكسلات', d: [['ry', 'floor(V*30)'], ['f', 'mod(floor(T*10),50)'], ['x0', 'rnd(ry+f*2.1)']], x: 'sel(gt(rnd(ry*1.3+f),1-a*0.3)*gt(U,x0),x0,U)' },
    { id: 'hColorDrift', cat: 'glitch', en: 'Colour drift', ar: 'ألوان سايبة', x: 'U+a*0.012*sin(T*1.1+pick(0,2.1,4.2))', y: 'V+a*0.012*cos(T*0.9+pick(0,2.1,4.2))' },
    { id: 'hInterlace', cat: 'glitch', en: 'Interlaced', ar: 'سطور متداخلة', x: 'U+a*0.015*(mod(floor(V*240),2)*2-1)*sin(T*3)' },
    { id: 'hTear', cat: 'glitch', en: 'Screen tear', ar: 'شق في الشاشة', d: [['ty', 'fr(T*0.4)']], x: 'fr(U+gt(V,ty)*a*0.1)', c: 'C+0.5*a*sstep(0.006,0,abs(V-ty))' },
    { id: 'hSignalLoss', cat: 'glitch', en: 'Signal loss', ar: 'إشارة ضايعة', d: [['f', 'mod(floor(T*12),50)'], ['bad', 'gt(rnd(floor(V*24)*3.7+f*1.3),1-a*0.35)']], c: 'mix(C,rnd(floor(U*300)*1.7+floor(V*240)*3.1+f*7.7),bad)' },
    { id: 'hDropBlocks', cat: 'glitch', en: 'Dropped blocks', ar: 'بلوكات واقعة', d: [['bx', 'floor(U*AR*16)'], ['by', 'floor(V*16)'], ['f', 'mod(floor(T*8),50)'], ['on', 'gt(rnd(bx*1.3+by*7.1+f*3.3),1-a*0.15)']], c: 'mix(C,rnd(bx+by*2.3+f+K*1.3)*0.8,on)' },
    { id: 'hZoomGlitch', cat: 'glitch', en: 'Zoom glitch', ar: 'زووم متقطع', d: [['z', '1+a*0.35*gt(rnd(mod(floor(T*12),97)),0.82)']], x: '0.5+(U-0.5)/z+(z-1)*0.04*pick(-1,0,1)', y: '0.5+(V-0.5)/z' },
    { id: 'hFlipBands', cat: 'glitch', en: 'Flip bands', ar: 'شرايط مقلوبة', x: 'sel(gt(rnd(floor(V*12)*2.3+mod(floor(T*6),50)),1-a*0.4),1-U,U)' },
    { id: 'hCorrupt', cat: 'glitch', en: 'Corrupted colours', ar: 'ألوان بايظة', d: [['r', 'rnd(floor(U*AR*8)*3.1+floor(V*8)*1.7+mod(floor(T*5),50))']], c: 'sel(gt(r,1-a*0.4),sel(gt(r,0.93),pick(B0,R0,G0),pick(G0,B0,R0)),C)' },
    { id: 'hFrameJumps', cat: 'glitch', en: 'Frame jumps', ar: 'نطّات صورة', d: [['f', 'mod(floor(T*15),97)'], ['j', 'gt(rnd(f),1-a*0.25)']], x: 'fr(U+(rnd(f+1.3)-0.5)*0.15*j)', y: 'fr(V+(rnd(f+2.7)-0.5)*0.1*j)', c: 'sel(j,C*pick(1.2,0.9,1.1),C)' },
    { id: 'hHeadSwitch', cat: 'glitch', en: 'Head switching', ar: 'شوشرة تحت', d: [['b', 'sstep(0.9,1,V)'], ['f', 'mod(floor(T*30),60)']], x: 'U+b*a*0.06*(sin(V*400+T*50)*0.5+rnd(floor(V*200)+f))', c: 'C+b*a*0.3*rnd(floor(U*200)+floor(V*300)*1.7+f*3.7)' },
    { id: 'hLostSync', cat: 'glitch', en: 'Lost sync', ar: 'صورة مايلة', x: 'fr(U+V*a*0.4+T*a*0.15)' },
    { id: 'hColumnDrop', cat: 'glitch', en: 'Column drop', ar: 'عواميد نازلة', d: [['cx', 'floor(U*40)'], ['f', 'mod(floor(T*8),50)'], ['dy', 'gt(rnd(cx*1.9+f),1-a*0.3)*rnd(cx+f*3.3)*0.2']], y: 'V-dy', c: 'C*(1-lt(V,dy))' },
    { id: 'hChannelSwitch', cat: 'glitch', en: 'Channel switch', ar: 'تقليب قنوات', d: [['f', 'fr(T/3)'], ['on', 'lt(f,0.1*a)']], y: 'fr(V+on*f*8)', c: 'mix(C,rnd(floor(U*320)*1.3+floor(V*180)*2.9+mod(floor(T*30),40)*5.1),on)' },
    { id: 'hChannelBlocks', cat: 'glitch', en: 'Channel blocks', ar: 'بلوكات قنوات', d: [['on', 'gt(rnd(floor(U*AR*10)*2.1+floor(V*10)*5.3+mod(floor(T*6),50)),1-a*0.3)']], x: 'U+on*0.03*pick(1,0,-1)', y: 'V+on*0.02*pick(0,1,0)' },
    { id: 'hDeadLines', cat: 'glitch', en: 'Dead lines', ar: 'خطوط ميتة', d: [['cx', 'floor(U*AR*200)'], ['on', 'gt(rnd(cx*0.37+mod(floor(T*0.5),20)),1-a*0.03)']], c: 'sel(on,rnd(cx+K),C)' },
    { id: 'hBitRot', cat: 'glitch', en: 'Bit rot', ar: 'تلف بيتات', c: 'mix(C,fr(C*(1+floor(a*6))+T*0.1),a)' },
    { id: 'hDatabend', cat: 'glitch', en: 'Databend', ar: 'داتا بند', d: [['h', 'rnd(floor(V*60)+mod(floor(T*4),50))']], c: 'sel(gt(h,1-a*0.5),fr(C+h*0.5+K*0.33*h),C)' },
    { id: 'hPixelStretch', cat: 'glitch', en: 'Pixel stretch', ar: 'مط بكسلات', d: [['ly', '0.5+0.4*sin(T*0.8)']], y: 'sel(gt(V,ly),ly+(V-ly)*(1-a),V)' },
    { id: 'hBlockZoom', cat: 'glitch', en: 'Block zoom', ar: 'بلوكات مكبرة', d: [['bx', 'floor(U*AR*6)'], ['by', 'floor(V*6)'], ['z', '1+a*2*gt(rnd(bx*1.7+by*4.3+mod(floor(T*4),50)),0.75)']], x: '(bx+0.5+(fr(U*AR*6)-0.5)/z)/(AR*6)', y: '(by+0.5+(fr(V*6)-0.5)/z)/6' },
    // retro
    { id: 'hLcd', cat: 'retro', en: 'LCD pixels', ar: 'بكسلات LCD', d: [['n', '60+160*(1-a)']], x: '(floor(U*AR*n)+0.5)/(AR*n)', y: '(floor(V*n)+0.5)/n', c: 'C*(0.15+1.7*lt(abs(mod(floor(U*AR*n*3),3)-K),0.5))*(0.75+0.25*sstep(0.5,0.35,abs(fr(V*n)-0.5)))' },
    { id: 'hCga', cat: 'retro', en: 'CGA colours', ar: 'ألوان CGA', c: 'mix(C,sel(lt(L,0.25),0,sel(lt(L,0.5),pick(0.33,1,1),sel(lt(L,0.75),pick(1,0.33,1),1))),a)' },
    { id: 'hAmber', cat: 'retro', en: 'Amber monitor', ar: 'شاشة كهرماني', c: 'mix(C,L*pick(1,0.62,0.1)*1.3*(0.75+0.25*sin(V*600)),a)' },
    { id: 'hPolaroid', cat: 'retro', en: 'Polaroid', ar: 'بولارويد', d: [['ix', '(U-0.06)/0.88'], ['iy', '(V-0.05)/0.75'], ['ins', 'gt(ix,0)*lt(ix,1)*gt(iy,0)*lt(iy,1)']], x: 'sel(ins,0.5+(ix-0.5)*0.85,U)', y: 'sel(ins,iy,V)', c: 'sel(ins,mix(C,C*pick(1.05,0.98,0.85)+0.06,a),0.95)' },
    { id: 'hFilmStrip', cat: 'retro', en: 'Film strip', ar: 'شريط فيلم', d: [['ix', '(U-0.1)/0.8'], ['fy', 'fr(V*1.2+T*a*0.5)'], ['ins', 'gt(ix,0)*lt(ix,1)*gt(fy,0.04)*lt(fy,0.96)'], ['hole', 'lt(abs(fr(V*12+T*a*5)-0.5),0.22)*lt(abs(abs(U-0.5)-0.45),0.02)']], x: 'ix', y: '(fy-0.04)/0.92', c: 'sel(ins,C,sel(hole,0.9,0.06))' },
    { id: 'hTinyTv', cat: 'retro', en: 'Tiny TV', ar: 'تلفزيون صغير', d: [['qx', '(U-0.5)/0.7'], ['qy', '(V-0.47)/0.7'], ['r', 'pow(pow(abs(qx)*2,4)+pow(abs(qy)*2,4),0.25)']], x: '0.5+qx*(1+0.08*r*r)', y: '0.5+qy*(1+0.08*r*r)', c: 'sel(lt(r,1),mix(C,L,a)*(1-0.4*r*r)+0.06*rnd(floor(U*320)+floor(V*240)*1.7+mod(floor(T*24),30)),0.12+0.05*V)' },
    { id: 'hDaguerre', cat: 'retro', en: 'Daguerreotype', ar: 'داجيروتايب', c: 'mix(C,(0.2+0.75*L)*pick(0.9,0.93,0.97)*(1-0.7*PR*PR)+0.06*sin(PA*3+PR*10),a)' },
    { id: 'hOneBit', cat: 'retro', en: '1-bit dither', ar: 'دذر أبيض وأسود', d: [['n', '120+120*(1-a)'], ['xm', 'mod(floor(U*AR*n),2)'], ['ym', 'mod(floor(V*n),2)']], x: '(floor(U*AR*n)+0.5)/(AR*n)', y: '(floor(V*n)+0.5)/n', c: 'gt(L,(2*xm+3*ym-4*xm*ym+0.5)/4)' },
    { id: 'hFilmedScreen', cat: 'retro', en: 'Filmed screen', ar: 'شاشة متصورة', c: 'C*(1-a*0.35*(0.5+0.5*sin(V*9.42-T*4)))*(1-a*0.15*sin(U*AR*300+V*40)*sin(V*280))' },
    { id: 'hIris', cat: 'retro', en: 'Silent film iris', ar: 'فيلم صامت', d: [['r', '0.25+0.6*(0.5+0.5*cos(T*0.8))']], c: 'mix(C,(0.1+0.9*L)*(0.92+0.08*rnd(mod(floor(T*18),50)))*sstep(r,r-0.03,PR),a)' },
    { id: 'hCracked', cat: 'retro', en: 'Cracked photo', ar: 'صورة مشروخة', d: [['cr', 'sstep(0.03,0,abs(sin(PX*7+sin(PY*5)*2)*sin(PY*6+sin(PX*4)*2)))+sstep(0.02,0,abs(sin(PX*13-PY*9+sin(PY*11))))*0.7']], c: 'mix(C,C*pick(1,0.93,0.8)*(1-0.6*cr),a)' },
    { id: 'hVhsPause', cat: 'retro', en: 'VHS pause', ar: 'فيديو متوقف', d: [['b', 'sstep(0.03,0,abs(V-0.7-0.02*sin(T*20)))+sstep(0.02,0,abs(V-0.25))'], ['f', 'mod(floor(T*25),50)']], x: 'U+b*a*0.08*(rnd(floor(V*300)+f)-0.5)+a*0.002*sin(T*40)', c: 'C+b*a*0.5*rnd(floor(U*400)+floor(V*300)*1.3+f*3.7)' },
    { id: 'hPhotocopy', cat: 'retro', en: 'Photocopy', ar: 'فوتوكوبي', c: 'mix(C,clip((L-0.35)*3,0,1)*(0.9+0.1*rnd(floor(U*AR*300)+floor(V*300)*1.7))-0.6*gt(rnd(floor(U*AR*300)*1.3+floor(V*300)*0.7),0.995),a)' },
    { id: 'hGroundGlass', cat: 'retro', en: 'Ground glass', ar: 'عدسة كاميرا قديمة', x: '1-U', y: '1-V', c: 'C*(1-a*0.7*PR*PR*2)+a*0.4*sstep(0.002,0,min(abs(PX),abs(PY)))+a*0.3*sstep(0.003,0,abs(PR-0.2))' },
    { id: 'hStereo', cat: 'retro', en: 'Stereo card', ar: 'كارت ستيريو', d: [['ix', '(fr(U*2)-0.06)/0.88'], ['iy', '(V-0.12)/0.76'], ['ins', 'gt(ix,0)*lt(ix,1)*gt(iy,0)*lt(iy,1)']], x: '0.5+(ix-0.5)*0.5', y: 'iy', c: 'sel(ins,mix(C,L*pick(1.1,0.95,0.75),a),pick(0.85,0.8,0.68))' },
    // color
    { id: 'hColorSweep', cat: 'color', en: 'Colour sweep', ar: 'لون ماشي', d: [['m', 'sstep(0.2,0,abs(U-fr(T*0.25)*1.6+0.3))']], c: 'mix(L,C,mix(1-a,1,m))' },
    { id: 'hSatPulse', cat: 'color', en: 'Colour pulse', ar: 'نبض ألوان', c: 'L+(C-L)*(1+a*1.2*pow(max(0,sin(T*6.2832)),4)-a*0.5)' },
    { id: 'hGradFlow', cat: 'color', en: 'Gradient flow', ar: 'تدرج ماشي', c: 'mix(C,0.5+0.5*cos(6.2832*(L+T*0.15+K*0.33)),a)' },
    { id: 'hTopo', cat: 'color', en: 'Topo map', ar: 'خريطة كنتور', c: 'mix(C,sel(lt(L,0.3),pick(0.15,0.35,0.6),sel(lt(L,0.5),pick(0.3,0.55,0.25),sel(lt(L,0.7),pick(0.6,0.5,0.3),sel(lt(L,0.85),pick(0.5,0.4,0.3),0.95))))*(1-0.4*gt(abs(fr(L*20)-0.5),0.42)),a)' },
    { id: 'hDayCycle', cat: 'color', en: 'Day cycle', ar: 'نهار وليل', c: 'mix(C,C*mix(pick(0.55,0.7,1.15),pick(1.15,1,0.8),0.5+0.5*sin(T*0.6)),a)' },
    { id: 'hSplitTone', cat: 'color', en: 'Warm cool split', ar: 'نص دافي نص بارد', d: [['w', 'sstep(-0.02,0.02,U-0.5-0.35*sin(T*0.7))']], c: 'C*mix(1,mix(pick(1.15,1,0.8),pick(0.8,0.95,1.2),w),a)' },
    { id: 'hFocusColor', cat: 'color', en: 'Colour centre', ar: 'لون في النص', c: 'mix(L,C,1-a*sstep(0.25,0.6,PR))' },
    { id: 'hInvertSpot', cat: 'color', en: 'Invert spot', ar: 'دايرة معكوسة', d: [['m', 'sstep(0.27,0.25,hypot(PX-0.45*AR*sin(T*0.7),PY-0.3*sin(T*1.1)))']], c: 'mix(C,1-C,m*a)' },
    { id: 'hAcid', cat: 'color', en: 'Acid', ar: 'أسيد', c: 'mix(C,fr(C+0.3*sin(PX*4+T)+0.3*sin(PY*5-T*1.3)+1),a)' },
    { id: 'hGradWash', cat: 'color', en: 'Gradient wash', ar: 'غسيل تدرج', c: 'mix(C,L*mix(pick(0.2,0.5,1.4),pick(1.4,0.4,0.7),U)*1.2,a)' },
    { id: 'hBlackLight', cat: 'color', en: 'Black light', ar: 'ضوء أسود', c: 'mix(C,pick(0.35,0.05,0.7)*L+L*L*L*pick(0.4,1.5,1.2),a)' },
    { id: 'hHueRings', cat: 'color', en: 'Hue rings', ar: 'حلقات ألوان', c: 'mix(C,C*(0.6+0.8*(0.5+0.5*cos(6.2832*(PR*3-T*0.5+K*0.33)))),a)' },
    { id: 'hColorClouds', cat: 'color', en: 'Colour clouds', ar: 'سحاب ألوان', d: [['n', 'sin(PX*3+T*0.7)*sin(PY*4-T*0.5)+0.5*sin(PX*7-PY*5+T)']], c: 'L+(C-L)*(1+a*1.5*n)' },
    { id: 'hTwilight', cat: 'color', en: 'Twilight', ar: 'شفق', c: 'mix(C,C*mix(pick(0.7,0.55,1.25),pick(1.35,0.85,0.6),V+0.1*sin(T*0.5)),a)' },
    { id: 'hInvertBeat', cat: 'color', en: 'Invert beat', ar: 'عكس على الإيقاع', c: 'mix(C,1-C,a*gt(fr(T*2),0.85))' },
    { id: 'hToneWaves', cat: 'color', en: 'Tone waves', ar: 'موجات إضاءة', c: 'C*mix(1,0.6+0.8*(0.5+0.5*sin(L*20-T*4)),a)' },
    { id: 'hHueHunt', cat: 'color', en: 'One hue', ar: 'لون واحد بيلف', d: [['hu', 'atan2(1.732*(G0-B0),2*R0-G0-B0)/6.2832+0.5'], ['dh', 'abs(fr(hu-T*0.1+0.5)-0.5)']], c: 'mix(C,L,a*sstep(0.05,0.12,dh))' },
    // light
    { id: 'hSunRays', cat: 'light', en: 'Sun rays', ar: 'أشعة شمس', d: [['dx', 'PX+0.6*AR'], ['dy', 'PY+0.6'], ['an', 'atan2(dy,dx)']], c: 'C+a*0.65*pow(max(0,sin(an*24+T*0.5))*max(0,sin(an*13-T*0.3)),2)*exp(-hypot(dx,dy)*0.9)*pick(1,0.9,0.6)' },
    { id: 'hDisco', cat: 'light', en: 'Disco lights', ar: 'أنوار ديسكو', d: [['gx', 'PX*4+T*0.7'], ['gy', 'PY*4+sin(T*0.5)'], ['id', 'floor(gx)*3.7+floor(gy)*1.3']], c: 'C*(1-a*0.4)+a*0.8*sstep(0.35,0.2,hypot(fr(gx)-0.5,fr(gy)-0.5))*(0.5+0.5*cos(6.2832*(rnd(id)+K*0.33)))' },
    { id: 'hPolice', cat: 'light', en: 'Police lights', ar: 'سرينة', d: [['f', 'fr(T*2)']], c: 'C*(1-a*0.3)+a*0.8*abs(sin(T*25))*(sstep(0.6,0,U)*lt(f,0.5)*pick(1,0.1,0.1)+sstep(0.4,1,U)*gt(f,0.5)*pick(0.1,0.25,1))' },
    { id: 'hFlare', cat: 'light', en: 'Lens flare', ar: 'فلير عدسة', d: [['sx', '0.3*AR*sin(T*0.4)-0.2'], ['vx', 'PX-sx'], ['vy', 'PY+0.25']], c: 'C+a*(exp(-hypot(vx,vy)*7)*0.9+exp(-abs(vy)*60)*exp(-abs(vx)*1.5)*0.35+sstep(0.05,0.03,abs(hypot(PX+sx*0.6,PY-0.15)-0.06))*0.3+sstep(0.11,0.08,hypot(PX+sx*1.2,PY-0.3))*0.2)*pick(1,0.85,0.7)' },
    { id: 'hBlueStreak', cat: 'light', en: 'Anamorphic streak', ar: 'خط أزرق', d: [['sy', '0.15*sin(T*0.6)']], c: 'C+a*exp(-abs(PY-sy)*80)*(0.6+0.4*sin(T*3))*pick(0.3,0.6,1.2)+a*exp(-hypot(PX,PY-sy)*6)*pick(0.4,0.6,1)' },
    { id: 'hCaustics', cat: 'light', en: 'Pool caustics', ar: 'إضاءة حمام سباحة', d: [['w', 'sin(PX*9+sin(PY*7+T)*1.5+T*1.3)+sin(PY*11+sin(PX*8-T*0.8)*1.5-T)']], c: 'C*(1-a*0.15)+a*0.35*pow(max(0,1-abs(w)),6)*pick(0.8,1,1)' },
    { id: 'hLightning', cat: 'light', en: 'Lightning', ar: 'برق', d: [['f', 'mod(floor(T*10),97)']], c: 'C*(1-a*0.3)+a*(gt(rnd(f),0.93)+gt(rnd(mod(f+96,97)),0.93)*0.5)*pick(0.75,0.8,1)*(1.3-V*0.6)' },
    { id: 'hCandle', cat: 'light', en: 'Candlelight', ar: 'نور شمعة', c: 'C*pick(1.1,0.85,0.55)*mix(1,(0.85+0.1*sin(T*13)*sin(T*7.3)+0.05*sin(T*31))*(1-PR*0.9),a)' },
    { id: 'hBlinds', cat: 'light', en: 'Window blinds', ar: 'ضل شيش', c: 'C*(1-a*0.45)+a*0.45*C*pick(1.3,1.1,0.8)*sstep(0.3,0.5,sin((PY+PX*0.35)*40/(1+0.6*(PX+1))+T*0.3))' },
    { id: 'hLeafShadow', cat: 'light', en: 'Leaf shadows', ar: 'ضل شجر', c: 'C*(1-a*0.5*sstep(0,0.4,sin(PX*7+T*0.6+sin(PY*5))*sin(PY*8-T*0.4+sin(PX*6))+0.4*sin(PX*15-PY*12+T)))*pick(1,1.02,0.95)' },
    { id: 'hShine', cat: 'light', en: 'Shine sweep', ar: 'لمعة ماشية', d: [['dd', 'U+V*0.5-fr(T*0.4)*3+1']], c: 'C+a*0.6*exp(-dd*dd*400)+a*0.25*exp(-(dd-0.06)*(dd-0.06)*2000)' },
    { id: 'hStage', cat: 'light', en: 'Stage beams', ar: 'كشافات مسرح', d: [['b1', 'sstep(0.18,0.1,abs(atan2(PX-0.3*AR,0.5-PY)-0.4*sin(T*0.7)))'], ['b2', 'sstep(0.18,0.1,abs(atan2(PX+0.3*AR,0.5-PY)+0.4*sin(T*0.9)))']], c: 'C*(1-a*0.45)+a*(b1*pick(0.9,0.3,0.6)+b2*pick(0.2,0.6,0.9))*0.6*(0.5+0.5*V)' },
    { id: 'hHalo', cat: 'light', en: 'Halo', ar: 'هالة', c: 'C+a*0.5*exp(-abs(PR-0.35-0.03*sin(T*2))*25)*pick(1,0.95,0.8)' },
    { id: 'hFireGlow', cat: 'light', en: 'Fire glow', ar: 'نور نار', c: 'C*(1-a*0.25)+a*0.6*(0.7+0.2*sin(T*9+PX*3)*sin(T*5.3)+0.1*sin(T*23))*sstep(0.1,1,V)*pick(1,0.45,0.1)' },
    { id: 'hCarLights', cat: 'light', en: 'Passing headlights', ar: 'نور عربية معدية', d: [['dx', 'PX-(fr(T*0.3)*4-2)*AR*0.6']], c: 'C*(1-a*0.3)+a*(0.9*(exp(-hypot(dx-0.12,PY-0.1)*9)+exp(-hypot(dx+0.12,PY-0.1)*9))+0.25*exp(-abs(dx)*3))*pick(1,0.95,0.8)' },
    { id: 'hSearchlight', cat: 'light', en: 'Searchlight', ar: 'كشاف بحث', d: [['b', 'sstep(0.12,0.04,abs(atan2(PX,0.6-PY)-0.6*sin(T*0.5)))']], c: 'C*mix(1,pick(0.4,0.45,0.65),a)+a*b*0.5' },
    { id: 'hTvGlow', cat: 'light', en: 'TV glow', ar: 'نور تلفزيون', c: 'C*mix(1,pick(0.45,0.6,1.1)*(0.7+0.3*rnd(mod(floor(T*6),50))),a)' },
    { id: 'hProjector', cat: 'light', en: 'Projector beam', ar: 'شعاع بروجكتور', d: [['b', 'sstep(0.25,0.15,abs(atan2(PY+0.6,0.6*AR-PX)-0.5))']], c: 'C*(1-a*0.25)+a*b*(0.18+0.6*gt(rnd(floor(U*AR*120)*1.3+floor((V+T*0.02)*120)*7.1),0.985))*pick(1,0.95,0.85)' },
    { id: 'hColorStrobe', cat: 'light', en: 'Colour strobe', ar: 'ستروب ألوان', c: 'C*(1-a*0.5)+a*0.6*gt(fr(T*6),0.5)*(0.5+0.5*cos(6.2832*(floor(T*6)*0.37+K*0.33)))' },
    { id: 'hLasers', cat: 'light', en: 'Laser beams', ar: 'ليزر', d: [['an', 'atan2(PX,PY+0.55)']], c: 'C*(1-a*0.3)+a*pow(max(0,cos((an+0.3*sin(T*1.3))*20)),80)*pick(0.3,1,0.4)*sstep(0,0.3,PY+0.55)' },
    { id: 'hMoonlight', cat: 'light', en: 'Moonlight', ar: 'نور قمر', c: 'mix(C,L*pick(0.45,0.6,0.95)+exp(-hypot(PX-0.5*AR+0.25,PY+0.32)*12)*0.8,a)' },
    { id: 'hBloomPulse', cat: 'light', en: 'Bloom pulse', ar: 'لمعة نابضة', c: 'C+a*L*L*L*0.7*(0.5+0.5*sin(T*4))' },
    { id: 'hUnderLight', cat: 'light', en: 'Under light', ar: 'نور من تحت', c: 'C*mix(1,(0.25+0.95*V*V)*pick(0.8,1.05,0.9),a)' },
    // art
    { id: 'hEngrave', cat: 'art', en: 'Engraving', ar: 'حفر', d: [['ln', 'fr((PY+0.02*sin(PX*25))*90)']], c: 'mix(C,sel(lt(abs(ln-0.5)*2,1-L),0.1,0.95),a)' },
    { id: 'hCrayon', cat: 'art', en: 'Crayon', ar: 'ألوان شمع', d: [['tx', 'rnd(floor(U*AR*300)+floor((V+U*0.4)*90)*13.1)']], c: 'mix(C,floor(C*5)/4*(0.75+0.35*tx)+(1-tx)*0.1,a)' },
    { id: 'hWatercolor', cat: 'art', en: 'Watercolour', ar: 'ألوان مية', d: [['n', 'sin(PX*13+sin(PY*9)*2)*sin(PY*11+sin(PX*7)*2)']], x: 'U+n*a*0.006', y: 'V+n*a*0.006', c: 'mix(C,1-(1-floor(C*6+0.5)/6)*(0.72+0.28*n)*0.95,a)' },
    { id: 'hOilPaint', cat: 'art', en: 'Oil paint', ar: 'زيت', d: [['an', 'sin(PX*6)*2+sin(PY*5)*2'], ['st', 'fr(PX*cos(an)*60+PY*sin(an)*60)']], x: 'U+cos(an)*(st-0.5)*a*0.008', y: 'V+sin(an)*(st-0.5)*a*0.008', c: 'mix(C,floor(C*7)/6*(0.92+0.12*st),a)' },
    { id: 'hPointillism', cat: 'art', en: 'Pointillism', ar: 'تنقيط ملوّن', d: [['gx', 'U*AR*70'], ['sh', '0.5*mod(floor(U*AR*70),2)'], ['gy', 'V*70+sh']], x: '(floor(gx)+0.5)/(AR*70)', y: '(floor(gy)+0.5-sh)/70', c: 'mix(C,sel(lt(hypot(fr(gx)-0.5,fr(gy)-0.5),0.45),min(C*1.25,1),0.95),a)' },
    { id: 'hCrossStitch', cat: 'art', en: 'Cross stitch', ar: 'كروس ستيتش', d: [['gx', 'U*AR*60'], ['gy', 'V*60'], ['fx', 'fr(gx)-0.5'], ['fy', 'fr(gy)-0.5']], x: '(floor(gx)+0.5)/(AR*60)', y: '(floor(gy)+0.5)/60', c: 'mix(C,sel(lt(min(abs(fx-fy),abs(fx+fy)),0.18),C*(0.85+0.3*(0.5-abs(fx))),pick(0.93,0.9,0.82)),a)' },
    { id: 'hToyBricks', cat: 'art', en: 'Toy bricks', ar: 'مكعبات لعب', d: [['gx', 'U*AR*40'], ['gy', 'V*40']], x: '(floor(gx)+0.5)/(AR*40)', y: '(floor(gy)+0.5)/40', c: 'mix(C,C*(1+0.5*sstep(0.32,0.28,hypot(fr(gx)-0.5,fr(gy)-0.5))*(0.5-fr(gy))-0.3*sstep(0.04,0,min(fr(gx),fr(gy)))),a)' },
    { id: 'hLowPoly', cat: 'art', en: 'Low poly', ar: 'لو بولي', d: [['n', '30-18*a'], ['gx', 'U*AR*n'], ['gy', 'V*n'], ['tr', 'gt(fr(gx),fr(gy))']], x: '(floor(gx)+sel(tr,0.66,0.33))/(AR*n)', y: '(floor(gy)+sel(tr,0.33,0.66))/n', c: 'C*(0.92+0.16*rnd(floor(gx)*3.1+floor(gy)*7.3+tr))' },
    { id: 'hHexPix', cat: 'art', en: 'Hex pixels', ar: 'بكسلات سداسي', d: [['n', '50-30*a'], ['ax', 'mod(PX*n,1)-0.5'], ['ay', 'mod(PY*n,1.732)-0.866'], ['bx', 'mod(PX*n-0.5,1)-0.5'], ['by', 'mod(PY*n-0.866,1.732)-0.866'], ['u2', 'lt(ax*ax+ay*ay,bx*bx+by*by)']], x: '0.5+(PX*n-sel(u2,ax,bx))/n/AR', y: '0.5+(PY*n-sel(u2,ay,by))/n' },
    { id: 'hStained', cat: 'art', en: 'Stained glass', ar: 'زجاج معشق', d: [['wx', 'PX*14+0.3*sin(PY*13)'], ['wy', 'PY*14+0.3*sin(PX*11)'], ['ed', 'min(min(fr(wx),1-fr(wx)),min(fr(wy),1-fr(wy)))']], x: '0.5+(floor(wx)+0.5-0.3*sin(PY*13))/14/AR', y: '0.5+(floor(wy)+0.5-0.3*sin(PX*11))/14', c: 'mix(C,sel(lt(ed,0.07),0.06,clip((C-0.5)*1.15+0.55,0,1)*(0.9+0.2*fr(wx+wy))),a)' },
    { id: 'hCmy', cat: 'art', en: 'Colour halftone', ar: 'هافتون ملون', d: [['an', 'pick(0.26,1.31,0.79)'], ['rx', 'PX*cos(an)-PY*sin(an)'], ['ry', 'PX*sin(an)+PY*cos(an)']], c: 'mix(C,1-lt(hypot(fr(rx*70)-0.5,fr(ry*70)-0.5),sqrt(max(1-C,0))*0.62),a)' },
    { id: 'hBlueprint', cat: 'art', en: 'Blueprint', ar: 'بلوبرنت', c: 'mix(C,mix(pick(0.08,0.25,0.6),pick(0.9,0.95,1),(1-L)*(1-L)*0.8)+0.2*max(sstep(0.04,0,fr(PX*12)),sstep(0.04,0,fr(PY*12))),a)' },
    { id: 'hChalk', cat: 'art', en: 'Chalkboard', ar: 'سبورة', c: 'mix(C,pick(0.13,0.22,0.17)+sstep(0.35,0.8,L)*pick(0.8,0.85,0.8)*(0.6+0.4*rnd(floor(U*AR*400)+floor((V+U*0.3)*120)*1.3)),a)' },
    { id: 'hWoven', cat: 'art', en: 'Woven', ar: 'منسوج', d: [['gx', 'fr(U*AR*30)'], ['gy', 'fr(V*30)']], c: 'mix(C,C*(0.75+0.35*sel(mod(floor(U*AR*30)+floor(V*30),2),sin(gx*3.1416),sin(gy*3.1416))),a)' },
    { id: 'hCharcoal', cat: 'art', en: 'Charcoal', ar: 'فحم', c: 'mix(C,clip(L*1.3-0.15+(rnd(floor(U*AR*200+V*60)*1.7+floor(V*90)*3.1)-0.5)*0.25*(1-L),0,1)*pick(0.98,0.97,0.94),a)' },
    { id: 'hRiso', cat: 'art', en: 'Risograph', ar: 'ريزو', x: 'U+pick(0.004,0,-0.003)*a', c: 'mix(C,1-(1-L)*pick(0.1,0.75,0.45)+(rnd(floor(U*AR*400)+floor(V*400)*1.7)-0.5)*0.06,a)' },
    { id: 'hInkWash', cat: 'art', en: 'Ink wash', ar: 'حبر صيني', c: 'mix(C,pick(0.95,0.93,0.88)*(1-pow(1-L,1.5)*0.9)*(1-0.06*sin(PX*40+sin(PY*30))),a)' },
    { id: 'hScratchboard', cat: 'art', en: 'Scratchboard', ar: 'سكراتش بورد', c: 'mix(C,sel(lt(abs(fr(PR*120)-0.5)*2,L*L),0.95,0.03),a)' },
    { id: 'hStencil', cat: 'art', en: 'Stencil', ar: 'استنسل', c: 'mix(C,sel(gt(L+(rnd(floor(U*AR*300)+floor(V*300)*1.3)-0.5)*0.15,0.45),pick(0.92,0.9,0.85),pick(0.85,0.15,0.2)),a)' },
    { id: 'hMarbling', cat: 'art', en: 'Marbling', ar: 'رخام ورق', d: [['w', 'sin(PY*6+sin(PX*5+T*0.3)*2)']], x: 'U+w*a*0.04', y: 'V+sin(PX*4+w*2)*a*0.03', c: 'mix(C,C*(0.85+0.3*(0.5+0.5*sin(w*8+PX*20))),a)' },
    // overlay
    { id: 'hPetals', cat: 'overlay', en: 'Petals', ar: 'ورد بيقع', d: [['cx', 'PX*6+0.5*sin(T*0.8+PY*2)'], ['cy', 'PY*6-T*1.2'], ['id', 'floor(cx)*1.9+floor(cy)*4.3'], ['qx', 'fr(cx)-0.3-0.4*rnd(id)'], ['qy', 'fr(cy)-0.3-0.4*rnd(id+2)'], ['an', 'T*2+rnd(id)*6']], c: 'mix(C,pick(1,0.72,0.8),sstep(1,0.8,hypot((qx*cos(an)+qy*sin(an))/0.12,(qy*cos(an)-qx*sin(an))/0.06))*gt(rnd(id+4),0.5)*a)' },
    { id: 'hHearts', cat: 'overlay', en: 'Floating hearts', ar: 'قلوب طايرة', d: [['cx', 'PX*5+0.3*sin(T+PY*3)'], ['cy', 'PY*5+T'], ['id', 'floor(cx)*2.1+floor(cy)*5.7'], ['hx', 'abs(fr(cx)-0.5)*3.2'], ['hy', '0.35-(fr(cy)-0.5)*3.2'], ['q', 'hx*hx+hy*hy-1']], c: 'mix(C,pick(1,0.25,0.4),lt(q*q*q-hx*hx*hy*hy*hy,0)*gt(rnd(id+3),0.55)*a)' },
    { id: 'hStarWarp', cat: 'overlay', en: 'Star warp', ar: 'نجوم طايرة', d: [['sa', '(PA+3.1416)/6.2832*90'], ['an', 'floor(sa)'], ['z', 'fr(rnd(an)+T*0.4)']], c: 'C*(1-a*0.5)+a*z*sstep(0.03+z*0.05,0,abs(PR-z*z*1.2))*lt(abs(fr(sa)-0.5),0.15)*gt(rnd(an+3),0.4)' },
    { id: 'hEmbers', cat: 'overlay', en: 'Embers', ar: 'جمر طاير', d: [['cx', 'PX*10+0.3*sin(T*1.3+PY*4)'], ['cy', 'PY*10+T*2'], ['id', 'floor(cx)*3.3+floor(cy)*1.9']], c: 'C+a*2*exp(-hypot(fr(cx)-rnd(id),fr(cy)-rnd(id+1))*30)*gt(rnd(id+2),0.6)*pick(1,0.45,0.1)*(0.6+0.4*sin(T*9+id))' },
    { id: 'hFog', cat: 'overlay', en: 'Fog', ar: 'شبورة', c: 'mix(C,0.85,a*0.7*V*(0.5+0.25*sin(PX*2+T*0.3+sin(PY*3+T*0.2))+0.25*sin(PX*5-T*0.4+PY*2)))' },
    { id: 'hCodeRain', cat: 'overlay', en: 'Code rain', ar: 'كود نازل', d: [['cx', 'floor(U*AR*40)'], ['sp', '0.5+rnd(cx)'], ['gy', 'V*30-T*sp*8'], ['tr', 'fr(rnd(cx+3)+T*sp*0.27-V*0.9)']], c: 'C*(1-a*0.7)+a*gt(rnd(cx*1.3+floor(gy)*7.1),0.35)*lt(abs(fr(U*AR*40)-0.5),0.32)*lt(abs(fr(gy)-0.5),0.38)*tr*tr*tr*pick(0.3,1,0.4)' },
    { id: 'hHud', cat: 'overlay', en: 'Target HUD', ar: 'تصويب', c: 'C+a*(sstep(0.006,0,abs(PR-0.22))+sstep(0.005,0,abs(PR-0.32))*gt(sin(PA*8+T*2),0)+sstep(0.004,0,min(abs(PX),abs(PY)))*lt(PR,0.4)*gt(PR,0.05))*pick(0.4,1,0.6)' },
    { id: 'hRadar', cat: 'overlay', en: 'Radar', ar: 'رادار', d: [['sw', 'fr((PA+3.1416)/6.2832-T*0.3)']], c: 'mix(C,C*pick(0.18,0.48,0.24)+sw*sw*sw*sw*sw*sw*0.6*pick(0.3,1,0.4)+gt(abs(fr(PR*10)-0.5),0.46)*0.3,lt(PR,0.42)*a)' },
    { id: 'hBinoculars', cat: 'overlay', en: 'Binoculars', ar: 'منظار', c: 'C*mix(1,clip(sstep(0.37,0.34,hypot(PX-0.21,PY))+sstep(0.37,0.34,hypot(PX+0.21,PY)),0,1),a)' },
    { id: 'hKeyhole', cat: 'overlay', en: 'Keyhole', ar: 'خرم مفتاح', c: 'C*mix(1,clip(sstep(0.17,0.16,hypot(PX,PY+0.1))+lt(abs(PX),0.07+0.2*(PY+0.05))*gt(PY,-0.05)*lt(PY,0.3),0,1),a)' },
    { id: 'hHeartFrame', cat: 'overlay', en: 'Heart frame', ar: 'برواز قلب', d: [['hx', 'abs(PX)*2.6'], ['hy', '0.2-PY*2.6'], ['q', 'hx*hx+hy*hy-1']], c: 'mix(C,pick(1,0.85,0.88),a*gt(q*q*q-hx*hx*hy*hy*hy,0))' },
    { id: 'hLensDrops', cat: 'overlay', en: 'Lens drops', ar: 'نقط على العدسة', d: [['gx', 'U*AR*6'], ['gy', 'V*4'], ['id', 'floor(gx)*1.7+floor(gy)*5.3'], ['dx', 'fr(gx)-0.3-0.4*rnd(id)'], ['dy', 'fr(gy)-0.3-0.4*rnd(id+1)'], ['m', 'sstep(0.2,0.15,hypot(dx,dy*1.5))*gt(rnd(id+2),0.4)']], x: 'U-dx*m*a*0.6/(AR*6)', y: 'V-dy*m*a*0.6/4', c: 'C*(1+m*a*0.12)' },
    { id: 'hFrost', cat: 'overlay', en: 'Frost', ar: 'تلج على الإزاز', d: [['n', '0.5+0.3*sin(U*AR*60+sin(V*50)*3)*sin(V*70+sin(U*40)*3)'], ['m', 'sstep(0.55,0.95,max(abs(U-0.5),abs(V-0.5))*2+n*0.3)*a']], x: 'U+(n-0.5)*m*0.02', c: 'mix(C,0.9*pick(0.92,0.97,1),m*0.85)' },
    { id: 'hBokeh', cat: 'overlay', en: 'Bokeh', ar: 'بوكيه', d: [['cx', 'PX*3+T*0.08'], ['cy', 'PY*3+sin(T*0.3)*0.2'], ['id', 'floor(cx)*3.1+floor(cy)*7.7'], ['rs', '0.1+0.25*rnd(id+1)']], c: 'C+a*0.35*sstep(rs,rs-0.03,hypot(fr(cx)-0.5,fr(cy)-0.5))*gt(rnd(id),0.35)*(0.5+0.5*cos(6.2832*(rnd(id+2)*0.3+K*0.15)))' },
    { id: 'hSynthGrid', cat: 'overlay', en: 'Synth grid', ar: 'شبكة ريترو', d: [['dz', 'max(V-0.55,0.001)'], ['gz', 'fr(0.25/dz+T*1.5)'], ['gx', 'fr((U-0.5)/dz*0.6)']], c: 'C*(1-a*0.4*gt(V,0.55))+a*gt(V,0.55)*max(sstep(0.08,0,min(gz,1-gz)),sstep(0.05,0,min(gx,1-gx)))*pick(1,0.2,0.9)' },
    { id: 'hScanLine', cat: 'overlay', en: 'Scan line', ar: 'خط اسكان', d: [['dv', 'abs(V-0.5-0.5*sin(T*1.5))']], c: 'C+a*(exp(-dv*200)*0.8+exp(-dv*15)*0.15)*pick(0.3,1,0.6)' },
    { id: 'hFireworks', cat: 'overlay', en: 'Fireworks', ar: 'صواريخ', d: [['f', 'floor(T*0.7)'], ['cx', '(rnd(f)-0.5)*AR*0.8'], ['cy', '-0.15-rnd(f+1)*0.2'], ['tt', 'fr(T*0.7)'], ['dd', 'hypot(PX-cx,PY-cy)']], c: 'C+a*(1-tt)*1.5*sstep(0.015,0,abs(dd-tt*0.35))*gt(abs(fr(atan2(PY-cy,PX-cx)*3.8197)-0.5),0.3)*(0.5+0.5*cos(6.2832*(rnd(f+2)+K*0.33)))' },
    { id: 'hCobweb', cat: 'overlay', en: 'Cobweb', ar: 'خيط عنكبوت', d: [['r', 'hypot(U*AR,V)'], ['an', 'atan2(V,U*AR)']], c: 'C+a*0.6*lt(r,0.55)*max(gt(abs(fr(an*7.64)-0.5),0.485),gt(abs(fr(r*14+0.1*sin(an*8))-0.5),0.47))' },
    { id: 'hShutter', cat: 'overlay', en: 'Shutter blink', ar: 'شتر كاميرا', d: [['f', 'fr(T*0.5)'], ['cl', 'sstep(0.85,0.92,f)-sstep(0.93,1,f)']], c: 'C*mix(1,lt(PR+fr((PA+3.1416)/6.2832*6+PR*1.5)*0.06,(1-cl)*1.2),a)' },
    { id: 'hWindowPanes', cat: 'overlay', en: 'Window panes', ar: 'شباك', c: 'mix(C*(1-a*0.15),pick(0.95,0.94,0.9),a*max(max(lt(abs(U-0.5)*AR,0.02),lt(abs(V-0.45),0.02)),gt(max(abs(U-0.5)*2,abs(V-0.5)*2),0.94)))' },
    { id: 'hMeteors', cat: 'overlay', en: 'Meteors', ar: 'شهب', d: [['ux', 'PX+PY*0.5'], ['cx', 'floor(ux*6)'], ['dy', 'fr(T*0.5+rnd(cx))*1.6-0.6-PY+PX*0.5']], c: 'C+a*lt(abs(fr(ux*6)-0.5),0.04)*sstep(0.25,0,dy)*gt(dy,0)*gt(rnd(cx+2),0.5)*pick(1,0.95,0.85)' },
    { id: 'hSandstorm', cat: 'overlay', en: 'Sandstorm', ar: 'عاصفة رملية', c: 'mix(C,pick(0.85,0.62,0.35)*(0.8+0.3*rnd(floor(U*AR*200+mod(T*60,400))*1.3+floor(V*150)*7.7)),a*(0.35+0.35*(0.5+0.5*sin(PX*3-T*2+sin(PY*4)))))' },
    { id: 'hBulbs', cat: 'overlay', en: 'Marquee bulbs', ar: 'لمبات مسرح', d: [['ex', 'min(min(U,1-U)*AR,min(V,1-V))'], ['ps', 'sel(lt(min(U,1-U)*AR,min(V,1-V)),V,U*AR)'], ['bl', 'hypot(fr(ps*14)-0.5,(ex-0.035)*14)']], c: 'mix(C*(1-a*0.25*lt(ex,0.07)),pick(1,0.85,0.4)*(0.35+0.65*gt(sin(floor(ps*14)*2.1+T*8),0)),a*sstep(0.35,0.25,bl))' },
    { id: 'hFilmBurn', cat: 'overlay', en: 'Film burn', ar: 'حرق فيلم', d: [['n', '0.5+0.25*sin(U*13+T*2+sin(V*9))+0.25*sin(V*17-T*1.5+sin(U*11))'], ['b', 'min(min(U,1-U),min(V,1-V))-n*0.08*(0.6+0.4*sin(T*0.7))']], c: 'sel(lt(b,a*0.03-0.02),pick(1,0.95,0.8),C+a*pick(1,0.4,0.05)*sstep(0.12,0,b)*1.2)' },
    { id: 'hPaparazzi', cat: 'overlay', en: 'Paparazzi', ar: 'فلاشات كاميرات', d: [['f', 'mod(floor(T*6),97)']], c: 'C+a*gt(rnd(f),0.7)*(exp(-hypot(PX-(rnd(f+1)-0.5)*AR,PY-rnd(f+2)+0.5)*8)*1.5+0.15)' },
    { id: 'hClouds', cat: 'overlay', en: 'Cloud shadows', ar: 'ضل سحاب', c: 'C*(1-a*0.35*sstep(0.2,0.7,0.5+0.3*sin(PX*2.3-T*0.25+sin(PY*3))+0.2*sin(PX*5.1-T*0.4)))' },
    { id: 'hSpeedLines', cat: 'overlay', en: 'Speed lines', ar: 'خطوط سرعة', c: 'mix(C,1,a*gt(rnd(floor((PA+3.1416)*40)+mod(floor(T*12),50)*3.3),0.75)*sstep(0.25,0.6,PR))' },
    { id: 'hHexGrid', cat: 'overlay', en: 'Hex grid', ar: 'شبكة سداسية', d: [['ax', 'mod(PX*12,1)-0.5'], ['ay', 'mod(PY*12,1.732)-0.866'], ['bx', 'mod(PX*12-0.5,1)-0.5'], ['by', 'mod(PY*12-0.866,1.732)-0.866'], ['gx', 'abs(sel(lt(ax*ax+ay*ay,bx*bx+by*by),ax,bx))'], ['gy', 'abs(sel(lt(ax*ax+ay*ay,bx*bx+by*by),ay,by))']], c: 'C+a*0.5*sstep(0.06,0,0.5-max(gx,gx*0.5+gy*0.866))*pick(0.3,0.9,1)*(0.6+0.4*sin(T*2+PY*6))' },
    { id: 'hSoapFilm', cat: 'overlay', en: 'Soap film', ar: 'غشا صابون', c: 'C+a*0.3*(0.5+0.5*cos(6.2832*(sin(PX*3+T*0.5)*0.6+sin(PY*4-T*0.4+PX*2)*0.6+K*0.33)))-a*0.12' },
    { id: 'hCircuit', cat: 'overlay', en: 'Circuit', ar: 'دوايرة كهربا', d: [['gx', 'PX*14'], ['gy', 'PY*14'], ['id', 'floor(gx)*3.7+floor(gy)*1.9'], ['h', 'gt(rnd(id),0.5)']], c: 'C*(1-a*0.3)+a*sel(h,lt(abs(fr(gy)-0.5),0.06),lt(abs(fr(gx)-0.5),0.06))*gt(rnd(id+1),0.3)*(0.25+0.75*pow(fr(sel(h,fr(gx),fr(gy))-T*0.8+rnd(id+3)),6))*pick(0.2,1,0.8)' },
    { id: 'hLeader', cat: 'overlay', en: 'Film leader', ar: 'عد تنازلي فيلم', c: 'mix(C,(0.35+0.5*L)*(1-0.35*lt(fr(atan2(PX,-PY)/6.2832+0.5),fr(T)))+0.5*(sstep(0.004,0,abs(PR-0.3))+sstep(0.004,0,abs(PR-0.36))+sstep(0.003,0,min(abs(PX),abs(PY)))),a)' },
    { id: 'hAurora', cat: 'overlay', en: 'Aurora', ar: 'شفق قطبي', d: [['w', 'V-0.25-0.08*sin(U*6+T*0.7)-0.05*sin(U*13-T)']], c: 'C*(1-a*0.3)+a*sstep(-0.04,0,w)*exp(-max(w,0)*6)*sstep(0.7,0.2,V)*(0.55+0.45*sin(U*90+T*2))*pick(0.2+0.6*sstep(0,0.08,-w),1,0.6)' },
    { id: 'hRainbow', cat: 'overlay', en: 'Rainbow', ar: 'قوس قزح', d: [['t', '(hypot(PX,PY-0.9)-0.95)/0.18']], c: 'C+a*0.35*gt(t,0)*lt(t,1)*sin(t*3.1416)*(0.5+0.5*cos(6.2832*(t*0.8+K*0.33)))' },
    { id: 'hLensDirt', cat: 'overlay', en: 'Lens dirt', ar: 'وسخ عدسة', c: 'C+a*L*(1.2*sstep(0.3,0.12,hypot(fr(PX*2.3+0.3)-0.5,fr(PY*2.1+0.7)-0.5))*rnd(floor(PX*2.3+0.3)*3.3+floor(PY*2.1+0.7)*7.1)+0.1)' },
    { id: 'hEqualizer', cat: 'overlay', en: 'Equalizer', ar: 'إكولايزر', d: [['cx', 'floor(U*24)'], ['h', '0.1+0.25*abs(sin(T*(3+rnd(cx)*5)+cx))']], c: 'mix(C*(1-a*0.2),pick(0.3,1,0.8)*(0.6+0.4*(1-V)),a*gt(V,1-h)*lt(abs(fr(U*24)-0.5),0.38)*lt(abs(fr(V*60)-0.5),0.4))' },
    { id: 'hStoryBar', cat: 'overlay', en: 'Story bars', ar: 'شرايط ستوري', d: [['bar', 'lt(abs(V-0.03),0.005)*lt(abs(fr(U*4)-0.5),0.47)']], c: 'mix(C,sel(lt(U,fr(T/16)),1,0.55),a*bar)' },
    { id: 'hEcgLine', cat: 'overlay', en: 'Heart monitor', ar: 'رسم قلب', d: [['f', 'fr(U*2.5-T*0.8)'], ['ey', '0.5-exp(-(f-0.3)*(f-0.3)*1600)*0.3+exp(-(f-0.34)*(f-0.34)*3600)*0.12-exp(-(f-0.5)*(f-0.5)*200)*0.06']], c: 'C*(1-a*0.3)+a*sstep(0.008,0,abs(V-ey))*pick(0.3,1,0.5)*(0.3+0.7*f)' },
    { id: 'hNeonFrame', cat: 'overlay', en: 'Neon frame', ar: 'برواز نيون', d: [['e', 'max(abs(PX)-AR*0.5+0.09,abs(PY)-0.41)']], c: 'C*(1-a*0.2)+a*(exp(-abs(e)*300)+exp(-abs(e)*30)*0.35)*(0.75+0.25*sin(T*3))*pick(1,0.2,0.75)' },
    { id: 'hDna', cat: 'overlay', en: 'DNA strands', ar: 'شريط DNA', d: [['s', 'sin(PX*8+T*2)*0.12']], c: 'C*(1-a*0.2)+a*(sstep(0.012,0,abs(PY-s))+sstep(0.012,0,abs(PY+s))*0.7+lt(abs(fr((PX*8+T*2)/3.1416)-0.5),0.04)*lt(abs(PY),abs(s)))*pick(0.4,0.8,1)' },
  ];
  const FXG_BY = Object.fromEntries(FXG.map(f => [f.id, f]));
  const FXG0 = FX.length + 1; // shader id of the first one
  for (const f of FXG) { FX.push(f.id); (FX_CAT[f.cat] = FX_CAT[f.cat] || []).push(f.id); }
  // tiny compiler: parse once, print as GLSL (preview) or as an ffmpeg expression (export)
  function fxgParse(src) {
    const tk = src.match(/\d*\.?\d+(?:e[-+]?\d+)?|[A-Za-z_]\w*|[-+*/(),]/g) || [];
    let i = 0;
    const eat = x => { if (tk[i] !== x) throw new Error('expected ' + x + ' in ' + src); i++; };
    const prim = () => {
      const t = tk[i++];
      if (t === '(') { const v = sum(); eat(')'); return v; }
      if (t === '-') return { t: 'neg', x: prim() };
      if (/^[\d.]/.test(t)) return { t: 'num', v: +t };
      if (tk[i] === '(') { i++; const a = [sum()]; while (tk[i] === ',') { i++; a.push(sum()); } eat(')'); return { t: 'call', f: t, a }; }
      if (/^[A-Za-z_]/.test(t)) return { t: 'var', n: t };
      throw new Error('bad token ' + t + ' in ' + src);
    };
    const prod = () => { let v = prim(); while (tk[i] === '*' || tk[i] === '/') v = { t: 'bin', op: tk[i++], l: v, r: prim() }; return v; };
    const sum = () => { let v = prod(); while (tk[i] === '+' || tk[i] === '-') v = { t: 'bin', op: tk[i++], l: v, r: prod() }; return v; };
    const v = sum();
    if (i !== tk.length) throw new Error('trailing input in ' + src);
    return v;
  }
  // does n read any of the names k (pk: a pick() counts too)
  const uses = (n, k, pk) => n.t === 'var' ? k.includes(n.n) : n.t === 'call' ? (pk && n.f === 'pick') || n.a.some(x => uses(x, k, pk)) : n.t === 'bin' ? uses(n.l, k, pk) || uses(n.r, k, pk) : n.t === 'neg' ? uses(n.x, k, pk) : false;
  function fxgAst(f) { // x, y, c with the named parts put in place (the shader), and kept apart (the export)
    if (f.ast) return f.ast;
    const raw = (f.d || []).map(([n, e]) => [n, fxgParse(e)]), defs = {};
    if (raw.length > 6) throw new Error(f.id + ': at most 6 named parts (geq registers 3..8)');
    const fill = n => n.t === 'var' && defs[n.n] ? defs[n.n] : n.t === 'call' ? { ...n, a: n.a.map(fill) } : n.t === 'bin' ? { ...n, l: fill(n.l), r: fill(n.r) } : n.t === 'neg' ? { ...n, x: fill(n.x) } : n;
    for (const [n, t] of raw) defs[n] = fill(t);
    const rx = fxgParse(f.x || 'U'), ry = fxgParse(f.y || 'V'), rc = fxgParse(f.c || 'C'), x = fill(rx), y = fill(ry);
    const late = []; // parts that read the picture, so they come after the read
    for (const [n, t] of raw) if (uses(t, ['C', 'L', 'R0', 'G0', 'B0', ...late])) late.push(n);
    return (f.ast = { x, y, c: fill(rc), raw, rx, ry, rc, late, perCh: uses(x, ['K'], 1) || uses(y, ['K'], 1), moves: !!(f.x || f.y) });
  }
  // m = 'gl' | 'ff'; k = channel 0..2; V = variable names for this mode
  function fxgPrint(n, m, k, V) {
    const P = x => fxgPrint(x, m, k, V);
    switch (n.t) {
      case 'num': { const s = String(n.v); return m === 'gl' && !/[.e]/.test(s) ? s + '.' : s; }
      case 'neg': return `(-${P(n.x)})`;
      case 'bin': return `(${P(n.l)}${n.op}${P(n.r)})`;
      case 'var': if (n.n === 'K') return m === 'gl' ? k + '.' : String(k); if (!(n.n in V)) throw new Error('unknown ' + n.n); return V[n.n];
    }
    const a = n.a.map(P), [p, q, r] = a;
    if (n.f === 'pick') return a[k];
    const gl = { fr: `fract(${p})`, mod: `mod(${p},${q})`, hypot: `length(vec2(${p},${q}))`, atan2: `atan(${p},${q})`, clip: `clamp(${p},${q},${r})`,
      sstep: `ss_(${p},${q},${r})`, lt: `lt_(${p},${q})`, gt: `gt_(${p},${q})`, sel: `((${p})>.5?(${q}):(${r}))`, rnd: `rnd_(${p})` };
    // register 9 holds a value just long enough to use it twice (nothing else runs between its st and ld)
    const ff = { fr: `(st(9,${p});ld(9)-floor(ld(9)))`, mod: `((${p})-(${q})*floor((${p})/(${q})))`, mix: `((${p})+((${q})-(${p}))*(${r}))`, step: `gte(${q},${p})`,
      sstep: `(st(9,clip(((${r})-(${p}))/((${q})-(${p})),0,1));ld(9)*ld(9)*(3-2*ld(9)))`, sel: `if(gt(${p},0.5),${q},${r})`,
      rnd: `(st(9,sin((${p})*12.9898)*437.5453);ld(9)-floor(ld(9)))` };
    const t = (m === 'gl' ? gl : ff)[n.f];
    if (t) return t;
    if (!['sin', 'cos', 'tan', 'abs', 'floor', 'min', 'max', 'pow', 'sqrt', 'exp', 'mix', 'step', 'hypot', 'atan2', 'clip', 'lt', 'gt'].includes(n.f)) throw new Error('unknown function ' + n.f);
    return `${n.f}(${a.join(',')})`;
  }
  // the preview shader's part: vec4 gfx(int id), reading the clip through grade(u)
  function fxgGLSL() {
    const V = { U: 'U', V: 'V', T: 'T', a: 'a', AR: 'AR', PX: 'PX', PY: 'PY', PR: 'PR', PA: 'PA', C: 'C', L: 'L', R0: 'R0', G0: 'G0', B0: 'B0' };
    const ch = 'rgb';
    let s = `float lt_(float a,float b){return a<b?1.:0.;} float gt_(float a,float b){return a>b?1.:0.;}
    float ss_(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);} float rnd_(float x){return fract(sin(x*12.9898)*437.5453);}
    vec4 gfx(int id){ float U=uv.x, V=uv.y, a=fxv.x, T=fxv.y, AR=bsz.x/bsz.y, PX=(U-.5)*AR, PY=V-.5, PR=length(vec2(PX,PY)), PA=atan(PY,PX);\n`;
    FXG.forEach((f, j) => {
      const A = fxgAst(f);
      s += `  if(id==${FXG0 + j}){ vec4 o;`;
      for (let k = 0; k < 3; k++) {
        if (k === 0 || A.perCh) s += ` vec4 c${A.perCh ? k : 0}=grade(vec2(${fxgPrint(A.x, 'gl', k, V)},${fxgPrint(A.y, 'gl', k, V)}));`;
        const c = 'c' + (A.perCh ? k : 0);
        s += ` { float C=${c}.${ch[k]}, R0=${c}.r, G0=${c}.g, B0=${c}.b, L=dot(${c}.rgb,vec3(.299,.587,.114)); o.${ch[k]}=clamp(${fxgPrint(A.c, 'gl', k, V)},0.,1.); }`;
      }
      s += ` o.a=c${A.perCh ? 1 : 0}.a; return o; }\n`;
    });
    return s + '  return grade(uv); }\n';
  }
  // the export's part: one geq over the clip's w x h box (pixel centres at X+0.5, like the shader)
  function fxgChain(f, a) {
    const A = fxgAst(f), ch = 'rgb';
    const at = (c, k) => `${c}(ld(0),ld(1))`;
    const V0 = { U: '((X+0.5)/W)', V: '((Y+0.5)/H)', T: 'T', a: String(q4(a)), AR: '(W/H)', PX: '((X+0.5-W/2)/H)', PY: '((Y+0.5-H/2)/H)' };
    V0.PR = `hypot(${V0.PX},${V0.PY})`; V0.PA = `atan2(${V0.PY},${V0.PX})`;
    // registers: 0, 1 = where to read, 2 = luma there, 3.. = the named parts, each worked out once per pixel
    A.raw.forEach(([n], i) => { V0[n] = `ld(${3 + i})`; });
    const parts = (k, V, late) => A.raw.map(([n, t], i) => A.late.includes(n) === late ? `st(${3 + i},${fxgPrint(t, 'ff', k, V)});` : '').join('');
    const read = k => A.moves ? `st(0,(${fxgPrint(A.rx, 'ff', k, V0)})*W-0.5);st(1,(${fxgPrint(A.ry, 'ff', k, V0)})*H-0.5);` : 'st(0,X);st(1,Y);';
    const one = k => {
      const V = { ...V0, C: `(${at(ch[k])}/255)`, R0: `(${at('r')}/255)`, G0: `(${at('g')}/255)`, B0: `(${at('b')}/255)`, L: '(ld(2)/255)' };
      return parts(k, V0, false) + read(k) + `st(2,0.299*${at('r')}+0.587*${at('g')}+0.114*${at('b')});` + parts(k, V, true) + `255*clip(${fxgPrint(A.rc, 'ff', k, V)},0,1)`;
    };
    const al = A.moves ? parts(1, V0, false) + read(1) + 'alpha(ld(0),ld(1))' : 'alpha(X,Y)';
    return ['format=gbrap', `geq=r='${one(0)}':g='${one(1)}':b='${one(2)}':a='${al}'`];
  }
  // per-effect numbers shared by fxVals and fxChain
  function fxP(id, a, w, h, dur) {
    switch (id) {
      case 'bounce': case 'sway': { const m = q4(a * .04); return { m, z: 1 / (1 - 2 * m) }; }
      case 'earthquake': { const m = q4(a * .07); return { m, z: 1 / (1 - 2 * m) }; }
      case 'zoomIn': case 'zoomOut': return { k: q4(.3 * a), d: q4(Math.max(.1, dur || 1)) };
      case 'zoomBeat': return { k: q4(.15 * a) };
      case 'drunk': case 'wobble': case 'tilt': { const A = q4(a * (id === 'tilt' ? .2 : id === 'drunk' ? .08 : .05)); return { A, z: Math.cos(A) + Math.sin(A) * Math.max(w / h, h / w) }; }
      case 'wave': return { A: q4(a * .03) };
      case 'ripple': return { A: q4(a * .02) };
      case 'bulge': case 'pinch': return { s: q4(a * .6) };
      case 'swirl': return { s: q4(a * 4) };
      case 'posterize': return { N: Math.max(2, Math.round(8 - 6 * a)) - 1 };
      case 'comic': return { thr: q4(.65 - .3 * a) };
      case 'emboss': case 'sharpen': return { k: Math.round(a * 10) / 10 };
      case 'sketch': return { K: q4(1 + 3 * a) };
      case 'dots': return { s: Math.max(4, Math.round((.01 + a * .04) * w)) };
      case 'scanlines': return { k: q4(1 - .6 * a) };
      case 'nightVision': return { g: q4(.12 + a * .18) };
      case 'oldFilm': return { g: q4(a * .2), ang: q4(.5 + .4 * a) };
      case 'strobe': return { f: q4(2 + 6 * a) };
      case 'blackout': return { f: q4(1 + 3 * a) };
      case 'rgbSplitV': return { o: fxSplit(a, h, .02) };
      case 'ghost': return { o: Math.max(1, Math.round(a * .06 * w)) };
      case 'hueCycle': return { deg: q4(60 + 300 * a) };
      case 'border': return { b: Math.max(1, Math.round(a * .05 * Math.min(w, h))) };
      case 'slices': return { A: q4(a * .3), sh: Math.max(4, Math.round(h / 24)) };
    }
    return {};
  }
  const EMBOSS = [-2, -1, 0, -1, 0, 1, 0, 1, 2], SHARPEN = [0, -1, 0, -1, 4, -1, 0, -1, 0];
  const frac = x => x - Math.floor(x);
  const sliceN = t => Math.floor(t * 8) % 64;
  const fxOf = it => it && it.fx && FX.includes(it.fx.id) ? { id: it.fx.id, a: clamp(num(it.fx.a, 0.5), 0, 1) } : null;
  const fxShake = (m, t) => [m * Math.sin(t * 37) * Math.sin(t * 13), m * Math.sin(t * 29 + 1) * Math.sin(t * 7)];
  const FXE = { // shared time curves: [js, ffmpeg] of clip time t
    pulse: [t => Math.pow(Math.max(0, Math.sin(2 * Math.PI * 2 * t)), 4), 'pow(max(0,sin(2*PI*2*t)),4)'],
    beat: [t => Math.pow(Math.max(0, Math.sin(2 * Math.PI * t)), 12), 'pow(max(0,sin(2*PI*t)),12)'],
    flash: [t => Math.pow(Math.max(0, Math.sin(2 * Math.PI * 1.5 * t)), 8), 'pow(max(0,sin(2*PI*1.5*t)),8)'],
    burst: [t => (Math.floor(t * 8) * 7919) % 13 > 8 ? 1 : 0, 'gt(mod(floor(t*8)*7919,13),8)'],
  };
  const fxSplit = (a, w, k) => Math.max(1, Math.round(a * k * w));
  function fxVals(it, t, w, h) {
    const f = fxOf(it);
    if (!f) return null;
    if (FXG_BY[f.id]) return { i: FX.indexOf(f.id) + 1, v: [f.a, t, 0, 0] };
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
      default: { const p = fxP(f.id, a, w, h, it.dur);
        switch (f.id) {
          case 'bounce': v[1] = p.m * Math.abs(Math.sin(1.6 * Math.PI * t)); v[2] = p.z; break;
          case 'sway': v[0] = p.m * Math.sin(Math.PI * t); v[2] = p.z; break;
          case 'earthquake': v[0] = p.m * Math.sin(t * 61) * Math.sin(t * 17); v[1] = p.m * Math.sin(t * 53 + 2) * Math.sin(t * 11); v[2] = p.z; break;
          case 'zoomIn': v[2] = 1 + p.k * Math.min(t / p.d, 1); break;
          case 'zoomOut': v[2] = 1 + p.k * (1 - Math.min(t / p.d, 1)); break;
          case 'zoomBeat': v[2] = 1 + p.k * FXE.beat[0](t); break;
          case 'drunk': v[0] = p.A * Math.sin(.8 * Math.PI * t); v[1] = p.z; break;
          case 'wobble': v[0] = p.A * Math.sin(t * 31) * Math.sin(t * 7); v[1] = p.z; break;
          case 'tilt': v[0] = p.A; v[1] = p.z; break;
          case 'wave': v[0] = p.A; v[1] = .8 * t; break;
          case 'ripple': v[0] = p.A; v[1] = 6 * t; break;
          case 'bulge': case 'pinch': case 'swirl': v[0] = p.s; break;
          case 'posterize': v[0] = p.N; break;
          case 'comic': v[0] = p.thr; break;
          case 'emboss': case 'sharpen': v[0] = p.k; break;
          case 'sketch': v[0] = p.K; break;
          case 'dots': v[0] = p.s; break;
          case 'scanlines': v[0] = p.k; break;
          case 'nightVision': v[0] = .9; v[1] = p.g; break;
          case 'oldFilm': v[0] = p.ang; v[1] = p.g; v[2] = .05 * Math.sin(t * 31) * Math.sin(t * 7); break;
          case 'strobe': v[0] = frac(t * p.f) < .3 ? 1 : 0; break;
          case 'blackout': v[0] = frac(t * p.f) < .15 ? 1 : 0; break;
          case 'rgbSplitV': case 'ghost': v[0] = p.o; break;
          case 'hueCycle': v[0] = p.deg * t * Math.PI / 180; break;
          case 'border': v[0] = p.b; break;
          case 'slices': v[0] = p.A; v[1] = p.sh; v[2] = sliceN(t); break;
        }
      }
    }
    return { i: FX.indexOf(f.id) + 1, v };
  }
  function fxChain(it, w, h) {
    const f = fxOf(it);
    if (!f) return [];
    if (FXG_BY[f.id]) return fxgChain(FXG_BY[f.id], f.a);
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
    // the rest: per-pixel maps with geq (same formulas as the preview shader, pixel centres at X+0.5)
    const p = fxP(f.id, a, w, h, it.dur);
    const UX = '((X+0.5)/W)', UY = '((Y+0.5)/H)', PX = '((X+0.5-W/2)/H)', PY = '((Y+0.5-H/2)/H)', PR = `hypot(${PX},${PY})`;
    const geq = (r, g, b, al = 'alpha(X,Y)') => ['format=gbrap', `geq=r='${r}':g='${g}':b='${b}':a='${al}'`];
    const remap = (ux, uy) => { const x = `(${ux})*W-0.5`, y = `(${uy})*H-0.5`; return geq(`r(${x},${y})`, `g(${x},${y})`, `b(${x},${y})`, `alpha(${x},${y})`); };
    const polar = (nx, ny) => remap(`0.5+(${nx})*H/W`, `0.5+(${ny})`);
    const each = fn => geq(fn('r'), fn('g'), fn('b'));
    const shift = (x, y) => [`scale=${ev(w * p.z)}:${ev(h * p.z)}`, `crop=${w}:${h}:x='(iw-ow)/2+${x}*iw':y='(ih-oh)/2+${y}*ih'`];
    const zoom = Z => [`scale=w='trunc(iw*${Z}/2)*2':h='trunc(ih*${Z}/2)*2':eval=frame`, `crop=${w}:${h}:(iw-ow)/2:(ih-oh)/2`];
    const turn = ang => [`scale=${ev(w * p.z)}:${ev(h * p.z)}`, `rotate=a='${ang}':ow=${w}:oh=${h}:c=black`];
    const kern = K => { const m = K.map((k, i) => Math.round(((i === 4 ? 1 : 0) + p.k * k) * 10)).join(' ');
      return ['format=gbrap', `convolution=0m='${m}':1m='${m}':2m='${m}':0rdiv=0.1:1rdiv=0.1:2rdiv=0.1`]; };
    const lumAt = (x, y) => `(0.299*r(${x},${y})+0.587*g(${x},${y})+0.114*b(${x},${y}))`;
    const grain = g => `noise=alls=${Math.round(g / 0.31 * 40)}:allf=t+u`;
    switch (f.id) {
      case 'bounce': return shift(0, `${p.m}*abs(sin(1.6*PI*t))`);
      case 'sway': return shift(`${p.m}*sin(PI*t)`, 0);
      case 'earthquake': return shift(`${p.m}*sin(t*61)*sin(t*17)`, `${p.m}*sin(t*53+2)*sin(t*11)`);
      case 'zoomIn': return zoom(`(1+${p.k}*min(t/${p.d},1))`);
      case 'zoomOut': return zoom(`(1+${p.k}*(1-min(t/${p.d},1)))`);
      case 'zoomBeat': return zoom(`(1+${p.k}*${FXE.beat[1]})`);
      case 'drunk': return turn(`${p.A}*sin(0.8*PI*t)`);
      case 'wobble': return turn(`${p.A}*sin(t*31)*sin(t*7)`);
      case 'tilt': return turn(p.A);
      case 'mirror': return remap(`if(lt(${UX},0.5),${UX},1-${UX})`, UY);
      case 'mirrorV': return remap(UX, `if(lt(${UY},0.5),${UY},1-${UY})`);
      case 'quad': return remap(`2*${UX}-floor(2*${UX})`, `2*${UY}-floor(2*${UY})`);
      case 'grid9': return remap(`3*${UX}-floor(3*${UX})`, `3*${UY}-floor(3*${UY})`);
      case 'split3': return remap(`0.5+(3*${UX}-floor(3*${UX})-0.5)/3`, UY);
      case 'kaleido': return remap(`0.5-abs(${UX}-0.5)`, `0.5-abs(${UY}-0.5)`);
      case 'wave': return remap(`${UX}+${p.A}*sin(2*PI*(3*${UY}+0.8*T))`, UY);
      case 'ripple': { const k = `(1+${p.A}*sin(40*${PR}-6*T)/(${PR}+0.0001))`; return polar(`${PX}*${k}`, `${PY}*${k}`); }
      case 'bulge': case 'pinch': { const k = `if(lt(${PR},0.5),1${f.id === 'bulge' ? '-' : '+'}${p.s}*(1-4*${PR}*${PR}),1)`; return polar(`${PX}*${k}`, `${PY}*${k}`); }
      case 'swirl': { const g = `if(lt(${PR},0.5),${p.s}*(1-2*${PR})*(1-2*${PR}),0)`; return polar(`cos(${g})*${PX}-sin(${g})*${PY}`, `sin(${g})*${PX}+cos(${g})*${PY}`); }
      case 'posterize': { const e = `'floor(val/255*${p.N}+0.5)*255/${p.N}'`; return [`lutrgb=r=${e}:g=${e}:b=${e}`]; }
      case 'comic': { const e = `255*gte(0.2126*r(X,Y)+0.7152*g(X,Y)+0.0722*b(X,Y),${q4(p.thr * 255)})`; return geq(e, e, e); }
      case 'emboss': return kern(EMBOSS);
      case 'sharpen': return kern(SHARPEN);
      case 'sketch': { const L = lumAt('X', 'Y'); return [...geq(L, L, L), `sobel=planes=7:scale=${p.K}`, 'negate']; }
      case 'dots': { const cx = `((floor((X+0.5)/${p.s})+0.5)*${p.s})`, cy = `((floor((Y+0.5)/${p.s})+0.5)*${p.s})`, sx = `${cx}-0.5`, sy = `${cy}-0.5`;
        const on = `lt(hypot(X+0.5-${cx},Y+0.5-${cy}),${q4(.6 * p.s)}*sqrt(${lumAt(sx, sy)}/255))`;
        return each(c => `if(${on},${c}(${sx},${sy}),0)`); }
      case 'scanlines': return each(c => `${c}(X,Y)*if(eq(mod(Y,3),0),${p.k},1)`);
      case 'nightVision': { const m = (k, c) => q4(k * c), L = [.299, .587, .114];
        return [`colorchannelmixer=rr=${m(.15, L[0])}:rg=${m(.15, L[1])}:rb=${m(.15, L[2])}:gr=${m(1.25, L[0])}:gg=${m(1.25, L[1])}:gb=${m(1.25, L[2])}:br=${m(.25, L[0])}:bg=${m(.25, L[1])}:bb=${m(.25, L[2])}`,
          grain(p.g), 'vignette=angle=0.9']; }
      case 'oldFilm': return ['colorchannelmixer=rr=.393:rg=.769:rb=.189:gr=.349:gg=.686:gb=.168:br=.272:bg=.534:bb=.131',
        `eq=brightness='0.05*sin(t*31)*sin(t*7)':eval=frame`, grain(p.g), `vignette=angle=${p.ang}`];
      case 'strobe': return [`negate=enable='lt(t*${p.f}-floor(t*${p.f}),0.3)'`];
      case 'blackout': return [`drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='lt(t*${p.f}-floor(t*${p.f}),0.15)'`];
      case 'rgbSplitV': return ['format=gbrap', `rgbashift=rv=-${p.o}:bv=${p.o}`];
      case 'ghost': return each(c => `(${c}(X,Y)+${c}(X+${p.o},Y))/2`);
      case 'hueCycle': return [`hue=h='${p.deg}*t'`];
      case 'border': return [`drawbox=x=0:y=0:w=iw:h=ih:color=white:t=${p.b}`];
      case 'slices': { const hv = `(sin(floor((Y+0.5)/${p.sh})*1.7+mod(floor(T*8),64)*3.1)*43.758)`, hh = `(${hv}-floor(${hv}))`;
        return remap(`${UX}+if(gt(${hh},0.7),(${hh}-0.85)*${p.A},0)`, UY); }
    }
    return [];
  }

  const api = { FX, FX_CAT, FXG, FXG0, fxgGLSL, fxOf, fxVals, fxChain, TR_MOVE, trSub, trVal, BLEND_FF, TRANS, GLT, TR_SLIDE, TR_DIP, TR_GEQ, ease3, easeExpr, transClip, transIn, transOut, hasKey, keyUV, MASKS, MASK_DEF, hasMask, drawMask, num, clamp, CURVES, curveSpeed, curveDur, uAtF, fAtU, hasCurve, srcLen, srcAt, ltAt, rateAt, subCurve, EASE, VA_IN, VA_OUT, VA_LOOP, RICH, vaFx, richSegs, segFrames, hasVa, vaDelta, withVa, bakeVa, PRESETS, grade, HSL_BANDS, LOOKS, LUT_N, hasColor, colorFn, curveFn, parseCube, sampleLut, bakeLut, cubeText, colorKey, srcCrop, logoBox, layout, fadeAlpha, audioFade, fxKey, projectDur, scaleProject, parseWhisper, groupWords, trkAt, trkExpr, pwExpr, KF, kfVal, hasKf, animAt, shiftTimes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaqtoShared = api;
})(this);
