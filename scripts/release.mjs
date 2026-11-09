// Publish an update: bump the version everywhere, commit, tag and push.
// GitHub Actions then builds Mac + Windows, signs the update and publishes the release;
// installed copies of Kadr pick it up on their next launch.
//   npm run release            -> 0.3.0 -> 0.3.1
//   npm run release -- minor   -> 0.3.0 -> 0.4.0
//   npm run release -- 1.0.0
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sh = c => execSync(c, { stdio: 'inherit' });
if (execSync('git status --porcelain').toString().trim()) throw new Error('Commit or stash your changes first.');

const conf = 'src-tauri/tauri.conf.json';
const cur = JSON.parse(readFileSync(conf, 'utf8')).version;
const arg = process.argv[2] || 'patch';
let [a, b, c] = cur.split('.').map(Number);
const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg
  : arg === 'major' ? `${a + 1}.0.0` : arg === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;

const bump = (file, re) => writeFileSync(file, readFileSync(file, 'utf8').replace(re, m => m.replace(cur, next)));
bump(conf, /"version": "[^"]+"/);
bump('package.json', /"version": "[^"]+"/);
bump('src-tauri/Cargo.toml', /^version = "[^"]+"/m);
bump('src-tauri/Cargo.lock', new RegExp(`name = "kadr"\\nversion = "${cur.replace(/\./g, '\\.')}"`));

sh(`git commit -qam "Maqto ${next}"`);
sh(`git tag v${next}`);
sh('git push -q');
sh(`git push -q origin v${next}`); // lightweight tags don't ride along with --follow-tags
console.log(`v${next} pushed. Build + release: https://github.com/moramadan91/kadr/actions`);
