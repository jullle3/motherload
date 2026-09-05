import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import './style.css';
import {
  NeonGame,
  freshSave,
  loadSave,
  recordClear,
  type Mode,
  type Phase,
  type InputAction,
} from './game';
import { STAGES } from './stages';
import { NeonView, THEMES } from './render';
import { NeonAudio } from './audio';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SAVE_KEY = 'neon-split.save.v1',
  SETTINGS_KEY = 'neon-split.settings.v1';
let progress = freshSave(),
  storageMessage = '',
  selectedMode: Mode = 'solo';
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) progress = loadSave(JSON.parse(raw));
} catch {
  storageMessage = 'Saved progress could not be loaded. You can still play.';
}
document.querySelector('#app')!.innerHTML = `
<header><a class="logo" href="/games/neon-split/">NEON<span>SPLIT</span><i>✳</i></a><a class="home" href="/">← ALL GAMES</a><span class="header-tag">DODGE. SPLIT. REPEAT.</span><button id="mute" aria-pressed="false">SOUND ON</button><button id="fullscreen" aria-pressed="false" aria-keyshortcuts="f">⛶ FULLSCREEN</button><button id="pause">Ⅱ PAUSE</button></header>
<main><div class="stage-heading"><div><span class="eyebrow" id="district">ION DISTRICT / STAGE 1</span><h1 id="stage-name">First contact</h1></div><div class="stats"><div><span>SHARED LIVES</span><strong id="lives">♥ ♥ ♥</strong></div><div><span>STAGE SCORE</span><strong id="score">0</strong></div><div><span>TIME / NO LIMIT</span><strong id="time">0:00</strong></div></div></div>
<section class="arena" aria-label="Neon Split game arena"><canvas id="game" width="960" height="540" aria-label="Use A and D to move and Space to fire. Player two uses arrow keys and Enter."></canvas><div id="overlay"><div id="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"></div></div></section>
<div class="below-arena"><div id="powers" aria-label="Active power-ups"></div><span id="status" role="status"></span></div>
<footer><div><span class="player-key">P1</span><kbd>A</kbd><kbd>D</kbd><span>MOVE</span><kbd>SPACE</kbd><span>FIRE</span><span class="player-key pink">P2</span><kbd>←</kbd><kbd>→</kbd><span>MOVE</span><kbd>ENTER</kbd><span>FIRE</span></div><div><kbd>F</kbd><span>FULLSCREEN</span><kbd>ESC</kbd><span>PAUSE</span></div></footer>
<p class="desktop-note">Made for a keyboard. Bring a friend for local co-op.</p></main>`;
let game = new NeonGame(),
  active = false,
  menu: 'title' | 'stages' | 'pause' | 'result' | null = 'title';
const view = new NeonView($<HTMLCanvasElement>('game')),
  audio = new NeonAudio();
view.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
try {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  if (typeof settings.muted === 'boolean') audio.muted = settings.muted;
  if (typeof settings.low === 'boolean') view.low = settings.low;
  if (typeof settings.reduced === 'boolean') view.reduced = settings.reduced;
} catch {
  /* Optional preferences. */
}
view.resize();
void document.fonts.ready.then(() => view.resize());
const held = new Set<string>();
let last = performance.now(),
  accumulator = 0,
  fullscreenPending = false;
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ muted: audio.muted, low: view.low, reduced: view.reduced }),
    );
  } catch {
    /* Preferences are optional. */
  }
}
function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
    storageMessage = '';
  } catch {
    storageMessage = 'Saving unavailable — unlocks last for this session.';
  }
}
function setDialog(html: string, next: typeof menu) {
  menu = next;
  held.clear();
  accumulator = 0;
  $('overlay').hidden = false;
  $('dialog').innerHTML = html;
  $<HTMLCanvasElement>('game').setAttribute('aria-hidden', 'true');
  $('dialog').focus();
}
function closeDialog() {
  menu = null;
  $('overlay').hidden = true;
  $('game').removeAttribute('aria-hidden');
  held.clear();
  accumulator = 0;
  last = performance.now();
}
function launch(index: number) {
  game = new NeonGame(index, selectedMode);
  active = true;
  view.clear();
  audio.start();
  closeDialog();
  updateHUD();
}
function title() {
  active = false;
  setDialog(
    `<p class="eyebrow">THE BUBBLES ARE BACK.</p><h2 id="dialog-title" class="title">DODGE.<br><em>SPLIT.</em> REPEAT.</h2><p class="dialog-copy">Small bubbles. Big trouble. Clear the arena with your harpoon.<br>Go solo, or share the chaos with a friend.</p><div class="mode-buttons"><button class="primary" id="solo">SOLO PLAY <span>↗</span></button><button class="secondary" id="coop">LOCAL CO-OP <span>＋</span></button></div><div class="title-facts"><span>15 STAGES</span><span>2 PLAYERS</span><span>UNLIMITED RETRIES</span></div><p class="fine">Hold fire to keep shooting. No jumping. No time limit.</p>`,
    'title',
  );
  $('solo').onclick = () => {
    selectedMode = 'solo';
    stageSelect();
  };
  $('coop').onclick = () => {
    selectedMode = 'coop';
    stageSelect();
  };
}
function stageSelect() {
  active = false;
  const unlocked = progress[selectedMode].unlocked;
  setDialog(
    `<p class="eyebrow">${selectedMode === 'solo' ? 'SOLO EXPEDITION' : 'TWO PLAYERS / ONE KEYBOARD'}</p><h2 id="dialog-title">Pick your next challenge.</h2><p class="dialog-copy">${selectedMode === 'solo' ? 'A / D or ← / → to move · Space or Enter to fire.' : 'P1: A / D + Space · P2: ← / → + Enter. Three shared lives per stage.'}</p><div class="stage-grid">${STAGES.map((s, i) => `<button data-stage="${i}" ${i >= unlocked ? 'disabled' : ''} title="${s.name}${i >= unlocked ? ' — clear the previous stage to unlock' : ''}"><b>${i >= unlocked ? '◇' : i + 1}</b><span>${s.name}</span><small>${progress[selectedMode].best[i] ? `${progress[selectedMode].best[i].score.toLocaleString()} pts · ${time(progress[selectedMode].best[i].time)}` : i >= unlocked ? 'LOCKED' : 'READY TO PLAY'}</small></button>`).join('')}</div><div class="dialog-actions"><button class="primary" id="continue">${unlocked === 1 ? 'START STAGE 1' : `PLAY STAGE ${unlocked}`} ↗</button><button class="secondary" id="back">← CHANGE MODE</button></div>`,
    'stages',
  );
  $('continue').onclick = () => launch(unlocked - 1);
  $('back').onclick = title;
  document
    .querySelectorAll<HTMLButtonElement>('[data-stage]')
    .forEach((b) => (b.onclick = () => launch(Number(b.dataset.stage))));
}
function pause() {
  if (!active || (game.phase !== 'playing' && game.phase !== 'ready')) return;
  game.pause();
  setDialog(
    `<p class="eyebrow">TAKE A BREATHER</p><h2 id="dialog-title">The chaos can wait.</h2><p class="dialog-copy">Resume when you’re ready. Your stage is frozen.</p><div class="pause-settings"><label><input id="low" type="checkbox" ${view.low ? 'checked' : ''}> Lower visual effects</label><label><input id="reduced" type="checkbox" ${view.reduced ? 'checked' : ''}> Reduced motion</label></div><div class="dialog-actions"><button class="primary" id="resume">RESUME ↗</button><button class="secondary" id="retry">RETRY STAGE</button><button class="secondary" id="select">STAGE SELECT</button></div>`,
    'pause',
  );
  $('resume').onclick = resume;
  $('retry').onclick = () => {
    game.retry();
    view.clear();
    closeDialog();
  };
  $('select').onclick = stageSelect;
  $<HTMLInputElement>('low').onchange = (e) => {
    view.low = (e.target as HTMLInputElement).checked;
    view.resize();
    saveSettings();
  };
  $<HTMLInputElement>('reduced').onchange = (e) => {
    view.reduced = (e.target as HTMLInputElement).checked;
    if (view.reduced) view.clear();
    saveSettings();
  };
}
function resume() {
  if (document.hidden) return;
  audio.start();
  game.resume();
  closeDialog();
}
function result() {
  const cleared = game.phase === 'cleared',
    final = game.stageIndex === STAGES.length - 1;
  if (cleared) {
    recordClear(progress, game);
    saveProgress();
  }
  setDialog(
    `<p class="eyebrow">${cleared ? (final ? 'ALL 15 STAGES COMPLETE' : 'SIGNAL CLEARED') : 'OUT OF LIVES. NOT OUT OF CHANCES.'}</p><h2 id="dialog-title">${cleared ? (final ? 'You split the difference.' : 'Beautifully burst.') : 'One more try?'}</h2><p class="dialog-copy">${cleared ? `${game.stage.name} cleared in ${time(game.elapsed)}.` : 'Three fresh lives. Same arena. You’ve got this.'}</p>${cleared ? `<div class="results"><div><span>STAGE SCORE</span><strong>${game.score.toLocaleString()}</strong></div><div><span>SPEED BONUS</span><strong>+${game.bonus.toLocaleString()}</strong></div></div>` : ''}<div class="dialog-actions">${cleared && !final ? '<button class="primary" id="next">NEXT STAGE ↗</button>' : ''}<button class="${cleared && !final ? 'secondary' : 'primary'}" id="retry">${cleared ? 'REPLAY STAGE' : 'RETRY STAGE'} ↻</button><button class="secondary" id="select">STAGE SELECT</button></div>`,
    'result',
  );
  if (cleared && !final) $('next').onclick = () => launch(game.stageIndex + 1);
  $('retry').onclick = () => {
    game.retry();
    view.clear();
    closeDialog();
  };
  $('select').onclick = stageSelect;
}
function updateHUD() {
  $('district').textContent =
    `${THEMES[game.stage.theme].name} / STAGE ${game.stageIndex + 1} / ${game.mode === 'solo' ? 'SOLO' : 'CO-OP'}`;
  $('stage-name').textContent = game.stage.name;
  $('lives').textContent = '♥ '.repeat(game.lives).trim() || '—';
  $('lives').setAttribute('aria-label', `${game.lives} shared lives`);
  $('score').textContent = game.score.toLocaleString();
  $('time').textContent = time(game.elapsed);
  $('powers').textContent =
    game.players
      .map(
        (p) =>
          `P${p.id + 1} ${p.shield ? '◇ SHIELD' : ''}${p.double > 0 ? ` Ⅱ DOUBLE ${Math.ceil(p.double)}s` : ''}`,
      )
      .join('     ') + (game.slow > 0 ? `     ◷ SLOW ${Math.ceil(game.slow)}s` : '');
  $('status').textContent =
    storageMessage ||
    (menu
      ? 'PROGRESS SAVES ON THIS DEVICE'
      : game.phase === 'ready'
        ? 'GET READY'
        : 'HOLD FIRE · KEEP MOVING');
  $<HTMLButtonElement>('pause').disabled = !active || menu !== null;
  document.documentElement.style.setProperty('--accent', THEMES[game.stage.theme].accent);
}
function syncFullscreen() {
  const button = $<HTMLButtonElement>('fullscreen');
  button.disabled = !document.fullscreenEnabled || fullscreenPending;
  button.textContent = document.fullscreenElement ? '⛶ EXIT FULLSCREEN' : '⛶ FULLSCREEN';
  button.setAttribute('aria-pressed', String(!!document.fullscreenElement));
  button.title = document.fullscreenEnabled
    ? 'Toggle fullscreen (F)'
    : 'Fullscreen unavailable in this browser';
}
$('fullscreen').onclick = async () => {
  fullscreenPending = true;
  held.clear();
  syncFullscreen();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    storageMessage = 'Fullscreen could not start. Try a separate browser tab.';
  } finally {
    fullscreenPending = false;
    syncFullscreen();
  }
};
document.addEventListener('fullscreenchange', () => {
  held.clear();
  syncFullscreen();
  view.resize();
});
$('mute').onclick = () => {
  audio.muted = !audio.muted;
  audio.start();
  syncMute();
  saveSettings();
};
function syncMute() {
  $('mute').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
  $('mute').setAttribute('aria-pressed', String(audio.muted));
}
$('pause').onclick = pause;
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Tab' && menu) {
    const nodes = [...$('dialog').querySelectorAll<HTMLElement>('button:not(:disabled), input')];
    const first = nodes[0],
      end = nodes.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first || document.activeElement === $('dialog'))
    ) {
      e.preventDefault();
      end?.focus();
    } else if (!e.shiftKey && document.activeElement === end) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if (e.code === 'KeyF' && !e.repeat) {
    e.preventDefault();
    $<HTMLButtonElement>('fullscreen').click();
    return;
  }
  if (e.code === 'Escape' && !e.repeat) {
    e.preventDefault();
    if (menu === 'pause') resume();
    else if (!menu) pause();
    else if (menu === 'stages') title();
    return;
  }
  if (menu) return;
  if (['KeyA', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) {
    e.preventDefault();
    held.add(e.code);
  }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => {
  held.clear();
  pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    held.clear();
    pause();
  }
});
window.addEventListener('pagehide', () => held.clear());
window.addEventListener('resize', () => view.resize());
function inputs(): InputAction[] {
  const key = (k: string) => Number(held.has(k));
  if (game.mode === 'solo')
    return [
      {
        move:
          Number(held.has('KeyD') || held.has('ArrowRight')) -
          Number(held.has('KeyA') || held.has('ArrowLeft')),
        fire: held.has('Space') || held.has('Enter'),
      },
    ];
  return [
    { move: key('KeyD') - key('KeyA'), fire: held.has('Space') },
    { move: key('ArrowRight') - key('ArrowLeft'), fire: held.has('Enter') },
  ];
}
function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (active && !menu) {
    accumulator += dt;
    while (accumulator >= 1 / 60 && !menu) {
      const before: Phase = game.phase;
      game.step(1 / 60, inputs());
      accumulator -= 1 / 60;
      for (const event of game.events.splice(0)) {
        view.event(event);
        audio.play(event);
      }
      if (before !== game.phase && (game.phase === 'over' || game.phase === 'cleared')) result();
    }
  }
  view.draw(game, menu ? 0 : dt);
  updateHUD();
  requestAnimationFrame(frame);
}
syncMute();
syncFullscreen();
title();
updateHUD();
requestAnimationFrame(frame);
