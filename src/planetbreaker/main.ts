import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import './style.css';
import { KEYS, PLANET, SETTINGS_KEY, STAGES, WEAPONS, stage } from './config';
import { PlanetGame, type Point } from './game';
import { PlanetStore } from './store';
import { PlanetView } from './render';
import { PlanetAudio } from './audio';

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.href =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="%238cead1"/><circle cx="20" cy="12" r="11" fill="%23070d15"/></svg>';
document.head.append(favicon);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(2)}M`
    : n >= 10000
      ? `${(n / 1000).toFixed(1)}K`
      : Math.floor(n).toLocaleString('en-US');
const time = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
const icons = {
  laser: '<path d="M9 28 27 10m-9 0h9v9M6 20l10 10M6 29l3-3m14-3 8 8M7 7l6 6"/>',
  missile:
    '<path d="M13 24C12 14 21 6 31 5c-1 10-9 19-19 18l-4 6-2-2 6-4Zm7-13 6 6M12 16l-6 1-3 6 9-1m7 1-1 9 6-3 1-7M5 32l4-4"/>',
  plasma:
    '<ellipse cx="18" cy="18" rx="7" ry="15" transform="rotate(45 18 18)"/><ellipse cx="18" cy="18" rx="7" ry="15" transform="rotate(-45 18 18)"/><circle cx="18" cy="18" r="3"/>',
  siege:
    '<path d="M8 27 25 10l5 5-17 17Zm15-15-3-3 7-7 7 7-7 7M6 22l-4 8 4 4 8-4M20 3l-4 4M30 20l4-4"/>',
};
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/games/planetbreaker/"><span class="brand-symbol">◈</span> PLANET<span>BREAKER</span></a><span class="header-tag">ORBITAL EXTRACTION DIVISION</span><nav><a href="/">↖ <span>ALL GAMES</span></a><button id="sound" aria-label="Mute sound" title="Toggle sound">♫</button><button id="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen (F)">⛶</button><button id="settings" aria-label="Open settings" title="Settings">⚙</button></nav></header>
<div id="warning" role="status" hidden></div><div id="lock" hidden><span class="eyebrow">COMMAND LINK OCCUPIED</span><h1>Another commander is online.</h1><p>This game is already open in another tab. Close it, then reconnect to continue your saved run.</p><button id="reconnect">RECONNECT</button></div>
<main id="game" hidden>
<section class="telemetry" aria-label="Resources"><div class="credit-stat"><span class="eyebrow">◈ EXTRACTION CREDITS</span><strong id="credits">0</strong><span class="small">AVAILABLE TO INVEST</span></div><div><span class="eyebrow">PASSIVE INCOME</span><strong class="income"><span id="income">1</span><small> / sec</small></strong><span class="small live">AUTONOMOUS SYSTEMS ONLINE</span></div><div class="integrity-stat"><div><span class="eyebrow">PLANETARY INTEGRITY</span><b id="integrity">100.00%</b></div><div class="integrity-track"><i id="integrity-bar"></i></div><span class="small" id="damage-label">2.40M / 2.40M HP</span></div></section>
<div class="workspace"><section class="viewport" aria-label="Planet view"><div class="world-heading"><span class="eyebrow">LEVEL 01 <i></i> ${PLANET.designation}</span><h1>${PLANET.name}<span>.</span></h1><p>A beautiful world. An extraordinary resource.</p></div><div id="world"></div><div class="coordinate left">RA 19h 24m 08s<br>DEC +42° 17′ 36″</div><div class="coordinate right">TERRA CLASS<br>RADIUS 6,840 KM</div><div class="stage-readout"><span class="live">EXTRACTION IN PROGRESS</span><strong id="stage">PRISTINE WORLD</strong><div class="stage-steps">${[0, 1, 2, 3].map((i) => `<i id="step-${i}"></i>`).join('')}</div></div><div class="fire-control"><button id="fire"><span>⌖</span> FIRE MINING LASER <kbd>CLICK</kbd></button><p>Click the planet to fire. Your fleet handles the rest.</p></div><div id="complete" hidden><span class="eyebrow">EXTRACTION COMPLETE</span><h2>A beautiful end.</h2><p>Aurelia is now stardust.</p><div id="results"></div><button id="replay">↻ REPLAY PLANET</button><small>More worlds are on the horizon.</small></div></section>
<aside aria-label="Orbital arsenal"><div class="arsenal-heading"><div><span class="eyebrow">BUILD. UPGRADE. OBLITERATE.</span><h2>Orbital arsenal</h2></div><span id="fleet-count">01</span></div><div class="panel-tabs"><span>STRUCTURES</span><span id="dps">1 DMG / SEC</span></div><div id="weapons">${KEYS.map((k, i) => `<article class="weapon" id="card-${k}" style="--weapon:${WEAPONS[k].color}"><div class="weapon-top"><div class="weapon-icon"><svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[k]}</svg></div><div><span class="weapon-tag">0${i + 1} / ${WEAPONS[k].tag}</span><h3>${WEAPONS[k].name}</h3></div><span class="owned" id="count-${k}">× 0</span></div><p>${WEAPONS[k].description}</p><div class="weapon-output"><span id="output-${k}"></span><span id="tier-${k}"></span></div><button class="buy" id="buy-${k}"><span id="buy-label-${k}">+ BUILD STRUCTURE</span><b id="cost-${k}"></b></button><button class="upgrade" id="upgrade-${k}"><span id="upgrade-label-${k}">↑ UPGRADE</span><span id="upgrade-cost-${k}"></span></button><div class="unlock" id="unlock-${k}" hidden></div></article>`).join('')}</div><div class="arsenal-footer"><span>◎</span><p>Every impact earns credits.<br><strong>Invest in a more spectacular ending.</strong></p></div></aside></div>
<footer><span><i class="status-dot"></i> <span id="save-status">PROGRESS SAVED ON THIS DEVICE</span></span><span>8H OFFLINE CREDITS <b>·</b> DESTRUCTION WAITS FOR YOU</span><span>AURELIA / 01</span></footer></main>
<div id="toast" role="status" hidden></div><dialog id="dialog"><button id="close-dialog" aria-label="Close dialog">×</button><div id="dialog-content"></div></dialog>`;

let game: PlanetGame,
  view: PlanetView | undefined,
  active = false,
  hiddenAt = 0,
  last = performance.now(),
  endAt = 0,
  releaseLock: (() => void) | undefined;
const store = new PlanetStore(),
  audio = new PlanetAudio();
let preferences = {
  muted: false,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  low: false,
};
try {
  const p = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  for (const k of ['muted', 'reduced', 'low'] as const)
    if (typeof p[k] === 'boolean') preferences[k] = p[k];
} catch {
  /* Optional settings. */
}
let toastTimer = 0;
function toast(text: string) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($('toast').hidden = true), 6000);
}
function warn() {
  $('warning').hidden = !store.warning;
  $('warning').textContent = store.warning;
  $('save-status').textContent = store.warning
    ? 'SESSION PROGRESS — CHECK STORAGE NOTICE'
    : 'PROGRESS SAVED ON THIS DEVICE';
}
function save() {
  if (active && !document.hidden) {
    store.save(game);
    warn();
  }
}
function applyPreferences() {
  audio.muted = preferences.muted;
  view?.settings(preferences.low, preferences.reduced);
  $('sound').textContent = preferences.muted ? '♪̸' : '♫';
  $('sound').setAttribute('aria-label', preferences.muted ? 'Unmute sound' : 'Mute sound');
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch {
    /* Optional settings. */
  }
}
function fire(point?: Point) {
  if (!active || document.hidden) return;
  audio.unlock();
  if (game.fire(point)) {
    update();
  }
}
function update() {
  $('credits').textContent = fmt(game.state.credits);
  $('income').textContent = game.complete ? '0' : fmt(game.income);
  $('integrity').textContent = `${((1 - game.fraction) * 100).toFixed(2)}%`;
  $('integrity-bar').style.width = `${(1 - game.fraction) * 100}%`;
  $('damage-label').textContent =
    `${fmt(PLANET.integrity - game.state.damage)} / ${fmt(PLANET.integrity)} HP`;
  $('stage').textContent = STAGES[stage(game.fraction)];
  for (let i = 0; i < 4; i++) $(`step-${i}`).classList.toggle('lit', i <= stage(game.fraction));
  $('fleet-count').textContent = String(
    KEYS.reduce((n, k) => n + game.state.counts[k], 0),
  ).padStart(2, '0');
  $('dps').textContent = `${game.complete ? '0' : fmt(game.income)} DMG / SEC`;
  $<HTMLButtonElement>('fire').disabled = game.complete;
  for (const k of KEYS) {
    const unlocked = game.unlocked(k),
      maxed = game.state.upgrades[k] === 3,
      owned = game.state.counts[k];
    $(`card-${k}`).classList.toggle('locked', !unlocked);
    $(`count-${k}`).textContent = `× ${owned}`;
    $(`output-${k}`).textContent = `+${fmt(game.power(k) / WEAPONS[k].period)} cr & dmg / sec each`;
    $(`tier-${k}`).textContent = `TIER ${game.state.upgrades[k] + 1} / 4`;
    $(`cost-${k}`).textContent = `◈ ${fmt(game.cost(k))}`;
    $(`buy-label-${k}`).textContent = owned >= 100 ? 'FLEET LIMIT REACHED' : '+ BUILD STRUCTURE';
    $<HTMLButtonElement>(`buy-${k}`).disabled =
      !unlocked || game.state.credits < game.cost(k) || game.complete || owned >= 100;
    $<HTMLButtonElement>(`upgrade-${k}`).disabled =
      !owned || maxed || game.state.credits < game.upgradeCost(k) || game.complete;
    $(`upgrade-label-${k}`).textContent = maxed
      ? '✓ FULLY UPGRADED'
      : `↑ 2× DAMAGE & INCOME${owned ? ` (+${fmt(game.rate(k))}/s)` : ''}`;
    $(`upgrade-cost-${k}`).textContent = maxed ? '' : `◈ ${fmt(game.upgradeCost(k))}`;
    $(`unlock-${k}`).hidden = unlocked;
    $(`unlock-${k}`).textContent =
      `◇ UNLOCK AT ${fmt(WEAPONS[k].unlock)} TOTAL CREDITS · ${fmt(game.state.earned)} EARNED`;
  }
  if (game.complete && !endAt) {
    endAt = performance.now();
    save();
  }
  if (endAt && (view ? view.finished : performance.now() - endAt > 7200)) {
    $('complete').hidden = false;
    $('results').textContent =
      `${time(game.state.completedAt ?? game.state.elapsed)} active time · ${fmt(game.state.earned)} credits earned · ${fmt(game.state.manualShots)} manual shots`;
  }
}
function modal(html: string) {
  $('dialog-content').innerHTML = html;
  const d = $<HTMLDialogElement>('dialog');
  if (!d.open) d.showModal();
}
function reset() {
  modal(
    '<span class="eyebrow">NEW EXTRACTION</span><h2>Start with a new world?</h2><p>This replaces your Planetbreaker run. You’ll begin with a pristine Aurelia and one mining laser.</p><button id="confirm-reset" class="primary">START FRESH</button>',
  );
  $('confirm-reset').onclick = () => {
    game = new PlanetGame();
    store.invalid = false;
    store.warning = '';
    endAt = 0;
    $('complete').hidden = true;
    $<HTMLDialogElement>('dialog').close();
    view?.dispose();
    createView();
    save();
    update();
  };
}
function createView() {
  try {
    view = new PlanetView($('world'), fire);
    view.onImpact = (k) => audio.play(k);
    applyPreferences();
  } catch {
    $('world').innerHTML =
      '<div class="webgl-error">The planet needs WebGL to render.<br>Enable hardware acceleration and reload.<br>Your fleet and the Fire button still work.</div>';
  }
}
function start() {
  active = true;
  game = store.load();
  const offline = game.offline((Date.now() - game.state.savedAt) / 1000);
  if (offline > 1)
    toast(`Welcome back, Commander. +${fmt(offline)} offline credits. Aurelia waited for you.`);
  $('game').hidden = false;
  $('lock').hidden = true;
  createView();
  warn();
  update();
  save();
  last = performance.now();
}
function connect() {
  if (!navigator.locks) {
    // Without exclusive ownership, never read or write the shared save.
    store.load = () => new PlanetGame();
    store.save = () => {
      store.warning =
        'This browser cannot coordinate save ownership. This run is session-only; use a browser with Web Locks to save.';
    };
    store.save(new PlanetGame());
    start();
    return;
  }
  void navigator.locks
    .request('planetbreaker-save-owner', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        $('lock').hidden = false;
        return;
      }
      start();
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    })
    .catch(() => {
      $('lock').hidden = false;
    });
}
$('reconnect').onclick = () => {
  if (!active) connect();
};
$('fire').onclick = () => fire();
$('replay').onclick = reset;
for (const k of KEYS) {
  $(`buy-${k}`).onclick = () => {
    if (game.buy(k)) {
      audio.unlock();
      save();
      update();
      toast(`${WEAPONS[k].name} deployed.`);
    }
  };
  $(`upgrade-${k}`).onclick = () => {
    if (game.upgrade(k)) {
      save();
      update();
      toast(`${WEAPONS[k].name} upgraded. Double the output.`);
    }
  };
}
$('close-dialog').onclick = () => $<HTMLDialogElement>('dialog').close();
$('settings').onclick = () => {
  modal(
    `<span class="eyebrow">COMMAND PREFERENCES</span><h2>Settings</h2><label><input id="setting-mute" type="checkbox" ${preferences.muted ? 'checked' : ''}> Mute sound</label><label><input id="setting-reduced" type="checkbox" ${preferences.reduced ? 'checked' : ''}> Reduced motion & flashes</label><label><input id="setting-low" type="checkbox" ${preferences.low ? 'checked' : ''}> Lower effects quality</label><p>Progress saves on this device. Up to 8 hours of offline income; damage happens while you watch.</p>${active ? '<button id="reset-run" class="danger">RESET THIS RUN</button>' : ''}`,
  );
  for (const [id, key] of [
    ['mute', 'muted'],
    ['reduced', 'reduced'],
    ['low', 'low'],
  ] as const)
    $(`setting-${id}`).onchange = () => {
      preferences[key] = $<HTMLInputElement>(`setting-${id}`).checked;
      applyPreferences();
    };
  if (active) $('reset-run').onclick = reset;
};
$('sound').onclick = () => {
  audio.unlock();
  preferences.muted = !preferences.muted;
  applyPreferences();
};
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast('Fullscreen is unavailable in this browser.');
  }
}
$('fullscreen').onclick = () => void fullscreen();
document.addEventListener('keydown', (e) => {
  if (
    e.key.toLowerCase() === 'f' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !$<HTMLDialogElement>('dialog').open
  ) {
    e.preventDefault();
    void fullscreen();
  }
});
document.addEventListener('visibilitychange', () => {
  if (!active) return;
  if (document.hidden) {
    hiddenAt = Date.now();
    store.save(game);
  } else {
    if (hiddenAt) {
      const earned = game.offline((Date.now() - hiddenAt) / 1000);
      if (earned > 2) toast(`+${fmt(earned)} credits while away. Planet integrity unchanged.`);
      hiddenAt = 0;
    }
    last = performance.now();
    save();
    update();
  }
});
window.addEventListener('pagehide', () => {
  if (active && !hiddenAt) store.save(game);
  active = false;
  releaseLock?.();
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});
setInterval(save, 5000);
setInterval(() => {
  if (!active || document.hidden) return;
  const now = performance.now(),
    delta = (now - last) / 1000;
  last = now;
  if (delta > 5) game.offline(delta);
  else game.tick(delta);
  update();
}, 100);
let frame = performance.now();
function draw(now: number) {
  const dt = Math.min(0.1, (now - frame) / 1000);
  frame = now;
  if (active && !document.hidden) view?.render(dt, game);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
applyPreferences();
connect();
