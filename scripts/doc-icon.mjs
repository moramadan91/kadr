// Builds the project-file icon (src-tauri/icons/doc/maqto-doc.{png,icns,ico}) from maqto-doc.svg.
// Needs Google Chrome (via playwright from the parent folder) and macOS iconutil. Run: node scripts/doc-icon.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = 'src-tauri/icons/doc', svg = readFileSync(`${dir}/maqto-doc.svg`, 'utf8');
const b = await chromium.launch({ channel: 'chrome' }), p = await b.newPage();
const png = async n => {
  await p.setViewportSize({ width: n, height: n });
  await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}`);
  return p.screenshot({ omitBackground: true });
};
const set = `${dir}/maqto-doc.iconset`;
mkdirSync(set, { recursive: true });
for (const n of [16, 32, 128, 256, 512]) {
  writeFileSync(`${set}/icon_${n}x${n}.png`, await png(n));
  writeFileSync(`${set}/icon_${n}x${n}@2x.png`, await png(n * 2));
}
writeFileSync(`${dir}/maqto-doc.png`, await png(1024));
// .ico: PNG-compressed entries (Vista+)
const sizes = [16, 24, 32, 48, 64, 128, 256], imgs = [];
for (const n of sizes) imgs.push(await png(n));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(n % 256, e); head.writeUInt8(n % 256, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12); off += imgs[i].length;
});
writeFileSync(`${dir}/maqto-doc.ico`, Buffer.concat([head, ...imgs]));
await b.close();
execFileSync('iconutil', ['-c', 'icns', set, '-o', `${dir}/maqto-doc.icns`]);
rmSync(set, { recursive: true });
console.log('doc icon built');
