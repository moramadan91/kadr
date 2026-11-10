import gsap from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm';
import { ScrollTrigger } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/ScrollTrigger/+esm';
import Lenis from 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/+esm';

gsap.registerPlugin(ScrollTrigger);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

/* ---------- language ---------- */
const EN = {
  skip: 'Skip to content', name: 'Maqto', nFeatures: 'Features', nTour: 'Tour', nInstall: 'Install', nFaq: 'FAQ',
  tag: 'Completely free · Mac & Windows',
  h1: 'Edit video your way, open source, no subscriptions.',
  lead: 'Cutting and a real timeline, auto captions timed word by word, text and motion, color, and export up to 4K. All on your computer.',
  mac: 'Download for Mac', macSub: 'Apple Silicon · M1 and later', win: 'Download for Windows', winSub: 'Windows 10 and 11 · 64-bit',
  ver: 'Version {v}',
  r1: 'One-click cuts', r2: 'Auto Arabic captions', r3: 'Color & LUTs', r4: 'Cleaner audio', r5: 'Motion & keyframes', r6: 'Export up to 4K',
  fEye: 'Features', fTitle: 'Everything you need for reels and videos.', fSub: 'Built for Arabic content from day one, not translated after.',
  f1: 'Automatic Arabic captions', f1p: 'Transcribes speech and times every word, and you can fix any word. It runs on your computer; your audio never leaves it.',
  f2: 'Timeline and cutting', f2p: 'Magnetic main track, cut and split, markers, plus video, audio and text tracks.',
  f3: 'Text and motion', f3p: 'Ready-made styles with in and out animation, and Arabic shaped correctly.',
  f4: 'Color and filters', f4p: 'Presets plus light and saturation controls. The preview matches the export exactly.',
  f8: 'Auto captions that speak Arabic', f8p: 'One click turns all the speech into captions. Arabic and English, and it can detect the video language on its own.',
  f5: 'Export up to 4K', f5p: 'H.264 and HEVC, hardware accelerated on Mac.',
  f6: 'Voiceover recording', f6p: 'Record narration in the app and it lands on the timeline.',
  f7: 'Automatic updates', f7p: 'Every new version reaches you on its own, signed and verified.',
  nClaude: 'Claude Code', f9a: 'How to connect it →', copy: 'Copy', copied: 'Copied',
  cEye: 'Maqto + Claude Code', cTitle: 'Write the idea, watch the video build itself.',
  cSub: 'Maqto ships an MCP server. Connect it to Claude Code once, then write a prompt and Claude works on your timeline live.',
  cSteps: 'Connect in 4 steps',
  c1: 'Get Maqto <b>1.0.6</b> or newer. On a Mac it must be in <b>Applications</b>.',
  c2: 'Install <a href="https://claude.com/claude-code" target="_blank" rel="noopener"><b>Claude Code</b></a> and sign in with your account.',
  c3: 'Open the terminal and run the connect command once.',
  c4: 'Start a new Claude Code session and write your request, saying <b>in Maqto</b>. The first time it asks for permission, choose <b>Allow always</b>.',
  cNote: 'No slash command and no need to say MCP. If the tools don\'t show up, type <b>/mcp</b> in the session and check that <b>maqto</b> is <b>connected</b>.',
  cCmd: 'Connect command', cMac: 'Mac (Terminal)', cWin: 'Windows (PowerShell)', cTry: 'Try writing',
  cEx: 'In Maqto, make an 8-second 9:16 motion video for a burger place: gradient background, 3 lines coming in one after another with motion, then export it to the Desktop.',
  k1: 'Texts and styles', k2: 'Keyframes and motion', k3: 'Transitions', k4: 'Filters and effects', k5: 'Looks at the frame to check', k6: 'Export',
  cUndo: 'Maqto opens by itself if it is closed, and every step Claude takes can be undone with Cmd/Ctrl+Z.',
  f9: 'Write the prompt in Claude Code, watch the video build itself', f9p: 'Maqto ships an MCP server. Connect it once and Claude adds texts, motion, keyframes and transitions to the timeline live, looks at the frame to check its work, and exports.',
  tEye: 'A tour of the app', tTitle: 'Everything where you expect it.',
  s1: 'Timeline', s1p: 'Drag in video, images and audio. The main track is magnetic so there are no gaps, and S splits a clip.',
  s2: 'Library and captions', s2p: 'Import your files, pick a text style, or press Auto captions to transcribe Arabic speech.',
  s3: 'Live preview', s3p: 'See filters and text while you work at real playback speed, in 9:16, 16:9 or 1:1.',
  s4: 'Inspector', s4p: 'Size, position, opacity, crop, speed, animation and color for every clip.',
  s5: 'Export', s5p: 'Pick quality up to 4K, frame rate and codec. You get exactly what you saw.',
  iEye: 'Install', iTitle: 'One minute and you are in.', iSub: 'Maqto is free and not sold through the Apple or Microsoft stores, so your system asks once.',
  iMac: 'Mac', iWin: 'Windows',
  m1: 'Open the <b>.dmg</b> file and drag Maqto into <b>Applications</b>.',
  m2: 'Open Maqto. If it says the developer cannot be verified, click <b>Done</b>.',
  m3: 'Go to <b>System Settings → Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b>.',
  mA: 'In <b>System Settings</b>, pick <b>Privacy &amp; Security</b> in the sidebar.',
  mB: 'Scroll to <b>Security</b> and find <b>“Maqto” was blocked</b>. Click <b>Open Anyway</b> and confirm with your password or Touch ID. You only do this once.',
  mNote: 'A Mac with Apple silicon (M1 or later) and macOS 12 or later.',
  w1: 'Run the <b>setup.exe</b> file.',
  w2: 'If you see <b>Windows protected your PC</b>, click <b>More info</b>, then <b>Run anyway</b>.',
  bTitle: 'If your browser blocks the download',
  bSub: 'Browsers sometimes hold back free apps that are not from the Apple or Microsoft stores, especially when the browser\'s protection is turned off. The file comes from Maqto\'s official GitHub page; finish the download in two steps:',
  b1: 'Open your downloads list and click the Maqto file marked <b>Unverified download blocked</b>.',
  b2: 'Click <b>Download unverified file</b> and the download finishes. Then follow the install steps above.',
  w3: 'Pick a language and finish the setup.', wNote: 'Windows 10 or 11, 64-bit.',
  qEye: 'FAQ', qTitle: 'Before you ask.',
  q1: 'Is it really free?', a1: 'Yes. No subscription, no ads, and no watermark on your videos.',
  q2: 'Do I need internet?', a2: 'No. Editing and export work offline. You only need internet for updates and to download the caption model once (about 466 MB).',
  q3: 'Which computers does it run on?', a3: 'Macs with Apple silicon (M1 or later) on macOS 12 or later, and Windows 10 or 11, 64-bit.',
  q4: 'How do updates arrive?', a4: 'When you open Maqto it checks for a new version and asks you. Say yes and it downloads, restarts and opens the new version.',
  q5: 'Are my videos uploaded anywhere?', a5: 'No. Your files, audio and transcription all stay on your computer.',
  endT: 'Try Maqto today.', foot: 'Maqto · free, no ads', all: 'All versions',
};
const AR = { ver: 'نسخة {v}' };
$$('[data-t]').forEach(el => (AR[el.dataset.t] = el.hasAttribute('data-html') ? el.innerHTML : el.textContent));
const T = { ar: AR, en: EN };
let lang = 'ar', version = '';
try { lang = localStorage.getItem('kadr.lang') || (navigator.language.startsWith('ar') ? 'ar' : 'en'); } catch (e) {}

// Word-level split: Arabic letters must stay joined, so never split by character.
// Words after the first comma get the accent color.
const splitWords = el => {
  let after = false;
  el.innerHTML = el.textContent.trim().split(/\s+/).map(w => {
    const html = `<span class="w${after ? ' acc' : ''}"><span class="wi">${w}</span></span>`;
    if (/[،,]$/.test(w)) after = true;
    return html;
  }).join(' ');
};

function applyLang() {
  const d = T[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  $$('[data-t]').forEach(el => {
    const v = d[el.dataset.t];
    if (v == null) return;
    if (el.hasAttribute('data-html')) el.innerHTML = lang === 'ar' ? v : v.replace(/<b>/g, '<b><bdi>').replace(/<\/b>/g, '</bdi></b>');
    else el.textContent = v;
    if (el.classList.contains('split')) splitWords(el);
  });
  $('#lang span').textContent = lang === 'ar' ? 'English' : 'عربي';
  document.title = lang === 'ar' ? 'ماكتو — محرر فيديو مجاني للماك والويندوز' : 'Maqto — free video editor for Mac and Windows';
  showVer();
}
// The current release number sits under each download button; it comes from the latest GitHub release.
function showVer() {
  $$('#download [data-v]').forEach(el => (el.textContent = version ? T[lang].ver.replace('{v}', version) : ''));
  $('#dl2').innerHTML = $('#download').innerHTML.replace(/ id="(mac|win)"/g, '');
}
// Copy buttons next to the commands and the sample prompt.
document.addEventListener('click', async e => {
  const b = e.target.closest('.cp');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.previousElementSibling.textContent.trim()); } catch (err) { return; }
  b.textContent = T[lang].copied || 'تم النسخ';
  setTimeout(() => (b.textContent = T[lang].copy), 1500);
});
$('#lang').onclick = () => {
  lang = lang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('kadr.lang', lang); } catch (e) {}
  applyLang();
  ScrollTrigger.refresh();
};

// Visitor's own OS goes first; both buttons look the same until hovered.
const first = $(/Windows/i.test(navigator.userAgent) ? '#win' : '#mac').parentNode;
first.parentNode.prepend(first);
applyLang();

// Static tour crops (mobile / reduced motion): one zoomed crop of the screenshot per step.
$$('.spot').forEach((s, i) => {
  const [x, y, w, h] = s.dataset.r.split(',').map(Number);
  const c = document.createElement('div');
  c.className = 'crop';
  c.style.backgroundSize = `${(100 / w) * 100}% auto`;
  c.style.backgroundPosition = `${(x / (100 - w)) * 100}% ${(y / (100 - h)) * 100}%`;
  c.style.aspectRatio = `${w * 1600} / ${h * 1140}`;
  c.style.height = `min(240px, calc((100vw - 82px) * ${(h * 1140) / (w * 1600)}))`;
  Object.assign(s.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%' });
  $$('.step')[i].prepend(c);
});

// Download buttons point straight at the latest release files.
fetch('https://api.github.com/repos/moramadan91/kadr/releases/latest')
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then(rel => {
    for (const [id, re] of [['#mac', /\.dmg$/i], ['#win', /setup\.exe$/i]]) {
      const a = rel.assets.find(x => re.test(x.name));
      if (a) $(id).href = a.browser_download_url;
    }
    version = rel.tag_name.replace(/^v/, '');
    showVer();
  })
  .catch(() => {}); // buttons already open the releases page

// Tour: a static list. Hover, focus or tap a step: it gets the turquoise frame and the
// screenshot spotlights and zooms into that part of the app (CSS transitions do the motion).
{
  const spots = $$('.spot'), steps = $$('.step'), img = $('#zoom');
  const show = i => {
    steps.forEach((s, j) => s.classList.toggle('on', i === j));
    spots.forEach((s, j) => s.classList.toggle('on', i === j));
    const [x, y, w, h] = spots[i].dataset.r.split(',').map(Number);
    img.style.transformOrigin = `${x + w / 2}% ${y + h / 2}%`;
    img.style.transform = `scale(${i === 0 ? 1 : 1.12})`;
  };
  steps.forEach((s, i) => { s.addEventListener('pointerenter', () => show(i)); s.addEventListener('focus', () => show(i)); s.addEventListener('click', () => show(i)); });
  show(0);
}

/* ---------- motion: Lenis drives scroll, GSAP drives everything else, one loop ---------- */
const lenis = new Lenis({ lerp: 0.1 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(t => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
// In-page links: scroll with Lenis ourselves (a native hash jump skipped the scroll triggers, so the cards stayed hidden).
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'), id = a && a.getAttribute('href');
  const el = id && id.length > 1 && document.querySelector(id);
  if (!el) return;
  e.preventDefault();
  lenis.scrollTo(el, { offset: -80 });
  history.replaceState(null, '', id);
});

const mm = gsap.matchMedia();
mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 901px)' }, ctx => {
  const { motion, wide } = ctx.conditions;
  if (!motion) return; // reduced motion: everything is already visible and static

  // Intro: words rise, then lead, buttons and the app screenshot.
  reel();
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  intro.from('.hero h1 .wi', { yPercent: 110, duration: 0.9, stagger: 0.07 })
    .from('.hero .reveal', { y: 18, autoAlpha: 0, duration: 0.6, stagger: 0.08 }, '-=0.5')
    .from('.reel', { y: 40, autoAlpha: 0, duration: 0.9 }, 0.2)
    .from('.stage-in', { y: 80, autoAlpha: 0, duration: 1.1 }, '-=0.6');

  // The screenshot tilts flat as you scroll toward it.
  gsap.to('.stage-in', {
    rotateX: 0, scale: 1, ease: 'none',
    scrollTrigger: { trigger: '.stage', start: 'top 85%', end: 'top 15%', scrub: true },
  });

  // Section headings: word reveal on enter.
  $$('.sec h2.split, .tour h2.split').forEach(h => {
    gsap.from(h.querySelectorAll('.wi'), {
      yPercent: 110, duration: 0.8, ease: 'power3.out', stagger: 0.06,
      scrollTrigger: { trigger: h, start: 'top 85%' },
    });
  });

  // Cards come in in batches.
  gsap.set('.bento .card, .os-grid .card, .faq details', { y: 30, autoAlpha: 0 });
  ScrollTrigger.batch('.bento .card, .os-grid .card, .faq details', {
    start: 'top 90%',
    onEnter: b => gsap.to(b, { y: 0, autoAlpha: 1, duration: 0.6, ease: 'power2.out', stagger: 0.08, overwrite: true }),
    onEnterBack: b => gsap.to(b, { y: 0, autoAlpha: 1, duration: 0.4, overwrite: true }),
  });
  // Safety net: a card on screen when scrolling stops is never left hidden.
  ScrollTrigger.addEventListener('scrollEnd', () => $$('.bento .card, .os-grid .card, .faq details').forEach(c => {
    const r = c.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0 && +getComputedStyle(c).opacity < 0.05) gsap.to(c, { y: 0, autoAlpha: 1, duration: 0.5 });
  }));

  // Caption card: the highlighted word walks along, like the real captions.
  const words = $$('.words span');
  gsap.timeline({ scrollTrigger: { trigger: '.c-cap', start: 'top 70%' } })
    .call(() => words.forEach((w, i) => w.classList.toggle('on', i === 0)), null, 0)
    .call(() => words.forEach((w, i) => w.classList.toggle('on', i === 1)), null, 0.4)
    .call(() => words.forEach((w, i) => w.classList.toggle('on', i === 2)), null, 0.8)
    .call(() => words.forEach((w, i) => w.classList.toggle('on', i === 3)), null, 1.2);

});


/* ---------- hero reel: a 12-second looping "edit" that walks through the main features ---------- */
function reel() {
  const R = $('#reel');
  // waveform bars (seeded, so every visit looks the same)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const wave = R.querySelector('.wave');
  wave.innerHTML = Array.from({ length: 48 }, () => `<i style="--h:${(0.25 + rnd() * 0.75).toFixed(2)}"></i>`).join('');
  const bars = wave.querySelectorAll('i'), feats = R.querySelectorAll('.r-feat span'), tools = R.querySelectorAll('.r-tools i');
  const words = R.querySelectorAll('.r-cap span');
  const step = (tl, i, at) => tl.call(() => {
    feats.forEach((f, j) => f.classList.toggle('on', i === j));
    tools.forEach((t, j) => t.classList.toggle('on', i === j));
  }, null, at);
  const tl = gsap.timeline({ repeat: -1, defaults: { ease: 'power3.out' } });
  // reset
  tl.set(R.querySelectorAll('.c1, .c2, .c3'), { x: 0 }).set('.r-sc', { autoAlpha: 0, y: -10, scale: 0.6 })
    .set(words, { className: '' }).set('.r-cap', { autoAlpha: 0 }).set('.r-grade', { clipPath: 'inset(0 100% 0 0)' })
    .set(bars, { scaleY: 0.15 }).set('.k', { scale: 0 }).set('.r-exp', { autoAlpha: 0 }).set('.r-exp b', { scaleX: 0 })
    .set('.r-ph', { left: '4%' }).set('.r-mark', { autoAlpha: 0, scale: 0.8 });
  // the playhead travels the whole loop
  tl.to('.r-ph', { left: '94%', duration: 12, ease: 'none' }, 0);
  tl.to('.r-scene s', { xPercent: -40, duration: 12, ease: 'none', stagger: 0.2 }, 0);
  // 1. cut: scissors drop on the playhead, the clip splits and the gap closes
  step(tl, 0, 0.1);
  tl.to('.r-sc', { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(3)' }, 0.5)
    .to('.c2, .c3', { x: 10, duration: 0.25 }, 1.0)
    .to('.r-sc', { rotate: -25, duration: 0.12, yoyo: true, repeat: 1 }, 0.95)
    .to('.r-sc', { autoAlpha: 0, y: -10, duration: 0.3 }, 1.6)
    .to('.c2, .c3', { x: 0, duration: 0.4 }, 1.6);
  // 2. captions: words light up one by one
  step(tl, 1, 2);
  tl.to('.r-cap', { autoAlpha: 1, duration: 0.3 }, 2);
  words.forEach((w, i) => tl.call(() => words.forEach((x, j) => x.classList.toggle('on', i === j)), null, 2.2 + i * 0.4));
  tl.to('.r-cap', { autoAlpha: 0, duration: 0.3 }, 3.9);
  // 3. colour: a graded wipe crosses the frame
  step(tl, 2, 4);
  tl.to('.r-grade', { clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'power2.inOut' }, 4.2)
    .to('.r-grade', { clipPath: 'inset(0 0 0 100%)', duration: 0.8, ease: 'power2.inOut' }, 5.4);
  // 4. audio: noisy waveform settles into a clean one
  step(tl, 3, 6);
  tl.to(bars, { scaleY: () => 0.2 + rnd() * 0.8, duration: 0.18, stagger: { each: 0.01, from: 'random' } }, 6.1)
    .to(bars, { scaleY: (i, el) => +el.style.getPropertyValue('--h'), duration: 0.6, stagger: { each: 0.012 } }, 6.9);
  // 5. keyframes pop on the clip, the brand mark glides between them
  step(tl, 4, 8);
  tl.to('.k', { scale: 1, duration: 0.35, ease: 'back.out(3)', stagger: 0.25 }, 8.1)
    .fromTo('.r-mark', { autoAlpha: 1, x: '-60%', scale: 0.8 }, { x: '60%', scale: 1.1, duration: 1.6, ease: 'power2.inOut' }, 8.3)
    .to('.r-mark', { autoAlpha: 0, duration: 0.3 }, 9.8);
  // 6. export bar fills
  step(tl, 5, 10);
  tl.to('.r-exp', { autoAlpha: 1, duration: 0.3 }, 10.1)
    .to('.r-exp b', { scaleX: 1, duration: 1.4, ease: 'power1.inOut' }, 10.2)
    .to('.r-exp', { autoAlpha: 0, duration: 0.3 }, 11.7)
    .to(bars, { scaleY: 0.15, duration: 0.3 }, 11.7);
  // pause when the reel is off screen
  ScrollTrigger.create({ trigger: R, start: 'top bottom', end: 'bottom top', onToggle: s => (s.isActive ? tl.play() : tl.pause()) });
}

window.addEventListener('load', () => ScrollTrigger.refresh());
document.fonts.ready.then(() => ScrollTrigger.refresh());
