// The splash window starts hidden. Once the intro video can play: show the window, start the box and the
// video together, and hand over to the editor when the fade out ends.
const intro = document.getElementById('intro'), vid = intro.querySelector('video');
const inv = c => window.__TAURI__ ? window.__TAURI__.core.invoke(c) : Promise.resolve();
let started = false;
const start = () => {
  if (started) return; started = true;
  inv('splash_show').then(() => setTimeout(() => { intro.classList.add('go'); vid.play().catch(() => {}); }, 120));
};
if (vid.readyState >= 3) start(); else { vid.addEventListener('canplaythrough', start); vid.addEventListener('error', () => inv('splash_done')); }
intro.addEventListener('animationend', e => { if (e.target === intro) inv('splash_done'); });
