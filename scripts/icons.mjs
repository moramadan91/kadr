// Builds src/icons.js from lucide-static (ISC). Edit NAMES and rerun: node scripts/icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const NAMES = ['plus', 'monitor', 'history', 'type', 'captions', 'undo-2', 'redo-2', 'mouse-pointer-2', 'scissors', 'square-split-horizontal',
  'arrow-left-to-line', 'arrow-right-to-line', 'trash-2', 'bookmark', 'crop', 'flip-horizontal-2', 'flip-vertical-2', 'mic',
  'magnet', 'link-2', 'zoom-in', 'zoom-out', 'maximize-2', 'play', 'pause', 'skip-back', 'skip-forward', 'save',
  'folder-open', 'share', 'languages', 'film', 'music', 'image', 'copy', 'x', 'square', 'eye', 'volume-2', 'volume-x',
  'rotate-ccw', 'chevron-down', 'monitor-play', 'sparkles', 'layers', 'wand-sparkles', 'keyboard', 'file-plus', 'layout-grid', 'list', 'check', 'snowflake', 'crosshair', 'refresh-cw', 'align-left', 'align-center', 'align-right', 'star', 'rotate-cw', 'download', 'diamond', 'chevron-left', 'chevron-right', 'rotate-cw-square', 'search', 'pilcrow-left', 'pilcrow-right', 'pipette', 'upload', 'eye-off', 'paint-bucket', 'blend', 'arrow-right-left', 'zap', 'sticker', 'vibrate', 'lock', 'lock-open'];
const out = {};
for (const n of NAMES) {
  const svg = readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8');
  out[n] = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
}
writeFileSync('src/icons.js', '// Generated from lucide-static (ISC license). node scripts/icons.mjs\nwindow.MaqtoIcons = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length, 'icons');
