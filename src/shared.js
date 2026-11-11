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

  const api = { FX, FX_CAT, fxOf, fxVals, fxChain, TR_MOVE, trSub, trVal, BLEND_FF, TRANS, GLT, TR_SLIDE, TR_DIP, TR_GEQ, ease3, easeExpr, transClip, transIn, transOut, hasKey, keyUV, MASKS, MASK_DEF, hasMask, drawMask, num, clamp, CURVES, curveSpeed, curveDur, uAtF, fAtU, hasCurve, srcLen, srcAt, ltAt, rateAt, subCurve, EASE, VA_IN, VA_OUT, VA_LOOP, hasVa, vaDelta, withVa, bakeVa, PRESETS, grade, HSL_BANDS, LOOKS, LUT_N, hasColor, colorFn, curveFn, parseCube, sampleLut, bakeLut, cubeText, colorKey, srcCrop, logoBox, layout, fadeAlpha, audioFade, fxKey, projectDur, scaleProject, parseWhisper, groupWords, trkAt, trkExpr, pwExpr, KF, kfVal, hasKf, animAt, shiftTimes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaqtoShared = api;
})(this);
