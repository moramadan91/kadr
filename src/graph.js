// Project JSON -> ffmpeg arguments. Pure; runs in the app and in test/selftest.js.
(function (root) {
  const S = typeof module !== 'undefined' && module.exports ? require('./shared') : root.KadrShared;
  const num = S.num;
  const f3 = v => (+v).toFixed(3);
  const signed = v => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(3);

  function atempo(sp) {
    const f = [];
    let s = sp;
    while (s > 2) { f.push('atempo=2'); s /= 2; }
    while (s < 0.5) { f.push('atempo=0.5'); s /= 0.5; }
    if (Math.abs(s - 1) > 1e-6) f.push('atempo=' + +s.toFixed(6));
    return f;
  }

  function audible(p, it) {
    const m = it.media && p.media[it.media];
    return !!m && !it.muted && num(it.volume, 1) > 0 && (m.kind === 'audio' || (m.kind === 'video' && m.hasAudio));
  }

  const ENCODERS = {
    h264: q => ['-c:v', 'libx264', '-preset', 'medium', '-crf', String({ low: 23, rec: 18, high: 14 }[q] ?? 18), '-pix_fmt', 'yuv420p'],
    hevc: q => ['-c:v', 'libx265', '-preset', 'medium', '-crf', String({ low: 26, rec: 20, high: 16 }[q] ?? 20), '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
    h264_hw: q => ['-c:v', 'h264_videotoolbox', '-q:v', String({ low: 50, rec: 65, high: 80 }[q] ?? 65), '-pix_fmt', 'yuv420p'],
    hevc_hw: q => ['-c:v', 'hevc_videotoolbox', '-q:v', String({ low: 50, rec: 65, high: 80 }[q] ?? 65), '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
    prores: () => ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le'],
    proxy: () => ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-g', '12', '-pix_fmt', 'yuv420p'], // preview only: quick to make, quick to seek
  };

  // Source time -> clip time. A curve becomes a piecewise-linear setpts over source seconds.
  function timeChain(it, fps) {
    const ch = [];
    if (S.hasCurve(it)) {
      const n = 64, pts = [];
      for (let i = 0; i <= n; i++) pts.push([it.curve.src * i / n, S.ltAt(it, it.curve.src * i / n)]);
      ch.push('setpts=PTS-STARTPTS', `setpts='(${S.pwExpr(pts, 0, false, 'T')})/TB'`);
    } else ch.push(`setpts=(PTS-STARTPTS)/${num(it.speed, 1)}`);
    // smooth slow motion: motion-compensated in-between frames where the clip plays slower than real time
    const slow = S.hasCurve(it) ? it.curve.pts.some(p => p[1] < 1) : num(it.speed, 1) < 1;
    if (it.smooth && slow) ch.push(`minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`);
    ch.push(`fps=${fps}`);
    return ch;
  }
  // Constant-rate tempo change: keeps pitch (atempo) unless the clip asks for the pitch to follow the speed.
  const tempo = (it, r) => it.pitch ? (Math.abs(r - 1) > 1e-6 ? [`asetrate=${Math.round(48000 * r)}`, 'aresample=48000'] : []) : atempo(r);

  // o: { out, textList (ffconcat path or null), audioOnly, codec }
  function buildArgs(p, o) {
    const W = p.w, H = p.h, fps = p.fps, T = S.projectDur(p);
    if (!(T > 0)) throw new Error('empty timeline');
    const vt = p.tracks.filter(t => t.kind === 'video').map(t => t.id).reverse(); // bottom layer first
    const vis = o.audioOnly || o.audioExport ? [] : p.items
      .filter(i => vt.includes(i.track) && !i.hidden && i.media && p.media[i.media] && p.media[i.media].kind !== 'audio')
      .sort((a, b) => vt.indexOf(a.track) - vt.indexOf(b.track) || a.start - b.start);
    const aud = p.items.filter(i => audible(p, i));

    const args = ['-y', '-hide_banner', '-nostats'];
    const even = v => Math.max(2, Math.round(v / 2) * 2);
    const fc = [];
    const idx = new Map();
    let n = 0;
    const input = it => {
      if (idx.has(it.id)) return idx.get(it.id);
      const m = p.media[it.media];
      if (m.kind === 'image') args.push('-loop', '1', '-framerate', String(fps), '-t', f3(it.dur), '-i', m.path);
      else args.push('-ss', f3(num(it.in, 0)), '-t', f3(S.srcLen(it)), '-i', m.path);
      idx.set(it.id, n);
      return n++;
    };

    if (!o.audioOnly && !o.audioExport) {
      let base = 'b0';
      fc.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${f3(T)},format=yuv420p[b0]`);
      vis.forEach((it0, j) => {
        const k = input(it0), m = p.media[it0.media], it = S.bakeVa(it0, W, H), g = S.grade(it), C = S.srcCrop(it, m);
        const kf = S.hasKf(it) ? it.kf : null, LP = it._loop ? S.VA_LOOP[it._loop] : null, sm = !it._lin;
        const LK = { scale: 's', rotate: 'r', x: 'dx', y: 'dy' };
        const has = f => !!(kf && kf[f] && kf[f].length) || !!(LP && LP.e[LK[f]]);
        const dyn = kf || LP;
        // property f as an expression of clock tv (off = clip start in that clock): keyframes/static, then the loop on top
        const ex = (f, off, tv, def) => {
          let e = kf && kf[f] && kf[f].length ? S.pwExpr(kf[f], off, sm, tv) : String(num(it[f], def));
          const l = LP && LP.e[LK[f]];
          if (l) {
            const q = l(`(${tv}-${(+off).toFixed(4)})`, it.dur);
            e = f === 'scale' ? `(${e})*(${q})` : f === 'x' ? `(${e})+(${q})*${W}` : f === 'y' ? `(${e})+(${q})*${H}` : `(${e})+(${q})`;
          }
          return e;
        };
        // animated scale: lay out at the largest scale, then shrink per frame
        const smax = (kf && kf.scale ? Math.max(...kf.scale.map(q => q[1])) : num(it.scale, 1)) * (LP && LP.smax || 1);
        const L = S.layout({ ...it, scale: smax }, m, W, H);
        const ch = timeChain(it, fps);
        const TI = S.transIn(p, it0), TO = S.transOut(p, it0), d3 = v => (+v).toFixed(4);
        if (TO) ch.push(`tpad=stop_mode=clone:stop_duration=${f3(TO.d)}`); // hold the last frame under the next clip's transition
        if (it.logo && it.logo.on) { const b = S.logoBox(it.logo, m); ch.push(`delogo=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}`); }
        if (S.hasKey(it)) { const K = it.chroma; ch.push('format=yuva444p', `chromakey=color=${String(K.color || '#00ff00').replace('#', '0x')}:similarity=${num(K.sim, 0.3).toFixed(3)}:blend=${num(K.blend, 0.1).toFixed(3)}`); }
        if (C.any) ch.push(`scale=${m.w}:${m.h}`, `crop=${C.w}:${C.h}:${C.x}:${C.y}`);
        if (it.flipH) ch.push('hflip');
        if (it.flipV) ch.push('vflip');
        ch.push(`scale=${L.sw}:${L.sh}:flags=bicubic`, `crop=${L.cw}:${L.ch}:${L.cx}:${L.cy}`, 'setsar=1');
        const lut = o.luts && o.luts[it0.id]; // advanced colour: the whole grade as one baked 3D LUT
        if (lut) ch.push(`lut3d=file='${lut.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, '')}'`);
        else if (!g.identity) {
          const e = c => `'clip(val*${c.slope.toFixed(5)}${signed(c.intercept * 255)},0,255)'`;
          ch.push(`lutrgb=r=${e(g.ch[0])}:g=${e(g.ch[1])}:b=${e(g.ch[2])}`);
          if (Math.abs(g.s - 1) > 1e-4) ch.push(`hue=s=${g.s.toFixed(4)}`);
        }
        const mk = o.masks && o.masks[it0.id];
        if (mk) { // mask: grey PNG at the box size, its brightness becomes the clip's alpha
          const mi = n++;
          args.push('-loop', '1', '-framerate', String(fps), '-t', f3(it.dur + 3), '-i', mk);
          fc.push(`[${k}:v]${ch.join(',')},format=yuva420p[pm${j}]`, `[${mi}:v]scale=${L.cw}:${L.ch},format=gray[mm${j}]`, `[pm${j}][mm${j}]alphamerge[ma${j}]`);
          ch.length = 0; ch.push('null');
        }
        ch.push('format=yuva420p');
        if (TI) { // the incoming side, in clip time
          const d = TI.d, c = S.TR_DIP[TI.id];
          if (TI.id === 'fade') ch.push(`fade=t=in:st=0:d=${d3(d)}:alpha=1`);
          else if (S.TR_MOVE[TI.id]) ch.push(`fade=t=in:st=${d3(d / 2)}:d=${d3(1 / fps)}:alpha=1`); // new clip takes over at the middle
          else if (c) ch.push(`fade=t=in:st=${d3(d / 2)}:d=${d3(1 / fps)}:alpha=1`, `fade=t=in:st=${d3(d / 2)}:d=${d3(d / 2)}:color=${c.replace('#', '0x')}`);
          else if (S.TR_GEQ[TI.id]) ch.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${S.TR_GEQ[TI.id].replace(/P/g, S.easeExpr(`clip(T/${d3(d)},0,1)`))})':enable='lt(t,${d3(d)})'`);
        }
        { // zoom / spin / colour split on either side of a cut-in-the-middle transition
          const MA = TO && S.TR_MOVE[TO.id] && S.TR_MOVE[TO.id].a, MB = TI && S.TR_MOVE[TI.id] && S.TR_MOVE[TI.id].b;
          const sides = [MB && [MB, `clip((t-${d3(TI.d / 2)})/${d3(TI.d / 2)},0,1)`, `lt(t,${d3(TI.d)})`], MA && [MA, `clip((t-${d3(it.dur)})/${d3(TO.d / 2)},0,1)`, `gte(t,${d3(it.dur)})`]].filter(Boolean);
          const part = (k, def, op) => sides.filter(([M]) => M[k] != null).map(([M, u, on]) => `if(${on},${S.trSub(M[k], u)},${def})`).join(op);
          const Z = part('z', 1, '*'), R = part('r', 0, '+');
          if (Z) ch.push(`scale=w='max(2,trunc(iw*(${Z})/2)*2)':h='max(2,trunc(ih*(${Z})/2)*2)':eval=frame`); // rotate (below) or crop brings it back to the box
          if (Z && !R) ch.push(`crop=${L.cw}:${L.ch}:(iw-ow)/2:(ih-oh)/2`);
          if (R) ch.push(`rotate=a='(${R})*PI/180':ow=${L.cw}:oh=${L.ch}:c=black@0`);
          const G = sides.filter(([M]) => M.rgb).map(([, , on]) => on).join('+');
          if (G) { const px = Math.max(2, Math.round(L.cw * 0.012)); ch.push('format=gbrap', `rgbashift=rh=-${px}:bh=${px}:enable='${G}'`, 'format=yuva420p'); }
        }
        if (TO && S.TR_DIP[TO.id]) ch.push(`fade=t=out:st=${f3(it.dur)}:d=${d3(TO.d / 2)}:color=${S.TR_DIP[TO.id].replace('#', '0x')}`);
        let ox = L.ox, oy = L.oy;
        const rot = num(it.rotate, 0) * Math.PI / 180;
        // keyframed: rotate on a fixed square canvas first, then shrink per frame (rotate can't take changing sizes)
        let bw = L.cw, bh = L.ch;
        if (dyn && (has('rotate') || rot)) {
          bw = bh = even(Math.hypot(L.cw, L.ch));
          ch.push(`rotate=a='${has('rotate') ? `(${ex('rotate', 0, 't', 0)})*PI/180` : rot.toFixed(6)}':ow=${bw}:oh=${bh}:c=black@0`);
        }
        if (has('opacity')) ch.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*clip(${S.pwExpr(kf.opacity, 0, sm, 'T')},0,1)'`);
        if (has('scale')) {
          const sc = ex('scale', 0, 't', 1);
          ch.push(`scale=w='max(2,trunc(${bw}*(${sc})/${smax}/2)*2)':h='max(2,trunc(${bh}*(${sc})/${smax}/2)*2)':eval=frame`);
          // pad back to a fixed size every frame: overlay keeps stale pixels when its input size changes
          ch.push(`pad=w=${bw}:h=${bh}:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame`);
        }
        if (dyn) {} else if (rot) { // rotate about the box centre; the bigger canvas stays centred on the same point
          const rw = even(Math.abs(L.cw * Math.cos(rot)) + Math.abs(L.ch * Math.sin(rot))), rh = even(Math.abs(L.cw * Math.sin(rot)) + Math.abs(L.ch * Math.cos(rot)));
          ch.push(`rotate=a=${rot.toFixed(6)}:ow=${rw}:oh=${rh}:c=black@0`);
          ox = Math.round(L.ox + (L.cw - rw) / 2); oy = Math.round(L.oy + (L.ch - rh) / 2);
        }
        const opacity = num(it.opacity, 1);
        if (!has('opacity') && opacity < 1) ch.push(`colorchannelmixer=aa=${opacity.toFixed(3)}`);
        const fi = num(it.fadeIn, 0), fo = num(it.fadeOut, 0);
        if (fi > 0) ch.push(`fade=t=in:st=0:d=${f3(fi)}:alpha=1`);
        if (fo > 0) ch.push(`fade=t=out:st=${f3(it.dur - fo)}:d=${f3(fo)}:alpha=1`);
        ch.push(`setpts=PTS+${f3(it.start)}/TB`);
        fc.push(`[${mk ? `ma${j}` : `${k}:v`}]${ch.join(',')}[v${j}]`);
        let tx = it.trk ? `'${ox}+${S.trkExpr(it, W, 0)}'` : ox, ty = it.trk ? `'${oy}+${S.trkExpr(it, H, 1)}'` : oy;
        if (dyn) { // centre-based so size changes (scale/rotate canvas) stay anchored
          const px = ex('x', it.start, 't', 0), py = ex('y', it.start, 't', 0);
          tx = `'W/2+(${px})-w/2${it.trk ? '+' + S.trkExpr(it, W, 0) : ''}'`; ty = `'H/2+(${py})-h/2${it.trk ? '+' + S.trkExpr(it, H, 1) : ''}'`;
        }
        // slides move the whole layer: an offset on the overlay position
        const term = (v, add) => typeof v === 'number' ? `'${v}${add}'` : v.slice(0, -1) + add + "'";
        const slide = (s0, d, sign, of) => { const [dx, dy] = S.TR_SLIDE[of], e = S.easeExpr(`clip((t-${d3(s0)})/${d3(d)},0,1)`), f = sign > 0 ? `(1-${e})` : e;
          if (dx) tx = term(tx, `${dx * sign > 0 ? '+' : '-'}W*${f}`);
          if (dy) ty = term(ty, `${dy * sign > 0 ? '+' : '-'}H*${f}`); };
        if (TI && S.TR_SLIDE[TI.id]) slide(it.start, TI.d, 1, TI.id);
        if (TO && S.TR_SLIDE[TO.id]) slide(it.start + it.dur, TO.d, -1, TO.id);
        const shift = (M, s0, h) => { if (M && M.x != null) tx = term(tx, `+W*if(between(t,${d3(s0)},${d3(s0 + h)}),${S.trSub(M.x, `clip((t-${d3(s0)})/${d3(h)},0,1)`)},0)`); };
        if (TI && S.TR_MOVE[TI.id]) shift(S.TR_MOVE[TI.id].b, it.start + TI.d / 2, TI.d / 2);
        if (TO && S.TR_MOVE[TO.id]) shift(S.TR_MOVE[TO.id].a, it.start + it.dur, TO.d / 2);
        const BM = it.blend && S.BLEND_FF[it.blend];
        if (BM) { // blend mode: place the layer on a clear frame, blend it with everything below, keep only where the layer is
          const [bx, lg] = BM[1] ? [`lg${j}`, `bx${j}`] : [`bx${j}`, `lg${j}`];
          fc.push(`color=c=black@0:s=${W}x${H}:r=${fps}:d=${f3(T)},format=yuva420p[cl${j}]`,
            `[cl${j}][v${j}]overlay=x=${tx}:y=${ty}:eof_action=pass,format=yuva444p,split[ly${j}][lz${j}]`, `[lz${j}]alphaextract[la${j}]`,
            `[${base}]split[bs${j}][bt${j}]`, `[bs${j}]format=gbrp[bx${j}]`, `[ly${j}]format=gbrp[lg${j}]`,
            `[${bx}][${lg}]blend=all_mode=${BM[0]},format=yuv420p[bl${j}]`, `[bl${j}][la${j}]alphamerge[bm${j}]`,
            `[bt${j}][bm${j}]overlay=0:0[b${j + 1}]`);
        } else fc.push(`[${base}][v${j}]overlay=x=${tx}:y=${ty}:eof_action=pass[b${j + 1}]`);
        base = `b${j + 1}`;
      });
      if (o.textList) {
        const k = n++;
        args.push('-f', 'concat', '-safe', '0', '-i', o.textList);
        fc.push(`[${k}:v]format=rgba[tx]`, `[${base}][tx]overlay=0:0:eof_action=pass[bt]`);
        base = 'bt';
      }
      fc.push(`[${base}]format=yuv420p[vout]`);
    }

    const al = [];
    aud.forEach((it, j) => {
      const am = p.media[it.media], fk = S.fxKey(it), fx = fk && am.fx && am.fx[fk]; // processed copy of the same source
      const k = fx ? (args.push('-ss', f3(num(it.in, 0)), '-t', f3(S.srcLen(it)), '-i', fx), n++) : input(it), v = num(it.volume, 1);
      const fi = Math.max(num(it.fadeIn, 0), num(it.afIn, 0)), fo = Math.max(num(it.fadeOut, 0), num(it.afOut, 0));
      const ch = ['aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', 'asetpts=PTS-STARTPTS'];
      let src = `${k}:a`;
      if (S.hasCurve(it)) { // curve: short constant-speed pieces joined back together
        const K = Math.min(48, Math.max(8, Math.ceil(it.curve.src / 0.2))), seg = [];
        fc.push(`[${k}:a]${ch.join(',')},asplit=${K}${Array.from({ length: K }, (_, q) => `[s${j}_${q}]`).join('')}`);
        for (let q = 0; q < K; q++) {
          const a = it.curve.src * q / K, b = it.curve.src * (q + 1) / K, r = (b - a) / Math.max(1e-4, S.ltAt(it, b) - S.ltAt(it, a));
          fc.push(`[s${j}_${q}]atrim=start=${f3(a)}:end=${f3(b)},asetpts=PTS-STARTPTS${tempo(it, r).map(x => ',' + x).join('')}[c${j}_${q}]`);
          seg.push(`[c${j}_${q}]`);
        }
        fc.push(`${seg.join('')}concat=n=${K}:v=0:a=1[cv${j}]`);
        src = `cv${j}`; ch.length = 0;
      } else ch.push(...tempo(it, num(it.speed, 1)));
      if (v !== 1) ch.push(`volume=${v}`);
      if (fi > 0) ch.push(`afade=t=in:st=0:d=${f3(fi)}`);
      if (fo > 0) ch.push(`afade=t=out:st=${f3(it.dur - fo)}:d=${f3(fo)}`);
      ch.push(`adelay=${Math.round(it.start * 1000)}:all=1`);
      fc.push(`[${src}]${ch.join(',') || 'anull'}[a${j}]`);
      al.push(`[a${j}]`);
    });
    if (al.length) fc.push(`${al.join('')}amix=inputs=${al.length}:normalize=0:duration=longest,apad=whole_dur=${f3(T)}[aout]`);
    else fc.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${f3(T)}[aout]`);

    args.push('-filter_complex', fc.join(';'));
    if (o.audioExport) {
      const ac = { mp3: ['-c:a', 'libmp3lame', '-b:a', '320k'], wav: ['-c:a', 'pcm_s16le', '-ar', '48000'], m4a: ['-c:a', 'aac', '-b:a', '256k'] }[o.audioExport];
      args.push('-map', '[aout]', ...ac, '-t', f3(T), '-progress', 'pipe:1', o.out);
    } else if (o.audioOnly) {
      args.push('-map', '[aout]', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', f3(T), o.out);
    } else {
      args.push('-map', '[vout]', '-map', '[aout]', ...(ENCODERS[o.codec] || ENCODERS.h264)(o.quality),
        '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
        '-t', f3(T), '-progress', 'pipe:1', o.out);
    }
    return { args, duration: T };
  }

  // list: [{name, frames}] -> ffconcat text (paths relative to the list file).
  function concatText(list, fps) {
    const L = ['ffconcat version 1.0'];
    for (const f of list) L.push(`file '${f.name}'`, `duration ${(f.frames / fps).toFixed(6)}`);
    L.push(`file '${list[list.length - 1].name}'`);
    return L.join('\n') + '\n';
  }

  const api = { buildArgs, concatText, atempo, ENCODERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KadrGraph = api;
})(this);
