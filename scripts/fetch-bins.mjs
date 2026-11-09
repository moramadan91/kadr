// Copies ffmpeg/ffprobe from node_modules into src-tauri/binaries/<name>-<target triple> (Tauri sidecar naming).
import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const triple = process.env.TARGET_TRIPLE || /host: (\S+)/.exec(execFileSync('rustc', ['-vV']).toString())[1];
const ext = triple.includes('windows') ? '.exe' : '';
mkdirSync('src-tauri/binaries', { recursive: true });
for (const [name, src] of [['ffmpeg', require('ffmpeg-static')], ['ffprobe', require('@ffprobe-installer/ffprobe').path]]) {
  const dst = `src-tauri/binaries/${name}-${triple}${ext}`;
  copyFileSync(src, dst);
  chmodSync(dst, 0o755);
  console.log(dst);
}
