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
run(ffmpeg, buildArgs(S.scaleProject(p, 2), { out: out4k, textList, codec: 'hevc_hw' }).args);
const v4 = JSON.parse(run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', out4k])).streams.find(s => s.codec_type === 'video');
assert.strictEqual(v4.width, 2160); assert.strictEqual(v4.height, 3840); assert.strictEqual(v4.codec_name, 'hevc');

const wav = path.join(dir, 'mix.wav');
run(ffmpeg, buildArgs(p, { out: wav, audioOnly: true }).args);
assert.ok(fs.statSync(wav).size > 16000 * 2 * 3);

fs.rmSync(dir, { recursive: true, force: true });
console.log('selftest ok');
