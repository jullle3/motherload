import './style.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import { Game, NO_INPUT, ORES, UPGRADES, type Upgrade } from './game';
import { WorldView } from './render';
import { AudioSystem } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const credits = (n: number) => n.toLocaleString('en-US');
const SAVE_KEY = 'deepfield.save.v1';
let game = new Game(),
  view: WorldView,
  audio = new AudioSystem(),
  mode: 'title' | 'play' | 'pause' | 'shop' | 'confirm' = 'title',
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
 <header><a class="wordmark" href="#" aria-label="Deepfield home">DEEP<span>FIELD</span><i>®</i></a><div class="division">FRONTIER MINING DIVISION<span>KEPLER–186F / OUTPOST 04</span></div><div class="live"><b></b> ALL SYSTEMS ONLINE</div><button id="sound" class="icon-btn" title="Toggle audio">SOUND ON</button><button id="pause" class="icon-btn">Ⅱ PAUSE</button></header>
 <main><section class="game-shell"><div id="world"></div><div class="vignette"></div>
  <div class="sector"><span class="eyebrow">EXPLORATION SECTOR 004</span><h2 id="zone">The outer crust</h2><span id="zone-sub">SEDIMENTARY TERRAIN · LOW RISK</span></div>
  <div class="coordinates"><span>DEPTH BELOW SURFACE</span><strong><span id="depth">0000</span><small>m</small></strong><div id="depth-track"><i></i></div></div>
  <div id="surface-label">04 <span>WAYPOINT STATION</span><small>REPAIR · REFUEL · TRADE</small></div>
  <div id="drill-status" hidden><span id="drill-text">DRILLING</span><div><i id="drill-progress"></i></div></div>
  <div id="warning" role="status" hidden></div><div id="toast" role="status" hidden></div>
  <button id="dock" hidden><span>↑</span> SURFACE WORKSHOP <kbd>E</kbd></button>
  <div class="world-bottom"><span><i></i> RIG 07 <b>“CANARY”</b></span><span id="save-status">LOCAL SAVE ACTIVE</span></div>
 </section>
 <aside><div class="panel-heading"><span>RIG TELEMETRY</span><span class="tag">LIVE</span></div>
 <div class="resource"><div><span>◈ &nbsp; Fuel reserve</span><strong id="fuel-text">100 / 100</strong></div><div class="bar"><i id="fuel-bar"></i></div><small>KEEP ENOUGH FOR THE RETURN TRIP</small></div>
 <div class="resource hull"><div><span>⬡ &nbsp; Hull integrity</span><strong id="hull-text">100%</strong></div><div class="bar"><i id="hull-bar"></i></div></div>
 <div class="cargo-title"><span>CARGO HOLD</span><strong id="cargo-text">0 / 12</strong></div><div id="cargo-slots"></div><div id="ore-list"></div><div class="cargo-value"><span>Estimated value</span><strong id="cargo-value">0 cr</strong></div>
 <div class="balance"><span>AVAILABLE CREDITS</span><strong id="money">0<small>cr</small></strong></div>
 <div class="mission"><span class="eyebrow">PRIMARY CONTRACT <b>01</b></span><div class="relic-symbol">◇</div><h3 id="mission-title">Something below.</h3><p id="mission-copy">An unknown signal. An ancient signature. Recover the alien relic at 1,530 m and bring it home.</p><div class="mission-footer"><span id="mission-status">SIGNAL DETECTED</span><span>↓ 1,530 m</span></div></div>
 <div class="record"><span>DEEPEST REACHED</span><strong id="record">0 m</strong></div>
 </aside></main>
 <footer><div><kbd>W</kbd><span>THRUST</span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>MOVE / DRILL</span><kbd>E</kbd><span>WORKSHOP</span><kbd>ESC</kbd><span>PAUSE</span></div><span>GO DEEPER. COME BACK RICHER.</span></footer>
 <div id="overlay"><section class="modal" id="modal" role="dialog" aria-modal="true" aria-label="Expedition menu" tabindex="-1"></section></div>
 <div class="small-screen">Built for desktop. Use a keyboard and a wider window for the best expedition.</div>`;

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
  mode = next;
  if (next === 'play') started = true;
  input = { ...NO_INPUT };
  $('overlay').hidden = next === 'play';
  $('pause').textContent = next === 'play' ? 'Ⅱ PAUSE' : '▶ RESUME';
  ($('pause') as HTMLButtonElement).disabled = next === 'title' || next === 'confirm';
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
    notify('Hold S to drill down. W thrusts up through cleared tunnels.');
  };
  if (saved) $('new').onclick = confirmNew;
}
function confirmNew() {
  const fromTitle = mode === 'title';
  cancelConfirmation = () => (fromTitle ? title() : pause());
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
function pause() {
  if (mode === 'title') return;
  setMode('pause');
  save();
  $('modal').className = 'modal compact';
  $('modal').innerHTML =
    `<span class="eyebrow">EXPEDITION ON HOLD</span><h2>A moment above the noise.</h2><p>Your rig is safe while paused.</p><button class="primary" id="resume">RESUME EXPEDITION <span>↗</span></button><div class="settings"><label><input id="low" type="checkbox" ${view?.low ? 'checked' : ''}> Lower visual effects</label><label><input id="shake" type="checkbox" ${view?.reduced ? 'checked' : ''}> Reduce camera shake</label></div><button class="secondary" id="new">NEW EXPEDITION</button>`;
  $('resume').onclick = () => setMode('play');
  $('new').onclick = confirmNew;
  $('low').onchange = () => {
    view.low = ($('low') as HTMLInputElement).checked;
    view.renderer.setPixelRatio(view.low ? 1 : Math.min(devicePixelRatio, 1.7));
    view.resize();
  };
  $('shake').onchange = () => (view.reduced = ($('shake') as HTMLInputElement).checked);
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
        return `<article><div class="upgrade-top"><span>${{ drill: '⟐', fuel: '◈', cargo: '▦', hull: '⬡' }[key]}</span><small>TIER ${level + 1} / 4</small></div><h3>${u.name}</h3><p>${u.description}</p><div class="tier-meter">${[0, 1, 2, 3].map((i) => `<i class="${i <= level ? 'filled' : ''}"></i>`).join('')}</div><button data-upgrade="${key}" ${cost === undefined || game.money < cost ? 'disabled' : ''}>${cost === undefined ? 'FULLY UPGRADED' : `UPGRADE <span>${credits(cost)} cr</span>`}</button></article>`;
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
  $('depth').textContent = String(depth).padStart(4, '0');
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
  $('cargo-text').textContent = `${game.cargoCount} / ${game.cap('cargo')}`;
  $('cargo-slots').innerHTML = Array.from(
    { length: 12 },
    (_, i) =>
      `<i class="${i < Math.ceil((game.cargoCount / game.cap('cargo')) * 12) ? 'filled' : ''}"></i>`,
  ).join('');
  $('ore-list').innerHTML = ORES.map(
    (o, i) =>
      `<div><span><i style="background:${o.color}"></i>${o.name}</span><b>${r.cargo[i].toString().padStart(2, '0')}</b></div>`,
  ).join('');
  $('cargo-value').textContent = `${credits(game.cargoValue)} cr`;
  $('money').innerHTML = `${credits(game.money)}<small>cr</small>`;
  $('record').textContent = `${credits(game.maxDepth)} m`;
  $('dock').hidden = !game.atSurface || mode !== 'play';
  $('surface-label').hidden = r.y > 3;
  $('warning').hidden = !game.warning || mode !== 'play';
  $('warning').textContent = game.warning;
  $('drill-status').hidden = game.target < 0 || !!game.warning || mode !== 'play';
  $('drill-progress').style.width = `${game.progress * 100}%`;
  $('mission-title').textContent = game.won
    ? 'The signal is home.'
    : r.relic
      ? 'Bring it home.'
      : 'Something below.';
  $('mission-copy').textContent = game.won
    ? 'Relic recovered. Contract complete. Keep exploring, grow your fortune, and master the frontier.'
    : r.relic
      ? 'Alien relic secured in the quest compartment. Return safely to the surface to complete recovery.'
      : 'An unknown signal. An ancient signature. Recover the alien relic at 1,530 m and bring it home.';
  $('mission-status').textContent = game.won
    ? 'CONTRACT COMPLETE'
    : r.relic
      ? 'RELIC ON BOARD'
      : 'SIGNAL DETECTED';
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
  if (e.code === 'Escape') {
    if (mode === 'confirm') cancelConfirmation();
    else if (mode === 'play') pause();
    else if (mode !== 'title') setMode('play');
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
  if (mode === 'play') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'play') pause();
    else if (mode !== 'title') save();
  }
});
window.addEventListener('pagehide', () => {
  if (mode !== 'title') save();
});
window.addEventListener('resize', () => view?.resize());
document.querySelector('.wordmark')!.addEventListener('click', (e) => {
  e.preventDefault();
  if (mode === 'play') pause();
});
$('pause').onclick = () => {
  if (mode === 'play') pause();
  else if (mode !== 'title') setMode('play');
};
$('dock').onclick = shop;
$('sound').onclick = () => {
  audio.start();
  audio.muted = !audio.muted;
  $('sound').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
};
let last = performance.now(),
  accumulator = 0,
  uiTime = 0,
  saveTime = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (mode === 'play') {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      game.step(1 / 60, input);
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
    if (event.message) notify(event.message);
    if (event.type === 'rescue' || event.type === 'relic' || event.type === 'win') {
      save();
      audio.tone(event.type === 'rescue' ? 150 : 1000, 0.5);
    }
  }
  audio.update(
    mode === 'play' && Object.values(input).some(Boolean),
    game.target >= 0,
    game.rig.fuel < game.cap('fuel') * 0.22,
  );
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
