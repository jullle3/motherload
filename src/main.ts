import './style.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import { Game, NO_INPUT, ORES, UPGRADES, TURBO, type Upgrade } from './game';
import { WorldView } from './render';
import { AudioSystem } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const credits = (n: number) => n.toLocaleString('en-US');
const SAVE_KEY = 'deepfield.save.v1';
const icon = (name: 'fuel' | 'hull' | 'cargo' | 'credits' | 'depth' | 'turbo') => {
  const paths = {
    fuel: 'M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z',
    hull: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z',
    cargo: 'm3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10M7 5l9 4',
    credits: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM15 8h-4a4 4 0 0 0 0 8h4',
    depth: 'M12 3v16m-6-6 6 6 6-6M5 22h14',
    turbo: 'm13 2-9 12h7l-1 8 10-13h-8Z',
  };
  return `<svg class="hud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
};
let game = new Game(),
  view: WorldView,
  audio = new AudioSystem(),
  mode: 'title' | 'play' | 'shop' | 'confirm' = 'title',
  input = { ...NO_INPUT },
  saveAvailable = true,
  saved: Game | undefined,
  toastUntil = 0;
let cancelConfirmation = () => title();
let started = false;
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) saved = Game.load(JSON.parse(raw));
} catch {
  saveAvailable = false;
}
document.querySelector('#app')!.innerHTML = `
 <header><span class="wordmark">DEEP<span>FIELD</span><i>®</i></span><div class="division">FRONTIER MINING DIVISION<span>KEPLER–186F / OUTPOST 04</span></div><div class="live"><b></b> ALL SYSTEMS ONLINE</div><button id="sound" class="icon-btn" title="Toggle audio">SOUND ON</button><details id="options"><summary class="icon-btn">SETTINGS</summary><div class="settings"><label><input id="low" type="checkbox"> Lower visual effects</label><label><input id="shake" type="checkbox"> Reduce camera shake</label><button class="secondary" id="new-game">NEW EXPEDITION</button></div></details></header>
 <main><section class="game-shell"><div id="world"></div><div class="vignette"></div>
  <div class="sector"><span class="eyebrow">EXPLORATION SECTOR 004</span><h2 id="zone">The outer crust</h2><span id="zone-sub">SEDIMENTARY TERRAIN · LOW RISK</span></div>
  <div class="coordinates"><span>${icon('depth')} DEPTH</span><strong><span id="depth">0</span><small>m</small></strong><div id="depth-track"><i></i></div><div class="depth-record">DEEPEST <span id="record">0 m</span></div></div>
  <div class="hud-credits" aria-label="Available credits">${icon('credits')}<span id="money">0<small>cr</small></span></div>
  <div id="relic-status" class="relic-status" role="status" hidden></div>
  <div id="surface-label">04 <span>WAYPOINT STATION</span><small>REPAIR · REFUEL · TRADE</small></div>
  <div id="drill-status" hidden><span id="drill-text">DRILLING</span><div><i id="drill-progress"></i></div></div>
  <div id="warning" role="status" hidden></div><div id="toast" role="status" hidden></div>
  <button id="dock" hidden><span>↑</span> SURFACE WORKSHOP <kbd>E</kbd></button>
  <div class="world-bottom"><span><i></i> RIG 07 <b>“CANARY”</b></span><span id="save-status">LOCAL SAVE ACTIVE</span></div>
  <div class="rig-hud" aria-label="Rig status">
   <div class="hud-gauge">${icon('fuel')}<div><div class="hud-label"><span>FUEL</span><strong id="fuel-text">100 / 100</strong></div><div class="bar"><i id="fuel-bar"></i></div></div></div>
   <div class="hud-gauge hull">${icon('hull')}<div><div class="hud-label"><span>HULL</span><strong id="hull-text">100%</strong></div><div class="bar"><i id="hull-bar"></i></div></div></div>
  </div>
  <div id="turbo-hud" class="turbo-hud" hidden>${icon('turbo')}<div><div class="hud-label"><span>TURBO</span><strong id="turbo-text">READY</strong></div><div class="bar"><i id="turbo-bar"></i></div><small>UP + SPACE</small></div></div>
  <div class="cargo-hud" aria-label="Cargo hold"><div class="cargo-heading">${icon('cargo')}<span>CARGO</span><strong id="cargo-text">0 / 12</strong></div><div id="cargo-slots"></div><div id="ore-list" hidden></div><div class="cargo-value"><span>Hold value</span><strong id="cargo-value">0 cr</strong></div></div>
 </section></main>
 <footer><div><kbd>W</kbd><span>THRUST / DRILL UP</span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>MOVE / DRILL</span><kbd>W</kbd><kbd>SPACE</kbd><span>TURBO</span><kbd>E</kbd><span>WORKSHOP</span><kbd>F</kbd><span>FULLSCREEN</span><kbd>ESC</kbd><span>CLOSE MENU</span></div><span>GO DEEPER. COME BACK RICHER.</span></footer>
 <div id="overlay"><section class="modal" id="modal" role="dialog" aria-modal="true" aria-label="Expedition menu" tabindex="-1"></section></div>
 <div class="small-screen">Built for desktop. Use a keyboard and a wider window for the best expedition.</div>`;

$('options').insertAdjacentHTML(
  'beforebegin',
  `<button id="fullscreen" class="icon-btn" aria-pressed="false" title="Enter fullscreen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg><span>FULLSCREEN</span></button>`,
);
let fullscreenPending = false;
function syncFullscreen() {
  const active = !!document.fullscreenElement;
  const button = $('fullscreen') as HTMLButtonElement;
  button.disabled = fullscreenPending || !document.fullscreenEnabled;
  button.setAttribute('aria-pressed', String(active));
  button.querySelector('span')!.textContent = active ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  button.title = !document.fullscreenEnabled
    ? 'Fullscreen is unavailable in this browser or embedded view'
    : active
      ? 'Exit fullscreen (F or Esc)'
      : 'Enter fullscreen (F)';
}
$('fullscreen').onclick = async () => {
  fullscreenPending = true;
  syncFullscreen();
  input = { ...NO_INPUT };
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify('Fullscreen could not start. Try opening the game in a separate browser tab.');
  } finally {
    fullscreenPending = false;
    syncFullscreen();
  }
};
document.addEventListener('fullscreenchange', () => {
  input = { ...NO_INPUT };
  syncFullscreen();
  requestAnimationFrame(() => view?.resize());
});
syncFullscreen();

function notify(message: string) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastUntil = performance.now() + 4500;
}
function save() {
  if (!started) return;
  try {
    const snapshot = game.save();
    const validated = Game.load(snapshot);
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    saved = validated;
    saveAvailable = true;
  } catch {
    saveAvailable = false;
  }
  $('save-status').textContent = saveAvailable
    ? 'PROGRESS SAVED ON THIS DEVICE'
    : 'SAVING UNAVAILABLE — SESSION ONLY';
}
function resetView() {
  const low = view?.low ?? false,
    reduced = view?.reduced ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  view?.dispose();
  view = new WorldView($('world'), game);
  view.low = low;
  view.reduced = reduced;
  view.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.7));
  view.resize();
  view.camera.position.set(game.rig.x, game.rig.y < 2 ? 2 : -game.rig.y + 2, 30);
}
try {
  resetView();
} catch (error) {
  $('world').innerHTML =
    '<div class="graphics-error">WebGL could not start. Enable hardware acceleration and reload to play.</div>';
  console.error(error);
}
function setMode(next: typeof mode) {
  advance(performance.now());
  mode = next;
  if (next === 'play') started = true;
  input = { ...NO_INPUT };
  $('overlay').hidden = next === 'play';
  if (next !== 'play') {
    audio.update(false, false, false);
    requestAnimationFrame(() => $('modal').focus());
  }
}
function title() {
  setMode('title');
  $('modal').className = 'modal title-modal';
  $('modal').innerHTML =
    `<span class="eyebrow">A FRONTIER MINING EXPEDITION</span><h1>Fortune favors<br>the <em>depths.</em></h1><p>One rig. An alien world. Something waiting below.<br>Mine, upgrade, and make it back in one piece.</p><div class="title-stats"><span><b>1,600 m</b>UNCHARTED DEPTH</span><span><b>03</b>GEOLOGICAL ZONES</span><span><b>01</b>UNKNOWN SIGNAL</span></div><button id="start" class="primary">${saved ? 'CONTINUE EXPEDITION' : 'BEGIN EXPEDITION'} <span>↗</span></button>${saved ? '<button id="new" class="secondary">NEW EXPEDITION</button>' : ''}<small class="modal-note">DESKTOP EXPERIENCE · WASD / ARROW KEYS · AUTOSAVED LOCALLY</small>`;
  $('start').onclick = () => {
    audio.start();
    if (saved) {
      game = Game.load(saved.save());
      resetView();
    }
    setMode('play');
    notify('W drills and thrusts upward. Add Space for turbo once installed.');
  };
  if (saved) $('new').onclick = confirmNew;
}
function confirmNew() {
  const fromTitle = mode === 'title';
  cancelConfirmation = () => (fromTitle ? title() : setMode('play'));
  setMode('confirm');
  $('modal').className = 'modal compact';
  $('modal').innerHTML =
    '<span class="eyebrow">NEW EXPEDITION</span><h2>Leave this mine behind?</h2><p>This replaces your saved world, credits, and upgrades. Your new expedition starts at the surface.</p><button id="confirm-new" class="primary">START A NEW WORLD</button><button id="cancel-new" class="secondary">KEEP CURRENT EXPEDITION</button>';
  $('confirm-new').onclick = () => {
    game = new Game();
    resetView();
    audio.start();
    setMode('play');
    save();
  };
  $('cancel-new').onclick = cancelConfirmation;
}
function shop() {
  if (!game.atSurface || mode === 'title') return;
  setMode('shop');
  $('modal').className = 'modal workshop';
  $('modal').innerHTML =
    `<div class="shop-heading"><div><span class="eyebrow">WAYPOINT STATION / 04</span><h2>Ready for another descent?</h2></div><button id="close-shop" class="icon-btn">CLOSE ✕</button></div><div class="shop-actions"><button id="sell" class="primary" ${!game.cargoCount ? 'disabled' : ''}>SELL CARGO <span>${credits(game.cargoValue)} cr</span></button><button id="service" class="secondary">REFUEL + REPAIR <span>FREE</span></button></div><div class="upgrade-grid">${(
      Object.keys(UPGRADES) as Upgrade[]
    )
      .map((key) => {
        const u = UPGRADES[key],
          level = game.upgrades[key],
          cost = u.costs[level];
        const turbo = key === 'turbo';
        const tier = turbo
          ? level
            ? `TIER ${level} / 3`
            : 'NOT INSTALLED'
          : `TIER ${level + 1} / 4`;
        const detail = turbo
          ? `<div class="upgrade-detail">${level === 3 ? 'MAX' : 'NEXT'}: ${u.values[Math.min(level + 1, 3)]} s burst · ${TURBO.cooldown} s recharge</div>`
          : '';
        return `<article><div class="upgrade-top"><span>${{ drill: '⟐', fuel: '◈', cargo: '▦', hull: '⬡', turbo: 'ϟ' }[key]}</span><small>${tier}</small></div><h3>${u.name}</h3><p>${u.description}</p>${detail}<div class="tier-meter">${(turbo ? [1, 2, 3] : [0, 1, 2, 3]).map((i) => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}</div><button data-upgrade="${key}" ${cost === undefined || game.money < cost ? 'disabled' : ''}>${cost === undefined ? 'FULLY UPGRADED' : `${turbo && level === 0 ? 'INSTALL' : 'UPGRADE'} <span>${credits(cost)} cr</span>`}</button></article>`;
      })
      .join(
        '',
      )}</div><div class="shop-footer"><span>YOUR BALANCE <b>${credits(game.money)} cr</b></span><span>All upgrades stay with you after rescue.</span></div>`;
  $('close-shop').onclick = () => setMode('play');
  $('sell').onclick = () => {
    const value = game.sell();
    save();
    audio.tone(660);
    notify(`Cargo sold for ${credits(value)} credits.`);
    shop();
  };
  $('service').onclick = () => {
    game.service();
    save();
    audio.tone(400);
    notify('Fuel topped up. Hull restored. Ready to descend.');
    shop();
  };
  document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(
    (b) =>
      (b.onclick = () => {
        if (game.buy(b.dataset.upgrade as Upgrade)) {
          save();
          audio.tone(800);
          notify('Upgrade installed.');
          shop();
        }
      }),
  );
}
function updateUI() {
  const r = game.rig,
    depth = Math.max(0, Math.floor(r.y) * 10),
    zone = depth < 450 ? 0 : depth < 1000 ? 1 : 2;
  $('depth').textContent = String(depth);
  $('zone').textContent = ['The outer crust', 'The crystal hollows', 'The ancient deep'][zone];
  $('zone-sub').textContent = [
    'SEDIMENTARY TERRAIN · LOW RISK',
    'DENSE GEOLOGY · DRILL TIER 2',
    'THERMAL ACTIVITY · DRILL TIER 3',
  ][zone];
  ($('depth-track').firstElementChild as HTMLElement).style.width = `${(depth / 1600) * 100}%`;
  $('fuel-text').textContent = `${Math.ceil(r.fuel)} / ${game.cap('fuel')}`;
  $('hull-text').textContent = `${Math.ceil((r.hull / game.cap('hull')) * 100)}%`;
  $('fuel-bar').style.width = `${(r.fuel / game.cap('fuel')) * 100}%`;
  $('fuel-bar').classList.toggle('danger', r.fuel < game.cap('fuel') * 0.22);
  $('hull-bar').style.width = `${(r.hull / game.cap('hull')) * 100}%`;
  $('hull-bar').classList.toggle('danger', r.hull < game.cap('hull') * 0.25);
  $('turbo-hud').hidden = game.upgrades.turbo === 0;
  $('turbo-hud').classList.toggle('active', game.turboActive);
  $('turbo-text').textContent = game.turboActive
    ? `${game.turboRemaining.toFixed(1)} s BURST`
    : game.turboCooldown > 0
      ? `${game.turboCooldown.toFixed(1)} s RECHARGE`
      : `READY · ${game.cap('turbo')} s`;
  $('turbo-bar').style.width =
    `${100 * (game.turboActive ? game.turboRemaining / game.cap('turbo') : 1 - game.turboCooldown / TURBO.cooldown)}%`;
  $('cargo-text').textContent = `${game.cargoCount} / ${game.cap('cargo')}`;
  $('cargo-slots').innerHTML = Array.from(
    { length: 12 },
    (_, i) =>
      `<i class="${i < Math.ceil((game.cargoCount / game.cap('cargo')) * 12) ? 'filled' : ''}"></i>`,
  ).join('');
  $('ore-list').innerHTML = ORES.flatMap((o, i) =>
    game.discoveredOres.has(i)
      ? [
          `<div data-ore="${i}" class="${o.rare ? 'rare-ore' : ''}" style="--ore-color:${o.color}" title="${o.rare ? 'Ultra-rare · ' : ''}${o.value.toLocaleString('en-US')} cr each"><span><i style="background:${o.color}"></i>${o.name}</span><b>${r.cargo[i] ?? 0}</b></div>`,
        ]
      : [],
  ).join('');
  $('ore-list').hidden = game.discoveredOres.size === 0;
  $('cargo-value').textContent = `${credits(game.cargoValue)} cr`;
  $('money').innerHTML = `${credits(game.money)}<small>cr</small>`;
  $('record').textContent = `${credits(game.maxDepth)} m`;
  $('dock').hidden = !game.atSurface || mode !== 'play';
  $('surface-label').hidden = r.y > 3;
  $('warning').hidden = !game.warning || mode !== 'play';
  $('warning').textContent = game.warning;
  $('drill-status').hidden = game.target < 0 || !!game.warning || mode !== 'play';
  $('drill-progress').style.width = `${game.progress * 100}%`;
  $('relic-status').hidden = !game.won && !r.relic;
  $('relic-status').textContent = game.won
    ? '◇ Relic recovered — keep exploring'
    : '◇ Strange relic secured — bring it to the surface';
}
const keys: Record<string, keyof typeof input> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'turbo',
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && mode !== 'play') {
    const items = [...$('modal').querySelectorAll<HTMLElement>('button:not(:disabled),input')];
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $('modal'))) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  if (keys[e.code]) {
    if (mode === 'play') {
      e.preventDefault();
      input[keys[e.code]] = true;
    }
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (
      e.target instanceof HTMLElement &&
      e.target.closest('input, textarea, select, [contenteditable]')
    )
      return;
    e.preventDefault();
    ($('fullscreen') as HTMLButtonElement).click();
    return;
  }
  if (e.code === 'Escape') {
    if (mode === 'confirm') cancelConfirmation();
    else if (mode !== 'title') setMode('play');
    ($('options') as HTMLDetailsElement).open = false;
  }
  if (e.code === 'KeyE') {
    if (mode === 'shop') setMode('play');
    else if (mode === 'play') shop();
  }
});
window.addEventListener('keyup', (e) => {
  if (keys[e.code]) input[keys[e.code]] = false;
});
window.addEventListener('blur', () => {
  input = { ...NO_INPUT };
  save();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    input = { ...NO_INPUT };
    save();
  }
});
window.addEventListener('pagehide', () => {
  if (mode !== 'title') save();
});
window.addEventListener('resize', () => view?.resize());
$('new-game').onclick = () => {
  ($('options') as HTMLDetailsElement).open = false;
  confirmNew();
};
$('low').onchange = () => {
  view.low = ($('low') as HTMLInputElement).checked;
  view.renderer.setPixelRatio(view.low ? 1 : Math.min(devicePixelRatio, 1.7));
  view.resize();
};
($('shake') as HTMLInputElement).checked = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;
$('shake').onchange = () => (view.reduced = ($('shake') as HTMLInputElement).checked);
$('dock').onclick = shop;
$('sound').onclick = () => {
  audio.start();
  audio.muted = !audio.muted;
  $('sound').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
};
let last = performance.now(),
  lastDraw = last,
  accumulator = 0,
  uiTime = 0,
  saveTime = 0;
function advance(now: number) {
  const dt = Math.max(0, (now - last) / 1000);
  last = Math.max(last, now);
  if (started && mode !== 'title') {
    accumulator += dt;
    // Bound each batch after browser throttling; keep the remainder for the next tick.
    let steps = 0;
    while (accumulator >= 1 / 60 && steps++ < 600) {
      game.step(1 / 60, mode === 'play' ? input : NO_INPUT);
      accumulator -= 1 / 60;
    }
    saveTime += dt;
    if (saveTime > 8) {
      save();
      saveTime = 0;
    }
  } else accumulator = 0;
  for (const event of game.events.splice(0)) {
    if (event.type === 'dig') view?.burst(event.x!, event.y!);
    if (event.type === 'ore') audio.tone(700, 0.08);
    if (event.type === 'turbo') audio.tone(220, 0.3);
    if (event.message) notify(event.message);
    if (event.type === 'rescue' || event.type === 'relic' || event.type === 'win') {
      save();
      audio.tone(event.type === 'rescue' ? 150 : 1000, 0.5);
    }
  }
  audio.update(
    mode === 'play' && (input.up || input.down || input.left || input.right),
    game.target >= 0,
    game.rig.fuel < game.cap('fuel') * 0.22,
    game.turboActive,
  );
}
function frame(now: number) {
  advance(now);
  const dt = Math.min(Math.max(0, (now - lastDraw) / 1000), 0.1);
  lastDraw = now;
  view?.draw(dt);
  uiTime += dt;
  if (uiTime > 0.1) {
    updateUI();
    uiTime = 0;
  }
  if (now > toastUntil) $('toast').hidden = true;
  requestAnimationFrame(frame);
}
title();
updateUI();
if (!saveAvailable)
  $('save-status').textContent = 'SAVE UNAVAILABLE OR INVALID — NEW SESSION AVAILABLE';
requestAnimationFrame(frame);
// Animation frames stop in background tabs; timers keep simulation and saves advancing.
window.setInterval(() => advance(performance.now()), 100);
