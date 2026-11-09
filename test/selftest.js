// node test/selftest.js — checks shared logic and runs a real export through ffmpeg.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('@ffprobe-installer/ffprobe').path;
const S = require('../src/shared');
const { buildArgs, concatText, atempo } = require('../src/graph');
const writeConcat = (d, list, fps) => { const f = path.join(d, 'text.ffconcat'); fs.writeFileSync(f, concatText(list, fps)); return f; };

// shared logic
assert.deepStrictEqual(atempo(1), []);
assert.deepStrictEqual(atempo(4), ['atempo=2', 'atempo=2']);
assert.deepStrictEqual(atempo(0.25), ['atempo=0.5', 'atempo=0.5']);
assert.ok(S.grade({}).identity);
assert.ok(!S.grade({ preset: 'warm' }).identity);
const L = S.layout({ fit: 'cover' }, { w: 1920, h: 1080 }, 1080, 1920);
assert.strictEqual(L.cw, 1080); assert.strictEqual(L.ch, 1920); assert.strictEqual(L.ox, 0);
const C = S.layout({ fit: 'contain' }, { w: 1920, h: 1080 }, 1080, 1920);
assert.strictEqual(C.cw, 1080); assert.strictEqual(C.ch, 608); assert.strictEqual(C.oy, 656);
const words = S.parseWhisper({ transcription: [
  { text: ' السلام', offsets: { from: 0, to: 400 } }, { text: ' عليكم', offsets: { from: 400, to: 800 } },
  { text: '،', offsets: { from: 800, to: 850 } }, { text: ' [موسيقى]', offsets: { from: 900, to: 1000 } },
  { text: ' كيف', offsets: { from: 2000, to: 2300 } }, { text: ' حالكم', offsets: { from: 2300, to: 2700 } },
] });
assert.deepStrictEqual(words.map(w => w.w), ['السلام', 'عليكم،', 'كيف', 'حالكم']);
const groups = S.groupWords(words);
assert.deepStrictEqual(groups.map(g => g.text), ['السلام عليكم،', 'كيف حالكم']);

// real export
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadr-test-'));
const run = (bin, a) => execFileSync(bin, a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const clip = path.join(dir, 'clip.mp4'), img = path.join(dir, 'img.png'), tone = path.join(dir, 'tone.wav');
run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=6', '-f', 'lavfi', '-i', 'sine=f=440:d=6',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=400x400', '-frames:v', '1', img]);
run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=f=220:d=3', tone]);
const txt = n => { const f = path.join(dir, n); run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=white@0.0:s=1080x1920,format=rgba', '-frames:v', '1', f]); return n; };
const textList = writeConcat(dir, [{ name: txt('f00000.png'), frames: 30 }, { name: txt('f00001.png'), frames: 60 }], 30);

const p = {
  w: 1080, h: 1920, fps: 30,
  media: {
    m1: { path: clip, kind: 'video', w: 1280, h: 720, dur: 6, hasAudio: true },
    m2: { path: img, kind: 'image', w: 400, h: 400 },
    m3: { path: tone, kind: 'audio', dur: 3, hasAudio: true },
  },
  tracks: [{ id: 'c1', kind: 'text' }, { id: 't1', kind: 'text' }, { id: 'v2', kind: 'video' }, { id: 'v1', kind: 'video' }, { id: 'a1', kind: 'audio' }],
  items: [
    { id: 'i1', track: 'v1', media: 'm1', start: 0, dur: 2, in: 0, speed: 1, preset: 'warm', fadeIn: 0.3 },
    { id: 'i2', track: 'v1', media: 'm1', start: 2, dur: 1.5, in: 3, speed: 2, fit: 'contain', brightness: 1.2, fadeOut: 0.5, flipH: true, crop: { l: 0.1, t: 0.2 }, opacity: 0.8 },
    { id: 'i3', track: 'v2', media: 'm2', start: 0.5, dur: 2, scale: 0.3, x: 200, y: -400 },
    { id: 'i4', track: 'a1', media: 'm3', start: 1, dur: 2, volume: 0.5, fadeIn: 0.2 },
  ],
};
const out = path.join(dir, 'out.mp4');
run(ffmpeg, buildArgs(p, { out, textList }).args);
const pr = JSON.parse(run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', out]));
const v = pr.streams.find(s => s.codec_type === 'video');
assert.strictEqual(v.width, 1080); assert.strictEqual(v.height, 1920); assert.strictEqual(v.pix_fmt, 'yuv420p');
assert.ok(pr.streams.some(s => s.codec_type === 'audio'));
assert.ok(Math.abs(+pr.format.duration - 3.5) < 0.1, 'duration ' + pr.format.duration);

const out4k = path.join(dir, 'out4k.mp4');
run(ffmpeg, buildArgs(S.scaleProject(p, 2), { out: out4k, textList, codec: process.platform === 'darwin' ? 'hevc_hw' : 'hevc' }).args);
const v4 = JSON.parse(run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', out4k])).streams.find(s => s.codec_type === 'video');
assert.strictEqual(v4.width, 2160); assert.strictEqual(v4.height, 3840); assert.strictEqual(v4.codec_name, 'hevc');

const wav = path.join(dir, 'mix.wav');
run(ffmpeg, buildArgs(p, { out: wav, audioOnly: true }).args);
assert.ok(fs.statSync(wav).size > 16000 * 2 * 3);

// rotation + ProRes, and a separate MP3
p.items[2].rotate = 30;
const mov = path.join(dir, 'out.mov');
run(ffmpeg, buildArgs(p, { out: mov, textList, codec: 'prores', quality: 'high' }).args);
assert.strictEqual(JSON.parse(run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', mov])).streams.find(s => s.codec_type === 'video').codec_name, 'prores');
const mp3 = path.join(dir, 'out.mp3');
run(ffmpeg, buildArgs(p, { out: mp3, audioExport: 'mp3' }).args);
const a3 = JSON.parse(run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', mp3]));
assert.strictEqual(a3.streams.length, 1); assert.strictEqual(a3.streams[0].codec_name, 'mp3');
assert.ok(Math.abs(+a3.format.duration - 3.5) < 0.15, 'mp3 duration ' + a3.format.duration);

// tracked overlay: expression offsets match trkAt
const trk = { start: 1, trk: { pts: [[0, 0, 0], [1, 0.1, -0.05], [2, 0.3, 0]] } };
assert.deepStrictEqual(S.trkAt(trk, 0.5).map(v => +v.toFixed(4)), [0.05, -0.025]);
assert.deepStrictEqual(S.trkAt(trk, 9), [0.3, 0]);
p.items[2].trk = { pts: [[0, 0, 0], [2, 0.2, 0.1]] };
const tmov = path.join(dir, 'trk.mp4');
run(ffmpeg, buildArgs(p, { out: tmov, textList }).args);
assert.ok(fs.statSync(tmov).size > 1000);

// keyframes: shared curve + export moves/fades the image
const kfi = { kf: { x: [[0, -300], [1.9, 300]], opacity: [[0, 1], [1.9, 0.3]] } };
assert.strictEqual(S.kfVal(kfi.kf.x, 0.95), 0);
assert.strictEqual(S.animAt(kfi, 3).x, 300);
assert.ok(/gte\(t,1\.0000\)/.test(S.pwExpr(kfi.kf.x, 1, true)));
delete p.items[2].trk;
Object.assign(p.items[2], { rotate: 0, x: 0, y: -400, kf: { x: [[0, -300], [1.9, 300]], scale: [[0, 0.2], [1.9, 0.35]], rotate: [[0, 0], [1.9, 45]], opacity: [[0, 1], [1.9, 0.5]] } });
const kmov = path.join(dir, 'kf.mp4');
run(ffmpeg, buildArgs(p, { out: kmov, textList }).args);
const px = (time, x, y) => { const b = execFileSync(ffmpeg, ['-v', 'error', '-ss', String(time), '-i', kmov, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']); return [...b.subarray(0, 3)]; };
const isRed = c => c[0] > 180 && c[1] < 90 && c[2] < 90;
assert.ok(isRed(px(0.55, 540 - 300, 960 - 400)), 'early: image on the left ' + px(0.55, 240, 560));
assert.ok(!isRed(px(2.35, 540 - 300, 960 - 400)), 'late: image moved away');
const late = px(2.35, 540 + 290, 960 - 400);
assert.ok(late[0] > late[1] + 40 && late[0] > late[2] + 40, 'late: half-opaque red on the right ' + late);

// speed curves: time maps round-trip, a split keeps the source range, visual animations resolve
{
  const curve = { id: 'hero', pts: S.CURVES.hero, src: 6 }, c = { dur: S.curveDur(curve), curve };
  for (const lt of [0, 1, 2.5, c.dur]) assert.ok(Math.abs(S.ltAt(c, S.srcAt(c, lt)) - lt) < 1e-3, 'curve round trip ' + lt);
  const a = S.subCurve(c, 0, 2), b = S.subCurve(c, 2, c.dur);
  assert.ok(Math.abs(a.src + b.src - 6) < 1e-3, 'split keeps source');
  assert.ok(S.rateAt(c, S.ltAt(c, 3)) < 1, 'hero is slow in the middle');
  const v = S.withVa({ type: 'image', dur: 4, anim: 'slideLeft', inDur: 1, x: 0, scale: 1 }, 0, 1000, 1000);
  assert.ok(Math.abs(v.x - 600) < 1e-6, 'slide starts 0.6 frame right ' + v.x);
}

// denoise (bundled RNNoise model, same filter as denoise_audio) + logo removal export
{
  const dn = path.join(dir, 'tone.dn.flac');
  execFileSync(ffmpeg, ['-y', '-i', tone, '-vn', '-af', 'highpass=f=70,arnndn=m=rnnoise.rnnn', '-c:a', 'flac', dn], { cwd: path.join(__dirname, '../src-tauri/resources'), stdio: 'ignore' });
  p.media.m3.fx = { d: dn }; p.items[3].denoise = true; p.items[0].afIn = 0.5;
  p.items[0].logo = { on: true, x: 0.95, y: 0, w: 0.2, h: 0.1 }; // past the edge: clamped inside the frame
  const b = S.logoBox(p.items[0].logo, p.media.m1);
  assert.ok(b.x >= 1 && b.x + b.w <= 1278 && b.y >= 1, 'logo box inside frame ' + JSON.stringify(b));
  const a = buildArgs(p, { out: path.join(dir, 'clean.mp4'), textList }).args;
  assert.ok(a.includes(dn) && a.join(' ').includes('delogo='), 'denoised input + delogo in graph');
  assert.strictEqual(S.audioFade(p.items[0], 0.25), 0.5, 'sound-only fade in');
  run(ffmpeg, a);
}

// advanced colour: baked 3D LUT written as .cube, applied with lut3d
{
  const it = p.items[0];
  it.color = { look: 'tealOrange', hsl: { red: { s: 0.4 } }, curves: { l: [[0, 0], [0.25, 0.2], [0.75, 0.82], [1, 1]] }, wheels: { lift: { x: 0.1, y: 0, l: 0 } }, lut: { file: 'x.cube', mix: 1 } };
  assert.ok(S.hasColor(it), 'advanced colour detected');
  const ident = S.parseCube(S.cubeText(S.bakeLut({ id: 'z' }, null)));
  for (const c of [[0.1, 0.5, 0.9], [0.7, 0.2, 0.4]]) S.sampleLut(ident, ...c).forEach((v, i) => assert.ok(Math.abs(v - c[i]) < 0.01, 'identity LUT ' + v));
  const user = S.parseCube(S.cubeText(S.bakeLut({ id: 'u', color: { look: 'mono' } }, null)));
  const cube = path.join(dir, 'lut_i1.cube');
  fs.writeFileSync(cube, S.cubeText(S.bakeLut(it, user)));
  const a = buildArgs(p, { out: path.join(dir, 'graded.mp4'), textList, luts: { i1: cube } }).args;
  assert.ok(a.join(' ').includes('lut3d=file='), 'lut3d in graph');
  run(ffmpeg, a);
  delete it.color;
}

// mask (grey PNG through alphamerge) + chroma key
{
  const mk = path.join(dir, 'mask.png');
  run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=200x200,geq=lum=\'255*lt(hypot(X-100,Y-100),80)\'', '-frames:v', '1', mk]);
  p.items[0].mask = { type: 'circle', x: 0.5, y: 0.5, w: 0.6, h: 0.6, feather: 0.1 };
  p.items[1].chroma = { on: true, color: '#00ff00', sim: 0.3, blend: 0.1 };
  assert.ok(S.hasMask(p.items[0]) && S.hasKey(p.items[1]), 'mask + key detected');
  const a = buildArgs(p, { out: path.join(dir, 'masked.mp4'), textList, masks: { i1: mk } }).args, j = a.join(' ');
  assert.ok(j.includes('alphamerge') && j.includes('chromakey=color=0x00ff00'), 'mask + key in graph');
  run(ffmpeg, a);
  delete p.items[0].mask; delete p.items[1].chroma;
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('selftest ok');
