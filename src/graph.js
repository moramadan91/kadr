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
  };

  // o: { out, textList (ffconcat path or null), audioOnly, codec }
  function buildArgs(p, o) {
    const W = p.w, H = p.h, fps = p.fps, T = S.projectDur(p);
    if (!(T > 0)) throw new Error('empty timeline');
    const vt = p.tracks.filter(t => t.kind === 'video').map(t => t.id).reverse(); // bottom layer first
    const vis = o.audioOnly || o.audioExport ? [] : p.items
      .filter(i => vt.includes(i.track) && i.media && p.media[i.media] && p.media[i.media].kind !== 'audio')
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
      else args.push('-ss', f3(num(it.in, 0)), '-t', f3(it.dur * num(it.speed, 1)), '-i', m.path);
      idx.set(it.id, n);
      return n++;
    };

    if (!o.audioOnly && !o.audioExport) {
      let base = 'b0';
      fc.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${f3(T)},format=yuv420p[b0]`);
      vis.forEach((it, j) => {
        const k = input(it), m = p.media[it.media], g = S.grade(it), C = S.srcCrop(it, m);
        const kf = S.hasKf(it) ? it.kf : null, has = f => !!(kf && kf[f] && kf[f].length);
        // keyframed scale: lay out at the largest scale, then shrink per frame
        const smax = has('scale') ? Math.max(...kf.scale.map(q => q[1])) : num(it.scale, 1);
        const L = S.layout({ ...it, scale: smax }, m, W, H);
        const ch = [`setpts=(PTS-STARTPTS)/${num(it.speed, 1)}`, `fps=${fps}`];
        if (C.any) ch.push(`scale=${m.w}:${m.h}`, `crop=${C.w}:${C.h}:${C.x}:${C.y}`);
        if (it.flipH) ch.push('hflip');
        if (it.flipV) ch.push('vflip');
        ch.push(`scale=${L.sw}:${L.sh}:flags=bicubic`, `crop=${L.cw}:${L.ch}:${L.cx}:${L.cy}`, 'setsar=1');
        if (!g.identity) {
          const e = c => `'clip(val*${c.slope.toFixed(5)}${signed(c.intercept * 255)},0,255)'`;
          ch.push(`lutrgb=r=${e(g.ch[0])}:g=${e(g.ch[1])}:b=${e(g.ch[2])}`);
          if (Math.abs(g.s - 1) > 1e-4) ch.push(`hue=s=${g.s.toFixed(4)}`);
        }
        ch.push('format=yuva420p');
        let ox = L.ox, oy = L.oy;
        const rot = num(it.rotate, 0) * Math.PI / 180;
        // keyframed: rotate on a fixed square canvas first, then shrink per frame (rotate can't take changing sizes)
        let bw = L.cw, bh = L.ch;
        if (kf && (has('rotate') || rot)) {
          bw = bh = even(Math.hypot(L.cw, L.ch));
          ch.push(`rotate=a='${has('rotate') ? `(${S.pwExpr(kf.rotate, 0, true)})*PI/180` : rot.toFixed(6)}':ow=${bw}:oh=${bh}:c=black@0`);
        }
        if (has('opacity')) ch.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*clip(${S.pwExpr(kf.opacity, 0, true, 'T')},0,1)'`);
        if (has('scale')) {
          const sc = S.pwExpr(kf.scale, 0, true);
          ch.push(`scale=w='max(2,trunc(${bw}*(${sc})/${smax}/2)*2)':h='max(2,trunc(${bh}*(${sc})/${smax}/2)*2)':eval=frame`);
          // pad back to a fixed size every frame: overlay keeps stale pixels when its input size changes
          ch.push(`pad=w=${bw}:h=${bh}:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame`);
        }
        if (kf) {} else if (rot) { // rotate about the box centre; the bigger canvas stays centred on the same point
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
        fc.push(`[${k}:v]${ch.join(',')}[v${j}]`);
        let tx = it.trk ? `'${ox}+${S.trkExpr(it, W, 0)}'` : ox, ty = it.trk ? `'${oy}+${S.trkExpr(it, H, 1)}'` : oy;
        if (kf) { // centre-based so size changes (scale/rotate canvas) stay anchored
          const px = has('x') ? S.pwExpr(kf.x, it.start, true) : num(it.x, 0), py = has('y') ? S.pwExpr(kf.y, it.start, true) : num(it.y, 0);
          tx = `'W/2+(${px})-w/2${it.trk ? '+' + S.trkExpr(it, W, 0) : ''}'`; ty = `'H/2+(${py})-h/2${it.trk ? '+' + S.trkExpr(it, H, 1) : ''}'`;
        }
        fc.push(`[${base}][v${j}]overlay=x=${tx}:y=${ty}:eof_action=pass[b${j + 1}]`);
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
      const k = input(it), v = num(it.volume, 1), fi = num(it.fadeIn, 0), fo = num(it.fadeOut, 0);
      const ch = ['aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', 'asetpts=PTS-STARTPTS', ...atempo(num(it.speed, 1))];
      if (v !== 1) ch.push(`volume=${v}`);
      if (fi > 0) ch.push(`afade=t=in:st=0:d=${f3(fi)}`);
      if (fo > 0) ch.push(`afade=t=out:st=${f3(it.dur - fo)}:d=${f3(fo)}`);
      ch.push(`adelay=${Math.round(it.start * 1000)}:all=1`);
      fc.push(`[${k}:a]${ch.join(',')}[a${j}]`);
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
